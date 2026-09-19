import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Project } from '../../../generated/prisma/client';
import { ERROR_CODES } from '../../../common/constants/error-codes.constants';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { NotFoundException } from '../../../common/exceptions/not-found.exception';
import { ProjectRepository } from '../repositories/project.repository';
import {
  DEFAULT_PROJECT_CODE,
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_NAME,
} from '../project.constants';

/**
 * Quyền và tra cứu dự án — phần mà `tasks`, `board` và `mail-ingestion` dùng
 * chung. Tách khỏi `ProjectsService` (vốn chỉ phục vụ controller) để các module
 * kia nhập được mà không kéo theo cả tầng CRUD.
 *
 * Nguyên tắc một câu: **dự án thuộc về người gọi, hoặc nó không tồn tại**. Mọi
 * trường hợp khác trả 404 chứ không 403 — 403 xác nhận id đó có thật, đủ để dò.
 */
@Injectable()
export class ProjectAccessService {
  private readonly logger = new Logger(ProjectAccessService.name);

  constructor(private readonly repository: ProjectRepository) {}

  /** Dự án theo id — chỉ khi nó là của người gọi. */
  async requireOwnProject(userId: string, projectId: string): Promise<Project> {
    const project = await this.repository.findById(projectId);
    if (!project || project.ownerId !== userId) {
      throw new NotFoundException(
        'Không tìm thấy dự án',
        ERROR_CODES.PROJECT_NOT_FOUND,
      );
    }
    return project;
  }

  /** Như trên, cộng thêm: dự án đã lưu trữ thì không nhận việc mới. */
  async requireWritableProject(
    userId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.requireOwnProject(userId, projectId);
    if (project.archived) {
      throw new BusinessException(
        'Dự án đã lưu trữ, không thêm việc mới được',
        ERROR_CODES.PROJECT_ARCHIVED,
        HttpStatus.CONFLICT,
      );
    }
    return project;
  }

  /**
   * Dự án mặc định của một người, tạo "Công việc chung" nếu chưa có.
   *
   * Cùng khuôn với `BoardAccessService.ensureBoard`, và vì cùng lý do: tài
   * khoản đăng nhập bằng Google, tài khoản có trước migration, và tài khoản mà
   * `RegisterHandler` tạo hụt đều phải tự lành ở lần chạm đầu tiên thay vì
   * dựng lỗi trước mặt người dùng.
   */
  async ensureDefaultProject(userId: string): Promise<Project> {
    const preferred = await this.repository.findDefault(userId);
    if (preferred && !preferred.archived) return preferred;

    // Có dự án nhưng không cái nào dùng được làm mặc định — hoặc cờ mặc định
    // nằm trên một dự án đã lưu trữ, hoặc không dự án nào mang cờ. Nhận cái
    // hoạt động cũ nhất thay vì đẻ thêm một "Công việc chung" thứ hai.
    const active = await this.repository.findOldestActive(userId);
    if (active) return this.repository.setDefault(userId, active.id);

    // Không còn dự án hoạt động nào. "Công việc chung" cũ (đang lưu trữ) được
    // dựng dậy thay vì tạo bản mới: `@@unique([ownerId, code])` sẽ chặn bản
    // mới, và người dùng nhận lại đúng dữ liệu cũ của mình.
    const archivedDefault = await this.repository.findByCode(
      userId,
      DEFAULT_PROJECT_CODE,
    );
    if (archivedDefault) {
      await this.repository.update(archivedDefault.id, { archived: false });
      return this.repository.setDefault(userId, archivedDefault.id);
    }

    try {
      return await this.repository.create({
        ownerId: userId,
        code: DEFAULT_PROJECT_CODE,
        name: DEFAULT_PROJECT_NAME,
        description: null,
        color: DEFAULT_PROJECT_COLOR,
        icon: DEFAULT_PROJECT_ICON,
        isDefault: true,
      });
    } catch {
      // Hai request đầu tiên chạy song song sẽ đụng `@@unique([ownerId, code])`
      // hoặc partial index mặc định; bên thua chỉ việc đọc lại bản bên thắng
      // vừa tạo.
      const created =
        (await this.repository.findDefault(userId)) ??
        (await this.repository.findByCode(userId, DEFAULT_PROJECT_CODE));
      if (!created) {
        throw new NotFoundException(
          'Không tìm thấy dự án',
          ERROR_CODES.PROJECT_NOT_FOUND,
        );
      }
      return created;
    }
  }

