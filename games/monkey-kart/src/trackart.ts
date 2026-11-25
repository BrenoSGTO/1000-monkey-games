import { makeCanvas } from './monkeyart';
import { type Theme, type Track, TEX, TEX_SCALE } from './tracks';
import { TAU, mulberry32, shade } from './util';

export interface ThemeStyle {
  fog: string;
  skyTop: string;
  void: string;
  slow: string;
  road: string;
  kerbA: string;
  kerbB: string;
  line: string;
}

export const THEME_STYLES: Record<Theme, ThemeStyle> = {
  jungle: { fog: '#9bd9b8', skyTop: '#38bdf8', void: '#17402e', slow: '#2f8a3a', road: '#8a6a44', kerbA: '#7a4a24', kerbB: '#d9c18f', line: '#f4ecc2' },
  favela: { fog: '#f6a56a', skyTop: '#312e81', void: '#2a1f2d', slow: '#a47a55', road: '#3a3e49', kerbA: '#facc15', kerbB: '#111827', line: '#f8fafc' },
  beach: { fog: '#bfe9f7', skyTop: '#0ea5e9', void: '#0ea5c9', slow: '#f2d48a', road: '#b8864b', kerbA: '#ef4444', kerbB: '#f8fafc', line: '#fff4d1' },
  space: { fog: '#33206b', skyTop: '#02030f', void: '#04051a', slow: '#586079', road: '#1c2240', kerbA: '#22d3ee', kerbB: '#e879f9', line: '#7dd3fc' },
};

type Ctx = CanvasRenderingContext2D;

function pathTrack(ctx: Ctx, track: Track): void {
  const s = 1 / TEX_SCALE;
  ctx.beginPath();
  for (let i = 0; i < track.N; i++) {
    const x = track.px[i] * s;
    const y = track.py[i] * s;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function pathPoly(ctx: Ctx, pts: { x: number; y: number }[]): void {
  const s = 1 / TEX_SCALE;
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x * s, p.y * s);
    else ctx.lineTo(p.x * s, p.y * s);
  });
}

/** Draws something on a temporary layer, speckles it with source-atop and merges. */
let RES = 1;

function layer(main: Ctx, draw: (c: Ctx) => void, speckle: (c: Ctx) => void): void {
  const l = makeCanvas(TEX * RES, TEX * RES);
  const c = l.getContext('2d')!;
  c.scale(RES, RES);
  draw(c);
  c.globalCompositeOperation = 'source-atop';
  speckle(c);
  main.drawImage(l, 0, 0, TEX, TEX);
}

function speckles(c: Ctx, rnd: () => number, count: number, colors: string[], size: number, alpha = 1): void {
  c.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const sz = 1 + rnd() * size;
    c.fillRect(rnd() * TEX, rnd() * TEX, sz, sz * (0.6 + rnd() * 0.8));
  }
  c.globalAlpha = 1;
}

