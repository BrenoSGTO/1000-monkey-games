import type { Season } from './types';
import { CROPS } from './data';
import { BuildingDef } from './layout';
import { hash2 } from './util';
import { mk, R, P, outline, shade, type G2 } from './sprites';

// ---------------------------------------------------------------- Tiles

export interface TileSet {
  grass: HTMLCanvasElement[];
  flower: HTMLCanvasElement[];
  dirt: HTMLCanvasElement[];
  sand: HTMLCanvasElement[];
  water: HTMLCanvasElement[];
  deep: HTMLCanvasElement[];
  bridge: HTMLCanvasElement[];
  rock: HTMLCanvasElement[];
  floor: HTMLCanvasElement[];
  plank: HTMLCanvasElement[];
  tilled: HTMLCanvasElement;
  wet: HTMLCanvasElement;
}

const GRASS_COL = [
  ['#6cc24a', '#5aad3c', '#86d65c'],
  ['#52b040', '#42993a', '#68c850'],
  ['#b0a440', '#9a8e34', '#c4b858'],
  ['#e6eff3', '#d0dde5', '#fafdff'],
];

function noiseDots(g: G2, seed: number, cols: string[], count: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash2(i, seed, 11) * 16);
    const y = Math.floor(hash2(i, seed, 23) * 16);
    P(g, cols[Math.floor(hash2(i, seed, 5) * cols.length)], x, y);
  }
}

function grassTile(season: Season, v: number, flower: boolean): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  const [b, d, l] = GRASS_COL[season];
  R(g, b, 0, 0, 16, 16);
  noiseDots(g, v + 7, [d, l, d], 22);
  // tufos
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(hash2(i, v, 91) * 13);
    const y = 2 + Math.floor(hash2(i, v, 47) * 12);
    P(g, d, x, y);
    P(g, d, x - 1, y - 1);
    P(g, d, x + 1, y - 1);
  }
  if (flower) {
    const cols = [
      ['#ff8ab8', '#ffffff', '#ffe066'],
      ['#ffe066', '#ff6a4a', '#ffffff'],
      ['#c8602a', '#e8a040', '#8a4a20'],
      ['#ffffff', '#cfe8ff', '#ffffff'],
    ][season];
    for (let i = 0; i < 2; i++) {
      const x = 2 + Math.floor(hash2(i, v, 3) * 11);
      const y = 3 + Math.floor(hash2(i, v, 8) * 10);
      const col = cols[(v + i) % 3];
      if (season === 3) {
        P(g, col, x, y);
        P(g, '#bcd0dc', x + 1, y);
      } else {
        P(g, col, x, y);
        P(g, col, x - 1, y);
        P(g, col, x + 1, y);
        P(g, col, x, y - 1);
        P(g, col, x, y + 1);
        P(g, '#ffe066', x, y);
      }
    }
  }
  return c;
}

function dirtTile(v: number, season: Season): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, season === 3 ? '#c9b8a0' : '#c19a62', 0, 0, 16, 16);
  noiseDots(g, v + 3, season === 3 ? ['#b8a78e', '#dccfb8'] : ['#a8814e', '#d4ac74', '#b88e58'], 26);
  return c;
}

function sandTile(v: number): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, '#ebd79c', 0, 0, 16, 16);
  noiseDots(g, v + 31, ['#d8c284', '#f6e8b4', '#c9b274'], 22);
  if (v === 2) {
    P(g, '#fff', 5, 6);
    P(g, '#ffb4c0', 6, 6);
  }
  return c;
}

function waterTile(frame: number, deep: boolean): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, deep ? '#2a6fb8' : '#3c8fd8', 0, 0, 16, 16);
  R(g, deep ? '#2f78c4' : '#4aa0e8', 0, 6, 16, 4);
  for (let i = 0; i < 4; i++) {
    const y = 2 + i * 4;
    const off = (frame * 4 + i * 5) % 16;
    R(g, deep ? '#6aaaf0' : '#9ad4ff', off % 12, y, 4, 1);
    R(g, deep ? '#6aaaf0' : '#9ad4ff', (off + 8) % 12, (y + 2) % 16, 3, 1);
  }
  return c;
}

function bridgeTile(v: number): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, '#a8763e', 0, 0, 16, 16);
  for (let i = 0; i < 4; i++) {
    R(g, '#c18f52', 0, i * 4, 16, 3);
    R(g, '#7a5028', 0, i * 4 + 3, 16, 1);
  }
  P(g, '#5a3a1a', 2, 1 + v);
  P(g, '#5a3a1a', 13, 5);
  return c;
}

function plankTile(v: number): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, '#b98a50', 0, 0, 16, 16);
  for (let i = 0; i < 4; i++) {
    R(g, '#d3a468', i * 4, 0, 3, 16);
    R(g, '#8a6030', i * 4 + 3, 0, 1, 16);
  }
  P(g, '#5a3a1a', 1, 2 + v);
  P(g, '#5a3a1a', 9, 12);
  return c;
}

