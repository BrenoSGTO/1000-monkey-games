import { buildWorld, type Match } from './match';
import { makeMonkey, updatePlats } from './physics';
import { ROUNDS } from './rounds';
import { PHASES, ROUND_KINDS, type Ev } from './types';
import { r1 } from './util';

export interface Snap {
  n: number;
  p: number;
  pt: number;
  rn: number;
  k: number;
  v: number;
  sd: number;
  wn: number;
  t: number;
  tg: number;
  fin: number;
  ch: number;
  ov: number;
  m: number[][];
  ro?: (string | number)[][];
  w: unknown;
  ev: Ev[];
  res: number[][];
}

export interface InputMsg {
  mx: number;
  j: number;
  d: number;
  g: number;
}

export function buildSnap(match: Match, seq: number, withRoster: boolean, events: Ev[]): Snap {
  const w = match.world;
  const m: number[][] = [];
  for (const o of match.monkeys) {
    const bits =
      (o.grounded ? 1 : 0) |
      (o.done ? 2 : 0) |
      (o.gone ? 4 : 0) |
      (o.tail ? 8 : 0) |
      (o.crown ? 16 : 0) |
      (o.flopK ? 32 : 0) |
      (o.face < 0 ? 64 : 0);
    const st = o.status === 'alive' ? 0 : o.status === 'qual' ? 1 : 2;
    m.push([
      o.id,
      r1(o.x),
      r1(o.y),
      Math.round(o.vx),
      Math.round(o.vy),
      bits,
      Math.round(o.flopT * 100) / 100,
      Math.round(o.diveT * 100) / 100,
      Math.round(o.grabT * 100) / 100,
      st,
      o.team,
      Math.round(o.score * 10) / 10,
      o.heldBy,
      Math.round(o.invT * 10) / 10,
      o.respawnT > 0 ? 1 : 0,
      o.place,
      o.outRound,
    ]);
  }
  const snap: Snap = {
    n: seq,
    p: PHASES.indexOf(match.phase),
    pt: Math.round(match.phaseT * 100) / 100,
    rn: match.roundNo,
    k: ROUND_KINDS.indexOf(match.kind),
    v: match.variant,
    sd: w.seed,
    wn: w.n,
    t: Math.round(w.t * 100) / 100,
    tg: match.target,
    fin: match.isFinal ? 1 : 0,
    ch: match.champion,
    ov: match.over ? 1 : 0,
    m,
    w: ROUNDS[match.kind].ser(w),
    ev: events,
    res: match.results.map((r) => [r.id, r.q ? 1 : 0]),
  };
  if (withRoster) {
    snap.ro = match.monkeys.map((o) => [o.id, o.name, o.owner, o.skin.fur, o.skin.suit, o.skin.hat, o.skin.acc, o.isBot ? 1 : 0]);
  }
  return snap;
}

/** applies a snapshot on a client Match, returns true if it was usable */
export function applySnap(match: Match, s: Snap): boolean {
  if (s.ro) {
    const need = s.ro.length;
    if (match.monkeys.length !== need) {
      match.monkeys.length = 0;
      for (const r of s.ro) {
        const mk = makeMonkey(
          r[0] as number,
          r[1] as string,
          { fur: r[3] as number, suit: r[4] as number, hat: r[5] as number, acc: r[6] as number },
          r[2] as string,
          !!r[7],
          0.6,
        );
        match.monkeys.push(mk);
      }
    } else {
      for (const r of s.ro) {
        const mk = match.monkeys[r[0] as number];
        if (!mk) continue;
        mk.name = r[1] as string;
        mk.owner = r[2] as string;
        mk.isBot = !!r[7];
      }
    }
  }
  if (match.monkeys.length === 0) return false;

  const kind = ROUND_KINDS[s.k] ?? 'race';
  const w = match.world;
  if (s.rn !== match.roundNo || w.seed !== s.sd || w.kind !== kind || w.n !== s.wn) {
    match.roundNo = s.rn;
    match.kind = kind;
    match.variant = s.v;
    match.world = buildWorld(kind, s.v, s.sd, s.wn);
    match.info = ROUNDS[kind].info(s.v);
  }
  const world = match.world;
  const newPhase = PHASES[s.p] ?? 'intro';
  match.phase = newPhase;
  match.phaseT = s.pt;
  match.target = s.tg;
  match.isFinal = !!s.fin;
  match.champion = s.ch;
  match.over = !!s.ov;
  match.results = s.res.map((r) => ({ id: r[0], q: !!r[1] }));
  if (Math.abs(world.t - s.t) > 0.5 || newPhase !== 'play') world.t = s.t;
  else world.t += (s.t - world.t) * 0.35;
  world.timeLeft = world.limit - world.t;
  ROUNDS[kind].apply(world, s.w);
  updatePlats(world, 0);

  for (const r of s.m) {
    const o = match.monkeys[r[0]];
    if (!o) continue;
    o.x = r[1];
    o.y = r[2];
    o.vx = r[3];
    o.vy = r[4];
    const bits = r[5];
    o.grounded = !!(bits & 1);
    o.done = !!(bits & 2);
    o.gone = !!(bits & 4);
    o.tail = !!(bits & 8);
    o.crown = !!(bits & 16);
    o.flopK = bits & 32 ? 1 : 0;
    o.face = bits & 64 ? -1 : 1;
    o.flopT = r[6];
    o.diveT = r[7];
    o.grabT = r[8];
    o.status = r[9] === 0 ? 'alive' : r[9] === 1 ? 'qual' : 'out';
    o.team = r[10];
    o.score = r[11];
    o.heldBy = r[12];
    o.invT = r[13];
    o.respawnT = r[14];
    o.place = r[15];
    o.outRound = r[16];
  }
  return true;
}
