export class DateUtil {
  /** Parses a duration string like "15m", "7d", "3600s" into milliseconds. */
  static parseDurationToMs(duration: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const unitToMs: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * unitToMs[unit];
  }

  static addMs(date: Date, ms: number): Date {
    return new Date(date.getTime() + ms);
  }
}
