import type { Cell, FruitType, LevelDef, MoveCoord, Piece, SpecialType } from './types';

export const ALL_FRUITS: FruitType[] = [
  'banana',
  'coconut',
  'mango',
  'acai',
  'cashew',
  'jackfruit',
];

export const FRUIT_META: Record<
  FruitType,
  { name: string; color: string; splash: string }
> = {
  banana: { name: 'Banana', color: '#facc15', splash: '#fef08a' },
  coconut: { name: 'Coco', color: '#a16207', splash: '#fde68a' },
  mango: { name: 'Manga', color: '#fb923c', splash: '#fdba74' },
  acai: { name: 'Açaí', color: '#9333ea', splash: '#d8b4fe' },
  cashew: { name: 'Caju', color: '#ef4444', splash: '#fca5a5' },
  jackfruit: { name: 'Jaca', color: '#22c55e', splash: '#86efac' },
};

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1337;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}

let nextPieceId = 1;

export function makePiece(
  fruit: FruitType,
  special: SpecialType = 'none',
  isBaby = false,
  yOffset = 0,
): Piece {
  return {
    id: nextPieceId++,
    fruit,
    special,
    isBaby,
    xOffset: 0,
    yOffset,
    scaleX: 1,
    scaleY: 1,
    wobble: 0,
    blinkTimer: 1.5 + Math.random() * 4.5,
    blinking: false,
  };
}

export function createBoard(level: LevelDef, rng: SeededRng): Cell[][] {
  const { rows, cols, numFruits, layout } = level;
  const activeFruits = ALL_FRUITS.slice(0, Math.max(4, Math.min(6, numFruits)));

  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowCells: Cell[] = [];
    const layoutRow = layout?.[r] ?? '#'.repeat(cols);
    for (let c = 0; c < cols; c++) {
      const ch = layoutRow[c] ?? '#';
      const isVoid = ch === '.';
      const jelly = ch === 'D' ? 2 : ch === 'J' ? 1 : 0;
      const crate = ch === 'C' ? 1 : 0;
      const isBaby = ch === 'B';

      let piece: Piece | null = null;
      if (!isVoid && crate === 0) {
        if (isBaby) {
          piece = makePiece('banana', 'none', true, 0);
        } else {
          // Pick a fruit that doesn't create an immediate 3-in-a-row
          const forbidden = new Set<FruitType>();
          if (c >= 2) {
            const p1 = rowCells[c - 1].piece;
            const p2 = rowCells[c - 2].piece;
            if (p1 && p2 && !p1.isBaby && !p2.isBaby && p1.fruit === p2.fruit) {
              forbidden.add(p1.fruit);
            }
          }
          if (r >= 2) {
            const p1 = grid[r - 1][c].piece;
            const p2 = grid[r - 2][c].piece;
            if (p1 && p2 && !p1.isBaby && !p2.isBaby && p1.fruit === p2.fruit) {
              forbidden.add(p1.fruit);
            }
          }
          const choices = activeFruits.filter((f) => !forbidden.has(f));
          const chosen = choices.length > 0 ? rng.pick(choices) : rng.pick(activeFruits);
          piece = makePiece(chosen, 'none', false, 0);
        }
      }

      rowCells.push({
        row: r,
        col: c,
        void: isVoid,
        jelly,
        crate,
        peel: false,
        exitChute: false,
        piece,
      });
    }
    grid.push(rowCells);
  }

  // Mark exit chutes on the lowest non-void cell of each column when level has babies objective
  if (level.objective === 'babies') {
    for (let c = 0; c < cols; c++) {
      for (let r = rows - 1; r >= 0; r--) {
        if (!grid[r][c].void) {
          grid[r][c].exitChute = true;
          break;
        }
      }
    }
  }

  // Ensure at least one valid move exists at start
  if (findAllValidMoves(grid).length === 0) {
    shuffleBoard(grid, activeFruits, rng);
  }

  return grid;
}

export function canSwapCells(a: Cell, b: Cell): boolean {
  if (a.void || b.void) return false;
  if (a.crate > 0 || b.crate > 0) return false;
  if (a.peel || b.peel) return false;
  if (!a.piece || !b.piece) return false;
  const dist = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  return dist === 1;
}

