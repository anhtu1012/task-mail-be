import { registerAs } from '@nestjs/config';

export interface CookieConfig {
  secure: boolean;
  domain: string;
}

export default registerAs('cookie', (): CookieConfig => ({
  secure: process.env.COOKIE_SECURE === 'true',
  domain: process.env.COOKIE_DOMAIN ?? 'localhost',
}));
