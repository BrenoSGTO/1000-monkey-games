// Desenho das plantas: carinhas que balançam no ritmo da música.
import { PLANTS, PlantId } from './data';
import { JACA_DUR, Plant } from './sim';
import { C, OUT, TAU, banana, circ, eyeBall, ell, leaf, limb, mix, poly, rrectFill } from './gfx';

interface FaceOpt {
  mood?: number; // 0 feliz, 1 preocupado, 2 bravo
  look?: number;
  mouth?: boolean;
}

function face(c: C, x: number, y: number, s: number, t: number, ph: number, o: FaceOpt = {}): void {
  const mood = o.mood ?? 0;
  const look = o.look ?? 1;
  const blink = (t * 0.7 + ph) % 3.7 > 3.55;
  for (const sx of [-1, 1]) {
    const ex = x + sx * 6.4 * s;
    eyeBall(c, ex, y, 4.7 * s, look * 1.5 * s, 0.6 * s, blink);
    if (mood === 2) {
      c.beginPath();
      c.moveTo(ex - sx * 5 * s, y - 7.5 * s);
      c.lineTo(ex + sx * 4 * s, y - 4 * s);
      c.lineWidth = 2.4;
      c.strokeStyle = OUT;
      c.stroke();
    }
  }
  circ(c, x - 11.5 * s, y + 5 * s, 2.6 * s, 'rgba(244,114,182,.5)', 0);
  circ(c, x + 11.5 * s, y + 5 * s, 2.6 * s, 'rgba(244,114,182,.5)', 0);
  if (o.mouth === false) return;
  c.beginPath();
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  if (mood === 0) {
    c.arc(x + look * 1.2 * s, y + 5.5 * s, 4.6 * s, 0.12 * Math.PI, 0.88 * Math.PI);
    c.stroke();
  } else if (mood === 1) {
    c.ellipse(x, y + 9 * s, 2.8 * s, 3.3 * s, 0, 0, TAU);
    c.fillStyle = '#5b1f0f';
    c.fill();
    c.stroke();
  } else {
    c.moveTo(x - 5 * s, y + 9 * s);
    c.lineTo(x + 5 * s, y + 9 * s);
    c.stroke();
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(x + i * 3 * s, y + 7.5 * s);
      c.lineTo(x + i * 3 * s, y + 10.5 * s);
      c.lineWidth = 1.2;
      c.stroke();
    }
  }
}

function cocoHead(c: C, hx: number, hy: number, s: number, col: string, k: number, t: number, ph: number, mood: number, snoutCol = '#6b3f1d', snoutHole = '#1c0f05'): void {
  circ(c, hx, hy, 19 * s, col);
  c.lineWidth = 1.4;
  c.strokeStyle = 'rgba(40,20,5,.45)';
  for (let i = 0; i < 7; i++) {
    const a = 2.5 + i * 0.5;
    c.beginPath();
    c.moveTo(hx + Math.cos(a) * 10 * s, hy + Math.sin(a) * 10 * s);
    c.lineTo(hx + Math.cos(a) * 18 * s, hy + Math.sin(a) * 18 * s);
    c.stroke();
  }
  ell(c, hx - 6 * s, hy - 9 * s, 6 * s, 3.4 * s, 'rgba(255,255,255,.28)', 0, -0.6);
  face(c, hx - 1 * s, hy - 3 * s, 0.95 * s, t, ph, { mood, mouth: false });
  ell(c, hx + 18 * s - k * 3, hy + 5 * s, 8 * s - k * 2, 7 * s + k, snoutCol);
  ell(c, hx + 22 * s - k * 3, hy + 5 * s, 3 * s, 4 * s, snoutHole, 0);
}

