import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Article } from '../collections.js';

// Named so listIndexes and the tests can assert by name rather than
// reconstructing the auto-generated text index name from its weights.
export const INDEX_NAMES = {
  text: 'title_body_text',
} as const;

// The term the demo and tests search for. Chosen as a distinct, unambiguous word
// that is not a stop word and stems to itself, so case-insensitive stemming does
// not blur which corpus documents match.
export const SEARCH_TERM = 'mongodb';

// A row shaped for printing and asserting: the relevance score alongside the
// title, so callers compare ordering without carrying the whole document.
export interface ScoredArticle {
  title: string;
  score: number;
}

async function articles(): Promise<Collection<Article>> {
  const db = await getDb();
  return db.collection<Article>(COLLECTIONS.articles);
}

// A collection may carry at most one text index, so this single index spans both
// searchable fields. Naming it lets the test assert it exists by name.
export async function createTextIndex(): Promise<void> {
  const col = await articles();
  await col.createIndex({ title: 'text', body: 'text' }, { name: INDEX_NAMES.text });
}

// Deterministic corpus the demo and tests share. The term appears a known number
// of times so the relevance order is unambiguous: the first document repeats it,
// the second mentions it once, and the last two never mention it so they must be
// excluded from a $text match entirely.
export function sampleArticles(): Article[] {
  return [
    {
      title: 'MongoDB tutorial',
      body: 'MongoDB is a document database. Learning MongoDB pays off.',
    },
    {
      title: 'A brief note',
      body: 'This post mentions MongoDB once and moves on to other things.',
    },
    {
      title: 'Cooking pasta',
      body: 'Boil water, add salt, then the pasta. Nothing technical here.',
    },
    {
      title: 'Garden notes',
      body: 'Tomatoes need sun and water through the summer months.',
    },
  ];
}

// True if the scores are in non-increasing order. Pure so the unit tier can
// assert the ordering predicate without a database.
export function isDescending(scores: number[]): boolean {
  return scores.every((score, i) => i === 0 || scores[i - 1] >= score);
}

// Run a $text search and project the relevance score, sorted by that score
// descending. The score lives only in the textScore meta, so it must be projected
// to be sortable and returned. Documents that do not contain the term never enter
// a $text result, so the caller sees only matching articles ordered by relevance.
export async function searchByRelevance(term: string): Promise<ScoredArticle[]> {
  const col = await articles();
  const docs = await col
    .find(
      { $text: { $search: term } },
      { projection: { _id: 0, title: 1, score: { $meta: 'textScore' } } },
    )
    .sort({ score: { $meta: 'textScore' } })
    .toArray();
  // The projection adds score, which Article does not declare, so read each row
  // through a shape that carries it rather than widening the collection generic.
  return docs.map((d) => {
    const row = d as unknown as { title: string; score: number };
    return { title: row.title, score: row.score };
  });
}

// Drop and rebuild the scratch collection with the fixed corpus, then build the
// text index. Exported so the test can establish the same known state.
export async function resetAndSeed(): Promise<void> {
  const col = await articles();
  await col.drop().catch(() => false);
  await col.insertMany(sampleArticles());
  await createTextIndex();
}

async function demo(): Promise<void> {
  await resetAndSeed();

  const col = await articles();
  const built = await col.listIndexes().toArray();
  console.log(
    'indexes:',
    built.map((i) => i.name),
  );

  // Only the two documents containing the term come back, the tutorial first
  // because it repeats the term and so scores higher than the single mention.
  const results = await searchByRelevance(SEARCH_TERM);
  console.log(`results for "${SEARCH_TERM}" ordered by text score:`, results);
  console.log('ordered by descending score:', isDescending(results.map((r) => r.score)));
}

// Run directly via `npm run ex:text`. The import.meta.url guard keeps the exported
// helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
