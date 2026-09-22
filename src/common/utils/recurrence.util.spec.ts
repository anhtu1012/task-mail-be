import { nextOccurrence, wallClockIn } from './recurrence.util';

const VN = 'Asia/Ho_Chi_Minh';

/** Mốc UTC của một giờ treo tường Việt Nam, viết cho dễ đọc trong test */
const vn = (iso: string) => new Date(`${iso}+07:00`);

describe('nextOccurrence', () => {
  it('cộng ngày và giữ nguyên giờ phút', () => {
    const next = nextOccurrence(
      vn('2026-09-22T09:30:00'),
      { unit: 'DAY', interval: 3 },
      VN,
    );
    expect(next).toEqual(vn('2026-09-25T09:30:00'));
  });

  it('tuần không chọn thứ thì giữ đúng thứ cũ', () => {
    // 22/09/2026 là thứ Ba
    const next = nextOccurrence(
      vn('2026-09-22T08:00:00'),
      { unit: 'WEEK', interval: 2 },
      VN,
    );
    expect(next).toEqual(vn('2026-10-06T08:00:00'));
  });

  it('tuần có chọn thứ thì nhảy tới thứ kế tiếp trong tuần', () => {
    // T3 22/09 -> thứ Năm 24/09 (weekdays = T2, T5)
    const next = nextOccurrence(
      vn('2026-09-22T08:00:00'),
      { unit: 'WEEK', interval: 1, weekdays: [1, 4] },
      VN,
    );
    expect(next).toEqual(vn('2026-09-24T08:00:00'));
  });

  it('hết thứ trong tuần thì vòng sang tuần sau, có tính interval', () => {
    // T5 24/09, tập {T2, T5}, 2 tuần một lần -> bỏ trọn một tuần, tới T2 05/10
    const next = nextOccurrence(
      vn('2026-09-24T08:00:00'),
      { unit: 'WEEK', interval: 2, weekdays: [1, 4] },
      VN,
    );
    expect(next).toEqual(vn('2026-10-05T08:00:00'));
  });

  it('tháng theo ngày cố định', () => {
    const next = nextOccurrence(
      vn('2026-09-10T07:00:00'),
      { unit: 'MONTH', interval: 1, dayOfMonth: 15 },
      VN,
    );
    expect(next).toEqual(vn('2026-10-15T07:00:00'));
  });

  it('ngày 31 ở tháng chỉ có 30 ngày thì kẹp về cuối tháng, không tràn', () => {
    // 31/03 + 1 tháng -> 30/04, KHÔNG phải 01/05
    const next = nextOccurrence(
      vn('2026-03-31T09:00:00'),
      { unit: 'MONTH', interval: 1, dayOfMonth: 31 },
      VN,
    );
    expect(next).toEqual(vn('2026-04-30T09:00:00'));
  });

  it('tháng 12 + 1 sang năm sau', () => {
    const next = nextOccurrence(
      vn('2026-12-20T09:00:00'),
      { unit: 'MONTH', interval: 1 },
      VN,
    );
    expect(next).toEqual(vn('2027-01-20T09:00:00'));
  });

  it('dừng khi vượt mốc kết thúc', () => {
    const next = nextOccurrence(
      vn('2026-09-22T09:00:00'),
      { unit: 'DAY', interval: 7, until: vn('2026-09-26T23:59:00') },
      VN,
    );
    expect(next).toBeNull();
  });

  it('mốc kết thúc rơi đúng ngày sinh ra thì vẫn sinh', () => {
    const next = nextOccurrence(
      vn('2026-09-22T09:00:00'),
      { unit: 'DAY', interval: 1, until: vn('2026-09-23T09:00:00') },
      VN,
    );
    expect(next).toEqual(vn('2026-09-23T09:00:00'));
  });

  it('dừng khi hết số lượt còn lại', () => {
    expect(
      nextOccurrence(
        vn('2026-09-22T09:00:00'),
        { unit: 'DAY', interval: 1, remaining: 0 },
        VN,
      ),
    ).toBeNull();
    expect(
      nextOccurrence(
        vn('2026-09-22T09:00:00'),
        { unit: 'DAY', interval: 1, remaining: 1 },
        VN,
      ),
    ).toEqual(vn('2026-09-23T09:00:00'));
  });

  it('thứ tính theo giờ người dùng, không phải UTC', () => {
    /*
     * 06:00 thứ Hai 21/09 giờ VN = 23:00 Chủ nhật 20/09 theo UTC. Tính bằng UTC
     * sẽ tưởng đang là Chủ nhật và nhảy sai một ngày.
     */
    const monday6am = vn('2026-09-21T06:00:00');
    expect(wallClockIn(monday6am, VN).weekday).toBe(1);
    expect(monday6am.getUTCDay()).toBe(0); // bằng chứng là hai thứ khác nhau

    // Tập {T2}: từ T2 phải nhảy trọn một tuần
    const next = nextOccurrence(
      monday6am,
      { unit: 'WEEK', interval: 1, weekdays: [1] },
      VN,
    );
    expect(next).toEqual(vn('2026-09-28T06:00:00'));
  });

  it('giữ nguyên giờ treo tường khi qua mốc đổi giờ mùa', () => {
    // Berlin lùi giờ ngày 25/10/2026. 09:00 vẫn phải là 09:00 ở cả hai bên mốc.
    const berlin = 'Europe/Berlin';
    const before = new Date('2026-10-24T07:00:00Z'); // 09:00 giờ Berlin (UTC+2)
    const next = nextOccurrence(before, { unit: 'DAY', interval: 2 }, berlin);
    expect(wallClockIn(next as Date, berlin)).toMatchObject({
      year: 2026,
      month: 10,
      day: 26,
      hour: 9,
      minute: 0,
    });
  });
});
