import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Matches,
} from 'class-validator';
import {
  DIGEST_TIME_PATTERN,
  MAX_REMINDER_OFFSETS,
  REMINDER_OFFSET_CHOICES,
} from '../notification.constants';

/** Body của `PUT /me/preferences/notifications` — gửi đủ cả bốn trường. */
export class UpdateNotificationPreferenceDto {
  @ApiProperty({
    example: true,
    description: 'Nhắn Zalo khi được giao việc mới',
  })
  @IsBoolean()
  newTaskEnabled: boolean;

  @ApiProperty({
    example: [1440, 60],
    type: [Number],
    description:
      `Các mốc nhắc trước hạn (phút), tối đa ${MAX_REMINDER_OFFSETS}. ` +
      `Giá trị hợp lệ: ${REMINDER_OFFSET_CHOICES.join(', ')}. [] = tắt nhắc hạn.`,
  })
  @IsArray()
  @ArrayMaxSize(MAX_REMINDER_OFFSETS)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsIn(REMINDER_OFFSET_CHOICES, {
    each: true,
    message: `reminderOffsets chỉ nhận ${REMINDER_OFFSET_CHOICES.join(', ')}`,
  })
  reminderOffsets: number[];

  @ApiProperty({ example: false, description: 'Tóm tắt hằng ngày' })
  @IsBoolean()
  digestEnabled: boolean;

  @ApiProperty({
    example: '08:00',
    description:
      'Giờ gửi tóm tắt (giờ địa phương), HH:mm, phút là bội số của 5',
  })
  @Matches(DIGEST_TIME_PATTERN, {
    message: 'digestTime phải có dạng HH:mm, phút là bội số của 5',
  })
  digestTime: string;
}

export type NotificationPreferenceSource = 'user' | 'default';

export class NotificationPreferenceDto {
  @ApiProperty() newTaskEnabled: boolean;

  @ApiProperty({ type: [Number], description: 'Tăng dần' })
  reminderOffsets: number[];

  @ApiProperty() digestEnabled: boolean;

  @ApiProperty({ example: '08:00' }) digestTime: string;

  @ApiProperty({
    enum: ['user', 'default'],
    description: '"default" = chưa từng lưu, đang trả mặc định hệ thống',
  })
  source: NotificationPreferenceSource;

  @ApiPropertyOptional({ nullable: true }) updatedAt: Date | null;
}
