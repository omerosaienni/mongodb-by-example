import { describe, it, expect } from 'vitest';

// Proves the test runner is wired. No feature exists yet, so this only
// confirms vitest actually executes a real assertion.
describe('scaffold', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2);
  });
});
