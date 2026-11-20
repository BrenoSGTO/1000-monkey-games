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
      this.drawMonkey(ctx, p, local, state.timeSec);
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
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Peeled suit bottom
    ctx.fillStyle = body.color.body;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 5, 19, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Banana peel flaps
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-18, 4);
    ctx.quadraticCurveTo(-8, -4, 0, 2);
    ctx.quadraticCurveTo(8, -4, 18, 4);
    ctx.quadraticCurveTo(8, 12, 0, 8);
    ctx.quadraticCurveTo(-8, 12, -18, 4);
    ctx.fill();
    ctx.stroke();

    // Cartoon bone
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-4, -14, 8, 16);
    ctx.strokeRect(-4, -14, 8, 16);
    ctx.beginPath();
    ctx.arc(-4, -15, 4, 0, Math.PI * 2);
    ctx.arc(4, -15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawMonkey(
    ctx: CanvasRenderingContext2D,
    p: PlayerState,
    viewer: PlayerState,
    timeSec: number,
  ): void {
    const isMoving = Math.hypot(p.vx, p.vy) > 10;
    const bounce = isMoving ? Math.abs(Math.sin(p.walkPhase)) * 5 : 0;
    const floatY = !p.alive ? Math.sin(timeSec * 3.5 + p.x * 0.02) * 5 : 0;

    ctx.save();
    ctx.translate(p.x, p.y - bounce + floatY);
    if (!p.alive) ctx.globalAlpha = 0.48;
    if (p.inVent) ctx.globalAlpha = 0.4;

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

    // Shadow
    if (p.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 20 + bounce, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.scale(p.facing, 1);

    // Tail
    const wag = Math.sin(timeSec * 6 + p.walkPhase) * 4;
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, 8);
    ctx.quadraticCurveTo(-26, 2 + wag, -22, -10 + wag);
    ctx.stroke();

    // Backpack
    ctx.fillStyle = p.color.dark;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-21, -8, 10, 22, 5);
    ctx.fill();
    ctx.stroke();

    // Monkey Ears
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(-13, -14, 6.5, 0, Math.PI * 2);
    ctx.arc(13, -14, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(-13, -14, 3, 0, Math.PI * 2);
    ctx.arc(13, -14, 3, 0, Math.PI * 2);
    ctx.fill();

    // Legs (only if alive)
    if (p.alive) {
      const legOff = isMoving ? Math.sin(p.walkPhase) * 4 : 0;
      ctx.fillStyle = p.color.dark;
      ctx.beginPath();
      ctx.roundRect(-12, 10 + legOff, 9, 11, 4);
      ctx.roundRect(3, 10 - legOff, 9, 11, 4);
      ctx.fill();
      ctx.stroke();
    }

    // Suit Body
    ctx.fillStyle = p.color.body;
    ctx.beginPath();
    ctx.roundRect(-15, -20, 30, 34, 14);
    ctx.fill();
    ctx.stroke();

    // Glass Visor
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-2, -13, 20, 13, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(6, -9, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Googly eyes inside visor
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5, -6, 2.6, 0, Math.PI * 2);
    ctx.arc(13, -6, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(5.8, -6, 1.3, 0, Math.PI * 2);
    ctx.arc(13.8, -6, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Hat
    this.drawHat(ctx, p.hat);

    ctx.restore();

    // Nameplate
    const showRed = viewer.role === 'impostor' && p.role === 'impostor';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#020617';
    ctx.strokeText(p.name, 0, -30);
    ctx.fillStyle = showRed ? '#f87171' : p.alive ? '#f8fafc' : '#94a3b8';
    ctx.fillText(p.name, 0, -30);

    if (p.scanning) {
      ctx.fillStyle = '#4ade80';
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillText('ESCANER OK!', 0, -44);
    }

    ctx.restore();
  }

  private drawHat(ctx: CanvasRenderingContext2D, hat: HatId): void {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    switch (hat) {
      case 'banana': {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(-10, -20);
        ctx.quadraticCurveTo(0, -36, 12, -20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'crown': {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-10, -19);
        ctx.lineTo(-12, -31);
        ctx.lineTo(-4, -24);
        ctx.lineTo(0, -34);
        ctx.lineTo(4, -24);
        ctx.lineTo(12, -31);
        ctx.lineTo(10, -19);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'cap': {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -18, 12, Math.PI, 0);
        ctx.lineTo(18, -18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'leaf': {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(2, -25, 11, 5, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'visor_band': {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-15, -19, 30, 5);
        ctx.strokeRect(-15, -19, 30, 5);
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

export function drawMonkeyAvatar(
  color: MonkeyColorSpec,
  hat: HatId,
  size = 34,
): string {
  const hatEmoji =
    hat === 'banana'
      ? '🍌'
      : hat === 'crown'
        ? '👑'
        : hat === 'cap'
          ? '🧢'
          : hat === 'leaf'
            ? '🌿'
            : hat === 'visor_band'
              ? '🥷'
              : '';
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;background:${color.body};border:2px solid #0f172a;font-size:${Math.floor(size * 0.5)}px;position:relative;flex-shrink:0;">🐒${hatEmoji ? `<span style="position:absolute;top:-7px;font-size:${Math.floor(size * 0.4)}px;">${hatEmoji}</span>` : ''}</span>`;
}
