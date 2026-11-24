export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'conf' | 'puff' | 'drop' | 'star';
  rot: number;
  vr: number;
  g: number;
}

export interface FloatText {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
  max: number;
  size: number;
}

const CONF = ['#facc15', '#f43f5e', '#38bdf8', '#4ade80', '#c084fc', '#fb923c', '#fff'];

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  shake = 0;

  confetti(x: number, y: number, n: number, spread = 1): void {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 30,
        y,
        vx: (Math.random() - 0.5) * 520 * spread,
        vy: -200 - Math.random() * 520,
        life: 1.6 + Math.random() * 1.2,
        max: 2.8,
        size: 4 + Math.random() * 5,
        color: CONF[(Math.random() * CONF.length) | 0],
        kind: 'conf',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 16,
        g: 900,
      });
    }
  }

  rain(cx: number, w: number, topY: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: cx + (Math.random() - 0.5) * w,
        y: topY - Math.random() * 100,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 220,
        life: 3 + Math.random() * 2,
        max: 5,
        size: 5 + Math.random() * 5,
        color: CONF[(Math.random() * CONF.length) | 0],
        kind: 'conf',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        g: 120,
      });
    }
  }

  puff(x: number, y: number, n: number, color = 'rgba(255,255,255,0.8)'): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * (40 + Math.random() * 120),
        vy: Math.sin(a) * (30 + Math.random() * 80) - 40,
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
        size: 5 + Math.random() * 6,
        color,
        kind: 'puff',
        rot: 0,
        vr: 0,
        g: 0,
      });
    }
  }

  splash(x: number, y: number): void {
    for (let i = 0; i < 26; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 30,
        y,
        vx: (Math.random() - 0.5) * 300,
        vy: -300 - Math.random() * 560,
        life: 0.9 + Math.random() * 0.5,
        max: 1.4,
        size: 4 + Math.random() * 6,
        color: Math.random() < 0.5 ? '#7c3aed' : '#c084fc',
        kind: 'drop',
        rot: 0,
        vr: 0,
        g: 1500,
      });
    }
  }

  stars(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * 160,
        vy: Math.sin(a) * 160 - 60,
        life: 0.6,
        max: 0.6,
        size: 8,
        color: '#fde047',
        kind: 'star',
        rot: Math.random() * 3,
        vr: 6,
        g: 200,
      });
    }
  }

  text(x: number, y: number, s: string, c = '#fff', size = 22): void {
    this.texts.push({ x, y, s, c, life: 1.5, max: 1.5, size });
    if (this.texts.length > 40) this.texts.shift();
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'conf') p.vx *= 1 - 0.8 * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 38 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      const a = Math.min(1, p.life / (p.max * 0.4));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      if (p.kind === 'conf') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.sin(p.rot * 1.7)) * 0.9 + 0.1);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          ctx.lineTo(Math.cos(ang) * p.size, Math.sin(ang) * p.size);
          ctx.lineTo(Math.cos(ang + 0.6) * p.size * 0.4, Math.sin(ang + 0.6) * p.size * 0.4);
        }
        ctx.fill();
        ctx.restore();
      } else {
        const s = p.kind === 'puff' ? p.size * (1.4 - p.life / p.max) : p.size;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
      const pop = 1 + Math.max(0, (t.life - (t.max - 0.2)) * 3);
      ctx.font = `900 ${Math.round(t.size * pop)}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(30,20,10,0.9)';
      ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.c;
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
