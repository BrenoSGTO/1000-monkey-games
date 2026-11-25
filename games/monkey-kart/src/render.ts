import { DRIVERS } from './drivers';
import type { Fx } from './fx';
import { type Kart } from './kart';
import { ANGLES, SPR_PPU, SPR_S, getKartSprite } from './kartsprite';
import { project } from './gl/math';
import { Ground } from './mode7';
import { Scene3D, renderKartPortrait } from './render3d';
import { setKartPortraitRenderer } from './ui';
import { portraitCanvas } from './monkeyart';
import { bananaPeel, chineloSprite, cocoSprite, hazardBillboard, itemBoxFace, sceneryBillboard } from './objsprites';
import { THEME_STYLES, paintBackdrop, paintTrackTexture } from './trackart';
import { type Track, WORLD, hazardPos } from './tracks';
import { EXPR_CRY, EXPR_HAPPY, EXPR_NORMAL, EXPR_SCREAM, ITEM_INFO, LAPS } from './types';
import { TAU, clamp, fmtTime, wrapAngle } from './util';
import type { World } from './world';

export interface ViewSpec {
  slot: number;
  kart: Kart;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Msg {
  text: string;
  color: string;
  t: number;
  size: number;
}

export class ViewState {
  camH = 0;
  shake = 0;
  flash = 0;
  flashColor = '#ef4444';
  msgs: Msg[] = [];
  banner: Msg | null = null;
  camBack = 230;
  lastPlace = 0;
  placePop = 0;
  initialized = false;
  rouletteIcon = 0;
  fov = 1.1;
  eyeY = 34;
  lookY = 16;
  dist = 96;
  note(text: string, color = '#fde047', size = 30, t = 2): void {
    this.banner = { text, color, t, size };
  }
  toast(text: string, color = '#fff'): void {
    this.msgs.push({ text, color, t: 3.2, size: 18 });
    if (this.msgs.length > 4) this.msgs.shift();
  }
}

const CAM_HEIGHT = 58;
const CAM_BACK = 250;

interface Bb {
  z: number;
  draw: () => void;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  ground: Ground | null = null;
  backdrop: HTMLCanvasElement | null = null;
  track: Track | null = null;
  mini: { c: HTMLCanvasElement; mx: (x: number) => number; my: (y: number) => number } | null = null;
  states = [new ViewState(), new ViewState()];
  time = 0;
  dpr = 1;
  nameTags = true;
  /** Real 3D renderer (WebGL2). Null = classic pseudo-3D fallback. */
  s3d: Scene3D | null = null;
  glCanvas: HTMLCanvasElement | null = null;
  glDpr = 1;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    if (new URLSearchParams(window.location.search).get('classic') === null) {
      const gc = document.createElement('canvas');
      gc.id = 'gl-canvas';
      canvas.parentElement?.insertBefore(gc, canvas);
      this.s3d = Scene3D.create(gc);
      if (this.s3d) {
        this.glCanvas = gc;
        setKartPortraitRenderer((d) => renderKartPortrait(d));
      } else gc.remove();
    }
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.glCanvas) {
      this.glDpr = Math.min(window.devicePixelRatio || 1, 2);
      // keep the pixel budget sane on huge screens
      const budget = 2560 * 1440;
      if (w * h * this.glDpr * this.glDpr > budget) this.glDpr = Math.sqrt(budget / (w * h));
      this.glCanvas.width = Math.round(w * this.glDpr);
      this.glCanvas.height = Math.round(h * this.glDpr);
      this.glCanvas.style.width = `${w}px`;
      this.glCanvas.style.height = `${h}px`;
    }
  }

  setTrack(track: Track): void {
    this.track = track;
    if (this.s3d) {
      this.s3d.setTrack(track);
      this.ground = null;
      this.backdrop = null;
    } else {
      const tex = paintTrackTexture(track);
      this.ground = new Ground(tex, THEME_STYLES[track.def.theme].fog);
      this.backdrop = paintBackdrop(track.def.theme);
    }
    // minimap
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < track.N; i++) {
      minX = Math.min(minX, track.px[i]);
      maxX = Math.max(maxX, track.px[i]);
      minY = Math.min(minY, track.py[i]);
      maxY = Math.max(maxY, track.py[i]);
    }
    const S = 168;
    const pad = 12;
    const scale = (S - pad * 2) / Math.max(maxX - minX, maxY - minY);
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d')!;
    const mx = (x: number) => pad + (x - minX) * scale + (S - pad * 2 - (maxX - minX) * scale) / 2;
    const my = (y: number) => pad + (y - minY) * scale + (S - pad * 2 - (maxY - minY) * scale) / 2;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const trace = () => {
      g.beginPath();
      for (let i = 0; i < track.N; i += 3) {
        const x = mx(track.px[i]);
        const y = my(track.py[i]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    };
    trace();
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = 9;
    g.stroke();
    trace();
    g.strokeStyle = '#e2e8f0';
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = '#fb923c';
    g.lineWidth = 3;
    for (const sc of track.shortcuts) {
      g.beginPath();
      sc.forEach((p, i) => (i ? g.lineTo(mx(p.x), my(p.y)) : g.moveTo(mx(p.x), my(p.y))));
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.fillRect(mx(track.px[0]) - 5, my(track.py[0]) - 1.5, 10, 3);
    this.mini = { c, mx, my };
    for (const s of this.states) {
      s.initialized = false;
    }
  }

  // ------------------------------------------------------------ main render

  render(world: World, views: ViewSpec[], fx: Fx, dt: number, uiOverlay = false): void {
    this.time += dt;
    this.nameTags = world.phase !== 'grid';
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.s3d && this.track) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      this.s3d.beginFrame();
      for (const v of views) this.renderView3d(world, v, fx, dt);
      if (views.length > 1) {
        ctx.fillStyle = '#0b1020';
        ctx.fillRect(views[0].x + views[0].w - 2, 0, 4, window.innerHeight);
      }
      return;
    }
    ctx.fillStyle = '#050814';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    if (!this.ground || !this.track) return;
    for (const v of views) this.renderView(world, v, fx, dt);
    // split divider
    if (views.length > 1) {
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(views[0].x + views[0].w - 2, 0, 4, window.innerHeight);
    }
    void uiOverlay;
  }

  private renderView3d(world: World, v: ViewSpec, fx: Fx, dt: number): void {
    const s3d = this.s3d!;
    const st = this.states[v.slot];
    const k = v.kart;
    const gd = this.glDpr;
    const VP = s3d.renderView(world, k, st, fx, v.x * gd, v.y * gd, v.w * gd, v.h * gd, dt, this.glCanvas!.height);
    const ctx = this.ctx;
    const W = v.w;
    const H = v.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, W, H);
    ctx.clip();
    ctx.translate(v.x, v.y);
    const f = s3d.focal;
    const toScreen = (x: number, y: number, z: number) => {
      const p = project(VP, x, y, z);
      if (p.w <= 1) return null;
      return { x: (p.x * 0.5 + 0.5) * W, y: (0.5 - p.y * 0.5) * H, s: (f * H) / (2 * p.w), w: p.w };
    };
    // floating texts
    for (const pt of fx.list) {
      if (pt.kind !== 'text') continue;
      const p = toScreen(pt.x, pt.z, pt.y);
      if (!p || p.w > 2200) continue;
      const t = pt.life / pt.max;
      const fs = clamp(pt.size * p.s * 1.3, 12, 40);
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = clamp(t * 2.2, 0, 1);
      ctx.lineWidth = Math.max(3, fs * 0.16);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(pt.text, p.x, p.y);
      ctx.fillStyle = pt.color;
      ctx.fillText(pt.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    // name tags
    if (this.nameTags) {
      for (const o of world.karts) {
        if (o === k || o.fallT > 0) continue;
        const p = toScreen(o.x, 64, o.y);
        if (!p || p.w > 700) continue;
        const fs = clamp(14 * p.s * 1.3, 10, 18);
        ctx.font = `800 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(o.name, p.x, p.y);
        ctx.fillStyle = DRIVERS[o.driver].color;
        ctx.fillText(o.name, p.x, p.y);
      }
    }
    this.drawOverlays(ctx, st, k, W, H, dt);
    this.drawHud(ctx, world, v, st, W, H, dt);
    ctx.restore();
  }

  private renderView(world: World, v: ViewSpec, fx: Fx, dt: number): void {
    const ctx = this.ctx;
    const tr = this.track!;
    const st = this.states[v.slot];
    const k = v.kart;
    const W = v.w;
    const H = v.h;

    // camera
    const targetH = k.h - k.drift * 0.28;
    if (!st.initialized) {
      st.camH = k.h;
      st.initialized = true;
    }
    const rate = Math.min(1, dt * 6);
    st.camH += wrapAngle(targetH - st.camH) * rate;
    const boosting = k.boostT > 0 ? 1 : 0;
    st.camBack += ((CAM_BACK + boosting * 34 - (k.fallT > 0 ? 0 : 0)) - st.camBack) * Math.min(1, dt * 4);
    const camH = st.camH;
    const cosH = Math.cos(camH);
    const sinH = Math.sin(camH);
    const kx = k.fallT > 0 ? k.x : k.x;
    const camX = kx - cosH * st.camBack;
    const camY = k.y - sinH * st.camBack;

    const ps = W > 900 ? 3 : W > 520 ? 2 : 1.5;
    const bw = Math.ceil(W / ps);
    const bh = Math.ceil(H / ps);
    const hzB = Math.round(bh * 0.4);
    const fB = bw * (boosting ? 0.8 : 0.88);
    const fM = fB * ps;
    const hzM = hzB * ps;
    const camHt = CAM_HEIGHT;

    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, W, H);
    ctx.clip();
    const shk = st.shake;
    const sx = shk > 0.2 ? (Math.random() - 0.5) * shk : 0;
    const sy = shk > 0.2 ? (Math.random() - 0.5) * shk : 0;
    ctx.translate(v.x + sx, v.y + sy);
    st.shake = Math.max(0, st.shake - dt * 28);

    // ---- sky
    const bd = this.backdrop!;
    const span = TAU * fM;
    const baseX = W / 2 - (((camH % TAU) + TAU) % TAU) * fM;
    for (let i = -1; i <= 2; i++) {
      const dx = baseX + i * span;
      if (dx > W + 4 || dx + span < -4) continue;
      ctx.drawImage(bd, 0, 0, bd.width, bd.height, dx, -4, span + 1, hzM + 6);
    }

    // ---- ground
    const gc = this.ground!.render(camX, camY, camH, bw, bh, hzB, fB, camHt);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(gc, 0, hzM - 1, W, H - hzM + 1);

    // ---- billboards
    const list: Bb[] = [];
    const proj = (wx: number, wy: number) => {
      const dx = wx - camX;
      const dy = wy - camY;
      const Y = dx * cosH + dy * sinH;
      const X = -dx * sinH + dy * cosH;
      return { X, Y };
    };
    const place = (wx: number, wy: number, maxD: number) => {
      const p = proj(wx, wy);
      if (p.Y < 30 || p.Y > maxD) return null;
      const s = fM / p.Y;
      const px = W / 2 + p.X * s;
      if (px < -400 || px > W + 400) return null;
      return { s, px, gy: hzM + camHt * s, Y: p.Y };
    };

    // scenery
    for (const sc of tr.scenery) {
      const p = place(sc.x, sc.y, 3800);
      if (!p) continue;
      const bb = sceneryBillboard(sc.kind);
      const w = bb.wU * sc.scale * p.s;
      const h = bb.hU * sc.scale * p.s;
      if (px_out(p.px, w, W)) continue;
      list.push({
        z: p.Y,
        draw: () => {
          if (sc.flip) {
            ctx.save();
            ctx.translate(p.px, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(bb.c, -w / 2, p.gy - h, w, h);
            ctx.restore();
          } else ctx.drawImage(bb.c, p.px - w / 2, p.gy - h, w, h);
        },
      });
    }

    // start gantry
    {
      const hw = tr.halfW + 20;
      const x0 = tr.px[0];
      const y0 = tr.py[0];
      const lx = x0 - tr.nx[0] * hw;
      const ly = y0 - tr.ny[0] * hw;
      const rx = x0 + tr.nx[0] * hw;
      const ry = y0 + tr.ny[0] * hw;
      const a = place(lx, ly, 3600);
      const b = place(rx, ry, 3600);
      if (a && b) {
        list.push({
          z: Math.min(a.Y, b.Y) - 5,
          draw: () => {
            const H0 = 170;
            const ax = a.px;
            const bx = b.px;
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = Math.max(2, 9 * a.s);
            ctx.beginPath();
            ctx.moveTo(ax, a.gy);
            ctx.lineTo(ax, a.gy - H0 * a.s);
            ctx.stroke();
            ctx.lineWidth = Math.max(2, 9 * b.s);
            ctx.beginPath();
            ctx.moveTo(bx, b.gy);
            ctx.lineTo(bx, b.gy - H0 * b.s);
            ctx.stroke();
            // banner
            const ya = a.gy - H0 * a.s;
            const yb = b.gy - H0 * b.s;
            const ha = 44 * a.s;
            const hb = 44 * b.s;
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(ax, ya);
            ctx.lineTo(bx, yb);
            ctx.lineTo(bx, yb + hb);
            ctx.lineTo(ax, ya + ha);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2;
            ctx.stroke();
            // checker strip
            const n = 14;
            for (let i = 0; i < n; i++) {
              const t0 = i / n;
              const t1 = (i + 1) / n;
              ctx.fillStyle = i % 2 ? '#111827' : '#f8fafc';
              const x0c = ax + (bx - ax) * t0;
              const x1c = ax + (bx - ax) * t1;
              const y0c = ya + (yb - ya) * t0;
              const y1c = ya + (yb - ya) * t1;
              ctx.beginPath();
              ctx.moveTo(x0c, y0c);
              ctx.lineTo(x1c, y1c);
              ctx.lineTo(x1c, y1c + hb * 0.22);
              ctx.lineTo(x0c, y0c + ha * 0.22);
              ctx.closePath();
              ctx.fill();
            }
            ctx.save();
            const mx = (ax + bx) / 2;
            const my = (ya + yb) / 2 + (ha + hb) * 0.1;
            ctx.translate(mx, my + (ha + hb) * 0.18);
            ctx.rotate(Math.atan2(yb - ya, bx - ax));
            ctx.fillStyle = '#7c2d12';
            ctx.font = `900 ${Math.max(8, (ha + hb) * 0.26)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('MICO KART 🍌', 0, 0);
            ctx.restore();
          },
        });
      }
    }

    // item boxes
    const spots = tr.boxSpots;
    const boxFace = itemBoxFace();
    for (let i = 0; i < spots.length; i++) {
      if (world.boxT[i] > 0) continue;
      const p = place(spots[i].x, spots[i].y, 2600);
      if (!p) continue;
      list.push({
        z: p.Y,
        draw: () => {
          const bob = Math.sin(this.time * 3 + i) * 5;
          const size = 44 * p.s;
          const ang = this.time * 2 + i * 0.7;
          const wx = size * (0.35 + 0.65 * Math.abs(Math.cos(ang)));
          const y = p.gy - (26 + bob) * p.s;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(p.px, p.gy, size * 0.4, size * 0.1, 0, 0, TAU);
          ctx.fill();
          ctx.save();
          ctx.shadowColor = '#fde047';
          ctx.shadowBlur = 14;
          ctx.drawImage(boxFace, p.px - wx / 2, y - size / 2, wx, size);
          ctx.restore();
        },
      });
    }

    // hazards
    for (const hz of tr.hazards) {
      const hp = hazardPos(tr, hz, world.clock);
      const p = place(hp.x, hp.y, 2600);
      if (!p) continue;
      const bb = hazardBillboard(hz.kind);
      const mirror = hp.vx * -sinH + hp.vy * cosH < 0;
      const bounce = hz.kind === 'asteroid' ? Math.sin(this.time * 2 + hz.phase) * 12 : Math.abs(Math.sin(this.time * 9 + hz.phase)) * 4;
      const size = hz.kind === 'asteroid' ? 70 : hz.kind === 'log' ? 100 : 56;
      const w = size * p.s * (bb.wU / bb.hU > 1.2 ? 1.2 : 1);
      const h = w * (bb.hU / bb.wU);
      list.push({
        z: p.Y,
        draw: () => {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(p.px, p.gy, w * 0.4, w * 0.1, 0, 0, TAU);
          ctx.fill();
          ctx.save();
          ctx.translate(p.px, p.gy - (hz.kind === 'asteroid' ? 18 + bounce : bounce) * p.s);
          if (mirror) ctx.scale(-1, 1);
          ctx.drawImage(bb.c, -w / 2, -h, w, h);
          ctx.restore();
        },
      });
    }

    // items
    for (const it of world.items) {
      const p = place(it.x, it.y, 2600);
      if (!p) continue;
      list.push({ z: p.Y, draw: () => this.drawItem(ctx, it, p, world) });
    }

    // karts
    for (const o of world.karts) {
      const p = place(o.x, o.y, 3000);
      if (!p) continue;
      list.push({ z: p.Y, draw: () => this.drawKart(ctx, o, p, camH, o === k) });
    }

    // particles
    for (const pt of fx.list) {
      const p = place(pt.x, pt.y, 2200);
      if (!p) continue;
      list.push({ z: p.Y - 1, draw: () => this.drawParticle(ctx, pt, p) });
    }

    list.sort((a, b) => b.z - a.z);
    for (const b of list) b.draw();

    // ---- overlays
    this.drawOverlays(ctx, st, k, W, H, dt);
    this.drawHud(ctx, world, v, st, W, H, dt);
    ctx.restore();
  }

  // ---------------------------------------------------------------- drawing

  private drawKart(ctx: CanvasRenderingContext2D, k: Kart, p: { s: number; px: number; gy: number; Y: number }, camH: number, isMe: boolean): void {
    const phi = wrapAngle(k.h + k.spinAngle - camH);
    const idx = Math.round((phi / TAU) * ANGLES);
    let expr = EXPR_NORMAL;
    if (k.finished) expr = EXPR_HAPPY;
    else if (k.fallT > 0 || k.spinT > 0 || (k.slowT > 0 && k.hitBy === 'nuvem') || k.stingT > 0) expr = EXPR_CRY;
    else if (k.drift !== 0 || k.boostT > 0.1 || k.exprT > 0) expr = k.expr === EXPR_NORMAL ? EXPR_SCREAM : k.expr;
    const spr = getKartSprite(k.driver, idx, expr);
    const sc = p.s / SPR_PPU;
    const size = SPR_S * sc;
    const hopH = k.hopT > 0 ? Math.sin(clamp(k.hopT / 0.2, 0, 1) * Math.PI) * 7 : 0;
    const bumpH = k.bumpT > 0 ? Math.sin(k.bumpT * 30) * 2 : 0;
    const air = k.hopT > 0.2 ? Math.sin(clamp((k.hopT - 0.2) / 0.3, 0, 1) * Math.PI) * 30 : 0;
    const lift = (hopH + bumpH + air) * p.s;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(p.px, p.gy, 30 * p.s * (k.fallT > 0 ? Math.max(0.1, k.fallT / 1.3) : 1), 11 * p.s, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    if (k.invulnT > 0 && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    let drop = 0;
    let scale = 1;
    if (k.fallT > 0) {
      const f = 1 - k.fallT / 1.3;
      drop = f * 90 * p.s;
      scale = Math.max(0.05, 1 - f);
      ctx.globalAlpha *= 1 - f * 0.8;
    }
    ctx.translate(p.px, p.gy + drop);
    ctx.rotate(-k.drift * 0.07 + k.steer * 0.025);
    ctx.scale(scale, scale);
    // sprite origin: (105,165) in 210px sprite
    ctx.drawImage(spr, -size * 0.5, -size * (165 / SPR_S) - lift, size, size);
    ctx.restore();

    // boost glow around kart
    if (k.boostT > 0) {
      const g = ctx.createRadialGradient(p.px, p.gy - 20 * p.s, 2, p.px, p.gy - 20 * p.s, 55 * p.s);
      g.addColorStop(0, 'rgba(253,224,71,0.25)');
      g.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.px - 60 * p.s, p.gy - 80 * p.s, 120 * p.s, 120 * p.s);
    }

    // nametag
    if (!isMe && p.Y < 650 && k.fallT <= 0 && this.nameTags) {
      const fs = clamp(15 * p.s * 1.3, 10, 18);
      ctx.font = `800 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const ty = p.gy - 112 * p.s - lift;
      ctx.strokeText(k.name, p.px, ty);
      ctx.fillStyle = DRIVERS[k.driver].color;
      ctx.fillText(k.name, p.px, ty);
    }
  }

  private drawItem(ctx: CanvasRenderingContext2D, it: import('./world').Item, p: { s: number; px: number; gy: number; Y: number }, world: World): void {
    void world;
    const s = p.s;
    switch (it.type) {
      case 'banana': {
        const bb = bananaPeel();
        const w = 46 * s;
        const h = w * (bb.hU / bb.wU);
        ctx.drawImage(bb.c, p.px - w / 2, p.gy - h, w, h);
        break;
      }
      case 'coco': {
        const bb = cocoSprite();
        const w = 46 * s;
        const h = w * (bb.hU / bb.wU);
        const bob = Math.abs(Math.sin(it.spin * 0.7)) * 6;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.px, p.gy, w * 0.4, w * 0.1, 0, 0, TAU);
        ctx.fill();
        ctx.drawImage(bb.c, p.px - w / 2, p.gy - h - (10 + bob) * s, w, h);
        // propeller
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = Math.max(1.5, 3 * s);
        const pw = 22 * s * Math.cos(it.spin * 3);
        const py = p.gy - h - (10 + bob) * s + h * 0.06;
        ctx.beginPath();
        ctx.moveTo(p.px - pw, py);
        ctx.lineTo(p.px + pw, py);
        ctx.stroke();
        break;
      }
      case 'chinelo': {
        const bb = chineloSprite();
        const w = 40 * s;
        const wx = w * Math.abs(Math.cos(it.spin * 0.8)) + 3;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.px, p.gy, w * 0.4, w * 0.1, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(p.px, p.gy - 22 * s);
        ctx.rotate(Math.sin(it.spin * 0.8) * 0.3);
        ctx.drawImage(bb.c, -wx / 2, -w / 2, wx, w);
        ctx.restore();
        break;
      }
      case 'nuvem': {
        const fade = clamp(it.life / 3, 0.2, 1);
        const r = 78 * s * clamp(it.life / 3, 0.35, 1);
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + this.time * 0.9;
          const ox = Math.cos(a) * r * 0.55;
          const oy = Math.sin(a * 1.3) * r * 0.12;
          const g = ctx.createRadialGradient(p.px + ox, p.gy - r * 0.35 + oy, 1, p.px + ox, p.gy - r * 0.35 + oy, r * 0.55);
          g.addColorStop(0, `rgba(170,230,90,${0.75 * fade})`);
          g.addColorStop(1, 'rgba(90,150,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.px + ox, p.gy - r * 0.35 + oy, r * 0.55, 0, TAU);
          ctx.fill();
        }
        ctx.font = `${Math.max(10, 30 * s)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = fade;
        ctx.fillText('💨', p.px, p.gy - r * 0.2);
        ctx.globalAlpha = 1;
        break;
      }
      case 'enxame': {
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = i * 2.4 + this.time * 14;
          const rr = (14 + (i % 4) * 7) * s;
          const x = p.px + Math.cos(a) * rr * 1.3;
          const y = p.gy - (30 + Math.sin(a * 1.7) * 14 + (i % 3) * 8) * s;
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.ellipse(x, y, 4.5 * s, 3.2 * s, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#111827';
          ctx.fillRect(x - 1 * s, y - 3 * s, 1.8 * s, 6 * s);
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.ellipse(x, y - 4 * s, 3.4 * s, 1.8 * s, Math.sin(this.time * 60 + i) * 0.6, 0, TAU);
          ctx.fill();
        }
        break;
      }
    }
  }

  private drawParticle(ctx: CanvasRenderingContext2D, pt: import('./fx').Particle, p: { s: number; px: number; gy: number; Y: number }): void {
    const t = pt.life / pt.max;
    const s = p.s;
    const y = p.gy - pt.z * s;
    switch (pt.kind) {
      case 'spark':
      case 'drop': {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = clamp(t * 1.6, 0, 1);
        const r = Math.max(1, pt.size * s * 0.55);
        ctx.beginPath();
        ctx.arc(p.px, y, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'glow': {
        const r = pt.size * s * (0.6 + (1 - t) * 0.5);
        const g = ctx.createRadialGradient(p.px, y, 0, p.px, y, r);
        g.addColorStop(0, pt.color);
        g.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.globalAlpha = t;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.px, y, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'smoke': {
        const r = pt.size * s * (1 + (1 - t) * 1.2);
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = t * 0.7;
        ctx.beginPath();
        ctx.arc(p.px, y, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'dust':
      case 'leaf': {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = t;
        const r = Math.max(1, pt.size * s * 0.6);
        ctx.beginPath();
        ctx.ellipse(p.px, y, r, r * 0.7, pt.life * 5, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'star': {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = clamp(t * 2, 0, 1);
        const r = Math.max(2, pt.size * s * 0.9);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? r * 0.45 : r;
          const a = (i / 10) * TAU + pt.life * 6;
          const x = p.px + Math.cos(a) * rr;
          const yy = y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'ring': {
        ctx.strokeStyle = pt.color;
        ctx.globalAlpha = t;
        ctx.lineWidth = Math.max(1.5, 4 * s);
        ctx.beginPath();
        ctx.ellipse(p.px, y, pt.size * s * (2 - t), pt.size * s * (2 - t) * 0.35, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'text': {
        const fs = clamp(pt.size * s * 1.3, 12, 40);
        ctx.font = `900 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = clamp(t * 2.2, 0, 1);
        ctx.lineWidth = Math.max(3, fs * 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(pt.text, p.px, y);
        ctx.fillStyle = pt.color;
        ctx.fillText(pt.text, p.px, y);
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, st: ViewState, k: Kart, W: number, H: number, dt: number): void {
    // speed streaks when boosting
    if (k.boostT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * TAU;
        const r0 = Math.min(W, H) * (0.4 + Math.random() * 0.15);
        const r1 = r0 + Math.min(W, H) * (0.12 + Math.random() * 0.15);
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(a) * r0 * 1.4, H * 0.55 + Math.sin(a) * r0 * 0.8);
        ctx.lineTo(W / 2 + Math.cos(a) * r1 * 1.4, H * 0.55 + Math.sin(a) * r1 * 0.8);
        ctx.stroke();
      }
    }
    // cough tint
    if (k.slowT > 0 && k.hitBy === 'nuvem') {
      ctx.fillStyle = `rgba(110,170,40,${clamp(k.slowT / 1.8, 0, 1) * 0.28})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (k.stingT > 0) {
      ctx.fillStyle = `rgba(250,204,21,${clamp(k.stingT / 3, 0, 1) * 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (st.flash > 0) {
      ctx.fillStyle = st.flashColor;
      ctx.globalAlpha = clamp(st.flash, 0, 0.55);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      st.flash = Math.max(0, st.flash - dt * 1.4);
    }
    // vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // -------------------------------------------------------------------- HUD

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'left', stroke = 'rgba(0,0,0,0.8)'): void {
    ctx.font = `900 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.2);
    ctx.strokeStyle = stroke;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  private drawHud(ctx: CanvasRenderingContext2D, world: World, v: ViewSpec, st: ViewState, W: number, H: number, dt: number): void {
    const k = v.kart;
    const u = clamp(Math.min(W / 760, H / 560), 0.55, 1.5);
    const tr = this.track!;
    const split = world.karts.some((o) => o.owner === 1) && world.karts.some((o) => o.owner === 0);
    const topPad = v.slot === 0 ? 50 : 10;

    // place
    if (st.lastPlace !== k.place) {
      st.placePop = 1;
      st.lastPlace = k.place;
    }
    st.placePop = Math.max(0, st.placePop - dt * 3);
    const pc = ['#fde047', '#e5e7eb', '#fdba74'][k.place - 1] ?? '#ffffff';
    this.text(ctx, `${k.place}º`, W - 18 * u, 74 * u + (topPad - 10) * 0.2 + 6, (64 + st.placePop * 22) * u, pc, 'right');
    this.text(ctx, `/${world.karts.length}`, W - 18 * u, 100 * u, 22 * u, '#cbd5e1', 'right');
    const lap = clamp(k.lap, 1, LAPS);
    this.text(ctx, `VOLTA ${lap}/${LAPS}`, W - 18 * u, 128 * u, 22 * u, '#fff', 'right');
    const tm = Math.max(0, world.t);
    this.text(ctx, fmtTime(k.finished ? k.finishTime : tm), W - 18 * u, 152 * u, 18 * u, '#fde68a', 'right');

    // item slot
    const bx = 16 * u;
    const by = topPad * u + 6;
    const bs = 74 * u;
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.strokeStyle = k.item ? '#fde047' : '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(bx, by, bs, bs, 14 * u);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${bs * 0.58}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
    if (k.rouletteT > 0) {
      const types = Object.keys(ITEM_INFO) as (keyof typeof ITEM_INFO)[];
      const ix = Math.floor(this.time * 14) % types.length;
      ctx.globalAlpha = 0.85;
      ctx.fillText(ITEM_INFO[types[ix]].emoji, bx + bs / 2, by + bs / 2 + 3);
      ctx.globalAlpha = 1;
    } else if (k.item) {
      const bump = 1 + Math.sin(this.time * 8) * 0.06;
      ctx.save();
      ctx.translate(bx + bs / 2, by + bs / 2 + 3);
      ctx.scale(bump, bump);
      ctx.fillText(ITEM_INFO[k.item].emoji, 0, 0);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
    if (k.item && !split) {
      this.text(ctx, ITEM_INFO[k.item].name, bx + bs + 10 * u, by + 28 * u, 17 * u, '#fef08a');
      this.text(ctx, ITEM_INFO[k.item].hint, bx + bs + 10 * u, by + 50 * u, 12 * u, '#e2e8f0');
    }

    // portrait
    const face = k.finished ? EXPR_HAPPY : k.spinT > 0 || k.fallT > 0 ? EXPR_CRY : k.drift !== 0 || k.boostT > 0 ? EXPR_SCREAM : k.expr;
    const ps = 88 * u;
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.strokeStyle = DRIVERS[k.driver].color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(18 * u + ps / 2, H - 18 * u - ps / 2, ps / 2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(18 * u + ps / 2, H - 18 * u - ps / 2, ps / 2 - 1, 0, TAU);
    ctx.clip();
    const pcv = portraitCanvas(k.driver, face, 96);
    ctx.drawImage(pcv, 18 * u, H - 18 * u - ps, ps, ps);
    ctx.restore();
    this.text(ctx, DRIVERS[k.driver].nick, 18 * u + ps / 2, H - 18 * u - ps - 8 * u, 14 * u, '#fff', 'center');

    // speed + drift meter
    const mw = Math.min(W * 0.34, 300 * u);
    const mx = W / 2 - mw / 2;
    const my = H - 34 * u;
    const mh = 14 * u;
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.beginPath();
    ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 10);
    ctx.fill();
    const top = world.cc.max * DRIVERS[k.driver].top * 1.45;
    const sp = clamp(Math.abs(k.spd) / top, 0, 1);
    const g = ctx.createLinearGradient(mx, 0, mx + mw, 0);
    g.addColorStop(0, '#4ade80');
    g.addColorStop(0.7, '#fde047');
    g.addColorStop(1, '#f87171');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw * sp, mh, 7);
    ctx.fill();
    this.text(ctx, `${Math.round(Math.abs(k.spd) * 0.5)} km/h`, mx + mw, my - 8 * u, 13 * u, '#e2e8f0', 'right');
    if (k.drift !== 0) {
      const cols = ['#e5e7eb', '#38bdf8', '#fb923c', '#d946ef'];
      const thr = [0.85, 1.7, 2.9];
      const frac = clamp(k.driftT / thr[2], 0, 1);
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.beginPath();
      ctx.roundRect(mx, my - 22 * u, mw * 0.6, 9 * u, 5);
      ctx.fill();
      ctx.fillStyle = cols[k.driftLvl];
      ctx.beginPath();
      ctx.roundRect(mx, my - 22 * u, mw * 0.6 * frac, 9 * u, 5);
      ctx.fill();
      for (const t of thr.slice(0, 2)) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(mx + mw * 0.6 * (t / thr[2]) - 1, my - 22 * u, 2, 9 * u);
      }
      if (k.driftLvl > 0) this.text(ctx, ['', 'MINI-TURBO!', 'SUPER TURBO!', 'ULTRA BANANA!'][k.driftLvl], mx + mw * 0.3, my - 28 * u, 14 * u, cols[k.driftLvl], 'center');
    }

    // minimap
    if (this.mini) {
      const ms = (split ? 120 : 168) * clamp(u, 0.6, 1.1);
      const mmx = W - ms - 12 * u;
      const mmy = H * 0.5 - ms / 2 + 24 * u;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.mini.c, mmx, mmy, ms, ms);
      ctx.globalAlpha = 1;
      const m = this.mini;
      for (const o of world.karts) {
        const x = mmx + m.mx(o.x) * (ms / m.c.width);
        const y = mmy + m.my(o.y) * (ms / m.c.height);
        ctx.fillStyle = DRIVERS[o.driver].color;
        ctx.strokeStyle = o === k ? '#fff' : '#0f172a';
        ctx.lineWidth = o === k ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(x, y, o === k ? 5.5 : 3.8, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      void tr;
    }

    // standings (single view only)
    if (!split && W > 640) {
      const ordered = [...world.karts].sort((a, b) => a.place - b.place);
      const lx = 16 * u;
      let ly = by + bs + 24 * u;
      ctx.font = `800 ${12 * u}px system-ui, sans-serif`;
      for (const o of ordered) {
        ctx.fillStyle = o === k ? 'rgba(250,204,21,0.35)' : 'rgba(15,23,42,0.5)';
        ctx.beginPath();
        ctx.roundRect(lx, ly - 13 * u, 142 * u, 17 * u, 5);
        ctx.fill();
        this.text(ctx, `${o.place}`, lx + 14 * u, ly, 12 * u, '#e2e8f0', 'center');
        ctx.fillStyle = DRIVERS[o.driver].color;
        ctx.beginPath();
        ctx.arc(lx + 30 * u, ly - 4.5 * u, 4.5 * u, 0, TAU);
        ctx.fill();
        this.text(ctx, o.name.length > 14 ? o.name.slice(0, 13) + '…' : o.name, lx + 40 * u, ly, 12 * u, o === k ? '#fde047' : '#fff');
        ly += 19 * u;
      }
    }

    // wrong way
    if (k.wrongWayT > 1.2 && !k.finished) {
      const blink = Math.floor(this.time * 3) % 2 === 0;
      if (blink) this.text(ctx, '⚠ CONTRAMÃO, MACACO! ⚠', W / 2, H * 0.28, 30 * u, '#f87171', 'center');
    }

    // banner
    if (world.phase === 'grid') {
      const n = Math.ceil(world.countT - 1.2);
      if (n >= 1 && n <= 3) {
        const frac = 1 - ((world.countT - 1.2) % 1);
        this.text(ctx, String(n), W / 2, H * 0.4, (120 + (1 - frac) * 50) * u, ['#f87171', '#fde047', '#4ade80'][n - 1], 'center');
      } else if (n > 3) {
        this.text(ctx, 'PREPARAR...', W / 2, H * 0.38, 44 * u, '#fff', 'center');
        this.text(ctx, 'Segure ACELERAR só no "2" para largar queimando!', W / 2, H * 0.38 + 34 * u, 15 * u, '#fde68a', 'center');
      }
    } else if (world.t < 1.2 && world.phase === 'racing') {
      this.text(ctx, 'VAI, MACACADA!', W / 2, H * 0.36, 66 * u, '#4ade80', 'center');
    }
    if (st.banner) {
      st.banner.t -= dt;
      if (st.banner.t <= 0) st.banner = null;
      else {
        const b = st.banner;
        const a = clamp(b.t * 2, 0, 1);
        ctx.globalAlpha = a;
        this.text(ctx, b.text, W / 2, H * 0.3 + (1 - a) * 12, b.size * u, b.color, 'center');
        ctx.globalAlpha = 1;
      }
    }
    // toasts (above the portrait, to its right)
    let ty = H - 40 * u - st.msgs.length * 20 * u;
    st.msgs = st.msgs.filter((m) => (m.t -= dt) > 0);
    ty = H - 118 * u - (st.msgs.length - 1) * 20 * u;
    for (const m of st.msgs) {
      ctx.globalAlpha = clamp(m.t, 0, 1);
      this.text(ctx, m.text, 118 * u, ty, 15 * u, m.color);
      ctx.globalAlpha = 1;
      ty += 20 * u;
    }
    void WORLD;
  }
}

function px_out(px: number, w: number, W: number): boolean {
  return px + w / 2 < -10 || px - w / 2 > W + 10;
}
