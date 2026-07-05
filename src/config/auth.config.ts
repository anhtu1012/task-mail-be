import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export default registerAs('auth', (): AuthConfig => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES ?? '7d',
}));
