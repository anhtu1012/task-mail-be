import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RequestWithUser } from '../types/request-with-user.type';
import { ForbiddenException } from '../exceptions/forbidden.exception';

/**
 * Generic guard for routes shaped like /:resourceUserId/... — verifies the
 * authenticated user only accesses their own resources unless they are an admin.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const resourceUserId = request.params.userId;
    if (!resourceUserId || resourceUserId === request.user?.sub) return true;
    throw new ForbiddenException('You do not have access to this resource');
  }
}
