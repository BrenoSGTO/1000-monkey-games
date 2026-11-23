export const WORLD_HEIGHT = 640;
export const GROUND_HEIGHT = 84;
export const PLAYABLE_HEIGHT = WORLD_HEIGHT - GROUND_HEIGHT;

export const MONKEY_RADIUS = 17;
export const GRAVITY = 1520;
export const FLAP_VELOCITY = -455;
export const MAX_FALL_SPEED = 680;
export const BASE_SCROLL_SPEED = 235;
export const MAX_SCROLL_SPEED = 365;
export const TURBO_SPEED_MULT = 1.75;

export const MAGNET_DURATION = 8.5;
export const TURBO_DURATION = 4.2;
export const SHIELD_IFRAME = 0.85;

export type GameMode = 'solo' | 'local2p' | 'online';
export type ScreenPhase = 'title' | 'countdown' | 'playing' | 'gameover';
export type BiomeId = 'jungle' | 'city' | 'space';
export type PowerUpType = 'magnet' | 'shield' | 'turbo';
export type SkinId = 'classic' | 'intern' | 'mandrake' | 'astronaut' | 'pixking' | 'cyber';

export interface SkinDef {
  id: SkinId;
  name: string;
  emoji: string;
  cost: number;
  furMain: string;
  furDark: string;
  face: string;
  propColor: string;
}

export const MONKEY_SKINS: SkinDef[] = [
  {
    id: 'classic',
    name: 'Mico Clássico',
    emoji: '🐒',
    cost: 0,
    furMain: '#92400e',
    furDark: '#451a03',
    face: '#fde68a',
    propColor: '#facc15',
  },
  {
    id: 'intern',
    name: 'Estagiário',
    emoji: '👔',
    cost: 10,
    furMain: '#7c2d12',
    furDark: '#431407',
    face: '#fed7aa',
    propColor: '#fde047',
  },
  {
    id: 'mandrake',
    name: 'Mico Mandrake',
    emoji: '🕶️',
    cost: 25,
    furMain: '#854d0e',
    furDark: '#422006',
    face: '#fef08a',
    propColor: '#22d3ee',
  },
  {
    id: 'astronaut',
    name: 'Astro-Chimp',
    emoji: '👨‍🚀',
    cost: 45,
    furMain: '#b45309',
    furDark: '#78350f',
    face: '#ffedd5',
    propColor: '#38bdf8',
  },
  {
    id: 'pixking',
    name: 'Rei do Pix',
    emoji: '👑',
    cost: 75,
    furMain: '#a16207',
    furDark: '#713f12',
    face: '#fef9c3',
    propColor: '#fbbf24',
  },
  {
    id: 'cyber',
    name: 'Cyber-Mico',
    emoji: '🤖',
    cost: 110,
    furMain: '#334155',
    furDark: '#0f172a',
    face: '#cbd5e1',
    propColor: '#a855f7',
  },
];

export interface BiomeDef {
  id: BiomeId;
  name: string;
  subtitle: string;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  groundTop: string;
  groundBody: string;
  accent: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  jungle: {
    id: 'jungle',
    name: 'Selva Caótica',
    subtitle: 'Bambus, Cipós & Tucanos Pistola',
    skyTop: '#0284c7',
    skyMid: '#38bdf8',
    skyBottom: '#fef08a',
    groundTop: '#22c55e',
    groundBody: '#713f12',
    accent: '#4ade80',
  },
  city: {
    id: 'city',
    name: 'Cidade do Corre',
    subtitle: 'Prédios Tortos, Pombos & Helicópteros de Coco',
    skyTop: '#312e81',
    skyMid: '#db2777',
    skyBottom: '#fb923c',
    groundTop: '#475569',
    groundBody: '#1e293b',
    accent: '#f472b6',
  },
  space: {
    id: 'space',
    name: 'Espaço Bananático',
    subtitle: 'Lasers Cósmicos & Discos de Macaco',
    skyTop: '#030712',
    skyMid: '#1e1b4b',
    skyBottom: '#4c1d95',
    groundTop: '#6366f1',
    groundBody: '#1e1b4b',
    accent: '#22d3ee',
  },
};

export function getBiomeForScore(score: number): BiomeId {
  if (score >= 24) return 'space';
  if (score >= 12) return 'city';
  return 'jungle';
}

export interface ObstacleColumn {
  id: number;
  x: number;
  width: number;
  gapY: number;
  gapHeight: number;
  baseGapY: number;
  oscAmp: number;
  oscSpeed: number;
  oscPhase: number;
  biome: BiomeId;
  passedBy: Set<number>;
  nearMissedBy: Set<number>;
  destroyed: boolean;
  vineOffset: number;
  signText: string;
}

export type FlyerKind = 'angry_bird' | 'coconut_heli' | 'space_ufo';

