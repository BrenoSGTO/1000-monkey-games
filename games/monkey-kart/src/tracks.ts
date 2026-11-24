import { SURF_ROAD, SURF_SHORT, SURF_SLOW, SURF_VOID } from './types';
import { TAU, angDiff, clamp, mulberry32 } from './util';

export const WORLD = 5120;
export const GRID = 1024;
export const CELL = WORLD / GRID; // 5 units
export const TEX = 2048;
export const TEX_SCALE = WORLD / TEX; // 2.5 units per texel
export const SAMPLE_STEP = 10;

export type Theme = 'jungle' | 'favela' | 'beach' | 'space';

export interface ShortcutDef {
  /** lap fraction where the shortcut leaves the road */
  from: number;
  /** lap fraction where it rejoins */
  to: number;
  /** optional extra grid points the path bends through */
  via?: [number, number][];
}
export interface HazardDef {
  kind: 'crab' | 'dog' | 'asteroid' | 'barrel' | 'log';
  t: number; // fraction of lap
  amp: number; // fraction of halfW
  period: number;
  phase?: number;
}
export interface PuddleDef {
  t: number;
  lat: number; // fraction of halfW
  r: number;
}

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  theme: Theme;
  emoji: string;
  accent: string;
  scale: number;
  ox: number;
  oy: number;
  pts: [number, number][];
  halfW: number;
  margin: number;
  shortcuts: ShortcutDef[];
  pads: { t: number; lat?: number }[];
  boxRows: number[];
  hazards: HazardDef[];
  puddles: PuddleDef[];
  sceneryCount: number;
  seed: number;
  bestHint: string;
}

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'selva',
    name: 'Selva Encharcada',
    subtitle: 'Lama, cipós e um atalho pela ponte de tábua podre.',
    theme: 'jungle',
    emoji: '🌴',
    accent: '#4ade80',
    scale: 33,
    ox: 900,
    oy: 900,
    pts: [
      [30, 10], [52, 8], [74, 12], [90, 24], [88, 40], [74, 48], [60, 44], [50, 54], [58, 68],
      [76, 72], [88, 84], [74, 94], [50, 92], [36, 80], [44, 66], [30, 58], [14, 66], [8, 50], [12, 30],
    ],
    halfW: 95,
    margin: 135,
    shortcuts: [{ from: 0.435, to: 0.567 }],
    pads: [{ t: 0.05 }, { t: 0.38 }, { t: 0.66, lat: 0.4 }, { t: 0.9, lat: -0.4 }],
    boxRows: [0.12, 0.3, 0.5, 0.7, 0.88],
    hazards: [
      { kind: 'log', t: 0.2, amp: 0.55, period: 5.2 },
      { kind: 'log', t: 0.58, amp: 0.55, period: 4.4, phase: 2 },
    ],
    puddles: [
      { t: 0.27, lat: -0.35, r: 95 },
      { t: 0.46, lat: 0.4, r: 100 },
      { t: 0.8, lat: 0.1, r: 95 },
    ],
    sceneryCount: 520,
    seed: 11,
    bestHint: 'Atalho: ponte de tábua cortando a baía (só rende com Guaraná ou mini-turbo!).',
  },
  {
    id: 'favela',
    name: 'Favela Ladeira',
    subtitle: 'Ladeira abaixo, laje acima. Cuidado com o caramelo!',
    theme: 'favela',
    emoji: '🏘️',
    accent: '#fb923c',
    scale: 33,
    ox: 900,
    oy: 900,
    pts: [
      [14, 14], [40, 10], [66, 14], [84, 12], [92, 28], [78, 38], [56, 34], [40, 42], [54, 54], [80, 58],
      [92, 72], [80, 88], [56, 84], [44, 72], [28, 80], [16, 88], [6, 72], [18, 58], [8, 42], [6, 28],
    ],
    halfW: 82,
    margin: 120,
    shortcuts: [{ from: 0.315, to: 0.434 }],
    pads: [{ t: 0.04 }, { t: 0.33 }, { t: 0.55 }, { t: 0.82 }],
    boxRows: [0.1, 0.27, 0.45, 0.64, 0.85],
    hazards: [
      { kind: 'dog', t: 0.15, amp: 0.6, period: 3.6 },
      { kind: 'dog', t: 0.52, amp: 0.6, period: 3.0, phase: 1.5 },
      { kind: 'barrel', t: 0.72, amp: 0.42, period: 1 },
      { kind: 'dog', t: 0.9, amp: 0.6, period: 3.3, phase: 3 },
    ],
    puddles: [
      { t: 0.22, lat: 0.3, r: 85 },
      { t: 0.6, lat: -0.3, r: 85 },
    ],
    sceneryCount: 560,
    seed: 27,
    bestHint: 'Atalho: viela entre as lajes. Só vale a pena com turbo!',
  },
  {
    id: 'praia',
    name: 'Praia do Coco',
    subtitle: 'Sol, areia e caranguejo mal-humorado. Atalho pelo mar raso.',
    theme: 'beach',
    emoji: '🏖️',
    accent: '#38bdf8',
    scale: 33,
    ox: 900,
    oy: 900,
    pts: [
      [20, 18], [48, 10], [76, 14], [92, 30], [88, 50], [70, 58], [54, 50], [40, 58], [46, 72],
      [66, 76], [84, 84], [78, 96], [54, 96], [30, 90], [12, 76], [10, 54], [8, 34],
    ],
    halfW: 105,
    margin: 235,
    shortcuts: [{ from: 0.365, to: 0.495 }],
    pads: [{ t: 0.06 }, { t: 0.31, lat: 0.35 }, { t: 0.5 }, { t: 0.78, lat: -0.35 }],
    boxRows: [0.13, 0.32, 0.52, 0.72, 0.9],
    hazards: [
      { kind: 'crab', t: 0.17, amp: 0.7, period: 3.4 },
      { kind: 'crab', t: 0.44, amp: 0.7, period: 3.0, phase: 1.2 },
      { kind: 'crab', t: 0.67, amp: 0.7, period: 3.8, phase: 2.4 },
      { kind: 'crab', t: 0.93, amp: 0.7, period: 3.2, phase: 4 },
    ],
    puddles: [
      { t: 0.25, lat: -0.4, r: 90 },
      { t: 0.84, lat: 0.35, r: 90 },
    ],
    sceneryCount: 480,
    seed: 5,
    bestHint: 'Atalho: areia fofa cortando a enseada (Guaraná na entrada!).',
  },
  {
    id: 'estacao',
    name: 'Estação Espacial Banana',
    subtitle: 'Gravidade zero de cérebro. Ponte de luz cortando o vácuo.',
    theme: 'space',
    emoji: '🚀',
    accent: '#c084fc',
    scale: 33,
    ox: 900,
    oy: 900,
    pts: [
      [24, 12], [50, 8], [76, 12], [90, 24], [86, 40], [66, 40], [52, 28], [36, 34], [34, 50], [54, 56],
      [74, 60], [90, 72], [82, 88], [60, 92], [38, 86], [20, 90], [8, 76], [14, 58], [8, 40], [10, 24],
    ],
    halfW: 90,
    margin: 140,
    shortcuts: [{ from: 0.318, to: 0.436 }],
    pads: [{ t: 0.03 }, { t: 0.2 }, { t: 0.45, lat: 0.4 }, { t: 0.62, lat: -0.4 }, { t: 0.85 }],
    boxRows: [0.1, 0.28, 0.46, 0.66, 0.86],
    hazards: [
      { kind: 'asteroid', t: 0.24, amp: 0.65, period: 4.6 },
      { kind: 'asteroid', t: 0.56, amp: 0.65, period: 4.0, phase: 2.5 },
      { kind: 'asteroid', t: 0.78, amp: 0.65, period: 5.0, phase: 4.2 },
    ],
    puddles: [],
    sceneryCount: 420,
    seed: 77,
    bestHint: 'Atalho: ponte de luz sobre o vácuo, só a toda velocidade (Guaraná ou mini-turbo)!',
  },
];

