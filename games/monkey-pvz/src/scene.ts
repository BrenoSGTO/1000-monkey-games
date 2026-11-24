// Cenário (quintal, casa, cerca), aparador de grama-macaco, projéteis, bananas e o macaco dono da casa.
import { LevelDef } from './data';
import { C, OUT, TAU, banana, circ, ell, leaf, limb, outlineText, poly, rrectFill } from './gfx';
import { CELL_H, CELL_W, COLS, Drop, H, LAWN_END, LAWN_X, LAWN_Y, Mower, Proj, ROWS, W, colX, rowY } from './sim';

const BG_SCALE = 2;
const bgCache = new Map<string, HTMLCanvasElement>();

interface Palette {
  skyTop: string;
  skyBot: string;
  g1: string;
  g2: string;
  road: string;
  wall: string;
}

const PAL: Record<LevelDef['bg'], Palette> = {
  dia: { skyTop: '#38bdf8', skyBot: '#bae6fd', g1: '#8bd04a', g2: '#7ec23f', road: '#6fae38', wall: '#fde68a' },
  tarde: { skyTop: '#fb923c', skyBot: '#fde68a', g1: '#9cc243', g2: '#8fb538', road: '#7ea232', wall: '#fcd9a0' },
  noite: { skyTop: '#1e1b4b', skyBot: '#4338ca', g1: '#4f9a3f', g2: '#448b36', road: '#3b7a30', wall: '#c7b985' },
};

