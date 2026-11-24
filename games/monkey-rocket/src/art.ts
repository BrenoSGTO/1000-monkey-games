// Arte em Canvas 2D: macacos, carros tunados, bola de coco, bananas.
import { ARENA, BALL_R, CARS, CAR_GEO, FURS, TEAM_COLORS } from './constants';
import type { CarId, RenderBall, RenderCar } from './types';

export type Expr = 'normal' | 'scream' | 'happy' | 'sad' | 'strain' | 'dizzy';

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Cabeca de macaco. (x,y) = centro, r = raio da cabeca. look em [-1,1]. */
export function drawMonkey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fur: number,
  expr: Expr,
  lookX: number,
  lookY: number,
  team: 0 | 1,
  t: number,
  arms = false,
): void {
  const F = FURS[fur % FURS.length];
  const tc = TEAM_COLORS[team];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lw = 0.075;

  if (arms) {
    const wave = Math.sin(t * 14) * 0.25;
    ctx.strokeStyle = F.fur;
    ctx.lineWidth = 0.4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.7, 1.05);
      ctx.quadraticCurveTo(s * 1.5, 0.4, s * (1.55 + wave * s), -0.9 + wave);
      ctx.stroke();
      ctx.fillStyle = F.face;
      circle(ctx, s * (1.55 + wave * s), -0.95 + wave, 0.3);
      ctx.fill();
    }
  }

  // orelhas
  for (const s of [-1, 1]) {
    ctx.fillStyle = F.fur;
    ctx.strokeStyle = F.dark;
    ctx.lineWidth = lw;
    circle(ctx, s * 0.98, -0.02, 0.37);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f9a8b8';
    circle(ctx, s * 0.98, -0.02, 0.2);
    ctx.fill();
  }
  // cabeca
  ctx.fillStyle = F.fur;
  ctx.strokeStyle = F.dark;
  ctx.lineWidth = lw;
  circle(ctx, 0, 0, 1);
  ctx.fill();
  ctx.stroke();
  // faixa do time
  ctx.strokeStyle = tc.main;
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.arc(0, 0, 0.9, Math.PI * 1.18, Math.PI * 1.82);
  ctx.stroke();
  ctx.strokeStyle = tc.dark;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.arc(0, 0, 0.99, Math.PI * 1.18, Math.PI * 1.82);
  ctx.stroke();
  // mascara clara
  ctx.fillStyle = F.face;
  circle(ctx, -0.3, 0.12, 0.46);
  ctx.fill();
  circle(ctx, 0.3, 0.12, 0.46);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 0.62, 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  // sobrancelhas
  ctx.strokeStyle = F.dark;
  ctx.lineWidth = 0.09;
  const browY = expr === 'scream' || expr === 'happy' ? -0.38 : -0.24;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (expr === 'sad') {
      ctx.moveTo(s * 0.55, browY + 0.02);
      ctx.lineTo(s * 0.12, browY - 0.12);
    } else if (expr === 'strain' || expr === 'scream') {
      ctx.moveTo(s * 0.55, browY - 0.1);
      ctx.lineTo(s * 0.1, browY + 0.04);
    } else {
      ctx.moveTo(s * 0.55, browY);
      ctx.lineTo(s * 0.1, browY - 0.04);
    }
    ctx.stroke();
  }

  // olhos
  const ey = 0.02;
  for (const s of [-1, 1]) {
    const ex = s * 0.3;
    if (expr === 'happy') {
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 0.11;
      ctx.beginPath();
      ctx.arc(ex, ey + 0.1, 0.17, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      continue;
    }
    if (expr === 'dizzy') {
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      for (let a = 0; a < 12; a += 0.4) {
        const rr = 0.03 + a * 0.016;
        const px = ex + Math.cos(a + t * 8) * rr;
        const py = ey + Math.sin(a + t * 8) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 0.23, expr === 'scream' ? 0.3 : 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    let px = ex + lookX * 0.09;
    const py = ey + lookY * 0.09;
    if (expr === 'strain') px = ex - s * 0.1; // vesgo!
    ctx.fillStyle = '#111827';
    circle(ctx, px, py, 0.11);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, px - 0.035, py - 0.04, 0.035);
    ctx.fill();
  }
  if (expr === 'sad') {
    // lagrimas
    ctx.fillStyle = '#7dd3fc';
    const ty = 0.3 + ((t * 1.2) % 1) * 0.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 0.42, ty, 0.07, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // nariz
  ctx.fillStyle = F.dark;
  circle(ctx, -0.08, 0.38, 0.045);
  ctx.fill();
  circle(ctx, 0.08, 0.38, 0.045);
  ctx.fill();

  // boca
  switch (expr) {
    case 'scream': {
      const open = 0.3 + Math.sin(t * 26) * 0.05;
      ctx.fillStyle = '#4c0519';
      ctx.beginPath();
      ctx.ellipse(0, 0.66, 0.36, open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(0, 0.66 + open * 0.5, 0.2, open * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-0.24, 0.66 - open, 0.48, 0.1);
      break;
    }
    case 'happy': {
      ctx.fillStyle = '#4c0519';
      ctx.beginPath();
      ctx.arc(0, 0.56, 0.4, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(0, 0.86, 0.2, 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-0.3, 0.56, 0.6, 0.09);
      break;
    }
    case 'sad': {
      ctx.strokeStyle = F.dark;
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.arc(0, 0.9, 0.26, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    }
    case 'strain': {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.roundRect(-0.3, 0.54, 0.6, 0.2, 0.06);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0.54);
      ctx.lineTo(0, 0.74);
      ctx.stroke();
      break;
    }
    case 'dizzy': {
      ctx.strokeStyle = F.dark;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(-0.28, 0.66);
      ctx.quadraticCurveTo(-0.14, 0.78, 0, 0.66);
      ctx.quadraticCurveTo(0.14, 0.54, 0.28, 0.66);
      ctx.stroke();
      break;
    }
    default: {
      ctx.strokeStyle = F.dark;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(0, 0.5, 0.26, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Carros

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number): void {
  const R = CAR_GEO.wheelR;
  ctx.fillStyle = '#111827';
  circle(ctx, x, y, R);
  ctx.fill();
  ctx.fillStyle = '#9ca3af';
  circle(ctx, x, y, R * 0.55);
  ctx.fill();
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 0.06;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * R * 0.52, y + Math.sin(a) * R * 0.52);
    ctx.stroke();
  }
  ctx.fillStyle = '#e5e7eb';
  circle(ctx, x, y, R * 0.17);
  ctx.fill();
}

interface CarDrawOpts {
  ball: RenderBall;
  t: number;
  expr: Expr;
  celebrate: boolean;
  scale: number;
  isLocal: boolean;
}

/**
 * Desenha o carro no referencial local (metros, y para baixo, nariz em +x).
 * O chamador faz translate/rotate/scale(facing).
 */
export function drawCarLocal(ctx: CanvasRenderingContext2D, c: RenderCar, o: CarDrawOpts): void {
  const spec = CARS[c.car];
  const L = spec.length;
  const tc = TEAM_COLORS[c.team];
  const G = CAR_GEO;
  const cl = spec.cabinL;
  const off = spec.cabinOff;
  const spin = (c.x * 0.9) % (Math.PI * 2);

  // chama do turbo
  if (c.boosting) {
    const len = 1.6 + Math.random() * 1.1;
    const g = ctx.createLinearGradient(-L / 2, 0, -L / 2 - len, 0);
    g.addColorStop(0, '#fff7ae');
    g.addColorStop(0.35, '#fb923c');
    g.addColorStop(0.75, '#e11d48');
    g.addColorStop(1, 'rgba(147,51,234,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-L / 2 + 0.1, 0.18);
    ctx.quadraticCurveTo(-L / 2 - len * 0.5, 0.0, -L / 2 - len, 0.3);
    ctx.quadraticCurveTo(-L / 2 - len * 0.5, 0.6, -L / 2 + 0.1, 0.5);
    ctx.fill();
  }

  // rodas de tras (por baixo da lataria)
  wheel(ctx, -G.wheelX * L, G.wheelY, spin);
  wheel(ctx, G.wheelX * L, G.wheelY, spin);

  const bodyG = ctx.createLinearGradient(0, G.chassisTop, 0, G.chassisBottom);
  bodyG.addColorStop(0, tc.light);
  bodyG.addColorStop(0.25, tc.main);
  bodyG.addColorStop(1, tc.dark);
  const outline = '#0f172a';

  // ---- cabine (formato por carro) ----
  const baseY = G.chassisTop + 0.02;
  const topY = G.cabinTop;
  const taperMap: Record<CarId, number> = { fusca: 0.62, kombi: 0.93, brasilia: 0.72, uno: 0.82 };
  const tp = taperMap[c.car];
  const x0 = off - cl / 2;
  const x1 = off + cl / 2;
  const cabinPath = () => {
    ctx.beginPath();
    if (c.car === 'fusca') {
      ctx.moveTo(x0 - 0.25, baseY);
      ctx.bezierCurveTo(x0 + 0.1, topY - 0.15, x1 - 0.5, topY - 0.1, x1 + 0.35, baseY);
      ctx.closePath();
    } else if (c.car === 'brasilia') {
      ctx.moveTo(x0 - 0.3, baseY);
      ctx.lineTo(x0 + 0.15, topY);
      ctx.lineTo(x1 - 0.5, topY);
      ctx.lineTo(x1 + 0.45, baseY);
      ctx.closePath();
    } else {
      ctx.moveTo(x0, baseY);
      ctx.lineTo(off - (cl / 2) * tp, topY);
      ctx.lineTo(off + (cl / 2) * tp, topY);
      ctx.lineTo(x1, baseY);
      ctx.closePath();
    }
  };
  // teto na cor do time (kombi: branco)
  cabinPath();
  ctx.fillStyle = c.car === 'kombi' ? '#f8fafc' : tc.main;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.08;
  ctx.stroke();

  // janela (recorte pro macaco)
  const winPath = () => {
    ctx.beginPath();
    if (c.car === 'fusca') {
      ctx.moveTo(x0 + 0.05, baseY - 0.04);
      ctx.bezierCurveTo(x0 + 0.3, topY + 0.12, x1 - 0.55, topY + 0.1, x1 + 0.05, baseY - 0.04);
      ctx.closePath();
    } else if (c.car === 'brasilia') {
      ctx.moveTo(x0 + 0.02, baseY - 0.05);
      ctx.lineTo(x0 + 0.3, topY + 0.1);
      ctx.lineTo(x1 - 0.6, topY + 0.1);
      ctx.lineTo(x1 + 0.12, baseY - 0.05);
      ctx.closePath();
    } else {
      const inset = 0.12;
      ctx.moveTo(x0 + inset, baseY - 0.05);
      ctx.lineTo(off - (cl / 2) * tp + inset * 1.3, topY + 0.1);
      ctx.lineTo(off + (cl / 2) * tp - inset * 1.3, topY + 0.1);
      ctx.lineTo(x1 - inset, baseY - 0.05);
      ctx.closePath();
    }
  };
  const glass = ctx.createLinearGradient(0, topY, 0, baseY);
  glass.addColorStop(0, '#bae6fd');
  glass.addColorStop(1, '#38bdf8');
  winPath();
  ctx.fillStyle = glass;
  ctx.fill();

  // macaco
  const hr = 0.5;
  const hx = off + 0.1;
  // direcao do olhar (mundo -> local do carro)
  const wx = o.ball.x - c.x;
  const wy = o.ball.y - c.y;
  const ca = Math.cos(-c.a);
  const sa = Math.sin(-c.a);
  let lx = (wx * ca - wy * sa) * c.facing;
  let ly = -(wx * sa + wy * ca);
  const ll = Math.hypot(lx, ly) || 1;
  lx /= ll;
  ly /= ll;
  const out = c.boosting;
  if (!out) {
    ctx.save();
    winPath();
    ctx.clip();
    drawMonkey(ctx, hx, (baseY + topY) / 2 + 0.12, hr, c.fur, o.expr, lx, ly, c.team, o.t);
    ctx.restore();
    // reflexo do vidro
    ctx.save();
    winPath();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(x0 + 0.3, baseY);
    ctx.lineTo(x0 + 0.75, baseY);
    ctx.lineTo(x0 + 1.2, topY);
    ctx.lineTo(x0 + 0.8, topY);
    ctx.fill();
    ctx.restore();
  } else {
    // cabeca pra fora gritando + linhas de vento
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.07;
    for (let i = 0; i < 3; i++) {
      const yy = topY - 0.3 - i * 0.28;
      ctx.beginPath();
      ctx.moveTo(hx - 0.7, yy);
      ctx.lineTo(hx - 1.6 - Math.random() * 0.8, yy + 0.05);
      ctx.stroke();
    }
    drawMonkey(ctx, hx + 0.1, topY - 0.38, 0.56, c.fur, 'scream', 0.6, 0, c.team, o.t, true);
  }
  winPath();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.06;
  ctx.stroke();

  // detalhes especificos
  if (c.car === 'uno') {
    // escada no teto
    const lx0 = off - (cl / 2) * tp + 0.1;
    const lx1 = off + (cl / 2) * tp - 0.1;
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(lx0, topY - 0.1);
    ctx.lineTo(lx1, topY - 0.1);
    ctx.moveTo(lx0, topY - 0.34);
    ctx.lineTo(lx1, topY - 0.34);
    ctx.stroke();
    ctx.lineWidth = 0.05;
    for (let x = lx0 + 0.1; x < lx1; x += 0.22) {
      ctx.beginPath();
      ctx.moveTo(x, topY - 0.1);
      ctx.lineTo(x, topY - 0.34);
      ctx.stroke();
    }
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(lx0, topY - 0.1);
    ctx.lineTo(lx0, topY);
    ctx.moveTo(lx1, topY - 0.1);
    ctx.lineTo(lx1, topY);
    ctx.stroke();
  }

  // ---- chassi ----
  const cy = G.chassisTop;
  const ch = G.chassisBottom - G.chassisTop;
  rr(ctx, -L / 2, cy, L, ch, c.car === 'fusca' ? 0.38 : c.car === 'kombi' ? 0.2 : 0.14);
  ctx.fillStyle = bodyG;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  if (c.car === 'kombi') {
    // faixa branca + V do nariz
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-L / 2 + 0.08, cy + 0.32, L - 0.16, 0.14);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(L / 2 - 0.9, cy + 0.04);
    ctx.lineTo(L / 2 - 0.45, cy + 0.38);
    ctx.lineTo(L / 2 - 0.05, cy + 0.04);
    ctx.stroke();
  } else if (c.car === 'brasilia') {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-L / 2 + 0.1, cy + 0.2, L - 0.2, 0.1);
    ctx.fillStyle = '#111827';
    ctx.fillRect(-L / 2 + 0.02, cy + 0.06, 0.12, 0.3);
  } else if (c.car === 'fusca') {
    // para-lama arredondado
    ctx.strokeStyle = tc.dark;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(G.wheelX * L, G.wheelY, G.wheelR + 0.13, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-G.wheelX * L, G.wheelY, G.wheelR + 0.13, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  } else if (c.car === 'uno') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(-L / 2 + 0.05, cy + 0.42, L - 0.1, 0.1);
  }
  // farol e lanterna
  ctx.fillStyle = '#fef9c3';
  if (c.car === 'fusca' || c.car === 'kombi') circle(ctx, L / 2 - 0.2, cy + 0.2, 0.17);
  else rr(ctx, L / 2 - 0.4, cy + 0.08, 0.34, 0.2, 0.05);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  rr(ctx, -L / 2 + 0.03, cy + 0.12, 0.2, 0.22, 0.04);
  ctx.fill();
  // pára-choques
  ctx.fillStyle = '#d1d5db';
  rr(ctx, L / 2 - 0.12, cy + 0.42, 0.24, 0.16, 0.06);
  ctx.fill();
  rr(ctx, -L / 2 - 0.12, cy + 0.42, 0.24, 0.16, 0.06);
  ctx.fill();

  // rodas na frente da lataria (so a parte de baixo aparece por cima)
  ctx.save();
  ctx.beginPath();
  ctx.rect(-L, G.chassisBottom - 0.05, L * 2, 2);
  ctx.clip();
  wheel(ctx, -G.wheelX * L, G.wheelY, spin);
  wheel(ctx, G.wheelX * L, G.wheelY, spin);
  ctx.restore();

  // numero do jogador no teto (bolinha da cor do macaco)
  if (o.isLocal) {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(off, topY - 0.95);
    ctx.lineTo(off - 0.28, topY - 1.4);
    ctx.lineTo(off + 0.28, topY - 1.4);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Bola de coco

const FIBERS: { a: number; r: number; l: number }[] = [];
for (let i = 0; i < 46; i++) FIBERS.push({ a: Math.random() * 6.283, r: 0.25 + Math.random() * 0.7, l: 0.12 + Math.random() * 0.18 });

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, scale: number, glow: number): void {
  const R = BALL_R;
  ctx.save();
  ctx.translate(x, y);
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.9);
    g.addColorStop(0, `rgba(253,224,71,${0.45 * glow})`);
    g.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = g;
    circle(ctx, 0, 0, R * 1.9);
    ctx.fill();
  }
  ctx.rotate(-a);
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#a16a3a');
  g.addColorStop(0.6, '#6b4423');
  g.addColorStop(1, '#3f2a14');
  ctx.fillStyle = g;
  circle(ctx, 0, 0, R);
  ctx.fill();
  // fibras
  ctx.strokeStyle = 'rgba(30,18,8,0.7)';
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  for (const f of FIBERS) {
    const px = Math.cos(f.a) * f.r * R;
    const py = Math.sin(f.a) * f.r * R;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(f.a + 0.8) * f.l * R, py + Math.sin(f.a + 0.8) * f.l * R);
    ctx.stroke();
  }
  // carinha do coco (mostra a rotacao)
  ctx.fillStyle = '#1c1008';
  circle(ctx, -R * 0.3, -R * 0.1, R * 0.15);
  ctx.fill();
  circle(ctx, R * 0.3, -R * 0.1, R * 0.15);
  ctx.fill();
  ctx.fillStyle = '#fff';
  circle(ctx, -R * 0.26, -R * 0.14, R * 0.045);
  ctx.fill();
  circle(ctx, R * 0.34, -R * 0.14, R * 0.045);
  ctx.fill();
  ctx.strokeStyle = '#1c1008';
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.arc(0, R * 0.2, R * 0.28, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
  // contorno claro (visibilidade)
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(255,248,220,0.85)';
  ctx.lineWidth = 0.11;
  circle(ctx, 0, 0, R);
  ctx.stroke();
  ctx.restore();
  void scale;
}

// ---------------------------------------------------------------- Banana

export function drawBanana(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.1);
  ctx.quadraticCurveTo(-0.1, 0.6, 0.62, -0.25);
  ctx.quadraticCurveTo(0.1, 0.25, -0.6, -0.1);
  ctx.closePath();
  ctx.fillStyle = '#facc15';
  ctx.fill();
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0.55, -0.31, 0.12, 0.1);
  ctx.restore();
}

// ---------------------------------------------------------------- Torcida

export function drawCrowdMonkey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fur: number,
  team: 0 | 1 | 2,
  t: number,
  energy: number,
  phase: number,
): void {
  const F = FURS[fur % FURS.length];
  const bob = Math.abs(Math.sin(t * (2.2 + energy * 7) + phase)) * r * (0.2 + energy * 1.1);
  const yy = y - bob;
  const jersey = team === 2 ? '#a3e635' : TEAM_COLORS[team].main;
  ctx.fillStyle = jersey;
  ctx.beginPath();
  ctx.roundRect(x - r * 1.0, yy + r * 0.85, r * 2, r * 1.8, r * 0.5);
  ctx.fill();
  // bracos levantados na empolgacao
  if (energy > 0.08) {
    const w = Math.sin(t * 9 + phase) * r * 0.5;
    ctx.strokeStyle = F.fur;
    ctx.lineWidth = r * 0.42;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, yy + r * 1.2);
    ctx.lineTo(x - r * 1.5 - w * 0.3, yy - r * 0.6 + w);
    ctx.moveTo(x + r * 0.9, yy + r * 1.2);
    ctx.lineTo(x + r * 1.5 + w * 0.3, yy - r * 0.6 - w);
    ctx.stroke();
  }
  ctx.fillStyle = F.fur;
  circle(ctx, x - r * 0.95, yy, r * 0.38);
  ctx.fill();
  circle(ctx, x + r * 0.95, yy, r * 0.38);
  ctx.fill();
  circle(ctx, x, yy, r);
  ctx.fill();
  ctx.fillStyle = F.face;
  ctx.beginPath();
  ctx.ellipse(x, yy + r * 0.32, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  circle(ctx, x - r * 0.3, yy + r * 0.05, r * 0.12);
  ctx.fill();
  circle(ctx, x + r * 0.3, yy + r * 0.05, r * 0.12);
  ctx.fill();
  if (energy > 0.25) {
    ctx.fillStyle = '#4c0519';
    ctx.beginPath();
    ctx.ellipse(x, yy + r * 0.62, r * 0.25, r * (0.12 + energy * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = F.dark;
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.arc(x, yy + r * 0.45, r * 0.2, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

export const ARENA_RECT = { x0: -ARENA.HW, x1: ARENA.HW, y0: 0, y1: ARENA.H };
