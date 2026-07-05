import { Injectable } from '@nestjs/common';
import type { TaskType } from '../../generated/prisma/client';
import { TaskTypeRepository } from './repositories/task-type.repository';
import { CreateTaskTypeDto, UpdateTaskTypeDto } from './dto/task-type-request.dto';
import { NotFoundException } from '../../common/exceptions/not-found.exception';

@Injectable()
export class TaskTypesService {
  constructor(private readonly taskTypeRepository: TaskTypeRepository) {}

  findAll(): Promise<TaskType[]> {
    return this.taskTypeRepository.findAll();
  }

  async findById(id: string): Promise<TaskType> {
    const taskType = await this.taskTypeRepository.findById(id);
    if (!taskType) throw new NotFoundException('Task type not found');
    return taskType;
  }

  create(dto: CreateTaskTypeDto): Promise<TaskType> {
    return this.taskTypeRepository.create(dto);
  }

  async update(id: string, dto: UpdateTaskTypeDto): Promise<TaskType> {
    await this.findById(id);
    return this.taskTypeRepository.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.taskTypeRepository.delete(id);
  }
}
