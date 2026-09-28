import { AppValidationPipe } from '../../../common/pipes/validation.pipe';
import { BoardFullQueryDto } from './board-request.dto';

const transform = (query: Record<string, string | string[]>) =>
  AppValidationPipe.transform(query, {
    type: 'query',
    metatype: BoardFullQueryDto,
  }) as Promise<BoardFullQueryDto>;

describe('BoardFullQueryDto.include', () => {
  it('tách chuỗi phân cách bằng dấu phẩy', async () => {
    const dto = await transform({ include: 'projects,taskTypes' });
    expect(dto.include).toEqual(['projects', 'taskTypes']);
  });

  it('nhận cả dạng lặp tham số ?include=a&include=b', async () => {
    const dto = await transform({ include: ['projects', 'taskTypes'] });
    expect(dto.include).toEqual(['projects', 'taskTypes']);
  });

  it('bỏ khoảng trắng và phần rỗng', async () => {
    const dto = await transform({ include: ' projects , ,taskTypes ' });
    expect(dto.include).toEqual(['projects', 'taskTypes']);
  });

  it('bỏ trống thì undefined — tải lại bảng không kéo theo dữ liệu thừa', async () => {
    const dto = await transform({});
    expect(dto.include).toBeUndefined();
  });

  it('từ chối giá trị lạ thay vì lặng lẽ bỏ qua', async () => {
    await expect(transform({ include: 'projects,users' })).rejects.toThrow();
  });
});
