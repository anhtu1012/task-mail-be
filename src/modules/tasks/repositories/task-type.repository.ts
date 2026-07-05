import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { TaskType } from '../../../generated/prisma/client';

export type CreateTaskTypeInput = {
  name: string;
  color: string;
};

export type UpdateTaskTypeInput = Partial<CreateTaskTypeInput>;

@Injectable()
export class TaskTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<TaskType[]> {
    return this.prisma.taskType.findMany({ orderBy: { createdAt: 'asc' } });
  }

  findById(id: string): Promise<TaskType | null> {
    return this.prisma.taskType.findUnique({ where: { id } });
  }

  create(input: CreateTaskTypeInput): Promise<TaskType> {
    return this.prisma.taskType.create({ data: input });
  }

  update(id: string, input: UpdateTaskTypeInput): Promise<TaskType> {
    return this.prisma.taskType.update({ where: { id }, data: input });
  }

  delete(id: string): Promise<TaskType> {
    return this.prisma.taskType.delete({ where: { id } });
  }
}
