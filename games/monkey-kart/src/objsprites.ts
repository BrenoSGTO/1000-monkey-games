import { makeCanvas } from './monkeyart';
import { TAU, mulberry32, shade } from './util';

export interface Billboard {
  c: HTMLCanvasElement;
  /** world width / height in units (anchored at bottom center) */
  wU: number;
  hU: number;
}

const PX = 1.5; // canvas px per world unit
const cache = new Map<string, Billboard>();

function mk(key: string, wU: number, hU: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Billboard {
  let b = cache.get(key);
  if (!b) {
    const c = makeCanvas(wU * PX, hU * PX);
    const ctx = c.getContext('2d')!;
    draw(ctx, c.width, c.height);
    b = { c, wU, hU };
    cache.set(key, b);
  }
  return b;
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c1: string, c2: string): void {
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 1, x, y, Math.max(rx, ry));
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// ------------------------------------------------------------------ scenery

export function sceneryBillboard(kind: string): Billboard {
  switch (kind) {
    case 'tree':
      return mk(kind, 190, 300, (ctx, w, h) => {
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(w * 0.44, h * 0.55, w * 0.12, h * 0.45);
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(w * 0.44, h * 0.55, w * 0.04, h * 0.45);
        blob(ctx, w * 0.3, h * 0.5, w * 0.28, h * 0.2, '#2f9e44', '#14532d');
        blob(ctx, w * 0.7, h * 0.5, w * 0.28, h * 0.2, '#2f9e44', '#14532d');
        blob(ctx, w * 0.5, h * 0.3, w * 0.4, h * 0.26, '#4ade80', '#166534');
        blob(ctx, w * 0.5, h * 0.14, w * 0.25, h * 0.14, '#86efac', '#15803d');
        // vines
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(w * (0.25 + i * 0.16), h * 0.45);
          ctx.quadraticCurveTo(w * (0.22 + i * 0.16), h * 0.6, w * (0.27 + i * 0.16), h * 0.72);
          ctx.stroke();
        }
      });
    case 'palm':
      return mk(kind, 180, 300, (ctx, w, h) => {
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = w * 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(w * 0.45, h);
        ctx.quadraticCurveTo(w * 0.62, h * 0.55, w * 0.5, h * 0.2);
        ctx.stroke();
        ctx.strokeStyle = '#5a3a1e';
        ctx.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          ctx.beginPath();
          ctx.moveTo(w * 0.41, h * (0.95 - i * 0.09));
          ctx.lineTo(w * 0.6, h * (0.95 - i * 0.09 - 0.02));
          ctx.stroke();
        }
        const cx = w * 0.5;
        const cy = h * 0.2;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI + (i / 6) * Math.PI;
          ctx.strokeStyle = i % 2 ? '#22c55e' : '#16a34a';
          ctx.lineWidth = w * 0.06;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.1 - h * 0.08, cx + Math.cos(a) * w * 0.46, cy + Math.sin(a) * h * 0.05 + h * 0.13);
          ctx.stroke();
        }
        blob(ctx, cx - 6, cy + 10, 7, 7, '#a16207', '#4b2e0b');
        blob(ctx, cx + 7, cy + 12, 7, 7, '#a16207', '#4b2e0b');
      });
    case 'fern':
      return mk(kind, 120, 90, (ctx, w, h) => {
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
          ctx.strokeStyle = i % 2 ? '#22c55e' : '#15803d';
          ctx.lineWidth = w * 0.05;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(w / 2, h);
          ctx.quadraticCurveTo(w / 2 + Math.cos(a) * w * 0.3, h + Math.sin(a) * h * 0.9, w / 2 + Math.cos(a) * w * 0.48, h + Math.sin(a) * h * 0.5);
          ctx.stroke();
        }
      });
    case 'rock':
      return mk(kind, 110, 80, (ctx, w, h) => {
        ctx.fillStyle = '#6b7280';
        ctx.beginPath();
        ctx.moveTo(w * 0.05, h);
        ctx.lineTo(w * 0.15, h * 0.35);
        ctx.lineTo(w * 0.45, h * 0.05);
        ctx.lineTo(w * 0.8, h * 0.25);
        ctx.lineTo(w * 0.97, h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath();
        ctx.moveTo(w * 0.15, h * 0.35);
        ctx.lineTo(w * 0.45, h * 0.05);
        ctx.lineTo(w * 0.5, h * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.moveTo(w * 0.8, h * 0.25);
        ctx.lineTo(w * 0.97, h);
        ctx.lineTo(w * 0.6, h);
        ctx.closePath();
        ctx.fill();
      });
    case 'stump':
      return mk(kind, 90, 80, (ctx, w, h) => {
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(w * 0.15, h * 0.2, w * 0.7, h * 0.8);
        blob(ctx, w * 0.5, h * 0.2, w * 0.35, h * 0.14, '#d9a066', '#a16207');
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.2, w * 0.2, h * 0.08, 0, 0, TAU);
        ctx.stroke();
        blob(ctx, w * 0.78, h * 0.55, 10, 6, '#ef4444', '#991b1b');
      });
    case 'flower':
      return mk(kind, 70, 70, (ctx, w, h) => {
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w / 2, h);
        ctx.lineTo(w / 2, h * 0.4);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          blob(ctx, w / 2 + Math.cos(a) * 14, h * 0.32 + Math.sin(a) * 14, 11, 11, '#f472b6', '#be185d');
        }
        blob(ctx, w / 2, h * 0.32, 9, 9, '#fde047', '#ca8a04');
      });
    case 'house':
    case 'house2':
      return mk(kind, kind === 'house' ? 210 : 180, kind === 'house' ? 250 : 300, (ctx, w, h) => {
        const rnd = mulberry32(kind === 'house' ? 3 : 9);
        const cols = ['#f97316', '#38bdf8', '#facc15', '#f472b6', '#4ade80', '#c084fc'];
        const floors = kind === 'house' ? 2 : 3;
        const fh = (h * 0.8) / floors;
        for (let f = 0; f < floors; f++) {
          const col = cols[Math.floor(rnd() * cols.length)];
          const y = h - (f + 1) * fh;
          ctx.fillStyle = col;
          ctx.fillRect(w * 0.08 + f * 4, y, w * 0.84 - f * 8, fh);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(w * 0.08 + f * 4, y + fh - 6, w * 0.84 - f * 8, 6);
          // windows
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(w * (0.16 + i * 0.28), y + fh * 0.2, w * 0.14, fh * 0.42);
            ctx.fillStyle = rnd() < 0.4 ? '#fde047' : '#7dd3fc';
            ctx.fillRect(w * (0.16 + i * 0.28) + 3, y + fh * 0.2 + 3, w * 0.14 - 6, fh * 0.42 - 6);
          }
        }
        // roof slab + water tank
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(w * 0.04, h - floors * fh - 8, w * 0.92, 10);
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(w * 0.6, h - floors * fh - 40, w * 0.22, 32);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(w * 0.64, h - floors * fh - 48, w * 0.14, 10);
        // door
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(w * 0.4, h - fh * 0.62, w * 0.16, fh * 0.62);
      });
    case 'tower':
      return mk(kind, 110, 330, (ctx, w, h) => {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(w * 0.42, h * 0.35, w * 0.16, h * 0.65);
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.28, w * 0.45, h * 0.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(w * 0.12, h * 0.2, w * 0.76, h * 0.1);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.08, 6, 0, TAU);
        ctx.fill();
      });
    case 'lamp':
      return mk(kind, 70, 220, (ctx, w, h) => {
        ctx.fillStyle = '#374151';
        ctx.fillRect(w * 0.45, h * 0.12, w * 0.1, h * 0.88);
        ctx.fillRect(w * 0.3, h * 0.1, w * 0.4, 7);
        blob(ctx, w * 0.5, h * 0.1, 12, 10, '#fef9c3', '#facc15');
      });
    case 'laundry':
      return mk(kind, 190, 170, (ctx, w, h) => {
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h);
        ctx.lineTo(w * 0.08, h * 0.25);
        ctx.moveTo(w * 0.92, h);
        ctx.lineTo(w * 0.92, h * 0.25);
        ctx.stroke();
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.08, h * 0.26);
        ctx.quadraticCurveTo(w / 2, h * 0.4, w * 0.92, h * 0.26);
        ctx.stroke();
        const cols = ['#ef4444', '#facc15', '#3b82f6', '#f472b6', '#4ade80'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = cols[i];
          const x = w * (0.18 + i * 0.15);
          ctx.fillRect(x, h * (0.3 + 0.03 * Math.sin(i * 1.3 + 1)), w * 0.11, h * 0.26);
        }
      });
    case 'umbrella':
      return mk(kind, 150, 170, (ctx, w, h) => {
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(w * 0.48, h * 0.25, w * 0.04, h * 0.75);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? '#f8fafc' : '#ef4444';
          ctx.beginPath();
          ctx.moveTo(w / 2, h * 0.04);
          ctx.ellipse(w / 2, h * 0.3, w * 0.48, h * 0.26, 0, Math.PI + (i / 8) * Math.PI, Math.PI + ((i + 1) / 8) * Math.PI);
          ctx.closePath();
          ctx.fill();
        }
        blob(ctx, w * 0.2, h * 0.93, 22, 6, '#fcd34d', '#d97706');
      });
    case 'shack':
      return mk(kind, 190, 190, (ctx, w, h) => {
        ctx.fillStyle = '#b45309';
        ctx.fillRect(w * 0.1, h * 0.4, w * 0.8, h * 0.6);
        ctx.fillStyle = '#92400e';
        for (let i = 0; i < 8; i++) ctx.fillRect(w * (0.1 + i * 0.1), h * 0.4, 2, h * 0.6);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(w * 0.02, h * 0.42);
        ctx.lineTo(w / 2, h * 0.05);
        ctx.lineTo(w * 0.98, h * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(w * 0.4, h * 0.62, w * 0.2, h * 0.38);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(w * 0.15, h * 0.52, w * 0.18, h * 0.16);
        ctx.fillStyle = '#ef4444';
        ctx.font = `bold ${h * 0.12}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('COCO GELADO', w / 2, h * 0.32);
      });
    case 'buoy':
      return mk(kind, 70, 100, (ctx, w, h) => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(w * 0.25, h);
        ctx.lineTo(w * 0.75, h);
        ctx.lineTo(w * 0.62, h * 0.3);
        ctx.lineTo(w * 0.38, h * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(w * 0.3, h * 0.55, w * 0.4, h * 0.14);
        blob(ctx, w / 2, h * 0.22, 11, 11, '#fde047', '#ca8a04');
      });
    case 'castle':
      return mk(kind, 130, 110, (ctx, w, h) => {
        ctx.fillStyle = '#e8c27b';
        ctx.fillRect(w * 0.1, h * 0.5, w * 0.8, h * 0.5);
        for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.1 + i * 0.2), h * 0.38, w * 0.12, h * 0.14);
        ctx.fillStyle = '#d4a85a';
        ctx.fillRect(w * 0.42, h * 0.1, w * 0.16, h * 0.4);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(w * 0.5, h * 0.0, w * 0.18, h * 0.1);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(w * 0.43, h * 0.72, w * 0.14, h * 0.28);
      });
    case 'antenna':
      return mk(kind, 100, 340, (ctx, w, h) => {
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(w * 0.3, h);
        ctx.lineTo(w * 0.5, h * 0.1);
        ctx.lineTo(w * 0.7, h);
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let i = 1; i < 7; i++) {
          const y = h * (0.1 + i * 0.13);
          const o = (y - h * 0.1) / (h * 0.9) * w * 0.2;
          ctx.beginPath();
          ctx.moveTo(w * 0.5 - o, y);
          ctx.lineTo(w * 0.5 + o, y);
          ctx.stroke();
        }
        blob(ctx, w * 0.5, h * 0.08, 10, 10, '#f87171', '#7f1d1d');
      });
    case 'panel':
      return mk(kind, 220, 200, (ctx, w, h) => {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(w * 0.47, h * 0.5, w * 0.06, h * 0.5);
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#1d4ed8';
          ctx.beginPath();
          ctx.moveTo(w / 2 + s * w * 0.06, h * 0.55);
          ctx.lineTo(w / 2 + s * w * 0.48, h * 0.42);
          ctx.lineTo(w / 2 + s * w * 0.48, h * 0.12);
          ctx.lineTo(w / 2 + s * w * 0.06, h * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#93c5fd';
          ctx.lineWidth = 2;
          for (let i = 1; i < 5; i++) {
            const x = w / 2 + s * w * (0.06 + i * 0.084);
            ctx.beginPath();
            ctx.moveTo(x, h * (0.55 - i * 0.026));
            ctx.lineTo(x, h * (0.25 - i * 0.026));
            ctx.stroke();
          }
        }
        blob(ctx, w / 2, h * 0.62, 18, 14, '#e2e8f0', '#64748b');
      });
    case 'crystal':
      return mk(kind, 110, 200, (ctx, w, h) => {
        const cols = ['#a855f7', '#22d3ee', '#f472b6'];
        for (let i = 0; i < 3; i++) {
          const x = w * (0.25 + i * 0.25);
          const hh = h * (0.9 - i * 0.18 + (i === 1 ? 0.12 : 0));
          const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
          g.addColorStop(0, shade(cols[i], 1.4));
          g.addColorStop(1, shade(cols[i], 0.6));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - 14, h);
          ctx.lineTo(x - 9, h - hh * 0.8);
          ctx.lineTo(x, h - hh);
          ctx.lineTo(x + 9, h - hh * 0.8);
          ctx.lineTo(x + 14, h);
          ctx.closePath();
          ctx.fill();
        }
      });
    case 'asteroid':
      return mk(kind, 190, 170, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w * 0.38, h * 0.35, 4, w / 2, h / 2, w * 0.5);
        g.addColorStop(0, '#9ca3af');
        g.addColorStop(1, '#374151');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          const r = (0.42 + 0.08 * Math.sin(i * 2.7)) * w;
          const x = w / 2 + Math.cos(a) * r;
          const y = h / 2 + Math.sin(a) * r * 0.85;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (const [cx, cy, r] of [[0.35, 0.4, 0.09], [0.62, 0.55, 0.12], [0.5, 0.25, 0.06]] as const) {
          ctx.beginPath();
          ctx.arc(w * cx, h * cy, w * r, 0, TAU);
          ctx.fill();
        }
      });
    case 'dish':
      return mk(kind, 150, 190, (ctx, w, h) => {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(w * 0.46, h * 0.5, w * 0.08, h * 0.5);
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.35, w * 0.46, h * 0.24, -0.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.ellipse(w / 2 + 4, h * 0.36, w * 0.3, h * 0.15, -0.5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w / 2, h * 0.35);
        ctx.lineTo(w * 0.72, h * 0.08);
        ctx.stroke();
        blob(ctx, w * 0.72, h * 0.08, 7, 7, '#fde047', '#ca8a04');
      });
    default:
      return mk('unknown', 60, 60, (ctx, w, h) => blob(ctx, w / 2, h / 2, w / 3, h / 3, '#fff', '#888'));
  }
}

// ------------------------------------------------------------------- items

export function itemBoxFace(): HTMLCanvasElement {
  const key = 'box';
  let b = cache.get(key);
  if (!b) {
    b = mk(key, 60, 60, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#fde047');
      g.addColorStop(1, '#f59e0b');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(5, 5, w - 10, h - 10, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.roundRect(11, 11, w * 0.45, 9, 5);
      ctx.fill();
      ctx.fillStyle = '#7c2d12';
      ctx.font = `900 ${h * 0.62}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', w / 2, h * 0.54);
    });
  }
  return b.c;
}

