import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloConfig } from '../../config/zalo.config';
import { ZaloLinkService } from './zalo-link.service';

const POLL_TIMEOUT_SECONDS = 10;
const ERROR_BACKOFF_MS = 3000;
const MAX_SEEN_MESSAGE_IDS = 500;

type ZaloMessage = {
  from?: { id?: string };
  chat?: { id?: string; chat_type?: string };
  text?: string;
  message_id?: string;
};

type ZaloUpdate = {
  event_name?: string;
  message?: ZaloMessage;
};

type ZaloApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

@Injectable()
export class ZaloBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZaloBotService.name);
  private readonly baseUrl?: string;
  private readonly seenMessageIds = new Set<string>();
  private polling = false;

  constructor(
    configService: ConfigService,
    private readonly zaloLinkService: ZaloLinkService,
  ) {
    const token = configService.get<ZaloConfig>('zalo')?.botToken;
    this.baseUrl = token
      ? `https://bot-api.zaloplatforms.com/bot${token}`
      : undefined;
  }

  onModuleInit(): void {
    if (!this.baseUrl) {
      this.logger.warn(
        'Zalo bot chưa cấu hình ZALO_BOT_TOKEN — bỏ qua polling',
      );
      return;
    }
    this.polling = true;
    // getUpdates is a true long-poll (blocks server-side up to `timeout` seconds
    // waiting for new messages) — the next call must only fire after the previous
    // one resolves, never on a fixed interval, or requests pile up and time out.
    void this.pollLoop();
  }

  onModuleDestroy(): void {
    this.polling = false;
  }

  async getMe(): Promise<{ id: string; account_name: string } | null> {
    const result = await this.call<{ id: string; account_name: string }>(
      'getMe',
    );
    return result ?? null;
  }

  async sendTextMessage(chatId: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text });
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        // "Request timeout" here just means the long-poll window elapsed with no
        // new messages (Zalo's equivalent of Telegram's empty-array response) —
        // not a real error, so it's excluded from error logging/backoff.
        const result = await this.call<unknown>(
          'getUpdates',
          { timeout: POLL_TIMEOUT_SECONDS },
          ['Request timeout'],
        );
        if (result === undefined) {
          await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
          continue;
        }
        for (const update of this.normalizeUpdates(result)) {
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.logger.error('Zalo poll cycle failed', error as Error);
        await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
      }
    }
  }

  /**
   * getUpdates' exact response shape isn't documented in detail (it may be an
   * array, a single update object, or `{ updates: [...] }`) — normalize
   * defensively instead of assuming, and log once if it's something unexpected.
   */
  private normalizeUpdates(result: unknown): ZaloUpdate[] {
    if (Array.isArray(result)) return result as ZaloUpdate[];
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.updates)) return obj.updates as ZaloUpdate[];
      if ('message' in obj || 'event_name' in obj) return [obj];
    }
    if (result != null) {
      this.logger.warn(
        `Dạng dữ liệu getUpdates không như dự kiến: ${JSON.stringify(result)}`,
      );
    }
    return [];
  }

  private async handleUpdate(update: ZaloUpdate): Promise<void> {
    const message = update.message;
    const messageId = message?.message_id;
    if (!message || !messageId || this.seenMessageIds.has(messageId)) return;

    this.markSeen(messageId);

    const chatId = message.chat?.id;
    if (
      update.event_name === 'message.text.received' &&
      chatId &&
      typeof message.text === 'string'
    ) {
      const linked = await this.zaloLinkService.confirmLink(
        message.text,
        chatId,
      );
      if (linked) {
        await this.sendTextMessage(chatId, 'Liên kết tài khoản thành công!');
      }
    }
  }

  private markSeen(messageId: string): void {
    this.seenMessageIds.add(messageId);
    if (this.seenMessageIds.size > MAX_SEEN_MESSAGE_IDS) {
      const oldest = this.seenMessageIds.values().next().value as
        string | undefined;
      if (oldest !== undefined) this.seenMessageIds.delete(oldest);
    }
  }

  private async call<T>(
    method: string,
    body?: Record<string, unknown>,
    benignErrors: string[] = [],
  ): Promise<T | undefined> {
    if (!this.baseUrl) {
      this.logger.warn(`Zalo bot chưa cấu hình, bỏ qua gọi ${method}`);
      return undefined;
    }
    try {
      const response = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });

      const data = (await response.json()) as ZaloApiResponse<T>;
      if (!data.ok) {
        if (data.description && benignErrors.includes(data.description)) {
          return [] as T;
        }
        this.logger.error(
          `Zalo API ${method} thất bại: ${data.description ?? 'unknown error'}`,
        );
        return undefined;
      }
      return data.result;
    } catch (error) {
      this.logger.error(`Gọi Zalo API ${method} thất bại`, error as Error);
      return undefined;
    }
  }
}
