import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The repository root — tokens.css lives outside this workspace on purpose (see below). */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // `inception/design/tokens.css` is the design system's single source and a protected
      // path. The app imports it where it lives rather than keeping a copy — a copy is a
      // second source, and a second source drifts.
      allow: [repoRoot],
    },
  },
});
