import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import type { TaskRepository } from './repositories/task.repository';
import type { BoardAccessService } from '../board/services/board-access.service';
import type { BoardService } from '../board/services/board.service';
import type { ActivityService } from '../board/services/activity.service';
import type { ProjectAccessService } from '../projects/services/project-access.service';
import { Role } from '../../common/enums/role.enum';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { TASK_CREATED_EVENT } from './events/task-created.event';

// TaskRepository is imported as a type only, so this test never pulls in
// PrismaService/the generated Prisma client — plain construction, no Nest DI.
describe('TasksService', () => {
  const baseTask = {
    id: 'task-1',
    seq: 1,
    title: 'Việc cần làm',
    description: null,
    note: null,
    taskTypeId: null,
    category: 'WORK',
    priority: TaskPriority.NORMAL,
    status: TaskStatus.TODO,
    attachments: [],
    assigneeId: 'user-1',
    creatorId: 'user-1',
    assignedAt: null,
    deadline: null,
    completedAt: null,
    externalSyncStatus: null,
    externalRef: null,
    sourceMailAccountId: null,
    deadlineNotifiedAt: null,
    projectId: 'project-1',
    tenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function build() {
    const taskRepository = {
      create: jest.fn().mockResolvedValue(baseTask),
    } as unknown as TaskRepository;
    const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
    const boardAccess = {
      ensureBoard: jest.fn().mockResolvedValue({ id: 'board-1' }),
    } as unknown as BoardAccessService;
    const boardService = {
      assertLabelsInBoard: jest.fn().mockResolvedValue(undefined),
    } as unknown as BoardService;
    const activityService = {
      record: jest.fn().mockResolvedValue(undefined),
      dueChanged: jest.fn().mockReturnValue('Đổi hạn'),
    } as unknown as ActivityService;
    const projectAccess = {
      resolveForNewTask: jest.fn().mockResolvedValue({ id: 'project-1' }),
      resolveForAutomation: jest.fn().mockResolvedValue({ id: 'project-1' }),
      requireOwnProject: jest.fn().mockResolvedValue({ id: 'project-1' }),
    } as unknown as ProjectAccessService;
    const service = new TasksService(
      taskRepository,
      eventEmitter,
      boardAccess,
      boardService,
      activityService,
      projectAccess,
    );
    return {
      service,
      taskRepository,
      eventEmitter,
      boardAccess,
      activityService,
      projectAccess,
    };
  }

  it('emits task.created after creating a task via the API path', async () => {
    const { service, eventEmitter } = build();
    const user = { sub: 'user-1', email: 'a@b.com', role: Role.USER };

    await service.create(user, { title: 'Việc cần làm' });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      TASK_CREATED_EVENT,
      expect.objectContaining({
        id: 'task-1',
        assigneeId: 'user-1',
        title: 'Việc cần làm',
      }),
    );
  });

  it('emits task.created after creating a task via createSystemTask', async () => {
    const { service, eventEmitter } = build();

    await service.createSystemTask({
      assigneeId: 'user-1',
      title: 'Việc cần làm',
      externalRef: 'gmail:1',
      externalSyncStatus: 'IMPORTED_FROM_GMAIL',
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      TASK_CREATED_EVENT,
      expect.objectContaining({ id: 'task-1', assigneeId: 'user-1' }),
    );
  });

  it('defaults category to WORK and assignedAt to now for tasks created from mail', async () => {
    const { service, taskRepository } = build();

    await service.createSystemTask({
      assigneeId: 'user-1',
      title: 'Việc cần làm',
      externalRef: 'gmail:1',
      externalSyncStatus: 'IMPORTED_FROM_GMAIL',
    });

    expect(taskRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'WORK',
        assignedAt: expect.any(Date),
      }),
    );
  });

  it('uses the provided assignedAt (e.g. the email received date) when given', async () => {
    const { service, taskRepository } = build();
    const receivedAt = new Date('2026-01-01T00:00:00Z');

    await service.createSystemTask({
      assigneeId: 'user-1',
      title: 'Việc cần làm',
      externalRef: 'gmail:1',
      externalSyncStatus: 'IMPORTED_FROM_GMAIL',
      assignedAt: receivedAt,
    });

    expect(taskRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ assignedAt: receivedAt }),
    );
  });

  // Mail có dòng "Giao cho: …" tạo việc cho người khác chủ hộp thư. Dự án phải
  // lấy theo người được giao, nếu không việc nằm trong dự án của người A mà
  // người B mới là người phải làm — và người B không thấy nó ở đâu cả.
  it('resolves the project from the assignee for mail-created tasks', async () => {
    const { service, taskRepository, projectAccess, boardAccess } = build();

    await service.createSystemTask({
      assigneeId: 'assignee-9',
      title: 'Việc từ mail',
      externalRef: 'gmail:1',
      externalSyncStatus: 'IMPORTED_FROM_GMAIL',
    });

    expect(projectAccess.resolveForAutomation).toHaveBeenCalledWith(
      'assignee-9',
    );
    expect(boardAccess.ensureBoard).toHaveBeenCalledWith(
      'assignee-9',
      'project-1',
    );
    expect(taskRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeId: 'assignee-9',
        projectId: 'project-1',
      }),
    );
  });

  // Cùng bất biến, nhánh HTTP: admin gán việc cho nhân viên thì dự án là của
  // nhân viên, không phải của admin đang bấm nút.
  it('resolves the project from the assignee, not the caller, on POST /tasks', async () => {
    const { service, projectAccess } = build();
    const admin = { sub: 'admin-1', email: 'a@b.com', role: Role.ADMIN };

    await service.create(admin, {
      title: 'Việc giao xuống',
      assigneeId: 'staff-2',
    });

    expect(projectAccess.resolveForNewTask).toHaveBeenCalledWith(
      'staff-2',
      undefined,
    );
  });
});
