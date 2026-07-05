import { registerAs } from '@nestjs/config';

export interface SecurityConfig {
  tokenEncryptionKey: string;
}

export default registerAs(
  'security',
  (): SecurityConfig => ({
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  }),
);
