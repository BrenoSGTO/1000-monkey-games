import { DRIVERS } from './drivers';
import {
  EXPR_CRY,
  EXPR_NORMAL,
  EXPR_SCREAM,
  type Input,
  type ItemType,
  SURF_ROAD,
  SURF_SHORT,
  SURF_SLOW,
  SURF_VOID,
  emptyInput,
} from './types';
import { SOLID_CELL, type Track, nearestIdx, solidKey, surfaceAt, trackPoint } from './tracks';
import { angDiff, approach, clamp } from './util';

export const KART_R = 22;

export interface KartFx {
  t: 'miniturbo' | 'fall' | 'respawn' | 'driftstart' | 'driftlevel' | 'bump';
  n?: number;
}

export interface AiState {
  lane: number;
  skill: number;
  phase: number;
  itemDelay: number;
  stuckT: number;
  driftHold: boolean;
  mistake: number;
}

export interface Kart {
  id: number;
  driver: number;
  name: string;
  /** -2 = CPU, 0/1 = local player slot (viewport), -1 = remote human */
  owner: number;
  netId: string | null;
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  spd: number;
  steer: number;
  drift: number;
  driftT: number;
  driftLvl: number;
  driftArm: number;
  prevDriftBtn: boolean;
  hopT: number;
  boostT: number;
  boostMult: number;
  guaranaT: number;
  spinT: number;
  spinAngle: number;
  spinDir: number;
  fallT: number;
  invulnT: number;
  slowT: number;
  stingT: number;
  puddleT: number;
  padCool: number;
  floodT: number;
  bumpT: number;
  item: ItemType | null;
  rouletteT: number;
  rouletteTick: number;
  lastItemCount: number;
  lapF: number;
  idx: number;
  lat: number;
  dist: number;
  lapReached: number;
  lap: number;
  finished: boolean;
  finishTime: number;
  place: number;
  lapTimes: number[];
  lapStartT: number;
  bestLap: number;
  safeLapF: number;
  expr: number;
  exprT: number;
  wrongWayT: number;
  surf: number;
  accelSince: number;
  points: number;
  top: number;
  accel: number;
  handling: number;
  weight: number;
  rubber: number;
  autopilot: boolean;
  input: Input;
  fxQ: KartFx[];
  ai: AiState | null;
  /** last place text/quote shown */
  hitBy: string;
  hitsTaken: number;
  hitsDealt: number;
}

export function makeKart(id: number, driver: number, name: string, owner: number, netId: string | null, aiSkill: number): Kart {
  const d = DRIVERS[driver];
  return {
    id,
    driver,
    name,
    owner,
    netId,
    x: 0,
    y: 0,
    h: 0,
    vx: 0,
    vy: 0,
    spd: 0,
    steer: 0,
    drift: 0,
    driftT: 0,
    driftLvl: 0,
    driftArm: 0,
    prevDriftBtn: false,
    hopT: 0,
    boostT: 0,
    boostMult: 1,
    guaranaT: 0,
    spinT: 0,
    spinAngle: 0,
    spinDir: 1,
    fallT: 0,
    invulnT: 0,
    slowT: 0,
    stingT: 0,
    puddleT: 0,
    padCool: 0,
    floodT: 0,
    bumpT: 0,
    item: null,
    rouletteT: 0,
    rouletteTick: 0,
    lastItemCount: 0,
    lapF: 0,
    idx: 0,
    lat: 0,
    dist: 0,
    lapReached: 0,
    lap: 0,
    finished: false,
    finishTime: 0,
    place: id + 1,
    lapTimes: [],
    lapStartT: 0,
    bestLap: Infinity,
    safeLapF: 0,
    expr: EXPR_NORMAL,
    exprT: 0,
    wrongWayT: 0,
    surf: SURF_ROAD,
    accelSince: -1,
    points: 0,
    top: d.top,
    accel: d.accel,
    handling: d.handling,
    weight: d.weight,
    rubber: 1,
    autopilot: false,
    input: emptyInput(),
    fxQ: [],
    ai:
      owner === -2
        ? {
            lane: (Math.random() - 0.5) * 1.3,
            skill: aiSkill * (0.9 + Math.random() * 0.12),
            phase: Math.random() * 6.28,
            itemDelay: 2 + Math.random() * 3,
            stuckT: 0,
            driftHold: false,
            mistake: 0,
          }
        : null,
    hitBy: '',
    hitsTaken: 0,
    hitsDealt: 0,
  };
}

