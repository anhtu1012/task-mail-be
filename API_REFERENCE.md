# API Reference — nestjs-auth-cms

Tài liệu này mô tả toàn bộ API backend để dựng frontend. Được tạo bằng cách quét trực tiếp source code (controllers, DTOs, services, guards, Prisma schema) — phản ánh đúng hành vi thực tế tại thời điểm viết (cập nhật 2026-09-28, commit `fd7e6ca`: đã có projects, board/kanban, EVENT, lặp lại, `/users`, Zalo broadcast).

## 1. Thông tin chung

- **Base URL**: không có global prefix — gọi thẳng `http://localhost:8888/auth/login`, `http://localhost:8888/tasks`, ... (không phải `/api/...`).
- **CORS**: `origin: true, credentials: true` — FE phải gửi kèm `credentials: 'include'` (fetch) hoặc `withCredentials: true` (axios) để cookie refresh-token hoạt động.
- **Body limit**: JSON/urlencoded tối đa **10 MB** (để mô tả có thể chứa ảnh `data:` URI).
- **Swagger UI**: `GET /api/docs` (bật `persistAuthorization`, hỗ trợ cả Bearer token và cookie `refresh_token`).
- **Validation**: mọi DTO dùng `class-validator`, bật `whitelist + forbidNonWhitelisted + transform + enableImplicitConversion` → gửi field thừa (body **hoặc query**) sẽ bị `400 Bad Request`, `errorCode: "ERROR"`, `message: string[]`.
- **Global guard**: **mọi route mặc định yêu cầu Bearer access token**, trừ route có đánh dấu **Public**.
- **Role**: đọc từ JWT → đổi role chỉ có hiệu lực sau khi refresh token. Bị chặn bởi role guard → `403`, `message: "Forbidden resource"`, `errorCode: "ERROR"`.
- **Path id**: mọi `:id` phải là **uuid v4**, sai định dạng → `400`, `errorCode: "ERROR"`, `message: "Validation failed (uuid v 4 is expected)"`.

### Rate limit

- Mặc định **20 request / 60 giây** (chỉnh qua env `RATE_LIMIT_LIMIT` / `RATE_LIMIT_TTL_MS`), tính **theo từng route handler + IP** (không phải một hạn mức chung cho mọi route). Lưu in-memory, mỗi instance một bộ đếm.
- Nâng lên **120 / 60 giây** cho các route ghi tần suất cao của board: `PATCH /lists/:id/move`, `POST /lists/:id/cards`, `PATCH /tasks/:id/move`, `PATCH /tasks/:id/snooze`, `POST /tasks/inbox/cards`, `POST /checklists/:id/items`, `PATCH /checklist-items/:id`.
- `/me/preferences/*`: **60 / 60 giây**.
- Vượt quá → `429`, `errorCode: "TOO_MANY_REQUESTS"`, `message: "ThrottlerException: Too Many Requests"`.

### Auth header

```
Authorization: Bearer <accessToken>
```

Access token sống `JWT_ACCESS_EXPIRES` (mặc định `15m` → `expiresIn = 900`). Payload JWT: `{ sub, email, role }`.

### Refresh token cookie

- Tên cookie: `refresh_token`, `HttpOnly`, `path=/`
- `secure` = `COOKIE_SECURE === 'true'`; `SameSite` = **`none`** khi secure, **`lax`** khi không (không bao giờ `Strict`); `domain` = `COOKIE_DOMAIN` nếu có.
- Cookie **bền** (`maxAge` = hạn refresh token, `JWT_REFRESH_EXPIRES`, mặc định `7d`) → đóng trình duyệt vẫn giữ phiên.
- Được set tự động bởi: `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh-token`, `GET /auth/google/callback`
- Bị xoá bởi: `POST /auth/logout`
- FE **không đọc/ghi** cookie này trực tiếp — chỉ cần gọi API kèm `credentials: 'include'`.

### Response envelope

**Không có envelope bọc dữ liệu thành công** (không phải dạng `{success, data}`) — response thành công chính là JSON trả về nguyên bản như mô tả trong từng endpoint.

**Lỗi** luôn có dạng cố định sau (từ global exception filter):

```json
{
  "statusCode": 401,
  "errorCode": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password",
  "path": "/auth/login",
  "timestamp": "2026-07-04T12:00:00.000Z"
}
```

- `message` có thể là `string` hoặc `string[]` (khi lỗi validate nhiều field cùng lúc).
- `path` là `request.url` → **có cả query string**.
- Lỗi do Nest/passport ném trực tiếp (401 thiếu token, 403 role guard, 400 validate, 400 uuid sai) → `errorCode: "ERROR"`.
- Exception tuỳ biến không kèm mã riêng → `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND`.
- Lỗi không phải HTTP (vd lỗi Prisma không lường trước) → `500`, `errorCode: "INTERNAL_ERROR"`, `message: "Internal server error"`.

**Danh sách `errorCode` có tên:**

