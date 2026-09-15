import { TimezoneUtil } from './timezone.util';

// The trap from the board spec: the server runs UTC, the user is on GMT+7.
// A deadline at 06:00 Vietnam time is 23:00 UTC the *previous* day, so cutting
// the day on UTC midnight silently hides it from "due today".
describe('TimezoneUtil', () => {
  const VN = 'Asia/Ho_Chi_Minh';

  it('brackets a Vietnamese day at 17:00 UTC the day before', () => {
    const { start, end } = TimezoneUtil.dayRange(VN, '2026-09-15');

    expect(start.toISOString()).toBe('2026-09-14T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-15T17:00:00.000Z');
  });

  it('includes a deadline at 06:00 and one at 23:00 Vietnam time in the same day', () => {
    const { start, end } = TimezoneUtil.dayRange(VN, '2026-09-15');
    const sixAm = new Date('2026-09-14T23:00:00.000Z');
    const elevenPm = new Date('2026-09-15T16:00:00.000Z');

    for (const deadline of [sixAm, elevenPm]) {
      expect(deadline >= start && deadline < end).toBe(true);
    }
  });

  it('honours a DST switch when the zone has one', () => {
    // Europe/Berlin moves to CEST on 2026-03-29, so that local day is 23h long.
    const { start, end } = TimezoneUtil.dayRange('Europe/Berlin', '2026-03-29');

    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('names the local date, not the UTC one', () => {
    // 23:30 UTC is already the next day in Vietnam.
    const at = new Date('2026-09-15T23:30:00.000Z');
    expect(TimezoneUtil.formatDateKey(at, VN)).toBe('2026-09-16');
  });

  describe('fromWallClock', () => {
    // "Hạn: 20/09/2026 18:00" in a mail means 18:00 in Vietnam, which is
    // 11:00 UTC — not 18:00 UTC, whatever the server's own clock says.
    it('reads wall-clock numbers in the given zone, not the server one', () => {
      const original = process.env.TZ;
      const read = () =>
        TimezoneUtil.fromWallClock(VN, {
          year: 2026,
          month: 9,
          day: 20,
          hour: 18,
          minute: 0,
        }).toISOString();

      try {
        process.env.TZ = 'UTC';
        expect(read()).toBe('2026-09-20T11:00:00.000Z');
        process.env.TZ = 'Asia/Ho_Chi_Minh';
        expect(read()).toBe('2026-09-20T11:00:00.000Z');
        process.env.TZ = 'America/New_York';
        expect(read()).toBe('2026-09-20T11:00:00.000Z');
      } finally {
        process.env.TZ = original;
      }
    });

    it('defaults a missing time to midnight local', () => {
      const at = TimezoneUtil.fromWallClock(VN, {
        year: 2026,
        month: 8,
        day: 1,
      });
      expect(at.toISOString()).toBe('2026-07-31T17:00:00.000Z');
      expect(TimezoneUtil.formatDateKey(at, VN)).toBe('2026-08-01');
    });

    it('round-trips with formatDateKey', () => {
      const at = TimezoneUtil.fromWallClock(VN, {
        year: 2026,
        month: 9,
        day: 20,
        hour: 6,
        minute: 0,
      });
      expect(TimezoneUtil.formatDateKey(at, VN)).toBe('2026-09-20');
      const { start, end } = TimezoneUtil.dayRange(VN, '2026-09-20');
      expect(at >= start && at < end).toBe(true);
    });

    it('handles a zone with DST', () => {
      // 02:30 on 2026-03-29 does not exist in Berlin (clocks jump 02:00 -> 03:00);
      // the result must still be a real instant, not NaN.
      const at = TimezoneUtil.fromWallClock('Europe/Berlin', {
        year: 2026,
        month: 3,
        day: 29,
        hour: 2,
        minute: 30,
      });
      expect(Number.isNaN(at.getTime())).toBe(false);
    });
  });

  it('rejects an unknown zone', () => {
    expect(TimezoneUtil.isValid(VN)).toBe(true);
    expect(TimezoneUtil.isValid('Mars/Olympus_Mons')).toBe(false);
  });
});
