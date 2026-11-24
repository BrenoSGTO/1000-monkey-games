import {
  BH,
  GRAV,
  HW,
  JUMP,
  RUN,
  emptyInput,
  type Emit,
  type Hazard,
  type Monkey,
  type Plank,
  type Plat,
  type PlatKind,
  type RoundKind,
  type Shape,
  type Skin,
  type World,
} from './types';
import { approach, clamp, makeRng, sign } from './util';

// ───────────────────────── world helpers ─────────────────────────

export function newWorld(kind: RoundKind, variant: number, seed: number, n: number): World {
  return {
    kind,
    variant,
    seed,
    n,
    t: 0,
    plats: [],
    hazards: [],
    gates: [],
    killY: 900,
    bounds: { x0: 0, x1: 1280, y0: 0, y1: 720 },
    finishX: 0,
    startX: 0,
    checkpoints: [],
    limit: 60,
    timeLeft: 60,
    theme: 0,
    plank: null,
    cocos: [],
    ball: null,
    crown: null,
    score: [0, 0],
    tm: [0, 0, 0, 0],
    golden: false,
    cocoSeq: 0,
    winTeam: -1,
    tailTarget: 0,
    nextPlat: 0,
  };
}

export function addPlat(
  w: World,
  x: number,
  y: number,
  wid: number,
  h: number,
  kind: PlatKind,
  extra: Partial<Plat> = {},
): Plat {
  const p: Plat = {
    id: w.plats.length,
    x,
    y,
    w: wid,
    h,
    kind,
    active: true,
    t1: -1,
    fake: false,
    wob: 0,
    col: 0,
    layer: 0,
    dx: 0,
    mv: null,
    ...extra,
  };
  w.plats.push(p);
  return p;
}

export function addHazard(w: World, h: Partial<Hazard> & { kind: Hazard['kind'] }): Hazard {
  const hz: Hazard = { x: 0, y: 0, len: 100, amp: 1, per: 2, ph: 0, r: 30, ...h };
  w.hazards.push(hz);
  return hz;
}

export function updatePlats(w: World, dt: number): void {
  for (const p of w.plats) {
    if (p.wob > 0) p.wob = Math.max(0, p.wob - dt);
    if (p.mv) {
      const m = p.mv;
      const nx = m.cx + m.ax * Math.sin((Math.PI * 2 * w.t) / m.per + m.ph);
      const ny = m.cy + m.ay * Math.sin((Math.PI * 2 * w.t) / m.per + m.ph);
      p.dx = nx - p.x;
      p.x = nx;
      p.y = ny;
    }
  }
}

export function hazardShape(h: Hazard, t: number, out: Shape): Shape {
  if (h.kind === 'hammer') {
    const a = h.amp * Math.sin((Math.PI * 2 * t) / h.per + h.ph);
    const da = h.amp * ((Math.PI * 2) / h.per) * Math.cos((Math.PI * 2 * t) / h.per + h.ph);
    out.x = h.x + h.len * Math.sin(a);
    out.y = h.y + h.len * Math.cos(a);
    out.x2 = out.x;
    out.y2 = out.y;
    out.r = h.r;
    out.vx = h.len * da * Math.cos(a);
    out.vy = -h.len * da * Math.sin(a);
  } else if (h.kind === 'spinner') {
    const a = h.amp * t + h.ph;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.x = h.x - h.len * c;
    out.y = h.y - h.len * s;
    out.x2 = h.x + h.len * c;
    out.y2 = h.y + h.len * s;
    out.r = h.r;
    out.vx = -h.amp * h.len * s;
    out.vy = h.amp * h.len * c;
  } else {
    const sp = h.amp;
    const x = h.x - ((t * sp + h.ph) % h.len);
    out.x = x;
    out.y = h.y;
    out.x2 = x;
    out.y2 = h.y;
    out.r = h.r;
    out.vx = -sp;
    out.vy = 0;
  }
  return out;
}

export function plankSurface(pk: Plank, x: number): number {
  return pk.py + Math.tan(pk.ang) * (x - pk.px) - 11;
}

function platAt(w: World, id: number): Plat | undefined {
  return id >= 0 ? w.plats[id] : undefined;
}

export function solidAt(w: World, x: number, y: number): boolean {
  for (const p of w.plats) {
    if (p.kind === 'solid' || (p.kind === 'door' && p.active)) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
  }
  return false;
}

