import type { Kart } from './kart';

export type ParticleKind = 'spark' | 'smoke' | 'text' | 'star' | 'dust' | 'ring' | 'leaf' | 'glow' | 'drop';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  text: string;
  grav: number;
  drag: number;
  rot: number;
}

export const DRIFT_COLORS = ['#e5e7eb', '#38bdf8', '#fb923c', '#d946ef'];

export class Fx {
  list: Particle[] = [];

  add(p: Partial<Particle> & { kind: ParticleKind; x: number; y: number }): Particle {
    const q: Particle = {
      kind: p.kind,
      x: p.x,
      y: p.y,
      z: p.z ?? 0,
      vx: p.vx ?? 0,
      vy: p.vy ?? 0,
      vz: p.vz ?? 0,
      life: p.life ?? 0.6,
      max: p.life ?? 0.6,
      size: p.size ?? 6,
      color: p.color ?? '#fff',
      text: p.text ?? '',
      grav: p.grav ?? 0,
      drag: p.drag ?? 0,
      rot: p.rot ?? 0,
    };
    if (this.list.length > 900) this.list.shift();
    this.list.push(q);
    return q;
  }

  update(dt: number): void {
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vz -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0 && p.kind !== 'text' && p.kind !== 'smoke' && p.kind !== 'glow') {
        p.z = 0;
        p.vz *= -0.35;
        p.vx *= 0.7;
        p.vy *= 0.7;
      }
      keep.push(p);
    }
    this.list = keep;
  }

  text(x: number, y: number, text: string, color = '#fde047', size = 26, z = 60): void {
    this.add({ kind: 'text', x, y, z, vz: 55, life: 1.5, size, color, text, drag: 0.8 });
  }

  burst(x: number, y: number, z: number, n: number, color: string, speed = 160, kind: ParticleKind = 'spark', life = 0.6, size = 5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.8);
      this.add({
        kind,
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: 40 + Math.random() * speed * 0.7,
        life: life * (0.6 + Math.random() * 0.7),
        size: size * (0.6 + Math.random() * 0.8),
        color,
        grav: 360,
        drag: 1.2,
      });
    }
  }

  /** Continuous per-kart effects (drift sparks, boost flames, dust, stars). */
  kartFx(k: Kart, dt: number, nowT: number): void {
    if (k.fallT > 0) return;
    const fx = Math.cos(k.h);
    const fy = Math.sin(k.h);
    const rx = -fy;
    const ry = fx;
    const rearX = k.x - fx * 26;
    const rearY = k.y - fy * 26;
    const speedFactor = Math.min(1.3, Math.abs(k.spd) / 300);

    if (k.drift !== 0 && Math.abs(k.spd) > 60) {
      const colors = DRIFT_COLORS;
      const col = colors[Math.max(1, k.driftLvl)] ?? '#e5e7eb';
      const n = 1 + k.driftLvl;
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.7 + dt * 20) continue;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.add({
          kind: 'spark',
          x: rearX + rx * side * 16,
          y: rearY + ry * side * 16,
          z: 4,
          vx: -fx * 60 + rx * side * (60 + Math.random() * 90) + (Math.random() - 0.5) * 60,
          vy: -fy * 60 + ry * side * (60 + Math.random() * 90) + (Math.random() - 0.5) * 60,
          vz: 60 + Math.random() * 120,
          life: 0.35 + Math.random() * 0.3,
          size: 3 + Math.random() * 3 + k.driftLvl,
          color: k.driftLvl > 0 ? col : '#d1d5db',
          grav: 420,
          drag: 1.5,
        });
      }
      if (Math.random() < 0.5) {
        this.add({ kind: 'smoke', x: rearX, y: rearY, z: 6, vx: -fx * 20, vy: -fy * 20, vz: 20, life: 0.6, size: 16, color: 'rgba(230,230,230,0.5)' });
      }
    }

    if (k.boostT > 0) {
      for (let i = 0; i < 2; i++) {
        const s = Math.random() < 0.5 ? -1 : 1;
        this.add({
          kind: 'glow',
          x: rearX + rx * s * 8,
          y: rearY + ry * s * 8,
          z: 14,
          vx: -fx * 180 + (Math.random() - 0.5) * 30,
          vy: -fy * 180 + (Math.random() - 0.5) * 30,
          vz: (Math.random() - 0.5) * 20,
          life: 0.28,
          size: 12 + Math.random() * 8,
          color: Math.random() < 0.5 ? '#fb923c' : '#fde047',
        });
      }
    }

    if ((k.surf === 1 || k.surf === 3) && k.guaranaT <= 0 && k.boostT <= 0 && speedFactor > 0.25 && Math.random() < 0.8) {
      const grass = k.surf === 1;
      this.add({
        kind: grass ? 'leaf' : 'dust',
        x: rearX + (Math.random() - 0.5) * 30,
        y: rearY + (Math.random() - 0.5) * 30,
        z: 3,
        vx: -fx * 80 + (Math.random() - 0.5) * 80,
        vy: -fy * 80 + (Math.random() - 0.5) * 80,
        vz: 60 + Math.random() * 80,
        life: 0.5,
        size: grass ? 4 : 10,
        color: grass ? '#4ade80' : 'rgba(210,180,130,0.6)',
        grav: 300,
        drag: 1,
      });
    }

    if (k.spinT > 0) {
      if (Math.random() < 0.3) {
        const a = nowT * 8 + Math.random() * 6;
        this.add({
          kind: 'star',
          x: k.x + Math.cos(a) * 18,
          y: k.y + Math.sin(a) * 18,
          z: 64 + Math.random() * 8,
          vz: 20,
          life: 0.5,
          size: 7,
          color: '#fde047',
        });
      }
    }
    if (k.stingT > 0 && Math.random() < 0.5) {
      const a = nowT * 12 + Math.random() * 6;
      this.add({ kind: 'drop', x: k.x + Math.cos(a) * 26, y: k.y + Math.sin(a) * 26, z: 34 + Math.sin(a * 2) * 12, life: 0.15, size: 3, color: '#111827' });
    }
    if (k.slowT > 0 && k.hitBy === 'nuvem' && Math.random() < 0.3) {
      this.add({ kind: 'smoke', x: k.x + (Math.random() - 0.5) * 30, y: k.y + (Math.random() - 0.5) * 30, z: 20, vz: 30, life: 0.8, size: 22, color: 'rgba(120,200,80,0.5)' });
    }
  }
}
