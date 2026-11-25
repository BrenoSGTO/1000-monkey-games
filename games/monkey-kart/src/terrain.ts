import { CELL, GRID, type Theme, type Track, WORLD } from './tracks';
import { SURF_VOID } from './types';

/** Per-theme shape of the land around the drivable plateau. */
interface ThemeShape {
  depth: number; // how far the ground drops off the edge
  edge: number; // horizontal distance of the drop
  hills: number; // height of far hills
  hillNear: number; // distance where hills start
  hillFar: number;
  water: number | null; // water level (null = none)
}

export const SHAPES: Record<Theme, ThemeShape> = {
  jungle: { depth: 46, edge: 55, hills: 420, hillNear: 650, hillFar: 1900, water: -16 },
  favela: { depth: 95, edge: 85, hills: 520, hillNear: 700, hillFar: 2200, water: null },
  beach: { depth: 42, edge: 150, hills: 0, hillNear: 1e9, hillFar: 1e9, water: -11 },
  space: { depth: 340, edge: 16, hills: 0, hillNear: 1e9, hillFar: 1e9, water: null },
};

export interface Terrain {
  /** distance (world units) from each grid cell to the nearest drivable cell */
  dist: Float32Array;
  height: (x: number, z: number) => number;
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
  /** low-res height texture for water depth */
  hTex: Float32Array;
  hRes: number;
  hRect: [number, number, number, number];
  shape: ThemeShape;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number): number {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5, y * 2.1 + 9) * 0.3 + vnoise(x * 4.3 + 13, y * 4.3 + 3) * 0.15;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Chamfer distance transform (in cells) from non-void cells. */
function distanceField(surf: Uint8Array): Float32Array {
  const n = GRID;
  const INF = 1e9;
  const d = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = surf[i] === SURF_VOID ? INF : 0;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (y > 0) {
        v = Math.min(v, d[i - n] + A);
        if (x > 0) v = Math.min(v, d[i - n - 1] + B);
        if (x < n - 1) v = Math.min(v, d[i - n + 1] + B);
      }
      d[i] = v;
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < n - 1) v = Math.min(v, d[i + 1] + A);
      if (y < n - 1) {
        v = Math.min(v, d[i + n] + A);
        if (x < n - 1) v = Math.min(v, d[i + n + 1] + B);
        if (x > 0) v = Math.min(v, d[i + n - 1] + B);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < n * n; i++) d[i] *= CELL;
  return d;
}

const cache = new Map<string, Terrain>();

/** Grid coordinates: dense inside the world square, sparse in the far apron. */
function axis(): number[] {
  const out: number[] = [];
  const APRON = 4200;
  const outer = 26;
  const inner = 420;
  for (let i = 0; i < outer; i++) {
    const t = i / outer;
    out.push(-APRON + APRON * (1 - Math.pow(1 - t, 1.6)) * 1);
  }
  for (let i = 0; i <= inner; i++) out.push((i / inner) * WORLD);
  for (let i = 1; i <= outer; i++) {
    const t = i / outer;
    out.push(WORLD + APRON * Math.pow(t, 1.6));
  }
  return out;
}

export function buildTerrain(track: Track): Terrain {
  const hit = cache.get(track.def.id);
  if (hit) return hit;
  const theme = track.def.theme;
  const shape = SHAPES[theme];
  const dist = distanceField(track.surf);

  const distAt = (x: number, z: number): number => {
    // bilinear on cell centers, extended outside the grid
    const gx = x / CELL - 0.5;
    const gz = z / CELL - 0.5;
    const cx = Math.max(0, Math.min(GRID - 1.001, gx));
    const cz = Math.max(0, Math.min(GRID - 1.001, gz));
    const ix = Math.floor(cx), iz = Math.floor(cz);
    const fx = cx - ix, fz = cz - iz;
    const i = iz * GRID + ix;
    const a = dist[i], b = dist[i + 1], c = dist[i + GRID], d = dist[i + GRID + 1];
    const v = a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
    const ox = Math.max(0, Math.abs(gx - cx)) * CELL;
    const oz = Math.max(0, Math.abs(gz - cz)) * CELL;
    return v + Math.hypot(ox, oz);
  };

  const height = (x: number, z: number): number => {
    const d = distAt(x, z);
    if (d <= 0.01) return 0;
    let h = -shape.depth * smooth(0, shape.edge, d);
    if (theme === 'space') {
      h = -shape.depth * smooth(0, shape.edge, d);
      return h;
    }
    if (theme === 'beach') {
      // gentle sea floor with sand bars
      h += (fbm(x * 0.002, z * 0.002) - 0.5) * 10 * smooth(150, 600, d);
      return h;
    }
    // undulating basin, then hills rising far from the track
    h += (fbm(x * 0.004, z * 0.004) - 0.5) * 18 * smooth(30, 200, d);
    const hill = smooth(shape.hillNear, shape.hillFar, d);
    if (hill > 0) {
      const n = fbm(x * 0.0011 + 3, z * 0.0011 + 7);
      h += hill * shape.hills * (0.35 + n * 0.9) + hill * (fbm(x * 0.006, z * 0.006) - 0.5) * 90;
    }
    return h;
  };

  const ax = axis();
  const n = ax.length;
  const pos = new Float32Array(n * n * 3);
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ax[i], z = ax[j];
      const h = height(x, z);
      H[j * n + i] = h;
      const o = (j * n + i) * 3;
      pos[o] = x;
      pos[o + 1] = h;
      pos[o + 2] = z;
    }
  }
  const nrm = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const dx = ax[i1] - ax[i0];
      const dz = ax[j1] - ax[j0];
      const hx = (H[j * n + i1] - H[j * n + i0]) / dx;
      const hz = (H[j1 * n + i] - H[j0 * n + i]) / dz;
      const l = Math.hypot(hx, 1, hz);
      const o = (j * n + i) * 3;
      nrm[o] = -hx / l;
      nrm[o + 1] = 1 / l;
      nrm[o + 2] = -hz / l;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // CCW seen from above (+Y): x right, z toward viewer
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  }

  // height texture for the water shader (covers world + some apron)
  const hRes = 256;
  const x0 = -1500, z0 = -1500, span = WORLD + 3000;
  const hTex = new Float32Array(hRes * hRes);
  for (let j = 0; j < hRes; j++) {
    for (let i = 0; i < hRes; i++) {
      hTex[j * hRes + i] = height(x0 + ((i + 0.5) / hRes) * span, z0 + ((j + 0.5) / hRes) * span);
    }
  }
  const t: Terrain = { dist, height, pos, nrm, idx, hTex, hRes, hRect: [x0, z0, 1 / span, 1 / span], shape };
  cache.set(track.def.id, t);
  return t;
}
