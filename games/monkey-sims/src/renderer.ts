import { FURNITURE_CATALOG } from './catalog';
import {
  GRID_H,
  GRID_W,
  ROOM_ZONES,
  TILE_SIZE,
  canPlaceFurniture,
  getFurnitureSize,
  getTileFloor,
  hasHWall,
  hasVWall,
  isWalkableFloor,
} from './house';
import type { GameSimulation } from './simulation';
import type { FurnitureKind, MonkeySim, PlacedFurniture } from './types';
import { FIGURE_HEIGHT_UNITS, HANDS, drawMonkey, makeFace, type Face, type HandPos, type Mood } from './monkeyart';
import { accessoryHidesTuft, buildAccessory, styleForAppearance } from './monkeylook';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface BuildPreviewState {
  active: boolean;
  selectedKind: FurnitureKind | null;
  movingId: string | null;
  rotation: 0 | 1 | 2 | 3;
  hoverGx: number;
  hoverGy: number;
}

export interface HoverTarget {
  type: 'furniture' | 'monkey' | 'fire' | 'puddle' | 'floor' | 'none';
  id?: string;
  gx: number;
  gy: number;
}

export class HouseRenderer {
  private time = 0;

  public screenToWorld(
    sx: number,
    sy: number,
    canvasW: number,
    canvasH: number,
    cam: CameraState,
  ): { wx: number; wy: number } {
    const wx = (sx - canvasW / 2) / cam.zoom + cam.x;
    const wy = (sy - canvasH / 2) / cam.zoom + cam.y;
    return { wx, wy };
  }

  public worldToScreen(
    wx: number,
    wy: number,
    canvasW: number,
    canvasH: number,
    cam: CameraState,
  ): { sx: number; sy: number } {
    const sx = (wx - cam.x) * cam.zoom + canvasW / 2;
    const sy = (wy - cam.y) * cam.zoom + canvasH / 2;
    return { sx, sy };
  }

  public hitTest(
    wx: number,
    wy: number,
    sim: GameSimulation,
  ): HoverTarget {
    const gx = Math.floor(wx / TILE_SIZE);
    const gy = Math.floor(wy / TILE_SIZE);

    // 1. Check fires first (urgent!)
    for (const f of sim.fires) {
      const fx = (f.gx + 0.5) * TILE_SIZE;
      const fy = (f.gy + 0.5) * TILE_SIZE;
      if (Math.hypot(wx - fx, wy - fy) < TILE_SIZE * 0.65) {
        return { type: 'fire', id: f.id, gx: f.gx, gy: f.gy };
      }
    }

    // 2. Check monkeys
    for (let i = sim.monkeys.length - 1; i >= 0; i--) {
      const m = sim.monkeys[i];
      if (m.pose === 'working_away') continue;
      if (Math.hypot(wx - m.x, wy - (m.y - 8)) < 26) {
        return {
          type: 'monkey',
          id: m.id,
          gx: Math.floor(m.x / TILE_SIZE),
          gy: Math.floor(m.y / TILE_SIZE),
        };
      }
    }

    // 3. Check furniture
    for (const item of sim.furniture) {
      const { w, h } = getFurnitureSize(item.kind, item.rotation);
      const x1 = item.gx * TILE_SIZE;
      const y1 = item.gy * TILE_SIZE;
      const x2 = (item.gx + w) * TILE_SIZE;
      const y2 = (item.gy + h) * TILE_SIZE;
      if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
        return { type: 'furniture', id: item.id, gx, gy };
      }
    }

    // 4. Check puddles
    for (const p of sim.puddles) {
      const px = (p.gx + 0.5) * TILE_SIZE;
      const py = (p.gy + 0.5) * TILE_SIZE;
      if (Math.hypot(wx - px, wy - py) < TILE_SIZE * 0.55) {
        return { type: 'puddle', id: p.id, gx: p.gx, gy: p.gy };
      }
    }

