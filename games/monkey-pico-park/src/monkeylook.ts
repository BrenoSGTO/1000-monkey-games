/**
 * monkeylook.ts — aparência dos macacos de "Mico Park: A Chave da Banana".
 * Cada jogador (paletteIndex) tem pelagem + acessório próprios para ser
 * reconhecido num relance na torre de macacos. Só visual.
 */
import { makeFurStyle, mixColor, type FurStyle } from './monkeyart';
import { MONKEY_PALETTES } from './types';

type Ctx = CanvasRenderingContext2D;
type AccFn = (ctx: Ctx, lw: number) => void;

export function styleForPalette(index: number): FurStyle {
  const pal = MONKEY_PALETTES[index % MONKEY_PALETTES.length];
  // pelagem vibrante por jogador; contorno escuro consistente derivado do tom
  return makeFurStyle(pal.body, pal.belly, { outline: mixColor(pal.outline, '#0c0604', 0.45) });
}

export function paletteAccessoryHidesTuft(index: number): boolean {
  return index % 6 === 1 || index % 6 === 3 || index % 6 === 4 || index % 6 === 5;
}

/** Acessório de cada jogador, em coordenadas de cabeça (raio 1). */
export function paletteAccessory(index: number, turn: number, t: number): AccFn {
  const shift = turn * 0.14;
  switch (index % 6) {
    case 0: // folha de bananeira brotando
      return (ctx, lw) => {
        const sway = Math.sin(t * 3) * 0.08;
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = lw * 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -0.95);
        ctx.quadraticCurveTo(0.05, -1.25, 0.02 + sway, -1.45);
        ctx.stroke();
        for (const s of [-1, 1]) {
          ctx.save();
          ctx.translate(0.02 + sway, -1.45);
          ctx.rotate(s * 0.9 + sway);
          ctx.beginPath();
          ctx.ellipse(0, -0.26, 0.15, 0.32, 0, 0, Math.PI * 2);
          const g = ctx.createLinearGradient(0, -0.55, 0, 0);
          g.addColorStop(0, '#bef264');
          g.addColorStop(1, '#16a34a');
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = '#14532d';
          ctx.lineWidth = lw;
          ctx.stroke();
          ctx.restore();
        }
      };
    case 1: // bandana de explorador
      return (ctx, lw) => {
        ctx.beginPath();
        ctx.moveTo(-1.02, -0.5);
        ctx.quadraticCurveTo(0, -0.95, 1.02, -0.5);
        ctx.lineTo(0.98, -0.22);
        ctx.quadraticCurveTo(0, -0.7, -0.98, -0.22);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -0.9, 0, -0.2);
        g.addColorStop(0, '#f87171');
        g.addColorStop(1, '#b91c1c');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = lw * 1.2;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // bolinhas
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (const [x, y] of [[-0.55, -0.55], [-0.15, -0.64], [0.3, -0.62], [0.7, -0.5]]) {
          ctx.beginPath();
          ctx.arc(x, y, 0.055, 0, Math.PI * 2);
          ctx.fill();
        }
        // nó + pontas balançando
        const flap = Math.sin(t * 6) * 0.1;
        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#450a0a';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-1.0, -0.38);
          ctx.quadraticCurveTo(-1.35, -0.3 + s * 0.12 + flap, -1.5, -0.12 + s * 0.2 + flap * 1.5);
          ctx.lineTo(-1.28, -0.34 + s * 0.04);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      };
    case 2: // hibisco na orelha
      return (ctx, lw) => {
        ctx.save();
        ctx.translate(0.78 + shift * 0.3, -0.68);
        ctx.rotate(0.2);
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate((i / 5) * Math.PI * 2);
          ctx.beginPath();
          ctx.ellipse(0, -0.2, 0.15, 0.22, 0, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 ? '#fb7185' : '#f43f5e';
          ctx.fill();
          ctx.strokeStyle = '#881337';
          ctx.lineWidth = lw * 0.9;
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(0, 0, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#a16207';
        ctx.stroke();
        ctx.restore();
      };
    case 3: // óculos de aviador na testa
      return (ctx, lw) => {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = lw * 2.4;
        ctx.beginPath();
        ctx.moveTo(-1.03, -0.5);
        ctx.quadraticCurveTo(0, -0.95, 1.03, -0.5);
        ctx.stroke();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = lw * 1.2;
        ctx.stroke();
        for (const side of [-1, 1]) {
          const cx = side * 0.36 + shift;
          ctx.beginPath();
          ctx.arc(cx, -0.66, 0.24, 0, Math.PI * 2);
          const g = ctx.createLinearGradient(cx - 0.2, -0.86, cx + 0.2, -0.46);
          g.addColorStop(0, '#bae6fd');
          g.addColorStop(1, '#0284c7');
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = lw * 2;
          ctx.stroke();
          ctx.strokeStyle = '#451a03';
          ctx.lineWidth = lw * 0.7;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath();
          ctx.ellipse(cx - 0.08, -0.74, 0.07, 0.04, -0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = lw * 1.6;
        ctx.beginPath();
        ctx.moveTo(-0.12 + shift, -0.66);
        ctx.lineTo(0.12 + shift, -0.66);
        ctx.stroke();
      };
    case 4: // gorro de pompom
      return (ctx, lw) => {
        const bob = Math.sin(t * 5) * 0.04;
        ctx.beginPath();
        ctx.moveTo(-1.0, -0.4);
        ctx.bezierCurveTo(-1.1, -1.4, 1.1, -1.4, 1.0, -0.4);
        ctx.closePath();
        const g = ctx.createLinearGradient(-0.8, -1.2, 0.8, -0.4);
        g.addColorStop(0, '#fb923c');
        g.addColorStop(1, '#c2410c');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#431407';
        ctx.lineWidth = lw * 1.3;
        ctx.stroke();
        // listras
        ctx.strokeStyle = 'rgba(255,237,213,0.55)';
        ctx.lineWidth = lw * 1.4;
        for (const x of [-0.45, 0, 0.45]) {
          ctx.beginPath();
          ctx.moveTo(x, -1.15 + Math.abs(x) * 0.4);
          ctx.lineTo(x * 1.15, -0.5);
          ctx.stroke();
        }
        // barra
        ctx.beginPath();
        ctx.roundRect(-1.04, -0.62, 2.08, 0.28, 0.12);
        ctx.fillStyle = '#ffedd5';
        ctx.fill();
        ctx.strokeStyle = '#431407';
        ctx.lineWidth = lw * 1.2;
        ctx.stroke();
        // pompom
        ctx.fillStyle = '#fff7ed';
        ctx.beginPath();
        ctx.arc(0, -1.36 + bob, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };
    default: // coroa real
      return (ctx, lw) => {
        ctx.beginPath();
        ctx.moveTo(-0.55, -0.82);
        ctx.lineTo(-0.62, -1.38);
        ctx.lineTo(-0.26, -1.1);
        ctx.lineTo(0, -1.5);
        ctx.lineTo(0.26, -1.1);
        ctx.lineTo(0.62, -1.38);
        ctx.lineTo(0.55, -0.82);
        ctx.quadraticCurveTo(0, -0.74, -0.55, -0.82);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -1.5, 0, -0.75);
        g.addColorStop(0, '#fde68a');
        g.addColorStop(0.5, '#facc15');
        g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = lw * 1.3;
        ctx.lineJoin = 'round';
        ctx.stroke();
        for (const [jx, jy, jc] of [[0, -0.97, '#ef4444'], [-0.33, -0.93, '#38bdf8'], [0.33, -0.93, '#4ade80']] as const) {
          ctx.fillStyle = jc;
          ctx.beginPath();
          ctx.arc(jx, jy, 0.07, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = lw * 0.7;
          ctx.stroke();
        }
      };
  }
}
