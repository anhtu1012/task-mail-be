import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Put,
  UseFilters,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { API_ROUTES } from '../../../common/constants/api-routes.constants';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Validation422Filter } from '../../../common/exceptions/validation-422.filter';
import { RequestWithUser } from '../../../common/types/request-with-user.type';
import {
  NotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from '../dto/notification-preference.dto';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { NOTIFICATION_RATE_LIMIT } from '../notification.constants';

/** Cùng hợp đồng với `/me/preferences/theme`: GET luôn 200, lỗi body là 422. */
@ApiTags('Preferences')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.PREFERENCES.ROOT)
@UseFilters(Validation422Filter)
@Throttle({ default: { limit: NOTIFICATION_RATE_LIMIT, ttl: 60_000 } })
export class NotificationPreferenceController {
  constructor(private readonly service: NotificationPreferenceService) {}

  @Get(API_ROUTES.PREFERENCES.NOTIFICATIONS)
  @ApiOperation({
    summary: 'Cài đặt thông báo Zalo (luôn 200, kể cả chưa lưu)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: NotificationPreferenceDto })
  get(
    @CurrentUser() user: RequestWithUser['user'],
  ): Promise<NotificationPreferenceDto> {
    return this.service.get(user.sub);
  }

  @Put(API_ROUTES.PREFERENCES.NOTIFICATIONS)
  @ApiOperation({ summary: 'Lưu cài đặt thông báo Zalo (ghi đè toàn bộ)' })
  @ApiResponse({ status: HttpStatus.OK, type: NotificationPreferenceDto })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY })
  put(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    return this.service.put(user.sub, dto);
  }
}
