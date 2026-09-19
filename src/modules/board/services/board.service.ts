import { Injectable } from '@nestjs/common';
import {
  DEFAULT_CARDS_PER_LIST,
  MAX_CARDS_PER_LIST,
} from '../../../common/constants/board.constants';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import { StringUtil } from '../../../common/utils/string.util';
import { TimezoneUtil } from '../../../common/utils/timezone.util';
import {
  BoardFullQueryDto,
  CreateLabelDto,
  TimezoneQueryDto,
  UpdateBoardDto,
  UpdateLabelDto,
} from '../dto/board-request.dto';
import {
  BoardFullResponseDto,
  BoardLabelDto,
  TodayMetricsDto,
} from '../dto/board-response.dto';
import {
  toBoardDto,
  toCardSummary,
  toLabelDto,
  toListDto,
} from '../mappers/card.mapper';
import { BoardRepository } from '../repositories/board.repository';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { BoardAccessService } from './board-access.service';

@Injectable()
export class BoardService {
  constructor(
    private readonly boardRepository: BoardRepository,
    private readonly cardRepository: BoardCardRepository,
    private readonly access: BoardAccessService,
  ) {}

  /**
   * The whole screen in one round trip.
   *
   * Fetching board -> lists -> cards-per-list separately would burn a request
   * per column and hit the throttler before the page finished loading.
   */
  async getFull(
    userId: string,
    query: BoardFullQueryDto,
  ): Promise<BoardFullResponseDto> {
    // Múi giờ chỉ cần `userId` nên không phải chờ bảng — chạy song song để bớt
    // một vòng mạng. Sau lần đầu nó còn được phục vụ từ cache trong bộ nhớ.
    const [{ board, projectId, created }, timeZone] = await Promise.all([
      this.access.resolveBoardForRead(userId, query.projectId),
      this.access.resolveTimezone(userId, query.tz),
    ]);

    // Task nhận từ mail trước khi bảng tồn tại có `boardId` null; gom chúng vào
    // đây là thứ đưa chúng vào Hộp thư đến.
    //
    // **Chỉ chạy khi bảng vừa được tạo.** Sau thời điểm đó không thể sinh thêm
    // task mồ côi nữa — mọi đường tạo việc đều gán `boardId` — nên chạy mỗi lần
    // tải bảng chỉ là trả một vòng mạng cho một `UPDATE` cập nhật 0 dòng. Thẻ
    // sót lại từ dữ liệu cũ vẫn được `requireCard` nhận khi chạm tới.
    if (created) {
      await this.boardRepository.adoptOrphanTasks(userId, projectId, board.id);
    }

    const cardsPerList = Math.min(
      query.cardsPerList ?? DEFAULT_CARDS_PER_LIST,
      MAX_CARDS_PER_LIST,
    );

    const [lists, labels, cards, cardCounts, today] = await Promise.all([
      this.boardRepository.findLists(board.id),
      this.boardRepository.findLabels(board.id),
      this.cardRepository.topCardsPerList(board.id, cardsPerList),
      this.cardRepository.countCardsPerList(board.id),
      this.computeToday(board.id, timeZone),
    ]);

    return {
      board: toBoardDto(board),
      lists: lists.map(toListDto),
      labels: labels.map(toLabelDto),
      cards: cards.map(toCardSummary),
      cardCounts,
      today,
    };
  }

  async getToday(
    userId: string,
    query: TimezoneQueryDto,
  ): Promise<TodayMetricsDto> {
    const [{ board }, timeZone] = await Promise.all([
      this.access.resolveBoardForRead(userId, query.projectId),
      this.access.resolveTimezone(userId, query.tz),
    ]);
    return this.computeToday(board.id, timeZone);
  }

  /**
   * Counted in SQL, not summed from `cards`: `/full` only carries the first 20
   * cards of each column, so adding them up on the client gives wrong numbers
   * on any board that has scrolled past that.
   */
  async computeToday(
    boardId: string,
    timeZone: string,
  ): Promise<TodayMetricsDto> {
    const now = new Date();
    const { start, end } = TimezoneUtil.dayRange(timeZone, undefined, now);
    const row = await this.cardRepository.todayMetrics(
      boardId,
      start,
      end,
      now,
    );
    return {
      overdue: row.overdue,
      dueToday: row.due_today,
      doneToday: row.done_today,
      plannedMinutes: row.planned_minutes,
    };
  }

  async updateBoard(userId: string, boardId: string, dto: UpdateBoardDto) {
    await this.access.requireOwnBoard(userId, boardId);
    const updated = await this.boardRepository.update(boardId, {
      title: dto.title,
      starred: dto.starred,
    });
    return toBoardDto(updated);
  }

  // --- labels ---------------------------------------------------------------

  /** Nhãn thuộc bảng, mà bảng thuộc dự án — nên nhãn tự phân vùng theo dự án. */
  async listLabels(
    userId: string,
    projectId?: string,
  ): Promise<BoardLabelDto[]> {
    const { board } = await this.access.resolveBoardForRead(userId, projectId);
    const labels = await this.boardRepository.findLabels(board.id);
    return labels.map(toLabelDto);
  }

  async createLabel(
    userId: string,
    boardId: string,
    dto: CreateLabelDto,
  ): Promise<BoardLabelDto> {
    await this.access.requireOwnBoard(userId, boardId);
    const label = await this.boardRepository.createLabel({
      boardId,
      name: dto.name,
      color: dto.color,
      slug: this.uniqueSlug(dto.name),
    });
    return toLabelDto(label);
  }

  async updateLabel(
    userId: string,
    labelId: string,
    dto: UpdateLabelDto,
  ): Promise<BoardLabelDto> {
    const label = await this.requireLabel(userId, labelId);
    const updated = await this.boardRepository.updateLabel(label.id, {
      name: dto.name,
      color: dto.color,
      slug: dto.name ? this.uniqueSlug(dto.name) : undefined,
    });
    return toLabelDto(updated);
  }

  async deleteLabel(userId: string, labelId: string): Promise<void> {
    const label = await this.requireLabel(userId, labelId);
    await this.boardRepository.deleteLabel(label.id);
  }

  /** Every id must belong to the caller's board before it can be attached. */
  async assertLabelsInBoard(
    boardId: string,
    labelIds: string[],
  ): Promise<void> {
    if (labelIds.length === 0) return;
    const unique = [...new Set(labelIds)];
    const found = await this.boardRepository.countLabelsInBoard(
      boardId,
      unique,
    );
    if (found !== unique.length) {
      throw new NotFoundException(
        'Không tìm thấy nhãn',
        ERROR_CODES.LABEL_NOT_FOUND,
      );
    }
  }

  private async requireLabel(userId: string, labelId: string) {
    const label = await this.boardRepository.findLabelById(labelId);
    if (!label) {
      throw new NotFoundException(
        'Không tìm thấy nhãn',
        ERROR_CODES.LABEL_NOT_FOUND,
      );
    }
    await this.access.requireOwnBoard(userId, label.boardId);
    return label;
  }

  private uniqueSlug(name: string): string {
    const slug = StringUtil.toLabelSlug(name);
    if (!slug) {
      throw new BusinessException(
        'Tên nhãn phải có ít nhất một chữ hoặc số',
        ERROR_CODES.LABEL_NOT_FOUND,
      );
    }
    return slug;
  }
}
