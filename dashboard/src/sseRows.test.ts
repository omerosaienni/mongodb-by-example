import { describe, it, expect } from 'vitest';
import { frameToRow, changeToRow, messageDataToRow, type Row } from './sseRows';

// The gate per the deliverable test_notes: feed raw SSE message payloads (real
// `data: {...}\n\n` frames, plus the `: connected` comment frame) and assert the
// derived rows exactly. Fails if the parsing or the change to row mapping is
// wrong, which is what objectively proves the data layer the table renders.

// Frames as they appear on the wire from src/examples/sse.ts: a single `data:`
// line carrying JSON.stringify(change), terminated by a blank line.
const connectedComment = ': connected\n\n';

const insertFrame =
  'data: ' +
  JSON.stringify({
    operationType: 'insert',
    documentKey: { _id: 'abc123' },
    fullDocument: { _id: 'abc123', key: 'k-1', label: 'first' },
  }) +
  '\n\n';

const updateFrame =
  'data: ' +
  JSON.stringify({
    operationType: 'update',
    documentKey: { _id: 'abc123' },
    fullDocument: { _id: 'abc123', key: 'k-1', label: 'changed' },
  }) +
  '\n\n';

const deleteFrame =
  'data: ' +
  JSON.stringify({
    operationType: 'delete',
    documentKey: { _id: 'abc123' },
  }) +
  '\n\n';

describe('frameToRow', () => {
  it('skips the opening comment frame, producing no row', () => {
    expect(frameToRow(connectedComment)).toBeNull();
  });

  it('parses an insert frame into the rendered row shape', () => {
    expect(frameToRow(insertFrame)).toEqual<Row>({
      id: 'k-1',
      operationType: 'insert',
      key: 'k-1',
      label: 'first',
    });
  });

  it('parses an update frame carrying the changed label', () => {
    expect(frameToRow(updateFrame)).toEqual<Row>({
      id: 'k-1',
      operationType: 'update',
      key: 'k-1',
      label: 'changed',
    });
  });

  it('parses a delete frame with no fullDocument, keyed by documentKey._id', () => {
    expect(frameToRow(deleteFrame)).toEqual<Row>({
      id: 'abc123',
      operationType: 'delete',
      key: '',
      label: '',
    });
  });

  it('maps a sequence of raw frames to exactly the non-comment rows', () => {
    const rows = [connectedComment, insertFrame, updateFrame, deleteFrame]
      .map(frameToRow)
      .filter((row): row is Row => row !== null);
    expect(rows).toEqual<Row[]>([
      { id: 'k-1', operationType: 'insert', key: 'k-1', label: 'first' },
      { id: 'k-1', operationType: 'update', key: 'k-1', label: 'changed' },
      { id: 'abc123', operationType: 'delete', key: '', label: '' },
    ]);
  });
});

describe('changeToRow', () => {
  it('derives the row from an already parsed change', () => {
    expect(
      changeToRow({
        operationType: 'insert',
        documentKey: { _id: 'x' },
        fullDocument: { key: 'k-9', label: 'nine' },
      }),
    ).toEqual<Row>({ id: 'k-9', operationType: 'insert', key: 'k-9', label: 'nine' });
  });
});

describe('messageDataToRow', () => {
  // EventSource strips the `data:` framing before onmessage, so the live client
  // receives the bare JSON. This must agree with frameToRow on the same change.
  it('parses a bare MessageEvent.data payload (no data: prefix) into a row', () => {
    const data = JSON.stringify({
      operationType: 'insert',
      documentKey: { _id: 'abc123' },
      fullDocument: { _id: 'abc123', key: 'k-1', label: 'first' },
    });
    expect(messageDataToRow(data)).toEqual(frameToRow(insertFrame));
  });
});
