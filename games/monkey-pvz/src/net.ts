// Camada P2P (PeerRoom + HUD do SDK) para Co-op e Versus.
import { mountMonkeyHud, PeerRoom, type MonkeyHudHandle } from '@monkey-slop/sdk';
import type { PeerEnvelope, PlayerProfile } from '@monkey-slop/sdk';
import { PVZ_CONTROLS } from './controls';

export const SLUG = 'monkey-pvz';

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface StartMsg {
  mode: 'coop' | 'versus';
  levelId: number;
  plantSlot: number;
}

export interface CmdMsg {
  k: 'plant' | 'shovel' | 'collect' | 'send';
  t?: string;
  r?: number;
  c?: number;
  b?: number;
  id?: number;
}

export interface CursorMsg {
  r: number;
  c: number;
  sel: string;
}

export interface NetCallbacks {
  onStatus: (s: NetStatus, detail?: string) => void;
  onPlayers: (players: PlayerProfile[]) => void;
  onMessage: (type: string, payload: unknown, senderId: string) => void;
  onControlsOpenChange?: (open: boolean) => void;
}

export class PvzNet {
  readonly room: PeerRoom<unknown>;
  readonly hud: MonkeyHudHandle;
  status: NetStatus = 'idle';

  constructor(cb: NetCallbacks) {
    this.room = new PeerRoom<unknown>(SLUG, {
      onStatus: (s, d) => {
        this.status = s;
        cb.onStatus(s, d);
      },
      onPlayersChange: (players) => {
        this.hud.setPlayers(players);
        cb.onPlayers(players);
      },
      onMessage: (env: PeerEnvelope<unknown>) => {
        cb.onMessage(env.type, env.payload, env.senderId);
      },
    });
    this.hud = mountMonkeyHud<unknown>({
      slug: SLUG,
      title: 'Bananeiras vs Gorilas Zumbis',
      room: this.room,
      controls: {
        ...PVZ_CONTROLS,
        onOpenChange: (open) => cb.onControlsOpenChange?.(open),
      },
    });
  }

  inRoom(): boolean {
    return this.room.roomCode !== null;
  }

  isHost(): boolean {
    return !this.inRoom() || this.room.localPlayer.isHost;
  }

  players(): PlayerProfile[] {
    return this.room.getPlayers();
  }

  /** id do primeiro convidado (host) */
  guestId(): string | null {
    const me = this.room.localPlayer.id;
    const g = this.players().find((p) => p.id !== me);
    return g ? g.id : null;
  }

  peerCount(): number {
    return this.players().length;
  }

  send(type: string, payload: unknown): void {
    if (!this.inRoom()) return;
    this.room.send(type, payload);
  }

  toast(msg: string, tone: 'banana' | 'chaos' | 'info' = 'info'): void {
    this.hud.toast(msg, tone);
  }

  openPanel(): void {
    const btn = document.querySelector<HTMLButtonElement>('.msdk-bar .msdk-green');
    const panel = document.querySelector<HTMLElement>('.msdk-panel');
    if (btn && panel && !panel.classList.contains('open')) btn.click();
  }
}
