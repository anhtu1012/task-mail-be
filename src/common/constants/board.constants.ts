import { TaskStatus } from '../enums/task-status.enum';

/** Gap between two neighbouring `position` values when appending. */
export const POSITION_GAP = 1024;

/**
 * Float64 keeps ~15 significant digits, so repeatedly halving the same gap
 * eventually collapses it. Below this the column is renumbered.
 */
export const MIN_POSITION_GAP = 0.001;

export const DEFAULT_CARDS_PER_LIST = 20;
export const MAX_CARDS_PER_LIST = 50;

/** Used whenever neither the request nor the user profile states a zone. */
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export const DEFAULT_BOARD_TITLE = 'Bảng công việc của tôi';

/**
 * Icon hợp lệ của nhãn.
 *
 * Danh sách ĐÓNG, cùng lý do với `icon` của dự án: frontend vẽ bằng một bộ icon
 * đã import sẵn, nên một tên lạ lọt vào DB sẽ thành ô trống trên giao diện mà
 * không có lỗi nào báo. Tên lấy đúng theo lucide-react (dạng kebab-case).
 *
 * Thêm icon mới thì phải thêm ở CẢ HAI nơi — hằng số này và `LABEL_ICONS` của
 * frontend — nếu không nhãn tạo được nhưng không hiện ra hình.
 */
export const LABEL_ICONS = [
  'tag',
  'star',
  'flag',
  'bell',
  'heart',
  'zap',
  'phone',
  'mail',
  'users',
  'folder',
  'coins',
  'bug',
] as const;

export type LabelIcon = (typeof LABEL_ICONS)[number];

/**
 * Seeded on first access so a brand new board is not completely empty.
 *
 * Deliberately ONE column, not a full workflow. Seeding five columns decided
 * how the user must work before they had said anything about it, and most
 * people ended up with three columns they never used but had to look at every
 * day — deleting is a chore, so they just left them there.
 *
 * "Hôm nay" stays as a worked example: it shows what a column is and that a
 * column can drive task status (`mapsToStatus`). Everything else the user adds
 * themselves through "Thêm danh sách".
 *
 * No `wipLimit`: on the only column of a board, a cap of 5 would flag the
 * sixth card as over-limit while there is nowhere else to move it to. WIP
 * limits make sense once the user has built their own columns, and they can
 * set one per column at that point.
 */
export const DEFAULT_LISTS: ReadonlyArray<{
  title: string;
  mapsToStatus: TaskStatus | null;
  wipLimit: number | null;
}> = [{ title: 'Hôm nay', mapsToStatus: TaskStatus.TODO, wipLimit: null }];
