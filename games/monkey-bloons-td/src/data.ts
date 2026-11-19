import type { BloonDef, BloonType, MapConfig, MapId, TowerDef, TowerType } from './types';

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 600;
export const STARTING_BANANAS = 380;
export const STARTING_LIVES = 25;
export const TRACK_HALF_WIDTH = 26;
export const TOWER_RADIUS = 20;

export const MAPS: Record<MapId, MapConfig> = {
  selva: {
    id: 'selva',
    name: 'Selva do Trânsito',
    subtitle: 'Curvas fechadas, semáforo quebrado e macaco sem CNH',
    themeBg: '#1c4d2b',
    themeGrassAlt: '#215932',
    roadOuter: '#78350f',
    roadInner: '#b45309',
    roadStripe: '#fef3c7',
    waypoints: [
      { x: -30, y: 120 },
      { x: 220, y: 120 },
      { x: 220, y: 470 },
      { x: 430, y: 470 },
      { x: 430, y: 120 },
      { x: 660, y: 120 },
      { x: 660, y: 440 },
      { x: 850, y: 440 },
      { x: 850, y: 240 },
      { x: 990, y: 240 },
    ],
    props: [
      { kind: 'tree', x: 85, y: 250, scale: 1.1 },
      { kind: 'tree', x: 115, y: 480, scale: 1.25 },
      { kind: 'tree', x: 325, y: 280, scale: 0.95 },
      { kind: 'tree', x: 545, y: 310, scale: 1.15 },
      { kind: 'tree', x: 760, y: 95, scale: 1.1 },
      { kind: 'tree', x: 895, y: 535, scale: 1.2 },
      { kind: 'cone', x: 265, y: 155 },
      { kind: 'cone', x: 385, y: 435 },
      { kind: 'cone', x: 705, y: 405 },
      { kind: 'sign', x: 108, y: 65, label: 'SEM CNH!' },
      { kind: 'sign', x: 545, y: 68, label: 'RADAR 20km' },
      { kind: 'puddle', x: 325, y: 535, scale: 1.1 },
      { kind: 'puddle', x: 755, y: 230, scale: 0.9 },
    ],
  },
  feira: {
    id: 'feira',
    name: 'Feira da Banana',
    subtitle: 'Espiral caótica entre barracas de pastel e caldo de cana',
    themeBg: '#3b4a1e',
    themeGrassAlt: '#445623',
    roadOuter: '#57534e',
    roadInner: '#a8a29e',
    roadStripe: '#fde047',
    waypoints: [
      { x: -30, y: 85 },
      { x: 840, y: 85 },
      { x: 840, y: 515 },
      { x: 120, y: 515 },
      { x: 120, y: 195 },
      { x: 710, y: 195 },
      { x: 710, y: 405 },
      { x: 255, y: 405 },
      { x: 255, y: 300 },
      { x: 495, y: 300 },
      { x: 495, y: -35 },
    ],
    props: [
      { kind: 'stall', x: 75, y: 360, color: '#ef4444', label: 'PASTEL' },
      { kind: 'stall', x: 905, y: 290, color: '#38bdf8', label: 'CALDO' },
      { kind: 'stall', x: 605, y: 565, color: '#facc15', label: 'BANANA' },
      { kind: 'crate', x: 360, y: 138 },
      { kind: 'crate', x: 775, y: 310 },
      { kind: 'crate', x: 185, y: 455 },
      { kind: 'tree', x: 910, y: 550, scale: 1.0 },
      { kind: 'tree', x: 55, y: 555, scale: 1.05 },
      { kind: 'sign', x: 600, y: 285, label: 'FIADO NÃO' },
    ],
  },
};

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  banana: {
    type: 'banana',
    name: 'Macaco Arremessador de Banana',
    shortName: 'Arremessador',
    emoji: '🍌',
    hotkey: '1',
    cost: 100,
    range: 135,
    fireRate: 1.65,
    damage: 1,
    color: '#facc15',
    description: 'Barato e rápido. Arremessa bananas tortas com muita má vontade.',
    detectsCamo: false,
    popsLead: false,
    upgrades: [
      {
        name: 'Banana Madura',
        cost: 90,
        description: 'Bananas mais pesadas: +1 dano e +25% velocidade de ataque.',
        quip: 'TA MADURA E ESCORREGADIA!',
      },
      {
        name: 'Cacho Metralhadora',
        cost: 190,
        description: 'Atira 2 bananas por rajada muito mais rápido e enxerga Camuflados!',
        quip: 'RAJADA DE POTÁSSIO!',
      },
      {
        name: 'Macaco Calvo Furioso',
        cost: 420,
        description: 'Fica careca de raiva! Metralha 3 bananas flamejantes que derretem até Chumbo!',
        quip: 'CALVO FURIOSO ATIVADO!!',
      },
    ],
  },
  havaianas: {
    type: 'havaianas',
    name: 'Macaco do Chinelo Havaianas',
    shortName: 'Chinelo',
    emoji: '🩴',
    hotkey: '2',
    cost: 175,
    range: 145,
    fireRate: 0.95,
    damage: 2,
    color: '#38bdf8',
    description: 'Chinelada pesada que empurra as bexigas pra trás e deixa elas tontas.',
    detectsCamo: false,
    popsLead: true,
    upgrades: [
      {
        name: 'Solado Reforçado',
        cost: 130,
        description: 'Dano 3, empurrão maior e deixa bexigas lentas por mais tempo.',
        quip: 'BORRACHA LEGÍTIMA!',
      },
      {
        name: 'Chinelo Teleguiado da Mãe',
        cost: 270,
        description: 'Faz curva, persegue as bexigas, acerta Camuflado e ricocheteia em 2 alvos!',
        quip: 'CORRE NÃO QUE O CHINELO FAZ CURVA!',
      },
      {
        name: 'Havaianas de Pau Suprema',
        cost: 490,
        description: 'Ricocheteia em 4 alvos com 35% de chance de CHINELADA CRÍTICA (2x dano)!',
        quip: 'CHINELADA CRÍTICA!!',
      },
    ],
  },
  sniper: {
    type: 'sniper',
    name: 'Chimpanzé Sniper Vesgo',
    shortName: 'Sniper Vesgo',
    emoji: '🎯',
    hotkey: '3',
    cost: 260,
    range: 1400,
    fireRate: 0.62,
    damage: 5,
    color: '#fb7185',
    description: 'Alcance no mapa TODO! Erra 12% dos tiros por ser vesgo, mas acerta CRÍTICO explosivo!',
    detectsCamo: false,
    popsLead: false,
    upgrades: [
      {
        name: 'Luneta de Garrafa PET',
        cost: 160,
        description: 'Atira mais rápido, dano 7 e enxerga bexigas Camufladas!',
        quip: 'COM FUNDO DE GARRAFA EU VEJO TUDO!',
      },
      {
        name: 'Caroço de Jaca Perfurante',
        cost: 300,
        description: 'Dano 12 que atravessa Bexiga de Chumbo e arrebenta camadas!',
        quip: 'BALA DE JACA DURA!',
      },
      {
        name: 'Sniper Vesgo Lendário',
        cost: 560,
        description: 'Ainda erra 12%, mas cada acerto causa explosão em área com tela tremendo!',
        quip: 'HEADSHOT VESGO EXPLOSIVO!',
      },
    ],
  },
  coco: {
    type: 'coco',
    name: 'Canhão de Coco Podre',
    shortName: 'Coco Podre',
    emoji: '🥥',
    hotkey: '4',
    cost: 290,
    range: 175,
    fireRate: 0.72,
    damage: 2,
    color: '#4ade80',
    description: 'Explosão em área com fumaça verde tóxica. Quebra Chumbo na hora!',
    detectsCamo: false,
    popsLead: true,
    upgrades: [
      {
        name: 'Coco Fermentado',
        cost: 170,
        description: 'Explosão maior e nuvem tóxica que dá dano contínuo por 2.8s.',
        quip: 'CHEIRO DE CHORUME DE FEIRA!',
      },
      {
        name: 'Morteiro do Lixão',
        cost: 320,
        description: 'Mais alcance, explosão dano 4 e a fumaça verde desacelera as bexigas.',
        quip: 'AGORA FEDE EM CÂMERA LENTA!',
      },
      {
        name: 'Bomba Biológica de Chorume',
        cost: 580,
        description: 'Mega nuvem radioativa que derrete ondas inteiras e fere até MOABs!',
        quip: 'CHERNOBYL DE COCO PODRE!',
      },
    ],
  },
  dj: {
    type: 'dj',
    name: 'Macaco DJ de Caixa JBL',
    shortName: 'DJ JBL',
    emoji: '🔊',
    hotkey: '5',
    cost: 240,
    range: 145,
    fireRate: 0.9,
    damage: 0,
    color: '#c084fc',
    description: 'Aumenta velocidade das torres próximas (+20%) e solta grave que desacelera bexigas.',
    detectsCamo: true,
    popsLead: false,
    upgrades: [
      {
        name: 'Grave Estourado',
        cost: 150,
        description: 'Aura +26% atk speed, alcance maior e tira óculos das bexigas Camufladas!',
        quip: 'TIRA O ÓCULOS NO PANCADÃO!',
      },
      {
        name: 'Pancadão Automotivo',
        cost: 290,
        description: 'Buff de +35% atk speed e +15% alcance nas torres! Grave dá dano leve.',
        quip: 'TREME O VIDRO DO CELTA!',
      },
      {
        name: 'Trio Elétrico da Macacada',
        cost: 540,
        description: 'Buff insano de +50% atk speed e ondas sonoras empurram todas as bexigas!',
        quip: 'SOU O TERROR DO SÍNDICO!',
      },
    ],
  },
};

