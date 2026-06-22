import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ChangeStream, ChangeStreamDocument, Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type EventDoc } from '../collections.js';
import { establish } from './change-streams.js';

// The SSE endpoint path, exported so the test and any consumer agree on it
// rather than hardcoding the string in two places.
export const SSE_PATH = '/events';

// Friendly default for the human run path. The test passes port 0 instead, so an
// ephemeral OS-assigned port avoids collisions between concurrent test runs.
export const DEFAULT_PORT = 3000;

// The SSE frame terminator. A frame is one or more field lines followed by a
// blank line, so two newlines mark the end of an event. Exported so the wire
// format lives in one place that the server, the parser and the tests share.
export const SSE_FRAME_TERMINATOR = '\n\n';

// Format one change event as an SSE data frame: a single `data:` line carrying
// the JSON, terminated by the blank line that delimits an event on the wire.
export function formatSseFrame(change: ChangeStreamDocument<EventDoc>): string {
  return `data: ${JSON.stringify(change)}${SSE_FRAME_TERMINATOR}`;
}

// Recover the object from a single SSE data frame's payload. Takes the text
// between two frame terminators and strips the `data: ` prefix off each line.
// Multi-line data is rejoined with newlines per the SSE spec. Returns unknown so
// the caller narrows the shape rather than this helper asserting it.
export function parseSseData(frame: string): unknown {
  const payload = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n');
  return JSON.parse(payload) as unknown;
}

// Drop and recreate the SSE server's own scratch collection empty. The SSE
// module owns COLLECTIONS.sseEvents rather than reusing change-streams'
// resetAndSeed (which is hardcoded to COLLECTIONS.events), so the two modules'
// integration tests never drop or watch the same collection concurrently under
// the parallel vitest file runner. The explicit createCollection after drop means
// the collection exists before the watch opens, avoiding a first-write race on
// lazy creation.
export async function resetSseEvents(): Promise<Collection<EventDoc>> {
  const db = await getDb();
  const col = db.collection<EventDoc>(COLLECTIONS.sseEvents);
  await col.drop().catch(() => false);
  await db.createCollection(COLLECTIONS.sseEvents);
  return col;
}

export interface RunningServer {
  server: Server;
  port: number;
  stop: () => Promise<void>;
}

// SSE response headers. keep-alive and no-cache stop a proxy or the client
// buffering or closing the long-lived stream.
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

// Open and establish the single shared change stream, wire it to broadcast to all
// connected clients, then start the http server. One change stream fans out to
// every SSE response: the server holds one stream for its lifetime, not one per
// request, mirroring the single shared client rule.
export async function startServer(options: { port?: number } = {}): Promise<RunningServer> {
  const port = options.port ?? DEFAULT_PORT;
  const db = await getDb();
  const col = db.collection<EventDoc>(COLLECTIONS.sseEvents);

  // The set of live SSE responses the broadcast writes to. A response is added on
  // connect and removed on client close, so a disconnected socket is never
  // written to (writing to a dead socket throws and would crash the broadcast).
  const clients = new Set<ServerResponse>();

  const stream: ChangeStream<EventDoc> = col.watch<EventDoc>();
  // watch() is lazy: the cursor is created on the first server round trip. Force
  // it open before we accept connections so a client that connects then writes is
  // not racing the cursor's creation and missing its own event.
  await establish(stream);

  const broadcast = (change: ChangeStreamDocument<EventDoc>): void => {
    const frame = formatSseFrame(change);
    for (const res of clients) {
      res.write(frame);
    }
  };

  // Drain the established stream as an async iterator in the background, fanning
  // each event out to every client. The driver forbids mixing iterator and
  // event-emitter modes on one stream, and establish() already used tryNext()
  // (iterator mode), so this must iterate rather than attach a 'change' listener.
  // An unhandled change-stream error would crash the process, so swallow the
  // close-time abort and log anything else; the server keeps serving.
  void (async () => {
    try {
      for await (const change of stream) {
        broadcast(change);
      }
    } catch (err: unknown) {
      if (!stream.closed) {
        console.error('change stream error:', err);
      }
    }
  })();

  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== SSE_PATH) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, SSE_HEADERS);
    // Open the stream to the client with a comment line so the connection is live
    // before the first change, which lets the test wait on the response head.
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const actualPort = (server.address() as AddressInfo).port;

  // stop() closes the change stream and the http server but deliberately does NOT
  // closeClient(): the client is process-shared, so the caller (a demo's SIGINT
  // handler, or a test's afterAll) closes it once at the very end.
  const stop = async (): Promise<void> => {
    await stream.close();
    for (const res of clients) {
      res.end();
    }
    clients.clear();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { server, port: actualPort, stop };
}

// Run directly via `npm run ex:sse`. This is a server: it stays up until killed,
// so unlike the other ex: modules it does not closeClient() in a finally that
// fires immediately. The integration test is the gate that proves the endpoint
// streams events, this path is for a human to connect a browser or curl.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
  resetSseEvents()
    .then(() => startServer({ port }))
    .then(({ port: listening, stop }) => {
      console.log(`SSE server holding a change stream on ${COLLECTIONS.sseEvents}`);
      console.log(`listening on http://127.0.0.1:${listening}${SSE_PATH}`);
      // Stop the server and close the shared client on Ctrl-C so the process
      // exits without a leaked client.
      process.on('SIGINT', () => {
        stop()
          .then(() => closeClient())
          .finally(() => process.exit(0));
      });
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
