import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChangesTable } from './ChangesTable';
import type { Row } from './sseRows';

// Gate for the presentation logic the styling adds: the per-operation pill class,
// the per-row enter-fill that drives the flash colour, and the stable arrival-key
// that makes the one-shot mount animation play once per row and never replay.
// These fail if the class mapping, the fill mapping, or the key derivation is
// wrong, which is what objectively proves what the user sees.

const insert: Row = { id: 'k-1', operationType: 'insert', key: 'k-1', label: 'first' };
const update: Row = { id: 'k-1', operationType: 'update', key: 'k-1', label: 'changed' };
const del: Row = { id: 'k-2', operationType: 'delete', key: '', label: '' };

describe('ChangesTable', () => {
  it('tags each operation cell with its op-<type> class', () => {
    const { container } = render(<ChangesTable rows={[insert, update, del]} />);
    expect(container.querySelector('.op-insert')?.textContent).toBe('insert');
    expect(container.querySelector('.op-update')?.textContent).toBe('update');
    expect(container.querySelector('.op-delete')?.textContent).toBe('delete');
  });

  it('sets each row enter-fill to its operation colour so the flash is colour-coded', () => {
    const { container } = render(<ChangesTable rows={[del, update, insert]} />);
    const fills = [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) =>
      tr.style.getPropertyValue('--enter-fill'),
    );
    expect(fills).toEqual(['var(--delete-fill)', 'var(--update-fill)', 'var(--insert-fill)']);
  });

  it('keeps the carried rows mounted and mounts only the new one when a row prepends', () => {
    // useSseRows prepends newest first, so an arriving row shifts every existing
    // index by one. The arrival-ordinal key must hold each carried row's DOM node
    // identical across the render, so its mount animation does not replay; only
    // the genuinely new leading row is a fresh node.
    const { container, rerender } = render(<ChangesTable rows={[insert]} />);
    const before = container.querySelector('tbody tr');

    rerender(<ChangesTable rows={[del, insert]} />);
    const after = [...container.querySelectorAll('tbody tr')];
    expect(after).toHaveLength(2);
    // The insert row is now second; it must be the very same node as before.
    expect(after[1]).toBe(before);
    expect(after[1].querySelector('.op-insert')).not.toBeNull();
    // The delete row is the new leading node, distinct from any prior row.
    expect(after[0]).not.toBe(before);
    expect(after[0].querySelector('.op-delete')).not.toBeNull();
  });

  it('renders an unknown operation with a transparent fill rather than breaking', () => {
    const odd: Row = { id: 'k-9', operationType: 'replace', key: 'k-9', label: 'odd' };
    const { container } = render(<ChangesTable rows={[odd]} />);
    const tr = container.querySelector<HTMLTableRowElement>('tbody tr');
    expect(tr?.style.getPropertyValue('--enter-fill')).toBe('transparent');
    expect(container.querySelector('.op-replace')?.textContent).toBe('replace');
  });
});