| Nhóm | Mã |
|---|---|
| Auth | `AUTH_EMAIL_ALREADY_EXISTS`, `AUTH_INVALID_CREDENTIALS`, `AUTH_INVALID_REFRESH_TOKEN`, `AUTH_REFRESH_TOKEN_REUSED`, `AUTH_USER_NOT_FOUND`, `AUTH_ACCOUNT_NOT_ACTIVE`, `AUTH_GOOGLE_ACCOUNT_ONLY`, `AUTH_GOOGLE_PROFILE_MISSING_EMAIL` |
| Task type | `TASK_TYPE_NOT_FOUND`, `TASK_TYPE_NAME_TAKEN` |
| Board | `BOARD_NOT_FOUND`, `LIST_NOT_FOUND`, `CARD_NOT_FOUND`, `LABEL_NOT_FOUND`, `LABEL_NAME_INVALID`, `LABEL_NAME_TAKEN`, `CHECKLIST_NOT_FOUND`, `CHECKLIST_ITEM_NOT_FOUND`, `NOTE_NOT_FOUND`, `ATTACHMENT_NOT_FOUND`, `CARD_NOT_IN_BOARD`, `INVALID_TIMEZONE`, `LIST_WIP_EXCEEDED` (chỉ là `warning`, không phải lỗi) |
| Project | `PROJECT_NOT_FOUND`, `PROJECT_CODE_TAKEN`, `PROJECT_NAME_TAKEN`, `PROJECT_LIMIT_REACHED`, `PROJECT_LAST_ONE`, `PROJECT_NOT_EMPTY`, `PROJECT_ARCHIVED`, `PROJECT_SYSTEM_LOCKED` |
| Chung | `VALIDATION_FAILED`, `TOO_MANY_REQUESTS`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`, `ERROR` |

### Enum dùng chung

| Enum | Giá trị |
|---|---|
| `Role` | `USER`, `ADMIN`, `SUPER_ADMIN` |
| `UserStatus` | `ACTIVE`, `INACTIVE`, `BANNED` |
| `AuthProvider` | `LOCAL`, `GOOGLE` |
| `TaskPriority` | `LOW`, `NORMAL` (default), `HIGH`, `URGENT` |
| `TaskStatus` | `TODO` (default), `IN_PROGRESS`, `DONE`, `CANCELLED` |
| `TaskCategory` | `WORK` (default), `PERSONAL` |
| `ItemKind` | `TASK` (default), `EVENT` |
| `RepeatUnit` | `DAY`, `WEEK`, `MONTH` |
| `AttachmentKind` | `IMAGE`, `FILE`, `LINK` |
| `CardSource` (tính toán) | `EMAIL`, `ZALO`, `MANUAL` |
| `MailProvider` | `GOOGLE` |
| `LabelIcon` | `tag`, `star`, `flag`, `bell`, `heart`, `zap`, `phone`, `mail`, `users`, `folder`, `coins`, `bug` |
| `ProjectIcon` | `folder`, `briefcase`, `home`, `rocket`, `target`, `book`, `heart`, `users` |
| `ActivityAction` | `CARD_CREATED`, `CARD_MOVED`, `CARD_COMPLETED`, `CARD_REOPENED`, `DUE_CHANGED`, `SNOOZED`, `CHECKLIST_ITEM_CHECKED`, `ATTACHMENT_ADDED`, `NOTE_ADDED` |
| `deadlineStatus` (tính toán, không lưu DB) | `'IN_PROGRESS' \| 'ON_TIME' \| 'LATE'` |

`deadlineStatus`: nếu `DONE` → `ON_TIME` khi thiếu `deadline`/`completedAt` hoặc `completedAt <= deadline`, ngược lại `LATE`. Nếu chưa `DONE` → `LATE` khi `deadline < now`, ngược lại `IN_PROGRESS`.

**Lưu ý**: dự án dùng **PostgreSQL qua Prisma**. **Không có WebSocket/SSE** — mọi thông báo (nhắc deadline, task mới) được đẩy qua **Zalo Bot** cho người dùng đã liên kết Zalo, không đẩy về FE. FE muốn cập nhật danh sách theo thời gian thực thì tự polling.

### Route tiện ích

- `GET /health` — Public → `200` text `"OK"`.
- `GET /` — **Bearer required** → `200` text `"Hello World!"`.

---

## 2. Module `auth` (`/auth`)

### `POST /auth/register` — Public

Body (`RegisterDto`):
```ts
{ email: string /* IsEmail */; password: string /* min 8 ký tự */ }
```
- `201 Created` → `{ accessToken: string, expiresIn: number /* giây */ }` + set cookie `refresh_token`
- Tự tạo dự án mặc định "Công việc chung" (xem mục 6a).
- `409 Conflict`, `errorCode: "AUTH_EMAIL_ALREADY_EXISTS"` — email đã tồn tại
- Email **phân biệt hoa/thường**, không được chuẩn hoá — FE nên tự `trim().toLowerCase()` trước khi gửi.

### `POST /auth/login` — Public

Body (`LoginDto`):
```ts
{ email: string /* IsEmail */; password: string }
```
- `200 OK` → `{ accessToken: string, expiresIn: number }` + set cookie `refresh_token`
- Lỗi, theo đúng thứ tự kiểm tra:
  1. `401 AUTH_INVALID_CREDENTIALS` — không tìm thấy email
  2. `401 AUTH_GOOGLE_ACCOUNT_ONLY` — tài khoản đăng ký bằng Google, không có mật khẩu local → FE nên hiển thị nút "Đăng nhập bằng Google"
  3. `401 AUTH_INVALID_CREDENTIALS` — sai mật khẩu
  4. `401 AUTH_ACCOUNT_NOT_ACTIVE` — tài khoản bị khoá (chỉ báo **sau khi** mật khẩu đúng)

### `GET /auth/google` — Public

Redirect sang màn hình đăng nhập Google (scope `email profile`). FE dùng `<a href="http://localhost:8888/auth/google">` hoặc `window.location.href = ...` (không gọi bằng fetch/axios).

### `GET /auth/google/callback` — Public

Google gọi lại route này. Server tự xử lý, set cookie `refresh_token`, rồi **redirect trình duyệt** sang:

```
${FRONTEND_URL}/oauth-callback?accessToken=<jwt>&expiresIn=<seconds>
```

- Lỗi đổi code với Google → redirect `${FRONTEND_URL}/oauth-callback?error=google_auth_failed`.
- Các lỗi sau trả **JSON, không redirect**: `400 AUTH_GOOGLE_PROFILE_MISSING_EMAIL`, `401 AUTH_ACCOUNT_NOT_ACTIVE`.
- Nếu đã có user trùng email → gắn Google ID vào user đó; không thì tạo user mới provider `GOOGLE`.

FE cần trang `/oauth-callback` đọc `accessToken`/`expiresIn` (hoặc `error`) từ query string.

### `POST /auth/refresh-token` — Public (yêu cầu cookie `refresh_token`)

- Không cần body, gọi kèm `credentials: 'include'`.
- `200 OK` → `{ accessToken, expiresIn }` + set cookie mới (rotate)
- Thiếu cookie / cookie hết hạn / sai chữ ký → `401`, `errorCode: "ERROR"` (passport chặn trước)
- `401 AUTH_INVALID_REFRESH_TOKEN` — không tìm thấy bản ghi, hết hạn, sai hash
- `401 AUTH_REFRESH_TOKEN_REUSED` — token đã bị thu hồi mà bị dùng lại → **thu hồi toàn bộ token của user**
- `401 AUTH_USER_NOT_FOUND`

### `POST /auth/logout` — Public (yêu cầu cookie `refresh_token`)

- `204 No Content`, thu hồi token và xoá cookie
- Thiếu/sai cookie → `401 ERROR` (không phải 204) — FE nên coi như đã đăng xuất.

### `GET /auth/me` — Bearer required

- `200 OK` → `{ id: string; email: string; role: Role }`
- `404 NOT_FOUND` nếu user đã bị xoá.

---

## 2a. Module `users` (`/users`) — chỉ admin

### `GET /users` — Bearer + role `ADMIN`/`SUPER_ADMIN`

- `200` → `{ id: string; email: string; role: Role }[]` — chỉ user `ACTIVE`, sắp theo `email` tăng dần. Dùng cho bộ chọn người được giao.
- User thường → `403 ERROR`.

---

## 3. Module `tasks` (`/tasks`) — tất cả yêu cầu Bearer

Quy tắc phân quyền (cho các route trong `TasksController` — `GET/POST/PATCH/DELETE /tasks[/:id]`, `/tasks/stats`):

- `ADMIN`/`SUPER_ADMIN` xem và thao tác được mọi task, và là người duy nhất được gán task cho người khác.
- User thường truy cập được 1 task khi là **người được giao hoặc người tạo**; không thì `403 FORBIDDEN`. Task không tồn tại/đã xoá mềm → `404 NOT_FOUND`.
- **Riêng danh sách** `GET /tasks` của user thường chỉ lọc theo `assigneeId = mình` (task mình tạo cho người khác không hiện ra).

Các route "thẻ" `/tasks/:id/move|snooze|detail|complete|reopen|restore|labels|checklists|notes|attachments` và `/tasks/inbox/cards` thuộc module board — xem **mục 6c**, quy tắc phân quyền khác (chỉ assignee, trả `404 CARD_NOT_FOUND`).

### `GET /tasks` — danh sách (phân trang)

Query (`QueryTaskDto`, tất cả optional):

| field | type | ghi chú |
|---|---|---|
| `projectId` | uuid | phải là dự án **của chính người gọi** (kể cả admin), không thì `404 PROJECT_NOT_FOUND`. Bỏ trống = mọi dự án (tương thích ngược, server log cảnh báo) |
| `kind` | `TASK` \| `EVENT` \| `ALL` | mặc định `TASK` |
| `page` | int ≥1 | mặc định 1 |
| `limit` | int ≥1 | mặc định 20; >100 bị **tự kẹp về 100** (không lỗi); `0` → `400` |
| `status` | `TaskStatus` | |
| `priority` | `TaskPriority` | |
| `category` | `TaskCategory` | |
| `taskTypeId` | uuid | |
| `sourceMailAccountId` | uuid | lọc task tự tạo từ 1 mailbox Gmail (xem mục 5b) |
| `assigneeId` | uuid | chỉ có tác dụng với admin (admin bỏ trống = task của mọi người); user thường luôn bị ép về chính mình |
| `from` | ISO date string | TASK: `deadline >= from`; EVENT: `endAt >= from` (giao nhau khoảng) |
| `to` | ISO date string | TASK: `deadline <= to`; EVENT: `startAt <= to` |

Response `200` (sắp theo `createdAt` giảm dần):
```ts
{ items: TaskResponseDto[]; total: number; page: number; limit: number }
```

### `GET /tasks/stats`

Query: `projectId?` (uuid, dự án của chính mình, không thì `404 PROJECT_NOT_FOUND`; bỏ trống = cả tài khoản), `assigneeId?` (uuid, chỉ admin; admin bỏ trống = **thống kê của chính admin**, không phải toàn hệ thống).

Response `200` (`TaskStatsResponseDto`, mọi giá trị là số nguyên đã làm tròn):
```ts
{
  totalCompleted: number;
  completedInMonth: number;
  completionRate: number;    // %
  performance: number;       // % đúng hạn, toàn thời gian
  performanceMonth: number;  // % đúng hạn, tháng hiện tại
}
```
- Có tính cả EVENT. "Tháng" bắt đầu ngày 1 lúc 00:00 theo **giờ server**. "Đúng hạn" = không có deadline hoặc `completedAt <= deadline`.

### `GET /tasks/:id`

- Response `200`: `TaskResponseDto`; `403 FORBIDDEN`; `404 NOT_FOUND`.

### `POST /tasks` — tạo task/sự kiện

Body (`CreateTaskDto`):

| field | type | bắt buộc | ghi chú |
|---|---|---|---|
| `title` | string | ✅ | không giới hạn độ dài, không kiểm tra rỗng — FE tự validate |
| `kind` | `ItemKind` | ❌ | mặc định `TASK` |
| `startAt`, `endAt` | ISO date string | EVENT: ✅ | thiếu hoặc `endAt < startAt` → `400 VALIDATION_FAILED`. Bỏ qua với TASK |
| `allDay` | boolean | ❌ | |
| `projectId` | uuid | ❌ | dự án của **người được giao**; không tìm thấy → `404 PROJECT_NOT_FOUND`, đã lưu trữ → `409 PROJECT_ARCHIVED`. Bỏ trống = dự án mặc định của người được giao |
| `description` | string | ❌ | HTML (Quill), server sanitize |
| `note` | string | ❌ | |
| `taskTypeId` | uuid | ❌ | id không tồn tại → `404 TASK_TYPE_NOT_FOUND` |
| `category` | `TaskCategory` | ❌ | mặc định `WORK` |
| `priority` | `TaskPriority` | ❌ | mặc định `NORMAL` |
| `assigneeId` | uuid | ❌ | mặc định là chính mình; user thường set người khác → `403 FORBIDDEN` |
| `assignedAt` | ISO date string | ❌ | |
| `deadline` | ISO date string | ❌ | với EVENT bị bỏ qua, server set `deadline = startAt` |
| `attachments` | string[] | ❌ | danh sách URL/tên file (legacy, xem mục 8) |
| `cover` | string ≤2000 | ❌ | CSS gradient hoặc URL |
| `estimateMinutes` | int ≥0 | ❌ | |
| `repeat` | `CardRepeatInput \| null` | ❌ | xem dưới |
| `labelIds` | uuid[] | ❌ | phải thuộc bảng của người được giao, không thì `404 LABEL_NOT_FOUND` |

```ts
// CardRepeatInput
{ unit: 'DAY'|'WEEK'|'MONTH'; interval: number /* 1..365 */;
  weekdays?: number[] /* 0=CN..6, ≤7 phần tử, chỉ WEEK */; dayOfMonth?: number|null /* 1..31, chỉ MONTH */;
  until?: string|null /* ISO */; remaining?: number|null /* 0..999, null = mãi mãi */ }
