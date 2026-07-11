import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ZaloBotService } from './zalo-bot.service';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Zalo Bot (Admin)')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller(API_ROUTES.ZALO_BOT.ROOT)
export class ZaloBotController {
  constructor(private readonly zaloBotService: ZaloBotService) {}

  @Get(API_ROUTES.ZALO_BOT.STATUS)
  @ApiOperation({
    summary: 'Check whether the Zalo bot token is valid and reachable',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async status(): Promise<{ connected: boolean; botName?: string }> {
    const me = await this.zaloBotService.getMe();
    return me
      ? { connected: true, botName: me.account_name }
      : { connected: false };
  }
}
