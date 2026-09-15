import { PositionService } from './position.service';
import type { BoardRepository } from '../repositories/board.repository';
import type { BoardCardRepository } from '../repositories/board-card.repository';

// Repositories are imported as types only, so this test never pulls in
// PrismaService — plain construction, no Nest DI.
describe('PositionService', () => {
  const BOARD = 'board-1';
  const LIST = 'list-1';

  function build(options: {
    neighbours?: Array<{ id: string; position: number }>;
    column?: Array<{ id: string; position: number }>;
  }) {
    const renumbered: Array<{ id: string; position: number }> = [];
    const boardRepository = {
      cardPositions: jest.fn().mockResolvedValue(options.column ?? []),
      renumberCards: jest.fn().mockImplementation((rows: typeof renumbered) => {
        renumbered.push(...rows);
        return Promise.resolve();
      }),
    } as unknown as BoardRepository;
    const cardRepository = {
      neighboursAt: jest.fn().mockResolvedValue(options.neighbours ?? []),
    } as unknown as BoardCardRepository;

    return {
      service: new PositionService(boardRepository, cardRepository),
      boardRepository,
      renumbered,
    };
  }

  it('keeps the requested position when the slot is free', async () => {
    const { service } = build({ neighbours: [] });

    await expect(
      service.resolveCardPosition(BOARD, LIST, 1536, 'card-1'),
    ).resolves.toEqual({ position: 1536, rebalanced: false });
  });

  // Replaying an undone move must not fail: the card is excluded from the
  // occupancy check, so moving back to its own old coordinates is a no-op.
  it('is idempotent — the same move twice resolves to the same position', async () => {
    const { service } = build({
      neighbours: [{ id: 'other', position: 2048 }],
    });

    const first = await service.resolveCardPosition(
      BOARD,
      LIST,
      1024,
      'card-1',
    );
    const second = await service.resolveCardPosition(
      BOARD,
      LIST,
      1024,
      'card-1',
    );

    expect(first).toEqual(second);
    expect(first.position).toBe(1024);
  });

  it('nudges to the midpoint when the slot is taken', async () => {
    const { service } = build({
      neighbours: [
        { id: 'a', position: 1024 },
        { id: 'b', position: 2048 },
      ],
    });

    const result = await service.resolveCardPosition(
      BOARD,
      LIST,
      1024,
      'card-1',
    );
    expect(result).toEqual({ position: 1536, rebalanced: false });
  });

  it('appends past the last card when nothing follows the taken slot', async () => {
    const { service } = build({ neighbours: [{ id: 'a', position: 1024 }] });

    const result = await service.resolveCardPosition(
      BOARD,
      LIST,
      1024,
      'card-1',
    );
    expect(result.position).toBeGreaterThan(1024);
  });

  // After ~50 inserts into the same slot Float64 runs out of room; the column
  // is renumbered and the card still lands where it was dropped.
  it('renumbers the column once the gap collapses', async () => {
    const { service, renumbered } = build({
      neighbours: [
        { id: 'a', position: 1024 },
        { id: 'b', position: 1024.0000001 },
      ],
      column: [
        { id: 'a', position: 1024 },
        { id: 'b', position: 1024.0000001 },
        { id: 'c', position: 2048 },
      ],
    });

    const result = await service.resolveCardPosition(
      BOARD,
      LIST,
      1024,
      'card-1',
    );

    expect(result.rebalanced).toBe(true);
    expect(renumbered).toEqual([
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
      { id: 'c', position: 3072 },
    ]);
    // Slots in front of "a" again, exactly where the drop asked for.
    expect(result.position).toBe(512);
  });

  it('rebalance keeps the existing order, renumbered by 1024', async () => {
    const { service } = build({
      column: [
        { id: 'a', position: 3 },
        { id: 'b', position: 3.5 },
        { id: 'c', position: 9 },
      ],
    });

    await expect(service.rebalanceCards(BOARD, LIST)).resolves.toEqual([
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
      { id: 'c', position: 3072 },
    ]);
  });
});
