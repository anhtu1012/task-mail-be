/**
 * Mọi khoá cache ở một chỗ, để chỗ đọc và chỗ xoá không lệch nhau một ký tự.
 *
 * TTL chỉ là lưới an toàn cho khoá có xoá chủ động khi ghi; riêng danh sách dự
 * án thì TTL CHÍNH LÀ độ tươi của số liệu thống kê trong đó (xem PROJECTS).
 */
export const CACHE_TTL = {
  TASK_TYPES: 60 * 60,
  LABELS: 10 * 60,
  /**
   * Danh sách dự án kèm số việc mở/quá hạn — những con số đổi theo MỌI lần ghi
   * task, qua hàng chục đường ghi khác nhau. Không xoá theo từng đường đó mà
   * chấp nhận thống kê trễ tối đa 30 giây; bản thân dự án (tên, màu, mặc định)
   * vẫn được xoá ngay khi đổi.
   */
  PROJECTS: 30,
} as const;

export const CacheKeys = {
  taskTypes: () => 'task-types:all',
  boardLabels: (boardId: string) => `labels:board:${boardId}`,
  projectList: (ownerId: string, includeArchived: boolean) =>
    `projects:owner:${ownerId}:${includeArchived ? 'all' : 'active'}`,
  /** Cả hai biến thể — một lần ghi dự án làm cũ cả hai. */
  projectLists: (ownerId: string) => [
    CacheKeys.projectList(ownerId, false),
    CacheKeys.projectList(ownerId, true),
  ],
};