function isMatchable(cell: Cell): boolean {
  if (cell.void || cell.crate > 0 || !cell.piece) return false;
  if (cell.piece.isBaby) return false;
  if (cell.piece.special === 'rainbow') return false;
  return true;
}

export interface MatchGroup {
  cells: { r: number; c: number }[];
  fruit: FruitType;
  createSpecial: SpecialType;
  spawnAt: { r: number; c: number };
  maxRun: number;
}

export function findMatchGroups(
  grid: Cell[][],
  preferredCoords: { r: number; c: number }[] = [],
): MatchGroup[] {
  const rows = grid.length;
  const cols = grid[0].length;

  interface Run {
    dir: 'h' | 'v';
    fruit: FruitType;
    coords: { r: number; c: number }[];
  }

  const runs: Run[] = [];

  // Horizontal runs
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const cell = grid[r][c];
      if (!isMatchable(cell)) {
        c++;
        continue;
      }
      const fruit = cell.piece!.fruit;
      const coords = [{ r, c }];
      let c2 = c + 1;
      while (c2 < cols && isMatchable(grid[r][c2]) && grid[r][c2].piece!.fruit === fruit) {
        coords.push({ r, c: c2 });
        c2++;
      }
      if (coords.length >= 3) {
        runs.push({ dir: 'h', fruit, coords });
      }
      c = c2;
    }
  }

  // Vertical runs
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const cell = grid[r][c];
      if (!isMatchable(cell)) {
        r++;
        continue;
      }
      const fruit = cell.piece!.fruit;
      const coords = [{ r, c }];
      let r2 = r + 1;
      while (r2 < rows && isMatchable(grid[r2][c]) && grid[r2][c].piece!.fruit === fruit) {
        coords.push({ r: r2, c });
        r2++;
      }
      if (coords.length >= 3) {
        runs.push({ dir: 'v', fruit, coords });
      }
      r = r2;
    }
  }

  if (runs.length === 0) return [];

  // Merge overlapping runs of the same fruit
  const used = new Array<boolean>(runs.length).fill(false);
  const groups: MatchGroup[] = [];

  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const componentRuns: Run[] = [runs[i]];
    const coordSet = new Set(runs[i].coords.map((p) => `${p.r},${p.c}`));
    const fruit = runs[i].fruit;

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < runs.length; j++) {
        if (used[j] || runs[j].fruit !== fruit) continue;
        if (runs[j].coords.some((p) => coordSet.has(`${p.r},${p.c}`))) {
          used[j] = true;
          componentRuns.push(runs[j]);
          for (const p of runs[j].coords) coordSet.add(`${p.r},${p.c}`);
          changed = true;
        }
      }
    }

    const uniqueCells: { r: number; c: number }[] = [];
    for (const key of coordSet) {
      const [rs, cs] = key.split(',');
      uniqueCells.push({ r: Number(rs), c: Number(cs) });
    }

    let maxH = 0;
    let maxV = 0;
    for (const run of componentRuns) {
      if (run.dir === 'h') maxH = Math.max(maxH, run.coords.length);
      if (run.dir === 'v') maxV = Math.max(maxV, run.coords.length);
    }
    const maxRun = Math.max(maxH, maxV);

    let createSpecial: SpecialType = 'none';
    if (maxRun >= 5) {
      createSpecial = 'rainbow';
    } else if (maxH >= 3 && maxV >= 3) {
      createSpecial = 'bomb';
    } else if (maxH === 4) {
      createSpecial = 'striped-v';
    } else if (maxV === 4) {
      createSpecial = 'striped-h';
    }

    // Choose spawn coordinate: prefer swapped cell if inside group, else intersection, else middle
    let spawnAt = uniqueCells[Math.floor(uniqueCells.length / 2)];
    const preferred = preferredCoords.find((p) => coordSet.has(`${p.r},${p.c}`));
    if (preferred) {
      spawnAt = preferred;
    } else if (maxH >= 3 && maxV >= 3) {
      const hSet = new Set(
        componentRuns.filter((x) => x.dir === 'h').flatMap((x) => x.coords.map((p) => `${p.r},${p.c}`)),
      );
      const inter = componentRuns
        .filter((x) => x.dir === 'v')
        .flatMap((x) => x.coords)
        .find((p) => hSet.has(`${p.r},${p.c}`));
      if (inter) spawnAt = inter;
    }

    groups.push({
      cells: uniqueCells,
      fruit,
      createSpecial,
      spawnAt,
      maxRun,
    });
  }

  return groups;
}

