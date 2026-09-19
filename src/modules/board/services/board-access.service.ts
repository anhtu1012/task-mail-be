import { Injectable } from '@nestjs/common';
import type { Board, Task, TaskList } from '../../../generated/prisma/client';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import {
  DEFAULT_BOARD_TITLE,
  DEFAULT_LISTS,
  POSITION_GAP,
} from '../../../common/constants/board.constants';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import { BoardRepository } from '../repositories/board.repository';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { UsersService } from '../../users/users.service';

/**
 * Ownership and lookup helpers shared by every board service.
 *
 * Authorisation here is one sentence: the resource belongs to the caller's
 * board, or it does not exist. Anything else answers 404 rather than 403 — a
 * 403 would confirm that another user's card exists. System-level ADMIN and
 * SUPER_ADMIN get no exemption; the Inbox in particular is the most private
 * part of the app.
 */
@Injectable()
export class BoardAccessService {
  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly cardRepository: BoardCardRepository,
    private readonly usersService: UsersService,
  ) {}

  /**
   * The caller's board **for one project**, seeded with default lists on first
   * access.
   *
   * `projectId` is not optional and deliberately has no default: a board now
   * belongs to a project, so "user X's board" is no longer a question with one
   * answer. Callers that only hold a card id must go through
   * {@link requireCard}, which reads the board off the card itself.
   */
  async ensureBoard(userId: string, projectId: string): Promise<Board> {
    const existing = await this.boardRepository.findByOwnerAndProject(
      userId,
      projectId,
    );
    if (existing) {
      return existing;
    }

    try {
      const board = await this.boardRepository.createWithDefaults(
        userId,
        projectId,
        DEFAULT_BOARD_TITLE,
        DEFAULT_LISTS,
        POSITION_GAP,
      );
      return board;
    } catch {
      // Two parallel first requests race on `@@unique([ownerId, projectId])`;
      // the loser just reads the board the winner created.
      const board = await this.boardRepository.findByOwnerAndProject(
        userId,
        projectId,
      );
      if (!board) {
        throw new NotFoundException(
          'Không tìm thấy bảng',
          ERROR_CODES.BOARD_NOT_FOUND,
        );
      }
      return board;
    }
  }

  /** Board addressed by id — only ever the caller's own. */
  async requireOwnBoard(userId: string, boardId: string): Promise<Board> {
    const board = await this.boardRepository.findById(boardId);
    if (!board || board.ownerId !== userId) {
      throw new NotFoundException(
        'Không tìm thấy bảng',
        ERROR_CODES.BOARD_NOT_FOUND,
      );
    }
    return board;
  }

  async requireList(
    userId: string,
    listId: string,
  ): Promise<{ board: Board; list: TaskList }> {
    const list = await this.boardRepository.findListById(listId);
    if (!list) {
      throw new NotFoundException(
        'Không tìm thấy danh sách',
        ERROR_CODES.LIST_NOT_FOUND,
      );
    }
    const board = await this.requireOwnBoard(userId, list.boardId);
    return { board, list };
  }

  /**
   * A card the caller owns, together with the board it sits on.
   *
   * The board is resolved **from the card**, not from the caller. Before
   * projects existed a user had exactly one board, so this method could fetch
   * that board and compare ids. Now a user has one board per project, and that
   * comparison would 404 every card outside whichever project happened to be
   * picked — taking `move`, `snooze`, `complete`, checklists, notes and
   * attachments down with it. The card's own `projectId` is the only thing that
   * says which board it belongs to.
   *
   * Tasks created before the board existed (mail ingestion, the legacy
   * POST /tasks) carry no `boardId`; those are adopted into the board of their
   * own project on first touch instead of 404-ing.
   */
  async requireCard(
    userId: string,
    cardId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<{ board: Board; card: Task }> {
    const card = options.includeDeleted
      ? await this.cardRepository.findByIdWithDeleted(cardId)
      : await this.cardRepository.findById(cardId);

    if (!card || card.assigneeId !== userId) {
      throw new NotFoundException(
        'Không tìm thấy việc',
        ERROR_CODES.CARD_NOT_FOUND,
      );
    }

    if (card.boardId === null) {
      const board = await this.ensureBoard(userId, card.projectId);
      const adopted = await this.cardRepository.update(card.id, {
        board: { connect: { id: board.id } },
      });
      return { board, card: adopted };
    }

    // Ownership is still checked, just from the other end: the board the card
    // points at has to be one of the caller's.
    const board = await this.requireOwnBoard(userId, card.boardId);
    return { board, card };
  }

  /**
   * `?tz=` wins, then the user profile, then the app default. Cutting the day
   * on the server's UTC clock would drop early-morning tasks for GMT+7 users.
   *
   * Delegates so that the board, mail ingestion and the Zalo reminders all read
   * a user's zone the same way.
   */
  resolveTimezone(userId: string, requested?: string): Promise<string> {
    return this.usersService.resolveTimezone(userId, requested);
  }
}
