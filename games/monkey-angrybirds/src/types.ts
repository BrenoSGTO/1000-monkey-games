export type MonkeyKind = 'normal' | 'triple' | 'bomb' | 'tank' | 'boomerang';

export type MaterialKind = 'glass' | 'wood' | 'stone' | 'tnt';

export type EnemyKind = 'porco' | 'tatu' | 'boss_porco';

export type MultiplayerMode = 'coop-turns' | 'duel-score';

export interface MonkeySpec {
  kind: MonkeyKind;
  name: string;
  shortName: string;
  powerLabel: string;
  description: string;
  radius: number;
  density: number;
  restitution: number;
  primaryColor: string;
  accentColor: string;
  battleCry: string;
}

export interface MaterialSpec {
  kind: MaterialKind;
  label: string;
  hp: number;
  density: number;
  friction: number;
  restitution: number;
  impulseThreshold: number;
  scoreValue: number;
}

export interface LevelBlockDef {
  material: MaterialKind;
  x: number;
  y: number;
  w: number;
  h: number;
  angle?: number;
}

export interface LevelEnemyDef {
  kind: EnemyKind;
  x: number;
  y: number;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  theme: 'jungle' | 'faria-lima' | 'volcano';
  monkeys: MonkeyKind[];
  blocks: LevelBlockDef[];
  enemies: LevelEnemyDef[];
  starThresholds: [number, number, number];
  isInfinite?: boolean;
  seed?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vRot: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'rect' | 'circle' | 'shard' | 'smoke' | 'banana';
  gravityScale: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface SnapshotBlock {
  id: number;
  material: MaterialKind;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  vx: number;
  vy: number;
  angularVelocity: number;
  hp: number;
  maxHp: number;
}

export interface SnapshotEnemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
}

export interface WorldSnapshot {
  blocks: SnapshotBlock[];
  enemies: SnapshotEnemy[];
  score: number;
  monkeyIndex: number;
  turnOwnerId: string | null;
  playerScores: Record<string, number>;
}

export type NetMessage =
  | {
      kind: 'session-config';
      mode: MultiplayerMode;
      levelIndex: number;
      infiniteWave: number;
      seed: number;
      turnOwnerId: string;
    }
  | {
      kind: 'aim';
      pullX: number;
      pullY: number;
      active: boolean;
    }
  | {
      kind: 'launch';
      monkeyIndex: number;
      vx: number;
      vy: number;
      pullX: number;
      pullY: number;
      shooterId: string;
    }
  | {
      kind: 'power';
      monkeyId: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
    }
  | {
      kind: 'turn-sync';
      snapshot: WorldSnapshot;
    }
  | {
      kind: 'duel-progress';
      playerId: string;
      playerName: string;
      score: number;
      shotsUsed: number;
      enemiesLeft: number;
      status: 'playing' | 'won' | 'lost';
      stars: number;
    }
  | {
      kind: 'taunt';
      text: string;
    };
