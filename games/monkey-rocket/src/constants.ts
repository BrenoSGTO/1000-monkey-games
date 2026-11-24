import type { CarId, CarSpec, ThemeId, ThemeSpec } from './types';

export const SLUG = 'monkey-rocket';
export const TITLE = 'Rocket Macaco League';

// ---------- Arena (metros, y para cima) ----------
export const ARENA = {
  W: 90,
  H: 46,
  HW: 45,
  GOAL_H: 10.5,
  GOAL_D: 7.5,
  CORNER_R: 10,
};

export const GRAVITY = -38;
export const BALL_R = 2.2;
export const FIXED_DT = 1 / 60;

export const BOOST_START = 34;
export const BOOST_USE = 30;
export const BOOST_SMALL = 14;
export const BOOST_BIG = 100;
export const PAD_RESPAWN_SMALL = 4;
export const PAD_RESPAWN_BIG = 9;

export const GOAL_DUR = 2.8;
export const REPLAY_DUR = 5.0;
export const COUNTDOWN_DUR = 3.2;
export const REPLAY_CLIP_BEFORE = 3.6;
export const REPLAY_CLIP_AFTER = 0.6;
export const GOAL_SLOWMO = 0.38;

export interface PadSpec {
  x: number;
  y: number;
  big: boolean;
  /** -1 = chao, 1 = teto */
  side: 1 | -1;
}

export const PADS: PadSpec[] = [
  { x: -39, y: 0.4, big: true, side: -1 },
  { x: 39, y: 0.4, big: true, side: -1 },
  { x: -30, y: 0.4, big: false, side: -1 },
  { x: 30, y: 0.4, big: false, side: -1 },
  { x: -20, y: 0.4, big: false, side: -1 },
  { x: 20, y: 0.4, big: false, side: -1 },
  { x: -10, y: 0.4, big: false, side: -1 },
  { x: 10, y: 0.4, big: false, side: -1 },
  { x: 0, y: 0.4, big: false, side: -1 },
  { x: -24, y: ARENA.H - 0.4, big: true, side: 1 },
  { x: 24, y: ARENA.H - 0.4, big: true, side: 1 },
];

export const CARS: Record<CarId, CarSpec> = {
  fusca: {
    id: 'fusca',
    name: 'Fusca',
    tagline: 'Equilibrado e simpático. Besouro dos campeões.',
    length: 4.6,
    cabinL: 2.5,
    cabinOff: -0.15,
    density: 2.0,
    accel: 30,
    boostAccel: 54,
    topSpeed: 30,
    boostTop: 47,
    jumpV: 14.5,
    turn: 6.4,
  },
  kombi: {
    id: 'kombi',
    name: 'Kombi',
    tagline: 'Pesadona: a bola vira bomba. Lenta pra virar.',
    length: 5.2,
    cabinL: 4.3,
    cabinOff: 0.0,
    density: 2.5,
    accel: 25,
    boostAccel: 50,
    topSpeed: 27,
    boostTop: 44,
    jumpV: 13.5,
    turn: 5.2,
  },
  brasilia: {
    id: 'brasilia',
    name: 'Brasília',
    tagline: 'Veloz e amarela. Dirige igual quem tá atrasado.',
    length: 4.9,
    cabinL: 2.7,
    cabinOff: -0.25,
    density: 1.9,
    accel: 34,
    boostAccel: 56,
    topSpeed: 33,
    boostTop: 50,
    jumpV: 14.5,
    turn: 6.6,
  },
  uno: {
    id: 'uno',
    name: 'Uno c/ Escada',
    tagline: 'Ágil e pulão. A escada no teto é de enfeite (ou não).',
    length: 4.2,
    cabinL: 2.7,
    cabinOff: -0.1,
    density: 1.8,
    accel: 31,
    boostAccel: 53,
    topSpeed: 30,
    boostTop: 46,
    jumpV: 15.5,
    turn: 8.0,
  },
};

export const CAR_ORDER: CarId[] = ['fusca', 'kombi', 'brasilia', 'uno'];

