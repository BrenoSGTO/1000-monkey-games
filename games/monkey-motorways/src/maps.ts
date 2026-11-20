import { GRID_COLS, GRID_ROWS } from './constants';
import type { MapDefinition, MapId, TileKind } from './types';

function createGrid(fill: TileKind = 'land'): TileKind[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => fill),
  );
}

function fillRect(
  tiles: TileKind[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: TileKind,
): void {
  for (let y = Math.max(0, y0); y <= Math.min(GRID_ROWS - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(GRID_COLS - 1, x1); x++) {
      tiles[y][x] = kind;
    }
  }
}

function buildRioDeBananeiro(): MapDefinition {
  const tiles = createGrid('land');

  // Winding 1-tile river ("Rio Bananal") slicing from top-center-right to bottom-left-center
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

  // Secondary small tributary branch on the east side
  const branch: Array<[number, number]> = [
    [15, 10], [16, 10], [17, 10], [18, 10],
    [18, 9], [19, 9], [20, 9], [21, 9],
    [21, 8], [22, 8], [23, 8], [24, 8],
    [25, 8], [26, 8], [27, 8],
  ];
  for (const [x, y] of branch) {
    tiles[y][x] = 'water';
  }

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
    initialClusterAnchor: { x: 8, y: 8 },
    colorAnchors: {
      red: { market: { x: 20, y: 4 }, house1: { x: 8, y: 4 }, house2: { x: 23, y: 6 } },
      blue: { market: { x: 20, y: 12 }, house1: { x: 16, y: 13 }, house2: { x: 24, y: 11 } },
    },
    rushMultiplier: 1.0,
    bridgeBias: true,
  };
}

function buildSaoChimpulo(): MapDefinition {
  const tiles = createGrid('land');

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
    initialClusterAnchor: { x: 14, y: 9 },
    rushMultiplier: 1.12,
  };
}

function buildArquipelagoMacacos(): MapDefinition {
  // Start with ocean water and carve 4 distinct lush tropical islands
  const tiles = createGrid('water');

  // Island 1 (West Mainland)
  fillRect(tiles, 1, 2, 9, 15, 'land');
  tiles[2][1] = 'water';
  tiles[15][1] = 'water';
  tiles[2][9] = 'water';

  // Island 2 (North-East Atoll)
  fillRect(tiles, 11, 1, 26, 7, 'land');
  tiles[1][11] = 'water';
  tiles[1][26] = 'water';
  tiles[7][26] = 'water';

  // Island 3 (Center-South Island)
  fillRect(tiles, 11, 9, 18, 16, 'land');
  tiles[16][11] = 'water';

  // Island 4 (South-East Banana Isle)
  fillRect(tiles, 20, 9, 26, 16, 'land');
  tiles[16][26] = 'water';

  // Central mini stepping-stone islet in the strait
  tiles[8][14] = 'land';
  tiles[8][15] = 'land';

  const rocks: Array<[number, number]> = [
    [2, 4], [24, 2], [24, 14],
  ];
  for (const [x, y] of rocks) tiles[y][x] = 'rock';

  const trees: Array<[number, number]> = [
    [2, 13], [3, 13],
    [13, 2], [23, 6],
    [12, 14], [21, 14],
  ];
  for (const [x, y] of trees) tiles[y][x] = 'tree';

  return {
    id: 'arquipelago-macacos',
    name: 'Arquipélago dos Macacos',
    subtitle: '4 Ilhas Tropicais, Estreitos & Cipós Aéreos',
    description:
      'Quatro ilhas cercadas de mar turquesa! Conecte o arquipélago com várias Pontes de Bambu e use seu Cipó Express para cruzar o oceano.',
    badge: '🏝️ Ilhas & Cipó Inicial',
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tiles,
    startingInventory: {
      roads: 36,
      bridges: 4,
      lights: 1,
      roundabouts: 0,
      motorways: 1,
    },
    decorSeed: 137,
    initialClusterAnchor: { x: 5, y: 8 },
    colorAnchors: {
      red: { market: { x: 16, y: 3 }, house1: { x: 5, y: 4 }, house2: { x: 21, y: 4 } },
      blue: { market: { x: 13, y: 11 }, house1: { x: 6, y: 12 }, house2: { x: 16, y: 13 } },
      purple: { market: { x: 22, y: 11 }, house1: { x: 13, y: 5 }, house2: { x: 23, y: 5 } },
      green: { market: { x: 21, y: 2 }, house1: { x: 13, y: 14 }, house2: { x: 3, y: 10 } },
    },
    rushMultiplier: 0.96,
    bridgeBias: true,
  };
}

function buildMarginalTieteSelva(): MapDefinition {
  const tiles = createGrid('land');

  // Wide 2-tile river ("Rio Tietê da Selva") cutting East-West across the whole city
  for (let x = 0; x < GRID_COLS; x++) {
    let baseY = 7;
    if (x >= 8 && x <= 11) baseY = 8;
    else if (x >= 17 && x <= 22) baseY = 8;
    tiles[baseY][x] = 'water';
    tiles[baseY + 1][x] = 'water';
  }

  // Narrower tributary on upper-east side creating a distinct neighborhood
  for (let y = 0; y <= 5; y++) {
    tiles[y][20] = 'water';
  }

  const rocks: Array<[number, number]> = [
    [5, 3], [6, 3],
    [11, 14],
    [22, 13], [23, 13],
  ];
  for (const [x, y] of rocks) tiles[y][x] = 'rock';

  const trees: Array<[number, number]> = [
    [2, 13], [3, 13],
    [14, 2],
    [24, 3], [25, 3],
  ];
  for (const [x, y] of trees) tiles[y][x] = 'tree';

  return {
    id: 'marginal-tiete-selva',
    name: 'Marginal Tietê da Selva',
    subtitle: 'Rio Largo, Marginais & Rotatórias Expressas',
    description:
      'Um rio largo de 2 faixas divide a Zona Norte da Zona Sul. Construa avenidas marginais eficientes sem afogar as pontes!',
    badge: '🛣️ Rio Largo (2 Pontes)',
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tiles,
    startingInventory: {
      roads: 42,
      bridges: 4,
      lights: 2,
      roundabouts: 1,
      motorways: 0,
    },
    decorSeed: 211,
    initialClusterAnchor: { x: 9, y: 4 },
    colorAnchors: {
      red: { market: { x: 17, y: 12 }, house1: { x: 12, y: 4 }, house2: { x: 23, y: 11 } },
      blue: { market: { x: 23, y: 3 }, house1: { x: 6, y: 12 }, house2: { x: 24, y: 6 } },
      purple: { market: { x: 5, y: 12 }, house1: { x: 17, y: 3 }, house2: { x: 9, y: 12 } },
      green: { market: { x: 13, y: 12 }, house1: { x: 3, y: 5 }, house2: { x: 25, y: 13 } },
    },
    rushMultiplier: 1.06,
    bridgeBias: true,
  };
}

export const MAPS: Record<MapId, MapDefinition> = {
  'rio-de-bananeiro': buildRioDeBananeiro(),
  'sao-chimpulo': buildSaoChimpulo(),
  'arquipelago-macacos': buildArquipelagoMacacos(),
  'marginal-tiete-selva': buildMarginalTieteSelva(),
};

export const MAP_LIST: MapDefinition[] = [
  MAPS['rio-de-bananeiro'],
  MAPS['sao-chimpulo'],
  MAPS['arquipelago-macacos'],
  MAPS['marginal-tiete-selva'],
];
