import {
  GRID_SIZE,
  TILE_H,
  TILE_W,
  type TerrainType,
  type TileData,
} from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gridToWorld(gx: number, gy: number): { wx: number; wy: number } {
  return {
    wx: (gx - gy) * (TILE_W * 0.5),
    wy: (gx + gy) * (TILE_H * 0.5),
  };
}

export function worldToGrid(wx: number, wy: number): { gx: number; gy: number } {
  const halfW = TILE_W * 0.5;
  const halfH = TILE_H * 0.5;
  const fx = (wx / halfW + wy / halfH) * 0.5;
  const fy = (wy / halfH - wx / halfW) * 0.5;
  return {
    gx: Math.floor(fx),
    gy: Math.floor(fy),
  };
}

export function inBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < GRID_SIZE && gy < GRID_SIZE;
}

export function generateMap(seed: number): TileData[][] {
  const rng = mulberry32(seed);
  const grid: TileData[][] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    const row: TileData[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({
        gx: x,
        gy: y,
        terrain: 'grass',
        building: null,
        level: 1,
        powered: false,
        connectedToRoad: false,
        localHappiness: 65,
        pollution: 0,
        trafficLoad: 0,
        variant: Math.floor(rng() * 1000),
      });
    }
    grid.push(row);
  }

  // Winding jungle river cutting across the map
  const phase = rng() * Math.PI * 2;
  const amp = 2.2 + rng() * 1.4;
  const baseOffset = GRID_SIZE * 0.54;
  for (let x = 0; x < GRID_SIZE; x++) {
    const centerY = Math.round(baseOffset + Math.sin(x * 0.32 + phase) * amp);
    for (let dy = -1; dy <= 0; dy++) {
      const y = centerY + dy;
      if (inBounds(x, y)) {
        grid[y][x].terrain = 'water';
      }
    }
  }

  // Forest clusters away from center buildable area
  const numGroves = 10;
  for (let g = 0; g < numGroves; g++) {
    const cx = Math.floor(rng() * GRID_SIZE);
    const cy = Math.floor(rng() * GRID_SIZE);
    const rad = 1.6 + rng() * 2.2;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x].terrain !== 'grass') continue;
        // Keep central starter plaza open
        if (Math.abs(x - 10) <= 3 && Math.abs(y - 8) <= 3) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= rad && rng() < 0.72) {
          grid[y][x].terrain = 'forest';
        }
      }
    }
  }

  // Starter "Avenida das Bananas" in the center-north so players see roads immediately
  const starterRoadX = [8, 9, 10, 11, 12];
  const starterRoadY = 7;
  for (const x of starterRoadX) {
    if (inBounds(x, starterRoadY) && grid[starterRoadY][x].terrain !== 'water') {
      grid[starterRoadY][x].terrain = 'grass';
      grid[starterRoadY][x].building = 'road';
    }
  }

  return grid;
}

/**
 * Bitmask of orthogonal road neighbors:
 * 1 = North (gy - 1)
 * 2 = East  (gx + 1)
 * 4 = South (gy + 1)
 * 8 = West  (gx - 1)
 */
export function getRoadMask(grid: TileData[][], gx: number, gy: number): number {
  let mask = 0;
  if (inBounds(gx, gy - 1) && grid[gy - 1][gx].building === 'road') mask |= 1;
  if (inBounds(gx + 1, gy) && grid[gy][gx + 1].building === 'road') mask |= 2;
  if (inBounds(gx, gy + 1) && grid[gy + 1][gx].building === 'road') mask |= 4;
  if (inBounds(gx - 1, gy) && grid[gy][gx - 1].building === 'road') mask |= 8;
  return mask;
}

export function getAdjacentRoads(grid: TileData[][], gx: number, gy: number): Array<{ gx: number; gy: number }> {
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];
  const out: Array<{ gx: number; gy: number }> = [];
  for (const { dx, dy } of dirs) {
    const nx = gx + dx;
    const ny = gy + dy;
    if (inBounds(nx, ny) && grid[ny][nx].building === 'road') {
      out.push({ gx: nx, gy: ny });
    }
  }
  return out;
}

export function findRoadPath(
  grid: TileData[][],
  start: { gx: number; gy: number },
  goal: { gx: number; gy: number },
): Array<{ gx: number; gy: number }> | null {
  if (start.gx === goal.gx && start.gy === goal.gy) return [start];

  const key = (x: number, y: number) => y * GRID_SIZE + x;
  const visited = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const parent = new Int16Array(GRID_SIZE * GRID_SIZE).fill(-1);
  const queue: number[] = [];

  const startK = key(start.gx, start.gy);
  const goalK = key(goal.gx, goal.gy);
  visited[startK] = 1;
  queue.push(startK);

  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  let head = 0;
  let found = false;
  while (head < queue.length) {
    const curr = queue[head++];
    if (curr === goalK) {
      found = true;
      break;
    }
    const cx = curr % GRID_SIZE;
    const cy = Math.floor(curr / GRID_SIZE);

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      if (grid[ny][nx].building !== 'road') continue;
      const nk = key(nx, ny);
      if (visited[nk]) continue;
      visited[nk] = 1;
      parent[nk] = curr;
      queue.push(nk);
    }
  }

  if (!found) return null;

  const path: Array<{ gx: number; gy: number }> = [];
  let cur = goalK;
  while (cur !== -1) {
    path.push({ gx: cur % GRID_SIZE, gy: Math.floor(cur / GRID_SIZE) });
    cur = parent[cur];
  }
  path.reverse();
  return path;
}

export function getTerrainName(t: TerrainType): string {
  switch (t) {
    case 'water':
      return 'Rio da Selva';
    case 'forest':
      return 'Mata de Bananeira';
    default:
      return 'Terreno Plano';
  }
}
