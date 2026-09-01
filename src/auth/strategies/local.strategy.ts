import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { User } from '@prisma/client';
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private authService: AuthService) {
    super({ usernameField: 'phone' });
  }

  async validate(phone: string, password: string): Promise<Omit<User, 'password' | 'refreshToken'>> {
    const user = await this.authService.validateUser(phone, password);

    if (!user) throw new UnauthorizedException('Identifiants invalides.');

    const { password: _password, refreshToken: _refreshToken, ...result } = user;
    return result;
  }
}
