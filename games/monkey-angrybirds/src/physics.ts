import {
  Box,
  Circle,
  World,
  Vec2,
  type Body,
  type Contact,
  type ContactImpulse,
} from 'planck-js';
import { gameAudio } from './audio';
import {
  ENEMY_DEFEAT_QUOTES,
  ENEMY_SPECS,
  MATERIAL_SPECS,
  MONKEY_SPECS,
  WORLD_GRAVITY_Y,
  WORLD_MAX_X,
  WORLD_MIN_X,
} from './constants';
import type {
  EnemyKind,
  FloatingText,
  LevelDef,
  MaterialKind,
  MonkeyKind,
  Particle,
  Shockwave,
  WorldSnapshot,
} from './types';

export interface BlockEntity {
  id: number;
  kind: 'block';
  material: MaterialKind;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  body: Body;
  pendingDamage: number;
  destroyed: boolean;
}

export interface EnemyEntity {
  id: number;
  kind: 'enemy';
  enemyKind: EnemyKind;
  radius: number;
  hp: number;
  maxHp: number;
  body: Body;
  pendingDamage: number;
  destroyed: boolean;
  scaredTimer: number;
  helmetLost: boolean;
}

export interface MonkeyEntity {
  id: number;
  kind: 'monkey';
  monkeyKind: MonkeyKind;
  radius: number;
  body: Body;
  hasCollided: boolean;
  powerUsed: boolean;
  autoBombTimer: number | null;
  slamUsed: boolean;
  boomerangReverseTimer: number;
  age: number;
  trail: { x: number; y: number }[];
  trailTick: number;
  shooterId: string;
  destroyed: boolean;
}

export interface CoconutBombEntity {
  id: number;
  kind: 'coconut';
  radius: number;
  body: Body;
  age: number;
  destroyed: boolean;
}

interface PendingExplosion {
  x: number;
  y: number;
  radius: number;
  force: number;
  maxDamage: number;
  isCoconut: boolean;
}

type BodyUserData =
  | BlockEntity
  | EnemyEntity
  | MonkeyEntity
  | CoconutBombEntity
  | { kind: 'ground' };

export interface PhysicsCallbacks {
  onScore: (points: number, x: number, y: number, label?: string, color?: string) => void;
  onShake: (amount: number) => void;
  onHitstop?: (duration: number) => void;
}

