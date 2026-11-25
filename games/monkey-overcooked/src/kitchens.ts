import type { IngredientKind, KitchenDef, KitchenId, StationType } from './types';

export const GRID_COLS = 14;
export const GRID_ROWS = 8;

export const KITCHENS: Record<KitchenId, KitchenDef> = {
  quiosque: {
    id: 'quiosque',
    name: '1. Quiosque do Caldeirão',
    subtitle: 'Clássico aberto • Sopa de Macacão & X-Macaco',
    description:
      'Quiosque tropical espaçoso com caldeirões fumegantes e chapa quente. Ideal para dominar a lendária Sopa de Macacão!',
    themeColor: '#22c55e',
    floorA: '#f5e6c8',
    floorB: '#ead3ab',
    counterColor: '#b45309',
    duration: 155,
    recipes: ['banana_salad', 'sopa_macacao', 'x_macaco'],
    stars: [150, 320, 500],
    hasBridgeCycle: false,
    hasRatHazard: false,
    hasPeelHazard: false,
    orderInterval: 15,
    maxOrders: 4,
    layout: [
      '#1C8C2C34COOG#',
      '#............#',
      '#B...CCCC...G#',
      '#B..........E#',
      '#B..........C#',
      '#C...CCCC...P#',
      '#............#',
      '#TCCSRCCDDCCC#',
    ],
    spawns: [
      { x: 3.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 3.5, y: 6.2 },
      { x: 10.5, y: 6.2 },
    ],
  },
  caminhoes: {
    id: 'caminhoes',
    name: '2. Caminhões da Sopa',
    subtitle: 'Rodovia em movimento • Arremesse pelo vão!',
    description:
      'Cozinha dividida em dois caminhões na estrada! Arremesse ingredientes pelo vão central ou atravesse quando a ponte acoplar!',
    themeColor: '#f59e0b',
    floorA: '#e2e8f0',
    floorB: '#cbd5e1',
    counterColor: '#b91c1c',
    gapStyle: 'highway',
    duration: 165,
    recipes: ['sopa_macacao', 'x_macaco', 'acai_turbo'],
    stars: [180, 360, 560],
    hasBridgeCycle: true,
    hasRatHazard: false,
    hasPeelHazard: true,
    orderInterval: 14,
    maxOrders: 5,
    layout: [
      '#182C#~~#OOGL#',
      '#....#~~#....#',
      '#B...C~~C...G#',
      '#B...====...L#',
      '#3...====...E#',
      '#4...C~~C...P#',
      '#....#~~#....#',
      '#7BTS#~~#RDDT#',
    ],
    spawns: [
      { x: 2.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 2.5, y: 5.5 },
      { x: 10.5, y: 5.5 },
    ],
  },
  esteira: {
    id: 'esteira',
    name: '3. Esteira do Caldo Maluco',
    subtitle: 'Esteiras rolantes • Caldo, Pastel & Açaí',
    description:
      'Esteiras automáticas cruzam o salão levando bananas, cocos e pratos — cuidado com o Rato Ladrão e cascas no chão!',
    themeColor: '#06b6d4',
    floorA: '#dbeafe',
    floorB: '#bfdbfe',
    counterColor: '#0f766e',
    duration: 165,
    recipes: ['sopa_banana', 'pastel_coco', 'acai_turbo'],
    stars: [190, 380, 580],
    hasBridgeCycle: false,
    hasRatHazard: true,
    hasPeelHazard: true,
    orderInterval: 13,
    maxOrders: 5,
    layout: [
      '#1C6C5C7COOYY#',
      '#............#',
      '#B..>>>>>>C.L#',
      '#B..........L#',
      '#C.C<<<<<<..E#',
      '#............#',
      '#T..........P#',
      '##CSCRCCDDCC##',
    ],
    spawns: [
      { x: 2.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 4.5, y: 5.5 },
      { x: 9.5, y: 5.5 },
    ],
  },
  'faria-lima': {
    id: 'faria-lima',
    name: '4. Faria Lima Rush',
    subtitle: 'Almoço executivo • 4 pratos & caos total!',
    description:
      'Hora do pico na selva corporativa! Sopa de Macacão, X-Macaco, Pastel e Açaí saindo sem parar com esteiras e rato ladrão!',
    themeColor: '#ec4899',
    floorA: '#fef2f2',
    floorB: '#fee2e2',
    counterColor: '#4c1d95',
    duration: 180,
    recipes: ['sopa_macacao', 'x_macaco', 'pastel_coco', 'acai_turbo'],
    stars: [240, 480, 740],
    hasBridgeCycle: false,
    hasRatHazard: true,
    hasPeelHazard: true,
    orderInterval: 11.5,
    maxOrders: 5,
    layout: [
      '#12834567OOGY#',
      '#............#',
      '#B..>>>>C...Y#',
      '#B..........G#',
      '#T..C<<<<...L#',
      '#............#',
      '#E..........P#',
      '##CSCRCCDDCC##',
    ],
    spawns: [
      { x: 3.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 5.5, y: 5.5 },
      { x: 9.5, y: 5.5 },
    ],
  },
  vulcao: {
    id: 'vulcao',
    name: '5. Caldeirão do Vulcão 🌋',
    subtitle: 'Rio de lava • Ponte móvel + Sopa Suprema!',
    description:
      'O desafio final sobre um rio de magma! Dois caldeirões, ponte retrátil, Rato Ladrão e pedidos sem piedade!',
    themeColor: '#ef4444',
    floorA: '#44403c',
    floorB: '#292524',
    counterColor: '#991b1b',
    gapStyle: 'lava',
    duration: 180,
    recipes: ['sopa_macacao', 'sopa_banana', 'x_macaco', 'pastel_coco'],
    stars: [260, 520, 800],
    hasBridgeCycle: true,
    hasRatHazard: true,
    hasPeelHazard: true,
    orderInterval: 11.0,
    maxOrders: 5,
    layout: [
      '#1826#~~#OOGY#',
      '#....#~~#....#',
      '#B...C~~C...O#',
      '#B...====...Y#',
      '#3...====...E#',
      '#4...C~~C...P#',
      '#....#~~#....#',
      '#5BTS#~~#RDDT#',
    ],
    spawns: [
      { x: 2.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 2.5, y: 5.5 },
      { x: 10.5, y: 5.5 },
    ],
  },
};

