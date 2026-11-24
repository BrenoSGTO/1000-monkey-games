import type { Kart } from './kart';
import { ITEM_TYPES, type Input, type ItemType } from './types';
import type { Item, World } from './world';
import { angDiff, lerp } from './util';

export interface KartSnap {
  i: number;
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  sp: number;
  st: number;
  dr: number;
  dl: number;
  dt: number;
  bo: number;
  bm: number;
  sn: number;
  sa: number;
  fa: number;
  iv: number;
  sl: number;
  sg: number;
  gu: number;
  it: number;
  ro: number;
  lf: number;
  la: number;
  fi: number;
  ft: number;
  pl: number;
  ex: number;
  hb: string;
  bt: number;
  hp: number;
  su: number;
  ww: number;
}

export interface ItemSnap {
  id: number;
  ty: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  h: number;
  ow: number;
  lf: number;
}

export interface Snapshot {
  clock: number;
  t: number;
  ph: number;
  ct: number;
  fc: number;
  ks: KartSnap[];
  its: ItemSnap[];
  bx: number[];
  ack: Record<string, number>;
}

export interface NetInput {
  seq: number;
  st: number;
  ac: number;
  br: number;
  dr: number;
  ic: number;
}

export type NetMsg = unknown;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function encodeSnapshot(w: World, ack: Record<string, number>): Snapshot {
  return {
    clock: r2(w.clock),
    t: r2(w.t),
    ph: w.phase === 'grid' ? 0 : w.phase === 'racing' ? 1 : 2,
    ct: r2(w.countT),
    fc: w.finishedCount,
    ks: w.karts.map((k) => ({
      i: k.id,
      x: r1(k.x),
      y: r1(k.y),
      h: r2(k.h),
      vx: r1(k.vx),
      vy: r1(k.vy),
      sp: r1(k.spd),
      st: r2(k.steer),
      dr: k.drift,
      dl: k.driftLvl,
      dt: r2(k.driftT),
      bo: r2(k.boostT),
      bm: r2(k.boostMult),
      sn: r2(k.spinT),
      sa: r2(k.spinAngle),
      fa: r2(k.fallT),
      iv: r2(k.invulnT),
      sl: r2(k.slowT),
      sg: r2(k.stingT),
      gu: r2(k.guaranaT),
      it: k.item ? ITEM_TYPES.indexOf(k.item) : -1,
      ro: r2(k.rouletteT),
      lf: r1(k.lapF),
      la: k.lap,
      fi: k.finished ? 1 : 0,
      ft: r2(k.finishTime),
      pl: k.place,
      ex: k.expr,
      hb: k.hitBy,
      bt: r2(k.bumpT),
      hp: r2(k.hopT),
      su: k.surf,
      ww: r2(k.wrongWayT),
    })),
    its: w.items.map((it) => ({
      id: it.id,
      ty: ITEM_TYPES.indexOf(it.type),
      x: r1(it.x),
      y: r1(it.y),
      vx: r1(it.vx),
      vy: r1(it.vy),
      h: r2(it.h),
      ow: it.owner,
      lf: r1(it.life),
    })),
    bx: w.boxT.map((b) => (b > 0 ? Math.round(b * 10) / 10 : 0)),
    ack,
  };
}

export function encodeInput(inp: Input, seq: number): NetInput {
  return { seq, st: r2(inp.steer), ac: r2(inp.accel), br: r2(inp.brake), dr: inp.drift ? 1 : 0, ic: inp.itemCount };
}

export function decodeInput(n: NetInput, into: Input): void {
  into.steer = n.st;
  into.accel = n.ac;
  into.brake = n.br;
  into.drift = n.dr === 1;
  into.itemCount = n.ic;
}

interface Stored {
  at: number;
  s: Snapshot;
}

export class SnapBuffer {
  private buf: Stored[] = [];
  push(s: Snapshot): void {
    this.buf.push({ at: performance.now(), s });
    if (this.buf.length > 12) this.buf.shift();
  }
  latest(): Snapshot | null {
    return this.buf.length ? this.buf[this.buf.length - 1].s : null;
  }
  clear(): void {
    this.buf = [];
  }
  /** Returns bracketing snapshots and the interpolation factor for `delayMs` ago. */
  sample(delayMs: number): { a: Snapshot; b: Snapshot; f: number } | null {
    if (!this.buf.length) return null;
    const t = performance.now() - delayMs;
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (this.buf[i].at <= t) {
        const a = this.buf[i];
        const b = this.buf[i + 1] ?? a;
        const span = b.at - a.at;
        const f = span > 0 ? Math.min(1, (t - a.at) / span) : 1;
        return { a: a.s, b: b.s, f };
      }
    }
    const first = this.buf[0].s;
    return { a: first, b: first, f: 0 };
  }
}

