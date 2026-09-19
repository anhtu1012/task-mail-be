import { Injectable } from '@nestjs/common';
import type { Board, Task, TaskList } from '../../../generated/prisma/client';
import {
  ActivityAction,
  RepeatUnit,
  TaskStatus,
} from '../../../generated/prisma/enums';
import { POSITION_GAP } from '../../../common/constants/board.constants';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import { RichTextUtil } from '../../../common/utils/rich-text.util';
import { DeadlineUtil } from '../../../common/utils/deadline.util';
import {
  CreateCardDto,
  MoveCardDto,
  SetCardLabelsDto,
  SnoozeCardDto,
} from '../dto/board-request.dto';
import {
  CardDetailDto,
  CardSummaryDto,
  CompleteCardResponseDto,
  MoveCardResponseDto,
} from '../dto/board-response.dto';
import {
  formatTaskCode,
  resolveCardSource,
  toCardSummary,
} from '../mappers/card.mapper';
import { BoardRepository } from '../repositories/board.repository';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { BoardAccessService } from './board-access.service';
import { BoardService } from './board.service';
import { PositionService } from './position.service';
import { ActivityService } from './activity.service';

const CLOSED_STATUSES: TaskStatus[] = [TaskStatus.DONE, TaskStatus.CANCELLED];

@Injectable()
export class BoardCardService {
  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly cardRepository: BoardCardRepository,
    private readonly access: BoardAccessService,
    private readonly boardService: BoardService,
    private readonly positions: PositionService,
    private readonly activity: ActivityService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /**
   * Drag-and-drop lands here, dozens of times a minute, so the response is
   * trimmed to what actually changed and validation stays shallow — a move
   * never touches card content.
   */
  async move(
    userId: string,
    cardId: string,
    dto: MoveCardDto,
    undo = false,
  ): Promise<MoveCardResponseDto> {
    const { board, card } = await this.access.requireCard(userId, cardId);

    const targetListId = dto.listId ?? null;
    let targetList: TaskList | null = null;
    if (targetListId) {
      const found = await this.boardRepository.findListById(targetListId);
      if (!found) {
        throw new NotFoundException(
          'Không tìm thấy danh sách',
          ERROR_CODES.LIST_NOT_FOUND,
        );
      }
      if (found.boardId !== board.id) {
        throw new BusinessException(
          'Không thể chuyển việc sang danh sách của bảng khác',
          ERROR_CODES.CARD_NOT_IN_BOARD,
        );
      }
      targetList = found;
    }

    const { position } = await this.positions.resolveCardPosition(
      board.id,
      targetListId,
      dto.position,
      card.id,
    );

    // "Nhiều cách nhìn, một nguồn dữ liệu": a list that declares mapsToStatus
    // rewrites Task.status, so /kanban, /dashboard and the stats stay correct.
    const nextStatus = targetList?.mapsToStatus ?? card.status;
    const completedAt = this.resolveCompletedAt(card, nextStatus);

    const updated = await this.cardRepository.update(card.id, {
      list: targetListId
        ? { connect: { id: targetListId } }
        : { disconnect: true },
      position,
      status: nextStatus,
      completedAt,
    });

    if (!undo && (card.listId !== targetListId || card.position !== position)) {
      const fromTitle = card.listId
        ? ((await this.boardRepository.findListById(card.listId))?.title ??
          null)
        : null;
      await this.activity.record(
        card.id,
        ActivityAction.CARD_MOVED,
        this.activity.moved(fromTitle, targetList?.title ?? null),
        { fromListId: card.listId, toListId: targetListId },
      );
    }

    const warning = await this.wipWarning(targetList);

    return {
      id: updated.id,
      listId: updated.listId,
      position: updated.position,
      status: updated.status,
      updatedAt: updated.updatedAt,
      ...(warning ? { warning } : {}),
    };
  }

