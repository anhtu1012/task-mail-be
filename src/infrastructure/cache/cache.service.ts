import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { CacheStore } from './cache.store';

export const CACHE_STORE = Symbol('CACHE_STORE');

/** Tối đa một dòng cảnh báo mỗi phút khi Redis trả lỗi từng lệnh. */
const WARN_INTERVAL_MS = 60_000;

/** Dài hơn một lượt đọc DB chậm nhất đang chạy dở lúc lệnh ghi xoá khoá. */
const SECOND_DELETE_MS = 2_000;

/**
 * Cache đọc-qua (read-through) cho dữ liệu đọc nhiều, ghi ít.
 *
 * Hai luật mà mọi chỗ gọi phải giữ:
 *
 * 1. **Giá trị đi qua JSON**, kể cả khi store là bộ nhớ — để dev local và
 *    production (Redis) cư xử giống hệt nhau. `Date` quay về thành chuỗi ISO,
 *    nên chỉ cache thứ được trả thẳng ra response, không cache thứ mà code phía
 *    sau còn gọi `.getTime()`.
 * 2. **Cache hỏng không được làm hỏng request.** Redis lỗi thì đọc thẳng DB;
 *    xoá cache lỗi thì dữ liệu cũ tự hết hạn theo TTL.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private lastWarnAt = 0;

  constructor(@Inject(CACHE_STORE) private readonly store: CacheStore) {}

  async wrap<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.read<T>(key);
    if (cached !== undefined) return cached;

    const value = await load();
    // Không chờ ghi xong: request không cần đợi thêm một vòng tới Redis.
    this.store
      .set(key, JSON.stringify(value), ttlSeconds)
      .catch((error: Error) => this.warn(`ghi ${key}`, error));
    return value;
  }

  /**
   * Xoá hai lần: ngay bây giờ, và lại sau `SECOND_DELETE_MS`.
   *
   * Lần thứ hai chặn một cuộc đua có thật: request đọc bắt đầu TRƯỚC lệnh ghi
   * nạp bản cũ từ DB, lệnh ghi xoá khoá, rồi request đọc mới ghi bản cũ vào
   * cache — và bản cũ nằm đó tới hết TTL.
   */
  async invalidate(...keys: string[]): Promise<void> {
    await this.delete(keys);
    setTimeout(() => void this.delete(keys), SECOND_DELETE_MS).unref();
  }

  private async delete(keys: string[]): Promise<void> {
    try {
      await this.store.del(keys);
    } catch (error) {
      this.warn(`xoá ${keys.join(', ')}`, error as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.store.close().catch(() => undefined);
  }

  private async read<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.store.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (error) {
      this.warn(`đọc ${key}`, error as Error);
      return undefined;
    }
  }

  private warn(action: string, error: Error): void {
    const now = Date.now();
    if (now - this.lastWarnAt < WARN_INTERVAL_MS) return;
    this.lastWarnAt = now;
    this.logger.warn(`Cache lỗi khi ${action}: ${error.message}`);
  }
}
