import { Injectable } from '@nestjs/common';
import {
  DEFAULT_CARDS_PER_LIST,
  MAX_CARDS_PER_LIST,
  POSITION_GAP,
} from '../../../common/constants/board.constants';
import {
  CreateListDto,
  ListCardsQueryDto,
  MoveListDto,
  UpdateListDto,
} from '../dto/board-request.dto';
import {
  CardPageDto,
  PositionDto,
  TaskListDto,
} from '../dto/board-response.dto';
import { toCardSummary, toListDto } from '../mappers/card.mapper';
import { BoardRepository } from '../repositories/board.repository';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { BoardAccessService } from './board-access.service';
import { PositionService } from './position.service';

@Injectable()
export class BoardListService {
  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly cardRepository: BoardCardRepository,
    private readonly access: BoardAccessService,
    private readonly positions: PositionService,
  ) {}

  async create(
    userId: string,
    boardId: string,
    dto: CreateListDto,
  ): Promise<TaskListDto> {
    await this.access.requireOwnBoard(userId, boardId);
    const position =
      dto.position ??
      (await this.boardRepository.lastListPosition(boardId)) + POSITION_GAP;

    const list = await this.boardRepository.createList({
      boardId,
      title: dto.title,
      position,
      mapsToStatus: dto.mapsToStatus ?? null,
      wipLimit: dto.wipLimit ?? null,
    });
    return toListDto(list);
  }

  async update(
    userId: string,
    listId: string,
    dto: UpdateListDto,
  ): Promise<TaskListDto> {
    const { list } = await this.access.requireList(userId, listId);

    // Archiving is not a delete: the cards go back to the Inbox so nothing is
    // ever lost behind a column the user hid.
    if (dto.archived === true && !list.archived) {
      const archived = await this.boardRepository.archiveListAndReleaseCards(
        list.id,
      );
      const rest = await this.boardRepository.updateList(list.id, {
        title: dto.title,
        wipLimit: dto.wipLimit,
        mapsToStatus: dto.mapsToStatus,
      });
      return toListDto({ ...archived, ...rest });
    }

    const updated = await this.boardRepository.updateList(list.id, {
      title: dto.title,
      wipLimit: dto.wipLimit,
      archived: dto.archived,
      mapsToStatus: dto.mapsToStatus,
    });
    return toListDto(updated);
  }

  async move(
    userId: string,
    listId: string,
    dto: MoveListDto,
  ): Promise<TaskListDto> {
    const { board, list } = await this.access.requireList(userId, listId);
    const position = await this.positions.resolveListPosition(
      board.id,
      dto.position,
      list.id,
    );
    const updated = await this.boardRepository.updateList(list.id, {
      position,
    });
    return toListDto(updated);
  }

  /** Renumbers the column in multiples of 1024 once the float gaps collapse. */
  async rebalance(userId: string, listId: string): Promise<PositionDto[]> {
    const { board, list } = await this.access.requireList(userId, listId);
    return this.positions.rebalanceCards(board.id, list.id);
  }

  /** Inbox counterpart of {@link rebalance} — the Inbox has no list row. */
  async rebalanceInbox(
    userId: string,
    projectId?: string,
  ): Promise<PositionDto[]> {
    const { board } = await this.access.resolveBoardForRead(userId, projectId);
    return this.positions.rebalanceCards(board.id, null);
  }

  /**
   * One page of a column. The cursor is the last `position` returned, not a
   * page number: cards get reordered constantly, and an offset would skip or
   * repeat rows the moment anything moved.
   */
  async cards(
    userId: string,
    listId: string,
    query: ListCardsQueryDto,
  ): Promise<CardPageDto> {
    const { board, list } = await this.access.requireList(userId, listId);
    return this.pageOf(board.id, list.id, query);
  }

  async inboxCards(
    userId: string,
    query: ListCardsQueryDto,
  ): Promise<CardPageDto> {
    const { board } = await this.access.resolveBoardForRead(
      userId,
      query.projectId,
    );
    return this.pageOf(board.id, null, query);
  }

  private async pageOf(
    boardId: string,
    listId: string | null,
    query: ListCardsQueryDto,
  ): Promise<CardPageDto> {
    const limit = Math.min(
      query.limit ?? DEFAULT_CARDS_PER_LIST,
      MAX_CARDS_PER_LIST,
    );
    const [rows, counts] = await Promise.all([
      this.cardRepository.pageOfList(boardId, listId, query.cursor, limit),
      this.cardRepository.countCardsPerList(boardId),
    ]);

    return {
      items: rows.map(toCardSummary),
      nextCursor: rows.length === limit ? rows[rows.length - 1].position : null,
      total: counts[listId ?? 'inbox'] ?? 0,
    };
  }
}
