import { Rng, hash2 } from './rng';

/** Terreno destrutível por pixel: máscara + canvas texturizado. */
export class Terrain {
  readonly w: number;
  readonly h: number;
  mask: Uint8Array;
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  craters: number[] = [];
  solidCount = 0;
  seed = 0;
  private readonly headless: boolean;

  constructor(w: number, h: number, headless = false) {
    this.w = w;
    this.h = h;
    this.headless = headless;
    this.mask = new Uint8Array(w * h);
    if (!headless && typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = w;
      this.canvas.height = h;
      this.ctx = this.canvas.getContext('2d');
    }
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.mask[(y | 0) * this.w + (x | 0)] === 1;
  }

  /** Gera ilhas flutuantes de forma 100% determinística a partir da seed. */
  generate(seed: number, teams: number): void {
    const W = this.w;
    const H = this.h;
    const rng = new Rng(seed ^ 0x9e3779b9);
    this.mask.fill(0);
    this.craters = [];
    this.seed = seed;

    const n = teams <= 2 ? 4 : 5;
    const hwMin = n === 4 ? 230 : 180;
    const hwMax = n === 4 ? 380 : 300;

    const islands: { cx: number; hw: number }[] = [];
    for (let i = 0; i < n; i++) {
      const cx = (W * (i + 0.5)) / n + rng.range(-50, 50);
      const hw = rng.range(hwMin, hwMax);
      const base = rng.range(500, 760);
      const thick = rng.range(250, 370);
      const A = [rng.range(12, 40), rng.range(6, 18), rng.range(3, 8)];
      const F = [rng.range(0.0055, 0.011), rng.range(0.016, 0.03), rng.range(0.04, 0.07)];
      const P = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
      const bumpX = rng.range(-0.5, 0.5) * hw;
      const bumpH = rng.range(-20, 55);
      islands.push({ cx, hw });
      const x0 = Math.max(0, Math.floor(cx - hw));
      const x1 = Math.min(W - 1, Math.ceil(cx + hw));
      for (let x = x0; x <= x1; x++) {
        const u = (x - cx) / hw;
        if (Math.abs(u) >= 1) continue;
        const k = 1 - u * u;
        let top =
          base +
          A[0] * Math.sin(x * F[0] + P[0]) +
          A[1] * Math.sin(x * F[1] + P[1]) +
          A[2] * Math.sin(x * F[2] + P[2]) +
          Math.pow(Math.abs(u), 4) * 90 -
          bumpH * Math.exp(-Math.pow((x - cx - bumpX) / (hw * 0.35), 2));
        top = Math.max(140, top);
        const bottom = top + thick * Math.pow(k, 0.62);
        this.fillColumn(x, top, bottom);
      }
      // cavernas
      const caves = rng.int(2, 3);
      for (let c = 0; c < caves; c++) {
        const ccx = cx + rng.range(-0.55, 0.55) * hw;
        const ccy = base + rng.range(80, thick * 0.55);
        this.clearCircle(ccx, ccy, rng.range(16, 38));
      }
    }

    // plataformas flutuantes pequenas
    const plats = rng.int(2, 4);
    for (let i = 0; i < plats; i++) {
      const px = rng.range(260, W - 260);
      const py = rng.range(300, 470);
      const hw = rng.range(55, 110);
      const th = rng.range(26, 46);
      for (let x = Math.floor(px - hw); x <= Math.ceil(px + hw); x++) {
        const u = (x - px) / hw;
        if (Math.abs(u) >= 1) continue;
        const k = 1 - u * u;
        this.fillColumn(x, py + Math.pow(Math.abs(u), 3) * 10, py + th * Math.pow(k, 0.7) + 10);
      }
    }

    this.recount();
  }

  private fillColumn(x: number, top: number, bottom: number): void {
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(this.h - 1, Math.floor(bottom));
    for (let y = y0; y <= y1; y++) this.mask[y * this.w + x] = 1;
  }

