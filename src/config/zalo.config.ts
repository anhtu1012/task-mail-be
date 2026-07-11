import { registerAs } from '@nestjs/config';

export interface ZaloConfig {
  botToken?: string;
  botProfileUrl?: string;
  deadlineReminderHours: number;
}

export default registerAs('zalo', (): ZaloConfig => ({
  botToken: process.env.ZALO_BOT_TOKEN,
  botProfileUrl: process.env.ZALO_BOT_PROFILE_URL,
  deadlineReminderHours: Number(process.env.TASK_DEADLINE_REMINDER_HOURS ?? 24),
}));