export class PhysicsWorld {
  public world: World;
  public blocks: BlockEntity[] = [];
  public enemies: EnemyEntity[] = [];
  public monkeys: MonkeyEntity[] = [];
  public coconuts: CoconutBombEntity[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public shockwaves: Shockwave[] = [];

  private nextId = 1;
  private graceTimer = 0.45;
  private lastImpactSoundAt = 0;
  private pendingExplosions: PendingExplosion[] = [];
  private callbacks: PhysicsCallbacks;

  constructor(callbacks: PhysicsCallbacks) {
    this.callbacks = callbacks;
    this.world = this.createWorld();
  }

  private createWorld(): World {
    const world = new World(new Vec2(0, WORLD_GRAVITY_Y));

    // Ground & side safety walls (very far out)
    const ground = world.createBody({ type: 'static', position: new Vec2(18, -2) });
    ground.createFixture(new Box(45, 2), { friction: 0.85, restitution: 0.12 });
    ground.setUserData({ kind: 'ground' } satisfies BodyUserData);

    const leftWall = world.createBody({ type: 'static', position: new Vec2(-8, 12) });
    leftWall.createFixture(new Box(1, 20), { friction: 0.5, restitution: 0.2 });
    leftWall.setUserData({ kind: 'ground' } satisfies BodyUserData);

    world.on('post-solve', (contact: Contact, impulse: ContactImpulse) => {
      this.handlePostSolve(contact, impulse);
    });

    return world;
  }

  loadLevel(level: LevelDef): void {
    this.world = this.createWorld();
    this.blocks = [];
    this.enemies = [];
    this.monkeys = [];
    this.coconuts = [];
    this.particles = [];
    this.floatingTexts = [];
    this.shockwaves = [];
    this.pendingExplosions = [];
    this.nextId = 1;
    this.graceTimer = 0.45;

    for (const b of level.blocks) {
      this.spawnBlock(b.material, b.x, b.y, b.w, b.h, b.angle ?? 0);
    }
    for (const e of level.enemies) {
      this.spawnEnemy(e.kind, e.x, e.y);
    }
  }

  spawnBlock(
    material: MaterialKind,
    x: number,
    y: number,
    w: number,
    h: number,
    angle = 0,
    idOverride?: number,
    hpOverride?: number,
  ): BlockEntity {
    const spec = MATERIAL_SPECS[material];
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      angle,
      linearDamping: 0.08,
      angularDamping: 0.14,
    });
    body.createFixture(new Box(w / 2, h / 2), {
      density: spec.density,
      friction: spec.friction,
      restitution: spec.restitution,
    });
    const entity: BlockEntity = {
      id: idOverride ?? this.nextId++,
      kind: 'block',
      material,
      w,
      h,
      hp: hpOverride ?? spec.hp,
      maxHp: spec.hp,
      body,
      pendingDamage: 0,
      destroyed: false,
    };
    body.setUserData(entity);
    this.blocks.push(entity);
    return entity;
  }

  spawnEnemy(
    enemyKind: EnemyKind,
    x: number,
    y: number,
    idOverride?: number,
    hpOverride?: number,
  ): EnemyEntity {
    const spec = ENEMY_SPECS[enemyKind];
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      linearDamping: 0.12,
      angularDamping: 0.25,
    });
    body.createFixture(new Circle(spec.radius), {
      density: spec.density,
      friction: 0.65,
      restitution: 0.22,
    });
    const entity: EnemyEntity = {
      id: idOverride ?? this.nextId++,
      kind: 'enemy',
      enemyKind,
      radius: spec.radius,
      hp: hpOverride ?? spec.hp,
      maxHp: spec.hp,
      body,
      pendingDamage: 0,
      destroyed: false,
      scaredTimer: 0,
      helmetLost: (hpOverride ?? spec.hp) < spec.hp * 0.55,
    };
    body.setUserData(entity);
    this.enemies.push(entity);
    return entity;
  }

  launchMonkey(
    monkeyKind: MonkeyKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    shooterId: string,
    opts?: { idOverride?: number; powerUsed?: boolean },
  ): MonkeyEntity {
    const spec = MONKEY_SPECS[monkeyKind];
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      bullet: true,
      linearDamping: 0.03,
      angularDamping: 0.08,
    });
    body.createFixture(new Circle(spec.radius), {
      density: spec.density,
      friction: 0.45,
      restitution: spec.restitution,
    });
    body.setLinearVelocity(new Vec2(vx, vy));
    // Deterministic spin for consistent multiplayer simulation
    body.setAngularVelocity(-Math.max(1.2, Math.min(4.5, Math.abs(vx) * 0.16)));

    const entity: MonkeyEntity = {
      id: opts?.idOverride ?? this.nextId++,
      kind: 'monkey',
      monkeyKind,
      radius: spec.radius,
      body,
      hasCollided: false,
      powerUsed: opts?.powerUsed ?? false,
      autoBombTimer: null,
      slamUsed: false,
      boomerangReverseTimer: 0,
      age: 0,
      trail: [{ x, y }],
      trailTick: 0,
      shooterId,
      destroyed: false,
    };
    body.setUserData(entity);
    this.monkeys.push(entity);
    return entity;
  }

  private spawnCoconutBomb(x: number, y: number, vx: number, vy: number): CoconutBombEntity {
    const radius = 0.34;
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(x, y),
      bullet: true,
      linearDamping: 0.02,
      angularDamping: 0.1,
    });
    body.createFixture(new Circle(radius), {
      density: 2.8,
      friction: 0.4,
      restitution: 0.15,
    });
    body.setLinearVelocity(new Vec2(vx, vy));
    body.setAngularVelocity(6);

    const entity: CoconutBombEntity = {
      id: this.nextId++,
      kind: 'coconut',
      radius,
      body,
      age: 0,
      destroyed: false,
    };
    body.setUserData(entity);
    this.coconuts.push(entity);
    return entity;
  }

  activatePower(targetMonkey?: MonkeyEntity): MonkeyEntity | null {
    const monkey =
      targetMonkey ??
      this.monkeys.find((m) => !m.destroyed && !m.powerUsed && !m.hasCollided) ??
      this.monkeys.find((m) => !m.destroyed && !m.powerUsed && m.monkeyKind === 'bomb');

    if (!monkey || monkey.powerUsed || monkey.destroyed) return null;
    monkey.powerUsed = true;

    const pos = monkey.body.getPosition();
    const vel = monkey.body.getLinearVelocity();
    const spec = MONKEY_SPECS[monkey.monkeyKind];

    gameAudio.playPower(monkey.monkeyKind);
    this.addFloatingText(pos.x, pos.y + 0.9, spec.battleCry, '#fde047', 1.15);

    switch (monkey.monkeyKind) {
      case 'normal': {
        monkey.body.setLinearVelocity(new Vec2(vel.x * 1.38 + 4.5, vel.y * 1.05 - 0.8));
        this.shockwaves.push({
          x: pos.x,
          y: pos.y,
          radius: 0.3,
          maxRadius: 2.1,
          color: '#ef4444',
          life: 0,
          maxLife: 0.28,
        });
        this.spawnBurst(pos.x, pos.y, '#ef4444', 12, 'circle');
        break;
      }
      case 'triple': {
        const speed = Math.max(8, Math.hypot(vel.x, vel.y) * 1.12);
        const baseAngle = Math.atan2(vel.y, vel.x);
        monkey.body.setLinearVelocity(
          new Vec2(Math.cos(baseAngle) * speed, Math.sin(baseAngle) * speed),
        );

        const offsets = [-0.24, 0.24];
        for (const deltaAngle of offsets) {
          const a = baseAngle + deltaAngle;
          const perpX = -Math.sin(baseAngle) * Math.sign(deltaAngle) * 0.55;
          const perpY = Math.cos(baseAngle) * Math.sign(deltaAngle) * 0.55;
          this.launchMonkey(
            'triple',
            pos.x + perpX,
            pos.y + perpY,
            Math.cos(a) * speed,
            Math.sin(a) * speed,
            monkey.shooterId,
            { powerUsed: true },
          );
        }
        this.spawnBurst(pos.x, pos.y, '#38bdf8', 16, 'circle');
        break;
      }
      case 'bomb': {
        this.pendingExplosions.push({
          x: pos.x,
          y: pos.y,
          radius: 4.9,
          force: 72,
          maxDamage: 190,
          isCoconut: true,
        });
        monkey.destroyed = true;
        break;
      }
      case 'tank': {
        monkey.body.setLinearVelocity(new Vec2(vel.x * 0.16, -27));
        monkey.body.setAngularVelocity(-10);
        this.spawnBurst(pos.x, pos.y, '#c084fc', 18, 'circle');
        this.callbacks.onShake(0.25);
        break;
      }
      case 'boomerang': {
        // Smooth curved turnaround instead of harsh upward snap
        monkey.body.setLinearVelocity(new Vec2(vel.x * 0.65, Math.max(vel.y * 0.45, 2.8)));
        monkey.body.setAngularVelocity(16);
        monkey.boomerangReverseTimer = 0.62;
        this.shockwaves.push({
          x: pos.x,
          y: pos.y,
          radius: 0.3,
          maxRadius: 2.3,
          color: '#84cc16',
          life: 0,
          maxLife: 0.3,
        });
        this.spawnBurst(pos.x, pos.y, '#84cc16', 14, 'circle');
        break;
      }
      case 'bomber': {
        // Drop explosive coconut bomb straight down and propel monkey upward!
        this.spawnCoconutBomb(pos.x, pos.y - 0.52, vel.x * 0.16, -12.2);
        monkey.body.setLinearVelocity(
          new Vec2(Math.max(4.0, vel.x * 0.78 + 3.2), Math.max(8.8, vel.y * 0.25 + 9.4)),
        );
        monkey.body.setAngularVelocity(-8);
        this.shockwaves.push({
          x: pos.x,
          y: pos.y,
          radius: 0.25,
          maxRadius: 1.9,
          color: '#f59e0b',
          life: 0,
          maxLife: 0.26,
        });
        this.spawnBurst(pos.x, pos.y - 0.3, '#fde047', 12, 'smoke');
        break;
      }
    }

    return monkey;
  }

  private handlePostSolve(contact: Contact, impulse: ContactImpulse): void {
    if (this.graceTimer > 0) return;

    const udA = contact.getFixtureA().getBody().getUserData() as BodyUserData | null;
    const udB = contact.getFixtureB().getBody().getUserData() as BodyUserData | null;
    if (!udA || !udB) return;

    // Coconut bomb detonates immediately on any solid contact!
    const coconutA = udA.kind === 'coconut' ? udA : null;
    const coconutB = udB.kind === 'coconut' ? udB : null;
    const hitCoconut = coconutA || coconutB;
    if (hitCoconut && !hitCoconut.destroyed && hitCoconut.age > 0.025) {
      hitCoconut.destroyed = true;
      const p = hitCoconut.body.getPosition();
      this.pendingExplosions.push({
        x: p.x,
        y: p.y,
        radius: 4.5,
        force: 68,
        maxDamage: 185,
        isCoconut: true,
      });
      return;
    }

    const impulses = impulse.normalImpulses;
    let totalImpulse = 0;
    for (let i = 0; i < impulses.length; i++) {
      totalImpulse += impulses[i];
    }
    if (totalImpulse < 0.85) return;

    const monkeyA = udA.kind === 'monkey' ? udA : null;
    const monkeyB = udB.kind === 'monkey' ? udB : null;
    const activeMonkey = monkeyA || monkeyB;

    if (activeMonkey && activeMonkey.age > 0.06) {
      if (!activeMonkey.hasCollided) {
        activeMonkey.hasCollided = true;
        activeMonkey.boomerangReverseTimer = 0;
        if (activeMonkey.monkeyKind === 'bomb' && !activeMonkey.powerUsed && activeMonkey.autoBombTimer === null) {
          activeMonkey.autoBombTimer = 0.75;
        }
        if (activeMonkey.monkeyKind === 'tank' && activeMonkey.powerUsed && !activeMonkey.slamUsed) {
          activeMonkey.slamUsed = true;
          const p = activeMonkey.body.getPosition();
          this.pendingExplosions.push({
            x: p.x,
            y: p.y,
            radius: 3.3,
            force: 40,
            maxDamage: 92,
            isCoconut: false,
          });
        }
      }
    }

    this.applyImpact(udA, udB, totalImpulse);
    this.applyImpact(udB, udA, totalImpulse);
  }

  private applyImpact(target: BodyUserData, other: BodyUserData, impulse: number): void {
    if (target.kind === 'ground' || target.kind === 'coconut') return;

    let mult = 1;
    if (other.kind === 'monkey') {
      if (other.monkeyKind === 'triple' && target.kind === 'block' && target.material === 'glass') {
        mult = 2.9;
      } else if (other.monkeyKind === 'tank') {
        mult = other.powerUsed ? 2.6 : 1.5;
      } else if (other.monkeyKind === 'boomerang' && other.powerUsed) {
        mult = 1.65;
      } else {
        mult = 1.35;
      }
    }

    const eff = impulse * mult;

    if (target.kind === 'block') {
      const spec = MATERIAL_SPECS[target.material];
      if (eff > spec.impulseThreshold) {
        const dmg = (eff - spec.impulseThreshold) * 4.6;
        target.pendingDamage += dmg;

        const now = performance.now();
        if (dmg > 5 && now - this.lastImpactSoundAt > 75) {
          this.lastImpactSoundAt = now;
          gameAudio.playImpact(target.material, eff);
        }
      }
    } else if (target.kind === 'enemy') {
      if (eff > 1.35) {
        const dmg = (eff - 1.35) * 5.1;
        target.pendingDamage += dmg;
      }
    }
  }

  step(dt: number): void {
    if (this.graceTimer > 0) {
      this.graceTimer = Math.max(0, this.graceTimer - dt);
    }

    // Continuous smooth reverse curve for active boomerang monkeys
    for (const m of this.monkeys) {
      if (m.destroyed || m.boomerangReverseTimer <= 0) continue;
      m.boomerangReverseTimer = Math.max(0, m.boomerangReverseTimer - dt);
      const mass = m.body.getMass();
      m.body.applyForceToCenter(new Vec2(-mass * 48, mass * 6.5), true);
    }

    this.world.step(dt, 10, 4);

    // Update monkeys (trails, auto-bomb, out of bounds)
    for (const m of this.monkeys) {
      if (m.destroyed) continue;
      m.age += dt;
      const p = m.body.getPosition();
      m.trailTick += dt;
      if (m.trailTick >= 0.032) {
        m.trailTick = 0;
        m.trail.push({ x: p.x, y: p.y });
        if (m.trail.length > 42) m.trail.shift();
      }

      if (m.autoBombTimer !== null) {
        m.autoBombTimer -= dt;
        if (m.autoBombTimer <= 0) {
          m.autoBombTimer = null;
          this.activatePower(m);
        }
      }

      if (p.x < WORLD_MIN_X - 3 || p.x > WORLD_MAX_X + 3 || p.y < -4) {
        m.destroyed = true;
      }
    }

    // Update dropped coconut bombs
    for (const c of this.coconuts) {
      if (c.destroyed) continue;
      c.age += dt;
      const p = c.body.getPosition();
      if (c.age > 2.4 || p.y < -1) {
        c.destroyed = true;
        this.pendingExplosions.push({
          x: p.x,
          y: Math.max(0.2, p.y),
          radius: 4.5,
          force: 68,
          maxDamage: 185,
          isCoconut: true,
        });
      }
    }

    // Scare nearby enemies when a monkey or coconut bomb approaches
    for (const e of this.enemies) {
      if (e.destroyed) continue;
      if (e.scaredTimer > 0) e.scaredTimer -= dt;
      const ep = e.body.getPosition();

      for (const m of this.monkeys) {
        if (m.destroyed) continue;
        const mp = m.body.getPosition();
        const mv = m.body.getLinearVelocity();
        const dx = ep.x - mp.x;
        const dy = ep.y - mp.y;
        const dist = Math.hypot(dx, dy);
        const speed = Math.hypot(mv.x, mv.y);
        const headingToward = dx * mv.x + dy * mv.y > 0;
        if (dist < 9.5 && speed > 2.5 && (headingToward || dist < 3.8)) {
          e.scaredTimer = 0.5;
        }
      }

      for (const c of this.coconuts) {
        if (c.destroyed) continue;
        const cp = c.body.getPosition();
        if (Math.hypot(ep.x - cp.x, ep.y - cp.y) < 8.5) {
          e.scaredTimer = 0.6;
        }
      }

      if (ep.x < WORLD_MIN_X || ep.x > WORLD_MAX_X || ep.y < -2.5) {
        e.pendingDamage += 9999;
      }
    }

    // Apply accumulated block damage
    for (const b of this.blocks) {
      if (b.destroyed) continue;
      const pos = b.body.getPosition();
      if (pos.x < WORLD_MIN_X - 2 || pos.x > WORLD_MAX_X + 2 || pos.y < -3) {
        b.pendingDamage += 9999;
      }
      if (b.pendingDamage > 0) {
        b.hp -= b.pendingDamage;
        b.pendingDamage = 0;
        if (b.hp <= 0) {
          b.destroyed = true;
          this.onBlockDestroyed(b);
        }
      }
    }

    // Apply accumulated enemy damage
    for (const e of this.enemies) {
      if (e.destroyed) continue;
      if (e.pendingDamage > 0) {
        e.hp -= e.pendingDamage;
        e.pendingDamage = 0;
        this.checkHelmetLoss(e);
        if (e.hp <= 0) {
          e.destroyed = true;
          this.onEnemyDestroyed(e);
        }
      }
    }

    // Process queued explosions (including TNT chain reactions!)
    let safety = 0;
    while (this.pendingExplosions.length > 0 && safety < 16) {
      safety++;
      const exp = this.pendingExplosions.shift()!;
      this.executeExplosion(exp);
    }

    // Destroy bodies safely outside step
    this.cleanupDestroyedBodies();

    // Update visual effects
    this.updateEffects(dt);
  }

  private checkHelmetLoss(e: EnemyEntity): void {
    if (e.enemyKind === 'boss_helmet' && !e.helmetLost && e.hp > 0 && e.hp < e.maxHp * 0.55) {
      e.helmetLost = true;
      const pos = e.body.getPosition();
      this.spawnBurst(pos.x, pos.y + e.radius * 0.7, '#facc15', 14, 'shard');
      this.addFloatingText(pos.x, pos.y + 1.35, 'MEU CAPACETE DA OBRA!', '#fde047', 1.15);
    }
  }

  private onBlockDestroyed(b: BlockEntity): void {
    const pos = b.body.getPosition();
    const spec = MATERIAL_SPECS[b.material];
    gameAudio.playBreak(b.material);

    if (b.material === 'tnt') {
      this.pendingExplosions.push({
        x: pos.x,
        y: pos.y,
        radius: 4.5,
        force: 64,
        maxDamage: 165,
        isCoconut: false,
      });
      this.callbacks.onScore(spec.scoreValue, pos.x, pos.y, 'KABOOM!', '#fb923c');
      return;
    }

    const color =
      b.material === 'glass' ? '#bae6fd' : b.material === 'wood' ? '#d97706' : '#94a3b8';
    const shape = b.material === 'glass' ? 'shard' : 'rect';
    this.spawnBurst(pos.x, pos.y, color, 12, shape);
    this.callbacks.onScore(spec.scoreValue, pos.x, pos.y);
  }

  private onEnemyDestroyed(e: EnemyEntity): void {
    const pos = e.body.getPosition();
    const spec = ENEMY_SPECS[e.enemyKind];
    gameAudio.playEnemyDefeat();
    this.spawnBurst(pos.x, pos.y, '#e2e8f0', 16, 'smoke');
    this.spawnBurst(pos.x, pos.y, '#facc15', 6, 'banana');
    const quote = ENEMY_DEFEAT_QUOTES[Math.floor(Math.random() * ENEMY_DEFEAT_QUOTES.length)];
    this.callbacks.onScore(spec.scoreValue, pos.x, pos.y, `+${spec.scoreValue}! ${quote}`, '#fde047');
    this.callbacks.onShake(0.32);
  }

  private executeExplosion(exp: PendingExplosion): void {
    gameAudio.playExplosion();
    this.callbacks.onShake(exp.isCoconut ? 0.78 : 0.65);
    this.callbacks.onHitstop?.(0.055);

    this.shockwaves.push({
      x: exp.x,
      y: exp.y,
      radius: 0.4,
      maxRadius: exp.radius,
      color: exp.isCoconut ? '#f97316' : '#ef4444',
      life: 0,
      maxLife: 0.42,
    });

    this.spawnBurst(exp.x, exp.y, '#fb923c', 22, 'circle');
    this.spawnBurst(exp.x, exp.y, '#fde047', 12, 'banana');
    this.spawnBurst(exp.x, exp.y, '#475569', 14, 'smoke');

    // Damage & blast nearby blocks
    for (const b of this.blocks) {
      if (b.destroyed) continue;
      const p = b.body.getPosition();
      const dx = p.x - exp.x;
      const dy = p.y - exp.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= exp.radius) {
        const falloff = Math.max(0.15, 1 - dist / exp.radius);
        const nx = dist > 0.01 ? dx / dist : 0;
        const ny = dist > 0.01 ? dy / dist : 1;
        b.body.applyLinearImpulse(
          new Vec2(nx * exp.force * falloff, (ny + 0.35) * exp.force * falloff),
          b.body.getWorldCenter(),
          true,
        );
        b.hp -= exp.maxDamage * falloff;
        if (b.hp <= 0) {
          b.destroyed = true;
          this.onBlockDestroyed(b);
        }
      }
    }

    // Damage & blast nearby enemies
    for (const e of this.enemies) {
      if (e.destroyed) continue;
      const p = e.body.getPosition();
      const dx = p.x - exp.x;
      const dy = p.y - exp.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= exp.radius) {
        const falloff = Math.max(0.2, 1 - dist / exp.radius);
        const nx = dist > 0.01 ? dx / dist : 0;
        const ny = dist > 0.01 ? dy / dist : 1;
        e.body.applyLinearImpulse(
          new Vec2(nx * exp.force * 0.7 * falloff, (ny + 0.35) * exp.force * 0.7 * falloff),
          e.body.getWorldCenter(),
          true,
        );
        e.hp -= exp.maxDamage * falloff;
        this.checkHelmetLoss(e);
        if (e.hp <= 0) {
          e.destroyed = true;
          this.onEnemyDestroyed(e);
        }
      }
    }
  }

  private cleanupDestroyedBodies(): void {
    this.blocks = this.blocks.filter((b) => {
      if (b.destroyed) {
        this.world.destroyBody(b.body);
        return false;
      }
      return true;
    });
    this.enemies = this.enemies.filter((e) => {
      if (e.destroyed) {
        this.world.destroyBody(e.body);
        return false;
      }
      return true;
    });
    this.monkeys = this.monkeys.filter((m) => {
      if (m.destroyed) {
        this.world.destroyBody(m.body);
        return false;
      }
      return true;
    });
    this.coconuts = this.coconuts.filter((c) => {
      if (c.destroyed) {
        this.world.destroyBody(c.body);
        return false;
      }
      return true;
    });
  }

  spawnBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    shape: Particle['shape'],
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = shape === 'smoke' ? 1.5 + Math.random() * 4 : 3 + Math.random() * 9;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.35,
        y: y + (Math.random() - 0.5) * 0.35,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd + 2.2,
        size: shape === 'smoke' ? 0.28 + Math.random() * 0.35 : 0.1 + Math.random() * 0.18,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
        color,
        alpha: 1,
        life: 0,
        maxLife: shape === 'smoke' ? 0.55 + Math.random() * 0.4 : 0.65 + Math.random() * 0.55,
        shape,
        gravityScale: shape === 'smoke' ? -0.18 : 0.75,
      });
    }
  }

  spawnConfetti(centerX: number, centerY: number, count = 70): void {
    const palette = ['#facc15', '#4ade80', '#38bdf8', '#fb7185', '#c084fc', '#f97316'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 12;
      this.particles.push({
        x: centerX + (Math.random() - 0.5) * 10,
        y: centerY + Math.random() * 4,
        vx: Math.cos(angle) * speed * 0.85,
        vy: Math.abs(Math.sin(angle) * speed) + 3.5,
        size: 0.14 + Math.random() * 0.12,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
        color: palette[i % palette.length],
        alpha: 1,
        life: 0,
        maxLife: 2.2 + Math.random() * 1.4,
        shape: 'confetti',
        gravityScale: 0.28,
      });
    }
  }

  addFloatingText(x: number, y: number, text: string, color = '#fde047', scale = 1): void {
    this.floatingTexts.push({
      x,
      y,
      vy: 1.8,
      text,
      color,
      scale,
      life: 0,
      maxLife: 1.35,
    });
  }

  updateEffectsOnly(dt: number): void {
    this.updateEffects(dt);
  }

  private updateEffects(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      if (p.life >= p.maxLife) return false;
      p.vy += WORLD_GRAVITY_Y * p.gravityScale * dt;
      if (p.shape === 'confetti') {
        p.vx *= 0.985;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      p.alpha = 1 - p.life / p.maxLife;
      return true;
    });

    this.floatingTexts = this.floatingTexts.filter((ft) => {
      ft.life += dt;
      if (ft.life >= ft.maxLife) return false;
      ft.y += ft.vy * dt;
      ft.vy *= 0.96;
      return true;
    });

    this.shockwaves = this.shockwaves.filter((s) => {
      s.life += dt;
      if (s.life >= s.maxLife) return false;
      const t = s.life / s.maxLife;
      s.radius = s.maxRadius * (0.2 + 0.8 * (1 - (1 - t) * (1 - t)));
      return true;
    });
  }

  clearMonkeys(): void {
    for (const m of this.monkeys) {
      this.world.destroyBody(m.body);
    }
    this.monkeys = [];
    for (const c of this.coconuts) {
      this.world.destroyBody(c.body);
    }
    this.coconuts = [];
  }

  isActionSettled(): boolean {
    if (this.coconuts.some((c) => !c.destroyed)) return false;

    let anyMonkeyMoving = false;
    for (const m of this.monkeys) {
      if (m.destroyed) continue;
      if (m.autoBombTimer !== null) return false;
      const v = m.body.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > 0.45 && m.age < 7.5) {
        anyMonkeyMoving = true;
        break;
      }
    }
    if (anyMonkeyMoving) return false;

    for (const b of this.blocks) {
      const v = b.body.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > 0.55) return false;
    }
    for (const e of this.enemies) {
      const v = e.body.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > 0.45) return false;
    }
    return this.pendingExplosions.length === 0;
  }

  predictTrajectory(x: number, y: number, vx: number, vy: number, dots = 24): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const dt = 1 / 60;
    const damp = 1 / (1 + dt * 0.03);
    let cx = x;
    let cy = y;
    let cvx = vx;
    let cvy = vy;
    const sampleEvery = 4;
    const totalTicks = dots * sampleEvery;
    for (let tick = 1; tick <= totalTicks; tick++) {
      cvy += WORLD_GRAVITY_Y * dt;
      cvx *= damp;
      cvy *= damp;
      cx += cvx * dt;
      cy += cvy * dt;
      if (cy < 0) break;
      if (tick % sampleEvery === 0) {
        pts.push({ x: cx, y: cy });
      }
    }
    return pts;
  }

  exportSnapshot(
    score: number,
    monkeyIndex: number,
    turnOwnerId: string | null,
    playerScores: Record<string, number>,
    outcome: WorldSnapshot['outcome'],
    extra?: { finalScore?: number; stars?: number; unusedMonkeys?: number },
  ): WorldSnapshot {
    return {
      score,
      monkeyIndex,
      turnOwnerId,
      playerScores: { ...playerScores },
      outcome,
      finalScore: extra?.finalScore,
      stars: extra?.stars,
      unusedMonkeys: extra?.unusedMonkeys,
      blocks: this.blocks.map((b) => {
        const p = b.body.getPosition();
        const v = b.body.getLinearVelocity();
        return {
          id: b.id,
          material: b.material,
          x: p.x,
          y: p.y,
          w: b.w,
          h: b.h,
          angle: b.body.getAngle(),
          vx: v.x,
          vy: v.y,
          angularVelocity: b.body.getAngularVelocity(),
          hp: b.hp,
          maxHp: b.maxHp,
        };
      }),
      enemies: this.enemies.map((e) => {
        const p = e.body.getPosition();
        const v = e.body.getLinearVelocity();
        return {
          id: e.id,
          kind: e.enemyKind,
          x: p.x,
          y: p.y,
          vx: v.x,
          vy: v.y,
          angle: e.body.getAngle(),
          hp: e.hp,
          maxHp: e.maxHp,
        };
      }),
    };
  }

  applySnapshot(snapshot: WorldSnapshot): void {
    this.world = this.createWorld();
    this.blocks = [];
    this.enemies = [];
    this.monkeys = [];
    this.coconuts = [];
    this.pendingExplosions = [];
    this.graceTimer = 0.08;

    let maxId = 0;
    for (const sb of snapshot.blocks) {
      maxId = Math.max(maxId, sb.id);
      const b = this.spawnBlock(sb.material, sb.x, sb.y, sb.w, sb.h, sb.angle, sb.id, sb.hp);
      b.body.setLinearVelocity(new Vec2(sb.vx, sb.vy));
      b.body.setAngularVelocity(sb.angularVelocity);
    }
    for (const se of snapshot.enemies) {
      maxId = Math.max(maxId, se.id);
      const e = this.spawnEnemy(se.kind, se.x, se.y, se.id, se.hp);
      e.body.setLinearVelocity(new Vec2(se.vx, se.vy));
      e.body.setTransform(new Vec2(se.x, se.y), se.angle);
    }
    this.nextId = maxId + 1;
  }
}
