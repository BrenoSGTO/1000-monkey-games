import { Game } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#game-canvas nao encontrado');
new Game(canvas);
