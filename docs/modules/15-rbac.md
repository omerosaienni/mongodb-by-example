# Deliverable 15 — RBAC

## Purpose

An illustrative tour of MongoDB's role-based access control model on a dedicated
scratch database, honest that open localhost auth records grants but does not wire
enforce them. [`src/examples/rbac.ts`](../../src/examples/rbac.ts) creates a user
with a single built-in role, reads the grant back via `usersInfo`, and reads
`connectionStatus` on the open connection. Run it with `npm run ex:rbac`; it prints
the created user, the recorded `readWrite` grant on `rbac_scratch`, the empty
`connectionStatus` authenticated roles, and two NOTE lines stating that the grant is
recorded but not enforced because auth is open, then drops the user and exits zero.

## Public interface

### [`src/examples/rbac.ts`](../../src/examples/rbac.ts)

All commands run on the `rbac_scratch` database via the shared client, typed by
narrowing `db.command` results to local interfaces.

- `RBAC_USER`, `RBAC_ROLE` — the user the example creates (`demo_rbac_user`) and the
  built-in role it grants (`readWrite`), scoped to `RBAC_DB`.
- `RoleGrant`, `UsersInfoResult`, `ConnectionStatusResult` — typed slices of the
  command results the module reads, since the driver types `db.command` as
  `Document`.
- `rolesOf(result, name): RoleGrant[]` — pure extractor of a named user's grants
  from a `usersInfo` result, returning `[]` if the user is absent.
- `hasRole(grants, role, db): boolean` — pure predicate, true only when both the
  role name and the db match, so a same-named role on another db is not counted.
- `dropRbacUser(): Promise<void>` — drops the scratch user, swallowing the
  not-found case so the first run is clean.
- `createRbacUser(): Promise<void>` — drops first then creates the user with the
  single named role, idempotent.
- `usersInfo(): Promise<UsersInfoResult>`, `connectionStatus(): Promise<ConnectionStatusResult>` —
  server-command wrappers on the scratch db.

### [`src/collections.ts`](../../src/collections.ts) additions

- `RBAC_DB` (`rbac_scratch`) — the scratch database name. Kept outside the
  `COLLECTIONS` map because that map holds collection names, this is a db name.

### [`package.json`](../../package.json)

- `ex:rbac` — runs the module via `tsx src/examples/rbac.ts`.

## Key decisions

- Open auth means roles are recorded not enforced. `createUser` writes the grant to
  `system.users` and `usersInfo` reads it back, but no auth handshake happens on
  localhost, so nothing is gated. The module prints this caveat as part of its done
  definition, and the assertions check the recorded grant, never a blocked action.
- `connectionStatus` reports an empty `authenticatedUserRoles` on the open
  connection. Granting a role does not authenticate the current connection, so the
  honest reported value is `[]`. The integration test asserts that true value rather
  than faking an authenticated session.
- A dedicated scratch database `rbac_scratch`, not the harness `mongodb-by-example` db, so the
  user and grants never pollute the seeded collections other deliverables assert on.
  Every command runs through `scratch()` = `getClient().db(RBAC_DB)`.
- Pure `rolesOf` and `hasRole` helpers are factored out of the wrappers, so the unit
  tier proves the "is the role recorded" extraction with the database down and the
  integration test reuses the same definition of recorded.
- Drop-before-create idempotence, so re-running does not error with "User already
  exists". The demo finally path and the integration `afterAll` both drop the user
  to leave the server clean.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:rbac` runs and exits zero, creating
`demo_rbac_user`, recording `{role:'readWrite', db:'rbac_scratch'}` via `usersInfo`,
and printing `connectionStatus authenticatedUserRoles: []` on the unauthenticated
open connection plus the NOTE line stating the grant is recorded but not enforced
because auth is open. The integration tier asserts the recorded grant via
`hasRole(grants, RBAC_ROLE, RBAC_DB)` and the honest empty `authenticatedUserRoles`
and `authenticatedUsers`. The unit tier pins the extraction with literal `usersInfo`
fixtures covering with-role, without-role, unknown-user, role-mismatch and
db-mismatch cases. A hollow check faulting the granted db to `admin` turned the tier
red (ASSERTS), so the tests prove behaviour rather than passing vacuously.

## Gotchas

- Open auth is not wire enforced. Assert on the recorded grant, never on a blocked
  action.
- `createUser` fails if the user already exists, so drop first; the not-found case on
  the first run is swallowed.
- `connectionStatus` `authInfo.authenticatedUserRoles` is `[]` on the unauthenticated
  open connection, even though the user holds `readWrite`.
- Always clean up the scratch user, in the demo finally path and the integration
  `afterAll`, so it does not linger on the server.
- The commands need live Mongo, so the behavioural tests are integration tier only,
  with the pure `rolesOf` and `hasRole` assertions in the unit tier.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised `RBAC_DB`
scratch database name from [`src/collections.ts`](../../src/collections.ts), and
creates and drops its own scratch user rather than relying on the faker seed.
