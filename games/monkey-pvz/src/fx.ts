// Juice: partículas, entulho, fantasmas de gorila, textos flutuantes, banners, screen shake e reação a eventos.
import { sfx } from './audio';
import { drawArmOnly, drawArmorPiece, drawHeadOnly, drawZombie, GhostFx } from './draw-zombies';
import { C, TAU, circ, ell, outlineText, poly } from './gfx';
import { Mood } from './scene';
import { CELL_H, Ev, LAWN_Y, W, Zombie, World, rowY } from './sim';
import { ZOMBIES, ZombieId } from './data';

type PKind = 'c' | 's' | 'l' | 'r' | 'k' | 'f' | 'b';
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: PKind;
  rot: number;
  vr: number;
  grow: number;
}

interface FloatText {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
  max: number;
  size: number;
}

interface Debris {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  z?: Zombie;
}

interface Ghost {
  z: Zombie;
  t: number;
  how: string;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  rot: number;
  fxx: GhostFx;
}

export interface Banner {
  s: string;
  sub: string;
  life: number;
  max: number;
  color: string;
  big: boolean;
}

export function mkZombie(type: ZombieId, x: number, r: number, hasArmor: boolean, armLost: boolean): Zombie {
  const def = ZOMBIES[type];
  return {
    id: 0,
    type,
    r,
    x,
    hp: 1,
    maxHp: def.hp,
    armor: hasArmor ? 1 : 0,
    maxArmor: hasArmor ? 1 : 0,
    slow: 0,
    eat: false,
    biteT: 0,
    flash: 0,
    armLost,
    jumpT: 0,
    jumpFrom: 0,
    jumpTo: 0,
    jumped: false,
    enraged: false,
    owner: 0,
    phase: Math.random() * 6,
    aura: 1,
    vx: 0,
    t1: 0,
    t2: 0,
    big: type === 'chefe',
  };
}

