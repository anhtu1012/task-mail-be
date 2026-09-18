import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { UserThemePreference } from '../../../generated/prisma/client';

export type ThemeValues = {
  background: string;
  accent: string;
  surfaceOpacity: number;
  surfaceBlur: number;
};

@Injectable()
export class ThemePreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<UserThemePreference | null> {
    return this.prisma.userThemePreference.findUnique({ where: { userId } });
  }

  upsert(userId: string, values: ThemeValues): Promise<UserThemePreference> {
    return this.prisma.userThemePreference.upsert({
      where: { userId },
      create: { userId, ...values },
      update: values,
    });
  }

  /**
   * `deleteMany` chứ không phải `delete`: xoá khi chưa có bản ghi phải im lặng
   * thành công (204), không ném P2025 → 500. Người dùng bấm "khôi phục mặc
   * định" lúc đang ở mặc định là chuyện bình thường.
   */
  async deleteByUser(userId: string): Promise<void> {
    await this.prisma.userThemePreference.deleteMany({ where: { userId } });
  }
}
