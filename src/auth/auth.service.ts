import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { Tokens, JwtPayload } from './types';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

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
      // Password matches, return the FULL user object
      return user;
    }
    return null;
  }

  async register(
    createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    // UsersService.create handles email conflict checks and password hashing
    console.log(`AuthService: Registering user ${createUserDto.email}`);
    try {
      // We directly call the UsersService.create which returns the secure user data
      const newUser = await this.usersService.create(createUserDto);
      console.log(`AuthService: User ${createUserDto.email} registered successfully`);
      // We don't automatically log in the user here, just return the created user info
      return newUser;
    } catch (error) {
      // Re-throw specific exceptions handled by UsersService (like ConflictException)
      if (error instanceof ConflictException) {
        throw error; // Let Nest handle the 409 response
      }
      // Log and throw a generic error for other issues
      console.error(
        `AuthService: Error during registration for ${createUserDto.email}:`,
        error,
      );
      throw new InternalServerErrorException('Could not register user.');
    }
  }

  async login(
    user: Omit<User, 'password' | 'hashedRefreshToken'>,
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

    if (!user || !user.hashedRefreshToken) {
      throw new ForbiddenException(
        'Access Denied: User not found or no refresh token',
      );
    }

    const rtMatches = await bcrypt.compare(rt, user.hashedRefreshToken);
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

  async logout(userId: number, response: any): Promise<void> {
    // response is Express Response
    // Set refresh token hash to null in database
    try {
      await this.prisma.user.updateMany({
        where: {
          id: userId,
          hashedRefreshToken: {
            not: null,
          },
        },
        data: {
          hashedRefreshToken: null,
        },
      });
      this._clearCookies(response);
      console.log(`User ${userId} logged out`);
    } catch (error) {
      console.error(`Error logging out user ${userId}:`, error);
      // Don't necessarily throw an error to the client, just log it
      // Maybe clear cookies anyway?
      this._clearCookies(response);
      // throw new InternalServerErrorException('Could not process logout');
    }
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

    return {
      accessToken: at,
      refreshToken: rt,
    };
  }

  private async _updateRefreshTokenHash(
    userId: number,
    rt: string,
  ): Promise<void> {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rt, salt);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: hash },
    });
    console.log(`Updated refresh token hash for user ${userId}`);
  }

  private _setCookies(response: any, tokens: Tokens): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    // Set Access Token Cookie
    response.cookie('accessToken', tokens.accessToken, {
      httpOnly: true, // Prevent JS access
      secure: isProduction, // Use secure in production (HTTPS)
      sameSite: isProduction ? 'strict' : 'lax', // Adjust as needed
      path: '/', // Cookie available site-wide
      // expires: new Date(...) // Or use maxAge based on JWT expiration
    });

    // Set Refresh Token Cookie
    response.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/api/auth', // Only send RT cookie to auth endpoints
      // expires: new Date(...) // Or use maxAge based on JWT expiration
    });
  }

  private _clearCookies(response: any): void {
    response.clearCookie('accessToken', { path: '/' });
    response.clearCookie('refreshToken', { path: '/api/auth' }); // Match path used in set
  }
}
