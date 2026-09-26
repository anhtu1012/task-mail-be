import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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
}

export class ZaloBroadcastResponseDto {
  @ApiProperty({ description: 'Số người nhận dự kiến' })
  total: number;

  @ApiProperty()
  sent: number;

  @ApiProperty()
  failed: number;
}
