export type MonkeyColor = 'yellow' | 'red' | 'blue' | 'purple' | 'green';

export type MapId =
  | 'rio-de-bananeiro'
  | 'sao-chimpulo'
  | 'arquipelago-macacos'
  | 'marginal-tiete-selva';

export type TileKind = 'land' | 'water' | 'tree' | 'rock';

export type ToolKind = 'road' | 'light' | 'roundabout' | 'motorway' | 'erase' | 'ping';

export type SimSpeed = 0 | 1 | 2;

export type BuildingShape = 'circle' | 'diamond' | 'hex' | 'pentagon' | 'octagon';

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
  /** 0 = N-S / NW-SE green, 1 = E-W / NE-SW green */
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
  /** Client-side visual smoothing offsets (not sent over network) */
  vxOffset?: number;
  vyOffset?: number;
  vAngleOffset?: number;
  isOnMotorway?: boolean;
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
  description: string;
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
  isConfetti?: boolean;
  rot?: number;
  vRot?: number;
  gravity?: number;
}

export interface MapPing {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  gx: number;
  gy: number;
  emoji: string;
  text: string;
  life: number;
  maxLife: number;
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

export interface PlayerContribution {
  id: string;
  name: string;
  color: string;
  roadsBuilt: number;
  bridgesBuilt: number;
  lightsBuilt: number;
  roundaboutsBuilt: number;
  motorwaysBuilt: number;
  erasedCount: number;
  pingsSent: number;
}

export interface BuildHistoryEvent {
  t: number;
  kind: 'house' | 'market' | 'road' | 'light' | 'roundabout' | 'motorway';
  x: number;
  y: number;
  bx?: number;
  by?: number;
  color?: MonkeyColor;
  isBridge?: boolean;
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
  initialClusterAnchor: GridCoord;
  colorAnchors?: Partial<
    Record<MonkeyColor, { market: GridCoord; house1: GridCoord; house2?: GridCoord }>
  >;
  rushMultiplier: number;
  bridgeBias?: boolean;
}

export interface CompactCarState {
  id: string;
  color: MonkeyColor;
  x: number;
  y: number;
  angle: number;
  speed: number;
  state: Car['state'];
  isOnMotorway: boolean;
  rage: number;
  moodEmoji: string;
  moodTimer: number;
  orphanedTimer: number;
}

export interface CompactMarketState {
  id: string;
  isMega: boolean;
  pins: DemandPin[];
  overload: number;
  demandInterval: number;
}

export interface DynamicTickSnapshot {
  day: number;
  dayProgress: number;
  week: number;
  deliveries: number;
  speed: SimSpeed;
  prePauseSpeed: 1 | 2;
  inventory: Inventory;
  lights: TrafficLight[];
  markets: CompactMarketState[];
  cars: CompactCarState[];
  networkVersion: number;
  upgradeVotes: Record<string, number>;
  lastProcessedSeq: Record<string, number>;
  playerStats: Record<string, PlayerContribution>;
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
  unlockedColors: MonkeyColor[];
  milestonesHit: number[];
  roadEdges: string[];
  lights: TrafficLight[];
  roundabouts: Roundabout[];
  motorways: VineMotorway[];
  houses: House[];
  markets: Market[];
  cars: Car[];
  pendingUpgrades: UpgradeOption[] | null;
  upgradeVotes: Record<string, number>;
  playerStats: Record<string, PlayerContribution>;
  lastProcessedSeq: Record<string, number>;
  buildHistory: BuildHistoryEvent[];
  gameOverReason: string | null;
  gameOverMarketId: string | null;
  networkVersion: number;
}

export interface NetActor {
  id: string;
  name: string;
  color: string;
}

export type NetMessage =
  | { kind: 'action:road-add'; ax: number; ay: number; bx: number; by: number; seq?: number; actor?: NetActor }
  | { kind: 'action:road-erase-edge'; ax: number; ay: number; bx: number; by: number; seq?: number; actor?: NetActor }
  | { kind: 'action:erase-cell'; gx: number; gy: number; seq?: number; actor?: NetActor }
  | { kind: 'action:light-toggle'; gx: number; gy: number; seq?: number; actor?: NetActor }
  | { kind: 'action:roundabout-toggle'; gx: number; gy: number; seq?: number; actor?: NetActor }
  | { kind: 'action:motorway-add'; ax: number; ay: number; bx: number; by: number; seq?: number; actor?: NetActor }
  | { kind: 'action:motorway-remove'; id: string; seq?: number; actor?: NetActor }
  | { kind: 'action:speed'; speed: SimSpeed }
  | { kind: 'action:vote-upgrade'; index: number; actor?: NetActor }
  | { kind: 'action:pick-upgrade'; index: number }
  | { kind: 'action:start-game'; mapId: MapId }
  | { kind: 'action:request-sync' }
  | { kind: 'cursor'; gx: number; gy: number; tool: ToolKind; drawing: boolean }
  | { kind: 'event:ping'; gx: number; gy: number; emoji: string; text: string; actor?: NetActor }
  | {
      kind: 'event:fx';
      fx: 'delivery' | 'horn' | 'mega' | 'milestone' | 'overload-warn';
      x?: number;
      y?: number;
      color?: MonkeyColor;
      text?: string;
      value?: number;
    }
  | { kind: 'event:toast'; message: string; tone?: 'banana' | 'chaos' | 'info' }
  | { kind: 'sync:tick'; tick: DynamicTickSnapshot }
  | { kind: 'sync:snapshot'; snapshot: GameSnapshot };
