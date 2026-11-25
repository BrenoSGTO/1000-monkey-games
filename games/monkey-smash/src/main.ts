import { mountMonkeyHud, PeerRoom } from '@monkey-slop/sdk';
import { monkeySmashControls } from './controls';
import { Game } from './game';
import type { NetMsg } from './net';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Elemento #game-canvas não encontrado!');
}

let game: Game | null = null;

const room = new PeerRoom<NetMsg>('monkey-smash', {
  onPlayersChange: (players) => {
    game?.onPlayersChange(players);
  },
  onMessage: (envelope) => {
    game?.onNetMessage(envelope.payload, envelope.senderId);
  },
});

const hud = mountMonkeyHud({
  slug: 'monkey-smash',
  title: 'Super Smash Macacos: Briga na Bananeira',
  room,
  controls: {
    ...monkeySmashControls,
    onOpenChange: (open) => game?.setControlsOpen(open),
  },
});

game = new Game(canvas, room);
game.attachHud(hud);
