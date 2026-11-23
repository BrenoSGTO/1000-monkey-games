import type { CellType, PieceId } from './types';

export interface PieceTheme {
  id: PieceId;
  name: string;
  topColor: string;
  bottomColor: string;
  borderColor: string;
  glowColor: string;
  emblem: 'banana' | 'coconut' | 'monkey' | 'vine' | 'chili' | 'acai' | 'papaya';
  monkeyCellIndex: number;
}

export const ALL_PIECES: PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const PIECE_THEMES: Record<PieceId, PieceTheme> = {
  I: {
    id: 'I',
    name: 'Cacho de Banana',
    topColor: '#fef08a',
    bottomColor: '#eab308',
    borderColor: '#854d0e',
    glowColor: '#fde047',
    emblem: 'banana',
    monkeyCellIndex: 1,
  },
  O: {
    id: 'O',
    name: 'Caixote de Coco',
    topColor: '#fed7aa',
    bottomColor: '#b45309',
    borderColor: '#451a03',
    glowColor: '#fbbf24',
    emblem: 'coconut',
    monkeyCellIndex: 0,
  },
  T: {
    id: 'T',
    name: 'Macaco Acrobata',
    topColor: '#e879f9',
    bottomColor: '#9333ea',
    borderColor: '#4c1d95',
    glowColor: '#d946ef',
    emblem: 'monkey',
    monkeyCellIndex: 2,
  },
  S: {
    id: 'S',
    name: 'Cipó Maluco',
    topColor: '#86efac',
    bottomColor: '#16a34a',
    borderColor: '#14532d',
    glowColor: '#4ade80',
    emblem: 'vine',
    monkeyCellIndex: 1,
  },
  Z: {
    id: 'Z',
    name: 'Pimenta Ardida',
    topColor: '#fda4af',
    bottomColor: '#e11d48',
    borderColor: '#881337',
    glowColor: '#fb7185',
    emblem: 'chili',
    monkeyCellIndex: 2,
  },
  J: {
    id: 'J',
    name: 'Barril de Açaí',
    topColor: '#7dd3fc',
    bottomColor: '#2563eb',
    borderColor: '#1e3a8a',
    glowColor: '#38bdf8',
    emblem: 'acai',
    monkeyCellIndex: 1,
  },
  L: {
    id: 'L',
    name: 'Caixote de Mamão',
    topColor: '#fdba74',
    bottomColor: '#ea580c',
    borderColor: '#7c2d12',
    glowColor: '#fb923c',
    emblem: 'papaya',
    monkeyCellIndex: 2,
  },
};

/**
 * Coordinates [dx, dy] relative to piece top-left bounding box (0..3 for I/O, 0..2 for T/S/Z/J/L)
 */
export const PIECE_SHAPES: Record<PieceId, readonly (readonly [number, number])[][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

// SRS wall kick tables adapted for +Y downward board coordinates
const JLSTZ_KICKS: Record<string, readonly [number, number][]> = {
  '0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS: Record<string, readonly [number, number][]> = {
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function getKickOffsets(
  piece: PieceId,
  fromRot: 0 | 1 | 2 | 3,
  toRot: 0 | 1 | 2 | 3,
): readonly [number, number][] {
  if (piece === 'O') return [[0, 0]];
  const key = `${fromRot}->${toRot}`;
  if (piece === 'I') {
    return I_KICKS[key] ?? [[0, 0]];
  }
  return JLSTZ_KICKS[key] ?? [[0, 0]];
}

export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BagRandomizer {
  private rng: () => number;
  private bag: PieceId[] = [];

  constructor(seed?: number) {
    this.rng = seed !== undefined ? createSeededRng(seed) : () => Math.random();
    this.refill();
  }

  private refill(): void {
    const fresh: PieceId[] = [...ALL_PIECES];
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = fresh[i];
      fresh[i] = fresh[j];
      fresh[j] = tmp;
    }
    this.bag.push(...fresh);
  }

  next(): PieceId {
    if (this.bag.length <= 7) {
      this.refill();
    }
    return this.bag.shift()!;
  }
}

export function cellToChar(type: CellType | null): string {
  if (!type) return '.';
  return type === 'GARBAGE' ? 'G' : type;
}

export function charToCell(ch: string): CellType | null {
  switch (ch) {
    case 'I':
    case 'O':
    case 'T':
    case 'S':
    case 'Z':
    case 'J':
    case 'L':
      return ch;
    case 'G':
      return 'GARBAGE';
    default:
      return null;
  }
}
