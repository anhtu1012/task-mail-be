import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserSummaryDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.USERS.ROOT)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Danh sách người có thể được giao việc.
   *
   * CHỈ ADMIN. Người dùng thường không được nhìn danh bạ toàn hệ thống — họ
   * cũng không cần: `POST /tasks` bỏ qua `assigneeId` của họ và luôn giao việc
   * cho chính họ.
   *
   * Có endpoint này vì trước đó frontend không có cách nào biết ai là ai: ô
   * "Người thực hiện" ở form và bộ lọc buộc người dùng **gõ tay một UUID**.
   */
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get()
  @ApiOperation({ summary: 'Danh sách người dùng để giao việc (chỉ admin)' })
  @ApiResponse({ status: HttpStatus.OK, type: [UserSummaryDto] })
  findAssignable(): Promise<UserSummaryDto[]> {
    return this.usersService.findAssignable();
  }
}
