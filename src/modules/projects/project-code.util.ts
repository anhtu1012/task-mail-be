import { StringUtil } from '../../common/utils/string.util';
import {
  GENERATED_CODE_LENGTH,
  PROJECT_CODE_MAX_LENGTH,
  PROJECT_CODE_MIN_LENGTH,
} from './project.constants';

/**
 * Sinh mã dự án từ tên: bỏ dấu, lấy chữ cái đầu mỗi từ, viết HOA.
 *
 * Frontend có `suggestProjectCode` tương đương nhưng chỉ để điền sẵn vào ô
 * nhập — backend mới là nơi quyết định, vì chỉ backend thấy được các mã đã bị
 * chiếm.
 *
 * `taken` là tập mã đang dùng của cùng người dùng; trùng thì thêm số
 * (`KHA` → `KHA2` → `KHA3`…).
 */
export function generateProjectCode(name: string, taken: Set<string>): string {
  const base = buildBase(name);
  if (!taken.has(base)) return base;

  // Bắt đầu từ 2 để chuỗi đọc tự nhiên: KHA, KHA2, KHA3 — không có "KHA1".
  for (let suffix = 2; suffix < 1000; suffix++) {
    const tail = String(suffix);
    const head = base.slice(0, PROJECT_CODE_MAX_LENGTH - tail.length);
    const candidate = `${head}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }

  // 998 dự án cùng tiền tố là ngoài đời không xảy ra (trần là 30 dự án hoạt
  // động), nhưng vòng lặp vẫn phải có lối ra thay vì chạy vô tận.
  return `P${Date.now().toString(36).toUpperCase()}`.slice(
    0,
    PROJECT_CODE_MAX_LENGTH,
  );
}

function buildBase(name: string): string {
  const words = StringUtil.removeDiacritics(name)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  if (words.length === 0) return 'DA';

  const initials = words.map((word) => word[0]).join('');
  const base =
    initials.length >= PROJECT_CODE_MIN_LENGTH
      ? initials
      : // Một từ duy nhất ("Website") cho đúng một chữ cái, ngắn hơn mức tối
        // thiểu — lúc đó lấy luôn đầu từ đó thay vì chữ cái đầu.
        words[0];

  return base
    .slice(0, GENERATED_CODE_LENGTH)
    .padEnd(PROJECT_CODE_MIN_LENGTH, 'X');
}
