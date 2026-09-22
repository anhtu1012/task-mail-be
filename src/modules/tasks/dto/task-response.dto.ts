import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskCategory } from '../../../common/enums/task-category.enum';
import { CardRepeatDto } from '../../board/dto/board-response.dto';
import { UserSummaryDto } from '../../users/dto/user-response.dto';
import { ItemKind } from '../../../common/enums/item-kind.enum';

export type DeadlineStatus = 'IN_PROGRESS' | 'ON_TIME' | 'LATE';

export class TaskResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Dự án chứa việc này' })
  projectId: string;

  @ApiProperty({ description: 'Mã hiển thị, ví dụ TSK-000123' })
  code: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiPropertyOptional()
  taskTypeId?: string | null;

  @ApiProperty({ enum: TaskCategory })
  category: TaskCategory;

  @ApiProperty({ enum: TaskPriority })
  priority: TaskPriority;

  @ApiProperty({ enum: TaskStatus })
  status: TaskStatus;

  @ApiProperty({ description: "'Trễ deadline' — tính toán, không lưu DB" })
  deadlineStatus: DeadlineStatus;

  @ApiProperty()
  assigneeId: string;

  /**
   * Người thực hiện ở dạng đọc được.
   *
   * Có vì `assigneeId` là một UUID: màn chi tiết trước đây in nguyên chuỗi 36
   * ký tự đó ra cho người dùng đọc. `email` là thứ duy nhất nhận diện được —
   * bảng `users` không có cột tên.
   */
  @ApiPropertyOptional({ type: UserSummaryDto })
  assignee?: UserSummaryDto | null;

  @ApiPropertyOptional()
  creatorId?: string | null;

  @ApiPropertyOptional({ type: UserSummaryDto, description: 'Người tạo việc' })
  creator?: UserSummaryDto | null;

  @ApiPropertyOptional()
  assignedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Hạn chót — chỉ có nghĩa với kind=TASK' })
  deadline?: Date | null;

  /**
   * Loại bản ghi. TASK dùng `deadline`; EVENT dùng `startAt`..`endAt`.
   * Xem ghi chú ở model Task của Prisma.
   */
  @ApiProperty({ enum: ItemKind })
  kind: ItemKind;

  @ApiPropertyOptional({ description: 'Chỉ có với kind=EVENT' })
  startAt?: Date | null;

  @ApiPropertyOptional({ description: 'Chỉ có với kind=EVENT' })
  endAt?: Date | null;

  @ApiProperty({ description: 'Sự kiện cả ngày' })
  allDay: boolean;

  @ApiPropertyOptional()
  completedAt?: Date | null;

  @ApiProperty({ description: 'Link hoặc file đính kèm', type: [String] })
  attachments: string[];

  @ApiPropertyOptional({
    description: 'Hộp mail đã tạo ra task này (nếu tạo tự động từ email)',
  })
  sourceMailAccountId?: string | null;

  /**
   * Ba trường dưới đây vốn chỉ có ở API bảng (`CardSummary`), nên các màn cũ
   * đọc `/tasks` — Lịch, Kanban, Công việc — không có cách nào biết một việc
   * có lặp lại, mất bao lâu hay mang nhãn gì. Cùng một việc mà hai màn hiện
   * hai lượng thông tin khác nhau là thứ người dùng thấy ngay.
   */
  @ApiPropertyOptional({ type: CardRepeatDto, description: 'null = không lặp' })
  repeat: CardRepeatDto | null;

  @ApiPropertyOptional({ description: 'Thời lượng dự kiến (phút)' })
  estimateMinutes?: number | null;

  @ApiProperty({ description: 'Nhãn đang gắn', type: [String] })
  labelIds: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedTaskResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  items: TaskResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
