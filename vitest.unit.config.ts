import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The unit tier is two projects under one config so the judge's single
// `agent-tests.sh unit` run covers both the Node src/ tests and the browser
// dashboard tests. They are split because the dashboard needs jsdom and the react
// plugin while src/ is Node-only, and merging the two environments into one
// project would force DOM globals onto the Node tests. The root tsconfig still
// includes only src/, so dashboard jsx and DOM never enter the Node typecheck.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'src',
          include: ['src/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dashboard',
          root: import.meta.dirname,
          include: ['dashboard/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
        },
      },
    ],
  },
});
