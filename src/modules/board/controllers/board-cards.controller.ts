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
  Put,
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
  CreateAttachmentDto,
  CreateCardDto,
  CreateChecklistDto,
  MoveCardDto,
  SetCardLabelsDto,
  SnoozeCardDto,
  SnoozeQueryDto,
  UndoFlagQueryDto,
  UpsertNoteDto,
} from '../dto/board-request.dto';
import {
  CardDetailDto,
  CardSummaryDto,
  ChecklistDto,
  CompleteCardResponseDto,
  MoveCardResponseDto,
  TaskAttachmentDto,
  TaskNoteDto,
} from '../dto/board-response.dto';
import { BoardCardService } from '../services/board-card.service';
import { CardDetailService } from '../services/card-detail.service';

/**
 * Board-side operations on a task. They share the `/tasks` prefix with
 * {@link TasksController} but never collide with its routes: everything here
 * sits under a sub-path.
 */
@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.TASKS.ROOT)
export class BoardCardsController {
  constructor(
    private readonly cardService: BoardCardService,
    private readonly detailService: CardDetailService,
  ) {}

  @Patch(`:id/${API_ROUTES.TASKS.MOVE}`)
  @HighFrequencyWrite()
  @ApiOperation({
    summary:
      'Kéo thả thẻ. Position đã bị chiếm thì backend tự dịch sang khe trống gần nhất',
  })
  @ApiResponse({ status: HttpStatus.OK, type: MoveCardResponseDto })
  move(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: MoveCardDto,
    @Query() flags: UndoFlagQueryDto,
  ): Promise<MoveCardResponseDto> {
    return this.cardService.move(user.sub, id, dto, flags.undo === true);
  }

  @Patch(`:id/${API_ROUTES.TASKS.SNOOZE}`)
  @HighFrequencyWrite()
  @ApiOperation({ summary: 'Dời hạn (hoặc bỏ hạn với deadline = null)' })
  @ApiResponse({ status: HttpStatus.OK, type: CardSummaryDto })
  snooze(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SnoozeCardDto,
    @Query() query: SnoozeQueryDto,
  ): Promise<CardSummaryDto> {
    return this.cardService.snooze(
      user.sub,
      id,
      dto,
      query.tz,
      query.undo === true,
    );
  }

  @Get(`:id/${API_ROUTES.TASKS.DETAIL}`)
  @ApiOperation({
    summary: 'Thẻ đầy đủ kèm checklist, đính kèm, ghi chú, nhật ký',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CardDetailDto })
  detail(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<CardDetailDto> {
    return this.cardService.detail(user.sub, id);
  }

  @Patch(`:id/${API_ROUTES.TASKS.COMPLETE}`)
  @ApiOperation({
    summary:
      'Hoàn thành việc; việc có repeat sẽ sinh luôn thẻ kế tiếp trong "next"',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CompleteCardResponseDto })
  complete(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() flags: UndoFlagQueryDto,
  ): Promise<CompleteCardResponseDto> {
    return this.cardService.complete(user.sub, id, flags.undo === true);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Mở lại việc đã hoàn thành' })
  @ApiResponse({ status: HttpStatus.OK, type: CardSummaryDto })
  reopen(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() flags: UndoFlagQueryDto,
  ): Promise<CardSummaryDto> {
    return this.cardService.reopen(user.sub, id, flags.undo === true);
  }

  @Post(`:id/${API_ROUTES.TASKS.RESTORE}`)
  @ApiOperation({ summary: 'Khôi phục việc vừa xoá (phục vụ Ctrl+Z)' })
  @ApiResponse({ status: HttpStatus.OK, type: CardSummaryDto })
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    // Khôi phục không ghi nhật ký (không có ActivityAction tương ứng), nhưng
    // vẫn nhận cờ để frontend gửi đồng loạt mà không bị 400.
    @Query() _flags: UndoFlagQueryDto,
  ): Promise<CardSummaryDto> {
    return this.cardService.restore(user.sub, id);
  }

  @Post('inbox/cards')
  @HighFrequencyWrite()
  @ApiOperation({ summary: 'Tạo thẻ thẳng vào Hộp thư đến (listId = null)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CardSummaryDto })
  @HttpCode(HttpStatus.CREATED)
  createInboxCard(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: CreateCardDto,
  ): Promise<CardSummaryDto> {
    return this.cardService.create(user.sub, null, dto);
  }

  // --- labels ---------------------------------------------------------------

  @Put(`:id/${API_ROUTES.TASKS.LABELS}`)
  @ApiOperation({ summary: 'Đặt lại toàn bộ nhãn của thẻ' })
  @ApiResponse({ status: HttpStatus.OK, type: CardSummaryDto })
  setLabels(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SetCardLabelsDto,
  ): Promise<CardSummaryDto> {
    return this.cardService.setLabels(user.sub, id, dto);
  }

  @Post(`:id/${API_ROUTES.TASKS.LABELS}/:labelId`)
  @ApiOperation({ summary: 'Gắn một nhãn vào thẻ' })
  @ApiResponse({ status: HttpStatus.OK, type: CardSummaryDto })
  @HttpCode(HttpStatus.OK)
  addLabel(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('labelId', ParseObjectIdPipe) labelId: string,
  ): Promise<CardSummaryDto> {
    return this.cardService.addLabel(user.sub, id, labelId);
  }

  @Delete(`:id/${API_ROUTES.TASKS.LABELS}/:labelId`)
  @ApiOperation({ summary: 'Gỡ một nhãn khỏi thẻ' })
  @ApiResponse({ status: HttpStatus.OK, type: CardSummaryDto })
  removeLabel(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('labelId', ParseObjectIdPipe) labelId: string,
  ): Promise<CardSummaryDto> {
    return this.cardService.removeLabel(user.sub, id, labelId);
  }

  // --- checklist / note / attachment ----------------------------------------

  @Post(`:id/${API_ROUTES.TASKS.CHECKLISTS}`)
  @ApiOperation({ summary: 'Thêm checklist vào thẻ' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ChecklistDto })
  @HttpCode(HttpStatus.CREATED)
  createChecklist(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateChecklistDto,
  ): Promise<ChecklistDto> {
    return this.detailService.createChecklist(user.sub, id, dto);
  }

  @Post(`:id/${API_ROUTES.TASKS.NOTES}`)
  @ApiOperation({ summary: 'Thêm ghi chú cá nhân' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskNoteDto })
  @HttpCode(HttpStatus.CREATED)
  createNote(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpsertNoteDto,
  ): Promise<TaskNoteDto> {
    return this.detailService.createNote(user.sub, id, dto);
  }

  @Post(`:id/${API_ROUTES.TASKS.ATTACHMENTS}`)
  @ApiOperation({
    summary:
      'Đăng ký đính kèm đã có URL (chưa hỗ trợ upload trực tiếp — xem mục 9.3)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskAttachmentDto })
  @HttpCode(HttpStatus.CREATED)
  createAttachment(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateAttachmentDto,
  ): Promise<TaskAttachmentDto> {
    return this.detailService.createAttachment(user.sub, id, dto);
  }
}
