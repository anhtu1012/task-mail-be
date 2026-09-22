-- Nhãn có icon, và lặp lại ở mức nâng cao.
--
-- Mọi cột đều nullable hoặc có DEFAULT, nên chạy được thẳng trên bảng đang có
-- dữ liệu mà không cần backfill: nhãn cũ có icon NULL (hiện như trước), việc
-- lặp cũ có repeat_weekdays rỗng + hai cột kết thúc NULL, tức là "lặp mãi theo
-- đúng ngày của hạn chót" — chính là hành vi đang chạy.

-- Icon của nhãn. Tên icon lấy từ danh sách đóng phía ứng dụng (LABEL_ICONS),
-- 20 ký tự là thừa sức cho tên dài nhất.
ALTER TABLE "board_labels" ADD COLUMN "icon" VARCHAR(20);

-- Lặp lại nâng cao. Chỉ có nghĩa khi "repeat_unit" khác NULL.
ALTER TABLE "tasks"
  ADD COLUMN "repeat_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "repeat_day_of_month" INTEGER,
  ADD COLUMN "repeat_until" TIMESTAMP(3),
  ADD COLUMN "repeat_remaining" INTEGER;

-- Chặn dữ liệu vô nghĩa ngay ở tầng DB thay vì chỉ tin vào DTO: các cột này sẽ
-- được ghi bởi cả API lẫn script, và một ngày 0 hay thứ 9 sẽ làm hàm tính lượt
-- kế tiếp quay vòng vô hạn.
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_repeat_day_of_month_check"
  CHECK ("repeat_day_of_month" IS NULL OR ("repeat_day_of_month" BETWEEN 1 AND 31));

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_repeat_remaining_check"
  CHECK ("repeat_remaining" IS NULL OR "repeat_remaining" >= 0);
