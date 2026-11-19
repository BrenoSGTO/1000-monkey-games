import type { MonkeyColor, ToolKind, UpgradeOption } from './types';

export const GRID_COLS = 28;
export const GRID_ROWS = 18;

export const DAY_DURATION_SEC = 13;
export const DAYS_PER_WEEK = 7;

export const WEEKDAY_NAMES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const;

export interface ColorTheme {
  id: MonkeyColor;
  label: string;
  fruitEmoji: string;
  fill: string;
  dark: string;
  light: string;
  roof: string;
  glow: string;
}

export const MONKEY_COLORS: Record<MonkeyColor, ColorTheme> = {
  yellow: {
    id: 'yellow',
    label: 'Banana Ouro',
    fruitEmoji: '🍌',
    fill: '#facc15',
    dark: '#a16207',
    light: '#fef08a',
    roof: '#eab308',
    glow: 'rgba(250, 204, 21, 0.45)',
  },
  red: {
    id: 'red',
    label: 'Açaí Turbinado',
    fruitEmoji: '🍓',
    fill: '#ef4444',
    dark: '#991b1b',
    light: '#fecaca',
    roof: '#dc2626',
    glow: 'rgba(239, 68, 68, 0.45)',
  },
  blue: {
    id: 'blue',
    label: 'Coco Gelado',
    fruitEmoji: '🥥',
    fill: '#38bdf8',
    dark: '#0369a1',
    light: '#bae6fd',
    roof: '#0284c7',
    glow: 'rgba(56, 189, 248, 0.45)',
  },
  purple: {
    id: 'purple',
    label: 'Uva Maluca',
    fruitEmoji: '🍇',
    fill: '#a855f7',
    dark: '#6b21a8',
    light: '#e9d5ff',
    roof: '#9333ea',
    glow: 'rgba(168, 85, 247, 0.45)',
  },
  green: {
    id: 'green',
    label: 'Abacate Zen',
    fruitEmoji: '🥑',
    fill: '#22c55e',
    dark: '#166534',
    light: '#bbf7d0',
    roof: '#16a34a',
    glow: 'rgba(34, 197, 94, 0.45)',
  },
};

export const COLOR_UNLOCK_ORDER: MonkeyColor[] = ['yellow', 'red', 'blue', 'purple', 'green'];

export const MARKET_NAMES: Record<MonkeyColor, string[]> = {
  yellow: ['Feira da Banana', 'Quitanda Bananão', 'Atacadão Chimp'],
  red: ['Açaí do Morrote', 'Point do Morango', 'Empório Rubro'],
  blue: ['Quiosque do Coco', 'Geladinho Azul', 'Água de Cipó'],
  purple: ['Banca da Jabuticaba', 'Uva da Selva', 'Adega Símia'],
  green: ['Mercadão Abacate', 'Hortifruti Selva', 'Verde Macaco'],
};

export const RAGE_EMOJIS = ['🤬', '🍌', '💩', '💢', '🐒', '📢'];

export const RAGE_QUIPS = [
  'ANDA LOGO!!',
  'CADÊ O DETRAN?!',
  'BUZINA MAIS!',
  'TRÂNSITO DE BANANA!',
  'PREFEITO CALVO!',
  'SÓ QUERO MEU AÇAÍ!',
  'ENGARRAFAMENTO MONSTRO!',
  'VOU JOGAR COCO!',
];

export const TOOL_META: Record<ToolKind, { label: string; hotkey: string; icon: string; desc: string }> = {
  road: {
    label: 'Estrada',
    hotkey: '1',
    icon: '🛣️',
    desc: 'Arraste para traçar estradas e pontes sobre rios',
  },
  light: {
    label: 'Semáforo',
    hotkey: '2',
    icon: '🚦',
    desc: 'Clique em cruzamentos para organizar o fluxo',
  },
  roundabout: {
    label: 'Rotatória',
    hotkey: '3',
    icon: '🔄',
    desc: 'Clique em um nó de estrada para criar rotatória',
  },
  motorway: {
    label: 'Cipó Express',
    hotkey: '4',
    icon: '🌿',
    desc: 'Arraste de um ponto a outro por cima de tudo!',
  },
  erase: {
    label: 'Borracha',
    hotkey: '5',
    icon: '🧹',
    desc: 'Clique/arraste para apagar e recuperar peças (ou botão direito)',
  },
};

export const UPGRADE_POOL: Omit<UpgradeOption, 'id'>[] = [
  {
    title: 'Kit Bambu na Água',
    subtitle: '+22 Estradas • +1 Ponte de Bambu',
    emoji: '🌉',
    roads: 22,
    bridges: 1,
    lights: 0,
    roundabouts: 0,
    motorways: 0,
  },
  {
    title: 'Pacote DETRAN da Selva',
    subtitle: '+18 Estradas • +2 Semáforos',
    emoji: '🚦',
    roads: 18,
    bridges: 0,
    lights: 2,
    roundabouts: 0,
    motorways: 0,
  },
  {
    title: 'Girador de Cabeça',
    subtitle: '+16 Estradas • +1 Rotatória',
    emoji: '🔄',
    roads: 16,
    bridges: 0,
    lights: 0,
    roundabouts: 1,
    motorways: 0,
  },
  {
    title: 'Via Expressa de Cipó',
    subtitle: '+12 Estradas • +1 Cipó Express',
    emoji: '🌿',
    roads: 12,
    bridges: 0,
    lights: 0,
    roundabouts: 0,
    motorways: 1,
  },
  {
    title: 'Mutirão do Asfalto',
    subtitle: '+30 Estradas (Piche de Banana)',
    emoji: '🛣️',
    roads: 30,
    bridges: 0,
    lights: 0,
    roundabouts: 0,
    motorways: 0,
  },
];
