import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  // Function to securely select user data (exclude sensitive fields)
  private excludeSensitiveData(
    user: User,
  ): Omit<User, 'password' | 'refreshToken'> {
    if (!user) throw new InternalServerErrorException('User data is null');
    const { password, refreshToken, ...result } = user;
    return result;
  }

  // Utilisé par AuthService.validateUser (doit impérativement retourner le mot de passe pour vérification)
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  // --- Routes pour l'utilisateur connecté (ME) ---

  // Récupérer l'utilisateur courant (inclut son profil propriétaire et locataire si applicable, ainsi que le plan de son organisation)
  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          include: { plan: true } // Inclure aussi le plan de l'organisation
        },
        ownerProfile: true,
        tenantProfile: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvÃ©');

    // Nettoyage des donnÃ©es sensibles
    const { password, refreshToken, ...result } = user;
    return result;
  }

  // Mise Ã  jour de ses propres infos (User de base)
  async updateMe(userId: number, dto: UpdateUserDto) {
    // On nettoie le DTO pour s'assurer qu'on ne change pas le role ou le password ici
    const data = { ...dto };
    delete (data as any).role;
    delete (data as any).password;

    return this.prisma.user.update({
      where: { id: userId },
      data: data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      }, // Sécurité : on ne retourne que les champs de base de l'utilisateur mis à jour 
    });
  }

  // Changement de mot de passe
  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) throw new ForbiddenException('Ancien mot de passe incorrect');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Mot de passe mis à jour.' };
  }

  // -------Admin function---------//

  async findAll(): Promise<Omit<User, 'password' | 'refreshToken'>[]> {
    const users = await this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return users.map(this.excludeSensitiveData);
  }

  async findOne(id: number): Promise<Omit<User, 'password' | 'refreshToken'>> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with ID "${id}" not found`);
    return this.excludeSensitiveData(user);
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password' | 'refreshToken'>> {
    // Handle password update specifically
    // if (updateUserDto.password) {
    //   throw new BadRequestException('Password update is not allowed via this endpoint.');
    // }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
      });
      return this.excludeSensitiveData(updatedUser);
    } catch (error) {
      // Gestion des erreurs Prisma (ex : P2025, enregistrement introuvable)
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if ((error as any).code === 'P2025') {
          throw new NotFoundException(`Utilisateur avec cet ID introuvable.`);
        }
        // Violation de contrainte d'unicité (ex: email déjà utilisé)
        if ((error as any).code === 'P2002') {
          throw new ConflictException("Cet email existe déjà.");
        }
      }
      throw new InternalServerErrorException("Impossible de mettre à jour l'utilisateur.");
    }
  }

  async updateStatus(id: number, isActive: boolean): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'identifiant "${id}" introuvable.`);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        isActive,
        ...(isActive === false ? { refreshToken: null } : {}),
      },
    });
  }

  async remove(id: number): Promise<Omit<User, 'password' | 'refreshToken'>> {
    try {
      const deletedUser = await this.prisma.user.delete({ where: { id } });
      return this.excludeSensitiveData(deletedUser);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error)
        throw new NotFoundException(`Utilisateur avec l'identifiant "${id}" introuvable.`);
      throw new InternalServerErrorException("Impossible de supprimer l'utilisateur.");
    }
  }
  // Utilisé par AuthService pour sauvegarder le Refresh Token
  async updateRefreshTokenHash(
    userId: number,
    rt: string | null,
  ): Promise<void> {
    try {
      const hash = rt ? await bcrypt.hash(rt, 10) : null;
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: hash },
      });
    } catch (error) {
      console.error(
        `Failed to update refresh token for user ${userId}:`,
        error,
      );
      throw new InternalServerErrorException("Impossible de mettre à jour le token.");

    }
  }
}

