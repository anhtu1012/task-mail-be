import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  QueryTaskDto,
  TaskStatsQueryDto,
  UpdateTaskDto,
} from './dto/task-request.dto';
import {
  PaginatedTaskResponseDto,
  TaskResponseDto,
} from './dto/task-response.dto';
import { TaskStatsResponseDto } from './dto/task-stats-response.dto';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestWithUser } from '../../common/types/request-with-user.type';
import { ParseObjectIdPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Tasks')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.TASKS.ROOT)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({
    summary: 'List tasks (own tasks for regular users, all for admins)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedTaskResponseDto })
  list(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: QueryTaskDto,
  ): Promise<PaginatedTaskResponseDto> {
    return this.tasksService.list(user, query);
  }

  @Get(API_ROUTES.TASKS.STATS)
  @ApiOperation({ summary: 'Get completion/performance stats' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskStatsResponseDto })
  getStats(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: TaskStatsQueryDto,
  ): Promise<TaskStatsResponseDto> {
    return this.tasksService.getStats(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by id' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  getById(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.getById(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskResponseDto })
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskResponseDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(user, id, dto);
  }

  @Patch(`:id/${API_ROUTES.TASKS.COMPLETE}`)
  @ApiOperation({ summary: 'Mark a task as completed now' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskResponseDto })
  complete(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.complete(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.tasksService.remove(user, id);
  }
}
