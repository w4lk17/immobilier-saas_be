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
import { RequestUser } from '../auth/types';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(adminId: number, createPropertyDto: CreatePropertyDto) {
    // 1. Récupérer l'org
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { organization: true, ownerProfile: true },
    });
    if (!admin?.organization) throw new ForbiddenException('Organisation introuvable');

    // Si l'owner n'est pas passé dans le DTO, on suppose que c'est l'admin créateur
    const ownerId = createPropertyDto.ownerId || admin.ownerProfile?.id;
    if (!ownerId) throw new NotFoundException('Profil propriétaire introuvable');

    await this.ensureOwnerInOrganization(ownerId, admin.organizationId);
    if (createPropertyDto.managerId) {
      await this.ensureManagerInOrganization(
        createPropertyDto.managerId,
        admin.organizationId,
      );
    }

    return this.prisma.property.create({
      data: {
        ...createPropertyDto,
        organizationId: admin.organizationId, // <--- CORRECTION ICI
        ownerId: ownerId,
      },
    });
  }

  async findAll(user: RequestUser): Promise<Property[]> {
    // 1. ADMIN : Voit tout
    if (user.role === UserRole.ADMIN) {
      return this.prisma.property.findMany({
        where: { organizationId: user.organizationId },
        include: this.getPropertyIncludeRelations(),
        orderBy: { createdAt: 'desc' },
      });
    }

    // 2. MANAGER (Manager) : Voit uniquement les biens qu'il gère
    if (user.role === UserRole.MANAGER) {
      const managerProfile = await this.prisma.manager.findUnique({
        where: { userId: user.id },
      });
      if (!managerProfile) return []; // Ne devrait pas arriver si le profil est créé

      return this.prisma.property.findMany({
        where: {
          managerId: managerProfile.id,
          organizationId: user.organizationId,
        },
        include: this.getPropertyIncludeRelations(),
      });
    }

    // 3. OWNER : Voit uniquement ses propres biens
    if (user.role === UserRole.OWNER) {
      const ownerProfile = await this.prisma.owner.findUnique({
        where: { userId: user.id },
      });
      if (!ownerProfile) return [];

      return this.prisma.property.findMany({
        where: { ownerId: ownerProfile.id, organizationId: user.organizationId },
        include: this.getPropertyIncludeRelations(),
      });
    }

    // 4. Autres (Tenant, User simple) : Accès refusé ou liste vide
    return [];
  }

  async findOne(id: number, user: RequestUser): Promise<Property> {
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

    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException(`Propriété #${id} introuvable.`);
    }

    // Vérification des permissions d'accès
    await this.checkAccessPermission(property, user);

    return property;
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    user: RequestUser,
  ): Promise<Property> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { manager: true },
    });

    if (!property || property.organizationId !== user.organizationId) {
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
      await this.ensureOwnerInOrganization(
        updatePropertyDto.ownerId,
        user.organizationId,
      );
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
      await this.ensureManagerInOrganization(
        updatePropertyDto.managerId,
        user.organizationId,
      );
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

  async remove(id: number, user: RequestUser): Promise<Property> {
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

    if (!property || property.organizationId !== user.organizationId) {
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
    user: RequestUser,
  ): Promise<void> {
    if (property.organizationId !== user.organizationId) {
      throw new NotFoundException(`Propriété #${property.id} introuvable.`);
    }

    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.MANAGER) {
      const manager = await this.prisma.manager.findUnique({
        where: { userId: user.id },
      });
      if (property.managerId === manager?.id) return;
    }

    if (user.role === UserRole.OWNER) {
      const owner = await this.prisma.owner.findUnique({
        where: { userId: user.id },
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
    user: RequestUser,
    action: string,
  ): Promise<void> {
    if (property.organizationId !== user.organizationId) {
      throw new NotFoundException(`Propriété #${property.id} introuvable.`);
    }

    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.MANAGER) {
      const manager = await this.prisma.manager.findUnique({
        where: { userId: user.id },
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

  private async ensureOwnerInOrganization(ownerId: number, organizationId: number) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, user: { organizationId } },
    });
    if (!owner) throw new NotFoundException('Propriétaire introuvable.');
  }

  private async ensureManagerInOrganization(
    managerId: number,
    organizationId: number,
  ) {
    const manager = await this.prisma.manager.findFirst({
      where: { id: managerId, user: { organizationId } },
    });
    if (!manager) throw new NotFoundException('Gestionnaire introuvable.');
  }
}