export interface Pad {
  x: number;
  y: number;
  tx: number;
  ty: number;
  len: number;
  wid: number;
}
export interface BoxSpot {
  x: number;
  y: number;
  idx: number;
}
export interface HazardSpec {
  kind: HazardDef['kind'];
  i0: number;
  amp: number;
  period: number;
  phase: number;
  r: number;
}
export interface Puddle {
  x: number;
  y: number;
  r: number;
}
export interface Scenery {
  x: number;
  y: number;
  kind: string;
  scale: number;
  flip: boolean;
}

export interface Track {
  def: TrackDef;
  N: number;
  step: number;
  length: number;
  halfW: number;
  px: Float32Array;
  py: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  curv: Float32Array;
  lineOff: Float32Array;
  surf: Uint8Array;
  shortcuts: { x: number; y: number }[][];
  pads: Pad[];
  boxSpots: BoxSpot[];
  hazards: HazardSpec[];
  puddles: Puddle[];
  scenery: Scenery[];
  minRadius: number;
}

type V2 = [number, number];

function crCentripetal(p0: V2, p1: V2, p2: V2, p3: V2, t: number): V2 {
  const d = (a: V2, b: V2) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  const t0 = 0;
  const t1 = t0 + d(p0, p1);
  const t2 = t1 + d(p1, p2);
  const t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a: V2, b: V2, ta: number, tb: number): V2 => {
    const k = (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

function splineClosed(pts: V2[], per: number): V2[] {
  const n = pts.length;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) out.push(crCentripetal(p0, p1, p2, p3, k / per));
  }
  return out;
}

