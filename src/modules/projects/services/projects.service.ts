import { HttpStatus, Injectable } from '@nestjs/common';
import type { Project } from '../../../generated/prisma/client';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  ArchiveProjectDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from '../dto/project-request.dto';
import {
  ProjectDto,
  ProjectListDto,
  ProjectStatsDto,
} from '../dto/project-response.dto';
import {
  ProjectRepository,
  type ProjectStatsRow,
} from '../repositories/project.repository';
import { generateProjectCode } from '../project-code.util';
import { ProjectAccessService } from './project-access.service';
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  MAX_ACTIVE_PROJECTS_PER_USER,
} from '../project.constants';

/** Sắp theo tiếng Việt: "Đà Nẵng" phải đứng trước "Hà Nội", không sau "Zulu". */
const vietnameseCollator = new Intl.Collator('vi', { sensitivity: 'base' });

const conflict = (message: string, errorCode: string) =>
  new BusinessException(message, errorCode, HttpStatus.CONFLICT);

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly access: ProjectAccessService,
  ) {}

  async list(
    userId: string,
    query: ListProjectsQueryDto,
  ): Promise<ProjectListDto> {
    // Lưới an toàn cho tài khoản đăng nhập bằng Google và tài khoản có trước
    // migration: màn hình chọn dự án không bao giờ được rỗng.
    await this.access.ensureDefaultProject(userId);

    const projects = await this.repository.findManyByOwner(
      userId,
      query.includeArchived === true,
    );
    const stats = await this.repository.statsByProject(
      projects.map((project) => project.id),
      new Date(),
    );

    const items = projects
      .sort(byDefaultThenName)
      .map((project) => toDto(project, stats.get(project.id)));

    return { items, total: items.length };
  }

  async getById(userId: string, projectId: string): Promise<ProjectDto> {
    const project = await this.access.requireOwnProject(userId, projectId);
    const stats = await this.repository.statsByProject(
      [project.id],
      new Date(),
    );
    return toDto(project, stats.get(project.id));
  }

  async create(userId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    const activeCount = await this.repository.countActive(userId);
    if (activeCount >= MAX_ACTIVE_PROJECTS_PER_USER) {
      throw conflict(
        `Mỗi người tối đa ${MAX_ACTIVE_PROJECTS_PER_USER} dự án hoạt động. Hãy lưu trữ bớt.`,
        ERROR_CODES.PROJECT_LIMIT_REACHED,
      );
    }

    await this.assertNameFree(userId, dto.name);
    const code = await this.resolveCode(userId, dto.name, dto.code);

    // Dự án đầu tiên của một người **luôn** là mặc định, kể cả khi body gửi
    // `isDefault: false`: nếu không, người đó đăng nhập ở máy khác sẽ không có
    // dự án nào tự mở.
    const shouldBeDefault = activeCount === 0 || dto.isDefault === true;

    const created = await this.repository.create({
      ownerId: userId,
      code,
      name: dto.name,
      description: emptyToNull(dto.description),
      color: dto.color ?? DEFAULT_PROJECT_COLOR,
      icon: dto.icon ?? DEFAULT_PROJECT_ICON,
      isDefault: false,
    });

    // Gắn cờ trong transaction riêng thay vì đặt thẳng `isDefault: true` lúc
    // create: partial unique index từ chối trạng thái có hai dòng cùng mang cờ,
    // nên phải gỡ cái cũ trước.
    const project = shouldBeDefault
      ? await this.repository.setDefault(userId, created.id)
      : created;

    return toDto(project, undefined);
  }

  async update(
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    const project = await this.access.requireOwnProject(userId, projectId);

    if (dto.name !== undefined && dto.name !== project.name) {
      await this.assertNameFree(userId, dto.name);
    }
    if (dto.code !== undefined && dto.code !== project.code) {
      await this.assertCodeFree(userId, dto.code);
    }
    if (dto.archived === true && !project.archived) {
      await this.prepareForArchive(userId, project);
    }

    const updated = await this.repository.update(projectId, {
      name: dto.name,
      code: dto.code,
      // `undefined` = không gửi, giữ nguyên. `""` = xoá mô tả, lưu `null`.
      description:
        dto.description === undefined
          ? undefined
          : emptyToNull(dto.description),
      color: dto.color,
      icon: dto.icon,
      archived: dto.archived,
    });

    const stats = await this.repository.statsByProject([projectId], new Date());
    return toDto(updated, stats.get(projectId));
  }

  async setDefault(userId: string, projectId: string): Promise<ProjectDto> {
    const project = await this.access.requireOwnProject(userId, projectId);
    if (project.archived) {
      throw conflict(
        'Dự án đã lưu trữ, không đặt làm mặc định được',
        ERROR_CODES.PROJECT_ARCHIVED,
      );
    }

    const updated = await this.repository.setDefault(userId, projectId);
    const stats = await this.repository.statsByProject([projectId], new Date());
    return toDto(updated, stats.get(projectId));
  }

  async setArchived(
    userId: string,
    projectId: string,
    dto: ArchiveProjectDto,
  ): Promise<ProjectDto> {
    const project = await this.access.requireOwnProject(userId, projectId);

    if (dto.archived && !project.archived) {
      await this.prepareForArchive(userId, project);
    }

    const updated = await this.repository.update(projectId, {
      archived: dto.archived,
    });

    // Mở lại một dự án lúc người dùng không còn dự án mặc định nào (vì cái cũ
    // vừa bị lưu trữ) — trả cờ về đây, nếu không FE sẽ không có dự án nào để mở.
    if (!dto.archived && !(await this.repository.findDefault(userId))) {
      await this.repository.setDefault(userId, projectId);
    }

    const stats = await this.repository.statsByProject([projectId], new Date());
    const fresh = (await this.repository.findById(projectId)) ?? updated;
    return toDto(fresh, stats.get(projectId));
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const project = await this.access.requireOwnProject(userId, projectId);

    // Kể cả việc đã xoá mềm: thẻ trong thùng rác vẫn khôi phục được bằng
    // Ctrl+Z, nên nó vẫn tính là "dự án còn việc".
    const taskCount =
      await this.repository.countTasksIncludingDeleted(projectId);
    if (taskCount > 0) {
      throw conflict(
        'Dự án còn công việc. Hãy chuyển hoặc xoá hết việc trước, hoặc lưu trữ dự án.',
        ERROR_CODES.PROJECT_NOT_EMPTY,
      );
    }

    if (!project.archived && (await this.repository.countActive(userId)) <= 1) {
      throw conflict(
        'Không xoá được dự án hoạt động cuối cùng',
        ERROR_CODES.PROJECT_LAST_ONE,
      );
    }

    // Bảng/cột/nhãn của dự án đi theo bằng cascade ở tầng DB.
    await this.repository.deleteById(projectId);

    if (project.isDefault) {
      const next = await this.repository.findOldestActive(userId);
      if (next) await this.repository.setDefault(userId, next.id);
    }
  }

  // --- helpers --------------------------------------------------------------

  /**
   * Lưu trữ không đụng vào việc — chỉ ẩn dự án khỏi bộ chọn. Nhưng nó không
   * được để người dùng rơi vào trạng thái "không còn dự án nào mở được".
   */
  private async prepareForArchive(
    userId: string,
    project: Project,
  ): Promise<void> {
    if ((await this.repository.countActive(userId)) <= 1) {
      throw conflict(
        'Không lưu trữ được dự án hoạt động cuối cùng',
        ERROR_CODES.PROJECT_LAST_ONE,
      );
    }

    if (!project.isDefault) return;

    // Cờ mặc định phải rời khỏi dự án sắp bị ẩn, nếu không FE mở ứng dụng lên
    // sẽ trỏ vào một dự án không hiện trong danh sách.
    const next = await this.repository.findOldestActive(userId);
    const target = next && next.id !== project.id ? next : null;
    if (target) {
      await this.repository.setDefault(userId, target.id);
    } else {
      await this.repository.clearDefault(userId);
    }
  }

  private async resolveCode(
    userId: string,
    name: string,
    requested?: string,
  ): Promise<string> {
    if (requested) {
      await this.assertCodeFree(userId, requested);
      return requested;
    }
    const taken = await this.repository.takenCodes(userId);
    return generateProjectCode(name, taken);
  }

  private async assertCodeFree(userId: string, code: string): Promise<void> {
    if (await this.repository.findByCode(userId, code)) {
      throw conflict(
        `Mã dự án "${code}" đã được dùng`,
        ERROR_CODES.PROJECT_CODE_TAKEN,
      );
    }
  }

  private async assertNameFree(userId: string, name: string): Promise<void> {
    if (await this.repository.findByName(userId, name)) {
      throw conflict(
        `Tên dự án "${name}" đã được dùng`,
        ERROR_CODES.PROJECT_NAME_TAKEN,
      );
    }
  }
}

function byDefaultThenName(a: Project, b: Project): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return vietnameseCollator.compare(a.name, b.name);
}

function emptyToNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const ZERO_STATS: ProjectStatsDto = {
  totalTasks: 0,
  openTasks: 0,
  overdueTasks: 0,
  lastActivityAt: null,
};

function toDto(project: Project, stats?: ProjectStatsRow): ProjectDto {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    color: project.color,
    icon: project.icon,
    isDefault: project.isDefault,
    archived: project.archived,
    stats: stats ?? ZERO_STATS,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
