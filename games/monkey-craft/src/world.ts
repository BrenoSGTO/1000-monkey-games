import { BLOCKS, COST, EMIT, OPAQUE, SOLID } from './data';
import { B, CH, H, W } from './types';
import { generate } from './worldgen';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const QMASK = (1 << 19) - 1;

export type ChangeHandler = (x: number, y: number, old: number, id: number, local: boolean) => void;

export class World {
  readonly seed: number;
  readonly tiles: Uint8Array;
  readonly gen: Uint8Array;
  readonly surf: Int16Array;
  readonly skyTop = new Int16Array(W);
  readonly sky = new Uint8Array(W * H);
  readonly blk = new Uint8Array(W * H);
  readonly edits = new Map<number, number>();
  pending: number[] = [];
  private dirty: Rect[] = [];
  private waterActive = new Set<number>();
  private queue = new Int32Array(QMASK + 1);
  onChange: ChangeHandler | null = null;
  lightVersion = 0;

  constructor(seed: number) {
    this.seed = seed;
    const g = generate(seed);
    this.gen = g.tiles;
    this.tiles = g.tiles.slice();
    this.surf = g.surf;
    this.recomputeSkyTop();
    this.relightRect(0, 0, W - 1, H - 1);
  }

  get spawnX(): number {
    return Math.floor(W / 2) + 0.5;
  }
  get spawnY(): number {
    let y = 0;
    const x = Math.floor(W / 2);
    while (y < H - 1 && !SOLID[this.tiles[y * W + x]] && this.tiles[y * W + x] !== B.WATER) y++;
    return y;
  }

