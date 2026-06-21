import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Article } from '../collections.js';
import { INDEX_NAMES, SEARCH_TERM, resetAndSeed, searchByRelevance, isDescending } from './text.js';

async function articles(): Promise<Collection<Article>> {
  const db = await getDb();
  return db.collection<Article>(COLLECTIONS.articles);
}

// Build the known state once: every assertion is read-only so they share one
// seeded, indexed collection rather than rebuilding per test.
beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await articles();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('text index creation', () => {
  it('creates the text index over title and body by name', async () => {
    const col = await articles();
    const all = await col.listIndexes().toArray();
    const text = all.find((i) => i.name === INDEX_NAMES.text);
    expect(text).toBeDefined();
    // A text index records its fields as weights, not the literal 'text' keys.
    expect(text?.weights).toEqual({ title: 1, body: 1 });
  });
});

describe('a $text query matches only documents containing the term', () => {
  it('returns the two articles mentioning the term and excludes the rest', async () => {
    const results = await searchByRelevance(SEARCH_TERM);
    const titles = results.map((r) => r.title);
    // Exactly the documents that contain the term, no more.
    expect(titles).toEqual(['MongoDB tutorial', 'A brief note']);
    // The unrelated documents must never appear in a $text result.
    expect(titles).not.toContain('Cooking pasta');
    expect(titles).not.toContain('Garden notes');
  });
});

describe('results are ordered by the projected text score', () => {
  it('ranks the document that repeats the term above the single mention', async () => {
    const results = await searchByRelevance(SEARCH_TERM);
    const scores = results.map((r) => r.score);
    // Sorted by relevance descending, so the score sequence is non-increasing.
    expect(isDescending(scores)).toBe(true);
    // The tutorial repeats the term so it must outscore the lone mention, not
    // merely tie. This fails if the query ignored relevance and returned insertion
    // order or an arbitrary order.
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(results[0].title).toBe('MongoDB tutorial');
  });
});
