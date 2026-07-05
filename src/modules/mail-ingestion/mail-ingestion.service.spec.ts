import { ConfigService } from '@nestjs/config';
import { MailIngestionService } from './mail-ingestion.service';
import type { MailAccountRepository } from '../mail-accounts/repositories/mail-account.repository';
import type { MailAccountsService } from '../mail-accounts/mail-accounts.service';
import type { TasksService } from '../tasks/tasks.service';

// Type-only imports for the collaborators keep this test from pulling in PrismaService
// (and the generated Prisma client) transitively — plain construction, no Nest DI container.
describe('MailIngestionService', () => {
  it('polls no accounts without throwing when none are connected', async () => {
    const findAll = jest.fn().mockResolvedValue([]);
    const mailAccountRepository = { findAll } as unknown as MailAccountRepository;
    const buildOAuthClient = jest.fn();
    const mailAccountsService = { buildOAuthClient } as unknown as MailAccountsService;
    const tasksService = {} as TasksService;

    const service = new MailIngestionService(
      new ConfigService({}),
      mailAccountRepository,
      mailAccountsService,
      tasksService,
    );

    await expect(service.pollMailAccounts()).resolves.toBeUndefined();
    expect(findAll).toHaveBeenCalled();
    expect(buildOAuthClient).not.toHaveBeenCalled();
  });
});