export function placeKartOnGrid(k: Kart, slot: { x: number; y: number; h: number; idx: number }, tr: Track): void {
  k.x = slot.x;
  k.y = slot.y;
  k.h = slot.h;
  k.vx = 0;
  k.vy = 0;
  k.spd = 0;
  k.idx = slot.idx;
  k.lapF = slot.idx - tr.N; // negative: behind the line
  k.safeLapF = k.lapF;
  k.lap = 0;
  k.lapReached = 0;
}

export function setExpr(k: Kart, expr: number, dur: number): void {
  if (expr === EXPR_NORMAL) return;
  k.expr = expr;
  k.exprT = dur;
}

export const DRIFT_LEVELS = [0.85, 1.7, 2.9];
const MINI_TURBO = [0, 0.7, 1.25, 1.9];

export function releaseDrift(k: Kart): void {
  if (k.drift !== 0) {
    if (k.driftLvl > 0) {
      k.boostT = Math.max(k.boostT, MINI_TURBO[k.driftLvl]);
      k.boostMult = Math.max(k.boostMult, 1.28 + 0.05 * k.driftLvl);
      k.fxQ.push({ t: 'miniturbo', n: k.driftLvl });
      setExpr(k, EXPR_SCREAM, 0.9);
    }
  }
  k.drift = 0;
  k.driftT = 0;
  k.driftLvl = 0;
}

