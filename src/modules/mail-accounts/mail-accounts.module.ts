import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailAccountsController } from './mail-accounts.controller';
import { MailAccountsService } from './mail-accounts.service';
import { MailAccountRepository } from './repositories/mail-account.repository';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MailAccountsController],
  providers: [MailAccountsService, MailAccountRepository],
  exports: [MailAccountsService, MailAccountRepository],
})
export class MailAccountsModule {}
