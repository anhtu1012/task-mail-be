/**
 * Creates the personal board (and its default lists) for every user up front.
 *
 * Without this the board is seeded lazily on each user's first board API call
 * — which also backfills `position` for all their existing tasks. For an
 * account with a few hundred tasks that first request is noticeably slow, and
 * it lands on a real user rather than on a deploy step.
 *
 * Safe to re-run: users who already own a board are skipped.
 *
 *   npm run build && node dist/scripts/backfill-boards.js
 *
 * Pass --dry-run to only report what would be created.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BoardAccessService } from '../modules/board/services/board-access.service';
import { ScriptModule } from './script.module';

const BATCH_SIZE = 50;

async function main(): Promise<void> {
  const logger = new Logger('BackfillBoards');
  const dryRun = process.argv.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const access = app.get(BoardAccessService);

  try {
    const pending = await prisma.user.findMany({
      where: { board: null },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length === 0) {
      logger.log('Mọi người dùng đã có bảng — không cần làm gì.');
      return;
    }

    logger.log(
      `${pending.length} người dùng chưa có bảng${dryRun ? ' (chạy thử, không ghi)' : ''}.`,
    );
    if (dryRun) {
      for (const user of pending) {
        const tasks = await prisma.task.count({
          where: { assigneeId: user.id, boardId: null },
        });
        logger.log(`  ${user.email}: ${tasks} việc sẽ được gán vào bảng mới`);
      }
      return;
    }

    let done = 0;
    let failedCount = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      // Sequential on purpose: each ensureBoard runs a transaction that walks
      // the user's tasks, and firing hundreds at once would exhaust the pool.
      for (const user of batch) {
        try {
          await access.ensureBoard(user.id);
          done += 1;
        } catch (error) {
          failedCount += 1;
          logger.error(
            `Không dựng được bảng cho ${user.email}: ${String(error)}`,
          );
        }
      }
      logger.log(
        `Đã xử lý ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`,
      );
    }

    logger.log(`Xong: ${done} bảng đã tạo, ${failedCount} lỗi.`);
    if (failedCount > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