export function stepKart(k: Kart, inp: Input, dt: number, tr: Track, maxBase: number, canDrive: boolean): void {
  // --- timers ---
  if (k.invulnT > 0) k.invulnT -= dt;
  if (k.boostT > 0) {
    k.boostT -= dt;
    if (k.boostT <= 0) k.boostMult = 1;
  }
  if (k.guaranaT > 0) k.guaranaT -= dt;
  if (k.slowT > 0) k.slowT -= dt;
  if (k.stingT > 0) k.stingT -= dt;
  if (k.puddleT > 0) k.puddleT -= dt;
  if (k.padCool > 0) k.padCool -= dt;
  if (k.floodT > 0) k.floodT -= dt;
  if (k.bumpT > 0) k.bumpT -= dt;
  if (k.hopT > 0) k.hopT -= dt;
  if (k.driftArm > 0) k.driftArm -= dt;
  if (k.exprT > 0) {
    k.exprT -= dt;
    if (k.exprT <= 0) k.expr = EXPR_NORMAL;
  }
  k.input = inp;

  // --- falling / respawn ---
  if (k.fallT > 0) {
    k.fallT -= dt;
    k.vx *= 0.92;
    k.vy *= 0.92;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    if (k.fallT <= 0) respawnKart(k, tr);
    return;
  }

  const surf = surfaceAt(tr, k.x, k.y);
  k.surf = surf;
  if (surf === SURF_VOID) {
    releaseDrift(k);
    k.drift = 0;
    k.fallT = 1.3;
    k.spinT = 0;
    k.fxQ.push({ t: 'fall' });
    setExpr(k, EXPR_CRY, 1.6);
    return;
  }

  // --- spinning out ---
  if (k.spinT > 0) {
    k.spinT -= dt;
    k.spinAngle += k.spinDir * dt * (11 + k.spinT * 8);
    const damp = Math.exp(-1.9 * dt);
    k.vx *= damp;
    k.vy *= damp;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.drift = 0;
    k.driftT = 0;
    k.driftLvl = 0;
    if (k.spinT <= 0) {
      k.spinT = 0;
      k.spinAngle = 0;
      k.invulnT = Math.max(k.invulnT, 1.4);
    }
    collideSolids(k, tr);
    k.spd = k.vx * Math.cos(k.h) + k.vy * Math.sin(k.h);
    trackProgress(k, tr, dt);
    return;
  }

  const fx = Math.cos(k.h);
  const fy = Math.sin(k.h);
  let vf = k.vx * fx + k.vy * fy;

  // --- steering ---
  k.steer = approach(k.steer, canDrive ? inp.steer : 0, dt * 7);
  const spdN = clamp(Math.abs(vf) / 70, 0, 1);
  const topRef = maxBase * k.top;
  let turnBase = 2.15 * k.handling * (1 - 0.28 * clamp(vf / topRef, 0, 1.3)) * spdN;
  if (vf < 0) turnBase = -turnBase * 0.7;
  if (k.stingT > 0 || k.slowT > 0) turnBase *= 0.88;

  // --- drift ---
  const driftBtn = canDrive && inp.drift;
  if (driftBtn && !k.prevDriftBtn) {
    k.driftArm = 0.45;
    if (k.drift === 0 && vf > topRef * 0.4) k.hopT = 0.2;
  }
  k.prevDriftBtn = driftBtn;
  if (k.drift === 0 && driftBtn && k.driftArm > 0 && vf > topRef * 0.42 && Math.abs(inp.steer) > 0.3 && surf !== SURF_VOID) {
    k.drift = inp.steer > 0 ? 1 : -1;
    k.driftT = 0;
    k.driftLvl = 0;
    k.fxQ.push({ t: 'driftstart' });
    setExpr(k, EXPR_SCREAM, 0.5);
  }
  let rate: number;
  if (k.drift !== 0) {
    const dir = k.drift;
    if (!driftBtn || vf < topRef * 0.3) {
      releaseDrift(k);
      rate = k.steer * turnBase;
    } else {
      rate = dir * turnBase * (0.95 + 0.55 * clamp(k.steer * dir, -1, 1));
      const charge = (0.85 + 0.55 * clamp(k.steer * dir, 0, 1)) * (0.92 + 0.12 * k.handling);
      k.driftT += dt * charge;
      let lvl = 0;
      for (let i = 0; i < DRIFT_LEVELS.length; i++) if (k.driftT >= DRIFT_LEVELS[i]) lvl = i + 1;
      if (lvl > k.driftLvl) {
        k.driftLvl = lvl;
        k.fxQ.push({ t: 'driftlevel', n: lvl });
      }
    }
  } else {
    rate = k.steer * turnBase;
  }
  k.h += rate * dt;

  // recompute with new heading
  const fx2 = Math.cos(k.h);
  const fy2 = Math.sin(k.h);
  const rx = -fy2;
  const ry = fx2;
  vf = k.vx * fx2 + k.vy * fy2;
  let vl = k.vx * rx + k.vy * ry;

  // --- throttle ---
  let factor = 1;
  const boosting = k.boostT > 0;
  if (surf === SURF_SLOW && k.guaranaT <= 0 && !boosting) factor = 0.5;
  else if (surf === SURF_SHORT && k.guaranaT <= 0 && !boosting) factor = 0.52;
  if (k.puddleT > 0 && !boosting) factor = Math.min(factor, 0.55);
  if (k.slowT > 0 && k.guaranaT <= 0) factor = Math.min(factor, 0.6);
  if (k.floodT > 0) factor = Math.min(factor, 0.55);
  if (k.stingT > 0) factor = Math.min(factor, 0.72);
  let target = topRef * factor * k.rubber;
  if (boosting) target = Math.max(target, topRef * k.boostMult);
  const accelRate = 1.15 * k.accel;
  const throttle = canDrive ? inp.accel : 0;
  if (throttle > 0.05) {
    if (vf < target) {
      const dv = Math.max((target - vf) * accelRate * dt, 120 * k.accel * dt);
      vf = Math.min(target, vf + dv * throttle);
      if (boosting) vf = Math.min(target, vf + 900 * dt);
    } else {
      vf = approach(vf, target, (surf === SURF_SLOW ? 520 : boosting ? 120 : 210) * dt);
    }
  } else {
    vf *= Math.exp(-0.55 * dt);
    if (boosting) vf = Math.min(topRef * k.boostMult, vf + 700 * dt);
  }
  const brake = canDrive ? inp.brake : 0;
  if (brake > 0.05) {
    if (vf > 12) vf -= 620 * dt * brake;
    else vf = Math.max(vf - 320 * dt * brake, -topRef * 0.3);
  }
  // slope the speed down hard on rough surfaces even without throttle
  if (surf === SURF_SLOW && k.guaranaT <= 0 && !boosting && vf > target) vf = approach(vf, target, 340 * dt);

  // --- lateral grip ---
  const grip = k.drift !== 0 ? 2.6 : 10.5;
  vl *= Math.exp(-grip * dt);

  k.vx = fx2 * vf + rx * vl;
  k.vy = fy2 * vf + ry * vl;
  k.x += k.vx * dt;
  k.y += k.vy * dt;
  k.spd = vf;
  if (collideSolids(k, tr)) k.spd = k.vx * fx2 + k.vy * fy2;

  if (k.drift === 0 && Math.abs(k.steer) > 0.8 && vf > topRef * 0.6) {
    // small chance of scream face in tight turns; keep expressive
    if (k.expr === EXPR_NORMAL && Math.random() < 0.01) setExpr(k, EXPR_SCREAM, 0.35);
  }

  trackProgress(k, tr, dt);
  if (surf === SURF_ROAD || surf === SURF_SHORT) {
    if (k.dist < tr.halfW + 10) k.safeLapF = k.lapF;
  }
}

