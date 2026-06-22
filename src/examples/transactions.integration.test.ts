import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Account } from '../collections.js';
import {
  SOURCE_ID,
  TARGET_ID,
  TOTAL,
  ForcedAbort,
  resetAndSeed,
  transfer,
  totalBalance,
} from './transactions.js';

async function accounts(): Promise<Collection<Account>> {
  const db = await getDb();
  return db.collection<Account>(COLLECTIONS.accounts);
}

async function balanceOf(accountId: string): Promise<number | undefined> {
  const col = await accounts();
  const doc = await col.findOne({ accountId });
  return doc?.balance;
}

// Reseed before each test so every case starts from the same fixed balances and
// never inherits another test's transfer.
beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await accounts();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('a committed transfer applies both writes', () => {
  it('debits the source, credits the target, and conserves the total', async () => {
    await transfer(SOURCE_ID, TARGET_ID, 30);

    // Both balances moved by exactly the transferred amount: a half-applied
    // transfer (only debit or only credit) would fail one of these.
    expect(await balanceOf(SOURCE_ID)).toBe(70);
    expect(await balanceOf(TARGET_ID)).toBe(70);

    // The conserved-total invariant: the sum is unchanged by a transfer.
    expect(await totalBalance()).toBe(TOTAL);
  });
});

describe('an aborted transfer applies neither write', () => {
  it('rolls back the staged debit on a forced mid-transaction failure', async () => {
    let caught: unknown;
    try {
      // failMidway throws after the debit is staged but before the credit. If the
      // operations were not in a session the debit would survive and the source
      // would read 75, failing the assertion below.
      await transfer(SOURCE_ID, TARGET_ID, 25, { failMidway: true });
    } catch (err) {
      caught = err;
    }

    // The abort was triggered by our forced fault specifically, proving the
    // rollback path ran rather than some unrelated failure.
    expect(caught).toBeInstanceOf(ForcedAbort);

    // Neither balance changed: the debit rolled back with the transaction.
    expect(await balanceOf(SOURCE_ID)).toBe(100);
    expect(await balanceOf(TARGET_ID)).toBe(40);
    expect(await totalBalance()).toBe(TOTAL);
  });

  it('aborts an overdrawing transfer and leaves both balances untouched', async () => {
    let caught: unknown;
    try {
      // 500 exceeds the source balance of 100, so the guarded debit matches
      // nothing and the transfer aborts before the credit can apply on its own.
      await transfer(SOURCE_ID, TARGET_ID, 500);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(await balanceOf(SOURCE_ID)).toBe(100);
    expect(await balanceOf(TARGET_ID)).toBe(40);
    expect(await totalBalance()).toBe(TOTAL);
  });
});
