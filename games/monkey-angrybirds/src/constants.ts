import type { EnemyKind, MaterialKind, MaterialSpec, MonkeyKind, MonkeySpec, TauntSoundKind } from './types';

export const WORLD_GRAVITY_Y = -10.5;
export const SLING_POS = { x: 4.8, y: 2.85 };
export const MAX_PULL_DISTANCE = 2.65;
export const MIN_PULL_DISTANCE = 0.45;
export const LAUNCH_VEL_SCALE = 8.4;

export const WORLD_MIN_X = -5;
export const WORLD_MAX_X = 42;
export const WORLD_GROUND_Y = 0;

export const MONKEY_SPECS: Record<MonkeyKind, MonkeySpec> = {
  normal: {
    kind: 'normal',
    emoji: '😤',
    name: 'Macaco Normal Pistola',
    shortName: 'Pistola',
    powerLabel: 'Grito Turbo',
    hudPowerHint: 'Clique no ar: Grito de raiva turbo!',
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
    emoji: '🐒',
    name: 'Saguis Gêmeos (Triplo)',
    shortName: 'Triplo',
    powerLabel: 'Multiplicar x3',
    hudPowerHint: 'Clique no ar: Divide em 3!',
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
    emoji: '💣',
    name: 'Macaco Bomba de Coco',
    shortName: 'Bomba',
    powerLabel: 'Detonar Coco',
    hudPowerHint: 'Clique no ar (ou após bater): Explode tudo!',
    description: 'Clique no ar (ou após bater) para explodir tudo num raio gigante — tritura pedra!',
    radius: 0.54,
    density: 3.1,
    restitution: 0.25,
    primaryColor: '#1f2937',
    accentColor: '#f97316',
    battleCry: 'OLHA A EXPLOSÃO!',
  },
  tank: {
    kind: 'tank',
    emoji: '🦍',
    name: 'Gorila Gordo (Tank)',
    shortName: 'Gorila',
    powerLabel: 'Queda Meteoro',
    hudPowerHint: 'Clique no ar: Despenca esmagando tudo!',
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
    emoji: '🪃',
    name: 'Macaco Bumerangue',
    shortName: 'Bumerangue',
    powerLabel: 'Meia-Volta Violenta',
    hudPowerHint: 'Clique no ar: Volta igual bumerangue!',
    description: 'Clique no ar para dar meia-volta ninja e acertar o castelo pelas costas!',
    radius: 0.45,
    density: 2.3,
    restitution: 0.38,
    primaryColor: '#15803d',
    accentColor: '#84cc16',
    battleCry: 'PEGUEI POR TRÁS!',
  },
  bomber: {
    kind: 'bomber',
    emoji: '🥥',
    name: 'Macaco Ovo-de-Coco',
    shortName: 'Ovo-Coco',
    powerLabel: 'Bombardeio de Coco',
    hudPowerHint: 'Clique no ar: Solta coco explosivo pra baixo e sobe!',
    description: 'Aviador maluco! Clique no ar para soltar um coco explosivo pra baixo e subir pro alto!',
    radius: 0.48,
    density: 2.35,
    restitution: 0.34,
    primaryColor: '#e2e8f0',
    accentColor: '#f59e0b',
    battleCry: 'BOMBA DE COCO!',
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
  boss_helmet: {
    kind: 'boss_helmet',
    name: 'Porco CEO de Capacete',
    radius: 0.78,
    hp: 115,
    density: 2.0,
    scoreValue: 16000,
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

export interface QuickTaunt {
  label: string;
  text: string;
  sound: TauntSoundKind;
}

export const QUICK_TAUNTS: QuickTaunt[] = [
  { label: '😂 Vesgo!', text: '😂 Errou feio, macaco vesgo!', sound: 'boing' },
  { label: '🍌 Banana!', text: '🍌 Segura essa banana, Faria Limer!', sound: 'banana' },
  { label: '💥 Churrasco!', text: '💥 Hoje tem churrasco de porco!', sound: 'screech' },
  { label: '🎯 Milhões!', text: '🎯 Mira de milhões! Aprende aí!', sound: 'slap' },
  { label: '🦍 Síndico!', text: '🦍 Chama o síndico que o condomínio caiu!', sound: 'rage' },
];

export const MONKEY_TAUNTS = QUICK_TAUNTS.map((t) => t.text);
