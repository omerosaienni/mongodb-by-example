import { describe, expect, it } from 'vitest';
import {
  EXPECTED_OPS,
  TARGET_KEY,
  RESUME_KEY,
  INITIAL_LABEL,
  UPDATED_LABEL,
} from './change-streams.js';

// Pure unit tier: no database. Confirms the fixed constants are shaped so the
// integration assertions on operationType and on the resumed write cannot pass
// vacuously. If the operation sequence were not three distinct CRUD types, or the
// resume key were not distinct from the target key, the integration test could
// pass for the wrong reason.

describe('the expected operation sequence is three distinct CRUD types', () => {
  it('is exactly insert, update, delete in order', () => {
    expect([...EXPECTED_OPS]).toEqual(['insert', 'update', 'delete']);
  });

  it('has no repeated operation type', () => {
    // Three inserts would satisfy a count-only integration check, so the unit
    // tier pins the types as distinct to keep that check honest.
    expect(new Set(EXPECTED_OPS).size).toBe(EXPECTED_OPS.length);
  });
});

describe('the resume key is distinct from the target key', () => {
  it('lets the resume test tell the post-token write from the earlier ones', () => {
    // The resume test asserts the reopened stream delivers RESUME_KEY. If it
    // equalled TARGET_KEY a redelivered pre-token event would pass falsely.
    expect(RESUME_KEY).not.toBe(TARGET_KEY);
  });
});

describe('the update changes the label to a new value', () => {
  it('moves between two distinct labels so an update event carries a real change', () => {
    expect(UPDATED_LABEL).not.toBe(INITIAL_LABEL);
  });
});
