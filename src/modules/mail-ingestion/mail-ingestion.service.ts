import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { gmail_v1, google } from 'googleapis';
import type { MailAccount } from '../../generated/prisma/client';
import { MailAccountRepository } from '../mail-accounts/repositories/mail-account.repository';
import { MailAccountsService } from '../mail-accounts/mail-accounts.service';
import { TasksService } from '../tasks/tasks.service';
import { MailConfig } from '../../config/mail.config';
import { SecurityConfig } from '../../config/security.config';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { TaskCategory } from '../../common/enums/task-category.enum';
import { parseTaskMail } from './parsers/task-mail.parser';

const EXTERNAL_SYNC_STATUS = 'IMPORTED_FROM_GMAIL';

function extractPlainText(part?: gmail_v1.Schema$MessagePart): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8');
  }
  for (const child of part.parts ?? []) {
    const text = extractPlainText(child);
    if (text) return text;
  }
  return '';
}

function extractSubject(payload?: gmail_v1.Schema$MessagePart): string {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '';
}

function extractAttachmentFilenames(part?: gmail_v1.Schema$MessagePart): string[] {
  if (!part) return [];
  const names: string[] = [];
  if (part.filename && part.body?.attachmentId) names.push(part.filename);
  for (const child of part.parts ?? []) {
    names.push(...extractAttachmentFilenames(child));
  }
  return names;
}

@Injectable()
export class MailIngestionService {
  private readonly logger = new Logger(MailIngestionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mailAccountRepository: MailAccountRepository,
    private readonly mailAccountsService: MailAccountsService,
    private readonly tasksService: TasksService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollMailAccounts(): Promise<void> {
    const accounts = await this.mailAccountRepository.findAll();
    for (const account of accounts) {
      await this.pollAccount(account);
    }
  }

  private async pollAccount(account: MailAccount): Promise<void> {
    try {
      const prefix = this.configService.get<MailConfig>('mail')?.taskSubjectPrefix ?? '[TASK]';
      const key = this.configService.getOrThrow<SecurityConfig>('security').tokenEncryptionKey;

      const client = this.mailAccountsService.buildOAuthClient();
      client.setCredentials({
        access_token: EncryptionUtil.decrypt(account.accessToken, key),
        refresh_token: EncryptionUtil.decrypt(account.refreshToken, key),
        expiry_date: account.tokenExpiresAt.getTime(),
      });
      client.on('tokens', (tokens) => {
        this.mailAccountRepository
          .updateTokens(account.id, {
            accessToken: EncryptionUtil.encrypt(tokens.access_token ?? '', key),
            refreshToken: tokens.refresh_token
              ? EncryptionUtil.encrypt(tokens.refresh_token, key)
              : undefined,
            tokenExpiresAt: new Date(tokens.expiry_date ?? Date.now()),
          })
          .catch((error) => this.logger.error(`Failed to persist refreshed tokens for ${account.email}`, error));
      });

      const gmail = google.gmail({ version: 'v1', auth: client });
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        q: `is:unread subject:(${prefix})`,
      });

      for (const message of data.messages ?? []) {
        if (message.id) await this.processMessage(gmail, message.id, prefix, account.userId);
      }
    } catch (error) {
      this.logger.error(`Mail ingestion cycle failed for account ${account.email}`, error as Error);
    }
  }

  private async processMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
    subjectPrefix: string,
    assigneeId: string,
  ): Promise<void> {
    try {
      const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const subject = extractSubject(data.payload);
      const bodyText = extractPlainText(data.payload);
      const parsedTask = parseTaskMail(subject, bodyText, subjectPrefix);

      if (parsedTask) {
        const externalRef = `gmail:${messageId}`;
        const existing = await this.tasksService.findByExternalRef(externalRef);
        if (!existing) {
          const receivedAt = data.internalDate ? new Date(Number(data.internalDate)) : new Date();
          const attachments = [
            ...parsedTask.attachments,
            ...extractAttachmentFilenames(data.payload),
          ];

          await this.tasksService.createSystemTask({
            assigneeId,
            title: parsedTask.title,
            description: parsedTask.description,
            deadline: parsedTask.deadline,
            priority: parsedTask.priority,
            category: TaskCategory.WORK,
            attachments,
            assignedAt: receivedAt,
            externalRef,
            externalSyncStatus: EXTERNAL_SYNC_STATUS,
          });
          this.logger.log(`Created task from mail: ${parsedTask.title}`);
        }
      }

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
    } catch (error) {
      this.logger.error(`Failed to process Gmail message ${messageId}`, error as Error);
    }
  }
}
