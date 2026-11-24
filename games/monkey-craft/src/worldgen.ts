import { B, H, SEA, SURF, W } from './types';

// Geração 100% determinística (sem Math.random / sin / cos) para que host e guests
// gerem exatamente o mesmo mundo a partir da mesma seed.

export function hash(ix: number, iy: number, s: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, s: number, oct = 3): number {
  let amp = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x * f, y * f, s + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export interface GenResult {
  tiles: Uint8Array;
  surf: Int16Array;
}

export function isDesert(x: number, seed: number): boolean {
  if (Math.abs(x - W / 2) < 40) return false;
  return vnoise(x / 60, 91.3, seed + 1) > 0.57;
}

export function generate(seed: number): GenResult {
  const tiles = new Uint8Array(W * H);
  const surf = new Int16Array(W);
  const at = (x: number, y: number) => y * W + x;

  // ---- altura da superfície
  for (let x = 0; x < W; x++) {
    const d = Math.min(x, W - 1 - x);
    let h = SURF + (fbm(x / 38, 3.3, seed) - 0.5) * 22 + (vnoise(x / 9, 7.7, seed + 2) - 0.5) * 3;
    if (isDesert(x, seed)) h = SURF + 2 + (h - SURF) * 0.45;
    if (d < 36) {
      const t = (36 - d) / 36;
      h = h + t * t * (SEA + 10 - h);
    }
    surf[x] = Math.max(24, Math.min(H - 40, Math.round(h)));
  }

  // ---- terreno, cavernas, minérios
  for (let x = 0; x < W; x++) {
    const d = Math.min(x, W - 1 - x);
    const desert = isDesert(x, seed);
    const beach = d < 36;
    const dirtDepth = 4 + Math.floor(hash(x, 5, seed) * 3);
    for (let y = surf[x]; y < H; y++) {
      const depth = y - surf[x];
      let id: number = B.STONE;
      if (y >= H - 1) id = B.BEDROCK;
      else if (y >= H - 3 && hash(x, y, seed + 7) > 0.5) id = B.BEDROCK;
      else if (beach) {
        if (depth < 7) id = B.SAND;
        else if (depth < 13) id = B.SANDSTONE;
      } else if (desert) {
        if (depth < 7) id = B.SAND;
        else if (depth < 17) id = B.SANDSTONE;
      } else {
        if (depth === 0) id = B.GRASS;
        else if (depth < dirtDepth) id = B.DIRT;
      }

      if (id !== B.BEDROCK && depth > 5 && y < H - 4) {
        const worm = Math.abs(vnoise(x * 0.06, y * 0.09, seed + 11) - 0.5) < 0.034;
        const cheese = depth > 14 && fbm(x * 0.045, y * 0.06, seed + 12, 2) > 0.665;
        if (worm || cheese) id = B.AIR;
      }

      if (id === B.STONE) {
        if (depth > 6 && vnoise(x * 0.22, y * 0.22, seed + 21) > 0.83) id = B.COAL;
        else if (depth > 12 && vnoise(x * 0.24, y * 0.24, seed + 22) > 0.85) id = B.COPPER;
        else if (depth > 34 && vnoise(x * 0.26, y * 0.26, seed + 23) > 0.87) id = B.GOLD;
        else if (depth > 62 && vnoise(x * 0.3, y * 0.3, seed + 24) > 0.885) id = B.BANANITE;
      }
      tiles[at(x, y)] = id;
    }
  }

  // ---- água: mar nas bordas e lagoas nos vales
  for (let x = 0; x < W; x++) {
    for (let y = SEA; y < surf[x]; y++) tiles[at(x, y)] = B.WATER;
    if (surf[x] > SEA) {
      // fundo de areia
      for (let dy = 0; dy < 3; dy++) {
        const i = at(x, surf[x] + dy);
        if (tiles[i] === B.GRASS || tiles[i] === B.DIRT) tiles[i] = B.SAND;
      }
    }
  }
  // poças subterrâneas (só onde há chão embaixo)
  for (let y = H - 8; y > SURF + 22; y--) {
    for (let x = 1; x < W - 1; x++) {
      const i = at(x, y);
      if (tiles[i] !== B.AIR) continue;
      const below = tiles[at(x, y + 1)];
      if ((below !== B.AIR) && vnoise(x * 0.1, y * 0.1, seed + 31) > 0.78) tiles[i] = B.WATER;
    }
  }

  // ---- vegetação
  let lastTree = -10;
  for (let x = 4; x < W - 4; x++) {
    const top = surf[x];
    const ground = tiles[at(x, top)];
    const above = at(x, top - 1);
    if (tiles[above] !== B.AIR) continue;
    const r = hash(x, 1, seed + 50);
    const d = Math.min(x, W - 1 - x);
    if (ground === B.GRASS) {
      if (r < 0.14 && x - lastTree >= 5) {
        growTree(tiles, x, top, seed, false);
        lastTree = x;
      } else if (r < 0.4) tiles[above] = B.TALLGRASS;
      else if (r < 0.48) tiles[above] = B.FLOWER;
    } else if (ground === B.SAND && top <= SEA - 1) {
      if (d < 36 && r < 0.07 && x - lastTree >= 6) {
        growTree(tiles, x, top, seed, true);
        lastTree = x;
      } else if (d >= 36 && r < 0.05 && x - lastTree >= 6) {
        const hgt = 2 + Math.floor(hash(x, 2, seed + 51) * 3);
        for (let k = 1; k <= hgt; k++) tiles[at(x, top - k)] = B.CACTUS;
        lastTree = x;
      }
    }
  }

  return { tiles, surf };
}

function growTree(tiles: Uint8Array, x: number, top: number, seed: number, palm: boolean): void {
  const at = (px: number, py: number) => py * W + px;
  const hgt = (palm ? 5 : 5) + Math.floor(hash(x, 3, seed + 52) * 4);
  const topY = top - hgt;
  for (let k = 1; k <= hgt; k++) {
    if (tiles[at(x, top - k)] === B.AIR || tiles[at(x, top - k)] === B.TALLGRASS) tiles[at(x, top - k)] = B.WOOD;
  }
  const leaf = (px: number, py: number) => {
    if (px < 0 || px >= W || py < 0) return;
    if (tiles[at(px, py)] === B.AIR) tiles[at(px, py)] = B.LEAVES;
  };
  if (palm) {
    for (let dx = -3; dx <= 3; dx++) {
      leaf(x + dx, topY - (Math.abs(dx) <= 1 ? 1 : 0));
      if (Math.abs(dx) >= 2) leaf(x + dx, topY + 1);
    }
    leaf(x, topY - 2);
  } else {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if ((dx * dx) / 13 + (dy * dy) / 5.4 <= 1) leaf(x + dx, topY + dy);
      }
    }
  }
  // cachos de banana pendurados
  for (let dx = -3; dx <= 3; dx++) {
    if (dx === 0) continue;
    for (let dy = 0; dy <= 3; dy++) {
      const px = x + dx;
      const py = topY + dy;
      if (px < 0 || px >= W) continue;
      if (tiles[at(px, py)] === B.LEAVES && tiles[at(px, py + 1)] === B.AIR) {
        if (hash(px, py, seed + 53) < 0.34) tiles[at(px, py + 1)] = B.BUNCH;
        break;
      }
    }
  }
}
