# API Reference — nestjs-auth-cms

Tài liệu này mô tả toàn bộ API backend để dựng frontend (React). Được tạo bằng cách quét trực tiếp source code (controllers, DTOs, guards, Prisma schema) — phản ánh đúng hành vi thực tế tại thời điểm viết (2026-07-04).

## 1. Thông tin chung

- **Base URL**: không có global prefix — gọi thẳng `http://localhost:8888/auth/login`, `http://localhost:8888/tasks`, ... (không phải `/api/...`).
- **CORS**: `origin: true, credentials: true` — FE phải gửi kèm `credentials: 'include'` (fetch) hoặc `withCredentials: true` (axios) để cookie refresh-token hoạt động.
- **Swagger UI**: `GET /api/docs` (đã bật `persistAuthorization`, hỗ trợ cả Bearer token và cookie `refresh_token`).
- **Validation**: mọi DTO dùng `class-validator`, bật `whitelist + forbidNonWhitelisted` → gửi field thừa sẽ bị `400 Bad Request`.
- **Global guard**: **mọi route mặc định yêu cầu Bearer access token**, trừ route có đánh dấu **Public** trong bảng dưới.
- **Rate limit**: 20 requests / 60 giây / client (toàn cục) — vượt quá trả `429 Too Many Requests`.

### Auth header

```
Authorization: Bearer <accessToken>
```

### Refresh token cookie

- Tên cookie: `refresh_token`
- `HttpOnly`, `SameSite=Strict`, `secure` theo env `COOKIE_SECURE`
- Được set tự động bởi: `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh-token`, `GET /auth/google/callback`
- Bị xoá bởi: `POST /auth/logout`
- FE **không đọc/ghi** cookie này trực tiếp — chỉ cần gọi API kèm `credentials: 'include'`, trình duyệt tự gửi cookie.

### Response envelope

**Không có envelope bọc dữ liệu thành công** (không phải dạng `{success, data}`) — response thành công chính là JSON trả về nguyên bản như mô tả trong từng endpoint bên dưới.

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
- Nếu lỗi không có `errorCode` riêng (vd: `403 Forbidden` từ role guard, hoặc uuid không hợp lệ) thì `errorCode` sẽ là `"ERROR"`.

### Enum dùng chung

| Enum | Giá trị |
|---|---|
| `Role` | `USER`, `ADMIN`, `SUPER_ADMIN` |
| `UserStatus` | `ACTIVE`, `INACTIVE`, `BANNED` |
| `AuthProvider` | `LOCAL`, `GOOGLE` |
| `TaskPriority` | `LOW`, `NORMAL` (default), `HIGH`, `URGENT` |
| `TaskStatus` | `TODO` (default), `IN_PROGRESS`, `DONE`, `CANCELLED` |
| `MailProvider` | `GOOGLE` |
| `deadlineStatus` (tính toán, không lưu DB) | `'IN_PROGRESS' \| 'ON_TIME' \| 'LATE'` |

---

## 2. Module `auth` (`/auth`)

### `POST /auth/register` — Public

Body (`RegisterDto`):
```ts
{ email: string; password: string /* min 8 ký tự */ }
```
- `201 Created` → `{ accessToken: string, expiresIn: number /* giây */ }` + set cookie `refresh_token`
- `409 Conflict`, `errorCode: "AUTH_EMAIL_ALREADY_EXISTS"` — email đã tồn tại

### `POST /auth/login` — Public

Body (`LoginDto`):
```ts
{ email: string; password: string }
```
- `200 OK` → `{ accessToken: string, expiresIn: number }` + set cookie `refresh_token`
- `401`, `errorCode: "AUTH_INVALID_CREDENTIALS"` — sai email/password
- `401`, `errorCode: "AUTH_ACCOUNT_NOT_ACTIVE"` — tài khoản bị khoá
- `401`, `errorCode: "AUTH_GOOGLE_ACCOUNT_ONLY"` — tài khoản này đăng ký bằng Google, không có mật khẩu local → FE nên hiển thị nút "Đăng nhập bằng Google" thay vì form password

### `GET /auth/google` — Public

Redirect sang màn hình đăng nhập Google. FE chỉ cần `<a href="http://localhost:8888/auth/google">Đăng nhập với Google</a>` hoặc `window.location.href = ...` (không gọi bằng fetch/axios vì đây là điều hướng trình duyệt).

