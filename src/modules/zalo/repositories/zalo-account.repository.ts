import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ZaloAccount } from '../../../generated/prisma/client';

@Injectable()
export class ZaloAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<ZaloAccount | null> {
    return this.prisma.zaloAccount.findUnique({ where: { userId } });
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