function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintBackground(c: C, bg: LevelDef['bg'], lanes: number[]): void {
  const p = PAL[bg];
  const sky = c.createLinearGradient(0, 0, 0, 150);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBot);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  if (bg === 'noite') {
    for (let i = 0; i < 60; i++) {
      circ(c, hash(i, 1) * W, hash(i, 2) * 100, 0.8 + hash(i, 3) * 1.4, 'rgba(255,255,255,.8)', 0);
    }
    circ(c, 930, 40, 20, '#fef9c3', 0);
    circ(c, 922, 34, 18, '#e0e7ff', 0);
  } else {
    circ(c, 930, 40, 26, bg === 'dia' ? '#fde047' : '#fb7185', 0);
    circ(c, 930, 40, 36, bg === 'dia' ? 'rgba(253,224,71,.28)' : 'rgba(251,113,133,.25)', 0);
    for (const [x, y, s] of [
      [250, 30, 1],
      [600, 54, 0.8],
      [800, 22, 0.9],
    ]) {
      ell(c, x, y, 40 * s, 12 * s, 'rgba(255,255,255,.75)', 0);
      ell(c, x + 20 * s, y - 8 * s, 28 * s, 11 * s, 'rgba(255,255,255,.75)', 0);
    }
  }

  // bananeiras ao fundo
  for (const bx of [200, 430, 690, 930]) {
    limb(c, bx, 132, bx + 3, 70, 8, '#a16207');
    for (let i = 0; i < 5; i++) leaf(c, bx + 3, 72, 46, 11, -Math.PI + 0.35 + i * 0.62, i % 2 ? '#4ade80' : '#22c55e');
    banana(c, bx + 6, 86, 9, 0.5);
  }

  // chão atrás da cerca
  c.fillStyle = bg === 'noite' ? '#2f6b2a' : '#5e9c35';
  c.fillRect(0, 118, W, 24);
  // cerca de madeira
  for (let x = 44; x < W; x += 24) {
    c.beginPath();
    c.moveTo(x, 138);
    c.lineTo(x, 92 + hash(x, 5) * 4);
    c.lineTo(x + 10, 86 + hash(x, 5) * 4);
    c.lineTo(x + 20, 92 + hash(x, 5) * 4);
    c.lineTo(x + 20, 138);
    c.closePath();
    c.fillStyle = hash(x, 9) > 0.5 ? '#d1a56a' : '#c19358';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#5b3a17';
    c.stroke();
  }
  c.fillStyle = '#a07040';
  c.fillRect(44, 106, W, 6);
  c.fillRect(44, 124, W, 6);
  c.strokeStyle = '#5b3a17';
  c.lineWidth = 1.6;
  c.strokeRect(44, 106, W, 6);
  c.strokeRect(44, 124, W, 6);

  // gramado
  for (let r = 0; r < ROWS; r++) {
    const active = lanes.includes(r);
    for (let col = 0; col < COLS; col++) {
      const x = LAWN_X + col * CELL_W;
      const y = LAWN_Y + r * CELL_H;
      if (active) {
        c.fillStyle = (r + col) % 2 === 0 ? p.g1 : p.g2;
      } else {
        c.fillStyle = (r + col) % 2 === 0 ? '#a47443' : '#9a6b3c';
      }
      c.fillRect(x, y, CELL_W, CELL_H);
      // tufos / florzinhas / pedrinhas
      for (let k = 0; k < 3; k++) {
        const hx = x + hash(r * 9 + col, k) * CELL_W;
        const hy = y + 8 + hash(r * 9 + col, k + 7) * (CELL_H - 16);
        if (active) {
          c.strokeStyle = 'rgba(20,80,10,.35)';
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(hx, hy);
          c.lineTo(hx - 2, hy - 5);
          c.moveTo(hx, hy);
          c.lineTo(hx + 2, hy - 6);
          c.stroke();
          if (hash(r + col * 3, k + 2) > 0.93) {
            circ(c, hx, hy - 4, 2.2, k % 2 ? '#fef08a' : '#f9a8d4', 0);
          }
        } else if (hash(r + col, k) > 0.5) {
          ell(c, hx, hy, 3, 2, '#6b4423', 0);
        }
      }
    }
    if (!active) {
      c.strokeStyle = 'rgba(60,35,10,.5)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(LAWN_X, LAWN_Y + r * CELL_H + CELL_H / 2);
      c.lineTo(LAWN_END, LAWN_Y + r * CELL_H + CELL_H / 2);
      c.setLineDash([6, 10]);
      c.stroke();
      c.setLineDash([]);
    }
  }

  // chão abaixo do gramado (varanda e canteiro)
  const gy = LAWN_Y + ROWS * CELL_H;
  const gg = c.createLinearGradient(0, gy, 0, H);
  gg.addColorStop(0, p.road);
  gg.addColorStop(1, bg === 'noite' ? '#1f4a1c' : '#3f7a25');
  c.fillStyle = gg;
  c.fillRect(46, gy, W - 46, H - gy);
  for (let i = 0; i < 40; i++) {
    c.strokeStyle = 'rgba(10,60,10,.35)';
    c.lineWidth = 1.6;
    const hx = 60 + hash(i, 21) * (W - 70);
    const hy = gy + 6 + hash(i, 22) * (H - gy - 10);
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx - 2, hy - 6);
    c.moveTo(hx, hy);
    c.lineTo(hx + 2, hy - 7);
    c.stroke();
  }

  // faixa de entrada dos gorilas (direita)
  for (let r = 0; r < ROWS; r++) {
    c.fillStyle = lanes.includes(r) ? p.road : '#8e6538';
    c.fillRect(LAWN_END, LAWN_Y + r * CELL_H, W - LAWN_END, CELL_H);
    c.fillStyle = 'rgba(0,0,0,.08)';
    c.fillRect(LAWN_END, LAWN_Y + r * CELL_H + CELL_H - 3, W - LAWN_END, 3);
  }
  c.strokeStyle = 'rgba(0,0,0,.25)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(LAWN_END, LAWN_Y);
  c.lineTo(LAWN_END, LAWN_Y + ROWS * CELL_H);
  c.stroke();

  // faixa dos aparadores (esquerda) + casa
  for (let r = 0; r < ROWS; r++) {
    c.fillStyle = lanes.includes(r) ? '#c9a875' : '#8e6538';
    c.fillRect(46, LAWN_Y + r * CELL_H, LAWN_X - 46, CELL_H);
    if (lanes.includes(r)) {
      for (let k = 0; k < 3; k++) {
        ell(c, 62 + k * 20, LAWN_Y + r * CELL_H + CELL_H - 12, 7, 3, 'rgba(90,60,20,.3)', 0);
      }
    }
  }
  c.fillStyle = p.wall;
  c.fillRect(0, 92, 46, H - 92);
  c.strokeStyle = '#a16207';
  c.lineWidth = 2;
  for (let y = 100; y < H; y += 16) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(46, y);
    c.stroke();
  }
  c.lineWidth = 4;
  c.strokeStyle = '#78350f';
  c.beginPath();
  c.moveTo(46, 92);
  c.lineTo(46, H);
  c.stroke();
  // telhado
  poly(c, [-6, 96, 52, 96, 52, 78, -6, 60], '#b91c1c', 3);
  // janela e porta
  rrectFill(c, 6, 150, 32, 46, 4, bg === 'noite' ? '#fde68a' : '#7dd3fc', 3);
  c.strokeStyle = '#78350f';
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(22, 150);
  c.lineTo(22, 196);
  c.moveTo(6, 173);
  c.lineTo(38, 173);
  c.stroke();
  rrectFill(c, 6, 250, 34, 70, 4, '#ca8a04', 3);
  circ(c, 33, 288, 2.6, '#fef9c3', 1.4);
  rrectFill(c, 4, 400, 38, 60, 4, bg === 'noite' ? '#fde68a' : '#7dd3fc', 3);
  c.beginPath();
  c.moveTo(23, 400);
  c.lineTo(23, 460);
  c.stroke();
}

