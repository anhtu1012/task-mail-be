import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ZaloBotService } from './zalo-bot.service';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';
import { TasksService } from '../tasks/tasks.service';
import { TASK_CREATED_EVENT } from '../tasks/events/task-created.event';
import type { TaskCreatedEvent } from '../tasks/events/task-created.event';
import { TaskResponseDto } from '../tasks/dto/task-response.dto';
import { ZaloConfig } from '../../config/zalo.config';
import { GoogleOAuthConfig } from '../../config/google.config';

const MAX_DESCRIPTION_LENGTH = 1000;

function formatDeadline(deadline?: Date | null): string {
  return deadline ? new Date(deadline).toLocaleString('vi-VN') : 'không có';
}

function formatDescription(description?: string | null): string {
  const trimmed = description?.trim();
  if (!trimmed) return '(không có mô tả)';
  return trimmed.length > MAX_DESCRIPTION_LENGTH
    ? `${trimmed.slice(0, MAX_DESCRIPTION_LENGTH)}…`
    : trimmed;
}

function formatNewTaskMessage(
  task: TaskCreatedEvent,
  tasksUrl?: string,
): string {
  return [
    '🔔 Bạn được giao task mới:',
    task.title,
    `Ưu tiên: ${task.priority}`,
    `Deadline: ${formatDeadline(task.deadline)}`,
    '',
    'Mô tả:',
    formatDescription(task.description),
    ...(tasksUrl ? ['', `Xem task tại: ${tasksUrl}`] : []),
  ].join('\n');
}

function formatDeadlineMessage(task: TaskResponseDto): string {
  return [
    `⏰ Task "${task.title}" sắp đến hạn`,
    `Deadline: ${formatDeadline(task.deadline)}`,
  ].join('\n');
}

@Injectable()
export class ZaloNotificationListener {
  private readonly logger = new Logger(ZaloNotificationListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly zaloBotService: ZaloBotService,
    private readonly zaloAccountRepository: ZaloAccountRepository,
    private readonly tasksService: TasksService,
  ) {}

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
      const { frontendUrl } =
        this.configService.getOrThrow<GoogleOAuthConfig>('googleOAuth');
      const tasksUrl = frontendUrl
        ? new URL('/tasks', frontendUrl).toString()
        : undefined;
      await this.zaloBotService.sendTextMessage(
        account.zaloUserId,
        formatNewTaskMessage(task, tasksUrl),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send new-task Zalo notification for task ${task.id}`,
        error as Error,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async remindApproachingDeadlines(): Promise<void> {
    const hours =
      this.configService.getOrThrow<ZaloConfig>('zalo').deadlineReminderHours;
    const dueTasks = await this.tasksService.findApproachingDeadline(hours);

    for (const task of dueTasks) {
      try {
        const account = await this.zaloAccountRepository.findByUserId(
          task.assigneeId,
        );
        if (account) {
          await this.zaloBotService.sendTextMessage(
            account.zaloUserId,
            formatDeadlineMessage(task),
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to send deadline reminder for task ${task.id}`,
          error as Error,
        );
      } finally {
        // Mark notified even on send failure — avoids retry-storming a task whose
        // recipient's link is broken; the reminder is inherently best-effort.
        await this.tasksService.markDeadlineNotified(task.id);
      }
    }
  }
}