  /**
   * The frontend's quick-add already split the natural-language line into
   * fields (`utils/client/quickParse.ts`), so nothing is parsed here.
   */
  async create(
    userId: string,
    listId: string | null,
    dto: CreateCardDto,
  ): Promise<CardSummaryDto> {
    // Tạo trong một cột thì dự án suy từ bảng chứa cột — đó mới là nguồn đúng,
    // nên `dto.projectId` bị bỏ qua ở nhánh này. Chỉ Hộp thư đến (listId null)
    // mới cần nó, vì Hộp thư đến không thuộc cột nào.
    let list: TaskList | null = null;
    let board: Board;
    if (listId) {
      const found = await this.access.requireList(userId, listId);
      list = found.list;
      board = found.board;
    } else {
      const project = await this.projectAccess.resolveForNewTask(
        userId,
        dto.projectId,
      );
      board = await this.access.ensureBoard(userId, project.id);
    }

    if (dto.labelIds?.length) {
      await this.boardService.assertLabelsInBoard(board.id, dto.labelIds);
    }

    const position =
      dto.position ??
      (await this.cardRepository.lastPositionInList(board.id, listId)) +
        POSITION_GAP;

    const created = await this.cardRepository.create({
      boardId: board.id,
      projectId: board.projectId,
      listId,
      assigneeId: userId,
      creatorId: userId,
      title: dto.title,
      description: RichTextUtil.sanitize(dto.description) ?? null,
      position,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      priority: dto.priority,
      category: dto.category,
      estimateMinutes: dto.estimateMinutes ?? null,
      repeatUnit: dto.repeat?.unit ?? null,
      repeatInterval: dto.repeat?.interval ?? null,
      cover: dto.cover ?? null,
      labelIds: dto.labelIds,
      ...(list?.mapsToStatus ? { status: list.mapsToStatus } : {}),
    });

    await this.activity.record(
      created.id,
      ActivityAction.CARD_CREATED,
      this.activity.created(list?.title ?? null, listId === null),
    );

    return this.summaryOf(created.id);
  }

