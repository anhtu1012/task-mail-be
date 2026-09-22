import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCategory } from '../../../common/enums/task-category.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import type { DeadlineStatus } from '../../../common/utils/deadline.util';

export type CardSource = 'EMAIL' | 'ZALO' | 'MANUAL';

export class BoardDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() starred: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class TaskListDto {
  @ApiProperty() id: string;
  @ApiProperty() boardId: string;
  @ApiProperty() title: string;
  @ApiProperty() position: number;
  @ApiProperty() archived: boolean;
  @ApiPropertyOptional() wipLimit: number | null;
  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Kéo thẻ vào danh sách này thì status của task đổi theo',
  })
  mapsToStatus: TaskStatus | null;
  @ApiProperty() createdAt: Date;
}

export class BoardLabelDto {
  @ApiProperty() id: string;
  @ApiProperty() boardId: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: '#e63946' }) color: string;
  @ApiPropertyOptional({
    description: 'Tên icon trong danh sách đóng LABEL_ICONS. null = chỉ có màu',
    example: 'tag',
  })
  icon: string | null;
  @ApiProperty({ description: 'Không dấu, cho quick-add "#baogia"' })
  slug: string;
}

export class CardRepeatDto {
  @ApiProperty({ enum: ['DAY', 'WEEK', 'MONTH'] }) unit: string;
  @ApiProperty() interval: number;
  @ApiProperty({
    type: [Number],
    description:
      '0=CN..6=T7. Chỉ dùng cho WEEK. Rỗng = giữ thứ của hạn hiện tại',
    example: [1, 4],
  })
  weekdays: number[];
  @ApiPropertyOptional({
    description:
      '1..31, chỉ dùng cho MONTH. Tháng ngắn hơn thì kẹp về cuối tháng',
  })
  dayOfMonth: number | null;
  @ApiPropertyOptional({ description: 'Không sinh lượt nào vượt mốc này' })
  until: Date | null;
  @ApiPropertyOptional({
    description: 'Số lượt còn lại SAU lượt này. null = lặp mãi',
  })
  remaining: number | null;
}

/** Rút gọn — đủ để vẽ thẻ trên bảng, không kèm quan hệ con. */
export class CardSummaryDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ description: 'null = đang ở Hộp thư đến' })
  listId: string | null;
  @ApiPropertyOptional() boardId: string | null;
  @ApiProperty({ example: 'TSK-000210' }) code: string;
  @ApiProperty() title: string;
  @ApiProperty() position: number;
  @ApiProperty({ type: [String] }) labelIds: string[];
  @ApiProperty({ enum: TaskPriority }) priority: TaskPriority;
  @ApiProperty({ enum: TaskCategory }) category: TaskCategory;
  @ApiProperty({ enum: TaskStatus }) status: TaskStatus;
  @ApiPropertyOptional() deadline: Date | null;
  @ApiProperty() deadlineStatus: DeadlineStatus;
  @ApiPropertyOptional() completedAt: Date | null;
  @ApiPropertyOptional() estimateMinutes: number | null;
  @ApiPropertyOptional({ type: CardRepeatDto }) repeat: CardRepeatDto | null;
  @ApiProperty({ enum: ['EMAIL', 'ZALO', 'MANUAL'] }) source: CardSource;
  @ApiPropertyOptional() cover: string | null;

  // Trường dẫn xuất — backend tính sẵn để frontend khỏi tải quan hệ con.
  @ApiProperty() hasDescription: boolean;
  @ApiProperty() attachmentCount: number;
  @ApiProperty() noteCount: number;
  @ApiProperty() checklistDone: number;
  @ApiProperty() checklistTotal: number;
}

export class TodayMetricsDto {
  @ApiProperty({ description: 'Chưa xong và đã quá hạn' }) overdue: number;
  @ApiProperty({ description: 'Chưa xong, đến hạn trong hôm nay' })
  dueToday: number;
  @ApiProperty({ description: 'completedAt rơi vào hôm nay' })
  doneToday: number;
  @ApiProperty({ description: 'Tổng estimateMinutes của nhóm dueToday' })
  plannedMinutes: number;
}

