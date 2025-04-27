import {
  Controller,
  Post,
  UseGuards,
  Request,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express'; // Import Express Response
import { User } from '@prisma/client';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard'; // Assuming this is set globally or applied here
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { LoginDto } from './dto/login.dto';
import { GetCurrentUser } from './decorators/get-current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtPayload, JwtPayloadWithRt } from './types';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Controller('auth') // Base path /api/auth
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public() // Mark register as public
  @Post('register')
  @HttpCode(HttpStatus.CREATED) // Send 201 on successful registration
  async register(
    @Body() createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    console.log('Register controller: Attempting registration for:', createUserDto.email);
    // Password validation (e.g., confirm password) could be added in the DTO or here if needed
    const newUser = await this.authService.register(createUserDto);
    // Return the newly created user data (without sensitive fields)
    return newUser;
  }

  @Public() // Mark login as public
  @UseGuards(LocalAuthGuard) // Use Local Strategy
  @Post('login')
  @HttpCode(HttpStatus.OK) // Send 200 on successful login
  async login(
    @Request() req, // Passport attaches user to req.user after LocalStrategy validation
    @Res({ passthrough: true }) response: Response, // Inject Express Response
  ) {
    // req.user contains the user object returned by LocalStrategy.validate
    console.log('Login controller: User validated:', req.user);
    await this.authService.login(req.user, response);
    // Cookies are set by authService.login
    return { message: 'Login successful', user: req.user }; // Return confirmation
  }

  // No need for JwtAuthGuard here if it's applied globally
  // If not global, add @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @GetCurrentUser('sub') userId: number, // Use custom decorator to get user ID
    @Res({ passthrough: true }) response: Response,
  ) {
    console.log(`Logout requested for user ${userId}`);
    await this.authService.logout(userId, response);
    // Cookies cleared by authService.logout
    return { message: 'Logout successful' };
  }

  @Public() // Mark refresh as public (but requires valid RT cookie)
  @UseGuards(RefreshTokenGuard) // Use Refresh Token Strategy/Guard
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @GetCurrentUser() user: JwtPayloadWithRt, // Get user payload + RT
    @Res({ passthrough: true }) response: Response,
  ) {
    console.log(`Refresh token request for user ${user.sub}`);
    await this.authService.refreshTokens(user.sub, user.refreshToken, response);
    // Cookies are set by authService.refreshTokens
    return { message: 'Tokens refreshed successfully' };
  }

  // Protected route example
  // No need for JwtAuthGuard here if it's applied globally
  // If not global, add @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@GetCurrentUser() user) {
    // req.user contains the payload validated by JwtStrategy
    console.log(`Profile requested by user ${user.id}`);
    // Return only necessary, non-sensitive data
    return { userId: user.sub = user.id, email: user.email, role: user.role };
  }
}
