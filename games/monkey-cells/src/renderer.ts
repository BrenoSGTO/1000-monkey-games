import { DUNGEON_THEMES } from './levels';
import {
  type BoomerangEntity,
  type EnemyEntity,
  type EnemyProjectile,
  type FloatingText,
  type GameMode,
  type Particle,
  type PeelBomb,
  type PickupBanana,
  type RemotePlayerState,
  type RoomData,
  type SwingDir,
  type TelegraphMarker,
  type UpgradeId,
  WEAPONS,
  type WeaponId,
} from './types';

export interface LocalRenderPlayer {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  potassium: number;
  weapon: WeaponId;
  downed: boolean;
  reviveTimer: number;
  swingTimer: number;
  swingMax: number;
  swingDir: SwingDir;
  dashTimer: number;
  invulnTimer: number;
  healing: boolean;
  healProgress: number;
  hitFlash: number;
  wallSlideDir: -1 | 0 | 1;
  color: string;
  name: string;
  afterimages: Array<{ x: number; y: number; facing: 1 | -1; alpha: number }>;
}

export interface ArenaHudState {
  round: number;
  maxRounds: number;
  p1Score: number;
  p2Score: number;
  p1Name: string;
  p2Name: string;
  p1Color: string;
  p2Color: string;
  countdown: number;
  bannerText: string;
  onlineScores?: Array<{ id: string; name: string; color: string; score: number; hp: number; maxHp: number }>;
}

