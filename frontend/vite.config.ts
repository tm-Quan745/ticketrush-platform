import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../docs/performance/results/finish-sellout-20-2.json', import.meta.url)),
        fileURLToPath(new URL('../docs/performance/results/finish-sellout-20-2-verify.json', import.meta.url)),
      ],
    },
    host: '0.0.0.0',
    port: 3000,
  },
});
