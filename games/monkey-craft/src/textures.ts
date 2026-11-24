import { BLOCK_COUNT, B, I } from './types';
import { TOOLS } from './data';

// Texturas 100% procedurais (pixel art 16x16), 4 variantes por bloco.
export const VARIANTS = 4;
export const TEX = 16;
export const WALL_ROW = BLOCK_COUNT; // linha extra: parede de fundo

type RGB = [number, number, number];

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const shade = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];
const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

class Painter {
  constructor(
    public ctx: CanvasRenderingContext2D,
    public ox: number,
    public oy: number,
    public rnd: () => number,
  ) {}
  px(x: number, y: number, c: RGB, a = 1): void {
    if (x < 0 || y < 0 || x >= TEX || y >= TEX) return;
    this.ctx.fillStyle = css(c, a);
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }
  noise(base: RGB, spread: number): void {
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        const f = 1 + (this.rnd() - 0.5) * spread;
        this.px(x, y, shade(base, f));
      }
    }
  }
  blob(cx: number, cy: number, r: number, c: RGB, hi?: RGB): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + 0.5) this.px(cx + x, cy + y, shade(c, 0.9 + this.rnd() * 0.2));
      }
    }
    if (hi) this.px(cx - 1, cy - 1, hi);
  }
  bevel(): void {
    for (let i = 0; i < TEX; i++) {
      this.px(i, 0, [255, 255, 255], 0.1);
      this.px(0, i, [255, 255, 255], 0.07);
      this.px(i, TEX - 1, [0, 0, 0], 0.18);
      this.px(TEX - 1, i, [0, 0, 0], 0.12);
    }
  }
}

const STONE_C: RGB = [122, 125, 132];
const DIRT_C: RGB = [134, 92, 56];

function stoneBase(p: Painter, base: RGB = STONE_C): void {
  p.noise(base, 0.16);
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(p.rnd() * 14);
    const y = Math.floor(p.rnd() * 14);
    p.px(x, y, shade(base, 0.78));
    p.px(x + 1, y, shade(base, 0.78));
  }
  for (let k = 0; k < 5; k++) p.px(Math.floor(p.rnd() * 16), Math.floor(p.rnd() * 16), shade(base, 1.2));
  // rachadura
  let cx = Math.floor(p.rnd() * 10) + 3;
  let cy = Math.floor(p.rnd() * 4) + 2;
  for (let k = 0; k < 5; k++) {
    p.px(cx, cy, shade(base, 0.62));
    cx += p.rnd() < 0.5 ? 1 : 0;
    cy += 1;
  }
}

