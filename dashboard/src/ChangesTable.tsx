import type { CSSProperties, JSX } from 'react';
import type { Row } from './sseRows';

// The live table. Renders exactly the Row fields the data layer derives, so the
// gate test on those fields is also the contract for what appears on screen.

// The pastel fill a row flashes from on arrival, matching the
// --insert/update/delete tokens in index.css. Set as an inline custom property so
// the row-enter keyframes can read it per row.
const ENTER_FILL: Record<string, string> = {
  insert: 'var(--insert-fill)',
  update: 'var(--update-fill)',
  delete: 'var(--delete-fill)',
};

// A stable, unique React key per logical row, derived from arrival order.
// useSseRows prepends newest first, so a row's index shifts every time a newer
// one arrives, but its distance from the bottom (its arrival ordinal) does not.
// Keying on that ordinal means a carried row keeps its DOM node across renders, so
// the one-shot row-enter animation plays once on mount and never replays. A
// timestamp or id would not do: ids repeat across a document's operations, and
// index churns. This is also why the flash needs no render-phase or effect
// bookkeeping, and so is immune to StrictMode's double invoke.
function rowKey(total: number, index: number): number {
  return total - 1 - index;
}

export function ChangesTable({ rows }: { rows: Row[] }): JSX.Element {
  return (
    <table>
      <thead>
        <tr>
          <th>operation</th>
          <th>key</th>
          <th>label</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={rowKey(rows.length, index)}
            className="row-new"
            style={
              { '--enter-fill': ENTER_FILL[row.operationType] ?? 'transparent' } as CSSProperties
            }
          >
            <td>
              <span className={`op op-${row.operationType}`}>{row.operationType}</span>
            </td>
            <td className="cell-key">{row.key}</td>
            <td className="cell-label">{row.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