export interface RenderContextState {
  mode: GameMode;
  room: RoomData;
  local: LocalRenderPlayer;
  player2?: LocalRenderPlayer | null;
  remotes: RemotePlayerState[];
  boomerangs: BoomerangEntity[];
  peelBombs: PeelBomb[];
  projectiles: EnemyProjectile[];
  telegraphs: TelegraphMarker[];
  pickups: PickupBanana[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  camX: number;
  camY: number;
  shakeX: number;
  shakeY: number;
  time: number;
  roomCleared: boolean;
  bananas: number;
  kills: number;
  score: number;
  upgrades: UpgradeId[];
  friendlyKnockback: boolean;
  isCoop: boolean;
  nearbyChestWeapon: WeaponId | null;
  p2NearbyChestWeapon?: WeaponId | null;
  nearPortal: boolean;
  portalCountdown?: { timer: number; initiatorName: string } | null;
  enemiesFrozen?: boolean;
  arenaHud?: ArenaHudState | null;
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  state: RenderContextState,
): void {
  const { room, camX, camY, shakeX, shakeY, time } = state;

  // 1. Sky / Dungeon Background
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, room.theme.skyTop);
  sky.addColorStop(1, room.theme.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  drawBackgroundParallax(ctx, cw, ch, camX, room, time);

  ctx.save();
  ctx.translate(Math.round(-camX + shakeX), Math.round(-camY + shakeY));

  // 2. Platforms & Walls
  for (const p of room.platforms) {
    if (p.oneWay) {
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = room.theme.tileTop;
      ctx.fillRect(p.x, p.y, p.w, 4);
      ctx.strokeStyle = '#2d190c';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      for (let gx = p.x + 28; gx < p.x + p.w - 10; gx += 36) {
        ctx.beginPath();
        ctx.moveTo(gx, p.y + 4);
        ctx.lineTo(gx, p.y + p.h);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = room.theme.tileBody;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = room.theme.tileTop;
      ctx.fillRect(p.x, p.y, p.w, Math.min(8, p.h));
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      if (p.w > 80 && p.h > 40) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (let bx = p.x + 12; bx < p.x + p.w - 40; bx += 72) {
          ctx.fillRect(bx, p.y + 18, 48, 16);
        }
      }
    }
  }

  // 3. Spikes
  for (const sp of room.spikes) {
    const spikeW = 16;
    const count = Math.max(1, Math.floor(sp.w / spikeW));
    const step = sp.w / count;
    for (let i = 0; i < count; i++) {
      const sx = sp.x + i * step;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(sx, sp.y + sp.h);
      ctx.lineTo(sx + step / 2, sp.y);
      ctx.lineTo(sx + step, sp.y + sp.h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // 4. Portal (Dungeon only)
  if (!room.isArenaRoom) {
    drawPortal(ctx, room.portalX, room.portalY, state.roomCleared, room.isBossRoom, time, state.nearPortal);
  }

  // 5. Chests & Crates
  for (const chst of room.chests) {
    drawChest(ctx, chst.x, chst.y, chst.opened, chst.weaponId, time);
  }
  for (const cr of room.crates) {
    if (cr.broken) continue;
    ctx.fillStyle = '#92400e';
    ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);
    ctx.beginPath();
    ctx.moveTo(cr.x, cr.y);
    ctx.lineTo(cr.x + cr.w, cr.y + cr.h);
    ctx.stroke();
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🍌', cr.x + cr.w / 2, cr.y + cr.h / 2 + 6);
  }

  // 6. Telegraphs
  for (const tg of state.telegraphs) {
    const ratio = 1 - tg.timer / tg.maxTimer;
    const pulse = 0.28 + 0.35 * Math.sin(time * 26);
    ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.68, pulse + ratio * 0.25)})`;
    ctx.fillRect(tg.x, tg.y, tg.w, tg.h);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(tg.x, tg.y, tg.w, tg.h);
    ctx.fillStyle = '#fef2f2';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('❗', tg.x + tg.w / 2, tg.y + 22);
  }

  // 7. Pickups
  for (const pk of state.pickups) {
    const bob = Math.sin(time * 7 + pk.x) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.isHeart) {
      ctx.font = '20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🫐', 0, 6);
    } else {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🍌', 0, 6);
    }
    ctx.restore();
  }

  // 8. Peel Bombs
  for (const b of state.peelBombs) {
    if (b.exploded) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    const blink = Math.sin(time * 26) > 0;
    ctx.fillStyle = blink ? '#ef4444' : '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('💣', 0, 5);
    ctx.restore();
  }

  // 9. Enemies
  for (const e of room.enemies) {
    if (e.hp <= 0) continue;
    drawEnemy(ctx, e, time, !!state.enemiesFrozen);
  }

  // 10. Remote Co-op / PvP Players
  for (const rp of state.remotes) {
    if (!room.isArenaRoom && rp.roomIndex !== room.index) continue;
    drawMonkeyKnight(
      ctx,
      {
        x: rp.x,
        y: rp.y,
        w: 34,
        h: 46,
        vx: rp.vx,
        vy: rp.vy,
        facing: rp.facing,
        weapon: rp.weapon,
        downed: rp.downed,
        reviveTimer: rp.reviveTimer,
        swingTimer: rp.swingTimer,
        swingMax: 0.2,
        swingDir: rp.swingDir,
        dashTimer: rp.dashTimer,
        invulnTimer: 0,
        healing: rp.healing,
        healProgress: 0,
        hitFlash: rp.hitFlash,
        color: rp.color,
        name: rp.name,
        hp: rp.hp,
        maxHp: rp.maxHp,
      },
      time,
      true,
      room.isArenaRoom ? `${rp.name} (${rp.hp}❤️)` : undefined,
    );
  }

  // 11. Local Player 2 (2P Local / Bot Arena)
  if (state.player2) {
    for (const img of state.player2.afterimages) {
      ctx.save();
      ctx.globalAlpha = img.alpha * 0.45;
      ctx.fillStyle = state.player2.color;
      ctx.beginPath();
      ctx.ellipse(img.x + 17, img.y + 23, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawMonkeyKnight(ctx, state.player2, time, true, state.player2.name);
  }

  // 12. Local Player 1 Afterimages & Hero
  for (const img of state.local.afterimages) {
    ctx.save();
    ctx.globalAlpha = img.alpha * 0.45;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(img.x + 17, img.y + 23, 16, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawMonkeyKnight(
    ctx,
    state.local,
    time,
    false,
    room.isArenaRoom ? state.local.name : undefined,
  );

  // 13. Boomerang Slippers
  for (const bm of state.boomerangs) {
    ctx.save();
    ctx.translate(bm.x, bm.y);
    ctx.rotate(bm.angle);
    const scale = bm.isLocal ? 1 : 0.92;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-14, -7, 28, 14, 7);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, -5);
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 5);
    ctx.stroke();
    ctx.restore();
  }

  // 14. Projectiles (Enemy, Bazooka, & Parried)
  for (const pr of state.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);

    if (pr.reflected) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, pr.radius + 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (pr.kind === 'coconut') {
      ctx.fillStyle = pr.reflected ? '#facc15' : '#5c3a21';
      ctx.beginPath();
      ctx.arc(0, 0, pr.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pr.reflected ? '#ef4444' : '#2d190c';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1c0d04';
      ctx.beginPath();
      ctx.arc(-3, -2, 2, 0, Math.PI * 2);
      ctx.arc(2, -3, 2, 0, Math.PI * 2);
      ctx.arc(0, 2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === 'resume_paper') {
      ctx.rotate(time * 12);
      ctx.fillStyle = pr.reflected ? '#fef08a' : '#f8fafc';
      ctx.strokeStyle = pr.reflected ? '#22d3ee' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillRect(-12, -15, 24, 30);
      ctx.strokeRect(-12, -15, 24, 30);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CV', 0, -2);
      ctx.fillText('✖', 0, 10);
    } else if (pr.kind === 'bazooka_banana') {
      ctx.rotate(Math.atan2(pr.vy, pr.vx));
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(-10, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🍌', 2, 6);
    } else if (pr.kind === 'stock_chart') {
      ctx.fillStyle = pr.reflected ? '#065f46' : '#7f1d1d';
      ctx.strokeStyle = pr.reflected ? '#4ade80' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillRect(-26, -14, 52, 28);
      ctx.strokeRect(-26, -14, 52, 28);
      ctx.strokeStyle = pr.reflected ? '#bbf7d0' : '#fca5a5';
      ctx.beginPath();
      ctx.moveTo(-20, -6);
      ctx.lineTo(-6, -2);
      ctx.lineTo(4, 4);
      ctx.lineTo(18, 10);
      ctx.stroke();
      ctx.fillStyle = '#fef2f2';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pr.reflected ? 'PARRY!' : pr.label || 'IBOV -9%', 0, -3);
    } else {
      const dir = pr.dir ?? 1;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-14 * dir, 18);
      ctx.lineTo(12 * dir, -24);
      ctx.lineTo(18 * dir, 18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 15. Particles
  for (const pt of state.particles) {
    const alpha = Math.max(0, pt.life / pt.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (pt.kind === 'lightning' && pt.tx !== undefined && pt.ty !== undefined) {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      const mx = (pt.x + pt.tx) / 2 + (Math.random() - 0.5) * 26;
      const my = (pt.y + pt.ty) / 2 + (Math.random() - 0.5) * 26;
      ctx.lineTo(mx, my);
      ctx.lineTo(pt.tx, pt.ty);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
      continue;
    }

    ctx.translate(pt.x, pt.y);
    if (pt.rot) ctx.rotate(pt.rot);
    if (pt.kind === 'ring') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, pt.size * (1.8 - alpha), 0, Math.PI * 2);
      ctx.stroke();
    } else if (pt.kind === 'spark') {
      const ang = Math.atan2(pt.vy, pt.vx);
      ctx.rotate(ang);
      ctx.fillStyle = pt.color;
      ctx.fillRect(-pt.size * 1.6, -1.5, pt.size * 3.2, 3);
    } else if (pt.kind === 'leaf') {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, pt.size, pt.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = pt.color;
      ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
    }
    ctx.restore();
  }

  // 16. Floating Texts
  for (const ft of state.floatingTexts) {
    const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
    const popScale = ft.isCrit ? 1 + 0.25 * Math.max(0, ft.life / ft.maxLife) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ft.x, ft.y);
    ctx.scale(popScale, popScale);
    ctx.font = `900 ${ft.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = ft.isCrit ? '#450a0a' : '#0f172a';
    ctx.lineWidth = ft.isCrit ? 5 : 4;
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }

  // Interaction Prompts in World Space
  if (state.nearbyChestWeapon) {
    const wDef = WEAPONS[state.nearbyChestWeapon];
    drawPromptPill(
      ctx,
      state.local.x + 17,
      state.local.y - 34,
      `[E] Pegar ${wDef.shortName}`,
      '#facc15',
    );
  }
  if (state.player2 && state.p2NearbyChestWeapon) {
    const wDef = WEAPONS[state.p2NearbyChestWeapon];
    drawPromptPill(
      ctx,
      state.player2.x + 17,
      state.player2.y - 34,
      `[↓+L / Enter] Pegar ${wDef.shortName}`,
      state.player2.color,
    );
  }
  if (!room.isArenaRoom && state.nearPortal && state.roomCleared) {
    drawPromptPill(
      ctx,
      room.portalX,
      room.portalY - 36,
      room.isBossRoom ? '[E] Celebrar Vitória!' : '[E] Próxima Sala ➡',
      '#4ade80',
    );
  }

  ctx.restore();

  // 17. Off-screen Teammate Edge Arrows (Co-op Dungeon)
  if (state.isCoop && !room.isArenaRoom) {
    drawOffscreenTeammateIndicators(ctx, cw, ch, state);
  }

  // 18. Screen-Space HUD
  drawScreenHud(ctx, cw, ch, state);
}

function drawOffscreenTeammateIndicators(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  state: RenderContextState,
): void {
  const { remotes, camX, camY, room, time } = state;
  const margin = 34;

  for (const rp of remotes) {
    if (rp.roomIndex !== room.index) continue;
    const sx = rp.x + 17 - camX;
    const sy = rp.y + 23 - camY;
    const onScreen = sx >= 10 && sx <= cw - 10 && sy >= 10 && sy <= ch - 10;

    if (onScreen && !rp.downed) continue;

    // If downed even on-screen, show urgent pulsing badge at top if far or edge arrow if off-screen
    if (onScreen) continue;

    const cx = cw / 2;
    const cy = ch / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const angle = Math.atan2(dy, dx);

    const clampedX = Math.max(margin, Math.min(cw - margin, sx));
    const clampedY = Math.max(82, Math.min(ch - 60, sy));
    const distMeters = Math.round(Math.hypot(rp.x - state.local.x, rp.y - state.local.y) / 28);

    ctx.save();
    ctx.translate(clampedX, clampedY);

    const pulse = rp.downed ? 1 + Math.sin(time * 14) * 0.16 : 1;
    ctx.scale(pulse, pulse);

    // Arrow pointing toward teammate
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = rp.downed ? '#fb7185' : rp.color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-4, -9);
    ctx.lineTo(-4, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Label pill
    const label = rp.downed
      ? `🆘 ${rp.name} CAÍDO (${Math.ceil(rp.reviveTimer)}s)`
      : `🐒 ${rp.name} (${distMeters}m)`;
    ctx.font = '800 11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 14;
    const boxX = clampedX > cw - 130 ? -tw - 14 : clampedX < 130 ? 14 : -tw / 2;
    const boxY = clampedY > ch - 90 ? -30 : 14;

    ctx.fillStyle = rp.downed ? 'rgba(136, 19, 55, 0.94)' : 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = rp.downed ? '#fb7185' : rp.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, tw, 22, 11);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = rp.downed ? '#fecdd3' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(label, boxX + tw / 2, boxY + 15);
    ctx.restore();
  }
}

function drawPromptPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  ctx.save();
  ctx.font = '800 13px system-ui, sans-serif';
  const tw = ctx.measureText(text).width + 20;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2, y - 14, tw, 26, 13);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y + 4);
  ctx.restore();
}

function drawBackgroundParallax(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  camX: number,
  room: RoomData,
  time: number,
): void {
  ctx.fillStyle = room.theme.wallColor;
  const spacing = 260;
  const offset = -(camX * 0.3) % spacing;
  for (let px = offset - spacing; px < cw + spacing; px += spacing) {
    ctx.fillRect(px, 0, 44, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(px + 6, 0, 8, ch);
    ctx.fillStyle = room.theme.wallColor;
  }

  if (room.isBossRoom) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.06)';
    for (let bx = 60; bx < cw; bx += 140) {
      const bh = 160 + ((bx * 37) % 140);
      ctx.fillRect(bx, ch - bh - 60, 86, bh);
    }
    ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('FARIA LIMA TOWER — 42º ANDAR', 38, ch - 110);
  } else if (room.isArenaRoom) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.07)';
    ctx.font = '900 32px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🥊 ARENA BANANADA 🥊', cw / 2, ch * 0.32);
    ctx.textAlign = 'left';
  } else {
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.16)';
    ctx.lineWidth = 4;
    for (let vx = (offset * 1.4) % 190; vx < cw; vx += 190) {
      const sway = Math.sin(time * 1.5 + vx) * 10;
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.quadraticCurveTo(vx + sway, 65, vx - sway * 0.5, 135);
      ctx.stroke();
    }
  }
}

function drawPortal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unlocked: boolean,
  isBossRoom: boolean,
  time: number,
  near: boolean,
): void {
  ctx.save();
  ctx.translate(x, y + 36);
  const pulse = 1 + Math.sin(time * 5) * 0.06;

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(-34, -56, 68, 112, 34);
  ctx.fill();

  if (unlocked) {
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 42 * pulse);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.55, isBossRoom ? '#f59e0b' : '#4ade80');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26 * pulse, 44 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    if (near) {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🔒', 0, 8);
  }
  ctx.restore();
}

function drawChest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opened: boolean,
  weaponId: WeaponId,
  time: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = opened ? '#451a03' : '#92400e';
  ctx.fillRect(0, 12, 42, 22);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 12, 42, 22);

  ctx.fillStyle = opened ? '#78350f' : '#b45309';
  ctx.fillRect(-2, opened ? -4 : 2, 46, 12);
  ctx.strokeRect(-2, opened ? -4 : 2, 46, 12);

  const bob = opened ? 0 : Math.sin(time * 5) * 4;
  ctx.fillStyle = WEAPONS[weaponId].color;
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(
    opened ? `🔄 ${WEAPONS[weaponId].shortName}` : `✨ ${WEAPONS[weaponId].shortName}`,
    21,
    -10 + bob,
  );
  ctx.restore();
}

function getKnightPalette(playerColor: string, hitFlash: number): {
  furHi: string;
  furBase: string;
  furDark: string;
  maskHi: string;
  maskShade: string;
  innerEar: string;
  capeHi: string;
  capeDark: string;
  sash: string;
} {
  if (hitFlash > 0) {
    return {
      furHi: '#ffffff',
      furBase: '#ffffff',
      furDark: '#e2e8f0',
      maskHi: '#ffffff',
      maskShade: '#f8fafc',
      innerEar: '#ffffff',
      capeHi: '#ffffff',
      capeDark: '#cbd5e1',
      sash: '#ffffff',
    };
  }
  const c = playerColor.toLowerCase();
  if (c.includes('4ade') || c.includes('22c5') || c.includes('16a3')) {
    // Emerald / P2 warm chestnut variant
    return {
      furHi: '#d97706',
      furBase: '#9a3412',
      furDark: '#5c1d0c',
      maskHi: '#fef9c3',
      maskShade: '#fcd34d',
      innerEar: '#fda4af',
      capeHi: '#4ade80',
      capeDark: '#15803d',
      sash: playerColor,
    };
  }
  if (c.includes('fb71') || c.includes('f43f') || c.includes('ef44')) {
    // Crimson / Rose dark cocoa variant
    return {
      furHi: '#a16207',
      furBase: '#78350f',
      furDark: '#451a03',
      maskHi: '#fffbeb',
      maskShade: '#fed7aa',
      innerEar: '#f9a8d4',
      capeHi: '#34d399',
      capeDark: '#065f46',
      sash: playerColor,
    };
  }
  if (c.includes('c084') || c.includes('a855') || c.includes('7c3a')) {
    // Violet / Purple dusk-monkey variant
    return {
      furHi: '#92400e',
      furBase: '#6b21a8',
      furDark: '#3b0764',
      maskHi: '#fef3c7',
      maskShade: '#fde68a',
      innerEar: '#f472b6',
      capeHi: '#4ade80',
      capeDark: '#166534',
      sash: playerColor,
    };
  }
  // Classic golden-chestnut Hollow Chimp (P1 & default)
  return {
    furHi: '#ca8a04',
    furBase: '#a16207',
    furDark: '#713f12',
    maskHi: '#fef9c3',
    maskShade: '#fde68a',
    innerEar: '#fda4af',
    capeHi: '#4ade80',
    capeDark: '#15803d',
    sash: playerColor,
  };
}

