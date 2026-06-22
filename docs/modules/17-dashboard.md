# Deliverable 17 — React dashboard

## Purpose

A self-contained Vite React app that consumes the deliverable 16 SSE endpoint with
EventSource and renders a live-updating table of MongoDB change events, with no
refresh. It is a browser app, isolated from the Node-only `src/` tree so the
existing Node typecheck and test tiers are untouched. Run the dev server with
`npm run dashboard:dev` against a running `npm run ex:sse`, and the table grows a
row each time a document changes on the watched collection.

## Public interface

The dashboard is a browser app, not an imported library, so its surface is its
commands plus a small set of pure modules.

### Commands ([`package.json`](../../package.json))

- `dashboard:build` — typechecks the dashboard tsconfig then runs the vite build.
- `dashboard:typecheck` — type errors only, no emit.
- `dashboard:test` — the dashboard tests via their own vitest config (jsdom). The
  same tests also run inside `./scripts/agent-tests.sh unit`, see Verified behaviour.
- `dashboard:dev` — the dev server with the `/events` proxy.

### [`dashboard/src/sseRows.ts`](../../dashboard/src/sseRows.ts) (pure data layer)

- `frameToRow(frame: string): Row | null` — a raw SSE frame (`data: {...}\n\n`, or
  the `: connected` comment) to a table `Row`, or null for a non-data frame.
- `messageDataToRow(data: string): Row` — the bare JSON EventSource hands
  `onmessage` (the `data:` framing already stripped) to a `Row`.
- `changeToRow(change: ChangeEvent): Row` — the parsed change event to a `Row`.
- The `Row`, `ChangeEvent` and `EventDoc` interfaces.

### [`dashboard/src/sseClient.ts`](../../dashboard/src/sseClient.ts)

- `connectSse(options): SseClient` — the EventSource wrapper with an injectable
  `EventSourceFactory` and timer, and `EventSourceLike` for fakes.

### [`dashboard/src/useSseRows.ts`](../../dashboard/src/useSseRows.ts)

- `useSseRows({ url }): Row[]` — the React hook driving the live table, with a
  `browserFactory` adapting the real `EventSource` to `EventSourceLike`.

### UI

- [`dashboard/src/App.tsx`](../../dashboard/src/App.tsx) and
  [`dashboard/src/ChangesTable.tsx`](../../dashboard/src/ChangesTable.tsx) render
  the table.

## Key decisions

- Built as an isolated top-level `dashboard/` sub-app with its own tsconfig (DOM
  lib, `react-jsx`, Bundler resolution), its own `vite.config.ts`, and its own
  vitest project. The root tsconfig is Node-only (no DOM lib, `types: ["node"]`), so
  adding DOM or JSX under `src/` would break the existing `npx tsc --noEmit`. The
  dashboard tsconfig is never included by the root, so the Node typecheck and the
  `src/` test tiers stay untouched.
- The data layer (`sseRows.ts`) is pure and DOM-free so the wire-format transform is
  unit testable in isolation. This is the deliverable gate.
- `EventDoc` is redeclared locally in `sseRows.ts` rather than imported from
  [`src/collections.ts`](../../src/collections.ts). The shape is two fields and
  stable, and importing a `.js` server module into the browser bundler-resolution
  tsconfig is friction with no payoff. The local shape is asserted against the real
  wire format by the gate test.
- The reconnect wrapper takes an `EventSourceFactory` and a `setTimeout` function by
  injection, so a fake connection and a synchronous timer make the reconnect property
  deterministic without network or wall-clock waits.
- Newest rows are prepended (`[row, ...prev]`) so a new change appears at the top of
  the live table.

## Verified behaviour

Confirmed by the judge (PASS). The data-layer test feeds raw `data: {...}\n\n`
frames for insert, update and delete plus the opening `: connected` comment frame,
and asserts the concrete derived `Row` fields, with the comment frame yielding null.
The reconnect test drops a fake EventSource (sets it CLOSED then fires `onerror`) and
asserts a new distinct connection replaces it, the old one is closed, no reconnect
fires while the source is still CONNECTING, and none fires after an explicit
`close()`. The dashboard build is clean (the dashboard typecheck then the vite build)
and the root Node `tsc` stays clean, so the browser app did not leak into the Node
typecheck.

The dashboard's pure unit tests are folded into the project's unit tier through a
vitest projects config, so the judge's single `./scripts/agent-tests.sh unit` run
covers both the `src/` Node tests and the dashboard jsdom tests in one command (54
unit tests in total). The integration tier is unchanged and covers only `src/`.

The hollow check returned ASSERTS: changing the `Row` label so it was populated from
the change's `key` instead of its `label` made the derived row wrong, caught by the
data-layer test; the file was restored and re-verified green.

## Gotchas

- React 19 and `@types/react` 19 removed the global `JSX` namespace, so components
  import `type { JSX } from 'react'` and return `JSX.Element`. Omitting the import
  gives "Cannot find namespace 'JSX'".
- The DOM `EventSource.onmessage` is typed `MessageEvent`, but the wrapper's
  `EventSourceLike` needs only `{ data: string }` to stay DOM-independent and
  fakeable, so `browserFactory` adapts the real EventSource with getters and setters
  rather than handing it over directly.
- The dashboard reconnects only when `readyState === CLOSED`. While EventSource is
  still CONNECTING it is retrying itself, and opening a second connection would
  duplicate the stream. The reopen is deferred through a timer so a downed server
  does not cause a tight reconnect loop.
- EventSource strips the `data:` framing before `onmessage`, so the live client uses
  `messageDataToRow` (bare JSON) while `frameToRow` (the full `data: ...\n\n` frame,
  skipping the `: connected` comment) is what the gate test drives. A test asserts the
  two agree on the same change.
- Dev SSE comes through Vite's proxy: `/events` proxies to `http://127.0.0.1:3000`
  (the `DEFAULT_PORT` from [`src/examples/sse.ts`](../../src/examples/sse.ts)). Run
  `npm run ex:sse` then `npm run dashboard:dev`.

## Dependencies

Builds on deliverable 16 (the SSE server):
[16-sse](./16-sse.md) and its wire format. Frames are
`data: <JSON.stringify(change)>\n\n`, the opening frame is a `: connected\n\n`
comment with no `data:` line and is skipped, and the endpoint path is `/events`. The
`change` is a `ChangeStreamDocument<EventDoc>` with `EventDoc = { key, label }` from
[`src/collections.ts`](../../src/collections.ts); inserts and updates carry a
`fullDocument`, deletes do not. New packages: `react` and `react-dom` (dependencies);
`@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `vite`, `jsdom` and
`@testing-library/react` (dev dependencies).