```

- TASK vào Hộp thư đến (`listId = null`) của bảng thuộc dự án. EVENT không thuộc bảng (`boardId = null`).
- Phát sự kiện `task.created` → gửi Zalo cho người được giao (mục 7).
- Response `201`: `TaskResponseDto`. **Quirk**: response của create/update luôn có `assignee: null`, `creator: null`, `labelIds: []` (không load quan hệ) — cần dữ liệu đầy đủ thì gọi lại `GET /tasks/:id` hoặc `GET /tasks/:id/detail`. `cover` được lưu nhưng không có trong `TaskResponseDto` (xem `CardSummaryDto`).

### `PATCH /tasks/:id` — cập nhật

Query: `undo?` (`true`/`1`) — bỏ qua ghi activity log (dùng cho nút "Hoàn tác").

Body (`UpdateTaskDto` = mọi field của `CreateTaskDto` là optional, cộng thêm):

| field | type |
|---|---|
| `status` | `TaskStatus` |
| `completedAt` | ISO date string |

- Set `status: "DONE"` khi task chưa có `completedAt` và body không truyền → server set `completedAt = now()`. Chuyển khỏi `DONE` **không** tự xoá `completedAt`.
- `kind` **không đổi được** (bị bỏ qua). EVENT: `startAt`/`endAt`/`allDay` gộp với giá trị cũ rồi validate lại; `deadline = startAt`.
- Đổi `projectId` = **chuyển việc sang dự án khác**: về Hộp thư đến của dự án mới (`listId = null`), **mất hết nhãn** (`labelIds` gửi kèm bị bỏ qua). Dự án đích phải của người được giao và chưa lưu trữ (`404 PROJECT_NOT_FOUND` / `409 PROJECT_ARCHIVED`).
- Đổi `deadline` ghi activity `DUE_CHANGED` (trừ khi `undo`) và reset cờ đã-nhắc Zalo → hạn mới sẽ được nhắc lại (giống `/snooze`).
- Đổi `assigneeId` khi không phải admin → `403 FORBIDDEN`.
- Response `200`: `TaskResponseDto` (cùng quirk như create). Lỗi: `403 FORBIDDEN`, `404 NOT_FOUND`, `404 LABEL_NOT_FOUND`, `404 TASK_TYPE_NOT_FOUND`.

### `DELETE /tasks/:id`

- **Xoá mềm** → `204 No Content`. Khôi phục bằng `POST /tasks/:id/restore` (mục 6c).
- `403 FORBIDDEN` / `404 NOT_FOUND` như các route đơn lẻ khác.

> `PATCH /tasks/:id/complete` **không** thuộc `TasksController` và **không** trả `TaskResponseDto` — xem mục 6c.

### `TaskResponseDto`

```ts
{
  id: string;
  projectId: string;
  code: string;            // "TSK-000123"
  title: string;
  description?: string | null;
  note?: string | null;
  taskTypeId?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  deadlineStatus: 'IN_PROGRESS' | 'ON_TIME' | 'LATE';  // tính toán
  assigneeId: string;
  assignee?: { id: string; email: string; role: Role } | null;
  creatorId?: string | null;
  creator?: { id: string; email: string; role: Role } | null;
  assignedAt?: string | null;   // ISO
  deadline?: string | null;
  kind: 'TASK' | 'EVENT';
  startAt?: string | null;
  endAt?: string | null;
  allDay: boolean;
  completedAt?: string | null;
  attachments: string[];        // legacy, danh sách URL/tên file
  sourceMailAccountId?: string | null;  // != null nghĩa là task được tự tạo từ email (mục 5b)
  repeat: CardRepeatDto | null;
  estimateMinutes?: number | null;
  labelIds: string[];
  createdAt: string;
  updatedAt: string;
}
// CardRepeatDto = { unit; interval; weekdays: number[]; dayOfMonth: number|null; until: string|null; remaining: number|null }
```

---

## 4. Module `task-types` (`/task-types`) — Bearer required

- `GET /task-types` — mọi user đã đăng nhập → `TaskTypeResponseDto[]` (sắp theo `createdAt` tăng dần, có cache, tự xoá cache khi ghi).
- `POST /task-types` — **chỉ ADMIN/SUPER_ADMIN** (khác thì `403 ERROR`)
  - Body: `{ name: string /* ≤100 ký tự */; color: string /* hex #rgb hoặc #rrggbb */ }`
  - `201` → `TaskTypeResponseDto`
  - Trùng `name` (phân biệt hoa/thường) → `409 TASK_TYPE_NAME_TAKEN`.
- `PATCH /task-types/:id` — chỉ admin. Body: `{ name?: string; color?: string }` → `200`; `404 TASK_TYPE_NOT_FOUND`; đổi sang tên đã có → `409 TASK_TYPE_NAME_TAKEN`.
- `DELETE /task-types/:id` — chỉ admin → `204`; `404 TASK_TYPE_NOT_FOUND`. Task đang dùng loại này bị set `taskTypeId = null`.

```ts
// TaskTypeResponseDto
{ id: string; name: string; color: string; createdAt: string; updatedAt: string }
```

---

## 5. Module `mail-accounts` (`/mail-accounts`) — kết nối Gmail để tự tạo task từ email

- `GET /mail-accounts` — Bearer → chỉ mailbox **của chính người gọi** (kể cả admin):
  ```ts
  { id: string; provider: 'GOOGLE'; email: string; createdAt: string }[]
  ```
- `GET /mail-accounts/google/connect` — Bearer → `{ url: string }`
  - FE mở `url` (tab mới/popup) để user cấp quyền (scope `gmail.modify` + `userinfo.email`, `prompt=consent`). Link hết hạn sau **5 phút**.
- `GET /mail-accounts/google/callback` — Public, Google tự redirect vào, **FE không gọi trực tiếp**.
  - Thành công → `200` trang HTML tĩnh: "Đã kết nối Gmail thành công. Bạn có thể đóng tab này."
  - Thất bại → **JSON** qua filter lỗi (không phải HTML): `401 UNAUTHORIZED` (link hết hạn/không hợp lệ, Google không trả refresh token/email), `500 INTERNAL_ERROR` (code sai).
  - Kết nối lại cùng mailbox = cập nhật (upsert).
- `DELETE /mail-accounts/:id` — Bearer, chỉ chủ sở hữu hoặc admin → `204`; `403 FORBIDDEN`; `404 NOT_FOUND`.
  - Thu hồi quyền Google (best-effort) trước khi xoá. Task đã tạo vẫn giữ, `sourceMailAccountId` về `null`.

### 5b. Tính năng tự tạo task từ email (chạy nền, **không có endpoint**)

Sau khi user connect Gmail, backend tự động:

- **Mỗi 5 phút** quét mọi mailbox, lấy email có subject bắt đầu (không phân biệt hoa/thường) bằng một trong các tiền tố của env `MAIL_TASK_SUBJECT_PREFIX` (mặc định `[TASK]`, nhiều tiền tố cách nhau dấu phẩy, vd `[TASK],[OPER]`), trong vòng `MAIL_TASK_LOOKBACK_DAYS` ngày (mặc định 7). Xử lý cả email đã đọc lẫn chưa đọc.
- **Mọi email khớp truy vấn đều bị đánh dấu đã đọc** trong Gmail sau khi xử lý.
- Parse nội dung:
  - `title`: subject đã bỏ tiền tố (rỗng thì giữ nguyên subject).
  - `description`: phần `text/plain`, fallback `text/html` đã lược thẻ; **cắt còn 2000 ký tự**, sanitize.
  - `deadline`: regex `deadline:` / `hạn:` / `han:` + `dd/mm/yyyy` (giờ `hh:mm` tuỳ chọn, mặc định 00:00), hiểu theo **múi giờ của người được giao** (mặc định `Asia/Ho_Chi_Minh`).
  - `priority`: "khẩn cấp"/"gấp" → `URGENT`; chứa chuỗi "cao" → `HIGH`; còn lại `NORMAL` (không bao giờ ra `LOW`).
  - `attachments`: URL trong nội dung + tên file đính kèm Gmail thật.
  - `assigneeId`: dòng `Giao cho:` / `Gán cho:` / `Assign to:` / `Assigned to: <email>` — khớp user đã đăng ký thì gán cho họ, không thì gán cho chủ mailbox.
  - Cố định: `category = WORK`, `creatorId = assignee`, `assignedAt` = thời điểm nhận email.
- Task vào Hộp thư đến của **dự án mặc định của người được giao** (dự án mặc định đã lưu trữ → dự án hoạt động cũ nhất).
- Chống trùng lặp qua `Message-ID` (fallback Gmail id) — mỗi email chỉ tạo 1 task.
- Phát `task.created` → gửi Zalo cho người được giao.
- Khi quyền Gmail bị thu hồi (`invalid_grant`), chủ mailbox nhận 1 tin Zalo kèm link kết nối lại (link sống 24h, mỗi lần chạy process chỉ gửi 1 lần).
- Task tạo ra có `sourceMailAccountId` khác `null` (và `CardSummaryDto.source = 'EMAIL'`) để FE hiển thị badge "Từ email" hoặc lọc riêng.

---

## 6. Module `zalo-accounts` (`/zalo-accounts`) — liên kết Zalo để nhận thông báo

Tất cả yêu cầu Bearer, mọi role.

- `POST /zalo-accounts/link-code` — không cần body → `201`:
  ```ts
  { code: string /* 6 chữ số */; expiresAt: string; botProfileUrl: string /* '' nếu chưa cấu hình ZALO_BOT_PROFILE_URL */ }
  ```
  - Code hết hạn sau **10 phút**. Tạo code mới **không** vô hiệu code cũ còn hạn.
  - FE hướng dẫn user mở bot (`botProfileUrl`) và gửi tin nhắn **chỉ gồm đúng code** (server chỉ trim khoảng trắng — tin có chữ khác kèm theo sẽ không khớp).
  - Kết quả phía Zalo: thành công → bot trả "Liên kết tài khoản thành công!"; chat Zalo đã liên kết với user khác → bot báo lỗi; code sai/hết hạn → **bot im lặng**. Liên kết lại sẽ thay chat Zalo cũ.
  - FE không nhận được callback — cần polling `GET /zalo-accounts/me` để biết đã liên kết xong.
  - Server thiếu `ZALO_BOT_TOKEN` → bot không chạy, không bao giờ liên kết được dù endpoint vẫn trả `201`.
- `GET /zalo-accounts/me` → `200`: `{ linked: true; linkedAt: string }` hoặc `{ linked: false }`
- `DELETE /zalo-accounts/me` → `204` (idempotent)

## 6a. Module `projects` (`/projects`) — không gian làm việc cá nhân

Tất cả yêu cầu Bearer, không phân quyền theo role. **Không có thành viên**: mỗi dự án thuộc đúng một người, dự án của người khác trả `404 PROJECT_NOT_FOUND` (không phải `403`).

`projectId` là **lớp phân vùng dữ liệu**, không phải bộ lọc tuỳ chọn: một việc thuộc đúng một dự án và không nhìn thấy được từ dự án khác.

```ts
// ProjectDto
{ id; code; name; description: string|null; color; icon: ProjectIcon;
  isDefault: boolean; archived: boolean; stats; createdAt; updatedAt }
