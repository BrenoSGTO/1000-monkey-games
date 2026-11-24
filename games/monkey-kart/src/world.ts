import { driveAI } from './ai';
import { DRIVERS } from './drivers';
import {
  KART_R,
  type Kart,
  makeKart,
  placeKartOnGrid,
  respawnKart,
  setExpr,
  stepKart,
} from './kart';
import {
  type Track,
  gridSlot,
  hazardPos,
  nearestIdx,
  surfaceAt,
  trackPoint,
} from './tracks';
import {
  CC_SETTINGS,
  EXPR_CRY,
  EXPR_HAPPY,
  EXPR_SCREAM,
  type Input,
  type ItemType,
  LAPS,
  SURF_VOID,
  emptyInput,
} from './types';
import { angDiff, clamp } from './util';

export type Phase = 'grid' | 'racing' | 'done';

export interface Item {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  h: number;
  owner: number;
  life: number;
  arm: number;
  target: number;
  bounces: number;
  idx: number;
  lapF: number;
  spin: number;
}

export interface GameEvent {
  t: string;
  k?: number;
  n?: number;
  x?: number;
  y?: number;
  s?: string;
}

export interface KartEntry {
  driver: number;
  name: string;
  owner: number;
  netId: string | null;
}

const ITEM_ORDER: ItemType[] = ['banana', 'chinelo', 'nuvem', 'guarana', 'coco', 'enxame'];
// rows: rank 1..8 -> weights in ITEM_ORDER
const ITEM_WEIGHTS: number[][] = [
  [30, 25, 30, 10, 5, 0],
  [25, 25, 20, 15, 15, 0],
  [20, 20, 15, 20, 25, 0],
  [15, 15, 10, 25, 30, 5],
  [10, 10, 10, 25, 30, 15],
  [5, 5, 5, 30, 30, 25],
  [0, 5, 0, 35, 25, 35],
  [0, 0, 0, 40, 20, 40],
];

export const BOX_RESPAWN = 6;

export class World {
  track: Track;
  ccIdx: number;
  karts: Kart[] = [];
  items: Item[] = [];
  boxT: number[];
  t = 0;
  countT = 4.4;
  phase: Phase = 'grid';
  events: GameEvent[] = [];
  nextItemId = 1;
  finishedCount = 0;
  firstFinishT = -1;
  isGuest: boolean;
  /** callback providing inputs for human-owned karts */
  getInput: (k: Kart) => Input | null = () => null;
  lastCountShown = 99;
  clock = 0;

  constructor(track: Track, ccIdx: number, isGuest = false) {
    this.track = track;
    this.ccIdx = ccIdx;
    this.isGuest = isGuest;
    this.boxT = track.boxSpots.map(() => 0);
  }

  get cc() {
    return CC_SETTINGS[this.ccIdx];
  }

