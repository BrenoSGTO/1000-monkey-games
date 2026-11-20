import { PeerRoom } from '@monkey-slop/sdk';
import type { PlayerProfile } from '@monkey-slop/sdk';
import type { GameSimulation } from './simulation';
import type {
  FireHazard,
  FurnitureKind,
  MonkeySim,
  NetMessage,
  PlacedFurniture,
  PuddleHazard,
  SimSpeed,
  SocialActionKind,
} from './types';

export class SimsNetBridge {
  public room: PeerRoom<NetMessage>;
  private sim: GameSimulation;
  private onToast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  private onPlayersUpdated: (players: PlayerProfile[]) => void;
  private syncAccum = 0;
  private houseSyncAccum = 0;

  constructor(
    sim: GameSimulation,
    onToast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void,
    onPlayersUpdated: (players: PlayerProfile[]) => void,
  ) {
    this.sim = sim;
    this.onToast = onToast;
    this.onPlayersUpdated = onPlayersUpdated;

    this.room = new PeerRoom<NetMessage>('monkey-sims', {
      onStatus: (status, detail) => {
        if (status === 'idle') {
          this.sim.isOnline = false;
          this.sim.isHost = true;
          this.sim.localPeerId = null;
        } else if (status === 'error' && detail) {
          this.onToast(`Erro P2P: ${detail}`, 'chaos');
        }
      },
      onPlayersChange: (players) => {
        this.handlePlayersChange(players);
      },
      onMessage: (env) => {
        this.handleMessage(env.senderId, env.payload);
      },
    });
  }

  private handlePlayersChange(players: PlayerProfile[]): void {
    this.onPlayersUpdated(players);
    if (players.length === 0) {
      this.sim.isOnline = false;
      this.sim.isHost = true;
      this.sim.localPeerId = null;
      return;
    }

    const wasOnline = this.sim.isOnline;
    this.sim.isOnline = true;
    this.sim.isHost = this.room.localPlayer.isHost;
    this.sim.localPeerId = this.room.localPlayer.id;

    // Bind our local primary monkey to our peerId
    const myMonkey =
      this.sim.monkeys.find((m) => m.ownerPeerId === this.room.localPlayer.id) ??
      this.sim.monkeys.find((m) => !m.isNpc) ??
      this.sim.monkeys[0];

    if (myMonkey) {
      myMonkey.ownerPeerId = this.room.localPlayer.id;
      myMonkey.isNpc = false;
      myMonkey.isLocalControl = true;
      this.sim.activeMonkeyId = myMonkey.id;
    }

    // If we have >1 real players in the room, drop offline NPCs to keep the house clean
    if (players.length > 1) {
      this.sim.monkeys = this.sim.monkeys.filter((m) => !m.isNpc);
    }

    // Remove monkeys belonging to disconnected peers
    const activeIds = new Set(players.map((p) => p.id));
    this.sim.monkeys = this.sim.monkeys.filter(
      (m) => m.isNpc || !m.ownerPeerId || activeIds.has(m.ownerPeerId),
    );

    if (!wasOnline) {
      this.onToast('🐒 Conectado à República Online!', 'banana');
    }

    // Broadcast our monkey immediately + if host, broadcast house snapshot
    if (myMonkey) {
      this.send({ kind: 'monkey_sync', monkey: this.cloneMonkeyForNet(myMonkey) });
    }
    if (this.sim.isHost) {
      this.broadcastHouseSnapshot();
    }
  }

  public send(msg: NetMessage): void {
    if (!this.sim.isOnline) return;
    this.room.send('sims', msg);
  }

  public tick(dt: number): void {
    if (!this.sim.isOnline) return;

    this.syncAccum += dt;
    if (this.syncAccum >= 0.12) {
      this.syncAccum = 0;
      const myMonkey = this.sim.monkeys.find((m) => m.ownerPeerId === this.room.localPlayer.id);
      if (myMonkey) {
        this.send({ kind: 'monkey_sync', monkey: this.cloneMonkeyForNet(myMonkey) });
      }
    }

    if (this.sim.isHost) {
      this.houseSyncAccum += dt;
      if (this.houseSyncAccum >= 1.5) {
        this.houseSyncAccum = 0;
        this.broadcastHouseSnapshot();
      }
    }
  }

