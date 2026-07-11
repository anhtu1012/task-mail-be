import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { gmail_v1, google } from 'googleapis';
import type { MailAccount } from '../../generated/prisma/client';
import { MailAccountRepository } from '../mail-accounts/repositories/mail-account.repository';
import { MailAccountsService } from '../mail-accounts/mail-accounts.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { ZaloBotService } from '../zalo/zalo-bot.service';
import { ZaloAccountRepository } from '../zalo/repositories/zalo-account.repository';
import { MailConfig } from '../../config/mail.config';
import { SecurityConfig } from '../../config/security.config';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { TaskCategory } from '../../common/enums/task-category.enum';
import { parseTaskMail } from './parsers/task-mail.parser';

const EXTERNAL_SYNC_STATUS = 'IMPORTED_FROM_GMAIL';

// Distinguishes a revoked/expired refresh token (which requires the user to
// reconnect Gmail — retrying on the next poll cycle can never succeed) from a
// transient Gmail API failure (rate limit, network blip) that's worth retrying.
function isInvalidGrantError(error: unknown): boolean {
  const gaxiosError = error as {
    response?: { data?: { error?: string } };
    message?: string;
  };
  return (
    gaxiosError?.response?.data?.error === 'invalid_grant' ||
    (typeof gaxiosError?.message === 'string' &&
      gaxiosError.message.includes('invalid_grant'))
  );
}

function findPartByMimeType(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string,
): gmail_v1.Schema$MessagePart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPartByMimeType(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

// Prefers text/plain; task-notification systems commonly send an HTML-only template
// (no plain-text alternative), so falling back to a stripped text/html part is
// required for deadline/priority/assignee extraction to work on those mails.
function extractPlainText(payload?: gmail_v1.Schema$MessagePart): string {
  const plainPart = findPartByMimeType(payload, 'text/plain');
  if (plainPart?.body?.data) return decodeBase64Url(plainPart.body.data);

  const htmlPart = findPartByMimeType(payload, 'text/html');
  if (htmlPart?.body?.data) return stripHtml(decodeBase64Url(htmlPart.body.data));

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
  // Reconnect prompts are best-effort and reset on restart — a Set (rather than a
  // persisted DB flag) is enough to stop re-notifying every 5 minutes for the same
  // broken account within a single process lifetime.
  private readonly reconnectNotified = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly mailAccountRepository: MailAccountRepository,
    private readonly mailAccountsService: MailAccountsService,
    private readonly tasksService: TasksService,
    private readonly usersService: UsersService,
    private readonly zaloBotService: ZaloBotService,
    private readonly zaloAccountRepository: ZaloAccountRepository,
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
      const prefixes = mailConfig?.taskSubjectPrefixes ?? ['[TASK]'];
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
      // Gmail's subject: search doesn't treat brackets literally, so the bare word of
      // each tag (e.g. "TASK", "OPER") is OR'd together — this is a coarse pre-filter;
      // parseTaskMail() re-checks the exact bracketed prefix against the subject.
      // Not filtered by is:unread — already-read mail matching a subject prefix must
      // also be picked up. Duplicate creation is instead prevented by the externalRef
      // dedup check in processMessage(). newer_than bounds the scan window so a poll
      // cycle doesn't re-fetch the account's entire mail history every 5 minutes.
      const searchTerms = prefixes
        .map((p) => p.replace(/[^\p{L}\p{N}]+/gu, '').trim())
        .filter(Boolean);
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        q: `subject:(${searchTerms.join(' OR ')}) newer_than:${lookbackDays}d`,
      });

      for (const message of data.messages ?? []) {
        if (message.id)
          await this.processMessage(
            gmail,
            message.id,
            prefixes,
            account.userId,
            account.id,
          );
      }
      // A poll cycle completing without throwing means the token works again —
      // clear the reconnect flag so a future revocation gets re-notified.
      this.reconnectNotified.delete(account.id);
    } catch (error) {
      if (isInvalidGrantError(error)) {
        this.logger.warn(
          `[MailIngestion][ReconnectRequired] Gmail refresh token invalid/revoked for ` +
            `account ${account.email} (mailAccountId=${account.id}, userId=${account.userId}). ` +
            `Ingestion cannot recover automatically — the owner must reconnect via /mail-accounts/google/connect.`,
        );
        await this.notifyReconnectRequired(account);
        return;
      }
      this.logger.error(
        `Mail ingestion cycle failed for account ${account.email}`,
        error as Error,
      );
    }
  }

  private async notifyReconnectRequired(account: MailAccount): Promise<void> {
    if (this.reconnectNotified.has(account.id)) return;
    this.reconnectNotified.add(account.id);

    try {
      const zaloAccount = await this.zaloAccountRepository.findByUserId(
        account.userId,
      );
      if (!zaloAccount) {
        this.logger.warn(
          `Skipped reconnect-Gmail Zalo notification for account ${account.email}: owner has no linked Zalo account`,
        );
        return;
      }
      await this.zaloBotService.sendTextMessage(
        zaloAccount.zaloUserId,
        [
          '⚠️ Mất kết nối Gmail',
          `Tài khoản ${account.email} đã bị thu hồi/hết hạn quyền truy cập, hệ thống không thể đọc task mới từ mail.`,
          'Vui lòng kết nối lại Gmail trong ứng dụng.',
        ].join('\n'),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send reconnect-Gmail Zalo notification for account ${account.email}`,
        error as Error,
      );
    }
  }

  private async processMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
    subjectPrefixes: string[],
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
      const parsedTask = parseTaskMail(subject, bodyText, subjectPrefixes);

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
