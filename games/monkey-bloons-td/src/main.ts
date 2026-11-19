import './styles.css';
import { MonkeyBloonsGame } from './game';
import { TdNetworkBridge } from './network';
import { TdUiController } from './ui';

function bootstrap(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Elemento #app não encontrado');

  const ui = new TdUiController(root);
  let game: MonkeyBloonsGame | null = null;

  const net = new TdNetworkBridge({
    onStatusChange: (status) => {
      if (status === 'connected') {
        ui.hideStartModal();
        game?.emitUi();
      }
    },
    onPlayersChange: () => {
      game?.emitUi();
    },
    onMessage: (env) => {
      game?.handleRemoteMessage(env.senderId, env.payload);
    },
    onNewPeerConnected: () => {
      game?.sendSnapshotToRoom();
    },
  });

  game = new MonkeyBloonsGame(ui.canvas, net, (snap) => {
    ui.update(snap);
  });

  ui.attachGame(game);
  game.startLoop();
}

bootstrap();
