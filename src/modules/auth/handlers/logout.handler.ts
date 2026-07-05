import { Injectable } from '@nestjs/common';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';

@Injectable()
export class LogoutHandler {
  constructor(private readonly refreshTokenRepository: RefreshTokenRepository) {}

  async execute(tokenId: string): Promise<void> {
    const token = await this.refreshTokenRepository.findById(tokenId);
    if (!token || token.revokedAt) return;
    await this.refreshTokenRepository.revoke(tokenId);
  }
}
