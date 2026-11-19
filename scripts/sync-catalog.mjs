import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const GAMES_DIR = path.join(ROOT_DIR, 'games');
export const PORTAL_PUBLIC_DIR = path.join(ROOT_DIR, 'apps', 'portal', 'public');

const REQUIRED_FIELDS = [
  'slug',
  'title',
  'subtitle',
  'inspiredBy',
  'description',
  'category',
  'emoji',
  'accentColor',
  'multiplayer',
  'controls',
  'status',
];

export function discoverGames() {
  if (!fs.existsSync(GAMES_DIR)) return [];
  const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
  const discovered = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const gameDir = path.join(GAMES_DIR, entry.name);
    const manifestPath = path.join(gameDir, 'game.manifest.json');
    const indexPath = path.join(gameDir, 'index.html');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      throw new Error(`Invalid JSON in ${manifestPath}: ${err.message}`);
    }

    for (const field of REQUIRED_FIELDS) {
      if (manifest[field] === undefined || manifest[field] === null) {
        throw new Error(`Missing required field "${field}" in ${manifestPath}`);
      }
    }

    if (manifest.slug !== entry.name) {
      throw new Error(
        `Manifest slug "${manifest.slug}" must match directory name "${entry.name}" (${manifestPath})`,
      );
    }

    const hasIndex = fs.existsSync(indexPath);
    discovered.push({
      dir: gameDir,
      hasIndex,
      manifest,
    });
  }

  return discovered.sort((a, b) => a.manifest.slug.localeCompare(b.manifest.slug));
}

export function syncCatalog() {
  fs.mkdirSync(PORTAL_PUBLIC_DIR, { recursive: true });
  const thumbsDir = path.join(PORTAL_PUBLIC_DIR, 'thumbnails');
  fs.mkdirSync(thumbsDir, { recursive: true });

  const games = discoverGames();
  const catalog = games.map(({ dir, hasIndex, manifest }) => {
    let resolvedThumbnail;
    if (manifest.thumbnail) {
      const srcThumb = path.join(dir, manifest.thumbnail);
      if (fs.existsSync(srcThumb)) {
        const ext = path.extname(srcThumb) || '.svg';
        const destName = `${manifest.slug}${ext}`;
        fs.copyFileSync(srcThumb, path.join(thumbsDir, destName));
        resolvedThumbnail = `./thumbnails/${destName}`;
      }
    }

    return {
      ...manifest,
      status: hasIndex ? manifest.status : 'coming-soon',
      entryUrl: hasIndex ? `./games/${manifest.slug}/index.html` : undefined,
      resolvedThumbnail,
    };
  });

  const outPath = path.join(PORTAL_PUBLIC_DIR, 'games-catalog.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), games: catalog }, null, 2));
  console.log(`[sync-catalog] Synced ${catalog.length} discovered game(s) -> ${path.relative(ROOT_DIR, outPath)}`);
  return games;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncCatalog();
}
