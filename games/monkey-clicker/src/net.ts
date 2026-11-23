import { PeerRoom, type PlayerProfile } from '@monkey-slop/sdk';
import type { GameMode, NetMessage, RaceEntry, RemoteCursor } from './types';

export interface ClickerNetCallbacks {
  onPlayersChange: (players: PlayerProfile[]) => void;
  onStatusChange: (detail: string) => void;
  onRemoteCursor: (senderId: string, senderName: string, color: string, nx: number, ny: number) => void;
  onRemoteCoopClick: (senderId: string, senderName: string, color: string, msg: Extract<NetMessage, { kind: 'coop_click' }>) => void;
  onCoopBuyBuilding: (buildingId: string, amount: number) => void;
  onCoopBuyUpgrade: (upgradeId: string) => void;
  onCoopHitGolden: (goldenId: string) => void;
  onCoopHitChaos: () => void;
  onCoopHitRain: (rainId: string) => void;
  onCoopSnapshot: (snap: Extract<NetMessage, { kind: 'coop_snapshot' }>) => void;
  onStartMatch: (mode: GameMode, raceGoal: number) => void;
  onVersusProgress: (senderId: string, senderName: string, color: string, msg: Extract<NetMessage, { kind: 'versus_progress' }>) => void;
  onVersusWin: (msg: Extract<NetMessage, { kind: 'versus_win' }>) => void;
}

export class ClickerNet {
  public readonly room: PeerRoom<NetMessage>;
  public remoteCursors = new Map<string, RemoteCursor>();
  public raceEntries = new Map<string, RaceEntry>();
  private callbacks: ClickerNetCallbacks;
  private lastCursorAt = 0;
  private lastSnapAt = 0;
  private lastRaceAt = 0;

  constructor(callbacks: ClickerNetCallbacks) {
    this.callbacks = callbacks;
    this.room = new PeerRoom<NetMessage>('monkey-clicker', {
      onStatus: (_status, detail) => {
        if (detail) this.callbacks.onStatusChange(detail);
      },
      onPlayersChange: (players) => {
        const activeIds = new Set(players.map((p) => p.id));
        for (const id of this.remoteCursors.keys()) {
          if (!activeIds.has(id)) this.remoteCursors.delete(id);
        }
        for (const id of this.raceEntries.keys()) {
          if (!activeIds.has(id)) this.raceEntries.delete(id);
        }
        this.callbacks.onPlayersChange(players);
      },
      onMessage: (env) => {
        const msg = env.payload;
        if (!msg || typeof msg.kind !== 'string') return;
        const player = this.room.getPlayers().find((p) => p.id === env.senderId);
        const color = player?.color || '#38bdf8';

        switch (msg.kind) {
          case 'cursor': {
            this.upsertCursor(env.senderId, env.senderName, color, msg.nx, msg.ny, false);
            this.callbacks.onRemoteCursor(env.senderId, env.senderName, color, msg.nx, msg.ny);
            break;
          }
          case 'coop_click': {
            this.upsertCursor(env.senderId, env.senderName, color, msg.nx, msg.ny, true);
            this.callbacks.onRemoteCoopClick(env.senderId, env.senderName, color, msg);
            break;
          }
          case 'coop_buy_building': {
            if (this.isHost()) this.callbacks.onCoopBuyBuilding(msg.buildingId, msg.amount);
            break;
          }
          case 'coop_buy_upgrade': {
            if (this.isHost()) this.callbacks.onCoopBuyUpgrade(msg.upgradeId);
            break;
          }
          case 'coop_hit_golden': {
            if (this.isHost()) this.callbacks.onCoopHitGolden(msg.goldenId);
            break;
          }
          case 'coop_hit_chaos': {
            if (this.isHost()) this.callbacks.onCoopHitChaos();
            break;
          }
          case 'coop_hit_rain': {
            if (this.isHost()) this.callbacks.onCoopHitRain(msg.rainId);
            break;
          }
          case 'coop_snapshot': {
            if (!this.isHost()) this.callbacks.onCoopSnapshot(msg);
            break;
          }
          case 'start_match': {
            if (!this.isHost()) this.callbacks.onStartMatch(msg.mode, msg.raceGoal);
            break;
          }
          case 'versus_progress': {
            this.raceEntries.set(env.senderId, {
              id: env.senderId,
              name: env.senderName,
              color,
              bananas: msg.bananas,
              bps: msg.bps,
              evolutionLevel: msg.evolutionLevel,
              finishedAt: msg.finishedAt,
            });
            this.callbacks.onVersusProgress(env.senderId, env.senderName, color, msg);
            break;
          }
          case 'versus_win': {
            this.callbacks.onVersusWin(msg);
            break;
          }
        }
      },
    });
  }

