import { Injectable, Logger } from '@nestjs/common';
import {
  MIN_POSITION_GAP,
  POSITION_GAP,
} from '../../../common/constants/board.constants';
import { BoardRepository } from '../repositories/board.repository';
import { BoardCardRepository } from '../repositories/board-card.repository';

/**
 * Sparse float ordering.
 *
 * Dropping a card between two neighbours writes the average of their
 * positions, so a reorder costs exactly one UPDATE instead of renumbering the
 * column. Float64 runs out of room after ~50 inserts into the same slot, at
 * which point the column is renumbered in multiples of 1024.
 */
@Injectable()
export class PositionService {
  private readonly logger = new Logger(PositionService.name);

  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly cardRepository: BoardCardRepository,
  ) {}

  /**
   * The position the card will actually get.
   *
   * A requested slot that is already taken is nudged to the nearest free value
   * rather than rejected with a 409: during a drag, self-correcting reads far
   * better than asking the user to try again — and undo replays a move with
   * the original coordinates, which must not fail either.
   */
  async resolveCardPosition(
    boardId: string,
    listId: string | null,
    requested: number,
    cardId: string,
  ): Promise<{ position: number; rebalanced: boolean }> {
    const neighbours = await this.cardRepository.neighboursAt(
      boardId,
      listId,
      requested,
      cardId,
    );

    const occupant = neighbours[0];
    if (!occupant || occupant.position !== requested) {
      return { position: requested, rebalanced: false };
    }

    const next = neighbours[1];
    if (!next) {
      return { position: requested + POSITION_GAP, rebalanced: false };
    }

    const midpoint = (occupant.position + next.position) / 2;
    if (
      midpoint - occupant.position >= MIN_POSITION_GAP &&
      next.position - midpoint >= MIN_POSITION_GAP
    ) {
      return { position: midpoint, rebalanced: false };
    }

    // The gap has collapsed: renumber the column, then re-derive the slot from
    // the card that used to sit at the requested position.
    //
    // This line is the signal for whether the scheduled rebalance job from spec
    // 2.1 is worth building: if it shows up regularly in production logs, the
    // inline fix-up is no longer rare enough to rely on.
    this.logger.warn(
      `Khoảng cách position đã cạn ở cột ${listId ?? 'inbox'} (bảng ${boardId}) — đánh số lại cả cột`,
    );
    const renumbered = await this.rebalanceCards(boardId, listId);
    const index = renumbered.findIndex((row) => row.id === occupant.id);
    const before = index > 0 ? renumbered[index - 1].position : 0;
    const after = renumbered[index].position;
    return { position: (before + after) / 2, rebalanced: true };
  }

  /** Renumbers a column to multiples of 1024, preserving the current order. */
  async rebalanceCards(
    boardId: string,
    listId: string | null,
  ): Promise<Array<{ id: string; position: number }>> {
    const current = await this.boardRepository.cardPositions(listId, boardId);
    const renumbered = current.map((row, index) => ({
      id: row.id,
      position: (index + 1) * POSITION_GAP,
    }));
    await this.boardRepository.renumberCards(renumbered);
    return renumbered;
  }

  /** Same nudge-to-free-slot rule, applied to the columns themselves. */
  async resolveListPosition(
    boardId: string,
    requested: number,
    listId: string,
  ): Promise<number> {
    const lists = await this.boardRepository.findLists(boardId);
    const others = lists.filter((list) => list.id !== listId);

    const occupantIndex = others.findIndex(
      (list) => list.position === requested,
    );
    if (occupantIndex === -1) return requested;

    const next = others[occupantIndex + 1];
    if (!next) return requested + POSITION_GAP;

    const midpoint = (requested + next.position) / 2;
    if (midpoint - requested < MIN_POSITION_GAP) {
      // Columns are few; renumbering them all is cheap.
      const renumbered = others.map((list, index) => ({
        id: list.id,
        position: (index + 1) * POSITION_GAP,
      }));
      for (const row of renumbered) {
        await this.boardRepository.updateList(row.id, {
          position: row.position,
        });
      }
      const shifted = renumbered[occupantIndex];
      const before =
        occupantIndex > 0 ? renumbered[occupantIndex - 1].position : 0;
      return (before + shifted.position) / 2;
    }
    return midpoint;
  }
}
