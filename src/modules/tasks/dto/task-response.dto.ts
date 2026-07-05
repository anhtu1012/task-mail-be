import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskCategory } from '../../../common/enums/task-category.enum';

export type DeadlineStatus = 'IN_PROGRESS' | 'ON_TIME' | 'LATE';

export class TaskResponseDto {
  @ApiProperty()
  id: string;

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

  @ApiPropertyOptional()
  creatorId?: string | null;

  @ApiPropertyOptional()
  assignedAt?: Date | null;

  @ApiPropertyOptional()
  deadline?: Date | null;

  @ApiPropertyOptional()
  completedAt?: Date | null;

  @ApiProperty({ description: 'Link hoặc file đính kèm', type: [String] })
  attachments: string[];

  @ApiPropertyOptional({ description: 'Hộp mail đã tạo ra task này (nếu tạo tự động từ email)' })
  sourceMailAccountId?: string | null;

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