function applyDiscrete(k: Kart, s: KartSnap): void {
  k.driftLvl = s.dl;
  k.boostT = s.bo;
  k.boostMult = s.bm;
  k.spinT = s.sn;
  k.fallT = s.fa;
  k.invulnT = s.iv;
  k.slowT = s.sl;
  k.stingT = s.sg;
  k.guaranaT = s.gu;
  k.item = s.it >= 0 ? ITEM_TYPES[s.it] : null;
  k.rouletteT = s.ro;
  k.lap = s.la;
  k.finished = s.fi === 1;
  k.finishTime = s.ft;
  k.place = s.pl;
  k.expr = s.ex;
  k.exprT = s.ex ? 0.3 : 0;
  k.hitBy = s.hb;
  k.bumpT = s.bt;
  k.hopT = s.hp;
  k.surf = s.su;
  k.wrongWayT = s.ww;
}

/** Apply host data to a guest world. `me` is the id of the locally controlled kart (or -1). */
export function applySnapshot(w: World, buf: SnapBuffer, me: number, rttSec: number, interpDelay = 110): void {
  const latest = buf.latest();
  if (!latest) return;
  w.phase = latest.ph === 0 ? 'grid' : latest.ph === 1 ? 'racing' : 'done';
  w.countT = latest.ct;
  w.finishedCount = latest.fc;
  w.t = latest.t;
  w.boxT = latest.bx.slice();
  // items: take latest (extrapolated locally in stepGuest)
  const old = new Map(w.items.map((i) => [i.id, i]));
  w.items = latest.its.map((s) => {
    const prev = old.get(s.id);
    const it: Item = prev ?? {
      id: s.id,
      type: ITEM_TYPES[s.ty] as ItemType,
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      h: s.h,
      owner: s.ow,
      life: s.lf,
      arm: 0,
      target: -1,
      bounces: 0,
      idx: 0,
      lapF: 0,
      spin: 0,
    };
    // soft-correct towards the host position
    it.x = prev ? lerp(prev.x, s.x, 0.5) : s.x;
    it.y = prev ? lerp(prev.y, s.y, 0.5) : s.y;
    it.vx = s.vx;
    it.vy = s.vy;
    it.h = s.h;
    it.life = s.lf;
    return it;
  });

  for (const s of latest.ks) {
    const k = w.karts[s.i];
    if (!k) continue;
    applyDiscrete(k, s);
    if (k.id !== me) continue;
    // reconcile prediction with the authoritative state
    const px = s.x + s.vx * rttSec;
    const py = s.y + s.vy * rttSec;
    const ex = px - k.x;
    const ey = py - k.y;
    const err = Math.hypot(ex, ey);
    if (err > 170 || s.fa > 0 || s.sn > 0.9 || k.fallT > 0) {
      k.x = s.x;
      k.y = s.y;
      k.h = s.h;
      k.vx = s.vx;
      k.vy = s.vy;
      k.lapF = s.lf;
      k.spinAngle = s.sa;
    } else {
      k.x += ex * 0.12;
      k.y += ey * 0.12;
      k.vx = lerp(k.vx, s.vx, 0.08);
      k.vy = lerp(k.vy, s.vy, 0.08);
      k.h += angDiff(s.h, k.h) * 0.08;
      if (Math.abs(k.lapF - s.lf) > 40) k.lapF = s.lf;
    }
    if (k.spinT > 0) k.spinAngle = s.sa;
    k.spd = s.sp;
  }
  interpolateRemotes(w, buf, me, interpDelay);
}

/** Smoothly interpolates all non-local karts between the two bracketing snapshots. Call every frame. */
export function interpolateRemotes(w: World, buf: SnapBuffer, me: number, interpDelay = 110): void {
  const latest = buf.latest();
  const smp = buf.sample(interpDelay);
  if (!latest || !smp) return;
  for (const s of latest.ks) {
    const k = w.karts[s.i];
    if (!k || k.id === me) continue;
    const a = smp.a.ks[s.i] ?? s;
    const b = smp.b.ks[s.i] ?? a;
    k.x = lerp(a.x, b.x, smp.f);
    k.y = lerp(a.y, b.y, smp.f);
    k.h = a.h + angDiff(b.h, a.h) * smp.f;
    k.vx = lerp(a.vx, b.vx, smp.f);
    k.vy = lerp(a.vy, b.vy, smp.f);
    k.spd = lerp(a.sp, b.sp, smp.f);
    k.steer = lerp(a.st, b.st, smp.f);
    k.drift = s.dr;
    k.driftT = s.dt;
    k.spinAngle = s.sa;
    k.lapF = s.lf;
  }
}
