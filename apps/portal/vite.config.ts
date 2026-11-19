import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@monkey-slop/sdk': path.resolve(__dirname, '../../packages/monkey-sdk/src/index.ts'),
    },
  },
});
