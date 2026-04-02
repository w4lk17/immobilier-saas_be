import {
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { Tokens, JwtPayload } from './types';
import { RegisterDto } from './dto/register.dto';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService, // Use UsersService for user operations
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);

    if (user && (await bcrypt.compare(pass, user.password))) {
      return user;
    }
    return null;
  }

  async register(
    dto: RegisterDto,
  ): Promise<Omit<User, 'password' | 'refreshToken'>> {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser)
      throw new ConflictException('un utilisateur avec cet email existe déjà.');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    try {
      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.ADMIN, // Rôle par défaut pour l'inscription publique
        },
      });

      const { password, refreshToken, ...result } = newUser;
      return result;
    } catch (error) {
      console.error('Error registering user:', error);
      throw new InternalServerErrorException("Erreur lors de l'inscription.");
    }
  }

  async login(
    user: Omit<User, 'password' | 'refreshToken'>,
    response: any,
  ): Promise<void> {
    // response is Express Response
    const tokens = await this._generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    await this._updateRefreshTokenHash(user.id, tokens.refreshToken);

    this._setCookies(response, tokens);
  }

  async refreshTokens(
    userId: number,
    rt: string,
    response: any,
  ): Promise<void> {
    // response is Express Response
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new ForbiddenException(
        'Access Denied: User not found or no refresh token',
      );
    }

    const rtMatches = await bcrypt.compare(rt, user.refreshToken);
    if (!rtMatches) {
      throw new ForbiddenException('Access Denied: Invalid refresh token');
    }

    // Tokens are valid, generate new ones
    const tokens = await this._generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    await this._updateRefreshTokenHash(user.id, tokens.refreshToken);

    this._setCookies(response, tokens);
    console.log(`Tokens refreshed for user ${userId}`);
  }

  async logout(userId: number | null, response: Response) {
    // response is Express Response
    // Set refresh token hash to null in database

    if (userId) {
      await this.usersService.updateRefreshTokenHash(userId, null);
    }
    this._clearCookies(response);
    console.log(
      `Logout processed. User ID: ${userId || 'Unknown (Public Route)'}`,
    );
  }

  // --- Helper Methods ---

  private async _generateTokens(payload: JwtPayload): Promise<Tokens> {
    const [at, rt] = await Promise.all([
      // Access Token
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION'), // e.g., '15m'
      }),
      // Refresh Token
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION'), // e.g., '7d'
      }),
    ]);

    return { accessToken: at, refreshToken: rt };
  }

  private async _updateRefreshTokenHash(
    userId: number,
    rt: string,
  ): Promise<void> {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rt, salt);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
    console.log(`Updated refresh token hash for user ${userId}`);
  }

  private _setCookies(response: any, tokens: Tokens): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    const cookieOptions = {
      httpOnly: true,
      // On Vercel (HTTPS), we use true. On local PC (HTTP), we use false.
      secure: isProduction,
      // On Vercel (Cross-site), we use 'none'. On local PC, 'lax' is fine.
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
      path: '/',
    };

    // Set Access Token Cookie
    response.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, //this.configService.get<number>('JWT_ACCESS_EXPIRATION'), // 15 minutes
    });

    // Set Refresh Token Cookie
    response.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      path: '/api/auth', // Only send RT cookie to auth endpoints
      maxAge: 7 * 24 * 60 * 60 * 1000, //this.configService.get<number>('JWT_REFRESH_EXPIRATION'), // 7 days
    });
  }

  private _clearCookies(response: any): void {
    const clearOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
    };
    response.clearCookie('accessToken', { ...clearOptions, path: '/' });
    response.clearCookie('refreshToken', {
      ...clearOptions,
      path: '/api/auth',
    });
  }
}
