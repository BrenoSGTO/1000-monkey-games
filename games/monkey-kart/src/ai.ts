import type { Kart } from './kart';
import { hazardPos } from './tracks';
import type { Input } from './types';
import type { World } from './world';
import { angDiff, clamp } from './util';

function ensureAi(k: Kart): NonNullable<Kart['ai']> {
  if (!k.ai) {
    k.ai = {
      lane: (Math.random() - 0.5) * 0.8,
      skill: 0.95,
      phase: Math.random() * 6.28,
      itemDelay: 1.5,
      stuckT: 0,
      driftHold: false,
      mistake: 0,
    };
  }
  return k.ai;
}

export function driveAI(k: Kart, w: World): Input {
  const ai = ensureAi(k);
  const tr = w.track;
  const N = tr.N;
  const dt = 1 / 60;
  const spd = Math.max(40, k.spd);
  const inp = k.input;
  const out: Input = { steer: 0, accel: 1, brake: 0, drift: false, itemCount: inp.itemCount };

  if (w.phase !== 'racing' && !k.finished) {
    out.accel = 0;
    return out;
  }

  // --- aim point on the racing line ---
  const look = clamp(Math.round(7 + spd / 30), 8, 19);
  const iT = (k.idx + look) % N;
  let off = tr.lineOff[iT] + ai.lane * tr.halfW * 0.28;

  // avoid static hazards (bananas/clouds) and slower karts ahead
  const fx = Math.cos(k.h);
  const fy = Math.sin(k.h);
  let avoid = 0;
  for (const it of w.items) {
    if (it.type !== 'banana' && it.type !== 'nuvem') continue;
    const dx = it.x - k.x;
    const dy = it.y - k.y;
    const f = dx * fx + dy * fy;
    if (f < 30 || f > 260) continue;
    const l = -dx * fy + dy * fx; // positive = to the right
    if (Math.abs(l) < 60) avoid += l >= 0 ? -1 : 1;
  }
  for (const hz of tr.hazards) {
    const hp = hazardPos(tr, hz, w.clock);
    const dx = hp.x - k.x;
    const dy = hp.y - k.y;
    const f = dx * fx + dy * fy;
    if (f < 10 || f > 320) continue;
    const l = -dx * fy + dy * fx;
    if (Math.abs(l) < hz.r + 48) avoid += (l >= 0 ? -1.6 : 1.6) * (1.2 - f / 400);
  }
  for (const o of w.karts) {
    if (o === k || o.fallT > 0) continue;
    const dx = o.x - k.x;
    const dy = o.y - k.y;
    const f = dx * fx + dy * fy;
    if (f < 20 || f > 150) continue;
    const l = -dx * fy + dy * fx;
    if (Math.abs(l) < 54) avoid += l >= 0 ? -0.6 : 0.6;
  }
  off += clamp(avoid, -1, 1) * 62;
  off = clamp(off, -tr.halfW * 0.78, tr.halfW * 0.78);

  const tx = tr.px[iT] + tr.nx[iT] * off;
  const ty = tr.py[iT] + tr.ny[iT] * off;
  const want = Math.atan2(ty - k.y, tx - k.x);
  let steer = clamp(angDiff(want, k.h) * 2.1, -1, 1);
  steer += Math.sin(w.clock * 1.3 + ai.phase) * 0.07 * (1.15 - ai.skill);
  out.steer = clamp(steer, -1, 1);

  // --- speed control from upcoming curvature ---
  let kmax = 0;
  for (let j = 3; j <= 34; j += 3) kmax = Math.max(kmax, Math.abs(tr.curv[(k.idx + j) % N]));
  const aLat = 560 * ai.skill;
  const vmax = Math.min(9999, Math.sqrt(aLat / Math.max(kmax, 1e-4)));
  if (spd > vmax * 1.28) {
    out.accel = 0;
    out.brake = 0.7;
  } else if (spd > vmax * 1.06) {
    out.accel = 0.15;
  }

  // --- drift on sharp curves ---
  let kAhead = 0;
  for (let j = 6; j <= 22; j += 4) kAhead = Math.max(kAhead, Math.abs(tr.curv[(k.idx + j) % N]));
  const sign = tr.curv[(k.idx + 14) % N] >= 0 ? 1 : -1;
  const canDrift = ai.skill > 0.8 && spd > 200;
  if (canDrift) {
    if (k.drift !== 0) {
      const curNow = Math.abs(tr.curv[(k.idx + 4) % N]);
      ai.driftHold = curNow > 1 / 900 || k.driftLvl < 1;
      if (k.driftLvl >= 2 && curNow < 1 / 650) ai.driftHold = false;
      if (Math.abs(out.steer) < 0.05 && k.driftLvl >= 1) ai.driftHold = false;
    } else if (kAhead > 1 / 430 && Math.abs(out.steer) > 0.35 && k.spinT <= 0 && k.boostT <= 0 && Math.random() < 0.2) {
      ai.driftHold = true;
      out.steer = sign * Math.max(0.5, Math.abs(out.steer));
    } else {
      ai.driftHold = false;
    }
    out.drift = ai.driftHold;
    if (k.drift !== 0) out.steer = clamp(k.drift * (0.5 + kAhead * 250) , -1, 1) * 0.9 + clamp(angDiff(want, k.h) * 1.2, -0.4, 0.4);
  }

  // --- stuck detection ---
  if (k.spd < 22 && k.spinT <= 0 && k.fallT <= 0) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 1.2 && ai.stuckT < 2.2) {
    out.accel = 0;
    out.brake = 1;
    out.steer = -out.steer;
  } else if (ai.stuckT >= 2.2) {
    // rescue: back to the road
    k.safeLapF = Math.max(k.safeLapF, k.lapF - 6);
    k.fallT = 0.01;
    ai.stuckT = 0;
  }

  // --- item use ---
  if (k.item && k.rouletteT <= 0 && k.spinT <= 0) {
    ai.itemDelay -= dt;
    if (ai.itemDelay <= 0) {
      let use = false;
      const behind = w.karts.some((o) => {
        if (o === k || o.fallT > 0) return false;
        const gap = (k.lapF - o.lapF) * tr.step;
        return gap > 25 && gap < 340 && Math.abs(o.lat - k.lat) < 110;
      });
      const ahead = w.karts.some((o) => {
        if (o === k || o.fallT > 0 || o.finished) return false;
        const gap = (o.lapF - k.lapF) * tr.step;
        return gap > 40 && gap < 1500;
      });
      const aheadClose = w.karts.some((o) => {
        if (o === k || o.fallT > 0 || o.finished) return false;
        const gap = (o.lapF - k.lapF) * tr.step;
        return gap > 40 && gap < 820 && Math.abs(o.lat - k.lat) < 120;
      });
      switch (k.item) {
        case 'guarana':
          use = kmax < 1 / 700 || ai.itemDelay < -4;
          break;
        case 'banana':
        case 'nuvem':
          use = behind || ai.itemDelay < -9;
          break;
        case 'coco':
          use = ahead || ai.itemDelay < -9;
          break;
        case 'chinelo':
          use = aheadClose || ai.itemDelay < -10;
          break;
        case 'enxame':
          use = true;
          break;
      }
      if (use) {
        out.itemCount = inp.itemCount + 1;
        ai.itemDelay = 1 + Math.random() * 2;
      }
    }
  }

  return out;
}
