import { LEVELS } from './levels';
import { HANDS, drawMonkey as paintMonkey, makeFace, type Face, type HandPos, type Mood } from './monkeyart';
import { paletteAccessory, paletteAccessoryHidesTuft, styleForPalette } from './monkeylook';
import {
  MONKEY_PALETTES,
  WORLD_H,
  WORLD_W,
  type BoxState,
  type ButtonState,
  type GameMode,
  type MonkeyState,
  type PlatformState,
  type SeesawState,
  type WorldState,
} from './types';

export interface HitButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderFrameInfo {
  scale: number;
  offsetX: number;
  offsetY: number;
  buttons: HitButton[];
}

export interface UiViewState {
  selectedMode: GameMode;
  onlineConnected: boolean;
  onlineIsHost: boolean;
  onlinePlayerCount: number;
  roomCode: string | null;
  bestScore: number;
  showLevelSelect: boolean;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawButtonBox(
  ctx: CanvasRenderingContext2D,
  buttons: HitButton[],
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: string,
  border: string,
  label: string,
  textColor = '#ffffff',
  fontSize = 15,
  sublabel?: string,
): void {
  buttons.push({ id, x, y, w, h });
  ctx.save();
  // Drop shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  roundRectPath(ctx, x, y + 4, w, h, 12);
  ctx.fill();

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
  if (sublabel) {
    ctx.fillText(label, x + w * 0.5, y + h * 0.38);
    ctx.font = `700 ${Math.max(11, fontSize - 4)}px system-ui, -apple-system, sans-serif`;
    ctx.globalAlpha = 0.88;
    ctx.fillText(sublabel, x + w * 0.5, y + h * 0.72);
  } else {
    ctx.fillText(label, x + w * 0.5, y + h * 0.52);
  }
  ctx.restore();
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  world: WorldState,
  ui: UiViewState,
  timeNow: number,
): RenderFrameInfo {
  const buttons: HitButton[] = [];

  // Fill entire viewport with warm jungle backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
  bgGrad.addColorStop(0, '#fef9c3');
  bgGrad.addColorStop(0.55, '#ecfccb');
  bgGrad.addColorStop(1, '#bbf7d0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  const scale = Math.min(canvasW / WORLD_W, canvasH / WORLD_H);
  const offsetX = (canvasW - WORLD_W * scale) * 0.5;
  const offsetY = (canvasH - WORLD_H * scale) * 0.5;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Screen shake
  if (world.shakeTimer > 0) {
    const sx = (Math.random() - 0.5) * 2 * world.shakeIntensity;
    const sy = (Math.random() - 0.5) * 2 * world.shakeIntensity;
    ctx.translate(sx, sy);
  }

  // Stage frame clip
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, WORLD_H);
  ctx.clip();

  drawJungleBackdrop(ctx, timeNow);
  drawCircuitWires(ctx, world);
  drawSpikes(ctx, world);
  drawPlatforms(ctx, world.platforms);
  drawSeesaws(ctx, world.seesaws);
  drawButtons(ctx, world.buttons);
  drawBoxes(ctx, world.boxes);
  drawDoor(ctx, world, timeNow);
  drawFakeKeys(ctx, world, timeNow);
  drawRealKey(ctx, world, timeNow);
  drawTetherVines(ctx, world);

  // Draw monkeys (sorted so active solo or higher y draws clearly)
  for (const m of world.monkeys) {
    if (!m.enteredDoor) {
      drawMonkey(ctx, m, world, timeNow);
    }
  }

  drawParticlesAndTexts(ctx, world);

  if (world.resetFlashTimer > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.45, world.resetFlashTimer)})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  // Top-right / Top-center In-Game HUD (avoids top-left SDK bar)
  if (world.phase === 'playing') {
    drawPlayingHud(ctx, world, ui, buttons);
  }

  // Overlays
  if (world.phase === 'menu') {
    drawMenuOverlay(ctx, world, ui, buttons, timeNow);
  } else if (world.phase === 'level_clear') {
    drawLevelClearOverlay(ctx, world, ui, buttons);
  } else if (world.phase === 'victory') {
    drawVictoryOverlay(ctx, world, ui, buttons);
  }

  ctx.restore();

  // Crisp stage border
  ctx.strokeStyle = 'rgba(20, 83, 45, 0.2)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

  ctx.restore();

  return { scale, offsetX, offsetY, buttons };
}

