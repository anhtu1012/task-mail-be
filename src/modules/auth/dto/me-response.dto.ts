import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';

export class MeResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9abc-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;
}
