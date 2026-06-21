import type { Collection, Document, IndexDescription } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Metric } from '../collections.js';

// Named so listIndexes and the tests can assert on each index by name rather
// than reconstructing the auto-generated name from its keys.
export const INDEX_NAMES = {
  compound: 'category_score',
  partial: 'active_score_partial',
  ttl: 'expireAt_ttl',
} as const;

// TTL window. Documents whose expireAt is older than this are eligible for the
// background TTL monitor to remove. The value is illustrative; the examples and
// tests assert the index exists with this option, not that a delete has fired,
// because the monitor only runs about once a minute.
export const TTL_SECONDS = 3600;

async function metrics(): Promise<Collection<Metric>> {
  const db = await getDb();
  return db.collection<Metric>(COLLECTIONS.metrics);
}

// Create the three indexes. createIndexes is idempotent: an index with the same
// name and spec is a no-op, so re-running the example does not error.
export async function createIndexes(): Promise<void> {
  const col = await metrics();
  const specs: IndexDescription[] = [
    // Compound index ordered to serve a query that filters on category and sorts
    // by score descending in one index scan: category ascending matches the
    // equality, score descending matches the sort direction.
    { key: { category: 1, score: -1 }, name: INDEX_NAMES.compound },
    // Partial index: only documents with active true are indexed, so a query
    // restricted to active documents can be served from a smaller index and
    // inactive documents never enter it.
    {
      key: { score: -1 },
      name: INDEX_NAMES.partial,
      partialFilterExpression: { active: true },
    },
    // TTL index: a single-field index on a Date with expireAfterSeconds. Mongo's
    // background monitor removes documents whose expireAt is older than the
    // window. TTL indexes must be single-field and on a date value.
    {
      key: { expireAt: 1 },
      name: INDEX_NAMES.ttl,
      expireAfterSeconds: TTL_SECONDS,
    },
  ];
  await col.createIndexes(specs);
}

// Explain a query that filters on category and sorts by score. With the compound
// index present the planner serves it from an index scan; without it the same
// query is a collection scan. Returns the winning plan's stage tree so callers
// and tests can inspect which stage won.
export async function explainCategoryQuery(category: string): Promise<Document> {
  const col = await metrics();
  return col
    .find({ category }, { projection: { _id: 0, category: 1, score: 1 } })
    .sort({ score: -1 })
    .explain('queryPlanner');
}

// Walk an explain winning plan and report whether an IXSCAN stage appears
// anywhere in the stage tree. The planner nests stages (SORT over FETCH over
// IXSCAN, or a covered IXSCAN alone), so a recursive walk is needed rather than
// inspecting only the top stage.
export function planUsesIndexScan(explain: Document): boolean {
  return findStage(explain.queryPlanner?.winningPlan, 'IXSCAN');
}

export function planUsesCollectionScan(explain: Document): boolean {
  return findStage(explain.queryPlanner?.winningPlan, 'COLLSCAN');
}

function findStage(plan: Document | undefined, stage: string): boolean {
  if (plan === undefined || plan === null) {
    return false;
  }
  if (plan.stage === stage) {
    return true;
  }
  // inputStage for single-child stages, inputStages for multi-child (e.g. OR).
  if (plan.inputStage !== undefined && findStage(plan.inputStage, stage)) {
    return true;
  }
  if (Array.isArray(plan.inputStages)) {
    return plan.inputStages.some((child: Document) => findStage(child, stage));
  }
  return false;
}

// The set of documents the partial index covers, read from the index itself by
// hinting it. A document with active false is absent from the partial index, so
// a full collection scan would return it but an index-hinted scan would not.
export async function activeScoresViaPartialIndex(): Promise<number[]> {
  const col = await metrics();
  const docs = await col
    .find({ active: true }, { projection: { _id: 0, score: 1 } })
    .hint(INDEX_NAMES.partial)
    .sort({ score: -1 })
    .toArray();
  return docs.map((d) => d.score);
}

// Deterministic documents the demo and tests share, so assertions can name exact
// expected values. expireAt is computed from a fixed base date passed in rather
// than now(), keeping the data stable across runs.
export function sampleMetrics(base: Date): Metric[] {
  return [
    { category: 'cpu', score: 90, active: true, expireAt: new Date(base.getTime()) },
    { category: 'cpu', score: 70, active: true, expireAt: new Date(base.getTime()) },
    { category: 'cpu', score: 50, active: false, expireAt: new Date(base.getTime()) },
    { category: 'mem', score: 80, active: true, expireAt: new Date(base.getTime()) },
    { category: 'mem', score: 30, active: false, expireAt: new Date(base.getTime()) },
  ];
}

// Drop and repopulate the scratch collection from a fixed base date, then build
// the indexes. Exported so the test can establish the same known state.
export async function resetAndSeed(base: Date): Promise<void> {
  const col = await metrics();
  await col.drop().catch(() => false);
  await col.insertMany(sampleMetrics(base));
  await createIndexes();
}

async function demo(): Promise<void> {
  // A fixed base date keeps the printed state reproducible run to run.
  const base = new Date('2026-01-01T00:00:00.000Z');
  await resetAndSeed(base);

  const col = await metrics();
  const built = await col.listIndexes().toArray();
  console.log(
    'indexes:',
    built.map((i) => i.name),
  );

  const explain = await explainCategoryQuery('cpu');
  console.log('category query uses index scan:', planUsesIndexScan(explain));
  console.log('category query uses collection scan:', planUsesCollectionScan(explain));

  // The partial index excludes the inactive cpu document scoring 50, so only the
  // two active cpu scores and the active mem score come back through the hint.
  console.log('active scores via partial index:', await activeScoresViaPartialIndex());
}

// Run directly via `npm run ex:indexes`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
