import { clearInput, rand } from '../bots';
import { knock, plankSurface, releaseHolds } from '../physics';
import type { Monkey, World } from '../types';
import { clamp, r1 } from '../util';
import type { RoundCtx, RoundModule } from './api';

const MAX_ANG = 0.42;

export const seesaw: RoundModule = {
  kind: 'seesaw',
  variants: 1,
  fill: true,
  minQual: 2,
  info() {
    return {
      title: 'GANGORRA DA BANANADA',
      blurb: 'Equilibre na gangorra gigante enquanto cocos caem do céu! Quem escorregar vira açaí!',
      tip: 'Ande pro lado de cima pra equilibrar, pule os cocos e empurre os rivais (mergulho!).',
    };
  },
  build(w, n) {
    const L = clamp(520 + n * 70, 820, 1500);
    w.plank = { px: 0, py: 470, len: L, ang: 0, omega: 0 };
    w.killY = 720;
    w.limit = 70;
    w.theme = 3;
    w.tm[0] = 1.5;
    w.bounds = { x0: -L / 2 - 140, x1: L / 2 + 140, y0: -120, y1: 780 };
  },
  spawn(w, m, idx, n, rng) {
    const L = w.plank!.len;
    m.x = (rng() - 0.5) * L * 0.7;
    m.y = 150 - rng() * 220;
    m.vy = 0;
    m.grounded = false;
    m.face = rng() < 0.5 ? 1 : -1;
  },
  update(w, ctx, dt) {
    const pk = w.plank!;
    const comp = ctx.comp();
    // torque from riders
    let torque = 0;
    for (const m of comp) {
      if (m.status !== 'alive') continue;
      if (m.grounded && m.ground === -2) torque += m.x - pk.px;
      if (m.y > w.killY) {
        releaseHolds(ctx.all, m);
        ctx.emit({ k: 'splash', x: m.x, y: w.killY - 40 });
        ctx.eliminate(m, 'ESCORREGOU PRO AÇAÍ!');
      }
    }
    // coconuts
    w.tm[0] -= dt;
    if (w.tm[0] <= 0 && w.cocos.length < 9) {
      w.tm[0] = Math.max(0.55, 1.35 - w.t * 0.014);
      w.cocos.push({
        id: w.cocoSeq++,
        x: (Math.random() - 0.5) * pk.len * 0.85,
        y: -90,
        vx: (Math.random() - 0.5) * 80,
        vy: 0,
        r: 26,
        rot: 0,
      });
      ctx.emit({ k: 'sfx', s: 'whistle' });
    }
    for (const c of w.cocos) {
      const py = c.y;
      c.vy += 1700 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += (c.vx / c.r) * dt;
      if (Math.abs(c.x - pk.px) <= pk.len / 2) {
        const s = plankSurface(pk, c.x) - c.r;
        if (c.vy >= 0 && c.y >= s && py <= s + 26) {
          const impact = c.vy;
          c.y = s;
          c.vy = impact > 220 ? -impact * 0.36 : 0;
          if (impact > 220) {
            pk.omega += (c.x - pk.px) * impact * 1.5e-6;
            ctx.emit({ k: 'dust', x: c.x, y: c.y + c.r, n: 3 });
            ctx.emit({ k: 'sfx', s: 'thud' });
          }
          torque += (c.x - pk.px) * 0.6;
        }
        if (Math.abs(c.y - s) < 3) c.vx += 2300 * Math.sin(pk.ang) * 1.1 * dt;
      }
      for (const m of comp) {
        if (m.status !== 'alive' || m.respawnT > 0 || m.heldBy >= 0) continue;
        const dx = m.x - c.x;
        const dy = m.y - 24 - c.y;
        const rr = c.r + 16;
        if (dx * dx + dy * dy < rr * rr) {
          const sp = Math.hypot(c.vx, c.vy);
          if (sp > 210 && m.flopT <= 0 && m.invT <= 0) {
            knock(w, ctx.all, m, Math.sign(dx || 1) * 320 + c.vx * 0.4, -430, 1.1, ctx.emit, 'COCADA!');
            ctx.emit({ k: 'shake', n: 6 });
          } else {
            m.x += Math.sign(dx || 1) * 2;
            c.vx -= Math.sign(dx || 1) * 30;
          }
        }
      }
    }
    w.cocos = w.cocos.filter((c) => c.y < w.killY + 160);

    const alpha = torque * 1.15e-4 - pk.omega * 1.4 - pk.ang * 0.35;
    pk.omega += alpha * dt;
    pk.ang += pk.omega * dt;
    if (pk.ang > MAX_ANG) {
      pk.ang = MAX_ANG;
      pk.omega *= -0.25;
    } else if (pk.ang < -MAX_ANG) {
      pk.ang = -MAX_ANG;
      pk.omega *= -0.25;
    }

    let alive = 0;
    for (const m of comp) if (m.status === 'alive') alive++;
    if (alive <= ctx.target) ctx.finish();
  },
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number) {
    const ai = m.ai;
    const inp = m.input;
    const pk = w.plank!;
    ai.think -= dt;
    ai.jumpCd -= dt;
    clearInput(m);
    if (m.flopT > 0 || m.status !== 'alive') {
      inp.mx = 0;
      return;
    }
    if (ai.think > 0) return;
    ai.think = 0.08 + rand(m) * 0.06;
    const half = pk.len / 2;
    let mx = 0;
    // counter the slide
    if (Math.abs(pk.ang) > 0.04) mx = pk.ang > 0 ? -1 : 1;
    else {
      if (Math.abs(ai.tx - m.x) < 20 || ai.mode === 0) {
        ai.tx = (rand(m) - 0.5) * half * 0.8;
        ai.mode = 1;
      }
      mx = ai.tx > m.x ? 1 : -1;
    }
    // stay away from edges
    if (m.x > half - 110) mx = -1;
    else if (m.x < -half + 110) mx = 1;
    // coconut dodge / jump
    for (const c of w.cocos) {
      const dx = c.x - m.x;
      if (Math.abs(dx) < 90 && c.y < m.y - 40 && c.y > m.y - 330 && c.vy > 0) {
        mx = dx > 0 ? -1 : 1;
      } else if (Math.abs(dx) < 120 && Math.abs(c.y - (m.y - 24)) < 60 && m.grounded && ai.jumpCd <= 0) {
        if (rand(m) < m.skill + 0.1) {
          inp.jump = true;
          ai.jumpCd = 0.5;
        }
      }
    }
    // being airborne above the plank: steer to the center
    if (!m.grounded) mx = m.x > 0 ? -1 : 1;
    // mean: shove neighbours
    if (m.grounded && ai.jumpCd <= 0 && rand(m) < 0.03 * (1.2 - m.skill)) inp.dive = true;
    inp.mx = r1(mx);
  },
  rank(w, ms) {
    return ms.slice().sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  },
  ser(w) {
    const pk = w.plank!;
    return { a: Math.round(pk.ang * 1000) / 1000, o: Math.round(pk.omega * 1000) / 1000, c: w.cocos.map((c) => [c.id, Math.round(c.x), Math.round(c.y), Math.round(c.rot * 10) / 10, Math.round(c.vx)]) };
  },
  apply(w, d) {
    const o = d as { a: number; o: number; c: number[][] } | null;
    if (!o || !w.plank) return;
    w.plank.ang = o.a;
    w.plank.omega = o.o;
    const old = new Map(w.cocos.map((c) => [c.id, c]));
    w.cocos = o.c.map(([id, x, y, rot, vx]) => {
      const prev = old.get(id);
      if (prev) {
        prev.x += (x - prev.x) * 0.6;
        prev.y += (y - prev.y) * 0.6;
        prev.rot = rot;
        prev.vx = vx;
        return prev;
      }
      return { id, x, y, vx, vy: 0, r: 26, rot };
    });
  },
};
