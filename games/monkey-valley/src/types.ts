export type Dir = 0 | 1 | 2 | 3; // 0 baixo, 1 esquerda, 2 direita, 3 cima
export type Season = 0 | 1 | 2 | 3; // Primavera, Verão, Outono, Inverno
export type Weather = 'sol' | 'chuva' | 'tempestade' | 'neve';
export type MapId = 'world' | 'mine';
export type ToolId = 'hoe' | 'can' | 'axe' | 'pick' | 'rod' | 'sickle';
export type Mood = 'neutral' | 'happy' | 'mad' | 'surprised' | 'sleepy' | 'sad';

export interface ItemStack {
  id: string;
  n: number;
}

export type ObjKind = 'rock' | 'boulder' | 'tree' | 'weed' | 'stump' | 'twig';

export interface DynCrop {
  k: string;
  d: number;
}

export interface Dyn {
  t?: 1; // arado
  w?: 1; // regado
  c?: DynCrop;
  o?: ObjKind;
  hp?: number;
  v?: number; // variante visual
}

export interface Fx {
  k: 'dust' | 'water' | 'chip' | 'leaf' | 'sparkle' | 'coin' | 'heart';
  x: number; // tile
  y: number;
}

export interface OpResult {
  ok: boolean;
  msg?: string;
  grant?: ItemStack[];
  fx?: Fx[];
  n?: number;
  data?: Record<string, unknown>;
}

export interface Look {
  fur: string;
  muzzle: string;
  ear: string;
  shirt: string;
  pants: string;
  hat: 'palha' | 'nenhum' | 'marinheiro' | 'capacete' | 'cartola' | 'lenco' | 'laco' | 'bone';
  acc: 'nenhum' | 'oculos' | 'bigode' | 'barba' | 'avental' | 'faixa';
  accColor: string;
  hatColor?: string;
}

export interface AnimalState {
  id: string;
  kind: 'galinha' | 'cabra';
  name: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  ready: boolean;
  fed: boolean;
  dir: 1 | 2;
  hearts: number;
}

export interface FriendState {
  pts: number;
  talked: boolean;
  gifted: boolean;
  ev: number; // bits de eventos de coração já vistos
}

export interface PlayerSave {
  name: string;
  fi: number;
  si: number;
  inv: (ItemStack | null)[];
  tiers: Record<ToolId, number>;
  energy: number;
  maxEnergy: number;
  water: number;
  sel: number;
  x: number;
  y: number;
  mineMax: number;
}

export interface WorldSave {
  seed: number;
  day: number;
  season: Season;
  year: number;
  minutes: number;
  weather: Weather;
  money: number;
  totalEarned: number;
  ship: number;
  hay: number;
  dyn: [number, Dyn][];
  animals: AnimalState[];
  friends: Record<string, FriendState>;
  stats: Record<string, number>;
  quest: number;
}

export interface SaveData {
  v: 1;
  world: WorldSave;
  player: PlayerSave;
  savedAt: number;
}

export interface RemoteInfo {
  id: string;
  name: string;
  fi: number;
  si: number;
  x: number;
  y: number;
  d: Dir;
  mv: boolean;
  map: MapId;
  sw: number; // ferramenta em uso (índice+1) ou 0
  sleep: boolean;
}

export type NetMsg =
  | { k: 'pos'; p: RemoteInfo }
  | { k: 'hello'; id: string }
  | { k: 'snap'; to: string; w: WorldSave }
  | { k: 'req'; id: string; rid: number; op: string; a: unknown }
  | { k: 'res'; to: string; rid: number; r: OpResult }
  | { k: 'tile'; ch: [number, Dyn | null][] }
  | { k: 'clock'; day: number; season: Season; year: number; min: number; weather: Weather; money: number; ship: number; hay: number }
  | { k: 'animals'; a: AnimalState[] }
  | { k: 'newday'; w: WorldSave; passed: boolean; earned: number; dead: number; season: boolean }
  | { k: 'friends'; f: Record<string, FriendState> }
  | { k: 'fx'; kind: string; x: number; y: number; who: string }
  | { k: 'say'; who: string; text: string };