// Geometria comum do carro (metros, coordenadas de arte com y para baixo).
export const CAR_GEO = {
  wheelR: 0.56,
  wheelY: 0.48,
  wheelX: 0.31,
  chassisTop: -0.15,
  chassisBottom: 0.62,
  cabinTop: -1.12,
  bottom: 1.04,
};

export const TEAM_COLORS = [
  { main: '#38bdf8', dark: '#0369a1', light: '#bae6fd', name: 'MACACOS AZUIS' },
  { main: '#fb923c', dark: '#c2410c', light: '#fed7aa', name: 'MACACOS LARANJAS' },
];

export const FURS = [
  { fur: '#8b5a2b', dark: '#5b3a1a', face: '#efcfa6', name: 'Marrom' },
  { fur: '#d9a441', dark: '#a8741a', face: '#fbe7b5', name: 'Dourado' },
  { fur: '#6b7280', dark: '#374151', face: '#d1d5db', name: 'Cinza' },
  { fur: '#2a2522', dark: '#0f0c0b', face: '#b5a89c', name: 'Preto' },
  { fur: '#c2410c', dark: '#7c2d12', face: '#fdba74', name: 'Laranja' },
  { fur: '#f1ece4', dark: '#b9b0a3', face: '#ffd9c2', name: 'Branco' },
];

export const THEMES: Record<ThemeId, ThemeSpec> = {
  selva: {
    id: 'selva',
    name: 'Estádio da Selva',
    sub: 'Cipó, bromélia e muita bagunça.',
    gravityScale: 1,
    skyTop: '#052e16',
    skyBottom: '#166534',
    wallTop: '#14532d',
    wallBottom: '#0f3d22',
    floor: '#16a34a',
    floorStripe: '#22c55e',
    floorEdge: '#052e16',
    line: 'rgba(255,255,255,0.35)',
    ads: ['BANANA CUP', 'GUARANÁ TURBO', 'MACACO SEGURO', 'CIPÓ & CIA', 'COCO GELADO', 'FUSCA FC'],
    crowdTint: 'rgba(5,46,22,0.38)',
  },
  praia: {
    id: 'praia',
    name: 'Arena Copa-Banana',
    sub: 'Pôr do sol, areia e coco de praia.',
    gravityScale: 1,
    skyTop: '#7c2d12',
    skyBottom: '#f59e0b',
    wallTop: '#7e22ce',
    wallBottom: '#be185d',
    floor: '#fcd34d',
    floorStripe: '#fbbf24',
    floorEdge: '#92400e',
    line: 'rgba(255,255,255,0.45)',
    ads: ['ÁGUA DE COCO', 'PROTETOR SOLAR', 'MATE GELADO', 'BIQUÍNI DE BANANA', 'FUSCA SURF', 'PASTEL & CALDO'],
    crowdTint: 'rgba(80,10,70,0.30)',
  },
  lua: {
    id: 'lua',
    name: 'Estação Banana-Lunar',
    sub: 'Gravidade baixa. Macaco no espaço!',
    gravityScale: 0.62,
    skyTop: '#020617',
    skyBottom: '#312e81',
    wallTop: '#1e1b4b',
    wallBottom: '#172554',
    floor: '#94a3b8',
    floorStripe: '#a5b4c8',
    floorEdge: '#1e293b',
    line: 'rgba(165,243,252,0.45)',
    ads: ['FOGUETE & CIA', 'PLANETA BANANA', 'ASTRO-COCO', 'LUA DE MEL', 'MARTE BAR', 'SPUTNIK 2'],
    crowdTint: 'rgba(15,23,42,0.35)',
  },
};

export const THEME_ORDER: ThemeId[] = ['selva', 'praia', 'lua'];

export const BOT_NAMES = [
  'Chico Gol', 'Mico Leão', 'Sagui Turbo', 'Bonobo Bola', 'Gorila Zagueiro', 'Babuíno Veloz',
  'Capivara?', 'Macaco Prego', 'Zé Caiçara', 'Orango Tango',
];

export const BOT_LEVEL_NAMES = ['Banana-mole', 'Macaco Esperto', 'Gorila Furioso'];

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
