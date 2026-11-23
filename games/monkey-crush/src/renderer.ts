import { FRUIT_META } from './engine';
import type {
  BeamEffect,
  Cell,
  FloatingText,
  FruitType,
  MascotState,
  MoveCoord,
  Particle,
  Piece,
} from './types';

export interface BoardRenderOpts {
  grid: Cell[][];
  selected: { r: number; c: number } | null;
  hintMove: MoveCoord | null;
  remoteCursor: { r: number; c: number; color: string; name: string } | null;
  particles: Particle[];
  beams: BeamEffect[];
  floatingTexts: FloatingText[];
  shakeX: number;
  shakeY: number;
  time: number;
}

export interface BoardMetrics {
  size: number;
  pad: number;
  cellSize: number;
}

export function getBoardMetrics(canvasWidth: number, canvasHeight: number, rows: number, cols: number): BoardMetrics {
  const size = Math.min(canvasWidth, canvasHeight);
  const pad = Math.round(size * 0.032);
  const inner = size - pad * 2;
  const cellSize = inner / Math.max(rows, cols);
  return { size, pad, cellSize };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: BoardRenderOpts,
): BoardMetrics {
  const { grid, selected, hintMove, remoteCursor, particles, beams, floatingTexts, shakeX, shakeY, time } = opts;
  const rows = grid.length;
  const cols = grid[0].length;
  const metrics = getBoardMetrics(width, height, rows, cols);
  const { size, pad, cellSize } = metrics;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  const offsetX = (width - size) / 2 + shakeX;
  const offsetY = (height - size) / 2 + shakeY;
  ctx.translate(offsetX, offsetY);

  // Wooden Jungle Frame
  const frameGrad = ctx.createLinearGradient(0, 0, 0, size);
  frameGrad.addColorStop(0, '#78350f');
  frameGrad.addColorStop(0.5, '#5c280a');
  frameGrad.addColorStop(1, '#3b1704');
  roundRect(ctx, 0, 0, size, size, 22);
  ctx.fillStyle = frameGrad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#f59e0b';
  ctx.stroke();

  // Inner dark moss backing
  roundRect(ctx, pad - 4, pad - 4, size - (pad - 4) * 2, size - (pad - 4) * 2, 16);
  ctx.fillStyle = 'rgba(6, 24, 18, 0.85)';
  ctx.fill();

  // Pass 1: Tiles, Jelly, Exit Chutes
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.void) continue;
      const x = pad + c * cellSize;
      const y = pad + r * cellSize;
      const gap = Math.max(2, cellSize * 0.045);

      roundRect(ctx, x + gap, y + gap, cellSize - gap * 2, cellSize - gap * 2, cellSize * 0.18);
      ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(15, 45, 34, 0.88)' : 'rgba(20, 58, 42, 0.88)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.14)';
      ctx.stroke();

      // Acai Jelly Layer
      if (cell.jelly > 0) {
        const wobble = Math.sin(time * 4 + r * 0.7 + c * 0.9) * 1.2;
        roundRect(
          ctx,
          x + gap + 1,
          y + gap + 1,
          cellSize - gap * 2 - 2,
          cellSize - gap * 2 - 2 + wobble * 0.3,
          cellSize * 0.18,
        );
        const jGrad = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
        if (cell.jelly >= 2) {
          jGrad.addColorStop(0, 'rgba(192, 132, 252, 0.82)');
          jGrad.addColorStop(1, 'rgba(107, 33, 168, 0.92)');
        } else {
          jGrad.addColorStop(0, 'rgba(168, 85, 247, 0.56)');
          jGrad.addColorStop(1, 'rgba(126, 34, 206, 0.68)');
        }
        ctx.fillStyle = jGrad;
        ctx.fill();
        ctx.lineWidth = cell.jelly >= 2 ? 2.5 : 1.5;
        ctx.strokeStyle = cell.jelly >= 2 ? '#f3e8ff' : '#d8b4fe';
        ctx.stroke();

        // Glossy jelly highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.beginPath();
        ctx.ellipse(
          x + cellSize * 0.32,
          y + cellSize * 0.28,
          cellSize * 0.16,
          cellSize * 0.07,
          -0.45,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        if (cell.jelly >= 2) {
          ctx.fillStyle = '#fef08a';
          ctx.font = `900 ${Math.max(9, Math.round(cellSize * 0.19))}px system-ui, sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText('2x', x + cellSize - gap - 4, y + cellSize - gap - 2);
        }
      }

      // Baby Rescue Exit Chute
      if (cell.exitChute) {
        const bounce = Math.sin(time * 5 + c) * 3;
        ctx.save();
        ctx.fillStyle = '#4ade80';
        ctx.globalAlpha = 0.72 + Math.sin(time * 4) * 0.2;
        const cx = x + cellSize / 2;
        const cy = y + cellSize - 6 + bounce * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - cellSize * 0.18, cy - 6);
        ctx.lineTo(cx + cellSize * 0.18, cy - 6);
        ctx.lineTo(cx, cy + 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Hint highlight
  if (hintMove) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    for (const pos of [
      { r: hintMove.r1, c: hintMove.c1 },
      { r: hintMove.r2, c: hintMove.c2 },
    ]) {
      const x = pad + pos.c * cellSize;
      const y = pad + pos.r * cellSize;
      ctx.save();
      roundRect(ctx, x + 3, y + 3, cellSize - 6, cellSize - 6, cellSize * 0.18);
      ctx.strokeStyle = `rgba(250, 204, 21, ${0.45 + pulse * 0.55})`;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Pass 2: Crates & Pieces
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.void) continue;
      const cx = pad + (c + 0.5) * cellSize;
      const cy = pad + (r + 0.5) * cellSize;

      if (cell.crate > 0) {
        drawCrate(ctx, cx, cy, cellSize * 0.84);
      } else if (cell.piece) {
        const isSel = selected?.r === r && selected?.c === c;
        let hintScale = 1;
        if (
          hintMove &&
          ((hintMove.r1 === r && hintMove.c1 === c) || (hintMove.r2 === r && hintMove.c2 === c))
        ) {
          hintScale = 1 + Math.sin(time * 7) * 0.06;
        }
        const px = cx + cell.piece.xOffset * cellSize;
        const py = cy + cell.piece.yOffset * cellSize;
        const sx = cell.piece.scaleX * (isSel ? 1.12 : hintScale);
        const sy = cell.piece.scaleY * (isSel ? 1.12 : hintScale);

        ctx.save();
        ctx.translate(px, py);
        ctx.scale(sx, sy);
        if (cell.piece.isBaby) {
          drawBabyMonkey(ctx, cellSize * 0.42, time, cell.piece.blinking);
        } else {
          drawFruitPiece(ctx, cell.piece, cellSize * 0.41, time);
        }
        ctx.restore();
      }

      // Banana Peel Overlay (blocks swapping until cleared!)
      if (cell.peel) {
        drawBananaPeelOverlay(ctx, cx, cy, cellSize * 0.44, time);
      }

      // Selected ring
      if (selected && selected.r === r && selected.c === c) {
        const x = pad + c * cellSize;
        const y = pad + r * cellSize;
        ctx.save();
        roundRect(ctx, x + 2, y + 2, cellSize - 4, cellSize - 4, cellSize * 0.2);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Remote Co-op Cursor
  if (remoteCursor) {
    const x = pad + remoteCursor.c * cellSize;
    const y = pad + remoteCursor.r * cellSize;
    ctx.save();
    roundRect(ctx, x + 3, y + 3, cellSize - 6, cellSize - 6, cellSize * 0.18);
    ctx.strokeStyle = remoteCursor.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.fillStyle = remoteCursor.color;
    ctx.font = `800 ${Math.max(11, Math.round(cellSize * 0.22))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(remoteCursor.name, x + cellSize / 2, Math.max(12, y - 4));
    ctx.restore();
  }

  // Beams (Striped & Rainbow lightning)
  for (const b of beams) {
    const t = b.life / b.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, t);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width * t;
    ctx.lineCap = 'round';
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(pad + b.x1 * cellSize, pad + b.y1 * cellSize);
    ctx.lineTo(pad + b.x2 * cellSize, pad + b.y2 * cellSize);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, b.width * 0.35 * t);
    ctx.stroke();
    ctx.restore();
  }

  // Particles
  for (const p of particles) {
    const t = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = t * p.alpha;
    ctx.translate(pad + p.x * cellSize, pad + p.y * cellSize);
    ctx.rotate(p.rotation);

    if (p.kind === 'ring') {
      const r = p.size * (1 + (1 - t) * 2.6) * cellSize * 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 * t;
      ctx.stroke();
    } else if (p.kind === 'star') {
      drawStarShape(ctx, 0, 0, 5, p.size * 1.1, p.size * 0.5, p.color);
    } else if (p.kind === 'leaf') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Floating PT-BR combo texts
  for (const ft of floatingTexts) {
    const t = Math.max(0, ft.life / ft.maxLife);
    const pop = Math.min(1, (1 - t) * 5);
    const scale = ft.scale * (0.7 + 0.4 * Math.sin(pop * Math.PI * 0.5));
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.translate(pad + ft.x * cellSize, pad + ft.y * cellSize);
    ctx.scale(scale, scale);
    ctx.font = `900 ${Math.max(15, Math.round(cellSize * 0.34))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
  return metrics;
}

function drawCrate(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const half = s / 2;
  ctx.save();
  ctx.translate(cx, cy);
  roundRect(ctx, -half, -half, s, s, s * 0.18);
  const grad = ctx.createLinearGradient(-half, -half, half, half);
  grad.addColorStop(0, '#b45309');
  grad.addColorStop(1, '#78350f');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#451a03';
  ctx.stroke();

  // Crossed wood planks
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-half * 0.65, -half * 0.65);
  ctx.lineTo(half * 0.65, half * 0.65);
  ctx.moveTo(half * 0.65, -half * 0.65);
  ctx.lineTo(-half * 0.65, half * 0.65);
  ctx.stroke();

  // Inner frame
  ctx.strokeStyle = '#fde68a';
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 2;
  roundRect(ctx, -half * 0.72, -half * 0.72, s * 0.72, s * 0.72, s * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawBananaPeelOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  time: number,
): void {
  const wobble = Math.sin(time * 5) * 0.08;
  ctx.save();
  ctx.translate(cx, cy + r * 0.15);
  ctx.rotate(wobble);

  // Slippery yellow peel petals draped over fruit
  ctx.fillStyle = 'rgba(250, 204, 21, 0.92)';
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.75);
  ctx.quadraticCurveTo(r * 0.95, -r * 0.2, r * 0.85, r * 0.55);
  ctx.quadraticCurveTo(r * 0.3, r * 0.25, 0, r * 0.65);
  ctx.quadraticCurveTo(-r * 0.35, r * 0.25, -r * 0.85, r * 0.55);
  ctx.quadraticCurveTo(-r * 0.95, -r * 0.2, 0, -r * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Stem tip
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-r * 0.12, -r * 0.88, r * 0.24, r * 0.2);
  ctx.restore();
}

function drawFruitPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  r: number,
  time: number,
): void {
  if (piece.special === 'rainbow') {
    drawRainbowBanana(ctx, r, time);
    return;
  }

  // Drop shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.88, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bomb aura behind piece
  if (piece.special === 'bomb') {
    const pulse = 1 + Math.sin(time * 9) * 0.12;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.12 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.28)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fb923c';
    ctx.stroke();
    ctx.restore();
  }

  // Draw base fruit body + expressive face
  switch (piece.fruit) {
    case 'banana':
      drawBanana(ctx, r, piece.blinking);
      break;
    case 'coconut':
      drawCoconut(ctx, r, piece.blinking);
      break;
    case 'mango':
      drawMango(ctx, r, piece.blinking);
      break;
    case 'acai':
      drawAcai(ctx, r, piece.blinking);
      break;
    case 'cashew':
      drawCashew(ctx, r, piece.blinking);
      break;
    case 'jackfruit':
      drawJackfruit(ctx, r, piece.blinking);
      break;
  }

  // Special overlays (Striped / Bomb)
  if (piece.special === 'striped-h' || piece.special === 'striped-v') {
    drawStripedOverlay(ctx, r, piece.special === 'striped-h', piece.fruit, time);
  } else if (piece.special === 'bomb') {
    drawBombFuseOverlay(ctx, r, time);
  }
}

function drawExpressiveEyes(
  ctx: CanvasRenderingContext2D,
  lx: number,
  rx: number,
  y: number,
  eyeR: number,
  blinking: boolean,
  lookX = 0.18,
  lookY = -0.1,
): void {
  for (const [ex, dir] of [
    [lx, 1],
    [rx, -1],
  ] as const) {
    if (blinking) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = Math.max(2, eyeR * 0.45);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - eyeR * 0.7, y);
      ctx.lineTo(ex + eyeR * 0.7, y);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ex, y, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ex + eyeR * lookX * dir, y + eyeR * lookY, eyeR * 0.48, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + eyeR * 0.28, y - eyeR * 0.28, eyeR * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBanana(ctx: CanvasRenderingContext2D, r: number, blinking: boolean): void {
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.55, '#facc15');
  grad.addColorStop(1, '#ca8a04');

  ctx.beginPath();
  ctx.moveTo(-r * 0.85, r * 0.52);
  ctx.quadraticCurveTo(-r * 0.72, -r * 0.95, r * 0.72, -r * 0.82);
  ctx.quadraticCurveTo(r * 0.92, -r * 0.68, r * 0.58, -r * 0.2);
  ctx.quadraticCurveTo(r * 0.18, r * 0.62, -r * 0.65, r * 0.86);
  ctx.quadraticCurveTo(-r * 0.92, r * 0.82, -r * 0.85, r * 0.52);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#78350f';
  ctx.stroke();

  // Top & bottom brown tips
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.arc(r * 0.72, -r * 0.76, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  // Glossy streak
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.15);
  ctx.quadraticCurveTo(-r * 0.2, -r * 0.48, r * 0.38, -r * 0.58);
  ctx.stroke();

  drawExpressiveEyes(ctx, -r * 0.16, r * 0.22, -r * 0.08, r * 0.17, blinking, 0.2, -0.05);

  // Cheeky smile
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(r * 0.04, r * 0.14, r * 0.2, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawCoconut(ctx: CanvasRenderingContext2D, r: number, blinking: boolean): void {
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  grad.addColorStop(0, '#a16207');
  grad.addColorStop(0.6, '#78350f');
  grad.addColorStop(1, '#451a03');

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#290f02';
  ctx.stroke();

  // Coconut fibrous texture lines
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.22)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-r * 0.25, r * 0.3, r * 0.45, -0.5, 1.1);
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.34, -r * 0.42, r * 0.22, r * 0.11, -0.5, 0, Math.PI * 2);
  ctx.fill();

  drawExpressiveEyes(ctx, -r * 0.28, r * 0.28, -r * 0.08, r * 0.2, blinking, 0.25, 0.1);

  // Goofy surprised mouth
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.34, r * 0.16, r * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#290f02';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawMango(ctx: CanvasRenderingContext2D, r: number, blinking: boolean): void {
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#fde047');
  grad.addColorStop(0.45, '#fb923c');
  grad.addColorStop(1, '#dc2626');

  ctx.beginPath();
  ctx.ellipse(0, r * 0.06, r * 0.78, r * 0.9, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#7c2d12';
  ctx.stroke();

  // Leaf on top
  ctx.fillStyle = '#22c55e';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.76);
  ctx.quadraticCurveTo(r * 0.55, -r * 1.12, r * 0.72, -r * 0.62);
  ctx.quadraticCurveTo(r * 0.32, -r * 0.48, 0, -r * 0.76);
  ctx.fill();
  ctx.stroke();

  // Specular shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.18, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();

  drawExpressiveEyes(ctx, -r * 0.25, r * 0.25, -r * 0.02, r * 0.18, blinking, 0.1, -0.1);

  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.22, r * 0.2, 0.15, Math.PI - 0.15);
  ctx.stroke();
}

function drawAcai(ctx: CanvasRenderingContext2D, r: number, blinking: boolean): void {
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, r * 0.05, r);
  grad.addColorStop(0, '#d8b4fe');
  grad.addColorStop(0.45, '#9333ea');
  grad.addColorStop(1, '#3b0764');

  ctx.beginPath();
  ctx.arc(0, r * 0.06, r * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#2e1065';
  ctx.stroke();

  // Little crown stem
  ctx.fillStyle = '#4ade80';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, -r * 0.72);
  ctx.lineTo(0, -r * 0.96);
  ctx.lineTo(r * 0.22, -r * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.22, r * 0.1, -0.55, 0, Math.PI * 2);
  ctx.fill();

  drawExpressiveEyes(ctx, -r * 0.26, r * 0.26, 0, r * 0.18, blinking, 0.15, -0.15);

  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.26, r * 0.19, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawCashew(ctx: CanvasRenderingContext2D, r: number, blinking: boolean): void {
  // Cashew nut on top!
  ctx.fillStyle = '#a16207';
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.16, -r * 0.56);
  ctx.quadraticCurveTo(r * 0.15, -r * 1.12, r * 0.44, -r * 0.78);
  ctx.quadraticCurveTo(r * 0.35, -r * 0.48, r * 0.1, -r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pear-shaped red-orange cashew apple
  const grad = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.9);
  grad.addColorStop(0, '#fb923c');
  grad.addColorStop(0.45, '#ef4444');
  grad.addColorStop(1, '#991b1b');

  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.bezierCurveTo(r * 0.6, -r * 0.6, r * 0.9, r * 0.15, r * 0.7, r * 0.66);
  ctx.quadraticCurveTo(0, r * 0.96, -r * 0.7, r * 0.66);
  ctx.bezierCurveTo(-r * 0.9, r * 0.15, -r * 0.6, -r * 0.6, 0, -r * 0.62);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = '#7f1d1d';
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.28, -r * 0.18, r * 0.14, r * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();

  drawExpressiveEyes(ctx, -r * 0.25, r * 0.25, r * 0.1, r * 0.17, blinking, 0.15, 0);

  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.arc(0, r * 0.34, r * 0.18, 0.15, Math.PI - 0.15);
  ctx.stroke();
}

function drawJackfruit(ctx: CanvasRenderingContext2D, r: number, blinking: boolean): void {
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#bef264');
  grad.addColorStop(0.55, '#22c55e');
  grad.addColorStop(1, '#15803d');

  // Spiky-bumped oval silhouette
  ctx.beginPath();
  const bumps = 14;
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const radX = r * 0.82 + (i % 2 === 0 ? r * 0.09 : 0);
    const radY = r * 0.9 + (i % 2 === 0 ? r * 0.09 : 0);
    const px = Math.cos(a) * radX;
    const py = Math.sin(a) * radY;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#14532d';
  ctx.stroke();

  // Rosy cheeks
  ctx.fillStyle = 'rgba(251, 113, 133, 0.45)';
  ctx.beginPath();
  ctx.arc(-r * 0.42, r * 0.18, r * 0.13, 0, Math.PI * 2);
  ctx.arc(r * 0.42, r * 0.18, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  drawExpressiveEyes(ctx, -r * 0.26, r * 0.26, -r * 0.04, r * 0.18, blinking, 0.12, -0.05);

  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, r * 0.22, r * 0.2, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawStripedOverlay(
  ctx: CanvasRenderingContext2D,
  r: number,
  horizontal: boolean,
  fruit: FruitType,
  time: number,
): void {
  ctx.save();
  // Glowing directional laser band
  const pulse = 0.72 + Math.sin(time * 8) * 0.25;
  ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
  ctx.lineWidth = 3.5;

  if (horizontal) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.28);
    ctx.lineTo(r * 0.95, -r * 0.28);
    ctx.moveTo(-r * 0.95, r * 0.28);
    ctx.lineTo(r * 0.95, r * 0.28);
    ctx.stroke();

    // Left/Right arrows
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, 0);
    ctx.lineTo(-r * 0.72, -r * 0.25);
    ctx.lineTo(-r * 0.72, r * 0.25);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(r * 1.05, 0);
    ctx.lineTo(r * 0.72, -r * 0.25);
    ctx.lineTo(r * 0.72, r * 0.25);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, -r * 0.95);
    ctx.lineTo(-r * 0.28, r * 0.95);
    ctx.moveTo(r * 0.28, -r * 0.95);
    ctx.lineTo(r * 0.28, r * 0.95);
    ctx.stroke();

    // Up/Down arrows
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.05);
    ctx.lineTo(-r * 0.25, -r * 0.72);
    ctx.lineTo(r * 0.25, -r * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, r * 1.05);
    ctx.lineTo(-r * 0.25, r * 0.72);
    ctx.lineTo(r * 0.25, r * 0.72);
    ctx.closePath();
    ctx.fill();
  }

  // Colored monkey headband badge
  ctx.strokeStyle = FRUIT_META[fruit].splash;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBombFuseOverlay(ctx: CanvasRenderingContext2D, r: number, time: number): void {
  ctx.save();
  // Vine fuse cord + glowing spark
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.3, -r * 0.65);
  ctx.quadraticCurveTo(r * 0.72, -r * 1.08, r * 0.88, -r * 0.85);
  ctx.stroke();

  const spark = 0.8 + Math.sin(time * 24) * 0.35;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(r * 0.88, -r * 0.85, r * 0.24 * spark, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(r * 0.88, -r * 0.85, r * 0.13 * spark, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRainbowBanana(ctx: CanvasRenderingContext2D, r: number, time: number): void {
  ctx.save();
  // Spinning prismatic ring
  const grad = ctx.createLinearGradient(
    Math.cos(time * 3) * r,
    Math.sin(time * 3) * r,
    -Math.cos(time * 3) * r,
    -Math.sin(time * 3) * r,
  );
  grad.addColorStop(0, '#f43f5e');
  grad.addColorStop(0.25, '#facc15');
  grad.addColorStop(0.5, '#4ade80');
  grad.addColorStop(0.75, '#38bdf8');
  grad.addColorStop(1, '#c084fc');

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fef08a';
  ctx.stroke();

  // Golden Banana inside
  ctx.fillStyle = '#fef08a';
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.48, r * 0.35);
  ctx.quadraticCurveTo(-r * 0.32, -r * 0.56, r * 0.45, -r * 0.44);
  ctx.quadraticCurveTo(r * 0.18, r * 0.25, -r * 0.48, r * 0.35);
  ctx.fill();
  ctx.stroke();

  // Cool Sunglasses
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -r * 0.52, -r * 0.22, r * 0.44, r * 0.26, 4);
  ctx.fill();
  roundRect(ctx, r * 0.08, -r * 0.22, r * 0.44, r * 0.26, 4);
  ctx.fill();
  ctx.fillRect(-r * 0.08, -r * 0.14, r * 0.16, r * 0.06);

  // Orbiting stars
  for (let i = 0; i < 3; i++) {
    const a = time * 3.5 + (i * Math.PI * 2) / 3;
    drawStarShape(
      ctx,
      Math.cos(a) * r * 0.92,
      Math.sin(a) * r * 0.92,
      4,
      r * 0.2,
      r * 0.08,
      '#ffffff',
    );
  }
  ctx.restore();
}

function drawBabyMonkey(
  ctx: CanvasRenderingContext2D,
  r: number,
  time: number,
  blinking: boolean,
): void {
  const bob = Math.sin(time * 5) * r * 0.06;
  ctx.save();
  ctx.translate(0, bob);

  // Big baby ears
  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(dir * r * 0.8, -r * 0.05, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.arc(dir * r * 0.8, -r * 0.05, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r * 0.9);
  grad.addColorStop(0, '#b45309');
  grad.addColorStop(1, '#78350f');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hair tuft
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.78);
  ctx.quadraticCurveTo(r * 0.15, -r * 1.05, r * 0.25, -r * 0.88);
  ctx.stroke();

  // Face mask
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.18, r * 0.62, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.24, -r * 0.14, r * 0.26, 0, Math.PI * 2);
  ctx.arc(r * 0.24, -r * 0.14, r * 0.26, 0, Math.PI * 2);
  ctx.fill();

  drawExpressiveEyes(ctx, -r * 0.24, r * 0.24, -r * 0.14, r * 0.18, blinking, 0.1, 0);

  // Cute pink pacifier / grin
  ctx.fillStyle = '#fb7185';
  ctx.strokeStyle = '#881337';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, r * 0.26, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#fda4af';
  ctx.beginPath();
  ctx.arc(0, r * 0.38, r * 0.12, 0, Math.PI * 2);
  ctx.stroke();

  // Crown halo badge so players spot baby immediately
  ctx.fillStyle = '#4ade80';
  ctx.font = `900 ${Math.max(9, Math.round(r * 0.44))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('BEBÊ', 0, r * 0.96);

  ctx.restore();
}

function drawStarShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number,
  color: string,
): void {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Expressive animated sidekick monkey ("Zé Banana") reacting to combos, panic, and rival peels!
 */
export function drawMascot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mascot: MascotState,
): void {
  ctx.clearRect(0, 0, width, height);
  const t = mascot.time;
  const cx = width * 0.5;
  const cy = height * 0.62;
  const s = Math.min(width, height) * 0.28;

  const bounce =
    mascot.mood === 'hyped' || mascot.mood === 'victory'
      ? Math.abs(Math.sin(t * 9)) * s * 0.24
      : Math.sin(t * 2.8) * s * 0.05;

  const tilt =
    mascot.mood === 'hit'
      ? Math.sin(t * 24) * 0.14
      : mascot.mood === 'hyped'
        ? Math.sin(t * 10) * 0.08
        : Math.sin(t * 1.8) * 0.03;

  ctx.save();
  ctx.translate(cx, cy - bounce - mascot.bounce * s * 0.2);
  ctx.rotate(tilt);

  // Branch perch
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = s * 0.34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 1.6, s * 1.05);
  ctx.quadraticCurveTo(0, s * 0.9, s * 1.6, s * 1.05);
  ctx.stroke();

  // Swaying tail
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.65, s * 0.65);
  ctx.quadraticCurveTo(
    -s * 1.45,
    s * 0.2 + Math.sin(t * 4) * s * 0.25,
    -s * 1.2,
    -s * 0.55 + Math.cos(t * 4) * s * 0.2,
  );
  ctx.stroke();

  // Torso
  ctx.fillStyle = '#92400e';
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.52, s * 0.72, s * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.58, s * 0.44, s * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dir * s * 0.88, -s * 0.38, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.arc(dir * s * 0.88, -s * 0.38, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  const headGrad = ctx.createRadialGradient(-s * 0.2, -s * 0.6, s * 0.1, 0, -s * 0.35, s * 0.9);
  headGrad.addColorStop(0, '#b45309');
  headGrad.addColorStop(1, '#78350f');
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -s * 0.35, s * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Face mask
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.16, s * 0.6, s * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-s * 0.25, -s * 0.48, s * 0.26, 0, Math.PI * 2);
  ctx.arc(s * 0.25, -s * 0.48, s * 0.26, 0, Math.PI * 2);
  ctx.fill();

  // Eyes by mood
  if (mascot.mood === 'hyped' || mascot.mood === 'victory') {
    for (const dir of [-1, 1]) {
      drawStarShape(ctx, dir * s * 0.25, -s * 0.48, 5, s * 0.2, s * 0.09, '#facc15');
    }
  } else if (mascot.mood === 'hit') {
    // Dizzy X / spiral eyes
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    for (const dir of [-1, 1]) {
      const ex = dir * s * 0.25;
      const ey = -s * 0.48;
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.1, ey - s * 0.1);
      ctx.lineTo(ex + s * 0.1, ey + s * 0.1);
      ctx.moveTo(ex + s * 0.1, ey - s * 0.1);
      ctx.lineTo(ex - s * 0.1, ey + s * 0.1);
      ctx.stroke();
    }
  } else {
    drawExpressiveEyes(
      ctx,
      -s * 0.25,
      s * 0.25,
      -s * 0.48,
      s * 0.19,
      mascot.blinking,
      mascot.mood === 'panicked' ? 0 : 0.2,
      mascot.mood === 'panicked' ? 0.2 : -0.1,
    );
  }

  // Sweat drop when panicked
  if (mascot.mood === 'panicked') {
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(s * 0.56, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.68, -s * 0.48, s * 0.56, -s * 0.45);
    ctx.quadraticCurveTo(s * 0.44, -s * 0.48, s * 0.56, -s * 0.72);
    ctx.fill();
  }

  // Mouth by mood
  if (mascot.mood === 'hyped' || mascot.mood === 'victory' || mascot.mood === 'happy') {
    ctx.fillStyle = '#991b1b';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -s * 0.12, s * 0.3, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-s * 0.14, -s * 0.12, s * 0.28, s * 0.08);
  } else if (mascot.mood === 'defeat' || mascot.mood === 'panicked' || mascot.mood === 'hit') {
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, s * 0.04, s * 0.22, Math.PI + 0.3, -0.3);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -s * 0.12, s * 0.24, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // Holding a banana in right hand!
  ctx.save();
  ctx.translate(s * 0.74, s * 0.38);
  ctx.rotate(mascot.mood === 'hyped' ? Math.sin(t * 14) * 0.5 : 0.25);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.22);
  ctx.quadraticCurveTo(-s * 0.12, -s * 0.35, s * 0.32, -s * 0.25);
  ctx.quadraticCurveTo(s * 0.1, s * 0.15, -s * 0.18, s * 0.22);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
