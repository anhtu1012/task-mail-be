import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '../../config/app.config';

/**
 * Free-tier hosts (e.g. Render) spin the instance down after ~15 minutes without
 * inbound traffic. Pinging our own public health endpoint every minute keeps
 * inbound traffic flowing so the instance never gets suspended.
 */
@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private readonly selfUrl?: string;

  constructor(configService: ConfigService) {
    this.selfUrl = configService.getOrThrow<AppConfig>('app').selfUrl;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async ping(): Promise<void> {
    if (!this.selfUrl) return;
    try {
      await fetch(new URL('/health', this.selfUrl));
    } catch (error) {
      this.logger.warn(`Keep-alive ping failed: ${(error as Error).message}`);
    }
  }
}