export function drawPlant(c: C, p: Plant, t: number, beat: number, alpha = 1): void {
  const ph = p.id * 0.9;
  const hpR = p.hp / p.maxHp;
  const mood = hpR < 0.4 ? 1 : 0;
  c.save();
  c.translate(p.x, p.y);
  if (alpha < 1) c.globalAlpha = alpha;
  ell(c, 0, 1, 24, 6.5, 'rgba(0,0,0,.25)', 0);
  const sw = Math.sin((beat * 0.5 + ph * 0.07) * TAU);
  const sq = 1 + 0.03 * Math.sin(beat * TAU + ph);
  if (p.flash > 0) c.filter = 'brightness(1.7)';
  if (hpR < 0.4) c.translate(Math.sin(t * 32) * 0.9, 0);
  switch (p.type) {
    case 'bananeira':
      c.rotate(sw * 0.045);
      c.scale(1 / sq, sq);
      bananeira(c, p, t, sw, ph, mood);
      break;
    case 'coco':
      c.rotate(sw * 0.04);
      c.scale(1 / sq, sq);
      coco(c, p, t, sw, ph, mood, false);
      break;
    case 'coqueiro':
      c.rotate(sw * 0.04);
      c.scale(1 / sq, sq);
      coco(c, p, t, sw, ph, mood, true);
      break;
    case 'maracuja':
      c.rotate(sw * 0.04);
      c.scale(1 / sq, sq);
      maracuja(c, p, t, sw, ph, mood);
      break;
    case 'cacto':
      c.rotate(sw * 0.03);
      c.scale(1 / sq, sq);
      cacto(c, p, t, sw, ph, mood);
      break;
    case 'mandioca':
      c.scale(1 / sq, sq);
      mandioca(c, p, t, sw, ph);
      break;
    case 'abacaxi':
      abacaxi(c, p, t, sw, ph);
      break;
    case 'pimenta':
      pimenta(c, p, t, sw, ph);
      break;
    case 'jaca':
      jaca(c, p, t, sw, ph, mood);
      break;
    case 'melancia':
      c.scale(1 / sq, sq);
      melancia(c, p, t, sw, ph, mood);
      break;
  }
  c.restore();
}

/** Ícone para a bandeja/esteira: planta centralizada, pés em (x, y). */
export function drawPlantIcon(c: C, type: PlantId, x: number, y: number, scale: number, t: number, beat: number): void {
  const def = PLANTS[type];
  const fake: Plant = {
    id: 3,
    type,
    r: 0,
    c: 0,
    x: 0,
    y: 0,
    hp: def.hp,
    maxHp: def.hp,
    age: 0,
    cd: 99,
    st: type === 'abacaxi' ? 1 : 0,
    owner: 0,
    flash: 0,
    fireT: 0,
    hugT: 0,
    actT: 0,
    target: 0,
  };
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  drawPlant(c, fake, t, beat);
  c.restore();
}

function bananeira(c: C, p: Plant, t: number, sw: number, ph: number, mood: number): void {
  leaf(c, -3, -5, 36, 11, -2.75 + sw * 0.06, '#4ade80');
  leaf(c, 3, -5, 36, 11, -0.4 - sw * 0.06, '#22c55e');
  limb(c, 0, 0, sw * 2.5, -34, 9, '#84cc16');
  const hx = sw * 3;
  const hy = -52;
  const glow = p.cd < 1.6 ? (1.6 - p.cd) / 1.6 : 0;
  if (glow > 0) {
    circ(c, hx, hy, 38 + Math.sin(t * 14) * 2, `rgba(254,240,138,${0.38 * glow})`, 0);
  }
  const shake = glow > 0 ? Math.sin(t * 40) * glow * 1.6 : 0;
  c.save();
  c.translate(shake, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + t * 0.35;
    ell(c, hx + Math.cos(a) * 17.5, hy + Math.sin(a) * 17.5, 11, 6, i % 2 ? '#facc15' : '#fde047', 2, a);
    circ(c, hx + Math.cos(a) * 25, hy + Math.sin(a) * 25, 1.6, '#92400e', 0);
  }
  circ(c, hx, hy, 15.5, '#fef3a6');
  face(c, hx, hy - 1, 1.02, t, ph, { mood });
  c.restore();
  banana(c, hx + 17, hy + 20, 11, 0.4 + sw * 0.1);
}

function coco(c: C, p: Plant, t: number, sw: number, ph: number, mood: number, duplo: boolean): void {
  leaf(c, -3, -4, 32, 10, -2.7 + sw * 0.05, '#4ade80');
  leaf(c, 3, -4, 32, 10, -0.45 - sw * 0.05, '#22c55e');
  limb(c, 0, 0, 0, -26, 8, '#65a30d');
  const k = Math.min(1, p.fireT / 0.25);
  const hx = 2 - k * 5 + sw * 2;
  const hy = -46;
  if (duplo) {
    leaf(c, hx - 12, hy - 28, 22, 7, -2.1, '#4ade80');
    cocoHead(c, hx - 9, hy - 14, 0.86, '#734321', p.st === 1 ? 1 : 0, t, ph + 1, mood);
    leaf(c, hx - 2, hy - 32, 24, 7, -1.3, '#22c55e');
  }
  leaf(c, hx - 3, hy - 16, 28, 8, -2.2, '#4ade80');
  leaf(c, hx, hy - 17, 28, 8, -1.2, '#22c55e');
  cocoHead(c, hx, hy, 1, '#8b5a2b', k, t, ph, mood);
  if (duplo) {
    ell(c, hx, hy - 12, 18, 4.2, '#dc2626', 1.8);
    poly(c, [hx - 16, hy - 12, hx - 25, hy - 18, hx - 22, hy - 8], '#dc2626', 1.6);
  }
}

