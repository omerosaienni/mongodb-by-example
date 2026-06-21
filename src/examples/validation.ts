import type { Collection, InsertOneResult } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type Member } from '../collections.js';

// MongoServerError code for a write rejected by the collection's document
// validator. Exported so the test asserts on this specific failure rather than
// any thrown error, which would pass even if the validator were missing.
export const DOCUMENT_VALIDATION_FAILED = 121;

// The $jsonSchema the server enforces on every write. age uses bsonType 'number'
// not 'int': the driver serialises plain JS numbers as BSON double, so a strict
// 'int' validator would reject a conforming age like 30. 'number' accepts any
// numeric BSON type while minimum still gates out-of-range values.
const MEMBER_SCHEMA = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['name', 'email', 'age'],
    additionalProperties: false,
    properties: {
      // _id is not in required and additionalProperties is false, so it must be
      // listed or the server-assigned _id would itself fail validation.
      _id: { bsonType: 'objectId' },
      name: { bsonType: 'string', minLength: 1 },
      email: { bsonType: 'string', pattern: '^.+@.+\\..+$' },
      age: { bsonType: 'number', minimum: 18 },
    },
  },
} as const;

async function members(): Promise<Collection<Member>> {
  const db = await getDb();
  return db.collection<Member>(COLLECTIONS.members);
}

// Drop and recreate the collection with the validator attached, so re-running is
// idempotent. validationLevel strict applies the rule to every write and
// validationAction error rejects offenders rather than only warning.
export async function createValidatedCollection(): Promise<Collection<Member>> {
  const db = await getDb();
  await db
    .collection(COLLECTIONS.members)
    .drop()
    .catch(() => false);
  await db.createCollection(COLLECTIONS.members, {
    validator: MEMBER_SCHEMA,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  return members();
}

// A conforming member, expected to insert cleanly under the validator.
export async function insertConforming(member: Member): Promise<InsertOneResult<Member>> {
  const col = await members();
  return col.insertOne(member);
}

// Attempt a write the test crafts to violate the schema. The insert is not
// wrapped: a rejection throws a MongoServerError with code 121, which the caller
// asserts on. A conforming document here would return an InsertOneResult instead.
export async function attemptInsert(doc: Member): Promise<InsertOneResult<Member>> {
  const col = await members();
  return col.insertOne(doc);
}

async function demo(): Promise<void> {
  await createValidatedCollection();

  const good = await insertConforming({ name: 'Ada', email: 'ada@example.com', age: 30 });
  console.log('accepted conforming member, id:', good.insertedId.toString());

  // Under 18 violates the minimum, so the server rejects this write. The driver
  // does not populate codeName for this error, so the demo prints code 121 and the
  // operatorName from errInfo, which names the $jsonSchema rule that fired.
  try {
    await attemptInsert({ name: 'Tom', email: 'tom@example.com', age: 12 } as Member);
    console.log('ERROR: invalid member was accepted, validator not enforced');
  } catch (err) {
    const e = err as { code?: number; errInfo?: { details?: { operatorName?: string } } };
    console.log(
      'rejected non-conforming member, code:',
      e.code,
      'rule:',
      e.errInfo?.details?.operatorName,
    );
  }

  const col = await members();
  console.log('members stored:', await col.countDocuments());
}

// Run directly via `npm run ex:validation`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
