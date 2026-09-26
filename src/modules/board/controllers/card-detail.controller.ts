import {
  Body,
  Controller,
  Delete,
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
  CreateChecklistItemDto,
  UndoFlagQueryDto,
  UpdateAttachmentDto,
  UpdateChecklistDto,
  UpdateChecklistItemDto,
  UpsertNoteDto,
} from '../dto/board-request.dto';
import {
  ChecklistDto,
  ChecklistItemDto,
  TaskAttachmentDto,
  TaskNoteDto,
} from '../dto/board-response.dto';
import { CardDetailService } from '../services/card-detail.service';

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.CHECKLISTS.ROOT)
export class ChecklistsController {
  constructor(private readonly service: CardDetailService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Đổi tên checklist' })
  @ApiResponse({ status: HttpStatus.OK, type: ChecklistDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateChecklistDto,
  ): Promise<ChecklistDto> {
    return this.service.updateChecklist(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá checklist cùng toàn bộ mục bên trong' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.service.deleteChecklist(user.sub, id);
  }

  @Post(`:id/${API_ROUTES.CHECKLISTS.ITEMS}`)
  @HighFrequencyWrite()
  @ApiOperation({ summary: 'Thêm mục vào checklist' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ChecklistItemDto })
  @HttpCode(HttpStatus.CREATED)
  createItem(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateChecklistItemDto,
  ): Promise<ChecklistItemDto> {
    return this.service.createChecklistItem(user.sub, id, dto);
  }
}

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.CHECKLIST_ITEMS.ROOT)
export class ChecklistItemsController {
  constructor(private readonly service: CardDetailService) {}

  @Patch(':id')
  @HighFrequencyWrite()
  @ApiOperation({
    summary: 'Tick / sửa / đổi thứ tự mục — tick sẽ ghi checkedAt và nhật ký',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ChecklistItemDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateChecklistItemDto,
    @Query() flags: UndoFlagQueryDto,
  ): Promise<ChecklistItemDto> {
    return this.service.updateChecklistItem(
      user.sub,
      id,
      dto,
      flags.undo === true,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá một mục checklist' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.service.deleteChecklistItem(user.sub, id);
  }
}

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.NOTES.ROOT)
export class TaskNotesController {
  constructor(private readonly service: CardDetailService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa ghi chú (đặt editedAt)' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskNoteDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpsertNoteDto,
  ): Promise<TaskNoteDto> {
    return this.service.updateNote(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá ghi chú' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.service.deleteNote(user.sub, id);
  }
}

@ApiTags('Board')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.ATTACHMENTS.ROOT)
export class TaskAttachmentsController {
  constructor(private readonly service: CardDetailService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Đặt / bỏ ảnh bìa (mỗi thẻ chỉ một ảnh bìa)' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskAttachmentDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAttachmentDto,
  ): Promise<TaskAttachmentDto> {
    return this.service.updateAttachment(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá đính kèm' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.service.deleteAttachment(user.sub, id);
  }
}
