import type { IngredientKind, KitchenDef, KitchenId, StationType } from './types';

export const GRID_COLS = 14;
export const GRID_ROWS = 8;

export const KITCHENS: Record<KitchenId, KitchenDef> = {
  quiosque: {
    id: 'quiosque',
    name: '1. Quiosque da Selva',
    subtitle: 'Clássico aberto • Ideal pra aquecer',
    description: 'Salada de Banana e X-Macaco num quiosque tropical bem espaçoso. Perfeito para pegar o ritmo!',
    themeColor: '#22c55e',
    floorA: '#f5e6c8',
    floorB: '#ead3ab',
    counterColor: '#b45309',
    duration: 150,
    recipes: ['banana_salad', 'x_macaco'],
    stars: [120, 260, 420],
    hasBridgeCycle: false,
    hasRatHazard: false,
    hasPeelHazard: false,
    orderInterval: 15,
    maxOrders: 4,
    layout: [
      '#1C2C3C4CCGG##',
      '#............#',
      '#B...CCCC...E#',
      '#B..........C#',
      '#............#',
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
    name: '2. Dois Caminhões em Movimento',
    subtitle: 'Arremesse por cima da pista!',
    description: 'Cozinha dividida em dois caminhões na rodovia! Jogue ingredientes pelo vão central ou use a ponte quando ela encostar!',
    themeColor: '#f59e0b',
    floorA: '#e2e8f0',
    floorB: '#cbd5e1',
    counterColor: '#b91c1c',
    duration: 165,
    recipes: ['banana_salad', 'x_macaco', 'acai_turbo'],
    stars: [160, 320, 500],
    hasBridgeCycle: true,
    hasRatHazard: false,
    hasPeelHazard: true,
    orderInterval: 14,
    maxOrders: 5,
    layout: [
      '#1C2C#~~#GGCL#',
      '#....#~~#....#',
      '#B...C~~C...L#',
      '#B...====...E#',
      '#3...====...P#',
      '#4...C~~C...T#',
      '#....#~~#....#',
      '#7CBCS~~RDDCC#',
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
    name: '3. Cozinha da Esteira Maluca',
    subtitle: 'Esteiras rolantes • Pastel & Açaí',
    description: 'Esteiras levam bananas, cocos, massas e pratos pela cozinha automaticamente — cuidado com as cascas no chão!',
    themeColor: '#06b6d4',
    floorA: '#dbeafe',
    floorB: '#bfdbfe',
    counterColor: '#0f766e',
    duration: 165,
    recipes: ['banana_salad', 'pastel_coco', 'acai_turbo'],
    stars: [180, 360, 540],
    hasBridgeCycle: false,
    hasRatHazard: true,
    hasPeelHazard: true,
    orderInterval: 13,
    maxOrders: 5,
    layout: [
      '#1C6C5C7CCYYL#',
      '#............#',
      '#B..>>>>>>C.L#',
      '#B..........E#',
      '#C.C<<<<<<..P#',
      '#............#',
      '#T..........C#',
      '#CCSCRCCDDCCC#',
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
    name: '4. Restaurante Faria Lima Rush',
    subtitle: 'Todas as receitas • Caos Total!',
    description: 'Hora do almoço executivo na selva corporativa! Todas as 4 receitas, esteiras, Rato Ladrão e chamas pra todo lado!',
    themeColor: '#ec4899',
    floorA: '#fef2f2',
    floorB: '#fee2e2',
    counterColor: '#4c1d95',
    duration: 180,
    recipes: ['banana_salad', 'x_macaco', 'pastel_coco', 'acai_turbo'],
    stars: [220, 440, 680],
    hasBridgeCycle: false,
    hasRatHazard: true,
    hasPeelHazard: true,
    orderInterval: 11.5,
    maxOrders: 5,
    layout: [
      '#1234567CCGGY#',
      '#............#',
      '#B..>>>>C...Y#',
      '#B..........L#',
      '#T..C<<<<...L#',
      '#............#',
      '#E..........P#',
      '#CCSCRCCDDCCC#',
    ],
    spawns: [
      { x: 3.5, y: 3.5 },
      { x: 10.5, y: 3.5 },
      { x: 5.5, y: 5.5 },
      { x: 9.5, y: 5.5 },
    ],
  },
};

export const KITCHEN_ORDER: KitchenId[] = ['quiosque', 'caminhoes', 'esteira', 'faria-lima'];

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
    default:
      return { baseType: 'floor' };
  }
}
