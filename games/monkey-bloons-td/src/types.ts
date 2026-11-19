export type MapId = 'selva' | 'feira';

export type TowerType = 'banana' | 'havaianas' | 'sniper' | 'coco' | 'dj';

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

export interface Point {
  x: number;
  y: number;
}

export interface MapProp {
  kind: 'tree' | 'cone' | 'sign' | 'stall' | 'crate' | 'puddle';
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
  fireRate: number; // shots per second (or pulse rate for DJ)
  damage: number;
  color: string;
  description: string;
  detectsCamo: boolean;
  popsLead: boolean;
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
}

export interface BloonDef {
  type: BloonType;
  name: string;
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
  distance: number; // distance along track in px
  x: number;
  y: number;
  slowTimer: number;
  slowFactor: number; // e.g. 0.45 means 45% speed
  camoStripped: boolean;
  hitFlash: number;
  wobbleSeed: number;
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

export type TdNetMessage =
  | { action: 'place_tower'; tower: TowerInstance }
  | { action: 'upgrade_tower'; towerId: string; level: number; cost: number }
  | { action: 'sell_tower'; towerId: string }
  | { action: 'target_mode'; towerId: string; targetMode: TargetMode }
  | { action: 'start_wave'; wave: number }
  | { action: 'set_map'; mapId: MapId }
  | { action: 'set_speed'; speed: 1 | 2 }
  | { action: 'set_auto_wave'; autoWave: boolean }
  | { action: 'gift_bananas'; amount: number; fromName: string }
  | { action: 'troll_bloons'; count: number; fromName: string }
  | { action: 'restart_match'; mapId: MapId }
  | {
      action: 'sync_snapshot';
      mapId: MapId;
      wave: number;
      lives: number;
      score: number;
      speed: 1 | 2;
      autoWave: boolean;
      towers: TowerInstance[];
    }
  | { action: 'wave_sync'; wave: number; lives: number; score: number };
