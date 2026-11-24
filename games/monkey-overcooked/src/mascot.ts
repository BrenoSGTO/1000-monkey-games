/**
 * mascot.ts — dupla de macacos-chef animada no cabeçalho do menu.
 * Só decoração: roda apenas enquanto o menu está visível.
 */
import { HANDS, drawMonkey, makeFace } from './monkeyart';
import { chefApron, chefHat, chefStyle } from './monkeylook';

const canvas = document.getElementById('mo-mascot') as HTMLCanvasElement | null;
const overlay = document.getElementById('menu-overlay');

if (canvas && overlay) {
  const dpr = Math.min(2, window.devicePixelRatio || 1) * 1.5;
  const W = 150;
  const H = 96;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const t0 = performance.now();
    const frame = (now: number): void => {
      requestAnimationFrame(frame);
      if (overlay.classList.contains('hidden')) return;
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const chefs = [
        { x: 40, idx: 0, color: '#facc15', dir: 1, mood: 'cheer' as const },
        { x: 108, idx: 1, color: '#4ade80', dir: -1, mood: 'shouting' as const },
      ];
      for (const c of chefs) {
        const hop = Math.max(0, Math.sin(t * 4 + c.idx * 1.7)) * 5;
        ctx.save();
        ctx.translate(c.x, H - 6 - hop);
        drawMonkey(ctx, {
          style: chefStyle(c.idx),
          face: makeFace(c.mood, t, c.idx * 3, { x: c.dir * 0.4, y: 0 }),
          height: 60,
          turn: c.dir * 0.5,
          breathe: Math.sin(t * 2.4 + c.idx),
          tailPhase: t * 6 + c.idx,
          tailAmp: 0.6,
          tailSide: c.dir > 0 ? -1 : 1,
          earFlop: Math.sin(t * 4 + c.idx) * 0.4,
          armL: HANDS.cheer(-1, t * 7 + c.idx),
          armR: HANDS.cheer(1, t * 7 + c.idx),
          tuft: false,
          accessory: chefHat(c.color, t, false),
          bodyAccessory: chefApron(c.color),
          outlinePx: 2.2,
        });
        ctx.restore();
      }
    };
    requestAnimationFrame(frame);
  }
}
