import { St, ItemKind, clamp, type Fighter } from './types';
import { CHARS, type CharDef, type Move } from './fighters';

// ---------------------------------------------------------------------------
// Rig de partes (cabeça/torso/braços/pernas) animado por poses.
// Ângulos em radianos: 0 = membro pendurado pra baixo, +PI/2 = pra frente, PI = pra cima.
// ---------------------------------------------------------------------------

export interface Pose {
  x: number; y: number; rot: number; lean: number; head: number;
  aF1: number; aF2: number; aB1: number; aB2: number;
  lF1: number; lF2: number; lB1: number; lB2: number;
  tail: number; sx: number; sy: number;
}

const IDLE: Pose = {
  x: 0, y: 0, rot: 0, lean: 0.04, head: 0,
  aF1: 0.28, aF2: 0.55, aB1: -0.18, aB2: 0.4,
  lF1: 0.12, lF2: 0.15, lB1: -0.1, lB2: 0.12,
  tail: 0, sx: 1, sy: 1,
};
const P = (o: Partial<Pose>): Pose => ({ ...IDLE, ...o });
const KEYS = Object.keys(IDLE) as (keyof Pose)[];

function mixPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

interface StrikeDef { wind: Pose; strike: Pose; spin?: number; prop?: string }

const ANIMS: Record<string, StrikeDef> = {
  jab: { wind: P({ aF1: 1.0, aF2: 1.9, lean: -0.05, aB1: -0.3 }), strike: P({ aF1: 1.55, aF2: 0.0, lean: 0.14, aB1: -0.4, x: 4 }) },
  ftilt: { wind: P({ lF1: -0.45, lF2: 0.8, lean: -0.1, aF1: 1.0, aF2: 1.2 }), strike: P({ lF1: 1.5, lF2: 0.05, lean: -0.2, aF1: -0.3, aB1: 1.4, aB2: 0.3, y: -2 }) },
  utilt: { wind: P({ aF1: 0.1, aF2: 1.0, head: 0.2, y: 4, lF2: 0.5 }), strike: P({ aF1: 2.9, aF2: 0.1, head: -0.3, lean: -0.1, y: -4 }) },
  dtilt: { wind: P({ y: 14, sy: 0.9, lF1: 0.9, lF2: 1.4, lB1: -0.5, lB2: 1.0 }), strike: P({ y: 16, sy: 0.88, lF1: 1.5, lF2: 0.0, lB1: -0.6, lB2: 1.2, lean: 0.25, aF1: 0.8 }) },
  fsmash: { wind: P({ aF1: 2.7, aF2: 0.4, aB1: 2.4, aB2: 0.4, lean: -0.38, lF2: 0.5, x: -6 }), strike: P({ aF1: 1.5, aF2: 0.0, aB1: 1.25, aB2: 0.1, lean: 0.38, x: 10, lF1: 0.5, lB1: -0.7 }), prop: 'big' },
  usmash: { wind: P({ y: 10, sy: 0.9, aF1: -0.6, aB1: -0.5, aF2: 0.4, lF2: 0.9, lB2: 0.8, lF1: 0.5, lB1: -0.4 }), strike: P({ aF1: 3.0, aF2: 0.1, aB1: 2.9, aB2: 0.1, y: -8, sy: 1.1, head: -0.35, lean: -0.1 }), prop: 'big' },
  dsmash: { wind: P({ y: 12, sy: 0.9, aF1: 0.5, lF2: 1.0, lB2: 1.0, lF1: 0.8, lB1: -0.8 }), strike: P({ y: 8, aF1: 1.5, aB1: -1.5, lF1: 1.5, lB1: -1.5, lF2: 0, lB2: 0 }), spin: 1 },
  nair: { wind: P({ lF1: 0.8, lB1: -0.2, lF2: 1.0, aF1: 1.0 }), strike: P({ aF1: 1.6, aB1: -1.6, lF1: 1.0, lB1: -1.0, lF2: 0.1, lB2: 0.1 }), spin: 1 },
  fair: { wind: P({ lF1: -0.2, lF2: 1.3, lean: 0.1, aF1: 0.9 }), strike: P({ lF1: 1.6, lF2: 0.05, lean: -0.3, aF1: -0.6, aB1: 1.6, lB1: -0.9, lB2: 0.9 }) },
  bair: { wind: P({ lB1: 0.1, lB2: 1.2, lean: -0.1 }), strike: P({ lB1: -1.7, lB2: 0.05, lean: 0.35, aF1: 1.6, aB1: -1.2, lF1: 0.7, lF2: 0.7 }) },
  uair: { wind: P({ lF1: 0.4, lF2: 1.1, lB1: -0.3, lB2: 1.0 }), strike: P({ lF1: 2.9, lF2: 0.05, lB1: 2.6, lB2: 0.4, lean: -0.5, rot: -0.35, aF1: 1.0, aB1: 0.8 }) },
  dair: { wind: P({ lF1: 0.6, lF2: 1.4, lB1: -0.6, lB2: 1.4, aF1: 2.6, aB1: 2.6 }), strike: P({ lF1: 0.1, lF2: 0, lB1: -0.1, lB2: 0, aF1: 2.9, aB1: 2.9, sy: 1.08, sx: 0.92, lean: 0 }) },
  grab: { wind: P({ aF1: 0.6, aB1: 0.4, lean: -0.05 }), strike: P({ aF1: 1.55, aF2: 0.0, aB1: 1.5, aB2: 0.05, lean: 0.22, x: 4 }) },
  pummel: { wind: P({ aF1: 1.3, aF2: 1.6, lean: 0.1 }), strike: P({ aF1: 1.55, aF2: 0.3, lean: 0.2 }) },
  throw: { wind: P({ aF1: 1.3, aB1: 1.3, aF2: 0.2, lean: -0.3 }), strike: P({ aF1: 2.0, aB1: 2.0, aF2: 0.1, lean: 0.4, x: 8 }) },
  throwU: { wind: P({ aF1: 0.5, aB1: 0.5, y: 6, sy: 0.92 }), strike: P({ aF1: 3.0, aB1: 3.0, y: -6, sy: 1.08, head: -0.2 }) },
  shoot: { wind: P({ aF1: 1.0, aF2: 1.9, aB1: 0.8, aB2: 1.6, lean: -0.1 }), strike: P({ aF1: 1.55, aF2: 0.1, aB1: 1.4, aB2: 0.3, lean: 0.12 }), prop: 'cast' },
  toss: { wind: P({ aF1: 2.9, aF2: 1.3, lean: -0.25 }), strike: P({ aF1: 1.2, aF2: 0.1, lean: 0.3 }) },
  spin: { wind: P({ lean: -0.2, lF2: 0.9, lB1: -0.6 }), strike: P({ lF1: 1.55, lF2: 0.05, lB1: -0.9, lB2: 0.3, aF1: -0.9, aB1: 1.4, lean: -0.25 }), spin: 1 },
  dash: { wind: P({ lean: 0.2, lF1: 0.4, lB1: -0.5, aF1: 0.5, aB1: -0.5 }), strike: P({ lean: 0.55, lF1: 0.95, lF2: 0.5, lB1: -1.0, lB2: 0.6, aF1: 1.55, aB1: 1.4, aF2: 0.1, x: 8 }), prop: 'big' },
  cart: { wind: P({ lean: 0.3, y: 6, aF1: 2.6, aB1: 2.6, lF2: 0.8 }), strike: P({ aF1: 2.9, aB1: 2.9, lF1: 2.6, lB1: -2.6, lF2: 0.05, lB2: 0.05 }), spin: 1 },
  heli: { wind: P({ y: 8, sy: 0.92, aF1: 2.5, aB1: 2.5 }), strike: P({ aF1: 3.1, aB1: 3.1, lF1: 0.5, lB1: -0.5, lF2: 0.9, lB2: 0.9 }), spin: 3, prop: 'big' },
  tele: { wind: P({ y: 10, sy: 0.82, sx: 1.12, lF2: 1.0, lB2: 1.0, lF1: 0.6, lB1: -0.4 }), strike: P({ sy: 1.2, sx: 0.8, aF1: 3.0, aB1: 3.0, lF1: 0.1, lB1: -0.1, lF2: 0, lB2: 0 }) },
  pound: { wind: P({ y: -10, aF1: 3.1, aB1: 3.1, lF1: 0.4, lB1: -0.4, lF2: 0.9, lB2: 0.9 }), strike: P({ y: 10, sy: 0.84, sx: 1.16, aF1: 0.3, aB1: -0.3, lF1: 0.6, lB1: -0.6, lF2: 0.5, lB2: 0.5, lean: 0.1 }), prop: 'big' },
  counter: { wind: P({ y: 12, sy: 0.9, lean: -0.3, aF1: 1.3, aF2: 2.0, aB1: 1.0, aB2: 2.1, lF1: 0.5, lF2: 1.0, lB1: -0.5, lB2: 1.0 }), strike: P({ y: 16, sy: 0.86, lean: -0.4, aF1: 1.3, aF2: 2.0, aB1: 1.0, aB2: 2.1, lF1: 0.6, lF2: 1.1, lB1: -0.6, lB2: 1.1 }) },
  counterStrike: { wind: P({ lean: -0.2, lF2: 0.9 }), strike: P({ lF1: 1.6, lF2: 0.05, lean: -0.3, aF1: -0.7, aB1: 1.5 }) },
  swing: { wind: P({ aF1: 2.9, aF2: 0.6, aB1: 2.5, lean: -0.35, x: -4 }), strike: P({ aF1: 1.1, aF2: 0.0, aB1: 0.9, lean: 0.4, x: 8 }), prop: 'big' },
  block: { wind: P({ aF1: 1.5, aF2: 2.2, aB1: 1.5, aB2: 2.2, lean: 0.12 }), strike: P({ aF1: 1.6, aF2: 2.3, aB1: 1.6, aB2: 2.3, lean: 0.16, y: 3 }) },
  scream: { wind: P({ y: 6, aF1: 0.4, aB1: 0.4 }), strike: P({ aF1: 3.0, aB1: 3.0, head: -0.35, lean: -0.25, sy: 1.08 }) },
  bellow: { wind: P({ lean: -0.2, aF1: 1.0, aB1: 1.0 }), strike: P({ lean: -0.35, head: -0.3, aF1: 1.6, aB1: 1.5, aF2: 0.3, y: 4 }) },
  umbrella: { wind: P({ y: 6, aF1: 2.5 }), strike: P({ aF1: 3.1, aF2: 0.0, lF1: 0.3, lB1: -0.3, lF2: 0.7, lB2: 0.7, sy: 1.06 }) },
  smashDown: { wind: P({ aF1: 3.0, aF2: 0.5, aB1: 3.0, lean: -0.4 }), strike: P({ aF1: 1.0, aF2: 0.0, aB1: 0.9, lean: 0.45, y: 5, x: 8 }), prop: 'big' },
  smoke: { wind: P({ y: 12, sy: 0.86, sx: 1.1, aF1: 0.3, aB1: 0.3, lF2: 1.0, lB2: 1.0 }), strike: P({ aF1: 1.7, aB1: -1.7, lF1: 0.6, lB1: -0.6, sy: 1.1, sx: 0.92 }) },
};

