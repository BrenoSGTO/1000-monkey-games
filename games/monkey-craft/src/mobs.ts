import type { Game } from './game';
import { SOLID } from './data';
import { moveBody, newBody, bodiesOverlap } from './physics';
import { B, I, W, type Body, type Mob, type MobKind } from './types';

export const MOB_NAMES = ['a Capivara Zumbi', 'o Pombo Explosivo'];

export function makeMob(id: number, kind: MobKind, x: number, y: number): Mob {
  const body = kind === 0 ? newBody(x, y, 0.9, 0.72) : newBody(x, y, 0.55, 0.5, false);
  return {
    ...body,
    id,
    kind,
    hp: kind === 0 ? 32 : 12,
    maxHp: kind === 0 ? 32 : 12,
    face: 1,
    t: Math.random() * 10,
    hurtT: 0,
    atkCd: 0.8,
    fuse: 0,
    state: 0,
    wander: 0,
    wanderT: 0,
    tx: x,
    ty: y,
    seen: 0,
  };
}

export interface LivePlayer {
  id: string;
  b: Body;
}

function nearest(players: LivePlayer[], m: Mob, maxD: number): LivePlayer | null {
  let best: LivePlayer | null = null;
  let bd = maxD;
  for (const p of players) {
    const d = Math.hypot(p.b.x - m.x, p.b.y - p.b.h / 2 - (m.y - m.h / 2));
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export function updateMobs(g: Game, dt: number): void {
  const players = g.livePlayers();
  const world = g.world;
  const day = g.daylight();
  const dead: Mob[] = [];
  for (const m of g.mobs.values()) {
    m.t += dt;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.atkCd -= dt;
    const tgt = nearest(players, m, 30);

    if (m.kind === 0) {
      // ---------------- Capivara Zumbi
      let dir = 0;
      if (tgt) {
        const dx = tgt.b.x - m.x;
        dir = Math.abs(dx) < 0.5 ? 0 : Math.sign(dx);
        m.state = 1;
      } else {
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wander = [-1, 0, 1][Math.floor(Math.random() * 3)];
          m.wanderT = 1.5 + Math.random() * 3;
        }
        dir = m.wander;
        m.state = 0;
      }
      const speed = (tgt ? 2.7 : 1.1) * (m.inWater ? 0.5 : 1);
      if (m.hurtT <= 0.12) {
        const target = dir * speed;
        if (m.vx < target) m.vx = Math.min(target, m.vx + 22 * dt);
        else m.vx = Math.max(target, m.vx - 22 * dt);
      }
      if (dir !== 0) m.face = dir > 0 ? 1 : -1;
      m.vy = Math.min(m.inWater ? 3 : 28, m.vy + (m.inWater ? 12 : 36) * dt);
      if (m.onGround && dir !== 0 && m.hurtT <= 0.12) {
        const ax = Math.floor(m.x + dir * 0.75);
        const fy = Math.floor(m.y - 0.3);
        const wall = SOLID[world.get(ax, fy)] === 1;
        const above = SOLID[world.get(ax, fy - 1)] === 1 || SOLID[world.get(ax, fy - 2)] === 1;
        const climbTarget = tgt && tgt.b.y < m.y - 2.2 && Math.abs(tgt.b.x - m.x) < 2.5;
        if ((wall && !above) || climbTarget) m.vy = -11.6;
        else if (wall && above) m.wander = -m.wander || 1;
      }
      if (m.inWater && tgt && tgt.b.y < m.y) m.vy = Math.max(m.vy - 30 * dt, -4);
      moveBody(world, m, dt);
      if (m.onGround && Math.abs(m.vx) > 0.5) m.t += dt * 0.5;
      // contato
      if (m.atkCd <= 0) {
        for (const p of players) {
          if (bodiesOverlap(m, p.b, -0.05)) {
            const s = p.b.x >= m.x ? 1 : -1;
            g.damagePlayer(p.id, 12, s * 7, -6.5, MOB_NAMES[0]);
            m.atkCd = 1.15;
            break;
          }
        }
      }
      // derrete ao sol
      if (day > 0.6 && m.y - 1 < world.skyTop[Math.max(0, Math.min(W - 1, Math.floor(m.x)))]) {
        m.hp -= 4 * dt;
        if (Math.random() < dt * 6) g.puff(m.x, m.y - 0.6, '#9ad070', 1);
      }
    } else {
      // ---------------- Pombo Explosivo
      if (m.state === 0) {
        if (tgt) {
          const gx = tgt.b.x + Math.sin(m.t * 1.3 + m.id) * 3;
          const gy = tgt.b.y - tgt.b.h - 3.8 + Math.sin(m.t * 2.1) * 0.8;
          const dx = gx - m.x;
          const dy = gy - m.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = 4.4;
          m.vx += ((dx / d) * sp - m.vx) * Math.min(1, dt * 3);
          m.vy += ((dy / d) * sp - m.vy) * Math.min(1, dt * 3);
          if (Math.abs(tgt.b.x - m.x) < 7 && m.y < tgt.b.y - 1.5 && m.t % 4 < dt * 1.2 + 0.04) {
            m.state = 1;
            g.sfx('coo');
          }
          if (Math.random() < dt * 0.25) g.sfx('coo');
        } else {
          m.vx += (Math.sin(m.t * 0.7 + m.id) * 1.5 - m.vx) * dt;
          m.vy += (Math.sin(m.t * 1.1) * 0.8 - m.vy) * dt;
        }
        if (tgt && Math.hypot(tgt.b.x - m.x, tgt.b.y - tgt.b.h / 2 - m.y) < 6.5 && m.t > 2.5 && Math.random() < dt * 0.9) m.state = 1;
      } else {
        // mergulho
        if (tgt) {
          const dx = tgt.b.x - m.x;
          const dy = tgt.b.y - tgt.b.h * 0.5 - m.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = 8.6;
          m.vx += ((dx / d) * sp - m.vx) * Math.min(1, dt * 5);
          m.vy += ((dy / d) * sp - m.vy) * Math.min(1, dt * 5);
          if (d < 2.6) m.fuse += dt;
          if (d < 1.0 || m.fuse > 0.55) {
            g.explode(m.x, m.y - m.h / 2, 3.6, 38);
            dead.push(m);
            continue;
          }
        } else m.state = 0;
      }
      if (Math.abs(m.vx) > 0.2) m.face = m.vx > 0 ? 1 : -1;
      const ovx = m.vx;
      const ovy = m.vy;
      moveBody(world, m, dt);
      if (m.state === 1 && ((ovx !== 0 && m.vx === 0) || (ovy !== 0 && m.vy === 0)) && m.t > 0.4) {
        g.explode(m.x, m.y - m.h / 2, 3.6, 38);
        dead.push(m);
        continue;
      }
      // não deixa ficar preso no chão em modo hover
      if (m.onGround) m.vy = -2;
    }

    if (m.hp <= 0) dead.push(m);
    // despawn longe
    if (!nearest(players, m, 60) && players.length > 0) dead.push(m);
  }
  for (const m of dead) {
    if (!g.mobs.has(m.id)) continue;
    if (m.hp <= 0) g.killMob(m, g.lastHitBy.get(m.id) ?? g.myId());
    else g.mobs.delete(m.id);
  }
}

export function spawnTick(g: Game, dt: number): void {
  g.spawnT -= dt;
  if (g.spawnT > 0) return;
  g.spawnT = 2.2 + Math.random() * 1.8;
  const players = g.livePlayers();
  if (players.length === 0) return;
  const cap = 5 + players.length * 3;
  if (g.mobs.size >= cap) return;
  const world = g.world;
  const p = players[Math.floor(Math.random() * players.length)];
  const day = g.daylight();
  const night = day < 0.35;
  for (let attempt = 0; attempt < 10; attempt++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = Math.max(2, Math.min(W - 3, Math.floor(p.b.x + side * (14 + Math.random() * 12))));
    const py = Math.floor(p.b.y);
    for (let y = py - 12; y <= py + 12; y++) {
      if (y < 2) continue;
      if (SOLID[world.get(x, y)] || SOLID[world.get(x, y - 1)] || SOLID[world.get(x, y - 2)]) continue;
      if (!SOLID[world.get(x, y + 1)] || world.get(x, y) === B.WATER) continue;
      const open = y < world.skyTop[x];
      const i = y * W + x;
      const L = Math.max(world.blk[i], world.sky[i] * (night ? 0.2 : 1));
      if (L > 5) continue;
      if (players.some((q) => Math.hypot(q.b.x - x, q.b.y - y) < 12)) continue;
      if (open && !night) continue;
      const id = g.nextMobId++;
      if (open && night && Math.random() < 0.4) {
        const sy = y - 5;
        if (SOLID[world.get(x, sy)]) continue;
        g.mobs.set(id, makeMob(id, 1, x + 0.5, sy));
      } else {
        g.mobs.set(id, makeMob(id, 0, x + 0.5, y + 1));
      }
      return;
    }
  }
}

export function lootFor(kind: MobKind): [number, number][] {
  const out: [number, number][] = [];
  const r = Math.random();
  if (kind === 0) {
    if (r < 0.6) out.push([I.BANANA, 1 + Math.floor(Math.random() * 2)]);
    if (Math.random() < 0.35) out.push([B.COAL, 1 + Math.floor(Math.random() * 3)]);
    if (Math.random() < 0.12) out.push([B.TORCH, 2]);
    if (Math.random() < 0.15) out.push([I.STICK, 2]);
  } else {
    if (r < 0.65) out.push([I.BANANA, 1]);
    if (Math.random() < 0.35) out.push([B.TORCH, 3]);
    if (Math.random() < 0.2) out.push([B.COAL, 2]);
  }
  return out;
}
