// Desenho dos Gorilas Zumbis: olhos tortos, braço que cai, acessórios por tipo.
import { ZombieId } from './data';
import { Zombie, rowY, zJy } from './sim';
import { C, OUT, TAU, circ, ell, leaf, limb, poly, rrectFill } from './gfx';

export interface GhostFx {
  rot: number;
  sy: number;
  alpha: number;
  char: number;
  dx: number;
  dy: number;
  dead: boolean;
}

const FUR = '#5f7352';
const FUR_D = '#475a3d';
const FUR_L = '#a3b58f';

interface Shirt {
  c1: string;
  c2: string;
}

const SHIRTS: Record<ZombieId, Shirt> = {
  basico: { c1: '#60a5fa', c2: '#1d4ed8' },
  cone: { c1: '#f472b6', c2: '#be185d' },
  jornal: { c1: '#a3a3a3', c2: '#525252' },
  vara: { c1: '#f87171', c2: '#b91c1c' },
  porta: { c1: '#fbbf24', c2: '#b45309' },
  balde: { c1: '#34d399', c2: '#047857' },
  futebol: { c1: '#ef4444', c2: '#991b1b' },
  gerente: { c1: '#334155', c2: '#0f172a' },
  chefe: { c1: '#7c2d12', c2: '#431407' },
};

function arm(c: C, sx: number, sy: number, ang: number, bend: number, col: string, hand = true): { hx: number; hy: number } {
  const ex = sx + Math.cos(ang) * 17;
  const ey = sy + Math.sin(ang) * 17;
  const hx = ex + Math.cos(ang + bend) * 17;
  const hy = ey + Math.sin(ang + bend) * 17;
  limb(c, sx, sy, ex, ey, 11, col);
  limb(c, ex, ey, hx, hy, 10, col);
  if (hand) {
    circ(c, hx + 2, hy, 6.4, col, 2.2);
    c.strokeStyle = OUT;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(hx + 4, hy - 2);
    c.lineTo(hx + 8, hy - 3);
    c.moveTo(hx + 4, hy + 1);
    c.lineTo(hx + 8, hy + 2);
    c.stroke();
  }
  return { hx, hy };
}

function stump(c: C, sx: number, sy: number): void {
  limb(c, sx, sy, sx + 8, sy + 8, 11, FUR);
  circ(c, sx + 9, sy + 9, 5, '#dc2626', 1.6);
  circ(c, sx + 9, sy + 9, 2.2, '#fef9c3', 0);
}

