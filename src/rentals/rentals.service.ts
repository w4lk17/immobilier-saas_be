import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRentalDto } from './dto/create-rental.dto';
import { UpdateRentalDto } from './dto/update-rental.dto';
import { ContractStatus, Rental, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';

@Injectable()
export class RentalsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createRentalDto: CreateRentalDto,
    user: JwtPayload,
  ): Promise<Rental> {
    // 1. Valider l'existence de la Propriété
    const property = await this.prisma.property.findUnique({
      where: { id: createRentalDto.propertyId },
    });
    if (!property) {
      throw new NotFoundException(
        `Propriété avec l'ID "${createRentalDto.propertyId}" introuvable.`,
      );
    }

    // 2. RBAC Check : Seuls ADMIN et MANAGER peuvent créer
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Seuls les administrateurs et gestionnaires peuvent créer des unités locatives.',
      );
    }

    // 3. Si MANAGER : Vérifier qu'il est assigné à cette propriété
    if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      // Si pas de profil ou pas le manager de cette propriété
      if (!managerProfile || property.managerId !== managerProfile.id) {
        throw new ForbiddenException(
          `Vous n'êtes pas autorisé à gérer cette propriété.`,
        );
      }
    }

    try {
      return await this.prisma.rental.create({
        data: createRentalDto,
        include: { property: true }, // Inclure propriété pour confirmation
      });
    } catch (error) {
      console.error('Error creating rental:', error);
      throw new InternalServerErrorException(
        "Impossible de créer l'unité locative.",
      );
    }
  }

  async findAll(user: JwtPayload): Promise<Rental[]> {
    // Construction dynamique de la clause WHERE
    const whereClause: any = {};

    if (user.role === UserRole.OWNER) {
      // OWNER : Voit les rentals de ses propriétés
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (!ownerProfile) return [];
      whereClause.property = { ownerId: ownerProfile.id };
    } else if (user.role === UserRole.MANAGER) {
      // MANAGER : Voit les rentals des propriétés qu'il gère
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      if (!managerProfile) return [];
      whereClause.property = { managerId: managerProfile.id };
    } else if (user.role === UserRole.TENANT) {
      // TENANT : Voit les rentals liés à ses contrats
      whereClause.contracts = {
        some: {
          tenant: {
            userId: user.sub,
          },
        },
      };
    }
    // ADMIN : whereClause reste vide {} -> voit tout

    return this.prisma.rental.findMany({
      where: whereClause,
      include: this.getRentalIncludeRelations(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, user: JwtPayload): Promise<Rental> {
    const rental = await this.prisma.rental.findUnique({
      where: { id },
      include: this.getRentalIncludeRelations(),
    });

    if (!rental) {
      throw new NotFoundException(`Unité locative #${id} introuvable.`);
    }

    // Vérification des permissions d'accès en lecture
    await this.checkAccessPermission(rental, user);

    return rental;
  }

  async update(
    id: number,
    updateRentalDto: UpdateRentalDto,
    user: JwtPayload,
  ): Promise<Rental> {
    const rental = await this.prisma.rental.findUnique({
      where: { id },
      include: { property: true }, // Nécessaire pour vérifier le manager
    });

    if (!rental) {
      throw new NotFoundException(`Unité locative #${id} introuvable.`);
    }

    // 1. RBAC Check : Seuls ADMIN et MANAGER peuvent modifier
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Action non autorisée.');
    }

    // 2. Si MANAGER : Vérifier les droits sur la propriété
    if (user.role === UserRole.MANAGER) {
      await this.verifyManagerPermission(rental.property, user);
    }

    try {
      return await this.prisma.rental.update({
        where: { id },
        data: updateRentalDto,
        include: this.getRentalIncludeRelations(),
      });
    } catch (error) {
      console.error('Error updating rental:', error);
      throw new InternalServerErrorException(
        "Impossible de mettre à jour l'unité locative.",
      );
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Rental> {
    // 1. RBAC Check : SEUL ADMIN peut supprimer
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Seul un administrateur peut supprimer une unité locative.',
      );
    }

    const rental = await this.prisma.rental.findUnique({
      where: { id },
      include: { contracts: true },
    });

    if (!rental) {
      throw new NotFoundException(`Unité locative #${id} introuvable.`);
    }

    // 2. Vérifier l'intégrité (Pas de contrats actifs)
    const activeContractsCount = rental.contracts.filter(
      (c) =>
        c.status === ContractStatus.ACTIVE ||
        c.status === ContractStatus.PENDING,
    ).length;

    if (activeContractsCount > 0) {
      throw new BadRequestException(
        'Impossible de supprimer : des contrats actifs ou en attente existent.',
      );
    }

    try {
      return await this.prisma.rental.delete({ where: { id } });
    } catch (error) {
      console.error('Error deleting rental:', error);
      throw new InternalServerErrorException(
        "Impossible de supprimer l'unité locative.",
      );
    }
  }

  // ==========================================
  // HELPERS PRIVÉS
  // ==========================================

  // Standardise les relations retournées pour le frontend
  private getRentalIncludeRelations() {
    return {
      property: {
        // On utilise SELECT pour tout définir (champs + relations)
        select: {
          id: true,
          address: true,
          // On met les relations DANS le select
          owner: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          manager: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      contracts: {
        where: { status: ContractStatus.ACTIVE },
        include: {
          tenant: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      _count: {
        select: { contracts: true, expenses: true },
      },
    };
  }

  // Vérifie si l'utilisateur a le droit de VOIR ce rental
  private async checkAccessPermission(
    rental: any,
    user: JwtPayload,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;

    // Check Employee
    if (user.role === UserRole.MANAGER) {
      const emp = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      if (rental.property.managerId === emp?.id) return;
    }

    // Check Owner
    if (user.role === UserRole.OWNER) {
      const own = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (rental.property.ownerId === own?.id) return;
    }

    // Check Tenant
    if (user.role === UserRole.TENANT) {
      const hasContract = rental.contracts.some(
        (c: any) =>
          c.tenant?.user?.id === user.sub || c.tenant?.userId === user.sub,
      );
      if (hasContract) return;
    }

    throw new ForbiddenException(
      "Vous n'avez pas accès à cette unité locative.",
    );
  }

  // Vérifie si l'employé gère la propriété donnée
  private async verifyManagerPermission(
    property: any,
    user: JwtPayload,
  ): Promise<void> {
    const managerProfile = await this.prisma.manager.findUnique({
      where: { userId: user.sub },
    });
    if (!managerProfile || property.managerId !== managerProfile.id) {
      throw new ForbiddenException('Vous ne gérez pas cette propriété.');
    }
  }
}