  /**
   * Dự án cho một việc tạo qua HTTP (§5.3):
   * 1. body có `projectId` → dùng nó (sau khi kiểm chủ sở hữu và chưa lưu trữ);
   * 2. không có → dự án mặc định của người gọi;
   * 3. chưa có dự án nào → tự tạo "Công việc chung".
   *
   * Nhánh 3 là lý do endpoint này không bao giờ trả 400 "hãy tạo dự án trước":
   * tài khoản mới đã được `RegisterHandler` tạo sẵn dự án, và nếu vì lý do gì
   * đó chưa có thì tạo ngay ở đây vẫn đúng ý người dùng hơn là chặn họ lại.
   */
  async resolveForNewTask(
    userId: string,
    requestedProjectId?: string,
  ): Promise<Project> {
    if (requestedProjectId) {
      return this.requireWritableProject(userId, requestedProjectId);
    }
    return this.ensureDefaultProject(userId);
  }

  /**
   * Dự án để **đọc** — như {@link resolveForNewTask} nhưng không chặn dự án đã
   * lưu trữ. Lưu trữ chỉ ẩn dự án khỏi bộ chọn; dữ liệu còn nguyên và người
   * dùng vẫn phải xem lại được.
   */
  async resolveForRead(
    userId: string,
    requestedProjectId?: string,
  ): Promise<Project> {
    if (requestedProjectId) {
      return this.requireOwnProject(userId, requestedProjectId);
    }
    return this.ensureDefaultProject(userId);
  }

  /**
   * Dự án cho một việc do hệ thống sinh ra (hiện chỉ có Gmail ingestion).
   *
   * **Chốt theo người được giao, không phải chủ hộp thư.** Mail có dòng
   * "Giao cho: nguoikhac@cty.com" tạo ra việc của người khác
   * (`MailIngestionService.resolveAssigneeId`), và bảng cũng đã gắn theo
   * assignee. Nhét việc đó vào dự án của chủ hộp thư sẽ tạo ra một hàng vi phạm
   * chính bất biến "dự án của một việc luôn thuộc người phải làm việc đó" —
   * người được giao sẽ không thấy việc của mình ở bất kỳ dự án nào.
   *
   * Dự án mặc định đang lưu trữ thì lùi về dự án hoạt động cũ nhất; không còn
   * dự án hoạt động nào thì tạo mới. **Không có nhánh nào bỏ qua email** —
   * người dùng không biết email của họ bị nuốt.
   */
  async resolveForAutomation(assigneeId: string): Promise<Project> {
    // Đọc cờ mặc định **trước**: `ensureDefaultProject` có thể tự dời cờ sang
    // dự án khác, và sau đó thì không còn phân biệt được đã đi đường vòng hay
    // chưa.
    const preferred = await this.repository.findDefault(assigneeId);
    const project = await this.ensureDefaultProject(assigneeId);

    // Ghi log khi phải đi đường vòng: người dùng lưu trữ đúng dự án mặc định
    // rồi thấy việc từ mail rơi vào chỗ khác sẽ đi hỏi, và đây là dấu vết duy
    // nhất giải thích được.
    if (preferred && preferred.id !== project.id) {
      this.logger.warn(
        `[Projects] Dự án mặc định của user ${assigneeId} không dùng được; ` +
          `việc tạo tự động rơi vào ${project.code}.`,
      );
    }
    return project;
  }
}
