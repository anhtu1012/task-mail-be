import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ThemePreferenceDto,
  UpdateThemeDto,
} from '../dto/theme-preference.dto';
import { ThemePreferenceService } from '../services/theme-preference.service';
import { THEME_RATE_LIMIT } from '../theme.constants';

@ApiTags('Preferences')
@ApiBearerAuth('access-token')
@Controller(API_ROUTES.PREFERENCES.ROOT)
@UseFilters(Validation422Filter)
// Cả GET cũng phải nâng trần: mức chung 20/phút là ngân sách dùng chung cho mọi
// endpoint chưa khai riêng, mà lần GET này rơi đúng lúc đăng nhập — thời điểm
// frontend bắn nhiều request nhất.
@Throttle({ default: { limit: THEME_RATE_LIMIT, ttl: 60_000 } })
export class ThemePreferenceController {
  constructor(private readonly service: ThemePreferenceService) {}

  @Get(API_ROUTES.PREFERENCES.THEME)
  @ApiOperation({
    summary: 'Giao diện của người đang đăng nhập (luôn 200, kể cả chưa lưu)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ThemePreferenceDto })
  get(
    @CurrentUser() user: RequestWithUser['user'],
  ): Promise<ThemePreferenceDto> {
    return this.service.get(user.sub);
  }

  @Put(API_ROUTES.PREFERENCES.THEME)
  @ApiOperation({ summary: 'Lưu giao diện (tạo mới hoặc ghi đè)' })
  @ApiResponse({ status: HttpStatus.OK, type: ThemePreferenceDto })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY })
  put(
    @CurrentUser() user: RequestWithUser['user'],
    @Body() dto: UpdateThemeDto,
  ): Promise<ThemePreferenceDto> {
    return this.service.put(user.sub, dto);
  }

  @Delete(API_ROUTES.PREFERENCES.THEME)
  @ApiOperation({
    summary: 'Khôi phục mặc định — 204 kể cả khi chưa có bản ghi',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestWithUser['user']): Promise<void> {
    return this.service.remove(user.sub);
  }
}
