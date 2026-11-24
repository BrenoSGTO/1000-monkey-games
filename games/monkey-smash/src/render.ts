import { St, EV, ItemKind, Ctrl, PK, clamp, type Ev, type Fighter, type Item, type PlatPos, type Proj, type Rules } from './types';
import { CHARS } from './fighters';
import { STAGES, platsAt, geysersAt, cannonsAt, CANNON_X, type StageDef } from './stages';
import { drawFighter, newFighterFx, timingOf, type FighterFx } from './rig';
import { Fx, starPath, pick } from './fx';
import { sfx } from './sfx';

export interface RenderView {
  tick: number;
  stage: StageDef;
  seed: number;
  rules: Rules;
  fighters: Fighter[];
  items: Item[];
  projs: Proj[];
  count: number;
  timeLeft: number;
  over: number;
  winner: number;
  overT: number;
}

export const SLOT_COLORS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e'];

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly c: CanvasRenderingContext2D;
  readonly fx = new Fx();
  fighterFx: FighterFx[] = [];
  cam = { x: 0, y: -120, vw: 1400 };
  time = 0;
  w = 800;
  h = 600;
  dpr = 1;
  scale = 1;
  private pp: PlatPos[] = [];
  private shakeX = 0;
  private shakeY = 0;
  private lastTick = -1;
  localSlots: number[] = [];
  focusSlots: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, r.width || window.innerWidth);
    this.h = Math.max(240, r.height || window.innerHeight);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  reset(): void {
    this.fx.parts.length = 0;
    this.fighterFx = [];
    this.lastTick = -1;
    this.cam = { x: 0, y: -120, vw: 1500 };
  }

  // ------------------------------------------------------------------ eventos
  handleEvent(e: Ev, v: RenderView): void {
    const [type, , a, b, c, d, e2, f, g] = e;
    const fx = this.fx;
    switch (type) {
      case EV.HIT: {
        // x,y,speed,dirx,vslot,aslot,dmg,fxKind
        fx.impact(a, b, c, d, g, f);
        sfx.hit(c);
        const vf = this.fighterFx[e2];
        if (vf) {
          const horiz = Math.abs(d) > 0.5;
          vf.vsx = horiz ? -0.3 : 0.28;
          vf.vsy = horiz ? 0.25 : -0.3;
          vf.flash = 6;
        }
        break;
      }
      case EV.SHIELD:
        fx.ring(a, b, 40, '#7dd3fc', 12);
        for (let i = 0; i < 5; i++) fx.add({ kind: 'spark', x: a, y: b, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 12, size: 2.5, color: '#bae6fd', drag: 0.9, ang: 0 });
        sfx.shield();
        fx.shake(2, 4);
        break;
      case EV.SHBREAK:
        fx.ring(a, b, 120, '#7dd3fc', 24);
        fx.text(a, b - 40, 'ESCUDO QUEBROU!', '#7dd3fc', 28, 60);
        sfx.shieldBreak();
        fx.shake(9, 14);
        break;
      case EV.KO: {
        const st = v.stage;
        fx.koBurst(a, b, d, e2);
        const ch = CHARS[v.fighters[c]?.char ?? 0];
        const q = pick(ch.quotes.ko);
        if (Math.random() < 0.5) fx.text(a - d * 140, b - e2 * 140, q, '#fff', 24, 70);
        sfx.ko();
        void st;
        break;
      }
      case EV.RESPAWN:
        fx.ring(a, b, 90, '#fde047', 26);
        break;
      case EV.PICKUP:
        fx.text(a, b - 20, d === ItemKind.HAMMER ? 'MARTELO DE COCO!' : 'BANANA-BOMBA!', '#fde047', 22, 50);
        fx.ring(a, b, 40, '#fde047', 14);
        sfx.pickup();
        break;
      case EV.HEAL:
        fx.text(a, b - 10, '-25% 🍌', '#4ade80', 28, 54);
        fx.ring(a, b, 60, '#4ade80', 20);
        sfx.heal();
        break;
      case EV.ITEMSPAWN:
        fx.ring(a, b, 40, '#fff', 14);
        break;
      case EV.EXPLODE:
        fx.explosion(a, b, c);
        sfx.explosion();
        break;
      case EV.BOUNCE:
        fx.dust(a, b, 8);
        fx.shake(3, 5);
        break;
      case EV.TECH:
        fx.ring(a, b - 10, 50, '#a5f3fc', 14);
        fx.text(a, b - 50, 'TECH!', '#a5f3fc', 22, 36);
        sfx.click();
        break;
      case EV.GRAB:
        fx.text(a, b - 30, 'PEGUEI!', '#fb923c', 22, 36);
        sfx.grab();
        break;
      case EV.THROW:
        fx.text(a, b - 30, 'VOA!', '#fb923c', 24, 36);
        sfx.whoosh();
        break;
      case EV.PUMMEL:
        fx.add({ kind: 'star', x: a, y: b, size: 18, life: 8, color: '#fff', rot: Math.random() * 3 });
        sfx.hit(4);
        break;
      case EV.COUNTER:
        fx.ring(a, b, 100, '#fde047', 20);
        fx.text(a, b - 60, 'CONTRA-ATAQUE!', '#fde047', 26, 50);
        sfx.counter();
        break;
      case EV.WALL:
        fx.dust(a, b, 6);
        fx.shake(3, 5);
        break;
      case EV.REFLECT:
        fx.ring(a, b, 40, '#4ade80', 12);
        fx.text(a, b - 20, 'REBATIDA!', '#4ade80', 20, 30);
        sfx.counter();
        break;
      case EV.BREAK:
        fx.text(a, b, 'O MARTELO RACHOU!', '#fca5a5', 22, 44);
        for (let i = 0; i < 10; i++) fx.add({ kind: 'dot', x: a, y: b, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6, life: 30, size: 4, color: '#7c4a1d', g: 0.3 });
        break;
      case EV.LEDGE:
        sfx.click();
        break;
      case EV.PAD:
        fx.ring(a, b, 60, '#f87171', 14);
        fx.text(a, b - 30, 'BOING!', '#f87171', 24, 30);
        sfx.pad();
        break;
      case EV.TELE:
        fx.ring(a, b, 50, '#a78bfa', 14);
        fx.ring(c, d, 50, '#a78bfa', 14);
        for (let i = 0; i < 10; i++) fx.add({ kind: 'spark', x: a, y: b, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 18, size: 2.5, color: '#c4b5fd', drag: 0.92, ang: 0 });
        sfx.tele();
        break;
      case EV.SPAWNSHOT:
        sfx.whoosh();
        break;
      case EV.TICK:
        sfx.beep(false);
        break;
      case EV.GO:
        sfx.beep(true);
        break;
      case EV.END:
        sfx.win();
        break;
    }
  }

  // ------------------------------------------------------------------ tracking de estado (squash, poeira, sfx)
  private track(v: RenderView): void {
    for (const f of v.fighters) {
      let fx = this.fighterFx[f.slot];
      if (!fx) {
        fx = newFighterFx();
        fx.lastJumps = f.jumps;
        this.fighterFx[f.slot] = fx;
      }
      if (f.dead === 0) {
        const landed = f.ground && !fx.lastGround && fx.lastVy > 4;
        if (landed && f.state !== St.HITSTUN) {
          fx.vsy = -0.22;
          fx.vsx = 0.2;
          this.fx.dust(f.x, f.y, 5);
          sfx.land();
        }
        if (fx.lastGround && !f.ground && f.vy < -6 && f.state === St.AIR) {
          fx.vsy = 0.22;
          fx.vsx = -0.16;
          this.fx.dust(f.x, f.y, 4);
          sfx.jump();
        }
        if (f.state === St.AIR && f.jumps < fx.lastJumps) {
          this.fx.ring(f.x, f.y - 20, 36, 'rgba(255,255,255,0.8)', 12);
          fx.vsy = 0.2;
          fx.vsx = -0.12;
          sfx.djump();
        }
        if (f.state === St.ATTACK && (fx.lastState !== St.ATTACK || fx.lastMove !== f.move)) {
          sfx.whoosh();
          fx.vsx = 0.12;
          fx.vsy = -0.06;
          const mv = CHARS[f.char].moves[f.move];
          if (mv && mv.proj) sfx.whoosh();
        }
        if (f.state === St.RUN && f.ground && Math.abs(f.vx) > 3 && Math.random() < 0.12) this.fx.dust(f.x - f.face * 8, f.y, 1, -f.face);
        if (f.state === St.DODGE && fx.lastState !== St.DODGE) sfx.whoosh();
        if (f.state === St.HITSTUN && Math.hypot(f.vx, f.vy) > 12 && Math.random() < 0.5) {
          this.fx.add({ kind: 'dot', x: f.x, y: f.y - 36, vx: 0, vy: 0, life: 14, size: 8, color: 'rgba(255,230,150,0.7)' });
        }
        fx.lastMove = f.move;
      }
      fx.lastGround = f.ground;
      fx.lastVy = f.vy;
      fx.lastState = f.state;
      fx.lastJumps = f.jumps;
      fx.lastPct = f.pct;
    }
  }

  private springs(): void {
    for (const fx of this.fighterFx) {
      if (!fx) continue;
      fx.vsx += (0 - (fx.sx - 1)) * 0.2;
      fx.vsy += (0 - (fx.sy - 1)) * 0.2;
      fx.vsx *= 0.7;
      fx.vsy *= 0.7;
      fx.sx += fx.vsx;
      fx.sy += fx.vsy;
      fx.sx = clamp(fx.sx, 0.6, 1.5);
      fx.sy = clamp(fx.sy, 0.6, 1.5);
      if (fx.flash > 0) fx.flash--;
      if (fx.blink > 0) fx.blink--;
      else if (Math.random() < 0.006) fx.blink = 6;
    }
  }

  // ------------------------------------------------------------------ desenho principal
  draw(v: RenderView, dtFrames: number): void {
    const c = this.c;
    this.time += dtFrames / 60;
    const stepNew = v.tick !== this.lastTick;
    if (stepNew) {
      this.lastTick = v.tick;
    }
    platsAt(v.stage, v.tick, this.pp);
    for (let i = 0; i < dtFrames; i++) {
      this.track(v);
      this.springs();
      this.fx.update();
      this.updateCamera(v);
      this.hazardSfx(v);
    }
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(v);

    // shake
    const amp = this.fx.shakeAmp;
    this.shakeX = (Math.random() - 0.5) * 2 * amp;
    this.shakeY = (Math.random() - 0.5) * 2 * amp;
    const zoom = 1 + this.fx.zoomPunch * 0.05;
    const s = (this.w / this.cam.vw) * zoom;
    this.scale = s;
    c.save();
    c.translate(this.w / 2 + this.shakeX, this.h / 2 + this.shakeY);
    c.scale(s, s);
    c.translate(-this.cam.x, -this.cam.y);

    this.fx.draw(c, true);
    this.drawHazardsBack(v);
    this.drawStage(v);
    this.drawHazardsFront(v);
    this.drawItems(v);
    this.drawProjs(v);
    // fighters
    for (const f of v.fighters) this.drawOne(v, f);
    this.fx.draw(c, false);
    c.restore();

    this.drawOffscreen(v);
    this.drawHud(v);
    if (this.fx.flash > 0) {
      c.globalAlpha = this.fx.flash;
      c.fillStyle = this.fx.flashColor;
      c.fillRect(0, 0, this.w, this.h);
      c.globalAlpha = 1;
    }
  }

  private updateCamera(v: RenderView): void {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, n = 0;
    for (const f of v.fighters) {
      if (f.dead !== 0) continue;
      const bx = clamp(f.x, v.stage.blast.l, v.stage.blast.r);
      const by = clamp(f.y - 40, v.stage.blast.t, v.stage.blast.b);
      minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
      minY = Math.min(minY, by); maxY = Math.max(maxY, by);
      n++;
    }
    const aspect = this.w / this.h;
    let vw = 1180;
    let cx = 0;
    let cy = -60;
    if (n > 0) {
      const needW = maxX - minX + 620;
      const needH = (maxY - minY + 470) * aspect;
      vw = clamp(Math.max(vw, needW, needH), 1180, 2900);
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2 + 40;
      cx = clamp(cx, -520, 520);
      cy = clamp(cy, -300, 150);
    }
    const k = 0.08;
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (cy - this.cam.y) * k;
    this.cam.vw += (vw - this.cam.vw) * 0.06;
  }

  private hazardSfx(v: RenderView): void {
    if (v.count > 0) return;
    if (v.stage.hazard === 1) {
      for (const g of geysersAt(v.tick, v.seed)) {
        if (g.phase === 1 && g.p < 0.02) sfx.warn();
        if (g.phase === 2 && g.p < 0.03) {
          sfx.geyser();
          this.fx.shake(4, 10);
        }
      }
    } else if (v.stage.hazard === 3) {
      for (const s of cannonsAt(v.tick, v.seed)) {
        if (!s.live && s.warn < 0.02) sfx.warn();
        if (s.live && Math.abs(s.x + s.dir * CANNON_X) < 12) {
          sfx.cannon();
          this.fx.shake(5, 10);
          this.fx.explosion(-s.dir * (CANNON_X - 40), s.y, 40);
        }
      }
    }
  }

  // ------------------------------------------------------------------ fundo
  private drawBackground(v: RenderView): void {
    const c = this.c;
    const { w, h } = this;
    const th = v.stage.theme;
    const t = this.time;
    const cx = this.cam.x;
    const cy = this.cam.y;
    const s = w / this.cam.vw;
    const layer = (f: number, fn: () => void) => {
      c.save();
      c.translate(w / 2 - cx * s * f, h / 2 - cy * s * f);
      c.scale(s, s);
      fn();
      c.restore();
    };
    if (th === 'jungle') {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#7dd3fc');
      g.addColorStop(0.55, '#bbf7d0');
      g.addColorStop(1, '#4ade80');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      layer(0.1, () => {
        c.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 6; i++) {
          const x = -1800 + i * 640 + Math.sin(t * 0.1 + i) * 40;
          const y = -520 + (i % 3) * 90;
          for (const [dx, dy, r] of [[0, 0, 60], [50, 10, 48], [-50, 14, 44], [20, -18, 40]]) {
            c.beginPath();
            c.arc(x + dx, y + dy, r, 0, Math.PI * 2);
            c.fill();
          }
        }
      });
      layer(0.22, () => {
        c.fillStyle = '#0f9d58';
        for (let i = -6; i < 7; i++) {
          c.beginPath();
          c.ellipse(i * 330, 520, 280, 360 + (i % 2) * 70, 0, 0, Math.PI * 2);
          c.fill();
        }
      });
      layer(0.45, () => {
        for (const x of [-1100, -350, 520, 1250]) {
          c.fillStyle = '#7c4a1d';
          c.fillRect(x - 36, -700, 72, 1800);
          c.fillStyle = '#5b3513';
          for (let y = -640; y < 900; y += 60) c.fillRect(x - 36, y, 72, 5);
          c.fillStyle = '#15803d';
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            c.beginPath();
            c.ellipse(x + Math.cos(a) * 130, -700 + Math.sin(a) * 50, 150, 38, a * 0.3 + Math.sin(t + k) * 0.05, 0, Math.PI * 2);
            c.fill();
          }
          c.fillStyle = '#facc15';
          for (let k = 0; k < 4; k++) {
            c.beginPath();
            c.ellipse(x + 20 + k * 14, -620 + (k % 2) * 8, 9, 28, 0.2, 0, Math.PI * 2);
            c.fill();
          }
        }
      });
      // raios de sol
      c.fillStyle = 'rgba(255,255,200,0.12)';
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        const x = w * (0.15 + i * 0.24) + Math.sin(t * 0.3 + i) * 20;
        c.moveTo(x, 0);
        c.lineTo(x + 90, 0);
        c.lineTo(x + 380, h);
        c.lineTo(x + 120, h);
        c.fill();
      }
    } else if (th === 'volcano') {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2b0f2e');
      g.addColorStop(0.5, '#9a3412');
      g.addColorStop(1, '#f97316');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      layer(0.15, () => {
        c.fillStyle = 'rgba(30,10,20,0.85)';
        c.beginPath();
        c.moveTo(-1500, 800);
        c.lineTo(-300, -200);
        c.lineTo(-120, -240);
        c.lineTo(120, -240);
        c.lineTo(300, -200);
        c.lineTo(1500, 800);
        c.fill();
        // coroa de abacaxi no vulcão
        c.fillStyle = '#16a34a';
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.moveTo(i * 28, -240);
          c.lineTo(i * 34 + (i % 2) * 12, -360 - (3 - Math.abs(i)) * 24);
          c.lineTo(i * 28 + 24, -240);
          c.fill();
        }
        c.fillStyle = '#fb923c';
        c.beginPath();
        c.ellipse(0, -236, 130, 24, 0, 0, Math.PI * 2);
        c.fill();
        for (let i = 0; i < 7; i++) {
          const k = (t * 0.4 + i * 0.15) % 1;
          c.fillStyle = `rgba(60,40,40,${0.6 * (1 - k)})`;
          c.beginPath();
          c.arc(Math.sin(i * 2 + t) * 40, -280 - k * 500, 40 + k * 90, 0, Math.PI * 2);
          c.fill();
        }
      });
      // brasas
      for (let i = 0; i < 30; i++) {
        const k = (t * 0.12 + i * 0.037) % 1;
        const x = ((i * 137) % 100) / 100 * w + Math.sin(t + i) * 12;
        c.fillStyle = `rgba(253,224,71,${0.8 * (1 - k)})`;
        c.beginPath();
        c.arc(x, h * (1 - k), 2 + (i % 3), 0, Math.PI * 2);
        c.fill();
      }
      // lava embaixo
      layer(1, () => {
        const lg = c.createLinearGradient(0, 380, 0, 900);
        lg.addColorStop(0, '#fde047');
        lg.addColorStop(0.2, '#f97316');
        lg.addColorStop(1, '#7f1d1d');
        c.fillStyle = lg;
        c.beginPath();
        c.moveTo(-3000, 900);
        for (let x = -3000; x <= 3000; x += 60) c.lineTo(x, 420 + Math.sin(x * 0.02 + t * 2) * 12);
        c.lineTo(3000, 900);
        c.fill();
      });
    } else if (th === 'roof') {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b1026');
      g.addColorStop(0.6, '#312e81');
      g.addColorStop(1, '#a21caf');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fef9c3';
      for (let i = 0; i < 50; i++) {
        c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t + i));
        c.fillRect(((i * 97) % 100) / 100 * w, ((i * 53) % 55) / 100 * h, 2, 2);
      }
      c.globalAlpha = 1;
      c.fillStyle = '#fef08a';
      c.beginPath();
      c.arc(w * 0.82, h * 0.2, 40, 0, Math.PI * 2);
      c.fill();
      const skyline = (f: number, col: string, base: number, seed: number, win: string) => {
        layer(f, () => {
          for (let i = -12; i < 13; i++) {
            const bw = 150 + ((i * 37 + seed) % 5) * 26;
            const bh = 260 + ((i * 71 + seed * 3) % 7) * 70;
            const x = i * 200;
            c.fillStyle = col;
            c.fillRect(x, base - bh, bw, bh + 1200);
            c.fillStyle = win;
            for (let yy = base - bh + 20; yy < base - 20; yy += 34) {
              for (let xx = x + 14; xx < x + bw - 20; xx += 28) {
                if ((xx * 7 + yy * 13 + i * 5) % 5 < 2) c.fillRect(xx, yy, 12, 16);
              }
            }
          }
        });
      };
      skyline(0.18, '#1e1b4b', 520, 3, 'rgba(250,204,21,0.55)');
      skyline(0.38, '#111033', 640, 11, 'rgba(253,224,71,0.8)');
      layer(0.5, () => {
        c.fillStyle = '#0f172a';
        c.fillRect(-300, -520, 600, 150);
        c.font = '900 84px system-ui';
        c.textAlign = 'center';
        c.fillStyle = Math.sin(t * 6) > -0.8 ? '#f472b6' : '#6b2147';
        c.shadowColor = '#f472b6';
        c.shadowBlur = 24;
        c.fillText('FIRMA S.A.', 0, -418);
        c.shadowBlur = 0;
      });
    } else {
      const g = c.createRadialGradient(w / 2, h * 0.35, 40, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#fb7185');
      g.addColorStop(0.5, '#9d174d');
      g.addColorStop(1, '#2e1065');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      layer(0.25, () => {
        for (let i = -14; i < 15; i++) {
          c.fillStyle = i % 2 ? 'rgba(254,202,202,0.14)' : 'rgba(255,255,255,0.05)';
          c.beginPath();
          c.moveTo(0, -1300);
          c.lineTo(i * 150 - 75, 900);
          c.lineTo(i * 150 + 75, 900);
          c.fill();
        }
      });
      // holofotes
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = Math.sin(t * 0.8 + i * 2) * 0.35;
        const x = w * (0.2 + i * 0.3);
        c.fillStyle = ['rgba(250,204,21,0.12)', 'rgba(56,189,248,0.12)', 'rgba(244,114,182,0.12)'][i];
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x + Math.tan(a - 0.12) * h, h);
        c.lineTo(x + Math.tan(a + 0.12) * h, h);
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      layer(0.5, () => {
        // bandeirinhas
        for (let i = -20; i < 21; i++) {
          c.fillStyle = ['#facc15', '#38bdf8', '#f472b6', '#4ade80'][((i % 4) + 4) % 4];
          c.beginPath();
          const x = i * 90;
          const y = -520 + Math.sin(i * 0.5) * 30 + Math.abs(i) * 2;
          c.moveTo(x, y);
          c.lineTo(x + 40, y);
          c.lineTo(x + 20, y + 50);
          c.fill();
        }
        // plateia
        c.fillStyle = '#1e1b3a';
        for (let i = -16; i < 17; i++) {
          const x = i * 120 + ((i * 17) % 40);
          c.beginPath();
          c.arc(x, 520 + Math.sin(t * 3 + i) * 6, 44, 0, Math.PI * 2);
          c.arc(x - 38, 505 + Math.sin(t * 3 + i) * 6, 16, 0, Math.PI * 2);
          c.arc(x + 38, 505 + Math.sin(t * 3 + i) * 6, 16, 0, Math.PI * 2);
          c.fill();
        }
      });
    }
  }

  // ------------------------------------------------------------------ palco
  private drawStage(v: RenderView): void {
    const c = this.c;
    const th = v.stage.theme;
    const t = this.time;
    for (let i = 0; i < this.pp.length; i++) {
      const p = this.pp[i];
      const l = p.x - p.w / 2;
      const top = p.y;
      if (p.solid) {
        if (th === 'jungle') {
          // tronco descendo
          c.fillStyle = '#7c4a1d';
          c.beginPath();
          c.moveTo(l + 120, top + 40);
          c.lineTo(l + p.w - 120, top + 40);
          c.lineTo(l + p.w / 2 + 70, top + 900);
          c.lineTo(l + p.w / 2 - 70, top + 900);
          c.fill();
          c.fillStyle = '#5b3513';
          for (let k = 0; k < 14; k++) c.fillRect(p.x - 60 + (k % 3) * 40, top + 120 + k * 50, 36, 4);
          // galho
          c.fillStyle = '#92541f';
          rrect(c, l, top, p.w, p.h, 38);
          c.fill();
          c.fillStyle = '#5b3513';
          for (let k = 0; k < 10; k++) c.fillRect(l + 40 + k * 70, top + 30 + (k % 3) * 16, 40, 4);
          c.fillStyle = '#22c55e';
          rrect(c, l - 4, top - 10, p.w + 8, 24, 12);
          c.fill();
          c.fillStyle = '#16a34a';
          for (let k = 0; k < 22; k++) c.fillRect(l + 10 + k * 35, top + 10, 8, 14 + (k % 3) * 8);
        } else if (th === 'volcano') {
          c.fillStyle = '#1c1917';
          c.beginPath();
          c.moveTo(l, top + 20);
          c.lineTo(l + p.w, top + 20);
          c.lineTo(l + p.w - 120, top + 520);
          c.lineTo(l + 120, top + 520);
          c.fill();
          c.fillStyle = '#44403c';
          rrect(c, l, top, p.w, p.h, 24);
          c.fill();
          c.strokeStyle = `rgba(251,146,60,${0.6 + Math.sin(t * 3) * 0.3})`;
          c.lineWidth = 4;
          for (let k = 0; k < 7; k++) {
            c.beginPath();
            c.moveTo(l + 60 + k * 100, top + 20);
            c.lineTo(l + 80 + k * 100, top + 54);
            c.lineTo(l + 56 + k * 100, top + 84);
            c.stroke();
          }
          c.fillStyle = '#57534e';
          rrect(c, l, top - 6, p.w, 18, 9);
          c.fill();
        } else if (th === 'roof') {
          c.fillStyle = '#1e293b';
          c.fillRect(l + 20, top + 20, p.w - 40, 1000);
          c.fillStyle = 'rgba(250,204,21,0.5)';
          for (let yy = top + 140; yy < top + 900; yy += 70) {
            for (let xx = l + 50; xx < l + p.w - 60; xx += 70) c.fillRect(xx, yy, 34, 40);
          }
          c.fillStyle = '#64748b';
          rrect(c, l, top, p.w, p.h * 0.62, 10);
          c.fill();
          c.fillStyle = '#94a3b8';
          c.fillRect(l - 6, top - 6, p.w + 12, 14);
          c.fillStyle = '#475569';
          rrect(c, l + 50, top - 30, 70, 30, 4);
          c.fill();
          c.fillStyle = '#cbd5e1';
          c.fillRect(l + 60, top - 22, 50, 4);
          c.fillRect(l + 60, top - 14, 50, 4);
        } else {
          c.fillStyle = '#7f1d1d';
          c.fillRect(l + 30, top + 20, p.w - 60, 600);
          for (let k = 0; k < Math.floor(p.w / 60); k++) {
            c.fillStyle = k % 2 ? '#fecaca' : '#dc2626';
            c.fillRect(l + 30 + k * 60, top + 20, 60, 600);
          }
          c.fillStyle = '#a16207';
          rrect(c, l, top, p.w, p.h, 12);
          c.fill();
          c.fillStyle = '#facc15';
          for (let k = 0; k < Math.floor(p.w / 70); k++) {
            starAt(c, l + 35 + k * 70, top + 45, 14);
          }
          c.fillStyle = '#fde68a';
          c.fillRect(l, top - 4, p.w, 10);
        }
      } else {
        const moving = !!v.stage.plats[i].mv;
        if (moving) {
          c.strokeStyle = '#94a3b8';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(p.x - p.w / 2 + 10, top);
          c.lineTo(p.x - p.w / 2 + 10, top - 900);
          c.moveTo(p.x + p.w / 2 - 10, top);
          c.lineTo(p.x + p.w / 2 - 10, top - 900);
          c.stroke();
          c.fillStyle = '#facc15';
          rrect(c, l, top, p.w, 18, 4);
          c.fill();
          c.fillStyle = '#111827';
          for (let k = 0; k < p.w / 28; k++) c.fillRect(l + 6 + k * 28, top + 3, 14, 12);
          c.fillStyle = '#e5e7eb';
          c.fillRect(l, top + 18, p.w, 6);
          continue;
        }
        if (th === 'jungle') {
          c.fillStyle = '#4ade80';
          c.beginPath();
          c.ellipse(p.x, top + 6, p.w / 2 + 6, 14, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#16a34a';
          c.beginPath();
          c.ellipse(p.x, top + 11, p.w / 2 - 6, 8, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#14532d';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(l + 10, top + 6);
          c.lineTo(l + p.w - 10, top + 6);
          c.stroke();
        } else if (th === 'volcano') {
          c.fillStyle = '#78716c';
          rrect(c, l, top, p.w, 22, 10);
          c.fill();
          c.fillStyle = '#a8a29e';
          rrect(c, l, top - 3, p.w, 10, 5);
          c.fill();
        } else if (th === 'roof') {
          c.fillStyle = '#cbd5e1';
          rrect(c, l, top, p.w, 12, 3);
          c.fill();
          c.fillStyle = '#64748b';
          c.fillRect(l + 12, top + 12, 8, 30);
          c.fillRect(l + p.w - 20, top + 12, 8, 30);
          c.fillStyle = '#ef4444';
          c.fillRect(l, top, 16, 12);
        } else {
          c.fillStyle = '#38bdf8';
          rrect(c, l, top, p.w, 16, 8);
          c.fill();
          c.fillStyle = '#fde047';
          for (let k = 0; k < p.w / 24; k++) {
            c.beginPath();
            c.arc(l + 12 + k * 24, top + 8, 4, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
    // trampolim
    for (const pd of v.stage.pads) {
      const base = v.stage.plats[0].y;
      const bob = Math.sin(t * 5) * 1.5;
      c.fillStyle = '#7f1d1d';
      c.fillRect(pd.x - pd.w / 2 + 4, base - 16, 6, 16);
      c.fillRect(pd.x + pd.w / 2 - 10, base - 16, 6, 16);
      c.fillStyle = '#ef4444';
      rrect(c, pd.x - pd.w / 2, base - 24 + bob, pd.w, 10, 5);
      c.fill();
      c.fillStyle = '#fde047';
      c.fillRect(pd.x - pd.w / 2 + 14, base - 22 + bob, pd.w - 28, 4);
    }
  }

  private drawHazardsBack(v: RenderView): void {
    if (v.count > 0 && v.tick < 5) return;
    const c = this.c;
    if (v.stage.hazard === 1) {
      for (const g of geysersAt(v.tick, v.seed)) {
        if (g.phase === 1) {
          const k = g.p;
          c.fillStyle = `rgba(251,146,60,${0.3 + 0.5 * Math.abs(Math.sin(this.time * 14))})`;
          c.fillRect(g.x - 40, -4, 80, 8);
          c.fillStyle = '#fde047';
          c.font = '900 26px system-ui';
          c.textAlign = 'center';
          c.fillText('!', g.x, -22 - k * 4);
          for (let i = 0; i < 3; i++) {
            c.fillStyle = 'rgba(253,224,71,0.8)';
            c.beginPath();
            c.arc(g.x + Math.sin(this.time * 20 + i * 2) * 28, -6 - ((this.time * 60 + i * 9) % 26), 3, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
  }

  private drawHazardsFront(v: RenderView): void {
    const c = this.c;
    if (v.stage.hazard === 1) {
      for (const g of geysersAt(v.tick, v.seed)) {
        if (g.phase !== 2) continue;
        const hgt = 60 + 360 * Math.sin(Math.min(1, g.p * 1.4) * Math.PI * 0.5);
        const fade = 1 - Math.max(0, g.p - 0.7) / 0.3;
        const gr = c.createLinearGradient(0, -hgt, 0, 0);
        gr.addColorStop(0, `rgba(253,224,71,${0.2 * fade})`);
        gr.addColorStop(0.5, `rgba(249,115,22,${0.85 * fade})`);
        gr.addColorStop(1, `rgba(239,68,68,${fade})`);
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(g.x - 44, 6);
        c.quadraticCurveTo(g.x - 30, -hgt * 0.5, g.x - 18, -hgt);
        c.lineTo(g.x + 18, -hgt);
        c.quadraticCurveTo(g.x + 30, -hgt * 0.5, g.x + 44, 6);
        c.fill();
        c.fillStyle = `rgba(255,255,220,${0.8 * fade})`;
        c.beginPath();
        c.moveTo(g.x - 16, 4);
        c.lineTo(g.x - 8, -hgt * 0.85);
        c.lineTo(g.x + 8, -hgt * 0.85);
        c.lineTo(g.x + 16, 4);
        c.fill();
        if (Math.random() < 0.6) this.fx.add({ kind: 'spark', x: g.x + (Math.random() - 0.5) * 30, y: -hgt, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 3, life: 24, size: 3, color: '#fde047', g: 0.2, drag: 0.97, ang: 0 });
      }
    } else if (v.stage.hazard === 3) {
      const shots = cannonsAt(v.tick, v.seed);
      // canhões nas laterais
      for (const side of [-1, 1]) {
        const active = shots.find((s) => s.dir === -side);
        const y = active ? active.y : -60;
        const x = side * (CANNON_X - 20);
        c.save();
        c.translate(x, y);
        c.scale(-side, 1);
        c.fillStyle = '#1f2937';
        rrect(c, -50, -22, 100, 44, 12);
        c.fill();
        c.fillStyle = '#facc15';
        c.fillRect(-52, -10, 12, 20);
        c.fillStyle = '#ef4444';
        c.beginPath();
        c.arc(-10, 30, 26, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fde047';
        c.beginPath();
        c.arc(-10, 30, 10, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      for (const s of shots) {
        if (!s.live) {
          // aviso
          const blink = Math.sin(this.time * (10 + s.warn * 20)) > 0;
          const sx = -s.dir * (CANNON_X - 120);
          c.globalAlpha = blink ? 1 : 0.3;
          c.fillStyle = '#ef4444';
          c.beginPath();
          c.arc(sx, s.y, 24, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#fff';
          c.font = '900 30px system-ui';
          c.textAlign = 'center';
          c.fillText('!', sx, s.y + 10);
          c.globalAlpha = 0.14 + 0.12 * s.warn;
          c.fillStyle = '#ef4444';
          c.fillRect(-CANNON_X, s.y - 18, CANNON_X * 2, 36);
          c.globalAlpha = 1;
        } else {
          c.save();
          c.translate(s.x, s.y);
          c.rotate(this.time * 8 * s.dir);
          c.fillStyle = '#111827';
          c.beginPath();
          c.arc(0, 0, 30, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ef4444';
          starPath(c, 24, 0.5);
          c.fill();
          c.fillStyle = '#fde047';
          starPath(c, 12, 0.5);
          c.fill();
          c.restore();
          if (Math.random() < 0.7) this.fx.add({ kind: 'smoke', x: s.x - s.dir * 30, y: s.y, vx: -s.dir * 1, vy: (Math.random() - 0.5), life: 16, size: 10, color: 'rgba(200,200,200,0.5)', drag: 0.94 });
        }
      }
    }
  }

  // ------------------------------------------------------------------ itens / projéteis
  private drawItems(v: RenderView): void {
    const c = this.c;
    for (const it of v.items) {
      if (it.held >= 0) continue;
      c.save();
      c.translate(it.x, it.y);
      const bob = it.ground ? Math.sin(this.time * 4 + it.id) * 3 : 0;
      c.translate(0, -22 + bob);
      if (!it.ground && !it.armed) {
        // paraquedas
        c.fillStyle = '#f472b6';
        c.beginPath();
        c.arc(0, -42, 34, Math.PI, 0);
        c.quadraticCurveTo(20, -30, 0, -30);
        c.quadraticCurveTo(-20, -30, -34, -42);
        c.fill();
        c.strokeStyle = '#fdf2f8';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(-32, -40);
        c.lineTo(-6, -4);
        c.moveTo(32, -40);
        c.lineTo(6, -4);
        c.stroke();
      }
      // brilho
      c.fillStyle = 'rgba(255,255,200,0.25)';
      c.beginPath();
      c.arc(0, 0, 26 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
      c.fill();
      if (it.kind === ItemKind.BOMB) {
        c.rotate(Math.sin(this.time * 3) * 0.1);
        c.fillStyle = '#facc15';
        c.beginPath();
        c.ellipse(0, 0, 13, 17, 0.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#92400e';
        c.fillRect(-2, -22, 4, 6);
        c.fillStyle = it.armed && Math.sin(this.time * 30) > 0 ? '#ef4444' : '#fb923c';
        c.beginPath();
        c.arc(0, -25, 5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#111827';
        c.fillRect(-5, -2, 3, 3);
        c.fillRect(3, -2, 3, 3);
      } else if (it.kind === ItemKind.HAMMER) {
        c.rotate(-0.6);
        c.fillStyle = '#7c4a1d';
        c.fillRect(-3, -4, 6, 30);
        c.fillStyle = '#4b2e12';
        c.beginPath();
        c.arc(0, -10, 16, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#e7d3b0';
        c.beginPath();
        c.arc(6, -15, 5, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = '#facc15';
        for (let k = 0; k < 4; k++) {
          c.save();
          c.rotate(-0.5 + k * 0.34);
          c.beginPath();
          c.ellipse(0, -4, 6, 20, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
        c.fillStyle = '#4ade80';
        c.font = '900 16px system-ui';
        c.textAlign = 'center';
        c.fillText('+', 0, -22);
      }
      c.restore();
    }
  }

  private drawProjs(v: RenderView): void {
    const c = this.c;
    for (const p of v.projs) {
      c.save();
      c.translate(p.x, p.y);
      const dir = p.vx >= 0 ? 1 : -1;
      switch (p.kind) {
        case PK.BERIMBAU:
        case PK.NOTE: {
          c.scale(dir, 1);
          c.fillStyle = p.kind === PK.NOTE ? '#f472b6' : '#fbbf24';
          c.strokeStyle = '#1a1209';
          c.lineWidth = 3;
          c.font = '900 40px system-ui';
          c.textAlign = 'center';
          c.rotate(Math.sin(this.time * 12) * 0.2);
          c.strokeText(p.kind === PK.NOTE ? '♫' : '♪', 0, 12);
          c.fillText(p.kind === PK.NOTE ? '♫' : '♪', 0, 12);
          break;
        }
        case PK.SHAKE:
          c.rotate(this.time * 9 * dir);
          c.fillStyle = '#e5e7eb';
          rrect(c, -10, -16, 20, 32, 6);
          c.fill();
          c.fillStyle = '#ef4444';
          c.fillRect(-10, -16, 20, 8);
          c.fillStyle = '#facc15';
          c.fillRect(-8, -2, 16, 8);
          break;
        case PK.BITS:
          c.scale(dir, 1);
          c.fillStyle = '#052e16';
          rrect(c, -22, -12, 44, 24, 5);
          c.fill();
          c.fillStyle = '#4ade80';
          c.font = '900 14px monospace';
          c.textAlign = 'center';
          c.fillText(((p.id + Math.floor(this.time * 10)) % 2 ? '0101' : '1010'), 0, 5);
          break;
        case PK.YARN:
          c.rotate(this.time * 7 * dir);
          c.fillStyle = '#ec4899';
          c.beginPath();
          c.arc(0, 0, 18, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#fbcfe8';
          c.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            c.arc(0, 0, 6 + k * 4, k, k + 2.2);
            c.stroke();
          }
          break;
        case PK.SANDAL:
          c.rotate(this.time * 14 * dir);
          c.fillStyle = '#22c55e';
          c.beginPath();
          c.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = '#facc15';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(-4, -6);
          c.lineTo(6, 6);
          c.stroke();
          break;
        case PK.BOMB: {
          c.rotate(this.time * 8 * dir);
          c.fillStyle = '#facc15';
          c.beginPath();
          c.ellipse(0, 0, 13, 17, 0.5, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = Math.sin(this.time * 40) > 0 ? '#ef4444' : '#fde047';
          c.beginPath();
          c.arc(0, -20, 5, 0, Math.PI * 2);
          c.fill();
          break;
        }
        default:
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(0, 0, 10, 0, Math.PI * 2);
          c.fill();
      }
      c.restore();
    }
  }

  // ------------------------------------------------------------------ lutadores
  private drawOne(v: RenderView, f: Fighter): void {
    const c = this.c;
    const ch = CHARS[f.char];
    const fx = this.fighterFx[f.slot] ?? (this.fighterFx[f.slot] = newFighterFx());
    if (f.dead !== 0) return;
    const col = SLOT_COLORS[f.slot % 4];
    // plataforma de respawn
    if (f.state === St.PLAT) {
      c.fillStyle = 'rgba(253,224,71,0.35)';
      c.beginPath();
      c.ellipse(f.x, f.y + 6, 62, 16, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fde047';
      rrect(c, f.x - 54, f.y + 2, 108, 12, 6);
      c.fill();
      c.fillStyle = '#f59e0b';
      c.fillRect(f.x - 40, f.y + 14, 80, 5);
    }
    // sombra
    if (f.ground || f.y > -400) {
      let gy = 1e9;
      for (const p of this.pp) {
        if (f.x > p.x - p.w / 2 && f.x < p.x + p.w / 2 && p.y >= f.y - 4) gy = Math.min(gy, p.y);
      }
      if (gy < 1e8) {
        const d = clamp(1 - (gy - f.y) / 400, 0.15, 1);
        c.fillStyle = `rgba(0,0,0,${0.28 * d})`;
        c.beginPath();
        c.ellipse(f.x, gy + 2, 26 * d * ch.scale, 6 * d, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    const inHitstop = f.hitstop > 0 && f.state === St.HITSTUN;
    const draw: Fighter = inHitstop ? { ...f, x: f.x + (Math.random() - 0.5) * 7, y: f.y + (Math.random() - 0.5) * 5 } : f;
    // rastro (velocidade)
    fx.trail.push({ x: f.x, y: f.y, a: 1 });
    if (fx.trail.length > 4) fx.trail.shift();
    const mv = f.state === St.ATTACK ? ch.moves[f.move] : null;
    const fast = Math.hypot(f.vx, f.vy) > 12 || (mv && mv.mot && mv.mot.some((m) => m.vx !== undefined && Math.abs(m.vx) > 7) && f.st < mv.dur * 0.7);
    if (fast) {
      for (let i = 0; i < fx.trail.length - 1; i += 1) {
        const tr = fx.trail[i];
        c.globalAlpha = 0.07 + i * 0.05;
        drawFighter(c, { ...f, x: tr.x, y: tr.y }, ch, fx, { time: this.time });
      }
      c.globalAlpha = 1;
    }
    const blink = f.inv > 0 && f.inv < 300 && f.state !== St.DODGE && f.state !== St.LEDGE && f.state !== St.PLAT && Math.floor(f.inv / 3) % 2 === 0;
    const inv = f.state === St.DODGE || f.state === St.LEDGE || (mv && mv.inv && f.st >= mv.inv[0] && f.st < mv.inv[1]);
    c.globalAlpha = blink ? 0.45 : inv ? 0.6 : 1;
    const ko = f.state === St.HITSTUN && f.stun > 20 && f.shield <= 0;
    drawFighter(c, draw, ch, fx, { time: this.time, ko });
    c.globalAlpha = 1;
    // flash de dano
    if (fx.flash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = fx.flash / 8;
      drawFighter(c, draw, ch, fx, { time: this.time });
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    // smear frames
    if (mv) this.drawSmear(f, mv);
    // escudo
    if (f.state === St.SHIELD) {
      const r = (22 + f.shield * 0.34) * ch.scale + 8;
      const g = c.createRadialGradient(f.x, f.y - ch.bh * 0.5, r * 0.3, f.x, f.y - ch.bh * 0.5, r);
      g.addColorStop(0, 'rgba(125,211,252,0.05)');
      g.addColorStop(1, f.shield < 25 ? 'rgba(248,113,113,0.65)' : 'rgba(125,211,252,0.6)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(f.x, f.y - ch.bh * 0.5, r, 0, Math.PI * 2);
      c.fill();
    }
    // reflexo / contra
    if (mv && mv.reflect && f.st >= mv.reflect[0] && f.st < mv.reflect[1]) {
      c.strokeStyle = 'rgba(74,222,128,0.9)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(f.x + f.face * 24, f.y - ch.bh * 0.55, 56, 0, Math.PI * 2);
      c.stroke();
    }
    if (mv && mv.counter && f.st >= mv.counter[0] && f.st < mv.counter[1]) {
      c.strokeStyle = 'rgba(253,224,71,0.8)';
      c.lineWidth = 3;
      c.setLineDash([8, 6]);
      c.beginPath();
      c.arc(f.x, f.y - ch.bh * 0.5, 48 + Math.sin(this.time * 20) * 3, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    // marcador do jogador
    if (v.count < 150 || v.tick > 10) {
      const lab = f.ctrl === Ctrl.BOT ? `CPU` : f.name.length > 10 ? f.name.slice(0, 9) + '…' : f.name;
      const tag = f.ctrl === Ctrl.BOT ? lab : (this.localSlots.length > 1 ? `P${f.slot + 1}` : lab);
      const ty = f.y - ch.bh - 34;
      c.font = '800 14px system-ui';
      c.textAlign = 'center';
      const tw = c.measureText(tag).width + 14;
      c.fillStyle = col;
      rrect(c, f.x - tw / 2, ty - 15, tw, 20, 10);
      c.fill();
      c.beginPath();
      c.moveTo(f.x - 6, ty + 5);
      c.lineTo(f.x + 6, ty + 5);
      c.lineTo(f.x, ty + 12);
      c.fill();
      c.fillStyle = '#111827';
      c.fillText(tag, f.x, ty);
    }
  }

  private drawSmear(f: Fighter, mv: { boxes: { t0: number; t1: number; x: number; y: number; w: number; h: number; fx?: number; ang: number }[] }): void {
    const c = this.c;
    for (const b of mv.boxes) {
      if (f.st < b.t0 - 1 || f.st >= b.t1 + 2) continue;
      const k = clamp((f.st - b.t0 + 1) / Math.max(2, b.t1 - b.t0 + 2), 0, 1);
      const cx = f.x + b.x * f.face;
      const cy = f.y + b.y;
      c.save();
      c.translate(cx, cy);
      c.scale(f.face, 1);
      c.globalAlpha = (1 - k * 0.7) * 0.7;
      const col = b.fx === 2 ? '#fb923c' : b.fx === 3 ? '#67e8f9' : b.fx === 4 ? '#f9a8d4' : b.fx === 5 ? '#e5e7eb' : '#ffffff';
      c.fillStyle = col;
      const rw = b.w / 2;
      const rh = b.h / 2;
      const a = (b.ang > 90 && b.ang < 270 ? Math.PI : 0) - (b.ang <= 180 ? (b.ang * Math.PI) / 180 * 0.3 : -0.4);
      c.rotate(a * 0.4);
      c.beginPath();
      c.ellipse(0, 0, rw, rh, 0, -Math.PI * 0.62, Math.PI * 0.62);
      c.ellipse(-rw * 0.28, 0, rw * 0.85, rh * 0.7, 0, Math.PI * 0.62, -Math.PI * 0.62, true);
      c.fill();
      c.restore();
    }
  }

  // ------------------------------------------------------------------ indicadores fora da tela
  private drawOffscreen(v: RenderView): void {
    const c = this.c;
    const s = this.scale;
    for (const f of v.fighters) {
      if (f.dead !== 0) continue;
      const sx = this.w / 2 + (f.x - this.cam.x) * s;
      const sy = this.h / 2 + (f.y - 40 - this.cam.y) * s;
      const m = 34;
      if (sx > m && sx < this.w - m && sy > m && sy < this.h - m) continue;
      const x = clamp(sx, m, this.w - m);
      const y = clamp(sy, m, this.h - m - 110);
      const a = Math.atan2(sy - y, sx - x);
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = SLOT_COLORS[f.slot % 4];
      c.beginPath();
      c.moveTo(22, 0);
      c.lineTo(-10, -16);
      c.lineTo(-10, 16);
      c.fill();
      c.rotate(-a);
      c.fillStyle = '#111827';
      c.font = '900 13px system-ui';
      c.textAlign = 'center';
      c.fillText(`${Math.round(f.pct)}%`, -2, 5);
      c.restore();
    }
  }

  // ------------------------------------------------------------------ HUD
  private drawHud(v: RenderView): void {
    const c = this.c;
    const n = v.fighters.length;
    const ui = clamp(Math.min(this.w / 1100, this.h / 700), 0.62, 1.3);
    const cardW = Math.min(250 * ui, this.w / n - 10);
    const cardH = 92 * ui;
    const gap = 10;
    const total = n * cardW + (n - 1) * gap;
    const x0 = (this.w - total) / 2;
    const y0 = this.h - cardH - 10 * ui;
    for (let i = 0; i < n; i++) {
      const f = v.fighters[i];
      const ch = CHARS[f.char];
      const x = x0 + i * (cardW + gap);
      const col = SLOT_COLORS[f.slot % 4];
      c.save();
      c.globalAlpha = f.dead === 2 ? 0.45 : 1;
      c.fillStyle = 'rgba(15,23,42,0.78)';
      rrect(c, x, y0, cardW, cardH, 16 * ui);
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.stroke();
      // retrato
      const pr = 30 * ui;
      c.save();
      c.beginPath();
      c.arc(x + pr + 8 * ui, y0 + cardH / 2, pr, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = ch.accent;
      c.globalAlpha *= 0.35;
      c.fillRect(x, y0, pr * 2 + 16 * ui, cardH);
      c.globalAlpha = f.dead === 2 ? 0.45 : 1;
      c.translate(x + pr + 8 * ui, y0 + cardH / 2 + pr * 1.28);
      c.scale(0.82 * ui, 0.82 * ui);
      const dummy: Fighter = { ...f, x: 0, y: 0, face: 1, state: St.IDLE, itemKind: -1, vx: 0, vy: 0, ground: 1 };
      drawFighter(c, dummy, ch, newFighterFx(), { time: this.time, lose: f.dead === 2, win: v.over === 1 && v.winner === f.slot });
      c.restore();
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x + pr + 8 * ui, y0 + cardH / 2, pr, 0, Math.PI * 2);
      c.stroke();
      // nome
      const tx = x + pr * 2 + 20 * ui;
      c.fillStyle = col;
      c.font = `800 ${12 * ui}px system-ui`;
      c.textAlign = 'left';
      const nm = f.ctrl === Ctrl.BOT ? `CPU · ${ch.name}` : f.name;
      c.fillText(nm.length > 20 ? nm.slice(0, 19) + '…' : nm, tx, y0 + 18 * ui);
      // porcentagem
      const pct = Math.round(f.pct);
      const heat = clamp(pct / 180, 0, 1);
      const r = Math.round(255);
      const g = Math.round(255 - heat * 200);
      const b = Math.round(255 - heat * 255);
      c.font = `900 ${42 * ui}px system-ui`;
      const fxs = this.fighterFx[f.slot];
      const shk = fxs && fxs.flash > 0 ? (Math.random() - 0.5) * 6 : 0;
      c.lineWidth = 5;
      c.strokeStyle = '#111827';
      c.lineJoin = 'round';
      c.strokeText(`${pct}%`, tx + shk, y0 + 62 * ui + shk);
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fillText(`${pct}%`, tx + shk, y0 + 62 * ui + shk);
      // estoque / pontos
      c.font = `${15 * ui}px system-ui`;
      c.fillStyle = '#fff';
      if (v.rules.mode === 0) {
        c.fillText('🍌'.repeat(Math.max(0, f.stocks)), tx, y0 + 84 * ui);
      } else {
        c.font = `800 ${13 * ui}px system-ui`;
        c.fillText(`KOs ${f.kos}  ·  Quedas ${f.falls}`, tx, y0 + 84 * ui);
      }
      // item
      if (f.itemKind >= 0) {
        c.font = `${22 * ui}px system-ui`;
        c.fillText(f.itemKind === ItemKind.HAMMER ? '🔨' : '💣', x + cardW - 34 * ui, y0 + 30 * ui);
      }
      // barra do escudo
      if (f.state === St.SHIELD || f.shield < 99) {
        c.fillStyle = 'rgba(255,255,255,0.15)';
        c.fillRect(tx, y0 + cardH - 8 * ui, cardW - pr * 2 - 36 * ui, 4 * ui);
        c.fillStyle = '#7dd3fc';
        c.fillRect(tx, y0 + cardH - 8 * ui, (cardW - pr * 2 - 36 * ui) * (f.shield / 100), 4 * ui);
      }
      c.restore();
    }
    // tempo
    if (v.rules.mode === 1) {
      const secs = Math.max(0, Math.ceil(v.timeLeft / 60));
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      c.font = `900 ${34 * ui}px system-ui`;
      c.textAlign = 'center';
      c.lineWidth = 6;
      c.strokeStyle = '#111827';
      const txt = `${m}:${s.toString().padStart(2, '0')}`;
      c.strokeText(txt, this.w / 2, 44 * ui);
      c.fillStyle = secs <= 10 ? '#fb7185' : '#fff';
      c.fillText(txt, this.w / 2, 44 * ui);
    }
    // contagem
    if (v.count > 0) {
      const sec = Math.ceil(v.count / 60);
      const frac = (v.count % 60) / 60;
      const label = v.count > 190 - 1 ? '' : sec > 2 ? '3' : String(sec);
      if (v.count <= 185 && v.count > 0) {
        c.save();
        c.translate(this.w / 2, this.h * 0.38);
        const sc = 1 + frac * 0.6;
        c.scale(sc * ui, sc * ui);
        c.globalAlpha = clamp(frac * 2 + 0.2, 0, 1);
        c.font = '900 150px system-ui';
        c.textAlign = 'center';
        c.lineWidth = 14;
        c.strokeStyle = '#111827';
        c.lineJoin = 'round';
        c.strokeText(label, 0, 50);
        c.fillStyle = '#fde047';
        c.fillText(label, 0, 50);
        c.restore();
      }
    } else if (v.tick < 260 && v.over === 0) {
      const t = (v.tick - 0) / 60;
      c.save();
      c.globalAlpha = clamp(1 - (t - 0.2) * 1.3, 0, 1);
      c.translate(this.w / 2, this.h * 0.38);
      c.scale(ui * (1 + t * 0.4), ui * (1 + t * 0.4));
      c.font = '900 120px system-ui';
      c.textAlign = 'center';
      c.lineWidth = 12;
      c.strokeStyle = '#111827';
      c.strokeText('JÁ!', 0, 40);
      c.fillStyle = '#fb7185';
      c.fillText('JÁ!', 0, 40);
      c.restore();
    }
    if (v.over) {
      const k = clamp(v.overT / 20, 0, 1);
      c.save();
      c.translate(this.w / 2, this.h * 0.38);
      c.scale(ui * (0.6 + k * 0.5), ui * (0.6 + k * 0.5));
      c.font = '900 120px system-ui';
      c.textAlign = 'center';
      c.lineWidth = 12;
      c.strokeStyle = '#111827';
      c.strokeText('FIM!', 0, 40);
      c.fillStyle = '#fde047';
      c.fillText('FIM!', 0, 40);
      c.restore();
    }
  }
}

export function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function starAt(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.translate(x, y);
  starPath(c, r, 0.45);
  c.fill();
  c.restore();
}

export function stageById(i: number): StageDef {
  return STAGES[i] ?? STAGES[0];
}

export { timingOf };
