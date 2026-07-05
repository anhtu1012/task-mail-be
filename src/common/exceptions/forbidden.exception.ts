import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business.exception';

export class ForbiddenException extends BusinessException {
  constructor(message = 'Forbidden', errorCode = 'FORBIDDEN') {
    super(message, errorCode, HttpStatus.FORBIDDEN);
  }
}
