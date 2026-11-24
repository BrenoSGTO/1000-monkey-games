// Partículas, textos flutuantes, faíscas de impacto e screen shake.

export type PKind = 'dot' | 'star' | 'ring' | 'spark' | 'text' | 'smoke' | 'slash' | 'banana' | 'koStar' | 'note';

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
  g: number;
  drag: number;
  rot: number;
  vr: number;
  text?: string;
  ang?: number;
}

const HIT_LOW = ['Toma!', 'Plaft!', 'Ai!', 'Tapa!', 'Uh!'];
const HIT_MID = ['Pancada!', 'Eita!', 'Bonk!', 'Aiai!', 'Ui!', 'Chinelada!'];
const HIT_HIGH = ['CABUUUM!', 'VOA, MACACO!', 'PÁÁÁ!', 'É O CABULOSO!', 'TCHAU, BANANA!', 'BAM!!'];

export function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

export class Fx {
  parts: Particle[] = [];
  shakeAmp = 0;
  shakeT = 0;
  flash = 0;
  flashColor = '#fff';
  zoomPunch = 0;
  freeze = 0;

  add(p: Partial<Particle> & { kind: PKind; x: number; y: number }): Particle {
    const full: Particle = {
      vx: 0, vy: 0, life: 30, max: 30, size: 6, color: '#fff', g: 0, drag: 1, rot: 0, vr: 0, ...p,
    } as Particle;
    full.max = full.life;
    if (this.parts.length > 900) this.parts.shift();
    this.parts.push(full);
    return full;
  }

  shake(amp: number, frames = 10): void {
    if (amp >= this.shakeAmp) {
      this.shakeAmp = amp;
      this.shakeT = frames;
    }
  }

