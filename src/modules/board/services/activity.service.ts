import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction } from '../../../generated/prisma/enums';
import { DEFAULT_TIMEZONE } from '../../../common/constants/board.constants';
import { CardDetailRepository } from '../repositories/card-detail.repository';

const INBOX_LABEL = 'Hộp thư đến';

/**
 * The activity log is written in the first person with the subject dropped —
 * the actor is always the board owner, so there is no `actorId` to render.
 *
 * Sentences are frozen at write time, list names included. Rendering them on
 * the client would rewrite history every time a list is renamed: an entry that
 * read "Chuyển sang Đang làm" would silently become "Chuyển sang Tuần này".
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly repository: CardDetailRepository) {}

  /** Never fails the request it decorates — a lost log line is not worth a 500. */
  async record(
    taskId: string,
    action: ActivityAction,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.repository.createActivity({
        taskId,
        action,
        message,
        metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được nhật ký cho việc ${taskId}: ${String(error)}`,
      );
    }
  }

  formatDateTime(date: Date, timeZone = DEFAULT_TIMEZONE): string {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  moved(fromList: string | null, toList: string | null): string {
    const from = fromList ?? INBOX_LABEL;
    const to = toList ?? INBOX_LABEL;
    return `Chuyển từ ${from} sang ${to}`;
  }

  created(listTitle: string | null, fromInbox: boolean): string {
    if (fromInbox) return 'Tạo tự động từ hộp thư đến';
    return listTitle ? `Tạo việc trong ${listTitle}` : 'Tạo việc';
  }

  snoozed(deadline: Date | null, timeZone: string): string {
    if (!deadline) return 'Bỏ hạn';
    return `Dời hạn sang ${this.formatDateTime(deadline, timeZone)}`;
  }

  dueChanged(deadline: Date | null, timeZone: string): string {
    if (!deadline) return 'Bỏ hạn';
    return `Đổi hạn sang ${this.formatDateTime(deadline, timeZone)}`;
  }

  checklistItemChecked(content: string): string {
    return `Hoàn thành mục “${content}”`;
  }

  attachmentAdded(name: string): string {
    return `Thêm đính kèm ${name}`;
  }
}
