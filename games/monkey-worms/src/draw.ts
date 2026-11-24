import type { Crate, Mine, Proj, Team, WeaponId, Worm } from './types';
import { WEAPONS } from './weapons';

const FUR = '#8b5a2b';
const FUR_D = '#5b3a1a';
const FUR_L = '#a8703a';
const TAN = '#f2d3a2';
const INK = '#2a1a0e';

export interface MonkeyOpts {
  active: boolean;
  aiming: boolean;
  weapon: WeaponId | null;
  charge: number;
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, c: string): void {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Desenha um macaco com capacete do time, expressões e animações. */
export function drawMonkey(ctx: CanvasRenderingContext2D, w: Worm, team: Team, t: number, o: MonkeyOpts): void {
  const S = 1.12;
  const f = w.facing;
  const air = !w.grounded && !w.rope;
  const kami = w.kami !== null;
  const panic = kami || (air && (w.launched || Math.abs(w.vy) > 220 || w.panic > 0.6));
  const hurt = w.hurtT > 0;
  const lowHp = w.hp < 30;
  const walk = w.walkAmt;
  const blink = w.blinkT < 0;
  const roped = w.rope !== null;
  const aimRad = (w.aim * Math.PI) / 180;
  const holdingAim = o.active && o.aiming && o.weapon !== null && !panic && !roped;
  const bob = Math.sin(t * 2.3 + w.id) * 0.45 - (walk > 0.2 ? Math.abs(Math.sin(w.walkT * 12)) * 1.5 * walk : 0);

  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.scale(f * S, S);
  if (kami && w.kami) {
    ctx.rotate(Math.atan2(w.kami.dy, w.kami.dx * f));
  } else if (w.launched && air) {
    ctx.rotate(w.spin * f);
  } else if (roped && w.rope) {
    ctx.rotate(Math.atan2((w.rope.ax - w.x) * f, -(w.rope.ay - w.y)));
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // sombra de contato
  if (w.grounded && !kami) {
    ctx.globalAlpha = 0.22;
    ell(ctx, 0, 9.6, 7, 1.6, '#000');
    ctx.globalAlpha = 1;
  }

  const dy = bob;
  ctx.translate(0, dy);

  // rabo
  const wag = Math.sin(t * 5 + w.id) * 2 + Math.sin(w.walkT * 12) * 1.5 * walk + (panic ? Math.sin(t * 32) * 3 : 0);
  ctx.beginPath();
  ctx.moveTo(-4.5, 6);
  ctx.bezierCurveTo(-13, 6 + wag, -15.5, -4, -10.5, -6.5 + wag * 0.6);
  ctx.strokeStyle = FUR_D;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = FUR_L;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // braço de trás
  {
    let hx = -4.8;
    let hy = 7 + Math.sin(t * 2.3) * 0.4;
    if (panic) {
      hx = -8 + Math.sin(t * 26) * 2;
      hy = -7 + Math.cos(t * 23) * 2;
    } else if (walk > 0.2) {
      hx = -3.5 - Math.sin(w.walkT * 12) * 3 * walk;
    } else if (roped) {
      hx = -3;
      hy = -9;
    } else if (kami) {
      hx = 9;
      hy = 0;
    }
    line(ctx, -2.2, 1.2, hx, hy, 3.2, FUR_D);
    ell(ctx, hx, hy, 2, 2, FUR_D);
  }

  // pernas
  for (let i = 0; i < 2; i++) {
    const hipX = -2.5 + i * 5.5;
    let fx = hipX + walk * Math.sin(w.walkT * 12 + i * Math.PI) * 3.6;
    let fy = 9 - walk * Math.max(0, Math.cos(w.walkT * 12 + i * Math.PI)) * 2.4;
    if (panic || roped) {
      fx = hipX + (i ? 3.5 : -3.5) + Math.sin(t * 20 + i * 2) * (panic ? 1.5 : 0.4);
      fy = 8 + (i ? 1.5 : -0.5) + Math.cos(t * 18 + i) * (panic ? 1.2 : 0.3);
    } else if (kami) {
      fx = hipX - 5;
      fy = 6 + i;
    }
    line(ctx, hipX, 6.2, fx, fy, 3.6, FUR_D);
    ell(ctx, fx + 1, fy, 3.1, 1.8, '#c9a070');
  }

  // corpo
  ell(ctx, 0, 2.8, 5.9, 6.2, FUR);
  ell(ctx, 1.3, 3.6, 3.7, 4.4, TAN);
  // lenço do time
  ctx.fillStyle = team.color;
  ctx.beginPath();
  ctx.moveTo(-4.4, -0.8);
  ctx.lineTo(5.2, -0.6);
  ctx.lineTo(1.2, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = team.dark;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // braço da frente (com arma)
  {
    const sx = 3.4;
    const sy = 0.9;
    let hx = 4.4;
    let hy = 7 + Math.sin(t * 2.3) * 0.4;
    let drawWeapon = false;
    let wa = 0;
    if (holdingAim) {
      hx = sx + Math.cos(aimRad) * 7.5;
      hy = sy - Math.sin(aimRad) * 7.5;
      wa = -aimRad;
      drawWeapon = true;
      if (w.throwT > 0) {
        const k = w.throwT / 0.35;
        hx -= Math.cos(aimRad) * 3 * k;
        hy += Math.sin(aimRad) * 3 * k;
      }
    } else if (panic) {
      hx = 7 + Math.sin(t * 25) * 2;
      hy = -8 + Math.cos(t * 22) * 2;
    } else if (kami) {
      hx = 10;
      hy = -1;
    } else if (roped) {
      hx = 4;
      hy = -10;
    } else if (w.victory) {
      hx = 7 + Math.sin(t * 14) * 2;
      hy = -9 + Math.cos(t * 12) * 1.5;
    } else if (w.throwT > 0 && w.holding) {
      const k = 1 - w.throwT / 0.35;
      const a = -1.2 + k * 2.2;
      hx = sx + Math.cos(a) * 7.5;
      hy = sy + Math.sin(a) * 7.5;
    } else if (walk > 0.2) {
      hx = 3.5 + Math.sin(w.walkT * 12) * 3 * walk;
    }
    line(ctx, sx, sy, hx, hy, 3.2, FUR_D);
    ell(ctx, hx, hy, 2.1, 2.1, FUR);
    if (drawWeapon && o.weapon) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(wa);
      drawHeld(ctx, o.weapon, o.charge, w);
      ctx.restore();
    }
  }

  // cabeça
  ell(ctx, -5.2, -6.4, 2.7, 2.7, FUR);
  ell(ctx, -5.0, -6.4, 1.5, 1.5, '#f4a4a4');
  ell(ctx, 1, -6, 6.4, 6.2, FUR);
  ell(ctx, 7, -6.2, 2.2, 2.4, FUR_D);
  ell(ctx, 6.9, -6.2, 1.2, 1.3, '#f4a4a4');
  ell(ctx, 2.5, -4, 4.6, 3.8, TAN);
  ell(ctx, 0.5, -3.4, 2.6, 2.8, TAN);

  // olhos
  const eyeR = panic ? 2.7 : hurt ? 2.3 : holdingAim ? 1.9 : 2.2;
  const lookX = holdingAim ? Math.cos(aimRad) * 0.9 : panic ? Math.sin(t * 18) * 0.8 : Math.sin(t * 0.9 + w.id) * 0.5 + 0.3;
  const lookY = holdingAim ? -Math.sin(aimRad) * 0.9 : panic ? Math.cos(t * 15) * 0.8 : 0;
  const eyes: [number, number][] = [
    [0.9, -5],
    [4.7, -5],
  ];
  for (const [ex, ey] of eyes) {
    if (hurt && !panic) {
      // olhos >< de dor
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ex - 1.6, ey - 1.4);
      ctx.lineTo(ex + 1.2, ey);
      ctx.lineTo(ex - 1.6, ey + 1.4);
      ctx.stroke();
    } else if (blink && !panic) {
      line(ctx, ex - 1.8, ey, ex + 1.8, ey, 1, INK);
    } else {
      ell(ctx, ex, ey, eyeR, eyeR * (holdingAim ? 0.8 : 1.05), '#fff');
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ell(ctx, ex + lookX, ey + lookY, panic ? 0.85 : 1.15, panic ? 0.85 : 1.15, INK);
    }
  }
  // sobrancelhas
  if (holdingAim || o.charge > 0.05) {
    line(ctx, -0.8, -8.1, 2.4, -6.7, 1.3, FUR_D);
    line(ctx, 3.4, -6.7, 6.6, -8.1, 1.3, FUR_D);
  } else if (panic || hurt) {
    ctx.strokeStyle = FUR_D;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0.9, -8.7, 1.8, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4.7, -8.7, 1.8, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // nariz e boca
  ell(ctx, 5.7, -3.3, 0.45, 0.45, INK);
  ell(ctx, 6.6, -3.0, 0.45, 0.45, INK);
  if (panic || hurt) {
    ell(ctx, 4, -1.2, 1.6, 2.1, INK);
    ell(ctx, 4, -0.5, 1, 0.9, '#e05a6a');
  } else if (w.victory) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(3.8, -2.4, 2.3, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (holdingAim) {
    line(ctx, 2.4, -1.4, 5.4, -1.5, 1, INK);
  } else if (lowHp) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2.2, -1.2);
    ctx.quadraticCurveTo(3.4, -2.4, 4.4, -1.2);
    ctx.quadraticCurveTo(5.2, -0.2, 5.8, -1.4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(3.9, -2.6, 1.6, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  // gota de suor
  if (lowHp && !hurt) {
    const sy = -10.5 + ((t * 8) % 4);
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.moveTo(-3, sy - 2);
    ctx.quadraticCurveTo(-4.5, sy + 0.5, -3, sy + 1);
    ctx.quadraticCurveTo(-1.5, sy + 0.5, -3, sy - 2);
    ctx.fill();
  }

  // capacete
  ell(ctx, 1, -8.5, 8.4, 1.7, team.dark);
  ctx.fillStyle = team.color;
  ctx.beginPath();
  ctx.arc(1, -8.5, 7.4, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = team.dark;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = team.light;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(1, -15.7);
  ctx.lineTo(1, -8.8);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ell(ctx, -2.2, -13, 1.9, 0.9, '#fff', -0.5);
  ctx.globalAlpha = 1;
  ell(ctx, 4.6, -11.5, 1.35, 1.35, '#fde047');
  ell(ctx, 4.6, -11.5, 0.6, 0.6, team.dark);

  ctx.restore();
}

/** Arma segurada na mão (eixo +x = direção da mira) */
export function drawHeld(ctx: CanvasRenderingContext2D, id: WeaponId, charge: number, w: Worm): void {
  switch (id) {
    case 'bazooka': {
      ctx.fillStyle = '#a3c46a';
      ctx.fillRect(-6, -2.3, 17, 4.6);
      ctx.fillStyle = '#6b8e3a';
      for (const x of [-2, 3, 8]) ctx.fillRect(x, -2.5, 1.3, 5);
      ctx.fillStyle = '#3f2a14';
      ctx.fillRect(10.5, -2.7, 1.8, 5.4);
      ctx.fillStyle = '#6b4423';
      ctx.beginPath();
      ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'grenade': {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(2, 3, 5.5, Math.PI * 1.15, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-3.6, -1.5, 2.2, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(7, -1.5, 1.4, 1.4);
      break;
    }
    case 'holy': {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.arc(2, 3, 5.5, Math.PI * 1.15, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(3, -6.5, 4.2, 1.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'sheep': {
      ell(ctx, 3, 0, 5.5, 3.4, '#a0703c');
      ell(ctx, 8, -1.5, 2.6, 2.2, '#8a5d30');
      ell(ctx, 8.6, -2, 0.6, 0.6, INK);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(1, -3.8, 5, 1.8);
      break;
    }
    case 'slipper': {
      ell(ctx, 3, 0, 6.8, 3, '#38bdf8');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0.5);
      ctx.lineTo(4, -1.8);
      ctx.moveTo(0, -0.5);
      ctx.lineTo(4, 1.8);
      ctx.stroke();
      break;
    }
    case 'pigeons': {
      ctx.fillStyle = '#334155';
      ctx.fillRect(-1, -2.5, 8, 5);
      line(ctx, 6, -2.5, 8, -7, 0.8, '#94a3b8');
      ell(ctx, 1.5, 0, 1.1, 1.1, '#ef4444');
      break;
    }
    case 'rope': {
      ctx.strokeStyle = '#65a30d';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(2, 0, 3.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(7.5, 0, 2, -1, 3);
      ctx.stroke();
      break;
    }
    case 'torch': {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-3.5, -2.8, 4.5, 5.6);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(1, -1.2, 7.5, 2.4);
      ctx.fillStyle = w.torch ? '#fb923c' : '#475569';
      ctx.beginPath();
      ctx.ellipse(10, 0, 2.6, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mine': {
      ell(ctx, 3, 0, 4.5, 2.4, '#fde047');
      ell(ctx, 3, 0, 1, 1, '#ef4444');
      break;
    }
    default:
      break;
  }
  void charge;
}

export function drawTomb(ctx: CanvasRenderingContext2D, w: Worm, team: Team, t: number): void {
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.scale(1.1, 1.1);
  // monte de terra
  ell(ctx, 0, 8.8, 10.5, 3.2, '#5e3a1e');
  ell(ctx, 0, 8.2, 8.5, 2.2, '#7a4a26');
  // banana-lápide
  ctx.beginPath();
  ctx.moveTo(-3.5, 9);
  ctx.bezierCurveTo(-9, 2, -7, -10, 1, -14.5);
  ctx.bezierCurveTo(-1, -6, 0, 1, 4.5, 9);
  ctx.closePath();
  ctx.fillStyle = '#facc15';
  ctx.fill();
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.arc(1.2, -14.3, 1.6, 0, Math.PI * 2);
  ctx.fill();
  // fita do time
  ctx.strokeStyle = team.color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-6.6, -3);
  ctx.quadraticCurveTo(-3, -1, 0.4, -4.4);
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  ctx.font = '700 4.4px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RIP', -3, -8);
  ctx.restore();
  // alminha subindo
  if (w.tombT < 3) {
    const k = w.tombT / 3;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.translate(w.x + Math.sin(t * 3) * 3, w.y - 18 - k * 60);
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 1.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ell(ctx, 0, 0, 3.4, 4, 'rgba(255,255,255,0.8)');
    ell(ctx, -1.2, -0.6, 0.6, 0.8, INK);
    ell(ctx, 1.2, -0.6, 0.6, 0.8, INK);
    ctx.restore();
  }
}

export function drawProj(ctx: CanvasRenderingContext2D, p: Proj, t: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  switch (p.kind) {
    case 'rocket': {
      ctx.rotate(p.angle);
      ell(ctx, -6, -3, 3, 1.4, '#16a34a', -0.6);
      ell(ctx, -6, 3, 3, 1.4, '#16a34a', 0.6);
      ell(ctx, 0, 0, 5.4, 4.8, '#6b4423');
      ell(ctx, 1.5, -1.5, 1.6, 1, '#a3703a');
      ell(ctx, 1.5, 0.8, 0.7, 0.7, '#2a1a0e');
      ell(ctx, 3, 1.8, 0.7, 0.7, '#2a1a0e');
      ell(ctx, 0, 2.4, 0.7, 0.7, '#2a1a0e');
      break;
    }
    case 'grenade':
    case 'holy': {
      const holy = p.kind === 'holy';
      if (holy) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
        g.addColorStop(0, 'rgba(254,240,138,0.8)');
        g.addColorStop(1, 'rgba(254,240,138,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, -11 + Math.sin(t * 6) * 1.2, 6, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(p.angle);
      ctx.strokeStyle = holy ? '#fbbf24' : '#facc15';
      ctx.lineWidth = holy ? 6 : 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 3, 7, Math.PI * 1.1, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = holy ? '#fffbeb' : '#fef08a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 2, 6.5, Math.PI * 1.25, Math.PI * 1.6);
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-7.4, -1.2, 2.2, 2.2);
      ctx.fillRect(5.6, -1.4, 2, 2);
      break;
    }
    case 'slipper': {
      ctx.rotate(p.angle);
      ell(ctx, 0, 0, 9, 4.4, '#0369a1');
      ell(ctx, 0, 0, 8.2, 3.7, '#38bdf8');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(3, -2.6);
      ctx.moveTo(-2, 0);
      ctx.lineTo(3, 2.6);
      ctx.stroke();
      break;
    }
    case 'sheep': {
      ctx.scale(p.dir, 1);
      ctx.rotate(p.angle);
      const lp = p.grounded ? Math.sin(p.t * 22) * 2 : 1;
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(-6 + lp, 3, 2.6, 4.6);
      ctx.fillRect(-1 - lp, 3, 2.6, 4.6);
      ctx.fillRect(3 + lp, 3, 2.6, 4.6);
      ell(ctx, 0, 0, 10, 6.4, '#a0703c');
      ell(ctx, -1, 1.6, 7, 3.4, '#c08a4f');
      ell(ctx, 9, -2.4, 5, 4.2, '#a0703c');
      ell(ctx, 12.4, -1.4, 2.4, 2.2, '#7a4f26');
      ell(ctx, 9.2, -4, 0.9, 0.9, '#fff');
      ell(ctx, 9.5, -4, 0.45, 0.45, INK);
      ell(ctx, 6.4, -5.8, 1.4, 1.6, '#7a4f26');
      // dinamite
      const blink = p.fuse < 1.6 && Math.floor(p.t * 8) % 2 === 0;
      ctx.fillStyle = blink ? '#fca5a5' : '#dc2626';
      ctx.fillRect(-5, -8, 2.6, 5.4);
      ctx.fillRect(-1.8, -8.4, 2.6, 5.8);
      ctx.fillRect(1.4, -8, 2.6, 5.4);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-0.5, -8.4);
      ctx.quadraticCurveTo(1, -12, 3, -11);
      ctx.stroke();
      break;
    }
    case 'pigeon': {
      ctx.scale(p.dir, 1);
      ctx.rotate(p.angle);
      const flap = Math.sin(p.t * 22);
      ell(ctx, -3, -1.5 - flap * 4, 6, 2.2, '#94a3b8', -0.5 - flap * 0.5);
      ell(ctx, 0, 0, 8.5, 5, '#a8b5c6');
      ell(ctx, -8, 0.5, 3.6, 1.6, '#64748b', 0.2);
      ell(ctx, 7, -2.4, 3.6, 3.4, '#cbd5e1');
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(10, -2.7);
      ctx.lineTo(13.4, -1.8);
      ctx.lineTo(10, -1);
      ctx.closePath();
      ctx.fill();
      ell(ctx, 8, -3.2, 1, 1, '#fff');
      ell(ctx, 8.3, -3.2, 0.5, 0.5, INK);
      ell(ctx, -2, 1.5, 3.4, 1.8, '#7b8a9e');
      ell(ctx, 0, -1.5 + flap * 3, 6, 2.2, '#94a3b8', 0.5 + flap * 0.4);
      break;
    }
    case 'poop': {
      ctx.rotate(p.angle);
      ell(ctx, 0, 3, 5.2, 2.6, '#6b3f1d');
      ell(ctx, 0, 0, 3.8, 2.3, '#7c4a24');
      ell(ctx, 0, -2.6, 2.4, 1.8, '#8a5629');
      ell(ctx, -1.2, 0.6, 0.8, 0.8, '#fff');
      ell(ctx, 1.4, 0.6, 0.8, 0.8, '#fff');
      ell(ctx, -1.2, 0.7, 0.4, 0.4, INK);
      ell(ctx, 1.4, 0.7, 0.4, 0.4, INK);
      break;
    }
  }
  ctx.restore();
}

export function drawMine(ctx: CanvasRenderingContext2D, m: Mine, t: number): void {
  ctx.save();
  ctx.translate(m.x, m.y + 1);
  const armed = m.armT <= 0;
  ell(ctx, 0, 3, 7, 1.6, 'rgba(0,0,0,0.2)');
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2 + 0.4);
    ell(ctx, 4.2, 0, 4.2, 1.8, '#fde047');
    ell(ctx, 4.8, 0, 2.6, 0.8, '#fef9c3');
    ctx.restore();
  }
  ell(ctx, 0, 0, 2.4, 1.8, '#eab308');
  const fast = m.trigger >= 0;
  const on = armed && (fast ? Math.floor(t * 16) % 2 === 0 : Math.floor(t * 2) % 2 === 0);
  ell(ctx, 0, -1, 1.4, 1.4, on ? '#ef4444' : '#7f1d1d');
  ctx.restore();
}

export function drawCrate(ctx: CanvasRenderingContext2D, c: Crate, t: number): void {
  ctx.save();
  ctx.translate(c.x, c.y);
  if (!c.landed) {
    const sway = Math.sin(t * 3 + c.x) * 3;
    ctx.save();
    ctx.translate(sway, 0);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.8;
    for (const x of [-16, -8, 8, 16]) {
      ctx.beginPath();
      ctx.moveTo(x, -34);
      ctx.lineTo(x * 0.4 - sway, -8);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#ef4444';
      ctx.beginPath();
      ctx.moveTo(-18 + i * 9, -34);
      ctx.quadraticCurveTo(-18 + i * 9 + 4.5, -52, -9 + i * 9, -34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = '#c58a4a';
  ctx.fillRect(-9, -9, 18, 18);
  ctx.strokeStyle = '#6b4220';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-9, -9, 18, 18);
  ctx.beginPath();
  ctx.moveTo(-9, -9);
  ctx.lineTo(9, 9);
  ctx.moveTo(9, -9);
  ctx.lineTo(-9, 9);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (c.kind === 'hp') {
    ell(ctx, 0, 0, 5.4, 5.4, '#fff');
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-1.2, -4, 2.4, 8);
    ctx.fillRect(-4, -1.2, 8, 2.4);
  } else {
    ell(ctx, 0, 0, 6, 6, '#fde047');
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(WEAPONS[c.weapon].emoji, 0, 1);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}
