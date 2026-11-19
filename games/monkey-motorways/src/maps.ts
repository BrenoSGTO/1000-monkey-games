import { GRID_COLS, GRID_ROWS } from './constants';
import type { MapDefinition, MapId, TileKind } from './types';

function createEmptyGrid(): TileKind[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => 'land' as TileKind),
  );
}

function buildRioDeBananeiro(): MapDefinition {
  const tiles = createEmptyGrid();

  // Winding 1-tile river ("Rio Bananal") slicing from top-center-right to bottom-left-center
  // Designed so every crossing is clean and 1 bridge = 1 river cell!
  const riverPath: Array<[number, number]> = [
    [17, 0], [17, 1], [17, 2],
    [16, 2], [16, 3], [16, 4],
    [15, 4], [15, 5], [14, 5],
    [14, 6], [13, 6], [13, 7],
    [13, 8], [13, 9], [14, 9],
    [14, 10], [14, 11], [13, 11],
    [13, 12], [12, 12], [12, 13],
    [12, 14], [11, 14], [11, 15],
    [11, 16], [11, 17],
  ];
  for (const [x, y] of riverPath) {
    tiles[y][x] = 'water';
  }

  // Secondary small tributary branch on the east side starting mid-map
  const branch: Array<[number, number]> = [
    [15, 10], [16, 10], [17, 10], [18, 10],
    [18, 9], [19, 9], [20, 9], [21, 9],
    [21, 8], [22, 8], [23, 8], [24, 8],
    [25, 8], [26, 8], [27, 8],
  ];
  for (const [x, y] of branch) {
    tiles[y][x] = 'water';
  }

  // Scenic "Morro do Pão de Banana" rock outcrops & dense palm groves
  const rocks: Array<[number, number]> = [
    [4, 3], [5, 3], [4, 4],
    [22, 13], [23, 13], [23, 14],
  ];
  for (const [x, y] of rocks) tiles[y][x] = 'rock';

  const trees: Array<[number, number]> = [
    [1, 1], [2, 1],
    [25, 2], [26, 2], [26, 3],
    [2, 15], [3, 15],
    [20, 4], [8, 11],
  ];
  for (const [x, y] of trees) tiles[y][x] = 'tree';

  return {
    id: 'rio-de-bananeiro',
    name: 'Rio de Bananeiro',
    subtitle: 'Pontes, Morros & Buzinaço na Orla',
    description:
      'O Rio Bananal corta a cidade inteira e um braço d’água divide a zona leste. Use suas Pontes de Bambu com sabedoria!',
    badge: '🌊 Exige Pontes',
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tiles,
    startingInventory: {
      roads: 34,
      bridges: 2,
      lights: 1,
      roundabouts: 0,
      motorways: 0,
    },
    decorSeed: 42,
  };
}

function buildSaoChimpulo(): MapDefinition {
  const tiles = createEmptyGrid();

  // Two large lakes ("Lagoa do Chimpanzé" & "Represa do Açaí") creating bottlenecks
  const lake1: Array<[number, number]> = [
    [7, 5], [8, 5], [9, 5],
    [7, 6], [8, 6], [9, 6], [10, 6],
    [8, 7], [9, 7], [10, 7],
    [8, 8], [9, 8],
  ];
  for (const [x, y] of lake1) tiles[y][x] = 'water';

  const lake2: Array<[number, number]> = [
    [18, 9], [19, 9], [20, 9],
    [17, 10], [18, 10], [19, 10], [20, 10],
    [17, 11], [18, 11], [19, 11],
    [18, 12], [19, 12],
  ];
  for (const [x, y] of lake2) tiles[y][x] = 'water';

  // Concrete / Rock Jungle Parks blocking central shortcuts
  const rocks: Array<[number, number]> = [
    [13, 3], [14, 3],
    [13, 13], [14, 13], [14, 14],
  ];
  for (const [x, y] of rocks) tiles[y][x] = 'rock';

  const trees: Array<[number, number]> = [
    [2, 2], [3, 2],
    [24, 3], [25, 3],
    [3, 14], [4, 14],
    [24, 15], [25, 15],
    [14, 8],
  ];
  for (const [x, y] of trees) tiles[y][x] = 'tree';

  return {
    id: 'sao-chimpulo',
    name: 'São Chimpulo',
    subtitle: 'Marginais Travadas & Hora do Rush',
    description:
      'Metrópole gigante cheia de lagos e avenidas congestionadas. Prepare rotatórias, semáforos e cipós antes do rush das 18h!',
    badge: '🏙️ Trânsito Intenso',
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tiles,
    startingInventory: {
      roads: 42,
      bridges: 1,
      lights: 2,
      roundabouts: 1,
      motorways: 0,
    },
    decorSeed: 99,
  };
}

export const MAPS: Record<MapId, MapDefinition> = {
  'rio-de-bananeiro': buildRioDeBananeiro(),
  'sao-chimpulo': buildSaoChimpulo(),
};

export const MAP_LIST: MapDefinition[] = [
  MAPS['rio-de-bananeiro'],
  MAPS['sao-chimpulo'],
];
