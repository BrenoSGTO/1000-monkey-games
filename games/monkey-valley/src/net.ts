import { PeerRoom } from '@monkey-slop/sdk';
import type { PlayerProfile } from '@monkey-slop/sdk';
import type { NetMsg, OpResult, RemoteInfo } from './types';
import { S } from './state';
import { playerLook } from './data';

export interface NetHooks {
  /** host: executa uma operação pedida por um convidado */
  handleReq: (op: string, a: unknown) => OpResult;
  /** convidado: recebeu o snapshot inicial */
  onSnapshot: () => void;
  /** convidado: o host virou o dia */
  onNewDay: (earned: number, dead: number, season: boolean, passed: boolean) => void;
  onPlayers: (players: PlayerProfile[]) => void;
  onFx: (kind: string, x: number, y: number) => void;
}

export class ValleyNet {
  room: PeerRoom<NetMsg>;
  private hooks: NetHooks;
  private pending = new Map<number, (r: OpResult) => void>();
  private rid = 1;
  private posT = 0;
  private clockT = 0;
  private animT = 0;
  private helloT = 0;

  constructor(hooks: NetHooks) {
    this.hooks = hooks;
    this.room = new PeerRoom<NetMsg>('monkey-valley', {
      onStatus: (status, detail) => {
        if (status === 'error' && detail) S.toast(`Erro P2P: ${detail}`, 'chaos');
      },
      onPlayersChange: (players) => this.playersChanged(players),
      onMessage: (env) => this.onMessage(env.senderId, env.payload),
    });
  }

  get myId(): string {
    return this.room.localPlayer.id;
  }

  private playersChanged(players: PlayerProfile[]): void {
    const was = S.online;
    S.online = players.length > 1;
    const host = this.room.localPlayer.isHost;
    S.auth = !S.online || host;
    const ids = new Set(players.map((p) => p.id));
    for (const id of Array.from(S.remotes.keys())) if (!ids.has(id)) {
      const r = S.remotes.get(id);
      if (r) S.toast(`🐒 ${r.info.name} saiu da roça.`, 'info');
      S.remotes.delete(id);
    }
    if (S.online && !was) {
      S.toast(host ? '🌾 Alguém entrou na sua roça!' : '🌾 Conectado à roça do host!', 'banana');
      if (!host) S.gotSnapshot = false;
    }
    if (!S.online) {
      S.auth = true;
      S.remotes.clear();
    }
    if (S.started || S.online) S.me.id = this.myId;
    this.hooks.onPlayers(players);
  }

  send(m: NetMsg): void {
    if (!S.online) return;
    this.room.send('v', m);
  }

  request(op: string, a: unknown, cb: (r: OpResult) => void): void {
    const rid = this.rid++;
    const timer = window.setTimeout(() => {
      if (this.pending.delete(rid)) cb({ ok: false, msg: 'A conexão com o host falhou...' });
    }, 4000);
    this.pending.set(rid, (r) => {
      clearTimeout(timer);
      cb(r);
    });
    this.send({ k: 'req', id: this.myId, rid, op, a });
  }

  broadcastClock(): void {
    const w = S.world;
    this.send({ k: 'clock', day: w.day, season: w.season, year: w.year, min: w.minutes, weather: w.weather, money: w.money, ship: w.ship, hay: w.hay });
  }

  broadcastFriends(): void {
    this.send({ k: 'friends', f: S.world.friends });
  }

  info(): RemoteInfo {
    const p = S.me;
    return { id: this.myId, name: this.room.localPlayer.name || p.name, fi: p.fi, si: p.si, x: p.x, y: p.y, d: p.dir, mv: p.moving, map: p.map, sw: p.swing > 0 ? p.swingSlot + 1 : 0, sleep: p.sleeping };
  }

  tick(dt: number): void {
    if (!S.online) return;
    this.posT += dt;
    if (this.posT >= 0.08 && S.started) {
      this.posT = 0;
      this.send({ k: 'pos', p: this.info() });
    }
    if (S.auth) {
      if (!S.started) return;
      this.clockT += dt;
      if (this.clockT >= 1) {
        this.clockT = 0;
        this.broadcastClock();
      }
      this.animT += dt;
      if (this.animT >= 0.25 && S.world.animals.length) {
        this.animT = 0;
        this.send({ k: 'animals', a: S.world.animals });
      }
    } else if (!S.gotSnapshot) {
      this.helloT += dt;
      if (this.helloT >= 1.2) {
        this.helloT = 0;
        this.send({ k: 'hello', id: this.myId });
      }
    }
  }

  private onMessage(sender: string, m: NetMsg): void {
    if (!m || typeof m.k !== 'string') return;
    const w = S.world;
    switch (m.k) {
      case 'pos': {
        const p = m.p;
        if (p.id === this.myId) return;
        let r = S.remotes.get(p.id);
        if (!r) {
          r = { info: p, x: p.x, y: p.y, anim: 0, look: playerLook(p.fi, p.si), swing: 0 };
          S.remotes.set(p.id, r);
          S.toast(`🐒 ${p.name} chegou na roça!`, 'info');
        }
        if (r.info.fi !== p.fi || r.info.si !== p.si) r.look = playerLook(p.fi, p.si);
        if (p.sw && !r.info.sw) r.swing = 0.3;
        r.info = p;
        break;
      }
      case 'hello':
        if (S.auth && S.started) this.send({ k: 'snap', to: m.id, w: w.toSave() });
        break;
      case 'snap':
        if (m.to !== this.myId || S.auth) return;
        w.load(m.w, true);
        S.gotSnapshot = true;
        this.hooks.onSnapshot();
        break;
      case 'req':
        if (!S.auth) return;
        {
          const r = this.hooks.handleReq(m.op, m.a);
          this.send({ k: 'res', to: m.id, rid: m.rid, r });
          const ch = w.takeDirty();
          if (ch.length) this.send({ k: 'tile', ch });
          this.broadcastClock();
          if (m.op === 'talk' || m.op === 'gift') this.broadcastFriends();
          if (m.op === 'animal' || m.op === 'buyAnimal') this.send({ k: 'animals', a: w.animals });
        }
        break;
      case 'res': {
        if (m.to !== this.myId) return;
        const cb = this.pending.get(m.rid);
        if (cb) {
          this.pending.delete(m.rid);
          cb(m.r);
        }
        break;
      }
      case 'tile':
        if (!S.auth) w.applyTiles(m.ch);
        break;
      case 'clock':
        if (S.auth) return;
        w.day = m.day;
        w.season = m.season;
        w.year = m.year;
        w.weather = m.weather;
        w.money = m.money;
        w.ship = m.ship;
        w.hay = m.hay;
        if (Math.abs(w.minutes - m.min) > 2) w.minutes = m.min;
        break;
      case 'animals':
        if (!S.auth) w.animals = m.a;
        break;
      case 'friends':
        if (!S.auth) w.friends = m.f;
        break;
      case 'newday':
        if (S.auth) return;
        w.load(m.w, true);
        S.gotSnapshot = true;
        this.hooks.onNewDay(m.earned, m.dead, m.season, m.passed);
        break;
      case 'fx':
        this.hooks.onFx(m.kind, m.x, m.y);
        break;
      case 'say': {
        const r = S.remotes.get(m.who);
        if (r) S.floaters.push({ x: r.x, y: r.y - 36, text: m.text, life: 2.4, col: '#fff' });
        break;
      }
    }
    void sender;
  }
}
