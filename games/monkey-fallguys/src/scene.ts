import { drawBanana, drawCrown } from './monkeyArt';
import { hazardShape, plankSurface } from './physics';
import { GY, type Plat, type Shape, type World } from './types';

const THEMES: { top: string; bot: string; hill1: string; hill2: string; lake: string }[] = [
  { top: '#38bdf8', bot: '#fef9c3', hill1: '#86efac', hill2: '#4ade80', lake: '#7c3aed' },
  { top: '#fb7185', bot: '#fde68a', hill1: '#fdba74', hill2: '#f59e0b', lake: '#9333ea' },
  { top: '#3b0764', bot: '#f0abfc', hill1: '#a855f7', hill2: '#7e22ce', lake: '#6d28d9' },
  { top: '#0ea5e9', bot: '#bbf7d0', hill1: '#5eead4', hill2: '#14b8a6', lake: '#7c3aed' },
  { top: '#60a5fa', bot: '#e0f2fe', hill1: '#bef264', hill2: '#84cc16', lake: '#7c3aed' },
  { top: '#0f172a', bot: '#1d4ed8', hill1: '#1e3a8a', hill2: '#172554', lake: '#7c3aed' },
  { top: '#facc15', bot: '#fb923c', hill1: '#fdba74', hill2: '#f97316', lake: '#7c3aed' },
];

const JELLY = [
  ['#fb7185', '#e11d48'],
  ['#4ade80', '#16a34a'],
  ['#fde047', '#ca8a04'],
  ['#38bdf8', '#0284c7'],
];
const TILE = [
  ['#c084fc', '#7e22ce'],
  ['#f472b6', '#be185d'],
  ['#5eead4', '#0f766e'],
];

