import { DRIVERS, type Driver } from './drivers';
import { EXPR_CRY, EXPR_SCREAM } from './types';
import { TAU, shade } from './util';
import { drawHead, makeCanvas } from './monkeyart';

export const ANGLES = 24;
export const SPR_S = 210;
export const SPR_PPU = 2.2;
const OX = SPR_S / 2;
const OY = 165;
const PITCH = 0.5;
const SP = Math.sin(PITCH);
const CP = Math.cos(PITCH);

export interface KartSprite {
  canvas: HTMLCanvasElement;
}

const cache = new Map<string, HTMLCanvasElement>();

export function getKartSprite(driver: number, angleIdx: number, expr: number): HTMLCanvasElement {
  const a = ((angleIdx % ANGLES) + ANGLES) % ANGLES;
  const key = `${driver}|${a}|${expr}`;
  let c = cache.get(key);
  if (!c) {
    c = makeCanvas(SPR_S, SPR_S);
    renderKart(c.getContext('2d')!, DRIVERS[driver], (a / ANGLES) * TAU, expr);
    cache.set(key, c);
  }
  return c;
}

interface Part {
  depth: number;
  draw: () => void;
}

function renderKart(ctx: CanvasRenderingContext2D, d: Driver, phi: number, expr: number): void {
  const sinP = Math.sin(phi);
  const cosP = Math.cos(phi);
  const k = d.kart;
  const dims = {
    normal: { L: 54, W: 36, sc: 1 },
    wide: { L: 56, W: 44, sc: 1.05 },
    long: { L: 66, W: 34, sc: 0.96 },
    tiny: { L: 44, W: 30, sc: 0.86 },
  }[k.shape];
  const { L, W } = dims;
  const ppu = SPR_PPU * dims.sc;

  const proj = (u: number, v: number, z: number): [number, number] => {
    const X = u * sinP + v * cosP;
    const Y = u * cosP - v * sinP;
    return [OX + X * ppu, OY - (z * CP + Y * SP) * ppu];
  };
  const depthOf = (u: number, v: number) => u * cosP - v * sinP;

  const parts: Part[] = [];
  const LIGHT = [-0.45, -0.35, 0.82];

  const box = (cu: number, cv: number, cz: number, hu: number, hv: number, hz: number, color: string, edge = 'rgba(0,0,0,0.45)') => {
    parts.push({
      depth: depthOf(cu, cv) + hz * 0.001,
      draw: () => {
        const normals: [number, number, number][] = [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
        ];
        const faces: { n: [number, number, number]; pts: [number, number, number][] }[] = [
          { n: normals[0], pts: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
          { n: normals[1], pts: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]] },
          { n: normals[2], pts: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
          { n: normals[3], pts: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
          { n: normals[4], pts: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
        ];
        const order = faces
          .map((f) => {
            const Xn = f.n[0] * sinP + f.n[1] * cosP;
            const Yn = f.n[0] * cosP - f.n[1] * sinP;
            const vis = -CP * Yn + SP * f.n[2];
            const dot = Xn * LIGHT[0] + Yn * LIGHT[1] + f.n[2] * LIGHT[2];
            return { f, vis, light: 0.5 + 0.55 * Math.max(0, dot) };
          })
          .filter((o) => o.vis > 0.001);
        for (const o of order) {
          ctx.beginPath();
          o.f.pts.forEach((p, i) => {
            const [sx, sy] = proj(cu + p[0] * hu, cv + p[1] * hv, cz + p[2] * hz);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          });
          ctx.closePath();
          ctx.fillStyle = shade(color, o.light);
          ctx.fill();
          ctx.strokeStyle = edge;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      },
    });
  };

  const line = (a: [number, number, number], b: [number, number, number], w: number, color: string, depthBias = 0) => {
    parts.push({
      depth: depthOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + depthBias,
      draw: () => {
        const [x1, y1] = proj(...a);
        const [x2, y2] = proj(...b);
        ctx.strokeStyle = color;
        ctx.lineWidth = w * ppu;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      },
    });
  };

  // ground shadow baked in is not needed (runtime shadow) -------------------

  // wheels
  const wf = L / 2 - 11;
  for (const su of [1, -1]) {
    for (const sv of [-1, 1]) {
      const big = su < 0 ? 1.15 : 1;
      box(su * wf, sv * (W / 2 + 1), 7 * big, 7.5 * big, 4.5, 7 * big, '#262b36', 'rgba(0,0,0,0.6)');
      // hub
      parts.push({
        depth: depthOf(su * wf, sv * (W / 2 + 1)) + 0.002,
        draw: () => {
          // hub cap on the outer face when visible
          const Xn = sv * cosP;
          const Yn = -sv * sinP;
          if (-CP * Yn > 0.02) {
            const [hx, hy] = proj(su * wf, sv * (W / 2 + 1 + 4.6), 7 * big);
            ctx.fillStyle = '#9ca3af';
            ctx.beginPath();
            ctx.ellipse(hx, hy, 3.4 * ppu * Math.abs(sinP) + 1.2, 3.6 * ppu * big, 0, 0, TAU);
            ctx.fill();
          }
          void Xn;
        },
      });
    }
  }
  // chassis
  box(0, 0, 9, L / 2 - 2, W / 2 - 5, 4, shade(k.trim, 1.0));
  // hood / nose
  box(L / 4 + 2, 0, 13.5, L / 4, W / 2 - 7, 4.5, k.body);
  // side pods
  for (const sv of [-1, 1]) box(-2, sv * (W / 2 - 4), 12, L / 3, 3.5, 4, shade(k.body, 0.9));
  // engine block
  box(-L / 2 + 9, 0, 17, 8, W / 2 - 8, 7, shade(k.body, 0.95));
  // seat back
  box(-8, 0, 22, 3, 10, 8, shade(k.trim, 1.05));
  // headlights
  for (const sv of [-1, 1]) box(L / 2 - 1, sv * 8, 14, 1.5, 3, 2, '#fef9c3', 'rgba(0,0,0,0.3)');
  // steering wheel
  box(7, 0, 24, 1.5, 5, 1.5, '#111827');

  // exhaust pipes / accessories
  switch (k.accessory) {
    case 'bananas': {
      for (let i = -1; i <= 1; i++) {
        parts.push({
          depth: depthOf(-L / 2 - 4, i * 7),
          draw: () => {
            const [x0, y0] = proj(-L / 2 - 2, i * 7, 14);
            const [x1, y1] = proj(-L / 2 - 6, i * 7 + i * 3, 38);
            ctx.strokeStyle = '#a16207';
            ctx.lineWidth = 3.2 * ppu * 0.6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.quadraticCurveTo((x0 + x1) / 2 + 12 + i * 5, (y0 + y1) / 2, x1, y1);
            ctx.stroke();
            ctx.strokeStyle = k.accessoryColor;
            ctx.lineWidth = 2.4 * ppu * 0.6;
            ctx.stroke();
            ctx.fillStyle = '#4b2e0b';
            ctx.beginPath();
            ctx.arc(x1, y1, 1.6 * ppu * 0.6, 0, TAU);
            ctx.fill();
          },
        });
      }
      break;
    }
    case 'flag': {
      line([-L / 2 + 4, W / 2 - 5, 14], [-L / 2 + 4, W / 2 - 5, 56], 1.1, '#e5e7eb');
      parts.push({
        depth: depthOf(-L / 2 + 4, W / 2 - 5) + 0.01,
        draw: () => {
          const [x, y] = proj(-L / 2 + 4, W / 2 - 5, 56);
          const [x2, y2] = proj(-L / 2 + 4 - 16 * (0.4 + 0.6 * Math.abs(cosP)), W / 2 - 5 + 6, 50);
          const [x3, y3] = proj(-L / 2 + 4, W / 2 - 5, 44);
          ctx.fillStyle = k.accessoryColor;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        },
      });
      break;
    }
    case 'horn': {
      for (const sv of [-1, 1]) {
        box(-14, sv * 14, 30, 3, 3, 14, '#cbd5e1');
        box(-14, sv * 14, 45, 3.6, 3.6, 2.2, k.accessoryColor);
      }
      break;
    }
    case 'spoiler': {
      for (const sv of [-1, 1]) box(-L / 2 + 3, sv * (W / 2 - 8), 24, 1.6, 1.6, 8, '#374151');
      box(-L / 2 + 2, 0, 33, 5, W / 2 + 3, 1.6, k.accessoryColor);
      break;
    }
    case 'rocket': {
      box(-L / 2 - 3, 0, 15, 8, 8, 8, '#cbd5e1');
      box(-L / 2 - 11, 0, 15, 3, 6, 6, k.accessoryColor);
      for (const sv of [-1, 1]) box(-L / 2 + 6, sv * 10, 23, 7, 2, 9, '#94a3b8');
      break;
    }
    case 'antenna': {
      line([-L / 2 + 6, 0, 18], [-L / 2 + 6, 0, 62], 1.1, '#e5e7eb');
      parts.push({
        depth: depthOf(-L / 2 + 6, 0) + 0.01,
        draw: () => {
          const [x, y] = proj(-L / 2 + 6, 0, 66);
          ctx.fillStyle = '#2563eb';
          ctx.beginPath();
          ctx.ellipse(x, y, 4.2 * ppu, 6.8 * ppu * 0.6, 0.3, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x - 2 * ppu, y + 1);
          ctx.lineTo(x, y - 2 * ppu);
          ctx.lineTo(x + 2 * ppu, y + 1);
          ctx.stroke();
        },
      });
      break;
    }
    case 'umbrella':
      break;
  }

  // ---- monkey ---------------------------------------------------------
  const art = d.art;
  const headU = -3;
  const headZ = 46;
  const torsoU = -4;
  // torso
  parts.push({
    depth: depthOf(torsoU, 0) + 0.001,
    draw: () => {
      const [x, y] = proj(torsoU, 0, 28);
      const g = ctx.createRadialGradient(x - 4, y - 6, 2, x, y, 18 * ppu * 0.6);
      g.addColorStop(0, shade(art.fur, 1.2));
      g.addColorStop(1, shade(art.fur, 0.7));
      ctx.fillStyle = g;
      ctx.strokeStyle = shade(art.furDark, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 10.5 * ppu * (0.62 + 0.38 * Math.abs(cosP)), 12 * ppu * 0.78, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // belly patch seen from the front
      if (cosP < -0.2) {
        ctx.fillStyle = art.face;
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 5.5 * ppu * 0.6, 7 * ppu * 0.6, 0, 0, TAU);
        ctx.fill();
      }
    },
  });
  // arms + legs
  for (const sv of [-1, 1]) {
    line([headU - 1, sv * 9, 31], [8, sv * 6.5, 26], 4.4, art.fur, 0.0005);
    parts.push({
      depth: depthOf(8, sv * 6.5) + 0.002,
      draw: () => {
        const [x, y] = proj(8, sv * 6.5, 26);
        ctx.fillStyle = art.furDark;
        ctx.beginPath();
        ctx.arc(x, y, 2.6 * ppu * 0.6, 0, TAU);
        ctx.fill();
      },
    });
    line([-6, sv * 5, 19], [13, sv * 6, 13], 4.8, shade(art.fur, 0.9), -0.001);
  }
  // head
  parts.push({
    depth: depthOf(headU, 0) + 0.003,
    draw: () => {
      const [x, y] = proj(headU, 0, headZ);
      const R = 11.5 * ppu * 0.78;
      drawHead(
        ctx,
        art,
        x,
        y,
        R,
        { sinP, cosP, sp: SP, cp: CP, tilt: expr === EXPR_CRY ? 0.18 : expr === EXPR_SCREAM ? -0.06 : 0, t: 0.35 },
        expr,
      );
    },
  });
  if (k.accessory === 'umbrella') {
    parts.push({
      depth: depthOf(headU, 0) + 0.004,
      draw: () => {
        const [x, y] = proj(headU, 0, 74);
        const rr = 26 * ppu * 0.78;
        const [bx, by] = proj(headU, 0, 50);
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(x, y);
        ctx.stroke();
        const n = 8;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = i % 2 ? '#facc15' : k.accessoryColor;
          ctx.beginPath();
          ctx.moveTo(x, y - rr * 0.35);
          ctx.ellipse(x, y, rr, rr * 0.5, 0, Math.PI + (i / n) * Math.PI, Math.PI + ((i + 1) / n) * Math.PI);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * 0.5, 0, Math.PI, TAU);
        ctx.stroke();
      },
    });
  }

  parts.sort((a, b) => b.depth - a.depth);
  for (const p of parts) p.draw();
}
