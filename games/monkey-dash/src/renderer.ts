import {
  ARENA_ROWS,
  GROUND_Y,
  PLAYER_SIZE,
  TILE,
  type Checkpoint,
  type HornEvent,
  type LevelData,
  type LevelObject,
  type MonkeyForm,
  type MonkeySkinId,
  type PlayerState,
  type RemoteMonkeyState,
} from './types';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  rot: number;
  vrot: number;
  kind: 'shard' | 'spark' | 'banana' | 'ring';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  screenSpace?: boolean;
}

export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderContextState {
  level: LevelData;
  player: PlayerState;
  cameraX: number;
  beatPulse: number;
  timeSec: number;
  shakeAmount: number;
  particles: Particle[];
  floatingTexts: FloatingText[];
  checkpoints: Checkpoint[];
  remotes: RemoteMonkeyState[];
  activeHorn: HornEvent | null;
  deathBanner: string | null;
  localColor: string;
  localName: string;
  localSkin: MonkeySkinId;
  dpr?: number;
  viewport?: ViewportRect;
  playerBadge?: string;
  zenMode?: boolean;
  hideRemotes?: boolean;
}

function drawSkinAccessory(
  ctx: CanvasRenderingContext2D,
  skin: MonkeySkinId,
  accentColor: string,
  eyeY: number,
  topY: number,
): void {
  if (skin === 'bald') {
    // Shiny bald dome highlight + 3 comical wispy hairs
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, topY + 4, 6, 2.4, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-2, topY);
    ctx.quadraticCurveTo(-5, topY - 7, -8, topY - 5);
    ctx.moveTo(1, topY);
    ctx.quadraticCurveTo(1, topY - 8, 4, topY - 6);
    ctx.moveTo(4, topY);
    ctx.quadraticCurveTo(7, topY - 6, 9, topY - 4);
    ctx.stroke();
  } else if (skin === 'shades') {
    // Cool Juliette neon sunglasses
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    roundRect(ctx, -13, eyeY - 4.5, 11.5, 8.5, 2);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 1.5, eyeY - 4.5, 11.5, 8.5, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-1.5, eyeY - 2, 3, 2.2);
    // Lens glare
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-10, eyeY + 1);
    ctx.lineTo(-5, eyeY - 3);
    ctx.moveTo(4, eyeY + 1);
    ctx.lineTo(9, eyeY - 3);
    ctx.stroke();
  } else if (skin === 'crown') {
    // Royal golden crown
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-11, topY + 1);
    ctx.lineTo(-12, topY - 10);
    ctx.lineTo(-5, topY - 4);
    ctx.lineTo(0, topY - 13);
    ctx.lineTo(5, topY - 4);
    ctx.lineTo(12, topY - 10);
    ctx.lineTo(11, topY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(0, topY - 3, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin === 'neon') {
    // Cyber laser visor
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = accentColor;
    roundRect(ctx, -13, eyeY - 3.5, 26, 6.5, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-9, eyeY - 1.5, 18, 2);
    ctx.restore();
  }
}

