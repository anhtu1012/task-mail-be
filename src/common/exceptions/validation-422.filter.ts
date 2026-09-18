import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '../constants/error-codes.constants';

/**
 * Chuyển 400 của ValidationPipe thành **422 `VALIDATION_FAILED`** trên những
 * controller có hợp đồng với client ghi 422.
 *
 * Phải là filter chứ không phải một `ValidationPipe` riêng gắn ở route: pipe
 * toàn cục chạy **trước** pipe cấp tham số, nên nó đã ném 400 xong rồi thì pipe
 * ở route không bao giờ tới lượt.
 *
 * Phạm vi hẹp là cố ý — phần còn lại của API vẫn trả 400 cho body sai, và
 * frontend đang rẽ nhánh theo mã đó.
 */
@Catch(BadRequestException)
export class Validation422Filter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = exception.getResponse();
    const message =
      typeof body === 'object' && body !== null
        ? ((body as { message?: string | string[] }).message ??
          exception.message)
        : exception.message;

    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      errorCode: ERROR_CODES.VALIDATION_FAILED,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
