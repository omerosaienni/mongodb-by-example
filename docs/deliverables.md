# Mongo playground deliverable sheet

## Goal

A local MongoDB learning harness that demonstrates the full range of community
Mongo features. Native TypeScript driver throughout, Mongo running in Docker as a
single node replica set, Make orchestrating infra and npm running per-feature
example modules. Each feature is an independently runnable, tested module. A React
dashboard watches change streams live over SSE. Built for learning, so clarity of
example beats production hardening. Vector search is out of scope (community Mongo
lacks mongot).

## Deliverables

### 1
- title: Scaffold and tooling
- depends_on: []
- description: Project skeleton. package.json, tsconfig, vitest config, eslint and
  prettier, gitignore, Makefile skeleton with a help target, source and example
  directory layout, README stub.
- done_definition: A clean repo where typecheck and the test runner both run
  green on an empty suite and make help lists targets.
- acceptance_criteria:
  - npx tsc --noEmit exits zero
  - npm test exits zero on the empty or placeholder suite
  - make help prints the target list and exits zero
  - eslint runs over src and exits zero
- test_notes: A placeholder test proves the runner is wired. It must actually
  execute, not be skipped. A trivially true assertion is acceptable here only
  because there is no feature yet.

### 2
- title: Docker and replica set bring-up
- depends_on: [1]
- description: docker compose for Mongo 8.x with a named volume. An idempotent
  rs-init script initialising a single node replica set. Make targets up, rs-init,
  down, nuke, and bootstrap that chains them.
- done_definition: From nothing, one command brings Mongo up, initialises the
  replica set, and the host can connect to it.
- acceptance_criteria:
  - make bootstrap brings the container up and initialises the set with no manual
    steps
  - a smoke test connects from the host using directConnection=true and asserts
    the replica set status reports a PRIMARY
  - running rs-init a second time does not error (idempotent)
  - make nuke removes the container and the volume
- test_notes: The smoke test must fail if the replica set is not initialised, so
  it asserts on the PRIMARY state specifically, not merely on a successful TCP
  connect.

### 3
- title: Connection helper and seed
- depends_on: [2]
- description: A db helper exposing one shared MongoClient for the process. A seed
  script using faker with an optional deterministic seed, populating the
  collections the example modules need, including documents with coordinates and
  free text.
- done_definition: A single shared client connects, and the seed populates known
  collections with documents of the expected shape.
- acceptance_criteria:
  - the helper creates exactly one MongoClient and reuses it
  - npm run seed populates the seeded collections and exits zero
  - a test asserts collection counts match what the seed claims to insert
  - a test asserts a sampled document has the expected fields and types,
    including a GeoJSON point and a text field
- test_notes: With faker seeded deterministically, counts and a sampled document
  are stable. The test must fail if the seed shape drifts, so it checks field
  presence and type, not just a non-zero count.

### 4
- title: CRUD
- depends_on: [3]
- description: Example module covering insertOne, insertMany, find with filters
  and projection, updateOne, updateMany, upsert, deleteOne, deleteMany.
- done_definition: Each CRUD operation runs against seeded data and produces the
  documented result.
- acceptance_criteria:
  - npm run ex:crud runs and exits zero
  - tests assert insert returns ids and the documents are retrievable
  - tests assert an update changes only matched documents and an upsert creates
    when absent
  - tests assert a delete removes only matched documents
- test_notes: Tests must distinguish matched from unmatched, so an updateMany or
  deleteMany test seeds documents that should not match and asserts they are
  untouched.

### 5
- title: Indexes
- depends_on: [3]
- description: Example module creating a compound index, a partial index, and a
  TTL index, and using explain to show the query planner uses them.
- done_definition: The indexes exist and a query that should use one is shown by
  explain to use an index scan rather than a collection scan.
- acceptance_criteria:
  - npm run ex:indexes runs and exits zero
  - listIndexes confirms each index was created with the expected keys and options
  - a test runs explain on a covered query and asserts the winning plan uses
    IXSCAN, not COLLSCAN
  - the partial index test asserts a document outside the filter is not indexed
