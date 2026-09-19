import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CardRepeatDtoInput } from '../../board/dto/board-request.dto';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskCategory } from '../../../common/enums/task-category.enum';

export class CreateTaskDto {
  @ApiProperty({ example: 'Chỉnh sửa KPI tháng 07.2026' })
  @IsString()
  title: string;

  /**
   * Dự án **của người được giao**, không phải của người tạo. Bỏ trống thì rơi
   * vào dự án mặc định của người đó.
   *
   * Trên `PATCH /tasks/:id`, gửi giá trị khác là chuyển việc sang dự án mới:
   * việc về Hộp thư đến của dự án đó và mất hết nhãn cũ (nhãn thuộc bảng).
   */
  @ApiPropertyOptional({ description: 'Bỏ trống = dự án mặc định' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Link tài liệu hoặc mô tả nhiệm vụ cần thực hiện',
  })
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

  @ApiPropertyOptional({
    description: 'Chỉ ADMIN/SUPER_ADMIN mới được gán cho người khác',
  })
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

  @ApiPropertyOptional({
    description: 'Link hoặc file đính kèm',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @ApiPropertyOptional({ description: 'CSS gradient hoặc URL ảnh bìa' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cover?: string;

  @ApiPropertyOptional({ description: 'Thời lượng dự kiến, phút' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimateMinutes?: number;

  @ApiPropertyOptional({
    type: CardRepeatDtoInput,
    description: 'null = việc một lần',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CardRepeatDtoInput)
  repeat?: CardRepeatDtoInput | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Nhãn của bảng — thay thế toàn bộ nhãn hiện có của việc',
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  labelIds?: string[];
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
  @ApiPropertyOptional({
    description:
      'Chỉ trả việc thuộc dự án này. Bỏ trống = mọi dự án (tương thích ngược)',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

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

  @ApiPropertyOptional({
    description: 'Chỉ ADMIN/SUPER_ADMIN mới được lọc theo người khác',
  })
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
  @ApiPropertyOptional({
    description: 'Bỏ trống = thống kê cả tài khoản, không tách theo dự án',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ ADMIN/SUPER_ADMIN mới được xem thống kê của người khác',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
