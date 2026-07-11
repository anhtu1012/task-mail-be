import { Injectable } from '@nestjs/common';
import { RegisterDto, LoginDto } from './dto/auth-request.dto';
import { RegisterHandler } from './handlers/register.handler';
import { LoginHandler } from './handlers/login.handler';
import { LogoutHandler } from './handlers/logout.handler';
import {
  RefreshTokenHandler,
  RefreshTokenInput,
} from './handlers/refresh-token.handler';
import { GoogleLoginHandler } from './handlers/google-login.handler';
import { IssuedTokenPair, RequestMeta } from './services/token.service';
import { UsersService } from '../users/users.service';
import { NotFoundException } from '../../common/exceptions/not-found.exception';
import { GoogleProfile } from './types/google-profile.type';
import type { User } from '../../generated/prisma/client';

/**
 * Orchestration layer: routes each use case to its handler. Keeping this thin
 * means the controller never talks to handlers/repositories directly, and
 * cross-cutting concerns (e.g. metrics, audit logging) have one place to hook in.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly registerHandler: RegisterHandler,
    private readonly loginHandler: LoginHandler,
    private readonly logoutHandler: LogoutHandler,
    private readonly refreshTokenHandler: RefreshTokenHandler,
    private readonly googleLoginHandler: GoogleLoginHandler,
    private readonly usersService: UsersService,
  ) {}

  register(dto: RegisterDto, meta: RequestMeta): Promise<IssuedTokenPair> {
    return this.registerHandler.execute(dto, meta);
  }

  login(dto: LoginDto, meta: RequestMeta): Promise<IssuedTokenPair> {
    return this.loginHandler.execute(dto, meta);
  }

  logout(tokenId: string): Promise<void> {
    return this.logoutHandler.execute(tokenId);
  }

  refreshToken(
    input: RefreshTokenInput,
    meta: RequestMeta,
  ): Promise<IssuedTokenPair> {
    return this.refreshTokenHandler.execute(input, meta);
  }

  googleLogin(
    profile: GoogleProfile,
    meta: RequestMeta,
  ): Promise<IssuedTokenPair> {
    return this.googleLoginHandler.execute(profile, meta);
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
