import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UserNotificationPreference } from '../../../generated/prisma/client';

export type NotificationPreferenceValues = {
  newTaskEnabled: boolean;
  reminderOffsets: number[];
  digestEnabled: boolean;
  digestMinute: number;
};

/** Người bật tóm tắt, kèm đủ thứ để cron gửi mà không phải hỏi DB thêm. */
export type DigestSubscriber = UserNotificationPreference & {
  user: { timezone: string | null; zaloAccount: { zaloUserId: string } | null };
};

@Injectable()
export class NotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<UserNotificationPreference | null> {
    return this.prisma.userNotificationPreference.findUnique({
      where: { userId },
    });
  }

  findByUsers(userIds: string[]): Promise<UserNotificationPreference[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.userNotificationPreference.findMany({
      where: { userId: { in: userIds } },
    });
  }

  upsert(
    userId: string,
    values: NotificationPreferenceValues,
  ): Promise<UserNotificationPreference> {
    return this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...values },
      update: values,
    });
  }

  /** Chỉ người đã liên kết Zalo — không có kênh thì không có gì để gửi. */
  findDigestSubscribers(): Promise<DigestSubscriber[]> {
    return this.prisma.userNotificationPreference.findMany({
      where: { digestEnabled: true, user: { zaloAccount: { isNot: null } } },
      include: {
        user: {
          select: {
            timezone: true,
            zaloAccount: { select: { zaloUserId: true } },
          },
        },
      },
    });
  }

  async markDigestSent(userId: string, dateKey: string): Promise<void> {
    await this.prisma.userNotificationPreference.update({
      where: { userId },
      data: { digestLastSentOn: dateKey },
    });
  }
}
