import type { Dir, ItemStack, Look, MapId, RemoteInfo, ToolId } from './types';
import { World } from './world';
import type { Mine } from './mine';
import { playerLook } from './data';

export type Mode = 'title' | 'play' | 'modal' | 'fish' | 'sleep';

export interface Player {
  id: string;
  name: string;
  fi: number;
  si: number;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  animT: number;
  map: MapId;
  tiers: Record<ToolId, number>;
  inv: (ItemStack | null)[];
  energy: number;
  maxEnergy: number;
  water: number;
  sel: number;
  swing: number;
  swingMax: number;
  swingSlot: number;
  sleeping: boolean;
  mineMax: number;
  invuln: number;
  flash: number;
}

export interface Remote {
  info: RemoteInfo;
  x: number;
  y: number;
  anim: number;
  look: Look;
  swing: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  col: string;
  size: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  col: string;
}

export interface FishState {
  phase: 'cast' | 'wait' | 'bite' | 'reel' | 'done';
  t: number;
  biteAt: number;
  fx: number; // posição do bobber (tile)
  fy: number;
  area: 'rio' | 'mar';
  fish: string;
  diff: number;
  bar: number;
  barV: number;
  pos: number;
  target: number;
  prog: number;
  perfect: boolean;
  junk: boolean;
}

export const INV_SIZE = 24;
export const HOTBAR = 12;

export function newPlayer(name: string, fi: number, si: number): Player {
  return {
    id: 'me',
    name,
    fi,
    si,
    x: 7 * 16 + 8,
    y: 15 * 16 + 12,
    dir: 0,
    moving: false,
    animT: 0,
    map: 'world',
    tiers: { hoe: 0, can: 0, axe: 0, pick: 0, rod: 0, sickle: 0 },
    inv: new Array(INV_SIZE).fill(null),
    energy: 120,
    maxEnergy: 120,
    water: 20,
    sel: 0,
    swing: 0,
    swingMax: 0.3,
    swingSlot: 0,
    sleeping: false,
    mineMax: 0,
    invuln: 0,
    flash: 0,
  };
}

export const S = {
  mode: 'title' as Mode,
  world: new World(1),
  me: newPlayer('Macaco', 0, 0),
  remotes: new Map<string, Remote>(),
  mine: null as Mine | null,
  mineFloor: 0,
  online: false,
  auth: true,
  started: false,
  particles: [] as Particle[],
  floaters: [] as Floater[],
  shake: 0,
  cam: { x: 7 * 16, y: 15 * 16 },
  time: 0,
  fish: null as FishState | null,
  flash: 0,
  musicOn: true,
  gotSnapshot: false,
  lastSave: 0,
  /** peers dormindo (para o host decidir) */
  toast: (_t: string, _tone?: 'banana' | 'chaos' | 'info') => {},
  hudTip: '',
};

export function myLook(): Look {
  return playerLook(S.me.fi, S.me.si);
}

// ---------------------------------------------------------------- Inventário

export function addItem(p: Player, id: string, n = 1): boolean {
  let left = n;
  for (const s of p.inv) {
    if (s && s.id === id && s.n < 99) {
      const add = Math.min(99 - s.n, left);
      s.n += add;
      left -= add;
      if (left <= 0) return true;
    }
  }
  for (let i = 0; i < p.inv.length && left > 0; i++) {
    if (!p.inv[i]) {
      const add = Math.min(99, left);
      p.inv[i] = { id, n: add };
      left -= add;
    }
  }
  return left <= 0;
}

export function countItem(p: Player, id: string): number {
  let c = 0;
  for (const s of p.inv) if (s && s.id === id) c += s.n;
  return c;
}

export function removeItems(p: Player, id: string, n: number): boolean {
  if (countItem(p, id) < n) return false;
  let left = n;
  for (let i = 0; i < p.inv.length && left > 0; i++) {
    const s = p.inv[i];
    if (s && s.id === id) {
      const t = Math.min(s.n, left);
      s.n -= t;
      left -= t;
      if (s.n <= 0) p.inv[i] = null;
    }
  }
  return true;
}

export function hotbarItem(p: Player, slot: number): { tool?: ToolId; stack?: ItemStack } {
  if (slot < 6) return { tool: (['hoe', 'can', 'axe', 'pick', 'rod', 'sickle'] as ToolId[])[slot] };
  const st = p.inv[slot - 6];
  return st ? { stack: st } : {};
}

export function hasRoom(p: Player, id: string, n: number): boolean {
  let left = n;
  for (const s of p.inv) {
    if (!s) left -= 99;
    else if (s.id === id) left -= 99 - s.n;
    if (left <= 0) return true;
  }
  return left <= 0;
}

export function spawnParticles(x: number, y: number, n: number, col: string, spread = 18, up = 30, size = 2): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * spread;
    S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - up * Math.random(), g: 80, life: 0.4 + Math.random() * 0.4, max: 0.8, col, size });
  }
}

export function floatText(x: number, y: number, text: string, col = '#fff'): void {
  S.floaters.push({ x, y, text, life: 1.4, col });
}

export const dirVec = (d: Dir): [number, number] => (d === 0 ? [0, 1] : d === 1 ? [-1, 0] : d === 2 ? [1, 0] : [0, -1]);

export const FLASH_NONE = 0;

export function facingTile(p: Player): [number, number] {
  const [dx, dy] = dirVec(p.dir);
  return [Math.floor((p.x + dx * 10) / 16), Math.floor((p.y - 4 + dy * 10) / 16)];
}