function splineOpen(pts: V2[], per: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) out.push(crCentripetal(p0, p1, p2, p3, k / per));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function resample(poly: V2[], step: number, closed: boolean): V2[] {
  const pts = closed ? [...poly, poly[0]] : poly;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step));
  const out: V2[] = [];
  let j = 0;
  const last = closed ? n : n + 1;
  for (let i = 0; i < last; i++) {
    const s = (i / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const k = (s - cum[j]) / seg;
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k]);
  }
  return out;
}

function smoothClosed(pts: V2[], passes: number, win: number): V2[] {
  let cur = pts;
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    const next: V2[] = [];
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      for (let j = -win; j <= win; j++) {
        const q = cur[(i + j + n) % n];
        sx += q[0];
        sy += q[1];
      }
      next.push([sx / (2 * win + 1), sy / (2 * win + 1)]);
    }
    cur = next;
  }
  return cur;
}

function stampDisc(surf: Uint8Array, cx: number, cy: number, r: number, value: number, onlyBelow: number): void {
  const gx0 = Math.max(0, Math.floor((cx - r) / CELL));
  const gx1 = Math.min(GRID - 1, Math.ceil((cx + r) / CELL));
  const gy0 = Math.max(0, Math.floor((cy - r) / CELL));
  const gy1 = Math.min(GRID - 1, Math.ceil((cy + r) / CELL));
  const r2 = r * r;
  for (let gy = gy0; gy <= gy1; gy++) {
    const wy = (gy + 0.5) * CELL - cy;
    for (let gx = gx0; gx <= gx1; gx++) {
      const wx = (gx + 0.5) * CELL - cx;
      if (wx * wx + wy * wy <= r2) {
        const o = gy * GRID + gx;
        if (surf[o] < onlyBelow) surf[o] = value;
      }
    }
  }
}

const HALF_WIDTH: Record<string, number> = {
  house: 105, house2: 90, tower: 55, shack: 95, umbrella: 75, panel: 110, asteroid: 95, tree: 95, palm: 90,
  laundry: 95, castle: 65, dish: 75, antenna: 50, crystal: 55, rock: 55, stump: 45, fern: 60,
};

const BEACH_LAND = new Set(['palm', 'umbrella', 'shack', 'castle']);

const cache = new Map<string, Track>();

