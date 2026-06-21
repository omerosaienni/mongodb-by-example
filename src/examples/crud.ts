import type { Collection, InsertOneResult, InsertManyResult } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Widget } from '../collections.js';

// Every CRUD example operates on the widgets scratch collection so the seeded
// users, places and posts other deliverables assert on are never mutated.
async function widgets(): Promise<Collection<Widget>> {
  const db = await getDb();
  return db.collection<Widget>(COLLECTIONS.widgets);
}

export async function insertOneWidget(widget: Widget): Promise<InsertOneResult<Widget>> {
  const col = await widgets();
  return col.insertOne(widget);
}

export async function insertManyWidgets(items: Widget[]): Promise<InsertManyResult<Widget>> {
  const col = await widgets();
  return col.insertMany(items);
}

// find with a filter and a projection. The projection drops _id and keeps only
// the fields a caller asked for, so this returns partial documents by design.
export async function findInStock(minStock: number): Promise<Pick<Widget, 'sku' | 'stock'>[]> {
  const col = await widgets();
  return col
    .find({ stock: { $gte: minStock } }, { projection: { _id: 0, sku: 1, stock: 1 } })
    .toArray();
}

// updateOne touches at most one document. Returns matched and modified counts so
// callers can tell a no-op match from a real change.
export async function restockOne(sku: string, stock: number): Promise<{ matched: number; modified: number }> {
  const col = await widgets();
  const res = await col.updateOne({ sku }, { $set: { stock } });
  return { matched: res.matchedCount, modified: res.modifiedCount };
}

// updateMany over a colour. Only documents matching the filter change, the rest
// are left untouched.
export async function recolourAll(
  from: string,
  to: string,
): Promise<{ matched: number; modified: number }> {
  const col = await widgets();
  const res = await col.updateMany({ colour: from }, { $set: { colour: to } });
  return { matched: res.matchedCount, modified: res.modifiedCount };
}

// upsert: update when a widget with this sku exists, otherwise create it. The
// returned upsertedId is non-null only when a new document was created.
export async function upsertBySku(widget: Widget): Promise<{ upserted: boolean }> {
  const col = await widgets();
  const res = await col.updateOne(
    { sku: widget.sku },
    { $set: widget },
    { upsert: true },
  );
  return { upserted: res.upsertedId !== null };
}

export async function deleteOneBySku(sku: string): Promise<number> {
  const col = await widgets();
  const res = await col.deleteOne({ sku });
  return res.deletedCount;
}

// deleteMany by colour. Only matching documents are removed.
export async function deleteManyByColour(colour: string): Promise<number> {
  const col = await widgets();
  const res = await col.deleteMany({ colour });
  return res.deletedCount;
}

// Run end to end against a clean scratch collection and print each step's result.
async function demo(): Promise<void> {
  const col = await widgets();
  // Start from empty so the printed counts are reproducible run to run.
  await col.drop().catch(() => false);

  const one = await insertOneWidget({ sku: 'W-001', name: 'Bolt', colour: 'red', stock: 5 });
  console.log('insertOne id:', one.insertedId.toString());

  const many = await insertManyWidgets([
    { sku: 'W-002', name: 'Nut', colour: 'red', stock: 0 },
    { sku: 'W-003', name: 'Washer', colour: 'blue', stock: 12 },
    { sku: 'W-004', name: 'Screw', colour: 'blue', stock: 3 },
  ]);
  console.log('insertMany ids:', Object.values(many.insertedIds).length);

  console.log('find stock >= 3, projected:', await findInStock(3));

  console.log('updateOne W-002 stock=20:', await restockOne('W-002', 20));
  console.log('updateMany red -> green:', await recolourAll('red', 'green'));

  console.log('upsert existing W-001:', await upsertBySku({ sku: 'W-001', name: 'Bolt', colour: 'green', stock: 9 }));
  console.log('upsert absent W-999:', await upsertBySku({ sku: 'W-999', name: 'Pin', colour: 'black', stock: 1 }));

  console.log('deleteOne W-004:', await deleteOneBySku('W-004'));
  console.log('deleteMany blue:', await deleteManyByColour('blue'));

  console.log('remaining widgets:', await col.countDocuments());
}

// Run directly via `npm run ex:crud`. The import.meta.url guard keeps the
// exported operations importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