  private upsertCursor(
    id: string,
    name: string,
    color: string,
    nx: number,
    ny: number,
    clicked: boolean,
  ): void {
    const prev = this.remoteCursors.get(id);
    this.remoteCursors.set(id, {
      id,
      name,
      color,
      nx,
      ny,
      lastSeen: performance.now(),
      clickFlash: clicked ? 1 : prev ? prev.clickFlash : 0,
    });
  }

  public isConnected(): boolean {
    return Boolean(this.room.roomCode) && this.room.getPlayers().length > 1;
  }

  public isInRoom(): boolean {
    return Boolean(this.room.roomCode);
  }

  public isHost(): boolean {
    return !this.room.roomCode || this.room.localPlayer.isHost;
  }

  public sendCursor(nx: number, ny: number): void {
    if (!this.isConnected()) return;
    const now = performance.now();
    if (now - this.lastCursorAt < 40) return;
    this.lastCursorAt = now;
    this.room.send('cursor', { kind: 'cursor', nx, ny });
  }

  public sendCoopClick(nx: number, ny: number, power: number, isCrit: boolean): void {
    if (!this.isConnected()) return;
    this.room.send('coop_click', { kind: 'coop_click', nx, ny, power, isCrit });
  }

  public sendCoopBuyBuilding(buildingId: string, amount: number): void {
    if (!this.isConnected() || this.isHost()) return;
    this.room.send('coop_buy_building', { kind: 'coop_buy_building', buildingId, amount });
  }

  public sendCoopBuyUpgrade(upgradeId: string): void {
    if (!this.isConnected() || this.isHost()) return;
    this.room.send('coop_buy_upgrade', { kind: 'coop_buy_upgrade', upgradeId });
  }

  public sendCoopHitGolden(goldenId: string): void {
    if (!this.isConnected() || this.isHost()) return;
    this.room.send('coop_hit_golden', { kind: 'coop_hit_golden', goldenId });
  }

  public sendCoopHitChaos(): void {
    if (!this.isConnected() || this.isHost()) return;
    this.room.send('coop_hit_chaos', { kind: 'coop_hit_chaos' });
  }

  public sendCoopHitRain(rainId: string): void {
    if (!this.isConnected() || this.isHost()) return;
    this.room.send('coop_hit_rain', { kind: 'coop_hit_rain', rainId });
  }

  public broadcastCoopSnapshot(
    snap: Omit<Extract<NetMessage, { kind: 'coop_snapshot' }>, 'kind'>,
    force = false,
  ): void {
    if (!this.isConnected() || !this.isHost()) return;
    const now = performance.now();
    if (!force && now - this.lastSnapAt < 90) return;
    this.lastSnapAt = now;
    this.room.send('coop_snapshot', { kind: 'coop_snapshot', ...snap });
  }

  public broadcastStartMatch(mode: GameMode, raceGoal: number): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.room.send('start_match', { kind: 'start_match', mode, raceGoal });
  }

  public sendVersusProgress(
    bananas: number,
    bps: number,
    evolutionLevel: number,
    finishedAt?: number,
    force = false,
  ): void {
    if (!this.isConnected()) return;
    const now = performance.now();
    if (!force && now - this.lastRaceAt < 180) return;
    this.lastRaceAt = now;
    this.room.send('versus_progress', {
      kind: 'versus_progress',
      bananas,
      bps,
      evolutionLevel,
      finishedAt,
    });
  }

  public broadcastVersusWin(winnerId: string, winnerName: string, elapsedSec: number): void {
    if (!this.isConnected()) return;
    this.room.send('versus_win', {
      kind: 'versus_win',
      winnerId,
      winnerName,
      elapsedSec,
    });
  }

  public stepVisuals(dt: number): void {
    const now = performance.now();
    for (const [id, c] of this.remoteCursors.entries()) {
      c.clickFlash = Math.max(0, c.clickFlash - dt * 3.5);
      if (now - c.lastSeen > 8000) {
        this.remoteCursors.delete(id);
      }
    }
  }
}
