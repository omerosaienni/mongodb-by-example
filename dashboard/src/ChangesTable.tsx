import type { JSX } from 'react';
import type { Row } from './sseRows';

// The live table. Renders exactly the Row fields the data layer derives, so the
// gate test on those fields is also the contract for what appears on screen.
// Index is mixed into the React key because successive changes to the same
// document share a row id, and a stable-but-non-unique key would collide.
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
          <tr key={`${row.id}-${index}`}>
            <td>{row.operationType}</td>
            <td>{row.key}</td>
            <td>{row.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