function rockTile(v: number, top: boolean): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, '#6a6874', 0, 0, 16, 16);
  noiseDots(g, v + 55, ['#5a5864', '#7c7a88', '#4a4854'], 36);
  R(g, '#8a8896', 0, 0, 16, 2);
  R(g, '#4a4854', 0, 14, 16, 2);
  if (top) {
    R(g, '#8a8896', 2, 5, 5, 1);
    R(g, '#4a4854', 9, 9, 5, 1);
  }
  return c;
}

function floorTile(v: number): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, '#5a4c40', 0, 0, 16, 16);
  noiseDots(g, v + 77, ['#4a3e34', '#6a5a4c', '#3a3028'], 28);
  return c;
}

function soilTile(wet: boolean): HTMLCanvasElement {
  const [c, g] = mk(16, 16);
  R(g, wet ? '#5a3b22' : '#8a5e36', 0, 0, 16, 16);
  for (let i = 0; i < 4; i++) {
    R(g, wet ? '#3f2916' : '#6a4526', 0, i * 4 + 2, 16, 1);
    R(g, wet ? '#6e4a2c' : '#a07446', 0, i * 4, 16, 1);
  }
  R(g, wet ? '#4a3018' : '#744e2c', 0, 0, 16, 1);
  return c;
}

const tilesetCache: (TileSet | null)[] = [null, null, null, null];

export function tileset(season: Season): TileSet {
  const hit = tilesetCache[season];
  if (hit) return hit;
  const ts: TileSet = {
    grass: [0, 1, 2, 3, 4, 5].map((i) => grassTile(season, i, false)),
    flower: [0, 1, 2, 3].map((i) => grassTile(season, 10 + i, true)),
    dirt: [0, 1, 2].map((i) => dirtTile(i, season)),
    sand: [0, 1, 2].map((i) => sandTile(i)),
    water: [0, 1, 2, 3].map((i) => waterTile(i, false)),
    deep: [0, 1, 2, 3].map((i) => waterTile(i, true)),
    bridge: [0, 1].map((i) => bridgeTile(i)),
    rock: [0, 1, 2, 3].map((i) => rockTile(i, i % 2 === 0)),
    floor: [0, 1, 2].map((i) => floorTile(i)),
    plank: [0, 1].map((i) => plankTile(i)),
    tilled: soilTile(false),
    wet: soilTile(true),
  };
  tilesetCache[season] = ts;
  return ts;
}

// ---------------------------------------------------------------- Árvores & objetos

const objCache = new Map<string, HTMLCanvasElement>();

function cached(key: string, w: number, h: number, draw: (g: G2) => void, ol = true): HTMLCanvasElement {
  const hit = objCache.get(key);
  if (hit) return hit;
  const [c, g] = mk(w, h);
  draw(g);
  if (ol) outline(c);
  objCache.set(key, c);
  return c;
}

const CANOPY = [
  ['#58b848', '#3f9a38', '#7ad060'],
  ['#3f9a3a', '#2f8030', '#58b448'],
  ['#e07a2a', '#c85a22', '#f0a040'],
  ['#e8f0f4', '#c8d6de', '#ffffff'],
];

/** Árvore 32x48; âncora no pé do tronco (meio-baixo). */
export function treeSprite(season: Season, v: number): HTMLCanvasElement {
  return cached(`tree${season}${v}`, 34, 50, (g) => {
    g.translate(1, 1);
    const [a, d, l] = CANOPY[season];
    // tronco
    R(g, '#7a4a28', 12, 28, 8, 20);
    R(g, '#5a3418', 12, 28, 2, 20);
    R(g, '#9a6038', 17, 30, 2, 16);
    R(g, '#5a3418', 9, 44, 14, 4);
    if (season === 3) {
      // galhos secos com neve
      R(g, '#6a4220', 8, 22, 16, 3);
      R(g, '#6a4220', 4, 14, 3, 10);
      R(g, '#6a4220', 25, 12, 3, 12);
      R(g, '#6a4220', 14, 8, 4, 16);
      R(g, '#6a4220', 9, 6, 3, 10);
      R(g, '#6a4220', 20, 5, 3, 9);
      R(g, '#f6fbff', 3, 12, 5, 3);
      R(g, '#f6fbff', 24, 10, 5, 3);
      R(g, '#f6fbff', 13, 6, 6, 3);
      R(g, '#f6fbff', 8, 20, 17, 3);
      return;
    }
    const sx = v ? 1 : 0;
    R(g, d, 4 + sx, 12, 24, 16);
    R(g, d, 8, 6, 17, 8);
    R(g, a, 5, 10 - sx, 22, 14);
    R(g, a, 9, 4, 14, 8);
    R(g, a, 12, 2, 8, 4);
    R(g, l, 8, 6, 8, 3);
    R(g, l, 6, 12, 6, 3);
    R(g, l, 17 + sx, 10, 6, 3);
    R(g, d, 5, 22, 22, 3);
    R(g, d, 18, 16, 6, 4);
    if (season === 0) {
      for (let i = 0; i < 8; i++) {
        const x = 6 + Math.floor(hash2(i, v, 1) * 20);
        const y = 6 + Math.floor(hash2(i, v, 2) * 16);
        R(g, i % 2 ? '#ffb6d0' : '#ffffff', x, y, 2, 2);
      }
    }
    if (season === 2) {
      for (let i = 0; i < 6; i++) {
        const x = 6 + Math.floor(hash2(i, v, 4) * 20);
        const y = 6 + Math.floor(hash2(i, v, 5) * 16);
        R(g, i % 2 ? '#f6c040' : '#c04020', x, y, 2, 2);
      }
    }
  });
}

