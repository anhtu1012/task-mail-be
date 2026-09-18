import { Injectable } from '@nestjs/common';
import type { UserThemePreference } from '../../../generated/prisma/client';
import {
  ThemePreferenceDto,
  UpdateThemeDto,
} from '../dto/theme-preference.dto';
import { ThemePreferenceRepository } from '../repositories/theme-preference.repository';
import { DEFAULT_THEME } from '../theme.constants';

@Injectable()
export class ThemePreferenceService {
  constructor(private readonly repository: ThemePreferenceRepository) {}

  /**
   * Luôn 200. Chưa có bản ghi thì trả mặc định hệ thống kèm `source: "default"`
   * — **không** trả 404: frontend dùng 404 để nhận ra endpoint chưa tồn tại và
   * tắt hẳn việc gọi API trong cả phiên.
   */
  async get(userId: string): Promise<ThemePreferenceDto> {
    const saved = await this.repository.findByUser(userId);
    return saved
      ? toDto(saved)
      : { theme: { ...DEFAULT_THEME }, source: 'default', updatedAt: null };
  }

  async put(userId: string, dto: UpdateThemeDto): Promise<ThemePreferenceDto> {
    const saved = await this.repository.upsert(userId, {
      background: dto.background,
      // Giữ nguyên hoa/thường như client gửi: frontend so sánh chuỗi để tô đậm
      // ô màu đang chọn.
      accent: dto.accent,
      surfaceOpacity: dto.surfaceOpacity,
      surfaceBlur: dto.surfaceBlur,
    });
    return toDto(saved);
  }

  remove(userId: string): Promise<void> {
    return this.repository.deleteByUser(userId);
  }
}

function toDto(row: UserThemePreference): ThemePreferenceDto {
  return {
    theme: {
      background: row.background,
      accent: row.accent,
      surfaceOpacity: row.surfaceOpacity,
      surfaceBlur: row.surfaceBlur,
    },
    source: 'user',
    updatedAt: row.updatedAt,
  };
}
