import appConfig from './app.config';
import authConfig from './auth.config';
import cookieConfig from './cookie.config';
import databaseConfig from './database.config';
import googleConfig from './google.config';
import mailConfig from './mail.config';
import rateLimitConfig from './rate-limit.config';
import securityConfig from './security.config';
import zaloConfig from './zalo.config';

export * from './app.config';
export * from './auth.config';
export * from './cookie.config';
export * from './database.config';
export * from './google.config';
export * from './mail.config';
export * from './rate-limit.config';
export * from './security.config';
export * from './swagger.config';
export * from './zalo.config';

export const configModules = [
  appConfig,
  authConfig,
  cookieConfig,
  databaseConfig,
  googleConfig,
  mailConfig,
  rateLimitConfig,
  securityConfig,
  zaloConfig,
];