export function palmSprite(): HTMLCanvasElement {
  return cached('palm', 34, 50, (g) => {
    g.translate(1, 1);
    for (let i = 0; i < 6; i++) {
      R(g, '#8a6a3a', 14 + (i % 2), 46 - i * 6, 5, 7);
      R(g, '#6a4a22', 14 + (i % 2), 46 - i * 6, 1, 7);
    }
    const fr = '#3f9a42';
    const fl = '#62c050';
    R(g, fr, 4, 8, 12, 3);
    R(g, fr, 16, 8, 12, 3);
    R(g, fr, 8, 4, 6, 3);
    R(g, fr, 18, 4, 6, 3);
    R(g, fr, 2, 11, 6, 3);
    R(g, fr, 24, 11, 6, 3);
    R(g, fr, 13, 2, 6, 4);
    R(g, fl, 5, 8, 8, 1);
    R(g, fl, 19, 8, 8, 1);
    R(g, '#7a5a22', 13, 11, 3, 3);
    R(g, '#7a5a22', 17, 11, 3, 3);
  });
}

export function rockSprite(kind: 'rock' | 'boulder', v: number): HTMLCanvasElement {
  return cached(`rock${kind}${v}`, 20, 20, (g) => {
    g.translate(1, 1);
    if (kind === 'rock') {
      R(g, '#9aa0aa', 3, 6, 10, 8);
      R(g, '#8a909a', 2, 9, 12, 5);
      R(g, '#c8ced6', 4, 6, 5, 2);
      R(g, '#6a707a', 3, 12, 11, 2);
      if (v) R(g, '#6ab04a', 9, 7, 3, 1);
    } else {
      R(g, '#7a808a', 1, 3, 14, 12);
      R(g, '#9aa0aa', 3, 2, 10, 4);
      R(g, '#6a707a', 2, 12, 13, 3);
      R(g, '#b8bec8', 4, 3, 5, 2);
      R(g, '#5a606a', 7, 7, 1, 4);
      R(g, '#6ab04a', 2, 4, 3, 1);
      R(g, '#6ab04a', 11, 5, 3, 1);
    }
  });
}

export function weedSprite(season: Season, v: number): HTMLCanvasElement {
  return cached(`weed${season}${v}`, 18, 18, (g) => {
    g.translate(1, 1);
    const col = ['#4aa83a', '#3a9a30', '#b08a30', '#c6d4cc'][season];
    const col2 = ['#6cc85a', '#58b848', '#d0a848', '#e8f0f0'][season];
    R(g, col, 3, 8, 2, 6);
    R(g, col, 7, 5, 2, 9);
    R(g, col, 11, 8, 2, 6);
    R(g, col2, 2, 6, 2, 3);
    R(g, col2, 8, 4, 2, 3);
    R(g, col2, 12, 6, 2, 3);
    R(g, col, 5, 10, 6, 4);
    if (v % 3 === 0 && season < 2) {
      R(g, season === 0 ? '#ff8ab8' : '#ffe066', 7, 3, 2, 2);
    }
  });
}

export function twigSprite(v: number): HTMLCanvasElement {
  return cached(`twig${v}`, 18, 18, (g) => {
    g.translate(1, 1);
    R(g, '#8a5a30', 2, 10, 11, 2);
    R(g, '#6a4220', 2, 11, 11, 1);
    R(g, '#8a5a30', 5, 7, 2, 4);
    R(g, '#8a5a30', 10, 8, 3, 2);
    P(g, '#4aa83a', 5, 6);
  });
}

export function stumpSprite(season: Season): HTMLCanvasElement {
  return cached(`stump${season}`, 20, 20, (g) => {
    g.translate(1, 1);
    R(g, '#7a4a28', 3, 6, 10, 9);
    R(g, '#a9774a', 3, 4, 10, 4);
    R(g, '#c99a62', 5, 5, 6, 2);
    R(g, '#5a3418', 3, 13, 10, 2);
    if (season === 3) R(g, '#f6fbff', 3, 3, 10, 2);
  });
}

