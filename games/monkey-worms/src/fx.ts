export type ParticleKind = 'fire' | 'smoke' | 'debris' | 'spark' | 'splash' | 'star' | 'feather' | 'banana' | 'bubble' | 'holy';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  kind: ParticleKind;
  color: string;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  max: number;
  color: string;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const DIRT = ['#7a4a26', '#5e3a1e', '#8d5a2d', '#4a7a2e', '#3f6b27', '#a3703a'];

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#fff';

  addShake(mag: number): void {
    this.shake = Math.min(26, this.shake + mag);
  }

  private add(p: Partial<Particle> & { kind: ParticleKind; x: number; y: number }): void {
    if (this.parts.length > 1400) this.parts.shift();
    this.parts.push({
      vx: 0,
      vy: 0,
      life: 1,
      max: 1,
      size: 3,
      grow: 0,
      color: '#fff',
      rot: 0,
      vr: 0,
      grav: 0,
      drag: 0,
      ...p,
    });
  }

  explosion(x: number, y: number, r: number, holy = false): void {
    const n = Math.round(r * 0.9);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(40, 90 + r * 4.2);
      this.add({
        kind: holy ? 'holy' : 'fire',
        x: x + Math.cos(a) * rnd(0, r * 0.4),
        y: y + Math.sin(a) * rnd(0, r * 0.4),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 30,
        life: rnd(0.35, 0.85),
        max: 0.85,
        size: rnd(r * 0.12, r * 0.28),
        grow: -r * 0.12,
        drag: 2.2,
      });
    }
    for (let i = 0; i < Math.round(r * 0.35); i++) {
      this.add({
        kind: 'smoke',
        x: x + rnd(-r * 0.6, r * 0.6),
        y: y + rnd(-r * 0.6, r * 0.4),
        vx: rnd(-30, 30),
        vy: rnd(-80, -20),
        life: rnd(1.1, 2.4),
        max: 2.4,
        size: rnd(r * 0.2, r * 0.38),
        grow: r * 0.2,
        drag: 0.8,
      });
    }
    for (let i = 0; i < Math.round(r * 0.5); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(120, 340 + r * 3);
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 90,
        life: rnd(0.3, 0.8),
        max: 0.8,
        size: rnd(1.5, 3),
        grav: 520,
        color: holy ? '#fde68a' : '#fbbf24',
      });
    }
    this.rings.push({ x, y, r: r * 0.3, maxR: r * 2.1, life: 0.35, max: 0.35, color: holy ? '#fde68a' : '#fff7ed' });
    this.addShake(Math.min(22, r * 0.2));
    this.flash = Math.max(this.flash, Math.min(0.5, r / 160));
    this.flashColor = holy ? '#fffbeb' : '#fff7ed';
  }

  debris(x: number, y: number, r: number): void {
    for (let i = 0; i < Math.round(r * 0.7); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(80, 260 + r * 2);
      this.add({
        kind: 'debris',
        x: x + Math.cos(a) * r * 0.6,
        y: y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 160,
        life: rnd(0.8, 1.8),
        max: 1.8,
        size: rnd(1.8, 4.2),
        grav: 800,
        rot: rnd(0, 6),
        vr: rnd(-9, 9),
        color: DIRT[Math.floor(Math.random() * DIRT.length)],
      });
    }
  }

  smokeTrail(x: number, y: number): void {
    this.add({
      kind: 'smoke',
      x: x + rnd(-1, 1),
      y: y + rnd(-1, 1),
      vx: rnd(-8, 8),
      vy: rnd(-14, -2),
      life: rnd(0.5, 0.9),
      max: 0.9,
      size: rnd(2.5, 4),
      grow: 5,
    });
  }

  fireTrail(x: number, y: number): void {
    this.add({
      kind: 'fire',
      x: x + rnd(-1.5, 1.5),
      y: y + rnd(-1.5, 1.5),
      vx: rnd(-20, 20),
      vy: rnd(-30, 5),
      life: rnd(0.15, 0.35),
      max: 0.35,
      size: rnd(2.5, 4.5),
      grow: -6,
    });
  }

  holyTrail(x: number, y: number): void {
    this.add({
      kind: 'star',
      x: x + rnd(-6, 6),
      y: y + rnd(-6, 6),
      vx: rnd(-20, 20),
      vy: rnd(-30, 10),
      life: rnd(0.4, 0.9),
      max: 0.9,
      size: rnd(2, 4.5),
      color: '#fde047',
      vr: rnd(-4, 4),
    });
  }

  spark(x: number, y: number, n = 4): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'spark',
        x,
        y,
        vx: rnd(-60, 60),
        vy: rnd(-90, -10),
        life: rnd(0.2, 0.5),
        max: 0.5,
        size: rnd(1.2, 2.4),
        grav: 400,
        color: '#fde68a',
      });
    }
  }

  feather(x: number, y: number): void {
    this.add({
      kind: 'feather',
      x,
      y,
      vx: rnd(-20, 20),
      vy: rnd(-5, 20),
      life: rnd(1.2, 2),
      max: 2,
      size: rnd(2.5, 4),
      rot: rnd(0, 6),
      vr: rnd(-3, 3),
      grav: 20,
      drag: 1.2,
    });
  }

  splash(x: number, y: number, size = 1): void {
    for (let i = 0; i < 26 * size; i++) {
      this.add({
        kind: 'splash',
        x: x + rnd(-10, 10) * size,
        y,
        vx: rnd(-90, 90) * size,
        vy: rnd(-420, -120) * Math.sqrt(size),
        life: rnd(0.5, 1.1),
        max: 1.1,
        size: rnd(2, 5) * size,
        grav: 900,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.add({
        kind: 'bubble',
        x: x + rnd(-14, 14),
        y: y + rnd(4, 20),
        vx: rnd(-10, 10),
        vy: rnd(-40, -10),
        life: rnd(0.6, 1.2),
        max: 1.2,
        size: rnd(1.5, 3.5),
      });
    }
    this.rings.push({ x, y, r: 4, maxR: 60 * size, life: 0.6, max: 0.6, color: '#e0f2fe' });
    this.addShake(2 * size);
  }

  bananaBurst(x: number, y: number, n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        kind: 'banana',
        x,
        y,
        vx: Math.cos(a) * rnd(60, 220),
        vy: Math.sin(a) * rnd(60, 220) - 120,
        life: rnd(0.8, 1.5),
        max: 1.5,
        size: rnd(4, 7),
        rot: rnd(0, 6),
        vr: rnd(-8, 8),
        grav: 600,
      });
    }
  }

  confetti(x: number, y: number): void {
    const cols = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#fde047', '#e879f9'];
    for (let i = 0; i < 6; i++) {
      this.add({
        kind: 'debris',
        x: x + rnd(-300, 300),
        y: y - rnd(0, 80),
        vx: rnd(-40, 40),
        vy: rnd(20, 120),
        life: rnd(1.5, 3),
        max: 3,
        size: rnd(2.5, 4.5),
        rot: rnd(0, 6),
        vr: rnd(-8, 8),
        grav: 120,
        color: cols[Math.floor(Math.random() * cols.length)],
      });
    }
  }

  text(x: number, y: number, text: string, color = '#fff', size = 16): void {
    this.texts.push({ x, y, vy: -42, text, color, size, life: 1.3, max: 1.3 });
  }

  update(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0.1, p.size + p.grow * dt);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 1 - 1.4 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    this.shake *= Math.max(0, 1 - 7 * dt);
    if (this.shake < 0.1) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 1.8);
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of this.parts) {
      const t = p.life / p.max;
      switch (p.kind) {
        case 'fire':
        case 'holy': {
          const g = p.kind === 'holy' ? 230 : 60 + 170 * t;
          const b = p.kind === 'holy' ? 150 + 80 * t : 20 + 90 * t;
          ctx.globalAlpha = Math.min(1, t * 1.6);
          ctx.fillStyle = `rgb(255,${g | 0},${b | 0})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'smoke': {
          ctx.globalAlpha = Math.min(0.55, t * 0.7);
          const c = 70 + 90 * (1 - t);
          ctx.fillStyle = `rgb(${c | 0},${c | 0},${(c + 6) | 0})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'debris': {
          ctx.globalAlpha = Math.min(1, t * 3);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        }
        case 'splash': {
          ctx.globalAlpha = Math.min(0.9, t * 1.5);
          ctx.fillStyle = '#bae6fd';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'bubble': {
          ctx.globalAlpha = Math.min(0.8, t * 1.4);
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'star': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          this.star(ctx, p.size);
          ctx.restore();
          break;
        }
        case 'feather': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = '#f1f5f9';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'banana': {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = p.size * 0.45;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0.3, 2.5);
          ctx.stroke();
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const a = Math.min(1, (t.life / t.max) * 2);
      const s = t.size / zoom;
      ctx.globalAlpha = a;
      ctx.font = `900 ${s}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(2, s * 0.22);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineJoin = 'round';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private star(ctx: CanvasRenderingContext2D, s: number): void {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 === 0 ? s : s * 0.3;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}
