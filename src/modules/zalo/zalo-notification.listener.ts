import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ZaloBotService } from './zalo-bot.service';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { TASK_CREATED_EVENT } from '../tasks/events/task-created.event';
import type { TaskCreatedEvent } from '../tasks/events/task-created.event';
import { TaskResponseDto } from '../tasks/dto/task-response.dto';
import { ZaloConfig } from '../../config/zalo.config';
import { GoogleOAuthConfig } from '../../config/google.config';
import { RichTextUtil } from '../../common/utils/rich-text.util';
import { TimezoneUtil } from '../../common/utils/timezone.util';
import { NotificationPreferenceService } from '../preferences/services/notification-preference.service';
import {
  DIGEST_MAX_ITEMS,
  DIGEST_SEND_WINDOW_MINUTES,
  MAX_REMINDER_OFFSET,
} from '../preferences/notification.constants';
import { formatDuration, pickReminderOffset } from './reminder-schedule';

const MAX_DESCRIPTION_LENGTH = 1000;

/**
 * Always formatted in the recipient's zone. `toLocaleString('vi-VN')` without a
 * `timeZone` renders in the server's zone — UTC in the container — so the
 * message would show a time seven hours off what the user actually has.
 */
export function formatDeadline(
  deadline: Date | null | undefined,
  timeZone: string,
): string {
  if (!deadline) return 'không có';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(deadline));
}

function formatDescription(description?: string | null): string {
  // Task description là HTML từ Quill editor (xem `rich-text.util.ts`) — gửi
  // thẳng ra Zalo sẽ hiện nguyên thẻ <p>, <a>...
  const plain = RichTextUtil.toPlainText(description).trim();
  if (!plain) return '(không có mô tả)';
  return plain.length > MAX_DESCRIPTION_LENGTH
    ? `${plain.slice(0, MAX_DESCRIPTION_LENGTH)}…`
    : plain;
}

function formatNewTaskMessage(
  task: TaskCreatedEvent,
  timeZone: string,
  tasksUrl?: string,
): string {
  return [
    '🔔 Bạn được giao task mới:',
    task.title,
    `Ưu tiên: ${task.priority}`,
    `Deadline: ${formatDeadline(task.deadline, timeZone)}`,
    '',
    'Mô tả:',
    formatDescription(task.description),
    ...(tasksUrl ? ['', `Xem task tại: ${tasksUrl}`] : []),
  ].join('\n');
}

function formatDeadlineMessage(
  task: TaskResponseDto,
  timeZone: string,
  minutesLeft: number,
  tasksUrl?: string,
): string {
  return [
    `⏰ Task "${task.title}" sắp đến hạn — còn ${formatDuration(minutesLeft)}`,
    `Ưu tiên: ${task.priority}`,
    `Deadline: ${formatDeadline(task.deadline, timeZone)}`,
    '',
    'Mô tả:',
    formatDescription(task.description),
    ...(tasksUrl ? ['', `Xem task tại: ${tasksUrl}`] : []),
  ].join('\n');
}

/**
 * `HH:mm dd/MM` ghép tay: `vi-VN` không kèm năm cho ra "27-09" (ICU), trong khi
 * phần còn lại của tin nhắn dùng dấu gạch chéo.
 */
