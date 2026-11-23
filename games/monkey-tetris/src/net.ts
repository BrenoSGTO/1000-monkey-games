import { PeerRoom, type PlayerProfile } from '@monkey-slop/sdk';
import type { BoardSnapshot, TetrisNetMessage } from './types';

export interface TetrisNetHooks {
  onPlayersChange: (players: PlayerProfile[]) => void;
  onStatusChange: (detail: string) => void;
  onRemoteStart: (seed: number, startLevel: number) => void;
  onRemoteState: (senderId: string, snapshot: BoardSnapshot) => void;
  onRemoteAttack: (fromId: string, fromName: string, targetId: string, amount: number, label: string) => void;
  onRemoteTaunt: (senderId: string, senderName: string, phrase: string) => void;
  onRemoteKO: (victimId: string, victimName: string, attackerId?: string) => void;
  onRemoteBackToMenu: () => void;
}

export class TetrisNet {
  public readonly room: PeerRoom<TetrisNetMessage>;
  private hooks: TetrisNetHooks;
  private lastStateBroadcast = 0;

  constructor(hooks: TetrisNetHooks) {
    this.hooks = hooks;
    this.room = new PeerRoom<TetrisNetMessage>('monkey-tetris', {
      onStatus: (_status, detail) => {
        if (detail) this.hooks.onStatusChange(detail);
      },
      onPlayersChange: (players) => {
        this.hooks.onPlayersChange(players);
      },
      onMessage: (env) => {
        const msg = env.payload;
        if (!msg) return;

        switch (msg.kind) {
          case 'start': {
            if (!this.isHost()) {
              this.hooks.onRemoteStart(msg.seed, msg.startLevel);
            }
            break;
          }
          case 'state': {
            this.hooks.onRemoteState(env.senderId, msg.snapshot);
            break;
          }
          case 'attack': {
            this.hooks.onRemoteAttack(
              env.senderId,
              msg.fromName,
              msg.targetId,
              msg.amount,
              msg.label,
            );
            break;
          }
          case 'taunt': {
            this.hooks.onRemoteTaunt(env.senderId, env.senderName, msg.phrase);
            break;
          }
          case 'ko': {
            this.hooks.onRemoteKO(msg.victimId, msg.victimName, msg.attackerId);
            break;
          }
          case 'back_to_menu': {
            if (!this.isHost()) {
              this.hooks.onRemoteBackToMenu();
            }
            break;
          }
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

  public broadcastStart(seed: number, startLevel: number): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.room.send('start', { kind: 'start', seed, startLevel });
  }

  public broadcastBackToMenu(): void {
    if (!this.isConnected() || !this.isHost()) return;
    this.room.send('back_to_menu', { kind: 'back_to_menu' });
  }

  public sendState(snapshot: BoardSnapshot, force = false): void {
    if (!this.isConnected()) return;
    const now = performance.now();
    if (!force && now - this.lastStateBroadcast < 75) return;
    this.lastStateBroadcast = now;
    this.room.send('state', { kind: 'state', snapshot });
  }

  public sendAttack(targetId: string, amount: number, label: string): void {
    if (!this.isConnected()) return;
    this.room.send('attack', {
      kind: 'attack',
      targetId,
      amount,
      fromName: this.room.localPlayer.name,
      label,
    });
  }

  public sendTaunt(phrase: string): void {
    if (!this.isConnected()) return;
    this.room.send('taunt', { kind: 'taunt', phrase });
  }

  public sendKO(victimId: string, victimName: string, attackerId?: string): void {
    if (!this.isConnected()) return;
    this.room.send('ko', { kind: 'ko', victimId, victimName, attackerId });
  }
}
