import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { ContractStatus, Property, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createPropertyDto: CreatePropertyDto,
    user: JwtPayload,
  ): Promise<Property> {
    // 1. RBAC Check : Seul ADMIN et MANAGER (Manager) peuvent créer
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Seuls les administrateurs et gestionnaires peuvent créer des propriétés.',
      );
    }

    // 2. Valider l'existence du Owner
    const owner = await this.prisma.owner.findUnique({
      where: { id: createPropertyDto.ownerId },
      include: { user: true }, // Inclure user pour vérifier si le compte est actif
    });
    if (!owner) {
      throw new NotFoundException(
        `Propriétaire avec l'ID "${createPropertyDto.ownerId}" introuvable.`,
      );
    }

    // 3. Valider le Manager (si fourni)
    if (createPropertyDto.managerId) {
      const manager = await this.prisma.manager.findUnique({
        where: { id: createPropertyDto.managerId },
      });
      if (!manager) {
        throw new NotFoundException(
          `Gestionnaire avec l'ID "${createPropertyDto.managerId}" introuvable.`,
        );
      }
    }
    // Logique Optionnelle : Si un Employee crée un bien, s'assigne-t-il automatiquement ?
    // Si managerId n'est pas fourni et que c'est un MANAGER qui crée :
    else if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      if (managerProfile) createPropertyDto.managerId = managerProfile.id;
    }

    try {
      return await this.prisma.property.create({
        data: createPropertyDto,
        include: {
          owner: { include: { user: true } },
          manager: { include: { user: true } },
          _count: { select: { rentals: true, expenses: true } },
        },
      });
    } catch (error) {
      console.error('Error creating property:', error);
      throw new InternalServerErrorException(
        'Impossible de créer la propriété.',
      );
    }
  }

  async findAll(user: JwtPayload): Promise<Property[]> {
    // 1. ADMIN : Voit tout
    if (user.role === UserRole.ADMIN) {
      return this.prisma.property.findMany({
        include: this.getPropertyIncludeRelations(),
        orderBy: { createdAt: 'desc' },
      });
    }

    // 2. MANAGER (Manager) : Voit uniquement les biens qu'il gère
    if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      if (!managerProfile) return []; // Ne devrait pas arriver si le profil est créé

      return this.prisma.property.findMany({
        where: { managerId: managerProfile.id },
        include: this.getPropertyIncludeRelations(),
      });
    }

    // 3. OWNER : Voit uniquement ses propres biens
    if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (!ownerProfile) return [];

      return this.prisma.property.findMany({
        where: { ownerId: ownerProfile.id },
        include: this.getPropertyIncludeRelations(),
      });
    }

    // 4. Autres (Tenant, User simple) : Accès refusé ou liste vide
    return [];
  }

  async findOne(id: number, user: JwtPayload): Promise<Property> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: { include: { user: true } },
        manager: { include: { user: true } },
        rentals: {
          include: {
            contracts: {
              include: { tenant: { include: { user: true } } },
            },
          },
        },
        expenses: { orderBy: { date: 'desc' }, take: 10 },
        _count: { select: { rentals: true, expenses: true } },
      },
    });

    if (!property) {
      throw new NotFoundException(`Propriété #${id} introuvable.`);
    }

    // Vérification des permissions d'accès
    await this.checkAccessPermission(property, user);

    return property;
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    user: JwtPayload,
  ): Promise<Property> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { manager: true },
    });

    if (!property) {
      throw new NotFoundException(`Propriété avec l'ID "${id}" introuvable.`);
    }

    // 1. RBAC Check : ADMIN ou MANAGER assigné uniquement
    await this.checkManagementPermission(property, user, 'modifier');

    // 2. Validation changement Owner (Réservé ADMIN)
    if (
      updatePropertyDto.ownerId &&
      updatePropertyDto.ownerId !== property.ownerId
    ) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'Seul un administrateur peut changer le propriétaire.',
        );
      }
      const ownerExists = await this.prisma.owner.findUnique({
        where: { id: updatePropertyDto.ownerId },
      });
      if (!ownerExists)
        throw new NotFoundException('Nouveau propriétaire introuvable.');
    }

    // 3. Validation changement Manager (Réservé ADMIN)
    if (
      updatePropertyDto.managerId &&
      updatePropertyDto.managerId !== property.managerId
    ) {
      // Un manager peut s'assigner un bien ? Ou seul l'admin peut changer le manager ?
      // Pour la sécurité, souvent seul l'Admin change le manager.
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'Seul un administrateur peut changer le gestionnaire.',
        );
      }
      const managerExists = await this.prisma.manager.findUnique({
        where: { id: updatePropertyDto.managerId },
      });
      if (!managerExists)
        throw new NotFoundException('Nouveau gestionnaire introuvable.');
    }

    try {
      return await this.prisma.property.update({
        where: { id },
        data: updatePropertyDto,
        include: {
          owner: { include: { user: true } },
          manager: { include: { user: true } },
        },
      });
    } catch (error) {
      console.error('Error updating property:', error);
      throw new InternalServerErrorException(
        'Impossible de mettre à jour la propriété.',
      );
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Property> {
    // 1. RBAC Check : SEUL ADMIN peut supprimer
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Seul un administrateur peut supprimer une propriété.',
      );
    }

    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        rentals: {
          include: {
            contracts: {
              where: {
                status: { in: [ContractStatus.PENDING, ContractStatus.ACTIVE] },
              },
            },
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Propriété #${id} introuvable.`);
    }

    // Vérification intégrité données (Contrats actifs)
    const hasActiveContracts = property.rentals.some(
      (r) => r.contracts.length > 0,
    );
    if (hasActiveContracts) {
      throw new BadRequestException(
        'Impossible de supprimer : des contrats actifs existent sur cette propriété.',
      );
    }

    try {
      return await this.prisma.property.delete({ where: { id } });
    } catch (error) {
      throw new InternalServerErrorException('Erreur lors de la suppression.');
    }
  }

  // ==========================================
  // HELPERS PRIVÉS
  // ==========================================

  private getPropertyIncludeRelations() {
    return {
      owner: { include: { user: true } },
      manager: { include: { user: true } },
      rentals: {
        include: {
          contracts: {
            include: {
              tenant: {
                include: {
                  user: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      },
      _count: { select: { rentals: true, expenses: true } },
    };
  }

  /**
   * Vérifie si l'utilisateur a le droit de VOIR la propriété.
   */
  private async checkAccessPermission(
    property: Property,
    user: JwtPayload,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.MANAGER) {
      const manager = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      if (property.managerId === manager?.id) return;
    }

    if (user.role === UserRole.OWNER) {
      const owner = await this.prisma.owner.findUnique({
        where: { userId: user.sub },
      });
      if (property.ownerId === owner?.id) return;
    }

    throw new ForbiddenException("Vous n'avez pas accès à cette propriété.");
  }

  /**
   * Vérifie si l'utilisateur a le droit de MODIFIER la propriété.
   */
  private async checkManagementPermission(
    property: Property,
    user: JwtPayload,
    action: string,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.MANAGER) {
      const manager = await this.prisma.manager.findUnique({
        where: { userId: user.sub },
      });
      // Seul le manager assigné peut modifier
      if (property.managerId === manager?.id) return;
    }

    // Un OWNER ne peut pas modifier
    // Un Manager non assigné ne peut pas modifier

    throw new ForbiddenException(
      `Vous n'êtes pas autorisé à ${action} cette propriété.`,
    );
  }
}
