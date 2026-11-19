import type { EnemyKind, MaterialKind, MaterialSpec, MonkeyKind, MonkeySpec } from './types';

export const WORLD_GRAVITY_Y = -10.5;
export const SLING_POS = { x: 4.8, y: 2.85 };
export const MAX_PULL_DISTANCE = 2.65;
export const MIN_PULL_DISTANCE = 0.45;
export const LAUNCH_VEL_SCALE = 8.4;

export const WORLD_MIN_X = -5;
export const WORLD_MAX_X = 40;
export const WORLD_GROUND_Y = 0;

export const MONKEY_SPECS: Record<MonkeyKind, MonkeySpec> = {
  normal: {
    kind: 'normal',
    name: 'Macaco Normal Pistola',
    shortName: 'Pistola',
    powerLabel: 'Grito Turbo',
    description: 'Clássico surtado de faixinha vermelha. Clique no ar para dar um impulso de raiva!',
    radius: 0.46,
    density: 2.4,
    restitution: 0.36,
    primaryColor: '#b45309',
    accentColor: '#dc2626',
    battleCry: 'UUU-AAA-AAA!',
  },
  triple: {
    kind: 'triple',
    name: 'Saguis Gêmeos (Triplo)',
    shortName: 'Triplo',
    powerLabel: 'Multiplicar x3',
    description: 'Clique no ar para virar 3 saguis caóticos! Destroça vidro com 3x de dano.',
    radius: 0.36,
    density: 1.9,
    restitution: 0.42,
    primaryColor: '#0284c7',
    accentColor: '#38bdf8',
    battleCry: 'TRÊS É DEMAIS!',
  },
  bomb: {
    kind: 'bomb',
    name: 'Macaco Bomba de Coco',
    shortName: 'Bomba',
    powerLabel: 'Detonar Coco',
    description: 'Clique no ar (ou após bater) para explodir tudo num raio gigante — tritura pedra!',
    radius: 0.54,
    density: 3.1,
    restitution: 0.25,
    primaryColor: '#1f2937',
    accentColor: '#f97316',
    battleCry: 'OLHA O COCO!',
  },
  tank: {
    kind: 'tank',
    name: 'Gorila Gordo (Tank)',
    shortName: 'Gorila',
    powerLabel: 'Queda Meteoro',
    description: 'Peso-pesado! Clique no ar para despencar feito meteoro esmagando torres inteiras.',
    radius: 0.66,
    density: 4.5,
    restitution: 0.18,
    primaryColor: '#4c1d95',
    accentColor: '#a855f7',
    battleCry: 'AMASSA TUDO!',
  },
  boomerang: {
    kind: 'boomerang',
    name: 'Macaco Bumerangue',
    shortName: 'Bumerangue',
    powerLabel: 'Meia-Volta Violenta',
    description: 'Clique no ar para dar meia-volta ninja e acertar o castelo pelas costas!',
    radius: 0.45,
    density: 2.3,
    restitution: 0.38,
    primaryColor: '#15803d',
    accentColor: '#84cc16',
    battleCry: 'PEGUEI POR TRÁS!',
  },
};

export const MATERIAL_SPECS: Record<MaterialKind, MaterialSpec> = {
  glass: {
    kind: 'glass',
    label: 'Vidro',
    hp: 25,
    density: 0.85,
    friction: 0.35,
    restitution: 0.2,
    impulseThreshold: 1.8,
    scoreValue: 500,
  },
  wood: {
    kind: 'wood',
    label: 'Madeira',
    hp: 62,
    density: 1.35,
    friction: 0.58,
    restitution: 0.14,
    impulseThreshold: 3.4,
    scoreValue: 700,
  },
  stone: {
    kind: 'stone',
    label: 'Pedra',
    hp: 155,
    density: 2.65,
    friction: 0.72,
    restitution: 0.08,
    impulseThreshold: 6.2,
    scoreValue: 1100,
  },
  tnt: {
    kind: 'tnt',
    label: 'Barril de TNT',
    hp: 14,
    density: 1.05,
    friction: 0.55,
    restitution: 0.16,
    impulseThreshold: 1.6,
    scoreValue: 1800,
  },
};

export interface EnemySpec {
  kind: EnemyKind;
  name: string;
  radius: number;
  hp: number;
  density: number;
  scoreValue: number;
}

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  porco: {
    kind: 'porco',
    name: 'Porco Faria Limer',
    radius: 0.5,
    hp: 28,
    density: 1.2,
    scoreValue: 5000,
  },
  tatu: {
    kind: 'tatu',
    name: 'Tatu Ladrão de Banana',
    radius: 0.48,
    hp: 46,
    density: 1.5,
    scoreValue: 6500,
  },
  boss_porco: {
    kind: 'boss_porco',
    name: 'Porco CEO da Faria Lima',
    radius: 0.76,
    hp: 82,
    density: 1.8,
    scoreValue: 12000,
  },
};

export const ENEMY_DEFEAT_QUOTES = [
  'MEU DIVIDENDO!',
  'CADÊ O PIX?!',
  'MINDSET QUEBRADO!',
  'CALL DE EMERGÊNCIA!',
  'DESBANANADO!',
  'SOCORRO RH!',
  'FALIU O CNPJ!',
  'PERDI O COLETE!',
];

export const MONKEY_TAUNTS = [
  '🍌 Segura essa banana, Faria Limer!',
  '💥 Hoje tem churrasco de porco!',
  '🎯 Mira de milhões!',
  '🦍 Chama o síndico que a torre caiu!',
  '😂 Errou feio, macaco vesgo!',
];