export const TOWER_ORDER: TowerType[] = ['banana', 'havaianas', 'sniper', 'coco', 'dj'];

export const BLOON_DEFS: Record<BloonType, BloonDef> = {
  red: {
    type: 'red',
    name: 'Bexiga Vermelha',
    hp: 1,
    speed: 60,
    radius: 14,
    color: '#ef4444',
    outline: '#7f1d1d',
    reward: 2,
    livesDamage: 1,
    children: [],
  },
  blue: {
    type: 'blue',
    name: 'Bexiga Azul',
    hp: 1,
    speed: 78,
    radius: 15,
    color: '#3b82f6',
    outline: '#1e3a8a',
    reward: 2,
    livesDamage: 2,
    children: ['red'],
  },
  green: {
    type: 'green',
    name: 'Bexiga Verde',
    hp: 1,
    speed: 96,
    radius: 16,
    color: '#22c55e',
    outline: '#14532d',
    reward: 3,
    livesDamage: 3,
    children: ['blue'],
  },
  yellow: {
    type: 'yellow',
    name: 'Bexiga Amarela',
    hp: 1,
    speed: 132,
    radius: 16,
    color: '#facc15',
    outline: '#854d0e',
    reward: 3,
    livesDamage: 4,
    children: ['green'],
  },
  pink: {
    type: 'pink',
    name: 'Bexiga Rosa Turbo',
    hp: 1,
    speed: 170,
    radius: 15,
    color: '#ec4899',
    outline: '#831843',
    reward: 4,
    livesDamage: 5,
    children: ['yellow'],
  },
  camo: {
    type: 'camo',
    name: 'Camuflada de Óculos',
    hp: 2,
    speed: 118,
    radius: 17,
    color: '#65a30d',
    outline: '#1a2e05',
    reward: 6,
    livesDamage: 5,
    children: ['pink'],
    isCamo: true,
  },
  lead: {
    type: 'lead',
    name: 'Bexiga de Chumbo',
    hp: 3,
    speed: 62,
    radius: 18,
    color: '#64748b',
    outline: '#0f172a',
    reward: 8,
    livesDamage: 6,
    children: ['green', 'green'],
    isLead: true,
  },
  moab: {
    type: 'moab',
    name: 'DIRIGÍVEL DO IMPOSTO DE RENDA',
    hp: 95,
    speed: 33,
    radius: 34,
    color: '#0284c7',
    outline: '#0c4a6e',
    reward: 75,
    livesDamage: 15,
    children: ['pink', 'pink', 'pink', 'camo', 'lead'],
    isBoss: true,
  },
  zepelim: {
    type: 'zepelim',
    name: 'ZEPELIM DA RECEITA FEDERAL',
    hp: 460,
    speed: 24,
    radius: 44,
    color: '#dc2626',
    outline: '#450a0a',
    reward: 220,
    livesDamage: 99,
    children: ['moab', 'moab', 'pink', 'pink', 'camo', 'lead'],
    isBoss: true,
  },
};