  private recomputeSkyTop(): void {
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H && !OPAQUE[this.tiles[y * W + x]]) y++;
      this.skyTop[x] = y;
    }
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= W || y >= H) return B.BEDROCK;
    if (y < 0) return B.AIR;
    return this.tiles[y * W + x];
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && x < W && y >= 0 && y < H;
  }

  isSolid(x: number, y: number): boolean {
    return SOLID[this.get(x, y)] === 1;
  }

  light(x: number, y: number): number {
    if (x < 0 || x >= W || y < 0 || y >= H) return 0;
    const i = y * W + x;
    return Math.max(this.sky[i], this.blk[i]);
  }

  /** Aplica uma mudança. silent = não envia diff pela rede. */
  set(x: number, y: number, id: number, silent = false): boolean {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    const i = y * W + x;
    const old = this.tiles[i];
    if (old === id) return false;
    this.tiles[i] = id;
    if (this.gen[i] === id) this.edits.delete(i);
    else this.edits.set(i, id);
    if (!silent) this.pending.push(i, id);

    const wasOp = OPAQUE[old] === 1;
    const isOp = OPAQUE[id] === 1;
    if (isOp && y < this.skyTop[x]) {
      const oldTop = this.skyTop[x];
      this.skyTop[x] = y;
      this.markDirty(x, y, x, Math.min(H - 1, oldTop));
    } else if (wasOp && !isOp && y === this.skyTop[x]) {
      let ny = y + 1;
      while (ny < H && !OPAQUE[this.tiles[ny * W + x]]) ny++;
      this.skyTop[x] = ny;
      this.markDirty(x, y, x, Math.min(H - 1, ny));
    } else {
      this.markDirty(x, y, x, y);
    }
    this.wakeWater(x, y);
    this.onChange?.(x, y, old, id, !silent);
    return true;
  }

  takeDiffs(): number[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }

  exportEdits(): number[] {
    const out: number[] = [];
    for (const [i, id] of this.edits) out.push(i, id);
    return out;
  }

  /** Edits agrupados por chunk (CH x CH) para o save. */
  exportChunks(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    const cw = Math.ceil(W / CH);
    for (const [i, id] of this.edits) {
      const x = i % W;
      const y = (i / W) | 0;
      const key = String((y >> 4) * cw + (x >> 4));
      (out[key] ??= []).push(((y & 15) << 4) | (x & 15), id);
    }
    return out;
  }

  importChunks(chunks: Record<string, number[]>): void {
    const cw = Math.ceil(W / CH);
    const flat: number[] = [];
    for (const key of Object.keys(chunks)) {
      const c = Number(key);
      const cx = c % cw;
      const cy = (c / cw) | 0;
      const arr = chunks[key];
      for (let k = 0; k + 1 < arr.length; k += 2) {
        const lx = arr[k] & 15;
        const ly = arr[k] >> 4;
        flat.push((cy * CH + ly) * W + cx * CH + lx, arr[k + 1]);
      }
    }
    this.importEdits(flat);
  }

  /** Aplica edits em massa (carregar save / join) e refaz a luz de uma vez. */
  importEdits(flat: number[]): void {
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const i = flat[k];
      const id = flat[k + 1];
      if (i < 0 || i >= W * H) continue;
      this.tiles[i] = id;
      if (this.gen[i] === id) this.edits.delete(i);
      else this.edits.set(i, id);
    }
    this.recomputeSkyTop();
    this.dirty = [];
    this.relightRect(0, 0, W - 1, H - 1);
    this.lightVersion++;
  }

  // -------------------- Luz --------------------
  private markDirty(x0: number, y0: number, x1: number, y1: number): void {
    for (const r of this.dirty) {
      if (x0 <= r.x1 + 5 && x1 >= r.x0 - 5 && y0 <= r.y1 + 5 && y1 >= r.y0 - 5) {
        r.x0 = Math.min(r.x0, x0);
        r.y0 = Math.min(r.y0, y0);
        r.x1 = Math.max(r.x1, x1);
        r.y1 = Math.max(r.y1, y1);
        return;
      }
    }
    this.dirty.push({ x0, y0, x1, y1 });
  }

  updateLight(maxRects = 6): void {
    let n = 0;
    while (this.dirty.length > 0 && n < maxRects) {
      const r = this.dirty.shift()!;
      this.relightRect(r.x0 - 16, r.y0 - 16, r.x1 + 16, r.y1 + 16);
      n++;
    }
    if (n > 0) this.lightVersion++;
  }

  private relightRect(rx0: number, ry0: number, rx1: number, ry1: number): void {
    const x0 = Math.max(0, rx0);
    const y0 = Math.max(0, ry0);
    const x1 = Math.min(W - 1, rx1);
    const y1 = Math.min(H - 1, ry1);
    for (let pass = 0; pass < 2; pass++) {
      const arr = pass === 0 ? this.sky : this.blk;
      for (let y = y0; y <= y1; y++) {
        const row = y * W;
        for (let x = x0; x <= x1; x++) arr[row + x] = 0;
      }
      const q = this.queue;
      let qh = 0;
      let qt = 0;
      // fontes
      for (let y = y0; y <= y1; y++) {
        const row = y * W;
        for (let x = x0; x <= x1; x++) {
          const i = row + x;
          if (pass === 0) {
            if (y < this.skyTop[x]) {
              arr[i] = 15;
              q[qt++ & QMASK] = i;
            }
          } else {
            const e = EMIT[this.tiles[i]];
            if (e > 0) {
              arr[i] = e;
              q[qt++ & QMASK] = i;
            }
          }
        }
      }
      // bordas (luz entrando de fora)
      const seed = (x: number, y: number, ox: number, oy: number) => {
        if (ox < 0 || ox >= W || oy < 0 || oy >= H) return;
        const i = y * W + x;
        const v = arr[oy * W + ox] - COST[this.tiles[i]];
        if (v > arr[i]) {
          arr[i] = v;
          q[qt++ & QMASK] = i;
        }
      };
      for (let x = x0; x <= x1; x++) {
        seed(x, y0, x, y0 - 1);
        seed(x, y1, x, y1 + 1);
      }
      for (let y = y0; y <= y1; y++) {
        seed(x0, y, x0 - 1, y);
        seed(x1, y, x1 + 1, y);
      }
      while (qh < qt) {
        const i = q[qh++ & QMASK];
        const v = arr[i];
        if (v <= 1) continue;
        const x = i % W;
        const y = (i / W) | 0;
        if (x > x0) {
          const n = i - 1;
          const nv = v - COST[this.tiles[n]];
          if (nv > arr[n]) {
            arr[n] = nv;
            q[qt++ & QMASK] = n;
          }
        }
        if (x < x1) {
          const n = i + 1;
          const nv = v - COST[this.tiles[n]];
          if (nv > arr[n]) {
            arr[n] = nv;
            q[qt++ & QMASK] = n;
          }
        }
        if (y > y0) {
          const n = i - W;
          const nv = v - COST[this.tiles[n]];
          if (nv > arr[n]) {
            arr[n] = nv;
            q[qt++ & QMASK] = n;
          }
        }
        if (y < y1) {
          const n = i + W;
          const nv = v - COST[this.tiles[n]];
          if (nv > arr[n]) {
            arr[n] = nv;
            q[qt++ & QMASK] = n;
          }
        }
      }
    }
  }

  // -------------------- Água --------------------
  private wakeWater(x: number, y: number): void {
    const s = this.waterActive;
    if (s.size > 4000) return;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && this.tiles[ny * W + nx] === B.WATER) s.add(ny * W + nx);
      }
    }
  }

  /** Simulação simples de fluidos: queda + espalhamento lateral sob pressão. */
  stepWater(budget = 160): void {
    if (this.waterActive.size === 0) return;
    const list: number[] = [];
    for (const i of this.waterActive) {
      list.push(i);
      if (list.length >= budget) break;
    }
    for (const i of list) this.waterActive.delete(i);
    for (const i of list) {
      if (this.tiles[i] !== B.WATER) continue;
      const x = i % W;
      const y = (i / W) | 0;
      if (y >= H - 2) continue;
      const below = this.tiles[i + W];
      if (below === B.AIR || BLOCKS[below].plant || below === B.TALLGRASS) {
        this.set(x, y, B.AIR);
        this.set(x, y + 1, B.WATER);
        continue;
      }
      if (this.tiles[i - W] === B.WATER) {
        const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
        for (const dx of dirs) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          if (this.tiles[y * W + nx] === B.AIR) {
            this.set(x, y, B.AIR);
            this.set(nx, y, B.WATER);
            break;
          }
        }
      }
    }
  }
}