// stats = { totalTasks; openTasks; overdueTasks; lastActivityAt: string|null }
```
`stats` bỏ qua việc đã xoá mềm nhưng tính cả EVENT; `openTasks` = chưa `DONE`/`CANCELLED`; `overdueTasks` = đang mở và `deadline < now`; `lastActivityAt` = `updatedAt` lớn nhất.

### Dự án hệ thống "Công việc chung"

Tài khoản mới (register) tự có dự án `code: "CHUNG"`, `name: "Công việc chung"`, `color: "#0a436d"`, `icon: "folder"`, `isDefault: true`. Đăng nhập Google đi đường khác nên `GET /projects`, `POST /tasks`, các route board không có `projectId` và luồng email đều tự tạo/khôi phục dự án mặc định nếu thiếu.

Dự án `CHUNG` (nhận diện theo `code`, không theo `isDefault`) **không xoá, không lưu trữ, không đổi `code` được** → `403 PROJECT_SYSTEM_LOCKED`. Đổi tên/màu thì được.

### Routes

- `GET /projects?includeArchived=false` → `200 { items: ProjectDto[]; total: number }` (`total = items.length`)
  - `includeArchived` chỉ nhận `true`/`1` là true, giá trị khác = false (không báo lỗi).
  - Sắp xếp: dự án mặc định lên đầu, còn lại theo `name` collation tiếng Việt (`Intl.Collator('vi')` ở tầng ứng dụng — Postgres chạy `en_US.utf8` sẽ xếp "Đà Nẵng" sau "Zulu").
  - **Có cache 30 giây** (Redis nếu có `REDIS_URL`, không thì in-memory): `stats` có thể trễ tối đa 30 giây sau khi tạo/sửa việc; đổi chính dự án (tên, màu, mặc định, lưu trữ…) thì thấy ngay.
- `GET /projects/:id` → `200 ProjectDto` (không cache, stats tính trực tiếp); `404 PROJECT_NOT_FOUND`.
- `POST /projects` → `201 ProjectDto` (stats toàn 0)
  - Body: `name` (bắt buộc), `code?`, `description?`, `color?` (mặc định `#0a436d`), `icon?` (mặc định `folder`), `isDefault?: boolean`.
  - Thành dự án mặc định khi user **chưa có dự án hoạt động nào** hoặc `isDefault: true` (gỡ cờ ở dự án khác trong cùng transaction).
  - Bỏ trống `code` → backend sinh từ `name`: bỏ dấu (đ→d), HOA, lấy chữ cái đầu mỗi từ (một từ thì lấy chính từ đó), cắt ≤4 ký tự, đệm `X` cho đủ 2, không còn chữ nào → `DA`; trùng (kể cả dự án đã lưu trữ) thì thêm số từ 2 (`KHA` → `KHA2`), giữ ≤8 ký tự. Ví dụ: "Công việc công ty" → `CVCT`, "Website" → `WEBS`, "An" → `AN`.
  - Gửi `code` chữ thường cũng nhận — backend tự viết hoa.
  - Thứ tự kiểm tra: `409 PROJECT_LIMIT_REACHED` → `409 PROJECT_NAME_TAKEN` → `409 PROJECT_CODE_TAKEN`.
