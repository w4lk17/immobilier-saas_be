import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ManagersService {
  constructor(private prisma: PrismaService) {}

  private formatManagerResponse(manager: any) {
    if (!manager) return null;
    if (manager.user) {
      const { password, refreshToken, ...secureUser } = manager.user;
      return { ...manager, user: secureUser };
    }
    return manager;
  }

  async create(dto: CreateManagerDto): Promise<any> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe deja.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      const newManager = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: UserRole.MANAGER,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
          address: dto.address,
          civility: dto.civility,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          workPlace: dto.workPlace,
          occupation: dto.occupation,
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
          managerProfile: {
            create: {
              position: dto.position,
              employmentType: dto.employmentType,
              hireDate: dto.hireDate ? new Date(dto.hireDate) : new Date(),
              terminationDate: dto.terminationDate
                ? new Date(dto.terminationDate)
                : null,
            },
          },
        },
        include: {
          managerProfile: true,
        },
      });

      const { managerProfile, ...userData } = newManager;
      return this.formatManagerResponse({
        ...managerProfile,
        user: userData,
      });
    } catch (error) {
      console.error('Error creating manager:', error);
      throw new InternalServerErrorException(
        'Erreur lors de la creation du manager',
      );
    }
  }

  async findAll(): Promise<any[]> {
    const managers = await this.prisma.manager.findMany({
      include: {
        user: true,
      },
      orderBy: {
        user: {
          createdAt: 'desc',
        },
      },
    });
    return managers.map(this.formatManagerResponse);
  }

  async findOne(id: number, currentUser: JwtPayload): Promise<any> {
    const manager = await this.prisma.manager.findUnique({
      where: { id },
      include: {
        user: true,
        managedProperties: { select: { id: true, address: true } },
        managedContracts: { select: { id: true, status: true } },
      },
    });

    if (!manager) {
      throw new NotFoundException(`Manager avec l'ID "${id}" introuvable.`);
    }

    const isOwner = manager.userId === currentUser.sub;
    if (currentUser.role !== UserRole.ADMIN && !isOwner) {
      throw new ForbiddenException("Vous n'avez pas acces a ce profil.");
    }

    return this.formatManagerResponse(manager);
  }

  async update(
    id: number,
    dto: UpdateManagerDto,
    currentUser: JwtPayload,
  ): Promise<any> {
    const manager = await this.prisma.manager.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!manager) {
      throw new NotFoundException(`Manager avec l'ID "${id}" introuvable.`);
    }

    const isAdmin = currentUser.role === UserRole.ADMIN;
    const isSelf = manager.userId === currentUser.sub;

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('Action non autorisee.');
    }

    const userData: any = {};
    const managerData: any = {};

    if (dto.firstName) userData.firstName = dto.firstName;
    if (dto.lastName) userData.lastName = dto.lastName;
    if (dto.phoneNumber) userData.phoneNumber = dto.phoneNumber;
    if (dto.address) userData.address = dto.address;
    if (dto.civility) userData.civility = dto.civility;
    if (dto.dateOfBirth) userData.dateOfBirth = new Date(dto.dateOfBirth);

    if (isAdmin) {
      if (dto.position) managerData.position = dto.position;
      if (dto.employmentType) managerData.employmentType = dto.employmentType;
      if (dto.hireDate) managerData.hireDate = new Date(dto.hireDate);
      if (dto.terminationDate)
        managerData.terminationDate = new Date(dto.terminationDate);
    }

    if (!isAdmin && (dto.position || dto.employmentType)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier vos informations professionnelles.',
      );
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (Object.keys(userData).length > 0) {
          await tx.user.update({
            where: { id: manager.userId },
            data: userData,
          });
        }
        if (Object.keys(managerData).length > 0) {
          return await tx.manager.update({
            where: { id },
            data: managerData,
            include: { user: true },
          });
        }
        return await tx.manager.findUnique({
          where: { id },
          include: { user: true },
        });
      });

      return this.formatManagerResponse(updated);
    } catch (error) {
      console.error('Error updating manager:', error);
      throw new InternalServerErrorException('Erreur lors de la mise a jour.');
    }
  }

  async updateStatus(id: number, dto: UpdateStatusDto): Promise<any> {
    const manager = await this.prisma.manager.findUnique({
      where: { id },
    });

    if (!manager) {
      throw new NotFoundException(`Manager avec l'ID "${id}" introuvable.`);
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: manager.userId },
        data: { isActive: dto.isActive },
        include: { managerProfile: true },
      });

      const { managerProfile, ...userFields } = updatedUser;
      return this.formatManagerResponse({
        ...managerProfile,
        user: userFields,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      throw new InternalServerErrorException(
        'Erreur lors du changement de statut.',
      );
    }
  }

  async remove(id: number): Promise<any> {
    const manager = await this.prisma.manager.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!manager) {
      throw new NotFoundException(`Manager avec l'ID "${id}" introuvable.`);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.manager.delete({ where: { id } });
        await tx.user.update({
          where: { id: manager.userId },
          data: { role: UserRole.USER },
        });
      });

      return {
        message: `Profil manager ${id} supprime. L'utilisateur a ete retrograde.`,
      };
    } catch (error: any) {
      console.error('Error removing manager:', error);
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Impossible de supprimer ce manager car il est reference sur des contrats ou proprietes actifs.',
        );
      }
      throw new InternalServerErrorException('Erreur lors de la suppression.');
    }
  }
}
