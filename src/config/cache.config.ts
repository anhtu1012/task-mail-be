import { registerAs } from '@nestjs/config';

export interface CacheConfig {
  /** Bỏ trống = cache trong bộ nhớ tiến trình, chỉ đúng khi chạy MỘT instance. */
  redisUrl: string | null;
}

export default registerAs('cache', (): CacheConfig => ({
  redisUrl: process.env.REDIS_URL?.trim() || null,
}));
