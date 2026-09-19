-- Bước 1–2 của §3.3: tạo bảng và thêm cột **nullable**.
-- Việc siết NOT NULL + khoá ngoại nằm ở migration kế tiếp, sau khi đã backfill.
-- Gộp hai bước vào một migration sẽ fail giữa chừng trên bảng đang có dữ liệu.

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(280),
    "color" VARCHAR(7) NOT NULL,
    "icon" VARCHAR(20) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_owner_id_code_key" ON "projects"("owner_id", "code");
CREATE UNIQUE INDEX "projects_owner_id_name_key" ON "projects"("owner_id", "name");
CREATE INDEX "projects_owner_id_archived_idx" ON "projects"("owner_id", "archived");

-- Ràng buộc "tối đa một dự án mặc định mỗi người". Prisma không diễn đạt được
-- unique một phần nên nó chỉ tồn tại ở đây; `setDefault` còn gỡ cờ trong
-- transaction nữa — cố tình làm cả hai.
CREATE UNIQUE INDEX "projects_one_default_per_owner"
    ON "projects"("owner_id") WHERE "is_default";

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: nullable trước đã.
ALTER TABLE "tasks" ADD COLUMN "project_id" TEXT;
ALTER TABLE "boards" ADD COLUMN "project_id" TEXT;
