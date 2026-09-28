import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserNotificationPreference } from '../../../generated/prisma/client';
import type { ZaloConfig } from '../../../config/zalo.config';
import {
  NotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from '../dto/notification-preference.dto';
import {
  DigestSubscriber,
  NotificationPreferenceRepository,
} from '../repositories/notification-preference.repository';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  minuteToTime,
  timeToMinute,
} from '../notification.constants';

/** Phần cấu hình mà các luồng gửi Zalo cần — đã điền sẵn mặc định. */
export type ResolvedNotificationPreference = {
  newTaskEnabled: boolean;
  /** Tăng dần; rỗng = tắt nhắc hạn */
  reminderOffsets: number[];
};

@Injectable()
export class NotificationPreferenceService {
  constructor(
    private readonly repository: NotificationPreferenceRepository,
    private readonly configService: ConfigService,
  ) {}

  /** Luôn 200 — chưa lưu thì trả mặc định kèm `source: "default"`, như theme. */
  async get(userId: string): Promise<NotificationPreferenceDto> {
    const saved = await this.repository.findByUser(userId);
    if (saved) return toDto(saved);
    return {
      newTaskEnabled: DEFAULT_NOTIFICATION_PREFERENCE.newTaskEnabled,
      reminderOffsets: this.defaultOffsets(),
      digestEnabled: DEFAULT_NOTIFICATION_PREFERENCE.digestEnabled,
      digestTime: minuteToTime(DEFAULT_NOTIFICATION_PREFERENCE.digestMinute),
      source: 'default',
      updatedAt: null,
    };
  }

  async put(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    const saved = await this.repository.upsert(userId, {
      newTaskEnabled: dto.newTaskEnabled,
      // Lưu tăng dần để cron tìm "mốc nhỏ nhất đã tới" chỉ bằng một lượt duyệt.
      reminderOffsets: [...dto.reminderOffsets].sort((a, b) => a - b),
      digestEnabled: dto.digestEnabled,
      digestMinute: timeToMinute(dto.digestTime),
    });
    return toDto(saved);
  }

  async resolve(userId: string): Promise<ResolvedNotificationPreference> {
    return (await this.resolveMany([userId])).get(userId)!;
  }

  /** Một truy vấn cho cả lô người nhận của một lượt cron. */
  async resolveMany(
    userIds: string[],
  ): Promise<Map<string, ResolvedNotificationPreference>> {
    const unique = [...new Set(userIds)];
    const rows = await this.repository.findByUsers(unique);
    const byUser = new Map(rows.map((row) => [row.userId, row]));
    const fallback = this.defaultOffsets();

    return new Map(
      unique.map((id) => {
        const row = byUser.get(id);
        return [
          id,
          row
            ? {
                newTaskEnabled: row.newTaskEnabled,
                reminderOffsets: [...row.reminderOffsets].sort((a, b) => a - b),
              }
            : {
                newTaskEnabled: DEFAULT_NOTIFICATION_PREFERENCE.newTaskEnabled,
                reminderOffsets: fallback,
              },
        ];
      }),
    );
  }

  findDigestSubscribers(): Promise<DigestSubscriber[]> {
    return this.repository.findDigestSubscribers();
  }

  markDigestSent(userId: string, dateKey: string): Promise<void> {
    return this.repository.markDigestSent(userId, dateKey);
  }

  /** Hành vi trước khi có tính năng này: một lần nhắc, trước `TASK_DEADLINE_REMINDER_HOURS`. */
  private defaultOffsets(): number[] {
    const hours =
      this.configService.getOrThrow<ZaloConfig>('zalo').deadlineReminderHours;
    return hours > 0 ? [Math.round(hours * 60)] : [];
  }
}

function toDto(row: UserNotificationPreference): NotificationPreferenceDto {
  return {
    newTaskEnabled: row.newTaskEnabled,
    reminderOffsets: [...row.reminderOffsets].sort((a, b) => a - b),
    digestEnabled: row.digestEnabled,
    digestTime: minuteToTime(row.digestMinute),
    source: 'user',
    updatedAt: row.updatedAt,
  };
}
