import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { Task } from '../../../generated/prisma/client';
import {
  RepeatUnit,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '../../../generated/prisma/enums';

/** One row of the summary projection — snake_case, straight from Postgres. */
export type CardSummaryRow = {
  id: string;
  list_id: string | null;
  board_id: string | null;
  seq: number;
  title: string;
  position: number;
  priority: TaskPriority;
  category: TaskCategory;
  status: TaskStatus;
  deadline: Date | null;
  completed_at: Date | null;
  estimate_minutes: number | null;
  repeat_unit: RepeatUnit | null;
  repeat_interval: number | null;
  cover: string | null;
  source_mail_account_id: string | null;
  external_ref: string | null;
  has_description: boolean;
  attachment_count: number;
  note_count: number;
  checklist_total: number;
  checklist_done: number;
  label_ids: string[];
};

export type TodayMetricsRow = {
  overdue: number;
  due_today: number;
  done_today: number;
  planned_minutes: number;
};

/**
 * Everything the board screen needs about a card except its description body.
 *
 * The derived columns are computed in SQL on purpose: pulling `description`
 * into Node just to answer "does this card have one" would drag every pasted
 * screenshot (`data:` URIs) across the wire on the very endpoint that has to
 * stay under 400 ms.
 */
const CARD_COLUMNS = Prisma.sql`
  t.id, t.list_id, t.board_id, t.seq, t.title, t.position, t.priority,
  t.category, t.status, t.deadline, t.completed_at, t.estimate_minutes,
  t.repeat_unit, t.repeat_interval, t.cover, t.source_mail_account_id,
  t.external_ref,
  (
    t.description IS NOT NULL AND (
      t.description ~* '<(img|iframe)'
      -- chr(160) is a non-breaking space: sanitize-html decodes "&nbsp;" to the
      -- real U+00A0 character, and btrim() only strips ASCII blanks, so without
      -- this an empty Quill paragraph would count as a description.
      OR btrim(
        replace(
          replace(
            regexp_replace(t.description, '<[^>]*>', ' ', 'g'),
            '&nbsp;', ' '
          ),
          chr(160), ' '
        )
      ) <> ''
    )
  ) AS has_description,
  (SELECT count(*) FROM task_attachments a WHERE a.task_id = t.id)::int
    AS attachment_count,
  (SELECT count(*) FROM task_notes n WHERE n.task_id = t.id)::int
    AS note_count,
  (
    SELECT count(*) FROM checklist_items ci
    JOIN checklists c ON c.id = ci.checklist_id
    WHERE c.task_id = t.id
  )::int AS checklist_total,
  (
    SELECT count(*) FROM checklist_items ci
    JOIN checklists c ON c.id = ci.checklist_id
    WHERE c.task_id = t.id AND ci.checked
  )::int AS checklist_done,
  COALESCE(
    (SELECT array_agg(tl.label_id) FROM task_labels tl WHERE tl.task_id = t.id),
    ARRAY[]::text[]
  ) AS label_ids
`;

/** Plain text of the description, for accent-insensitive search. */
const DESCRIPTION_TEXT = Prisma.sql`
  regexp_replace(COALESCE(t.description, ''), '<[^>]*>', ' ', 'g')
`;

export type CreateCardInput = {
  boardId: string;
  /** Luôn là `projectId` của bảng — hai trường này không được rời nhau. */
  projectId: string;
  listId: string | null;
  assigneeId: string;
  creatorId: string;
  title: string;
  description?: string | null;
  position: number;
  deadline?: Date | null;
  priority?: TaskPriority;
  category?: TaskCategory;
  /** Set when the target list declares a `mapsToStatus`. */
  status?: TaskStatus;
  estimateMinutes?: number | null;
  repeatUnit?: RepeatUnit | null;
  repeatInterval?: number | null;
  cover?: string | null;
  labelIds?: string[];
};

@Injectable()
export class BoardCardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * First `cardsPerList` cards of every column (Inbox included) in one query.
   * `row_number()` partitions on `list_id`, and NULL forms its own partition —
   * which is exactly the Inbox.
   */
  topCardsPerList(
    boardId: string,
    cardsPerList: number,
  ): Promise<CardSummaryRow[]> {
    return this.prisma.$queryRaw<CardSummaryRow[]>`
      WITH ranked AS (
        SELECT t.id,
               row_number() OVER (
                 PARTITION BY t.list_id
                 ORDER BY t.position ASC, t.created_at ASC
               ) AS rn
        FROM tasks t
        WHERE t.board_id = ${boardId} AND t.deleted_at IS NULL
      )
      SELECT ${CARD_COLUMNS}
      FROM tasks t
      JOIN ranked r ON r.id = t.id
      WHERE r.rn <= ${cardsPerList}
      ORDER BY t.list_id NULLS FIRST, t.position ASC, t.created_at ASC
    `;
  }

  /** Real totals per column, so the UI can show "20 / 42". */
  async countCardsPerList(boardId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ key: string; total: number }>
    >`
      SELECT COALESCE(t.list_id, 'inbox') AS key, count(*)::int AS total
      FROM tasks t
      WHERE t.board_id = ${boardId} AND t.deleted_at IS NULL
      GROUP BY t.list_id
    `;
    return Object.fromEntries(rows.map((row) => [row.key, row.total]));
  }

  /** One page of a single column, keyed on the last `position` seen. */
  pageOfList(
    boardId: string,
    listId: string | null,
    cursor: number | undefined,
    limit: number,
  ): Promise<CardSummaryRow[]> {
    const listFilter =
      listId === null
        ? Prisma.sql`t.list_id IS NULL`
        : Prisma.sql`t.list_id = ${listId}`;
    const cursorFilter =
      cursor === undefined
        ? Prisma.empty
        : Prisma.sql`AND t.position > ${cursor}`;

    return this.prisma.$queryRaw<CardSummaryRow[]>`
      SELECT ${CARD_COLUMNS}
      FROM tasks t
      WHERE t.board_id = ${boardId}
        AND t.deleted_at IS NULL
        AND ${listFilter}
        ${cursorFilter}
      ORDER BY t.position ASC, t.created_at ASC
      LIMIT ${limit}
    `;
  }

  /**
   * Metrics for the toolbar. `overdue` and `dueToday` overlap on purpose: a
   * task due at 06:00 today is both past due and due today (spec 4.5).
   */
  async todayMetrics(
    boardId: string,
    dayStart: Date,
    dayEnd: Date,
    now: Date,
  ): Promise<TodayMetricsRow> {
    const [row] = await this.prisma.$queryRaw<TodayMetricsRow[]>`
      SELECT
        count(*) FILTER (
          WHERE t.completed_at IS NULL
            AND t.status NOT IN ('DONE', 'CANCELLED')
            AND t.deadline IS NOT NULL
            AND t.deadline < ${now}
        )::int AS overdue,
        count(*) FILTER (
          WHERE t.completed_at IS NULL
            AND t.status NOT IN ('DONE', 'CANCELLED')
            AND t.deadline >= ${dayStart}
            AND t.deadline < ${dayEnd}
        )::int AS due_today,
        count(*) FILTER (
          WHERE t.completed_at >= ${dayStart} AND t.completed_at < ${dayEnd}
        )::int AS done_today,
        COALESCE(sum(t.estimate_minutes) FILTER (
          WHERE t.completed_at IS NULL
            AND t.status NOT IN ('DONE', 'CANCELLED')
            AND t.deadline >= ${dayStart}
            AND t.deadline < ${dayEnd}
        ), 0)::int AS planned_minutes
      FROM tasks t
      WHERE t.board_id = ${boardId} AND t.deleted_at IS NULL
    `;
    return (
      row ?? { overdue: 0, due_today: 0, done_today: 0, planned_minutes: 0 }
    );
  }

  /** Every unfinished card already past its deadline — never paginated. */
  overdueCards(boardId: string, now: Date): Promise<CardSummaryRow[]> {
    return this.prisma.$queryRaw<CardSummaryRow[]>`
      SELECT ${CARD_COLUMNS}
      FROM tasks t
      WHERE t.board_id = ${boardId}
        AND t.deleted_at IS NULL
        AND t.completed_at IS NULL
        AND t.status NOT IN ('DONE', 'CANCELLED')
        AND t.deadline IS NOT NULL
        AND t.deadline < ${now}
      ORDER BY t.deadline ASC
    `;
  }

  /** Still-upcoming cards inside the local day — overdue ones are excluded. */
  dueTodayCards(
    boardId: string,
    from: Date,
    dayEnd: Date,
  ): Promise<CardSummaryRow[]> {
    return this.prisma.$queryRaw<CardSummaryRow[]>`
      SELECT ${CARD_COLUMNS}
      FROM tasks t
      WHERE t.board_id = ${boardId}
        AND t.deleted_at IS NULL
        AND t.completed_at IS NULL
        AND t.status NOT IN ('DONE', 'CANCELLED')
        AND t.deadline >= ${from}
        AND t.deadline < ${dayEnd}
      ORDER BY t.deadline ASC
    `;
  }

  /**
   * Accent-insensitive search over code, title and the de-tagged description,
   * ranked code > title > description, unfinished first.
   */
  searchCards(
    boardId: string,
    term: string,
    limit: number,
  ): Promise<CardSummaryRow[]> {
    const pattern = `%${term}%`;
    return this.prisma.$queryRaw<CardSummaryRow[]>`
      SELECT ${CARD_COLUMNS},
        CASE
          WHEN unaccent('TSK-' || lpad(t.seq::text, 6, '0'))
               ILIKE unaccent(${pattern}) THEN 0
          WHEN unaccent(t.title) ILIKE unaccent(${pattern}) THEN 1
          ELSE 2
        END AS match_rank
      FROM tasks t
      WHERE t.board_id = ${boardId}
        AND t.deleted_at IS NULL
        AND (
          unaccent('TSK-' || lpad(t.seq::text, 6, '0')) ILIKE unaccent(${pattern})
          OR unaccent(t.title) ILIKE unaccent(${pattern})
          OR unaccent(${DESCRIPTION_TEXT}) ILIKE unaccent(${pattern})
        )
      ORDER BY match_rank ASC,
               (t.completed_at IS NOT NULL) ASC,
               t.deadline ASC NULLS LAST,
               t.created_at DESC
      LIMIT ${limit}
    `;
  }

  async countSearchMatches(boardId: string, term: string): Promise<number> {
    const pattern = `%${term}%`;
    const [row] = await this.prisma.$queryRaw<Array<{ total: number }>>`
      SELECT count(*)::int AS total
      FROM tasks t
      WHERE t.board_id = ${boardId}
        AND t.deleted_at IS NULL
        AND (
          unaccent('TSK-' || lpad(t.seq::text, 6, '0')) ILIKE unaccent(${pattern})
          OR unaccent(t.title) ILIKE unaccent(${pattern})
          OR unaccent(${DESCRIPTION_TEXT}) ILIKE unaccent(${pattern})
        )
    `;
    return row?.total ?? 0;
  }

  /** Summary projection for a known set of ids, in the given order. */
  async cardsByIds(ids: string[]): Promise<CardSummaryRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<CardSummaryRow[]>`
      SELECT ${CARD_COLUMNS}
      FROM tasks t
      WHERE t.id IN (${Prisma.join(ids)})
    `;
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is CardSummaryRow => row !== undefined);
  }

  findById(id: string): Promise<Task | null> {
    return this.prisma.task.findFirst({ where: { id, deletedAt: null } });
  }

  /** Includes soft-deleted rows, so restore can find them. */
  findByIdWithDeleted(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  findDetail(id: string) {
    return this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        labels: { select: { labelId: true } },
        checklists: {
          orderBy: { position: 'asc' },
          include: { items: { orderBy: { position: 'asc' } } },
        },
        attachmentFiles: { orderBy: { createdAt: 'asc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
  }

  async create(input: CreateCardInput): Promise<Task> {
    const { labelIds, ...data } = input;
    return this.prisma.task.create({
      data: {
        ...data,
        assignedAt: new Date(),
        labels: labelIds?.length
          ? { create: labelIds.map((labelId) => ({ labelId })) }
          : undefined,
      },
    });
  }

  update(id: string, data: Prisma.TaskUpdateInput): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data });
  }

  async lastPositionInList(
    boardId: string,
    listId: string | null,
  ): Promise<number> {
    const last = await this.prisma.task.findFirst({
      where: { boardId, listId, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last?.position ?? 0;
  }

  /** Cards already parked on or after `position` in the target column. */
  neighboursAt(
    boardId: string,
    listId: string | null,
    position: number,
    excludeId: string,
  ): Promise<Array<{ id: string; position: number }>> {
    return this.prisma.task.findMany({
      where: {
        boardId,
        listId,
        deletedAt: null,
        id: { not: excludeId },
        position: { gte: position },
      },
      select: { id: true, position: true },
      orderBy: { position: 'asc' },
      take: 2,
    });
  }

  async setLabels(taskId: string, labelIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.taskLabel.deleteMany({ where: { taskId } }),
      this.prisma.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId, labelId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async addLabel(taskId: string, labelId: string): Promise<void> {
    await this.prisma.taskLabel.createMany({
      data: [{ taskId, labelId }],
      skipDuplicates: true,
    });
  }

  async removeLabel(taskId: string, labelId: string): Promise<void> {
    await this.prisma.taskLabel.deleteMany({ where: { taskId, labelId } });
  }
}
