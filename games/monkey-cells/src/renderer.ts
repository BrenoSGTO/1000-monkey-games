import {
  type BoomerangEntity,
  type EnemyEntity,
  type EnemyProjectile,
  type FloatingText,
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

export interface RenderContextState {
  room: RoomData;
  local: LocalRenderPlayer;
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
  nearPortal: boolean;
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

  // Parallax background details
  drawBackgroundParallax(ctx, cw, ch, camX, room, time);

  ctx.save();
  ctx.translate(Math.round(-camX + shakeX), Math.round(-camY + shakeY));

  // 2. Platforms & Walls
  for (const p of room.platforms) {
    if (p.oneWay) {
      // Wooden / Bamboo catwalk
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
      // Brick lines
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

  // 4. Portal at right end
  drawPortal(ctx, room.portalX, room.portalY, state.roomCleared, room.isBossRoom, time, state.nearPortal);

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
    const pulse = 0.25 + 0.35 * Math.sin(time * 24);
    ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.65, pulse + ratio * 0.25)})`;
    ctx.fillRect(tg.x, tg.y, tg.w, tg.h);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2;
    ctx.strokeRect(tg.x, tg.y, tg.w, tg.h);
    ctx.fillStyle = '#fef2f2';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️', tg.x + tg.w / 2, tg.y + 20);
  }

  // 7. Pickups (Golden Bananas & Hearts)
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
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('💣', 0, 5);
    ctx.restore();
  }

  // 9. Enemies
  for (const e of room.enemies) {
    if (e.hp <= 0) continue;
    drawEnemy(ctx, e, time);
  }

  // 10. Remote Co-op Players (in same room)
  for (const rp of state.remotes) {
    if (rp.roomIndex !== room.index) continue;
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
        hitFlash: rp.hitFlash,
        color: rp.color,
        name: rp.name,
        hp: rp.hp,
        maxHp: rp.maxHp,
      },
      time,
      true,
    );
  }

  // 11. Local Player Afterimages & Hero
  for (const img of state.local.afterimages) {
    ctx.save();
    ctx.globalAlpha = img.alpha * 0.45;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(img.x + 17, img.y + 23, 16, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawMonkeyKnight(ctx, state.local, time, false);

  // 12. Boomerang Slippers
  for (const bm of state.boomerangs) {
    ctx.save();
    ctx.translate(bm.x, bm.y);
    ctx.rotate(bm.angle);
    // Havaiana flip-flop!
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

  // 13. Enemy Projectiles
  for (const pr of state.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (pr.kind === 'coconut') {
      ctx.fillStyle = '#5c3a21';
      ctx.beginPath();
      ctx.arc(0, 0, pr.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2d190c';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1c0d04';
      ctx.beginPath();
      ctx.arc(-3, -2, 2, 0, Math.PI * 2);
      ctx.arc(2, -3, 2, 0, Math.PI * 2);
      ctx.arc(0, 2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.kind === 'stock_chart') {
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillRect(-26, -14, 52, 28);
      ctx.strokeRect(-26, -14, 52, 28);
      // Jagged downward red line
      ctx.strokeStyle = '#fca5a5';
      ctx.beginPath();
      ctx.moveTo(-20, -6);
      ctx.lineTo(-6, -2);
      ctx.lineTo(4, 4);
      ctx.lineTo(18, 10);
      ctx.stroke();
      ctx.fillStyle = '#fef2f2';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pr.label || 'IBOV -9%', 0, -3);
    } else {
      // Shockwave
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

  // 14. Particles
  for (const pt of state.particles) {
    const alpha = Math.max(0, pt.life / pt.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    if (pt.rot) ctx.rotate(pt.rot);
    if (pt.kind === 'ring') {
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, pt.size * (1.8 - alpha), 0, Math.PI * 2);
      ctx.stroke();
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

  // 15. Floating Texts
  for (const ft of state.floatingTexts) {
    const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${ft.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
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
  if (state.nearPortal && state.roomCleared) {
    drawPromptPill(
      ctx,
      room.portalX,
      room.portalY - 36,
      room.isBossRoom ? '[E] Celebrar Vitória!' : '[E] Próxima Sala ➡',
      '#4ade80',
    );
  }

  ctx.restore();

  // 16. Screen-Space HUD (Hearts, Potassium, Weapon, Room, Score, Boss Bar)
  drawScreenHud(ctx, cw, ch, state);
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
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
  // Pillars
  ctx.fillStyle = room.theme.wallColor;
  const spacing = 260;
  const offset = -(camX * 0.3) % spacing;
  for (let px = offset - spacing; px < cw + spacing; px += spacing) {
    ctx.fillRect(px, 0, 44, ch);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(px + 6, 0, 8, ch);
    ctx.fillStyle = room.theme.wallColor;
  }

  // Hanging vines or office blinds
  if (room.isBossRoom) {
    // Faria Lima glass skyline
    ctx.fillStyle = 'rgba(250, 204, 21, 0.06)';
    for (let bx = 60; bx < cw; bx += 140) {
      const bh = 160 + ((bx * 37) % 140);
      ctx.fillRect(bx, ch - bh - 60, 86, bh);
    }
    ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('FARIA LIMA TOWER — 42º ANDAR', 38, ch - 110);
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

  // Stone arch
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
  // Base
  ctx.fillStyle = opened ? '#451a03' : '#92400e';
  ctx.fillRect(0, 12, 42, 22);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 12, 42, 22);

  // Lid
  ctx.fillStyle = opened ? '#78350f' : '#b45309';
  ctx.fillRect(-2, opened ? -4 : 2, 46, 12);
  ctx.strokeRect(-2, opened ? -4 : 2, 46, 12);

  if (!opened) {
    const bob = Math.sin(time * 5) * 4;
    ctx.fillStyle = WEAPONS[weaponId].color;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`✨ ${WEAPONS[weaponId].shortName}`, 21, -10 + bob);
  }
  ctx.restore();
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
    hitFlash: number;
    color: string;
    name: string;
    hp: number;
    maxHp: number;
  },
  time: number,
  isRemote: boolean,
): void {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  if (p.invulnTimer > 0 && Math.floor(time * 24) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  // Nameplate for Co-op teammates (or self if desired)
  if (isRemote) {
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color;
    ctx.fillText(p.name, 0, -34);
    if (p.downed) {
      ctx.fillStyle = '#fb7185';
      ctx.fillText(`💫 CAÍDO! BATA P/ REVIVER (${Math.ceil(p.reviveTimer)}s)`, 0, -48);
    }
  }

  // Potassium Heal Aura
  if (p.healing && !p.downed) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28 + Math.sin(time * 18) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🍌', 0, -32);
  }

  if (p.downed) {
    ctx.rotate(Math.PI / 2);
  } else if (p.dashTimer > 0) {
    ctx.rotate(p.facing * time * 18);
  }

  ctx.save();
  ctx.scale(p.facing, 1);

  // Curly Monkey Tail
  ctx.strokeStyle = p.hitFlash > 0 ? '#ffffff' : '#78350f';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, 10);
  ctx.quadraticCurveTo(-24, 6 + Math.sin(time * 10) * 5, -20, -6);
  ctx.stroke();

  // Banana-Leaf Cape billowing behind
  const capeWave = Math.min(14, Math.abs(p.vx) * 0.04) + Math.sin(time * 12) * 3;
  ctx.fillStyle = '#22c55e';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -4);
  ctx.quadraticCurveTo(-22 - capeWave, 4, -24 - capeWave, 20);
  ctx.lineTo(-4, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#92400e';
  ctx.beginPath();
  ctx.ellipse(0, 9, 12, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.fillRect(-6, 4, 12, 5); // Player color belt

  // Legs
  const runCycle = Math.abs(p.vx) > 25 ? Math.sin(time * 18) * 5 : 0;
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-5, 18);
  ctx.lineTo(-6 + runCycle, 23);
  ctx.moveTo(5, 18);
  ctx.lineTo(6 - runCycle, 23);
  ctx.stroke();

  // Head
  ctx.fillStyle = p.hitFlash > 0 ? '#ffffff' : '#a16207';
  ctx.beginPath();
  ctx.arc(1, -8, 13, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.arc(-11, -7, 5, 0, Math.PI * 2);
  ctx.fill();
  // Face
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(4, -5, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Goofy Cross-Eyed Eyes
  if (p.downed) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText('x  x', -1, -5);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(1, -8, 3.6, 0, Math.PI * 2);
    ctx.arc(8, -8, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(2.5, -7.5, 1.7, 0, Math.PI * 2);
    ctx.arc(6.8, -8.5, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // CRACKED COCONUT HELMET!
  ctx.fillStyle = '#5c3a21';
  ctx.strokeStyle = '#2d190c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1, -11, 13.5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Coconut milk rim
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-11, -11);
  ctx.lineTo(13, -11);
  ctx.stroke();
  // Crack
  ctx.strokeStyle = '#1c0d04';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(2, -23);
  ctx.lineTo(-1, -17);
  ctx.lineTo(3, -14);
  ctx.lineTo(0, -11);
  ctx.stroke();
  // Sprout leaf on helmet
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.ellipse(6, -24, 5, 2.5, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Held Weapon (idle or swinging)
  drawHeldWeapon(ctx, p.weapon, p.swingTimer > 0);

  ctx.restore();

  // Slash VFX Arc (in world-facing orientation)
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
    ctx.globalAlpha = Math.max(0.2, 1 - progress * 0.8);
    ctx.strokeStyle = wDef.color;
    ctx.lineWidth = p.weapon === 'frying_pan' ? 10 : 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const radius = p.swingDir === 'down' || p.swingDir === 'up' ? wDef.rangeY * 0.8 : wDef.rangeX * 0.78;
    ctx.arc(10, 0, radius, -0.9 + progress * 0.4, 0.9 + progress * 0.4);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawHeldWeapon(ctx: CanvasRenderingContext2D, weapon: WeaponId, swinging: boolean): void {
  ctx.save();
  ctx.translate(10, 4);
  ctx.rotate(swinging ? 0.9 : -0.45);
  if (weapon === 'banana_sword') {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(18, -16, 30, -4);
    ctx.quadraticCurveTo(16, 4, 0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'frying_pan') {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, -2, 16, 4);
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(22, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (weapon === 'havaiana_boomerang') {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(4, -5, 16, 9, 4);
    ctx.fill();
  } else {
    // Sacred 3-prong branch
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
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyEntity, time: number): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  if (e.kind === 'gorilla_ceo') {
    drawGorillaBoss(ctx, e, time);
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

  ctx.scale(e.facing, 1);

  if (e.kind === 'nerd_bat') {
    const flap = Math.sin(time * 20) * 10;
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#6b21a8';
    // Wings
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-22, -12 + flap);
    ctx.lineTo(-14, 6);
    ctx.moveTo(6, 0);
    ctx.lineTo(22, -12 + flap);
    ctx.lineTo(14, 6);
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    // Thick Nerd Glasses!
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
    // Buck teeth
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, 5, 3, 4);
    ctx.fillRect(2, 5, 3, 4);
  } else if (e.kind === 'clt_beetle') {
    // Armored Beetle with Tie & Briefcase Shield
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#334155';
    ctx.beginPath();
    ctx.arc(0, 4, 20, Math.PI, 0);
    ctx.lineTo(20, 16);
    ctx.lineTo(-20, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Red CLT Tie
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(6, 2);
    ctx.lineTo(10, 14);
    ctx.lineTo(2, 14);
    ctx.closePath();
    ctx.fill();
    // Briefcase shield in front!
    ctx.fillStyle = '#78350f';
    ctx.fillRect(14, -6, 10, 20);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, -6, 10, 20);
    // Angry eyes
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(4, -5, 6, 4);
  } else if (e.kind === 'coco_archer') {
    // Marmoset Archer with ear tufts & slingshot
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#78350f';
    ctx.beginPath();
    ctx.ellipse(0, 6, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -10, 10, 0, Math.PI * 2);
    ctx.fill();
    // White ear tufts
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(-10, -13, 5, 0, Math.PI * 2);
    ctx.arc(10, -13, 5, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-5, -12, 12, 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(2, -11, 3, 3);
    // Slingshot
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.lineTo(17, -6);
    ctx.stroke();
    if (e.state === 'windup') {
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.7)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(16, -4);
      ctx.lineTo(140, -12);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (e.kind === 'bouncy_frog') {
    const crouch = e.state === 'windup' ? 0.72 : 1;
    ctx.scale(1, crouch);
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#22c55e';
    ctx.beginPath();
    ctx.ellipse(0, 4, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly
    ctx.fillStyle = '#bef264';
    ctx.beginPath();
    ctx.ellipse(3, 7, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bulging frog eyes
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

function drawGorillaBoss(ctx: CanvasRenderingContext2D, e: EnemyEntity, time: number): void {
  ctx.save();
  ctx.scale(e.facing, 1);
  const rage = e.phase === 2;
  const flash = e.hitFlash > 0;

  // Suit Torso
  ctx.fillStyle = flash ? '#ffffff' : '#18181b';
  ctx.strokeStyle = rage ? '#ef4444' : '#facc15';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-46, -24, 92, 74, 22);
  ctx.fill();
  ctx.stroke();

  // White Dress Shirt V & Red Tie
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

  // Giant Gorilla Head
  ctx.fillStyle = flash ? '#ffffff' : '#27272a';
  ctx.beginPath();
  ctx.ellipse(0, -42, 34, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Muzzle
  ctx.fillStyle = '#52525b';
  ctx.beginPath();
  ctx.ellipse(6, -34, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Boss Sunglasses (glow red in Phase 2!)
  ctx.fillStyle = rage ? '#ef4444' : '#09090b';
  ctx.fillRect(-16, -54, 16, 9);
  ctx.fillRect(6, -54, 16, 9);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, -51, 6, 3);

  // Briefcase in hand
  const armSwing = e.state === 'windup' ? -18 : Math.sin(time * 6) * 4;
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.fillRect(26, 8 + armSwing, 38, 28);
  ctx.strokeRect(26, 8 + armSwing, 38, 28);

  if (e.state === 'dizzy') {
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText('💫 TONTO! POGO NELE!', 0, -80);
  } else if (e.state === 'windup') {
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fb7185';
    ctx.fillText('❗ REUNIÃO DE EMERGÊNCIA!', 0, -80);
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

  // Player Status Box (placed below mountMonkeyHud top-left bar at y=58)
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(12, 56, 252, 92, 12);
  ctx.fill();
  ctx.stroke();

  // Hearts
  for (let i = 0; i < local.maxHp; i++) {
    const hx = 28 + i * 24;
    const hy = 78;
    ctx.font = '18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(i < local.hp ? '❤️' : '🖤', hx, hy);
  }

  // Potassium Bar (Hollow Knight Soul style!)
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(22, 90, 228, 16, 8);
  ctx.fill();
  const potPct = Math.max(0, Math.min(1, local.potassium / 100));
  if (potPct > 0) {
    ctx.fillStyle = local.potassium >= 33 ? '#facc15' : '#ca8a04';
    ctx.beginPath();
    ctx.roundRect(22, 90, 228 * potPct, 16, 8);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(
    local.potassium >= 33
      ? `🍌 POTÁSSIO ${Math.floor(local.potassium)}% [Segure Q/F = CURAR]`
      : `🍌 POTÁSSIO ${Math.floor(local.potassium)}% (Bata p/ encher)`,
    136,
    102,
  );

  // Equipped Weapon
  const wDef = WEAPONS[local.weapon];
  ctx.textAlign = 'left';
  ctx.fillStyle = wDef.color;
  ctx.font = '800 12px system-ui';
  ctx.fillText(`⚔️ ${wDef.name}`, 22, 127);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 11px system-ui';
  ctx.fillText(`Relíquias: ${state.upgrades.length} | 🍌 ${state.bananas} | ☠️ ${state.kills}`, 22, 142);

  // Top-Right Room & Score Panel
  const rw = 264;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
  ctx.strokeStyle = room.theme.accent;
  ctx.beginPath();
  ctx.roundRect(cw - rw - 12, 12, rw, 66, 12);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = room.theme.accent;
  ctx.font = '900 13px system-ui';
  ctx.fillText(room.theme.name, cw - 22, 33);

  const aliveEnemies = room.enemies.filter((e) => e.hp > 0).length;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 12px system-ui';
  ctx.fillText(
    aliveEnemies > 0
      ? `Inimigos restantes: ${aliveEnemies} | Pts: ${state.score}`
      : `✅ Sala Limpa! Vá ao Portal ➡ | Pts: ${state.score}`,
    cw - 22,
    53,
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

  // Controls hint at bottom-left if not boss room
  if (!room.isBossRoom) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.58)';
    ctx.font = '600 11px system-ui';
    ctx.fillText(
      'A/D Mover • W/Espaço Pulo/Wall-Jump • Shift/K Esquiva • J/Clique Atacar (S+J no ar = POGO!) • Segurar Q/F Curar',
      14,
      ch - 12,
    );
  }

  // BOSS HP BAR AT BOTTOM
  const boss = room.enemies.find((e) => e.kind === 'gorilla_ceo' && e.hp > 0);
  if (boss) {
    const bw = Math.min(680, cw - 80);
    const bx = (cw - bw) / 2;
    const by = ch - 52;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = boss.phase === 2 ? '#ef4444' : '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(bx - 10, by - 26, bw + 20, 56, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = boss.phase === 2 ? '#fca5a5' : '#fef08a';
    ctx.font = '900 14px system-ui';
    ctx.fillText(
      boss.phase === 2
        ? '🦍🔥 O GORILÃO DE TERNO (MODO DEMISSÃO EM MASSA!)'
        : '🦍💼 O GORILÃO DE TERNO — CEO DA FARIA LIMA',
      cw / 2,
      by - 7,
    );

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(bx, by + 2, bw, 18, 8);
    ctx.fill();

    const hpRatio = Math.max(0, boss.hp / boss.maxHp);
    const barGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    barGrad.addColorStop(0, '#ef4444');
    barGrad.addColorStop(1, '#f97316');
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(bx, by + 2, bw * hpRatio, 18, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`${Math.ceil(boss.hp)} / ${boss.maxHp} HP`, cw / 2, by + 15);
  }

  ctx.restore();
}