  public broadcastHouseSnapshot(): void {
    if (!this.sim.isOnline || !this.sim.isHost) return;
    this.send({
      kind: 'house_sync',
      house: {
        day: this.sim.day,
        minuteOfDay: this.sim.minuteOfDay,
        speed: this.sim.speed,
        money: this.sim.money,
        jblPlaying: this.sim.jblPlaying,
        furniture: this.sim.furniture,
        fires: this.sim.fires,
        puddles: this.sim.puddles,
        eventBanner: this.sim.eventBanner,
      },
    });
  }

  private cloneMonkeyForNet(m: MonkeySim): MonkeySim {
    return {
      ...m,
      needs: { ...m.needs },
      skills: { ...m.skills },
      skillXp: { ...m.skillXp },
      appearance: { ...m.appearance },
      relations: { ...m.relations },
      queue: m.queue.slice(0, 2),
      path: [],
    };
  }

  private handleMessage(senderId: string, msg: NetMessage): void {
    if (!msg || typeof msg.kind !== 'string') return;

    switch (msg.kind) {
      case 'monkey_sync': {
        const incoming = msg.monkey;
        if (incoming.ownerPeerId === this.room.localPlayer.id) return;
        const idx = this.sim.monkeys.findIndex((m) => m.id === incoming.id);
        if (idx === -1) {
          this.sim.monkeys.push({
            ...incoming,
            isLocalControl: false,
            isNpc: false,
          });
          this.onToast(`🐒 ${incoming.name} entrou na Casa na Árvore!`, 'info');
        } else {
          const cur = this.sim.monkeys[idx];
          // Smoothly blend position for remote monkeys
          const dist = Math.hypot(incoming.x - cur.x, incoming.y - cur.y);
          const nextX = dist > 120 ? incoming.x : cur.x + (incoming.x - cur.x) * 0.45;
          const nextY = dist > 120 ? incoming.y : cur.y + (incoming.y - cur.y) * 0.45;
          this.sim.monkeys[idx] = {
            ...incoming,
            x: nextX,
            y: nextY,
            isLocalControl: false,
          };
        }
        break;
      }

      case 'house_sync': {
        if (this.sim.isHost) return;
        const h = msg.house;
        this.sim.day = h.day;
        this.sim.minuteOfDay = h.minuteOfDay;
        this.sim.speed = h.speed;
        this.sim.money = h.money;
        this.sim.jblPlaying = h.jblPlaying;
        this.sim.furniture = h.furniture;
        this.sim.fires = h.fires;
        this.sim.puddles = h.puddles;
        if (h.eventBanner) this.sim.eventBanner = h.eventBanner;
        break;
      }

      case 'buy_furniture': {
        if (!this.sim.furniture.some((f) => f.id === msg.item.id)) {
          this.sim.furniture.push(msg.item);
        }
        if (this.sim.isHost) {
          this.sim.money = Math.max(0, this.sim.money - msg.cost);
          this.broadcastHouseSnapshot();
        }
        break;
      }

      case 'move_furniture': {
        const item = this.sim.furniture.find((f) => f.id === msg.id);
        if (item) {
          item.gx = msg.gx;
          item.gy = msg.gy;
          item.rotation = msg.rotation;
        }
        if (this.sim.isHost) this.broadcastHouseSnapshot();
        break;
      }

      case 'sell_furniture': {
        this.sim.furniture = this.sim.furniture.filter((f) => f.id !== msg.id);
        if (this.sim.isHost) {
          this.sim.money += msg.refund;
          this.broadcastHouseSnapshot();
        }
        break;
      }

      case 'toggle_jbl': {
        this.sim.jblPlaying = msg.playing;
        this.onToast(
          msg.playing
            ? `🔊 ${msg.actorName} ligou o pancadão na JBL!`
            : `🔇 ${msg.actorName} desligou a JBL.`,
          'info',
        );
        break;
      }

      case 'spawn_fire': {
        if (!this.sim.fires.some((f) => f.id === msg.fire.id)) {
          this.sim.fires.push(msg.fire);
          this.onToast(`🔥 ${msg.actorName} botou fogo na casa!`, 'chaos');
        }
        break;
      }

      case 'extinguish_fire': {
        this.sim.fires = this.sim.fires.filter((f) => f.id !== msg.fireId);
        this.onToast(`🧯 ${msg.actorName} apagou o incêndio!`, 'banana');
        break;
      }

      case 'spawn_puddle': {
        if (!this.sim.puddles.some((p) => p.id === msg.puddle.id)) {
          this.sim.puddles.push(msg.puddle);
        }
        break;
      }

      case 'clean_puddle': {
        this.sim.puddles = this.sim.puddles.filter((p) => p.id !== msg.puddleId);
        break;
      }

      case 'social_event': {
        const myMonkey = this.sim.monkeys.find((m) => m.ownerPeerId === this.room.localPlayer.id);
        if (myMonkey && myMonkey.id === msg.targetId) {
          this.sim.applyIncomingSocialToMonkey(
            myMonkey,
            msg.fromId,
            msg.fromName,
            msg.action,
            msg.amount,
          );
          if (msg.action === 'gift' && this.sim.isHost) {
            this.sim.money += msg.amount ?? 25;
          }
        }
        break;
      }

      case 'chat_emote': {
        const m = this.sim.monkeys.find((mk) => mk.id === msg.monkeyId || mk.ownerPeerId === senderId);
        if (m) {
          m.speechText = msg.text;
          m.speechTimer = 4.2;
        }
        break;
      }

      case 'set_speed': {
        this.sim.speed = msg.speed;
        break;
      }

      case 'money_delta': {
        if (this.sim.isHost) {
          this.sim.money = Math.max(0, Math.round(this.sim.money + msg.delta));
        }
        break;
      }
    }
  }

