import { clearInput, rand } from '../bots';
import { addPlat } from '../physics';
import { GY, type Monkey, type World } from '../types';
import { clamp, r1 } from '../util';
import type { RoundCtx, RoundModule } from './api';

const BALL_R = 34;
const GOAL_H = 230;
const WIN_GOALS = 3;

function half(w: World): number {
  return (w.bounds.x1 - w.bounds.x0) / 2;
}

function teamSpawn(w: World, m: Monkey, slot: number, n: number): void {
  const hf = half(w);
  const dir = m.team === 0 ? -1 : 1;
  const row = Math.floor(slot / 2);
  m.x = dir * (hf * 0.25 + (row % 6) * 62 + (slot % 2) * 30);
  m.y = GY;
  m.vx = 0;
  m.vy = 0;
  m.grounded = true;
  m.ground = 0;
  m.flopT = 0;
  m.diveT = 0;
  m.face = m.team === 0 ? 1 : -1;
  void n;
}

function resetKickoff(w: World, ctx: RoundCtx): void {
  const b = w.ball!;
  b.x = 0;
  b.y = 260;
  b.vx = 0;
  b.vy = 0;
  const slots = [0, 0];
  for (const m of ctx.comp()) {
    if (m.status !== 'alive' || m.team < 0) continue;
    teamSpawn(w, m, slots[m.team]++, w.n);
    m.invT = 0.3;
  }
}

function ballVsRect(b: NonNullable<World['ball']>, px: number, py: number, pw: number, ph: number): boolean {
  const cx = clamp(b.x, px, px + pw);
  const cy = clamp(b.y, py, py + ph);
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= b.r * b.r) return false;
  let nx: number;
  let ny: number;
  let d: number;
  if (d2 < 1e-6) {
    // center inside: push out along the shortest axis
    const l = b.x - px;
    const r = px + pw - b.x;
    const t = b.y - py;
    const bt = py + ph - b.y;
    const m = Math.min(l, r, t, bt);
    if (m === t) {
      nx = 0;
      ny = -1;
    } else if (m === bt) {
      nx = 0;
      ny = 1;
    } else if (m === l) {
      nx = -1;
      ny = 0;
    } else {
      nx = 1;
      ny = 0;
    }
    d = -m;
  } else {
    d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
  }
  b.x += nx * (b.r - d);
  b.y += ny * (b.r - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const rest = Math.abs(vn) > 260 ? 0.6 : 0;
    b.vx -= (1 + rest) * vn * nx;
    b.vy -= (1 + rest) * vn * ny;
    if (ny < -0.7) b.vx *= 1 - 0.01;
  }
  return ny < -0.7;
}

function decide(w: World, ctx: RoundCtx, team: number): void {
  if (w.winTeam >= 0) return;
  w.winTeam = team;
  for (const m of ctx.comp()) {
    if (m.status === 'alive' && m.team === team) ctx.qualify(m);
  }
  ctx.finish();
}

