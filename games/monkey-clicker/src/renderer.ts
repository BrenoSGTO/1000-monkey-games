import { BUILDINGS, getEvolutionTier } from './data';
import type {
  ClickRipple,
  FloatingText,
  GameState,
  Particle,
  RemoteCursor,
} from './types';

export interface StageGeometry {
  w: number;
  h: number;
  bananaX: number;
  bananaY: number;
  bananaR: number;
  monkeyX: number;
  monkeyY: number;
  monkeyScale: number;
}

export class ClickerRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 800;
  private height = 600;
  private dpr = 1;

  // Animation states
  public time = 0;
  public bananaSquash = 0; // spring impulse
  public monkeyReach = 0; // arm slap animation 0..1
  public monkeySurprised = 0; // mouth/eyes hype timer
  public shakeAmount = 0;
  public pointerNX = 0.5;
  public pointerNY = 0.5;
  private blinkTimer = 2.4;
  private isBlinking = false;

  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public ripples: ClickRipple[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D não suportado');
    this.ctx = ctx;
    this.resize();
  }

  public resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(300, rect.width || window.innerWidth);
    this.height = Math.max(260, rect.height || window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
  }

  public getGeometry(): StageGeometry {
    const w = this.width;
    const h = this.height;
    const compact = w < 540;
    const bananaR = Math.min(w * (compact ? 0.22 : 0.17), h * 0.23, 128);
    const bananaX = compact ? w * 0.42 : w * 0.43;
    const bananaY = h * 0.54;
    const monkeyScale = Math.max(0.68, Math.min(1.22, bananaR / 102));
    const monkeyX = bananaX + bananaR * (compact ? 1.05 : 1.24);
    const monkeyY = bananaY + bananaR * 0.25;
    return { w, h, bananaX, bananaY, bananaR, monkeyX, monkeyY, monkeyScale };
  }

  public triggerClickFeedback(
    clientX: number,
    clientY: number,
    label: string,
    color: string,
    isCrit: boolean,
    shake = 4,
  ): void {
    this.bananaSquash = Math.min(1.2, this.bananaSquash + (isCrit ? 0.75 : 0.45));
    this.monkeyReach = 1;
    this.monkeySurprised = Math.max(this.monkeySurprised, isCrit ? 0.45 : 0.22);
    this.shakeAmount = Math.min(16, this.shakeAmount + shake);

    this.ripples.push({
      x: clientX,
      y: clientY,
      radius: 8,
      maxRadius: isCrit ? 72 : 48,
      life: 0.36,
      maxLife: 0.36,
      color,
    });

    this.floatingTexts.push({
      x: clientX + (Math.random() - 0.5) * 34,
      y: clientY - 14,
      vy: isCrit ? -92 : -68,
      text: label,
      color,
      size: isCrit ? 24 : 18,
      life: 0.95,
      maxLife: 0.95,
    });

    const count = isCrit ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * (isCrit ? 220 : 150);
      this.particles.push({
        x: clientX,
        y: clientY,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 60,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        size: 4 + Math.random() * 6,
        color: isCrit ? (i % 2 === 0 ? '#fef08a' : '#fb7185') : '#facc15',
        kind: i % 3 === 0 ? 'banana' : i % 2 === 0 ? 'star' : 'circle',
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 10,
      });
    }
  }

  public spawnBurst(x: number, y: number, color: string, count = 20, confetti = false): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 260;
      const palette = ['#facc15', '#4ade80', '#fb7185', '#38bdf8', '#c084fc'];
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 90,
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        size: confetti ? 6 + Math.random() * 5 : 5 + Math.random() * 5,
        color: confetti ? palette[i % palette.length] : color,
        kind: confetti ? 'confetti' : i % 2 === 0 ? 'star' : 'banana',
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 12,
      });
    }
  }

  public addBannerText(text: string, color = '#fde047'): void {
    const g = this.getGeometry();
    this.floatingTexts.push({
      x: g.bananaX,
      y: g.bananaY - g.bananaR - 26,
      vy: -42,
      text,
      color,
      size: 26,
      life: 1.5,
      maxLife: 1.5,
    });
  }

  public step(dt: number): void {
    this.time += dt;
    this.bananaSquash = Math.max(0, this.bananaSquash - dt * 4.2);
    this.monkeyReach = Math.max(0, this.monkeyReach - dt * 5.2);
    this.monkeySurprised = Math.max(0, this.monkeySurprised - dt);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 28);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      if (this.isBlinking) {
        this.isBlinking = false;
        this.blinkTimer = 1.8 + Math.random() * 2.8;
      } else {
        this.isBlinking = true;
        this.blinkTimer = 0.13;
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.rot += p.vrot * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.97;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life -= dt;
      const t = 1 - r.life / r.maxLife;
      r.radius = 8 + (r.maxRadius - 8) * t;
      if (r.life <= 0) this.ripples.splice(i, 1);
    }
  }

  public hitTest(
    localX: number,
    localY: number,
    state: GameState,
  ):
    | { kind: 'golden'; id: string }
    | { kind: 'rain'; id: string }
    | { kind: 'chaos' }
    | { kind: 'banana' }
    | { kind: 'miss' } {
    const g = this.getGeometry();

    // 1. Golden banana priority
    if (state.goldenBanana) {
      const gx = state.goldenBanana.nx * g.w;
      const gy = state.goldenBanana.ny * g.h;
      if (Math.hypot(localX - gx, localY - gy) <= 44) {
        return { kind: 'golden', id: state.goldenBanana.id };
      }
    }

    // 2. Chaos boss (Tax Gorilla / Protestor)
    if (
      state.activeEvent &&
      (state.activeEvent.kind === 'tax_gorilla' || state.activeEvent.kind === 'intern_strike')
    ) {
      const cx = state.activeEvent.x * g.w;
      const cy = state.activeEvent.y * g.h;
      if (Math.hypot(localX - cx, localY - cy) <= 58) {
        return { kind: 'chaos' };
      }
    }

    // 3. Rain bananas
    for (let i = state.rainBananas.length - 1; i >= 0; i--) {
      const rb = state.rainBananas[i];
      const rx = rb.nx * g.w;
      const ry = rb.ny * g.h;
      if (Math.hypot(localX - rx, localY - ry) <= 34) {
        return { kind: 'rain', id: rb.id };
      }
    }

    // 4. Giant Banana or Mascot Monkey area
    const distBanana = Math.hypot(localX - g.bananaX, localY - g.bananaY);
    const distMonkey = Math.hypot(localX - g.monkeyX, localY - g.monkeyY);
    if (distBanana <= g.bananaR * 1.18 || distMonkey <= 68 * g.monkeyScale) {
      return { kind: 'banana' };
    }

    return { kind: 'miss' };
  }

  public render(state: GameState, remoteCursors: Map<string, RemoteCursor>): void {
    const ctx = this.ctx;
    const g = this.getGeometry();

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Screen shake
    if (this.shakeAmount > 0.2) {
      const sx = (Math.random() - 0.5) * this.shakeAmount;
      const sy = (Math.random() - 0.5) * this.shakeAmount;
      ctx.translate(sx, sy);
    }

    this.drawBackdrop(ctx, g, state);
    this.drawOrbitingBuildings(ctx, g, state);
    this.drawGiantBanana(ctx, g, state);
    this.drawMonkeyMascot(ctx, g, state);
    this.drawRainBananas(ctx, g, state);
    this.drawGoldenBanana(ctx, g, state);
    this.drawChaosBoss(ctx, g, state);
    this.drawRipplesAndParticles(ctx);
    this.drawRemoteCursors(ctx, g, remoteCursors);
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    const isFever =
      state.activeEvent?.kind === 'fever_7x' || state.activeEvent?.kind === 'click_777x';
    const isBadChaos =
      state.activeEvent?.kind === 'tax_gorilla' || state.activeEvent?.kind === 'intern_strike';

    const bgGrad = ctx.createRadialGradient(g.bananaX, g.bananaY, 20, g.bananaX, g.bananaY, Math.max(g.w, g.h) * 0.8);
    if (isFever) {
      bgGrad.addColorStop(0, '#713f12');
      bgGrad.addColorStop(0.55, '#422006');
      bgGrad.addColorStop(1, '#1e1b4b');
    } else if (isBadChaos) {
      bgGrad.addColorStop(0, '#4c0519');
      bgGrad.addColorStop(0.65, '#1e1b4b');
      bgGrad.addColorStop(1, '#090d16');
    } else if (state.prestigeChips >= 20) {
      bgGrad.addColorStop(0, '#312e81');
      bgGrad.addColorStop(0.6, '#14532d');
      bgGrad.addColorStop(1, '#07130d');
    } else {
      bgGrad.addColorStop(0, '#166534');
      bgGrad.addColorStop(0.55, '#0f3823');
      bgGrad.addColorStop(1, '#07130d');
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, g.w, g.h);

    // Subtle stars when cosmic / fever
    if (state.prestigeChips >= 5 || isFever) {
      ctx.fillStyle = 'rgba(254, 249, 195, 0.4)';
      for (let i = 0; i < 24; i++) {
        const sx = ((i * 173.3) % 1) * g.w;
        const sy = ((i * 97.7) % 1) * g.h;
        const r = 1 + Math.sin(this.time * 2.5 + i) * 1.1;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, r), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tropical jungle silhouette framing bottom
    ctx.fillStyle = 'rgba(5, 30, 18, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, g.h);
    ctx.quadraticCurveTo(g.w * 0.16, g.h - 70, g.w * 0.34, g.h);
    ctx.quadraticCurveTo(g.w * 0.62, g.h - 50, g.w, g.h - 20);
    ctx.lineTo(g.w, g.h);
    ctx.closePath();
    ctx.fill();

    // Sunburst rays behind the Giant Banana
    ctx.save();
    ctx.translate(g.bananaX, g.bananaY);
    ctx.rotate(this.time * (isFever ? 0.55 : 0.16));
    const rayCount = 12;
    const rayLen = Math.max(g.w, g.h) * 0.8;
    ctx.fillStyle = isFever ? 'rgba(253, 224, 71, 0.14)' : 'rgba(250, 204, 21, 0.07)';
    for (let i = 0; i < rayCount; i++) {
      const a = (i / rayCount) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.11) * rayLen, Math.sin(a - 0.11) * rayLen);
      ctx.lineTo(Math.cos(a + 0.11) * rayLen, Math.sin(a + 0.11) * rayLen);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawOrbitingBuildings(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    const ownedIcons: string[] = [];
    for (const b of BUILDINGS) {
      const cnt = state.buildings[b.id] || 0;
      if (cnt > 0) {
        const copies = Math.min(3, Math.ceil(Math.log10(cnt + 1)));
        for (let i = 0; i < copies; i++) ownedIcons.push(b.emoji);
      }
    }
    const visible = ownedIcons.slice(0, 16);
    if (visible.length === 0) return;

    const orbitR = g.bananaR * 1.48;
    ctx.font = `${Math.round(Math.max(18, g.bananaR * 0.22))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    visible.forEach((emoji, idx) => {
      const angle = this.time * 0.45 + (idx / visible.length) * Math.PI * 2;
      const ox = g.bananaX + Math.cos(angle) * orbitR;
      const oy = g.bananaY + Math.sin(angle) * (orbitR * 0.68);
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillText(emoji, ox, oy);
      ctx.restore();
    });
  }

  private drawGiantBanana(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    const isFever =
      state.activeEvent?.kind === 'fever_7x' || state.activeEvent?.kind === 'click_777x';
    const squash = this.bananaSquash;
    const idleBob = Math.sin(this.time * 2.8) * 5;
    const scaleX = 1 + squash * 0.22;
    const scaleY = 1 - squash * 0.18;
    const tilt = -0.22 + Math.sin(this.time * 2.1) * 0.04 + squash * 0.12;

    ctx.save();
    ctx.translate(g.bananaX, g.bananaY + idleBob);

    // Glow halo
    const glowGrad = ctx.createRadialGradient(0, 0, g.bananaR * 0.2, 0, 0, g.bananaR * 1.35);
    glowGrad.addColorStop(0, isFever ? 'rgba(253, 224, 71, 0.55)' : 'rgba(250, 204, 21, 0.28)');
    glowGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, g.bananaR * 1.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(tilt);
    ctx.scale(scaleX, scaleY);

    const s = g.bananaR / 95;
    ctx.scale(s, s);

    // Banana crescent body
    const bGrad = ctx.createLinearGradient(-75, -75, 70, 75);
    if (isFever) {
      bGrad.addColorStop(0, '#fef9c3');
      bGrad.addColorStop(0.5, '#fde047');
      bGrad.addColorStop(1, '#f59e0b');
    } else {
      bGrad.addColorStop(0, '#fef08a');
      bGrad.addColorStop(0.55, '#facc15');
      bGrad.addColorStop(1, '#ca8a04');
    }

    ctx.beginPath();
    ctx.moveTo(-78, 42);
    ctx.bezierCurveTo(-70, -35, -10, -98, 76, -106);
    ctx.bezierCurveTo(58, -28, 24, 48, -68, 74);
    ctx.bezierCurveTo(-82, 78, -82, 58, -78, 42);
    ctx.closePath();

    ctx.fillStyle = bGrad;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#713f12';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Peel highlight ridge
    ctx.beginPath();
    ctx.moveTo(-44, 30);
    ctx.quadraticCurveTo(-8, -42, 54, -84);
    ctx.strokeStyle = 'rgba(254, 249, 195, 0.72)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Stem & bottom tip
    ctx.beginPath();
    ctx.moveTo(72, -104);
    ctx.lineTo(89, -118);
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = '#713f12';
    ctx.beginPath();
    ctx.arc(-74, 61, 7, 0, Math.PI * 2);
    ctx.fill();

    // Goofy little sticker on the giant banana
    ctx.save();
    ctx.translate(4, -12);
    ctx.rotate(0.35);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fef9c3';
    ctx.font = '900 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('100% SLOP', 0, 0.5);
    ctx.restore();

    ctx.restore();
  }

  private drawMonkeyMascot(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    const breath = Math.sin(this.time * 3.4) * 0.035;
    const bounceY = Math.sin(this.time * 3.4) * 3 - this.monkeyReach * 8;
    const scale = g.monkeyScale;
    const tier = getEvolutionTier(state.prestigeChips);
    const isChaosPanic =
      state.activeEvent?.kind === 'tax_gorilla' || state.activeEvent?.kind === 'intern_strike';
    const isFever =
      state.activeEvent?.kind === 'fever_7x' || state.activeEvent?.kind === 'click_777x';

    ctx.save();
    ctx.translate(g.monkeyX, g.monkeyY + bounceY);
    ctx.scale(scale * (1 + breath), scale * (1 - breath * 0.7));

    // Tail swaying behind
    const tailWag = Math.sin(this.time * 4.5) * 14;
    ctx.beginPath();
    ctx.moveTo(28, 52);
    ctx.bezierCurveTo(68, 48 + tailWag, 78, -6 + tailWag, 56, -24);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fur gradient
    const furGrad = ctx.createLinearGradient(0, -58, 0, 88);
    furGrad.addColorStop(0, '#b45309');
    furGrad.addColorStop(1, '#78350f');

    // Body
    ctx.fillStyle = furGrad;
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 46, 36, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.ellipse(0, 48, 22, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Necktie for tier >= 1
    if (state.prestigeChips >= 1) {
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 24);
      ctx.lineTo(4, 24);
      ctx.lineTo(7, 54);
      ctx.lineTo(0, 62);
      ctx.lineTo(-7, 54);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Ears
    const drawEar = (ex: number) => {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ex, -10, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fdba74';
      ctx.beginPath();
      ctx.arc(ex, -10, 9.5, 0, Math.PI * 2);
      ctx.fill();
    };
    drawEar(-43);
    drawEar(43);

    // Head
    ctx.fillStyle = furGrad;
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -12, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair tuft on top
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(-10, -52);
    ctx.quadraticCurveTo(0, -70, 10, -52);
    ctx.fill();

    // Face mask (muzzle + eye patches)
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.ellipse(0, 6, 31, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-14, -14, 14, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(14, -14, 14, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Look vector toward mouse pointer (with classic googly cross-eyed offset!)
    const px = this.pointerNX * g.w;
    const py = this.pointerNY * g.h;
    const lookAngle = Math.atan2(py - (g.monkeyY - 12), px - g.monkeyX);
    const pupilDist = 4.2;
    const lx = Math.cos(lookAngle) * pupilDist;
    const ly = Math.sin(lookAngle) * pupilDist;

    // Googly Eyes (with blink)
    const drawEye = (cx: number, cy: number, googlyOffset: number) => {
      if (this.isBlinking) {
        ctx.beginPath();
        ctx.moveTo(cx - 9, cy);
        ctx.quadraticCurveTo(cx, cy + 4, cx + 9, cy);
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3.5;
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pupils track cursor + slight cross-eyed wiggle
      const wiggle = Math.sin(this.time * 8 + googlyOffset) * 1.1;
      const pxPos = cx + lx + googlyOffset * 1.4 + wiggle;
      const pyPos = cy + ly - googlyOffset * 0.8;
      ctx.fillStyle = isFever ? '#d97706' : '#0f172a';
      ctx.beginPath();
      ctx.arc(pxPos, pyPos, 4.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pxPos - 1.5, pyPos - 1.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };

    drawEye(-14, -14, 1);
    drawEye(14, -14, -1);

    // Evolution accessories on head/eyes
    if (tier.minChips >= 5 && tier.minChips < 20) {
      // Cool Faria Limer sunglasses
      ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.5;
      ctx.fillRect(-27, -23, 24, 15);
      ctx.strokeRect(-27, -23, 24, 15);
      ctx.fillRect(3, -23, 24, 15);
      ctx.strokeRect(3, -23, 24, 15);
      ctx.beginPath();
      ctx.moveTo(-3, -17);
      ctx.lineTo(3, -17);
      ctx.stroke();
    } else if (tier.minChips >= 20 && tier.minChips < 75) {
      // Cyberpunk neon visor
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-29, -24, 58, 17, 6);
      ctx.fill();
      ctx.stroke();
    } else if (tier.minChips >= 75) {
      // Cosmic golden crown
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-24, -46);
      ctx.lineTo(-18, -72);
      ctx.lineTo(-6, -56);
      ctx.lineTo(0, -78);
      ctx.lineTo(6, -56);
      ctx.lineTo(18, -72);
      ctx.lineTo(24, -46);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Nostrils
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(-4.5, -1, 2.5, 0, Math.PI * 2);
    ctx.arc(4.5, -1, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Expressive Mouth
    if (isChaosPanic) {
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 14, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (this.monkeySurprised > 0 || isFever) {
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 9, 15, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(0, 18, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 8, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Slapping / clicking left hand reaching toward the Giant Banana!
    const handX = -46 - this.monkeyReach * 24;
    const handY = 24 - this.monkeyReach * 18;
    ctx.beginPath();
    ctx.moveTo(-26, 32);
    ctx.lineTo(handX, handY);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.fillStyle = '#fed7aa';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(handX, handY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawGoldenBanana(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    const gb = state.goldenBanana;
    if (!gb) return;
    const x = gb.nx * g.w;
    const y = gb.ny * g.h;
    const pulse = 1 + Math.sin(this.time * 8) * 0.1;

    ctx.save();
    ctx.translate(x, y);

    // Aura
    const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 44);
    aura.addColorStop(0, gb.isRainbow ? 'rgba(244, 114, 182, 0.7)' : 'rgba(253, 224, 71, 0.7)');
    aura.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();

    // Countdown arc
    const ratio = Math.max(0, gb.life / gb.maxLife);
    ctx.beginPath();
    ctx.arc(0, 0, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.strokeStyle = gb.isRainbow ? '#f472b6' : '#fef08a';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.scale(pulse, pulse);
    ctx.rotate(Math.sin(this.time * 4) * 0.2);

    ctx.beginPath();
    ctx.moveTo(-22, 12);
    ctx.bezierCurveTo(-18, -12, -2, -28, 22, -28);
    ctx.bezierCurveTo(16, -8, 6, 14, -18, 20);
    ctx.closePath();
    ctx.fillStyle = gb.isRainbow
      ? `hsl(${(this.time * 180) % 360}, 95%, 65%)`
      : '#fef08a';
    ctx.fill();
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  private drawRainBananas(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    for (const rb of state.rainBananas) {
      const x = rb.nx * g.w;
      const y = rb.ny * g.h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rb.rot);
      ctx.beginPath();
      ctx.moveTo(-16, 8);
      ctx.bezierCurveTo(-12, -10, 0, -18, 16, -18);
      ctx.bezierCurveTo(12, -4, 4, 10, -14, 14);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawChaosBoss(ctx: CanvasRenderingContext2D, g: StageGeometry, state: GameState): void {
    const ev = state.activeEvent;
    if (!ev || (ev.kind !== 'tax_gorilla' && ev.kind !== 'intern_strike')) return;

    const x = ev.x * g.w;
    const y = ev.y * g.h + Math.sin(this.time * 7) * 5;
    const isTax = ev.kind === 'tax_gorilla';

    ctx.save();
    ctx.translate(x, y);

    // Danger ring
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gorilla / Protestor face
    ctx.fillStyle = isTax ? '#334155' : '#78350f';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Angry eyes
    ctx.fillStyle = '#fecdd3';
    ctx.beginPath();
    ctx.arc(-11, -6, 7, 0, Math.PI * 2);
    ctx.arc(11, -6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(-10, -6, 3, 0, Math.PI * 2);
    ctx.arc(10, -6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Angry brows
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-20, -16);
    ctx.lineTo(-4, -10);
    ctx.moveTo(20, -16);
    ctx.lineTo(4, -10);
    ctx.stroke();

    // Label & HP bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-44, 38, 88, 10);
    ctx.fillStyle = '#fb7185';
    ctx.fillRect(-43, 39, 86 * Math.max(0, ev.hp / ev.maxHp), 8);

    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fecdd3';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    const title = isTax ? '🦍 LEÃO DA SELVA! BATA!' : '🪧 GREVE! CLIQUE AQUI!';
    ctx.strokeText(title, 0, -44);
    ctx.fillText(title, 0, -44);

    ctx.restore();
  }

  private drawRipplesAndParticles(ctx: CanvasRenderingContext2D): void {
    for (const r of this.ripples) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 'banana') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0.2, Math.PI * 1.1);
        ctx.lineWidth = 3;
        ctx.strokeStyle = p.color;
        ctx.stroke();
      } else if (p.kind === 'confetti') {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawRemoteCursors(
    ctx: CanvasRenderingContext2D,
    g: StageGeometry,
    cursors: Map<string, RemoteCursor>,
  ): void {
    for (const c of cursors.values()) {
      const cx = c.nx * g.w;
      const cy = c.ny * g.h;
      ctx.save();
      ctx.translate(cx, cy);

      if (c.clickFlash > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, 12 + (1 - c.clickFlash) * 26, 0, Math.PI * 2);
        ctx.strokeStyle = c.color;
        ctx.globalAlpha = c.clickFlash;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Pointer arrow
      ctx.fillStyle = c.color;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 20);
      ctx.lineTo(6, 15);
      ctx.lineTo(11, 24);
      ctx.lineTo(15, 22);
      ctx.lineTo(10, 13);
      ctx.lineTo(17, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Name pill
      ctx.font = '800 11px system-ui, sans-serif';
      const tw = ctx.measureText(c.name).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(14, 16, tw + 12, 18, 6);
      ctx.fill();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = c.color;
      ctx.fillText(c.name, 20, 29);

      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.font = `900 ${ft.size}px system-ui, sans-serif`;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}
