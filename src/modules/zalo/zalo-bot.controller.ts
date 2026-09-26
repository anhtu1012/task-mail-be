import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ZaloBotService } from './zalo-bot.service';
import { ZaloBroadcastService } from './zalo-broadcast.service';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';
import {
  ZaloBroadcastDto,
  ZaloBroadcastResponseDto,
} from './dto/zalo-broadcast.dto';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/enums/role.enum';
import { RequestWithUser } from '../../common/types/request-with-user.type';

@ApiTags('Zalo Bot (Admin)')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller(API_ROUTES.ZALO_BOT.ROOT)
export class ZaloBotController {
  constructor(
    private readonly zaloBotService: ZaloBotService,
    private readonly zaloBroadcastService: ZaloBroadcastService,
    private readonly zaloAccountRepository: ZaloAccountRepository,
  ) {}

  @Get(API_ROUTES.ZALO_BOT.STATUS)
  @ApiOperation({
    summary: 'Check whether the Zalo bot token is valid and reachable',
  })
  @ApiResponse({ status: HttpStatus.OK })
  async status(): Promise<{
    connected: boolean;
    botName?: string;
    linkedUsers: number;
  }> {
    const [me, linkedUsers] = await Promise.all([
      this.zaloBotService.getMe(),
      this.zaloAccountRepository.count(),
    ]);
    return me
      ? { connected: true, botName: me.account_name, linkedUsers }
      : { connected: false, linkedUsers };
  }

  @Post(API_ROUTES.ZALO_BOT.BROADCAST)
  @ApiOperation({
    summary:
      'Send a system announcement to every user who linked Zalo (not stored)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ZaloBroadcastResponseDto })
  @HttpCode(HttpStatus.OK)
  broadcast(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: ZaloBroadcastDto,
  ): Promise<ZaloBroadcastResponseDto> {
    return this.zaloBroadcastService.broadcast(dto.message.trim(), {
      testOnly: dto.testOnly,
      requesterId: user.sub,
    });
  }
}
