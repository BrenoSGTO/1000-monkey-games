import { B, BLOCK_COUNT, I } from './types';

export interface BlockDef {
  name: string;
  solid: boolean;
  hardness: number; // segundos com poder 1
  tier: number; // tier mínimo de picareta
  drop: number; // -1 = ele mesmo, 0 = nada
  dropMin: number;
  dropMax: number;
  dropChance: number;
  emit: number;
  cost: number; // custo de propagação de luz
  opaque: boolean; // bloqueia luz do céu
  liquid: boolean;
  climb: boolean;
  hurt: number;
  color: string;
  plant: boolean;
  station: boolean;
  unbreakable: boolean;
  sound: 'dirt' | 'stone' | 'wood' | 'ore' | 'leaf' | 'sand' | 'glass';
}

function def(o: Partial<BlockDef> & { name: string; color: string }): BlockDef {
  return {
    solid: true,
    hardness: 1,
    tier: 0,
    drop: -1,
    dropMin: 1,
    dropMax: 1,
    dropChance: 1,
    emit: 0,
    cost: 3,
    opaque: true,
    liquid: false,
    climb: false,
    hurt: 0,
    plant: false,
    station: false,
    unbreakable: false,
    sound: 'stone',
    ...o,
  };
}

export const BLOCKS: BlockDef[] = new Array<BlockDef>(BLOCK_COUNT);
BLOCKS[B.AIR] = def({ name: 'Ar', color: '#000', solid: false, opaque: false, cost: 1, drop: 0, unbreakable: true });
BLOCKS[B.DIRT] = def({ name: 'Terra', color: '#865c38', hardness: 0.6, sound: 'dirt' });
BLOCKS[B.GRASS] = def({ name: 'Terra com Grama', color: '#4aa844', hardness: 0.6, drop: B.DIRT, sound: 'dirt' });
BLOCKS[B.STONE] = def({ name: 'Pedra', color: '#7a7d84', hardness: 3, tier: 1 });
BLOCKS[B.SAND] = def({ name: 'Areia', color: '#e6cd82', hardness: 0.5, sound: 'sand' });
BLOCKS[B.WOOD] = def({ name: 'Tronco de Bananeira', color: '#6e4826', hardness: 2, solid: false, opaque: false, cost: 1, sound: 'wood' });
BLOCKS[B.LEAVES] = def({
  name: 'Folhas',
  color: '#2a9a3c',
  hardness: 0.25,
  solid: false,
  opaque: true,
  cost: 2,
  drop: I.STICK,
  dropChance: 0.3,
  sound: 'leaf',
});
BLOCKS[B.COPPER] = def({ name: 'Minério de Cobre', color: '#cc7a42', hardness: 4.5, tier: 2, sound: 'ore' });
BLOCKS[B.GOLD] = def({ name: 'Minério de Ouro', color: '#f6cf3c', hardness: 6, tier: 3, sound: 'ore' });
BLOCKS[B.BANANITE] = def({ name: 'Bananita Bruta', color: '#f4ef50', hardness: 8, tier: 4, emit: 7, sound: 'ore' });
BLOCKS[B.BEDROCK] = def({ name: 'Rocha Mãe', color: '#2a2630', hardness: 9999, tier: 99, unbreakable: true });
BLOCKS[B.WATER] = def({
  name: 'Água',
  color: '#2a78dc',
  solid: false,
  opaque: false,
  cost: 2,
  liquid: true,
  drop: 0,
  unbreakable: true,
});
BLOCKS[B.PLANKS] = def({ name: 'Tábuas', color: '#c4925a', hardness: 1.4, sound: 'wood' });
BLOCKS[B.BENCH] = def({
  name: 'Bancada',
  color: '#a8703c',
  hardness: 1.2,
  solid: false,
  opaque: false,
  cost: 1,
  station: true,
  sound: 'wood',
});
BLOCKS[B.FURNACE] = def({
  name: 'Fornalha',
  color: '#8a7a74',
  hardness: 2.5,
  tier: 1,
  solid: false,
  opaque: false,
  cost: 1,
  emit: 9,
  station: true,
});
BLOCKS[B.TORCH] = def({
  name: 'Tocha',
  color: '#ffb030',
  hardness: 0,
  solid: false,
  opaque: false,
  cost: 1,
  emit: 14,
  plant: true,
  sound: 'wood',
});
BLOCKS[B.GLASS] = def({ name: 'Vidro', color: '#bfe8f4', hardness: 0.6, opaque: false, cost: 1, sound: 'glass' });
BLOCKS[B.COAL] = def({ name: 'Carvão', color: '#26262c', hardness: 3.5, tier: 1, sound: 'ore' });
BLOCKS[B.SANDSTONE] = def({ name: 'Arenito', color: '#d8ba70', hardness: 2.2, tier: 1, sound: 'stone' });
BLOCKS[B.CACTUS] = def({
  name: 'Cacto',
  color: '#3ca046',
  hardness: 0.8,
  solid: false,
  opaque: false,
  cost: 1,
  hurt: 9,
  sound: 'leaf',
});
BLOCKS[B.LADDER] = def({
  name: 'Escada de Cipó',
  color: '#4e8a36',
  hardness: 0.3,
  solid: false,
  opaque: false,
  cost: 1,
  climb: true,
  plant: true,
  sound: 'wood',
});
BLOCKS[B.BRICK] = def({ name: 'Tijolo de Pedra', color: '#8b8f9c', hardness: 3.2, tier: 1 });
BLOCKS[B.BANANA_BLOCK] = def({ name: 'Bloco de Banana', color: '#f8d63c', hardness: 1.2, emit: 6, sound: 'leaf' });
BLOCKS[B.TALLGRASS] = def({
  name: 'Capim',
  color: '#3cb446',
  hardness: 0,
  solid: false,
  opaque: false,
  cost: 1,
  drop: 0,
  plant: true,
  sound: 'leaf',
});
BLOCKS[B.FLOWER] = def({
  name: 'Hibisco',
  color: '#ff5a8a',
  hardness: 0,
  solid: false,
  opaque: false,
  cost: 1,
  drop: 0,
  plant: true,
  sound: 'leaf',
});
BLOCKS[B.BUNCH] = def({
  name: 'Cacho de Banana',
  color: '#f8d63c',
  hardness: 0.2,
  solid: false,
  opaque: false,
  cost: 1,
  drop: I.BANANA,
  dropMin: 1,
  dropMax: 3,
  plant: true,
  sound: 'leaf',
});

