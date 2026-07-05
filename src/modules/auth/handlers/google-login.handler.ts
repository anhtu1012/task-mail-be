import { HttpStatus, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { AuthProvider } from '../../../generated/prisma/enums';
import { UserStatus } from '../../../common/enums/status.enum';
import { UnauthorizedException } from '../../../common/exceptions/unauthorized.exception';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { GoogleProfile } from '../types/google-profile.type';
import { TokenService, IssuedTokenPair, RequestMeta } from '../services/token.service';

@Injectable()
export class GoogleLoginHandler {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(profile: GoogleProfile, meta: RequestMeta): Promise<IssuedTokenPair> {
    if (!profile.email) {
      throw new BusinessException(
        'Google account has no verified email',
        ERROR_CODES.GOOGLE_PROFILE_MISSING_EMAIL,
        HttpStatus.BAD_REQUEST,
      );
    }

    let user = await this.usersService.findByGoogleId(profile.googleId);

    if (!user) {
      const existingByEmail = await this.usersService.findByEmail(profile.email);
      user = existingByEmail
        ? await this.usersService.linkGoogleId(existingByEmail.id, profile.googleId)
        : await this.usersService.create({
            email: profile.email,
            googleId: profile.googleId,
            provider: AuthProvider.GOOGLE,
          });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active', ERROR_CODES.ACCOUNT_NOT_ACTIVE);
    }

    return this.tokenService.issueTokenPair(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );
  }
}
