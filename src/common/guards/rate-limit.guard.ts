import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { JwtAccessPayload } from '../types/jwt-payload.type';

/**
 * Đếm theo **người dùng** khi đã đăng nhập, theo IP khi chưa.
 *
 * Đếm theo IP cho mọi route thì cả văn phòng ngồi sau một IP NAT chia nhau
 * một hạn mức 20 req/phút — vài người mở bảng cùng lúc là đủ ăn 429. IP chỉ
 * còn ý nghĩa ở route Public (đăng nhập, đăng ký…), nơi chưa biết ai là ai.
 *
 * Dựa vào thứ tự APP_GUARD trong `app.module.ts`: `JwtAuthGuard` chạy trước
 * nên `req.user` đã có ở đây (route Public thì không có → rơi về IP).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as JwtAccessPayload | undefined;
    if (user?.sub) return Promise.resolve(`user:${user.sub}`);
    return Promise.resolve(`ip:${req.ip as string}`);
  }
}
