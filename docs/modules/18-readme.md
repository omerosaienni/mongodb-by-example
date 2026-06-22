# Deliverable 18 — README finalisation

## Purpose

The README is the single entry point that takes a new reader from a clean clone to
every example running, and a doc-check test keeps its quoted commands from drifting
from the real ones. This deliverable replaces the early stub with the full guide and
adds the gate that proves the guide stays honest.

## Public interface

### [`README.md`](../../README.md)

The reader-facing guide, in these sections:

- How the pieces split: the Make, npm and faker division of labour. Make
  orchestrates infra, npm runs the examples and tests, faker generates the seed data
  at seed time with a deterministic seed.
- The database posture: the single node replica set, `directConnection=true`, the
  open auth posture, and the vector search exclusion.
- Quick start: the clone-to-seeded ordered commands (`npm install`, `make bootstrap`,
  `npm run seed`).
- Verified command set: the one fenced `sh` block the doc-check parses and runs.
- Feature index: a table of every example module, its npm script, its source file and
  its deliverable number, plus the SSE server and the dashboard.
- Servers and dashboard, Tests, Make targets, Layout.

### [`src/readme.integration.test.ts`](../../src/readme.integration.test.ts)

The gate. It exports no symbols; it is a vitest integration suite that parses the
README and runs its quoted commands, failing on the first non-zero exit.

## Key decisions

- The doc-check parses the README's own "Verified command set" `sh` block rather than
  holding a separate command list, so the test and the docs cannot disagree. It
  locates the block by the `### Verified command set` heading, takes the first
  following fenced `sh` block, strips trailing `# ...` comments, and runs each line.
- Auto-executed against prose-only split. Only self-terminating, non-destructive
  commands are in the verified block: `tsc`, `lint`, `format:check`, `seed`, the
  one-shot `ex:*` modules and `test:unit`. The bootstrap, the servers (`ex:sse`,
  `dashboard:dev`), the destructive targets (`make down`, `make nuke`) and the
  integration tier itself are documented in prose or separate non-parsed blocks,
  because the doc-check runs inside the integration tier, so it must not re-run that
  tier, start a server that never exits, or tear down the database the other
  integration tests share.
- One package.json script was added, `lint` = `eslint src`. The README quotes
  `npm run lint`, so the script must exist for that quoted command to exit zero. tsc
  is quoted as `npx tsc --noEmit` and the test tiers as the existing `test:unit` and
  `test:integration`, so no further scripts were needed. The old stub quoted
  `npm run typecheck` and `npm test`, neither of which existed; both are gone.

## Verified behaviour

Confirmed by the judge (PASS). The integration suite passing means the doc-check
executed every command in the README's verified block in order and each exited zero,
which is criterion 1 made executable. The feature index lists all fourteen example
surfaces (the thirteen `ex:*` modules plus the dashboard), and the README documents
the single node replica set, `directConnection=true` with its reason, the open auth
posture, and the vector search exclusion.

The hollow check returned ASSERTS: changing `npx tsc --noEmit` to a non-existent
command inside the verified block made the doc-check go red, then the README was
restored and the suite re-verified green. So the doc-check genuinely fails when the
README drifts from the real commands rather than passing vacuously.

## Gotchas

- The verified block must stay free of bootstrap and teardown commands. The
  integration tier assumes Mongo is already up, and the full accumulated integration
  suite shares that one database, so a stray `make nuke` or `make down` in the block
  would destroy the endpoint mid-suite.
- `ex:sse` and `dashboard:dev` never exit; they are listed in a separate `text`
  block, not the parsed `sh` block, so the doc-check never hangs on them.
- Each command runs with a generous per-command timeout because the `ex:*` modules
  connect to Mongo and do real work.
- The test resolves the repo root and the README path from `import.meta.url`, so it
  does not depend on the process working directory.

## Dependencies

Builds on every example module and the dashboard the README indexes and verifies:
deliverables 4, 5, 6, 7, 8, 9, 10 and 12 through 15 (the `ex:*` modules) and 17
(the dashboard), each with its own module doc under [docs/modules](.). This is the
terminal deliverable; merging it completes the project.
