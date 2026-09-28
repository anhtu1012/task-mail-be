import { Module } from '@nestjs/common';
import { TaskTypesController } from './task-types.controller';
import { TaskTypesService } from './task-types.service';
import { TaskTypeRepository } from './repositories/task-type.repository';

/**
 * Tách khỏi `TasksModule` để `BoardModule` gộp được task types vào
 * `/boards/me/full`: `TasksModule` đã import `BoardModule`, nên chiều ngược lại
 * sẽ thành vòng phụ thuộc.
 */
@Module({
  controllers: [TaskTypesController],
  providers: [TaskTypesService, TaskTypeRepository],
  exports: [TaskTypesService],
})
export class TaskTypesModule {}
