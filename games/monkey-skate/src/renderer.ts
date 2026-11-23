import type {
  FloatingCallout,
  MovingCar,
  Particle,
  RagdollNode,
  RagdollState,
  RemotePlayerState,
  SkaterMode,
  StairVisual,
  ThrownBanana,
  TrackData,
  TrackProp,
  TrickKind,
  XrayFlash,
} from './types';

export interface RenderLocalSkater {
  name: string;
  color: string;
  mode: SkaterMode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  facing: 1 | -1;
  crouching: boolean;
  activeTrick: TrickKind;
  trickTimer: number;
  boardFlip: number;
  grindBalance: number; // -1..1
  manualBalance: number; // -1..1
  turboTimer: number;
  invulnTimer: number;
  ragdollRecoverIn: number | null;
  ragdoll: RagdollState;
}

export interface RenderContextState {
  track: TrackData;
  camX: number;
  camY: number;
  camZoom: number;
  shakeX: number;
  shakeY: number;
  time: number;
  countdownText: string | null;
  local: RenderLocalSkater;
  remotes: RemotePlayerState[];
  cars: MovingCar[];
  thrownBananas: ThrownBanana[];
  particles: Particle[];
  callouts: FloatingCallout[];
  xrays: XrayFlash[];
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: RenderContextState,
): void {
  const { track, camX, camY, camZoom, shakeX, shakeY, time } = state;

  // 1. Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, track.skyTop);
  skyGrad.addColorStop(0.55, track.skyMid);
  skyGrad.addColorStop(1, track.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Parallax Sun & Clouds & Silhouettes
  drawParallaxBackground(ctx, w, h, track, camX, camY, time);

  // 3. World Transform
  ctx.save();
  ctx.translate(w * 0.5 + shakeX, h * 0.5 + shakeY);
  ctx.scale(camZoom, camZoom);
  ctx.translate(-camX, -camY);

  const viewHalfW = (w * 0.5) / camZoom + 360;
  const viewMinX = camX - viewHalfW;
  const viewMaxX = camX + viewHalfW;

  // 4. Scenery props behind terrain (poles, signs, billboards)
  for (const prop of track.props) {
    if (prop.solidInSkate !== false) continue;
    if (prop.x + prop.width < viewMinX || prop.x - prop.width > viewMaxX) continue;
    drawProp(ctx, prop, true);
  }

  // 5. Terrain body & surface
  drawTerrain(ctx, track, viewMinX, viewMaxX, camY + (h * 0.6) / camZoom + 550);

  // 6. Visual staircases on smooth slope
  for (const stair of track.stairs) {
    if (stair.x1 < viewMinX || stair.x0 > viewMaxX) continue;
    drawStairs(ctx, stair, track.groundTopColor);
  }

  // 7. Jumpable foreground props (trash, tires, bench, parked cars, hotdog)
  for (const prop of track.props) {
    if (prop.solidInSkate === false) continue;
    if (prop.x + prop.width < viewMinX || prop.x - prop.width > viewMaxX) continue;
    drawProp(ctx, prop, false);
  }

  // 8. Finish Banner for Ladeira
  if (track.finishX !== undefined) {
    drawFinishGate(ctx, track, track.finishX);
  }

  // 9. Grind Rails
  for (const rail of track.rails) {
    const first = rail.points[0];
    const last = rail.points[rail.points.length - 1];
    if (!first || !last) continue;
    if (last.x < viewMinX || first.x > viewMaxX) continue;
    drawRail(ctx, rail.points, rail.color ?? '#facc15', rail.id.startsWith('roof-'));
  }

  // 10. Turbo Banana Pads
  for (const pad of track.turboBananas) {
    if (pad.x < viewMinX || pad.x > viewMaxX) continue;
    if (pad.cooldown <= 0) {
      drawBananaItem(ctx, pad.x, pad.y - 12, true, time);
    }
  }

  // 11. Player-thrown mischievous Banana Peels
  for (const b of state.thrownBananas) {
    if (b.x < viewMinX || b.x > viewMaxX) continue;
    drawBananaItem(ctx, b.x, b.y - 8, false, time, b.ownerName);
  }

  // 12. Moving Traffic Cars
  for (const car of state.cars) {
    if (car.x + car.width < viewMinX || car.x - car.width > viewMaxX) continue;
    drawMovingCar(ctx, car, time);
  }

  // 13. Remote Multiplayer Skaters
  for (const remote of state.remotes) {
    if (remote.snap.trackId !== track.id) continue;
    drawRemoteSkater(ctx, remote, time);
  }

  // 14. Local Skater or Ragdoll
  drawLocalSkater(ctx, state.local, time);

  // 15. Particles
  for (const p of state.particles) {
    drawParticle(ctx, p);
  }

  // 16. X-Ray Flashes
  for (const xr of state.xrays) {
    drawXrayFlash(ctx, xr);
  }

  // 17. Floating Callouts
  for (const c of state.callouts) {
    const alpha = Math.min(1, c.life / (c.maxLife * 0.35));
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(c.x, c.y);
    ctx.scale(c.scale, c.scale);
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // 18. Screen-space Countdown Overlay (for synchronized multiplayer duels & races)
  if (state.countdownText) {
    ctx.save();
    ctx.translate(w * 0.5, h * 0.34);
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(state.countdownText, 0, 0);
    ctx.fillStyle = state.countdownText.includes('DROPOU') ? '#4ade80' : '#fde047';
    ctx.fillText(state.countdownText, 0, 0);
    ctx.restore();
  }
}

function drawParallaxBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  track: TrackData,
  camX: number,
  camY: number,
  time: number,
): void {
  // Retro Sun
  const sunX = w * 0.78 - camX * 0.015;
  const sunY = h * 0.22 - camY * 0.01;
  ctx.save();
  ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
  ctx.beginPath();
  ctx.arc(sunX, Math.max(70, Math.min(h * 0.45, sunY)), 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Clouds
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  for (let i = 0; i < 6; i++) {
    const cx = (((i * 340 - camX * 0.08 + time * 8) % (w + 300)) + (w + 300)) % (w + 300) - 150;
    const cy = 65 + (i % 3) * 48;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 62, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 28, cy + 6, 36, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 30, cy + 8, 38, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Distant hills / favela / jungle ridge
  const baseHorizon = h * 0.76;
  ctx.save();
  ctx.fillStyle = track.id === 'ladeira' ? 'rgba(30, 27, 75, 0.48)' : 'rgba(15, 23, 42, 0.36)';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let sx = 0; sx <= w + 60; sx += 60) {
    const wx = sx + camX * 0.14;
    const hill = Math.sin(wx * 0.004) * 48 + Math.cos(wx * 0.011) * 22;
    ctx.lineTo(sx, baseHorizon + hill);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Midground palm trees / city silhouettes
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  const spacing = 220;
  const startIdx = Math.floor((camX * 0.32 - 200) / spacing);
  const endIdx = startIdx + Math.ceil(w / spacing) + 3;
  for (let i = startIdx; i <= endIdx; i++) {
    const sx = i * spacing - camX * 0.32;
    const sy = baseHorizon + 26 + ((i * 37) % 35);
    if (track.id === 'ladeira' && i % 2 === 0) {
      const bh = 55 + ((i * 29) % 50);
      ctx.fillRect(sx - 28, sy - bh, 56, bh + 120);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx - 14, sy - bh + 14, 8, 10);
      ctx.fillRect(sx + 6, sy - bh + 14, 8, 10);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    } else {
      ctx.fillRect(sx - 4, sy - 76, 8, 130);
      ctx.beginPath();
      ctx.ellipse(sx - 22, sy - 74, 24, 7, -0.35, 0, Math.PI * 2);
      ctx.ellipse(sx + 22, sy - 74, 24, 7, 0.35, 0, Math.PI * 2);
      ctx.ellipse(sx, sy - 86, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  track: TrackData,
  minX: number,
  maxX: number,
  bottomY: number,
): void {
  const pts = track.terrain;
  if (pts.length < 2) return;

  let start = 0;
  while (start < pts.length - 1 && pts[start + 1].x < minX) start++;
  let end = pts.length - 1;
  while (end > start + 1 && pts[end - 1].x > maxX) end--;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[start].x, bottomY);
  for (let i = start; i <= end; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.lineTo(pts[end].x, bottomY);
  ctx.closePath();
  ctx.fillStyle = track.groundFill;
  ctx.fill();

  // Top surface stripe
  ctx.beginPath();
  for (let i = start; i <= end; i++) {
    if (i === start) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = track.groundTopColor;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Road dashed line for Ladeira
  if (track.id === 'ladeira') {
    ctx.beginPath();
    for (let i = start; i <= end; i++) {
      if (i === start) ctx.moveTo(pts[i].x, pts[i].y + 18);
      else ctx.lineTo(pts[i].x, pts[i].y + 18);
    }
    ctx.setLineDash([28, 22]);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawStairs(ctx: CanvasRenderingContext2D, stair: StairVisual, accentColor: string): void {
  const { x0, y0, x1, y1, steps } = stair;
  const dx = (x1 - x0) / steps;
  const dy = (y1 - y0) / steps;
  ctx.save();
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  for (let i = 0; i < steps; i++) {
    const sx = x0 + dx * i;
    const sy = y0 + dy * i;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx, sy);
    ctx.lineTo(sx + dx, sy + dy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle yellow curb nose per step
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 1);
    ctx.lineTo(sx + dx, sy + 1);
    ctx.stroke();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
  }
  ctx.restore();
}

function drawRail(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  isRoofRail: boolean,
): void {
  ctx.save();
  if (!isRoofRail) {
    // Support legs
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 5;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i].x, pts[i].y + 42);
      ctx.stroke();
    }
  }
  // Rail bar
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = isRoofRail ? 7 : 11;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = isRoofRail ? 3.5 : 6;
  ctx.stroke();
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, prop: TrackProp, isScenery: boolean): void {
  const { x, y, width, height, kind } = prop;
  ctx.save();
  if (isScenery) {
    ctx.globalAlpha = 0.86;
  }
  switch (kind) {
    case 'pole': {
      ctx.fillStyle = '#475569';
      ctx.fillRect(x - 5, y - height, 10, height);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x - 5, y - height, 36, 8);
      // Warm street lamp glow
      ctx.fillStyle = 'rgba(253, 224, 71, 0.22)';
      ctx.beginPath();
      ctx.arc(x + 26, y - height + 10, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(x + 26, y - height + 10, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sign': {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x - 3, y - height, 6, height);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - 34, y - height - 22, 68, 34, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(prop.label ?? 'PARE', x, y - height - 1);
      break;
    }
    case 'trash': {
      ctx.fillStyle = '#16a34a';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.fillRect(x - width * 0.5, y - height, width, height);
      ctx.strokeRect(x - width * 0.5, y - height, width, height);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x - width * 0.55, y - height - 6, width * 1.1, 8);
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#92400e';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.fillRect(x - width * 0.5, y - height, width, 10);
      ctx.strokeRect(x - width * 0.5, y - height, width, 10);
      ctx.fillStyle = '#475569';
      ctx.fillRect(x - width * 0.38, y - height + 10, 8, height - 10);
      ctx.fillRect(x + width * 0.3, y - height + 10, 8, height - 10);
      break;
    }
    case 'tires': {
      const layers = 2;
      const layerH = height / layers;
      for (let i = 0; i < layers; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#1e293b' : '#334155';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - width * 0.5, y - layerH * (i + 1), width, layerH - 1, 7);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'parked-car': {
      drawCarBody(ctx, x, y, width, height, prop.color ?? '#ef4444', prop.label ?? 'CORSA');
      break;
    }
    case 'hotdog': {
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.fillRect(x - width * 0.5, y - height + 16, width, height - 16);
      ctx.strokeRect(x - width * 0.5, y - height + 16, width, height - 16);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x - width * 0.54, y - height, width * 1.08, 16);
      ctx.strokeRect(x - width * 0.54, y - height, width * 1.08, 16);
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🌭 DOGÃO', x, y - 14);
      break;
    }
    case 'billboard': {
      ctx.fillStyle = '#475569';
      ctx.fillRect(x - 8, y - height, 16, height);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x - width * 0.5, y - height - 10, width, 64, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(prop.label ?? 'SUS 24H', x, y - height + 28);
      break;
    }
  }
  ctx.restore();
}

function drawCarBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  label: string,
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  // Lower chassis
  ctx.beginPath();
  ctx.roundRect(x - width * 0.5, y - height * 0.58, width, height * 0.45, 8);
  ctx.fill();
  ctx.stroke();
  // Cabin
  ctx.beginPath();
  ctx.roundRect(x - width * 0.3, y - height, width * 0.6, height * 0.48, 8);
  ctx.fill();
  ctx.stroke();
  // Windows
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x - width * 0.24, y - height + 6, width * 0.2, height * 0.32);
  ctx.fillRect(x + width * 0.04, y - height + 6, width * 0.2, height * 0.32);
  // Wheels
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x - width * 0.3, y - 11, 13, 0, Math.PI * 2);
  ctx.arc(x + width * 0.3, y - 11, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.arc(x - width * 0.3, y - 11, 5, 0, Math.PI * 2);
  ctx.arc(x + width * 0.3, y - 11, 5, 0, Math.PI * 2);
  ctx.fill();
  // Label
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - height * 0.28);
}

function drawMovingCar(ctx: CanvasRenderingContext2D, car: MovingCar, time: number): void {
  ctx.save();
  drawCarBody(ctx, car.x, car.y, car.width, car.height, car.color, 'VRUM!');
  const beamX = car.x + car.dir * (car.width * 0.5);
  const grad = ctx.createLinearGradient(beamX, car.y - 24, beamX + car.dir * 95, car.y - 24);
  grad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
  grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(beamX, car.y - 30);
  ctx.lineTo(beamX + car.dir * 95, car.y - 50);
  ctx.lineTo(beamX + car.dir * 95, car.y - 4);
  ctx.closePath();
  ctx.fill();
  if (Math.sin(time * 16) > 0) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(car.x, car.y - car.height - 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFinishGate(ctx: CanvasRenderingContext2D, track: TrackData, fx: number): void {
  const groundY = track.terrain.reduce((acc, p) => (Math.abs(p.x - fx) < Math.abs(acc.x - fx) ? p : acc)).y;
  ctx.save();
  ctx.fillStyle = '#475569';
  ctx.fillRect(fx - 6, groundY - 190, 12, 190);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(fx - 80, groundY - 220, 160, 40, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏁 FIM DO MORRO!', fx, groundY - 194);
  ctx.restore();
}

function drawBananaItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isTurbo: boolean,
  time: number,
  ownerName?: string,
): void {
  ctx.save();
  const bob = Math.sin(time * 6 + x * 0.01) * 4;
  ctx.translate(x, y + bob);
  if (isTurbo) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 22 + Math.sin(time * 8) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.fillStyle = isTurbo ? '#fde047' : '#eab308';
  ctx.beginPath();
  ctx.moveTo(-14, 4);
  ctx.quadraticCurveTo(0, -16, 15, 2);
  ctx.quadraticCurveTo(1, -2, -14, 4);
  ctx.fill();
  ctx.stroke();

  if (ownerName) {
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fecdd3';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.strokeText(`🍌 ${ownerName}`, 0, -14);
    ctx.fillText(`🍌 ${ownerName}`, 0, -14);
  } else if (isTurbo) {
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('⚡TURBO', 0, -16);
  }
  ctx.restore();
}

function drawLocalSkater(ctx: CanvasRenderingContext2D, sk: RenderLocalSkater, time: number): void {
  if (sk.mode === 'ragdoll' && sk.ragdoll.active) {
    drawRagdoll(ctx, sk.ragdoll, sk.color, sk.name, time);

    // Quick recovery hint above ragdoll head
    const head = sk.ragdoll.nodes[0];
    if (head) {
      ctx.save();
      const label =
        sk.ragdollRecoverIn !== null && sk.ragdollRecoverIn > 0.05
          ? `Espaço / R: Levantar já! (auto ${sk.ragdollRecoverIn.toFixed(1)}s)`
          : 'Espaço / R: Levantar agora!';
      ctx.font = '800 12px system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 18;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(head.x - tw * 0.5, head.y - 54, tw, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.fillText(label, head.x, head.y - 38);
      ctx.restore();
    }
    return;
  }

  ctx.save();
  if (sk.invulnTimer > 0 && Math.sin(time * 28) > 0) {
    ctx.globalAlpha = 0.55;
  }

  drawMonkeyOnBoard(ctx, {
    x: sk.x,
    y: sk.y,
    vx: sk.vx,
    vy: sk.vy,
    angle: sk.angle,
    facing: sk.facing,
    color: sk.color,
    crouching: sk.crouching,
    activeTrick: sk.activeTrick,
    trickTimer: sk.trickTimer,
    boardFlip: sk.boardFlip,
    isGrinding: sk.mode === 'grinding',
    isManual: sk.mode === 'manual',
    balance: sk.mode === 'grinding' ? sk.grindBalance : sk.mode === 'manual' ? sk.manualBalance : 0,
    isTurbo: sk.turboTimer > 0,
    time,
  });

  if (sk.name) {
    drawNameTag(ctx, sk.x, sk.y - 96, sk.name, sk.color);
  }
  ctx.restore();

  // Grind balance meter above monkey
  if (sk.mode === 'grinding') {
    drawBalanceArc(ctx, sk.x, sk.y - 102, sk.grindBalance, '#4ade80', 'GRIND');
  } else if (sk.mode === 'manual') {
    drawBalanceArc(ctx, sk.x, sk.y - 102, sk.manualBalance, '#c084fc', 'MANUAL');
  }
}

function drawBalanceArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  val: number,
  safeColor: string,
  tag: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 14, 28, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  ctx.strokeStyle = Math.abs(val) > 0.78 ? '#fb7185' : safeColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 14, 28, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  const clamped = Math.max(-1, Math.min(1, val));
  const a = Math.PI * 1.5 + clamped * (Math.PI * 0.35);
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(Math.cos(a) * 28, 14 + Math.sin(a) * 28, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '900 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(tag, 0, -20);
  ctx.restore();
}

function drawRemoteSkater(ctx: CanvasRenderingContext2D, remote: RemotePlayerState, time: number): void {
  const s = remote.snap;
  ctx.save();
  ctx.globalAlpha = 0.88;
  if (s.mode === 'ragdoll' && s.ragdollNodes && s.ragdollNodes.length >= 11) {
    const fakeNodes: RagdollNode[] = s.ragdollNodes.map((pt, idx) => ({
      name: String(idx),
      x: pt[0],
      y: pt[1],
      oldX: pt[0],
      oldY: pt[1],
      radius: 8,
      hitCooldown: 0,
    }));
    const fakeRagdoll: RagdollState = {
      active: true,
      nodes: fakeNodes,
      constraints: [],
      boardX: s.boardPos?.[0] ?? s.x,
      boardY: s.boardPos?.[1] ?? s.y,
      boardAngle: s.boardPos?.[2] ?? s.angle,
      boardVx: 0,
      boardVy: 0,
      boardSpin: 0,
      capX: 0,
      capY: 0,
      capVx: 0,
      capVy: 0,
      capAngle: 0,
      capSpin: 0,
      capLost: false,
      elapsed: 1,
      settleTime: 0,
      currentCrashScore: 0,
      currentBonesBroken: 0,
    };
    drawRagdoll(ctx, fakeRagdoll, remote.color, remote.name, time);
  } else {
    drawMonkeyOnBoard(ctx, {
      x: remote.renderX,
      y: remote.renderY,
      vx: s.vx,
      vy: s.vy,
      angle: remote.renderAngle,
      facing: s.facing,
      color: remote.color,
      crouching: s.crouching,
      activeTrick: s.activeTrick,
      trickTimer: s.trickTimer,
      boardFlip: s.boardFlip,
      isGrinding: s.mode === 'grinding',
      isManual: s.mode === 'manual',
      balance: 0,
      isTurbo: false,
      time,
    });
    drawNameTag(ctx, remote.renderX, remote.renderY - 95, remote.name, remote.color);
  }
  ctx.restore();
}

function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  color: string,
): void {
  ctx.save();
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(name).width + 14;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - tw * 0.5, y - 14, tw, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(name, x, y - 1);
  ctx.restore();
}

interface MonkeyBoardDrawOpts {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  angle: number;
  facing: 1 | -1;
  color: string;
  crouching: boolean;
  activeTrick: TrickKind;
  trickTimer: number;
  boardFlip: number;
  isGrinding: boolean;
  isManual: boolean;
  balance?: number;
  isTurbo: boolean;
  time: number;
}

type MonkeyMood = 'chill' | 'hyped' | 'nervous' | 'panic' | 'dizzy';

function getFurVariant(color: string): { light: string; dark: string; cap: string } {
  let hash = 0;
  for (let i = 0; i < color.length; i++) {
    hash = (hash * 31 + color.charCodeAt(i)) | 0;
  }
  const variants = [
    { light: '#b45309', dark: '#78350f', cap: '#ef4444' },
    { light: '#c2691e', dark: '#7c2d12', cap: '#2563eb' },
    { light: '#a16207', dark: '#713f12', cap: '#16a34a' },
    { light: '#9a3412', dark: '#6c2710', cap: '#a855f7' },
  ];
  return variants[Math.abs(hash) % variants.length];
}

function drawMonkeyPaw(ctx: CanvasRenderingContext2D, x: number, y: number, r = 4.5): void {
  ctx.fillStyle = '#fde68a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawSneaker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  accent: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Sneaker upper
  ctx.fillStyle = accent;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(1, -1, 7.2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // White rubber sole & toe cap
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-5.5, 1.2, 12.5, 2.2);
  ctx.beginPath();
  ctx.arc(5.5, -0.5, 2.6, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.fill();
  ctx.restore();
}

function drawMonkeyOnBoard(ctx: CanvasRenderingContext2D, o: MonkeyBoardDrawOpts): void {
  const vx = o.vx ?? 0;
  const vy = o.vy ?? 0;
  const fur = getFurVariant(o.color);
  const crouch = (o.crouching ? 11 : 0) + (o.activeTrick === 'bananagrab' ? 11 : 0);
  const christLift = o.activeTrick === 'christair' ? -18 : 0;

  // Subtle squash & stretch from crouch / air velocity
  const airStretch = Math.max(-0.08, Math.min(0.1, -vy * 0.00018));
  const sx = o.crouching ? 1.07 : 1 - airStretch * 0.5;
  const sy = o.crouching ? 0.92 : 1 + airStretch;

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.angle);
  ctx.scale(o.facing * sx, sy);

  if (o.isManual) {
    // Pivot slightly on back wheels for tail manual look!
    ctx.translate(-12, 0);
    ctx.rotate(-0.28);
    ctx.translate(12, 0);
  }

  // Secondary-motion curved tail with dark outline + fur stroke
  const speedLag = Math.max(-10, Math.min(10, Math.abs(vx) * 0.015));
  const tailWag = Math.sin(o.time * (o.isTurbo ? 18 : 10)) * 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8.5;
  ctx.beginPath();
  ctx.moveTo(-10, -24 + crouch + christLift);
  ctx.bezierCurveTo(
    -26 - speedLag * 0.5,
    -26 + crouch + tailWag * 0.4,
    -34 - speedLag,
    -44 + tailWag,
    -24 - speedLag * 0.6,
    -52 + crouch + tailWag * 0.5,
  );
  ctx.stroke();
  ctx.strokeStyle = fur.dark;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Skateboard
  ctx.save();
  if (o.activeTrick === 'christair') {
    ctx.translate(22, -32);
    ctx.rotate(1.1);
  } else {
    ctx.translate(0, -4);
    if (o.boardFlip !== 0) {
      ctx.scale(1, Math.cos(o.boardFlip));
    }
  }
  drawSkateboard(ctx, o.isTurbo);
  ctx.restore();

  // Christ Air Golden Halo
  if (o.activeTrick === 'christair') {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -88 + christLift, 17, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Legs with cartoon outline + fur stroke
  const hipY = -22 + crouch + christLift;
  const drawLeg = (kx: number, ky: number, fx: number, fy: number, sxStart: number) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 9.5;
    ctx.beginPath();
    ctx.moveTo(sxStart, hipY);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.strokeStyle = fur.dark;
    ctx.lineWidth = 5.5;
    ctx.stroke();
  };
  drawLeg(-12 + crouch * 0.3, -14 + christLift * 0.7, -10, -7 + christLift * 0.5, -5);
  drawLeg(13 + crouch * 0.2, -14 + christLift * 0.7, 10, -7 + christLift * 0.5, 5);

  // Skate Sneakers
  drawSneaker(ctx, -10, -6 + christLift * 0.5, 0, o.color);
  drawSneaker(ctx, 11, -6 + christLift * 0.5, 0, o.color);

  // Back Arm
  const chestY = -44 + crouch + christLift;
  const wave = o.isGrinding || o.isManual ? Math.sin(o.time * 22) * 8 : Math.sin(o.time * 7) * 2;
  const backHandX =
    o.activeTrick === 'christair'
      ? -32
      : o.activeTrick === 'bananagrab'
        ? -22
        : -22;
  const backHandY =
    o.activeTrick === 'christair'
      ? chestY + 4
      : o.activeTrick === 'bananagrab'
        ? chestY - 8
        : chestY + 12 + wave;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-10, chestY + 6);
  ctx.lineTo(backHandX, backHandY);
  ctx.stroke();
  ctx.strokeStyle = fur.dark;
  ctx.lineWidth = 5.2;
  ctx.stroke();
  drawMonkeyPaw(ctx, backHandX, backHandY, 4.2);

  // Hoodie Torso with gradient shading, hood & pocket
  const hGrad = ctx.createLinearGradient(0, chestY, 0, chestY + 25);
  hGrad.addColorStop(0, o.color);
  hGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = o.color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.roundRect(-12.5, chestY, 25, 25, 9);
  ctx.fill();
  ctx.stroke();

  // Subtle hoodie shading overlay & kangaroo pocket
  ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.beginPath();
  ctx.roundRect(-8, chestY + 13, 16, 9, 4);
  ctx.fill();
  // Bunched hood collar behind neck
  ctx.fillStyle = o.color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-6, chestY + 2, 8, 4.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Fluttering white hoodie strings
  const strFlutter = Math.sin(o.time * 18) * 2.5 - Math.min(6, Math.abs(vx) * 0.01);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(2, chestY + 4);
  ctx.lineTo(2 + strFlutter, chestY + 12);
  ctx.moveTo(6, chestY + 4);
  ctx.lineTo(7 + strFlutter, chestY + 11);
  ctx.stroke();

  // Front Arm + Paw
  const frontHandX =
    o.activeTrick === 'christair'
      ? 30
      : o.activeTrick === 'bananagrab'
        ? 18
        : 22;
  const frontHandY =
    o.activeTrick === 'christair'
      ? chestY + 4
      : o.activeTrick === 'bananagrab'
        ? -8
        : chestY + 10 - wave;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(10, chestY + 6);
  ctx.lineTo(frontHandX, frontHandY);
  ctx.stroke();
  ctx.strokeStyle = fur.light;
  ctx.lineWidth = 5.2;
  ctx.stroke();
  drawMonkeyPaw(ctx, frontHandX, frontHandY, 4.4);

  // Expressive Skater Mood
  let mood: MonkeyMood = 'chill';
  if (o.activeTrick !== 'none' || o.isTurbo) mood = 'hyped';
  else if ((o.isGrinding || o.isManual) && Math.abs(o.balance ?? 0) > 0.6) mood = 'nervous';

  drawMonkeyHead(ctx, 2, chestY - 12, mood, true, {
    time: o.time,
    lookX: Math.max(-0.5, Math.min(1, vx * 0.002 * o.facing + 0.5)),
    lookY: Math.max(-1, Math.min(1, vy * 0.002)),
    furLight: fur.light,
    furDark: fur.dark,
    capColor: fur.cap,
    seed: o.color.charCodeAt(1) || 1,
  });

  ctx.restore();
}

function drawSkateboard(ctx: CanvasRenderingContext2D, turbo: boolean): void {
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-16, -2, 6, 4);
  ctx.fillRect(10, -2, 6, 4);
  ctx.fillStyle = turbo ? '#38bdf8' : '#fb7185';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-13, 3, 4.5, 0, Math.PI * 2);
  ctx.arc(13, 3, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-13, 3, 1.4, 0, Math.PI * 2);
  ctx.arc(13, 3, 1.4, 0, Math.PI * 2);
  ctx.fill();

  const dGrad = ctx.createLinearGradient(-28, -8, 28, -2);
  dGrad.addColorStop(0, '#fde047');
  dGrad.addColorStop(0.5, '#facc15');
  dGrad.addColorStop(1, '#eab308');
  ctx.fillStyle = dGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-28, -5);
  ctx.lineTo(-21, -2);
  ctx.lineTo(21, -2);
  ctx.lineTo(28, -5);
  ctx.lineTo(26, -8);
  ctx.lineTo(-26, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

interface MonkeyHeadStyleOpts {
  time?: number;
  lookX?: number;
  lookY?: number;
  furLight?: string;
  furDark?: string;
  capColor?: string;
  seed?: number;
}

function drawMonkeyHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mood: MonkeyMood,
  hasCap: boolean,
  opts: MonkeyHeadStyleOpts = {},
): void {
  const {
    time = 0,
    lookX = 0.6,
    lookY = 0,
    furLight = '#b45309',
    furDark = '#78350f',
    capColor = '#ef4444',
    seed = 0,
  } = opts;
  const blink = mood === 'chill' && (time + seed * 0.43) % 4.1 > 3.96;

  ctx.save();
  ctx.translate(x, y);

  // Big Ears with Rosy Inner Ear
  for (const ex of [-14, 14]) {
    ctx.fillStyle = furDark;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, 0, 6.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fda4af';
    ctx.beginPath();
    ctx.arc(ex * 0.96, 0.4, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head Fur with Gradient
  const fGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
  fGrad.addColorStop(0, furLight);
  fGrad.addColorStop(1, furDark);
  ctx.fillStyle = fGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Heart / Peanut Facial Mask
  const mGrad = ctx.createLinearGradient(0, -6, 0, 11);
  mGrad.addColorStop(0, '#fef3c7');
  mGrad.addColorStop(1, '#fcd34d');
  ctx.fillStyle = mGrad;
  ctx.beginPath();
  ctx.moveTo(1, -3.5);
  ctx.bezierCurveTo(-4, -10, -10.5, -5.5, -8.5, 0.5);
  ctx.bezierCurveTo(-11, 6, -5.5, 11.5, 1, 11);
  ctx.bezierCurveTo(7.5, 11.5, 12.5, 6, 10, 0.5);
  ctx.bezierCurveTo(11.5, -5.5, 5.5, -10, 1, -3.5);
  ctx.closePath();
  ctx.fill();

  // Eyes & Eyebrows
  if (mood === 'dizzy') {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-2, 0);
    ctx.moveTo(-2, -4);
    ctx.lineTo(-6, 0);
    ctx.moveTo(3, -4);
    ctx.lineTo(7, 0);
    ctx.moveTo(7, -4);
    ctx.lineTo(3, 0);
    ctx.stroke();

    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(1, 6, 4.2, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (const [idx, ex] of ([-4, 5] as const).entries()) {
      const side = idx === 0 ? -1 : 1;
      const ey = -2;
      if (blink) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, ey + 0.5, 2.8, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ex, ey, mood === 'panic' ? 3.8 : 3.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const px = ex + (mood === 'panic' ? Math.sin(time * 36 + side) * 1.1 : lookX * 1.2);
        const py = ey + (mood === 'panic' ? Math.cos(time * 30) * 1.0 : lookY * 1.0);
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(px, py, mood === 'panic' ? 1.3 : 1.7, 0, Math.PI * 2);
        ctx.fill();

        // Crisp white specular highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px - 0.6, py - 0.7, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyebrows
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      const browLift = mood === 'hyped' || mood === 'panic' ? -1.8 : 0;
      const browTilt = mood === 'nervous' ? side * 0.8 : mood === 'panic' ? -side * 1.1 : 0;
      ctx.beginPath();
      ctx.moveTo(ex - 2.6, ey - 4.4 + browLift - browTilt);
      ctx.lineTo(ex + 2.6, ey - 4.4 + browLift + browTilt);
      ctx.stroke();
    }

    // Mouth by mood
    if (mood === 'panic') {
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(1, 6, 4.4, 4.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(1, 8.2, 2.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'hyped') {
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(1, 4.2, 5.2, 0.08, Math.PI - 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, 4.4, 6, 1.8);
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(1, 8, 2.1, Math.PI, 0);
      ctx.fill();
    } else if (mood === 'nervous') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-3.5, 4.2, 9, 3.5, 1.5);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(1, 4.5, 4.5, 0.12, Math.PI - 0.12);
      ctx.stroke();
    }
  }

  // Nostrils
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.arc(-0.5, 2, 0.8, 0, Math.PI * 2);
  ctx.arc(2.5, 2, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Backwards Skater Cap
  if (hasCap) {
    ctx.fillStyle = capColor;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -4, 13.4, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Brim facing backwards
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(-11, -5);
    ctx.lineTo(-23, -2);
    ctx.lineTo(-20, 2);
    ctx.lineTo(-9, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.moveTo(-11, -5);
    ctx.lineTo(-22, -2.5);
    ctx.lineTo(-19.5, 1);
    ctx.lineTo(-9.5, -2.5);
    ctx.closePath();
    ctx.fill();
    // Tiny yellow banana pin on cap
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(4, -9.5, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawRagdoll(
  ctx: CanvasRenderingContext2D,
  r: RagdollState,
  color: string,
  name: string,
  time: number,
): void {
  const n = r.nodes;
  if (n.length < 11) return;

  const fur = getFurVariant(color);

  ctx.save();
  ctx.translate(r.boardX, r.boardY);
  ctx.rotate(r.boardAngle);
  drawSkateboard(ctx, false);
  ctx.restore();

  if (r.capLost) {
    ctx.save();
    ctx.translate(r.capX, r.capY);
    ctx.rotate(r.capAngle);
    ctx.fillStyle = fur.cap;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 11.5, Math.PI, 0);
    ctx.lineTo(-19, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Secondary-motion curved tail trailing pelvis velocity
  const pvx = n[2].x - n[2].oldX;
  const pvy = n[2].y - n[2].oldY;
  const tx = n[2].x - Math.max(-18, Math.min(18, pvx * 3.5)) - 14;
  const ty = n[2].y - Math.max(-18, Math.min(18, pvy * 3.5)) + Math.sin(time * 18) * 6;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8.5;
  ctx.beginPath();
  ctx.moveTo(n[2].x, n[2].y);
  ctx.quadraticCurveTo((n[2].x + tx) * 0.5, n[2].y - 12, tx, ty);
  ctx.stroke();
  ctx.strokeStyle = fur.dark;
  ctx.lineWidth = 5;
  ctx.stroke();

  const drawOutlinedLimb = (a: RagdollNode, b: RagdollNode, width: number, stroke: string) => {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = width + 3.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  // Back arm & back leg
  drawOutlinedLimb(n[1], n[3], 7.5, color);
  drawOutlinedLimb(n[3], n[4], 6.5, fur.dark);
  drawOutlinedLimb(n[2], n[7], 8, fur.dark);
  drawOutlinedLimb(n[7], n[8], 7, fur.dark);

  // Hoodie torso
  drawOutlinedLimb(n[1], n[2], 18, color);

  // Front arm & front leg
  drawOutlinedLimb(n[1], n[5], 7.5, color);
  drawOutlinedLimb(n[5], n[6], 6.5, fur.light);
  drawOutlinedLimb(n[2], n[9], 8, fur.light);
  drawOutlinedLimb(n[9], n[10], 7, fur.light);

  // Skate sneakers oriented along shins
  drawSneaker(ctx, n[8].x, n[8].y, Math.atan2(n[8].y - n[7].y, n[8].x - n[7].x) - Math.PI * 0.5, color);
  drawSneaker(ctx, n[10].x, n[10].y, Math.atan2(n[10].y - n[9].y, n[10].x - n[9].x) - Math.PI * 0.5, color);

  // Monkey paws
  drawMonkeyPaw(ctx, n[4].x, n[4].y, 4.6);
  drawMonkeyPaw(ctx, n[6].x, n[6].y, 4.6);

  // Head: panic screaming while flying fast, dizzy X eyes once slammed/settling
  const headSpeed = Math.hypot(n[0].x - n[0].oldX, n[0].y - n[0].oldY);
  const ragMood: MonkeyMood = headSpeed > 3.2 || r.elapsed < 0.7 ? 'panic' : 'dizzy';
  const headAngle = Math.atan2(n[1].y - n[0].y, n[1].x - n[0].x) - Math.PI * 0.5;
  ctx.save();
  ctx.translate(n[0].x, n[0].y);
  ctx.rotate(headAngle);
  drawMonkeyHead(ctx, 0, 0, ragMood, !r.capLost, {
    time,
    furLight: fur.light,
    furDark: fur.dark,
    capColor: fur.cap,
  });
  ctx.restore();

  for (let i = 0; i < 3; i++) {
    const a = time * 6 + i * ((Math.PI * 2) / 3);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('★', n[0].x + Math.cos(a) * 18 - 5, n[0].y - 20 + Math.sin(a) * 6);
  }

  if (name) {
    drawNameTag(ctx, n[0].x, n[0].y - 32, name, color);
  }

  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const alpha = Math.max(0, Math.min(1, p.life / 0.35));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  if (p.angle) ctx.rotate(p.angle);

  if (p.kind === 'poop') {
    ctx.font = `${Math.round(p.size * 1.9)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💩', 0, 0);
  } else if (p.kind === 'bone') {
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-p.size * 0.6, -2, p.size * 1.2, 4);
    ctx.beginPath();
    ctx.arc(-p.size * 0.6, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(-p.size * 0.6, 2, 2.5, 0, Math.PI * 2);
    ctx.arc(p.size * 0.6, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(p.size * 0.6, 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'star') {
    ctx.fillStyle = p.color;
    ctx.font = `bold ${Math.round(p.size * 1.6)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, 0);
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawXrayFlash(ctx: CanvasRenderingContext2D, xr: XrayFlash): void {
  const t = xr.life / xr.maxLife;
  ctx.save();
  ctx.globalAlpha = t * 0.92;
  ctx.translate(xr.x, xr.y);

  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, xr.radius);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
  grad.addColorStop(0.65, 'rgba(14, 165, 233, 0.45)');
  grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, xr.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 3;
  if (xr.part === 'skull') {
    ctx.beginPath();
    ctx.arc(0, -3, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-4, -4, 3, 0, Math.PI * 2);
    ctx.arc(4, -4, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-2, -1);
    ctx.moveTo(2, 1);
    ctx.lineTo(14, 6);
    ctx.stroke();
  }

  ctx.strokeStyle = '#fb7185';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(2, -2);
  ctx.lineTo(-3, 3);
  ctx.lineTo(6, 12);
  ctx.stroke();

  ctx.restore();
}