function paint(id: number, v: number, p: Painter): void {
  const r = p.rnd;
  switch (id) {
    case B.DIRT: {
      p.noise(DIRT_C, 0.2);
      for (let k = 0; k < 7; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [98, 64, 38]);
      for (let k = 0; k < 5; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [168, 122, 80]);
      for (let k = 0; k < 2; k++) {
        const x = Math.floor(r() * 13) + 1;
        const y = Math.floor(r() * 13) + 1;
        p.rect(x, y, 2, 2, [150, 150, 150], 0.85);
        p.px(x, y, [200, 200, 205]);
      }
      p.bevel();
      break;
    }
    case B.GRASS: {
      p.noise(DIRT_C, 0.2);
      for (let k = 0; k < 5; k++) p.px(Math.floor(r() * 16), 6 + Math.floor(r() * 10), [98, 64, 38]);
      for (let x = 0; x < TEX; x++) {
        const d = 3 + Math.floor(r() * 3);
        for (let y = 0; y < d; y++) {
          const g: RGB = y === 0 ? [112, 214, 76] : [58 + r() * 20, 158 + r() * 22, 50];
          p.px(x, y, g);
        }
        if (r() < 0.35) p.px(x, d, [44, 120, 40]);
        if (r() < 0.25) p.px(x, 0, [150, 236, 98]);
      }
      p.bevel();
      break;
    }
    case B.STONE: {
      stoneBase(p);
      p.bevel();
      break;
    }
    case B.SAND: {
      p.noise([230, 205, 130], 0.12);
      for (let k = 0; k < 10; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [200, 172, 100]);
      for (let k = 0; k < 6; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [248, 230, 170]);
      p.bevel();
      break;
    }
    case B.WOOD: {
      // tronco anelado de bananeira (transparente nas laterais)
      for (let y = 0; y < TEX; y++) {
        for (let x = 4; x < 12; x++) {
          const edge = x === 4 || x === 11;
          let c: RGB = [128, 84, 44];
          if (x >= 6 && x <= 8) c = [150, 104, 58];
          if (edge) c = [88, 56, 30];
          const ring = (y + v * 3) % 7 === 0;
          p.px(x, y, ring ? shade(c, 0.7) : shade(c, 0.94 + r() * 0.12));
        }
      }
      for (let k = 0; k < 4; k++) p.px(5 + Math.floor(r() * 6), Math.floor(r() * 16), [176, 128, 74]);
      break;
    }
    case B.LEAVES: {
      p.noise([46, 154, 62], 0.3);
      for (let k = 0; k < 10; k++) {
        const x = Math.floor(r() * 15);
        const y = Math.floor(r() * 15);
        p.rect(x, y, 2, 1, [28, 112, 48]);
        p.px(x + 1, y - 1, [96, 206, 84]);
      }
      // buracos (transparência)
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(r() * 16);
        const y = Math.floor(r() * 16);
        p.ctx.clearRect(p.ox + x, p.oy + y, 1, 1);
      }
      break;
    }
    case B.COPPER: {
      stoneBase(p);
      for (let k = 0; k < 3; k++) p.blob(2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), 1 + (r() < 0.4 ? 1 : 0), [206, 124, 66], [250, 190, 130]);
      for (let k = 0; k < 4; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [80, 170, 150]);
      p.bevel();
      break;
    }
    case B.GOLD: {
      stoneBase(p);
      for (let k = 0; k < 3; k++) p.blob(2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), 1 + (r() < 0.4 ? 1 : 0), [248, 208, 60], [255, 250, 200]);
      p.bevel();
      break;
    }
    case B.BANANITE: {
      stoneBase(p, [88, 90, 100]);
      for (let k = 0; k < 3; k++) {
        const cx = 3 + Math.floor(r() * 10);
        const cy = 3 + Math.floor(r() * 10);
        // cristal em forma de banana
        p.px(cx, cy, [255, 244, 90]);
        p.px(cx + 1, cy, [255, 250, 160]);
        p.px(cx - 1, cy + 1, [244, 222, 50]);
        p.px(cx, cy + 1, [255, 244, 90]);
        p.px(cx + 1, cy + 1, [200, 200, 40]);
        p.px(cx, cy + 2, [232, 200, 40]);
        p.px(cx + 1, cy - 1, [140, 255, 180]);
      }
      p.bevel();
      break;
    }
    case B.BEDROCK: {
      p.noise([44, 40, 52], 0.5);
      for (let k = 0; k < 9; k++) p.rect(Math.floor(r() * 14), Math.floor(r() * 14), 2, 2, [20, 18, 26]);
      for (let k = 0; k < 6; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [90, 84, 104]);
      break;
    }
    case B.WATER: {
      const surface = v === 3;
      for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) p.px(x, y, shade([40, 120, 220], 0.92 + r() * 0.12), 0.62);
      for (let k = 0; k < 3; k++) {
        const x = Math.floor(r() * 12);
        const y = 3 + Math.floor(r() * 11);
        p.rect(x, y, 3, 1, [190, 230, 255], 0.35);
      }
      if (surface) for (let x = 0; x < TEX; x++) p.px(x, 0, [200, 240, 255], 0.85), p.px(x, 1, [140, 200, 255], 0.5);
      break;
    }
    case B.PLANKS: {
      p.noise([196, 146, 86], 0.12);
      for (let row = 0; row < 4; row++) {
        for (let x = 0; x < TEX; x++) p.px(x, row * 4 + 3, [128, 86, 46]);
        for (let x = 0; x < TEX; x++) p.px(x, row * 4, [224, 176, 112], 0.6);
        const nx = (row % 2) * 8 + 3 + (v % 2);
        p.px(nx, row * 4 + 1, [96, 64, 34]);
        p.px(nx + 7, row * 4 + 1, [96, 64, 34]);
      }
      p.bevel();
      break;
    }
    case B.BENCH: {
      p.rect(0, 7, 16, 3, [190, 130, 72]);
      p.rect(0, 7, 16, 1, [226, 170, 104]);
      p.rect(0, 9, 16, 1, [120, 78, 40]);
      p.rect(1, 10, 2, 6, [140, 92, 48]);
      p.rect(13, 10, 2, 6, [140, 92, 48]);
      p.rect(3, 11, 10, 1, [110, 72, 38]);
      // mini banana + martelinho
      p.rect(3, 5, 4, 2, [250, 214, 60]);
      p.px(2, 6, [250, 214, 60]);
      p.px(7, 5, [120, 80, 30]);
      p.rect(10, 4, 3, 2, [150, 150, 160]);
      p.rect(11, 5, 1, 2, [120, 80, 30]);
      break;
    }
    case B.FURNACE: {
      p.rect(1, 1, 14, 15, [128, 120, 118]);
      for (let k = 0; k < 40; k++) p.px(1 + Math.floor(r() * 14), 1 + Math.floor(r() * 15), shade([128, 120, 118], 0.82 + r() * 0.3));
      for (let y = 3; y < 16; y += 4) p.rect(1, y, 14, 1, [86, 80, 80]);
      p.rect(4, 7, 8, 7, [36, 28, 28]);
      const fl: RGB[] = [[255, 170, 40], [255, 110, 30], [255, 220, 90]];
      p.rect(5, 10 + (v % 2), 6, 3, fl[1]);
      p.rect(6, 9 + (v % 2), 4, 3, fl[0]);
      p.px(7 + (v % 3), 8, fl[2]);
      p.px(8, 10, fl[2]);
      p.rect(5, 1, 6, 2, [70, 66, 66]);
      p.px(8, 0, [150, 150, 150], 0.5);
      break;
    }
    case B.TORCH: {
      p.rect(7, 7, 2, 9, [132, 90, 46]);
      p.px(7, 7, [170, 120, 64]);
      const f = v % 4;
      const ox = f === 1 ? 1 : f === 3 ? -1 : 0;
      p.rect(6 + ox, 3, 4, 4, [255, 150, 30]);
      p.rect(7 + ox, 2, 2, 3, [255, 214, 80]);
      p.px(7 + ox, 1 + (f % 2), [255, 240, 150]);
      p.rect(7, 5, 2, 2, [255, 245, 190]);
      break;
    }
    case B.GLASS: {
      for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) p.px(x, y, [190, 232, 244], 0.22);
      for (let i = 0; i < TEX; i++) {
        p.px(i, 0, [230, 250, 255], 0.9);
        p.px(0, i, [230, 250, 255], 0.9);
        p.px(i, 15, [150, 200, 216], 0.9);
        p.px(15, i, [150, 200, 216], 0.9);
      }
      for (let k = 3; k < 8; k++) p.px(k, 11 - k + 2, [255, 255, 255], 0.9);
      for (let k = 9; k < 12; k++) p.px(k, 19 - k, [255, 255, 255], 0.7);
      break;
    }
    case B.COAL: {
      stoneBase(p);
      for (let k = 0; k < 4; k++) p.blob(2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), 1 + (r() < 0.5 ? 1 : 0), [34, 34, 40], [80, 80, 92]);
      p.bevel();
      break;
    }
    case B.SANDSTONE: {
      p.noise([216, 186, 112], 0.1);
      for (let y = 0; y < TEX; y += 4) p.rect(0, y + (v % 2), 16, 1, [186, 154, 86]);
      for (let k = 0; k < 6; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [240, 214, 150]);
      p.bevel();
      break;
    }
    case B.CACTUS: {
      for (let y = 0; y < TEX; y++) {
        for (let x = 3; x < 13; x++) {
          const ridge = x === 5 || x === 8 || x === 11;
          const edge = x === 3 || x === 12;
          const c: RGB = edge ? [30, 108, 40] : ridge ? [48, 140, 56] : [66, 168, 74];
          p.px(x, y, shade(c, 0.95 + r() * 0.1));
        }
      }
      for (let k = 0; k < 5; k++) {
        const x = 4 + Math.floor(r() * 8);
        const y = Math.floor(r() * 16);
        p.px(x, y, [250, 250, 220]);
        p.px(x + 1, y - 1, [250, 250, 220], 0.8);
      }
      break;
    }
    case B.LADDER: {
      p.rect(3, 0, 2, 16, [74, 138, 54]);
      p.rect(11, 0, 2, 16, [74, 138, 54]);
      p.rect(3, 0, 1, 16, [110, 180, 80]);
      p.rect(11, 0, 1, 16, [110, 180, 80]);
      for (let y = 2; y < 16; y += 5) {
        p.rect(5, y, 6, 2, [168, 116, 62]);
        p.rect(5, y, 6, 1, [206, 152, 90]);
      }
      p.px(2, 5, [60, 160, 60]);
      p.px(13, 11, [60, 160, 60]);
      break;
    }
    case B.BRICK: {
      p.noise([140, 144, 158], 0.14);
      for (let row = 0; row < 4; row++) {
        p.rect(0, row * 4 + 3, 16, 1, [84, 88, 102]);
        const off = row % 2 === 0 ? 0 : 4;
        for (let x = off; x < 16; x += 8) p.rect(x + 7 - (off ? 0 : 0), row * 4, 1, 3, [84, 88, 102]);
      }
      p.bevel();
      break;
    }
    case B.BANANA_BLOCK: {
      p.noise([250, 216, 62], 0.14);
      for (let k = 0; k < 7; k++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), [110, 76, 28]);
      for (let k = 0; k < 4; k++) {
        const y = 2 + k * 4;
        for (let x = 0; x < TEX; x++) p.px(x, y + Math.round(Math.sin((x + v) * 0.5)), [224, 182, 36], 0.8);
      }
      p.rect(6, 0, 4, 2, [96, 120, 44]);
      p.bevel();
      break;
    }
    case B.TALLGRASS: {
      const n = 4 + (v % 3);
      for (let k = 0; k < n; k++) {
        const x = 1 + Math.floor(r() * 14);
        const h = 4 + Math.floor(r() * 6);
        const lean = r() < 0.5 ? -1 : 1;
        for (let y = 0; y < h; y++) {
          const gx = x + (y > h / 2 ? lean : 0);
          p.px(gx, 15 - y, y > h - 3 ? [120, 220, 90] : [52, 160, 56]);
        }
      }
      break;
    }
    case B.FLOWER: {
      const cols: RGB[] = [[255, 80, 130], [255, 140, 40], [240, 90, 220], [255, 240, 90]];
      const c = cols[v % 4];
      const x = 6 + (v % 3);
      for (let y = 8; y < 16; y++) p.px(x, y, [52, 150, 56]);
      p.px(x - 1, 12, [52, 150, 56]);
      p.px(x - 2, 11, [80, 190, 70]);
      p.px(x + 1, 13, [52, 150, 56]);
      p.px(x + 2, 12, [80, 190, 70]);
      p.rect(x - 2, 5, 5, 4, c);
      p.rect(x - 1, 4, 3, 6, c);
      p.px(x, 6, [255, 240, 120]);
      p.px(x, 7, [220, 170, 40]);
      break;
    }
    case B.BUNCH: {
      p.rect(7, 0, 2, 3, [70, 130, 50]);
      const bananas: [number, number][] = [[4, 3], [6, 3], [8, 3], [10, 3]];
      for (let b = 0; b < bananas.length; b++) {
        const [bx, by] = bananas[b];
        for (let k = 0; k < 8; k++) {
          const xx = bx + Math.round((k > 4 ? (k - 4) * 0.4 : 0) * (b < 2 ? -1 : 1));
          p.px(xx, by + k, [250, 214, 50]);
          p.px(xx + 1, by + k, [232, 190, 36]);
        }
        p.px(bx, by + 8, [96, 70, 30]);
      }
      p.px(5, 5, [255, 244, 140]);
      p.px(9, 5, [255, 244, 140]);
      break;
    }
    default:
      break;
  }
}

