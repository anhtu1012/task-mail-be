import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskCategory } from '../../../common/enums/task-category.enum';

export class CreateTaskDto {
  @ApiProperty({ example: 'Chỉnh sửa KPI tháng 07.2026' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Link tài liệu hoặc mô tả nhiệm vụ cần thực hiện' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  taskTypeId?: string;

  @ApiPropertyOptional({ enum: TaskCategory, default: TaskCategory.WORK })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.NORMAL })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Chỉ ADMIN/SUPER_ADMIN mới được gán cho người khác' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: 'Link hoặc file đính kèm', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class QueryTaskDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  taskTypeId?: string;

  @ApiPropertyOptional({ description: 'Lọc task theo hộp mail đã tạo ra nó' })
  @IsOptional()
  @IsUUID()
  sourceMailAccountId?: string;

  @ApiPropertyOptional({ description: 'Chỉ ADMIN/SUPER_ADMIN mới được lọc theo người khác' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Lọc deadline từ ngày (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Lọc deadline đến ngày (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TaskStatsQueryDto {
  @ApiPropertyOptional({ description: 'Chỉ ADMIN/SUPER_ADMIN mới được xem thống kê của người khác' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
