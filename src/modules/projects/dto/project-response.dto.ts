import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROJECT_ICONS } from '../project.constants';

export class ProjectStatsDto {
  @ApiProperty({ description: 'Tổng số việc chưa bị xoá mềm' })
  totalTasks: number;

  @ApiProperty({ description: 'status NOT IN (DONE, CANCELLED)' })
  openTasks: number;

  @ApiProperty({ description: 'openTasks và deadline đã qua' })
  overdueTasks: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'max(updatedAt) của việc trong dự án; null khi chưa có việc',
  })
  lastActivityAt: Date | null;
}

export class ProjectDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'CTY' }) code: string;
  @ApiProperty({ example: 'Công việc công ty' }) name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiProperty({ example: '#0a436d' }) color: string;
  @ApiProperty({ enum: PROJECT_ICONS }) icon: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() archived: boolean;
  @ApiProperty({ type: ProjectStatsDto }) stats: ProjectStatsDto;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class ProjectListDto {
  @ApiProperty({ type: [ProjectDto] }) items: ProjectDto[];
  @ApiProperty() total: number;
}
