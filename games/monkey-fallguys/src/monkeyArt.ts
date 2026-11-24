import { FUR_COLORS, SUIT_COLORS, TEAM_COLORS } from './match';
import type { Monkey } from './types';
import { angDiff, clamp } from './util';

export interface Vis {
  rx: number;
  ry: number;
  sy: number;
  sv: number;
  lean: number;
  lv: number;
  ang: number;
  run: number;
  blinkT: number;
  blink: number;
  eye: number;
  tailA: number;
  tailV: number;
  hatY: number;
  hatV: number;
  pg: boolean;
  pvy: number;
  init: boolean;
  happy: number;
}

export function newVis(): Vis {
  return {
    rx: 0,
    ry: 0,
    sy: 1,
    sv: 0,
    lean: 0,
    lv: 0,
    ang: 0,
    run: 0,
    blinkT: 1 + Math.random() * 3,
    blink: 0,
    eye: Math.random() * 6,
    tailA: 0,
    tailV: 0,
    hatY: 0,
    hatV: 0,
    pg: false,
    pvy: 0,
    init: false,
    happy: 0,
  };
}

export function updateVis(v: Vis, m: Monkey, dt: number, smooth: boolean): void {
  if (!v.init || !smooth || Math.hypot(m.x - v.rx, m.y - v.ry) > 260) {
    v.rx = m.x;
    v.ry = m.y;
    v.init = true;
  } else {
    const k = Math.min(1, dt * 15);
    v.rx += (m.x + m.vx * 0.04 - v.rx) * k;
    v.ry += (m.y + m.vy * 0.03 - v.ry) * k;
  }
  // landing / jump squash & stretch
  if (m.grounded && !v.pg) {
    v.sy = 1 - clamp(v.pvy / 2400, 0.04, 0.34);
    v.sv = 0;
  } else if (!m.grounded && v.pg && m.vy < -250) {
    v.sv += 6.5;
  }
  v.pg = m.grounded;
  if (!m.grounded) v.pvy = m.vy;
  v.sv += ((1 - v.sy) * 300 - v.sv * 13) * dt;
  v.sy = clamp(v.sy + v.sv * dt, 0.6, 1.4);

  const leanT = clamp(m.vx / 1000, -0.3, 0.3) * (m.grounded ? 1 : 0.7);
  v.lv += ((leanT - v.lean) * 150 - v.lv * 10) * dt;
  v.lean += v.lv * dt;

  const spd = Math.abs(m.vx);
  v.run += dt * (m.grounded ? spd * 0.04 : 5);

  const tumbling = m.flopT > 0 && m.flopK === 1;
  const lying = (m.flopT > 0 && m.flopK === 0) || m.diveT > 0;
  if (tumbling) {
    v.ang += (m.vx >= 0 ? 1 : -1) * (8 + spd / 90) * dt;
  } else {
    const target = lying ? m.face * Math.PI * 0.46 : m.heldBy >= 0 ? Math.sin(v.run * 2) * 0.3 : 0;
    v.ang += angDiff(v.ang, target) * Math.min(1, dt * (lying ? 18 : 12));
    if (v.ang > 20 || v.ang < -20) v.ang = 0;
  }

  v.blinkT -= dt;
  if (v.blinkT <= 0) {
    v.blink = 0.12;
    v.blinkT = 1.5 + Math.random() * 3.5;
  }
  if (v.blink > 0) v.blink -= dt;
  const dizzy = m.flopT > 0 || m.heldBy >= 0;
  v.eye += dt * (dizzy ? 15 : 1.4);

  const tt = -m.vx / 650 + Math.sin(v.run * 0.5) * 0.15;
  v.tailV += ((tt - v.tailA) * 120 - v.tailV * 8) * dt;
  v.tailA += v.tailV * dt;

  const hatT = clamp(m.vy * 0.012, -9, 9);
  v.hatV += ((hatT - v.hatY) * 220 - v.hatV * 12) * dt;
  v.hatY += v.hatV * dt;
  if (m.status === 'qual') v.happy = 1;
  else v.happy = Math.max(0, v.happy - dt);
}

