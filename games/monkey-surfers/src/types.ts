export const GAME_SLUG = 'monkey-surfers';

export const LANE_WIDTH_WORLD = 3.1;
export const TRAIN_HEIGHT = 2.8;
export const JETPACK_HEIGHT = 5.6;

export const BASE_SPEED = 20; // meters/sec
export const MAX_SPEED = 46; // meters/sec
export const SPEED_ACCEL = 0.24; // meters/sec^2

export const GRAVITY = 42;
export const JUMP_VEL = 16.4;
export const SNEAKER_JUMP_VEL = 22.8;
export const FAST_FALL_VEL = -28;
export const ROLL_DURATION = 0.62;
export const BOARD_DURATION = 10.0;
export const STUMBLE_DURATION = 5.5;

export type LaneIndex = 0 | 1 | 2;

export type SkinId = 'grafiteiro' | 'cria' | 'astronauta' | 'rei';
export type BoardId = 'cipo' | 'favela' | 'banana' | 'disco';
export type PowerupKind = 'jetpack' | 'sneakers' | 'magnet' | 'multiplier';

export interface SkinDef {
  id: SkinId;
  name: string;
  desc: string;
  price: number;
  fur: string;
  belly: string;
  hoodie: string;
  cap: string;
  accent: string;
}

export interface BoardDef {
  id: BoardId;
  name: string;
  desc: string;
  price: number;
  primary: string;
  secondary: string;
  glow: string;
}

export const MONKEY_SKINS: SkinDef[] = [
  {
    id: 'grafiteiro',
    name: 'Zé Grafite',
    desc: 'Boné pra trás e spray na mão. Clássico dos trilhos.',
    price: 0,
    fur: '#854d0e',
    belly: '#fde68a',
    hoodie: '#facc15',
    cap: '#ef4444',
    accent: '#22d3ee',
  },
  {
    id: 'cria',
    name: 'Chimp da Laje',
    desc: 'Juliet espelhado e bandana verde. Respeito na favela.',
    price: 120,
    fur: '#713f12',
    belly: '#fed7aa',
    hoodie: '#22c55e',
    cap: '#10b981',
    accent: '#f43f5e',
  },
  {
    id: 'astronauta',
    name: 'Macaco Espacial',
    desc: 'Traje lunar pra pichar até a estação orbital.',
    price: 280,
    fur: '#78350f',
    belly: '#e0f2fe',
    hoodie: '#f8fafc',
    cap: '#38bdf8',
    accent: '#a855f7',
  },
  {
    id: 'rei',
    name: 'Rei Banana Dourado',
    desc: 'Coroa real e manto roxo. O terror do Zelador.',
    price: 500,
    fur: '#b45309',
    belly: '#fef08a',
    hoodie: '#7e22ce',
    cap: '#facc15',
    accent: '#fde047',
  },
];

export const HOVER_BOARDS: BoardDef[] = [
  {
    id: 'cipo',
    name: 'Prancha de Cipó',
    desc: 'Folha gigante da Amazônia reforçada com fita isolante.',
    price: 0,
    primary: '#22c55e',
    secondary: '#14532d',
    glow: '#4ade80',
  },
  {
    id: 'favela',
    name: 'Shape Neon da Laje',
    desc: 'Pichação fluorescente que deixa rastro de tinta.',
    price: 150,
    primary: '#ec4899',
    secondary: '#1e1b4b',
    glow: '#22d3ee',
  },
  {
    id: 'banana',
    name: 'Banana Supersônica',
    desc: 'Prancha aerodinâmica em formato de cacho turbo.',
    price: 320,
    primary: '#facc15',
    secondary: '#9a3412',
    glow: '#fb923c',
  },
  {
    id: 'disco',
    name: 'Disco Voador Tupiniquim',
    desc: 'Tecnologia alienígena achada atrás do galpão.',
    price: 550,
    primary: '#38bdf8',
    secondary: '#312e81',
    glow: '#c084fc',
  },
];

export type ObstacleKind =
  | 'barrier_low'
  | 'barrier_high'
  | 'barrier_full'
  | 'train_static'
  | 'train_moving'
  | 'train_ramp';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  lane: LaneIndex;
  z: number; // start z (closest end to 0)
  length: number;
  rampLength: number; // > 0 only for train_ramp
  speed: number; // negative when moving toward player
  color: string;
  accent: string;
  graffiti: string;
  cleared?: boolean;
  destroyed?: boolean;
}

export interface BananaCoin {
  id: number;
  lane: LaneIndex;
  z: number;
  y: number;
  collected: boolean;
  isSpray?: boolean;
}

export interface PowerupItem {
  id: number;
  kind: PowerupKind;
  lane: LaneIndex;
  z: number;
  y: number;
  collected: boolean;
}

export interface ActivePowerups {
  jetpack: number;
  sneakers: number;
  magnet: number;
  multiplier: number;
}

export type MissionMetric =
  | 'meters'
  | 'bananas'
  | 'rolls'
  | 'jumps'
  | 'rooftops'
  | 'powerups'
  | 'boards';

