import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheConfig } from '../../config/cache.config';
import { CACHE_STORE, CacheService } from './cache.service';
import { MemoryCacheStore, RedisCacheStore } from './cache.store';

@Global()
@Module({
  providers: [
    {
      provide: CACHE_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<CacheConfig>('cache')?.redisUrl;
        if (redisUrl) return new RedisCacheStore(redisUrl);
        new Logger('CacheModule').warn(
          'Chưa có REDIS_URL — cache nằm trong bộ nhớ, chỉ đúng khi chạy một instance.',
        );
        return new MemoryCacheStore();
      },
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}
