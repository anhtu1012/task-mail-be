import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Groundwork for multi-tenant support: resolves a tenant id from a header
 * today; swap for subdomain/JWT-claim resolution once tenancy is enforced.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    (req as Request & { tenantId?: string }).tenantId = req.headers[
      'x-tenant-id'
    ] as string | undefined;
    next();
  }
}
