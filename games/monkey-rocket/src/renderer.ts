// Renderizacao Canvas 2D: cenario tematico, torcida, carros, bola, HUD.
import { drawBall, drawBanana, drawCarLocal, drawCrowdMonkey, type Expr } from './art';
import { ARENA, CAR_GEO, CARS, COUNTDOWN_DUR, FURS, PADS, REPLAY_DUR, TEAM_COLORS, clamp, lerp } from './constants';
import type { Fx } from './fx';
import { arenaOutline } from './sim';
import { PH_COUNTDOWN, PH_END, PH_GOAL, PH_PLAY, PH_REPLAY, type RenderState, type ThemeSpec } from './types';

export interface LocalHud {
  slot: number;
  label: string;
}

export interface DrawParams {
  view: RenderState;
  fx: Fx;
  t: number;
  dt: number;
  locals: LocalHud[];
  theme: ThemeSpec;
  showHud: boolean;
  canSkipReplay: boolean;
  expr: Map<number, { e: Expr; until: number }>;
  teamNames: [string, string];
  demo: boolean;
}

interface CrowdMonkey {
  x: number;
  y: number;
  r: number;
  fur: number;
  team: 0 | 1 | 2;
  phase: number;
  row: number;
}

const OUTLINE = arenaOutline();

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  w = 800;
  h = 450;
  dpr = 1;
  private cam = { x: 0, y: 20, vw: 80 };
  private crowd: CrowdMonkey[] = [];
  private trail: { x: number; y: number }[] = [];
  private goalFlashT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D indisponivel');
    this.ctx = c;
    for (let row = 0; row < 3; row++) {
      for (let x = -ARENA.HW + 2.5; x < ARENA.HW - 2; x += 2.9) {
        const jitter = (Math.random() - 0.5) * 0.8;
        const half = x < 0 ? 0 : 1;
        this.crowd.push({
          x: x + jitter + (row % 2) * 1.4,
          y: 17 + row * 6.2,
          r: 0.95 + Math.random() * 0.25,
          fur: Math.floor(Math.random() * FURS.length),
          team: Math.random() < 0.18 ? 2 : (half as 0 | 1),
          phase: Math.random() * 6.28,
          row,
        });
      }
    }
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
  }

  // ---------------------------------------------------------------- camera
  private updateCamera(view: RenderState, locals: LocalHud[], dt: number, snap: boolean): void {
    const pts: { x: number; y: number }[] = [{ x: view.ball.x, y: view.ball.y }];
    const focus = view.cars.filter((c) => locals.some((l) => l.slot === c.slot));
    for (const c of focus.length ? focus : view.cars) pts.push({ x: c.x, y: c.y });
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const aspect = this.w / this.h;
    let vw = Math.max(x1 - x0 + 34, (y1 - y0 + 20) * aspect, 62);
    vw = clamp(vw, 62, ARENA.W + ARENA.GOAL_D * 2 + 6);
    // em telas estreitas (celular em pe) aceita ver mais largura
    const vh = vw / aspect;
    let cx = (x0 + x1) / 2;
    let cy = (y0 + y1) / 2 + 2;
    const maxX = ARENA.HW + ARENA.GOAL_D + 3;
    if (vw / 2 >= maxX) cx = 0;
    else cx = clamp(cx, -maxX + vw / 2, maxX - vw / 2);
    const minY = -3.5;
    const maxY = ARENA.H + 3;
    if (vh >= maxY - minY) cy = (minY + maxY) / 2;
    else cy = clamp(cy, minY + vh / 2, maxY - vh / 2);
    const k = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    this.cam.x = lerp(this.cam.x, cx, k);
    this.cam.y = lerp(this.cam.y, cy, k);
    this.cam.vw = lerp(this.cam.vw, vw, snap ? 1 : 1 - Math.exp(-dt * 2.5));
  }

  snapCamera(): void {
    this.cam.vw = 0;
    this.cam.x = 0;
    this.cam.y = 20;
  }

  // ---------------------------------------------------------------- frame
  frame(p: DrawParams): void {
    const { view, fx, theme } = p;
    const ctx = this.ctx;
    const snap = this.cam.vw === 0;
    if (snap) this.cam.vw = 80;
    this.updateCamera(view, p.locals, p.dt, snap);
    const s = this.w / this.cam.vw;
    const shk = fx.shake * fx.shake;
    const sx = (Math.random() - 0.5) * shk * 1.4;
    const sy = (Math.random() - 0.5) * shk * 1.4;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky(theme, p.t);

    // transformacao de mundo (y para cima)
    ctx.setTransform(
      s * this.dpr,
      0,
      0,
      -s * this.dpr,
      (this.w / 2 - (this.cam.x + sx) * s) * this.dpr,
      (this.h / 2 + (this.cam.y + sy) * s) * this.dpr,
    );
    this.drawArena(p, s);
    this.drawPads(view, p.t);
    this.drawGoals(view);
    this.drawEntities(p, s);
    this.drawParticles(fx);
    this.drawArenaFrame(view);

    // ---- espaco de tela ----
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawAds(p, s, sx, sy);
    this.drawFloatTexts(p, s, sx, sy);
    this.drawNameTags(p, s, sx, sy);
    if (fx.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.8, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (view.phase === PH_REPLAY) this.drawReplayOverlay(p);
    if (p.showHud) this.drawHud(p);
    this.drawPhaseText(p);
  }

  private wx(x: number, s: number, sx: number): number {
    return (x - (this.cam.x + sx)) * s + this.w / 2;
  }

  private wy(y: number, s: number, sy: number): number {
    return this.h / 2 - (y - (this.cam.y + sy)) * s;
  }

  // ---------------------------------------------------------------- cenario
  private drawSky(theme: ThemeSpec, t: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, theme.skyTop);
    g.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (theme.id === 'lua') {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) {
        const x = (i * 97.3) % this.w;
        const y = (i * 53.7) % this.h;
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    } else if (theme.id === 'praia') {
      ctx.fillStyle = 'rgba(254,240,138,0.8)';
      ctx.beginPath();
      ctx.arc(this.w * 0.8, this.h * 0.25, this.h * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private arenaPath(): void {
    const ctx = this.ctx;
    ctx.beginPath();
    OUTLINE.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }

  private drawArena(p: DrawParams, s: number): void {
    const ctx = this.ctx;
    const { theme, fx, view } = p;
    const HW = ARENA.HW;
    const H = ARENA.H;
    // chao externo (abaixo de y=0)
    const gr = ctx.createLinearGradient(0, 0, 0, -30);
    gr.addColorStop(0, theme.floor);
    gr.addColorStop(1, theme.floorEdge);
    ctx.fillStyle = gr;
    ctx.fillRect(-120, -60, 240, 60);
    // listras do gramado / faixas
    ctx.fillStyle = theme.floorStripe;
    ctx.globalAlpha = 0.5;
    for (let x = -HW - 20; x < HW + 20; x += 12) {
      ctx.fillRect(x, -60, 6, 60);
    }
    ctx.globalAlpha = 1;
    // parede do fundo (dentro da arena)
    ctx.save();
    this.arenaPath();
    ctx.clip();
    const wg = ctx.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, theme.wallBottom);
    wg.addColorStop(1, theme.wallTop);
    ctx.fillStyle = wg;
    ctx.fillRect(-HW - 12, -1, HW * 2 + 24, H + 2);
    // arquibancadas
    const energy = clamp(0.1 + fx.crowd + this.ballDanger(view) * 0.35, 0, 1);
    for (let row = 0; row < 3; row++) {
      const y = 17 + row * 6.2;
      ctx.fillStyle = `rgba(0,0,0,${0.28 + row * 0.04})`;
      ctx.fillRect(-HW - 12, y - 3.4, HW * 2 + 24, 3.4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(-HW - 12, y - 0.1, HW * 2 + 24, 0.18);
    }
    const left = this.cam.x - this.cam.vw / 2 - 3;
    const right = this.cam.x + this.cam.vw / 2 + 3;
    for (const m of this.crowd) {
      if (m.x < left || m.x > right) continue;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(1, -1);
      const win = view.phase === PH_GOAL && view.goal;
      let e = energy;
      if (win && view.goal) e = m.team === view.goal.team ? 1 : 0.25;
      drawCrowdMonkey(ctx, 0, 0, m.r, m.fur, m.team, p.t, e, m.phase);
      ctx.restore();
    }
    ctx.fillStyle = theme.crowdTint;
    ctx.fillRect(-HW - 12, 12.5, HW * 2 + 24, H);
    // faixa de publicidade
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-HW - 2, 10.8, HW * 2 + 4, 3.4);
    // linhas de campo na parede
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 10.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI);
    ctx.stroke();
    for (const sgn of [-1, 1]) {
      ctx.strokeRect(sgn > 0 ? HW - 16 : -HW, 0, 16, 7);
    }
    ctx.restore();
    // linha do chao
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(-HW - ARENA.GOAL_D - 30, 0);
    ctx.lineTo(HW + ARENA.GOAL_D + 30, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    void s;
    // decoracao do tema na faixa de baixo
    if (theme.id === 'praia') {
      ctx.fillStyle = 'rgba(56,189,248,0.55)';
      for (let x = -HW - 20; x < HW + 20; x += 7) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(p.t * 1.5 + x) * 0.6, -6, 3.2, 0, Math.PI);
        ctx.fill();
      }
    } else if (theme.id === 'lua') {
      ctx.fillStyle = 'rgba(30,41,59,0.55)';
      for (let x = -HW - 20; x < HW + 20; x += 15) {
        ctx.beginPath();
        ctx.ellipse(x + 3, -5, 4, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(5,46,22,0.5)';
      for (let x = -HW - 20; x < HW + 20; x += 9) {
        ctx.beginPath();
        ctx.arc(x, -8, 3.5, Math.PI, 0);
        ctx.fill();
      }
    }
  }

  private ballDanger(view: RenderState): number {
    const d = Math.abs(Math.abs(view.ball.x) - ARENA.HW);
    return clamp(1 - d / 18, 0, 1);
  }

  private drawPads(view: RenderState, t: number): void {
    const ctx = this.ctx;
    PADS.forEach((pd, i) => {
      const on = view.pads[i] ?? true;
      const w = pd.big ? 2.6 : 1.7;
      ctx.save();
      ctx.translate(pd.x, pd.side === -1 ? 0.12 : ARENA.H - 0.12);
      if (pd.side === 1) ctx.scale(1, -1);
      const col = pd.big ? '#fb7185' : '#fde047';
      ctx.fillStyle = on ? col : 'rgba(100,116,139,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w, pd.big ? 0.5 : 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      if (on) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
        ctx.globalAlpha = 0.25 + 0.25 * pulse;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-w * 0.9, 0);
        ctx.lineTo(-w * 0.5, pd.big ? 3.4 : 2);
        ctx.lineTo(w * 0.5, pd.big ? 3.4 : 2);
        ctx.lineTo(w * 0.9, 0);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });
  }

  private drawGoals(view: RenderState): void {
    const ctx = this.ctx;
    const HW = ARENA.HW;
    const GD = ARENA.GOAL_D;
    const GH = ARENA.GOAL_H;
    for (const side of [-1, 1] as const) {
      const x0 = side < 0 ? -HW - GD : HW;
      const tc = TEAM_COLORS[side < 0 ? 0 : 1];
      const g = ctx.createLinearGradient(x0, 0, x0 + GD, 0);
      g.addColorStop(side < 0 ? 0 : 1, '#020617');
      g.addColorStop(side < 0 ? 1 : 0, '#0f172a');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, GD, GH);
      // rede
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      for (let x = x0; x <= x0 + GD + 0.01; x += 0.9) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GH);
      }
      for (let y = 0; y <= GH + 0.01; y += 0.9) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + GD, y);
      }
      ctx.stroke();
      // trave
      ctx.strokeStyle = tc.main;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(side < 0 ? -HW : HW, 0);
      ctx.lineTo(side < 0 ? -HW : HW, GH);
      ctx.lineTo(side < 0 ? -HW - GD : HW + GD, GH);
      ctx.stroke();
      // brilho quando sofre gol
      if (view.phase === PH_GOAL && view.goal && view.goal.team !== (side < 0 ? 0 : 1)) {
        // gol marcado neste lado? o gol da esquerda eh do time 0 e quem marca eh o time 1
      }
      if (view.phase === PH_GOAL && view.goal && ((side < 0 && view.goal.team === 1) || (side > 0 && view.goal.team === 0))) {
        ctx.fillStyle = `rgba(253,224,71,${0.25 + 0.2 * Math.sin(view.phaseT * 14)})`;
        ctx.fillRect(x0, 0, GD, GH);
      }
    }
  }

  private drawEntities(p: DrawParams, s: number): void {
    const ctx = this.ctx;
    const { view, t } = p;
    // rastro da bola
    const b = view.ball;
    const sp = Math.hypot(b.vx, b.vy);
    this.trail.push({ x: b.x, y: b.y });
    if (this.trail.length > 9) this.trail.shift();
    if (sp > 20 && view.phase !== PH_REPLAY) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const k = i / this.trail.length;
        ctx.globalAlpha = k * 0.35 * clamp(sp / 45, 0, 1);
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, 2.2 * (0.5 + k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (sp <= 20 && this.trail.length > 3) {
      this.trail.shift();
    }

    // sombras fracas no chao
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const c of view.cars) {
      ctx.beginPath();
      ctx.ellipse(c.x, 0.05, 2.2 * clamp(1 - c.y / 30, 0.3, 1), 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(b.x, 0.05, 2 * clamp(1 - b.y / 35, 0.3, 1), 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const c of view.cars) {
      const isLocal = p.locals.some((l) => l.slot === c.slot);
      let expr: Expr = 'normal';
      const goal = view.goal;
      if (goal && (view.phase === PH_GOAL || view.phase === PH_REPLAY || view.phase === PH_END)) {
        if (goal.own && c.slot === goal.slot) expr = 'dizzy';
        else if (c.team === goal.team) expr = 'happy';
        else expr = 'sad';
      } else {
        const ov = p.expr.get(c.slot);
        if (ov && ov.until > t) expr = ov.e;
        else if (!c.grounded && Math.cos(c.a) < -0.2) expr = 'dizzy';
      }
      const celebrate = expr === 'happy';
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      // carros comemorando pulam de leve
      ctx.scale(c.facing, -1);
      drawCarLocal(ctx, c, { ball: b, t, expr, celebrate, scale: s, isLocal });
      ctx.restore();
      void CARS;
      void CAR_GEO;
    }

    // bola
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(1, -1);
    drawBall(ctx, 0, 0, b.a, s, clamp(sp / 50, 0, 1));
    ctx.restore();
  }

  private drawParticles(fx: Fx): void {
    const ctx = this.ctx;
    for (const p of fx.particles) {
      const k = p.life / p.max;
      const a = 1 - k;
      switch (p.kind) {
        case 'flame':
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'spark':
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'smoke':
          ctx.globalAlpha = a * 0.6;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + k * 9, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'banana':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(1, -1);
          drawBanana(ctx, 0, 0, p.size, -p.rot, Math.min(1, a * 2));
          ctx.restore();
          break;
        case 'confetti':
          ctx.save();
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'star': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? p.size : p.size * 0.4;
            const an = (i / 8) * Math.PI * 2;
            ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawArenaFrame(view: RenderState): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(-ARENA.HW, 0, ARENA.HW, 0);
    g.addColorStop(0, TEAM_COLORS[0].main);
    g.addColorStop(0.5, '#e2e8f0');
    g.addColorStop(1, TEAM_COLORS[1].main);
    this.arenaPath();
    ctx.strokeStyle = g;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
    void view;
  }

  // ---------------------------------------------------------------- tela
  private drawAds(p: DrawParams, s: number, sx: number, sy: number): void {
    const ctx = this.ctx;
    const ads = p.theme.ads;
    ctx.font = `800 ${Math.max(8, 1.7 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const step = 15;
    const startI = Math.floor((this.cam.x - this.cam.vw / 2) / step) - 1;
    const endI = Math.ceil((this.cam.x + this.cam.vw / 2) / step) + 1;
    for (let i = startI; i <= endI; i++) {
      const x = i * step + 7.5;
      if (Math.abs(x) > ARENA.HW - 4) continue;
      const idx = ((i % ads.length) + ads.length) % ads.length;
      const px = this.wx(x, s, sx);
      const py = this.wy(12.5, s, sy);
      ctx.fillStyle = idx % 2 ? 'rgba(250,204,21,0.9)' : 'rgba(248,250,252,0.92)';
      ctx.fillRect(px - 6.4 * s, py - 1.1 * s, 12.8 * s, 2.2 * s);
      ctx.fillStyle = idx % 2 ? '#422006' : '#0f172a';
      ctx.fillText(ads[idx], px, py + 0.05 * s);
    }
  }

  private drawFloatTexts(p: DrawParams, s: number, sx: number, sy: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of p.fx.texts) {
      const k = t.life / t.max;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const sc = k < 0.15 ? 0.6 + k * 2.7 : 1;
      ctx.font = `900 ${Math.max(10, t.size * s * sc)}px system-ui, sans-serif`;
      const px = this.wx(t.x, s, sx);
      const py = this.wy(t.y, s, sy);
      ctx.lineWidth = Math.max(3, t.size * s * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineJoin = 'round';
      ctx.strokeText(t.text, px, py);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, px, py);
    }
    ctx.globalAlpha = 1;
  }

  private drawNameTags(p: DrawParams, s: number, sx: number, sy: number): void {
    const ctx = this.ctx;
    if (p.demo || p.view.phase === PH_REPLAY) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${clamp(0.95 * s, 9, 16)}px system-ui, sans-serif`;
    for (const c of p.view.cars) {
      const isLocal = p.locals.some((l) => l.slot === c.slot);
      const px = this.wx(c.x, s, sx);
      const py = this.wy(c.y + 3.4, s, sy);
      const tc = TEAM_COLORS[c.team];
      const label = (isLocal ? '▼ ' : '') + c.name;
      const wdt = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(2,6,23,0.65)';
      ctx.beginPath();
      ctx.roundRect(px - wdt / 2, py - 9, wdt, 18, 9);
      ctx.fill();
      ctx.strokeStyle = tc.main;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = isLocal ? '#fde047' : '#f8fafc';
      ctx.fillText(label, px, py + 0.5);
    }
  }

  private drawReplayOverlay(p: DrawParams): void {
    const ctx = this.ctx;
    // vinheta + linhas de varredura
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.3, this.w / 2, this.h / 2, this.h * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < this.h; y += 4) ctx.fillRect(0, y, this.w, 1);
    const blink = Math.floor(p.t * 2) % 2 === 0;
    const u = clamp(this.w / 1000, 0.7, 1.3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${32 * u}px system-ui, sans-serif`;
    ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(24 * u + 8, this.h - 56 * u, 9 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText('REPLAY', 48 * u + 8, this.h - 56 * u);
    ctx.fillText('REPLAY', 48 * u + 8, this.h - 56 * u);
    if (p.canSkipReplay) {
      ctx.font = `700 ${14 * u}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('ENTER / TOQUE: pular', 24 * u + 8, this.h - 28 * u);
    }
    // barra de progresso
    const k = clamp(p.view.phaseT / REPLAY_DUR, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, this.h - 6, this.w, 6);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, this.h - 6, this.w * k, 6);
  }

  private fmtTime(sec: number): string {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private drawHud(p: DrawParams): void {
    const ctx = this.ctx;
    const { view } = p;
    const u = clamp(Math.min(this.w / 1000, this.h / 560), 0.62, 1.25);
    const top = this.w < 900 ? 52 : 10;
    const cx = this.w / 2;
    // placar
    const bw = 130 * u;
    const bh = 54 * u;
    const mid = 112 * u;
    for (const side of [0, 1] as const) {
      const tc = TEAM_COLORS[side];
      const x = side === 0 ? cx - mid / 2 - bw : cx + mid / 2;
      const g = ctx.createLinearGradient(0, top, 0, top + bh);
      g.addColorStop(0, tc.main);
      g.addColorStop(1, tc.dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, top, bw, bh, [side === 0 ? 14 * u : 4, side === 0 ? 4 : 14 * u, side === 0 ? 4 : 14 * u, side === 0 ? 14 * u : 4]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${38 * u}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      const sc = side === 0 ? view.scoreA : view.scoreB;
      ctx.strokeText(String(sc), x + bw * (side === 0 ? 0.62 : 0.38), top + bh * 0.52);
      ctx.fillText(String(sc), x + bw * (side === 0 ? 0.62 : 0.38), top + bh * 0.52);
      ctx.font = `800 ${10 * u}px system-ui, sans-serif`;
      ctx.fillText(p.teamNames[side], x + bw * (side === 0 ? 0.36 : 0.64), top + bh * 0.5, bw * 0.38);
    }
    ctx.fillStyle = 'rgba(2,6,23,0.88)';
    ctx.beginPath();
    ctx.roundRect(cx - mid / 2, top, mid, bh, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const low = !view.overtime && view.timeLeft <= 10 && view.phase === PH_PLAY;
    ctx.fillStyle = view.overtime ? '#fb7185' : low && Math.floor(p.t * 3) % 2 ? '#ef4444' : '#fef08a';
    ctx.font = `900 ${28 * u}px system-ui, sans-serif`;
    ctx.fillText(view.overtime ? `+${this.fmtTime(view.timeLeft)}` : this.fmtTime(view.timeLeft), cx, top + bh * 0.45);
    ctx.font = `800 ${9.5 * u}px system-ui, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(view.overtime ? 'PRORROGAÇÃO' : 'TEMPO', cx, top + bh * 0.82);

    // medidor de turbo
    p.locals.forEach((l, i) => {
      const car = view.cars.find((c) => c.slot === l.slot);
      if (!car) return;
      const w = 230 * u;
      const h = 26 * u;
      const x = p.locals.length > 1 && i === 1 ? this.w - w - 16 : 16;
      const y = this.h - h - 26 * u;
      ctx.fillStyle = 'rgba(2,6,23,0.75)';
      ctx.beginPath();
      ctx.roundRect(x - 6, y - 22 * u, w + 12, h + 30 * u, 12);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.textAlign = 'left';
      ctx.font = `800 ${11 * u}px system-ui, sans-serif`;
      ctx.fillText(`🔥 TURBO DE GUARANÁ · ${l.label}`, x + 4, y - 9 * u);
      const k = clamp(car.boost / 100, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#facc15');
      g.addColorStop(0.6, '#fb923c');
      g.addColorStop(1, '#e11d48');
      ctx.fillStyle = car.boosting ? '#fff7ae' : g;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * k), h, h / 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.font = `900 ${14 * u}px system-ui, sans-serif`;
      ctx.fillText(String(Math.round(car.boost)), x + Math.max(h, w * k) / 2, y + h / 2 + 1);
    });
  }

  private drawPhaseText(p: DrawParams): void {
    const ctx = this.ctx;
    const { view } = p;
    const u = clamp(Math.min(this.w / 1000, this.h / 560), 0.6, 1.4);
    const cx = this.w / 2;
    const cy = this.h * 0.4;
    const big = (text: string, size: number, fill: string, k = 1) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${size * u}px system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * u * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = fill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    if (p.demo) return;
    if (view.phase === PH_COUNTDOWN) {
      const rem = COUNTDOWN_DUR - view.phaseT;
      if (rem > 3) {
        big('PREPARAR...', 54, '#fff');
      } else {
        const n = Math.ceil(rem);
        const frac = rem - Math.floor(rem);
        big(String(n), 150, n === 1 ? '#4ade80' : n === 2 ? '#fde047' : '#fb923c', 0.8 + frac * 0.5);
      }
    } else if (view.phase === PH_PLAY && view.phaseT < 0.9) {
      big('VAI!', 120, '#4ade80', 1 + view.phaseT * 0.3);
      if (view.overtime) {
        ctx.font = `900 ${28 * u}px system-ui, sans-serif`;
        ctx.fillStyle = '#fb7185';
        ctx.fillText('GOL DE OURO!', cx, cy + 70 * u);
      }
    } else if (view.phase === PH_GOAL && view.goal) {
      const k = Math.min(1, view.phaseT / 0.25);
      const g = view.goal;
      const tc = TEAM_COLORS[g.team];
      big('GOOOOL!', 118, tc.light, 0.6 + k * 0.5 + Math.sin(view.phaseT * 9) * 0.03);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${clamp(this.w / 28, 18, 38) * 1}px system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(g.text, cx, cy + 92 * u);
      ctx.fillStyle = '#fde047';
      ctx.fillText(g.text, cx, cy + 92 * u);
      ctx.font = `800 ${18 * u}px system-ui, sans-serif`;
      ctx.fillStyle = tc.main;
      ctx.strokeText(p.teamNames[g.team] + ' MARCAM!', cx, cy + 128 * u);
      ctx.fillText(p.teamNames[g.team] + ' MARCAM!', cx, cy + 128 * u);
      ctx.restore();
    }
  }
}
