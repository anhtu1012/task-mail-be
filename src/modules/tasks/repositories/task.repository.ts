import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import type { Task } from '../../../generated/prisma/client';
import { TaskCategory, TaskPriority, TaskStatus } from '../../../generated/prisma/enums';
import { PaginationParams } from '../../../common/types/pagination.type';

export type TaskFilter = {
  assigneeId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  taskTypeId?: string;
  deadlineFrom?: Date;
  deadlineTo?: Date;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  note?: string;
  taskTypeId?: string;
  category?: TaskCategory;
  priority?: TaskPriority;
  attachments?: string[];
  assigneeId: string;
  creatorId?: string;
  assignedAt?: Date;
  deadline?: Date;
  externalRef?: string;
  externalSyncStatus?: string;
};

export type UpdateTaskInput = Partial<
  Omit<CreateTaskInput, 'assigneeId' | 'creatorId'>
> & {
  status?: TaskStatus;
  completedAt?: Date | null;
};

function buildWhere(filter: TaskFilter): Prisma.TaskWhereInput {
  return {
    assigneeId: filter.assigneeId,
    status: filter.status,
    priority: filter.priority,
    category: filter.category,
    taskTypeId: filter.taskTypeId,
    deadline:
      filter.deadlineFrom || filter.deadlineTo
        ? { gte: filter.deadlineFrom, lte: filter.deadlineTo }
        : undefined,
  };
}

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filter: TaskFilter, pagination: PaginationParams): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: buildWhere(filter),
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(filter: TaskFilter): Promise<number> {
    return this.prisma.task.count({ where: buildWhere(filter) });
  }

  findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  findByExternalRef(externalRef: string): Promise<Task | null> {
    return this.prisma.task.findFirst({ where: { externalRef } });
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.prisma.task.create({ data: input });
  }

  update(id: string, input: UpdateTaskInput): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<Task> {
    return this.prisma.task.delete({ where: { id } });
  }

  countTotal(assigneeId: string): Promise<number> {
    return this.prisma.task.count({ where: { assigneeId } });
  }

  countCompleted(assigneeId: string, since?: Date): Promise<number> {
    return this.prisma.task.count({
      where: {
        assigneeId,
        status: TaskStatus.DONE,
        completedAt: since ? { gte: since } : undefined,
      },
    });
  }

  // Prisma has no field-to-field comparison in `where`, so on-time completions
  // are computed in memory from the (small) set of completed tasks in scope.
  async countOnTimeCompleted(assigneeId: string, since?: Date): Promise<number> {
    const completed = await this.prisma.task.findMany({
      where: {
        assigneeId,
        status: TaskStatus.DONE,
        completedAt: since ? { gte: since } : undefined,
      },
      select: { deadline: true, completedAt: true },
    });
    return completed.filter((t) => !t.deadline || !t.completedAt || t.completedAt <= t.deadline)
      .length;
  }

  findApproachingDeadline(hours: number): Promise<Task[]> {
    const now = new Date();
    const threshold = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.prisma.task.findMany({
      where: {
        deadline: { gte: now, lte: threshold },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        deadlineNotifiedAt: null,
      },
    });
  }

  markDeadlineNotified(id: string): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data: { deadlineNotifiedAt: new Date() } });
  }
}
