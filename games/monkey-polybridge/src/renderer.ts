import { GRID_SIZE, WORLD_H, WORLD_W } from './levels';
import { computeBeamCost, MATERIALS, stressColor } from './materials';
import type { BridgePhysicsWorld } from './physics';
import type {
  BridgeBeam,
  BridgeNode,
  MaterialId,
  RagdollMonkey,
  RemoteCursor,
  ToolId,
  VehicleRuntime,
} from './types';

export interface BuildPreviewState {
  mode: 'build' | 'sim';
  showGrid: boolean;
  tool: ToolId;
  hoverWorld: { x: number; y: number } | null;
  snapPoint: { x: number; y: number; nodeId: string | null } | null;
  dragStart: { x: number; y: number; nodeId: string | null } | null;
  hoverBeamId: string | null;
  budgetLeft: number;
  remoteCursors: Map<string, RemoteCursor>;
}

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeViewport(canvasW: number, canvasH: number): ViewportTransform {
  const scale = Math.min(canvasW / WORLD_W, canvasH / WORLD_H);
  const offsetX = (canvasW - WORLD_W * scale) * 0.5;
  const offsetY = (canvasH - WORLD_H * scale) * 0.5;
  return { scale, offsetX, offsetY };
}

export function screenToWorld(
  sx: number,
  sy: number,
  vp: ViewportTransform,
): { x: number; y: number } {
  return {
    x: (sx - vp.offsetX) / vp.scale,
    y: (sy - vp.offsetY) / vp.scale,
  };
}

export function renderBridgeWorld(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  world: BridgePhysicsWorld,
  preview: BuildPreviewState,
  shakeAmount: number,
  timeSec: number,
): ViewportTransform {
  const vp = computeViewport(canvasW, canvasH);

  ctx.save();
  ctx.fillStyle = '#071324';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const shakeX = shakeAmount > 0.2 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;
  const shakeY = shakeAmount > 0.2 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;

  ctx.translate(vp.offsetX + shakeX, vp.offsetY + shakeY);
  ctx.scale(vp.scale, vp.scale);

  // Clip to logical world
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, WORLD_H);
  ctx.clip();

  drawSkyAndJungle(ctx, timeSec);
  drawBoatClearanceZone(ctx, world, preview.mode, timeSec);
  drawGrid(ctx, preview.showGrid && preview.mode === 'build');
  drawTerrain(ctx, world);
  drawFinishFlag(ctx, world, timeSec);
  drawWaterBack(ctx, world, timeSec);

  // Boat behind front waves
  if (world.boat) {
    drawPirateBoat(ctx, world, timeSec);
  }

  // Bridge beams & nodes
  drawBeams(ctx, world, preview, timeSec);
  drawSplinters(ctx, world);
  drawNodes(ctx, world, preview);

  // Build ghost preview
  if (preview.mode === 'build') {
    drawBuildPreview(ctx, world, preview);
  }

  // Vehicles & ragdolls
  for (const v of world.vehicles) {
    if (v.spawned) {
      drawVehicle(ctx, v, timeSec);
    }
  }
  for (const r of world.ragdolls) {
    drawRagdollMonkey(ctx, r);
  }

  // Crocodiles & front water ripples
  drawCrocodiles(ctx, world, timeSec);
  drawWaterFront(ctx, world, timeSec);

  // Particles & floating comic texts
  drawParticles(ctx, world);
  drawFloatingTexts(ctx, world);

  // Remote Co-op Cursors
  drawRemoteCursors(ctx, preview.remoteCursors, timeSec);

  ctx.restore();
  return vp;
}