export const KITCHEN_ORDER: KitchenId[] = [
  'quiosque',
  'caminhoes',
  'esteira',
  'faria-lima',
  'vulcao',
];

export function parseLayoutChar(ch: string): {
  baseType: StationType;
  crateIngredient?: IngredientKind;
  conveyorDir?: { dx: number; dy: number };
} {
  switch (ch) {
    case '.':
      return { baseType: 'floor' };
    case '#':
      return { baseType: 'wall' };
    case '~':
      return { baseType: 'gap' };
    case '=':
      return { baseType: 'bridge' };
    case 'C':
      return { baseType: 'counter' };
    case 'B':
      return { baseType: 'board' };
    case 'O':
      return { baseType: 'pot' };
    case 'G':
      return { baseType: 'grill' };
    case 'Y':
      return { baseType: 'fryer' };
    case 'L':
      return { baseType: 'blender' };
    case 'S':
      return { baseType: 'sink' };
    case 'R':
      return { baseType: 'return' };
    case 'D':
      return { baseType: 'pass' };
    case 'P':
      return { baseType: 'plates' };
    case 'T':
      return { baseType: 'trash' };
    case 'E':
      return { baseType: 'extinguisher_stand' };
    case '>':
      return { baseType: 'conveyor', conveyorDir: { dx: 1, dy: 0 } };
    case '<':
      return { baseType: 'conveyor', conveyorDir: { dx: -1, dy: 0 } };
    case '^':
      return { baseType: 'conveyor', conveyorDir: { dx: 0, dy: -1 } };
    case 'v':
      return { baseType: 'conveyor', conveyorDir: { dx: 0, dy: 1 } };
    case '1':
      return { baseType: 'crate', crateIngredient: 'banana' };
    case '2':
      return { baseType: 'crate', crateIngredient: 'lettuce' };
    case '3':
      return { baseType: 'crate', crateIngredient: 'bread' };
    case '4':
      return { baseType: 'crate', crateIngredient: 'burger' };
    case '5':
      return { baseType: 'crate', crateIngredient: 'dough' };
    case '6':
      return { baseType: 'crate', crateIngredient: 'coconut' };
    case '7':
      return { baseType: 'crate', crateIngredient: 'acai' };
    case '8':
      return { baseType: 'crate', crateIngredient: 'carrot' };
    default:
      return { baseType: 'floor' };
  }
}