function maracuja(c: C, p: Plant, t: number, sw: number, ph: number, mood: number): void {
  leaf(c, -3, -4, 30, 10, -2.7 + sw * 0.05, '#34d399');
  leaf(c, 3, -4, 30, 10, -0.45 - sw * 0.05, '#10b981');
  limb(c, 0, 0, 0, -26, 8, '#22c55e');
  ell(c, 0, -27, 11, 4.4, '#38bdf8', 2); // cachecol
  const k = Math.min(1, p.fireT / 0.25);
  const hx = 2 - k * 5 + sw * 2;
  const hy = -48;
  circ(c, hx, hy, 19.5, '#7e22ce');
  c.strokeStyle = 'rgba(216,180,254,.6)';
  c.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(hx - 4 + i * 4, hy + 4, 11 - i, 3.6, 5.4);
    c.stroke();
  }
  ell(c, hx - 7, hy - 8, 6, 3.4, 'rgba(255,255,255,.3)', 0, -0.6);
  poly(c, [hx - 17, hy - 7, hx - 12, hy - 17, hx - 7, hy - 10, hx - 1, hy - 21, hx + 5, hy - 11, hx + 10, hy - 18, hx + 16, hy - 7, hx, hy - 12], '#e0f2fe', 2);
  face(c, hx - 1, hy - 2, 0.95, t, ph, { mood, mouth: false });
  ell(c, hx + 18 - k * 3, hy + 5, 8 - k * 2, 7 + k, '#7dd3fc');
  ell(c, hx + 22 - k * 3, hy + 5, 3, 4, '#0c4a6e', 0);
  c.strokeStyle = '#bae6fd';
  c.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    const a = t * 1.2 + (i * TAU) / 3;
    const fx = hx + Math.cos(a) * 28;
    const fy = hy - 4 + Math.sin(a) * 18;
    c.beginPath();
    c.moveTo(fx - 3, fy);
    c.lineTo(fx + 3, fy);
    c.moveTo(fx, fy - 3);
    c.lineTo(fx, fy + 3);
    c.stroke();
  }
}

function cacto(c: C, p: Plant, t: number, sw: number, ph: number, mood: number): void {
  const f = p.hugT > 0 ? Math.sin(Math.PI * (1 - p.hugT / 0.35)) : 0;
  const col = '#4ade80';
  // braço de trás
  const bx = -16 + f * 6;
  const bhx = -24 + f * 62;
  const bhy = -56 + f * 12;
  limb(c, bx, -34, -26 + f * 40, -34, 10, '#22c55e');
  limb(c, -26 + f * 40, -34, bhx, bhy, 10, '#22c55e');
  // corpo
  rrectFill(c, -17, -70, 34, 70, 16, col);
  c.strokeStyle = 'rgba(21,128,61,.6)';
  c.lineWidth = 2;
  for (const dx of [-7, 0, 7]) {
    c.beginPath();
    c.moveTo(dx, -64);
    c.lineTo(dx, -6);
    c.stroke();
  }
  // espinhos
  c.strokeStyle = '#fefce8';
  c.lineWidth = 1.8;
  for (let i = 0; i < 7; i++) {
    const y = -62 + i * 9;
    c.beginPath();
    c.moveTo(-17, y);
    c.lineTo(-21, y - 2);
    c.moveTo(17, y + 4);
    c.lineTo(21, y + 2);
    c.stroke();
  }
  // braço da frente
  limb(c, 16, -34, 26 + f * 18, -34, 10, col);
  limb(c, 26 + f * 18, -34, 24 + f * 42, -56 + f * 18, 10, col);
  circ(c, 24 + f * 42, -56 + f * 18, 6.2, '#86efac');
  // flor
  const fx = 2 + sw * 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    circ(c, fx + Math.cos(a) * 6, -76 + Math.sin(a) * 6, 4.4, '#f472b6', 1.6);
  }
  circ(c, fx, -76, 3.6, '#fde047', 1.6);
  face(c, 0, -43, 1.08, t, ph, { mood });
}

