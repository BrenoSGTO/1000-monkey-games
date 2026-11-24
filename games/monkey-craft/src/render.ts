import { BLOCKS } from './data';
import type { Game, Remote } from './game';
import { drawMob, drawMonkey, type Expr, type MonkeyPose } from './monkey';
import { TEX, VARIANTS, WALL_ROW } from './textures';
import { B, H, W } from './types';
import { hash } from './worldgen';
import type { World } from './world';

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const NIGHT_TOP: RGB = [6, 10, 38];
const NIGHT_BOT: RGB = [22, 34, 78];
const DAY_TOP: RGB = [70, 178, 255];
const DAY_BOT: RGB = [206, 240, 255];
const DUSK_TOP: RGB = [96, 72, 156];
const DUSK_BOT: RGB = [255, 152, 92];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private light = document.createElement('canvas');
  private lightCtx = this.light.getContext('2d')!;
  private lightImg: ImageData | null = null;
  private last = performance.now();
  private stars: [number, number, number][] = [];
  private vw = 0;
  private vh = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private g: Game,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i < 100; i++) this.stars.push([hash(i, 1, 9), hash(i, 2, 9), 0.5 + hash(i, 3, 9) * 1.8]);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.floor(r.width));
    const h = Math.max(200, Math.floor(r.height));
    if (w === this.vw && h === this.vh && this.g.view.dpr === dpr) return;
    this.vw = w;
    this.vh = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    const v = this.g.view;
    v.dpr = dpr;
    v.wCss = w;
    v.hCss = h;
    v.wDev = this.canvas.width;
    v.hDev = this.canvas.height;
  }

  render(): void {
    const g = this.g;
    this.resize();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    const v = g.view;
    const playing = g.state === 'play';
    const world: World | null = playing ? g.world : g.demo;
    if (!world) {
      ctx.fillStyle = '#10241a';
      ctx.fillRect(0, 0, v.wDev, v.hDev);
      return;
    }
    const cssTs = clamp(Math.min(v.wCss / 32, v.hCss / 18), 22, 44) * (playing ? g.zoom : 1.15);
    v.ts = Math.max(12, Math.round(cssTs * v.dpr));
    const ts = v.ts;
    const halfW = v.wDev / ts / 2;
    const halfH = v.hDev / ts / 2;

    // ---- câmera
    let tx: number;
    let ty: number;
    if (playing) {
      const b = g.me.body;
      tx = b.x + b.vx * 0.12;
      ty = b.y - 1.2;
    } else {
      tx = W / 2 + Math.sin(g.clock * 0.02) * 120;
      ty = world.surf[Math.floor(clamp(tx, 0, W - 1))] - 3;
    }
    if (!g.camInit || !playing) {
      v.camX = tx;
      v.camY = ty;
      if (playing) g.camInit = true;
    } else {
      const k = Math.min(1, dt * 7);
      v.camX += (tx - v.camX) * k;
      v.camY += (ty - v.camY) * k;
    }
    v.camX = W < halfW * 2 ? W / 2 : clamp(v.camX, halfW, W - halfW);
    v.camY = clamp(v.camY, halfH - 10, H - halfH + 1);
    let shx = 0;
    let shy = 0;
    if (playing && g.shake > 0) {
      shx = (Math.random() - 0.5) * g.shake * ts * 0.5;
      shy = (Math.random() - 0.5) * g.shake * ts * 0.5;
    }
    v.offX = Math.round(v.wDev / 2 - v.camX * ts + shx);
    v.offY = Math.round(v.hDev / 2 - v.camY * ts + shy);

    const dayT = playing ? g.dayT() : 0.4;
    const day = playing ? g.daylight() : 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.drawSky(dayT, day, g.clock);
    const torches: [number, number, number][] = [];
    this.drawTiles(world, ts, g.clock, torches);

    // alvo / rachaduras
    if (playing && !g.me.dead) this.drawTarget(ts);

    // ---- entidades
    if (playing) this.drawEntities(ts);
    else this.drawDemoMonkey(world, ts);

    // ---- noite
    if (day < 1) {
      ctx.fillStyle = `rgba(12,22,80,${(1 - day) * 0.3})`;
      ctx.fillRect(0, 0, v.wDev, v.hDev);
    }
    this.drawLighting(world, ts, day, playing);

    // brilhos de tochas e minérios
    ctx.globalCompositeOperation = 'lighter';
    for (const [lx, ly, kind] of torches) {
      const cx = lx * ts + v.offX + ts / 2;
      const cy = ly * ts + v.offY + ts / 2;
      const r = ts * (kind === 0 ? 4.2 : kind === 1 ? 3 : 3.4);
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const flick = 0.85 + Math.sin(g.clock * 9 + lx * 3.1) * 0.15;
      if (kind === 0) {
        grd.addColorStop(0, `rgba(255,170,60,${0.34 * flick})`);
        grd.addColorStop(1, 'rgba(255,120,20,0)');
      } else if (kind === 1) {
        grd.addColorStop(0, `rgba(230,255,90,${0.3 * flick})`);
        grd.addColorStop(1, 'rgba(200,255,60,0)');
      } else {
        grd.addColorStop(0, `rgba(255,140,50,${0.3 * flick})`);
        grd.addColorStop(1, 'rgba(255,100,20,0)');
      }
      ctx.fillStyle = grd;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    if (playing) {
      this.drawPostParticles(ts);
      this.drawFloatTexts(ts);
      if (g.hurtFlash > 0) {
        const grd = ctx.createRadialGradient(v.wDev / 2, v.hDev / 2, v.hDev * 0.3, v.wDev / 2, v.hDev / 2, v.hDev * 0.85);
        grd.addColorStop(0, 'rgba(255,0,0,0)');
        grd.addColorStop(1, `rgba(220,20,20,${Math.min(0.42, g.hurtFlash * 1.3)})`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, v.wDev, v.hDev);
      }
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      g.ui.draw(ctx, g);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  // ------------------------------------------------------------ céu
  private drawSky(dayT: number, day: number, clock: number): void {
    const ctx = this.ctx;
    const v = this.g.view;
    const w = v.wDev;
    const h = v.hDev;
    const s = Math.sin((dayT - 0.25) * Math.PI * 2);
    const dayK = clamp((s + 0.2) / 0.5, 0, 1);
    const duskK = clamp(1 - Math.abs(s) / 0.32, 0, 1) * 0.75;
    let top = mix(NIGHT_TOP, DAY_TOP, dayK);
    let bot = mix(NIGHT_BOT, DAY_BOT, dayK);
    top = mix(top, DUSK_TOP, duskK);
    bot = mix(bot, DUSK_BOT, duskK);
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, rgb(top));
    grd.addColorStop(1, rgb(bot));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const ts = v.ts;
    const camShift = -(v.camY - 48) * ts * 0.3;

    // estrelas
    const nightK = clamp(1 - dayK * 1.4, 0, 1);
    if (nightK > 0.02) {
      for (const [sx, sy, sz] of this.stars) {
        const tw = 0.6 + Math.sin(clock * 2 + sx * 40) * 0.4;
        ctx.fillStyle = `rgba(255,255,230,${nightK * tw})`;
        ctx.fillRect(sx * w, sy * h * 0.7 + camShift * 0.4, sz * v.dpr, sz * v.dpr);
      }
    }
    // sol e lua
    const a = (dayT - 0.25) * Math.PI * 2;
    const R = ts * 1.5;
    const sunX = w / 2 - Math.cos(a) * w * 0.42;
    const sunY = h * 0.78 - Math.sin(a) * h * 0.7 + camShift;
    const moonX = w / 2 + Math.cos(a) * w * 0.42;
    const moonY = h * 0.78 + Math.sin(a) * h * 0.7 + camShift;
    if (s > -0.25) this.drawSun(sunX, sunY, R, clock);
    if (s < 0.25) this.drawBananaMoon(moonX, moonY, R * 0.9);

    // nuvens
    const cloudA = clamp(0.35 + day * 0.65, 0, 1);
    for (let i = 0; i < 8; i++) {
      const sp = 6 + (i % 3) * 3;
      const cx = (((i * 0.131 * (w + 600) + clock * sp * v.dpr - v.camX * ts * 0.1) % (w + 600)) + (w + 600)) % (w + 600) - 300;
      const cy = h * 0.1 + (i % 4) * h * 0.07 + camShift;
      this.cloud(cx, cy, ts * (1.6 + (i % 3) * 0.5), cloudA * 0.85, day);
    }
    // colinas de fundo (paralaxe)
    const hy = v.offY + 47 * ts;
    if (hy < h + ts * 6) {
      for (let layer = 0; layer < 2; layer++) {
        const base = layer === 0 ? mix([40, 92, 78], [96, 190, 130], day) : mix([20, 60, 50], [60, 150, 90], day);
        ctx.fillStyle = rgb(mix([10, 14, 30], base, 0.35 + day * 0.65));
        ctx.beginPath();
        ctx.moveTo(0, h);
        const par = layer === 0 ? 0.25 : 0.45;
        for (let x = 0; x <= w + 16; x += 16) {
          const wx = (x - v.camX * ts * par) / (ts * (layer === 0 ? 7 : 4));
          const hh = (Math.sin(wx * 1.3) * 2.2 + Math.sin(wx * 0.5 + 2) * 3.2 + (layer === 0 ? 5.5 : 2.5)) * ts;
          ctx.lineTo(x, hy - hh + layer * ts * 1.5);
        }
        ctx.lineTo(w, h);
        ctx.fill();
      }
    }
  }

  private cloud(x: number, y: number, r: number, a: number, day: number): void {
    const ctx = this.ctx;
    const c = Math.round(90 + day * 165);
    ctx.fillStyle = `rgba(${c},${c},${Math.min(255, c + 8)},${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x - r * 0.7, y + r * 0.1, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.6, y - r * 0.15, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSun(x: number, y: number, r: number, clock: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,240,150,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(clock * 0.15);
    ctx.fillStyle = '#ffd23c';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(r * 1.05, -r * 0.12);
      ctx.lineTo(r * 1.5, 0);
      ctx.lineTo(r * 1.05, r * 0.12);
      ctx.fill();
    }
    ctx.rotate(-clock * 0.15 - Math.PI * 2);
    ctx.fillStyle = '#ffe45c';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    // óculos escuros + sorriso
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-r * 0.7, -r * 0.3, r * 0.58, r * 0.38, r * 0.1);
    ctx.roundRect(r * 0.12, -r * 0.3, r * 0.58, r * 0.38, r * 0.1);
    ctx.fill();
    ctx.fillRect(-r * 0.15, -r * 0.2, r * 0.3, r * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-r * 0.58, -r * 0.24, r * 0.16, r * 0.06);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = r * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, r * 0.12, r * 0.45, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  private drawBananaMoon(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5);
    ctx.fillStyle = 'rgba(255,245,160,0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3a0';
    ctx.strokeStyle = '#d4b020';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.moveTo(-r * 1.2, -r * 0.3);
    ctx.quadraticCurveTo(0, r * 1.8, r * 1.2, -r * 0.3);
    ctx.quadraticCurveTo(0, r * 0.9, -r * 1.2, -r * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6a5018';
    ctx.fillRect(r * 1.1, -r * 0.45, r * 0.18, r * 0.2);
    ctx.restore();
  }

  // ------------------------------------------------------------ tiles
  private drawTiles(world: World, ts: number, clock: number, torches: [number, number, number][]): void {
    const g = this.g;
    const ctx = this.ctx;
    const v = g.view;
    const atlas = g.atlas.canvas;
    const x0 = Math.max(0, Math.floor(-v.offX / ts) - 1);
    const x1 = Math.min(W - 1, Math.ceil((v.wDev - v.offX) / ts) + 1);
    const y0 = Math.max(0, Math.floor(-v.offY / ts) - 1);
    const y1 = Math.min(H - 1, Math.ceil((v.hDev - v.offY) / ts) + 1);
    ctx.imageSmoothingEnabled = false;
    const tick = Math.floor(clock * 8);
    for (let y = y0; y <= y1; y++) {
      const sy = y * ts + v.offY;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const id = world.tiles[i];
        const sx = x * ts + v.offX;
        const def = BLOCKS[id];
        const hv = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 5;
        if ((!def.solid || id === B.GLASS) && y > world.surf[x]) {
          ctx.drawImage(atlas, (hv & 3) * TEX, WALL_ROW * TEX, TEX, TEX, sx, sy, ts, ts);
        }
        if (id === B.AIR) continue;
        let vr = hv & 3;
        if (id === B.WATER) vr = world.tiles[i - W] === B.WATER ? (tick >> 2) % 3 : 3;
        else if (id === B.TORCH) vr = (tick + x) & 3;
        else if (id === B.FURNACE) vr = tick >> 1;
        ctx.drawImage(atlas, (vr % VARIANTS) * TEX, id * TEX, TEX, TEX, sx, sy, ts, ts);
        if (torches.length < 40) {
          if (id === B.TORCH) torches.push([x, y, 0]);
          else if (id === B.BANANITE || id === B.BANANA_BLOCK) torches.push([x, y, 1]);
          else if (id === B.FURNACE) torches.push([x, y, 2]);
        }
      }
    }
  }

  private drawTarget(ts: number): void {
    const g = this.g;
    const ctx = this.ctx;
    const v = g.view;
    const me = g.me;
    if (!g.hasTarget || g.ui.open) return;
    const sx = g.tx * ts + v.offX;
    const sy = g.ty * ts + v.offY;
    if (me.mineT > 0.02 && me.mineTx === g.tx && me.mineTy === g.ty) {
      const stage = Math.min(4, Math.floor(me.mineT * 5));
      ctx.drawImage(g.atlas.cracks[stage], 0, 0, TEX, TEX, sx, sy, ts, ts);
    }
    ctx.lineWidth = Math.max(2, ts * 0.06);
    ctx.strokeStyle = g.reach ? 'rgba(255,255,255,0.75)' : 'rgba(255,90,90,0.55)';
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
  }

  // ------------------------------------------------------------ entidades
  private expression(me: { dead: boolean; hurtT: number; eatT: number; acting: boolean; exprT: number }, scared: boolean): Expr {
    if (me.dead) return 'ko';
    if (me.hurtT > 0.45) return 'hurt';
    if (me.eatT > 0) return 'eat';
    if (me.exprT > 0) return 'happy';
    if (me.acting) return 'focus';
    if (scared) return 'scared';
    return 'neutral';
  }

  private drawEntities(ts: number): void {
    const g = this.g;
    const ctx = this.ctx;
    const v = g.view;
    const me = g.me;
    const sxOf = (x: number) => Math.round(x * ts + v.offX);
    const syOf = (y: number) => Math.round(y * ts + v.offY);

    // partículas de baixo (lascas)
    for (const p of g.parts) {
      if (p.kind !== 0) continue;
      ctx.globalAlpha = clamp(p.life / 0.3, 0, 1);
      ctx.fillStyle = p.color;
      const s = Math.max(2, p.size * ts);
      ctx.fillRect(sxOf(p.x) - s / 2, syOf(p.y) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // criaturas
    for (const m of g.mobs.values()) {
      drawMob(
        ctx,
        { kind: m.kind, face: m.face, t: m.t, walk: m.t * 7, flash: m.hurtT > 0 ? Math.min(1, m.hurtT * 4) : m.fuse > 0 && Math.floor(m.fuse * 14) % 2 === 0 ? 0.6 : 0, fuse: m.fuse, hpFrac: m.hp / m.maxHp },
        sxOf(m.x),
        syOf(m.y),
        ts,
      );
    }

    // remotos
    for (const r of g.remotes.values()) this.drawRemote(r, ts);

    // eu
    const b = me.body;
    const nearMob = [...g.mobs.values()].some((m) => Math.hypot(m.x - b.x, m.y - b.y) < 5);
    if (!(me.invuln > 0 && Math.floor(g.clock * 14) % 2 === 0 && !me.dead)) {
      const pose: MonkeyPose = {
        facing: me.facing,
        walk: me.walk,
        speed: Math.min(1, Math.abs(b.vx) / 6),
        inAir: !b.onGround,
        vy: b.vy,
        acting: me.acting,
        swing: me.swing,
        aimX: me.aimX,
        aimY: me.aimY,
        hold: g.heldId(),
        expr: this.expression(me, nearMob),
        blink: me.blink,
        flash: me.flash > 0 ? Math.min(1, me.flash * 3) : 0,
        fur: g.furFor(g.myId()),
        accent: g.myColor(),
        t: g.clock,
        climbing: b.onLadder && !b.onGround,
        swimming: b.inWater,
        eating: me.eatT > 0,
        name: g.remotes.size > 0 ? g.myName() : undefined,
        emote: me.emote,
        emoteAlpha: me.emoteT,
      };
      drawMonkey(ctx, g.atlas, pose, sxOf(b.x), syOf(b.y + b.stepSmooth), ts);
    }
  }

  private drawRemote(r: Remote, ts: number): void {
    const g = this.g;
    const v = g.view;
    const ko = (r.ac & 4) !== 0;
    const pose: MonkeyPose = {
      facing: r.facing,
      walk: r.walk,
      speed: Math.min(1, Math.abs(r.vx) / 6),
      inAir: Math.abs(r.vy) > 0.5 && !(r.ac & 24),
      vy: r.vy,
      acting: (r.ac & 1) !== 0,
      swing: r.swing,
      aimX: r.ax,
      aimY: r.ay,
      hold: r.hold,
      expr: ko ? 'ko' : r.flash > 0 ? 'hurt' : r.ac & 2 ? 'eat' : r.ac & 1 ? 'focus' : 'neutral',
      blink: r.blinkT < 0 ? 1 - Math.abs(r.blinkT + 0.07) / 0.07 : 0,
      flash: r.flash > 0 ? Math.min(1, r.flash * 3) : 0,
      fur: r.fur,
      accent: r.color,
      t: r.t,
      climbing: (r.ac & 16) !== 0,
      swimming: (r.ac & 8) !== 0,
      eating: (r.ac & 2) !== 0,
      name: r.name,
      emote: r.emote,
      emoteAlpha: r.emoteT,
    };
    drawMonkey(this.ctx, g.atlas, pose, Math.round(r.x * ts + v.offX), Math.round(r.y * ts + v.offY), ts);
  }

  private drawDemoMonkey(world: World, ts: number): void {
    const g = this.g;
    const v = g.view;
    const spd = 2.4;
    const x = v.camX + 1.5 + Math.sin(g.clock * 0.3) * 0.0;
    const fx = Math.floor(x);
    const y = world.surf[clamp(fx, 0, W - 1)];
    const walk = g.clock * spd * 2.3;
    const pose: MonkeyPose = {
      facing: Math.cos(g.clock * 0.02) >= 0 ? 1 : -1,
      walk,
      speed: 0.45,
      inAir: false,
      vy: 0,
      acting: false,
      swing: 0,
      aimX: 1,
      aimY: 0,
      hold: 0,
      expr: Math.floor(g.clock / 3) % 3 === 0 ? 'happy' : 'neutral',
      blink: (g.clock % 3.2) > 3.1 ? 1 : 0,
      flash: 0,
      fur: '#9b6a3a',
      accent: '#facc15',
      t: g.clock,
      climbing: false,
      swimming: false,
      eating: false,
    };
    drawMonkey(this.ctx, g.atlas, pose, Math.round(x * ts + v.offX), Math.round(y * ts + v.offY), ts);
  }

  // ------------------------------------------------------------ luz
  private drawLighting(world: World, ts: number, day: number, playing: boolean): void {
    const g = this.g;
    const v = g.view;
    const ctx = this.ctx;
    const x0 = Math.max(0, Math.floor(-v.offX / ts) - 1);
    const x1 = Math.min(W - 1, Math.ceil((v.wDev - v.offX) / ts) + 1);
    const y0 = Math.max(0, Math.floor(-v.offY / ts) - 1);
    const y1 = Math.min(H - 1, Math.ceil((v.hDev - v.offY) / ts) + 1);
    const nW = x1 - x0 + 1;
    const nH = y1 - y0 + 1;
    if (this.light.width !== nW || this.light.height !== nH) {
      this.light.width = nW;
      this.light.height = nH;
      this.lightImg = this.lightCtx.createImageData(nW, nH);
    }
    const img = this.lightImg!;
    const data = img.data;
    const sk = 0.2 + 0.8 * day;
    const auras: [number, number][] = [];
    if (playing) {
      if (!g.me.dead) auras.push([g.me.body.x, g.me.body.y - 0.9]);
      for (const r of g.remotes.values()) auras.push([r.x, r.y - 0.9]);
    } else auras.push([v.camX + 1.5, v.camY + 3]);
    let p = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        let L = Math.max(world.blk[i], world.sky[i] * sk);
        for (const a of auras) {
          const d = Math.hypot(x + 0.5 - a[0], y + 0.5 - a[1]);
          if (d < 6.5) L = Math.max(L, 6.5 - d);
        }
        const f = clamp(L / 15, 0, 1);
        const alpha = (1 - Math.pow(f, 1.1)) * 0.965;
        data[p] = 3;
        data[p + 1] = 5;
        data[p + 2] = 18;
        data[p + 3] = alpha * 255;
        p += 4;
      }
    }
    this.lightCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(this.light, 0, 0, nW, nH, x0 * ts + v.offX, y0 * ts + v.offY, nW * ts, nH * ts);
    ctx.imageSmoothingEnabled = false;
  }

  private drawPostParticles(ts: number): void {
    const g = this.g;
    const ctx = this.ctx;
    const v = g.view;
    for (const p of g.parts) {
      if (p.kind === 0) continue;
      const sx = p.x * ts + v.offX;
      const sy = p.y * ts + v.offY;
      if (p.kind === 2) {
        ctx.drawImage(g.atlas.icon(p.icon), sx - ts * 0.22, sy - ts * 0.22, ts * 0.44, ts * 0.44);
        continue;
      }
      if (p.icon === -1) {
        const k = 1 - p.life / p.max;
        ctx.fillStyle = `rgba(255,243,192,${(1 - k) * 0.8})`;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * ts * (0.3 + k), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const k = p.life / 1;
      ctx.globalAlpha = clamp(k, 0, 0.7);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * ts * (1.3 - Math.min(1, k)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloatTexts(ts: number): void {
    const g = this.g;
    const ctx = this.ctx;
    const v = g.view;
    ctx.textAlign = 'center';
    for (const t of g.texts) {
      ctx.globalAlpha = clamp(t.life / (t.max * 0.5), 0, 1);
      ctx.font = `800 ${Math.round(t.size * v.dpr)}px system-ui, sans-serif`;
      ctx.lineWidth = 4 * v.dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = t.color;
      const sx = t.x * ts + v.offX;
      const sy = t.y * ts + v.offY;
      ctx.strokeText(t.text, sx, sy);
      ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}
