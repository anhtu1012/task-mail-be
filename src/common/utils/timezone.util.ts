/**
 * Day boundaries in the user's zone, not the server's.
 *
 * The backend runs on UTC while users sit on GMT+7, so cutting "today" with
 * UTC midnight silently drops every task due before 07:00 local time — the
 * screen still renders, it is just missing rows.
 */
export class TimezoneUtil {
  static isValid(timeZone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }

  /** Milliseconds `timeZone` is ahead of UTC at the given instant. */
  private static offsetMs(timeZone: string, at: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);

    const field: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') field[part.type] = Number(part.value);
    }

    const asUtc = Date.UTC(
      field.year,
      field.month - 1,
      field.day,
      field.hour % 24,
      field.minute,
      field.second,
    );
    // Drop sub-second noise so the diff is a clean offset.
    return asUtc - at.getTime() + (at.getTime() % 1000);
  }

  /**
   * Turns wall-clock numbers ("20/09/2026 18:00") into the UTC instant they name
   * **in `timeZone`**, regardless of what the server's own clock is set to.
   *
   * `new Date(y, m, d, h, min)` cannot be used for this: it reads the numbers in
   * the server's local zone, so the same email produces a different instant on a
   * UTC container than on a GMT+7 laptop.
   */
  static fromWallClock(
    timeZone: string,
    parts: {
      year: number;
      month: number;
      day: number;
      hour?: number;
      minute?: number;
    },
  ): Date {
    const naive = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour ?? 0,
      parts.minute ?? 0,
    );
    // Sample the offset twice: once near the naive instant, then again at the
    // candidate result, so a DST change on that very day still lands right.
    const guess = naive - this.offsetMs(timeZone, new Date(naive));
    return new Date(naive - this.offsetMs(timeZone, new Date(guess)));
  }

  /** `YYYY-MM-DD` as seen in `timeZone`. */
  static formatDateKey(at: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);

    const field: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') field[part.type] = part.value;
    }
    return `${field.year}-${field.month}-${field.day}`;
  }

  /**
   * UTC instants bracketing the local day that `dateKey` (`YYYY-MM-DD`, default
   * today) names in `timeZone`: `[start, end)`.
   */
  static dayRange(
    timeZone: string,
    dateKey?: string,
    now: Date = new Date(),
  ): { start: Date; end: Date; dateKey: string } {
    const key = dateKey ?? this.formatDateKey(now, timeZone);
    const [year, month, day] = key.split('-').map(Number);

    const naiveMidnight = Date.UTC(year, month - 1, day);
    // The offset is sampled twice: once near the target instant, then again at
    // the candidate result, so a DST shift on that very day still lands right.
    const firstGuess = naiveMidnight - this.offsetMs(timeZone, now);
    const start = new Date(
      naiveMidnight - this.offsetMs(timeZone, new Date(firstGuess)),
    );

    const naiveNextMidnight = Date.UTC(year, month - 1, day + 1);
    const endGuess = naiveNextMidnight - this.offsetMs(timeZone, now);
    const end = new Date(
      naiveNextMidnight - this.offsetMs(timeZone, new Date(endGuess)),
    );

    return { start, end, dateKey: key };
  }
}