export const soccer: RoundModule = {
  kind: 'soccer',
  variants: 1,
  fill: false,
  minQual: 1,
  info() {
    return {
      title: 'FUTEBOL DE COCO',
      blurb: 'Dois times, um coco gigante! Marque 3 gols antes da torcida cansar. O time perdedor VAI PRA CASA!',
      tip: 'Chute o coco batendo nele. Mergulho (S) dá um chutão! Empate = gol de ouro.',
    };
  },
  build(w, n) {
    const W = clamp(900 + n * 55, 1100, 1700);
    const hf = W / 2;
    w.killY = 1600;
    w.limit = 70;
    w.theme = 5;
    w.bounds = { x0: -hf, x1: hf, y0: -200, y1: 720 };
    addPlat(w, -hf - 200, GY, W + 400, 420, 'solid', { col: 0 });
    // goal structures: crossbar block + back wall
    addPlat(w, hf, -500, 110, 500 + GY - GOAL_H, 'solid', { col: 5 });
    addPlat(w, hf + 110, -500, 70, 1100, 'solid', { col: 4 });
    addPlat(w, -hf - 110, -500, 110, 500 + GY - GOAL_H, 'solid', { col: 5 });
    addPlat(w, -hf - 180, -500, 70, 1100, 'solid', { col: 4 });
    addPlat(w, -hf - 200, -560, W + 400, 70, 'solid', { col: 4 });
    // floating jelly platforms for acrobatics
    addPlat(w, -140, 410, 280, 24, 'oneway', { col: 2 });
    w.ball = { x: 0, y: 260, vx: 0, vy: 0, r: BALL_R, rot: 0 };
    w.score = [0, 0];
  },
  spawn(w, m, idx, n) {
    m.team = idx % 2;
    teamSpawn(w, m, Math.floor(idx / 2) * 2 + (idx % 2), n);
  },
  update(w, ctx, dt) {
    const b = w.ball!;
    const hf = half(w);
    const comp = ctx.comp();

    if (w.tm[0] > 0) {
      w.tm[0] -= dt;
      if (w.tm[0] <= 0) resetKickoff(w, ctx);
    }

    // ball physics
    b.vy += 1700 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= 1 - 0.12 * dt;
    let onGround = false;
    for (let it = 0; it < 2; it++) {
      for (const p of w.plats) {
        if (p.kind === 'solid') {
          if (ballVsRect(b, p.x, p.y, p.w, p.h)) onGround = true;
        } else if (p.kind === 'oneway' && b.vy > 0 && b.y + b.r > p.y && b.y + b.r < p.y + 28 && b.x > p.x && b.x < p.x + p.w) {
          b.y = p.y - b.r;
          b.vy = -b.vy * 0.5;
          onGround = true;
        }
      }
    }
    if (onGround) b.vx *= 1 - 0.35 * dt;
    b.rot += (b.vx / b.r) * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 1500) {
      b.vx *= 1500 / sp;
      b.vy *= 1500 / sp;
    }

    // monkeys kick the ball
    for (const m of comp) {
      if (m.status !== 'alive' || m.respawnT > 0 || m.heldBy >= 0) continue;
      const dx = b.x - m.x;
      const dy = b.y - (m.y - 24);
      const rr = b.r + 18;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d;
      const ny = dy / d;
      b.x += nx * (rr - d);
      b.y += ny * (rr - d);
      const rv = (b.vx - m.vx) * nx + (b.vy - m.vy) * ny;
      const closing = Math.max(0, -rv);
      const power = m.diveT > 0 ? 1.75 : m.flopT > 0 ? 0.5 : 1.15;
      const kick = closing * 0.9 * power + (m.diveT > 0 ? 420 : 170);
      b.vx += nx * kick;
      b.vy += ny * kick * 0.7 - (ny > -0.3 ? 80 : 0);
      m.vx -= nx * kick * 0.06;
      if (kick > 300) {
        ctx.emit({ k: 'sfx', s: 'kick', id: m.id });
        ctx.emit({ k: 'puff', x: b.x - nx * b.r, y: b.y - ny * b.r, n: 3 });
      }
    }

    // goals
    if (w.tm[0] <= 0) {
      let scorer = -1;
      if (b.x > hf + 6 && b.y > GY - GOAL_H) scorer = 0;
      else if (b.x < -hf - 6 && b.y > GY - GOAL_H) scorer = 1;
      if (scorer >= 0) {
        w.score[scorer]++;
        w.tm[0] = 2.6;
        ctx.emit({ k: 'goal', n: scorer, x: b.x, y: b.y });
        for (const m of comp) {
          if (m.team === scorer && m.status === 'alive') m.flopT = 0;
        }
        const win = w.golden || w.score[scorer] >= WIN_GOALS;
        if (win) decide(w, ctx, scorer);
      }
    }
    // stuck ball safeguard
    if (b.y > GY + 40 || Math.abs(b.x) > hf + 260) {
      b.x = 0;
      b.y = 200;
      b.vx = 0;
      b.vy = 0;
    }
    // tiebreak when time is up
    if (w.timeLeft <= 0 && !w.golden && w.winTeam < 0) {
      if (w.score[0] !== w.score[1]) decide(w, ctx, w.score[0] > w.score[1] ? 0 : 1);
      else {
        w.golden = true;
        ctx.emit({ k: 'big', s: 'GOL DE OURO!', c: '#facc15' });
      }
    }
  },
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number) {
    const ai = m.ai;
    const inp = m.input;
    const b = w.ball!;
    ai.think -= dt;
    ai.jumpCd -= dt;
    clearInput(m);
    if (m.flopT > 0 || m.heldBy >= 0 || m.status !== 'alive' || m.done) {
      inp.mx = 0;
      return;
    }
    if (ai.think > 0) return;
    ai.think = 0.06 + rand(m) * 0.06;
    const hf = half(w);
    const dir = m.team === 0 ? 1 : -1; // attacking direction
    // am I the closest teammate to the ball?
    let myD = Math.abs(b.x - m.x);
    let closer = true;
    for (const o of ctx.comp()) {
      if (o === m || o.team !== m.team || o.status !== 'alive') continue;
      if (Math.abs(b.x - o.x) < myD - 20) closer = false;
    }
    let mx = 0;
    if (closer || myD < 220) {
      // get behind the ball, then push through it
      const behind = (m.x - b.x) * dir < -18;
      if (behind || Math.abs(m.y - 24 - b.y) > 120) {
        mx = dir;
        // dive or jump at close range
        if (Math.abs(b.x - m.x) < 120 && Math.abs(b.y - (m.y - 24)) < 70) {
          if (m.diveCd <= 0 && rand(m) < 0.25 * m.skill + 0.05) {
            inp.dive = true;
          }
        }
        if (b.y < m.y - 90 && Math.abs(b.x - m.x) < 90 && ai.jumpCd <= 0 && m.grounded) {
          inp.jump = true;
          ai.jumpCd = 0.6;
        }
      } else {
        mx = -dir; // circle round the ball
        if (Math.abs(b.x - m.x) < 60 && ai.jumpCd <= 0 && m.grounded) {
          inp.jump = true;
          ai.jumpCd = 0.7;
        }
      }
      myD = 0;
    } else {
      // defend: stand between the ball and our goal
      const ownGoal = -dir * hf;
      const tx = ownGoal + (b.x - ownGoal) * 0.42;
      mx = Math.abs(tx - m.x) < 30 ? 0 : tx > m.x ? 1 : -1;
    }
    inp.mx = r1(mx);
  },
  rank(w, ms) {
    return ms.slice().sort((a, b) => b.score - a.score);
  },
  ser(w) {
    const b = w.ball!;
    return { b: [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), r1(b.rot)], s: w.score, g: w.tm[0] > 0 ? 1 : 0, gd: w.golden ? 1 : 0, wt: w.winTeam };
  },
  apply(w, d) {
    const o = d as { b: number[]; s: [number, number]; g: number; gd: number; wt: number } | null;
    if (!o || !w.ball) return;
    const b = w.ball;
    const [x, y, vx, vy, rot] = o.b;
    if (Math.hypot(x - b.x, y - b.y) > 200) {
      b.x = x;
      b.y = y;
    } else {
      b.x += (x - b.x) * 0.6;
      b.y += (y - b.y) * 0.6;
    }
    b.vx = vx;
    b.vy = vy;
    b.rot = rot;
    w.score = o.s;
    w.tm[0] = o.g;
    w.golden = !!o.gd;
    w.winTeam = o.wt;
  },
};