    if (isWalkableFloor(gx, gy)) {
      return { type: 'floor', gx, gy };
    }
    return { type: 'none', gx, gy };
  }

  public render(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    sim: GameSimulation,
    cam: CameraState,
    hover: HoverTarget,
    build: BuildPreviewState,
    dt: number,
  ): void {
    this.time += dt;
    this.frameDt = Math.min(0.05, Math.max(0.001, dt));

    ctx.clearRect(0, 0, canvasW, canvasH);

    // Jungle Canopy Backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
    bgGrad.addColorStop(0, '#0a291c');
    bgGrad.addColorStop(0.5, '#113c29');
    bgGrad.addColorStop(1, '#071d14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    this.drawTreeTrunkAndCanopy(ctx);
    this.drawHouseFloor(ctx, build.active);
    this.drawLivingRoomRugs(ctx);
    this.drawPuddles(ctx, sim, hover);
    this.drawWalkIndicator(ctx, sim);
    this.drawFurnitureAll(ctx, sim, hover, build);
    this.drawWalls(ctx);
    this.drawRoomLabels(ctx);
    this.drawMonkeys(ctx, sim, hover);
    this.drawFires(ctx, sim, hover);
    this.drawParticlesAndTexts(ctx, sim);

    if (build.active) {
      this.drawBuildGhost(ctx, sim, build);
    }

    ctx.restore();

    // Day/Night Atmosphere Overlay (drawn in screen space or world-aligned)
    this.drawDayNightLighting(ctx, canvasW, canvasH, sim, cam);
  }

  private drawTreeTrunkAndCanopy(ctx: CanvasRenderingContext2D): void {
    const houseW = GRID_W * TILE_SIZE;
    const houseH = GRID_H * TILE_SIZE;

    // Thick branches radiating under the treehouse
    ctx.strokeStyle = '#451a03';
    ctx.lineCap = 'round';
    ctx.lineWidth = 38;
    ctx.beginPath();
    ctx.moveTo(houseW * 0.5, houseH * 0.5);
    ctx.lineTo(-80, -40);
    ctx.moveTo(houseW * 0.5, houseH * 0.5);
    ctx.lineTo(houseW + 90, 90);
    ctx.moveTo(houseW * 0.5, houseH * 0.5);
    ctx.lineTo(houseW * 0.25, houseH + 110);
    ctx.moveTo(houseW * 0.5, houseH * 0.5);
    ctx.lineTo(houseW * 0.85, houseH + 95);
    ctx.stroke();

    // Swaying foliage clusters around perimeter
    const clusters = [
      { x: -30, y: 80, r: 95, c: '#14532d' },
      { x: 180, y: -35, r: 85, c: '#166534' },
      { x: 540, y: -45, r: 100, c: '#15803d' },
      { x: 880, y: -25, r: 95, c: '#14532d' },
      { x: houseW + 40, y: 240, r: 105, c: '#166534' },
      { x: houseW + 20, y: 560, r: 95, c: '#15803d' },
      { x: 700, y: houseH + 40, r: 105, c: '#14532d' },
      { x: 260, y: houseH + 35, r: 95, c: '#166534' },
      { x: -35, y: 470, r: 90, c: '#15803d' },
    ];
    for (let i = 0; i < clusters.length; i++) {
      const cl = clusters[i];
      const swayX = Math.sin(this.time * 1.1 + i) * 6;
      const swayY = Math.cos(this.time * 0.9 + i * 1.3) * 4;
      ctx.fillStyle = cl.c;
      ctx.beginPath();
      ctx.arc(cl.x + swayX, cl.y + swayY, cl.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Platform drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(TILE_SIZE + 12, TILE_SIZE + 16, 15 * TILE_SIZE, 10 * TILE_SIZE);
  }

  private drawHouseFloor(ctx: CanvasRenderingContext2D, showGrid: boolean): void {
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const floor = getTileFloor(gx, gy);
        if (floor === 'grass') continue;

        const x = gx * TILE_SIZE;
        const y = gy * TILE_SIZE;

        switch (floor) {
          case 'kitchen': {
            const alt = (gx + gy) % 2 === 0;
            ctx.fillStyle = alt ? '#fef3c7' : '#fde68a';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            break;
          }
          case 'bathroom': {
            const alt = (gx + gy) % 2 === 0;
            ctx.fillStyle = alt ? '#cffafe' : '#a5f3fc';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            break;
          }
          case 'living': {
            ctx.fillStyle = (gx + gy) % 2 === 0 ? '#d97706' : '#c76a05';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = 'rgba(120, 53, 15, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + TILE_SIZE * 0.5);
            ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE * 0.5);
            ctx.stroke();
            break;
          }
          case 'bedroom': {
            ctx.fillStyle = (gx + gy) % 2 === 0 ? '#b45309' : '#a14807';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            break;
          }
          case 'balcony': {
            ctx.fillStyle = '#92400e';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#451a03';
            ctx.lineWidth = 1.5;
            for (let p = 1; p < 4; p++) {
              ctx.beginPath();
              ctx.moveTo(x, y + (TILE_SIZE / 4) * p);
              ctx.lineTo(x + TILE_SIZE, y + (TILE_SIZE / 4) * p);
              ctx.stroke();
            }
            break;
          }
        }

        if (showGrid) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private drawLivingRoomRugs(ctx: CanvasRenderingContext2D): void {
    // Cozy Living Room Rug
    const rx = 9.2 * TILE_SIZE;
    const ry = 2.2 * TILE_SIZE;
    const rw = 3.6 * TILE_SIZE;
    const rh = 2.3 * TILE_SIZE;
    ctx.fillStyle = '#dc2626';
    roundRect(ctx, rx, ry, rw, rh, 12);
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    roundRect(ctx, rx + 6, ry + 6, rw - 12, rh - 12, 8);
    ctx.stroke();

    // Bedroom soft rug
    const bx = 7.3 * TILE_SIZE;
    const by = 7.1 * TILE_SIZE;
    ctx.fillStyle = '#0d9488';
    roundRect(ctx, bx, by, 3.4 * TILE_SIZE, 1.4 * TILE_SIZE, 10);
    ctx.fill();
    ctx.strokeStyle = '#99f6e4';
    ctx.lineWidth = 2.5;
    roundRect(ctx, bx + 5, by + 5, 3.4 * TILE_SIZE - 10, 1.4 * TILE_SIZE - 10, 7);
    ctx.stroke();
  }

  private drawWalls(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = 'round';
    // Horizontal walls
    for (let gy = 0; gy <= GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (!hasHWall(gx, gy)) continue;
        const x1 = gx * TILE_SIZE;
        const y1 = gy * TILE_SIZE;
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + TILE_SIZE, y1);
        ctx.stroke();

        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + TILE_SIZE, y1);
        ctx.stroke();

        // Windows on top exterior wall
        if (gy === 1 && (gx === 2 || gx === 8 || gx === 12)) {
          ctx.strokeStyle = '#bae6fd';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x1 + 10, y1);
          ctx.lineTo(x1 + TILE_SIZE - 10, y1);
          ctx.stroke();
        }
      }
    }

    // Vertical walls
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx <= GRID_W; gx++) {
        if (!hasVWall(gx, gy)) continue;
        const x1 = gx * TILE_SIZE;
        const y1 = gy * TILE_SIZE;
        const isBalconyRail = gx === 17 || gx === 16;

        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = isBalconyRail ? 7 : 10;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1, y1 + TILE_SIZE);
        ctx.stroke();

        ctx.strokeStyle = isBalconyRail ? '#b45309' : '#92400e';
        ctx.lineWidth = isBalconyRail ? 3.5 : 5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1, y1 + TILE_SIZE);
        ctx.stroke();
      }
    }
  }

  private drawRoomLabels(ctx: CanvasRenderingContext2D): void {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (const r of ROOM_ZONES) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
      ctx.fillText(r.name.toUpperCase(), r.x1 * TILE_SIZE + 8, r.y1 * TILE_SIZE + 16);
    }
  }

  private drawPuddles(ctx: CanvasRenderingContext2D, sim: GameSimulation, hover: HoverTarget): void {
    for (const p of sim.puddles) {
      const cx = (p.gx + 0.5) * TILE_SIZE;
      const cy = (p.gy + 0.5) * TILE_SIZE;
      const isHovered = hover.type === 'puddle' && hover.id === p.id;
      ctx.save();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
      ctx.strokeStyle = isHovered ? '#ffffff' : '#ca8a04';
      ctx.lineWidth = isHovered ? 3 : 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 20, 13, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawWalkIndicator(ctx: CanvasRenderingContext2D, sim: GameSimulation): void {
    const active = sim.getActiveMonkey();
    if (!active || active.queue.length === 0) return;
    const cur = active.queue[0];
    if (cur.targetType === 'walk' && !cur.started) {
      const cx = (cur.targetGx + 0.5) * TILE_SIZE;
      const cy = (cur.targetGy + 0.5) * TILE_SIZE;
      const pulse = 10 + Math.sin(this.time * 7) * 3;
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawFurnitureAll(
    ctx: CanvasRenderingContext2D,
    sim: GameSimulation,
    hover: HoverTarget,
    build: BuildPreviewState,
  ): void {
    const sorted = [...sim.furniture].sort((a, b) => a.gy - b.gy);
    for (const item of sorted) {
      if (build.active && build.movingId === item.id) continue;
      const isHovered = hover.type === 'furniture' && hover.id === item.id;
      this.drawFurnitureItem(ctx, item, sim.jblPlaying, isHovered, false);
    }
  }

  private drawFurnitureItem(
    ctx: CanvasRenderingContext2D,
    item: PlacedFurniture,
    jblPlaying: boolean,
    isHovered: boolean,
    isGhost: boolean,
  ): void {
    const def = FURNITURE_CATALOG[item.kind];
    const { w, h } = getFurnitureSize(item.kind, item.rotation);
    const fx = item.gx * TILE_SIZE;
    const fy = item.gy * TILE_SIZE;
    const fpxW = w * TILE_SIZE;
    const fpxH = h * TILE_SIZE;

    ctx.save();
    if (isGhost) ctx.globalAlpha = 0.72;

    if (isHovered) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      roundRect(ctx, fx + 2, fy + 2, fpxW - 4, fpxH - 4, 10);
      ctx.stroke();
    }

    // Shadow in actual footprint
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    roundRect(ctx, fx + 6, fy + 8, fpxW - 10, fpxH - 10, 8);
    ctx.fill();

    // Transform into unrotated local space centered at footprint center
    const fcx = fx + fpxW / 2;
    const fcy = fy + fpxH / 2;
    ctx.translate(fcx, fcy);
    ctx.rotate((item.rotation * Math.PI) / 2);
    const pxW = def.widthTiles * TILE_SIZE;
    const pxH = def.heightTiles * TILE_SIZE;
    const x = -pxW / 2;
    const y = -pxH / 2;
    const cx = 0;
    const cy = 0;
    const pad = 5;

    switch (item.kind) {
      case 'fridge':
      case 'fridge_pro': {
        const isPro = item.kind === 'fridge_pro';
        ctx.fillStyle = isPro ? '#0284c7' : '#e2e8f0';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 7, y + 5, pxW - 14, pxH - 10, 7);
        ctx.fill();
        ctx.stroke();
        // Door line & handle
        ctx.fillStyle = isPro ? '#38bdf8' : '#cbd5e1';
        ctx.fillRect(x + 11, y + 9, pxW - 22, 12);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(cx - 4, y + 27, 8, 8); // banana magnet
        break;
      }

      case 'stove':
      case 'stove_industrial': {
        const isPro = item.kind === 'stove_industrial';
        ctx.fillStyle = isPro ? '#94a3b8' : '#475569';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 6, y + 6, pxW - 12, pxH - 12, 6);
        ctx.fill();
        ctx.stroke();
        // Burners
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(x + 19, y + 20, 6, 0, Math.PI * 2);
        ctx.arc(x + pxW - 19, y + 20, 6, 0, Math.PI * 2);
        ctx.arc(x + 19, y + pxH - 20, 5, 0, Math.PI * 2);
        ctx.arc(x + pxW - 19, y + pxH - 20, 5, 0, Math.PI * 2);
        ctx.fill();
        if (isPro) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x + 19, y + 20, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }

      case 'hammock': {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x + 4, y + 14, 7, pxH - 28);
        ctx.fillRect(x + pxW - 11, y + 14, 7, pxH - 28);
        ctx.fillStyle = '#fb923c';
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 2;
        roundRect(ctx, x + 10, y + 10, pxW - 20, pxH - 20, 14);
        ctx.fill();
        ctx.stroke();
        // Stripes
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 24, y + 13);
        ctx.lineTo(x + 24, y + pxH - 13);
        ctx.moveTo(cx, y + 13);
        ctx.lineTo(cx, y + pxH - 13);
        ctx.moveTo(x + pxW - 24, y + 13);
        ctx.lineTo(x + pxW - 24, y + pxH - 13);
        ctx.stroke();
        break;
      }

      case 'bed_gorilla': {
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 5, y + 6, pxW - 10, pxH - 12, 8);
        ctx.fill();
        ctx.stroke();
        // Blanket
        ctx.fillStyle = '#7c3aed';
        roundRect(ctx, x + 28, y + 9, pxW - 36, pxH - 18, 6);
        ctx.fill();
        // Pillow
        ctx.fillStyle = '#fef9c3';
        roundRect(ctx, x + 9, y + 12, 16, pxH - 24, 5);
        ctx.fill();
        break;
      }

      case 'shower_waterfall': {
        ctx.fillStyle = '#0891b2';
        ctx.strokeStyle = '#164e63';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 6, y + 6, pxW - 12, pxH - 12, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#67e8f9';
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(cx, cy - 6, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'acai_tub': {
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#4c1d95';
        ctx.lineWidth = 3;
        roundRect(ctx, x + 6, y + 6, pxW - 12, pxH - 12, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#7e22ce';
        roundRect(ctx, x + 12, y + 12, pxW - 24, pxH - 24, 14);
        ctx.fill();
        // Foam bubbles
        ctx.fillStyle = '#f3e8ff';
        ctx.beginPath();
        ctx.arc(cx - 16, cy - 4, 6, 0, Math.PI * 2);
        ctx.arc(cx + 12, cy + 5, 5, 0, Math.PI * 2);
        ctx.arc(cx, cy - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'toilet':
      case 'toilet_gold': {
        const isGold = item.kind === 'toilet_gold';
        ctx.fillStyle = isGold ? '#fbbf24' : '#f8fafc';
        ctx.strokeStyle = isGold ? '#78350f' : '#475569';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 12, y + 7, pxW - 24, 14, 4);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy + 8, 13, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isGold ? '#fef08a' : '#bae6fd';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 9, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'sofa_palm':
      case 'sofa_vip': {
        const isVip = item.kind === 'sofa_vip';
        ctx.fillStyle = isVip ? '#6d28d9' : '#15803d';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 5, y + 7, pxW - 10, pxH - 14, 10);
        ctx.fill();
        ctx.stroke();
        // Backrest & cushions
        ctx.fillStyle = isVip ? '#8b5cf6' : '#22c55e';
        roundRect(ctx, x + 10, y + 18, pxW - 20, pxH - 28, 7);
        ctx.fill();
        break;
      }

      case 'tv_tube': {
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 8, y + 8, pxW - 16, pxH - 16, 7);
        ctx.fill();
        ctx.stroke();
        // Glowing screen
        ctx.fillStyle = '#38bdf8';
        roundRect(ctx, x + 13, y + 14, pxW - 26, pxH - 26, 4);
        ctx.fill();
        // Antennas
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, y + 8);
        ctx.lineTo(cx - 10, y + 2);
        ctx.moveTo(cx, y + 8);
        ctx.lineTo(cx + 10, y + 2);
        ctx.stroke();
        break;
      }

      case 'pc_basic':
      case 'pc_rgb': {
        const isRgb = item.kind === 'pc_rgb';
        // Desk
        ctx.fillStyle = isRgb ? '#1e1b4b' : '#78350f';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        roundRect(ctx, x + 5, y + 7, pxW - 10, pxH - 14, 6);
        ctx.fill();
        ctx.stroke();
        // Monitor
        const rgbHue = (this.time * 140) % 360;
        ctx.fillStyle = isRgb ? `hsl(${rgbHue}, 90%, 60%)` : '#60a5fa';
        roundRect(ctx, x + 13, y + 11, pxW - 26, 15, 3);
        ctx.fill();
        // Keyboard
        ctx.fillStyle = isRgb ? `hsl(${(rgbHue + 120) % 360}, 90%, 60%)` : '#cbd5e1';
        ctx.fillRect(x + 15, y + 32, pxW - 30, 8);
        break;
      }

      case 'jbl_speaker': {
        const pulse = jblPlaying ? Math.sin(this.time * 16) * 2.5 : 0;
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 10 - pulse * 0.4, y + 7 - pulse * 0.4, pxW - 20 + pulse * 0.8, pxH - 14 + pulse * 0.8, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy - 6, 9 + pulse * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(cx, cy + 10, 5 + pulse * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'trampoline': {
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(pxW, pxH) * 0.44, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(pxW, pxH) * 0.33, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(pxW, pxH) * 0.16, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'guitar_stand': {
        ctx.fillStyle = '#b45309';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 6, 12, 14, 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(cx - 2, y + 6, 5, 22);
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(cx, cy + 5, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'plant_pot': {
        ctx.fillStyle = '#c2410c';
        ctx.beginPath();
        ctx.arc(cx, cy + 6, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#16a34a';
        for (let a = 0; a < 5; a++) {
          const ang = (a / 5) * Math.PI * 2 + Math.sin(this.time + a) * 0.08;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 10, 9, 4.5, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'floor_lamp': {
        ctx.fillStyle = '#fef08a';
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'golden_statue': {
        ctx.fillStyle = '#78350f';
        roundRect(ctx, x + 10, y + 34, pxW - 20, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Shiny bald glint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 5, cy - 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      default: {
        ctx.fillStyle = def.color;
        roundRect(ctx, x + pad, y + pad, pxW - pad * 2, pxH - pad * 2, 8);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawMonkeys(ctx: CanvasRenderingContext2D, sim: GameSimulation, hover: HoverTarget): void {
    const sorted = [...sim.monkeys].sort((a, b) => a.y - b.y);
    for (const m of sorted) {
      if (m.pose === 'working_away') continue;
      const isSelected = m.id === sim.activeMonkeyId;
      const isHovered = hover.type === 'monkey' && hover.id === m.id;
      this.drawSingleMonkey(ctx, m, isSelected, isHovered);
    }
  }

  private monkeyAnim = new Map<
    string,
    { stretch: number; vel: number; pose: string; ear: number; earVel: number }
  >();
  private frameDt = 0.016;

  private drawSingleMonkey(
    ctx: CanvasRenderingContext2D,
    m: MonkeySim,
    isSelected: boolean,
    isHovered: boolean,
  ): void {
    const t = this.time;
    const dt = this.frameDt;
    const pose = m.pose;
    const seed = (m.animPhase * 1.7) % 6;

    // ── estado de animação secundária (mola de squash/stretch + orelhas) ──
    let a = this.monkeyAnim.get(m.id);
    if (!a) {
      a = { stretch: 0, vel: 0, pose, ear: 0, earVel: 0 };
      this.monkeyAnim.set(m.id, a);
    }
    if (a.pose !== pose) {
      a.vel += pose === 'idle' ? 2.6 : -4.2; // impulso ao trocar de ação
      a.pose = pose;
    }
    a.vel += (-170 * a.stretch - 13 * a.vel) * dt;
    a.stretch += a.vel * dt;
    a.stretch = Math.max(-0.22, Math.min(0.22, a.stretch));
    const moving = pose === 'walking' || pose === 'dancing';
    const earTarget = moving ? Math.sin(m.animPhase * 2 - 0.7) * 0.7 : Math.sin(t * 1.3 + seed) * 0.12;
    a.earVel += ((earTarget - a.ear) * 110 - a.earVel * 8) * dt;
    a.ear += a.earVel * dt;

    const walking = pose === 'walking';
    const stepImpact = walking ? -0.05 * Math.pow(1 - Math.abs(Math.sin(m.animPhase)), 6) : 0;
    const danceSquash = pose === 'dancing' ? Math.sin(m.animPhase * 2) * 0.05 : 0;
    const stretch = a.stretch + stepImpact + danceSquash;
    const breathe = Math.sin(t * 2.1 + seed);

    // ── apresentação por pose ──
    const needs = m.needs;
    const minNeed = Math.min(needs.hunger, needs.energy, needs.hygiene, needs.bladder, needs.fun, needs.social);
    let mood: Mood = 'neutral';
    if (minNeed < 24) mood = 'angry';
    else if (minNeed < 45) mood = 'sad';
    else if (needs.fun > 55) mood = 'happy';

    let armL: HandPos | undefined;
    let armR: HandPos | undefined;
    const ph = m.animPhase;
    let lean = 0;
    let headTilt = Math.sin(t * 0.8 + seed) * 0.03;
    const over: Partial<Face> = {};
    switch (pose) {
      case 'sleeping':
      case 'passed_out':
        mood = pose === 'passed_out' ? 'dizzy' : 'sleeping';
        headTilt = 0.18;
        break;
      case 'eating':
        mood = 'eating';
        armL = HANDS.mouth(-1, t * 13);
        armR = HANDS.mouth(1, t * 13 + 1.5);
        break;
      case 'cooking':
        mood = 'focus';
        armL = HANDS.forward(-1, t * 9);
        armR = HANDS.forward(1, t * 9);
        break;
      case 'showering':
        mood = 'cheer';
        armL = { x: -0.62 + Math.sin(t * 10) * 0.2, y: -3.0 };
        armR = { x: 0.62 - Math.sin(t * 10) * 0.2, y: -3.0 };
        break;
      case 'toilet':
        mood = 'embarrassed';
        armL = HANDS.hip(-1);
        armR = HANDS.hip(1);
        break;
      case 'gaming':
        mood = 'focus';
        armL = HANDS.forward(-1, t * 17);
        armR = HANDS.forward(1, t * 15);
        over.lookY = -0.2;
        lean = 0.06;
        break;
      case 'dancing':
        mood = 'cheer';
        armL = HANDS.cheer(-1, ph * 2);
        armR = HANDS.cheer(1, ph * 2);
        lean = Math.sin(ph) * 0.14;
        headTilt = Math.sin(ph) * 0.2;
        break;
      case 'talking':
        mood = 'happy';
        over.mouthOpen = 0.15 + Math.abs(Math.sin(t * 9 + seed)) * 0.5;
        armR = { x: 1.3 + Math.sin(t * 6) * 0.2, y: -1.9 + Math.cos(t * 6) * 0.25 };
        break;
      case 'panicking':
        mood = 'scared';
        armL = HANDS.up(-1, t * 25);
        armR = HANDS.up(1, t * 25 + 2);
        lean = Math.sin(t * 22) * 0.06;
        break;
      default:
        break;
    }
    if (m.embarrassedTimer > 0 && pose !== 'toilet' && pose !== 'panicking') mood = 'embarrassed';

    // olhar acompanha a direção do movimento; parado, passeia o olhar
    const cf = Math.cos(m.facing);
    const sf = Math.sin(m.facing);
    const idleGlance = !walking && pose === 'idle' ? Math.sin(t * 0.7 + seed * 2) * 0.55 : 0;
    const lookX = walking ? cf : cf * 0.5 + idleGlance;
    const lookY = walking ? sf * 0.5 : 0.1;
    const turn = walking ? cf * 0.9 : cf * 0.35 + idleGlance * 0.4;
    const face = makeFace(mood, t, seed, { x: lookX, y: lookY }, over);

    const FEET = 14;
    const H = 48;
    const lying = pose === 'passed_out';

    ctx.save();

    // Anel de seleção
    if (isSelected || isHovered) {
      ctx.strokeStyle = isSelected ? '#4ade80' : '#facc15';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + FEET - 2, 24, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (isSelected) {
        ctx.strokeStyle = 'rgba(74,222,128,0.28)';
        ctx.lineWidth = 7;
        ctx.stroke();
      }
    }

    // Sombra suave (encolhe quando o macaco pula)
    const lift = walking || pose === 'dancing' ? Math.abs(Math.sin(m.animPhase)) : 0;
    const shW = (lying ? 24 : 15) * (1 - lift * 0.14);
    const sg = ctx.createRadialGradient(m.x, m.y + FEET - 2, 1, m.x, m.y + FEET - 2, shW);
    sg.addColorStop(0, 'rgba(0,0,0,0.42)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + FEET - 2, shW, shW * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // posiciona nos pés
    ctx.translate(m.x, m.y + FEET);
    if (lying) {
      ctx.translate(0, -18);
      ctx.rotate(Math.PI / 2);
      ctx.translate(0, 18);
    }

    const appearance = m.appearance;
    drawMonkey(ctx, {
      style: styleForAppearance(appearance.furColor, appearance.bellyColor),
      face,
      height: H,
      turn,
      squashX: 1 - stretch * 0.7,
      squashY: 1 + stretch,
      breathe: pose === 'sleeping' ? Math.sin(t * 1.4) : breathe,
      walk: m.animPhase,
      walkAmp: walking ? 1 : pose === 'dancing' ? 0.7 : 0,
      tailPhase: t * (moving ? 5 : 2.4) + seed,
      tailAmp: pose === 'dancing' ? 0.9 : walking ? 0.55 : 0.3,
      tailSide: cf >= 0 ? -1 : 1,
      earFlop: a.ear,
      headTilt,
      lean,
      armL,
      armR,
      tuft: !accessoryHidesTuft(appearance.accessory),
      accessory: buildAccessory(appearance.accessory, turn, t),
      outlinePx: 2.1,
    });

    // banana na mão (comendo)
    if (pose === 'eating') {
      const u = H / FIGURE_HEIGHT_UNITS;
      ctx.save();
      ctx.scale(u, u);
      ctx.translate(0, -1.86 + Math.sin(t * 13) * 0.03);
      ctx.rotate(-0.25);
      ctx.beginPath();
      ctx.moveTo(-0.5, -0.12);
      ctx.quadraticCurveTo(0, 0.42, 0.52, -0.2);
      ctx.quadraticCurveTo(0.04, 0.12, -0.5, -0.12);
      ctx.closePath();
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 0.07;
      ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(0.52, -0.2, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // Zzz
    if (pose === 'sleeping' || pose === 'passed_out') {
      ctx.save();
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.95;
        ctx.fillStyle = '#e0f2fe';
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 2.5;
        const zx = m.x + 16 + k * 14 + i * 3;
        const zy = m.y - 22 - k * 26;
        ctx.font = `900 ${9 + k * 8}px system-ui, sans-serif`;
        ctx.strokeText('Z', zx, zy);
        ctx.fillText('Z', zx, zy);
      }
      ctx.restore();
    }

    // Nuvem de fedor
    if (m.stinkTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(132,204,22,0.8)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const sx = m.x - 14 + i * 14;
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) {
          const yy = m.y + 2 - k * 3.2;
          const xx = sx + Math.sin(t * 5 + k * 0.9 + i) * 3;
          if (k === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Bolhas de sabão no banho
    if (pose === 'showering') {
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.8 + i * 0.17) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
        ctx.fillStyle = 'rgba(224,242,254,0.9)';
        ctx.strokeStyle = 'rgba(14,116,144,0.8)';
        ctx.lineWidth = 1;
        const bx = m.x + Math.sin(i * 2.3) * 18;
        const by = m.y + 8 - k * 40;
        ctx.beginPath();
        ctx.arc(bx, by, 2.5 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Floating Banana Plumbob above head
    this.drawPlumbob(ctx, m, isSelected);

    // Nameplate
    ctx.save();
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const nameW = ctx.measureText(m.name).width + 12;
    ctx.fillStyle = isSelected ? 'rgba(20, 83, 45, 0.88)' : 'rgba(15, 23, 42, 0.78)';
    roundRect(ctx, m.x - nameW / 2, m.y + 20, nameW, 17, 8);
    ctx.fill();
    ctx.fillStyle = isSelected ? '#bef264' : '#f8fafc';
    ctx.fillText(m.name, m.x, m.y + 32);
    ctx.restore();

    // Action progress ring
    const cur = m.queue[0];
    if (cur && cur.started && cur.durationSec > 0.2) {
      const pct = Math.min(1, cur.elapsedSec / cur.durationSec);
      ctx.save();
      ctx.strokeStyle = 'rgba(15,23,42,0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(m.x + 22, m.y - 28, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x + 22, m.y - 28, 9, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Speech bubble OR Thought bubble
    if (m.speechTimer > 0 && m.speechText) {
      this.drawSpeechBubble(ctx, m.x, m.y - 72, m.speechText);
    } else if (m.thoughtTimer > 0 && m.thoughtIcon) {
      this.drawThoughtBubble(ctx, m.x + 24, m.y - 54, m.thoughtIcon);
    }
  }

  private drawPlumbob(ctx: CanvasRenderingContext2D, m: MonkeySim, isSelected: boolean): void {
    const minNeed = Math.min(
      m.needs.hunger,
      m.needs.energy,
      m.needs.hygiene,
      m.needs.bladder,
      m.needs.fun,
      m.needs.social,
    );
    const avgNeed =
      (m.needs.hunger +
        m.needs.energy +
        m.needs.hygiene +
        m.needs.bladder +
        m.needs.fun +
        m.needs.social) /
      6;

    let mainColor = '#22c55e';
    let lightColor = '#bef264';
    if (minNeed < 26 || avgNeed < 35) {
      mainColor = '#ef4444';
      lightColor = '#fca5a5';
    } else if (minNeed < 52 || avgNeed < 60) {
      mainColor = '#eab308';
      lightColor = '#fef08a';
    }

    const bobY = Math.sin(this.time * 3.5 + m.animPhase) * 3;
    const px = m.x;
    const py = m.y - 54 + bobY;
    const w = (isSelected ? 10 : 7.5) * (0.65 + 0.35 * Math.abs(Math.cos(this.time * 2.5)));
    const h = isSelected ? 16 : 12;

    ctx.save();
    // Left facet
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.moveTo(px, py - h);
    ctx.lineTo(px - w, py);
    ctx.lineTo(px, py + h);
    ctx.closePath();
    ctx.fill();

    // Right facet
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.moveTo(px, py - h);
    ctx.lineTo(px + w, py);
    ctx.lineTo(px, py + h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, py - h);
    ctx.lineTo(px + w, py);
    ctx.lineTo(px, py + h);
    ctx.lineTo(px - w, py);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawThoughtBubble(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string): void {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 10, y + 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, x - 16, y - 16, 32, 26, 11);
    ctx.fill();
    ctx.stroke();
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y - 2);
    ctx.restore();
  }

  private drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    ctx.save();
    ctx.font = 'bold 12px system-ui, sans-serif';
    const w = Math.min(230, ctx.measureText(text).width + 20);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    roundRect(ctx, x - w / 2, y - 18, w, 26, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 5, w - 12);
    ctx.restore();
  }

  private drawFires(ctx: CanvasRenderingContext2D, sim: GameSimulation, hover: HoverTarget): void {
    for (const fire of sim.fires) {
      const cx = (fire.gx + 0.5) * TILE_SIZE;
      const cy = (fire.gy + 0.5) * TILE_SIZE;
      const flicker = Math.sin(this.time * 18) * 4;
      const isHovered = hover.type === 'fire' && hover.id === fire.id;

      ctx.save();
      if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy + 12);
      ctx.quadraticCurveTo(cx - 8, cy - 26 - flicker, cx, cy - 10);
      ctx.quadraticCurveTo(cx + 10, cy - 30 + flicker, cx + 18, cy + 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy + 12);
      ctx.quadraticCurveTo(cx, cy - 18 + flicker, cx + 10, cy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawParticlesAndTexts(ctx: CanvasRenderingContext2D, sim: GameSimulation): void {
    for (const p of sim.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.emoji) {
        ctx.font = '14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.emoji, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const ft of sim.floatingTexts) {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#0f172a';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  private drawBuildGhost(ctx: CanvasRenderingContext2D, sim: GameSimulation, build: BuildPreviewState): void {
    const kind = build.selectedKind;
    if (!kind) return;
    const valid = canPlaceFurniture(
      kind,
      build.hoverGx,
      build.hoverGy,
      build.rotation,
      sim.furniture,
      build.movingId ?? undefined,
    );
    const { w, h } = getFurnitureSize(kind, build.rotation);
    const x = build.hoverGx * TILE_SIZE;
    const y = build.hoverGy * TILE_SIZE;

    this.drawFurnitureItem(
      ctx,
      { id: 'ghost', kind, gx: build.hoverGx, gy: build.hoverGy, rotation: build.rotation },
      false,
      false,
      true,
    );

    ctx.save();
    ctx.strokeStyle = valid ? '#4ade80' : '#ef4444';
    ctx.fillStyle = valid ? 'rgba(74, 222, 128, 0.22)' : 'rgba(239, 68, 68, 0.25)';
    ctx.lineWidth = 3;
    roundRect(ctx, x + 2, y + 2, w * TILE_SIZE - 4, h * TILE_SIZE - 4, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawDayNightLighting(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    sim: GameSimulation,
    cam: CameraState,
  ): void {
    const hour = sim.minuteOfDay / 60;
    let darkness = 0;
    let tint = '15, 23, 42';

    if (hour >= 20 || hour < 5.5) {
      darkness = 0.42;
      tint = '10, 18, 42';
    } else if (hour >= 17.5 && hour < 20) {
      const t = (hour - 17.5) / 2.5;
      darkness = t * 0.42;
      tint = t < 0.5 ? '180, 83, 9' : '15, 23, 42';
    } else if (hour >= 5.5 && hour < 7.5) {
      const t = 1 - (hour - 5.5) / 2;
      darkness = t * 0.42;
      tint = '30, 58, 138';
    }

    if (darkness <= 0.02) return;

    ctx.save();
    ctx.fillStyle = `rgba(${tint}, ${darkness.toFixed(3)})`;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Warm light glow from lamps, TV, PC, Statue, Fires!
    ctx.globalCompositeOperation = 'lighter';
    for (const item of sim.furniture) {
      const def = FURNITURE_CATALOG[item.kind];
      if (!def.emitsLight) continue;
      const { sx, sy } = this.worldToScreen(
        (item.gx + 0.5) * TILE_SIZE,
        (item.gy + 0.5) * TILE_SIZE,
        canvasW,
        canvasH,
        cam,
      );
      const radius = (item.kind === 'floor_lamp' ? 160 : 120) * cam.zoom;
      const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, radius);
      const warmColor =
        item.kind === 'pc_rgb'
          ? 'rgba(236, 72, 153, 0.25)'
          : item.kind === 'tv_tube'
            ? 'rgba(56, 189, 248, 0.22)'
            : 'rgba(253, 224, 71, 0.26)';
      g.addColorStop(0, warmColor);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const fire of sim.fires) {
      const { sx, sy } = this.worldToScreen(
        (fire.gx + 0.5) * TILE_SIZE,
        (fire.gy + 0.5) * TILE_SIZE,
        canvasW,
        canvasH,
        cam,
      );
      const radius = 150 * cam.zoom;
      const g = ctx.createRadialGradient(sx, sy, 6, sx, sy, radius);
      g.addColorStop(0, 'rgba(249, 115, 22, 0.42)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
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
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