- test_notes: The explain assertion is the real gate. The test must fail if the
  index is absent or ignored, so it inspects the winning plan stage, not just
  query results.

### 6
- title: Aggregation pipeline
- depends_on: [3]
- description: Example module covering match, group, sort, project, lookup,
  unwind, facet, and bucket against seeded data.
- done_definition: Each pipeline produces the documented, deterministic result
  against the seed.
- acceptance_criteria:
  - npm run ex:aggregation runs and exits zero
  - tests assert group totals and counts match hand-computed expectations from the
    deterministic seed
  - a lookup test asserts joined documents contain the expected related fields
  - a facet test asserts each facet returns its expected shape
- test_notes: Expected values come from the deterministic seed, so tests assert on
  concrete numbers a wrong pipeline would not produce, not just on result length.

### 7
- title: Schema validation
- depends_on: [3]
- description: Example module applying a collection validator with jsonSchema,
  then demonstrating accepted and rejected writes.
- done_definition: A valid document inserts and an invalid one is rejected by the
  server with a validation error.
- acceptance_criteria:
  - npm run ex:validation runs and exits zero
  - a test asserts a conforming document inserts successfully
  - a test asserts a non-conforming document is rejected with a document
    validation error
- test_notes: The rejection test must assert on the validation failure
  specifically, so it fails if the validator is missing and the bad write
  silently succeeds.

### 8
- title: Text search
- depends_on: [3]
- description: Example module creating a text index and running text queries with
  relevance scoring.
- done_definition: A text query returns the relevant documents ordered by text
  score.
- acceptance_criteria:
  - npm run ex:text runs and exits zero
  - a test asserts a query returns the documents known to contain the term and
    excludes those that do not
  - a test asserts results are ordered by the projected text score
- test_notes: The seed must contain documents that should and should not match, so
  the test fails if the query returns everything or ignores relevance.

### 9
- title: Geospatial
- depends_on: [3]
- description: Example module creating a 2dsphere index and running near and within
  queries against seeded coordinates.
- done_definition: A near query returns points ordered by distance and a within
  query returns only points inside the given area.
- acceptance_criteria:
  - npm run ex:geo runs and exits zero
  - a test asserts near results are ordered nearest first from a known origin
  - a test asserts a within query includes a point known to be inside and excludes
    one known to be outside
- test_notes: Seed includes points at known coordinates, so the ordering and
  inclusion assertions fail if the index or query is wrong, not just if results
  are empty.

### 10
- title: Transactions
- depends_on: [3]
- description: Example module performing a multi-document transaction (a transfer
  between two accounts) demonstrating both commit and abort.
- done_definition: On commit both writes apply, on abort neither applies, and the
  conserved total is invariant.
- acceptance_criteria:
  - npm run ex:transactions runs and exits zero
  - a commit test asserts both account balances changed and their sum is unchanged
  - an abort test asserts neither balance changed after a forced rollback
- test_notes: The abort test must force a failure mid-transaction and assert no
  partial write survived, so it fails if the operations were not actually wrapped
  in a session.

### 11
- title: Change streams
- depends_on: [3]
- description: Headless example module opening a change stream, performing writes,
  and observing events, including resuming from a resume token.
- done_definition: Writes produce change events of the correct operation type and
  the stream resumes from a stored token.
- acceptance_criteria:
  - npm run ex:change-streams runs and exits zero
  - a test performs an insert, update, and delete and asserts events of each
    matching operationType arrive
  - a test stores a resume token, performs a further write, reopens from the token,
    and asserts the later event is received
- test_notes: The resume test must miss the event if the token is ignored, so it
  asserts the resumed stream delivers the post-token write and not a duplicate of
  earlier ones.

### 12
- title: Time series collections
- depends_on: [3]
- description: Example module creating a time series collection, inserting
  timestamped measurements, and running a windowed query.
- done_definition: The collection is created as time series and a window query
  returns the expected measurements.
- acceptance_criteria:
  - npm run ex:timeseries runs and exits zero
  - a test asserts the collection metadata confirms it is a time series collection
    with the expected timeField
  - a test asserts a time-window query returns only measurements inside the window
