import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, of, tap } from 'rxjs';
import { CACHE_TTL } from '../constants/cache.constants';

/**
 * Minimal in-memory GET cache. Swap the Map for infrastructure/cache/redis.service.ts
 * once cross-instance caching is needed — the interceptor contract stays the same.
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly store = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method !== 'GET') return next.handle();

    const key = request.originalUrl;
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return of(cached.value);
    }

    return next.handle().pipe(
      tap((value) =>
        this.store.set(key, {
          value,
          expiresAt: Date.now() + CACHE_TTL.DEFAULT_SECONDS * 1000,
        }),
      ),
    );
  }
}
