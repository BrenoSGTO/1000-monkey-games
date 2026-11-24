import { getRoadMask, gridToWorld, inBounds } from './map';
import {
  GRID_SIZE,
  TILE_H,
  TILE_W,
  TOOL_MAP,
  type ActiveDisaster,
  type MapPing,
  type OverlayMode,
  type Particle,
  type RemoteCursor,
  type TileData,
  type ToolType,
  type Vehicle,
} from './types';
import type { CitySimulation } from './simulation';
import { HANDS, drawMonkey, makeFace } from './monkeyart';
import {
  capAccessory,
  djPhonesAccessory,
  drawCursorMonkey,
  drawDriverHead,
  drawMayor,
  drawPlushGorilla,
  drawStatue,
  driverStyle,
  shadesAccessory,
} from './monkeylook';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface HoverState {
  gx: number;
  gy: number;
  valid: boolean;
}

export interface RenderOptions {
  viewW: number;
  viewH: number;
  overlay: OverlayMode;
  roadPreview: Array<{ gx: number; gy: number }> | null;
  inspectedTile: { gx: number; gy: number } | null;
  pingMode: boolean;
}

export class CityRenderer {
  private ctx: CanvasRenderingContext2D;
  private time = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  render(
    sim: CitySimulation,
    cam: CameraState,
    hover: HoverState | null,
    selectedTool: ToolType,
    remoteCursors: Map<string, RemoteCursor>,
    dt: number,
    opts: RenderOptions,
  ): void {
    this.time += dt;
    const ctx = this.ctx;
    const w = opts.viewW;
    const h = opts.viewH;

    // Sky/jungle backdrop gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0c241b');
    bgGrad.addColorStop(1, '#143828');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    const shakeX = sim.screenShake > 0 ? (Math.random() - 0.5) * sim.screenShake * 2.2 : 0;
    const shakeY = sim.screenShake > 0 ? (Math.random() - 0.5) * sim.screenShake * 2.2 : 0;

    ctx.translate(w * 0.5 + cam.x + shakeX, h * 0.5 + cam.y + shakeY);
    ctx.scale(cam.zoom, cam.zoom);

    const showAutoPowerOverlay =
      opts.overlay === 'power' ||
      selectedTool === 'power' ||
      selectedTool === 'house' ||
      selectedTool === 'market' ||
      selectedTool === 'factory' ||
      selectedTool === 'park';

    const showAutoPollutionOverlay =
      opts.overlay === 'pollution' ||
      selectedTool === 'house' ||
      selectedTool === 'market' ||
      selectedTool === 'factory' ||
      selectedTool === 'dump';

    // Precompute existing power plant coverage for instant visual clarity
    const powerCovered = new Set<number>();
    if (showAutoPowerOverlay) {
      const plants: TileData[] = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const t = sim.grid[y][x];
          if (t.building === 'power' && !t.damaged) plants.push(t);
        }
      }
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          for (const p of plants) {
            if (Math.hypot(x - p.gx, y - p.gy) <= TOOL_MAP.power.radius) {
              powerCovered.add(y * GRID_SIZE + x);
              break;
            }
          }
        }
      }
    }

    // 1. Draw base terrain tiles + roads + vision overlays
    for (let sum = 0; sum <= (GRID_SIZE - 1) * 2; sum++) {
      for (let gx = 0; gx <= sum; gx++) {
        const gy = sum - gx;
        if (!inBounds(gx, gy)) continue;
        const tile = sim.grid[gy][gx];
        this.drawBaseTile(
          tile,
          sim.grid,
          opts.overlay,
          showAutoPowerOverlay && powerCovered.has(gy * GRID_SIZE + gx),
          showAutoPollutionOverlay,
        );
      }
    }

    // 2. Aura radius preview when hovering power/park/factory/dump
    if (hover && inBounds(hover.gx, hover.gy)) {
      const hoveredTile = sim.grid[hover.gy][hover.gx];
      const previewTool =
        TOOL_MAP[selectedTool].radius > 0
          ? selectedTool
          : hoveredTile.building && TOOL_MAP[hoveredTile.building].radius > 0
            ? hoveredTile.building
            : null;
      if (previewTool) {
        this.drawAuraPreview(hover.gx, hover.gy, previewTool);
      }
    }

    // 2.5 Inspected tile highlight
    if (opts.inspectedTile && inBounds(opts.inspectedTile.gx, opts.inspectedTile.gy)) {
      const { wx, wy } = gridToWorld(opts.inspectedTile.gx, opts.inspectedTile.gy);
      const pulse = 0.55 + Math.sin(this.time * 6) * 0.25;
      this.drawDiamond(wx, wy, `rgba(56, 189, 248, ${pulse * 0.35})`, '#38bdf8', 2.8);
    }

    // 3. Sort & draw buildings, trees, vehicles, and giant gorilla back-to-front
    type DepthItem =
      | { depth: number; kind: 'tile'; tile: TileData }
      | { depth: number; kind: 'vehicle'; vehicle: Vehicle }
      | { depth: number; kind: 'gorilla'; disaster: ActiveDisaster };

    const items: DepthItem[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = sim.grid[y][x];
        if (t.building && t.building !== 'road') {
          items.push({ depth: x + y + 0.05, kind: 'tile', tile: t });
        } else if (!t.building && t.terrain === 'forest') {
          items.push({ depth: x + y + 0.02, kind: 'tile', tile: t });
        }
      }
    }

    for (const v of sim.vehicles) {
      items.push({ depth: v.gx + v.gy + 0.25, kind: 'vehicle', vehicle: v });
    }

    for (const d of sim.disasters) {
      if (d.type === 'giant_gorilla') {
        items.push({ depth: d.gorillaX + d.gorillaY + 0.4, kind: 'gorilla', disaster: d });
      }
    }

    items.sort((a, b) => a.depth - b.depth);

    const garbageOverload = sim.stats.garbageLoad > sim.stats.garbageCapacity;
    for (const item of items) {
      if (item.kind === 'tile') {
        if (item.tile.building) {
          this.drawBuilding(item.tile, garbageOverload);
        } else if (item.tile.terrain === 'forest') {
          this.drawForest(item.tile);
        }
      } else if (item.kind === 'vehicle') {
        this.drawVehicle(item.vehicle);
      } else {
        this.drawGiantGorilla(item.disaster);
      }
    }

    // 4. Falling coconuts
    for (const d of sim.disasters) {
      if (d.type === 'coconut_rain') {
        for (const c of d.coconuts) {
          const { wx, wy } = gridToWorld(c.gx, c.gy);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(wx, wy, 7, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#78350f';
          ctx.strokeStyle = '#451a03';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(wx, wy - c.height, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 5. Smart L-road drag preview OR single tile hover cursor
    if (opts.roadPreview && opts.roadPreview.length > 0) {
      this.drawRoadPreview(opts.roadPreview, sim);
    } else if (hover && inBounds(hover.gx, hover.gy)) {
      this.drawLocalHover(hover.gx, hover.gy, selectedTool, sim, opts.pingMode);
    }

    // 6. Remote player cursors (Co-op)
    const now = performance.now();
    for (const rc of remoteCursors.values()) {
      if (now - rc.lastSeen > 12000) continue;
      if (!inBounds(rc.gx, rc.gy)) continue;
      this.drawRemoteCursor(rc);
    }

    // 7. Map Pings
    for (const ping of sim.pings) {
      this.drawMapPing(ping);
    }

    // 8. Particles & floating text
    this.drawParticles(sim.particles);

    ctx.restore();
  }

  private drawDiamond(wx: number, wy: number, fill: string, stroke?: string, lineWidth = 1): void {
    const ctx = this.ctx;
    const hw = TILE_W * 0.5;
    const hh = TILE_H * 0.5;
    ctx.beginPath();
    ctx.moveTo(wx, wy - hh);
    ctx.lineTo(wx + hw, wy);
    ctx.lineTo(wx, wy + hh);
    ctx.lineTo(wx - hw, wy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  private drawBaseTile(
    tile: TileData,
    grid: TileData[][],
    overlay: OverlayMode,
    isPowerCovered: boolean,
    showPollutionTint: boolean,
  ): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(tile.gx, tile.gy);

    if (tile.terrain === 'water') {
      const wave = Math.sin(this.time * 2.5 + tile.gx * 0.7 + tile.gy * 0.5);
      const waterColor = wave > 0.25 ? '#0ea5e9' : '#0284c7';
      this.drawDiamond(wx, wy + 3, waterColor, 'rgba(186, 230, 253, 0.3)', 1);

      ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx - 10 + wave * 4, wy + 2);
      ctx.lineTo(wx + 6 + wave * 4, wy + 4);
      ctx.stroke();
    } else {
      const checker = (tile.gx + tile.gy) % 2 === 0;
      const grass =
        tile.pollution > 25
          ? checker
            ? '#65a30d'
            : '#4d7c0f'
          : checker
            ? '#4ade80'
            : '#22c55e';
      this.drawDiamond(wx, wy, grass, 'rgba(20, 83, 45, 0.28)', 1);
    }

    // Power coverage overlay (explicit or auto when holding power-related tools)
    if (isPowerCovered && tile.terrain !== 'water') {
      this.drawDiamond(wx, wy, 'rgba(56, 189, 248, 0.25)', 'rgba(125, 211, 252, 0.48)', 1);
    } else if (overlay === 'power' && tile.building && tile.building !== 'road' && !tile.powered) {
      this.drawDiamond(wx, wy, 'rgba(239, 68, 68, 0.38)', '#ef4444', 1.5);
    }

    // Happiness overlay
    if (overlay === 'happiness' && tile.terrain !== 'water') {
      const h = tile.localHappiness;
      const col =
        h >= 75
          ? 'rgba(34, 197, 94, 0.42)'
          : h >= 50
            ? 'rgba(250, 204, 21, 0.38)'
            : 'rgba(239, 68, 68, 0.46)';
      this.drawDiamond(wx, wy, col, 'rgba(255,255,255,0.2)', 1);
    }

    // Pollution overlay
    if (showPollutionTint && tile.pollution >= 14 && tile.terrain !== 'water') {
      const alpha = Math.min(0.55, 0.14 + tile.pollution / 90);
      this.drawDiamond(
        wx,
        wy,
        `rgba(168, 85, 247, ${alpha.toFixed(2)})`,
        overlay === 'pollution' ? 'rgba(192, 132, 252, 0.6)' : undefined,
        1,
      );
    }

    if (tile.building === 'road') {
      this.drawRoadTile(tile, grid, wx, wy);
    }
  }

  private drawRoadTile(tile: TileData, grid: TileData[][], wx: number, wy: number): void {
    const ctx = this.ctx;
    const mask = getRoadMask(grid, tile.gx, tile.gy);

    if (tile.terrain === 'water') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wx - 14, wy + 2, 5, 10);
      ctx.fillRect(wx + 9, wy + 2, 5, 10);
      this.drawDiamond(wx, wy - 1, '#92400e', '#451a03', 1.5);
    }

    const roadBase =
      tile.trafficLoad > 2.2
        ? '#7f1d1d'
        : tile.trafficLoad > 1.3
          ? '#78350f'
          : '#334155';

    const r = 9;
    ctx.fillStyle = roadBase;
    ctx.beginPath();
    ctx.ellipse(wx, wy, r * 1.4, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    const edges = [
      { bit: 1, dx: TILE_W * 0.25, dy: -TILE_H * 0.25 },
      { bit: 2, dx: TILE_W * 0.25, dy: TILE_H * 0.25 },
      { bit: 4, dx: -TILE_W * 0.25, dy: TILE_H * 0.25 },
      { bit: 8, dx: -TILE_W * 0.25, dy: -TILE_H * 0.25 },
    ];

    ctx.lineCap = 'round';
    for (const e of edges) {
      if ((mask & e.bit) !== 0) {
        ctx.strokeStyle = roadBase;
        ctx.lineWidth = 13;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + e.dx, wy + e.dy);
        ctx.stroke();

        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + e.dx, wy + e.dy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (mask === 0) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(wx, wy, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawIsoBox(
    wx: number,
    wy: number,
    scale: number,
    height: number,
    topCol: string,
    leftCol: string,
    rightCol: string,
    strokeCol = 'rgba(15,23,42,0.75)',
  ): void {
    const ctx = this.ctx;
    const hw = TILE_W * 0.5 * scale;
    const hh = TILE_H * 0.5 * scale;

    ctx.beginPath();
    ctx.moveTo(wx - hw, wy);
    ctx.lineTo(wx, wy + hh);
    ctx.lineTo(wx, wy + hh - height);
    ctx.lineTo(wx - hw, wy - height);
    ctx.closePath();
    ctx.fillStyle = leftCol;
    ctx.fill();
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(wx + hw, wy);
    ctx.lineTo(wx, wy + hh);
    ctx.lineTo(wx, wy + hh - height);
    ctx.lineTo(wx + hw, wy - height);
    ctx.closePath();
    ctx.fillStyle = rightCol;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(wx, wy - hh - height);
    ctx.lineTo(wx + hw, wy - height);
    ctx.lineTo(wx, wy + hh - height);
    ctx.lineTo(wx - hw, wy - height);
    ctx.closePath();
    ctx.fillStyle = topCol;
    ctx.fill();
    ctx.stroke();
  }

  private drawForest(tile: TileData): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(tile.gx, tile.gy);
    const sway = Math.sin(this.time * 2.2 + tile.variant) * 2.2;
    const offsets = [
      { ox: -9, oy: -2, s: 0.85 },
      { ox: 8, oy: 2, s: 1.0 },
      { ox: 0, oy: -6, s: 0.92 },
    ];
    for (const o of offsets) {
      const tx = wx + o.ox;
      const ty = wy + o.oy;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3 * o.s;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + sway * 0.4, ty - 10 * o.s, tx + sway, ty - 18 * o.s);
      ctx.stroke();

      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(tx + sway, ty - 19 * o.s, 7.5 * o.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(tx + sway - 2, ty - 21 * o.s, 5 * o.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBuilding(tile: TileData, garbageOverload: boolean): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(tile.gx, tile.gy);
    const b = tile.building!;
    let badgeAnchorY = wy - 42;

    switch (b) {
      case 'townhall': {
        // Plaza base
        this.drawDiamond(wx, wy - 1, '#fef08a', '#ca8a04', 1.8);
        // Main civic building
        this.drawIsoBox(wx, wy - 1, 0.8, 22, '#fef9c3', '#eab308', '#ca8a04');
        // Golden dome roof
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(wx, wy - 28, 12, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Flagpole
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(wx, wy - 40);
        ctx.lineTo(wx, wy - 54);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        const wave = Math.sin(this.time * 5) * 2;
        ctx.beginPath();
        ctx.moveTo(wx, wy - 54);
        ctx.lineTo(wx + 12, wy - 50 + wave);
        ctx.lineTo(wx, wy - 46);
        ctx.closePath();
        ctx.fill();

        // Wooden Welcome Signpost at front-left of plaza
        ctx.fillStyle = '#78350f';
        ctx.fillRect(wx - 22, wy - 4, 3, 10);
        ctx.fillStyle = '#b45309';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(wx - 34, wy - 14, 28, 11, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SELVA', wx - 20, wy - 6);

        // Prefeito macaco acenando na praça
        ctx.save();
        ctx.translate(wx + 22, wy + 7);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 1, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        drawMayor(ctx, this.time, tile.damaged);
        ctx.restore();

        // Label above Town Hall
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText('🏛️ Prefeitura', wx, wy - 58);
        ctx.fillText('🏛️ Prefeitura', wx, wy - 58);
        return;
      }

      case 'house': {
        const h = 16 + tile.level * 10;
        badgeAnchorY = wy - h - 22;
        const bodyColors = [
          ['#fdba74', '#ea580c', '#c2410c'],
          ['#fde047', '#eab308', '#ca8a04'],
          ['#93c5fd', '#3b82f6', '#1d4ed8'],
        ][tile.variant % 3];
        this.drawIsoBox(wx, wy, 0.68, h, bodyColors[0], bodyColors[1], bodyColors[2]);

        ctx.fillStyle = tile.damaged ? '#57534e' : '#dc2626';
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(wx, wy - h - 18);
        ctx.lineTo(wx + 21, wy - h - 1);
        ctx.lineTo(wx, wy - h + 9);
        ctx.lineTo(wx - 21, wy - h - 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const winColor = tile.powered && !tile.damaged ? '#fef08a' : '#1e293b';
        for (let floor = 0; floor < tile.level; floor++) {
          const fy = wy - 6 - floor * 9;
          ctx.fillStyle = winColor;
          ctx.fillRect(wx - 12, fy, 5, 5);
          ctx.fillRect(wx + 7, fy, 5, 5);
        }
        break;
      }

      case 'market': {
        badgeAnchorY = wy - 42;
        this.drawIsoBox(wx, wy, 0.74, 18, '#fef08a', '#f59e0b', '#d97706');
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(wx - 22, wy - 16);
        ctx.lineTo(wx, wy - 6);
        ctx.lineTo(wx, wy - 12);
        ctx.lineTo(wx - 22, wy - 22);
        ctx.closePath();
        ctx.fill();

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🍌', wx, wy - 24);
        break;
      }

      case 'factory': {
        badgeAnchorY = wy - 52;
        this.drawIsoBox(wx, wy, 0.8, 22, '#c084fc', '#7e22ce', '#581c87');
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.4;
        ctx.fillRect(wx - 12, wy - 44, 7, 20);
        ctx.strokeRect(wx - 12, wy - 44, 7, 20);
        ctx.fillRect(wx + 4, wy - 40, 7, 16);
        ctx.strokeRect(wx + 4, wy - 40, 7, 16);

        if (!tile.damaged) {
          const puff = (this.time * 18 + tile.variant) % 18;
          ctx.fillStyle = 'rgba(163, 230, 53, 0.55)';
          ctx.beginPath();
          ctx.arc(wx - 8, wy - 46 - puff, 4 + puff * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'power': {
        badgeAnchorY = wy - 52;
        this.drawIsoBox(wx, wy, 0.82, 24, '#bae6fd', '#0284c7', '#0369a1');
        const cx = wx;
        const cy = wy - 33;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tile.damaged ? 0.3 : this.time * 4.2);
        ctx.fillStyle = tile.damaged ? '#94a3b8' : '#facc15';
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.ellipse(7, 0, 7, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡', wx, wy - 42);
        break;
      }

      case 'park': {
        badgeAnchorY = wy - 42;
        this.drawDiamond(wx, wy - 1, '#86efac', '#16a34a', 1.5);
        this.drawIsoBox(wx, wy, 0.36, 10, '#cbd5e1', '#94a3b8', '#64748b');
        ctx.save();
        ctx.translate(wx, wy - 10);
        drawStatue(ctx, this.time + tile.variant, tile.damaged);
        ctx.restore();
        break;
      }

      case 'dump': {
        badgeAnchorY = wy - 30;
        this.drawDiamond(wx, wy - 1, '#3f6212', '#1a2e05', 1.5);
        const blobs = [
          { dx: -7, dy: -2, r: 7, c: '#78350f' },
          { dx: 6, dy: -1, r: 6.5, c: '#65a30d' },
          { dx: 0, dy: -6, r: 8, c: '#854d0e' },
        ];
        for (const bl of blobs) {
          ctx.fillStyle = bl.c;
          ctx.strokeStyle = '#1a2e05';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(wx + bl.dx, wy + bl.dy, bl.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        for (let i = 0; i < 3; i++) {
          const ang = this.time * 5 + i * 2.1;
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(wx + Math.cos(ang) * 11, wy - 16 + Math.sin(ang * 1.4) * 4, 2.2, 2.2);
        }
        break;
      }
    }

    // Collect unmistakable pulsing floating badges!
    const badges: Array<{ icon: string; bg: string }> = [];
    if (tile.damaged) {
      badges.push({ icon: '🔧', bg: '#dc2626' });
    } else if (b === 'house' || b === 'market' || b === 'factory' || b === 'park') {
      if (b !== 'park' && !tile.connectedToRoad) {
        badges.push({ icon: '🛣️', bg: '#ef4444' });
      }
      if (!tile.powered) {
        badges.push({ icon: '⚡', bg: '#f59e0b' });
      }
      if (b !== 'factory' && tile.pollution >= 22) {
        badges.push({ icon: '☁️', bg: '#9333ea' });
      }
      if (b !== 'park' && garbageOverload && badges.length < 2) {
        badges.push({ icon: '🗑️', bg: '#b45309' });
      }
      if (tile.levelUpTimer > 0) {
        badges.push({ icon: '⬆️', bg: '#16a34a' });
      }
    }

    if (badges.length > 0) {
      const bob = Math.sin(this.time * 4.8 + tile.gx * 0.8 + tile.gy * 0.5) * 3;
      const shown = badges.slice(0, 2);
      const spacing = 22;
      const startX = wx - ((shown.length - 1) * spacing) * 0.5;
      for (let i = 0; i < shown.length; i++) {
        this.drawBadge(startX + i * spacing, badgeAnchorY + bob, shown[i].icon, shown[i].bg);
      }
    }
  }

  private drawBadge(wx: number, wy: number, text: string, bg: string): void {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(this.time * 7) * 0.07;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-10, -10, 20, 18, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, -1);
    ctx.restore();
  }

  private drawVehicle(v: Vehicle): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(v.gx, v.gy);
    const bounce = Math.sin(this.time * 14 + v.id) * 1;
    const dir = v.dirX - v.dirY >= 0 ? 1 : -1;

    if (v.kind === 'trio_eletrico') {
      this.drawIsoBox(wx, wy - 2 + bounce, 0.55, 16, '#f472b6', '#db2777', '#9d174d');
      const party = Math.floor(this.time * 8) % 3;
      const lightCols = ['#facc15', '#22d3ee', '#4ade80'];
      ctx.fillStyle = lightCols[party];
      ctx.beginPath();
      ctx.arc(wx + 9, wy - 19 + bounce, 3.4, 0, Math.PI * 2);
      ctx.fill();
      // DJ macaco dançando em cima do caminhão
      ctx.save();
      ctx.translate(wx, wy - 17 + bounce);
      const hop = Math.max(0, Math.sin(this.time * 8 + v.id)) * 2;
      ctx.translate(0, -hop);
      drawMonkey(ctx, {
        style: driverStyle(v.id + 2),
        face: makeFace('cheer', this.time, v.id),
        height: 17,
        turn: 0.2,
        tailPhase: this.time * 9,
        tailAmp: 0.7,
        earFlop: Math.sin(this.time * 8) * 0.5,
        armL: HANDS.cheer(-1, this.time * 8),
        armR: HANDS.cheer(1, this.time * 8),
        tuft: false,
        accessory: djPhonesAccessory,
        outlinePx: 1.2,
      });
      ctx.restore();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎵🎶', wx, wy - 40 + bounce);
      return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 1, 7.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (v.kind === 'banana_car') {
      ctx.fillStyle = v.color;
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(wx, wy - 3 + bounce, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(wx, wy - 9 + bounce);
      drawDriverHead(ctx, this.time, v.id, 4.6, dir, 'happy', v.id % 2 === 0 ? shadesAccessory : undefined);
      ctx.restore();
    } else if (v.kind === 'monkey_bus') {
      this.drawIsoBox(wx, wy - 1 + bounce, 0.28, 9, '#fef08a', '#f59e0b', '#d97706');
      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.translate(wx + i * 4.6, wy - 11 + bounce - Math.abs(i) * 0.6);
        drawDriverHead(ctx, this.time, v.id * 3 + i, 3.1, dir, i === 0 ? 'cheer' : 'happy');
        ctx.restore();
      }
    } else {
      this.drawIsoBox(wx, wy - 1 + bounce, 0.3, 10, '#e9d5ff', '#a855f7', '#7e22ce');
      ctx.save();
      ctx.translate(wx, wy - 12 + bounce);
      drawDriverHead(ctx, this.time, v.id, 3.6, dir, 'focus', capAccessory);
      ctx.restore();
    }
  }

  private drawGiantGorilla(d: ActiveDisaster): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(d.gorillaX, d.gorillaY);
    const stomp = Math.abs(Math.sin(this.time * 6)) * 12;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 4, 34 - stomp * 0.4, 17 - stomp * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(wx, wy);
    drawPlushGorilla(ctx, this.time, stomp);
    ctx.restore();
  }

  private drawAuraPreview(cx: number, cy: number, tool: ToolType): void {
    const def = TOOL_MAP[tool];
    if (def.radius <= 0) return;

    const col =
      tool === 'power'
        ? 'rgba(56, 189, 248, 0.25)'
        : tool === 'park'
          ? 'rgba(74, 222, 128, 0.28)'
          : 'rgba(168, 85, 247, 0.26)';

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (Math.hypot(x - cx, y - cy) <= def.radius) {
          const { wx, wy } = gridToWorld(x, y);
          this.drawDiamond(wx, wy, col);
        }
      }
    }
  }

  private drawRoadPreview(coords: Array<{ gx: number; gy: number }>, sim: CitySimulation): void {
    let validCount = 0;
    let totalCost = 0;
    for (const c of coords) {
      if (!inBounds(c.gx, c.gy)) continue;
      const check = sim.canApplyTool(c.gx, c.gy, 'road');
      const cost = check.ok ? sim.getTileCost(c.gx, c.gy, 'road') : 0;
      if (check.ok) {
        validCount++;
        totalCost += cost;
      }
      const { wx, wy } = gridToWorld(c.gx, c.gy);
      this.drawDiamond(
        wx,
        wy,
        check.ok ? 'rgba(250, 204, 21, 0.35)' : 'rgba(239, 68, 68, 0.32)',
        check.ok ? '#facc15' : '#ef4444',
        2,
      );
    }

    const last = coords[coords.length - 1];
    if (last && inBounds(last.gx, last.gy)) {
      const { wx, wy } = gridToWorld(last.gx, last.gy);
      const canAfford = sim.mode === 'sandbox' || sim.stats.bananas >= totalCost;
      const text =
        validCount === 0
          ? '🚫 Sem trecho novo'
          : sim.mode === 'sandbox'
            ? `🛣️ ${validCount} trechos`
            : `🛣️ ${validCount}x · -${totalCost}🍌`;
      this.drawCursorPill(wx, wy - 24, text, canAfford && validCount > 0 ? '#fde047' : '#fca5a5');
    }
  }

  private drawLocalHover(
    gx: number,
    gy: number,
    tool: ToolType,
    sim: CitySimulation,
    pingMode: boolean,
  ): void {
    const { wx, wy } = gridToWorld(gx, gy);
    const tile = sim.grid[gy][gx];

    if (pingMode) {
      this.drawDiamond(wx, wy, 'rgba(250, 204, 21, 0.35)', '#facc15', 2.8);
      this.drawCursorPill(wx, wy - 24, '📍 Clique para Pingar!', '#fde047');
      return;
    }

    if (tool === 'inspect') {
      this.drawDiamond(wx, wy, 'rgba(56, 189, 248, 0.25)', '#38bdf8', 2.4);
      if (tile.building) {
        const def = TOOL_MAP[tile.building];
        const repair = tile.damaged ? ` · 🔧 Reparar (-${sim.getRepairCost(gx, gy)}🍌)` : '';
        this.drawCursorPill(wx, wy - 24, `🔍 ${def.name}${repair}`, tile.damaged ? '#fb7185' : '#7dd3fc');
      } else {
        this.drawCursorPill(wx, wy - 22, '🔍 Inspecionar terreno', '#7dd3fc');
      }
      return;
    }

    const check = sim.canApplyTool(gx, gy, tool);
    const cost = sim.getTileCost(gx, gy, tool);
    const refund = tool === 'bulldozer' ? sim.getBulldozeRefund(gx, gy) : 0;
    const canAfford = sim.mode === 'sandbox' || sim.stats.bananas >= cost;
    const ok = check.ok && canAfford;

    this.drawDiamond(
      wx,
      wy,
      ok ? 'rgba(250, 204, 21, 0.28)' : 'rgba(239, 68, 68, 0.3)',
      ok ? '#facc15' : '#ef4444',
      2.2,
    );

    let label: string;
    if (!check.ok) {
      label = check.reason || '🚫';
    } else if (tool === 'bulldozer') {
      label = refund > 0 ? `💥 +${refund}🍌 (50%)` : cost > 0 ? `🪓 -${cost}🍌` : '💥 Demolir';
    } else {
      label = cost > 0 ? `${TOOL_MAP[tool].emoji} -${cost}🍌` : `${TOOL_MAP[tool].emoji} Grátis`;
    }

    this.drawCursorPill(wx, wy - 24, label, ok ? (refund > 0 ? '#4ade80' : '#fef08a') : '#fca5a5');

    // Live placement readiness check for buildings!
    if (ok && (tool === 'house' || tool === 'market' || tool === 'factory' || tool === 'park')) {
      const hasRoad = this.hasAdjacentRoad(sim, gx, gy);
      const hasPower = this.wouldHavePower(sim, gx, gy);
      const polluted = tile.pollution >= 22 && tool !== 'factory';
      const checks: string[] = [];
      if (tool !== 'park') checks.push(hasRoad ? '✓ Estrada' : '⚠ Sem estrada!');
      checks.push(hasPower ? '✓ Luz' : '⚠ Fora da luz!');
      if (polluted) checks.push('☁️ Poluído!');
      const allGood = (tool === 'park' || hasRoad) && hasPower && !polluted;
      this.drawCursorPill(wx, wy - 44, checks.join(' | '), allGood ? '#86efac' : '#fdba74');
    }
  }

  private hasAdjacentRoad(sim: CitySimulation, gx: number, gy: number): boolean {
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (const [dx, dy] of dirs) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (inBounds(nx, ny) && sim.grid[ny][nx].building === 'road') return true;
    }
    return false;
  }

  private wouldHavePower(sim: CitySimulation, gx: number, gy: number): boolean {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = sim.grid[y][x];
        if (t.building === 'power' && !t.damaged) {
          if (Math.hypot(gx - x, gy - y) <= TOOL_MAP.power.radius) return true;
        }
      }
    }
    return false;
  }

  private drawCursorPill(wx: number, wy: number, text: string, color: string): void {
    const ctx = this.ctx;
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(wx - tw * 0.5, wy - 9, tw, 18, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, wx, wy);
    ctx.textBaseline = 'alphabetic';
  }

  private drawRemoteCursor(rc: RemoteCursor): void {
    const { wx, wy } = gridToWorld(rc.gx, rc.gy);
    this.drawDiamond(wx, wy, 'rgba(255,255,255,0.12)', rc.color, 2.4);
    const text = `${rc.name} ${TOOL_MAP[rc.tool].emoji}`;
    this.drawCursorPill(wx + 8, wy - 26, text, rc.color);
    const ctx = this.ctx;
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(text).width + 14;
    ctx.save();
    ctx.translate(wx + 8 - tw * 0.5 - 6, wy - 28 + Math.sin(this.time * 5) * 1.2);
    drawCursorMonkey(ctx, this.time, rc.color, 10);
    ctx.restore();
  }

  private drawMapPing(ping: MapPing): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(ping.gx, ping.gy);
    const t = 1 - ping.life / ping.maxLife;
    const ringRadius = 12 + ((t * 4) % 1) * 32;
    const alpha = Math.max(0.2, ping.life / ping.maxLife);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ping.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(wx, wy, ringRadius, ringRadius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const bob = Math.sin(this.time * 8) * 4;
    this.drawCursorPill(wx, wy - 28 + bob, `📍 ${ping.actorName}`, ping.color);
  }

  private drawParticles(particles: Particle[]): void {
    const ctx = this.ctx;
    for (const p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === 'text' && p.text) {
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.wx, p.wy - p.z);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.wx, p.wy - p.z);
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.wx, p.wy, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.wx, p.wy - p.z, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
