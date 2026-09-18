import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACCENT_PATTERN,
  BACKGROUND_ID_MAX_LENGTH,
  BACKGROUND_ID_PATTERN,
  DEFAULT_THEME,
  MAX_SURFACE_BLUR,
  MAX_SURFACE_OPACITY,
  MIN_SURFACE_BLUR,
  MIN_SURFACE_OPACITY,
} from '../theme.constants';

/** Body của `PUT /me/preferences/theme` — đúng object theme, không bọc thêm. */
export class UpdateThemeDto {
  @ApiProperty({
    example: DEFAULT_THEME.background,
    maxLength: BACKGROUND_ID_MAX_LENGTH,
    description: 'id preset nền do frontend định nghĩa (chuỗi tự do)',
  })
  @IsString()
  @MaxLength(BACKGROUND_ID_MAX_LENGTH)
  @Matches(BACKGROUND_ID_PATTERN, {
    message: 'background chỉ gồm chữ thường, số và gạch nối',
  })
  background: string;

  @ApiProperty({ example: DEFAULT_THEME.accent })
  @Matches(ACCENT_PATTERN, { message: 'accent phải có dạng #rrggbb' })
  accent: string;

  @ApiProperty({
    example: DEFAULT_THEME.surfaceOpacity,
    minimum: MIN_SURFACE_OPACITY,
    maximum: MAX_SURFACE_OPACITY,
  })
  @IsNumber()
  @Min(MIN_SURFACE_OPACITY)
  @Max(MAX_SURFACE_OPACITY)
  surfaceOpacity: number;

  @ApiProperty({
    example: DEFAULT_THEME.surfaceBlur,
    minimum: MIN_SURFACE_BLUR,
    maximum: MAX_SURFACE_BLUR,
    description: 'đơn vị px',
  })
  @IsInt()
  @Min(MIN_SURFACE_BLUR)
  @Max(MAX_SURFACE_BLUR)
  surfaceBlur: number;
}

export class ThemeDto {
  @ApiProperty({ example: DEFAULT_THEME.background }) background: string;
  @ApiProperty({ example: DEFAULT_THEME.accent }) accent: string;
  @ApiProperty({ example: DEFAULT_THEME.surfaceOpacity })
  surfaceOpacity: number;
  @ApiProperty({ example: DEFAULT_THEME.surfaceBlur }) surfaceBlur: number;
}

export type ThemeSource = 'user' | 'default';

export class ThemePreferenceDto {
  @ApiProperty({ type: ThemeDto }) theme: ThemeDto;

  @ApiProperty({
    enum: ['user', 'default'],
    description:
      '"default" = chưa từng lưu, frontend được phép đẩy cấu hình dưới máy lên. ' +
      '"user" = đã có bản ghi, frontend lấy bản ghi này làm chuẩn.',
  })
  source: ThemeSource;

  @ApiPropertyOptional({
    nullable: true,
    description: 'null khi source = "default"',
  })
  updatedAt: Date | null;
}