/** y of the closest walkable surface at x at or below y0 (within maxDrop) or null */
export function supportBelow(w: World, x: number, y0: number, maxDrop: number): number | null {
  let best: number | null = null;
  for (const p of w.plats) {
    if (p.kind === 'door') continue;
    if ((p.kind === 'tile') && !p.active) continue;
    if (x < p.x - 2 || x > p.x + p.w + 2) continue;
    if (p.y < y0 - 8 || p.y > y0 + maxDrop) continue;
    if (best === null || p.y < best) best = p.y;
  }
  if (w.plank && Math.abs(x - w.plank.px) <= w.plank.len / 2) {
    const s = plankSurface(w.plank, x);
    if (s >= y0 - 8 && s <= y0 + maxDrop && (best === null || s < best)) best = s;
  }
  return best;
}

// ───────────────────────── monkey factory ─────────────────────────

export function makeMonkey(id: number, name: string, skin: Skin, owner: string, isBot: boolean, skill: number): Monkey {
  return {
    id,
    name,
    owner,
    isBot,
    skill,
    skin,
    team: -1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: 1,
    grounded: false,
    ground: -1,
    coyote: 0,
    jumpBuf: 0,
    diveT: 0,
    diveCd: 0,
    flopT: 0,
    flopK: 1,
    grabT: 0,
    grabCd: 0,
    heldBy: -1,
    heldT: 0,
    holding: -1,
    invT: 0,
    respawnT: 0,
    status: 'alive',
    done: false,
    gone: false,
    outRound: 0,
    outAt: 0,
    place: 0,
    prog: 0,
    cpx: 0,
    cpy: 0,
    tail: false,
    tailImm: 0,
    score: 0,
    crown: false,
    input: emptyInput(),
    ai: {
      tx: 0,
      ty: 0,
      wait: 0,
      think: 0,
      mode: 0,
      lane: -1,
      seed: Math.floor(makeRng(id * 7919 + 13)() * 1e6),
      jumpCd: 0,
      panic: 0,
    },
  };
}

export function resetMonkeyForRound(m: Monkey): void {
  m.vx = 0;
  m.vy = 0;
  m.grounded = false;
  m.ground = -1;
  m.coyote = 0;
  m.jumpBuf = 0;
  m.diveT = 0;
  m.diveCd = 0;
  m.flopT = 0;
  m.grabT = 0;
  m.grabCd = 0;
  m.heldBy = -1;
  m.heldT = 0;
  m.holding = -1;
  m.invT = 0;
  m.respawnT = 0;
  m.done = false;
  m.gone = false;
  m.place = 0;
  m.prog = 0;
  m.tail = false;
  m.tailImm = 0;
  m.score = 0;
  m.crown = false;
  m.team = -1;
  m.input = emptyInput();
  m.ai.wait = 0;
  m.ai.think = 0;
  m.ai.lane = -1;
  m.ai.mode = 0;
  m.ai.jumpCd = 0;
  m.ai.panic = 0;
}

// ───────────────────────── knock / release ─────────────────────────

export function releaseHolds(all: Monkey[], m: Monkey): void {
  if (m.holding >= 0) {
    const o = all[m.holding];
    if (o && o.heldBy === m.id) o.heldBy = -1;
    m.holding = -1;
  }
  if (m.heldBy >= 0) {
    const o = all[m.heldBy];
    if (o && o.holding === m.id) o.holding = -1;
    m.heldBy = -1;
  }
}

export function dropCrown(w: World, m: Monkey): void {
  if (!m.crown || !w.crown) return;
  m.crown = false;
  const c = w.crown;
  c.holder = -1;
  c.lastHolder = m.id;
  c.cd = 1.1;
  c.x = m.x;
  c.y = m.y - 52;
  c.vx = (Math.random() - 0.5) * 520;
  c.vy = -620;
}

export function knock(
  w: World,
  all: Monkey[],
  m: Monkey,
  vx: number,
  vy: number,
  dur: number,
  emit: Emit,
  text?: string,
): void {
  if (m.done || m.gone) return;
  releaseHolds(all, m);
  dropCrown(w, m);
  m.flopT = Math.max(m.flopT, dur);
  m.flopK = 1;
  m.vx = vx;
  m.vy = vy;
  m.grounded = false;
  m.ground = -1;
  m.diveT = 0;
  m.grabT = 0;
  m.coyote = 0;
  emit({ k: 'sfx', s: 'slap', id: m.id });
  if (text) emit({ k: 'txt', x: m.x, y: m.y - 70, s: text, c: '#fde047' });
  emit({ k: 'puff', x: m.x, y: m.y - 20, n: 6 });
}

// ───────────────────────── per-monkey stepping ─────────────────────────

