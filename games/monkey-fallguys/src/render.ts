import { Fx } from './fx';
import { type Match, SUIT_COLORS, TEAM_COLORS, TEAM_NAMES } from './match';
import { drawMonkey, newVis, updateVis, type Vis } from './monkeyArt';
import { CROWN_WIN } from './rounds/crown';
import {
  drawBackground,
  drawDynamic,
  drawLake,
  drawPlatforms,
  drawWorldObjects,
  lakeY,
  rr,
  type CamView,
} from './scene';
import { GY, type Ev, type Monkey } from './types';
import { clamp, fmtTime, lerp } from './util';
import { makeMonkey } from './physics';
import { skinFor } from './match';

export interface View {
  match: Match;
  localIds: number[];
  spectate: number;
  time: number;
}

interface Banner {
  title: string;
  sub: string;
  color: string;
  t: number;
  dur: number;
}

const FONT = '"Trebuchet MS", "Comic Sans MS", system-ui, sans-serif';

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly fx = new Fx();
  cw = 1280;
  ch = 720;
  dpr = 1;
  cam: CamView = { x: 0, y: 330, zoom: 0.8, w: 1280, h: 720 };
  private vis = new Map<number, Vis>();
  private banner: Banner | null = null;
  private count: { n: number; t: number } | null = null;
  private goT = 0;
  private lastRound = -1;
  private lastPhase = '';
  private titleMonkeys: { m: Monkey; v: Vis; ph: number }[] = [];
  private champConf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    for (let i = 0; i < 7; i++) {
      const m = makeMonkey(i, '', skinFor(i * 5 + 3), '', true, 1);
      this.titleMonkeys.push({ m, v: newVis(), ph: i * 0.9 });
    }
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.cw = Math.max(320, r.width);
    this.ch = Math.max(240, r.height);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.cam.w = this.cw;
    this.cam.h = this.ch;
  }

  private visOf(m: Monkey): Vis {
    let v = this.vis.get(m.id);
    if (!v) {
      v = newVis();
      this.vis.set(m.id, v);
    }
    return v;
  }

  resetVis(): void {
    this.vis.clear();
    this.fx.parts.length = 0;
    this.fx.texts.length = 0;
    this.banner = null;
    this.count = null;
    this.lastRound = -1;
  }

  // ───────── events ─────────
  handle(ev: Ev, view: View): void {
    const isLocal = ev.id !== undefined && view.localIds.includes(ev.id);
    const fx = this.fx;
    switch (ev.k) {
      case 'txt':
        fx.text(ev.x ?? 0, ev.y ?? 0, ev.s ?? '', ev.c ?? '#fff', 22);
        break;
      case 'conf':
        fx.confetti(ev.x ?? 0, ev.y ?? 0, ev.n ?? 10);
        break;
      case 'puff':
      case 'dust':
        fx.puff(ev.x ?? 0, ev.y ?? 0, ev.n ?? 4);
        break;
      case 'splash':
        fx.splash(ev.x ?? 0, ev.y ?? 0);
        fx.shake += 2;
        break;
      case 'shake':
        fx.shake = Math.min(14, fx.shake + (ev.n ?? 4));
        break;
      case 'tilegone':
        fx.puff(ev.x ?? 0, (ev.y ?? 0) + 10, 6, 'rgba(192,132,252,0.85)');
        break;
      case 'goal': {
        const team = ev.n ?? 0;
        fx.confetti(ev.x ?? 0, (ev.y ?? 0) - 40, 70, 2);
        fx.shake = 14;
        this.banner = {
          title: 'GOOOOL!',
          sub: `${TEAM_NAMES[team]} marcam! Mais um pra conta!`,
          color: TEAM_COLORS[team],
          t: 0,
          dur: 2.4,
        };
        break;
      }
      case 'elim': {
        const m = view.match.monkeys[ev.id ?? -1];
        if (m) fx.text(ev.x ?? m.x, (ev.y ?? m.y) - 80, 'ELIMINADO!', '#fb7185', 24);
        if (isLocal) {
          this.banner = { title: 'ELIMINADO!', sub: 'VAI PRA CASA, MACACO!', color: '#fb7185', t: 0, dur: 3.4 };
          fx.shake = 12;
        }
        break;
      }
      case 'qual': {
        const m = view.match.monkeys[ev.id ?? -1];
        if (m) {
          fx.text(m.x, m.y - 80, 'CLASSIFICADO!', '#86efac', 24);
          fx.confetti(m.x, m.y - 40, 26);
          fx.stars(m.x, m.y - 30, 6);
        }
        if (isLocal) {
          this.banner = { title: 'CLASSIFICADO!', sub: 'BANANA PRA VOCÊ, CAMPEÃO!', color: '#86efac', t: 0, dur: 3 };
        }
        break;
      }
      case 'count':
        this.count = { n: ev.n ?? 0, t: 0 };
        break;
      case 'go':
        this.count = null;
        this.goT = 1.1;
        break;
      case 'big':
        this.banner = { title: ev.s ?? '', sub: '', color: ev.c ?? '#fde047', t: 0, dur: 2.2 };
        break;
      case 'roundend':
        if (view.match.isFinal) break;
        this.banner = this.banner ?? { title: 'TERMINOU!', sub: 'Quem sobrou vai pra próxima!', color: '#fde047', t: 0, dur: 2.2 };
        break;
      case 'champion': {
        const m = view.match.monkeys[ev.id ?? -1];
        this.banner = {
          title: 'CAMPEÃO!',
          sub: m ? `${m.name} É O REI DA SELVA!` : 'FIM DE JOGO',
          color: '#fde047',
          t: 0,
          dur: 99,
        };
        this.champConf = 6;
        break;
      }
      default:
        break;
    }
  }

  // ───────── camera ─────────
  private focusList(view: View): Monkey[] {
    const ms = view.match.monkeys;
    const out: Monkey[] = [];
    for (const id of view.localIds) {
      const m = ms[id];
      if (m && !m.gone) out.push(m);
    }
    if (out.length === 0) {
      const sp = ms[view.spectate];
      if (sp && !sp.gone) out.push(sp);
    }
    if (out.length === 0) {
      let best: Monkey | null = null;
      for (const m of ms) {
        if (m.gone) continue;
        if (!best || (m.status === 'alive' && best.status !== 'alive') || (m.status === best.status && m.prog > best.prog)) best = m;
      }
      if (best) out.push(best);
    }
    return out;
  }

  private updateCamera(view: View, dt: number): void {
    const { match } = view;
    const w = match.world;
    const cw = this.cw;
    const ch = this.ch;
    let tx = this.cam.x;
    let ty = this.cam.y;
    let tz = this.cam.zoom;
    const arena = w.kind !== 'race';
    if (match.phase === 'champion' && match.champion >= 0) {
      const c = match.monkeys[match.champion];
      if (c) {
        tx = c.x;
        ty = c.y - 40;
        tz = clamp(Math.min(cw / 700, ch / 520), 0.6, 2);
      }
    } else if (arena) {
      const bw = w.bounds.x1 - w.bounds.x0 + (w.kind === 'soccer' ? 480 : 220);
      tz = clamp(Math.min(cw / bw, ch / (w.kind === 'hex' ? 760 : 800)), 0.3, 1.25);
      tx = (w.bounds.x0 + w.bounds.x1) / 2;
      ty = w.kind === 'soccer' ? 300 : w.kind === 'hex' ? 330 : 320;
    } else {
      tz = clamp(Math.min(cw / 1500, ch / 800), 0.3, 1.3);
      if (match.phase === 'intro') {
        const k = clamp(match.phaseT / 3.3, 0, 1);
        const e = k * k * (3 - 2 * k);
        tx = lerp(w.finishX - 200, w.startX + 250, e);
        ty = lerp(420, 400, e);
        tz = tz * 0.9;
      } else {
        const f = this.focusList(view);
        if (f.length) {
          let sx = 0;
          let sy = 0;
          let mn = Infinity;
          let mx = -Infinity;
          for (const m of f) {
            sx += m.x;
            sy += m.y;
            mn = Math.min(mn, m.x);
            mx = Math.max(mx, m.x);
          }
          const spread = mx - mn;
          if (f.length > 1) tz = Math.min(tz, cw / (spread + 800));
          tx = sx / f.length + 140 / Math.max(0.5, tz) * 0.5;
          ty = clamp(sy / f.length - 60, 250, 470);
        }
      }
    }
    const k = Math.min(1, dt * (match.phase === 'intro' && !arena ? 20 : 5));
    if (Math.abs(tx - this.cam.x) > 3000) this.cam.x = tx;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (tz - this.cam.zoom) * Math.min(1, dt * 3);
  }

  // ───────── main render ─────────
  render(view: View, dt: number): void {
    const { match } = view;
    const ctx = this.ctx;
    const w = match.world;
    const time = view.time;

    if (match.roundNo !== this.lastRound) {
      this.lastRound = match.roundNo;
      this.cam.x = w.kind === 'race' ? w.finishX - 200 : (w.bounds.x0 + w.bounds.x1) / 2;
      this.fx.parts.length = 0;
      this.fx.texts.length = 0;
    }
    if (match.phase !== this.lastPhase) {
      this.lastPhase = match.phase;
      if (match.phase === 'intro' || match.phase === 'play') this.banner = this.banner && this.banner.title === 'CAMPEÃO!' ? null : this.banner;
    }

    for (const m of match.monkeys) updateVis(this.visOf(m), m, dt, match.mode === 'client');
    this.updateCamera(view, dt);
    this.fx.update(dt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    if (this.count) this.count.t += dt;
    if (this.goT > 0) this.goT -= dt;
    if (match.phase === 'champion') {
      this.champConf -= dt;
      if (Math.random() < dt * 40) {
        this.fx.rain(this.cam.x, this.cw / this.cam.zoom, this.cam.y - this.ch / this.cam.zoom / 2 - 40, 2);
      }
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cam.w = this.cw;
    this.cam.h = this.ch;
    drawBackground(ctx, this.cam, w.theme, time);

    const z = this.cam.zoom;
    const sh = this.fx.shake;
    const ox = sh ? (Math.random() - 0.5) * sh : 0;
    const oy = sh ? (Math.random() - 0.5) * sh : 0;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.cw / 2 - this.cam.x * z + ox), this.dpr * (this.ch / 2 - this.cam.y * z + oy));
    const x0 = this.cam.x - this.cw / 2 / z;
    const x1 = this.cam.x + this.cw / 2 / z;

    drawLake(ctx, w, x0 - 40, x1 + 40, time);
    drawPlatforms(ctx, w, time, x0, x1);
    drawWorldObjects(ctx, w, time, x0, x1);
    drawDynamic(ctx, w, time);

    // monkeys (locals on top)
    const ly = lakeY(w);
    const list = match.monkeys.filter((m) => !m.gone && m.respawnT <= 0).sort((a, b) => a.y - b.y);
    const showAll = list.length <= 9;
    const drawOne = (m: Monkey): void => {
      if (ly > 0 && m.y > ly + 12) return;
      const v = this.visOf(m);
      if (v.rx < x0 - 80 || v.rx > x1 + 80) return;
      const local = view.localIds.includes(m.id);
      drawMonkey(ctx, m, v, {
        local,
        time,
        teamColor: w.kind === 'soccer' && m.team >= 0 ? TEAM_COLORS[m.team] : undefined,
        tailTag: w.kind === 'tail',
        showName: local || showAll || m.id === view.spectate || (m.crown && w.kind === 'crown'),
      });
    };
    for (const m of list) if (!view.localIds.includes(m.id)) drawOne(m);
    for (const m of list) if (view.localIds.includes(m.id)) drawOne(m);

    this.fx.draw(ctx);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHud(view);
  }

  // ───────── title scene ─────────
  renderTitle(dt: number, time: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cam.w = this.cw;
    this.cam.h = this.ch;
    const z = clamp(Math.min(this.cw / 1300, this.ch / 700), 0.4, 1.2);
    this.cam.zoom = z;
    this.cam.x = time * 20;
    this.cam.y = 330;
    drawBackground(ctx, this.cam, 0, time);
    this.fx.update(dt);
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.cw / 2 - 0 * z), this.dpr * (this.ch / 2 - 330 * z));
    // stage ground
    ctx.fillStyle = '#92612f';
    ctx.fillRect(-900, GY, 1800, 400);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(-900, GY, 1800, 16);
    ctx.strokeStyle = '#3b2410';
    ctx.lineWidth = 3;
    ctx.strokeRect(-900, GY, 1800, 400);
    this.titleMonkeys.forEach(({ m, v, ph }, i) => {
      const x = (i - 3) * 150;
      const hop = Math.abs(Math.sin(time * 3 + ph));
      m.x = x;
      m.y = GY - hop * 120;
      m.vy = Math.cos(time * 3 + ph) * -400 * (Math.sin(time * 3 + ph) >= 0 ? 1 : -1);
      m.vx = Math.sin(time + ph) * 60;
      m.grounded = hop < 0.05;
      m.face = i % 2 ? -1 : 1;
      m.status = i === 3 ? 'qual' : 'alive';
      m.crown = i === 3;
      m.flopT = i === 5 ? (Math.sin(time * 2) > 0.5 ? 0.1 : 0) : 0;
      m.flopK = 1;
      updateVis(v, m, dt, false);
      drawMonkey(ctx, m, v, { local: false, time, tailTag: false, showName: false });
    });
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ───────── HUD ─────────
  private txt(s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', stroke = 5): void {
    const ctx = this.ctx;
    ctx.font = `900 ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke;
    ctx.strokeStyle = 'rgba(30,20,10,0.92)';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  private pill(x: number, y: number, w: number, h: number, fill = 'rgba(17,24,39,0.72)'): void {
    const ctx = this.ctx;
    rr(ctx, x, y, w, h, h / 2.4);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(250,204,21,0.9)';
    ctx.stroke();
  }

  private drawHud(view: View): void {
    const { match } = view;
    const ctx = this.ctx;
    const w = match.world;
    const cw = this.cw;
    const ch = this.ch;
    const u = clamp(Math.min(cw, ch * 1.7) / 1000, 0.62, 1.25);
    const cx = cw / 2;
    const oy = cw < 800 ? 44 * u : 0;
    const me = view.localIds.map((id) => match.monkeys[id]).filter(Boolean) as Monkey[];
    const phase = match.phase;

    if (match.roundNo > 0 && phase !== 'champion') {
      // top-center: timer
      const left = Math.max(0, w.timeLeft);
      const showTimer = phase === 'play' || phase === 'count';
      this.pill(cx - 70 * u, 8 * u + oy, 140 * u, 44 * u);
      this.txt(showTimer ? fmtTime(phase === 'play' ? left : w.limit) : '--:--', cx, 31 * u + oy, 28 * u, left < 10 && phase === 'play' ? '#fca5a5' : '#fff');
      // round label
      this.txt(`RODADA ${match.roundNo} · ${match.info.title}`, cx, 66 * u + oy, 15 * u, '#fef08a', 'center', 4);
      // alive & target
      const racing = match.racingCount();
      const qual = match.nQual();
      const lines = match.isFinal ? [`FINAL · ${match.aliveCount()} macacos`] : [`Na briga: ${racing}`, `Classificados: ${qual}/${match.target}`];
      const rx = cw - 14 * u;
      this.pill(rx - 190 * u, 8 * u + (cw < 800 ? 0 : 0), 190 * u, (match.isFinal ? 34 : 56) * u);
      lines.forEach((l, i) => this.txt(l, rx - 95 * u, (match.isFinal ? 26 : 24 + i * 22) * u, 15 * u, '#fff', 'center', 3.5));
    }

    // round specific HUD
    if (phase === 'play' || phase === 'end') {
      if (w.kind === 'race') this.drawRaceBar(view, u);
      if (w.kind === 'soccer') this.drawScore(view, u, oy);
      if (w.kind === 'tail') this.drawTailHud(me, u, oy);
      if (w.kind === 'crown') this.drawCrownHud(view, u, oy);
    }

    // spectator tag
    const alive = me.some((m) => m.status !== 'out');
    if (phase !== 'champion' && view.localIds.length > 0 && !alive && match.roundNo > 0) {
      const sp = match.monkeys[view.spectate];
      this.pill(cx - 190 * u, ch - 56 * u, 380 * u, 40 * u);
      this.txt(`👀 Assistindo${sp ? ': ' + sp.name : ''} — TAB troca, R reinicia`, cx, ch - 36 * u, 14 * u, '#fff', 'center', 3);
    } else if (view.localIds.length === 0 && phase !== 'champion') {
      this.pill(cx - 160 * u, ch - 56 * u, 320 * u, 40 * u);
      this.txt('👀 Espectador (entrou com a partida em andamento)', cx, ch - 36 * u, 13 * u, '#fff', 'center', 3);
    }

    // intro card
    if (phase === 'intro') {
      const k = clamp(match.phaseT / 0.4, 0, 1);
      const out = clamp((3.6 - match.phaseT) / 0.4, 0, 1);
      const a = Math.min(k, out);
      ctx.globalAlpha = a;
      const bw = Math.min(cw - 24, 760 * u);
      const by = ch * 0.5 - 100 * u + (1 - k) * 40;
      rr(ctx, cx - bw / 2, by, bw, 200 * u, 28 * u);
      ctx.fillStyle = 'rgba(30,20,60,0.82)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = match.isFinal ? '#facc15' : '#f472b6';
      ctx.stroke();
      this.txt(match.isFinal ? '🏆 GRANDE FINAL 🏆' : `RODADA ${match.roundNo}`, cx, by + 28 * u, 20 * u, '#fde047');
      this.txt(match.info.title, cx, by + 72 * u, Math.min(46 * u, bw / (match.info.title.length * 0.62)), '#fff');
      this.wrap(match.info.blurb, cx, by + 112 * u, bw - 50 * u, 17 * u, '#e9d5ff');
      this.wrap('💡 ' + match.info.tip, cx, by + 160 * u, bw - 50 * u, 14.5 * u, '#fde68a');
      ctx.globalAlpha = 1;
    }

    // countdown
    if (phase === 'count' || this.count) {
      const n = Math.ceil(3 - match.phaseT);
      const cnt = phase === 'count' ? n : this.count?.n ?? 0;
      if (cnt > 0 && phase === 'count') {
        const frac = 1 - ((3 - match.phaseT) % 1);
        const s = (110 + (1 - frac) * 0) * u * (1 + (1 - clamp(frac * 3, 0, 1)) * 0.5);
        this.txt(String(cnt), cx, ch * 0.4, s, ['#4ade80', '#facc15', '#f87171'][cnt - 1] ?? '#fff', 'center', 10);
      }
    }
    if (this.goT > 0) {
      const s = (120 + (1.1 - this.goT) * 50) * u;
      ctx.globalAlpha = clamp(this.goT / 0.5, 0, 1);
      this.txt('JÁ!!!', cx, ch * 0.4, s, '#fde047', 'center', 10);
      ctx.globalAlpha = 1;
    }

    // banner (qualified / eliminated / goal / champion)
    if (this.banner) {
      const b = this.banner;
      const k = clamp(b.t / 0.25, 0, 1);
      const out = b.dur > 50 ? 1 : clamp((b.dur - b.t) / 0.3, 0, 1);
      const s = (0.6 + 0.4 * k + (k < 1 ? 0 : Math.sin(b.t * 7) * 0.02)) * u;
      ctx.globalAlpha = Math.min(k, out);
      const by = phase === 'champion' ? ch * 0.22 : ch * 0.3;
      this.txt(b.title, cx, by, 78 * s, b.color, 'center', 9);
      if (b.sub) this.txt(b.sub, cx, by + 60 * s, 28 * s, '#fff', 'center', 6);
      ctx.globalAlpha = 1;
    }

    // results panel
    if (phase === 'results' && !match.isFinal) this.drawResults(view, u);
    if (phase === 'champion') {
      const c = match.monkeys[match.champion];
      if (c) this.txt(`🍌 ${c.name} 🍌`, cx, ch * 0.78, 40 * u, '#fde047', 'center', 8);
    }
  }

  private wrap(s: string, x: number, y: number, maxW: number, size: number, color: string): void {
    const ctx = this.ctx;
    ctx.font = `800 ${Math.round(size)}px ${FONT}`;
    const words = s.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = wd;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach((l, i) => this.txt(l, x, y + i * size * 1.15, size, color, 'center', 3.5));
  }

  private drawRaceBar(view: View, u: number): void {
    const { match } = view;
    const w = match.world;
    if (w.finishX <= 0) return;
    const ctx = this.ctx;
    const bw = Math.min(this.cw - 80, 760 * u);
    const bx = (this.cw - bw) / 2;
    const by = this.ch - 34 * u;
    rr(ctx, bx, by - 8 * u, bw, 16 * u, 8 * u);
    ctx.fillStyle = 'rgba(17,24,39,0.7)';
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.stroke();
    this.txt('🏁', bx + bw + 4 * u, by, 18 * u, '#fff', 'left', 0);
    for (const m of match.monkeys) {
      if (m.gone && m.status !== 'qual') continue;
      const p = clamp(Math.max(m.prog, m.x) / w.finishX, 0, 1);
      const local = view.localIds.includes(m.id);
      ctx.beginPath();
      ctx.arc(bx + p * bw, by, (local ? 8 : 5) * u, 0, Math.PI * 2);
      ctx.fillStyle = SUIT_COLORS[m.skin.suit % 12];
      ctx.fill();
      ctx.lineWidth = local ? 3 : 1.5;
      ctx.strokeStyle = local ? '#fff' : '#1e1b4b';
      ctx.stroke();
    }
  }

  private drawScore(view: View, u: number, oy: number): void {
    const { match } = view;
    const w = match.world;
    const cx = this.cw / 2;
    const y = 112 * u + oy;
    this.pill(cx - 190 * u, y - 24 * u, 380 * u, 48 * u);
    this.txt(String(w.score[0]), cx - 62 * u, y, 34 * u, TEAM_COLORS[0]);
    this.txt('x', cx, y, 22 * u, '#fff');
    this.txt(String(w.score[1]), cx + 62 * u, y, 34 * u, TEAM_COLORS[1]);
    this.txt(TEAM_NAMES[0], cx - 136 * u, y, 12 * u, TEAM_COLORS[0], 'center', 3);
    this.txt(TEAM_NAMES[1], cx + 136 * u, y, 12 * u, TEAM_COLORS[1], 'center', 3);
    if (w.golden) this.txt('⚡ GOL DE OURO ⚡', cx, y + 40 * u, 16 * u, '#fde047', 'center', 4);
    const mine = view.localIds.map((id) => match.monkeys[id]).find((m) => m && m.team >= 0);
    if (mine) this.txt(`Seu time: ${TEAM_NAMES[mine.team]}`, cx, y + (w.golden ? 62 : 40) * u, 14 * u, TEAM_COLORS[mine.team], 'center', 4);
  }

  private drawTailHud(me: Monkey[], u: number, oy: number): void {
    const cx = this.cw / 2;
    const m = me[0];
    if (!m) return;
    const has = m.tail;
    this.pill(cx - 150 * u, 84 * u + oy, 300 * u, 38 * u, has ? 'rgba(113,63,18,0.85)' : 'rgba(17,24,39,0.72)');
    this.txt(has ? '🍌 VOCÊ TEM O RABO! FUJA!' : '😾 SEM RABO! ROUBE UM (E)!', cx, 103 * u + oy, 16 * u, has ? '#fde047' : '#fca5a5', 'center', 3.5);
  }

  private drawCrownHud(view: View, u: number, oy: number): void {
    const { match } = view;
    const ctx = this.ctx;
    const list = match.monkeys.filter((m) => m.status !== 'out').sort((a, b) => b.score - a.score).slice(0, 4);
    const bw = 220 * u;
    let y = 92 * u + oy;
    for (const m of list) {
      const p = clamp(m.score / CROWN_WIN, 0, 1);
      ctx.fillStyle = 'rgba(17,24,39,0.72)';
      rr(ctx, 14 * u, y, bw, 22 * u, 11 * u);
      ctx.fill();
      ctx.fillStyle = SUIT_COLORS[m.skin.suit % 12];
      rr(ctx, 14 * u, y, Math.max(22 * u, bw * p), 22 * u, 11 * u);
      ctx.fill();
      ctx.lineWidth = view.localIds.includes(m.id) ? 3 : 1.5;
      ctx.strokeStyle = view.localIds.includes(m.id) ? '#fde047' : '#1e1b4b';
      rr(ctx, 14 * u, y, bw, 22 * u, 11 * u);
      ctx.stroke();
      this.txt(`${m.crown ? '👑 ' : ''}${m.name} ${m.score.toFixed(1)}s`, 24 * u, y + 12 * u, 12 * u, '#fff', 'left', 3);
      y += 27 * u;
    }
  }

  private drawResults(view: View, u: number): void {
    const { match } = view;
    const ctx = this.ctx;
    const q = match.results.filter((r) => r.q);
    const e = match.results.filter((r) => !r.q);
    const cx = this.cw / 2;
    const pw = Math.min(this.cw - 20, 640 * u);
    const rows = Math.max(q.length, e.length, 1);
    const colRows = Math.min(rows, 12);
    const rh = 22 * u;
    const ph = 70 * u + colRows * rh;
    const py = Math.max(110 * u, this.ch * 0.5 - ph / 2 + 40 * u);
    ctx.globalAlpha = clamp(match.phaseT / 0.3, 0, 1);
    rr(ctx, cx - pw / 2, py, pw, ph, 22 * u);
    ctx.fillStyle = 'rgba(30,20,60,0.88)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#facc15';
    ctx.stroke();
    this.txt(`✅ CLASSIFICADOS (${q.length})`, cx - pw / 4, py + 24 * u, 16 * u, '#86efac', 'center', 3);
    this.txt(`❌ ELIMINADOS (${e.length})`, cx + pw / 4, py + 24 * u, 16 * u, '#fda4af', 'center', 3);
    const draw = (arr: { id: number }[], x: number, col: string): void => {
      arr.slice(0, 12).forEach((r, i) => {
        const m = match.monkeys[r.id];
        if (!m) return;
        const local = view.localIds.includes(m.id);
        ctx.fillStyle = SUIT_COLORS[m.skin.suit % 12];
        ctx.beginPath();
        ctx.arc(x - pw / 4 + 14 * u, py + 54 * u + i * rh, 6 * u, 0, Math.PI * 2);
        ctx.fill();
        this.txt(m.name, x - pw / 4 + 28 * u, py + 54 * u + i * rh, 13 * u, local ? '#fde047' : col, 'left', 3);
      });
      if (arr.length > 12) this.txt(`+${arr.length - 12}…`, x, py + ph - 12 * u, 12 * u, col, 'center', 3);
    };
    draw(q, cx - pw / 4 + 0, '#fff');
    draw(e, cx + pw / 4, '#fecdd3');
    ctx.globalAlpha = 1;
  }
}