export interface FighterFx {
  sx: number; sy: number; vsx: number; vsy: number;
  flash: number;
  lastGround: number;
  lastVy: number;
  lastState: number;
  lastSt: number;
  lastJumps: number;
  lastMove: number;
  lastPct: number;
  blink: number;
  trail: { x: number; y: number; a: number }[];
}

export function newFighterFx(): FighterFx {
  return { sx: 1, sy: 1, vsx: 0, vsy: 0, flash: 0, lastGround: 1, lastVy: 0, lastState: 0, lastSt: 0, lastJumps: 0, lastMove: -1, lastPct: 0, blink: 0, trail: [] };
}

export interface MoveTiming { a0: number; a1: number; dur: number }

export function timingOf(mv: Move): MoveTiming {
  let a0 = 1e9;
  let a1 = 0;
  for (const b of mv.boxes) {
    a0 = Math.min(a0, b.t0);
    a1 = Math.max(a1, b.t1);
  }
  if (mv.proj) for (const p of mv.proj) { a0 = Math.min(a0, p.t); a1 = Math.max(a1, p.t + 3); }
  if (mv.tele) { a0 = Math.min(a0, mv.tele.t); a1 = Math.max(a1, mv.tele.t + 6); }
  if (mv.throwAt) { a0 = Math.min(a0, mv.throwAt.t); a1 = Math.max(a1, mv.throwAt.t + 6); }
  if (mv.itemThrow !== undefined) { a0 = Math.min(a0, mv.itemThrow); a1 = Math.max(a1, mv.itemThrow + 4); }
  if (mv.counter) { a0 = Math.min(a0, mv.counter[0]); a1 = Math.max(a1, mv.counter[1]); }
  if (mv.reflect) { a0 = Math.min(a0, mv.reflect[0]); a1 = Math.max(a1, mv.reflect[1]); }
  if (a0 === 1e9) { a0 = Math.round(mv.dur * 0.35); a1 = a0 + 4; }
  return { a0: Math.max(1, a0), a1: Math.max(a0 + 1, a1), dur: mv.dur };
}

