import { DeadlineUtil } from '../../../common/utils/deadline.util';
import { RichTextUtil } from '../../../common/utils/rich-text.util';
import type { CardSummaryRow } from '../repositories/board-card.repository';
import {
  CardSource,
  CardSummaryDto,
  BoardDto,
  BoardLabelDto,
  TaskListDto,
} from '../dto/board-response.dto';
import type {
  Board,
  BoardLabel,
  TaskList,
} from '../../../generated/prisma/client';

export const formatTaskCode = (seq: number): string =>
  `TSK-${String(seq).padStart(6, '0')}`;

/** Inferred from data we already store — there is no `source` column. */
export const resolveCardSource = (input: {
  sourceMailAccountId: string | null;
  externalRef: string | null;
}): CardSource => {
  if (input.sourceMailAccountId) return 'EMAIL';
  if (input.externalRef?.startsWith('zalo:')) return 'ZALO';
  return 'MANUAL';
};

export const toCardSummary = (row: CardSummaryRow): CardSummaryDto => ({
  id: row.id,
  listId: row.list_id,
  boardId: row.board_id,
  code: formatTaskCode(row.seq),
  title: row.title,
  position: row.position,
  labelIds: row.label_ids ?? [],
  priority: row.priority,
  category: row.category,
  status: row.status,
  deadline: row.deadline,
  deadlineStatus: DeadlineUtil.compute({
    status: row.status,
    deadline: row.deadline,
    completedAt: row.completed_at,
  }),
  completedAt: row.completed_at,
  estimateMinutes: row.estimate_minutes,
  repeat:
    row.repeat_unit && row.repeat_interval
      ? { unit: row.repeat_unit, interval: row.repeat_interval }
      : null,
  source: resolveCardSource({
    sourceMailAccountId: row.source_mail_account_id,
    externalRef: row.external_ref,
  }),
  cover: row.cover,
  hasDescription: row.has_description,
  attachmentCount: row.attachment_count,
  noteCount: row.note_count,
  checklistDone: row.checklist_done,
  checklistTotal: row.checklist_total,
});

/**
 * Same shape as {@link toCardSummary} but built from a Prisma row — used on the
 * write paths, where we already hold the freshly updated entity and a second
 * round-trip for the projection would be wasteful.
 */
export const toCardSummaryFromEntity = (
  task: {
    id: string;
    listId: string | null;
    boardId: string | null;
    seq: number;
    title: string;
    position: number;
    priority: string;
    category: string;
    status: string;
    deadline: Date | null;
    completedAt: Date | null;
    estimateMinutes: number | null;
    repeatUnit: string | null;
    repeatInterval: number | null;
    cover: string | null;
    description: string | null;
    sourceMailAccountId: string | null;
    externalRef: string | null;
  },
  counts: {
    labelIds: string[];
    attachmentCount: number;
    noteCount: number;
    checklistDone: number;
    checklistTotal: number;
  },
): CardSummaryDto =>
  ({
    id: task.id,
    listId: task.listId,
    boardId: task.boardId,
    code: formatTaskCode(task.seq),
    title: task.title,
    position: task.position,
    labelIds: counts.labelIds,
    priority: task.priority,
    category: task.category,
    status: task.status,
    deadline: task.deadline,
    deadlineStatus: DeadlineUtil.compute({
      status: task.status,
      deadline: task.deadline,
      completedAt: task.completedAt,
    }),
    completedAt: task.completedAt,
    estimateMinutes: task.estimateMinutes,
    repeat:
      task.repeatUnit && task.repeatInterval
        ? { unit: task.repeatUnit, interval: task.repeatInterval }
        : null,
    source: resolveCardSource(task),
    cover: task.cover,
    hasDescription: !RichTextUtil.isEmpty(task.description),
    attachmentCount: counts.attachmentCount,
    noteCount: counts.noteCount,
    checklistDone: counts.checklistDone,
    checklistTotal: counts.checklistTotal,
  }) as CardSummaryDto;

export const toBoardDto = (board: Board): BoardDto => ({
  id: board.id,
  title: board.title,
  starred: board.starred,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
});

export const toListDto = (list: TaskList): TaskListDto => ({
  id: list.id,
  boardId: list.boardId,
  title: list.title,
  position: list.position,
  archived: list.archived,
  wipLimit: list.wipLimit,
  mapsToStatus: list.mapsToStatus,
  createdAt: list.createdAt,
});

export const toLabelDto = (label: BoardLabel): BoardLabelDto => ({
  id: label.id,
  boardId: label.boardId,
  name: label.name,
  color: label.color,
  slug: label.slug,
});
