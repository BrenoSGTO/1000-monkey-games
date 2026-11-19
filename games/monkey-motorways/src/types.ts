export type MonkeyColor = 'yellow' | 'red' | 'blue' | 'purple' | 'green';

export type MapId = 'rio-de-bananeiro' | 'sao-chimpulo';

export type TileKind = 'land' | 'water' | 'tree' | 'rock';

export type ToolKind = 'road' | 'light' | 'roundabout' | 'motorway' | 'erase';

export type SimSpeed = 0 | 1 | 2;

export interface GridCoord {
  x: number;
  y: number;
}

export interface House {
  id: string;
  x: number;
  y: number;
  color: MonkeyColor;
  /** Facing angle for driveway ornament */
  drivewayAngle: number;
  carsTotal: number;
  carsParked: number;
  spawnAnim: number;
}

export interface DemandPin {
  id: string;
  claimedByCarId: string | null;
  createdAtDay: number;
}

export interface Market {
  id: string;
  /** Top-left cell of 2x2 footprint */
  x: number;
  y: number;
  color: MonkeyColor;
  isMega: boolean;
  pins: DemandPin[];
  /** 0..1 danger meter; game over when >= 1 */
  overload: number;
  demandTimer: number;
  demandInterval: number;
  spawnAnim: number;
  name: string;
}

export interface TrafficLight {
  x: number;
  y: number;
  /** 0 = vertical/NE-SW green, 1 = horizontal/NW-SE green */
  phase: 0 | 1;
  timer: number;
}

export interface Roundabout {
  x: number;
  y: number;
}

export interface VineMotorway {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  color: string;
}

export interface PathStep {
  x: number;
  y: number;
  isMotorway?: boolean;
  motorwayId?: string;
}

export interface Car {
  id: string;
  color: MonkeyColor;
  homeHouseId: string;
  targetMarketId: string;
  targetPinId: string | null;
  state: 'toMarket' | 'atMarket' | 'toHome';
  path: PathStep[];
  segIndex: number;
  segT: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  atMarketTimer: number;
  waitTime: number;
  rage: number;
  hornCooldown: number;
  moodEmoji: string;
  moodTimer: number;
  orphanedTimer: number;
}

export interface Inventory {
  roads: number;
  bridges: number;
  lights: number;
  roundabouts: number;
  motorways: number;
}

export interface UpgradeOption {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  roads: number;
  bridges: number;
  lights: number;
  roundabouts: number;
  motorways: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  emoji?: string;
}

export interface RemoteCursor {
  playerId: string;
  name: string;
  color: string;
  gx: number;
  gy: number;
  tool: ToolKind;
  drawing: boolean;
  lastSeen: number;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
  badge: string;
  cols: number;
  rows: number;
  tiles: TileKind[][];
  startingInventory: Inventory;
  /** Decorative palm/rock positions generated deterministically */
  decorSeed: number;
}

export interface GameSnapshot {
  mapId: MapId;
  phase: 'menu' | 'playing' | 'upgrade' | 'gameover';
  day: number;
  dayProgress: number;
  week: number;
  deliveries: number;
  speed: SimSpeed;
  prePauseSpeed: 1 | 2;
  inventory: Inventory;
  roadEdges: string[];
  lights: TrafficLight[];
  roundabouts: Roundabout[];
  motorways: VineMotorway[];
  houses: House[];
  markets: Market[];
  cars: Car[];
  pendingUpgrades: UpgradeOption[] | null;
  gameOverReason: string | null;
  gameOverMarketId: string | null;
  networkVersion: number;
}

export type NetMessage =
  | { kind: 'action:road-add'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'action:road-erase-edge'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'action:erase-cell'; gx: number; gy: number }
  | { kind: 'action:light-toggle'; gx: number; gy: number }
  | { kind: 'action:roundabout-toggle'; gx: number; gy: number }
  | { kind: 'action:motorway-add'; ax: number; ay: number; bx: number; by: number }
  | { kind: 'action:motorway-remove'; id: string }
  | { kind: 'action:speed'; speed: SimSpeed }
  | { kind: 'action:pick-upgrade'; index: number }
  | { kind: 'action:start-game'; mapId: MapId }
  | { kind: 'action:request-sync' }
  | { kind: 'cursor'; gx: number; gy: number; tool: ToolKind; drawing: boolean }
  | { kind: 'event:toast'; message: string; tone?: 'banana' | 'chaos' | 'info' }
  | { kind: 'sync:snapshot'; snapshot: GameSnapshot };
