import { TOOLS } from './data';
import type { Atlas } from './textures';

export type Expr = 'neutral' | 'happy' | 'hurt' | 'focus' | 'eat' | 'ko' | 'scared';

export interface MonkeyPose {
  facing: 1 | -1;
  walk: number;
  speed: number; // 0..1
  inAir: boolean;
  vy: number;
  acting: boolean;
  swing: number; // fase do balanço do braço
  aimX: number; // direção da mira (mundo)
  aimY: number;
  hold: number;
  expr: Expr;
  blink: number; // 0 = aberto, 1 = fechado
  flash: number;
  fur: string;
  accent: string;
  t: number;
  climbing: boolean;
  swimming: boolean;
  eating: boolean;
  name?: string;
  emote?: string;
  emoteAlpha?: number;
}

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const h = hex.replace('#', '');
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, c);
  }
  return c;
}
export function tint(hex: string, f: number, flash = 0): string {
  const c = rgb(hex);
  let r = c[0] * f;
  let g = c[1] * f;
  let b = c[2] * f;
  if (flash > 0) {
    r = r + (255 - r) * flash;
    g = g + (70 - g) * flash;
    b = b + (70 - b) * flash;
  }
  return `rgb(${Math.max(0, Math.min(255, r)) | 0},${Math.max(0, Math.min(255, g)) | 0},${Math.max(0, Math.min(255, b)) | 0})`;
}

function capsule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rot = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

const SKIN = '#f2cfa2';
const EAR_IN = '#e8a09c';

