/**
 * monkeyart.ts — pintor procedural de macacos (Canvas 2D).
 *
 * Silhueta chibi: cabeça enorme, máscara facial em formato de coração/amendoim,
 * orelhas com miolo rosado, rabo curvado, mãos e pés. Tudo desenhado em "unidades
 * de cabeça" (raio da cabeça = 1) para escalar limpo em qualquer jogo.
 * Somente visual: nenhuma função aqui toca em física, hitbox ou rede.
 */

// ───────────────────────────── cores ─────────────────────────────

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [120, 80, 50];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c: RGB): string {
  return (
    '#' +
    c
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Mistura a→b (t=0 → a, t=1 → b). */
export function mixColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ───────────────────────────── estilo ─────────────────────────────

export interface FurStyle {
  fur: string;
  furLight: string;
  furDark: string;
  furDeep: string;
  mask: string;
  maskLight: string;
  maskShade: string;
  skin: string;
  earInner: string;
  outline: string;
}

const styleCache = new Map<string, FurStyle>();

/** Deriva toda a paleta (luz/sombra/contorno) a partir de pelo + máscara. */
export function makeFurStyle(
  fur: string,
  mask: string,
  opts: { outline?: string; earInner?: string } = {},
): FurStyle {
  const key = `${fur}|${mask}|${opts.outline ?? ''}|${opts.earInner ?? ''}`;
  const hit = styleCache.get(key);
  if (hit) return hit;
  const st: FurStyle = {
    fur,
    furLight: mixColor(fur, '#ffffff', 0.26),
    furDark: mixColor(fur, '#1a0c05', 0.34),
    furDeep: mixColor(fur, '#1a0c05', 0.58),
    mask,
    maskLight: mixColor(mask, '#ffffff', 0.38),
    maskShade: mixColor(mask, fur, 0.3),
    skin: mixColor(mask, fur, 0.42),
    earInner: opts.earInner ?? mixColor('#f9a8c0', mask, 0.22),
    outline: opts.outline ?? mixColor(fur, '#150a04', 0.82),
  };
  styleCache.set(key, st);
  return st;
}

// ───────────────────────────── rosto ─────────────────────────────

export type EyeStyle = 'open' | 'closed' | 'happy' | 'x' | 'spiral';

export interface Face {
  /** direção do olhar, -1..1 */
  lookX: number;
  lookY: number;
  /** 0 aberto → 1 fechado */
  blink: number;
  /** -1 triste … 0 neutro … 1 sorrisão */
  smile: number;
  /** 0 fechada … 1 escancarada */
  mouthOpen: number;
  /** -1 bravo … 0 neutro … 1 preocupado (parte interna da sobrancelha sobe) */
  brow: number;
  /** 0..1 sobrancelhas levantadas */
  browLift: number;
  /** 0..1 olhos arregalados (pupila encolhe) */
  wide: number;
  /** 0..1 pálpebra caída */
  lid: number;
  eyeStyle: EyeStyle;
  blush: number;
  teeth: boolean;
  tongue: boolean;
  sweat: boolean;
  /** tempo (s) — só para o espiral de tontura */
  time: number;
}

export type Mood =
  | 'neutral'
  | 'happy'
  | 'cheer'
  | 'scared'
  | 'angry'
  | 'sad'
  | 'eating'
  | 'sleeping'
  | 'shouting'
  | 'dizzy'
  | 'focus'
  | 'smug'
  | 'embarrassed';

/** 0..1: pisca periodicamente, fase diferente para cada macaco (seed). */
export function blinkAmount(t: number, seed = 0): number {
  const period = 3.1 + ((seed * 1.37) % 1.7);
  const ph = (t + seed * 2.13) % period;
  const d = 0.17;
  if (ph > d) return 0;
  return Math.sin((ph / d) * Math.PI);
}

export function makeFace(
  mood: Mood,
  t: number,
  seed = 0,
  look: { x?: number; y?: number } = {},
  over: Partial<Face> = {},
): Face {
  const f: Face = {
    lookX: look.x ?? 0,
    lookY: look.y ?? 0,
    blink: blinkAmount(t, seed),
    smile: 0.3,
    mouthOpen: 0,
    brow: 0,
    browLift: 0,
    wide: 0,
    lid: 0,
    eyeStyle: 'open',
    blush: 0,
    teeth: false,
    tongue: false,
    sweat: false,
    time: t,
  };
  switch (mood) {
    case 'happy':
      f.smile = 0.85;
      f.browLift = 0.35;
      f.mouthOpen = 0.18;
      break;
    case 'cheer':
      f.eyeStyle = 'happy';
      f.smile = 1;
      f.mouthOpen = 0.75;
      f.browLift = 0.6;
      f.blush = 0.5;
      f.tongue = true;
      break;
    case 'scared':
      f.wide = 1;
      f.smile = -0.35;
      f.mouthOpen = 0.55 + Math.sin(t * 30 + seed) * 0.06;
      f.brow = 0.95;
      f.browLift = 0.8;
      f.sweat = true;
      f.lookX += Math.sin(t * 17 + seed) * 0.35;
      break;
    case 'angry':
      f.brow = -1;
      f.smile = -0.55;
      f.mouthOpen = 0.35;
      f.teeth = true;
      f.lid = 0.3;
      f.blink = 0;
      break;
    case 'sad':
      f.smile = -0.85;
      f.brow = 0.85;
      f.lid = 0.25;
      break;
    case 'eating':
      f.smile = 0.55;
      f.mouthOpen = 0.12 + (Math.sin(t * 13 + seed) * 0.5 + 0.5) * 0.55;
      f.blush = 0.2;
      f.browLift = 0.15;
      break;
    case 'sleeping':
      f.eyeStyle = 'closed';
      f.smile = 0.3;
      f.mouthOpen = 0.12 + (Math.sin(t * 2 + seed) * 0.5 + 0.5) * 0.1;
      f.blink = 0;
      break;
    case 'shouting':
      f.mouthOpen = 0.95;
      f.smile = 0.15;
      f.brow = -0.45;
      f.browLift = 0.3;
      f.wide = 0.35;
      f.teeth = true;
      f.tongue = true;
      break;
    case 'dizzy':
      f.eyeStyle = 'spiral';
      f.smile = 0.1;
      f.mouthOpen = 0.35;
      f.tongue = true;
      f.blink = 0;
      break;
    case 'focus':
      f.lid = 0.22;
      f.brow = -0.35;
      f.smile = 0.1;
      break;
    case 'smug':
      f.lid = 0.4;
      f.smile = 0.8;
      f.browLift = 0.2;
      break;
    case 'embarrassed':
      f.smile = 0.25;
      f.blush = 1;
      f.brow = 0.55;
      f.sweat = true;
      f.lookY += 0.4;
      break;
    default:
      break;
  }
  return Object.assign(f, over);
}

function heartMaskPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, -0.04);
  ctx.bezierCurveTo(-0.14, -0.44, -0.8, -0.46, -0.79, -0.05);
  ctx.bezierCurveTo(-0.78, 0.2, -0.66, 0.38, -0.54, 0.56);
  ctx.bezierCurveTo(-0.38, 0.84, 0.38, 0.84, 0.54, 0.56);
  ctx.bezierCurveTo(0.66, 0.38, 0.78, 0.2, 0.79, -0.05);
  ctx.bezierCurveTo(0.8, -0.46, 0.14, -0.44, 0, -0.04);
  ctx.closePath();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  st: FurStyle,
  f: Face,
  side: number,
  lw: number,
  lite: boolean,
): void {
  const ex = side * 0.33;
  const ey = -0.1;
  ctx.save();
  ctx.translate(ex, ey);

  const style = f.eyeStyle;
  if (style === 'happy' || style === 'closed' || (style === 'open' && f.blink > 0.82)) {
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (style === 'happy') {
      ctx.moveTo(-0.17, 0.05);
      ctx.quadraticCurveTo(0, -0.22, 0.17, 0.05);
    } else {
      ctx.moveTo(-0.17, -0.03);
      ctx.quadraticCurveTo(0, 0.12, 0.17, -0.03);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (style === 'x') {
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.13, -0.13);
    ctx.lineTo(0.13, 0.13);
    ctx.moveTo(0.13, -0.13);
    ctx.lineTo(-0.13, 0.13);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const wide = f.wide;
  const rx = 0.21 * (1 + wide * 0.22);
  const ry = 0.245 * (1 + wide * 0.22) * (1 - f.blink * 0.78);

  // esclera
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = st.outline;
  ctx.lineWidth = lw * 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (style === 'spiral') {
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const dir = side;
    for (let i = 0; i <= 26; i++) {
      const a = i * 0.5 + f.time * 9 * dir;
      const rad = 0.015 + i * 0.0072;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // pupila
  const pr = 0.118 - wide * 0.04;
  const maxOff = Math.max(0.02, rx - pr - 0.015);
  const px = clamp(f.lookX, -1, 1) * maxOff;
  const py = clamp(f.lookY, -1, 1) * Math.max(0.02, ry - pr - 0.01);
  ctx.fillStyle = '#1a100c';
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  // íris castanha sutil
  if (!lite) {
    ctx.fillStyle = 'rgba(120,64,24,0.55)';
    ctx.beginPath();
    ctx.arc(px, py + pr * 0.38, pr * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
  // brilhos
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px - pr * 0.34, py - pr * 0.38, pr * 0.4, 0, Math.PI * 2);
  ctx.fill();
  if (!lite) {
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(px + pr * 0.38, py + pr * 0.42, pr * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // pálpebra caída
  if (f.lid > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const lidY = -ry + f.lid * ry * 2;
    ctx.fillStyle = st.maskShade;
    ctx.fillRect(-rx - 0.05, -ry - 0.1, rx * 2 + 0.1, lidY + ry + 0.1);
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.moveTo(-rx - 0.05, lidY);
    ctx.lineTo(rx + 0.05, lidY);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  st: FurStyle,
  f: Face,
  lw: number,
): void {
  const my = 0.54;
  const w = 0.25 + Math.max(0, f.smile) * 0.05 + f.mouthOpen * 0.03;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (f.mouthOpen > 0.07) {
    const open = f.mouthOpen;
    const sm = f.smile;
    ctx.beginPath();
    ctx.moveTo(-w, my - 0.02 - sm * 0.02);
    ctx.quadraticCurveTo(0, my - 0.01 + sm * 0.06 - (sm < 0 ? open * 0.04 : 0), w, my - 0.02 - sm * 0.02);
    ctx.quadraticCurveTo(w * 0.95, my + 0.02 + open * 0.34 + sm * 0.1, 0, my + 0.04 + open * 0.34 + sm * 0.1);
    ctx.quadraticCurveTo(-w * 0.95, my + 0.02 + open * 0.34 + sm * 0.1, -w, my - 0.02 - sm * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#5a1620';
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (f.teeth) {
      ctx.fillStyle = '#fffdf5';
      ctx.fillRect(-w, my - 0.04, w * 2, 0.07 + open * 0.03);
    }
    if (f.tongue || open > 0.45) {
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(0, my + 0.1 + open * 0.3, w * 0.62, 0.1 + open * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
  } else {
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 1.15;
    ctx.beginPath();
    ctx.moveTo(-w, my - f.smile * 0.03);
    ctx.quadraticCurveTo(0, my + f.smile * 0.2, w, my - f.smile * 0.03);
    ctx.stroke();
  }
}

function drawBrows(
  ctx: CanvasRenderingContext2D,
  st: FurStyle,
  f: Face,
  lw: number,
): void {
  const by = -0.5 - f.browLift * 0.12 - f.wide * 0.05;
  const k = f.brow;
  if (Math.abs(k) < 0.04 && f.browLift < 0.05) return;
  ctx.strokeStyle = st.furDeep;
  ctx.lineWidth = lw * 1.9;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const innerX = side * 0.12;
    const outerX = side * 0.52;
    const innerY = by - k * 0.13;
    const outerY = by + k * 0.07;
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.quadraticCurveTo((innerX + outerX) / 2, Math.min(innerY, outerY) - 0.05 - f.browLift * 0.03, outerX, outerY);
    ctx.stroke();
  }
}

// ───────────────────────────── cabeça ─────────────────────────────

export interface HeadOpts {
  style: FurStyle;
  face: Face;
  lw: number;
  turn: number;
  lite: boolean;
  earFlop: number;
  tuft: boolean;
  accessory?: (ctx: CanvasRenderingContext2D, lw: number) => void;
  /** desenhado ANTES da cabeça (ex.: aba traseira do chapéu) */
  accessoryBack?: (ctx: CanvasRenderingContext2D, lw: number) => void;
}

/** Cabeça completa, centrada na origem, raio 1. */
export function drawHead(ctx: CanvasRenderingContext2D, o: HeadOpts): void {
  const { style: st, face: f, lw, turn, lite } = o;
  ctx.lineJoin = 'round';

  // orelhas
  for (const side of [-1, 1]) {
    const flop = o.earFlop * side;
    const ex = side * (1.0 + turn * 0.05 * side);
    const ey = -0.1 + Math.max(0, flop) * 0.14 + Math.min(0, flop) * 0.06;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(side * o.earFlop * 0.28);
    ctx.fillStyle = lite
      ? st.fur
      : (() => {
          const g = ctx.createRadialGradient(-0.1 * side, -0.14, 0.04, 0, 0, 0.46);
          g.addColorStop(0, st.furLight);
          g.addColorStop(0.6, st.fur);
          g.addColorStop(1, st.furDark);
          return g;
        })();
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(0, 0, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = st.earInner;
    ctx.beginPath();
    ctx.ellipse(-side * 0.02, 0.01, 0.23 * (1 - Math.abs(o.earFlop) * 0.2), 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!lite) {
      ctx.strokeStyle = rgba(st.outline, 0.35);
      ctx.lineWidth = lw * 0.55;
      ctx.beginPath();
      ctx.arc(-side * 0.02, 0.03, 0.15, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (o.accessoryBack) o.accessoryBack(ctx, lw);

  // crânio
  ctx.fillStyle = lite
    ? st.fur
    : (() => {
        const g = ctx.createRadialGradient(-0.38, -0.5, 0.08, 0, 0, 1.18);
        g.addColorStop(0, st.furLight);
        g.addColorStop(0.5, st.fur);
        g.addColorStop(1, st.furDark);
        return g;
      })();
  ctx.strokeStyle = st.outline;
  ctx.lineWidth = lw * 1.15;
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.05, 0.98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // topete
  if (o.tuft && !lite) {
    ctx.strokeStyle = st.furDark;
    ctx.lineWidth = lw * 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.96);
    ctx.quadraticCurveTo(-0.22, -1.2, -0.06, -1.28);
    ctx.moveTo(0.04, -0.97);
    ctx.quadraticCurveTo(0.02, -1.22, 0.2, -1.3);
    ctx.moveTo(0.14, -0.94);
    ctx.quadraticCurveTo(0.3, -1.1, 0.4, -1.12);
    ctx.stroke();
  }

  // grupo do rosto (gira um pouquinho para o lado que está olhando)
  ctx.save();
  ctx.translate(turn * 0.14, 0.06);

  heartMaskPath(ctx);
  if (lite) {
    ctx.fillStyle = st.mask;
  } else {
    const g = ctx.createRadialGradient(0, 0.18, 0.05, 0, 0.18, 0.95);
    g.addColorStop(0, st.maskLight);
    g.addColorStop(0.55, st.mask);
    g.addColorStop(1, st.maskShade);
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.strokeStyle = rgba(st.outline, 0.3);
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();

  if (f.blush > 0.02) {
    ctx.fillStyle = `rgba(244,114,150,${0.5 * f.blush})`;
    ctx.beginPath();
    ctx.ellipse(-0.52, 0.32, 0.17, 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(0.52, 0.32, 0.17, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // narinas
  ctx.fillStyle = rgba(st.outline, 0.85);
  ctx.beginPath();
  ctx.ellipse(-0.085, 0.33, 0.032, 0.026, 0, 0, Math.PI * 2);
  ctx.ellipse(0.085, 0.33, 0.032, 0.026, 0, 0, Math.PI * 2);
  ctx.fill();

  drawEye(ctx, st, f, -1, lw, lite);
  drawEye(ctx, st, f, 1, lw, lite);
  if (!lite) drawBrows(ctx, st, f, lw);
  drawMouth(ctx, st, f, lw);

  if (f.sweat) {
    ctx.fillStyle = '#7dd3fc';
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.moveTo(0.78, -0.55);
    ctx.quadraticCurveTo(0.95, -0.32, 0.78, -0.2);
    ctx.quadraticCurveTo(0.6, -0.32, 0.78, -0.55);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // brilho do crânio
  if (!lite) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-0.42, -0.68, 0.3, 0.13, -0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  if (o.accessory) o.accessory(ctx, lw);
}

// ───────────────────────────── corpo inteiro ─────────────────────────────

export interface HandPos {
  /** posição da mão em unidades de cabeça; pés em y=0, topo da cabeça ≈ -3.45 */
  x: number;
  y: number;
}

export interface MonkeyOpts {
  style: FurStyle;
  face: Face;
  /** altura do pé ao topo da cabeça, em px */
  height: number;
  /** -1..1 virar o rosto (1 = direita) */
  turn?: number;
  squashX?: number;
  squashY?: number;
  /** seno de respiração -1..1 */
  breathe?: number;
  /** fase do ciclo de caminhada (rad) e amplitude 0..1 */
  walk?: number;
  walkAmp?: number;
  tailPhase?: number;
  tailAmp?: number;
  /** lado do rabo: -1 esquerda, 1 direita */
  tailSide?: number;
  earFlop?: number;
  headTilt?: number;
  lean?: number;
  armL?: HandPos | null;
  armR?: HandPos | null;
  tuft?: boolean;
  lite?: boolean;
  outlinePx?: number;
  accessory?: (ctx: CanvasRenderingContext2D, lw: number) => void;
  accessoryBack?: (ctx: CanvasRenderingContext2D, lw: number) => void;
  /** desenhado sobre o tronco, antes dos braços (avental, camiseta…) */
  bodyAccessory?: (ctx: CanvasRenderingContext2D, lw: number) => void;
  /** esconde pernas/pés (ex.: sentado atrás de uma bancada) */
  noLegs?: boolean;
}

export const FIGURE_HEIGHT_UNITS = 3.45;

const SHOULDER_Y = -1.75;
const SHOULDER_X = 0.62;

function limb(
  ctx: CanvasRenderingContext2D,
  st: FurStyle,
  lw: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  thick: number,
): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = st.outline;
  ctx.lineWidth = thick + lw * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = st.fur;
  ctx.lineWidth = thick;
  ctx.stroke();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  st: FurStyle,
  lw: number,
  side: number,
  hand: HandPos,
  lite: boolean,
): void {
  const sx = side * SHOULDER_X;
  const sy = SHOULDER_Y;
  const mx = (sx + hand.x) / 2;
  const my = (sy + hand.y) / 2;
  limb(ctx, st, lw, sx, sy, mx + side * 0.2, my + 0.08, hand.x, hand.y, 0.34);
  // mão
  ctx.fillStyle = lite ? st.skin : st.skin;
  ctx.strokeStyle = st.outline;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 0.21, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!lite) {
    ctx.strokeStyle = rgba(st.outline, 0.4);
    ctx.lineWidth = lw * 0.55;
    ctx.beginPath();
    ctx.moveTo(hand.x - 0.04, hand.y + 0.05);
    ctx.lineTo(hand.x - 0.04, hand.y + 0.19);
    ctx.moveTo(hand.x + 0.06, hand.y + 0.05);
    ctx.lineTo(hand.x + 0.06, hand.y + 0.19);
    ctx.stroke();
  }
}

/**
 * Desenha o macaco com os pés na origem (0,0), em pé, de frente (3/4 via `turn`).
 * O chamador faz translate/rotate para posicionar; sombra é por conta do chamador.
 */
export function drawMonkey(ctx: CanvasRenderingContext2D, o: MonkeyOpts): void {
  const u = o.height / FIGURE_HEIGHT_UNITS;
  const lw = Math.max(0.06, (o.outlinePx ?? 2) / u);
  const st = o.style;
  const lite = o.lite ?? u < 6;
  const turn = clamp(o.turn ?? 0, -1, 1);
  const walk = o.walk ?? 0;
  const walkAmp = o.walkAmp ?? 0;
  const breathe = o.breathe ?? 0;
  const tailSide = o.tailSide ?? (turn >= 0 ? -1 : 1);
  const bob = -Math.abs(Math.sin(walk)) * 0.14 * walkAmp + breathe * 0.022;
  const step = Math.sin(walk) * walkAmp;

  ctx.save();
  ctx.scale(u * (o.squashX ?? 1), u * (o.squashY ?? 1));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ── rabo (atrás de tudo) ──
  {
    const w = Math.sin(o.tailPhase ?? 0) * (o.tailAmp ?? 0.35);
    const s = tailSide;
    const sway = w + walkAmp * Math.sin(walk * 1) * 0.15;
    ctx.beginPath();
    ctx.moveTo(s * 0.45, -0.55 + bob);
    ctx.bezierCurveTo(s * 1.3, -0.05 + sway * 0.2, s * 2.0, -0.7 + sway * 0.5, s * 1.78 + sway * 0.35, -1.5 + sway * 0.2);
    ctx.bezierCurveTo(s * 1.7 + sway * 0.3, -1.82, s * 1.35 + sway * 0.3, -1.9, s * 1.3 + sway * 0.3, -1.62);
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = 0.3 + lw * 2;
    ctx.stroke();
    ctx.strokeStyle = st.furDark;
    ctx.lineWidth = 0.3;
    ctx.stroke();
    if (!lite) {
      ctx.strokeStyle = st.fur;
      ctx.lineWidth = 0.14;
      ctx.stroke();
    }
  }

  // ── pernas e pés ──
  if (!o.noLegs) {
    for (const side of [-1, 1]) {
      const ph = side > 0 ? step : -step;
      const lift = Math.max(0, ph) * 0.24;
      const fx = side * 0.44 + ph * 0.07;
      const fy = -0.18 - lift;
      limb(ctx, st, lw, side * 0.42, -0.85, side * 0.46, -0.5, fx, fy - 0.06, 0.36);
      ctx.fillStyle = st.skin;
      ctx.strokeStyle = st.outline;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(fx + side * 0.04, fy, 0.37, 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!lite) {
        ctx.strokeStyle = rgba(st.outline, 0.4);
        ctx.lineWidth = lw * 0.55;
        ctx.beginPath();
        ctx.moveTo(fx + side * 0.2, fy - 0.1);
        ctx.lineTo(fx + side * 0.24, fy + 0.1);
        ctx.moveTo(fx + side * 0.06, fy - 0.12);
        ctx.lineTo(fx + side * 0.1, fy + 0.12);
        ctx.stroke();
      }
    }
  }

  // ── tronco + cabeça (com lean/bob) ──
  ctx.save();
  ctx.translate(0, bob);
  if (o.lean) {
    ctx.translate(0, -0.6);
    ctx.rotate(o.lean);
    ctx.translate(0, 0.6);
  }

  // tronco
  {
    const breatheSy = 1 + breathe * 0.025;
    ctx.save();
    ctx.translate(0, -1.15);
    ctx.scale(1, breatheSy);
    ctx.fillStyle = lite
      ? st.fur
      : (() => {
          const g = ctx.createRadialGradient(-0.28, -0.4, 0.08, 0, 0, 1.0);
          g.addColorStop(0, st.furLight);
          g.addColorStop(0.5, st.fur);
          g.addColorStop(1, st.furDark);
          return g;
        })();
    ctx.strokeStyle = st.outline;
    ctx.lineWidth = lw * 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.74, 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // barriga
    ctx.fillStyle = lite
      ? st.mask
      : (() => {
          const g = ctx.createRadialGradient(0, 0.02, 0.04, 0, 0.05, 0.55);
          g.addColorStop(0, st.maskLight);
          g.addColorStop(0.6, st.mask);
          g.addColorStop(1, st.maskShade);
          return g;
        })();
    ctx.beginPath();
    ctx.ellipse(0, 0.1, 0.46, 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (o.bodyAccessory) o.bodyAccessory(ctx, lw);

  // braços (mãos abaixo do ombro → antes da cabeça)
  const swing = walkAmp * Math.sin(walk) * 0.32;
  const armL: HandPos = o.armL ?? { x: -0.96 - Math.abs(swing) * 0.05, y: -0.82 + swing };
  const armR: HandPos = o.armR ?? { x: 0.96 + Math.abs(swing) * 0.05, y: -0.82 - swing };
  const frontL = armL.y < SHOULDER_Y + 0.05;
  const frontR = armR.y < SHOULDER_Y + 0.05;
  if (!frontL) drawArm(ctx, st, lw, -1, armL, lite);
  if (!frontR) drawArm(ctx, st, lw, 1, armR, lite);

  // cabeça
  ctx.save();
  ctx.translate(turn * 0.05, -2.45 + breathe * 0.02);
  ctx.rotate(o.headTilt ?? 0);
  drawHead(ctx, {
    style: st,
    face: o.face,
    lw,
    turn,
    lite,
    earFlop: o.earFlop ?? 0,
    tuft: o.tuft ?? true,
    accessory: o.accessory,
    accessoryBack: o.accessoryBack,
  });
  ctx.restore();

  // braços levantados (na frente da cabeça)
  if (frontL) drawArm(ctx, st, lw, -1, armL, lite);
  if (frontR) drawArm(ctx, st, lw, 1, armR, lite);

  ctx.restore();
  ctx.restore();
}

/** Só a cabeça (ícones, cursores, janelas de veículo). Centrada na origem; `radius` em px. */
export function drawMonkeyHead(
  ctx: CanvasRenderingContext2D,
  o: {
    style: FurStyle;
    face: Face;
    radius: number;
    turn?: number;
    tilt?: number;
    earFlop?: number;
    lite?: boolean;
    outlinePx?: number;
    accessory?: (ctx: CanvasRenderingContext2D, lw: number) => void;
    accessoryBack?: (ctx: CanvasRenderingContext2D, lw: number) => void;
  },
): void {
  const lw = Math.max(0.06, (o.outlinePx ?? 1.6) / o.radius);
  ctx.save();
  ctx.scale(o.radius, o.radius);
  ctx.rotate(o.tilt ?? 0);
  drawHead(ctx, {
    style: o.style,
    face: o.face,
    lw,
    turn: o.turn ?? 0,
    lite: o.lite ?? o.radius < 8,
    earFlop: o.earFlop ?? 0,
    tuft: !o.accessory,
    accessory: o.accessory,
    accessoryBack: o.accessoryBack,
  });
  ctx.restore();
}

/** Atalho: mãos em poses comuns (coordenadas de figura). */
export const HANDS = {
  down: (side: number): HandPos => ({ x: side * 0.96, y: -0.82 }),
  up: (side: number, phase = 0): HandPos => ({ x: side * (0.95 + Math.sin(phase) * 0.1), y: -3.0 + Math.cos(phase) * 0.15 }),
  cheer: (side: number, phase = 0): HandPos => ({ x: side * 1.25, y: -3.05 + Math.sin(phase + (side > 0 ? 0 : 1.6)) * 0.28 }),
  mouth: (side: number, phase = 0): HandPos => ({ x: side * 0.34, y: -1.95 + Math.sin(phase) * 0.06 }),
  forward: (side: number, phase = 0): HandPos => ({ x: side * 0.5, y: -1.3 + Math.sin(phase + (side > 0 ? 0 : Math.PI)) * 0.2 }),
  out: (side: number): HandPos => ({ x: side * 1.45, y: -1.55 }),
  hip: (side: number): HandPos => ({ x: side * 0.95, y: -1.25 }),
};
