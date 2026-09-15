# Múi giờ — quy tắc bắt buộc

Server chạy **UTC** (container `node:20-alpine`, không có `TZ` trong `Dockerfile`
lẫn `render.yaml`), người dùng ở **GMT+7**, và máy dev cũng GMT+7. Chênh lệch này
làm mọi lỗi múi giờ **vô hình khi dev** và chỉ lộ ra trên production.

## Ba quy tắc

### 1. Không bao giờ dựng `Date` từ số bằng constructor giờ địa phương

```ts
// SAI — đọc các số theo múi giờ của server
new Date(2026, 8, 20, 18, 0);

// ĐÚNG — nói rõ các số này thuộc múi giờ nào
TimezoneUtil.fromWallClock('Asia/Ho_Chi_Minh', {
  year: 2026, month: 9, day: 20, hour: 18, minute: 0,
});
```

Một email ghi "Hạn: 20/09/2026 18:00" là 18:00 **giờ người nhận**. Dùng
constructor địa phương thì cùng một email sinh ra hai mốc thời gian khác nhau
trên container UTC và trên laptop GMT+7 — lệch đúng 7 tiếng.

### 2. Không bao giờ format thời gian mà thiếu `timeZone`

```ts
// SAI — render theo múi giờ server
date.toLocaleString('vi-VN');

// ĐÚNG
new Intl.DateTimeFormat('vi-VN', { timeZone, ... }).format(date);
```

### 3. Múi giờ của người dùng lấy từ một nguồn duy nhất

`UsersService.resolveTimezone(userId, requested?)` — thứ tự ưu tiên:
`?tz=` của request → cột `User.timezone` → `DEFAULT_TIMEZONE`
(`Asia/Ho_Chi_Minh`). `BoardAccessService.resolveTimezone` uỷ quyền về đây, nên
bảng công việc, ingest mail và nhắc Zalo đọc cùng một giá trị.

Tác vụ nền (cron) không có request để lấy `?tz=`, nên chúng **phải** gọi hàm này
chứ không được rơi về đồng hồ của server.

## Vì sao không đặt `TZ=Asia/Ho_Chi_Minh` cho container

Đặt `TZ` sẽ vá được triệu chứng chỉ bằng một dòng, nhưng:

- che mất mọi chỗ code còn phụ thuộc múi giờ server, thay vì để chúng lộ ra;
- hỏng lại ngay khi có người dùng ở múi giờ khác, vì lúc đó không còn *một* múi
  giờ đúng cho cả hệ thống.

Giữ server ở UTC và bắt code nói rõ múi giờ là cách duy nhất đúng khi đã có cột
`User.timezone`.

## Lỗi đã từng có (sửa 16/09/2026)

| Chỗ | Triệu chứng |
|---|---|
| `task-mail.parser.ts` | Dùng `new Date(y, m, d, h, min)`. Mail ghi 18:00 → lưu `18:00Z` = **01:00 sáng hôm sau giờ VN**, lệch 7 tiếng |
| `zalo-notification.listener.ts` | `toLocaleString('vi-VN')` không truyền `timeZone` |

Hai lỗi **triệt tiêu nhau ở phần hiển thị** — tin nhắn Zalo vẫn in "18:00
20/9/2026" nên nhìn qua tưởng đúng. Nhưng mốc thời gian trong DB sai, kéo theo
sai thời điểm nhắc (nhắc lúc 01:00 sáng), sai `deadlineStatus`, sai
`/boards/me/today` và `/boards/me/agenda`.

**Dữ liệu ĐÃ bị hỏng và đã sửa (16/09/2026).** Toàn bộ 18 task tạo từ mail có
deadline đều lệch đúng +7 giờ. Sửa bằng `dist/scripts/fix-mail-deadlines.js`:
script đọc lại dòng `Deadline:` trong `description` (nội dung mail gốc được giữ
nguyên) rồi tính lại mốc đúng, chỉ ghi những dòng thật sự lệch — không cộng trừ
mù 7 tiếng, nên task tạo từ giao diện không bị đụng tới.

## ⚠️ Bẫy khi tự kiểm tra: `pg` và Prisma đọc cột này KHÁC NHAU

Cột `deadline` là `TIMESTAMP(3)` **without time zone**. Cùng một giá trị thô
`2026-09-15 17:00:00` sẽ được đọc thành hai mốc khác hẳn nhau:

| Cách đọc | Kết quả | Vì sao |
|---|---|---|
| Driver `pg` thô | `2026-09-15T10:00:00Z` | Diễn giải theo **giờ máy đang chạy script** (GMT+7) |
| Prisma (tức API) | `2026-09-15T17:00:00Z` | Diễn giải theo **UTC** |

Điều này đã khiến một lượt kiểm tra kết luận nhầm là "dữ liệu vẫn đúng", trong
khi API trả về giá trị sai. **Luôn kiểm bằng Prisma**, hoặc bằng chính response
của API — đừng dùng `pg` thô để phán xét giá trị thời gian.

## Test giữ chỗ này

- `timezone.util.spec.ts` — `fromWallClock` cho cùng kết quả dưới `TZ=UTC`,
  `Asia/Ho_Chi_Minh` và `America/New_York`.
- `task-mail.parser.spec.ts` — "does not depend on the server timezone".
- `zalo-notification.format.spec.ts` — tin nhắn render theo múi giờ người nhận.

Cả ba đều đổi `process.env.TZ` giữa chừng, và Node có áp dụng thay đổi đó (đã
kiểm), nên test thật sự bắt được hồi quy chứ không chạy suông.
