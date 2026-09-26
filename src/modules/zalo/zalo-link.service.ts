import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { ZaloLinkCodeRepository } from './repositories/zalo-link-code.repository';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';

const LINK_CODE_TTL_MS = 10 * 60 * 1000;

export type ConfirmLinkResult = 'linked' | 'invalid_code' | 'already_linked';

@Injectable()
export class ZaloLinkService {
  constructor(
    private readonly zaloLinkCodeRepository: ZaloLinkCodeRepository,
    private readonly zaloAccountRepository: ZaloAccountRepository,
  ) {}

  async createLinkCode(
    userId: string,
  ): Promise<{ code: string; expiresAt: Date }> {
    await this.zaloLinkCodeRepository.deleteExpired();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    await this.zaloLinkCodeRepository.create(userId, code, expiresAt);
    return { code, expiresAt };
  }

  /**
   * Matches an inbound Zalo message against a pending code; links on success.
   * `zaloUserId` is unique on the account table (a Zalo chat can only shadow
   * one app user) — checked explicitly here so a chat already linked to a
   * different account gets a clear reply instead of a swallowed P2002 from
   * the poll loop's `catch`.
   */
  async confirmLink(
    code: string,
    zaloUserId: string,
  ): Promise<ConfirmLinkResult> {
    const linkCode = await this.zaloLinkCodeRepository.findByCode(code.trim());
    if (!linkCode || linkCode.expiresAt.getTime() < Date.now()) {
      return 'invalid_code';
    }

    const existing =
      await this.zaloAccountRepository.findByZaloUserId(zaloUserId);
    if (existing && existing.userId !== linkCode.userId) {
      return 'already_linked';
    }

    await this.zaloAccountRepository.upsert(linkCode.userId, zaloUserId);
    await this.zaloLinkCodeRepository.delete(linkCode.id);
    return 'linked';
  }
}
