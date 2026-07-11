import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  selfUrl?: string;
}

export default registerAs('app', (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Public URL of this deployment (e.g. https://xxx.onrender.com). When set, a
  // cron job pings it every minute so free-tier hosts don't spin the instance down.
  // RENDER_EXTERNAL_URL is auto-injected by Render; APP_URL is the manual override.
  selfUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || undefined,
}));
