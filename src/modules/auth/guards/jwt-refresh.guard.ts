import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_CONSTANTS } from '../../../common/constants/auth.constants';

@Injectable()
export class JwtRefreshGuard extends AuthGuard(AUTH_CONSTANTS.JWT_REFRESH_STRATEGY) {}
