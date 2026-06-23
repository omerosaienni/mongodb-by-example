# Mongo playground

A local MongoDB learning harness that doubles as a worked example of an
agent-driven build workflow. It serves two purposes:

1. **Show how to interact with MongoDB.** The range of community Mongo features,
   each a small independently runnable example module. The native TypeScript
   driver throughout, Mongo running in Docker as a single node replica set, Make
   orchestrating infra and npm running the examples and tests. Built for learning,
   so a clear example beats production hardening.
2. **Exercise and showcase the [agent-sdlc](https://github.com/omerosaienni/agent-sdlc)
   workflow.** This whole repository was built by that workflow, one deliverable at
   a time, so it stands as a concrete example of the workflow producing a real
   project end to end. See [Built by agent-sdlc](#built-by-agent-sdlc) below.

## Built by agent-sdlc

Every feature here was delivered through the
[agent-sdlc](https://github.com/omerosaienni/agent-sdlc) build-judge loop, not
hand-written in one sitting. A design is cut into small independently verifiable
deliverables, then each runs through a multi-agent pipeline that builds it,
reviews it for conventions and scope, judges its behaviour by running the tests
itself, documents it, and opens a pull request. The repository is therefore both
the MongoDB reference and the artefact the workflow produced.

The trail is visible in the repo:

- `docs/ARCHITECTURE.md` plus `docs/modules/` are generated per deliverable.
- The pull request history is one PR per deliverable, the audit record of each
  increment.
- `.github/workflows/ci.yml` runs lint, format, typecheck and both test tiers on
  every PR to `main`, the same gates the loop runs locally before it commits.

## How the pieces split

Three tools, each with one job.

- **Make** orchestrates infra. It brings Mongo up in Docker, initialises the
  replica set, seeds, and tears down. See the target list below or run
  `make help`.
- **npm** runs the examples and the tests. Every feature is an `ex:<feature>`
  script and the two test tiers are `test:unit` and `test:integration`.
- **faker** generates the seed data at seed time, not a shipped static dump. The
  seed uses a deterministic faker seed so counts and sampled documents are stable,
  which is what lets the tests assert on concrete numbers.

## The database posture

- **Single node replica set.** Mongo runs as a one member replica set, not a
  standalone, because the change streams, transactions and oplog examples all need
  a replica set. `make up` brings the container up and initialises the set.
- **directConnection=true.** The connection URI sets `directConnection=true`. A
  single node replica set advertises its internal container hostname, which the
  host cannot resolve, so without direct connection the driver's topology discovery
  would try that hostname and fail. Direct connection skips discovery and talks to
  `127.0.0.1:27017` straight.
- **Auth is open on localhost.** The harness runs Mongo with auth off, so there is
  no username or password in the URI. The RBAC example (`npm run ex:rbac`) creates
  users and grants roles to show the model, but enforcement is not wired on the
  connection. It is illustrative, not wire-enforced, and it says so in its own
  output.
- **Vector search is out of scope.** Community Mongo lacks `mongot`, so vector
  search is Atlas-only. This harness does not stub a fake of it.

## Quick start

From a clean clone, in order. These bring up the database and load the seed.

```sh
npm install        # install dependencies
make up            # start Mongo in Docker and initialise the replica set
npm run seed       # generate and load the faker seed data
```

`make up` brings the container up, polls mongod for readiness, then initialises the
single node replica set, all idempotent. It is left out of the auto-verified block
below because the doc-check assumes Mongo is already running. Once Mongo is up and
seeded, every example, the test tiers and the dashboard are available.

### Verified command set

These commands are self-terminating and safe to run in order against a seeded
database. The README doc-check (`src/readme.integration.test.ts`) parses this exact
block and runs each line, so the README cannot drift from commands that work.

```sh
npx tsc --noEmit          # typecheck the Node sources
npm run lint              # eslint over src
npm run format:check      # prettier over the tree
npm run seed              # reload the deterministic faker seed
npm run ex:crud           # insertOne/Many, find, update, upsert, delete
npm run ex:indexes        # compound, partial and TTL indexes with explain
npm run ex:aggregation    # match, group, lookup, unwind, facet, bucket
npm run ex:validation     # jsonSchema validator, accepted and rejected writes
npm run ex:text           # text index and relevance-scored queries
npm run ex:geo            # 2dsphere index, near and within queries
npm run ex:transactions   # multi-document transaction, commit and abort
npm run ex:change-streams # change stream events and resume token
npm run ex:timeseries     # time series collection and windowed query
npm run ex:gridfs         # GridFS upload and byte-for-byte download
npm run ex:oplog          # read the oplog to show an inc logged as an absolute
npm run ex:rbac           # createUser, role grants, connectionStatus
npm run test:unit         # the unit tier, no database needed
```

The integration tier and the long-running servers are run separately, see below.
They are kept out of the verified block on purpose: the doc-check runs inside the
integration tier, so it must not run the integration tier again and it must not
start a server that never exits.

## Feature index

Each feature is one module under `src/examples/`, runnable on its own and printing
its results. The deliverable number ties it back to the per-module write-up under
`docs/modules/`.

| Feature                   | npm script                  | Module                           | Deliverable |
| ------------------------- | --------------------------- | -------------------------------- | ----------- |
| CRUD                      | `npm run ex:crud`           | `src/examples/crud.ts`           | 4           |
| Indexes                   | `npm run ex:indexes`        | `src/examples/indexes.ts`        | 5           |
| Aggregation pipeline      | `npm run ex:aggregation`    | `src/examples/aggregation.ts`    | 6           |
| Schema validation         | `npm run ex:validation`     | `src/examples/validation.ts`     | 7           |
| Text search               | `npm run ex:text`           | `src/examples/text.ts`           | 8           |
| Geospatial                | `npm run ex:geo`            | `src/examples/geo.ts`            | 9           |
| Transactions              | `npm run ex:transactions`   | `src/examples/transactions.ts`   | 10          |
| Change streams (headless) | `npm run ex:change-streams` | `src/examples/change-streams.ts` | 11          |
| Time series               | `npm run ex:timeseries`     | `src/examples/timeseries.ts`     | 12          |
| GridFS                    | `npm run ex:gridfs`         | `src/examples/gridfs.ts`         | 13          |
| Oplog peek                | `npm run ex:oplog`          | `src/examples/oplog.ts`          | 14          |
| RBAC                      | `npm run ex:rbac`           | `src/examples/rbac.ts`           | 15          |
| SSE server                | `npm run ex:sse`            | `src/examples/sse.ts`            | 16          |
| React dashboard           | `npm run dashboard:dev`     | `dashboard/`                     | 17          |

### Servers and the dashboard

These do not exit on their own, so they are not in the verified block. Run them in
a foreground terminal.

```text
npm run ex:sse         # SSE server holding a change stream, streams events over HTTP
npm run dashboard:dev  # Vite dev server, the React dashboard consuming the SSE feed
```

The dashboard also has its own checks: `npm run dashboard:typecheck`,
`npm run dashboard:test` and `npm run dashboard:build`.

## Tests

Two tiers. The unit tier has no external dependencies and runs with the database
down. The integration tier needs Mongo up and seeded, and its files are named
`*.integration.test.ts`.

```text
npm run test:unit         # unit tier, database down is fine
npm run test:integration  # integration tier, needs Mongo up and seeded
make test                 # unit then integration, in that order
```

The README doc-check lives in the integration tier as `src/readme.integration.test.ts`.
It parses the verified command block above and runs each command, failing on the
first non-zero exit, which is what keeps the documented commands honest.

## Make targets

```text
make help              # list targets
make up                # start mongod and ensure the replica set (idempotent)
make seed              # generate and load the faker seed data
make down              # stop the shared container, keep the data
make drop              # drop this project's database only
make test-unit         # run the unit tier
make test-integration  # run the integration tier
make test              # unit then integration
make graph             # rebuild the knowledge graph (code, docs, HTML)
make graph-viz         # regenerate the graph view from the existing graph
```

`make down` and `make drop` stop the shared container or drop this project's
database, so they are documented here but never run by the doc-check.

## Layout

- `src/` shared code, including the db helper (`src/db.ts`) and the collection
  names (`src/collections.ts`).
- `src/examples/` one runnable module per feature, co-located with its tests.
- `dashboard/` the Vite React dashboard.
- `scripts/` infra scripts driven by the Makefile.
- `docs/` the cross-cutting `docs/ARCHITECTURE.md` and a per-module write-up
  under `docs/modules/`.
- `.vscode/launch.json` debug configs, one per example plus the seed, servers,
  dashboard and test tiers.

## Licence

Released under the [MIT licence](LICENSE).
