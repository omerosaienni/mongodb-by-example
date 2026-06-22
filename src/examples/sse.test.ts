import { describe, expect, it } from 'vitest';
import type { ChangeStreamDocument } from 'mongodb';
import type { EventDoc } from '../collections.js';
import { formatSseFrame, parseSseData, SSE_FRAME_TERMINATOR } from './sse.js';

// A literal insert change event, shaped like what the driver delivers, so the
// frame helpers are exercised with no database and the DB down.
const sampleChange = {
  operationType: 'insert',
  fullDocument: { key: 'widget-1', label: 'first' },
} as unknown as ChangeStreamDocument<EventDoc>;

describe('formatSseFrame produces a valid SSE data frame', () => {
  it('emits a single data line terminated by a blank line', () => {
    const frame = formatSseFrame(sampleChange);
    // The blank-line terminator is what delimits one event from the next on the
    // wire, so a frame missing it would run two events together for the client.
    expect(frame.endsWith(SSE_FRAME_TERMINATOR)).toBe(true);
    expect(frame.startsWith('data: ')).toBe(true);
    expect(frame).toBe(`data: ${JSON.stringify(sampleChange)}\n\n`);
  });
});

describe('parseSseData recovers the object from a frame', () => {
  it('round-trips a formatted frame back to the original event', () => {
    const frame = formatSseFrame(sampleChange);
    const parsed = parseSseData(frame) as ChangeStreamDocument<EventDoc>;
    // Round-trip equality proves the server and the test client share one wire
    // format: what the server writes, the parser reads back unchanged.
    expect(parsed).toEqual(sampleChange);
    expect(parsed.operationType).toBe('insert');
    if (parsed.operationType === 'insert') {
      expect(parsed.fullDocument.key).toBe('widget-1');
    }
  });

  it('strips the data prefix and ignores comment lines', () => {
    // A real stream opens with a `: connected` comment line; the parser must read
    // only the data payload and not choke on the comment.
    const frame = `: connected\ndata: ${JSON.stringify({ operationType: 'delete' })}\n\n`;
    const parsed = parseSseData(frame) as { operationType: string };
    expect(parsed.operationType).toBe('delete');
  });
});
