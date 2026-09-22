/**
 * Dọn bốn cột mặc định cũ khỏi những bảng đã được tạo trước 22/09/2026.
 *
 * Bối cảnh: `DEFAULT_LISTS` từng gieo sẵn năm cột cho mỗi bảng mới. Nay chỉ còn
 * một cột mẫu "Hôm nay" — nhưng đổi hằng số chỉ có tác dụng với bảng **mới**,
 * mọi bảng đã tồn tại vẫn đang mang đủ năm hàng trong DB. Script này gỡ phần
 * còn lại.
 *
 * LƯU TRỮ, không xoá. Lưu trữ đi qua `BoardListService.update`, tức là dùng
 * đúng đường mà nút "Lưu trữ danh sách" trên giao diện đang dùng: thẻ trong cột
 * được thả về Hộp thư đến chứ không mất, và người dùng mở lại cột được nếu đổi ý.
 *
 * MẶC ĐỊNH AN TOÀN, hai lớp:
 *   1. chỉ chạy thử và in ra những gì sẽ làm — phải thêm `--apply` mới ghi;
 *   2. chỉ đụng vào cột **còn rỗng và chưa bị đổi tên**. Cột đã có việc là dấu
 *      hiệu người dùng đang thật sự dùng nó; script báo cáo rồi bỏ qua, trừ khi
 *      có `--include-non-empty` (lúc đó thẻ sẽ về Hộp thư đến).
 *
 * Cột "Hôm nay" không bao giờ bị đụng tới.
 *
 *   npm run build && node dist/scripts/prune-default-lists.js            # chạy thử
 *   npm run build && node dist/scripts/prune-default-lists.js --apply    # ghi thật
 *
 * Chạy lại nhiều lần vô hại: cột đã lưu trữ thì lần sau không còn trong danh sách.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BoardListService } from '../modules/board/services/board-list.service';
import { ScriptModule } from './script.module';

/**
 * Bốn cột bỏ đi. Khớp theo TÊN vì đó là dấu vết duy nhất còn lại của bộ gieo
 * cũ — không có cột nào trong DB đánh dấu "cái này do hệ thống tạo". Người dùng
 * tự tạo một cột trùng tên thì script vẫn coi là cột mặc định; đây là lý do
 * điều kiện "còn rỗng" ở trên quan trọng, và là lý do mặc định phải chạy thử
 * trước để người vận hành đọc danh sách.
 */
const LEGACY_TITLES = ['Đang làm', 'Tuần này', 'Sau này', 'Hoàn thành'];

async function main(): Promise<void> {
  const logger = new Logger('PruneDefaultLists');
  const apply = process.argv.includes('--apply');
  const includeNonEmpty = process.argv.includes('--include-non-empty');

  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const lists = app.get(BoardListService);

  try {
    const candidates = await prisma.taskList.findMany({
      where: { archived: false, title: { in: LEGACY_TITLES } },
      select: {
        id: true,
        title: true,
        board: {
          select: {
            id: true,
            ownerId: true,
            project: { select: { code: true, name: true } },
            owner: { select: { email: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      logger.log('Không còn cột mặc định cũ nào — không phải làm gì.');
      return;
    }

    const empty = candidates.filter((list) => list._count.tasks === 0);
    const nonEmpty = candidates.filter((list) => list._count.tasks > 0);
    const target = includeNonEmpty ? candidates : empty;

    logger.log(
      `Tìm thấy ${candidates.length} cột mặc định cũ: ${empty.length} rỗng, ${nonEmpty.length} còn việc.`,
    );

    for (const list of nonEmpty) {
      const where = `${list.board.owner.email} / ${list.board.project.code}`;
      logger.warn(
        includeNonEmpty
          ? `SẼ LƯU TRỮ (còn việc): ${where} — "${list.title}", ${list._count.tasks} việc sẽ về Hộp thư đến`
          : `BỎ QUA (còn việc): ${where} — "${list.title}", ${list._count.tasks} việc. Thêm --include-non-empty nếu vẫn muốn dọn.`,
      );
    }

    if (!apply) {
      logger.log(
        `Chạy thử — chưa ghi gì. ${target.length} cột sẽ được lưu trữ. Thêm --apply để thực hiện.`,
      );
      return;
    }

    let done = 0;
    let failed = 0;
    // Tuần tự: mỗi lần lưu trữ là một transaction thả thẻ về Hộp thư đến, bắn
    // hàng trăm cái cùng lúc sẽ cạn pool kết nối.
    for (const list of target) {
      try {
        await lists.update(list.board.ownerId, list.id, { archived: true });
        done += 1;
      } catch (error) {
        failed += 1;
        logger.error(
          `Không lưu trữ được "${list.title}" của ${list.board.owner.email}: ${String(error)}`,
        );
      }
    }

    logger.log(`Xong: ${done} cột đã lưu trữ, ${failed} lỗi.`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