function overlapRect(m: Monkey, p: Plat): boolean {
  return m.x + HW > p.x && m.x - HW < p.x + p.w && m.y > p.y + 0.01 && m.y - BH < p.y + p.h;
}

function solidFor(p: Plat): boolean {
  return p.kind === 'solid' || (p.kind === 'door' && p.active);
}

function preStep(w: World, all: Monkey[], m: Monkey, dt: number, emit: Emit): void {
  const inp = m.input;
  m.flopT = Math.max(0, m.flopT - dt);
  m.diveCd = Math.max(0, m.diveCd - dt);
  m.grabCd = Math.max(0, m.grabCd - dt);
  m.grabT = Math.max(0, m.grabT - dt);
  m.invT = Math.max(0, m.invT - dt);
  m.tailImm = Math.max(0, m.tailImm - dt);

  const ctrl = m.flopT <= 0 && m.heldBy < 0;

  if (m.grounded) m.coyote = 0.1;
  else m.coyote -= dt;
  if (inp.jump) m.jumpBuf = 0.13;
  else m.jumpBuf -= dt;

  // carried by moving platform
  if (m.grounded && m.ground >= 0) {
    const p = platAt(w, m.ground);
    if (p && p.dx !== 0) m.x += p.dx;
  }

  if (ctrl && m.diveT <= 0 && Math.abs(inp.mx) > 0.2) m.face = sign(inp.mx);

  if (m.diveT > 0) {
    m.diveT -= dt;
    m.vx = approach(m.vx, m.face * (RUN + 160), 600 * dt);
  } else if (ctrl) {
    const tv = inp.mx * RUN;
    let a = m.grounded ? 3200 : 1700;
    if (m.ground === -2 && inp.mx === 0) a = 180; // slippery jelly plank when idle
    m.vx = approach(m.vx, tv, a * dt);
  } else {
    m.vx = approach(m.vx, 0, (m.grounded ? 820 : 60) * dt);
  }

  if (ctrl && m.diveT <= 0 && m.jumpBuf > 0 && m.coyote > 0) {
    m.vy = -JUMP;
    m.coyote = 0;
    m.jumpBuf = 0;
    m.grounded = false;
    m.ground = -1;
    emit({ k: 'sfx', s: 'jump', id: m.id });
  }

  if (ctrl && inp.dive && m.diveCd <= 0 && m.diveT <= 0 && m.grabT <= 0) {
    m.diveT = 0.55;
    m.diveCd = 1.1;
    m.vx = m.face * (RUN + 230);
    m.vy = m.grounded ? -340 : Math.max(m.vy, 120);
    m.grounded = false;
    m.ground = -1;
    emit({ k: 'sfx', s: 'dive', id: m.id });
  }

  if (ctrl && inp.grab && m.grabCd <= 0 && m.grabT <= 0 && m.diveT <= 0 && m.holding < 0) {
    m.grabT = 0.5;
    m.grabCd = 1.0;
    emit({ k: 'sfx', s: 'grab', id: m.id });
  }

  void all;
}