export interface FlyingHazard {
  id: number;
  kind: FlyerKind;
  x: number;
  y: number;
  baseY: number;
  radius: number;
  speedBonus: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
  destroyed: boolean;
  nearMissedBy: Set<number>;
}

export interface BananaCoin {
  id: number;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  bobPhase: number;
}

export interface PowerUpOrb {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  phase: number;
}

export interface RagdollPropeller {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  life: number;
}

export interface MonkeyEntity {
  playerIndex: number; // 0 = P1, 1 = P2
  name: string;
  badgeColor: string;
  skin: SkinId;
  x: number;
  y: number;
  vy: number;
  rot: number;
  scaleX: number;
  scaleY: number;
  propAngle: number;
  propSpeed: number;
  flapTimer: number;
  blinkTimer: number;
  isBlinking: boolean;
  dangerLevel: number;
  alive: boolean;
  score: number;
  bananasRun: number;
  survivalTime: number;
  deathCause: string;
  // Power-ups
  magnetTimer: number;
  hasShield: boolean;
  turboTimer: number;
  invulnTimer: number;
  // Ragdoll state
  ragdollVx: number;
  ragdollVy: number;
  ragdollVrot: number;
  ragdollBounces: number;
  limbFlail: number;
  propellerDetached: RagdollPropeller | null;
}

export interface RemoteGhost {
  id: string;
  name: string;
  color: string;
  skin: SkinId;
  worldX: number;
  targetWorldX: number;
  y: number;
  targetY: number;
  rot: number;
  targetRot: number;
  alive: boolean;
  score: number;
  hasShield: boolean;
  isTurbo: boolean;
  propAngle: number;
  flapTimer: number;
  lastUpdated: number;
  ragdollX: number;
  ragdollY: number;
  hornText: string | null;
  hornTimer: number;
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
  rot: number;
  vrot: number;
  gravity: number;
  kind: 'circle' | 'shard' | 'star' | 'banana' | 'ring';
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

export interface SessionScoreEntry {
  id: string;
  name: string;
  color: string;
  wins: number;
  bestScore: number;
  lastScore: number;
}

export type FlappyNetMessage =
  | {
      type: 'race_start';
      seed: number;
      roundId: number;
      hostName: string;
    }
  | {
      type: 'player_state';
      roundId: number;
      worldX: number;
      y: number;
      rot: number;
      alive: boolean;
      score: number;
      skin: SkinId;
      hasShield: boolean;
      isTurbo: boolean;
      flapping: boolean;
      ragdollX: number;
      ragdollY: number;
    }
  | {
      type: 'player_died';
      roundId: number;
      score: number;
      survivalTime: number;
      quote: string;
    }
  | {
      type: 'horn';
      phrase: string;
    }
  | {
      type: 'round_winner';
      roundId: number;
      winnerId: string;
      winnerName: string;
      score: number;
    };

export const DEATH_QUOTES_GENERAL = [
  'Caiu igual meu salário!',
  'Bateu as asas igual boleto vencido!',
  'Despencou mais rápido que a internet da firma!',
  'Foi de arrasta pra cima (no caso, pra baixo)!',
  'A gravidade mandou um abraço bem apertado!',
  'Piloto automático tava no modo soneca!',
  'Reprovado no exame da ANAC dos macacos!',
  'A hélice de banana pediu demissão no meio do voo!',
  'Esse voo teve menos futuro que dieta na segunda!',
  'Virou patê de banana no meio da pista!',
  'Esqueceu de renovar o seguro da cauda!',
  'Motor a banana fundiu na subida!',
];

export const DEATH_QUOTES_BY_CAUSE: Record<string, string[]> = {
  bird: [
    'Levou uma bicada de tucano sindicalizado!',
    'O pombo do centro não perdoa ninguém!',
    'Briga de trânsito aéreo deu ruim!',
  ],
  heli: [
    'Atropelado por um Helicóptero de Coco sem seta!',
    'O piloto do coco tava no Zap!',
    'Entrou na rota do iFood da selva!',
  ],
  space: [
    'Houston, o macaco virou estrelinha!',
    'Abduzido pela multa intergaláctica!',
    'Sem oxigênio e sem dignidade no espaço!',
  ],
  ground: [
    'Beijou o chão com força de segunda-feira!',
    'Tentou cavar petróleo com a testa!',
    'Pouso forçado nota 0 dos jurados!',
  ],
};

export const HORN_PHRASES = [
  'SAI DA FRENTE!',
  'OLHA O BREQUE!',
  'UUU-AAA-AAA!',
  'PASSA O PIX!',
  'VOO LIVRE!',
  'SEGURA O MICO!',
  'BANANAAA!',
];

export const CITY_SIGNS = [
  'DEVAGAR',
  'MICO NO AR',
  'ZONA DO PIX',
  'SEM FREIO',
  'CUIDADO COCO',
];
