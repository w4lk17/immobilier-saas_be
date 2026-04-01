import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { Tenant, User, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) { }

  // Helper pour nettoyer la réponse
  private formatTenantResponse(tenant: any) {
    if (!tenant) return null;
    if (tenant.user) {
      const { password, refreshToken, ...secureUser } = tenant.user;
      return { ...tenant, user: secureUser };
    }
    return tenant;
  }

  // ==========================================
  // CREATE (Admin seulement)
  // ==========================================
  async create(dto: CreateTenantDto): Promise<any> {
    // 1. Vérifier unicité email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà.');
    }

    // 2. Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      // 3. Création Transactionnelle (User + Tenant)
      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: UserRole.TENANT, // Rôle forcé

          // Champs communs User
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
          address: dto.address,
          civility: dto.civility,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          workPlace: dto.workPlace,
          occupation: dto.occupation,
          pictureUrl: dto.pictureUrl,
          identityDocumentNumber: dto.identityDocumentNumber,
          identityDocumentType: dto.identityDocumentType,
          identityDeliveryCity: dto.identityDeliveryCity,
          identityDeliveryDate: dto.identityDeliveryDate ? new Date(dto.identityDeliveryDate) : null,
          identityExpiryDate: dto.identityExpiryDate ? new Date(dto.identityExpiryDate) : null,
          pacLastName: dto.pacLastName,
          pacFirstName: dto.pacFirstName,
          pacPhoneNumber: dto.pacPhoneNumber,

          // Création profil Tenant imbriqué
          tenantProfile: {
            create: {
              oldAddress: dto.oldAddress,
            },
          },
        },
        include: {
          tenantProfile: true,
        },
      });

      // Reformatage pour correspondre à l'attendu (Tenant avec user imbriqué)
      const { tenantProfile, ...userData } = newUser;
      return this.formatTenantResponse({
        ...tenantProfile,
        user: userData,
      });

    } catch (error) {
      console.error('Error creating tenant:', error);
      throw new InternalServerErrorException("Erreur lors de la création du locataire");
    }
  }

  // ==========================================
  // FIND ALL (Admin seulement)
  // ==========================================
  async findAll(): Promise<any[]> {
    const tenants = await this.prisma.tenant.findMany({
      include: {
        user: true,
      },
      orderBy: {
        user: {
          createdAt: 'desc',
        },
      },
    });
    return tenants.map(this.formatTenantResponse);
  }

  // ==========================================
  // FIND ONE (Admin ou Self)
  // ==========================================
  async findOne(id: number, currentUser: JwtPayload): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        user: true,
        contracts: {
          include: { property: { select: { address: true } } },
          orderBy: { startDate: 'desc' }
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Locataire avec l'ID "${id}" introuvable.`);
    }

    // Droit d'accès : Admin OU c'est son propre profil
    const isOwner = tenant.userId === currentUser.sub;
    if (currentUser.role !== UserRole.ADMIN && !isOwner) {
      throw new ForbiddenException("Vous n'avez pas accès à ce profil.");
    }

    return this.formatTenantResponse(tenant);
  }

  // ==========================================
  // UPDATE (Admin ou Self)
  // ==========================================
  async update(id: number, dto: UpdateTenantDto, currentUser: JwtPayload): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Locataire avec l'ID "${id}" introuvable.`);
    }

    const isAdmin = currentUser.role === UserRole.ADMIN;
    const isSelf = tenant.userId === currentUser.sub;

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('Action non autorisée.');
    }

    // Préparation des données
    const userData: any = {};
    const tenantData: any = {};

    // Mappage des champs User (communs)
    if (dto.firstName) userData.firstName = dto.firstName;
    if (dto.lastName) userData.lastName = dto.lastName;
    if (dto.phoneNumber) userData.phoneNumber = dto.phoneNumber;
    if (dto.address) userData.address = dto.address;
    if (dto.civility) userData.civility = dto.civility;
    if (dto.dateOfBirth) userData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.pictureUrl) userData.pictureUrl = dto.pictureUrl;
    if (dto.workPlace) userData.workPlace = dto.workPlace;
    if (dto.occupation) userData.occupation = dto.occupation;
    if (dto.identityDocumentNumber) userData.identityDocumentNumber = dto.identityDocumentNumber;
    if (dto.identityDocumentType) userData.identityDocumentType = dto.identityDocumentType;
    if (dto.identityDeliveryCity) userData.identityDeliveryCity = dto.identityDeliveryCity;
    if (dto.identityDeliveryDate) userData.identityDeliveryDate = new Date(dto.identityDeliveryDate);
    if (dto.identityExpiryDate) userData.identityExpiryDate = new Date(dto.identityExpiryDate);
    if (dto.pacLastName) userData.pacLastName = dto.pacLastName;
    if (dto.pacFirstName) userData.pacFirstName = dto.pacFirstName;
    if (dto.pacPhoneNumber) userData.pacPhoneNumber = dto.pacPhoneNumber;

    // Mappage des champs Tenant (spécifiques)
    if (dto.oldAddress !== undefined) tenantData.oldAddress = dto.oldAddress;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Update User si nécessaire
        if (Object.keys(userData).length > 0) {
          await tx.user.update({
            where: { id: tenant.userId },
            data: userData,
          });
        }
        // Update Tenant si nécessaire
        if (Object.keys(tenantData).length > 0) {
          return await tx.tenant.update({
            where: { id },
            data: tenantData,
            include: { user: true },
          });
        }
        // Si seul l'user a changé
        return await tx.tenant.findUnique({
          where: { id },
          include: { user: true }
        });
      });

      return this.formatTenantResponse(updated);
    } catch (error) {
      console.error('Error updating tenant:', error);
      throw new InternalServerErrorException('Erreur lors de la mise à jour.');
    }
  }

  // ==========================================
  // UPDATE STATUS (Admin seulement)
  // ==========================================
  async updateStatus(id: number, dto: UpdateStatusDto): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException(`Locataire avec l'ID "${id}" introuvable.`);
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: tenant.userId },
        data: { isActive: dto.isActive },
        include: { tenantProfile: true },
      });

      const { tenantProfile, ...userFields } = updatedUser;
      return this.formatTenantResponse({
        ...tenantProfile,
        user: userFields
      });

    } catch (error) {
      console.error('Error updating status:', error);
      throw new InternalServerErrorException('Erreur lors du changement de statut.');
    }
  }

  // ==========================================
  // REMOVE (Admin seulement)
  // ==========================================
  async remove(id: number): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Locataire avec l'ID "${id}" introuvable.`);
    }

    try {
      // Stratégie : Supprimer le profil, rétrograder l'utilisateur
      await this.prisma.$transaction(async (tx) => {
        // 1. Supprimer le profil Tenant
        await tx.tenant.delete({ where: { id } });

        // 2. Mettre à jour le rôle de l'User
        await tx.user.update({
          where: { id: tenant.userId },
          data: { role: UserRole.USER },
        });
      });

      return { message: `Profil locataire ${id} supprimé. L'utilisateur a été rétrogradé.` };
    } catch (error) {
      console.error('Error removing tenant:', error);
      if (error.code === 'P2003') {
        throw new BadRequestException(
          "Impossible de supprimer ce locataire car il a des contrats ou factures liés.",
        );
      }
      throw new InternalServerErrorException('Erreur lors de la suppression.');
    }
  }
}