export type TrackId = 'praca' | 'ladeira' | 'megarampa';
export type GameMode = 'free' | 'session90' | 'race' | 'local2p';
export type SkaterMode = 'skating' | 'manual' | 'air' | 'grinding' | 'ragdoll';
export type TrickKind = 'none' | 'kickflip' | 'bananagrab' | 'christair';

export interface Vec2 {
  x: number;
  y: number;
}

export interface TerrainPoint {
  x: number;
  y: number;
}

export interface StairVisual {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  steps: number;
}

export interface LaunchLip {
  x: number;
  tolerance: number;
  direction: 'left' | 'right' | 'any';
  minSpeed: number;
  vy: number;
  vxBoost?: number;
  vxOverride?: number;
  label?: string;
}

export interface GrindRail {
  id: string;
  points: Vec2[];
  label?: string;
  color?: string;
}

export type PropKind =
  | 'pole'
  | 'sign'
  | 'parked-car'
  | 'trash'
  | 'bench'
  | 'tires'
  | 'hotdog'
  | 'billboard';

export interface TrackProp {
  id: string;
  kind: PropKind;
  x: number;
  y: number; // ground y at x
  width: number;
  height: number;
  label?: string;
  color?: string;
  roofRail?: boolean; // Can grind top!
  solidInSkate?: boolean; // False = background scenery while skating (still solid in ragdoll!)
}

export interface BananaPad {
  id: string;
  x: number;
  y: number;
  cooldown: number; // local respawn timer
}

export interface MovingCar {
  id: string;
  x: number;
  y: number;
  vx: number;
  width: number;
  height: number;
  color: string;
  dir: 1 | -1;
  honkCooldown: number;
}

export interface ThrownBanana {
  id: string;
  ownerId: string;
  ownerName: string;
  x: number;
  y: number;
  ttl: number;
}

export interface TrackData {
  id: TrackId;
  name: string;
  shortName: string;
  width: number;
  loopMode: 'bounce' | 'downhill';
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  groundFill: string;
  groundTopColor: string;
  spawnX: number;
  terrain: TerrainPoint[];
  stairs: StairVisual[];
  launchLips: LaunchLip[];
  rails: GrindRail[];
  props: TrackProp[];
  turboBananas: BananaPad[];
  hasTraffic: boolean;
  finishX?: number;
}

export interface RagdollNode {
  name: string;
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  radius: number;
  hitCooldown: number;
}

export interface RagdollConstraint {
  a: number;
  b: number;
  length: number;
  stiffness: number;
}

export interface RagdollState {
  active: boolean;
  nodes: RagdollNode[];
  constraints: RagdollConstraint[];
  boardX: number;
  boardY: number;
  boardVx: number;
  boardVy: number;
  boardAngle: number;
  boardSpin: number;
  capX: number;
  capY: number;
  capVx: number;
  capVy: number;
  capAngle: number;
  capSpin: number;
  capLost: boolean;
  elapsed: number;
  settleTime: number;
  currentCrashScore: number;
  currentBonesBroken: number;
}

export interface FloatingCallout {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  kind: 'spark' | 'dust' | 'banana' | 'poop' | 'star' | 'bone';
  angle?: number;
  spin?: number;
}

export interface XrayFlash {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  part: 'skull' | 'ribs' | 'pelvis' | 'limb';
}

export interface SkaterSnapshot {
  trackId: TrackId;
  mode: SkaterMode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  facing: 1 | -1;
  crouching: boolean;
  activeTrick: TrickKind;
  trickTimer: number;
  boardFlip: number;
  trickScore: number;
  boneScore: number;
  bestCombo: number;
  bestCrash: number;
  matchId?: string;
  raceProgress?: number;
  raceFinishTime?: number | null;
  ragdollNodes?: [number, number][];
  boardPos?: [number, number, number];
}

export type NetMessage =
  | { kind: 'state'; snap: SkaterSnapshot }
  | { kind: 'banana'; id: string; x: number; y: number; trackId: TrackId }
  | { kind: 'banana_hit'; id: string }
  | { kind: 'callout'; text: string; tone: 'banana' | 'chaos' | 'info' }
  | {
      kind: 'match_start';
      matchId: string;
      trackId: TrackId;
      mode: 'session90' | 'race';
      countdownMs: number;
    }
  | {
      kind: 'race_finish';
      matchId: string;
      finishTime: number;
      totalScore: number;
    };

export interface RemotePlayerState {
  id: string;
  name: string;
  color: string;
  snap: SkaterSnapshot;
  renderX: number;
  renderY: number;
  renderAngle: number;
  lastSeen: number;
}

export interface TurnScoreResult {
  name: string;
  trickScore: number;
  boneScore: number;
  bonesBroken: number;
  bestCombo: number;
  total: number;
}
