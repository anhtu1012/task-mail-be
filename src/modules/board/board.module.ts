import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ProjectsModule } from '../projects/projects.module';
import {
  BoardLabelsController,
  BoardsController,
} from './controllers/boards.controller';
import { BoardListsController } from './controllers/board-lists.controller';
import { BoardCardsController } from './controllers/board-cards.controller';
import {
  ChecklistItemsController,
  ChecklistsController,
  TaskAttachmentsController,
  TaskNotesController,
} from './controllers/card-detail.controller';
import { BoardRepository } from './repositories/board.repository';
import { BoardCardRepository } from './repositories/board-card.repository';
import { CardDetailRepository } from './repositories/card-detail.repository';
import { BoardAccessService } from './services/board-access.service';
import { BoardService } from './services/board.service';
import { BoardListService } from './services/board-list.service';
import { BoardCardService } from './services/board-card.service';
import { BoardAgendaService } from './services/board-agenda.service';
import { CardDetailService } from './services/card-detail.service';
import { PositionService } from './services/position.service';
import { ActivityService } from './services/activity.service';

@Module({
  imports: [UsersModule, ProjectsModule],
  controllers: [
    BoardsController,
    BoardLabelsController,
    BoardListsController,
    BoardCardsController,
    ChecklistsController,
    ChecklistItemsController,
    TaskNotesController,
    TaskAttachmentsController,
  ],
  providers: [
    BoardRepository,
    BoardCardRepository,
    CardDetailRepository,
    BoardAccessService,
    BoardService,
    BoardListService,
    BoardCardService,
    BoardAgendaService,
    CardDetailService,
    PositionService,
    ActivityService,
  ],
  // TasksModule uses these to keep the legacy /tasks endpoints board-aware.
  exports: [BoardAccessService, BoardService, ActivityService],
})
export class BoardModule {}