  dust(x: number, y: number, n = 6, dir = 0, color = 'rgba(255,255,255,0.7)'): void {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: 'smoke', x: x + (Math.random() - 0.5) * 24, y: y - 2,
        vx: (Math.random() - 0.5) * 3 + dir * 1.5, vy: -Math.random() * 1.6, life: 22 + Math.random() * 10,
        size: 6 + Math.random() * 6, color, drag: 0.94,
      });
    }
  }

  ring(x: number, y: number, r: number, color: string, life = 18): void {
    this.add({ kind: 'ring', x, y, size: r, life, color });
  }

  text(x: number, y: number, text: string, color = '#fde047', size = 26, life = 46): void {
    this.add({ kind: 'text', x, y, vy: -1.4, vx: (Math.random() - 0.5) * 0.8, life, size, color, text, drag: 0.97, rot: (Math.random() - 0.5) * 0.3 });
  }

  impact(x: number, y: number, speed: number, dirx: number, fxKind: number, dmg: number): void {
    const power = Math.min(1, speed / 28);
    const colors = fxKind === 2 ? ['#fb923c', '#fde047', '#ef4444'] : fxKind === 3 ? ['#67e8f9', '#e0f2fe', '#a5f3fc'] : fxKind === 4 ? ['#f9a8d4', '#fde047', '#a5b4fc'] : fxKind === 5 ? ['#e5e7eb', '#9ca3af', '#fff'] : ['#fde047', '#ffffff', '#fb923c'];
    // estrela de impacto
    this.add({ kind: 'star', x, y, size: 26 + power * 46, life: 10, color: '#ffffff', rot: Math.random() * 3 });
    this.add({ kind: 'star', x, y, size: 18 + power * 32, life: 14, color: colors[0], rot: Math.random() * 3 });
    this.ring(x, y, 30 + power * 80, colors[1], 14);
    const n = 8 + Math.floor(power * 16);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(-0.4, dirx) + (Math.random() - 0.5) * 2.4;
      const s = 3 + Math.random() * (5 + power * 9);
      this.add({
        kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 14 + Math.random() * 14, size: 2 + Math.random() * 3,
        color: pick(colors), g: 0.12, drag: 0.95, ang: a,
      });
    }
    if (fxKind === 1) {
      this.add({ kind: 'slash', x, y, size: 50 + power * 40, life: 10, color: '#ffffff', rot: Math.atan2(-0.3, dirx) });
    }
    if (power > 0.55) {
      for (let i = 0; i < 4; i++) {
        this.add({ kind: 'banana', x, y, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 6, life: 40, size: 10, color: '#facc15', g: 0.35, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
      }
    }
    this.text(x, y - 30, pick(power > 0.6 ? HIT_HIGH : power > 0.28 || dmg > 8 ? HIT_MID : HIT_LOW), power > 0.6 ? '#fb7185' : '#fde047', 20 + power * 26);
    this.shake(1.5 + power * 9, 6 + Math.floor(power * 10));
  }

  koBurst(x: number, y: number, dx: number, dy: number): void {
    // estrela de KO que atravessa a tela no fundo + explosão
    const sx = dx !== 0 ? x : x;
    this.add({ kind: 'koStar', x, y, vx: -dx * 4, vy: -dy * 4, life: 70, size: 120, color: '#fde047', rot: 0, vr: 0.25 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 12;
      this.add({ kind: 'spark', x: sx, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 20, size: 3 + Math.random() * 4, color: Math.random() < 0.5 ? '#fde047' : '#ffffff', drag: 0.95, ang: a });
    }
    this.ring(x, y, 260, '#fde047', 28);
    this.ring(x, y, 160, '#ffffff', 20);
    this.shake(16, 26);
    this.flash = 0.55;
    this.flashColor = '#ffffff';
    this.zoomPunch = 1;
  }

  explosion(x: number, y: number, r: number): void {
    this.ring(x, y, r * 1.3, '#fde047', 20);
    this.ring(x, y, r, '#fb923c', 16);
    this.add({ kind: 'star', x, y, size: r * 1.4, life: 14, color: '#fef08a', rot: 0.3 });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 10;
      this.add({ kind: 'smoke', x, y, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s * 0.5 - 1, life: 34 + Math.random() * 20, size: 14 + Math.random() * 20, color: Math.random() < 0.5 ? 'rgba(80,60,40,0.7)' : 'rgba(251,146,60,0.75)', drag: 0.94 });
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 24, size: 3 + Math.random() * 3, color: '#fde047', g: 0.2, drag: 0.95, ang: a });
    }
    this.text(x, y - 40, 'BANANA-BOMBA!', '#fb923c', 30, 52);
    this.shake(11, 18);
  }

  update(): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life--;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
    }
    if (this.shakeT > 0) {
      this.shakeT--;
      if (this.shakeT === 0) this.shakeAmp = 0;
      else this.shakeAmp *= 0.92;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.03);
    if (this.zoomPunch > 0) this.zoomPunch = Math.max(0, this.zoomPunch - 0.025);
  }

  draw(c: CanvasRenderingContext2D, back: boolean): void {
    for (const p of this.parts) {
      const isBack = p.kind === 'koStar';
      if (isBack !== back) continue;
      const k = p.life / p.max;
      c.save();
      c.translate(p.x, p.y);
      switch (p.kind) {
        case 'dot':
        case 'smoke':
          c.globalAlpha = Math.min(1, k * 1.4);
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(0, 0, p.size * (p.kind === 'smoke' ? 1.4 - k * 0.5 : k), 0, Math.PI * 2);
          c.fill();
          break;
        case 'spark': {
          c.globalAlpha = Math.min(1, k * 1.6);
          c.strokeStyle = p.color;
          c.lineWidth = p.size;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(-p.vx * 1.6, -p.vy * 1.6);
          c.stroke();
          break;
        }
        case 'ring':
          c.globalAlpha = k;
          c.strokeStyle = p.color;
          c.lineWidth = 2 + 8 * k;
          c.beginPath();
          c.arc(0, 0, p.size * (1 - k * k) + 4, 0, Math.PI * 2);
          c.stroke();
          break;
        case 'star':
          c.globalAlpha = Math.min(1, k * 2);
          c.rotate(p.rot);
          c.fillStyle = p.color;
          starPath(c, p.size * (0.6 + (1 - k) * 0.6), 0.45);
          c.fill();
          break;
        case 'koStar': {
          c.globalAlpha = Math.min(1, k * 2.5);
          c.rotate(p.rot);
          const s = p.size * (1 + (1 - k) * 2.2);
          c.fillStyle = '#fde047';
          starPath(c, s, 0.5);
          c.fill();
          c.fillStyle = '#ffffff';
          starPath(c, s * 0.55, 0.5);
          c.fill();
          break;
        }
        case 'slash':
          c.globalAlpha = k;
          c.rotate(p.rot);
          c.fillStyle = p.color;
          c.beginPath();
          c.moveTo(-p.size, 0);
          c.quadraticCurveTo(0, -p.size * 0.28 * (1 - k * 0.3), p.size, 0);
          c.quadraticCurveTo(0, p.size * 0.06, -p.size, 0);
          c.fill();
          break;
        case 'banana':
          c.globalAlpha = Math.min(1, k * 2);
          c.rotate(p.rot);
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(0, 0, p.size, 0.2, Math.PI - 0.2);
          c.arc(0, -p.size * 0.35, p.size * 0.82, Math.PI - 0.3, 0.3, true);
          c.fill();
          break;
        case 'note':
          c.globalAlpha = k;
          c.fillStyle = p.color;
          c.font = `${p.size}px system-ui`;
          c.fillText(p.text ?? '♪', 0, 0);
          break;
        case 'text': {
          const pop = Math.min(1, (p.max - p.life) / 6);
          const sc = 0.6 + 0.4 * pop + (p.life > p.max - 6 ? 0.25 : 0);
          c.globalAlpha = Math.min(1, k * 2.4);
          c.rotate(p.rot);
          c.scale(sc, sc);
          c.font = `900 ${p.size}px system-ui, 'Segoe UI', sans-serif`;
          c.textAlign = 'center';
          c.lineWidth = Math.max(4, p.size * 0.22);
          c.strokeStyle = '#1a1209';
          c.lineJoin = 'round';
          c.strokeText(p.text ?? '', 0, 0);
          c.fillStyle = p.color;
          c.fillText(p.text ?? '', 0, 0);
          break;
        }
      }
      c.restore();
    }
  }
}

export function starPath(c: CanvasRenderingContext2D, r: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}
