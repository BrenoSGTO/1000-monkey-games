import { mountMonkeyHud, PeerRoom, type MonkeyHudHandle } from '@monkey-slop/sdk';
import { gameAudio } from './audio';
import type { TrafficSimulation } from './simulation';
import type { MapId, NetMessage, RemoteCursor, SimSpeed, ToolKind } from './types';

export interface MultiplayerBridgeCallbacks {
  onRemoteStartGame: (mapId: MapId) => void;
  onSyncReceived: () => void;
}

export class MultiplayerBridge {
  public readonly room: PeerRoom<NetMessage>;
  public readonly hud: MonkeyHudHandle;
  public remoteCursors = new Map<string, RemoteCursor>();

  private sim: TrafficSimulation;
  private cb: MultiplayerBridgeCallbacks;
  private lastCursorSend = 0;
  private lastSnapshotSend = 0;
  private knownPlayerIds = new Set<string>();

  constructor(sim: TrafficSimulation, cb: MultiplayerBridgeCallbacks) {
    this.sim = sim;
    this.cb = cb;

    this.room = new PeerRoom<NetMessage>('monkey-motorways', {
      onStatus: (status, detail) => {
        if (status === 'connected') {
          const isHost = this.room.localPlayer.isHost;
          this.sim.setAuthoritative(isHost);
          if (!isHost) {
            this.room.send('action:request-sync', { kind: 'action:request-sync' });
          }
        } else if (status === 'idle') {
          this.sim.setAuthoritative(true);
          this.remoteCursors.clear();
        }
        if (detail && status === 'error') {
          this.hud.toast(`Co-op: ${detail}`, 'chaos');
        }
      },
      onPlayersChange: (players) => {
        this.hud.setPlayers(players);
        const currentIds = new Set(players.map((p) => p.id));

        // Clean up cursors of disconnected players
        for (const id of Array.from(this.remoteCursors.keys())) {
          if (!currentIds.has(id)) {
            this.remoteCursors.delete(id);
          }
        }

        // If host sees a newly joined guest, send immediate full snapshot
        if (this.room.localPlayer.isHost) {
          for (const p of players) {
            if (p.id !== this.room.localPlayer.id && !this.knownPlayerIds.has(p.id)) {
              this.broadcastSnapshot(true);
              this.hud.toast(`🐒 ${p.name} entrou para ajudar no trânsito!`, 'banana');
            }
          }
        }
        this.knownPlayerIds = currentIds;
      },
      onMessage: (env) => {
        if (env.senderId === this.room.localPlayer.id) return;
        this.handleMessage(env.senderId, env.senderName, env.payload);
      },
    });

    this.hud = mountMonkeyHud({
      slug: 'monkey-motorways',
      title: 'Mini Macacoways',
      room: this.room,
    });
  }

  isOnline(): boolean {
    return this.room.roomCode !== null && this.room.getPlayers().length > 1;
  }

  isHost(): boolean {
    return this.room.roomCode === null || this.room.localPlayer.isHost;
  }

  sendCursor(gx: number, gy: number, tool: ToolKind, drawing: boolean): void {
    if (!this.isOnline()) return;
    const now = performance.now();
    if (now - this.lastCursorSend < 55) return;
    this.lastCursorSend = now;
    this.room.send('cursor', { kind: 'cursor', gx, gy, tool, drawing });
  }

  sendAction(msg: NetMessage): void {
    if (!this.room.roomCode) return;
    this.room.send(msg.kind, msg);
  }

  tickSync(): void {
    if (!this.isOnline() || !this.isHost()) return;
    const now = performance.now();
    if (now - this.lastSnapshotSend >= 115) {
      this.broadcastSnapshot(false);
    }
  }

  broadcastSnapshot(force = false): void {
    if (!this.room.roomCode || !this.isHost()) return;
    const now = performance.now();
    if (!force && now - this.lastSnapshotSend < 40) return;
    this.lastSnapshotSend = now;
    this.room.send('sync:snapshot', {
      kind: 'sync:snapshot',
      snapshot: this.sim.exportSnapshot(),
    });
  }

  private handleMessage(senderId: string, senderName: string, msg: NetMessage): void {
    const players = this.room.getPlayers();
    const profile = players.find((p) => p.id === senderId);
    const color = profile?.color ?? '#38bdf8';

    switch (msg.kind) {
      case 'cursor': {
        this.remoteCursors.set(senderId, {
          playerId: senderId,
          name: senderName,
          color,
          gx: msg.gx,
          gy: msg.gy,
          tool: msg.tool,
          drawing: msg.drawing,
          lastSeen: performance.now(),
        });
        break;
      }

      case 'action:request-sync': {
        if (this.isHost()) {
          this.broadcastSnapshot(true);
        }
        break;
      }

      case 'sync:snapshot': {
        if (!this.isHost()) {
          this.sim.applySnapshot(msg.snapshot);
          this.cb.onSyncReceived();
        }
        break;
      }

      case 'action:start-game': {
        if (this.isHost()) {
          this.cb.onRemoteStartGame(msg.mapId);
          this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:road-add': {
        const res = this.sim.network.addEdge(
          msg.ax,
          msg.ay,
          msg.bx,
          msg.by,
          this.sim.map,
          this.sim.getLookup(),
          this.sim.inventory,
        );
        if (res.added) {
          gameAudio.playRoadDraw(res.usedBridge);
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:road-erase-edge': {
        if (
          this.sim.network.removeEdge(
            msg.ax,
            msg.ay,
            msg.bx,
            msg.by,
            this.sim.map,
            this.sim.inventory,
          )
        ) {
          gameAudio.playRoadErase();
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:erase-cell': {
        if (
          this.sim.network.removeCellContent(
            msg.gx,
            msg.gy,
            this.sim.map,
            this.sim.inventory,
          )
        ) {
          gameAudio.playRoadErase();
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:light-toggle': {
        const res = this.sim.network.toggleTrafficLight(
          msg.gx,
          msg.gy,
          this.sim.map,
          this.sim.getLookup(),
          this.sim.inventory,
        );
        if (res.changed) {
          gameAudio.playPlaceTool();
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:roundabout-toggle': {
        const res = this.sim.network.toggleRoundabout(
          msg.gx,
          msg.gy,
          this.sim.map,
          this.sim.getLookup(),
          this.sim.inventory,
        );
        if (res.changed) {
          gameAudio.playPlaceTool();
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:motorway-add': {
        const id = `mw-${senderId.slice(-4)}-${Date.now().toString(36)}`;
        const res = this.sim.network.addMotorway(
          msg.ax,
          msg.ay,
          msg.bx,
          msg.by,
          this.sim.map,
          this.sim.getLookup(),
          this.sim.inventory,
          id,
        );
        if (res.added) {
          gameAudio.playPlaceTool();
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:motorway-remove': {
        if (this.sim.network.removeMotorway(msg.id, this.sim.inventory)) {
          gameAudio.playRoadErase();
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:speed': {
        this.sim.setSpeed(msg.speed as SimSpeed);
        if (this.isHost()) this.broadcastSnapshot(true);
        break;
      }

      case 'action:pick-upgrade': {
        if (this.isHost()) {
          this.sim.pickUpgrade(msg.index);
          this.broadcastSnapshot(true);
        }
        break;
      }

      case 'event:toast': {
        this.hud.toast(msg.message, msg.tone ?? 'info');
        break;
      }
    }
  }
}
