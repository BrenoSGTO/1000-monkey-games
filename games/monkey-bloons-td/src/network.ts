import { mountMonkeyHud, PeerRoom, type MonkeyHudHandle } from '@monkey-slop/sdk';
import type { PeerEnvelope, PlayerProfile } from '@monkey-slop/sdk';
import type { TdNetMessage } from './types';

export interface NetworkBridgeCallbacks {
  onPlayersChange: (players: PlayerProfile[]) => void;
  onStatusChange: (status: 'idle' | 'connecting' | 'connected' | 'error', detail?: string) => void;
  onMessage: (envelope: PeerEnvelope<TdNetMessage>) => void;
  onNewPeerConnected?: () => void;
}

export class TdNetworkBridge {
  public readonly room: PeerRoom<TdNetMessage>;
  public readonly hud: MonkeyHudHandle;
  private knownPlayerIds = new Set<string>();

  constructor(callbacks: NetworkBridgeCallbacks) {
    this.room = new PeerRoom<TdNetMessage>('monkey-bloons-td', {
      onStatus: (status, detail) => {
        callbacks.onStatusChange(status, detail);
      },
      onPlayersChange: (players) => {
        this.hud.setPlayers(players);
        const currentIds = new Set(players.map((p) => p.id));
        const hasNewPeer =
          this.room.localPlayer.isHost &&
          players.some((p) => p.id !== this.room.localPlayer.id && !this.knownPlayerIds.has(p.id));
        this.knownPlayerIds = currentIds;
        callbacks.onPlayersChange(players);
        if (hasNewPeer) {
          callbacks.onNewPeerConnected?.();
        }
      },
      onMessage: (env) => {
        callbacks.onMessage(env);
      },
    });

    this.hud = mountMonkeyHud<TdNetMessage>({
      slug: 'monkey-bloons-td',
      title: 'Macaco Estoura-Bexiga TD',
      room: this.room,
    });
  }

  isOnline(): boolean {
    return this.room.getPlayers().length > 1;
  }

  isInRoom(): boolean {
    return this.room.roomCode !== null;
  }

  isHost(): boolean {
    return !this.isInRoom() || this.room.localPlayer.isHost;
  }

  getOtherPlayers(): PlayerProfile[] {
    return this.room.getPlayers().filter((p) => p.id !== this.room.localPlayer.id);
  }

  send(msg: TdNetMessage): void {
    if (!this.isInRoom()) return;
    this.room.send(msg.action, msg);
  }

  toast(message: string, tone: 'banana' | 'chaos' | 'info' = 'banana'): void {
    this.hud.toast(message, tone);
  }

  destroy(): void {
    this.room.disconnect();
    this.hud.destroy();
  }
}
