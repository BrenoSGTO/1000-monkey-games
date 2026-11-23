import { EAT_MASS_RATIO, SKIN_MAP, massToRadius } from './skins';
import type {
  CactusVirus,
  FloatingText,
  FoodPellet,
  GameMode,
  MonkeyCell,
  Particle,
  SkinId,
} from './types';

export interface RenderInput {
  cells: MonkeyCell[];
  food: FoodPellet[];
  cacti: CactusVirus[];
  localOwnerId: string;
  leaderOwnerId?: string;
  arenaSize: number;
  mode: GameMode;
}

export class ArenaRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public camX = 1900;
  public camY = 1900;
  public camZoom = 1.0;
  private shake = 0;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D context');
    this.ctx = ctx;
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }

  spawnParticles(x: number, y: number, color: string, count: number, speed = 220): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 3 + Math.random() * 5,
        color,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
      });
    }
  }

  addFloatingText(x: number, y: number, text: string, color = '#fef08a', scale = 1): void {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1.15,
      maxLife: 1.15,
      scale,
    });
  }

  updateEffects(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 36);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-4 * dt);
      p.vy *= Math.exp(-4 * dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const ft of this.floatingTexts) {
      ft.y -= 42 * dt;
      ft.life -= dt;
    }
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.life > 0);
  }

  render(state: RenderInput, dt: number): void {
    this.updateEffects(dt);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Update camera smoothly around player's cells (or spectate leader)
    const myCells = state.cells.filter((c) => c.ownerId === state.localOwnerId);
    let targetX = this.camX;
    let targetY = this.camY;
    let targetZoom = 0.85;

    if (myCells.length > 0) {
      let sumMass = 0;
      let cx = 0;
      let cy = 0;
      let sumRadii = 0;
      for (const c of myCells) {
        cx += c.x * c.mass;
        cy += c.y * c.mass;
        sumMass += c.mass;
        sumRadii += massToRadius(c.mass);
      }
      targetX = cx / sumMass;
      targetY = cy / sumMass;
      const minDim = Math.min(w, h);
      const baseScale = Math.max(0.75, minDim / 920);
      targetZoom = Math.max(0.32, Math.min(1.18, (baseScale * 1.15) / Math.pow(Math.max(24, sumRadii) / 36, 0.42)));
    } else if (state.cells.length > 0) {
      // Gentle spectator pan around biggest monkey
      let big = state.cells[0];
      for (const c of state.cells) {
        if (c.mass > big.mass) big = c;
      }
      targetX = big.x;
      targetY = big.y;
      targetZoom = 0.72;
    }

    const camLerp = Math.min(1, dt * 6.5);
    this.camX += (targetX - this.camX) * camLerp;
    this.camY += (targetY - this.camY) * camLerp;
    this.camZoom += (targetZoom - this.camZoom) * Math.min(1, dt * 3.5);

    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;

    // Background fill
    ctx.fillStyle = '#06150f';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    const halfW = (w / 2) / this.camZoom + 140;
    const halfH = (h / 2) / this.camZoom + 140;
    const viewMinX = this.camX - halfW;
    const viewMaxX = this.camX + halfW;
    const viewMinY = this.camY - halfH;
    const viewMaxY = this.camY + halfH;

    // Arena floor & grid
    this.drawArenaGrid(ctx, state.arenaSize, viewMinX, viewMaxX, viewMinY, viewMaxY);

    // Draw food pellets
    for (const f of state.food) {
      if (f.x < viewMinX || f.x > viewMaxX || f.y < viewMinY || f.y > viewMaxY) continue;
      this.drawFood(ctx, f);
    }

    // Determine largest local cell for threat visual cues
    let myMaxMass = 0;
    for (const c of myCells) {
      if (c.mass > myMaxMass) myMaxMass = c.mass;
    }

    // Sort cells small -> big so big eats small visually
    const sortedCells = [...state.cells].sort((a, b) => a.mass - b.mass);

    // Interleave cacti by mass so huge monkeys can cover or pop on cacti cleanly
    const drawItems: Array<{ kind: 'cell'; cell: MonkeyCell } | { kind: 'cactus'; cactus: CactusVirus }> = [];
    for (const c of sortedCells) {
      if (c.x < viewMinX - 240 || c.x > viewMaxX + 240 || c.y < viewMinY - 240 || c.y > viewMaxY + 240) continue;
      drawItems.push({ kind: 'cell', cell: c });
    }
    for (const ca of state.cacti) {
      if (ca.x < viewMinX - 160 || ca.x > viewMaxX + 160 || ca.y < viewMinY - 160 || ca.y > viewMaxY + 160) continue;
      drawItems.push({ kind: 'cactus', cactus: ca });
    }
    drawItems.sort((a, b) => {
      const mA = a.kind === 'cell' ? a.cell.mass : a.cactus.mass * 1.15;
      const mB = b.kind === 'cell' ? b.cell.mass : b.cactus.mass * 1.15;
      return mA - mB;
    });

    for (const item of drawItems) {
      if (item.kind === 'cactus') {
        this.drawCactus(ctx, item.cactus);
      } else {
        const c = item.cell;
        const isThreat =
          myMaxMass > 0 &&
          c.ownerId !== state.localOwnerId &&
          c.mass >= myMaxMass * EAT_MASS_RATIO;
        const isLeader = Boolean(state.leaderOwnerId && c.ownerId === state.leaderOwnerId);
        this.drawMonkeyCell(ctx, c, state.mode, isLeader, isThreat);
      }
    }

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating PT-BR Texts
    for (const ft of this.floatingTexts) {
      const alpha = Math.min(1, ft.life / 0.35);
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${Math.round(22 * ft.scale)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore(); // end world transform

    // Minimap in bottom-right (skip if screen very narrow and touch buttons overlap; move above touch buttons)
    const isMobileLayout = w < 720;
    this.drawMinimap(ctx, w, h, state, isMobileLayout);

    ctx.restore(); // end dpr scale
  }

  private drawArenaGrid(
    ctx: CanvasRenderingContext2D,
    size: number,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
  ): void {
    const startX = Math.max(0, Math.floor(minX / 120) * 120);
    const endX = Math.min(size, Math.ceil(maxX / 120) * 120);
    const startY = Math.max(0, Math.floor(minY / 120) * 120);
    const endY = Math.min(size, Math.ceil(maxY / 120) * 120);

    // Jungle arena base
    ctx.fillStyle = '#0a2117';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(74, 222, 128, 0.09)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += 120) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += 120) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Arena hazard border
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 22;
    ctx.strokeRect(-14, -14, size + 28, size + 28);
  }

  private drawFood(ctx: CanvasRenderingContext2D, f: FoodPellet): void {
    ctx.save();
    ctx.translate(f.x, f.y);

    if (f.kind === 'cacho') {
      const bob = Math.sin(this.time * 4 + f.id) * 2.5;
      ctx.translate(0, bob);
      // Golden aura
      ctx.fillStyle = 'rgba(250, 204, 21, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.rotate(f.rot + i * 0.42);
        ctx.translate(i * 4, 0);
        this.drawBananaShape(ctx, 13, '#fde047', '#854d0e');
        ctx.restore();
      }
    } else if (f.kind === 'ejected') {
      ctx.rotate(f.rot);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      this.drawBananaShape(ctx, 14, '#fde047', '#713f12');
    } else {
      ctx.rotate(f.rot + Math.sin(this.time * 2 + f.id) * 0.12);
      this.drawBananaShape(ctx, 10, '#facc15', '#854d0e');
    }

    ctx.restore();
  }

  private drawBananaShape(
    ctx: CanvasRenderingContext2D,
    size: number,
    fill: string,
    stroke: string,
  ): void {
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.35);
    ctx.quadraticCurveTo(0, -size * 0.95, size, size * 0.15);
    ctx.quadraticCurveTo(0, -size * 0.2, -size, size * 0.35);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  private drawCactus(ctx: CanvasRenderingContext2D, ca: CactusVirus): void {
    const r = massToRadius(ca.mass);
    const spikes = 18;
    const pulse = 1 + Math.sin(ca.pulse) * 0.04;

    ctx.save();
    ctx.translate(ca.x, ca.y);
    ctx.scale(pulse, pulse);

    // Danger glow
    ctx.fillStyle = 'rgba(132, 204, 22, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
    ctx.fill();

    // Spiky star body
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (i * Math.PI) / spikes + ca.pulse * 0.08;
      const rad = i % 2 === 0 ? r * 1.08 : r * 0.82;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#a3e635');
    grad.addColorStop(0.7, '#65a30d');
    grad.addColorStop(1, '#365314');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1a2e05';
    ctx.stroke();

    // Angry goofy cactus eyes
    const eyeOff = r * 0.24;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a2e05';
    ctx.lineWidth = 2;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * eyeOff, -r * 0.06, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1a2e05';
      ctx.beginPath();
      ctx.arc(sx * eyeOff, -r * 0.05, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    }

    // Mouth
    ctx.strokeStyle = '#1a2e05';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.2);
    ctx.quadraticCurveTo(0, r * 0.08, r * 0.2, r * 0.2);
    ctx.stroke();

    ctx.restore();
  }

  private drawMonkeyCell(
    ctx: CanvasRenderingContext2D,
    cell: MonkeyCell,
    mode: GameMode,
    isLeader: boolean,
    isThreat: boolean,
  ): void {
    const r = massToRadius(cell.mass);
    const skin = SKIN_MAP[cell.skin] ?? SKIN_MAP.classico;

    ctx.save();
    ctx.translate(cell.x, cell.y);

    // Team ring or Leader aura
    if (mode === 'teams' && cell.team !== 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = cell.team === 1 ? '#facc15' : '#38bdf8';
      ctx.lineWidth = 5;
      ctx.stroke();
    } else if (isLeader) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 + Math.sin(this.time * 5) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (isThreat) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Ears (behind body)
    const earDist = r * 0.88;
    const earR = r * 0.29;
    for (const side of [-1, 1]) {
      const ex = side * earDist * 0.88;
      const ey = -earDist * 0.52;
      ctx.beginPath();
      ctx.arc(ex, ey, earR, 0, Math.PI * 2);
      ctx.fillStyle = skin.furMid;
      ctx.fill();
      ctx.lineWidth = Math.max(2.5, r * 0.07);
      ctx.strokeStyle = skin.outline;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ex, ey, earR * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = skin.earInner;
      ctx.fill();
    }

    // Jelly wobble blob contour
    const pts = 26;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const wob =
        1 +
        Math.sin(ang * 3 + cell.wobblePhase) * cell.wobbleAmp +
        Math.cos(ang * 5 - cell.wobblePhase * 1.3) * (cell.wobbleAmp * 0.45);
      const rad = r * wob;
      points.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
    }

    ctx.beginPath();
    const last = points[pts - 1];
    const first = points[0];
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < pts; i++) {
      const curr = points[i];
      const next = points[(i + 1) % pts];
      ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.12, 0, 0, r * 1.05);
    grad.addColorStop(0, skin.furLight);
    grad.addColorStop(0.65, skin.furMid);
    grad.addColorStop(1, skin.furDark);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = Math.max(3, r * 0.075);
    ctx.strokeStyle = skin.outline;
    ctx.stroke();

    // Monkey Face Patch (double eye lobes + snout oval)
    ctx.fillStyle = skin.face;
    ctx.beginPath();
    ctx.ellipse(-r * 0.21, -r * 0.14, r * 0.3, r * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.21, -r * 0.14, r * 0.3, r * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(0, r * 0.18, r * 0.5, r * 0.37, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes tracking lookAngle (+ scared reaction!)
    const fear = cell.scared;
    const eyeR = r * (0.155 + fear * 0.055);
    const pupilR = eyeR * (0.48 - fear * 0.18);
    const lookX = Math.cos(cell.lookAngle) * (eyeR * 0.42);
    const lookY = Math.sin(cell.lookAngle) * (eyeR * 0.42);
    const jitterX = fear > 0.3 ? (Math.random() - 0.5) * r * 0.04 : 0;
    const jitterY = fear > 0.3 ? (Math.random() - 0.5) * r * 0.04 : 0;

    for (const side of [-1, 1]) {
      const ex = side * r * 0.22;
      const ey = -r * 0.14;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.035);
      ctx.strokeStyle = skin.outline;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ex + lookX + jitterX, ey + lookY + jitterY, pupilR, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Eye shine
      ctx.beginPath();
      ctx.arc(ex + lookX - pupilR * 0.3, ey + lookY - pupilR * 0.3, pupilR * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    // Sweat drop if scared
    if (fear > 0.35 && r > 22) {
      ctx.fillStyle = '#7dd3fc';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r * 0.52, -r * 0.48);
      ctx.quadraticCurveTo(r * 0.64, -r * 0.32, r * 0.54, -r * 0.24);
      ctx.quadraticCurveTo(r * 0.44, -r * 0.32, r * 0.52, -r * 0.48);
      ctx.fill();
      ctx.stroke();
    }

    // Nostrils
    ctx.fillStyle = skin.outline;
    ctx.beginPath();
    ctx.arc(-r * 0.07, r * 0.03, Math.max(1.5, r * 0.03), 0, Math.PI * 2);
    ctx.arc(r * 0.07, r * 0.03, Math.max(1.5, r * 0.03), 0, Math.PI * 2);
    ctx.fill();

    // Mouth: scared O, open munching, or cheeky grin
    if (fear > 0.48) {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.26, r * 0.14, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.04);
      ctx.strokeStyle = skin.outline;
      ctx.stroke();
    } else if (cell.mouthOpen > 0.15) {
      const openH = r * (0.12 + cell.mouthOpen * 0.22);
      ctx.beginPath();
      ctx.ellipse(0, r * 0.24, r * 0.26, openH, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7f1d1d';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.04);
      ctx.strokeStyle = skin.outline;
      ctx.stroke();

      // Tongue
      ctx.beginPath();
      ctx.ellipse(0, r * 0.24 + openH * 0.45, r * 0.14, openH * 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fb7185';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, r * 0.14, r * 0.23, 0.22, Math.PI - 0.22);
      ctx.lineWidth = Math.max(2, r * 0.045);
      ctx.strokeStyle = skin.outline;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Skin accessory
    this.drawSkinAccessory(ctx, cell.skin, r, isLeader);

    // Nameplate & mass
    if (r >= 20) {
      const fontSize = Math.max(11, Math.min(24, Math.round(r * 0.34)));
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, fontSize * 0.24);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const nameY = r >= 34 ? r * 0.56 : 0;
      ctx.strokeText(cell.name, 0, nameY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(cell.name, 0, nameY);

      if (r >= 38) {
        const subSize = Math.max(10, Math.round(fontSize * 0.65));
        ctx.font = `800 ${subSize}px system-ui, -apple-system, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeText(`${Math.round(cell.mass)}`, 0, nameY + fontSize * 0.85);
        ctx.fillStyle = '#fef08a';
        ctx.fillText(`${Math.round(cell.mass)}`, 0, nameY + fontSize * 0.85);
      }
    }

    ctx.restore();
  }

  private drawSkinAccessory(
    ctx: CanvasRenderingContext2D,
    skinId: SkinId,
    r: number,
    isLeader: boolean,
  ): void {
    if (skinId === 'rei' || isLeader) {
      // Royal Crown
      ctx.save();
      ctx.translate(0, -r * 0.92);
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, r * 0.12);
      ctx.lineTo(-r * 0.42, -r * 0.25);
      ctx.lineTo(-r * 0.14, -r * 0.04);
      ctx.lineTo(0, -r * 0.34);
      ctx.lineTo(r * 0.14, -r * 0.04);
      ctx.lineTo(r * 0.42, -r * 0.25);
      ctx.lineTo(r * 0.34, r * 0.12);
      ctx.closePath();
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.strokeStyle = '#422006';
      ctx.stroke();
      ctx.restore();
    }

    if (skinId === 'pix') {
      // Cool dark sunglasses
      ctx.fillStyle = '#09090b';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = Math.max(1.5, r * 0.03);
      ctx.fillRect(-r * 0.42, -r * 0.24, r * 0.36, r * 0.18);
      ctx.fillRect(r * 0.06, -r * 0.24, r * 0.36, r * 0.18);
      ctx.fillRect(-r * 0.06, -r * 0.18, r * 0.12, r * 0.05);
      ctx.strokeRect(-r * 0.42, -r * 0.24, r * 0.36, r * 0.18);
      ctx.strokeRect(r * 0.06, -r * 0.24, r * 0.36, r * 0.18);
    } else if (skinId === 'tio-zap') {
      // Blue cap
      ctx.beginPath();
      ctx.arc(0, -r * 0.65, r * 0.48, Math.PI, 0);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.05);
      ctx.strokeStyle = '#082f49';
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-r * 0.46, -r * 0.68, r * 0.98, r * 0.13);
    } else if (skinId === 'cyber') {
      // Neon visor
      ctx.fillStyle = 'rgba(56, 189, 248, 0.58)';
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = Math.max(1.5, r * 0.03);
      ctx.beginPath();
      ctx.roundRect(-r * 0.44, -r * 0.25, r * 0.88, r * 0.22, r * 0.08);
      ctx.fill();
      ctx.stroke();
    } else if (skinId === 'ninja') {
      // Red headband
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-r * 0.72, -r * 0.56, r * 1.44, r * 0.18);
    } else if (skinId === 'ouro') {
      // Flame mohawk
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#9a3412';
      ctx.lineWidth = Math.max(2, r * 0.04);
      ctx.beginPath();
      ctx.moveTo(-r * 0.18, -r * 0.88);
      ctx.lineTo(-r * 0.08, -r * 1.24);
      ctx.lineTo(r * 0.02, -r * 0.98);
      ctx.lineTo(r * 0.14, -r * 1.28);
      ctx.lineTo(r * 0.22, -r * 0.86);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    state: RenderInput,
    isMobile: boolean,
  ): void {
    const size = isMobile ? 92 : 128;
    const pad = 12;
    const x0 = w - size - pad;
    const y0 = isMobile ? h - size - 96 : h - size - pad;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 20, 14, 0.78)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x0, y0, size, size, 12);
    ctx.fill();
    ctx.stroke();

    const scale = size / state.arenaSize;

    // Cacti dots
    ctx.fillStyle = 'rgba(132, 204, 22, 0.5)';
    for (const ca of state.cacti) {
      ctx.beginPath();
      ctx.arc(x0 + ca.x * scale, y0 + ca.y * scale, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Other cells
    for (const c of state.cells) {
      const mx = x0 + c.x * scale;
      const my = y0 + c.y * scale;
      if (c.ownerId === state.localOwnerId) {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(3.5, massToRadius(c.mass) * scale * 1.3), 0, Math.PI * 2);
        ctx.fill();
      } else if (c.ownerId === state.leaderOwnerId) {
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (state.mode === 'teams') {
        ctx.fillStyle = c.team === 1 ? 'rgba(250, 204, 21, 0.55)' : 'rgba(56, 189, 248, 0.55)';
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
