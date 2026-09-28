import { Module } from '@nestjs/common';
import { ProjectsController } from './controllers/projects.controller';
import { ProjectRepository } from './repositories/project.repository';
import { ProjectAccessService } from './services/project-access.service';
import { ProjectsService } from './services/projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectRepository, ProjectAccessService, ProjectsService],
  // `tasks`, `mail-ingestion` và `auth` chỉ cần phần quyền + tra cứu. `board`
  // cần thêm `ProjectsService.list` để gộp danh sách dự án vào `/boards/me/full`.
  exports: [ProjectAccessService, ProjectsService],
})
export class ProjectsModule {}