- test_notes: Inserted timestamps are fixed, so the window assertion fails if the
  query bounds are wrong, and the metadata assertion fails if the collection was
  created as an ordinary collection.

### 13
- title: GridFS
- depends_on: [3]
- description: Example module uploading a file to GridFS and downloading it back.
- done_definition: A file uploaded to GridFS downloads back byte-for-byte
  identical.
- acceptance_criteria:
  - npm run ex:gridfs runs and exits zero
  - a test uploads a known payload and asserts a hash of the downloaded bytes
    matches the hash of the original
- test_notes: The round-trip hash must differ if the stream is truncated or
  corrupted, so the test compares a content hash, not just file length.

### 14
- title: Oplog peek
- depends_on: [3]
- description: Example module performing a relative update then reading the oplog
  to show the operation was logged as a concrete result.
- done_definition: An inc update is shown in the oplog as a concrete value
  assignment, not as the relative instruction.
- acceptance_criteria:
  - npm run ex:oplog runs and exits zero
  - the module performs an inc on a known field and reads the latest matching
    local.oplog.rs entry
  - a test asserts the logged entry encodes the resulting absolute value and does
    not contain the inc operator
- test_notes: This is the idempotency property made executable. The test must fail
  if the entry stored the relative instruction, so it asserts on the diff content
  carrying the result value.

### 15
- title: RBAC
- depends_on: [3]
- description: Example module demonstrating createUser, role grants, and
  connectionStatus against a scratch database. Auth runs open on localhost, so
  this is illustrative of the model rather than wire-enforced.
- done_definition: A user is created with specific roles and connectionStatus
  reflects the granted roles.
- acceptance_criteria:
  - npm run ex:rbac runs and exits zero
  - a test creates a user with a named role and asserts the role appears on the
    user via usersInfo
  - a test asserts connectionStatus reports the expected authenticated roles
  - the module states in output that enforcement is off because auth is open
- test_notes: The honest caveat is part of done. The test asserts the role grant
  is recorded, not that an unauthorised action is blocked, since auth is open.

### 16
- title: SSE server
- depends_on: [11]
- description: A Node server holding a change stream and exposing the events on an
  SSE endpoint, with one shared client for the server lifetime.
- done_definition: A client connected to the SSE endpoint receives an event when a
  document changes.
- acceptance_criteria:
  - the server starts and the SSE endpoint holds an open connection
  - an integration test connects to the endpoint, performs a write to the watched
    collection, and asserts a corresponding event is received over SSE
  - the server uses a single shared MongoClient, not one per request
- test_notes: The test must fail if the change stream is not wired to the
  response, so it triggers a real write and waits for the streamed event rather
  than asserting only that the endpoint returns 200.

### 17
- title: React dashboard
- depends_on: [16]
- description: A Vite React app using EventSource to consume the SSE endpoint and
  render a live-updating table of changes.
- done_definition: The dashboard renders incoming change events live without a
  refresh.
- acceptance_criteria:
  - the app builds with no type errors
  - a data-layer test asserts incoming SSE messages are parsed into the table row
    shape the UI renders
  - the EventSource wiring reconnects on connection drop
- test_notes: UI rendering is hard to assert objectively, so the gate is the
  data-layer transform: the test feeds raw SSE message payloads and asserts the
  derived rows, failing if parsing is wrong.

### 18
- title: README finalisation
- depends_on: [4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 17]
- description: Complete the README. The run-everything story, the Make and npm and
  faker split, the single node replica set and directConnection note, the feature
  index, and the vector search out-of-scope note.
- done_definition: A new reader can go from clone to every example running using
  only the README, and every documented command works.
- acceptance_criteria:
  - every command quoted in the README runs and exits zero when executed in order
    from a clean clone
  - the feature index lists every example module and its npm script
  - the replica set, directConnection, auth posture, and vector exclusion are each
    documented
- test_notes: A documentation check executes each quoted command from a clean
  bootstrap and fails on the first non-zero exit, so the README cannot drift from
  the actual commands.