export function getBackground(bg: LevelDef['bg'], lanes: number[]): HTMLCanvasElement {
  const key = `${bg}:${lanes.join('')}`;
  let cv = bgCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = W * BG_SCALE;
    cv.height = H * BG_SCALE;
    const c = cv.getContext('2d')!;
    c.scale(BG_SCALE, BG_SCALE);
    paintBackground(c, bg, lanes);
    bgCache.set(key, cv);
  }
  return cv;
}

/** Sobreposição por horário do dia (após desenhar entidades) */
export function drawAmbient(c: C, bg: LevelDef['bg'], t: number): void {
  if (bg === 'noite') {
    c.fillStyle = 'rgba(12,10,60,.28)';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x = ((hash(i, 11) * W + t * (6 + i)) % (W + 40)) - 20;
      const y = LAWN_Y + 20 + hash(i, 12) * ROWS * CELL_H + Math.sin(t * 1.3 + i) * 12;
      circ(c, x, y, 2.2, 'rgba(253,240,138,.9)', 0);
      circ(c, x, y, 7, 'rgba(253,240,138,.18)', 0);
    }
  } else if (bg === 'tarde') {
    c.fillStyle = 'rgba(255,140,40,.1)';
    c.fillRect(0, 0, W, H);
  }
}

export function drawHoverCell(c: C, r: number, col: number, ok: boolean): void {
  c.fillStyle = ok ? 'rgba(255,255,255,.28)' : 'rgba(239,68,68,.3)';
  c.fillRect(LAWN_X + col * CELL_W, LAWN_Y + r * CELL_H, CELL_W, CELL_H);
  c.strokeStyle = ok ? 'rgba(255,255,255,.8)' : 'rgba(239,68,68,.9)';
  c.lineWidth = 2;
  c.strokeRect(LAWN_X + col * CELL_W + 1, LAWN_Y + r * CELL_H + 1, CELL_W - 2, CELL_H - 2);
}

export function drawMower(c: C, m: Mower, t: number): void {
  const y = rowY(m.r) + 30;
  c.save();
  c.translate(m.x, y);
  const run = m.st === 1;
  if (run) c.translate(0, Math.sin(t * 60) * 1.2);
  ell(c, 0, 2, 28, 6, 'rgba(0,0,0,.25)', 0);
  // alça
  limb(c, -18, -28, -32, -48, 4, '#64748b');
  limb(c, -32, -48, -24, -52, 4, '#64748b');
  // corpo
  rrectFill(c, -26, -26, 50, 20, 6, '#dc2626', 2.6);
  rrectFill(c, -26, -14, 50, 5, 2, '#fbbf24', 0);
  rrectFill(c, 2, -34, 18, 10, 4, '#b91c1c', 2.2);
  // rodas
  for (const wx of [-16, 14]) {
    c.save();
    c.translate(wx, -5);
    c.rotate(m.x * 0.12);
    circ(c, 0, 0, 9, '#334155', 2.4);
    c.strokeStyle = '#94a3b8';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-6, 0);
    c.lineTo(6, 0);
    c.moveTo(0, -6);
    c.lineTo(0, 6);
    c.stroke();
    c.restore();
  }
  // macaquinho piloto
  c.save();
  c.translate(-4, -36);
  ell(c, 0, 4, 8, 8, '#f97316', 2);
  circ(c, 0, -8, 9, '#8b5a2b', 2.2);
  ell(c, 1, -6, 6.4, 5.6, '#f2c9a0', 0);
  circ(c, -8, -9, 4, '#8b5a2b', 1.8);
  circ(c, 8, -9, 4, '#8b5a2b', 1.8);
  if (run) {
    // óculos de aviador + berro
    circ(c, -2, -9, 3.6, '#e0f2fe', 1.6);
    circ(c, 5, -9, 3.6, '#e0f2fe', 1.6);
    ell(c, 2, -2, 3, 3.6, '#3a0d0d', 1.4);
    limb(c, 5, 2, -14, -8, 4, '#8b5a2b');
  } else {
    c.strokeStyle = OUT;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-5, -9);
    c.lineTo(-1, -9);
    c.moveTo(3, -9);
    c.lineTo(7, -9);
    c.stroke();
    c.beginPath();
    c.arc(2, -3, 2.4, 0.1, Math.PI - 0.1);
    c.stroke();
    const zz = (t * 0.7) % 1;
    c.globalAlpha = 1 - zz;
    outlineText(c, 'z', 10 + zz * 8, -20 - zz * 14, 10 + zz * 4, '#fff', 'center', 3);
    c.globalAlpha = 1;
    limb(c, 5, 2, -14, -8, 4, '#8b5a2b');
  }
  c.restore();
  c.restore();
}