export function findAllValidMoves(grid: Cell[][]): MoveCoord[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const moves: MoveCoord[] = [];

  const testPair = (r1: number, c1: number, r2: number, c2: number) => {
    const a = grid[r1][c1];
    const b = grid[r2][c2];
    if (!canSwapCells(a, b)) return;
    const pa = a.piece!;
    const pb = b.piece!;

    // Special + special or rainbow + non-baby fruit is always valid!
    if (pa.special === 'rainbow' && !pb.isBaby) {
      moves.push({ r1, c1, r2, c2 });
      return;
    }
    if (pb.special === 'rainbow' && !pa.isBaby) {
      moves.push({ r1, c1, r2, c2 });
      return;
    }
    if (pa.special !== 'none' && pb.special !== 'none') {
      moves.push({ r1, c1, r2, c2 });
      return;
    }

    // Temporarily swap
    a.piece = pb;
    b.piece = pa;
    const hasMatch = hasMatchAt(grid, r1, c1) || hasMatchAt(grid, r2, c2);
    a.piece = pa;
    b.piece = pb;

    if (hasMatch) {
      moves.push({ r1, c1, r2, c2 });
    }
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) testPair(r, c, r, c + 1);
      if (r + 1 < rows) testPair(r, c, r + 1, c);
    }
  }

  return moves;
}

function hasMatchAt(grid: Cell[][], r: number, c: number): boolean {
  const cell = grid[r][c];
  if (!isMatchable(cell)) return false;
  const fruit = cell.piece!.fruit;
  const rows = grid.length;
  const cols = grid[0].length;

  let hCount = 1;
  for (let cc = c - 1; cc >= 0 && isMatchable(grid[r][cc]) && grid[r][cc].piece!.fruit === fruit; cc--) {
    hCount++;
  }
  for (let cc = c + 1; cc < cols && isMatchable(grid[r][cc]) && grid[r][cc].piece!.fruit === fruit; cc++) {
    hCount++;
  }
  if (hCount >= 3) return true;

  let vCount = 1;
  for (let rr = r - 1; rr >= 0 && isMatchable(grid[rr][c]) && grid[rr][c].piece!.fruit === fruit; rr--) {
    vCount++;
  }
  for (let rr = r + 1; rr < rows && isMatchable(grid[rr][c]) && grid[rr][c].piece!.fruit === fruit; rr++) {
    vCount++;
  }
  return vCount >= 3;
}

export function shuffleBoard(
  grid: Cell[][],
  activeFruits: FruitType[],
  rng: SeededRng,
): void {
  const slots: Cell[] = [];
  const pieces: Piece[] = [];

  for (const row of grid) {
    for (const cell of row) {
      if (!cell.void && cell.crate === 0 && cell.piece && !cell.piece.isBaby) {
        slots.push(cell);
        pieces.push(cell.piece);
      }
    }
  }

  // Try shuffling up to 20 times to get zero immediate matches and >= 1 valid move
  for (let attempt = 0; attempt < 20; attempt++) {
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    for (let i = 0; i < slots.length; i++) {
      slots[i].piece = pieces[i];
      pieces[i].scaleX = 0.7;
      pieces[i].scaleY = 1.3;
    }

    if (findMatchGroups(grid).length === 0 && findAllValidMoves(grid).length > 0) {
      return;
    }
  }

  // Fallback: force fresh fruits with no initial matches + ensure a valid move
  for (let i = 0; i < slots.length; i++) {
    const cell = slots[i];
    if (cell.piece && cell.piece.special === 'none') {
      cell.piece.fruit = rng.pick(activeFruits);
    }
  }
  // Remove accidental matches cleanly
  for (const group of findMatchGroups(grid)) {
    const cell = grid[group.cells[0].r][group.cells[0].c];
    if (cell.piece && !cell.piece.isBaby) {
      const alt = activeFruits.find((f) => f !== group.fruit) ?? activeFruits[0];
      cell.piece.fruit = alt;
    }
  }
  // If still no valid moves (e.g. heavy peels), clear peels so player isn't soft-locked
  if (findAllValidMoves(grid).length === 0) {
    for (const row of grid) {
      for (const cell of row) cell.peel = false;
    }
  }
}

