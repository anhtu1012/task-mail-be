import { Module } from '@nestjs/common';
import { BoardModule } from '../board/board.module';
import { ProjectsModule } from '../projects/projects.module';
import { TaskTypesModule } from './task-types.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskRepository } from './repositories/task.repository';

@Module({
  imports: [BoardModule, ProjectsModule, TaskTypesModule],
  controllers: [TasksController],
  providers: [TasksService, TaskRepository],
  exports: [TasksService],
})
export class TasksModule {}