export function drawProj(c: C, p: Proj, t: number): void {
  if (p.kind === 'melancia') {
    const gy = rowY(p.r) + 36;
    c.save();
    c.globalAlpha = 0.3;
    ell(c, p.x, gy, 14, 4, '#000', 0);
    c.restore();
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    circ(c, 0, 0, 15, '#22c55e');
    c.strokeStyle = '#14532d';
    c.lineWidth = 2.2;
    for (const a of [-0.8, 0, 0.8]) {
      c.beginPath();
      c.ellipse(0, 0, 15 * Math.cos(a) + 0.5, 15, 0, -1.3, 1.3);
      c.stroke();
    }
    c.restore();
    return;
  }
  c.save();
  c.translate(p.x, p.y);
  if (p.kind === 'gelado') {
    for (let i = 1; i < 4; i++) circ(c, -i * 9, Math.sin(t * 20 + i) * 1.2, 3.4 - i * 0.6, 'rgba(186,230,253,.7)', 0);
    circ(c, 0, 0, 7.5, '#bae6fd', 2);
    circ(c, 0, 0, 3.6, '#38bdf8', 0);
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-4, 0);
    c.lineTo(4, 0);
    c.moveTo(0, -4);
    c.lineTo(0, 4);
    c.stroke();
  } else {
    c.rotate(p.rot);
    circ(c, 0, 0, 8, '#8b5a2b', 2.2);
    circ(c, -2.5, -1.5, 1.5, '#2a1608', 0);
    circ(c, 2.5, -1.5, 1.5, '#2a1608', 0);
    circ(c, 0, 3, 1.5, '#2a1608', 0);
  }
  c.restore();
}

