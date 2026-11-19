import { PeerRoom, type PeerEnvelope, type PlayerProfile } from '@monkey-slop/sdk';
import { picoAudio } from './audio';
import {
  addFloatingText,
  createWorld,
  spawnParticles,
  type PlayerSlotInfo,
} from './physics';
import type {
  MonkeyInput,
  NetMessage,
  SnapshotPayload,
  WorldState,
} from './types';

export function playersToSlots(players: PlayerProfile[]): PlayerSlotInfo[] {
  if (players.length === 0) {
    return [
      { playerId: 'local-0', name: 'Macaco 1', paletteIndex: 0 },
      { playerId: 'local-1', name: 'Macaco 2', paletteIndex: 1 },
    ];
  }
  return players.slice(0, 6).map((p, i) => ({
    playerId: p.id,
    name: p.name,
    paletteIndex: i,
  }));
}

export function buildSnapshot(world: WorldState, tick: number): SnapshotPayload {
  return {
    tick,
    levelIndex: world.levelIndex,
    phase: world.phase,
    deaths: world.deaths,
    levelTimer: Number(world.levelTimer.toFixed(2)),
    totalTimer: Number(world.totalTimer.toFixed(2)),
    totalScore: world.totalScore,
    monkeys: world.monkeys.map((m) => ({
      id: m.id,
      playerId: m.playerId,
      name: m.name,
      paletteIndex: m.paletteIndex,
      x: Math.round(m.x * 10) / 10,
      y: Math.round(m.y * 10) / 10,
      vx: Math.round(m.vx),
      vy: Math.round(m.vy),
      facing: m.facing,
      grounded: m.grounded,
      squishedTimer: Number(m.squishedTimer.toFixed(2)),
      enteredDoor: m.enteredDoor,
      shoutText: m.shoutText,
      shoutTimer: Number(m.shoutTimer.toFixed(2)),
    })),
    platforms: world.platforms
      .filter((p) => p.kind !== 'solid')
      .map((p) => ({
        id: p.id,
        cx: Math.round(p.currentX * 10) / 10,
        cy: Math.round(p.currentY * 10) / 10,
        active: p.active,
        progress: Math.round(p.progress * 100) / 100,
      })),
    boxes: world.boxes.map((b) => ({
      id: b.id,
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      pl: b.pushersLeft,
      pr: b.pushersRight,
      req: b.effectiveRequired,
    })),
    buttons: world.buttons.map((btn) => ({
      id: btn.id,
      pressed: btn.pressed,
      active: btn.active,
      timer: Number(btn.timer.toFixed(2)),
    })),
    seesaws: world.seesaws.map((s) => ({
      id: s.id,
      angle: Math.round(s.angle * 1000) / 1000,
    })),
    key: {
      x: Math.round(world.key.x * 10) / 10,
      y: Math.round(world.key.y * 10) / 10,
      carrier: world.key.carrierMonkeyId,
      used: world.key.used,
    },
    fakeKeys: world.fakeKeys.map((fk) => fk.triggered),
    doorOpen: world.door.open,
    doorProgress: Math.round(world.door.openProgress * 100) / 100,
  };
}

