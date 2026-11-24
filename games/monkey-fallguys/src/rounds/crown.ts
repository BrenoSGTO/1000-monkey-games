import { climbStep, clearInput, nearest, rand } from '../bots';
import { addHazard, addPlat } from '../physics';
import { GY, type Monkey, type World } from '../types';
import { r1 } from '../util';
import type { RoundCtx, RoundModule } from './api';

export const CROWN_WIN = 12;

export const crown: RoundModule = {
  kind: 'crown',
  variants: 1,
  fill: false,
  minQual: 1,
  info() {
    return {
      title: 'FINAL: COROA DA BANANA',
      blurb: `Pegue a Coroa Dourada e segure por ${CROWN_WIN} segundos! Roube dos outros, derrube, enlouqueça!`,
      tip: 'Agarre (E) quem estiver com a coroa. Martelo no meio: cuidado com a cabeça!',
    };
  },
  build(w) {
    const hf = 700;
    w.killY = 1600;
    w.limit = 75;
    w.theme = 6;
    w.bounds = { x0: -hf, x1: hf, y0: -100, y1: 720 };
    addPlat(w, -hf - 120, GY, hf * 2 + 240, 420, 'solid', { col: 0 });
    addPlat(w, -hf - 120, -600, 120, 1400, 'solid', { col: 4 });
    addPlat(w, hf, -600, 120, 1400, 'solid', { col: 4 });
    addPlat(w, -590, 450, 250, 24, 'oneway', { col: 1 });
    addPlat(w, 340, 450, 250, 24, 'oneway', { col: 2 });
    addPlat(w, -350, 340, 200, 24, 'oneway', { col: 3 });
    addPlat(w, 150, 340, 200, 24, 'oneway', { col: 1 });
    addPlat(w, -120, 230, 240, 24, 'oneway', { col: 2 });
    addPlat(w, -60, 450, 120, 24, 'oneway', {
      col: 3,
      mv: { cx: -60, cy: 450, ax: 150, ay: 0, per: 4.2, ph: 0 },
    });
    addHazard(w, { kind: 'hammer', x: 0, y: 10, len: 300, amp: 1.15, per: 3.4, ph: 0, r: 34 });
    w.crown = { x: 0, y: 150, vx: 0, vy: 0, holder: -1, cd: 0, lastHolder: -1 };
  },
  spawn(w, m, idx, n) {
    const span = 1200;
    m.x = -span / 2 + ((idx + 0.5) / Math.max(1, n)) * span;
    m.y = GY;
    m.grounded = true;
    m.ground = 0;
    m.face = m.x > 0 ? -1 : 1;
  },
  update(w, ctx, dt) {
    const c = w.crown!;
    const comp = ctx.comp();
    if (c.cd > 0) c.cd -= dt;
    let holder: Monkey | null = null;
    for (const m of comp) if (m.crown) holder = m;
    if (!holder) c.holder = -1;

    if (c.holder < 0) {
      const py = c.y;
      c.vy += 1700 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 1 - 0.8 * dt;
      for (const p of w.plats) {
        if (p.kind !== 'solid' && p.kind !== 'oneway') continue;
        if (c.vy >= 0 && c.x > p.x && c.x < p.x + p.w && c.y + 12 >= p.y && py + 12 <= p.y + 6) {
          c.y = p.y - 12;
          c.vy = c.vy > 200 ? -c.vy * 0.35 : 0;
          c.vx *= 0.8;
        }
      }
      if (c.x < w.bounds.x0 + 20) {
        c.x = w.bounds.x0 + 20;
        c.vx = Math.abs(c.vx);
      } else if (c.x > w.bounds.x1 - 20) {
        c.x = w.bounds.x1 - 20;
        c.vx = -Math.abs(c.vx);
      }
      for (const m of comp) {
        if (m.status !== 'alive' || m.flopT > 0.3 || m.heldBy >= 0 || m.respawnT > 0) continue;
        if (m.id === c.lastHolder && c.cd > 0) continue;
        if (Math.abs(m.x - c.x) < 30 && Math.abs(m.y - 28 - c.y) < 46) {
          m.crown = true;
          c.holder = m.id;
          ctx.emit({ k: 'txt', x: m.x, y: m.y - 80, s: 'COROA!', c: '#fde047' });
          ctx.emit({ k: 'sfx', s: 'crown', id: m.id });
          ctx.emit({ k: 'conf', x: m.x, y: m.y - 60, n: 10 });
          break;
        }
      }
    } else {
      const h = ctx.all[c.holder];
      if (h) {
        c.x = h.x;
        c.y = h.y - 56;
        c.vx = 0;
        c.vy = 0;
        h.score += dt;
        if (h.score >= CROWN_WIN && w.winTeam < 0) {
          w.winTeam = h.id;
          ctx.qualify(h);
          ctx.finish();
        }
      }
    }
  },
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number) {
    const ai = m.ai;
    const inp = m.input;
    const c = w.crown!;
    ai.think -= dt;
    ai.jumpCd -= dt;
    clearInput(m);
    if (m.flopT > 0 || m.heldBy >= 0 || m.status !== 'alive') {
      inp.mx = 0;
      return;
    }
    if (ai.think > 0) return;
    ai.think = 0.07 + rand(m) * 0.06;
    let mx = 0;
    const comp = ctx.comp();
    if (m.crown) {
      // run away from the closest rival, and hop around
      const foe = nearest(m, comp, (o) => o.status === 'alive' && !o.crown);
      if (foe) {
        const dx = m.x - foe.x;
        mx = dx >= 0 ? 1 : -1;
        if (Math.abs(m.x) > 620) mx = -Math.sign(m.x);
        if (Math.hypot(dx, foe.y - m.y) < 150 && m.grounded && ai.jumpCd <= 0) {
          inp.jump = true;
          ai.jumpCd = 0.5;
        }
      }
    } else {
      let gx = c.x;
      let gy = c.y + 30;
      if (c.holder >= 0) {
        const h = ctx.all[c.holder];
        gx = h.x;
        gy = h.y;
      }
      const st = climbStep(w, m, gx, gy);
      mx = st.mx;
      if (st.jump && ai.jumpCd <= 0) {
        inp.jump = true;
        ai.jumpCd = 0.45;
      }
      if (c.holder >= 0) {
        const h = ctx.all[c.holder];
        const dx = h.x - m.x;
        if (Math.abs(h.y - m.y) < 40 && Math.abs(dx) < 62 && dx * m.face > -10) {
          if (rand(m) < 0.4 + m.skill * 0.5) inp.grab = true;
        } else if (Math.abs(h.y - m.y) < 50 && Math.abs(dx) > 120 && Math.abs(dx) < 240 && m.grounded && rand(m) < 0.08 * m.skill) {
          inp.dive = true;
          m.face = dx > 0 ? 1 : -1;
        }
      }
    }
    inp.mx = r1(mx);
  },
  rank(w, ms) {
    return ms.slice().sort((a, b) => b.score - a.score);
  },
  ser(w) {
    const c = w.crown!;
    return { c: [Math.round(c.x), Math.round(c.y), c.holder] };
  },
  apply(w, d) {
    const o = d as { c: number[] } | null;
    if (!o || !w.crown) return;
    w.crown.x = o.c[0];
    w.crown.y = o.c[1];
    w.crown.holder = o.c[2];
  },
};
