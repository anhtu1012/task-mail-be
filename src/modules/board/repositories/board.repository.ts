import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  Board,
  BoardLabel,
  TaskList,
} from '../../../generated/prisma/client';
import { TaskStatus } from '../../../generated/prisma/enums';

export type CreateListInput = {
  boardId: string;
  title: string;
  position: number;
  mapsToStatus?: TaskStatus | null;
  wipLimit?: number | null;
};

export type UpdateListInput = {
  title?: string;
  wipLimit?: number | null;
  archived?: boolean;
  mapsToStatus?: TaskStatus | null;
  position?: number;
};

@Injectable()
export class BoardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bảng của một người **trong một dự án**. Không còn hàm tra theo riêng
   * `ownerId`: từ khi có dự án, một người có nhiều bảng và "bảng của user X"
   * không còn là một câu hỏi trả lời được.
   */
  findByOwnerAndProject(
    ownerId: string,
    projectId: string,
  ): Promise<Board | null> {
    return this.prisma.board.findUnique({
      where: { ownerId_projectId: { ownerId, projectId } },
    });
  }

  findById(id: string): Promise<Board | null> {
    return this.prisma.board.findUnique({ where: { id } });
  }

  update(
    id: string,
    data: { title?: string; starred?: boolean },
  ): Promise<Board> {
    return this.prisma.board.update({ where: { id }, data });
  }

  /**
   * Creates the board with its default lists and adopts every task the user
   * already owns, in one transaction — a half-seeded board would show the
   * screen with tasks missing.
   */
  async createWithDefaults(
    ownerId: string,
    projectId: string,
    title: string,
    lists: ReadonlyArray<{
      title: string;
      mapsToStatus: TaskStatus | null;
      wipLimit: number | null;
    }>,
    positionGap: number,
  ): Promise<Board> {
    return this.prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: { ownerId, projectId, title },
      });

      await tx.taskList.createMany({
        data: lists.map((list, index) => ({
          boardId: board.id,
          title: list.title,
          position: (index + 1) * positionGap,
          mapsToStatus: list.mapsToStatus,
          wipLimit: list.wipLimit,
        })),
      });

      const created = await tx.taskList.findMany({
        where: { boardId: board.id },
        orderBy: { position: 'asc' },
      });

      // Existing tasks land in the list whose mapsToStatus matches their
      // status; anything unmapped stays in the Inbox (listId = null).
      const byStatus = new Map<TaskStatus, string>();
      for (const list of created) {
        if (list.mapsToStatus && !byStatus.has(list.mapsToStatus)) {
          byStatus.set(list.mapsToStatus, list.id);
        }
      }

      // Chỉ nhận việc **của đúng dự án này**: bảng thuộc dự án, nên vơ hết việc
      // chưa có bảng của người đó sẽ kéo việc dự án khác sang.
      const owned = await tx.task.findMany({
        where: { assigneeId: ownerId, projectId, boardId: null },
        select: { id: true, status: true },
        orderBy: { createdAt: 'asc' },
      });

      const nextPosition = new Map<string, number>();
      for (const task of owned) {
        const listId = byStatus.get(task.status) ?? null;
        const key = listId ?? 'inbox';
        const position = (nextPosition.get(key) ?? 0) + positionGap;
        nextPosition.set(key, position);
        await tx.task.update({
          where: { id: task.id },
          data: { boardId: board.id, listId, position },
        });
      }

      return board;
    });
  }

  /**
   * Safety net for tasks created before the board existed (e.g. mail ingestion).
   * Scoped to the project as well as the owner — a board only ever adopts the
   * cards of its own project.
   */
  async adoptOrphanTasks(
    ownerId: string,
    projectId: string,
    boardId: string,
  ): Promise<number> {
    const result = await this.prisma.task.updateMany({
      where: { assigneeId: ownerId, projectId, boardId: null },
      data: { boardId },
    });
    return result.count;
  }

  findLists(boardId: string): Promise<TaskList[]> {
    return this.prisma.taskList.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });
  }

  findListById(id: string): Promise<TaskList | null> {
    return this.prisma.taskList.findUnique({ where: { id } });
  }

  async lastListPosition(boardId: string): Promise<number> {
    const last = await this.prisma.taskList.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last?.position ?? 0;
  }

  createList(input: CreateListInput): Promise<TaskList> {
    return this.prisma.taskList.create({ data: input });
  }

  updateList(id: string, data: UpdateListInput): Promise<TaskList> {
    return this.prisma.taskList.update({ where: { id }, data });
  }

  /** Archiving sends the cards back to the Inbox — it never deletes them. */
  async archiveListAndReleaseCards(id: string): Promise<TaskList> {
    return this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { listId: id },
        data: { listId: null },
      });
      return tx.taskList.update({
        where: { id },
        data: { archived: true },
      });
    });
  }

  /** Positions of the cards in a list, ascending — used by move and rebalance. */
  cardPositions(
    listId: string | null,
    boardId: string,
  ): Promise<Array<{ id: string; position: number }>> {
    return this.prisma.task.findMany({
      where: { boardId, listId, deletedAt: null },
      select: { id: true, position: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async renumberCards(
    rows: Array<{ id: string; position: number }>,
  ): Promise<void> {
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.task.update({
          where: { id: row.id },
          data: { position: row.position },
        }),
      ),
    );
  }

  countCardsInList(listId: string): Promise<number> {
    return this.prisma.task.count({ where: { listId, deletedAt: null } });
  }

  findLabels(boardId: string): Promise<BoardLabel[]> {
    return this.prisma.boardLabel.findMany({
      where: { boardId },
      orderBy: { name: 'asc' },
    });
  }

  findLabelById(id: string): Promise<BoardLabel | null> {
    return this.prisma.boardLabel.findUnique({ where: { id } });
  }

  countLabelsInBoard(boardId: string, ids: string[]): Promise<number> {
    return this.prisma.boardLabel.count({
      where: { boardId, id: { in: ids } },
    });
  }

  createLabel(input: {
    boardId: string;
    name: string;
    color: string;
    icon?: string | null;
    slug: string;
  }): Promise<BoardLabel> {
    return this.prisma.boardLabel.create({ data: input });
  }

  updateLabel(
    id: string,
    data: {
      name?: string;
      color?: string;
      icon?: string | null;
      slug?: string;
    },
  ): Promise<BoardLabel> {
    return this.prisma.boardLabel.update({ where: { id }, data });
  }

  async deleteLabel(id: string): Promise<void> {
    await this.prisma.boardLabel.delete({ where: { id } });
  }
}