export class BoardFullResponseDto {
  @ApiProperty({ type: BoardDto }) board: BoardDto;
  @ApiProperty({ type: [TaskListDto] }) lists: TaskListDto[];
  @ApiProperty({ type: [BoardLabelDto] }) labels: BoardLabelDto[];
  @ApiProperty({ type: [CardSummaryDto] }) cards: CardSummaryDto[];
  @ApiProperty({
    description: 'Tổng số thẻ thật mỗi cột, khoá "inbox" cho listId = null',
    example: { '9f1c…': 42, inbox: 7 },
  })
  cardCounts: Record<string, number>;
  @ApiProperty({ type: TodayMetricsDto }) today: TodayMetricsDto;
}

export class CardPageDto {
  @ApiProperty({ type: [CardSummaryDto] }) items: CardSummaryDto[];
  @ApiPropertyOptional({
    description: 'position của thẻ cuối đã trả; null = hết',
  })
  nextCursor: number | null;
  @ApiProperty() total: number;
}

export class MoveCardResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() listId: string | null;
  @ApiProperty({ description: 'Giá trị backend thật sự đã ghi' })
  position: number;
  @ApiProperty({ enum: TaskStatus }) status: TaskStatus;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional({
    description: 'Cảnh báo WIP — không chặn thao tác',
    example: 'LIST_WIP_EXCEEDED',
  })
  warning?: string;
}

export class PositionDto {
  @ApiProperty() id: string;
  @ApiProperty() position: number;
}

export class ChecklistItemDto {
  @ApiProperty() id: string;
  @ApiProperty() checklistId: string;
  @ApiProperty() content: string;
  @ApiProperty() checked: boolean;
  @ApiProperty() position: number;
  @ApiPropertyOptional() checkedAt: Date | null;
}

export class ChecklistDto {
  @ApiProperty() id: string;
  @ApiProperty() taskId: string;
  @ApiProperty() title: string;
  @ApiProperty() position: number;
  @ApiProperty({ type: [ChecklistItemDto] }) items: ChecklistItemDto[];
}

export class TaskNoteDto {
  @ApiProperty() id: string;
  @ApiProperty() taskId: string;
  @ApiProperty() content: string;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() editedAt: Date | null;
}

export class TaskAttachmentDto {
  @ApiProperty() id: string;
  @ApiProperty() taskId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['IMAGE', 'FILE', 'LINK'] }) kind: string;
  @ApiProperty() url: string;
  @ApiPropertyOptional() sizeBytes: number | null;
  @ApiProperty() isCover: boolean;
  @ApiProperty() createdAt: Date;
}

export class TaskActivityDto {
  @ApiProperty() id: string;
  @ApiProperty() taskId: string;
  @ApiProperty() action: string;
  @ApiProperty({
    description: 'Câu tiếng Việt render sẵn — frontend hiển thị nguyên văn',
    example: 'Chuyển từ Hôm nay sang Đang làm',
  })
  message: string;
  @ApiProperty() createdAt: Date;
}

export class CardDetailDto extends CardSummaryDto {
  @ApiPropertyOptional({ description: 'HTML đã làm sạch' })
  description: string | null;
  @ApiPropertyOptional() note: string | null;
  @ApiPropertyOptional() taskTypeId: string | null;
  @ApiProperty({ type: [String] }) attachmentLinks: string[];
  @ApiProperty({ type: [ChecklistDto] }) checklists: ChecklistDto[];
  @ApiProperty({ type: [TaskAttachmentDto] }) attachments: TaskAttachmentDto[];
  @ApiProperty({ type: [TaskNoteDto] }) notes: TaskNoteDto[];
  @ApiProperty({ type: [TaskActivityDto] }) activities: TaskActivityDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class AgendaResponseDto {
  @ApiProperty({ example: '2026-09-15' }) date: string;
  @ApiProperty({
    type: [CardSummaryDto],
    description: 'Quá hạn — trả hết, không phân trang',
  })
  overdue: CardSummaryDto[];
  @ApiProperty({
    type: [CardSummaryDto],
    description: 'Đến hạn trong ngày, KHÔNG gồm quá hạn',
  })
  dueToday: CardSummaryDto[];
  @ApiProperty() plannedMinutes: number;
  @ApiProperty() doneToday: number;
}

export class SearchResponseDto {
  @ApiProperty({ type: [CardSummaryDto] }) items: CardSummaryDto[];
  @ApiProperty() total: number;
}

export class CompleteCardResponseDto {
  @ApiProperty({ type: CardSummaryDto }) completed: CardSummaryDto;
  @ApiPropertyOptional({
    type: CardSummaryDto,
    description: 'Thẻ lặp vừa sinh; null nếu thẻ không lặp',
  })
  next: CardSummaryDto | null;
}
