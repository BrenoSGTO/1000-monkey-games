import { GRID_COLS, GRID_ROWS, KITCHENS } from './kitchens';
import {
  INGREDIENTS,
  RECIPES,
  canAcceptInBlender,
  canAcceptInFryer,
  canAcceptInGrill,
  canAcceptInPot,
  canPlaceIngredientOnPlate,
  matchCompletedRecipe,
  matchPotRecipe,
} from './recipes';
import { FIGURE_HEIGHT_UNITS, HANDS, drawMonkey, makeFace, type HandPos, type Mood } from './monkeyart';
import { chefApron, chefHat, chefStyle } from './monkeylook';
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
    if (kitchen.gapStyle === 'highway') {
      this.drawHighwayBg(ctx, w, h);
    } else if (kitchen.gapStyle === 'lava') {
      this.drawLavaBg(ctx, w, h);
    } else {
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      bgGrad.addColorStop(0, '#2c190d');
      bgGrad.addColorStop(1, '#130a05');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Reserve top 128px for HUD + Order Tickets, bottom 28px for control strip
    const topMargin = 128;
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

    // Split platform shadow (trucks / volcano islands) vs full board shadow
    if (kitchen.gapStyle) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.roundRect(ctx, -6, 8, tileSize * 6 + 12, boardH, 14);
      ctx.fill();
      this.roundRect(ctx, tileSize * 8 - 6, 8, tileSize * 6 + 12, boardH, 14);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.roundRect(ctx, -8, 10, boardW + 16, boardH + 8, 16);
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
    const workingTiles = new Set<string>();
    for (const chef of snap.chefs) {
      if (chef.isWorking && chef.targetTile) {
        workingTiles.add(`${chef.targetTile.x},${chef.targetTile.y}`);
      }
    }
    let anyFire = false;
    for (const tile of snap.tiles) {
      if (tile.fire > 0) anyFire = true;
      this.drawTileOverlay(ctx, tile, tileSize, workingTiles.has(`${tile.x},${tile.y}`));
    }

    // 4. Draw Banana Peels
    for (const peel of snap.peels) {
      this.drawBananaPeel(ctx, peel.x * tileSize, peel.y * tileSize, tileSize);
    }

    // 5. Draw Floor Items
    for (const fi of snap.floorItems) {
      this.drawHeldItem(ctx, fi.item, fi.x * tileSize, fi.y * tileSize, tileSize * 0.56);
    }

    // 6. Subtle Throw Aim Dot for active chef holding throwable ingredient
    const activeChef = snap.chefs.find((c) => c.id === activeChefId) ?? (snap.mode === 'solo' ? snap.chefs[0] : null);
    if (activeChef?.held?.kind === 'ingredient') {
      this.drawThrowPreview(ctx, activeChef, tileSize);
    }

    // 7. Draw Thief Rats
    for (const rat of snap.rats) {
      this.drawRat(ctx, rat.x * tileSize, rat.y * tileSize, tileSize, rat.vx, rat.vy, rat.carrying);
    }

    // 8. Draw Chefs (sorted by Y for proper depth)
    const sortedChefs = [...snap.chefs].sort((a, b) => a.y - b.y);
    for (const chef of sortedChefs) {
      this.drawChef(ctx, chef, tileSize, chef.id === activeChefId, snap.mode);
    }

    // 9. Draw Thrown Items (arc height z)
    for (const th of snap.thrown) {
      const px = th.x * tileSize;
      const py = th.y * tileSize;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(px, py + tileSize * 0.12, tileSize * 0.16, tileSize * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      this.drawHeldItem(ctx, th.item, px, py - th.z * tileSize * 0.7, tileSize * 0.62);
    }

    // 10. Draw Particles
    for (const p of particles) {
      const px = p.x * tileSize;
      const py = p.y * tileSize - p.z * tileSize * 0.6;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = p.kind === 'steam' ? alpha * 0.6 : alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.size * (tileSize / 56), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 11. Extinguisher Beacon when fire is active!
    if (anyFire) {
      this.drawExtinguisherBeacon(ctx, snap, tileSize);
    }

    // 12. Contextual Action Hint above active chef's targeted tile
    if (snap.countdown <= 0 && activeChef?.targetTile) {
      const targetTile = snap.tiles[activeChef.targetTile.y * GRID_COLS + activeChef.targetTile.x];
      if (targetTile) {
        const hint = this.computeActionHint(activeChef, targetTile, snap);
        if (hint) {
          this.drawActionHint(ctx, targetTile.x * tileSize + tileSize * 0.5, targetTile.y * tileSize - 4, hint);
        }
      }
    }

    // 13. Draw Floating Texts
    for (const ft of floatingTexts) {
      const px = ft.x * tileSize;
      const py = ft.y * tileSize;
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${Math.max(13, Math.round(tileSize * 0.27))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.88)';
      ctx.strokeText(ft.text, px, py);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, px, py);
      ctx.restore();
    }

    // Rush Hour warm border pulse around kitchen
    if (snap.rushHour && snap.countdown <= 0) {
      const pulse = 0.28 + Math.sin(this.animTime * 8) * 0.16;
      ctx.save();
      ctx.strokeStyle = `rgba(249, 115, 22, ${pulse})`;
      ctx.lineWidth = 5;
      this.roundRect(ctx, -4, -4, boardW + 8, boardH + 8, 14);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // End board transform

    // 14. Top HUD: Score + Combo + Timer & Order Tickets
    this.drawTopHud(ctx, w, snap);

    // 15. Opening 3-2-1 Countdown Overlay
    if (snap.countdown > 0) {
      this.drawCountdownOverlay(ctx, w, h, snap.countdown, kitchen.name);
    }

    // 16. Bottom Quick Control Strip
    this.drawBottomStrip(ctx, w, h, snap);

    ctx.restore();
  }

  private drawHighwayBg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    const speed = 280;
    const offset = (this.animTime * speed) % 90;
    ctx.fillStyle = '#64748b';
    for (let y = -90 + offset; y < h + 90; y += 90) {
      ctx.fillRect(w * 0.5 - 5, y, 10, 48);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    for (let y = -60 + (offset % 60); y < h + 60; y += 60) {
      ctx.fillRect(w * 0.22, y, 4, 24);
      ctx.fillRect(w * 0.78, y, 4, 24);
    }
  }

  private drawLavaBg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1c0a04');
    grad.addColorStop(0.45, '#450a0a');
    grad.addColorStop(0.5, '#9a3412');
    grad.addColorStop(0.55, '#450a0a');
    grad.addColorStop(1, '#1c0a04');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Central flowing lava stream
    const lavaW = Math.max(96, w * 0.16);
    const lx = w * 0.5 - lavaW * 0.5;
    const streamGrad = ctx.createLinearGradient(lx, 0, lx + lavaW, 0);
    streamGrad.addColorStop(0, '#991b1b');
    streamGrad.addColorStop(0.3, '#ea580c');
    streamGrad.addColorStop(0.5, '#facc15');
    streamGrad.addColorStop(0.7, '#ea580c');
    streamGrad.addColorStop(1, '#991b1b');
    ctx.fillStyle = streamGrad;
    ctx.fillRect(lx, 0, lavaW, h);

    // Animated magma blobs
    const speed = 85;
    const offset = (this.animTime * speed) % 110;
    ctx.fillStyle = 'rgba(254, 240, 138, 0.35)';
    for (let y = -110 + offset; y < h + 110; y += 110) {
      const wave = Math.sin(this.animTime * 2.5 + y * 0.03) * 14;
      ctx.beginPath();
      ctx.ellipse(w * 0.5 + wave, y, 16, 28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTileBase(
    ctx: CanvasRenderingContext2D,
    tile: TileState,
    s: number,
    kitchen: { floorA: string; floorB: string; counterColor: string; themeColor: string; gapStyle?: 'highway' | 'lava' },
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
        ctx.fillStyle = flash ? '#f97316' : kitchen.gapStyle === 'lava' ? '#57534e' : '#475569';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = flash ? '#fde047' : kitchen.gapStyle === 'lava' ? '#78716c' : '#94a3b8';
        ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x + 4, y + s * 0.45, s - 8, 4);
      } else {
        ctx.strokeStyle = kitchen.gapStyle === 'lava' ? 'rgba(251, 146, 60, 0.4)' : 'rgba(250, 204, 21, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
        ctx.setLineDash([]);
      }
      return;
    }

    // Checkerboard floor underneath
    ctx.fillStyle = (tile.x + tile.y) % 2 === 0 ? kitchen.floorA : kitchen.floorB;
    ctx.fillRect(x, y, s, s);

    if (tile.baseType === 'floor') {
      // Subtle floor tile seam
      ctx.strokeStyle = 'rgba(0,0,0,0.045)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      return;
    }

    if (tile.baseType === 'wall') {
      ctx.fillStyle = '#241710';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#3b281c';
      ctx.fillRect(x + 2, y + 2, s - 4, s - 9);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + 3, y + 3, s - 6, 3);
      return;
    }

    // 2.5D Counter block (front face + elevated top surface)
    const pad = 2;
    ctx.fillStyle = '#3b1506';
    this.roundRect(ctx, x + pad, y + pad + 2, s - pad * 2, s - pad * 2 - 1, 7);
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
                : tile.baseType === 'pot'
                  ? '#7c2d12'
                  : kitchen.counterColor;

    ctx.fillStyle = topColor;
    this.roundRect(ctx, x + pad + 2, y + pad + 1, s - (pad + 2) * 2, s - (pad + 5) * 2, 5);
    ctx.fill();

    // Subtle top specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + pad + 6, y + pad + 2, s - (pad + 6) * 2, 2);

    const cx = x + s * 0.5;
    const cy = y + s * 0.47;

    switch (tile.baseType) {
      case 'crate': {
        ctx.fillStyle = '#92400e';
        this.roundRect(ctx, x + 6, y + 5, s - 12, s - 14, 5);
        ctx.fill();
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 8, y + 7, s - 16, s - 18);
        if (tile.crateIngredient) {
          this.drawIngredientIcon(ctx, tile.crateIngredient, cx, cy, s * 0.5);
        }
        break;
      }
      case 'board': {
        ctx.fillStyle = '#fef3c7';
        this.roundRect(ctx, x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.64, 5);
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (!tile.item) {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(cx + s * 0.14, cy - s * 0.2, s * 0.08, s * 0.26);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(cx + s * 0.14, cy + s * 0.06, s * 0.08, s * 0.12);
        }
        break;
      }
      case 'pot': {
        // Stove base + glowing burner ring
        ctx.fillStyle = '#1c1917';
        this.roundRect(ctx, x + 6, y + 5, s - 12, s - 14, 6);
        ctx.fill();
        const active = tile.cookContents.length > 0 || tile.cookedResult !== null;
        if (active) {
          const glow = 0.5 + Math.sin(this.animTime * 9 + tile.x) * 0.25;
          ctx.strokeStyle = `rgba(249, 115, 22, ${glow})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Cast-iron cauldron handles
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx - s * 0.31, cy, s * 0.07, Math.PI * 0.5, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + s * 0.31, cy, s * 0.07, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.stroke();
        // Cauldron rim
        ctx.fillStyle = '#292524';
        ctx.strokeStyle = '#57534e';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.31, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Broth surface
        const matched = matchPotRecipe(tile.cookContents);
        let brothColor = '#44403c';
        if (tile.cookedResult === 'burnt') brothColor = '#111827';
        else if (tile.cookedResult === 'soup_macacao') brothColor = '#ea580c';
        else if (tile.cookedResult === 'soup_banana') brothColor = '#f59e0b';
        else if (matched) brothColor = matched.brothColor;
        else if (tile.cookContents.length > 0) brothColor = '#b45309';

        ctx.fillStyle = brothColor;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.24, 0, Math.PI * 2);
        ctx.fill();

        // Bubbling soup animation when simmering or ready!
        if (matched || (tile.cookedResult && tile.cookedResult !== 'burnt')) {
          ctx.fillStyle = 'rgba(254, 249, 195, 0.72)';
          for (let i = 0; i < 3; i++) {
            const phase = (this.animTime * 2.6 + i * 0.37 + tile.x) % 1;
            const ang = i * 2.1 + tile.y;
            const bx = cx + Math.cos(ang) * s * 0.11;
            const by = cy + Math.sin(ang) * s * 0.11;
            const br = (1 - Math.abs(phase * 2 - 1)) * s * 0.065;
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(0.8, br), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'grill': {
        ctx.fillStyle = '#1e293b';
        this.roundRect(ctx, x + 6, y + 5, s - 12, s - 14, 6);
        ctx.fill();
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
        this.roundRect(ctx, x + 6, y + 5, s - 12, s - 14, 6);
        ctx.fill();
        const frying = tile.cookContents.length > 0 || tile.cookedResult !== null;
        ctx.fillStyle = frying ? '#facc15' : '#ca8a04';
        this.roundRect(ctx, x + 10, y + 9, s - 20, s - 22, 4);
        ctx.fill();
        if (frying && tile.cookedResult !== 'burnt') {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          const bx = cx + Math.sin(this.animTime * 11 + tile.x) * s * 0.14;
          const by = cy + Math.cos(this.animTime * 9 + tile.y) * s * 0.1;
          ctx.beginPath();
          ctx.arc(bx, by, s * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'blender': {
        ctx.fillStyle = '#1e293b';
        this.roundRect(ctx, x + 8, y + 6, s - 16, s - 16, 8);
        ctx.fill();
        const blending = tile.cookContents.length > 0 || tile.cookedResult !== null;
        ctx.fillStyle = blending ? '#a855f7' : '#cbd5e1';
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (blending && tile.cookedResult === null && tile.cookProgress > 0) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(this.animTime * 16);
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-s * 0.14, 0);
          ctx.lineTo(s * 0.14, 0);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'sink': {
        ctx.fillStyle = '#bae6fd';
        this.roundRect(ctx, x + 8, y + 7, s - 16, s - 18, 6);
        ctx.fill();
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx - 4, y + 3, 8, 10);
        break;
      }
      case 'pass': {
        const shift = (this.animTime * 24) % 14;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 5, y + 4, s - 10, s - 12);
        ctx.clip();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.5;
        for (let px = x - 14 + shift; px < x + s + 14; px += 14) {
          ctx.beginPath();
          ctx.moveTo(px, y + 9);
          ctx.lineTo(px + 7, cy);
          ctx.lineTo(px, y + s - 15);
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
        this.roundRect(ctx, x + 7, y + 6, s - 14, s - 16, 5);
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
        this.roundRect(ctx, x + 9, y + 8, s - 18, s - 20, 6);
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

  private drawTileOverlay(
    ctx: CanvasRenderingContext2D,
    tile: TileState,
    s: number,
    isActivelyWorked: boolean,
  ): void {
    const x = tile.x * s;
    const y = tile.y * s;
    let cx = x + s * 0.5;
    let cy = y + s * 0.46;

    if (tile.baseType === 'conveyor' && tile.conveyorDir && tile.item) {
      cx += tile.conveyorDir.dx * tile.conveyorOffset * s * 0.45;
      cy += tile.conveyorDir.dy * tile.conveyorOffset * s * 0.45;
    }

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
      // Animated chopping knife on active board!
      if (tile.baseType === 'board' && isActivelyWorked) {
        const chopY = Math.abs(Math.sin(this.animTime * 24)) * s * 0.16;
        ctx.save();
        ctx.translate(cx + s * 0.18, cy - s * 0.12 - chopY);
        ctx.rotate(-0.45 + Math.sin(this.animTime * 24) * 0.2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-3, -10, 6, 14);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-3, 4, 6, 7);
        ctx.restore();
      }
    }

    // Appliance contents & progress (`pot`, `grill`, `fryer`, `blender`)
    if (
      tile.baseType === 'pot' ||
      tile.baseType === 'grill' ||
      tile.baseType === 'fryer' ||
      tile.baseType === 'blender'
    ) {
      if (tile.cookedResult) {
        this.drawIngredientIcon(ctx, tile.cookedResult, cx, cy, s * 0.5);
      } else if (tile.cookContents.length > 0) {
        const len = tile.cookContents.length;
        tile.cookContents.forEach((ing, idx) => {
          let ox = 0;
          let oy = 0;
          if (len === 2) {
            ox = idx === 0 ? -s * 0.13 : s * 0.13;
          } else if (len >= 3) {
            const ang = (idx / len) * Math.PI * 2 - Math.PI * 0.5;
            ox = Math.cos(ang) * s * 0.13;
            oy = Math.sin(ang) * s * 0.11;
          }
          this.drawIngredientIcon(ctx, ing, cx + ox, cy + oy, len >= 3 ? s * 0.3 : s * 0.36);
        });
      }

      if (tile.cookedResult === null && tile.cookProgress > 0) {
        this.drawProgressBar(ctx, x + 6, y + s - 11, s - 12, 6, tile.cookProgress, '#4ade80');
      } else if (tile.cookedResult !== null && tile.cookedResult !== 'burnt') {
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
      // Warm fire glow halo
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, s * 0.9);
      glow.addColorStop(0, 'rgba(249, 115, 22, 0.45)');
      glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.32, y + s * 0.75);
      ctx.quadraticCurveTo(cx - s * 0.35, cy - s * 0.25, cx + flicker, y + s * 0.06);
      ctx.quadraticCurveTo(cx + s * 0.35, cy - s * 0.25, cx + s * 0.32, y + s * 0.75);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.16, y + s * 0.75);
      ctx.quadraticCurveTo(cx - s * 0.15, cy, cx - flicker * 0.6, y + s * 0.25);
      ctx.quadraticCurveTo(cx + s * 0.15, cy, cx + s * 0.16, y + s * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawThrowPreview(ctx: CanvasRenderingContext2D, chef: ChefState, s: number): void {
    // Approximate landing spot for throw (vz=2.4, g=9.8, z0=0.45 -> flight ~0.64s, v=8.4 -> ~4.8 tiles? No, check math:
    // 0.45 + 2.4t - 4.9t^2 = 0 => t = (2.4 + sqrt(5.76 + 8.82))/9.8 = (2.4 + 3.82)/9.8 = 0.635s
    // distance = 0.45 + 8.4 * 0.635 = ~5.7 tiles, capped inside grid
    const dist = 5.4;
    const tx = Math.max(0.5, Math.min(GRID_COLS - 0.5, chef.x + chef.dirX * dist));
    const ty = Math.max(0.5, Math.min(GRID_ROWS - 0.5, chef.y + chef.dirY * dist));

    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.32)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo((chef.x + chef.dirX * 0.5) * s, (chef.y + chef.dirY * 0.5) * s);
    ctx.lineTo(tx * s, ty * s);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.beginPath();
    ctx.arc(tx * s, ty * s, s * 0.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawExtinguisherBeacon(ctx: CanvasRenderingContext2D, snap: SimSnapshot, s: number): void {
    // Don't show if a chef is already holding the extinguisher
    if (snap.chefs.some((c) => c.held?.kind === 'extinguisher')) return;

    let ex: number | null = null;
    let ey: number | null = null;

    for (const t of snap.tiles) {
      if (t.item?.kind === 'extinguisher') {
        ex = (t.x + 0.5) * s;
        ey = t.y * s;
        break;
      }
    }
    if (ex === null) {
      for (const fi of snap.floorItems) {
        if (fi.item.kind === 'extinguisher') {
          ex = fi.x * s;
          ey = fi.y * s - s * 0.4;
          break;
        }
      }
    }
    if (ex === null || ey === null) return;

    const bob = Math.sin(this.animTime * 10) * 5;
    ctx.save();
    ctx.fillStyle = '#0ea5e9';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    this.roundRect(ctx, ex - 38, ey - 26 + bob, 76, 20, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🧯 EXTINTOR!', ex, ey - 13 + bob);
    ctx.restore();
  }

  private computeActionHint(chef: ChefState, tile: TileState, snap: SimSnapshot): string | null {
    if (tile.fire > 0) {
      return chef.held?.kind === 'extinguisher' ? 'F: Apagar fogo!' : '🧯 Pegue o Extintor!';
    }
    switch (tile.baseType) {
      case 'crate':
        if (!chef.held && !tile.item && tile.crateIngredient) {
          return `E: ${INGREDIENTS[tile.crateIngredient].name}`;
        }
        return null;
      case 'board':
        if (tile.item?.kind === 'ingredient' && INGREDIENTS[tile.item.ingredient].choppableTo) {
          return 'F: Picar!';
        }
        if (chef.held?.kind === 'ingredient' && INGREDIENTS[chef.held.ingredient].choppableTo && !tile.item) {
          return 'E: Colocar p/ picar';
        }
        return null;
      case 'pot':
        if (tile.cookedResult && tile.cookedResult !== 'burnt') {
          return chef.held?.kind === 'plate' ? 'E: Servir Sopa!' : 'E: Pegar Sopa';
        }
        if (chef.held?.kind === 'ingredient') {
          if (canAcceptInPot(tile.cookContents, tile.cookedResult, chef.held.ingredient)) {
            return 'E: Por no Caldeirão';
          }
          if (INGREDIENTS[chef.held.ingredient].choppableTo) {
            return '🔪 Pique na tábua antes!';
          }
        }
        return null;
      case 'grill':
        if (tile.cookedResult && tile.cookedResult !== 'burnt') return 'E: Tirar da Chapa!';
        if (chef.held?.kind === 'ingredient' && canAcceptInGrill(tile.cookContents, tile.cookedResult, chef.held.ingredient)) {
          return 'E: Grelhar Carne';
        }
        return null;
      case 'fryer':
        if (tile.cookedResult && tile.cookedResult !== 'burnt') return 'E: Tirar Pastel!';
        if (chef.held?.kind === 'ingredient' && canAcceptInFryer(tile.cookContents, tile.cookedResult, chef.held.ingredient)) {
          return 'E: Fritar';
        }
        return null;
      case 'blender':
        if (tile.cookedResult && tile.cookedResult !== 'burnt') return 'E: Pegar Açaí!';
        if (chef.held?.kind === 'ingredient' && canAcceptInBlender(tile.cookContents, tile.cookedResult, chef.held.ingredient)) {
          return 'E: Bater Açaí';
        }
        return null;
      case 'sink':
        if (tile.dirtyCount > 0) return 'F: Lavar Prato!';
        if (chef.held?.kind === 'dirty_plate') return 'E: Por na Pia';
        return null;
      case 'return':
        if (tile.dirtyCount > 0) return 'E: Pegar Pratos Sujos';
        return null;
      case 'plates':
        if (!chef.held && tile.cleanPlateCount > 0) return 'E: Pegar Prato';
        if (chef.held?.kind === 'ingredient' && tile.cleanPlateCount > 0 && canPlaceIngredientOnPlate([], chef.held.ingredient)) {
          return 'E: Empratar!';
        }
        return null;
      case 'pass':
        if (chef.held?.kind === 'plate') {
          const rec = matchCompletedRecipe(chef.held.contents);
          if (rec && snap.orders.some((o) => o.recipe === rec)) {
            return `E: ENTREGAR ${RECIPES[rec].emoji}!`;
          }
        }
        return null;
      default:
        return null;
    }
  }

  private drawActionHint(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    ctx.save();
    ctx.font = '800 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, x - w * 0.5, y - 16, w, 19, 7);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(text, x, y - 3);
    ctx.restore();
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

    // Active Solo ring & pointer
    if (isActive && mode === 'solo') {
      const pulse = 1 + Math.sin(this.animTime * 7) * 0.06;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.62, r * 1.2 * pulse, r * 0.56 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.65, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    const chopBob = chef.isWorking ? Math.sin(this.animTime * 28) * 3 : 0;

    // ── macaco-chef (pintor compartilhado) ──
    {
      const speed = Math.hypot(chef.vx, chef.vy);
      const walking = speed > 0.25;
      const dashing = chef.dashTimer > 0;
      const slipping = chef.slipTimer > 0;
      const shouting = Boolean(chef.shoutText);
      const t = this.animTime;
      let mood: Mood = chef.held ? 'happy' : 'neutral';
      let armL: HandPos | undefined;
      let armR: HandPos | undefined;
      const u = (s * 0.68) / FIGURE_HEIGHT_UNITS;
      const feetY = r * 0.78;
      if (slipping) mood = 'dizzy';
      else if (chef.panic) mood = 'scared';
      else if (shouting) mood = 'shouting';
      else if (dashing) mood = 'angry';
      else if (chef.isWorking) mood = 'focus';
      else if (walking) mood = 'happy';

      if (slipping) {
        armL = HANDS.up(-1, t * 20);
        armR = HANDS.up(1, t * 20 + 1.3);
      } else if (chef.isWorking) {
        armL = { x: -0.45, y: -1.35 + Math.sin(this.animTime * 28) * 0.28 };
        armR = { x: 0.45, y: -1.35 - Math.sin(this.animTime * 28) * 0.28 };
      } else if (chef.held) {
        const hx = (chef.dirX * r * 1.15) / u;
        const hy = (chef.dirY * r * 0.95 + chopBob - feetY) / u;
        const cx = Math.max(-1.1, Math.min(1.1, hx));
        const cy = Math.max(-2.1, Math.min(-0.8, hy - 0.2));
        armL = { x: cx - 0.45, y: cy };
        armR = { x: cx + 0.45, y: cy };
      } else if (chef.panic) {
        armL = HANDS.up(-1, t * 24);
        armR = HANDS.up(1, t * 24 + 2);
      }

      const lookX = chef.dirX;
      const lookY = chef.dirY * 0.8;
      const turn = chef.dirX * 0.6;
      const face = makeFace(mood, t, chef.index * 1.7 + 0.4, { x: lookX, y: lookY });

      ctx.save();
      ctx.translate(0, feetY);
      if (slipping) ctx.rotate(Math.sin(t * 22) * 0.18);
      drawMonkey(ctx, {
        style: chefStyle(chef.index),
        face,
        height: s * 0.68,
        turn,
        squashX: dashing ? 0.9 : 1,
        squashY: dashing ? 1.08 : 1 + (chef.isWorking ? Math.sin(t * 28) * 0.02 : 0),
        breathe: Math.sin(t * 2.4 + chef.index),
        walk: chef.walkCycle,
        walkAmp: walking ? Math.min(1, speed * 0.55) : 0,
        tailPhase: t * (walking ? 7 : 2.5) + chef.index,
        tailAmp: dashing ? 0.9 : walking ? 0.5 : 0.3,
        tailSide: chef.dirX >= 0 ? -1 : 1,
        earFlop: walking ? Math.sin(chef.walkCycle * 2 - 0.7) * 0.6 : Math.sin(t * 1.4 + chef.index) * 0.1,
        headTilt: Math.sin(t * 0.9 + chef.index) * 0.03,
        lean: dashing ? chef.dirX * 0.22 : 0,
        armL,
        armR,
        tuft: false,
        accessory: chefHat(chef.color, t, chef.isWorking),
        bodyAccessory: chefApron(chef.color),
        outlinePx: Math.max(1.8, s * 0.03),
      });
      ctx.restore();
    }

    // Active chef overhead chevron in Solo mode
    if (isActive && mode === 'solo' && !chef.shoutText) {
      const bob = Math.sin(this.animTime * 7) * 3;
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.72 + bob);
      ctx.lineTo(-6, -r * 2.02 + bob);
      ctx.lineTo(6, -r * 2.02 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Auto-working indicator on inactive Solo chef
    if (!isActive && chef.autoWorkTile && chef.isWorking) {
      const bob = Math.sin(this.animTime * 14) * 3;
      ctx.font = `900 ${Math.round(s * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('⚡', 0, -r * 1.75 + bob);
    }

    // Held Item in front of chef
    if (chef.held) {
      const hx = chef.dirX * r * 1.15;
      const hy = chef.dirY * r * 0.95 + chopBob;
      this.drawHeldItem(ctx, chef.held, hx, hy, s * 0.48);
    }

    // Name tag below chef
    ctx.font = `800 ${Math.max(10, Math.round(s * 0.2))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    const tagW = ctx.measureText(chef.name).width + 10;
    this.roundRect(ctx, -tagW * 0.5, r * 1.0, tagW, 15, 6);
    ctx.fill();
    ctx.fillStyle = chef.color;
    ctx.fillText(chef.name, 0, r * 1.0 + 11);

    // Speech Shout Bubble!
    if (chef.shoutText) {
      ctx.font = `900 ${Math.max(11, Math.round(s * 0.22))}px system-ui, sans-serif`;
      const bw = ctx.measureText(chef.shoutText).width + 16;
      const by = -r * 2.2;
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
    if (complete) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = burnt ? '#334155' : '#f8fafc';
    ctx.strokeStyle = complete ? '#22c55e' : '#94a3b8';
    ctx.lineWidth = complete ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    if (contents.length > 0) {
      if (contents.length === 1) {
        this.drawIngredientIcon(ctx, contents[0], x, y, size * 0.76);
      } else {
        contents.forEach((ing, idx) => {
          const ang = (idx / contents.length) * Math.PI * 2 - Math.PI * 0.5;
          const ox = Math.cos(ang) * r * 0.35;
          const oy = Math.sin(ang) * r * 0.35;
          this.drawIngredientIcon(ctx, ing, x + ox, y + oy, size * 0.46);
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
      case 'carrot': {
        ctx.save();
        ctx.rotate(-0.45);
        // Leafy green top
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = Math.max(1.8, r * 0.22);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r * 0.45, 0);
        ctx.lineTo(r * 0.85, -r * 0.24);
        ctx.moveTo(r * 0.45, 0);
        ctx.lineTo(r * 0.88, r * 0.18);
        ctx.stroke();
        // Orange body
        ctx.fillStyle = '#fb923c';
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-r * 0.78, 0);
        ctx.quadraticCurveTo(r * 0.1, -r * 0.44, r * 0.52, -r * 0.24);
        ctx.quadraticCurveTo(r * 0.62, 0, r * 0.52, r * 0.24);
        ctx.quadraticCurveTo(r * 0.1, r * 0.44, -r * 0.78, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'carrot_chopped': {
        ctx.fillStyle = '#fb923c';
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 1.5;
        for (const [ox, oy] of [
          [-r * 0.34, -r * 0.22],
          [r * 0.34, -r * 0.14],
          [0, r * 0.32],
        ]) {
          ctx.beginPath();
          ctx.arc(ox, oy, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fed7aa';
          ctx.beginPath();
          ctx.arc(ox, oy, r * 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fb923c';
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
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(-r * 0.22, -r * 0.1, r * 0.18, 0, Math.PI * 2);
        ctx.arc(r * 0.22, r * 0.1, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'soup_banana': {
        // Creamy golden banana-coconut soup bowl
        ctx.fillStyle = '#fef3c7';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        // Swirl + coconut & banana garnish
        ctx.fillStyle = '#fef9c3';
        ctx.beginPath();
        ctx.arc(-r * 0.2, -r * 0.12, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r * 0.2, r * 0.14, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'soup_macacao': {
        // Signature Sopa de Macacão! Rich terracotta bowl + hearty orange broth + colorful chunks!
        ctx.fillStyle = '#7c2d12';
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.64, 0, Math.PI * 2);
        ctx.fill();
        // Banana slice, carrot coin, green herb!
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(-r * 0.22, -r * 0.16, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(r * 0.24, -r * 0.08, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(0, r * 0.22, r * 0.16, 0, Math.PI * 2);
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
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.quadraticCurveTo(-r * 1.5, Math.sin(this.animTime * 18) * 6, -r * 1.8, 0);
    ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
    const mins = Math.floor(snap.timeLeft / 60);
    const secs = Math.floor(snap.timeLeft % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    const urgentTime = snap.timeLeft <= 25;

    ctx.save();
    // Timer pill
    const timerW = 104;
    const timerX = w - timerW - 12;
    const timerY = 8;
    ctx.fillStyle =
      urgentTime && Math.floor(this.animTime * 4) % 2 === 0
        ? '#991b1b'
        : snap.rushHour
          ? '#7c2d12'
          : 'rgba(17,24,39,0.92)';
    ctx.strokeStyle = urgentTime ? '#ef4444' : snap.rushHour ? '#f97316' : '#facc15';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, timerX, timerY, timerW, 36, 12);
    ctx.fill();
    ctx.stroke();
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = urgentTime ? '#fecaca' : '#fef08a';
    ctx.fillText(`⏱ ${timeStr}`, timerX + timerW * 0.5, timerY + 24);

    // Score & Combo pill
    const scoreW = 186;
    const scoreX = timerX - scoreW - 8;
    ctx.fillStyle = 'rgba(17,24,39,0.92)';
    ctx.strokeStyle = snap.combo >= 3 ? '#facc15' : '#4ade80';
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
      ctx.fillStyle = snap.combo >= 3 ? '#fb923c' : '#facc15';
      ctx.fillText(`🔥x${snap.combo}`, scoreX + scoreW - 10, timerY + 24);
    }

    // Rush Hour badge to the left of score if space permits
    if (snap.rushHour && scoreX > 410) {
      const rushW = 132;
      const rushX = scoreX - rushW - 8;
      ctx.fillStyle = '#9a3412';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      this.roundRect(ctx, rushX, timerY + 3, rushW, 30, 10);
      ctx.fill();
      ctx.stroke();
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.fillText('🔥 RUSH +25%!', rushX + rushW * 0.5, timerY + 22);
    }

    // Order Tickets Rail at y = 50px (with custom vector ingredient icons!)
    const maxCardW = Math.min(182, Math.floor((w - 28) / Math.max(1, snap.orders.length)) - 8);
    const cardW = Math.max(122, maxCardW);
    const cardH = 70;
    const startX = 12;
    const startY = 50;

    snap.orders.forEach((order, idx) => {
      const rec = RECIPES[order.recipe];
      const slideIn = Math.min(1, order.age * 4.5);
      const slideOffset = (1 - slideIn) * -18;
      const cx = startX + idx * (cardW + 8);
      const cy = startY + slideOffset;
      const pct = Math.max(0, Math.min(1, order.timeLeft / order.maxTime));
      const low = pct < 0.28;

      ctx.save();
      ctx.globalAlpha = Math.max(0.2, slideIn);

      ctx.fillStyle = low && Math.floor(this.animTime * 6) % 2 === 0 ? '#fef2f2' : '#fffbeb';
      ctx.strokeStyle = idx === 0 ? '#facc15' : low ? '#ef4444' : '#d97706';
      ctx.lineWidth = idx === 0 ? 3 : 2;
      this.roundRect(ctx, cx, cy, cardW, cardH, 10);
      ctx.fill();
      ctx.stroke();

      // Header bar with recipe color accent
      ctx.fillStyle = idx === 0 ? '#fef08a' : '#fde68a';
      this.roundRect(ctx, cx + 2, cy + 2, cardW - 4, 22, 8);
      ctx.fill();

      // Recipe name (clipped cleanly to card width)
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx + 6, cy + 2, cardW - (idx === 0 ? 52 : 12), 22);
      ctx.clip();
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#78350f';
      const titleText = cardW < 146 ? `${rec.emoji} ${rec.shortName}` : `${rec.emoji} ${rec.name}`;
      ctx.fillText(titleText, cx + 7, cy + 17);
      ctx.restore();

      // First order combo badge
      if (idx === 0) {
        ctx.fillStyle = '#ea580c';
        this.roundRect(ctx, cx + cardW - 44, cy + 4, 39, 16, 6);
        ctx.fill();
        ctx.font = '900 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('★1º', cx + cardW - 24.5, cy + 15);
      }

      // Visual mini ingredient icons row
      const ings = rec.displayIngredients;
      const iconSz = 22;
      let ix = cx + 18;
      const iy = cy + 39;
      ings.forEach((ing, i) => {
        this.drawIngredientIcon(ctx, ing, ix, iy, iconSz);
        if (i < ings.length - 1) {
          ctx.font = '900 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#92400e';
          ctx.fillText('+', ix + 13, iy + 4);
        }
        ix += 26;
      });

      // Appliance badge on right side of icon row
      if (rec.applianceTag) {
        ctx.font = '14px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`→${rec.applianceTag}`, cx + cardW - 7, iy + 5);
      }

      // Patience Bar
      const barW = cardW - 14;
      ctx.fillStyle = '#d6d3d1';
      this.roundRect(ctx, cx + 7, cy + 56, barW, 8, 4);
      ctx.fill();
      ctx.fillStyle = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#eab308' : '#ef4444';
      this.roundRect(ctx, cx + 7, cy + 56, barW * pct, 8, 4);
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  }

  private drawCountdownOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    countdown: number,
    kitchenName: string,
  ): void {
    const num = Math.max(1, Math.ceil(countdown / 0.6));
    const frac = (countdown % 0.6) / 0.6;
    const scale = 0.85 + (1 - frac) * 0.4;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 10, 6, 0.42)';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w * 0.5, h * 0.5);
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fed7aa';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(kitchenName, 0, -64);
    ctx.fillText(kitchenName, 0, -64);

    ctx.scale(scale, scale);
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#78350f';
    ctx.strokeText(String(num), 0, 26);
    ctx.fillStyle = '#fde047';
    ctx.fillText(String(num), 0, 26);
    ctx.restore();
  }

  private drawBottomStrip(ctx: CanvasRenderingContext2D, w: number, h: number, snap: SimSnapshot): void {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(0, h - 26, w, 26);
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde68a';
    const modeHint =
      snap.mode === 'solo'
        ? 'SOLO: [Tab] Trocar Chef • [Espaço/E] Pegar/Entregar • [F/J] Picar/Lavar/Apagar • [Q/K] Arremessar • [Shift] Dash • [M] Música • [Esc/P] Pausar'
        : snap.mode === 'local2p'
          ? 'LOCAL 2P: P1 WASD+E/F/Q/Shift • P2 Setas+Enter(,)/.(M)//(N)/R-Shift • [1-4] Gritar • [M] Música • [Esc/P] Pausar'
          : 'ONLINE CO-OP: [WASD/Setas] Mover • [Espaço/E] Pegar/Entregar • [F/J] Picar/Lavar/Apagar • [Q/K] Arremessar • [Shift] Dash • [M] Música';
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
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
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
