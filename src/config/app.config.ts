import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  selfUrl?: string;
  /** Số proxy tin được trước app — giá trị `trust proxy` của Express. */
  trustProxyHops: number;
}

export default registerAs('app', (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Public URL of this deployment (e.g. https://xxx.onrender.com). When set, a
  // cron job pings it every minute so free-tier hosts don't spin the instance down.
  // RENDER_EXTERNAL_URL is auto-injected by Render; APP_URL is the manual override.
  selfUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || undefined,
  // Render (và hầu hết PaaS) đặt app sau một load balancer. Không tin proxy thì
  // `req.ip` là IP của load balancer → mọi người dùng chung một bộ đếm rate
  // limit. 1 = tin đúng một tầng; đặt 0 khi chạy trực tiếp không qua proxy.
  // Biến để trống (như `.env.example`) = chưa đặt, không phải 0.
  trustProxyHops: Number.isNaN(parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10))
    ? 1
    : parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10),
}));