export function bananaPeel(): Billboard {
  return mk('banana', 44, 34, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.88, w * 0.4, h * 0.1, 0, 0, TAU);
    ctx.fill();
    // peeled strips
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI * 0.95 + (i / 3) * Math.PI * 0.9;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = w * 0.14;
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.75);
      ctx.quadraticCurveTo(w / 2 + Math.cos(a) * w * 0.3, h * 0.75 + Math.sin(a) * h * 0.9, w / 2 + Math.cos(a) * w * 0.44, h * 0.8 + Math.sin(a) * h * 0.1);
      ctx.stroke();
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = w * 0.05;
      ctx.stroke();
    }
    blob(ctx, w / 2, h * 0.75, w * 0.14, h * 0.12, '#fef3c7', '#d97706');
    ctx.fillStyle = '#7c4a0b';
    ctx.fillRect(w / 2 - 2, h * 0.3, 4, h * 0.2);
  });
}

export function cocoSprite(): Billboard {
  return mk('coco', 44, 52, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.94, w * 0.35, h * 0.06, 0, 0, TAU);
    ctx.fill();
    blob(ctx, w / 2, h * 0.64, w * 0.4, h * 0.32, '#a16207', '#451a03');
    // fuzz
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * w * 0.38, h * 0.64 + Math.sin(a) * h * 0.3);
      ctx.lineTo(w / 2 + Math.cos(a) * w * 0.47, h * 0.64 + Math.sin(a) * h * 0.38);
      ctx.stroke();
    }
    // angry eyes
    ctx.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(w / 2 + s * w * 0.15, h * 0.58, w * 0.1, h * 0.09, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(w / 2 + s * w * 0.12, h * 0.6, w * 0.04, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.46);
    ctx.lineTo(w * 0.46, h * 0.54);
    ctx.moveTo(w * 0.72, h * 0.46);
    ctx.lineTo(w * 0.54, h * 0.54);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.8, w * 0.1, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    // antenna
    ctx.strokeStyle = '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.34);
    ctx.lineTo(w / 2, h * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.1, 3.5, 0, TAU);
    ctx.fill();
  });
}

