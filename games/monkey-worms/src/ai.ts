import type { World } from './sim';
import type { Difficulty, WeaponId, Worm, WormInput } from './types';

export interface BotHost {
  world: World;
  worm: Worm;
  ammo(id: WeaponId): number;
  selectWeapon(id: WeaponId): void;
  setTarget(x: number, y: number): void;
  setFuse(n: number): void;
  setInput(i: WormInput): void;
  jump(): void;
  setCharge(p: number): void;
  fire(): void;
  detonate(): void;
  retreating(): boolean;
}

interface Plan {
  weapon: WeaponId;
  facing: 1 | -1;
  aim: number;
  power: number;
  fuse: number;
  tx: number;
  ty: number;
  miss: number;
  enemy: Worm;
}

type State = 'think' | 'walk' | 'aim' | 'fired' | 'idle';

const ERR: Record<Difficulty, { ang: number; pow: number; think: number }> = {
  easy: { ang: 8, pow: 0.12, think: 1.6 },
  normal: { ang: 3.4, pow: 0.055, think: 1.1 },
  hard: { ang: 1.1, pow: 0.02, think: 0.7 },
};

const gauss = (): number => {
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.random();
  return (s - 2) * 1.73;
};

/** IA do macaco-bot: escolhe alvo, calcula trajetória simulando a física real e erra de propósito. */
export class Bot {
  private state: State = 'think';
  private timer = 0.8;
  private plan: Plan | null = null;
  private walkDir = 0;
  private walkLeft = 0;
  private replans = 0;
  private stuckT = 0;
  private lastX = 0;
  private charge = 0;
  private firedT = 0;
  private retreatDir = 0;
  private readonly diff: Difficulty;

  constructor(diff: Difficulty) {
    this.diff = diff;
  }

  begin(h: BotHost): void {
    this.state = 'think';
    this.timer = ERR[this.diff].think * (0.7 + Math.random() * 0.6);
    this.plan = null;
    this.replans = 0;
    this.charge = 0;
    this.walkDir = 0;
    this.walkLeft = 0;
    this.lastX = h.worm.x;
    h.setInput({ left: false, right: false, up: false, down: false });
  }

  update(dt: number, h: BotHost): void {
    const w = h.worm;
    if (w.state !== 'alive') return;
    switch (this.state) {
      case 'think': {
        this.timer -= dt;
        if (this.timer > 0) break;
        this.plan = this.makePlan(h);
        if (!this.plan) {
          this.state = 'idle';
          break;
        }
        const far = this.plan.miss > 95 && this.replans < 3 && this.plan.weapon !== 'slap';
        if (far) {
          this.replans++;
          this.walkDir = this.plan.enemy.x > w.x ? 1 : -1;
          if (this.replans === 3) this.walkDir *= Math.random() < 0.5 ? 1 : -1;
          this.walkLeft = 1.6 + Math.random() * 1.2;
          this.state = 'walk';
        } else {
          this.beginAim(h);
        }
        break;
      }
      case 'walk': {
        this.walkLeft -= dt;
        const dir = this.walkDir;
        let moving = this.walkLeft > 0;
        if (moving && !h.world.groundAhead(w, dir)) moving = false;
        h.setInput({ left: moving && dir < 0, right: moving && dir > 0, up: false, down: false });
        if (moving) {
          if (Math.abs(w.x - this.lastX) < 0.15) {
            this.stuckT += dt;
            if (this.stuckT > 0.35) {
              h.jump();
              this.stuckT = 0;
            }
          } else this.stuckT = 0;
          this.lastX = w.x;
        } else {
          h.setInput({ left: false, right: false, up: false, down: false });
          this.state = 'think';
          this.timer = 0.35;
        }
        break;
      }
      case 'aim': {
        const p = this.plan;
        if (!p) {
          this.state = 'idle';
          break;
        }
        w.facing = p.facing;
        const diff = p.aim - w.aim;
        const step = 85 * dt;
        if (Math.abs(diff) > step) {
          w.aim += Math.sign(diff) * step;
          break;
        }
        w.aim = p.aim;
        const def = h.world.worm(w.id);
        void def;
        if (p.weapon === 'bazooka' || p.weapon === 'grenade' || p.weapon === 'holy' || p.weapon === 'slipper') {
          this.charge = Math.min(p.power, this.charge + dt * 1.3);
          h.setCharge(this.charge);
          if (this.charge >= p.power - 0.001) {
            h.setCharge(p.power);
            this.doFire(h);
          }
        } else {
          this.doFire(h);
        }
        break;
      }
      case 'fired': {
        this.firedT += dt;
        const p = this.plan;
        if (p && p.weapon === 'sheep' && h.world.hasSheep()) {
          let near = false;
          for (const o of h.world.worms) {
            if (o.state !== 'alive' || o.team === w.team) continue;
            for (const pr of h.world.projs) if (pr.kind === 'sheep' && Math.hypot(pr.x - o.x, pr.y - o.y) < 46) near = true;
          }
          if (near || this.firedT > 5) h.detonate();
        }
        if (h.retreating() && this.retreatDir !== 0 && this.firedT > 0.4 && this.firedT < 3.2) {
          const dir = this.retreatDir;
          const ok = h.world.groundAhead(w, dir);
          h.setInput({ left: ok && dir < 0, right: ok && dir > 0, up: false, down: false });
          if (ok && Math.abs(w.x - this.lastX) < 0.1) {
            this.stuckT += dt;
            if (this.stuckT > 0.4) {
              h.jump();
              this.stuckT = 0;
            }
          }
          this.lastX = w.x;
        } else {
          h.setInput({ left: false, right: false, up: false, down: false });
        }
        break;
      }
      default:
        break;
    }
  }

