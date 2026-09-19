-- Bước 3–5 của §3.3: backfill, kiểm, rồi mới siết NOT NULL.

-- gen_random_uuid() có sẵn trong PostgreSQL 13+; giữ dòng này cho môi trường cũ.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Bước 3a: mỗi user đang có việc (với tư cách **người được giao**) hoặc có bảng
-- thì được một dự án "Công việc chung".
--
-- Chốt theo `assignee_id` chứ không phải `creator_id`: việc nằm ở dự án của
-- người phải làm nó. Mail ingestion có thể tạo việc cho người khác
-- (`resolveAssigneeId`), và bảng cũng đã gắn theo assignee — ba thứ phải cùng
-- một trục, nếu không người được giao sẽ không thấy việc của mình.
INSERT INTO "projects" (
    "id", "owner_id", "code", "name", "description",
    "color", "icon", "is_default", "archived", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    u."id",
    'CHUNG',
    'Công việc chung',
    NULL,
    '#0a436d',
    'folder',
    true,
    false,
    now(),
    now()
FROM "users" u
WHERE EXISTS (SELECT 1 FROM "tasks" t WHERE t."assignee_id" = u."id")
   OR EXISTS (SELECT 1 FROM "boards" b WHERE b."owner_id" = u."id");

-- Bước 3b: gán việc cũ vào dự án của **người được giao**.
UPDATE "tasks" t
SET "project_id" = p."id"
FROM "projects" p
WHERE p."owner_id" = t."assignee_id"
  AND p."code" = 'CHUNG'
  AND t."project_id" IS NULL;

-- Bước 3c: gán bảng cũ vào dự án của chủ bảng.
UPDATE "boards" b
SET "project_id" = p."id"
FROM "projects" p
WHERE p."owner_id" = b."owner_id"
  AND p."code" = 'CHUNG'
  AND b."project_id" IS NULL;

-- Bước 4: kiểm trước khi siết. Dừng migration tại đây còn hơn để cột NOT NULL
-- fail với một thông báo không nói được hàng nào hỏng.
DO $$
DECLARE
    orphan_tasks  bigint;
    orphan_boards bigint;
BEGIN
    SELECT count(*) INTO orphan_tasks  FROM "tasks"  WHERE "project_id" IS NULL;
    SELECT count(*) INTO orphan_boards FROM "boards" WHERE "project_id" IS NULL;

    IF orphan_tasks > 0 OR orphan_boards > 0 THEN
        RAISE EXCEPTION
            'Backfill dự án chưa xong: % việc và % bảng còn project_id NULL',
            orphan_tasks, orphan_boards;
    END IF;
END $$;

-- Bước 5: siết.
ALTER TABLE "tasks"  ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "boards" ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- Nới "mỗi người đúng một bảng" thành "mỗi người một bảng cho mỗi dự án".
DROP INDEX IF EXISTS "boards_owner_id_key";
CREATE UNIQUE INDEX "boards_owner_id_project_id_key" ON "boards"("owner_id", "project_id");
