import { Module } from '@nestjs/common';
import { NotificationPreferenceController } from './controllers/notification-preference.controller';
import { ThemePreferenceController } from './controllers/theme-preference.controller';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { ThemePreferenceRepository } from './repositories/theme-preference.repository';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { ThemePreferenceService } from './services/theme-preference.service';

@Module({
  controllers: [ThemePreferenceController, NotificationPreferenceController],
  providers: [
    ThemePreferenceRepository,
    ThemePreferenceService,
    NotificationPreferenceRepository,
    NotificationPreferenceService,
  ],
  // Zalo đọc cài đặt để quyết định gửi gì, lúc nào.
  exports: [NotificationPreferenceService],
})
export class PreferencesModule {}
