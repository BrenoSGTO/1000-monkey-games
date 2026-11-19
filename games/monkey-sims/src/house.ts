import { FURNITURE_CATALOG } from './catalog';
import type { FurnitureKind, PlacedFurniture, RoomFloorType } from './types';

export const GRID_W = 18;
export const GRID_H = 12;
export const TILE_SIZE = 56;

export interface RoomZone {
  id: string;
  name: string;
  floor: RoomFloorType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const ROOM_ZONES: RoomZone[] = [
  { id: 'kitchen', name: 'Cozinha', floor: 'kitchen', x1: 1, y1: 1, x2: 6, y2: 5 },
  { id: 'living', name: 'Sala da Galera', floor: 'living', x1: 7, y1: 1, x2: 15, y2: 5 },
  { id: 'bathroom', name: 'Banheiro', floor: 'bathroom', x1: 1, y1: 6, x2: 5, y2: 10 },
  { id: 'bedroom', name: 'Quarto', floor: 'bedroom', x1: 6, y1: 6, x2: 12, y2: 10 },
  { id: 'balcony', name: 'Varanda da Selva', floor: 'balcony', x1: 13, y1: 6, x2: 16, y2: 10 },
];

export function getTileFloor(gx: number, gy: number): RoomFloorType {
  for (const r of ROOM_ZONES) {
    if (gx >= r.x1 && gx <= r.x2 && gy >= r.y1 && gy <= r.y2) {
      return r.floor;
    }
  }
  // Small side balcony bridge
  if (gx === 16 && gy >= 2 && gy <= 5) return 'balcony';
  return 'grass';
}

export function isWalkableFloor(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
  return getTileFloor(gx, gy) !== 'grass';
}

/**
 * Edge walls:
 * hasHWall(gx, gy) = wall between (gx, gy-1) and (gx, gy)
 * hasVWall(gx, gy) = wall between (gx-1, gy) and (gx, gy)
 */
export function hasHWall(gx: number, gy: number): boolean {
  // Top perimeter of house
  if (gy === 1 && gx >= 1 && gx <= 15) return true;
  if (gy === 2 && gx === 16) return true;
  // Bottom perimeter of house
  if (gy === 11 && gx >= 1 && gx <= 16) return true;

  // Interior horizontal divider at gy = 6
  if (gy === 6 && gx >= 1 && gx <= 15) {
    // Doorways: Living <-> Bedroom (x = 8, 9) and Living <-> Balcony (x = 14, 15)
    if (gx === 8 || gx === 9 || gx === 14 || gx === 15) return false;
    return true;
  }

  return false;
}

export function hasVWall(gx: number, gy: number): boolean {
  // Left perimeter
  if (gx === 1 && gy >= 1 && gy <= 10) return true;
  // Right perimeter of living (x = 16, y = 1)
  if (gx === 16 && gy === 1) return true;
  // Right edge of side balcony (x = 17, y = 2..10)
  if (gx === 17 && gy >= 2 && gy <= 10) return true;

  // Kitchen <-> Living divider at gx = 7, gy = 1..5
  if (gx === 7 && gy >= 1 && gy <= 5) {
    // 2-tile doorway at gy = 3, 4
    if (gy === 3 || gy === 4) return false;
    return true;
  }

  // Bathroom <-> Bedroom divider at gx = 6, gy = 6..10
  if (gx === 6 && gy >= 6 && gy <= 10) {
    // 2-tile doorway at gy = 7, 8
    if (gy === 7 || gy === 8) return false;
    return true;
  }

  // Bedroom <-> Balcony divider at gx = 13, gy = 6..10
  if (gx === 13 && gy >= 6 && gy <= 10) {
    // 2-tile doorway at gy = 7, 8
    if (gy === 7 || gy === 8) return false;
    return true;
  }

  // Living <-> Side Balcony divider at gx = 16, gy = 2..5 (railing/doorway at gy=3,4)
  if (gx === 16 && gy >= 2 && gy <= 5) {
    if (gy === 3 || gy === 4) return false;
    return true;
  }

  return false;
}

export function canStepBetween(ax: number, ay: number, bx: number, by: number): boolean {
  if (!isWalkableFloor(bx, by)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  if (dx === 1) return !hasVWall(bx, by);
  if (dx === -1) return !hasVWall(ax, ay);
  if (dy === 1) return !hasHWall(bx, by);
  if (dy === -1) return !hasHWall(ax, ay);
  return false;
}

export function getFurnitureSize(kind: FurnitureKind, rotation: 0 | 1 | 2 | 3): { w: number; h: number } {
  const def = FURNITURE_CATALOG[kind];
  if (rotation === 1 || rotation === 3) {
    return { w: def.heightTiles, h: def.widthTiles };
  }
  return { w: def.widthTiles, h: def.heightTiles };
}

export function getFurnitureTiles(item: Pick<PlacedFurniture, 'kind' | 'gx' | 'gy' | 'rotation'>): Array<{ gx: number; gy: number }> {
  const { w, h } = getFurnitureSize(item.kind, item.rotation);
  const tiles: Array<{ gx: number; gy: number }> = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      tiles.push({ gx: item.gx + dx, gy: item.gy + dy });
    }
  }
  return tiles;
}