function drawJungleBackdrop(ctx: CanvasRenderingContext2D, t: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, '#fef9c3');
  sky.addColorStop(0.55, '#ecfccb');
  sky.addColorStop(1, '#dcfce7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Soft distant hills
  ctx.fillStyle = 'rgba(134, 239, 172, 0.38)';
  ctx.beginPath();
  ctx.moveTo(0, 560);
  ctx.quadraticCurveTo(220, 440, 460, 535);
  ctx.quadraticCurveTo(760, 430, 1020, 520);
  ctx.quadraticCurveTo(1160, 470, 1280, 530);
  ctx.lineTo(1280, WORLD_H);
  ctx.lineTo(0, WORLD_H);
  ctx.closePath();
  ctx.fill();

  // Swaying decorative hanging vines
  const vinePositions = [140, 420, 790, 1120];
  for (let i = 0; i < vinePositions.length; i++) {
    const vx = vinePositions[i];
    const sway = Math.sin(t * 1.4 + i * 1.7) * 10;
    const len = 75 + (i % 2) * 35;
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(vx, 0);
    ctx.quadraticCurveTo(vx + sway * 0.5, len * 0.5, vx + sway, len);
    ctx.stroke();

    ctx.fillStyle = 'rgba(34, 197, 94, 0.55)';
    ctx.beginPath();
    ctx.ellipse(vx + sway, len, 8, 4.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCircuitWires(ctx: CanvasRenderingContext2D, world: WorldState): void {
  ctx.save();
  for (const btn of world.buttons) {
    for (const p of world.platforms) {
      if (p.linkId !== btn.linkId) continue;
      ctx.strokeStyle = btn.active ? btn.color : 'rgba(100, 116, 139, 0.35)';
      ctx.lineWidth = btn.active ? 3.5 : 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(btn.x + btn.w * 0.5, btn.y);
      ctx.lineTo(p.x + p.w * 0.5, p.y + p.h * 0.5);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSpikes(ctx: CanvasRenderingContext2D, world: WorldState): void {
  for (const sp of world.spikes) {
    const spikeW = 18;
    const count = Math.max(1, Math.floor(sp.w / spikeW));
    const step = sp.w / count;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const sx = sp.x + i * step;
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sp.y + sp.h);
      ctx.lineTo(sx + step * 0.5, sp.y);
      ctx.lineTo(sx + step, sp.y + sp.h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: PlatformState[]): void {
  for (const p of platforms) {
    if (p.kind === 'solid') {
      ctx.save();
      ctx.fillStyle = '#166534';
      roundRectPath(ctx, p.currentX, p.currentY, p.w, p.h, 6);
      ctx.fill();

      // Grass top strip
      ctx.fillStyle = '#22c55e';
      roundRectPath(ctx, p.currentX, p.currentY, p.w, Math.min(12, p.h), 5);
      ctx.fill();

      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, p.currentX, p.currentY, p.w, p.h, 6);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'bridge') {
      const col = p.color ?? '#4ade80';
      ctx.save();
      // Outline ghost when retracted
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(p.currentX, p.currentY, p.w, p.h);
      ctx.setLineDash([]);

      if (p.progress > 0.05) {
        ctx.globalAlpha = p.progress > 0.35 ? 1 : 0.55;
        const w = p.w * p.progress;
        ctx.fillStyle = col;
        roundRectPath(ctx, p.currentX, p.currentY, w, p.h, 5);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        roundRectPath(ctx, p.currentX, p.currentY, w, p.h, 5);
        ctx.stroke();
      }
      ctx.restore();
    } else if (p.kind === 'gate') {
      const col = p.color ?? '#fb7185';
      const remainingH = p.h * (1 - p.progress);
      if (remainingH > 3) {
        ctx.save();
        ctx.fillStyle = col;
        roundRectPath(ctx, p.currentX, p.currentY, p.w, remainingH, 5);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        roundRectPath(ctx, p.currentX, p.currentY, p.w, remainingH, 5);
        ctx.stroke();

        // Stripes
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 3;
        for (let yy = 12; yy < remainingH - 6; yy += 20) {
          ctx.beginPath();
          ctx.moveTo(p.currentX + 5, p.currentY + yy);
          ctx.lineTo(p.currentX + p.w - 5, p.currentY + yy);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (p.kind === 'elevator') {
      const col = p.color ?? '#38bdf8';
      ctx.save();
      // Guide rail
      const tx = p.targetX ?? p.x;
      const ty = p.targetY ?? p.y;
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.18)';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x + p.w * 0.5, p.y);
      ctx.lineTo(tx + p.w * 0.5, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = col;
      roundRectPath(ctx, p.currentX, p.currentY, p.w, p.h, 6);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, p.currentX, p.currentY, p.w, p.h, 6);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.active ? '▲ ELEVADOR ▲' : '▼ ELEVADOR ▼', p.currentX + p.w * 0.5, p.currentY + p.h * 0.5 + 1);
      ctx.restore();
    }
  }
}

function drawSeesaws(ctx: CanvasRenderingContext2D, seesaws: SeesawState[]): void {
  for (const s of seesaws) {
    ctx.save();
    // Fulcrum triangle
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.pivotX, s.pivotY);
    ctx.lineTo(s.pivotX - 18, s.pivotY + 34);
    ctx.lineTo(s.pivotX + 18, s.pivotY + 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tilting plank
    ctx.translate(s.pivotX, s.pivotY);
    ctx.rotate(s.angle);
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    roundRectPath(ctx, -s.length * 0.5, -s.thickness * 0.5, s.length, s.thickness, 6);
    ctx.fill();
    ctx.stroke();

    // Center bolt
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawButtons(ctx: CanvasRenderingContext2D, buttons: ButtonState[]): void {
  for (const btn of buttons) {
    ctx.save();
    const h = btn.pressed ? 6 : 12;
    ctx.fillStyle = '#334155';
    ctx.fillRect(btn.x - 4, btn.y - 4, btn.w + 8, 5);

    ctx.fillStyle = btn.color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, btn.x, btn.y - h, btn.w, h, 4);
    ctx.fill();
    ctx.stroke();

    if (btn.mode === 'timed' && btn.active && btn.timer > 0) {
      ctx.fillStyle = '#1e293b';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`⏱ ${btn.timer.toFixed(1)}s`, btn.x + btn.w * 0.5, btn.y - 20);
    } else if (btn.mode === 'toggle' && btn.active) {
      ctx.fillStyle = '#15803d';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ ATIVO', btn.x + btn.w * 0.5, btn.y - 18);
    }
    ctx.restore();
  }
}

function drawBoxes(ctx: CanvasRenderingContext2D, boxes: BoxState[]): void {
  for (const b of boxes) {
    ctx.save();
    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    ctx.stroke();

    // Wooden cross braces
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(b.x + 8, b.y + 8);
    ctx.lineTo(b.x + b.w - 8, b.y + b.h - 8);
    ctx.moveTo(b.x + b.w - 8, b.y + 8);
    ctx.lineTo(b.x + 8, b.y + b.h - 8);
    ctx.stroke();

    // Required count badge in center
    const maxPush = Math.max(b.pushersLeft, b.pushersRight);
    const enough = maxPush >= b.effectiveRequired;
    ctx.fillStyle = enough ? '#bbf7d0' : '#fef3c7';
    ctx.strokeStyle = enough ? '#16a34a' : '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x + b.w * 0.5, b.y + b.h * 0.5, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = enough ? '#15803d' : '#78350f';
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${b.effectiveRequired}`, b.x + b.w * 0.5, b.y + b.h * 0.5 + 1);

    if (maxPush > 0) {
      ctx.fillStyle = enough ? '#16a34a' : '#ea580c';
      roundRectPath(ctx, b.x + b.w * 0.5 - 24, b.y - 24, 48, 19, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.fillText(`${maxPush}/${b.effectiveRequired}`, b.x + b.w * 0.5, b.y - 14);
    }
    ctx.restore();
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, world: WorldState, t: number): void {
  const d = world.door;
  ctx.save();
  // Arch frame
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3.5;
  roundRectPath(ctx, d.x, d.y, d.w, d.h, 24);
  ctx.fill();
  ctx.stroke();

  if (d.open) {
    // Glowing portal inside open door
    const pulse = 0.85 + Math.sin(t * 6) * 0.15;
    ctx.fillStyle = `rgba(74, 222, 128, ${0.35 * pulse})`;
    roundRectPath(ctx, d.x + 6, d.y + 8, d.w - 12, d.h - 10, 18);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    roundRectPath(ctx, d.x + 10, d.y + 12, d.w - 20, d.h - 14, 14);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRAR!', d.x + d.w * 0.5, d.y + d.h * 0.5);
  } else {
    ctx.fillStyle = '#92400e';
    roundRectPath(ctx, d.x + 8, d.y + 10, d.w - 16, d.h - 12, 16);
    ctx.fill();

    // Gold doorknob + lock
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(d.x + d.w - 15, d.y + d.h * 0.56, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔒', d.x + d.w * 0.5, d.y + d.h * 0.48);
  }

  // Entered monkeys counter above door
  const entered = world.monkeys.filter((m) => m.enteredDoor).length;
  const total = world.monkeys.length;
  ctx.fillStyle = d.open ? '#15803d' : '#475569';
  roundRectPath(ctx, d.x + d.w * 0.5 - 28, d.y - 26, 56, 20, 9);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${entered}/${total} 🐒`, d.x + d.w * 0.5, d.y - 16);
  ctx.restore();
}

function drawKeyShape(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, isFake = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Glow
  ctx.fillStyle = isFake ? 'rgba(251, 146, 60, 0.22)' : 'rgba(250, 204, 21, 0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();

  // Key bow (ring)
  ctx.fillStyle = isFake ? '#fbbf24' : '#fde047';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(-10, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.arc(-10, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Banana-curved key shaft
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(10, -4, 18, 4);
  ctx.stroke();

  ctx.strokeStyle = isFake ? '#fbbf24' : '#fde047';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(10, -4, 18, 4);
  ctx.stroke();

  // Teeth
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  ctx.fillRect(10, 3, 4, 8);
  ctx.strokeRect(10, 3, 4, 8);
  ctx.fillRect(16, 4, 4, 9);
  ctx.strokeRect(16, 4, 4, 9);

  if (isFake) {
    // Tiny mischievous eyebrows so attentive players might suspect!
    ctx.fillStyle = '#991b1b';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', 0, -14);
  }
  ctx.restore();
}

function drawFakeKeys(ctx: CanvasRenderingContext2D, world: WorldState, t: number): void {
  for (let i = 0; i < world.fakeKeys.length; i++) {
    const fk = world.fakeKeys[i];
    if (fk.triggered) continue;
    const bob = Math.sin(t * 4 + i * 2) * 5;
    drawKeyShape(ctx, fk.x, fk.y + bob, 1, true);
  }
}

function drawRealKey(ctx: CanvasRenderingContext2D, world: WorldState, t: number): void {
  if (world.key.used) return;
  const bob = world.key.carrierMonkeyId === null ? Math.sin(t * 4.2) * 6 : 0;
  drawKeyShape(ctx, world.key.x, world.key.y + bob, 1.05, false);
}

function drawTetherVines(ctx: CanvasRenderingContext2D, world: WorldState): void {
  if (!world.tether || world.monkeys.length < 2) return;
  const active = world.monkeys.filter((m) => !m.enteredDoor);
  ctx.save();
  for (let i = 0; i < active.length - 1; i++) {
    const a = active[i];
    const b = active[i + 1];
    const ax = a.x + a.w * 0.5;
    const ay = a.y + a.h * 0.55;
    const bx = b.x + b.w * 0.5;
    const by = b.y + b.h * 0.55;
    const dist = Math.hypot(bx - ax, by - ay);
    const ratio = Math.min(1.2, dist / world.tetherLength);
    const sag = Math.max(0, (1 - ratio) * 28);

    ctx.strokeStyle = ratio > 0.92 ? '#ef4444' : '#16a34a';
    ctx.lineWidth = ratio > 0.92 ? 4.5 : 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) * 0.5, (ay + by) * 0.5 + sag, bx, by);
    ctx.stroke();

    // Leaf knot in center of vine
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5 + sag * 0.5;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(mx, my, 6, 3.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMonkey(
  ctx: CanvasRenderingContext2D,
  m: MonkeyState,
  world: WorldState,
  t: number,
): void {
  const pal = MONKEY_PALETTES[m.paletteIndex % MONKEY_PALETTES.length];
  const cx = m.x + m.w * 0.5;
  const bottomY = m.y + m.h;
  const isSquished = m.squishedTimer > 0;
  const isSoloActive = world.mode === 'solo' && m.id === world.activeSoloIndex;

  // ── apresentação (somente visual) ──
  const speed = Math.abs(m.vx);
  const runningOnGround = m.grounded && speed > 12;
  const airborne = !m.grounded;
  const shouting = Boolean(m.shoutText) && m.shoutTimer > 0;
  const celebrating = world.phase === 'level_clear' || world.phase === 'victory';
  let mood: Mood = 'neutral';
  let armL: HandPos | undefined;
  let armR: HandPos | undefined;
  const over: Partial<Face> = {};
  if (isSquished) {
    mood = 'scared';
  } else if (shouting) {
    mood = 'shouting';
    armL = HANDS.cheer(-1, t * 12);
    armR = HANDS.cheer(1, t * 12);
  } else if (celebrating) {
    mood = 'cheer';
    armL = HANDS.cheer(-1, t * 9 + m.id);
    armR = HANDS.cheer(1, t * 9 + m.id);
  } else if (airborne && m.vy < -40) {
    mood = 'cheer';
    over.mouthOpen = 0.35;
    armL = HANDS.up(-1, t * 14);
    armR = HANDS.up(1, t * 14 + 1);
  } else if (airborne) {
    mood = 'scared';
    over.sweat = false;
    over.mouthOpen = 0.45;
    armL = HANDS.out(-1);
    armR = HANDS.out(1);
  } else if (runningOnGround || isSoloActive) {
    mood = 'happy';
  } else if (m.standingOnMonkeyId !== null) {
    mood = 'focus';
    over.lid = 0.05;
  }
  const faceDir = m.facing;
  over.lookY = airborne ? (m.vy < 0 ? -0.6 : 0.5) : 0;
  const idleGlance = !runningOnGround && !airborne ? Math.sin(t * 0.9 + m.id * 2.1) * 0.5 : 0;
  const face = makeFace(
    mood,
    t,
    m.id * 1.9,
    { x: runningOnGround || airborne ? faceDir : faceDir * 0.6 + idleGlance, y: over.lookY },
    over,
  );
  const turn = runningOnGround || airborne ? faceDir * 0.85 : faceDir * 0.55 + idleGlance * 0.5;

  ctx.save();
  ctx.translate(cx, bottomY);

  // sombra de contato
  {
    const sg = ctx.createRadialGradient(0, -1, 1, 0, -1, 17);
    sg.addColorStop(0, 'rgba(20,40,20,0.28)');
    sg.addColorStop(1, 'rgba(20,40,20,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, -1, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.scale(m.squashX, m.squashY);
  paintMonkey(ctx, {
    style: styleForPalette(m.paletteIndex),
    face,
    height: m.h,
    turn,
    squashX: 1,
    squashY: 1,
    breathe: Math.sin(t * 2.6 + m.id),
    walk: runningOnGround ? m.animTime * 15 : 0,
    walkAmp: runningOnGround ? Math.min(1, speed / 150) : 0,
    tailPhase: t * (runningOnGround ? 8 : 3) + m.id,
    tailAmp: 0.3 + Math.min(0.5, speed / 300) + (airborne ? 0.2 : 0),
    tailSide: m.facing >= 0 ? -1 : 1,
    earFlop: Math.max(-1, Math.min(1, -m.vy * 0.0035)) + Math.sin(t * 1.4 + m.id) * 0.08,
    headTilt: Math.sin(t * 0.8 + m.id) * 0.03 + (runningOnGround ? m.facing * 0.05 : 0),
    lean: runningOnGround ? m.facing * 0.05 : 0,
    armL,
    armR,
    tuft: !paletteAccessoryHidesTuft(m.paletteIndex),
    accessory: paletteAccessory(m.paletteIndex, turn, t),
    outlinePx: 2.2,
  });
  ctx.restore();

  // Player Name / Active Indicator above monkey
  ctx.save();
  const tagY = m.y - (isSoloActive ? 22 : 12);
  if (isSoloActive) {
    const bounce = Math.sin(t * 7) * 3;
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, m.y - 6 + bounce);
    ctx.lineTo(cx - 7, m.y - 16 + bounce);
    ctx.lineTo(cx + 7, m.y - 16 + bounce);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillText(m.name, cx, tagY);

  // Speech bubble if shouting!
  if (m.shoutText && m.shoutTimer > 0) {
    const padX = 10;
    ctx.font = '900 13px system-ui, sans-serif';
    const tw = ctx.measureText(m.shoutText).width;
    const bw = tw + padX * 2;
    const bh = 28;
    const bx = Math.max(8, Math.min(WORLD_W - bw - 8, cx - bw * 0.5));
    const by = m.y - 54;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.shoutText, bx + bw * 0.5, by + bh * 0.5 + 1);
  }
  ctx.restore();
}

function drawParticlesAndTexts(ctx: CanvasRenderingContext2D, world: WorldState): void {
  ctx.save();
  for (const p of world.particles) {
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const ft of world.floatingTexts) {
    const alpha = Math.max(0, Math.min(1, ft.life / ft.maxLife));
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${Math.round(18 * ft.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.restore();
}

function drawPlayingHud(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  ui: UiViewState,
  buttons: HitButton[],
): void {
  const def = LEVELS[world.levelIndex];

  // Top-center level pill (starts at x=365 to stay clear of top-left SDK HUD!)
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  roundRectPath(ctx, 365, 10, 520, 44, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fde047';
  ctx.font = '900 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.title, 382, 26);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 12px system-ui, sans-serif';
  const keyText = world.door.open
    ? '🚪 Porta Aberta!'
    : world.key.carrierMonkeyId !== null
      ? '🔑 Chave Pega!'
      : '🔑 Pegue a Chave';
  ctx.fillText(
    `⏱ ${world.levelTimer.toFixed(1)}s  •  💀 ${world.deaths}  •  ${keyText}`,
    382,
    43,
  );
  ctx.restore();

  // Top-right action buttons
  if (world.mode === 'solo') {
    drawButtonBox(
      ctx,
      buttons,
      'btn_follow',
      900,
      10,
      138,
      44,
      world.followActive ? '#16a34a' : '#334155',
      world.followActive ? '#bbf7d0' : '#94a3b8',
      world.followActive ? '🐾 Seguir: ON (F)' : '🐾 Seguir: OFF (F)',
      '#ffffff',
      12,
    );
  } else if (ui.onlineConnected) {
    drawButtonBox(
      ctx,
      buttons,
      'btn_noop',
      900,
      10,
      138,
      44,
      '#0f172a',
      '#4ade80',
      `🌐 Sala ${ui.roomCode ?? ''}`,
      '#86efac',
      13,
    );
  }

  drawButtonBox(
    ctx,
    buttons,
    'btn_restart',
    1048,
    10,
    108,
    44,
    '#ea580c',
    '#fed7aa',
    '🔄 Reset (R)',
    '#ffffff',
    13,
  );
  drawButtonBox(
    ctx,
    buttons,
    'btn_menu',
    1164,
    10,
    104,
    44,
    '#1e293b',
    '#facc15',
    '🏠 Menu',
    '#fde047',
    13,
  );

  // Subtle bottom hint bar
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  roundRectPath(ctx, 180, WORLD_H - 34, 920, 26, 10);
  ctx.fill();
  ctx.fillStyle = '#fef9c3';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const modeTip =
    world.mode === 'solo'
      ? 'Tab/Q/1-3: Trocar Macaco | F: Seguir | E/B: Gritar | '
      : world.mode === 'local2'
        ? 'P1: WASD | P2: Setas | E/Enter: Gritar | '
        : world.mode === 'local3'
          ? 'P1: WASD | P2: Setas | P3: IJKL | '
          : 'E/B: Gritar | ';
  ctx.fillText(`${modeTip}${def.hint}`, WORLD_W * 0.5, WORLD_H - 21);
  ctx.restore();
}

/** Duas torres de macacos comemorando nas laterais da tela de título. */
function drawMenuMascots(ctx: CanvasRenderingContext2D, t: number): void {
  const towers: Array<{ x: number; pals: number[]; moods: Mood[]; dir: number }> = [
    { x: 80, pals: [0, 1, 2], moods: ['cheer', 'shouting', 'happy'], dir: 1 },
    { x: WORLD_W - 80, pals: [3, 4, 5], moods: ['happy', 'cheer', 'shouting'], dir: -1 },
  ];
  const H = 84;
  for (const tw of towers) {
    for (let i = 0; i < tw.pals.length; i++) {
      const level = tw.pals.length - 1 - i; // i=0 é o de cima
      const pal = tw.pals[i];
      const phase = t * 3 + pal * 1.3;
      const bounce = Math.max(0, Math.sin(phase)) * 6;
      const squash = 1 - Math.max(0, -Math.sin(phase)) * 0.05;
      const baseY = WORLD_H - 56 - level * (H * 0.78) - (level === 0 ? 0 : bounce * 0.3);
      ctx.save();
      ctx.translate(tw.x, baseY - (i === 0 ? bounce : 0));
      ctx.scale(1, squash);
      const turn = tw.dir * 0.5;
      paintMonkey(ctx, {
        style: styleForPalette(pal),
        face: makeFace(tw.moods[i], t, pal * 2.3, { x: tw.dir * 0.4, y: -0.1 }),
        height: H,
        turn,
        breathe: Math.sin(t * 2.6 + pal),
        tailPhase: t * 5 + pal,
        tailAmp: 0.6,
        tailSide: tw.dir > 0 ? 1 : -1,
        earFlop: Math.sin(t * 3 + pal) * 0.4,
        headTilt: Math.sin(t * 2 + pal) * 0.08,
        armL: HANDS.cheer(-1, t * 7 + pal),
        armR: HANDS.cheer(1, t * 7 + pal),
        tuft: !paletteAccessoryHidesTuft(pal),
        accessory: paletteAccessory(pal, turn, t),
        outlinePx: 2.6,
      });
      ctx.restore();
    }
  }
}

function drawMenuOverlay(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  ui: UiViewState,
  buttons: HitButton[],
  t: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  drawMenuMascots(ctx, t);

  // Main Card
  const cardX = 160;
  const cardY = 66;
  const cardW = 960;
  const cardH = 594;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 5;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fill();
  ctx.stroke();

  // Title
  const bounce = Math.sin(t * 3) * 3;
  ctx.fillStyle = '#14532d';
  ctx.font = '900 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔑 MICO PARK: A CHAVE DA BANANA 🍌', WORLD_W * 0.5, cardY + 56 + bounce);

  ctx.fillStyle = '#475569';
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillText(
    'Empilhe macacos, empurre caixas juntos, balance em cipós e entre TODOS na porta!',
    WORLD_W * 0.5,
    cardY + 92,
  );

  // Mode Selector Row
  ctx.fillStyle = '#1e293b';
  ctx.font = '900 14px system-ui, sans-serif';
  ctx.fillText('ESCOLHA O MODO DE JOGO:', WORLD_W * 0.5, cardY + 130);

  const modes: Array<{ id: GameMode; label: string; sub: string }> = [
    { id: 'solo', label: '🐒 Solo (3 Macacos)', sub: 'Tab/Q troca • F segue' },
    { id: 'local2', label: '👥 Local 2P', sub: 'WASD + Setas' },
    { id: 'local3', label: '👨‍👩‍👦 Local 3P', sub: 'WASD + Setas + IJKL' },
    {
      id: 'online',
      label: '🌐 Online Co-op (2-6P)',
      sub: ui.onlineConnected ? `Sala ${ui.roomCode} (${ui.onlinePlayerCount}P)` : 'Use "Co-op Online" ↑',
    },
  ];

  const mW = 212;
  const mGap = 14;
  const startMX = WORLD_W * 0.5 - (modes.length * mW + (modes.length - 1) * mGap) * 0.5;
  modes.forEach((m, idx) => {
    const active = ui.selectedMode === m.id;
    drawButtonBox(
      ctx,
      buttons,
      `mode_${m.id}`,
      startMX + idx * (mW + mGap),
      cardY + 146,
      mW,
      62,
      active ? '#16a34a' : '#e2e8f0',
      active ? '#14532d' : '#94a3b8',
      m.label,
      active ? '#ffffff' : '#1e293b',
      14,
      m.sub,
    );
  });

  // Level Grid (8 Levels)
  ctx.fillStyle = '#1e293b';
  ctx.font = '900 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SELECIONE A FASE (OU COMECE NA FASE 1):', WORLD_W * 0.5, cardY + 238);

  const cols = 4;
  const lW = 212;
  const lH = 72;
  const lGapX = 14;
  const lGapY = 12;
  const gridStartX = WORLD_W * 0.5 - (cols * lW + (cols - 1) * lGapX) * 0.5;
  const gridStartY = cardY + 254;

  LEVELS.forEach((lvl, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lx = gridStartX + col * (lW + lGapX);
    const ly = gridStartY + row * (lH + lGapY);
    const done = world.completedLevels.includes(i);
    const shortTitle = lvl.title.replace(/^Fase \d+:\s*/, '');
    drawButtonBox(
      ctx,
      buttons,
      `play_level_${i}`,
      lx,
      ly,
      lW,
      lH,
      done ? '#dcfce7' : '#fef3c7',
      done ? '#16a34a' : '#f59e0b',
      `${done ? '✅ ' : ''}Fase ${i + 1}`,
      '#1e293b',
      15,
      shortTitle.slice(0, 24),
    );
  });

  // Giant Play Button
  const canStart = ui.selectedMode !== 'online' || !ui.onlineConnected || ui.onlineIsHost;
  drawButtonBox(
    ctx,
    buttons,
    'start_game',
    WORLD_W * 0.5 - 165,
    cardY + 428,
    330,
    62,
    canStart ? '#facc15' : '#cbd5e1',
    canStart ? '#854d0e' : '#64748b',
    canStart ? '▶ JOGAR AGORA!' : '⏳ Aguardando Host iniciar...',
    '#1e293b',
    21,
  );

  // Controls & Record Footer
  ctx.fillStyle = '#475569';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `🏆 Recorde Local: ${ui.bestScore} pts   •   Grito de Macaco: E ou B   •   Reiniciar Rápido: R`,
    WORLD_W * 0.5,
    cardY + 516,
  );
  ctx.fillStyle = '#15803d';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillText(
    'Dica Online: Clique em "🐒 Co-op Online" no canto superior esquerdo para criar sala e mandar o link pros amigos!',
    WORLD_W * 0.5,
    cardY + 544,
  );

  ctx.restore();
}

function drawLevelClearOverlay(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  ui: UiViewState,
  buttons: HitButton[],
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const cx = WORLD_W * 0.5;
  const cy = WORLD_H * 0.5;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 5;
  roundRectPath(ctx, cx - 260, cy - 170, 520, 340, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#15803d';
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🍌 FASE CONCLUÍDA! 🎉', cx, cy - 108);

  ctx.fillStyle = '#334155';
  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillText(`Tempo: ${world.levelTimer.toFixed(1)}s   •   Mortes: ${world.deaths}`, cx, cy - 52);
  ctx.fillStyle = '#ca8a04';
  ctx.font = '900 24px system-ui, sans-serif';
  ctx.fillText(`Pontuação Total: ${world.totalScore} pts`, cx, cy - 10);

  const canAdvance = world.mode !== 'online' || ui.onlineIsHost;
  drawButtonBox(
    ctx,
    buttons,
    'next_level',
    cx - 150,
    cy + 34,
    300,
    56,
    canAdvance ? '#22c55e' : '#cbd5e1',
    canAdvance ? '#14532d' : '#64748b',
    canAdvance ? '▶ Próxima Fase (Enter)' : '⏳ Aguardando Host...',
    '#ffffff',
    18,
  );

  drawButtonBox(
    ctx,
    buttons,
    'btn_menu',
    cx - 100,
    cy + 104,
    200,
    42,
    '#e2e8f0',
    '#64748b',
    '🏠 Voltar ao Menu',
    '#1e293b',
    14,
  );
  ctx.restore();
}

function drawVictoryOverlay(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  ui: UiViewState,
  buttons: HitButton[],
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const cx = WORLD_W * 0.5;
  const cy = WORLD_H * 0.5;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 6;
  roundRectPath(ctx, cx - 300, cy - 200, 600, 400, 26);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#b45309';
  ctx.font = '900 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('👑 TODOS OS MACACOS VENCERAM! 🍌', cx, cy - 128);

  ctx.fillStyle = '#15803d';
  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillText('Vocês sobreviveram às 8 fases sem desfazer a amizade!', cx, cy - 82);

  ctx.fillStyle = '#1e293b';
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.fillText(
    `⏱ Speedrun Total: ${world.totalTimer.toFixed(1)}s   •   💀 Mortes: ${world.deaths}`,
    cx,
    cy - 30,
  );
  ctx.fillStyle = '#ca8a04';
  ctx.font = '900 28px system-ui, sans-serif';
  ctx.fillText(`🏆 Score Final: ${world.totalScore} pts`, cx, cy + 18);

  const canPlayAgain = world.mode !== 'online' || ui.onlineIsHost;
  drawButtonBox(
    ctx,
    buttons,
    'play_level_0',
    cx - 150,
    cy + 64,
    300,
    54,
    canPlayAgain ? '#facc15' : '#cbd5e1',
    canPlayAgain ? '#854d0e' : '#64748b',
    canPlayAgain ? '🔄 Jogar Tudo de Novo!' : '⏳ Aguardando Host...',
    '#1e293b',
    18,
  );

  drawButtonBox(
    ctx,
    buttons,
    'btn_menu',
    cx - 110,
    cy + 130,
    220,
    42,
    '#e2e8f0',
    '#64748b',
    '🏠 Menu & Fases',
    '#1e293b',
    14,
  );
  ctx.restore();
}