function mandioca(c: C, p: Plant, t: number, sw: number, ph: number): void {
  const stage = p.hp > 2700 ? 0 : p.hp > 1350 ? 1 : 2;
  c.save();
  c.translate(0, -37);
  c.rotate(0.08 + sw * 0.035);
  leaf(c, -2, -32, 24, 7, -2.2, '#4ade80');
  leaf(c, 0, -33, 26, 8, -1.55, '#22c55e');
  leaf(c, 2, -32, 24, 7, -0.9, '#4ade80');
  limb(c, 0, -30, 0, -38, 5, '#a16207');
  ell(c, 0, 0, 22, 37, stage === 2 ? '#b08850' : '#c9a46a');
  c.strokeStyle = 'rgba(120,80,30,.5)';
  c.lineWidth = 1.6;
  for (let i = -2; i <= 2; i++) {
    c.beginPath();
    c.ellipse(0, i * 13, 21, 3.2, 0, 0.2, Math.PI - 0.2);
    c.stroke();
  }
  ell(c, -9, -14, 5, 11, 'rgba(255,255,255,.22)', 0, 0.2);
  if (stage >= 1) {
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-14, -28);
    c.lineTo(-6, -16);
    c.lineTo(-12, -8);
    c.lineTo(-3, 2);
    c.stroke();
  }
  if (stage >= 2) {
    c.beginPath();
    c.moveTo(12, -22);
    c.lineTo(5, -10);
    c.lineTo(14, 2);
    c.lineTo(6, 14);
    c.stroke();
    ell(c, 12, 14, 5, 3, '#8b5e34', 0);
  }
  face(c, 0, -5, 1.3, t, ph, { mood: stage === 0 ? 0 : 1 });
  if (stage >= 1) circ(c, 15, -22 + Math.sin(t * 6) * 2, 2.2, '#7dd3fc', 0);
  c.restore();
}

function abacaxi(c: C, p: Plant, t: number, sw: number, ph: number): void {
  ell(c, 0, -4, 25, 9, '#7c4a21');
  ell(c, 0, -8, 17, 6, '#a16a37', 0);
  if (p.st === 0) {
    const grow = Math.min(1, p.age / 12);
    c.save();
    c.translate(0, 0);
    for (let i = 0; i < 5; i++) leaf(c, (i - 2) * 3.6, -9, 12 + grow * 6, 3.6, -Math.PI / 2 + (i - 2) * 0.32, '#4ade80');
    c.restore();
    return;
  }
  c.save();
  c.rotate(sw * 0.03);
  for (let i = 0; i < 7; i++) leaf(c, (i - 3) * 2.4, -42, 24 + (i % 2) * 5, 4.4, -Math.PI / 2 + (i - 3) * 0.3, i % 2 ? '#22c55e' : '#4ade80');
  ell(c, 0, -24, 16, 21, '#f59e0b');
  c.save();
  c.beginPath();
  c.ellipse(0, -24, 15.5, 20.5, 0, 0, TAU);
  c.clip();
  c.strokeStyle = 'rgba(146,64,14,.7)';
  c.lineWidth = 1.4;
  for (let i = -5; i <= 5; i++) {
    c.beginPath();
    c.moveTo(i * 7 - 20, -46);
    c.lineTo(i * 7 + 20, -2);
    c.moveTo(i * 7 + 20, -46);
    c.lineTo(i * 7 - 20, -2);
    c.stroke();
  }
  c.restore();
  face(c, 0, -26, 0.95, t, ph, { mood: 2 });
  const on = Math.floor(t * 4) % 2 === 0;
  circ(c, 0, -52, 3.2, on ? '#ef4444' : '#7f1d1d', 1.4);
  c.restore();
}

function pimenta(c: C, p: Plant, t: number, sw: number, ph: number): void {
  const fuse = p.cd < 1.15 ? Math.max(0, 1 - p.cd / 1.15) : 0;
  c.save();
  const s = 1 + fuse * 0.38;
  c.translate(Math.sin(t * 55) * fuse * 2.4, 0);
  c.scale(s, s);
  c.rotate(sw * 0.04);
  const col = mix('#ef4444', '#fde047', fuse * fuse);
  c.beginPath();
  c.moveTo(-17, -50);
  c.bezierCurveTo(-26, -30, -14, -6, 10, -2);
  c.bezierCurveTo(6, -14, 20, -26, 19, -46);
  c.bezierCurveTo(18, -62, -10, -66, -17, -50);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 2.6;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.stroke();
  ell(c, -9, -44, 3.6, 9, 'rgba(255,255,255,.35)', 0, 0.2);
  limb(c, -3, -58, -8, -68, 4.5, '#65a30d');
  leaf(c, -6, -60, 18, 6, -2.4, '#16a34a');
  leaf(c, -2, -60, 18, 6, -0.8, '#22c55e');
  face(c, 1, -36, 1.12, t, ph, { mood: 2 });
  if (fuse > 0.35) {
    for (let i = 0; i < 4; i++) {
      const fx = -8 + Math.sin(t * 20 + i * 2) * 6;
      const fy = -72 - ((t * 60 + i * 11) % 18);
      circ(c, fx, fy, 3.6 - (i % 2), i % 2 ? '#fb923c' : '#fde047', 0);
    }
  }
  c.restore();
}

