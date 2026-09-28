import { formatDigestMessage } from './zalo-notification.listener';
import type { TaskResponseDto } from '../tasks/dto/task-response.dto';

const VN = 'Asia/Ho_Chi_Minh';

const task = (code: string, title: string, deadline: string) =>
  ({ code, title, deadline: new Date(deadline) }) as unknown as TaskResponseDto;

describe('formatDigestMessage', () => {
  it('liệt kê quá hạn và đến hạn hôm nay theo giờ người nhận', () => {
    const text = formatDigestMessage(
      [task('TSK-000001', 'Gửi báo giá', '2026-09-27T02:00:00Z')],
      [task('TSK-000002', 'Họp khách', '2026-09-28T09:30:00Z')],
      VN,
      'https://app/tasks',
    );
    expect(text).toContain('🔴 Quá hạn (1):');
    expect(text).toContain('• TSK-000001 Gửi báo giá (09:00 27/09)');
    expect(text).toContain('📅 Đến hạn hôm nay (1):');
    expect(text).toContain('• TSK-000002 Họp khách (16:30 28/09)');
    expect(text.endsWith('Xem task tại: https://app/tasks')).toBe(true);
  });

  it('bỏ nhóm rỗng và rút gọn danh sách dài', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      task(`TSK-${i}`, `Việc ${i}`, '2026-09-28T09:00:00Z'),
    );
    const text = formatDigestMessage([], many, VN);
    expect(text).not.toContain('Quá hạn');
    expect(text).toContain('Đến hạn hôm nay (12):');
    expect(text).toContain('… và 2 việc khác');
  });
});
