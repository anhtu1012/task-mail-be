import { HttpStatus, Injectable } from '@nestjs/common';
import type { TaskType } from '../../generated/prisma/client';
import { TaskTypeRepository } from './repositories/task-type.repository';
import {
  CreateTaskTypeDto,
  UpdateTaskTypeDto,
} from './dto/task-type-request.dto';
import { NotFoundException } from '../../common/exceptions/not-found.exception';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../common/constants/error-codes.constants';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { CACHE_TTL, CacheKeys } from '../../infrastructure/cache/cache-keys';
import { TaskTypeResponseDto } from './dto/task-type-response.dto';

@Injectable()
export class TaskTypesService {
  constructor(
    private readonly taskTypeRepository: TaskTypeRepository,
    private readonly cache: CacheService,
  ) {}

  /** Danh mục dùng chung cho mọi người, chỉ admin sửa — đọc gần như luôn trúng cache. */
  findAll(): Promise<TaskTypeResponseDto[]> {
    return this.cache.wrap(CacheKeys.taskTypes(), CACHE_TTL.TASK_TYPES, () =>
      this.taskTypeRepository.findAll(),
    );
  }

  async findById(id: string): Promise<TaskType> {
    const taskType = await this.taskTypeRepository.findById(id);
    if (!taskType) {
      throw new NotFoundException(
        'Task type not found',
        ERROR_CODES.TASK_TYPE_NOT_FOUND,
      );
    }
    return taskType;
  }

  async create(dto: CreateTaskTypeDto): Promise<TaskType> {
    await this.assertNameFree(dto.name);
    return this.taskTypeRepository.create(dto);
  }

  async update(id: string, dto: UpdateTaskTypeDto): Promise<TaskType> {
    const current = await this.findById(id);
    if (dto.name !== undefined && dto.name !== current.name) {
      await this.assertNameFree(dto.name);
    }
    return this.taskTypeRepository.update(id, dto);
  }

  /**
   * `name` là `@unique` ở DB — để lọt xuống Prisma thì P2002 thành 500. Hai
   * admin tạo trùng cùng lúc vẫn có thể lọt, nhưng hiếm tới mức chấp nhận được.
   */
  private async assertNameFree(name: string): Promise<void> {
    if (await this.taskTypeRepository.findByName(name)) {
      throw new BusinessException(
        'Tên loại công việc đã tồn tại',
        ERROR_CODES.TASK_TYPE_NAME_TAKEN,
        HttpStatus.CONFLICT,
      );
    }
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.taskTypeRepository.delete(id);
  }
}
