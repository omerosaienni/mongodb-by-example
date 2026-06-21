import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Widget } from '../collections.js';
import {
  insertOneWidget,
  insertManyWidgets,
  findInStock,
  restockOne,
  recolourAll,
  upsertBySku,
  deleteOneBySku,
  deleteManyByColour,
} from './crud.js';

// CRUD tests mutate freely, so they own the widgets scratch collection and start
// each test from empty. The seeded collections are never touched here.
async function widgets(): Promise<Collection<Widget>> {
  const db = await getDb();
  return db.collection<Widget>(COLLECTIONS.widgets);
}

beforeEach(async () => {
  const col = await widgets();
  await col.drop().catch(() => false);
});

afterAll(async () => {
  const col = await widgets();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('crud insert', () => {
  it('insertOne returns an id and the document is retrievable by it', async () => {
    const res = await insertOneWidget({ sku: 'W-1', name: 'Bolt', colour: 'red', stock: 5 });
    expect(res.insertedId).toBeDefined();

    const col = await widgets();
    const found = await col.findOne({ _id: res.insertedId });
    expect(found?.sku).toBe('W-1');
    expect(found?.stock).toBe(5);
  });

  it('insertMany returns ids and every document is retrievable', async () => {
    const res = await insertManyWidgets([
      { sku: 'W-1', name: 'Nut', colour: 'red', stock: 1 },
      { sku: 'W-2', name: 'Washer', colour: 'blue', stock: 2 },
    ]);
    const ids = Object.values(res.insertedIds);
    expect(ids).toHaveLength(2);

    const col = await widgets();
    for (const id of ids) {
      const found = await col.findOne({ _id: id });
      expect(found).not.toBeNull();
    }
  });
});

describe('crud find with filter and projection', () => {
  it('returns only matching documents with only the projected fields', async () => {
    await insertManyWidgets([
      { sku: 'W-1', name: 'A', colour: 'red', stock: 1 },
      { sku: 'W-2', name: 'B', colour: 'blue', stock: 10 },
    ]);
    const rows = await findInStock(5);
    expect(rows).toEqual([{ sku: 'W-2', stock: 10 }]);
    // Projection drops _id, name and colour, so they must be absent.
    expect(rows[0]).not.toHaveProperty('_id');
    expect(rows[0]).not.toHaveProperty('name');
  });
});

describe('crud update', () => {
  it('updateOne changes only the matched document', async () => {
    await insertManyWidgets([
      { sku: 'W-1', name: 'A', colour: 'red', stock: 1 },
      { sku: 'W-2', name: 'B', colour: 'red', stock: 1 },
    ]);
    const res = await restockOne('W-1', 99);
    expect(res).toEqual({ matched: 1, modified: 1 });

    const col = await widgets();
    expect((await col.findOne({ sku: 'W-1' }))?.stock).toBe(99);
    // The unmatched document keeps its original stock.
    expect((await col.findOne({ sku: 'W-2' }))?.stock).toBe(1);
  });

  it('updateMany changes matched documents and leaves non-matching ones untouched', async () => {
    await insertManyWidgets([
      { sku: 'W-1', name: 'A', colour: 'red', stock: 1 },
      { sku: 'W-2', name: 'B', colour: 'red', stock: 1 },
      // This blue widget must not match the colour filter.
      { sku: 'W-3', name: 'C', colour: 'blue', stock: 1 },
    ]);
    const res = await recolourAll('red', 'green');
    expect(res).toEqual({ matched: 2, modified: 2 });

    const col = await widgets();
    expect(await col.countDocuments({ colour: 'green' })).toBe(2);
    // The non-matching blue widget is untouched.
    const blue = await col.findOne({ sku: 'W-3' });
    expect(blue?.colour).toBe('blue');
  });
});

describe('crud upsert', () => {
  it('creates the document when the sku is absent', async () => {
    const res = await upsertBySku({ sku: 'NEW', name: 'Pin', colour: 'black', stock: 1 });
    expect(res.upserted).toBe(true);

    const col = await widgets();
    expect(await col.findOne({ sku: 'NEW' })).not.toBeNull();
  });

  it('updates in place when the sku already exists and does not duplicate', async () => {
    await insertOneWidget({ sku: 'EXIST', name: 'Pin', colour: 'black', stock: 1 });
    const res = await upsertBySku({ sku: 'EXIST', name: 'Pin', colour: 'white', stock: 7 });
    expect(res.upserted).toBe(false);

    const col = await widgets();
    expect(await col.countDocuments({ sku: 'EXIST' })).toBe(1);
    expect((await col.findOne({ sku: 'EXIST' }))?.stock).toBe(7);
  });
});

describe('crud delete', () => {
  it('deleteOne removes only the matched document', async () => {
    await insertManyWidgets([
      { sku: 'W-1', name: 'A', colour: 'red', stock: 1 },
      { sku: 'W-2', name: 'B', colour: 'red', stock: 1 },
    ]);
    expect(await deleteOneBySku('W-1')).toBe(1);

    const col = await widgets();
    expect(await col.findOne({ sku: 'W-1' })).toBeNull();
    // The unmatched document survives.
    expect(await col.findOne({ sku: 'W-2' })).not.toBeNull();
  });

  it('deleteMany removes matched documents and leaves non-matching ones untouched', async () => {
    await insertManyWidgets([
      { sku: 'W-1', name: 'A', colour: 'red', stock: 1 },
      { sku: 'W-2', name: 'B', colour: 'red', stock: 1 },
      // This blue widget must not match the delete filter.
      { sku: 'W-3', name: 'C', colour: 'blue', stock: 1 },
    ]);
    expect(await deleteManyByColour('red')).toBe(2);

    const col = await widgets();
    expect(await col.countDocuments({ colour: 'red' })).toBe(0);
    // The non-matching blue widget is still present.
    expect(await col.findOne({ sku: 'W-3' })).not.toBeNull();
  });
});
