import {
  mountMonkeyHud,
  PeerRoom,
  type MonkeyHudHandle,
  type PeerEnvelope,
  type PlayerProfile,
} from '@monkey-slop/sdk';
import type { BridgeNetMessage, RemoteCursor, ToolId } from './types';

export interface NetHandlers {
  onRemoteCursor: (cursor: RemoteCursor) => void;
  onRemoteMessage: (msg: BridgeNetMessage, senderId: string, senderName: string) => void;
  onPlayerJoinedAsHost: () => void;
  onPlayersUpdated?: (players: PlayerProfile[]) => void;
}

export class BridgeNetClient {
  public room: PeerRoom<BridgeNetMessage>;
  public hud: MonkeyHudHandle;
  private lastCursorSent = 0;
  private prevPlayerCount = 0;

  constructor(handlers: NetHandlers) {
    this.room = new PeerRoom<BridgeNetMessage>('monkey-polybridge', {
      onPlayersChange: (players) => {
        this.hud.setPlayers(players);
        handlers.onPlayersUpdated?.(players);
        if (this.room.localPlayer.isHost && players.length > this.prevPlayerCount) {
          handlers.onPlayerJoinedAsHost();
        }
        this.prevPlayerCount = players.length;
      },
      onMessage: (env: PeerEnvelope<BridgeNetMessage>) => {
        const msg = env.payload;
        if (!msg) return;
        if (msg.kind === 'cursor') {
          handlers.onRemoteCursor({
            peerId: env.senderId,
            name: env.senderName || 'Macaco',
            color: msg.color,
            x: msg.x,
            y: msg.y,
            tool: msg.tool,
            dragStart: msg.dragStart ?? null,
            lastSeen: performance.now(),
          });
          return;
        }
        handlers.onRemoteMessage(msg, env.senderId, env.senderName);
      },
    });

    this.hud = mountMonkeyHud({
      slug: 'monkey-polybridge',
      title: 'Ponte de Cipó & Gambiarra',
      room: this.room,
    });
  }

  public isConnected(): boolean {
    return this.room.roomCode !== null;
  }

  public send(msg: BridgeNetMessage): void {
    if (!this.isConnected()) return;
    this.room.send('bridge', msg);
  }

  public sendCursor(
    x: number,
    y: number,
    tool: ToolId,
    dragStart?: { x: number; y: number } | null,
  ): void {
    if (!this.isConnected()) return;
    const now = performance.now();
    if (now - this.lastCursorSent < 48) return;
    this.lastCursorSent = now;
    this.room.send('bridge', {
      kind: 'cursor',
      x,
      y,
      tool,
      color: this.room.localPlayer.color,
      dragStart: dragStart ?? null,
    });
  }
}
