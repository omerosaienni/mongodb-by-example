import { describe, expect, it } from 'vitest';
import { rolesOf, hasRole, RBAC_USER, RBAC_ROLE, type UsersInfoResult } from './rbac.js';

// Pure unit tier: no database. Exercises the role extractor against hand-written
// usersInfo payloads so the integration assertions on the recorded grant cannot
// pass through a broken extractor. Fixtures are literals: if rolesOf or hasRole
// read the wrong field these fail.

const WITH_ROLE: UsersInfoResult = {
  users: [
    { user: RBAC_USER, db: 'rbac_scratch', roles: [{ role: RBAC_ROLE, db: 'rbac_scratch' }] },
  ],
};

const WITHOUT_ROLE: UsersInfoResult = {
  users: [{ user: RBAC_USER, db: 'rbac_scratch', roles: [] }],
};

describe('rolesOf extracts a named user grants', () => {
  it('returns the recorded role for the user', () => {
    const grants = rolesOf(WITH_ROLE, RBAC_USER);
    expect(grants).toEqual([{ role: RBAC_ROLE, db: 'rbac_scratch' }]);
  });

  it('returns an empty list for an unknown user', () => {
    expect(rolesOf(WITH_ROLE, 'someone_else')).toEqual([]);
  });

  it('returns an empty list when the user holds no roles', () => {
    expect(rolesOf(WITHOUT_ROLE, RBAC_USER)).toEqual([]);
  });
});

describe('hasRole detects a named role on a db', () => {
  it('is true when the grant is present', () => {
    expect(hasRole(rolesOf(WITH_ROLE, RBAC_USER), RBAC_ROLE, 'rbac_scratch')).toBe(true);
  });

  it('is false when the role name does not match', () => {
    expect(hasRole(rolesOf(WITH_ROLE, RBAC_USER), 'dbAdmin', 'rbac_scratch')).toBe(false);
  });

  it('is false when the db does not match, so a same-named role on another db is not counted', () => {
    expect(hasRole(rolesOf(WITH_ROLE, RBAC_USER), RBAC_ROLE, 'other_db')).toBe(false);
  });

  it('is false when no roles are recorded', () => {
    expect(hasRole(rolesOf(WITHOUT_ROLE, RBAC_USER), RBAC_ROLE, 'rbac_scratch')).toBe(false);
  });
});
