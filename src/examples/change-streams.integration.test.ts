import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Collection, ResumeToken } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS, type EventDoc } from '../collections.js';
import {
  TARGET_KEY,
  RESUME_KEY,
  INITIAL_LABEL,
  UPDATED_LABEL,
  EXPECTED_OPS,
  resetAndSeed,
  observeCrudOps,
  establish,
  nextEvent,
} from './change-streams.js';

async function events(): Promise<Collection<EventDoc>> {
  const db = await getDb();
  return db.collection<EventDoc>(COLLECTIONS.events);
}

// Reseed before each test so every case opens its watch on an empty collection
// and never sees another test's writes.
beforeEach(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  const col = await events();
  await col.drop().catch(() => false);
  await closeClient();
});

describe('a change stream reports the operation type of each write', () => {
  it('delivers insert, update and delete events in order', async () => {
    const col = await events();
    // Open the watch before the writes: a change stream only delivers events
    // that occur after it opens, so writing first would lose them all.
    const stream = col.watch<EventDoc>();
    try {
      const ops = await observeCrudOps(col, stream);
      // Each operationType matches the write that produced it. A stream that
      // mislabelled events, or only fired on inserts, would fail this.
      expect(ops).toEqual([...EXPECTED_OPS]);
    } finally {
      await stream.close();
    }
  });

  it('carries the updated field when fullDocument lookup is requested', async () => {
    const col = await events();
    // updateLookup makes the update event carry the post-update document, so the
    // test can assert the new label rather than only the operationType, gating
    // that the update genuinely changed the field.
    const stream = col.watch<EventDoc>([], { fullDocument: 'updateLookup' });
    try {
      // Pin the stream start before writing or the events fall outside its window.
      await establish(stream);
      await col.insertOne({ key: TARGET_KEY, label: INITIAL_LABEL });
      await col.updateOne({ key: TARGET_KEY }, { $set: { label: UPDATED_LABEL } });

      const insertEvent = await nextEvent(stream);
      expect(insertEvent.operationType).toBe('insert');

      const updateEvent = await nextEvent(stream);
      expect(updateEvent.operationType).toBe('update');
      if (updateEvent.operationType === 'update') {
        expect(updateEvent.fullDocument?.label).toBe(UPDATED_LABEL);
      }
    } finally {
      await stream.close();
    }
  });
});

describe('a change stream resumes from a stored token', () => {
  it('delivers the post-token write and not a duplicate of the earlier one', async () => {
    const col = await events();

    // First stream: capture the resume token of an insert, then close it.
    const firstStream = col.watch<EventDoc>();
    let token: ResumeToken;
    try {
      await establish(firstStream);
      await col.insertOne({ key: TARGET_KEY, label: INITIAL_LABEL });
      const firstEvent = await nextEvent(firstStream);
      expect(firstEvent.operationType).toBe('insert');
      // The event _id is the resume token. resumeAfter starts strictly after it.
      token = firstEvent._id;
    } finally {
      await firstStream.close();
    }

    // Written while no stream is open. Only a token-driven resume recovers it.
    await col.insertOne({ key: RESUME_KEY, label: INITIAL_LABEL });

    const resumed = col.watch<EventDoc>([], { resumeAfter: token });
    try {
      const resumedEvent = await nextEvent(resumed);
      expect(resumedEvent.operationType).toBe('insert');
      // The decisive assertion: the resumed stream delivers the post-token write,
      // identified by its distinct key, not a redelivered copy of the pre-token
      // insert. If resumeAfter were ignored the stream would start fresh and the
      // first event seen would be TARGET_KEY, failing this.
      if (resumedEvent.operationType === 'insert') {
        expect(resumedEvent.fullDocument.key).toBe(RESUME_KEY);
        expect(resumedEvent.fullDocument.key).not.toBe(TARGET_KEY);
      }
    } finally {
      await resumed.close();
    }
  });
});