export interface CamView {
  x: number;
  y: number;
  zoom: number;
  w: number;
  h: number;
}

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function drawBackground(ctx: CanvasRenderingContext2D, cam: CamView, theme: number, time: number): void {
  const th = THEMES[theme] ?? THEMES[0];
  const g = ctx.createLinearGradient(0, 0, 0, cam.h);
  g.addColorStop(0, th.top);
  g.addColorStop(1, th.bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);

  // sun / moon
  ctx.fillStyle = theme === 5 ? 'rgba(254,249,195,0.9)' : 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(cam.w * 0.82, cam.h * 0.2, Math.min(cam.w, cam.h) * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // clouds
  ctx.fillStyle = theme === 5 ? 'rgba(148,163,184,0.25)' : 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 7; i++) {
    const base = (i * 337) % 1400;
    const px = (((base - cam.x * 0.12 + time * 8 * (1 + (i % 3) * 0.3)) % 1600) + 1600) % 1600;
    const sx = (px / 1600) * (cam.w + 300) - 150;
    const sy = cam.h * (0.08 + ((i * 53) % 30) / 100);
    const s = 0.7 + (i % 3) * 0.3;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 60 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(sx + 30 * s, sy - 10 * s, 40 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(sx - 32 * s, sy - 6 * s, 34 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // hills (two parallax layers)
  for (let layer = 0; layer < 2; layer++) {
    const f = layer === 0 ? 0.2 : 0.4;
    ctx.fillStyle = layer === 0 ? th.hill1 : th.hill2;
    ctx.beginPath();
    ctx.moveTo(0, cam.h);
    const base = cam.h * (layer === 0 ? 0.68 : 0.78);
    for (let sx = 0; sx <= cam.w + 20; sx += 20) {
      const wx = sx / cam.zoom + cam.x * f;
      const hh = Math.sin(wx * 0.004 + layer * 2) * 40 + Math.sin(wx * 0.011 + layer) * 18;
      ctx.lineTo(sx, base - hh);
    }
    ctx.lineTo(cam.w, cam.h);
    ctx.closePath();
    ctx.fill();
  }

  // palm trees on the far layer
  if (theme !== 5) {
    ctx.fillStyle = 'rgba(21,128,61,0.55)';
    for (let i = -2; i < 14; i++) {
      const wx = i * 430 + 120;
      const sx = (wx - cam.x * 0.4) * 1;
      const px = ((sx % (cam.w + 600)) + (cam.w + 600)) % (cam.w + 600) - 300;
      const gy = cam.h * 0.78 - (Math.sin((px / cam.zoom + cam.x * 0.4) * 0.004 + 2) * 40) + 10;
      ctx.fillStyle = 'rgba(120,53,15,0.5)';
      ctx.fillRect(px - 4, gy - 90, 8, 90);
      ctx.fillStyle = 'rgba(21,128,61,0.6)';
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.6;
        ctx.beginPath();
        ctx.ellipse(px + Math.cos(a) * 26, gy - 90 + Math.sin(a) * 18, 30, 8, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // stadium lights
    for (let i = 0; i < 5; i++) {
      const sx = (i / 4) * cam.w;
      ctx.fillStyle = 'rgba(254,249,195,0.9)';
      ctx.beginPath();
      ctx.arc(sx, cam.h * 0.12, 8, 0, Math.PI * 2);
      ctx.fill();
      const lg = ctx.createLinearGradient(sx, cam.h * 0.12, sx, cam.h * 0.8);
      lg.addColorStop(0, 'rgba(254,249,195,0.22)');
      lg.addColorStop(1, 'rgba(254,249,195,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(sx - 6, cam.h * 0.12);
      ctx.lineTo(sx + 6, cam.h * 0.12);
      ctx.lineTo(sx + 90, cam.h * 0.8);
      ctx.lineTo(sx - 90, cam.h * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function lakeY(w: World): number {
  if (w.kind === 'hex') return w.killY - 50;
  if (w.kind === 'seesaw') return w.killY - 50;
  if (w.kind === 'race') return GY + 150;
  return -1;
}

export function drawLake(ctx: CanvasRenderingContext2D, w: World, x0: number, x1: number, time: number): void {
  const y = lakeY(w);
  if (y < 0) return;
  const th = THEMES[w.theme] ?? THEMES[0];
  const g = ctx.createLinearGradient(0, y, 0, y + 400);
  g.addColorStop(0, th.lake);
  g.addColorStop(1, '#2e1065');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, y + 600);
  for (let x = x0; x <= x1 + 20; x += 20) {
    ctx.lineTo(x, y + Math.sin(x * 0.02 + time * 2.4) * 6 + Math.sin(x * 0.047 - time * 1.7) * 3);
  }
  ctx.lineTo(x1, y + 600);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(233,213,255,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 20; x += 20) {
    const yy = y + Math.sin(x * 0.02 + time * 2.4) * 6 + Math.sin(x * 0.047 - time * 1.7) * 3;
    if (x === x0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  // bubbles
  ctx.fillStyle = 'rgba(233,213,255,0.5)';
  for (let i = 0; i < 12; i++) {
    const bx = x0 + ((i * 197 + time * 20) % Math.max(200, x1 - x0));
    const by = y + 20 + ((i * 53 + time * 30) % 60);
    ctx.beginPath();
    ctx.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlat(ctx: CanvasRenderingContext2D, p: Plat, time: number): void {
  if (p.kind === 'solid') {
    if (p.col === 4) {
      // stone / bamboo wall
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(87,83,78,0.6)';
      ctx.lineWidth = 2;
      const y0 = Math.max(p.y, -200);
      const y1 = Math.min(p.y + p.h, 900);
      for (let y = Math.ceil(y0 / 40) * 40; y < y1; y += 40) {
        ctx.beginPath();
        ctx.moveTo(p.x, y);
        ctx.lineTo(p.x + p.w, y);
        ctx.stroke();
      }
      return;
    }
    if (p.col === 5) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#ef4444';
      for (let y = Math.max(p.y, -100); y < p.y + p.h; y += 50) ctx.fillRect(p.x, y, p.w, 22);
      ctx.strokeStyle = '#3b2410';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      return;
    }
    // grass ground
    const h = Math.min(p.h, 520);
    ctx.fillStyle = '#92612f';
    ctx.fillRect(p.x, p.y, p.w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = Math.floor(p.x / 70) * 70; x < p.x + p.w; x += 70) {
      ctx.beginPath();
      ctx.arc(x + 20, p.y + 60 + ((x / 70) % 3) * 40, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(p.x, p.y, p.w, 16);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 16);
    for (let x = p.x; x <= p.x + p.w; x += 14) ctx.lineTo(x + 7, p.y + 16 + (((x / 14) | 0) % 2 ? 7 : 3));
    ctx.lineTo(p.x + p.w, p.y + 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3b2410';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + h);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + p.w, p.y);
    ctx.lineTo(p.x + p.w, p.y + h);
    ctx.stroke();
    return;
  }
  if (p.kind === 'oneway' || p.kind === 'bounce') {
    const c = JELLY[p.col % JELLY.length];
    const wob = p.wob > 0 ? Math.sin(time * 40) * p.wob * 6 : 0;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.scale(1 + wob * 0.01, 1 - wob * 0.02);
    ctx.translate(-p.w / 2, -p.h / 2);
    const g = ctx.createLinearGradient(0, 0, 0, p.h);
    g.addColorStop(0, c[0]);
    g.addColorStop(1, c[1]);
    rr(ctx, 0, 0, p.w, p.h, 11);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3b2410';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    rr(ctx, 8, 3, p.w - 16, 5, 3);
    ctx.fill();
    if (p.kind === 'bounce') {
      ctx.fillStyle = '#fff';
      ctx.font = '900 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('↑', p.w / 2, 17);
    }
    ctx.restore();
    return;
  }
  if (p.kind === 'tile') {
    if (!p.active) return;
    const c = TILE[p.col % TILE.length];
    const stepped = p.t1 >= 0;
    const sh = stepped ? Math.sin(time * 60 + p.id) * 2.5 : 0;
    const drop = stepped ? (1 - Math.max(0, p.t1) / 0.75) * 4 : 0;
    ctx.save();
    ctx.translate(sh, drop);
    // side face
    ctx.fillStyle = stepped ? '#7f1d1d' : c[1];
    rr(ctx, p.x + 3, p.y + 8, p.w - 6, p.h + 4, 10);
    ctx.fill();
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, stepped ? '#fca5a5' : c[0]);
    g.addColorStop(1, stepped ? '#ef4444' : c[1]);
    ctx.beginPath();
    ctx.moveTo(p.x + 14, p.y);
    ctx.lineTo(p.x + p.w - 14, p.y);
    ctx.lineTo(p.x + p.w, p.y + p.h * 0.5);
    ctx.lineTo(p.x + p.w - 14, p.y + p.h);
    ctx.lineTo(p.x + 14, p.y + p.h);
    ctx.lineTo(p.x, p.y + p.h * 0.5);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2e1065';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    rr(ctx, p.x + 16, p.y + 3, p.w * 0.4, 5, 3);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (p.kind === 'door') {
    const wob = p.wob > 0 ? Math.sin(time * 50) * p.wob * 6 : 0;
    if (!p.active) {
      // open: just the frame and a swung door
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 4;
      ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 3);
      ctx.fillStyle = 'rgba(180,83,9,0.55)';
      ctx.fillRect(p.x + p.w - 6, p.y, 6, p.h);
      return;
    }
    ctx.save();
    ctx.translate(p.x + wob, p.y);
    ctx.fillStyle = '#b45309';
    rr(ctx, -4, -4, p.w + 8, p.h + 4, 5);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, p.w, p.h);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, p.w, p.h);
    ctx.beginPath();
    ctx.moveTo(p.w / 2, 0);
    ctx.lineTo(p.w / 2, p.h);
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(p.w - 6, p.h / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    if (p.wob > 0 && p.fake) {
      ctx.fillStyle = '#7f1d1d';
      ctx.font = '900 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('FALSA', p.w / 2, p.h / 2);
    }
    ctx.restore();
  }
}

const shp: Shape = { x: 0, y: 0, x2: 0, y2: 0, r: 0, vx: 0, vy: 0 };

function drawHazards(ctx: CanvasRenderingContext2D, w: World, time: number, x0: number, x1: number): void {
  for (const h of w.hazards) {
    hazardShape(h, w.t, shp);
    if (h.kind === 'hammer') {
      if (h.x < x0 - 500 || h.x > x1 + 500) continue;
      // beam
      ctx.fillStyle = '#78350f';
      rr(ctx, h.x - 30, h.y - 18, 60, 22, 6);
      ctx.fill();
      ctx.strokeStyle = '#3b2410';
      ctx.lineWidth = 3;
      ctx.stroke();
      // chain
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 6;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(shp.x, shp.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // head: angry banana-ball
      const r = shp.r;
      const g = ctx.createRadialGradient(shp.x - r * 0.3, shp.y - r * 0.3, 4, shp.x, shp.y, r);
      g.addColorStop(0, '#fef08a');
      g.addColorStop(1, '#eab308');
      ctx.beginPath();
      ctx.arc(shp.x, shp.y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#3b2410';
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(shp.x - r, shp.y - 3, r * 2, 6);
      for (const ex of [-9, 9]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(shp.x + ex, shp.y - 9, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(shp.x + ex + Math.sign(shp.vx) * 1.5, shp.y - 8, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#3b2410';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(shp.x - 14, shp.y - 19);
      ctx.lineTo(shp.x - 3, shp.y - 14);
      ctx.moveTo(shp.x + 14, shp.y - 19);
      ctx.lineTo(shp.x + 3, shp.y - 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(shp.x, shp.y + 17, 8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (h.kind === 'spinner') {
      if (h.x < x0 - 300 || h.x > x1 + 300) continue;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(h.x, h.y - 500);
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#3b2410';
      ctx.lineWidth = shp.r * 2 + 6;
      ctx.beginPath();
      ctx.moveTo(shp.x, shp.y);
      ctx.lineTo(shp.x2, shp.y2);
      ctx.stroke();
      // rolling-pin stripes
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        ctx.strokeStyle = i % 2 ? '#fde047' : '#ef4444';
        ctx.lineWidth = shp.r * 2;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(shp.x + (shp.x2 - shp.x) * t0, shp.y + (shp.y2 - shp.y) * t0);
        ctx.lineTo(shp.x + (shp.x2 - shp.x) * t1, shp.y + (shp.y2 - shp.y) * t1);
        ctx.stroke();
      }
      for (const [kx, ky] of [[shp.x, shp.y], [shp.x2, shp.y2]]) {
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(kx, ky, shp.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3b2410';
        ctx.stroke();
      }
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      if (shp.x < x0 - 100 || shp.x > x1 + 100) continue;
      ctx.save();
      ctx.translate(shp.x, shp.y);
      ctx.rotate(shp.x / shp.r);
      const g = ctx.createRadialGradient(-8, -8, 4, 0, 0, shp.r);
      g.addColorStop(0, '#d6a46b');
      g.addColorStop(1, '#92400e');
      ctx.beginPath();
      ctx.arc(0, 0, shp.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#3b2410';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(59,36,16,0.55)';
      ctx.lineWidth = 2.5;
      for (const rad of [shp.r * 0.68, shp.r * 0.38]) {
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      // angry eyes that do not rotate
      ctx.fillStyle = '#fff';
      for (const ex of [-10, 10]) {
        ctx.beginPath();
        ctx.arc(shp.x + ex, shp.y - 4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3b2410';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(shp.x + ex - 2, shp.y - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
      }
    }
  }
  void time;
}

function drawCoco(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
  g.addColorStop(0, '#a16207');
  g.addColorStop(1, '#451a03');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#1c0a02';
  ctx.stroke();
  ctx.fillStyle = '#1c0a02';
  for (const [ex, ey] of [[-0.3, -0.25], [0.3, -0.25], [0, 0.2]]) {
    ctx.beginPath();
    ctx.arc(ex * r, ey * r, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.5, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawWorldObjects(ctx: CanvasRenderingContext2D, w: World, time: number, x0: number, x1: number): void {
  // finish / start / checkpoints
  if (w.kind === 'race') {
    for (const cp of w.checkpoints.slice(1)) {
      if (cp < x0 - 50 || cp > x1 + 50) continue;
      ctx.strokeStyle = '#3b2410';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cp, GY);
      ctx.lineTo(cp, GY - 110);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(cp, GY - 110);
      ctx.lineTo(cp + 42 + Math.sin(time * 5) * 4, GY - 98);
      ctx.lineTo(cp, GY - 84);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // start banner
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#3b2410';
    ctx.lineWidth = 4;
    ctx.strokeRect(w.startX + 60, GY - 190, 6, 190);
    ctx.fillRect(w.startX + 60, GY - 190, 6, 190);
    ctx.fillStyle = '#ef4444';
    rr(ctx, w.startX - 20, GY - 215, 170, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 22px "Trebuchet MS", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('LARGADA', w.startX + 65, GY - 187);
    if (w.finishX > 0 && w.finishX > x0 - 200 && w.finishX < x1 + 200) {
      const fx = w.finishX;
      ctx.fillStyle = '#44403c';
      ctx.fillRect(fx - 8, GY - 260, 12, 260);
      ctx.fillRect(fx + 190, GY - 260, 12, 260);
      for (let i = 0; i < 14; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#111827' : '#f8fafc';
          ctx.fillRect(fx - 8 + i * 15, GY - 260 + j * 14, 15, 14);
        }
      }
      ctx.fillStyle = '#facc15';
      rr(ctx, fx + 6, GY - 212, 180, 42, 10);
      ctx.fill();
      ctx.strokeStyle = '#3b2410';
      ctx.stroke();
      ctx.fillStyle = '#7c2d12';
      ctx.font = '900 24px "Trebuchet MS", system-ui';
      ctx.fillText('CHEGADA 🍌', fx + 96, GY - 183);
      // finish line stripe
      for (let j = 0; j < 8; j++) {
        ctx.fillStyle = j % 2 ? '#111827' : '#f8fafc';
        ctx.fillRect(fx + 90, GY - 4 - j * 0, 10, 4);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(fx + 90, GY - 260, 8, 260);
    }
  }
  // gate labels
  for (const g of w.gates) {
    if (g.x < x0 - 300 || g.x > x1 + 300) continue;
    ctx.fillStyle = '#7c2d12';
    ctx.font = '900 20px "Trebuchet MS", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('PORTAS DA SORTE', g.x + 15, -40);
  }
  drawHazards(ctx, w, time, x0, x1);
}

export function drawPlatforms(ctx: CanvasRenderingContext2D, w: World, time: number, x0: number, x1: number): void {
  for (const p of w.plats) {
    if (p.x > x1 + 60 || p.x + p.w < x0 - 60) continue;
    drawPlat(ctx, p, time);
  }
  // goal nets
  if (w.kind === 'soccer') {
    const hf = (w.bounds.x1 - w.bounds.x0) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      const nx0 = side > 0 ? hf : -hf - 110;
      for (let i = 0; i <= 110; i += 16) {
        ctx.beginPath();
        ctx.moveTo(nx0 + i, GY - 230);
        ctx.lineTo(nx0 + i, GY);
        ctx.stroke();
      }
      for (let j = 0; j <= 230; j += 16) {
        ctx.beginPath();
        ctx.moveTo(nx0, GY - 230 + j);
        ctx.lineTo(nx0 + 110, GY - 230 + j);
        ctx.stroke();
      }
    }
    // center line & circle
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, GY);
    ctx.lineTo(0, GY - 16);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 18px "Trebuchet MS", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('GOL', hf + 55, GY - 240);
    ctx.fillText('GOL', -hf - 55, GY - 240);
  }
}

export function drawDynamic(ctx: CanvasRenderingContext2D, w: World, time: number): void {
  // seesaw plank
  if (w.plank) {
    const pk = w.plank;
    // fulcrum
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(pk.px - 50, pk.py + 200);
    ctx.lineTo(pk.px, pk.py);
    ctx.lineTo(pk.px + 50, pk.py + 200);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2e1065';
    ctx.stroke();
    ctx.save();
    ctx.translate(pk.px, pk.py);
    ctx.rotate(pk.ang);
    const g = ctx.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, '#fcd34d');
    g.addColorStop(1, '#d97706');
    rr(ctx, -pk.len / 2, -11, pk.len, 22, 11);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#3b2410';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,53,15,0.5)';
    ctx.lineWidth = 2;
    for (let x = -pk.len / 2 + 40; x < pk.len / 2 - 20; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, -9);
      ctx.lineTo(x + 24, 9);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(pk.px, pk.py, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    void plankSurface;
  }
  for (const c of w.cocos) drawCoco(ctx, c.x, c.y, c.r, c.rot);
  if (w.ball) drawCoco(ctx, w.ball.x, w.ball.y, w.ball.r, w.ball.rot);
  if (w.crown && w.crown.holder < 0) {
    const c = w.crown;
    // glow
    const g = ctx.createRadialGradient(c.x, c.y - 6, 4, c.x, c.y - 6, 60);
    g.addColorStop(0, 'rgba(253,224,71,0.8)');
    g.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c.x - 60, c.y - 66, 120, 120);
    drawCrown(ctx, c.x, c.y + Math.sin(time * 4) * 3, 1.5, time);
  }
  void drawBanana;
}
