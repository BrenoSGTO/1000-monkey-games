import { GRID_COLS, GRID_ROWS, MONKEY_COLORS, TOOL_META } from './constants';
import { cellKey, parseEdgeKey, type RoadPathPreview } from './roadNetwork';
import type { TrafficSimulation } from './simulation';
import type { BuildingShape, GridCoord, RemoteCursor, ToolKind } from './types';

export interface RenderInteractionState {
  hoverCell: GridCoord | null;
  activeTool: ToolKind;
  motorwayAnchor: GridCoord | null;
  roadPreview: RoadPathPreview | null;
  nightMode: boolean;
  remoteCursors: RemoteCursor[];
  replayProgress: number | null; // null = normal render, 0..1 = quick replay timelapse
}

export class MotorwaysRenderer {
  public cellSize = 36;
  public offsetX = 0;
  public offsetY = 0;
  public width = 0;
  public height = 0;

  resize(canvas: HTMLCanvasElement): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    this.width = Math.max(320, rect.width);
    this.height = Math.max(240, rect.height);
    canvas.width = Math.floor(this.width * dpr);
    canvas.height = Math.floor(this.height * dpr);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const padX = 28;
    const topClear = 68;
    const bottomClear = 104;
    const availW = Math.max(200, this.width - padX * 2);
    const availH = Math.max(160, this.height - topClear - bottomClear);

