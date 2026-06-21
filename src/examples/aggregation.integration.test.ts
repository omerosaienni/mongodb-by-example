import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Collection } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Order, type Customer } from '../collections.js';
import {
  resetAndSeed,
  totalsByStatus,
  paidTotalsByCustomer,
  tagOccurrences,
  ordersByAmountBucket,
  orderWithCustomer,
  statusAndBucketFacet,
  type StatusTotal,
  type AmountBucket,
} from './aggregation.js';

async function orders(): Promise<Collection<Order>> {
  const db = await getDb();
  return db.collection<Order>(COLLECTIONS.orders);
}

async function customers(): Promise<Collection<Customer>> {
  const db = await getDb();
  return db.collection<Customer>(COLLECTIONS.customers);
}

// Seed the known state once: every assertion reads the same deterministic data,
// so the pipelines share one seeded pair of collections rather than rebuilding
// per test.
beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const ordersCol = await orders();
  const customersCol = await customers();
  await ordersCol.drop().catch(() => false);
  await customersCol.drop().catch(() => false);
  await closeClient();
});

describe('$group totals and counts by status', () => {
  it('sums amount and counts documents per status to exact hand-computed values', async () => {
    const rows = await totalsByStatus();
    // paid: O1 100 + O2 50 + O3 200 = 350 over 3 orders.
    // cancelled: O5 999 over 1 order. pending: O4 30 + O6 70 = 100 over 2 orders.
    // Sorted by total descending, so cancelled leads despite being a single order.
    expect(rows).toEqual<StatusTotal[]>([
      { status: 'cancelled', total: 999, count: 1 },
      { status: 'paid', total: 350, count: 3 },
      { status: 'pending', total: 100, count: 2 },
    ]);
  });
});

describe('$match before $group keeps only paid orders', () => {
  it('excludes the pending and cancelled orders from the customer totals', async () => {
    const rows = await paidTotalsByCustomer();
    // Only paid orders count: C1 has O1 100 + O2 50 = 150 over 2, C2 has O3 200
    // over 1. C1 also owns the cancelled O5 (999); if the $match leaked it the
    // C1 total would be 1149, so this number is the gate.
    expect(rows).toEqual([
      { customerId: 'C1', total: 150, count: 2 },
      { customerId: 'C2', total: 200, count: 1 },
    ]);
    // C2's pending orders (O4 30, O6 70) are excluded, so C2 is 200 not 300.
    const c2 = rows.find((r) => r.customerId === 'C2');
    expect(c2?.total).toBe(200);
    // C3 owns no orders, so it must never appear as a group key.
    expect(rows.some((r) => r.customerId === 'C3')).toBe(false);
  });
});

describe('$unwind then $group counts tag occurrences', () => {
  it('counts each tag across every order, not per document', async () => {
    const rows = await tagOccurrences();
    // book: O1,O2,O4 = 3. gadget: O3,O4,O6 = 3. sale: O1,O5,O6 = 3.
    expect(rows).toEqual([
      { tag: 'book', count: 3 },
      { tag: 'gadget', count: 3 },
      { tag: 'sale', count: 3 },
    ]);
    // Nine tag occurrences total (2+1+1+2+1+2); a missed $unwind would undercount.
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(9);
  });
});

describe('$bucket places orders by amount boundary', () => {
  it('puts the right count in each range and leaves the default empty', async () => {
    const rows = await ordersByAmountBucket();
    // Boundaries [0,100,500,1000]. 0-99: O2 50, O4 30, O6 70 = 3.
    // 100-499: O1 100, O3 200 = 2. 500-999: O5 999 = 1.
    expect(rows).toEqual<AmountBucket[]>([
      { _id: 0, count: 3 },
      { _id: 100, count: 2 },
      { _id: 500, count: 1 },
    ]);
    // Nothing reaches the top boundary, so the 'other' default bucket is absent.
    expect(rows.some((r) => (r._id as unknown) === 'other')).toBe(false);
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(6);
  });
});

describe('$lookup joins an order to its customer', () => {
  it('embeds the related customer fields with their exact values', async () => {
    const row = await orderWithCustomer('O1');
    // O1 belongs to C1 (Ada, north) and is for 100. The joined fields must carry
    // C1's values, not another customer's, so name and region are the gate.
    expect(row).toEqual({
      orderId: 'O1',
      amount: 100,
      customerName: 'Ada',
      customerRegion: 'north',
    });
  });

  it('joins a different order to a different customer', async () => {
    const row = await orderWithCustomer('O3');
    // O3 belongs to C2 (Bo, south); proves the join keys on customerId, not a
    // fixed first customer.
    expect(row).toEqual({
      orderId: 'O3',
      amount: 200,
      customerName: 'Bo',
      customerRegion: 'south',
    });
  });
});

describe('$facet returns each facet shape and values in one pass', () => {
  it('returns both the status totals and the amount buckets', async () => {
    const result = await statusAndBucketFacet();
    // Same numbers as the standalone pipelines, proving the facet ran each
    // sub-pipeline over the full input independently.
    expect(result.byStatus).toEqual([
      { status: 'cancelled', total: 999, count: 1 },
      { status: 'paid', total: 350, count: 3 },
      { status: 'pending', total: 100, count: 2 },
    ]);
    expect(result.amountBuckets).toEqual([
      { _id: 0, count: 3 },
      { _id: 100, count: 2 },
      { _id: 500, count: 1 },
    ]);
    // The facet returns exactly the two requested keys, no more.
    expect(Object.keys(result).sort()).toEqual(['amountBuckets', 'byStatus']);
  });
});
