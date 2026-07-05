import { registerAs } from '@nestjs/config';

export interface MailConfig {
  taskSubjectPrefix: string;
}

export default registerAs(
  'mail',
  (): MailConfig => ({
    taskSubjectPrefix: process.env.MAIL_TASK_SUBJECT_PREFIX ?? '[TASK]',
  }),
);
