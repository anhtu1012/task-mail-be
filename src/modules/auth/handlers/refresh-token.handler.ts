import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { UnauthorizedException } from '../../../common/exceptions/unauthorized.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { TokenService, IssuedTokenPair, RequestMeta } from '../services/token.service';

export type RefreshTokenInput = {
  userId: string;
  tokenId: string;
  rawRefreshToken: string;
};

@Injectable()
export class RefreshTokenHandler {
  private readonly logger = new Logger(RefreshTokenHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: RefreshTokenInput, meta: RequestMeta): Promise<IssuedTokenPair> {
    const existingToken = await this.refreshTokenRepository.findById(input.tokenId);

    if (!existingToken) {
      throw new UnauthorizedException('Refresh token not recognized', ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    if (existingToken.revokedAt) {
      // The presented token was already rotated out or logged-out — this is either a
      // stale client retry or a stolen token being replayed. Revoke the whole family
      // so a genuine theft can't keep refreshing under the user's identity.
      this.logger.warn(`Reused refresh token detected for user ${existingToken.userId}`);
      await this.refreshTokenRepository.revokeAllForUser(existingToken.userId);
      throw new UnauthorizedException('Refresh token has already been used', ERROR_CODES.REFRESH_TOKEN_REUSED);
    }

    if (existingToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired', ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    const presentedHash = CryptoUtil.sha256(input.rawRefreshToken);
    if (presentedHash !== existingToken.tokenHash) {
      throw new UnauthorizedException('Refresh token not recognized', ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    const user = await this.usersService.findById(existingToken.userId);
    if (!user) {
      throw new UnauthorizedException('Refresh token not recognized', ERROR_CODES.USER_NOT_FOUND);
    }

    const issued = await this.tokenService.issueTokenPair(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );

    await this.refreshTokenRepository.revoke(existingToken.id, issued.refreshTokenId);

    return issued;
  }
}
