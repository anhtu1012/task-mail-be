import { formatDuration, pickReminderOffset } from './reminder-schedule';

describe('pickReminderOffset', () => {
  it('gửi mốc lớn khi vừa lọt vào nó, rồi mốc nhỏ khi tới lượt', () => {
    expect(pickReminderOffset([1440, 60], 23 * 60, null)).toBe(1440);
    expect(pickReminderOffset([1440, 60], 23 * 60, 1440)).toBeNull();
    expect(pickReminderOffset([1440, 60], 50, 1440)).toBe(60);
    expect(pickReminderOffset([1440, 60], 10, 60)).toBeNull();
  });

  it('việc tạo sát hạn chỉ nhận mốc nhỏ nhất đã tới, không dồn nhiều tin', () => {
    expect(pickReminderOffset([1440, 60], 30, null)).toBe(60);
  });

  it('chưa lọt vào mốc nào thì không gửi', () => {
    expect(pickReminderOffset([60], 120, null)).toBeNull();
  });

  it('không có mốc (tắt nhắc) thì không gửi', () => {
    expect(pickReminderOffset([], 5, null)).toBeNull();
  });

  it('không phụ thuộc thứ tự mốc', () => {
    expect(pickReminderOffset([60, 1440, 180], 100, null)).toBe(180);
  });

  it('đổi sang mốc lớn hơn mốc đã nhắc thì không nhắc lùi', () => {
    expect(pickReminderOffset([2880], 100, 1440)).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [15, '15 phút'],
    [60, '1 giờ'],
    [90, '1 giờ 30 phút'],
    [1440, '1 ngày'],
    [1500, '1 ngày 1 giờ'],
    [0.2, '1 phút'],
  ])('%p phút → %p', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
