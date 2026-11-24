import type { PeerEnvelope, PeerRoom } from '@monkey-slop/sdk';
import type { Game } from './game';
import { World } from './world';
import type { NetMsg } from './types';

/** Co-op P2P: o host é autoritativo sobre o mundo (blocos, criaturas, água); guests pedem edições. */
export class NetSync {
  private sendT = 0;
  private mobT = 0;
  private diffT = 0;
  private joining: { world: World; time: number; n: number; got: number } | null = null;
  private joinTimer = 0;

  constructor(
    private g: Game,
    readonly room: PeerRoom<NetMsg>,
  ) {}

  online(): boolean {
    return !!this.room.roomCode;
  }

  send(msg: NetMsg): void {
    if (!this.online()) return;
    this.room.send('c', msg);
  }

  sendNow(): void {
    this.send({ k: 'p', s: this.g.netState() });
  }

  sendDiff(e: number[]): void {
    for (let i = 0; i < e.length; i += 2400) this.send({ k: 'd', e: e.slice(i, i + 2400) });
  }

  /** Guest pediu o mundo. */
  requestWorld(): void {
    this.joining = null;
    this.send({ k: 'hi', name: this.room.localPlayer.name });
    this.joinTimer = 15;
  }

  waitingForWorld(): boolean {
    return this.joinTimer > 0 && this.g.state === 'loading';
  }

  sendWorldTo(to: string): void {
    const g = this.g;
    if (g.state !== 'play') return;
    const edits = g.world.exportEdits();
    const size = 3000;
    const n = Math.max(1, Math.ceil(edits.length / size));
    this.send({ k: 'ws', to, seed: g.world.seed, time: g.time, n });
    for (let i = 0; i < n; i++) {
      this.send({ k: 'we', to, e: edits.slice(i * size, (i + 1) * size), last: i === n - 1 });
    }
  }

  handle(env: PeerEnvelope<NetMsg>): void {
    const m = env.payload;
    if (!m || typeof m.k !== 'string') return;
    const g = this.g;
    const me = this.room.localPlayer.id;
    switch (m.k) {
      case 'hi':
        if (g.role === 'host') this.sendWorldTo(env.senderId);
        break;
      case 'ws':
        if (m.to !== me || g.role === 'host') return;
        this.joining = { world: new World(m.seed), time: m.time, n: m.n, got: 0 };
        break;
      case 'we':
        if (m.to !== me || !this.joining) return;
        this.joining.world.importEdits(m.e);
        this.joining.got++;
        if (m.last) {
          const j = this.joining;
          this.joining = null;
          this.joinTimer = 0;
          g.startGuest(j.world, j.time);
        }
        break;
      case 'd':
        if (g.role === 'guest' && g.state === 'play') g.applyDiffs(m.e);
        break;
      case 'rq':
        if (g.role === 'host' && g.state === 'play') g.hostApplyRequest(m.i, m.id, m.prev);
        break;
      case 'p':
        if (g.state === 'play') g.onRemoteState(env.senderId, env.senderName, m.s);
        break;
      case 'm':
        if (g.role === 'guest' && g.state === 'play') g.onMobSnapshot(m.t, m.m);
        break;
      case 'hit': {
        if (g.role !== 'host') return;
        const mob = g.mobs.get(m.mob);
        if (mob) g.hurtMob(mob, m.dmg, m.kx, m.by);
        break;
      }
      case 'give':
        if (m.to !== me || g.state !== 'play') return;
        if (m.item > 0) {
          g.addItem(m.item, m.n);
        } else {
          g.stats.kills++;
          g.floatText(g.me.body.x, g.me.body.y - 2, '+25', '#fde047', 18);
        }
        break;
      case 'hurt':
        if (m.to === me && g.state === 'play') g.hurtMe(m.dmg, m.kx, m.ky, m.why);
        break;
      case 'boom':
        if (g.role === 'guest' && g.state === 'play') g.boomFx(m.x, m.y);
        break;
      case 'em': {
        const r = g.remotes.get(env.senderId);
        if (r) {
          r.emote = m.text;
          r.emoteT = 2.6;
        }
        break;
      }
    }
  }

  update(dt: number): void {
    if (!this.online()) return;
    const g = this.g;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.05;
      this.sendNow();
    }
    if (g.role === 'host') {
      this.diffT -= dt;
      if (this.diffT <= 0) {
        this.diffT = 0.05;
        const e = g.world.takeDiffs();
        if (e.length) this.sendDiff(e);
      }
      this.mobT -= dt;
      if (this.mobT <= 0) {
        this.mobT = 0.1;
        if (g.remotes.size > 0) this.send({ k: 'm', t: g.time, m: g.mobRows() });
      }
    }
  }

  tickLoading(dt: number): boolean {
    if (this.joinTimer > 0) {
      this.joinTimer -= dt;
      if (this.joinTimer <= 0) return true; // timeout
    }
    return false;
  }
}
