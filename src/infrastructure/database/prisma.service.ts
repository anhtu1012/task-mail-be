import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Mở một kết nối tới Supabase tốn ~300–500 ms (bắt tay TLS + pooler), trong khi
 * một truy vấn trên kết nối sẵn có chỉ tốn một vòng mạng (~55 ms từ VN, ~200 ms
 * từ Render/Oregon). Đo thật: sau 35 giây nhàn rỗi, một `SELECT 1` tốn **350
 * ms** khi phải mở lại kết nối, và **54 ms** khi giữ kết nối sẵn.
 *
 * `idleTimeoutMillis: 0` (không bao giờ đóng kết nối nhàn rỗi) từng được dùng ở
 * đây nhưng gây `EMAXCONNSESSION` trên Supabase: pooler **session mode** giới
 * hạn 15 client cho cả dự án, và Render rolling-deploy chạy container cũ và
 * mới song song một lúc — container cũ giữ khư khư kết nối cũ trong khi
 * container mới cần mở thêm kết nối cho `prisma migrate deploy`, cộng dồn vượt
 * trần. Đặt lại timeout hữu hạn để container cũ nhả bớt kết nối trong lúc
 * deploy, đổi lấy một phần độ trễ đã tối ưu.
 */
const POOL_OPTIONS = {
  /** Đóng kết nối nhàn rỗi sau 30s thay vì giữ vĩnh viễn — xem lý do ở trên. */
  idleTimeoutMillis: 30_000,
  /**
   * Giữ sẵn một kết nối để request đầu tiên sau khi khởi động không phải bắt
   * tay lại từ đầu.
   */
  min: 1,
  /**
   * Supabase session-mode pooler chỉ có 15 client cho cả dự án, và trong lúc
   * rolling deploy container cũ + mới cùng giữ kết nối. Giữ nhỏ để hai container
   * cộng lại vẫn còn dư chỗ cho `prisma migrate deploy`.
   */
  max: 4,
  /** TCP keep-alive: giữ đường truyền sống qua NAT/idle timeout của hạ tầng. */
  keepAlive: true,
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get<string>('database.url'),
        ...POOL_OPTIONS,
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