export type Mood = 'normal' | 'angry' | 'hurt' | 'happy' | 'ko' | 'focus' | 'scream' | 'worry';

interface Resolved { pose: Pose; mood: Mood; prop: string; moveAnim: string }

export interface PoseOpts { time: number; win?: boolean; lose?: boolean; ko?: boolean; menu?: boolean }

function resolvePose(f: Fighter, ch: CharDef, o: PoseOpts): Resolved {
  const tm = o.time;
  const base = P({});
  let mood: Mood = f.pct >= 110 ? 'worry' : 'normal';
  let prop = '';
  let anim = '';
  const bob = Math.sin(tm * 3.1 + f.slot) * 0.5 + 0.5;
  if (o.win) {
    const k = Math.sin(tm * 7) * 0.5 + 0.5;
    return { pose: P({ aF1: 2.9 + k * 0.2, aF2: 0.3, aB1: 2.8 - k * 0.2, aB2: 0.3, y: -Math.abs(Math.sin(tm * 6)) * 12, lean: -0.05, head: -0.1, lF1: 0.2, lB1: -0.2 }), mood: 'happy', prop: '', moveAnim: '' };
  }
  if (o.lose) {
    return { pose: P({ y: 10, sy: 0.9, lean: 0.25, head: 0.35, aF1: 0.05, aB1: -0.05, aF2: 0.2, aB2: 0.2, lF2: 0.9, lB2: 0.9, lF1: 0.5, lB1: -0.5 }), mood: 'hurt', prop: '', moveAnim: '' };
  }
  switch (f.state) {
    case St.IDLE: {
      const wob = bob * 0.06;
      return {
        pose: P({ y: bob * 1.6, sy: 1 - bob * 0.02, lean: 0.04 + wob, aF1: 0.3 + wob, aB1: -0.2 - wob, tail: Math.sin(tm * 2 + f.slot) * 0.2 }),
        mood: f.pct >= 110 ? 'worry' : 'normal', prop, moveAnim: anim,
      };
    }
    case St.RUN: {
      const ph = f.x * 0.055;
      const s = Math.sin(ph);
      const sp = clamp(Math.abs(f.vx) / ch.run, 0.3, 1);
      return {
        pose: P({
          lean: 0.18 * sp, y: -Math.abs(Math.cos(ph)) * 3 * sp,
          lF1: s * 1.0 * sp, lF2: 0.3 + Math.max(0, -s) * 0.9 * sp, lB1: -s * 1.0 * sp, lB2: 0.3 + Math.max(0, s) * 0.9 * sp,
          aF1: -s * 0.9 * sp + 0.2, aF2: 0.9, aB1: s * 0.9 * sp - 0.1, aB2: 0.9, tail: -s * 0.3,
        }),
        mood, prop, moveAnim: anim,
      };
    }
    case St.JSQ:
      return { pose: P({ y: 9, sy: 0.86, sx: 1.1, lF1: 0.55, lF2: 1.1, lB1: -0.45, lB2: 1.0, aF1: -0.4, aB1: -0.5, lean: 0.2 }), mood, prop, moveAnim: anim };
    case St.AIR: {
      let p: Pose;
      if (f.vy < -1) p = P({ aF1: 2.5, aF2: 0.4, aB1: 2.3, aB2: 0.5, lF1: 0.5, lF2: 1.0, lB1: -0.3, lB2: 1.1, lean: -0.04, sy: 1.06, sx: 0.96 });
      else p = P({ aF1: 1.7, aF2: 0.3, aB1: 1.5, aB2: 0.4, lF1: 0.35, lF2: 0.7, lB1: -0.45, lB2: 0.6, lean: 0.08 });
      if (f.help) p = P({ aF1: 2.6, aB1: 2.4, lF1: 0.3, lB1: -0.3, lF2: 0.5, lB2: 0.5, lean: 0, rot: Math.sin(tm * 14) * 0.08 });
      if (f.st < 20 && f.jumps < ch.jumps && !f.help) {
        // pulo duplo: cambalhota
        p.rot = (f.st / 20) * Math.PI * 2 * (f.vx >= 0 ? 1 : -1) * (f.face >= 0 ? 1 : -1) * 0.9;
        p.lF2 = 1.3;
        p.lB2 = 1.3;
      }
      return { pose: p, mood, prop, moveAnim: anim };
    }
    case St.LAND: {
      const k = clamp(f.st / Math.max(1, f.lag), 0, 1);
      return { pose: P({ y: (1 - k) * 8, sy: 1 - (1 - k) * 0.16, sx: 1 + (1 - k) * 0.12, lF2: 0.8 * (1 - k) + 0.15, lB2: 0.8 * (1 - k) + 0.12, lF1: 0.5 * (1 - k) + 0.1, lB1: -0.4 * (1 - k) - 0.1, lean: 0.12 }), mood, prop, moveAnim: anim };
    }
    case St.HITSTUN: {
      const spinDir = f.vx >= 0 ? 1 : -1;
      const fast = Math.hypot(f.vx, f.vy) > 7;
      const rot = fast ? tm * 12 * spinDir * (f.face >= 0 ? 1 : -1) : Math.sin(tm * 20) * 0.12;
      return { pose: P({ rot, aF1: 2.2, aF2: 0.2, aB1: -2.2, aB2: 0.2, lF1: 0.9, lF2: 0.5, lB1: -0.9, lB2: 0.5, lean: -0.15, head: -0.3 }), mood: f.shield <= 0 && f.stun > 20 ? 'ko' : 'hurt', prop, moveAnim: anim };
    }
    case St.SHIELD:
      return { pose: P({ y: 6, sy: 0.93, lean: 0.25, aF1: 1.3, aF2: 2.1, aB1: 1.1, aB2: 2.2, lF1: 0.4, lF2: 0.8, lB1: -0.4, lB2: 0.8 }), mood: 'focus', prop, moveAnim: anim };
    case St.DODGE: {
      if (f.ground && f.sdir !== 0) {
        return { pose: P({ rot: f.st * 0.5 * f.sdir * (f.face >= 0 ? 1 : -1), y: 6, lF2: 1.4, lB2: 1.4, lF1: 0.8, lB1: -0.8, aF1: 0.8, aB1: 0.8, aF2: 1.4, aB2: 1.4 }), mood, prop, moveAnim: anim };
      }
      return { pose: P({ y: 8, sy: 0.86, lean: 0.3, aF1: 0.6, aB1: 0.6, aF2: 1.8, aB2: 1.8, lF1: 0.6, lF2: 1.3, lB1: -0.5, lB2: 1.2 }), mood: 'focus', prop, moveAnim: anim };
    }
    case St.HOLD:
      return { pose: P({ aF1: 1.5, aF2: 0.5, aB1: 1.4, aB2: 0.5, lean: 0.2, lF2: 0.4, lB2: 0.4 }), mood: 'angry', prop, moveAnim: anim };
    case St.HELD:
      return { pose: P({ y: 6, rot: Math.sin(tm * 16) * 0.12, aF1: 2.6, aF2: 0.3, aB1: 2.5, aB2: 0.3, lF1: 0.1, lB1: -0.1, lF2: 0.2, lB2: 0.2, lean: -0.1, head: 0.2 }), mood: 'hurt', prop, moveAnim: anim };
    case St.LEDGE:
      return { pose: P({ y: 0, aF1: 3.05, aF2: 0.0, aB1: 2.9, aB2: 0.0, lF1: 0.2, lB1: -0.2, lF2: 0.5, lB2: 0.4, lean: 0.0, head: 0.1 }), mood: 'worry', prop, moveAnim: anim };
    case St.PLAT:
      return { pose: P({ y: 4, sy: 0.96, lF1: 0.9, lF2: 1.5, lB1: 0.7, lB2: 1.5, aF1: 0.5, aB1: 0.4, lean: 0.1, tail: Math.sin(tm * 3) * 0.3 }), mood: 'normal', prop, moveAnim: anim };
    case St.ATTACK: {
      const mv = ch.moves[f.move];
      if (!mv) return { pose: base, mood, prop, moveAnim: anim };
      const def = ANIMS[mv.anim] ?? ANIMS.fsmash;
      const tm2 = timingOf(mv);
      const t = f.st;
      let pose: Pose;
      const snapEnd = tm2.a0 + Math.min(2, (tm2.a1 - tm2.a0) * 0.3);
      if (t < tm2.a0) pose = mixPose(base, def.wind, easeOut(clamp(t / Math.max(1, tm2.a0 * 0.8), 0, 1)));
      else if (t < snapEnd) pose = mixPose(def.wind, def.strike, easeOut((t - tm2.a0) / Math.max(1, snapEnd - tm2.a0)));
      else if (t < tm2.a1) pose = def.strike;
      else pose = mixPose(def.strike, base, ease(clamp((t - tm2.a1) / Math.max(1, (tm2.dur - tm2.a1) * 0.9), 0, 1)));
      if (def.spin || mv.spin) {
        const turns = mv.spin ?? def.spin ?? 1;
        const k = clamp((t - Math.max(0, tm2.a0 - 4)) / Math.max(1, tm2.a1 - tm2.a0 + 6), 0, 1);
        pose = { ...pose, rot: pose.rot + k * Math.PI * 2 * turns };
      }
      if (mv.tele && t > mv.tele.t && t < mv.tele.t + 5) pose = { ...pose, sx: 0.5, sy: 1.3 };
      const scream = mv.anim === 'scream' || mv.anim === 'bellow';
      mood = scream ? 'scream' : mv.anim === 'counter' || mv.anim === 'block' ? 'focus' : 'angry';
      return { pose, mood, prop: def.prop ?? '', moveAnim: mv.anim };
    }
  }
  return { pose: base, mood, prop, moveAnim: anim };
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

function limb(c: CanvasRenderingContext2D, x: number, y: number, a1: number, a2: number, l1: number, l2: number, w: number, col: string, back: boolean, col2?: string): { ex: number; ey: number; ang: number; mx: number; my: number } {
  const x1 = x + Math.sin(a1) * l1;
  const y1 = y + Math.cos(a1) * l1;
  const A2 = back ? a1 - a2 : a1 + a2;
  const x2 = x1 + Math.sin(A2) * l2;
  const y2 = y1 + Math.cos(A2) * l2;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = col;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x1, y1);
  if (!col2) c.lineTo(x2, y2);
  c.stroke();
  if (col2) {
    c.strokeStyle = col2;
    c.lineWidth = w * 0.92;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  return { ex: x2, ey: y2, ang: A2, mx: x1, my: y1 };
}

function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

const OUT = '#1a1209';

interface Look {
  torsoW: number; armW: number; legW: number; headR: number; ear: number; snout: number; tail: number; arm: number; leg: number;
}
const LOOKS: Look[] = [
  { torsoW: 23, armW: 6.5, legW: 8, headR: 15, ear: 7, snout: 1, tail: 1, arm: 17, leg: 17 },
  { torsoW: 36, armW: 12.5, legW: 13, headR: 14.5, ear: 5, snout: 1.15, tail: 0.0, arm: 17, leg: 16 },
  { torsoW: 19, armW: 5.2, legW: 6, headR: 17, ear: 9, snout: 0.9, tail: 1.3, arm: 16, leg: 16 },
  { torsoW: 28, armW: 8.5, legW: 8.5, headR: 15.5, ear: 6, snout: 1, tail: 0.5, arm: 18, leg: 15 },
  { torsoW: 21, armW: 5.8, legW: 7, headR: 15, ear: 6.5, snout: 0.8, tail: 1.1, arm: 17, leg: 17 },
  { torsoW: 31, armW: 9.5, legW: 10.5, headR: 15.5, ear: 6, snout: 1.2, tail: 0.4, arm: 17.5, leg: 16.5 },
];

export function drawFighter(c: CanvasRenderingContext2D, f: Fighter, ch: CharDef, fx: FighterFx, o: PoseOpts): void {
  const { pose, mood, prop, moveAnim } = resolvePose(f, ch, o);
  const L = LOOKS[ch.id];
  const pal = ch.pal;
  c.save();
  c.translate(f.x, f.y);
  c.scale(ch.scale * fx.sx * pose.sx, ch.scale * fx.sy * pose.sy);
  c.scale(f.face >= 0 ? 1 : -1, 1);
  c.translate(pose.x, pose.y);
  c.translate(0, -38);
  c.rotate(pose.rot);
  c.translate(0, 38);

  const hipX = 0;
  const hipY = -L.leg * 2 + 1;
  const shX = hipX + Math.sin(pose.lean) * 25;
  const shY = hipY - Math.cos(pose.lean) * 25;
  const hdX = shX + Math.sin(pose.lean + pose.head) * 17 + 2;
  const hdY = shY - Math.cos(pose.lean + pose.head) * 17 - 2;
  const id = ch.id;
  const legCol = id === 0 ? pal.main : id === 1 ? pal.alt : id === 2 ? pal.alt : id === 3 ? pal.furDark : id === 4 ? pal.main : '#3b5b9a';
  const shortLegs = id === 1 || id === 2;
  const footCol = id === 4 ? '#22c55e' : id === 5 ? '#5b3a1e' : id === 2 ? '#f8fafc' : pal.furDark;

  // cauda
  if (L.tail > 0) {
    c.strokeStyle = pal.furDark;
    c.lineWidth = 5 * (id === 2 ? 0.8 : 1);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(hipX - 4, hipY + 2);
    const tl = 26 * L.tail;
    c.bezierCurveTo(-18 - tl * 0.4, hipY + 6 + pose.tail * 10, -26 - tl * 0.5, hipY - 14 - tl * 0.3 + pose.tail * 14, -22 - tl * 0.4 + pose.tail * 6, hipY - 28 - tl * 0.6);
    c.stroke();
  }

  // perna de trás
  const footDraw = (x: number, y: number, ang: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(-ang + Math.PI / 2 * 0);
    ell(c, 4, 1, id === 1 ? 9 : 7.5, id === 4 ? 3.2 : 4, footCol);
    if (id === 4) {
      c.strokeStyle = '#facc15';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(1, -2.5);
      c.lineTo(5, 2);
      c.stroke();
    }
    c.restore();
  };
  const lb = limb(c, hipX - 3, hipY, pose.lB1, pose.lB2, L.leg, L.leg, L.legW, shortLegs ? pal.fur : legCol, true, shortLegs ? undefined : legCol);
  if (shortLegs) {
    limb(c, hipX - 3, hipY, pose.lB1, pose.lB2, L.leg * 0.55, 0.001, L.legW + 2, legCol, true);
  }
  footDraw(lb.ex, lb.ey, 0);

  // braço de trás
  const abCol = id === 0 || id === 1 ? pal.fur : id === 2 ? pal.main : id === 4 ? pal.main : id === 5 ? pal.main : pal.fur;
  const ab = limb(c, shX - 3, shY + 4, pose.aB1, pose.aB2, L.arm, L.arm, L.armW, abCol, false, id === 2 || id === 4 || id === 5 ? abCol : pal.fur);
  ell(c, ab.ex, ab.ey, L.armW * 0.62, L.armW * 0.62, pal.fur);
  if (id === 2) drawLaptop(c, ab.ex, ab.ey, ab.ang, moveAnim);

  // torso
  c.save();
  c.translate(hipX, hipY);
  c.rotate(pose.lean);
  const tw = L.torsoW;
  const th = 30;
  c.fillStyle = id === 1 ? pal.main : id === 4 ? pal.main : id === 2 ? pal.main : id === 3 ? pal.main : id === 5 ? pal.main : pal.fur;
  if (id === 0) c.fillStyle = pal.fur;
  rr(c, -tw / 2, -th, tw, th + 3, tw * 0.42);
  c.fill();
  // barriga/detalhes
  if (id === 0) {
    ell(c, 2, -14, tw * 0.3, 10, pal.belly);
    c.fillStyle = pal.main;
    rr(c, -tw / 2 - 1, -6, tw + 2, 11, 4);
    c.fill();
    c.fillStyle = pal.alt;
    c.fillRect(-tw / 2 - 1, -4, tw + 2, 3.2);
    c.fillRect(2, -3, 4, 10);
  } else if (id === 1) {
    ell(c, 0, -14, tw * 0.42, 12, '#27272a');
    c.fillStyle = pal.main;
    rr(c, -tw / 2 + 1, -th + 2, tw - 2, th - 8, 8);
    c.fill();
    c.fillStyle = pal.alt;
    c.font = 'bold 9px system-ui';
    c.textAlign = 'center';
    c.fillText('🍌', 0, -10);
    c.fillStyle = '#facc15';
    c.fillRect(-tw / 2, -th + 1, 7, 6);
    c.fillRect(tw / 2 - 7, -th + 1, 7, 6);
    c.fillStyle = '#111827';
    rr(c, -tw / 2, -6, tw, 10, 4);
    c.fill();
  } else if (id === 2) {
    c.fillStyle = pal.main;
    rr(c, -tw / 2, -th, tw, th + 3, 8);
    c.fill();
    c.fillStyle = '#4c1d95';
    rr(c, -5, -9, 10, 6, 3);
    c.fill();
    c.strokeStyle = '#e9d5ff';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-3, -th + 3);
    c.lineTo(-3, -th + 11);
    c.moveTo(3, -th + 3);
    c.lineTo(3, -th + 11);
    c.stroke();
    c.fillStyle = pal.alt;
    c.fillRect(-tw / 2, -5, tw, 6);
  } else if (id === 3) {
    // vestido roxo + avental
    c.fillStyle = pal.main;
    c.beginPath();
    c.moveTo(-tw / 2, -th);
    c.lineTo(tw / 2, -th);
    c.lineTo(tw / 2 + 6, 5);
    c.lineTo(-tw / 2 - 6, 5);
    c.closePath();
    c.fill();
    c.fillStyle = pal.alt;
    rr(c, -8, -18, 16, 20, 4);
    c.fill();
    c.fillStyle = '#f472b6';
    for (const [dx, dy] of [[-12, -22], [10, -10], [-14, -6], [13, 0], [0, -26]]) {
      c.beginPath();
      c.arc(dx, dy, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#fde68a';
    c.beginPath();
    c.moveTo(-tw / 2, -th);
    c.lineTo(tw / 2, -th);
    c.lineTo(tw / 2 - 4, -th + 8);
    c.lineTo(-tw / 2 + 4, -th + 8);
    c.fill();
  } else if (id === 4) {
    c.fillStyle = pal.alt;
    c.fillRect(-tw / 2, -9, tw, 5);
    c.beginPath();
    c.moveTo(tw / 2 - 2, -8);
    c.lineTo(tw / 2 + 8, 2);
    c.lineTo(tw / 2 + 2, 3);
    c.closePath();
    c.fill();
    c.strokeStyle = '#374151';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-tw / 2 + 3, -th + 3);
    c.lineTo(tw / 2 - 3, -th + 14);
    c.stroke();
  } else if (id === 5) {
    // camisa jeans + colete franjado
    c.fillStyle = pal.main;
    rr(c, -tw / 2, -th, tw, th + 3, 9);
    c.fill();
    c.fillStyle = pal.alt;
    c.beginPath();
    c.moveTo(-tw / 2, -th + 2);
    c.lineTo(-4, -th + 2);
    c.lineTo(-2, -4);
    c.lineTo(-tw / 2, -4);
    c.fill();
    c.beginPath();
    c.moveTo(tw / 2, -th + 2);
    c.lineTo(4, -th + 2);
    c.lineTo(2, -4);
    c.lineTo(tw / 2, -4);
    c.fill();
    c.strokeStyle = '#a16207';
    c.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-tw / 2 + 1, -6 - i * 5);
      c.lineTo(-tw / 2 - 3, -3 - i * 5);
      c.moveTo(tw / 2 - 1, -6 - i * 5);
      c.lineTo(tw / 2 + 3, -3 - i * 5);
      c.stroke();
    }
    c.fillStyle = '#1e3a8a';
    c.fillRect(-tw / 2, -3, tw, 6);
    c.fillStyle = '#fde047';
    rr(c, -4, -4, 8, 6, 2);
    c.fill();
  }
  c.restore();

  // perna da frente
  const lf = limb(c, hipX + 3, hipY, pose.lF1, pose.lF2, L.leg, L.leg, L.legW, shortLegs ? pal.fur : legCol, true, shortLegs ? undefined : legCol);
  if (shortLegs) limb(c, hipX + 3, hipY, pose.lF1, pose.lF2, L.leg * 0.55, 0.001, L.legW + 2, legCol, true);
  footDraw(lf.ex, lf.ey, 0);

  // cabeça
  drawHead(c, ch, L, hdX, hdY, pose, mood, o.time, fx);

  // braço da frente (por último)
  const afCol = id === 2 || id === 4 || id === 5 ? pal.main : pal.fur;
  const af = limb(c, shX + 3, shY + 4, pose.aF1, pose.aF2, L.arm, L.arm, L.armW, afCol, false, id === 2 || id === 4 || id === 5 ? afCol : pal.fur);
  ell(c, af.ex, af.ey, L.armW * 0.66, L.armW * 0.66, id === 1 ? pal.fur : pal.fur);
  drawProps(c, f, ch, af.ex, af.ey, af.ang, prop, moveAnim, o.time);

  c.restore();
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawLaptop(c: CanvasRenderingContext2D, x: number, y: number, ang: number, anim: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(-ang + Math.PI);
  c.fillStyle = '#334155';
  rr(c, -2, -9, 4, 18, 1.5);
  c.fill();
  c.fillStyle = anim === 'shoot' || anim === 'tele' ? '#4ade80' : '#22c55e';
  c.fillRect(-1.2, -7.5, 2.4, 15);
  c.restore();
}

