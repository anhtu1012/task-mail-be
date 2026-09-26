import { ZaloLinkService } from './zalo-link.service';
import type { ZaloLinkCodeRepository } from './repositories/zalo-link-code.repository';
import type { ZaloAccountRepository } from './repositories/zalo-account.repository';

describe('ZaloLinkService', () => {
  function build() {
    const zaloLinkCodeRepository = {
      deleteExpired: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue(undefined),
      findByCode: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as ZaloLinkCodeRepository;
    const zaloAccountRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      findByZaloUserId: jest.fn().mockResolvedValue(null),
    } as unknown as ZaloAccountRepository;
    const service = new ZaloLinkService(
      zaloLinkCodeRepository,
      zaloAccountRepository,
    );
    return { service, zaloLinkCodeRepository, zaloAccountRepository };
  }

  it('creates a 6-digit code that expires 10 minutes from now', async () => {
    const { service } = build();
    const before = Date.now();
    const { code, expiresAt } = await service.createLinkCode('user-1');

    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(before + 9 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(
      before + 10 * 60 * 1000 + 1000,
    );
  });

  it('links the account when the code is valid and unexpired', async () => {
    const { service, zaloLinkCodeRepository, zaloAccountRepository } = build();
    (zaloLinkCodeRepository.findByCode as jest.Mock).mockResolvedValue({
      id: 'code-1',
      userId: 'user-1',
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.confirmLink('123456', 'zalo-user-1');

    expect(result).toBe('linked');
    expect(zaloAccountRepository.upsert).toHaveBeenCalledWith(
      'user-1',
      'zalo-user-1',
    );
    expect(zaloLinkCodeRepository.delete).toHaveBeenCalledWith('code-1');
  });

  it('rejects an unknown code', async () => {
    const { service, zaloLinkCodeRepository, zaloAccountRepository } = build();
    (zaloLinkCodeRepository.findByCode as jest.Mock).mockResolvedValue(null);

    const result = await service.confirmLink('000000', 'zalo-user-1');

    expect(result).toBe('invalid_code');
    expect(zaloAccountRepository.upsert).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    const { service, zaloLinkCodeRepository, zaloAccountRepository } = build();
    (zaloLinkCodeRepository.findByCode as jest.Mock).mockResolvedValue({
      id: 'code-1',
      userId: 'user-1',
      code: '123456',
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await service.confirmLink('123456', 'zalo-user-1');

    expect(result).toBe('invalid_code');
    expect(zaloAccountRepository.upsert).not.toHaveBeenCalled();
  });

  it('rejects a Zalo chat already linked to a different account', async () => {
    const { service, zaloLinkCodeRepository, zaloAccountRepository } = build();
    (zaloLinkCodeRepository.findByCode as jest.Mock).mockResolvedValue({
      id: 'code-1',
      userId: 'user-1',
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (zaloAccountRepository.findByZaloUserId as jest.Mock).mockResolvedValue({
      userId: 'user-2',
      zaloUserId: 'zalo-user-1',
    });

    const result = await service.confirmLink('123456', 'zalo-user-1');

    expect(result).toBe('already_linked');
    expect(zaloAccountRepository.upsert).not.toHaveBeenCalled();
    expect(zaloLinkCodeRepository.delete).not.toHaveBeenCalled();
  });

  it('re-links the same user to a new Zalo chat without conflict', async () => {
    const { service, zaloLinkCodeRepository, zaloAccountRepository } = build();
    (zaloLinkCodeRepository.findByCode as jest.Mock).mockResolvedValue({
      id: 'code-1',
      userId: 'user-1',
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (zaloAccountRepository.findByZaloUserId as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      zaloUserId: 'zalo-user-1',
    });

    const result = await service.confirmLink('123456', 'zalo-user-1');

    expect(result).toBe('linked');
    expect(zaloAccountRepository.upsert).toHaveBeenCalledWith(
      'user-1',
      'zalo-user-1',
    );
  });
});
