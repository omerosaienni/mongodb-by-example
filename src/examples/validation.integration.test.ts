import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection, MongoServerError } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Member } from '../collections.js';
import {
  DOCUMENT_VALIDATION_FAILED,
  createValidatedCollection,
  insertConforming,
  attemptInsert,
} from './validation.js';

async function members(): Promise<Collection<Member>> {
  const db = await getDb();
  return db.collection<Member>(COLLECTIONS.members);
}

// Recreate the validated collection before each test so every case starts from a
// known, validator-attached state and never inherits another test's writes.
beforeEach(async () => {
  await createValidatedCollection();
});

afterAll(async () => {
  const col = await members();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('schema validation accepts conforming writes', () => {
  it('inserts a document that satisfies the $jsonSchema', async () => {
    const res = await insertConforming({ name: 'Ada', email: 'ada@example.com', age: 30 });
    expect(res.insertedId).toBeDefined();

    const col = await members();
    const found = await col.findOne({ _id: res.insertedId });
    expect(found?.name).toBe('Ada');
    expect(found?.age).toBe(30);
  });
});

describe('schema validation rejects non-conforming writes', () => {
  it('rejects a document violating a bsonType minimum with a document validation error', async () => {
    let caught: MongoServerError | undefined;
    try {
      // age 12 is below the schema minimum of 18, so the server must reject it.
      await attemptInsert({ name: 'Tom', email: 'tom@example.com', age: 12 } as Member);
    } catch (err) {
      caught = err as MongoServerError;
    }
    // Assert the specific document validation failure, not merely that something
    // threw: a generic throw would still pass if the validator were missing and
    // the bad write only failed for some unrelated reason. code 121 is the server's
    // DocumentValidationFailure, and errInfo.details.operatorName names the rule
    // that fired, confirming the $jsonSchema validator rejected this write.
    expect(caught).toBeDefined();
    expect(caught?.name).toBe('MongoServerError');
    expect(caught?.code).toBe(DOCUMENT_VALIDATION_FAILED);
    const details = caught?.errInfo?.details as { operatorName?: string } | undefined;
    expect(details?.operatorName).toBe('$jsonSchema');

    // The rejected document must not have landed: nothing with that email exists.
    const col = await members();
    expect(await col.findOne({ email: 'tom@example.com' })).toBeNull();
    expect(await col.countDocuments()).toBe(0);
  });

  it('rejects a document missing a required field', async () => {
    let caught: MongoServerError | undefined;
    try {
      // name is required but absent, so the validator rejects this write.
      await attemptInsert({ email: 'noname@example.com', age: 40 } as unknown as Member);
    } catch (err) {
      caught = err as MongoServerError;
    }
    expect(caught?.code).toBe(DOCUMENT_VALIDATION_FAILED);

    const col = await members();
    expect(await col.findOne({ email: 'noname@example.com' })).toBeNull();
  });
});
