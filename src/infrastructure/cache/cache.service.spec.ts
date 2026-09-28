import { CacheService } from './cache.service';
import { CacheStore, MemoryCacheStore } from './cache.store';

class BrokenStore implements CacheStore {
  get = jest.fn(() => Promise.reject(new Error('redis down')));
  set = jest.fn(() => Promise.reject(new Error('redis down')));
  del = jest.fn(() => Promise.reject(new Error('redis down')));
  close = jest.fn(() => Promise.resolve());
}

describe('CacheService', () => {
  afterEach(() => jest.useRealTimers());

  it('lần đầu gọi loader, lần sau trả từ cache', async () => {
    const cache = new CacheService(new MemoryCacheStore());
    const load = jest.fn().mockResolvedValue([{ id: 'a' }]);

    await cache.wrap('k', 60, load);
    const second = await cache.wrap('k', 60, load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toEqual([{ id: 'a' }]);
  });

  it('giá trị đi qua JSON ngay cả với store bộ nhớ — Date về thành chuỗi ISO', async () => {
    const cache = new CacheService(new MemoryCacheStore());
    const at = new Date('2026-09-28T01:02:03.000Z');

    await cache.wrap('k', 60, () => Promise.resolve({ at }));
    const hit = await cache.wrap('k', 60, () => Promise.resolve({ at }));

    // Đây là ràng buộc được ghi ở CacheService: chỉ cache thứ trả thẳng ra JSON.
    expect(hit).toEqual({ at: '2026-09-28T01:02:03.000Z' });
  });

  it('hết TTL thì nạp lại', async () => {
    jest.useFakeTimers();
    const cache = new CacheService(new MemoryCacheStore());
    const load = jest.fn().mockResolvedValue(1);

    await cache.wrap('k', 1, load);
    jest.advanceTimersByTime(1_001);
    await cache.wrap('k', 1, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalidate làm lần đọc sau nạp lại', async () => {
    const cache = new CacheService(new MemoryCacheStore());
    const load = jest.fn().mockResolvedValueOnce('cũ').mockResolvedValue('mới');

    await cache.wrap('k', 60, load);
    await cache.invalidate('k');

    expect(await cache.wrap('k', 60, load)).toBe('mới');
  });

  it('xoá lần hai sau 2s chặn bản cũ do request đọc chạy dở ghi lại', async () => {
    jest.useFakeTimers();
    const store = new MemoryCacheStore();
    const cache = new CacheService(store);

    await cache.invalidate('k');
    // Request đọc bắt đầu trước lệnh ghi, giờ mới ghi bản cũ vào cache.
    await store.set('k', JSON.stringify('cũ'), 60);
    jest.advanceTimersByTime(2_000);
    await Promise.resolve();

    expect(await store.get('k')).toBeNull();
  });

  it('không cache khi loader lỗi', async () => {
    const cache = new CacheService(new MemoryCacheStore());
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValue('ok');

    await expect(cache.wrap('k', 60, load)).rejects.toThrow('db');
    expect(await cache.wrap('k', 60, load)).toBe('ok');
  });

  describe('store hỏng (Redis sập)', () => {
    it('wrap vẫn trả dữ liệu từ loader', async () => {
      const cache = new CacheService(new BrokenStore());
      await expect(
        cache.wrap('k', 60, () => Promise.resolve('từ DB')),
      ).resolves.toBe('từ DB');
    });

    it('invalidate không ném lỗi — lệnh ghi DB đã xong thì không được báo hỏng', async () => {
      jest.useFakeTimers();
      const cache = new CacheService(new BrokenStore());
      await expect(cache.invalidate('k')).resolves.toBeUndefined();
    });
  });
});
