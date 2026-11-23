import { BLOON_DEFS, CANVAS_HEIGHT, CANVAS_WIDTH, TOWER_DEFS, TOWER_RADIUS, TRACK_HALF_WIDTH } from './data';
import { getLaneLength, getMapLanes, isValidTowerSpot, samplePathPosition } from './maps';
import type {
  AbilityBomb,
  BloonInstance,
  FloatingText,
  LightningArc,
  MapConfig,
  MapPing,
  MapProp,
  Particle,
  PoisonCloud,
  RemoteCursor,
  ShockwaveRing,
  SniperTracer,
  TowerInstance,
  TowerType,
  Projectile,
} from './types';

export interface RenderState {
  time: number;
  map: MapConfig;
  towers: TowerInstance[];
  bloons: BloonInstance[];
  projectiles: Projectile[];
  clouds: PoisonCloud[];
  rings: ShockwaveRing[];
  tracers: SniperTracer[];
  lightningArcs: LightningArc[];
  abilityBombs: AbilityBomb[];
  pings: MapPing[];
  remoteCursors: RemoteCursor[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  selectedTowerId: string | null;
  placingType: TowerType | null;
  hoverPos: { x: number; y: number } | null;
  bananas: number;
  shakeAmount: number;
  showOwners: boolean;
  bossBannerText: string | null;
}

export function getTowerEffectiveRange(tower: TowerInstance): number {
  const def = TOWER_DEFS[tower.type];
  let range = def.range;
  if (tower.type === 'coco' && tower.level >= 2) range *= 1.16;
  if (tower.type === 'dj') {
    if (tower.level >= 1) range *= 1.12;
    if (tower.level >= 2) range *= 1.1;
  }
  if (tower.type === 'mago') {
    if (tower.level >= 1) range *= 1.14;
    if (tower.level >= 3) range *= 1.1;
  }
  return range * tower.buffedRangeMultiplier;
}

export function renderGameCanvas(ctx: CanvasRenderingContext2D, state: RenderState): void {
  ctx.save();

  // Screen shake
  if (state.shakeAmount > 0.2) {
    const sx = (Math.random() - 0.5) * state.shakeAmount * 2;
    const sy = (Math.random() - 0.5) * state.shakeAmount * 2;
    ctx.translate(sx, sy);
  }

  // 1. Background terrain
  drawBackground(ctx, state.map, state.time);

  // 2. Bridges (under track)
  for (const prop of state.map.props) {
    if (prop.kind === 'bridge') drawProp(ctx, prop, state.time);
  }

  // 3. Track
  drawTrack(ctx, state.map, state.time);

  // 4. Props (above track edge)
  for (const prop of state.map.props) {
    if (prop.kind !== 'bridge') drawProp(ctx, prop, state.time);
  }

  // 5. Poison clouds (ground level)
  for (const cloud of state.clouds) {
    drawPoisonCloud(ctx, cloud, state.time);
  }

  // 6. Shockwave rings (DJ & explosions)
  for (const ring of state.rings) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ring.alpha);
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.lineWidth;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 7. Selected tower range
  const selectedTower = state.towers.find((t) => t.id === state.selectedTowerId) ?? null;
  if (selectedTower) {
    const r = getTowerEffectiveRange(selectedTower);
    ctx.save();
    ctx.fillStyle =
      selectedTower.type === 'dj'
        ? 'rgba(192, 132, 252, 0.14)'
        : selectedTower.type === 'mago'
          ? 'rgba(34, 211, 238, 0.12)'
          : 'rgba(250, 204, 21, 0.13)';
    ctx.strokeStyle =
      selectedTower.type === 'dj'
        ? '#c084fc'
        : selectedTower.type === 'mago'
          ? '#22d3ee'
          : '#facc15';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(selectedTower.x, selectedTower.y, Math.min(r, 900), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 8. Placement preview ghost
  if (state.placingType && state.hoverPos) {
    drawPlacementGhost(ctx, state, state.placingType, state.hoverPos.x, state.hoverPos.y);
  }

  // 9. Towers
  for (const tower of state.towers) {
    drawTower(ctx, tower, tower.id === state.selectedTowerId, state.showOwners, state.time);
  }

  // 10. Bloons (sorted by progress so front bloons & bosses layer nicely)
  const sortedBloons = [...state.bloons].sort((a, b) => a.distance - b.distance);
  for (const bloon of sortedBloons) {
    drawBloon(ctx, bloon, state.time);
  }

  // 11. Sniper tracers
  for (const tr of state.tracers) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, tr.ttl * 4);
    ctx.strokeStyle = tr.isMiss ? '#fde047' : tr.isCrit ? '#ef4444' : '#fb7185';
    ctx.lineWidth = tr.isCrit ? 4 : 2.5;
    if (tr.isMiss) ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(tr.x1, tr.y1);
    ctx.lineTo(tr.x2, tr.y2);
    ctx.stroke();
    ctx.restore();
  }

  // 12. Lightning arcs (Mago)
  for (const arc of state.lightningArcs) {
    drawLightningArc(ctx, arc);
  }

  // 13. Projectiles
  for (const proj of state.projectiles) {
    drawProjectile(ctx, proj);
  }

  // 14. Falling Ability Banana Bombs
  for (const bomb of state.abilityBombs) {
    drawAbilityBomb(ctx, bomb, state.time);
  }