/** Paints the top-down track texture. `res` multiplies the pixel resolution (logical size stays TEX). */
export function paintTrackTexture(track: Track, res = 1): HTMLCanvasElement {
  const def = track.def;
  const st = THEME_STYLES[def.theme];
  RES = res;
  const cv = makeCanvas(TEX * res, TEX * res);
  const ctx = cv.getContext('2d')!;
  ctx.scale(res, res);
  const rnd = mulberry32(def.seed * 7 + 1);
  const s = 1 / TEX_SCALE;
  const hw = def.halfW * s;
  const mg = def.margin * s;

  // ------------------------------------------------ void
  ctx.fillStyle = st.void;
  ctx.fillRect(0, 0, TEX, TEX);
  switch (def.theme) {
    case 'jungle': {
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(10,50,40,0.25)' : 'rgba(40,110,80,0.18)';
        ctx.beginPath();
        ctx.ellipse(rnd() * TEX, rnd() * TEX, 6 + rnd() * 40, 3 + rnd() * 18, rnd() * 3, 0, TAU);
        ctx.fill();
      }
      for (let i = 0; i < 700; i++) {
        const x = rnd() * TEX;
        const y = rnd() * TEX;
        ctx.fillStyle = '#2e8b4a';
        ctx.beginPath();
        ctx.arc(x, y, 5 + rnd() * 6, 0.3, TAU - 0.3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,255,200,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 9 + rnd() * 6, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'favela': {
      const cols = ['#e07a5f', '#f2cc8f', '#81b29a', '#3d405b', '#c9ada7', '#4a6fa5', '#f4a261', '#e9c46a', '#6d597a'];
      for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        const w = 5 + rnd() * 12;
        const x = rnd() * TEX;
        const y = rnd() * TEX;
        ctx.fillRect(x, y, w, 4 + rnd() * 10);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x, y + 3, w, 2);
      }
      break;
    }
    case 'beach': {
      const g = ctx.createLinearGradient(0, 0, TEX, TEX);
      g.addColorStop(0, '#0891b2');
      g.addColorStop(0.5, '#22c4e0');
      g.addColorStop(1, '#0e7490');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TEX, TEX);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * TEX;
        const y = rnd() * TEX;
        const w = 8 + rnd() * 22;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
        ctx.stroke();
      }
      break;
    }
    case 'space': {
      for (let i = 0; i < 7; i++) {
        const x = rnd() * TEX;
        const y = rnd() * TEX;
        const r = 160 + rnd() * 260;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const col = ['rgba(120,60,200,0.35)', 'rgba(30,90,200,0.3)', 'rgba(200,50,140,0.25)'][i % 3];
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 5000; i++) {
        const b = rnd();
        ctx.fillStyle = b < 0.8 ? 'rgba(255,255,255,0.7)' : b < 0.93 ? '#fde68a' : '#93c5fd';
        const z = rnd() < 0.9 ? 1.5 : 3;
        ctx.fillRect(rnd() * TEX, rnd() * TEX, z, z);
      }
      break;
    }
  }

  // shore foam for the beach
  if (def.theme === 'beach') {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    pathTrack(ctx, track);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = (hw + mg) * 2 + 34;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,240,255,0.5)';
    ctx.lineWidth = (hw + mg) * 2 + 18;
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------ slow band
  layer(
    ctx,
    (c) => {
      c.lineJoin = 'round';
      c.lineCap = 'round';
      pathTrack(c, track);
      c.strokeStyle = st.slow;
      c.lineWidth = (hw + mg) * 2;
      c.stroke();
    },
    (c) => {
      if (def.theme === 'jungle') {
        speckles(c, rnd, 24000, ['#3da64a', '#256f31', '#1d5a2a', '#58c466'], 3.5, 0.55);
        speckles(c, rnd, 900, ['#fde047', '#f472b6', '#ffffff'], 2.5, 0.9);
      } else if (def.theme === 'favela') {
        speckles(c, rnd, 22000, ['#b78c62', '#8d6746', '#c9a37a', '#7a5a3e'], 3, 0.6);
      } else if (def.theme === 'beach') {
        speckles(c, rnd, 24000, ['#f8e2a6', '#e6c577', '#fff1c4', '#d9b765'], 3, 0.55);
        speckles(c, rnd, 260, ['#f87171', '#fb923c', '#fff'], 4, 0.9);
      } else {
        speckles(c, rnd, 8000, ['#6b7491', '#47506b', '#7d87a6'], 3, 0.5);
        c.strokeStyle = 'rgba(15,23,42,0.5)';
        c.lineWidth = 1.2;
        for (let i = 0; i < TEX; i += 22) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, TEX);
          c.moveTo(0, i);
          c.lineTo(TEX, i);
          c.stroke();
        }
      }
    },
  );

  // ------------------------------------------------ shortcuts (under road)
  for (const sc of track.shortcuts) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    pathPoly(ctx, sc);
    if (def.theme === 'space') {
      ctx.strokeStyle = 'rgba(103,232,249,0.5)';
      ctx.lineWidth = 92 * s;
      ctx.stroke();
      ctx.strokeStyle = '#13306b';
      ctx.lineWidth = 80 * s;
      pathPoly(ctx, sc);
      ctx.stroke();
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      pathPoly(ctx, sc);
      ctx.stroke();
    } else {
      ctx.strokeStyle = shade(st.slow, 0.55);
      ctx.lineWidth = 96 * s;
      ctx.stroke();
      const col = def.theme === 'jungle' ? '#a1713d' : def.theme === 'favela' ? '#9ca3af' : '#e9d08f';
      pathPoly(ctx, sc);
      ctx.strokeStyle = col;
      ctx.lineWidth = 80 * s;
      ctx.stroke();
      // planks / steps
      pathPoly(ctx, sc);
      ctx.strokeStyle = shade(col, 0.6);
      ctx.lineWidth = 80 * s;
      ctx.setLineDash([2, def.theme === 'beach' ? 22 : 9]);
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------ kerbs
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  pathTrack(ctx, track);
  ctx.strokeStyle = st.kerbA;
  ctx.lineWidth = (hw + 9) * 2;
  ctx.setLineDash([13, 13]);
  ctx.stroke();
  pathTrack(ctx, track);
  ctx.strokeStyle = st.kerbB;
  ctx.lineDashOffset = 13;
  ctx.stroke();
  ctx.restore();

  // ------------------------------------------------ road
  layer(
    ctx,
    (c) => {
      c.lineJoin = 'round';
      c.lineCap = 'round';
      pathTrack(c, track);
      c.strokeStyle = st.road;
      c.lineWidth = hw * 2;
      c.stroke();
    },
    (c) => {
      if (def.theme === 'jungle') {
        speckles(c, rnd, 14000, ['#7a5c3a', '#9b7a50', '#6b4e30'], 3, 0.55);
        speckles(c, rnd, 500, ['#3da64a', '#c2a35a', '#d97706'], 4, 0.8);
      } else if (def.theme === 'favela') {
        speckles(c, rnd, 16000, ['#2e323c', '#4a4f5c', '#3f4452'], 2.4, 0.6);
      } else if (def.theme === 'beach') {
        c.strokeStyle = 'rgba(92,58,22,0.55)';
        c.lineWidth = 1.5;
        for (let i = 0; i < 1200; i++) {
          const x = rnd() * TEX;
          const y = rnd() * TEX;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16);
          c.stroke();
        }
        speckles(c, rnd, 12000, ['#c6955a', '#a67537', '#d3a468'], 3, 0.5);
      } else {
        speckles(c, rnd, 9000, ['#2b3566', '#232b55', '#34406f'], 3, 0.6);
      }
    },
  );

  // lane markings
  ctx.save();
  ctx.lineJoin = 'round';
  pathTrack(ctx, track);
  ctx.strokeStyle = st.line;
  ctx.globalAlpha = def.theme === 'beach' ? 0.55 : 0.85;
  ctx.lineWidth = Math.max(2, 5 * s);
  ctx.setLineDash([24, 26]);
  ctx.stroke();
  if (def.theme === 'space') {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.5;
    for (const o of [-0.8, 0.8]) {
      ctx.beginPath();
      for (let i = 0; i < track.N; i++) {
        const x = (track.px[i] + track.nx[i] * def.halfW * o) * s;
        const y = (track.py[i] + track.ny[i] * def.halfW * o) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();

  // ------------------------------------------------ puddles
  for (const p of track.puddles) {
    const x = p.x * s;
    const y = p.y * s;
    const r = p.r * s;
    const mud = def.theme === 'jungle' || def.theme === 'favela';
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, mud ? '#7a5a36' : '#7dd3fc');
    g.addColorStop(0.8, mud ? '#4a331b' : '#0ea5e9');
    g.addColorStop(1, mud ? 'rgba(60,40,20,0)' : 'rgba(14,165,233,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.85, 0.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.3 * i, r * 0.25 * i, 0.4, 0, TAU);
      ctx.stroke();
    }
  }

  // ------------------------------------------------ boost pads
  for (const p of track.pads) {
    ctx.save();
    ctx.translate(p.x * s, p.y * s);
    ctx.rotate(Math.atan2(p.ty, p.tx));
    const L = p.len * s;
    const W = p.wid * s;
    const neon = def.theme === 'space';
    ctx.fillStyle = neon ? '#0b1030' : '#7c2d12';
    ctx.strokeStyle = neon ? '#22d3ee' : '#fde047';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-L / 2, -W, L, W * 2, 6);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const x = -L / 2 + L * (0.18 + i * 0.28);
      ctx.fillStyle = i === 1 ? '#fde047' : '#f97316';
      if (neon) ctx.fillStyle = ['#22d3ee', '#e879f9', '#22d3ee'][i];
      ctx.beginPath();
      ctx.moveTo(x - L * 0.08, -W * 0.8);
      ctx.lineTo(x + L * 0.1, 0);
      ctx.lineTo(x - L * 0.08, W * 0.8);
      ctx.lineTo(x - L * 0.02, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------ start / finish line
  {
    ctx.save();
    ctx.translate(track.px[0] * s, track.py[0] * s);
    ctx.rotate(Math.atan2(track.ty[0], track.tx[0]));
    const sq = 11;
    const rows = 2;
    const cols = Math.floor((hw * 2) / sq);
    const x0 = -(rows * sq) / 2;
    const y0 = -(cols * sq) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#f8fafc' : '#111827';
        ctx.fillRect(x0 + r * sq, y0 + c * sq, sq, sq);
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------ theme spice on the road
  if (def.theme === 'favela') {
    ctx.save();
    for (const t of [0.12, 0.47, 0.78]) {
      const i = Math.floor(t * track.N);
      ctx.save();
      ctx.translate(track.px[i] * s, track.py[i] * s);
      ctx.rotate(Math.atan2(track.ty[i], track.tx[i]));
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let k = -4; k <= 4; k++) ctx.fillRect(-5, k * hw * 0.2 - 3, 10, 6);
      ctx.restore();
    }
    ctx.restore();
  }
  if (def.theme === 'jungle') {
    for (let i = 0; i < 160; i++) {
      const j = Math.floor(rnd() * track.N);
      const lat = (rnd() - 0.5) * def.halfW * 1.5;
      const x = (track.px[j] + track.nx[j] * lat) * s;
      const y = (track.py[j] + track.ny[j] * lat) * s;
      ctx.fillStyle = rnd() < 0.5 ? '#4ade80' : '#facc15';
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 2, rnd() * 3, 0, TAU);
      ctx.fill();
    }
  }
  return cv;
}

// -------------------------------------------------------------------- sky

export function paintBackdrop(theme: Theme, W = 4096, H = 300): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const st = THEME_STYLES[theme];
  const rnd = mulberry32(theme.length * 977 + 5);
  const wrapX = (x: number, draw: (x: number) => void) => {
    draw(x);
    if (x < 400) draw(x + W);
    if (x > W - 400) draw(x - W);
  };
  const hills = (base: number, amp: number, freq: number, color: string, seed: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const a = (x / W) * TAU;
      const y = base - amp * (0.55 * Math.sin(a * freq + seed) + 0.3 * Math.sin(a * freq * 2.3 + seed * 2) + 0.15 * Math.sin(a * freq * 5.1 + seed * 3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  switch (theme) {
    case 'jungle':
      sky.addColorStop(0, '#2aa5e8');
      sky.addColorStop(0.65, '#9fe4f0');
      sky.addColorStop(1, st.fog);
      break;
    case 'favela':
      sky.addColorStop(0, '#2a2670');
      sky.addColorStop(0.45, '#c2410c');
      sky.addColorStop(0.8, '#fb923c');
      sky.addColorStop(1, st.fog);
      break;
    case 'beach':
      sky.addColorStop(0, '#0ea5e9');
      sky.addColorStop(0.7, '#a5e5fb');
      sky.addColorStop(1, st.fog);
      break;
    case 'space':
      sky.addColorStop(0, '#010208');
      sky.addColorStop(0.7, '#150b3a');
      sky.addColorStop(1, st.fog);
      break;
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const cloud = (x: number, y: number, s: number, col = 'rgba(255,255,255,0.85)') => {
    wrapX(x, (xx) => {
      ctx.fillStyle = col;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(xx + i * 24 * s - 60 * s, y + Math.sin(i * 2) * 8 * s, 34 * s, 20 * s, 0, 0, TAU);
        ctx.fill();
      }
    });
  };

  if (theme === 'space') {
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      const z = rnd() < 0.9 ? 1.2 : 2.4;
      ctx.fillRect(rnd() * W, rnd() * H * 0.9, z, z);
    }
    // big planet
    wrapX(900, (x) => {
      const g = ctx.createRadialGradient(x - 40, 100, 10, x, 130, 130);
      g.addColorStop(0, '#7dd3fc');
      g.addColorStop(0.55, '#2563eb');
      g.addColorStop(1, '#0b1a52');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, 135, 120, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(x - 30, 120, 50, 22, 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(x + 40, 160, 34, 12, -0.9, 0, TAU);
      ctx.fill();
    });
    // ringed planet
    wrapX(2600, (x) => {
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(x, 90, 46, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(253,230,138,0.85)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(x, 90, 90, 18, -0.3, 0, TAU);
      ctx.stroke();
    });
    // banana moon
    wrapX(3500, (x) => {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(x, 80, 38, 0.6, TAU - 0.2);
      ctx.arc(x + 18, 70, 36, TAU - 0.4, 0.8, true);
      ctx.closePath();
      ctx.fill();
    });
    hills(H - 6, 12, 14, '#0a0722', 2);
  } else if (theme === 'jungle') {
    wrapX(1500, (x) => {
      const g = ctx.createRadialGradient(x, 70, 6, x, 70, 90);
      g.addColorStop(0, 'rgba(255,255,230,1)');
      g.addColorStop(0.25, 'rgba(255,247,170,0.95)');
      g.addColorStop(1, 'rgba(255,247,170,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 100, -30, 200, 200);
    });
    for (let i = 0; i < 12; i++) cloud(rnd() * W, 40 + rnd() * 80, 0.7 + rnd() * 0.8);
    hills(H - 70, 60, 7, '#6fb3a0', 1);
    hills(H - 40, 50, 11, '#3f8e5e', 4);
    hills(H - 10, 35, 17, '#1f6b3d', 7);
    // palms on near ridge
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W;
      const h = 30 + rnd() * 40;
      ctx.fillStyle = '#145232';
      ctx.fillRect(x, H - 12 - h, 3, h);
      ctx.beginPath();
      ctx.ellipse(x + 1, H - 12 - h, 16, 7, 0, 0, TAU);
      ctx.fill();
    }
  } else if (theme === 'favela') {
    wrapX(2200, (x) => {
      const g = ctx.createRadialGradient(x, 190, 8, x, 190, 130);
      g.addColorStop(0, '#fff7c2');
      g.addColorStop(0.3, '#fbbf24');
      g.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 140, 40, 280, 260);
    });
    hills(H - 60, 45, 6, '#7c3a2d', 3);
    const skyline = (base: number, colors: string[], h0: number, litProb: number) => {
      let x = 0;
      while (x < W) {
        const w = 14 + rnd() * 26;
        const h = h0 + rnd() * 40;
        ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
        ctx.fillRect(x, base - h, w, h + 40);
        for (let wy = base - h + 6; wy < base - 4; wy += 9) {
          for (let wx = x + 3; wx < x + w - 5; wx += 8) {
            if (rnd() < litProb) {
              ctx.fillStyle = '#fde68a';
              ctx.fillRect(wx, wy, 3.5, 4.5);
            }
          }
        }
        x += w + rnd() * 3;
      }
    };
    skyline(H - 28, ['#5b2a2a', '#6a3030', '#4a2230'], 20, 0.18);
    skyline(H - 4, ['#2b1620', '#38202a', '#241320'], 14, 0.28);
  } else {
    // beach
    wrapX(1200, (x) => {
      const g = ctx.createRadialGradient(x, 60, 8, x, 60, 100);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.2, '#fef9c3');
      g.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 110, -40, 220, 220);
    });
    for (let i = 0; i < 12; i++) cloud(rnd() * W, 35 + rnd() * 90, 0.8 + rnd() * 0.9);
    // volcano island
    wrapX(3000, (x) => {
      ctx.fillStyle = '#4d7c5b';
      ctx.beginPath();
      ctx.moveTo(x - 160, H - 66);
      ctx.lineTo(x - 30, H - 150);
      ctx.lineTo(x + 20, H - 148);
      ctx.lineTo(x + 170, H - 66);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - 25, H - 152, 45, 6);
    });
    hills(H - 66, 8, 20, '#78c6e6', 1);
    // sea band
    const sea = ctx.createLinearGradient(0, H - 66, 0, H);
    sea.addColorStop(0, '#38b6dd');
    sea.addColorStop(1, st.fog);
    ctx.fillStyle = sea;
    ctx.fillRect(0, H - 66, W, 66);
    for (let i = 0; i < 12; i++) {
      const x = rnd() * W;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, H - 46);
      ctx.lineTo(x + 10, H - 46);
      ctx.lineTo(x + 5, H - 62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(x - 2, H - 46, 16, 3);
    }
  }

  // horizon haze
  const haze = ctx.createLinearGradient(0, H - 70, 0, H);
  haze.addColorStop(0, 'rgba(0,0,0,0)');
  haze.addColorStop(1, st.fog);
  ctx.fillStyle = haze;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, H - 70, W, 70);
  ctx.globalAlpha = 1;
  return cv;
}
