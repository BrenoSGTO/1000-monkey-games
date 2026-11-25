/**
 * monkeylook.ts — chefs-macacos de "Sopa de Macacão": pelagem por jogador,
 * toque de chef, avental. Apenas apresentação (nenhuma lógica de cozinha).
 */
import { makeFurStyle, type FurStyle } from './monkeyart';

type Ctx = CanvasRenderingContext2D;

const FUR: Array<{ fur: string; mask: string }> = [
  { fur: '#8a5230', mask: '#f3cfa6' }, // chimpanzé caramelo
  { fur: '#e8892b', mask: '#ffe0b0' }, // mico-leão-dourado
  { fur: '#4b5563', mask: '#d4dae3' }, // gorila grafite
  { fur: '#a9754a', mask: '#fff2df' }, // capuchinho
  { fur: '#2d2a2a', mask: '#d9b997' }, // macaco-aranha
  { fur: '#b4472b', mask: '#f6cfae' }, // bugio ruivo
];

export function chefStyle(index: number): FurStyle {
  const p = FUR[((index % FUR.length) + FUR.length) % FUR.length];
  return makeFurStyle(p.fur, p.mask);
}

/** Toque de chef com faixa colorida (coordenadas de cabeça). */
export function chefHat(color: string, t: number, working: boolean) {
  return (ctx: Ctx, lw: number): void => {
    const wob = working ? Math.sin(t * 28) * 0.05 : Math.sin(t * 2) * 0.01;
    ctx.save();
    ctx.translate(0, wob);
    // balão do toque
    const puff = (x: number, y: number, r: number): void => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    };
    const g = ctx.createLinearGradient(0, -1.8, 0, -0.9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#dbe4ee');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = lw * 1.2;
    ctx.lineJoin = 'round';
    for (const [x, y, r] of [
      [-0.52, -1.28, 0.44],
      [0.52, -1.28, 0.44],
      [0, -1.5, 0.52],
    ] as const) {
      puff(x, y, r);
      ctx.fill();
      ctx.stroke();
    }
    // tampa os contornos internos
    puff(0, -1.22, 0.5);
    ctx.fill();
    // base / faixa
    ctx.beginPath();
    ctx.roundRect(-0.8, -1.08, 1.6, 0.44, 0.14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-0.8, -0.8, 1.6, 0.16, 0.08);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
    // dobrinhas
    ctx.strokeStyle = 'rgba(100,116,139,0.45)';
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.moveTo(-0.2, -1.55);
    ctx.quadraticCurveTo(-0.15, -1.3, -0.25, -1.1);
    ctx.moveTo(0.25, -1.55);
    ctx.quadraticCurveTo(0.3, -1.3, 0.22, -1.1);
    ctx.stroke();
    ctx.restore();
  };
}

/** Avental de chef sobre o tronco (coordenadas de figura, pés em y=0). */
export function chefApron(color: string) {
  return (ctx: Ctx, lw: number): void => {
    ctx.beginPath();
    ctx.moveTo(-0.38, -1.88);
    ctx.lineTo(0.38, -1.88);
    ctx.lineTo(0.62, -1.4);
    ctx.quadraticCurveTo(0.7, -0.9, 0.5, -0.5);
    ctx.quadraticCurveTo(0, -0.32, -0.5, -0.5);
    ctx.quadraticCurveTo(-0.7, -0.9, -0.62, -1.4);
    ctx.closePath();
    const g = ctx.createLinearGradient(-0.6, -1.9, 0.6, -0.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d7e0ea');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = lw * 1.1;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // alça/pescoço colorida
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.44, -1.84);
    ctx.quadraticCurveTo(0, -1.66, 0.44, -1.84);
    ctx.stroke();
    // bolso
    ctx.beginPath();
    ctx.roundRect(-0.28, -1.15, 0.56, 0.34, 0.08);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = lw * 0.9;
    ctx.stroke();
    // colher no bolso
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(0.12, -1.15);
    ctx.lineTo(0.2, -1.4);
    ctx.stroke();
  };
}
