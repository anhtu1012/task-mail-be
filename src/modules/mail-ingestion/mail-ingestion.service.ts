import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { gmail_v1, google } from 'googleapis';
import type { MailAccount } from '../../generated/prisma/client';
import { MailAccountRepository } from '../mail-accounts/repositories/mail-account.repository';
import { MailAccountsService } from '../mail-accounts/mail-accounts.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
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
  return (
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'subject')?.value ??
    ''
  );
}

// The RFC 5322 "Message-ID" header is assigned once by the sending server and stays
// identical across every recipient's copy of the same email — unlike Gmail's own
// message id, which is local to each mailbox. Using it as the dedup key stops the
// same email (e.g. sent to multiple connected mailboxes via To/Cc) from creating one
// task per mailbox.
function extractRfcMessageId(
  payload?: gmail_v1.Schema$MessagePart,
): string | undefined {
  return (
    payload?.headers?.find((h) => h.name?.toLowerCase() === 'message-id')
      ?.value ?? undefined
  );
}

function extractAttachmentFilenames(
  part?: gmail_v1.Schema$MessagePart,
): string[] {
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
    private readonly usersService: UsersService,
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
      const mailConfig = this.configService.get<MailConfig>('mail');
      const prefix = mailConfig?.taskSubjectPrefix ?? '[TASK]';
      const lookbackDays = mailConfig?.taskLookbackDays ?? 7;
      const key =
        this.configService.getOrThrow<SecurityConfig>(
          'security',
        ).tokenEncryptionKey;

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
          .catch((error) =>
            this.logger.error(
              `Failed to persist refreshed tokens for ${account.email}`,
              error,
            ),
          );
      });

      const gmail = google.gmail({ version: 'v1', auth: client });
      // Not filtered by is:unread — already-read mail matching the subject prefix must
      // also be picked up. Duplicate creation is instead prevented by the externalRef
      // dedup check in processMessage(). newer_than bounds the scan window so a poll
      // cycle doesn't re-fetch the account's entire mail history every 5 minutes.
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        q: `subject:(${prefix}) newer_than:${lookbackDays}d`,
      });

      for (const message of data.messages ?? []) {
        if (message.id)
          await this.processMessage(
            gmail,
            message.id,
            prefix,
            account.userId,
            account.id,
          );
      }
    } catch (error) {
      this.logger.error(
        `Mail ingestion cycle failed for account ${account.email}`,
        error as Error,
      );
    }
  }

  private async processMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
    subjectPrefix: string,
    mailboxOwnerId: string,
    mailAccountId: string,
  ): Promise<void> {
    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });
      const subject = extractSubject(data.payload);
      const bodyText = extractPlainText(data.payload);
      const parsedTask = parseTaskMail(subject, bodyText, subjectPrefix);

      if (parsedTask) {
        const rfcMessageId = extractRfcMessageId(data.payload);
        const externalRef = rfcMessageId
          ? `gmail:msgid:${rfcMessageId}`
          : `gmail:${messageId}`;
        const existing = await this.tasksService.findByExternalRef(externalRef);
        if (!existing) {
          const assigneeId = await this.resolveAssigneeId(
            parsedTask.assigneeEmail,
            mailboxOwnerId,
          );
          const receivedAt = data.internalDate
            ? new Date(Number(data.internalDate))
            : new Date();
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
            sourceMailAccountId: mailAccountId,
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
      this.logger.error(
        `Failed to process Gmail message ${messageId}`,
        error as Error,
      );
    }
  }

  /**
   * A body directive (e.g. "Giao cho: user@company.com") names the intended assignee
   * explicitly, so the task lands on the right person even when the mail was received
   * in a different (e.g. CC'd) connected mailbox. Falls back to the mailbox owner when
   * there's no directive, or when the named email doesn't match a registered user.
   */
  private async resolveAssigneeId(
    assigneeEmail: string | undefined,
    mailboxOwnerId: string,
  ): Promise<string> {
    if (!assigneeEmail) return mailboxOwnerId;

    const user = await this.usersService.findByEmail(assigneeEmail);
    if (!user) {
      this.logger.warn(
        `Mail assignee directive "${assigneeEmail}" matches no user, falling back to mailbox owner`,
      );
      return mailboxOwnerId;
    }
    return user.id;
  }
}
