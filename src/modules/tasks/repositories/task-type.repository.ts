import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CacheService } from '../../../infrastructure/cache/cache.service';
import { CacheKeys } from '../../../infrastructure/cache/cache-keys';
import type { TaskType } from '../../../generated/prisma/client';

export type CreateTaskTypeInput = {
  name: string;
  color: string;
};

export type UpdateTaskTypeInput = Partial<CreateTaskTypeInput>;

@Injectable()
export class TaskTypeRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findAll(): Promise<TaskType[]> {
    return this.prisma.taskType.findMany({ orderBy: { createdAt: 'asc' } });
  }

  findById(id: string): Promise<TaskType | null> {
    return this.prisma.taskType.findUnique({ where: { id } });
  }

  async create(input: CreateTaskTypeInput): Promise<TaskType> {
    const created = await this.prisma.taskType.create({ data: input });
    await this.cache.invalidate(CacheKeys.taskTypes());
    return created;
  }

  async update(id: string, input: UpdateTaskTypeInput): Promise<TaskType> {
    const updated = await this.prisma.taskType.update({
      where: { id },
      data: input,
    });
    await this.cache.invalidate(CacheKeys.taskTypes());
    return updated;
  }

  async delete(id: string): Promise<TaskType> {
    const deleted = await this.prisma.taskType.delete({ where: { id } });
    await this.cache.invalidate(CacheKeys.taskTypes());
    return deleted;
  }
}
