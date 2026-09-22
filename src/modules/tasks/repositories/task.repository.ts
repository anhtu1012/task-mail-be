import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { Task } from '../../../generated/prisma/client';
import type { Role } from '../../../generated/prisma/enums';
import {
  RepeatUnit,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from '../../../generated/prisma/enums';
import { PaginationParams } from '../../../common/types/pagination.type';

export type TaskFilter = {
  assigneeId?: string;
  /** Lớp phân vùng. Bỏ trống = mọi dự án (xem `TasksService.list`). */
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  taskTypeId?: string;
  sourceMailAccountId?: string;
  deadlineFrom?: Date;
  deadlineTo?: Date;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  note?: string;
  taskTypeId?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  attachments?: string[];
  assigneeId: string;
  /** Bắt buộc: mọi việc đều thuộc đúng một dự án, không có ngoại lệ. */
  projectId: string;
  creatorId?: string;
  assignedAt?: Date;
  deadline?: Date;
  externalRef?: string;
  externalSyncStatus?: string;
  sourceMailAccountId?: string;
  boardId?: string;
  cover?: string | null;
  estimateMinutes?: number | null;
  repeatUnit?: RepeatUnit | null;
  repeatInterval?: number | null;
};

export type UpdateTaskInput = Partial<
  Omit<CreateTaskInput, 'assigneeId' | 'creatorId'>
> & {
  status?: TaskStatus;
  completedAt?: Date | null;
  deletedAt?: Date | null;
};

function buildWhere(filter: TaskFilter): Prisma.TaskWhereInput {
  return {
    // Soft-deleted cards stay in the table for Ctrl+Z but are invisible here.
    deletedAt: null,
    assigneeId: filter.assigneeId,
    projectId: filter.projectId,
    status: filter.status,
    priority: filter.priority,
    category: filter.category,
    taskTypeId: filter.taskTypeId,
    sourceMailAccountId: filter.sourceMailAccountId,
    deadline:
      filter.deadlineFrom || filter.deadlineTo
        ? { gte: filter.deadlineFrom, lte: filter.deadlineTo }
        : undefined,
  };
}

/**
 * Quan hệ luôn kèm theo khi đọc task để hiển thị.
 *
 * `assignee`/`creator` chỉ lấy ba cột: giao diện cần email để hiện tên người,
 * `role` để phân biệt admin. Kéo cả hàng `users` về là mang theo `passwordHash`
 * và `googleId` — dữ liệu không được phép rời khỏi tầng auth.
 */
const USER_REF = { select: { id: true, email: true, role: true } } as const;

type UserRef = { id: string; email: string; role: Role };

/** Task kèm đúng những quan hệ mà `TASK_INCLUDE` nạp */
export type TaskWithRelations = Task & {
  labels: { labelId: string }[];
  assignee: UserRef | null;
  creator: UserRef | null;
};

const TASK_INCLUDE = {
  labels: { select: { labelId: true } },
  assignee: USER_REF,
  creator: USER_REF,
} as const;

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kèm `labels` để màn Lịch / Kanban / Công việc vẽ được nhãn.
   * Chỉ lấy `labelId` — tên và màu nhãn đã có sẵn ở `/boards/me/labels`, kéo
   * thêm chúng vào mỗi hàng task là nhân bản cùng một dữ liệu hàng trăm lần.
   */
  findMany(
    filter: TaskFilter,
    pagination: PaginationParams,
  ): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      where: buildWhere(filter),
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: TASK_INCLUDE,
    });
  }

  count(filter: TaskFilter): Promise<number> {
    return this.prisma.task.count({ where: buildWhere(filter) });
  }

  findById(id: string): Promise<TaskWithRelations | null> {
    return this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: TASK_INCLUDE,
    });
  }

  findByExternalRef(externalRef: string): Promise<Task | null> {
    return this.prisma.task.findFirst({
      where: { externalRef, deletedAt: null },
    });
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.prisma.task.create({ data: input });
  }

  update(id: string, input: UpdateTaskInput): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data: input });
  }

  /** Replaces the task's board labels wholesale. */
  async setLabels(taskId: string, labelIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.taskLabel.deleteMany({ where: { taskId } }),
      this.prisma.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId, labelId })),
        skipDuplicates: true,
      }),
    ]);
  }

  /** Soft delete: the row survives so `POST /tasks/:id/restore` can undo it. */
  softDelete(id: string): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  countTotal(assigneeId: string, projectId?: string): Promise<number> {
    return this.prisma.task.count({
      where: { assigneeId, projectId, deletedAt: null },
    });
  }

  countCompleted(
    assigneeId: string,
    since?: Date,
    projectId?: string,
  ): Promise<number> {
    return this.prisma.task.count({
      where: {
        assigneeId,
        projectId,
        deletedAt: null,
        status: TaskStatus.DONE,
        completedAt: since ? { gte: since } : undefined,
      },
    });
  }

  // Prisma has no field-to-field comparison in `where`, so on-time completions
  // are computed in memory from the (small) set of completed tasks in scope.
  async countOnTimeCompleted(
    assigneeId: string,
    since?: Date,
    projectId?: string,
  ): Promise<number> {
    const completed = await this.prisma.task.findMany({
      where: {
        assigneeId,
        projectId,
        deletedAt: null,
        status: TaskStatus.DONE,
        completedAt: since ? { gte: since } : undefined,
      },
      select: { deadline: true, completedAt: true },
    });
    return completed.filter(
      (t) => !t.deadline || !t.completedAt || t.completedAt <= t.deadline,
    ).length;
  }

  findApproachingDeadline(hours: number): Promise<Task[]> {
    const now = new Date();
    const threshold = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        deadline: { gte: now, lte: threshold },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        deadlineNotifiedAt: null,
      },
    });
  }

  markDeadlineNotified(id: string): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: { deadlineNotifiedAt: new Date() },
    });
  }
}
