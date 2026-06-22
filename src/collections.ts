// Collection names live here only. Example modules and the seed import these
// constants rather than hardcoding strings so a rename is one edit.
export const COLLECTIONS = {
  users: 'users',
  places: 'places',
  posts: 'posts',
  // Dedicated scratch space for CRUD examples and tests. They insert, update and
  // delete freely here so the seeded collections other deliverables assert on
  // stay untouched.
  widgets: 'widgets',
  // Scratch space for the index examples. The module drops and rebuilds it with
  // its own deterministic documents and indexes, so it stays independent of the
  // seeded collections and of the widgets CRUD scratch space.
  metrics: 'metrics',
  // Scratch space for the aggregation examples. Orders carry the numeric and
  // array fields the pipelines group, bucket and unwind. Kept separate from the
  // other scratch collections so each module owns its own deterministic state.
  orders: 'orders',
  // The lookup target for the aggregation examples. Orders join to customers by
  // customerId, so $lookup has a second related collection to draw fields from.
  customers: 'customers',
  // Scratch space for the schema validation example. The module recreates it with
  // a $jsonSchema validator each run, so it owns its own state and never touches
  // the seeded collections.
  members: 'members',
  // Scratch space for the text-search example. Holds a fixed, hand-written corpus
  // rather than the seeded posts, whose faker text is random, so the tests can
  // name exactly which documents contain a term and in what relevance order.
  articles: 'articles',
  // Scratch space for the geospatial example. Holds fixed landmarks at known
  // coordinates rather than the faker-seeded places, whose points are random, so
  // the tests can assert exact nearest-first ordering and inside/outside inclusion.
  landmarks: 'landmarks',
  // Scratch space for the transactions example. Holds two accounts with fixed
  // starting balances, so the commit and abort tests assert concrete balances and
  // a conserved total a wrong implementation would not produce. Owned by the
  // module, which recreates it each run.
  accounts: 'accounts',
  // Scratch space for the change-streams example. The module opens a watch on it
  // then issues its own insert, update and delete so the observed events are
  // entirely its own, never another deliverable's writes leaking in. Recreated
  // each run so a stale doc cannot pre-trigger an event before the watch is open.
  events: 'events',
} as const;

// A GeoJSON Point as the driver and Mongo's 2dsphere index expect it.
// coordinates are [longitude, latitude], in that order.
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

// A seeded user. location is a GeoJSON Point for geospatial examples and bio is
// the free-text field for text-search examples.
export interface User {
  name: string;
  email: string;
  age: number;
  bio: string;
  location: GeoPoint;
}

// A place with coordinates, the target of geospatial queries.
export interface Place {
  name: string;
  category: string;
  location: GeoPoint;
}

// A post with free text, the target of text-search examples. authorEmail links
// loosely to a seeded user.
export interface Post {
  title: string;
  body: string;
  tags: string[];
  authorEmail: string;
}

// The scratch document shape for CRUD examples. sku is the natural key the
// upsert filters on and stock is the field updates mutate.
export interface Widget {
  sku: string;
  name: string;
  colour: string;
  stock: number;
}

// The scratch document shape for the index examples. category and score back the
// compound index, active backs the partial index, and expireAt backs the TTL
// index.
export interface Metric {
  category: string;
  score: number;
  active: boolean;
  expireAt: Date;
}

// An order for the aggregation examples. customerId joins to a Customer for
// $lookup, status keys the $group, amount feeds $group totals and $bucket
// boundaries, and tags is the array $unwind expands.
export interface Order {
  orderId: string;
  customerId: string;
  status: 'paid' | 'pending' | 'cancelled';
  amount: number;
  tags: string[];
}

// The $lookup target for the aggregation examples. customerId is the join key
// orders reference, region gives a second field to confirm the joined document
// carries the expected related values.
export interface Customer {
  customerId: string;
  name: string;
  region: string;
}

// The scratch document shape for the text-search example. title and body are the
// two text-indexed fields the $text query searches, and the deterministic corpus
// repeats the search term a known number of times so relevance ordering is fixed.
export interface Article {
  title: string;
  body: string;
}

// The scratch document shape for the geospatial example. location is a GeoJSON
// Point the 2dsphere index covers, and the fixed landmarks sit at known
// coordinates so nearest-first ordering and inside/outside inclusion are exact.
export interface Landmark {
  name: string;
  location: GeoPoint;
}

// The scratch document shape for the transactions example. accountId is the
// natural key the transfer filters on and balance is the field the debit and
// credit updates mutate inside a session. balance is a plain number serialised as
// BSON double, fine here because the conserved-total assertion compares exact
// integer-valued balances.
export interface Account {
  accountId: string;
  balance: number;
}

// The scratch document shape for the change-streams example. key is a stable
// natural identifier the module targets with its update and delete, and label is
// a mutable field so an update event carries a distinguishing changed value the
// tests assert on. The fixed seed keys let the resume test name exactly which
// post-token write the reopened stream must deliver.
export interface EventDoc {
  key: string;
  label: string;
}

// The validated document shape for the schema validation example. The $jsonSchema
// validator enforces these at the server: name and email are required strings,
// email must match a pattern, and age must be a number at or above a minimum. age
// is a plain number not an int, because the driver serialises JS numbers as BSON
// double, which a strict bsonType 'int' validator would reject.
export interface Member {
  name: string;
  email: string;
  age: number;
}
