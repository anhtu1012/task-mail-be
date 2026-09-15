/**
 * Repairs deadlines on tasks created by the old, timezone-unaware mail parser.
 *
 * The old parser built the instant with `new Date(y, m, d, h, min)`, which reads
 * the numbers in the *server's* zone. On the UTC container "17:00" became
 * 17:00Z — 00:00 the next day in Vietnam, seven hours late.
 *
 * The repair does not blindly shift by seven hours. It re-reads the deadline
 * line out of the mail body kept in `description` and recomputes the instant the
 * way the fixed code would, then only writes rows that actually differ. Tasks
 * created through the UI (correct all along) are never touched, because they
 * have no mail body to re-read.
 *
 *   npm run build
 *   node dist/scripts/fix-mail-deadlines.js            # dry run, prints a table
 *   node dist/scripts/fix-mail-deadlines.js --apply    # writes
 */
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BoardAccessService } from '../modules/board/services/board-access.service';
import { parseTaskMail } from '../modules/mail-ingestion/parsers/task-mail.parser';
import { TimezoneUtil } from '../common/utils/timezone.util';
import { ScriptModule } from './script.module';

const format = (at: Date | null, timeZone: string): string =>
  at
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone,
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(at)
    : '—';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const access = app.get(BoardAccessService);

  try {
    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        deadline: { not: null },
        sourceMailAccountId: { not: null },
      },
      select: {
        id: true,
        seq: true,
        description: true,
        deadline: true,
        assigneeId: true,
        deadlineNotifiedAt: true,
      },
      orderBy: { seq: 'asc' },
    });

    console.log(
      `${tasks.length} việc tạo từ mail có deadline${apply ? '' : ' (CHẠY THỬ — không ghi)'}\n`,
    );

    const timezones = new Map<string, string>();
    const fixes: Array<{ id: string; seq: number; from: Date; to: Date }> = [];
    let unreadable = 0;
    let alreadyCorrect = 0;

    for (const task of tasks) {
      // The parser only looks at the body, and every ingested task keeps it.
      const parsed = parseTaskMail(
        '[TASK] x',
        task.description ?? '',
        '[TASK]',
      );
      if (!parsed?.deadline) {
        unreadable += 1;
        console.log(
          `  ?  TSK-${String(task.seq).padStart(6, '0')} không đọc lại được hạn từ nội dung mail — BỎ QUA`,
        );
        continue;
      }

      let timeZone = timezones.get(task.assigneeId);
      if (!timeZone) {
        timeZone = await access.resolveTimezone(task.assigneeId);
        timezones.set(task.assigneeId, timeZone);
      }

      const correct = TimezoneUtil.fromWallClock(timeZone, parsed.deadline);
      const stored = task.deadline as Date;
      if (stored.getTime() === correct.getTime()) {
        alreadyCorrect += 1;
        continue;
      }

      const drift = (correct.getTime() - stored.getTime()) / 3_600_000;
      console.log(
        `  ✗  TSK-${String(task.seq).padStart(6, '0')}  mail ghi ${parsed.deadline.day}/${parsed.deadline.month}/${parsed.deadline.year} ${String(parsed.deadline.hour).padStart(2, '0')}:${String(parsed.deadline.minute).padStart(2, '0')}\n` +
          `       đang là ${stored.toISOString()} (${format(stored, timeZone)} giờ VN)\n` +
          `       sửa thành ${correct.toISOString()} (${format(correct, timeZone)} giờ VN)  [lệch ${drift}h]`,
      );
      fixes.push({ id: task.id, seq: task.seq, from: stored, to: correct });
    }

    console.log(
      `\nTổng kết: ${fixes.length} cần sửa · ${alreadyCorrect} đã đúng · ${unreadable} không đọc được`,
    );

    if (!apply) {
      console.log('\nChạy lại với --apply để ghi.');
      return;
    }
    if (fixes.length === 0) return;

    await prisma.$transaction(
      fixes.map((fix) =>
        prisma.task.update({
          where: { id: fix.id },
          data: {
            deadline: fix.to,
            // A deadline that moves back into the future deserves its reminder
            // again — the one already sent announced the wrong time.
            deadlineNotifiedAt: fix.to > new Date() ? null : undefined,
          },
        }),
      ),
    );
    console.log(`\nĐã ghi ${fixes.length} dòng.`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
