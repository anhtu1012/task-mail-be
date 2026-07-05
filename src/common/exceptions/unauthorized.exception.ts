import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business.exception';

export class UnauthorizedException extends BusinessException {
  constructor(message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
    super(message, errorCode, HttpStatus.UNAUTHORIZED);
  }
}
