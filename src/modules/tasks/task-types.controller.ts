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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TaskTypesService } from './task-types.service';
import {
  CreateTaskTypeDto,
  UpdateTaskTypeDto,
} from './dto/task-type-request.dto';
import { TaskTypeResponseDto } from './dto/task-type-response.dto';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/enums/role.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Task Types')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.TASK_TYPES.ROOT)
export class TaskTypesController {
  constructor(private readonly taskTypesService: TaskTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List available task types' })
  @ApiResponse({ status: HttpStatus.OK, type: [TaskTypeResponseDto] })
  findAll(): Promise<TaskTypeResponseDto[]> {
    return this.taskTypesService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a task type (admin only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TaskTypeResponseDto })
  create(@Body() dto: CreateTaskTypeDto): Promise<TaskTypeResponseDto> {
    return this.taskTypesService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a task type (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: TaskTypeResponseDto })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTaskTypeDto,
  ): Promise<TaskTypeResponseDto> {
    return this.taskTypesService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task type (admin only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseObjectIdPipe) id: string): Promise<void> {
    return this.taskTypesService.remove(id);
  }
}
