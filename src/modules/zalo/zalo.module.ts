import { Module } from '@nestjs/common';
import { ZaloAccountsController } from './zalo-accounts.controller';
import { ZaloBotController } from './zalo-bot.controller';
import { ZaloBotService } from './zalo-bot.service';
import { ZaloLinkService } from './zalo-link.service';
import { ZaloNotificationListener } from './zalo-notification.listener';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';
import { ZaloLinkCodeRepository } from './repositories/zalo-link-code.repository';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [ZaloAccountsController, ZaloBotController],
  providers: [
    ZaloBotService,
    ZaloLinkService,
    ZaloNotificationListener,
    ZaloAccountRepository,
    ZaloLinkCodeRepository,
  ],
})
export class ZaloModule {}