function drawProps(c: CanvasRenderingContext2D, f: Fighter, ch: CharDef, hx: number, hy: number, ang: number, prop: string, anim: string, tm: number): void {
  const id = ch.id;
  c.save();
  c.translate(hx, hy);
  // direção do antebraço
  const dx = Math.sin(ang);
  const dy = Math.cos(ang);
  const theta = Math.atan2(dy, dx);
  c.rotate(theta);
  // item segurado
  if (f.itemKind === ItemKind.HAMMER) {
    c.fillStyle = '#7c4a1d';
    c.fillRect(-2, -3, 38, 6);
    c.fillStyle = '#4b2e12';
    c.beginPath();
    c.arc(44, 0, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6b3f1a';
    c.beginPath();
    c.arc(44, 0, 16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e7d3b0';
    c.beginPath();
    c.arc(50, -5, 6, 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }
  if (f.itemKind === ItemKind.BOMB) {
    c.rotate(-theta);
    c.translate(4, -10);
    c.fillStyle = '#facc15';
    c.beginPath();
    c.ellipse(0, 0, 11, 14, 0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#92400e';
    c.fillRect(-2, -17, 4, 5);
    const flick = Math.sin(tm * 30) > 0;
    c.fillStyle = flick ? '#fb923c' : '#fde047';
    c.beginPath();
    c.arc(0, -20, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
    return;
  }
  switch (id) {
    case 0: // berimbau
      if (prop === 'cast') {
        c.strokeStyle = '#7c4a1d';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(14, 0, 24, -1.3, 1.3);
        c.stroke();
        c.strokeStyle = '#e5e7eb';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(14 + 24 * Math.cos(-1.3), 24 * Math.sin(-1.3));
        c.lineTo(14 + 24 * Math.cos(1.3), 24 * Math.sin(1.3));
        c.stroke();
        c.fillStyle = '#f59e0b';
        c.beginPath();
        c.arc(2, 8, 6, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 1: // anilha / halter
      if (prop === 'big' || anim === 'toss') {
        c.fillStyle = '#9ca3af';
        c.fillRect(0, -2, 30, 4);
        c.fillStyle = '#111827';
        c.fillRect(-2, -11, 8, 22);
        c.fillRect(26, -11, 8, 22);
      } else if (anim === 'idle' || !prop) {
        // shaker no cinto (só estético quando parado)
      }
      break;
    case 3: // bengala sempre
      c.strokeStyle = '#78350f';
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-8, 0);
      c.lineTo(prop === 'big' || anim === 'fsmash' || anim === 'smashDown' ? 78 : 46, 0);
      c.stroke();
      c.strokeStyle = '#fbbf24';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(-8, -6, 6, Math.PI * 0.4, Math.PI * 1.6);
      c.stroke();
      if (anim === 'umbrella') {
        c.rotate(-theta);
        c.fillStyle = '#ec4899';
        c.beginPath();
        c.moveTo(-34, -8);
        c.quadraticCurveTo(0, -48, 34, -8);
        c.quadraticCurveTo(17, -14, 0, -8);
        c.quadraticCurveTo(-17, -14, -34, -8);
        c.fill();
      }
      break;
    case 4: // chinelo na mão ao arremessar
      if (anim === 'toss' || prop === 'cast') {
        c.fillStyle = '#22c55e';
        c.beginPath();
        c.ellipse(8, 0, 11, 5, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#facc15';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(4, -3);
        c.lineTo(10, 3);
        c.stroke();
      }
      break;
    case 5: // viola
      c.fillStyle = '#92400e';
      c.beginPath();
      c.ellipse(prop === 'big' || anim === 'swing' ? 26 : 12, 0, prop === 'big' || anim === 'swing' ? 17 : 13, 11, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#451a03';
      c.beginPath();
      c.arc(prop === 'big' || anim === 'swing' ? 26 : 12, 0, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#78350f';
      c.fillRect(prop === 'big' || anim === 'swing' ? 38 : 22, -2.2, 34, 4.4);
      c.fillStyle = '#fde68a';
      c.fillRect(prop === 'big' || anim === 'swing' ? 70 : 54, -4, 8, 8);
      break;
  }
  c.restore();
}

function drawHead(c: CanvasRenderingContext2D, ch: CharDef, L: Look, x: number, y: number, pose: Pose, mood: Mood, tm: number, fx: FighterFx): void {
  const id = ch.id;
  const pal = ch.pal;
  const r = L.headR;
  c.save();
  c.translate(x, y);
  c.rotate(pose.lean * 0.6 + pose.head);

  // capuz do hoodie (atrás)
  if (id === 2) {
    c.fillStyle = pal.main;
    c.beginPath();
    c.arc(-6, 6, r * 0.95, 0, Math.PI * 2);
    c.fill();
  }
  // orelhas
  ell(c, -r * 0.55, -r * 0.2, L.ear, L.ear, pal.fur);
  ell(c, -r * 0.55, -r * 0.2, L.ear * 0.6, L.ear * 0.6, pal.face);
  ell(c, r * 0.9, -r * 0.1, L.ear, L.ear, pal.fur);
  ell(c, r * 0.9, -r * 0.1, L.ear * 0.6, L.ear * 0.6, pal.face);
  // cabeça
  ell(c, 0, 0, r, r * 0.95, pal.fur);
  if (id === 1) {
    // crista de gorila
    ell(c, 2, -r * 0.8, r * 0.7, r * 0.5, pal.furDark);
  }
  // focinho / rosto
  ell(c, 4, 3, r * 0.82, r * 0.7, pal.face);
  ell(c, r * 0.45, r * 0.32, r * 0.5 * L.snout, r * 0.38 * L.snout, pal.face);
  // nariz
  c.fillStyle = OUT;
  ell(c, r * 0.78, r * 0.12, 1.4, 1.1, OUT);
  ell(c, r * 0.6, r * 0.14, 1.4, 1.1, OUT);

  const ex = r * 0.38;
  const ey = -r * 0.12;
  const hid = id === 4 || (id === 5 && mood !== 'hurt' && mood !== 'ko');
  if (!hid) {
    if (mood === 'hurt') {
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      for (const k of [-1, 1]) {
        const cx = ex + k * 6 + 3;
        c.beginPath();
        c.moveTo(cx - 3, ey - 3);
        c.lineTo(cx + 3, ey + 3);
        c.moveTo(cx + 3, ey - 3);
        c.lineTo(cx - 3, ey + 3);
        c.stroke();
      }
    } else if (mood === 'ko') {
      c.strokeStyle = OUT;
      c.lineWidth = 1.6;
      for (const k of [-1, 1]) {
        c.beginPath();
        c.arc(ex + k * 6 + 3, ey, 3.6, 0, Math.PI * 4 * (0.75 + 0.1 * Math.sin(tm * 10)));
        c.stroke();
      }
    } else if (mood === 'happy') {
      c.strokeStyle = OUT;
      c.lineWidth = 2.2;
      for (const k of [-1, 1]) {
        c.beginPath();
        c.arc(ex + k * 6 + 3, ey + 2, 3.6, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
    } else {
      const blink = fx.blink > 0;
      for (const k of [-1, 1]) {
        const cx = ex + k * 6 + 3;
        if (blink) {
          c.strokeStyle = OUT;
          c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(cx - 3, ey);
          c.lineTo(cx + 3, ey);
          c.stroke();
        } else {
          ell(c, cx, ey, 4.4, mood === 'angry' || mood === 'focus' ? 3.6 : 5, '#ffffff');
          const cross = id === 2 ? (k === -1 ? 1.4 : -1.4) : 0;
          ell(c, cx + 1.4 + cross, ey + 0.5, 2.1, 2.3, OUT);
        }
      }
    }
    // sobrancelhas
    if (mood === 'angry' || mood === 'focus' || id === 1) {
      c.strokeStyle = OUT;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(ex - 9, ey - 8);
      c.lineTo(ex - 1, ey - 3);
      c.moveTo(ex + 15, ey - 8);
      c.lineTo(ex + 6, ey - 3);
      c.stroke();
    } else if (mood === 'hurt' || mood === 'worry') {
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ex - 8, ey - 3);
      c.lineTo(ex - 1, ey - 8);
      c.moveTo(ex + 14, ey - 3);
      c.lineTo(ex + 6, ey - 8);
      c.stroke();
    }
  }
  // boca
  const mx = r * 0.5;
  const my = r * 0.52;
  c.strokeStyle = OUT;
  c.fillStyle = OUT;
  c.lineWidth = 1.8;
  if (mood === 'scream' || mood === 'hurt' || mood === 'ko') {
    ell(c, mx, my, 5.4, mood === 'scream' ? 7 : 5, '#450a0a');
    ell(c, mx, my + 2, 3.5, 2.4, '#fb7185');
  } else if (mood === 'angry') {
    c.beginPath();
    c.moveTo(mx - 6, my + 2);
    c.lineTo(mx + 6, my);
    c.stroke();
    c.fillStyle = '#fff';
    c.fillRect(mx - 3, my, 2, 3);
    c.fillRect(mx + 1, my - 0.5, 2, 3);
  } else if (mood === 'happy') {
    c.beginPath();
    c.arc(mx, my - 2, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    c.stroke();
  } else if (mood === 'worry') {
    c.beginPath();
    c.arc(mx, my + 3, 4, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
  } else {
    c.beginPath();
    c.arc(mx, my - 1.5, 4.4, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }

  // acessórios
  if (id === 0) {
    c.fillStyle = pal.alt;
    c.fillRect(-r * 0.95, -r * 0.55, r * 1.9, 4);
    c.fillStyle = '#16a34a';
    c.fillRect(-r * 0.95, -r * 0.55 + 4, r * 1.9, 2);
    c.fillStyle = pal.alt;
    c.beginPath();
    c.moveTo(-r * 0.9, -r * 0.5);
    c.lineTo(-r * 1.5, -r * 0.2 + Math.sin(tm * 8) * 3);
    c.lineTo(-r * 1.2, -r * 0.7);
    c.fill();
  } else if (id === 1) {
    c.fillStyle = '#dc2626';
    c.fillRect(-r * 0.92, -r * 0.62, r * 1.84, 5);
    c.fillStyle = '#fff';
    c.fillRect(-r * 0.3, -r * 0.62, r * 0.5, 5);
    // gotas de suor
    c.fillStyle = '#7dd3fc';
    ell(c, -r * 0.9, -r * 0.1 + Math.sin(tm * 4) * 2, 2, 3, '#7dd3fc');
  } else if (id === 2) {
    // óculos neon
    c.strokeStyle = '#22c55e';
    c.lineWidth = 2;
    c.fillStyle = 'rgba(34,197,94,0.28)';
    for (const k of [-1, 1]) {
      const cx = ex + k * 6.5 + 3;
      c.beginPath();
      c.arc(cx, ey, 6.2, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.beginPath();
    c.moveTo(ex - 0.4 + 3, ey);
    c.lineTo(ex + 0.4 + 3, ey);
    c.stroke();
    // capuz frente
    c.fillStyle = pal.main;
    c.beginPath();
    c.arc(0, -2, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    c.lineTo(r * 0.5, -r * 0.4);
    c.quadraticCurveTo(0, -r * 0.5, -r * 0.7, -r * 0.35);
    c.fill();
  } else if (id === 3) {
    // coque + bobs + óculos
    ell(c, -r * 0.2, -r * 1.05, r * 0.5, r * 0.45, '#e5e7eb');
    ell(c, -r * 0.2, -r * 0.8, r * 0.95, r * 0.35, '#e5e7eb');
    c.fillStyle = '#f472b6';
    for (const k of [-0.6, 0, 0.6]) {
      c.beginPath();
      c.arc(k * r * 0.7, -r * 0.62, 2.4, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#7c2d12';
    c.lineWidth = 1.6;
    for (const k of [-1, 1]) {
      c.beginPath();
      c.arc(ex + k * 6.5 + 3, ey, 6, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(ex + 0.2, ey);
    c.lineTo(ex + 6.2, ey);
    c.stroke();
  } else if (id === 4) {
    // máscara ninja
    c.fillStyle = '#111827';
    c.beginPath();
    c.arc(0, 0, r * 1.02, 0, Math.PI * 2);
    c.fill();
    ell(c, ex + 3, ey, 10, 4.6, pal.face);
    const blink = fx.blink > 0;
    if (mood === 'hurt' || mood === 'ko') {
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      for (const k of [-1, 1]) {
        c.beginPath();
        c.moveTo(ex + k * 5 + 0, ey - 2);
        c.lineTo(ex + k * 5 + 6, ey + 3);
        c.moveTo(ex + k * 5 + 6, ey - 2);
        c.lineTo(ex + k * 5 + 0, ey + 3);
        c.stroke();
      }
    } else {
      for (const k of [-1, 1]) {
        if (blink || mood === 'happy') {
          c.strokeStyle = OUT;
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(ex + k * 5 - 1, ey);
          c.lineTo(ex + k * 5 + 5, ey);
          c.stroke();
        } else {
          ell(c, ex + k * 5 + 3, ey, 2.6, 3, '#fff');
          ell(c, ex + k * 5 + 4, ey + 0.4, 1.4, 1.7, OUT);
        }
      }
      c.strokeStyle = OUT;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(ex - 6, ey - 5);
      c.lineTo(ex + 1, ey - 2.5);
      c.moveTo(ex + 13, ey - 5);
      c.lineTo(ex + 6, ey - 2.5);
      c.stroke();
    }
    c.fillStyle = pal.alt;
    c.fillRect(-r * 1.02, -r * 0.62, r * 2.04, 5);
    c.beginPath();
    c.moveTo(-r * 0.95, -r * 0.55);
    c.lineTo(-r * 1.9, -r * 0.2 + Math.sin(tm * 9) * 4);
    c.lineTo(-r * 1.5, -r * 0.7 + Math.sin(tm * 9 + 1) * 3);
    c.lineTo(-r * 2.1, -r * 0.7 + Math.sin(tm * 9 + 2) * 4);
    c.lineTo(-r * 0.9, -r * 0.45);
    c.fill();
  } else if (id === 5) {
    // óculos escuros + barba de bode + chapéu de cowboy
    const hurt = mood === 'hurt' || mood === 'ko';
    if (!hurt) {
      c.fillStyle = '#0f172a';
      for (const k of [-1, 1]) {
        const cx = ex + k * 6.5 + 3;
        rr(c, cx - 6, ey - 4.5, 12, 9, 3);
        c.fill();
      }
      c.fillRect(ex + 3 - 1, ey - 3, 2, 2.4);
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.fillRect(ex - 2, ey - 3, 3, 1.4);
    }
    c.fillStyle = pal.furDark;
    c.beginPath();
    c.moveTo(r * 0.35, r * 0.75);
    c.lineTo(r * 0.75, r * 0.75);
    c.lineTo(r * 0.55, r * 1.35);
    c.fill();
    // chapéu
    c.fillStyle = '#c08a4a';
    c.beginPath();
    c.ellipse(1, -r * 0.65, r * 1.55, r * 0.3, -0.05, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d6a460';
    rr(c, -r * 0.62, -r * 1.5, r * 1.3, r * 0.95, 6);
    c.fill();
    c.fillStyle = '#5b3a1e';
    c.fillRect(-r * 0.62, -r * 0.78, r * 1.3, 4);
    c.fillStyle = '#fde047';
    c.fillRect(0, -r * 0.8, 4, 5);
  }
  c.restore();
}

export function charById(i: number): CharDef {
  return CHARS[i];
}

export { easeOut, ease };