function headFace(c: C, hx: number, hy: number, t: number, z: Zombie, deadEyes: boolean, angry: boolean): void {
  // crânio e orelha
  circ(c, hx - 10, hy - 2, 5.4, FUR_D, 2);
  circ(c, hx - 10, hy - 2, 2.6, '#c08a7a', 0);
  circ(c, hx, hy, 14.5, FUR);
  // tufo de cabelo
  poly(c, [hx - 6, hy - 12, hx - 3, hy - 22, hx, hy - 13, hx + 3, hy - 21, hx + 6, hy - 12], FUR_D, 1.8);
  // máscara facial + focinho
  ell(c, hx + 5, hy + 3, 11, 10, '#9fb08a', 0);
  ell(c, hx + 10, hy + 7, 8.5, 7, FUR_L, 2);
  circ(c, hx + 16, hy + 3, 1.3, OUT, 0);
  circ(c, hx + 12, hy + 3, 1.3, OUT, 0);
  // boca aberta com dentes
  ell(c, hx + 11, hy + 10.5, 6.6, 3.6, '#3a0d0d', 1.8);
  poly(c, [hx + 6, hy + 8.6, hx + 7.6, hy + 12, hx + 9, hy + 8.6], '#fefce8', 1);
  poly(c, [hx + 11, hy + 8.4, hx + 12.4, hy + 12, hx + 13.6, hy + 8.4], '#fefce8', 1);
  poly(c, [hx + 15, hy + 9, hx + 16.2, hy + 12, hx + 17, hy + 9], '#fefce8', 1);
  ell(c, hx + 11, hy + 12, 3, 1.6, '#f472b6', 0);
  // sobrancelha pesada
  poly(c, [hx + 1, hy - 8, hx + 20, hy - 7 + (angry ? 3 : 0), hx + 19, hy - 3, hx + 1, hy - 3], FUR_D, 1.8);
  // olhos tortos
  const wob = Math.sin(t * 3 + z.phase) * 1.1;
  const wob2 = Math.cos(t * 2.4 + z.phase) * 1.1;
  if (deadEyes) {
    c.strokeStyle = OUT;
    c.lineWidth = 2.2;
    for (const [ex, ey, er] of [
      [hx + 6, hy - 2, 4],
      [hx + 14, hy - 1, 3.2],
    ]) {
      c.beginPath();
      c.moveTo(ex - er, ey - er);
      c.lineTo(ex + er, ey + er);
      c.moveTo(ex + er, ey - er);
      c.lineTo(ex - er, ey + er);
      c.stroke();
    }
    return;
  }
  const scl = angry ? '#fecaca' : '#fef9c3';
  circ(c, hx + 6, hy - 2.5, 5.1, scl, 1.8);
  circ(c, hx + 14, hy - 1, 3.8, scl, 1.8);
  // veias
  c.strokeStyle = 'rgba(220,38,38,.65)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(hx + 2, hy - 3);
  c.lineTo(hx + 5, hy - 2.5);
  c.moveTo(hx + 17, hy);
  c.lineTo(hx + 14.5, hy - 0.8);
  c.stroke();
  // pupilas vesgas (olhando uma pra outra / uma pra cima)
  circ(c, hx + 8 + wob * 0.5, hy - 1.6 + wob2 * 0.4, 2.1, angry ? '#dc2626' : '#7f1d1d', 0);
  circ(c, hx + 12.6 + wob2 * 0.4, hy - 2.6 + wob * 0.4, 1.7, angry ? '#dc2626' : '#7f1d1d', 0);
  circ(c, hx + 8.6 + wob * 0.5, hy - 2.2, 0.7, '#fff', 0);
}

function cone(c: C, hx: number, hy: number, armorR: number): void {
  c.save();
  c.translate(hx - 2, hy - 12);
  c.rotate(armorR < 0.5 ? 0.25 : 0.05);
  ell(c, 0, 0, 15, 3.4, '#ea580c', 2);
  poly(c, [-11, -1, 11, -1, 3, -33, -3, -33], '#f97316', 2.2);
  poly(c, [-8.6, -10, 8.6, -10, 6.8, -16, -6.8, -16], '#fff7ed', 1.2);
  poly(c, [-5.4, -21, 5.4, -21, 4.2, -26, -4.2, -26], '#fff7ed', 1.2);
  if (armorR < 0.5) {
    c.strokeStyle = OUT;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-6, -4);
    c.lineTo(-2, -14);
    c.lineTo(-7, -20);
    c.stroke();
  }
  c.restore();
}

function balde(c: C, hx: number, hy: number, armorR: number, t: number): void {
  c.save();
  c.translate(hx - 2, hy - 11);
  c.rotate(armorR < 0.5 ? -0.2 : 0.04);
  // alça
  c.beginPath();
  c.arc(0, -14, 14, Math.PI, TAU);
  c.lineWidth = 2;
  c.strokeStyle = OUT;
  c.stroke();
  poly(c, [-15, 0, 15, 0, 12, -26, -12, -26], '#7c3aed', 2.4);
  ell(c, 0, -26, 12, 4, '#3b0764', 2);
  ell(c, 1, -26.5, 8, 2.4, '#581c87', 0);
  circ(c, -3, -27, 1.8, '#a855f7', 0);
  // gotas de açaí
  poly(c, [-9, -22, -6, -22, -7.5, -10 + Math.sin(t * 2) * 1], '#4c1d95', 0);
  poly(c, [3, -22, 7, -22, 5, -8], '#4c1d95', 0);
  c.strokeStyle = 'rgba(255,255,255,.22)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-10, -4);
  c.lineTo(-8, -20);
  c.stroke();
  c.restore();
}