  async detail(userId: string, cardId: string): Promise<CardDetailDto> {
    await this.access.requireCard(userId, cardId);
    const card = await this.cardRepository.findDetail(cardId);
    if (!card) {
      throw new NotFoundException(
        'Không tìm thấy việc',
        ERROR_CODES.CARD_NOT_FOUND,
      );
    }

    const checklistItems = card.checklists.flatMap((c) => c.items);

    return {
      id: card.id,
      listId: card.listId,
      boardId: card.boardId,
      code: formatTaskCode(card.seq),
      title: card.title,
      position: card.position,
      labelIds: card.labels.map((l) => l.labelId),
      priority: card.priority,
      category: card.category,
      status: card.status,
      deadline: card.deadline,
      deadlineStatus: DeadlineUtil.compute(card),
      completedAt: card.completedAt,
      estimateMinutes: card.estimateMinutes,
      repeat:
        card.repeatUnit && card.repeatInterval
          ? { unit: card.repeatUnit, interval: card.repeatInterval }
          : null,
      source: resolveCardSource(card),
      cover: card.cover,
      hasDescription: !RichTextUtil.isEmpty(card.description),
      attachmentCount: card.attachmentFiles.length,
      noteCount: card.notes.length,
      checklistDone: checklistItems.filter((item) => item.checked).length,
      checklistTotal: checklistItems.length,

      description: card.description,
      note: card.note,
      taskTypeId: card.taskTypeId,
      attachmentLinks: card.attachments,
      checklists: card.checklists.map((checklist) => ({
        id: checklist.id,
        taskId: checklist.taskId,
        title: checklist.title,
        position: checklist.position,
        items: checklist.items.map((item) => ({
          id: item.id,
          checklistId: item.checklistId,
          content: item.content,
          checked: item.checked,
          position: item.position,
          checkedAt: item.checkedAt,
        })),
      })),
      attachments: card.attachmentFiles.map((file) => ({
        id: file.id,
        taskId: file.taskId,
        name: file.name,
        kind: file.kind,
        url: file.url,
        sizeBytes: file.sizeBytes,
        isCover: file.isCover,
        createdAt: file.createdAt,
      })),
      notes: card.notes.map((note) => ({
        id: note.id,
        taskId: note.taskId,
        content: note.content,
        createdAt: note.createdAt,
        editedAt: note.editedAt,
      })),
      activities: card.activities.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        action: entry.action,
        message: entry.message,
        createdAt: entry.createdAt,
      })),
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  /**
   * The most-used action of a personal tool is not "done", it is "not today,
   * tomorrow". The frontend has already computed the target instant.
   */
  async snooze(
    userId: string,
    cardId: string,
    dto: SnoozeCardDto,
    tz?: string,
    undo = false,
  ): Promise<CardSummaryDto> {
    const { card } = await this.access.requireCard(userId, cardId);
    const deadline = dto.deadline ? new Date(dto.deadline) : null;

    await this.cardRepository.update(card.id, {
      deadline,
      // A fresh deadline resets the reminder, otherwise the Zalo cron would
      // consider this task already notified forever.
      deadlineNotifiedAt: null,
    });

    if (!undo) {
      const timeZone = await this.access.resolveTimezone(userId, tz);
      await this.activity.record(
        card.id,
        ActivityAction.SNOOZED,
        this.activity.snoozed(deadline, timeZone),
        { from: card.deadline, to: deadline },
      );
    }

    return this.summaryOf(card.id);
  }

  /**
   * Completing a repeating card spawns the next occurrence right away, so the
   * user sees it without waiting for a nightly job, and the response carries it
   * so the board can insert it without a reload.
   */
  async complete(
    userId: string,
    cardId: string,
    undo = false,
  ): Promise<CompleteCardResponseDto> {
    const { board, card } = await this.access.requireCard(userId, cardId);
    const now = new Date();

    const doneList = (await this.boardRepository.findLists(board.id)).find(
      (list) => list.mapsToStatus === TaskStatus.DONE && !list.archived,
    );

    await this.cardRepository.update(card.id, {
      status: TaskStatus.DONE,
      completedAt: now,
      ...(doneList && card.listId !== doneList.id
        ? { list: { connect: { id: doneList.id } } }
        : {}),
    });

    if (undo) {
      // Replaying a completion the user had undone: the repeat card spawned by
      // the original completion still exists, so spawning another would leave
      // two copies of the next occurrence behind.
      return { completed: await this.summaryOf(card.id), next: null };
    }

    await this.activity.record(
      card.id,
      ActivityAction.CARD_COMPLETED,
      'Đánh dấu hoàn thành',
    );

    const next = await this.spawnRepeat(card, now);
    return {
      completed: await this.summaryOf(card.id),
      next: next ? await this.summaryOf(next.id) : null,
    };
  }

  async reopen(
    userId: string,
    cardId: string,
    undo = false,
  ): Promise<CardSummaryDto> {
    const { card } = await this.access.requireCard(userId, cardId);
    await this.cardRepository.update(card.id, {
      status: TaskStatus.TODO,
      completedAt: null,
    });
    if (!undo) {
      await this.activity.record(
        card.id,
        ActivityAction.CARD_REOPENED,
        'Mở lại việc',
      );
    }
    return this.summaryOf(card.id);
  }

  /**
   * Soft delete, so the frontend's 50-step undo can bring the card back with
   * its checklists and notes. A hard delete would make Ctrl+Z a lie.
   */
  async remove(userId: string, cardId: string): Promise<void> {
    const { card } = await this.access.requireCard(userId, cardId);
    await this.cardRepository.update(card.id, { deletedAt: new Date() });
  }

  async restore(userId: string, cardId: string): Promise<CardSummaryDto> {
    const { card } = await this.access.requireCard(userId, cardId, {
      includeDeleted: true,
    });
    await this.cardRepository.update(card.id, { deletedAt: null });
    return this.summaryOf(card.id);
  }

  async setLabels(
    userId: string,
    cardId: string,
    dto: SetCardLabelsDto,
  ): Promise<CardSummaryDto> {
    const { board, card } = await this.access.requireCard(userId, cardId);
    await this.boardService.assertLabelsInBoard(board.id, dto.labelIds);
    await this.cardRepository.setLabels(card.id, [...new Set(dto.labelIds)]);
    return this.summaryOf(card.id);
  }

  async addLabel(
    userId: string,
    cardId: string,
    labelId: string,
  ): Promise<CardSummaryDto> {
    const { board, card } = await this.access.requireCard(userId, cardId);
    await this.boardService.assertLabelsInBoard(board.id, [labelId]);
    await this.cardRepository.addLabel(card.id, labelId);
    return this.summaryOf(card.id);
  }

  async removeLabel(
    userId: string,
    cardId: string,
    labelId: string,
  ): Promise<CardSummaryDto> {
    const { card } = await this.access.requireCard(userId, cardId);
    await this.cardRepository.removeLabel(card.id, labelId);
    return this.summaryOf(card.id);
  }

  /** Re-reads the summary projection so every write path answers one shape. */
  async summaryOf(cardId: string): Promise<CardSummaryDto> {
    const [row] = await this.cardRepository.cardsByIds([cardId]);
    if (!row) {
      throw new NotFoundException(
        'Không tìm thấy việc',
        ERROR_CODES.CARD_NOT_FOUND,
      );
    }
    return toCardSummary(row);
  }

  private resolveCompletedAt(
    card: Task,
    nextStatus: TaskStatus,
  ): Date | null | undefined {
    if (nextStatus === TaskStatus.DONE && !card.completedAt) return new Date();
    if (nextStatus !== TaskStatus.DONE && card.completedAt) return null;
    return undefined;
  }

  private async spawnRepeat(card: Task, completedAt: Date) {
    if (!card.repeatUnit || !card.repeatInterval) return null;

    const base = card.deadline ?? completedAt;
    const deadline = this.addInterval(
      base,
      card.repeatUnit,
      card.repeatInterval,
    );

    const position =
      (await this.cardRepository.lastPositionInList(
        card.boardId as string,
        card.listId,
      )) + POSITION_GAP;

    const next = await this.cardRepository.create({
      boardId: card.boardId as string,
      // Lần lặp kế tiếp ở lại đúng dự án của việc gốc — nó là cùng một việc,
      // chỉ khác ngày.
      projectId: card.projectId,
      listId: card.listId,
      assigneeId: card.assigneeId,
      creatorId: card.creatorId ?? card.assigneeId,
      title: card.title,
      description: card.description,
      position,
      deadline,
      priority: card.priority,
      category: card.category,
      estimateMinutes: card.estimateMinutes,
      repeatUnit: card.repeatUnit,
      repeatInterval: card.repeatInterval,
      cover: card.cover,
    });

    // Labels carry over; the repeat is the same work, not a new kind of work.
    const labels = await this.cardRepository.cardsByIds([card.id]);
    if (labels[0]?.label_ids.length) {
      await this.cardRepository.setLabels(next.id, labels[0].label_ids);
    }

    await this.activity.record(
      next.id,
      ActivityAction.CARD_CREATED,
      `Sinh tự động từ việc lặp ${formatTaskCode(card.seq)}`,
    );
    return next;
  }

  private addInterval(base: Date, unit: RepeatUnit, interval: number): Date {
    const next = new Date(base.getTime());
    if (unit === RepeatUnit.DAY) next.setUTCDate(next.getUTCDate() + interval);
    if (unit === RepeatUnit.WEEK)
      next.setUTCDate(next.getUTCDate() + interval * 7);
    if (unit === RepeatUnit.MONTH)
      next.setUTCMonth(next.getUTCMonth() + interval);
    return next;
  }

  /** WIP is advisory: it warns on a 200, it never blocks the drop. */
  private async wipWarning(list: TaskList | null): Promise<string | undefined> {
    if (!list?.wipLimit) return undefined;
    const count = await this.boardRepository.countCardsInList(list.id);
    return count > list.wipLimit ? ERROR_CODES.LIST_WIP_EXCEEDED : undefined;
  }

  /** Statuses that mean "no longer in play", shared with the metric queries. */
  static get closedStatuses(): TaskStatus[] {
    return CLOSED_STATUSES;
  }
}