  public notifyBuyFurniture(item: PlacedFurniture, cost: number): void {
    this.send({ kind: 'buy_furniture', item, cost });
  }

  public notifyMoveFurniture(id: string, gx: number, gy: number, rotation: 0 | 1 | 2 | 3): void {
    this.send({ kind: 'move_furniture', id, gx, gy, rotation });
  }

  public notifySellFurniture(id: string, refund: number): void {
    this.send({ kind: 'sell_furniture', id, refund });
  }

  public notifyToggleJbl(playing: boolean, actorName: string): void {
    this.send({ kind: 'toggle_jbl', playing, actorName });
  }

  public notifySpawnFire(fire: FireHazard, actorName: string): void {
    this.send({ kind: 'spawn_fire', fire, actorName });
  }

  public notifyExtinguishFire(fireId: string, actorName: string): void {
    this.send({ kind: 'extinguish_fire', fireId, actorName });
  }

  public notifySpawnPuddle(puddle: PuddleHazard): void {
    this.send({ kind: 'spawn_puddle', puddle });
  }

  public notifyCleanPuddle(puddleId: string, actorName: string): void {
    this.send({ kind: 'clean_puddle', puddleId, actorName });
  }

  public notifySocialEvent(
    fromId: string,
    fromName: string,
    targetId: string,
    action: SocialActionKind,
    amount?: number,
  ): void {
    this.send({ kind: 'social_event', fromId, fromName, targetId, action, amount });
  }

  public notifyChatEmote(monkeyId: string, monkeyName: string, text: string): void {
    this.send({ kind: 'chat_emote', monkeyId, monkeyName, text });
  }

  public notifySetSpeed(speed: SimSpeed): void {
    this.send({ kind: 'set_speed', speed });
  }

  public notifyMoneyDelta(delta: number, reason: string): void {
    this.send({ kind: 'money_delta', delta, reason });
  }
}

export function getFurniturePriceForKind(kind: FurnitureKind): number {
  return kind ? 0 : 0;
}