export function isTileBlockedByFurniture(
  gx: number,
  gy: number,
  furniture: PlacedFurniture[],
  ignoreId?: string,
): boolean {
  for (const item of furniture) {
    if (ignoreId && item.id === ignoreId) continue;
    const tiles = getFurnitureTiles(item);
    if (tiles.some((t) => t.gx === gx && t.gy === gy)) return true;
  }
  return false;
}

export function canPlaceFurniture(
  kind: FurnitureKind,
  gx: number,
  gy: number,
  rotation: 0 | 1 | 2 | 3,
  furniture: PlacedFurniture[],
  ignoreId?: string,
): boolean {
  const tiles = getFurnitureTiles({ kind, gx, gy, rotation });
  for (const t of tiles) {
    if (!isWalkableFloor(t.gx, t.gy)) return false;
    if (isTileBlockedByFurniture(t.gx, t.gy, furniture, ignoreId)) return false;
  }
  // Also make sure multi-tile placement doesn't straddle a wall
  if (tiles.length > 1) {
    const first = tiles[0];
    for (const t of tiles) {
      if (t.gx > first.gx && hasVWall(t.gx, t.gy)) return false;
      if (t.gy > first.gy && hasHWall(t.gx, t.gy)) return false;
    }
  }
  return true;
}

export function findPath(
  startGx: number,
  startGy: number,
  goalGx: number,
  goalGy: number,
  furniture: PlacedFurniture[],
): Array<{ gx: number; gy: number }> {
  if (startGx === goalGx && startGy === goalGy) return [];
  if (!isWalkableFloor(goalGx, goalGy)) return [];

  const key = (x: number, y: number) => `${x},${y}`;
  const queue: Array<{ gx: number; gy: number }> = [{ gx: startGx, gy: startGy }];
  const parent = new Map<string, { gx: number; gy: number } | null>();
  parent.set(key(startGx, startGy), null);

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.gx === goalGx && cur.gy === goalGy) {
      found = true;
      break;
    }
    for (const d of dirs) {
      const nx = cur.gx + d.dx;
      const ny = cur.gy + d.dy;
      const nk = key(nx, ny);
      if (parent.has(nk)) continue;
      if (!canStepBetween(cur.gx, cur.gy, nx, ny)) continue;
      const isGoal = nx === goalGx && ny === goalGy;
      if (!isGoal && isTileBlockedByFurniture(nx, ny, furniture)) continue;
      parent.set(nk, cur);
      queue.push({ gx: nx, gy: ny });
    }
  }

  if (!found) return [];

  const path: Array<{ gx: number; gy: number }> = [];
  let trace: { gx: number; gy: number } | null = { gx: goalGx, gy: goalGy };
  while (trace && !(trace.gx === startGx && trace.gy === startGy)) {
    path.push(trace);
    trace = parent.get(key(trace.gx, trace.gy)) ?? null;
  }
  path.reverse();
  return path;
}