function integrate(w: World, m: Monkey, h: number, emit: Emit): void {
  m.vy = Math.min(1500, m.vy + GRAV * h);
  // horizontal
  m.x += m.vx * h;
  for (const p of w.plats) {
    if (!solidFor(p)) continue;
    if (!overlapRect(m, p)) continue;
    // ignore if we are standing on it (y == top)
    if (m.vx > 0) m.x = p.x - HW;
    else if (m.vx < 0) m.x = p.x + p.w + HW;
    else m.x += m.x < p.x + p.w / 2 ? -1 : 1;
    if (m.flopT > 0 && Math.abs(m.vx) > 200) m.vx *= -0.35;
    else m.vx = 0;
    if (m.diveT > 0) m.diveT = Math.min(m.diveT, 0.05);
  }

  // vertical
  const prevBottom = m.y;
  m.y += m.vy * h;
  const wasGrounded = m.grounded;
  m.grounded = false;
  let landed: Plat | null = null;
  for (const p of w.plats) {
    if (p.kind === 'tile' && !p.active) continue;
    if (p.kind === 'door' && !p.active) continue;
    if (!(m.x + HW > p.x && m.x - HW < p.x + p.w)) continue;
    if (solidFor(p)) {
      if (m.y > p.y && m.y - BH < p.y + p.h) {
        if (m.vy >= 0 && prevBottom <= p.y + 4) {
          m.y = p.y;
          landed = p;
        } else if (m.vy < 0 && m.y - BH <= p.y + p.h && m.y - m.vy * h - BH >= p.y + p.h - 4) {
          m.y = p.y + p.h + BH;
          m.vy = 0;
        }
      }
    } else if (m.vy >= 0 && m.y >= p.y && prevBottom <= p.y + 3) {
      m.y = p.y;
      landed = p;
    }
  }

  // seesaw plank
  let onPlank = false;
  if (w.plank && m.vy >= 0 && m.heldBy < 0) {
    const pk = w.plank;
    if (Math.abs(m.x - pk.px) <= pk.len / 2) {
      const s = plankSurface(pk, m.x);
      const sticky = wasGrounded && m.ground === -2;
      if (m.y >= s - 1 && (prevBottom <= s + 22 || sticky) && m.y <= s + 40) {
        if (!landed || s < landed.y) {
          m.y = s;
          onPlank = true;
        }
      }
    }
  }

  if (onPlank) {
    const impact = m.vy;
    m.grounded = true;
    m.ground = -2;
    m.vy = 0;
    if (w.plank) {
      m.vx += GRAV * Math.sin(w.plank.ang) * 0.5 * h;
      if (!wasGrounded && impact > 300) emit({ k: 'dust', x: m.x, y: m.y, n: 3 });
    }
  } else if (landed) {
    const impact = m.vy;
    if (m.diveT > 0) {
      m.diveT = 0;
      m.flopT = 0.5;
      m.flopK = 0;
      m.vx *= 1.0;
    }
    if (landed.kind === 'bounce') {
      m.vy = -1180;
      landed.wob = 0.35;
      m.grounded = false;
      m.ground = -1;
      emit({ k: 'sfx', s: 'boing', id: m.id });
    } else if (m.flopT > 0 && m.flopK === 1 && impact > 420) {
      m.vy = -impact * 0.32;
      m.grounded = false;
      m.ground = -1;
      emit({ k: 'dust', x: m.x, y: m.y, n: 3 });
    } else {
      m.vy = 0;
      m.grounded = true;
      m.ground = landed.id;
      if (!wasGrounded && impact > 500) emit({ k: 'dust', x: m.x, y: m.y, n: Math.min(6, Math.round(impact / 250)) });
    }
  } else {
    m.ground = -1;
  }
}

export function stepMonkeys(w: World, all: Monkey[], dt: number, emit: Emit): void {
  const SUB = 2;
  const h = dt / SUB;
  for (const m of all) {
    if (m.gone || m.respawnT > 0) continue;
    if (m.done) {
      m.input.mx = 0;
      m.input.jump = false;
      m.input.dive = false;
      m.input.grab = false;
    }
    if (m.heldBy >= 0) {
      m.flopT = Math.max(0, m.flopT - dt);
      continue;
    }
    preStep(w, all, m, dt, emit);
    for (let i = 0; i < SUB; i++) integrate(w, m, h, emit);
    if (w.bounds && (m.x < w.bounds.x0 - 400 || m.x > w.bounds.x1 + 400)) {
      m.x = clamp(m.x, w.bounds.x0 - 400, w.bounds.x1 + 400);
    }
  }
}

// ───────────────────────── interactions ─────────────────────────