export function chineloSprite(): Billboard {
  return mk('chinelo', 40, 40, (ctx, w, h) => {
    ctx.fillStyle = '#2563eb';
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.22, h * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#93c5fd';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.44, w * 0.14, h * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.45);
    ctx.lineTo(w / 2, h * 0.28);
    ctx.lineTo(w * 0.66, h * 0.45);
    ctx.moveTo(w / 2, h * 0.28);
    ctx.lineTo(w / 2, h * 0.18);
    ctx.stroke();
  });
}

export function hazardBillboard(kind: string): Billboard {
  switch (kind) {
    case 'crab':
      return mk(kind, 70, 50, (ctx, w, h) => {
        ctx.strokeStyle = '#b91c1c';
        ctx.lineWidth = 3;
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(w / 2 + s * w * 0.15, h * 0.7);
            ctx.lineTo(w / 2 + s * w * (0.32 + i * 0.05), h * (0.6 + i * 0.12));
            ctx.lineTo(w / 2 + s * w * (0.36 + i * 0.05), h * (0.88));
            ctx.stroke();
          }
          // claws
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(w / 2 + s * w * 0.4, h * 0.3, w * 0.12, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#fecaca';
          ctx.beginPath();
          ctx.moveTo(w / 2 + s * w * 0.4, h * 0.3);
          ctx.lineTo(w / 2 + s * w * 0.5, h * 0.12);
          ctx.lineTo(w / 2 + s * w * 0.34, h * 0.14);
          ctx.fill();
          ctx.strokeStyle = '#b91c1c';
          ctx.beginPath();
          ctx.moveTo(w / 2 + s * w * 0.2, h * 0.55);
          ctx.lineTo(w / 2 + s * w * 0.36, h * 0.36);
          ctx.stroke();
        }
        blob(ctx, w / 2, h * 0.62, w * 0.28, h * 0.24, '#f87171', '#991b1b');
        for (const s of [-1, 1]) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(w / 2 + s * w * 0.1, h * 0.4, w * 0.07, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(w / 2 + s * w * 0.08, h * 0.42, w * 0.03, 0, TAU);
          ctx.fill();
        }
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.64, w * 0.1, 0.2, Math.PI - 0.2);
        ctx.stroke();
      });
    case 'dog':
      return mk(kind, 80, 70, (ctx, w, h) => {
        blob(ctx, w * 0.45, h * 0.55, w * 0.34, h * 0.24, '#e8b774', '#a16207');
        for (const x of [0.28, 0.42, 0.6, 0.72]) {
          ctx.fillStyle = '#c98a45';
          ctx.fillRect(w * x, h * 0.65, w * 0.07, h * 0.3);
        }
        blob(ctx, w * 0.78, h * 0.38, w * 0.2, h * 0.2, '#f1c98a', '#a16207');
        ctx.fillStyle = '#7c4a1d';
        ctx.beginPath();
        ctx.ellipse(w * 0.68, h * 0.34, w * 0.07, h * 0.16, 0.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(w * 0.85, h * 0.4, w * 0.03, 0, TAU);
        ctx.arc(w * 0.8, h * 0.3, w * 0.03, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#c98a45';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(w * 0.12, h * 0.5);
        ctx.quadraticCurveTo(w * 0.02, h * 0.3, w * 0.12, h * 0.2);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(w * 0.66, h * 0.5, w * 0.1, h * 0.06);
      });
    case 'asteroid':
      return sceneryBillboard('asteroid');
    case 'barrel':
      return mk(kind, 50, 70, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#1d4ed8');
        g.addColorStop(0.45, '#60a5fa');
        g.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(w * 0.12, h * 0.15, w * 0.76, h * 0.82, 10);
        ctx.fill();
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(w * 0.12, h * 0.4, w * 0.76, h * 0.2);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(w * 0.4, h * 0.02, w * 0.2, h * 0.14);
        ctx.fillStyle = '#111';
        ctx.font = `bold ${h * 0.14}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('GÁS', w / 2, h * 0.55);
      });
    default:
      return mk('log', 110, 40, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#a16207');
        g.addColorStop(1, '#4b2e0b');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(4, h * 0.15, w - 8, h * 0.8, 14);
        ctx.fill();
        ctx.strokeStyle = '#3b240a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(w * (0.15 + i * 0.17), h * 0.2);
          ctx.lineTo(w * (0.18 + i * 0.17), h * 0.9);
          ctx.stroke();
        }
        blob(ctx, w - 10, h * 0.55, 9, h * 0.38, '#d9a066', '#8a5a2b');
      });
  }
}
