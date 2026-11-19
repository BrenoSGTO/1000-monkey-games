export type TerrainType = 'grass' | 'water' | 'forest';

export type BuildingType =
  | 'road'
  | 'house'
  | 'market'
  | 'factory'
  | 'power'
  | 'park'
  | 'dump';

export type ToolType = BuildingType | 'bulldozer';

export interface ToolDef {
  id: ToolType;
  key: string;
  name: string;
  shortName: string;
  emoji: string;
  cost: number;
  color: string;
  radius: number;
  powerUse: number;
  powerGen: number;
  description: string;
}

export const GRID_SIZE = 24;
export const TILE_W = 64;
export const TILE_H = 32;

export const TOOLS: ToolDef[] = [
  {
    id: 'road',
    key: '1',
    name: 'Estrada / Ponte',
    shortName: 'Estrada',
    emoji: '🛣️',
    cost: 10,
    color: '#64748b',
    radius: 0,
    powerUse: 0,
    powerGen: 0,
    description: 'Conecta sozinha com curvas e cruzamentos! Vira ponte sobre o rio (custo 2x).',
  },
  {
    id: 'house',
    key: '2',
    name: 'Barraco de Macaco',
    shortName: 'Barraco',
    emoji: '🏠',
    cost: 40,
    color: '#fb923c',
    radius: 0,
    powerUse: 1,
    powerGen: 0,
    description: 'Residencial! Aumenta a população e paga imposto em Bananas (precisa de luz e estrada).',
  },
  {
    id: 'market',
    key: '3',
    name: 'Feira de Banana',
    shortName: 'Feira',
    emoji: '🍌',
    cost: 65,
    color: '#facc15',
    radius: 0,
    powerUse: 2,
    powerGen: 0,
    description: 'Comercial! Lucra quando carrinhos de banana chegam. Reclama de engarrafamento!',
  },
  {
    id: 'factory',
    key: '4',
    name: 'Fábrica de Paçoca',
    shortName: 'Fábrica',
    emoji: '🏭',
    cost: 110,
    color: '#a855f7',
    radius: 3.5,
    powerUse: 3,
    powerGen: 0,
    description: 'Industrial! Dá MUITA grana, mas solta nuvem tóxica de paçoca que irrita vizinhos.',
  },
  {
    id: 'power',
    key: '5',
    name: 'Usina de Casca',
    shortName: 'Usina',
    emoji: '⚡',
    cost: 130,
    color: '#38bdf8',
    radius: 5.5,
    powerUse: 0,
    powerGen: 18,
    description: 'Gera energia elétrica num raio de 5.5 quadras usando casca de banana queimada.',
  },
  {
    id: 'park',
    key: '6',
    name: 'Estátua Macaco Calvo',
    shortName: 'Praça',
    emoji: '🗿',
    cost: 75,
    color: '#4ade80',
    radius: 4.2,
    powerUse: 1,
    powerGen: 0,
    description: 'Lazer! Brilho da careca dourada e cipós aumentam a felicidade ao redor.',
  },
  {
    id: 'dump',
    key: '7',
    name: 'Lixão de Coco',
    shortName: 'Lixão',
    emoji: '🥥',
    cost: 30,
    color: '#84cc16',
    radius: 4.5,
    powerUse: 0,
    powerGen: 0,
    description: 'Barato! Limpa o lixo da cidade, mas fede MUITO ao redor (ótimo pra trollar amigo!).',
  },
  {
    id: 'bulldozer',
    key: '8',
    name: 'Demolidor',
    shortName: 'Demolir',
    emoji: '💥',
    cost: 5,
    color: '#ef4444',
    radius: 0,
    powerUse: 0,
    powerGen: 0,
    description: 'Explode prédios, estradas ou árvores com fumaça e barulho satisfatório.',
  },
];

export const TOOL_MAP: Record<ToolType, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t]),
) as Record<ToolType, ToolDef>;

