import { describe, expect, it } from 'vitest';
import { STARTING_BALANCES, TOTAL, SOURCE_ID, TARGET_ID } from './transactions.js';

// Pure unit tier: no database. Confirms the fixed dataset is shaped so the
// integration assertions on the committed balances and the conserved total cannot
// pass vacuously, and that TOTAL is the genuine sum of the seed.

describe('the conserved total is the sum of the seed', () => {
  it('matches the hand-summed starting balances', () => {
    const summed = STARTING_BALANCES.reduce((sum, a) => sum + a.balance, 0);
    expect(summed).toBe(140);
    expect(TOTAL).toBe(summed);
  });
});

describe('the seed is shaped for a meaningful transfer', () => {
  it('has two distinct accounts', () => {
    expect(STARTING_BALANCES).toHaveLength(2);
    const ids = STARTING_BALANCES.map((a) => a.accountId);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(SOURCE_ID);
    expect(ids).toContain(TARGET_ID);
  });

  it('starts the source with enough balance to cover the tested transfers', () => {
    const source = STARTING_BALANCES.find((a) => a.accountId === SOURCE_ID);
    // The integration commit test moves 30 and the abort test attempts 25, so a
    // source below either would make those assertions pass for the wrong reason.
    expect(source?.balance).toBeGreaterThanOrEqual(30 + 25);
  });
});
