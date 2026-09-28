import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_CARDS_PER_LIST,
  MAX_CARDS_PER_LIST,
} from '../../../common/constants/board.constants';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import { StringUtil } from '../../../common/utils/string.util';
import { TimezoneUtil } from '../../../common/utils/timezone.util';
import { CacheService } from '../../../infrastructure/cache/cache.service';
import { CACHE_TTL, CacheKeys } from '../../../infrastructure/cache/cache-keys';
import { ProjectsService } from '../../projects/services/projects.service';
import { TaskTypesService } from '../../tasks/task-types.service';
import {
  BoardFullInclude,
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
    private readonly cache: CacheService,
    private readonly projectsService: ProjectsService,
    private readonly taskTypesService: TaskTypesService,
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
    // Múi giờ và phần gộp thêm (`include`) chỉ cần `userId` nên không phải chờ
    // bảng — chạy song song để bớt vòng mạng. Gộp chung một `Promise.all` chứ
    // không để phần gộp chạy riêng rồi `await` sau: nó mà lỗi trong lúc đang
    // chờ bước khác thì thành unhandled rejection và làm sập tiến trình.
    const [{ board, projectId, created }, timeZone, extras] = await Promise.all(
      [
        this.access.resolveBoardForRead(userId, query.projectId),
        this.access.resolveTimezone(userId, query.tz),
        this.loadIncludes(userId, query.include ?? []),
      ],
    );

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
      this.labelsOf(board.id),
      this.cardRepository.topCardsPerList(board.id, cardsPerList),
      this.cardRepository.countCardsPerList(board.id),
      this.computeToday(board.id, timeZone),
    ]);

    return {
      board: toBoardDto(board),
      lists: lists.map(toListDto),
      labels,
      cards: cards.map(toCardSummary),
      cardCounts,
      today,
      ...extras,
    };
  }

  /**
   * Dữ liệu mà mọi màn hình cần lúc mở app, gộp vào đây để frontend khỏi bắn
   * thêm `GET /projects` và `GET /task-types` song song — mỗi request thêm là
   * thêm một lượt giành kết nối DB. Cả hai đều đọc qua cache.
   */
  private async loadIncludes(
    userId: string,
    include: BoardFullInclude[],
  ): Promise<Pick<BoardFullResponseDto, 'projects' | 'taskTypes'>> {
    const [projects, taskTypes] = await Promise.all([
      include.includes('projects')
        ? this.projectsService.list(userId, { includeArchived: false })
        : undefined,
      include.includes('taskTypes')
        ? this.taskTypesService.findAll()
        : undefined,
    ]);
    return {
      ...(projects && { projects }),
      ...(taskTypes && { taskTypes }),
    };
  }

  private labelsOf(boardId: string): Promise<BoardLabelDto[]> {
    return this.cache.wrap(
      CacheKeys.boardLabels(boardId),
      CACHE_TTL.LABELS,
      async () =>
        (await this.boardRepository.findLabels(boardId)).map(toLabelDto),
    );
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
    return this.labelsOf(board.id);
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
      icon: dto.icon ?? null,
      slug: await this.uniqueSlug(boardId, dto.name),
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
      // `undefined` = không đụng tới, `null` = gỡ icon. Hai thứ khác nhau nên
      // không được gộp bằng `?? null`.
      icon: dto.icon,
      slug: dto.name
        ? await this.uniqueSlug(label.boardId, dto.name, label.id)
        : undefined,
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

  /**
   * Slug là `@@unique([boardId, slug])` ở DB — để trùng lọt xuống Prisma thì
   * P2002 thành 500. `exceptId` là chính nhãn đang đổi tên (giữ slug cũ là hợp lệ).
   */
  private async uniqueSlug(
    boardId: string,
    name: string,
    exceptId?: string,
  ): Promise<string> {
    const slug = StringUtil.toLabelSlug(name);
    if (!slug) {
      throw new BusinessException(
        'Tên nhãn phải có ít nhất một chữ hoặc số',
        ERROR_CODES.LABEL_NAME_INVALID,
      );
    }
    const clash = await this.boardRepository.findLabelBySlug(boardId, slug);
    if (clash && clash.id !== exceptId) {
      throw new BusinessException(
        `Đã có nhãn "${clash.name}" trùng tên`,
        ERROR_CODES.LABEL_NAME_TAKEN,
        HttpStatus.CONFLICT,
      );
    }
    return slug;
  }
}