function helmet(c: C, hx: number, hy: number): void {
  c.save();
  c.translate(hx, hy - 3);
  c.beginPath();
  c.arc(0, 0, 16.5, Math.PI * 0.95, TAU * 1.01);
  c.lineTo(17, 6);
  c.lineTo(-16, 6);
  c.closePath();
  c.fillStyle = '#dc2626';
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = OUT;
  c.stroke();
  c.fillStyle = '#fef2f2';
  c.fillRect(-2.5, -17, 5, 12);
  // grade do rosto
  c.strokeStyle = '#d4d4d8';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(8, 4);
  c.lineTo(23, 6);
  c.moveTo(8, 9);
  c.lineTo(23, 11);
  c.moveTo(8, 14);
  c.lineTo(22, 15);
  c.moveTo(23, 5);
  c.lineTo(22, 15);
  c.stroke();
  c.restore();
}

function newspaper(c: C, x: number, y: number, armorR: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(-0.12);
  c.beginPath();
  c.moveTo(0, -20);
  c.lineTo(26, -22);
  c.lineTo(27 - (armorR < 0.5 ? 6 : 0), 2);
  if (armorR < 0.5) {
    c.lineTo(22, -6);
    c.lineTo(17, 4);
    c.lineTo(12, -4);
  }
  c.lineTo(1, 4);
  c.closePath();
  c.fillStyle = '#f5efd5';
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
  c.fillStyle = '#1f2937';
  c.fillRect(3, -17, 18, 4);
  c.fillStyle = '#d4c89a';
  c.fillRect(3, -10, 8, 8);
  c.fillStyle = '#9ca3af';
  for (let i = 0; i < 3; i++) c.fillRect(13, -10 + i * 3.2, 10, 1.6);
  c.restore();
}

function door(c: C, x: number, armorR: number): void {
  c.save();
  c.translate(x, 0);
  const top = -78 + (armorR < 0.45 ? 10 : 0);
  c.beginPath();
  c.rect(-1, top, 15, -top);
  c.fillStyle = 'rgba(203,213,225,.55)';
  c.fill();
  c.strokeStyle = 'rgba(71,85,105,.7)';
  c.lineWidth = 1;
  for (let yy = top + 5; yy < 0; yy += 5) {
    c.beginPath();
    c.moveTo(-1, yy);
    c.lineTo(14, yy);
    c.stroke();
  }
  for (let xx = 2; xx < 14; xx += 4) {
    c.beginPath();
    c.moveTo(xx, top);
    c.lineTo(xx, 0);
    c.stroke();
  }
  c.lineWidth = 3;
  c.strokeStyle = '#78350f';
  c.strokeRect(-1, top, 15, -top);
  c.fillStyle = '#fbbf24';
  c.fillRect(11, -36, 3, 3);
  if (armorR < 0.7) {
    c.strokeStyle = OUT;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, top + 14);
    c.lineTo(8, top + 22);
    c.lineTo(3, top + 32);
    c.stroke();
  }
  c.restore();
}

function briefcase(c: C, x: number, y: number): void {
  c.save();
  c.translate(x, y);
  rrectFill(c, -3, -2, 26, 18, 3, '#92400e', 2.2);
  c.beginPath();
  c.arc(10, -2, 5, Math.PI, TAU);
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
  c.fillStyle = '#fbbf24';
  c.fillRect(8, 5, 5, 4);
  c.restore();
}

