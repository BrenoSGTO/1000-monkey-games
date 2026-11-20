export type TerrainType = 'grass' | 'water' | 'forest';

export type BuildingType =
  | 'road'
  | 'house'
  | 'market'
  | 'factory'
  | 'power'
  | 'park'
  | 'dump'
  | 'townhall';

export type ToolType = BuildingType | 'bulldozer' | 'inspect';

export type OverlayMode = 'normal' | 'power' | 'happiness' | 'pollution';

export type GameMode = 'classic' | 'local2p' | 'sandbox';

export interface ToolDef {
  id: ToolType;
  key: string;
  name: string;
  shortName: string;
  emoji: string;
  cost: number;
  upkeep: number;
  color: string;
  radius: number;
  powerUse: number;
  powerGen: number;
  inDock: boolean;
  description: string;
}

export const GRID_SIZE = 24;
export const TILE_W = 64;
export const TILE_H = 32;

export const TOOLS: ToolDef[] = [
  {
    id: 'inspect',
    key: '0',
    name: 'Inspecionar / Reparar',
    shortName: 'Inspec.',
    emoji: '🔍',
    cost: 0,
    upkeep: 0,
    color: '#38bdf8',
    radius: 0,
    powerUse: 0,
    powerGen: 0,
    inDock: true,
    description: 'Clique em qualquer prédio ou terreno para ver status, lucro, energia, dono e reparar danos.',
  },
  {
    id: 'road',
    key: '1',
    name: 'Estrada / Ponte',
    shortName: 'Estrada',
    emoji: '🛣️',
    cost: 10,
    upkeep: 0.15,
    color: '#64748b',
    radius: 0,
    powerUse: 0,
    powerGen: 0,
    inDock: true,
    description: 'Arraste em L para traçar avenidas retas com prévia! Sobre o rio vira Ponte (2x custo).',
  },
  {
    id: 'house',
    key: '2',
    name: 'Barraco de Macaco',
    shortName: 'Barraco',
    emoji: '🏠',
    cost: 40,
    upkeep: 0,
    color: '#fb923c',
    radius: 0,
    powerUse: 1,
    powerGen: 0,
    inDock: true,
    description: 'Residencial! Traz macacos e paga imposto (+2 a +7🍌). Precisa de Estrada + Luz!',
  },
  {
    id: 'market',
    key: '3',
    name: 'Feira de Banana',
    shortName: 'Feira',
    emoji: '🍌',
    cost: 65,
    upkeep: 0,
    color: '#facc15',
    radius: 0,
    powerUse: 2,
    powerGen: 0,
    inDock: true,
    description: 'Comercial! Lucra +6🍌/ciclo e recebe carrinhos (+6🍌 por entrega). Precisa de Luz e Estrada!',
  },
  {
    id: 'factory',
    key: '4',
    name: 'Fábrica de Paçoca',
    shortName: 'Fábrica',
    emoji: '🏭',
    cost: 110,
    upkeep: 0,
    color: '#a855f7',
    radius: 3.5,
    powerUse: 3,
    powerGen: 0,
    inDock: true,
    description: 'Industrial! Lucra +18🍌/ciclo, mas solta nuvem tóxica (raio 3.5). Construa longe dos Barracos!',
  },
  {
    id: 'power',
    key: '5',
    name: 'Usina de Casca',
    shortName: 'Usina',
    emoji: '⚡',
    cost: 130,
    upkeep: 3,
    color: '#38bdf8',
    radius: 5.5,
    powerUse: 0,
    powerGen: 18,
    inDock: true,
    description: 'Gera 18⚡ num raio azul de 5.5 quadras. Manutenção: 3🍌/ciclo.',
  },
  {
    id: 'park',
    key: '6',
    name: 'Estátua Macaco Calvo',
    shortName: 'Praça',
    emoji: '🗿',
    cost: 75,
    upkeep: 1.5,
    color: '#4ade80',
    radius: 4.2,
    powerUse: 1,
    powerGen: 0,
    inDock: true,
    description: 'Lazer! Sobe a felicidade ao redor (raio 4.2) e ajuda Barracos a evoluírem! Manut: 1.5🍌.',
  },
  {
    id: 'dump',
    key: '7',
    name: 'Lixão de Coco',
    shortName: 'Lixão',
    emoji: '🥥',
    cost: 30,
    upkeep: 1,
    color: '#84cc16',
    radius: 4.5,
    powerUse: 0,
    powerGen: 0,
    inDock: true,
    description: 'Limpa +16 de lixo da cidade, mas fede num raio de 4.5 quadras (ótimo pra trollar!). Manut: 1🍌.',
  },
  {
    id: 'bulldozer',
    key: '8',
    name: 'Demolidor',
    shortName: 'Demolir',
    emoji: '💥',
    cost: 5,
    upkeep: 0,
    color: '#ef4444',
    radius: 0,
    powerUse: 0,
    powerGen: 0,
    inDock: true,
    description: 'Demole prédios/estradas com REEMBOLSO DE 50%! Limpar árvores custa 5🍌.',
  },
  {
    id: 'townhall',
    key: '',
    name: 'Prefeitura da Selva',
    shortName: 'Prefeitura',
    emoji: '🏛️',
    cost: 0,
    upkeep: 0,
    color: '#fde047',
    radius: 0,
    powerUse: 0,
    powerGen: 0,
    inDock: false,
    description: 'Sede oficial do governo primata! Ponto central da cidade (indestrutível).',
  },
];

