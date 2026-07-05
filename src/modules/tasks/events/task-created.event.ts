import { TaskPriority } from '../../../common/enums/task-priority.enum';

export const TASK_CREATED_EVENT = 'task.created';

export type TaskCreatedEvent = {
  id: string;
  assigneeId: string;
  title: string;
  priority: TaskPriority;
  deadline?: Date | null;
};
