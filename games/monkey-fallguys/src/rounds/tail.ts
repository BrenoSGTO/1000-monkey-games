import { clearInput, nearest, rand } from '../bots';
import { addPlat } from '../physics';
import { GY, type Monkey, type World } from '../types';
import { clamp } from '../util';
import { climbStep } from '../bots';
import type { RoundCtx, RoundModule } from './api';

export const tail: RoundModule = {
  kind: 'tail',
  variants: 1,
  fill: true,
  minQual: 2,
  info() {
    return {
      title: 'PEGA-RABO DE MACACO',
      blurb: 'Quem estiver com o rabo de banana quando o tempo acabar classifica! Roube o rabo dos outros!',
      tip: 'Segure AGARRAR (E) encostado num macaco pra roubar o rabo. Mergulho (S) derruba geral!',
    };
  },
  build(w, n) {
    const W = clamp(900 + n * 60, 1100, 1800);
    const half = W / 2;
    w.killY = 1400;
    w.limit = 45;
    w.theme = 4;
    addPlat(w, -half - 120, GY, W + 240, 420, 'solid', { col: 0 });
    addPlat(w, -half - 120, -600, 120, 1400, 'solid', { col: 4 });
    addPlat(w, half, -600, 120, 1400, 'solid', { col: 4 });
    addPlat(w, -half * 0.62 - 110, 430, 220, 24, 'oneway', { col: 1 });
    addPlat(w, half * 0.62 - 110, 430, 220, 24, 'oneway', { col: 2 });
    addPlat(w, -130, 300, 260, 24, 'oneway', { col: 3 });
    w.bounds = { x0: -half, x1: half, y0: 0, y1: 720 };
  },
  spawn(w, m, idx, n, rng) {
    const half = (w.bounds.x1 - w.bounds.x0) / 2;
    m.x = -half + 90 + ((idx + rng() * 0.6) / Math.max(1, n)) * (half * 2 - 180);
    m.y = GY;
    m.grounded = true;
    m.ground = 0;
    m.face = m.x > 0 ? -1 : 1;
    m.tail = idx < w.tailTarget;
  },
  update(w, ctx) {
    void w;
    void ctx;
    // all rules (stealing) live in the generic grab handling; round ends on timer
  },
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number) {
    const ai = m.ai;
    const inp = m.input;
    ai.think -= dt;
    ai.jumpCd -= dt;
    clearInput(m);
    if (m.flopT > 0 || m.heldBy >= 0 || m.status !== 'alive') {
      inp.mx = 0;
      return;
    }
    if (ai.think > 0) return;
    ai.think = 0.07 + rand(m) * 0.06;
    const half = (w.bounds.x1 - w.bounds.x0) / 2;
    const comp = ctx.comp();
    let mx = 0;
    if (m.tail) {
      const foe = nearest(m, comp, (o) => !o.tail && o.status === 'alive' && !o.done && o.flopT <= 0);
      if (foe) {
        const dx = m.x - foe.x;
        const dist = Math.hypot(dx, foe.y - m.y);
        if (dist < 420) {
          mx = dx >= 0 ? 1 : -1;
          // cornered: jump over / up to platforms
          if (Math.abs(m.x) > half - 120 && Math.sign(dx) === Math.sign(m.x)) mx = -Math.sign(m.x);
          if (dist < 160 && m.grounded && ai.jumpCd <= 0 && rand(m) < 0.5 + m.skill * 0.3) {
            inp.jump = true;
            ai.jumpCd = 0.45;
          }
          if (dist < 110 && m.skill > 0.7 && rand(m) < 0.1 && m.grounded) inp.dive = true;
        } else {
          mx = 0;
        }
      } else mx = 0;
    } else {
      const prey = nearest(m, comp, (o) => o.tail && o.tailImm <= 0 && o.status === 'alive' && !o.done);
      const fallback = prey ?? nearest(m, comp, (o) => o.tail && o.status === 'alive' && !o.done);
      if (fallback) {
        const dx = fallback.x - m.x;
        const dy = fallback.y - m.y;
        const dist = Math.hypot(dx, dy);
        const st = climbStep(w, m, fallback.x, fallback.y);
        mx = st.mx;
        if (st.jump && ai.jumpCd <= 0) {
          inp.jump = true;
          ai.jumpCd = 0.4;
        }
        if (Math.abs(dy) < 40 && Math.abs(dx) < 120) mx = dx > 0 ? 1 : -1;
        if (Math.abs(dy) < 40 && Math.abs(dx) < 62 && dx * m.face > -10) {
          if (rand(m) < 0.35 + m.skill * 0.55) inp.grab = true;
        } else if (Math.abs(dy) < 50 && dist > 120 && dist < 230 && m.grounded && m.diveCd <= 0 && rand(m) < 0.1 * m.skill) {
          inp.dive = true;
          m.face = dx > 0 ? 1 : -1;
        }
      }
    }
    inp.mx = mx;
  },
  rank(w, ms) {
    return ms.slice().sort((a, b) => Number(b.tail) - Number(a.tail));
  },
  ser() {
    return null;
  },
  apply() {
    /* tails live on monkey flags */
  },
};
