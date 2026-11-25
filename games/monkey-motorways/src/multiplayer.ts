import { mountMonkeyHud, PeerRoom, type MonkeyHudHandle } from '@monkey-slop/sdk';
import { MONKEY_COLORS } from './constants';
import { MONKEY_MOTORWAYS_CONTROLS } from './controls';
import { gameAudio } from './audio';
import type { TrafficSimulation } from './simulation';
import type {
  MapId,
  NetActor,
  NetMessage,
  RemoteCursor,
  SimSpeed,
  ToolKind,
} from './types';

export interface MultiplayerBridgeCallbacks {
  onRemoteStartGame: (mapId: MapId) => void;
  onSyncReceived: () => void;
  onUpgradeConsensusCheck?: () => void;
  onControlsOpenChange?: (open: boolean) => void;
}

interface PendingOp {
  seq: number;
  msg: NetMessage;
  actor: NetActor;
  ts: number;
}

export class MultiplayerBridge {
  public readonly room: PeerRoom<NetMessage>;
  public readonly hud: MonkeyHudHandle;
  public remoteCursors = new Map<string, RemoteCursor>();

  private sim: TrafficSimulation;
  private cb: MultiplayerBridgeCallbacks;
  private lastCursorSend = 0;
  private lastTickSend = 0;
  private lastFullSnapshotSend = 0;
  private lastSentNetworkVersion = -1;
  private lastSentHouseCount = -1;
  private lastSentMarketCount = -1;
  private lastSentPhase = '';
  private lastAuthNetworkVersion = -1;
  private knownPlayerIds = new Set<string>();
  private localSeq = 0;
  private pendingLocalOps: PendingOp[] = [];
  private wasConnected = false;
  private promotedToHost = false;