function paintWall(v: number, p: Painter): void {
  p.noise([70, 48, 30], 0.22);
  for (let k = 0; k < 8; k++) p.rect(Math.floor(p.rnd() * 14), Math.floor(p.rnd() * 14), 2, 2, [54, 36, 22]);
  for (let k = 0; k < 6; k++) p.px(Math.floor(p.rnd() * 16), Math.floor(p.rnd() * 16), [92, 66, 42]);
  p.rect(0, 15, 16, 1, [48, 32, 20], 0.5);
  void v;
}

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly cracks: HTMLCanvasElement[] = [];
  private icons = new Map<number, HTMLCanvasElement>();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TEX * VARIANTS;
    this.canvas.height = TEX * (BLOCK_COUNT + 1);
    const ctx = this.canvas.getContext('2d')!;
    for (let id = 1; id < BLOCK_COUNT; id++) {
      for (let v = 0; v < VARIANTS; v++) {
        paint(id, v, new Painter(ctx, v * TEX, id * TEX, mulberry(id * 977 + v * 131 + 5)));
      }
    }
    for (let v = 0; v < VARIANTS; v++) {
      paintWall(v, new Painter(ctx, v * TEX, WALL_ROW * TEX, mulberry(4242 + v * 17)));
    }
    this.buildCracks();
  }

  private buildCracks(): void {
    const rnd = mulberry(777);
    const pts: [number, number][] = [];
    let cx = 8;
    let cy = 8;
    for (let k = 0; k < 60; k++) {
      cx = Math.max(0, Math.min(15, cx + Math.floor(rnd() * 3) - 1));
      cy = Math.max(0, Math.min(15, cy + Math.floor(rnd() * 3) - 1));
      pts.push([cx, cy]);
    }
    const branches: [number, number][] = [];
    for (let b = 0; b < 4; b++) {
      let bx = pts[b * 12][0];
      let by = pts[b * 12][1];
      const dx = b % 2 === 0 ? 1 : -1;
      const dy = b < 2 ? 1 : -1;
      for (let k = 0; k < 9; k++) {
        bx = Math.max(0, Math.min(15, bx + (rnd() < 0.7 ? dx : 0)));
        by = Math.max(0, Math.min(15, by + (rnd() < 0.7 ? dy : 0)));
        branches.push([bx, by]);
      }
    }
    const all = pts.concat(branches);
    for (let s = 1; s <= 5; s++) {
      const c = document.createElement('canvas');
      c.width = TEX;
      c.height = TEX;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(0,0,0,0.62)';
      const n = Math.floor((all.length * s) / 5);
      for (let i = 0; i < n; i++) g.fillRect(all[i][0], all[i][1], 1, 1);
      this.cracks.push(c);
    }
  }

  /** Ícone 16x16 de qualquer item. */
  icon(id: number): HTMLCanvasElement {
    let c = this.icons.get(id);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = TEX;
    c.height = TEX;
    const g = c.getContext('2d')!;
    if (id < BLOCK_COUNT) {
      let v = 0;
      if (id === B.WATER) v = 0;
      g.drawImage(this.canvas, v * TEX, id * TEX, TEX, TEX, 0, 0, TEX, TEX);
    } else {
      paintItemIcon(id, g);
    }
    this.icons.set(id, c);
    return c;
  }
}

