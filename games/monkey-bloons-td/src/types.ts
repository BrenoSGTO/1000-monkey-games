export type MapId = 'selva' | 'feira' | 'ilha';

export type TowerType =
  | 'banana'
  | 'havaianas'
  | 'sniper'
  | 'coco'
  | 'dj'
  | 'fazenda'
  | 'mago';

export type GameMode = 'coop' | 'versus' | 'local2p';

export type TargetMode = 'first' | 'strong' | 'close' | 'last';

export type BloonType =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'pink'
  | 'camo'
  | 'lead'
  | 'moab'
  | 'zepelim';

export type AttackTierId = 'rush' | 'camo' | 'lead' | 'moab';

export interface Point {
  x: number;
  y: number;
}

export interface MapProp {
  kind: 'tree' | 'cone' | 'sign' | 'stall' | 'crate' | 'puddle' | 'palm' | 'bridge';
  x: number;
  y: number;
  scale?: number;
  color?: string;
  label?: string;
}

export interface MapConfig {
  id: MapId;
  name: string;
  subtitle: string;
  themeBg: string;
  themeGrassAlt: string;
  roadOuter: string;
  roadInner: string;
  roadStripe: string;
  waypoints: Point[];
  lanes?: Point[][];
  props: MapProp[];
}

export interface TowerUpgradeDef {
  name: string;
  cost: number;
  description: string;
  quip: string;
}

export interface TowerDef {
  type: TowerType;
  name: string;
  shortName: string;
  emoji: string;
  hotkey: string;
  cost: number;
  range: number;
  fireRate: number; // shots per second (or pulse/farm rate)
  damage: number;
  color: string;
  description: string;
  detectsCamo: boolean;
  popsLead: boolean;
  isSupport?: boolean;
  upgrades: [TowerUpgradeDef, TowerUpgradeDef, TowerUpgradeDef];
}

export interface TowerInstance {
  id: string;
  type: TowerType;
  x: number;
  y: number;
  level: number; // 0..3
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  angle: number;
  cooldown: number;
  recoil: number; // 0..1 animation
  targetMode: TargetMode;
  totalSpent: number;
  pops: number;
  buffedMultiplier: number; // >= 1 from DJ JBL
  buffedRangeMultiplier: number; // >= 1 from DJ JBL
  lastTalkAt: number;
  farmEarned?: number;
}

export interface BloonDef {
  type: BloonType;
  name: string;
  emoji: string;
  hp: number;
  speed: number;
  radius: number;
  color: string;
  outline: string;
  reward: number;
  livesDamage: number;
  children: BloonType[];
  isCamo?: boolean;
  isLead?: boolean;
  isBoss?: boolean;
}

export interface BloonInstance {
  id: string;
  type: BloonType;
  hp: number;
  maxHp: number;
  laneIndex: number;
  distance: number; // distance along lane in px
  angle: number; // heading angle along lane in radians
  x: number;
  y: number;
  slowTimer: number;
  slowFactor: number; // e.g. 0.45 means 45% speed
  camoStripped: boolean;
  hitFlash: number;
  wobbleSeed: number;
  poisonCarry: number;
  isTroll?: boolean;
}

export interface Projectile {
  id: string;
  kind: 'banana' | 'fire_banana' | 'chinelo' | 'coco';
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetId: string | null;
  speed: number;
  damage: number;
  pierceLeft: number;
  hitIds: string[];
  homing: boolean;
  ricochetsLeft: number;
  detectsCamo: boolean;
  popsLead: boolean;
  pushBack: number;
  slowDuration: number;
  slowFactor: number;
  splashRadius: number;
  poisonDuration: number;
  poisonDps: number;
  critChance: number;
  ownerTowerId: string;
  rotation: number;
  ttl: number;
  targetX?: number;
  targetY?: number;
}

export interface PoisonCloud {
  id: string;
  x: number;
  y: number;
  radius: number;
  dps: number;
  slowFactor: number;
  ttl: number;
  maxTtl: number;
  tickTimer: number;
  ownerTowerId: string;
}

export interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

export interface SniperTracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isMiss: boolean;
  isCrit: boolean;
  ttl: number;
}

export interface LightningArc {
  points: Point[];
  color: string;
  ttl: number;
  maxTtl: number;
}

export interface AbilityBomb {
  x: number;
  y: number;
  targetY: number;
  vy: number;
  radius: number;
  damage: number;
  ownerId: string;
}

export interface MapPing {
  id: string;
  x: number;
  y: number;
  name: string;
  color: string;
  ttl: number;
  maxTtl: number;
}

export interface RemoteCursor {
  playerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  placingType: TowerType | null;
  lastSeen: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ttl: number;
  maxTtl: number;
  gravity?: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  ttl: number;
  maxTtl: number;
}

export interface PlayerMatchStats {
  playerId: string;
  name: string;
  color: string;
  pops: number;
  bananasGifted: number;
  incomeBonus: number;
  lives: number;
  score: number;
  wave: number;
  alive: boolean;
  isHost?: boolean;
}

export interface AttackTierDef {
  id: AttackTierId;
  label: string;
  shortLabel: string;
  emoji: string;
  cost: number;
  incomeGain: number;
  bloons: BloonType[];
  description: string;
}

export interface SyncBloonState {
  id: string;
  type: BloonType;
  hp: number;
  maxHp: number;
  laneIndex: number;
  distance: number;
  slowTimer: number;
  slowFactor: number;
  camoStripped: boolean;
  isTroll?: boolean;
}

export interface SpawnQueueItem {
  type: BloonType;
  wait: number;
  laneIndex: number;
  isTroll?: boolean;
}

export type TdNetMessage =
  | { action: 'place_tower'; tower: TowerInstance }
  | { action: 'upgrade_tower'; towerId: string; level: number; cost: number; ownerId: string }
  | { action: 'sell_tower'; towerId: string; ownerId: string }
  | { action: 'target_mode'; towerId: string; targetMode: TargetMode }
  | { action: 'start_wave'; wave: number }
  | { action: 'set_map'; mapId: MapId }
  | { action: 'set_mode'; gameMode: GameMode }
  | { action: 'set_speed'; speed: 1 | 2 }
  | { action: 'set_auto_wave'; autoWave: boolean }
  | { action: 'use_ability'; senderName: string; senderId: string; targets: Point[] }
  | { action: 'gift_bananas'; amount: number; fromName: string; targetPlayerId?: string }
  | {
      action: 'send_bloons';
      tier: AttackTierId;
      fromId: string;
      fromName: string;
      incomeGain: number;
    }
  | { action: 'restart_match'; mapId: MapId; gameMode: GameMode }
  | { action: 'cursor'; x: number; y: number; placingType: TowerType | null; color: string; name: string }
  | { action: 'ping'; x: number; y: number; name: string; color: string }
  | {
      action: 'state_sync';
      seq: number;
      mapId: MapId;
      gameMode: GameMode;
      wave: number;
      waveActive: boolean;
      lives: number;
      score: number;
      speed: 1 | 2;
      autoWave: boolean;
      gameOver: boolean;
      abilityCooldown: number;
      towers: TowerInstance[];
      bloons: SyncBloonState[];
      spawnQueue: SpawnQueueItem[];
      playerStats: PlayerMatchStats[];
      bananaRewards: Record<string, number>;
    }
  | {
      action: 'versus_status';
      playerId: string;
      name: string;
      color: string;
      lives: number;
      score: number;
      pops: number;
      incomeBonus: number;
      wave: number;
      alive: boolean;
      towerCount: number;
    };