export function buildTrack(def: TrackDef): Track {
  const cached = cache.get(def.id);
  if (cached) return cached;

  const ctrl: V2[] = def.pts.map(([x, y]) => [x * def.scale + def.ox, y * def.scale + def.oy]);
  const dense = splineClosed(ctrl, 48);
  let samples = resample(dense, SAMPLE_STEP, true);
  samples = smoothClosed(samples, 3, 18);
  const N = samples.length;
  const step = 0; // placeholder to keep types simple
  void step;

  let length = 0;
  for (let i = 0; i < N; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % N];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const stepReal = length / N;

  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const nx = new Float32Array(N);
  const ny = new Float32Array(N);
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = samples[i][0];
    py[i] = samples[i][1];
  }
  for (let i = 0; i < N; i++) {
    const a = samples[(i - 1 + N) % N];
    const b = samples[(i + 1) % N];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
    nx[i] = -ty[i]; // right-hand normal in y-down space
    ny[i] = tx[i];
  }
  // right normal in y-down: right of (cos h, sin h) is (-sin h, cos h)
  let minRadius = 1e9;
  const K = 4;
  for (let i = 0; i < N; i++) {
    const h1 = Math.atan2(ty[(i - K + N) % N], tx[(i - K + N) % N]);
    const h2 = Math.atan2(ty[(i + K) % N], tx[(i + K) % N]);
    curv[i] = angDiff(h2, h1) / (2 * K * stepReal);
    if (Math.abs(curv[i]) > 1e-6) minRadius = Math.min(minRadius, 1 / Math.abs(curv[i]));
  }

  // surface raster
  const surf = new Uint8Array(GRID * GRID);
  const rSlow = def.halfW + def.margin;
  for (let i = 0; i < N; i++) stampDisc(surf, px[i], py[i], rSlow, SURF_SLOW, SURF_SLOW);
  for (let i = 0; i < N; i++) stampDisc(surf, px[i], py[i], def.halfW, SURF_ROAD, SURF_ROAD);

  // shortcuts
  const shortcuts: { x: number; y: number }[][] = [];
  const ctrlAt = (frac: number): { p: V2; t: V2 } => {
    const i = Math.floor((((frac % 1) + 1) % 1) * N) % N;
    return { p: [px[i], py[i]], t: [tx[i], ty[i]] };
  };
  for (const sc of def.shortcuts) {
    const a = ctrlAt(sc.from);
    const b = ctrlAt(sc.to);
    const via: V2[] = (sc.via ?? []).map(([x, y]) => [x * def.scale + def.ox, y * def.scale + def.oy]);
    const pre: V2 = [a.p[0] - a.t[0] * 120, a.p[1] - a.t[1] * 120];
    const post: V2 = [b.p[0] + b.t[0] * 120, b.p[1] + b.t[1] * 120];
    const poly = splineOpen([pre, a.p, ...via, b.p, post], 24);
    const dens = resample(poly, 10, false);
    // drop the pre/post helper stretches (first/last 12 samples are along the road anyway)
    const trimmed = dens.slice(12, dens.length - 12);
    shortcuts.push(trimmed.map(([x, y]) => ({ x, y })));
    for (const [x, y] of trimmed) {
      stampDisc(surf, x, y, 48, SURF_SLOW, SURF_SLOW); // soft verge so it's a visible path
    }
    for (const [x, y] of trimmed) stampDisc(surf, x, y, 40, SURF_SHORT, SURF_ROAD);
  }

  // AI racing line: lateral offsets (positive = right of travel direction)
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let kk = 0;
    for (let j = 0; j < 14; j++) kk += curv[(i + j * 2) % N];
    kk /= 14;
    raw[i] = clamp(kk * 520, -1, 1) * def.halfW * 0.55;
  }
  const lineOff = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -12; j <= 12; j++) s += raw[(i + j + N) % N];
    lineOff[i] = s / 25;
  }

  const track: Track = {
    def,
    N,
    step: stepReal,
    length,
    halfW: def.halfW,
    px,
    py,
    tx,
    ty,
    nx,
    ny,
    curv,
    lineOff,
    surf,
    shortcuts,
    pads: [],
    boxSpots: [],
    hazards: [],
    puddles: [],
    scenery: [],
    minRadius,
  };

  const idxAtT = (t: number) => Math.floor((((t % 1) + 1) % 1) * N) % N;
  for (const p of def.pads) {
    const i = idxAtT(p.t);
    const lat = (p.lat ?? 0) * def.halfW;
    track.pads.push({ x: px[i] + nx[i] * lat, y: py[i] + ny[i] * lat, tx: tx[i], ty: ty[i], len: 120, wid: def.halfW * 0.62 });
  }
  for (const rowT of def.boxRows) {
    const i = idxAtT(rowT);
    for (const lat of [-0.66, -0.22, 0.22, 0.66]) {
      track.boxSpots.push({ x: px[i] + nx[i] * lat * def.halfW, y: py[i] + ny[i] * lat * def.halfW, idx: i });
    }
  }
  for (const h of def.hazards) {
    track.hazards.push({
      kind: h.kind,
      i0: idxAtT(h.t),
      amp: h.amp * def.halfW,
      period: h.period,
      phase: h.phase ?? 0,
      r: h.kind === 'asteroid' ? 30 : h.kind === 'dog' ? 24 : 22,
    });
  }
  for (const p of def.puddles) {
    const i = idxAtT(p.t);
    track.puddles.push({ x: px[i] + nx[i] * p.lat * def.halfW, y: py[i] + ny[i] * p.lat * def.halfW, r: p.r });
  }

  // scenery (decoration only, never on the road)
  const rnd = mulberry32(def.seed);
  const kinds: Record<Theme, string[]> = {
    jungle: ['tree', 'tree', 'tree', 'palm', 'fern', 'fern', 'rock', 'stump', 'flower'],
    favela: ['house', 'house', 'house', 'house2', 'house2', 'tower', 'lamp', 'laundry', 'house'],
    beach: ['palm', 'palm', 'palm', 'umbrella', 'rock', 'shack', 'buoy', 'castle', 'palm'],
    space: ['antenna', 'panel', 'crystal', 'asteroid', 'asteroid', 'dish', 'crystal', 'panel'],
  };
  const list = kinds[def.theme];
  let tries = 0;
  while (track.scenery.length < def.sceneryCount && tries < def.sceneryCount * 12) {
    tries++;
    const i = Math.floor(rnd() * N);
    const side = rnd() < 0.5 ? -1 : 1;
    const kind = list[Math.floor(rnd() * list.length)];
    const sc = 0.8 + rnd() * 0.6;
    let d = def.halfW + def.margin * (0.55 + rnd() * 0.5) + Math.pow(rnd(), 1.6) * 900 + (HALF_WIDTH[kind] ?? 50) * sc;
    if (def.theme === 'beach' && BEACH_LAND.has(kind)) {
      // beach props stand on the sand band, not in the sea
      const lo = def.halfW + 55 + (HALF_WIDTH[kind] ?? 50) * sc;
      const hi = def.halfW + def.margin - 15;
      if (hi <= lo) continue;
      d = lo + rnd() * (hi - lo);
    }
    const x = px[i] + nx[i] * d * side + (rnd() - 0.5) * 60;
    const y = py[i] + ny[i] * d * side + (rnd() - 0.5) * 60;
    if (x < 30 || y < 30 || x > WORLD - 30 || y > WORLD - 30) continue;
    const s = surfAtRaw(surf, x, y);
    if (s === SURF_ROAD || s === SURF_SHORT) continue;
    if (s === SURF_SLOW && d > def.halfW + def.margin * 0.9 && !(def.theme === 'beach' && BEACH_LAND.has(kind))) continue;
    // keep a minimal clearance from road cells around
    if (surfAtRaw(surf, x + 40, y) === SURF_ROAD || surfAtRaw(surf, x - 40, y) === SURF_ROAD || surfAtRaw(surf, x, y + 40) === SURF_ROAD || surfAtRaw(surf, x, y - 40) === SURF_ROAD) continue;
    track.scenery.push({ x, y, kind, scale: sc, flip: rnd() < 0.5 });
  }

  cache.set(def.id, track);
  return track;
}