  private beginAim(h: BotHost): void {
    const p = this.plan;
    if (!p) return;
    h.setInput({ left: false, right: false, up: false, down: false });
    h.selectWeapon(p.weapon);
    h.setFuse(p.fuse);
    if (p.weapon === 'slipper' || p.weapon === 'pigeons') h.setTarget(p.tx, p.ty);
    h.worm.facing = p.facing;
    this.charge = 0;
    this.state = 'aim';
  }

  private doFire(h: BotHost): void {
    const p = this.plan;
    h.fire();
    this.state = 'fired';
    this.firedT = 0;
    this.retreatDir = p && p.weapon !== 'slap' && p.weapon !== 'kamikaze' ? (p.enemy.x > h.worm.x ? -1 : 1) : 0;
    this.lastX = h.worm.x;
  }

  // ───────────────────────────── planejamento ─────────────────────────────

  private makePlan(h: BotHost): Plan | null {
    const w = h.worm;
    const world = h.world;
    const enemies = world.worms.filter((o) => o.state === 'alive' && o.team !== w.team);
    if (enemies.length === 0) return null;
    const err = ERR[this.diff];

    // alvo: prioriza perto + frágil
    let best: Worm = enemies[0];
    let bestScore = Infinity;
    for (const e of enemies) {
      const sc = Math.hypot(e.x - w.x, e.y - w.y) * 0.8 + e.hp * 1.4 + Math.random() * 120;
      if (sc < bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    const e = best;
    const dist = Math.hypot(e.x - w.x, e.y - w.y);
    const facing: 1 | -1 = e.x >= w.x ? 1 : -1;
    const mk = (weapon: WeaponId, aim: number, power: number, fuse: number, tx: number, ty: number, miss: number): Plan => ({
      weapon,
      facing,
      aim: Math.max(-80, Math.min(85, aim)),
      power: Math.max(0.12, Math.min(1, power)),
      fuse,
      tx,
      ty,
      miss,
      enemy: e,
    });

    // tapa na cara
    if (dist < 30 && Math.abs(e.y - w.y) < 18) return mk('slap', 5, 0, 3, 0, 0, 0);

    // kamikaze desesperado
    if (h.ammo('kamikaze') > 0 && w.hp < 32 && dist < 150 && this.hasLine(world, w, e)) {
      const a = (Math.atan2(-(e.y - w.y), Math.abs(e.x - w.x)) * 180) / Math.PI;
      return mk('kamikaze', a, 0, 3, 0, 0, 0);
    }

    const roll = Math.random();
    const noise = (n: number) => gauss() * n;

    if (h.ammo('pigeons') > 0 && roll < 0.22 && dist > 120) {
      return mk('pigeons', 30, 0, 3, e.x + noise(err.ang * 6), e.y, 0);
    }
    if (h.ammo('slipper') > 0 && roll < 0.42 && dist > 100) {
      return mk('slipper', 55, 0.55, 3, e.x + noise(err.ang * 4), e.y + noise(err.ang * 3), 0);
    }
    if (h.ammo('sheep') > 0 && roll < 0.58 && dist < 520 && Math.abs(e.y - w.y) < 90) {
      return mk('sheep', 5, 0, 3, e.x, e.y, 0);
    }

    // busca balística real (bazuca / granada / banana sagrada)
    const cluster = enemies.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) < 160).length;
    const weapons: WeaponId[] = ['bazooka', 'grenade'];
    if (h.ammo('holy') > 0 && (cluster >= 2 || e.hp > 70) && Math.random() < 0.6) weapons.push('holy');
    let bestPlan: Plan | null = null;
    for (const wp of weapons) {
      const kind = wp === 'bazooka' ? 'rocket' : 'grenade';
      const fuse = wp === 'holy' ? 4 : 3;
      for (let ang = 4; ang <= 86; ang += 3) {
        const rad = (ang * Math.PI) / 180;
        const dx = facing * Math.cos(rad);
        const dy = -Math.sin(rad);
        for (let pw = 0.18; pw <= 1.001; pw += 0.04) {
          const s = wp === 'bazooka' ? 180 + pw * 820 : wp === 'holy' ? 110 + pw * 650 : 110 + pw * 670;
          const pr = world.predict(kind, w.x + dx * 13, w.y + dy * 13 - 1, dx * s, dy * s, fuse);
          let miss = Math.hypot(pr.x - e.x, pr.y - e.y);
          if (pr.water) miss += 400;
          const selfD = Math.hypot(pr.x - w.x, pr.y - w.y);
          const rad2 = wp === 'holy' ? 150 : 80;
          if (selfD < rad2) miss += (rad2 - selfD) * 4 + 150;
          for (const a of world.worms) {
            if (a.state === 'alive' && a.team === w.team && a !== w && Math.hypot(pr.x - a.x, pr.y - a.y) < rad2 * 0.8) miss += 90;
          }
          if (wp === 'grenade') miss += 12;
          if (wp === 'holy') miss -= 25;
          if (!bestPlan || miss < bestPlan.miss) bestPlan = mk(wp, ang, pw, fuse, 0, 0, miss);
        }
      }
    }
    if (!bestPlan) return null;
    // erro proposital da IA
    bestPlan.aim += noise(err.ang);
    bestPlan.power += noise(err.pow);
    bestPlan.power = Math.max(0.12, Math.min(1, bestPlan.power));
    return bestPlan;
  }

  private hasLine(world: World, a: Worm, b: Worm): boolean {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    for (let i = 1; i < n; i++) {
      if (world.solid(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
    }
    return true;
  }
}
