import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard is a self-contained Vite app, isolated from the Node-only root
// build (root tsconfig has no DOM lib). root is this dir so the app's index.html
// and src/ are the build inputs, not the repo root.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    // Proxy the SSE endpoint to the deliverable 16 server so the browser hits a
    // same-origin /events in dev. DEFAULT_PORT (src/examples/sse.ts) is 3000.
    proxy: {
      '/events': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
