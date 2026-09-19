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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_ROUTES } from '../../../common/constants/api-routes.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-uuid.pipe';
import { RequestWithUser } from '../../../common/types/request-with-user.type';
import {
  ArchiveProjectDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from '../dto/project-request.dto';
import { ProjectDto, ProjectListDto } from '../dto/project-response.dto';
import { ProjectsService } from '../services/projects.service';

@ApiTags('Projects')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.PROJECTS.ROOT)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary: 'Dự án của người đang đăng nhập, kèm số việc mở / trễ hạn',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProjectListDto })
  list(
    @CurrentUser() user: RequestWithUser['user'],
    @Query() query: ListProjectsQueryDto,
  ): Promise<ProjectListDto> {
    return this.service.list(user.sub, query);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo dự án (bỏ trống code thì backend tự sinh)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ProjectDto })
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectDto> {
    return this.service.create(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Một dự án' })
  @ApiResponse({ status: HttpStatus.OK, type: ProjectDto })
  getById(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<ProjectDto> {
    return this.service.getById(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa dự án (description rỗng = xoá mô tả)' })
  @ApiResponse({ status: HttpStatus.OK, type: ProjectDto })
  update(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.service.update(user.sub, id, dto);
  }

  @Put(`:id/${API_ROUTES.PROJECTS.DEFAULT}`)
  @ApiOperation({
    summary: 'Đặt làm dự án mặc định (gỡ cờ ở các dự án khác)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProjectDto })
  setDefault(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<ProjectDto> {
    return this.service.setDefault(user.sub, id);
  }

  @Put(`:id/${API_ROUTES.PROJECTS.ARCHIVE}`)
  @ApiOperation({
    summary: 'Lưu trữ / mở lại. Lưu trữ không đụng vào việc trong dự án',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProjectDto })
  setArchived(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ArchiveProjectDto,
  ): Promise<ProjectDto> {
    return this.service.setArchived(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xoá hẳn — chỉ khi dự án không còn việc nào (kể cả đã xoá mềm)',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    return this.service.remove(user.sub, id);
  }
}
