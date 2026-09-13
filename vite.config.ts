import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under /<repo>/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // Two pages: the landing (index.html) and the tracker itself (app.html).
      input: { landing: 'index.html', app: 'app.html' },
    },
  },
});