export function drawDrop(c: C, d: Drop, t: number): void {
  const fade = d.age > 7 ? (Math.floor(t * 10) % 2 === 0 ? 0.4 : 1) : 1;
  const big = d.kind === 0;
  const bob = d.y >= d.ty ? Math.sin(t * 4 + d.id) * 2 : 0;
  c.save();
  c.globalAlpha = fade;
  c.translate(d.x, d.y + bob);
  const pulse = 1 + Math.sin(t * 6 + d.id) * 0.08;
  c.fillStyle = 'rgba(253,224,71,.28)';
  c.beginPath();
  c.arc(0, 0, (big ? 27 : 20) * pulse, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(253,224,71,.2)';
  c.beginPath();
  c.arc(0, 0, (big ? 20 : 14) * pulse, 0, TAU);
  c.fill();
  banana(c, 0, 0, big ? 22 : 16, Math.sin(t * 3 + d.id) * 0.4 - 0.3);
  c.restore();
}

export type Mood = 'idle' | 'scared' | 'cheer' | 'panic' | 'sad';

export function drawOwner(c: C, x: number, y: number, mood: Mood, t: number, lookAhead: number): void {
  c.save();
  c.translate(x, y);
  const hop = mood === 'cheer' ? Math.abs(Math.sin(t * 9)) * 10 : mood === 'panic' ? Math.sin(t * 30) * 1.4 : Math.sin(t * 2) * 1.2;
  c.translate(0, -hop);
  ell(c, 0, hop + 2, 22, 5, 'rgba(0,0,0,.3)', 0);
  // pernas
  limb(c, -7, -8, -9, 0, 7, '#6b4423');
  limb(c, 7, -8, 9, 0, 7, '#6b4423');
  // corpo (camisa havaiana)
  ell(c, 0, -22, 16, 17, '#f97316', 2.6);
  for (const [fx, fy] of [
    [-6, -26],
    [5, -20],
    [-2, -14],
    [8, -29],
  ]) {
    circ(c, fx, fy, 2.6, '#fef9c3', 0);
    circ(c, fx, fy, 1.1, '#ec4899', 0);
  }
  // braços
  const up = mood === 'cheer' || mood === 'scared' || mood === 'panic';
  const flail = mood === 'panic' ? Math.sin(t * 28) * 0.6 : mood === 'cheer' ? Math.sin(t * 9) * 0.3 : mood === 'scared' ? Math.sin(t * 22) * 0.2 : 0;
  if (up) {
    limb(c, -13, -28, -22 + flail * 8, -46, 6, '#8b5a2b');
    limb(c, 13, -28, 22 - flail * 8, -46, 6, '#8b5a2b');
    if (mood === 'cheer') banana(c, 24, -52, 12, 0.6 + flail);
  } else {
    limb(c, -13, -28, -18, -14, 6, '#8b5a2b');
    limb(c, 13, -28, 12 + Math.sin(t * 4) * 2, -26 + Math.cos(t * 4) * 2, 6, '#8b5a2b');
    banana(c, 12, -30, 11, -0.9 + Math.sin(t * 4) * 0.2);
  }
  // cabeça
  const hy = mood === 'sad' ? -42 : -45;
  c.save();
  c.translate(0, hy);
  circ(c, -15, 0, 7.5, '#8b5a2b', 2.4);
  circ(c, 15, 0, 7.5, '#8b5a2b', 2.4);
  circ(c, -15, 0, 4, '#f9a8d4', 0);
  circ(c, 15, 0, 4, '#f9a8d4', 0);
  circ(c, 0, 0, 16, '#8b5a2b', 2.6);
  ell(c, -5, 2, 7.5, 8.5, '#f2c9a0', 0);
  ell(c, 5, 2, 7.5, 8.5, '#f2c9a0', 0);
  ell(c, 0, 8, 8, 6, '#f2c9a0', 0);
  const wide = mood === 'scared' || mood === 'panic';
  const er = wide ? 4.4 : 3.6;
  const lx = Math.max(-1, Math.min(1, lookAhead)) * 1.4;
  circ(c, -5.2, -1, er, '#fff', 1.6);
  circ(c, 5.2, -1, er, '#fff', 1.6);
  if (mood === 'panic') {
    circ(c, -3.6, -0.6, 1.6, '#111', 0);
    circ(c, 3.6, -0.6, 1.6, '#111', 0);
  } else if (mood === 'cheer') {
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(-5.2, 0, 3, Math.PI, TAU);
    c.arc(5.2, 0, 3, Math.PI, TAU);
    c.stroke();
  } else {
    circ(c, -5.2 + lx, -0.6, 1.8, '#111', 0);
    circ(c, 5.2 + lx, -0.6, 1.8, '#111', 0);
  }
  c.strokeStyle = OUT;
  c.lineWidth = 2;
  c.beginPath();
  if (mood === 'scared' || mood === 'panic') {
    c.ellipse(0, 9, 3.4, 4.2 + Math.sin(t * 24) * 0.8, 0, 0, TAU);
    c.fillStyle = '#5b1f0f';
    c.fill();
    c.stroke();
    circ(c, 15, -12, 2.2, '#7dd3fc', 0);
    circ(c, -16, -14 + ((t * 30) % 6), 2, '#7dd3fc', 0);
  } else if (mood === 'cheer') {
    c.arc(0, 6, 5, 0.1, Math.PI - 0.1);
    c.fillStyle = '#5b1f0f';
    c.fill();
    c.stroke();
  } else if (mood === 'sad') {
    c.arc(0, 12, 4, Math.PI + 0.3, TAU - 0.3);
    c.stroke();
    circ(c, -6, 5 + ((t * 12) % 8), 1.8, '#7dd3fc', 0);
  } else {
    const chew = Math.abs(Math.sin(t * 5)) * 2;
    ell(c, 0, 9, 3.2, 1.2 + chew, '#5b1f0f', 1.4);
  }
  c.restore();
  c.restore();
}
