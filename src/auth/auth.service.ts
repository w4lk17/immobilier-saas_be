import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { SubscriptionStatus, User, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
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
  ) { }

  async validateUser(email: string, pass: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);

    if (user && (await bcrypt.compare(pass, user.password))) {
      return user;
    }
    return null;
  }

  async register(
    dto: RegisterDto
  ) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser)
      throw new ConflictException('un utilisateur avec cet email existe déjà.');

    // 2. Récupérer le plan choisi
    const plan = await this.prisma.plan.findUnique({
      where: { slug: dto.planSlug },
    });
    if (!plan) {
      throw new NotFoundException('Plan non trouvé');
    }

    // Pour Premium, on ne permet pas l'auto-inscription (contact sales)
    if (plan.slug === 'premium') {
      throw new BadRequestException('Pour le plan Premium, veuillez nous contacter.');
    }

    // 3. Hasher le mot de passe
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 4. Calculer la fin de l'essai (14 jours)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // 5. Transaction : Créer Organisation + Utilisateur
    const result = await this.prisma.$transaction(async (tx) => {
      // A. Créer l'Organisation
      const organization = await tx.organization.create({
        data: {
          name: dto.companyName,
          email: dto.email,
          planId: plan.id,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt: trialEndsAt,
          emailVerifyToken: uuidv4(), // Token pour vérification email
        },
      });

      // B. Créer l'Utilisateur Admin
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.ADMIN, // Le créateur est ADMIN de l'org
          organizationId: organization.id,
          isActive: true,
        },
      });

      return { user, organization };
    });
    // 6. Envoyer l'email de vérification (TODO: intégrer service mail)
    // await this.mailService.sendVerificationEmail(result.organization.emailVerifyToken, result.user.email);
    console.log(`EMAIL VERIFICATION TOKEN for ${result.user.email}: ${result.organization.emailVerifyToken}`);

    // Ne pas renvoyer le mot de passe
    const { password, ...userWithoutPassword } = result.user;
    return {
      message: 'Inscription réussie. Veuillez vérifier votre email.',
      user: userWithoutPassword,
      organization: result.organization,
    };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Token requis.');
    }

    const org = await this.prisma.organization.findFirst({
      where: { emailVerifyToken: token },
    });

    // Token introuvable: soit invalide, soit déjà consommé
    if (!org) {
      // Option 1 (idempotent "tolérant"): renvoyer succès générique
      return { message: 'Email déjà vérifié ou token invalide.' };

      // Option 2 (strict): garder BadRequestException
      // throw new BadRequestException('Token invalide ou expiré');
    }

    // Si déjà vérifié, succès idempotent
    if (org.isEmailVerified) {
      return { message: 'Email déjà vérifié. Vous pouvez vous connecter.' };
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null, // invalide le token
      },
    });

    return { message: 'Email vérifié avec succès. Vous pouvez vous connecter.' };
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

  async forgotPassword(email: string) {
    const genericResponse = {
      message:
        'Si un compte existe avec cet email, un lien de reinitialisation a ete envoye.',
    };

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return genericResponse;
    }

    const resetToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        purpose: 'password-reset',
      },
      {
        secret:
          this.configService.get<string>('JWT_PASSWORD_RESET_SECRET') ??
          this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn:
          this.configService.get<string>('JWT_PASSWORD_RESET_EXPIRATION') ??
          '15m',
      },
    );
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetLink = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

    console.log(
      `PASSWORD RESET for ${user.email} | token: ${resetToken} | link: ${resetLink}`,
    );
    return genericResponse;
  }

  async resetPassword(token: string, password: string) {
    if (!token || !password) {
      throw new BadRequestException('Token et mot de passe requis.');
    }

    let payload: { sub: number; email: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret:
          this.configService.get<string>('JWT_PASSWORD_RESET_SECRET') ??
          this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new BadRequestException('Token invalide ou expire.');
    }

    if (payload.purpose !== 'password-reset') {
      throw new BadRequestException('Token invalide.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!user || user.email !== payload.email) {
      throw new BadRequestException('Token invalide.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        refreshToken: null,
      },
    });

    return { message: 'Mot de passe reinitialise avec succes.' };
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
