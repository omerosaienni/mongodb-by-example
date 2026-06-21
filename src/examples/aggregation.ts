import type { Collection, Document } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Order, type Customer } from '../collections.js';

async function orders(): Promise<Collection<Order>> {
  const db = await getDb();
  return db.collection<Order>(COLLECTIONS.orders);
}

async function customers(): Promise<Collection<Customer>> {
  const db = await getDb();
  return db.collection<Customer>(COLLECTIONS.customers);
}

// The shape every $group-by-status row returns, so callers and tests assert on a
// named structure rather than a bare Document.
export interface StatusTotal {
  status: Order['status'];
  total: number;
  count: number;
}

// $match then $group: keep only paid orders, then sum and count per customer.
// The cancelled order (which carries the largest amount) must never reach the
// group, so a wrong $match would change both the totals and the customer set.
export interface CustomerTotal {
  customerId: string;
  total: number;
  count: number;
}

// $unwind output: one row per tag occurrence across all orders, counted.
export interface TagCount {
  tag: string;
  count: number;
}

// $bucket output: a count of orders whose amount falls in each boundary range.
export interface AmountBucket {
  _id: number;
  count: number;
}

// $lookup + $unwind: an order joined to its single customer. The joined fields
// are projected flat so a test can assert the related name and region directly.
export interface OrderWithCustomer {
  orderId: string;
  amount: number;
  customerName: string;
  customerRegion: string;
}

// Group every order by status, summing amount and counting documents. Sorted by
// total descending so the result order is itself deterministic and assertable.
export async function totalsByStatus(): Promise<StatusTotal[]> {
  const col = await orders();
  return col
    .aggregate<StatusTotal>([
      { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $project: { _id: 0, status: '$_id', total: 1, count: 1 } },
    ])
    .toArray();
}

// $match restricts to paid orders before grouping by customer. The pre-group
// $match is the point of the pipeline: pending and cancelled orders are dropped
// before the sum, so their amounts never inflate a customer total.
export async function paidTotalsByCustomer(): Promise<CustomerTotal[]> {
  const col = await orders();
  return col
    .aggregate<CustomerTotal>([
      { $match: { status: 'paid' } },
      { $group: { _id: '$customerId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, customerId: '$_id', total: 1, count: 1 } },
    ])
    .toArray();
}

// $unwind expands the tags array to one document per tag, then $group counts how
// often each tag appears across all orders. Sorted by tag for a stable order.
export async function tagOccurrences(): Promise<TagCount[]> {
  const col = await orders();
  return col
    .aggregate<TagCount>([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ])
    .toArray();
}

// $bucket groups orders into amount ranges by boundary. default catches anything
// at or above the top boundary; with the sample data nothing lands there, which
// a test asserts so a misplaced boundary would surface.
export async function ordersByAmountBucket(): Promise<AmountBucket[]> {
  const col = await orders();
  return col
    .aggregate<AmountBucket>([
      {
        $bucket: {
          groupBy: '$amount',
          boundaries: [0, 100, 500, 1000],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ])
    .toArray();
}

// $lookup joins orders to customers by customerId, $unwind flattens the single
// matched customer, then $project pulls the related name and region up. Returns
// the one order whose orderId is given so a test can name exact joined values.
export async function orderWithCustomer(orderId: string): Promise<OrderWithCustomer | undefined> {
  const col = await orders();
  const rows = await col
    .aggregate<OrderWithCustomer>([
      { $match: { orderId } },
      {
        $lookup: {
          from: COLLECTIONS.customers,
          localField: 'customerId',
          foreignField: 'customerId',
          as: 'customer',
        },
      },
      // Each order references exactly one customer, so unwinding the joined array
      // turns the one-element array into a single embedded document.
      { $unwind: '$customer' },
      {
        $project: {
          _id: 0,
          orderId: 1,
          amount: 1,
          customerName: '$customer.name',
          customerRegion: '$customer.region',
        },
      },
    ])
    .toArray();
  return rows[0];
}

// $facet runs several independent pipelines over the same input in one pass,
// returning each under its own key. Here one facet is the status totals and the
// other is the amount buckets, so a single round trip yields both shapes.
export async function statusAndBucketFacet(): Promise<Document> {
  const col = await orders();
  const rows = await col
    .aggregate<Document>([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
            { $project: { _id: 0, status: '$_id', total: 1, count: 1 } },
          ],
          amountBuckets: [
            {
              $bucket: {
                groupBy: '$amount',
                boundaries: [0, 100, 500, 1000],
                default: 'other',
                output: { count: { $sum: 1 } },
              },
            },
          ],
        },
      },
    ])
    .toArray();
  return rows[0];
}

// Deterministic orders the demo and tests share. Hand authored, no faker, so the
// group totals, tag counts and bucket counts are computable by hand. The
// cancelled order carries the largest amount on purpose: it must be excluded by
// the paid-only $match, so a broken match would change the asserted totals.
export function sampleOrders(): Order[] {
  return [
    { orderId: 'O1', customerId: 'C1', status: 'paid', amount: 100, tags: ['book', 'sale'] },
    { orderId: 'O2', customerId: 'C1', status: 'paid', amount: 50, tags: ['book'] },
    { orderId: 'O3', customerId: 'C2', status: 'paid', amount: 200, tags: ['gadget'] },
    { orderId: 'O4', customerId: 'C2', status: 'pending', amount: 30, tags: ['book', 'gadget'] },
    { orderId: 'O5', customerId: 'C1', status: 'cancelled', amount: 999, tags: ['sale'] },
    { orderId: 'O6', customerId: 'C2', status: 'pending', amount: 70, tags: ['gadget', 'sale'] },
  ];
}

// Deterministic customers. C3 has no orders, so it must never appear in a group
// keyed off orders and a lookup from orders never reaches it: a wrong pipeline
// that invented rows for it would fail.
export function sampleCustomers(): Customer[] {
  return [
    { customerId: 'C1', name: 'Ada', region: 'north' },
    { customerId: 'C2', name: 'Bo', region: 'south' },
    { customerId: 'C3', name: 'Cy', region: 'north' },
  ];
}

// Drop and repopulate both scratch collections from the hand authored samples.
// Exported so the test establishes the same known state the demo prints.
export async function resetAndSeed(): Promise<void> {
  const ordersCol = await orders();
  const customersCol = await customers();
  await ordersCol.drop().catch(() => false);
  await customersCol.drop().catch(() => false);
  await ordersCol.insertMany(sampleOrders());
  await customersCol.insertMany(sampleCustomers());
}

async function demo(): Promise<void> {
  await resetAndSeed();

  console.log('totals by status:', await totalsByStatus());
  console.log('paid totals by customer:', await paidTotalsByCustomer());
  console.log('tag occurrences:', await tagOccurrences());
  console.log('orders by amount bucket:', await ordersByAmountBucket());
  console.log('order O1 with customer:', await orderWithCustomer('O1'));
  console.log('status and bucket facet:', JSON.stringify(await statusAndBucketFacet()));
}

// Run directly via `npm run ex:aggregation`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