export function bushSprite(season: Season, v: number): HTMLCanvasElement {
  return cached(`bush${season}${v}`, 20, 18, (g) => {
    g.translate(1, 1);
    const [a, d, l] = CANOPY[season];
    R(g, d, 1, 6, 14, 8);
    R(g, a, 2, 4, 12, 8);
    R(g, a, 4, 2, 8, 4);
    R(g, l, 4, 4, 4, 2);
    if (season === 0) {
      R(g, '#ff8ab8', 4, 7, 2, 2);
      R(g, '#fff', 10, 5, 2, 2);
    }
  });
}

export function lampSprite(): HTMLCanvasElement {
  return cached('lamp', 14, 34, (g) => {
    g.translate(1, 1);
    R(g, '#3a3a46', 5, 8, 2, 22);
    R(g, '#2a2a34', 3, 28, 6, 3);
    R(g, '#2a2a34', 2, 4, 8, 4);
    R(g, '#ffe48a', 3, 5, 6, 3);
    R(g, '#2a2a34', 4, 2, 4, 2);
  });
}

export function benchSprite(): HTMLCanvasElement {
  return cached('bench', 20, 18, (g) => {
    g.translate(1, 1);
    R(g, '#b98a50', 1, 5, 16, 3);
    R(g, '#d3a468', 1, 5, 16, 1);
    R(g, '#b98a50', 1, 9, 16, 3);
    R(g, '#6a4420', 2, 12, 2, 4);
    R(g, '#6a4420', 14, 12, 2, 4);
    R(g, '#8a6030', 2, 2, 2, 7);
    R(g, '#8a6030', 14, 2, 2, 7);
  });
}

export function wellSprite(): HTMLCanvasElement {
  return cached('well', 20, 30, (g) => {
    g.translate(1, 1);
    R(g, '#8a8a94', 1, 14, 14, 12);
    R(g, '#a8a8b2', 1, 14, 14, 3);
    R(g, '#2a4a7a', 3, 15, 10, 2);
    R(g, '#6a6a74', 1, 22, 14, 4);
    R(g, '#7a4a28', 1, 3, 2, 14);
    R(g, '#7a4a28', 13, 3, 2, 14);
    R(g, '#c0503a', 0, 0, 16, 4);
    R(g, '#a03a28', 0, 4, 16, 1);
    R(g, '#d3a468', 7, 6, 2, 8);
  });
}

export function flowerbedSprite(v: number): HTMLCanvasElement {
  return cached(`fb${v}`, 18, 16, (g) => {
    g.translate(1, 0);
    R(g, '#7a4a28', 0, 8, 16, 7);
    R(g, '#5a3418', 0, 13, 16, 2);
    R(g, '#4aa83a', 1, 5, 14, 5);
    const cols = [['#ff6a8a', '#ffe066', '#ffffff'], ['#a566d6', '#ff9ad0', '#ffe066'], ['#ff8a3a', '#ffe066', '#ff5a5a']][v % 3];
    for (let i = 0; i < 6; i++) {
      R(g, cols[i % 3], 1 + i * 2 + (i % 2), 3 + (i % 3), 2, 2);
    }
  });
}

export function shipboxSprite(): HTMLCanvasElement {
  return cached('shipbox', 20, 20, (g) => {
    g.translate(1, 1);
    R(g, '#8a5a30', 1, 6, 14, 10);
    R(g, '#b98a50', 1, 6, 14, 3);
    R(g, '#6a4220', 1, 14, 14, 2);
    R(g, '#d3a468', 0, 3, 16, 4);
    R(g, '#8a5a30', 0, 6, 16, 1);
    R(g, '#ffd84a', 6, 10, 4, 3);
    R(g, '#6a4220', 7, 11, 2, 1);
  });
}

export function troughSprite(hay: boolean): HTMLCanvasElement {
  return cached(`trough${hay ? 1 : 0}`, 20, 16, (g) => {
    g.translate(1, 1);
    R(g, '#8a5a30', 0, 6, 16, 8);
    R(g, '#6a4220', 1, 7, 14, 5);
    R(g, '#b98a50', 0, 5, 16, 2);
    R(g, '#6a4220', 1, 13, 3, 2);
    R(g, '#6a4220', 12, 13, 3, 2);
    if (hay) {
      R(g, '#e0c24a', 2, 5, 12, 4);
      R(g, '#f4dc6a', 4, 4, 3, 2);
      R(g, '#f4dc6a', 9, 4, 3, 2);
    }
  });
}

export function boatSprite(): HTMLCanvasElement {
  return cached('boat', 28, 18, (g) => {
    g.translate(1, 1);
    R(g, '#8a5a30', 1, 8, 24, 6);
    R(g, '#b98a50', 0, 6, 26, 3);
    R(g, '#6a4220', 3, 13, 20, 2);
    R(g, '#c0392b', 1, 8, 24, 1);
    R(g, '#7a4a28', 12, 0, 2, 8);
    R(g, '#f4f4f4', 14, 1, 8, 6);
  });
}

