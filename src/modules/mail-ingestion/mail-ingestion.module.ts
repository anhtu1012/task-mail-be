import { Module } from '@nestjs/common';
import { MailIngestionService } from './mail-ingestion.service';
import { MailAccountsModule } from '../mail-accounts/mail-accounts.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { ZaloModule } from '../zalo/zalo.module';

@Module({
  imports: [MailAccountsModule, TasksModule, UsersModule, ZaloModule],
  providers: [MailIngestionService],
})
export class MailIngestionModule {}