/** Desenha o macaco com rig de partes. (sx, sy) = pés em pixels de tela. */
export function drawMonkey(ctx: CanvasRenderingContext2D, atlas: Atlas, p: MonkeyPose, sx: number, sy: number, ts: number): void {
  const f = p.facing;
  const t = p.t;
  const ko = p.expr === 'ko';
  const fl = p.flash;
  const air = p.inAir && !p.climbing && !p.swimming;
  const mv = p.speed;
  const bob = ko ? 0 : air ? 0 : mv > 0.05 ? Math.abs(Math.sin(p.walk)) * 0.05 : Math.sin(t * 2.4) * 0.012;

  ctx.save();
  if (!air && !ko) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1, ts * 0.3, ts * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(sx, sy);
  ctx.scale(ts * f, ts);
  if (ko) {
    ctx.translate(0.15, -0.2);
    ctx.rotate(Math.PI / 2);
  }
  const fur = (k: number) => tint(p.fur, k, fl);
  const accent = (k: number) => tint(p.accent, k, fl);

  // ---------- cauda
  {
    let tx = -0.2;
    let ty = -0.6 + bob;
    let ang = Math.PI + 0.55;
    ctx.strokeStyle = fur(0.78);
    ctx.lineWidth = 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    const wag = Math.sin(t * 3.2) * 0.3 + (mv > 0.05 ? Math.sin(p.walk) * 0.25 : 0);
    for (let i = 0; i < 7; i++) {
      ang += 0.34 + Math.sin(t * 2.6 - i * 0.7) * 0.12 + wag * 0.08;
      tx += Math.cos(ang) * 0.1;
      ty += Math.sin(ang) * 0.1;
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ell(ctx, tx, ty, 0.065, 0.065, fur(0.95));
  }

  // ---------- membros: ângulo 0 = pra baixo, positivo = pra frente
  const sinW = Math.sin(p.walk) * 0.8 * mv;
  let legA = sinW;
  let legB = -sinW;
  if (air) {
    legA = p.vy < 0 ? 0.8 : 0.4;
    legB = p.vy < 0 ? -0.5 : -0.2;
  }
  if (p.swimming) {
    legA = Math.sin(t * 9) * 0.6;
    legB = -legA;
  }
  if (p.climbing) {
    legA = Math.sin(p.walk) * 0.7 * Math.max(0.3, mv);
    legB = -legA;
  }
  if (ko) {
    legA = 0.2;
    legB = -0.2;
  }
  const legLen = 0.56;
  const hipY = -0.58 + bob;
  const leg = (hx: number, a: number, k: number) => {
    const fx = hx + Math.sin(a) * legLen;
    const fy = hipY + Math.cos(a) * legLen;
    capsule(ctx, hx, hipY, fx, fy, 0.15, fur(k));
    ell(ctx, fx + 0.06, fy - 0.01, 0.12, 0.07, tint(SKIN, k * 0.92, fl));
  };
  const armLen = 0.5;
  const shY = -1.02 + bob;
  const arm = (shx: number, tx: number, ty: number, k: number) => {
    capsule(ctx, shx, shY, tx, ty, 0.13, fur(k));
    ell(ctx, tx, ty, 0.078, 0.078, tint(SKIN, k * 0.92, fl));
  };
  const armEnd = (shx: number, a: number, len: number): [number, number] => [shx + Math.sin(a) * len, shY + Math.cos(a) * len];

  // pose dos braços
  let backA = -sinW * 1.0;
  let frontA = sinW * 1.0 + 0.1;
  if (air) {
    backA = p.vy < 0 ? 2.5 : 1.2;
    frontA = p.vy < 0 ? 2.2 : 0.9;
  }
  if (p.swimming) {
    backA = 1.1 + Math.sin(t * 8) * 1.0;
    frontA = 1.1 + Math.sin(t * 8 + 2) * 1.0;
  }
  if (p.climbing) {
    backA = Math.PI - 0.4 + Math.sin(p.walk) * 0.4 * Math.max(0.3, mv);
    frontA = Math.PI - 0.1 - Math.sin(p.walk) * 0.4 * Math.max(0.3, mv);
  }
  if (ko) {
    backA = 2.4;
    frontA = -2.2;
  }

  // ---------- perna de trás + braço de trás
  leg(-0.1, legB, 0.8);
  {
    const [hx, hy] = armEnd(-0.12, backA, armLen);
    arm(-0.12, hx, hy, 0.8);
  }

  // ---------- corpo
  ell(ctx, 0, -0.84 + bob, 0.27, 0.37, fur(1));
  ell(ctx, 0.07, -0.8 + bob, 0.17, 0.27, tint(SKIN, 1, fl));
  // shorts
  ell(ctx, 0, -0.57 + bob, 0.27, 0.13, accent(0.85));
  ctx.fillStyle = accent(1.15);
  ctx.fillRect(-0.27, -0.64 + bob, 0.54, 0.03);
  // lenço no pescoço
  const flap = Math.sin(t * 7) * 0.05;
  ctx.fillStyle = accent(1);
  ctx.beginPath();
  ctx.moveTo(-0.2, -1.1 + bob);
  ctx.lineTo(-0.44, -1.06 + bob + flap);
  ctx.lineTo(-0.38, -0.96 + bob + flap);
  ctx.lineTo(-0.2, -1.02 + bob);
  ctx.fill();
  ell(ctx, 0.04, -1.07 + bob, 0.27, 0.07, accent(1));

  // ---------- perna da frente
  leg(0.12, legA, 1);

  // ---------- cabeça
  const hx = 0.06;
  const hy = -1.36 + bob * 0.8;
  // orelhas
  ell(ctx, hx - 0.31, hy - 0.02, 0.15, 0.15, fur(0.95));
  ell(ctx, hx - 0.31, hy - 0.02, 0.09, 0.09, EAR_IN);
  ell(ctx, hx + 0.44, hy - 0.02, 0.15, 0.15, fur(0.95));
  ell(ctx, hx + 0.44, hy - 0.02, 0.09, 0.09, EAR_IN);
  ell(ctx, hx + 0.07, hy, 0.36, 0.32, fur(1));
  // topete
  ctx.strokeStyle = fur(0.7);
  ctx.lineWidth = 0.045;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(hx + 0.07 + i * 0.07, hy - 0.3);
    ctx.quadraticCurveTo(hx + 0.07 + i * 0.1, hy - 0.42, hx + 0.07 + i * 0.13 + Math.sin(t * 3 + i) * 0.015, hy - 0.45);
    ctx.stroke();
  }
  // máscara facial (coração)
  ell(ctx, hx - 0.0, hy - 0.02, 0.17, 0.17, tint(SKIN, 1, fl));
  ell(ctx, hx + 0.2, hy - 0.02, 0.17, 0.17, tint(SKIN, 1, fl));
  ell(ctx, hx + 0.1, hy + 0.08, 0.22, 0.19, tint(SKIN, 1, fl));
  // focinho
  ell(ctx, hx + 0.16, hy + 0.12, 0.14, 0.1, tint('#ecc08e', 1, fl));
  ell(ctx, hx + 0.13, hy + 0.1, 0.018, 0.022, '#6a4528');
  ell(ctx, hx + 0.2, hy + 0.1, 0.018, 0.022, '#6a4528');

  // olhos
  const lookX = Math.max(-1, Math.min(1, p.aimX * f)) * 0.025;
  const lookY = Math.max(-1, Math.min(1, p.aimY)) * 0.02;
  const eyeY = hy - 0.03;
  const expr = p.expr;
  const eyes: [number, number, number][] = [
    [hx + 0.0, eyeY, 1],
    [hx + 0.2, eyeY, -1],
  ];
  for (const [ex, ey, cross] of eyes) {
    if (expr === 'ko') {
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(ex - 0.06, ey - 0.06);
      ctx.lineTo(ex + 0.06, ey + 0.06);
      ctx.moveTo(ex + 0.06, ey - 0.06);
      ctx.lineTo(ex - 0.06, ey + 0.06);
      ctx.stroke();
      continue;
    }
    if (expr === 'hurt') {
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(ex - 0.06 * cross, ey - 0.06);
      ctx.lineTo(ex + 0.05 * cross, ey);
      ctx.lineTo(ex - 0.06 * cross, ey + 0.06);
      ctx.stroke();
      continue;
    }
    if (expr === 'eat' || expr === 'happy') {
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.arc(ex, ey + 0.03, 0.065, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      continue;
    }
    const big = expr === 'scared';
    const r = big ? 0.105 : 0.088;
    ell(ctx, ex, ey, r, r * 1.05, '#ffffff');
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.ellipse(ex, ey, r, r * 1.05, 0, 0, Math.PI * 2);
    ctx.stroke();
    const pr = big ? 0.03 : 0.048;
    // vesgo: as pupilas olham pra dentro
    ell(ctx, ex + lookX - cross * 0.022, ey + lookY, pr, pr, '#1c1008');
    ell(ctx, ex + lookX - cross * 0.022 - 0.014, ey + lookY - 0.016, 0.014, 0.014, '#ffffff');
    const lid = expr === 'focus' ? Math.max(p.blink, 0.38) : p.blink;
    if (lid > 0.05) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(ex, ey, r + 0.004, r * 1.05 + 0.004, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = tint(SKIN, 0.92, fl);
      ctx.fillRect(ex - r - 0.01, ey - r * 1.05 - 0.01, r * 2 + 0.02, (r * 2.1 + 0.02) * lid);
      ctx.restore();
      ctx.strokeStyle = '#3a2412';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(ex - r, ey - r * 1.05 + (r * 2.1) * lid);
      ctx.lineTo(ex + r, ey - r * 1.05 + (r * 2.1) * lid);
      ctx.stroke();
    }
  }
  // sobrancelhas
  ctx.strokeStyle = fur(0.55);
  ctx.lineWidth = 0.04;
  ctx.lineCap = 'round';
  const brow = (ex: number, dir: number, tilt: number) => {
    ctx.beginPath();
    ctx.moveTo(ex - 0.07, eyeY - 0.12 + tilt * -dir * 0.03);
    ctx.lineTo(ex + 0.07, eyeY - 0.12 + tilt * dir * 0.03);
    ctx.stroke();
  };
  if (expr === 'focus') {
    brow(hx, 1, 1.3);
    brow(hx + 0.2, -1, 1.3);
  } else if (expr === 'hurt') {
    brow(hx, -1, 1.3);
    brow(hx + 0.2, 1, 1.3);
  } else if (expr === 'scared') {
    brow(hx, -1, 0.8);
    brow(hx + 0.2, 1, 0.8);
  } else {
    brow(hx, 0, 0);
    brow(hx + 0.2, 0, 0);
  }

  // boca
  const mx = hx + 0.14;
  const my = hy + 0.2;
  ctx.strokeStyle = '#4a2a18';
  ctx.lineWidth = 0.03;
  if (expr === 'happy') {
    ctx.fillStyle = '#5a1e1e';
    ctx.beginPath();
    ctx.ellipse(mx, my, 0.085, 0.06, 0, 0, Math.PI);
    ctx.fill();
    ell(ctx, mx, my + 0.035, 0.04, 0.022, '#ee7080');
  } else if (expr === 'eat') {
    const o = 0.02 + Math.abs(Math.sin(t * 14)) * 0.045;
    ell(ctx, mx, my + 0.01, 0.07, o, '#5a1e1e');
  } else if (expr === 'hurt' || expr === 'scared') {
    ell(ctx, mx, my + 0.015, 0.045, expr === 'hurt' ? 0.06 : 0.04, '#5a1e1e');
  } else if (expr === 'ko') {
    ell(ctx, mx + 0.03, my + 0.02, 0.045, 0.03, '#5a1e1e');
    ell(ctx, mx + 0.07, my + 0.06, 0.03, 0.055, '#ee7080');
  } else if (expr === 'focus') {
    ctx.beginPath();
    ctx.arc(mx, my - 0.04, 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ell(ctx, mx + 0.07, my + 0.02, 0.03, 0.05 + Math.sin(t * 10) * 0.008, '#ee7080');
  } else {
    ctx.beginPath();
    ctx.arc(mx, my - 0.05, 0.07, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  // ---------- braço da frente + item
  let fhx: number;
  let fhy: number;
  let armAng = frontA;
  if (p.eating) {
    fhx = hx + 0.17;
    fhy = hy + 0.15 + Math.sin(t * 14) * 0.015;
  } else if (p.acting) {
    const ax = p.aimX * f;
    const base = Math.atan2(ax, p.aimY);
    const sw = Math.sin(p.swing);
    armAng = base + 0.6 - (0.5 + 0.5 * sw) * 1.5;
    [fhx, fhy] = armEnd(0.2, armAng, armLen);
  } else {
    [fhx, fhy] = armEnd(0.2, frontA, armLen);
  }
  arm(0.2, fhx, fhy, 1);

  if (p.hold > 0) {
    const tool = TOOLS[p.hold];
    ctx.save();
    ctx.translate(fhx, fhy);
    ctx.imageSmoothingEnabled = false;
    if (p.eating) {
      const u = 0.5 / 16;
      ctx.rotate(-0.4);
      ctx.drawImage(atlas.icon(p.hold), -8 * u, -12 * u, 16 * u, 16 * u);
    } else if (tool) {
      const a = Math.atan2(Math.cos(armAng), Math.sin(armAng)); // direção do braço (y p/ baixo)
      ctx.rotate(a + Math.PI / 4 + (p.acting ? 0 : 0.2));
      const u = 0.95 / 16;
      ctx.drawImage(atlas.icon(p.hold), -3 * u, -13 * u, 16 * u, 16 * u);
    } else {
      const u = 0.46 / 16;
      ctx.rotate(0.15);
      ctx.drawImage(atlas.icon(p.hold), -8 * u, -12 * u, 16 * u, 16 * u);
    }
    ctx.restore();
  }
  ctx.restore();

  // ---------- nome e balão
  if (p.name) {
    ctx.save();
    ctx.font = `bold ${Math.max(10, Math.round(ts * 0.3))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = '#fff';
    const ny = sy - ts * 2.05;
    ctx.strokeText(p.name, sx, ny);
    ctx.fillText(p.name, sx, ny);
    ctx.restore();
  }
  if (p.emote && (p.emoteAlpha ?? 0) > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.emoteAlpha ?? 0);
    ctx.font = `bold ${Math.max(11, Math.round(ts * 0.34))}px system-ui, sans-serif`;
    const w = ctx.measureText(p.emote).width + 16;
    const bx = sx - w / 2;
    const by = sy - ts * (p.name ? 2.9 : 2.6);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, ts * 0.55, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 5, by + ts * 0.55);
    ctx.lineTo(sx, by + ts * 0.55 + 8);
    ctx.lineTo(sx + 5, by + ts * 0.55);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.fillText(p.emote, sx, by + ts * 0.38);
    ctx.restore();
  }
}

// -------------------- Criaturas --------------------
export interface MobPose {
  kind: number;
  face: 1 | -1;
  t: number;
  walk: number;
  flash: number;
  fuse: number;
  hpFrac: number;
}

export function drawMob(ctx: CanvasRenderingContext2D, m: MobPose, sx: number, sy: number, ts: number): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(ts * m.face, ts);
  const fl = m.flash;
  if (m.kind === 0) drawCapivara(ctx, m, fl);
  else drawPombo(ctx, m, fl);
  ctx.restore();
  if (m.hpFrac < 0.999) {
    const w = ts * 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx - w / 2, sy - ts * (m.kind === 0 ? 1.25 : 1.35), w, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(sx - w / 2 + 1, sy - ts * (m.kind === 0 ? 1.25 : 1.35) + 1, (w - 2) * m.hpFrac, 3);
  }
}

function drawCapivara(ctx: CanvasRenderingContext2D, m: MobPose, fl: number): void {
  const t = m.t;
  const sw = Math.sin(m.walk);
  const bob = Math.abs(sw) * 0.04;
  const C = (h: string, k = 1) => tint(h, k, fl);
  // pernas
  for (let i = 0; i < 4; i++) {
    const lx = [-0.34, -0.18, 0.2, 0.36][i];
    const a = Math.sin(m.walk + (i % 2 === 0 ? 0 : Math.PI)) * 0.5;
    capsule(ctx, lx, -0.3 - bob, lx + Math.sin(a) * 0.2, -0.02, 0.13, C('#6b4a2a', i < 2 ? 0.8 : 0.95));
  }
  // corpo
  ell(ctx, 0, -0.5 - bob, 0.5, 0.3, C('#8a6a3c'));
  // remendos zumbi (verde)
  ell(ctx, -0.12, -0.55 - bob, 0.2, 0.15, C('#6e8a48'), 0.3);
  ell(ctx, 0.2, -0.4 - bob, 0.12, 0.09, C('#5c7a3c'));
  // costelas expostas
  ctx.strokeStyle = C('#efe6c8');
  ctx.lineWidth = 0.03;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-0.14 + i * 0.1, -0.52 - bob);
    ctx.lineTo(-0.1 + i * 0.1, -0.42 - bob);
    ctx.stroke();
  }
  // costura
  ctx.strokeStyle = C('#2a1a10');
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.7 - bob);
  ctx.lineTo(-0.1, -0.64 - bob);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-0.27 + i * 0.07, -0.73 - bob);
    ctx.lineTo(-0.25 + i * 0.07, -0.61 - bob);
    ctx.stroke();
  }
  // cabeça
  const hx = 0.46;
  const hy = -0.62 - bob + Math.sin(t * 3) * 0.02;
  ell(ctx, hx, hy, 0.3, 0.24, C('#947244'));
  ell(ctx, hx + 0.18, hy + 0.07, 0.17, 0.15, C('#7c5e36'));
  // laranja na cabeça
  ell(ctx, hx - 0.05, hy - 0.26, 0.12, 0.11, C('#ff9a1e'));
  ell(ctx, hx - 0.08, hy - 0.29, 0.03, 0.025, C('#ffd080'));
  ctx.fillStyle = C('#3a8a2a');
  ctx.fillRect(hx - 0.05, hy - 0.38, 0.03, 0.05);
  // orelha
  ell(ctx, hx - 0.12, hy - 0.16, 0.06, 0.05, C('#6b4a2a'));
  // olhos zumbi: um X, um pendurado
  ctx.strokeStyle = '#1a1008';
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(hx + 0.02, hy - 0.08);
  ctx.lineTo(hx + 0.1, hy);
  ctx.moveTo(hx + 0.1, hy - 0.08);
  ctx.lineTo(hx + 0.02, hy);
  ctx.stroke();
  ell(ctx, hx + 0.24, hy - 0.04, 0.06, 0.06, '#ffffff');
  ell(ctx, hx + 0.25, hy - 0.03 + Math.sin(t * 5) * 0.01, 0.025, 0.025, '#1a1008');
  ctx.strokeStyle = '#c04040';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(hx + 0.24, hy - 0.04);
  ctx.lineTo(hx + 0.22, hy + 0.06);
  ctx.stroke();
  // nariz e baba
  ell(ctx, hx + 0.33, hy + 0.03, 0.03, 0.025, '#2a1a10');
  ctx.strokeStyle = '#4a2a18';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(hx + 0.2, hy + 0.12);
  ctx.lineTo(hx + 0.34, hy + 0.12);
  ctx.stroke();
  ctx.fillStyle = 'rgba(170,230,120,0.8)';
  ctx.beginPath();
  ctx.ellipse(hx + 0.28, hy + 0.18 + ((t * 0.4) % 0.12), 0.018, 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPombo(ctx: CanvasRenderingContext2D, m: MobPose, fl: number): void {
  const t = m.t;
  const C = (h: string, k = 1) => tint(h, k, fl);
  const flap = Math.sin(t * 16);
  const warn = m.fuse > 0 && Math.floor(m.fuse * 12) % 2 === 0;
  const by = -0.55 + Math.sin(t * 5) * 0.03;
  // asa de trás
  ctx.save();
  ctx.translate(-0.05, by - 0.1);
  ctx.rotate(-0.5 - flap * 0.7);
  ell(ctx, -0.18, 0, 0.26, 0.09, C('#8a909c'), 0);
  ctx.restore();
  // cauda
  ctx.fillStyle = C('#6a707c');
  ctx.beginPath();
  ctx.moveTo(-0.28, by);
  ctx.lineTo(-0.5, by - 0.06);
  ctx.lineTo(-0.48, by + 0.1);
  ctx.fill();
  // pés
  capsule(ctx, -0.04, by + 0.2, -0.04, by + 0.3, 0.03, C('#e0707a'));
  capsule(ctx, 0.08, by + 0.2, 0.08, by + 0.3, 0.03, C('#e0707a'));
  // corpo
  ell(ctx, 0, by, 0.3, 0.2, C('#a2a8b4'));
  ell(ctx, 0.06, by + 0.06, 0.2, 0.12, C('#c4c8d2'));
  // dinamites amarradas
  for (let i = 0; i < 3; i++) {
    const dx = -0.1 + i * 0.1;
    ctx.fillStyle = warn ? '#ff8080' : '#d83030';
    ctx.fillRect(dx - 0.03, by + 0.02, 0.06, 0.2);
    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(dx - 0.03, by + 0.09, 0.06, 0.03);
  }
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(-0.16, by + 0.1, 0.34, 0.025);
  // pavio com faísca
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(0, by + 0.02);
  ctx.quadraticCurveTo(0.04, by - 0.14, 0.0, by - 0.2);
  ctx.stroke();
  const sp = (Math.floor(t * 20) % 3) * 0.015;
  ell(ctx, 0.0, by - 0.22, 0.04 + sp, 0.04 + sp, '#ffdd40');
  ell(ctx, 0.0, by - 0.22, 0.02, 0.02, '#ffffff');
  // pescoço iridescente + cabeça
  ell(ctx, 0.24, by - 0.1, 0.13, 0.12, C('#6a4aa8'));
  ell(ctx, 0.25, by - 0.07, 0.09, 0.07, C('#2aa88a'));
  ell(ctx, 0.3, by - 0.2, 0.12, 0.11, C('#9298a6'));
  // bico
  ctx.fillStyle = C('#f0b040');
  ctx.beginPath();
  ctx.moveTo(0.4, by - 0.22);
  ctx.lineTo(0.55, by - 0.18);
  ctx.lineTo(0.4, by - 0.14);
  ctx.fill();
  // olho bravo
  ell(ctx, 0.33, by - 0.23, 0.04, 0.04, '#ffffff');
  ell(ctx, 0.34, by - 0.23, 0.022, 0.022, '#d01010');
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0.28, by - 0.32);
  ctx.lineTo(0.38, by - 0.27);
  ctx.stroke();
  // asa da frente
  ctx.save();
  ctx.translate(0.0, by - 0.1);
  ctx.rotate(-0.3 + flap * 0.8);
  ell(ctx, -0.12, 0, 0.28, 0.1, C('#7e8492'));
  ell(ctx, -0.18, 0.01, 0.2, 0.05, C('#9096a4'));
  ctx.restore();
}