export interface WaveGroup {
  type: BloonType;
  count: number;
  interval: number;
  delayAfter?: number;
}

export interface WaveSpec {
  wave: number;
  title: string;
  bonusBananas: number;
  groups: WaveGroup[];
  bossBanner?: string;
}

const CURATED_WAVES: WaveSpec[] = [
  {
    wave: 1,
    title: 'As Primeiras Bexigas Folgadas',
    bonusBananas: 45,
    groups: [{ type: 'red', count: 14, interval: 0.65 }],
  },
  {
    wave: 2,
    title: 'Invasão Azul & Vermelha',
    bonusBananas: 50,
    groups: [
      { type: 'red', count: 10, interval: 0.5 },
      { type: 'blue', count: 10, interval: 0.55 },
    ],
  },
  {
    wave: 3,
    title: 'Onda Verde de Zap',
    bonusBananas: 55,
    groups: [
      { type: 'blue', count: 12, interval: 0.45 },
      { type: 'green', count: 10, interval: 0.55 },
    ],
  },
  {
    wave: 4,
    title: 'Correria Amarela',
    bonusBananas: 65,
    groups: [
      { type: 'green', count: 12, interval: 0.4 },
      { type: 'yellow', count: 10, interval: 0.45 },
      { type: 'pink', count: 4, interval: 0.5 },
    ],
  },
  {
    wave: 5,
    title: 'ALERTA: LEÃO DO IMPOSTO DE RENDA!',
    bonusBananas: 110,
    bossBanner: '💼 CHEFE: DIRIGÍVEL DO IMPOSTO DE RENDA (MOAB)!',
    groups: [
      { type: 'green', count: 8, interval: 0.4, delayAfter: 1.0 },
      { type: 'moab', count: 1, interval: 1.0, delayAfter: 1.2 },
      { type: 'yellow', count: 8, interval: 0.4 },
    ],
  },
  {
    wave: 6,
    title: 'Bexigas de Óculos Escuros (Camufladas!)',
    bonusBananas: 75,
    groups: [
      { type: 'pink', count: 10, interval: 0.35 },
      { type: 'camo', count: 10, interval: 0.55 },
    ],
  },
  {
    wave: 7,
    title: 'Enxame Rosa Turbo',
    bonusBananas: 80,
    groups: [
      { type: 'yellow', count: 14, interval: 0.32 },
      { type: 'pink', count: 16, interval: 0.3 },
    ],
  },
  {
    wave: 8,
    title: 'Bexigas de Chumbo Pesadão!',
    bonusBananas: 90,
    groups: [
      { type: 'green', count: 12, interval: 0.3 },
      { type: 'lead', count: 8, interval: 0.7 },
      { type: 'camo', count: 8, interval: 0.45 },
    ],
  },
  {
    wave: 9,
    title: 'Comboio do Caos',
    bonusBananas: 100,
    groups: [
      { type: 'pink', count: 18, interval: 0.24 },
      { type: 'lead', count: 10, interval: 0.5 },
      { type: 'camo', count: 12, interval: 0.36 },
    ],
  },
  {
    wave: 10,
    title: 'FISCALIZAÇÃO DUPLA DE IRPF!',
    bonusBananas: 150,
    bossBanner: '💼🔥 ONDA 10: DOIS DIRIGÍVEIS DO IMPOSTO DE RENDA!',
    groups: [
      { type: 'pink', count: 12, interval: 0.25, delayAfter: 0.8 },
      { type: 'moab', count: 2, interval: 3.4, delayAfter: 1.0 },
      { type: 'lead', count: 8, interval: 0.45 },
    ],
  },
  {
    wave: 11,
    title: 'Bonde dos Camuflados Blindados',
    bonusBananas: 115,
    groups: [
      { type: 'camo', count: 20, interval: 0.28 },
      { type: 'lead', count: 12, interval: 0.42 },
    ],
  },
  {
    wave: 12,
    title: 'Tsunami Rosa & Amarelo',
    bonusBananas: 120,
    groups: [
      { type: 'yellow', count: 24, interval: 0.2 },
      { type: 'pink', count: 24, interval: 0.2 },
    ],
  },
  {
    wave: 13,
    title: 'Combo de Chumbo + MOAB',
    bonusBananas: 140,
    groups: [
      { type: 'lead', count: 16, interval: 0.35 },
      { type: 'moab', count: 2, interval: 2.8 },
      { type: 'camo', count: 16, interval: 0.3 },
    ],
  },
  {
    wave: 14,
    title: 'Prévia da Malha Fina',
    bonusBananas: 160,
    groups: [
      { type: 'pink', count: 28, interval: 0.16 },
      { type: 'camo', count: 18, interval: 0.25 },
      { type: 'moab', count: 3, interval: 2.5 },
    ],
  },
  {
    wave: 15,
    title: 'CHEFÃO SUPREMO: ZEPELIM DA RECEITA FEDERAL!',
    bonusBananas: 300,
    bossBanner: '🚨💸 ALERTA MÁXIMO: ZEPELIM DA RECEITA FEDERAL NA PISTA!',
    groups: [
      { type: 'camo', count: 14, interval: 0.25, delayAfter: 0.8 },
      { type: 'zepelim', count: 1, interval: 1.0, delayAfter: 1.5 },
      { type: 'lead', count: 12, interval: 0.4 },
      { type: 'moab', count: 1, interval: 1.0 },
    ],
  },
];