- `PATCH /projects/:id` → `200 ProjectDto`
  - Body (optional): `name`, `code`, `description`, `color`, `icon`, `archived`. `description: ""` = xoá mô tả (lưu `null`). **Không** nhận `isDefault` (→ `400`, dùng endpoint riêng).
  - Đổi `code` dự án hệ thống → `403`. `archived: true` áp dụng cùng quy tắc với `PUT /archive`, nhưng `archived: false` qua PATCH **không** khôi phục cờ mặc định (PUT thì có).
- `PUT /projects/:id/default` — body rỗng → `200 ProjectDto`. Gỡ cờ ở các dự án khác trong cùng transaction. Dự án đã lưu trữ → `409 PROJECT_ARCHIVED`.
- `PUT /projects/:id/archive` — body `{ archived: boolean }` → `200 ProjectDto`
  - Lưu trữ **không đụng vào việc**, chỉ ẩn dự án khỏi bộ chọn.
  - Lưu trữ dự án hệ thống → `403 PROJECT_SYSTEM_LOCKED`; dự án hoạt động cuối cùng → `409 PROJECT_LAST_ONE`.
  - Nếu dự án đang là mặc định, cờ chuyển sang dự án hoạt động cũ nhất. (Edge case: nếu chính nó là dự án cũ nhất thì cờ bị gỡ, tạm thời không có mặc định cho tới lần `GET /projects` kế tiếp tự sửa.)
  - Bỏ lưu trữ khi user đang không có dự án mặc định → dự án này thành mặc định.
  - Gọi lặp (lưu trữ cái đã lưu trữ) → `200`, không đổi gì.
- `DELETE /projects/:id` → `204`. Thứ tự kiểm tra: dự án hệ thống → `403 PROJECT_SYSTEM_LOCKED`; còn việc (kể cả đã xoá mềm) → `409 PROJECT_NOT_EMPTY`; là dự án **hoạt động** cuối cùng → `409 PROJECT_LAST_ONE` (dự án đã lưu trữ luôn xoá được). Bảng/cột/nhãn đi theo bằng cascade. Xoá dự án mặc định → dự án hoạt động cũ nhất thành mặc định.

Ràng buộc: `code` `^[A-Z0-9]{2,8}$` (sau trim + viết hoa); `name` 1–80 ký tự sau trim; `description` ≤280; `color` `^#[0-9a-fA-F]{6}$`; `icon` là `ProjectIcon`. `code` và `name` unique trong phạm vi một người, **tính cả dự án đã lưu trữ**, `name` **phân biệt hoa/thường** ("Việc nhà" và "việc nhà" cùng tồn tại được). Trần **30 dự án hoạt động** mỗi người (dự án lưu trữ không tính).

Mã lỗi: `PROJECT_NOT_FOUND` (404), `PROJECT_SYSTEM_LOCKED` (403), `PROJECT_CODE_TAKEN`, `PROJECT_NAME_TAKEN`, `PROJECT_LIMIT_REACHED`, `PROJECT_LAST_ONE`, `PROJECT_NOT_EMPTY`, `PROJECT_ARCHIVED` (409).

### 6a.1 Ảnh hưởng tới `/tasks` và board

- `GET /tasks?projectId=` và `GET /tasks/stats?projectId=` — xem mục 3 (thiếu `projectId` ở `/tasks` = mọi dự án; ở `/stats` = cả tài khoản). `projectId` phải của chính người gọi, kể cả admin lọc theo `assigneeId` người khác.
- `POST /tasks` nhận `projectId`; bỏ trống thì vào dự án mặc định. Dự án là của **người được giao**, không phải người tạo. Dự án đã lưu trữ → `409 PROJECT_ARCHIVED`.
- `PATCH /tasks/:id` đổi `projectId` = chuyển việc (về Hộp thư đến, mất nhãn).
- Các route board theo "bảng của tôi" nhận `?projectId=` (bỏ trống = dự án mặc định): `/boards/me/full`, `/boards/me/today`, `/boards/me/agenda`, `/boards/me/search`, `/boards/me/notes`, `/boards/me/labels`, `/boards/me/inbox/cards`, `/boards/me/inbox/rebalance`. **Mọi** route này tự tạo bảng nếu dự án chưa có (không riêng `/full`).
- `POST /tasks/inbox/cards` nhận `projectId` trong body (dự án lưu trữ → `409 PROJECT_ARCHIVED`).
- `POST /lists/:id/cards` nhận `projectId` nhưng **bỏ qua** — dự án suy từ bảng chứa cột (và không kiểm tra dự án đã lưu trữ).
- Các endpoint thao tác theo id (thẻ, cột, nhãn, checklist, ghi chú, đính kèm, `PATCH /boards/:id`) **không** cần `projectId`: bảng được suy từ chính tài nguyên đó.

## 6b. Module `preferences` (`/me/preferences`) — giao diện người dùng tự chỉnh

Tất cả yêu cầu Bearer. Trần riêng **60 req/phút/route** (do `GET` rơi đúng lúc đăng nhập).

- `GET /me/preferences/theme` → **luôn `200`**, kể cả khi user chưa từng lưu:
  ```ts
  {
    theme: { background: string; accent: string; surfaceOpacity: number; surfaceBlur: number };
    source: 'user' | 'default';   // 'default' = chưa có bản ghi, đang trả mặc định hệ thống
    updatedAt: string | null;     // null khi source = 'default'
  }
  ```
  Mặc định hệ thống: `{ background: 'harbour', accent: '#0a436d', surfaceOpacity: 0.7, surfaceBlur: 16 }`.
  **Không bao giờ trả `404`** — FE dùng `404` để nhận ra endpoint chưa deploy và tắt hẳn việc gọi API trong cả phiên.
