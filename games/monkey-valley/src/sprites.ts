import type { Look, Mood, ToolId } from './types';
import { CROPS, ITEMS, TIER_COLORS } from './data';

export type G2 = CanvasRenderingContext2D;

export function mk(w: number, h: number): [HTMLCanvasElement, G2] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function R(g: G2, col: string, x: number, y: number, w: number, h: number): void {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

export function P(g: G2, col: string, x: number, y: number): void {
  g.fillStyle = col;
  g.fillRect(x, y, 1, 1);
}

/** Contorno pixel-art: pinta de escuro todo pixel transparente vizinho de um opaco. */
export function outline(c: HTMLCanvasElement, col = '#2b1a12'): HTMLCanvasElement {
  const w = c.width;
  const h = c.height;
  const g = c.getContext('2d')!;
  const src = g.getImageData(0, 0, w, h);
  const out = g.createImageData(w, h);
  out.data.set(src.data);
  const rgb = hexToRgb(col);
  const a = src.data;
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a[i + 3] > 40) continue;
      const nb =
        (x > 0 && a[i - 4 + 3] > 200) ||
        (x < w - 1 && a[i + 4 + 3] > 200) ||
        (y > 0 && a[i - w * 4 + 3] > 200) ||
        (y < h - 1 && a[i + w * 4 + 3] > 200);
      if (nb) {
        o[i] = rgb[0];
        o[i + 1] = rgb[1];
        o[i + 2] = rgb[2];
        o[i + 3] = 255;
      }
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

export function hexToRgb(h: string): [number, number, number] {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// ---------------------------------------------------------------- Macaco

const CELL_W = 22;
const CELL_H = 28;
export const MONKEY_ANCHOR = { x: 11, y: 26 };

function hatDraw(g: G2, L: Look, cx: number, side: boolean, back: boolean): void {
  const hc = L.hatColor;
  switch (L.hat) {
    case 'palha': {
      const bx = side ? cx - 8 : cx - 9;
      R(g, '#d9a93b', bx, 4, 18, 2);
      R(g, '#b07f26', bx, 5, 18, 1);
      R(g, '#efcb62', cx - 5, 1, 10, 3);
      R(g, '#efcb62', cx - 4, 0, 8, 1);
      R(g, hc ?? '#c0392b', cx - 5, 3, 10, 1);
      P(g, '#b8902c', cx - 2, 1);
      P(g, '#b8902c', cx + 2, 2);
      break;
    }
    case 'bone': {
      R(g, hc ?? '#e84a4a', cx - 5, 2, 10, 3);
      R(g, hc ?? '#e84a4a', cx - 4, 1, 8, 1);
      if (!back) R(g, shade(hc ?? '#e84a4a', -0.3), side ? cx - 9 : cx - 6, 5, side ? 6 : 12, 1);
      break;
    }
    case 'marinheiro': {
      R(g, '#f4f4f4', cx - 5, 1, 10, 4);
      R(g, '#2f6aa8', cx - 6, 4, 12, 2);
      R(g, '#f4f4f4', cx - 4, 0, 8, 1);
      P(g, '#d33', cx, 3);
      break;
    }
    case 'capacete': {
      R(g, '#f5c518', cx - 6, 2, 12, 3);
      R(g, '#f5c518', cx - 4, 1, 8, 1);
      R(g, '#c89a10', cx - 7, 4, 14, 2);
      R(g, '#fff6a0', cx - 1, 2, 3, 2);
      break;
    }
    case 'cartola': {
      R(g, '#23232b', cx - 4, -2, 8, 6);
      R(g, '#23232b', cx - 8, 4, 16, 2);
      R(g, '#c0392b', cx - 4, 2, 8, 1);
      break;
    }
    case 'lenco': {
      R(g, hc ?? '#c0392b', cx - 6, 3, 12, 3);
      R(g, hc ?? '#c0392b', cx - 5, 2, 10, 1);
      R(g, shade(hc ?? '#c0392b', -0.3), cx + (side ? 5 : 6), 4, 2, 3);
      break;
    }
    case 'laco': {
      R(g, '#6a4a2a', cx - 5, 3, 10, 3);
      R(g, hc ?? '#ff6fa8', cx + 3, 1, 4, 3);
      R(g, hc ?? '#ff6fa8', cx + 5, 0, 3, 5);
      P(g, '#fff', cx + 5, 2);
      break;
    }
    default:
      break;
  }
}

function faceFront(g: G2, L: Look, mood: Mood): void {
  const dark = '#201510';
  const mask = L.muzzle;
  R(g, mask, 5, 7, 10, 6);
  R(g, mask, 6, 13, 8, 1);
  // sobrancelhas / olhos por humor
  const eye = (x: number) => {
    switch (mood) {
      case 'happy':
        P(g, dark, x, 10);
        P(g, dark, x + 1, 9);
        P(g, dark, x + 2, 10);
        break;
      case 'mad':
        R(g, dark, x, 9, 2, 2);
        P(g, dark, x === 6 ? x : x + 1, 8);
        P(g, dark, x === 6 ? x + 1 : x, 7);
        break;
      case 'surprised':
        R(g, '#fff', x - 0, 8, 3, 3);
        P(g, dark, x + 1, 9);
        break;
      case 'sleepy':
        R(g, dark, x, 10, 3, 1);
        break;
      case 'sad':
        R(g, dark, x, 9, 2, 2);
        P(g, dark, x === 6 ? x + 1 : x, 8);
        break;
      default:
        R(g, dark, x, 9, 2, 3);
        P(g, '#fff', x, 9);
    }
  };
  eye(6);
  eye(12);
  // focinho e nariz
  P(g, '#7a4a3a', 9, 11);
  P(g, '#7a4a3a', 10, 11);
  switch (mood) {
    case 'happy':
      R(g, dark, 8, 12, 4, 1);
      R(g, '#e8566a', 9, 13, 2, 1);
      break;
    case 'mad':
      R(g, dark, 8, 13, 4, 1);
      P(g, dark, 7, 14);
      P(g, dark, 12, 14);
      break;
    case 'surprised':
      R(g, dark, 9, 12, 2, 2);
      break;
    case 'sad':
      R(g, dark, 8, 13, 4, 1);
      break;
    case 'sleepy':
      R(g, dark, 9, 13, 2, 1);
      break;
    default:
      P(g, dark, 8, 12);
      R(g, dark, 9, 13, 2, 1);
      P(g, dark, 11, 12);
  }
}

/** Cabeça de frente (usada no sprite e no retrato). */
export function drawHeadFront(g: G2, L: Look, mood: Mood): void {
  // orelhas
  R(g, L.fur, 2, 8, 2, 4);
  R(g, L.fur, 16, 8, 2, 4);
  P(g, L.ear, 2, 9);
  P(g, L.ear, 2, 10);
  P(g, L.ear, 17, 9);
  P(g, L.ear, 17, 10);
  R(g, L.fur, 4, 5, 12, 9);
  faceFront(g, L, mood);
  // franja do cabelo
  R(g, L.fur, 4, 6, 12, 1);
  R(g, L.fur, 4, 7, 1, 3);
  R(g, L.fur, 15, 7, 1, 3);
  if (L.hat !== 'nenhum') hatDraw(g, L, 10, false, false);
  accHead(g, L, 0);
}

function accHead(g: G2, L: Look, dir: number): void {
  if (L.acc === 'oculos' && dir !== 3) {
    const c = L.accColor;
    if (dir === 0) {
      R(g, c, 5, 8, 4, 1);
      R(g, c, 5, 11, 4, 1);
      R(g, c, 5, 8, 1, 4);
      R(g, c, 8, 8, 1, 4);
      R(g, c, 11, 8, 4, 1);
      R(g, c, 11, 11, 4, 1);
      R(g, c, 11, 8, 1, 4);
      R(g, c, 14, 8, 1, 4);
      R(g, c, 9, 9, 2, 1);
      R(g, 'rgba(180,230,255,0.55)', 6, 9, 2, 2);
      R(g, 'rgba(180,230,255,0.55)', 12, 9, 2, 2);
    } else {
      R(g, c, 3, 8, 4, 1);
      R(g, c, 3, 11, 4, 1);
      R(g, c, 3, 8, 1, 4);
      R(g, c, 6, 8, 1, 4);
      R(g, 'rgba(180,230,255,0.55)', 4, 9, 2, 2);
    }
  }
  if (L.acc === 'bigode') {
    if (dir === 0) R(g, L.accColor, 6, 12, 8, 2);
    else if (dir !== 3) R(g, L.accColor, 1, 12, 5, 2);
  }
  if (L.acc === 'barba') {
    if (dir === 0) {
      R(g, L.accColor, 5, 12, 10, 3);
      R(g, L.accColor, 7, 15, 6, 2);
      R(g, L.muzzle, 8, 11, 4, 1);
    } else if (dir !== 3) {
      R(g, L.accColor, 2, 12, 8, 3);
      R(g, L.accColor, 4, 15, 5, 2);
    }
  }
}

function drawBody(g: G2, L: Look, dir: number, fr: number): void {
  const step = fr === 1 ? 1 : fr === 3 ? -1 : 0;
  const f = L.fur;
  const foot = L.muzzle;
  const dk = shade(f, -0.28);
  const wag = fr === 1 || fr === 3 ? 1 : 0;

  if (dir === 0 || dir === 3) {
    // rabo
    R(g, f, 15, 19, 3, 2);
    R(g, f, 17, 15 - wag, 2, 5 + wag);
    R(g, f, 16, 14 - wag, 2, 2);
    R(g, dk, 17, 14 - wag, 1, 1);
    // pernas
    const l = step === 1 ? 1 : 0;
    const r = step === -1 ? 1 : 0;
    R(g, f, 6, 21 - l, 3, 3);
    R(g, foot, 5, 23 - l, 4, 2);
    R(g, f, 11, 21 - r, 3, 3);
    R(g, foot, 11, 23 - r, 4, 2);
    // calça
    R(g, L.pants, 5, 18, 10, 3);
    R(g, shade(L.pants, -0.25), 9, 19, 2, 2);
    // tronco
    R(g, L.shirt, 5, 14, 10, 5);
    R(g, shade(L.shirt, -0.2), 5, 18, 10, 1);
    // braços
    const al = step === 1 ? -1 : step === -1 ? 1 : 0;
    R(g, f, 3, 14 + al, 2, 5);
    R(g, L.shirt, 3, 14 + al, 2, 2);
    R(g, foot, 3, 19 + al, 2, 2);
    R(g, f, 15, 14 - al, 2, 5);
    R(g, L.shirt, 15, 14 - al, 2, 2);
    R(g, foot, 15, 19 - al, 2, 2);
    if (dir === 0) {
      R(g, L.pants, 7, 16, 6, 3);
      R(g, L.pants, 7, 14, 1, 2);
      R(g, L.pants, 12, 14, 1, 2);
      P(g, '#ffd84a', 7, 16);
      P(g, '#ffd84a', 12, 16);
      if (L.acc === 'avental') {
        R(g, L.accColor, 6, 15, 8, 6);
        R(g, shade(L.accColor, -0.15), 6, 20, 8, 1);
        P(g, shade(L.accColor, -0.3), 9, 17);
      }
      if (L.acc === 'faixa') {
        R(g, L.accColor, 5, 14, 2, 1);
        R(g, L.accColor, 6, 15, 2, 1);
        R(g, L.accColor, 7, 16, 2, 1);
        R(g, L.accColor, 8, 17, 2, 1);
        R(g, L.accColor, 9, 18, 2, 1);
      }
      drawHeadFront(g, L, 'neutral');
      // desenha as pernas por cima do bico da faixa? já feito
    } else {
      // costas
      R(g, L.pants, 7, 14, 1, 3);
      R(g, L.pants, 12, 14, 1, 3);
      R(g, L.pants, 5, 17, 10, 2);
      R(g, f, 2, 8, 2, 4);
      R(g, f, 16, 8, 2, 4);
      R(g, f, 4, 5, 12, 9);
      R(g, dk, 5, 12, 10, 2);
      R(g, dk, 9, 7, 2, 2);
      if (L.hat !== 'nenhum') hatDraw(g, L, 10, false, true);
    }
  } else {
    // lado (olhando para a esquerda)
    // rabo (atrás = direita)
    R(g, f, 13, 18, 3, 2);
    R(g, f, 15 + wag, 14, 2, 5);
    R(g, f, 14 + wag, 13, 3, 2);
    // perna de trás
    const fwd = step === 1 ? -3 : step === -1 ? 2 : 0;
    const back = -fwd;
    const l2 = step === 1 ? 1 : 0;
    const r2 = step === -1 ? 1 : 0;
    R(g, dk, 9 + back, 21 - r2, 3, 3);
    R(g, foot, 8 + back, 23 - r2, 4, 2);
    R(g, f, 8 + fwd, 21 - l2, 3, 3);
    R(g, foot, 7 + fwd, 23 - l2, 4, 2);
    // calça + tronco
    R(g, L.pants, 6, 18, 8, 3);
    R(g, L.shirt, 6, 14, 8, 5);
    R(g, shade(L.shirt, -0.2), 6, 18, 8, 1);
    R(g, L.pants, 6, 16, 3, 3);
    P(g, '#ffd84a', 7, 16);
    if (L.acc === 'avental') R(g, L.accColor, 5, 15, 4, 6);
    // braço
    const ax = step === 1 ? 3 : step === -1 ? -3 : 0;
    R(g, f, 8 + ax, 14, 3, 5);
    R(g, L.shirt, 8 + ax, 14, 3, 2);
    R(g, foot, 8 + ax, 19, 3, 2);
    // cabeça
    R(g, f, 11, 8, 2, 4); // orelha
    P(g, L.ear, 12, 9);
    P(g, L.ear, 12, 10);
    R(g, f, 3, 5, 10, 9);
    R(g, L.muzzle, 2, 8, 6, 5);
    R(g, L.muzzle, 3, 13, 5, 1);
    R(g, f, 4, 6, 9, 1);
    R(g, '#201510', 5, 9, 2, 3);
    P(g, '#fff', 5, 9);
    P(g, '#7a4a3a', 2, 10);
    P(g, '#201510', 3, 12);
    P(g, '#201510', 4, 12);
    if (L.hat !== 'nenhum') hatDraw(g, L, 8, true, false);
    accHead(g, L, 1);
  }
}

const sheetCache = new Map<string, HTMLCanvasElement>();

/** Folha com 4 direções (linhas) × 4 quadros de caminhada (colunas). */
export function monkeySheet(L: Look): HTMLCanvasElement {
  const key = JSON.stringify(L);
  const hit = sheetCache.get(key);
  if (hit) return hit;
  const [c, g] = mk(CELL_W * 4, CELL_H * 4);
  for (let dir = 0; dir < 4; dir++) {
    for (let fr = 0; fr < 4; fr++) {
      const [cc, cg] = mk(CELL_W, CELL_H);
      cg.translate(1, 3);
      if (dir === 2) {
        cg.translate(20, 0);
        cg.scale(-1, 1);
        drawBody(cg, L, 1, fr);
      } else {
        drawBody(cg, L, dir, fr);
      }
      outline(cc);
      g.drawImage(cc, fr * CELL_W, dir * CELL_H);
    }
  }
  sheetCache.set(key, c);
  return c;
}

export function drawMonkeyAt(g: G2, L: Look, dir: number, frame: number, x: number, y: number, lift = 0): void {
  const sheet = monkeySheet(L);
  g.drawImage(sheet, frame * CELL_W, dir * CELL_H, CELL_W, CELL_H, Math.round(x - MONKEY_ANCHOR.x), Math.round(y - MONKEY_ANCHOR.y - lift), CELL_W, CELL_H);
}

const portraitCache = new Map<string, string>();

/** Retrato do diálogo (data URL) com a expressão pedida. */
export function portraitURL(L: Look, mood: Mood): string {
  const key = JSON.stringify(L) + mood;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const [small, sg] = mk(22, 20);
  sg.translate(1, 3);
  // ombros
  R(sg, L.shirt, 3, 14, 14, 4);
  R(sg, shade(L.shirt, -0.2), 3, 17, 14, 1);
  if (L.acc === 'avental') R(sg, L.accColor, 6, 15, 8, 3);
  if (L.acc === 'faixa') {
    R(sg, L.accColor, 4, 14, 3, 1);
    R(sg, L.accColor, 5, 15, 3, 1);
    R(sg, L.accColor, 6, 16, 3, 1);
  }
  R(sg, L.fur, 7, 13, 6, 2);
  drawHeadFront(sg, L, mood);
  outline(small);
  const [big, bg] = mk(88, 80);
  bg.imageSmoothingEnabled = false;
  bg.drawImage(small, 0, 0, 22, 20, 0, 0, 88, 80);
  const url = big.toDataURL();
  portraitCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------- Bichos

const critterCache = new Map<string, HTMLCanvasElement>();

export function chickenFrame(frame: number, ready: boolean): HTMLCanvasElement {
  const key = `ch${frame}${ready ? 1 : 0}`;
  const hit = critterCache.get(key);
  if (hit) return hit;
  const [c, g] = mk(16, 16);
  g.translate(1, 2);
  const peck = frame === 1 ? 2 : 0;
  R(g, '#f6f2e8', 3, 5 + peck / 2, 8, 6);
  R(g, '#e0d8c4', 3, 9, 8, 2);
  R(g, '#f6f2e8', 8, 2 + peck, 4, 4);
  R(g, '#e03a3a', 9, 1 + peck, 2, 1);
  R(g, '#f0a020', 12, 4 + peck, 2, 1);
  P(g, '#201510', 10, 3 + peck);
  R(g, '#e03a3a', 10, 5 + peck, 1, 1);
  R(g, '#e6dcc6', 1, 4, 3, 3);
  R(g, '#f0a020', 5, 11, 1, 2 + (frame === 2 ? 0 : 0));
  R(g, '#f0a020', 8, 11, 1, 2);
  if (frame === 2) R(g, '#f0a020', 6, 11, 1, 1);
  if (ready) {
    R(g, '#fff6a0', 5, -1, 4, 1);
    P(g, '#ffd84a', 6, -2);
  }
  outline(c);
  critterCache.set(key, c);
  return c;
}

export function goatFrame(frame: number, ready: boolean): HTMLCanvasElement {
  const key = `go${frame}${ready ? 1 : 0}`;
  const hit = critterCache.get(key);
  if (hit) return hit;
  const [c, g] = mk(24, 22);
  g.translate(1, 2);
  const b = frame === 1 ? 1 : 0;
  // corpo
  R(g, '#eae4d6', 4, 7, 13, 7);
  R(g, '#cfc6b2', 4, 12, 13, 2);
  // pernas
  R(g, '#8a7a62', 5, 14 - b, 2, 4);
  R(g, '#8a7a62', 9, 14, 2, 4);
  R(g, '#8a7a62', 12, 14 - b, 2, 4);
  R(g, '#8a7a62', 15, 14, 2, 4);
  // cabeça de macaco-cabra
  R(g, '#c98f55', 16, 3, 6, 7);
  R(g, '#f0d2a0', 17, 6, 5, 4);
  R(g, '#c98f55', 15, 4, 1, 3);
  P(g, '#201510', 18, 5);
  P(g, '#201510', 20, 5);
  P(g, '#7a4a3a', 21, 8);
  P(g, '#e8a0a0', 15, 5);
  // chifres
  R(g, '#d8d0b8', 17, 1, 1, 3);
  R(g, '#d8d0b8', 20, 1, 1, 3);
  // barbicha
  R(g, '#eae4d6', 19, 10, 2, 3);
  // rabo de macaco
  R(g, '#c98f55', 1, 6, 4, 2);
  R(g, '#c98f55', 0, 3, 2, 4);
  R(g, '#c98f55', 1, 2, 2, 2);
  if (ready) {
    R(g, '#fff6a0', 8, -1, 4, 1);
    P(g, '#ffd84a', 9, -2);
  }
  outline(c);
  critterCache.set(key, c);
  return c;
}

export function slimeFrame(frame: number, hurt: boolean): HTMLCanvasElement {
  const key = `sl${frame}${hurt ? 1 : 0}`;
  const hit = critterCache.get(key);
  if (hit) return hit;
  const [c, g] = mk(16, 14);
  g.translate(1, 1);
  const sq = frame === 1 ? 1 : 0;
  const col = hurt ? '#ffffff' : '#6ad85a';
  const col2 = hurt ? '#ffffff' : '#42b83a';
  R(g, col, 2 - sq, 4 + sq, 10 + sq * 2, 7 - sq);
  R(g, col, 3, 2 + sq, 8, 3);
  R(g, col2, 2 - sq, 9, 10 + sq * 2, 2 - sq);
  P(g, '#c8ffc0', 4, 4);
  P(g, '#c8ffc0', 5, 3 + sq);
  P(g, '#201510', 5, 7);
  P(g, '#201510', 9, 7);
  R(g, '#201510', 6, 9, 3, 1);
  outline(c);
  critterCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- Ícones

const ART: Record<string, string[]> = {
  egg: ['..aaaa..', '.aaaaaa.', 'aawaaaaa', 'aawaaaaa', 'aaaaaaaa', 'aaaaaaab', '.aaaaabb', '..bbbb..'],
  milk: ['..bbbb..', '..aaaa..', '.bbbbbb.', '.aaaaaa.', '.awwaab.', '.aaaaab.', '.aaaaab.', '.bbbbbb.'],
  bread: ['..aaaa..', '.aaaaaaa', 'aawaaaaa', 'aaaabaaa', 'aaaaaaab', 'aabaaaab', '.aaaabb.', '..bbbb..'],
  coffee: ['...w.w..', '....w...', 'bbbbbbb.', 'baaaaab.', 'baaaaabb', 'baaaaab.b', '.baaab.b', '..bbb...'],
  slime: ['...aaa..', '..aaaaa.', '.awaaaaa', '.aaaaaaa', 'aaakaakb', 'aaaaaaab', 'abbbbbbb', '.bbbbbb.'],
  stone: ['..aaaa..', '.aabbaa.', 'aabbbbaa', 'aabbbaaa', 'aaaaaaaa', '.aaaaaa.'],
  ore: ['..aaaa..', '.bbabba.', 'bbaabbbb', 'bbbbabab', 'baabbbbb', '.bbbbbb.'],
  gem: ['..bbbb..', '.baaaab.', 'baaaaaab', '.baaaab.', '..baab..', '...bb...'],
  log: ['.bbbbbb.', 'baaaaaab', 'baabbaab', 'baabbaab', 'baaaaaab', '.bbbbbb.'],
  fiber: ['a..a..a.', 'ba.ba.ba', 'ba.ba.ba', 'bbabbabb', '.bbabbab', '..bbbbb.'],
  hay: ['..a.a.a.', '.a.aaa.a', 'aaaaaaaa', 'abaabaab', 'aaaaaaaa', 'bbbbbbbb'],
  boot: ['.bbb....', '.bab....', '.bab....', '.baabbb.', 'baaaaaab', 'bbbbbbbb'],
  fish: ['..aaaa....', '.aaaaaaa.a', 'aakaaabbaa', 'aaaaabbbaa', '.aaaaaaa.a', '..aaaa....'],
  'crop-root': ['..c.c...', '.ccccc..', '..ccc...', '.aaaaa..', 'abaaaaaa', '.aaaaab.', '..aabb..', '...bb...'],
  'crop-leafy': ['..cccc..', '.ccaacc.', 'ccaaaacc', 'caabaaac', 'caaaabac', '.ccaacc.', '..cccc..'],
  'crop-berry': ['...cc...', '..cccc..', '.aacaaa.', 'aaabaaaa', 'aabaaaaa', '.aaaaab.', '..bbb...'],
  'crop-tall': ['..aa.aa.', '.aaaaaaa', '.abaaaba', '.aaaaaaa', '..aaaab.', '...bbb..'],
  'crop-vine': ['...cc...', '..aaaaa.', '.aabaaaa', 'aaabaaab', 'aaabaaab', '.aabaab.', '..bbbb..'],
  'crop-tree': ['....cc..', '..aaaac.', '.aabaaa.', '.aaaaaab', '..aaabb.', '...bb...'],
  'crop-palm': ['.a.a.a..', '.aaaaab.', 'aabaaaaa', '.aaaabab', '..aaab..', '...bb...'],
  seed: ['..bb....', '.bbbbb..', 'wwwwwww.', 'waaaaaw.', 'waaaaaw.', 'waaaaaw.', 'wwwwwww.'],
};

const toolCache = new Map<string, HTMLCanvasElement>();

export function toolIcon(tool: ToolId, tier: number): HTMLCanvasElement {
  const key = `${tool}${tier}`;
  const hit = toolCache.get(key);
  if (hit) return hit;
  const [c, g] = mk(18, 18);
  g.translate(1, 1);
  const head = TIER_COLORS[Math.max(0, Math.min(3, tier))];
  const hd = shade(head, -0.3);
  const wood = '#9a6a3a';
  const wd = '#6a4420';
  const line = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) P(g, col, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
  };
  switch (tool) {
    case 'hoe':
      line(2, 14, 12, 4, wood);
      line(3, 14, 13, 4, wd);
      R(g, head, 10, 1, 5, 2);
      R(g, head, 13, 1, 2, 5);
      R(g, hd, 10, 3, 3, 1);
      break;
    case 'axe':
      line(2, 14, 11, 5, wood);
      line(3, 14, 12, 5, wd);
      R(g, head, 9, 1, 6, 6);
      R(g, hd, 9, 6, 6, 1);
      R(g, '#ffffff66', 10, 2, 2, 1);
      break;
    case 'pick':
      line(2, 14, 12, 4, wood);
      line(3, 14, 13, 4, wd);
      R(g, head, 5, 1, 10, 2);
      R(g, head, 4, 2, 2, 2);
      R(g, head, 13, 2, 2, 3);
      R(g, hd, 6, 3, 8, 1);
      break;
    case 'sickle':
      line(2, 14, 8, 8, wood);
      R(g, head, 7, 2, 7, 2);
      R(g, head, 11, 3, 3, 4);
      R(g, head, 13, 6, 2, 2);
      R(g, hd, 8, 4, 5, 1);
      break;
    case 'rod':
      line(2, 15, 14, 2, wood);
      line(3, 15, 15, 2, wd);
      line(14, 2, 15, 12, '#dddddd');
      R(g, '#e84a4a', 14, 12, 3, 3);
      P(g, '#fff', 14, 12);
      break;
    case 'can':
      R(g, head, 3, 6, 9, 8);
      R(g, hd, 3, 12, 9, 2);
      R(g, head, 11, 7, 3, 1);
      R(g, head, 13, 4, 2, 4);
      R(g, hd, 12, 3, 4, 1);
      R(g, '#5ab4ff', 4, 4, 7, 2);
      R(g, head, 4, 3, 1, 3);
      R(g, head, 10, 3, 1, 3);
      R(g, '#ffffff66', 4, 7, 1, 4);
      break;
  }
  outline(c);
  toolCache.set(key, c);
  return c;
}

const iconCache = new Map<string, HTMLCanvasElement>();

export function itemIcon(id: string): HTMLCanvasElement {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const def = ITEMS[id];
  const [c, g] = mk(16, 16);
  if (!def) return c;
  const sp = def.icon;
  const art = ART[sp.s];
  const w = art ? Math.max(...art.map((r) => r.length)) : 8;
  const h = art ? art.length : 8;
  const ox = Math.floor((16 - w) / 2);
  const oy = Math.floor((16 - h) / 2);
  if (sp.s === 'crop-tall' && id === 'banana') {
    // cacho de banana curvo
    const y = '#f7d63c';
    const d = '#b8941a';
    R(g, '#6a4a2a', 7, 2, 2, 3);
    R(g, y, 4, 4, 3, 7);
    R(g, y, 7, 4, 3, 8);
    R(g, y, 10, 5, 3, 6);
    R(g, d, 4, 10, 1, 1);
    R(g, d, 7, 11, 1, 1);
    R(g, d, 12, 10, 1, 1);
    R(g, '#fff08a', 5, 5, 1, 4);
    R(g, '#fff08a', 8, 5, 1, 4);
  } else if (art) {
    const pal: Record<string, string> = { a: sp.a, b: sp.b ?? shade(sp.a, -0.3), c: sp.c ?? '#4cb04d', w: '#ffffff', k: '#201510' };
    if (sp.s === 'seed') pal.w = '#f4ead2';
    for (let y = 0; y < art.length; y++) {
      for (let x = 0; x < art[y].length; x++) {
        const ch = art[y][x];
        if (ch !== '.') P(g, pal[ch] ?? sp.a, ox + x, oy + y);
      }
    }
  } else {
    R(g, sp.a, 4, 4, 8, 8);
  }
  outline(c);
  iconCache.set(id, c);
  return c;
}

const urlCache = new Map<string, string>();
export function itemIconURL(id: string): string {
  let u = urlCache.get(id);
  if (!u) {
    u = itemIcon(id).toDataURL();
    urlCache.set(id, u);
  }
  return u;
}
export function toolIconURL(tool: ToolId, tier: number): string {
  const k = `t-${tool}${tier}`;
  let u = urlCache.get(k);
  if (!u) {
    u = toolIcon(tool, tier).toDataURL();
    urlCache.set(k, u);
  }
  return u;
}

export { CROPS };
