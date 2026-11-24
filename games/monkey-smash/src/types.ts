// Tipos e constantes compartilhados entre simulação, IA, rede e render.

export const FPS = 60;
export const STEP_MS = 1000 / FPS;
export const MAX_PLAYERS = 4;

/** Bits de input (um número por fighter por tick). */
export const B = {
  L: 1,
  R: 2,
  U: 4,
  D: 8,
  JUMP: 16,
  LIGHT: 32,
  HEAVY: 64,
  SPECIAL: 128,
  SHIELD: 256,
  GRAB: 512,
} as const;

/** Estados do lutador. */
export const St = {
  IDLE: 0,
  RUN: 1,
  JSQ: 2, // jumpsquat
  AIR: 3,
  LAND: 4,
  ATTACK: 5,
  HITSTUN: 6,
  SHIELD: 7,
  DODGE: 8,
  HOLD: 9, // segurando alguém
  HELD: 10, // sendo segurado
  LEDGE: 11,
  PLAT: 12, // plataforma de respawn
  DEAD: 13,
} as const;

/** Tipos de controle. */
export const Ctrl = { LOCAL: 0, BOT: 1, REMOTE: 2 } as const;

/** Tipos de item. */
export const ItemKind = { BOMB: 0, HAMMER: 1, HEAL: 2 } as const;

/** Tipos de projétil. */
export const PK = {
  BERIMBAU: 0,
  SHAKE: 1,
  BITS: 2,
  YARN: 3,
  SANDAL: 4,
  NOTE: 5,
  BOMB: 6,
  SHOCK: 7,
} as const;

/** Tipos de evento enviados pelo sim -> render/fx/sfx. Formato: [tipo, tick, ...args] */
export const EV = {
  HIT: 0, // x,y,speed,angleDeg(dirx),vslot,aslot,dmg,fxKind
  SHIELD: 1, // x,y,vslot
  SHBREAK: 2, // x,y,vslot
  KO: 3, // x,y,slot,dirx,diry
  RESPAWN: 4, // x,y,slot
  PICKUP: 5, // x,y,slot,kind
  ITEMSPAWN: 6, // x,y,kind
  EXPLODE: 7, // x,y,r
  BOUNCE: 8, // x,y,slot
  TECH: 9, // x,y,slot
  GRAB: 10, // x,y,slot
  THROW: 11, // x,y,slot
  GEYSER: 12, // x (aviso)
  CANNON: 13, // x,y,dir (disparo)
  PAD: 14, // x,y
  COUNTER: 15, // x,y,slot
  WALL: 16, // x,y,slot
  REFLECT: 17, // x,y
  HEAL: 18, // x,y,slot
  BREAK: 19, // x,y,slot (item quebrou)
  GO: 20, // início
  END: 21, // winner
  LEDGE: 22, // x,y,slot
  SPAWNSHOT: 23, // x,y,kind (projétil)
  TICK: 24, // contagem regressiva: n
  TELE: 25, // x0,y0,x1,y1
  PUMMEL: 26, // x,y,slot
} as const;

export type Ev = number[];

export interface Rules {
  mode: 0 | 1; // 0 estoque, 1 tempo
  stocks: number;
  minutes: number;
  items: 0 | 1 | 2;
}

export const DEFAULT_RULES: Rules = { mode: 0, stocks: 3, minutes: 3, items: 1 };

export interface PlayerSlotConfig {
  char: number; // índice do lutador
  ctrl: number; // Ctrl.*
  name: string;
  level: number; // dificuldade do bot 0..2
  peerId?: string;
}

export interface MatchConfig {
  slots: PlayerSlotConfig[];
  stage: number;
  rules: Rules;
  seed: number;
}

export interface Fighter {
  slot: number;
  char: number;
  ctrl: number;
  name: string;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  ground: number;
  plat: number;
  state: number;
  st: number;
  pct: number;
  stocks: number;
  kos: number;
  falls: number;
  dealt: number;
  hitstop: number;
  stun: number;
  inv: number;
  jumps: number;
  move: number;
  hitMask: number;
  shield: number;
  heldBy: number;
  holding: number;
  hold: number;
  itemKind: number; // -1 nada
  itemUse: number;
  drop: number;
  fast: number;
  air: number; // usou air dodge
  help: number; // desamparado (up special)
  resp: number;
  dead: number; // 0 vivo, 1 aguardando respawn, 2 eliminado
  prev: number;
  buf: number;
  bufT: number;
  lastHit: number;
  lastHitT: number;
  lag: number;
  ledge: number; // índice de plataforma + lado codificado; -1
  ledgeCd: number;
  ledgeT: number;
  dodgeDir: number;
  tech: number; // frames desde apertar shield (para tech)
  hazCd: number;
  sdir: number; // direção de roll
  chg: number;
}

/** Campos numéricos do Fighter sincronizados pela rede (ordem fixa). */
export const FKEYS: (keyof Fighter)[] = [
  'x', 'y', 'vx', 'vy', 'face', 'ground', 'plat', 'state', 'st', 'pct', 'stocks', 'kos', 'falls', 'dealt',
  'hitstop', 'stun', 'inv', 'jumps', 'move', 'hitMask', 'shield', 'heldBy', 'holding', 'hold', 'itemKind',
  'itemUse', 'drop', 'fast', 'air', 'help', 'resp', 'dead', 'prev', 'buf', 'bufT', 'lastHit', 'lastHitT',
  'lag', 'ledge', 'ledgeCd', 'ledgeT', 'dodgeDir', 'tech', 'hazCd', 'sdir', 'chg',
];

export interface Item {
  id: number;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: number; // slot ou -1
  t: number; // vida / fuse
  ground: number;
  armed: number;
}

export interface Proj {
  id: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  t: number;
  hit: number; // bitmask de vítimas
  n: number; // extra (rebatida etc.)
}

export interface PlatPos {
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  vx: number;
  vy: number;
  pad: boolean;
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** RNG determinístico (mulberry32) — estado guardado num número. */
export function rngNext(state: { s: number }): number {
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
