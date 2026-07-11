import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { AUTH_CONSTANTS } from '../../../common/constants/auth.constants';
import { COOKIE_KEYS } from '../../../common/constants/cookie.constants';
import { JwtRefreshPayload } from '../../../common/types/jwt-payload.type';

const extractRefreshTokenFromCookie = (req: Request): string | null => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[COOKIE_KEYS.REFRESH_TOKEN] ?? null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  AUTH_CONSTANTS.JWT_REFRESH_STRATEGY,
) {
  constructor(configService: ConfigService) {
    const options: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractRefreshTokenFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.refreshSecret'),
      passReqToCallback: true,
    };
    super(options);
  }

  validate(
    req: Request,
    payload: JwtRefreshPayload,
  ): { sub: string; tokenId: string; refreshToken: string | null } {
    const refreshToken = extractRefreshTokenFromCookie(req);
    return { sub: payload.sub, tokenId: payload.tokenId, refreshToken };
  }
}
