import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateTaskTypeDto {
  @ApiProperty({ example: 'BÁO CÁO' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: '#93C47D',
    description: 'Hex color used to render the tag',
  })
  @IsString()
  @Matches(/^#([0-9A-Fa-f]{3}){1,2}$/, {
    message: 'color must be a hex value like #93C47D',
  })
  color: string;
}

export class UpdateTaskTypeDto extends PartialType(CreateTaskTypeDto) {}
