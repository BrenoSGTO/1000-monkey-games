/**
 * monkeylook.ts — acessórios e estilos visuais dos macacos de "Os Símios: Vida na Árvore".
 * Somente apresentação; nada aqui afeta simulação, rede ou hitboxes.
 */
import { makeFace, makeFurStyle, drawMonkey, drawMonkeyHead, type FurStyle, type Mood } from './monkeyart';
import type { AccessoryId } from './types';

type Ctx = CanvasRenderingContext2D;
type AccFn = (ctx: Ctx, lw: number) => void;

export function styleForAppearance(fur: string, belly: string): FurStyle {
  return makeFurStyle(fur, belly);
}

/** Acessórios em coordenadas de cabeça (origem = centro da cabeça, raio = 1). */
export function buildAccessory(acc: AccessoryId, turn: number, time: number): AccFn | undefined {
  const shift = turn * 0.14;
  switch (acc) {
    case 'juliet':
      return (ctx, lw) => {
        const y = -0.04;
        ctx.lineJoin = 'round';
        for (const side of [-1, 1]) {
          const cx = side * 0.34 + shift;
          ctx.beginPath();
          ctx.moveTo(cx - 0.3, y - 0.2);
          ctx.lineTo(cx + 0.3, y - 0.2);
          ctx.quadraticCurveTo(cx + 0.34, y + 0.2, cx + 0.12, y + 0.26);
          ctx.quadraticCurveTo(cx - 0.3, y + 0.28, cx - 0.3, y - 0.2);
          ctx.closePath();
          const g = ctx.createLinearGradient(cx - 0.3, y - 0.2, cx + 0.3, y + 0.28);
          g.addColorStop(0, 'rgba(34,211,238,0.62)');
          g.addColorStop(1, 'rgba(8,80,120,0.78)');
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = '#0b1220';
          ctx.lineWidth = lw * 1.6;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = lw * 1.1;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - 0.2, y - 0.1);
          ctx.lineTo(cx - 0.04, y - 0.1);
          ctx.stroke();
        }
        ctx.strokeStyle = '#0b1220';
        ctx.lineWidth = lw * 1.6;
        ctx.beginPath();
        ctx.moveTo(-0.04 + shift, y - 0.12);
        ctx.quadraticCurveTo(shift, y - 0.2, 0.04 + shift, y - 0.12);
        ctx.stroke();
      };
    case 'crown':
      return (ctx, lw) => {
        ctx.save();
        ctx.translate(shift * 0.5, 0);
        ctx.beginPath();
        ctx.moveTo(-0.62, -0.78);
        ctx.lineTo(-0.7, -1.38);
        ctx.lineTo(-0.3, -1.08);
        ctx.lineTo(0, -1.52);
        ctx.lineTo(0.3, -1.08);
        ctx.lineTo(0.7, -1.38);
        ctx.lineTo(0.62, -0.78);
        ctx.quadraticCurveTo(0, -0.7, -0.62, -0.78);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -1.5, 0, -0.7);
        g.addColorStop(0, '#fde68a');
        g.addColorStop(0.5, '#facc15');
        g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = lw * 1.3;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // joias
        const jewels: Array<[number, number, string]> = [
          [0, -0.95, '#ef4444'],
          [-0.37, -0.9, '#38bdf8'],
          [0.37, -0.9, '#4ade80'],
        ];
        for (const [jx, jy, jc] of jewels) {
          ctx.fillStyle = jc;
          ctx.beginPath();
          ctx.arc(jx, jy, 0.075, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = lw * 0.7;
          ctx.stroke();
        }
        // brilho
        const tw = 0.6 + 0.4 * Math.sin(time * 4);
        ctx.fillStyle = `rgba(255,255,255,${0.55 * tw})`;
        ctx.beginPath();
        ctx.arc(-0.52, -1.18, 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
    case 'cap':
      return (ctx, lw) => {
        const dir = turn < -0.2 ? -1 : 1;
        ctx.save();
        ctx.scale(dir, 1);
        // aba reta
        ctx.beginPath();
        ctx.moveTo(0.15, -0.5);
        ctx.bezierCurveTo(0.8, -0.62, 1.45, -0.5, 1.6, -0.36);
        ctx.bezierCurveTo(1.45, -0.2, 0.7, -0.22, 0.15, -0.38);
        ctx.closePath();
        const bg = ctx.createLinearGradient(0, -0.6, 0, -0.2);
        bg.addColorStop(0, '#334155');
        bg.addColorStop(1, '#0f172a');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = lw * 1.2;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
        // calota
        ctx.beginPath();
        ctx.moveTo(-1.02, -0.38);
        ctx.bezierCurveTo(-1.12, -1.38, 1.12, -1.38, 1.02, -0.38);
        ctx.quadraticCurveTo(0, -0.58, -1.02, -0.38);
        ctx.closePath();
        const g = ctx.createLinearGradient(-0.8, -1.2, 0.8, -0.4);
        g.addColorStop(0, '#f87171');
        g.addColorStop(1, '#b91c1c');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = lw * 1.3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(69,10,10,0.45)';
        ctx.lineWidth = lw * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, -1.17);
        ctx.quadraticCurveTo(-0.05, -0.8, 0, -0.5);
        ctx.stroke();
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.arc(0, -1.17, 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-0.45, -0.95, 0.28, 0.1, -0.5, 0, Math.PI * 2);
        ctx.fill();
      };
    case 'headset':
      return (ctx, lw) => {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#2e1065';
        ctx.lineWidth = 0.17 + lw * 2;
        ctx.beginPath();
        ctx.arc(0, -0.02, 1.13, Math.PI * 1.04, Math.PI * 1.96);
        ctx.stroke();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 0.17;
        ctx.stroke();
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(side * 1.12, 0.02);
          ctx.beginPath();
          ctx.roundRect(-0.15, -0.33, 0.3, 0.66, 0.12);
          const g = ctx.createLinearGradient(-0.15, 0, 0.15, 0);
          g.addColorStop(0, '#f9a8d4');
          g.addColorStop(1, '#db2777');
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = '#500724';
          ctx.lineWidth = lw * 1.2;
          ctx.stroke();
          ctx.restore();
        }
        // microfone
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 0.055;
        ctx.beginPath();
        ctx.moveTo(-1.12, 0.3);
        ctx.quadraticCurveTo(-0.95, 0.85, -0.3 + shift, 0.78);
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-0.3 + shift, 0.78, 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.arc(-0.32 + shift, 0.76, 0.035, 0, Math.PI * 2);
        ctx.fill();
      };
    case 'bald':
      return (ctx, lw) => {
        const tw = 0.55 + 0.45 * Math.sin(time * 2.6);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(-0.3, -0.74, 0.26, 0.1, -0.55, 0, Math.PI * 2);
        ctx.fill();
        // estrelinha de brilho careca
        ctx.save();
        ctx.translate(0.38, -0.78);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * tw})`;
        const s = 0.09 + 0.06 * tw;
        ctx.beginPath();
        ctx.moveTo(0, -s * 2);
        ctx.quadraticCurveTo(0, 0, s * 2, 0);
        ctx.quadraticCurveTo(0, 0, 0, s * 2);
        ctx.quadraticCurveTo(0, 0, -s * 2, 0);
        ctx.quadraticCurveTo(0, 0, 0, -s * 2);
        ctx.fill();
        ctx.restore();
        void lw;
      };
  }
  return undefined;
}

export function accessoryHidesTuft(acc: AccessoryId): boolean {
  return acc === 'crown' || acc === 'cap' || acc === 'bald' || acc === 'headset';
}

/**
 * Retrato do macaco (tela de criação) renderizado num canvas offscreen → data URL.
 * Usa exatamente o mesmo pintor do jogo.
 */
export function renderMonkeyPortrait(
  fur: string,
  belly: string,
  accessory: AccessoryId,
  mood: Mood = 'cheer',
  size = 220,
): string {
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = size * dpr;
  cv.height = size * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.scale(dpr, dpr);
  const t = 0.4;
  ctx.translate(size / 2, size * 0.94);
  drawMonkey(ctx, {
    style: styleForAppearance(fur, belly),
    face: makeFace(mood, t, 3, { x: 0.2, y: 0 }),
    height: size * 0.86,
    turn: 0.15,
    tailSide: -1,
    tailPhase: 1.4,
    tailAmp: 0.4,
    armL: { x: -1.25, y: -3.0 },
    armR: { x: 0.96, y: -0.82 },
    earFlop: 0.1,
    tuft: !accessoryHidesTuft(accessory),
    accessory: buildAccessory(accessory, 0.15, t),
    outlinePx: 3,
  });
  return cv.toDataURL('image/png');
}

const headIconCache = new Map<string, string>();

/** Mini-retrato (só a cabeça) para os botões do HUD; cacheado por aparência. */
export function monkeyHeadIcon(fur: string, belly: string, accessory: AccessoryId, px = 30): string {
  const key = `${fur}|${belly}|${accessory}|${px}`;
  const hit = headIconCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = px * dpr;
  cv.height = px * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.scale(dpr, dpr);
  ctx.translate(px / 2, px * 0.56);
  const r = px * 0.3;
  drawMonkeyHead(ctx, {
    style: styleForAppearance(fur, belly),
    face: makeFace('happy', 0.3, 2, { x: 0, y: 0 }, { blink: 0 }),
    radius: r,
    outlinePx: 1.4,
    lite: false,
    accessory: buildAccessory(accessory, 0, 0),
    accessoryBack: undefined,
  });
  const url = cv.toDataURL('image/png');
  headIconCache.set(key, url);
  return url;
}