export function signSprite(): HTMLCanvasElement {
  return cached('sign', 18, 22, (g) => {
    g.translate(1, 1);
    R(g, '#6a4420', 7, 8, 2, 12);
    R(g, '#d3a468', 1, 2, 14, 8);
    R(g, '#8a5a30', 1, 9, 14, 1);
    R(g, '#6a4420', 3, 4, 10, 1);
    R(g, '#6a4420', 3, 6, 7, 1);
  });
}

export function fenceDraw(g: G2, x: number, y: number, right: boolean, down: boolean, season: Season): void {
  const col = season === 3 ? '#d8d0c0' : '#c99a62';
  const dk = '#7a5028';
  if (right) {
    R(g, col, x + 8, y + 6, 8, 2);
    R(g, dk, x + 8, y + 8, 8, 1);
    R(g, col, x + 8, y + 10, 8, 2);
    R(g, dk, x + 8, y + 12, 8, 1);
  }
  if (down) {
    R(g, col, x + 6, y + 8, 2, 8);
    R(g, dk, x + 8, y + 8, 1, 8);
  }
  R(g, dk, x + 5, y + 3, 6, 12);
  R(g, col, x + 6, y + 3, 4, 11);
  R(g, '#e0b878', x + 6, y + 3, 4, 1);
  if (season === 3) R(g, '#ffffff', x + 5, y + 2, 6, 2);
}

// ---------------------------------------------------------------- Prédios

export interface BuildingArt {
  canvas: HTMLCanvasElement;
  windows: [number, number][];
}
const bArt = new Map<string, BuildingArt>();

function roof(g: G2, W: number, rh: number, col: string): void {
  const d = shade(col, -0.3);
  const l = shade(col, 0.2);
  for (let y = 0; y < rh; y++) {
    const inset = Math.floor((rh - 1 - y) / 3);
    R(g, y % 4 === 3 ? d : col, inset, y, W - inset * 2, 1);
    if (y % 4 === 0) R(g, l, inset, y, W - inset * 2, 1);
  }
  for (let x = 3; x < W - 3; x += 6) {
    for (let y = 2; y < rh - 2; y += 4) {
      R(g, d, x + ((y / 4) % 2) * 3, y, 1, 3);
    }
  }
  R(g, d, 0, rh, W, 2);
}

function door(g: G2, W: number, H: number, dx: number, dw: number, col: string): void {
  const x = dx * 16 + (16 - dw) / 2;
  const h = 22;
  R(g, '#3a2210', x - 1, H - h - 1, dw + 2, h + 1);
  R(g, col, x, H - h, dw, h);
  R(g, shade(col, 0.2), x, H - h, dw, 2);
  R(g, shade(col, -0.25), x + dw / 2, H - h, 1, h);
  P(g, '#ffd84a', x + dw - 3, H - 10);
}

function windowAt(g: G2, x: number, y: number, art: BuildingArt): void {
  R(g, '#fdf2c8', x, y, 8, 8);
  R(g, '#7ac4f0', x + 1, y + 1, 6, 6);
  R(g, '#ffffff', x + 1, y + 1, 2, 2);
  R(g, '#6a4220', x + 3, y + 1, 1, 6);
  R(g, '#6a4220', x + 1, y + 3, 6, 1);
  R(g, '#6a4220', x - 1, y + 8, 10, 1);
  art.windows.push([x + 4, y + 4]);
}

function signBoard(g: G2, cx: number, y: number, kind: string): void {
  R(g, '#6a4220', cx - 9, y, 18, 10);
  R(g, '#e8c88a', cx - 8, y + 1, 16, 8);
  switch (kind) {
    case 'banana':
      R(g, '#f7d63c', cx - 4, y + 3, 8, 3);
      R(g, '#f7d63c', cx - 5, y + 2, 2, 3);
      R(g, '#6a4220', cx + 4, y + 2, 1, 2);
      break;
    case 'anvil':
      R(g, '#3a3a46', cx - 5, y + 3, 10, 2);
      R(g, '#3a3a46', cx - 2, y + 5, 4, 2);
      R(g, '#3a3a46', cx - 7, y + 3, 2, 1);
      break;
    case 'egg':
      R(g, '#fff', cx - 3, y + 2, 4, 5);
      R(g, '#ffe8a0', cx + 1, y + 3, 3, 4);
      break;
    case 'fish':
      R(g, '#4a8ad8', cx - 4, y + 3, 6, 3);
      R(g, '#4a8ad8', cx + 2, y + 2, 2, 5);
      P(g, '#fff', cx - 3, y + 3);
      break;
    case 'pick':
      R(g, '#6a4220', cx - 1, y + 2, 2, 6);
      R(g, '#9aa3ad', cx - 5, y + 2, 10, 2);
      break;
    case 'gem':
      R(g, '#7ae6ff', cx - 3, y + 3, 6, 3);
      R(g, '#b8f4ff', cx - 2, y + 2, 4, 1);
      R(g, '#4ab8d8', cx - 2, y + 6, 4, 1);
      break;
  }
}

