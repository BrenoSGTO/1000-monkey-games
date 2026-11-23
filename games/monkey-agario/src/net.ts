import { mountMonkeyHud, type MonkeyHudHandle, PeerRoom, type PlayerProfile } from '@monkey-slop/sdk';
import { massToRadius } from './skins';
import type {
  CactusVirus,
  FoodPellet,
  GameEvent,
  GameMode,
  LeaderboardEntry,
  MonkeyCell,
  NetMessage,
  PlayerInput,
  SkinId,
  SnapshotPayload,
  TeamId,
} from './types';

export interface InterpCell {
  id: number;
  ownerId: string;
  name: string;
  skin: SkinId;
  team: TeamId;
  x: number;
  y: number;
  tx: number;
  ty: number;
  mass: number;
  tmass: number;
  isBot: boolean;
  lookAngle: number;
  tLookAngle: number;
  mouthOpen: number;
  scared: number;
  wobblePhase: number;
  wobbleAmp: number;
}

export interface GuestState {
  mode: GameMode;
  arenaSize: number;
  cells: Map<number, InterpCell>;
  cacti: Map<number, CactusVirus>;
  naturalFood: Map<number, FoodPellet>;
  ejectedFood: Map<number, FoodPellet>;
  leaderboard: LeaderboardEntry[];
  teamMass: [number, number];
}

export interface NetCallbacks {
  onPlayersChange: (players: PlayerProfile[]) => void;
  onRemoteInput: (senderId: string, input: PlayerInput) => void;
  onModeChanged: (mode: GameMode) => void;
  onSnapshot: (snap: SnapshotPayload) => void;
  onConnectedChange: () => void;
}

export class AgarioNetwork {
  public room: PeerRoom<NetMessage>;
  public hud: MonkeyHudHandle;
  private callbacks: NetCallbacks;

  constructor(callbacks: NetCallbacks) {
    this.callbacks = callbacks;
    this.room = new PeerRoom<NetMessage>('monkey-agario', {
      onPlayersChange: (players) => {
        this.hud.setPlayers(players);
        this.callbacks.onPlayersChange(players);
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
        const msg = env.payload;
        if (!msg) return;
        if (msg.kind === 'input' && this.isEffectiveHost()) {
          this.callbacks.onRemoteInput(env.senderId, msg.input);
        } else if (msg.kind === 'snapshot' && !this.isEffectiveHost()) {
          this.callbacks.onSnapshot(msg.snap);
        } else if (msg.kind === 'mode') {
          this.callbacks.onModeChanged(msg.mode);
        }
      },
    });

    this.hud = mountMonkeyHud<NetMessage>({
      slug: 'monkey-agario',
      title: 'Agar.Mico: Macaco Come Macaco',
      room: this.room,
    });
  }

  getLocalId(): string {
    return this.room.localPlayer.id;
  }

  isOnline(): boolean {
    return Boolean(this.room.roomCode);
  }

  isEffectiveHost(): boolean {
    if (!this.room.roomCode) return true;
    return this.room.localPlayer.isHost;
  }

  sendInput(input: PlayerInput): void {
    if (!this.room.roomCode || this.isEffectiveHost()) return;
    this.room.send('ag:msg', { kind: 'input', input });
  }

  broadcastSnapshot(snap: SnapshotPayload): void {
    if (!this.room.roomCode || !this.isEffectiveHost()) return;
    this.room.send('ag:msg', { kind: 'snapshot', snap });
  }

  broadcastMode(mode: GameMode): void {
    if (!this.room.roomCode || !this.isEffectiveHost()) return;
    this.room.send('ag:msg', { kind: 'mode', mode });
  }
}

export function createGuestState(): GuestState {
  return {
    mode: 'ffa',
    arenaSize: 3800,
    cells: new Map(),
    cacti: new Map(),
    naturalFood: new Map(),
    ejectedFood: new Map(),
    leaderboard: [],
    teamMass: [0, 0],
  };
}