export const DOCK_TOOLS: ToolDef[] = TOOLS.filter((t) => t.inDock);

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
  /** True when stomped by Giant Gorilla and needing repair */
  damaged: boolean;
  /** Visual timer (>0) when a building recently leveled up */
  levelUpTimer: number;
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

export interface IncomingDisaster {
  type: DisasterType;
  title: string;
  countdown: number;
  seedX: number;
  seedY: number;
}

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

export interface MapPing {
  id: number;
  gx: number;
  gy: number;
  actorName: string;
  color: string;
  life: number;
  maxLife: number;
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

export interface GuideMission {
  id: string;
  title: string;
  hint: string;
  reward: number;
  toolHint: ToolType;
  done: boolean;
  current: number;
  target: number;
}

export interface RciDemand {
  /** 0..100 (50 = neutro) */
  residential: number;
  commercial: number;
  industrial: number;
}

export interface EconomyBreakdown {
  houseIncome: number;
  marketIncome: number;
  factoryIncome: number;
  deliveryIncome: number;
  roadUpkeep: number;
  powerUpkeep: number;
  parkUpkeep: number;
  dumpUpkeep: number;
  decreeDelta: number;
  netPerTick: number;
}

export interface PlayerContribution {
  name: string;
  color: string;
  built: number;
  roads: number;
  demolished: number;
  bananasDelta: number;
}

export interface DecreeOption {
  id: string;
  title: string;
  emoji: string;
  summary: string;
  happinessBonus: number;
  incomeMult: number;
  powerMult: number;
  parkMult: number;
  extraPollution: number;
}

export const DECREE_PAIRS: Array<[DecreeOption, DecreeOption]> = [
  [
    {
      id: 'banana_holiday',
      title: 'Feriado da Banana',
      emoji: '🍌',
      summary: '+18% Felicidade em toda cidade, -20% imposto por 24s',
      happinessBonus: 18,
      incomeMult: 0.8,
      powerMult: 1,
      parkMult: 1,
      extraPollution: 0,
    },
    {
      id: 'coconut_tax',
      title: 'Imposto do Coco',
      emoji: '🥥',
      summary: '+45% Renda comercial/industrial, -10% Felicidade por 24s',
      happinessBonus: -10,
      incomeMult: 1.45,
      powerMult: 1,
      parkMult: 1,
      extraPollution: 0,
    },
  ],
  [
    {
      id: 'peel_overdrive',
      title: 'Sobrecarga de Casca',
      emoji: '⚡',
      summary: '+50% Energia das Usinas, mas +10 Poluição geral por 24s',
      happinessBonus: 0,
      incomeMult: 1,
      powerMult: 1.5,
      parkMult: 1,
      extraPollution: 10,
    },
    {
      id: 'bald_glory',
      title: 'Dia da Careca Brilhante',
      emoji: '🗿',
      summary: 'Estátuas dão DOBRO de felicidade e renda +15% por 24s',
      happinessBonus: 8,
      incomeMult: 1.15,
      powerMult: 1,
      parkMult: 2,
      extraPollution: 0,
    },
  ],
];

export interface DecreeState {
  phase: 'idle' | 'voting' | 'active';
  id: number;
  options: [DecreeOption, DecreeOption];
  votes: Record<string, 0 | 1>;
  remaining: number;
  activeOption: DecreeOption | null;
}

export interface RemoteCursor {
  playerId: string;
  name: string;
  color: string;
  gx: number;
  gy: number;
  tool: ToolType;
  lastSeen: number;
}

export interface UndoEntry {
  label: string;
  bananaDelta: number;
  tiles: Array<{
    gx: number;
    gy: number;
    terrain: TerrainType;
    building: BuildingType | null;
    level: number;
    damaged: boolean;
    builtBy?: string;
  }>;
}

export interface CitySnapshot {
  seed: number;
  mode: GameMode;
  simSpeed: 0 | 1 | 2;
  bananas: number;
  day: number;
  highestMilestone: number;
  completedMissionIds: string[];
  contributions: Record<string, PlayerContribution>;
  decree: DecreeState;
  incomingDisaster: IncomingDisaster | null;
  tiles: Array<{
    gx: number;
    gy: number;
    terrain: TerrainType;
    building: BuildingType | null;
    level: number;
    damaged: boolean;
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
      actorColor: string;
    }
  | {
      kind: 'road_batch';
      coords: Array<{ gx: number; gy: number }>;
      actorName: string;
      actorColor: string;
    }
  | {
      kind: 'repair_tile';
      gx: number;
      gy: number;
      actorName: string;
    }
  | {
      kind: 'undo_batch';
      entry: UndoEntry;
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
      kind: 'map_ping';
      gx: number;
      gy: number;
      actorName: string;
      color: string;
    }
  | {
      kind: 'set_speed';
      speed: 0 | 1 | 2;
      actorName: string;
    }
  | {
      kind: 'trigger_disaster';
      disasterType: DisasterType;
      actorName: string;
      seedX: number;
      seedY: number;
    }
  | {
      kind: 'incoming_disaster';
      incoming: IncomingDisaster;
    }
  | {
      kind: 'decree_start_vote';
      id: number;
      pairIndex: number;
      duration: number;
    }
  | {
      kind: 'decree_vote';
      decreeId: number;
      optionIndex: 0 | 1;
      voterId: string;
      voterName: string;
    }
  | {
      kind: 'crisis_event';
      reason: 'bankrupt' | 'rebellion';
    }
  | {
      kind: 'loan_rescue';
      actorName: string;
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
      mode: GameMode;
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
  unpoweredCount: number;
  noRoadCount: number;
  damagedCount: number;
}