export function applySnapshotToWorld(
  current: WorldState,
  snap: SnapshotPayload,
): WorldState {
  let world = current;
  const slots: PlayerSlotInfo[] = snap.monkeys.map((m) => ({
    playerId: m.playerId,
    name: m.name,
    paletteIndex: m.paletteIndex,
  }));

  if (
    world.levelIndex !== snap.levelIndex ||
    world.monkeys.length !== snap.monkeys.length
  ) {
    world = createWorld(snap.levelIndex, 'online', slots, {
      deaths: snap.deaths,
      totalTimer: snap.totalTimer,
      totalScore: snap.totalScore,
      completedLevels: current.completedLevels,
    });
  }

  world.phase = snap.phase;
  world.deaths = snap.deaths;
  world.levelTimer = snap.levelTimer;
  world.totalTimer = snap.totalTimer;
  world.totalScore = snap.totalScore;

  for (const sm of snap.monkeys) {
    const m = world.monkeys[sm.id];
    if (!m) continue;
    m.playerId = sm.playerId;
    m.name = sm.name;
    m.paletteIndex = sm.paletteIndex;
    const dist = Math.hypot(sm.x - m.x, sm.y - m.y);
    if (dist > 140) {
      m.x = sm.x;
      m.y = sm.y;
    } else {
      m.x += (sm.x - m.x) * 0.55;
      m.y += (sm.y - m.y) * 0.55;
    }
    m.vx = sm.vx;
    m.vy = sm.vy;
    m.facing = sm.facing;
    m.grounded = sm.grounded;
    m.squishedTimer = sm.squishedTimer;
    m.enteredDoor = sm.enteredDoor;
    m.shoutText = sm.shoutText;
    m.shoutTimer = sm.shoutTimer;
  }

  for (const sp of snap.platforms) {
    const p = world.platforms.find((pl) => pl.id === sp.id);
    if (p) {
      p.currentX = sp.cx;
      p.currentY = sp.cy;
      p.active = sp.active;
      p.progress = sp.progress;
    }
  }

  for (const sb of snap.boxes) {
    const b = world.boxes.find((bx) => bx.id === sb.id);
    if (b) {
      b.x += (sb.x - b.x) * 0.55;
      b.y += (sb.y - b.y) * 0.55;
      b.pushersLeft = sb.pl;
      b.pushersRight = sb.pr;
      b.effectiveRequired = sb.req;
    }
  }

  for (const sbtn of snap.buttons) {
    const btn = world.buttons.find((bt) => bt.id === sbtn.id);
    if (btn) {
      btn.pressed = sbtn.pressed;
      btn.active = sbtn.active;
      btn.timer = sbtn.timer;
    }
  }

  for (const ss of snap.seesaws) {
    const s = world.seesaws.find((se) => se.id === ss.id);
    if (s) s.angle = ss.angle;
  }

  world.key.x += (snap.key.x - world.key.x) * 0.6;
  world.key.y += (snap.key.y - world.key.y) * 0.6;
  world.key.carrierMonkeyId = snap.key.carrier;
  world.key.used = snap.key.used;

  snap.fakeKeys.forEach((trig, idx) => {
    if (world.fakeKeys[idx]) world.fakeKeys[idx].triggered = trig;
  });

  world.door.open = snap.doorOpen;
  world.door.openProgress = snap.doorProgress;

  return world;
}

export class OnlineCoordinator {
  public readonly room: PeerRoom<NetMessage>;
  public players: PlayerProfile[] = [];
  public remoteInputs = new Map<string, MonkeyInput>();
  public latestSnapshot: SnapshotPayload | null = null;
  private tickCounter = 0;
  private snapAccum = 0;
  private inputAccum = 0;
  private lastSentInputKey = '';

  constructor(
    slug: string,
    private handlers: {
      onPlayersUpdated: (players: PlayerProfile[]) => void;
      onHostCommand: (action: 'start_level' | 'next_level' | 'restart', levelIndex?: number) => void;
      onWorldEvent: (msg: Extract<NetMessage, { kind: 'event' }>) => void;
      onToast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
    },
  ) {
    this.room = new PeerRoom<NetMessage>(slug, {
      onPlayersChange: (players) => {
        this.players = players;
        this.handlers.onPlayersUpdated(players);
      },
      onMessage: (env: PeerEnvelope<NetMessage>) => {
        const msg = env.payload;
        if (!msg) return;

        if (msg.kind === 'input' && this.room.localPlayer.isHost) {
          this.remoteInputs.set(env.senderId, msg.input);
        } else if (msg.kind === 'snapshot' && !this.room.localPlayer.isHost) {
          this.latestSnapshot = msg.snap;
        } else if (msg.kind === 'event' && !this.room.localPlayer.isHost) {
          this.handlers.onWorldEvent(msg);
        } else if (msg.kind === 'cmd' && this.room.localPlayer.isHost) {
          this.handlers.onHostCommand(msg.action, msg.levelIndex);
        }
      },
      onStatus: (status, detail) => {
        if (status === 'error' && detail) {
          this.handlers.onToast(`Rede P2P: ${detail}`, 'chaos');
        }
      },
    });
  }

