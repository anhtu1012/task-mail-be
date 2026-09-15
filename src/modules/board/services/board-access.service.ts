import { Injectable } from '@nestjs/common';
import type { Board, Task, TaskList } from '../../../generated/prisma/client';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import {
  DEFAULT_BOARD_TITLE,
  DEFAULT_LISTS,
  DEFAULT_TIMEZONE,
  POSITION_GAP,
} from '../../../common/constants/board.constants';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import { TimezoneUtil } from '../../../common/utils/timezone.util';
import { BoardRepository } from '../repositories/board.repository';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

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
    private readonly prisma: PrismaService,
  ) {}

  /** The caller's board, seeded with default lists on first access. */
  async ensureBoard(userId: string): Promise<Board> {
    const existing = await this.boardRepository.findByOwner(userId);
    if (existing) {
      return existing;
    }

    try {
      const board = await this.boardRepository.createWithDefaults(
        userId,
        DEFAULT_BOARD_TITLE,
        DEFAULT_LISTS,
        POSITION_GAP,
      );
      return board;
    } catch {
      // Two parallel first requests race on `ownerId @unique`; the loser just
      // reads the board the winner created.
      const board = await this.boardRepository.findByOwner(userId);
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
   * A card the caller owns. Tasks created before the board existed (mail
   * ingestion, the legacy POST /tasks) carry no `boardId`; those are adopted
   * into the owner's board on first touch instead of 404-ing.
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

    const board = await this.ensureBoard(userId);
    if (card.boardId === null) {
      const adopted = await this.cardRepository.update(card.id, {
        board: { connect: { id: board.id } },
      });
      return { board, card: adopted };
    }
    if (card.boardId !== board.id) {
      throw new NotFoundException(
        'Không tìm thấy việc',
        ERROR_CODES.CARD_NOT_FOUND,
      );
    }
    return { board, card };
  }

  /**
   * `?tz=` wins, then the user profile, then the app default. Cutting the day
   * on the server's UTC clock would drop early-morning tasks for GMT+7 users.
   */
  async resolveTimezone(userId: string, requested?: string): Promise<string> {
    if (requested && TimezoneUtil.isValid(requested)) return requested;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    if (user?.timezone && TimezoneUtil.isValid(user.timezone)) {
      return user.timezone;
    }
    return DEFAULT_TIMEZONE;
  }
}
