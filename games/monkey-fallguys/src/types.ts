export type RoundKind = 'race' | 'hex' | 'seesaw' | 'tail' | 'soccer' | 'crown';
export const ROUND_KINDS: RoundKind[] = ['race', 'hex', 'seesaw', 'tail', 'soccer', 'crown'];

export type Phase = 'intro' | 'count' | 'play' | 'end' | 'results' | 'champion';
export const PHASES: Phase[] = ['intro', 'count', 'play', 'end', 'results', 'champion'];

export type MatchMode = 'solo' | 'local2p' | 'host' | 'client';

export interface Skin {
  fur: number;
  suit: number;
  hat: number;
  acc: number;
}

export interface Input {
  mx: number;
  jump: boolean;
  dive: boolean;
  grab: boolean;
}

export const emptyInput = (): Input => ({ mx: 0, jump: false, dive: false, grab: false });

export type Status = 'alive' | 'qual' | 'out';

export interface BotAI {
  tx: number;
  ty: number;
  wait: number;
  think: number;
  mode: number;
  lane: number;
  seed: number;
  jumpCd: number;
  panic: number;
}

export interface Monkey {
  id: number;
  name: string;
  /** '' = bot, 'L0'/'L1' = local slots, otherwise PeerJS id */
  owner: string;
  isBot: boolean;
  skill: number;
  skin: Skin;
  team: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  grounded: boolean;
  ground: number;
  coyote: number;
  jumpBuf: number;

  diveT: number;
  diveCd: number;
  flopT: number;
  flopK: number; // 0 = prone slide, 1 = tumble
  grabT: number;
  grabCd: number;
  heldBy: number;
  heldT: number;
  holding: number;
  invT: number;
  respawnT: number;

  status: Status;
  done: boolean;
  gone: boolean;
  outRound: number;
  outAt: number;
  place: number;

  // round specific
  prog: number;
  cpx: number;
  cpy: number;
  tail: boolean;
  tailImm: number;
  score: number;
  crown: boolean;

  input: Input;
  ai: BotAI;
}

export type PlatKind = 'solid' | 'oneway' | 'tile' | 'door' | 'bounce';

export interface Plat {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PlatKind;
  active: boolean;
  t1: number; // tile countdown / door open timer (-1 = idle)
  fake: boolean;
  wob: number;
  col: number;
  layer: number;
  dx: number;
  mv: { cx: number; cy: number; ax: number; ay: number; per: number; ph: number } | null;
}

export type HazardKind = 'hammer' | 'spinner' | 'roller';

export interface Hazard {
  kind: HazardKind;
  x: number; // pivot / center / roller right end
  y: number;
  len: number; // hammer length | spinner half length | roller travel length
  amp: number;
  per: number;
  ph: number;
  r: number;
}

export interface Shape {
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  vx: number;
  vy: number;
}

export interface Coco {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
}

export interface Crown {
  x: number;
  y: number;
  vx: number;
  vy: number;
  holder: number;
  cd: number;
  lastHolder: number;
}

export interface Plank {
  px: number;
  py: number;
  len: number;
  ang: number;
  omega: number;
}

export interface Gate {
  x: number;
  floors: number[];
  doorIds: number[];
}

export interface World {
  kind: RoundKind;
  variant: number;
  seed: number;
  n: number;
  t: number;
  plats: Plat[];
  hazards: Hazard[];
  gates: Gate[];
  killY: number;
  bounds: { x0: number; x1: number; y0: number; y1: number };
  finishX: number;
  startX: number;
  checkpoints: number[];
  limit: number;
  timeLeft: number;
  theme: number;
  plank: Plank | null;
  cocos: Coco[];
  ball: Ball | null;
  crown: Crown | null;
  score: [number, number];
  /** generic scratch timers: 0 = spawn timer / goal celebration, 1 = sudden death */
  tm: number[];
  golden: boolean;
  cocoSeq: number;
  winTeam: number;
  tailTarget: number;
  nextPlat: number;
}

export interface Ev {
  k: string;
  x?: number;
  y?: number;
  s?: string;
  n?: number;
  id?: number;
  c?: string;
}

export type Emit = (ev: Ev) => void;

export interface NetMsg {
  t: 'in' | 'snap' | 'lobby' | 'ping';
  d?: unknown;
}

export const RUN = 340;
export const JUMP = 800;
export const GRAV = 2300;
export const HW = 14;
export const BH = 44;
export const GY = 560;
