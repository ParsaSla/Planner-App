import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React dashboard lives in `frontend/` and is built into `dist/frontend`,
// which the Express server serves at `/dashboard/`. In dev, Vite runs on 5173
// and proxies API/auth routes to the Express backend on 8080.
const backend = 'http://localhost:8080';

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/login': backend,
      '/logout': backend,
      '/register': backend,
      '/dist': backend,
    },
  },
});