export function drawMonkeySprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rot: number,
  form: MonkeyForm,
  grav: 1 | -1,
  scaleX: number,
  scaleY: number,
  accentColor: string,
  vy: number,
  alpha = 1,
  skin: MonkeySkinId = 'classic',
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scaleX, scaleY * (form !== 'cube' && form !== 'ball' && grav === -1 ? -1 : 1));

  if (form === 'cube') {
    const r = PLAYER_SIZE / 2;
    // Ears
    ctx.fillStyle = skin === 'neon' ? '#0f172a' : '#78350f';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    for (const ex of [-r - 3, r + 3]) {
      ctx.beginPath();
      ctx.arc(ex, -4, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = skin === 'neon' ? accentColor : '#fca5a5';
      ctx.beginPath();
      ctx.arc(ex, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin === 'neon' ? '#0f172a' : '#78350f';
    }

    // Cube body
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = skin === 'neon' ? '#0f172a' : skin === 'bald' ? '#b45309' : '#92400e';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.8;
    roundRect(ctx, -r, -r, PLAYER_SIZE, PLAYER_SIZE, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Face mask
    ctx.fillStyle = skin === 'neon' ? '#1e293b' : '#fde68a';
    roundRect(ctx, -r + 4, -2, PLAYER_SIZE - 8, r - 1, 6);
    ctx.fill();

    // Crossed eyes (vesgo!)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    for (const ex of [-6.5, 6.5]) {
      ctx.beginPath();
      ctx.arc(ex, -6, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const panic = Math.abs(vy) > 550;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-4.2, panic ? -4.5 : -5.5, 2.3, 0, Math.PI * 2);
    ctx.arc(4.2, panic ? -7.5 : -6.8, 2.3, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    if (panic) {
      ctx.ellipse(0, 8, 5.5, 5, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 4.5, 7, 0.1, Math.PI - 0.1);
    }
    ctx.fill();
    if (!panic) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, 5, 6, 2.5);
    }

    drawSkinAccessory(ctx, skin, accentColor, -6, -r);
  } else if (form === 'ball') {
    const r = PLAYER_SIZE / 2;
    // Outer spiked wheel ring
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = skin === 'neon' ? '#1e1b4b' : '#7c2d12';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i++) {
      const ang = (i * Math.PI) / teeth;
      const rad = i % 2 === 0 ? r + 2 : r - 3;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner monkey face
    ctx.fillStyle = skin === 'neon' ? '#0f172a' : '#fde68a';
    ctx.beginPath();
    ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
    ctx.fill();

    // Crossed eyes
    ctx.fillStyle = '#ffffff';
    for (const ex of [-4.5, 4.5]) {
      ctx.beginPath();
      ctx.arc(ex, -2, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-3.2, -1.5, 1.7, 0, Math.PI * 2);
    ctx.arc(3.2, -2.5, 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(0, 4, 4.5, 0, Math.PI);
    ctx.fill();

    drawSkinAccessory(ctx, skin, accentColor, -2, -r + 2);
    ctx.restore();
  } else if (form === 'ship') {
    // Exhaust flame
    const flicker = 0.8 + Math.random() * 0.45;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.lineTo(-28 * flicker, 6);
    ctx.lineTo(-16, 10);
    ctx.closePath();
    ctx.fill();

    // Banana Rocket Hull
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-17, 4);
    ctx.quadraticCurveTo(0, 17, 20, 4);
    ctx.quadraticCurveTo(6, 5, -17, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Monkey pilot head
    ctx.fillStyle = skin === 'neon' ? '#0f172a' : '#92400e';
    ctx.beginPath();
    ctx.arc(0, -3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Goggles / skin flair
    if (skin === 'crown') {
      drawSkinAccessory(ctx, 'crown', accentColor, -5, -12);
    } else if (skin === 'bald') {
      drawSkinAccessory(ctx, 'bald', accentColor, -5, -12);
    } else {
      ctx.fillStyle = skin === 'neon' ? accentColor : '#38bdf8';
      ctx.fillRect(-5, -7, 11, 5);
      ctx.strokeStyle = '#0f172a';
      ctx.strokeRect(-5, -7, 11, 5);
    }
  } else {
    // Wave cyber-chimp dart
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-13, -12);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-13, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Crazy eye on dart
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(3.3, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    if (skin === 'crown') {
      drawSkinAccessory(ctx, 'crown', accentColor, 0, -10);
    }
  }

  ctx.restore();
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: LevelObject,
  wx: number,
  wy: number,
  beatPulse: number,
  timeSec: number,
  colorPrimary: string,
  colorSecondary: string,
  collected: boolean,
  drawPortalBeam = false,
): void {
  switch (obj.type) {
    case 'block': {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx, wy, TILE, TILE);
      ctx.strokeStyle = colorPrimary;
      ctx.lineWidth = 2 + beatPulse * 1.2;
      ctx.strokeRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = colorPrimary;
      ctx.globalAlpha = 0.14 + beatPulse * 0.24;
      ctx.fillRect(wx + 6, wy + 6, TILE - 12, TILE - 12);
      ctx.globalAlpha = 1;
      break;
    }
    case 'spike': {
      ctx.save();
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 8 + beatPulse * 7;
      ctx.fillStyle = '#291510';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + TILE);
      ctx.lineTo(wx + TILE / 2, wy + 4);
      ctx.lineTo(wx + TILE - 3, wy + TILE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Coconut dots
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(wx + TILE / 2 - 3, wy + 29, 1.8, 0, Math.PI * 2);
      ctx.arc(wx + TILE / 2 + 3, wy + 29, 1.8, 0, Math.PI * 2);
      ctx.arc(wx + TILE / 2, wy + 24, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'spike_down': {
      ctx.save();
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 8 + beatPulse * 7;
      ctx.fillStyle = '#291510';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy);
      ctx.lineTo(wx + TILE / 2, wy + TILE - 4);
      ctx.lineTo(wx + TILE - 3, wy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'pad_yellow': {
      ctx.save();
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 12 + beatPulse * 6;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(wx + TILE / 2, wy + TILE - 4, 16, 7 + beatPulse * 2.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'pad_gravity': {
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12 + beatPulse * 6;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(wx + TILE / 2, wy + TILE - 4, 16, 7 + beatPulse * 2.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'orb_yellow':
    case 'orb_blue': {
      const isBlue = obj.type === 'orb_blue';
      const c = isBlue ? '#38bdf8' : '#facc15';
      const cx = wx + TILE / 2;
      const cy = wy + TILE / 2;
      const r = 13 + beatPulse * 3.5;
      ctx.save();
      ctx.shadowColor = c;
      ctx.shadowBlur = 14 + beatPulse * 6;
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = isBlue ? '#bae6fd' : '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Rotating outer dashes
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * 3);
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'banana': {
      if (collected) return;
      const cx = wx + TILE / 2;
      const cy = wy + TILE / 2 + Math.sin(timeSec * 5 + obj.gx) * 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(timeSec * 3 + obj.gx) * 0.25);
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0.3, Math.PI - 0.1);
      ctx.quadraticCurveTo(0, 3, 11, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    default: {
      if (obj.type.startsWith('portal_')) {
        let color = colorSecondary;
        let label = 'PORTAL';
        if (obj.type === 'portal_cube') {
          color = '#4ade80';
          label = 'CUBO';
        } else if (obj.type === 'portal_ship') {
          color = '#f43f5e';
          label = 'NAVE';
        } else if (obj.type === 'portal_wave') {
          color = '#22d3ee';
          label = 'WAVE';
        } else if (obj.type === 'portal_ball') {
          color = '#c084fc';
          label = 'BOLA';
        } else if (obj.type === 'portal_grav_inv') {
          color = '#38bdf8';
          label = 'GRAV ↑';
        } else if (obj.type === 'portal_grav_norm') {
          color = '#facc15';
          label = 'GRAV ↓';
        } else if (obj.type === 'portal_speed_norm') {
          color = '#4ade80';
          label = '1x';
        } else if (obj.type === 'portal_speed_fast') {
          color = '#facc15';
          label = '1.3x';
        } else if (obj.type === 'portal_speed_turbo') {
          color = '#fb7185';
          label = '1.5x';
        }
        const cx = wx + TILE / 2;
        const cy = wy + TILE / 2;
        ctx.save();

        // Subtle vertical neon gate beam across column so unskippable portal gate is visually obvious
        if (drawPortalBeam) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.22 + beatPulse * 0.12;
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(cx, 0);
          ctx.lineTo(cx, GROUND_Y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.shadowColor = color;
        ctx.shadowBlur = 16 + beatPulse * 8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14 + beatPulse * 2.5, 46, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.22 + beatPulse * 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.font = '900 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, cx, cy - 52);
        ctx.restore();
      }
    }
  }
}

function drawJungleSilhouettes(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  floorY: number,
  cameraX: number,
  beatPulse: number,
  accent: string,
): void {
  // Distant hills pulsing subtly with BPM
  ctx.save();
  const hillSpan = 260;
  const hillOffset = (cameraX * 0.12) % hillSpan;
  ctx.fillStyle = '#020617';
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.moveTo(-hillSpan, floorY);
  for (let x = -hillSpan; x <= viewW + hillSpan; x += hillSpan) {
    const drawX = x - hillOffset;
    const peak = 55 + beatPulse * 14;
    ctx.quadraticCurveTo(drawX + hillSpan * 0.5, floorY - peak, drawX + hillSpan, floorY);
  }
  ctx.lineTo(viewW + hillSpan, floorY);
  ctx.closePath();
  ctx.fill();

  // Neon-rimmed palm tree silhouettes
  const palmSpacing = 320;
  const palmOffset = (cameraX * 0.24) % palmSpacing;
  const sway = Math.sin(cameraX * 0.004) * 4 + beatPulse * 5;
  for (let px = -palmSpacing; px < viewW + palmSpacing; px += palmSpacing) {
    const idx = Math.floor((px + cameraX * 0.24) / palmSpacing);
    const x = px - palmOffset + 80;
    const h = 115 + (Math.abs(idx * 37) % 55) + beatPulse * 8;
    const topY = floorY - h;

    ctx.globalAlpha = 0.34 + beatPulse * 0.14;
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;

    // Trunk
    ctx.beginPath();
    ctx.moveTo(x - 6, floorY);
    ctx.quadraticCurveTo(x + sway * 0.4, floorY - h * 0.5, x + sway, topY);
    ctx.lineTo(x + sway + 7, topY);
    ctx.quadraticCurveTo(x + sway * 0.4 + 9, floorY - h * 0.5, x + 7, floorY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fronds
    const cx = x + sway + 3;
    const frondAngles = [-2.5, -1.9, -1.1, -0.4, 0.35];
    for (const ang of frondAngles) {
      const fx = cx + Math.cos(ang) * (44 + beatPulse * 6);
      const fy = topY + Math.sin(ang) * (28 + beatPulse * 4) + 12;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.quadraticCurveTo((cx + fx) * 0.5, topY - 18, fx, fy);
      ctx.quadraticCurveTo((cx + fx) * 0.5, topY + 2, cx, topY);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  state: RenderContextState,
): void {
  const {
    level,
    player,
    cameraX,
    beatPulse,
    timeSec,
    shakeAmount,
    particles,
    floatingTexts,
    checkpoints,
    remotes,
    activeHorn,
    deathBanner,
    localColor,
    localSkin,
    dpr = 1,
    viewport,
    playerBadge,
    zenMode = false,
    hideRemotes = false,
  } = state;

  const cssW = canvasW / dpr;
  const cssH = canvasH / dpr;
  const vp = viewport ?? { x: 0, y: 0, w: cssW, h: cssH };

  ctx.save();
  ctx.scale(dpr, dpr);

  // Clip to viewport (enables crisp horizontal 2P split-screen!)
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  ctx.translate(vp.x, vp.y);

  // Compute clean scale in CSS pixels so 12 tiles + floor margin fits nicely on any viewport & DPR
  const worldSpanY = GROUND_Y + (viewport ? 80 : 130);
  const scale = Math.max(0.38, Math.min(vp.h / worldSpanY, 1.55));
  const viewW = vp.w / scale;
  const viewH = vp.h / scale;
  const floorOffsetY = Math.max(24, (viewH - GROUND_Y) * 0.52);

  // Sky Background
  const skyGrad = ctx.createLinearGradient(0, 0, 0, vp.h);
  skyGrad.addColorStop(0, level.bgTop);
  skyGrad.addColorStop(1, level.bgBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, vp.w, vp.h);

  // BPM pulse flash on background
  if (beatPulse > 0.01) {
    ctx.fillStyle = level.colorPrimary;
    ctx.globalAlpha = beatPulse * 0.11;
    ctx.fillRect(0, 0, vp.w, vp.h);
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.scale(scale, scale);

  // Screen shake
  if (shakeAmount > 0.2) {
    const sx = (Math.random() - 0.5) * shakeAmount * 2;
    const sy = (Math.random() - 0.5) * shakeAmount * 2;
    ctx.translate(sx, sy);
  }

  // Parallax Jungle Moon pulsing on BPM
  const moonX = viewW * 0.78 - (cameraX * 0.03) % 240;
  ctx.save();
  ctx.globalAlpha = 0.22 + beatPulse * 0.18;
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = 18 + beatPulse * 18;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(moonX, 85, 38 + beatPulse * 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Parallax Equalizer bars
  const barW = 36;
  const barSpacing = 52;
  const eqOffset = (cameraX * 0.18) % barSpacing;
  ctx.fillStyle = level.colorSecondary;
  for (let bx = -barSpacing; bx < viewW + barSpacing; bx += barSpacing) {
    const idx = Math.floor((bx + cameraX * 0.18) / barSpacing);
    const h = 40 + Math.abs(Math.sin(idx * 1.7 + timeSec * 2)) * 75 + beatPulse * 48;
    ctx.globalAlpha = 0.13 + beatPulse * 0.09;
    ctx.fillRect(bx - eqOffset, floorOffsetY + GROUND_Y - h, barW, h);
  }
  ctx.globalAlpha = 1;

  // Parallax Jungle Silhouettes pulsing with beat
  drawJungleSilhouettes(ctx, viewW, floorOffsetY + GROUND_Y, cameraX, beatPulse, level.colorPrimary);

  // Parallax background grid
  ctx.strokeStyle = level.colorPrimary;
  ctx.globalAlpha = 0.08 + beatPulse * 0.07;
  ctx.lineWidth = 1;
  const gridStep = TILE * 2;
  const gxStart = -((cameraX * 0.35) % gridStep);
  for (let x = gxStart; x < viewW; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, floorOffsetY + GROUND_Y);
    ctx.stroke();
  }
  for (let y = floorOffsetY; y >= 0; y -= gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // World Space Transform
  ctx.save();
  ctx.translate(-cameraX, floorOffsetY);

  // Neon Floor & Ceiling Rails
  const floorStart = Math.floor(cameraX / TILE) * TILE - TILE;
  const floorEnd = cameraX + viewW + TILE * 2;

  ctx.fillStyle = '#030712';
  ctx.fillRect(floorStart, GROUND_Y, floorEnd - floorStart, viewH - floorOffsetY - GROUND_Y + 200);
  ctx.fillRect(floorStart, -200, floorEnd - floorStart, 200);

  // Floor Grid Stripes
  ctx.strokeStyle = level.colorPrimary;
  ctx.globalAlpha = 0.25 + beatPulse * 0.18;
  ctx.lineWidth = 1.5;
  for (let fx = floorStart; fx < floorEnd; fx += TILE) {
    ctx.beginPath();
    ctx.moveTo(fx, GROUND_Y);
    ctx.lineTo(fx - 26, GROUND_Y + 90);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Glowing floor & ceiling lines
  ctx.shadowColor = level.colorPrimary;
  ctx.shadowBlur = 12 + beatPulse * 14;
  ctx.strokeStyle = level.colorPrimary;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(floorStart, GROUND_Y);
  ctx.lineTo(floorEnd, GROUND_Y);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.globalAlpha =
    player.form === 'ship' || player.form === 'wave' || player.form === 'ball' || player.grav === -1
      ? 0.9
      : 0.35;
  ctx.beginPath();
  ctx.moveTo(floorStart, 0);
  ctx.lineTo(floorEnd, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Finish Line Gate
  const finishX = level.lengthTiles * TILE;
  if (finishX >= floorStart - 100 && finishX <= floorEnd + 100) {
    ctx.save();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.fillRect(finishX, 0, 26, GROUND_Y);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4;
    ctx.strokeRect(finishX, 0, 26, GROUND_Y);
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 BANANA FINAL!', finishX + 13, 36);
    ctx.restore();
  }

  // Practice Checkpoints
  for (const cp of checkpoints) {
    if (cp.x < floorStart - 40 || cp.x > floorEnd + 40) continue;
    ctx.save();
    ctx.translate(cp.x + PLAYER_SIZE / 2, cp.y + PLAYER_SIZE / 2);
    ctx.rotate(timeSec * 2);
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Level Objects (culling visible x range)
  const minVisGx = Math.floor((cameraX - TILE * 2) / TILE);
  const maxVisGx = Math.ceil((cameraX + viewW + TILE * 2) / TILE);
  for (let i = 0; i < level.objects.length; i++) {
    const obj = level.objects[i];
    if (obj.gx < minVisGx || obj.gx > maxVisGx) continue;
    const wx = obj.gx * TILE;
    const wy = GROUND_Y - (obj.gy + 1) * TILE;
    drawObject(
      ctx,
      obj,
      wx,
      wy,
      beatPulse,
      timeSec,
      level.colorPrimary,
      level.colorSecondary,
      player.collectedBananas.has(i),
      true,
    );
  }

  // Remote Multiplayer Monkeys (live on track!)
  if (!hideRemotes) {
    for (const r of remotes) {
      if (r.levelId !== level.id || !r.alive) continue;
      if (r.x < cameraX - 150 || r.x > cameraX + viewW + 150) continue;

      if (r.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        r.trail.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      drawMonkeySprite(
        ctx,
        r.x + PLAYER_SIZE / 2,
        r.y + PLAYER_SIZE / 2,
        r.rot,
        r.form,
        r.grav,
        1,
        1,
        r.color,
        0,
        0.68,
        r.skin,
      );

      // Nameplate
      ctx.save();
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = r.color;
      ctx.fillText(`${r.name} (${Math.floor(r.pct)}%)`, r.x + PLAYER_SIZE / 2, r.y - 10);
      ctx.restore();
    }
  }

  // Local Player Trail
  if (player.alive) {
    if (player.form === 'wave' && player.waveTrail.length > 1) {
      ctx.save();
      ctx.shadowColor = localColor;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = localColor;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      player.waveTrail.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else if (player.trail.length > 1) {
      for (let i = 0; i < player.trail.length; i++) {
        const t = player.trail[i];
        const frac = (i + 1) / player.trail.length;
        ctx.fillStyle = localColor;
        ctx.globalAlpha = frac * 0.32;
        const sz = 11 * frac;
        if (t.form === 'ball') {
          ctx.beginPath();
          ctx.arc(t.x, t.y, sz * 0.65, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(t.x - sz / 2, t.y - sz / 2, sz, sz);
        }
      }
      ctx.globalAlpha = 1;
    }

    drawMonkeySprite(
      ctx,
      player.x + PLAYER_SIZE / 2,
      player.y + PLAYER_SIZE / 2,
      player.rot,
      player.form,
      player.grav,
      player.scaleX,
      player.scaleY,
      localColor,
      player.vy,
      1,
      localSkin,
    );
  }

  // Particles (explosions, ship sparks, bananas, portal rings)
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'ring') {
      const progress = 1 - alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, 5 * alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, p.size + progress * 68, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'banana') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0.3, Math.PI);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  // World-space floating texts
  for (const ft of floatingTexts) {
    if (ft.screenSpace) continue;
    const alpha = Math.min(1, ft.life / ft.maxLife + 0.25);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore(); // end world transform

  // Split-screen player badge
  if (playerBadge) {
    ctx.save();
    ctx.font = '900 14px system-ui, sans-serif';
    const bw = ctx.measureText(playerBadge).width + 20;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = localColor;
    ctx.lineWidth = 2;
    roundRect(ctx, 14, 14, bw, 28, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = localColor;
    ctx.fillText(playerBadge, 24, 33);
    ctx.restore();
  }

  // Death Rage Banner (screen space)
  if (deathBanner && !zenMode) {
    ctx.save();
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const bw = Math.min(viewW - 40, ctx.measureText(deathBanner).width + 44);
    const bx = viewW / 2 - bw / 2;
    const by = floorOffsetY + ARENA_ROWS * TILE * 0.28;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by - 26, bw, 44, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fecdd3';
    ctx.fillText(deathBanner, viewW / 2, by + 3);
    ctx.restore();
  }

  // Giant Monkey Horn ("B" Buzina de Macaco) distraction overlay!
  if (activeHorn && !zenMode) {
    const age = (performance.now() - activeHorn.startedAt) / 1000;
    if (age < 2.2) {
      const wobble = Math.sin(age * 24) * 0.14;
      const pop = Math.min(1, age * 8) * (1 - Math.max(0, (age - 1.7) / 0.5));
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pop));
      ctx.translate(viewW / 2, viewH * 0.28);
      ctx.rotate(wobble);
      ctx.scale(1 + Math.sin(age * 16) * 0.08, 1 + Math.cos(age * 16) * 0.08);
      ctx.font = '64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(activeHorn.emoji, 0, 0);
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      const msg = `${activeHorn.senderName}: ${activeHorn.phrase}`;
      ctx.strokeText(msg, 0, 32);
      ctx.fillText(msg, 0, 32);
      ctx.restore();
    }
  }

  ctx.restore(); // end scale
  ctx.restore(); // end dpr + clip
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