function drawSkyAndJungle(ctx: CanvasRenderingContext2D, timeSec: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, '#0ea5e9');
  sky.addColorStop(0.58, '#bae6fd');
  sky.addColorStop(0.84, '#fef3c7');
  sky.addColorStop(1, '#fde68a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Sun
  ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
  ctx.beginPath();
  ctx.arc(1030, 108, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(1030, 108, 44, 0, Math.PI * 2);
  ctx.fill();

  // Drifting Clouds
  const clouds = [
    { baseX: 160, y: 95, scale: 1.0, speed: 9 },
    { baseX: 540, y: 72, scale: 1.25, speed: 6 },
    { baseX: 880, y: 122, scale: 0.85, speed: 11 },
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  for (const c of clouds) {
    const cx = ((c.baseX + timeSec * c.speed) % (WORLD_W + 220)) - 110;
    ctx.beginPath();
    ctx.ellipse(cx, c.y, 48 * c.scale, 18 * c.scale, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 26 * c.scale, c.y + 5, 30 * c.scale, 14 * c.scale, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 28 * c.scale, c.y + 4, 34 * c.scale, 15 * c.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant Jungle Hills
  ctx.fillStyle = 'rgba(21, 128, 61, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, 480);
  ctx.quadraticCurveTo(220, 355, 470, 470);
  ctx.quadraticCurveTo(730, 365, 990, 465);
  ctx.quadraticCurveTo(1110, 415, WORLD_W, 460);
  ctx.lineTo(WORLD_W, WORLD_H);
  ctx.lineTo(0, WORLD_H);
  ctx.closePath();
  ctx.fill();
}

function drawBoatClearanceZone(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  mode: 'build' | 'sim',
  timeSec: number,
): void {
  const bh = world.level.boatHazard;
  if (!bh || mode !== 'build') return;

  const x1 = bh.startX - bh.width * 0.45;
  const x2 = bh.endX + bh.width * 0.45;
  const y1 = bh.mastTopY;
  const y2 = world.level.waterY;

  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -timeSec * 24;
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.setLineDash([]);

  ctx.fillStyle = '#b91c1c';
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    '⚠️ ROTA DO BARCO PIRATA — CONSTRUA ACIMA DESTA LINHA!',
    (x1 + x2) * 0.5,
    y1 - 8,
  );
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, enabled: boolean): void {
  if (!enabled) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.11)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(ctx: CanvasRenderingContext2D, world: BridgePhysicsWorld): void {
  for (const poly of world.level.terrainPolygons) {
    ctx.save();
    ctx.beginPath();
    poly.points.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();

    if (poly.kind === 'tower') {
      ctx.fillStyle = '#78350f';
      ctx.fill();
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Wooden cross braces on tower
      const xs = poly.points.map((p) => p[0]);
      const ys = poly.points.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 3;
      for (let y = minY + 18; y < maxY - 12; y += 26) {
        ctx.beginPath();
        ctx.moveTo(minX + 3, y);
        ctx.lineTo(maxX - 3, y + 18);
        ctx.stroke();
      }
    } else if (poly.kind === 'pier') {
      ctx.fillStyle = '#475569';
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      const grad = ctx.createLinearGradient(0, 440, 0, WORLD_H);
      grad.addColorStop(0, '#78350f');
      grad.addColorStop(1, '#451a03');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#291002';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Grassy/road top caps on horizontal terrain segments
  for (const seg of world.level.terrainSegments) {
    if (Math.abs(seg.y1 - seg.y2) < 4) {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(minX, seg.y1 - 4, maxX - minX, 12);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(minX, seg.y1 - 4, maxX - minX, 5);
    }
  }
}

function drawFinishFlag(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  timeSec: number,
): void {
  const fx = world.level.finishX;
  let fy = 440;
  for (const seg of world.level.terrainSegments) {
    if (Math.abs(seg.y1 - seg.y2) < 4 && fx >= seg.x1 && fx <= seg.x2) {
      fy = seg.y1;
      break;
    }
  }

  ctx.save();
  // Pole
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(fx - 3, fy - 88, 6, 88);
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(fx, fy - 90, 6, 0, Math.PI * 2);
  ctx.fill();

  // Waving Banana Flag
  const wave = Math.sin(timeSec * 5) * 4;
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.moveTo(fx + 3, fy - 86);
  ctx.quadraticCurveTo(fx + 28, fy - 90 + wave, fx + 54, fy - 80 - wave);
  ctx.lineTo(fx + 54, fy - 52 - wave);
  ctx.quadraticCurveTo(fx + 28, fy - 62 + wave, fx + 3, fy - 56);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('🏁', fx + 18, fy - 64);

  // Cheering sign
  ctx.fillStyle = 'rgba(15,23,42,0.75)';
  ctx.fillRect(fx - 30, fy - 24, 64, 18);
  ctx.fillStyle = '#fef08a';
  ctx.font = '800 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHEGADA', fx + 2, fy - 11);
  ctx.restore();
}

function drawWaterBack(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  timeSec: number,
): void {
  const wy = world.level.waterY;
  const grad = ctx.createLinearGradient(0, wy, 0, WORLD_H);
  grad.addColorStop(0, 'rgba(14, 165, 233, 0.78)');
  grad.addColorStop(1, 'rgba(12, 74, 110, 0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, wy, WORLD_W, WORLD_H - wy);

  // Surface shimmer
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_W; x += 20) {
    const y = wy + Math.sin(x * 0.04 + timeSec * 3) * 3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawWaterFront(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  timeSec: number,
): void {
  const wy = world.level.waterY;
  ctx.fillStyle = 'rgba(2, 132, 199, 0.34)';
  ctx.fillRect(0, wy + 12, WORLD_W, WORLD_H - wy - 12);

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 2; row++) {
    const ry = wy + 26 + row * 28;
    ctx.beginPath();
    for (let x = 330; x <= 870; x += 30) {
      const y = ry + Math.sin(x * 0.05 - timeSec * (2.5 + row)) * 2.5;
      if (x === 330) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawPirateBoat(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  timeSec: number,
): void {
  const boat = world.boat;
  if (!boat) return;
  const bob = Math.sin(timeSec * 3.5) * 3;
  const dir = boat.speed >= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(boat.x, boat.y + bob);
  ctx.scale(dir, 1);

  // Hull
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-54, -22);
  ctx.lineTo(58, -22);
  ctx.lineTo(42, 6);
  ctx.lineTo(-42, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Gold stripe
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-46, -15, 92, 5);

  // Tall Mast (matches mastTopY)
  const mastH = boat.y - boat.mastTopY;
  ctx.fillStyle = '#92400e';
  ctx.fillRect(-4, -mastH, 8, mastH - 20);

  // Sail
  ctx.fillStyle = '#fef9c3';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -mastH + 14);
  ctx.quadraticCurveTo(42, -mastH * 0.6, 4, -36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('🍌', 8, -mastH * 0.55);

  // Pirate flag at very top
  ctx.fillStyle = '#111827';
  ctx.fillRect(4, -mastH, 26, 16);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('☠️', 9, -mastH + 12);

  ctx.restore();
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  preview: BuildPreviewState,
  timeSec: number,
): void {
  for (const b of world.beams) {
    if (b.broken) continue;
    const nA = world.nodes.get(b.nodeAId);
    const nB = world.nodes.get(b.nodeBId);
    if (!nA || !nB) continue;
    drawSingleBeam(ctx, b, nA, nB, preview, timeSec);
  }
}

function drawSingleBeam(
  ctx: CanvasRenderingContext2D,
  b: BridgeBeam,
  nA: BridgeNode,
  nB: BridgeNode,
  preview: BuildPreviewState,
  timeSec: number,
): void {
  const mat = MATERIALS[b.material];
  const dx = nB.x - nA.x;
  const dy = nB.y - nA.y;
  const dist = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy, dx);
  const isHoveredDelete =
    preview.mode === 'build' && preview.hoverBeamId === b.id && preview.tool === 'eraser';

  let col = preview.mode === 'sim' ? stressColor(b.stress, mat.baseColor) : mat.baseColor;
  if (isHoveredDelete) col = '#fb7185';
  const pulse =
    preview.mode === 'sim' && b.stress > 0.8 ? 1 + Math.sin(timeSec * 24) * 0.15 : 1;

  ctx.save();

  // Vine sagging catenary when slack!
  if (b.material === 'vine' && dist < b.restLength - 1.5) {
    const slack = b.restLength - dist;
    const sag = Math.min(48, Math.sqrt(slack * b.restLength) * 0.45);
    const mx = (nA.x + nB.x) * 0.5;
    const my = (nA.y + nB.y) * 0.5 + sag;
    ctx.strokeStyle = col;
    ctx.lineWidth = mat.thickness * pulse;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(nA.x, nA.y);
    ctx.quadraticCurveTo(mx, my, nB.x, nB.y);
    ctx.stroke();

    // Little leaves
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(mx, my * 0.5 + ((nA.y + nB.y) * 0.5) * 0.5, 5, 2.5, angle + 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.translate(nA.x, nA.y);
  ctx.rotate(angle);

  if (b.material === 'spring') {
    // Coiled mattress spring zig-zag!
    const squish = b.springSquish * 4;
    const coils = Math.max(5, Math.floor(dist / 13));
    const amp = 7 + squish;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i < coils; i++) {
      const px = (i / coils) * dist;
      const py = i % 2 === 0 ? -amp : amp;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(dist, 0);
    ctx.stroke();

    ctx.strokeStyle = col;
    ctx.lineWidth = 3.5 * pulse;
    ctx.stroke();

    // Top bounce pad plate
    ctx.fillStyle = '#facc15';
    ctx.fillRect(4, -7, Math.max(8, dist - 8), 4);
  } else {
    // Outline
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = (mat.thickness + 3) * pulse;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dist, 0);
    ctx.stroke();

    // Core beam
    ctx.strokeStyle = col;
    ctx.lineWidth = mat.thickness * pulse;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dist, 0);
    ctx.stroke();

    // Material Texture Accents
    if (b.material === 'bamboo') {
      ctx.strokeStyle = '#365314';
      ctx.lineWidth = 2;
      for (let x = 18; x < dist - 10; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, -3.5);
        ctx.lineTo(x, 3.5);
        ctx.stroke();
      }
    } else if (b.material === 'steel') {
      ctx.fillStyle = '#ea580c';
      for (let x = 16; x < dist - 12; x += 24) {
        ctx.beginPath();
        ctx.arc(x, 0, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (b.material === 'road') {
      ctx.fillStyle = '#451a03';
      for (let x = 14; x < dist - 10; x += 18) {
        ctx.fillRect(x, -4.5, 2, 9);
      }
    } else if (b.material === 'vine') {
      ctx.fillStyle = '#4ade80';
      for (let x = 22; x < dist - 16; x += 32) {
        ctx.beginPath();
        ctx.ellipse(x, -4, 4, 2, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();

  // High stress % callout during simulation
  if (preview.mode === 'sim' && b.stress > 0.68) {
    ctx.save();
    const mx = (nA.x + nB.x) * 0.5;
    const my = (nA.y + nB.y) * 0.5 - 12;
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = b.stress > 0.85 ? '#ef4444' : '#fde047';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    const pct = `${Math.min(99, Math.round(b.stress * 100))}%`;
    ctx.strokeText(pct, mx, my);
    ctx.fillText(pct, mx, my);
    ctx.restore();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  preview: BuildPreviewState,
): void {
  for (const n of world.nodes.values()) {
    const isSnapped = preview.mode === 'build' && preview.snapPoint?.nodeId === n.id;
    const r = n.fixed ? 8 : 5.5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, isSnapped ? r + 3 : r, 0, Math.PI * 2);
    ctx.fillStyle = n.fixed ? '#f97316' : n.authorColor ?? '#facc15';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isSnapped ? '#ffffff' : '#451a03';
    ctx.stroke();

    if (n.fixed) {
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBuildPreview(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  preview: BuildPreviewState,
): void {
  if (preview.tool === 'eraser') {
    if (preview.hoverWorld) {
      ctx.save();
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(preview.hoverWorld.x, preview.hoverWorld.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  const mat = MATERIALS[preview.tool as MaterialId];
  if (preview.snapPoint && !preview.dragStart) {
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(preview.snapPoint.x, preview.snapPoint.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (preview.dragStart && preview.snapPoint) {
    const dx = preview.snapPoint.x - preview.dragStart.x;
    const dy = preview.snapPoint.y - preview.dragStart.y;
    const len = Math.hypot(dx, dy);
    const cost = computeBeamCost(mat.id, len);
    const tooLong = len > mat.maxLength;
    const tooShort = len < 14;
    const noMoney = cost > preview.budgetLeft;
    const valid = !tooLong && !tooShort && !noMoney;

    ctx.save();
    // Max reach circle
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(preview.dragStart.x, preview.dragStart.y, mat.maxLength, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ghost beam
    ctx.strokeStyle = valid ? '#4ade80' : '#ef4444';
    ctx.lineWidth = mat.thickness;
    ctx.globalAlpha = 0.72;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(preview.dragStart.x, preview.dragStart.y);
    ctx.lineTo(preview.snapPoint.x, preview.snapPoint.y);
    ctx.stroke();

    // Cost tag
    ctx.globalAlpha = 1;
    const mx = (preview.dragStart.x + preview.snapPoint.x) * 0.5;
    const my = (preview.dragStart.y + preview.snapPoint.y) * 0.5 - 16;
    const label = tooLong
      ? `Muito longo! (${Math.round(len)}/${mat.maxLength})`
      : noMoney
        ? `Sem bananas! (${cost}🍌)`
        : `${mat.emoji} ${cost}🍌`;
    ctx.font = '800 12px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = valid ? 'rgba(15,23,42,0.88)' : 'rgba(127,29,29,0.92)';
    ctx.strokeStyle = valid ? '#4ade80' : '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mx - w * 0.5, my - 13, w, 20, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = valid ? '#fef08a' : '#fecaca';
    ctx.textAlign = 'center';
    ctx.fillText(label, mx, my + 1);
    ctx.restore();
  }
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  v: VehicleRuntime,
  timeSec: number,
): void {
  const rx = v.wheelRear.x;
  const ry = v.wheelRear.y;
  const fx = v.wheelFront.x;
  const fy = v.wheelFront.y;
  const cx = (rx + fx) * 0.5;
  const cy = (ry + fy) * 0.5;
  const angle = Math.atan2(fy - ry, fx - rx);
  const panic = v.panicLevel > 0.65 || (!v.wheelRear.grounded && !v.wheelFront.grounded);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  if (v.kind === 'cart') {
    // Wooden banana cart!
    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-28, -22, 56, 18, 4);
    ctx.fill();
    ctx.stroke();

    // Pile of bananas
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('🍌', -24, -22);
    ctx.fillText('🍌', -10, -25);
    if (!v.ejected) {
      drawMonkeyHead(ctx, 10, -28, 9, panic);
      // Hard hat
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(10, -32, 8, Math.PI, 0);
      ctx.fill();
    }
  } else if (v.kind === 'kombi') {
    // Hippie Banana Kombi!
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.roundRect(-42, -38, 84, 34, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-41, -18, 82, 8);

    // 3 Windows + 4 goofy monkeys inside
    const winXs = [-33, -10, 13];
    for (let i = 0; i < winXs.length; i++) {
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(winXs[i], -33, 18, 13);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(winXs[i], -33, 18, 13);
      if (!v.ejected) {
        drawMonkeyHead(ctx, winXs[i] + 9, -26, 6.5, panic);
      }
    }
    if (!v.ejected) {
      // Bonus monkey peeking on roof!
      drawMonkeyHead(ctx, -6, -42, 6, panic);
    }
  } else if (v.kind === 'tanker') {
    // Heavy Coconut Tanker Truck!
    // Cab
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(14, -36, 30, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(24, -31, 16, 12);
    if (!v.ejected) {
      drawMonkeyHead(ctx, 31, -24, 6.2, panic);
    }

    // Giant Coconut Tank
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#291002';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-48, -44, 60, 36, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef9c3';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🥥 COCO 8T', -18, -23);
  } else if (v.kind === 'moped') {
    // Turbo Moped!
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-20, -16, 38, 12, 6);
    ctx.fill();
    ctx.stroke();
    // Handlebars
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(12, -16);
    ctx.lineTo(18, -28);
    ctx.stroke();

    if (!v.ejected) {
      // Scarf flapping
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-2, -22);
      ctx.lineTo(-20, -24 + Math.sin(timeSec * 20) * 4);
      ctx.stroke();
      drawMonkeyHead(ctx, 2, -28, 9, panic);
      // Aviator goggles
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-5, -32, 14, 5);
    }
  }

  ctx.restore();

  // Wheels drawn at true Verlet positions
  drawWheel(ctx, v.wheelRear.x, v.wheelRear.y, v.wheelRear.radius, v.wheelRear.angle);
  drawWheel(ctx, v.wheelFront.x, v.wheelFront.y, v.wheelFront.radius, v.wheelFront.angle);
}

function drawWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 0);
  ctx.lineTo(r * 0.7, 0);
  ctx.moveTo(0, -r * 0.7);
  ctx.lineTo(0, r * 0.7);
  ctx.stroke();
  ctx.restore();
}

function drawMonkeyHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  panic: boolean,
  furColor = '#78350f',
): void {
  ctx.save();
  ctx.translate(x, y);
  // Ears
  ctx.fillStyle = furColor;
  ctx.beginPath();
  ctx.arc(-r * 0.95, 0, r * 0.42, 0, Math.PI * 2);
  ctx.arc(r * 0.95, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.28, r * 0.72, r * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();

  // Googly eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.18, r * 0.28, 0, Math.PI * 2);
  ctx.arc(r * 0.32, -r * 0.18, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  const pupilOffset = panic ? (Math.random() - 0.5) * 1.4 : 0.6;
  ctx.beginPath();
  ctx.arc(-r * 0.28 + pupilOffset, -r * 0.18, r * 0.13, 0, Math.PI * 2);
  ctx.arc(r * 0.36 - pupilOffset, -r * 0.18, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  if (panic) {
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.42, r * 0.28, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, r * 0.24, r * 0.3, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRagdollMonkey(ctx: CanvasRenderingContext2D, r: RagdollMonkey): void {
  ctx.save();
  ctx.strokeStyle = r.tint;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';

  // Torso & limbs
  ctx.beginPath();
  ctx.moveTo(r.head.x, r.head.y);
  ctx.lineTo(r.hip.x, r.hip.y);
  ctx.moveTo(r.head.x, r.head.y + 4);
  ctx.lineTo(r.handL.x, r.handL.y);
  ctx.moveTo(r.head.x, r.head.y + 4);
  ctx.lineTo(r.handR.x, r.handR.y);
  ctx.moveTo(r.hip.x, r.hip.y);
  ctx.lineTo(r.footL.x, r.footL.y);
  ctx.moveTo(r.hip.x, r.hip.y);
  ctx.lineTo(r.footR.x, r.footR.y);
  ctx.stroke();

  drawMonkeyHead(ctx, r.head.x, r.head.y, 9.5, true, r.tint);

  if (r.shoutTimer > 0) {
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 3;
    ctx.strokeText(r.shout, r.head.x, r.head.y - 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(r.shout, r.head.x, r.head.y - 16);
  }
  ctx.restore();
}

function drawCrocodiles(
  ctx: CanvasRenderingContext2D,
  world: BridgePhysicsWorld,
  timeSec: number,
): void {
  for (const c of world.crocodiles) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.dir, 1);

    const jawAngle =
      c.laughTimer > 0
        ? 0.38 + Math.abs(Math.sin(timeSec * 16)) * 0.35
        : 0.1 + Math.abs(Math.sin(timeSec * 2 + c.phase)) * 0.08;

    // Body
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.ellipse(-6, 4, 34, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(4, -7, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(5, -7, 2, 0, Math.PI * 2);
    ctx.fill();

    // Upper Jaw
    ctx.save();
    ctx.translate(12, 0);
    ctx.rotate(-jawAngle);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(30, -5);
    ctx.lineTo(26, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Lower Jaw
    ctx.save();
    ctx.translate(12, 4);
    ctx.rotate(jawAngle * 0.7);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 4);
    ctx.lineTo(24, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    if (c.laughTimer > 0) {
      ctx.save();
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      const bounceY = c.y - 22 - Math.abs(Math.sin(timeSec * 12)) * 6;
      ctx.strokeText('HAHAHA!', c.x + 10, bounceY);
      ctx.fillStyle = '#fef08a';
      ctx.fillText('HAHAHA!', c.x + 10, bounceY);
      ctx.restore();
    }
  }
}

function drawSplinters(ctx: CanvasRenderingContext2D, world: BridgePhysicsWorld): void {
  for (const s of world.splinters) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = s.thickness + 2;
    ctx.beginPath();
    ctx.moveTo(-s.length * 0.5, 0);
    ctx.lineTo(s.length * 0.5, 0);
    ctx.stroke();

    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.thickness;
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, world: BridgePhysicsWorld): void {
  for (const p of world.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    if (p.kind === 'banana') {
      ctx.font = `${Math.round(p.size * 2.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🍌', 0, 0);
    } else if (p.kind === 'confetti') {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, world: BridgePhysicsWorld): void {
  for (const ft of world.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
    ctx.font = `900 ${ft.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function drawRemoteCursors(
  ctx: CanvasRenderingContext2D,
  cursors: Map<string, RemoteCursor>,
  timeSec: number,
): void {
  const now = performance.now();
  for (const c of cursors.values()) {
    if (now - c.lastSeen > 5000) continue;
    ctx.save();
    ctx.translate(c.x, c.y);

    // Pulsing ring
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10 + Math.sin(timeSec * 6) * 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Pointer dot
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Nameplate
    const emoji = c.tool === 'eraser' ? '🧽' : MATERIALS[c.tool].emoji;
    const tag = `${emoji} ${c.name}`;
    ctx.font = '800 11px system-ui, sans-serif';
    const w = ctx.measureText(tag).width + 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(10, -24, w, 18, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = c.color;
    ctx.fillText(tag, 15, -11);
    ctx.restore();
  }
}
