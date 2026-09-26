import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TimezoneUtil } from '../../../common/utils/timezone.util';
import { StringUtil } from '../../../common/utils/string.util';
import {
  AgendaQueryDto,
  NotesFeedQueryDto,
  SearchQueryDto,
} from '../dto/board-request.dto';
import {
  AgendaResponseDto,
  NotesFeedDto,
  SearchResponseDto,
} from '../dto/board-response.dto';
import { formatTaskCode, toCardSummary } from '../mappers/card.mapper';
import { BoardCardRepository } from '../repositories/board-card.repository';
import { CardDetailRepository } from '../repositories/card-detail.repository';
import { BoardAccessService } from './board-access.service';
import { BoardService } from './board.service';

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_NOTES_LIMIT = 20;

@Injectable()
export class BoardAgendaService {
  constructor(
    private readonly cardRepository: BoardCardRepository,
    private readonly detailRepository: CardDetailRepository,
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

  /**
   * Dòng ghi chú của mọi thẻ trên bảng của dự án đang mở — tab "Ghi chú" trên
   * mobile. Ghi chú không có cột người viết: nó thuộc thẻ, mà thẻ nằm trên bảng
   * riêng của từng người, nên lọc theo bảng đã là "ghi chú của tôi".
   *
   * Phân trang theo `createdAt` (không theo offset) để ghi chú mới thêm lúc
   * đang cuộn không làm trang sau lặp lại dòng cũ.
   */
  async notesFeed(
    userId: string,
    query: NotesFeedQueryDto,
  ): Promise<NotesFeedDto> {
    const { board } = await this.access.resolveBoardForRead(
      userId,
      query.projectId,
    );
    const limit = query.limit ?? DEFAULT_NOTES_LIMIT;
    const rows = await this.detailRepository.findNotesOnBoard(
      board.id,
      query.before ? new Date(query.before) : undefined,
      limit + 1,
    );

    const page = rows.slice(0, limit);
    return {
      items: page.map((note) => ({
        id: note.id,
        taskId: note.taskId,
        content: note.content,
        createdAt: note.createdAt,
        editedAt: note.editedAt,
        card: {
          id: note.task.id,
          code: formatTaskCode(note.task.seq),
          title: note.task.title,
          status: note.task.status,
          listTitle: note.task.list?.title ?? null,
        },
      })),
      nextCursor:
        rows.length > limit
          ? (page.at(-1)?.createdAt.toISOString() ?? null)
          : null,
    };
  }
}
