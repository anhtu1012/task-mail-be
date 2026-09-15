/**
 * Pre-flight check before running the board migration on a database other than
 * dev. Read-only: it never writes anything.
 *
 * Checks the three things that can actually go wrong (board-next-steps §3):
 *   1. `CREATE EXTENSION unaccent` needs a privilege production often withholds.
 *   2. `ALTER COLUMN description TYPE TEXT` rewrites and locks the table — the
 *      cost depends on whether the column is already `text`.
 *   3. The lazy board seeding runs on each user's first request, so an account
 *      with many tasks makes that request slow.
 *
 *   npm run build && npm run check:migration
 */
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ScriptModule } from './script.module';

type TargetRow = { db: string; role: string };
type ExtensionRow = {
  installed_version: string | null;
  default_version: string | null;
};
type PrivilegeRow = { rolsuper: boolean; rolcreatedb: boolean };
type ColumnRow = { data_type: string; character_maximum_length: number | null };
type CountRow = { tasks: number };
type PendingUserRow = { email: string; tasks: number };

const report = (
  verdict: 'ok' | 'warn' | 'blocking',
  label: string,
  detail: string,
): void => {
  const mark = { ok: ' OK  ', warn: 'CHÚ Ý', blocking: 'CHẶN ' }[verdict];
  console.log(`[${mark}] ${label}\n        ${detail}`);
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  let blocking = 0;

  try {
    const [target] = await prisma.$queryRaw<TargetRow[]>`
      SELECT current_database() AS db, current_user AS role
    `;
    console.log(`Database: ${target.db}  ·  role: ${target.role}\n`);

    // 1. unaccent ------------------------------------------------------------
    const [extension] = await prisma.$queryRaw<ExtensionRow[]>`
      SELECT installed_version, default_version
      FROM pg_available_extensions WHERE name = 'unaccent'
    `;
    const [privilege] = await prisma.$queryRaw<PrivilegeRow[]>`
      SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user
    `;

    if (!extension) {
      blocking += 1;
      report(
        'blocking',
        'Server không có extension unaccent',
        'Tìm kiếm không dấu (/boards/me/search) sẽ hỏng. Cần cài contrib module.',
      );
    } else if (extension.installed_version) {
      report(
        'ok',
        `unaccent đã cài (bản ${extension.installed_version})`,
        'Migration sẽ bỏ qua nhờ IF NOT EXISTS.',
      );
    } else if (privilege?.rolsuper || privilege?.rolcreatedb) {
      report(
        'ok',
        `unaccent có sẵn (bản ${extension.default_version ?? '?'}), chưa cài`,
        'Role hiện tại có quyền tạo extension — migration sẽ cài được.',
      );
    } else {
      blocking += 1;
      report(
        'blocking',
        'unaccent chưa cài và role không có quyền tạo',
        'Nhờ quản trị DB chạy trước: CREATE EXTENSION IF NOT EXISTS "unaccent";',
      );
    }

    // 2. description column --------------------------------------------------
    const [column] = await prisma.$queryRaw<ColumnRow[]>`
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'description'
    `;

    if (!column) {
      report(
        'warn',
        'Chưa có bảng tasks',
        'Database trống — migration sẽ chạy từ đầu.',
      );
    } else if (column.data_type === 'text') {
      report(
        'ok',
        'tasks.description đã là text',
        'ALTER COLUMN là no-op, không khoá bảng.',
      );
    } else {
      const [size] = await prisma.$queryRaw<CountRow[]>`
        SELECT count(*)::int AS tasks FROM tasks
      `;
      report(
        'warn',
        `tasks.description đang là ${column.data_type}(${column.character_maximum_length ?? '?'})`,
        `ALTER sẽ ghi lại ${size.tasks} dòng và khoá bảng — chạy lúc vắng người dùng.`,
      );
    }

    // 3. lazy board seeding --------------------------------------------------
    const pending = await prisma.$queryRaw<PendingUserRow[]>`
      SELECT u.email, count(t.id)::int AS tasks
      FROM users u
      LEFT JOIN tasks t ON t.assignee_id = u.id
      WHERE NOT EXISTS (SELECT 1 FROM boards b WHERE b.owner_id = u.id)
      GROUP BY u.email
      HAVING count(t.id) > 0
      ORDER BY count(t.id) DESC
      LIMIT 10
    `;

    if (pending.length === 0) {
      report(
        'ok',
        'Không ai phải chờ dựng bảng',
        'Mọi người dùng có việc đều đã có bảng.',
      );
    } else {
      report(
        'warn',
        `${pending.length} người dùng chưa có bảng, nhiều nhất ${pending[0].tasks} việc`,
        'Chạy `npm run backfill:boards` sau migration để người dùng đầu tiên không phải gánh.',
      );
    }
  } finally {
    await app.close();
  }

  console.log(
    blocking === 0
      ? '\nKết luận: chạy migration được.'
      : `\nKết luận: ${blocking} vấn đề CHẶN — xử lý trước khi chạy migration.`,
  );
  process.exitCode = blocking === 0 ? 0 : 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
