import { registerAs } from '@nestjs/config';

export interface MailConfig {
  taskSubjectPrefixes: string[];
  taskLookbackDays: number;
}

const DEFAULT_TASK_SUBJECT_PREFIXES = ['[TASK]'];

// Different senders/teams tag task mails differently (e.g. "[TASK]" vs "[OPER]"),
// so MAIL_TASK_SUBJECT_PREFIX accepts a comma-separated list — existing single-value
// deployments keep working unchanged.
function parseTaskSubjectPrefixes(raw: string | undefined): string[] {
  const prefixes =
    raw
      ?.split(',')
      .map((prefix) => prefix.trim())
      .filter(Boolean) ?? [];
  return prefixes.length ? prefixes : DEFAULT_TASK_SUBJECT_PREFIXES;
}

export default registerAs('mail', (): MailConfig => ({
  taskSubjectPrefixes: parseTaskSubjectPrefixes(
    process.env.MAIL_TASK_SUBJECT_PREFIX,
  ),
  taskLookbackDays: Number(process.env.MAIL_TASK_LOOKBACK_DAYS ?? 7),
}));
