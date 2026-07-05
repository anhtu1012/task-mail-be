import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Thin alias so the rest of the codebase depends on our own token, not @nestjs/throttler directly. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {}