export interface TileData {
  gx: number;
  gy: number;
  terrain: TerrainType;
  building: BuildingType | null;
  /** 1..3 visual upgrade level for houses/markets based on happiness */
  level: number;
  /** Computed each simulation tick */
  powered: boolean;
  connectedToRoad: boolean;
  localHappiness: number;
  pollution: number;
  trafficLoad: number;
  /** Variant seed for trees / building tint */
  variant: number;
  /** Who placed it */
  builtBy?: string;
}

export type VehicleKind = 'banana_car' | 'monkey_bus' | 'pacoca_truck' | 'trio_eletrico';

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  path: Array<{ gx: number; gy: number }>;
  pathIndex: number;
  /** 0..1 progress between path[pathIndex] and path[pathIndex+1] */
  progress: number;
  /** Current interpolated grid coords */
  gx: number;
  gy: number;
  dirX: number;
  dirY: number;
  speed: number;
  stuckTime: number;
  honkCooldown: number;
  color: string;
}

export type DisasterType = 'strike' | 'coconut_rain' | 'trio_eletrico' | 'giant_gorilla';

export interface ActiveDisaster {
  id: number;
  type: DisasterType;
  title: string;
  remaining: number;
  duration: number;
  /** For giant gorilla */
  gorillaX: number;
  gorillaY: number;
  gorillaTargetX: number;
  gorillaTargetY: number;
  stepTimer: number;
  /** For coconut rain */
  coconuts: Array<{
    gx: number;
    gy: number;
    height: number;
    speed: number;
  }>;
  triggeredBy?: string;
}

export interface ChimpTweet {
  id: number;
  handle: string;
  avatar: string;
  text: string;
  likes: number;
  tone: 'rage' | 'love' | 'chaos' | 'meme';
  timeLabel: string;
}

export interface Particle {
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  vz: number;
  z: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  text?: string;
  kind: 'smoke' | 'spark' | 'stink' | 'confetti' | 'text' | 'ring';
}

export interface Milestone {
  id: number;
  name: string;
  popRequired: number;
  bonusBananas: number;
  badge: string;
}

export const MILESTONES: Milestone[] = [
  { id: 0, name: 'Acampamento de Galho', popRequired: 0, bonusBananas: 0, badge: '🌿' },
  { id: 1, name: 'Vila da Banana', popRequired: 25, bonusBananas: 150, badge: '🍌' },
  { id: 2, name: 'Município do Cipó', popRequired: 80, bonusBananas: 350, badge: '🌴' },
  { id: 3, name: 'Metrópole Primata', popRequired: 180, bonusBananas: 750, badge: '🏙️' },
  { id: 4, name: 'Império Slop', popRequired: 320, bonusBananas: 1500, badge: '👑' },
];

export interface RemoteCursor {
  playerId: string;
  name: string;
  color: string;
  gx: number;
  gy: number;
  tool: ToolType;
  lastSeen: number;
}

export interface CitySnapshot {
  seed: number;
  bananas: number;
  day: number;
  highestMilestone: number;
  tiles: Array<{
    gx: number;
    gy: number;
    terrain: TerrainType;
    building: BuildingType | null;
    level: number;
    builtBy?: string;
  }>;
}

export type CityNetMessage =
  | {
      kind: 'tile_action';
      gx: number;
      gy: number;
      tool: ToolType;
      actorName: string;
    }
  | {
      kind: 'cursor_move';
      gx: number;
      gy: number;
      tool: ToolType;
      color: string;
    }
  | {
      kind: 'trigger_disaster';
      disasterType: DisasterType;
      actorName: string;
      seedX: number;
      seedY: number;
    }
  | {
      kind: 'state_sync';
      snapshot: CitySnapshot;
    }
  | {
      kind: 'request_sync';
    }
  | {
      kind: 'reset_city';
      seed: number;
      actorName: string;
    };

export interface CityStats {
  bananas: number;
  incomePerTick: number;
  population: number;
  happiness: number;
  powerProduced: number;
  powerDemand: number;
  garbageLoad: number;
  garbageCapacity: number;
  trafficCongestion: number;
  roadCount: number;
  houseCount: number;
  marketCount: number;
  factoryCount: number;
  day: number;
  milestoneIndex: number;
  bankruptTimer: number;
  rebellionTimer: number;
}
