# Mongo playground

A local MongoDB learning harness. Native TypeScript driver, Mongo in Docker as a
single node replica set, Make for infra, npm for per-feature examples.

## How this project does things

### Database access

- One shared MongoClient per process, created in the db helper at src/db.ts and
  imported everywhere. Never connect per query or per function. The dashboard
  server holds one client for its whole lifetime.
- The connection URI uses directConnection=true, because a single node replica
  set advertises its internal container hostname and the host cannot resolve it.
- Collection names come from one place (src/collections.ts or equivalent). Do not
  hardcode collection name strings in example modules, import them.

### Layout

- Shared code in src/. Example modules in src/examples/, one file per feature.
- Each example module is independently runnable via an npm script named ex:<feature>
  and prints its results when run.
- Infra scripts in scripts/. Make targets orchestrate infra (up, rs-init, seed,
  down, nuke, bootstrap). npm scripts run examples and tests.

### Data

- Seed data is generated with faker at seed time, not shipped as a static dump.
- Use a deterministic faker seed so counts and sampled documents are stable for
  tests.

### Tests

- vitest. Every deliverable ships with tests that would fail if the code were
  wrong. No tests that assert nothing.
- Index tests assert on the explain plan stage, not just query results.
- Tests that check matching behaviour seed documents that should not match and
  assert they are untouched.
- Two test tiers. Unit tests have no external dependencies and run with the
  database down. Integration tests need the Mongo endpoint and are named
  \*.integration.test.ts. A test that touches Mongo must be in the integration
  tier, never the unit tier.
- npm run test:unit runs the unit tier, test:integration runs the integration
  tier. The judge runs unit first, then integration; both must pass.

### Integration endpoints

- Mongo replica set at mongodb://127.0.0.1:27017 with directConnection=true.
  - Readiness: a connect succeeds, or docker compose ps shows the mongo service up and healthy.
  - Bring-up: docker compose up -d (then allow a few seconds for primary election).
- Integration tests need this endpoint up. They are an attended prerequisite, the
  loop does not start the database. If it is down the judge raises an environment
  block and waits for it, it does not fail the deliverable.

### TypeScript style

- Strict mode. Supply your own interfaces and pass them as driver generics, e.g.
  db.collection<User>('users'). Do not lean on any.
- async/await throughout, not raw promise chains.

### Writing

- British English. No em dashes, restructure the sentence instead. No Oxford
  commas. Direct and concise.

### Scope

- Vector search is out of scope. Community Mongo lacks mongot. If referenced,
  state it is Atlas-only, do not stub a fake.
