// Simulacao de fisica (planck-js) — sem DOM. Roda no host / offline.
import { Box, Chain, Circle, Polygon, Vec2, World, type Body, type Contact, type ContactImpulse } from 'planck-js';
import {
  ARENA,
  BALL_R,
  BOOST_BIG,
  BOOST_SMALL,
  BOOST_START,
  BOOST_USE,
  CARS,
  CAR_GEO,
  GRAVITY,
  PADS,
  PAD_RESPAWN_BIG,
  PAD_RESPAWN_SMALL,
  THEMES,
  clamp,
  wrapAngle,
} from './constants';
import {
  emptyInput,
  type CarSpec,
  type InputState,
  type MatchConfig,
  type RenderBall,
  type RenderCar,
  type SimEvent,
  type SlotConfig,
} from './types';

interface BodyUD {
  kind: 'arena' | 'ball' | 'car';
  car?: SimCar;
}

interface TouchInfo {
  slot: number;
  team: 0 | 1;
  t: number;
  air: boolean;
  upside: boolean;
  flip: boolean;
  onWall: boolean;
  onCeil: boolean;
}

export interface SimCar {
  slot: number;
  cfg: SlotConfig;
  team: 0 | 1;
  spec: CarSpec;
  body: Body;
  input: InputState;
  boost: number;
  facing: 1 | -1;
  grounded: boolean;
  groundN: { x: number; y: number };
  hullTouch: boolean;
  hullN: { x: number; y: number };
  airTime: number;
  jumpsUsed: number;
  jumpLockT: number;
  flipT: number;
  flipHitDone: boolean;
  boosting: boolean;
  lastJumpCount: number;
  stuckT: number;
  // estatisticas
  goals: number;
  touches: number;
  pads: number;
}

export interface PadState {
  x: number;
  y: number;
  big: boolean;
  active: boolean;
  timer: number;
}

export interface GoalResult {
  team: 0 | 1;
  slot: number;
  own: boolean;
  text: string;
  x: number;
  y: number;
}

function arenaLoop(): Vec2[] {
  const { HW, H, GOAL_H, GOAL_D, CORNER_R } = ARENA;
  const pts: Vec2[] = [];
  pts.push(new Vec2(-HW - GOAL_D, 0));
  pts.push(new Vec2(HW + GOAL_D, 0));
  pts.push(new Vec2(HW + GOAL_D, GOAL_H));
  pts.push(new Vec2(HW, GOAL_H));
  pts.push(new Vec2(HW, H - CORNER_R));
  const seg = 14;
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * (Math.PI / 2);
    pts.push(new Vec2(HW - CORNER_R + Math.cos(a) * CORNER_R, H - CORNER_R + Math.sin(a) * CORNER_R));
  }
  for (let i = 1; i <= seg; i++) {
    const a = Math.PI / 2 + (i / seg) * (Math.PI / 2);
    pts.push(new Vec2(-HW + CORNER_R + Math.cos(a) * CORNER_R, H - CORNER_R + Math.sin(a) * CORNER_R));
  }
  pts.push(new Vec2(-HW, GOAL_H));
  pts.push(new Vec2(-HW - GOAL_D, GOAL_H));
  return pts;
}

/** Pontos da arena para o renderer desenhar (mesmo contorno da fisica). */
export function arenaOutline(): { x: number; y: number }[] {
  return arenaLoop().map((p) => ({ x: p.x, y: p.y }));
}

const CABIN_TAPER: Record<string, number> = { fusca: 0.62, kombi: 0.93, brasilia: 0.72, uno: 0.82 };

export class Sim {
  world: World;
  ball: Body;
  cars: SimCar[] = [];
  pads: PadState[] = [];
  events: SimEvent[] = [];
  lastTouch: TouchInfo | null = null;
  time = 0;
  goal: GoalResult | null = null;
  gravity: number;
  frozen = false;
  private ballMass = 1;
  private hitCool: number[] = [];
  stallT = 0;

