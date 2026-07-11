import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Role } from '../../../common/enums/role.enum';
import { CryptoUtil } from '../../../common/utils/crypto.util';
import { DateUtil } from '../../../common/utils/date.util';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';

export type IssuedTokenPair = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenId: string;
  refreshTokenExpiresAt: Date;
};

export type TokenSubject = {
  id: string;
  email: string;
  role: Role;
};

export type RequestMeta = {
  userAgent?: string;
  ipAddress?: string;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  private signAccessToken(user: TokenSubject): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.configService.getOrThrow<string>('auth.accessSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'auth.accessExpiresIn',
        ),
      } as JwtSignOptions,
    );
  }

  /**
   * Issues a fresh access/refresh pair and persists a RefreshToken row whose
   * id becomes the refresh JWT's `tokenId` claim — the DB row is the source
   * of truth for revocation, the JWT is just a signed pointer to it.
   */
  async issueTokenPair(
    user: TokenSubject,
    meta: RequestMeta = {},
  ): Promise<IssuedTokenPair> {
    const tokenId = randomUUID();
    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'auth.refreshExpiresIn',
    );
    const refreshTokenExpiresAt = DateUtil.addMs(
      new Date(),
      DateUtil.parseDurationToMs(refreshExpiresIn),
    );

    const refreshToken = this.jwtService.sign({ sub: user.id, tokenId }, {
      secret: this.configService.getOrThrow<string>('auth.refreshSecret'),
      expiresIn: refreshExpiresIn,
    } as JwtSignOptions);

    await this.refreshTokenRepository.create({
      id: tokenId,
      userId: user.id,
      tokenHash: CryptoUtil.sha256(refreshToken),
      expiresAt: refreshTokenExpiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    const accessToken = this.signAccessToken(user);
    const accessExpiresIn = DateUtil.parseDurationToMs(
      this.configService.getOrThrow<string>('auth.accessExpiresIn'),
    );

    return {
      accessToken,
      accessTokenExpiresIn: Math.floor(accessExpiresIn / 1000),
      refreshToken,
      refreshTokenId: tokenId,
      refreshTokenExpiresAt,
    };
  }
}
