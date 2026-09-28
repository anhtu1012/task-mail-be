#!/bin/sh
# Backup schema `public` (toàn bộ dữ liệu của app, kể cả `_prisma_migrations`).
#
#   BACKUP_DATABASE_URL=postgresql://...:5432/postgres \
#   BACKUP_PASSPHRASE=... \
#   sh scripts/db/backup.sh [thư_mục_ra]      # mặc định ./backups
#
# Ra ba file cùng tiền tố `task-mail-<UTC>`:
#   .dump.gpg   pg_dump custom format, mã hoá AES256 bằng BACKUP_PASSPHRASE
#   .counts.tsv số dòng từng bảng lúc backup — restore.sh dùng để đối chiếu
#   .sha256     checksum của hai file trên
#
# Chỉ lấy `public`: app tự quản lý user, không dùng `auth`/`storage` của
# Supabase. Extension không nằm trong dump (pg_dump -n bỏ qua extension) —
# restore.sh tự tạo `unaccent` trước khi nạp.
set -eu

URL="${BACKUP_DATABASE_URL:-${DIRECT_URL:-${DATABASE_URL:-}}}"
if [ -z "$URL" ]; then
  echo "Thiếu BACKUP_DATABASE_URL (hoặc DIRECT_URL / DATABASE_URL)" >&2
  exit 1
fi

# Transaction pooler (6543) không giữ được snapshot/SET của pg_dump suốt phiên.
case "$URL" in
  *:6543/*)
    echo "URL đang trỏ transaction pooler (cổng 6543). Dùng session pooler cổng 5432." >&2
    exit 1
    ;;
esac

if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ "${ALLOW_PLAINTEXT:-}" != "1" ]; then
  echo "Thiếu BACKUP_PASSPHRASE. Bản dump chứa hash mật khẩu và token OAuth —" >&2
  echo "chỉ bỏ mã hoá khi chắc chắn, bằng ALLOW_PLAINTEXT=1." >&2
  exit 1
fi

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
NAME="task-mail-$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$OUT_DIR/$NAME.dump"
COUNTS="$OUT_DIR/$NAME.counts.tsv"

echo "pg_dump → $DUMP"
pg_dump --dbname="$URL" \
  --format=custom --compress=9 \
  --schema=public \
  --no-owner --no-privileges \
  --file="$DUMP"

# Đọc được mục lục = file không bị cắt cụt giữa chừng.
pg_restore --list "$DUMP" > /dev/null

# Đếm ngay sau dump. Không cùng snapshot với pg_dump nên nếu có ghi xen giữa
# thì lệch vài dòng là bình thường — restore.sh chỉ cảnh báo, không đánh trượt.
psql --dbname="$URL" -X -q -A -t -F "$(printf '\t')" -v ON_ERROR_STOP=1 > "$COUNTS" <<'SQL'
SELECT format('SELECT %L, count(*) FROM public.%I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SQL

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
    --pinentry-mode loopback --passphrase-fd 0 \
    --symmetric --cipher-algo AES256 \
    --output "$DUMP.gpg" "$DUMP"
  rm -f "$DUMP"
  DUMP="$DUMP.gpg"
fi

(cd "$OUT_DIR" && sha256sum "$(basename "$DUMP")" "$(basename "$COUNTS")" > "$NAME.sha256")

echo "Xong: $DUMP ($(wc -c < "$DUMP") bytes), $(wc -l < "$COUNTS") bảng"
