import { TaskPriority } from '../../../common/enums/task-priority.enum';

export type ParsedTaskMail = {
  title: string;
  description: string;
  deadline?: Date;
  priority: TaskPriority;
  attachments: string[];
};

const DEADLINE_REGEX =
  /(?:deadline|h[aạ]n)\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i;

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

const MAX_DESCRIPTION_LENGTH = 2000;

function extractDeadline(bodyText: string): Date | undefined {
  const match = DEADLINE_REGEX.exec(bodyText);
  if (!match) return undefined;

  const [, day, month, year, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0,
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function extractPriority(bodyText: string): TaskPriority {
  const text = bodyText.toLowerCase();
  if (text.includes('khẩn cấp') || text.includes('gấp')) return TaskPriority.URGENT;
  if (text.includes('cao')) return TaskPriority.HIGH;
  return TaskPriority.NORMAL;
}

function extractLinks(bodyText: string): string[] {
  return Array.from(new Set(bodyText.match(URL_REGEX) ?? []));
}

/**
 * Detects and extracts task fields from a mail subject/body using fixed rules
 * (no LLM): the subject must start with `prefix` (case-insensitive) to count as a task.
 */
export function parseTaskMail(
  subject: string,
  bodyText: string,
  prefix: string,
): ParsedTaskMail | null {
  const trimmedSubject = (subject ?? '').trim();
  const normalizedPrefix = prefix.trim().toLowerCase();

  if (!trimmedSubject.toLowerCase().startsWith(normalizedPrefix)) return null;

  const title = trimmedSubject.slice(prefix.trim().length).trim();
  const body = bodyText ?? '';

  return {
    title: title || trimmedSubject,
    description: body.slice(0, MAX_DESCRIPTION_LENGTH),
    deadline: extractDeadline(body),
    priority: extractPriority(body),
    attachments: extractLinks(body),
  };
}
