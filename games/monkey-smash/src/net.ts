import { FKEYS, type Ev, type Fighter, type Item, type MatchConfig, type Proj, type Rules } from './types';
import { newFighter } from './sim';
import type { World } from './sim';

// ---------------------------------------------------------------------------
// Protocolo P2P: host autoritativo. Guests mandam inputs; host manda snapshots.
// ---------------------------------------------------------------------------

export interface LobbySlot {
  kind: 'human' | 'bot' | 'remote' | 'off';
  char: number;
  level: number;
  name: string;
  peerId?: string;
}

export type NetMsg =
  | { k: 'pick'; char: number }
  | { k: 'lobby'; slots: LobbySlot[]; stage: number; rules: Rules }
  | { k: 'start'; cfg: MatchConfig }
  | { k: 'in'; s: number; b: number[] }
  | { k: 'snap'; s: Snap }
  | { k: 'back' };

export interface Snap {
  tick: number;
  count: number;
  tl: number;
  over: number;
  win: number;
  ovT: number;
  f: number[][];
  it: number[][];
  pr: number[][];
  ev: Ev[];
  ack: number[];
}

export function packWorld(w: World, ack: number[], events: Ev[]): Snap {
  return {
    tick: w.tick,
    count: w.count,
    tl: w.timeLeft,
    over: w.over,
    win: w.winner,
    ovT: w.overT,
    f: w.fighters.map((f) => FKEYS.map((k) => round3(f[k] as number))),
    it: w.items.map((i) => [i.id, i.kind, round3(i.x), round3(i.y), round3(i.vx), round3(i.vy), i.held, i.t, i.ground, i.armed]),
    pr: w.projs.map((p) => [p.id, p.kind, p.owner, round3(p.x), round3(p.y), round3(p.vx), round3(p.vy), p.face, p.t, p.hit, p.n]),
    ev: events,
    ack,
  };
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function unpackFighter(arr: number[], into: Fighter): void {
  for (let i = 0; i < FKEYS.length; i++) (into as unknown as Record<string, number>)[FKEYS[i]] = arr[i];
}

/** Estado "renderizável" reconstruído a partir de um snapshot. */
export interface SnapState {
  tick: number;
  recv: number;
  count: number;
  tl: number;
  over: number;
  win: number;
  ovT: number;
  fighters: Fighter[];
  items: Item[];
  projs: Proj[];
}

export function snapToState(s: Snap, cfg: MatchConfig, now: number): SnapState {
  const fighters: Fighter[] = s.f.map((arr, i) => {
    const sl = cfg.slots[i];
    const f = newFighter(i, sl.char, sl.ctrl, sl.name, sl.level, cfg.rules);
    unpackFighter(arr, f);
    return f;
  });
  const items: Item[] = s.it.map((a) => ({ id: a[0], kind: a[1], x: a[2], y: a[3], vx: a[4], vy: a[5], held: a[6], t: a[7], ground: a[8], armed: a[9] }));
  const projs: Proj[] = s.pr.map((a) => ({ id: a[0], kind: a[1], owner: a[2], x: a[3], y: a[4], vx: a[5], vy: a[6], face: a[7], t: a[8], hit: a[9], n: a[10] }));
  return { tick: s.tick, recv: now, count: s.count, tl: s.tl, over: s.over, win: s.win, ovT: s.ovT, fighters, items, projs };
}

/** Interpola entre dois estados (a antes de b) com alpha 0..1. */
export function lerpStates(a: SnapState, b: SnapState, alpha: number): SnapState {
  const fighters = b.fighters.map((fb, i) => {
    const fa = a.fighters[i];
    if (!fa) return fb;
    const src = alpha >= 0.5 ? fb : fa;
    const out: Fighter = { ...src };
    if (Math.abs(fb.x - fa.x) < 260 && Math.abs(fb.y - fa.y) < 260 && fa.dead === 0 && fb.dead === 0) {
      out.x = fa.x + (fb.x - fa.x) * alpha;
      out.y = fa.y + (fb.y - fa.y) * alpha;
      out.vx = fa.vx + (fb.vx - fa.vx) * alpha;
      out.vy = fa.vy + (fb.vy - fa.vy) * alpha;
    } else {
      out.x = fb.x;
      out.y = fb.y;
    }
    // campos "contínuos" que não devem piscar
    out.pct = fb.pct;
    out.stocks = fb.stocks;
    out.kos = fb.kos;
    out.falls = fb.falls;
    out.dealt = fb.dealt;
    out.shield = fb.shield;
    out.itemKind = fb.itemKind;
    out.dead = fb.dead;
    return out;
  });
  const items = b.items.map((ib) => {
    const ia = a.items.find((x) => x.id === ib.id);
    if (!ia) return ib;
    return { ...ib, x: ia.x + (ib.x - ia.x) * alpha, y: ia.y + (ib.y - ia.y) * alpha };
  });
  const projs = b.projs.map((pb) => {
    const pa = a.projs.find((x) => x.id === pb.id);
    if (!pa) return pb;
    return { ...pb, x: pa.x + (pb.x - pa.x) * alpha, y: pa.y + (pb.y - pa.y) * alpha };
  });
  return { ...b, fighters, items, projs };
}

/** Buffer de snapshots + relógio estimado do host. */
export class SnapBuffer {
  buf: SnapState[] = [];
  private offset = -1e9; // maior (tick - now*0.06) observado
  private lastReset = 0;

  push(st: SnapState): void {
    if (this.buf.length && st.tick <= this.buf[this.buf.length - 1].tick) return;
    this.buf.push(st);
    if (this.buf.length > 40) this.buf.shift();
    const o = st.tick - (st.recv * 60) / 1000;
    if (o > this.offset || st.recv - this.lastReset > 4000) {
      this.offset = this.offset === -1e9 ? o : o;
      this.lastReset = st.recv;
    }
  }

  latest(): SnapState | null {
    return this.buf.length ? this.buf[this.buf.length - 1] : null;
  }

  /** Tick estimado do host agora. */
  nowTick(now: number): number {
    return (now * 60) / 1000 + this.offset;
  }

  /** Estado interpolado em renderTick. */
  at(renderTick: number): SnapState | null {
    const b = this.buf;
    if (b.length === 0) return null;
    if (renderTick <= b[0].tick) return b[0];
    const last = b[b.length - 1];
    if (renderTick >= last.tick) return last;
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].tick <= renderTick && renderTick <= b[i].tick) {
        const span = b[i].tick - b[i - 1].tick || 1;
        return lerpStates(b[i - 1], b[i], (renderTick - b[i - 1].tick) / span);
      }
    }
    return last;
  }

  clear(): void {
    this.buf = [];
    this.offset = -1e9;
  }
}