export function getWaveSpec(waveNum: number): WaveSpec {
  if (waveNum <= CURATED_WAVES.length) {
    return CURATED_WAVES[waveNum - 1];
  }
  const extra = waveNum - 15;
  const isZepelimWave = waveNum % 15 === 0;
  const isMoabWave = waveNum % 5 === 0;
  const groups: WaveGroup[] = [
    { type: 'pink', count: 22 + extra * 3, interval: Math.max(0.11, 0.2 - extra * 0.006) },
    { type: 'camo', count: 12 + extra * 2, interval: Math.max(0.14, 0.26 - extra * 0.006) },
    { type: 'lead', count: 10 + extra * 2, interval: Math.max(0.2, 0.35 - extra * 0.008) },
  ];
  if (isZepelimWave) {
    groups.push({ type: 'zepelim', count: Math.max(1, Math.floor(waveNum / 15)), interval: 4.0 });
  } else if (isMoabWave) {
    groups.push({ type: 'moab', count: 2 + Math.floor(extra / 2), interval: 2.2 });
  } else {
    groups.push({ type: 'moab', count: 1 + Math.floor(extra / 3), interval: 2.6 });
  }
  return {
    wave: waveNum,
    title: isZepelimWave
      ? 'MEGA AUDITORIA DA RECEITA FEDERAL!'
      : isMoabWave
        ? 'CHUVA DE IMPOSTO DE RENDA!'
        : `Modo Infinito — Onda ${waveNum}`,
    bonusBananas: 140 + extra * 15,
    bossBanner: isZepelimWave
      ? '🚨💸 ZEPELIM DA RECEITA FEDERAL VOLTOU!'
      : isMoabWave
        ? '💼 CHEFE: ONDA DE MOABS DO IMPOSTO DE RENDA!'
        : undefined,
    groups,
  };
}

export const MONKEY_QUIPS = [
  'UUU-AAA-AAA!',
  'Pega essa banana!',
  'Sem CNH e com pressão!',
  'Cadê meu auxílio-banana?',
  'Sai fora, bexiga!',
  'Chinelada neles!',
  'Declara esse estouro!',
  'Macaco vesgo nunca erra (quase)!',
];
