import { S } from './state';
import { render } from './render';
import { initGame, update } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;
const g = canvas.getContext('2d')!;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

window.addEventListener('resize', resize);
resize();
initGame(canvas, uiRoot);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    update(dt);
    render(g, canvas.width, canvas.height);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as { __valley: typeof S }).__valley = S;
(window as unknown as { __valleyStep: (n: number, dt?: number) => void }).__valleyStep = (n, dt = 0.05) => {
  for (let i = 0; i < n; i++) update(dt);
  render(g, canvas.width, canvas.height);
};