export function applySnapshotToGuest(
  guest: GuestState,
  snap: SnapshotPayload,
): { events: GameEvent[]; deaths: SnapshotPayload['deaths'] } {
  guest.mode = snap.mode;
  guest.arenaSize = snap.arenaSize;
  guest.leaderboard = snap.leaderboard;
  guest.teamMass = snap.teamMass;

  // Reconcile cells
  const seenCellIds = new Set<number>();
  for (const sc of snap.cells) {
    seenCellIds.add(sc.id);
    const existing = guest.cells.get(sc.id);
    if (existing) {
      existing.ownerId = sc.o;
      existing.name = sc.n;
      existing.skin = sc.s;
      existing.team = sc.t;
      existing.tx = sc.x;
      existing.ty = sc.y;
      existing.tmass = sc.m;
      existing.tLookAngle = sc.a;
      existing.mouthOpen = Math.max(existing.mouthOpen, sc.mo);
      existing.scared = sc.sc;
    } else {
      guest.cells.set(sc.id, {
        id: sc.id,
        ownerId: sc.o,
        name: sc.n,
        skin: sc.s,
        team: sc.t,
        x: sc.x,
        y: sc.y,
        tx: sc.x,
        ty: sc.y,
        mass: sc.m,
        tmass: sc.m,
        isBot: sc.b,
        lookAngle: sc.a,
        tLookAngle: sc.a,
        mouthOpen: sc.mo,
        scared: sc.sc,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleAmp: 0.06,
      });
    }
  }
  for (const id of guest.cells.keys()) {
    if (!seenCellIds.has(id)) guest.cells.delete(id);
  }

  // Reconcile cacti
  const seenCacti = new Set<number>();
  for (const ca of snap.cacti) {
    seenCacti.add(ca.id);
    const ex = guest.cacti.get(ca.id);
    if (ex) {
      ex.x += (ca.x - ex.x) * 0.5;
      ex.y += (ca.y - ex.y) * 0.5;
      ex.mass = ca.m;
    } else {
      guest.cacti.set(ca.id, {
        id: ca.id,
        x: ca.x,
        y: ca.y,
        vx: 0,
        vy: 0,
        mass: ca.m,
        hits: 0,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }
  for (const id of guest.cacti.keys()) {
    if (!seenCacti.has(id)) guest.cacti.delete(id);
  }

  // Natural food (sent periodically)
  if (snap.food) {
    const nextNatural = new Map<number, FoodPellet>();
    for (let i = 0; i < snap.food.length; i += 4) {
      const id = snap.food[i];
      const x = snap.food[i + 1];
      const y = snap.food[i + 2];
      const kindInt = snap.food[i + 3];
      const old = guest.naturalFood.get(id);
      nextNatural.set(id, {
        id,
        x,
        y,
        vx: 0,
        vy: 0,
        mass: kindInt === 1 ? 5.5 : 1.7,
        kind: kindInt === 1 ? 'cacho' : 'banana',
        rot: old ? old.rot : (id * 1.37) % (Math.PI * 2),
        age: 1,
      });
    }
    guest.naturalFood = nextNatural;
  }

  // Ejected food (sent every tick)
  const nextEjected = new Map<number, FoodPellet>();
  for (let i = 0; i < snap.ejected.length; i += 4) {
    const id = snap.ejected[i];
    const x = snap.ejected[i + 1];
    const y = snap.ejected[i + 2];
    const old = guest.ejectedFood.get(id);
    nextEjected.set(id, {
      id,
      x: old ? old.x + (x - old.x) * 0.65 : x,
      y: old ? old.y + (y - old.y) * 0.65 : y,
      vx: 0,
      vy: 0,
      mass: 14,
      kind: 'ejected',
      rot: old ? old.rot + 0.3 : 0,
      age: 1,
    });
  }
  guest.ejectedFood = nextEjected;

  return { events: snap.events, deaths: snap.deaths };
}

export function interpolateGuestState(guest: GuestState, dt: number): MonkeyCell[] {
  const alpha = Math.min(1, dt * 15);
  const out: MonkeyCell[] = [];

  for (const c of guest.cells.values()) {
    const dist = Math.hypot(c.tx - c.x, c.ty - c.y);
    if (dist > 260) {
      c.x = c.tx;
      c.y = c.ty;
    } else {
      c.x += (c.tx - c.x) * alpha;
      c.y += (c.ty - c.y) * alpha;
    }
    c.mass += (c.tmass - c.mass) * alpha;

    // Shortest angle lerp
    let diff = c.tLookAngle - c.lookAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.lookAngle += diff * alpha;

    c.mouthOpen = Math.max(0, c.mouthOpen - dt * 2.2);
    c.wobblePhase += dt * 5.2;

    out.push({
      id: c.id,
      ownerId: c.ownerId,
      name: c.name,
      skin: c.skin,
      team: c.team,
      x: c.x,
      y: c.y,
      vx: 0,
      vy: 0,
      mass: c.mass,
      mergeTimer: 0,
      isBot: c.isBot,
      lookAngle: c.lookAngle,
      mouthOpen: c.mouthOpen,
      scared: c.scared,
      wobblePhase: c.wobblePhase,
      wobbleAmp: c.wobbleAmp,
    });
  }

  for (const ca of guest.cacti.values()) {
    ca.pulse += dt * 2.8;
  }

  // Optimistically remove local natural food overlapped by cells so eating feels zero-lag
  for (const cell of out) {
    const r = massToRadius(cell.mass);
    for (const [fid, f] of guest.naturalFood) {
      const dx = f.x - cell.x;
      const dy = f.y - cell.y;
      if (dx * dx + dy * dy < (r - 2) * (r - 2)) {
        guest.naturalFood.delete(fid);
        cell.mouthOpen = Math.max(cell.mouthOpen, 0.5);
      }
    }
  }

  return out;
}