function jaca(c: C, p: Plant, t: number, sw: number, ph: number, mood: number): void {
  let dx = 0;
  let dy = 0;
  let rot = 0;
  let sy = 1;
  if (p.st === 1) {
    const u = Math.max(0, Math.min(1, 1 - p.actT / JACA_DUR));
    dx = (p.target - p.x) * u;
    dy = -Math.sin(Math.PI * u) * 100;
    rot = u * 0.5 - 0.15 + Math.sin(u * 14) * 0.08;
    sy = u < 0.12 ? 0.82 : 1.1 - u * 0.1;
  }
  c.translate(dx, dy);
  c.rotate(rot + sw * 0.03);
  c.scale(1 / sy, sy);
  ell(c, -9, -2, 8, 4.4, '#7c8d28', 2);
  ell(c, 9, -2, 8, 4.4, '#7c8d28', 2);
  ell(c, 0, -30, 25, 28, '#a3b83a');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = Math.cos(a) * 24;
    const y = -30 + Math.sin(a) * 27;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    poly(c, [x - ny * 4, y + nx * 4, x + nx * 6, y + ny * 6, x + ny * 4, y - nx * 4], '#7c8d28', 1.6);
  }
  ell(c, -9, -42, 6, 9, 'rgba(255,255,255,.22)', 0, 0.4);
  face(c, 0, -30, 1.2, t, ph, { mood: p.st === 1 ? 2 : mood === 1 ? 1 : 2 });
  // folhinha
  limb(c, 0, -57, 2, -64, 4, '#65a30d');
  leaf(c, 2, -64, 14, 5, -0.9, '#22c55e');
}

function melancia(c: C, p: Plant, t: number, sw: number, ph: number, mood: number): void {
  // base de madeira e vinhas
  c.beginPath();
  c.moveTo(-26, 0);
  c.lineTo(26, 0);
  c.lineTo(18, -16);
  c.lineTo(-18, -16);
  c.closePath();
  c.fillStyle = '#a16207';
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = OUT;
  c.stroke();
  c.strokeStyle = 'rgba(60,30,5,.5)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-8, -1);
  c.lineTo(-6, -15);
  c.moveTo(8, -1);
  c.lineTo(6, -15);
  c.stroke();
  circ(c, -18, 2, 7, '#78716c', 2);
  circ(c, 18, 2, 7, '#78716c', 2);
  // braço da catapulta
  const k = Math.min(1, p.fireT / 0.25);
  const ang = -0.95 + (1 - Math.abs(1 - k * 2)) * 1.5 * (k > 0 ? 1 : 0);
  c.save();
  c.translate(0, -18);
  c.rotate(ang);
  limb(c, -26, 0, 34, 0, 6, '#92400e');
  c.restore();
  // melancia com carinha (carregada)
  const loaded = k <= 0 || k > 0.7;
  const mxc = Math.cos(ang) * 34;
  const myc = -18 + Math.sin(ang) * 34;
  if (loaded) {
    c.save();
    c.translate(mxc - 2, myc - 14);
    circ(c, 0, 0, 17, '#22c55e');
    c.strokeStyle = '#14532d';
    c.lineWidth = 2.4;
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      c.beginPath();
      c.ellipse(0, 0, 17 * Math.cos(a) * 0.9 + 1, 17, 0, -1.2, 1.2);
      c.stroke();
    }
    ell(c, -6, -8, 5, 3, 'rgba(255,255,255,.3)', 0, -0.5);
    face(c, 1, -1, 0.9, t, ph, { mood });
    c.restore();
  }
  // folhas decorativas
  leaf(c, -20, -14, 18, 6, -2.5, '#4ade80');
  leaf(c, 20, -14, 18, 6, -0.6, '#22c55e');
}
