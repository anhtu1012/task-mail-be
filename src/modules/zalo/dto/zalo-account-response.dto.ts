import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ZaloLinkCodeResponseDto {
  @ApiProperty({ description: 'Mã 6 số — kết bạn với bot rồi nhắn mã này để hoàn tất liên kết' })
  code: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ description: 'Link Zalo của bot để kết bạn trước khi nhắn mã' })
  botProfileUrl: string;
}

export class ZaloAccountStatusResponseDto {
  @ApiProperty()
  linked: boolean;

  @ApiPropertyOptional()
  linkedAt?: Date;
}
