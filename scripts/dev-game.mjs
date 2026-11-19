import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { GAMES_DIR, ROOT_DIR } from './sync-catalog.mjs';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npm run dev:game -- <game-slug>');
  process.exit(1);
}

const gameDir = path.join(GAMES_DIR, slug);
if (!fs.existsSync(path.join(gameDir, 'index.html'))) {
  console.error(`Game not found or missing index.html: games/${slug}`);
  process.exit(1);
}

const server = await createServer({
  root: gameDir,
  base: './',
  resolve: {
    alias: {
      '@monkey-slop/sdk': path.join(ROOT_DIR, 'packages', 'monkey-sdk', 'src', 'index.ts'),
    },
  },
  server: {
    port: 5174,
    open: false,
  },
});

await server.listen();
server.printUrls();
