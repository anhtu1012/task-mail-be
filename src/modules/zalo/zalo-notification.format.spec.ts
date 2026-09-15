import { formatDeadline } from './zalo-notification.listener';

const VN = 'Asia/Ho_Chi_Minh';

/**
 * The reminder text used to be built with `toLocaleString('vi-VN')` and no
 * `timeZone`, so it rendered in the server's zone — UTC in the container. The
 * user saw a time seven hours off the one their task actually had.
 */
describe('formatDeadline', () => {
  // 11:00 UTC is 18:00 in Vietnam.
  const deadline = new Date('2026-09-20T11:00:00.000Z');

  it('renders in the recipient zone, whatever the server zone is', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const onUtcServer = formatDeadline(deadline, VN);
      process.env.TZ = 'America/New_York';
      const onUsServer = formatDeadline(deadline, VN);

      expect(onUtcServer).toBe(onUsServer);
      expect(onUtcServer).toContain('18:00');
      expect(onUtcServer).toContain('20/09/2026');
    } finally {
      process.env.TZ = original;
    }
  });

  it('follows the recipient zone when it is not Vietnam', () => {
    // Same instant, a zone one hour behind Vietnam.
    expect(formatDeadline(deadline, 'Asia/Jakarta')).toContain('18:00');
    expect(formatDeadline(deadline, 'Asia/Tokyo')).toContain('20:00');
  });

  it('says "không có" when there is no deadline', () => {
    expect(formatDeadline(null, VN)).toBe('không có');
    expect(formatDeadline(undefined, VN)).toBe('không có');
  });
});
