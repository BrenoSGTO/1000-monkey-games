import { GRID_COLS, GRID_ROWS, MONKEY_COLORS, TOOL_META } from './constants';
import { cellKey, parseEdgeKey } from './roadNetwork';
import type { TrafficSimulation } from './simulation';
import type { GridCoord, RemoteCursor, ToolKind } from './types';

export interface RenderInteractionState {
  hoverCell: GridCoord | null;
  activeTool: ToolKind;
  motorwayAnchor: GridCoord | null;
  nightMode: boolean;
  remoteCursors: RemoteCursor[];
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
    const bottomClear = 94;
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

    // Background fill outside board
    ctx.fillStyle = night ? '#090e1a' : '#ebe7d8';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    if (sim.shake > 0) {
      const mag = sim.shake * 10;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // Board surface
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

    // Roads & Bridges
    this.renderRoads(ctx, sim, night);

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

    // Tool hover preview & Remote co-op cursors
    this.renderHoverPreview(ctx, sim, uiState, night);
    this.renderRemoteCursors(ctx, uiState);

    // Particles & Floating Texts
    this.renderParticlesAndTexts(ctx, sim);

    ctx.restore();
  }

  private renderTerrain(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    night: boolean,
  ): void {
    const cs = this.cellSize;
    const t = sim.timeSec;

    // Pass 1: Water tiles with rounded shorelines feel
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const tile = sim.map.tiles[y][x];
        if (tile !== 'water') continue;

        const px = this.offsetX + x * cs;
        const py = this.offsetY + y * cs;

        // Shoreline foam border
        ctx.fillStyle = night ? '#164e63' : '#bae6fd';
        ctx.fillRect(px - 2, py - 2, cs + 4, cs + 4);

        ctx.fillStyle = night ? '#0c4a6e' : '#38bdf8';
        ctx.fillRect(px, py, cs + 0.5, cs + 0.5);

        // Animated water ripple
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

    // Pass 2: Trees & Rocks
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

    // Collect edges + curved degree-2 nodes
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

      // Only curve if non-collinear
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
        // Draw half-stubs from a -> mid(a,c) and b -> mid(b,c), skipping full straight edges
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
          // Draw half-stub only for ends that aren't curved
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

    // Draw bridge planks UNDER asphalt for edges touching water
    for (const ek of sim.network.edges) {
      const [a, b] = parseEdgeKey(ek);
      if (sim.map.tiles[a.y][a.x] === 'water' || sim.map.tiles[b.y][b.x] === 'water') {
        const pA = this.gridToCenter(a.x, a.y);
        const pB = this.gridToCenter(b.x, b.y);
        // Bamboo railing shadow
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.lineWidth = cs * 0.66;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y + cs * 0.08);
        ctx.lineTo(pB.x, pB.y + cs * 0.08);
        ctx.stroke();

        // Bamboo deck
        ctx.strokeStyle = night ? '#92400e' : '#d97706';
        ctx.lineWidth = cs * 0.62;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    }

    // Outer road curb + inner asphalt
    drawRoadStroke(cs * 0.48, night ? '#1e293b' : '#cbd5e1');
    drawRoadStroke(cs * 0.36, night ? '#334155' : '#475569');
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

      // Green center island
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

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(s, s);

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      this.roundRect(ctx, -cs * 0.35, -cs * 0.31, cs * 0.7, cs * 0.7, cs * 0.16);
      ctx.fill();

      // House body
      ctx.fillStyle = theme.fill;
      ctx.strokeStyle = theme.dark;
      ctx.lineWidth = Math.max(2, cs * 0.06);
      this.roundRect(ctx, -cs * 0.35, -cs * 0.35, cs * 0.7, cs * 0.7, cs * 0.16);
      ctx.fill();
      ctx.stroke();

      // Roof / hut cap
      ctx.fillStyle = theme.light;
      ctx.beginPath();
      ctx.moveTo(0, -cs * 0.25);
      ctx.lineTo(cs * 0.24, -cs * 0.03);
      ctx.lineTo(-cs * 0.24, -cs * 0.03);
      ctx.closePath();
      ctx.fill();

      // Parked car pips
      for (let i = 0; i < h.carsParked; i++) {
        ctx.fillStyle = night ? '#f8fafc' : '#1e293b';
        ctx.beginPath();
        ctx.arc(-cs * 0.1 + i * cs * 0.2, cs * 0.14, cs * 0.065, 0, Math.PI * 2);
        ctx.fill();
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

      // Night neon glow
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

      // Fruit icon
      ctx.font = `${Math.floor(cs * 0.62)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(theme.fruitEmoji, 0, cs * 0.16);

      if (m.isMega) {
        ctx.font = `800 ${Math.max(9, Math.floor(cs * 0.24))}px system-ui, sans-serif`;
        ctx.fillStyle = theme.dark;
        ctx.fillText('MEGA', 0, -h / 2 + cs * 0.34);
      }

      // Demand pins neatly stacked along top-right / bottom
      const pinRadius = Math.max(3.5, cs * 0.11);
      for (let i = 0; i < m.pins.length; i++) {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const px = -cs * 0.56 + col * (pinRadius * 2.45);
        const py = -h / 2 - cs * 0.14 - row * (pinRadius * 2.3);
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

        if (m.overload > 0.45) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(w / 2, -h / 2, cs * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `900 ${Math.floor(cs * 0.3)}px system-ui, sans-serif`;
          ctx.fillText('!', w / 2, -h / 2 + 1);
        }
        ctx.restore();
      }

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

      // Phase 0: N/S Green, E/W Red. Phase 1: N/S Red, E/W Green
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

  private renderMotorways(
    ctx: CanvasRenderingContext2D,
    sim: TrafficSimulation,
    uiState: RenderInteractionState,
    night: boolean,
  ): void {
    const cs = this.cellSize;

    const drawVine = (ax: number, ay: number, bx: number, by: number, ghost = false) => {
      const pA = this.gridToCenter(ax, ay);
      const pB = this.gridToCenter(bx, by);
      const dist = Math.hypot(bx - ax, by - ay);
      const arcLift = Math.min(cs * 3.5, dist * cs * 0.24);
      const mx = (pA.x + pB.x) * 0.5;
      const my = (pA.y + pB.y) * 0.5 - arcLift;

      ctx.save();
      if (ghost) ctx.globalAlpha = 0.65;

      // Ground shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = cs * 0.34;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y + cs * 0.14);
      ctx.quadraticCurveTo(mx, my + arcLift * 0.45 + cs * 0.14, pB.x, pB.y + cs * 0.14);
      ctx.stroke();

      // Dark vine border
      ctx.strokeStyle = night ? '#14532d' : '#166534';
      ctx.lineWidth = cs * 0.38;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
      ctx.stroke();

      // Bright green liana body
      ctx.strokeStyle = '#84cc16';
      ctx.lineWidth = cs * 0.24;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
      ctx.stroke();

      // Dashed leaf weave
      ctx.strokeStyle = '#bef264';
      ctx.lineWidth = cs * 0.09;
      ctx.setLineDash([cs * 0.22, cs * 0.18]);
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.quadraticCurveTo(mx, my, pB.x, pB.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Anchor pads
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
    };

    for (const mw of sim.network.motorways) {
      drawVine(mw.ax, mw.ay, mw.bx, mw.by, false);
    }

    if (uiState.activeTool === 'motorway' && uiState.motorwayAnchor && uiState.hoverCell) {
      drawVine(
        uiState.motorwayAnchor.x,
        uiState.motorwayAnchor.y,
        uiState.hoverCell.x,
        uiState.hoverCell.y,
        true,
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
      const onMw = Boolean(step?.isMotorway);
      if (onMw !== elevatedOnly) continue;

      const theme = MONKEY_COLORS[car.color];
      const px = this.offsetX + car.x * cs;
      const py = this.offsetY + car.y * cs;
      const carW = cs * 0.44;
      const carH = cs * 0.28;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(car.angle);

      // Night headlights
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

      // Car shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      this.roundRect(ctx, -carW / 2 + 1, -carH / 2 + 2, carW, carH, cs * 0.08);
      ctx.fill();

      // Car body
      ctx.fillStyle = theme.fill;
      ctx.strokeStyle = theme.dark;
      ctx.lineWidth = Math.max(1.5, cs * 0.045);
      this.roundRect(ctx, -carW / 2, -carH / 2, carW, carH, cs * 0.08);
      ctx.fill();
      ctx.stroke();

      // Brake lights when stopped
      if (car.speed < 0.45) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-carW / 2 - 1, -carH * 0.35, 2.5, carH * 0.25);
        ctx.fillRect(-carW / 2 - 1, carH * 0.1, 2.5, carH * 0.25);
      }

      // Goofy Monkey Driver Head!
      const headR = cs * 0.11;
      ctx.fillStyle = '#78350f';
      // Ears
      ctx.beginPath();
      ctx.arc(carW * 0.06, -headR * 0.95, headR * 0.5, 0, Math.PI * 2);
      ctx.arc(carW * 0.06, headR * 0.95, headR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // Face
      ctx.beginPath();
      ctx.arc(carW * 0.08, 0, headR, 0, Math.PI * 2);
      ctx.fill();
      // Googly eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(carW * 0.13, -headR * 0.38, headR * 0.36, 0, Math.PI * 2);
      ctx.arc(carW * 0.13, headR * 0.38, headR * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(carW * 0.15, -headR * 0.35, headR * 0.18, 0, Math.PI * 2);
      ctx.arc(carW * 0.15, headR * 0.41, headR * 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Floating rage / confused mood bubble
      if (car.moodEmoji && car.moodTimer > 0) {
        ctx.save();
        ctx.font = `${Math.max(12, Math.floor(cs * 0.42))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(car.moodEmoji, px, py - cs * 0.42);
        ctx.restore();
      }
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
      ctx.globalAlpha = 0.8;
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

      // Player chip tag
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
