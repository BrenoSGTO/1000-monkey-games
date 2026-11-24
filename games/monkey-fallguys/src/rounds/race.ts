import { clearInput, pathHit, pitAhead, rand, rollerAhead, wallAhead } from '../bots';
import { addHazard, addPlat, knock, releaseHolds } from '../physics';
import { BH, GY, type Gate, type Monkey, type World } from '../types';
import { clamp, type Rng } from '../util';
import type { RoundCtx, RoundModule } from './api';
import { applyPlats, serPlats, syncMovers } from './common';

const LANE_Y = [GY, 440, 320];

function ground(w: World, x0: number, x1: number): void {
  addPlat(w, x0, GY, x1 - x0, 420, 'solid', { col: 0 });
}

function secHammers(w: World, x: number, rng: Rng, count: number, spacing: number): number {
  const len = 260 + count * spacing;
  ground(w, x, x + len);
  w.checkpoints.push(x + 50);
  for (let i = 0; i < count; i++) {
    addHazard(w, {
      kind: 'hammer',
      x: x + 230 + i * spacing,
      y: 130,
      len: 395,
      amp: 0.95 + rng() * 0.25,
      per: 2.0 + rng() * 0.9,
      ph: rng() * 6,
      r: 32,
    });
  }
  return x + len;
}

function secPits(w: World, x: number, rng: Rng): number {
  const spots = [
    [60, 520, 150],
    [270, 470, 130],
    [460, 515, 130],
    [650, 465, 125],
  ];
  for (const [dx, y, wd] of spots) {
    addPlat(w, x + dx + (rng() - 0.5) * 20, y + (rng() - 0.5) * 20, wd, 24, 'oneway', { col: 1 + Math.floor(rng() * 3) });
  }
  return x + 840;
}

function secMovers(w: World, x: number, rng: Rng): number {
  for (let i = 0; i < 5; i++) {
    const cy = 500 + (i % 2) * -35;
    addPlat(w, x + 130 + i * 205, cy, 160, 24, 'oneway', {
      col: 1 + (i % 3),
      mv: {
        cx: x + 130 + i * 205,
        cy,
        ax: 35 + rng() * 25,
        ay: 0,
        per: 3.4 + rng() * 1.2,
        ph: rng() * 6,
      },
    });
  }
  return x + 1130;
}

function secSpinners(w: World, x: number, rng: Rng): number {
  const len = 1020;
  ground(w, x, x + len);
  w.checkpoints.push(x + 50);
  for (let i = 0; i < 3; i++) {
    addHazard(w, {
      kind: 'spinner',
      x: x + 260 + i * 300,
      y: GY - 135,
      len: 105,
      amp: (i % 2 === 0 ? 1 : -1) * (1.7 + rng() * 0.5),
      ph: rng() * 6,
      r: 12,
    });
  }
  return x + len;
}

function secGate(w: World, x: number, rng: Rng, nReal: number): number {
  const len = 860;
  ground(w, x, x + len);
  w.checkpoints.push(x + 40);
  const gx = x + 430;
  // lanes
  addPlat(w, gx - 190, 440, 380, 24, 'oneway', { col: 2 });
  addPlat(w, gx - 190, 320, 380, 24, 'oneway', { col: 3 });
  // wall pieces
  addPlat(w, gx, -600, 30, 820, 'solid', { col: 4 });
  addPlat(w, gx, 320, 30, 20, 'solid', { col: 4 });
  addPlat(w, gx, 440, 30, 20, 'solid', { col: 4 });
  const reals = new Set<number>();
  while (reals.size < nReal) reals.add(Math.floor(rng() * 3));
  const ids: number[] = [];
  for (let lane = 0; lane < 3; lane++) {
    const p = addPlat(w, gx, LANE_Y[lane] - 100, 30, 100, 'door', { fake: !reals.has(lane), col: lane });
    ids.push(p.id);
  }
  const g: Gate = { x: gx, floors: LANE_Y.slice(), doorIds: ids };
  w.gates.push(g);
  return x + len;
}

function secRollers(w: World, x: number, rng: Rng): number {
  const len = 1150;
  ground(w, x, x + len);
  w.checkpoints.push(x + 50);
  for (let i = 0; i < 3; i++) {
    addHazard(w, {
      kind: 'roller',
      x: x + len - 20,
      y: GY - 38,
      len: len - 160,
      amp: 250 + rng() * 70,
      ph: (i * (len - 160)) / 3 + rng() * 120,
      r: 38,
    });
  }
  return x + len;
}

