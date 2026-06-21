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
