import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/types';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createExpenseDto: CreateExpenseDto,
    user: RequestUser,
  ): Promise<Expense> {
    // 1. RBAC Check : Seuls ADMIN et MANAGER peuvent créer
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Seuls les administrateurs et gestionnaires peuvent enregistrer des dépenses.',
      );
    }

    // 2. Valider la Propriété et les Permissions
    const { property } = await this.checkPropertyPermission(
      createExpenseDto.propertyId,
      user,
      true, // requireManagement = true (seuls admin/manager assigné peuvent créer)
    );

    // 3. Valider le Rental (si fourni)
    if (createExpenseDto.rentalId) {
      const rental = await this.prisma.rental.findUnique({
        where: { id: createExpenseDto.rentalId },
      });

      if (!rental) {
        throw new NotFoundException(
          `Unité locative avec l'ID "${createExpenseDto.rentalId}" introuvable.`,
        );
      }

      // Vérifier que le rental appartient bien à la propriété mentionnée
      if (rental.propertyId !== createExpenseDto.propertyId) {
        throw new BadRequestException(
          `L'unité locative ${createExpenseDto.rentalId} n'appartient pas à la propriété ${createExpenseDto.propertyId}.`,
        );
      }
    }

    try {
      return await this.prisma.expense.create({
        data: {
          ...createExpenseDto,
          recordedById: user.id, // L'utilisateur connecté enregistre la dépense
          organizationId: user.organizationId,
        },
        include: this.expenseIncludeRelations(),
      });
    } catch (error) {
      console.error('Error creating expense:', error);
      throw new InternalServerErrorException('Impossible de créer la dépense.');
    }
  }

  async findAll(user: RequestUser): Promise<Expense[]> {
    const whereClause: any = { organizationId: user.organizationId };

    // Filtrage par rôle
    if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.id },
      });
      if (!ownerProfile) return [];
      whereClause.property = { ownerId: ownerProfile.id };
    } else if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.id },
      });
      if (!managerProfile) return [];
      whereClause.property = { managerId: managerProfile.id };
    }
    // ADMIN voit tout (whereClause vide)

    return this.prisma.expense.findMany({
      where: whereClause,
      include: this.expenseIncludeRelations(),
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: number, user: RequestUser): Promise<Expense> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: this.expenseIncludeRelations(),
    });

    if (!expense || expense.organizationId !== user.organizationId) {
      throw new NotFoundException(`Dépense avec l'ID "${id}" introuvable.`);
    }

    if (expense.propertyId === null) {
      throw new BadRequestException("Cette dépense n'est liée à aucune propriété.");
    }

    // Vérifier les droits de lecture (Admin, Manager assigné, ou Propriétaire du bien)
    await this.checkPropertyPermission(expense.propertyId, user, false);

    return expense;
  }

  async update(
    id: number,
    updateExpenseDto: UpdateExpenseDto,
    user: RequestUser,
  ): Promise<Expense> {
    // 1. Vérifier existence et droits d'écriture
    const existingExpense = await this.prisma.expense.findUnique({
      where: { id },
    });
    if (!existingExpense || existingExpense.organizationId !== user.organizationId) {
      throw new NotFoundException(`Dépense avec l'ID "${id}" introuvable.`);
    }

    if (existingExpense.propertyId === null) {
      throw new BadRequestException("Cette dépense n'est liée à aucune propriété.");
    }

    // Droits d'écriture = Admin ou Manager assigné
    await this.checkPropertyPermission(
      existingExpense.propertyId,
      user,
      true, // requireManagement
    );

    // 2. Valider changement de Rental si applicable
    if (updateExpenseDto.rentalId !== undefined) {
      // Si on veut lier à un rental
      if (updateExpenseDto.rentalId !== null) {
        const rental = await this.prisma.rental.findUnique({
          where: { id: updateExpenseDto.rentalId },
        });
        if (!rental) throw new NotFoundException('Rental non trouvé');
        if (rental.propertyId !== existingExpense.propertyId) {
          throw new BadRequestException(
            "Le rental n'appartient pas à cette propriété.",
          );
        }
      }
    }

    // Note: On ne permet généralement pas de changer le propertyId d'une dépense existante via update simple
    // pour des raisons d'intégrité, mais si ton DTO le permet, il faudrait valider les droits sur la NOUVELLE propriété aussi.
    // Ici, on suppose qu'on ne déplace pas une dépense vers une autre propriété.

    try {
      return await this.prisma.expense.update({
        where: { id },
        data: updateExpenseDto,
        include: this.expenseIncludeRelations(),
      });
    } catch (error) {
      console.error('Error updating expense:', error);
      throw new InternalServerErrorException(
        'Impossible de mettre à jour la dépense.',
      );
    }
  }

  async remove(id: number, user: RequestUser): Promise<Expense> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
    });
    if (!expense || expense.organizationId !== user.organizationId) {
      throw new NotFoundException(`Dépense avec l'ID "${id}" introuvable.`);
    }

    if (expense.propertyId === null) {
      throw new BadRequestException("Cette dépense n'est liée à aucune propriété.");
    }

    // Seuls Admin et Employee peuvent supprimer (requireManagement = true)
    await this.checkPropertyPermission(expense.propertyId, user, true);

    try {
      return await this.prisma.expense.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw new InternalServerErrorException(
        'Impossible de supprimer la dépense.',
      );
    }
  }

  // --- METHODES SPECIFIQUES ---

  async findAllByProperty(
    propertyId: number,
    user: RequestUser,
  ): Promise<Expense[]> {
    // Vérifie les droits de lecture sur la propriété
    await this.checkPropertyPermission(propertyId, user, false);

    return this.prisma.expense.findMany({
      where: { propertyId, organizationId: user.organizationId },
      include: this.expenseIncludeRelations(),
      orderBy: { date: 'desc' },
    });
  }

  async findAllByRental(
    rentalId: number,
    user: RequestUser,
  ): Promise<Expense[]> {
    const rental = await this.prisma.rental.findUnique({
      where: { id: rentalId },
      include: { property: true }, // Inclure property pour vérifier les droits
    });

    if (!rental || rental.property.organizationId !== user.organizationId) {
      throw new NotFoundException(
        `Unité locative avec l'ID "${rentalId}" introuvable.`,
      );
    }

    // Vérifie les droits de lecture sur la propriété parente
    await this.checkPropertyPermission(rental.propertyId, user, false);

    return this.prisma.expense.findMany({
      where: { rentalId, organizationId: user.organizationId },
      include: this.expenseIncludeRelations(),
      orderBy: { date: 'desc' },
    });
  }

  // ==========================================
  // HELPERS PRIVES
  // ==========================================

  // Standardise les relations retournées
  private expenseIncludeRelations() {
    return {
      property: {
        select: {
          id: true,
          address: true,
          owner: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          manager: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
      rental: {
        select: { id: true, name: true, type: true },
      },
      recordedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    };
  }

  /**
   * Vérifie les permissions sur une propriété.
   * @param propertyId ID de la propriété
   * @param user Utilisateur connecté
   * @param requireManagement Si true, exige le rôle Admin ou Manager assigné (pour Create/Update/Delete).
   *                          Si false, autorise aussi le Owner (pour Read).
   */
  private async checkPropertyPermission(
    propertyId: number,
    user: RequestUser,
    requireManagement: boolean,
  ): Promise<{ property: any }> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException(
        `Propriété avec l'ID "${propertyId}" introuvable.`,
      );
    }

    if (user.role === UserRole.ADMIN) {
      return { property };
    }

    // Si on exige des droits de gestion (Write)
    if (requireManagement) {
      if (user.role === UserRole.MANAGER) {
        const managerProfile = await this.prisma.manager.findUnique({
          where: { userId: user.id },
        });
        if (managerProfile && property.managerId === managerProfile.id) {
          return { property };
        }
      }
      // Si Owner ou Employee non assigné -> Interdit
      throw new ForbiddenException(
        "Vous n'avez pas les droits pour effectuer cette action sur cette propriété.",
      );
    }

    // Si on exige juste des droits de lecture (Read)
    if (!requireManagement) {
      if (user.role === UserRole.MANAGER) {
        const managerProfile = await this.prisma.manager.findUnique({
          where: { userId: user.id },
        });
        if (managerProfile && property.managerId === managerProfile.id) {
          return { property };
        }
      } else if (user.role === UserRole.OWNER) {
        const ownerProfile = await this.prisma.owner.findUnique({
          where: { userId: user.id },
        });
        if (ownerProfile && property.ownerId === ownerProfile.id) {
          return { property };
        }
      }
    }

    throw new ForbiddenException('Accès non autorisé à cette propriété.');
  }
}
