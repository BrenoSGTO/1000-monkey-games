import { mulberry32 } from './util';
import type { ItemStack } from './types';

export const MINE_W = 28;
export const MINE_H = 18;
export const MAX_FLOOR = 20;

export type RockKind = 'pedra' | 'carvao' | 'cobre' | 'ferro' | 'ouro' | 'quartzo' | 'diamante';

export interface MineRock {
  x: number;
  y: number;
  hp: number;
  kind: RockKind;
  ladder: boolean;
}

export interface Slime {
  x: number;
  y: number;
  hp: number;
  hurt: number;
  phase: number;
  kx: number;
  ky: number;
  cool: number;
}

const HP: Record<RockKind, number> = { pedra: 2, carvao: 3, cobre: 3, ferro: 5, ouro: 7, quartzo: 4, diamante: 9 };

export class Mine {
  floor: number;
  wall = new Uint8Array(MINE_W * MINE_H);
  rocks = new Map<number, MineRock>();
  slimes: Slime[] = [];
  ladderDown: [number, number] | null = null;
  ladderUp: [number, number] = [2, 2];
  chest: [number, number] | null = null;
  chestOpen = false;
  broken = 0;
  total = 0;

  constructor(floor: number, day: number) {
    this.floor = floor;
    const rng = mulberry32(floor * 997 + day * 131 + 5);
    for (let y = 0; y < MINE_H; y++) {
      for (let x = 0; x < MINE_W; x++) {
        const border = x === 0 || y === 0 || x === MINE_W - 1 || y === MINE_H - 1;
        this.wall[y * MINE_W + x] = border ? 1 : 0;
      }
    }
    // paredes internas em blocos
    for (let i = 0; i < 16; i++) {
      const bx = 3 + Math.floor(rng() * (MINE_W - 6));
      const by = 3 + Math.floor(rng() * (MINE_H - 6));
      const bw = 1 + Math.floor(rng() * 3);
      const bh = 1 + Math.floor(rng() * 2);
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (!(x < 6 && y < 6)) this.wall[y * MINE_W + x] = 1;
    }
    const free: number[] = [];
    for (let y = 1; y < MINE_H - 1; y++) {
      for (let x = 1; x < MINE_W - 1; x++) {
        if (this.wall[y * MINE_W + x]) continue;
        if (x < 5 && y < 5) continue;
        free.push(y * MINE_W + x);
      }
    }
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    const nRocks = Math.min(free.length - 10, 26 + Math.floor(floor * 0.8));
    for (let i = 0; i < nRocks; i++) {
      const k = free[i];
      const kind = this.rollKind(rng);
      this.rocks.set(k, { x: k % MINE_W, y: Math.floor(k / MINE_W), hp: HP[kind], kind, ladder: false });
    }
    this.total = nRocks;
    const arr = Array.from(this.rocks.values());
    if (floor < MAX_FLOOR && arr.length) arr[Math.floor(rng() * arr.length)].ladder = true;
    if (floor === MAX_FLOOR) {
      this.chest = [MINE_W - 3, MINE_H - 3];
      this.wall[(MINE_H - 3) * MINE_W + MINE_W - 3] = 0;
      this.rocks.delete((MINE_H - 3) * MINE_W + MINE_W - 3);
    }
    const nS = 2 + Math.floor(floor / 3);
    for (let i = 0; i < nS; i++) {
      const k = free[free.length - 1 - i];
      if (k === undefined || this.rocks.has(k)) continue;
      this.slimes.push({ x: (k % MINE_W) * 16 + 8, y: Math.floor(k / MINE_W) * 16 + 14, hp: 3 + Math.floor(floor / 6), hurt: 0, phase: rng() * 6, kx: 0, ky: 0, cool: 0 });
    }
  }

  private rollKind(rng: () => number): RockKind {
    const r = rng();
    const f = this.floor;
    if (f >= 16 && r < 0.06) return 'diamante';
    if (f >= 11 && r < 0.2) return 'ouro';
    if (f >= 6 && r < 0.34) return 'ferro';
    if (f >= 3 && r < 0.12) return 'quartzo';
    if (r < 0.46) return 'cobre';
    if (r < 0.56) return 'carvao';
    return 'pedra';
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MINE_W || y >= MINE_H) return true;
    const k = y * MINE_W + x;
    return !!this.wall[k] || this.rocks.has(k);
  }

  /** Bate em uma pedra; retorna drops e se revelou a escada. */
  hit(x: number, y: number, power: number): { hit: boolean; broke: boolean; grant: ItemStack[]; ladder: boolean; kind?: RockKind } {
    const k = y * MINE_W + x;
    const r = this.rocks.get(k);
    if (!r) return { hit: false, broke: false, grant: [], ladder: false };
    r.hp -= power;
    if (r.hp > 0) return { hit: true, broke: false, grant: [], ladder: false, kind: r.kind };
    this.rocks.delete(k);
    this.broken++;
    const grant: ItemStack[] = [];
    if (r.kind === 'pedra') grant.push({ id: 'pedra', n: 1 + Math.floor(Math.random() * 2) });
    else {
      grant.push({ id: r.kind, n: 1 });
      if (Math.random() < 0.4) grant.push({ id: 'pedra', n: 1 });
    }
    let ladder = false;
    if (r.ladder) {
      this.ladderDown = [x, y];
      ladder = true;
    }
    return { hit: true, broke: true, grant, ladder, kind: r.kind };
  }
}
