import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PROJECT_CODE_MAX_LENGTH,
  PROJECT_CODE_MIN_LENGTH,
  PROJECT_CODE_PATTERN,
  PROJECT_COLOR_PATTERN,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_ICONS,
  PROJECT_NAME_MAX_LENGTH,
} from '../project.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** `"kha"` → `"KHA"`. FE gửi chữ thường cũng phải nhận (§3.2). */
const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateProjectDto {
  @ApiProperty({ example: 'Khách hàng A — website' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    example: 'KHA',
    description: 'Bỏ trống thì backend sinh từ `name`. Chữ thường được tự hoa.',
  })
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MinLength(PROJECT_CODE_MIN_LENGTH)
  @MaxLength(PROJECT_CODE_MAX_LENGTH)
  @Matches(PROJECT_CODE_PATTERN, {
    message: 'code chỉ gồm chữ HOA và số, dài 2–8 ký tự',
  })
  code?: string;

  @ApiPropertyOptional({ description: 'Chuỗi rỗng = xoá mô tả' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ example: '#0ea5e9' })
  @IsOptional()
  @Matches(PROJECT_COLOR_PATTERN, { message: 'color phải có dạng #rrggbb' })
  color?: string;

  @ApiPropertyOptional({ enum: PROJECT_ICONS })
  @IsOptional()
  @IsIn(PROJECT_ICONS as readonly string[], {
    message: `icon phải là một trong: ${PROJECT_ICONS.join(', ')}`,
  })
  icon?: string;

  @ApiPropertyOptional({
    description:
      'Dự án đầu tiên của một người luôn là mặc định, bất kể giá trị này',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * Không dùng `PartialType(CreateProjectDto)`: `archived` chỉ có ở đây, và
 * `PATCH` cố tình **không** nhận `isDefault` — đặt mặc định là thao tác chạm
 * vào bản ghi khác nên nó có endpoint riêng (§4.5).
 */
export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MinLength(PROJECT_CODE_MIN_LENGTH)
  @MaxLength(PROJECT_CODE_MAX_LENGTH)
  @Matches(PROJECT_CODE_PATTERN, {
    message: 'code chỉ gồm chữ HOA và số, dài 2–8 ký tự',
  })
  code?: string;

  @ApiPropertyOptional({ description: 'Chuỗi rỗng = xoá mô tả (lưu null)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PROJECT_COLOR_PATTERN, { message: 'color phải có dạng #rrggbb' })
  color?: string;

  @ApiPropertyOptional({ enum: PROJECT_ICONS })
  @IsOptional()
  @IsIn(PROJECT_ICONS as readonly string[], {
    message: `icon phải là một trong: ${PROJECT_ICONS.join(', ')}`,
  })
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ArchiveProjectDto {
  @ApiProperty({ description: 'false = mở lại dự án đã lưu trữ' })
  @IsBoolean()
  archived: boolean;
}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  // Đọc `obj` chứ không đọc `value`: `enableImplicitConversion` đã ép chuỗi về
  // Boolean trước khi tới đây, mà `Boolean('false')` là `true`.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj?.includeArchived;
    return raw === 'true' || raw === '1' || raw === true;
  })
  @IsBoolean()
  includeArchived?: boolean;
}
