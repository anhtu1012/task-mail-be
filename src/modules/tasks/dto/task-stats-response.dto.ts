import { ApiProperty } from '@nestjs/swagger';

export class TaskStatsResponseDto {
  @ApiProperty({ description: 'Tổng số task đã hoàn thành (mọi thời điểm)' })
  totalCompleted: number;

  @ApiProperty({ description: 'Số task hoàn thành trong tháng hiện tại' })
  completedInMonth: number;

  @ApiProperty({
    description: '% task đã hoàn thành trên tổng số task được giao',
  })
  completionRate: number;

  @ApiProperty({ description: '% task hoàn thành đúng hạn (mọi thời điểm)' })
  performance: number;

  @ApiProperty({
    description: '% task hoàn thành đúng hạn trong tháng hiện tại',
  })
  performanceMonth: number;
}
