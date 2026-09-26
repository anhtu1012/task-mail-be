import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ZaloAccount } from '../../../generated/prisma/client';

@Injectable()
export class ZaloAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<ZaloAccount | null> {
    return this.prisma.zaloAccount.findUnique({ where: { userId } });
  }

  findByZaloUserId(zaloUserId: string): Promise<ZaloAccount | null> {
    return this.prisma.zaloAccount.findUnique({ where: { zaloUserId } });
  }

  findAll(): Promise<ZaloAccount[]> {
    return this.prisma.zaloAccount.findMany();
  }

  findByUserIds(userIds: string[]): Promise<ZaloAccount[]> {
    return this.prisma.zaloAccount.findMany({
      where: { userId: { in: userIds } },
    });
  }

  /** Danh sách người đã liên kết kèm email — để admin chọn người nhận. */
  findAllWithEmail(): Promise<(ZaloAccount & { user: { email: string } })[]> {
    return this.prisma.zaloAccount.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { user: { email: 'asc' } },
    });
  }

  count(): Promise<number> {
    return this.prisma.zaloAccount.count();
  }

  upsert(userId: string, zaloUserId: string): Promise<ZaloAccount> {
    return this.prisma.zaloAccount.upsert({
      where: { userId },
      create: { userId, zaloUserId },
      update: { zaloUserId },
    });
  }

  delete(userId: string): Promise<ZaloAccount> {
    return this.prisma.zaloAccount.delete({ where: { userId } });
  }
}
