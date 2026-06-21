import { faker } from '@faker-js/faker';
import { getDb, closeClient } from './db.js';
import { COLLECTIONS, type User, type Place, type Post } from './collections.js';

// Fixed faker seed: with it the generated counts and any sampled document are
// stable, so tests can assert on exact field values and shape, not just counts.
const FAKER_SEED = 1337;

// Exact per-collection counts the seed claims to insert. Tests import these and
// assert the collection counts match, so this is the single source of truth.
export const SEED_COUNTS = {
  users: 25,
  places: 15,
  posts: 40,
} as const;

// A GeoJSON Point with coordinates faker generates as [longitude, latitude].
function randomPoint(): User['location'] {
  return {
    type: 'Point',
    coordinates: [faker.location.longitude(), faker.location.latitude()],
  };
}

function makeUsers(count: number): User[] {
  return Array.from({ length: count }, () => ({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    age: faker.number.int({ min: 18, max: 80 }),
    bio: faker.lorem.sentences(2),
    location: randomPoint(),
  }));
}

function makePlaces(count: number): Place[] {
  return Array.from({ length: count }, () => ({
    name: faker.company.name(),
    category: faker.helpers.arrayElement(['cafe', 'park', 'museum', 'gym', 'library']),
    location: randomPoint(),
  }));
}

function makePosts(count: number, authorEmails: string[]): Post[] {
  return Array.from({ length: count }, () => ({
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraphs(2),
    tags: faker.helpers.arrayElements(['mongo', 'geo', 'text', 'crud', 'index'], 2),
    authorEmail: faker.helpers.arrayElement(authorEmails),
  }));
}

// Drop then insert so the seed is idempotent: re-running leaves exactly the
// claimed counts rather than accumulating duplicates.
export async function seedAll(): Promise<typeof SEED_COUNTS> {
  faker.seed(FAKER_SEED);

  const db = await getDb();
  const users = makeUsers(SEED_COUNTS.users);
  const places = makePlaces(SEED_COUNTS.places);
  const posts = makePosts(
    SEED_COUNTS.posts,
    users.map((u) => u.email),
  );

  const usersCol = db.collection<User>(COLLECTIONS.users);
  const placesCol = db.collection<Place>(COLLECTIONS.places);
  const postsCol = db.collection<Post>(COLLECTIONS.posts);

  await Promise.all([
    usersCol.drop().catch(() => false),
    placesCol.drop().catch(() => false),
    postsCol.drop().catch(() => false),
  ]);

  await usersCol.insertMany(users);
  await placesCol.insertMany(places);
  await postsCol.insertMany(posts);

  return SEED_COUNTS;
}

// Run directly via `npm run seed`. tsx executes this module, so the
// import.meta.url guard keeps seedAll importable from tests without re-running.
async function main(): Promise<void> {
  try {
    const counts = await seedAll();
    console.log('seeded collections:');
    for (const [name, count] of Object.entries(counts)) {
      console.log(`  ${name}: ${count}`);
    }
  } finally {
    await closeClient();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
