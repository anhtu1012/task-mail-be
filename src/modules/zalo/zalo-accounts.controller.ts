import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ZaloLinkService } from './zalo-link.service';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';
import {
  ZaloAccountStatusResponseDto,
  ZaloLinkCodeResponseDto,
} from './dto/zalo-account-response.dto';
import { ZaloConfig } from '../../config/zalo.config';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestWithUser } from '../../common/types/request-with-user.type';

@ApiTags('Zalo Accounts')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.ZALO_ACCOUNTS.ROOT)
export class ZaloAccountsController {
  constructor(
    private readonly zaloLinkService: ZaloLinkService,
    private readonly zaloAccountRepository: ZaloAccountRepository,
    private readonly configService: ConfigService,
  ) {}

  @Post(API_ROUTES.ZALO_ACCOUNTS.LINK_CODE)
  @ApiOperation({ summary: 'Get a code to link a personal Zalo account by messaging the bot' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ZaloLinkCodeResponseDto })
  @HttpCode(HttpStatus.CREATED)
  async createLinkCode(
    @CurrentUser() user: RequestWithUser['user'],
  ): Promise<ZaloLinkCodeResponseDto> {
    const { code, expiresAt } = await this.zaloLinkService.createLinkCode(user.sub);
    const botProfileUrl = this.configService.get<ZaloConfig>('zalo')?.botProfileUrl ?? '';
    return { code, expiresAt, botProfileUrl };
  }

  @Get(API_ROUTES.ZALO_ACCOUNTS.ME)
  @ApiOperation({ summary: 'Check whether the current user has linked Zalo' })
  @ApiResponse({ status: HttpStatus.OK, type: ZaloAccountStatusResponseDto })
  async me(@CurrentUser() user: RequestWithUser['user']): Promise<ZaloAccountStatusResponseDto> {
    const account = await this.zaloAccountRepository.findByUserId(user.sub);
    return account ? { linked: true, linkedAt: account.linkedAt } : { linked: false };
  }

  @Delete(API_ROUTES.ZALO_ACCOUNTS.ME)
  @ApiOperation({ summary: 'Unlink the current user’s Zalo account' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestWithUser['user']): Promise<void> {
    const account = await this.zaloAccountRepository.findByUserId(user.sub);
    if (account) await this.zaloAccountRepository.delete(user.sub);
  }
}