export function buildingArt(b: BuildingDef): BuildingArt {
  const hit = bArt.get(b.id);
  if (hit) return hit;
  const W = b.w * 16;
  const H = b.h * 16;
  const [c, g] = mk(W + 2, H + 2);
  const art: BuildingArt = { canvas: c, windows: [] };
  g.translate(1, 1);
  const rh = Math.round(H * 0.46);
  const cx = b.dx * 16 + 8;
  switch (b.kind) {
    case 'casa': {
      R(g, '#e8c88a', 0, rh, W, H - rh);
      for (let y = rh + 4; y < H; y += 6) R(g, '#cfa766', 0, y, W, 1);
      R(g, '#a8814e', 0, H - 3, W, 3);
      roof(g, W, rh, '#c0503a');
      R(g, '#8a8a94', W - 14, 0, 8, 12);
      R(g, '#6a6a74', W - 14, 0, 8, 2);
      door(g, W, H, b.dx, 12, '#8a5030');
      windowAt(g, 10, rh + 10, art);
      windowAt(g, W - 20, rh + 10, art);
      R(g, '#7a4a28', 8, rh + 19, 12, 3);
      R(g, '#ff6a8a', 9, rh + 18, 2, 2);
      R(g, '#ffe066', 13, rh + 18, 2, 2);
      R(g, '#ff6a8a', 17, rh + 18, 2, 2);
      break;
    }
    case 'mercado': {
      R(g, '#f0e0b0', 0, rh, W, H - rh);
      R(g, '#d8c690', 0, H - 3, W, 3);
      roof(g, W, rh, '#3f8a5a');
      for (let x = 0; x < W; x += 8) {
        R(g, (x / 8) % 2 ? '#ffffff' : '#e8403a', x, rh + 2, 8, 9);
        R(g, (x / 8) % 2 ? '#e0e0e0' : '#b82a26', x, rh + 9, 8, 2);
      }
      door(g, W, H, b.dx, 14, '#8a5030');
      windowAt(g, 8, rh + 14, art);
      windowAt(g, W - 16, rh + 14, art);
      signBoard(g, cx, 3, 'banana');
      break;
    }
    case 'ferraria': {
      R(g, '#8a8a94', 0, rh, W, H - rh);
      for (let y = rh + 3; y < H; y += 5) R(g, '#6a6a74', 0, y, W, 1);
      for (let x = 4; x < W; x += 9) for (let y = rh + 3; y < H; y += 10) R(g, '#6a6a74', x, y, 1, 5);
      roof(g, W, rh, '#4a4a56');
      R(g, '#5a5a66', W - 16, -2, 10, 14);
      R(g, '#2a2a34', W - 16, -2, 10, 2);
      door(g, W, H, b.dx, 14, '#3a2a20');
      R(g, '#ff8a30', cx - 5, H - 14, 10, 12);
      R(g, '#ffd84a', cx - 3, H - 10, 6, 8);
      windowAt(g, 8, rh + 12, art);
      signBoard(g, 18, rh - 8, 'anvil');
      art.windows.push([cx, H - 8]);
      break;
    }
    case 'celeiro': {
      R(g, '#b8392e', 0, rh, W, H - rh);
      for (let x = 0; x < W; x += 4) R(g, '#9a2e24', x, rh, 1, H - rh);
      roof(g, W, rh, '#6a3a2a');
      R(g, '#f4efe2', 0, rh, W, 1);
      const dwi = 28;
      const dxp = b.dx * 16 + 8 - 14 + 8;
      R(g, '#f4efe2', dxp - 2, H - 22, dwi + 4, 22);
      R(g, '#8a2a20', dxp, H - 20, dwi, 20);
      R(g, '#f4efe2', dxp + dwi / 2 - 1, H - 20, 2, 20);
      for (let i = 0; i < 3; i++) R(g, '#f4efe2', dxp + 2 + i * 4, H - 20 + i * 6, 10, 1);
      R(g, '#2a1a10', cx - 4 + 8 - 8, rh + 4, 8, 6);
      break;
    }
    case 'fazendinha': {
      R(g, '#e0a060', 0, rh, W, H - rh);
      for (let x = 0; x < W; x += 5) R(g, '#c88848', x, rh, 1, H - rh);
      roof(g, W, rh, '#8a5a3a');
      door(g, W, H, b.dx, 14, '#7a4a28');
      windowAt(g, 8, rh + 12, art);
      windowAt(g, W - 16, rh + 12, art);
      signBoard(g, cx, 3, 'egg');
      R(g, '#e0c24a', W - 12, H - 6, 10, 6);
      break;
    }
    case 'prefeitura': {
      R(g, '#f4efe2', 0, rh, W, H - rh);
      for (let x = 4; x < W; x += 12) R(g, '#d8d0bc', x, rh + 4, 3, H - rh - 8);
      R(g, '#bfb8a0', 0, H - 3, W, 3);
      roof(g, W, rh, '#2f5a8a');
      R(g, '#f4efe2', cx - 7, 2, 14, 14);
      R(g, '#2a2a34', cx - 6, 3, 12, 12);
      R(g, '#fdf2c8', cx - 5, 4, 10, 10);
      R(g, '#2a2a34', cx, 5, 1, 5);
      R(g, '#2a2a34', cx, 9, 4, 1);
      R(g, '#6a4220', cx, -10, 1, 12);
      R(g, '#2f9a4a', cx + 1, -10, 8, 3);
      R(g, '#f5d142', cx + 1, -7, 8, 3);
      door(g, W, H, b.dx, 14, '#6a4a2a');
      windowAt(g, 10, rh + 12, art);
      windowAt(g, W - 18, rh + 12, art);
      break;
    }
    case 'dalva': {
      R(g, '#7aa8d0', 0, rh, W, H - rh);
      for (let y = rh + 4; y < H; y += 5) R(g, '#5a88b0', 0, y, W, 1);
      roof(g, W, rh, '#8a5a3a');
      door(g, W, H, b.dx, 12, '#f0a020');
      windowAt(g, W - 18, rh + 8, art);
      signBoard(g, 14, rh - 6, 'gem');
      break;
    }
    case 'cabana': {
      R(g, '#c9a06a', 0, rh, W, H - rh);
      for (let x = 0; x < W; x += 4) R(g, '#a8814e', x, rh, 1, H - rh);
      roof(g, W, rh, '#c8a040');
      for (let x = 2; x < W - 2; x += 5) R(g, '#a07a28', x, 2, 1, rh - 2);
      door(g, W, H, b.dx, 12, '#6a4220');
      windowAt(g, 10, rh + 6, art);
      windowAt(g, W - 18, rh + 6, art);
      signBoard(g, cx + 22, rh - 4, 'fish');
      R(g, '#ff6a4a', 4, H - 8, 5, 5);
      break;
    }
    case 'mina': {
      R(g, '#6a6874', 0, 6, W, H - 6);
      for (let i = 0; i < 14; i++) {
        R(g, i % 2 ? '#5a5864' : '#7c7a88', Math.floor(hash2(i, 5, 1) * (W - 6)), 8 + Math.floor(hash2(i, 5, 2) * (H - 14)), 6, 3);
      }
      R(g, '#8a8896', 0, 0, W, 8);
      R(g, '#6a6874', 4, 2, W - 8, 6);
      const dxp = cx - 12;
      R(g, '#1a1418', dxp, H - 30, 24, 30);
      R(g, '#1a1418', dxp + 3, H - 34, 18, 4);
      R(g, '#2a2024', dxp + 6, H - 24, 12, 24);
      R(g, '#7a4a28', dxp - 3, H - 32, 4, 32);
      R(g, '#7a4a28', dxp + 23, H - 32, 4, 32);
      R(g, '#7a4a28', dxp - 3, H - 36, 30, 4);
      R(g, '#a9774a', dxp - 3, H - 36, 30, 1);
      signBoard(g, cx, 0, 'pick');
      art.windows.push([cx, H - 10]);
      break;
    }
    default:
      R(g, '#ccc', 0, 0, W, H);
  }
  outline(c);
  bArt.set(b.id, art);
  return art;
}

