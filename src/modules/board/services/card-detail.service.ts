import { Injectable } from '@nestjs/common';
import { ActivityAction } from '../../../generated/prisma/enums';
import { POSITION_GAP } from '../../../common/constants/board.constants';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import {
  CreateAttachmentDto,
  CreateChecklistDto,
  CreateChecklistItemDto,
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
import { CardDetailRepository } from '../repositories/card-detail.repository';
import { BoardAccessService } from './board-access.service';
import { ActivityService } from './activity.service';

@Injectable()
export class CardDetailService {
  constructor(
    private readonly repository: CardDetailRepository,
    private readonly access: BoardAccessService,
    private readonly activity: ActivityService,
  ) {}

  // --- checklists -----------------------------------------------------------

  async createChecklist(
    userId: string,
    cardId: string,
    dto: CreateChecklistDto,
  ): Promise<ChecklistDto> {
    const { card } = await this.access.requireCard(userId, cardId);
    const position =
      (await this.repository.lastChecklistPosition(card.id)) + POSITION_GAP;
    const checklist = await this.repository.createChecklist({
      taskId: card.id,
      title: dto.title,
      position,
    });
    return {
      id: checklist.id,
      taskId: checklist.taskId,
      title: checklist.title,
      position: checklist.position,
      items: [],
    };
  }

  async updateChecklist(
    userId: string,
    checklistId: string,
    dto: UpdateChecklistDto,
  ): Promise<ChecklistDto> {
    const checklist = await this.requireChecklist(userId, checklistId);
    const updated = await this.repository.updateChecklist(checklist.id, {
      title: dto.title,
    });
    return {
      id: updated.id,
      taskId: updated.taskId,
      title: updated.title,
      position: updated.position,
      items: updated.items.map((item) => this.toItemDto(item)),
    };
  }

  async deleteChecklist(userId: string, checklistId: string): Promise<void> {
    const checklist = await this.requireChecklist(userId, checklistId);
    await this.repository.deleteChecklist(checklist.id);
  }

  async createChecklistItem(
    userId: string,
    checklistId: string,
    dto: CreateChecklistItemDto,
  ): Promise<ChecklistItemDto> {
    const checklist = await this.requireChecklist(userId, checklistId);
    const position =
      dto.position ??
      (await this.repository.lastChecklistItemPosition(checklist.id)) +
        POSITION_GAP;

    const item = await this.repository.createChecklistItem({
      checklistId: checklist.id,
      content: dto.content,
      position,
    });
    return this.toItemDto(item);
  }

  /** Ticking an item stamps `checkedAt` and writes one activity line. */
  async updateChecklistItem(
    userId: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
    undo = false,
  ): Promise<ChecklistItemDto> {
    const item = await this.repository.findChecklistItem(itemId);
    if (!item) {
      throw new NotFoundException(
        'Không tìm thấy mục checklist',
        ERROR_CODES.CHECKLIST_ITEM_NOT_FOUND,
      );
    }
    await this.access.requireCard(userId, item.checklist.taskId);

    const checking = dto.checked === true && !item.checked;
    const updated = await this.repository.updateChecklistItem(item.id, {
      content: dto.content,
      checked: dto.checked,
      position: dto.position,
      checkedAt:
        dto.checked === undefined ? undefined : dto.checked ? new Date() : null,
    });

    if (checking && !undo) {
      await this.activity.record(
        item.checklist.taskId,
        ActivityAction.CHECKLIST_ITEM_CHECKED,
        this.activity.checklistItemChecked(updated.content),
      );
    }
    return this.toItemDto(updated);
  }

  async deleteChecklistItem(userId: string, itemId: string): Promise<void> {
    const item = await this.repository.findChecklistItem(itemId);
    if (!item) {
      throw new NotFoundException(
        'Không tìm thấy mục checklist',
        ERROR_CODES.CHECKLIST_ITEM_NOT_FOUND,
      );
    }
    await this.access.requireCard(userId, item.checklist.taskId);
    await this.repository.deleteChecklistItem(item.id);
  }

  // --- notes ----------------------------------------------------------------

  async createNote(
    userId: string,
    cardId: string,
    dto: UpsertNoteDto,
  ): Promise<TaskNoteDto> {
    const { card } = await this.access.requireCard(userId, cardId);
    const note = await this.repository.createNote({
      taskId: card.id,
      content: dto.content,
    });
    await this.activity.record(
      card.id,
      ActivityAction.NOTE_ADDED,
      'Thêm ghi chú',
    );
    return this.toNoteDto(note);
  }

  async updateNote(
    userId: string,
    noteId: string,
    dto: UpsertNoteDto,
  ): Promise<TaskNoteDto> {
    const note = await this.requireNote(userId, noteId);
    const updated = await this.repository.updateNote(note.id, dto.content);
    return this.toNoteDto(updated);
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const note = await this.requireNote(userId, noteId);
    await this.repository.deleteNote(note.id);
  }

  // --- attachments ----------------------------------------------------------

  async createAttachment(
    userId: string,
    cardId: string,
    dto: CreateAttachmentDto,
  ): Promise<TaskAttachmentDto> {
    const { card } = await this.access.requireCard(userId, cardId);
    const attachment = await this.repository.createAttachment({
      taskId: card.id,
      name: dto.name,
      kind: dto.kind,
      url: dto.url,
      sizeBytes: dto.sizeBytes ?? null,
    });
    await this.activity.record(
      card.id,
      ActivityAction.ATTACHMENT_ADDED,
      this.activity.attachmentAdded(dto.name),
    );
    return this.toAttachmentDto(attachment);
  }

  async updateAttachment(
    userId: string,
    attachmentId: string,
    dto: UpdateAttachmentDto,
  ): Promise<TaskAttachmentDto> {
    const attachment = await this.requireAttachment(userId, attachmentId);
    const updated =
      dto.isCover === true
        ? await this.repository.setCover(attachment.taskId, attachment.id)
        : await this.repository.clearCover(attachment.id);
    return this.toAttachmentDto(updated);
  }

  async deleteAttachment(userId: string, attachmentId: string): Promise<void> {
    const attachment = await this.requireAttachment(userId, attachmentId);
    await this.repository.deleteAttachment(attachment.id);
  }

  // --- guards ---------------------------------------------------------------

  private async requireChecklist(userId: string, checklistId: string) {
    const checklist = await this.repository.findChecklist(checklistId);
    if (!checklist) {
      throw new NotFoundException(
        'Không tìm thấy checklist',
        ERROR_CODES.CHECKLIST_NOT_FOUND,
      );
    }
    await this.access.requireCard(userId, checklist.taskId);
    return checklist;
  }

  private async requireNote(userId: string, noteId: string) {
    const note = await this.repository.findNote(noteId);
    if (!note) {
      throw new NotFoundException(
        'Không tìm thấy ghi chú',
        ERROR_CODES.NOTE_NOT_FOUND,
      );
    }
    await this.access.requireCard(userId, note.taskId);
    return note;
  }

  private async requireAttachment(userId: string, attachmentId: string) {
    const attachment = await this.repository.findAttachment(attachmentId);
    if (!attachment) {
      throw new NotFoundException(
        'Không tìm thấy đính kèm',
        ERROR_CODES.ATTACHMENT_NOT_FOUND,
      );
    }
    await this.access.requireCard(userId, attachment.taskId);
    return attachment;
  }

  private toItemDto(item: {
    id: string;
    checklistId: string;
    content: string;
    checked: boolean;
    position: number;
    checkedAt: Date | null;
  }): ChecklistItemDto {
    return {
      id: item.id,
      checklistId: item.checklistId,
      content: item.content,
      checked: item.checked,
      position: item.position,
      checkedAt: item.checkedAt,
    };
  }

  private toNoteDto(note: {
    id: string;
    taskId: string;
    content: string;
    createdAt: Date;
    editedAt: Date | null;
  }): TaskNoteDto {
    return {
      id: note.id,
      taskId: note.taskId,
      content: note.content,
      createdAt: note.createdAt,
      editedAt: note.editedAt,
    };
  }

  private toAttachmentDto(attachment: {
    id: string;
    taskId: string;
    name: string;
    kind: string;
    url: string;
    sizeBytes: number | null;
    isCover: boolean;
    createdAt: Date;
  }): TaskAttachmentDto {
    return {
      id: attachment.id,
      taskId: attachment.taskId,
      name: attachment.name,
      kind: attachment.kind,
      url: attachment.url,
      sizeBytes: attachment.sizeBytes,
      isCover: attachment.isCover,
      createdAt: attachment.createdAt,
    };
  }
}