- `PUT /me/preferences/theme` — body đúng object `theme` (bốn trường, đều bắt buộc, không bọc) → `200` trả bản ghi sau khi lưu (upsert), `source` luôn `'user'`.
- `DELETE /me/preferences/theme` → `204`, idempotent.

Ràng buộc: `background` 1–40 ký tự `^[a-z0-9-]+$`; `accent` `^#[0-9a-fA-F]{6}$` (giữ nguyên hoa/thường); `surfaceOpacity` số, `0.5 ≤ x ≤ 1`; `surfaceBlur` số nguyên `0 ≤ x ≤ 28`.

**Mọi** lỗi `400` trên controller này (sai ràng buộc, thiếu field, field thừa, sai kiểu) được đổi thành **`422` `VALIDATION_FAILED`** (không phải `400` như phần còn lại của API — hợp đồng riêng với FE, xem `Validation422Filter`).

## 6c. Module `board` — bảng Kanban (cột, thẻ, nhãn, checklist, ghi chú, đính kèm)

Tất cả yêu cầu Bearer. **Không có ngoại lệ cho admin**: mỗi bảng thuộc 1 người trong 1 dự án (`@@unique([ownerId, projectId])`). Thẻ chỉ thao tác được bởi **người được giao** (admin và người tạo cũng không). Tài nguyên của người khác/không tồn tại → **`404` với mã của tài nguyên đó** (`CARD_NOT_FOUND`, `LIST_NOT_FOUND`…), không bao giờ `403`.

"Thẻ" (card) chính là task (`kind = TASK`) — cùng bảng dữ liệu, cùng `id` với mục 3. `listId = null` nghĩa là thẻ nằm ở **Hộp thư đến** (Inbox).

### Quy ước chung

**Tạo bảng tự động**: route có `?projectId=` tìm bảng của `(người gọi, dự án)`; chưa có thì kiểm tra dự án (`404 PROJECT_NOT_FOUND`) rồi tạo bảng với **1 cột** "Hôm nay" (`mapsToStatus: TODO`) và nhận các task chưa có bảng của dự án đó. Dự án đã lưu trữ vẫn đọc được.

**Undo** (`?undo=true|1`): chỉ bỏ qua ghi activity (với `/complete` còn bỏ qua sinh lần lặp tiếp theo). Chỉ nhận ở: `PATCH /lists/:id`, `PATCH /tasks/:id/move`, `PATCH /tasks/:id/snooze`, `PATCH /tasks/:id/complete`, `PATCH /tasks/:id/reopen`, `POST /tasks/:id/restore`, `PATCH /checklist-items/:id`, `PATCH /tasks/:id` (mục 3). Gửi `undo` tới route khác → **`400`** (field thừa).

**Múi giờ** (`?tz=`, IANA): ưu tiên `tz` hợp lệ → `User.timezone` → `Asia/Ho_Chi_Minh`. `tz` sai bị **bỏ qua im lặng**, riêng `GET /boards/me/agenda` trả `400 INVALID_TIMEZONE`.

**Vị trí** (`position`, số thực): thưa, bước 1024. Thêm cuối = `last + 1024`. Chỉ `PATCH /tasks/:id/move` và `PATCH /lists/:id/move` tự "đẩy" khi vị trí đã bị chiếm đúng: lấy trung điểm với phần tử kế tiếp (hoặc `+1024` nếu là cuối); nếu khoảng hở < 0.001 thì **đánh số lại cả cột** (1024, 2048, …) mà response không báo — FE nên refetch cột nếu thấy lệch. Các route tạo có `position` thì không đẩy (có thể trùng). Thứ tự hiển thị: `position ASC, createdAt ASC`.

**Cache**: nhãn bảng cache 10 phút (tự xoá khi ghi nhãn).

### Kiểu dữ liệu

```ts
interface BoardDto { id; title; starred: boolean; createdAt; updatedAt }
interface TaskListDto { id; boardId; title; position: number; archived: boolean;
  wipLimit: number|null; mapsToStatus: TaskStatus|null; createdAt }
interface BoardLabelDto { id; boardId; name; color /* hex */; icon: LabelIcon|null; slug /* a-z0-9 */ }
interface CardSummaryDto {
  id; listId: string|null /* null = Inbox */; boardId: string|null; code /* "TSK-000123" */; title; position: number;
  labelIds: string[]; priority; category; status; deadline: string|null; deadlineStatus;
  completedAt: string|null; estimateMinutes: number|null; repeat: CardRepeatDto|null;
  source: 'EMAIL'|'ZALO'|'MANUAL'; cover: string|null;
  hasDescription: boolean; attachmentCount: number; noteCount: number; checklistDone: number; checklistTotal: number;
}
interface TodayMetricsDto { overdue: number; dueToday: number; doneToday: number; plannedMinutes: number }
interface CardPageDto { items: CardSummaryDto[]; nextCursor: number|null; total: number }
interface PositionDto { id; position: number }
interface ChecklistItemDto { id; checklistId; content; checked: boolean; position: number; checkedAt: string|null }
interface ChecklistDto { id; taskId; title; position: number; items: ChecklistItemDto[] }
interface TaskNoteDto { id; taskId; content; createdAt; editedAt: string|null }
interface TaskAttachmentDto { id; taskId; name; kind: AttachmentKind; url; sizeBytes: number|null; isCover: boolean; createdAt }
interface TaskActivityDto { id; taskId; action: ActivityAction; message /* tiếng Việt, hiển thị nguyên văn */; createdAt }
interface CardDetailDto extends CardSummaryDto {
  description: string|null /* HTML đã sanitize */; note: string|null; taskTypeId: string|null;
  attachmentLinks: string[] /* = Task.attachments legacy */;
  checklists: ChecklistDto[] /* position asc */; attachments: TaskAttachmentDto[] /* createdAt asc */;
  notes: TaskNoteDto[] /* createdAt desc */; activities: TaskActivityDto[] /* createdAt desc, tối đa 50 */;
  createdAt; updatedAt;
}
```

```ts
// CreateCardDto (dùng cho POST /lists/:id/cards và POST /tasks/inbox/cards)
{ title: string /* bắt buộc, không rỗng, ≤500 */; position?: number;
  description?: string /* HTML Quill */; deadline?: string /* ISO */; priority?: TaskPriority; category?: TaskCategory;
  labelIds?: string[]; estimateMinutes?: number /* int ≥0 */; cover?: string /* ≤2000, gradient CSS hoặc URL */;
  repeat?: CardRepeatInput | null /* xem mục 3 */; projectId?: string /* chỉ POST /tasks/inbox/cards dùng */ }
```

### Bảng của tôi (`/boards/me/*`)

- `GET /boards/me/full` — nạp toàn bộ bảng một lần. Query: `projectId?`, `tz?`, `cardsPerList?` (int 1..50, mặc định 20), `include?` (`projects`, `taskTypes`, dạng `include=projects,taskTypes` hoặc lặp `include=`; phân biệt hoa/thường; giá trị lạ → `400`). → `200`:
  ```ts
  { board: BoardDto;
    lists: TaskListDto[];            // position asc, CÓ CẢ cột đã lưu trữ — FE tự lọc archived
    labels: BoardLabelDto[];         // name asc
    cards: CardSummaryDto[];         // N thẻ đầu mỗi cột + Inbox
    cardCounts: Record<string /* listId | 'inbox' */, number>;  // tổng thật; cột 0 thẻ KHÔNG có key → coi là 0
    today: TodayMetricsDto;          // tính bằng SQL, đừng tự cộng từ cards
    projects?: { items: ProjectDto[]; total: number };  // chỉ khi include có projects (= GET /projects, stats trễ ≤30s)
    taskTypes?: TaskTypeResponseDto[] }                 // chỉ khi include có taskTypes
  ```
  Chi tiết cách FE dùng `include`: `docs/fe-bootstrap-endpoint.md`.