### `GET /auth/google/callback` — Public

Google gọi lại route này sau khi user đồng ý. Server tự xử lý, set cookie `refresh_token`, rồi **redirect trình duyệt** sang:

```
${FRONTEND_URL}/oauth-callback?accessToken=<jwt>&expiresIn=<seconds>
```

FE cần có 1 trang route `/oauth-callback` đọc `accessToken`/`expiresIn` từ query string, lưu vào state/localStorage rồi điều hướng vào app (giống hệt kết quả của `/auth/login`).

### `POST /auth/refresh-token` — Public (yêu cầu cookie `refresh_token`)

- Không cần body, gọi kèm `credentials: 'include'`.
- `200 OK` → `{ accessToken, expiresIn }` + set cookie mới (rotate)
- `401`, `errorCode: "AUTH_INVALID_REFRESH_TOKEN"` | `"AUTH_REFRESH_TOKEN_REUSED"` | `"AUTH_USER_NOT_FOUND"`

### `POST /auth/logout` — Public (yêu cầu cookie `refresh_token`)

- `204 No Content`, xoá cookie `refresh_token`

### `GET /auth/me` — Bearer required

- `200 OK` → `MeResponseDto`:
```ts
{ id: string; email: string; role: Role }
```

---

## 3. Module `tasks` (`/tasks`) — tất cả yêu cầu Bearer

Quy tắc phân quyền chung: user thường (`USER`) chỉ thấy/sửa được task của chính mình (`assigneeId` hoặc `creatorId` == user hiện tại); `ADMIN`/`SUPER_ADMIN` thấy và thao tác được mọi task, và là người duy nhất được gán task cho người khác.

### `GET /tasks` — danh sách (phân trang)

Query (`QueryTaskDto`, tất cả optional):

| field | type | ghi chú |
|---|---|---|
| `page` | number | mặc định 1 |
| `limit` | number | mặc định 20, tối đa 100 |
| `status` | `TaskStatus` | |
| `priority` | `TaskPriority` | |
| `taskTypeId` | uuid | |
| `assigneeId` | uuid | chỉ có tác dụng với ADMIN/SUPER_ADMIN — user thường luôn bị ép về chính mình |
| `from` | ISO date string | lọc `deadline >=` |
| `to` | ISO date string | lọc `deadline <=` |

Response `200`:
```ts
{ items: TaskResponseDto[]; total: number; page: number; limit: number }
```
(FE tự tính `totalPages = Math.ceil(total / limit)`)

### `GET /tasks/stats`

Query: `assigneeId?` (uuid, chỉ ADMIN/SUPER_ADMIN dùng được).

Response `200` (`TaskStatsResponseDto`):
```ts
{
  totalCompleted: number;
  completedInMonth: number;
  completionRate: number;    // %
  performance: number;       // % on-time, all-time
  performanceMonth: number;  // % on-time, tháng hiện tại
}
```

### `GET /tasks/:id`

- `id`: uuid v4, sai định dạng → `400`.
- `403 Forbidden` nếu không phải chủ task/người giao và không phải admin.
- `404` nếu không tồn tại.
- Response `200`: `TaskResponseDto`

### `POST /tasks` — tạo task

Body (`CreateTaskDto`):

| field | type | bắt buộc | ghi chú |
|---|---|---|---|
| `title` | string | ✅ | |
| `description` | string | ❌ | |
| `note` | string | ❌ | |
| `taskTypeId` | uuid | ❌ | |
| `priority` | `TaskPriority` | ❌ | mặc định `NORMAL` |
| `assigneeId` | uuid | ❌ | mặc định là chính mình; chỉ admin được set người khác (nếu không → `403`) |
| `assignedAt` | ISO date string | ❌ | |
| `deadline` | ISO date string | ❌ | |

Response `201`: `TaskResponseDto`

### `PATCH /tasks/:id` — cập nhật

Body (`UpdateTaskDto` = mọi field của `CreateTaskDto` là optional, cộng thêm):

| field | type |
|---|---|
| `status` | `TaskStatus` |
| `completedAt` | ISO date string |

- Nếu set `status: "DONE"` mà không truyền `completedAt` → server tự set `completedAt = now()`.
- Đổi `assigneeId` khi không phải admin → `403`.
- Response `200`: `TaskResponseDto`

