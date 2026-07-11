import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import type { TaskRepository } from './repositories/task.repository';
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
    tenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function build() {
    const taskRepository = {
      create: jest.fn().mockResolvedValue(baseTask),
    } as unknown as TaskRepository;
    const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
    const service = new TasksService(taskRepository, eventEmitter);
    return { service, taskRepository, eventEmitter };
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
});
