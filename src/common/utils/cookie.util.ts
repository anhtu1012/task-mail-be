import { Response } from 'express';
import { CookieConfig } from '../../config/cookie.config';
import { COOKIE_KEYS } from '../constants/cookie.constants';

export class CookieUtil {
  static setRefreshTokenCookie(
    res: Response,
    token: string,
    config: CookieConfig,
    maxAgeMs: number,
  ): void {
    res.cookie(COOKIE_KEYS.REFRESH_TOKEN, token, {
      httpOnly: true,
      secure: config.secure,
      sameSite: 'strict',
      domain: config.domain,
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  static clearRefreshTokenCookie(res: Response, config: CookieConfig): void {
    res.clearCookie(COOKIE_KEYS.REFRESH_TOKEN, {
      httpOnly: true,
      secure: config.secure,
      sameSite: 'strict',
      domain: config.domain,
      path: '/',
    });
  }
}
