import { BOSS_SCHEDULE, CHARACTERS, WEAPONS } from './catalog';
import type {
  BossKind,
  EnemyEntity,
  EnemyKind,
  FloatingTextEntity,
  GemKind,
  ParticleEntity,
  PickupEntity,
  PlayerState,
  ProjectileEntity,
  VisualEffect,
} from './types';

export interface RenderFrameState {
  time: number;
  elapsed: number;
  camX: number;
  camY: number;
  shakeX: number;
  shakeY: number;
  players: PlayerState[];
  localPlayerId: string;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  pickups: PickupEntity[];
  vfx: VisualEffect[];
  particles: ParticleEntity[];
  floatingTexts: FloatingTextEntity[];
  joystick: {
    active: boolean;
    originX: number;
    originY: number;
    knobX: number;
    knobY: number;
  };
  bannerText: string;
  bannerTimer: number;
}

function hashTile(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  state: RenderFrameState,
): void {
  const { camX, camY, shakeX, shakeY, time } = state;

  // Base background
  ctx.fillStyle = '#0d131a';
  ctx.fillRect(0, 0, cw, ch);

  const viewLeft = camX - cw / 2 - shakeX;
  const viewTop = camY - ch / 2 - shakeY;

  ctx.save();
  ctx.translate(Math.round(-viewLeft), Math.round(-viewTop));

  drawInfiniteGround(ctx, viewLeft, viewTop, cw, ch);

  // 1. Ground-level Auras & Peel mines (under entities)
  for (const p of state.players) {
    if (p.downed) continue;
    const aura = p.weapons.find((w) => w.id === 'stink_aura');
    if (aura) {
      drawStinkAura(ctx, p, aura.level, aura.evolved, time);
    }
  }

  for (const v of state.vfx) {
    if (!v.active) continue;
    if (v.kind === 'ring' || v.kind === 'stink_pulse' || v.kind === 'explosion') {
      drawVfx(ctx, v);
    }
  }

  // 2. Pickups (XP Bananinhas, Heals, Magnets, Chests)
  for (const g of state.pickups) {
    if (!g.active) continue;
    if (
      g.x < viewLeft - 60 ||
      g.x > viewLeft + cw + 60 ||
      g.y < viewTop - 60 ||
      g.y > viewTop + ch + 60
    ) {
      continue;
    }
    drawPickup(ctx, g, time);
  }

  // 3. Peel Mines on ground
  for (const proj of state.projectiles) {
    if (!proj.active || proj.kind !== 'peel') continue;
    drawProjectile(ctx, proj, time);
  }

  // 4. Enemies (sorted slightly or bosses on top)
  let activeBoss: EnemyEntity | null = null;
  for (const e of state.enemies) {
    if (!e.active) continue;
    if (e.isBoss) activeBoss = e;
    if (
      e.x < viewLeft - 110 ||
      e.x > viewLeft + cw + 110 ||
      e.y < viewTop - 110 ||
      e.y > viewTop + ch + 110
    ) {
      continue;
    }
    drawEnemy(ctx, e, time);
  }

  // 5. Players (alive first, downed angels slightly glowing)
  for (const p of state.players) {
    drawMonkeyPlayer(ctx, p, time);
    if (!p.downed) {
      const orbit = p.weapons.find((w) => w.id === 'coconut_orbit');
      if (orbit) {
        drawCoconutOrbit(ctx, p, orbit.level, orbit.evolved, time);
      }
    }
  }

  // 6. Airborne Projectiles
  for (const proj of state.projectiles) {
    if (!proj.active || proj.kind === 'peel') continue;
    if (
      proj.x < viewLeft - 100 ||
      proj.x > viewLeft + cw + 100 ||
      proj.y < viewTop - 100 ||
      proj.y > viewTop + ch + 100
    ) {
      continue;
    }
    drawProjectile(ctx, proj, time);
  }

  // 7. Foreground VFX (Lightning, Whip Slash)
  for (const v of state.vfx) {
    if (!v.active) continue;
    if (v.kind === 'lightning' || v.kind === 'slash') {
      drawVfx(ctx, v);
    }
  }

  // 8. Particles
  for (const pt of state.particles) {
    if (!pt.active) continue;
    drawParticle(ctx, pt);
  }

  // 9. Floating Damage Numbers
  for (const ft of state.floatingTexts) {
    if (!ft.active) continue;
    const alpha = Math.max(0, Math.min(1, ft.life / (ft.maxLife * 0.45)));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${ft.size}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = ft.crit ? 4 : 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();

  // Screen-space offscreen indicators (Boss & Downed Friends)
  drawOffscreenIndicators(ctx, cw, ch, camX, camY, state, time);

  // Screen-space Boss HP Bar
  if (activeBoss) {
    drawBossBar(ctx, cw, activeBoss);
  }

  // Screen-space Boss / Event Banner
  if (state.bannerTimer > 0 && state.bannerText) {
    drawBanner(ctx, cw, ch, state.bannerText, state.bannerTimer);
  }

  // Screen-space Touch Virtual Joystick
  if (state.joystick.active) {
    drawJoystick(ctx, state.joystick);
  }
}

function drawInfiniteGround(
  ctx: CanvasRenderingContext2D,
  viewLeft: number,
  viewTop: number,
  cw: number,
  ch: number,
): void {
  const tileSize = 112;
  const startX = Math.floor(viewLeft / tileSize);
  const endX = Math.floor((viewLeft + cw) / tileSize) + 1;
  const startY = Math.floor(viewTop / tileSize);
  const endY = Math.floor((viewTop + ch) / tileSize) + 1;

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const px = tx * tileSize;
      const py = ty * tileSize;
      const r = hashTile(tx, ty);

      // Subtle checkerboard stone/moss tiles
      const alt = ((tx + ty) & 1) === 0;
      ctx.fillStyle = alt ? '#111922' : '#0f161f';
      ctx.fillRect(px, py, tileSize, tileSize);

      // Subtle tile border
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, tileSize, tileSize);

      if (r < 0.22) {
        // Jungle grass tuft
        ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
        ctx.beginPath();
        ctx.ellipse(px + 30 + r * 140, py + 45 + r * 90, 14, 7, r * 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (r > 0.85) {
        // Urban asphalt crack / sewer grate
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.16)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + 20, py + 24);
        ctx.lineTo(px + 42, py + 48);
        ctx.lineTo(px + 65, py + 44);
        ctx.stroke();
      } else if (r > 0.62 && r < 0.68) {
        // Faint chalk/Faria Lima lane stripe
        ctx.fillStyle = 'rgba(250, 204, 21, 0.06)';
        ctx.fillRect(px + tileSize * 0.45, py + 16, 8, tileSize - 32);
      }
    }
  }
}

