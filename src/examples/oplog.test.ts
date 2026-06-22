import { describe, expect, it } from 'vitest';
import {
  deltaContainsInc,
  extractUpdatedValue,
  START_VALUE,
  INCREMENT,
  type OplogDelta,
} from './oplog.js';

// Pure unit tier: no database. Exercises the two predicates the integration test
// relies on, against hand-written fixture deltas, so both tiers agree on what
// "idempotent form" means and the integration assertion cannot pass vacuously.

// The shape a mongo 5+ server logs for our $inc: the resulting absolute value
// under diff.u, with no operator. Pinned as a literal to match the real entry the
// module observed ({"$v":2,"diff":{"u":{"counter":8}}}).
const GOOD_DELTA: OplogDelta = { $v: 2, diff: { u: { counter: START_VALUE + INCREMENT } } };

// A hypothetical broken delta that logged the relative instruction instead. The
// integration test must fail against a server that produced this, so the
// predicate has to detect it.
const BAD_DELTA: OplogDelta = { $inc: { counter: INCREMENT } };

describe('extractUpdatedValue reads the absolute resulting value', () => {
  it('returns the value under diff.u for the updated field', () => {
    expect(extractUpdatedValue(GOOD_DELTA, 'counter')).toBe(8);
  });

  it('returns undefined for a field the delta did not update', () => {
    expect(extractUpdatedValue(GOOD_DELTA, 'other')).toBeUndefined();
  });
});

describe('deltaContainsInc detects the relative instruction', () => {
  it('is false for the idempotent absolute-value delta', () => {
    expect(deltaContainsInc(GOOD_DELTA)).toBe(false);
  });

  it('is true when the delta carries a $inc operator', () => {
    expect(deltaContainsInc(BAD_DELTA)).toBe(true);
  });
});
