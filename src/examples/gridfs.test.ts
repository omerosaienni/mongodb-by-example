import { describe, expect, it } from 'vitest';
import { PAYLOAD, EXPECTED_SHA256, sha256 } from './gridfs.js';

// Pure unit tier: no database. Pins the payload's hash so a drift in the bytes is
// caught here, and confirms the hashing helper distinguishes a corrupted buffer
// from the original so the integration round trip cannot pass vacuously.

describe('the pinned hash matches the known payload', () => {
  it('hashes PAYLOAD to EXPECTED_SHA256', () => {
    expect(sha256(PAYLOAD)).toBe(EXPECTED_SHA256);
  });

  it('uses a non-trivial payload', () => {
    expect(PAYLOAD.length).toBeGreaterThan(0);
  });
});

describe('the hash detects corruption a length check would miss', () => {
  it('changes when a single byte flips, with the length unchanged', () => {
    const corrupted = Buffer.from(PAYLOAD);
    corrupted[0] ^= 0xff;
    expect(corrupted.length).toBe(PAYLOAD.length);
    expect(sha256(corrupted)).not.toBe(EXPECTED_SHA256);
  });

  it('changes when the payload is truncated', () => {
    const truncated = PAYLOAD.subarray(0, PAYLOAD.length - 1);
    expect(sha256(truncated)).not.toBe(EXPECTED_SHA256);
  });
});
