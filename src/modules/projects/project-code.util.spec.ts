import { generateProjectCode } from './project-code.util';

describe('generateProjectCode', () => {
  const none = new Set<string>();

  it('lấy chữ cái đầu mỗi từ và bỏ dấu tiếng Việt', () => {
    expect(generateProjectCode('Công việc công ty', none)).toBe('CVCT');
    expect(generateProjectCode('Đào tạo nội bộ', none)).toBe('DTNB');
  });

  it('cắt còn 4 ký tự khi tên có nhiều từ', () => {
    expect(generateProjectCode('Khách hàng A phần mềm kế toán', none)).toBe(
      'KHAP',
    );
  });

  // Một từ cho đúng một chữ cái, ngắn hơn mức tối thiểu 2 ký tự.
  it('dùng đầu của từ khi tên chỉ có một từ', () => {
    expect(generateProjectCode('Website', none)).toBe('WEBS');
    expect(generateProjectCode('An', none)).toBe('AN');
  });

  it('thêm số khi trùng, bắt đầu từ 2', () => {
    expect(generateProjectCode('Khách hàng A', new Set(['KHA']))).toBe('KHA2');
    expect(generateProjectCode('Khách hàng A', new Set(['KHA', 'KHA2']))).toBe(
      'KHA3',
    );
  });

  // Hậu tố không được đẩy mã vượt 8 ký tự — cột là varchar(8).
  it('giữ mã trong 8 ký tự khi phải thêm hậu tố dài', () => {
    const taken = new Set(['CVCT']);
    const code = generateProjectCode('Công việc công ty', taken);
    expect(code.length).toBeLessThanOrEqual(8);
    expect(taken.has(code)).toBe(false);
  });

  it('không sinh mã rỗng khi tên toàn ký tự đặc biệt', () => {
    const code = generateProjectCode('!!! ???', none);
    expect(code.length).toBeGreaterThanOrEqual(2);
  });
});