export interface ClearEvent {
  cleared: { r: number; c: number; fruit: FruitType; special: SpecialType }[];
  beams: { r1: number; c1: number; r2: number; c2: number; color: string }[];
  explosions: { r: number; c: number; radius: number }[];
  rainbowTargets: { fromR: number; fromC: number; toR: number; toC: number; color: string }[];
  jelliesCleared: number;
  cratesCleared: number;
  peelsCleared: number;
  specialsTriggered: number;
}

/**
 * Expands a set of target cells through chain-reactions of Striped, Bomb, and Rainbow specials.
 */
export function expandAndClearCells(
  grid: Cell[][],
  initialTargets: { r: number; c: number }[],
  rng: SeededRng,
  matchAdjacencyCells: { r: number; c: number }[] = [],
  preserveCoords: Set<string> = new Set(),
): ClearEvent {
  const rows = grid.length;
  const cols = grid[0].length;
  const clearedSet = new Set<string>();
  const triggeredSpecials = new Set<string>();
  const queue: { r: number; c: number }[] = [...initialTargets];

  const beams: ClearEvent['beams'] = [];
  const explosions: ClearEvent['explosions'] = [];
  const rainbowTargets: ClearEvent['rainbowTargets'] = [];

  let specialsTriggered = 0;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.r < 0 || cur.r >= rows || cur.c < 0 || cur.c >= cols) continue;
    const key = `${cur.r},${cur.c}`;
    const cell = grid[cur.r][cur.c];
    if (cell.void) continue;

    // If hitting a crate directly via special blast, damage crate and stop
    if (cell.crate > 0) {
      if (!clearedSet.has(key)) {
        clearedSet.add(key);
      }
      continue;
    }

    if (cell.piece?.isBaby) {
      // Babies are indestructible!
      continue;
    }

    if (preserveCoords.has(key)) continue;

    if (!clearedSet.has(key)) {
      clearedSet.add(key);
    }

    const piece = cell.piece;
    if (piece && piece.special !== 'none' && !triggeredSpecials.has(key)) {
      triggeredSpecials.add(key);
      specialsTriggered++;

      if (piece.special === 'striped-h') {
        beams.push({ r1: cur.r, c1: 0, r2: cur.r, c2: cols - 1, color: FRUIT_META[piece.fruit].color });
        for (let cc = 0; cc < cols; cc++) {
          queue.push({ r: cur.r, c: cc });
        }
      } else if (piece.special === 'striped-v') {
        beams.push({ r1: 0, c1: cur.c, r2: rows - 1, c2: cur.c, color: FRUIT_META[piece.fruit].color });
        for (let rr = 0; rr < rows; rr++) {
          queue.push({ r: rr, c: cur.c });
        }
      } else if (piece.special === 'bomb') {
        explosions.push({ r: cur.r, c: cur.c, radius: 1 });
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            queue.push({ r: cur.r + dr, c: cur.c + dc });
          }
        }
      } else if (piece.special === 'rainbow') {
        // Rainbow triggered by chain reaction picks a random active fruit color on board
        const fruitsOnBoard: FruitType[] = [];
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const p = grid[rr][cc].piece;
            if (p && !p.isBaby && p.special !== 'rainbow') fruitsOnBoard.push(p.fruit);
          }
        }
        const targetFruit = fruitsOnBoard.length > 0 ? rng.pick(fruitsOnBoard) : 'banana';
        for (let rr = 0; rr < rows; rr++) {
          for (let cc = 0; cc < cols; cc++) {
            const p = grid[rr][cc].piece;
            if (p && !p.isBaby && p.fruit === targetFruit) {
              rainbowTargets.push({
                fromR: cur.r,
                fromC: cur.c,
                toR: rr,
                toC: cc,
                color: FRUIT_META[targetFruit].color,
              });
              queue.push({ r: rr, c: cc });
            }
          }
        }
      }
    }
  }

  // Damage crates & peels adjacent to normal fruit matches
  const adjacentSet = new Set<string>();
  for (const m of matchAdjacencyCells) {
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (const [dr, dc] of dirs) {
      const rr = m.r + dr;
      const cc = m.c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
        const adj = grid[rr][cc];
        if (!adj.void && (adj.crate > 0 || adj.peel)) {
          adjacentSet.add(`${rr},${cc}`);
        }
      }
    }
  }

  const cleared: ClearEvent['cleared'] = [];
  let jelliesCleared = 0;
  let cratesCleared = 0;
  let peelsCleared = 0;

  for (const key of clearedSet) {
    const [rs, cs] = key.split(',');
    const r = Number(rs);
    const c = Number(cs);
    const cell = grid[r][c];

    if (cell.crate > 0) {
      cell.crate = Math.max(0, cell.crate - 1);
      cratesCleared++;
      cleared.push({ r, c, fruit: 'coconut', special: 'none' });
      continue;
    }

    if (cell.peel) {
      cell.peel = false;
      peelsCleared++;
    }

    if (cell.jelly > 0) {
      cell.jelly--;
      jelliesCleared++;
    }

    if (cell.piece && !cell.piece.isBaby) {
      cleared.push({ r, c, fruit: cell.piece.fruit, special: cell.piece.special });
      cell.piece = null;
    }
  }

  for (const key of adjacentSet) {
    if (clearedSet.has(key)) continue;
    const [rs, cs] = key.split(',');
    const r = Number(rs);
    const c = Number(cs);
    const cell = grid[r][c];
    if (cell.crate > 0) {
      cell.crate = Math.max(0, cell.crate - 1);
      cratesCleared++;
      cleared.push({ r, c, fruit: 'coconut', special: 'none' });
    } else if (cell.peel) {
      cell.peel = false;
      peelsCleared++;
    }
  }

  return {
    cleared,
    beams,
    explosions,
    rainbowTargets,
    jelliesCleared,
    cratesCleared,
    peelsCleared,
    specialsTriggered,
  };
}