function surfAtRaw(surf: Uint8Array, x: number, y: number): number {
  const gx = Math.floor(x / CELL);
  const gy = Math.floor(y / CELL);
  if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return SURF_VOID;
  return surf[gy * GRID + gx];
}

export function surfaceAt(track: Track, x: number, y: number): number {
  return surfAtRaw(track.surf, x, y);
}

export interface NearestResult {
  idx: number;
  dist: number;
  /** signed lateral offset: positive = right of travel direction */
  lat: number;
}

/**
 * Find the nearest centerline sample within a window around `prevIdx`.
 * `back`/`fwd` are counted in samples.
 */
export function nearestIdx(track: Track, x: number, y: number, prevIdx: number, back = 40, fwd = 220): NearestResult {
  const N = track.N;
  let best = Infinity;
  let bi = prevIdx;
  for (let o = -back; o <= fwd; o++) {
    const i = (((prevIdx + o) % N) + N) % N;
    const dx = x - track.px[i];
    const dy = y - track.py[i];
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      bi = i;
    }
  }
  const dx = x - track.px[bi];
  const dy = y - track.py[bi];
  return { idx: bi, dist: Math.sqrt(best), lat: dx * track.nx[bi] + dy * track.ny[bi] };
}

export function globalNearest(track: Track, x: number, y: number): NearestResult {
  const N = track.N;
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < N; i++) {
    const dx = x - track.px[i];
    const dy = y - track.py[i];
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      bi = i;
    }
  }
  const dx = x - track.px[bi];
  const dy = y - track.py[bi];
  return { idx: bi, dist: Math.sqrt(best), lat: dx * track.nx[bi] + dy * track.ny[bi] };
}

