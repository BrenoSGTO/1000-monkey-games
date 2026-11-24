import { clearInput, pitAhead, rand } from '../bots';
import { addPlat, releaseHolds } from '../physics';
import type { Monkey, World } from '../types';
import { clamp } from '../util';
import type { RoundCtx, RoundModule } from './api';
import { applyPlats, serPlats } from './common';

const PITCH = 104;
const LAYER_Y = [280, 400, 520];

export const hex: RoundModule = {
  kind: 'hex',
  variants: 1,
  fill: true,
  minQual: 2,
  info() {
    return {
      title: 'CHÃO QUE SOME',
      blurb: 'A gelatina de açaí desmancha sob seus pés! Fique de pé até sobrar só quem classifica!',
      tip: 'Não pare! Pule entre as gelatinas e desça de andar antes de cair no açaí.',
    };
  },
  build(w, n) {
    const per = clamp(10 + Math.ceil(n / 2), 12, 18);
    const x0 = -(per * PITCH) / 2;
    w.killY = 660;
    w.limit = 75;
    w.theme = 2;
    for (let L = 0; L < 3; L++) {
      const off = L % 2 ? PITCH / 2 : 0;
      const cnt = per - (L % 2 ? 1 : 0);
      for (let i = 0; i < cnt; i++) {
        addPlat(w, x0 + off + i * PITCH, LAYER_Y[L], 96, 24, 'tile', { col: (i + L) % 3, layer: L });
      }
    }
    w.bounds = { x0: x0 - 80, x1: -x0 + 80, y0: -60, y1: 720 };
  },
  spawn(w, m, idx, n, rng) {
    const span = w.bounds.x1 - w.bounds.x0 - 260;
    m.x = w.bounds.x0 + 130 + rng() * span;
    m.y = 60 - rng() * 220;
    m.vy = 0;
    m.grounded = false;
    m.face = rng() < 0.5 ? 1 : -1;
  },
  update(w, ctx, dt) {
    const comp = ctx.comp();
    for (const m of comp) {
      if (m.status !== 'alive') continue;
      if (m.grounded && m.ground >= 0) {
        const p = w.plats[m.ground];
        if (p.kind === 'tile' && p.active && p.t1 < 0) {
          p.t1 = p.layer === 0 ? 0.75 : 0.6;
          p.wob = 0.3;
          ctx.emit({ k: 'sfx', s: 'tile', id: m.id });
        }
      }
      if (m.y > w.killY) {
        releaseHolds(ctx.all, m);
        ctx.emit({ k: 'splash', x: m.x, y: w.killY - 20 });
        ctx.eliminate(m, 'GLUB! VIROU AÇAÍ!');
      }
    }
    for (const p of w.plats) {
      if (p.kind !== 'tile' || !p.active) continue;
      if (p.t1 >= 0) {
        p.t1 -= dt;
        if (p.t1 <= 0) {
          p.active = false;
          p.t1 = -1;
          ctx.emit({ k: 'tilegone', x: p.x + p.w / 2, y: p.y });
        }
      }
    }
    // sudden death: tiles start collapsing by themselves
    if (w.t > 28) {
      w.tm[1] -= dt;
      if (w.tm[1] <= 0) {
        w.tm[1] = 0.3;
        const live = w.plats.filter((p) => p.kind === 'tile' && p.active && p.t1 < 0);
        if (live.length) {
          const p = live[Math.floor(Math.random() * live.length)];
          p.t1 = 0.45;
        }
      }
    }
    let alive = 0;
    for (const m of comp) if (m.status === 'alive') alive++;
    if (alive <= ctx.target) ctx.finish();
  },
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number) {
    const ai = m.ai;
    const inp = m.input;
    ai.think -= dt;
    ai.jumpCd -= dt;
    clearInput(m);
    if (m.flopT > 0 || m.status !== 'alive') {
      inp.mx = 0;
      return;
    }
    if (ai.think > 0) return;
    ai.think = 0.1 + rand(m) * 0.08;
    // my tile state
    let myTile = m.grounded && m.ground >= 0 ? w.plats[m.ground] : null;
    if (myTile && myTile.kind !== 'tile') myTile = null;
    const stepped = myTile ? myTile.t1 >= 0 : false;
    if (!m.grounded) {
      // steer towards remaining tiles while falling
      if (ai.mode === 0) ai.tx = m.x;
      inp.mx = Math.abs(ai.tx - m.x) < 16 ? 0 : ai.tx > m.x ? 1 : -1;
      return;
    }
    if (stepped || Math.abs(ai.tx - m.x) < 14 || ai.mode === 0 || rand(m) < 0.05) {
      // pick a fresh tile: same layer or lower, intact, near
      let best: { x: number; sc: number } | null = null;
      for (const p of w.plats) {
        if (p.kind !== 'tile' || !p.active || p.t1 >= 0) continue;
        if (p.y < m.y - 20) continue;
        if (p.y > m.y + 150) continue;
        const cx = p.x + p.w / 2;
        const dx = Math.abs(cx - m.x);
        if (dx > 360) continue;
        const sc = dx * (0.7 + rand(m) * 0.8) + (p.y - m.y) * 0.9 + (m.skill < 0.6 ? rand(m) * 120 : 0);
        if (!best || sc < best.sc) best = { x: cx, sc };
      }
      if (best) {
        ai.tx = best.x;
        ai.mode = 1;
      } else {
        ai.tx = m.x + (rand(m) - 0.5) * 300;
        ai.mode = 1;
      }
    }
    const d = ai.tx - m.x;
    inp.mx = Math.abs(d) < 10 ? 0 : d > 0 ? 1 : -1;
    // hop over holes
    if (inp.mx !== 0 && pitAhead(w, m, inp.mx, 60) && ai.jumpCd <= 0) {
      inp.jump = true;
      ai.jumpCd = 0.5;
    } else if (rand(m) < 0.03 && ai.jumpCd <= 0) {
      inp.jump = true;
      ai.jumpCd = 0.6;
    }
  },
  rank(w, ms) {
    return ms.slice().sort((a, b) => a.y - b.y);
  },
  ser(w) {
    return { p: serPlats(w) };
  },
  apply(w, d) {
    applyPlats(w, (d as { p?: number[] } | null)?.p);
  },
};
