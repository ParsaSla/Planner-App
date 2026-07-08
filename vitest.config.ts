import { defineConfig } from 'vitest/config';

// Dedicated Vitest config so tests resolve from the repo root. The Vite build
// config (vite.config.ts) sets `root: 'frontend'` for the client bundle, which
// otherwise hides the backend tests under test/ from Vitest's discovery.
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // better-sqlite3's native addon can segfault when a worker thread is torn
    // down; run tests in forked processes to keep teardown clean.
    pool: 'forks',
  },
});
