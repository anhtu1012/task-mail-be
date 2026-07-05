import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { HashUtil } from '../../../common/utils/hash.util';
import { UserStatus } from '../../../common/enums/status.enum';
import { UnauthorizedException } from '../../../common/exceptions/unauthorized.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { LoginDto } from '../dto/auth-request.dto';
import { TokenService, IssuedTokenPair, RequestMeta } from '../services/token.service';

@Injectable()
export class LoginHandler {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LoginDto, meta: RequestMeta): Promise<IssuedTokenPair> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account signs in with Google — use "Sign in with Google" instead',
        ERROR_CODES.GOOGLE_ACCOUNT_ONLY,
      );
    }

    const passwordMatches = await HashUtil.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
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