  private clearCircle(cx: number, cy: number, r: number): number {
    let cleared = 0;
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = Math.max(0, Math.floor(cx - half));
      const x1 = Math.min(this.w - 1, Math.ceil(cx + half));
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * this.w + x;
          if (this.mask[i] === 1) {
            this.mask[i] = 0;
            cleared++;
          }
        }
      }
    }
    return cleared;
  }

  private recount(): void {
    let c = 0;
    const m = this.mask;
    for (let i = 0; i < m.length; i++) c += m[i];
    this.solidCount = c;
  }

  /** Topo de superfície válida (com ar acima e chão sólido embaixo) ou -1. */
  surfaceY(x: number, maxY: number): number {
    let airRun = 0;
    for (let y = 30; y < maxY; y++) {
      if (this.isSolid(x, y)) {
        if (airRun >= 40) {
          let thick = true;
          for (let k = 0; k < 22; k++) {
            if (!this.isSolid(x, y + k)) {
              thick = false;
              break;
            }
          }
          if (thick) return y;
        }
        airRun = 0;
      } else {
        airRun++;
      }
    }
    return -1;
  }

  /** Cava um círculo. Registra no log (para ressincronizar) e atualiza o visual. */
  carve(cx: number, cy: number, r: number, log = true): void {
    cx = Math.round(cx * 10) / 10;
    cy = Math.round(cy * 10) / 10;
    r = Math.round(r * 10) / 10;
    if (log) this.craters.push(cx, cy, r);
    const cleared = this.clearCircle(cx, cy, r);
    this.solidCount -= cleared;
    const ctx = this.ctx;
    if (ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, r - 1), cx, cy, r + 7);
      g.addColorStop(0, 'rgba(28,14,6,0.9)');
      g.addColorStop(1, 'rgba(28,14,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  rebuild(seed: number, teams: number, craters: number[]): void {
    this.generate(seed, teams);
    for (let i = 0; i + 2 < craters.length; i += 3) {
      this.clearCircle(craters[i], craters[i + 1], craters[i + 2]);
    }
    this.craters = craters.slice();
    this.recount();
    this.render();
  }

  /** Pinta o canvas colorido (grama, terra, pedras, contorno) a partir da máscara. */
  render(): void {
    if (this.headless || !this.ctx) return;
    const W = this.w;
    const H = this.h;
    const ctx = this.ctx;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const m = this.mask;
    const seed = this.seed;

    // ruído suave de baixa frequência (blotches)
    const cell = 18;
    const gw = Math.ceil(W / cell) + 2;
    const gh = Math.ceil(H / cell) + 2;
    const grid = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) grid[j * gw + i] = hash2(i, j, seed);
    const blotch = (x: number, y: number): number => {
      const fx = x / cell;
      const fy = y / cell;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const a = grid[iy * gw + ix];
      const b = grid[iy * gw + ix + 1];
      const c = grid[(iy + 1) * gw + ix];
      const e = grid[(iy + 1) * gw + ix + 1];
      return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + e * tx * ty;
    };

    for (let x = 0; x < W; x++) {
      let depth = 0;
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (m[i] === 0) {
          depth = 0;
          continue;
        }
        depth++;
        const o = i * 4;
        const speck = hash2(x, y, seed + 7);
        const bl = blotch(x, y);
        let r: number;
        let g: number;
        let b: number;
        if (depth <= 3) {
          r = 138 + speck * 25;
          g = 222 - speck * 20;
          b = 78;
        } else if (depth <= 8) {
          r = 58 + bl * 28;
          g = 150 + bl * 30 - speck * 12;
          b = 50;
        } else if (depth <= 13) {
          r = 100 + speck * 14;
          g = 70 + speck * 10;
          b = 38;
        } else {
          const deep = Math.min(1, depth / 280);
          const base = 1 - deep * 0.38;
          r = (132 - bl * 28 + speck * 14) * base;
          g = (82 - bl * 18 + speck * 10) * base;
          b = (44 - bl * 8 + speck * 6) * base;
          if (bl > 0.8 && speck > 0.35) {
            r = 128 + speck * 20;
            g = 120 + speck * 18;
            b = 116 + speck * 16;
          } else if (bl < 0.12 && speck > 0.6) {
            r += 30;
            g += 24;
            b += 12;
          }
        }
        const edge =
          x === 0 ||
          x === W - 1 ||
          y === H - 1 ||
          m[i - 1] === 0 ||
          m[i + 1] === 0 ||
          (y > 0 && m[i - W] === 0) ||
          m[i + W] === 0;
        if (edge) {
          r *= 0.5;
          g *= 0.5;
          b *= 0.5;
        } else if (y + 3 < H && m[i + W * 3] === 0) {
          // sombra na parte inferior (raízes / barriga da ilha)
          r *= 0.78;
          g *= 0.78;
          b *= 0.78;
        }
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
