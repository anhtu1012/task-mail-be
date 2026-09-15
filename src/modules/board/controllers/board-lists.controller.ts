import {
  Body,
  Controller,
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
import { HighFrequencyWrite } from '../board-throttle';
import {
  CreateCardDto,
  ListCardsQueryDto,
  MoveListDto,
  UndoFlagQueryDto,
  UpdateListDto,
} from '../dto/board-request.dto';
import {
  CardPageDto,
  CardSummaryDto,
  PositionDto,
  TaskListDto,
} from '../dto/board-response.dto';
import { BoardListService } from '../services/board-list.service';
import { BoardCardService } from '../services/board-card.service';

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.LISTS.ROOT)
export class BoardListsController {
  constructor(
    private readonly listService: BoardListService,
    private readonly cardService: BoardCardService,
  ) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa danh sách — archived = true trả thẻ về Hộp thư đến',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TaskListDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateListDto,
    // Sửa danh sách không ghi `TaskActivity` (nhật ký gắn với từng việc, không
    // gắn với cột), nên cờ này là no-op — nhận để frontend gửi đồng loạt.
    @Query() _flags: UndoFlagQueryDto,
  ): Promise<TaskListDto> {
    return this.listService.update(user.sub, id, dto);
  }

  @Patch(`:id/${API_ROUTES.LISTS.MOVE}`)
  @HighFrequencyWrite()
  @ApiOperation({ summary: 'Đổi thứ tự cột' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskListDto })
  move(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: MoveListDto,
  ): Promise<TaskListDto> {
    return this.listService.move(user.sub, id, dto);
  }

  @Post(`:id/${API_ROUTES.LISTS.REBALANCE}`)
  @ApiOperation({
    summary: 'Đánh số lại position cả cột theo bội số 1024 (thứ tự giữ nguyên)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [PositionDto] })
  @HttpCode(HttpStatus.OK)
  rebalance(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<PositionDto[]> {
    return this.listService.rebalance(user.sub, id);
  }

  @Get(`:id/${API_ROUTES.LISTS.CARDS}`)
  @ApiOperation({
    summary: 'Tải tiếp thẻ khi cuộn trong cột (cursor = position thẻ cuối)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CardPageDto })
  cards(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: ListCardsQueryDto,
  ): Promise<CardPageDto> {
    return this.listService.cards(user.sub, id, query);
  }

  @Post(`:id/${API_ROUTES.LISTS.CARDS}`)
  @HighFrequencyWrite()
  @ApiOperation({
    summary: 'Tạo thẻ trong cột (nhập nhanh đã tách sẵn trường)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: CardSummaryDto })
  @HttpCode(HttpStatus.CREATED)
  createCard(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateCardDto,
  ): Promise<CardSummaryDto> {
    return this.cardService.create(user.sub, id, dto);
  }
}
