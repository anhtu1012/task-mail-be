import { registerAs } from '@nestjs/config';

export interface MailConfig {
  taskSubjectPrefix: string;
  taskLookbackDays: number;
}

export default registerAs(
  'mail',
  (): MailConfig => ({
    taskSubjectPrefix: process.env.MAIL_TASK_SUBJECT_PREFIX ?? '[TASK]',
    taskLookbackDays: Number(process.env.MAIL_TASK_LOOKBACK_DAYS ?? 7),
  }),
);
