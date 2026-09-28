#!/bin/sh
# Nạp một bản backup của backup.sh vào DB đích.
#
#   RESTORE_DATABASE_URL=postgresql://... \
#   BACKUP_PASSPHRASE=... \
#   sh scripts/db/restore.sh backups/task-mail-<UTC>.dump.gpg
#
# Chốt an toàn:
#   - Đích không phải localhost thì phải đặt CONFIRM_RESTORE=<host của đích>.
#   - `public` của đích đã có bảng thì từ chối, trừ khi RESTORE_CLEAN=1 — khi đó
#     các bảng trong dump bị DROP rồi tạo lại (bảng không có trong dump giữ nguyên).
#   - Cả lần nạp chạy trong một transaction: lỗi giữa chừng thì đích không đổi.
#
# Có file `.counts.tsv` cạnh bản backup thì đối chiếu số dòng sau khi nạp.
set -eu

FILE="${1:-}"
URL="${RESTORE_DATABASE_URL:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Cách dùng: RESTORE_DATABASE_URL=... sh scripts/db/restore.sh <file.dump[.gpg]>" >&2
  exit 1
fi
if [ -z "$URL" ]; then
  echo "Thiếu RESTORE_DATABASE_URL" >&2
  exit 1
fi

HOST=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://([^@]*@)?([^:/?]+).*#\2#')
case "$HOST" in
  localhost | 127.0.0.1 | ::1) ;;
  *)
    if [ "${CONFIRM_RESTORE:-}" != "$HOST" ]; then
      echo "Đích là '$HOST', không phải localhost. Đặt CONFIRM_RESTORE=$HOST nếu đúng ý." >&2
      exit 1
    fi
    ;;
esac

# `< /dev/null`: vòng đối chiếu bên dưới đọc stdin, psql không được nuốt mất.
q() { psql --dbname="$URL" -X -q -A -t -v ON_ERROR_STOP=1 "$@" < /dev/null; }

TABLES=$(q -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
CLEAN=""
if [ "$TABLES" != "0" ]; then
  if [ "${RESTORE_CLEAN:-}" != "1" ]; then
    echo "public trên '$HOST' đã có $TABLES bảng. Đặt RESTORE_CLEAN=1 để ghi đè." >&2
    exit 1
  fi
  CLEAN="--clean --if-exists"
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

DUMP="$FILE"
case "$FILE" in
  *.gpg)
    : "${BACKUP_PASSPHRASE:?Thiếu BACKUP_PASSPHRASE để giải mã}"
    DUMP="$WORK/db.dump"
    printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
      --pinentry-mode loopback --passphrase-fd 0 \
      --decrypt --output "$DUMP" "$FILE"
    ;;
esac

# Search trong board gọi `unaccent(...)` không kèm schema, nên nó phải nằm
# trong search_path — Supabase cài nó ở `public`, làm y như vậy.
q -c 'SET client_min_messages = warning' -c 'CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public'

# Bỏ mục `SCHEMA public` khỏi mục lục: đích luôn có sẵn schema này, tạo lại thì
# lỗi "already exists", còn --clean thì DROP luôn cả extension nằm trong nó.
pg_restore --list "$DUMP" | grep -v ' SCHEMA - public ' > "$WORK/toc.list"

# shellcheck disable=SC2086
pg_restore --dbname="$URL" \
  --use-list="$WORK/toc.list" \
  --no-owner --no-privileges \
  --single-transaction --exit-on-error \
  $CLEAN \
  "$DUMP"

echo "Đã nạp vào '$HOST'."

COUNTS="${FILE%.dump*}.counts.tsv"
[ -f "$COUNTS" ] || exit 0

FAIL=0
TAB=$(printf '\t')
while IFS="$TAB" read -r TABLE EXPECTED; do
  [ -n "$TABLE" ] || continue
  ACTUAL=$(q -c "SELECT count(*) FROM public.\"$TABLE\"" 2>/dev/null || echo "MISSING")
  if [ "$ACTUAL" = "MISSING" ]; then
    echo "  THIẾU BẢNG  $TABLE" >&2
    FAIL=1
  elif [ "$ACTUAL" = "$EXPECTED" ]; then
    echo "  ok          $TABLE $ACTUAL"
  elif [ "$ACTUAL" = "0" ]; then
    echo "  RỖNG        $TABLE: có $EXPECTED lúc backup, nạp ra 0" >&2
    FAIL=1
  else
    echo "  lệch        $TABLE: $EXPECTED lúc backup, nạp ra $ACTUAL (ghi xen lúc dump?)"
  fi
done < "$COUNTS"

q -c "SELECT unaccent('Tiếng Việt')" > /dev/null

exit $FAIL
