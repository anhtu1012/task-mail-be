import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Zalo Bot API giới hạn nội dung sendMessage ở 2000 ký tự.
export const ZALO_MESSAGE_MAX_LENGTH = 2000;

export class ZaloBroadcastDto {
  @ApiProperty({
    description: 'Nội dung tin nhắn gửi cho mọi user đã liên kết Zalo',
    maxLength: ZALO_MESSAGE_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ZALO_MESSAGE_MAX_LENGTH)
  message: string;

  @ApiPropertyOptional({
    description: 'true = chỉ gửi thử cho Zalo của chính admin đang thao tác',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  testOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Chỉ gửi cho các user này (phải đã liên kết Zalo). Bỏ trống = gửi tất cả',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  userIds?: string[];
}

export class ZaloRecipientDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  linkedAt: Date;
}

export class ZaloBroadcastResponseDto {
  @ApiProperty({ description: 'Số người nhận dự kiến' })
  total: number;

  @ApiProperty()
  sent: number;

  @ApiProperty()
  failed: number;
}
