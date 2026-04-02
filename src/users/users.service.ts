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
  constructor(private prisma: PrismaService) {}

  // Function to securely select user data (exclude sensitive fields)
  private excludeSensitiveData(
    user: User,
  ): Omit<User, 'password' | 'refreshToken'> {
    if (!user) throw new InternalServerErrorException('User data is null');
    const { password, refreshToken, ...result } = user;
    return result;
  }

  // Utilisé par AuthService.validateUser (doit retourner le password pour vérification)
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // --- Routes pour l'utilisateur connecté (ME) ---

  // Récupérer l'utilisateur courant (avec son profil spécifique si besoin)
  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownerProfile: true,
        managerProfile: true,
        tenantProfile: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    // Nettoyage des données sensibles
    const { password, refreshToken, ...result } = user;
    return result;
  }

  // Mise à jour de ses propres infos (User de base)
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
      }, // Sécurité
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

    return { message: 'Mot de passe mis à jour' };
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
      // Handle Prisma errors (e.g., P2025 Record not found)
      if (error.code === 'P2025')
        throw new NotFoundException(`User with ID "${id}" not found.`);
      // Unique constraint violation (e.g., email)
      if (error.code === 'P2002')
        throw new ConflictException('Email already exists.');
      throw new InternalServerErrorException('Could not update user.');
    }
  }

  async updateStatus(id: number, isActive: boolean): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive },
    });
  }

  async remove(id: number): Promise<Omit<User, 'password' | 'refreshToken'>> {
    try {
      const deletedUser = await this.prisma.user.delete({ where: { id } });
      return this.excludeSensitiveData(deletedUser);
    } catch (error) {
      if (error.code === 'P2025')
        throw new NotFoundException(`User with ID "${id}" not found.`);
      throw new InternalServerErrorException('Could not delete user.');
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
      throw new InternalServerErrorException('Could not update token');
    }
  }
}
