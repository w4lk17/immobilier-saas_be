import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { User, UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) { }

  // ==========================================
  // CREATE
  // ==========================================
  async create(adminId: number, data: CreateTenantDto) {
    // 1. Vérification Admin & Org
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { organization: true },
    });
    if (!admin || !admin.organization) {
      throw new ForbiddenException('Aucune organisation trouvée pour cet administrateur.');
    }

    // 2. Unicité Email
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Cet email est déjà utilisé.');

    // 3. Mot de passe temporaire
    const tempPassword = 'password123';// Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(tempPassword, 10);

    try {
      const newUser = await this.prisma.user.create({
        data: {
          email: data.email,
          password: hash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          civility: data.civility,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          address: data.address,
          pictureUrl: data.pictureUrl,
          workPlace: data.workPlace,
          occupation: data.occupation,
          identityDocumentNumber: data.identityDocumentNumber,
          identityDocumentType: data.identityDocumentType,
          identityDeliveryCity: data.identityDeliveryCity,
          identityDeliveryDate: data.identityDeliveryDate ? new Date(data.identityDeliveryDate) : null,
          identityExpiryDate: data.identityExpiryDate ? new Date(data.identityExpiryDate) : null,
          pacLastName: data.pacLastName,
          pacFirstName: data.pacFirstName,
          pacPhoneNumber: data.pacPhoneNumber,

          role: UserRole.TENANT,
          organizationId: admin.organizationId, // Même Org
          isActive: true,

          // Création profil Tenant
          tenantProfile: {
            create: {
              oldAddress: data.oldAddress,
            },
          },
        },
        include: { tenantProfile: true },
      });

      // TODO: Envoyer Email avec tempPassword
      console.log(`Tenant created for ${data.email}. Temp pass: ${tempPassword}`);

      const { password, ...result } = newUser;
      return result;

    } catch (error) {
      console.error(error);
      throw new Error("Erreur lors de la création du locataire.");
    }
  }

  // ==========================================
  // FIND ALL
  // ==========================================
  async findAll(orgId: number) {
    return this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        role: UserRole.TENANT
      },
      include: { tenantProfile: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  // ==========================================
  // FIND ONE
  // ==========================================
  async findOne(id: number, orgId: number) {
    const tenant = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId: orgId,
        role: UserRole.TENANT
      },
      include: { tenantProfile: true },
    });

    if (!tenant) throw new NotFoundException('Locataire introuvable dans votre organisation.');

    const { password, ...result } = tenant;
    return result;
  }

  // ==========================================
  // UPDATE
  // ==========================================
  async update(id: number, orgId: number, data: UpdateTenantDto) {
    // Vérif existence
    await this.findOne(id, orgId); // Lance 404 si pas trouvé ou pas dans l'org

    // Préparation données User
    const userData: any = { ...data };
    // Nettoyage des champs qui ne vont pas dans User
    delete userData.oldAddress;
    delete userData.organizationId; // Sécurité : ne pas changer l'org
    delete userData.role; // Sécurité : ne pas changer le role ici

    // Préparation données Tenant
    const tenantData: any = {};
    if (data.oldAddress !== undefined) tenantData.oldAddress = data.oldAddress;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...userData,
        tenantProfile: Object.keys(tenantData).length > 0 ? { update: tenantData } : undefined
      },
      include: { tenantProfile: true }
    });

    const { password, ...result } = updated;
    return result;
  }

  // ==========================================
  // UPDATE STATUS (Admin seulement)
  // ==========================================
  async updateStatus(id: number, dto: UpdateStatusDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Locataire avec l'ID "${id}" introuvable.`);
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  // ==========================================
  // REMOVE (Soft Delete)
  // ==========================================
  async remove(id: number, orgId: number) {
  await this.findOne(id, orgId); // Vérif

  // On désactive le compte pour garder l'historique des contrats
  return this.prisma.user.update({
    where: { id },
    data: { isActive: false }
  });
}
}
