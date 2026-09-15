import { TaskStatus } from '../enums/task-status.enum';

export type DeadlineStatus = 'IN_PROGRESS' | 'ON_TIME' | 'LATE';

export class DeadlineUtil {
  /** Derived, never stored — the board and the legacy task screens must agree. */
  static compute(task: {
    status: string;
    deadline: Date | null;
    completedAt: Date | null;
  }): DeadlineStatus {
    if (task.status === TaskStatus.DONE) {
      if (!task.deadline || !task.completedAt) return 'ON_TIME';
      return task.completedAt <= task.deadline ? 'ON_TIME' : 'LATE';
    }
    if (task.deadline && task.deadline.getTime() < Date.now()) return 'LATE';
    return 'IN_PROGRESS';
  }
}