function drawMonkeyKnight(
  ctx: CanvasRenderingContext2D,
  p: {
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    facing: 1 | -1;
    weapon: WeaponId;
    downed: boolean;
    reviveTimer: number;
    swingTimer: number;
    swingMax: number;
    swingDir: SwingDir;
    dashTimer: number;
    invulnTimer: number;
    healing: boolean;
    healProgress?: number;
    hitFlash: number;
    wallSlideDir?: -1 | 0 | 1;
    color: string;
    name: string;
    hp: number;
    maxHp: number;
  },
  time: number,
  isRemote: boolean,
  customLabel?: string,
): void {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const seed = (p.name.charCodeAt(0) || 77) * 0.37;
  const pal = getKnightPalette(p.color, p.hitFlash);
  const outline = '#1c0d04';

  const isRunning = Math.abs(p.vx) > 25 && Math.abs(p.vy) < 40;
  const breath = !isRunning && !p.downed ? Math.sin(time * 3.8 + seed) * 0.032 : 0;
  const airStretch = !p.downed ? Math.max(-0.1, Math.min(0.14, Math.abs(p.vy) * 0.00028)) : 0;
  const swingSquash = p.swingTimer > 0 ? 0.08 : 0;
  const scaleX = 1 - breath * 0.6 - airStretch * 0.6 + swingSquash;
  const scaleY = 1 + breath + airStretch - swingSquash * 0.6;

  ctx.save();
  ctx.translate(cx, cy);

  if (p.invulnTimer > 0 && Math.floor(time * 24) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  // Nameplate
  if (isRemote || customLabel) {
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(customLabel || p.name, 0, -35);
    ctx.fillStyle = p.color;
    ctx.fillText(customLabel || p.name, 0, -35);
    if (p.downed) {
      ctx.fillStyle = '#fb7185';
      ctx.strokeText(`💫 CAÍDO! BATA P/ REVIVER (${Math.ceil(p.reviveTimer)}s)`, 0, -50);
      ctx.fillText(`💫 CAÍDO! BATA P/ REVIVER (${Math.ceil(p.reviveTimer)}s)`, 0, -50);
    }
  }

  // Potassium Heal Aura + Progress Ring
  if (p.healing && !p.downed) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 29 + Math.sin(time * 18) * 4, 0, Math.PI * 2);
    ctx.stroke();

    const prog = p.healProgress ?? 0;
    if (prog > 0) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-20, -42, 40, 7);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(-19, -41, 38 * Math.min(1, prog), 5);
    }

    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🍌', 0, -48);
  }

  if (p.downed) {
    ctx.rotate(Math.PI / 2);
  } else if (p.dashTimer > 0) {
    ctx.rotate(p.facing * time * 18);
  } else if (p.wallSlideDir) {
    ctx.rotate(p.wallSlideDir * -0.14);
  }

  ctx.save();
  ctx.scale(p.facing * scaleX, scaleY);

  // 1. Curly Monkey Tail with secondary spring wave reacting to vx & vy
  const tailLagY = Math.max(-8, Math.min(8, -p.vy * 0.015));
  const tailWave = Math.sin(time * (isRunning ? 14 : 6) + seed) * 5 + tailLagY;
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(-9, 10);
  ctx.bezierCurveTo(-24, 10 + tailWave * 0.4, -29, -4 + tailWave, -19, -9 + tailWave * 0.7);
  ctx.stroke();
  ctx.strokeStyle = pal.furDark;
  ctx.lineWidth = 4.4;
  ctx.stroke();
  ctx.fillStyle = pal.maskShade;
  ctx.beginPath();
  ctx.arc(-19, -9 + tailWave * 0.7, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // 2. Billowing Banana-Leaf Cape with central rib & player trim
  const capeWave = Math.min(16, Math.abs(p.vx) * 0.045) + Math.sin(time * 11 + seed) * 3.5;
  const capeLift = Math.max(-6, Math.min(10, p.vy * 0.02));
  const capeGrad = ctx.createLinearGradient(-4, -4, -26 - capeWave, 20);
  capeGrad.addColorStop(0, pal.capeHi);
  capeGrad.addColorStop(1, pal.capeDark);
  ctx.fillStyle = capeGrad;
  ctx.strokeStyle = '#052e16';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-3, -3);
  ctx.quadraticCurveTo(-22 - capeWave, 3 - capeLift * 0.4, -26 - capeWave, 20 - capeLift);
  ctx.quadraticCurveTo(-14 - capeWave * 0.4, 22 - capeLift * 0.5, -3, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Leaf vein & player-color trim stripe on cape
  ctx.strokeStyle = 'rgba(187, 247, 208, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, 3);
  ctx.quadraticCurveTo(-16 - capeWave * 0.5, 10 - capeLift * 0.5, -22 - capeWave * 0.85, 17 - capeLift * 0.8);
  ctx.stroke();

  // 3. Legs & Monkey Feet
  const runCycle = isRunning ? Math.sin(time * 18) * 5.5 : 0;
  const airLegLift = Math.abs(p.vy) > 60 ? -3 : 0;
  ctx.lineWidth = 2.2;
  for (const [lx, off] of [
    [-5, runCycle],
    [5, -runCycle],
  ] as const) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(lx, 17);
    ctx.lineTo(lx + off * 0.6, 23 + airLegLift);
    ctx.stroke();
    ctx.strokeStyle = pal.furDark;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Foot paw
    ctx.fillStyle = pal.maskShade;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(lx + off * 0.6 + 1.8, 23.5 + airLegLift, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 4. Torso & Belly Patch + Warrior Sash
  const bodyGrad = ctx.createRadialGradient(-3, 5, 2, 0, 9, 14);
  bodyGrad.addColorStop(0, pal.furBase);
  bodyGrad.addColorStop(1, pal.furDark);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 9, 11.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cream belly patch
  ctx.fillStyle = pal.maskShade;
  ctx.beginPath();
  ctx.ellipse(3, 10, 6.5, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Player-color warrior belt/sash
  ctx.fillStyle = pal.sash;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(-10.5, 4, 21, 5.2, 2.5);
  ctx.fill();
  ctx.stroke();

  // 5. Head & Ears (Big head silhouette + pink inner ear)
  const earBob = isRunning ? Math.sin(time * 18) * 1.2 : 0;
  // Back ear
  ctx.fillStyle = pal.furBase;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(12, -8 - earBob, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head sphere with radial fur gradient
  const headGrad = ctx.createRadialGradient(-3, -12, 2, 1, -8, 15);
  headGrad.addColorStop(0, pal.furHi);
  headGrad.addColorStop(0.6, pal.furBase);
  headGrad.addColorStop(1, pal.furDark);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(1, -8, 13.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Front ear with rosy pink inner ear
  ctx.fillStyle = pal.furBase;
  ctx.beginPath();
  ctx.arc(-11.5, -7 - earBob, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.innerEar;
  ctx.beginPath();
  ctx.arc(-11.5, -7 - earBob, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // 6. Heart / Peanut-Shaped Cream Face Mask
  const maskGrad = ctx.createLinearGradient(0, -14, 6, 3);
  maskGrad.addColorStop(0, pal.maskHi);
  maskGrad.addColorStop(1, pal.maskShade);
  ctx.fillStyle = maskGrad;
  ctx.strokeStyle = pal.furDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(4.5, -10.5);
  ctx.bezierCurveTo(8, -14, 14, -10, 12.5, -5.5);
  ctx.bezierCurveTo(14.5, -1, 10, 2.5, 4.5, 1.5);
  ctx.bezierCurveTo(-1, 2.5, -5, -1, -3, -5.5);
  ctx.bezierCurveTo(-4.5, -10, 1, -14, 4.5, -10.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 7. Expressive Eyes, Blinking, Highlights, Eyebrows & Mouth
  const blinkCycle = (time * 0.9 + seed) % 4.2;
  const isBlinking = !p.downed && p.swingTimer <= 0 && p.hitFlash <= 0 && blinkCycle > 4.04;
  const lookY = Math.max(-1.1, Math.min(1.1, p.vy * 0.0025));

  if (p.downed) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    for (const ex of [0.5, 8.2]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, -9.5);
      ctx.lineTo(ex + 2, -5.5);
      ctx.moveTo(ex + 2, -9.5);
      ctx.lineTo(ex - 2, -5.5);
      ctx.stroke();
    }
    // Dizzy tongue out
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(6, -0.5, 2.5, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.hitFlash > 0) {
    // Wincing > < eyes!
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1, -10);
    ctx.lineTo(2.5, -7.5);
    ctx.lineTo(-1, -5);
    ctx.moveTo(10.5, -10);
    ctx.lineTo(7, -7.5);
    ctx.lineTo(10.5, -5);
    ctx.stroke();
  } else if (isBlinking || p.healing) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(1, -7, 2.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8.5, -7, 2.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    if (p.healing) {
      // Happy munching mouth
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(5, -2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const ex of [1.2, 8.8]) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ex, -7.5, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const px = ex + 1.0;
      const py = -7.5 + lookY;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px, py, 1.75, 0, Math.PI * 2);
      ctx.fill();

      // White eye highlight glint
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px - 0.65, py - 0.75, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    // Determined / attacking eyebrows & mouth
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    if (p.swingTimer > 0) {
      ctx.beginPath();
      ctx.moveTo(-2, -12.2);
      ctx.lineTo(3, -10.4);
      ctx.moveTo(11, -12.2);
      ctx.lineTo(7, -10.4);
      ctx.stroke();
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(5.5, -2.2, 2.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(5.2, -3.2, 2.8, 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }

  // 8. Cracked Coconut Helmet (3D gradient + white coconut meat rim + crack + sprouting twin leaf)
  const cocoGrad = ctx.createRadialGradient(-3, -18, 2, 1, -14, 15);
  cocoGrad.addColorStop(0, p.hitFlash > 0 ? '#ffffff' : '#854d0e');
  cocoGrad.addColorStop(0.55, p.hitFlash > 0 ? '#ffffff' : '#5c3a21');
  cocoGrad.addColorStop(1, p.hitFlash > 0 ? '#e2e8f0' : '#2d190c');
  ctx.fillStyle = cocoGrad;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(1, -11.5, 14.4, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Creamy white coconut flesh rim
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-12, -11.5);
  ctx.quadraticCurveTo(1, -9, 14, -11.5);
  ctx.stroke();

  // Helmet crack
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(2.5, -25);
  ctx.lineTo(-0.5, -18.5);
  ctx.lineTo(3.5, -15);
  ctx.lineTo(0.5, -11.5);
  ctx.stroke();

  // Sprouting leaf on top with subtle velocity sway & player-colored bud!
  const leafSway = Math.max(-0.35, Math.min(0.35, -p.vx * 0.0012)) + Math.sin(time * 5 + seed) * 0.1;
  ctx.save();
  ctx.translate(4, -25);
  ctx.rotate(leafSway);
  ctx.fillStyle = '#4ade80';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(4, -1.5, 5.8, 2.7, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.sash;
  ctx.beginPath();
  ctx.arc(0, -1, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 9. Held Weapon + Front Monkey Hand gripping it
  drawHeldWeapon(ctx, p.weapon, p.swingTimer > 0, time, pal.furBase, pal.maskShade);
  ctx.restore();

  // Slash / Thrust VFX Arc
  if (p.swingTimer > 0 && !p.downed) {
    const progress = 1 - p.swingTimer / p.swingMax;
    const wDef = WEAPONS[p.weapon];
    ctx.save();
    if (p.swingDir === 'down') {
      ctx.rotate(Math.PI / 2);
    } else if (p.swingDir === 'up') {
      ctx.rotate(-Math.PI / 2);
    } else if (p.swingDir === 'left') {
      ctx.scale(-1, 1);
    }

    ctx.globalAlpha = Math.max(0.25, 1 - progress * 0.75);
    if (p.weapon === 'electric_broom') {
      const reach = p.swingDir === 'down' || p.swingDir === 'up' ? wDef.rangeY : wDef.rangeX;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(reach * 0.45, -10 + Math.sin(time * 80) * 6);
      ctx.lineTo(reach * 0.9, 4 - Math.sin(time * 80) * 5);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.strokeStyle = wDef.color;
      ctx.lineWidth = p.weapon === 'frying_pan' ? 10 : 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const radius = p.swingDir === 'down' || p.swingDir === 'up' ? wDef.rangeY * 0.8 : wDef.rangeX * 0.78;
      ctx.arc(10, 0, radius, -0.9 + progress * 0.4, 0.9 + progress * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawHeldWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponId,
  swinging: boolean,
  time: number,
  furColor = '#a16207',
  palmColor = '#fde68a',
): void {
  ctx.save();
  ctx.translate(10, 5);
  ctx.rotate(swinging ? 0.92 : -0.42);
  if (weapon === 'banana_sword') {
    const g = ctx.createLinearGradient(0, -10, 30, 4);
    g.addColorStop(0, '#fef08a');
    g.addColorStop(0.6, '#facc15');
    g.addColorStop(1, '#ca8a04');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(18, -16, 31, -4);
    ctx.quadraticCurveTo(16, 5, 0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'frying_pan') {
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.fillRect(0, -2, 16, 4);
    ctx.strokeRect(0, -2, 16, 4);
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(22, 0, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'havaiana_boomerang') {
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0c4a6e';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(4, -5, 16, 9, 4);
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'electric_broom') {
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    ctx.fillStyle = Math.sin(time * 25) > 0 ? '#22d3ee' : '#a5f3fc';
    ctx.strokeStyle = '#083344';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(25, -8);
    ctx.lineTo(36, -11);
    ctx.lineTo(36, 11);
    ctx.lineTo(25, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'banana_bazooka') {
    ctx.fillStyle = '#ea580c';
    ctx.strokeStyle = '#431407';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-4, -6, 28, 12, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(20, -7, 6, 14);
  } else {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(26, 0);
    ctx.moveTo(20, 0);
    ctx.lineTo(31, -8);
    ctx.moveTo(20, 0);
    ctx.lineTo(31, 8);
    ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(32, -8, 3, 0, Math.PI * 2);
    ctx.arc(33, 0, 3, 0, Math.PI * 2);
    ctx.arc(32, 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cute monkey paw gripping the weapon
  ctx.fillStyle = furColor;
  ctx.strokeStyle = '#1c0d04';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(1, 0, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palmColor;
  ctx.beginPath();
  ctx.arc(1.8, 0.4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyEntity, time: number, frozen: boolean): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  if (frozen) {
    ctx.globalAlpha = 0.72;
  }

  // Red telegraph glow aura during windup!
  if (e.state === 'windup') {
    const pulse = 0.35 + 0.3 * Math.sin(time * 28);
    ctx.fillStyle = `rgba(239, 68, 68, ${pulse})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w * 0.72, e.h * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  if (e.kind === 'gorilla_ceo') {
    drawGorillaBoss(ctx, e, time);
    ctx.restore();
    return;
  }

  if (e.kind === 'hr_baboon') {
    drawHrBaboonBoss(ctx, e, time);
    ctx.restore();
    return;
  }

  // Mini HP bar above enemy
  if (e.hp < e.maxHp) {
    const bw = 38;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-bw / 2, -e.h / 2 - 12, bw, 5);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-bw / 2, -e.h / 2 - 12, bw * Math.max(0, e.hp / e.maxHp), 5);
  }

  // Clear exclamation mark telegraph above head!
  if (e.state === 'windup') {
    ctx.font = '900 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    const bounce = Math.sin(time * 32) * 3;
    ctx.strokeText('❗', 0, -e.h / 2 - 16 + bounce);
    ctx.fillText('❗', 0, -e.h / 2 - 16 + bounce);
  } else if (e.stunTimer && e.stunTimer > 0) {
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('⚡CHOQUE!', 0, -e.h / 2 - 16);
  }

  ctx.scale(e.facing, 1);

  if (e.kind === 'nerd_bat') {
    const flap = Math.sin(time * 20) * 10;
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.state === 'windup' ? '#991b1b' : '#6b21a8';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-22, -12 + flap);
    ctx.lineTo(-14, 6);
    ctx.moveTo(6, 0);
    ctx.lineTo(22, -12 + flap);
    ctx.lineTo(14, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-4, -2, 5, 0, Math.PI * 2);
    ctx.arc(5, -2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, -3, 2, 2);
    ctx.fillRect(5, -3, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, 5, 3, 4);
    ctx.fillRect(2, 5, 3, 4);
  } else if (e.kind === 'clt_beetle') {
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.state === 'windup' ? '#7f1d1d' : '#334155';
    ctx.beginPath();
    ctx.arc(0, 4, 20, Math.PI, 0);
    ctx.lineTo(20, 16);
    ctx.lineTo(-20, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(6, 2);
    ctx.lineTo(10, 14);
    ctx.lineTo(2, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.fillRect(14, -6, 10, 20);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, -6, 10, 20);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(4, -5, 6, 4);
  } else if (e.kind === 'coco_archer') {
    const flash = e.hitFlash > 0;
    // Tail
    ctx.strokeStyle = '#1c0d04';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, 8);
    ctx.quadraticCurveTo(-20, 2 + Math.sin(time * 7) * 3, -16, -8);
    ctx.stroke();
    ctx.strokeStyle = flash ? '#ffffff' : '#78350f';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Body & Head with outline
    ctx.fillStyle = flash ? '#ffffff' : '#92400e';
    ctx.strokeStyle = '#1c0d04';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears with pink inner ear
    ctx.fillStyle = flash ? '#ffffff' : '#b45309';
    ctx.beginPath();
    ctx.arc(-10, -12, 5.5, 0, Math.PI * 2);
    ctx.arc(10, -12, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fda4af';
    ctx.beginPath();
    ctx.arc(-10, -12, 2.6, 0, Math.PI * 2);
    ctx.arc(10, -12, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? '#ffffff' : '#b45309';
    ctx.beginPath();
    ctx.arc(0, -10, 10.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face mask & eye with highlight
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(3, -9, 7.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(4, -10.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(5, -10.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4.4, -11.2, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Green archer hood
    ctx.fillStyle = '#15803d';
    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -12, 11, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.lineTo(17, -6);
    ctx.stroke();
    if (e.state === 'windup') {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(16, -4);
      ctx.lineTo(170, -16);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (e.kind === 'bouncy_frog') {
    const crouch = e.state === 'windup' ? 0.72 : 1;
    ctx.scale(1, crouch);
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.state === 'windup' ? '#ef4444' : '#22c55e';
    ctx.beginPath();
    ctx.ellipse(0, 4, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bef264';
    ctx.beginPath();
    ctx.ellipse(3, 7, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4, -10, 6, 0, Math.PI * 2);
    ctx.arc(7, -10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-3, -10, 2.5, 0, Math.PI * 2);
    ctx.arc(8, -10, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHrBaboonBoss(ctx: CanvasRenderingContext2D, e: EnemyEntity, time: number): void {
  ctx.save();
  ctx.scale(e.facing, 1);
  const flash = e.hitFlash > 0;
  const rage = e.phase === 2;

  // White HR dress shirt & tie
  ctx.fillStyle = flash ? '#ffffff' : '#e2e8f0';
  ctx.strokeStyle = rage ? '#ef4444' : '#fb7185';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-26, -10, 52, 46, 12);
  ctx.fill();
  ctx.stroke();

  // Blue lanyard badge
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(-10, -10, 5, 22);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-14, 10, 14, 10);

  // Baboon ears with pink inner ear
  ctx.fillStyle = flash ? '#ffffff' : '#92400e';
  ctx.strokeStyle = '#1c0d04';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(-20, -24, 8, 0, Math.PI * 2);
  ctx.arc(20, -24, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.arc(-20, -24, 4, 0, Math.PI * 2);
  ctx.arc(20, -24, 4, 0, Math.PI * 2);
  ctx.fill();

  // Baboon head & bright red muzzle!
  ctx.fillStyle = flash ? '#ffffff' : '#78350f';
  ctx.beginPath();
  ctx.arc(0, -24, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.ellipse(8, -20, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes with highlights + glasses on tip of nose
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(3, -28, 4.2, 0, Math.PI * 2);
  ctx.arc(14, -28, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(4.2, -28, 1.8, 0, Math.PI * 2);
  ctx.arc(15.2, -28, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(3.6, -28.8, 0.8, 0, Math.PI * 2);
  ctx.arc(14.6, -28.8, 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(-2, -31, 10, 6);
  ctx.strokeRect(10, -31, 10, 6);

  // Giant Red "DEMITIDO" Stamp in hand!
  const armY = e.state === 'windup' ? -18 : Math.sin(time * 8) * 3;
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(18, 2 + armY, 22, 16);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(16, 15 + armY, 26, 7);

  ctx.restore();

  if (e.state === 'dizzy') {
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText('💫 SEM ARGUMENTOS! BATA NELE!', 0, -56);
  } else if (e.state === 'windup') {
    ctx.font = '900 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('❗ FEEDBACK NEGATIVO!', 0, -56);
  } else if (e.stunTimer && e.stunTimer > 0) {
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('⚡ CHOCADO!', 0, -56);
  }
}

function drawGorillaBoss(ctx: CanvasRenderingContext2D, e: EnemyEntity, time: number): void {
  ctx.save();
  ctx.scale(e.facing, 1);
  const rage = e.phase === 2;
  const flash = e.hitFlash > 0;

  ctx.fillStyle = flash ? '#ffffff' : '#18181b';
  ctx.strokeStyle = rage ? '#ef4444' : '#facc15';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-46, -24, 92, 74, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-16, -24);
  ctx.lineTo(16, -24);
  ctx.lineTo(0, 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(-8, -2);
  ctx.lineTo(0, 38);
  ctx.lineTo(8, -2);
  ctx.closePath();
  ctx.fill();

  // Gorilla CEO Ears
  ctx.fillStyle = flash ? '#ffffff' : '#27272a';
  ctx.strokeStyle = rage ? '#ef4444' : '#facc15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(-32, -44, 10, 0, Math.PI * 2);
  ctx.arc(32, -44, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = flash ? '#ffffff' : '#27272a';
  ctx.beginPath();
  ctx.ellipse(0, -42, 34, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#52525b';
  ctx.beginPath();
  ctx.ellipse(6, -34, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Angry CEO sunglasses with glossy glint
  ctx.fillStyle = rage ? '#ef4444' : '#09090b';
  ctx.fillRect(-16, -54, 16, 9);
  ctx.fillRect(6, -54, 16, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(-14, -53, 5, 2.5);
  ctx.fillRect(8, -53, 5, 2.5);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, -51, 6, 3);

  const armSwing = e.state === 'windup' ? -18 : Math.sin(time * 6) * 4;
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.fillRect(26, 8 + armSwing, 38, 28);
  ctx.strokeRect(26, 8 + armSwing, 38, 28);

  ctx.restore();

  if (e.state === 'dizzy') {
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText('💫 TONTO! POGO NELE!', 0, -80);
  } else if (e.state === 'windup') {
    ctx.font = '900 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('❗ REUNIÃO DE EMERGÊNCIA!', 0, -80);
  }
}

function drawDungeonProgressBar(
  ctx: CanvasRenderingContext2D,
  cw: number,
  currentIdx: number,
  roomCleared: boolean,
): void {
  const labels = DUNGEON_THEMES.map((t) => t.shortLabel);
  const compact = cw < 1100;
  const stepW = compact ? 74 : 92;
  const totalW = stepW * labels.length + 24;
  const startX = (cw - totalW) / 2;
  const barY = cw >= 1040 ? 12 : 56;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(startX, barY, totalW, 38, 12);
  ctx.fill();
  ctx.stroke();

  const nodeY = barY + 14;
  for (let i = 0; i < labels.length; i++) {
    const nx = startX + 12 + stepW * i + stepW / 2;
    const isDone = i < currentIdx || (i === currentIdx && roomCleared);
    const isCurr = i === currentIdx;

    if (i < labels.length - 1) {
      ctx.strokeStyle = i < currentIdx ? '#4ade80' : '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(nx + 8, nodeY);
      ctx.lineTo(nx + stepW - 8, nodeY);
      ctx.stroke();
    }

    ctx.fillStyle = isCurr ? '#facc15' : isDone ? '#4ade80' : '#334155';
    ctx.beginPath();
    ctx.arc(nx, nodeY, isCurr ? 6.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (isCurr) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.font = isCurr ? '900 10px system-ui' : '700 9.5px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = isCurr ? '#fef08a' : isDone ? '#86efac' : '#94a3b8';
    ctx.fillText(labels[i], nx, barY + 32);
  }
  ctx.restore();
}

function drawScreenHud(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  state: RenderContextState,
): void {
  const { local, room } = state;

  ctx.save();

  // ARENA MODE HUD
  if (room.isArenaRoom && state.arenaHud) {
    const ah = state.arenaHud;
    // Top-center Scoreboard
    const sbW = 360;
    const sbX = (cw - sbW) / 2;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sbX, 12, sbW, 48, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '800 10px system-ui';
    ctx.fillText(`🥊 ARENA BANANADA — ROUND ${ah.round} / ${ah.maxRounds}`, cw / 2, 27);

    if (ah.onlineScores && ah.onlineScores.length > 0) {
      const summary = ah.onlineScores.map((s) => `${s.name}: ${s.score}🏆 (${s.hp}❤️)`).join('  |  ');
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 12px system-ui';
      ctx.fillText(summary, cw / 2, 47);
    } else {
      ctx.font = '900 16px system-ui';
      ctx.fillStyle = ah.p1Color;
      ctx.textAlign = 'right';
      ctx.fillText(`${ah.p1Name}  ${ah.p1Score}`, cw / 2 - 14, 48);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.fillText('×', cw / 2, 48);
      ctx.fillStyle = ah.p2Color;
      ctx.textAlign = 'left';
      ctx.fillText(`${ah.p2Score}  ${ah.p2Name}`, cw / 2 + 14, 48);
    }

    // P1 Status Box (left)
    drawPlayerCompactBox(ctx, 12, 56, local, 'P1');
    // P2 Status Box (right, for Local 2P or Bot)
    if (state.player2) {
      drawPlayerCompactBox(ctx, cw - 244, 56, state.player2, 'P2');
    }

    // Countdown / KO Banner
    if (ah.countdown > 0 || ah.bannerText) {
      ctx.textAlign = 'center';
      ctx.font = '900 46px system-ui';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 8;
      const msg = ah.countdown > 0 ? `${Math.ceil(ah.countdown)}` : ah.bannerText;
      ctx.strokeText(msg, cw / 2, ch * 0.34);
      ctx.fillStyle = '#facc15';
      ctx.fillText(msg, cw / 2, ch * 0.34);
    }

    // Arena Controls Footer
    drawControlsFooter(ctx, cw, ch, '🎮 Controles: F1');
    ctx.restore();
    return;
  }

  // DUNGEON MODE HUD
  // Top-left Player Status Box
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(12, 56, 256, 94, 12);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < local.maxHp; i++) {
    const hx = 28 + i * 24;
    const hy = 78;
    ctx.font = '18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(i < local.hp ? '❤️' : '🖤', hx, hy);
  }

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(22, 90, 232, 16, 8);
  ctx.fill();
  const potPct = Math.max(0, Math.min(1, local.potassium / 100));
  if (potPct > 0) {
    ctx.fillStyle = local.healing ? '#4ade80' : local.potassium >= 33 ? '#facc15' : '#ca8a04';
    ctx.beginPath();
    ctx.roundRect(22, 90, 232 * potPct, 16, 8);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(
    local.healing
      ? `🍌 COMENDO... ${Math.round(local.healProgress * 100)}%`
      : local.potassium >= 33
        ? `🍌 POTÁSSIO ${Math.floor(local.potassium)}% [Segure Q/F = CURAR]`
        : `🍌 POTÁSSIO ${Math.floor(local.potassium)}% (Bata p/ encher)`,
    138,
    102,
  );

  const wDef = WEAPONS[local.weapon];
  ctx.textAlign = 'left';
  ctx.fillStyle = wDef.color;
  ctx.font = '800 12px system-ui';
  ctx.fillText(`⚔️ ${wDef.name}`, 22, 127);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 11px system-ui';
  ctx.fillText(`Relíquias: ${state.upgrades.length} | 🍌 ${state.bananas} | ☠️ ${state.kills}`, 22, 143);

  // Top-Center Compact Dungeon Progress Minimap
  drawDungeonProgressBar(ctx, cw, room.index, state.roomCleared);

  // Top-Right Room & Score Panel
  const rw = 264;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = room.theme.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cw - rw - 12, 12, rw, state.isCoop ? 72 : 58, 12);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = room.theme.accent;
  ctx.font = '900 12.5px system-ui';
  ctx.fillText(room.theme.name, cw - 22, 32);

  const aliveEnemies = room.enemies.filter((e) => e.hp > 0).length;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 12px system-ui';
  ctx.fillText(
    aliveEnemies > 0
      ? `Inimigos: ${aliveEnemies} | Pts: ${state.score}`
      : `✅ Sala Limpa! Portal ➡ | Pts: ${state.score}`,
    cw - 22,
    51,
  );

  if (state.isCoop) {
    ctx.fillStyle = state.friendlyKnockback ? '#fb7185' : '#4ade80';
    ctx.font = '700 11px system-ui';
    ctx.fillText(
      `[T] Empurrão Amigo: ${state.friendlyKnockback ? '😈 LIGADO' : '😇 DESLIGADO'}`,
      cw - 22,
      70,
    );
  }

  // Local Player DOWNED Banner!
  if (local.downed && state.isCoop) {
    const bw = Math.min(540, cw - 40);
    const bx = (cw - bw) / 2;
    const by = 110;
    const blink = Math.sin(state.time * 12) > 0;
    ctx.fillStyle = blink ? 'rgba(136, 19, 55, 0.94)' : 'rgba(88, 28, 135, 0.92)';
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 46, 12);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fecdd3';
    ctx.font = '900 14px system-ui';
    ctx.fillText(
      `💫 VOCÊ CAIU! Peça pra um aliado te bater para REVIVER na Bananada! (${Math.ceil(local.reviveTimer)}s)`,
      cw / 2,
      by + 28,
    );
  } else if (state.enemiesFrozen) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cw / 2 - 200, 106, 400, 32, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '800 12px system-ui';
    ctx.fillText('⏳ Aguardando aliados escolherem Relíquia (IA pausada)...', cw / 2, 127);
  } else if (state.portalCountdown) {
    const pc = state.portalCountdown;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cw / 2 - 230, 106, 460, 36, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bbf7d0';
    ctx.font = '900 13px system-ui';
    ctx.fillText(
      `🌀 ${pc.initiatorName} entrou no Portal! Avançando em ${pc.timer.toFixed(1)}s ([E] no Portal acelera!)`,
      cw / 2,
      129,
    );
  }

  // BOSS / MINI-BOSS HP BAR
  const boss = room.enemies.find(
    (e) => (e.kind === 'gorilla_ceo' || e.kind === 'hr_baboon') && e.hp > 0,
  );
  if (boss) {
    const isMainBoss = boss.kind === 'gorilla_ceo';
    const bw = Math.min(640, cw - 80);
    const bx = (cw - bw) / 2;
    const by = ch - 72;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = boss.phase === 2 ? '#ef4444' : isMainBoss ? '#facc15' : '#fb7185';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(bx - 10, by - 24, bw + 20, 50, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = boss.phase === 2 ? '#fca5a5' : '#fef08a';
    ctx.font = '900 13px system-ui';
    ctx.fillText(
      isMainBoss
        ? boss.phase === 2
          ? '🦍🔥 O GORILÃO DE TERNO (MODO DEMISSÃO EM MASSA!)'
          : '🦍💼 O GORILÃO DE TERNO — CEO DA FARIA LIMA'
        : '👔📋 GERENTE DE RH BABUÍNO — ENTREVISTA ELIMINATÓRIA',
      cw / 2,
      by - 6,
    );

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(bx, by + 2, bw, 16, 8);
    ctx.fill();

    const hpRatio = Math.max(0, boss.hp / boss.maxHp);
    const barGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    barGrad.addColorStop(0, '#ef4444');
    barGrad.addColorStop(1, isMainBoss ? '#f97316' : '#ec4899');
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(bx, by + 2, bw * hpRatio, 16, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10.5px monospace';
    ctx.fillText(`${Math.ceil(boss.hp)} / ${boss.maxHp} HP`, cw / 2, by + 14);
  }

  // Compact Controls Footer
  drawControlsFooter(ctx, cw, ch, '🎮 Controles: F1');

  ctx.restore();
}

function drawPlayerCompactBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: LocalRenderPlayer,
  tag: string,
): void {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, 232, 74, 12);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = p.color;
  ctx.font = '900 12px system-ui';
  ctx.fillText(`${tag}: ${p.name} • ${WEAPONS[p.weapon].shortName}`, x + 12, y + 20);

  for (let i = 0; i < p.maxHp; i++) {
    ctx.font = '15px system-ui';
    ctx.fillText(i < p.hp ? '❤️' : '🖤', x + 12 + i * 21, y + 41);
  }

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(x + 12, y + 50, 208, 12, 6);
  ctx.fill();
  const pct = Math.max(0, Math.min(1, p.potassium / 100));
  if (pct > 0) {
    ctx.fillStyle = p.potassium >= 33 ? '#facc15' : '#ca8a04';
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 50, 208 * pct, 12, 6);
    ctx.fill();
  }
}

function drawControlsFooter(ctx: CanvasRenderingContext2D, cw: number, ch: number, text: string): void {
  ctx.save();
  ctx.font = '700 11px system-ui, sans-serif';
  const tw = Math.min(cw - 24, ctx.measureText(text).width + 24);
  const bx = (cw - tw) / 2;
  const by = ch - 28;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, tw, 22, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.fillText(text, cw / 2, by + 15, tw - 16);
  ctx.restore();
}