export function applyGravityAndRefill(
  grid: Cell[][],
  activeFruits: FruitType[],
  rng: SeededRng,
): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let movedCount = 0;

  for (let c = 0; c < cols; c++) {
    // Bottom-up pull pieces into empty non-void, non-crate cells
    for (let r = rows - 1; r >= 0; r--) {
      const target = grid[r][c];
      if (target.void || target.crate > 0 || target.piece !== null) continue;

      // Search upward for a piece (skipping voids, stopping at crates!)
      let foundR = -1;
      for (let rr = r - 1; rr >= 0; rr--) {
        if (grid[rr][c].crate > 0) break; // crates block falling pieces
        if (!grid[rr][c].void && grid[rr][c].piece !== null) {
          foundR = rr;
          break;
        }
      }

      if (foundR !== -1) {
        const piece = grid[foundR][c].piece!;
        grid[foundR][c].piece = null;
        target.piece = piece;
        piece.yOffset -= r - foundR;
        movedCount++;
      }
    }

    // Spawn new pieces from the top for any remaining empty non-void, non-crate cells
    let spawnDepth = 1;
    for (let r = rows - 1; r >= 0; r--) {
      const cell = grid[r][c];
      if (!cell.void && cell.crate === 0 && cell.piece === null) {
        const fruit = rng.pick(activeFruits);
        const piece = makePiece(fruit, 'none', false, -(r + spawnDepth));
        cell.piece = piece;
        spawnDepth++;
        movedCount++;
      }
    }
  }

  return movedCount;
}

export function countRemainingJelly(grid: Cell[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (!cell.void && cell.jelly > 0) count++;
    }
  }
  return count;
}

export function countBabiesOnBoard(grid: Cell[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.piece?.isBaby) count++;
    }
  }
  return count;
}

export function rescueExitBabies(grid: Cell[][]): { r: number; c: number }[] {
  const rescued: { r: number; c: number }[] = [];
  for (const row of grid) {
    for (const cell of row) {
      if (cell.exitChute && cell.piece?.isBaby) {
        rescued.push({ r: cell.row, c: cell.col });
        cell.piece = null;
      }
    }
  }
  return rescued;
}
