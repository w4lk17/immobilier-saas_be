import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class OwnersService {
  constructor(private prisma: PrismaService) {}

  // Helper pour nettoyer la réponse
  private formatOwnerResponse(owner: any) {
    if (!owner) return null;
    if (owner.user) {
      const { password, refreshToken, ...secureUser } = owner.user;
      return { ...owner, user: secureUser };
    }
    return owner;
  }

  // ==========================================
  // CREATE (Admin seulement)
  // ==========================================
  async create(adminId: number, dto: CreateOwnerDto) {
    // 1. Récupérer l'organisation de l'admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { organization: true },
    });
    if (!admin?.organization) throw new ForbiddenException('Organisation introuvable');

    // Vérifier unicité email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà.');
    }

    // 2. Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      // 3. Création Transactionnelle (User + Owner)
      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: UserRole.OWNER,

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
          identityDeliveryDate: dto.identityDeliveryDate
            ? new Date(dto.identityDeliveryDate)
            : null,
          identityExpiryDate: dto.identityExpiryDate
            ? new Date(dto.identityExpiryDate)
            : null,
          pacLastName: dto.pacLastName,
          pacFirstName: dto.pacFirstName,
          pacPhoneNumber: dto.pacPhoneNumber,
          organizationId: admin.organizationId, // <--- CORRECTION ICI

          // Création profil Owner imbriqué (vide car pas de champs spécifiques dans le schéma actuel)
          ownerProfile: {
            create: {},
          },
        },
        include: {
          ownerProfile: true,
        },
      });

      // Reformatage
      const { ownerProfile, ...userData } = newUser;
      return this.formatOwnerResponse({
        ...ownerProfile,
        user: userData,
      });
    } catch (error) {
      console.error('Error creating owner:', error);
      throw new InternalServerErrorException(
        'Erreur lors de la création du propriétaire',
      );
    }
  }

  // ==========================================
  // FIND ALL (Admin seulement)
  // ==========================================
  async findAll(): Promise<any[]> {
    const owners = await this.prisma.owner.findMany({
      include: {
        user: true,
        // Optionnel: compter les propriétés
        _count: { select: { properties: true } },
      },
      orderBy: {
        user: {
          createdAt: 'desc',
        },
      },
    });
    return owners.map(this.formatOwnerResponse);
  }

  // ==========================================
  // FIND ONE (Admin ou Self)
  // ==========================================
  async findOne(id: number, currentUser: JwtPayload): Promise<any> {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
      include: {
        user: true,
        properties: { select: { id: true, address: true, status: true } }, // Ses biens
      },
    });

    if (!owner) {
      throw new NotFoundException(
        `Propriétaire avec l'ID "${id}" introuvable.`,
      );
    }

    // Droit d'accès : Admin OU c'est son propre profil
    const isOwner = owner.userId === currentUser.sub;
    if (currentUser.role !== UserRole.ADMIN && !isOwner) {
      throw new ForbiddenException("Vous n'avez pas accès à ce profil.");
    }

    return this.formatOwnerResponse(owner);
  }

  // ==========================================
  // UPDATE (Admin ou Self)
  // ==========================================
  async update(
    id: number,
    dto: UpdateOwnerDto,
    currentUser: JwtPayload,
  ): Promise<any> {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!owner) {
      throw new NotFoundException(
        `Propriétaire avec l'ID "${id}" introuvable.`,
      );
    }

    const isAdmin = currentUser.role === UserRole.ADMIN;
    const isSelf = owner.userId === currentUser.sub;

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('Action non autorisée.');
    }

    // Préparation des données User
    const userData: any = {};

    if (dto.firstName) userData.firstName = dto.firstName;
    if (dto.lastName) userData.lastName = dto.lastName;
    if (dto.phoneNumber) userData.phoneNumber = dto.phoneNumber;
    if (dto.address) userData.address = dto.address;
    if (dto.civility) userData.civility = dto.civility;
    if (dto.dateOfBirth) userData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.pictureUrl) userData.pictureUrl = dto.pictureUrl;
    if (dto.workPlace) userData.workPlace = dto.workPlace;
    if (dto.occupation) userData.occupation = dto.occupation;
    if (dto.identityDocumentNumber)
      userData.identityDocumentNumber = dto.identityDocumentNumber;
    if (dto.identityDocumentType)
      userData.identityDocumentType = dto.identityDocumentType;
    if (dto.identityDeliveryCity)
      userData.identityDeliveryCity = dto.identityDeliveryCity;
    if (dto.identityDeliveryDate)
      userData.identityDeliveryDate = new Date(dto.identityDeliveryDate);
    if (dto.identityExpiryDate)
      userData.identityExpiryDate = new Date(dto.identityExpiryDate);
    if (dto.pacLastName) userData.pacLastName = dto.pacLastName;
    if (dto.pacFirstName) userData.pacFirstName = dto.pacFirstName;
    if (dto.pacPhoneNumber) userData.pacPhoneNumber = dto.pacPhoneNumber;

    // Note: Pas de champs spécifiques Owner à mettre à jour car la table est vide dans le schéma optimisé

    try {
      // Mise à jour User seulement
      if (Object.keys(userData).length > 0) {
        const updatedUser = await this.prisma.user.update({
          where: { id: owner.userId },
          data: userData,
          include: { ownerProfile: true },
        });

        const { ownerProfile, ...userFields } = updatedUser;
        return this.formatOwnerResponse({
          ...ownerProfile,
          user: userFields,
        });
      }

      // Si rien à modifier, on retourne l'existant
      return this.formatOwnerResponse(owner);
    } catch (error) {
      console.error('Error updating owner:', error);
      throw new InternalServerErrorException('Erreur lors de la mise à jour.');
    }
  }

  // ==========================================
  // UPDATE STATUS (Admin seulement)
  // ==========================================
  async updateStatus(id: number, dto: UpdateStatusDto): Promise<any> {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
    });

    if (!owner) {
      throw new NotFoundException(
        `Propriétaire avec l'ID "${id}" introuvable.`,
      );
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: owner.userId },
        data: { isActive: dto.isActive },
        include: { ownerProfile: true },
      });

      const { ownerProfile, ...userFields } = updatedUser;
      return this.formatOwnerResponse({
        ...ownerProfile,
        user: userFields,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      throw new InternalServerErrorException(
        'Erreur lors du changement de statut.',
      );
    }
  }

  // ==========================================
  // REMOVE (Admin seulement)
  // ==========================================
  async remove(id: number): Promise<any> {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
      include: {
        user: true,
        properties: true, // Vérifier s'il a des biens
      },
    });

    if (!owner) {
      throw new NotFoundException(
        `Propriétaire avec l'ID "${id}" introuvable.`,
      );
    }

    // Optionnel : Empêcher suppression s'il a des biens actifs
    if (owner.properties.length > 0) {
      throw new BadRequestException(
        'Impossible de supprimer ce propriétaire car il possède des biens immobiliers.',
      );
    }

    try {
      // Stratégie : Supprimer le profil, rétrograder l'utilisateur
      await this.prisma.$transaction(async (tx) => {
        // 1. Supprimer le profil Owner
        await tx.owner.delete({ where: { id } });

        // 2. Mettre à jour le rôle de l'User
        await tx.user.update({
          where: { id: owner.userId },
          data: { role: UserRole.USER },
        });
      });

      return {
        message: `Profil propriétaire ${id} supprimé. L'utilisateur a été rétrogradé.`,
      };
    } catch (error) {
      console.error('Error removing owner:', error);
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Impossible de supprimer ce propriétaire à cause de relations existantes.',
        );
      }
      throw new InternalServerErrorException('Erreur lors de la suppression.');
    }
  }
}
