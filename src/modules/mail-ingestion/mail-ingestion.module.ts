import { Module } from '@nestjs/common';
import { MailIngestionService } from './mail-ingestion.service';
import { MailAccountsModule } from '../mail-accounts/mail-accounts.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [MailAccountsModule, TasksModule, UsersModule],
  providers: [MailIngestionService],
})
export class MailIngestionModule {}
