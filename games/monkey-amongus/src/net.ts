import { mountMonkeyHud, type MonkeyHudHandle, PeerRoom } from '@monkey-slop/sdk';
import { MONKEY_AMONGUS_CONTROLS } from './controls';
import type { NetMessage } from './types';

export interface NetCallbacks {
  onPlayersChange: () => void;
  onMessage: (senderId: string, senderName: string, msg: NetMessage) => void;
  onConnectedChange: () => void;
  onControlsOpenChange?: (open: boolean) => void;
}

export class GameNetwork {
  public room: PeerRoom<NetMessage>;
  public hud: MonkeyHudHandle;
  private callbacks: NetCallbacks;

  constructor(callbacks: NetCallbacks) {
    this.callbacks = callbacks;
    this.room = new PeerRoom<NetMessage>('monkey-amongus', {
      onPlayersChange: (players) => {
        this.hud.setPlayers(players);
        this.callbacks.onPlayersChange();
      },
      onStatus: (status, detail) => {
        if (status === 'connected' && detail) {
          this.hud.toast(detail, 'banana');
        } else if (status === 'error' && detail) {
          this.hud.toast(`Erro P2P: ${detail}`, 'chaos');
        }
        this.callbacks.onConnectedChange();
      },
      onMessage: (env) => {
        this.callbacks.onMessage(env.senderId, env.senderName, env.payload);
      },
    });

    this.hud = mountMonkeyHud<NetMessage>({
      slug: 'monkey-amongus',
      title: 'Entre Macacos: Quem Roubou a Banana?',
      room: this.room,
      controls: {
        ...MONKEY_AMONGUS_CONTROLS,
        onOpenChange: (open) => this.callbacks.onControlsOpenChange?.(open),
      },
    });
  }

  getLocalId(): string {
    return this.room.localPlayer.id;
  }

  isEffectiveHost(): boolean {
    if (!this.room.roomCode) return true; // Solo / offline acts as host
    return this.room.localPlayer.isHost;
  }

  isOnline(): boolean {
    return Boolean(this.room.roomCode);
  }

  broadcast(msg: NetMessage): void {
    if (!this.room.roomCode) return;
    this.room.send('ma:msg', msg);
  }
}
