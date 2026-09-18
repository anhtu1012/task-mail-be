import { Module } from '@nestjs/common';
import { ThemePreferenceController } from './controllers/theme-preference.controller';
import { ThemePreferenceRepository } from './repositories/theme-preference.repository';
import { ThemePreferenceService } from './services/theme-preference.service';

@Module({
  controllers: [ThemePreferenceController],
  providers: [ThemePreferenceRepository, ThemePreferenceService],
})
export class PreferencesModule {}
