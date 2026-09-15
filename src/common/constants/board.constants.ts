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

/** Seeded on first access so a brand new user never sees an empty board. */
export const DEFAULT_LISTS: ReadonlyArray<{
  title: string;
  mapsToStatus: TaskStatus | null;
  wipLimit: number | null;
}> = [
  { title: 'Hôm nay', mapsToStatus: TaskStatus.TODO, wipLimit: 5 },
  { title: 'Đang làm', mapsToStatus: TaskStatus.IN_PROGRESS, wipLimit: 3 },
  { title: 'Tuần này', mapsToStatus: null, wipLimit: null },
  { title: 'Sau này', mapsToStatus: null, wipLimit: null },
  { title: 'Hoàn thành', mapsToStatus: TaskStatus.DONE, wipLimit: null },
];
