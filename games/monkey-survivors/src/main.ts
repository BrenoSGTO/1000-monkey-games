import { mountMonkeyHud, PeerRoom } from '@monkey-slop/sdk';
import { MONKEY_SURVIVORS_CONTROLS } from './controls';
import { MonkeySurvivorsGame } from './game';
import type { NetMessage } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Elemento #game-canvas não encontrado!');
}

let game: MonkeySurvivorsGame | null = null;

const room = new PeerRoom<NetMessage>('monkey-survivors', {
  onPlayersChange: (players) => {
    game?.onPlayersChange(players);
  },
  onMessage: (envelope) => {
    game?.onNetMessage(envelope.payload, envelope.senderId, envelope.senderName);
  },
});

const hud = mountMonkeyHud({
  slug: 'monkey-survivors',
  title: 'Macaco Survivors: A Horda do Boleto',
  room,
  controls: {
    ...MONKEY_SURVIVORS_CONTROLS,
    onOpenChange: (open) => {
      game?.setControlsGuideOpen(open);
    },
  },
});

game = new MonkeySurvivorsGame(canvas, room, hud);
