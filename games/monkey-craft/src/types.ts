export const SLUG = 'monkey-craft';
export const W = 384;
export const H = 160;
export const SURF = 50;
export const SEA = 55;
export const CH = 16;
export const MAX_STACK = 99;
export const DAY_LEN = 420;
export const REACH = 5.5;
export const SAVE_KEY = 'monkey-craft:save:v1';

export const B = {
  AIR: 0,
  DIRT: 1,
  GRASS: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  COPPER: 7,
  GOLD: 8,
  BANANITE: 9,
  BEDROCK: 10,
  WATER: 11,
  PLANKS: 12,
  BENCH: 13,
  FURNACE: 14,
  TORCH: 15,
  GLASS: 16,
  COAL: 17,
  SANDSTONE: 18,
  CACTUS: 19,
  LADDER: 20,
  BRICK: 21,
  BANANA_BLOCK: 22,
  TALLGRASS: 23,
  FLOWER: 24,
  BUNCH: 25,
} as const;
export const BLOCK_COUNT = 26;

export const I = {
  STICK: 100,
  COPPER_BAR: 101,
  GOLD_BAR: 102,
  BANANITE_BAR: 103,
  BANANA: 104,
  BANANA_FRY: 105,
  PICK_WOOD: 110,
  PICK_STONE: 111,
  PICK_COPPER: 112,
  PICK_GOLD: 113,
  PICK_BANANITE: 114,
  SWORD_WOOD: 120,
  SWORD_STONE: 121,
  SWORD_COPPER: 122,
  SWORD_GOLD: 123,
  SWORD_BANANITE: 124,
} as const;

export interface Slot {
  id: number;
  n: number;
}

export interface Body {
  x: number; // centro horizontal (tiles)
  y: number; // pés (tiles)
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  inWater: boolean;
  onLadder: boolean;
  stepSmooth: number;
  step: boolean;
}

export type MobKind = 0 | 1; // 0 = Capivara Zumbi, 1 = Pombo Explosivo

export interface Mob extends Body {
  id: number;
  kind: MobKind;
  hp: number;
  maxHp: number;
  face: 1 | -1;
  t: number;
  hurtT: number;
  atkCd: number;
  fuse: number;
  state: number;
  wander: number;
  wanderT: number;
  // alvo de rede (guest)
  tx: number;
  ty: number;
  seen: number;
}

// -------------------- Rede --------------------
export interface NetPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: number;
  ac: number; // bits: 1 agindo, 2 comendo, 4 KO, 8 nadando, 16 escalando
  ax: number;
  ay: number;
  h: number;
  hp: number;
  col: string;
}

export type NetMsg =
  | { k: 'hi'; name: string }
  | { k: 'ws'; to: string; seed: number; time: number; n: number }
  | { k: 'we'; to: string; e: number[]; last: boolean }
  | { k: 'd'; e: number[] }
  | { k: 'rq'; i: number; id: number; prev: number }
  | { k: 'p'; s: NetPlayer }
  | { k: 'm'; t: number; m: number[][] }
  | { k: 'hit'; mob: number; dmg: number; kx: number; by: string }
  | { k: 'give'; to: string; item: number; n: number }
  | { k: 'hurt'; to: string; dmg: number; kx: number; ky: number; why: string }
  | { k: 'boom'; x: number; y: number }
  | { k: 'em'; text: string };
