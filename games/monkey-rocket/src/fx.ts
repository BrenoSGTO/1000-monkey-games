// Particulas, textos flutuantes e screen shake.
export type PKind = 'flame' | 'spark' | 'banana' | 'smoke' | 'confetti' | 'ring' | 'star';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  grav: number;
}

export interface FloatText {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

const CONFETTI = ['#facc15', '#38bdf8', '#fb923c', '#4ade80', '#f472b6', '#ffffff'];

export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  /** celebracao da torcida (0..1) */
  crowd = 0;

  private add(p: Particle): void {
    if (this.particles.length > 1100) this.particles.shift();
    this.particles.push(p);
  }

  addShake(a: number): void {
    this.shake = Math.min(1.6, this.shake + a);
  }

  doFlash(color: string, amount = 0.6): void {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  boostTrail(x: number, y: number, dx: number, dy: number, team: number): void {
    for (let i = 0; i < 2; i++) {
      const sp = 8 + Math.random() * 8;
      const spread = (Math.random() - 0.5) * 0.5;
      const c = Math.cos(spread);
      const s = Math.sin(spread);
      const vx = (-dx * c + dy * s) * sp;
      const vy = (-dy * c - dx * s) * sp;
      this.add({
        kind: 'flame',
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + (Math.random() - 0.5) * 0.3,
        vx,
        vy,
        life: 0,
        max: 0.32 + Math.random() * 0.2,
        size: 0.5 + Math.random() * 0.45,
        color: i === 0 ? '#fb7185' : team === 0 ? '#facc15' : '#fdba74',
        rot: 0,
        vr: 0,
        grav: 0,
      });
    }
    if (Math.random() < 0.25) {
      this.add({
        kind: 'spark',
        x,
        y,
        vx: -dx * 14 + (Math.random() - 0.5) * 6,
        vy: -dy * 14 + (Math.random() - 0.5) * 6,
        life: 0,
        max: 0.35,
        size: 0.14,
        color: '#fff7ae',
        rot: 0,
        vr: 0,
        grav: -8,
      });
    }
  }

  hitSparks(x: number, y: number, strength: number): void {
    const n = Math.min(26, 4 + Math.floor(strength / 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * (8 + strength * 0.4);
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: 0.25 + Math.random() * 0.3,
        size: 0.12 + Math.random() * 0.14,
        color: Math.random() < 0.5 ? '#fde047' : '#ffffff',
        rot: 0,
        vr: 0,
        grav: -20,
      });
    }
    if (strength > 14) {
      this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, max: 0.3, size: 1.2, color: '#fef9c3', rot: 0, vr: 0, grav: 0 });
    }
  }

  dust(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'smoke',
        x: x + (Math.random() - 0.5) * 2,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: 1 + Math.random() * 3,
        life: 0,
        max: 0.5 + Math.random() * 0.3,
        size: 0.5 + Math.random() * 0.6,
        color: 'rgba(230,230,230,0.55)',
        rot: 0,
        vr: 0,
        grav: 0,
      });
    }
  }

  padBurst(x: number, y: number, big: boolean): void {
    const n = big ? 22 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        kind: 'star',
        x,
        y,
        vx: Math.cos(a) * (3 + Math.random() * 7),
        vy: Math.sin(a) * (3 + Math.random() * 7) + 3,
        life: 0,
        max: 0.5 + Math.random() * 0.3,
        size: 0.35 + Math.random() * 0.25,
        color: big ? '#fb7185' : '#fde047',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 8,
        grav: -6,
      });
    }
  }

  bananaBurst(x: number, y: number, n = 60): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 30;
      this.add({
        kind: 'banana',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.9 + 10,
        life: 0,
        max: 1.6 + Math.random() * 1.2,
        size: 0.8 + Math.random() * 0.8,
        color: '#facc15',
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 12,
        grav: -30,
      });
    }
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        kind: 'flame',
        x,
        y,
        vx: Math.cos(a) * (6 + Math.random() * 20),
        vy: Math.sin(a) * (6 + Math.random() * 20),
        life: 0,
        max: 0.5 + Math.random() * 0.4,
        size: 1.2 + Math.random() * 1.2,
        color: '#fb923c',
        rot: 0,
        vr: 0,
        grav: 0,
      });
    }
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0, max: 0.7, size: 3, color: '#fde047', rot: 0, vr: 0, grav: 0 });
  }

  confetti(x0: number, x1: number, y: number, n = 80): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'confetti',
        x: x0 + Math.random() * (x1 - x0),
        y: y + Math.random() * 6,
        vx: (Math.random() - 0.5) * 8,
        vy: -2 - Math.random() * 6,
        life: 0,
        max: 2.5 + Math.random() * 1.5,
        size: 0.3 + Math.random() * 0.25,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 14,
        grav: -5,
      });
    }
  }

  text(text: string, x: number, y: number, color = '#fde047', size = 1.4, max = 1.1): void {
    if (this.texts.length > 24) this.texts.shift();
    this.texts.push({ text, x, y, vy: 4, life: 0, max, size, color });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'smoke') {
        p.vx *= 0.96;
        p.size += dt * 1.4;
      }
      if (p.kind === 'confetti') p.vx += Math.sin(p.life * 6 + p.rot) * 0.3;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      t.y += t.vy * dt;
      t.vy *= 0.97;
      if (t.life >= t.max) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.crowd = Math.max(0, this.crowd - dt * 0.28);
  }

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
  }
}
