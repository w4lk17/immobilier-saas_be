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
  Query,
} from '@nestjs/common';
import { Response } from 'express';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { GetCurrentUser } from './decorators/get-current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtPayloadWithRt } from './types';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Request() req, // Passport attaches user to req.user after LocalStrategy validation
    @Res({ passthrough: true }) response: Response,
  ) {
    // req.user contains the user object returned by LocalStrategy.validate
    // console.log('Login controller: User validated:', req.user);
    await this.authService.login(req.user, response);
    return { message: 'Login successful', user: req.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @GetCurrentUser('id') userId: number | null,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (userId) {
      await this.authService.logout(userId, response);
    } else {
      response.clearCookie('accessToken', { path: '/' });
      response.clearCookie('refreshToken', { path: '/api/auth' });
    }
    return { message: 'Logout successful' };
  }

  @Public() // Mark refresh as public (but requires valid RT cookie)
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @GetCurrentUser() user: JwtPayloadWithRt, // Get user payload + RT
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.refreshTokens(user.sub, user.refreshToken, response);
    // Cookies are set by authService.refreshTokens
    return { message: 'Tokens refreshed successfully' };
  }
}
