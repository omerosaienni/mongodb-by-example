import type { ClientSession, Collection } from 'mongodb';
import { getClient, getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Account } from '../collections.js';

// Two fixed accounts with whole-number starting balances. The amounts are exact
// so the commit test asserts concrete resulting balances and the abort test
// asserts the originals are untouched, neither of which a broken implementation
// would reproduce. Their sum is the conserved total the transfer must preserve.
export const SOURCE_ID = 'acct-alice';
export const TARGET_ID = 'acct-bob';
export const STARTING_BALANCES: readonly Account[] = [
  { accountId: SOURCE_ID, balance: 100 },
  { accountId: TARGET_ID, balance: 40 },
] as const;

// The conserved total: the sum of all balances is invariant across any transfer,
// whether it commits or aborts. Derived from the fixed seed so the tests have one
// concrete number to assert.
export const TOTAL = STARTING_BALANCES.reduce((sum, a) => sum + a.balance, 0);

// Thrown to force a mid-transaction failure in the abort demonstration. A
// dedicated type, not a bare Error, so the abort test asserts the rollback was
// triggered by this forced fault and not by an unrelated driver error that would
// also abort but prove nothing about the session wrapping.
export class ForcedAbort extends Error {
  constructor() {
    super('forced mid-transaction abort');
    this.name = 'ForcedAbort';
  }
}

async function accounts(): Promise<Collection<Account>> {
  const db = await getDb();
  return db.collection<Account>(COLLECTIONS.accounts);
}

// Drop and recreate the two accounts at their starting balances, so re-running is
// idempotent and every run starts from the same known state.
export async function resetAndSeed(): Promise<Collection<Account>> {
  const col = await accounts();
  await col.drop().catch(() => false);
  await col.insertMany(STARTING_BALANCES.map((a) => ({ ...a })));
  return col;
}

// Move amount from source to target inside a single transaction. Both the debit
// and the credit run in the same session, so they commit together or not at all.
// The debit filter requires balance >= amount: if the source cannot cover it the
// debit matches nothing, and we throw to abort rather than let a half-transfer
// commit. When failMidway is set we throw after staging the debit, to demonstrate
// that an error mid-transaction rolls back the debit too, leaving both balances
// at their originals and the total conserved.
export async function transfer(
  source: string,
  target: string,
  amount: number,
  options: { failMidway?: boolean } = {},
): Promise<void> {
  // getDb() connects the shared client and returns the named db handle. The
  // session is opened on the same shared client, so the transaction covers the
  // updates issued against this db.
  const client = getClient();
  const db = await getDb();
  const col = db.collection<Account>(COLLECTIONS.accounts);

  // withSession + withTransaction lets the driver own commit and the retry of
  // transient transaction errors. A throw inside the callback aborts the
  // transaction and propagates, so no partial write survives.
  await client.withSession(async (session: ClientSession) => {
    await session.withTransaction(async () => {
      const debit = await col.updateOne(
        { accountId: source, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { session },
      );
      // No matched source means insufficient funds (or a missing account): abort
      // so the credit never lands on its own.
      if (debit.matchedCount !== 1) {
        throw new Error(`debit failed: ${source} cannot cover ${amount}`);
      }

      if (options.failMidway === true) {
        // Fail after the debit is staged but before the credit, the worst case for
        // partial application. withTransaction aborts, so the debit rolls back.
        throw new ForcedAbort();
      }

      const credit = await col.updateOne(
        { accountId: target },
        { $inc: { balance: amount } },
        { session },
      );
      if (credit.matchedCount !== 1) {
        throw new Error(`credit failed: ${target} not found`);
      }
    });
  });
}

// Sum every balance, the live conserved total. Used by the demo and the tests to
// assert the invariant holds after both the committed and the aborted transfer.
export async function totalBalance(): Promise<number> {
  const col = await accounts();
  const [agg] = await col
    .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$balance' } } }])
    .toArray();
  return agg?.total ?? 0;
}

async function balanceOf(accountId: string): Promise<number | undefined> {
  const col = await accounts();
  const doc = await col.findOne({ accountId });
  return doc?.balance;
}

async function demo(): Promise<void> {
  await resetAndSeed();
  console.log(
    'starting balances:',
    SOURCE_ID,
    100,
    '|',
    TARGET_ID,
    40,
    '| total',
    await totalBalance(),
  );

  // Commit path: 30 moves from source to target, both writes apply, total holds.
  await transfer(SOURCE_ID, TARGET_ID, 30);
  console.log(
    'after commit:',
    SOURCE_ID,
    await balanceOf(SOURCE_ID),
    '|',
    TARGET_ID,
    await balanceOf(TARGET_ID),
    '| total',
    await totalBalance(),
  );

  // Abort path: a forced mid-transaction failure rolls back the debit, so both
  // balances stay exactly where the commit left them and the total is unchanged.
  try {
    await transfer(SOURCE_ID, TARGET_ID, 25, { failMidway: true });
    console.log('ERROR: aborted transfer was not rolled back');
  } catch (err) {
    const name = err instanceof Error ? err.name : 'unknown';
    console.log('transfer aborted as expected:', name);
  }
  console.log(
    'after abort:',
    SOURCE_ID,
    await balanceOf(SOURCE_ID),
    '|',
    TARGET_ID,
    await balanceOf(TARGET_ID),
    '| total',
    await totalBalance(),
  );
}

// Run directly via `npm run ex:transactions`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
