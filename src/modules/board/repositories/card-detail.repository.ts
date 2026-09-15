import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  Checklist,
  ChecklistItem,
  TaskActivity,
  TaskAttachment,
  TaskNote,
} from '../../../generated/prisma/client';
import {
  ActivityAction,
  AttachmentKind,
} from '../../../generated/prisma/enums';

@Injectable()
export class CardDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- checklists -----------------------------------------------------------

  findChecklist(id: string): Promise<Checklist | null> {
    return this.prisma.checklist.findUnique({ where: { id } });
  }

  async lastChecklistPosition(taskId: string): Promise<number> {
    const last = await this.prisma.checklist.findFirst({
      where: { taskId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last?.position ?? 0;
  }

  createChecklist(input: {
    taskId: string;
    title: string;
    position: number;
  }): Promise<Checklist> {
    return this.prisma.checklist.create({ data: input });
  }

  async deleteChecklist(id: string): Promise<void> {
    await this.prisma.checklist.delete({ where: { id } });
  }

  findChecklistItem(
    id: string,
  ): Promise<(ChecklistItem & { checklist: Checklist }) | null> {
    return this.prisma.checklistItem.findUnique({
      where: { id },
      include: { checklist: true },
    });
  }

  async lastChecklistItemPosition(checklistId: string): Promise<number> {
    const last = await this.prisma.checklistItem.findFirst({
      where: { checklistId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return last?.position ?? 0;
  }

  createChecklistItem(input: {
    checklistId: string;
    content: string;
    position: number;
  }): Promise<ChecklistItem> {
    return this.prisma.checklistItem.create({ data: input });
  }

  updateChecklistItem(
    id: string,
    data: {
      content?: string;
      checked?: boolean;
      checkedAt?: Date | null;
      position?: number;
    },
  ): Promise<ChecklistItem> {
    return this.prisma.checklistItem.update({ where: { id }, data });
  }

  async deleteChecklistItem(id: string): Promise<void> {
    await this.prisma.checklistItem.delete({ where: { id } });
  }

  // --- notes ----------------------------------------------------------------

  findNote(id: string): Promise<TaskNote | null> {
    return this.prisma.taskNote.findUnique({ where: { id } });
  }

  createNote(input: { taskId: string; content: string }): Promise<TaskNote> {
    return this.prisma.taskNote.create({ data: input });
  }

  updateNote(id: string, content: string): Promise<TaskNote> {
    return this.prisma.taskNote.update({
      where: { id },
      data: { content, editedAt: new Date() },
    });
  }

  async deleteNote(id: string): Promise<void> {
    await this.prisma.taskNote.delete({ where: { id } });
  }

  // --- attachments ----------------------------------------------------------

  findAttachment(id: string): Promise<TaskAttachment | null> {
    return this.prisma.taskAttachment.findUnique({ where: { id } });
  }

  createAttachment(input: {
    taskId: string;
    name: string;
    kind: AttachmentKind;
    url: string;
    sizeBytes?: number | null;
  }): Promise<TaskAttachment> {
    return this.prisma.taskAttachment.create({ data: input });
  }

  /** Exactly one cover per card, so setting one clears the rest. */
  async setCover(
    taskId: string,
    attachmentId: string,
  ): Promise<TaskAttachment> {
    const [, updated] = await this.prisma.$transaction([
      this.prisma.taskAttachment.updateMany({
        where: { taskId, id: { not: attachmentId } },
        data: { isCover: false },
      }),
      this.prisma.taskAttachment.update({
        where: { id: attachmentId },
        data: { isCover: true },
      }),
    ]);
    return updated;
  }

  clearCover(id: string): Promise<TaskAttachment> {
    return this.prisma.taskAttachment.update({
      where: { id },
      data: { isCover: false },
    });
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.prisma.taskAttachment.delete({ where: { id } });
  }

  // --- activity log ---------------------------------------------------------

  createActivity(input: {
    taskId: string;
    action: ActivityAction;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<TaskActivity> {
    return this.prisma.taskActivity.create({
      data: {
        taskId: input.taskId,
        action: input.action,
        message: input.message,
        metadata: input.metadata as never,
      },
    });
  }
}