  constructor(public cfg: MatchConfig) {
    this.gravity = GRAVITY * THEMES[cfg.theme].gravityScale;
    this.world = new World({ gravity: new Vec2(0, this.gravity) });

    const arena = this.world.createBody({ type: 'static' });
    arena.createFixture(new Chain(arenaLoop(), true), { friction: 0.8, restitution: 0.05 });
    arena.setUserData({ kind: 'arena' } satisfies BodyUD);

    this.ball = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(0, 8),
      bullet: true,
      linearDamping: 0.05,
      angularDamping: 0.45,
    });
    this.ball.createFixture(new Circle(BALL_R), { density: 0.34, friction: 0.35, restitution: 0.72 });
    this.ball.setUserData({ kind: 'ball' } satisfies BodyUD);
    this.ballMass = this.ball.getMass();

    for (const s of cfg.slots) this.cars.push(this.makeCar(s));
    PADS.forEach((p) => this.pads.push({ x: p.x, y: p.y, big: p.big, active: true, timer: 0 }));

    this.world.on('post-solve', (contact: Contact, impulse: ContactImpulse) => this.onPostSolve(contact, impulse));
    this.resetKickoff();
  }

  private makeCar(s: SlotConfig): SimCar {
    const spec = CARS[s.car];
    const body = this.world.createBody({
      type: 'dynamic',
      position: new Vec2(0, 2),
      linearDamping: 0.03,
      angularDamping: 0.6,
    });
    const L = spec.length;
    const G = CAR_GEO;
    // chassi (y fisico = -y de arte)
    body.createFixture(
      new Polygon([
        new Vec2(-L / 2 + 0.25, -G.chassisBottom),
        new Vec2(L / 2 - 0.25, -G.chassisBottom),
        new Vec2(L / 2, -G.chassisBottom + 0.25),
        new Vec2(L / 2, -G.chassisTop),
        new Vec2(-L / 2, -G.chassisTop),
        new Vec2(-L / 2, -G.chassisBottom + 0.25),
      ]),
      { density: spec.density, friction: 0.1, restitution: 0.1 },
    );
    const taper = CABIN_TAPER[spec.id] ?? 0.75;
    const cl = spec.cabinL;
    const top = -G.cabinTop;
    body.createFixture(
      new Polygon([
        new Vec2(spec.cabinOff - cl / 2, -G.chassisTop),
        new Vec2(spec.cabinOff + cl / 2, -G.chassisTop),
        new Vec2(spec.cabinOff + (cl / 2) * taper, top),
        new Vec2(spec.cabinOff - (cl / 2) * taper, top),
      ]),
      { density: spec.density * 0.8, friction: 0.1, restitution: 0.1 },
    );
    for (const sx of [-1, 1]) {
      body.createFixture(new Circle(new Vec2(sx * G.wheelX * L, -G.wheelY), G.wheelR), {
        density: spec.density * 0.9,
        friction: 0,
        restitution: 0.0,
        userData: { wheel: true },
      });
    }
    const car: SimCar = {
      slot: s.slot,
      cfg: s,
      team: s.team,
      spec,
      body,
      input: emptyInput(),
      boost: BOOST_START,
      facing: s.team === 0 ? 1 : -1,
      grounded: true,
      groundN: { x: 0, y: 1 },
      hullTouch: false,
      hullN: { x: 0, y: 1 },
      airTime: 0,
      jumpsUsed: 0,
      jumpLockT: 0,
      flipT: 0,
      flipHitDone: false,
      boosting: false,
      lastJumpCount: 0,
      stuckT: 0,
      goals: 0,
      touches: 0,
      pads: 0,
    };
    body.setUserData({ kind: 'car', car } satisfies BodyUD);
    return car;
  }

  resetKickoff(): void {
    this.goal = null;
    this.lastTouch = null;
    this.ball.setPosition(new Vec2(0, 9));
    this.ball.setAngle(0);
    this.ball.setLinearVelocity(new Vec2(0, 0));
    this.ball.setAngularVelocity(0);
    this.ball.setAwake(true);
    const counts = [0, 0];
    const per = [0, 0];
    for (const c of this.cars) per[c.team]++;
    for (const c of this.cars) {
      const idx = counts[c.team]++;
      const two = per[c.team] > 1;
      const base = two ? (idx === 0 ? 17 : 29) : 21;
      const x = c.team === 0 ? -base : base;
      c.body.setPosition(new Vec2(x, CAR_GEO.bottom + 0.02));
      c.body.setAngle(0);
      c.body.setLinearVelocity(new Vec2(0, 0));
      c.body.setAngularVelocity(0);
      c.body.setAwake(true);
      c.boost = BOOST_START;
      c.facing = c.team === 0 ? 1 : -1;
      c.grounded = true;
      c.groundN = { x: 0, y: 1 };
      c.airTime = 0;
      c.jumpsUsed = 0;
      c.jumpLockT = 0;
      c.flipT = 0;
      c.boosting = false;
      c.stuckT = 0;
      c.lastJumpCount = c.input.jumpCount;
    }
    for (const p of this.pads) {
      p.active = true;
      p.timer = 0;
    }
  }

  setInput(slot: number, input: InputState): void {
    const c = this.cars[slot];
    if (c) {
      c.input = input;
      c.lastJumpCount = input.jumpCount;
    }
  }

  private emit(e: SimEvent): void {
    if (this.events.length < 64) this.events.push(e);
  }

  // ---------- Contatos ----------
  private onPostSolve(contact: Contact, impulse: ContactImpulse): void {
    const ba = contact.getFixtureA().getBody();
    const bb = contact.getFixtureB().getBody();
    const ua = ba.getUserData() as BodyUD | null;
    const ub = bb.getUserData() as BodyUD | null;
    if (!ua || !ub) return;
    const strength = impulse.normalImpulses[0] ?? 0;
    const wm = contact.getWorldManifold(null);
    const px = wm ? wm.points[0].x : ba.getPosition().x;
    const py = wm ? wm.points[0].y : ba.getPosition().y;

    let ballUD: BodyUD | null = null;
    let carUD: BodyUD | null = null;
    let other: BodyUD | null = null;
    if (ua.kind === 'ball') {
      ballUD = ua;
      other = ub;
    } else if (ub.kind === 'ball') {
      ballUD = ub;
      other = ua;
    }
    if (ballUD && other) {
      if (other.kind === 'car') carUD = other;
      if (carUD && carUD.car) {
        const car = carUD.car;
        if (strength > 0.6) {
          const bp = this.ball.getPosition();
          const cp = car.body.getPosition();
          this.lastTouch = {
            slot: car.slot,
            team: car.team,
            t: this.time,
            air: !car.grounded,
            upside: Math.cos(car.body.getAngle()) < -0.1,
            flip: car.flipT > 0,
            onWall: car.grounded && Math.abs(car.groundN.y) < 0.6,
            onCeil: car.grounded && car.groundN.y < -0.6,
          };
          car.touches++;
          if (car.flipT > 0 && !car.flipHitDone) {
            car.flipHitDone = true;
            let dx = bp.x - cp.x;
            let dy = bp.y - cp.y;
            const l = Math.hypot(dx, dy) || 1;
            dx /= l;
            dy /= l;
            const k = this.ballMass * 11;
            this.ball.applyLinearImpulse(new Vec2(dx * k, dy * k), bp, true);
            this.emit({ k: 'flip', x: px, y: py, slot: car.slot });
          }
          if ((this.hitCool[car.slot] ?? 0) <= this.time) {
            this.hitCool[car.slot] = this.time + 0.14;
            this.emit({ k: 'hit', x: px, y: py, s: strength, slot: car.slot });
          }
        }
      } else if (other.kind === 'arena' && strength > 1.2) {
        this.emit({ k: 'bounce', x: px, y: py, s: strength });
      }
    }
  }

  // ---------- Passo ----------
  step(dt: number): void {
    this.time += dt;
    if (!this.frozen) {
      for (const car of this.cars) this.updateCar(car, dt);
    }
    this.world.step(dt, 8, 3);
    this.afterStep(dt);
  }

  private updateCar(car: SimCar, dt: number): void {
    const b = car.body;
    const spec = car.spec;
    const inp = car.input;
    const m = b.getMass();
    const a = b.getAngle();
    const v = b.getLinearVelocity();
    let w = b.getAngularVelocity();
    const up = { x: -Math.sin(a), y: Math.cos(a) };

    // --- contatos com a arena ---
    let gx = 0;
    let gy = 0;
    let gc = 0;
    let hx = 0;
    let hy = 0;
    let hc = 0;
    for (let ce = b.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const ud = ce.other ? (ce.other.getUserData() as BodyUD | null) : null;
      if (!ud || ud.kind !== 'arena') continue;
      const wm = c.getWorldManifold(null);
      if (!wm) continue;
      const isA = c.getFixtureA().getBody() === b;
      const nx = isA ? -wm.normal.x : wm.normal.x;
      const ny = isA ? -wm.normal.y : wm.normal.y;
      if (nx * up.x + ny * up.y > 0.45) {
        gx += nx;
        gy += ny;
        gc++;
      } else {
        hx += nx;
        hy += ny;
        hc++;
      }
    }
    // --- sondas sob as rodas (aderencia tolerante a quiques) ---
    if (car.jumpLockT <= 0) {
      const probeLen = CAR_GEO.wheelR + 0.32;
      for (const sx of [-1, 1]) {
        const p1 = b.getWorldPoint(new Vec2(sx * CAR_GEO.wheelX * spec.length, -CAR_GEO.wheelY));
        const p2 = new Vec2(p1.x - up.x * probeLen, p1.y - up.y * probeLen);
        let hit = false;
        let rnx = 0;
        let rny = 0;
        this.world.rayCast(p1, p2, (fixture, _pt, normal, fraction) => {
          const ud = fixture.getBody().getUserData() as BodyUD | null;
          if (!ud || ud.kind !== 'arena') return -1;
          hit = true;
          rnx = normal.x;
          rny = normal.y;
          return fraction;
        });
        if (hit && rnx * up.x + rny * up.y > 0.45) {
          gx += rnx;
          gy += rny;
          gc++;
        }
      }
    }
    if (car.jumpLockT > 0) car.jumpLockT -= dt;
    const wasGrounded = car.grounded;
    const grounded = gc > 0 && car.jumpLockT <= 0;
    if (grounded) {
      const l = Math.hypot(gx, gy) || 1;
      car.groundN = { x: gx / l, y: gy / l };
      car.airTime = 0;
      car.jumpsUsed = 0;
      car.flipT = 0;
    } else {
      car.airTime += dt;
      if (wasGrounded && car.jumpsUsed === 0) car.jumpsUsed = 1;
    }
    car.grounded = grounded;
    car.hullTouch = hc > 0 && !grounded;
    if (hc > 0) {
      const l = Math.hypot(hx, hy) || 1;
      car.hullN = { x: hx / l, y: hy / l };
    }

    // --- pulo / flip ---
    const presses = Math.max(0, inp.jumpCount - car.lastJumpCount);
    car.lastJumpCount = inp.jumpCount;
    if (presses > 0) {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const pos = b.getPosition();
      if (car.grounded) {
        const n = car.groundN;
        b.applyLinearImpulse(new Vec2(n.x * m * spec.jumpV, n.y * m * spec.jumpV), b.getWorldCenter(), true);
        car.jumpsUsed = 1;
        car.jumpLockT = 0.12;
        car.grounded = false;
        this.emit({ k: 'jump', x: pos.x, y: pos.y, slot: car.slot });
      } else if (car.hullTouch && car.jumpsUsed < 2) {
        const n = car.hullN;
        b.applyLinearImpulse(new Vec2(n.x * m * spec.jumpV * 0.9, n.y * m * spec.jumpV * 0.9), b.getWorldCenter(), true);
        car.jumpsUsed = Math.max(1, car.jumpsUsed);
        car.jumpLockT = 0.1;
        this.emit({ k: 'jump', x: pos.x, y: pos.y, slot: car.slot });
      } else if (car.jumpsUsed < 2 && car.airTime < 1.7) {
        car.jumpsUsed = 2;
        if (dir !== 0) {
          // dodge / flip lateral
          b.setLinearVelocity(new Vec2(v.x * 0.9, v.y * 0.35));
          b.applyLinearImpulse(new Vec2(dir * m * 15, m * 3.5), b.getWorldCenter(), true);
          w = -dir * 13;
          b.setAngularVelocity(w);
          car.flipT = 0.55;
          car.flipHitDone = false;
          this.emit({ k: 'flip', x: pos.x, y: pos.y, slot: car.slot });
        } else {
          b.applyLinearImpulse(new Vec2(up.x * m * 11.5, up.y * m * 11.5), b.getWorldCenter(), true);
          car.flipT = 0.0;
          this.emit({ k: 'jump', x: pos.x, y: pos.y, slot: car.slot });
        }
      }
    }

    // --- boost ---
    const wantBoost = inp.boost && car.boost > 0;
    car.boosting = wantBoost;
    const cvel = b.getLinearVelocity();
    const speed = Math.hypot(cvel.x, cvel.y);

    if (car.grounded) {
      const n = car.groundN;
      const t0x = n.y;
      const t0y = -n.x;
      const d = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let tx = t0x;
      let ty = t0y;
      if (d !== 0) {
        if (Math.abs(t0x) > 0.3) {
          if (t0x * d < 0) {
            tx = -tx;
            ty = -ty;
          }
        } else {
          const wantUp = d * -n.x > 0;
          if (ty > 0 !== wantUp) {
            tx = -tx;
            ty = -ty;
          }
        }
        // direcao do nariz
        car.facing = tx * Math.cos(a) + ty * Math.sin(a) >= 0 ? 1 : -1;
        const vt = cvel.x * tx + cvel.y * ty;
        const cap = car.boosting ? spec.boostTop : spec.topSpeed;
        let acc = spec.accel;
        if (vt < 0) acc *= 2.6;
        else if (vt >= cap) acc = 0;
        else acc *= 1 - 0.55 * (vt / cap);
        b.applyForceToCenter(new Vec2(tx * m * acc, ty * m * acc), true);
      } else if (!car.boosting) {
        const vt = cvel.x * t0x + cvel.y * t0y;
        b.setLinearVelocity(new Vec2(cvel.x - t0x * vt * 0.03, cvel.y - t0y * vt * 0.03));
      }
      // anula a gravidade tangente (carro "gruda" em rampas, paredes e teto)
      {
        const gt = this.gravity * t0y;
        b.applyForceToCenter(new Vec2(-m * gt * t0x, -m * gt * t0y), true);
      }
      // cola na superficie
      b.applyForceToCenter(new Vec2(-n.x * m * Math.abs(this.gravity) * 1.25, -n.y * m * Math.abs(this.gravity) * 1.25), true);
      // alinha com a superficie
      const target = Math.atan2(n.y, n.x) - Math.PI / 2;
      const err = wrapAngle(target - a);
      w += (err * 10 - w) * 0.35;
      b.setAngularVelocity(clamp(w, -10, 10));
    } else {
      if (car.flipT > 0) {
        car.flipT -= dt;
      } else {
        const dir = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
        const target = dir * spec.turn;
        w += (target - w) * Math.min(1, 9 * dt);
        b.setAngularVelocity(clamp(w, -9, 9));
      }
    }

    if (car.boosting) {
      car.boost = Math.max(0, car.boost - BOOST_USE * dt);
      if (speed < spec.boostTop) {
        const ax = Math.cos(a) * car.facing;
        const ay = Math.sin(a) * car.facing;
        const f = m * spec.boostAccel * (car.grounded ? 0.8 : 1);
        b.applyForceToCenter(new Vec2(ax * f, ay * f), true);
      }
    }

    // --- capotou de barriga pra cima? gira sozinho ---
    if (car.hullTouch && speed < 3.5) {
      car.stuckT += dt;
      if (car.stuckT > 0.9) {
        car.stuckT = 0;
        const n = car.hullN;
        b.applyLinearImpulse(new Vec2(n.x * m * 9, n.y * m * 9 + m * 3), b.getWorldCenter(), true);
        b.setAngularVelocity(up.y < 0 ? 7 : -7);
        car.flipT = 0.5;
        car.flipHitDone = true;
      }
    } else {
      car.stuckT = 0;
    }
  }

  private afterStep(dt: number): void {
    // limites de velocidade
    const bv = this.ball.getLinearVelocity();
    const bs = Math.hypot(bv.x, bv.y);
    if (bs > 64) this.ball.setLinearVelocity(new Vec2((bv.x / bs) * 64, (bv.y / bs) * 64));
    for (const c of this.cars) {
      const v = c.body.getLinearVelocity();
      const s = Math.hypot(v.x, v.y);
      if (s > 58) c.body.setLinearVelocity(new Vec2((v.x / s) * 58, (v.y / s) * 58));
    }

    // pads
    for (const p of this.pads) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) p.active = true;
      }
    }
    for (const c of this.cars) {
      const pos = c.body.getPosition();
      for (const p of this.pads) {
        if (!p.active) continue;
        const r = p.big ? 3.3 : 2.5;
        const dx = pos.x - p.x;
        const dy = pos.y - p.y;
        if (dx * dx + dy * dy < r * r && c.boost < 100) {
          c.boost = Math.min(100, c.boost + (p.big ? BOOST_BIG : BOOST_SMALL));
          p.active = false;
          p.timer = p.big ? PAD_RESPAWN_BIG : PAD_RESPAWN_SMALL;
          c.pads++;
          this.emit({ k: 'pad', x: p.x, y: p.y, big: p.big, slot: c.slot });
        }
      }
    }

    // bola fora da arena (seguranca)
    const bp = this.ball.getPosition();
    if (!Number.isFinite(bp.x) || Math.abs(bp.x) > 70 || bp.y > 80 || bp.y < -10) {
      this.ball.setPosition(new Vec2(0, 12));
      this.ball.setLinearVelocity(new Vec2(0, 0));
    }

    // bola parada demais? da um chute de empurrao
    const bs2 = Math.hypot(bv.x, bv.y);
    if (!this.goal && !this.frozen && bs2 < 2.2) this.stallT += dt;
    else this.stallT = 0;
    if (this.stallT > 5) {
      this.stallT = 0;
      this.ball.applyLinearImpulse(new Vec2((Math.random() - 0.5) * this.ballMass * 10, this.ballMass * 22), bp, true);
    }

    // gol
    if (!this.goal) {
      if (bp.x < -ARENA.HW - 0.3 && bp.y < ARENA.GOAL_H) this.registerGoal(1);
      else if (bp.x > ARENA.HW + 0.3 && bp.y < ARENA.GOAL_H) this.registerGoal(0);
    }
  }

  private registerGoal(team: 0 | 1): void {
    const bp = this.ball.getPosition();
    const bv = this.ball.getLinearVelocity();
    const speed = Math.hypot(bv.x, bv.y);
    const lt = this.lastTouch;
    const car = lt ? this.cars[lt.slot] : null;
    const own = !!lt && lt.team !== team;
    const scorerSlot = lt ? lt.slot : -1;
    if (car && !own) car.goals++;
    let text: string;
    const nm = (car?.cfg.name ?? 'MACACO').toUpperCase();
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    if (own) {
      text = pick([`GOL CONTRA! ${nm} SE ENROLOU TODO!`, 'GOL CONTRA! O CIPÓ ENROSCOU!', 'GOL CONTRA! ERROU O GOL, MACACO!']);
    } else if (lt && (lt.flip || lt.upside) && lt.air) {
      text = `GOLAÇO DE BICICLETA DE ${car ? car.spec.name.toUpperCase() : 'FUSCA'}!`;
    } else if (lt && lt.onCeil) {
      text = 'GOL DO TETO! HOMEM-ARANHA-MACACO!';
    } else if (lt && lt.onWall) {
      text = 'GOL DE PAREDE! MACACO ESCALADOR!';
    } else if (speed > 42) {
      text = 'BOMBA DE COCO! É GOOOOL!';
    } else if (bp.y > 7) {
      text = 'GOL DE CHAPÉU! TOMA ESSA!';
    } else if (lt && lt.air) {
      text = 'GOL DE VOLEIO! QUE MACACADA!';
    } else {
      text = pick([`GOOOOL DO ${nm}!`, 'É GOLAAAÇO! BANANAAAA!', 'NA GAIOLA, SEM PERDÃO!', 'TÁ DENTRO! MACACO MALUCO!']);
    }
    this.goal = { team, slot: scorerSlot, own, text, x: bp.x, y: bp.y };
    this.emit({ k: 'goal', x: bp.x, y: Math.max(bp.y, 2), team, slot: scorerSlot, own, text });
  }

  // ---------- Leitura para renderizacao / rede ----------
  ballState(): RenderBall {
    const p = this.ball.getPosition();
    const v = this.ball.getLinearVelocity();
    return { x: p.x, y: p.y, a: this.ball.getAngle(), vx: v.x, vy: v.y };
  }

  carState(c: SimCar): RenderCar {
    const p = c.body.getPosition();
    const v = c.body.getLinearVelocity();
    return {
      slot: c.slot,
      team: c.team,
      car: c.spec.id,
      fur: c.cfg.fur,
      name: c.cfg.name,
      x: p.x,
      y: p.y,
      a: c.body.getAngle(),
      vx: v.x,
      vy: v.y,
      boost: c.boost,
      facing: c.facing,
      grounded: c.grounded,
      boosting: c.boosting,
      flipT: c.flipT,
      bot: c.cfg.bot,
    };
  }

  padMask(): number {
    let m = 0;
    this.pads.forEach((p, i) => {
      if (p.active) m |= 1 << i;
    });
    return m;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
