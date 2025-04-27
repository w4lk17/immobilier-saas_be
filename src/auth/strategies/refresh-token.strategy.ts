import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload, JwtPayloadWithRt } from '../types';

const rtCookieExtractor = (req: Request): string | null => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['refreshToken']; // Adjust cookie name if needed
  }
  return token;
};

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([rtCookieExtractor]),
      ignoreExpiration: false, // Refresh tokens should expire
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true, // Pass the request object to the validate method
    } as StrategyOptionsWithRequest);
  }

  validate(req: Request, payload: JwtPayload): JwtPayloadWithRt {
    // Extract the refresh token from the cookie (already done by extractor)
    const refreshToken = req.cookies['refreshToken']; // Adjust cookie name

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    console.log('RefreshTokenStrategy: Validating payload:', payload);
    // Attach the refresh token to the payload for the guard/controller
    return {
      ...payload,
      refreshToken,
    };
  }
}
