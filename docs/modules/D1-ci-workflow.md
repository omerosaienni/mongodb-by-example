# Deliverable D1 — CI workflow for pull requests to main

## Purpose

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) gates every pull
request that targets `main`. It runs the same checks the judge runs locally so a
PR cannot merge with a lint, format, type or test failure. The work is split into
five independent jobs that run in parallel rather than one long sequential job, so
each gate reports its own status and a failure in one (say lint) does not mask the
result of another (say integration). Four of the five jobs are infra-free (lint,
format, typecheck, unit). The fifth, integration, stands up the single node
replica set by reusing `make up` rather than re-encoding replica set setup in
YAML.

## Public interface

### [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

Trigger: `pull_request` scoped to `branches: [main]`.

Five jobs, all `runs-on: ubuntu-latest`, with no `needs:` between them so they run
fully in parallel. Every job shares the same setup: `actions/checkout@v4`, then
`actions/setup-node@v4` with `node-version: 22` and `cache: npm`, then `npm ci`,
then its own command(s):

- `lint` -> `npm run lint`
- `format` -> `npm run format:check`
- `typecheck` -> `npm run typecheck` then `npm run dashboard:typecheck`
- `unit` -> `npm run test:unit` (no database, no services)
- `integration` -> `make up`, then `npm run seed`, then `npm run test:integration`
  in that order

### [`package.json`](../../package.json)

- `typecheck`: `tsc --noEmit -p tsconfig.json` — the new root script, type checks
  `src` under strict mode. `dashboard:typecheck` already existed and is unchanged.
- `yaml` devDependency — the structural test parses the workflow as YAML, so a
  declared parser was added rather than depending on a transitive package.

### [`src/ci-workflow.test.ts`](../../src/ci-workflow.test.ts)

The gating test. A unit-tier structural contract over `ci.yml` and `package.json`
that parses both with the `yaml` package and asserts on the parsed object tree.

## Gotchas / design decisions

- The integration job reuses `make up` as the single source of truth for replica
  set bring-up rather than duplicating an `rs.initiate` in YAML. `make up` brings
  compose up, polls mongod for readiness, then runs `scripts/rs-init.sh` to
  initiate the single node set and wait for PRIMARY. `ubuntu-latest` ships Docker
  plus the compose plugin, so no `services:` block or extra Docker install is
  needed.
- The unit job declares no `services` block and no `make up` or `docker compose`
  step. The unit tier has no external dependency and must run with the database
  down.
- Node 22 is the target across all jobs, matching `@types/node` in the
  devDependencies.
- The structural test asserts on the parsed YAML object tree, not on raw text
  substrings, so a reordered or renamed step fails. Order-sensitive checks use a
  deep equality over the command arrays. It lives in the unit tier because it
  touches only local files (`ci.yml`, `package.json`) and never reaches Mongo.

## Tests

The gating test is [`src/ci-workflow.test.ts`](../../src/ci-workflow.test.ts), a
unit-tier structural contract over `ci.yml` and `package.json`. It maps each
asserted workflow property to one assertion: name, trigger, the five-job set,
per-job `runs-on`, parallelism (no `needs`), shared setup steps, `npm ci`
ordering, per-job command wiring, the unit job being database-free, the
integration step order, and the `package.json` typecheck script. The judge
confirmed it catches a wrong workflow via the hollow check: flipping the lint
command in `ci.yml` to `npm run lintx` turned the unit tier red, proving the
assertions are wired to real content.
