/**
 * monkeylook.ts — personagens de "Símio City: Prefeitura do Caos":
 * gorila gigante de pelúcia, prefeito macaco, motoristas, estátua dourada.
 * Somente visual; nenhuma lógica de cidade, rede ou grade é tocada aqui.
 */
import {
  HANDS,
  drawMonkey,
  drawMonkeyHead,
  makeFace,
  makeFurStyle,
  mixColor,
  rgba,
  type FurStyle,
  type HandPos,
  type Mood,
} from './monkeyart';

type Ctx = CanvasRenderingContext2D;

export const GORILLA_STYLE: FurStyle = makeFurStyle('#7c3aed', '#ddd6fe', { outline: '#1e0b45' });
export const MAYOR_STYLE: FurStyle = makeFurStyle('#9a5b2e', '#f6d3a8');
export const GOLD_STYLE: FurStyle = makeFurStyle('#f0b429', '#fde68a', { outline: '#6b3a06' });
const RUST_STYLE: FurStyle = makeFurStyle('#8a8f98', '#d6dbe3', { outline: '#232830' });

const DRIVER_FUR: Array<[string, string]> = [
  ['#92400e', '#fde68a'],
  ['#c2410c', '#fed7aa'],
  ['#374151', '#d1d5db'],
  ['#b45309', '#fef3c7'],
  ['#db2777', '#fbcfe8'],
];

export function driverStyle(id: number): FurStyle {
  const p = DRIVER_FUR[Math.abs(id) % DRIVER_FUR.length];
  return makeFurStyle(p[0], p[1]);
}

function limbPath(
  ctx: Ctx,
  style: FurStyle,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  thick: number,
  outlinePx: number,
): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = thick + outlinePx * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, style.furLight);
  g.addColorStop(1, style.furDark);
  ctx.strokeStyle = g;
  ctx.lineWidth = thick;
  ctx.stroke();
}

/**
 * Gorila gigante de pelúcia. Origem = chão sob o gorila.
 * `stomp` 0..12 (altura do pulo da pisada); `t` em segundos.
 */
