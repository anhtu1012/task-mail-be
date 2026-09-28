-- Người dùng tự chỉnh thông báo Zalo: bật/tắt tin việc mới, các mốc nhắc
-- trước hạn, và bản tóm tắt hằng ngày.
--
-- Chạy thẳng trên dữ liệu đang có: chưa có bản ghi preference = dùng mặc định
-- hệ thống (giống hệt hành vi cũ: tin việc mới bật, nhắc 1 lần trước 24h).

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "user_id" TEXT NOT NULL,
    "new_task_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_offsets" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "digest_minute" SMALLINT NOT NULL DEFAULT 480,
    "digest_last_sent_on" VARCHAR(10),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- Chặn giờ tóm tắt vô nghĩa ngay ở DB (0..1439 phút trong ngày).
ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_digest_minute_check"
  CHECK ("digest_minute" BETWEEN 0 AND 1439);

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mốc nhắc nhỏ nhất đã gửi cho hạn hiện tại của việc.
ALTER TABLE "tasks" ADD COLUMN "deadline_reminded_offset" INTEGER;

-- Việc đã được nhắc theo cơ chế cũ (một lần, trước 24h) coi như đã nhắc ở mốc
-- 1440 phút — nếu không, cron mới sẽ nhắc lại chúng ở mốc 24h thêm một lần.
UPDATE "tasks"
SET "deadline_reminded_offset" = 1440
WHERE "deadline_notified_at" IS NOT NULL;
