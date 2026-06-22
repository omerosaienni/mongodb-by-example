// The data layer the dashboard is gated on. Pure functions that turn the SSE
// wire format (deliverable 16, src/examples/sse.ts) into the row shape the table
// renders. No DOM, no EventSource, no React here so the transform is unit
// testable in isolation and the UI is a thin render over these rows.

// The document shape the SSE server watches and streams. Mirrors EventDoc in
// src/collections.ts. Redeclared locally rather than imported across the
// boundary: src/ compiles under a Node-only tsconfig (no DOM lib) and pulling a
// .js import into the dashboard's bundler-resolution tsconfig is friction for a
// two-field type. The shape is small and stable, so a local copy is cleaner than
// coupling the browser build to the server's module graph.
export interface EventDoc {
  key: string;
  label: string;
}

// The subset of a MongoDB ChangeStreamDocument the dashboard reads. The server
// JSON.stringify's the full change, but the table only needs the operation and,
// for inserts/updates carrying updateLookup, the fullDocument. delete events
// carry no fullDocument, hence optional. documentKey._id is always present and
// gives a stable identity for delete rows that have no fullDocument.
export interface ChangeEvent {
  operationType: string;
  fullDocument?: EventDoc;
  documentKey?: { _id: string };
}

// One table row. This is exactly what the UI renders, so the test asserting these
// fields is the gate: if parsing or mapping is wrong, the rendered table is wrong.
export interface Row {
  id: string;
  operationType: string;
  key: string;
  label: string;
}

// The `data:` field prefix and frame terminator, matching src/examples/sse.ts.
// Kept here so the dashboard parser does not depend on importing the server.
const SSE_DATA_PREFIX = 'data:';
const SSE_FRAME_TERMINATOR = '\n\n';

// A frame with no `data:` line is a comment (the opening `: connected` frame),
// which carries no event and must not become a row.
function extractData(frame: string): string | null {
  const payload = frame
    .split('\n')
    .filter((line) => line.startsWith(SSE_DATA_PREFIX))
    .map((line) => line.slice(SSE_DATA_PREFIX.length).trimStart())
    .join('\n');
  return payload.length > 0 ? payload : null;
}

// Map a parsed change to a row. A delete has no fullDocument, so key and label
// fall back to empty and the id comes from documentKey._id. The placeholder id
// only fires if a malformed event arrives with neither, which a well-formed
// stream never sends.
export function changeToRow(change: ChangeEvent): Row {
  const id = change.fullDocument?.key ?? change.documentKey?._id ?? '(unknown)';
  return {
    id,
    operationType: change.operationType,
    key: change.fullDocument?.key ?? '',
    label: change.fullDocument?.label ?? '',
  };
}

// Turn one raw SSE frame into a row, or null for a comment frame. This mirrors
// the wire format end to end: strip `data:`, JSON.parse, map to a row. It is the
// function the gate test drives with real `data: {...}\n\n` strings.
export function frameToRow(frame: string): Row | null {
  const payload = extractData(frame);
  if (payload === null) {
    return null;
  }
  const change = JSON.parse(payload) as ChangeEvent;
  return changeToRow(change);
}

// Map an already-parsed MessageEvent.data string (one event's payload, no
// `data:` prefix, as EventSource hands it to onmessage) to a row. EventSource
// strips the framing itself, so the live client uses this rather than frameToRow.
export function messageDataToRow(data: string): Row {
  const change = JSON.parse(data) as ChangeEvent;
  return changeToRow(change);
}

export { SSE_FRAME_TERMINATOR };
