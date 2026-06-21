import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, closeClient } from './db.js';
import { COLLECTIONS, type User } from './collections.js';
import { seedAll, SEED_COUNTS } from './seed.js';

// Integration tier: needs Mongo up at mongodb://127.0.0.1:27017. It seeds, then
// asserts counts match the claimed numbers and a sampled document has the
// expected fields and types including a GeoJSON Point and a free-text string.

beforeAll(async () => {
  await seedAll();
}, 30000);

afterAll(async () => {
  await closeClient();
});

describe('seed', () => {
  it('populates each collection with the claimed count', async () => {
    const db = await getDb();
    const users = await db.collection(COLLECTIONS.users).countDocuments();
    const places = await db.collection(COLLECTIONS.places).countDocuments();
    const posts = await db.collection(COLLECTIONS.posts).countDocuments();

    expect(users).toBe(SEED_COUNTS.users);
    expect(places).toBe(SEED_COUNTS.places);
    expect(posts).toBe(SEED_COUNTS.posts);
  });

  it('inserts users with the expected shape, a GeoJSON point and a text field', async () => {
    const db = await getDb();
    const user = await db.collection<User>(COLLECTIONS.users).findOne({});

    expect(user).not.toBeNull();
    if (user === null) return;

    expect(typeof user.name).toBe('string');
    expect(typeof user.email).toBe('string');
    expect(typeof user.age).toBe('number');

    // free-text field
    expect(typeof user.bio).toBe('string');
    expect(user.bio.length).toBeGreaterThan(0);

    // GeoJSON Point
    expect(user.location.type).toBe('Point');
    expect(Array.isArray(user.location.coordinates)).toBe(true);
    expect(user.location.coordinates).toHaveLength(2);
    const [lng, lat] = user.location.coordinates;
    expect(typeof lng).toBe('number');
    expect(typeof lat).toBe('number');
  });
});
