import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone static build. No env / API key injection of any kind.
// `base: './'` keeps asset URLs relative so the built site works whether it is
// served from a domain root or a GitHub Pages project sub-path (/<repo>/).
export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