export function findStandTileNearFurniture(
  fromGx: number,
  fromGy: number,
  item: PlacedFurniture,
  furniture: PlacedFurniture[],
): { gx: number; gy: number } | null {
  const occupied = getFurnitureTiles(item);
  const candidates: Array<{ gx: number; gy: number }> = [];
  const dirs = [
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ];
  for (const tile of occupied) {
    for (const d of dirs) {
      const nx = tile.gx + d.dx;
      const ny = tile.gy + d.dy;
      if (!canStepBetween(tile.gx, tile.gy, nx, ny)) continue;
      if (isTileBlockedByFurniture(nx, ny, furniture)) continue;
      if (!candidates.some((c) => c.gx === nx && c.gy === ny)) {
        candidates.push({ gx: nx, gy: ny });
      }
    }
  }

  let best: { gx: number; gy: number } | null = null;
  let bestLen = Infinity;
  for (const c of candidates) {
    if (c.gx === fromGx && c.gy === fromGy) return c;
    const p = findPath(fromGx, fromGy, c.gx, c.gy, furniture);
    if (p.length > 0 && p.length < bestLen) {
      bestLen = p.length;
      best = c;
    }
  }
  return best;
}

export function findNearestWalkableTile(
  gx: number,
  gy: number,
  furniture: PlacedFurniture[],
): { gx: number; gy: number } {
  const clampedX = Math.max(1, Math.min(GRID_W - 2, gx));
  const clampedY = Math.max(1, Math.min(GRID_H - 2, gy));
  if (isWalkableFloor(clampedX, clampedY) && !isTileBlockedByFurniture(clampedX, clampedY, furniture)) {
    return { gx: clampedX, gy: clampedY };
  }
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = clampedX + dx;
        const ny = clampedY + dy;
        if (isWalkableFloor(nx, ny) && !isTileBlockedByFurniture(nx, ny, furniture)) {
          return { gx: nx, gy: ny };
        }
      }
    }
  }
  return { gx: 9, gy: 3 };
}

export function createStarterFurniture(): PlacedFurniture[] {
  return [
    // Kitchen
    { id: 'f-fridge', kind: 'fridge', gx: 1, gy: 1, rotation: 0 },
    { id: 'f-stove', kind: 'stove', gx: 3, gy: 1, rotation: 0 },
    { id: 'f-plant-k', kind: 'plant_pot', gx: 5, gy: 1, rotation: 0 },

    // Living Room
    { id: 'f-tv', kind: 'tv_tube', gx: 10, gy: 1, rotation: 0 },
    { id: 'f-sofa', kind: 'sofa_palm', gx: 10, gy: 3, rotation: 0 },
    { id: 'f-pc', kind: 'pc_basic', gx: 14, gy: 1, rotation: 0 },
    { id: 'f-jbl', kind: 'jbl_speaker', gx: 7, gy: 1, rotation: 0 },
    { id: 'f-lamp1', kind: 'floor_lamp', gx: 15, gy: 4, rotation: 0 },

    // Bathroom
    { id: 'f-shower', kind: 'shower_waterfall', gx: 1, gy: 6, rotation: 0 },
    { id: 'f-toilet', kind: 'toilet', gx: 1, gy: 9, rotation: 0 },
    { id: 'f-plant-b', kind: 'plant_pot', gx: 4, gy: 9, rotation: 0 },

    // Bedroom
    { id: 'f-hammock1', kind: 'hammock', gx: 7, gy: 9, rotation: 0 },
    { id: 'f-hammock2', kind: 'hammock', gx: 10, gy: 9, rotation: 0 },
    { id: 'f-lamp2', kind: 'floor_lamp', gx: 6, gy: 10, rotation: 0 },

    // Balcony
    { id: 'f-guitar', kind: 'guitar_stand', gx: 16, gy: 6, rotation: 0 },
    { id: 'f-trampoline', kind: 'trampoline', gx: 14, gy: 8, rotation: 0 },
  ];
}

export function calculateHouseComfort(furniture: PlacedFurniture[]): number {
  let sum = 0;
  for (const item of furniture) {
    sum += FURNITURE_CATALOG[item.kind].comfort;
  }
  return sum;
}

export function calculateHouseValue(furniture: PlacedFurniture[]): number {
  let sum = 0;
  for (const item of furniture) {
    sum += FURNITURE_CATALOG[item.kind].price;
  }
  return sum;
}
