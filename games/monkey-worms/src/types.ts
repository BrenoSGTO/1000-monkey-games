export const SLUG = 'monkey-worms';
export const WORLD_W = 2600;
export const WORLD_H = 1100;
export const WATER_START = 1000;
export const WORM_R = 9;
export const GRAV = 800;
export const MAX_HP = 100;
export const TURN_TIME = 45;
export const RETREAT_TIME = 4;
export const SUDDEN_DEATH_ROUND = 7;

export type WeaponId =
  | 'bazooka'
  | 'grenade'
  | 'sheep'
  | 'slipper'
  | 'pigeons'
  | 'rope'
  | 'torch'
  | 'kamikaze'
  | 'mine'
  | 'holy'
  | 'slap';

export const WEAPON_ORDER: WeaponId[] = [
  'bazooka',
  'grenade',
  'sheep',
  'slipper',
  'pigeons',
  'rope',
  'torch',
  'kamikaze',
  'mine',
  'holy',
  'slap',
];

export type Ctrl = 'local' | 'bot' | 'remote';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameMode = 'solo' | 'hotseat' | 'online';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface TeamStyle {
  name: string;
  color: string;
  dark: string;
  light: string;
}

export const TEAM_STYLES: TeamStyle[] = [
  { name: 'Bananas Atômicas', color: '#ef4444', dark: '#991b1b', light: '#fca5a5' },
  { name: 'Macacada Azul', color: '#3b82f6', dark: '#1e3a8a', light: '#93c5fd' },
  { name: 'Cipó Fatal', color: '#22c55e', dark: '#166534', light: '#86efac' },
  { name: 'Sagui Squad', color: '#f59e0b', dark: '#92400e', light: '#fcd34d' },
];

export interface Team {
  id: number;
  name: string;
  color: string;
  dark: string;
  light: string;
  pid: string | null;
  ctrl: Ctrl;
  owner: string;
  ammo: Record<WeaponId, number>;
  cursor: number;
  dmgDealt: number;
  kills: number;
}

export type WormState = 'alive' | 'tomb' | 'gone';

export interface Worm extends Body {
  id: number;
  team: number;
  name: string;
  hp: number;
  shownHp: number;
  facing: 1 | -1;
  aim: number;
  state: WormState;
  launched: boolean;
  walkT: number;
  walkAmt: number;
  blinkT: number;
  hurtT: number;
  throwT: number;
  spin: number;
  panic: number;
  speech: string;
  speechT: number;
  rope: { ax: number; ay: number; len: number } | null;
  kami: { dx: number; dy: number; t: number } | null;
  torch: { dx: number; dy: number; t: number; dist: number; dmgT: number } | null;
  lastHit: number;
  holding: WeaponId | null;
  victory: boolean;
  net: { x: number; y: number; vx: number; vy: number; t: number } | null;
  tombT: number;
}

export type ProjKind = 'rocket' | 'grenade' | 'holy' | 'sheep' | 'slipper' | 'pigeon' | 'poop';

export interface Proj extends Body {
  id: number;
  kind: ProjKind;
  team: number;
  owner: number;
  t: number;
  fuse: number;
  angle: number;
  spin: number;
  resting: boolean;
  tx: number;
  ty: number;
  hasTarget: boolean;
  dir: number;
  hopT: number;
  dropX: number;
  dropped: boolean;
  detonate: boolean;
  bounces: number;
  dead: boolean;
}

export interface Mine extends Body {
  armT: number;
  trigger: number;
  team: number;
  blink: number;
  dead: boolean;
}

export interface Crate extends Body {
  kind: 'hp' | 'ammo';
  weapon: WeaponId;
  landed: boolean;
  t: number;
  dead: boolean;
}

export interface CrateSpawn {
  x: number;
  kind: 'hp' | 'ammo';
  weapon: WeaponId;
}

export interface WormInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export type SimEvent =
  | { t: 'explosion'; x: number; y: number; r: number; kind: string }
  | { t: 'damage'; w: Worm; amount: number; fall: boolean }
  | { t: 'die'; w: Worm; cause: 'blast' | 'drown' | 'out' | 'kami' | 'fall' }
  | { t: 'splash'; x: number; y: number; size: number }
  | { t: 'bounce'; x: number; y: number }
  | { t: 'debris'; x: number; y: number; r: number }
  | { t: 'trail'; x: number; y: number; kind: 'smoke' | 'fire' | 'spark' | 'feather' | 'holy' }
  | { t: 'sound'; name: string; x: number; y: number }
  | { t: 'pickup'; w: Worm; text: string }
  | { t: 'speak'; w: Worm; kind: string }
  | { t: 'slap'; x: number; y: number }
  | { t: 'fuse'; x: number; y: number };

export interface Snapshot {
  w: number[][];
  m: number[][];
  c: number[][];
  water: number;
  ammo: number[][];
  cr: number[];
  sc: number;
  st: number[][];
}

export interface FireParams {
  dx: number;
  dy: number;
  power: number;
  fuse: number;
  tx: number;
  ty: number;
  seed: number;
}

export type NetMsg =
  | { k: 'start'; seed: number; perTeam: number; teams: { pid: string; name: string }[] }
  | {
      k: 'turn';
      n: number;
      team: number;
      worm: number;
      wind: number;
      round: number;
      crate: CrateSpawn | null;
      snap: Snapshot | null;
    }
  | {
      k: 'pose';
      n: number;
      w: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      f: 1 | -1;
      a: number;
      ctl: 0 | 1;
      rope: [number, number, number] | null;
      wp: WeaponId;
    }
  | { k: 'sel'; n: number; wp: WeaponId; fuse: number; tx: number; ty: number; hasT: boolean }
  | ({ k: 'fire'; n: number; wp: WeaponId } & FireParams)
  | { k: 'det'; n: number }
  | { k: 'skip'; n: number }
  | { k: 'over'; winner: number; snap: Snapshot | null }
  | { k: 'rematch' }
  | { k: 'quit' };