export interface MissionDef {
  id: string;
  label: string;
  metric: MissionMetric;
  target: number;
  rewardBananas: number;
}

export interface MissionProgress {
  index: number;
  progress: number;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'm1', label: 'Corra {n}m em uma fuga', metric: 'meters', target: 350, rewardBananas: 40 },
  { id: 'm2', label: 'Colete {n} Moedas-Banana', metric: 'bananas', target: 45, rewardBananas: 50 },
  { id: 'm3', label: 'Role sob {n} barreiras', metric: 'rolls', target: 8, rewardBananas: 45 },
  { id: 'm4', label: 'Pule {n} vezes', metric: 'jumps', target: 15, rewardBananas: 35 },
  { id: 'm5', label: 'Suba no teto de {n} trens', metric: 'rooftops', target: 6, rewardBananas: 60 },
  { id: 'm6', label: 'Pegue {n} Power-ups', metric: 'powerups', target: 4, rewardBananas: 55 },
  { id: 'm7', label: 'Ative a Prancha {n} vezes', metric: 'boards', target: 2, rewardBananas: 50 },
  { id: 'm8', label: 'Corra {n}m em uma fuga', metric: 'meters', target: 800, rewardBananas: 90 },
  { id: 'm9', label: 'Colete {n} Moedas-Banana', metric: 'bananas', target: 120, rewardBananas: 100 },
  { id: 'm10', label: 'Role sob {n} barreiras', metric: 'rolls', target: 18, rewardBananas: 85 },
  { id: 'm11', label: 'Suba no teto de {n} trens', metric: 'rooftops', target: 15, rewardBananas: 110 },
  { id: 'm12', label: 'Corra {n}m em uma fuga', metric: 'meters', target: 1500, rewardBananas: 160 },
];

export interface PersistentSave {
  bananas: number;
  bestScore: number;
  bestMeters: number;
  ownedSkins: SkinId[];
  equippedSkin: SkinId;
  ownedBoards: BoardId[];
  equippedBoard: BoardId;
  boardCharges: number;
  permanentMult: number;
  missions: [MissionProgress, MissionProgress, MissionProgress];
}

const SAVE_KEY = 'monkey-surfers:save:v1';

export function createDefaultSave(): PersistentSave {
  return {
    bananas: 30,
    bestScore: 0,
    bestMeters: 0,
    ownedSkins: ['grafiteiro'],
    equippedSkin: 'grafiteiro',
    ownedBoards: ['cipo'],
    equippedBoard: 'cipo',
    boardCharges: 3,
    permanentMult: 1,
    missions: [
      { index: 0, progress: 0 },
      { index: 1, progress: 0 },
      { index: 2, progress: 0 },
    ],
  };
}

export function loadSave(): PersistentSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createDefaultSave();
    const parsed = JSON.parse(raw) as Partial<PersistentSave>;
    const def = createDefaultSave();
    return {
      ...def,
      ...parsed,
      ownedSkins: Array.isArray(parsed.ownedSkins) && parsed.ownedSkins.length > 0 ? parsed.ownedSkins : def.ownedSkins,
      ownedBoards: Array.isArray(parsed.ownedBoards) && parsed.ownedBoards.length > 0 ? parsed.ownedBoards : def.ownedBoards,
      missions:
        Array.isArray(parsed.missions) && parsed.missions.length === 3
          ? (parsed.missions as [MissionProgress, MissionProgress, MissionProgress])
          : def.missions,
    };
  } catch {
    return createDefaultSave();
  }
}

export function persistSave(save: PersistentSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore storage errors
  }
}

export interface RemoteSurferState {
  id: string;
  name: string;
  color: string;
  skin: SkinId;
  distance: number;
  laneX: number;
  y: number;
  rolling: boolean;
  jetpack: boolean;
  board: boolean;
  alive: boolean;
  score: number;
  lastUpdated: number;
  tauntText?: string;
  tauntTimer?: number;
}

export type SurferNetMessage =
  | {
      kind: 'race_start';
      seed: number;
      roundId: number;
    }
  | {
      kind: 'state';
      distance: number;
      laneX: number;
      y: number;
      rolling: boolean;
      jetpack: boolean;
      board: boolean;
      alive: boolean;
      skin: SkinId;
      score: number;
    }
  | {
      kind: 'taunt';
      phrase: string;
    }
  | {
      kind: 'finish';
      distance: number;
      score: number;
      bananas: number;
    };

export const TAUNT_PHRASES = [
  'PEGUEI O TREM!',
  'SAI DA FRENTE, ZELADOR!',
  'BANANA TURBO!',
  'OLHA O CAPIVARA-CÃO!',
  'UUU-AAA-AAA!',
  'TÔ NO TETO!',
  'COMEU POEIRA!',
];

export const CAUGHT_PHRASES = [
  'O Segurança Gorila confiscou seu spray!',
  'O Cachorro-Capivara mordeu seu rabo!',
  'Tropeçou na casca de banana estratégica!',
  'Deu de cara com o vagão da Linha Amarela!',
  'Multado por pichar o expresso da selva!',
];
