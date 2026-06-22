import { get, type IncomingMessage } from 'node:http';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type EventDoc } from '../collections.js';
import { TARGET_KEY, INITIAL_LABEL } from './change-streams.js';
import {
  startServer,
  resetSseEvents,
  parseSseData,
  SSE_PATH,
  SSE_FRAME_TERMINATOR,
  type RunningServer,
} from './sse.js';

// The SSE server owns COLLECTIONS.sseEvents, distinct from the change-streams
// example's events collection, so the two modules' integration tests never drop
// or watch the same collection concurrently under the parallel file runner.
async function sseEvents(): Promise<Collection<EventDoc>> {
  const db = await getDb();
  return db.collection<EventDoc>(COLLECTIONS.sseEvents);
}

// Connect an SSE client, resolving once the response head is received (so the
// connection is open) with a promise of the first matching change event. The
// caller writes only after the connection resolves, so the server's established
// stream is guaranteed to see that write.
function connectSse(
  port: number,
  matches: (change: { operationType: string; fullDocument?: EventDoc }) => boolean,
): {
  connected: Promise<void>;
  firstMatch: Promise<{ operationType: string; fullDocument?: EventDoc }>;
} {
  let onConnected: () => void;
  let onMatch: (change: { operationType: string; fullDocument?: EventDoc }) => void;
  let onError: (err: unknown) => void;
  const connected = new Promise<void>((resolve) => {
    onConnected = resolve;
  });
  const firstMatch = new Promise<{ operationType: string; fullDocument?: EventDoc }>(
    (resolve, reject) => {
      onMatch = resolve;
      onError = reject;
    },
  );

  const req = get({ host: '127.0.0.1', port, path: SSE_PATH }, (res: IncomingMessage) => {
    res.setEncoding('utf8');
    onConnected();
    let buffer = '';
    res.on('data', (chunk: string) => {
      buffer += chunk;
      let idx = buffer.indexOf(SSE_FRAME_TERMINATOR);
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + SSE_FRAME_TERMINATOR.length);
        // The opening `: connected` comment has no data line, so skip frames that
        // do not parse to a change event.
        if (frame.includes('data:')) {
          const change = parseSseData(frame) as { operationType: string; fullDocument?: EventDoc };
          if (matches(change)) {
            onMatch(change);
          }
        }
        idx = buffer.indexOf(SSE_FRAME_TERMINATOR);
      }
    });
  });
  req.on('error', (err) => onError(err));
  // Returned so the test can abort the request and free the socket in cleanup.
  (firstMatch as { req?: ReturnType<typeof get> }).req = req;
  return { connected, firstMatch };
}

let running: RunningServer;

beforeEach(async () => {
  // Empty the watched collection so the only event the test sees is its own write.
  await resetSseEvents();
});

afterAll(async () => {
  // stop() closes the change stream and the http server; closeClient() then
  // releases the process-shared client. Without both, vitest hangs on the open
  // handles.
  if (running) {
    await running.stop();
  }
  const col = await sseEvents();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('the SSE endpoint streams a change event when a document is written', () => {
  it('delivers an insert event over SSE for a write to the watched collection', async () => {
    // Ephemeral port (0) so concurrent runs never collide on a fixed port.
    running = await startServer({ port: 0 });

    const { connected, firstMatch } = connectSse(
      running.port,
      (change) => change.operationType === 'insert' && change.fullDocument?.key === TARGET_KEY,
    );

    // Wait for the connection to be open before writing, or the event could be
    // produced before the client is attached and never delivered to it.
    await connected;

    const col = await sseEvents();
    await col.insertOne({ key: TARGET_KEY, label: INITIAL_LABEL });

    // The decisive assertion: a real write produces a real streamed event whose
    // content reflects that write. If the change stream were not wired to the
    // response this never resolves and the test times out, so it cannot pass on
    // a server that merely returns 200.
    const change = await firstMatch;
    expect(change.operationType).toBe('insert');
    expect(change.fullDocument?.key).toBe(TARGET_KEY);
    expect(change.fullDocument?.label).toBe(INITIAL_LABEL);

    // Free the client socket so it is not a leaked handle at teardown.
    const req = (firstMatch as { req?: { destroy: () => void } }).req;
    req?.destroy();
  });
});
