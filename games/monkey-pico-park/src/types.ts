export const WORLD_W = 1280;
export const WORLD_H = 720;

export const MONKEY_W = 36;
export const MONKEY_H = 42;

export const GRAVITY = 1550;
export const JUMP_VY = -580;
export const MOVE_SPEED = 250;

export type GameMode = 'solo' | 'local2' | 'local3' | 'online';
export type GamePhase = 'menu' | 'playing' | 'level_clear' | 'victory';

export interface MonkeyPalette {
  name: string;
  body: string;
  belly: string;
  outline: string;
}

export const MONKEY_PALETTES: MonkeyPalette[] = [
  { name: 'Banana', body: '#facc15', belly: '#fef9c3', outline: '#854d0e' },
  { name: 'Cipó', body: '#4ade80', belly: '#dcfce7', outline: '#14532d' },
  { name: 'Pitaya', body: '#fb7185', belly: '#ffe4e6', outline: '#881337' },
  { name: 'Arara', body: '#38bdf8', belly: '#e0f2fe', outline: '#075985' },
  { name: 'Manga', body: '#fb923c', belly: '#ffedd5', outline: '#9a3412' },
  { name: 'Açaí', body: '#c084fc', belly: '#f3e8ff', outline: '#581c87' },
];

export const SHOUT_PHRASES = [
  'SOBE AQUI!',
  'EMPURRA!!',
  'SEGURA O BOTÃO!',
  'NÃO PULA!!',
  'SOCORRO!',
  'BANANA!! 🍌',
];

export interface MonkeyInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  shout: boolean;
}

export interface MonkeyState {
  id: number;
  playerId: string;
  name: string;
  paletteIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  facing: 1 | -1;
  grounded: boolean;
  coyoteTimer: number;
  jumpBuffer: number;
  standingOnMonkeyId: number | null;
  standingOnPlatformId: string | null;
  squishedTimer: number;
  enteredDoor: boolean;
  shoutText: string | null;
  shoutTimer: number;
  animTime: number;
  squashX: number;
  squashY: number;
}

export interface PlatformDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'solid' | 'bridge' | 'gate' | 'elevator';
  color?: string;
  linkId?: string;
  /** For elevator: target position when active */
  targetX?: number;
  targetY?: number;
  speed?: number;
}

export interface PlatformState extends PlatformDef {
  currentX: number;
  currentY: number;
  prevX: number;
  prevY: number;
  active: boolean;
  progress: number; // 0..1 for bridges/gates/elevators
}

export interface BoxDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  baseRequired: number;
}

export interface BoxState extends BoxDef {
  vx: number;
  vy: number;
  grounded: boolean;
  pushersLeft: number;
  pushersRight: number;
  effectiveRequired: number;
  standingOnPlatformId: string | null;
}

export interface ButtonDef {
  id: string;
  x: number;
  y: number; // surface y where button sits
  w: number;
  mode: 'hold' | 'timed' | 'toggle';
  duration?: number;
  color: string;
  linkId: string;
}

export interface ButtonState extends ButtonDef {
  pressed: boolean;
  active: boolean;
  timer: number;
  wasPressed: boolean;
}

export interface SeesawDef {
  id: string;
  pivotX: number;
  pivotY: number;
  length: number;
  thickness: number;
  maxAngle: number;
}

export interface SeesawState extends SeesawDef {
  angle: number;
  prevAngle: number;
  angularVel: number;
}

export interface SpikeZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FakeKeyDef {
  id: string;
  x: number;
  y: number;
}

export interface FakeKeyState extends FakeKeyDef {
  triggered: boolean;
}

export interface KeyState {
  originX: number;
  originY: number;
  x: number;
  y: number;
  carrierMonkeyId: number | null;
  used: boolean;
}

export interface DoorState {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  openProgress: number;
}

export interface LevelDef {
  index: number;
  title: string;
  subtitle: string;
  hint: string;
  tether: boolean;
  tetherLength?: number;
  spawns: Array<{ x: number; y: number }>;
  platforms: PlatformDef[];
  boxes: BoxDef[];
  buttons: ButtonDef[];
  seesaws: SeesawDef[];
  spikes: SpikeZone[];
  keyPos: { x: number; y: number };
  fakeKeys: FakeKeyDef[];
  doorPos: { x: number; y: number };
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  emoji?: string;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface WorldState {
  levelIndex: number;
  phase: GamePhase;
  mode: GameMode;
  monkeys: MonkeyState[];
  platforms: PlatformState[];
  boxes: BoxState[];
  buttons: ButtonState[];
  seesaws: SeesawState[];
  spikes: SpikeZone[];
  key: KeyState;
  fakeKeys: FakeKeyState[];
  door: DoorState;
  tether: boolean;
  tetherLength: number;
  deaths: number;
  levelTimer: number;
  totalTimer: number;
  totalScore: number;
  activeSoloIndex: number;
  followActive: boolean;
  resetFlashTimer: number;
  shakeTimer: number;
  shakeIntensity: number;
  particles: Particle[];
  floatingTexts: FloatingText[];
  completedLevels: number[];
}

export interface SnapshotMonkey {
  id: number;
  playerId: string;
  name: string;
  paletteIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  squishedTimer: number;
  enteredDoor: boolean;
  shoutText: string | null;
  shoutTimer: number;
}

export interface SnapshotPayload {
  tick: number;
  levelIndex: number;
  phase: GamePhase;
  deaths: number;
  levelTimer: number;
  totalTimer: number;
  totalScore: number;
  monkeys: SnapshotMonkey[];
  platforms: Array<{ id: string; cx: number; cy: number; active: boolean; progress: number }>;
  boxes: Array<{ id: string; x: number; y: number; pl: number; pr: number; req: number }>;
  buttons: Array<{ id: string; pressed: boolean; active: boolean; timer: number }>;
  seesaws: Array<{ id: string; angle: number }>;
  key: { x: number; y: number; carrier: number | null; used: boolean };
  fakeKeys: boolean[];
  doorOpen: boolean;
  doorProgress: number;
}

export type NetMessage =
  | { kind: 'input'; monkeyId: number; input: MonkeyInput }
  | { kind: 'snapshot'; snap: SnapshotPayload }
  | { kind: 'event'; name: 'level_start' | 'level_clear' | 'die' | 'key_grab' | 'fake_key' | 'door_open' | 'shout'; detail?: string; levelIndex?: number; x?: number; y?: number }
  | { kind: 'cmd'; action: 'start_level' | 'next_level' | 'restart'; levelIndex?: number };
