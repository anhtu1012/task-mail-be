# NestJS Auth CMS — Auth Module

Auth Module production-ready cho NestJS CMS/SaaS, dùng **PostgreSQL + Prisma ORM**, JWT Access/Refresh Token, refresh-token rotation, và Swagger. Kiến trúc Clean: Controller → Service → Handler.

## Mục lục

1. [Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
2. [Cài đặt](#2-cài-đặt)
3. [Cấu hình biến môi trường](#3-cấu-hình-biến-môi-trường)
4. [Khởi tạo database](#4-khởi-tạo-database)
5. [Chạy ứng dụng](#5-chạy-ứng-dụng)
6. [Swagger UI](#6-swagger-ui)
7. [API Reference](#7-api-reference)
8. [Luồng xác thực (Auth Flow)](#8-luồng-xác-thực-auth-flow)
9. [Kiểm thử bằng curl](#9-kiểm-thử-bằng-curl)
10. [Cấu trúc thư mục](#10-cấu-trúc-thư-mục)
11. [Cơ chế bảo mật](#11-cơ-chế-bảo-mật)
12. [Xử lý lỗi thường gặp](#12-xử-lý-lỗi-thường-gặp)
13. [Mở rộng trong tương lai](#13-mở-rộng-trong-tương-lai)

---

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu |
|---|---|
| Node.js | 20.x (khuyến nghị 22.x) |
| PostgreSQL | 14+ |
| npm | 10.x |

Nếu chưa có PostgreSQL cài sẵn, cách nhanh nhất là dùng Docker:

```bash
docker run -d --name cms-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=cms_db \
  -p 5432:5432 \
  postgres:16-alpine
```

> ⚠️ Nếu máy bạn đã có PostgreSQL native chạy sẵn trên cổng 5432 (ví dụ cài qua Windows installer chạy dưới dạng Service), nó sẽ **chiếm cổng 5432** và khiến container Docker không nhận kết nối đúng dù đã map cổng. Kiểm tra bằng:
> ```bash
> netstat -ano | findstr :5432
> ```
> Nếu thấy 2 process cùng LISTEN ở cổng 5432, đổi cổng container sang `-p 5433:5432` và sửa `DATABASE_URL` tương ứng (`localhost:5433`).

## 2. Cài đặt

```bash
cd nestjs-auth-cms
npm install
```

## 3. Cấu hình biến môi trường

Copy file mẫu và điền giá trị thật:

```bash
cp .env.example .env
```

| Biến | Mô tả | Ví dụ |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://postgres:password@localhost:5432/cms_db?schema=public` |
| `JWT_ACCESS_SECRET` | Secret ký Access Token | chuỗi ngẫu nhiên dài, khác `REFRESH_SECRET` |
| `JWT_REFRESH_SECRET` | Secret ký Refresh Token | chuỗi ngẫu nhiên dài, khác `ACCESS_SECRET` |
| `JWT_ACCESS_EXPIRES` | TTL Access Token | `15m` |
| `JWT_REFRESH_EXPIRES` | TTL Refresh Token | `7d` |
| `COOKIE_SECURE` | Cookie chỉ gửi qua HTTPS | `true` ở production, `false` khi dev local (HTTP) |
| `COOKIE_DOMAIN` | Domain áp dụng cho cookie | `localhost` khi dev, domain thật khi deploy |
| `PORT` | Cổng HTTP server | `3000` |
| `NODE_ENV` | Môi trường chạy | `development` / `production` |

**Sinh secret an toàn** (thay vì để giá trị mẫu `change_me_*`):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Chạy 2 lần để có 2 secret khác nhau cho Access và Refresh.

## 4. Khởi tạo database

Prisma dùng schema tại `prisma/schema.prisma`. Sau khi `DATABASE_URL` đã đúng:

```bash
# Tạo & áp dụng migration đầu tiên (chỉ chạy khi DB còn trống / lần đầu setup)
npx prisma migrate dev --name init

# Sinh lại Prisma Client sau khi đổi schema (migrate dev đã tự làm việc này,
# chỉ cần chạy riêng khi bạn đổi schema mà chưa muốn tạo migration mới)
npx prisma generate
```

Các model được tạo: `User`, `RefreshToken`, `PasswordResetOtp` (bảng cho flow quên mật khẩu — đã có schema, endpoint chưa implement).

Muốn xem dữ liệu trực quan:

```bash
npx prisma studio
```

## 5. Chạy ứng dụng

```bash
# development (không watch)
npm run start

# development với watch mode (khuyến nghị khi code)
npm run start:dev

# build production
npm run build
node dist/main.js
```

Server mặc định chạy tại `http://localhost:3000`.

## 6. Swagger UI

Sau khi server chạy, mở:

```
http://localhost:3000/api/docs
```

- Nút **Authorize** cho phép nhập Bearer Access Token để test `GET /auth/me`.
- `refresh-token` và `logout` dùng cookie `refresh_token` (HttpOnly) — Swagger UI tự gửi cookie cùng origin khi bấm "Try it out", không cần nhập gì thêm miễn là bạn đã `login`/`register` từ chính tab Swagger đó trước.
- Swagger JSON thô: `http://localhost:3000/api/docs-json`.

## 7. API Reference

Base URL: `http://localhost:3000`

### `POST /auth/register`
Tạo tài khoản mới, tự động login (trả access token + set cookie refresh token).

Request body:
```json
{ "email": "jane.doe@example.com", "password": "StrongP@ssw0rd!" }
```
- `password` tối thiểu 8 ký tự.
- Trả `201 Created`:
```json
{ "accessToken": "eyJhbGciOi...", "expiresIn": 900 }
```
- `409 Conflict` nếu email đã tồn tại (`errorCode: AUTH_EMAIL_ALREADY_EXISTS`).

### `POST /auth/login`
Request body giống `register`. Trả `200 OK` cùng shape với register.
- `401 Unauthorized` nếu sai email/password (`AUTH_INVALID_CREDENTIALS`) hoặc tài khoản không ACTIVE (`AUTH_ACCOUNT_NOT_ACTIVE`).

### `POST /auth/refresh-token`
Không cần body — server đọc cookie `refresh_token` (HttpOnly) tự động từ request.
- Xoay vòng (rotate): refresh token cũ bị revoke, cấp access token + refresh token mới, ghi cookie mới.
- `200 OK` — cùng shape `{ accessToken, expiresIn }`.
- `401 Unauthorized` nếu cookie thiếu/hết hạn/đã bị revoke. Nếu phát hiện **token đã dùng lại** (dấu hiệu bị đánh cắp), toàn bộ refresh token của user đó bị revoke ngay (`AUTH_REFRESH_TOKEN_REUSED`) — buộc phải login lại.

### `POST /auth/logout`
Không cần body — đọc cookie `refresh_token`.
- Revoke refresh token hiện tại trong DB, xoá cookie.
- `204 No Content`.

### `GET /auth/me`
Cần header `Authorization: Bearer <accessToken>`.
- `200 OK`:
```json
{ "id": "uuid", "email": "jane.doe@example.com", "role": "USER" }
```
- `401 Unauthorized` nếu token thiếu/sai/hết hạn.

### Response lỗi (format chung — `HttpExceptionFilter`)
```json
{
  "statusCode": 401,
  "errorCode": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password",
  "path": "/auth/login",
  "timestamp": "2026-07-01T09:00:00.000Z"
}
```

## 8. Luồng xác thực (Auth Flow)

```
┌──────────┐   1. register/login    ┌──────────────┐
│  Client  │ ─────────────────────▶ │ AuthController│
└──────────┘                        └──────┬───────┘
      ▲                                     │
      │  accessToken (JSON body)            │ issueTokenPair()
      │  refreshToken (Set-Cookie HttpOnly) │
      │                                     ▼
      │                          ┌────────────────────┐
      │                          │  RefreshToken row   │  (hash lưu DB,
      │                          │  trong PostgreSQL   │   raw token chỉ
      │                          └────────────────────┘   nằm trong cookie)
      │
      │  2. Gọi API cần auth: Authorization: Bearer <accessToken>
      │
      │  3. accessToken hết hạn (15m) → gọi /auth/refresh-token
      │     (browser tự gửi cookie refresh_token)
      │     → server revoke token cũ, cấp token mới (rotation)
      │
      │  4. logout → revoke token hiện tại + xoá cookie
      ▼
```

Điểm quan trọng về bảo mật thiết kế:
- **Access token**: JWT ký bằng `JWT_ACCESS_SECRET`, sống ngắn (15 phút), gửi qua header `Authorization`, không lưu ở đâu trên server (stateless).
- **Refresh token**: JWT ký bằng `JWT_REFRESH_SECRET`, chứa `{ sub: userId, tokenId }`. `tokenId` map tới 1 row trong bảng `refresh_tokens`. Row lưu **SHA-256 hash** của chính refresh token đó — không lưu raw token trong DB.
- Mỗi lần refresh: row cũ bị `revokedAt` set, row mới được tạo, liên kết qua `replacedByTokenId` (audit chain).
- Nếu 1 refresh token **đã bị revoke** mà vẫn được gửi lên lại → hệ thống coi đó là dấu hiệu token bị đánh cắp và **revoke toàn bộ session của user** đó, buộc đăng nhập lại trên mọi thiết bị.

## 9. Kiểm thử bằng curl

```bash
# 1. Register (lưu cookie vào file để dùng cho các bước sau)
curl -c cookies.txt -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane.doe@example.com","password":"StrongP@ssw0rd!"}'

# 2. Lấy accessToken từ response trên, gọi /me
curl http://localhost:3000/auth/me -H "Authorization: Bearer <accessToken>"

# 3. Refresh token (cookie tự gửi kèm)
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/refresh-token

# 4. Logout
curl -b cookies.txt -X POST http://localhost:3000/auth/logout -o /dev/null -w "status: %{http_code}\n"

# 5. Refresh lại sau logout — phải trả 401
curl -b cookies.txt -X POST http://localhost:3000/auth/refresh-token -o /dev/null -w "status: %{http_code}\n"
```

## 10. Cấu trúc thư mục

```
src/
├── config/            # Config typed theo domain (app, auth, cookie, database, swagger, rate-limit)
├── common/            # constants, decorators, enums, exceptions, guards, interceptors,
│                       # middlewares, pipes, utils, types, interfaces — dùng chung toàn app
├── infrastructure/
│   └── database/      # PrismaModule / PrismaService (kết nối Postgres qua @prisma/adapter-pg)
├── modules/
│   ├── auth/           # Controller → Service → Handler cho toàn bộ nghiệp vụ Auth
│   │   ├── dto/
│   │   ├── handlers/   # register / login / logout / refresh-token — business logic thật
│   │   ├── guards/      # JwtRefreshGuard
│   │   ├── strategies/  # JwtStrategy (access), JwtRefreshStrategy (refresh, đọc cookie)
│   │   ├── services/    # TokenService — issue access+refresh token pair, dùng chung các handler
│   │   └── repositories/# RefreshTokenRepository — duy nhất chỗ chạm Prisma cho bảng refresh_tokens
│   └── users/
│       ├── users.service.ts
│       └── repositories/user.repository.ts
├── generated/prisma/   # Prisma Client generate ra (KHÔNG commit — xem mục 12)
├── app.module.ts
└── main.ts
prisma/
├── schema.prisma       # Nguồn sự thật cho toàn bộ model DB
└── migrations/
```

Nguyên tắc phân lớp: **Controller** chỉ lo routing/Swagger/đọc-ghi cookie; **Service** (`AuthService`) chỉ điều phối gọi handler nào; **Handler** chứa toàn bộ business logic thật (kiểm tra trùng email, so khớp password, xoay refresh token...); **Repository** là nơi duy nhất gọi Prisma trực tiếp.

## 11. Cơ chế bảo mật

- **Password**: hash bằng bcrypt, `BCRYPT_SALT_ROUNDS = 12` (`common/constants/auth.constants.ts`).
- **Refresh token**: không bao giờ lưu raw string vào DB — chỉ lưu SHA-256 hash (`common/utils/crypto.util.ts`). SHA-256 (không dùng bcrypt) vì đây là so khớp token ngẫu nhiên entropy cao, không cần salt/slow-hash như password.
- **Cookie**: `httpOnly: true`, `sameSite: 'strict'`, `secure` theo `COOKIE_SECURE` — **bắt buộc để `true` ở production (HTTPS)**.
- **Global Guard**: `JwtAuthGuard` áp dụng cho MỌI route theo mặc định (`APP_GUARD` trong `app.module.ts`) — route nào công khai phải gắn `@Public()` rõ ràng (register, login, refresh-token, logout).
- **Rate limiting**: `ThrottlerModule` mặc định 20 request / 60 giây / IP cho toàn app — nên đặt riêng ngưỡng chặt hơn cho `/auth/login` nếu triển khai thật (chưa làm trong bản này).
- **CORS**: `main.ts` bật `credentials: true` để cookie hoạt động cross-origin — khi deploy, đổi `origin: true` thành whitelist domain frontend thật, không để mở toàn bộ.

## 12. Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `P1000: Authentication failed` khi `prisma migrate` | Sai user/password, hoặc **có Postgres khác đang chiếm cổng 5432** | Kiểm tra `netstat -ano \| findstr :5432`; nếu có 2 tiến trình LISTEN, đổi cổng container Docker |
| `ReferenceError: exports is not defined in ES module scope` khi chạy `node dist/main.js` | Prisma 7 generator mặc định sinh code có `import.meta.url` — Node coi file là ESM dù project là CommonJS | Đảm bảo `generator client { moduleFormat = "cjs" }` trong `prisma/schema.prisma`, chạy lại `npx prisma generate` |
| `Cannot find module 'dist/main.js'` | `tsconfig.build.json` không giới hạn `rootDir`/`include` vào `src`, khiến tsc tính rootDir sai khi có file `.ts` ở ngoài `src` (ví dụ `prisma.config.ts`) | Đã cấu hình `"rootDir": "src"` + `"include": ["src/**/*"]` trong `tsconfig.build.json` — nếu tự thêm file `.ts` mới ở root, nhớ giữ nguyên rule này |
| Build/emit "thành công" nhưng `dist/` trống hoặc thiếu file | Cache `tsconfig.build.tsbuildinfo` (incremental build) bị stale sau khi đổi `rootDir`/cấu trúc thư mục | Xoá `tsconfig.build.tsbuildinfo` rồi build lại |
| `EADDRINUSE: address already in use :::3000` | Có process cũ (từ lần chạy trước) chưa tắt còn giữ cổng 3000 | Windows: `netstat -ano \| findstr :3000` rồi `taskkill /F /PID <pid>` |
| `401` ngay ở `/auth/refresh-token` dù mới login | Cookie `refresh_token` không được gửi lên — thường do gọi từ domain/port khác domain server, hoặc `COOKIE_SECURE=true` mà đang test qua HTTP | Test cùng origin, hoặc để `COOKIE_SECURE=false` khi dev local qua HTTP |

## 13. Mở rộng trong tương lai

Schema và cấu trúc đã chuẩn bị sẵn cho:
- **Google OAuth**: enum `AuthProvider` đã có `GOOGLE`, chỉ cần thêm 1 `GoogleStrategy` mới trong `modules/auth/strategies/` và nhánh xử lý trong `RegisterHandler`/`LoginHandler`.
- **Multi-tenant**: cột `tenantId` (nullable) đã có sẵn trên `User`; `TenantMiddleware` (`common/middlewares/tenant.middleware.ts`) đã scaffold để resolve tenant từ header — khi bật multi-tenant thật, đổi cột thành `required` + thêm index, sửa middleware lấy tenant từ subdomain/JWT claim.
- **Quên mật khẩu**: model `PasswordResetOtp` đã có trong schema — cần thêm `ForgotPasswordHandler`/`ResetPasswordHandler` + 2 endpoint mới, tái dùng `HashUtil`/`CryptoUtil` sẵn có.
- **Role-based access**: `RolesGuard` + decorator `@Roles(Role.ADMIN)` đã sẵn, chỉ cần gắn vào route cần giới hạn.