const OUT = '#3b2410';
const CREAM = '#fde7c4';

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function circ(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke = true): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = true): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
}

function arm(ctx: CanvasRenderingContext2D, sx: number, sy: number, hx: number, hy: number, fur: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 9.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = fur;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  circ(ctx, hx, hy, 5.6, fur);
}

export function drawBanana(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-14, -3);
  ctx.quadraticCurveTo(-4, 20, 20, 8);
  ctx.quadraticCurveTo(24, 4, 22, 0);
  ctx.quadraticCurveTo(2, 8, -10, -10);
  ctx.closePath();
  ctx.fillStyle = '#fde047';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = '#7c4a1d';
  ctx.fillRect(-15, -12, 5, 7);
  ctx.beginPath();
  ctx.arc(22, 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, shine: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-17, 0);
  ctx.lineTo(-19, -18);
  ctx.lineTo(-9, -9);
  ctx.lineTo(0, -22);
  ctx.lineTo(9, -9);
  ctx.lineTo(19, -18);
  ctx.lineTo(17, 0);
  ctx.closePath();
  ctx.fillStyle = '#facc15';
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  circ(ctx, 0, -20, 3.3, '#ef4444');
  circ(ctx, -19, -19, 2.6, '#38bdf8');
  circ(ctx, 19, -19, 2.6, '#4ade80');
  ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(shine * 6)})`;
  ctx.fillRect(-12, -7, 5, 3);
  ctx.restore();
}

function drawHat(ctx: CanvasRenderingContext2D, hat: number, col: string, t: number): void {
  const dark = shade(col, -40);
  switch (hat) {
    case 1:
      drawCrown(ctx, 0, 2, 0.9, t);
      break;
    case 2: // party hat
      ctx.beginPath();
      ctx.moveTo(-12, 2);
      ctx.lineTo(0, -30);
      ctx.lineTo(12, 2);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-7, -9, 14, 3);
      circ(ctx, 0, -31, 4.2, '#fff');
      break;
    case 3: // chef
      circ(ctx, -8, -12, 8, '#fff');
      circ(ctx, 8, -12, 8, '#fff');
      circ(ctx, 0, -18, 9, '#fff');
      ctx.fillStyle = '#fff';
      ctx.fillRect(-12, -9, 24, 12);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(-12, -9, 24, 12);
      break;
    case 4: // pirate
      ctx.beginPath();
      ctx.moveTo(-22, 3);
      ctx.quadraticCurveTo(0, -30, 22, 3);
      ctx.quadraticCurveTo(0, -4, -22, 3);
      ctx.fillStyle = '#1f2937';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      circ(ctx, 0, -9, 3.2, '#f8fafc', false);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-1, -6, 2, 5);
      break;
    case 5: // cowboy
      ell(ctx, 0, 1, 25, 5, '#b45309');
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.quadraticCurveTo(-13, -18, 0, -16);
      ctx.quadraticCurveTo(13, -18, 12, 0);
      ctx.closePath();
      ctx.fillStyle = '#d97706';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(-12, -5, 24, 3.5);
      break;
    case 6: // banana peel hat
      ctx.beginPath();
      ctx.moveTo(-17, 2);
      ctx.quadraticCurveTo(-18, -22, 0, -20);
      ctx.quadraticCurveTo(18, -22, 17, 2);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      for (const [px, py] of [[-8, -9], [6, -12], [10, -4]]) circ(ctx, px, py, 1.6, '#92400e', false);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-3, -20);
      ctx.quadraticCurveTo(0, -30, 7, -26);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ca8a04';
      ctx.stroke();
      break;
    case 7: // flower
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        circ(ctx, Math.cos(a) * 7, -13 + Math.sin(a) * 7, 5, '#f9a8d4');
      }
      circ(ctx, 0, -13, 4.6, '#fde047');
      break;
    case 8: // propeller beanie
      ctx.beginPath();
      ctx.arc(0, 0, 15, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.fillRect(-1.5, -22, 3, 8);
      ctx.save();
      ctx.translate(0, -22);
      ctx.scale(Math.cos(t * 18), 1);
      ctx.fillStyle = '#f87171';
      ctx.fillRect(-14, -2, 28, 4);
      ctx.restore();
      break;
    case 9: // helmet
      ctx.beginPath();
      ctx.arc(0, 1, 17, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#94a3b8';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-2, -17, 4, 16);
      break;
    case 10: // top hat
      ctx.fillStyle = '#111827';
      ctx.fillRect(-11, -26, 22, 26);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(-11, -26, 22, 26);
      ell(ctx, 0, 1, 19, 4.5, '#111827');
      ctx.fillStyle = col;
      ctx.fillRect(-11, -9, 22, 5);
      break;
    case 11: // bobble beanie
      ctx.beginPath();
      ctx.arc(0, 2, 16, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.fillStyle = dark;
      for (let i = -12; i <= 12; i += 6) ctx.fillRect(i - 1, -12, 2, 12);
      circ(ctx, 0, -17, 5, '#fff');
      break;
    default:
      break;
  }
}

export interface DrawOpts {
  local: boolean;
  time: number;
  teamColor?: string;
  tailTag: boolean;
  showName: boolean;
  scale?: number;
}

export function drawMonkey(ctx: CanvasRenderingContext2D, m: Monkey, v: Vis, o: DrawOpts): void {
  const t = o.time;
  const S = (o.scale ?? 1) * 1.08;
  const fur = FUR_COLORS[m.skin.fur % FUR_COLORS.length];
  const furDark = shade(fur, -35);
  const suit = o.teamColor ?? SUIT_COLORS[m.skin.suit % SUIT_COLORS.length];
  const hatCol = SUIT_COLORS[(m.skin.suit + 5) % SUIT_COLORS.length];
  const x = v.rx;
  const y = v.ry;

  // shadow
  if (m.grounded && m.flopT <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 18 * S, 4.5 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const sy = v.sy;
  const sx = 1 + (1 - sy) * 0.9;
  const tumbling = m.flopT > 0 && m.flopK === 1;
  const dizzy = m.flopT > 0 || m.heldBy >= 0;
  const lying = (m.flopT > 0 && m.flopK === 0) || m.diveT > 0;
  const happy = v.happy > 0 || m.status === 'qual';

  ctx.save();
  if (m.invT > 0 && Math.floor(t * 18) % 2 === 0) ctx.globalAlpha = 0.55;
  const hop = happy ? Math.abs(Math.sin(t * 9 + m.id)) * 8 : 0;
  ctx.translate(x, y - 24 * sy * S - hop);
  ctx.rotate(v.ang + v.lean);
  ctx.scale(m.face * sx * S, sy * S);

  const run = v.run;
  const grounded = m.grounded;

  // tail (behind)
  ctx.save();
  ctx.translate(-16, 12);
  ctx.rotate(v.tailA * 0.8 - 0.3);
  if (o.tailTag) {
    if (m.tail) drawBanana(ctx, -16, 4, 0.2 + Math.sin(t * 10) * 0.15, 1);
    else {
      ctx.fillStyle = furDark;
      ell(ctx, -3, 2, 3, 3, furDark, false);
    }
  } else {
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-18, 6, -22, -8 + Math.sin(run * 0.7) * 3);
    ctx.stroke();
    ctx.strokeStyle = fur;
    ctx.lineWidth = 4.2;
    ctx.stroke();
  }
  ctx.restore();

  // cape
  if (m.skin.acc === 5) {
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(-30 - Math.abs(m.vx) * 0.02, 22 + Math.sin(t * 8) * 2);
    ctx.lineTo(-4, 20);
    ctx.closePath();
    ctx.fillStyle = shade(suit, -25);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }

  // back arm
  const armSwing = grounded ? Math.sin(run) * 6 : Math.sin(t * 20) * 5;
  const flail = tumbling || (dizzy && !lying);
  if (m.diveT > 0) arm(ctx, 12, -4, 30, -10, furDark);
  else if (m.grabT > 0) arm(ctx, 12, 0, 32, 2, furDark);
  else if (happy) arm(ctx, 14, -2, 22, -26 + Math.sin(t * 14) * 5, furDark);
  else if (flail) arm(ctx, 14, 0, 24 + Math.sin(t * 17) * 8, -14 + Math.cos(t * 13) * 12, furDark);
  else arm(ctx, 14, 2, 20, 11 - armSwing, furDark);

  // feet
  const fl = grounded ? Math.max(0, Math.sin(run)) * -6 : m.vy < 0 ? -5 : 3;
  const fr = grounded ? Math.max(0, -Math.sin(run)) * -6 : m.vy < 0 ? -2 : 5;
  if (lying) {
    ell(ctx, -7, 26, 8, 5, furDark);
    ell(ctx, 7, 26, 8, 5, furDark);
  } else {
    ell(ctx, -8 + (grounded ? Math.sin(run) * 5 : 0), 25 + fl, 8.5, 5.4, furDark);
    ell(ctx, 8 - (grounded ? Math.sin(run) * 5 : 0), 25 + fr, 8.5, 5.4, furDark);
  }

  // body (bean)
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 25, 0, 0, Math.PI * 2);
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = suit;
  ctx.fillRect(-24, 3, 48, 30);
  ctx.fillStyle = shade(suit, 45);
  ctx.fillRect(-24, 3, 48, 4);
  const pat = m.skin.suit % 3;
  ctx.fillStyle = shade(suit, -30);
  if (pat === 1) for (let i = -20; i < 24; i += 9) ctx.fillRect(i, 8, 4, 24);
  else if (pat === 2) for (let i = -14; i < 18; i += 12) circ(ctx, i, 17 + ((i / 12) & 1) * 4, 2.6, shade(suit, 40), false);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(-8, -12, 6, 10, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 25, 0, 0, Math.PI * 2);
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = OUT;
  ctx.stroke();

  // scarf / bowtie
  if (m.skin.acc === 2) {
    ctx.fillStyle = shade(hatCol, 0);
    ctx.fillRect(-18, 2, 36, 6);
    ctx.fillRect(10, 6, 7, 14);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, 2, 36, 6);
    ctx.strokeRect(10, 6, 7, 14);
  } else if (m.skin.acc === 3) {
    ctx.fillStyle = hatCol;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.moveTo(0, 6);
    ctx.lineTo(10, 0);
    ctx.lineTo(10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    circ(ctx, 0, 6, 2.6, shade(hatCol, -40));
  }

  // ears
  circ(ctx, -20, -13, 8.6, fur);
  circ(ctx, -20, -13, 4.8, '#f9b8a4', false);
  circ(ctx, 20, -13, 8.6, fur);
  circ(ctx, 20, -13, 4.8, '#f9b8a4', false);

  // face patch
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(-6.5, -11, 9.5, 0, Math.PI * 2);
  ctx.arc(6.5, -11, 9.5, 0, Math.PI * 2);
  ctx.ellipse(0, -5, 12.5, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  const eyeY = -11;
  const blinking = v.blink > 0 && !dizzy;
  for (const ex of [-7, 7]) {
    if (happy) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(ex, eyeY + 2, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      continue;
    }
    if (blinking) {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(ex - 5, eyeY + 1);
      ctx.lineTo(ex + 5, eyeY + 1);
      ctx.stroke();
      continue;
    }
    circ(ctx, ex, eyeY, 7.4, '#fff');
    let px = 0;
    let py = 0;
    if (dizzy) {
      px = Math.cos(v.eye + (ex > 0 ? 1.6 : 0)) * 3;
      py = Math.sin(v.eye + (ex > 0 ? 1.6 : 0)) * 3;
    } else if (grounded && Math.abs(m.vx) < 30 && m.diveT <= 0) {
      // lazy cross-eyed idle stare
      px = (ex > 0 ? -1 : 1) * (1.2 + Math.sin(t * 1.3 + m.id) * 1.4);
      py = 1;
    } else {
      px = clamp(m.vx / 220, -2.4, 2.4) + 1;
      py = clamp(m.vy / 500, -2, 2);
    }
    circ(ctx, ex + px, eyeY + py, 3.5, '#111827', false);
    circ(ctx, ex + px + 1.1, eyeY + py - 1.2, 1.1, '#fff', false);
  }
  // brows
  if (m.grabT > 0 || m.diveT > 0) {
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-13, -21);
    ctx.lineTo(-3, -17);
    ctx.moveTo(13, -21);
    ctx.lineTo(3, -17);
    ctx.stroke();
  }
  // glasses / mask
  if (m.skin.acc === 1) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(-7, eyeY, 9, 0, Math.PI * 2);
    ctx.moveTo(16, eyeY);
    ctx.arc(7, eyeY, 9, 0, Math.PI * 2);
    ctx.moveTo(-2, eyeY - 2);
    ctx.lineTo(2, eyeY - 2);
    ctx.stroke();
  } else if (m.skin.acc === 4) {
    ctx.fillStyle = 'rgba(17,24,39,0.82)';
    ctx.fillRect(-16, eyeY - 6, 32, 5);
  }
  // nose
  circ(ctx, -2.8, -4, 1.3, OUT, false);
  circ(ctx, 2.8, -4, 1.3, OUT, false);
  // mouth
  ctx.strokeStyle = OUT;
  ctx.fillStyle = '#7f1d1d';
  ctx.lineWidth = 2.4;
  if (happy || (m.status === 'qual')) {
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (m.diveT > 0 || tumbling) {
    ell(ctx, 0, 3, 3.6, 4.8, '#7f1d1d');
  } else if (m.grabT > 0) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-6, 0, 12, 5);
    ctx.strokeRect(-6, 0, 12, 5);
  } else if (m.flopT > 0) {
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.quadraticCurveTo(-2, 0, 0, 3);
    ctx.quadraticCurveTo(2, 6, 5, 3);
    ctx.stroke();
    ell(ctx, 3, 6, 2.6, 3.4, '#f87171');
  } else if (grounded && Math.abs(m.vx) > 120) {
    ctx.beginPath();
    ctx.arc(0, 0.5, 5.5, 0.1, Math.PI - 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, -1, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // front arm
  if (m.diveT > 0) arm(ctx, -12, -6, 28, -16, fur);
  else if (m.grabT > 0) arm(ctx, -12, -2, 34, 6, fur);
  else if (happy) arm(ctx, -14, -2, -22, -26 + Math.cos(t * 14) * 5, fur);
  else if (flail) arm(ctx, -14, 0, -24 + Math.cos(t * 15) * 8, -10 + Math.sin(t * 11) * 12, fur);
  else arm(ctx, -14, 2, -20, 11 + armSwing, fur);

  // hat / crown
  ctx.save();
  ctx.translate(0, -23 + v.hatY * 0.6);
  ctx.rotate(-v.lean * 0.8 + Math.sin(t * 3 + m.id) * 0.02);
  if (m.crown) drawCrown(ctx, 0, 2, 1.1, t);
  else drawHat(ctx, m.skin.hat, hatCol, t + m.id);
  ctx.restore();

  ctx.restore();

  // name tag
  if (o.showName) {
    ctx.font = 'bold 13px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(17,24,39,0.9)';
    ctx.fillStyle = o.local ? '#fde047' : '#fff';
    const ty = y - 66 * S;
    ctx.strokeText(m.name, x, ty);
    ctx.fillText(m.name, x, ty);
    if (o.local) {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2;
      const ay = ty - 14 + Math.sin(t * 6) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, ay - 8);
      ctx.lineTo(x + 7, ay - 8);
      ctx.lineTo(x, ay);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  void TEAM_COLORS;
}
