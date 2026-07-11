import { parseTaskMail } from './task-mail.parser';
import { TaskPriority } from '../../../common/enums/task-priority.enum';

describe('parseTaskMail', () => {
  it('returns null when the subject has no task prefix', () => {
    expect(
      parseTaskMail('Chào buổi sáng', 'nội dung bất kỳ', '[TASK]'),
    ).toBeNull();
  });

  it('extracts the title with the prefix stripped', () => {
    const result = parseTaskMail(
      '[TASK] Chuẩn bị báo cáo tuần',
      'nội dung',
      '[TASK]',
    );
    expect(result?.title).toBe('Chuẩn bị báo cáo tuần');
  });

  it('matches the prefix case-insensitively', () => {
    const result = parseTaskMail('[task] Việc cần làm', 'nội dung', '[TASK]');
    expect(result).not.toBeNull();
  });

  it('extracts a dd/mm/yyyy deadline with optional time', () => {
    const result = parseTaskMail(
      '[TASK] Việc gấp',
      'Nội dung.\nDeadline: 10/07/2026 17:30\nCảm ơn.',
      '[TASK]',
    );
    expect(result?.deadline).toEqual(new Date(2026, 6, 10, 17, 30));
  });

  it('extracts a Vietnamese "Hạn:" deadline without time', () => {
    const result = parseTaskMail('[TASK] Việc', 'Hạn: 01/08/2026', '[TASK]');
    expect(result?.deadline).toEqual(new Date(2026, 7, 1, 0, 0));
  });

  it('has no deadline when none is present', () => {
    const result = parseTaskMail(
      '[TASK] Việc',
      'không có ngày nào ở đây',
      '[TASK]',
    );
    expect(result?.deadline).toBeUndefined();
  });

  it.each([
    ['việc này khẩn cấp lắm', TaskPriority.URGENT],
    ['làm gấp giúp mình', TaskPriority.URGENT],
    ['ưu tiên cao nhé', TaskPriority.HIGH],
    ['bình thường thôi', TaskPriority.NORMAL],
  ])('maps body %p to priority %p', (body, expected) => {
    expect(parseTaskMail('[TASK] Việc', body, '[TASK]')?.priority).toBe(
      expected,
    );
  });

  it('truncates the description to 2000 characters', () => {
    const longBody = 'a'.repeat(3000);
    const result = parseTaskMail('[TASK] Việc', longBody, '[TASK]');
    expect(result?.description.length).toBe(2000);
  });

  it('extracts links found in the body as attachments', () => {
    const result = parseTaskMail(
      '[TASK] Việc',
      'Xem tài liệu tại https://docs.example.com/report và https://drive.example.com/file',
      '[TASK]',
    );
    expect(result?.attachments).toEqual([
      'https://docs.example.com/report',
      'https://drive.example.com/file',
    ]);
  });

  it('has no attachments when the body has no links', () => {
    const result = parseTaskMail('[TASK] Việc', 'không có link nào', '[TASK]');
    expect(result?.attachments).toEqual([]);
  });

  it.each([
    ['Giao cho: user@company.com', 'user@company.com'],
    ['Gán cho: Manager@Company.com', 'manager@company.com'],
    ['Assign to: other@company.com', 'other@company.com'],
  ])('extracts the assignee email from %p', (body, expected) => {
    expect(parseTaskMail('[TASK] Việc', body, '[TASK]')?.assigneeEmail).toBe(
      expected,
    );
  });

  it('matches any prefix in a list and strips the matched one from the title', () => {
    const result = parseTaskMail(
      '[OPER] THÔNG BÁO TASK',
      'Deadline: 10/07/2026 22:00',
      ['[TASK]', '[OPER]'],
    );
    expect(result?.title).toBe('THÔNG BÁO TASK');
    expect(result?.deadline).toEqual(new Date(2026, 6, 10, 22, 0));
  });

  it('returns null when the subject matches none of the configured prefixes', () => {
    expect(
      parseTaskMail('[NEWS] Bản tin tuần', 'nội dung', ['[TASK]', '[OPER]']),
    ).toBeNull();
  });

  it('has no assignee email when there is no directive', () => {
    const result = parseTaskMail(
      '[TASK] Việc',
      'không có chỉ định người nhận',
      '[TASK]',
    );
    expect(result?.assigneeEmail).toBeUndefined();
  });
});
