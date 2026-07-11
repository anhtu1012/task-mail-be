import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { API_ROUTES } from '../constants/api-routes.constants';
import { GoogleOAuthConfig } from '../../config/google.config';

const GOOGLE_LOGIN_CALLBACK_PATH = `/${API_ROUTES.AUTH.ROOT}/${API_ROUTES.AUTH.GOOGLE_CALLBACK}`;

function isPassportTokenError(
  exception: unknown,
): exception is Error & { code?: string } {
  return exception instanceof Error && exception.name === 'TokenError';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly configService?: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // The Google "sign in" flow's authorization code is single-use and expires in
    // minutes, so a stale/replayed callback (double-submit, back/reload) surfaces here
    // as a passport TokenError rather than an HttpException. Tag it distinctly so it's
    // never confused with Gmail-ingestion OAuth failures (which go through a separate
    // path in MailIngestionService), and send the browser back to the frontend instead
    // of a raw JSON 500.
    if (
      isPassportTokenError(exception) &&
      request.path.startsWith(GOOGLE_LOGIN_CALLBACK_PATH) &&
      this.configService
    ) {
      this.logger.warn(
        `[GoogleLogin] OAuth callback exchange failed (code=${exception.code ?? 'unknown'}): ${exception.message}`,
      );
      const { frontendUrl } =
        this.configService.getOrThrow<GoogleOAuthConfig>('googleOAuth');
      const redirectUrl = new URL('/oauth-callback', frontendUrl);
      redirectUrl.searchParams.set('error', 'google_auth_failed');
      response.redirect(redirectUrl.toString());
      return;
    }

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = isHttpException ? exception.getResponse() : null;
    const { message, errorCode } =
      typeof body === 'object' && body !== null
        ? (body as { message?: string | string[]; errorCode?: string })
        : { message: 'Internal server error', errorCode: 'INTERNAL_ERROR' };

    if (!isHttpException) {
      this.logger.error(exception);
    }

    response.status(status).json({
      statusCode: status,
      errorCode: errorCode ?? 'ERROR',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
