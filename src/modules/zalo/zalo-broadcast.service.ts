import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ZaloBotService } from './zalo-bot.service';
import { ZaloAccountRepository } from './repositories/zalo-account.repository';
import { ZaloBroadcastResponseDto } from './dto/zalo-broadcast.dto';

// Giãn cách giữa các tin để không chạm rate limit của Zalo Bot API.
const SEND_INTERVAL_MS = 150;

/**
 * Gửi thông báo hệ thống (bản cập nhật, hướng dẫn tải app…) tới mọi user đã
 * liên kết Zalo. Không lưu lịch sử — chỉ gửi và trả về thống kê.
 */
@Injectable()
export class ZaloBroadcastService {
  private readonly logger = new Logger(ZaloBroadcastService.name);

  constructor(
    private readonly zaloBotService: ZaloBotService,
    private readonly zaloAccountRepository: ZaloAccountRepository,
  ) {}

  async broadcast(
    message: string,
    options: { testOnly?: boolean; requesterId: string },
  ): Promise<ZaloBroadcastResponseDto> {
    const recipients = options.testOnly
      ? await this.findRequesterAccount(options.requesterId)
      : await this.zaloAccountRepository.findAll();

    let sent = 0;
    for (const [index, account] of recipients.entries()) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));
      }
      if (
        await this.zaloBotService.sendTextMessage(account.zaloUserId, message)
      ) {
        sent++;
      }
    }

    const failed = recipients.length - sent;
    this.logger.log(
      `Broadcast Zalo${options.testOnly ? ' (gửi thử)' : ''}: ${sent}/${recipients.length} thành công`,
    );
    return { total: recipients.length, sent, failed };
  }

  private async findRequesterAccount(userId: string) {
    const account = await this.zaloAccountRepository.findByUserId(userId);
    if (!account) {
      throw new NotFoundException(
        'Bạn chưa liên kết Zalo nên không thể gửi thử',
      );
    }
    return [account];
  }
}
