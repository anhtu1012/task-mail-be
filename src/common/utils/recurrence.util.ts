/**
 * Tính mốc kế tiếp của một việc lặp.
 *
 * Tách khỏi `BoardCardService` vì đây là phần dễ sai nhất của cả tính năng và
 * là phần duy nhất kiểm được bằng test thuần: không DB, không Nest, chỉ ngày
 * vào — ngày ra.
 *
 * MÚI GIỜ: mọi phép tính "ngày nào, thứ mấy" chạy theo giờ **của người dùng**,
 * không phải UTC. Máy chủ chạy UTC còn người dùng ở GMT+7, nên một việc hạn
 * 06:00 sáng thứ Hai giờ Việt Nam là 23:00 **Chủ nhật** theo UTC — tính thứ
 * bằng UTC sẽ lệch đúng một ngày và người dùng thấy việc lặp rơi sai thứ mà
 * không hiểu vì sao. Giờ-phút của hạn cũ luôn được giữ nguyên.
 */
import { TimezoneUtil } from './timezone.util';

export type RepeatUnit = 'DAY' | 'WEEK' | 'MONTH';

export type RecurrenceRule = {
  unit: RepeatUnit;
  /** Số đơn vị giữa hai lượt, >= 1 */
  interval: number;
  /** 0=CN .. 6=T7. Chỉ dùng cho WEEK. Rỗng = giữ đúng thứ của hạn hiện tại */
  weekdays?: number[];
  /** 1..31. Chỉ dùng cho MONTH. Tháng ngắn hơn thì kẹp về ngày cuối tháng */
  dayOfMonth?: number | null;
  /** Không sinh lượt nào vượt quá mốc này */
  until?: Date | null;
  /** Số lượt CÒN LẠI sau lượt hiện tại. 0 = hết, null = vô hạn */
  remaining?: number | null;
};

type Wall = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=CN
};

/** Đọc một mốc UTC thành số giờ treo tường trong `timeZone` */
export function wallClockIn(at: Date, timeZone: string): Wall {
  const [year, month, day] = TimezoneUtil.formatDateKey(at, timeZone)
    .split('-')
    .map(Number);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const field: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = Number(part.value);
  }

  return {
    year,
    month,
    day,
    hour: (field.hour ?? 0) % 24,
    minute: field.minute ?? 0,
    // Ngày ở đây đã là ngày theo giờ người dùng, nên dựng lại bằng UTC rồi lấy
    // thứ là đúng — không phải một phép đổi múi giờ nữa.
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Mốc kế tiếp, hoặc `null` khi chuỗi lặp đã kết thúc (`remaining <= 0`, hoặc
 * mốc tính ra đã vượt `until`).
 */
export function nextOccurrence(
  base: Date,
  rule: RecurrenceRule,
  timeZone: string,
): Date | null {
  if (rule.remaining !== null && rule.remaining !== undefined) {
    if (rule.remaining <= 0) return null;
  }

  const interval = Math.max(1, Math.trunc(rule.interval));
  const from = wallClockIn(base, timeZone);
  const at = (year: number, month: number, day: number): Date =>
    TimezoneUtil.fromWallClock(timeZone, {
      year,
      month,
      day,
      hour: from.hour,
      minute: from.minute,
    });

  let next: Date;

  if (rule.unit === 'WEEK' && rule.weekdays?.length) {
    /*
     * Có chọn thứ: bước tới thứ gần nhất trong tập, tính từ ngày hôm sau. Nếu
     * phải vòng sang tuần mới thì nhảy thêm `interval - 1` tuần nữa — "hai
     * tuần một lần vào T2 và T5" nghĩa là T2, T5 của tuần này rồi nghỉ trọn
     * một tuần, chứ không phải rải đều mỗi 2 tuần cho từng thứ.
     */
    const wanted = [...new Set(rule.weekdays)]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);

    if (wanted.length === 0) {
      next = shiftDays(at, from, interval * 7);
    } else {
      const ahead = wanted.find((d) => d > from.weekday);
      if (ahead !== undefined) {
        next = shiftDays(at, from, ahead - from.weekday);
      } else {
        const wrap = 7 - from.weekday + wanted[0] + (interval - 1) * 7;
        next = shiftDays(at, from, wrap);
      }
    }
  } else if (rule.unit === 'MONTH') {
    const month0 = from.month - 1 + interval;
    const year = from.year + Math.floor(month0 / 12);
    const month = (((month0 % 12) + 12) % 12) + 1;
    const wanted = rule.dayOfMonth ?? from.day;
    // Ngày 31 ở tháng 4 lùi về 30, KHÔNG tràn sang tháng 5: người đặt "ngày 31
    // hàng tháng" muốn cuối tháng, không muốn mùng 1 tháng sau.
    next = at(year, month, Math.min(wanted, daysInMonth(year, month)));
  } else {
    const step = rule.unit === 'WEEK' ? interval * 7 : interval;
    next = shiftDays(at, from, step);
  }

  if (rule.until && next.getTime() > rule.until.getTime()) return null;
  return next;
}

