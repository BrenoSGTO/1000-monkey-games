import type {
  FloatingCallout,
  MovingCar,
  Particle,
  RagdollNode,
  RagdollState,
  RemotePlayerState,
  SkaterMode,
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
  ollieCharge: number;
  activeTrick: TrickKind;
  trickTimer: number;
  boardFlip: number;
  grindBalance: number; // -1..1
  turboTimer: number;
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

  const viewHalfW = (w * 0.5) / camZoom + 320;
  const viewMinX = camX - viewHalfW;
  const viewMaxX = camX + viewHalfW;

  // 4. Props behind terrain (poles, billboards, signs, parked cars)
  for (const prop of track.props) {
    if (prop.x + prop.width < viewMinX || prop.x - prop.width > viewMaxX) continue;
    drawProp(ctx, prop);
  }

  // 5. Terrain body & surface
  drawTerrain(ctx, track, viewMinX, viewMaxX, camY + (h * 0.6) / camZoom + 500);

  // 6. Finish Banner for Ladeira
  if (track.finishX !== undefined) {
    drawFinishGate(ctx, track, track.finishX);
  }

  // 7. Grind Rails
  for (const rail of track.rails) {
    const first = rail.points[0];
    const last = rail.points[rail.points.length - 1];
    if (!first || !last) continue;
    if (last.x < viewMinX || first.x > viewMaxX) continue;
    drawRail(ctx, rail.points, rail.color ?? '#facc15');
  }

  // 8. Turbo Banana Pads
  for (const pad of track.turboBananas) {
    if (pad.x < viewMinX || pad.x > viewMaxX) continue;
    if (pad.cooldown <= 0) {
      drawBananaItem(ctx, pad.x, pad.y - 12, true, time);
    }
  }

  // 9. Player-thrown mischievous Banana Peels
  for (const b of state.thrownBananas) {
    if (b.x < viewMinX || b.x > viewMaxX) continue;
    drawBananaItem(ctx, b.x, b.y - 8, false, time, b.ownerName);
  }

  // 10. Moving Traffic Cars
  for (const car of state.cars) {
    if (car.x + car.width < viewMinX || car.x - car.width > viewMaxX) continue;
    drawMovingCar(ctx, car, time);
  }

  // 11. Remote Multiplayer Skaters
  for (const remote of state.remotes) {
    if (remote.snap.trackId !== track.id) continue;
    drawRemoteSkater(ctx, remote, time);
  }

  // 12. Local Skater or Ragdoll
  drawLocalSkater(ctx, state.local, time);

  // 13. Particles
  for (const p of state.particles) {
    drawParticle(ctx, p);
  }

  // 14. X-Ray Flashes
  for (const xr of state.xrays) {
    drawXrayFlash(ctx, xr);
  }

  // 15. Floating Callouts
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
      // Colorful morro houses silhouette
      const bh = 55 + ((i * 29) % 50);
      ctx.fillRect(sx - 28, sy - bh, 56, bh + 120);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx - 14, sy - bh + 14, 8, 10);
      ctx.fillRect(sx + 6, sy - bh + 14, 8, 10);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    } else {
      // Palm tree silhouette
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

function drawRail(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color: string): void {
  ctx.save();
  // Support legs
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 5;
  for (let i = 0; i < pts.length; i++) {
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i].x, pts[i].y + 42);
    ctx.stroke();
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
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, prop: TrackProp): void {
  const { x, y, width, height, kind } = prop;
  ctx.save();
  switch (kind) {
    case 'pole': {
      ctx.fillStyle = '#475569';
      ctx.fillRect(x - 5, y - height, 10, height);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x - 5, y - height, 36, 8);
      // Warm street lamp glow
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
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
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
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#1e293b' : '#334155';
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(x - width * 0.5, y - 18 * (i + 1), width, 17, 7);
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
      ctx.fillRect(x - width * 0.5, y - height + 18, width, height - 18);
      ctx.strokeRect(x - width * 0.5, y - height + 18, width, height - 18);
      // Striped awning
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x - width * 0.54, y - height, width * 1.08, 18);
      ctx.strokeRect(x - width * 0.54, y - height, width * 1.08, 18);
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🌭 DOGÃO', x, y - 16);
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
  // Headlight beam
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
  // Little roof siren flash
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
  // Banana crescent
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
    return;
  }

  drawMonkeyOnBoard(ctx, {
    x: sk.x,
    y: sk.y,
    angle: sk.angle,
    facing: sk.facing,
    color: sk.color,
    ollieCharge: sk.ollieCharge,
    activeTrick: sk.activeTrick,
    trickTimer: sk.trickTimer,
    boardFlip: sk.boardFlip,
    isGrinding: sk.mode === 'grinding',
    isTurbo: sk.turboTimer > 0,
    time,
  });

  // Ollie charge bar under feet
  if (sk.ollieCharge > 0.05) {
    ctx.save();
    ctx.translate(sk.x, sk.y + 18);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(-26, 0, 52, 8);
    ctx.fillStyle = sk.ollieCharge > 0.8 ? '#fb7185' : '#facc15';
    ctx.fillRect(-24, 2, 48 * sk.ollieCharge, 4);
    ctx.restore();
  }

  // Grind balance meter above monkey
  if (sk.mode === 'grinding') {
    ctx.save();
    ctx.translate(sk.x, sk.y - 98);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 14, 28, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.strokeStyle = Math.abs(sk.grindBalance) > 0.72 ? '#fb7185' : '#4ade80';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 14, 28, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Pointer dot
    const a = Math.PI * 1.5 + sk.grindBalance * (Math.PI * 0.35);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 28, 14 + Math.sin(a) * 28, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
      capLost: true,
      elapsed: 1,
      settleTime: 0,
      currentCrashScore: 0,
      currentBonesBroken: 0,
    };
    drawRagdoll(ctx, fakeRagdoll, remote.color, remote.name, time);
  } else {
    drawMonkeyOnBoard(ctx, {
      x: s.x,
      y: s.y,
      angle: s.angle,
      facing: s.facing,
      color: remote.color,
      ollieCharge: s.ollieCharge,
      activeTrick: s.activeTrick,
      trickTimer: s.trickTimer,
      boardFlip: s.boardFlip,
      isGrinding: s.mode === 'grinding',
      isTurbo: false,
      time,
    });
    drawNameTag(ctx, s.x, s.y - 95, remote.name, remote.color);
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
  angle: number;
  facing: 1 | -1;
  color: string;
  ollieCharge: number;
  activeTrick: TrickKind;
  trickTimer: number;
  boardFlip: number;
  isGrinding: boolean;
  isTurbo: boolean;
  time: number;
}

