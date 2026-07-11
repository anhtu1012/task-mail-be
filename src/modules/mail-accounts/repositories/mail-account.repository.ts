import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { MailAccount } from '../../../generated/prisma/client';

export type UpsertMailAccountInput = {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
};

export type UpdateTokensInput = {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: Date;
};

@Injectable()
export class MailAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<MailAccount[]> {
    return this.prisma.mailAccount.findMany();
  }

  findById(id: string): Promise<MailAccount | null> {
    return this.prisma.mailAccount.findUnique({ where: { id } });
  }

  findByUser(userId: string): Promise<MailAccount[]> {
    return this.prisma.mailAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  upsert(input: UpsertMailAccountInput): Promise<MailAccount> {
    return this.prisma.mailAccount.upsert({
      where: { userId_email: { userId: input.userId, email: input.email } },
      create: input,
      update: {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        tokenExpiresAt: input.tokenExpiresAt,
      },
    });
  }

  updateTokens(id: string, input: UpdateTokensInput): Promise<MailAccount> {
    return this.prisma.mailAccount.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<MailAccount> {
    return this.prisma.mailAccount.delete({ where: { id } });
  }
}