export function drawPlushGorilla(ctx: Ctx, t: number, stomp: number): void {
  const st = GORILLA_STYLE;
  const op = 2.6;
  const roarK = Math.max(0, Math.sin(t * 6)); // pico = chão (pisada)
  const lift = stomp;

  ctx.save();
  ctx.lineJoin = 'round';

  // pernas
  for (const side of [-1, 1]) {
    const fx = side * 15;
    ctx.fillStyle = st.furDark;
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = op;
    ctx.beginPath();
    ctx.ellipse(fx, -6 - (side > 0 ? lift * 0.4 : 0), 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.ellipse(fx + side * 2, -1 - (side > 0 ? lift * 0.4 : 0), 13, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.translate(0, -lift * 0.35);

  // tronco
  const tg = ctx.createRadialGradient(-10, -46, 4, 0, -30, 40);
  tg.addColorStop(0, st.furLight);
  tg.addColorStop(0.55, st.fur);
  tg.addColorStop(1, st.furDark);
  ctx.fillStyle = tg;
  ctx.strokeStyle = st.outline;
  ctx.lineWidth = op;
  ctx.beginPath();
  ctx.ellipse(0, -30, 29, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // peitoral + pontos de costura (é de pelúcia!)
  const pg = ctx.createRadialGradient(0, -30, 2, 0, -26, 20);
  pg.addColorStop(0, st.maskLight);
  pg.addColorStop(1, st.mask);
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.ellipse(0, -26, 17.5, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(st.outline, 0.7);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.lineTo(0, -8);
  ctx.stroke();
  ctx.setLineDash([]);

  // braços: batendo no peito alternadamente
  const beatL = Math.max(0, Math.sin(t * 9));
  const beatR = Math.max(0, -Math.sin(t * 9));
  const hands: Array<[number, number, number]> = [
    [-1, beatL, 0],
    [1, beatR, 0],
  ];
  const handPos: Array<{ x: number; y: number }> = [];
  for (const [side, beat] of hands) {
    const sx = side * 25;
    const sy = -48;
    const downX = side * 40;
    const downY = -9 + Math.sin(t * 6 + side) * 3;
    const chestX = side * 8;
    const chestY = -30;
    const hx = downX + (chestX - downX) * beat;
    const hy = downY + (chestY - downY) * beat;
    handPos.push({ x: hx, y: hy });
    limbPath(ctx, st, sx, sy, side * 41, (sy + hy) / 2 - 2, hx, hy, 15, op);
  }
  for (const h of handPos) {
    const hg = ctx.createRadialGradient(h.x - 2, h.y - 2, 1, h.x, h.y, 10);
    hg.addColorStop(0, st.maskLight);
    hg.addColorStop(1, st.skin);
    ctx.fillStyle = hg;
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = op;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // cabeça (pequena e rabugenta, enterrada nos ombros)
  ctx.save();
  ctx.translate(0, -58);
  const mood: Mood = roarK > 0.55 ? 'shouting' : 'angry';
  drawMonkeyHead(ctx, {
    style: st,
    face: makeFace(mood, t, 1.3, { x: Math.sin(t * 1.3) * 0.5, y: 0 }, { blink: 0 }),
    radius: 17,
    tilt: Math.sin(t * 6) * 0.06,
    earFlop: Math.sin(t * 6) * 0.3,
    outlinePx: 2.4,
    lite: false,
  });
  ctx.restore();

  ctx.restore();
}

/** Prefeito macaco acenando (pés na origem). */
export function drawMayor(ctx: Ctx, t: number, damaged: boolean): void {
  const wave = Math.sin(t * 7) * 0.3;
  const hat = (c: Ctx, lw: number): void => {
    c.beginPath();
    c.ellipse(0, -0.92, 0.95, 0.2, 0, 0, Math.PI * 2);
    c.fillStyle = '#111827';
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = lw;
    c.stroke();
    c.beginPath();
    c.roundRect(-0.55, -1.9, 1.1, 1.05, 0.12);
    c.fill();
    c.stroke();
    c.fillStyle = '#ef4444';
    c.fillRect(-0.55, -1.2, 1.1, 0.2);
  };
  const sash = (c: Ctx): void => {
    c.strokeStyle = '#16a34a';
    c.lineWidth = 0.28;
    c.lineCap = 'butt';
    c.beginPath();
    c.moveTo(-0.55, -1.85);
    c.lineTo(0.55, -0.6);
    c.stroke();
    c.fillStyle = '#facc15';
    c.beginPath();
    c.arc(0.25, -1.2, 0.14, 0, Math.PI * 2);
    c.fill();
  };
  drawMonkey(ctx, {
    style: MAYOR_STYLE,
    face: makeFace(damaged ? 'scared' : 'happy', t, 2.2, { x: 0.3, y: 0.1 }),
    height: 27,
    turn: 0.3,
    breathe: Math.sin(t * 2.2),
    tailPhase: t * 3,
    tailAmp: 0.4,
    tailSide: -1,
    earFlop: wave * 0.3,
    armR: damaged ? HANDS.up(1, t * 20) : { x: 1.2 + wave * 0.4, y: -2.9 + Math.abs(wave) * 0.3 },
    tuft: false,
    accessory: hat,
    bodyAccessory: sash,
    outlinePx: 1.6,
  });
}

/** Cabeça de motorista/passageiro espiando pela janela. Origem = centro da cabeça. */
export function drawDriverHead(
  ctx: Ctx,
  t: number,
  id: number,
  radius: number,
  dirX: number,
  mood: Mood = 'happy',
  accessory?: (c: Ctx, lw: number) => void,
): void {
  drawMonkeyHead(ctx, {
    style: driverStyle(id),
    face: makeFace(mood, t, id * 1.3, { x: dirX, y: 0.1 }),
    radius,
    turn: dirX * 0.6,
    tilt: Math.sin(t * 9 + id) * 0.07,
    earFlop: Math.sin(t * 8 + id) * 0.3,
    outlinePx: 1.2,
    accessory,
  });
}

/** Óculos escuros simples para motoristas descolados. */
export function shadesAccessory(c: Ctx, lw: number): void {
  c.fillStyle = '#0b1220';
  c.strokeStyle = '#000';
  c.lineWidth = lw;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.roundRect(s * 0.34 - 0.27 + 0.02, -0.2, 0.54, 0.34, 0.12);
    c.fill();
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillRect(-0.5, -0.14, 0.18, 0.05);
}

/** Boné do motorista da caminhonete. */
export function capAccessory(c: Ctx, lw: number): void {
  c.beginPath();
  c.moveTo(-1.02, -0.36);
  c.bezierCurveTo(-1.12, -1.38, 1.12, -1.38, 1.02, -0.36);
  c.quadraticCurveTo(0, -0.55, -1.02, -0.36);
  c.closePath();
  c.fillStyle = '#16a34a';
  c.fill();
  c.strokeStyle = '#052e16';
  c.lineWidth = lw * 1.3;
  c.stroke();
  c.beginPath();
  c.ellipse(0.7, -0.4, 0.75, 0.16, 0.05, 0, Math.PI * 2);
  c.fillStyle = '#14532d';
  c.fill();
  c.stroke();
}

/** Fones de DJ do trio elétrico. */
export function djPhonesAccessory(c: Ctx, lw: number): void {
  c.strokeStyle = '#111827';
  c.lineWidth = 0.2;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(0, -0.05, 1.12, Math.PI * 1.05, Math.PI * 1.95);
  c.stroke();
  for (const s of [-1, 1]) {
    c.beginPath();
    c.roundRect(s * 1.12 - 0.17, -0.3, 0.34, 0.62, 0.12);
    c.fillStyle = '#ec4899';
    c.fill();
    c.strokeStyle = '#500724';
    c.lineWidth = lw;
    c.stroke();
  }
}

/** Estátua dourada do macaco (praça). Pés na origem. */
export function drawStatue(ctx: Ctx, t: number, damaged: boolean): void {
  const glint = 0.5 + 0.5 * Math.sin(t * 2.4);
  drawMonkey(ctx, {
    style: damaged ? RUST_STYLE : GOLD_STYLE,
    face: makeFace(damaged ? 'sad' : 'smug', t, 4, { x: 0, y: 0 }, { blink: 0 }),
    height: 25,
    turn: 0,
    breathe: 0,
    tailPhase: 0,
    tailAmp: 0,
    tailSide: -1,
    armL: HANDS.cheer(-1, 0) as HandPos,
    armR: { x: 0.95, y: -1.0 },
    tuft: false,
    noLegs: false,
    accessory: (c, lw): void => {
      // careca reluzente
      c.fillStyle = `rgba(255,255,255,${0.55 + glint * 0.4})`;
      c.beginPath();
      c.ellipse(-0.3, -0.74, 0.3, 0.11, -0.55, 0, Math.PI * 2);
      c.fill();
      void lw;
    },
    outlinePx: 1.5,
  });
}

/** Mini-cabeça para cursores remotos / UI (cor do jogador vira a pelagem). */
export function drawCursorMonkey(ctx: Ctx, t: number, color: string, radius: number): void {
  drawMonkeyHead(ctx, {
    style: makeFurStyle(mixColor(color, '#6b3f1d', 0.45), '#f7dcb8'),
    face: makeFace('happy', t, 5),
    radius,
    outlinePx: 1.2,
    lite: radius < 9,
  });
}

/** Retrato do prefeito (tela inicial) → data URL, usa o mesmo pintor do jogo. */
export function renderMayorPortrait(size = 170): string {
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = size * dpr;
  cv.height = size * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.scale(dpr, dpr);
  ctx.translate(size * 0.5, size * 0.96);
  const hat = (c: Ctx, lw: number): void => {
    c.beginPath();
    c.ellipse(0, -0.92, 0.95, 0.2, 0, 0, Math.PI * 2);
    c.fillStyle = '#111827';
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = lw;
    c.stroke();
    c.beginPath();
    c.roundRect(-0.55, -1.9, 1.1, 1.05, 0.12);
    c.fill();
    c.stroke();
    c.fillStyle = '#ef4444';
    c.fillRect(-0.55, -1.2, 1.1, 0.2);
  };
  drawMonkey(ctx, {
    style: MAYOR_STYLE,
    face: makeFace('cheer', 0.4, 2),
    height: size * 0.86,
    turn: 0.1,
    tailSide: -1,
    tailPhase: 1.2,
    tailAmp: 0.4,
    armL: HANDS.cheer(-1, 0.4),
    armR: HANDS.cheer(1, 0.4),
    tuft: false,
    accessory: hat,
    bodyAccessory: (c): void => {
      c.strokeStyle = '#16a34a';
      c.lineWidth = 0.28;
      c.beginPath();
      c.moveTo(-0.55, -1.85);
      c.lineTo(0.55, -0.6);
      c.stroke();
      c.fillStyle = '#facc15';
      c.beginPath();
      c.arc(0.25, -1.2, 0.14, 0, Math.PI * 2);
      c.fill();
    },
    outlinePx: 3,
  });
  return cv.toDataURL('image/png');
}
