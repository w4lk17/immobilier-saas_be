import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { SubscriptionStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { Tokens, JwtPayload } from './types';
import { RegisterDto } from './dto/register.dto';
import { Response } from 'express';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';
import { ACCOUNT_DISABLED_ERROR } from './constants/auth-errors';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpTtlMs = 10 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private smsService: SmsService,
    private emailService: EmailService,
  ) { }

  async validateUser(phone: string, pass: string): Promise<User | null> {
    const user = await this.usersService.findByPhoneNumber(phone);
    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) return null;

    if (!user.isPhoneVerified) {
      throw new ForbiddenException({
        message: 'Téléphone non vérifié.',
        code: 'PHONE_NOT_VERIFIED',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException(ACCOUNT_DISABLED_ERROR);
    }

    return user;
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('un utilisateur avec cet email existe deja.');
    }

    const existingOrganizationPhone = await this.prisma.organization.findUnique({
      where: { phone: dto.phone },
    });
    if (existingOrganizationPhone) {
      throw new ConflictException(
        'un utilisateur avec ce telephone existe deja.',
      );
    }

    const plan = await this.prisma.plan.findUnique({
      where: { slug: dto.planSlug },
    });
    if (!plan) {
      throw new NotFoundException('Plan non trouve');
    }

    if (plan.slug === 'premium') {
      throw new BadRequestException(
        'Pour le plan Premium, veuillez nous contacter.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    const phoneVerifyCode = this.generateOtp();

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.companyName,
          email: dto.email,
          phone: dto.phone,
          planId: plan.id,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialEndsAt,
        },
      });

      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phone,
          isPhoneVerified: false,
          phoneVerifyCode: await bcrypt.hash(phoneVerifyCode, 10),
          phoneVerifyExpiresAt: new Date(Date.now() + this.otpTtlMs),
          phoneOtpLastSentAt: new Date(),
          role: UserRole.ADMIN,
          organizationId: organization.id,
          isActive: true,
        },
      });

      return { user, organization };
    });

    try {
      await this.sendOtpNotifications(
        result.organization.phone!,
        result.user.email,
        phoneVerifyCode,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send registration OTP for organization ${result.organization.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        "Votre compte a été créé, mais l'envoi du code OTP a échoué. Veuillez réessayer l'envoi du code ou contacter le support si le problème persiste.",
      );
    }

    const { password, ...userWithoutPassword } = result.user;
    return {
      message:
        "Inscription réussie. Veuillez vérifier votre compte avec le code OTP envoyé.",
      user: userWithoutPassword,
      organization: result.organization,
    };
  }

  async verifyPhone(phone: string, code: string, response: Response) {
    const user = await this.usersService.findByPhoneNumber(phone);

    if (!user) {
      throw new NotFoundException('Numéro de téléphone introuvable.');
    }
    if (!user.isActive) {
      throw new ForbiddenException(ACCOUNT_DISABLED_ERROR);
    }
    if (user.isPhoneVerified) {
      throw new BadRequestException('Numéro de téléphone déjà vérifié. Connectez-vous.');
    }

    if (
      !user.phoneVerifyCode ||
      !user.phoneVerifyExpiresAt ||
      user.phoneVerifyExpiresAt <= new Date() ||
      !(await bcrypt.compare(code, user.phoneVerifyCode))
    ) {
      throw new BadRequestException('Code OTP invalide ou expiré.');
    }

    const verifiedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isPhoneVerified: true,
        phoneVerifyCode: null,
        phoneVerifyExpiresAt: null,
        phoneOtpLastSentAt: null,
      },
    });

    // Exclure les champs sensibles
    const { password, refreshToken, ...safeUser } = verifiedUser;

    await this.login(safeUser, response);

    return {
      message: 'Numéro de téléphone vérifié avec succès.',
      user: safeUser,
    };
  }

  async resendOtp(phone: string) {
    const user = await this.usersService.findByPhoneNumber(phone);
    if (!user)
      throw new NotFoundException('Numéro de téléphone introuvable.');
    if (user.isPhoneVerified)
      throw new BadRequestException('Numéro de téléphone déjà vérifié.');
    if (
      user.phoneOtpLastSentAt &&
      Date.now() - user.phoneOtpLastSentAt.getTime() < 60_000
    )
      throw new BadRequestException(
        'Veuillez patienter une minute avant de demander un nouveau code.',
      );

    const otp = this.generateOtp();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerifyCode: await bcrypt.hash(otp, 10),
        phoneVerifyExpiresAt: new Date(Date.now() + this.otpTtlMs),
        phoneOtpLastSentAt: new Date(),
      },
    });

    await this.smsService.sendOtp(phone, otp);

    return { message: 'Un nouveau code OTP a été envoyé.' };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Token requis.');
    }

    const org = await this.prisma.organization.findFirst({
      where: { emailVerifyToken: token },
    });

    if (!org) {
      return { message: 'Email deja verifie ou token invalide.' };
    }

    if (org.isEmailVerified) {
      return { message: 'Email deja verifie. Vous pouvez vous connecter.' };
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
      },
    });

    return { message: 'Email verifie avec succes. Vous pouvez vous connecter.' };
  }

  async login(
    user: Omit<User, 'password' | 'refreshToken'>,
    response: any,
  ): Promise<void> {
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new ForbiddenException(
        'Access Denied: User not found or no refresh token',
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException(ACCOUNT_DISABLED_ERROR);
    }

    const rtMatches = await bcrypt.compare(rt, user.refreshToken);
    if (!rtMatches) {
      throw new ForbiddenException('Access Denied: Invalid refresh token');
    }

    const tokens = await this._generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    await this._updateRefreshTokenHash(user.id, tokens.refreshToken);

    this._setCookies(response, tokens);
  }

  async logout(userId: number | null, response: Response) {
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

  private async _generateTokens(payload: JwtPayload): Promise<Tokens> {
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION'),
      }),
    ]);

    return { accessToken: at, refreshToken: rt };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private isOtpExpired(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() > this.otpTtlMs;
  }

  private async sendOtpNotifications(
    phone: string,
    _email: string,
    otp: string,
  ): Promise<void> {
    await this.smsService.sendOtp(phone, otp);
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
    // console.log(`Updated refresh token hash for user ${userId}`);
  }

  private _setCookies(response: any, tokens: Tokens): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
      path: '/',
    };

    response.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