export const SOLID = new Uint8Array(256);
export const COST = new Uint8Array(256).fill(3);
export const EMIT = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
for (let i = 0; i < BLOCK_COUNT; i++) {
  SOLID[i] = BLOCKS[i].solid ? 1 : 0;
  COST[i] = BLOCKS[i].cost;
  EMIT[i] = BLOCKS[i].emit;
  OPAQUE[i] = BLOCKS[i].opaque ? 1 : 0;
}

export interface ToolDef {
  kind: 'pick' | 'sword';
  tier: number;
  power: number;
  dmg: number;
  color: string;
  hi: string;
}

export const HAND: ToolDef = { kind: 'pick', tier: 0, power: 1, dmg: 4, color: '#000', hi: '#000' };

export const TOOLS: Record<number, ToolDef> = {
  [I.PICK_WOOD]: { kind: 'pick', tier: 1, power: 2.5, dmg: 6, color: '#b98648', hi: '#e0b070' },
  [I.PICK_STONE]: { kind: 'pick', tier: 2, power: 3.6, dmg: 8, color: '#8d9099', hi: '#c4c8d2' },
  [I.PICK_COPPER]: { kind: 'pick', tier: 3, power: 5, dmg: 10, color: '#d4803c', hi: '#f6b070' },
  [I.PICK_GOLD]: { kind: 'pick', tier: 4, power: 7, dmg: 13, color: '#f2c92c', hi: '#fff088' },
  [I.PICK_BANANITE]: { kind: 'pick', tier: 5, power: 10, dmg: 17, color: '#e8f048', hi: '#ffffd0' },
  [I.SWORD_WOOD]: { kind: 'sword', tier: 1, power: 1.4, dmg: 10, color: '#b98648', hi: '#e0b070' },
  [I.SWORD_STONE]: { kind: 'sword', tier: 2, power: 1.6, dmg: 14, color: '#8d9099', hi: '#c4c8d2' },
  [I.SWORD_COPPER]: { kind: 'sword', tier: 3, power: 1.8, dmg: 19, color: '#d4803c', hi: '#f6b070' },
  [I.SWORD_GOLD]: { kind: 'sword', tier: 4, power: 2, dmg: 25, color: '#f2c92c', hi: '#fff088' },
  [I.SWORD_BANANITE]: { kind: 'sword', tier: 5, power: 2.2, dmg: 36, color: '#e8f048', hi: '#ffffd0' },
};

export interface FoodDef {
  food: number;
  heal: number;
}
export const FOODS: Record<number, FoodDef> = {
  [I.BANANA]: { food: 18, heal: 6 },
  [I.BANANA_FRY]: { food: 38, heal: 16 },
};

