import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { setupSwagger } from './config/swagger.config';

/**
 * Body mặc định của Express/body-parser giới hạn 100KB — không đủ cho mô tả
 * task có dán ảnh chụp màn hình dạng `data:` URI base64 (xem
 * `board-card.repository.ts`, cột `has_description`).
 */
const BODY_LIMIT = '10mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(AppValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  setupSwagger(app);

  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port);
}
void bootstrap();
