import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { buildGameBySlug, runTypecheck } from './build-game.mjs';
import { ROOT_DIR, syncCatalog } from './sync-catalog.mjs';

async function main() {
  const discovered = syncCatalog();

  console.log('[build-all] Typechecking @monkey-slop/sdk...');
  runTypecheck(path.join(ROOT_DIR, 'packages', 'monkey-sdk', 'tsconfig.json'));

  console.log('[build-all] Typechecking apps/portal...');
  runTypecheck(path.join(ROOT_DIR, 'apps', 'portal', 'tsconfig.json'));

  const distDir = path.join(ROOT_DIR, 'dist');
  fs.rmSync(distDir, { recursive: true, force: true });

  console.log('[build-all] Building Click Macacos Portal -> dist/...');
  await build({
    root: path.join(ROOT_DIR, 'apps', 'portal'),
    base: './',
    resolve: {
      alias: {
        '@monkey-slop/sdk': path.join(ROOT_DIR, 'packages', 'monkey-sdk', 'src', 'index.ts'),
      },
    },
    build: {
      outDir: distDir,
      emptyOutDir: true,
    },
  });

  const playableGames = discovered.filter((g) => g.hasIndex);
  for (const game of playableGames) {
    await buildGameBySlug(game.manifest.slug);
  }

  console.log(`[build-all] Done! Built portal + ${playableGames.length} game(s) into dist/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
