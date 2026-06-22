import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeClient } from '../db.js';
import { RBAC_DB } from '../collections.js';
import {
  RBAC_USER,
  RBAC_ROLE,
  createRbacUser,
  dropRbacUser,
  usersInfo,
  connectionStatus,
  rolesOf,
  hasRole,
} from './rbac.js';

// Drop before each create so the createUser is idempotent across re-runs and no
// case inherits another's user.
beforeEach(async () => {
  await dropRbacUser();
});

// Leave the server clean: strand no scratch user for other deliverables.
afterAll(async () => {
  await dropRbacUser();
  await closeClient();
});

describe('createUser records the granted role', () => {
  it('reports readWrite on the scratch db via usersInfo', async () => {
    await createRbacUser();

    const grants = rolesOf(await usersInfo(), RBAC_USER);
    // The grant is recorded with exactly the role and db we asked for. This
    // asserts the grant is recorded, not that any action is blocked, because auth
    // is open.
    expect(hasRole(grants, RBAC_ROLE, RBAC_DB)).toBe(true);
    expect(grants).toContainEqual({ role: RBAC_ROLE, db: RBAC_DB });
  });
});

describe('connectionStatus on the open connection', () => {
  it('reports no authenticated roles because auth is open', async () => {
    await createRbacUser();

    // Honest expected value: the open localhost connection authenticated as
    // nobody, so it carries no authenticated roles even though the user holds
    // readWrite. Granting a role does not authenticate the current connection.
    const status = await connectionStatus();
    expect(status.authInfo.authenticatedUserRoles).toEqual([]);
    expect(status.authInfo.authenticatedUsers).toEqual([]);
  });
});
