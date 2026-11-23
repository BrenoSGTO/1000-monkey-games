import {
  BIOMES,
  GROUND_HEIGHT,
  MONKEY_SKINS,
  PLAYABLE_HEIGHT,
  WORLD_HEIGHT,
  type BananaCoin,
  type BiomeId,
  type FloatingText,
  type FlyingHazard,
  type MonkeyEntity,
  type ObstacleColumn,
  type Particle,
  type PowerUpOrb,
  type RemoteGhost,
  type SkinDef,
  type SkinId,
} from './types';

export interface RenderFrameState {
  logicalWidth: number;
  timeSec: number;
  worldX: number;
  biome: BiomeId;
  biomeBannerText: string | null;
  biomeBannerTimer: number;
  shakeAmount: number;
  turboFlash: number;
  monkeys: MonkeyEntity[];
  ghosts: RemoteGhost[];
  columns: ObstacleColumn[];
  flyers: FlyingHazard[];
  coins: BananaCoin[];
  powerUps: PowerUpOrb[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  is2PLocal: boolean;
}

function getSkin(id: SkinId): SkinDef {
  return MONKEY_SKINS.find((s) => s.id === id) ?? MONKEY_SKINS[0];
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
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  state: RenderFrameState,
): void {
  const scale = canvasHeight / WORLD_HEIGHT;
  const viewW = state.logicalWidth;

  ctx.save();
  ctx.scale(scale, scale);

  // Screen shake
  if (state.shakeAmount > 0.2) {
    const sx = (Math.random() - 0.5) * state.shakeAmount * 2;
    const sy = (Math.random() - 0.5) * state.shakeAmount * 2;
    ctx.translate(sx, sy);
  }

  // 1. Parallax Sky & Background Layers
  drawParallaxBackground(ctx, viewW, state.worldX, state.timeSec, state.biome);

  // 2. Columns (Bamboo / City Buildings / Space Pillars)
  for (const col of state.columns) {
    if (col.destroyed) continue;
    const sx = col.x - state.worldX;
    if (sx + col.width < -60 || sx > viewW + 60) continue;
    drawObstacleColumn(ctx, col, sx, state.timeSec);
  }

  // 3. Collectibles (Banana Coins & Power-Up Orbs)
  for (const coin of state.coins) {
    if (coin.collected) continue;
    const sx = coin.x - state.worldX;
    if (sx < -40 || sx > viewW + 40) continue;
    drawBananaCoin(ctx, coin, sx, state.timeSec);
  }

  for (const orb of state.powerUps) {
    if (orb.collected) continue;
    const sx = orb.x - state.worldX;
    if (sx < -50 || sx > viewW + 50) continue;
    drawPowerUpOrb(ctx, orb, sx, state.timeSec);
  }

  // 4. Flying Hazards (Angry Birds, Coconut Helis, Space UFOs)
  for (const f of state.flyers) {
    if (f.destroyed) continue;
    const sx = f.x - state.worldX;
    if (sx > viewW + 10 && sx < viewW + 210) {
      drawIncomingWarning(ctx, viewW - 26, f.y, state.timeSec);
    }
    if (sx < -60 || sx > viewW + 60) continue;
    drawFlyingHazard(ctx, f, sx, state.timeSec);
  }

  // 5. Ground Floor
  drawGround(ctx, viewW, state.worldX, state.biome);

  // 6. P2P Friend Ghosts (behind local player)
  for (const g of state.ghosts) {
    const gx = (state.monkeys[0]?.x ?? 180) + (g.worldX - state.worldX);
    if (gx < -40) {
      drawEdgeIndicator(ctx, 22, g.y, g.name, g.color, true);
      continue;
    }
    if (gx > viewW + 40) {
      drawEdgeIndicator(ctx, viewW - 22, g.y, g.name, g.color, false);
      continue;
    }
    drawMonkeyGhost(ctx, g, gx, state.timeSec);
  }

  // 7. Local Monkeys
  for (const m of state.monkeys) {
    drawMonkeyEntity(ctx, m, state.timeSec, state.is2PLocal);
  }

  // 8. Particles
  drawParticles(ctx, state.particles, state.worldX);

  // 9. Floating Texts
  drawFloatingTexts(ctx, state.floatingTexts);

  // 10. Turbo speedlines & flash
  if (state.turboFlash > 0) {
    drawSpeedLines(ctx, viewW, state.timeSec, state.turboFlash);
  }

  // 11. Biome Transition Banner
  if (state.biomeBannerText && state.biomeBannerTimer > 0) {
    const alpha = Math.min(1, state.biomeBannerTimer * 1.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    const bw = 340;
    const bh = 54;
    roundRectPath(ctx, viewW * 0.5 - bw * 0.5, 118, bw, bh, 16);
    ctx.fill();
    ctx.strokeStyle = BIOMES[state.biome].accent;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.biomeBannerText, viewW * 0.5, 144);
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(BIOMES[state.biome].subtitle, viewW * 0.5, 163);
    ctx.restore();
  }

  ctx.restore();
}

function drawParallaxBackground(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  worldX: number,
  timeSec: number,
  biome: BiomeId,
): void {
  const def = BIOMES[biome];
  const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAYABLE_HEIGHT);
  skyGrad.addColorStop(0, def.skyTop);
  skyGrad.addColorStop(0.55, def.skyMid);
  skyGrad.addColorStop(1, def.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, viewW, PLAYABLE_HEIGHT);

