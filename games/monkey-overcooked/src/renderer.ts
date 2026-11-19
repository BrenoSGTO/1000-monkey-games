import { GRID_COLS, GRID_ROWS, KITCHENS } from './kitchens';
import { INGREDIENTS, RECIPES } from './recipes';
import type {
  ChefState,
  FloatingText,
  HeldItem,
  IngredientKind,
  SimParticle,
  SimSnapshot,
  TileState,
} from './types';

export class KitchenRenderer {
  private ctx: CanvasRenderingContext2D;
  private animTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D context unavailable');
    this.ctx = context;
  }

  public render(
    snap: SimSnapshot,
    particles: SimParticle[],
    floatingTexts: FloatingText[],
    activeChefId: string | null,
    dt: number,
  ): void {
    this.animTime += dt;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    const kitchen = KITCHENS[snap.kitchenId];

    // Background
    ctx.fillStyle = snap.kitchenId === 'caminhoes' ? '#1e293b' : '#1b110a';
    ctx.fillRect(0, 0, w, h);

    // Highway scrolling background for Kitchen 2
    if (snap.kitchenId === 'caminhoes') {
      this.drawHighwayBg(ctx, w, h);
    }

    // Reserve top 120px for HUD + Order Tickets, bottom 28px for control strip
    const topMargin = 118;
    const bottomMargin = 28;
    const availW = w - 24;
    const availH = Math.max(200, h - topMargin - bottomMargin);
    const tileSize = Math.floor(Math.min(availW / GRID_COLS, availH / GRID_ROWS));
    const boardW = tileSize * GRID_COLS;
    const boardH = tileSize * GRID_ROWS;
    const originX = Math.floor((w - boardW) * 0.5);
    const originY = Math.floor(topMargin + (availH - boardH) * 0.5);

    const shakeX = snap.shake > 0 ? (Math.random() - 0.5) * snap.shake : 0;
    const shakeY = snap.shake > 0 ? (Math.random() - 0.5) * snap.shake : 0;

    ctx.save();
    ctx.translate(originX + shakeX, originY + shakeY);

    // Truck beds shadow for Kitchen 2
    if (snap.kitchenId === 'caminhoes') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this.roundRect(ctx, -6, 6, tileSize * 6 + 12, boardH, 14);
      ctx.fill();
      this.roundRect(ctx, tileSize * 8 - 6, 6, tileSize * 6 + 12, boardH, 14);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this.roundRect(ctx, -8, 8, boardW + 16, boardH + 8, 16);
      ctx.fill();
    }

    // 1. Draw Floor & Tiles
    for (const tile of snap.tiles) {
      this.drawTileBase(ctx, tile, tileSize, kitchen, snap);
    }

    // 2. Draw Target Highlights
    for (const chef of snap.chefs) {
      if (!chef.targetTile) continue;
      const isPrimary = chef.id === activeChefId || snap.mode !== 'solo';
      const tx = chef.targetTile.x * tileSize;
      const ty = chef.targetTile.y * tileSize;
      ctx.save();
      ctx.strokeStyle = chef.id === activeChefId ? '#fde047' : chef.color;
      ctx.lineWidth = isPrimary ? 3.5 : 2;
      ctx.globalAlpha = chef.id === activeChefId ? 0.95 : 0.65;
      this.roundRect(ctx, tx + 2, ty + 2, tileSize - 4, tileSize - 4, 8);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Station Contents / Progress Bars / Fire
    for (const tile of snap.tiles) {
      this.drawTileOverlay(ctx, tile, tileSize);
    }

    // 4. Draw Banana Peels
    for (const peel of snap.peels) {
      this.drawBananaPeel(ctx, peel.x * tileSize, peel.y * tileSize, tileSize);
    }

    // 5. Draw Floor Items
    for (const fi of snap.floorItems) {
      this.drawHeldItem(ctx, fi.item, fi.x * tileSize, fi.y * tileSize, tileSize * 0.56);
    }

    // 6. Draw Thief Rats
    for (const rat of snap.rats) {
      this.drawRat(ctx, rat.x * tileSize, rat.y * tileSize, tileSize, rat.vx, rat.vy, rat.carrying);
    }

    // 7. Draw Chefs (sorted by Y for proper depth)
    const sortedChefs = [...snap.chefs].sort((a, b) => a.y - b.y);
    for (const chef of sortedChefs) {
      this.drawChef(ctx, chef, tileSize, chef.id === activeChefId, snap.mode);
    }

    // 8. Draw Thrown Items (arc height z)
    for (const th of snap.thrown) {
      const px = th.x * tileSize;
      const py = th.y * tileSize;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(px, py + tileSize * 0.12, tileSize * 0.16, tileSize * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      this.drawHeldItem(ctx, th.item, px, py - th.z * tileSize * 0.7, tileSize * 0.6);
    }

    // 9. Draw Particles
    for (const p of particles) {
      const px = p.x * tileSize;
      const py = p.y * tileSize - p.z * tileSize * 0.6;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.size * (tileSize / 56), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 10. Draw Floating Texts
    for (const ft of floatingTexts) {
      const px = ft.x * tileSize;
      const py = ft.y * tileSize;
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${Math.max(13, Math.round(tileSize * 0.27))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(ft.text, px, py);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, px, py);
      ctx.restore();
    }

    ctx.restore(); // End board transform

    // 11. Top HUD: Score + Timer (Top-Right) & Order Tickets (Below SDK bar)
    this.drawTopHud(ctx, w, snap);

    // 12. Bottom Quick Control Strip
    this.drawBottomStrip(ctx, w, h, snap);

    ctx.restore();
  }

  private drawHighwayBg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    const speed = 260;
    const offset = (this.animTime * speed) % 90;
    ctx.fillStyle = '#475569';
    for (let y = -90 + offset; y < h + 90; y += 90) {
      ctx.fillRect(w * 0.5 - 5, y, 10, 48);
    }
    // Asphalt texture stripes
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = -60 + (offset % 60); y < h + 60; y += 60) {
      ctx.fillRect(w * 0.22, y, 4, 24);
      ctx.fillRect(w * 0.78, y, 4, 24);
    }
  }

  private drawTileBase(
    ctx: CanvasRenderingContext2D,
    tile: TileState,
    s: number,
    kitchen: { floorA: string; floorB: string; counterColor: string; themeColor: string },
    snap: SimSnapshot,
  ): void {
    const x = tile.x * s;
    const y = tile.y * s;

    if (tile.baseType === 'gap') {
      return;
    }

    if (tile.baseType === 'bridge') {
      if (snap.bridgeDocked) {
        const flash = snap.bridgeWarning && Math.floor(this.animTime * 8) % 2 === 0;
        ctx.fillStyle = flash ? '#f97316' : '#64748b';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = flash ? '#fde047' : '#94a3b8';
        ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
        // Hazard stripes on edge
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x + 4, y + s * 0.45, s - 8, 4);
      } else {
        // Retracted bridge preview dashed frame
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.28)';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
        ctx.setLineDash([]);
      }
      return;
    }

    // Checkerboard floor underneath
    ctx.fillStyle = (tile.x + tile.y) % 2 === 0 ? kitchen.floorA : kitchen.floorB;
    ctx.fillRect(x, y, s, s);

    if (tile.baseType === 'floor') return;

    if (tile.baseType === 'wall') {
      ctx.fillStyle = '#291c14';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#3f2c1f';
      ctx.fillRect(x + 3, y + 3, s - 6, s - 8);
      return;
    }

    // Counter-type block
    const pad = 2;
    ctx.fillStyle = '#451a03';
    this.roundRect(ctx, x + pad, y + pad, s - pad * 2, s - pad * 2, 7);
    ctx.fill();

    const topColor =
      tile.baseType === 'pass'
        ? '#eab308'
        : tile.baseType === 'sink'
          ? '#0284c7'
          : tile.baseType === 'return'
            ? '#64748b'
            : tile.baseType === 'trash'
              ? '#334155'
              : tile.baseType === 'conveyor'
                ? '#1e293b'
                : kitchen.counterColor;

    ctx.fillStyle = topColor;
    this.roundRect(ctx, x + pad + 2, y + pad + 2, s - (pad + 2) * 2, s - (pad + 4) * 2, 5);
    ctx.fill();

    // Station specific top surface details
    const cx = x + s * 0.5;
    const cy = y + s * 0.5;

    switch (tile.baseType) {
      case 'crate': {
        ctx.fillStyle = '#92400e';
        this.roundRect(ctx, x + 6, y + 6, s - 12, s - 14, 5);
        ctx.fill();
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 8, y + 8, s - 16, s - 18);
        if (tile.crateIngredient) {
          this.drawIngredientIcon(ctx, tile.crateIngredient, cx, cy, s * 0.48);
        }
        break;
      }
      case 'board': {
        ctx.fillStyle = '#fef3c7';
        this.roundRect(ctx, x + s * 0.14, y + s * 0.16, s * 0.72, s * 0.64, 5);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Little knife on side when empty
        if (!tile.item) {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(cx + s * 0.14, cy - s * 0.2, s * 0.08, s * 0.26);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(cx + s * 0.14, cy + s * 0.06, s * 0.08, s * 0.12);
        }
        break;
      }
      case 'grill': {
        ctx.fillStyle = '#1e293b';
        this.roundRect(ctx, x + 6, y + 6, s - 12, s - 14, 6);
        ctx.fill();
        // Grill grates / glowing coil
        const hot = tile.cookContents.length > 0 || tile.cookedResult !== null;
        ctx.strokeStyle = hot ? '#f97316' : '#475569';
        ctx.lineWidth = 2.5;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(x + 12, cy + i * s * 0.14);
          ctx.lineTo(x + s - 12, cy + i * s * 0.14);
          ctx.stroke();
        }
        break;
      }
      case 'fryer': {
        ctx.fillStyle = '#334155';
        this.roundRect(ctx, x + 6, y + 6, s - 12, s - 14, 6);
        ctx.fill();
        ctx.fillStyle = tile.cookContents.length > 0 ? '#facc15' : '#ca8a04';
        this.roundRect(ctx, x + 10, y + 10, s - 20, s - 22, 4);
        ctx.fill();
        break;
      }
      case 'blender': {
        ctx.fillStyle = '#1e293b';
        this.roundRect(ctx, x + 8, y + 8, s - 16, s - 16, 8);
        ctx.fill();
        ctx.fillStyle = tile.cookContents.length > 0 ? '#a855f7' : '#cbd5e1';
        ctx.beginPath();
        ctx.arc(cx, cy - 1, s * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case 'sink': {
        ctx.fillStyle = '#bae6fd';
        this.roundRect(ctx, x + 8, y + 8, s - 16, s - 18, 6);
        ctx.fill();
        // Faucet
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx - 4, y + 4, 8, 10);
        break;
      }
      case 'pass': {
        // Animated arrows on delivery pass
        const shift = (this.animTime * 24) % 14;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 5, y + 5, s - 10, s - 12);
        ctx.clip();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.5;
        for (let px = x - 14 + shift; px < x + s + 14; px += 14) {
          ctx.beginPath();
          ctx.moveTo(px, y + 10);
          ctx.lineTo(px + 7, cy);
          ctx.lineTo(px, y + s - 14);
          ctx.stroke();
        }
        ctx.restore();
        ctx.font = `900 ${Math.round(s * 0.34)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔔', cx, cy);
        break;
      }
      case 'return': {
        ctx.fillStyle = '#94a3b8';
        this.roundRect(ctx, x + 7, y + 7, s - 14, s - 16, 5);
        ctx.fill();
        break;
      }
      case 'plates': {
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'trash': {
        ctx.fillStyle = '#0f172a';
        this.roundRect(ctx, x + 9, y + 9, s - 18, s - 20, 6);
        ctx.fill();
        ctx.font = `${Math.round(s * 0.36)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🗑️', cx, cy);
        break;
      }
      case 'conveyor': {
        const dir = tile.conveyorDir || { dx: 1, dy: 0 };
        const ang = Math.atan2(dir.dy, dir.dx);
        const move = (this.animTime * 22) % 12;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        for (let ox = -s * 0.35 + move; ox < s * 0.35; ox += 12) {
          ctx.beginPath();
          ctx.moveTo(ox - 4, -s * 0.18);
          ctx.lineTo(ox + 3, 0);
          ctx.lineTo(ox - 4, s * 0.18);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
    }
  }

  private drawTileOverlay(ctx: CanvasRenderingContext2D, tile: TileState, s: number): void {
    const x = tile.x * s;
    const y = tile.y * s;
    let cx = x + s * 0.5;
    let cy = y + s * 0.48;

    if (tile.baseType === 'conveyor' && tile.conveyorDir && tile.item) {
      cx += tile.conveyorDir.dx * tile.conveyorOffset * s * 0.45;
      cy += tile.conveyorDir.dy * tile.conveyorOffset * s * 0.45;
    }

    // Clean plates stack on 'plates' or 'sink'
    if (tile.baseType === 'plates' && tile.cleanPlateCount > 0) {
      for (let i = 0; i < Math.min(4, tile.cleanPlateCount); i++) {
        this.drawPlate(ctx, cx, cy - i * 3, s * 0.56, [], false, false);
      }
      this.drawCountBadge(ctx, x + s - 12, y + 12, tile.cleanPlateCount, '#38bdf8');
    }

    if (tile.baseType === 'sink') {
      if (tile.dirtyCount > 0) {
        this.drawDirtyPlate(ctx, cx - s * 0.14, cy, s * 0.44, tile.dirtyCount);
      }
      if (tile.cleanPlateCount > 0) {
        this.drawPlate(ctx, cx + s * 0.16, cy - 2, s * 0.38, [], false, false);
        this.drawCountBadge(ctx, x + s - 10, y + 12, tile.cleanPlateCount, '#4ade80');
      }
      if (tile.washProgress > 0) {
        this.drawProgressBar(ctx, x + 6, y + s - 11, s - 12, 6, tile.washProgress, '#38bdf8');
      }
    }

    if (tile.baseType === 'return' && tile.dirtyCount > 0) {
      this.drawDirtyPlate(ctx, cx, cy, s * 0.52, tile.dirtyCount);
    }

    // Item sitting on station
    if (tile.item) {
      this.drawHeldItem(ctx, tile.item, cx, cy, s * 0.58);
      if (tile.item.kind === 'ingredient' && (tile.item.chopProgress ?? 0) > 0) {
        this.drawProgressBar(
          ctx,
          x + 6,
          y + s - 11,
          s - 12,
          6,
          tile.item.chopProgress ?? 0,
          '#4ade80',
        );
      }
    }

    // Appliance contents & progress
    if (tile.baseType === 'grill' || tile.baseType === 'fryer' || tile.baseType === 'blender') {
      if (tile.cookedResult) {
        this.drawIngredientIcon(ctx, tile.cookedResult, cx, cy, s * 0.48);
      } else if (tile.cookContents.length > 0) {
        tile.cookContents.forEach((ing, idx) => {
          const offset = tile.cookContents.length === 2 ? (idx === 0 ? -s * 0.14 : s * 0.14) : 0;
          this.drawIngredientIcon(ctx, ing, cx + offset, cy, s * 0.36);
        });
      }

      if (tile.cookedResult === null && tile.cookProgress > 0) {
        this.drawProgressBar(ctx, x + 6, y + s - 11, s - 12, 6, tile.cookProgress, '#4ade80');
      } else if (tile.cookedResult !== null && tile.cookedResult !== 'burnt') {
        // Ready checkmark / warning!
        if (tile.burnProgress > 0.35) {
          const pulse = Math.floor(this.animTime * 10) % 2 === 0;
          this.drawProgressBar(
            ctx,
            x + 6,
            y + s - 11,
            s - 12,
            6,
            tile.burnProgress,
            pulse ? '#ef4444' : '#f97316',
          );
          if (pulse) {
            ctx.font = `900 ${Math.round(s * 0.32)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ef4444';
            ctx.fillText('⚠️', cx, y + 10);
          }
        } else {
          ctx.font = `900 ${Math.round(s * 0.28)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#4ade80';
          ctx.fillText('✔', x + s - 12, y + 14);
        }
      }
    }

    // Fire overlay!
    if (tile.fire > 0) {
      const flicker = Math.sin(this.animTime * 22 + tile.x * 3) * 3;
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.78)';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.32, y + s * 0.75);
      ctx.quadraticCurveTo(cx - s * 0.35, cy - s * 0.25, cx + flicker, y + s * 0.08);
      ctx.quadraticCurveTo(cx + s * 0.35, cy - s * 0.25, cx + s * 0.32, y + s * 0.75);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.16, y + s * 0.75);
      ctx.quadraticCurveTo(cx - s * 0.15, cy, cx - flicker * 0.6, y + s * 0.26);
      ctx.quadraticCurveTo(cx + s * 0.15, cy, cx + s * 0.16, y + s * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawChef(
    ctx: CanvasRenderingContext2D,
    chef: ChefState,
    s: number,
    isActive: boolean,
    mode: SimSnapshot['mode'],
  ): void {
    const px = chef.x * s;
    const py = chef.y * s;
    const r = s * 0.33;

    ctx.save();
    ctx.translate(px, py);

    // Active Solo ring
    if (isActive && mode === 'solo') {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.62, r * 1.18, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.65, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Facing rotation for body wobble
    const bob = Math.sin(chef.walkCycle) * 2.2;
    const chopBob = chef.isWorking ? Math.sin(this.animTime * 28) * 3 : 0;

    // Ears
    ctx.fillStyle = '#7c2d12';
    ctx.strokeStyle = '#291509';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-r * 0.88, -r * 0.15 + bob * 0.4, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.88, -r * 0.15 + bob * 0.4, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner ears
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(-r * 0.88, -r * 0.15 + bob * 0.4, r * 0.18, 0, Math.PI * 2);
    ctx.arc(r * 0.88, -r * 0.15 + bob * 0.4, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Apron / Body
    ctx.fillStyle = '#f8fafc';
    this.roundRect(ctx, -r * 0.72, r * 0.05, r * 1.44, r * 0.75, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = chef.color;
    this.roundRect(ctx, -r * 0.44, r * 0.14, r * 0.88, r * 0.56, 4);
    ctx.fill();

    // Head
    ctx.fillStyle = '#9a3412';
    ctx.beginPath();
    ctx.arc(0, -r * 0.16 + bob * 0.4, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face mask (tan)
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.06 + bob * 0.4, r * 0.58, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.22 + bob * 0.4, r * 0.26, 0, Math.PI * 2);
    ctx.arc(r * 0.25, -r * 0.22 + bob * 0.4, r * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (looking toward facing dir, wide if panicked!)
    const eyeR = chef.panic ? r * 0.22 : r * 0.17;
    const lookX = chef.dirX * r * 0.08;
    const lookY = chef.dirY * r * 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-r * 0.24, -r * 0.22 + bob * 0.4, eyeR, 0, Math.PI * 2);
    ctx.arc(r * 0.24, -r * 0.22 + bob * 0.4, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-r * 0.24 + lookX, -r * 0.22 + lookY + bob * 0.4, r * 0.08, 0, Math.PI * 2);
    ctx.arc(r * 0.24 + lookX, -r * 0.22 + lookY + bob * 0.4, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    if (chef.panic) {
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.14 + bob * 0.4, r * 0.2, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, r * 0.08 + bob * 0.4, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // Chef Hat!
    const hatY = -r * 0.82 + bob * 0.55 + chopBob * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-r * 0.26, hatY - r * 0.18, r * 0.28, 0, Math.PI * 2);
    ctx.arc(r * 0.26, hatY - r * 0.18, r * 0.28, 0, Math.PI * 2);
    ctx.arc(0, hatY - r * 0.28, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Colored headband
    ctx.fillStyle = chef.color;
    this.roundRect(ctx, -r * 0.54, hatY - r * 0.08, r * 1.08, r * 0.24, 3);
    ctx.fill();
    ctx.stroke();

    // Held Item in front of chef
    if (chef.held) {
      const hx = chef.dirX * r * 1.15;
      const hy = chef.dirY * r * 0.95 + chopBob;
      this.drawHeldItem(ctx, chef.held, hx, hy, s * 0.48);
    }

    // Name tag below chef
    ctx.font = `800 ${Math.max(10, Math.round(s * 0.2))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const tagW = ctx.measureText(chef.name).width + 10;
    this.roundRect(ctx, -tagW * 0.5, r * 0.82, tagW, 15, 6);
    ctx.fill();
    ctx.fillStyle = chef.color;
    ctx.fillText(chef.name, 0, r * 0.82 + 11);

    // Speech Shout Bubble!
    if (chef.shoutText) {
      ctx.font = `900 ${Math.max(11, Math.round(s * 0.22))}px system-ui, sans-serif`;
      const bw = ctx.measureText(chef.shoutText).width + 16;
      const by = -r * 2.15;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      this.roundRect(ctx, -bw * 0.5, by, bw, 24, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.fillText(chef.shoutText, 0, by + 16);
    }

    ctx.restore();
  }

  private drawHeldItem(
    ctx: CanvasRenderingContext2D,
    item: HeldItem,
    x: number,
    y: number,
    size: number,
  ): void {
    switch (item.kind) {
      case 'ingredient':
        this.drawIngredientIcon(ctx, item.ingredient, x, y, size);
        break;
      case 'plate':
        this.drawPlate(ctx, x, y, size, item.contents, Boolean(item.burnt), Boolean(item.dish));
        break;
      case 'dirty_plate':
        this.drawDirtyPlate(ctx, x, y, size, item.count);
        break;
      case 'extinguisher':
        this.drawExtinguisher(ctx, x, y, size);
        break;
    }
  }

  private drawPlate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    contents: IngredientKind[],
    burnt: boolean,
    complete: boolean,
  ): void {
    const r = size * 0.52;
    ctx.save();
    ctx.fillStyle = burnt ? '#334155' : '#f8fafc';
    ctx.strokeStyle = complete ? '#22c55e' : '#94a3b8';
    ctx.lineWidth = complete ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    if (contents.length > 0) {
      if (contents.length === 1) {
        this.drawIngredientIcon(ctx, contents[0], x, y, size * 0.72);
      } else {
        contents.forEach((ing, idx) => {
          const ang = (idx / contents.length) * Math.PI * 2 - Math.PI * 0.5;
          const ox = Math.cos(ang) * r * 0.35;
          const oy = Math.sin(ang) * r * 0.35;
          this.drawIngredientIcon(ctx, ing, x + ox, y + oy, size * 0.45);
        });
      }
    }
    ctx.restore();
  }

  private drawDirtyPlate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    count: number,
  ): void {
    const r = size * 0.48;
    ctx.save();
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Brown smudges
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
    ctx.arc(x + r * 0.22, y + r * 0.2, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if (count > 1) {
      this.drawCountBadge(ctx, x + r * 0.7, y - r * 0.7, count, '#ef4444');
    }
    ctx.restore();
  }

  private drawExtinguisher(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;
    this.roundRect(ctx, -size * 0.22, -size * 0.28, size * 0.44, size * 0.62, 5);
    ctx.fill();
    ctx.stroke();
    // Nozzle
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-size * 0.1, -size * 0.4, size * 0.2, size * 0.14);
    ctx.fillRect(size * 0.08, -size * 0.36, size * 0.24, size * 0.08);
    ctx.restore();
  }

  private drawIngredientIcon(
    ctx: CanvasRenderingContext2D,
    ing: IngredientKind,
    x: number,
    y: number,
    size: number,
  ): void {
    const info = INGREDIENTS[ing];
    const r = size * 0.44;
    ctx.save();
    ctx.translate(x, y);

    switch (ing) {
      case 'banana': {
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, r * 0.25);
        ctx.quadraticCurveTo(0, -r * 0.85, r * 0.9, r * 0.2);
        ctx.quadraticCurveTo(0, -r * 0.1, -r * 0.9, r * 0.25);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'banana_chopped': {
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 1.5;
        for (const [ox, oy] of [
          [-r * 0.35, -r * 0.2],
          [r * 0.35, -r * 0.15],
          [0, r * 0.32],
        ]) {
          ctx.beginPath();
          ctx.arc(ox, oy, r * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case 'lettuce': {
        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#86efac';
        ctx.beginPath();
        ctx.arc(-r * 0.15, -r * 0.1, r * 0.35, 0.2, 2.5);
        ctx.stroke();
        break;
      }
      case 'lettuce_chopped': {
        ctx.fillStyle = '#4ade80';
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate(i * 0.9 - 0.5);
          this.roundRect(ctx, -r * 0.5, -r * 0.2, r, r * 0.36, 3);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'bread': {
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        this.roundRect(ctx, -r * 0.72, -r * 0.48, r * 1.44, r * 0.96, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(-r * 0.25, -r * 0.15, r * 0.08, 0, Math.PI * 2);
        ctx.arc(r * 0.22, -r * 0.12, r * 0.08, 0, Math.PI * 2);
        ctx.arc(0, -r * 0.25, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'burger':
      case 'burger_cooked': {
        ctx.fillStyle = info.color;
        ctx.strokeStyle = info.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.72, r * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (ing === 'burger_cooked') {
          ctx.strokeStyle = '#291509';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-r * 0.4, -r * 0.2);
          ctx.lineTo(r * 0.4, r * 0.2);
          ctx.moveTo(-r * 0.4, r * 0.2);
          ctx.lineTo(r * 0.4, -r * 0.2);
          ctx.stroke();
        }
        break;
      }
      case 'dough': {
        ctx.fillStyle = '#fef3c7';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        this.roundRect(ctx, -r * 0.65, -r * 0.55, r * 1.3, r * 1.1, 4);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'coconut': {
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(-r * 0.18, -r * 0.18, r * 0.1, 0, Math.PI * 2);
        ctx.arc(r * 0.18, -r * 0.18, r * 0.1, 0, Math.PI * 2);
        ctx.arc(0, r * 0.12, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'coconut_chopped': {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-r * 0.25, 0, r * 0.36, 0, Math.PI * 2);
        ctx.arc(r * 0.28, r * 0.15, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'pastel_cooked': {
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        this.roundRect(ctx, -r * 0.78, -r * 0.48, r * 1.56, r * 0.96, 4);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#fde68a';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(-r * 0.62, -r * 0.34, r * 1.24, r * 0.68);
        ctx.setLineDash([]);
        break;
      }
      case 'acai': {
        ctx.fillStyle = '#6b21a8';
        ctx.strokeStyle = '#3b0764';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.2, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'acai_cooked': {
        ctx.fillStyle = '#7e22ce';
        ctx.strokeStyle = '#3b0764';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Banana slices on top!
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(-r * 0.22, -r * 0.1, r * 0.18, 0, Math.PI * 2);
        ctx.arc(r * 0.22, r * 0.1, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'burnt': {
        ctx.fillStyle = '#1f2937';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
  }

  private drawBananaPeel(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2;
    const r = s * 0.28;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6);
    ctx.quadraticCurveTo(r, 0, r * 0.9, r * 0.6);
    ctx.quadraticCurveTo(0, r * 0.2, -r * 0.9, r * 0.6);
    ctx.quadraticCurveTo(-r, 0, 0, -r * 0.6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawRat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: number,
    vx: number,
    vy: number,
    carrying: HeldItem | null,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    const ang = Math.atan2(vy, vx);
    ctx.rotate(ang);
    const r = s * 0.26;
    // Tail
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.quadraticCurveTo(-r * 1.5, Math.sin(this.animTime * 18) * 6, -r * 1.8, 0);
    ctx.stroke();
    // Body
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Bandit mask + ears
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(r * 0.25, -r * 0.4, r * 0.28, r * 0.8);
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(r * 0.15, -r * 0.55, r * 0.26, 0, Math.PI * 2);
    ctx.arc(r * 0.15, r * 0.55, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (carrying) {
      this.drawHeldItem(ctx, carrying, x, y - s * 0.24, s * 0.42);
    }
  }

  private drawTopHud(ctx: CanvasRenderingContext2D, w: number, snap: SimSnapshot): void {
    // Top-Right Score + Combo + Timer (placed away from top-left SDK bar)
    const mins = Math.floor(snap.timeLeft / 60);
    const secs = Math.floor(snap.timeLeft % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    const urgentTime = snap.timeLeft <= 25;

    ctx.save();
    // Timer pill
    const timerW = 104;
    const timerX = w - timerW - 12;
    const timerY = 8;
    ctx.fillStyle = urgentTime && Math.floor(this.animTime * 4) % 2 === 0 ? '#991b1b' : 'rgba(17,24,39,0.92)';
    ctx.strokeStyle = urgentTime ? '#ef4444' : '#facc15';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, timerX, timerY, timerW, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = urgentTime ? '#fecaca' : '#fef08a';
    ctx.fillText(`⏱ ${timeStr}`, timerX + timerW * 0.5, timerY + 24);

    // Score & Combo pill
    const scoreW = 175;
    const scoreX = timerX - scoreW - 8;
    ctx.fillStyle = 'rgba(17,24,39,0.92)';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, scoreX, timerY, scoreW, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.font = '900 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bbf7d0';
    ctx.fillText(`💰 ${snap.score} pts`, scoreX + 12, timerY + 24);
    if (snap.combo > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#facc15';
      ctx.fillText(`x${snap.combo}`, scoreX + scoreW - 10, timerY + 24);
    }

    // Order Tickets Rail at y = 50px
    const maxCardW = Math.min(168, Math.floor((w - 32) / Math.max(1, snap.orders.length)) - 8);
    const cardW = Math.max(115, maxCardW);
    const cardH = 60;
    const startX = 12;
    const startY = 50;

    snap.orders.forEach((order, idx) => {
      const rec = RECIPES[order.recipe];
      const cx = startX + idx * (cardW + 8);
      const pct = Math.max(0, Math.min(1, order.timeLeft / order.maxTime));
      const low = pct < 0.28;

      ctx.fillStyle = low && Math.floor(this.animTime * 6) % 2 === 0 ? '#fef2f2' : '#fef3c7';
      ctx.strokeStyle = idx === 0 ? '#facc15' : low ? '#ef4444' : '#d97706';
      ctx.lineWidth = idx === 0 ? 3 : 2;
      this.roundRect(ctx, cx, startY, cardW, cardH, 10);
      ctx.fill();
      ctx.stroke();

      // Header
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#78350f';
      ctx.fillText(`${rec.emoji} ${rec.name}`, cx + 8, startY + 19);

      // Steps Hint
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillStyle = '#92400e';
      ctx.fillText(rec.stepsHint.join(' + '), cx + 8, startY + 38);

      // Patience Bar
      const barW = cardW - 16;
      ctx.fillStyle = '#d6d3d1';
      this.roundRect(ctx, cx + 8, startY + 46, barW, 8, 4);
      ctx.fill();
      ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444';
      this.roundRect(ctx, cx + 8, startY + 46, barW * pct, 8, 4);
      ctx.fill();
    });

    ctx.restore();
  }

  private drawBottomStrip(ctx: CanvasRenderingContext2D, w: number, h: number, snap: SimSnapshot): void {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, h - 26, w, 26);
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    const modeHint =
      snap.mode === 'solo'
        ? 'SOLO: [Tab] Trocar Chef • [Espaço/E] Pegar/Entregar • [F/J] Picar/Lavar/Apagar • [Q/K] Arremessar • [Shift] Dash • [1-4] Gritar'
        : snap.mode === 'local2p'
          ? 'LOCAL 2P: P1 WASD + E/F/Q/Shift • P2 Setas + Enter(,)/.(M)//(N)/R-Shift • [1-4] Gritar'
          : 'ONLINE CO-OP: [WASD/Setas] Mover • [Espaço/E] Pegar/Entregar • [F/J] Picar/Lavar/Apagar • [Q/K] Arremessar • [Shift] Dash • [1-4] Gritar';
    ctx.fillText(modeHint, w * 0.5, h - 9);
    ctx.restore();
  }

  private drawProgressBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    color: string,
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    this.roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.fillStyle = color;
    this.roundRect(ctx, x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, pct)), h - 2, 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCountBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    count: number,
    bg: string,
  ): void {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(String(count), x, y + 0.5);
    ctx.restore();
  }

  private roundRect(
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
}