  // 15. Particles
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.ttl / p.maxTtl);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 16. Map Pings
  for (const ping of state.pings) {
    drawMapPing(ctx, ping);
  }

  // 17. Remote Cursors
  for (const cursor of state.remoteCursors) {
    drawRemoteCursor(ctx, cursor);
  }

  // 18. Floating funny texts
  for (const ft of state.floatingTexts) {
    ctx.save();
    const alpha = Math.min(1, (ft.ttl / ft.maxTtl) * 1.4);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `900 ${Math.round(14 * ft.scale)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  // 19. Active Boss HUD Bar + Boss Banner
  const activeBoss = state.bloons
    .filter((b) => BLOON_DEFS[b.type].isBoss)
    .sort((a, b) => b.maxHp - a.maxHp)[0];

  if (state.bossBannerText) {
    ctx.save();
    const pulse = 0.9 + Math.sin(state.time * 8) * 0.1;
    ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    const bw = 560;
    const bh = 36;
    const bx = (CANVAS_WIDTH - bw) / 2;
    const by = 12;
    roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(254, 240, 138, ${pulse})`;
    ctx.font = '900 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.bossBannerText, CANVAS_WIDTH / 2, by + 23);
    ctx.restore();
  } else if (activeBoss) {
    drawTopBossBar(ctx, activeBoss);
  }

  ctx.restore();
}