export function trackPoint(track: Track, idxF: number, lateral = 0): { x: number; y: number; h: number } {
  const N = track.N;
  const i0 = ((Math.floor(idxF) % N) + N) % N;
  const i1 = (i0 + 1) % N;
  const f = idxF - Math.floor(idxF);
  const x = track.px[i0] + (track.px[i1] - track.px[i0]) * f;
  const y = track.py[i0] + (track.py[i1] - track.py[i0]) * f;
  const tx = track.tx[i0] + (track.tx[i1] - track.tx[i0]) * f;
  const ty = track.ty[i0] + (track.ty[i1] - track.ty[i0]) * f;
  const l = Math.hypot(tx, ty) || 1;
  const ux = tx / l;
  const uy = ty / l;
  return { x: x + -uy * lateral, y: y + ux * lateral, h: Math.atan2(uy, ux) };
}

/** Starting grid slot j (0 = pole position). */
export function gridSlot(track: Track, j: number): { x: number; y: number; h: number; idx: number } {
  const row = j >> 1;
  const col = j & 1;
  const back = 55 + row * 62 + (col ? 0 : 28);
  const idxF = -back / track.step;
  const lat = (col ? 1 : -1) * track.halfW * 0.42;
  const p = trackPoint(track, idxF + track.N, lat);
  return { ...p, idx: (((Math.floor(idxF) % track.N) + track.N) % track.N) };
}

export function hazardPos(track: Track, hz: HazardSpec, t: number): { x: number; y: number; vx: number; vy: number } {
  const i = hz.i0;
  const w = TAU / hz.period;
  const still = hz.kind === 'barrel';
  const lat = still ? hz.amp : hz.amp * Math.sin(w * t + hz.phase);
  const latV = still ? 0 : hz.amp * w * Math.cos(w * t + hz.phase);
  return {
    x: track.px[i] + track.nx[i] * lat,
    y: track.py[i] + track.ny[i] * lat,
    vx: track.nx[i] * latV,
    vy: track.ny[i] * latV,
  };
}
