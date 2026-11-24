import { drawCrate, drawMine, drawMonkey, drawProj, drawTomb } from './draw';
import type { Fx } from './fx';
import type { World } from './sim';
import { WORLD_H, WORLD_W, type WeaponId } from './types';
import { WEAPONS } from './weapons';

export interface RenderView {
  world: World;
  fx: Fx;
  time: number;
  activeId: number;
  showArrow: boolean;
  aiming: boolean;
  weapon: WeaponId | null;
  charge: number;
  target: { x: number; y: number } | null;
  sudden: boolean;
  controllable: boolean;
}

interface Cloud {
  x: number;
  y: number;
  s: number;
  v: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  width = 800;
  height = 600;
  dpr = 1;
  cam = { x: WORLD_W / 2, y: 560, zoom: 0.6 };
  private target = { x: WORLD_W / 2, y: 560 };
  userZoom = 1;
  overview = false;
  manualUntil = 0;
  private clouds: Cloud[] = [];
  private skyCache: { key: string; g: CanvasGradient | null } = { key: '', g: null };
  private shakeX = 0;
  private shakeY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 9; i++) {
      this.clouds.push({ x: Math.random() * 2400, y: 30 + Math.random() * 260, s: 0.6 + Math.random() * 1.1, v: 6 + Math.random() * 12 });
    }
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(320, window.innerWidth);
    this.height = Math.max(240, window.innerHeight);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.skyCache.key = '';
  }

  baseZoom(): number {
    return Math.max(0.28, Math.min(2.4, this.height / 700));
  }

  overviewZoom(): number {
    return Math.min(this.width / (WORLD_W + 260), this.height / (WORLD_H + 200));
  }

  zoomTarget(): number {
    if (this.overview) return this.overviewZoom();
    return Math.max(this.overviewZoom(), Math.min(3, this.baseZoom() * this.userZoom));
  }

  focus(x: number, y: number): void {
    this.target.x = x;
    this.target.y = y;
  }

  snapTo(x: number, y: number): void {
    this.target.x = x;
    this.target.y = y;
    this.cam.x = x;
    this.cam.y = y;
    this.cam.zoom = this.zoomTarget();
  }

  panBy(dx: number, dy: number): void {
    this.target.x -= dx / this.cam.zoom;
    this.target.y -= dy / this.cam.zoom;
    this.cam.x = this.target.x;
    this.cam.y = this.target.y;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.height / 2) / this.cam.zoom + this.cam.y,
    };
  }

  update(dt: number, shake: number): void {
    const zt = this.zoomTarget();
    this.cam.zoom += (zt - this.cam.zoom) * Math.min(1, dt * 4);
    const k = Math.min(1, dt * 4.2);
    this.cam.x += (this.target.x - this.cam.x) * k;
    this.cam.y += (this.target.y - this.cam.y) * k;
    const halfW = this.width / (2 * this.cam.zoom);
    const halfH = this.height / (2 * this.cam.zoom);
    const minX = -160 + halfW;
    const maxX = WORLD_W + 160 - halfW;
    const minY = -300 + halfH;
    const maxY = WORLD_H + 140 - halfH;
    this.cam.x = minX > maxX ? WORLD_W / 2 : Math.max(minX, Math.min(maxX, this.cam.x));
    this.cam.y = minY > maxY ? (WORLD_H - 80) / 2 : Math.max(minY, Math.min(maxY, this.cam.y));
    this.shakeX = (Math.random() - 0.5) * shake * 2;
    this.shakeY = (Math.random() - 0.5) * shake * 2;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > 2600) c.x = -300;
    }
  }

  // ───────────────────────────── desenho ─────────────────────────────

  draw(v: RenderView): void {
    const ctx = this.ctx;
    const { width, height, dpr } = this;
    const cam = this.cam;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSky(ctx, v);

    const z = cam.zoom;
    ctx.setTransform(
      dpr * z,
      0,
      0,
      dpr * z,
      dpr * (width / 2 - (cam.x + this.shakeX) * z),
      dpr * (height / 2 - (cam.y + this.shakeY) * z),
    );
    const left = cam.x - width / (2 * z) - 40;
    const right = cam.x + width / (2 * z) + 40;
    const bottom = cam.y + height / (2 * z) + 40;
    const w = v.world;

    this.drawWater(ctx, w.waterY, left, right, bottom, v.time, v.sudden, true);

    if (w.terrain.canvas) ctx.drawImage(w.terrain.canvas, 0, 0);

    for (const c of w.crates) drawCrate(ctx, c, v.time);
    for (const m of w.mines) drawMine(ctx, m, v.time);

    // lápides primeiro
    for (const wm of w.worms) {
      if (wm.state === 'tomb') drawTomb(ctx, wm, w.teams[wm.team], v.time);
    }
    // cipós
    for (const wm of w.worms) {
      if (wm.state === 'alive' && wm.rope) this.drawRope(ctx, wm.x, wm.y - 3, wm.rope.ax, wm.rope.ay, v.time);
    }
    // macacos vivos (ativo por último)
    const alive = w.worms.filter((o) => o.state === 'alive');
    alive.sort((a, b) => (a.id === v.activeId ? 1 : 0) - (b.id === v.activeId ? 1 : 0));
    for (const wm of alive) {
      const isActive = wm.id === v.activeId;
      drawMonkey(ctx, wm, w.teams[wm.team], v.time, {
        active: isActive,
        aiming: isActive && v.aiming,
        weapon: isActive ? v.weapon : null,
        charge: isActive ? v.charge : 0,
      });
    }

    for (const p of w.projs) drawProj(ctx, p, v.time);

    // mira
    const aw = w.worm(v.activeId);
    if (aw && aw.state === 'alive' && v.aiming && v.weapon) this.drawAim(ctx, aw, v, z);
    if (v.target && v.weapon && WEAPONS[v.weapon].target) this.drawTarget(ctx, v.target, v.weapon, v.time, z);

    v.fx.draw(ctx, z);

    this.drawWater(ctx, w.waterY, left, right, bottom, v.time, v.sudden, false);

    // rótulos e balões por cima da água
    for (const wm of w.worms) {
      if (wm.state === 'gone') continue;
      this.drawLabel(ctx, wm, w.teams[wm.team].color, z, wm.id === v.activeId && v.showArrow, v.time);
    }

    // overlays de tela
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.45, width / 2, height / 2, Math.max(width, height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,10,30,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, width, height);
    if (v.sudden) {
      ctx.fillStyle = `rgba(220,38,38,${0.06 + Math.sin(v.time * 3) * 0.03})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (v.fx.flash > 0.01) {
      ctx.globalAlpha = v.fx.flash;
      ctx.fillStyle = v.fx.flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  private drawSky(ctx: CanvasRenderingContext2D, v: RenderView): void {
    const { width, height } = this;
    const key = `${width}x${height}-${v.sudden ? 1 : 0}`;
    if (this.skyCache.key !== key) {
      const g = ctx.createLinearGradient(0, 0, 0, height);
      if (v.sudden) {
        g.addColorStop(0, '#3b0d3f');
        g.addColorStop(0.55, '#b4351a');
        g.addColorStop(1, '#fbbf24');
      } else {
        g.addColorStop(0, '#3a9ae6');
        g.addColorStop(0.55, '#8fd0f6');
        g.addColorStop(1, '#fff1c4');
      }
      this.skyCache = { key, g };
    }
    ctx.fillStyle = this.skyCache.g!;
    ctx.fillRect(0, 0, width, height);

    const cam = this.cam;
    // sol
    const sx = width * 0.78 - (cam.x - WORLD_W / 2) * 0.01;
    const sy = height * 0.2 - (cam.y - 550) * 0.02;
    const sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 90);
    sg.addColorStop(0, v.sudden ? 'rgba(254,202,202,1)' : 'rgba(255,251,204,1)');
    sg.addColorStop(0.3, v.sudden ? 'rgba(248,113,113,0.8)' : 'rgba(253,224,71,0.8)');
    sg.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, 90, 0, Math.PI * 2);
    ctx.fill();

    // nuvens
    ctx.fillStyle = v.sudden ? 'rgba(80,20,40,0.55)' : 'rgba(255,255,255,0.8)';
    for (const c of this.clouds) {
      const x = ((c.x - cam.x * 0.06) % 2600) * (width / 1500);
      const y = c.y * (height / 700) - (cam.y - 550) * 0.04;
      const s = c.s * (height / 700) * 60;
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(x - s * 0.5, y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 0.55, y + s * 0.1, s * 0.65, s * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 0.1, y - s * 0.22, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ilhas distantes com palmeiras
    const horizon = this.height / 2 + (this.cam.zoom * (v.world.waterY - cam.y)) - 40 * this.cam.zoom;
    const layers = [
      { f: 0.1, col: v.sudden ? '#5b1d3a' : '#5aa987', h: 90, off: 0 },
      { f: 0.2, col: v.sudden ? '#43142e' : '#2f8a6a', h: 120, off: 400 },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, height);
      const base = Math.min(height, Math.max(height * 0.5, horizon)) + 10;
      for (let x = 0; x <= width + 20; x += 20) {
        const wx = x + cam.x * L.f * this.cam.zoom + L.off;
        const hh = (Math.sin(wx * 0.004) * 0.5 + Math.sin(wx * 0.011 + 2) * 0.35 + 0.9) * L.h * 0.5 * this.cam.zoom * 1.4;
        ctx.lineTo(x, base - hh);
      }
      ctx.lineTo(width + 20, height);
      ctx.closePath();
      ctx.fill();
    }
  }

  private waveY(x: number, t: number, base: number, phase: number): number {
    return base + Math.sin(x * 0.02 + t * 2 + phase) * 4 + Math.sin(x * 0.007 - t * 1.2 + phase) * 3.5;
  }

  private drawWater(ctx: CanvasRenderingContext2D, waterY: number, left: number, right: number, bottom: number, t: number, sudden: boolean, back: boolean): void {
    ctx.beginPath();
    const base = back ? waterY - 10 : waterY;
    const ph = back ? 1.7 : 0;
    ctx.moveTo(left, bottom + 400);
    for (let x = left; x <= right + 20; x += 16) ctx.lineTo(x, this.waveY(x, t, base, ph));
    ctx.lineTo(right + 20, bottom + 400);
    ctx.closePath();
    if (back) {
      ctx.fillStyle = sudden ? '#7f1d3a' : '#1d78b8';
      ctx.fill();
    } else {
      const g = ctx.createLinearGradient(0, waterY - 10, 0, waterY + 260);
      if (sudden) {
        g.addColorStop(0, 'rgba(244,114,182,0.72)');
        g.addColorStop(1, 'rgba(76,5,60,0.95)');
      } else {
        g.addColorStop(0, 'rgba(56,189,248,0.7)');
        g.addColorStop(1, 'rgba(8,60,120,0.96)');
      }
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = left; x <= right + 20; x += 16) {
        const y = this.waveY(x, t, waterY, 0);
        if (x === left) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private drawRope(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, t: number): void {
    ctx.strokeStyle = '#3f6212';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2 + Math.sin(t * 6) * 1.2;
    const my = (y1 + y2) / 2 + 3;
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = '#84cc16';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(x2, y2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawAim(ctx: CanvasRenderingContext2D, w: import('./types').Worm, v: RenderView, zoom: number): void {
    const a = (w.aim * Math.PI) / 180;
    const dx = w.facing * Math.cos(a);
    const dy = -Math.sin(a);
    const def = WEAPONS[v.weapon as WeaponId];
    const dist = 62;
    const cx = w.x + dx * dist;
    const cy = w.y - 2 + dy * dist;
    const pulse = 1 + Math.sin(v.time * 8) * 0.08;
    const s = 1 / Math.max(0.5, zoom * 0.9);
    ctx.save();
    ctx.strokeStyle = def.target ? '#fde047' : '#fff';
    ctx.lineWidth = 1.8 * s;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(cx, cy, 6.5 * pulse * s, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + v.time * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 8.5 * s, cy + Math.sin(ang) * 8.5 * s);
      ctx.lineTo(cx + Math.cos(ang) * 13 * s, cy + Math.sin(ang) * 13 * s);
      ctx.stroke();
    }
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    // barra de força
    if (def.charge && v.charge > 0.02) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / n;
        if (k > v.charge) break;
        const d = 18 + k * 78;
        ctx.fillStyle = `hsl(${120 - k * 120},95%,55%)`;
        ctx.beginPath();
        ctx.arc(w.x + dx * d, w.y - 2 + dy * d, (2 + k * 2.2) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (v.weapon === 'torch' || v.weapon === 'kamikaze' || v.weapon === 'rope') {
      ctx.setLineDash([4 * s, 5 * s]);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(w.x + dx * 14, w.y + dy * 14);
      ctx.lineTo(w.x + dx * (v.weapon === 'rope' ? 200 : 130), w.y + dy * (v.weapon === 'rope' ? 200 : 130));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTarget(ctx: CanvasRenderingContext2D, tg: { x: number; y: number }, wp: WeaponId, t: number, zoom: number): void {
    const s = 1 / Math.max(0.5, zoom * 0.9);
    ctx.save();
    ctx.translate(tg.x, tg.y);
    const pulse = 1 + Math.sin(t * 7) * 0.12;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(0, 0, 14 * pulse * s, 0, Math.PI * 2);
    ctx.moveTo(-9 * s, -9 * s);
    ctx.lineTo(9 * s, 9 * s);
    ctx.moveTo(9 * s, -9 * s);
    ctx.lineTo(-9 * s, 9 * s);
    ctx.stroke();
    if (wp === 'pigeons') {
      ctx.fillStyle = 'rgba(239,68,68,0.85)';
      for (let i = -2; i <= 2; i++) {
        const x = i * 52;
        const y = -50 - ((t * 60) % 20);
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 12);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, w: import('./types').Worm, color: string, zoom: number, arrow: boolean, t: number): void {
    const s = 1 / zoom;
    const fs = 11 * s;
    const tomb = w.state === 'tomb';
    const x = w.x;
    let y = w.y - (tomb ? 26 : 25) * 1 - 3 * s;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs}px 'Segoe UI', system-ui, sans-serif`;
    if (zoom > 0.42) {
      const label = w.name;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = tomb ? 'rgba(30,30,40,0.6)' : 'rgba(10,14,28,0.7)';
      this.pill(ctx, x - tw / 2 - 4 * s, y - fs * 0.8, tw + 8 * s, fs * 1.6, fs * 0.8);
      ctx.fill();
      ctx.fillStyle = tomb ? '#cbd5e1' : '#fff';
      ctx.fillText(label, x, y + 0.5 * s);
      y -= fs * 1.75;
    }
    if (!tomb) {
      const txt = String(Math.max(0, Math.ceil(w.shownHp)));
      const tw = Math.max(fs * 2, ctx.measureText(txt).width + 8 * s);
      ctx.fillStyle = color;
      this.pill(ctx, x - tw / 2, y - fs * 0.8, tw, fs * 1.6, fs * 0.8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2 * s;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(txt, x, y + 0.5 * s);
      y -= fs * 1.75;
    }
    if (arrow && !tomb) {
      const by = y - 6 * s + Math.sin(t * 6) * 4 * s;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(x, by + 9 * s);
      ctx.lineTo(x - 8 * s, by - 3 * s);
      ctx.lineTo(x + 8 * s, by - 3 * s);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      y -= 16 * s;
    }
    if (w.speechT > 0 && w.speech) {
      const sf = 12 * s;
      ctx.font = `800 ${sf}px 'Segoe UI', system-ui, sans-serif`;
      const tw = ctx.measureText(w.speech).width + 14 * s;
      const bh = sf * 1.8;
      const by = y - bh * 0.6;
      ctx.globalAlpha = Math.min(1, w.speechT * 2.5);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.6 * s;
      this.pill(ctx, x - tw / 2, by - bh / 2, tw, bh, bh * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4 * s, by + bh / 2 - 0.5 * s);
      ctx.lineTo(x, by + bh / 2 + 6 * s);
      ctx.lineTo(x + 4 * s, by + bh / 2 - 0.5 * s);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillText(w.speech, x, by + 0.5 * s);
    }
    ctx.restore();
  }

  private pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
