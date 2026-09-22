import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { DEFAULT_TIMEZONE } from '../../common/constants/board.constants';
import { TimezoneUtil } from '../../common/utils/timezone.util';
import {
  UserRepository,
  CreateUserInput,
} from './repositories/user.repository';
import { UserSummaryDto } from './dto/user-response.dto';

/**
 * Múi giờ của một người gần như không bao giờ đổi, nhưng nó bị đọc ở **mọi**
 * endpoint bảng — mà mỗi lần đọc là một vòng mạng tới Singapore.
 *
 * 5 phút đủ ngắn để một lần đổi múi giờ có hiệu lực ngay trong phiên làm việc,
 * và đủ dài để xoá hẳn truy vấn này khỏi đường nóng. Cache nằm trong bộ nhớ
 * tiến trình: nhiều instance sẽ lệch nhau tối đa 5 phút, chấp nhận được với một
 * giá trị chỉ dùng để cắt mốc ngày.
 */
const TIMEZONE_CACHE_TTL_MS = 5 * 60_000;

@Injectable()
export class UsersService {
  private readonly timezoneCache = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(private readonly userRepository: UserRepository) {}

  /** Người có thể được giao việc — xem `UsersController.findAssignable` */
  findAssignable(): Promise<UserSummaryDto[]> {
    return this.userRepository.findAssignable();
  }

  /**
   * The zone every wall-clock time for this user must be read and written in.
   *
   * Background jobs (mail ingestion, Zalo reminders) have no request to take a
   * `?tz=` from, so they rely on this. Never fall back to the server's own
   * clock: the container runs UTC while users are on GMT+7.
   */
  async resolveTimezone(userId: string, requested?: string): Promise<string> {
    if (requested && TimezoneUtil.isValid(requested)) return requested;

    const cached = this.timezoneCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    // `select` chỉ lấy cột cần: dòng `users` đầy đủ kéo theo cả `password_hash`
    // và token Google cho một giá trị dài 20 ký tự.
    const timezone = await this.userRepository.findTimezone(userId);
    const resolved =
      timezone && TimezoneUtil.isValid(timezone) ? timezone : DEFAULT_TIMEZONE;

    this.timezoneCache.set(userId, {
      value: resolved,
      expiresAt: Date.now() + TIMEZONE_CACHE_TTL_MS,
    });
    return resolved;
  }

  /** Gọi khi múi giờ của người dùng thay đổi, để lần đọc sau không lấy bản cũ. */
  invalidateTimezone(userId: string): void {
    this.timezoneCache.delete(userId);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findByGoogleId(googleId);
  }

  create(input: CreateUserInput): Promise<User> {
    return this.userRepository.create(input);
  }

  linkGoogleId(userId: string, googleId: string): Promise<User> {
    return this.userRepository.linkGoogleId(userId, googleId);
  }
}
