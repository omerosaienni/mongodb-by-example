import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts', 'traffic-driver/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
  },
});