- `GET /boards/me/today` — Query: `projectId?`, `tz?` → `200 TodayMetricsDto`. `overdue` = đang mở, `deadline < now`; `dueToday` = đang mở, deadline trong ngày hôm nay (theo tz) — hai số **cố ý chồng nhau**; `doneToday` = `completedAt` trong hôm nay; `plannedMinutes` = tổng `estimateMinutes` của tập `dueToday`.
- `GET /boards/me/agenda` — Query: `projectId?`, `tz?`, `date?` (`YYYY-MM-DD`, mặc định hôm nay) → `200`:
  ```ts
  { date: string; overdue: CardSummaryDto[] /* tất cả, deadline asc, không phân trang */;
    dueToday: CardSummaryDto[] /* deadline trong [max(đầu ngày, now), cuối ngày) */; plannedMinutes: number; doneToday: number }
  ```
  `date` chỉ dời cửa sổ `dueToday`; `overdue`, `plannedMinutes`, `doneToday` luôn tính theo **hôm nay**. `date` trong quá khứ → `dueToday` luôn rỗng. Lỗi: `400 INVALID_TIMEZONE`, `400` sai định dạng `date`.
- `GET /boards/me/search` — Query: `projectId?`, `q` (bắt buộc, ≤200), `limit?` (1..50, mặc định 8) → `200 { items: CardSummaryDto[]; total: number }`. Tìm không dấu trên mã `TSK-…`, tiêu đề, mô tả (đã bỏ thẻ HTML); xếp hạng mã > tiêu đề > mô tả, rồi thẻ chưa xong trước, `deadline asc`. Có cả thẻ đã hoàn thành. `%`/`_` trong `q` **không được escape** (hoạt động như wildcard).
- `GET /boards/me/notes` — Query: `projectId?`, `before?` (ISO, cursor), `limit?` (1..50, mặc định 20) → `200`:
  ```ts
  { items: Array<TaskNoteDto & { card: { id; code; title; status: TaskStatus; listTitle: string|null /* null = Inbox */ } }>;
    nextCursor: string|null /* truyền vào before */ }
  ```
- `GET /boards/me/labels` — Query: `projectId?` → `200 BoardLabelDto[]` (name asc). Không cần nếu đã có `/full`.
- `GET /boards/me/inbox/cards` — Query: `projectId?`, `cursor?` (**position** của thẻ cuối đã nhận, không phải số trang), `limit?` (1..50, mặc định 20) → `200 CardPageDto`. `nextCursor = null` khi trang chưa đầy (trang vừa đủ `limit` sẽ kéo theo 1 trang rỗng).
- `POST /boards/me/inbox/rebalance` — Query: `projectId?`, không body → `200 PositionDto[]` (đánh số lại Inbox 1024, 2048, … giữ thứ tự).

### Bảng, cột, nhãn

- `PATCH /boards/:id` — Body: `title?` (≤120, không rỗng), `starred?` → `200 BoardDto`; `404 BOARD_NOT_FOUND`. `:id` là `board.id` từ `/full`.
- `POST /boards/:id/lists` — Body: `title` (bắt buộc, ≤120), `position?`, `mapsToStatus?` (`TaskStatus`), `wipLimit?` (int ≥1) → `201 TaskListDto`.
- `POST /boards/:id/labels` — Body: `name` (bắt buộc, ≤60), `color` (hex), `icon?` (`LabelIcon`) → `201 BoardLabelDto`. `slug` = tên bỏ dấu, chữ thường, chỉ `[a-z0-9]`.
  - Tên không có chữ/số nào → `400 LABEL_NAME_INVALID`.
  - Trùng slug với nhãn khác trong bảng (vd "Báo giá" vs "bao gia") → `409 LABEL_NAME_TAKEN` (message nêu tên nhãn đang trùng).
- `PATCH /labels/:id` — Body: `name?`, `color?`, `icon?` (`null` = bỏ icon) → `200 BoardLabelDto`; đổi tên sinh lại slug (cùng các lỗi như trên); `404 LABEL_NOT_FOUND`.
- `DELETE /labels/:id` → `204`, gỡ nhãn khỏi mọi thẻ.
- `PATCH /lists/:id` — Query: `undo?`. Body: `title?` (≤120), `wipLimit?` (int ≥1 | `null`), `archived?`, `mapsToStatus?` (`TaskStatus` | `null`) → `200 TaskListDto`; `404 LIST_NOT_FOUND`.
  - `archived: true` chuyển **toàn bộ thẻ của cột về Inbox** (giữ status, position). `archived: false` chỉ khôi phục cột, thẻ không quay lại.
- `PATCH /lists/:id/move` — Body: `position` (bắt buộc) → `200 TaskListDto` (vị trí thực tế đã ghi, có thể bị đẩy).
- `POST /lists/:id/rebalance` → `200 PositionDto[]` (đánh số lại thẻ trong cột).
- `GET /lists/:id/cards` — Query: `cursor?`, `limit?` → `200 CardPageDto` (giống Inbox).
- `POST /lists/:id/cards` — Body `CreateCardDto` → `201 CardSummaryDto`. Cột có `mapsToStatus` thì thẻ mới lấy status đó. `404 LIST_NOT_FOUND`, `404 LABEL_NOT_FOUND`.

### Thẻ (`/tasks/:id/*`)

- `POST /tasks/inbox/cards` — Body `CreateCardDto` → `201 CardSummaryDto` (`listId: null`). Người được giao/người tạo luôn là người gọi. Lỗi: `404 PROJECT_NOT_FOUND`, `409 PROJECT_ARCHIVED`, `404 LABEL_NOT_FOUND`.
- `PATCH /tasks/:id/move` — Query: `undo?`. Body: `listId?` (uuid | `null`; `null`/bỏ trống = Inbox), `position` (bắt buộc) → `200`:
  ```ts
  { id; listId: string|null; position: number /* vị trí thực tế đã ghi */; status: TaskStatus; updatedAt; warning?: 'LIST_WIP_EXCEEDED' }
  ```
  - Cột đích có `mapsToStatus` → đổi status theo; sang `DONE` thì set `completedAt`, rời `DONE` thì xoá. Về Inbox/cột không map thì giữ status.
  - WIP chỉ là cảnh báo: vượt `wipLimit` vẫn `200` kèm `warning`. Không chặn di chuyển vào cột đã lưu trữ.
  - Lỗi: `404 CARD_NOT_FOUND`, `404 LIST_NOT_FOUND`, `400 CARD_NOT_IN_BOARD` (cột thuộc bảng/dự án khác).
- `PATCH /tasks/:id/snooze` — Query: `tz?` (chỉ để định dạng message activity), `undo?`. Body: `deadline?` (ISO | `null`) → `200 CardSummaryDto`. **Bỏ trống hoặc `null` đều xoá deadline** (`{}` = xoá). Reset cờ đã-nhắc → Zalo sẽ nhắc lại.
- `GET /tasks/:id/detail` → `200 CardDetailDto`; thẻ đã xoá mềm → `404 CARD_NOT_FOUND`.
- `PATCH /tasks/:id/complete` — không body. Query: `undo?` → `200`:
  ```ts
  { completed: CardSummaryDto; next: CardSummaryDto | null }
  ```
  - Set `status = DONE`, `completedAt = now`; nếu bảng có cột (chưa lưu trữ) `mapsToStatus = DONE` thì chuyển thẻ sang cột đó (giữ `position`).
  - Thẻ lặp lại (và không `undo`) → tạo ngay lần kế tiếp (deadline tính theo múi giờ chủ thẻ từ `deadline ?? completedAt`, cùng cột, copy nhãn, `remaining - 1`) trả về ở `next`; hết chuỗi → `next: null`.
  - **Không idempotent**: gọi lại trên thẻ đã DONE sẽ ghi đè `completedAt` và sinh **thêm** một lần lặp → FE phải chặn double-click.
