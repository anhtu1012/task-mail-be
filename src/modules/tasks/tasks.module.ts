import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskTypesController } from './task-types.controller';
import { TaskTypesService } from './task-types.service';
import { TaskRepository } from './repositories/task.repository';
import { TaskTypeRepository } from './repositories/task-type.repository';

@Module({
  controllers: [TasksController, TaskTypesController],
  providers: [TasksService, TaskRepository, TaskTypesService, TaskTypeRepository],
  exports: [TasksService],
})
export class TasksModule {}
