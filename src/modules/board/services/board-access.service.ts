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
import { ProjectAccessService } from '../../projects/services/project-access.service';

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
    private readonly projectAccess: ProjectAccessService,
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
    return (await this.ensureBoardTracked(userId, projectId)).board;
  }

  /**
   * Như {@link ensureBoard} nhưng nói thêm bảng có **vừa được tạo** hay không.
   *
   * Chỉ `getFull` cần biết: việc gom các task mồ côi vào bảng là một lệnh GHI,
   * và nó chỉ có thể tìm thấy gì đó ngay sau khi bảng ra đời. Chạy nó trên mọi
   * lần tải bảng là trả giá một vòng mạng cho một `UPDATE` cập nhật 0 dòng.
   */
  async ensureBoardTracked(
    userId: string,
    projectId: string,
  ): Promise<{ board: Board; created: boolean }> {
    const existing = await this.boardRepository.findByOwnerAndProject(
      userId,
      projectId,
    );
    if (existing) {
      return { board: existing, created: false };
    }
    return { board: await this.createBoard(userId, projectId), created: true };
  }

  private async createBoard(userId: string, projectId: string): Promise<Board> {
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

  /**
   * Bảng + dự án cho một endpoint bảng, tốn **một** vòng mạng ở trường hợp
   * thường gặp.
   *
   * Cách viết thẳng là `projectAccess.resolveForRead()` rồi `ensureBoard()` —
   * hai truy vấn tuần tự, mà frontend gọi tổ hợp này ở mọi màn hình.
   *
   * Nhưng khi đã có `projectId`, việc tra bảng **tự nó đã là phép kiểm quyền**:
   * tìm thấy một dòng `boards` khớp cả `ownerId` lẫn `projectId` nghĩa là dự án
   * đó tồn tại và thuộc người gọi. Không cần đọc hàng `projects` nữa, và
   * `board.projectId` cho lại chính id ấy.
   *
   * (Cố tình **không** dùng `include: { project: true }`: Prisma không JOIN cho
   * quan hệ như vậy mà bắn thêm một truy vấn riêng, tức là không tiết kiệm được
   * vòng mạng nào.)
   *
   * Hai đường chậm còn lại giữ nguyên ngữ nghĩa cũ: thiếu `projectId` thì phải
   * tra dự án mặc định trước, và bảng chưa có thì phải kiểm dự án rồi mới dựng.
   */
  async resolveBoardForRead(
    userId: string,
    projectId?: string,
  ): Promise<{ board: Board; projectId: string; created: boolean }> {
    if (projectId) {
      const fast = await this.boardRepository.findByOwnerAndProject(
        userId,
        projectId,
      );
      if (fast) {
        return { board: fast, projectId: fast.projectId, created: false };
      }
    }

    const project = await this.projectAccess.resolveForRead(userId, projectId);
    const { board, created } = await this.ensureBoardTracked(
      userId,
      project.id,
    );
    return { board, projectId: project.id, created };
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
