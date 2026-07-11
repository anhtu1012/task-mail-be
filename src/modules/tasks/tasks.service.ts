import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Task } from '../../generated/prisma/client';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskCategory } from '../../common/enums/task-category.enum';
import { Role } from '../../common/enums/role.enum';
import { JwtAccessPayload } from '../../common/types/jwt-payload.type';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { NotFoundException } from '../../common/exceptions/not-found.exception';
import { ForbiddenException } from '../../common/exceptions/forbidden.exception';
import { TaskRepository } from './repositories/task.repository';
import {
  CreateTaskDto,
  QueryTaskDto,
  TaskStatsQueryDto,
  UpdateTaskDto,
} from './dto/task-request.dto';
import { DeadlineStatus, TaskResponseDto } from './dto/task-response.dto';
import { TaskStatsResponseDto } from './dto/task-stats-response.dto';
import { TASK_CREATED_EVENT } from './events/task-created.event';

const isPrivileged = (role: Role) =>
  role === Role.ADMIN || role === Role.SUPER_ADMIN;

@Injectable()
export class TasksService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(
    user: JwtAccessPayload,
    query: QueryTaskDto,
  ): Promise<{
    items: TaskResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pagination = PaginationUtil.normalize(query.page, query.limit);
    const assigneeId = isPrivileged(user.role) ? query.assigneeId : user.sub;

    const filter = {
      assigneeId,
      status: query.status,
      priority: query.priority,
      category: query.category,
      taskTypeId: query.taskTypeId,
      sourceMailAccountId: query.sourceMailAccountId,
      deadlineFrom: query.from ? new Date(query.from) : undefined,
      deadlineTo: query.to ? new Date(query.to) : undefined,
    };

    const [items, total] = await Promise.all([
      this.taskRepository.findMany(filter, pagination),
      this.taskRepository.count(filter),
    ]);

    return {
      items: items.map((task) => this.toResponse(task)),
      total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  async getById(user: JwtAccessPayload, id: string): Promise<TaskResponseDto> {
    const task = await this.findOrThrow(id);
    this.assertCanAccess(task, user);
    return this.toResponse(task);
  }

  async create(
    user: JwtAccessPayload,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const assigneeId = dto.assigneeId ?? user.sub;
    if (assigneeId !== user.sub && !isPrivileged(user.role)) {
      throw new ForbiddenException(
        'Only admins can assign tasks to other users',
      );
    }

    const task = await this.taskRepository.create({
      title: dto.title,
      description: dto.description,
      note: dto.note,
      taskTypeId: dto.taskTypeId,
      category: dto.category,
      priority: dto.priority,
      attachments: dto.attachments,
      assigneeId,
      creatorId: user.sub,
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : undefined,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
    });

    this.emitTaskCreated(task);
    return this.toResponse(task);
  }

  async update(
    user: JwtAccessPayload,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const task = await this.findOrThrow(id);
    this.assertCanAccess(task, user);

    if (
      dto.assigneeId &&
      dto.assigneeId !== task.assigneeId &&
      !isPrivileged(user.role)
    ) {
      throw new ForbiddenException('Only admins can reassign tasks');
    }

    const completingNow =
      dto.status === TaskStatus.DONE && !task.completedAt && !dto.completedAt;

    const updated = await this.taskRepository.update(id, {
      title: dto.title,
      description: dto.description,
      note: dto.note,
      taskTypeId: dto.taskTypeId,
      category: dto.category,
      priority: dto.priority,
      attachments: dto.attachments,
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : undefined,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      status: dto.status,
      completedAt: completingNow
        ? new Date()
        : dto.completedAt
          ? new Date(dto.completedAt)
          : undefined,
    });

    return this.toResponse(updated);
  }

  async complete(user: JwtAccessPayload, id: string): Promise<TaskResponseDto> {
    const task = await this.findOrThrow(id);
    this.assertCanAccess(task, user);

    const updated = await this.taskRepository.update(id, {
      status: TaskStatus.DONE,
      completedAt: new Date(),
    });

    return this.toResponse(updated);
  }

  async remove(user: JwtAccessPayload, id: string): Promise<void> {
    const task = await this.findOrThrow(id);
    this.assertCanAccess(task, user);
    await this.taskRepository.delete(id);
  }

  async getStats(
    user: JwtAccessPayload,
    query: TaskStatsQueryDto,
  ): Promise<TaskStatsResponseDto> {
    const assigneeId =
      isPrivileged(user.role) && query.assigneeId ? query.assigneeId : user.sub;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      total,
      totalCompleted,
      completedInMonth,
      onTimeCompleted,
      onTimeCompletedInMonth,
    ] = await Promise.all([
      this.taskRepository.countTotal(assigneeId),
      this.taskRepository.countCompleted(assigneeId),
      this.taskRepository.countCompleted(assigneeId, monthStart),
      this.taskRepository.countOnTimeCompleted(assigneeId),
      this.taskRepository.countOnTimeCompleted(assigneeId, monthStart),
    ]);

    return {
      totalCompleted,
      completedInMonth,
      completionRate:
        total > 0 ? Math.round((totalCompleted / total) * 100) : 0,
      performance:
        totalCompleted > 0
          ? Math.round((onTimeCompleted / totalCompleted) * 100)
          : 0,
      performanceMonth:
        completedInMonth > 0
          ? Math.round((onTimeCompletedInMonth / completedInMonth) * 100)
          : 0,
    };
  }

  /** Looks up a task created from an external source (e.g. mail ingestion) by its dedup key. */
  async findByExternalRef(
    externalRef: string,
  ): Promise<TaskResponseDto | null> {
    const task = await this.taskRepository.findByExternalRef(externalRef);
    return task ? this.toResponse(task) : null;
  }

  /**
   * Creates a task on behalf of an automated source (no requesting user, so the
   * ownership checks that guard the HTTP-facing `create` do not apply here).
   */
  async createSystemTask(input: {
    assigneeId: string;
    title: string;
    description?: string;
    deadline?: Date;
    priority?: TaskPriority;
    category?: TaskCategory;
    attachments?: string[];
    assignedAt?: Date;
    externalRef: string;
    externalSyncStatus: string;
    sourceMailAccountId?: string;
  }): Promise<TaskResponseDto> {
    const task = await this.taskRepository.create({
      title: input.title,
      description: input.description,
      priority: input.priority,
      category: input.category ?? TaskCategory.WORK,
      attachments: input.attachments,
      assigneeId: input.assigneeId,
      creatorId: input.assigneeId,
      assignedAt: input.assignedAt ?? new Date(),
      deadline: input.deadline,
      externalRef: input.externalRef,
      externalSyncStatus: input.externalSyncStatus,
      sourceMailAccountId: input.sourceMailAccountId,
    });

    this.emitTaskCreated(task);
    return this.toResponse(task);
  }

  /** Tasks whose deadline falls within the next `hours` and haven't been reminded yet. */
  async findApproachingDeadline(hours: number): Promise<TaskResponseDto[]> {
    const tasks = await this.taskRepository.findApproachingDeadline(hours);
    return tasks.map((task) => this.toResponse(task));
  }

  async markDeadlineNotified(id: string): Promise<void> {
    await this.taskRepository.markDeadlineNotified(id);
  }

  private emitTaskCreated(task: Task): void {
    this.eventEmitter.emit(TASK_CREATED_EVENT, {
      id: task.id,
      assigneeId: task.assigneeId,
      title: task.title,
      priority: task.priority,
      deadline: task.deadline,
    });
  }

  private async findOrThrow(id: string): Promise<Task> {
    const task = await this.taskRepository.findById(id);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private assertCanAccess(task: Task, user: JwtAccessPayload): void {
    if (isPrivileged(user.role)) return;
    if (task.assigneeId === user.sub || task.creatorId === user.sub) return;
    throw new ForbiddenException('You do not have access to this task');
  }

  private computeDeadlineStatus(task: Task): DeadlineStatus {
    if (task.status === TaskStatus.DONE) {
      if (
        !task.deadline ||
        !task.completedAt ||
        task.completedAt <= task.deadline
      )
        return 'ON_TIME';
      return 'LATE';
    }
    if (task.deadline && task.deadline.getTime() < Date.now()) return 'LATE';
    return 'IN_PROGRESS';
  }

  private toResponse(task: Task): TaskResponseDto {
    return {
      id: task.id,
      code: `TSK-${String(task.seq).padStart(6, '0')}`,
      title: task.title,
      description: task.description,
      note: task.note,
      taskTypeId: task.taskTypeId,
      category: task.category,
      priority: task.priority,
      status: task.status,
      deadlineStatus: this.computeDeadlineStatus(task),
      assigneeId: task.assigneeId,
      creatorId: task.creatorId,
      assignedAt: task.assignedAt,
      deadline: task.deadline,
      completedAt: task.completedAt,
      attachments: task.attachments,
      sourceMailAccountId: task.sourceMailAccountId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
