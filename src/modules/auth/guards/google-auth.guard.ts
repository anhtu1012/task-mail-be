import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_CONSTANTS } from '../../../common/constants/auth.constants';

@Injectable()
export class GoogleAuthGuard extends AuthGuard(
  AUTH_CONSTANTS.GOOGLE_STRATEGY,
) {}
