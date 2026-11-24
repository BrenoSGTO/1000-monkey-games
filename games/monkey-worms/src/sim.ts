import { Rng } from './rng';
import { Terrain } from './terrain';
import { WEAPONS } from './weapons';
import { WORM_NAMES } from './lines';
import {
  GRAV,
  MAX_HP,
  WATER_START,
  WEAPON_ORDER,
  WORLD_H,
  WORLD_W,
  WORM_R,
  type Body,
  type Crate,
  type CrateSpawn,
  type FireParams,
  type Mine,
  type Proj,
  type ProjKind,
  type SimEvent,
  type Snapshot,
  type Team,
  type WeaponId,
  type Worm,
  type WormInput,
} from './types';

const WIND_ACC = 130;
const R2 = (n: number): number => Math.round(n * 100) / 100;

interface Delayed {
  t: number;
  fn: () => void;
}

export interface Prediction {
  x: number;
  y: number;
  t: number;
  water: boolean;
}

export function freshAmmo(): Record<WeaponId, number> {
  const out = {} as Record<WeaponId, number>;
  for (const id of WEAPON_ORDER) out[id] = WEAPONS[id].ammo;
  return out;
}

/** Simulação física pura do jogo (terreno, macacos, projéteis, explosões). */
export class World {
  terrain: Terrain;
  worms: Worm[] = [];
  teams: Team[] = [];
  projs: Proj[] = [];
  mines: Mine[] = [];
  crates: Crate[] = [];
  private delayed: Delayed[] = [];
  wind = 0;
  waterY = WATER_START;
  waterTarget = WATER_START;
  time = 0;
  events: SimEvent[] = [];
  activeId = -1;
  controlled = false;
  canMove = false;
  input: WormInput = { left: false, right: false, up: false, down: false };
  seed = 0;
  perTeam = 4;
  private nextId = 1;
  private hitX = 0;
  private hitY = 0;

  constructor(headless = false) {
    this.terrain = new Terrain(WORLD_W, WORLD_H, headless);
  }

  // ───────────────────────────── setup ─────────────────────────────

  setup(seed: number, teams: Team[], perTeam: number): void {
    this.seed = seed;
    this.teams = teams;
    this.perTeam = perTeam;
    this.worms = [];
    this.projs = [];
    this.mines = [];
    this.crates = [];
    this.delayed = [];
    this.events = [];
    this.waterY = WATER_START;
    this.waterTarget = WATER_START;
    this.wind = 0;
    this.activeId = -1;
    this.time = 0;
    this.terrain.generate(seed, teams.length);
    this.terrain.render();
    this.placeWorms();
  }

