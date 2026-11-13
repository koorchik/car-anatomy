import { defineConfig } from 'vite';

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  // Scratch output and the headless browser's profile live there: their HTML files would reload the open page.
  server: { watch: { ignored: ['**/.tmp/**', '**/.playwright-mcp/**'] } },
});
