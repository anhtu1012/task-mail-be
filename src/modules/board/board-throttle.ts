import { Throttle } from '@nestjs/throttler';

/**
 * The global budget is 20 requests / 60 s, which a single tidy-up session blows
 * through: one drag is one request, and the user does dozens in a row. Getting a
 * 429 mid-drag snaps the card back to where it started.
 *
 * These endpoints write one narrow row each, so a higher ceiling costs
 * effectively nothing.
 */
export const BOARD_INTERACTION_LIMIT = 120;

export const HighFrequencyWrite = () =>
  Throttle({ default: { limit: BOARD_INTERACTION_LIMIT, ttl: 60_000 } });
