import { ApiProperty } from '@nestjs/swagger';
import { MailProvider } from '../../../common/enums/mail-provider.enum';

export class MailAccountResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: MailProvider })
  provider: MailProvider;

  @ApiProperty()
  email: string;

  @ApiProperty()
  createdAt: Date;
}

export class ConnectUrlResponseDto {
  @ApiProperty({ description: 'Mở URL này trong trình duyệt để đăng nhập và cấp quyền Gmail' })
  url: string;
}
