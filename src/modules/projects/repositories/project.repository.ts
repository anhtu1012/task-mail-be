import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { Project } from '../../../generated/prisma/client';
import { TaskStatus } from '../../../generated/prisma/enums';

export type CreateProjectInput = {
  ownerId: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  isDefault: boolean;
};

export type UpdateProjectInput = {
  code?: string;
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  archived?: boolean;
};

export type ProjectStatsRow = {
  totalTasks: number;
  openTasks: number;
  overdueTasks: number;
  lastActivityAt: Date | null;
};

const CLOSED_STATUSES = [TaskStatus.DONE, TaskStatus.CANCELLED];

@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Không `orderBy` ở đây: thứ tự (mặc định lên đầu, còn lại theo tên tiếng
   * Việt) được sắp ở tầng service bằng `Intl.Collator('vi')`. Postgres của
   * Supabase chạy collation `en_US.utf8`, xếp "Đà Nẵng" sau "Zulu".
   */
  findManyByOwner(
    ownerId: string,
    includeArchived: boolean,
  ): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { ownerId, ...(includeArchived ? {} : { archived: false }) },
    });
  }

  findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } });
  }

  findDefault(ownerId: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: { ownerId, isDefault: true },
    });
  }

  /** Dự phòng khi không có dự án mặc định — dự án hoạt động cũ nhất. */
  findOldestActive(ownerId: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: { ownerId, archived: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  countActive(ownerId: string): Promise<number> {
    return this.prisma.project.count({ where: { ownerId, archived: false } });
  }

  findByCode(ownerId: string, code: string): Promise<Project | null> {
    return this.prisma.project.findUnique({
      where: { ownerId_code: { ownerId, code } },
    });
  }

  findByName(ownerId: string, name: string): Promise<Project | null> {
    return this.prisma.project.findUnique({
      where: { ownerId_name: { ownerId, name } },
    });
  }

  /** Mọi mã đang dùng của một người — để sinh mã mới không trùng trong một lượt. */
  async takenCodes(ownerId: string): Promise<Set<string>> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId },
      select: { code: true },
    });
    return new Set(rows.map((row) => row.code));
  }

  create(input: CreateProjectInput): Promise<Project> {
    return this.prisma.project.create({ data: input });
  }

  update(id: string, data: UpdateProjectInput): Promise<Project> {
    return this.prisma.project.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.project.delete({ where: { id } });
  }

  /**
   * Việc còn lại trong dự án, **kể cả đã xoá mềm**: `DELETE /projects/:id` chỉ
   * cho phép khi dự án rỗng hoàn toàn, còn thẻ trong thùng rác vẫn khôi phục
   * được bằng Ctrl+Z nên nó vẫn tính là "còn việc".
   */
  countTasksIncludingDeleted(projectId: string): Promise<number> {
    return this.prisma.task.count({ where: { projectId } });
  }

  /**
   * Gắn cờ mặc định cho một dự án và gỡ ở mọi dự án khác của cùng người, trong
   * một transaction.
   *
   * Gỡ **trước** rồi mới gắn: partial unique index
   * `projects_one_default_per_owner` sẽ từ chối trạng thái trung gian có hai
   * dòng cùng `is_default = true`.
   */
  async setDefault(ownerId: string, projectId: string): Promise<Project> {
    const [, project] = await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { ownerId, isDefault: true, NOT: { id: projectId } },
        data: { isDefault: false },
      }),
      this.prisma.project.update({
        where: { id: projectId },
        data: { isDefault: true },
      }),
    ]);
    return project;
  }

  async clearDefault(ownerId: string): Promise<void> {
    await this.prisma.project.updateMany({
      where: { ownerId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /**
   * Ba con số + mốc hoạt động cho mọi dự án trong **ba** truy vấn gộp, không
   * phải ba truy vấn mỗi dự án: màn hình chọn dự án vẽ tất cả thẻ cùng lúc và
   * trần rate limit là 20 req/phút.
   */
  async statsByProject(
    projectIds: string[],
    now: Date,
  ): Promise<Map<string, ProjectStatsRow>> {
    const empty = (): ProjectStatsRow => ({
      totalTasks: 0,
      openTasks: 0,
      overdueTasks: 0,
      lastActivityAt: null,
    });

    const result = new Map<string, ProjectStatsRow>(
      projectIds.map((id) => [id, empty()]),
    );
    if (projectIds.length === 0) return result;

    const scope = { projectId: { in: projectIds }, deletedAt: null };

    const [totals, open, overdue] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: scope,
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: { ...scope, status: { notIn: CLOSED_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: {
          ...scope,
          status: { notIn: CLOSED_STATUSES },
          deadline: { lt: now },
        },
        _count: { _all: true },
      }),
    ]);

    for (const row of totals) {
      const stats = result.get(row.projectId) ?? empty();
      stats.totalTasks = row._count._all;
      stats.lastActivityAt = row._max.updatedAt;
      result.set(row.projectId, stats);
    }
    for (const row of open) {
      const stats = result.get(row.projectId) ?? empty();
      stats.openTasks = row._count._all;
      result.set(row.projectId, stats);
    }
    for (const row of overdue) {
      const stats = result.get(row.projectId) ?? empty();
      stats.overdueTasks = row._count._all;
      result.set(row.projectId, stats);
    }

    return result;
  }
}
