import { mountMonkeyHud, PeerRoom } from '@monkey-slop/sdk';
import { MONKEY_CELLS_CONTROLS } from './controls';
import { HollowChimpGame } from './game';
import type { NetMessage } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Elemento #game-canvas não encontrado!');
}

let game: HollowChimpGame | null = null;

const room = new PeerRoom<NetMessage>('monkey-cells', {
  onPlayersChange: (players) => {
    game?.onPlayersChange(players);
  },
  onMessage: (envelope) => {
    game?.onNetMessage(envelope.payload, envelope.senderId, envelope.senderName);
  },
});

const hud = mountMonkeyHud({
  slug: 'monkey-cells',
  title: 'Hollow Chimp: Masmorra da Banana',
  room,
  controls: {
    ...MONKEY_CELLS_CONTROLS,
    onOpenChange: (open) => game?.setPausedByGuide(open),
  },
});

game = new HollowChimpGame(canvas, room, hud);
