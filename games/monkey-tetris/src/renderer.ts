import { BUFFER_ROWS, COLS, TetrisEngine, VISIBLE_ROWS } from './engine';
import { drawCoachMonkey, drawCrateCell, drawMonkeyHead } from './monkey-art';
import { PIECE_SHAPES, PIECE_THEMES, charToCell } from './pieces';
import type { BoardSnapshot, FlyingBananaAttack, GameMode, Particle, PieceId } from './types';

export interface RenderState {
  mode: GameMode;
  time: number;
  boards: TetrisEngine[];
  remoteSnapshots: BoardSnapshot[];
  flyingAttacks: FlyingBananaAttack[];
  countdownText: string | null;
  paused: boolean;
  isTouchDevice: boolean;
  sprintTarget: number;
}

interface BoardRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class TetrisRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private boardRects = new Map<string, BoardRect>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D context');
    this.ctx = ctx;
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public render(state: RenderState): void {
    this.resize();
    const ctx = this.ctx;
    const W = window.innerWidth;
    const H = window.innerHeight;

    this.boardRects.clear();
    this.drawJungleBackdrop(ctx, W, H, state.time);

    const topMargin = 54;
    const bottomMargin = state.isTouchDevice ? 148 : 18;
    const availH = Math.max(240, H - topMargin - bottomMargin);

    if (state.boards.length === 0) return;

    if (state.mode === 'local_2p' || state.mode === 'vs_bot') {
      const b1 = state.boards[0];
      const b2 = state.boards[1];
      const maxCellByH = Math.floor(availH / VISIBLE_ROWS);
      const maxCellByW = Math.floor((W - 40) / 38);
      const cell = Math.max(12, Math.min(28, maxCellByH, maxCellByW));
      const gap = Math.max(24, Math.min(110, W * 0.08));
      const totalPairW = cell * COLS * 2 + cell * 8 + gap;
      const startX = Math.max(10, (W - totalPairW) * 0.5);
      const boardY = topMargin + Math.max(0, (availH - cell * VISIBLE_ROWS) * 0.5);

      if (b1) {
        this.drawFullBoard(ctx, b1, startX + cell * 4.2, boardY, cell, state.time, true, false);
      }
      if (b2) {
        this.drawFullBoard(
          ctx,
          b2,
          startX + cell * 4.2 + cell * COLS + gap + cell * 3.8,
          boardY,
          cell,
          state.time,
          false,
          true,
        );
      }
    } else if (state.mode === 'online_versus') {
      const local = state.boards[0];
      const rivals = state.remoteSnapshots;
      const hasRivals = rivals.length > 0;
      const maxCellByH = Math.floor(availH / VISIBLE_ROWS);
      const maxCellByW = hasRivals ? Math.floor((W - 40) / 28) : Math.floor((W - 40) / 19);
      const cell = Math.max(13, Math.min(31, maxCellByH, maxCellByW));
      const boardW = cell * COLS;
      const boardH = cell * VISIBLE_ROWS;

      const mainGroupW = boardW + cell * 9.5;
      const rivalAreaW = hasRivals ? Math.min(360, W * 0.34) : 0;
      const baseLeft = Math.max(16, (W - (mainGroupW + rivalAreaW)) * 0.5);
      const boardX = baseLeft + cell * 4.5;
      const boardY = topMargin + Math.max(0, (availH - boardH) * 0.5);

      this.drawFullBoard(ctx, local, boardX, boardY, cell, state.time, true, true);

      if (hasRivals) {
        const rxStart = boardX + boardW + cell * 5.2;
        this.drawRemoteMiniBoards(ctx, rivals, rxStart, boardY, Math.max(120, W - rxStart - 14), boardH, state.time);
      }
    } else {
      // Solo Marathon or Sprint 40
      const solo = state.boards[0];
      const maxCellByH = Math.floor(availH / VISIBLE_ROWS);
      const maxCellByW = Math.floor((W - 24) / 18.5);
      const cell = Math.max(14, Math.min(33, maxCellByH, maxCellByW));
      const boardW = cell * COLS;
      const boardH = cell * VISIBLE_ROWS;
      const boardX = Math.max(cell * 4.4, (W - boardW) * 0.5);
      const boardY = topMargin + Math.max(0, (availH - boardH) * 0.5);

      this.drawFullBoard(ctx, solo, boardX, boardY, cell, state.time, true, true);
    }

    // Flying Banana Peel attacks between boards
    this.drawFlyingAttacks(ctx, state.flyingAttacks, state.time);

    // Countdown overlay
    if (state.countdownText) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 12, 24, 0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `900 ${Math.min(110, Math.round(W * 0.16))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#78350f';
      ctx.strokeText(state.countdownText, W * 0.5, H * 0.48);
      ctx.fillStyle = '#fde047';
      ctx.fillText(state.countdownText, W * 0.5, H * 0.48);
      ctx.restore();
    }

    // Pause banner
    if (state.paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 12, 24, 0.68)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '900 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText('⏸️ PAUSA NA SELVA', W * 0.5, H * 0.45);
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('Aperte P para voltar a empilhar bananas!', W * 0.5, H * 0.52);
      ctx.restore();
    }
  }

  private drawJungleBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, time: number): void {
    const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
    grad.addColorStop(0, '#071a14');
    grad.addColorStop(0.55, '#0f172a');
    grad.addColorStop(1, '#1e1008');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Soft glowing jungle fireflies
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const px = ((i * 197.3 + Math.sin(time * 0.4 + i) * 35) % W + W) % W;
      const py = ((i * 113.7 + Math.cos(time * 0.35 + i * 1.7) * 28) % H + H) % H;
      const alpha = 0.12 + 0.15 * Math.sin(time * 2.2 + i * 1.9);
      ctx.fillStyle = i % 3 === 0 ? `rgba(250, 204, 21, ${alpha})` : `rgba(74, 222, 128, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFullBoard(
    ctx: CanvasRenderingContext2D,
    engine: TetrisEngine,
    bx: number,
    by: number,
    cell: number,
    time: number,
    showLeftPanel: boolean,
    showRightPanel: boolean,
  ): void {
    const bw = cell * COLS;
    const bh = cell * VISIBLE_ROWS;

    const shakeX = engine.shakeAmount > 0 ? (Math.random() - 0.5) * engine.shakeAmount : 0;
    const shakeY = engine.shakeAmount > 0 ? (Math.random() - 0.5) * engine.shakeAmount : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.boardRects.set(engine.id, { id: engine.id, x: bx, y: by, w: bw, h: bh });

    // Danger red glow behind frame
    const danger = engine.isInDanger() && engine.alive;
    if (danger) {
      const pulse = 0.35 + 0.35 * Math.sin(time * 9);
      ctx.shadowColor = `rgba(239, 68, 68, ${pulse})`;
      ctx.shadowBlur = 22;
    }

    // Wooden bamboo outer border
    ctx.fillStyle = '#422006';
    ctx.strokeStyle = danger ? '#ef4444' : engine.color;
    ctx.lineWidth = Math.max(2.5, cell * 0.14);
    ctx.beginPath();
    ctx.roundRect(bx - 6, by - 6, bw + 12, bh + 12, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Board dark interior
    ctx.fillStyle = '#090f1d';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();

    // Clip to board for grid/pieces/trails
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(bx + c * cell, by);
      ctx.lineTo(bx + c * cell, by + bh);
      ctx.stroke();
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(bx, by + r * cell);
      ctx.lineTo(bx + bw, by + r * cell);
      ctx.stroke();
    }

    // Hard drop streaks
    for (const tr of engine.dropTrail) {
      const alpha = Math.max(0, tr.life / 0.18) * 0.45;
      const tg = ctx.createLinearGradient(0, by + tr.yStart * cell, 0, by + tr.yEnd * cell);
      tg.addColorStop(0, 'rgba(255,255,255,0)');
      tg.addColorStop(1, tr.color);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = tg;
      ctx.fillRect(bx + (tr.x - 1.2) * cell, by + tr.yStart * cell, cell * 2.4, (tr.yEnd - tr.yStart) * cell);
      ctx.globalAlpha = 1;
    }

    // Locked blocks
    const blockMood = engine.alive ? engine.mood : 'ko';
    for (let r = BUFFER_ROWS; r < BUFFER_ROWS + VISIBLE_ROWS; r++) {
      const isFlashing = engine.clearFlashTimer > 0 && engine.clearFlashRows.includes(r);
      for (let c = 0; c < COLS; c++) {
        const cellData = engine.grid[r][c];
        if (!cellData) continue;
        drawCrateCell(ctx, bx + c * cell, by + (r - BUFFER_ROWS) * cell, cell, cellData.type, {
          time,
          hasMonkey: cellData.monkeyFace === 1,
          monkeyMood: blockMood,
          blinkSeed: cellData.blinkSeed,
          flash: isFlashing,
        });
      }
    }

    // Ghost & Active piece
    if (engine.active && engine.alive && engine.clearFlashTimer <= 0) {
      const p = engine.active;
      const shape = PIECE_SHAPES[p.id][p.rot];
      const theme = PIECE_THEMES[p.id];
      const ghostY = engine.getGhostY();

      // Ghost outline
      if (ghostY > p.y) {
        ctx.save();
        ctx.strokeStyle = theme.glowColor;
        ctx.fillStyle = `${theme.glowColor}22`;
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.setLineDash([4, 3]);
        for (const [dx, dy] of shape) {
          const gy = ghostY + dy - BUFFER_ROWS;
          if (gy < 0) continue;
          const gx = p.x + dx;
          ctx.beginPath();
          ctx.roundRect(bx + gx * cell + 2, by + gy * cell + 2, cell - 4, cell - 4, 4);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Active piece with squash & stretch
      const fallMood = danger ? 'panic' : p.id === 'T' ? 'tspin' : 'idle';
      for (let i = 0; i < shape.length; i++) {
        const [dx, dy] = shape[i];
        const vy = p.y + dy - BUFFER_ROWS;
        if (vy < -1) continue;
        const cx = bx + (p.x + dx + 0.5) * cell;
        const cy = by + (vy + 0.5) * cell;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(p.squashX, p.squashY);
        drawCrateCell(ctx, -cell * 0.5, -cell * 0.5, cell, p.id, {
          time,
          hasMonkey: i === theme.monkeyCellIndex,
          monkeyMood: fallMood,
          blinkSeed: 1.7,
        });
        ctx.restore();
      }
    }

    // KO overlay on dead board
    if (!engine.alive) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(bx, by, bw, bh);
      drawMonkeyHead(ctx, bx + bw * 0.5, by + bh * 0.42, Math.min(48, cell * 1.9), {
        mood: 'ko',
        time,
      });
      ctx.font = `900 ${Math.max(16, Math.round(cell * 0.9))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fb7185';
      ctx.fillText('NOCAUTE!', bx + bw * 0.5, by + bh * 0.63);
    }

    ctx.restore(); // end board clip

    // Incoming Garbage Warning Bar on the left edge of board
    const pendingG = engine.getPendingGarbageTotal();
    if (pendingG > 0 && engine.alive) {
      const barW = Math.max(6, cell * 0.28);
      const barH = Math.min(bh, (pendingG / VISIBLE_ROWS) * bh);
      const gx = bx - barW - 7;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(gx, by, barW, bh);
      const blink = Math.sin(time * 14) > 0 ? '#ef4444' : '#facc15';
      ctx.fillStyle = blink;
      ctx.fillRect(gx, by + bh - barH, barW, barH);
    }

    // Header plate above board (player name)
    ctx.font = `800 ${Math.max(11, Math.round(cell * 0.5))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = engine.color;
    ctx.fillText(engine.name, bx + bw * 0.5, by - 12);

    // Side Panels: Hold + Stats (left) and Queue + Coach Monkey (right)
    const panelW = cell * 3.7;
    if (showLeftPanel) {
      const lx = bx - panelW - 14;
      this.drawMiniPieceBox(ctx, 'HOLD (C)', engine.hold, lx, by, panelW, cell * 3.1, cell * 0.68, engine.holdUsed);
      this.drawStatsBox(ctx, engine, lx, by + cell * 3.6, panelW, cell);
    }

    if (showRightPanel) {
      const rx = bx + bw + 14;
      this.drawNextQueueBox(ctx, engine.queue.slice(0, 4), rx, by, panelW, cell);
      if (cell >= 17) {
        drawCoachMonkey(ctx, rx + panelW * 0.5, by + cell * 14.5, Math.min(1.15, cell / 24), {
          mood: engine.alive ? engine.mood : 'ko',
          time,
          speech: engine.speechBubble,
          combo: engine.combo,
          playerColor: engine.color,
        });
      }
    }

    // Particles & Floating Texts (drawn unclipped over board!)
    this.drawParticles(ctx, engine.particles, bx, by, cell);
    for (const ft of engine.floatingTexts) {
      const alpha = Math.min(1, ft.life / 0.35);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(Math.max(14, cell * 0.72) * ft.scale)}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#090f1d';
      const fx = bx + ft.x * cell;
      const fy = by + ft.y * cell;
      ctx.strokeText(ft.text, fx, fy);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, fx, fy);
      if (ft.subtext) {
        ctx.font = `800 ${Math.round(Math.max(11, cell * 0.45))}px system-ui, sans-serif`;
        ctx.strokeText(ft.subtext, fx, fy + cell * 0.75);
        ctx.fillStyle = '#fef9c3';
        ctx.fillText(ft.subtext, fx, fy + cell * 0.75);
      }
      ctx.restore();
    }

    ctx.restore(); // end shake
  }

  private drawMiniPieceBox(
    ctx: CanvasRenderingContext2D,
    title: string,
    pieceId: PieceId | null,
    x: number,
    y: number,
    w: number,
    h: number,
    miniCell: number,
    dimmed = false,
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.font = `800 ${Math.max(9, Math.round(miniCell * 0.58))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w * 0.5, y + Math.max(12, miniCell * 0.8));

    if (pieceId) {
      this.drawPreviewPiece(ctx, pieceId, x + w * 0.5, y + h * 0.6, miniCell, dimmed ? 0.45 : 1);
    }
    ctx.restore();
  }

  private drawNextQueueBox(
    ctx: CanvasRenderingContext2D,
    queue: PieceId[],
    x: number,
    y: number,
    w: number,
    cell: number,
  ): void {
    const miniCell = cell * 0.58;
    const itemH = cell * 2.15;
    const h = cell * 1.1 + queue.length * itemH;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.font = `800 ${Math.max(9, Math.round(miniCell * 0.65))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('PRÓXIMAS', x + w * 0.5, y + Math.max(12, cell * 0.65));

    queue.forEach((pid, idx) => {
      this.drawPreviewPiece(ctx, pid, x + w * 0.5, y + cell * 1.15 + idx * itemH + itemH * 0.42, miniCell, 1);
    });
    ctx.restore();
  }

  private drawPreviewPiece(
    ctx: CanvasRenderingContext2D,
    pieceId: PieceId,
    cx: number,
    cy: number,
    miniCell: number,
    alpha: number,
  ): void {
    const shape = PIECE_SHAPES[pieceId][0];
    let minX = 99, maxX = -99, minY = 99, maxY = -99;
    for (const [dx, dy] of shape) {
      minX = Math.min(minX, dx);
      maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy);
      maxY = Math.max(maxY, dy);
    }
    const pw = (maxX - minX + 1) * miniCell;
    const ph = (maxY - minY + 1) * miniCell;
    const ox = cx - pw * 0.5 - minX * miniCell;
    const oy = cy - ph * 0.5 - minY * miniCell;
    const theme = PIECE_THEMES[pieceId];
    for (let i = 0; i < shape.length; i++) {
      const [dx, dy] = shape[i];
      drawCrateCell(ctx, ox + dx * miniCell, oy + dy * miniCell, miniCell, pieceId, {
        time: 0,
        hasMonkey: i === theme.monkeyCellIndex,
        monkeyMood: 'idle',
        alpha,
      });
    }
  }

  private drawStatsBox(
    ctx: CanvasRenderingContext2D,
    engine: TetrisEngine,
    x: number,
    y: number,
    w: number,
    cell: number,
  ): void {
    const h = cell * 7.2;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    const rows: [string, string, string][] = [
      ['PONTOS', engine.score.toLocaleString('pt-BR'), '#fde047'],
      [
        engine.sprintTarget ? `SPRINT ${engine.sprintTarget}` : 'LINHAS',
        engine.sprintTarget ? `${Math.min(engine.lines, engine.sprintTarget)}/${engine.sprintTarget}` : `${engine.lines}`,
        '#4ade80',
      ],
      ['NÍVEL', `${engine.level}`, '#38bdf8'],
      ['TEMPO', `${engine.elapsedTime.toFixed(1)}s`, '#fed7aa'],
    ];

    const stepH = h / rows.length;
    rows.forEach(([label, val, color], idx) => {
      const ry = y + idx * stepH + stepH * 0.34;
      ctx.fillStyle = '#94a3b8';
      ctx.font = `800 ${Math.max(8, Math.round(cell * 0.36))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w * 0.5, ry);

      ctx.fillStyle = color;
      ctx.font = `900 ${Math.max(11, Math.round(cell * 0.56))}px system-ui, sans-serif`;
      ctx.fillText(val, x + w * 0.5, ry + cell * 0.72);
    });
    ctx.restore();
  }

  private drawRemoteMiniBoards(
    ctx: CanvasRenderingContext2D,
    rivals: BoardSnapshot[],
    x: number,
    y: number,
    areaW: number,
    areaH: number,
    time: number,
  ): void {
    const count = rivals.length;
    const cols = count <= 2 ? count : 2;
    const rows = Math.ceil(count / cols);
    const gap = 12;
    const slotW = (areaW - gap * (cols - 1)) / cols;
    const slotH = (areaH - gap * (rows - 1)) / rows;
    const miniCell = Math.max(5, Math.min(14, Math.floor((slotW - 16) / COLS), Math.floor((slotH - 42) / VISIBLE_ROWS)));
    const bw = miniCell * COLS;
    const bh = miniCell * VISIBLE_ROWS;

    rivals.forEach((snap, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const bx = x + col * (bw + 24);
      const by = y + row * (bh + 52) + 22;

      this.boardRects.set(snap.playerId, { id: snap.playerId, x: bx, y: by, w: bw, h: bh });

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = snap.alive ? snap.playerColor : '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx - 5, by - 5, bw + 10, bh + 10, 8);
      ctx.fill();
      ctx.stroke();

      // Player header & tiny monkey face
      drawMonkeyHead(ctx, bx + 10, by - 16, 9, {
        mood: snap.alive ? snap.mood : 'ko',
        time,
        accentColor: snap.playerColor,
      });
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.fillStyle = snap.playerColor;
      ctx.textAlign = 'left';
      ctx.fillText(snap.playerName.slice(0, 12), bx + 24, by - 12);

      // Grid cells
      for (let r = 0; r < VISIBLE_ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ch = snap.grid[r * COLS + c];
          const ct = charToCell(ch);
          if (!ct) continue;
          drawCrateCell(ctx, bx + c * miniCell, by + r * miniCell, miniCell, ct, { time });
        }
      }

      // Active piece on mini board
      if (snap.active && snap.alive) {
        const shape = PIECE_SHAPES[snap.active.id][snap.active.rot];
        for (const [dx, dy] of shape) {
          const vy = snap.active.y + dy - BUFFER_ROWS;
          if (vy < 0 || vy >= VISIBLE_ROWS) continue;
          drawCrateCell(ctx, bx + (snap.active.x + dx) * miniCell, by + vy * miniCell, miniCell, snap.active.id, {
            time,
          });
        }
      }

      if (!snap.alive) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.fillStyle = '#fb7185';
        ctx.textAlign = 'center';
        ctx.fillText('K.O.', bx + bw * 0.5, by + bh * 0.5);
      }

      // Footer score
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText(`${snap.score} pts • ${snap.lines}L`, bx + bw * 0.5, by + bh + 18);
      ctx.restore();
    });
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    particles: Particle[],
    bx: number,
    by: number,
    cell: number,
  ): void {
    for (const p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(bx + p.x * cell, by + p.y * cell);
      ctx.rotate(p.rot);
      const s = p.size * cell;
      if (p.kind === 'banana') {
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.4);
        ctx.quadraticCurveTo(s * 0.9, -s * 0.2, s * 0.5, s);
        ctx.quadraticCurveTo(0, s * 0.1, -s, -s * 0.4);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFlyingAttacks(
    ctx: CanvasRenderingContext2D,
    attacks: FlyingBananaAttack[],
    time: number,
  ): void {
    for (const atk of attacks) {
      const from = this.boardRects.get(atk.fromBoardId);
      const to = this.boardRects.get(atk.toBoardId);
      if (!from || !to) continue;

      const t = atk.progress;
      const sx = from.x + from.w * 0.5;
      const sy = from.y + from.h * 0.45;
      const ex = to.x + to.w * 0.5;
      const ey = to.y + to.h * 0.85;
      const mx = (sx + ex) * 0.5;
      const my = Math.min(sy, ey) - 85;

      // Quadratic Bezier
      const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex;
      const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(time * 12);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#713f12';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.quadraticCurveTo(14, -8, 12, 12);
      ctx.quadraticCurveTo(0, 2, -14, -6);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-time * 12);
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeText(`+${atk.amount}`, 0, -14);
      ctx.fillText(`+${atk.amount}`, 0, -14);
      ctx.restore();
    }
  }
}
