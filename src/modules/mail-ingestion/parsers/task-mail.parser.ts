import { TaskPriority } from '../../../common/enums/task-priority.enum';

/**
 * The deadline as written in the mail, still as wall-clock numbers.
 *
 * Deliberately not a `Date`: "20/09/2026 18:00" names an instant only once you
 * know whose timezone it is meant in, and the parser does not know the assignee
 * yet. Resolving it here with `new Date(y, m, d, …)` would silently read the
 * numbers in the server's zone — UTC in the container, GMT+7 on a dev laptop —
 * and store two different instants for the same email.
 */
export type ParsedDeadline = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type ParsedTaskMail = {
  title: string;
  description: string;
  deadline?: ParsedDeadline;
  priority: TaskPriority;
  attachments: string[];
  assigneeEmail?: string;
};

const DEADLINE_REGEX =
  /(?:deadline|h[aạ]n)\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i;

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

// Explicit "Giao cho: <email>" / "Gán cho: <email>" / "Assign to: <email>" directive
// in the body names the intended assignee, so the task lands on the right person
// even when the mail was received in a different (e.g. CC'd) connected mailbox.
const ASSIGNEE_REGEX =
  /(?:giao\s*cho|g[aá]n\s*cho|assign(?:ed)?\s*to)\s*:\s*([^\s,;<>]+@[^\s,;<>]+)/i;

const MAX_DESCRIPTION_LENGTH = 2000;

function extractDeadline(bodyText: string): ParsedDeadline | undefined {
  const match = DEADLINE_REGEX.exec(bodyText);
  if (!match) return undefined;

  const [, day, month, year, hour, minute] = match;
  const parsed: ParsedDeadline = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: hour ? Number(hour) : 0,
    minute: minute ? Number(minute) : 0,
  };

  // The regex allows 1-2 digits, so "32/13/2026" or "25:00" reach here.
  const inRange =
    parsed.month >= 1 &&
    parsed.month <= 12 &&
    parsed.day >= 1 &&
    parsed.day <= 31 &&
    parsed.hour <= 23 &&
    parsed.minute <= 59;
  return inRange ? parsed : undefined;
}

function extractPriority(bodyText: string): TaskPriority {
  const text = bodyText.toLowerCase();
  if (text.includes('khẩn cấp') || text.includes('gấp'))
    return TaskPriority.URGENT;
  if (text.includes('cao')) return TaskPriority.HIGH;
  return TaskPriority.NORMAL;
}

function extractLinks(bodyText: string): string[] {
  return Array.from(new Set(bodyText.match(URL_REGEX) ?? []));
}

function extractAssigneeEmail(bodyText: string): string | undefined {
  const match = ASSIGNEE_REGEX.exec(bodyText);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Detects and extracts task fields from a mail subject/body using fixed rules
 * (no LLM): the subject must start with one of `prefixes` (case-insensitive) to
 * count as a task. Different senders/teams tag their subjects differently (e.g.
 * "[TASK]" vs "[OPER]"), so multiple prefixes can be configured and are tried in
 * order — the first one the subject starts with is stripped to form the title.
 */
export function parseTaskMail(
  subject: string,
  bodyText: string,
  prefixes: string | string[],
): ParsedTaskMail | null {
  const trimmedSubject = (subject ?? '').trim();
  const candidates = (Array.isArray(prefixes) ? prefixes : [prefixes])
    .map((p) => p.trim())
    .filter(Boolean);

  const matchedPrefix = candidates.find((prefix) =>
    trimmedSubject.toLowerCase().startsWith(prefix.toLowerCase()),
  );
  if (!matchedPrefix) return null;

  const title = trimmedSubject.slice(matchedPrefix.length).trim();
  const body = bodyText ?? '';

  return {
    title: title || trimmedSubject,
    description: body.slice(0, MAX_DESCRIPTION_LENGTH),
    deadline: extractDeadline(body),
    priority: extractPriority(body),
    attachments: extractLinks(body),
    assigneeEmail: extractAssigneeEmail(body),
  };
}