  isConnected(): boolean {
    return this.room.roomCode !== null;
  }

  isHost(): boolean {
    return this.room.localPlayer.isHost;
  }

  getLocalPlayerId(): string {
    return this.room.localPlayer.id;
  }

  sendGuestInput(input: MonkeyInput, dt: number): void {
    if (!this.isConnected() || this.isHost()) return;
    this.inputAccum += dt;
    const key = `${input.left ? 1 : 0}${input.right ? 1 : 0}${input.jump ? 1 : 0}${input.shout ? 1 : 0}`;
    if (key !== this.lastSentInputKey || this.inputAccum >= 0.045) {
      this.lastSentInputKey = key;
      this.inputAccum = 0;
      this.room.send('net', { kind: 'input', monkeyId: -1, input });
    }
  }

  hostTickBroadcast(world: WorldState, dt: number): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.snapAccum += dt;
    if (this.snapAccum >= 0.04) {
      this.snapAccum = 0;
      this.tickCounter++;
      this.room.send('net', {
        kind: 'snapshot',
        snap: buildSnapshot(world, this.tickCounter),
      });
    }
  }

  broadcastEvent(
    name: 'level_start' | 'level_clear' | 'die' | 'key_grab' | 'fake_key' | 'door_open' | 'shout',
    detail?: string,
    x?: number,
    y?: number,
    levelIndex?: number,
  ): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.room.send('net', { kind: 'event', name, detail, x, y, levelIndex });
  }

  sendCommand(action: 'start_level' | 'next_level' | 'restart', levelIndex?: number): void {
    if (!this.isConnected()) return;
    this.room.send('net', { kind: 'cmd', action, levelIndex });
  }

  applyGuestEventFeedback(world: WorldState, msg: Extract<NetMessage, { kind: 'event' }>): void {
    const x = msg.x ?? 640;
    const y = msg.y ?? 360;
    switch (msg.name) {
      case 'die':
        picoAudio.die();
        world.shakeTimer = 0.3;
        world.shakeIntensity = 8;
        world.resetFlashTimer = 0.25;
        spawnParticles(world, x, y, 18, ['#fb7185', '#fde047', '#ffffff'], 210);
        addFloatingText(world, x, Math.max(110, y - 30), `${msg.detail ?? 'Alguém'} CAIU! 💀`, '#fb7185', 1.2);
        break;
      case 'key_grab':
        picoAudio.keyGrab();
        spawnParticles(world, x, y, 14, ['#fde047', '#facc15', '#ffffff'], 180);
        addFloatingText(world, x, y - 20, 'CHAVE PEGA! 🔑🍌', '#fde047', 1.1);
        break;
      case 'fake_key':
        picoAudio.fakeKey();
        world.shakeTimer = 0.22;
        world.shakeIntensity = 5;
        spawnParticles(world, x, y, 16, ['#ef4444', '#fde047', '#f97316'], 200);
        addFloatingText(world, x, y - 16, 'PEGADINHA! 🤡🍌', '#fb7185', 1.2);
        break;
      case 'door_open':
        picoAudio.doorOpen();
        spawnParticles(world, x + 28, y + 38, 22, ['#fde047', '#4ade80', '#38bdf8'], 220);
        addFloatingText(world, x + 28, y - 16, 'PORTA ABERTA!', '#4ade80', 1.15);
        break;
      case 'shout':
        picoAudio.shout();
        break;
      case 'level_clear':
        picoAudio.levelWin();
        break;
      case 'level_start':
        break;
    }
  }
}
