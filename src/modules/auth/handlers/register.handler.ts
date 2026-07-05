import { HttpStatus, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { HashUtil } from '../../../common/utils/hash.util';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { RegisterDto } from '../dto/auth-request.dto';
import { TokenService, IssuedTokenPair, RequestMeta } from '../services/token.service';

@Injectable()
export class RegisterHandler {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RegisterDto, meta: RequestMeta): Promise<IssuedTokenPair> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BusinessException(
        'An account with this email already exists',
        ERROR_CODES.EMAIL_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await HashUtil.hash(dto.password);
    const user = await this.usersService.create({ email: dto.email, passwordHash });

    return this.tokenService.issueTokenPair(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );
  }
}