function drawMonkeyOnBoard(ctx: CanvasRenderingContext2D, o: MonkeyBoardDrawOpts): void {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.angle);
  ctx.scale(o.facing, 1);

  const crouch = o.ollieCharge * 13 + (o.activeTrick === 'bananagrab' ? 12 : 0);
  const christLift = o.activeTrick === 'christair' ? -18 : 0;

  // Tail
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, -24 + crouch + christLift);
  ctx.quadraticCurveTo(-30, -30 + Math.sin(o.time * 10) * 8, -28, -48 + crouch);
  ctx.stroke();

  // Skateboard (offset to side during Christ Air, spinning during Kickflip!)
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
    ctx.ellipse(0, -86 + christLift, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Legs
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const hipY = -22 + crouch + christLift;
  ctx.beginPath();
  ctx.moveTo(-5, hipY);
  ctx.lineTo(-12 + crouch * 0.3, -14 + christLift * 0.7);
  ctx.lineTo(-10, -6 + christLift * 0.5);
  ctx.moveTo(5, hipY);
  ctx.lineTo(13 + crouch * 0.2, -14 + christLift * 0.7);
  ctx.lineTo(10, -6 + christLift * 0.5);
  ctx.stroke();

  // Sneakers
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-10, -6 + christLift * 0.5, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(11, -6 + christLift * 0.5, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Torso (Hoodie)
  const chestY = -44 + crouch + christLift;
  ctx.fillStyle = o.color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-12, chestY, 24, 24, 9);
  ctx.fill();
  ctx.stroke();

  // Arms
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  if (o.activeTrick === 'christair') {
    // T-pose!
    ctx.moveTo(-10, chestY + 6);
    ctx.lineTo(-32, chestY + 4);
    ctx.moveTo(10, chestY + 6);
    ctx.lineTo(30, chestY + 4);
  } else if (o.activeTrick === 'bananagrab') {
    // Grabbing board!
    ctx.moveTo(10, chestY + 6);
    ctx.lineTo(18, -8);
    ctx.moveTo(-10, chestY + 6);
    ctx.lineTo(-22, chestY - 8);
  } else {
    const wave = o.isGrinding ? Math.sin(o.time * 22) * 8 : 0;
    ctx.moveTo(-10, chestY + 6);
    ctx.lineTo(-22, chestY + 12 + wave);
    ctx.moveTo(10, chestY + 6);
    ctx.lineTo(22, chestY + 10 - wave);
  }
  ctx.stroke();

  // Head
  drawMonkeyHead(ctx, 2, chestY - 12, false, true);

  ctx.restore();
}