/**
 * Cộng ngày trên **lịch treo tường** rồi mới đổi về UTC.
 *
 * Không cộng thẳng mili-giây: qua mốc đổi giờ mùa (DST) thì một ngày không
 * phải lúc nào cũng 24 tiếng, cộng thô sẽ làm việc lặp trôi mất một giờ mỗi
 * lần. Việt Nam không có DST nhưng dữ liệu có `tz` của người dùng, và người
 * dùng ở Âu/Mỹ thì gặp ngay.
 */
function shiftDays(
  at: (year: number, month: number, day: number) => Date,
  from: Wall,
  days: number,
): Date {
  const shifted = new Date(
    Date.UTC(from.year, from.month - 1, from.day + days),
  );
  return at(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** Các cột `repeat_*` của một hàng `tasks` */
export type RepeatColumns = {
  repeatUnit: RepeatUnit | null;
  repeatInterval: number | null;
  repeatWeekdays: number[];
  repeatDayOfMonth: number | null;
  repeatUntil: Date | null;
  repeatRemaining: number | null;
};

/** Hình dạng `repeat` mà API nhận vào */
export type RepeatInput = {
  unit: RepeatUnit;
  interval: number;
  weekdays?: number[] | null;
  dayOfMonth?: number | null;
  until?: string | Date | null;
  remaining?: number | null;
};

/**
 * Đổi `repeat` của DTO thành các cột để ghi xuống DB.
 *
 * Dọn sạch theo đơn vị: `weekdays` chỉ giữ khi lặp theo TUẦN, `dayOfMonth` chỉ
 * giữ khi lặp theo THÁNG. Nếu không, một người đổi từ "mỗi thứ 2, thứ 5" sang
 * "mỗi 3 ngày" sẽ để lại `repeat_weekdays` cũ trong hàng, và lần sau ai đọc
 * cũng phải đoán xem nó còn hiệu lực không.
 *
 * `null`/`undefined` = tắt lặp: mọi cột về rỗng, không sót gì.
 */
export function repeatColumns(input?: RepeatInput | null): RepeatColumns {
  if (!input?.unit || !input.interval) {
    return {
      repeatUnit: null,
      repeatInterval: null,
      repeatWeekdays: [],
      repeatDayOfMonth: null,
      repeatUntil: null,
      repeatRemaining: null,
    };
  }

  return {
    repeatUnit: input.unit,
    repeatInterval: input.interval,
    repeatWeekdays:
      input.unit === 'WEEK'
        ? [...new Set(input.weekdays ?? [])]
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            .sort((a, b) => a - b)
        : [],
    repeatDayOfMonth:
      input.unit === 'MONTH' ? (input.dayOfMonth ?? null) : null,
    repeatUntil: input.until ? new Date(input.until) : null,
    repeatRemaining: input.remaining ?? null,
  };
}
