import type { Db } from 'mongodb';
import { getClient, closeClient } from '../db.js';
import { RBAC_DB } from '../collections.js';

// The user the example creates and the role it grants. readWrite is a built-in
// role scoped to RBAC_DB, so usersInfo reports exactly this {role, db} pair.
export const RBAC_USER = 'demo_rbac_user';
export const RBAC_ROLE = 'readWrite';

// A role grant as usersInfo and connectionStatus report it.
export interface RoleGrant {
  role: string;
  db: string;
}

// The slices of the command results this module reads. The driver types
// db.command as Document, so we narrow to typed shapes rather than reach into
// any.
export interface UsersInfoResult {
  users: { user: string; db: string; roles: RoleGrant[] }[];
}

export interface ConnectionStatusResult {
  authInfo: {
    authenticatedUsers: { user: string; db: string }[];
    authenticatedUserRoles: RoleGrant[];
  };
}

// Pure: pull a named user's role grants out of a usersInfo result. usersInfo can
// return several users, so match on name and return that user's roles, or [] if
// absent. Factored out so the unit tier exercises the extraction with no
// database and the integration test reuses the same definition of "recorded".
export function rolesOf(result: UsersInfoResult, name: string): RoleGrant[] {
  const user = result.users.find((u) => u.user === name);
  return user?.roles ?? [];
}

// Pure: is a named role on a given db present in a set of grants. Used to assert
// the grant was recorded without depending on array order.
export function hasRole(grants: RoleGrant[], role: string, db: string): boolean {
  return grants.some((g) => g.role === role && g.db === db);
}

function scratch(): Db {
  return getClient().db(RBAC_DB);
}

// Drop the user first so re-running does not fail with "User already exists".
// dropUser throws UserNotFound (code 11) when absent, which is the normal first
// run, so swallow it.
export async function dropRbacUser(): Promise<void> {
  await scratch()
    .command({ dropUser: RBAC_USER })
    .catch(() => false);
}

// Create the user with the single named role scoped to the scratch db. Idempotent
// via the prior drop.
export async function createRbacUser(): Promise<void> {
  await dropRbacUser();
  await scratch().command({
    createUser: RBAC_USER,
    pwd: 'demo-not-a-secret',
    roles: [{ role: RBAC_ROLE, db: RBAC_DB }],
  });
}

export async function usersInfo(): Promise<UsersInfoResult> {
  const result = await scratch().command({ usersInfo: RBAC_USER });
  return result as unknown as UsersInfoResult;
}

export async function connectionStatus(): Promise<ConnectionStatusResult> {
  const result = await scratch().command({ connectionStatus: 1 });
  return result as unknown as ConnectionStatusResult;
}

async function demo(): Promise<void> {
  await createRbacUser();

  const info = await usersInfo();
  const grants = rolesOf(info, RBAC_USER);
  console.log('created user:', RBAC_USER, 'on db', RBAC_DB);
  console.log('recorded roles (usersInfo):', JSON.stringify(grants));

  const status = await connectionStatus();
  console.log(
    'connectionStatus authenticatedUserRoles:',
    JSON.stringify(status.authInfo.authenticatedUserRoles),
  );

  // The honest caveat, part of done_definition: auth is open on localhost, so the
  // role grant is recorded (visible above via usersInfo) but not wire-enforced.
  // The open connection authenticated as nobody, so connectionStatus reports an
  // empty authenticatedUserRoles even though the user holds readWrite.
  console.log('NOTE: auth is open on localhost, so the grant is recorded but not enforced.');
  console.log(
    'NOTE: connectionStatus shows no authenticated roles because this connection is unauthenticated.',
  );

  // Leave the server clean: do not strand the scratch user for the next run or
  // for other deliverables.
  await dropRbacUser();
}

// Run directly via `npm run ex:rbac`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
