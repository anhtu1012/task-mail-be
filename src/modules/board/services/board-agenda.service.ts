import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TimezoneUtil } from '../../../common/utils/timezone.util';
import { StringUtil } from '../../../common/utils/string.util';
import { AgendaQueryDto, SearchQueryDto } from '../dto/board-request.dto';
import {
  AgendaResponseDto,
  SearchResponseDto,
} from '../dto/board-response.dto';
import { toCardSummary } from '../mappers/card.mapper';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { BoardAccessService } from './board-access.service';
import { BoardService } from './board.service';

const DEFAULT_SEARCH_LIMIT = 8;

@Injectable()
export class BoardAgendaService {
  constructor(
    private readonly cardRepository: BoardCardRepository,
    private readonly access: BoardAccessService,
    private readonly boardService: BoardService,
  ) {}

  /**
   * The "today" column, gathered server-side.
   *
   * It cannot be assembled from `/full`: that endpoint returns the first 20
   * cards of each column, while today's work is scattered across all of them.
   * Collecting it on the client would quietly drop rows — the screen would
   * still look fine, just incomplete.
   */
  async agenda(
    userId: string,
    query: AgendaQueryDto,
  ): Promise<AgendaResponseDto> {
    const [{ board }, timeZone] = await Promise.all([
      this.access.resolveBoardForRead(userId, query.projectId),
      this.access.resolveTimezone(userId, query.tz),
    ]);

    if (query.tz && !TimezoneUtil.isValid(query.tz)) {
      throw new BusinessException(
        'Múi giờ không hợp lệ',
        ERROR_CODES.INVALID_TIMEZONE,
      );
    }

    const now = new Date();
    const { start, end, dateKey } = TimezoneUtil.dayRange(
      timeZone,
      query.date,
      now,
    );

    // Anything already past its deadline belongs in `overdue`, so `dueToday`
    // starts from whichever comes later: the start of the day, or right now.
    const dueFrom = start > now ? start : now;

    const [overdue, dueToday, metrics] = await Promise.all([
      this.cardRepository.overdueCards(board.id, now),
      this.cardRepository.dueTodayCards(board.id, dueFrom, end),
      this.boardService.computeToday(board.id, timeZone),
    ]);

    return {
      date: dateKey,
      overdue: overdue.map(toCardSummary),
      dueToday: dueToday.map(toCardSummary),
      // Same numbers as the toolbar, so the two never disagree on screen.
      plannedMinutes: metrics.plannedMinutes,
      doneToday: metrics.doneToday,
    };
  }

  /**
   * Ctrl+K search across the whole board.
   *
   * Matching is accent-insensitive on purpose: the frontend already matches
   * without diacritics client-side, and a diacritic-sensitive backend would
   * return a different set for the same query.
   */
  async search(
    userId: string,
    query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    // Tìm kiếm tuyệt đối không được trả việc của dự án khác: `board.id` đã phân
    // vùng sẵn, nên chỉ cần lấy đúng bảng của dự án đang mở.
    const { board } = await this.access.resolveBoardForRead(
      userId,
      query.projectId,
    );
    const term = StringUtil.removeDiacritics(query.q).trim();
    if (!term) return { items: [], total: 0 };

    const limit = query.limit ?? DEFAULT_SEARCH_LIMIT;
    const [rows, total] = await Promise.all([
      this.cardRepository.searchCards(board.id, term, limit),
      this.cardRepository.countSearchMatches(board.id, term),
    ]);

    return { items: rows.map(toCardSummary), total };
  }
}
