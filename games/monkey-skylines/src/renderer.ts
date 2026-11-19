import { getRoadMask, gridToWorld, inBounds } from './map';
import {
  GRID_SIZE,
  TILE_H,
  TILE_W,
  TOOL_MAP,
  type ActiveDisaster,
  type Particle,
  type RemoteCursor,
  type TileData,
  type ToolType,
  type Vehicle,
} from './types';
import type { CitySimulation } from './simulation';

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

export class CityRenderer {
  private ctx: CanvasRenderingContext2D;
  private time = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  render(
    canvas: HTMLCanvasElement,
    sim: CitySimulation,
    cam: CameraState,
    hover: HoverState | null,
    selectedTool: ToolType,
    remoteCursors: Map<string, RemoteCursor>,
    dt: number,
  ): void {
    this.time += dt;
    const ctx = this.ctx;
    const w = canvas.width;
    const h = canvas.height;

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

    // 1. Draw base terrain tiles + roads
    for (let sum = 0; sum <= (GRID_SIZE - 1) * 2; sum++) {
      for (let gx = 0; gx <= sum; gx++) {
        const gy = sum - gx;
        if (!inBounds(gx, gy)) continue;
        const tile = sim.grid[gy][gx];
        this.drawBaseTile(tile, sim.grid);
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

    // 3. Sort & draw buildings, trees, vehicles, and giant gorilla back-to-front by isometric depth (gx + gy)
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

    for (const item of items) {
      if (item.kind === 'tile') {
        if (item.tile.building) {
          this.drawBuilding(item.tile);
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

    // 5. Hover cursor & ghost preview
    if (hover && inBounds(hover.gx, hover.gy)) {
      this.drawLocalHover(hover.gx, hover.gy, selectedTool, sim);
    }

    // 6. Remote player cursors (Co-op)
    const now = performance.now();
    for (const rc of remoteCursors.values()) {
      if (now - rc.lastSeen > 12000) continue;
      if (!inBounds(rc.gx, rc.gy)) continue;
      this.drawRemoteCursor(rc);
    }

    // 7. Particles & floating text
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

  private drawBaseTile(tile: TileData, grid: TileData[][]): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(tile.gx, tile.gy);

    if (tile.terrain === 'water') {
      const wave = Math.sin(this.time * 2.5 + tile.gx * 0.7 + tile.gy * 0.5);
      const waterColor = wave > 0.25 ? '#0ea5e9' : '#0284c7';
      this.drawDiamond(wx, wy + 3, waterColor, 'rgba(186, 230, 253, 0.3)', 1);

      // Shimmer line
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

    if (tile.building === 'road') {
      this.drawRoadTile(tile, grid, wx, wy);
    }
  }

  private drawRoadTile(tile: TileData, grid: TileData[][], wx: number, wy: number): void {
    const ctx = this.ctx;
    const mask = getRoadMask(grid, tile.gx, tile.gy);

    // Bridge supports if over river
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

    // Center hub
    const r = 9;
    ctx.fillStyle = roadBase;
    ctx.beginPath();
    ctx.ellipse(wx, wy, r * 1.4, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // Neighbor edge midpoints in isometric coords:
    // N (gy-1): (+16, -8) ? Wait: gridToWorld(0,-1) = (+32, -16), half = (+16, -8)
    // Let's compute exact edge midpoints:
    const edges = [
      { bit: 1, dx: TILE_W * 0.25, dy: -TILE_H * 0.25 }, // N (gy - 1) -> top-right edge!
      { bit: 2, dx: TILE_W * 0.25, dy: TILE_H * 0.25 },  // E (gx + 1) -> bottom-right edge!
      { bit: 4, dx: -TILE_W * 0.25, dy: TILE_H * 0.25 }, // S (gy + 1) -> bottom-left edge!
      { bit: 8, dx: -TILE_W * 0.25, dy: -TILE_H * 0.25 }, // W (gx - 1) -> top-left edge!
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

        // Yellow banana dashed center line
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

    // Left face
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

    // Right face
    ctx.beginPath();
    ctx.moveTo(wx + hw, wy);
    ctx.lineTo(wx, wy + hh);
    ctx.lineTo(wx, wy + hh - height);
    ctx.lineTo(wx + hw, wy - height);
    ctx.closePath();
    ctx.fillStyle = rightCol;
    ctx.fill();
    ctx.stroke();

    // Top face
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

  private drawBuilding(tile: TileData): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(tile.gx, tile.gy);
    const b = tile.building!;

    switch (b) {
      case 'house': {
        const h = 16 + tile.level * 10;
        const bodyColors = [
          ['#fdba74', '#ea580c', '#c2410c'],
          ['#fde047', '#eab308', '#ca8a04'],
          ['#93c5fd', '#3b82f6', '#1d4ed8'],
        ][tile.variant % 3];
        this.drawIsoBox(wx, wy, 0.68, h, bodyColors[0], bodyColors[1], bodyColors[2]);

        // Pitched roof
        ctx.fillStyle = '#dc2626';
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

        // Windows (glowing if powered!)
        const winColor = tile.powered ? '#fef08a' : '#1e293b';
        for (let floor = 0; floor < tile.level; floor++) {
          const fy = wy - 6 - floor * 9;
          ctx.fillStyle = winColor;
          ctx.fillRect(wx - 12, fy, 5, 5);
          ctx.fillRect(wx + 7, fy, 5, 5);
        }
        break;
      }

      case 'market': {
        this.drawIsoBox(wx, wy, 0.74, 18, '#fef08a', '#f59e0b', '#d97706');
        // Striped market awning
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(wx - 22, wy - 16);
        ctx.lineTo(wx, wy - 6);
        ctx.lineTo(wx, wy - 12);
        ctx.lineTo(wx - 22, wy - 22);
        ctx.closePath();
        ctx.fill();

        // Banana sign on roof
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🍌', wx, wy - 24);
        break;
      }

      case 'factory': {
        this.drawIsoBox(wx, wy, 0.8, 22, '#c084fc', '#7e22ce', '#581c87');
        // Twin smokestacks
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.4;
        ctx.fillRect(wx - 12, wy - 44, 7, 20);
        ctx.strokeRect(wx - 12, wy - 44, 7, 20);
        ctx.fillRect(wx + 4, wy - 40, 7, 16);
        ctx.strokeRect(wx + 4, wy - 40, 7, 16);

        // Smoke puff animation
        const puff = (this.time * 18 + tile.variant) % 18;
        ctx.fillStyle = 'rgba(163, 230, 53, 0.55)';
        ctx.beginPath();
        ctx.arc(wx - 8, wy - 46 - puff, 4 + puff * 0.25, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'power': {
        this.drawIsoBox(wx, wy, 0.82, 24, '#bae6fd', '#0284c7', '#0369a1');
        // Spinning banana turbine on roof
        const cx = wx;
        const cy = wy - 33;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.time * 4.2);
        ctx.fillStyle = '#facc15';
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
        // Plaza base
        this.drawDiamond(wx, wy - 1, '#86efac', '#16a34a', 1.5);
        // Pedestal
        this.drawIsoBox(wx, wy, 0.36, 10, '#cbd5e1', '#94a3b8', '#64748b');
        // Golden Bald Monkey Statue!
        const sy = wy - 20;
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 1.5;
        // Ears
        ctx.beginPath();
        ctx.arc(wx - 9, sy, 4, 0, Math.PI * 2);
        ctx.arc(wx + 9, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Bald head
        ctx.beginPath();
        ctx.arc(wx, sy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Shiny bald glint!
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(wx - 2, sy - 4, 4, Math.PI * 1.1, Math.PI * 1.65);
        ctx.stroke();
        // Eyes + goofy smile
        ctx.fillStyle = '#451a03';
        ctx.fillRect(wx - 4, sy - 1, 2, 2);
        ctx.fillRect(wx + 2, sy - 1, 2, 2);
        break;
      }

      case 'dump': {
        this.drawDiamond(wx, wy - 1, '#3f6212', '#1a2e05', 1.5);
        // Trash / coconut pile
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
        // Orbiting flies
        for (let i = 0; i < 3; i++) {
          const ang = this.time * 5 + i * 2.1;
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(wx + Math.cos(ang) * 11, wy - 16 + Math.sin(ang * 1.4) * 4, 2.2, 2.2);
        }
        break;
      }
    }

    // Status warning icons (unpowered / no road / traffic jam)
    if (b === 'house' || b === 'market' || b === 'factory') {
      const blink = Math.sin(this.time * 6) > 0;
      if (!tile.connectedToRoad && blink) {
        this.drawBadge(wx, wy - 44, '🛣️?', '#ef4444');
      } else if (!tile.powered && blink) {
        this.drawBadge(wx, wy - 44, '⚡!', '#f59e0b');
      }
    }
  }

  private drawBadge(wx: number, wy: number, text: string, bg: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(wx - 13, wy - 9, 26, 16, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, wx, wy + 2);
  }

  private drawVehicle(v: Vehicle): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(v.gx, v.gy);
    const bounce = Math.sin(this.time * 14 + v.id) * 1;

    if (v.kind === 'trio_eletrico') {
      this.drawIsoBox(wx, wy - 2 + bounce, 0.55, 16, '#f472b6', '#db2777', '#9d174d');
      // Flashing party lights
      const party = Math.floor(this.time * 8) % 3;
      const lightCols = ['#facc15', '#22d3ee', '#4ade80'];
      ctx.fillStyle = lightCols[party];
      ctx.beginPath();
      ctx.arc(wx, wy - 22 + bounce, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎵🎶', wx, wy - 28 + bounce);
      return;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 1, 7.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (v.kind === 'banana_car') {
      // Cute yellow banana car!
      ctx.fillStyle = v.color;
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(wx, wy - 3 + bounce, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Tiny monkey driver head
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.arc(wx, wy - 7 + bounce, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (v.kind === 'monkey_bus') {
      this.drawIsoBox(wx, wy - 1 + bounce, 0.28, 9, '#fef08a', '#f59e0b', '#d97706');
    } else {
      // pacoca_truck
      this.drawIsoBox(wx, wy - 1 + bounce, 0.3, 10, '#e9d5ff', '#a855f7', '#7e22ce');
    }
  }

  private drawGiantGorilla(d: ActiveDisaster): void {
    const ctx = this.ctx;
    const { wx, wy } = gridToWorld(d.gorillaX, d.gorillaY);
    const stomp = Math.abs(Math.sin(this.time * 6)) * 12;

    // Giant shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 4, 34 - stomp * 0.4, 17 - stomp * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    const gy = wy - stomp;
    // Plush Gorilla Body
    ctx.fillStyle = '#7c3aed';
    ctx.strokeStyle = '#2e1065';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(wx, gy - 26, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly patch + seam
    ctx.fillStyle = '#c4b5fd';
    ctx.beginPath();
    ctx.ellipse(wx, gy - 22, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4c1d95';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(wx, gy - 38);
    ctx.lineTo(wx, gy - 6);
    ctx.stroke();
    ctx.setLineDash([]);

    // Flailing Arms
    const armSwing = Math.sin(this.time * 8) * 10;
    ctx.fillStyle = '#7c3aed';
    ctx.strokeStyle = '#2e1065';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(wx - 28, gy - 30 + armSwing, 11, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(wx + 28, gy - 30 - armSwing, 11, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Head + Ears
    ctx.beginPath();
    ctx.arc(wx - 20, gy - 58, 7, 0, Math.PI * 2);
    ctx.arc(wx + 20, gy - 58, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(wx, gy - 56, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Muzzle
    ctx.fillStyle = '#ddd6fe';
    ctx.beginPath();
    ctx.ellipse(wx, gy - 50, 13, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Goofy Button Eyes (one X button, one huge googly eye!)
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#2e1065';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(wx - 7, gy - 60, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wx - 9, gy - 62);
    ctx.lineTo(wx - 5, gy - 58);
    ctx.moveTo(wx - 5, gy - 62);
    ctx.lineTo(wx - 9, gy - 58);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(wx + 7, gy - 59, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(wx + 8, gy - 59, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawAuraPreview(cx: number, cy: number, tool: ToolType): void {
    const def = TOOL_MAP[tool];
    if (def.radius <= 0) return;

    const col =
      tool === 'power'
        ? 'rgba(56, 189, 248, 0.25)'
        : tool === 'park'
          ? 'rgba(74, 222, 128, 0.26)'
          : 'rgba(163, 230, 53, 0.26)';

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (Math.hypot(x - cx, y - cy) <= def.radius) {
          const { wx, wy } = gridToWorld(x, y);
          this.drawDiamond(wx, wy, col);
        }
      }
    }
  }

  private drawLocalHover(gx: number, gy: number, tool: ToolType, sim: CitySimulation): void {
    const { wx, wy } = gridToWorld(gx, gy);
    const check = sim.canApplyTool(gx, gy, tool);
    const cost = sim.getTileCost(gx, gy, tool);
    const canAfford = sim.stats.bananas >= cost;
    const ok = check.ok && canAfford;

    this.drawDiamond(
      wx,
      wy,
      ok ? 'rgba(250, 204, 21, 0.28)' : 'rgba(239, 68, 68, 0.3)',
      ok ? '#facc15' : '#ef4444',
      2.2,
    );

    // Floating cost tag
    const ctx = this.ctx;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ok ? '#fef08a' : '#fca5a5';
    const label = check.ok ? `${TOOL_MAP[tool].emoji} -${cost}🍌` : check.reason || '🚫';
    ctx.fillText(label, wx, wy - 20);
  }

  private drawRemoteCursor(rc: RemoteCursor): void {
    const { wx, wy } = gridToWorld(rc.gx, rc.gy);
    this.drawDiamond(wx, wy, 'rgba(255,255,255,0.12)', rc.color, 2.4);

    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(17,24,39,0.9)';
    ctx.strokeStyle = rc.color;
    ctx.lineWidth = 1.6;
    const text = `🐒 ${rc.name} ${TOOL_MAP[rc.tool].emoji}`;
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(text).width + 12;
    ctx.beginPath();
    ctx.roundRect(wx - tw * 0.5, wy - 36, tw, 18, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = rc.color;
    ctx.textAlign = 'center';
    ctx.fillText(text, wx, wy - 23);
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