- `PATCH /tasks/:id/reopen` — Query: `undo?` → `200 CardSummaryDto`. Set `TODO`, xoá `completedAt`. Thẻ **không** tự rời cột DONE.
- `POST /tasks/:id/restore` — Query: `undo?` (không tác dụng) → `200 CardSummaryDto`. Khôi phục thẻ đã xoá mềm (idempotent), checklist/ghi chú còn nguyên.
- `PUT /tasks/:id/labels` — Body: `{ labelIds: string[] }` (bắt buộc, có thể `[]`) → `200 CardSummaryDto`, thay toàn bộ nhãn.
- `POST /tasks/:id/labels/:labelId` → `200 CardSummaryDto` (idempotent); nhãn không thuộc bảng → `404 LABEL_NOT_FOUND`.
- `DELETE /tasks/:id/labels/:labelId` → **`200` `CardSummaryDto`** (không phải 204), idempotent.
- `POST /tasks/:id/checklists` — Body: `{ title: string /* ≤200 */ }` → `201 ChecklistDto` (`items: []`, luôn thêm cuối).
- `POST /tasks/:id/notes` — Body: `{ content: string /* ≤10000 */ }` → `201 TaskNoteDto`.
- `POST /tasks/:id/attachments` — **JSON, không upload file**. Body: `{ name: string /* ≤255 */; kind: AttachmentKind; url: string /* ≤2000, không kiểm tra định dạng */; sizeBytes?: number }` → `201 TaskAttachmentDto`.

### Checklist, ghi chú, đính kèm (theo id)

- `PATCH /checklists/:id` — Body: `{ title: string }` (**bắt buộc**, ≤200) → `200 ChecklistDto`; `404 CHECKLIST_NOT_FOUND`.
- `DELETE /checklists/:id` → `204` (xoá cả mục con).
- `POST /checklists/:id/items` — Body: `content` (bắt buộc, ≤500), `position?` → `201 ChecklistItemDto`.
- `PATCH /checklist-items/:id` — Query: `undo?`. Body: `checked?`, `content?` (≤500), `position?` → `200 ChecklistItemDto`. `checked: true` set `checkedAt = now`, `false` xoá. `404 CHECKLIST_ITEM_NOT_FOUND`.
- `DELETE /checklist-items/:id` → `204`.
- `PATCH /notes/:id` — Body: `{ content: string }` (bắt buộc, ≤10000) → `200 TaskNoteDto` (`editedAt = now`); `404 NOTE_NOT_FOUND`.
- `DELETE /notes/:id` → `204`.
- `PATCH /attachments/:id` — Body: `name?` (≤255), `isCover?` → `200 TaskAttachmentDto`; `404 ATTACHMENT_NOT_FOUND`. `isCover: true` gỡ cờ ở đính kèm khác của thẻ (mỗi thẻ 1 ảnh bìa). **Không** đồng bộ sang `CardSummaryDto.cover` (trường này lấy từ `Task.cover`, set qua create hoặc `PATCH /tasks/:id`).
- `DELETE /attachments/:id` → `204`.

## 7. Module `zalo-bot` (`/zalo-bot`) — chỉ admin

Tất cả yêu cầu Bearer + role `ADMIN`/`SUPER_ADMIN` (khác → `403 ERROR`).

- `GET /zalo-bot/status` → `200`:
  ```ts
  { connected: boolean /* gọi getMe Zalo trực tiếp mỗi request */; botName?: string; linkedUsers: number }
  ```
- `GET /zalo-bot/recipients` → `200` mảng trần (không phân trang), sắp theo email:
  ```ts
  { userId: string; email: string; linkedAt: string }[]
  ```
- `POST /zalo-bot/broadcast` — gửi thông báo tới người dùng đã liên kết Zalo → `200`:
  ```ts
  // body
  { message: string /* bắt buộc, không rỗng, ≤2000 */; testOnly?: boolean /* mặc định false */; userIds?: string[] /* uuid, không rỗng nếu có */ }
  // response
  { total: number; sent: number; failed: number }
  ```
  - Ưu tiên: `testOnly: true` → chỉ gửi cho chính admin; không thì `userIds` (id chưa liên kết/không tồn tại bị **bỏ qua im lặng**, không tính vào `total`); không có cả hai → gửi **mọi** người đã liên kết.
  - `testOnly` khi admin chưa liên kết Zalo → `404`, `errorCode: "ERROR"`, message "Bạn chưa liên kết Zalo nên không thể gửi thử".
  - Server trim `message` sau khi validate → message toàn khoảng trắng vẫn qua validate — FE nên tự `trim()` và chặn.
  - Gửi **đồng bộ, tuần tự**, cách nhau 150ms, không lưu lịch sử → nhiều người nhận thì request lâu; FE nên hiện loading và tăng timeout.

**Hành vi nền liên quan (không phải endpoint, chỉ để FE hiểu luồng)**:
- **Task mới**: gửi Zalo cho người được giao (kể cả khi tự giao cho mình) khi task được tạo qua `POST /tasks` hoặc từ email. **Không** gửi với thẻ tạo từ board (`POST /tasks/inbox/cards`, `POST /lists/:id/cards`). Nội dung: tiêu đề, độ ưu tiên, deadline (theo múi giờ người nhận), mô tả dạng text ≤1000 ký tự, link `${FRONTEND_URL}/tasks`.
- **Nhắc deadline**: mỗi giờ (phút 0), quét task chưa `DONE`/`CANCELLED`, chưa nhắc, có `deadline` trong `[now, now + TASK_DEADLINE_REMINDER_HOURS]` (mặc định 24 giờ). Task đã quá hạn không bao giờ được nhắc.
  - Mỗi task chỉ nhắc 1 lần. Người được giao **chưa liên kết Zalo** thì task không bị đánh dấu → liên kết muộn (khi hạn vẫn còn trong cửa sổ) vẫn nhận được nhắc ở lần quét kế tiếp. Gửi lỗi thì vẫn đánh dấu (không retry).
  - Cờ được reset khi đổi hạn: `PATCH /tasks/:id/snooze` hoặc `PATCH /tasks/:id` có `deadline` mới.
- Env liên quan: `ZALO_BOT_TOKEN`, `ZALO_BOT_PROFILE_URL`, `TASK_DEADLINE_REMINDER_HOURS`, `FRONTEND_URL`.
- Zalo là kênh thông báo duy nhất (tự động + broadcast thủ công của admin) — FE **không** cần/có thể tự implement push notification, không có SSE/WebSocket.

---

## 8. Ghi chú cho FE

- Thông tin user hiện tại lấy qua `GET /auth/me`; danh sách user (chọn người được giao) qua `GET /users` — **chỉ admin**. Không có endpoint tạo/sửa/xoá user.
- Một số task có thể tự sinh ra từ email (mục 5b) — hiển thị bình thường, phân biệt qua `sourceMailAccountId` / `source = 'EMAIL'`.
- **Không có upload file thật** — không có endpoint `multipart/form-data`. Đính kèm chỉ là metadata JSON: `POST /tasks/:id/attachments` (`name`, `kind`, `url`) hoặc trường legacy `attachments: string[]` của task. Ảnh nhúng trong mô tả có thể là `data:` URI (body tối đa 10 MB).
- **Chưa có tính năng quên/đặt lại mật khẩu** dù DB đã có bảng `PasswordResetOtp` (chưa nối controller nào) — FE **không nên** làm màn hình "Quên mật khẩu".
- Lưu access token in-memory/state là đủ; khi gặp `401`, gọi `POST /auth/refresh-token` (cookie tự gửi) rồi retry — pattern interceptor chuẩn của axios. Refresh cũng `401` → coi như hết phiên.
- Do bật `forbidNonWhitelisted`, chỉ gửi đúng các field được liệt kê — thừa field (kể cả query như `undo`) sẽ bị `400` (riêng `/me/preferences/theme` là `422`, mục 6b).
