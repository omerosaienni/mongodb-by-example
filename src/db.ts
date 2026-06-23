import { MongoClient, type Db } from 'mongodb';

// directConnection=true is required: a single node replica set advertises its
// internal container hostname, which the host cannot resolve, so the driver must
// be told not to follow that advertisement.
const URI = 'mongodb://127.0.0.1:27017/?directConnection=true';

// Database the whole harness uses. One place so examples and seed agree.
export const DB_NAME = 'mongodb-by-example';

// One shared MongoClient per process. MongoClient construction is lazy in the
// driver: it does not touch the network until connect(), so building the
// instance here needs no live server and the getter can be unit tested for reuse.
let client: MongoClient | undefined;

// serverSelectionTimeoutMS keeps failures fast when the endpoint is down rather
// than hanging on the driver default of 30s.
export function getClient(): MongoClient {
  if (client === undefined) {
    client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
  }
  return client;
}

// Typed db handle off the one shared client. connect() is idempotent on the
// driver so callers need not coordinate who connects first.
export async function getDb(): Promise<Db> {
  const c = getClient();
  await c.connect();
  return c.db(DB_NAME);
}

// Close the shared client and clear it so a later getClient() rebuilds. Scripts
// and tests must call this or the process will not exit.
export async function closeClient(): Promise<void> {
  if (client !== undefined) {
    await client.close();
    client = undefined;
  }
}
