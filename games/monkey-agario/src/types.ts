export type SkinId =
  | 'classico'
  | 'pix'
  | 'tio-zap'
  | 'rei'
  | 'cyber'
  | 'morango'
  | 'ninja'
  | 'ouro';

export type GameMode = 'ffa' | 'teams';
export type TeamId = 0 | 1 | 2; // 0 = FFA, 1 = Time Banana, 2 = Time Coco

export interface SkinDef {
  id: SkinId;
  name: string;
  emoji: string;
  furLight: string;
  furMid: string;
  furDark: string;
  face: string;
  earInner: string;
  outline: string;
}

export interface MonkeyCell {
  id: number;
  ownerId: string;
  name: string;
  skin: SkinId;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  mergeTimer: number;
  isBot: boolean;
  lookAngle: number;
  mouthOpen: number;
  scared: number;
  wobblePhase: number;
  wobbleAmp: number;
}

export type FoodKind = 'banana' | 'cacho' | 'ejected';

export interface FoodPellet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  kind: FoodKind;
  rot: number;
  ownerId?: string;
  age: number;
}

export interface CactusVirus {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  hits: number;
  pulse: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface LeaderboardEntry {
  ownerId: string;
  name: string;
  mass: number;
  team: TeamId;
  isBot: boolean;
  skin: SkinId;
}

export interface PlayerStats {
  ownerId: string;
  name: string;
  skin: SkinId;
  team: TeamId;
  isBot: boolean;
  alive: boolean;
  peakMass: number;
  kills: number;
  aliveTime: number;
  lastKiller?: string;
  respawnCooldown: number;
}

export interface PlayerInput {
  dirX: number;
  dirY: number;
  split: boolean;
  eject: boolean;
  name: string;
  skin: SkinId;
  preferredTeam: TeamId;
  wantSpawn: boolean;
}

export interface GameEvent {
  kind: 'eat_cell' | 'cactus_pop' | 'split' | 'toast' | 'death';
  x: number;
  y: number;
  actorId?: string;
  targetId?: string;
  actorName?: string;
  targetName?: string;
  color?: string;
  text?: string;
  mass?: number;
}

export interface CompactCell {
  id: number;
  o: string; // ownerId
  n: string; // name
  s: SkinId;
  t: TeamId;
  x: number;
  y: number;
  m: number;
  b: boolean; // isBot
  a: number; // lookAngle
  mo: number; // mouthOpen
  sc: number; // scared
}

export interface CompactCactus {
  id: number;
  x: number;
  y: number;
  m: number;
}

export interface SnapshotPayload {
  tick: number;
  mode: GameMode;
  arenaSize: number;
  cells: CompactCell[];
  cacti: CompactCactus[];
  /** Flat array [id, x, y, kindInt(0=banana,1=cacho,2=ejected)] */
  food?: number[];
  /** Ejected pellets sent every tick for smooth projectiles */
  ejected: number[];
  leaderboard: LeaderboardEntry[];
  teamMass: [number, number];
  deaths: Array<{ ownerId: string; killer: string; peakMass: number; kills: number; aliveTime: number }>;
  events: GameEvent[];
}

export type NetMessage =
  | { kind: 'input'; input: PlayerInput }
  | { kind: 'snapshot'; snap: SnapshotPayload }
  | { kind: 'mode'; mode: GameMode };
