import { DRIVERS, type DriverArt } from './drivers';
import { EXPR_CRY, EXPR_HAPPY, EXPR_SCREAM } from './types';
import { TAU, clamp, shade } from './util';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export interface HeadView {
  /** sin/cos of the yaw of the head relative to camera (phi=0: seen from behind) */
  sinP: number;
  cosP: number;
  /** pitch of the camera: sin/cos */
  sp: number;
  cp: number;
  /** head tilt (roll) in radians */
  tilt?: number;
  /** blink / dizzy phase */
  t?: number;
}

/** Draws a monkey head centered at (cx, cy) with radius R. */
export function drawHead(ctx: CanvasRenderingContext2D, art: DriverArt, cx: number, cy: number, R: number, v: HeadView, expr: number): void {
  const { sinP, cosP, sp, cp } = v;
  ctx.save();
  ctx.translate(cx, cy);
  if (v.tilt) ctx.rotate(v.tilt);

  // projects a point on the head sphere (head-local f forward, r right, u up; in units of R)
  const P = (f: number, r: number, u: number) => {
    const X = f * sinP + r * cosP;
    const Y = f * cosP - r * sinP;
    return { x: X * R, y: -(u * cp + Y * sp) * R, vis: -cp * Y + sp * u, d: Y };
  };

  // hair mass behind (orangutan / mandrill fluff)
  if (art.extra === 'flanges') {
    ctx.fillStyle = shade(art.furDark, 1);
    ctx.beginPath();
    ctx.ellipse(0, R * 0.1, R * 1.28, R * 1.2, 0, 0, TAU);
    ctx.fill();
  }

  // ears (behind head when far, in front when near)
  const earSide = (s: number, front: boolean) => {
    const e = P(0.05, s * 1.0, 0.18);
    const isFront = e.d < 0;
    if (isFront !== front) return;
    const er = R * (art.extra === 'tufts' ? 0.5 : 0.4);
    if (art.extra === 'tufts') {
      // big white tufts
      ctx.fillStyle = art.ear;
      ctx.beginPath();
      ctx.ellipse(e.x + s * R * 0.25, e.y - R * 0.2, er * 0.8, er * 1.2, s * 0.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.stroke();
    }
    ctx.fillStyle = art.fur;
    ctx.beginPath();
    ctx.arc(e.x, e.y, er, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = shade(art.furDark, 1);
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.stroke();
    ctx.fillStyle = art.ear;
    ctx.beginPath();
    ctx.arc(e.x - s * er * 0.1, e.y, er * 0.62, 0, TAU);
    ctx.fill();
  };
  earSide(-1, false);
  earSide(1, false);

  // crest (gorilla)
  if (art.extra === 'crest') {
    ctx.fillStyle = art.furDark;
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.78, R * 0.62, R * 0.55, 0, 0, TAU);
    ctx.fill();
  }

  // skull
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
  g.addColorStop(0, shade(art.fur, 1.25));
  g.addColorStop(0.7, art.fur);
  g.addColorStop(1, shade(art.fur, 0.68));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = shade(art.furDark, 0.8);
  ctx.lineWidth = Math.max(1.2, R * 0.07);
  ctx.stroke();

  // face (only when the front is turned to camera)
  const faceC = P(0.9, 0, -0.05);
  const facing = faceC.vis;
  if (facing > 0.02) {
    const k = clamp(facing / 0.95, 0, 1);
    const fx = faceC.x;
    const fy = faceC.y;
    // face mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.985, 0, TAU);
    ctx.clip();
    ctx.fillStyle = art.face;
    ctx.beginPath();
    ctx.ellipse(fx * 0.95, fy + R * 0.05, R * 0.78 * Math.sqrt(k), R * 0.7, 0, 0, TAU);
    ctx.fill();
    if (art.extra === 'flanges') {
      ctx.fillStyle = art.extraColor;
      for (const s of [-1, 1]) {
        const c = P(0.65, s * 0.8, -0.1);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R * 0.3 * Math.sqrt(Math.max(0.1, k)), R * 0.5, 0, 0, TAU);
        ctx.fill();
      }
    }
    if (art.extra === 'mandrill') {
      // blue ridges on cheeks + red nose stripe
      ctx.fillStyle = art.extraColor;
      for (const s of [-1, 1]) {
        const c = P(0.8, s * 0.42, -0.3);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(s * 0.35);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.15 * Math.sqrt(k), R * 0.44, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ef4444';
      const n = P(0.98, 0, 0.1);
      ctx.beginPath();
      ctx.ellipse(n.x, n.y + R * 0.08, R * 0.14 * Math.sqrt(k), R * 0.45, 0, 0, TAU);
      ctx.fill();
    }
    // muzzle
    const mz = P(0.94, 0, -0.34);
    ctx.fillStyle = art.extra === 'mandrill' ? '#e6a5ad' : shade(art.face, 1.1);
    ctx.beginPath();
    ctx.ellipse(mz.x, mz.y, R * 0.46 * Math.sqrt(k), R * 0.34, 0, 0, TAU);
    ctx.fill();
    if (art.extra === 'cheeks') {
      ctx.fillStyle = 'rgba(244,114,182,0.5)';
      for (const s of [-1, 1]) {
        const c = P(0.75, s * 0.62, -0.18);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R * 0.16 * Math.sqrt(k), R * 0.12, 0, 0, TAU);
        ctx.fill();
      }
    }
    // nostrils
    ctx.fillStyle = 'rgba(40,20,10,0.8)';
    for (const s of [-1, 1]) {
      const n = P(1, s * 0.09, -0.2);
      ctx.beginPath();
      ctx.ellipse(n.x, n.y, R * 0.045, R * 0.06, 0, 0, TAU);
      ctx.fill();
    }
    // mouth
    const mc = P(1, 0, -0.5);
    ctx.strokeStyle = '#3a1a10';
    ctx.lineWidth = Math.max(1, R * 0.07);
    ctx.lineCap = 'round';
    const mw = R * 0.26 * Math.sqrt(k);
    if (expr === EXPR_SCREAM) {
      ctx.fillStyle = '#5a0f1a';
      ctx.beginPath();
      ctx.ellipse(mc.x, mc.y + R * 0.02, mw * 1.05, R * 0.27, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(mc.x, mc.y + R * 0.12, mw * 0.6, R * 0.1, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(mc.x - mw * 0.6, mc.y - R * 0.22, mw * 1.2, R * 0.07);
    } else if (expr === EXPR_CRY) {
      ctx.beginPath();
      ctx.moveTo(mc.x - mw, mc.y + R * 0.1);
      ctx.quadraticCurveTo(mc.x, mc.y - R * 0.16, mc.x + mw, mc.y + R * 0.1);
      ctx.stroke();
      ctx.fillStyle = '#5a0f1a';
      ctx.beginPath();
      ctx.ellipse(mc.x, mc.y + R * 0.02, mw * 0.5, R * 0.1, 0, 0, TAU);
      ctx.fill();
    } else if (expr === EXPR_HAPPY) {
      ctx.fillStyle = '#5a0f1a';
      ctx.beginPath();
      ctx.moveTo(mc.x - mw * 1.1, mc.y - R * 0.12);
      ctx.quadraticCurveTo(mc.x, mc.y + R * 0.36, mc.x + mw * 1.1, mc.y - R * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(mc.x - mw * 0.8, mc.y - R * 0.12, mw * 1.6, R * 0.07);
    } else {
      ctx.beginPath();
      ctx.moveTo(mc.x - mw, mc.y - R * 0.04);
      ctx.quadraticCurveTo(mc.x, mc.y + R * 0.2, mc.x + mw, mc.y - R * 0.04);
      ctx.stroke();
    }
    // eyes (slightly cross-eyed for the monkey-slop look)
    for (const s of [-1, 1]) {
      const e = P(0.82, s * 0.36, 0.2);
      const ex = e.x;
      const ey = e.y;
      const sq = Math.sqrt(clamp(e.vis / 0.9, 0.05, 1));
      const er = R * 0.2;
      if (expr === EXPR_HAPPY) {
        ctx.strokeStyle = '#2a140c';
        ctx.lineWidth = Math.max(1.4, R * 0.09);
        ctx.beginPath();
        ctx.arc(ex, ey + er * 0.4, er * 0.8 * sq, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, er * sq, er * (expr === EXPR_SCREAM ? 0.8 : 1.05), 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2a140c';
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.stroke();
      // pupils pulled toward the nose
      ctx.fillStyle = '#16090a';
      const px = ex - s * er * 0.42 * sq;
      if (expr === EXPR_CRY && v.t !== undefined) {
        // dizzy spiral-ish eyes
        ctx.strokeStyle = '#16090a';
        ctx.lineWidth = Math.max(1, R * 0.05);
        ctx.beginPath();
        for (let a = 0; a < 9; a += 0.4) {
          const rr = (a / 9) * er * 0.85 * sq;
          const x = ex + Math.cos(a + (v.t ?? 0) * 6) * rr;
          const y = ey + Math.sin(a + (v.t ?? 0) * 6) * rr;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(px, ey + er * 0.1, er * 0.46 * sq, er * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px - er * 0.12, ey - er * 0.15, er * 0.15, 0, TAU);
        ctx.fill();
      }
      // brows
      ctx.strokeStyle = art.furDark;
      ctx.lineWidth = Math.max(1.4, R * 0.09);
      ctx.beginPath();
      if (expr === EXPR_SCREAM) {
        ctx.moveTo(ex - er * 1.1, ey - er * (s > 0 ? 0.55 : 1.45));
        ctx.lineTo(ex + er * 1.1, ey - er * (s > 0 ? 1.45 : 0.55));
        // flip so brows slope toward the nose (angry)
      } else if (expr === EXPR_CRY) {
        ctx.moveTo(ex - er * s * -1.1, ey - er * 1.1);
        ctx.lineTo(ex + er * s * -1.1, ey - er * 1.5);
      } else {
        ctx.moveTo(ex - er, ey - er * 1.35);
        ctx.lineTo(ex + er, ey - er * 1.5);
      }
      ctx.stroke();
      if (expr === EXPR_CRY) {
        ctx.fillStyle = '#7dd3fc';
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.ellipse(ex + s * er * 0.5, ey + er * (1.5 + i * 1.1), er * 0.3, er * 0.5, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  } else {
    // back of the head: little hair swirl
    ctx.strokeStyle = shade(art.furDark, 1.1);
    ctx.lineWidth = Math.max(1, R * 0.07);
    ctx.beginPath();
    ctx.arc(R * 0.05, -R * 0.15, R * 0.28, 0.4, 5.3);
    ctx.stroke();
  }

  earSide(-1, true);
  earSide(1, true);

  // eyewear
  if (art.eyewear !== 'none') {
    ctx.save();
    const strap = P(0, 1, 0.2);
    void strap;
    ctx.strokeStyle = art.eyewear === 'goggles' ? '#1f2937' : shade(art.eyewearColor, 1.4);
    ctx.lineWidth = Math.max(1.5, R * 0.14);
    // strap around the head at eye level
    ctx.beginPath();
    const ey0 = P(0, 0, 0.2).y;
    ctx.ellipse(0, ey0, R * 0.99, R * 0.17, 0, 0, TAU);
    if (art.eyewear === 'goggles') ctx.stroke();
    if (facing > 0.02) {
      for (const s of [-1, 1]) {
        const e = P(0.85, s * 0.36, 0.2);
        const sq = Math.sqrt(clamp(e.vis / 0.9, 0.05, 1));
        if (art.eyewear === 'shades') {
          ctx.fillStyle = art.eyewearColor;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + R * 0.02, R * 0.3 * sq, R * 0.22, s * 0.15, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillRect(e.x - R * 0.2 * sq, e.y - R * 0.12, R * 0.12 * sq, R * 0.05);
        } else if (art.eyewear === 'goggles') {
          ctx.fillStyle = art.eyewearColor;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, R * 0.3 * sq, R * 0.27, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#1f2937';
          ctx.lineWidth = Math.max(1.5, R * 0.08);
          ctx.stroke();
        } else {
          ctx.strokeStyle = art.eyewearColor;
          ctx.lineWidth = Math.max(1.2, R * 0.06);
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, R * 0.28 * sq, R * 0.28, 0, 0, TAU);
          ctx.stroke();
        }
      }
      if (art.eyewear === 'shades' || art.eyewear === 'round') {
        const b = P(0.9, 0, 0.2);
        ctx.strokeStyle = art.eyewear === 'shades' ? art.eyewearColor : art.eyewearColor;
        ctx.lineWidth = Math.max(1, R * 0.05);
        ctx.beginPath();
        ctx.moveTo(b.x - R * 0.1, b.y);
        ctx.lineTo(b.x + R * 0.1, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // hats
  const topY = P(0, 0, 1).y;
  switch (art.hat) {
    case 'cap': {
      ctx.fillStyle = art.hatColor;
      ctx.beginPath();
      ctx.arc(0, -R * 0.06, R * 1.04, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(art.hatColor, 0.6);
      ctx.lineWidth = Math.max(1.2, R * 0.07);
      ctx.stroke();
      ctx.fillStyle = shade(art.hatColor, 0.8);
      ctx.beginPath();
      ctx.arc(0, topY - R * 0.02, R * 0.1, 0, TAU);
      ctx.fill();
      if (facing > 0.02) {
        // brim
        const b = P(1.15, 0, 0.55);
        ctx.fillStyle = shade(art.hatColor, 0.75);
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + R * 0.1, R * 0.72 * Math.sqrt(clamp(facing, 0.2, 1)), R * 0.2, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'bandana': {
      ctx.fillStyle = art.hatColor;
      ctx.beginPath();
      ctx.ellipse(0, P(0, 0, 0.55).y, R * 1.02, R * 0.24, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = shade(art.hatColor, 0.6);
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.stroke();
      ctx.fillStyle = shade(art.hatColor, 1.15);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(i * R * 0.35, P(0, 0, 0.55).y + (i % 2) * R * 0.05, R * 0.045, 0, TAU);
        ctx.fill();
      }
      if (facing <= 0.02) {
        // knot + tails seen from behind
        ctx.fillStyle = art.hatColor;
        ctx.beginPath();
        ctx.moveTo(0, P(0, 0, 0.55).y);
        ctx.lineTo(-R * 0.4, P(0, 0, 0.55).y + R * 0.6);
        ctx.lineTo(-R * 0.05, P(0, 0, 0.55).y + R * 0.45);
        ctx.lineTo(R * 0.3, P(0, 0, 0.55).y + R * 0.65);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'bow': {
      ctx.fillStyle = art.hatColor;
      const bx = R * 0.62;
      const by = -R * 0.85;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + s * R * 0.5 + R * 0.1, by - R * 0.3);
        ctx.lineTo(bx + s * R * 0.5 + R * 0.1, by + R * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shade(art.hatColor, 0.6);
        ctx.lineWidth = Math.max(1, R * 0.05);
        ctx.stroke();
      }
      ctx.fillStyle = shade(art.hatColor, 0.8);
      ctx.beginPath();
      ctx.arc(bx, by, R * 0.13, 0, TAU);
      ctx.fill();
      break;
    }
    case 'astro':
    case 'helmet': {
      ctx.fillStyle = shade(art.hatColor, 1);
      const hg = ctx.createRadialGradient(-R * 0.4, -R * 0.5, R * 0.1, 0, 0, R * 1.3);
      hg.addColorStop(0, '#ffffff');
      hg.addColorStop(1, shade(art.hatColor, 0.62));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(0, -R * 0.08, R * 1.2, Math.PI * 0.96, Math.PI * 2.04);
      ctx.lineTo(R * 1.15, R * 0.2);
      ctx.quadraticCurveTo(0, R * 0.55, -R * 1.15, R * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(art.hatColor, 0.5);
      ctx.lineWidth = Math.max(1.2, R * 0.07);
      ctx.stroke();
      if (facing > 0.02) {
        ctx.fillStyle = 'rgba(30,64,120,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, R * 0.12, R * 0.92 * Math.sqrt(clamp(facing, 0.25, 1)), R * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-R * 0.35, -R * 0.1, R * 0.16, R * 0.08, -0.5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-R * 0.1, -R * 1.22, R * 0.2, R * 0.28);
      break;
    }
    case 'crown': {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-R * 0.6, topY + R * 0.2);
      ctx.lineTo(-R * 0.6, topY - R * 0.4);
      ctx.lineTo(-R * 0.3, topY - R * 0.1);
      ctx.lineTo(0, topY - R * 0.5);
      ctx.lineTo(R * 0.3, topY - R * 0.1);
      ctx.lineTo(R * 0.6, topY - R * 0.4);
      ctx.lineTo(R * 0.6, topY + R * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function drawPortrait(ctx: CanvasRenderingContext2D, driver: number, expr: number, cx: number, cy: number, R: number, t = 0): void {
  const art = DRIVERS[driver].art;
  drawHead(ctx, art, cx, cy, R, { sinP: 0, cosP: -1, sp: 0.12, cp: 0.99, t }, expr);
}

const portraitCache = new Map<string, HTMLCanvasElement>();
export function portraitCanvas(driver: number, expr: number, size = 96): HTMLCanvasElement {
  const key = `${driver}|${expr}|${size}`;
  let c = portraitCache.get(key);
  if (!c) {
    c = makeCanvas(size, size);
    const ctx = c.getContext('2d')!;
    drawPortrait(ctx, driver, expr, size / 2, size * 0.54, size * 0.36);
    portraitCache.set(key, c);
  }
  return c;
}
