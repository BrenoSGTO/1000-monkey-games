// Rede: snapshots do host + interpolacao nos clientes.
import { PADS, wrapAngle } from './constants';
import type { MatchConfig, RenderCar, RenderState, SnapMsg } from './types';
import { PH_PLAY } from './types';

export const SNAP_INTERVAL = 1 / 20;
export const INPUT_INTERVAL = 1 / 30;
const INTERP_DELAY = 0.11;

interface Entry {
  s: SnapMsg;
  recv: number;
}

export class NetView {
  private buf: Entry[] = [];
  private offset = 0;
  private hasOffset = false;
  /** ultimo estado montado (reaproveitado quando nao ha snapshot) */
  last: RenderState | null = null;

  constructor(public cfg: MatchConfig) {}

  reset(): void {
    this.buf = [];
    this.hasOffset = false;
    this.last = null;
  }

  push(s: SnapMsg, nowSec: number): void {
    const off = nowSec - s.t;
    if (!this.hasOffset) {
      this.offset = off;
      this.hasOffset = true;
    } else {
      // segue o menor atraso (reduz o efeito do jitter)
      this.offset = off < this.offset ? off : this.offset + (off - this.offset) * 0.02;
    }
    this.buf.push({ s, recv: nowSec });
    if (this.buf.length > 40) this.buf.shift();
  }

  get ready(): boolean {
    return this.buf.length > 0;
  }

  get(nowSec: number): RenderState | null {
    if (!this.buf.length) return this.last;
    const latest = this.buf[this.buf.length - 1];
    const rt = nowSec - this.offset - INTERP_DELAY;
    let a = this.buf[0];
    let b = this.buf[0];
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (this.buf[i].s.t <= rt) {
        a = this.buf[i];
        b = this.buf[Math.min(i + 1, this.buf.length - 1)];
        break;
      }
    }
    let k = 0;
    if (b !== a) k = Math.min(1, Math.max(0, (rt - a.s.t) / Math.max(0.001, b.s.t - a.s.t)));
    const sa = a.s;
    const sb = b.s;

    const lerp = (x: number, y: number) => x + (y - x) * k;
    const jump = (x0: number, y0: number, x1: number, y1: number) => Math.hypot(x1 - x0, y1 - y0) > 9;

    const bj = jump(sa.b[0], sa.b[1], sb.b[0], sb.b[1]);
    const ball = bj
      ? { x: sa.b[0], y: sa.b[1], a: sa.b[2], vx: sa.b[3], vy: sa.b[4] }
      : {
          x: lerp(sa.b[0], sb.b[0]),
          y: lerp(sa.b[1], sb.b[1]),
          a: sa.b[2] + wrapAngle(sb.b[2] - sa.b[2]) * k,
          vx: lerp(sa.b[3], sb.b[3]),
          vy: lerp(sa.b[4], sb.b[4]),
        };

    const cars: RenderCar[] = this.cfg.slots.map((slot, i) => {
      const ca = sa.c[i] ?? sb.c[i];
      const cb = sb.c[i] ?? ca;
      const cj = jump(ca[0], ca[1], cb[0], cb[1]);
      const src = k > 0.5 ? cb : ca;
      const flags = src[6];
      return {
        slot: slot.slot,
        team: slot.team,
        car: slot.car,
        fur: slot.fur,
        name: slot.name,
        x: cj ? ca[0] : lerp(ca[0], cb[0]),
        y: cj ? ca[1] : lerp(ca[1], cb[1]),
        a: cj ? ca[2] : ca[2] + wrapAngle(cb[2] - ca[2]) * k,
        vx: lerp(ca[3], cb[3]),
        vy: lerp(ca[4], cb[4]),
        boost: src[5],
        facing: (flags & 4) !== 0 ? 1 : -1,
        grounded: (flags & 1) !== 0,
        boosting: (flags & 2) !== 0,
        flipT: src[7],
        bot: slot.bot,
      };
    });

    const l = latest.s;
    const since = Math.max(0, nowSec - latest.recv);
    const mask = l.p;
    const view: RenderState = {
      cars,
      ball,
      pads: PADS.map((_, i) => (mask & (1 << i)) !== 0),
      scoreA: l.sa,
      scoreB: l.sb,
      timeLeft: l.ot ? l.tl + (l.ph === PH_PLAY ? since : 0) : Math.max(0, l.tl - (l.ph === PH_PLAY ? since : 0)),
      overtime: l.ot === 1,
      phase: l.ph,
      phaseT: l.pt + since,
      goal: l.g,
    };
    this.last = view;
    return view;
  }
}
