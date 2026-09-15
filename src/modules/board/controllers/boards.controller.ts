import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_ROUTES } from '../../../common/constants/api-routes.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-uuid.pipe';
import { RequestWithUser } from '../../../common/types/request-with-user.type';
import {
  AgendaQueryDto,
  BoardFullQueryDto,
  CreateLabelDto,
  CreateListDto,
  ListCardsQueryDto,
  SearchQueryDto,
  TimezoneQueryDto,
  UpdateBoardDto,
  UpdateLabelDto,
} from '../dto/board-request.dto';
import {
  AgendaResponseDto,
  BoardDto,
  BoardFullResponseDto,
  BoardLabelDto,
  CardPageDto,
  PositionDto,
  SearchResponseDto,
  TaskListDto,
  TodayMetricsDto,
} from '../dto/board-response.dto';
import { BoardService } from '../services/board.service';
import { BoardListService } from '../services/board-list.service';
import { BoardAgendaService } from '../services/board-agenda.service';

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.BOARDS.ROOT)
export class BoardsController {
  constructor(
    private readonly boardService: BoardService,
    private readonly listService: BoardListService,
    private readonly agendaService: BoardAgendaService,
  ) {}

  // NOTE: the `me/...` routes are declared before `:id` so Nest does not match
  // "me" as a board id.

  @Get(API_ROUTES.BOARDS.ME_FULL)
  @ApiOperation({
    summary:
      'Toàn bộ dữ liệu bảng trong một lần gọi (bảng, danh sách, nhãn, thẻ)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: BoardFullResponseDto })
  getFull(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: BoardFullQueryDto,
  ): Promise<BoardFullResponseDto> {
    return this.boardService.getFull(user.sub, query);
  }

  @Get(API_ROUTES.BOARDS.ME_TODAY)
  @ApiOperation({ summary: 'Bốn chỉ số hôm nay trên thanh công cụ' })
  @ApiResponse({ status: HttpStatus.OK, type: TodayMetricsDto })
  getToday(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: TimezoneQueryDto,
  ): Promise<TodayMetricsDto> {
    return this.boardService.getToday(user.sub, query);
  }

  @Get(API_ROUTES.BOARDS.ME_AGENDA)
  @ApiOperation({ summary: 'Lịch trong ngày: quá hạn + đến hạn hôm nay' })
  @ApiResponse({ status: HttpStatus.OK, type: AgendaResponseDto })
  getAgenda(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: AgendaQueryDto,
  ): Promise<AgendaResponseDto> {
    return this.agendaService.agenda(user.sub, query);
  }

  @Get(API_ROUTES.BOARDS.ME_SEARCH)
  @ApiOperation({
    summary: 'Tìm kiếm toàn bảng cho Ctrl+K (không phân biệt dấu)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SearchResponseDto })
  search(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.agendaService.search(user.sub, query);
  }

  @Get('me/inbox/cards')
  @ApiOperation({ summary: 'Tải tiếp thẻ trong Hộp thư đến (listId = null)' })
  @ApiResponse({ status: HttpStatus.OK, type: CardPageDto })
  inboxCards(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: ListCardsQueryDto,
  ): Promise<CardPageDto> {
    return this.listService.inboxCards(user.sub, query);
  }

  @Post('me/inbox/rebalance')
  @ApiOperation({ summary: 'Đánh số lại position của Hộp thư đến' })
  @ApiResponse({ status: HttpStatus.OK, type: [PositionDto] })
  @HttpCode(HttpStatus.OK)
  rebalanceInbox(
    @CurrentUser() user: RequestWithUser['user'],
  ): Promise<PositionDto[]> {
    return this.listService.rebalanceInbox(user.sub);
  }

  @Get(`me/${API_ROUTES.BOARDS.LABELS}`)
  @ApiOperation({ summary: 'Danh sách nhãn của bảng' })
  @ApiResponse({ status: HttpStatus.OK, type: [BoardLabelDto] })
  listLabels(
    @CurrentUser() user: RequestWithUser['user'],
  ): Promise<BoardLabelDto[]> {
    return this.boardService.listLabels(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Đổi tên bảng / gắn sao' })
  @ApiResponse({ status: HttpStatus.OK, type: BoardDto })
  updateBoard(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateBoardDto,
  ): Promise<BoardDto> {
    return this.boardService.updateBoard(user.sub, id, dto);
  }

  @Post(`:id/${API_ROUTES.BOARDS.LISTS}`)
  @ApiOperation({ summary: 'Tạo danh sách (cột) mới' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskListDto })
  @HttpCode(HttpStatus.CREATED)
  createList(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateListDto,
  ): Promise<TaskListDto> {
    return this.listService.create(user.sub, id, dto);
  }

  @Post(`:id/${API_ROUTES.BOARDS.LABELS}`)
  @ApiOperation({ summary: 'Tạo nhãn mới (slug sinh tự động từ tên)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BoardLabelDto })
  @HttpCode(HttpStatus.CREATED)
  createLabel(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateLabelDto,
  ): Promise<BoardLabelDto> {
    return this.boardService.createLabel(user.sub, id, dto);
  }
}

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.BOARDS.LABELS)
export class BoardLabelsController {
  constructor(private readonly boardService: BoardService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa nhãn' })
  @ApiResponse({ status: HttpStatus.OK, type: BoardLabelDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLabelDto,
  ): Promise<BoardLabelDto> {
    return this.boardService.updateLabel(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá nhãn (gỡ khỏi mọi thẻ)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.boardService.deleteLabel(user.sub, id);
  }
}
