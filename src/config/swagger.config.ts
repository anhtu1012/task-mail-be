import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { COOKIE_KEYS } from '../common/constants/cookie.constants';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('NestJS Auth CMS API')
    .setDescription(
      'Authentication module: register, login, refresh-token rotation, logout, and profile retrieval.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addCookieAuth(COOKIE_KEYS.REFRESH_TOKEN, {
      type: 'apiKey',
      in: 'cookie',
      name: COOKIE_KEYS.REFRESH_TOKEN,
      description:
        'HttpOnly refresh-token cookie set by /auth/login. Swagger UI sends browser cookies automatically when "Try it out" is used from the same origin as the server.',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  });
}
