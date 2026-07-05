import { registerAs } from '@nestjs/config';

export interface RateLimitConfig {
  ttlMs: number;
  limit: number;
}

export default registerAs('rateLimit', (): RateLimitConfig => ({
  ttlMs: parseInt(process.env.RATE_LIMIT_TTL_MS ?? '60000', 10),
  limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '20', 10),
}));