function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void {
  g.fillStyle = col;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), th, th);
  }
}

function paintItemIcon(id: number, g: CanvasRenderingContext2D): void {
  const tool = TOOLS[id];
  if (id === I.STICK) {
    line(g, 3, 13, 12, 4, '#8a5a2a', 2);
    line(g, 3, 12, 11, 4, '#b98648', 1);
    return;
  }
  if (id === I.COPPER_BAR || id === I.GOLD_BAR || id === I.BANANITE_BAR) {
    const base = id === I.COPPER_BAR ? ['#f0a060', '#d4803c', '#9c5424'] : id === I.GOLD_BAR ? ['#fff088', '#f2c92c', '#b08a10'] : ['#ffffd0', '#e8f048', '#a0a820'];
    g.fillStyle = base[2];
    g.fillRect(2, 8, 12, 5);
    g.fillStyle = base[1];
    g.fillRect(3, 6, 10, 6);
    g.fillStyle = base[0];
    g.fillRect(4, 6, 8, 2);
    g.fillRect(3, 7, 1, 3);
    g.fillStyle = base[2];
    g.fillRect(2, 12, 12, 1);
    return;
  }
  if (id === I.BANANA || id === I.BANANA_FRY) {
    const fry = id === I.BANANA_FRY;
    const body = fry ? '#d4912c' : '#f8d63c';
    const dark = fry ? '#8a5a1c' : '#c9a21c';
    const light = fry ? '#f0c070' : '#fff59a';
    for (let t = 0; t <= 1; t += 0.03) {
      const a = (35 + t * 110) * (Math.PI / 180);
      const cx = 8 + Math.cos(a) * 9;
      const cy = 1 + Math.sin(a) * 9.5;
      const r = 0.9 + Math.sin(t * Math.PI) * 1.4;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          if (x * x + y * y <= r * r) {
            g.fillStyle = y > 0 ? dark : y < 0 ? light : body;
            g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
          }
        }
      }
    }
    g.fillStyle = '#5a3c18';
    g.fillRect(15, 6, 1, 2);
    g.fillRect(0, 6, 1, 2);
    return;
  }
  if (tool && tool.kind === 'pick') {
    line(g, 2, 14, 11, 5, '#7a4e22', 2);
    line(g, 2, 13, 10, 5, '#b98648', 1);
    const pts: [number, number][] = [[2, 5], [3, 3], [5, 2], [8, 1], [11, 2], [13, 4], [14, 7], [14, 10]];
    for (let i = 0; i < pts.length - 1; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], tool.color, 2);
    for (let i = 0; i < pts.length - 1; i++) line(g, pts[i][0], pts[i][1] - 0, pts[i + 1][0], pts[i + 1][1] - 0, tool.hi, 1);
    return;
  }
  if (tool && tool.kind === 'sword') {
    line(g, 4, 11, 13, 2, tool.color, 3);
    line(g, 4, 11, 13, 2, tool.hi, 1);
    line(g, 3, 8, 7, 12, '#6a4a2a', 2);
    line(g, 2, 14, 4, 12, '#8a5a2a', 2);
    g.fillStyle = '#fff';
    g.fillRect(12, 2, 1, 1);
    return;
  }
  g.fillStyle = '#f0f';
  g.fillRect(4, 4, 8, 8);
}