  if (biome === 'jungle') {
    // Sun
    const sunX = viewW * 0.82;
    ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
    ctx.beginPath();
    ctx.arc(sunX, 95, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(sunX, 95, 38, 0, Math.PI * 2);
    ctx.fill();

    // Drifting clouds
    drawClouds(ctx, viewW, worldX * 0.08, timeSec, 'rgba(255,255,255,0.72)');

    // Far mountains
    drawHillsLayer(ctx, viewW, worldX * 0.14, PLAYABLE_HEIGHT - 135, 78, 220, '#0d9488', 0.48);
    // Mid jungle canopy
    drawHillsLayer(ctx, viewW, worldX * 0.28, PLAYABLE_HEIGHT - 85, 58, 150, '#047857', 0.72);
    // Foreground silhouettes
    drawJunglePalms(ctx, viewW, worldX * 0.45);
  } else if (biome === 'city') {
    // Sunset / Moon glow
    ctx.fillStyle = 'rgba(251, 146, 60, 0.28)';
    ctx.beginPath();
    ctx.arc(viewW * 0.78, 130, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdba74';
    ctx.beginPath();
    ctx.arc(viewW * 0.78, 130, 44, 0, Math.PI * 2);
    ctx.fill();

    drawClouds(ctx, viewW, worldX * 0.08, timeSec, 'rgba(253, 186, 116, 0.36)');
    drawCitySkyline(ctx, viewW, worldX * 0.18, '#1e1b4b', 0.75, true);
    drawCitySkyline(ctx, viewW, worldX * 0.35, '#0f172a', 0.92, false);
  } else {
    // Space stars
    drawSpaceStars(ctx, viewW, worldX * 0.12, timeSec);
    // Planet Banana
    const px = viewW * 0.76 - ((worldX * 0.03) % (viewW + 240)) + 120;
    ctx.save();
    ctx.translate(((px % (viewW + 240)) + (viewW + 240)) % (viewW + 240) - 120, 128);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 76, 0, Math.PI * 2);
    ctx.fill();
    const pGrad = ctx.createRadialGradient(-16, -18, 10, 0, 0, 52);
    pGrad.addColorStop(0, '#fef08a');
    pGrad.addColorStop(0.6, '#eab308');
    pGrad.addColorStop(1, '#854d0e');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fill();
    // Ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 4, 86, 17, -0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Distant floating space rocks
    drawSpaceRocks(ctx, viewW, worldX * 0.28, timeSec);
  }
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  offset: number,
  timeSec: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const span = 280;
  const count = Math.ceil(viewW / span) + 2;
  const shift = ((offset + timeSec * 8) % span + span) % span;
  for (let i = -1; i < count; i++) {
    const cx = i * span - shift + 80;
    const cy = 68 + ((i * 53) % 70);
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.arc(cx + 24, cy - 8, 22, 0, Math.PI * 2);
    ctx.arc(cx + 46, cy + 2, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHillsLayer(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  offset: number,
  baseY: number,
  amp: number,
  period: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, PLAYABLE_HEIGHT);
  for (let x = 0; x <= viewW + 20; x += 20) {
    const wx = x + offset;
    const h = Math.sin(wx / period) * amp + Math.cos(wx / (period * 0.53)) * (amp * 0.42);
    ctx.lineTo(x, baseY - Math.abs(h));
  }
  ctx.lineTo(viewW + 20, PLAYABLE_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawJunglePalms(ctx: CanvasRenderingContext2D, viewW: number, offset: number): void {
  const span = 240;
  const shift = ((offset % span) + span) % span;
  const count = Math.ceil(viewW / span) + 2;
  ctx.fillStyle = '#064e3b';
  for (let i = -1; i < count; i++) {
    const px = i * span - shift + 60;
    const h = 115 + ((Math.abs(i) * 37) % 45);
    const topY = PLAYABLE_HEIGHT - h;
    ctx.fillRect(px - 6, topY, 12, h);
    for (let a = -2; a <= 2; a++) {
      ctx.save();
      ctx.translate(px, topY);
      ctx.rotate(a * 0.45);
      ctx.beginPath();
      ctx.ellipse(26, 0, 28, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawCitySkyline(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  offset: number,
  color: string,
  alpha: number,
  far: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const span = 96;
  const shift = ((offset % span) + span) % span;
  const startIdx = Math.floor(offset / span) - 1;
  const count = Math.ceil(viewW / span) + 3;

  for (let k = 0; k < count; k++) {
    const idx = startIdx + k;
    const bx = k * span - shift - span;
    const h = (far ? 160 : 105) + (Math.abs(idx * 73) % (far ? 140 : 110));
    const by = PLAYABLE_HEIGHT - h;
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, span - 8, h);

    // Lit windows
    ctx.fillStyle = far ? 'rgba(253, 224, 71, 0.35)' : 'rgba(56, 189, 248, 0.45)';
    for (let wy = by + 14; wy < PLAYABLE_HEIGHT - 24; wy += 22) {
      for (let wx = bx + 10; wx < bx + span - 22; wx += 18) {
        if ((wx + wy + idx) % 3 !== 0) {
          ctx.fillRect(wx, wy, 9, 12);
        }
      }
    }

    if (!far && Math.abs(idx) % 4 === 0) {
      ctx.fillStyle = '#ec4899';
      roundRectPath(ctx, bx + 8, by - 22, span - 24, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(idx % 8 === 0 ? 'PIX MICO' : 'BANANA BET', bx + (span - 8) * 0.5, by - 10);
    }
  }
  ctx.restore();
}

function drawSpaceStars(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  offset: number,
  timeSec: number,
): void {
  const span = 180;
  const shift = ((offset % span) + span) % span;
  const startIdx = Math.floor(offset / span) - 1;
  const count = Math.ceil(viewW / span) + 3;

  for (let k = 0; k < count; k++) {
    const idx = startIdx + k;
    const baseX = k * span - shift - span;
    for (let s = 0; s < 5; s++) {
      const sx = baseX + ((Math.abs(idx * 37 + s * 61)) % span);
      const sy = 20 + ((Math.abs(idx * 89 + s * 97)) % (PLAYABLE_HEIGHT - 50));
      const twinkle = 0.45 + 0.55 * Math.sin(timeSec * 3.5 + idx + s);
      ctx.fillStyle = `rgba(255, 255, 255, ${twinkle.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (s % 2) + 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSpaceRocks(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  offset: number,
  timeSec: number,
): void {
  const span = 260;
  const shift = ((offset % span) + span) % span;
  const count = Math.ceil(viewW / span) + 2;
  for (let i = -1; i < count; i++) {
    const rx = i * span - shift + 110;
    const ry = 180 + ((Math.abs(i) * 97) % 210) + Math.sin(timeSec * 1.4 + i) * 14;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(timeSec * 0.35 + i);
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  worldX: number,
  biome: BiomeId,
): void {
  const def = BIOMES[biome];
  const y = PLAYABLE_HEIGHT;

  ctx.fillStyle = def.groundBody;
  ctx.fillRect(0, y, viewW, GROUND_HEIGHT);

  ctx.fillStyle = def.groundTop;
  ctx.fillRect(0, y, viewW, 18);

  // Scrolling surface detail
  const tileW = 48;
  const shift = ((worldX % tileW) + tileW) % tileW;
  const count = Math.ceil(viewW / tileW) + 2;

  if (biome === 'jungle') {
    ctx.fillStyle = '#15803d';
    for (let i = -1; i < count; i++) {
      const tx = i * tileW - shift;
      ctx.beginPath();
      ctx.moveTo(tx, y + 18);
      ctx.lineTo(tx + 16, y + 4);
      ctx.lineTo(tx + 32, y + 18);
      ctx.fill();
    }
  } else if (biome === 'city') {
    ctx.fillStyle = '#facc15';
    for (let i = -1; i < count; i++) {
      const tx = i * tileW - shift;
      ctx.fillRect(tx + 8, y + 36, 26, 6);
    }
  } else {
    ctx.fillStyle = '#22d3ee';
    for (let i = -1; i < count; i++) {
      const tx = i * tileW - shift;
      ctx.fillRect(tx, y + 4, 24, 5);
    }
  }

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(viewW, y);
  ctx.stroke();
}

function drawObstacleColumn(
  ctx: CanvasRenderingContext2D,
  col: ObstacleColumn,
  sx: number,
  timeSec: number,
): void {
  const gapTop = col.gapY - col.gapHeight * 0.5;
  const gapBot = col.gapY + col.gapHeight * 0.5;
  const w = col.width;

  if (col.biome === 'jungle') {
    // Knotted Bamboo Trunks + Hanging Vines
    drawBambooSection(ctx, sx, -10, w, gapTop + 10, true, col.vineOffset, timeSec);
    drawBambooSection(
      ctx,
      sx,
      gapBot,
      w,
      PLAYABLE_HEIGHT - gapBot + 4,
      false,
      col.vineOffset,
      timeSec,
    );
  } else if (col.biome === 'city') {
    // Sketchy Urban Towers + Street Signs
    drawCityPillar(ctx, sx, -10, w, gapTop + 10, true, col.signText);
    drawCityPillar(ctx, sx, gapBot, w, PLAYABLE_HEIGHT - gapBot + 4, false, col.signText);
  } else {
    // Cosmic Laser / Crystal Pillars
    drawSpacePillar(ctx, sx, -10, w, gapTop + 10, true, timeSec);
    drawSpacePillar(ctx, sx, gapBot, w, PLAYABLE_HEIGHT - gapBot + 4, false, timeSec);
  }
}

function drawBambooSection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  isTop: boolean,
  vineOffset: number,
  timeSec: number,
): void {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#14532d');
  grad.addColorStop(0.32, '#4ade80');
  grad.addColorStop(0.75, '#16a34a');
  grad.addColorStop(1, '#052e16');

  ctx.fillStyle = grad;
  ctx.strokeStyle = '#052e16';
  ctx.lineWidth = 3;
  roundRectPath(ctx, x + 5, y, w - 10, h, 8);
  ctx.fill();
  ctx.stroke();

  // Bamboo node rings
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 4;
  for (let ny = y + 48; ny < y + h - 22; ny += 52) {
    ctx.beginPath();
    ctx.moveTo(x + 3, ny);
    ctx.lineTo(x + w - 3, ny);
    ctx.stroke();
  }

  // Thick bamboo cap near gap
  const capY = isTop ? y + h - 20 : y;
  ctx.fillStyle = '#22c55e';
  roundRectPath(ctx, x - 2, capY, w + 4, 20, 7);
  ctx.fill();
  ctx.strokeStyle = '#052e16';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Decorative leaves + swaying cipó vine on top bamboo
  if (isTop) {
    const sway = Math.sin(timeSec * 3.2 + vineOffset * 6) * 5;
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x + 12, capY + 20);
    ctx.quadraticCurveTo(x + 8 + sway, capY + 34, x + 15 + sway, capY + 46);
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x + 15 + sway, capY + 47, 7, 3.5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawCityPillar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  isTop: boolean,
  signText: string,
): void {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#334155');
  grad.addColorStop(0.5, '#64748b');
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  roundRectPath(ctx, x + 3, y, w - 6, h, 4);
  ctx.fill();
  ctx.stroke();

  // Building windows
  ctx.fillStyle = '#fde047';
  for (let wy = y + 18; wy < y + h - 26; wy += 24) {
    ctx.fillRect(x + 14, wy, 14, 14);
    ctx.fillRect(x + w - 28, wy, 14, 14);
  }

  // Caution bumper + crooked yellow street sign
  const capY = isTop ? y + h - 18 : y;
  ctx.fillStyle = '#f59e0b';
  roundRectPath(ctx, x - 3, capY, w + 6, 18, 4);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.stroke();

  if (!isTop && h > 64) {
    ctx.save();
    ctx.translate(x + w * 0.5, capY + 34);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -32, -11, 64, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(signText, 0, 3);
    ctx.restore();
  }
}

function drawSpacePillar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  isTop: boolean,
  timeSec: number,
): void {
  if (h <= 0) return;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#312e81');
  grad.addColorStop(0.5, '#6366f1');
  grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2.5;
  roundRectPath(ctx, x + 6, y, w - 12, h, 8);
  ctx.fill();
  ctx.stroke();

  // Glowing energy core strip
  const pulse = 0.65 + 0.35 * Math.sin(timeSec * 6);
  ctx.fillStyle = `rgba(34, 211, 238, ${pulse.toFixed(2)})`;
  ctx.fillRect(x + w * 0.5 - 5, y + 6, 10, Math.max(0, h - 12));

  // Emitter cap
  const capY = isTop ? y + h - 18 : y;
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#f472b6';
  ctx.lineWidth = 3;
  roundRectPath(ctx, x, capY, w, 18, 6);
  ctx.fill();
  ctx.stroke();
}

function drawFlyingHazard(
  ctx: CanvasRenderingContext2D,
  f: FlyingHazard,
  sx: number,
  timeSec: number,
): void {
  ctx.save();
  ctx.translate(sx, f.y);

  if (f.kind === 'angry_bird') {
    // Flapping angry tropical bird
    const wingY = Math.sin(timeSec * 18 + f.phase) * 9;
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.arc(-2, 5, f.radius * 0.55, 0, Math.PI);
    ctx.fill();

    // Wing
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.ellipse(5, wingY * 0.5, 11, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Beak pointing left
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-f.radius + 2, -2);
    ctx.lineTo(-f.radius - 13, 3);
    ctx.lineTo(-f.radius + 2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Angry Eye & Eyebrow
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-7, -4, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-9, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-13, -11);
    ctx.lineTo(-2, -7);
    ctx.stroke();
  } else if (f.kind === 'coconut_heli') {
    // Coconut Helicopter!
    ctx.rotate(-0.12);
    // Rotor blur + blades
    const bladeW = 28 + Math.sin(timeSec * 48) * 14;
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fillRect(-3, -27, 6, 10);
    ctx.beginPath();
    ctx.ellipse(0, -27, bladeW, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tail boom
    ctx.fillStyle = '#64748b';
    ctx.fillRect(14, -4, 18, 6);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(30, -11, 4, 18);

    // Coconut hull
    const cGrad = ctx.createRadialGradient(-5, -5, 4, 0, 0, f.radius);
    cGrad.addColorStop(0, '#92400e');
    cGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = cGrad;
    ctx.strokeStyle = '#271203';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, f.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pilot goggles
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-8, -3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Space Monkey UFO
    ctx.fillStyle = '#a855f7';
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 3, f.radius + 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(34, 211, 238, 0.72)';
    ctx.beginPath();
    ctx.arc(0, -2, 11, Math.PI, 0);
    ctx.fill();
    ctx.stroke();

    // Flashing rim lights
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = Math.floor(timeSec * 8 + i) % 2 === 0 ? '#fde047' : '#fb7185';
      ctx.beginPath();
      ctx.arc(i * 11, 4, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawIncomingWarning(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeSec: number,
): void {
  if (Math.floor(timeSec * 12) % 2 === 0) return;
  ctx.save();
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '950 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + 1);
  ctx.restore();
}

function drawBananaCoin(
  ctx: CanvasRenderingContext2D,
  coin: BananaCoin,
  sx: number,
  timeSec: number,
): void {
  const bob = Math.sin(timeSec * 4.5 + coin.bobPhase) * 4;
  ctx.save();
  ctx.translate(sx, coin.y + bob);

  // Glow
  ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, coin.radius + 5, 0, Math.PI * 2);
  ctx.fill();

  // Coin body
  const spinScale = 0.75 + 0.25 * Math.abs(Math.cos(timeSec * 4 + coin.bobPhase));
  ctx.scale(spinScale, 1);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Banana icon inside
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.quadraticCurveTo(3, 8, 6, -5);
  ctx.quadraticCurveTo(2, 2, -5, 4);
  ctx.fill();
  ctx.restore();
}

function drawPowerUpOrb(
  ctx: CanvasRenderingContext2D,
  orb: PowerUpOrb,
  sx: number,
  timeSec: number,
): void {
  const bob = Math.sin(timeSec * 4 + orb.phase) * 6;
  const color =
    orb.type === 'magnet' ? '#f43f5e' : orb.type === 'shield' ? '#84cc16' : '#f97316';
  const label = orb.type === 'magnet' ? '🧲' : orb.type === 'shield' ? '🥥' : '🔥';

  ctx.save();
  ctx.translate(sx, orb.y + bob);

  // Outer pulse ring
  const ringR = orb.radius + 5 + Math.sin(timeSec * 7) * 3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function drawEdgeIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  color: string,
  isLeft: boolean,
): void {
  const clampedY = Math.max(46, Math.min(PLAYABLE_HEIGHT - 30, y));
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, clampedY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '900 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isLeft ? '◀' : '▶', x, clampedY);

  ctx.font = '800 9px system-ui, sans-serif';
  ctx.fillText(name.slice(0, 8), x, clampedY + 18);
  ctx.restore();
}

function drawMonkeyGhost(
  ctx: CanvasRenderingContext2D,
  g: RemoteGhost,
  gx: number,
  timeSec: number,
): void {
  ctx.save();
  ctx.globalAlpha = g.alive ? 0.52 : 0.34;
  drawMonkeyModel(ctx, {
    x: gx,
    y: g.y,
    rot: g.rot,
    scaleX: 1,
    scaleY: 1,
    skin: getSkin(g.skin),
    propAngle: g.propAngle,
    flapTimer: g.flapTimer,
    isBlinking: false,
    dangerLevel: 0,
    alive: g.alive,
    limbFlail: timeSec * 12,
    hasShield: g.hasShield,
    isTurbo: g.isTurbo,
    hasMagnet: false,
    timeSec,
    accentRing: g.color,
    showPropeller: g.alive,
  });

  // Name badge
  ctx.globalAlpha = 0.9;
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  const tw = Math.max(48, ctx.measureText(g.name).width + 12);
  roundRectPath(ctx, gx - tw * 0.5, g.y - 46, tw, 17, 8);
  ctx.fill();
  ctx.fillStyle = g.color;
  ctx.fillText(g.name, gx, g.y - 34);

  if (g.hornText && g.hornTimer > 0) {
    drawSpeechBubble(ctx, gx, g.y - 68, g.hornText);
  }
  ctx.restore();
}

function drawMonkeyEntity(
  ctx: CanvasRenderingContext2D,
  m: MonkeyEntity,
  timeSec: number,
  showBadge: boolean,
): void {
  // Detached flying banana propeller
  if (m.propellerDetached) {
    const p = m.propellerDetached;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    drawBananaBlades(ctx, getSkin(m.skin).propColor, p.rot);
    ctx.restore();
  }

  ctx.save();
  if (m.invulnTimer > 0 && Math.floor(timeSec * 20) % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }

  drawMonkeyModel(ctx, {
    x: m.x,
    y: m.y,
    rot: m.rot,
    scaleX: m.scaleX,
    scaleY: m.scaleY,
    skin: getSkin(m.skin),
    propAngle: m.propAngle,
    flapTimer: m.flapTimer,
    isBlinking: m.isBlinking,
    dangerLevel: m.dangerLevel,
    alive: m.alive,
    limbFlail: m.limbFlail,
    hasShield: m.hasShield,
    isTurbo: m.turboTimer > 0,
    hasMagnet: m.magnetTimer > 0,
    timeSec,
    accentRing: showBadge ? m.badgeColor : undefined,
    showPropeller: m.alive,
  });

  if (showBadge) {
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    roundRectPath(ctx, m.x - 24, m.y - 47, 48, 16, 8);
    ctx.fill();
    ctx.fillStyle = m.badgeColor;
    ctx.fillText(m.name, m.x, m.y - 35);
  }

  ctx.restore();
}

interface DrawMonkeyModelParams {
  x: number;
  y: number;
  rot: number;
  scaleX: number;
  scaleY: number;
  skin: SkinDef;
  propAngle: number;
  flapTimer: number;
  isBlinking: boolean;
  dangerLevel: number;
  alive: boolean;
  limbFlail: number;
  hasShield: boolean;
  isTurbo: boolean;
  hasMagnet: boolean;
  timeSec: number;
  accentRing?: string;
  showPropeller: boolean;
}

function drawMonkeyModel(ctx: CanvasRenderingContext2D, p: DrawMonkeyModelParams): void {
  ctx.save();
  ctx.translate(p.x, p.y);

  // Magnet field aura
  if (p.hasMagnet && p.alive) {
    const r = 30 + ((p.timeSec * 36) % 18);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Turbo rocket flame behind monkey
  if (p.isTurbo && p.alive) {
    ctx.save();
    ctx.rotate(p.rot);
    const flameLen = 28 + Math.sin(p.timeSec * 45) * 10;
    const fGrad = ctx.createLinearGradient(-15, 0, -15 - flameLen, 0);
    fGrad.addColorStop(0, '#fef08a');
    fGrad.addColorStop(0.5, '#f97316');
    fGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-16 - flameLen, 0);
    ctx.lineTo(-14, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.rotate(p.rot);
  ctx.scale(p.scaleX, p.scaleY);

  // Optional player ring (2P / ghost)
  if (p.accentRing) {
    ctx.strokeStyle = p.accentRing;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Royal cape for Pix King
  if (p.skin.id === 'pixking') {
    const wave = Math.sin(p.timeSec * 14) * 5;
    ctx.fillStyle = '#7e22ce';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(-28, 6 + wave, -32, 20 + wave);
    ctx.lineTo(-8, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Swinging Monkey Tail
  const tailWave = p.alive ? Math.sin(p.timeSec * 9) * 6 : Math.sin(p.limbFlail) * 14;
  ctx.strokeStyle = p.skin.furDark;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-15, 6);
  ctx.quadraticCurveTo(-30, 14 + tailWave, -34, -4 + tailWave * 0.5);
  ctx.stroke();
  ctx.strokeStyle = p.skin.furMain;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Ragdoll dangling legs when dead
  if (!p.alive) {
    const lAng = Math.sin(p.limbFlail) * 0.8;
    ctx.save();
    ctx.translate(-5, 16);
    ctx.rotate(lAng);
    ctx.fillStyle = p.skin.furDark;
    roundRectPath(ctx, -4, 0, 8, 15, 4);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(6, 16);
    ctx.rotate(-lAng);
    ctx.fillStyle = p.skin.furDark;
    roundRectPath(ctx, -4, 0, 8, 15, 4);
    ctx.fill();
    ctx.restore();
  }

  // Propeller on head
  if (p.showPropeller) {
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fillRect(-3, -29, 6, 11);
    ctx.strokeRect(-3, -29, 6, 11);
    ctx.save();
    ctx.translate(0, -29);
    drawBananaBlades(ctx, p.skin.propColor, p.propAngle);
    ctx.restore();
  }

  // Ears
  drawEar(ctx, -19, -2, p.skin.furMain, p.skin.furDark);
  drawEar(ctx, 19, -2, p.skin.furMain, p.skin.furDark);

  // Body/Head radial gradient
  const bodyGrad = ctx.createRadialGradient(-5, -6, 3, 0, 0, 23);
  bodyGrad.addColorStop(0, p.skin.furMain);
  bodyGrad.addColorStop(1, p.skin.furDark);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#1c1008';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(0, 1, 21, 19.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Face Mask
  ctx.fillStyle = p.skin.face;
  ctx.beginPath();
  ctx.ellipse(3, 6, 14.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-5, -4, 7.2, 0, Math.PI * 2);
  ctx.arc(9, -4, 7.2, 0, Math.PI * 2);
  ctx.fill();

  // Skin accessories under/around face
  if (p.skin.id === 'intern') {
    // Crooked red tie + coffee eyebags
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(-5, 25);
    ctx.lineTo(1, 28);
    ctx.lineTo(5, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (p.skin.id === 'pixking') {
    // Golden Crown
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -17);
    ctx.lineTo(-13, -27);
    ctx.lineTo(-4, -21);
    ctx.lineTo(0, -29);
    ctx.lineTo(5, -21);
    ctx.lineTo(13, -27);
    ctx.lineTo(11, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Expressive Eyes
  const eyeScale = p.alive ? 1 + p.dangerLevel * 0.28 : 1;
  drawMonkeyEye(ctx, -4.5, -5, eyeScale, p.isBlinking, p.alive, p.isTurbo, p.dangerLevel);
  drawMonkeyEye(ctx, 9.5, -5, eyeScale, p.isBlinking, p.alive, p.isTurbo, p.dangerLevel);

  // Skin Eyewear (Mandrake / Cyber)
  if (p.skin.id === 'mandrake') {
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.6;
    roundRectPath(ctx, -12, -10, 12, 8.5, 2.5);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, 2, -10, 12, 8.5, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(0, -7, 2.5, 2);
  } else if (p.skin.id === 'cyber') {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.55)';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -12, -10, 27, 9, 4);
    ctx.fill();
    ctx.stroke();
  }

  // Dynamic Mouth
  if (!p.alive) {
    // Dizzy open mouth + tongue out!
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.arc(3, 9, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(5, 13, 3.5, 5, 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.dangerLevel > 0.45) {
    // Scared "O" mouth
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(3, 9, 4.5, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Happy / Turbo grin
    ctx.fillStyle = '#991b1b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.quadraticCurveTo(3, p.isTurbo ? 18 : 14, 11, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 6.5, 6, 2.5);
  }

  // Flapping Arm
  const armRot = p.alive
    ? p.flapTimer > 0
      ? Math.sin((p.flapTimer / 0.22) * Math.PI) * 1.15 - 0.3
      : -0.35 + Math.sin(p.timeSec * 8) * 0.15
    : Math.cos(p.limbFlail) * 1.1;

  ctx.save();
  ctx.translate(-4, 8);
  ctx.rotate(armRot);
  ctx.fillStyle = p.skin.furMain;
  ctx.strokeStyle = '#1c1008';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(-6, 3, 10.5, 5.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Astronaut Glass Bubble Helmet
  if (p.skin.id === 'astronaut') {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.fillStyle = 'rgba(186, 230, 253, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 24.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-6, -8, 12, Math.PI * 1.1, Math.PI * 1.55);
    ctx.stroke();
  }

  // Coconut Shield Shell Dome
  if (p.hasShield && p.alive) {
    ctx.strokeStyle = '#84cc16';
    ctx.lineWidth = 3.2;
    ctx.fillStyle = 'rgba(132, 204, 22, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Dizzy stars when ragdolling
  if (!p.alive) {
    for (let s = 0; s < 3; s++) {
      const a = p.timeSec * 7 + (s * Math.PI * 2) / 3;
      const sx = Math.cos(a) * 19;
      const sy = -25 + Math.sin(a) * 6;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outer: string,
  border: string,
): void {
  ctx.fillStyle = outer;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(x, y, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawMonkeyEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  blinking: boolean,
  alive: boolean,
  isTurbo: boolean,
  danger: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (!alive) {
    // X eye
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-3.5, -3.5);
    ctx.lineTo(3.5, 3.5);
    ctx.moveTo(3.5, -3.5);
    ctx.lineTo(-3.5, 3.5);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (blinking) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 1, 4.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (isTurbo) {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(1.2, 0, 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const pupilR = danger > 0.5 ? 2.1 : 2.8;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(1.5, danger > 0.5 ? 0 : -0.3, pupilR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2.3, -1.2, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBananaBlades(ctx: CanvasRenderingContext2D, color: string, angle: number): void {
  const span = Math.cos(angle) * 24;
  // Blur disc
  ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Banana blades
  ctx.fillStyle = color;
  ctx.strokeStyle = '#713f12';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(-span * 0.5, 0, Math.max(4, Math.abs(span) * 0.5), 4, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(span * 0.5, 0, Math.max(4, Math.abs(span) * 0.5), 4, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.save();
  ctx.font = '900 11px system-ui, sans-serif';
  const w = Math.max(70, ctx.measureText(text).width + 16);
  ctx.fillStyle = '#fef08a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  roundRectPath(ctx, x - w * 0.5, y - 14, w, 22, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], worldX: number): void {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x - worldX, p.y);
    ctx.rotate(p.rot);

    if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * (1.8 - alpha), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'shard') {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
  for (const t of texts) {
    const alpha = Math.min(1, (t.life / t.maxLife) * 1.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);
    ctx.font = '950 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
}

function drawSpeedLines(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  timeSec: number,
  intensity: number,
): void {
  ctx.save();
  ctx.strokeStyle = `rgba(254, 240, 138, ${(0.28 * intensity).toFixed(2)})`;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 8; i++) {
    const y = 40 + ((i * 68) % (PLAYABLE_HEIGHT - 60));
    const x = viewW - (((timeSec * 1400 + i * 210) % (viewW + 180)));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 95, y);
    ctx.stroke();
  }
  ctx.restore();
}