function drawSkateboard(ctx: CanvasRenderingContext2D, turbo: boolean): void {
  // Wheels & Trucks
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

  // Deck
  ctx.fillStyle = '#facc15';
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

function drawMonkeyHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dizzy: boolean,
  hasCap: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);

  // Ears
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-14, 0, 6, 0, Math.PI * 2);
  ctx.arc(14, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Skull
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tan face mask
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(1, 4, 10, 7, 0, 0, Math.PI * 2);
  ctx.arc(-4, -2, 4.5, 0, Math.PI * 2);
  ctx.arc(5, -2, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  if (dizzy) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
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
    // Screaming O mouth
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(1, 6, 4, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4, -2, 3.2, 0, Math.PI * 2);
    ctx.arc(5, -2, 3.2, 0, Math.PI * 2);
    ctx.fill();
    // Goofy slightly cross-eyed pupils
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-3, -2, 1.6, 0, Math.PI * 2);
    ctx.arc(6.2, -2.4, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // Grin
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(1, 5, 4.5, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  // Backwards red cap
  if (hasCap) {
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -4, 13, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Backwards visor
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-11, -5);
    ctx.lineTo(-23, -2);
    ctx.lineTo(-20, 2);
    ctx.lineTo(-9, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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

  // 1. Tumbling skateboard
  ctx.save();
  ctx.translate(r.boardX, r.boardY);
  ctx.rotate(r.boardAngle);
  drawSkateboard(ctx, false);
  ctx.restore();

  // 2. Flying cap
  if (r.capLost) {
    ctx.save();
    ctx.translate(r.capX, r.capY);
    ctx.rotate(r.capAngle);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, Math.PI, 0);
    ctx.lineTo(-18, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 3. Limbs
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawLimb = (a: RagdollNode, b: RagdollNode, width: number, stroke: string) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  // Back arm & leg
  drawLimb(n[1], n[3], 8, '#78350f');
  drawLimb(n[3], n[4], 7, '#78350f');
  drawLimb(n[2], n[7], 9, '#78350f');
  drawLimb(n[7], n[8], 8, '#78350f');

  // Torso hoodie between chest (1) and pelvis (2)
  drawLimb(n[1], n[2], 21, '#0f172a');
  drawLimb(n[1], n[2], 16, color);

  // Front arm & leg
  drawLimb(n[1], n[5], 8, '#92400e');
  drawLimb(n[5], n[6], 7, '#92400e');
  drawLimb(n[2], n[9], 9, '#92400e');
  drawLimb(n[9], n[10], 8, '#92400e');

  // Shoes & hands
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(n[8].x, n[8].y, 6, 0, Math.PI * 2);
  ctx.arc(n[10].x, n[10].y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(n[4].x, n[4].y, 5, 0, Math.PI * 2);
  ctx.arc(n[6].x, n[6].y, 5, 0, Math.PI * 2);
  ctx.fill();

  // Head
  const headAngle = Math.atan2(n[1].y - n[0].y, n[1].x - n[0].x) - Math.PI * 0.5;
  ctx.save();
  ctx.translate(n[0].x, n[0].y);
  ctx.rotate(headAngle);
  drawMonkeyHead(ctx, 0, 0, true, !r.capLost);
  ctx.restore();

  // Dizzy stars above head
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

  // Glowing cyan X-ray circle
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, xr.radius);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.85)');
  grad.addColorStop(0.65, 'rgba(14, 165, 233, 0.45)');
  grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, xr.radius, 0, Math.PI * 2);
  ctx.fill();

  // Skeleton icon + crack lines
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
    // Broken bone
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-2, -1);
    ctx.moveTo(2, 1);
    ctx.lineTo(14, 6);
    ctx.stroke();
  }

  // Red fracture zigzag
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
