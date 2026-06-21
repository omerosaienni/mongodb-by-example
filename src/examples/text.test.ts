import { describe, expect, it } from 'vitest';
import { isDescending, sampleArticles, SEARCH_TERM } from './text.js';

// Pure unit tier: no database. Exercises the ordering predicate and confirms the
// fixed corpus is shaped so the term genuinely splits matching from non-matching.

describe('isDescending', () => {
  it('is true for a non-increasing sequence including ties', () => {
    expect(isDescending([3, 2, 2, 1])).toBe(true);
  });

  it('is true for a single element and the empty list', () => {
    expect(isDescending([5])).toBe(true);
    expect(isDescending([])).toBe(true);
  });

  it('is false when any later value rises above its predecessor', () => {
    expect(isDescending([1, 2])).toBe(false);
    expect(isDescending([3, 1, 2])).toBe(false);
  });
});

describe('the corpus splits on the search term', () => {
  it('has documents that contain the term and documents that do not', () => {
    const term = SEARCH_TERM.toLowerCase();
    const contains = (a: { title: string; body: string }): boolean =>
      `${a.title} ${a.body}`.toLowerCase().includes(term);
    const corpus = sampleArticles();
    const matching = corpus.filter(contains);
    const nonMatching = corpus.filter((a) => !contains(a));
    // Both sides must be non-empty or the integration test could pass vacuously by
    // returning everything or nothing.
    expect(matching.length).toBeGreaterThan(0);
    expect(nonMatching.length).toBeGreaterThan(0);
  });

  it('has one document that repeats the term more than another, fixing the order', () => {
    const term = SEARCH_TERM.toLowerCase();
    const count = (a: { title: string; body: string }): number =>
      `${a.title} ${a.body}`.toLowerCase().split(term).length - 1;
    const counts = sampleArticles()
      .map(count)
      .filter((n) => n > 0)
      .sort((x, y) => y - x);
    // At least two matching documents with distinct occurrence counts, so the
    // relevance ordering the integration test asserts is unambiguous.
    expect(counts.length).toBeGreaterThanOrEqual(2);
    expect(counts[0]).toBeGreaterThan(counts[1]);
  });
});
