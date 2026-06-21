import { afterEach, describe, expect, it } from 'vitest';
import { getClient, closeClient } from './db.js';

// Unit tier: MongoClient construction is lazy so this never touches the network.
// It proves the one-shared-client property (acceptance criterion 1).

afterEach(async () => {
  await closeClient();
});

describe('db helper', () => {
  it('returns the same MongoClient instance on repeated calls', () => {
    const a = getClient();
    const b = getClient();
    expect(a).toBe(b);
  });

  it('rebuilds the client after close', async () => {
    const a = getClient();
    await closeClient();
    const b = getClient();
    expect(a).not.toBe(b);
  });
});