    this.cellSize = Math.max(16, Math.floor(Math.min(availW / GRID_COLS, availH / GRID_ROWS)));
    const gridW = this.cellSize * GRID_COLS;
    const gridH = this.cellSize * GRID_ROWS;
    this.offsetX = Math.floor((this.width - gridW) / 2);
    this.offsetY = Math.floor(topClear + (availH - gridH) / 2);
  }

  screenToGrid(px: number, py: number): GridCoord | null {
    const gx = Math.floor((px - this.offsetX) / this.cellSize);
    const gy = Math.floor((py - this.offsetY) / this.cellSize);
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return null;
    return { x: gx, y: gy };
  }

  gridToCenter(gx: number, gy: number): { x: number; y: number } {
    return {
      x: this.offsetX + (gx + 0.5) * this.cellSize,
      y: this.offsetY + (gy + 0.5) * this.cellSize,
    };
  }

  render(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    uiState: RenderInteractionState,
  ): void {
    const night = uiState.nightMode;
    const cs = this.cellSize;

    ctx.fillStyle = night ? '#090e1a' : '#ebe7d8';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    if (sim.shake > 0) {
      const mag = sim.shake * 10;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    const boardW = GRID_COLS * cs;
    const boardH = GRID_ROWS * cs;
    ctx.fillStyle = night ? '#111827' : '#f5f2e8';
    this.roundRect(ctx, this.offsetX - 6, this.offsetY - 6, boardW + 12, boardH + 12, 14);
    ctx.fill();

    // Subtle grid lines
    ctx.strokeStyle = night ? 'rgba(148, 163, 184, 0.08)' : 'rgba(120, 113, 108, 0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= GRID_COLS; x++) {
      const px = this.offsetX + x * cs;
      ctx.moveTo(px, this.offsetY);
      ctx.lineTo(px, this.offsetY + boardH);
    }
    for (let y = 0; y <= GRID_ROWS; y++) {
      const py = this.offsetY + y * cs;
      ctx.moveTo(this.offsetX, py);
      ctx.lineTo(this.offsetX + boardW, py);
    }
    ctx.stroke();

    // Terrain: Water, Trees, Rocks
    this.renderTerrain(ctx, sim, night);

    if (uiState.replayProgress !== null) {
      this.renderReplayHistory(ctx, sim, uiState.replayProgress, night);
      ctx.restore();
      return;
    }

    // Roads & Bridges
    this.renderRoads(ctx, sim, night);

    // Smart road drag preview
    if (uiState.roadPreview && uiState.roadPreview.segments.length > 0) {
      this.renderRoadPreview(ctx, uiState.roadPreview, night);
    }

    // Roundabouts
    this.renderRoundabouts(ctx, sim, night);

    // Houses & Markets
    this.renderHouses(ctx, sim, night);
    this.renderMarkets(ctx, sim, night);

    // Ground Cars (non-motorway)
    this.renderCars(ctx, sim, night, false);

    // Traffic Lights
    this.renderTrafficLights(ctx, sim, night);

    // Elevated Vine Expressways + Cars on Motorways
    this.renderMotorways(ctx, sim, uiState, night);
    this.renderCars(ctx, sim, night, true);

    // Urgent Critical Market Alerts (above everything except cursors/UI)
    this.renderCriticalMarketAlerts(ctx, sim);

    // Map Pings
    this.renderPings(ctx, sim);

    // Tool hover preview & Remote co-op cursors
    this.renderHoverPreview(ctx, sim, uiState, night);
    this.renderRemoteCursors(ctx, uiState);

    // Particles & Floating Texts
    this.renderParticlesAndTexts(ctx, sim);

    ctx.restore();
  }

  private renderReplayHistory(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    progress: number,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    const count = Math.floor(progress * sim.buildHistory.length);
    const slice = sim.buildHistory.slice(0, Math.max(1, count));

    // Bridges first
    for (const ev of slice) {
      if (ev.kind === 'road' && ev.isBridge && ev.bx !== undefined && ev.by !== undefined) {
        const pA = this.gridToCenter(ev.x, ev.y);
        const pB = this.gridToCenter(ev.bx, ev.by);
        ctx.strokeStyle = night ? '#92400e' : '#d97706';
        ctx.lineWidth = cs * 0.62;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    }

    // Roads
    ctx.strokeStyle = night ? '#1e293b' : '#cbd5e1';
    ctx.lineWidth = cs * 0.48;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const ev of slice) {
      if (ev.kind === 'road' && ev.bx !== undefined && ev.by !== undefined) {
        const pA = this.gridToCenter(ev.x, ev.y);
        const pB = this.gridToCenter(ev.bx, ev.by);
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = night ? '#334155' : '#475569';
    ctx.lineWidth = cs * 0.36;
    ctx.beginPath();
    for (const ev of slice) {
      if (ev.kind === 'road' && ev.bx !== undefined && ev.by !== undefined) {
        const pA = this.gridToCenter(ev.x, ev.y);
        const pB = this.gridToCenter(ev.bx, ev.by);
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
      }
    }
    ctx.stroke();

    // Roundabouts & Lights
    for (const ev of slice) {
      if (ev.kind === 'roundabout') {
        const c = this.gridToCenter(ev.x, ev.y);
        ctx.fillStyle = night ? '#334155' : '#475569';
        ctx.beginPath();
        ctx.arc(c.x, c.y, cs * 0.48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(c.x, c.y, cs * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (ev.kind === 'light') {
        const c = this.gridToCenter(ev.x, ev.y);
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(c.x, c.y, cs * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Houses & Markets
    for (const ev of slice) {
      if (ev.kind === 'house' && ev.color) {
        const theme = MONKEY_COLORS[ev.color];
        const c = this.gridToCenter(ev.x, ev.y);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.fillStyle = theme.fill;
        ctx.strokeStyle = theme.dark;
        ctx.lineWidth = 2;
        this.drawHouseBody(ctx, theme.shape, cs * 0.34);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (ev.kind === 'market' && ev.color) {
        const theme = MONKEY_COLORS[ev.color];
        const cx = this.offsetX + (ev.x + 1) * cs;
        const cy = this.offsetY + (ev.y + 1) * cs;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = night ? '#1e293b' : '#ffffff';
        ctx.strokeStyle = theme.fill;
        ctx.lineWidth = 3;
        this.roundRect(ctx, -cs * 0.86, -cs * 0.86, cs * 1.72, cs * 1.72, cs * 0.26);
        ctx.fill();
        ctx.stroke();
        ctx.font = `${Math.floor(cs * 0.6)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.fruitEmoji, 0, 0);
        ctx.restore();
      }
    }

    // Motorways
    for (const ev of slice) {
      if (ev.kind === 'motorway' && ev.bx !== undefined && ev.by !== undefined) {
        this.drawVineCurve(ctx, ev.x, ev.y, ev.bx, ev.by, false, night);
      }
    }
  }

  private renderTerrain(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    const t = sim.timeSec;

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const tile = sim.map.tiles[y][x];
        if (tile !== 'water') continue;

        const px = this.offsetX + x * cs;
        const py = this.offsetY + y * cs;

        ctx.fillStyle = night ? '#164e63' : '#bae6fd';
        ctx.fillRect(px - 2, py - 2, cs + 4, cs + 4);

        ctx.fillStyle = night ? '#0c4a6e' : '#38bdf8';
        ctx.fillRect(px, py, cs + 0.5, cs + 0.5);

        if ((x + y) % 2 === 0) {
          const wave = Math.sin(t * 2.2 + x * 0.8 + y * 0.6) * cs * 0.08;
          ctx.strokeStyle = night ? 'rgba(125, 211, 252, 0.2)' : 'rgba(255, 255, 255, 0.42)';
          ctx.lineWidth = Math.max(1.5, cs * 0.06);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px + cs * 0.25, py + cs * 0.5 + wave);
          ctx.lineTo(px + cs * 0.72, py + cs * 0.5 - wave);
          ctx.stroke();
        }
      }
    }

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const tile = sim.map.tiles[y][x];
        const cx = this.offsetX + (x + 0.5) * cs;
        const cy = this.offsetY + (y + 0.5) * cs;

        if (tile === 'tree') {
          const sway = Math.sin(t * 1.8 + x + y) * cs * 0.03;
          ctx.fillStyle = night ? '#064e3b' : '#22c55e';
          ctx.beginPath();
          ctx.arc(cx - cs * 0.14 + sway, cy + cs * 0.06, cs * 0.25, 0, Math.PI * 2);
          ctx.arc(cx + cs * 0.16 + sway, cy + cs * 0.08, cs * 0.22, 0, Math.PI * 2);
          ctx.arc(cx + sway, cy - cs * 0.14, cs * 0.26, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = night ? '#047857' : '#4ade80';
          ctx.beginPath();
          ctx.arc(cx + sway, cy - cs * 0.12, cs * 0.15, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === 'rock') {
          ctx.fillStyle = night ? '#334155' : '#a8a29e';
          this.roundRect(ctx, cx - cs * 0.36, cy - cs * 0.32, cs * 0.72, cs * 0.64, cs * 0.18);
          ctx.fill();

          ctx.fillStyle = night ? '#475569' : '#d6d3d1';
          this.roundRect(ctx, cx - cs * 0.24, cy - cs * 0.22, cs * 0.42, cs * 0.3, cs * 0.12);
          ctx.fill();
        }
      }
    }
  }

  private renderRoads(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    const lookup = sim.getLookup();

    const curveSkipEdges = new Set<string>();
    const curves: Array<{ ax: number; ay: number; cx: number; cy: number; bx: number; by: number }> = [];

    for (const [key, neighbors] of sim.network.adjacency) {
      if (neighbors.size !== 2) continue;
      if (lookup.houseByCell.has(key) || lookup.marketByCell.has(key)) continue;
      if (sim.network.lights.has(key) || sim.network.roundabouts.has(key)) continue;

      const [cxStr, cyStr] = key.split(',');
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      if (sim.map.tiles[cy][cx] === 'water') continue;

      const [na, nb] = Array.from(neighbors);
      const [ax, ay] = na.split(',').map(Number);
      const [bx, by] = nb.split(',').map(Number);

      if (sim.map.tiles[ay][ax] === 'water' || sim.map.tiles[by][bx] === 'water') continue;

      const v1x = ax - cx;
      const v1y = ay - cy;
      const v2x = bx - cx;
      const v2y = by - cy;
      if (v1x * v2y - v1y * v2x !== 0) {
        curves.push({
          ax: (ax + cx) * 0.5,
          ay: (ay + cy) * 0.5,
          cx,
          cy,
          bx: (bx + cx) * 0.5,
          by: (by + cy) * 0.5,
        });
        curveSkipEdges.add(this.canonical(cx, cy, ax, ay));
        curveSkipEdges.add(this.canonical(cx, cy, bx, by));
      }
    }

    const drawRoadStroke = (width: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (const ek of sim.network.edges) {
        const [a, b] = parseEdgeKey(ek);
        const key = this.canonical(a.x, a.y, b.x, b.y);
        if (curveSkipEdges.has(key)) {
          const pA = this.gridToCenter(a.x, a.y);
          const pB = this.gridToCenter(b.x, b.y);
          const midX = (pA.x + pB.x) * 0.5;
          const midY = (pA.y + pB.y) * 0.5;
          const aIsCurved = this.isNodeInCurves(a.x, a.y, curves);
          const bIsCurved = this.isNodeInCurves(b.x, b.y, curves);
          if (!aIsCurved) {
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(midX, midY);
          }
          if (!bIsCurved) {
            ctx.moveTo(pB.x, pB.y);
            ctx.lineTo(midX, midY);
          }
          continue;
        }
        const pA = this.gridToCenter(a.x, a.y);
        const pB = this.gridToCenter(b.x, b.y);
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
      }

      for (const c of curves) {
        const pA = this.gridToCenter(c.ax, c.ay);
        const pC = this.gridToCenter(c.cx, c.cy);
        const pB = this.gridToCenter(c.bx, c.by);
        ctx.moveTo(pA.x, pA.y);
        ctx.quadraticCurveTo(pC.x, pC.y, pB.x, pB.y);
      }

      ctx.stroke();
    };

    for (const ek of sim.network.edges) {
      const [a, b] = parseEdgeKey(ek);
      if (sim.map.tiles[a.y][a.x] === 'water' || sim.map.tiles[b.y][b.x] === 'water') {
        const pA = this.gridToCenter(a.x, a.y);
        const pB = this.gridToCenter(b.x, b.y);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.lineWidth = cs * 0.66;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y + cs * 0.08);
        ctx.lineTo(pB.x, pB.y + cs * 0.08);
        ctx.stroke();

        ctx.strokeStyle = night ? '#92400e' : '#d97706';
        ctx.lineWidth = cs * 0.62;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    }

    drawRoadStroke(cs * 0.48, night ? '#1e293b' : '#cbd5e1');
    drawRoadStroke(cs * 0.36, night ? '#334155' : '#475569');
  }

  private renderRoadPreview(
    ctx: CanvasRenderingContext2D,
    preview: RoadPathPreview,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const seg of preview.segments) {
      const pA = this.gridToCenter(seg.ax, seg.ay);
      const pB = this.gridToCenter(seg.bx, seg.by);

      if (seg.isBridge) {
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = seg.valid ? '#d97706' : '#ef4444';
        ctx.lineWidth = cs * 0.58;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = seg.valid
        ? night
          ? '#fbbf24'
          : '#f97316'
        : '#ef4444';
      ctx.lineWidth = cs * 0.36;
      ctx.setLineDash([cs * 0.22, cs * 0.14]);
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Cost pill near the end of the drag preview
    const lastSeg = preview.segments[preview.segments.length - 1];
    if (lastSeg) {
      const endPt = this.gridToCenter(lastSeg.bx, lastSeg.by);
      const parts: string[] = [];
      if (preview.roadsCost > 0) parts.push(`🛣️ -${preview.roadsCost}`);
      if (preview.bridgesCost > 0) parts.push(`🌉 -${preview.bridgesCost}`);
      if (!preview.valid && preview.reason) {
        parts.length = 0;
        parts.push(`❌ ${preview.reason}`);
      } else if (preview.reason && parts.length > 0) {
        parts.push(`⚠️ ${preview.reason}`);
      }

      if (parts.length > 0) {
        const label = parts.join('  ');
        this.drawCostBadge(
          ctx,
          endPt.x,
          endPt.y - cs * 0.75,
          label,
          preview.valid ? '#facc15' : '#fb7185',
        );
      }
    }

    ctx.restore();
  }

  private drawCostBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    accent: string,
  ): void {
    ctx.save();
    ctx.font = '800 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 16;
    const h = 22;
    const clampedX = Math.max(w / 2 + 8, Math.min(this.width - w / 2 - 8, x));
    const clampedY = Math.max(h + 8, y);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    this.roundRect(ctx, clampedX - w / 2, clampedY - h / 2, w, h, 11);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, clampedX, clampedY + 0.5);
    ctx.restore();
  }

  private isNodeInCurves(
    x: number,
    y: number,
    curves: Array<{ cx: number; cy: number }>,
  ): boolean {
    return curves.some((c) => c.cx === x && c.cy === y);
  }

  private canonical(ax: number, ay: number, bx: number, by: number): string {
    return ax < bx || (ax === bx && ay <= by) ? `${ax},${ay}-${bx},${by}` : `${bx},${by}-${ax},${ay}`;
  }

  private renderRoundabouts(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    for (const r of sim.network.roundabouts.values()) {
      const c = this.gridToCenter(r.x, r.y);
      ctx.fillStyle = night ? '#1e293b' : '#cbd5e1';
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.56, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = night ? '#334155' : '#475569';
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.48, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHouseBody(ctx: CanvasRenderingContext2D, shape: BuildingShape, r: number): void {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    } else if (shape === 'diamond') {
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 1.12, 0);
      ctx.lineTo(0, r * 1.15);
      ctx.lineTo(-r * 1.12, 0);
      ctx.closePath();
    } else if (shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(a) * r * 1.08;
        const py = Math.sin(a) * r * 1.08;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (shape === 'pentagon') {
      for (let i = 0; i < 5; i++) {
        const a = ((Math.PI * 2) / 5) * i - Math.PI / 2;
        const px = Math.cos(a) * r * 1.1;
        const py = Math.sin(a) * r * 1.1;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      // Octagon / rounded square
      this.roundRect(ctx, -r, -r, r * 2, r * 2, r * 0.42);
    }
  }

  private renderHouses(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    for (const h of sim.houses) {
      const theme = MONKEY_COLORS[h.color];
      const c = this.gridToCenter(h.x, h.y);
      const s = this.easeOutBack(h.spawnAnim);
      const r = cs * 0.36;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(s, s);

      // Ground shadow
      ctx.save();
      ctx.translate(0, cs * 0.05);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      this.drawHouseBody(ctx, theme.shape, r);
      ctx.fill();
      ctx.restore();

      // House distinct shape body with subtle gradient
      const hGrad = ctx.createLinearGradient(-r, -r, r, r);
      hGrad.addColorStop(0, theme.light);
      hGrad.addColorStop(0.28, theme.fill);
      hGrad.addColorStop(1, theme.roof);
      ctx.fillStyle = hGrad;
      ctx.strokeStyle = theme.dark;
      ctx.lineWidth = Math.max(2, cs * 0.06);
      this.drawHouseBody(ctx, theme.shape, r);
      ctx.fill();
      ctx.stroke();

      // Inner cozy roof trim
      ctx.fillStyle = night ? 'rgba(15,23,42,0.22)' : 'rgba(255,255,255,0.24)';
      this.drawHouseBody(ctx, theme.shape, r * 0.68);
      ctx.fill();

      // Fruit symbol inside house for instant colorblind / visual clarity
      ctx.font = `${Math.max(10, Math.floor(cs * 0.31))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(theme.fruitEmoji, -cs * 0.09, -cs * 0.08);

      // Tiny minimalist monkey peeking from the house porch
      this.drawHouseMonkeyPeek(ctx, cs * 0.14, -cs * 0.08, cs * 0.11, sim.timeSec + h.x * 0.7, h.carsParked > 0);

      // Parked mini-cars pips
      for (let i = 0; i < h.carsParked; i++) {
        const px = -cs * 0.11 + i * cs * 0.22;
        const py = cs * 0.21;
        ctx.fillStyle = night ? '#f8fafc' : '#1e293b';
        this.roundRect(ctx, px - cs * 0.075, py - cs * 0.045, cs * 0.15, cs * 0.09, cs * 0.03);
        ctx.fill();
        ctx.fillStyle = theme.light;
        ctx.fillRect(px - cs * 0.02, py - cs * 0.03, cs * 0.05, cs * 0.06);
      }

      ctx.restore();
    }
  }

  private renderMarkets(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    for (const m of sim.markets) {
      const theme = MONKEY_COLORS[m.color];
      const cx = this.offsetX + (m.x + 1) * cs;
      const cy = this.offsetY + (m.y + 1) * cs;
      const s = this.easeOutBack(m.spawnAnim);
      const w = cs * 1.72;
      const h = cs * 1.72;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);

      if (night) {
        ctx.shadowColor = theme.fill;
        ctx.shadowBlur = 16;
      }

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      this.roundRect(ctx, -w / 2 + 2, -h / 2 + 4, w, h, cs * 0.28);
      ctx.fill();

      // Main building
      ctx.fillStyle = night ? '#1e293b' : '#ffffff';
      ctx.strokeStyle = theme.fill;
      ctx.lineWidth = Math.max(3, cs * 0.1);
      this.roundRect(ctx, -w / 2, -h / 2, w, h, cs * 0.26);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Colored awning header
      ctx.fillStyle = theme.fill;
      this.roundRect(ctx, -w / 2 + cs * 0.12, -h / 2 + cs * 0.12, w - cs * 0.24, cs * 0.42, cs * 0.12);
      ctx.fill();

      // Shape emblem in awning corner for extra accessibility clarity
      ctx.save();
      ctx.translate(-w / 2 + cs * 0.32, -h / 2 + cs * 0.33);
      ctx.fillStyle = theme.dark;
      this.drawHouseBody(ctx, theme.shape, cs * 0.11);
      ctx.fill();
      ctx.restore();

      // Fruit icon
      ctx.font = `${Math.floor(cs * 0.62)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(theme.fruitEmoji, 0, cs * 0.18);

      if (m.isMega) {
        ctx.font = `800 ${Math.max(9, Math.floor(cs * 0.24))}px system-ui, sans-serif`;
        ctx.fillStyle = theme.dark;
        ctx.fillText('MEGA', cs * 0.08, -h / 2 + cs * 0.34);
      }

      // Demand pins — flip BELOW market when m.y <= 1 so pins never clip off-screen!
      const flipPinsBelow = m.y <= 1;
      const pinRadius = Math.max(3.5, cs * 0.11);
      for (let i = 0; i < m.pins.length; i++) {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const px = -cs * 0.56 + col * (pinRadius * 2.45);
        const py = flipPinsBelow
          ? h / 2 + cs * 0.2 + row * (pinRadius * 2.3)
          : -h / 2 - cs * 0.14 - row * (pinRadius * 2.3);
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(px, py, pinRadius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.fill;
        ctx.beginPath();
        ctx.arc(px, py, pinRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Overload Danger Ring
      if (m.overload > 0.02) {
        const pulse = 1 + Math.sin(sim.timeSec * 9) * 0.05;
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.lineWidth = Math.max(4, cs * 0.14);
        ctx.beginPath();
        ctx.arc(0, 0, cs * 1.05, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = m.overload > 0.7 ? '#ef4444' : '#f97316';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          cs * 1.05,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.overload),
        );
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  private renderCriticalMarketAlerts(ctx: CanvasRenderingContext2D, sim: TrafficSimulation): void {
    const cs = this.cellSize;
    const t = sim.timeSec;

    for (const m of sim.markets) {
      if (m.overload < 0.45) continue;
      const cx = this.offsetX + (m.x + 1) * cs;
      const cy = this.offsetY + (m.y + 1) * cs;
      const urgent = m.overload >= 0.72;

      // Expanding urgent radar pulse ring
      const wavePhase = (t * (urgent ? 1.8 : 1.1)) % 1;
      ctx.save();
      ctx.strokeStyle = urgent
        ? `rgba(239, 68, 68, ${(1 - wavePhase) * 0.75})`
        : `rgba(249, 115, 22, ${(1 - wavePhase) * 0.55})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * (1.1 + wavePhase * 1.15), 0, Math.PI * 2);
      ctx.stroke();

      // Bouncing arrow + countdown alert badge
      const bounce = Math.sin(t * (urgent ? 12 : 7)) * cs * 0.14;
      const flipBelow = m.y <= 2;
      const arrowY = flipBelow ? cy + cs * 1.45 - bounce : cy - cs * 1.55 + bounce;
      const pct = Math.min(99, Math.round(m.overload * 100));

      const pillText = urgent ? `🚨 SOS ${pct}%` : `⚠️ ${pct}%`;
      ctx.font = '900 11px system-ui, sans-serif';
      const pw = ctx.measureText(pillText).width + 14;
      const pillY = flipBelow ? arrowY + 18 : arrowY - 18;

      ctx.fillStyle = urgent ? '#dc2626' : '#ea580c';
      this.roundRect(ctx, cx - pw / 2, pillY - 10, pw, 20, 10);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillText, cx, pillY + 0.5);

      // Pointer triangle toward the market
      ctx.fillStyle = urgent ? '#ef4444' : '#f97316';
      ctx.beginPath();
      if (flipBelow) {
        ctx.moveTo(cx, arrowY - 6);
        ctx.lineTo(cx - 7, arrowY + 5);
        ctx.lineTo(cx + 7, arrowY + 5);
      } else {
        ctx.moveTo(cx, arrowY + 6);
        ctx.lineTo(cx - 7, arrowY - 5);
        ctx.lineTo(cx + 7, arrowY - 5);
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  private renderTrafficLights(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    for (const light of sim.network.lights.values()) {
      const c = this.gridToCenter(light.x, light.y);

      ctx.fillStyle = night ? '#020617' : '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const nsColor = light.phase === 0 ? '#4ade80' : '#ef4444';
      const ewColor = light.phase === 1 ? '#4ade80' : '#ef4444';

      ctx.fillStyle = nsColor;
      ctx.beginPath();
      ctx.arc(c.x, c.y - cs * 0.1, cs * 0.055, 0, Math.PI * 2);
      ctx.arc(c.x, c.y + cs * 0.1, cs * 0.055, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = ewColor;
      ctx.beginPath();
      ctx.arc(c.x - cs * 0.1, c.y, cs * 0.055, 0, Math.PI * 2);
      ctx.arc(c.x + cs * 0.1, c.y, cs * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawVineCurve(
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    ghost: boolean,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    const pA = this.gridToCenter(ax, ay);
    const pB = this.gridToCenter(bx, by);
    const dist = Math.hypot(bx - ax, by - ay);
    const arcLift = Math.min(cs * 3.5, dist * cs * 0.24);
    const mx = (pA.x + pB.x) * 0.5;
    const my = (pA.y + pB.y) * 0.5 - arcLift;

    ctx.save();
    if (ghost) ctx.globalAlpha = 0.65;

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = cs * 0.34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y + cs * 0.14);
    ctx.quadraticCurveTo(mx, my + arcLift * 0.45 + cs * 0.14, pB.x, pB.y + cs * 0.14);
    ctx.stroke();

    ctx.strokeStyle = night ? '#14532d' : '#166534';
    ctx.lineWidth = cs * 0.38;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
    ctx.stroke();

    ctx.strokeStyle = '#84cc16';
    ctx.lineWidth = cs * 0.24;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
    ctx.stroke();

    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = cs * 0.09;
    ctx.setLineDash([cs * 0.22, cs * 0.18]);
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const pt of [pA, pB]) {
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cs * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bef264';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cs * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderMotorways(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    uiState: RenderInteractionState,
    night: boolean,
  ): void {
    for (const mw of sim.network.motorways) {
      this.drawVineCurve(ctx, mw.ax, mw.ay, mw.bx, mw.by, false, night);
    }

    if (uiState.activeTool === 'motorway' && uiState.motorwayAnchor && uiState.hoverCell) {
      this.drawVineCurve(
        ctx,
        uiState.motorwayAnchor.x,
        uiState.motorwayAnchor.y,
        uiState.hoverCell.x,
        uiState.hoverCell.y,
        true,
        night,
      );
      const check = sim.network.canAddMotorway(
        uiState.motorwayAnchor.x,
        uiState.motorwayAnchor.y,
        uiState.hoverCell.x,
        uiState.hoverCell.y,
        sim.map,
        sim.getLookup(),
        sim.inventory,
      );
      const endPt = this.gridToCenter(uiState.hoverCell.x, uiState.hoverCell.y);
      this.drawCostBadge(
        ctx,
        endPt.x,
        endPt.y - this.cellSize * 0.72,
        check.ok ? '🌿 -1 Cipó Express' : `❌ ${check.reason ?? 'Ponto inválido'}`,
        check.ok ? '#bef264' : '#fb7185',
      );
    }
  }

  private renderCars(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
    elevatedOnly: boolean,
  ): void {
    const cs = this.cellSize;
    for (const car of sim.cars) {
      if (car.state === 'atMarket') continue;
      const step = car.path[car.segIndex + 1];
      const onMw = car.isOnMotorway ?? Boolean(step?.isMotorway);
      if (onMw !== elevatedOnly) continue;

      const theme = MONKEY_COLORS[car.color];
      const renderX = car.x + (car.vxOffset ?? 0);
      const renderY = car.y + (car.vyOffset ?? 0);
      const renderAngle = car.angle + (car.vAngleOffset ?? 0);
      const rageJitter =
        car.rage > 0.35 ? Math.sin(sim.timeSec * 38 + renderX * 5) * cs * 0.025 * car.rage : 0;
      const px = this.offsetX + renderX * cs + rageJitter;
      const py = this.offsetY + renderY * cs;
      const carW = cs * 0.48;
      const carH = cs * 0.31;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(renderAngle);

      if (night) {
        const grad = ctx.createRadialGradient(carW * 0.5, 0, 1, carW * 1.9, 0, cs * 0.9);
        grad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
        grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(carW * 0.4, -carH * 0.35);
        ctx.lineTo(carW * 2.4, -carH * 1.4);
        ctx.lineTo(carW * 2.4, carH * 1.4);
        ctx.lineTo(carW * 0.4, carH * 0.35);
        ctx.closePath();
        ctx.fill();
      }

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      this.roundRect(ctx, -carW / 2 + 1, -carH / 2 + 2, carW, carH, cs * 0.09);
      ctx.fill();

      // Wagging curved tail sticking out the back of the convertible
      const tailWag =
        car.rage > 0.35
          ? Math.sin(sim.timeSec * 28 + renderX) * cs * 0.06
          : Math.sin(sim.timeSec * 8 + renderX) * cs * 0.045;
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = Math.max(1.8, cs * 0.06);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-carW * 0.42, 0);
      ctx.quadraticCurveTo(-carW * 0.64, tailWag, -carW * 0.72, -cs * 0.08 + tailWag);
      ctx.stroke();

      // Car body with 2-tone gradient shading
      const cGrad = ctx.createLinearGradient(0, -carH / 2, 0, carH / 2);
      cGrad.addColorStop(0, theme.light);
      cGrad.addColorStop(0.32, theme.fill);
      cGrad.addColorStop(1, theme.roof);
      ctx.fillStyle = cGrad;
      ctx.strokeStyle = theme.dark;
      ctx.lineWidth = Math.max(1.5, cs * 0.045);
      this.roundRect(ctx, -carW / 2, -carH / 2, carW, carH, cs * 0.09);
      ctx.fill();
      ctx.stroke();

      // Open-top cockpit + windshield glass
      ctx.fillStyle = 'rgba(15, 23, 42, 0.32)';
      this.roundRect(ctx, -carW * 0.28, -carH * 0.36, carW * 0.44, carH * 0.72, cs * 0.05);
      ctx.fill();
      ctx.fillStyle = night ? '#38bdf8' : '#bae6fd';
      this.roundRect(ctx, carW * 0.14, -carH * 0.34, carW * 0.12, carH * 0.68, cs * 0.03);
      ctx.fill();

      // Headlights
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(carW * 0.44, -carH * 0.34, 2, carH * 0.2);
      ctx.fillRect(carW * 0.44, carH * 0.14, 2, carH * 0.2);

      if (car.speed < 0.45) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-carW / 2 - 1, -carH * 0.35, 2.5, carH * 0.25);
        ctx.fillRect(-carW / 2 - 1, carH * 0.1, 2.5, carH * 0.25);
      }

      // Honk sound-wave arcs when furious
      if (car.moodTimer > 0.6 && car.rage > 0.15) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(carW * 0.56, 0, cs * 0.17, -0.7, 0.7);
        ctx.stroke();
      }

      // Expressive Minimalist Monkey Driver Head (top-3/4 view facing +X)
      const headR = cs * 0.135;
      const hx = carW * 0.02;
      const earJitter = car.rage > 0.35 ? Math.sin(sim.timeSec * 30) * headR * 0.09 : 0;
      const blink = (sim.timeSec + (car.homeHouseId.charCodeAt(0) || 0) * 0.37) % 4.1 > 3.96;

      // Ears with rosy inner ear
      for (const side of [-1, 1] as const) {
        const ey = side * (headR * 0.94 + earJitter);
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = Math.max(1, cs * 0.03);
        ctx.beginPath();
        ctx.arc(hx - headR * 0.12, ey, headR * 0.48, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fda4af';
        ctx.beginPath();
        ctx.arc(hx - headR * 0.05, ey * 0.96, headR * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }

      // Head fur with radial gradient + outline
      const fGrad = ctx.createRadialGradient(hx + headR * 0.2, -headR * 0.2, 1, hx, 0, headR);
      fGrad.addColorStop(0, '#b45309');
      fGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = fGrad;
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = Math.max(1.1, cs * 0.035);
      ctx.beginPath();
      ctx.arc(hx, 0, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Peanut / heart face mask oriented toward +X
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.ellipse(hx + headR * 0.38, -headR * 0.24, headR * 0.44, headR * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + headR * 0.38, headR * 0.24, headR * 0.44, headR * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + headR * 0.56, 0, headR * 0.36, headR * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyes (blinking, tracking, or furious)
      const eyeX = hx + headR * 0.36;
      const eyeY = headR * 0.34;
      for (const side of [-1, 1] as const) {
        if (blink && car.rage < 0.35) {
          ctx.strokeStyle = '#451a03';
          ctx.lineWidth = Math.max(1, cs * 0.03);
          ctx.beginPath();
          ctx.moveTo(eyeX - headR * 0.12, side * eyeY - headR * 0.14);
          ctx.lineTo(eyeX + headR * 0.12, side * eyeY + headR * 0.14);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(eyeX, side * eyeY, headR * 0.28, 0, Math.PI * 2);
          ctx.fill();

          const lookShift = car.speed < 0.45 ? -headR * 0.04 : headR * 0.08;
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(eyeX + lookShift, side * eyeY, headR * 0.14, 0, Math.PI * 2);
          ctx.fill();

          // Eye specular highlight
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(eyeX + lookShift - headR * 0.04, side * eyeY - headR * 0.05, Math.max(0.7, headR * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Angry furrowed eyebrows when stuck/raging
      if (car.rage > 0.25 || car.speed < 0.45) {
        ctx.strokeStyle = car.rage > 0.45 ? '#991b1b' : '#451a03';
        ctx.lineWidth = Math.max(1.1, cs * 0.035);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(eyeX - headR * 0.16, -eyeY - headR * 0.24);
        ctx.lineTo(eyeX + headR * 0.16, -headR * 0.08);
        ctx.moveTo(eyeX - headR * 0.16, eyeY + headR * 0.24);
        ctx.lineTo(eyeX + headR * 0.16, headR * 0.08);
        ctx.stroke();
      }

      // Expressive mouth at front of muzzle
      const mx = hx + headR * 0.72;
      if (car.rage > 0.4) {
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(mx, 0, headR * 0.18, headR * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (onMw) {
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.arc(mx - headR * 0.05, 0, headR * 0.22, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = Math.max(0.9, cs * 0.025);
        ctx.beginPath();
        ctx.arc(mx - headR * 0.1, 0, headR * 0.16, -0.7, 0.7);
        ctx.stroke();
      }

      // Subtle color-faction headband/cap flair on crown of monkey head
      ctx.fillStyle = theme.fill;
      ctx.strokeStyle = theme.dark;
      ctx.lineWidth = Math.max(0.8, cs * 0.022);
      ctx.beginPath();
      ctx.arc(hx - headR * 0.35, 0, headR * 0.55, Math.PI * 0.6, Math.PI * 1.4);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Comic Speech Bubble when honking / stuck / confused
      if (car.moodEmoji && car.moodTimer > 0) {
        ctx.save();
        const isShortEmoji = car.moodEmoji.length <= 3;
        ctx.font = isShortEmoji
          ? `${Math.max(12, Math.floor(cs * 0.36))}px system-ui, sans-serif`
          : `800 10px system-ui, sans-serif`;
        const padX = isShortEmoji ? 8 : 10;
        const bw = ctx.measureText(car.moodEmoji).width + padX * 2;
        const bh = 20;
        const bx = Math.max(bw / 2 + 4, Math.min(this.width - bw / 2 - 4, px));
        const by = Math.max(bh + 6, py - cs * 0.62);

        ctx.globalAlpha = Math.min(1, car.moodTimer * 2.2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = car.rage > 0.4 ? '#ef4444' : '#334155';
        ctx.lineWidth = 1.6;
        this.roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 9);
        ctx.fill();
        ctx.stroke();

        // Tail
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(bx - 4, by + bh / 2 - 1);
        ctx.lineTo(bx + 4, by + bh / 2 - 1);
        ctx.lineTo(px, Math.min(by + bh / 2 + 6, py - cs * 0.25));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(car.moodEmoji, bx, by + 0.5);
        ctx.restore();
      }
    }
  }

  private renderPings(ctx: CanvasRenderingContext2D, sim: TrafficSimulation): void {
    const cs = this.cellSize;
    for (const ping of sim.pings) {
      const c = this.gridToCenter(ping.gx, ping.gy);
      const age = ping.maxLife - ping.life;
      const alpha = Math.min(1, ping.life / 0.8);
      const pulse = (age * 1.4) % 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Concentric expanding ring
      ctx.strokeStyle = ping.playerColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * (0.35 + pulse * 0.85), 0, Math.PI * 2);
      ctx.stroke();

      // Center beacon
      ctx.fillStyle = ping.playerColor;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.16, 0, Math.PI * 2);
      ctx.fill();

      // Floating banner
      const bounce = Math.abs(Math.sin(age * 6)) * 4;
      const label = `${ping.emoji} ${ping.text}`;
      ctx.font = '800 11px system-ui, sans-serif';
      const w = Math.max(ctx.measureText(label).width, ctx.measureText(ping.playerName).width) + 18;
      const bx = Math.max(w / 2 + 6, Math.min(this.width - w / 2 - 6, c.x));
      const by = Math.max(36, c.y - cs * 0.85 - bounce);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      this.roundRect(ctx, bx - w / 2, by - 18, w, 32, 10);
      ctx.fill();
      ctx.strokeStyle = ping.playerColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx, by - 6);

      ctx.font = '700 9px system-ui, sans-serif';
      ctx.fillStyle = ping.playerColor;
      ctx.fillText(ping.playerName, bx, by + 7);
      ctx.restore();
    }
  }

  private renderHoverPreview(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    uiState: RenderInteractionState,
    night: boolean,
  ): void {
    if (!uiState.hoverCell || sim.phase !== 'playing') return;
    const { x, y } = uiState.hoverCell;
    const cs = this.cellSize;
    const px = this.offsetX + x * cs;
    const py = this.offsetY + y * cs;

    const tile = sim.map.tiles[y]?.[x];
    const blocked = tile === 'tree' || tile === 'rock';

    ctx.save();
    ctx.strokeStyle =
      uiState.activeTool === 'erase'
        ? '#ef4444'
        : uiState.activeTool === 'ping'
          ? '#38bdf8'
          : blocked
            ? '#ef4444'
            : night
              ? '#facc15'
              : '#f97316';
    ctx.lineWidth = 2.5;
    this.roundRect(ctx, px + 2, py + 2, cs - 4, cs - 4, 6);
    ctx.stroke();

    if (uiState.activeTool !== 'road') {
      ctx.font = `${Math.floor(cs * 0.44)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText(TOOL_META[uiState.activeTool].icon, px + cs / 2, py + cs / 2);
    }
    ctx.restore();
  }

  private renderRemoteCursors(
    ctx: CanvasRenderingContext2D,
    uiState: RenderInteractionState,
  ): void {
    const cs = this.cellSize;
    const now = performance.now();
    for (const cur of uiState.remoteCursors) {
      if (now - cur.lastSeen > 5000) continue;
      const c = this.gridToCenter(cur.gx, cur.gy);

      ctx.save();
      ctx.strokeStyle = cur.color;
      ctx.lineWidth = cur.drawing ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cs * 0.36, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '700 11px system-ui, sans-serif';
      const label = `${TOOL_META[cur.tool].icon} ${cur.name}`;
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
      this.roundRect(ctx, c.x - tw / 2, c.y - cs * 0.72, tw, 18, 9);
      ctx.fill();
      ctx.strokeStyle = cur.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = cur.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c.x, c.y - cs * 0.72 + 9);
      ctx.restore();
    }
  }

  private renderParticlesAndTexts(ctx: CanvasRenderingContext2D, sim: TrafficSimulation): void {
    const cs = this.cellSize;
    for (const p of sim.particles) {
      const px = this.offsetX + p.x * cs;
      const py = this.offsetY + p.y * cs;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.emoji) {
        ctx.font = `${Math.floor(cs * 0.45)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, px, py);
      } else if (p.isConfetti) {
        ctx.translate(px, py);
        ctx.rotate(p.rot ?? 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const f of sim.floatingTexts) {
      const px = this.offsetX + f.x * cs;
      const py = this.offsetY + f.y * cs;
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.font = `900 ${Math.max(12, Math.floor(cs * 0.36))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(f.text, px, py);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, px, py);
      ctx.restore();
    }
  }

  private drawHouseMonkeyPeek(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    phase: number,
    happy: boolean,
  ): void {
    const bob = happy ? Math.sin(phase * 4) * r * 0.16 : 0;
    const blink = phase % 4.4 > 4.26;
    ctx.save();
    ctx.translate(x, y + bob);

    // Ears
    for (const ex of [-r * 0.95, r * 0.95]) {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = Math.max(0.8, r * 0.22);
      ctx.beginPath();
      ctx.arc(ex, 0, r * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(ex, r * 0.04, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = Math.max(0.9, r * 0.24);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Peanut mask
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.28, r * 0.72, r * 0.48, 0, 0, Math.PI * 2);
    ctx.arc(-r * 0.3, -r * 0.14, r * 0.34, 0, Math.PI * 2);
    ctx.arc(r * 0.3, -r * 0.14, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    if (blink) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(0.8, r * 0.2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.16);
      ctx.lineTo(-r * 0.15, -r * 0.16);
      ctx.moveTo(r * 0.15, -r * 0.16);
      ctx.lineTo(r * 0.45, -r * 0.16);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.16, r * 0.17, 0, Math.PI * 2);
      ctx.arc(r * 0.3, -r * 0.16, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.22, Math.max(0.5, r * 0.07), 0, Math.PI * 2);
      ctx.arc(r * 0.25, -r * 0.22, Math.max(0.5, r * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }

    // Smile
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(0.8, r * 0.18);
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r * 0.28, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.restore();
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  private roundRect(
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
}
