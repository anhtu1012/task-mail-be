import { Module } from '@nestjs/common';
import { MailIngestionService } from './mail-ingestion.service';
import { MailAccountsModule } from '../mail-accounts/mail-accounts.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [MailAccountsModule, TasksModule],
  providers: [MailIngestionService],
})
export class MailIngestionModule {}
