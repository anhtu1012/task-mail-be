import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  poolMax: number;
  poolIdleTimeoutMs: number;
}

/** Biến để trống (như trong `.env.example`) được coi là chưa đặt, không phải `NaN`. */
const intFromEnv = (name: string, fallback: number): number => {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/**
 * Mặc định là giá trị an toàn cho **session-mode pooler** (cổng 5432, trần 15
 * client cho cả dự án): `6 × 2 container lúc rolling deploy + 1 migrate ≤ 15`.
 * Khi `DATABASE_URL` đã trỏ sang transaction-mode (cổng 6543) thì nâng lên qua
 * env — xem `.env.example`. Không tự đoán theo cổng: đoán sai là gãy deploy.
 */
export default registerAs('database', (): DatabaseConfig => ({
  url: process.env.DATABASE_URL ?? '',
  poolMax: intFromEnv('DATABASE_POOL_MAX', 6),
  poolIdleTimeoutMs: intFromEnv('DATABASE_POOL_IDLE_TIMEOUT_MS', 30_000),
}));