const EXTRA_NAMES: Record<number, string> = {
  [I.STICK]: 'Graveto',
  [I.COPPER_BAR]: 'Barra de Cobre',
  [I.GOLD_BAR]: 'Barra de Ouro',
  [I.BANANITE_BAR]: 'Barra de Bananita',
  [I.BANANA]: 'Banana',
  [I.BANANA_FRY]: 'Banana Frita',
  [I.PICK_WOOD]: 'Picareta de Madeira',
  [I.PICK_STONE]: 'Picareta de Pedra',
  [I.PICK_COPPER]: 'Picareta de Cobre',
  [I.PICK_GOLD]: 'Picareta de Ouro',
  [I.PICK_BANANITE]: 'Picareta de Bananita',
  [I.SWORD_WOOD]: 'Espada de Madeira',
  [I.SWORD_STONE]: 'Espada de Pedra',
  [I.SWORD_COPPER]: 'Espada de Cobre',
  [I.SWORD_GOLD]: 'Espada de Ouro',
  [I.SWORD_BANANITE]: 'Espada de Bananita',
};

export function itemName(id: number): string {
  if (id < 100) return BLOCKS[id]?.name ?? '???';
  return EXTRA_NAMES[id] ?? '???';
}

export function isPlaceable(id: number): boolean {
  return id > 0 && id < BLOCK_COUNT && id !== B.WATER && id !== B.GRASS && id !== B.BUNCH;
}

export type Station = 'hand' | 'bench' | 'furnace';
export interface Recipe {
  out: number;
  n: number;
  ing: [number, number][];
  station: Station;
}

export const RECIPES: Recipe[] = [
  { out: B.PLANKS, n: 4, ing: [[B.WOOD, 1]], station: 'hand' },
  { out: I.STICK, n: 4, ing: [[B.PLANKS, 2]], station: 'hand' },
  { out: B.BENCH, n: 1, ing: [[B.PLANKS, 8]], station: 'hand' },
  { out: B.TORCH, n: 4, ing: [[I.STICK, 1], [B.COAL, 1]], station: 'hand' },
  { out: B.LADDER, n: 4, ing: [[B.PLANKS, 2]], station: 'bench' },
  { out: B.FURNACE, n: 1, ing: [[B.STONE, 14]], station: 'bench' },
  { out: I.PICK_WOOD, n: 1, ing: [[B.PLANKS, 6], [I.STICK, 2]], station: 'bench' },
  { out: I.SWORD_WOOD, n: 1, ing: [[B.PLANKS, 5], [I.STICK, 1]], station: 'bench' },
  { out: I.PICK_STONE, n: 1, ing: [[B.STONE, 8], [I.STICK, 2]], station: 'bench' },
  { out: I.SWORD_STONE, n: 1, ing: [[B.STONE, 7], [I.STICK, 1]], station: 'bench' },
  { out: B.BRICK, n: 4, ing: [[B.STONE, 4]], station: 'bench' },
  { out: B.BANANA_BLOCK, n: 1, ing: [[I.BANANA, 6]], station: 'bench' },
  { out: B.GLASS, n: 1, ing: [[B.SAND, 2]], station: 'furnace' },
  { out: I.BANANA_FRY, n: 1, ing: [[I.BANANA, 1]], station: 'furnace' },
  { out: I.COPPER_BAR, n: 1, ing: [[B.COPPER, 3]], station: 'furnace' },
  { out: I.GOLD_BAR, n: 1, ing: [[B.GOLD, 3]], station: 'furnace' },
  { out: I.BANANITE_BAR, n: 1, ing: [[B.BANANITE, 3]], station: 'furnace' },
  { out: I.PICK_COPPER, n: 1, ing: [[I.COPPER_BAR, 4], [I.STICK, 2]], station: 'bench' },
  { out: I.SWORD_COPPER, n: 1, ing: [[I.COPPER_BAR, 3], [I.STICK, 1]], station: 'bench' },
  { out: I.PICK_GOLD, n: 1, ing: [[I.GOLD_BAR, 4], [I.STICK, 2]], station: 'bench' },
  { out: I.SWORD_GOLD, n: 1, ing: [[I.GOLD_BAR, 3], [I.STICK, 1]], station: 'bench' },
  { out: I.PICK_BANANITE, n: 1, ing: [[I.BANANITE_BAR, 5], [I.STICK, 2]], station: 'bench' },
  { out: I.SWORD_BANANITE, n: 1, ing: [[I.BANANITE_BAR, 4], [I.STICK, 1]], station: 'bench' },
];

export const STATION_LABEL: Record<Station, string> = {
  hand: 'Mãos',
  bench: 'Bancada',
  furnace: 'Fornalha',
};

export const EMOTES = [
  'Uuh uuh aah aah!',
  'Cadê a banana?!',
  'Bora cavar!',
  'Me dá uma tocha!',
  'Pareço um mineiro!',
  'Isso é macacagem!',
  'Banana é vida!',
  'Eita, capivara!',
];