const rowOfY = (y: number): number => Math.max(0, Math.min(4, Math.round((y - rowY(0)) / CELL_H)));
const R = (a: number, b: number): number => a + Math.random() * (b - a);

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  debris: Debris[] = [];
  ghosts: Ghost[] = [];
  shake = 0;
  banner: Banner | null = null;
  mood: Mood = 'idle';
  moodT = 0;
  flash = 0;
  flashColor = '#fff';

  reset(): void {
    this.parts = [];
    this.texts = [];
    this.debris = [];
    this.ghosts = [];
    this.shake = 0;
    this.banner = null;
    this.mood = 'idle';
    this.moodT = 0;
    this.flash = 0;
  }

  burst(x: number, y: number, n: number, color: string, speed: number, kind: PKind = 'c', size = 3, life = 0.6, g = 380): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.25,
        g,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        kind,
        rot: Math.random() * TAU,
        vr: R(-8, 8),
        grow: 0,
      });
    }
  }

  ring(x: number, y: number, size: number, color: string, life = 0.4): void {
    this.parts.push({ x, y, vx: 0, vy: 0, g: 0, life, max: life, size, color, kind: 'r', rot: 0, vr: 0, grow: size * 5 });
  }

  text(x: number, y: number, s: string, c = '#fde047', size = 20, life = 1.1): void {
    this.texts.push({ x, y, s, c, life, max: life, size });
  }

  setMood(m: Mood, dur = 1.6): void {
    if (this.mood === 'panic' && m !== 'panic' && this.moodT > 0.2) return;
    this.mood = m;
    this.moodT = dur;
  }

  showBanner(s: string, sub = '', color = '#fde047', big = false, life = 2.6): void {
    this.banner = { s, sub, life, max: life, color, big };
  }

  addDebris(kind: string, x: number, y: number, vx = R(-120, 120), vy = R(-260, -140), z?: Zombie): void {
    this.debris.push({ kind, x, y, vx, vy, rot: 0, vr: R(-9, 9), life: 1.6, z });
  }

  handle(ev: Ev, w: World): void {
    const x = ev.x ?? 0;
    const y = ev.y ?? 0;
    switch (ev.k) {
      case 'snd':
        if (ev.s) sfx(ev.s);
        break;
      case 'plant':
        sfx('plop');
        this.burst(x, y, 10, '#7c4a21', 130, 'c', 3.4, 0.5);
        this.burst(x, y - 10, 5, '#4ade80', 110, 'l', 4, 0.6);
        break;
      case 'dig':
        sfx('dig');
        this.burst(x, y, 9, '#7c4a21', 130, 'c', 3.4, 0.5);
        break;
      case 'shoot':
        sfx('shoot', 0.8);
        this.burst(x, y, 3, ev.s === 'gelado' ? '#bae6fd' : '#fef3c7', 70, 'c', 2.4, 0.25, 0);
        break;
      case 'hit':
        if (ev.n === 1) {
          sfx('clang', 0.6);
          this.burst(x, y - 36, 4, '#e5e7eb', 150, 's', 3, 0.3);
        } else {
          sfx('thunk');
          this.burst(x, y - 36, 4, '#a3e635', 120, 'c', 3, 0.35);
          this.burst(x, y - 36, 2, '#6b7f5a', 100, 'l', 3.4, 0.5);
        }
        break;
      case 'splat':
        sfx('splat');
        this.burst(x, y, 7, ev.c ?? '#a16207', 150, 'c', 3.2, 0.4);
        break;
      case 'freeze':
        sfx('freeze', 0.7);
        this.burst(x, y - 30, 8, '#e0f2fe', 140, 's', 4, 0.5);
        break;
      case 'bite':
        sfx('chomp', 0.8);
        this.burst(x, y, 3, '#4ade80', 90, 'l', 3.6, 0.5);
        break;
      case 'hug':
        sfx('hug');
        this.burst(x + 30, y - 30, 6, '#fefce8', 120, 's', 3.4, 0.35);
        break;
      case 'arm': {
        sfx('rip');
        this.addDebris('arm', x, y - 20, R(-60, 160), R(-300, -200));
        this.burst(x, y - 20, 6, '#dc2626', 130, 'c', 3, 0.45);
        this.text(x, y - 60, 'Ai, meu braço!', '#fda4af', 16, 1);
        break;
      }
      case 'armor': {
        sfx('clang');
        const t = ev.z ?? 'cone';
        this.addDebris(t, x, y - 30);
        this.burst(x, y - 30, 8, '#e5e7eb', 170, 's', 3.4, 0.4);
        break;
      }
      case 'zdie':
        this.zombieDie(ev, w);
        break;
      case 'pdie':
        sfx('pdie');
        this.burst(x, y - 30, 12, '#4ade80', 170, 'l', 5, 0.8);
        this.burst(x, y - 30, 6, '#fde047', 120, 'c', 3, 0.5);
        this.text(x, y - 60, 'Nããão!', '#fda4af', 16, 0.9);
        this.setMood('scared', 1.2);
        break;
      case 'boom':
        this.explosion(ev);
        break;
      case 'collect':
        sfx('collect');
        this.text(x, y - 20, `+${ev.n ?? 25}`, '#fde047', 22, 0.9);
        this.burst(x, y, 6, '#fde047', 130, 's', 3.4, 0.45);
        break;
      case 'text':
        if (ev.s) this.text(x, y, ev.s, ev.c ?? '#fde047', 18, 1.2);
        break;
      case 'shake':
        this.shake = Math.max(this.shake, ev.n ?? 8);
        break;
      case 'wave': {
        const n = ev.n ?? 1;
        const total = w.level.waves;
        const final = w.level.mode !== 'survival' && n >= total;
        if (ev.f) {
          sfx('horn');
          this.shake = Math.max(this.shake, 8);
          this.showBanner(final ? 'ONDA FINAL!' : 'BANDEIRA!', 'UMA ENORME ONDA DE GORILAS!', '#f87171', true, 3.2);
          this.setMood('scared', 2.5);
        } else {
          sfx('wave');
          const lbl = w.level.mode === 'survival' ? `ONDA ${n}` : `ONDA ${n}/${total}`;
          this.showBanner(n === 1 ? 'A GORILADA CHEGOU!' : lbl, ev.s ?? '', '#fde047', false, 1.9);
        }
        break;
      }
      case 'warn':
        sfx('horn', 0.7);
        this.showBanner('UMA ENORME ONDA DE GORILAS', 'SE APROXIMA...', '#fb7185', true, 3);
        break;
      case 'mower':
        sfx('mower');
        this.setMood('panic', 2.4);
        this.text(x + 30, rowY(ev.r ?? 2) - 40, 'AAAAAAA!', '#fb7185', 22, 1.2);
        break;
      case 'mood':
        if (ev.s === 'cheer') {
          if (Math.random() < 0.12) this.setMood('cheer', 1.2);
        } else this.setMood((ev.s as Mood) ?? 'idle');
        break;
      case 'roar':
        sfx('roar');
        this.shake = Math.max(this.shake, 16);
        this.flash = 0.25;
        this.flashColor = '#fecaca';
        this.setMood('scared', 2.2);
        break;
      case 'stomp':
        sfx('stomp');
        this.shake = Math.max(this.shake, 14);
        this.ring(x, y, 22, 'rgba(255,237,213,.8)', 0.6);
        this.burst(x, y, 16, '#a16207', 220, 'k', 9, 0.8, 0);
        break;
      case 'thud':
        sfx('thud');
        this.burst(x, y, 6, '#a3a380', 100, 'k', 6, 0.5, 0);
        break;
      case 'jump':
        sfx('jump');
        this.burst(x, y, 5, '#bef264', 90, 'l', 3.6, 0.5);
        break;
      case 'jaca':
        sfx('jump');
        break;
      case 'poof':
        this.burst(x, y, 5, '#fde047', 90, 's', 3.4, 0.4);
        break;
      case 'armed':
        sfx('ping');
        this.text(x, y - 30, 'ARMADA!', '#fb923c', 15, 0.9);
        this.burst(x, y, 6, '#fb923c', 90, 's', 3, 0.4);
        break;
      case 'win':
        sfx('win');
        this.setMood('cheer', 4);
        break;
      case 'lose':
        sfx('lose');
        this.setMood('sad', 6);
        this.shake = 12;
        break;
      default:
        break;
    }
  }

  private explosion(ev: Ev): void {
    const x = ev.x ?? 0;
    const y = ev.y ?? 0;
    const rad = ev.n ?? 80;
    const kind = ev.s ?? 'pimenta';
    if (kind === 'jaca') {
      this.shake = Math.max(this.shake, 9);
      this.ring(x, y, 20, 'rgba(250,250,210,.8)', 0.45);
      this.burst(x, y, 16, '#a3b83a', 220, 'k', 8, 0.7, 0);
      this.burst(x, y, 10, '#fef9c3', 200, 'c', 3.5, 0.6);
      this.text(x, y - 60, 'ESMAGOU!', '#bef264', 22, 1);
      return;
    }
    sfx('boom');
    this.shake = Math.max(this.shake, kind === 'pimenta' ? 14 : 10);
    this.flash = 0.18;
    this.flashColor = kind === 'pimenta' ? '#fed7aa' : '#fef9c3';
    this.ring(x, y, rad * 0.4, kind === 'pimenta' ? 'rgba(251,146,60,.9)' : 'rgba(253,224,71,.9)', 0.5);
    this.burst(x, y, 26, '#f97316', rad * 2.2, 'f', 11, 0.7, -60);
    this.burst(x, y, 18, '#fde047', rad * 2.4, 'f', 8, 0.55, -40);
    this.burst(x, y, 14, '#44403c', rad * 1.3, 'k', 12, 1, -30);
    this.burst(x, y, 10, '#ef4444', rad * 2, 's', 4, 0.6);
    this.text(x, y - 70, kind === 'pimenta' ? 'BOOOM!' : 'KABUM!', '#fb923c', 28, 1.1);
  }

  private zombieDie(ev: Ev, w: World): void {
    const x = ev.x ?? 0;
    const y = ev.y ?? 0;
    const how = ev.how ?? 'normal';
    const type = (ev.z as ZombieId) ?? 'basico';
    sfx('zdie', type === 'chefe' ? 1.5 : 0.8);
    const z = mkZombie(type, x, rowOfY(y), !!ev.f, Math.random() < 0.5);
    // trava animação de caminhada no ponto da morte
    const fxx: GhostFx = { rot: 0, sy: 1, alpha: 1, char: 0, dx: 0, dy: 0, dead: true };
    const ghost: Ghost = { z, t: 0, how, ox: 0, oy: 0, vx: 0, vy: 0, rot: 0, fxx };
    if (how === 'mower') {
      ghost.vx = 380;
      ghost.vy = -520;
      this.burst(x, y - 30, 12, '#4ade80', 220, 'l', 5, 0.7);
      this.text(x, y - 70, 'PIUUUU!', '#fda4af', 20, 1);
    } else if (how === 'burn') {
      this.burst(x, y - 30, 10, '#292524', 120, 'k', 9, 0.9, -40);
    } else if (how === 'crush') {
      fxx.sy = 0.22;
    } else {
      this.burst(x, y - 36, 8, '#a3e635', 160, 'c', 3.4, 0.5);
    }
    if (how !== 'crush') this.addDebris('head', x, y - 60, R(-90, 150), R(-330, -220), z);
    this.ghosts.push(ghost);
    if (w.level.mode === 'versus' && Math.random() < 0.2) this.text(x, y - 80, '+5', '#fde047', 14, 0.8);
  }

  update(dt: number, t: number): void {
    this.shake = Math.max(0, this.shake - dt * 28);
    this.flash = Math.max(0, this.flash - dt);
    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0) this.mood = 'idle';
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt * (p.kind === 'r' ? 1 : 0);
      if (p.kind === 'k') p.size += dt * 10;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const f = this.texts[i];
      f.life -= dt;
      f.y -= 32 * dt;
      if (f.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vy += 760 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (d.life <= 0) this.debris.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      const f = g.fxx;
      if (g.how === 'mower') {
        g.ox += g.vx * dt;
        g.vy += 900 * dt;
        g.oy -= g.vy * dt;
        f.rot += 11 * dt;
        f.dx = g.ox;
        f.dy = g.oy;
        f.alpha = g.t < 0.9 ? 1 : Math.max(0, 1 - (g.t - 0.9) / 0.4);
        if (g.t > 1.3) this.ghosts.splice(i, 1);
      } else if (g.how === 'crush') {
        f.alpha = g.t < 0.7 ? 1 : Math.max(0, 1 - (g.t - 0.7) / 0.5);
        if (g.t > 1.2) this.ghosts.splice(i, 1);
      } else if (g.how === 'burn') {
        f.char = Math.min(1, g.t * 3);
        f.rot = g.t < 0.5 ? g.t * 0.7 : 0.35;
        f.sy = g.t < 0.5 ? 1 : Math.max(0.15, 1 - (g.t - 0.5) * 1.2);
        f.alpha = g.t < 0.9 ? 1 : Math.max(0, 1 - (g.t - 0.9) / 0.5);
        if (Math.random() < 0.4) this.burst(g.z.x, rowY(g.z.r) - 10, 1, '#292524', 40, 'k', 7, 0.8, -50);
        if (g.t > 1.4) this.ghosts.splice(i, 1);
      } else {
        const k = Math.min(1, g.t / 0.5);
        f.rot = k * k * 1.5;
        f.dx = Math.min(22, g.t * 60);
        f.alpha = g.t < 0.9 ? 1 : Math.max(0, 1 - (g.t - 0.9) / 0.6);
        if (g.t > 1.5) this.ghosts.splice(i, 1);
      }
    }
    void t;
  }

  drawGhosts(c: C, t: number): void {
    for (const g of this.ghosts) drawZombie(c, g.z, t, g.fxx);
  }

  drawTop(c: C, t: number): void {
    for (const d of this.debris) {
      c.save();
      c.globalAlpha = Math.min(1, d.life * 2);
      if (d.kind === 'head' && d.z) drawHeadOnly(c, d.x, d.y, d.rot, t, d.z);
      else if (d.kind === 'arm') drawArmOnly(c, d.x, d.y, d.rot);
      else drawArmorPiece(c, d.kind, d.x, d.y, d.rot, t);
      c.restore();
    }
    for (const p of this.parts) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      c.save();
      c.globalAlpha = a;
      switch (p.kind) {
        case 'c':
          circ(c, p.x, p.y, p.size, p.color, 0);
          break;
        case 'f':
          circ(c, p.x, p.y, p.size * a + 1, p.color, 0);
          break;
        case 'k':
          c.globalAlpha = a * 0.55;
          circ(c, p.x, p.y, p.size, p.color, 0);
          break;
        case 's': {
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          const s = p.size;
          poly(c, [0, -s * 1.6, s * 0.5, -s * 0.5, s * 1.6, 0, s * 0.5, s * 0.5, 0, s * 1.6, -s * 0.5, s * 0.5, -s * 1.6, 0, -s * 0.5, -s * 0.5], p.color, 0);
          break;
        }
        case 'l': {
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          ell(c, 0, 0, p.size * 1.6, p.size * 0.8, p.color, 0);
          break;
        }
        case 'r':
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, TAU);
          c.lineWidth = 5 * a + 1;
          c.strokeStyle = p.color;
          c.stroke();
          break;
        default:
          break;
      }
      c.restore();
    }
    for (const f of this.texts) {
      const a = Math.min(1, f.life / (f.max * 0.4));
      c.save();
      c.globalAlpha = a;
      outlineText(c, f.s, f.x, f.y, f.size, f.c, 'center', 4);
      c.restore();
    }
    if (this.flash > 0) {
      c.save();
      c.globalAlpha = Math.min(0.5, this.flash * 2.4);
      c.fillStyle = this.flashColor;
      c.fillRect(0, 0, W, 640);
      c.restore();
    }
  }

  drawBanner(c: C): void {
    const b = this.banner;
    if (!b) return;
    const k = b.life / b.max;
    const inT = Math.min(1, (1 - k) * 6);
    const outT = Math.min(1, k * 4);
    const a = Math.min(inT, outT);
    const sc = 0.6 + 0.4 * Math.min(1, inT * 1.2) + (b.big ? Math.sin((1 - k) * 18) * 0.02 : 0);
    c.save();
    c.globalAlpha = a;
    c.translate(W / 2 - 60, LAWN_Y + 190);
    c.scale(sc, sc);
    if (b.big) {
      c.fillStyle = 'rgba(30,5,5,.6)';
      c.fillRect(-W / 2, -46, W, 98);
    }
    outlineText(c, b.s, 0, b.big ? -8 : -6, b.big ? 58 : 44, b.color, 'center', 9);
    if (b.sub) outlineText(c, b.sub, 0, b.big ? 34 : 34, b.big ? 30 : 22, '#fff', 'center', 6);
    c.restore();
  }
}
