# Backup & restore database

## Backup những gì

| Có | Không |
|---|---|
| Toàn bộ schema `public`: 21 bảng của app, enum, index, sequence, `_prisma_migrations` | Schema `auth`/`storage`/`realtime` của Supabase — app tự quản lý user, không dùng |
| | Extension (`unaccent`) — `restore.sh` tự tạo lại |
| | Secret trong `.env` / Render — **xem mục “Thứ phải giữ riêng”** |

Mỗi lần backup ra ba file `task-mail-<UTC>.*`:

- `.dump.gpg` — `pg_dump` custom format, mã hoá AES256 bằng `BACKUP_PASSPHRASE`
- `.counts.tsv` — số dòng từng bảng lúc backup, để đối chiếu sau khi restore
- `.sha256` — checksum

## Backup tự động (GitHub Actions)

`.github/workflows/db-backup.yml` chạy **02:00 giờ VN mỗi ngày**. Mỗi lần chạy nó
dump DB, **nạp thử vào một Postgres 17 trống và đối chiếu số dòng**, rồi mới
lưu artifact (giữ 30 ngày). Bước nạp thử lỗi thì workflow báo đỏ.

### Cài đặt một lần

1. GitHub → repo → Settings → Secrets and variables → Actions → thêm:
   - `BACKUP_DATABASE_URL` — URL **session pooler cổng 5432** (giá trị như
     `DIRECT_URL` trên Render). Transaction pooler 6543 bị script từ chối.
   - `BACKUP_PASSPHRASE` — chuỗi ngẫu nhiên dài, ví dụ
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
     **Cất thêm vào password manager**: mất nó là mọi bản backup thành rác.
2. Merge vào `master`, vì `schedule` chỉ chạy trên nhánh mặc định.
3. Actions → DB backup → **Run workflow** để chạy thử lần đầu.

Lưu ý: nếu repo public và không có commit nào trong 60 ngày, GitHub tự tắt
workflow `schedule`. Vào tab Actions bật lại.

### Lấy bản backup về

Actions → một lần chạy DB backup → Artifacts → `db-backup-<id>` → giải nén vào `backups/`.

## Chạy tay ở máy local (Windows, cần Docker)

Máy không cần cài `pg_dump`. Chạy bằng image `postgres:17-alpine`, cùng major
với server:

```powershell
$env:BACKUP_DATABASE_URL = "<URL session pooler 5432>"
$env:BACKUP_PASSPHRASE   = "<passphrase>"
docker run --rm -e BACKUP_DATABASE_URL -e BACKUP_PASSPHRASE `
  -v "${PWD}:/work" -w /work postgres:17-alpine `
  sh -c "apk add -q --no-cache gnupg && sh scripts/db/backup.sh backups"
```

Nên chạy một lần trước mỗi đợt deploy có migration phá dữ liệu (drop cột, đổi kiểu…).

## Restore

`restore.sh` có sẵn các chốt an toàn:

- Đích không phải `localhost` → phải đặt `CONFIRM_RESTORE=<host đích>`.
- `public` của đích đã có bảng → từ chối, trừ khi đặt `RESTORE_CLEAN=1`. Khi
  đó các bảng trong dump bị drop rồi tạo lại.
- Toàn bộ lần nạp chạy trong **một transaction**: sai passphrase hay lỗi giữa
  chừng thì đích giữ nguyên.
- Nạp xong thì đối chiếu với `.counts.tsv`. Bảng thiếu hoặc bảng rỗng bất
  thường làm script trả mã lỗi.

### Thử restore ra DB tạm (nên tập trước khi thật sự cần)

```powershell
docker network create bk; docker run -d --rm --name bk-pg --network bk -e POSTGRES_PASSWORD=pw postgres:17-alpine
docker run --rm --network bk -v "${PWD}:/work" -w /work `
  -e RESTORE_DATABASE_URL="postgresql://postgres:pw@bk-pg:5432/postgres" `
  -e CONFIRM_RESTORE=bk-pg -e BACKUP_PASSPHRASE `
  postgres:17-alpine sh -c "apk add -q --no-cache gnupg && sh scripts/db/restore.sh backups/task-mail-<UTC>.dump.gpg"
docker stop bk-pg; docker network rm bk
```

### Sự cố thật: nạp đè production

1. Tắt app trên Render (Suspend) để không có ghi mới trong lúc nạp.
2. **Backup trạng thái hiện tại trước** (lệnh ở mục trên). Restore nhầm bản thì
   còn đường lui.
3. Chạy restore với `RESTORE_DATABASE_URL=<URL 5432>`,
   `CONFIRM_RESTORE=aws-0-ap-southeast-1.pooler.supabase.com`, `RESTORE_CLEAN=1`.
4. Bật lại app. `prisma migrate deploy` lúc khởi động sẽ áp các migration mới
   hơn bản backup, vì `_prisma_migrations` được restore cùng dữ liệu.
5. Xoá cache Redis nếu đang dùng (`REDIS_URL`), nếu không app vẫn đọc dữ liệu cũ.

Cách khác an toàn hơn: tạo một project Supabase mới, restore vào đó, rồi đổi
`DATABASE_URL`/`DIRECT_URL` trên Render sang project mới.

## Thứ phải giữ riêng, ngoài bản dump

Bản dump chỉ có dữ liệu. Muốn dữ liệu đó dùng được, cần giữ thêm (password manager):

- `BACKUP_PASSPHRASE` — thiếu nó thì không giải mã được bản backup.
- `TOKEN_ENCRYPTION_KEY` — token OAuth trong `mail_accounts` mã hoá bằng key
  này. Mất key thì mọi user phải kết nối lại Gmail.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — đổi key thì mọi phiên đăng nhập
  mất hiệu lực. Không mất dữ liệu, nhưng user phải đăng nhập lại.
