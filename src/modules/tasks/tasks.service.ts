import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Task } from '../../generated/prisma/client';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskCategory } from '../../common/enums/task-category.enum';
import { Role } from '../../common/enums/role.enum';
import { JwtAccessPayload } from '../../common/types/jwt-payload.type';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { DeadlineUtil } from '../../common/utils/deadline.util';
import { RichTextUtil } from '../../common/utils/rich-text.util';
import { NotFoundException } from '../../common/exceptions/not-found.exception';
import { ForbiddenException } from '../../common/exceptions/forbidden.exception';
import { ActivityAction } from '../../generated/prisma/enums';
import { BoardAccessService } from '../board/services/board-access.service';
import { BoardService } from '../board/services/board.service';
import { ActivityService } from '../board/services/activity.service';
import { ProjectAccessService } from '../projects/services/project-access.service';
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
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly boardAccess: BoardAccessService,
    private readonly boardService: BoardService,
    private readonly activityService: ActivityService,
    private readonly projectAccess: ProjectAccessService,
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

    // Thiếu `projectId` = mọi dự án, giữ tương thích ngược cho xuất CSV và các
    // script gọi thẳng. Ghi log để còn biết chỗ nào chưa gửi — ý định lâu dài
    // là mọi truy vấn đều có phân vùng.
    if (query.projectId) {
      await this.projectAccess.requireOwnProject(user.sub, query.projectId);
    } else {
      this.logger.warn(
        `[Tasks] GET /tasks không kèm projectId (user=${user.sub}); trả việc của mọi dự án.`,
      );
    }

    const filter = {
      assigneeId,
      projectId: query.projectId,
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

    // Dự án của việc là dự án của **người được giao**, không phải của người
    // tạo: admin gán việc cho nhân viên thì việc đó phải nằm trong dự án của
    // nhân viên, nếu không họ mở dự án của mình sẽ không thấy.
    const project = await this.projectAccess.resolveForNewTask(
      assigneeId,
      dto.projectId,
    );

    // Tasks created here land in the assignee's Inbox (listId stays null) —
    // the board screen is where they get filed into a column.
    const board = await this.boardAccess.ensureBoard(assigneeId, project.id);
    if (dto.labelIds?.length) {
      await this.boardService.assertLabelsInBoard(board.id, dto.labelIds);
    }

    const task = await this.taskRepository.create({
      title: dto.title,
      description: RichTextUtil.sanitize(dto.description),
      note: dto.note,
      taskTypeId: dto.taskTypeId,
      category: dto.category,
      priority: dto.priority,
      attachments: dto.attachments,
      assigneeId,
      creatorId: user.sub,
      projectId: project.id,
      boardId: board.id,
      cover: dto.cover,
      estimateMinutes: dto.estimateMinutes,
      repeatUnit: dto.repeat?.unit ?? null,
      repeatInterval: dto.repeat?.interval ?? null,
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : undefined,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
    });

    if (dto.labelIds?.length) {
      await this.taskRepository.setLabels(task.id, [...new Set(dto.labelIds)]);
    }

    this.emitTaskCreated(task);
    return this.toResponse(task);
  }

  async update(
    user: JwtAccessPayload,
    id: string,
    dto: UpdateTaskDto,
    undo = false,
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

    // Chuyển việc sang dự án khác (§6.3) — không có endpoint riêng, nhưng cũng
    // không phải một phép gán đơn giản: bảng, cột và nhãn đều thuộc dự án cũ.
    const move =
      dto.projectId && dto.projectId !== task.projectId
        ? await this.moveToProject(task, dto.projectId)
        : null;

    // Nhãn gửi kèm một lần chuyển dự án sẽ là nhãn của bảng cũ — bỏ qua chúng
    // thay vì 404, vì frontend gửi nguyên trạng thái thẻ đang mở.
    const labelIds = move ? undefined : dto.labelIds;
    const boardIdForLabels = move ? null : task.boardId;
    if (labelIds && boardIdForLabels) {
      await this.boardService.assertLabelsInBoard(boardIdForLabels, labelIds);
    }

    const updated = await this.taskRepository.update(id, {
      ...(move ?? {}),
      title: dto.title,
      // Descriptions are Quill HTML and can originate from an ingested email,
      // so they are sanitised on write — never trusting the client's filtering.
      description: RichTextUtil.sanitize(dto.description),
      note: dto.note,
      taskTypeId: dto.taskTypeId,
      category: dto.category,
      priority: dto.priority,
      attachments: dto.attachments,
      cover: dto.cover,
      estimateMinutes: dto.estimateMinutes,
      repeatUnit:
        dto.repeat === undefined ? undefined : (dto.repeat?.unit ?? null),
      repeatInterval:
        dto.repeat === undefined ? undefined : (dto.repeat?.interval ?? null),
      assignedAt: dto.assignedAt ? new Date(dto.assignedAt) : undefined,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      status: dto.status,
      completedAt: completingNow
        ? new Date()
        : dto.completedAt
          ? new Date(dto.completedAt)
          : undefined,
    });

    if (labelIds) {
      await this.taskRepository.setLabels(id, [...new Set(labelIds)]);
    }

    // Changing the due date is the one edit worth a log line — it is what the
    // user looks back at when wondering why something slipped.
    const deadlineChanged =
      updated.deadline?.getTime() !== task.deadline?.getTime();
    if (deadlineChanged && !undo) {
      const timeZone = await this.boardAccess.resolveTimezone(user.sub);
      await this.activityService.record(
        id,
        ActivityAction.DUE_CHANGED,
        this.activityService.dueChanged(updated.deadline, timeZone),
        { from: task.deadline, to: updated.deadline },
      );
    }

    return this.toResponse(updated);
  }

  /**
   * Dọn dẹp khi một việc đổi dự án (§6.3).
   *
   * Không chỉ đổi `projectId`: bảng, cột và nhãn đều là tài sản của dự án cũ.
   * Để nguyên `listId` thì việc sẽ nằm trong một cột thuộc bảng khác — trạng
   * thái mà mọi truy vấn bảng đều lọc theo `boardId` sẽ không bao giờ trả về,
   * tức là việc biến mất khỏi cả hai dự án.
   *
   * Nhãn **không đi theo** việc: nhãn thuộc bảng, và bảng mới có bộ nhãn riêng.
   */
  private async moveToProject(
    task: Task,
    projectId: string,
  ): Promise<{ projectId: string; boardId: string; listId: null }> {
    const project = await this.projectAccess.requireWritableProject(
      task.assigneeId,
      projectId,
    );
    const board = await this.boardAccess.ensureBoard(
      task.assigneeId,
      project.id,
    );

    await this.taskRepository.setLabels(task.id, []);

    // `listId: null` = về Hộp thư đến của dự án mới, đúng chỗ người dùng sẽ đi
    // tìm nó.
    return { projectId: project.id, boardId: board.id, listId: null };
  }

  /** Soft delete, so `POST /tasks/:id/restore` can bring the task back. */
  async remove(user: JwtAccessPayload, id: string): Promise<void> {
    const task = await this.findOrThrow(id);
    this.assertCanAccess(task, user);
    await this.taskRepository.softDelete(id);
  }

  async getStats(
    user: JwtAccessPayload,
    query: TaskStatsQueryDto,
  ): Promise<TaskStatsResponseDto> {
    const assigneeId =
      isPrivileged(user.role) && query.assigneeId ? query.assigneeId : user.sub;

    // Thiếu `projectId` = thống kê cả tài khoản (§5.2) — trang tổng quan muốn
    // con số gộp, nên ở đây không cảnh báo như `list`.
    if (query.projectId) {
      await this.projectAccess.requireOwnProject(user.sub, query.projectId);
    }
    const projectId = query.projectId;

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
      this.taskRepository.countTotal(assigneeId, projectId),
      this.taskRepository.countCompleted(assigneeId, undefined, projectId),
      this.taskRepository.countCompleted(assigneeId, monthStart, projectId),
      this.taskRepository.countOnTimeCompleted(
        assigneeId,
        undefined,
        projectId,
      ),
      this.taskRepository.countOnTimeCompleted(
        assigneeId,
        monthStart,
        projectId,
      ),
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
    // Dự án lấy theo **người được giao**, không phải chủ hộp thư đã ingest ra
    // việc này: một mail có dòng "Giao cho: …" tạo việc cho người khác, và việc
    // đó phải nằm trong dự án của chính người phải làm nó. Bảng ở dòng dưới đã
    // theo đúng trục đó từ trước.
    const project = await this.projectAccess.resolveForAutomation(
      input.assigneeId,
    );

    // Auto-created work goes straight to the owner's Inbox (listId null), which
    // is exactly what `boardId` set + `listId` null means on the board screen.
    const board = await this.boardAccess.ensureBoard(
      input.assigneeId,
      project.id,
    );

    const task = await this.taskRepository.create({
      title: input.title,
      // HTML written by whoever sent the mail — sanitised before it is stored.
      description: RichTextUtil.sanitize(input.description),
      projectId: project.id,
      boardId: board.id,
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
      description: task.description,
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
    return DeadlineUtil.compute(task);
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
