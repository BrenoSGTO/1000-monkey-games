import { hazardShape, solidAt, supportBelow } from './physics';
import { RUN, type Monkey, type Shape, type World } from './types';

const tmp: Shape = { x: 0, y: 0, x2: 0, y2: 0, r: 0, vx: 0, vy: 0 };

/** earliest time (s) at which a monkey moving with vx from (x,y) would hit a hazard, or -1 */
export function pathHit(w: World, x: number, y: number, vx: number, horizon: number): number {
  if (w.hazards.length === 0) return -1;
  for (let tau = 0; tau <= horizon; tau += 0.08) {
    const cx = x + vx * tau;
    const cy = y - 24;
    for (const hz of w.hazards) {
      if (hz.kind === 'roller') {
        // rollers are handled with jump logic
        continue;
      }
      if (Math.abs(hz.x - cx) > hz.len + 140) continue;
      hazardShape(hz, w.t + tau, tmp);
      let px = tmp.x;
      let py = tmp.y;
      if (tmp.x2 !== tmp.x || tmp.y2 !== tmp.y) {
        const ex = tmp.x2 - tmp.x;
        const ey = tmp.y2 - tmp.y;
        const tt = Math.max(0, Math.min(1, ((cx - tmp.x) * ex + (cy - tmp.y) * ey) / (ex * ex + ey * ey)));
        px = tmp.x + ex * tt;
        py = tmp.y + ey * tt;
      }
      const rr = tmp.r + 20;
      if ((cx - px) * (cx - px) + (cy - py) * (cy - py) < rr * rr) return tau;
    }
  }
  return -1;
}

/** nearest roller coming at the monkey from the right, returns distance or -1 */
export function rollerAhead(w: World, m: Monkey): number {
  let best = -1;
  for (const hz of w.hazards) {
    if (hz.kind !== 'roller') continue;
    hazardShape(hz, w.t, tmp);
    const d = tmp.x - m.x;
    if (d > 20 && d < 190 && Math.abs(tmp.y - 24 - (m.y - 24)) < 70) {
      if (best < 0 || d < best) best = d;
    }
  }
  return best;
}

export function wallAhead(w: World, m: Monkey, dir: number): boolean {
  const px = m.x + dir * (14 + 12);
  return solidAt(w, px, m.y - 10) || solidAt(w, px, m.y - 32);
}

export function pitAhead(w: World, m: Monkey, dir: number, dist: number): boolean {
  const s = supportBelow(w, m.x + dir * dist, m.y, 340);
  return s === null;
}

export function nearest(m: Monkey, all: Monkey[], pred: (o: Monkey) => boolean): Monkey | null {
  let best: Monkey | null = null;
  let bd = Infinity;
  for (const o of all) {
    if (o === m || o.gone || !pred(o)) continue;
    const d = Math.hypot(o.x - m.x, (o.y - m.y) * 1.4);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

export function rand(m: Monkey): number {
  // cheap per-bot LCG so bots do not share randomness
  m.ai.seed = (Math.imul(m.ai.seed, 1664525) + 1013904223) >>> 0;
  return m.ai.seed / 4294967296;
}

export function clearInput(m: Monkey): void {
  m.input.jump = false;
  m.input.dive = false;
  m.input.grab = false;
}

export function runTo(m: Monkey, tx: number, deadzone = 10): void {
  const d = tx - m.x;
  m.input.mx = Math.abs(d) < deadzone ? 0 : d > 0 ? 1 : -1;
}

export const RUN_SPEED = RUN;

/** how to reach a goal that is above us: walk to a reachable platform, jump when under it */
export function climbStep(w: World, m: Monkey, gx: number, gy: number): { mx: number; jump: boolean } {
  const dir = gx > m.x ? 1 : -1;
  if (gy >= m.y - 50) return { mx: Math.abs(gx - m.x) < 12 ? 0 : dir, jump: false };
  let best: { cx: number; p: World['plats'][number] } | null = null;
  let bs = Infinity;
  for (const p of w.plats) {
    if (p.kind === 'door' || (p.kind === 'tile' && !p.active)) continue;
    if (p.y > m.y - 30 || p.y < m.y - 128) continue;
    if (p.kind === 'solid' && p.h > 100) continue;
    const cx = Math.max(p.x + 20, Math.min(p.x + p.w - 20, gx));
    const sc = Math.abs(cx - m.x) + Math.abs(cx - gx) * 0.6 + Math.max(0, p.y - gy) * 0.9;
    if (sc < bs) {
      bs = sc;
      best = { cx, p };
    }
  }
  if (!best) return { mx: Math.abs(gx - m.x) < 12 ? 0 : dir, jump: false };
  const p = best.p;
  const under = m.x > p.x + 10 && m.x < p.x + p.w - 10;
  if (under) return { mx: 0, jump: m.grounded };
  return { mx: best.cx > m.x ? 1 : -1, jump: false };
}
