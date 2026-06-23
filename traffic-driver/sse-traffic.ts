import { faker } from '@faker-js/faker';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../src/db.js';
import { COLLECTIONS, type EventDoc } from '../src/collections.js';

// A live-traffic driver for the dashboard. The dashboard (and the SSE server it
// connects to) only watch the sseEvents collection; nothing in the harness writes
// to it on an ongoing basis, so the live UI has no data to show. This loops
// inserts, updates and deletes into sseEvents so the change stream the SSE server
// watches emits a steady flow of events and the dashboard updates in real time.
// It is external to the learning examples in src/examples, hence its own folder:
// it exercises the running system rather than teaching one Mongo feature.

// Fixed faker seed so the sequence of generated labels is reproducible run to
// run. Timing is wall-clock, not deterministic, because the loop is unbounded and
// driven by a real interval; determinism here is about content, not cadence. This
// is a demo driver, not a gated test fixture, so reproducible content is enough.
const FAKER_SEED = 2027;

// Delay between writes. Slow enough that each new-row flash is visible on screen
// before the next arrives, rather than a blur of updates.
export const DEFAULT_INTERVAL_MS = 900;

// The mix of operations the loop performs, as cumulative probability thresholds.
// Inserts dominate so the table keeps growing and the pool of live keys to update
// or delete is rarely empty; updates and deletes exercise the other two pills.
const INSERT_THRESHOLD = 0.55;
const UPDATE_THRESHOLD = 0.8;

// The live keys currently in the collection, so updates and deletes target a real
// document rather than guessing. Module state, reset by resetTraffic, because the
// driver is a single long-running process that owns this collection for its run.
const liveKeys: string[] = [];
let nextOrdinal = 0;

// Reset the driver's in-memory bookkeeping and reseed faker, so a fresh run starts
// from an empty key pool, ordinal zero and the same generated label stream. Kept
// separate from the database reset below because it is the part a unit test needs
// to isolate one test's writes from another's, with no Mongo in play.
export function resetState(): void {
  liveKeys.length = 0;
  nextOrdinal = 0;
  faker.seed(FAKER_SEED);
}

// Drop and recreate the target collection empty and reset the driver's own
// bookkeeping, so a run starts from a known empty state and the keys array matches
// the collection. Defaults to sseEvents, the collection the SSE server and the
// dashboard watch. The name is a parameter so the integration test can drive a
// separate scratch collection rather than dropping and watching sseEvents
// concurrently with the SSE server's own integration test, which would invalidate
// that test's open change stream under the parallel file runner.
export async function resetTraffic(
  collectionName: string = COLLECTIONS.sseEvents,
): Promise<Collection<EventDoc>> {
  const db = await getDb();
  const col = db.collection<EventDoc>(collectionName);
  await col.drop().catch(() => false);
  await db.createCollection(collectionName);
  resetState();
  return col;
}

// A short, stable key for one document. Sequential and zero padded so the keys
// sort and read cleanly in the table rather than being random ids.
function nextKey(): string {
  const key = `user_${nextOrdinal.toString(16).padStart(4, '0')}`;
  nextOrdinal += 1;
  return key;
}

// Choose and perform one operation against the collection, keeping liveKeys in
// step. Returns the operationType performed so a caller or test can see the mix.
// An insert always happens when there is nothing live to update or delete, so the
// very first tick is always an insert and the loop can never stall on an empty set.
export async function performOne(col: Collection<EventDoc>): Promise<string> {
  const roll = faker.number.float({ min: 0, max: 1 });

  if (roll < INSERT_THRESHOLD || liveKeys.length === 0) {
    const key = nextKey();
    await col.insertOne({ key, label: faker.person.fullName() });
    liveKeys.push(key);
    return 'insert';
  }

  if (roll < UPDATE_THRESHOLD) {
    const key = faker.helpers.arrayElement(liveKeys);
    await col.updateOne({ key }, { $set: { label: faker.person.fullName() } });
    return 'update';
  }

  const index = faker.number.int({ min: 0, max: liveKeys.length - 1 });
  const [key] = liveKeys.splice(index, 1);
  await col.deleteOne({ key });
  return 'delete';
}

export interface TrafficDriver {
  stop: () => void;
}

// Start the interval loop. Each tick performs one operation; an error on a tick is
// logged and swallowed so a single transient failure does not tear down the whole
// run. setInterval is injected so a test can drive ticks deterministically with a
// fake timer instead of waiting on the wall clock.
export function startTraffic(
  col: Collection<EventDoc>,
  options: {
    intervalMs?: number;
    setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
    clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
    onTick?: (op: string) => void;
  } = {},
): TrafficDriver {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;

  // Skip a tick while the previous write is still in flight, so a slow round trip
  // cannot let operations pile up and run concurrently, which would race the
  // liveKeys pool (two ticks splicing the same index) and reorder events.
  let busy = false;
  const handle = setIntervalFn(() => {
    if (busy) {
      return;
    }
    busy = true;
    void performOne(col)
      .then((op) => options.onTick?.(op))
      .catch((err: unknown) => console.error('traffic tick failed:', err))
      .finally(() => {
        busy = false;
      });
  }, intervalMs);

  return {
    stop: () => clearIntervalFn(handle),
  };
}

// Run directly via `npm run traffic` or the Make target. Resets the collection,
// then loops until SIGINT. The import.meta.url guard keeps the helpers importable
// from the unit test without starting the loop.
if (import.meta.url === `file://${process.argv[1]}`) {
  resetTraffic()
    .then((col) => {
      console.log(`driving traffic into ${COLLECTIONS.sseEvents}, Ctrl-C to stop`);
      const driver = startTraffic(col, {
        onTick: (op) => console.log(`wrote ${op}`),
      });
      // Stop the loop and close the shared client on Ctrl-C so the process exits
      // without a leaked client or a dangling interval.
      process.on('SIGINT', () => {
        driver.stop();
        void closeClient().finally(() => process.exit(0));
      });
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
