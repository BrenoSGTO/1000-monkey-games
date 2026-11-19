import { PeerRoom, type PlayerProfile } from '@monkey-slop/sdk';
import type {
  ChefInputState,
  FloatingText,
  KitchenId,
  NetMessage,
  SimSnapshot,
  SimSoundEvent,
} from './types';

export interface NetHooks {
  onPlayersChange: (players: PlayerProfile[]) => void;
  onStatusChange: (status: string) => void;
  onRemoteStart: (kitchenId: KitchenId) => void;
  onRemoteBackToMenu: () => void;
  onRemoteSnapshot: (snapshot: SimSnapshot) => void;
  onRemoteEvent: (sound?: SimSoundEvent, floatText?: { x: number; y: number; text: string; color: string }) => void;
}

export class OvercookedNet {
  public room: PeerRoom<NetMessage>;
  private remoteInputs = new Map<string, ChefInputState>();
  private lastSnapshotSent = 0;
  private lastInputSent = 0;
  private hooks: NetHooks;

  // Client interpolation state
  public interpolatedSnap: SimSnapshot | null = null;
  public clientFloatTexts: FloatingText[] = [];

  constructor(hooks: NetHooks) {
    this.hooks = hooks;
    this.room = new PeerRoom<NetMessage>('monkey-overcooked', {
      onStatus: (_status, detail) => {
        if (detail) this.hooks.onStatusChange(detail);
      },
      onPlayersChange: (players) => {
        this.hooks.onPlayersChange(players);
      },
      onMessage: (env) => {
        const msg = env.payload;
        if (!msg) return;

        if (msg.kind === 'input' && this.isHost()) {
          const prev = this.remoteInputs.get(env.senderId);
          this.remoteInputs.set(env.senderId, {
            moveX: msg.dx,
            moveY: msg.dy,
            interactPressed: Boolean(msg.interact || prev?.interactPressed),
            workHeld: msg.workHeld,
            workPressed: Boolean(msg.workPressed || prev?.workPressed),
            throwPressed: Boolean(msg.throwItem || prev?.throwPressed),
            dashPressed: Boolean(msg.dash || prev?.dashPressed),
            shoutIndex: msg.shout || prev?.shoutIndex || 0,
          });
          return;
        }

        if (msg.kind === 'start' && !this.isHost()) {
          this.interpolatedSnap = null;
          this.clientFloatTexts = [];
          this.hooks.onRemoteStart(msg.kitchenId);
          return;
        }

        if (msg.kind === 'backToMenu' && !this.isHost()) {
          this.interpolatedSnap = null;
          this.hooks.onRemoteBackToMenu();
          return;
        }

        if (msg.kind === 'snapshot' && !this.isHost()) {
          this.applyRemoteSnapshot(msg.snapshot);
          this.hooks.onRemoteSnapshot(msg.snapshot);
          return;
        }

        if (msg.kind === 'event' && !this.isHost()) {
          if (msg.floatText) {
            this.clientFloatTexts.push({
              ...msg.floatText,
              life: 1.15,
              maxLife: 1.15,
            });
          }
          this.hooks.onRemoteEvent(msg.sound, msg.floatText);
        }
      },
    });
  }

  public isConnected(): boolean {
    return Boolean(this.room.roomCode) && this.room.getPlayers().length > 0;
  }

  public isHost(): boolean {
    return this.room.localPlayer.isHost;
  }

  public getPlayers(): PlayerProfile[] {
    return this.room.getPlayers();
  }

  public consumeRemoteInputs(): Record<string, ChefInputState> {
    const out: Record<string, ChefInputState> = {};
    for (const [id, inp] of this.remoteInputs.entries()) {
      out[id] = { ...inp };
      inp.interactPressed = false;
      inp.workPressed = false;
      inp.throwPressed = false;
      inp.dashPressed = false;
      inp.shoutIndex = 0;
    }
    return out;
  }

  public sendLocalInput(inp: ChefInputState, force = false): void {
    if (!this.isConnected() || this.isHost()) return;
    const now = performance.now();
    const hasPulse =
      inp.interactPressed ||
      inp.workPressed ||
      inp.throwPressed ||
      inp.dashPressed ||
      inp.shoutIndex > 0;
    if (!force && !hasPulse && now - this.lastInputSent < 33) return;
    this.lastInputSent = now;
    this.room.send('input', {
      kind: 'input',
      dx: inp.moveX,
      dy: inp.moveY,
      interact: inp.interactPressed,
      workHeld: inp.workHeld,
      workPressed: inp.workPressed,
      throwItem: inp.throwPressed,
      dash: inp.dashPressed,
      shout: inp.shoutIndex,
    });
  }

  public broadcastStart(kitchenId: KitchenId): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.room.send('start', { kind: 'start', kitchenId, mode: 'online' });
  }

  public broadcastBackToMenu(): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.room.send('backToMenu', { kind: 'backToMenu' });
  }

  public broadcastSnapshot(snapshot: SimSnapshot, force = false): void {
    if (!this.isConnected() || !this.isHost()) return;
    const now = performance.now();
    if (!force && now - this.lastSnapshotSent < 48) return;
    this.lastSnapshotSent = now;
    this.room.send('snapshot', { kind: 'snapshot', snapshot });
  }

  private lastBroadcastSoundAt: Record<string, number> = {};

  public broadcastEvent(
    sound?: SimSoundEvent,
    floatText?: { x: number; y: number; text: string; color: string },
  ): void {
    if (!this.isConnected() || !this.isHost()) return;
    let soundToSend = sound;
    if (soundToSend) {
      const continuous =
        soundToSend === 'chop' ||
        soundToSend === 'sizzle' ||
        soundToSend === 'blend' ||
        soundToSend === 'wash' ||
        soundToSend === 'alarm' ||
        soundToSend === 'extinguish';
      if (continuous) {
        const now = performance.now();
        if (now - (this.lastBroadcastSoundAt[soundToSend] || 0) < 250) {
          soundToSend = undefined;
        } else {
          this.lastBroadcastSoundAt[soundToSend] = now;
        }
      }
    }
    if (!soundToSend && !floatText) return;
    this.room.send('event', { kind: 'event', sound: soundToSend, floatText });
  }

  private applyRemoteSnapshot(incoming: SimSnapshot): void {
    if (!this.interpolatedSnap) {
      this.interpolatedSnap = incoming;
      return;
    }
    const prevChefs = new Map(this.interpolatedSnap.chefs.map((c) => [c.id, c]));
    for (const c of incoming.chefs) {
      const old = prevChefs.get(c.id);
      if (old && Math.hypot(c.x - old.x, c.y - old.y) < 2.2) {
        // Keep current interpolated position slightly blended so render loop smooths it
        c.x = old.x + (c.x - old.x) * 0.45;
        c.y = old.y + (c.y - old.y) * 0.45;
      }
    }
    this.interpolatedSnap = incoming;
  }

  public stepClientVisuals(dt: number): void {
    for (let i = this.clientFloatTexts.length - 1; i >= 0; i--) {
      const ft = this.clientFloatTexts[i];
      ft.life -= dt;
      ft.y -= dt * 0.75;
      if (ft.life <= 0) this.clientFloatTexts.splice(i, 1);
    }
  }
}
