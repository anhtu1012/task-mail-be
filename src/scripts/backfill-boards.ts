/**
 * Creates the personal board (and its default lists) for every project up front.
 *
 * Without this the board is seeded lazily on each project's first board API
 * call — which also backfills `position` for all the tasks in it. For a project
 * with a few hundred tasks that first request is noticeably slow, and it lands
 * on a real user rather than on a deploy step.
 *
 * Đơn vị là **dự án**, không phải người dùng: từ khi có dự án, một người có một
 * bảng cho mỗi dự án, nên "người dùng chưa có bảng" không còn là câu hỏi đúng.
 *
 * Safe to re-run: projects that already own a board are skipped.
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
    const pending = await prisma.project.findMany({
      where: { boards: { none: {} } },
      select: {
        id: true,
        code: true,
        name: true,
        ownerId: true,
        owner: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length === 0) {
      logger.log('Mọi dự án đã có bảng — không cần làm gì.');
      return;
    }

    logger.log(
      `${pending.length} dự án chưa có bảng${dryRun ? ' (chạy thử, không ghi)' : ''}.`,
    );
    if (dryRun) {
      for (const project of pending) {
        const tasks = await prisma.task.count({
          where: { projectId: project.id, boardId: null },
        });
        logger.log(
          `  ${project.owner.email} / ${project.code}: ${tasks} việc sẽ được gán vào bảng mới`,
        );
      }
      return;
    }

    let done = 0;
    let failedCount = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      // Sequential on purpose: each ensureBoard runs a transaction that walks
      // the project's tasks, and firing hundreds at once would exhaust the pool.
      for (const project of batch) {
        try {
          await access.ensureBoard(project.ownerId, project.id);
          done += 1;
        } catch (error) {
          failedCount += 1;
          logger.error(
            `Không dựng được bảng cho ${project.owner.email} / ${project.code}: ${String(error)}`,
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
