import {
  CAFETERIA_TABLE,
  castVisibilityPolygon,
  CORRIDORS,
  EMERGENCY_BUTTON,
  getRoomAt,
  hasLineOfSight,
  LIGHTS_PANEL,
  REACTOR_PANEL,
  ROOMS,
  SECURITY_CAMERAS,
  SECURITY_MONITOR,
  TASK_SPOTS,
  VENTS,
  WALL_RECTS,
  WORLD_H,
  WORLD_W,
} from './map';
import type {
  ActiveSabotage,
  DeadBody,
  GamePhase,
  HatId,
  MonkeyColorSpec,
  Particle,
  PlayerState,
} from './types';

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkle: number;
}

export interface RenderContextState {
  phase: GamePhase;
  players: PlayerState[];
  localId: string;
  bodies: DeadBody[];
  sabotage: ActiveSabotage | null;
  particles: Particle[];
  camIndex: number; // -1 if normal player view, 0..3 if watching CCTV
  showMinimap: boolean;
  shakeTimer: number;
  timeSec: number;
  anyoneWatchingCams: boolean;
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private camX = 1280;
  private camY = 320;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 160; i++) {
      this.stars.push({
        x: Math.random() * 2800 - 200,
        y: Math.random() * 1900 - 200,
        size: 1 + Math.random() * 2.2,
        alpha: 0.35 + Math.random() * 0.65,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(state: RenderContextState): void {
    this.resize();
    const ctx = this.ctx;
    const vw = this.canvas.clientWidth || window.innerWidth;
    const vh = this.canvas.clientHeight || window.innerHeight;

    const local = state.players.find((p) => p.id === state.localId) || state.players[0];
    if (!local) {
      ctx.fillStyle = '#050814';
      ctx.fillRect(0, 0, vw, vh);
      return;
    }

    // Camera target
    let targetX = local.x;
    let targetY = local.y;
    if (state.camIndex >= 0 && SECURITY_CAMERAS[state.camIndex]) {
      targetX = SECURITY_CAMERAS[state.camIndex].x;
      targetY = SECURITY_CAMERAS[state.camIndex].y;
    }

    this.camX += (targetX - this.camX) * 0.22;
    this.camY += (targetY - this.camY) * 0.22;

    let shakeX = 0;
    let shakeY = 0;
    if (state.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * 14 * state.shakeTimer;
      shakeY = (Math.random() - 0.5) * 14 * state.shakeTimer;
    }

    // 1. Space background
    ctx.fillStyle = '#040712';
    ctx.fillRect(0, 0, vw, vh);

    for (const s of this.stars) {
      const sx = ((s.x - this.camX * 0.15) % (vw + 80) + vw + 80) % (vw + 80) - 40;
      const sy = ((s.y - this.camY * 0.15) % (vh + 80) + vh + 80) % (vh + 80) - 40;
      const a = s.alpha * (0.65 + 0.35 * Math.sin(state.timeSec * 2 + s.twinkle));
      ctx.fillStyle = `rgba(248, 250, 252, ${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(vw / 2 - this.camX + shakeX, vh / 2 - this.camY + shakeY);

    // 2. Floors (Corridors & Rooms)
    for (const cor of CORRIDORS) {
      ctx.fillStyle = '#1e2433';
      ctx.fillRect(cor.x, cor.y, cor.w, cor.h);
      this.drawFloorTiles(ctx, cor.x, cor.y, cor.w, cor.h, 'rgba(255,255,255,0.03)');
    }

    for (const room of ROOMS) {
      const { x, y, w, h } = room.rect;
      ctx.fillStyle = room.floorColor;
      ctx.fillRect(x, y, w, h);
      this.drawFloorTiles(ctx, x, y, w, h, 'rgba(255,255,255,0.045)');

      // Room accent border & subtle label
      ctx.strokeStyle = room.accentColor;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(room.name.toUpperCase(), x + w / 2, y + 42);
      ctx.globalAlpha = 1;
    }

    // 3. Room props & interactive stations
    this.drawShipProps(ctx, state, local);

    // 4. Vents
    for (const v of VENTS) {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = local.role === 'impostor' ? '#f87171' : '#64748b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-22, -14, 44, 28, 6);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      for (let ly = -7; ly <= 7; ly += 7) {
        ctx.beginPath();
        ctx.moveTo(-15, ly);
        ctx.lineTo(15, ly);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Security Cameras on walls
    for (const cam of SECURITY_CAMERAS) {
      ctx.save();
      ctx.translate(cam.x, cam.y - 38);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-10, -7, 20, 14, 4);
      ctx.fill();
      ctx.stroke();
      const blink = state.anyoneWatchingCams && Math.sin(state.timeSec * 8) > 0;
      ctx.fillStyle = blink ? '#ef4444' : '#334155';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Task & Sabotage Markers
    this.drawTaskMarkers(ctx, state, local);

    // 7. Determine observer sight
    const observerX = state.camIndex >= 0 ? targetX : local.x;
    const observerY = state.camIndex >= 0 ? targetY : local.y;
    const visionRadius = this.getVisionRadius(local, state.sabotage, state.camIndex >= 0);

    // 8. Dead Bodies (only visible if in LOS or ghost)
    for (const body of state.bodies) {
      if (
        !local.alive ||
        state.phase === 'lobby' ||
        hasLineOfSight(observerX, observerY, body.x, body.y, visionRadius)
      ) {
        this.drawDeadBody(ctx, body);
      }
    }

    // 9. Walls (drawn BEFORE fog of war, or after? Before fog of war so shadows mask far walls cleanly, or outline walls!)
    for (const w of WALL_RECTS) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = '#334155';
      ctx.fillRect(w.x, w.y, w.w, 6);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // 10. Players (sorted by Y)
    const sorted = [...state.players].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (p.inVent && p.id !== local.id && local.role !== 'impostor' && local.alive) continue;
      if (!p.alive && local.alive && state.phase === 'playing') continue; // alive players don't see ghosts

      const isSelf = p.id === local.id;
      const visible =
        isSelf ||
        !local.alive ||
        state.phase === 'lobby' ||
        hasLineOfSight(observerX, observerY, p.x, p.y, visionRadius);

      if (!visible) continue;
      this.drawMonkey(ctx, p, local, state.timeSec, Boolean(state.sabotage));
    }

    // 11. Particles
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.globalAlpha = a;
      if (pt.text) {
        ctx.font = '900 14px system-ui, sans-serif';
        ctx.fillStyle = pt.color;
        ctx.textAlign = 'center';
        ctx.fillText(pt.text, pt.x, pt.y);
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 12. Fog of War / Raycast Shadow Overlay (during playing)
    if (state.phase === 'playing' && local.alive) {
      const poly = castVisibilityPolygon(observerX, observerY, visionRadius, 128);
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.camX - vw / 2 - 60, this.camY - vh / 2 - 60, vw + 120, vh + 120);
      if (poly.length > 2) {
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
      }
      ctx.fillStyle =
        state.sabotage?.kind === 'lights' && local.role === 'crew'
          ? 'rgba(2, 4, 10, 0.94)'
          : 'rgba(4, 7, 18, 0.78)';
      ctx.fill('evenodd');

      // Soft circular vignette around vision edge
      const grad = ctx.createRadialGradient(
        observerX,
        observerY,
        visionRadius * 0.55,
        observerX,
        observerY,
        visionRadius,
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(2,4,10,0.85)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(observerX, observerY, visionRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // 13. Sabotage red pulse & CCTV CRT overlay
    if (state.phase === 'playing' && state.sabotage?.kind === 'reactor') {
      const pulse = 0.14 + 0.14 * Math.sin(state.timeSec * 8);
      ctx.fillStyle = `rgba(239, 68, 68, ${pulse.toFixed(2)})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    if (state.camIndex >= 0) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      for (let y = 0; y < vh; y += 6) {
        ctx.fillRect(0, y, vw, 2);
      }
      const cam = SECURITY_CAMERAS[state.camIndex];
      ctx.fillStyle = '#ef4444';
      ctx.font = '900 16px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`● REC  ${cam?.label || 'CAM'}`, 24, vh - 32);
    }

    // 14. Minimap
    if (state.showMinimap) {
      this.drawMinimap(ctx, vw, vh, state, local);
    }
  }

  private getVisionRadius(
    local: PlayerState,
    sabotage: ActiveSabotage | null,
    onCam: boolean,
  ): number {
    if (onCam) return 380;
    if (!local.alive) return 680;
    if (local.role === 'impostor') return 470;
    if (sabotage?.kind === 'lights') return 165;
    return 410;
  }

  private drawFloorTiles(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    stroke: string,
  ): void {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = x; gx <= x + w; gx += 40) {
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
    }
    for (let gy = y; gy <= y + h; gy += 40) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
  }

  private drawShipProps(
    ctx: CanvasRenderingContext2D,
    state: RenderContextState,
    local: PlayerState,
  ): void {
    // Cafeteria Table & Emergency Button
    ctx.save();
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(CAFETERIA_TABLE.x, CAFETERIA_TABLE.y, CAFETERIA_TABLE.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Emergency box
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(EMERGENCY_BUTTON.x - 18, EMERGENCY_BUTTON.y - 18, 36, 36, 6);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(EMERGENCY_BUTTON.x, EMERGENCY_BUTTON.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fecaca';
    ctx.beginPath();
    ctx.arc(EMERGENCY_BUTTON.x - 3, EMERGENCY_BUTTON.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Medbay Scanner Pad
    ctx.save();
    ctx.translate(745, 325);
    ctx.fillStyle = '#064e3b';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCANNER', 0, 44);
    ctx.restore();

    // Security Monitor Console
    ctx.save();
    ctx.translate(SECURITY_MONITOR.x, SECURITY_MONITOR.y);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-26, -18, 52, 36, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-18, -10, 15, 18);
    ctx.fillRect(3, -10, 15, 18);
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CÂMERAS', 0, 32);
    ctx.restore();

    // Reactor Potassium Core
    ctx.save();
    ctx.translate(290, 400);
    const rPulse = 1 + 0.08 * Math.sin(state.timeSec * 4);
    ctx.fillStyle = state.sabotage?.kind === 'reactor' ? '#ef4444' : '#0ea5e9';
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, 48 * rPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = state.sabotage?.kind === 'reactor' ? '#f87171' : '#38bdf8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🍌', 0, 7);
    ctx.restore();

    // Sabotage Fix Panels
    this.drawPanelBeacon(
      ctx,
      LIGHTS_PANEL.x,
      LIGHTS_PANEL.y,
      '⚡ LUZ',
      state.sabotage?.kind === 'lights',
      state.timeSec,
    );
    this.drawPanelBeacon(
      ctx,
      REACTOR_PANEL.x,
      REACTOR_PANEL.y,
      '☢️ REATOR',
      state.sabotage?.kind === 'reactor',
      state.timeSec,
    );

    // Banana crates in Armazem
    ctx.fillStyle = '#a16207';
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 3;
    ctx.fillRect(1110, 920, 46, 46);
    ctx.strokeRect(1110, 920, 46, 46);
    ctx.fillRect(1390, 920, 46, 46);
    ctx.strokeRect(1390, 920, 46, 46);

    // Engine thrusters in Motores
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(165, 960, 18, 0, Math.PI * 2);
    ctx.arc(165, 1170, 18, 0, Math.PI * 2);
    ctx.fill();

    // Hint text in lobby
    if (state.phase === 'lobby') {
      ctx.fillStyle = '#fde047';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Sala da Nave Banana-1 · ${local.isHost ? 'Configure a partida à direita!' : 'Aguardando Host iniciar...'}`,
        1280,
        165,
      );
    }
  }

  private drawPanelBeacon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    active: boolean,
    timeSec: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    if (active) {
      const r = 24 + 8 * Math.sin(timeSec * 8);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = active ? '#7f1d1d' : '#1e293b';
    ctx.strokeStyle = active ? '#f87171' : '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-20, -14, 40, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 26);
    ctx.restore();
  }

  private drawTaskMarkers(
    ctx: CanvasRenderingContext2D,
    state: RenderContextState,
    local: PlayerState,
  ): void {
    for (const t of TASK_SPOTS) {
      const assigned = local.tasksAssigned.includes(t.id);
      const done = local.tasksDone.includes(t.id);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = done ? '#166534' : assigned && local.role === 'crew' ? '#713f12' : '#1e293b';
      ctx.strokeStyle = done
        ? '#4ade80'
        : assigned && local.role === 'crew'
          ? '#facc15'
          : '#475569';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-16, -16, 32, 32, 8);
      ctx.fill();
      ctx.stroke();

      if (assigned && !done && local.role === 'crew' && state.phase === 'playing') {
        const bob = Math.sin(state.timeSec * 6) * 4;
        ctx.fillStyle = '#facc15';
        ctx.font = '900 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, -24 + bob);
      }
      ctx.restore();
    }
  }

  private drawDeadBody(ctx: CanvasRenderingContext2D, body: DeadBody): void {
    ctx.save();
    ctx.translate(body.x, body.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.beginPath();
    ctx.ellipse(0, 13, 24, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fallen spacesuit lower half with gradient shading
    const suitGrad = ctx.createLinearGradient(-18, -6, 18, 16);
    suitGrad.addColorStop(0, body.color.body);
    suitGrad.addColorStop(1, body.color.dark);
    ctx.fillStyle = suitGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 6, 20, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belt ring
    ctx.strokeStyle = 'rgba(15,23,42,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 5, 18, 10, 0, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Banana peel flaps
    const peelGrad = ctx.createLinearGradient(0, -4, 0, 14);
    peelGrad.addColorStop(0, '#fef08a');
    peelGrad.addColorStop(0.6, '#facc15');
    peelGrad.addColorStop(1, '#ca8a04');
    ctx.fillStyle = peelGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-19, 4);
    ctx.quadraticCurveTo(-9, -6, 0, 2);
    ctx.quadraticCurveTo(9, -6, 19, 4);
    ctx.quadraticCurveTo(9, 13, 0, 8);
    ctx.quadraticCurveTo(-9, 13, -19, 4);
    ctx.fill();
    ctx.stroke();

    // Cartoon bone with highlight
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.roundRect(-4.5, -15, 9, 17, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-4.5, -16, 4.2, 0, Math.PI * 2);
    ctx.arc(4.5, -16, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-3.5, -13, 2, 11);
    ctx.restore();
  }

  private getFurPalette(colorId: string): {
    fur: string;
    furDark: string;
    earInner: string;
    mask: string;
    maskShade: string;
  } {
    switch (colorId) {
      case 'brown':
      case 'orange':
        return { fur: '#9a3412', furDark: '#5c1d0c', earInner: '#fda4af', mask: '#fef3c7', maskShade: '#fde68a' };
      case 'purple':
      case 'pink':
        return { fur: '#854d0e', furDark: '#422006', earInner: '#f9a8d4', mask: '#fef3c7', maskShade: '#fed7aa' };
      case 'cyan':
      case 'blue':
        return { fur: '#b45309', furDark: '#78350f', earInner: '#fda4af', mask: '#fef3c7', maskShade: '#fde68a' };
      case 'yellow':
      case 'lime':
        return { fur: '#a16207', furDark: '#713f12', earInner: '#fbcfe8', mask: '#fffbeb', maskShade: '#fde68a' };
      default:
        return { fur: '#b45309', furDark: '#713f12', earInner: '#fda4af', mask: '#fef3c7', maskShade: '#fde68a' };
    }
  }

  private drawMonkey(
    ctx: CanvasRenderingContext2D,
    p: PlayerState,
    viewer: PlayerState,
    timeSec: number,
    sabotageActive = false,
  ): void {
    const speed = Math.hypot(p.vx, p.vy);
    const isMoving = speed > 10;
    const seed = hashMonkeySeed(p.id);
    const breath = Math.sin(timeSec * 3.4 + seed) * 0.032;
    const bounce = isMoving ? Math.abs(Math.sin(p.walkPhase)) * 5.2 : 0;
    const squashX = isMoving
      ? 1 + Math.cos(p.walkPhase * 2) * 0.055
      : 1 - breath * 0.8;
    const squashY = isMoving
      ? 1 - Math.cos(p.walkPhase * 2) * 0.055
      : 1 + breath;
    const floatY = !p.alive ? Math.sin(timeSec * 3.2 + seed) * 5.5 : 0;
    const fur = this.getFurPalette(p.color.id);

    ctx.save();
    ctx.translate(p.x, p.y - bounce + floatY);
    if (!p.alive) ctx.globalAlpha = 0.54;
    if (p.inVent) ctx.globalAlpha = 0.42;

    // Scanner laser ring
    if (p.scanning) {
      const scanY = Math.sin(timeSec * 6) * 20;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, scanY, 26, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground shadow
    if (p.alive) {
      const shadowScale = 1 - bounce * 0.025;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(0, 21 + bounce, 17 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.scale(p.facing * squashX, squashY);

    // 1. Curved Monkey Tail with secondary spring motion
    const wag = Math.sin(timeSec * (isMoving ? 10 : 4.2) + seed) * 5 + (isMoving ? -3 : 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-13, 10);
    ctx.bezierCurveTo(-26, 8 + wag * 0.4, -30, -8 + wag, -21, -13 + wag * 0.7);
    ctx.stroke();
    ctx.strokeStyle = fur.fur;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    // Tail tip highlight
    ctx.fillStyle = fur.maskShade;
    ctx.beginPath();
    ctx.arc(-21, -13 + wag * 0.7, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // 2. Back Arm (subtle swing behind backpack/body)
    const armSwing = isMoving ? Math.sin(p.walkPhase) * 6 : Math.sin(timeSec * 2.5 + seed) * 1.2;
    ctx.fillStyle = p.color.dark;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(10 + armSwing * 0.5, 4, 6.5, 4.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Oxygen Backpack with gradient & metallic detail
    const packGrad = ctx.createLinearGradient(-23, -10, -11, 14);
    packGrad.addColorStop(0, p.color.body);
    packGrad.addColorStop(1, p.color.dark);
    ctx.fillStyle = packGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.roundRect(-23, -10, 11, 24, 5);
    ctx.fill();
    ctx.stroke();
    // Tank top cap
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-20, -13, 5, 3);
    ctx.strokeRect(-20, -13, 5, 3);

    // 4. Back Ear (slightly behind head)
    const earBob = isMoving ? Math.sin(p.walkPhase * 2) * 1.1 : 0;
    this.drawMonkeyEar(ctx, 14, -14 - earBob, 7.2, fur.fur, fur.earInner);

    // 5. Legs / Ghost Tail
    if (p.alive) {
      const legOff = isMoving ? Math.sin(p.walkPhase) * 4.5 : 0;
      const bootGrad = ctx.createLinearGradient(0, 10, 0, 22);
      bootGrad.addColorStop(0, p.color.body);
      bootGrad.addColorStop(1, p.color.dark);
      ctx.fillStyle = bootGrad;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.8;
      // Back leg
      ctx.beginPath();
      ctx.roundRect(2, 10 - legOff, 9.5, 11, 4.5);
      ctx.fill();
      ctx.stroke();
      // Front leg
      ctx.beginPath();
      ctx.roundRect(-11.5, 10 + legOff, 9.5, 11, 4.5);
      ctx.fill();
      ctx.stroke();
    } else {
      // Ghostly wispy tail bottom
      const wisp = Math.sin(timeSec * 6 + seed) * 3;
      ctx.fillStyle = p.color.dark;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-14, 10);
      ctx.quadraticCurveTo(-8, 22 + wisp, -2, 15);
      ctx.quadraticCurveTo(4, 23 - wisp, 10, 14);
      ctx.quadraticCurveTo(15, 18, 15, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 6. Spacesuit Torso & Big Rounded Monkey Head Silhouette
    const bodyGrad = ctx.createRadialGradient(-4, -14, 4, 0, -2, 26);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.18, p.color.body);
    bodyGrad.addColorStop(0.8, p.color.body);
    bodyGrad.addColorStop(1, p.color.dark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Plump lower suit + slightly wider rounded helmet-head
    ctx.moveTo(-14, 2);
    ctx.bezierCurveTo(-16, -10, -17, -24, 0, -24);
    ctx.bezierCurveTo(17, -24, 16, -10, 15, 2);
    ctx.bezierCurveTo(15, 12, 11, 15, 0, 15);
    ctx.bezierCurveTo(-11, 15, -14, 12, -14, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Suit chest seam / belt accent
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-13, 6);
    ctx.quadraticCurveTo(0, 9, 14, 6);
    ctx.stroke();

    // 7. Front Ear (with rosy pink inner ear)
    this.drawMonkeyEar(ctx, -15, -14 - earBob, 7.6, fur.fur, fur.earInner);

    // 8. Panoramic Space Helmet Visor + Monkey Heart/Peanut Face Inside
    const vx = -4;
    const vy = -17.5;
    const vw = 23;
    const vh = 17;
    const visorGrad = ctx.createLinearGradient(vx, vy, vx + vw, vy + vh);
    visorGrad.addColorStop(0, '#7dd3fc');
    visorGrad.addColorStop(0.55, '#0284c7');
    visorGrad.addColorStop(1, '#0c4a6e');

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(vx, vy, vw, vh, 8);
    ctx.fillStyle = visorGrad;
    ctx.fill();
    ctx.clip();

    // Heart/Peanut-shaped cream face mask inside the visor
    const maskGrad = ctx.createLinearGradient(0, vy + 2, 0, vy + vh);
    maskGrad.addColorStop(0, fur.mask);
    maskGrad.addColorStop(1, fur.maskShade);
    ctx.fillStyle = maskGrad;
    ctx.strokeStyle = fur.furDark;
    ctx.lineWidth = 1.2;
    this.tracePeanutFacePath(ctx, 8.5, -8.5, 9.5, 7.5);
    ctx.fill();
    ctx.stroke();

    // Blinking & Eye tracking
    const blinkCycle = (timeSec * 0.9 + seed * 1.37) % 4.1;
    const isBlinking = p.alive && blinkCycle > 3.94 && !sabotageActive;
    const lookX = isMoving ? 1.1 : Math.sin(timeSec * 1.8 + seed) * 0.6;
    const lookY = isMoving ? Math.sign(p.vy) * 0.7 : 0;
    const isPanicked = sabotageActive && p.alive && p.role === 'crew';
    const showImpSmirk = viewer.role === 'impostor' && p.role === 'impostor' && p.alive;

    if (!p.alive) {
      // Cute ghost eyes (wide glowing ovals)
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(4.8, -9.5, 2.5, 0, Math.PI * 2);
      ctx.arc(12.8, -9.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (isBlinking || p.scanning) {
      // Happy curved closed eyes (blinking or scanning)
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(5.2, -8.8, 2.3, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(13.0, -8.8, 2.3, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      const eyeR = isPanicked ? 3.0 : 2.7;
      for (const ex of [5.2, 13.0]) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(ex, -9.5, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pupil
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ex + lookX * 0.9, -9.5 + lookY * 0.9, isPanicked ? 1.15 : 1.45, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex + lookX * 0.5 - 0.6, -10.3 + lookY * 0.5, 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Eyebrows & Mouth
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    if (showImpSmirk) {
      // Mischievous angled eyebrows + confident grin
      ctx.beginPath();
      ctx.moveTo(2.8, -13.2);
      ctx.lineTo(7.4, -12.0);
      ctx.moveTo(15.2, -13.2);
      ctx.lineTo(10.8, -12.0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(9.2, -5.2, 2.8, 0.1, Math.PI * 0.85);
      ctx.stroke();
    } else if (isPanicked) {
      // Worried eyebrows + open O mouth
      ctx.beginPath();
      ctx.moveTo(2.8, -12.0);
      ctx.lineTo(7.0, -13.4);
      ctx.moveTo(15.2, -12.0);
      ctx.lineTo(11.0, -13.4);
      ctx.stroke();
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(9.1, -4.4, 2.1, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Cute monkey nostrils + cheerful smile
      ctx.fillStyle = fur.furDark;
      ctx.beginPath();
      ctx.arc(8.1, -6.5, 0.7, 0, Math.PI * 2);
      ctx.arc(10.3, -6.5, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(9.2, -5.2, 2.6, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }

    // Visor glass reflection streak
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(5, -14.5, 6.5, 2.1, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Visor outer rim
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.roundRect(vx, vy, vw, vh, 8);
    ctx.stroke();

    // 9. Front Arm & Glove Hand
    ctx.fillStyle = p.color.body;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-6 - armSwing * 0.65, 5, 6.5, 4.4, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cute mitten thumb detail
    ctx.fillStyle = p.color.dark;
    ctx.beginPath();
    ctx.arc(-2 - armSwing * 0.65, 3.6, 2.1, 0, Math.PI * 2);
    ctx.fill();

    // 10. Hat with slight secondary bounce
    ctx.save();
    ctx.translate(0, -3 + (isMoving ? Math.sin(p.walkPhase * 2 - 0.5) * 1.2 : 0));
    this.drawHat(ctx, p.hat);
    ctx.restore();

    // Ghost halo
    if (!p.alive) {
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, -31, 10, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // Nameplate
    const showRed = viewer.role === 'impostor' && p.role === 'impostor';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#020617';
    ctx.strokeText(p.name, 0, -34);
    ctx.fillStyle = showRed ? '#f87171' : p.alive ? '#f8fafc' : '#94a3b8';
    ctx.fillText(p.name, 0, -34);

    if (p.scanning) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillText('ESCANER OK!', 0, -48);
    }

    ctx.restore();
  }

  private drawMonkeyEar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    furColor: string,
    innerColor: string,
  ): void {
    ctx.fillStyle = furColor;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(x, y + 0.4, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  private tracePeanutFacePath(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ): void {
    // Heart-top eye lobes + rounded lower cheek muzzle
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.42);
    ctx.bezierCurveTo(cx + rx * 0.45, cy - ry * 1.15, cx + rx * 1.08, cy - ry * 0.55, cx + rx * 0.85, cy + ry * 0.08);
    ctx.bezierCurveTo(cx + rx * 1.05, cy + ry * 0.65, cx + rx * 0.5, cy + ry * 1.05, cx, cy + ry * 0.95);
    ctx.bezierCurveTo(cx - rx * 0.5, cy + ry * 1.05, cx - rx * 1.05, cy + ry * 0.65, cx - rx * 0.85, cy + ry * 0.08);
    ctx.bezierCurveTo(cx - rx * 1.08, cy - ry * 0.55, cx - rx * 0.45, cy - ry * 1.15, cx, cy - ry * 0.42);
    ctx.closePath();
  }

  private drawHat(ctx: CanvasRenderingContext2D, hat: HatId): void {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    switch (hat) {
      case 'banana': {
        const g = ctx.createLinearGradient(-10, -34, 12, -20);
        g.addColorStop(0, '#fef08a');
        g.addColorStop(0.65, '#facc15');
        g.addColorStop(1, '#ca8a04');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-11, -20);
        ctx.quadraticCurveTo(-2, -39, 13, -20);
        ctx.quadraticCurveTo(0, -24, -11, -20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(0, -31, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'crown': {
        const g = ctx.createLinearGradient(0, -36, 0, -19);
        g.addColorStop(0, '#fef08a');
        g.addColorStop(1, '#d97706');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-11, -19);
        ctx.lineTo(-13, -32);
        ctx.lineTo(-4, -25);
        ctx.lineTo(0, -36);
        ctx.lineTo(4, -25);
        ctx.lineTo(13, -32);
        ctx.lineTo(11, -19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -24, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'cap': {
        const g = ctx.createLinearGradient(-12, -32, 12, -18);
        g.addColorStop(0, '#f87171');
        g.addColorStop(1, '#b91c1c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, -19, 13, Math.PI, 0);
        ctx.lineTo(19, -19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(-2, -25, 2.8, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'leaf': {
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-1, -20);
        ctx.quadraticCurveTo(1, -26, 4, -28);
        ctx.stroke();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.2;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.ellipse(5, -27, 11, 5, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'visor_band': {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(-16, -21, 32, 6, 3);
        ctx.fill();
        ctx.stroke();
        // Flowing ninja tails on the back
        ctx.beginPath();
        ctx.moveTo(-15, -18);
        ctx.lineTo(-24, -22);
        ctx.lineTo(-21, -14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'none':
        break;
    }
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    vw: number,
    vh: number,
    state: RenderContextState,
    local: PlayerState,
  ): void {
    const mw = Math.min(540, vw - 40);
    const mh = mw * (WORLD_H / WORLD_W);
    const ox = (vw - mw) / 2;
    const oy = (vh - mh) / 2;
    const scale = mw / WORLD_W;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(ox - 14, oy - 36, mw + 28, mh + 52, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const curRoom = getRoomAt(local.x, local.y);
    ctx.fillText(`MAPA DA NAVE BANANA-1 · Você está em: ${curRoom.name}`, vw / 2, oy - 12);

    ctx.fillStyle = '#1e293b';
    for (const cor of CORRIDORS) {
      ctx.fillRect(ox + cor.x * scale, oy + cor.y * scale, cor.w * scale, cor.h * scale);
    }

    for (const r of ROOMS) {
      ctx.fillStyle = r.floorColor;
      ctx.strokeStyle = r.accentColor;
      ctx.lineWidth = 1.5;
      ctx.fillRect(ox + r.rect.x * scale, oy + r.rect.y * scale, r.rect.w * scale, r.rect.h * scale);
      ctx.strokeRect(
        ox + r.rect.x * scale,
        oy + r.rect.y * scale,
        r.rect.w * scale,
        r.rect.h * scale,
      );
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillText(
        r.name,
        ox + (r.rect.x + r.rect.w / 2) * scale,
        oy + (r.rect.y + 16) * scale + 6,
      );
    }

    // Local player remaining tasks
    if (local.role === 'crew') {
      for (const tid of local.tasksAssigned) {
        if (local.tasksDone.includes(tid)) continue;
        const spot = TASK_SPOTS.find((t) => t.id === tid);
        if (!spot) continue;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(ox + spot.x * scale, oy + spot.y * scale, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sabotage marker
    if (state.sabotage) {
      const target = state.sabotage.kind === 'lights' ? LIGHTS_PANEL : REACTOR_PANEL;
      if (Math.sin(state.timeSec * 10) > -0.3) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(ox + target.x * scale, oy + target.y * scale, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Local player dot
    ctx.fillStyle = local.color.body;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox + local.x * scale, oy + local.y * scale, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

function hashMonkeySeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 100) * 0.17;
}

export function drawMonkeyAvatar(
  color: MonkeyColorSpec,
  hat: HatId,
  size = 34,
): string {
  const hatSvg =
    hat === 'banana'
      ? `<path d="M13 13 C16 2, 28 2, 31 13 Q22 10 13 13 Z" fill="#facc15" stroke="#0f172a" stroke-width="2"/>`
      : hat === 'crown'
        ? `<polygon points="13,13 11,4 18,9 22,2 26,9 33,4 31,13" fill="#fbbf24" stroke="#0f172a" stroke-width="2"/>`
        : hat === 'cap'
          ? `<path d="M12 14 A10 10 0 0 1 32 14 L38 14 Z" fill="#ef4444" stroke="#0f172a" stroke-width="2"/>`
          : hat === 'leaf'
            ? `<ellipse cx="26" cy="9" rx="7" ry="3.5" transform="rotate(-20 26 9)" fill="#4ade80" stroke="#0f172a" stroke-width="1.8"/>`
            : hat === 'visor_band'
              ? `<rect x="10" y="11" width="24" height="4.5" rx="2" fill="#dc2626" stroke="#0f172a" stroke-width="1.6"/>`
              : '';

  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;position:relative;flex-shrink:0;">
    <svg viewBox="0 0 44 44" width="${size}" height="${size}" style="overflow:visible;">
      <circle cx="9" cy="20" r="6" fill="#b45309" stroke="#0f172a" stroke-width="2.4"/>
      <circle cx="9" cy="20" r="3.2" fill="#fda4af"/>
      <circle cx="35" cy="20" r="6" fill="#b45309" stroke="#0f172a" stroke-width="2.4"/>
      <circle cx="35" cy="20" r="3.2" fill="#fda4af"/>
      <rect x="10" y="10" width="24" height="28" rx="12" fill="${color.body}" stroke="#0f172a" stroke-width="2.6"/>
      <rect x="13" y="14" width="22" height="14" rx="7" fill="#0284c7" stroke="#0f172a" stroke-width="2.2"/>
      <path d="M24 17 C27 14, 32 16, 31 20 C32 24, 27 27, 24 26 C21 27, 16 24, 17 20 C16 16, 21 14, 24 17 Z" fill="#fde68a"/>
      <circle cx="21" cy="20" r="2.2" fill="#fff" stroke="#0f172a" stroke-width="0.9"/>
      <circle cx="21.5" cy="20" r="1.1" fill="#0f172a"/>
      <circle cx="20.8" cy="19.4" r="0.5" fill="#fff"/>
      <circle cx="27" cy="20" r="2.2" fill="#fff" stroke="#0f172a" stroke-width="0.9"/>
      <circle cx="27.5" cy="20" r="1.1" fill="#0f172a"/>
      <circle cx="26.8" cy="19.4" r="0.5" fill="#fff"/>
      <path d="M21.5 23.5 Q24 25.5 26.5 23.5" fill="none" stroke="#0f172a" stroke-width="1.3" stroke-linecap="round"/>
      <ellipse cx="19" cy="16.5" rx="4" ry="1.3" fill="#fff" opacity="0.5"/>
      ${hatSvg}
    </svg>
  </span>`;
}
