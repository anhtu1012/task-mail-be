/**
 * Danh sách đóng — frontend chỉ vẽ được 8 icon này (`PROJECT_ICONS` trong
 * `models/project.ts`). Giá trị lạ FE vẽ thành `folder`, nhưng chặn từ đây thì
 * dữ liệu không bao giờ rơi vào trạng thái đó.
 */
export const PROJECT_ICONS = [
  'folder',
  'briefcase',
  'home',
  'rocket',
  'target',
  'book',
  'heart',
  'users',
] as const;

export type ProjectIcon = (typeof PROJECT_ICONS)[number];

export const DEFAULT_PROJECT_ICON: ProjectIcon = 'folder';
export const DEFAULT_PROJECT_COLOR = '#0a436d';

/**
 * Dự án sinh tự động: lúc đăng ký, lúc migration backfill, và lúc mail
 * ingestion gặp một người chưa có dự án nào. Ba nơi phải dùng đúng một bộ giá
 * trị, nếu không `@@unique([ownerId, code])` sẽ nổ ở nơi thứ hai.
 */
export const DEFAULT_PROJECT_CODE = 'CHUNG';
export const DEFAULT_PROJECT_NAME = 'Công việc chung';

/**
 * "Công việc chung" là dữ liệu cứng của hệ thống: không xoá, không lưu trữ,
 * không đổi mã. Nhận diện bằng `code` chứ không bằng `isDefault` — cờ mặc định
 * đổi sang dự án khác được, còn mã CHUNG thì `ensureDefaultProject` dựa vào để
 * tìm lại đúng dự án này.
 */
export const isSystemProject = (project: { code: string }): boolean =>
  project.code === DEFAULT_PROJECT_CODE;

export const PROJECT_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;
export const PROJECT_CODE_MIN_LENGTH = 2;
export const PROJECT_CODE_MAX_LENGTH = 8;
/** Độ dài mã sinh tự động từ tên, chừa chỗ cho hậu tố số khi trùng. */
export const GENERATED_CODE_LENGTH = 4;

export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 280;
export const PROJECT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Trần số dự án **hoạt động** mỗi người (§12 câu 3). Con số này không phải giới
 * hạn kỹ thuật mà là giới hạn dùng được: quá ngần này thì bộ chọn dự án không
 * còn đọc nổi, và đây là công cụ cá nhân chứ không phải hệ quản trị danh mục.
 * Dự án đã lưu trữ không tính vào trần.
 */
export const MAX_ACTIVE_PROJECTS_PER_USER = 30;
