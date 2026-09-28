/**
 * Các mốc nhắc trước hạn được phép chọn, tính bằng phút.
 *
 * Danh sách đóng chứ không cho nhập tự do: cron quét mỗi 5 phút, nên mốc lẻ
 * kiểu "7 phút" không bao giờ đúng giờ; và FE cần hiển thị nhãn dễ đọc cho
 * từng giá trị. Thêm mốc mới = thêm vào đây + vào `REMINDER_OFFSET_CHOICES`
 * của frontend, không cần migration.
 */
export const REMINDER_OFFSET_CHOICES = [
  15, 30, 60, 120, 180, 360, 720, 1440, 2880,
] as const;

/** Mốc lớn nhất — cron chỉ cần quét các việc có hạn trong khoảng này. */
export const MAX_REMINDER_OFFSET = Math.max(...REMINDER_OFFSET_CHOICES);

/** Chọn quá nhiều mốc là spam chính mình. */
export const MAX_REMINDER_OFFSETS = 3;

/** `HH:mm`, phút là bội số của 5 — khớp nhịp quét 5 phút của cron. */
export const DIGEST_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5][05]$/;

/**
 * Tóm tắt chỉ được gửi trong khoảng này tính từ giờ đã hẹn. Nhờ vậy cron lỡ
 * một nhịp vẫn gửi bù, nhưng đổi giờ hẹn thành một giờ đã qua trong ngày
 * không làm bot nhắn ngay lập tức.
 */
export const DIGEST_SEND_WINDOW_MINUTES = 60;

/** Số việc tối đa liệt kê trong mỗi nhóm của bản tóm tắt. */
export const DIGEST_MAX_ITEMS = 10;

export const NOTIFICATION_RATE_LIMIT = 60;

/**
 * Mặc định cho người chưa từng lưu — đúng hành vi trước khi có tính năng này:
 * nhắn khi có việc mới, nhắc một lần trước hạn `TASK_DEADLINE_REMINDER_HOURS`
 * (mặc định 24h), không có tóm tắt. `reminderOffsets` lấy từ env nên được điền
 * ở service, không cố định ở đây.
 */
export const DEFAULT_NOTIFICATION_PREFERENCE = {
  newTaskEnabled: true,
  digestEnabled: false,
  digestMinute: 8 * 60,
} as const;

export function minuteToTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinute(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
