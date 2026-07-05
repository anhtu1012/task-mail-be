import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business.exception';

export class NotFoundException extends BusinessException {
  constructor(message = 'Resource not found', errorCode = 'NOT_FOUND') {
    super(message, errorCode, HttpStatus.NOT_FOUND);
  }
}
