import { PIECE_THEMES } from './pieces';
import type { CellType, MonkeyMood } from './types';

export interface MonkeyDrawOptions {
  mood: MonkeyMood;
  time: number;
  blinkSeed?: number;
  lookX?: number;
  lookY?: number;
  furTop?: string;
  furBottom?: string;
  squashX?: number;
  squashY?: number;
  accentColor?: string;
}

export function drawMonkeyHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  opts: MonkeyDrawOptions,
): void {
  const {
    mood,
    time,
    blinkSeed = 0,
    lookX = 0,
    lookY = 0,
    furTop = '#b45309',
    furBottom = '#78350f',
    squashX = 1,
    squashY = 1,
    accentColor,
  } = opts;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(squashX, squashY);

  const lineW = Math.max(1.2, r * 0.09);

  // Ears
  for (const side of [-1, 1]) {
    const ex = side * r * 0.96;
    const ey = -r * 0.08;
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = furBottom;
    ctx.fill();
    ctx.lineWidth = lineW;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fda4af';
    ctx.fill();
  }

  // Head base with gradient
  const headGrad = ctx.createLinearGradient(0, -r, 0, r);
  headGrad.addColorStop(0, furTop);
  headGrad.addColorStop(1, furBottom);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.lineWidth = lineW;
  ctx.strokeStyle = accentColor ?? '#0f172a';
  ctx.stroke();

  // Fuzzy top hair tuft
  ctx.beginPath();
  ctx.moveTo(-r * 0.24, -r * 0.92);
  ctx.quadraticCurveTo(-r * 0.05, -r * 1.32, r * 0.08, -r * 0.94);
  ctx.quadraticCurveTo(r * 0.24, -r * 1.24, r * 0.3, -r * 0.88);
  ctx.closePath();
  ctx.fillStyle = furBottom;
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // Tan face mask (eye lobes + muzzle)
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.12, r * 0.34, r * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.32, -r * 0.12, r * 0.34, r * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(0, r * 0.26, r * 0.72, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Blink cycle
  const blinkPhase = (time * 0.9 + blinkSeed) % 4.2;
  const isBlinking = mood !== 'ko' && mood !== 'panic' && blinkPhase > 4.02;

  // Eyes
  const eyeY = -r * 0.14;
  const eyeOffset = r * 0.33;
  const eyeR = r * 0.24;

  for (const side of [-1, 1]) {
    const ex = side * eyeOffset;
    if (mood === 'ko') {
      // X_X eyes
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(1.4, r * 0.11);
      ctx.lineCap = 'round';
      const d = eyeR * 0.7;
      ctx.beginPath();
      ctx.moveTo(ex - d, eyeY - d);
      ctx.lineTo(ex + d, eyeY + d);
      ctx.moveTo(ex + d, eyeY - d);
      ctx.lineTo(ex - d, eyeY + d);
      ctx.stroke();
    } else if (isBlinking || mood === 'happy') {
      // Happy crescent or blink
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(1.4, r * 0.1);
      ctx.beginPath();
      if (mood === 'happy') {
        ctx.arc(ex, eyeY + eyeR * 0.2, eyeR * 0.8, Math.PI * 1.15, Math.PI * 1.85);
      } else {
        ctx.moveTo(ex - eyeR * 0.8, eyeY);
        ctx.lineTo(ex + eyeR * 0.8, eyeY);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR * (mood === 'panic' ? 1.14 : 1), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Cross-eyed / goofy pupils
      const cross = mood === 'panic' || mood === 'tspin' ? -side * eyeR * 0.28 : 0;
      const px = ex + lookX * eyeR * 0.35 + cross;
      const py = eyeY + lookY * eyeR * 0.35 + (mood === 'tspin' ? side * eyeR * 0.22 : 0);
      const pupilR = mood === 'panic' ? eyeR * 0.36 : eyeR * 0.48;

      ctx.beginPath();
      ctx.arc(px, py, pupilR, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Eye shine
      ctx.beginPath();
      ctx.arc(px + pupilR * 0.3, py - pupilR * 0.35, pupilR * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  // Eyebrows for rage / tspin / panic
  if (mood === 'rage' || mood === 'smug' || mood === 'tspin') {
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = Math.max(1.4, r * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.56, eyeY - eyeR * 1.15);
    ctx.lineTo(-r * 0.12, eyeY - eyeR * (mood === 'rage' ? 0.72 : 1.05));
    ctx.moveTo(r * 0.56, eyeY - eyeR * (mood === 'smug' ? 1.4 : 1.15));
    ctx.lineTo(r * 0.12, eyeY - eyeR * (mood === 'rage' ? 0.72 : 1.05));
    ctx.stroke();
  }

  // Nostrils
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.arc(-r * 0.11, r * 0.13, Math.max(1, r * 0.065), 0, Math.PI * 2);
  ctx.arc(r * 0.11, r * 0.13, Math.max(1, r * 0.065), 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.lineWidth = Math.max(1.2, r * 0.075);
  ctx.strokeStyle = '#0f172a';
  if (mood === 'panic') {
    // Screaming O mouth
    ctx.beginPath();
    ctx.ellipse(0, r * 0.42, r * 0.24, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#991b1b';
    ctx.fill();
    ctx.stroke();
  } else if (mood === 'happy' || mood === 'tspin') {
    // Big goofy toothy grin
    ctx.beginPath();
    ctx.moveTo(-r * 0.38, r * 0.28);
    ctx.quadraticCurveTo(0, r * 0.72, r * 0.38, r * 0.28);
    ctx.closePath();
    ctx.fillStyle = '#991b1b';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.2, r * 0.3, r * 0.4, r * 0.11);
  } else if (mood === 'ko') {
    // Wavy KO mouth + tongue
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, r * 0.42);
    ctx.quadraticCurveTo(-r * 0.1, r * 0.3, 0, r * 0.42);
    ctx.quadraticCurveTo(r * 0.1, r * 0.54, r * 0.28, r * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(r * 0.14, r * 0.52, r * 0.12, r * 0.14, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fb7185';
    ctx.fill();
    ctx.stroke();
  } else if (mood === 'rage') {
    ctx.beginPath();
    ctx.rect(-r * 0.28, r * 0.3, r * 0.56, r * 0.2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
  } else {
    // Idle smile
    ctx.beginPath();
    ctx.arc(0, r * 0.26, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // Sweat drop in panic
  if (mood === 'panic') {
    const dropY = -r * 0.4 + ((time * 18) % (r * 0.5));
    ctx.beginPath();
    ctx.moveTo(r * 0.65, dropY - r * 0.16);
    ctx.quadraticCurveTo(r * 0.78, dropY + r * 0.05, r * 0.65, dropY + r * 0.12);
    ctx.quadraticCurveTo(r * 0.52, dropY + r * 0.05, r * 0.65, dropY - r * 0.16);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
  }

  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void {
  const r = Math.min(rad, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawCrateCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  cellType: CellType,
  opts: {
    time: number;
    hasMonkey?: boolean;
    monkeyMood?: MonkeyMood;
    blinkSeed?: number;
    alpha?: number;
    flash?: boolean;
  },
): void {
  const pad = Math.max(1, size * 0.05);
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;
  const radius = Math.max(2, size * 0.18);

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;

  if (opts.flash) {
    drawRoundedRect(ctx, bx, by, bs, bs, radius);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (cellType === 'GARBAGE') {
    // Rotten banana peel junk crate
    const g = ctx.createLinearGradient(bx, by, bx, by + bs);
    g.addColorStop(0, '#6b7280');
    g.addColorStop(1, '#374151');
    drawRoundedRect(ctx, bx, by, bs, bs, radius);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * 0.08);
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    // Inner bevel & slippery banana peel splat
    if (size >= 14) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, bx + 2, by + 2, bs - 4, bs - 4, radius * 0.7);
      ctx.stroke();

      const cx = bx + bs * 0.5;
      const cy = by + bs * 0.55;
      ctx.fillStyle = '#a16207';
      ctx.beginPath();
      ctx.moveTo(cx - bs * 0.28, cy + bs * 0.16);
      ctx.quadraticCurveTo(cx, cy - bs * 0.34, cx + bs * 0.28, cy + bs * 0.16);
      ctx.quadraticCurveTo(cx, cy + bs * 0.02, cx - bs * 0.28, cy + bs * 0.16);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(cx, cy - bs * 0.12, bs * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  const theme = PIECE_THEMES[cellType];
  const grad = ctx.createLinearGradient(bx, by, bx, by + bs);
  grad.addColorStop(0, theme.topColor);
  grad.addColorStop(1, theme.bottomColor);

  drawRoundedRect(ctx, bx, by, bs, bs, radius);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, size * 0.08);
  ctx.strokeStyle = theme.borderColor;
  ctx.stroke();

  if (size >= 13) {
    // Top gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    drawRoundedRect(ctx, bx + bs * 0.1, by + bs * 0.08, bs * 0.8, bs * 0.2, radius * 0.5);
    ctx.fill();

    // Crate diagonal plank line
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.moveTo(bx + bs * 0.16, by + bs * 0.84);
    ctx.lineTo(bx + bs * 0.84, by + bs * 0.16);
    ctx.stroke();

    const cx = bx + bs * 0.5;
    const cy = by + bs * 0.52;

    if (opts.hasMonkey) {
      drawMonkeyHead(ctx, cx, cy, bs * 0.34, {
        mood: opts.monkeyMood ?? 'idle',
        time: opts.time,
        blinkSeed: opts.blinkSeed,
        lookY: 0.3,
      });
    } else {
      drawCrateEmblem(ctx, cx, cy, bs, theme.emblem);
    }
  }

  ctx.restore();
}

function drawCrateEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bs: number,
  emblem: (typeof PIECE_THEMES)['I']['emblem'],
): void {
  ctx.save();
  ctx.translate(cx, cy);
  switch (emblem) {
    case 'banana': {
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.moveTo(-bs * 0.22, -bs * 0.16);
      ctx.quadraticCurveTo(bs * 0.25, -bs * 0.05, bs * 0.16, bs * 0.22);
      ctx.quadraticCurveTo(bs * 0.02, bs * 0.04, -bs * 0.22, -bs * 0.16);
      ctx.fillStyle = '#fef9c3';
      ctx.fill();
      ctx.lineWidth = Math.max(1, bs * 0.06);
      ctx.strokeStyle = '#713f12';
      ctx.stroke();
      break;
    }
    case 'coconut': {
      ctx.beginPath();
      ctx.arc(0, 0, bs * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#451a03';
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(-bs * 0.06, -bs * 0.05, bs * 0.045, 0, Math.PI * 2);
      ctx.arc(bs * 0.06, -bs * 0.05, bs * 0.045, 0, Math.PI * 2);
      ctx.arc(0, bs * 0.05, bs * 0.045, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'vine': {
      ctx.fillStyle = '#dcfce7';
      ctx.beginPath();
      ctx.ellipse(-bs * 0.06, 0, bs * 0.18, bs * 0.1, -0.5, 0, Math.PI * 2);
      ctx.ellipse(bs * 0.09, bs * 0.05, bs * 0.14, bs * 0.08, 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'chili': {
      ctx.fillStyle = '#fff1f2';
      ctx.beginPath();
      ctx.moveTo(-bs * 0.15, -bs * 0.12);
      ctx.quadraticCurveTo(bs * 0.2, -bs * 0.1, bs * 0.14, bs * 0.22);
      ctx.quadraticCurveTo(-bs * 0.06, bs * 0.12, -bs * 0.15, -bs * 0.12);
      ctx.fill();
      break;
    }
    case 'acai': {
      ctx.fillStyle = '#e0f2fe';
      for (const [ox, oy] of [[-0.09, -0.06], [0.09, -0.06], [0, 0.08]]) {
        ctx.beginPath();
        ctx.arc(ox * bs, oy * bs, bs * 0.095, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'papaya': {
      ctx.beginPath();
      ctx.arc(0, 0, bs * 0.19, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#ffedd5';
      ctx.fill();
      break;
    }
    case 'monkey': {
      ctx.fillStyle = '#faf5ff';
      ctx.beginPath();
      ctx.arc(0, 0, bs * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

export function drawCoachMonkey(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  opts: {
    mood: MonkeyMood;
    time: number;
    speech: string;
    combo: number;
    playerColor: string;
  },
): void {
  const { mood, time, speech, combo, playerColor } = opts;
  ctx.save();
  ctx.translate(cx, cy);

  const bounce =
    mood === 'happy' || mood === 'tspin'
      ? Math.abs(Math.sin(time * 9)) * -10 * scale
      : mood === 'panic'
        ? Math.sin(time * 24) * 2.5 * scale
        : Math.sin(time * 3.2) * 2.5 * scale;

  ctx.translate(0, bounce);

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 26 * scale, 24 * scale, 26 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#78350f';
  ctx.fill();
  ctx.lineWidth = 2.5 * scale;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // Belly
  ctx.beginPath();
  ctx.ellipse(0, 29 * scale, 14 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fde68a';
  ctx.fill();

  // Waving arms
  const armWave = mood === 'happy' || mood === 'tspin' ? Math.sin(time * 14) * 0.5 : Math.sin(time * 3) * 0.15;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 22 * scale, 18 * scale);
    ctx.rotate(side * (0.4 + armWave));
    ctx.beginPath();
    ctx.roundRect(-5 * scale, -4 * scale, 10 * scale, 22 * scale, 5 * scale);
    ctx.fillStyle = '#92400e';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    ctx.restore();
  }

  // Head
  drawMonkeyHead(ctx, 0, -4 * scale, 26 * scale, {
    mood,
    time,
    lookX: Math.sin(time * 1.4) * 0.4,
    lookY: mood === 'panic' ? -0.35 : 0.15,
    accentColor: playerColor,
  });

  // Combo crown / banana badge
  if (combo >= 2) {
    ctx.font = `900 ${Math.round(12 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.strokeText(`🔥 x${combo + 1}`, 0, -37 * scale);
    ctx.fillText(`🔥 x${combo + 1}`, 0, -37 * scale);
  }

  ctx.restore();

  // Speech bubble above
  if (speech) {
    ctx.save();
    const fontSize = Math.max(10, Math.round(11.5 * scale));
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(speech);
    const bw = Math.min(180 * scale, metrics.width + 18 * scale);
    const bh = 24 * scale;
    const bx = cx - bw * 0.5;
    const by = cy - 66 * scale;

    drawRoundedRect(ctx, bx, by, bw, bh, 8 * scale);
    ctx.fillStyle = mood === 'panic' ? '#fef2f2' : '#fef9c3';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = mood === 'panic' ? '#ef4444' : '#ca8a04';
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(speech, cx, by + bh * 0.52, bw - 10 * scale);
    ctx.restore();
  }
}
