import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

/** Documents the API version header expected by this route in Swagger. */
export const ApiVersion = (version = '1') =>
  applyDecorators(
    ApiHeader({
      name: 'X-Api-Version',
      description: 'API version',
      required: false,
      example: version,
    }),
  );
