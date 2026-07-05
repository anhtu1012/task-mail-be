import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ZaloLinkCode } from '../../../generated/prisma/client';

@Injectable()
export class ZaloLinkCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, code: string, expiresAt: Date): Promise<ZaloLinkCode> {
    return this.prisma.zaloLinkCode.create({ data: { userId, code, expiresAt } });
  }

  findByCode(code: string): Promise<ZaloLinkCode | null> {
    return this.prisma.zaloLinkCode.findUnique({ where: { code } });
  }

  delete(id: string): Promise<ZaloLinkCode> {
    return this.prisma.zaloLinkCode.delete({ where: { id } });
  }

  deleteExpired(): Promise<{ count: number }> {
    return this.prisma.zaloLinkCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
