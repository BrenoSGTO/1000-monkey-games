import { MonkeyAmongUsGame } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Canvas #game-canvas not found');
}

new MonkeyAmongUsGame(canvas);