function drawTopBossBar(ctx: CanvasRenderingContext2D, boss: BloonInstance): void {
  const def = BLOON_DEFS[boss.type];
  const isZep = boss.type === 'zepelim';
  const bw = 380;
  const bh = 28;
  const bx = (CANVAS_WIDTH - bw) / 2;
  const by = 12;
  const pct = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = isZep ? '#f87171' : '#38bdf8';
  ctx.lineWidth = 2.5;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.stroke();

  const barX = bx + 8;
  const barY = by + 16;
  const barW = bw - 16;
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, barX, barY, barW, 8, 4);
  ctx.fill();
  if (pct > 0) {
    ctx.fillStyle = isZep ? '#ef4444' : '#38bdf8';
    roundRect(ctx, barX, barY, barW * pct, 8, 4);
    ctx.fill();
  }

  ctx.fillStyle = '#fef08a';
  ctx.font = '900 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${def.emoji} ${def.name}`, bx + 10, by + 13);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp} HP`, bx + bw - 10, by + 13);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, map: MapConfig, time: number): void {
  if (map.id === 'ilha') {
    // Ocean waves
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.16)';
    ctx.lineWidth = 3;
    for (let y = 30; y < CANVAS_HEIGHT; y += 56) {
      ctx.beginPath();
      for (let x = 0; x <= CANVAS_WIDTH; x += 40) {
        const wy = y + Math.sin(x * 0.03 + time * 1.8 + y) * 5;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    // Sandy beach rim
    ctx.fillStyle = '#fde68a';
    roundRect(ctx, 26, 26, CANVAS_WIDTH - 52, CANVAS_HEIGHT - 52, 46);
    ctx.fill();

    // Lush island grass
    ctx.fillStyle = '#166534';
    roundRect(ctx, 48, 48, CANVAS_WIDTH - 96, CANVAS_HEIGHT - 96, 36);
    ctx.fill();

    // Central water channel under the bridge!
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(520, 0, 120, CANVAS_HEIGHT);
    ctx.fillStyle = 'rgba(253, 230, 138, 0.45)';
    ctx.fillRect(512, 0, 8, CANVAS_HEIGHT);
    ctx.fillRect(640, 0, 8, CANVAS_HEIGHT);
    return;
  }

  ctx.fillStyle = map.themeBg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const tile = 48;
  ctx.fillStyle = map.themeGrassAlt;
  for (let gx = 0; gx < CANVAS_WIDTH; gx += tile) {
    for (let gy = 0; gy < CANVAS_HEIGHT; gy += tile) {
      if (((gx / tile + gy / tile) | 0) % 2 === 0) {
        ctx.fillRect(gx, gy, tile, tile);
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 24; i++) {
    const px = ((i * 173) % (CANVAS_WIDTH - 40)) + 20;
    const py = ((i * 97) % (CANVAS_HEIGHT - 40)) + 20;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrack(ctx: CanvasRenderingContext2D, map: MapConfig, time: number): void {
  const lanes = getMapLanes(map);

  for (const pts of lanes) {
    if (pts.length < 2) continue;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Drop shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = TRACK_HALF_WIDTH * 2 + 12;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y + 4);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + 4);
    ctx.stroke();

    // Outer curb
    ctx.strokeStyle = map.roadOuter;
    ctx.lineWidth = TRACK_HALF_WIDTH * 2 + 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // Inner surface & dashes over all lanes so junctions blend seamlessly
  for (const pts of lanes) {
    if (pts.length < 2) continue;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = map.roadInner;
    ctx.lineWidth = TRACK_HALF_WIDTH * 2 - 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.strokeStyle = map.roadStripe;
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = -time * 24;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // Entry & Exit markers
  lanes.forEach((_, laneIdx) => {
    const start = samplePathPosition(map, 42, laneIdx);
    const label = lanes.length > 1 ? `ENTRADA ${laneIdx + 1} 🎈` : 'ENTRADA 🎈';
    const offsetY = laneIdx === 1 ? 34 : -34;
    drawTrackSign(ctx, Math.max(58, start.x + 12), start.y + offsetY, label, '#ef4444');
  });

  const lane0Len = getLaneLength(map, 0);
  const exit = samplePathPosition(map, lane0Len - 38, 0);
  const ex = Math.max(66, Math.min(CANVAS_WIDTH - 64, exit.x - 10));
  const ey = Math.max(76, Math.min(CANVAS_HEIGHT - 26, exit.y - 34));
  drawTrackSign(ctx, ex, ey, 'BANANAL 🍌', '#facc15', '#0f172a');
}

function drawTrackSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  bg: string,
  fg = '#fff',
): void {
  ctx.save();
  ctx.font = '800 11px system-ui, sans-serif';
  const w = ctx.measureText(label).width + 16;
  ctx.fillStyle = bg;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  roundRect(ctx, x - w / 2, y - 12, w, 22, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + 3);
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, prop: MapProp, time: number): void {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  const s = prop.scale ?? 1;
  ctx.scale(s, s);

  switch (prop.kind) {
    case 'bridge': {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      roundRect(ctx, -90, -38, 180, 76, 8);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      for (let x = -78; x <= 78; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, -36);
        ctx.lineTo(x, 36);
        ctx.stroke();
      }
      if (prop.label) {
        ctx.fillStyle = '#fef08a';
        ctx.font = '900 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(prop.label, 0, -42);
      }
      break;
    }
    case 'palm': {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(4, 10, 20, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.quadraticCurveTo(6, -4, 0, -14);
      ctx.stroke();
      const sway = Math.sin(time * 2 + prop.x) * 0.08;
      ctx.save();
      ctx.translate(0, -14);
      ctx.rotate(sway);
      for (let i = 0; i < 5; i++) {
        ctx.rotate((Math.PI * 2) / 5);
        ctx.fillStyle = i % 2 === 0 ? '#16a34a' : '#22c55e';
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(12, 0, 13, 5, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#713f12';
      ctx.beginPath();
      ctx.arc(-3, 3, 3.5, 0, Math.PI * 2);
      ctx.arc(3, 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'tree': {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(4, 8, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-5, -2, 10, 14);
      const sway = Math.sin(time * 1.5 + prop.x) * 1.5;
      ctx.fillStyle = '#15803d';
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sway, -8, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(-5 + sway, -13, 10, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cone': {
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#431407';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, 8);
      ctx.lineTo(0, -11);
      ctx.lineTo(9, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-5, -1, 10, 3);
      break;
    }
    case 'sign': {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      roundRect(ctx, -36, -12, 72, 20, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(prop.label ?? 'MACACO', 0, 2);
      break;
    }
    case 'stall': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, -28, -16, 60, 38, 6);
      ctx.fill();
      ctx.fillStyle = prop.color ?? '#ef4444';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      roundRect(ctx, -30, -20, 60, 36, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let x = -22; x < 24; x += 14) {
        ctx.fillRect(x, -18, 6, 32);
      }
      ctx.fillStyle = '#0f172a';
      roundRect(ctx, -24, -6, 48, 15, 4);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.font = '900 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(prop.label ?? 'FEIRA', 0, 5);
      break;
    }
    case 'crate': {
      ctx.fillStyle = '#b45309';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      roundRect(ctx, -14, -14, 28, 28, 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, -12);
      ctx.lineTo(12, 12);
      ctx.moveTo(12, -12);
      ctx.lineTo(-12, 12);
      ctx.stroke();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, -13, 6, Math.PI, 0);
      ctx.fill();
      break;
    }
    case 'puddle': {
      ctx.fillStyle = 'rgba(120, 53, 15, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 14, 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawPoisonCloud(ctx: CanvasRenderingContext2D, cloud: PoisonCloud, time: number): void {
  ctx.save();
  const fade = Math.min(1, cloud.ttl / 0.6);
  ctx.globalAlpha = 0.34 * fade;
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.45 * fade;
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#bbf7d0';
  for (let i = 0; i < 4; i++) {
    const ang = time * 1.8 + i * 1.6;
    const bx = cloud.x + Math.cos(ang) * (cloud.radius * 0.48);
    const by = cloud.y + Math.sin(ang * 1.2) * (cloud.radius * 0.42);
    ctx.beginPath();
    ctx.arc(bx, by, 5 + (i % 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  type: TowerType,
  x: number,
  y: number,
): void {
  const def = TOWER_DEFS[type];
  const valid = isValidTowerSpot(state.map, state.towers, x, y);
  const canAfford = state.bananas >= def.cost;
  const ok = valid.ok && canAfford;

  ctx.save();
  const displayRange = Math.min(def.range, 900);
  ctx.fillStyle = ok ? 'rgba(74, 222, 128, 0.18)' : 'rgba(239, 68, 68, 0.24)';
  ctx.strokeStyle = ok ? '#4ade80' : '#ef4444';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(x, y, displayRange, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(x, y, TOWER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = ok ? 'rgba(74, 222, 128, 0.55)' : 'rgba(239, 68, 68, 0.55)';
  ctx.fill();
  ctx.stroke();

  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.emoji, x, y);

  const msg = !canAfford
    ? `❌ Falta ${def.cost - state.bananas} 🍌`
    : !valid.ok
      ? `❌ ${valid.reason ?? 'Inválido'}`
      : '✅ Clique p/ colocar (Shift = vários)';
  ctx.font = '800 11px system-ui, sans-serif';
  const tw = ctx.measureText(msg).width + 14;
  ctx.fillStyle = ok ? 'rgba(6, 78, 59, 0.92)' : 'rgba(127, 29, 29, 0.92)';
  ctx.strokeStyle = ok ? '#4ade80' : '#fca5a5';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - tw / 2, y - 42, tw, 20, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ok ? '#dcfce7' : '#fecaca';
  ctx.fillText(msg, x, y - 32);
  ctx.restore();
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  tower: TowerInstance,
  isSelected: boolean,
  showOwners: boolean,
  time: number,
): void {
  const seed = (tower.x * 0.13 + tower.y * 0.07) % 6.28;
  const breath = Math.sin(time * 3.2 + seed) * 0.025;
  const stretch = tower.recoil * 0.16;

  ctx.save();
  ctx.translate(tower.x, tower.y);

  // Subtle base pedestal disc tinted with ownerColor for multiplayer clarity
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.beginPath();
  ctx.arc(0, 2, TOWER_RADIUS - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = tower.ownerColor;
  ctx.globalAlpha = showOwners ? 0.92 : 0.42;
  ctx.lineWidth = showOwners ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, TOWER_RADIUS + (showOwners ? 2 : 0), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (isSelected) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, TOWER_RADIUS + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (tower.buffedMultiplier > 1.01 && tower.type !== 'dj' && tower.type !== 'fazenda') {
    const pulse = 0.55 + Math.sin(time * 7 + tower.x) * 0.25;
    ctx.strokeStyle = `rgba(192, 132, 252, ${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, TOWER_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(2, 6, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  const kick = tower.recoil * 4.2;
  if (tower.type !== 'fazenda') {
    ctx.rotate(tower.angle);
    ctx.translate(-kick, 0);
    ctx.scale(1 + stretch - breath * 0.5, 1 - stretch * 0.65 + breath);
  } else {
    const bob = 1 + tower.recoil * 0.14 + breath * 0.6;
    ctx.scale(bob, bob);
  }

  const mOpts: MonkeyTowerVisualOpts = {
    level: tower.level,
    recoil: tower.recoil,
    ownerColor: tower.ownerColor,
    time,
    seed,
  };

  if (tower.type === 'banana') {
    drawBananaMonkey(ctx, mOpts);
  } else if (tower.type === 'havaianas') {
    drawHavaianasMonkey(ctx, mOpts);
  } else if (tower.type === 'sniper') {
    drawSniperMonkey(ctx, mOpts);
  } else if (tower.type === 'coco') {
    drawCocoCannonMonkey(ctx, mOpts);
  } else if (tower.type === 'dj') {
    drawDjMonkey(ctx, mOpts);
  } else if (tower.type === 'fazenda') {
    drawFarmTower(ctx, tower.level, time, tower.ownerColor);
  } else if (tower.type === 'mago') {
    drawMagoMonkey(ctx, mOpts);
  }
  ctx.restore();

  if (tower.level > 0) {
    for (let i = 0; i < tower.level; i++) {
      const sx = (i - (tower.level - 1) / 2) * 11;
      ctx.fillStyle = tower.level === 3 ? '#f97316' : '#fde047';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, TOWER_RADIUS + 5, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (showOwners) {
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(tower.ownerName, 0, -TOWER_RADIUS - 8);
    ctx.fillStyle = tower.ownerColor;
    ctx.fillText(tower.ownerName, 0, -TOWER_RADIUS - 8);
  }

  ctx.restore();
}

interface MonkeyTowerVisualOpts {
  level: number;
  recoil: number;
  ownerColor: string;
  time: number;
  seed: number;
}

interface MonkeyHeadStyle {
  furHi: string;
  furBase: string;
  furDark: string;
  faceHi: string;
  faceShade: string;
  innerEar: string;
  angry: boolean;
  vesgo: boolean;
  baldShiny?: boolean;
  shouting?: boolean;
  scale?: number;
}

function drawMonkeyTowerBase(
  ctx: CanvasRenderingContext2D,
  opts: MonkeyTowerVisualOpts,
  style: MonkeyHeadStyle,
): void {
  const s = style.scale ?? 1;
  const outline = '#291509';
  const isFiring = opts.recoil > 0.16;
  const tailWag = Math.sin(opts.time * 4.5 + opts.seed) * 3.5 + opts.recoil * 5;
  const earWobble = opts.recoil * 2.2;

  ctx.save();
  ctx.scale(s, s);

  // 1. Curved Monkey Tail behind (-x) with secondary wave
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(-11, 2);
  ctx.bezierCurveTo(-22, 5 + tailWag * 0.5, -26, -8 + tailWag, -18, -12 + tailWag * 0.8);
  ctx.stroke();
  ctx.strokeStyle = style.furBase;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = style.faceShade;
  ctx.beginPath();
  ctx.arc(-18, -12 + tailWag * 0.8, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // 2. Shoulders / Torso + Player-Colored Bandana Collar
  const torsoGrad = ctx.createRadialGradient(-2, 0, 2, 0, 0, 15);
  torsoGrad.addColorStop(0, style.furBase);
  torsoGrad.addColorStop(1, style.furDark);
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-2, 0, 12, 14.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Player owner scarf trim around neck/shoulders
  ctx.strokeStyle = opts.ownerColor;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(0, 0, 12.6, -1.15, 1.15);
  ctx.stroke();

  // 3. Big Round Ears with rosy pink inner ear
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  for (const side of [-1, 1]) {
    const ey = side * (15.5 + earWobble * 0.4);
    ctx.fillStyle = style.furBase;
    ctx.beginPath();
    ctx.arc(-1 - earWobble * 0.4, ey, 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = style.innerEar;
    ctx.beginPath();
    ctx.arc(-0.5 - earWobble * 0.4, ey, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Big Head with 3D Radial Fur Gradient
  const headGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
  headGrad.addColorStop(0, style.furHi);
  headGrad.addColorStop(0.6, style.furBase);
  headGrad.addColorStop(1, style.furDark);
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 5. Heart / Peanut-Shaped Cream Face Mask facing forward (+x)
  const maskGrad = ctx.createLinearGradient(0, -10, 14, 10);
  maskGrad.addColorStop(0, style.faceHi);
  maskGrad.addColorStop(1, style.faceShade);
  ctx.fillStyle = maskGrad;
  ctx.strokeStyle = style.furDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  // Top eye-brow lobe (-y) & muzzle
  ctx.bezierCurveTo(-1, -8, 6, -12, 11, -7.5);
  ctx.bezierCurveTo(15, -6, 15.5, 6, 11, 7.5);
  ctx.bezierCurveTo(6, 12, -1, 8, 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bald shiny specular highlight for Calvo Furioso
  if (style.baldShiny) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.ellipse(-6, -4.5, 4.5, 2.4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Expressive Eyes (natural blinking + white highlight glint)
  const blinkCycle = (opts.time * 0.8 + opts.seed * 1.4) % 4.4;
  const isBlinking = !isFiring && !style.angry && blinkCycle > 4.24;

  if (isBlinking) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2.5, -5);
    ctx.lineTo(7, -5);
    ctx.moveTo(2.5, 5);
    ctx.lineTo(7, 5);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(4.8, -5.2, 4.1, 0, Math.PI * 2);
    ctx.arc(4.8, 5.2, 4.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pupils (vesgo or focused forward)
    const px1 = style.vesgo ? 6.2 : 6.1;
    const py1 = style.vesgo ? -3.4 : -5.2;
    const px2 = style.vesgo ? 3.5 : 6.1;
    const py2 = style.vesgo ? 3.5 : 5.2;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(px1, py1, 1.9, 0, Math.PI * 2);
    ctx.arc(px2, py2, 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Crisp white specular highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px1 - 0.8, py1 - 0.8, 0.85, 0, Math.PI * 2);
    ctx.arc(px2 - 0.8, py2 - 0.8, 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Eyebrows & Mouth (reacts to recoil/upgrades!)
  if (style.angry || isFiring) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.5, -9.8);
    ctx.lineTo(7.8, -3.5);
    ctx.moveTo(0.5, 9.8);
    ctx.lineTo(7.8, 3.5);
    ctx.stroke();
  }

  // Cute nostrils & mouth on front edge (+x)
  ctx.fillStyle = style.furDark;
  ctx.beginPath();
  ctx.arc(10.5, -1.6, 0.9, 0, Math.PI * 2);
  ctx.arc(10.5, 1.6, 0.9, 0, Math.PI * 2);
  ctx.fill();

  if (style.shouting || isFiring) {
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(12.2, 0, 2.3, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(11.2, 0, 3.2, -0.75, 0.75);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMonkeyHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  furColor: string,
  palmColor = '#fde68a',
): void {
  ctx.fillStyle = furColor;
  ctx.strokeStyle = '#291509';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palmColor;
  ctx.beginPath();
  ctx.arc(x + 1, y, 2.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawBananaMonkey(ctx: CanvasRenderingContext2D, opts: MonkeyTowerVisualOpts): void {
  const isCalvo = opts.level >= 3;
  const furBase = isCalvo ? '#dc2626' : '#b45309';

  // Throwing arm & curved banana
  const throwSwing = opts.recoil * 0.45;
  ctx.save();
  ctx.rotate(throwSwing);
  drawMonkeyHand(ctx, 13, 9, furBase);
  const banGrad = ctx.createLinearGradient(12, 4, 21, 16);
  banGrad.addColorStop(0, isCalvo ? '#fed7aa' : '#fef08a');
  banGrad.addColorStop(1, isCalvo ? '#f97316' : '#eab308');
  ctx.fillStyle = banGrad;
  ctx.strokeStyle = isCalvo ? '#9a3412' : '#713f12';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(16, 8, 8.2, -0.7, 1.45);
  ctx.quadraticCurveTo(17, 7, 20, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawMonkeyHand(ctx, 9, -11, furBase);

  drawMonkeyTowerBase(ctx, opts, {
    furHi: isCalvo ? '#f87171' : '#d97706',
    furBase,
    furDark: isCalvo ? '#991b1b' : '#78350f',
    faceHi: isCalvo ? '#fecaca' : '#fef3c7',
    faceShade: isCalvo ? '#fca5a5' : '#fed7aa',
    innerEar: '#fda4af',
    angry: opts.level >= 2,
    vesgo: false,
    baldShiny: isCalvo,
    shouting: isCalvo,
  });

  if (opts.level >= 1 && opts.level < 3) {
    // Headband with trailing tails
    ctx.fillStyle = opts.level === 2 ? '#22c55e' : '#facc15';
    ctx.strokeStyle = '#291509';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-11, -13, 7, 26, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(-19, -8);
    ctx.lineTo(-16, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (isCalvo) {
    // Cartoon steam puffs from furious bald dome!
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    const puff = Math.sin(opts.time * 12) * 3;
    ctx.beginPath();
    ctx.arc(-14, -7 + puff, 4.2, 0, Math.PI * 2);
    ctx.arc(-17, 7 - puff, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHavaianasMonkey(ctx: CanvasRenderingContext2D, opts: MonkeyTowerVisualOpts): void {
  const furBase = '#92400e';
  // Throwing hand + Havaianas flip-flop
  ctx.save();
  ctx.translate(16, 9);
  ctx.rotate(0.4 + opts.recoil * 0.5);
  const shoeGrad = ctx.createLinearGradient(-5, -9, 5, 9);
  shoeGrad.addColorStop(0, opts.level >= 3 ? '#fde047' : '#7dd3fc');
  shoeGrad.addColorStop(1, opts.level >= 3 ? '#d97706' : '#0284c7');
  ctx.fillStyle = shoeGrad;
  ctx.strokeStyle = opts.level >= 3 ? '#78350f' : '#0c4a6e';
  ctx.lineWidth = 1.8;
  roundRect(ctx, -5.5, -9.5, 11, 19, 4.5);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-3.5, 3);
  ctx.lineTo(0, -4);
  ctx.lineTo(3.5, 3);
  ctx.stroke();
  ctx.restore();

  drawMonkeyHand(ctx, 13, 10, furBase);
  drawMonkeyHand(ctx, 9, -11, furBase);

  drawMonkeyTowerBase(ctx, opts, {
    furHi: '#b45309',
    furBase,
    furDark: '#451a03',
    faceHi: '#fef3c7',
    faceShade: '#fed7aa',
    innerEar: '#fda4af',
    angry: opts.level >= 2,
    vesgo: false,
    shouting: opts.level >= 3,
  });

  // Headband (becomes golden crown headband at Lv3!)
  ctx.fillStyle = opts.level >= 3 ? '#facc15' : opts.level >= 2 ? '#38bdf8' : '#0284c7';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(-10.5, -13, 6.5, 26, 3);
  ctx.fill();
  ctx.stroke();
}

function drawSniperMonkey(ctx: CanvasRenderingContext2D, opts: MonkeyTowerVisualOpts): void {
  const furBase = '#78350f';
  // Long sniper rifle + scope + laser sight
  const barrelGrad = ctx.createLinearGradient(4, 3, 28, 9);
  barrelGrad.addColorStop(0, '#334155');
  barrelGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = barrelGrad;
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = 1.6;
  roundRect(ctx, 3, 4, 25, 5.5, 2);
  ctx.fill();
  ctx.stroke();

  if (opts.level >= 1) {
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0c4a6e';
    ctx.lineWidth = 1.2;
    roundRect(ctx, 9, 0.5, 9, 4, 1.5);
    ctx.fill();
    ctx.stroke();
  }
  if (opts.level >= 3) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(29, 6.8, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMonkeyHand(ctx, 10, 8, furBase);
  drawMonkeyHand(ctx, 16, 4, furBase);

  drawMonkeyTowerBase(ctx, opts, {
    furHi: '#a16207',
    furBase,
    furDark: '#451a03',
    faceHi: '#fef9c3',
    faceShade: '#fde68a',
    innerEar: '#fda4af',
    angry: false,
    vesgo: true,
  });

  // Tactical beret / ghillie cap
  ctx.fillStyle = opts.level >= 2 ? '#dc2626' : '#4d7c0f';
  ctx.strokeStyle = '#1a2e05';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(-4, 0, 10.5, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (opts.level >= 3) {
    // Ghillie leaves on cap
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(-9, -6, 4.5, 2.2, 0.4, 0, Math.PI * 2);
    ctx.ellipse(-9, 6, 4.5, 2.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCocoCannonMonkey(ctx: CanvasRenderingContext2D, opts: MonkeyTowerVisualOpts): void {
  // Heavy coconut cannon barrel with shading
  const canGrad = ctx.createLinearGradient(2, -10, 2, 10);
  canGrad.addColorStop(0, opts.level >= 3 ? '#22c55e' : '#475569');
  canGrad.addColorStop(0.5, opts.level >= 3 ? '#14532d' : '#1e293b');
  canGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = canGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;
  roundRect(ctx, 2, -9.5, 23, 19, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = opts.level >= 3 ? '#fde047' : '#4ade80';
  ctx.fillRect(21, -7, 4, 14);

  // Gunner monkey behind cannon with paws gripping sides
  drawMonkeyHand(ctx, 4, -10, '#9a3412');
  drawMonkeyHand(ctx, 4, 10, '#9a3412');

  ctx.save();
  ctx.translate(-7, 0);
  drawMonkeyTowerBase(ctx, opts, {
    furHi: '#c2410c',
    furBase: '#9a3412',
    furDark: '#431407',
    faceHi: '#fef3c7',
    faceShade: '#fed7aa',
    innerEar: '#fda4af',
    angry: opts.level >= 2,
    vesgo: false,
    scale: 0.84,
  });
  ctx.restore();
}

function drawDjMonkey(ctx: CanvasRenderingContext2D, opts: MonkeyTowerVisualOpts): void {
  const bounce = 1 + Math.sin(opts.time * 12) * 0.08;
  ctx.save();
  ctx.translate(12, 0);
  ctx.scale(bounce, bounce);
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = opts.level >= 2 ? '#facc15' : '#c084fc';
  ctx.lineWidth = 2.5;
  roundRect(ctx, -6, -15, 14, 30, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = opts.level >= 3 ? '#facc15' : '#a855f7';
  ctx.beginPath();
  ctx.arc(1, -7, 4.5, 0, Math.PI * 2);
  ctx.arc(1, 7, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawMonkeyHand(ctx, 5, -10, '#7c2d12');
  drawMonkeyHand(ctx, 5, 10, '#7c2d12');

  ctx.save();
  ctx.translate(-5, 0);
  drawMonkeyTowerBase(ctx, opts, {
    furHi: '#9a3412',
    furBase: '#7c2d12',
    furDark: '#431407',
    faceHi: '#fef3c7',
    faceShade: '#fed7aa',
    innerEar: '#f9a8d4',
    angry: false,
    vesgo: false,
    scale: 0.9,
  });
  // Neon DJ headphones
  ctx.strokeStyle = opts.level >= 3 ? '#facc15' : '#c084fc';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, 0, 14, Math.PI * 0.62, Math.PI * 1.38);
  ctx.stroke();
  ctx.fillStyle = '#e879f9';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  roundRect(ctx, -3, -16, 7, 5, 2);
  ctx.fill();
  ctx.stroke();
  roundRect(ctx, -3, 11, 7, 5, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFarmTower(
  ctx: CanvasRenderingContext2D,
  level: number,
  time: number,
  ownerColor: string,
): void {
  // Base wooden crate / bank foundation
  const crateGrad = ctx.createLinearGradient(-16, -13, 16, 13);
  crateGrad.addColorStop(0, level >= 3 ? '#fde047' : level >= 2 ? '#22c55e' : '#b45309');
  crateGrad.addColorStop(1, level >= 3 ? '#ca8a04' : level >= 2 ? '#14532d' : '#78350f');
  ctx.fillStyle = crateGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;
  roundRect(ctx, -16, -13, 32, 26, 6);
  ctx.fill();
  ctx.stroke();

  if (level >= 3) {
    ctx.fillStyle = '#fef08a';
    ctx.font = '900 9.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BANCO', 0, 10);
  }

  // Banana tree leaves fanning out
  const sway = Math.sin(time * 2.5) * 0.08;
  ctx.save();
  ctx.translate(0, -4);
  ctx.rotate(sway);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 5 + 0.35);
    ctx.fillStyle = level >= 1 ? '#4ade80' : '#22c55e';
    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(9, 0, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Golden bananas bunch in center
  ctx.fillStyle = '#fde047';
  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 1.6;
  for (const bx of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.arc(bx, -2, 4.5, 0.2, Math.PI - 0.2);
    ctx.fill();
    ctx.stroke();
  }

  // Cute tiny farmer monkey helper peeking on the corner!
  ctx.save();
  ctx.translate(11, 8);
  drawMonkeyTowerBase(
    ctx,
    { level, recoil: 0, ownerColor, time, seed: 2.3 },
    {
      furHi: '#d97706',
      furBase: '#b45309',
      furDark: '#78350f',
      faceHi: '#fef3c7',
      faceShade: '#fde68a',
      innerEar: '#fda4af',
      angry: false,
      vesgo: false,
      scale: 0.48,
    },
  );
  // Straw farmer hat
  ctx.fillStyle = '#fde047';
  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-1, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMagoMonkey(ctx: CanvasRenderingContext2D, opts: MonkeyTowerVisualOpts): void {
  const furBase = opts.level >= 3 ? '#312e81' : '#6d28d9';
  // Lightning vine staff
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(4, 10);
  ctx.lineTo(24, 10);
  ctx.stroke();

  // Glowing orb on staff tip
  const orbPulse = 4.6 + Math.sin(opts.time * 10) * 1.2 + opts.recoil * 2.5;
  ctx.fillStyle = opts.level >= 3 ? '#facc15' : '#22d3ee';
  ctx.strokeStyle = '#083344';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(24, 10, orbPulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(22.5, 8.5, orbPulse * 0.35, 0, Math.PI * 2);
  ctx.fill();

  drawMonkeyHand(ctx, 11, 10, furBase, '#fde68a');
  drawMonkeyHand(ctx, 9, -11, furBase, '#fde68a');

  drawMonkeyTowerBase(ctx, opts, {
    furHi: opts.level >= 3 ? '#4f46e5' : '#8b5cf6',
    furBase,
    furDark: '#1e1b4b',
    faceHi: '#fef9c3',
    faceShade: '#fde68a',
    innerEar: '#f9a8d4',
    angry: opts.level >= 2,
    vesgo: false,
    shouting: opts.level >= 3,
  });

  // Leaf / Vine shaman crown
  ctx.strokeStyle = opts.level >= 3 ? '#facc15' : '#4ade80';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, 0, 14, Math.PI * 0.6, Math.PI * 1.4);
  ctx.stroke();
  ctx.fillStyle = opts.level >= 3 ? '#facc15' : '#22d3ee';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-8, 0, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBloon(ctx: CanvasRenderingContext2D, bloon: BloonInstance, time: number): void {
  const def = BLOON_DEFS[bloon.type];
  ctx.save();
  const bob = Math.sin(time * 5 + bloon.wobbleSeed) * 2;
  ctx.translate(bloon.x, bloon.y + bob);

  if (bloon.type === 'moab' || bloon.type === 'zepelim') {
    drawBossBloon(ctx, bloon, time);
    ctx.restore();
    return;
  }

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, def.radius);
  ctx.quadraticCurveTo(Math.sin(time * 6 + bloon.wobbleSeed) * 4, def.radius + 9, 0, def.radius + 16);
  ctx.stroke();

  ctx.fillStyle = bloon.hitFlash > 0 ? '#ffffff' : def.color;
  ctx.strokeStyle = def.outline;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, def.radius * 0.88, def.radius * 1.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (def.isCamo && !bloon.camoStripped) {
    ctx.fillStyle = '#365314';
    ctx.beginPath();
    ctx.arc(-5, 6, 4.5, 0, Math.PI * 2);
    ctx.arc(6, -5, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (def.isLead) {
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-7, -7, 2.5, 0, Math.PI * 2);
    ctx.arc(7, -7, 2.5, 0, Math.PI * 2);
    ctx.arc(-7, 7, 2.5, 0, Math.PI * 2);
    ctx.arc(7, 7, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-def.radius * 0.3, -def.radius * 0.42, 3.2, 5.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (bloon.slowTimer > 0) {
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, def.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (def.isCamo && !bloon.camoStripped) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-10, -5, 8, 5);
    ctx.fillRect(2, -5, 8, 5);
    ctx.fillRect(-2, -4, 4, 2);
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4.5, -2, 2.7, 0, Math.PI * 2);
    ctx.arc(4.5, -2, 2.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-4, -2, 1.3, 0, Math.PI * 2);
    ctx.arc(5, -2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 3, 4.5, 0.15, Math.PI - 0.15);
  ctx.stroke();

  if (bloon.isTroll) {
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('😈', 0, -def.radius - 4);
  }

  ctx.restore();
}

function drawBossBloon(ctx: CanvasRenderingContext2D, bloon: BloonInstance, time: number): void {
  const isZep = bloon.type === 'zepelim';
  const rx = isZep ? 50 : 38;
  const ry = isZep ? 28 : 22;

  ctx.save();
  ctx.rotate(bloon.angle || 0);

  // Tail fins
  ctx.fillStyle = isZep ? '#facc15' : '#ef4444';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-rx + 8, -10);
  ctx.lineTo(-rx - 14, -20);
  ctx.lineTo(-rx - 10, 0);
  ctx.lineTo(-rx - 14, 20);
  ctx.lineTo(-rx + 8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hull
  ctx.fillStyle = bloon.hitFlash > 0 ? '#fff' : isZep ? '#b91c1c' : '#0284c7';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Banner plate
  ctx.fillStyle = '#fef08a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  roundRect(ctx, -26, -8, 52, 16, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#991b1b';
  ctx.font = '900 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isZep ? 'RECEITA' : 'IRPF MOAB', 0, 3);

  // Angry eyes on nose
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(rx - 14, -7, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(rx - 12, -7, 2.2, 0, Math.PI * 2);
  ctx.fill();

  if (isZep) {
    const spin = Math.sin(time * 28) * 10;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-rx - 12, -spin);
    ctx.lineTo(-rx - 12, spin);
    ctx.stroke();
  }
  ctx.restore();

  // Unrotated crisp Boss HP Bar with numeric HP
  const hpW = isZep ? 96 : 74;
  const pct = Math.max(0, Math.min(1, bloon.hp / Math.max(1, bloon.maxHp)));
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -hpW / 2, -ry - 22, hpW, 13, 4);
  ctx.fill();
  ctx.fillStyle = isZep ? '#facc15' : '#4ade80';
  if (pct > 0) {
    roundRect(ctx, -hpW / 2 + 1.5, -ry - 20.5, (hpW - 3) * pct, 10, 3);
    ctx.fill();
  }
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.max(0, Math.ceil(bloon.hp))}/${bossSafeMax(bloon)}`, 0, -ry - 12.5);
}

function bossSafeMax(b: BloonInstance): number {
  return Math.max(1, b.maxHp);
}

function drawLightningArc(ctx: CanvasRenderingContext2D, arc: LightningArc): void {
  if (arc.points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, arc.ttl / arc.maxTtl);
  ctx.strokeStyle = arc.color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(arc.points[0].x, arc.points[0].y);
  for (let i = 1; i < arc.points.length; i++) {
    const prev = arc.points[i - 1];
    const curr = arc.points[i];
    const mx = (prev.x + curr.x) / 2 + (Math.random() - 0.5) * 14;
    const my = (prev.y + curr.y) / 2 + (Math.random() - 0.5) * 14;
    ctx.lineTo(mx, my);
    ctx.lineTo(curr.x, curr.y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawAbilityBomb(ctx: CanvasRenderingContext2D, bomb: AbilityBomb, time: number): void {
  ctx.save();
  // Target reticle on ground
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(bomb.x, bomb.targetY, bomb.radius * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Falling banana bomb
  ctx.translate(bomb.x, bomb.y);
  ctx.rotate(time * 12);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍌', 0, 0);
  ctx.restore();
}

function drawMapPing(ctx: CanvasRenderingContext2D, ping: MapPing): void {
  const progress = 1 - ping.ttl / ping.maxTtl;
  const r = 10 + (progress * 48) % 36;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, ping.ttl * 1.4));
  ctx.strokeStyle = ping.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ping.x, ping.y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = ping.color;
  ctx.beginPath();
  ctx.arc(ping.x, ping.y, 5, 0, Math.PI * 2);
  ctx.fill();

  const label = `📍 ${ping.name}`;
  ctx.font = '900 11px system-ui, sans-serif';
  const tw = ctx.measureText(label).width + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = ping.color;
  ctx.lineWidth = 1.5;
  roundRect(ctx, ping.x - tw / 2, ping.y - 34, tw, 18, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(label, ping.x, ping.y - 21);
  ctx.restore();
}

function drawRemoteCursor(ctx: CanvasRenderingContext2D, cursor: RemoteCursor): void {
  ctx.save();
  ctx.translate(cursor.x, cursor.y);

  if (cursor.placingType) {
    const def = TOWER_DEFS[cursor.placingType];
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = cursor.color;
    ctx.beginPath();
    ctx.arc(0, 0, TOWER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Pointer triangle
  ctx.fillStyle = cursor.color;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14, 7);
  ctx.lineTo(7, 9);
  ctx.lineTo(5, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = '800 10px system-ui, sans-serif';
  const w = ctx.measureText(cursor.name).width + 10;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  roundRect(ctx, 12, 12, w, 16, 5);
  ctx.fill();
  ctx.fillStyle = cursor.color;
  ctx.textAlign = 'left';
  ctx.fillText(cursor.name, 17, 23);
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, proj: Projectile): void {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(proj.rotation);

  if (proj.kind === 'banana' || proj.kind === 'fire_banana') {
    if (proj.kind === 'fire_banana') {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = proj.kind === 'fire_banana' ? '#fb923c' : '#fde047';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.quadraticCurveTo(0, -11, 9, -2);
    ctx.quadraticCurveTo(1, -4, -8, -3);
    ctx.fill();
    ctx.stroke();
  } else if (proj.kind === 'chinelo') {
    if (proj.homing) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0c4a6e';
    ctx.lineWidth = 2;
    roundRect(ctx, -6, -11, 12, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(0, -5);
    ctx.lineTo(4, 2);
    ctx.stroke();
  } else if (proj.kind === 'coco') {
    ctx.fillStyle = '#3f6212';
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
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