### `PATCH /tasks/:id/complete` — đánh dấu hoàn thành ngay

- Không cần body. Set `status = DONE`, `completedAt = now()`.
- Response `200`: `TaskResponseDto`

### `DELETE /tasks/:id`

- Response `204 No Content`

### `TaskResponseDto`

```ts
{
  id: string;
  code: string;            // "TSK-000123"
  title: string;
  description?: string | null;
  note?: string | null;
  taskTypeId?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadlineStatus: 'IN_PROGRESS' | 'ON_TIME' | 'LATE';  // tính toán
  assigneeId: string;
  creatorId?: string | null;
  assignedAt?: string | null;   // Date ISO
  deadline?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Module `task-types` (`/task-types`) — Bearer required

- `GET /task-types` — mọi user đã đăng nhập đều xem được. → `TaskTypeResponseDto[]`
- `POST /task-types` — **chỉ ADMIN/SUPER_ADMIN** (khác thì `403`)
  - Body: `{ name: string /* max 100 ký tự, unique */; color: string /* hex, vd "#93C47D" */ }`
  - `201` → `TaskTypeResponseDto`
- `PATCH /task-types/:id` — chỉ admin. Body: `{ name?: string; color?: string }` → `200`
- `DELETE /task-types/:id` — chỉ admin → `204`

```ts
// TaskTypeResponseDto
{ id: string; name: string; color: string; createdAt: string; updatedAt: string }
```

---

## 5. Module `mail-accounts` (`/mail-accounts`) — kết nối Gmail để tự tạo task từ email

- `GET /mail-accounts` — Bearer required → `MailAccountResponseDto[]`
  ```ts
  { id: string; provider: 'GOOGLE'; email: string; createdAt: string }
  ```
- `GET /mail-accounts/google/connect` — Bearer required → `{ url: string }`
  - FE mở `url` này (tab mới/popup) để user cấp quyền đọc Gmail.
- `GET /mail-accounts/google/callback` — Public, Google tự redirect vào đây, **không phải để FE gọi trực tiếp**. Trả về 1 trang HTML tĩnh báo thành công (không phải JSON) — dùng cho tab popup, không cần FE xử lý JSON response.
- `DELETE /mail-accounts/:id` — Bearer required, chỉ chủ sở hữu hoặc admin → `204`

---

## 6. Module `zalo-accounts` (`/zalo-accounts`) — liên kết Zalo để nhận nhắc deadline

- `POST /zalo-accounts/link-code` — Bearer required, không cần body → `201`:
  ```ts
  { code: string; expiresAt: string; botProfileUrl: string }
  ```
  FE hiển thị `code` (6 số) và hướng dẫn user gửi tin nhắn chứa code này tới bot Zalo (link `botProfileUrl`). Code hết hạn sau 10 phút.
- `GET /zalo-accounts/me` — Bearer required → `200`:
  ```ts
  { linked: boolean; linkedAt?: string }
  ```
- `DELETE /zalo-accounts/me` — Bearer required → `204` (idempotent, gọi khi chưa link cũng không lỗi)

## 7. Module `zalo-bot` (`/zalo-bot`) — chỉ admin

- `GET /zalo-bot/status` — Bearer + role ADMIN/SUPER_ADMIN → `200`:
  ```ts
  { connected: boolean; botName?: string }
  ```

---

## 8. Ghi chú cho FE

- Không có endpoint quản lý user (`/users`) — thông tin user hiện tại chỉ lấy qua `GET /auth/me`.
- Một số task trong `GET /tasks` có thể tự sinh ra từ email (Gmail ingestion chạy nền), không phải do user tạo qua UI — hiển thị bình thường như task khác, không cần xử lý gì đặc biệt.
- Chiến lược lưu access token phía FE: lưu in-memory/state (Redux, Context, hoặc React Query cache) là đủ; khi access token hết hạn (`401`), gọi `POST /auth/refresh-token` (tự động nhờ cookie) để lấy token mới rồi retry request — pattern interceptor chuẩn của axios.
- Do bật `forbidNonWhitelisted`, khi build form/payload gửi lên, chỉ gửi đúng các field được liệt kê ở trên — thừa field sẽ bị từ chối với `400`.
