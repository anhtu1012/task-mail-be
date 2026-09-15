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

  it('rejects an unknown zone', () => {
    expect(TimezoneUtil.isValid(VN)).toBe(true);
    expect(TimezoneUtil.isValid('Mars/Olympus_Mons')).toBe(false);
  });
});
