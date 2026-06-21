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