  constructor(sim: TrafficSimulation, cb: MultiplayerBridgeCallbacks) {
    this.sim = sim;
    this.cb = cb;

    this.room = new PeerRoom<NetMessage>('monkey-motorways', {
      onStatus: (status, detail) => {
        if (status === 'connected') {
          this.wasConnected = true;
          this.promotedToHost = false;
          const isHost = this.room.localPlayer.isHost;
          this.sim.setAuthoritative(isHost);
          if (!isHost) {
            this.room.send('action:request-sync', { kind: 'action:request-sync' });
          }
        } else if (status === 'idle') {
          this.wasConnected = false;
          this.promotedToHost = false;
          this.pendingLocalOps = [];
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

        for (const id of Array.from(this.remoteCursors.keys())) {
          if (!currentIds.has(id)) {
            this.remoteCursors.delete(id);
          }
        }

        // Anti-softlock: if Host dropped, promote remaining player so match continues smoothly!
        if (
          this.wasConnected &&
          !this.room.localPlayer.isHost &&
          !this.promotedToHost &&
          (players.length === 0 || !players.some((p) => p.isHost))
        ) {
          this.promotedToHost = true;
          this.sim.setAuthoritative(true);
          this.hud.toast('👑 Host saiu! Você assumiu o comando da cidade!', 'banana');
        }

        if (this.isHost()) {
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
      controls: {
        ...MONKEY_MOTORWAYS_CONTROLS,
        onOpenChange: (open) => {
          this.cb.onControlsOpenChange?.(open);
        },
      },
    });
  }

  getLocalActor(): NetActor {
    return {
      id: this.room.localPlayer.id,
      name: this.room.localPlayer.name,
      color: this.room.localPlayer.color,
    };
  }

  isOnline(): boolean {
    return this.room.roomCode !== null && this.room.getPlayers().length > 1 && !this.promotedToHost;
  }

  isHost(): boolean {
    return this.room.roomCode === null || this.room.localPlayer.isHost || this.promotedToHost;
  }

  sendCursor(gx: number, gy: number, tool: ToolKind, drawing: boolean): void {
    if (!this.isOnline()) return;
    const now = performance.now();
    if (now - this.lastCursorSend < 50) return;
    this.lastCursorSend = now;
    this.room.send('cursor', { kind: 'cursor', gx, gy, tool, drawing });
  }

  sendAction(msg: NetMessage): void {
    if (!this.room.roomCode || this.promotedToHost) return;
    this.room.send(msg.kind, msg);
  }

  sendOptimisticMutation(msg: NetMessage): void {
    if (!this.room.roomCode || this.promotedToHost) return;
    const seq = ++this.localSeq;
    const actor = this.getLocalActor();
    const enriched = { ...msg, seq, actor } as NetMessage;
    if (!this.isHost()) {
      this.pendingLocalOps.push({ seq, msg: enriched, actor, ts: performance.now() });
    }
    this.room.send(enriched.kind, enriched);
  }

  emitFx(msg: Extract<NetMessage, { kind: 'event:fx' }>): void {
    if (!this.isOnline() || !this.isHost()) return;
    this.room.send('event:fx', msg);
  }

  sendPing(gx: number, gy: number, emoji: string, text: string): void {
    const actor = this.getLocalActor();
    this.sim.addPing(gx, gy, emoji, text, actor);
    if (this.isOnline()) {
      this.room.send('event:ping', { kind: 'event:ping', gx, gy, emoji, text, actor });
    }
  }

  tickSync(): void {
    if (!this.isOnline() || !this.isHost()) return;
    const now = performance.now();

    const staticChanged =
      this.sim.network.version !== this.lastSentNetworkVersion ||
      this.sim.houses.length !== this.lastSentHouseCount ||
      this.sim.markets.length !== this.lastSentMarketCount ||
      this.sim.phase !== this.lastSentPhase;

    if (staticChanged || now - this.lastFullSnapshotSend >= 2000) {
      this.broadcastSnapshot(false);
      return;
    }

    if (
      (this.sim.phase === 'playing' || this.sim.phase === 'upgrade') &&
      now - this.lastTickSend >= 85
    ) {
      this.lastTickSend = now;
      this.room.send('sync:tick', {
        kind: 'sync:tick',
        tick: this.sim.exportTickSnapshot(),
      });
    }
  }

  broadcastSnapshot(force = false): void {
    if (!this.room.roomCode || !this.isHost() || this.promotedToHost) return;
    const now = performance.now();
    if (!force && now - this.lastFullSnapshotSend < 36) return;
    this.lastFullSnapshotSend = now;
    this.lastTickSend = now;
    this.lastSentNetworkVersion = this.sim.network.version;
    this.lastSentHouseCount = this.sim.houses.length;
    this.lastSentMarketCount = this.sim.markets.length;
    this.lastSentPhase = this.sim.phase;
    this.room.send('sync:snapshot', {
      kind: 'sync:snapshot',
      snapshot: this.sim.exportSnapshot(),
    });
  }

  private applyMutationLocally(msg: NetMessage, actor?: NetActor): boolean {
    switch (msg.kind) {
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
        if (res.added && actor && this.isHost()) {
          this.sim.recordActionStat(actor, res.usedBridge ? 'bridge' : 'road', 1);
          this.sim.recordBuildHistory({
            kind: 'road',
            x: msg.ax,
            y: msg.ay,
            bx: msg.bx,
            by: msg.by,
            isBridge: res.usedBridge,
          });
        }
        return res.added;
      }
      case 'action:road-erase-edge': {
        const removed = this.sim.network.removeEdge(
          msg.ax,
          msg.ay,
          msg.bx,
          msg.by,
          this.sim.map,
          this.sim.inventory,
        );
        if (removed && actor && this.isHost()) {
          this.sim.recordActionStat(actor, 'erase', 1);
        }
        return removed;
      }
      case 'action:erase-cell': {
        const res = this.sim.network.removeCellContentDetailed(
          msg.gx,
          msg.gy,
          this.sim.map,
          this.sim.inventory,
        );
        if (res.changed && actor && this.isHost()) {
          this.sim.recordActionStat(actor, 'erase', 1);
        }
        return res.changed;
      }
      case 'action:light-toggle': {
        const res = this.sim.network.toggleTrafficLight(
          msg.gx,
          msg.gy,
          this.sim.map,
          this.sim.getLookup(),
          this.sim.inventory,
        );
        if (res.changed && res.action === 'added' && actor && this.isHost()) {
          this.sim.recordActionStat(actor, 'light', 1);
          this.sim.recordBuildHistory({ kind: 'light', x: msg.gx, y: msg.gy });
        }
        return res.changed;
      }
      case 'action:roundabout-toggle': {
        const res = this.sim.network.toggleRoundabout(
          msg.gx,
          msg.gy,
          this.sim.map,
          this.sim.getLookup(),
          this.sim.inventory,
        );
        if (res.changed && res.action === 'added' && actor && this.isHost()) {
          this.sim.recordActionStat(actor, 'roundabout', 1);
          this.sim.recordBuildHistory({ kind: 'roundabout', x: msg.gx, y: msg.gy });
        }
        return res.changed;
      }
      case 'action:motorway-add': {
        const id = `mw-${(actor?.id ?? 'p').slice(-4)}-${msg.ax}_${msg.ay}-${msg.bx}_${msg.by}`;
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
        if (res.added && actor && this.isHost()) {
          this.sim.recordActionStat(actor, 'motorway', 1);
          this.sim.recordBuildHistory({
            kind: 'motorway',
            x: msg.ax,
            y: msg.ay,
            bx: msg.bx,
            by: msg.by,
          });
        }
        return res.added;
      }
      case 'action:motorway-remove': {
        const removed = this.sim.network.removeMotorway(msg.id, this.sim.inventory);
        if (removed && actor && this.isHost()) {
          this.sim.recordActionStat(actor, 'erase', 1);
        }
        return removed;
      }
      default:
        return false;
    }
  }

  private handleMessage(senderId: string, senderName: string, msg: NetMessage): void {
    const players = this.room.getPlayers();
    const profile = players.find((p) => p.id === senderId);
    const color = profile?.color ?? '#38bdf8';
    const fallbackActor: NetActor = { id: senderId, name: senderName, color };

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
          this.lastAuthNetworkVersion = msg.snapshot.networkVersion;
          const ackSeq = msg.snapshot.lastProcessedSeq?.[this.room.localPlayer.id] ?? 0;
          const now = performance.now();
          this.pendingLocalOps = this.pendingLocalOps.filter(
            (op) => op.seq > ackSeq && now - op.ts < 2500,
          );

          this.sim.applySnapshot(msg.snapshot);

          // Re-apply unacknowledged local optimistic strokes to eliminate Guest road flicker!
          for (const op of this.pendingLocalOps) {
            this.applyMutationLocally(op.msg, op.actor);
          }
          this.cb.onSyncReceived();
        }
        break;
      }

      case 'sync:tick': {
        if (!this.isHost()) {
          if (msg.tick.networkVersion !== this.lastAuthNetworkVersion) {
            // Host network changed (another player or our acked op) — request fresh full snapshot
            this.room.send('action:request-sync', { kind: 'action:request-sync' });
            return;
          }
          // Temporarily match version when pending local ops exist so tick updates cars/markets smoothly
          const savedVersion = this.sim.network.version;
          this.sim.network.version = this.lastAuthNetworkVersion;
          this.sim.applyTickSnapshot(msg.tick);
          this.sim.network.version = savedVersion;
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

      case 'action:road-add':
      case 'action:road-erase-edge':
      case 'action:erase-cell':
      case 'action:light-toggle':
      case 'action:roundabout-toggle':
      case 'action:motorway-add':
      case 'action:motorway-remove': {
        const actor = msg.actor ?? fallbackActor;
        if (this.isHost() && msg.seq !== undefined) {
          this.sim.lastProcessedSeq[senderId] = Math.max(
            this.sim.lastProcessedSeq[senderId] ?? 0,
            msg.seq,
          );
        }
        const ok = this.applyMutationLocally(msg, actor);
        if (ok) {
          if (msg.kind === 'action:road-add') gameAudio.playRoadDraw(false);
          else if (msg.kind === 'action:road-erase-edge' || msg.kind === 'action:erase-cell' || msg.kind === 'action:motorway-remove') {
            gameAudio.playRoadErase();
          } else {
            gameAudio.playPlaceTool();
          }
          if (this.isHost()) this.broadcastSnapshot(true);
        }
        break;
      }

      case 'action:speed': {
        this.sim.setSpeed(msg.speed as SimSpeed);
        if (this.isHost()) this.broadcastSnapshot(true);
        break;
      }

      case 'action:vote-upgrade': {
        const actor = msg.actor ?? fallbackActor;
        this.sim.castUpgradeVote(actor.id, msg.index);
        if (this.isHost()) {
          this.broadcastSnapshot(true);
          this.cb.onUpgradeConsensusCheck?.();
        }
        break;
      }

      case 'action:pick-upgrade': {
        if (this.isHost()) {
          this.sim.pickUpgrade(msg.index);
          this.broadcastSnapshot(true);
        }
        break;
      }

      case 'event:ping': {
        const actor = msg.actor ?? fallbackActor;
        this.sim.addPing(msg.gx, msg.gy, msg.emoji, msg.text, actor);
        break;
      }

      case 'event:fx': {
        if (this.isHost()) break;
        if (msg.fx === 'delivery' && msg.x !== undefined && msg.y !== undefined && msg.color) {
          gameAudio.playDelivery();
          const theme = MONKEY_COLORS[msg.color];
          this.sim.spawnBurst(msg.x, msg.y, theme.fill, 7, theme.fruitEmoji);
          this.sim.addFloatingText(msg.x, msg.y - 0.4, '+1 🍌', theme.fill);
        } else if (msg.fx === 'horn') {
          gameAudio.playHorn();
        } else if (msg.fx === 'mega' && msg.x !== undefined && msg.y !== undefined && msg.color) {
          gameAudio.playSpawnBuilding();
          this.sim.addFloatingText(
            msg.x,
            msg.y,
            msg.text ?? 'MEGA FEIRA! 🔥',
            MONKEY_COLORS[msg.color].fill,
          );
        } else if (msg.fx === 'milestone' && msg.value) {
          this.sim.triggerMilestoneFX(msg.value);
        } else if (msg.fx === 'overload-warn') {
          gameAudio.playWarning(Boolean(msg.value));
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
