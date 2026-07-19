import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import type { StringValue } from 'ms';
import type { MailAccount } from '../../generated/prisma/client';
import { GoogleOAuthConfig } from '../../config/google.config';
import { SecurityConfig } from '../../config/security.config';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { Role } from '../../common/enums/role.enum';
import { JwtAccessPayload } from '../../common/types/jwt-payload.type';
import { NotFoundException } from '../../common/exceptions/not-found.exception';
import { ForbiddenException } from '../../common/exceptions/forbidden.exception';
import { UnauthorizedException } from '../../common/exceptions/unauthorized.exception';
import { MailAccountRepository } from './repositories/mail-account.repository';
import { MailAccountResponseDto } from './dto/mail-account-response.dto';

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
];

const STATE_TOKEN_TTL: StringValue = '5m';
export const NOTIFICATION_STATE_TOKEN_TTL: StringValue = '24h';
const isPrivileged = (role: Role) =>
  role === Role.ADMIN || role === Role.SUPER_ADMIN;

@Injectable()
export class MailAccountsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailAccountRepository: MailAccountRepository,
  ) {}

  buildOAuthClient() {
    const config = this.configService.get<GoogleOAuthConfig>('googleOAuth');
    return new google.auth.OAuth2(
      config?.clientId,
      config?.clientSecret,
      config?.redirectUri,
    );
  }

  getConnectUrl(
    userId: string,
    expiresIn: StringValue = STATE_TOKEN_TTL,
  ): string {
    const state = this.jwtService.sign(
      { sub: userId, purpose: 'mail-connect' },
      {
        secret: this.configService.getOrThrow<string>('auth.accessSecret'),
        expiresIn,
      },
    );

    return this.buildOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: OAUTH_SCOPES,
      state,
    });
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const userId = this.verifyState(state);

    const client = this.buildOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new UnauthorizedException(
        'Google did not return the expected OAuth tokens',
      );
    }
    client.setCredentials(tokens);

    const { data } = await google
      .oauth2({ version: 'v2', auth: client })
      .userinfo.get();
    if (!data.email) {
      throw new UnauthorizedException(
        'Could not determine the connected Gmail address',
      );
    }

    const key = this.getEncryptionKey();
    await this.mailAccountRepository.upsert({
      userId,
      email: data.email,
      accessToken: EncryptionUtil.encrypt(tokens.access_token, key),
      refreshToken: EncryptionUtil.encrypt(tokens.refresh_token, key),
      tokenExpiresAt: new Date(tokens.expiry_date ?? Date.now()),
    });
  }

  async list(userId: string): Promise<MailAccountResponseDto[]> {
    const accounts = await this.mailAccountRepository.findByUser(userId);
    return accounts.map((account) => this.toResponse(account));
  }

  async remove(user: JwtAccessPayload, id: string): Promise<void> {
    const account = await this.mailAccountRepository.findById(id);
    if (!account) throw new NotFoundException('Mail account not found');
    if (account.userId !== user.sub && !isPrivileged(user.role)) {
      throw new ForbiddenException(
        'You do not have access to this mail account',
      );
    }
    await this.mailAccountRepository.delete(id);
  }

  private verifyState(state: string): string {
    try {
      const payload = this.jwtService.verify<{ sub: string; purpose: string }>(
        state,
        {
          secret: this.configService.getOrThrow<string>('auth.accessSecret'),
        },
      );
      if (payload.purpose !== 'mail-connect')
        throw new Error('Wrong token purpose');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired connect link');
    }
  }

  private getEncryptionKey(): string {
    return this.configService.getOrThrow<SecurityConfig>('security')
      .tokenEncryptionKey;
  }

  private toResponse(account: MailAccount): MailAccountResponseDto {
    return {
      id: account.id,
      provider: account.provider,
      email: account.email,
      createdAt: account.createdAt,
    };
  }
}
