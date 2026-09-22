-- Sự kiện lịch (EVENT) dùng chung bảng `tasks` với việc (TASK).
--
-- Additive hoàn toàn: cột mới đều nullable hoặc có DEFAULT, và mọi hàng đang
-- có nhận `kind = 'TASK'` — tức là hành vi y hệt trước khi chạy migration này.

CREATE TYPE "ItemKind" AS ENUM ('TASK', 'EVENT');

ALTER TABLE "tasks"
  ADD COLUMN "kind" "ItemKind" NOT NULL DEFAULT 'TASK',
  ADD COLUMN "start_at" TIMESTAMP(3),
  ADD COLUMN "end_at" TIMESTAMP(3),
  ADD COLUMN "all_day" BOOLEAN NOT NULL DEFAULT false;

-- Bất biến của mô hình, ép ở tầng DB chứ không chỉ tin vào DTO: sự kiện phải
-- có đủ hai mốc và không được kết thúc trước khi bắt đầu; việc thì không mang
-- hai mốc đó. Cả API lẫn script đều ghi vào bảng này.
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_event_range_check"
  CHECK (
    ("kind" = 'TASK' AND "start_at" IS NULL AND "end_at" IS NULL)
    OR
    ("kind" = 'EVENT' AND "start_at" IS NOT NULL AND "end_at" IS NOT NULL
      AND "end_at" >= "start_at")
  );

-- Lịch hỏi "sự kiện nào của dự án này chạm vào khoảng đang xem"
CREATE INDEX "tasks_project_id_kind_start_at_idx"
  ON "tasks"("project_id", "kind", "start_at");
