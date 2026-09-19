import { Module } from '@nestjs/common';
import { ProjectsController } from './controllers/projects.controller';
import { ProjectRepository } from './repositories/project.repository';
import { ProjectAccessService } from './services/project-access.service';
import { ProjectsService } from './services/projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectRepository, ProjectAccessService, ProjectsService],
  // `tasks`, `board`, `mail-ingestion` và `auth` chỉ cần phần quyền + tra cứu,
  // không cần tầng CRUD.
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
