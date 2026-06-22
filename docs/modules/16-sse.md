# Deliverable 16 — SSE server

## Purpose

A long-lived Node http server that holds one change stream on its own scratch
collection and streams each change to every connected client over a Server-Sent
Events endpoint. [`src/examples/sse.ts`](../../src/examples/sse.ts) opens and
establishes a single `watch()` on `COLLECTIONS.sseEvents`, fans every event out to
a `Set` of open responses, and serves the stream at `/events`. Run it with
`npm run ex:sse`; it stays up holding the stream until killed, so unlike the other
`ex:` modules it does not exit, and the integration test, not a zero exit, is the
gate that proves events stream.

## Public interface

### [`src/examples/sse.ts`](../../src/examples/sse.ts)

- `SSE_PATH` — the endpoint path (`/events`), exported so the server and any
  consumer agree on it rather than hardcoding the string twice.
- `DEFAULT_PORT` — the friendly port for the human run path (3000). The test passes
  port 0 for an ephemeral OS-assigned port instead.
- `SSE_FRAME_TERMINATOR` — the `\n\n` blank line that delimits one SSE event,
  shared by the server, the parser and the tests so the wire format lives in one
  place.
- `formatSseFrame(change): string` — pure helper: a change event to a
  `data: {...}\n\n` wire frame.
- `parseSseData(frame): unknown` — pure helper: a frame's text back to the object,
  stripping `data:` prefixes and rejoining multi-line data, returning `unknown` so
  the caller narrows the shape.
- `resetSseEvents(): Promise<Collection<EventDoc>>` — drops and recreates the empty
  `sseEvents` scratch collection, with an explicit `createCollection` after the
  drop so it exists before the watch opens.
- `startServer(options?: { port?: number }): Promise<RunningServer>` — opens and
  establishes the single shared change stream, starts broadcasting, then listens.
  Returns `{ server, port, stop }` where `port` is the actual listening port read
  back from `server.address()`.
- `RunningServer` interface and `stop(): Promise<void>` — closes the change stream
  and the http server but NOT the shared client.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.sseEvents` — the dedicated scratch collection the SSE server owns,
  distinct from the change-streams `events` collection.

### [`package.json`](../../package.json)

- `ex:sse` — runs the server via `tsx src/examples/sse.ts`.

Reuses `EventDoc`, and from
[`change-streams.ts`](../../src/examples/change-streams.ts) the
collection-agnostic `establish`, plus `TARGET_KEY` and `INITIAL_LABEL`, imported
rather than reimplemented.

## Key decisions

- One shared MongoClient (`getDb` from [`src/db.ts`](../../src/db.ts)) and one
  change stream for the whole server lifetime, fanned out to a `Set` of connected
  responses. Not one client and not one stream per request, mirroring the
  dashboard-server rule.
- The `node:http` built-in, no express or framework: the project carries no HTTP
  dependency and stays dependency-light, and node types are already available.
- The stream is established with `tryNext()` before the server listens. `watch()`
  is lazy, so the cursor and its start time are only set on the first round trip; a
  client that connects then writes would otherwise race the cursor and miss its own
  event.
- The stream is consumed as an async iterator (`for await`), not a `change` event
  listener. The driver forbids mixing iterator and emitter modes on one stream, and
  `establish()` already used `tryNext()` (iterator mode), so the broadcast loop must
  iterate.
- Each response is removed from the client set on `req.on('close')`, so a
  disconnected socket is never written to, since writing a dead socket throws and
  would break the broadcast for every other client.
- `stop()` deliberately does NOT `closeClient()`: the client is process-shared, so
  the demo's SIGINT handler or the test's `afterAll` closes it once at the very end.
- The server uses its OWN dedicated `sseEvents` collection, separate from the
  change-streams `events` collection, so the two modules' integration tests never
  drop or watch the same collection concurrently under the parallel vitest file
  runner. Collection isolation removes the coupling rather than masking it with
  `fileParallelism: false`.

## Verified behaviour

Confirmed by the judge (PASS). The integration tier connects an SSE client, waits
for the response head so the stream is held open, writes one document to
`COLLECTIONS.sseEvents`, then asserts a streamed `insert` event arrives whose
`fullDocument` carries the written key and label. If the change stream were not
wired to the response this never resolves and the test times out, so it cannot pass
on a server that merely returns 200. The unit tier covers the pure `formatSseFrame`
and `parseSseData` helpers with the database down.

The hollow check returned ASSERTS, so the test proves behaviour rather than passing
vacuously: replacing the broadcast `res.write(frame)` with `res.write('')` so an
empty frame reaches the client made the streamed event carry no data, caught by the
integration assertion on the event content; the file was restored and re-verified
green.

## Gotchas

- This is a server: it stays up and does not exit, so `npm run ex:sse` is the human
  path and the integration test is the gate. Do not gate on `ex:sse` exiting zero.
- The SSE frame terminator is `\n\n`; a frame missing it runs two events together
  on the wire.
- `afterAll` must `stop()` the server, destroy the SSE client request, and
  `closeClient()`, or vitest hangs on the open handles.
- Node has no built-in EventSource, so the test consumes SSE by reading the raw
  `http.get` response stream, splitting on `\n\n` and parsing `data:` lines with the
  shared `parseSseData`.
- The opening `: connected` comment frame has no data line, so consumers skip frames
  without `data:`.
- The change stream needs a live replica set, so the streaming behaviour is
  integration tier only, with the pure framing helpers in the unit tier.

## Dependencies

Builds on deliverable 11 (change streams):
[11-change-streams](./11-change-streams.md), reusing its collection-agnostic
`establish`, `TARGET_KEY`, `INITIAL_LABEL` and `EventDoc`. It watches its own
`COLLECTIONS.sseEvents`, not the change-streams `events` collection. Through
deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md) it uses the
shared client and `closeClient` from [`src/db.ts`](../../src/db.ts) and the
centralised collection names from [`src/collections.ts`](../../src/collections.ts).
