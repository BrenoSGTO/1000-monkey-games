import { makeCanvas } from './monkeyart';
import { TEX, TEX_SCALE } from './tracks';
import { hexToRgb, mulberry32 } from './util';

interface Level {
  w: number;
  data: Uint32Array;
}

const DETAIL = 128;

export class Ground {
  levels: Level[] = [];
  detail = new Uint8Array(DETAIL * DETAIL);
  private out: HTMLCanvasElement | null = null;
  private outCtx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private img32: Uint32Array | null = null;
  fog: [number, number, number] = [150, 200, 180];

  constructor(tex: HTMLCanvasElement, fogHex: string) {
    this.fog = hexToRgb(fogHex);
    let src = tex;
    let w = TEX;
    for (let l = 0; l < 3; l++) {
      const ctx = src.getContext('2d', { willReadFrequently: true })!;
      const id = ctx.getImageData(0, 0, w, w);
      this.levels.push({ w, data: new Uint32Array(id.data.buffer) });
      if (l < 2) {
        const nw = w >> 1;
        const c = makeCanvas(nw, nw);
        const cx = c.getContext('2d', { willReadFrequently: true })!;
        cx.imageSmoothingEnabled = true;
        cx.drawImage(src, 0, 0, nw, nw);
        src = c;
        w = nw;
      }
    }
    const rnd = mulberry32(99);
    for (let i = 0; i < this.detail.length; i++) this.detail[i] = 96 + Math.floor(rnd() * 64);
    // smooth the noise slightly for a grainy but soft look
    const d2 = new Uint8Array(this.detail);
    for (let y = 0; y < DETAIL; y++) {
      for (let x = 0; x < DETAIL; x++) {
        const a = d2[y * DETAIL + x];
        const b = d2[y * DETAIL + ((x + 1) & 127)];
        const c = d2[((y + 1) & 127) * DETAIL + x];
        this.detail[y * DETAIL + x] = (a * 2 + b + c) >> 2;
      }
    }
  }

  /** Renders the ground below the horizon. Returns a canvas of size bw x rows. */
  render(camX: number, camY: number, camH: number, bw: number, bh: number, hz: number, f: number, camHeight: number): HTMLCanvasElement {
    const rows = Math.max(1, bh - hz);
    if (!this.out || this.out.width !== bw || this.out.height !== rows) {
      this.out = makeCanvas(bw, rows);
      this.outCtx = this.out.getContext('2d')!;
      this.img = this.outCtx.createImageData(bw, rows);
      this.img32 = new Uint32Array(this.img.data.buffer);
    }
    const out32 = this.img32!;
    const cosH = Math.cos(camH);
    const sinH = Math.sin(camH);
    const rx = -sinH;
    const ry = cosH;
    const [fr, fg, fb] = this.fog;
    const inv = 1 / TEX_SCALE;
    const det = this.detail;
    const halfW = bw / 2;

    for (let y = 0; y < rows; y++) {
      const dy = y + 0.6;
      const d = (camHeight * f) / dy;
      const stepU = d / f; // world units per screen pixel
      const lvl = stepU <= 3 ? 0 : stepU <= 6 ? 1 : 2;
      const L = this.levels[lvl];
      const lw = L.w;
      const data = L.data;
      const scale = inv / (1 << lvl);
      const cx = camX + cosH * d;
      const cy = camY + sinH * d;
      let wx = cx - rx * halfW * stepU;
      let wy = cy - ry * halfW * stepU;
      const dwx = rx * stepU;
      const dwy = ry * stepU;
      let fogF = (d - 600) / 3400;
      fogF = fogF < 0 ? 0 : fogF > 0.93 ? 0.93 : fogF;
      const fogI = (fogF * 256) | 0;
      const detAmp = d < 700 ? ((700 - d) / 700) * 0.32 : 0;
      const bil = lvl === 0 && stepU < 1.5;
      const rowBase = y * bw;
      for (let x = 0; x < bw; x++) {
        let r: number;
        let g: number;
        let b: number;
        const tx = wx * scale;
        const ty = wy * scale;
        if (bil) {
          const fx = tx - 0.5;
          const fy = ty - 0.5;
          let x0 = Math.floor(fx);
          let y0 = Math.floor(fy);
          const ax = ((fx - x0) * 256) | 0;
          const ay = ((fy - y0) * 256) | 0;
          let x1 = x0 + 1;
          let y1 = y0 + 1;
          x0 = x0 < 0 ? 0 : x0 >= lw ? lw - 1 : x0;
          x1 = x1 < 0 ? 0 : x1 >= lw ? lw - 1 : x1;
          y0 = y0 < 0 ? 0 : y0 >= lw ? lw - 1 : y0;
          y1 = y1 < 0 ? 0 : y1 >= lw ? lw - 1 : y1;
          const c00 = data[y0 * lw + x0];
          const c10 = data[y0 * lw + x1];
          const c01 = data[y1 * lw + x0];
          const c11 = data[y1 * lw + x1];
          const w00 = (256 - ax) * (256 - ay);
          const w10 = ax * (256 - ay);
          const w01 = (256 - ax) * ay;
          const w11 = ax * ay;
          r = ((c00 & 255) * w00 + (c10 & 255) * w10 + (c01 & 255) * w01 + (c11 & 255) * w11) >> 16;
          g = (((c00 >> 8) & 255) * w00 + ((c10 >> 8) & 255) * w10 + ((c01 >> 8) & 255) * w01 + ((c11 >> 8) & 255) * w11) >> 16;
          b = (((c00 >> 16) & 255) * w00 + ((c10 >> 16) & 255) * w10 + ((c01 >> 16) & 255) * w01 + ((c11 >> 16) & 255) * w11) >> 16;
        } else {
          let ix = tx | 0;
          let iy = ty | 0;
          ix = ix < 0 ? 0 : ix >= lw ? lw - 1 : ix;
          iy = iy < 0 ? 0 : iy >= lw ? lw - 1 : iy;
          const c = data[iy * lw + ix];
          r = c & 255;
          g = (c >> 8) & 255;
          b = (c >> 16) & 255;
        }
        if (detAmp > 0) {
          const n = det[(((wy | 0) & 127) << 7) | ((wx | 0) & 127)];
          const k = 1 + ((n - 128) / 128) * detAmp;
          r = r * k;
          g = g * k;
          b = b * k;
          r = r > 255 ? 255 : r;
          g = g > 255 ? 255 : g;
          b = b > 255 ? 255 : b;
        }
        if (fogI > 0) {
          r += ((fr - r) * fogI) >> 8;
          g += ((fg - g) * fogI) >> 8;
          b += ((fb - b) * fogI) >> 8;
        }
        out32[rowBase + x] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
        wx += dwx;
        wy += dwy;
      }
    }
    this.outCtx!.putImageData(this.img!, 0, 0);
    return this.out;
  }
}
