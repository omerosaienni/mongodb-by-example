import { MongoClient } from 'mongodb';
import { afterAll, describe, expect, it } from 'vitest';

// Smoke test for deliverable 2. It assumes the database is already up and the
// replica set is initialised: run `make bootstrap` first. It connects from the
// host exactly as the rest of the harness will and asserts a PRIMARY exists, so
// it fails if mongod is down OR if the replica set was never initiated.

// directConnection=true is required: a single node replica set advertises its
// internal container hostname, which the host cannot resolve, so the driver must
// be told not to follow that advertisement.
const URI = 'mongodb://localhost:27017/?directConnection=true';

// replSetGetStatus returns a typed members array. We only care about state.
interface ReplSetMember {
  stateStr: string;
}

interface ReplSetStatus {
  set: string;
  members: ReplSetMember[];
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });

afterAll(async () => {
  await client.close();
});

describe('replica set smoke test', () => {
  it(
    'reports a PRIMARY member',
    async () => {
      await client.connect();
      const status = (await client
        .db('admin')
        .command({ replSetGetStatus: 1 })) as ReplSetStatus;

      expect(status.set).toBe('rs0');

      const states = status.members.map((m) => m.stateStr);
      expect(states).toContain('PRIMARY');
    },
    15000,
  );
});
