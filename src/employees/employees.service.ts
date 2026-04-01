import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/types';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) { }

  // Helper pour nettoyer la réponse (retirer le mot de passe)
  private formatEmployeeResponse(employee: any) {
    if (!employee) return null;
    // L'objet user est inclus via les relations
    if (employee.user) {
      const { password, refreshToken, ...secureUser } = employee.user;
      return { ...employee, user: secureUser };
    }
    return employee;
  }

  // ==========================================
  // CREATE (Admin seulement)
  // ==========================================
  async create(dto: CreateEmployeeDto): Promise<any> {
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
      // 3. Création Transactionnelle (User + Employee)
      const newEmployee = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: UserRole.MANAGER, // Rôle forcé
          // Champs communs User
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
          identityDeliveryDate: dto.identityDeliveryDate ? new Date(dto.identityDeliveryDate) : null,
          identityExpiryDate: dto.identityExpiryDate ? new Date(dto.identityExpiryDate) : null,
          pacLastName: dto.pacLastName,
          pacFirstName: dto.pacFirstName,
          pacPhoneNumber: dto.pacPhoneNumber,

          // Création profil Employee imbriqué
          employeeProfile: {
            create: {
              position: dto.position,
              employmentType: dto.employmentType,
              hireDate: dto.hireDate ? new Date(dto.hireDate) : new Date(),
              terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : null,
            },
          },
        },
        include: {
          employeeProfile: true,
        },
      });

      // On retourne l'objet structuré comme attendu (Employee avec user imbriqué)
      // Prisma renvoie User, on doit reformater un peu pour que ça ressemble à un objet Employee
      const { employeeProfile, ...userData } = newEmployee;
      return this.formatEmployeeResponse({
        ...employeeProfile,
        user: userData,
      });

    } catch (error) {
      console.error('Error creating employee:', error);
      throw new InternalServerErrorException("Erreur lors de la création de l'employé");
    }
  }

  // ==========================================
  // FIND ALL (Admin seulement)
  // ==========================================
  async findAll(): Promise<any[]> {
    const employees = await this.prisma.employee.findMany({
      include: {
        user: true,
      },
      orderBy: {
        user: {
          createdAt: 'desc',
        },
      },
    });
    return employees.map(this.formatEmployeeResponse);
  }

  // ==========================================
  // FIND ONE (Admin ou Self)
  // ==========================================
  async findOne(id: number, currentUser: JwtPayload): Promise<any> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: true,
        managedProperties: { select: { id: true, address: true } },
        managedContracts: { select: { id: true, status: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employé avec l'ID "${id}" introuvable.`);
    }

    // Droit d'accès : Admin OU c'est son propre profil
    const isOwner = employee.userId === currentUser.sub;
    if (currentUser.role !== UserRole.ADMIN && !isOwner) {
      throw new ForbiddenException("Vous n'avez pas accès à ce profil.");
    }

    return this.formatEmployeeResponse(employee);
  }

  // ==========================================
  // UPDATE (Admin ou Self avec restrictions)
  // ==========================================
  async update(id: number, dto: UpdateEmployeeDto, currentUser: JwtPayload): Promise<any> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employé avec l'ID "${id}" introuvable.`);
    }

    // 1. Vérification des droits
    const isAdmin = currentUser.role === UserRole.ADMIN;
    const isSelf = employee.userId === currentUser.sub;

    if (!isAdmin && !isSelf) {
      throw new ForbiddenException('Action non autorisée.');
    }

    // 2. Préparation des données
    const userData: any = {};
    const employeeData: any = {};

    // Séparation des champs User vs Employee
    // Champs User (communs)
    if (dto.firstName) userData.firstName = dto.firstName;
    if (dto.lastName) userData.lastName = dto.lastName;
    if (dto.phoneNumber) userData.phoneNumber = dto.phoneNumber;
    if (dto.address) userData.address = dto.address;
    if (dto.civility) userData.civility = dto.civility;
    if (dto.dateOfBirth) userData.dateOfBirth = new Date(dto.dateOfBirth);
    // ... autres champs communs ...

    // Champs Employee (Restreints pour l'auto-mise à jour)
    // Un employé ne peut pas changer son poste lui-même
    if (isAdmin) {
      if (dto.position) employeeData.position = dto.position;
      if (dto.employmentType) employeeData.employmentType = dto.employmentType;
      if (dto.hireDate) employeeData.hireDate = new Date(dto.hireDate);
      if (dto.terminationDate) employeeData.terminationDate = new Date(dto.terminationDate);
    }

    // Si ce n'est pas un admin, on s'assure qu'il n'essaie pas de modifier des champs pro
    if (!isAdmin && (dto.position || dto.employmentType)) {
      throw new ForbiddenException("Vous ne pouvez pas modifier vos informations professionnelles.");
    }

    try {
      // Transaction de mise à jour
      const updated = await this.prisma.$transaction(async (tx) => {
        // Update User si nécessaire
        if (Object.keys(userData).length > 0) {
          await tx.user.update({
            where: { id: employee.userId },
            data: userData,
          });
        }
        // Update Employee si nécessaire
        if (Object.keys(employeeData).length > 0) {
          return await tx.employee.update({
            where: { id },
            data: employeeData,
            include: { user: true },
          });
        }
        // Si seul l'user a changé, on retourne l'employé avec l'user frais
        return await tx.employee.findUnique({
          where: { id },
          include: { user: true }
        });
      });

      return this.formatEmployeeResponse(updated);
    } catch (error) {
      console.error('Error updating employee:', error);
      throw new InternalServerErrorException('Erreur lors de la mise à jour.');
    }
  }

  // ==========================================
  // UPDATE STATUS (Admin seulement)
  // ==========================================
  async updateStatus(id: number, dto: UpdateStatusDto): Promise<any> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      throw new NotFoundException(`Employé avec l'ID "${id}" introuvable.`);
    }

    try {
      // On met à jour le statut sur l'UTILISATEUR lié
      const updatedUser = await this.prisma.user.update({
        where: { id: employee.userId },
        data: { isActive: dto.isActive },
        include: { employeeProfile: true }, // Pour retourner l'objet complet
      });

      // On reformatte pour la réponse
      const { employeeProfile, ...userFields } = updatedUser;
      return this.formatEmployeeResponse({
        ...employeeProfile,
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
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employé avec l'ID "${id}" introuvable.`);
    }

    try {
      // Stratégie : On supprime le profil employé, et on rétrograde l'utilisateur au rôle USER
      await this.prisma.$transaction(async (tx) => {
        // 1. Supprimer le profil Employee
        await tx.employee.delete({ where: { id } });

        // 2. Mettre à jour le rôle de l'User
        await tx.user.update({
          where: { id: employee.userId },
          data: { role: UserRole.USER },
        });
      });

      return { message: `Profil employé ${id} supprimé. L'utilisateur a été rétrogradé.` };
    } catch (error) {
      console.error('Error removing employee:', error);
      // Gestion erreur FK (si l'employé est manager sur des contrats)
      if (error.code === 'P2003') {
        throw new BadRequestException(
          "Impossible de supprimer cet employé car il est référencé sur des contrats ou propriétés actifs.",
        );
      }
      throw new InternalServerErrorException('Erreur lors de la suppression.');
    }
  }
}