function formatShortDeadline(deadline: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(deadline);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}`;
}

function digestLine(task: TaskResponseDto, timeZone: string): string {
  const time = task.deadline
    ? formatShortDeadline(new Date(task.deadline), timeZone)
    : '';
  return `• ${task.code} ${task.title}${time ? ` (${time})` : ''}`;
}

function digestSection(
  heading: string,
  tasks: TaskResponseDto[],
  timeZone: string,
): string[] {
  if (tasks.length === 0) return [];
  const shown = tasks
    .slice(0, DIGEST_MAX_ITEMS)
    .map((t) => digestLine(t, timeZone));
  const more = tasks.length - shown.length;
  return [
    `${heading} (${tasks.length}):`,
    ...shown,
    ...(more > 0 ? [`… và ${more} việc khác`] : []),
    '',
  ];
}

export function formatDigestMessage(
  overdue: TaskResponseDto[],
  dueToday: TaskResponseDto[],
  timeZone: string,
  tasksUrl?: string,
): string {
  return [
    '☀️ Tóm tắt công việc hôm nay',
    '',
    ...digestSection('🔴 Quá hạn', overdue, timeZone),
    ...digestSection('📅 Đến hạn hôm nay', dueToday, timeZone),
    ...(tasksUrl ? [`Xem task tại: ${tasksUrl}`] : []),
  ]
    .join('\n')
    .trim();
}

/** Phút đã trôi qua trong ngày theo giờ địa phương (0..1439). */
function localMinuteOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

@Injectable()
export class ZaloNotificationListener {
  private readonly logger = new Logger(ZaloNotificationListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly zaloBotService: ZaloBotService,
    private readonly zaloAccountRepository: ZaloAccountRepository,
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
    private readonly notificationPreferences: NotificationPreferenceService,
  ) {}

  private tasksUrl(): string | undefined {
    const { frontendUrl } =
      this.configService.getOrThrow<GoogleOAuthConfig>('googleOAuth');
    return frontendUrl ? new URL('/tasks', frontendUrl).toString() : undefined;
  }

  @OnEvent(TASK_CREATED_EVENT)
  async handleTaskCreated(task: TaskCreatedEvent): Promise<void> {
    try {
      const account = await this.zaloAccountRepository.findByUserId(
        task.assigneeId,
      );
      if (!account) {
        this.logger.warn(
          `Skipped Zalo notification for task ${task.id}: assignee ${task.assigneeId} has no linked Zalo account`,
        );
        return;
      }
      const prefs = await this.notificationPreferences.resolve(task.assigneeId);
      if (!prefs.newTaskEnabled) return;

      const tasksUrl = this.tasksUrl();
      const timeZone = await this.usersService.resolveTimezone(task.assigneeId);
      await this.zaloBotService.sendTextMessage(
        account.zaloUserId,
        formatNewTaskMessage(task, timeZone, tasksUrl),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send new-task Zalo notification for task ${task.id}`,
        error as Error,
      );
    }
  }

  /**
   * Nhắc hạn theo các mốc người dùng tự chọn (xem `pickReminderOffset`).
   *
   * Quét mỗi 5 phút — mốc nhỏ nhất là 15 phút nên nhịp giờ cũ không còn đủ.
   * Chỉ kéo việc của người đã liên kết Zalo (chưa liên kết thì không đánh dấu
   * đã nhắc, để liên kết muộn vẫn được nhắc ở lượt sau).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async remindApproachingDeadlines(): Promise<void> {
    const fallbackHours =
      this.configService.getOrThrow<ZaloConfig>('zalo').deadlineReminderHours;
    const window = Math.max(MAX_REMINDER_OFFSET, fallbackHours * 60);
    const candidates = await this.tasksService.findReminderCandidates(window);
    if (candidates.length === 0) return;

    const prefs = await this.notificationPreferences.resolveMany(
      candidates.map((t) => t.assigneeId),
    );
    const tasksUrl = this.tasksUrl();
    const now = Date.now();

    for (const task of candidates) {
      if (!task.deadline) continue;
      const minutesLeft = (new Date(task.deadline).getTime() - now) / 60_000;
      const offset = pickReminderOffset(
        prefs.get(task.assigneeId)?.reminderOffsets ?? [],
        minutesLeft,
        task.remindedOffset,
      );
      if (offset === null) continue;

      const account = await this.zaloAccountRepository.findByUserId(
        task.assigneeId,
      );
      if (!account) continue;

      try {
        const timeZone = await this.usersService.resolveTimezone(
          task.assigneeId,
        );
        await this.zaloBotService.sendTextMessage(
          account.zaloUserId,
          formatDeadlineMessage(task, timeZone, minutesLeft, tasksUrl),
        );
      } catch (error) {
        this.logger.error(
          `Failed to send deadline reminder for task ${task.id}`,
          error as Error,
        );
      } finally {
        // Đánh dấu cả khi gửi lỗi — tránh nhắn dồn liên tục tới một liên kết
        // hỏng; nhắc hạn vốn là best-effort.
        await this.tasksService.markReminded(task.id, offset);
      }
    }
  }

  /**
   * Tóm tắt hằng ngày: gửi một lần mỗi ngày, trong vòng
   * `DIGEST_SEND_WINDOW_MINUTES` kể từ giờ người dùng hẹn (theo múi giờ của họ).
   * Không có việc quá hạn hay đến hạn hôm nay thì không nhắn, nhưng vẫn đánh
   * dấu đã xử lý ngày đó.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDailyDigests(): Promise<void> {
    const subscribers =
      await this.notificationPreferences.findDigestSubscribers();
    if (subscribers.length === 0) return;

    const tasksUrl = this.tasksUrl();
    const now = new Date();

    for (const sub of subscribers) {
      const zaloUserId = sub.user.zaloAccount?.zaloUserId;
      if (!zaloUserId) continue;

      const timeZone = await this.usersService.resolveTimezone(sub.userId);
      const today = TimezoneUtil.formatDateKey(now, timeZone);
      if (sub.digestLastSentOn === today) continue;

      const elapsed = localMinuteOfDay(now, timeZone) - sub.digestMinute;
      if (elapsed < 0 || elapsed >= DIGEST_SEND_WINDOW_MINUTES) continue;

      try {
        const { end } = TimezoneUtil.dayRange(timeZone, today, now);
        const open = await this.tasksService.findOpenWithDeadlineBefore(
          sub.userId,
          end,
        );
        const overdue = open.filter(
          (t) => t.deadline && new Date(t.deadline) < now,
        );
        const dueToday = open.filter(
          (t) => t.deadline && new Date(t.deadline) >= now,
        );
        if (overdue.length || dueToday.length) {
          await this.zaloBotService.sendTextMessage(
            zaloUserId,
            formatDigestMessage(overdue, dueToday, timeZone, tasksUrl),
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to send daily digest to user ${sub.userId}`,
          error as Error,
        );
      } finally {
        await this.notificationPreferences.markDigestSent(sub.userId, today);
      }
    }
  }
}
