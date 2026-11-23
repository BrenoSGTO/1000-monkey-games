import { createCameraState, laneToWorldX, projectWorld, type CameraState } from './projection';
import {
  HOVER_BOARDS,
  LANE_WIDTH_WORLD,
  MONKEY_SKINS,
  TRAIN_HEIGHT,
  type ActivePowerups,
  type BananaCoin,
  type BoardId,
  type Obstacle,
  type PowerupItem,
  type PowerupKind,
  type RemoteSurferState,
  type SkinId,
} from './types';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  vy: number;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface RenderFrameState {
  width: number;
  height: number;
  time: number;
  distance: number;
  speed: number;
  playerLaneX: number;
  playerY: number;
  playerVy: number;
  rolling: boolean;
  rollTimer: number;
  stumbleTimer: number;
  invulnTimer: number;
  boardTimer: number;
  equippedSkin: SkinId;
  equippedBoard: BoardId;
  powerups: ActivePowerups;
  alive: boolean;
  shake: number;
  obstacles: Obstacle[];
  coins: BananaCoin[];
  powerupItems: PowerupItem[];
  ghosts: RemoteSurferState[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  chaserDist: number; // 0 = right behind player, >1 = offscreen far behind
}

function getSkin(id: SkinId) {
  return MONKEY_SKINS.find((s) => s.id === id) ?? MONKEY_SKINS[0];
}

function getBoard(id: BoardId) {
  return HOVER_BOARDS.find((b) => b.id === id) ?? HOVER_BOARDS[0];
}

function drawSkyAndScenery(ctx: CanvasRenderingContext2D, cam: CameraState, distance: number, time: number): void {
  const { width, height, horizonY } = cam;
  // Cycle smoothly between golden sunset, vibrant jungle day, and neon favela dusk
  const cycle = (Math.sin(distance * 0.0018) + 1) * 0.5;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY + 12);
  if (cycle < 0.5) {
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(0.55, '#c2410c');
    skyGrad.addColorStop(1, '#fde047');
  } else {
    skyGrad.addColorStop(0, '#0c4a6e');
    skyGrad.addColorStop(0.55, '#0284c7');
    skyGrad.addColorStop(1, '#bae6fd');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, horizonY + 15);

  // Tropical sun / moon
  const sunX = width * 0.5 - cam.x * 8;
  const sunY = horizonY - 38;
  ctx.save();
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 90);
  sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
  sunGlow.addColorStop(0.45, 'rgba(251, 146, 60, 0.45)');
  sunGlow.addColorStop(1, 'rgba(251, 146, 60, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Distant Jungle Hills & Morro do Macaco
  ctx.fillStyle = '#14532d';
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 4);
  ctx.quadraticCurveTo(width * 0.16, horizonY - 68, width * 0.34, horizonY - 12);
  ctx.quadraticCurveTo(width * 0.5, horizonY - 52, width * 0.68, horizonY - 10);
  ctx.quadraticCurveTo(width * 0.85, horizonY - 74, width, horizonY - 6);
  ctx.lineTo(width, horizonY + 6);
  ctx.closePath();
  ctx.fill();

  // Tiny "Cristo Banana" silhouette on central hill
  const cx = width * 0.5 - cam.x * 5;
  const cy = horizonY - 46;
  ctx.fillStyle = '#052e16';
  ctx.fillRect(cx - 2.5, cy - 16, 5, 22);
  ctx.fillRect(cx - 11, cy - 12, 22, 4);

  // Ground plane
  const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
  groundGrad.addColorStop(0, '#365314');
  groundGrad.addColorStop(0.25, '#3f6212');
  groundGrad.addColorStop(1, '#1a2e05');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  // Track ballast trapezoid
  const farL = projectWorld(cam, -LANE_WIDTH_WORLD * 1.65, 0, cam.z + 115);
  const farR = projectWorld(cam, LANE_WIDTH_WORLD * 1.65, 0, cam.z + 115);
  const nearL = projectWorld(cam, -LANE_WIDTH_WORLD * 1.65, 0, cam.z + 1.5);
  const nearR = projectWorld(cam, LANE_WIDTH_WORLD * 1.65, 0, cam.z + 1.5);
  ctx.fillStyle = '#292524';
  ctx.beginPath();
  ctx.moveTo(farL.x, farL.y);
  ctx.lineTo(farR.x, farR.y);
  ctx.lineTo(nearR.x, nearR.y);
  ctx.lineTo(nearL.x, nearL.y);
  ctx.closePath();
  ctx.fill();

  // Concrete side curbs
  ctx.strokeStyle = '#78716c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(farL.x, farL.y);
  ctx.lineTo(nearL.x, nearL.y);
  ctx.moveTo(farR.x, farR.y);
  ctx.lineTo(nearR.x, nearR.y);
  ctx.stroke();

  // Wooden sleepers (dormentes) scrolling past
  const startZ = Math.floor(cam.z + 2);
  const endZ = Math.floor(cam.z + 100);
  for (let z = startZ; z <= endZ; z += 2) {
    if (z < 0) continue;
    for (const lane of [-1, 0, 1]) {
      const lx = lane * LANE_WIDTH_WORLD;
      const pL = projectWorld(cam, lx - 1.05, 0.02, z);
      const pR = projectWorld(cam, lx + 1.05, 0.02, z);
      if (!pL.visible || !pR.visible) continue;
      ctx.strokeStyle = 'rgba(120, 53, 15, 0.8)';
      ctx.lineWidth = Math.max(1.5, pL.scale * 0.24);
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
    }
  }

  // Steel rails (2 per lane = 6 rails)
  for (const lane of [-1, 0, 1]) {
    const lx = lane * LANE_WIDTH_WORLD;
    for (const offset of [-0.78, 0.78]) {
      const pFar = projectWorld(cam, lx + offset, 0.05, cam.z + 115);
      const pNear = projectWorld(cam, lx + offset, 0.05, cam.z + 1.5);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(pFar.x, pFar.y);
      ctx.lineTo(pNear.x, pNear.y);
      ctx.stroke();
    }
  }

  // Passing Favela Houses, Graffiti Walls & Palm Trees along both sides
  const propStep = 14;
  const firstProp = Math.floor((cam.z + 4) / propStep) * propStep;
  const houseColors = ['#e11d48', '#0284c7', '#eab308', '#16a34a', '#ea580c', '#7c3aed'];
  for (let pz = firstProp + 98; pz >= firstProp; pz -= propStep) {
    if (pz < 4) continue;
    const idx = Math.abs(Math.floor(pz / propStep));
    for (const side of [-1, 1]) {
      const wx = side * (LANE_WIDTH_WORLD * 2.3 + ((idx % 3) * 0.6));
      const base = projectWorld(cam, wx, 0, pz);
      if (!base.visible || base.scale <= 0.5) continue;
      const sc = base.scale;
      if (idx % 2 === 0) {
        // Colorful Favela House
        const hW = sc * 3.8;
        const hH = sc * (3.6 + (idx % 3) * 1.1);
        const hx = base.x - hW * 0.5;
        const hy = base.y - hH;
        ctx.fillStyle = houseColors[(idx + (side > 0 ? 2 : 0)) % houseColors.length];
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(1, sc * 0.08);
        ctx.fillRect(hx, hy, hW, hH);
        ctx.strokeRect(hx, hy, hW, hH);
        // Roof / Laje water tank
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(hx + hW * 0.62, hy - sc * 0.7, sc * 0.85, sc * 0.7);
        // Lit windows
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(hx + hW * 0.18, hy + hH * 0.25, hW * 0.24, hH * 0.22);
        ctx.fillRect(hx + hW * 0.58, hy + hH * 0.25, hW * 0.24, hH * 0.22);
      } else {
        // Tropical Palm Tree swaying slightly
        const sway = Math.sin(time * 2.5 + idx) * sc * 0.22;
        const trunkH = sc * 4.6;
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = Math.max(2, sc * 0.34);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(base.x + sway * 0.5, base.y - trunkH * 0.5, base.x + sway, base.y - trunkH);
        ctx.stroke();

        const tx = base.x + sway;
        const ty = base.y - trunkH;
        ctx.fillStyle = '#16a34a';
        for (let a = 0; a < 5; a++) {
          const ang = -Math.PI + (a / 4) * Math.PI + Math.sin(time * 3 + a) * 0.08;
          ctx.beginPath();
          ctx.ellipse(
            tx + Math.cos(ang) * sc * 1.1,
            ty + Math.sin(ang) * sc * 0.45,
            sc * 1.2,
            sc * 0.32,
            ang * 0.6,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
  }
}

function drawBox3D(
  ctx: CanvasRenderingContext2D,
  cam: CameraState,
  cx: number,
  halfW: number,
  yBottom: number,
  yTop: number,
  zNear: number,
  zFar: number,
  frontColor: string,
  topColor: string,
  sideColor: string,
): { frontPts: { tl: number[]; tr: number[]; br: number[]; bl: number[] } } | null {
  const zN = Math.max(cam.z + 0.6, zNear);
  const zF = Math.max(zN + 0.1, zFar);
  if (zFar <= cam.z + 0.6) return null;

  const nTL = projectWorld(cam, cx - halfW, yTop, zN);
  const nTR = projectWorld(cam, cx + halfW, yTop, zN);
  const nBL = projectWorld(cam, cx - halfW, yBottom, zN);
  const nBR = projectWorld(cam, cx + halfW, yBottom, zN);

  const fTL = projectWorld(cam, cx - halfW, yTop, zF);
  const fTR = projectWorld(cam, cx + halfW, yTop, zF);
  const fBL = projectWorld(cam, cx - halfW, yBottom, zF);
  const fBR = projectWorld(cam, cx + halfW, yBottom, zF);

  if (!nTL.visible || !fTL.visible) return null;

  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.2, Math.min(3, nTL.scale * 0.08));

  // Side face visible based on camera x
  if (cam.x < cx - halfW * 0.3) {
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(nTL.x, nTL.y);
    ctx.lineTo(fTL.x, fTL.y);
    ctx.lineTo(fBL.x, fBL.y);
    ctx.lineTo(nBL.x, nBL.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cam.x > cx + halfW * 0.3) {
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(nTR.x, nTR.y);
    ctx.lineTo(fTR.x, fTR.y);
    ctx.lineTo(fBR.x, fBR.y);
    ctx.lineTo(nBR.x, nBR.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Top roof face
  if (cam.y > yTop) {
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(nTL.x, nTL.y);
    ctx.lineTo(nTR.x, nTR.y);
    ctx.lineTo(fTR.x, fTR.y);
    ctx.lineTo(fTL.x, fTL.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Front face
  ctx.fillStyle = frontColor;
  ctx.beginPath();
  ctx.moveTo(nTL.x, nTL.y);
  ctx.lineTo(nTR.x, nTR.y);
  ctx.lineTo(nBR.x, nBR.y);
  ctx.lineTo(nBL.x, nBL.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  return {
    frontPts: {
      tl: [nTL.x, nTL.y],
      tr: [nTR.x, nTR.y],
      br: [nBR.x, nBR.y],
      bl: [nBL.x, nBL.y],
    },
  };
}

function drawObstacle(ctx: CanvasRenderingContext2D, cam: CameraState, obs: Obstacle, time: number): void {
  if (obs.destroyed) return;
  const cx = laneToWorldX(obs.lane - 1);

  if (obs.kind === 'barrier_low') {
    const res = drawBox3D(ctx, cam, cx, 1.15, 0, 1.05, obs.z, obs.z + obs.length, '#f97316', '#fdba74', '#c2410c');
    if (res) {
      const { tl, tr, br, bl } = res.frontPts;
      const w = tr[0] - tl[0];
      const h = bl[1] - tl[1];
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(tl[0] + w * 0.1, tl[1] + h * 0.25, w * 0.8, h * 0.25);
      if (w > 28) {
        ctx.fillStyle = '#1c1917';
        ctx.font = `900 ${Math.max(8, Math.floor(h * 0.24))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PULA!', (tl[0] + tr[0]) * 0.5, (tl[1] + br[1]) * 0.5);
      }
    }
    return;
  }

  if (obs.kind === 'barrier_high') {
    // Side pillars + overhead warning board (roll under!)
    drawBox3D(ctx, cam, cx - 1.05, 0.14, 0, 2.35, obs.z, obs.z + 0.4, '#475569', '#64748b', '#334155');
    drawBox3D(ctx, cam, cx + 1.05, 0.14, 0, 2.35, obs.z, obs.z + 0.4, '#475569', '#64748b', '#334155');
    const res = drawBox3D(ctx, cam, cx, 1.2, 1.05, 2.35, obs.z, obs.z + obs.length, '#ef4444', '#fca5a5', '#991b1b');
    if (res) {
      const { tl, tr, bl } = res.frontPts;
      const w = tr[0] - tl[0];
      const h = bl[1] - tl[1];
      if (w > 28) {
        ctx.fillStyle = '#fef08a';
        ctx.font = `900 ${Math.max(8, Math.floor(h * 0.34))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ROLA!', (tl[0] + tr[0]) * 0.5, (tl[1] + bl[1]) * 0.5);
      }
    }
    return;
  }

  if (obs.kind === 'barrier_full') {
    const res = drawBox3D(ctx, cam, cx, 1.22, 0, 2.55, obs.z, obs.z + obs.length, '#dc2626', '#f87171', '#7f1d1d');
    if (res) {
      const { tl, tr, bl } = res.frontPts;
      const w = tr[0] - tl[0];
      const h = bl[1] - tl[1];
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = Math.max(2, w * 0.06);
      ctx.beginPath();
      ctx.moveTo(tl[0] + w * 0.15, tl[1] + h * 0.15);
      ctx.lineTo(tr[0] - w * 0.15, bl[1] - h * 0.15);
      ctx.moveTo(tr[0] - w * 0.15, tl[1] + h * 0.15);
      ctx.lineTo(tl[0] + w * 0.15, bl[1] - h * 0.15);
      ctx.stroke();
    }
    return;
  }

  // Trains (static, moving, ramp)
  const trainStartZ = obs.kind === 'train_ramp' ? obs.z + obs.rampLength : obs.z;
  const trainEndZ = obs.z + obs.length;
  const res = drawBox3D(
    ctx,
    cam,
    cx,
    1.24,
    0,
    TRAIN_HEIGHT,
    trainStartZ,
    trainEndZ,
    obs.color,
    obs.accent,
    '#1e293b',
  );

  if (res) {
    const { tl, tr, bl } = res.frontPts;
    const w = tr[0] - tl[0];
    const h = bl[1] - tl[1];
    // Windshield
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(tl[0] + w * 0.14, tl[1] + h * 0.14, w * 0.72, h * 0.28);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, w * 0.025);
    ctx.strokeRect(tl[0] + w * 0.14, tl[1] + h * 0.14, w * 0.72, h * 0.28);

    // Graffiti tag on front
    if (w > 34) {
      ctx.fillStyle = '#fef08a';
      ctx.font = `900 ${Math.max(8, Math.floor(h * 0.15))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obs.graffiti, (tl[0] + tr[0]) * 0.5, tl[1] + h * 0.58);
    }

    // Headlights (blinking brightly on moving trains)
    const pulse = obs.kind === 'train_moving' ? 0.75 + 0.25 * Math.sin(time * 18) : 0.45;
    ctx.fillStyle = obs.kind === 'train_moving' ? `rgba(254, 240, 138, ${pulse})` : '#94a3b8';
    const r = Math.max(2, w * 0.08);
    ctx.beginPath();
    ctx.arc(tl[0] + w * 0.25, tl[1] + h * 0.82, r, 0, Math.PI * 2);
    ctx.arc(tl[0] + w * 0.75, tl[1] + h * 0.82, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Ramp Slope in front of train_ramp
  if (obs.kind === 'train_ramp') {
    const rN = Math.max(cam.z + 0.6, obs.z);
    const rF = obs.z + obs.rampLength;
    if (rF > cam.z + 0.6) {
      const bL = projectWorld(cam, cx - 1.18, 0.02, rN);
      const bR = projectWorld(cam, cx + 1.18, 0.02, rN);
      const tL = projectWorld(cam, cx - 1.18, TRAIN_HEIGHT, rF);
      const tR = projectWorld(cam, cx + 1.18, TRAIN_HEIGHT, rF);
      if (bL.visible && tL.visible) {
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bL.x, bL.y);
        ctx.lineTo(bR.x, bR.y);
        ctx.lineTo(tR.x, tR.y);
        ctx.lineTo(tL.x, tL.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Chevron arrow
        const mX = (bL.x + bR.x + tL.x + tR.x) * 0.25;
        const mY = (bL.y + bR.y + tL.y + tR.y) * 0.25;
        const w = Math.abs(bR.x - bL.x);
        if (w > 18) {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = Math.max(2, w * 0.06);
          ctx.beginPath();
          ctx.moveTo(mX - w * 0.22, mY + w * 0.12);
          ctx.lineTo(mX, mY - w * 0.12);
          ctx.lineTo(mX + w * 0.22, mY + w * 0.12);
          ctx.stroke();
        }
      }
    }
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, cam: CameraState, coin: BananaCoin, time: number): void {
  if (coin.collected) return;
  const bob = Math.sin(time * 5.5 + coin.z * 0.4) * 0.12;
  const pt = projectWorld(cam, laneToWorldX(coin.lane - 1), coin.y + bob, coin.z);
  if (!pt.visible || pt.scale < 1) return;
  const r = Math.max(3, pt.scale * 0.36);
  const spin = Math.abs(Math.cos(time * 4.5 + coin.z * 0.3));

  ctx.save();
  ctx.translate(pt.x, pt.y);
  if (coin.isSpray) {
    // Bonus Spray Can!
    ctx.fillStyle = '#ec4899';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.5, r * 0.15);
    ctx.fillRect(-r * 0.55, -r * 0.9, r * 1.1, r * 1.8);
    ctx.strokeRect(-r * 0.55, -r * 0.9, r * 1.1, r * 1.8);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-r * 0.28, -r * 1.15, r * 0.56, r * 0.28);
  } else {
    // Banana Coin
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = Math.max(1.4, r * 0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(2, r * (0.3 + 0.7 * spin)), r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Little banana crescent inside
    if (r > 7 && spin > 0.35) {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.beginPath();
      ctx.arc(r * 0.1, 0, r * 0.46, Math.PI * 0.65, Math.PI * 1.45);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const POWERUP_META: Record<PowerupKind, { color: string; glow: string; icon: string }> = {
  jetpack: { color: '#fb923c', glow: '#fed7aa', icon: '🚀' },
  sneakers: { color: '#4ade80', glow: '#bbf7d0', icon: '👟' },
  magnet: { color: '#f43f5e', glow: '#fecdd3', icon: '🧲' },
  multiplier: { color: '#38bdf8', glow: '#bae6fd', icon: '2x' },
};

function drawPowerup(ctx: CanvasRenderingContext2D, cam: CameraState, item: PowerupItem, time: number): void {
  if (item.collected) return;
  const bob = Math.sin(time * 4 + item.z) * 0.18;
  const pt = projectWorld(cam, laneToWorldX(item.lane - 1), item.y + bob, item.z);
  if (!pt.visible || pt.scale < 1.2) return;
  const r = Math.max(5, pt.scale * 0.54);
  const meta = POWERUP_META[item.kind];

  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.fillStyle = meta.glow;
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(time * 7);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = meta.color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (r > 9) {
    ctx.fillStyle = '#0f172a';
    ctx.font = `900 ${Math.floor(r * 1.05)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.icon, 0, 1);
  }
  ctx.restore();
}

function drawMonkeyCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scalePx: number,
  skinId: SkinId,
  boardId: BoardId,
  opts: {
    time: number;
    rolling: boolean;
    rollTimer: number;
    jetpack: boolean;
    sneakers: boolean;
    board: boolean;
    inAir: boolean;
    lookBack: boolean;
    alpha?: number;
    label?: string;
    labelColor?: string;
    tauntText?: string;
  },
): void {
  const skin = getSkin(skinId);
  const board = getBoard(boardId);
  const s = scalePx * 0.44;
  if (s < 4) return;

  ctx.save();
  ctx.translate(x, y);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  const stride = Math.sin(opts.time * 16);
  const bounce = opts.inAir || opts.board ? 0 : Math.abs(stride) * s * 0.16;
  ctx.translate(0, -bounce);

  // Hoverboard underneath
  if (opts.board) {
    ctx.save();
    ctx.translate(0, s * 0.08);
    ctx.fillStyle = board.glow;
    ctx.globalAlpha = (opts.alpha ?? 1) * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.6, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = opts.alpha ?? 1;

    ctx.fillStyle = board.primary;
    ctx.strokeStyle = board.secondary;
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.35, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Rolling spin tuck
  if (opts.rolling) {
    ctx.translate(0, -s * 0.85);
    ctx.rotate(-opts.rollTimer * 18);
    ctx.fillStyle = skin.hoodie;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.fur;
    ctx.beginPath();
    ctx.arc(0, -s * 0.25, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Legs (animated running from behind!)
  const leftLegY = opts.inAir ? -s * 0.35 : -s * 0.1 + Math.max(0, stride) * s * 0.38;
  const rightLegY = opts.inAir ? -s * 0.2 : -s * 0.1 + Math.max(0, -stride) * s * 0.38;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(2.5, s * 0.34);
  ctx.beginPath();
  ctx.moveTo(-s * 0.35, -s * 0.9);
  ctx.lineTo(-s * 0.42, leftLegY);
  ctx.moveTo(s * 0.35, -s * 0.9);
  ctx.lineTo(s * 0.42, rightLegY);
  ctx.stroke();

  ctx.strokeStyle = skin.fur;
  ctx.lineWidth = Math.max(2, s * 0.24);
  ctx.beginPath();
  ctx.moveTo(-s * 0.35, -s * 0.9);
  ctx.lineTo(-s * 0.42, leftLegY);
  ctx.moveTo(s * 0.35, -s * 0.9);
  ctx.lineTo(s * 0.42, rightLegY);
  ctx.stroke();

  // Shoes (glowing green springs if Sneakers active!)
  ctx.fillStyle = opts.sneakers ? '#4ade80' : skin.accent;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  ctx.beginPath();
  ctx.ellipse(-s * 0.44, leftLegY + s * 0.08, s * 0.24, s * 0.14, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.44, rightLegY + s * 0.08, s * 0.24, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Swinging Monkey Tail
  const tailWag = Math.sin(opts.time * 11) * s * 0.45;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(3, s * 0.24);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.15);
  ctx.bezierCurveTo(-s * 0.7 + tailWag, -s * 0.9, -s * 1.1 + tailWag, -s * 1.75, -s * 0.65 + tailWag, -s * 2.05);
  ctx.stroke();
  ctx.strokeStyle = skin.fur;
  ctx.lineWidth = Math.max(2, s * 0.15);
  ctx.stroke();

  // Torso / Hoodie (seen from behind)
  ctx.fillStyle = skin.hoodie;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(2, s * 0.1);
  ctx.beginPath();
  ctx.roundRect(-s * 0.68, -s * 2.15, s * 1.36, s * 1.32, s * 0.45);
  ctx.fill();
  ctx.stroke();

  // Back logo / graffiti stripe on hoodie
  ctx.fillStyle = skin.accent;
  ctx.beginPath();
  ctx.arc(0, -s * 1.5, s * 0.24, 0, Math.PI * 2);
  ctx.fill();

  // Coconut Jetpack strapped on back!
  if (opts.jetpack) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(side * s * 0.34, -s * 1.58, s * 0.24, s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Flame
      const flameH = s * (0.65 + Math.random() * 0.4);
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(side * s * 0.34 - s * 0.14, -s * 1.15);
      ctx.lineTo(side * s * 0.34, -s * 1.15 + flameH);
      ctx.lineTo(side * s * 0.34 + s * 0.14, -s * 1.15);
      ctx.fill();
    }
  }

  // Arms swinging (or up in air!)
  const armL = opts.inAir ? -s * 2.55 : -s * 1.35 - stride * s * 0.45;
  const armR = opts.inAir ? -s * 2.55 : -s * 1.35 + stride * s * 0.45;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(2.5, s * 0.3);
  ctx.beginPath();
  ctx.moveTo(-s * 0.65, -s * 1.95);
  ctx.lineTo(-s * 0.98, armL);
  ctx.moveTo(s * 0.65, -s * 1.95);
  ctx.lineTo(s * 0.98, armR);
  ctx.stroke();
  ctx.strokeStyle = skin.fur;
  ctx.lineWidth = Math.max(2, s * 0.2);
  ctx.stroke();

  // Ears & Head
  const headY = -s * 2.75;
  for (const side of [-1, 1]) {
    ctx.fillStyle = skin.fur;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath();
    ctx.arc(side * s * 0.68, headY, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.belly;
    ctx.beginPath();
    ctx.arc(side * s * 0.68, headY, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = skin.fur;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(2, s * 0.1);
  ctx.beginPath();
  ctx.arc(0, headY, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Scared look-back face when Gorilla is chasing close!
  if (opts.lookBack) {
    ctx.fillStyle = skin.belly;
    ctx.beginPath();
    ctx.ellipse(s * 0.15, headY + s * 0.12, s * 0.38, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wide scared eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-s * 0.02, headY - s * 0.04, s * 0.16, 0, Math.PI * 2);
    ctx.arc(s * 0.28, headY - s * 0.04, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, headY - s * 0.02, s * 0.07, 0, Math.PI * 2);
    ctx.arc(s * 0.28, headY - s * 0.02, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  // Headgear per skin (Cap backwards, Crown, Astronaut helmet)
  if (skinId === 'rei') {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, headY - s * 0.35);
    ctx.lineTo(-s * 0.35, headY - s * 0.9);
    ctx.lineTo(-s * 0.12, headY - s * 0.58);
    ctx.lineTo(0, headY - s * 0.95);
    ctx.lineTo(s * 0.12, headY - s * 0.58);
    ctx.lineTo(s * 0.35, headY - s * 0.9);
    ctx.lineTo(s * 0.45, headY - s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (skinId === 'astronauta') {
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.beginPath();
    ctx.arc(0, headY, s * 0.74, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Backwards Cap
    ctx.fillStyle = skin.cap;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath();
    ctx.arc(0, headY - s * 0.14, s * 0.58, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    // Visor facing back toward camera!
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(0, headY - s * 0.1, s * 0.46, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nameplate / Taunt for multiplayer ghosts
  if (opts.label) {
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(opts.label).width + 12;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.beginPath();
    ctx.roundRect(-w * 0.5, headY - s * 1.45 - 16, w, 20, 6);
    ctx.fill();
    ctx.strokeStyle = opts.labelColor ?? '#facc15';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = opts.labelColor ?? '#facc15';
    ctx.fillText(opts.label, 0, headY - s * 1.45 - 2);
  }

  if (opts.tauntText) {
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(opts.tauntText).width + 16;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(-tw * 0.5, headY - s * 1.45 - 42, tw, 22, 8);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(opts.tauntText, 0, headY - s * 1.45 - 26);
  }

  ctx.restore();
}

function drawGorillaAndCapybara(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scalePx: number,
  time: number,
): void {
  const s = scalePx * 0.46;
  const stride = Math.sin(time * 15);
  ctx.save();
  ctx.translate(x, y);

  // Security Gorilla (massive shoulders, blue uniform, angry brows)
  ctx.save();
  ctx.translate(-s * 0.35, -Math.abs(stride) * s * 0.15);
  // Legs
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(3, s * 0.42);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 0.8);
  ctx.lineTo(-s * 0.48, Math.max(0, stride) * s * 0.35);
  ctx.moveTo(s * 0.4, -s * 0.8);
  ctx.lineTo(s * 0.48, Math.max(0, -stride) * s * 0.35);
  ctx.stroke();
  // Broad Uniform Torso
  ctx.fillStyle = '#1e3a8a';
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.beginPath();
  ctx.roundRect(-s * 1.05, -s * 2.35, s * 2.1, s * 1.65, s * 0.5);
  ctx.fill();
  ctx.stroke();
  // Badge
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(s * 0.45, -s * 1.75, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(0, -s * 2.85, s * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Cap
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(0, -s * 3.02, s * 0.64, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-s * 0.72, -s * 3.05, s * 1.44, s * 0.18);
  // Angry eyes
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(-s * 0.22, -s * 2.8, s * 0.12, 0, Math.PI * 2);
  ctx.arc(s * 0.22, -s * 2.8, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Cachorro-Capivara running right beside!
  ctx.save();
  ctx.translate(s * 1.35, -Math.abs(Math.cos(time * 17)) * s * 0.18);
  ctx.fillStyle = '#92400e';
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.55, s * 0.68, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Red dog collar
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-s * 0.42, -s * 0.92, s * 0.84, s * 0.16);
  // Capybara chill-yet-barking head
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.arc(0, -s * 1.15, s * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

export function renderGame(ctx: CanvasRenderingContext2D, state: RenderFrameState): void {
  const { width, height } = state;
  ctx.save();
  if (state.shake > 0.4) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }

  const cam = createCameraState(width, height, state.distance, state.playerLaneX, state.playerY);
  drawSkyAndScenery(ctx, cam, state.distance, state.time);

  // Collect all drawable 3D objects sorted back-to-front by farthest Z
  type DrawOp = { sortZ: number; draw: () => void };
  const ops: DrawOp[] = [];

  for (const obs of state.obstacles) {
    if (obs.destroyed) continue;
    const farZ = obs.z + obs.length;
    if (farZ < cam.z + 0.5 || obs.z > cam.z + 115) continue;
    ops.push({
      sortZ: obs.z + obs.length * 0.35,
      draw: () => drawObstacle(ctx, cam, obs, state.time),
    });
  }

  for (const coin of state.coins) {
    if (coin.collected) continue;
    if (coin.z < cam.z + 1 || coin.z > cam.z + 105) continue;
    ops.push({
      sortZ: coin.z,
      draw: () => drawCoin(ctx, cam, coin, state.time),
    });
  }

  for (const p of state.powerupItems) {
    if (p.collected) continue;
    if (p.z < cam.z + 1 || p.z > cam.z + 105) continue;
    ops.push({
      sortZ: p.z,
      draw: () => drawPowerup(ctx, cam, p, state.time),
    });
  }

  // Multiplayer Ghosts ahead of or near player
  for (const g of state.ghosts) {
    const relZ = g.distance;
    if (relZ < cam.z + 1 || relZ > cam.z + 105) continue;
    ops.push({
      sortZ: relZ,
      draw: () => {
        const pt = projectWorld(cam, laneToWorldX(g.laneX), g.y, relZ);
        if (!pt.visible) return;
        drawMonkeyCharacter(ctx, pt.x, pt.y, pt.scale, g.skin, 'cipo', {
          time: state.time,
          rolling: g.rolling,
          rollTimer: state.time * 2,
          jetpack: g.jetpack,
          sneakers: false,
          board: g.board,
          inAir: g.y > 0.15,
          lookBack: false,
          alpha: g.alive ? 0.66 : 0.32,
          label: `${g.name} (${Math.floor(g.distance)}m)`,
          labelColor: g.color,
          tauntText: g.tauntTimer && g.tauntTimer > 0 ? g.tauntText : undefined,
        });
      },
    });
  }

  ops.sort((a, b) => b.sortZ - a.sortZ);
  for (const op of ops) op.draw();

  // Player shadow on ground/train roof
  const playerWX = laneToWorldX(state.playerLaneX);
  const shadowPt = projectWorld(cam, playerWX, 0.03, state.distance);
  const playerPt = projectWorld(cam, playerWX, state.playerY, state.distance);

  if (shadowPt.visible && playerPt.visible) {
    const shScale = Math.max(0.35, 1 - state.playerY * 0.12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(shadowPt.x, shadowPt.y, shadowPt.scale * 0.55 * shScale, shadowPt.scale * 0.18 * shScale, 0, 0, Math.PI * 2);
    ctx.fill();

    const blink = state.invulnTimer > 0 && Math.floor(state.time * 18) % 2 === 0;
    drawMonkeyCharacter(ctx, playerPt.x, playerPt.y, playerPt.scale, state.equippedSkin, state.equippedBoard, {
      time: state.time,
      rolling: state.rolling,
      rollTimer: state.rollTimer,
      jetpack: state.powerups.jetpack > 0,
      sneakers: state.powerups.sneakers > 0,
      board: state.boardTimer > 0,
      inAir: state.playerY > 0.15,
      lookBack: state.stumbleTimer > 0,
      alpha: blink ? 0.5 : 1,
    });
  }

  // Chasing Gorilla + Capybara right behind player during stumble/start/caught
  if (state.chaserDist < 1.15) {
    const chaseZ = state.distance - (1.8 + state.chaserDist * 2.6);
    const chasePt = projectWorld(cam, playerWX * 0.85, 0, Math.max(cam.z + 1.05, chaseZ));
    if (chasePt.visible) {
      drawGorillaAndCapybara(ctx, chasePt.x, chasePt.y, chasePt.scale, state.time);
    }
  }

  // Particles
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.alpha);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating Texts
  for (const ft of state.floatingTexts) {
    const alpha = Math.min(1, ft.life / Math.max(0.1, ft.maxLife * 0.4));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${Math.floor(20 * ft.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();
}
