import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { GAMES_DIR, ROOT_DIR } from './sync-catalog.mjs';

export function runTypecheck(tsconfigPath) {
  const tscScript = path.join(ROOT_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
  const res = spawnSync(process.execPath, [tscScript, '--noEmit', '-p', tsconfigPath], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    throw new Error(`Typecheck failed for ${path.relative(ROOT_DIR, tsconfigPath)}`);
  }
}

export async function buildGameBySlug(slug) {
  const gameDir = path.join(GAMES_DIR, slug);
  const manifestPath = path.join(gameDir, 'game.manifest.json');
  const indexPath = path.join(gameDir, 'index.html');

  if (!fs.existsSync(gameDir)) {
    throw new Error(`Game directory not found: games/${slug}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing game.manifest.json in games/${slug}`);
  }
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing index.html in games/${slug}`);
  }

  const tsconfigPath = path.join(gameDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    console.log(`[build-game] Typechecking games/${slug}...`);
    runTypecheck(tsconfigPath);
  }

  const outDir = path.join(ROOT_DIR, 'dist', 'games', slug);
  console.log(`[build-game] Building games/${slug} -> dist/games/${slug}...`);
  await build({
    root: gameDir,
    base: './',
    resolve: {
      alias: {
        '@monkey-slop/sdk': path.join(ROOT_DIR, 'packages', 'monkey-sdk', 'src', 'index.ts'),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
    },
  });
  console.log(`[build-game] Built games/${slug} successfully!`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: npm run build:game -- <game-slug>');
    process.exit(1);
  }
  buildGameBySlug(slug).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