export function drawZombie(c: C, z: Zombie, t: number, g?: GhostFx): void {
  const big = z.big;
  const gy = rowY(z.r) + (big ? 44 : 34);
  const jy = zJy(z);
  const def = z.type;
  const armorR = z.maxArmor > 0 ? Math.max(0, z.armor / z.maxArmor) : 0;
  const alpha = g ? g.alpha : 1;

  // sombra no chão
  c.save();
  c.translate(z.x + (g ? g.dx : 0), gy);
  c.globalAlpha = 0.28 * alpha;
  ell(c, 0, 1, (big ? 54 : 25) * (1 - jy / 160), big ? 12 : 6.5, '#000', 0);
  c.restore();

  c.save();
  c.translate(z.x + (g ? g.dx : 0), gy - jy - (g ? g.dy : 0));
  if (g) {
    c.rotate(g.rot);
    c.scale(1, g.sy);
    c.globalAlpha = alpha;
  }
  if (big) c.scale(2, 2);
  c.scale(-1, 1); // gorilas olham para a esquerda
  if (z.flash > 0) c.filter = 'brightness(1.8)';

  const eating = z.eat && !g;
  const jumping = z.jumpT > 0;
  const speedy = z.enraged || def === 'vara' || def === 'futebol';
  const w = eating ? t * 9 + z.phase : z.x * (speedy ? 0.075 : 0.115) + z.phase;
  const bob = eating || jumping ? 0 : Math.abs(Math.sin(w)) * 2.2;
  const lean = eating ? 0.16 + Math.sin(t * 11 + z.phase) * 0.05 : jumping ? -0.1 : 0.1;
  const shirt = SHIRTS[def];
  const angry = z.enraged || (def === 'chefe' && z.hp < z.maxHp * 0.5);
  const walkArms = Math.sin(w * 0.5);

  // capa do chefe
  if (def === 'chefe') {
    poly(c, [-4, -62, -34, -8 + Math.sin(t * 3) * 2, -22, 2, 8, -40], '#b91c1c', 2.4);
  }

  // pernas
  const hipX = -3;
  const hipY = -25 - bob * 0.4;
  const legAng = (ph: number): number => (jumping ? (ph === 0 ? 0.9 : 0.25) : Math.sin(w + ph) * 0.58);
  for (const ph of [Math.PI, 0]) {
    const a = legAng(ph);
    const fx = hipX + Math.sin(a) * 21;
    const fy = Math.min(0, hipY + Math.cos(a) * 21);
    limb(c, hipX, hipY, fx, fy - 3, 12, ph === 0 ? FUR : FUR_D);
    ell(c, fx + 5, fy - 1.5, 10, 5, ph === 0 ? FUR_D : '#394a30', 2);
  }

  // braço de trás
  const sx0 = 6 + lean * 20;
  const sy0 = -58 - bob;
  if (def !== 'chefe' && !(def === 'vara' && jumping)) {
    const a = eating ? -0.5 + Math.sin(t * 12 + 2) * 0.35 : -0.12 + walkArms * 0.1 - lean * 0.3;
    arm(c, sx0 - 3, sy0 + 1, a, 0.12, FUR_D);
  } else if (def === 'chefe') {
    const a = -0.5 + Math.sin(t * 2.2 + 1) * 0.6;
    arm(c, sx0 - 3, sy0 + 1, a, 0.2, FUR_D);
  }

  // tronco
  c.save();
  c.translate(0, -bob);
  c.rotate(lean);
  ell(c, 0, -34, 20, 18, FUR, 2.6);
  ell(c, 2, -49, 24, 19, FUR, 2.6);
  ell(c, 8, -45, 13, 13, FUR_L, 0);
  // roupa
  if (def === 'gerente') {
    ell(c, -1, -40, 21, 24, shirt.c1, 2.4);
    poly(c, [8, -58, 17, -50, 12, -22, 2, -22], '#f8fafc', 1.6);
    poly(c, [11, -52, 15, -50, 14, -30 + Math.sin(t * 5) * 2, 11, -28], '#dc2626', 1.6);
  } else if (def === 'chefe') {
    ell(c, 2, -49, 24, 19, FUR, 0);
    c.strokeStyle = '#7f1d1d';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(6, -58);
    c.lineTo(14, -44);
    c.moveTo(9, -58);
    c.lineTo(17, -46);
    c.stroke();
    poly(c, [-14, -30, 18, -30, 14, -18, 8, -22, 2, -16, -6, -22, -12, -16], '#92400e', 2.2);
  } else {
    ell(c, -1, -34, 19.5, 17, shirt.c1, 2.4);
    ell(c, -3, -42, 15, 9, shirt.c1, 0);
    // barra rasgada
    poly(c, [-19, -24, -14, -17, -9, -24, -4, -16, 2, -24, 8, -17, 14, -24], shirt.c2, 0);
    c.strokeStyle = shirt.c2;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-12, -48);
    c.lineTo(-4, -36);
    c.stroke();
    if (def === 'futebol') {
      c.save();
      c.scale(-1, 1);
      c.font = '900 17px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#fef2f2';
      c.strokeStyle = '#7f1d1d';
      c.lineWidth = 3;
      c.strokeText('9', 3, -30);
      c.fillText('9', 3, -30);
      c.restore();
    }
  }
  c.restore();

  // perna da frente por cima da barra
  const frontA = legAng(0);
  limb(c, hipX + 1, hipY, hipX + 1 + Math.sin(frontA) * 21, Math.min(0, hipY + Math.cos(frontA) * 21) - 3, 12, FUR);

  // cabeça
  const hx = 11 + lean * 26;
  const hy = -72 - bob + (eating ? Math.sin(t * 11 + z.phase) * 2.5 : 0);
  headFace(c, hx, hy, t, z, !!g && g.dead, angry);

  // chapéus
  if (def === 'cone' && z.armor > 0) cone(c, hx, hy, armorR);
  if (def === 'balde' && z.armor > 0) balde(c, hx, hy, armorR, t);
  if (def === 'futebol' && z.armor > 0) helmet(c, hx, hy);
  if (def === 'vara') {
    c.fillStyle = '#dc2626';
    c.fillRect(hx - 12, hy - 9, 26, 4.5);
    poly(c, [hx - 12, hy - 8, hx - 20, hy - 3 + Math.sin(t * 8) * 2, hx - 12, hy - 5], '#dc2626', 1.6);
  }
  if (def === 'gerente') {
    poly(c, [hx - 8, hy - 11, hx + 12, hy - 14, hx + 14, hy - 7, hx - 6, hy - 6], '#1f2937', 1.6);
    c.strokeStyle = '#f8fafc';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(hx + 6, hy - 2.5, 6.4, 0, TAU);
    c.arc(hx + 14.4, hy - 1, 5, 0, TAU);
    c.stroke();
  }
  if (def === 'chefe') {
    poly(c, [hx - 10, hy - 11, hx - 12, hy - 28, hx - 5, hy - 20, hx, hy - 31, hx + 5, hy - 20, hx + 12, hy - 28, hx + 10, hy - 11], '#facc15', 2.2);
    circ(c, hx, hy - 17, 2.5, '#ef4444', 1.2);
  }
  if (angry && def === 'jornal') {
    for (let i = 0; i < 3; i++) {
      const yy = hy - 18 - ((t * 24 + i * 9) % 18);
      circ(c, hx - 4 + i * 6 + Math.sin(t * 6 + i) * 2, yy, 2.4, 'rgba(255,255,255,.7)', 0);
    }
  }

  // braço da frente, com itens
  let hand = { hx: 0, hy: 0 };
  if (!z.armLost || def === 'chefe') {
    if (def === 'chefe') {
      const a = eating ? -0.4 + Math.sin(t * 5) * 0.5 : -1.0 + Math.sin(t * 2.2) * 0.9; // soca o peito
      hand = arm(c, sx0 + 4, sy0 + 2, a, 0.5, FUR, true);
    } else if (def === 'vara' && jumping) {
      hand = arm(c, sx0 + 4, sy0 + 2, 0.5, 0.3, FUR);
    } else {
      const a = eating ? -0.4 + Math.sin(t * 12) * 0.4 : -0.04 + walkArms * 0.1 - lean * 0.3;
      hand = arm(c, sx0 + 4, sy0 + 2, a, 0.1, FUR);
    }
  } else {
    stump(c, sx0 + 4, sy0 + 2);
    hand = { hx: sx0 + 14, hy: sy0 + 10 };
  }

  // objetos nas mãos
  if (def === 'jornal' && z.armor > 0) newspaper(c, hand.hx + 6, hand.hy - 8, armorR);
  if (def === 'porta' && z.armor > 0) door(c, hand.hx + 4, armorR);
  if (def === 'gerente' && z.armor > 0) briefcase(c, hand.hx - 4, hand.hy - 2);
  if (def === 'vara' && !z.jumped) {
    if (jumping) {
      limb(c, hand.hx, hand.hy, hand.hx + 6, jy, 4.6, '#a3a34a');
    } else {
      limb(c, hand.hx - 36, hand.hy + 10, hand.hx + 36, hand.hy - 20, 4.6, '#a3a34a');
      c.fillStyle = '#4d7c0f';
      for (const k of [-0.2, 0.3, 0.8]) c.fillRect(hand.hx + k * 60 - 2, hand.hy - 4 - k * 28, 3, 3);
    }
  }

  // gelado
  if (z.slow > 0 && !g) {
    c.fillStyle = 'rgba(125,211,252,.28)';
    c.beginPath();
    c.ellipse(2, -42, 27, 46, 0, 0, TAU);
    c.fill();
    poly(c, [hx - 4, hy - 16, hx - 1, hy - 26, hx + 2, hy - 16], 'rgba(224,242,254,.9)', 1.2);
    poly(c, [sx0 - 4, sy0 - 6, sx0 - 1, sy0 - 15, sx0 + 3, sy0 - 6], 'rgba(224,242,254,.9)', 1.2);
  }
  // queimado
  if (g && g.char > 0) {
    c.fillStyle = `rgba(10,6,4,${0.7 * g.char})`;
    c.beginPath();
    c.ellipse(2, -42, 26, 46, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  c.filter = 'none';
}

/** Cabeça separada (voa quando o gorila cai) */
export function drawHeadOnly(c: C, x: number, y: number, rot: number, t: number, z: Zombie): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(-1, 1);
  headFace(c, 0, 0, t, z, true, false);
  c.restore();
}