function secFinish(w: World, x: number): number {
  ground(w, x, x + 800);
  w.checkpoints.push(x + 40);
  w.finishX = x + 330;
  w.bounds.x1 = x + 800;
  return x + 800;
}

export const race: RoundModule = {
  kind: 'race',
  variants: 2,
  fill: true,
  minQual: 2,
  info(variant) {
    return variant === 0
      ? {
          title: 'CORRIDA DA SELVA',
          blurb: 'Corra até a linha de chegada! Cuidado com os martelos de banana, rolos e portas falsas!',
          tip: 'Pule com ESPAÇO. Portas falsas dão BONK — mas dá pra trocar de andar!',
        }
      : {
          title: 'LADEIRA DOS ROLOS',
          blurb: 'Plataformas de gelatina, toras rolantes e martelos. Os mais rápidos classificam!',
          tip: 'Pule as toras rolantes e espere o martelo passar.',
        };
  },
  build(w, n, variant, rng) {
    w.killY = 900;
    w.limit = 85;
    w.theme = variant;
    w.startX = 130;
    ground(w, -900, 760);
    w.checkpoints = [60];
    w.bounds = { x0: -700, x1: 0, y0: -100, y1: 800 };
    let x = 760;
    if (variant === 0) {
      x = secHammers(w, x, rng, 3, 340);
      x = secPits(w, x, rng);
      x = secSpinners(w, x + 0, rng);
      x = secGate(w, x, rng, rng() < 0.4 ? 2 : 1);
      x = secRollers(w, x, rng);
      x = secGate(w, x, rng, 1);
      x = secFinish(w, x);
    } else {
      x = secMovers(w, x, rng);
      x = secRollers(w, x, rng);
      x = secSpinners(w, x, rng);
      x = secGate(w, x, rng, 1);
      x = secHammers(w, x, rng, 4, 300);
      x = secPits(w, x, rng);
      x = secFinish(w, x);
    }
    // fix pits: ground resumes at the next section (they start at their x)
  },
  spawn(w, m, idx) {
    m.x = w.startX - (idx % 28) * 26;
    m.y = GY;
    m.grounded = true;
    m.ground = 0;
    m.face = 1;
    m.cpx = w.startX;
    m.cpy = GY;
  },
  update(w, ctx, dt) {
    const comp = ctx.comp();
    for (const m of comp) {
      if (m.status !== 'alive') continue;
      if (m.respawnT > 0) {
        m.respawnT -= dt;
        if (m.respawnT <= 0) {
          let cp = w.checkpoints[0];
          for (const c of w.checkpoints) if (c <= m.prog + 5) cp = c;
          m.x = cp;
          m.y = GY;
          m.vx = 0;
          m.vy = 0;
          m.flopT = 0;
          m.invT = 1.6;
          m.grounded = true;
          m.ground = 0;
          ctx.emit({ k: 'conf', x: m.x, y: m.y - 40, n: 6 });
        }
        continue;
      }
      if (m.y > w.killY) {
        releaseHolds(ctx.all, m);
        m.respawnT = 1.1;
        ctx.emit({ k: 'splash', x: m.x, y: GY + 280 });
        ctx.emit({ k: 'txt', x: m.x, y: w.killY - 160, s: 'GLUB! VOLTA PRO CHECKPOINT', c: '#d8b4fe' });
        ctx.emit({ k: 'sfx', s: 'splash', id: m.id });
        continue;
      }
      m.prog = Math.max(m.prog, m.x);
      if (m.x >= w.finishX) ctx.qualify(m);
    }

    // gates / doors
    for (const g of w.gates) {
      for (const id of g.doorIds) {
        const p = w.plats[id];
        if (p.wob > 0) p.wob = Math.max(0, p.wob - dt);
        if (!p.fake && !p.active) {
          p.t1 -= dt;
          if (p.t1 <= 0) {
            let blocked = false;
            for (const m of comp) {
              if (m.x + 16 > p.x && m.x - 16 < p.x + p.w && m.y > p.y && m.y - BH < p.y + p.h) blocked = true;
            }
            if (blocked) p.t1 = 0.25;
            else {
              p.active = true;
              p.t1 = -1;
            }
          }
          continue;
        }
        for (const m of comp) {
          if (m.status !== 'alive' || m.respawnT > 0) continue;
          const touching =
            m.x + 14 >= p.x - 4 && m.x < p.x && m.y > p.y + 8 && m.y - BH < p.y + p.h && (m.vx > 60 || m.input.mx > 0.5);
          if (!touching) continue;
          if (p.fake) {
            if (m.flopT <= 0 && p.active) {
              p.wob = 0.55;
              knock(w, ctx.all, m, -430, -300, 1.0, ctx.emit, 'PORTA FALSA!');
              ctx.emit({ k: 'sfx', s: 'bonk', id: m.id });
              ctx.emit({ k: 'shake', n: 6 });
            }
          } else if (p.active) {
            p.active = false;
            p.t1 = 1.7;
            ctx.emit({ k: 'sfx', s: 'creak', id: m.id });
          }
        }
      }
    }

    if (ctx.nQual() >= ctx.target) ctx.finish();
  },
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number) {
    const ai = m.ai;
    const inp = m.input;
    ai.jumpCd -= dt;
    ai.think -= dt;
    if (m.flopT > 0 || m.respawnT > 0 || m.status !== 'alive') {
      inp.mx = 0;
      clearInput(m);
      if (m.flopT > 0 && w.gates.length) {
        for (const g of w.gates) {
          if (Math.abs(m.x - g.x) < 90) ai.tx = (ai.tx | (1 << Math.max(0, Math.min(2, laneOf(m))))) | 0;
        }
      }
      return;
    }
    if (ai.think > 0) {
      clearInput(m);
      return;
    }
    ai.think = 0.06 + rand(m) * 0.06;
    clearInput(m);
    let mx = 1;
    let jump = false;

    // gates
    let gate: Gate | null = null;
    for (const g of w.gates) if (m.x > g.x - 480 && m.x < g.x + 40) gate = g;
    if (gate) {
      if (ai.lane < 0) {
        const real: number[] = [];
        for (let l = 0; l < 3; l++) if (!w.plats[gate.doorIds[l]].fake) real.push(l);
        const free: number[] = [];
        for (let l = 0; l < 3; l++) if (!((ai.tx >> l) & 1)) free.push(l);
        if (rand(m) < m.skill * 0.55 && real.length) ai.lane = real[Math.floor(rand(m) * real.length)];
        else ai.lane = free.length ? free[Math.floor(rand(m) * free.length)] : Math.floor(rand(m) * 3);
      }
      const cur = laneOf(m);
      const lane = ai.lane;
      if (m.grounded) {
        if (cur < lane) {
          if (m.x < gate.x - 120) mx = 1;
          else {
            mx = 0;
            if (ai.jumpCd <= 0) {
              jump = true;
              ai.jumpCd = 0.45;
            }
          }
        } else if (cur > lane) {
          mx = -1;
        }
      }
    } else {
      ai.lane = -1;
      ai.tx = 0;
    }

    if (!gate || (m.grounded && laneOf(m) === ai.lane)) {
      if (m.grounded && ai.jumpCd <= 0) {
        if (wallAhead(w, m, 1) && !gate) {
          jump = true;
        }
        const pitDist = pitAhead(w, m, 1, 36) || (pitAhead(w, m, 1, 76) && rand(m) < 0.7);
        if (pitDist && !gate) {
          // sloppy bots sometimes skip the jump
          if (rand(m) < 0.03 + (1 - m.skill) * 0.12) jump = false;
          else jump = true;
        }
        const rl = rollerAhead(w, m);
        if (rl > 0 && rl < 70 + m.skill * 50) jump = true;
      }
      // hazard timing
      const th = pathHit(w, m.x, m.y, 340, 0.55);
      if (th >= 0 && !jump) {
        mx = th < 0.2 ? -1 : 0;
        if (m.skill < 0.65 && rand(m) < 0.25) mx = 1; // brave/dumb
      }
    }

    if (jump && m.grounded) {
      inp.jump = true;
      ai.jumpCd = Math.max(ai.jumpCd, 0.4);
    }
    // in air above a pit: keep going; random silly dive
    if (!m.grounded && rand(m) < 0.004 * (1.2 - m.skill)) inp.dive = true;
    inp.mx = clamp(mx, -1, 1);
  },
  rank(w, ms) {
    return ms.slice().sort((a, b) => b.prog - a.prog);
  },
  ser(w) {
    return { p: serPlats(w) };
  },
  apply(w, d) {
    const o = d as { p?: number[] } | null;
    applyPlats(w, o?.p);
    syncMovers(w);
  },
};

function laneOf(m: Monkey): number {
  return m.y > 500 ? 0 : m.y > 380 ? 1 : 2;
}
