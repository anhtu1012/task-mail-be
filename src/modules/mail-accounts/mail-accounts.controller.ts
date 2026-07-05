import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MailAccountsService } from './mail-accounts.service';
import { ConnectUrlResponseDto, MailAccountResponseDto } from './dto/mail-account-response.dto';
import { API_ROUTES } from '../../common/constants/api-routes.constants';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestWithUser } from '../../common/types/request-with-user.type';
import { ParseObjectIdPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Mail Accounts')
@Controller(API_ROUTES.MAIL_ACCOUNTS.ROOT)
export class MailAccountsController {
  constructor(private readonly mailAccountsService: MailAccountsService) {}

  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: 'List the current user’s connected mail accounts' })
  @ApiResponse({ status: HttpStatus.OK, type: [MailAccountResponseDto] })
  list(@CurrentUser() user: RequestWithUser['user']): Promise<MailAccountResponseDto[]> {
    return this.mailAccountsService.list(user.sub);
  }

  @ApiBearerAuth('access-token')
  @Get(API_ROUTES.MAIL_ACCOUNTS.GOOGLE_CONNECT)
  @ApiOperation({ summary: 'Get the Google consent URL to connect a Gmail account' })
  @ApiResponse({ status: HttpStatus.OK, type: ConnectUrlResponseDto })
  connect(@CurrentUser() user: RequestWithUser['user']): ConnectUrlResponseDto {
    return { url: this.mailAccountsService.getConnectUrl(user.sub) };
  }

  @Public()
  @Get(API_ROUTES.MAIL_ACCOUNTS.GOOGLE_CALLBACK)
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.mailAccountsService.handleCallback(code, state);
    res
      .status(HttpStatus.OK)
      .send('<html><body>Đã kết nối Gmail thành công. Bạn có thể đóng tab này.</body></html>');
  }

  @ApiBearerAuth('access-token')
  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect a mail account' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: RequestWithUser['user'],
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<void> {
    await this.mailAccountsService.remove(user, id);
  }
}
