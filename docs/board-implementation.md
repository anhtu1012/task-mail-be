# Bảng công việc cá nhân — ghi chú bàn giao backend

Triển khai theo `task-mail-fe/docs/backend/board-spec.md`. Tài liệu này chỉ ghi
những gì **khác** hoặc **cần biết thêm** so với đặc tả.

## Trả lời mục 9

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Nới giới hạn tần suất? | **Có.** `move`, `snooze`, `PATCH /checklist-items/:id`, tạo thẻ và `lists/:id/move` chạy ở **120 req / 60 s** (`src/modules/board/board-throttle.ts`). Không cần `batch-move`. |
| 2 | Múi giờ lưu ở đâu? | **Cả hai.** Thêm cột `User.timezone` (nullable). Thứ tự ưu tiên: `?tz=` → hồ sơ người dùng → `Asia/Ho_Chi_Minh`. |
| 3 | Lưu đính kèm ở đâu? | **Chưa chốt** — chưa làm upload. `POST /tasks/:id/attachments` hiện nhận JSON `{ name, kind, url, sizeBytes }`, tức frontend tự có URL. Khi chốt S3 thì thêm endpoint xin URL upload, hợp đồng hiện tại không đổi. |
| 4 | Việc lặp cách 1 hay 2? | **Cách 1** — sinh ngay khi hoàn thành, trả trong `next`. Không có job nền. |
| 5 | `unaccent` đã bật chưa? | Migration `20260915000000_add_personal_board` có `CREATE EXTENSION IF NOT EXISTS "unaccent"`. Cần user DB có quyền tạo extension. |
| 6 | Xoá mềm được không? | **Được.** `Task.deletedAt`; `DELETE /tasks/:id` là xoá mềm, `POST /tasks/:id/restore` khôi phục cả checklist lẫn ghi chú (chúng không bị xoá). |
| 7 | Mỗi người một bảng? | **Giữ** `Board.ownerId @unique`. Bảng được tạo tự động ở lần gọi API bảng đầu tiên, kèm 5 danh sách mặc định và gán toàn bộ task cũ theo `status`. |

## Thay đổi phá vỡ tương thích — cần frontend sửaaa

**`PATCH /tasks/:id/complete` đổi hình dạng response.**

```jsonc
// Trước
{ "id": "...", "title": "...", "status": "DONE", ... }
// Sau (mục 6 của đặc tả)
{ "completed": { /* thẻ rút gọn */ }, "next": { /* thẻ lặp mới */ } | null }
```

Đây là chỗ duy nhất phá vỡ tương thích. Các màn `/kanban`, `/tasks`, `/dashboard`
gọi endpoint này cần đọc `res.completed` thay vì `res`. Mọi endpoint cũ khác giữ
nguyên.

## Những điểm đặc tả để mở, backend đã chốt

- **`today.overdue` và `today.dueToday` cố tình chồng nhau.** Việc đến hạn 06:00
  hôm nay, lúc 10:00 sáng, nằm trong cả hai — đúng như định nghĩa ở mục 4.5, và
  đúng với ô nghiệm thu "dueToday đúng với việc đến hạn 06:00 và 23:00".
  Riêng **danh sách** `dueToday` của `/agenda` thì loại việc quá hạn (mục 4.11),
  còn `plannedMinutes`/`doneToday` của `/agenda` dùng đúng con số của `/today`
  để hai chỗ trên màn không bao giờ lệch nhau.
- **`hasDescription` tính bằng SQL**, không kéo `description` về Node — mô tả có
  ảnh dán dạng `data:` URI nặng vài trăm KB, `/full` không chịu nổi.
  `<p><br></p>` → `false`.
- **Hộp thư đến.** Task tạo tự động (mail ingestion) nay được gán `boardId` ngay
  lúc tạo, `listId` để null. `/boards/me/full` còn nhận thêm mọi task mồ côi
  (`boardId = null`) của chính người gọi làm lưới an toàn cho dữ liệu cũ.
- **Nhãn tạo slug tự động** từ tên (`Báo giá` → `baogia`), unique theo bảng.
- **WIP là cảnh báo.** Vượt giới hạn trả 200 kèm `warning: "LIST_WIP_EXCEEDED"`,
  không chặn thao tác kéo thả.
- **`?undo=true`** trên `move`, `snooze`, `PATCH /checklist-items/:id` để bỏ ghi
  nhật ký khi người dùng bấm Ctrl+Z.

## Endpoint thêm ngoài đặc tả

Đặc tả không nói Hộp thư đến phân trang và rebalance thế nào (nó không có bản ghi
`TaskList`), nên có thêm:

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/boards/me/inbox/cards` | Như `/lists/:id/cards` nhưng cho `listId = null` |
| POST | `/boards/me/inbox/rebalance` | Như `/lists/:id/rebalance` |
| POST | `/tasks/inbox/cards` | Tạo thẻ thẳng vào Hộp thư đến |
| PATCH | `/tasks/:id/reopen` | Mở lại việc đã hoàn thành |
| GET/POST | `/boards/me/labels`, `/boards/:id/labels` | Quản lý nhãn |
| PATCH/DELETE | `/labels/:id` | |
| PUT | `/tasks/:id/labels` | Đặt lại toàn bộ nhãn trong một lần gọi |

## Chạy migration

Dockerfile đã chạy sẵn migration lúc khởi động container:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
```

Migration `20260915000000_add_personal_board` **đã chạy thành công** trên DB
Supabase `aws-0-ap-southeast-1` ngày 2026-09-15. Ghi nhận từ lần chạy đó:

- `CREATE EXTENSION unaccent` chạy được với role `postgres` (không cần superuser,
  chỉ cần `rolcreatedb` — Supabase đã cho sẵn).
- `ALTER COLUMN description TYPE TEXT` là **no-op**, cột vốn đã là `text`.
- Backfill: 23 task cũ được gán vào cột theo `status`, position đánh bội số 1024.

## Danh sách nghiệm thu (mục 8) — trạng thái

**Đã chứng minh trên DB thật** (boot app rồi gọi service, xem mục "Đã kiểm" dưới):
`/search?q=bao gia` ra "Báo giá", tìm theo `code`, tìm trong mô tả đã bóc thẻ,
`hasDescription` cho `<p><br></p>` và `<p>&nbsp;</p>` đều `false`, lọc `<script>`
và `onerror`, WIP chỉ cảnh báo không chặn, chèn 60 lần rồi rebalance giữ nguyên
thứ tự, `cardCounts` là tổng thật, `move` hai lần cùng toạ độ đều thành công,
người dùng khác nhận `CARD_NOT_FOUND`, xoá mềm + khôi phục.

**Có unit test:** bẫy múi giờ 06:00/23:00 giờ VN, DST, làm sạch HTML, position.

**Vẫn chưa kiểm được:** mốc 400 ms với bảng 200 thẻ (DB hiện chỉ có 23 task),
`/agenda` với thẻ thứ 25 của một cột, lưu trữ danh sách.

### Lỗi đã tìm ra nhờ chạy thật

`has_description` trong SQL trả `true` cho `<p>&nbsp;</p>`, lệch với
`RichTextUtil.isEmpty` phía JS. Nguyên nhân: `sanitize-html` giải mã `&nbsp;`
thành ký tự U+00A0 thật; `\s` của JS bắt được ký tự đó còn `btrim` của Postgres
mặc định chỉ cắt dấu cách ASCII. Đã sửa bằng `replace(..., chr(160), ' ')` trong
`board-card.repository.ts`. Typecheck và unit test **không** bắt được lỗi này —
đó là lý do phải chạy thật.