/** Pushes the kart out of solid scenery (trees, houses, rocks...). Returns true on contact. */
function collideSolids(k: Kart, tr: Track): boolean {
  const cx = Math.floor(k.x / SOLID_CELL);
  const cy = Math.floor(k.y / SOLID_CELL);
  let hit = false;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const list = tr.solids.get(solidKey(cx + ox, cy + oy));
      if (!list) continue;
      for (const s of list) {
        const dx = k.x - s.x;
        const dy = k.y - s.y;
        const rr = s.r + KART_R * 0.8;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d;
        const ny = dy / d;
        k.x = s.x + nx * rr;
        k.y = s.y + ny * rr;
        const vn = k.vx * nx + k.vy * ny;
        if (vn < 0) {
          k.vx -= vn * nx * 1.5;
          k.vy -= vn * ny * 1.5;
          k.vx *= 0.75;
          k.vy *= 0.75;
          if (-vn > 90 && k.bumpT <= 0) {
            k.bumpT = 0.35;
            k.fxQ.push({ t: 'bump' });
          }
        }
        hit = true;
      }
    }
  }
  return hit;
}

function trackProgress(k: Kart, tr: Track, dt: number): void {
  const N = tr.N;
  const nr = nearestIdx(tr, k.x, k.y, k.idx, 30, 230);
  let d = nr.idx - k.idx;
  if (d > N / 2) d -= N;
  if (d < -N / 2) d += N;
  k.lapF += d;
  k.idx = nr.idx;
  k.lat = nr.lat;
  k.dist = nr.dist;
  const dot = Math.cos(k.h) * tr.tx[k.idx] + Math.sin(k.h) * tr.ty[k.idx];
  if (dot < -0.35 && k.spd > 25 && k.surf !== SURF_VOID) k.wrongWayT += dt;
  else k.wrongWayT = Math.max(0, k.wrongWayT - dt * 2);
}

export function respawnKart(k: Kart, tr: Track): void {
  const N = tr.N;
  const lf = k.safeLapF - 5;
  const idxF = (((lf % N) + N) % N) + 0;
  const p = trackPoint(tr, idxF, 0);
  k.x = p.x;
  k.y = p.y;
  k.h = p.h;
  k.vx = 0;
  k.vy = 0;
  k.spd = 0;
  k.steer = 0;
  k.drift = 0;
  k.driftT = 0;
  k.driftLvl = 0;
  k.spinT = 0;
  k.fallT = 0;
  k.invulnT = 2.2;
  k.boostT = 0;
  k.slowT = 0;
  k.lapF = lf;
  k.idx = Math.floor(idxF) % N;
  k.fxQ.push({ t: 'respawn' });
}

export function angleToKart(from: Kart, to: Kart): number {
  return angDiff(Math.atan2(to.y - from.y, to.x - from.x), from.h);
}