export function interact(w: World, all: Monkey[], dt: number, emit: Emit): void {
  const act: Monkey[] = [];
  for (const m of all) if (!m.gone && !m.done && m.respawnT <= 0) act.push(m);

  // monkey vs monkey bumping
  for (let i = 0; i < act.length; i++) {
    const a = act[i];
    for (let j = i + 1; j < act.length; j++) {
      const b = act[j];
      if (a.heldBy === b.id || b.heldBy === a.id) continue;
      const dx = b.x - a.x;
      const dy = b.y - 23 - (a.y - 23);
      if (Math.abs(dx) > 34 || Math.abs(dy) > 44) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 34 * 34) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = d < 0.01 ? (a.id < b.id ? 1 : -1) : dx / d;
      const ov = 34 - d;
      const half = ov * 0.5;
      a.x -= nx * half;
      b.x += nx * half;
      // head stomp stand-on (b above a)
      const rv = (b.vx - a.vx) * nx;
      if (rv < 0) {
        const j2 = -rv * 0.6;
        a.vx -= j2 * nx;
        b.vx += j2 * nx;
      }
      for (const [att, vic] of [
        [a, b],
        [b, a],
      ] as const) {
        if (att.diveT > 0 && vic.flopT <= 0 && vic.invT <= 0 && vic.diveT <= 0) {
          knock(w, all, vic, att.vx * 0.85 + sign(vic.x - att.x) * 80, -380, 0.95, emit, 'BAF!');
          att.vx *= 0.5;
          emit({ k: 'shake', n: 4 });
        }
      }
    }
  }

  // grabbing
  for (const m of act) {
    if (m.grabT > 0 && m.holding < 0) {
      let best: Monkey | null = null;
      let bd = 999;
      for (const t of act) {
        if (t === m || t.heldBy >= 0 || t.invT > 0) continue;
        const dx = (t.x - m.x) * m.face;
        if (dx < -8 || dx > 46 || Math.abs(t.y - m.y) > 34) continue;
        if (dx < bd) {
          bd = dx;
          best = t;
        }
      }
      if (best) {
        const t = best;
        if (w.kind === 'tail' && t.tail && t.tailImm <= 0 && !m.tail) {
          t.tail = false;
          m.tail = true;
          m.tailImm = 1.8;
          t.invT = 0.5;
          m.grabT = 0;
          knock(w, all, t, -m.face * 260, -300, 0.7, emit);
          emit({ k: 'txt', x: m.x, y: m.y - 80, s: 'ROUBOU O RABO!', c: '#fde047' });
          emit({ k: 'sfx', s: 'steal', id: m.id });
          emit({ k: 'conf', x: m.x, y: m.y - 30, n: 8 });
        } else if (w.kind === 'crown' && t.crown && w.crown) {
          t.crown = false;
          m.crown = true;
          w.crown.holder = m.id;
          m.grabT = 0;
          knock(w, all, t, -m.face * 300, -340, 0.8, emit);
          emit({ k: 'txt', x: m.x, y: m.y - 80, s: 'ROUBOU A COROA!', c: '#fde047' });
          emit({ k: 'sfx', s: 'steal', id: m.id });
        } else {
          m.holding = t.id;
          t.heldBy = m.id;
          t.heldT = 0.8;
          m.grabT = 0;
          t.diveT = 0;
          emit({ k: 'txt', x: t.x, y: t.y - 70, s: 'AGARROU!', c: '#fff' });
          emit({ k: 'sfx', s: 'slap', id: m.id });
        }
      }
    }
  }

  // held monkeys follow the holder, then get thrown
  for (const t of all) {
    if (t.heldBy < 0) continue;
    const h = all[t.heldBy];
    if (!h || h.gone || h.done || h.flopT > 0) {
      releaseHolds(all, t);
      continue;
    }
    t.heldT -= dt;
    t.x = h.x + h.face * 26;
    t.y = h.y - 6;
    t.vx = h.vx;
    t.vy = 0;
    if (t.heldT <= 0) {
      const f = h.face;
      releaseHolds(all, t);
      knock(w, all, t, f * 640, -430, 0.8, emit, 'ARREMESSO!');
      emit({ k: 'shake', n: 3 });
    }
  }
}

export function hazardHits(w: World, all: Monkey[], emit: Emit): void {
  if (w.hazards.length === 0) return;
  const s: Shape = { x: 0, y: 0, x2: 0, y2: 0, r: 0, vx: 0, vy: 0 };
  for (const hz of w.hazards) {
    hazardShape(hz, w.t, s);
    for (const m of all) {
      if (m.gone || m.done || m.respawnT > 0 || m.invT > 0 || m.flopT > 0.25) continue;
      const cx = m.x;
      const cy = m.y - 24;
      // closest point on segment
      let px = s.x;
      let py = s.y;
      if (s.x2 !== s.x || s.y2 !== s.y) {
        const ex = s.x2 - s.x;
        const ey = s.y2 - s.y;
        const tt = clamp(((cx - s.x) * ex + (cy - s.y) * ey) / (ex * ex + ey * ey), 0, 1);
        px = s.x + ex * tt;
        py = s.y + ey * tt;
      }
      const dx = cx - px;
      const dy = cy - py;
      const rr = s.r + 15;
      if (dx * dx + dy * dy < rr * rr) {
        const d = Math.hypot(dx, dy) || 1;
        let kx = (dx / d) * 460 + s.vx * 0.55;
        if (hz.kind === 'roller') kx = -420 - Math.random() * 80;
        const ky = -430 - Math.abs(s.vy) * 0.15;
        const txt =
          hz.kind === 'hammer' ? 'MARTELADA!' : hz.kind === 'spinner' ? 'RODOU!' : 'ATROPELADO!';
        knock(w, all, m, kx, ky, 1.25, emit, txt);
        m.invT = 2.2;
        emit({ k: 'shake', n: 7 });
        emit({ k: 'sfx', s: 'bonk', id: m.id });
      }
    }
  }
}