// ---------------------------------------------------------------- Plantas

function leafFan(g: G2, cx: number, base: number, h: number, w: number, col: string): void {
  const d = shade(col, -0.25);
  const l = shade(col, 0.25);
  for (let i = 0; i < h; i++) {
    const ww = Math.max(1, Math.round(w * (0.4 + (i / h) * 0.6)));
    R(g, i % 3 === 0 ? l : col, cx - Math.floor(ww / 2), base - i, ww, 1);
  }
  R(g, d, cx - Math.floor(w / 2), base, w, 1);
}

export function cropSprite(k: string, stage: number): HTMLCanvasElement {
  return cached(`crop${k}${stage}`, 16, 18, (g) => {
    const cd = CROPS[k];
    if (!cd) return;
    g.translate(0, 1);
    const L = cd.leaf;
    const Ld = shade(L, -0.25);
    const base = 14;
    if (stage === 0) {
      R(g, '#5a3b22', 6, 14, 4, 1);
      R(g, L, 7, 11, 2, 3);
      R(g, shade(L, 0.25), 5, 10, 2, 2);
      R(g, shade(L, 0.25), 9, 10, 2, 2);
      return;
    }
    switch (cd.shape) {
      case 'root':
      case 'leafy': {
        const h = [0, 5, 8, 10, 11][stage];
        const w = [0, 6, 9, 12, 14][stage];
        leafFan(g, 8, base, h, w, L);
        if (stage === 4) {
          if (cd.shape === 'root') {
            R(g, cd.fruit, 5, 13, 6, 3);
            R(g, cd.fruit2, 6, 13, 2, 1);
            R(g, shade(cd.fruit, -0.3), 4, 14, 2, 2);
          } else {
            R(g, cd.fruit, 3, 6, 10, 9);
            R(g, cd.fruit2, 5, 7, 4, 3);
            R(g, shade(cd.fruit, -0.25), 3, 13, 10, 2);
            R(g, shade(cd.fruit, -0.25), 7, 7, 1, 7);
          }
        }
        break;
      }
      case 'berry': {
        const h = [0, 4, 6, 8, 9][stage];
        const w = [0, 6, 9, 12, 14][stage];
        leafFan(g, 8, base, h, w, L);
        if (stage >= 3) {
          const n = stage === 4 ? 6 : 2;
          for (let i = 0; i < n; i++) {
            const x = 3 + ((i * 5) % 10);
            const y = 8 + ((i * 3) % 5);
            R(g, cd.fruit, x, y, 2, 2);
            P(g, cd.fruit2, x, y);
          }
        }
        break;
      }
      case 'tall': {
        const h = [0, 5, 9, 13, 15][stage];
        R(g, Ld, 7, base - h, 2, h + 1);
        for (let i = 0; i < Math.floor(h / 3); i++) {
          const y = base - 2 - i * 3;
          R(g, L, 3, y, 4, 2);
          R(g, L, 9, y - 1, 4, 2);
          P(g, shade(L, 0.3), 3, y);
        }
        if (stage === 4) {
          if (k === 'banana') {
            R(g, cd.fruit, 4, 3, 3, 7);
            R(g, cd.fruit, 7, 2, 3, 8);
            R(g, cd.fruit, 10, 3, 3, 6);
            R(g, cd.fruit2, 5, 4, 1, 4);
            R(g, cd.fruit2, 8, 3, 1, 5);
            R(g, '#8a6a1a', 7, 1, 2, 1);
          } else if (k === 'milho') {
            R(g, cd.fruit, 2, 6, 3, 6);
            R(g, cd.fruit, 11, 5, 3, 6);
            R(g, cd.fruit2, 3, 7, 1, 3);
            R(g, '#7ac050', 2, 5, 3, 2);
            R(g, '#7ac050', 11, 4, 3, 2);
          } else {
            R(g, cd.fruit, 3, 7, 3, 4);
            R(g, cd.fruit, 10, 5, 3, 4);
            R(g, cd.fruit2, 4, 8, 1, 2);
            R(g, cd.fruit, 6, 3, 3, 4);
          }
        }
        break;
      }
      case 'palm': {
        const h = [0, 5, 8, 11, 12][stage];
        R(g, '#7a5a30', 7, base - h, 2, h + 1);
        leafFan(g, 8, base - h + 3, 3, 12, L);
        R(g, L, 2, base - h, 4, 2);
        R(g, L, 10, base - h, 4, 2);
        R(g, L, 4, base - h - 2, 8, 2);
        if (stage === 4) {
          for (let i = 0; i < 5; i++) R(g, i % 2 ? cd.fruit : cd.fruit2, 5 + (i % 3) * 2, base - h + 3 + (i % 2) * 2, 2, 2);
        }
        break;
      }
      case 'vine': {
        const w = [0, 6, 10, 13, 15][stage];
        R(g, L, 8 - w / 2, 11, w, 3);
        R(g, shade(L, 0.25), 8 - w / 2 + 1, 10, Math.max(2, w - 4), 2);
        R(g, Ld, 8 - w / 2, 13, w, 1);
        if (stage === 4) {
          R(g, cd.fruit, 3, 5, 10, 9);
          R(g, cd.fruit2, 4, 6, 3, 3);
          R(g, shade(cd.fruit, -0.3), 7, 5, 1, 9);
          R(g, shade(cd.fruit, -0.3), 4, 12, 8, 2);
          R(g, '#4a7a2a', 7, 3, 2, 2);
        }
        break;
      }
      case 'tree': {
        const h = [0, 5, 8, 11, 13][stage];
        R(g, '#7a4a28', 7, base - h + 3, 2, h - 2);
        R(g, L, 4, base - h, 8, 5);
        R(g, shade(L, 0.25), 5, base - h - 1, 5, 2);
        R(g, Ld, 3, base - h + 3, 10, 2);
        if (stage === 4) {
          R(g, cd.fruit, 3, base - h + 4, 3, 3);
          R(g, cd.fruit2, 4, base - h + 5, 1, 1);
          R(g, cd.fruit, 10, base - h + 3, 3, 3);
          R(g, '#6a4a22', 4, base - h + 7, 2, 1);
        }
        break;
      }
    }
  }, false);
}
