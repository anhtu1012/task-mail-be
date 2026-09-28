import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/** Nơi lưu chuỗi đã tuần tự hoá. `CacheService` lo JSON và xử lý lỗi. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  close(): Promise<void>;
}

/**
 * Dự phòng khi không có `REDIS_URL` — dev local và bản deploy một instance.
 *
 * Nhiều instance thì SAI: lệnh xoá cache chỉ chạy trên instance nhận request
 * ghi, các instance khác tiếp tục trả bản cũ tới hết TTL.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.entries.clear();
    return Promise.resolve();
  }
}

export class RedisCacheStore implements CacheStore {
  private readonly logger = new Logger(RedisCacheStore.name);
  private readonly client: Redis;
  private down = false;

  constructor(url: string) {
    this.client = new Redis(url, {
      keyPrefix: 'tm:v1:',
      // Redis chậm hay mất kết nối thì lệnh phải hỏng NGAY để request rơi về DB,
      // không được xếp hàng chờ reconnect — cache chậm còn tệ hơn không cache.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
    });
    // ioredis bắn 'error' ở MỖI lần reconnect hỏng; chỉ log lúc đổi trạng thái
    // để một lần Redis sập không đổ hàng nghìn dòng log.
    this.client.on('error', (error: Error) => {
      if (this.down) return;
      this.down = true;
      this.logger.warn(`Mất kết nối Redis, đọc thẳng DB: ${error.message}`);
    });
    this.client.on('ready', () => {
      if (!this.down) return;
      this.down = false;
      this.logger.log('Redis đã kết nối lại');
    });
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
