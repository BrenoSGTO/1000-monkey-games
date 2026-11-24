// Tipos compartilhados do Rocket Macaco League.

export type CarId = 'fusca' | 'kombi' | 'brasilia' | 'uno';
export type ThemeId = 'selva' | 'praia' | 'lua';
export type Format = '1v1' | '2v2';
export type BotLevel = 0 | 1 | 2;
export type MatchKind = 'solo' | 'local-versus' | 'local-coop' | 'online' | 'demo';

/** 0 countdown, 1 play, 2 goal, 3 replay, 4 end */
export type Phase = 0 | 1 | 2 | 3 | 4;
export const PH_COUNTDOWN: Phase = 0;
export const PH_PLAY: Phase = 1;
export const PH_GOAL: Phase = 2;
export const PH_REPLAY: Phase = 3;
export const PH_END: Phase = 4;

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  boost: boolean;
  jumpHeld: boolean;
  /** contador de apertos de pulo (para nao perder toques entre pacotes de rede) */
  jumpCount: number;
}

export function emptyInput(): InputState {
  return { left: false, right: false, up: false, down: false, boost: false, jumpHeld: false, jumpCount: 0 };
}

export interface CarSpec {
  id: CarId;
  name: string;
  tagline: string;
  length: number;
  cabinL: number;
  cabinOff: number;
  density: number;
  accel: number;
  boostAccel: number;
  topSpeed: number;
  boostTop: number;
  jumpV: number;
  turn: number;
}

export interface ThemeSpec {
  id: ThemeId;
  name: string;
  sub: string;
  gravityScale: number;
  skyTop: string;
  skyBottom: string;
  wallTop: string;
  wallBottom: string;
  floor: string;
  floorStripe: string;
  floorEdge: string;
  line: string;
  ads: string[];
  crowdTint: string;
}

export interface SlotConfig {
  slot: number;
  team: 0 | 1;
  car: CarId;
  fur: number;
  name: string;
  /** id do jogador no PeerRoom (online) */
  playerId: string | null;
  /** 'p1' / 'p2' = teclado local; null = bot ou remoto */
  local: 'p1' | 'p2' | null;
  bot: boolean;
}

export interface MatchConfig {
  matchId?: number;
  kind: MatchKind;
  format: Format;
  theme: ThemeId;
  matchTime: number;
  botLevel: BotLevel;
  slots: SlotConfig[];
}

export interface RenderCar {
  slot: number;
  team: 0 | 1;
  car: CarId;
  fur: number;
  name: string;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  boost: number;
  facing: 1 | -1;
  grounded: boolean;
  boosting: boolean;
  flipT: number;
  bot: boolean;
}

export interface RenderBall {
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
}

export interface GoalInfo {
  team: 0 | 1;
  slot: number;
  own: boolean;
  text: string;
}

export interface RenderState {
  cars: RenderCar[];
  ball: RenderBall;
  pads: boolean[];
  scoreA: number;
  scoreB: number;
  timeLeft: number;
  overtime: boolean;
  phase: Phase;
  phaseT: number;
  goal: GoalInfo | null;
}

export type SimEvent =
  | { k: 'hit'; x: number; y: number; s: number; slot: number }
  | { k: 'bounce'; x: number; y: number; s: number }
  | { k: 'jump'; x: number; y: number; slot: number }
  | { k: 'flip'; x: number; y: number; slot: number }
  | { k: 'pad'; x: number; y: number; big: boolean; slot: number }
  | { k: 'goal'; x: number; y: number; team: 0 | 1; slot: number; own: boolean; text: string }
  | { k: 'whistle'; end: boolean }
  | { k: 'kickoff' };

// ---------- Rede ----------

export interface SnapMsg {
  t: number;
  ph: Phase;
  pt: number;
  sa: number;
  sb: number;
  tl: number;
  ot: 0 | 1;
  /** bola: x,y,a,vx,vy */
  b: number[];
  /** carros: x,y,a,vx,vy,boost,flags,flipT */
  c: number[][];
  /** mascara de pads ativos */
  p: number;
  g: GoalInfo | null;
}

export type NetMessage =
  | { kind: 'start'; cfg: MatchConfig }
  | { kind: 'in'; slot: number; m: number; j: number }
  | { kind: 'snap'; s: SnapMsg }
  | { kind: 'ev'; e: SimEvent[] }
  | { kind: 'menu' };