function drawStinkAura(
  ctx: CanvasRenderingContext2D,
  p: PlayerState,
  level: number,
  evolved: boolean,
  time: number,
): void {
  const radius = (72 + level * 14) * (evolved ? 1.45 : 1);
  const pulse = 1 + Math.sin(time * 5) * 0.04;
  const r = radius * pulse;

  const grad = ctx.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r);
  if (evolved) {
    grad.addColorStop(0, 'rgba(168, 85, 247, 0.06)');
    grad.addColorStop(0.7, 'rgba(168, 85, 247, 0.22)');
    grad.addColorStop(1, 'rgba(74, 222, 128, 0)');
  } else {
    grad.addColorStop(0, 'rgba(74, 222, 128, 0.04)');
    grad.addColorStop(0.72, 'rgba(74, 222, 128, 0.19)');
    grad.addColorStop(1, 'rgba(74, 222, 128, 0)');
  }

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = evolved ? 'rgba(192, 132, 252, 0.48)' : 'rgba(74, 222, 128, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -time * 28;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCoconutOrbit(
  ctx: CanvasRenderingContext2D,
  p: PlayerState,
  level: number,
  evolved: boolean,
  time: number,
): void {
  if (!evolved) {
    // Active window 65% of cycle
    const cycle = time % 4.2;
    if (cycle > 2.95) return;
  }
  const count = evolved ? 6 : 1 + level;
  const orbitR = evolved ? 98 : 74 + level * 4;
  const speed = evolved ? 4.6 : 2.8 + level * 0.25;

  for (let i = 0; i < count; i++) {
    const a = time * speed + (i * Math.PI * 2) / count;
    const cx = p.x + Math.cos(a) * orbitR;
    const cy = p.y + Math.sin(a) * orbitR;

    ctx.save();
    ctx.translate(cx, cy);
    if (evolved) {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    const grad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 13);
    grad.addColorStop(0, evolved ? '#fef08a' : '#bef264');
    grad.addColorStop(1, evolved ? '#ea580c' : '#3f6212');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#1a2e05';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, evolved ? 13 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Coconut 3 dots
    ctx.fillStyle = '#1a2e05';
    ctx.beginPath();
    ctx.arc(-3, -2, 1.8, 0, Math.PI * 2);
    ctx.arc(3, -2, 1.8, 0, Math.PI * 2);
    ctx.arc(0, 3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawMonkeyPlayer(
  ctx: CanvasRenderingContext2D,
  p: PlayerState,
  time: number,
): void {
  const def = CHARACTERS[p.charId] ?? CHARACTERS.chimp_clt;
  const moving = Math.hypot(p.vx, p.vy) > 10;
  const bounce = moving && !p.downed ? Math.abs(Math.sin(p.walkPhase)) * 5 : Math.sin(time * 3) * 1.5;
  const scaleX = moving && !p.downed ? 1 + Math.sin(p.walkPhase * 2) * 0.06 : 1;
  const scaleY = moving && !p.downed ? 1 - Math.sin(p.walkPhase * 2) * 0.06 : 1;
  const faceDir = p.facingX < -0.1 ? -1 : 1;

  ctx.save();
  ctx.translate(p.x, p.y);

  // Downed revive circle
  if (p.downed) {
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();

    if (p.reviveProgress > 0) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.reviveProgress));
      ctx.stroke();
    }

    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('CAÍDO! ENCOSTE!', 0, -40);
    ctx.fillText('CAÍDO! ENCOSTE!', 0, -40);
    ctx.globalAlpha = 0.65;
  }

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 22, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Player ring color for co-op clarity
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = p.downed ? 0.45 : 0.7;
  ctx.beginPath();
  ctx.ellipse(0, 22, 21, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = p.downed ? 0.72 : 1;

  ctx.translate(0, -bounce);
  ctx.scale(scaleX, scaleY);

  const flash = p.hitFlash > 0;

  // Animated Tail
  const tailWag = Math.sin(time * 7 + p.walkPhase) * 6;
  ctx.strokeStyle = flash ? '#ffffff' : def.furColor;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-faceDir * 10, 10);
  ctx.quadraticCurveTo(-faceDir * 28, 6 + tailWag, -faceDir * 24, -12 + tailWag);
  ctx.stroke();

  // Body with gradient
  const bodyGrad = ctx.createRadialGradient(-4, 4, 2, 0, 8, 20);
  bodyGrad.addColorStop(0, flash ? '#ffffff' : def.furColor);
  bodyGrad.addColorStop(1, flash ? '#fecaca' : '#1c1917');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 8, 15, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Belly patch
  ctx.fillStyle = flash ? '#ffffff' : def.bellyColor;
  ctx.beginPath();
  ctx.ellipse(faceDir * 2, 9, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet animation
  const legSwing = moving && !p.downed ? Math.sin(p.walkPhase) * 6 : 0;
  ctx.fillStyle = flash ? '#ffffff' : def.furColor;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-6 + legSwing, 21, 5.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(6 - legSwing, 21, 5.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears (big monkey ears!)
  const drawEar = (ex: number, ey: number) => {
    ctx.fillStyle = flash ? '#ffffff' : def.furColor;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(ex, ey, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? '#ffffff' : '#fda4af';
    ctx.beginPath();
    ctx.arc(ex, ey, 3.8, 0, Math.PI * 2);
    ctx.fill();
  };
  drawEar(-16, -12);
  drawEar(16, -12);

  // Head
  const headGrad = ctx.createRadialGradient(-4, -18, 3, 0, -12, 19);
  headGrad.addColorStop(0, flash ? '#ffffff' : def.furColor);
  headGrad.addColorStop(1, flash ? '#fecaca' : '#292524');
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -12, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Face Mask
  ctx.fillStyle = flash ? '#ffffff' : def.bellyColor;
  ctx.beginPath();
  ctx.ellipse(faceDir * 1.5, -8, 12, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (expressive, cross-eyed / looking towards facing)
  const eyeLookX = p.facingX * 1.6;
  const eyeLookY = p.facingY * 1.4;
  if (p.downed) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    for (const ex of [-4.5, 5.5]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, -14.5);
      ctx.lineTo(ex + 2.5, -9.5);
      ctx.moveTo(ex + 2.5, -14.5);
      ctx.lineTo(ex - 2.5, -9.5);
      ctx.stroke();
    }
  } else {
    for (const ex of [-4.5, 5.5]) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ex, -12, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ex + eyeLookX, -12 + eyeLookY, 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + eyeLookX - 0.8, -13 + eyeLookY, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mouth
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (flash) {
    ctx.arc(faceDir * 1, -3, 3, 0, Math.PI * 2);
  } else {
    ctx.arc(faceDir * 1, -5, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  }
  ctx.stroke();

  // Character Accessories
  drawAccessory(ctx, def.accessory, def.accentColor, time, faceDir);

  // Angel Halo if downed
  if (p.downed) {
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -34, 11, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // World-space HP Bar & Name below player
  if (!p.downed) {
    const barW = 40;
    const barH = 5;
    const pct = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(p.x - barW / 2 - 1, p.y + 27, barW + 2, barH + 2);
    ctx.fillStyle = pct > 0.45 ? '#22c55e' : pct > 0.22 ? '#facc15' : '#ef4444';
    ctx.fillRect(p.x - barW / 2, p.y + 28, barW * pct, barH);
  }

  // Show name tag in co-op or always cleanly
  ctx.save();
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = p.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 2.5;
  ctx.strokeText(p.name, p.x, p.y - 34);
  ctx.fillText(p.name, p.x, p.y - 34);
  ctx.restore();
}

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  acc: 'badge' | 'bandana' | 'flies' | 'hoodie' | 'panama',
  accent: string,
  time: number,
  faceDir: number,
): void {
  switch (acc) {
    case 'badge': {
      // CLT Tie & Badge
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(-4, 10);
      ctx.lineTo(0, 17);
      ctx.lineTo(4, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(5, 6, 6, 7);
      break;
    }
    case 'bandana': {
      // Pink Headband
      ctx.fillStyle = accent;
      ctx.strokeStyle = '#881337';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-15, -23, 30, 6, 3);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'flies': {
      // Orbiting Stink Flies
      ctx.fillStyle = '#4ade80';
      for (let i = 0; i < 3; i++) {
        const a = time * 4 + i * 2.1;
        const fx = Math.cos(a) * 22;
        const fy = -12 + Math.sin(a * 1.5) * 10;
        ctx.beginPath();
        ctx.arc(fx, fy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'hoodie': {
      // Neon Hacker Visor
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-11, -15, 22, 6, 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'panama': {
      // Panama Hat
      ctx.fillStyle = '#fef3c7';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -22, 20, 5, faceDir * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-11, -32, 22, 11, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-11, -25, 22, 3);
      break;
    }
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyEntity, time: number): void {
  const flash = e.hitFlash > 0;
  const wobble = Math.sin(time * 9 + e.phase) * 0.1;

  ctx.save();
  ctx.translate(e.x, e.y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, e.radius * 0.85, e.radius * 0.85, e.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (e.isElite && !e.isBoss) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 5 + Math.sin(time * 8) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (e.isBoss) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -time * 32;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawBossSprite(ctx, e.kind as BossKind, e.radius, flash, time);
  } else {
    ctx.rotate(wobble);
    drawNormalEnemySprite(ctx, e.kind as EnemyKind, e.radius, flash, time, e.phase);
  }

  ctx.restore();
}

function drawNormalEnemySprite(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  r: number,
  flash: boolean,
  time: number,
  phase: number,
): void {
  switch (kind) {
    case 'boleto': {
      ctx.fillStyle = flash ? '#ffffff' : '#fefce8';
      ctx.strokeStyle = flash ? '#ffffff' : '#dc2626';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-r * 0.85, -r * 0.95, r * 1.7, r * 1.9, 3);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-r * 0.65, -r * 0.72, r * 1.3, 4);
        // Angry eyes & barcode
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-4, -1, 2.2, 0, Math.PI * 2);
        ctx.arc(4, -1, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-r * 0.55, r * 0.35, r * 1.1, 4);
      }
      break;
    }
    case 'mosquito_dengue': {
      const wingFlap = Math.sin(time * 28 + phase) * 5;
      ctx.fillStyle = flash ? '#ffffff' : 'rgba(226, 232, 240, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-6, -4 + wingFlap * 0.3, 7, 3.5, -0.5, 0, Math.PI * 2);
      ctx.ellipse(6, -4 - wingFlap * 0.3, 7, 3.5, 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = flash ? '#ffffff' : '#1e293b';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 1, r * 0.65, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'pombo_coach': {
      ctx.fillStyle = flash ? '#ffffff' : '#94a3b8';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 2, r * 0.85, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = flash ? '#ffffff' : '#cbd5e1';
      ctx.beginPath();
      ctx.arc(4, -8, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        // Orange beak + red tie
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(11, -9);
        ctx.lineTo(19, -6);
        ctx.lineTo(11, -3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(1, 0, 4, 10);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(6, -9, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'gerente_zumbi': {
      ctx.fillStyle = flash ? '#ffffff' : '#4ade80';
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 2, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        // White dress shirt & red tie
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-8, 2, 16, 12);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-2, 2, 4, 11);
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(-5, -5, 3, 0, Math.PI * 2);
        ctx.arc(5, -5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'babuino_terno': {
      ctx.fillStyle = flash ? '#ffffff' : '#1e293b';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(-r * 0.8, -r * 0.4, r * 1.6, r * 1.3, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = flash ? '#ffffff' : '#7c2d12';
      ctx.beginPath();
      ctx.arc(0, -r * 0.45, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.3, r * 0.35, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-2, 0, 4, 12);
      }
      break;
    }
    case 'motoboy_fantasma': {
      ctx.fillStyle = flash ? '#ffffff' : 'rgba(56, 189, 248, 0.82)';
      ctx.strokeStyle = '#0c4a6e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        // Helmet visor & delivery bag
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-9, -6, 18, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-13, 4, 26, 8);
      }
      break;
    }
    case 'fiscal_cartorio': {
      ctx.fillStyle = flash ? '#ffffff' : '#475569';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.roundRect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76, 8);
      ctx.fill();
      ctx.stroke();
      if (!flash) {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-10, -8, 8, 5);
        ctx.fillRect(2, -8, 8, 5);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-8, 4, 16, 6);
      }
      break;
    }
  }
}

function drawBossSprite(
  ctx: CanvasRenderingContext2D,
  kind: BossKind,
  r: number,
  flash: boolean,
  time: number,
): void {
  const pulse = 1 + Math.sin(time * 5) * 0.04;
  ctx.scale(pulse, pulse);

  const colorMap: Record<BossKind, { body: string; trim: string }> = {
    oswaldo_spc: { body: '#22c55e', trim: '#dc2626' },
    pombo_ceo: { body: '#64748b', trim: '#38bdf8' },
    sindico_implacavel: { body: '#312e81', trim: '#facc15' },
    leao_imposto: { body: '#b45309', trim: '#ef4444' },
    ceifadora_serasa: { body: '#18181b', trim: '#f43f5e' },
  };
  const pal = colorMap[kind] ?? colorMap.oswaldo_spc;

  ctx.fillStyle = flash ? '#ffffff' : pal.body;
  ctx.strokeStyle = flash ? '#ffffff' : pal.trim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (!flash) {
    // Glowing angry eyes
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.15, r * 0.15, 0, Math.PI * 2);
    ctx.arc(r * 0.3, -r * 0.15, r * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Boss crown / tie / scythe detail
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.85);
    ctx.lineTo(-r * 0.25, -r * 1.18);
    ctx.lineTo(0, -r * 0.92);
    ctx.lineTo(r * 0.25, -r * 1.18);
    ctx.lineTo(r * 0.45, -r * 0.85);
    ctx.closePath();
    ctx.fill();

    if (kind === 'ceifadora_serasa') {
      // Giant glowing red scythe
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(r * 0.7, r * 0.8);
      ctx.lineTo(r * 0.9, -r * 1.0);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(r * 0.9, -r * 0.9, r * 0.45, Math.PI * 0.85, Math.PI * 1.85);
      ctx.fill();
    }
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: ProjectileEntity, time: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  switch (p.kind) {
    case 'boomerang': {
      ctx.fillStyle = p.evolved ? '#fef08a' : '#facc15';
      ctx.strokeStyle = p.evolved ? '#ca8a04' : '#713f12';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-p.radius, -4);
      ctx.quadraticCurveTo(0, -p.radius * 1.25, p.radius, -2);
      ctx.quadraticCurveTo(0, -4, -p.radius, -4);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'slipper': {
      ctx.fillStyle = p.evolved ? '#ef4444' : '#fb7185';
      ctx.strokeStyle = '#881337';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius * 1.15, p.radius * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#fff1f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-p.radius * 0.5, -p.radius * 0.3);
      ctx.lineTo(p.radius * 0.3, 0);
      ctx.lineTo(-p.radius * 0.5, p.radius * 0.3);
      ctx.stroke();
      break;
    }
    case 'mango': {
      ctx.fillStyle = p.evolved ? '#bef264' : '#fb923c';
      ctx.strokeStyle = '#431407';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius * 1.25, p.radius * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'pix': {
      ctx.fillStyle = p.evolved ? '#22d3ee' : '#34d399';
      ctx.strokeStyle = '#064e3b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (p.evolved) {
        ctx.moveTo(0, -p.radius);
        ctx.lineTo(p.radius, 0);
        ctx.lineTo(0, p.radius);
        ctx.lineTo(-p.radius, 0);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'peel': {
      const pulse = 1 + Math.sin(time * 8) * 0.08;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = p.evolved ? '#f97316' : '#facc15';
      ctx.strokeStyle = '#713f12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, 6);
      ctx.quadraticCurveTo(0, -10, 11, 6);
      ctx.quadraticCurveTo(0, 0, -11, 6);
      ctx.fill();
      ctx.stroke();
      if (p.evolved) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'enemy_paper': {
      ctx.fillStyle = '#fef2f2';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-8, -6, 16, 12, 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, g: PickupEntity, time: number): void {
  const bob = Math.sin(time * 4 + g.bobPhase) * 3;
  ctx.save();
  ctx.translate(g.x, g.y + bob);

  if (g.kind === 'chest') {
    // Baú do FGTS!
    ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 24 + Math.sin(time * 6) * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.roundRect(-15, -12, 30, 24, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-15, -3, 30, 5);
    ctx.fillRect(-3, -6, 6, 10);
    ctx.restore();
    return;
  }

  if (g.kind === 'magnet') {
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 9, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-10, 0, 5, 6);
    ctx.fillRect(5, 0, 5, 6);
    ctx.restore();
    return;
  }

  if (g.kind === 'heal') {
    ctx.fillStyle = '#fb7185';
    ctx.strokeStyle = '#fff1f2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, -6, 4, 12);
    ctx.fillRect(-6, -2, 12, 4);
    ctx.restore();
    return;
  }

  if (g.kind === 'coin') {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#854d0e';
    ctx.font = '900 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 3.5);
    ctx.restore();
    return;
  }

  // XP Bananinhas!
  const colorMap: Record<'green' | 'gold' | 'bunch', string> = {
    green: '#4ade80',
    gold: '#facc15',
    bunch: '#38bdf8',
  };
  const strokeMap: Record<'green' | 'gold' | 'bunch', string> = {
    green: '#14532d',
    gold: '#713f12',
    bunch: '#0c4a6e',
  };
  const k = (g.kind as 'green' | 'gold' | 'bunch') || 'green';
  const sz = k === 'bunch' ? 11 : k === 'gold' ? 9 : 7.5;

  ctx.rotate(-0.4);
  ctx.fillStyle = colorMap[k];
  ctx.strokeStyle = strokeMap[k];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-sz, -2);
  ctx.quadraticCurveTo(0, -sz * 1.15, sz, -1);
  ctx.quadraticCurveTo(0, sz * 0.35, -sz, -2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawVfx(ctx: CanvasRenderingContext2D, v: VisualEffect): void {
  const t = Math.max(0, Math.min(1, v.life / Math.max(0.01, v.maxLife)));
  ctx.save();
  ctx.globalAlpha = t;

  if (v.kind === 'lightning') {
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 4 * t + 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    const midX = (v.x + v.x2) / 2 + Math.sin(v.x * 13) * 18;
    const midY = (v.y + v.y2) / 2;
    ctx.lineTo(midX, midY);
    ctx.lineTo(v.x2, v.y2);
    ctx.stroke();

    ctx.fillStyle = v.color;
    ctx.globalAlpha = t * 0.32;
    ctx.beginPath();
    ctx.arc(v.x2, v.y2, v.radius, 0, Math.PI * 2);
    ctx.fill();
  } else if (v.kind === 'slash') {
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.ellipse(v.radius * 0.55, 0, v.radius * 0.65, 18 * t + 4, 0, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.fill();
  } else if (v.kind === 'ring') {
    const progress = 1 - t;
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 5 * t + 1;
    ctx.beginPath();
    ctx.arc(v.x, v.y, v.radius * (0.25 + 0.75 * progress), 0, Math.PI * 2);
    ctx.stroke();
  } else if (v.kind === 'explosion') {
    const progress = 1 - t;
    const r = v.radius * (0.4 + 0.6 * progress);
    const grad = ctx.createRadialGradient(v.x, v.y, 2, v.x, v.y, r);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.5, v.color);
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, pt: ParticleEntity): void {
  const alpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pt.x, pt.y);
  ctx.rotate(pt.rot);
  ctx.fillStyle = pt.color;
  if (pt.shape === 'rect') {
    ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.65);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOffscreenIndicators(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  camX: number,
  camY: number,
  state: RenderFrameState,
  time: number,
): void {
  const pad = 34;
  const halfW = cw / 2 - pad;
  const halfH = ch / 2 - pad;

  // Downed teammates
  for (const p of state.players) {
    if (!p.downed || p.id === state.localPlayerId) continue;
    const dx = p.x - camX;
    const dy = p.y - camY;
    if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
    const ang = Math.atan2(dy, dx);
    const ix = cw / 2 + Math.max(-halfW, Math.min(halfW, dx));
    const iy = ch / 2 + Math.max(-halfH, Math.min(halfH, dy));
    drawPointer(ctx, ix, iy, ang, '#4ade80', '🚑', time);
  }

  // Bosses
  for (const e of state.enemies) {
    if (!e.active || !e.isBoss) continue;
    const dx = e.x - camX;
    const dy = e.y - camY;
    if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
    const ang = Math.atan2(dy, dx);
    const ix = cw / 2 + Math.max(-halfW, Math.min(halfW, dx));
    const iy = ch / 2 + Math.max(-halfH, Math.min(halfH, dy));
    drawPointer(ctx, ix, iy, ang, '#ef4444', '💀', time);
  }
}

function drawPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  color: string,
  icon: string,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(time * 7) * 0.1;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(13, -6);
  ctx.lineTo(13, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.font = '14px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 0, 1);
  ctx.restore();
}

function drawBossBar(ctx: CanvasRenderingContext2D, cw: number, boss: EnemyEntity): void {
  const def = BOSS_SCHEDULE.find((b) => b.kind === boss.kind);
  const name = def ? `💀 ${def.name} — ${def.subtitle}` : '💀 BOSS';
  const w = Math.min(520, cw - 36);
  const h = 16;
  const x = (cw - w) / 2;
  const y = 78;
  const pct = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 24, w + 12, h + 30, 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = '800 12px system-ui, sans-serif';
  ctx.fillStyle = '#fecaca';
  ctx.textAlign = 'center';
  ctx.fillText(name, cw / 2, y - 8);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, w, h);
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, '#ef4444');
  grad.addColorStop(1, '#f97316');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w * pct, h);
  ctx.restore();
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  text: string,
  timer: number,
): void {
  const alpha = Math.min(1, timer);
  ctx.save();
  ctx.globalAlpha = alpha;
  const y = ch * 0.24;
  ctx.fillStyle = 'rgba(127, 29, 29, 0.9)';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  const w = Math.min(cw - 32, 540);
  ctx.beginPath();
  ctx.roundRect((cw - w) / 2, y - 24, w, 48, 12);
  ctx.fill();
  ctx.stroke();

  ctx.font = '900 17px system-ui, sans-serif';
  ctx.fillStyle = '#fef08a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cw / 2, y);
  ctx.restore();
}

function drawJoystick(
  ctx: CanvasRenderingContext2D,
  j: RenderFrameState['joystick'],
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(j.originX, j.originY, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
  ctx.beginPath();
  ctx.arc(j.knobX, j.knobY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function getWeaponDisplayName(id: keyof typeof WEAPONS, evolved: boolean): string {
  const def = WEAPONS[id];
  return evolved ? `${def.evolvedEmoji} ${def.evolvedName}` : `${def.emoji} ${def.name}`;
}