export function drawArmOnly(c: C, x: number, y: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  limb(c, -12, 0, 12, 0, 10, FUR);
  circ(c, 15, 0, 6.2, FUR, 2.2);
  circ(c, -13, 0, 4.4, '#dc2626', 1.4);
  c.restore();
}

export function drawArmorPiece(c: C, kind: string, x: number, y: number, rot: number, t: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  switch (kind) {
    case 'cone':
      poly(c, [-11, 8, 11, 8, 3, -22, -3, -22], '#f97316', 2.2);
      poly(c, [-8, 0, 8, 0, 6, -6, -6, -6], '#fff7ed', 1.2);
      break;
    case 'balde':
      poly(c, [-15, 10, 15, 10, 12, -14, -12, -14], '#7c3aed', 2.4);
      ell(c, 0, -14, 12, 4, '#3b0764', 2);
      break;
    case 'porta':
      c.fillStyle = 'rgba(203,213,225,.6)';
      c.fillRect(-8, -26, 16, 52);
      c.strokeStyle = '#78350f';
      c.lineWidth = 3;
      c.strokeRect(-8, -26, 16, 52);
      break;
    case 'jornal':
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate(i * 1.1 + Math.sin(t * 6 + i) * 0.3);
        c.fillStyle = '#f5efd5';
        c.fillRect(-8, -6, 16, 12);
        c.strokeStyle = OUT;
        c.lineWidth = 1.6;
        c.strokeRect(-8, -6, 16, 12);
        c.restore();
      }
      break;
    case 'futebol':
      c.beginPath();
      c.arc(0, 0, 15, Math.PI, TAU);
      c.closePath();
      c.fillStyle = '#dc2626';
      c.fill();
      c.lineWidth = 2.4;
      c.strokeStyle = OUT;
      c.stroke();
      break;
    case 'gerente':
      rrectFill(c, -13, -9, 26, 18, 3, '#92400e', 2.2);
      c.fillStyle = '#fbbf24';
      c.fillRect(-2, -1, 5, 4);
      break;
    default:
      leaf(c, 0, 0, 12, 4, 0, '#4ade80');
  }
  c.restore();
}