  private placeWorms(): void {
    const rng = new Rng(this.seed ^ 0xabcdef);
    const N = this.teams.length * this.perTeam;
    const spots: { x: number; y: number }[] = [];
    for (let k = 0; k < N; k++) {
      const target = 170 + ((k + 0.5) / N) * (WORLD_W - 340) + rng.range(-30, 30);
      let placed = false;
      for (let off = 0; off < 420 && !placed; off += 18) {
        for (const sgn of [1, -1]) {
          const x = Math.round(target + sgn * off);
          if (x < 60 || x > WORLD_W - 60) continue;
          const y = this.terrain.surfaceY(x, WATER_START - 70);
          if (y < 0) continue;
          if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 60)) continue;
          spots.push({ x, y: y - WORM_R - 1 });
          placed = true;
          break;
        }
      }
      if (!placed) spots.push({ x: 300 + k * 90, y: 200 });
    }
    rng.shuffle(spots);
    const namePool = rng.shuffle(WORM_NAMES.slice());
    for (let j = 0; j < spots.length; j++) {
      const team = j % this.teams.length;
      const s = spots[j];
      const w: Worm = {
        id: this.worms.length,
        team,
        name: namePool[j % namePool.length],
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        grounded: false,
        hp: MAX_HP,
        shownHp: MAX_HP,
        facing: s.x < WORLD_W / 2 ? 1 : -1,
        aim: 25,
        state: 'alive',
        launched: false,
        walkT: 0,
        walkAmt: 0,
        blinkT: 1 + (j % 5),
        hurtT: 0,
        throwT: 0,
        spin: 0,
        panic: 0,
        speech: '',
        speechT: 0,
        rope: null,
        kami: null,
        torch: null,
        lastHit: -1,
        holding: null,
        victory: false,
        net: null,
        tombT: 0,
      };
      this.worms.push(w);
    }
    // acomoda no chão
    for (const w of this.worms) {
      for (let i = 0; i < 40; i++) this.moveBody(w, 1 / 60, WORM_R, 0.1);
      w.vx = 0;
      w.vy = 0;
    }
  }

  // ───────────────────────────── helpers ─────────────────────────────

  solid(x: number, y: number): boolean {
    return this.terrain.isSolid(x, y);
  }

  hits(x: number, y: number, R: number): boolean {
    const t = this.terrain;
    if (t.isSolid(x, y)) return true;
    const d = R * 0.7071;
    return (
      t.isSolid(x + R, y) ||
      t.isSolid(x - R, y) ||
      t.isSolid(x, y + R) ||
      t.isSolid(x, y - R) ||
      t.isSolid(x + d, y + d) ||
      t.isSolid(x - d, y + d) ||
      t.isSolid(x + d, y - d) ||
      t.isSolid(x - d, y - d)
    );
  }

  normalAt(x: number, y: number): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const c = Math.cos(a);
      const s = Math.sin(a);
      if (!this.solid(x + c * 3.5, y + s * 3.5)) {
        sx += c;
        sy += s;
      }
    }
    const len = Math.hypot(sx, sy);
    if (len < 0.01) return { x: 0, y: -1 };
    return { x: sx / len, y: sy / len };
  }

  aimDir(w: Worm): { dx: number; dy: number } {
    const a = (w.aim * Math.PI) / 180;
    return { dx: w.facing * Math.cos(a), dy: -Math.sin(a) };
  }

  worm(id: number): Worm | undefined {
    return this.worms[id];
  }

  teamWorms(team: number): Worm[] {
    return this.worms.filter((w) => w.team === team);
  }

  aliveWorms(team: number): Worm[] {
    return this.worms.filter((w) => w.team === team && w.state === 'alive');
  }

  teamAlive(team: number): boolean {
    return this.worms.some((w) => w.team === team && w.state === 'alive');
  }

  teamHp(team: number): number {
    let s = 0;
    for (const w of this.worms) if (w.team === team && w.state === 'alive') s += w.hp;
    return s;
  }

  beginTurn(): void {
    for (const w of this.worms) {
      w.lastHit = -1;
      w.net = null;
      w.victory = false;
    }
  }

  // ───────────────────────────── movimento ─────────────────────────────

  moveBody(b: Body, dt: number, R: number, rest: number, onImpact?: (speed: number) => void): void {
    b.vy += GRAV * dt;
    const dist = Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt;
    const n = Math.min(14, Math.max(1, Math.ceil(dist / 2)));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) {
      const nx = b.x + b.vx * sdt;
      if (!this.hits(nx, b.y, R)) {
        b.x = nx;
      } else {
        let climbed = false;
        if (b.vy >= -20) {
          for (let up = 1; up <= 3; up++) {
            if (!this.hits(nx, b.y - up, R)) {
              b.x = nx;
              b.y -= up;
              climbed = true;
              break;
            }
          }
        }
        if (!climbed) b.vx *= -rest;
      }
      const ny = b.y + b.vy * sdt;
      if (!this.hits(b.x, ny, R)) {
        b.y = ny;
      } else if (b.vy > 0) {
        const imp = b.vy;
        onImpact?.(imp);
        for (let k = 0; k < 3; k++) {
          if (!this.hits(b.x, b.y + 1, R)) b.y += 1;
        }
        b.vy = imp > 240 ? -imp * rest * 0.6 : 0;
        if (Math.abs(b.vy) < 70) b.vy = 0;
        b.vx *= 0.8;
      } else {
        b.vy = Math.abs(b.vy) * 0.2;
      }
    }
    b.grounded = b.vy >= 0 && this.hits(b.x, b.y + 1.5, R);
  }

  walkBody(b: Body, dir: number, speed: number, dt: number, R: number): boolean {
    const nx = b.x + dir * speed * dt;
    let moved = false;
    for (let up = 0; up <= 2; up++) {
      if (!this.hits(nx, b.y - up, R)) {
        b.x = nx;
        b.y -= up;
        moved = true;
        break;
      }
    }
    if (moved) {
      for (let k = 0; k < 4; k++) {
        if (!this.hits(b.x, b.y + 1, R)) b.y += 1;
        else break;
      }
    }
    return moved;
  }

  /** O chão à frente existe? (usado pela IA para não cair na água) */
  groundAhead(w: Worm, dir: number): boolean {
    const x = w.x + dir * 16;
    for (let y = w.y; y < w.y + 46; y += 2) {
      if (this.solid(x, y + WORM_R)) return y + WORM_R < this.waterY - 24;
    }
    return false;
  }

  // ───────────────────────────── ações ─────────────────────────────

  jump(w: Worm, back: boolean): boolean {
    if (w.state !== 'alive' || !w.grounded || w.rope) return false;
    w.vy = back ? -470 : -340;
    w.vx = w.facing * (back ? -70 : 150);
    w.grounded = false;
    this.events.push({ t: 'sound', name: 'jump', x: w.x, y: w.y });
    return true;
  }

  releaseRope(w: Worm): void {
    if (!w.rope) return;
    w.rope = null;
    w.vy -= 60;
    w.grounded = false;
    this.events.push({ t: 'sound', name: 'jump', x: w.x, y: w.y });
  }

  ropeShoot(w: Worm, dx: number, dy: number): boolean {
    let lx = w.x;
    let ly = w.y;
    for (let d = 8; d <= 560; d += 4) {
      const px = w.x + dx * d;
      const py = w.y + dy * d;
      if (this.solid(px, py)) {
        w.rope = { ax: lx, ay: ly, len: Math.max(36, Math.hypot(lx - w.x, ly - w.y)) };
        w.grounded = false;
        this.events.push({ t: 'sound', name: 'rope', x: w.x, y: w.y });
        return true;
      }
      lx = px;
      ly = py;
    }
    this.events.push({ t: 'sound', name: 'whiff', x: w.x, y: w.y });
    return false;
  }

  private ropePhysics(w: Worm, dt: number): void {
    const rope = w.rope;
    if (!rope) return;
    const inp = this.input;
    w.vy += GRAV * dt;
    if (inp.left) w.vx -= 520 * dt;
    if (inp.right) w.vx += 520 * dt;
    if (inp.left !== inp.right) w.facing = inp.right ? 1 : -1;
    if (inp.up) rope.len = Math.max(36, rope.len - 170 * dt);
    if (inp.down) rope.len = Math.min(540, rope.len + 170 * dt);
    for (let s = 0; s < 2; s++) {
      const sdt = dt / 2;
      const ox = w.x;
      const oy = w.y;
      w.x += w.vx * sdt;
      w.y += w.vy * sdt;
      const dx = w.x - rope.ax;
      const dy = w.y - rope.ay;
      const dist = Math.hypot(dx, dy);
      if (dist > rope.len) {
        const nx = dx / dist;
        const ny = dy / dist;
        w.x = rope.ax + nx * rope.len;
        w.y = rope.ay + ny * rope.len;
        const vn = w.vx * nx + w.vy * ny;
        if (vn > 0) {
          w.vx -= vn * nx;
          w.vy -= vn * ny;
        }
      }
      if (this.hits(w.x, w.y, WORM_R - 1)) {
        w.x = ox;
        w.y = oy;
        w.vx *= -0.25;
        w.vy *= -0.25;
      }
    }
    w.vx *= 1 - 0.15 * dt;
    w.grounded = false;
    w.walkAmt = 0;
  }

  detonateSheep(): void {
    for (const p of this.projs) if (p.kind === 'sheep') p.detonate = true;
  }

  hasSheep(): boolean {
    return this.projs.some((p) => p.kind === 'sheep' && !p.dead);
  }

  // ───────────────────────────── armas ─────────────────────────────

  private mkProj(kind: ProjKind, x: number, y: number, vx: number, vy: number, owner: Worm | null): Proj {
    return {
      id: this.nextId++,
      kind,
      team: owner ? owner.team : -1,
      owner: owner ? owner.id : -1,
      x,
      y,
      vx,
      vy,
      grounded: false,
      t: 0,
      fuse: 3,
      angle: Math.atan2(vy, vx),
      spin: 0,
      resting: false,
      tx: 0,
      ty: 0,
      hasTarget: false,
      dir: 1,
      hopT: 0.5,
      dropX: 0,
      dropped: false,
      detonate: false,
      bounces: 0,
      dead: false,
    };
  }

  fire(w: Worm, id: WeaponId, p: FireParams): void {
    const team = this.teams[w.team];
    if (team && team.ammo[id] > 0) team.ammo[id]--;
    w.throwT = 0.35;
    w.holding = id;
    const mx = w.x + p.dx * 13;
    const my = w.y + p.dy * 13 - 1;
    const sp = (a: number, b: number) => a + p.power * (b - a);
    switch (id) {
      case 'bazooka': {
        const s = sp(180, 1000);
        const pr = this.mkProj('rocket', mx, my, p.dx * s, p.dy * s, w);
        this.projs.push(pr);
        this.events.push({ t: 'sound', name: 'shoot', x: mx, y: my });
        break;
      }
      case 'grenade': {
        const s = sp(110, 780);
        const pr = this.mkProj('grenade', mx, my, p.dx * s, p.dy * s, w);
        pr.fuse = Math.max(1, Math.min(5, p.fuse));
        pr.spin = p.dx >= 0 ? 7 : -7;
        this.projs.push(pr);
        this.events.push({ t: 'sound', name: 'throw', x: mx, y: my });
        break;
      }
      case 'holy': {
        const s = sp(110, 760);
        const pr = this.mkProj('holy', mx, my, p.dx * s, p.dy * s, w);
        pr.fuse = 4;
        pr.spin = p.dx >= 0 ? 5 : -5;
        this.projs.push(pr);
        this.events.push({ t: 'sound', name: 'holy', x: mx, y: my });
        break;
      }
      case 'slipper': {
        const s = sp(300, 520);
        const pr = this.mkProj('slipper', mx, my, p.dx * s, p.dy * s, w);
        pr.tx = p.tx;
        pr.ty = p.ty;
        pr.hasTarget = p.tx !== 0 || p.ty !== 0;
        pr.fuse = 8;
        this.projs.push(pr);
        this.events.push({ t: 'sound', name: 'shoot', x: mx, y: my });
        break;
      }
      case 'sheep': {
        const pr = this.mkProj('sheep', w.x + w.facing * 12, w.y, 0, 0, w);
        pr.dir = w.facing;
        pr.fuse = 6;
        this.projs.push(pr);
        this.events.push({ t: 'sound', name: 'baa', x: w.x, y: w.y });
        break;
      }
      case 'pigeons': {
        const rng = new Rng(p.seed);
        const dir = w.x < p.tx ? 1 : -1;
        for (let i = 0; i < 5; i++) {
          const off = Math.abs(i - 2);
          const pr = this.mkProj('pigeon', p.tx - dir * (640 + off * 36 + rng.range(0, 14)), 70 + off * 16, dir * 270, 0, w);
          pr.dropX = p.tx + (i - 2) * 52 * dir;
          pr.dir = dir;
          pr.tx = p.tx;
          this.projs.push(pr);
        }
        this.events.push({ t: 'sound', name: 'coo', x: p.tx, y: 60 });
        break;
      }
      case 'mine': {
        const m: Mine = {
          x: w.x + w.facing * 10,
          y: w.y + 2,
          vx: w.facing * 30,
          vy: -50,
          grounded: false,
          armT: 2,
          trigger: -1,
          team: w.team,
          blink: 0,
          dead: false,
        };
        this.mines.push(m);
        this.events.push({ t: 'sound', name: 'plant', x: m.x, y: m.y });
        break;
      }
      case 'torch': {
        w.torch = { dx: p.dx, dy: p.dy, t: 3.2, dist: 0, dmgT: 0 };
        this.events.push({ t: 'sound', name: 'torch', x: w.x, y: w.y });
        break;
      }
      case 'kamikaze': {
        w.kami = { dx: p.dx, dy: p.dy, t: 1.0 };
        w.grounded = false;
        this.events.push({ t: 'sound', name: 'kami', x: w.x, y: w.y });
        break;
      }
      case 'slap': {
        this.events.push({ t: 'slap', x: w.x + w.facing * 14, y: w.y });
        this.events.push({ t: 'sound', name: 'slap', x: w.x, y: w.y });
        for (const o of this.worms) {
          if (o === w || o.state === 'gone') continue;
          const dx = o.x - w.x;
          const dy = o.y - w.y;
          if (Math.abs(dy) < 20 && dx * w.facing > -4 && Math.abs(dx) < 28) {
            o.vx = w.facing * 380;
            o.vy = -300;
            o.grounded = false;
            o.launched = true;
            o.panic = 1;
            if (o.rope) o.rope = null;
            if (o.state === 'alive') this.hurt(o, 22, w.team, false);
          }
        }
        break;
      }
      case 'rope': {
        this.ropeShoot(w, p.dx, p.dy);
        break;
      }
    }
  }

  // ───────────────────────────── dano ─────────────────────────────

  hurt(w: Worm, amount: number, srcTeam: number, fall: boolean): void {
    if (w.state !== 'alive') return;
    const dealt = Math.min(amount, w.hp);
    w.hp -= amount;
    w.hurtT = 0.55;
    if (srcTeam >= 0) w.lastHit = srcTeam;
    if (srcTeam >= 0 && srcTeam !== w.team && this.teams[srcTeam]) this.teams[srcTeam].dmgDealt += dealt;
    this.events.push({ t: 'damage', w, amount, fall });
    if (w.hp <= 0) {
      w.hp = 0;
      this.killWorm(w, fall ? 'fall' : 'blast');
    } else {
      this.events.push({ t: 'speak', w, kind: fall ? 'fall' : amount >= 35 ? 'bighurt' : 'hurt' });
    }
  }

  killWorm(w: Worm, cause: 'blast' | 'drown' | 'out' | 'kami' | 'fall'): void {
    if (w.state !== 'alive') return;
    w.hp = 0;
    w.rope = null;
    w.kami = null;
    w.torch = null;
    w.net = null;
    w.state = cause === 'drown' || cause === 'out' ? 'gone' : 'tomb';
    w.tombT = 0;
    if (w.lastHit >= 0 && w.lastHit !== w.team && this.teams[w.lastHit]) this.teams[w.lastHit].kills++;
    this.events.push({ t: 'die', w, cause });
  }

  explode(x: number, y: number, r: number, dmg: number, push: number, team: number, kind: string): void {
    this.events.push({ t: 'explosion', x, y, r, kind });
    this.carveExplosion(x, y, r);
    const blast = r * 1.55;
    for (const w of this.worms) {
      if (w.state === 'gone') continue;
      const dx = w.x - x;
      const dy = w.y - 2 - y;
      const d = Math.hypot(dx, dy);
      const f = 1 - Math.max(0, d - WORM_R) / blast;
      if (f <= 0) continue;
      const nx = d > 0.01 ? dx / d : 0;
      const ny = d > 0.01 ? dy / d : -1;
      const power = push * f;
      w.vx += nx * power;
      w.vy += ny * power - power * 0.28;
      w.grounded = false;
      w.launched = true;
      w.panic = 1;
      w.rope = null;
      w.net = null;
      if (w.state === 'alive') this.hurt(w, Math.max(1, Math.round(dmg * f)), team, false);
    }
    for (const m of this.mines) {
      if (m.dead) continue;
      if (Math.hypot(m.x - x, m.y - y) < blast && m.trigger < 0) m.trigger = 0.12 + Math.random() * 0.2;
    }
    for (const c of this.crates) {
      if (!c.dead && Math.hypot(c.x - x, c.y - y) < r * 0.9) c.dead = true;
    }
  }

  private carveExplosion(x: number, y: number, r: number): void {
    this.terrain.carve(x, y, r);
    const rg = new Rng(((x * 13 + y * 7) | 0) ^ 0x5bd1e995);
    for (let k = 0; k < 4; k++) {
      const a = rg.range(0, Math.PI * 2);
      this.terrain.carve(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * rg.range(0.25, 0.4));
    }
    this.events.push({ t: 'debris', x, y, r });
  }

  // ───────────────────────────── atualização ─────────────────────────────

  step(dt: number): void {
    this.time += dt;
    if (this.waterY < this.waterTarget) this.waterY = Math.min(this.waterTarget, this.waterY + 16 * dt);
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        d.fn();
      }
    }
    for (const w of this.worms) this.updateWorm(w, dt);
    for (const p of this.projs.slice()) this.updateProj(p, dt);
    this.projs = this.projs.filter((p) => !p.dead);
    for (const m of this.mines.slice()) this.updateMine(m, dt);
    this.mines = this.mines.filter((m) => !m.dead);
    for (const c of this.crates) this.updateCrate(c, dt);
    this.crates = this.crates.filter((c) => !c.dead);
  }

  private updateWorm(w: Worm, dt: number): void {
    if (w.state === 'gone') return;
    w.hurtT = Math.max(0, w.hurtT - dt);
    w.throwT = Math.max(0, w.throwT - dt);
    w.speechT -= dt;
    w.blinkT -= dt;
    if (w.blinkT < -0.13) w.blinkT = 2 + Math.random() * 3.5;
    w.shownHp += (w.hp - w.shownHp) * Math.min(1, dt * 5);

    if (w.state === 'tomb') {
      w.tombT += dt;
      if (w.grounded) w.vx *= Math.max(0, 1 - 9 * dt);
      this.moveBody(w, dt, WORM_R, 0.3);
      this.envCheck(w);
      return;
    }

    if (w.kami) {
      this.updateKami(w, dt);
      return;
    }
    if (w.torch) {
      this.updateTorch(w, dt);
      return;
    }

    const active = w.id === this.activeId;
    if (active && !this.controlled && w.net) {
      const age = Math.min(0.25, this.time - w.net.t);
      const tx = w.net.x + w.net.vx * age;
      const ty = w.net.y + w.net.vy * age;
      const k = Math.min(1, dt * 14);
      w.x += (tx - w.x) * k;
      w.y += (ty - w.y) * k;
      w.vx = w.net.vx;
      w.vy = w.net.vy;
      w.grounded = Math.abs(w.net.vy) < 12 && !w.rope;
      const moving = Math.abs(w.net.vx) > 10 && w.grounded;
      w.walkAmt += ((moving ? 1 : 0) - w.walkAmt) * Math.min(1, dt * 10);
      if (moving) w.walkT += dt;
      this.envCheck(w);
      return;
    }

    if (active && this.controlled) {
      if (w.rope) {
        this.ropePhysics(w, dt);
        this.envCheck(w);
        return;
      }
      if (w.grounded && this.canMove) {
        const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
        if (dir !== 0) {
          w.facing = dir > 0 ? 1 : -1;
          this.walkBody(w, dir, 72, dt, WORM_R);
          w.walkT += dt;
          w.walkAmt += (1 - w.walkAmt) * Math.min(1, dt * 12);
          w.vx = 0;
        } else {
          w.walkAmt += (0 - w.walkAmt) * Math.min(1, dt * 12);
        }
      } else {
        w.walkAmt += (0 - w.walkAmt) * Math.min(1, dt * 12);
      }
    } else {
      w.walkAmt += (0 - w.walkAmt) * Math.min(1, dt * 12);
    }

    if (w.grounded && !(active && this.controlled && this.canMove)) w.vx *= Math.max(0, 1 - 9 * dt);
    this.moveBody(w, dt, WORM_R, 0.35, (imp) => this.onWormImpact(w, imp));
    if (w.grounded && Math.abs(w.vx) < 30 && w.launched) {
      w.launched = false;
      w.spin = 0;
    }
    if (w.launched && !w.grounded) w.spin += (w.vx >= 0 ? 1 : -1) * 7 * dt;
    if (!w.grounded && (w.launched || Math.abs(w.vy) > 260)) w.panic = Math.max(w.panic, 0.8);
    else w.panic = Math.max(0, w.panic - dt * 1.5);
    this.envCheck(w);
  }

  private onWormImpact(w: Worm, imp: number): void {
    if (w.state !== 'alive') return;
    if (imp > 470) {
      const dmg = Math.floor((imp - 470) / 10) + 1;
      this.hurt(w, Math.min(dmg, 40), -1, true);
      this.events.push({ t: 'sound', name: 'thud', x: w.x, y: w.y });
    } else if (imp > 260) {
      this.events.push({ t: 'sound', name: 'thud', x: w.x, y: w.y });
    }
  }

  private envCheck(w: Worm): void {
    if (w.state === 'gone') return;
    if (w.y > this.waterY - 2) {
      this.events.push({ t: 'splash', x: w.x, y: this.waterY, size: 1.4 });
      if (w.state === 'alive') {
        this.killWorm(w, 'drown');
      } else {
        w.state = 'gone';
      }
      return;
    }
    if (w.x < -260 || w.x > WORLD_W + 260 || w.y < -1500) {
      if (w.state === 'alive') this.killWorm(w, 'out');
      else w.state = 'gone';
      return;
    }
    if (w.state === 'alive') {
      for (const c of this.crates) {
        if (c.dead) continue;
        if (Math.abs(c.x - w.x) < 20 && Math.abs(c.y - w.y) < 22) {
          c.dead = true;
          const team = this.teams[w.team];
          if (c.kind === 'hp') {
            w.hp = Math.min(MAX_HP + 50, w.hp + 30);
            this.events.push({ t: 'pickup', w, text: '+30 PV 🍌' });
          } else if (team) {
            if (team.ammo[c.weapon] >= 0) team.ammo[c.weapon] += 1;
            this.events.push({ t: 'pickup', w, text: `+1 ${WEAPONS[c.weapon].name}` });
          }
        }
      }
    }
  }

  private updateKami(w: Worm, dt: number): void {
    const k = w.kami;
    if (!k) return;
    k.t -= dt;
    w.panic = 1;
    const sp = 400;
    let boom = k.t <= 0;
    const n = 4;
    for (let i = 0; i < n && !boom; i++) {
      w.x += (k.dx * sp * dt) / n;
      w.y += (k.dy * sp * dt) / n;
      if (this.hits(w.x, w.y, 6)) boom = true;
      for (const o of this.worms) {
        if (o === w || o.state !== 'alive') continue;
        if (Math.hypot(o.x - w.x, o.y - w.y) < WORM_R + 6) boom = true;
      }
      if (w.y > this.waterY) boom = true;
    }
    this.events.push({ t: 'trail', x: w.x - k.dx * 8, y: w.y - k.dy * 8, kind: 'fire' });
    if (boom) {
      w.kami = null;
      const x = w.x;
      const y = w.y;
      const lh = w.team;
      this.killWorm(w, 'kami');
      w.lastHit = -1;
      w.vx = 0;
      w.vy = 0;
      w.x = x;
      w.y = Math.min(y, this.waterY - 20);
      this.explode(x, y, 64, 62, 660, lh, 'kami');
    }
  }

  private updateTorch(w: Worm, dt: number): void {
    const t = w.torch;
    if (!t) return;
    t.t -= dt;
    t.dmgT -= dt;
    const sp = 40;
    const mx = t.dx * sp * dt;
    const my = t.dy * sp * dt;
    const nx = w.x + mx;
    const ny = w.y + my;
    t.dist += Math.hypot(mx, my);
    this.terrain.carve(w.x + t.dx * 8, w.y + t.dy * 8, 13);
    if (!this.hits(nx, ny, WORM_R - 1)) {
      w.x = nx;
      w.y = ny;
    }
    this.events.push({ t: 'trail', x: w.x + t.dx * 14, y: w.y + t.dy * 14, kind: 'fire' });
    if (t.dmgT <= 0) {
      t.dmgT = 0.25;
      for (const o of this.worms) {
        if (o === w || o.state !== 'alive') continue;
        if (Math.hypot(o.x - (w.x + t.dx * 12), o.y - (w.y + t.dy * 12)) < 22) this.hurt(o, 3, w.team, false);
      }
    }
    if (t.t <= 0) {
      w.torch = null;
      w.vx = 0;
      w.vy = 0;
    }
  }

  // ───────────────────────────── projéteis ─────────────────────────────

  /** Voo balístico com colisão. Retorna 'hit' ao tocar o terreno (sem quicar). */
  private flight(p: Proj, dt: number, grav: number, windF: number): 'hit' | null {
    p.vx += this.wind * WIND_ACC * windF * dt;
    p.vy += grav * dt;
    const dist = Math.hypot(p.vx, p.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / 3));
    for (let i = 0; i < n; i++) {
      const nx = p.x + (p.vx * dt) / n;
      const ny = p.y + (p.vy * dt) / n;
      if (this.solid(nx, ny)) {
        this.hitX = nx;
        this.hitY = ny;
        return 'hit';
      }
      p.x = nx;
      p.y = ny;
    }
    return null;
  }

  /** Passo de granada (quica). Retorna true se caiu na água. */
  private stepBouncy(p: Proj, dt: number): boolean {
    const heavy = p.kind === 'holy';
    if (p.resting) {
      if (!this.solid(p.x, p.y + 2.5)) p.resting = false;
      else {
        p.angle += p.spin * dt * 0.0;
        return false;
      }
    }
    const res = this.flight(p, dt, GRAV, heavy ? 0.1 : 0.12);
    p.angle += p.spin * dt;
    if (res === 'hit') {
      const nrm = this.normalAt(this.hitX, this.hitY);
      const vn = p.vx * nrm.x + p.vy * nrm.y;
      if (vn < 0) {
        const e = heavy ? 0.32 : 0.5;
        p.vx -= (1 + e) * vn * nrm.x;
        p.vy -= (1 + e) * vn * nrm.y;
        p.vx *= 0.9;
        p.bounces++;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 90) this.events.push({ t: 'bounce', x: p.x, y: p.y });
        if (sp < 40) {
          p.vx = 0;
          p.vy = 0;
          p.resting = true;
        }
      }
    }
    return p.y > this.waterY;
  }

  private wormContact(x: number, y: number, rad: number, p: Proj): Worm | null {
    for (const w of this.worms) {
      if (w.state === 'gone') continue;
      if (w.id === p.owner && p.t < 0.35) continue;
      if (Math.hypot(w.x - x, w.y - y) < WORM_R + rad) return w;
    }
    return null;
  }

  private boom(p: Proj, r: number, dmg: number, push: number, kind: string): void {
    p.dead = true;
    this.explode(p.x, p.y, r, dmg, push, p.team, kind);
  }

  private updateProj(p: Proj, dt: number): void {
    if (p.dead) return;
    p.t += dt;
    switch (p.kind) {
      case 'rocket': {
        const res = this.flight(p, dt, GRAV * 0.85, 1);
        p.angle = Math.atan2(p.vy, p.vx);
        this.events.push({ t: 'trail', x: p.x, y: p.y, kind: 'smoke' });
        if (res === 'hit' || this.wormContact(p.x, p.y, 4, p)) {
          this.boom(p, 38, 45, 560, 'rocket');
        } else this.projBounds(p);
        break;
      }
      case 'slipper': {
        if (p.hasTarget) {
          const want = Math.atan2(p.ty - p.y, p.tx - p.x);
          let cur = Math.atan2(p.vy, p.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          cur += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
          const sp = Math.min(470, Math.hypot(p.vx, p.vy) + 400 * dt);
          p.vx = Math.cos(cur) * sp;
          p.vy = Math.sin(cur) * sp;
        } else {
          p.vy += GRAV * 0.5 * dt;
        }
        const res = this.flight(p, dt, 0, 0.2);
        p.angle = Math.atan2(p.vy, p.vx);
        p.fuse -= dt;
        this.events.push({ t: 'trail', x: p.x, y: p.y, kind: 'fire' });
        const near = p.hasTarget && Math.hypot(p.tx - p.x, p.ty - p.y) < 10;
        if (res === 'hit' || near || p.fuse <= 0 || this.wormContact(p.x, p.y, 5, p)) {
          this.boom(p, 36, 40, 500, 'slipper');
        } else this.projBounds(p);
        break;
      }
      case 'poop': {
        const res = this.flight(p, dt, GRAV, 0.5);
        p.angle += 6 * dt;
        if (res === 'hit' || this.wormContact(p.x, p.y, 3, p)) this.boom(p, 27, 24, 400, 'poop');
        else this.projBounds(p);
        break;
      }
      case 'grenade':
      case 'holy': {
        const water = this.stepBouncy(p, dt);
        p.fuse -= dt;
        if (p.kind === 'holy') this.events.push({ t: 'trail', x: p.x, y: p.y, kind: 'holy' });
        else if (p.fuse < 1.2 && Math.floor(p.t * 10) % 2 === 0) this.events.push({ t: 'fuse', x: p.x, y: p.y });
        if (water) {
          p.dead = true;
          this.events.push({ t: 'splash', x: p.x, y: this.waterY, size: 1 });
        } else if (p.fuse <= 0) {
          if (p.kind === 'holy') this.boom(p, 100, 92, 900, 'holy');
          else this.boom(p, 43, 50, 580, 'grenade');
        }
        if (p.x < -300 || p.x > WORLD_W + 300) p.dead = true;
        break;
      }
      case 'sheep': {
        p.fuse -= dt;
        p.hopT -= dt;
        const R = 8;
        if (p.grounded) {
          const moved = this.walkBody(p, p.dir, 85, dt, R);
          p.vx = 0;
          if (!moved || p.hopT <= 0) {
            p.vy = -250;
            p.grounded = false;
            p.hopT = moved ? 1.0 : 0.45;
          }
        } else {
          p.vx = p.dir * 85;
        }
        this.moveBody(p, dt, R, 0.25);
        p.angle = Math.sin(p.t * 14) * 0.12;
        if (p.y > this.waterY) {
          p.dead = true;
          this.events.push({ t: 'splash', x: p.x, y: this.waterY, size: 1.2 });
        } else if (p.fuse <= 0 || p.detonate) {
          this.boom(p, 56, 68, 640, 'sheep');
        } else if (p.x < -200 || p.x > WORLD_W + 200) p.dead = true;
        break;
      }
      case 'pigeon': {
        p.x += p.vx * dt;
        p.angle = Math.sin(p.t * 16) * 0.2;
        if (Math.random() < 0.04) this.events.push({ t: 'trail', x: p.x, y: p.y, kind: 'feather' });
        if (!p.dropped && ((p.dir > 0 && p.x >= p.dropX) || (p.dir < 0 && p.x <= p.dropX))) {
          p.dropped = true;
          const poop = this.mkProj('poop', p.x, p.y + 8, p.vx * 0.6, 40, null);
          poop.team = p.team;
          poop.owner = p.owner;
          this.projs.push(poop);
        }
        if (p.x < -400 || p.x > WORLD_W + 400) p.dead = true;
        break;
      }
    }
  }

  private projBounds(p: Proj): void {
    if (p.y > this.waterY) {
      p.dead = true;
      this.events.push({ t: 'splash', x: p.x, y: this.waterY, size: 1 });
    } else if (p.x < -400 || p.x > WORLD_W + 400 || p.y < -1800) {
      p.dead = true;
    }
  }

  private updateMine(m: Mine, dt: number): void {
    this.moveBody(m, dt, 5, 0.2);
    if (m.grounded) m.vx *= Math.max(0, 1 - 8 * dt);
    m.blink += dt;
    if (m.y > this.waterY) {
      m.dead = true;
      this.events.push({ t: 'splash', x: m.x, y: this.waterY, size: 0.8 });
      return;
    }
    if (m.armT > 0) {
      m.armT -= dt;
      return;
    }
    if (m.trigger < 0) {
      for (const w of this.worms) {
        if (w.state !== 'alive') continue;
        if (Math.hypot(w.x - m.x, w.y - m.y) < 24) {
          m.trigger = 0.55;
          this.events.push({ t: 'sound', name: 'mine', x: m.x, y: m.y });
          break;
        }
      }
    } else {
      m.trigger -= dt;
      if (m.trigger <= 0) {
        m.dead = true;
        this.explode(m.x, m.y, 44, 55, 560, m.team, 'mine');
      }
    }
  }

  spawnCrate(c: CrateSpawn): void {
    this.crates.push({
      x: c.x,
      y: -40,
      vx: 0,
      vy: 110,
      grounded: false,
      kind: c.kind,
      weapon: c.weapon,
      landed: false,
      t: 0,
      dead: false,
    });
    this.events.push({ t: 'sound', name: 'crate', x: c.x, y: 0 });
  }

  private updateCrate(c: Crate, dt: number): void {
    c.t += dt;
    if (!c.landed) {
      c.y += 110 * dt;
      if (this.solid(c.x, c.y + 11) || this.solid(c.x - 7, c.y + 11) || this.solid(c.x + 7, c.y + 11)) c.landed = true;
      if (c.y > this.waterY) {
        c.dead = true;
        this.events.push({ t: 'splash', x: c.x, y: this.waterY, size: 1 });
      }
    } else if (!this.solid(c.x, c.y + 12) && !this.solid(c.x - 7, c.y + 12) && !this.solid(c.x + 7, c.y + 12)) {
      c.landed = false;
    }
  }

  /** Há ação em andamento? (turno só termina quando tudo assentou) */
  isSettled(): boolean {
    if (this.projs.length > 0 || this.delayed.length > 0) return false;
    for (const w of this.worms) {
      if (w.state === 'gone') continue;
      if (w.kami || w.torch) return false;
      if (w.rope) continue;
      if (!w.grounded || Math.abs(w.vx) > 8 || Math.abs(w.vy) > 8) return false;
    }
    for (const m of this.mines) if (!m.grounded || m.trigger >= 0) return false;
    for (const c of this.crates) if (!c.landed) return false;
    return true;
  }

  // ───────────────────────────── predição (IA) ─────────────────────────────

  predict(kind: 'rocket' | 'grenade', x: number, y: number, vx: number, vy: number, fuse: number): Prediction {
    const p = this.mkProj(kind, x, y, vx, vy, null);
    p.fuse = fuse;
    p.spin = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 700; i++) {
      p.t += dt;
      if (kind === 'rocket') {
        const res = this.flight(p, dt, GRAV * 0.85, 1);
        if (res === 'hit') return { x: p.x, y: p.y, t: p.t, water: false };
        if (p.y > this.waterY) return { x: p.x, y: this.waterY, t: p.t, water: true };
      } else {
        const water = this.stepBouncy(p, dt);
        p.fuse -= dt;
        if (water) return { x: p.x, y: this.waterY, t: p.t, water: true };
        if (p.fuse <= 0) return { x: p.x, y: p.y, t: p.t, water: false };
      }
      if (p.x < -300 || p.x > WORLD_W + 300) return { x: p.x, y: p.y, t: p.t, water: true };
    }
    return { x: p.x, y: p.y, t: p.t, water: false };
  }

  // ───────────────────────────── rede ─────────────────────────────

  makeSnapshot(): Snapshot {
    return {
      w: this.worms.map((w) => [
        R2(w.x),
        R2(w.y),
        R2(w.vx),
        R2(w.vy),
        Math.round(w.hp),
        w.state === 'alive' ? 0 : w.state === 'tomb' ? 1 : 2,
        w.facing,
      ]),
      m: this.mines.map((m) => [R2(m.x), R2(m.y), R2(m.armT), R2(m.trigger), m.team]),
      c: this.crates.map((c) => [R2(c.x), R2(c.y), c.landed ? 1 : 0, c.kind === 'hp' ? 0 : 1, WEAPON_ORDER.indexOf(c.weapon)]),
      water: this.waterTarget,
      ammo: this.teams.map((t) => WEAPON_ORDER.map((id) => t.ammo[id])),
      cr: this.terrain.craters.slice(),
      sc: this.terrain.solidCount,
      st: this.teams.map((t) => [t.dmgDealt, t.kills]),
    };
  }

  applySnapshot(s: Snapshot): void {
    if (s.sc !== this.terrain.solidCount || s.cr.length !== this.terrain.craters.length) {
      this.terrain.rebuild(this.seed, this.teams.length, s.cr);
    }
    for (let i = 0; i < this.worms.length && i < s.w.length; i++) {
      const w = this.worms[i];
      const a = s.w[i];
      w.x = a[0];
      w.y = a[1];
      w.vx = a[2];
      w.vy = a[3];
      w.hp = a[4];
      if (a[5] === 0) w.state = 'alive';
      else if (a[5] === 1) w.state = 'tomb';
      else w.state = 'gone';
      w.facing = a[6] >= 0 ? 1 : -1;
      w.rope = null;
      w.kami = null;
      w.torch = null;
      w.net = null;
      if (w.state !== 'alive') w.shownHp = 0;
    }
    this.mines = s.m.map((a) => ({
      x: a[0],
      y: a[1],
      vx: 0,
      vy: 0,
      grounded: false,
      armT: a[2],
      trigger: a[3],
      team: a[4],
      blink: 0,
      dead: false,
    }));
    this.crates = s.c.map((a) => ({
      x: a[0],
      y: a[1],
      vx: 0,
      vy: 0,
      grounded: false,
      landed: a[2] === 1,
      kind: a[3] === 0 ? 'hp' : 'ammo',
      weapon: WEAPON_ORDER[a[4]] ?? 'bazooka',
      t: 0,
      dead: false,
    }));
    this.waterTarget = s.water;
    if (this.waterY < s.water - 60) this.waterY = s.water - 60;
    for (let i = 0; i < this.teams.length && i < s.ammo.length; i++) {
      WEAPON_ORDER.forEach((id, k) => {
        this.teams[i].ammo[id] = s.ammo[i][k];
      });
      this.teams[i].dmgDealt = s.st[i][0];
      this.teams[i].kills = s.st[i][1];
    }
    this.projs = [];
  }
}