  addKarts(entries: KartEntry[], order?: number[]): void {
    this.karts = entries.map((e, i) => makeKart(i, e.driver, e.name, e.owner, e.netId, this.cc.ai));
    const slots = order ?? entries.map((_, i) => i);
    this.karts.forEach((k, i) => {
      placeKartOnGrid(k, gridSlot(this.track, slots[i]), this.track);
      k.place = slots[i] + 1;
    });
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  kartById(id: number): Kart | undefined {
    return this.karts[id];
  }

  // ---------------------------------------------------------------- stepping

  step(dt: number): void {
    this.clock += dt;
    if (this.phase === 'grid') {
      this.countT -= dt;
      const shown = Math.ceil(this.countT - 1.2);
      if (shown !== this.lastCountShown && shown >= 1 && shown <= 3) {
        this.lastCountShown = shown;
        this.emit({ t: 'count', n: shown });
      }
      for (const k of this.karts) {
        const inp = this.inputFor(k);
        if (inp.accel > 0.5) {
          if (k.accelSince < 0) k.accelSince = this.countT;
        } else k.accelSince = -1;
        k.input = inp;
        k.lastItemCount = inp.itemCount;
      }
      if (this.countT <= 1.2) {
        this.phase = 'racing';
        this.t = 0;
        this.emit({ t: 'go' });
        for (const k of this.karts) {
          // rocket start window: accel pressed within 1.2s before GO
          const pressedAt = k.accelSince; // countT value when pressed (descending)
          if (k.ai) {
            if (Math.random() < 0.25 * k.ai.skill) this.startBoost(k);
          } else if (pressedAt >= 0) {
            if (pressedAt <= 2.4 + 0.0 && pressedAt >= 1.2) {
              // pressed in the last 1.2s before GO (countT started at 4.4, GO at 1.2)
              this.startBoost(k);
            } else if (pressedAt > 2.4) {
              k.floodT = 0.9;
              setExpr(k, EXPR_CRY, 1.2);
              this.emit({ t: 'flood', k: k.id });
            }
          }
          k.lapStartT = 0;
        }
      }
      return;
    }

    this.t += dt;
    const cc = this.cc;
    this.updateRubber();

    // inputs + movement
    for (const k of this.karts) {
      let inp: Input;
      if (k.autopilot || (k.owner === -2) ) inp = driveAI(k, this);
      else inp = this.getInput(k) ?? emptyInput();
      stepKart(k, inp, dt, this.track, cc.max, this.phase === 'racing' || k.finished);
      this.handleItemUse(k, inp);
      if (k.rouletteT > 0) {
        k.rouletteT -= dt;
        k.rouletteTick += dt;
        if (k.rouletteT <= 0) this.rollItem(k);
      }
    }

    this.collideKarts();
    this.updateBoxes(dt);
    this.updateTrackObjects(dt);
    this.updateItems(dt);
    this.updateProgress();
    this.drainFx();
  }

  /** Guest-side update: only advances local clocks and locally predicted karts. */
  stepGuest(dt: number): void {
    this.clock += dt;
    if (this.phase === 'racing') this.t += dt;
    for (const k of this.karts) {
      if (k.owner >= 0) {
        const inp = this.getInput(k) ?? emptyInput();
        stepKart(k, inp, dt, this.track, this.cc.max, this.phase === 'racing' && !k.finished);
        k.fxQ.length = 0;
      }
    }
    for (const it of this.items) {
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.spin += dt * 9;
    }
    for (let i = 0; i < this.boxT.length; i++) if (this.boxT[i] > 0) this.boxT[i] -= dt;
  }

  private inputFor(k: Kart): Input {
    if (k.ai) return driveAI(k, this);
    return this.getInput(k) ?? emptyInput();
  }

  private startBoost(k: Kart): void {
    k.boostT = 1.15;
    k.boostMult = 1.32;
    this.emit({ t: 'rocket', k: k.id });
  }

  private updateRubber(): void {
    const humans = this.karts.filter((k) => k.owner !== -2 && !k.finished);
    if (humans.length === 0) {
      for (const k of this.karts) k.rubber = 1;
      return;
    }
    let ref = 0;
    for (const h of humans) ref += h.lapF;
    ref /= humans.length;
    const step = this.track.step;
    for (const k of this.karts) {
      if (k.owner !== -2) {
        k.rubber = 1;
        continue;
      }
      const gap = (ref - k.lapF) * step; // positive: CPU is behind humans
      k.rubber = clamp(1 + (gap - 300) / 9000, 0.95, 1.055);
    }
  }

  private drainFx(): void {
    for (const k of this.karts) {
      for (const f of k.fxQ) {
        if (f.t === 'fall') this.emit({ t: 'fall', k: k.id, x: k.x, y: k.y });
        else this.emit({ t: f.t, k: k.id, n: f.n, x: k.x, y: k.y });
      }
      k.fxQ.length = 0;
    }
  }

  // ------------------------------------------------------------ kart-kart

  private collideKarts(): void {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      if (a.fallT > 0) continue;
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (b.fallT > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = KART_R * 2 - 4;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = rr - d;
        const ma = a.weight;
        const mb = b.weight;
        const tot = ma + mb;
        a.x -= nx * overlap * (mb / tot);
        a.y -= ny * overlap * (mb / tot);
        b.x += nx * overlap * (ma / tot);
        b.y += ny * overlap * (ma / tot);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j2 = (-(1 + 0.45) * vn) / (1 / ma + 1 / mb);
          a.vx -= (j2 / ma) * nx;
          a.vy -= (j2 / ma) * ny;
          b.vx += (j2 / mb) * nx;
          b.vy += (j2 / mb) * ny;
          if (-vn > 70 && a.bumpT <= 0 && b.bumpT <= 0) {
            a.bumpT = 0.3;
            b.bumpT = 0.3;
            this.emit({ t: 'bump', k: a.id, n: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- boxes

  private updateBoxes(dt: number): void {
    const spots = this.track.boxSpots;
    for (let i = 0; i < spots.length; i++) {
      if (this.boxT[i] > 0) {
        this.boxT[i] -= dt;
        continue;
      }
      const s = spots[i];
      for (const k of this.karts) {
        if (k.fallT > 0 || k.item || k.rouletteT > 0 || k.finished) continue;
        const dx = k.x - s.x;
        const dy = k.y - s.y;
        if (dx * dx + dy * dy < 40 * 40) {
          this.boxT[i] = BOX_RESPAWN;
          k.rouletteT = 1.5;
          k.rouletteTick = 0;
          this.emit({ t: 'pickup', k: k.id, x: s.x, y: s.y, n: i });
          break;
        }
      }
    }
  }

  private rollItem(k: Kart): void {
    const n = this.karts.length;
    const rank = clamp(Math.round(((k.place - 1) / Math.max(1, n - 1)) * 7), 0, 7);
    const w = ITEM_WEIGHTS[rank];
    let total = 0;
    for (const x of w) total += x;
    let r = Math.random() * total;
    let chosen: ItemType = 'banana';
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) {
        chosen = ITEM_ORDER[i];
        break;
      }
    }
    // swarm needs a victim ahead
    if (chosen === 'enxame' && k.place === 1) chosen = 'guarana';
    k.item = chosen;
    if (k.ai) k.ai.itemDelay = 0.8 + Math.random() * 3.2;
    this.emit({ t: 'itemget', k: k.id, s: chosen });
  }

  // ---------------------------------------------------------- track objects

  private updateTrackObjects(dt: number): void {
    const tr = this.track;
    for (const k of this.karts) {
      if (k.fallT > 0) continue;
      // boost pads
      for (const p of tr.pads) {
        const dx = k.x - p.x;
        const dy = k.y - p.y;
        const a = dx * p.tx + dy * p.ty;
        const b = -dx * p.ty + dy * p.tx;
        if (Math.abs(a) < p.len / 2 + 10 && Math.abs(b) < p.wid + 6) {
          if (k.padCool <= 0 || k.boostT < 0.5) {
            k.boostT = Math.max(k.boostT, 1.2);
            k.boostMult = Math.max(k.boostMult, 1.38);
            k.padCool = 0.8;
            this.emit({ t: 'pad', k: k.id, x: k.x, y: k.y });
          }
        }
      }
      for (const pd of tr.puddles) {
        const dx = k.x - pd.x;
        const dy = k.y - pd.y;
        if (dx * dx + dy * dy < pd.r * pd.r) {
          if (k.puddleT <= 0 && k.spd > 120) this.emit({ t: 'splash', k: k.id, x: k.x, y: k.y });
          k.puddleT = 0.2;
        }
      }
      // moving hazards
      for (const hz of tr.hazards) {
        const hp = hazardPos(tr, hz, this.clock);
        const dx = k.x - hp.x;
        const dy = k.y - hp.y;
        const rr = hz.r + KART_R - 4;
        if (dx * dx + dy * dy < rr * rr) {
          if (hz.kind === 'barrel') {
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            k.x = hp.x + (dx / d) * rr;
            k.y = hp.y + (dy / d) * rr;
            k.vx *= 0.4;
            k.vy *= 0.4;
            if (k.bumpT <= 0) {
              k.bumpT = 0.4;
              this.emit({ t: 'bump', k: k.id, n: -1, x: k.x, y: k.y });
            }
          } else {
            this.hitKart(k, 'hazard', -1);
          }
        }
      }
    }
    void dt;
  }

  // ----------------------------------------------------------------- items

  private handleItemUse(k: Kart, inp: Input): void {
    if (inp.itemCount === k.lastItemCount) return;
    k.lastItemCount = inp.itemCount;
    if (!k.item || k.rouletteT > 0 || k.fallT > 0 || k.spinT > 0) return;
    const type = k.item;
    k.item = null;
    this.useItem(k, type, inp.brake > 0.5);
    setExpr(k, EXPR_SCREAM, 0.5);
  }

  useItem(k: Kart, type: ItemType, alt: boolean): void {
    const fx = Math.cos(k.h);
    const fy = Math.sin(k.h);
    this.emit({ t: 'use', k: k.id, s: type, x: k.x, y: k.y });
    const base = (): Item => ({
      id: this.nextItemId++,
      type,
      x: k.x,
      y: k.y,
      vx: 0,
      vy: 0,
      h: k.h,
      owner: k.id,
      life: 10,
      arm: 0.4,
      target: -1,
      bounces: 0,
      idx: k.idx,
      lapF: k.lapF,
      spin: 0,
    });
    switch (type) {
      case 'guarana': {
        k.boostT = Math.max(k.boostT, 2.3);
        k.boostMult = Math.max(k.boostMult, 1.5);
        k.guaranaT = 2.8;
        break;
      }
      case 'banana': {
        const it = base();
        it.x = k.x - fx * 40;
        it.y = k.y - fy * 40;
        it.life = 70;
        if (!alt) {
          // drop behind
        } else {
          it.x = k.x + fx * 50;
          it.y = k.y + fy * 50;
        }
        this.items.push(it);
        break;
      }
      case 'nuvem': {
        const it = base();
        it.x = k.x - fx * 46;
        it.y = k.y - fy * 46;
        it.life = 14;
        it.arm = 1.0;
        this.items.push(it);
        break;
      }
      case 'chinelo': {
        const it = base();
        const dir = alt ? -1 : 1;
        it.x = k.x + fx * 38 * dir;
        it.y = k.y + fy * 38 * dir;
        const sp = 700;
        it.vx = fx * sp * dir;
        it.vy = fy * sp * dir;
        it.life = 9;
        it.arm = 0.25;
        this.items.push(it);
        break;
      }
      case 'coco': {
        const it = base();
        it.x = k.x + fx * 40;
        it.y = k.y + fy * 40;
        it.h = k.h;
        it.life = 10;
        it.arm = 0.3;
        this.items.push(it);
        break;
      }
      case 'enxame': {
        const it = base();
        it.x = k.x + fx * 30;
        it.y = k.y + fy * 30;
        it.life = 22;
        it.arm = 0.3;
        this.items.push(it);
        break;
      }
    }
  }

  private findAhead(from: { lapF: number; owner: number }, maxGap: number): Kart | null {
    let best: Kart | null = null;
    let bestGap = Infinity;
    for (const k of this.karts) {
      if (k.id === from.owner || k.finished || k.fallT > 0) continue;
      const gap = (k.lapF - from.lapF) * this.track.step;
      if (gap > 20 && gap < maxGap && gap < bestGap) {
        bestGap = gap;
        best = k;
      }
    }
    return best;
  }

  private updateItems(dt: number): void {
    const tr = this.track;
    const keep: Item[] = [];
    for (const it of this.items) {
      it.life -= dt;
      if (it.arm > 0) it.arm -= dt;
      it.spin += dt * 9;
      let dead = it.life <= 0;

      if (it.type === 'chinelo') {
        let nx = it.x + it.vx * dt;
        let ny = it.y + it.vy * dt;
        if (surfaceAt(tr, nx, ny) === SURF_VOID) {
          // reflect using local gradient of the walkable area
          const s = (x: number, y: number) => (surfaceAt(tr, x, y) === SURF_VOID ? 0 : 1);
          let gx = s(it.x - 14, it.y) - s(it.x + 14, it.y);
          let gy = s(it.x, it.y - 14) - s(it.x, it.y + 14);
          let gl = Math.hypot(gx, gy);
          if (gl < 0.01) {
            // probe along the velocity
            gx = -it.vx;
            gy = -it.vy;
            gl = Math.hypot(gx, gy) || 1;
          }
          gx /= gl;
          gy /= gl;
          // normal should point toward walkable area; the gradient does that
          const dot = it.vx * gx + it.vy * gy;
          if (dot < 0) {
            it.vx -= 2 * dot * gx;
            it.vy -= 2 * dot * gy;
          }
          it.bounces++;
          this.emit({ t: 'ricochet', x: it.x, y: it.y });
          nx = it.x + it.vx * dt;
          ny = it.y + it.vy * dt;
          if (it.bounces > 5 || surfaceAt(tr, nx, ny) === SURF_VOID) dead = true;
        }
        it.x = nx;
        it.y = ny;
        it.h = Math.atan2(it.vy, it.vx);
      } else if (it.type === 'coco' || it.type === 'enxame') {
        const spd = it.type === 'coco' ? 560 : 640;
        const nr = nearestIdx(tr, it.x, it.y, it.idx, 6, 40);
        let d = nr.idx - it.idx;
        if (d > tr.N / 2) d -= tr.N;
        if (d < -tr.N / 2) d += tr.N;
        it.lapF += d;
        it.idx = nr.idx;
        let target: Kart | null = null;
        if (it.type === 'coco') {
          target = this.kartById(it.target) ?? null;
          if (!target || target.finished || target.fallT > 0 || (target.lapF - it.lapF) * tr.step < -80) {
            target = this.findAhead(it, 3500);
            it.target = target ? target.id : -1;
          }
        } else {
          // leader that isn't the owner
          let lead: Kart | null = null;
          for (const k of this.karts) {
            if (k.id === it.owner || k.finished) continue;
            if (!lead || k.lapF > lead.lapF) lead = k;
          }
          target = lead;
          it.target = lead ? lead.id : -1;
        }
        let aimX: number;
        let aimY: number;
        const look = Math.min(tr.N - 1, 11);
        const ti = (nr.idx + look) % tr.N;
        if (target) {
          const dx = target.x - it.x;
          const dy = target.y - it.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 520 || (it.type === 'enxame' && dist < 800 && Math.abs(target.lapF - it.lapF) * tr.step < 900)) {
            aimX = target.x;
            aimY = target.y;
          } else {
            const lat = clamp(target.lat, -tr.halfW * 0.8, tr.halfW * 0.8);
            aimX = tr.px[ti] + tr.nx[ti] * lat;
            aimY = tr.py[ti] + tr.ny[ti] * lat;
          }
        } else {
          aimX = tr.px[ti];
          aimY = tr.py[ti];
        }
        const want = Math.atan2(aimY - it.y, aimX - it.x);
        const turn = clamp(angDiff(want, it.h), -6 * dt, 6 * dt);
        it.h += turn;
        const sp = it.arm > 0 ? spd * 0.6 : spd;
        it.vx = Math.cos(it.h) * sp;
        it.vy = Math.sin(it.h) * sp;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
      }

      // collisions
      if (!dead) {
        for (const k of this.karts) {
          if (k.fallT > 0 || k.finished) continue;
          const dx = k.x - it.x;
          const dy = k.y - it.y;
          const dist2 = dx * dx + dy * dy;
          if (it.type === 'nuvem') {
            if (it.owner === k.id && it.arm > 0) continue;
            const r = 78 * clamp(it.life / 3, 0.35, 1);
            if (dist2 < r * r) {
              if (k.slowT <= 0.1 && k.invulnT <= 0) {
                this.emit({ t: 'cough', k: k.id, x: k.x, y: k.y });
                setExpr(k, EXPR_CRY, 1.4);
                k.hitBy = 'nuvem';
              }
              k.slowT = Math.max(k.slowT, 1.8);
            }
            continue;
          }
          const hitR = it.type === 'enxame' ? 34 : it.type === 'coco' ? 32 : 26;
          if (dist2 > (hitR + 14) * (hitR + 14)) continue;
          if (it.owner === k.id && it.arm > 0) continue;
          if (it.type === 'enxame' && k.id !== it.target && it.arm <= 0 && false) continue;
          if (k.invulnT > 0) continue;
          if (k.spinT > 0) continue;
          this.hitKart(k, it.type, it.owner);
          dead = true;
          this.emit({ t: 'itemhit', s: it.type, k: k.id, x: it.x, y: it.y });
          break;
        }
        // chinelo / coco can pop bananas
        if (!dead && (it.type === 'chinelo' || it.type === 'coco')) {
          for (const o of this.items) {
            if (o === it || o.type !== 'banana') continue;
            const dx = o.x - it.x;
            const dy = o.y - it.y;
            if (dx * dx + dy * dy < 30 * 30) {
              o.life = 0;
              if (it.type === 'chinelo') dead = true;
              this.emit({ t: 'itemhit', s: 'banana', k: -1, x: o.x, y: o.y });
              break;
            }
          }
        }
      }
      if (!dead) keep.push(it);
    }
    this.items = keep;
  }

  hitKart(k: Kart, kind: string, byId: number): void {
    if (k.invulnT > 0 || k.fallT > 0 || k.finished) return;
    if (k.spinT > 0 && kind !== 'coco') return;
    k.hitBy = kind;
    k.hitsTaken++;
    const by = this.kartById(byId);
    if (by && by !== k) by.hitsDealt++;
    const dir = Math.random() < 0.5 ? -1 : 1;
    k.spinDir = dir;
    k.drift = 0;
    k.driftT = 0;
    k.driftLvl = 0;
    k.boostT = 0;
    k.boostMult = 1;
    switch (kind) {
      case 'banana':
        k.spinT = 1.1;
        k.vx *= 0.35;
        k.vy *= 0.35;
        break;
      case 'chinelo':
        k.spinT = 0.95;
        k.vx *= 0.4;
        k.vy *= 0.4;
        break;
      case 'coco':
        k.spinT = 1.5;
        k.vx *= 0.12;
        k.vy *= 0.12;
        k.hopT = 0.5;
        break;
      case 'enxame':
        k.spinT = 1.35;
        k.stingT = 3.2;
        k.vx *= 0.2;
        k.vy *= 0.2;
        break;
      default:
        k.spinT = 1.0;
        k.vx *= 0.4;
        k.vy *= 0.4;
        break;
    }
    setExpr(k, EXPR_CRY, k.spinT + 0.8);
    this.emit({ t: 'hit', k: k.id, s: kind, n: byId, x: k.x, y: k.y });
  }

  // -------------------------------------------------------------- progress

  private updateProgress(): void {
    const N = this.track.N;
    if (this.phase === 'done') return;
    for (const k of this.karts) {
      const lapNow = Math.floor(k.lapF / N) + 1;
      if (lapNow > k.lapReached) {
        k.lapReached = lapNow;
        k.lap = Math.min(LAPS, lapNow);
        if (lapNow === 1) {
          k.lapStartT = this.t;
        } else if (lapNow <= LAPS) {
          const lt = this.t - k.lapStartT;
          k.lapTimes.push(lt);
          if (lt < k.bestLap) k.bestLap = lt;
          k.lapStartT = this.t;
          this.emit({ t: 'lap', k: k.id, n: lapNow, x: lt });
        } else if (!k.finished) {
          const lt = this.t - k.lapStartT;
          k.lapTimes.push(lt);
          if (lt < k.bestLap) k.bestLap = lt;
          this.finishKart(k);
        }
      }
    }
    // ranking
    const order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.lapF - a.lapF;
    });
    order.forEach((k, i) => {
      if (!k.finished) k.place = i + 1;
    });

    // end of race
    if (this.phase === 'racing') {
      const humans = this.karts.filter((k) => k.owner !== -2);
      const allHumansDone = humans.length > 0 && humans.every((k) => k.finished);
      const everyone = this.karts.every((k) => k.finished);
      const timeout = this.firstFinishT >= 0 && this.t - this.firstFinishT > 28;
      if (allHumansDone || everyone || timeout) this.endRace();
    }
  }

  private finishKart(k: Kart): void {
    k.finished = true;
    k.finishTime = this.t;
    this.finishedCount++;
    k.place = this.finishedCount;
    k.autopilot = true;
    if (this.firstFinishT < 0) this.firstFinishT = this.t;
    setExpr(k, EXPR_HAPPY, 99);
    this.emit({ t: 'finish', k: k.id, n: k.place, x: k.finishTime });
  }

  endRace(): void {
    if (this.phase === 'done') return;
    // rank the unfinished by progress
    const rest = this.karts.filter((k) => !k.finished).sort((a, b) => b.lapF - a.lapF);
    for (const k of rest) {
      k.place = ++this.finishedCount;
      k.finishTime = this.t + 5 + k.place * 0.37;
    }
    this.phase = 'done';
    this.emit({ t: 'done' });
  }

  respawnAll(): void {
    for (const k of this.karts) respawnKart(k, this.track);
  }

  quoteFor(k: Kart, kind: 'win' | 'hit' | 'boost'): string {
    return DRIVERS[k.driver].quotes[kind];
  }
}

export { EXPR_SCREAM, EXPR_HAPPY };
