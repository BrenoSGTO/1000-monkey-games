import type { BuildingShape, MonkeyColor, ToolKind, UpgradeOption } from './types';

export const GRID_COLS = 28;
export const GRID_ROWS = 18;

export const DAY_DURATION_SEC = 13;
export const DAYS_PER_WEEK = 7;

export const WEEKDAY_NAMES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const;

export const DELIVERY_MILESTONES = [100, 250, 500, 1000] as const;

export interface ColorTheme {
  id: MonkeyColor;
  label: string;
  fruitEmoji: string;
  shape: BuildingShape;
  shapeLabel: string;
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
    shape: 'circle',
    shapeLabel: '●',
    fill: '#facc15',
    dark: '#a16207',
    light: '#fef08a',
    roof: '#eab308',
    glow: 'rgba(250, 204, 21, 0.45)',
  },
  red: {
    id: 'red',
    label: 'Manga Rubra',
    fruitEmoji: '🥭',
    shape: 'diamond',
    shapeLabel: '◆',
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
    shape: 'hex',
    shapeLabel: '⬡',
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
    shape: 'pentagon',
    shapeLabel: '▲',
    fill: '#a855f7',
    dark: '#6b21a8',
    light: '#e9d5ff',
    roof: '#9333ea',
    glow: 'rgba(168, 85, 247, 0.45)',
  },
  green: {
    id: 'green',
    label: 'Melancia Zen',
    fruitEmoji: '🍉',
    shape: 'octagon',
    shapeLabel: '■',
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
  red: ['Empório da Manga', 'Point Rubro', 'Barraca Manga Rosa'],
  blue: ['Quiosque do Coco', 'Geladinho Azul', 'Água de Cipó'],
  purple: ['Banca da Uva', 'Parreiral da Selva', 'Adega Símia'],
  green: ['Mercadão Melancia', 'Hortifruti Selva', 'Verde Macaco'],
};

export const RAGE_EMOJIS = ['🤬', '🍌', '💩', '💢', '🐒', '📢'];

export const RAGE_BUBBLES = [
  '📢 BIIIP!',
  '🤬 ANDA LOGO!',
  '🐒 CADÊ O DETRAN?!',
  '🍌 SEM BANANA!',
  '💢 TRAVOU TUDO!',
  '🥥 VOU JOGAR COCO!',
  '🚧 PREFEITO CALVO!',
  '🔥 HORA DO RUSH!',
];

export const PING_PRESETS = [
  { id: 'jam', emoji: '🚨', text: 'Engarrafou aqui!', short: 'Engarrafou!' },
  { id: 'bridge', emoji: '🌉', text: 'Precisa de ponte!', short: 'Ponte!' },
  { id: 'roundabout', emoji: '🔄', text: 'Põe rotatória!', short: 'Rotatória!' },
  { id: 'nice', emoji: '👏', text: 'Boa!', short: 'Boa!' },
] as const;

export const TOOL_META: Record<ToolKind, { label: string; hotkey: string; icon: string; desc: string }> = {
  road: {
    label: 'Estrada',
    hotkey: '1',
    icon: '🛣️',
    desc: 'Arraste para pré-visualizar e solte para construir (Ctrl+Z desfaz)',
  },
  light: {
    label: 'Semáforo',
    hotkey: '2',
    icon: '🚦',
    desc: 'Clique em cruzamentos para alternar o fluxo entre direções',
  },
  roundabout: {
    label: 'Rotatória',
    hotkey: '3',
    icon: '🔄',
    desc: 'Clique em um nó de estrada para fluxo circular sem paradas',
  },
  motorway: {
    label: 'Cipó Express',
    hotkey: '4',
    icon: '🌿',
    desc: 'Arraste de um ponto a outro por cima de rios, prédios e trânsito!',
  },
  erase: {
    label: 'Borracha',
    hotkey: '5',
    icon: '🧹',
    desc: 'Clique/arraste para apagar e recuperar peças (ou botão direito)',
  },
  ping: {
    label: 'Pingar',
    hotkey: 'P',
    icon: '📣',
    desc: 'Clique no mapa ou aperte P no cursor para mandar um alerta rápido!',
  },
};

export const UPGRADE_POOL: Omit<UpgradeOption, 'id'>[] = [
  {
    title: 'Kit Bambu na Água',
    subtitle: '+22 Estradas • +1 Ponte de Bambu',
    description: 'Estradas ligam casas aos mercados. Pontes de Bambu cruzam rios e canais (1 ponte por quadrante de água).',
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
    description: 'Semáforos organizam cruzamentos movimentados, alternando verde/vermelho para evitar colisões e filas.',
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
    description: 'Rotatórias mantêm os carros girando continuamente sem sinal vermelho — perfeito para avenidas centrais!',
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
    description: 'Cipó Express cria uma ponte aérea super rápida por cima de tudo: rios, prédios e engarrafamentos!',
    emoji: '🌿',
    roads: 12,
    bridges: 0,
    lights: 0,
    roundabouts: 0,
    motorways: 1,
  },
  {
    title: 'Mutirão do Asfalto',
    subtitle: '+32 Estradas (Piche de Banana)',
    description: 'Estoque massivo de asfalto para expandir bairros novos e criar desvios paralelos longe do rush!',
    emoji: '🛣️',
    roads: 32,
    bridges: 0,
    lights: 0,
    roundabouts: 0,
    motorways: 0,
  },
];
