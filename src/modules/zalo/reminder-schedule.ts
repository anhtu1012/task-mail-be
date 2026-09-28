/**
 * Chọn mốc nhắc hạn cần gửi ngay bây giờ, hoặc `null` nếu chưa tới / đã gửi.
 *
 * Mốc "đang tới" là mốc NHỎ NHẤT mà thời gian còn lại đã lọt vào
 * (`minutesLeft <= offset`). Chỉ gửi khi nó nhỏ hơn mốc đã nhắc lần trước:
 *
 * - mốc [1440, 60], còn 23h  → gửi 1440; còn 50 phút → gửi 60; mỗi mốc một lần.
 * - mốc [1440, 60], việc tạo lúc còn 30 phút → chỉ gửi 60, KHÔNG gửi dồn cả
 *   1440 lẫn 60 cùng lúc (cả hai đều "đã tới", nhưng lời nhắc 1 ngày giờ vô nghĩa).
 * - người dùng đổi mốc sau khi đã được nhắc: mốc mới lớn hơn mốc đã nhắc thì bỏ
 *   qua (không nhắc lùi), nhỏ hơn thì vẫn nhắc.
 *
 * @param offsets        mốc của người dùng (phút), thứ tự tuỳ ý
 * @param minutesLeft    phút còn lại tới hạn, > 0
 * @param remindedOffset mốc nhỏ nhất đã nhắc cho hạn hiện tại, null = chưa
 */
export function pickReminderOffset(
  offsets: readonly number[],
  minutesLeft: number,
  remindedOffset: number | null,
): number | null {
  let due: number | null = null;
  for (const offset of offsets) {
    if (minutesLeft <= offset && (due === null || offset < due)) due = offset;
  }
  if (due === null) return null;
  if (remindedOffset !== null && due >= remindedOffset) return null;
  return due;
}

/** "2 ngày", "1 giờ 30 phút", "15 phút" — cho câu "còn … nữa" trong tin nhắn. */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  if (hours > 0) return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
  return `${mins} phút`;
}
