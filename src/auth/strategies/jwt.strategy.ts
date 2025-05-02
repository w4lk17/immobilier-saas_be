import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../types';
import { PrismaService } from '../../prisma/prisma.service';

const cookieExtractor = (req: Request): string | null => {
  let token: string | null = null;
  if (req && req.cookies) {
    token = req.cookies['accessToken']; // Adjust cookie name if needed
  }
  if (!token && req?.headers?.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1]; // Fallback to Bearer token
  }
  return token;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService, // Inject Prisma if you need to fetch fresh user data
  ) {
    super({
      // jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Default if not using cookies
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<any> {
    // The payload is the decoded JWT content { sub, email, role }
    console.log('JwtStrategy: Validating payload:', payload);

    // Optional: Fetch fresh user data to ensure user still exists/is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      // select: { id: true, email: true, role: true /* select needed fields */ },
    });

    if (!user) {
      console.log(`JwtStrategy: User ${payload.sub} not found.`);
      throw new UnauthorizedException('User not found or invalid token');
    }

    // Passport attaches this return value to request.user
    return user; // Or return payload directly if fresh data fetch isn't needed
  }
}
