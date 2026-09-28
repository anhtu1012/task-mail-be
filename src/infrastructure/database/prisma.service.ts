import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { DatabaseConfig } from '../../config/database.config';

/**
 * Kích thước pool phụ thuộc **chế độ pooler** mà `DATABASE_URL` trỏ tới:
 *
 * - Session mode (Supabase cổng 5432): mỗi kết nối của app chiếm trọn một slot
 *   trong trần 15 client của cả dự án, kể cả lúc nhàn rỗi. Rolling deploy chạy
 *   container cũ và mới cùng lúc, cộng thêm `prisma migrate deploy` — nên phải
 *   giữ `max` nhỏ và nhả kết nối nhàn rỗi, nếu không deploy gãy với
 *   `EMAXCONNSESSION`. Đó là mặc định trong `database.config.ts`.
 * - Transaction mode (cổng 6543): pooler chỉ mượn kết nối Postgres thật trong
 *   lúc một transaction chạy, nên kết nối nhàn rỗi của app gần như miễn phí.
 *   Nâng `max` và đặt idle timeout = 0 để giữ kết nối nóng — đo thật, một
 *   `SELECT 1` tốn 350 ms khi phải mở lại kết nối, 54 ms khi có sẵn.
 *
 * Migration không đi qua đây mà qua `DIRECT_URL` (xem `prisma.config.ts`).
 */
const poolOptions = (config?: DatabaseConfig) => ({
  max: config?.poolMax ?? 6,
  idleTimeoutMillis: config?.poolIdleTimeoutMs ?? 30_000,
  min: 1,
  /** TCP keep-alive: giữ đường truyền sống qua NAT/idle timeout của hạ tầng. */
  keepAlive: true,
});

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const database = configService.get<DatabaseConfig>('database');
    super({
      adapter: new PrismaPg({
        connectionString: database?.url,
        ...poolOptions(database),
      }),
      // Thời gian phản hồi của API gần như hoàn toàn là `số truy vấn tuần tự ×
      // độ trễ mạng`, nên "endpoint này chạy bao nhiêu truy vấn" là con số phải
      // đếm được khi có nghi ngờ. Tắt mặc định; bật bằng PRISMA_LOG_QUERIES=true.
      log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query'] : [],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // `$connect()` chưa thật sự mở kết nối tới Postgres — nó chỉ dựng client.
    // Một truy vấn rỗng lúc khởi động đẩy chi phí bắt tay sang deploy thay vì
    // sang người dùng đầu tiên.
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(
        `Không làm nóng được kết nối DB lúc khởi động: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
