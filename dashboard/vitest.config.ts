import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The dashboard's own unit tier. Kept separate from the root vitest configs so
// jsx and the jsdom environment never leak into the Node-only src/ tiers. These
// tests are pure (data layer and an injected-factory reconnect test) with no
// Mongo and no network, so they are the unit tier for the dashboard.
export default defineConfig({
  plugins: [react()],
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
  },
});
