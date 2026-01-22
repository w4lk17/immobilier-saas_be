import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { User } from '@prisma/client';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email', // Use email as the username field
      // passwordField: 'password' // Default is 'password'
    });
  }

  async validate(
    email: string,
    pass: string,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    // console.log(`LocalStrategy: Validating user ${email}`);
    const user = await this.authService.validateUser(email, pass);
    if (!user) {
      // console.log(`LocalStrategy: Validation failed for ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    // console.log(`LocalStrategy: Validation successful for ${email}`);
    // Passport automatically creates a user property on the request object
    // Remove password before returning
    const { password, hashedRefreshToken, ...result } = user;
    return result; // Return user object without password or refresh token hash
  }
}
