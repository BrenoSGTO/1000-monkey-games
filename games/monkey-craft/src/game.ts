import { PeerRoom, reportGameScore, type PlayerProfile } from '@monkey-slop/sdk';
import { craftAudio } from './audio';
import { BLOCKS, EMOTES, FOODS, HAND, RECIPES, SOLID, TOOLS, isPlaceable, itemName, type Recipe, type ToolDef } from './data';
import { Input } from './input';
import { lootFor, makeMob, spawnTick, updateMobs, type LivePlayer } from './mobs';
import type { Expr } from './monkey';
import type { NetSync } from './net';
import { bodiesOverlap, hazardAt, moveBody, newBody } from './physics';
import { Atlas } from './textures';
import { Ui } from './ui';
import { World } from './world';
import {
  B,
  DAY_LEN,
  H,
  I,
  MAX_STACK,
  REACH,
  SAVE_KEY,
  SLUG,
  W,
  type Body,
  type Mob,
  type NetMsg,
  type NetPlayer,
  type Slot,
} from './types';

export type Role = 'solo' | 'host' | 'guest';
export type GameState = 'title' | 'loading' | 'play';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  kind: 0 | 1 | 2; // 0 lasca, 1 brilho/fumaça, 2 ícone voando até o jogador
  icon: number;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}

export interface Remote {
  id: string;
  name: string;
  color: string;
  fur: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  walk: number;
  ac: number;
  ax: number;
  ay: number;
  hold: number;
  hp: number;
  lastHp: number;
  flash: number;
  seen: number;
  blinkT: number;
  swing: number;
  emote: string;
  emoteT: number;
  t: number;
}

export interface Stats {
  mined: number;
  placed: number;
  crafted: number;
  kills: number;
  deaths: number;
  maxDepth: number;
  bananite: number;
  have: number[];
}

export interface View {
  ts: number;
  camX: number;
  camY: number;
  wDev: number;
  hDev: number;
  wCss: number;
  hCss: number;
  dpr: number;
  offX: number;
  offY: number;
}

export interface Goal {
  text: string;
  done: (g: Game) => boolean;
}

const FURS = ['#9b6a3a', '#7a5230', '#b58450', '#6b4a2a', '#a37445', '#c29056'];
export const GOALS: Goal[] = [
  { text: 'Soque uma bananeira e colete Tronco (clique segurando)', done: (g) => g.has(B.WOOD) },
  { text: 'Aperte E e fabrique uma Bancada (8 Tábuas)', done: (g) => g.has(B.BENCH) },
  { text: 'Perto da Bancada, fabrique uma Picareta de Madeira', done: (g) => g.has(I.PICK_WOOD) },
  { text: 'Cave a terra até achar Pedra e junte 14 para a Fornalha', done: (g) => g.has(B.FURNACE) },
  { text: 'Ache Minério de Cobre e funda uma Barra na Fornalha', done: (g) => g.has(I.COPPER_BAR) },
  { text: 'Fabrique uma Picareta de Cobre', done: (g) => g.has(I.PICK_COPPER) },
  { text: 'Desça fundo: ache Ouro e funda uma Barra', done: (g) => g.has(I.GOLD_BAR) },
  { text: 'Cave até a Bananita brilhante (bem no fundão!)', done: (g) => g.has(B.BANANITE) },
  { text: 'Forje a Picareta de Bananita', done: (g) => g.has(I.PICK_BANANITE) },
  { text: 'Derrote 5 criaturas da noite', done: (g) => g.stats.kills >= 5 },
  { text: 'Macaco Lendário! Agora construa sua selva e explore 🍌', done: () => false },
];

export class Player {
  body: Body = newBody(0, 0, 0.62, 1.7);
  hp = 100;
  hunger = 100;
  inv: Slot[] = Array.from({ length: 36 }, () => ({ id: 0, n: 0 }));
  sel = 0;
  facing: 1 | -1 = 1;
  coyote = 0;
  jumpBuf = 0;
  hurtT = 0;
  atkCd = 0;
  mineT = 0;
  mineTx = -1;
  mineTy = -1;
  mineSnd = 0;
  mineFx = 0;
  swing = 0;
  walk = 0;
  blink = 0;
  blinkT = 2;
  exprT = 0;
  flash = 0;
  eatT = 0;
  dead = false;
  deadT = 0;
  acting = false;
  aimX = 1;
  aimY = 0;
  stepT = 0;
  placeCd = 0;
  hunT = 0;
  regenT = 0;
  starveT = 0;
  emote = '';
  emoteT = 0;
  wasWater = false;
  invuln = 0;
}

export class Game {
  world!: World;
  readonly atlas = new Atlas();
  readonly input = new Input();
  readonly ui = new Ui();
  state: GameState = 'title';
  role: Role = 'solo';
  me = new Player();
  mobs = new Map<number, Mob>();
  nextMobId = 1;
  lastHitBy = new Map<number, string>();
  remotes = new Map<string, Remote>();
  parts: Particle[] = [];
  texts: FloatText[] = [];
  shake = 0;
  hurtFlash = 0;
  time = DAY_LEN * 0.3;
  days = 1;
  stats: Stats = { mined: 0, placed: 0, crafted: 0, kills: 0, deaths: 0, maxDepth: 0, bananite: 0, have: [] };
  goalIdx = 0;
  spawnT = 4;
  net: NetSync | null = null;
  room: PeerRoom<NetMsg> | null = null;
  toast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void = () => undefined;
  view: View = { ts: 32, camX: W / 2, camY: 50, wDev: 800, hDev: 600, wCss: 800, hCss: 600, dpr: 1, offX: 0, offY: 0 };
  camInit = false;
  zoom = 1;
  selMsg = '';
  selMsgT = 0;
  saveT = 25;
  waterT = 0;
  flushT = 0;
  scoreReported = 0;
  titleT = 0;
  demo: World | null = null;
  clock = 0;
  bannerT = 0;
  banner = '';
  hasTarget = false;
  tx = 0;
  ty = 0;
  reach = true;
  msgFlash = 0;
  mobSnapId = 0;
  guestWait = 0;

  // ------------------------------------------------------------ util
  myId(): string {
    return this.room?.localPlayer.id ?? 'me';
  }
  myColor(): string {
    return this.room?.localPlayer.color ?? '#facc15';
  }
  myName(): string {
    return this.room?.localPlayer.name ?? 'Macaco';
  }
  furFor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return FURS[h % FURS.length];
  }
  sfx(name: 'coo' | 'groan' | 'splash' | 'hit' | 'hurt' | 'boom'): void {
    craftAudio[name]();
  }
  has(id: number): boolean {
    return this.stats.have.includes(id);
  }
  daylight(): number {
    const s = Math.sin(((this.time / DAY_LEN) - 0.25) * Math.PI * 2);
    return Math.max(0, Math.min(1, (s + 0.22) / 0.55));
  }
  dayT(): number {
    return (this.time / DAY_LEN) % 1;
  }
  score(): number {
    const s = this.stats;
    return Math.floor(s.mined + s.kills * 25 + s.crafted * 5 + s.maxDepth * 3 + s.bananite * 80 + (this.days - 1) * 40);
  }
  reportScore(): void {
    const sc = this.score();
    if (sc <= 0) return;
    reportGameScore(SLUG, sc, { dias: this.days, abates: this.stats.kills });
    this.scoreReported = sc;
  }
  playersOnline(): number {
    return 1 + this.remotes.size;
  }

  screenToWorld(cx: number, cy: number): [number, number] {
    const v = this.view;
    return [v.camX + (cx * v.dpr - v.wDev / 2) / v.ts, v.camY + (cy * v.dpr - v.hDev / 2) / v.ts];
  }

  livePlayers(): LivePlayer[] {
    const out: LivePlayer[] = [];
    if (this.state === 'play' && !this.me.dead) out.push({ id: this.myId(), b: this.me.body });
    for (const r of this.remotes.values()) {
      if (r.ac & 4) continue;
      out.push({ id: r.id, b: { x: r.x, y: r.y, w: 0.62, h: 1.7, vx: r.vx, vy: r.vy, onGround: true, inWater: false, onLadder: false, stepSmooth: 0, step: false } });
    }
    return out;
  }

  // ------------------------------------------------------------ ciclo de vida
  initDemo(): void {
    this.demo = new World(20260607);
  }

  resetPlayer(): void {
    const me = this.me;
    me.body = newBody(this.world.spawnX, this.world.spawnY, 0.62, 1.7);
    me.hp = 100;
    me.hunger = 100;
    me.dead = false;
    me.hurtT = 0;
    me.invuln = 1.5;
    me.eatT = 0;
    me.mineT = 0;
  }

  private resetCommon(): void {
    this.mobs.clear();
    this.parts = [];
    this.texts = [];
    this.remotes.clear();
    this.lastHitBy.clear();
    this.camInit = false;
    this.me = new Player();
    this.ui.reset();
    this.shake = 0;
    this.spawnT = 6;
    this.saveT = 25;
  }

  bindWorld(w: World): void {
    this.world = w;
    w.onChange = (x, y, old, id) => this.onBlockChange(x, y, old, id);
  }

  startNew(seed?: number): void {
    this.resetCommon();
    this.bindWorld(new World(seed ?? Math.floor(Math.random() * 1e9)));
    this.time = DAY_LEN * 0.3;
    this.days = 1;
    this.stats = { mined: 0, placed: 0, crafted: 0, kills: 0, deaths: 0, maxDepth: 0, bananite: 0, have: [] };
    this.goalIdx = 0;
    this.resetPlayer();
    this.me.inv[0] = { id: I.BANANA, n: 3 };
    this.state = 'play';
    this.role = this.room?.roomCode && this.room.localPlayer.isHost ? 'host' : 'solo';
    this.announce('Nova selva! Soque uma bananeira 🍌');
    this.save();
  }

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  startContinue(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as {
        v: number;
        seed: number;
        chunks: Record<string, number[]>;
        time: number;
        days: number;
        goal: number;
        stats: Stats;
        p: { x: number; y: number; hp: number; hunger: number; sel: number; inv: number[][] };
      };
      if (d.v !== 1) return false;
      this.resetCommon();
      const w = new World(d.seed);
      w.importChunks(d.chunks ?? {});
      this.bindWorld(w);
      this.time = d.time;
      this.days = d.days;
      this.goalIdx = d.goal;
      this.stats = { ...this.stats, ...d.stats };
      this.resetPlayer();
      const me = this.me;
      me.body.x = d.p.x;
      me.body.y = d.p.y;
      me.hp = Math.max(30, d.p.hp);
      me.hunger = Math.max(30, d.p.hunger);
      me.sel = d.p.sel ?? 0;
      for (let i = 0; i < 36; i++) {
        const s = d.p.inv[i];
        me.inv[i] = s ? { id: s[0], n: s[1] } : { id: 0, n: 0 };
      }
      // desencalha se o save pegou dentro de bloco
      let guard = 0;
      while (SOLID[w.get(Math.floor(me.body.x), Math.floor(me.body.y - 1))] && guard++ < 80) me.body.y -= 1;
      this.state = 'play';
      this.role = this.room?.roomCode && this.room.localPlayer.isHost ? 'host' : 'solo';
      this.announce('Bem-vindo de volta, macaco minerador!');
      return true;
    } catch {
      return false;
    }
  }

  save(): void {
    if (this.role === 'guest' || this.state !== 'play') return;
    try {
      const me = this.me;
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          v: 1,
          seed: this.world.seed,
          chunks: this.world.exportChunks(),
          time: this.time,
          days: this.days,
          goal: this.goalIdx,
          stats: this.stats,
          p: {
            x: me.body.x,
            y: me.body.y,
            hp: me.hp,
            hunger: me.hunger,
            sel: me.sel,
            inv: me.inv.map((s) => (s.id ? [s.id, s.n] : null)),
          },
        }),
      );
    } catch {
      // storage cheio/indisponível: segue o jogo
    }
  }

  quitToTitle(): void {
    this.save();
    this.reportScore();
    this.state = 'title';
    this.ui.reset();
  }

  /** O jogador virou guest: o mundo vem do host. */
  startGuest(w: World, time: number): void {
    this.resetCommon();
    this.bindWorld(w);
    this.time = time;
    this.days = 1;
    this.stats = { mined: 0, placed: 0, crafted: 0, kills: 0, deaths: 0, maxDepth: 0, bananite: 0, have: [] };
    this.goalIdx = 0;
    this.resetPlayer();
    this.me.body.x += (Math.random() - 0.5) * 3;
    this.me.inv[0] = { id: I.BANANA, n: 3 };
    this.role = 'guest';
    this.state = 'play';
    this.announce('Você entrou na selva do host!');
  }

  announce(text: string): void {
    this.banner = text;
    this.bannerT = 4;
  }

  // ------------------------------------------------------------ inventário
  invCount(id: number): number {
    let n = 0;
    for (const s of this.me.inv) if (s.id === id) n += s.n;
    return n;
  }

  addItem(id: number, n: number, silent = false): number {
    const inv = this.me.inv;
    let left = n;
    for (let i = 0; i < 36 && left > 0; i++) {
      if (inv[i].id === id && inv[i].n < MAX_STACK) {
        const k = Math.min(left, MAX_STACK - inv[i].n);
        inv[i].n += k;
        left -= k;
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (inv[i].id === 0) {
        const k = Math.min(left, MAX_STACK);
        inv[i] = { id, n: k };
        left -= k;
      }
    }
    if (left < n) {
      if (!this.stats.have.includes(id)) {
        this.stats.have.push(id);
        if (id === B.BANANITE) this.me.exprT = 2;
      }
      if (id === B.BANANITE) this.stats.bananite += n - left;
      if (!silent) craftAudio.pickup();
    }
    if (left > 0) this.floatText(this.me.body.x, this.me.body.y - 2, 'Mochila cheia!', '#fca5a5');
    return left;
  }

  removeItem(id: number, n: number): boolean {
    if (this.invCount(id) < n) return false;
    let left = n;
    for (const s of this.me.inv) {
      if (s.id === id && left > 0) {
        const k = Math.min(left, s.n);
        s.n -= k;
        left -= k;
        if (s.n <= 0) {
          s.id = 0;
          s.n = 0;
        }
      }
    }
    return true;
  }

  heldId(): number {
    return this.me.inv[this.me.sel].id;
  }

  stationNear(kind: 'hand' | 'bench' | 'furnace'): boolean {
    if (kind === 'hand') return true;
    const want = kind === 'bench' ? B.BENCH : B.FURNACE;
    const b = this.me.body;
    const cx = Math.floor(b.x);
    const cy = Math.floor(b.y - 0.8);
    for (let y = cy - 4; y <= cy + 3; y++) for (let x = cx - 5; x <= cx + 5; x++) if (this.world.get(x, y) === want) return true;
    return false;
  }

  canCraft(r: Recipe): boolean {
    if (!this.stationNear(r.station)) return false;
    return r.ing.every(([id, n]) => this.invCount(id) >= n);
  }

  craft(r: Recipe): boolean {
    if (!this.canCraft(r)) return false;
    // checa espaço
    const testInv = this.me.inv.map((s) => ({ ...s }));
    for (const [id, n] of r.ing) {
      let left = n;
      for (const s of testInv) if (s.id === id && left > 0) {
        const k = Math.min(left, s.n);
        s.n -= k;
        left -= k;
        if (s.n <= 0) s.id = 0;
      }
    }
    const room = testInv.some((s) => s.id === 0) || testInv.some((s) => s.id === r.out && s.n + r.n <= MAX_STACK);
    if (!room) {
      this.toast('Mochila cheia!', 'chaos');
      return false;
    }
    for (const [id, n] of r.ing) this.removeItem(id, n);
    this.addItem(r.out, r.n, true);
    this.stats.crafted++;
    craftAudio.craft();
    this.floatText(this.me.body.x, this.me.body.y - 2.1, `+${r.n} ${itemName(r.out)}`, '#fde047');
    this.me.exprT = 1.2;
    return true;
  }

  // ------------------------------------------------------------ efeitos
  floatText(x: number, y: number, text: string, color = '#fff', size = 15): void {
    this.texts.push({ x, y, vy: -1.6, life: 1.3, max: 1.3, text, color, size });
    if (this.texts.length > 60) this.texts.shift();
  }

  burst(x: number, y: number, color: string, n: number, speed = 4): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.3 + Math.random()) * speed;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 2,
        life: 0.5 + Math.random() * 0.5,
        max: 1,
        size: 0.1 + Math.random() * 0.12,
        color,
        grav: 22,
        kind: 0,
        icon: 0,
      });
    }
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
  }

  puff(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 0.4,
        y,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -0.8 - Math.random(),
        life: 0.6 + Math.random() * 0.4,
        max: 1,
        size: 0.15 + Math.random() * 0.15,
        color,
        grav: -1,
        kind: 1,
        icon: 0,
      });
    }
  }

  flyIcon(x: number, y: number, icon: number): void {
    this.parts.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 2, life: 1.6, max: 1.6, size: 0.45, color: '#fff', grav: 0, kind: 2, icon });
  }

  private onBlockChange(x: number, y: number, old: number, id: number): void {
    if (old === B.WATER || id === B.WATER) return;
    if (this.state !== 'play') return;
    const v = this.view;
    const inView = Math.abs(x + 0.5 - v.camX) < v.wDev / v.ts / 2 + 2 && Math.abs(y + 0.5 - v.camY) < v.hDev / v.ts / 2 + 2;
    if (!inView) return;
    if (id === B.AIR && old !== B.AIR) {
      const def = BLOCKS[old];
      if (def.plant && old !== B.TORCH && old !== B.LADDER) {
        this.burst(x + 0.5, y + 0.5, def.color, 5, 2.5);
      } else {
        this.burst(x + 0.5, y + 0.5, def.color, 9, 4.2);
        this.burst(x + 0.5, y + 0.5, '#ffffff', 2, 3);
      }
    } else if (id !== B.AIR) {
      this.puff(x + 0.5, y + 0.5, '#e8d9b0', 2);
    }
  }

  // ------------------------------------------------------------ edição de blocos
  editBlock(x: number, y: number, id: number): boolean {
    const old = this.world.get(x, y);
    if (old === id) return false;
    if (this.role === 'guest') {
      this.net?.send({ k: 'rq', i: y * W + x, id, prev: old });
      return this.world.set(x, y, id, true);
    }
    return this.world.set(x, y, id, false);
  }

  /** Quebra um bloco, dando os itens ao jogador local. */
  breakBlock(x: number, y: number): void {
    const id = this.world.get(x, y);
    const def = BLOCKS[id];
    if (id === B.AIR || def.unbreakable) return;
    this.editBlock(x, y, B.AIR);
    this.stats.mined++;
    if (def.drop !== 0 && Math.random() <= def.dropChance) {
      const item = def.drop === -1 ? id : def.drop;
      const n = def.dropMin + Math.floor(Math.random() * (def.dropMax - def.dropMin + 1));
      if (this.addItem(item, n) < n) this.flyIcon(x + 0.5, y + 0.5, item);
    }
    craftAudio.breakBlock(def.sound);
    this.shake = Math.max(this.shake, def.hardness > 4 ? 0.12 : 0.05);
    // cascata: plantas, cactos e cachos dependem do bloco vizinho
    const above = this.world.get(x, y - 1);
    if (above === B.TALLGRASS || above === B.FLOWER) this.editBlock(x, y - 1, B.AIR);
    if (above === B.CACTUS) this.breakBlock(x, y - 1);
    if (this.world.get(x, y + 1) === B.BUNCH && id === B.LEAVES) this.breakBlock(x, y + 1);
  }

  canPlaceAt(x: number, y: number): boolean {
    const w = this.world;
    const cur = w.get(x, y);
    if (!(cur === B.AIR || cur === B.WATER || cur === B.TALLGRASS || cur === B.FLOWER)) return false;
    if (y < 0 || y >= H - 1) return false;
    const support =
      SOLID[w.get(x - 1, y)] || SOLID[w.get(x + 1, y)] || SOLID[w.get(x, y - 1)] || SOLID[w.get(x, y + 1)] ||
      BLOCKS[w.get(x, y - 1)].station || BLOCKS[w.get(x, y + 1)].station || w.get(x, y + 1) === B.WOOD || w.get(x, y - 1) === B.LADDER ||
      y > w.surf[Math.max(0, Math.min(W - 1, x))];
    return !!support;
  }

  // ------------------------------------------------------------ dano
  hurtMe(dmg: number, kx: number, ky: number, why: string): void {
    const me = this.me;
    if (me.dead || me.invuln > 0) return;
    if (me.hurtT > 0 && why !== 'fome') return;
    me.hp -= dmg;
    me.hurtT = 0.8;
    me.flash = 0.35;
    me.body.vx = kx;
    me.body.vy = ky;
    this.hurtFlash = 0.35;
    this.shake = Math.max(this.shake, 0.35);
    craftAudio.hurt();
    this.floatText(me.body.x, me.body.y - 2, `-${Math.round(dmg)}`, '#f87171', 20);
    if (me.hp <= 0) this.die(why);
  }

  die(why: string): void {
    const me = this.me;
    me.hp = 0;
    me.dead = true;
    me.deadT = 2.6;
    this.stats.deaths++;
    craftAudio.die();
    this.toast(`Macaco desmaiou por causa de ${why}! 💫`, 'chaos');
    this.reportScore();
    this.net?.sendNow();
  }

  respawn(): void {
    const me = this.me;
    me.body = newBody(this.world.spawnX, this.world.spawnY, 0.62, 1.7);
    me.hp = 100;
    me.hunger = Math.max(me.hunger, 55);
    me.dead = false;
    me.invuln = 3;
    this.camInit = false;
    this.toast('Acordou na selva, de ressaca de banana.', 'info');
  }

  damagePlayer(id: string, dmg: number, kx: number, ky: number, why: string): void {
    if (id === this.myId()) this.hurtMe(dmg, kx, ky, why);
    else this.net?.send({ k: 'hurt', to: id, dmg, kx, ky, why });
  }

  hurtMob(m: Mob, dmg: number, kx: number, by: string): void {
    m.hp -= dmg;
    m.hurtT = 0.25;
    m.vx = kx;
    if (m.kind === 0) m.vy = -4.5;
    this.lastHitBy.set(m.id, by);
    this.floatText(m.x, m.y - m.h - 0.3, String(Math.round(dmg)), '#fde047', 16);
    craftAudio.hit();
    this.burst(m.x, m.y - m.h / 2, m.kind === 0 ? '#9ad070' : '#c4c8d2', 6, 3.5);
    if (m.hp <= 0) this.killMob(m, by);
  }

  killMob(m: Mob, by: string): void {
    if (!this.mobs.delete(m.id)) return;
    this.puff(m.x, m.y - 0.4, m.kind === 0 ? '#9ad070' : '#d0d4dc', 10);
    this.burst(m.x, m.y - 0.4, m.kind === 0 ? '#6e8a48' : '#a2a8b4', 12, 5);
    for (const [item, n] of lootFor(m.kind)) {
      if (by === this.myId() || !this.net) {
        this.addItem(item, n);
        this.flyIcon(m.x, m.y - 0.5, item);
      } else this.net.send({ k: 'give', to: by, item, n });
    }
    if (by === this.myId()) {
      this.stats.kills++;
      this.floatText(m.x, m.y - 1.2, '+25', '#fde047', 18);
    } else if (this.net) this.net.send({ k: 'give', to: by, item: 0, n: 0 });
  }

  explode(x: number, y: number, r: number, dmg: number): void {
    const w = this.world;
    for (let by = Math.floor(y - r); by <= Math.ceil(y + r); by++) {
      for (let bx = Math.floor(x - r); bx <= Math.ceil(x + r); bx++) {
        const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y);
        if (d > r) continue;
        const id = w.get(bx, by);
        if (id === B.AIR || id === B.BEDROCK || id === B.WATER) continue;
        if (d / r > 0.72 && Math.random() < 0.55) continue;
        w.set(bx, by, B.AIR);
      }
    }
    this.boomFx(x, y);
    this.net?.send({ k: 'boom', x, y });
    for (const p of this.livePlayers()) {
      const d = Math.hypot(p.b.x - x, p.b.y - p.b.h / 2 - y);
      if (d < r + 1.3) {
        const k = 1 - d / (r + 1.3);
        const s = p.b.x >= x ? 1 : -1;
        this.damagePlayer(p.id, Math.max(8, dmg * k), s * 9 * k + s * 3, -9 * k - 3, MOB_EXPLOSION);
      }
    }
  }

  boomFx(x: number, y: number): void {
    craftAudio.boom();
    this.shake = Math.max(this.shake, 0.9);
    this.burst(x, y, '#ffb340', 26, 9);
    this.burst(x, y, '#ff5a30', 16, 7);
    this.puff(x, y, '#555555', 14);
    this.parts.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 3.2, color: '#fff3c0', grav: 0, kind: 1, icon: -1 });
  }

  // ------------------------------------------------------------ rede
  onRemoteState(id: string, name: string, s: NetPlayer): void {
    let r = this.remotes.get(id);
    if (!r) {
      r = {
        id,
        name,
        color: s.col,
        fur: this.furFor(id),
        x: s.x,
        y: s.y,
        tx: s.x,
        ty: s.y,
        vx: 0,
        vy: 0,
        facing: 1,
        walk: 0,
        ac: 0,
        ax: 1,
        ay: 0,
        hold: 0,
        hp: s.hp,
        lastHp: s.hp,
        flash: 0,
        seen: 0,
        blinkT: 2,
        swing: 0,
        emote: '',
        emoteT: 0,
        t: 0,
      };
      this.remotes.set(id, r);
      this.toast(`${name} entrou na selva! 🐒`, 'banana');
    }
    r.name = name || r.name;
    r.color = s.col;
    r.tx = s.x;
    r.ty = s.y;
    r.vx = s.vx;
    r.vy = s.vy;
    r.facing = s.f >= 0 ? 1 : -1;
    r.ac = s.ac;
    r.ax = s.ax;
    r.ay = s.ay;
    r.hold = s.h;
    if (s.hp < r.hp) r.flash = 0.3;
    r.hp = s.hp;
    r.seen = performance.now();
  }

  syncRoster(players: PlayerProfile[]): void {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, r] of this.remotes) {
      if (!ids.has(id)) {
        this.remotes.delete(id);
        this.toast(`${r.name} saiu da selva.`, 'info');
      }
    }
    for (const p of players) {
      const r = this.remotes.get(p.id);
      if (r) {
        r.name = p.name;
        r.color = p.color;
      }
    }
  }

  applyDiffs(e: number[]): void {
    for (let k = 0; k + 1 < e.length; k += 2) {
      const i = e[k];
      this.world.set(i % W, (i / W) | 0, e[k + 1], true);
    }
  }

  hostApplyRequest(i: number, id: number, prev: number): void {
    if (i < 0 || i >= W * H) return;
    const w = this.world;
    const cur = w.tiles[i];
    const x = i % W;
    const y = (i / W) | 0;
    const placing = id !== B.AIR;
    const valid = cur === prev && (placing ? BLOCKS[cur].plant || cur === B.AIR || cur === B.WATER || cur === B.TALLGRASS || cur === B.FLOWER : !BLOCKS[cur].unbreakable);
    if (valid) w.set(x, y, id, false);
    else this.net?.sendDiff([i, cur]);
  }

  onMobSnapshot(t: number, rows: number[][]): void {
    this.mobSnapId++;
    if (Math.abs(t - this.time) > 3) this.time = t;
    else this.time += (t - this.time) * 0.25;
    for (const r of rows) {
      const [id, kind, x, y, vx, hp, face, st] = r;
      let m = this.mobs.get(id);
      if (!m) {
        m = makeMob(id, kind as 0 | 1, x / 100, y / 100);
        this.mobs.set(id, m);
      }
      m.tx = x / 100;
      m.ty = y / 100;
      m.vx = vx / 10;
      if (hp < m.hp) m.hurtT = 0.25;
      m.hp = hp;
      m.face = face >= 0 ? 1 : -1;
      m.fuse = st / 100;
      m.seen = this.mobSnapId;
    }
    for (const [id, m] of this.mobs) {
      if (m.seen !== this.mobSnapId) {
        this.mobs.delete(id);
        this.puff(m.x, m.y - 0.4, m.kind === 0 ? '#9ad070' : '#d0d4dc', 8);
      }
    }
  }

  netState(): NetPlayer {
    const me = this.me;
    const b = me.body;
    let ac = 0;
    if (me.acting) ac |= 1;
    if (me.eatT > 0) ac |= 2;
    if (me.dead) ac |= 4;
    if (b.inWater) ac |= 8;
    if (b.onLadder) ac |= 16;
    return {
      x: Math.round(b.x * 100) / 100,
      y: Math.round(b.y * 100) / 100,
      vx: Math.round(b.vx * 10) / 10,
      vy: Math.round(b.vy * 10) / 10,
      f: me.facing,
      ac,
      ax: Math.round(me.aimX * 100) / 100,
      ay: Math.round(me.aimY * 100) / 100,
      h: this.heldId(),
      hp: Math.max(0, Math.round(me.hp)),
      col: this.myColor(),
    };
  }

  mobRows(): number[][] {
    const rows: number[][] = [];
    for (const m of this.mobs.values()) {
      rows.push([m.id, m.kind, Math.round(m.x * 100), Math.round(m.y * 100), Math.round(m.vx * 10), Math.round(m.hp), m.face, Math.round(m.fuse * 100)]);
    }
    return rows;
  }

  // ------------------------------------------------------------ atualização principal
  update(dt: number): void {
    this.clock += dt;
    this.titleT += dt;
    if (this.state !== 'play') {
      this.input.endFrame();
      return;
    }
    dt = Math.min(dt, 1 / 20);
    const me = this.me;
    const world = this.world;

    // tempo (host/solo mandam; guest acompanha e se corrige nos snapshots)
    const prevDay = Math.floor(this.time / DAY_LEN);
    this.time += dt;
    if (Math.floor(this.time / DAY_LEN) !== prevDay && this.role !== 'guest') {
      this.days++;
      this.toast(`Amanheceu! Dia ${this.days} 🌞`, 'banana');
    }

    // UI primeiro (pode consumir o clique)
    const uiConsumed = this.ui.update(this, this.input);

    this.updatePlayer(dt, uiConsumed);

    // remotos
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 14);
      const dx = r.tx - r.x;
      r.x += dx * k;
      r.y += (r.ty - r.y) * k;
      r.walk += Math.abs(r.vx) * dt * 2.4;
      r.t += dt;
      r.flash = Math.max(0, r.flash - dt);
      r.blinkT -= dt;
      if (r.blinkT < -0.15) r.blinkT = 2 + Math.random() * 3;
      r.emoteT = Math.max(0, r.emoteT - dt);
      r.swing += dt * ((r.ac & 1) ? 14 : 0);
    }

    // criaturas
    if (this.role !== 'guest') {
      updateMobs(this, dt);
      spawnTick(this, dt);
      this.waterT += dt;
      if (this.waterT > 0.12) {
        this.waterT = 0;
        world.stepWater(180);
      }
    } else {
      for (const m of this.mobs.values()) {
        const k = Math.min(1, dt * 12);
        const dx = m.tx - m.x;
        m.x += dx * k;
        m.y += (m.ty - m.y) * k;
        m.t += dt;
        m.hurtT = Math.max(0, m.hurtT - dt);
        if (Math.abs(dx) > 0.02) m.t += dt * 0.4;
      }
    }
    for (const m of this.mobs.values()) {
      if (m.kind === 0) {
        m.vx = m.vx; // vx já vem do snapshot (guest) ou da simulação (host)
      }
    }

    // partículas / textos
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.kind === 2) {
        const b = me.body;
        const tx = b.x;
        const ty = b.y - 0.9;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const d = Math.hypot(dx, dy);
        const pull = (1 - p.life / p.max) * 40;
        p.vx += (dx / (d || 1)) * pull * dt;
        p.vy += (dy / (d || 1)) * pull * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        if (d < 0.5) {
          this.parts.splice(i, 1);
          continue;
        }
      } else {
        p.vy += p.grav * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.96;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.selMsgT = Math.max(0, this.selMsgT - dt);
    this.bannerT = Math.max(0, this.bannerT - dt);

    world.updateLight(8);
    if (this.role !== 'host' && this.role !== 'guest') world.takeDiffs();
    this.net?.update(dt);

    // objetivos
    const goal = GOALS[this.goalIdx];
    if (goal && goal.done(this)) {
      craftAudio.goal();
      this.toast(`✅ ${goal.text}`, 'banana');
      this.goalIdx = Math.min(GOALS.length - 1, this.goalIdx + 1);
      this.announce(GOALS[this.goalIdx].text);
    }

    // música ambiente
    const deep = me.body.y > world.surf[Math.max(0, Math.min(W - 1, Math.floor(me.body.x)))] + 12;
    craftAudio.music(dt, deep ? 'cave' : this.daylight() > 0.4 ? 'day' : 'night');

    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 25;
      this.save();
    }

    this.input.endFrame();
  }

  private updatePlayer(dt: number, uiConsumed: boolean): void {
    const me = this.me;
    const b = me.body;
    const inp = this.input;
    const world = this.world;

    me.hurtT = Math.max(0, me.hurtT - dt);
    me.invuln = Math.max(0, me.invuln - dt);
    me.flash = Math.max(0, me.flash - dt);
    me.exprT = Math.max(0, me.exprT - dt);
    me.atkCd = Math.max(0, me.atkCd - dt);
    me.placeCd = Math.max(0, me.placeCd - dt);
    me.emoteT = Math.max(0, me.emoteT - dt);
    me.blinkT -= dt;
    if (me.blinkT < -0.14) me.blinkT = 2 + Math.random() * 3.2;
    me.blink = me.blinkT < 0 ? 1 - Math.abs(me.blinkT + 0.07) / 0.07 : 0;

    if (me.dead) {
      b.vx *= 0.9;
      b.vy = Math.min(28, b.vy + 38 * dt);
      moveBody(world, b, dt);
      me.deadT -= dt;
      me.acting = false;
      if (me.deadT <= 0) this.respawn();
      return;
    }

    // hotbar
    for (let n = 1; n <= 9; n++) if (inp.hit(String(n))) this.selectSlot(n - 1);
    if (inp.wheel !== 0 && !this.ui.open) this.selectSlot((me.sel + inp.wheel + 9) % 9);
    if (inp.hit('e', 'i', 'tab')) {
      this.ui.toggle(this);
      craftAudio.ui();
    }
    if (inp.hit('q')) this.emote();
    if (inp.hit('=', '+')) this.zoom = Math.min(1.6, this.zoom + 0.1);
    if (inp.hit('-')) this.zoom = Math.max(0.65, this.zoom - 0.1);

    // movimento
    const left = inp.down('a', 'arrowleft');
    const rightK = inp.down('d', 'arrowright');
    const dir = (rightK ? 1 : 0) - (left ? 1 : 0);
    const up = inp.down('w', 'arrowup', 'space');
    const down = inp.down('s', 'arrowdown');
    const jumpPressed = inp.hit('w', 'arrowup', 'space');
    const speed = b.inWater ? 3.6 : me.eatT > 0 ? 3.4 : 6.4;
    const accel = b.onGround ? 70 : 32;
    const target = dir * speed;
    if (me.hurtT < 0.55) {
      if (b.vx < target) b.vx = Math.min(target, b.vx + accel * dt);
      else b.vx = Math.max(target, b.vx - accel * dt);
    }
    if (dir !== 0) me.facing = dir > 0 ? 1 : -1;

    if (b.onLadder && !jumpPressed) {
      b.vy = up ? -5.2 : down ? 5.2 : 0;
    } else {
      b.vy = Math.min(b.inWater ? 4 : 28, b.vy + (b.inWater ? 9 : 38) * dt);
    }
    me.coyote = b.onGround ? 0.1 : me.coyote - dt;
    me.jumpBuf = jumpPressed ? 0.12 : me.jumpBuf - dt;
    if (me.jumpBuf > 0 && me.coyote > 0) {
      b.vy = -13.2;
      me.jumpBuf = 0;
      me.coyote = 0;
      craftAudio.jump();
    }
    if (b.inWater && up) b.vy = Math.max(b.vy - 42 * dt, -5.2);
    if (b.onLadder && jumpPressed) b.vy = -9;
    const wasGround = b.onGround;
    const impact = moveBody(world, b, dt);
    if (impact > 19.5 && !b.inWater) {
      const dmg = (impact - 19.5) * 4.2;
      this.hurtMe(dmg, 0, 0, 'queda');
      this.floatText(b.x, b.y - 2.4, 'Ai, o chão!', '#fca5a5', 14);
    } else if (impact > 8 && !wasGround) craftAudio.step();
    b.stepSmooth = Math.max(0, b.stepSmooth - dt * 8);
    if (b.inWater !== me.wasWater) {
      craftAudio.splash();
      this.puff(b.x, b.y - 0.5, '#bfe4ff', 5);
      me.wasWater = b.inWater;
    }
    me.walk += Math.abs(b.vx) * dt * 2.3;
    if (b.onGround && Math.abs(b.vx) > 2) {
      me.stepT -= dt;
      if (me.stepT <= 0) {
        craftAudio.step();
        me.stepT = 0.3;
      }
    }
    const hz = hazardAt(world, b);
    if (hz > 0 && me.hurtT <= 0) this.hurtMe(hz, -me.facing * 5, -6, 'um cacto abraçador');

    // mira
    const [wx, wy] = this.screenToWorld(inp.mx, inp.my);
    const cx = b.x;
    const cy = b.y - 1.0;
    let ax = wx - cx;
    let ay = wy - cy;
    if (!inp.hasMouse) {
      ax = me.facing;
      ay = 0;
    }
    const al = Math.hypot(ax, ay) || 1;
    me.aimX = ax / al;
    me.aimY = ay / al;
    this.tx = Math.floor(wx);
    this.ty = Math.floor(wy);
    this.hasTarget = inp.hasMouse;
    const tcx = this.tx + 0.5;
    const tcy = this.ty + 0.5;
    this.reach = Math.hypot(tcx - cx, tcy - cy) <= REACH;

    // fome
    me.hunT += dt;
    if (me.hunT > 6) {
      me.hunT = 0;
      me.hunger = Math.max(0, me.hunger - 1);
      if (me.hunger === 15) this.toast('Barriga roncando... come uma banana! 🍌', 'chaos');
    }
    if (me.hunger <= 0) {
      me.starveT += dt;
      if (me.starveT > 3) {
        me.starveT = 0;
        this.hurtMe(4, 0, -2, 'fome');
      }
    } else if (me.hunger >= 70 && me.hp < 100) {
      me.regenT += dt;
      if (me.regenT > 1.8) {
        me.regenT = 0;
        me.hp = Math.min(100, me.hp + 3);
      }
    }
    this.stats.maxDepth = Math.max(this.stats.maxDepth, Math.floor(b.y - world.surf[Math.max(0, Math.min(W - 1, Math.floor(b.x)))]));

    // ações
    me.acting = false;
    if (me.eatT > 0) {
      me.eatT -= dt;
      if (me.eatT <= 0) craftAudio.eat();
      return;
    }
    if (uiConsumed || this.ui.open) {
      me.mineT = 0;
      return;
    }
    const held = this.heldId();
    const tool: ToolDef = TOOLS[held] ?? HAND;

    if (inp.right && me.placeCd <= 0) {
      const food = FOODS[held];
      const tid = world.get(this.tx, this.ty);
      if (food && (me.hunger < 100 || me.hp < 100) && inp.rightPressed) {
        me.eatT = 0.9;
        me.inv[me.sel].n--;
        if (me.inv[me.sel].n <= 0) me.inv[me.sel] = { id: 0, n: 0 };
        me.hunger = Math.min(100, me.hunger + food.food);
        me.hp = Math.min(100, me.hp + food.heal);
        this.floatText(b.x, b.y - 2.2, `+${food.heal} ❤`, '#86efac');
        craftAudio.eat();
        return;
      }
      if ((tid === B.BENCH || tid === B.FURNACE) && inp.rightPressed && this.reach) {
        this.ui.open = true;
        this.ui.tab = 'craft';
      } else if (isPlaceable(held) && this.reach) {
        this.tryPlace(held);
      }
    }

    if (inp.left) {
      me.acting = true;
      me.facing = this.tx + 0.5 >= b.x ? 1 : -1;
      this.doPrimary(dt, tool, held);
    } else {
      me.mineT = Math.max(0, me.mineT - dt * 2);
    }
    if (me.acting) me.swing += dt * (tool.kind === 'sword' ? 16 : 13);
  }

  private doPrimary(dt: number, tool: ToolDef, held: number): void {
    const me = this.me;
    const b = me.body;
    const world = this.world;
    const [wx, wy] = this.screenToWorld(this.input.mx, this.input.my);
    // alvo de ataque
    let target: Mob | null = null;
    let td = 99;
    for (const m of this.mobs.values()) {
      const dx = m.x - b.x;
      const dy = m.y - m.h / 2 - (b.y - 1);
      const d = Math.hypot(dx, dy);
      if (d > 3.4) continue;
      const overCursor = Math.abs(wx - m.x) < m.w / 2 + 0.45 && wy > m.y - m.h - 0.45 && wy < m.y + 0.35;
      const cone = tool.kind === 'sword' && (dx * me.aimX + dy * me.aimY) / (d || 1) > 0.35;
      if ((overCursor || cone) && d < td) {
        td = d;
        target = m;
      }
    }
    if (target) {
      if (me.atkCd <= 0) {
        me.atkCd = tool.kind === 'sword' ? 0.38 : 0.55;
        craftAudio.swing();
        const kx = (target.x >= b.x ? 1 : -1) * (tool.kind === 'sword' ? 7 : 4);
        if (this.role === 'guest') {
          this.net?.send({ k: 'hit', mob: target.id, dmg: tool.dmg, kx, by: this.myId() });
          target.hurtT = 0.25;
          this.floatText(target.x, target.y - target.h - 0.3, String(tool.dmg), '#fde047', 16);
          craftAudio.hit();
          this.burst(target.x, target.y - target.h / 2, '#c4c8d2', 5, 3);
        } else this.hurtMob(target, tool.dmg, kx, this.myId());
      }
      me.mineT = 0;
      return;
    }
    if (tool.kind === 'sword') {
      if (me.atkCd <= 0) {
        me.atkCd = 0.4;
        craftAudio.swing();
      }
      return;
    }
    // mineração
    const x = this.tx;
    const y = this.ty;
    const id = world.get(x, y);
    const def = BLOCKS[id];
    if (!this.reach || id === B.AIR || id === B.WATER || def.unbreakable) {
      me.mineT = 0;
      return;
    }
    const exposed =
      !def.solid ||
      !SOLID[world.get(x - 1, y)] || !SOLID[world.get(x + 1, y)] || !SOLID[world.get(x, y - 1)] || !SOLID[world.get(x, y + 1)];
    if (!exposed) {
      me.mineT = 0;
      return;
    }
    if (me.mineTx !== x || me.mineTy !== y) {
      me.mineTx = x;
      me.mineTy = y;
      me.mineT = 0;
    }
    if (tool.tier < def.tier) {
      me.mineSnd -= dt;
      if (me.mineSnd <= 0) {
        me.mineSnd = 0.5;
        craftAudio.mine('stone', 0.6);
        this.floatText(x + 0.5, y - 0.2, 'Precisa de picareta melhor!', '#fca5a5', 13);
      }
      return;
    }
    const rate = tool.power / Math.max(0.05, def.hardness);
    me.mineT += dt * (def.hardness <= 0 ? 99 : rate);
    me.mineSnd -= dt;
    me.mineFx -= dt;
    if (me.mineSnd <= 0) {
      me.mineSnd = 0.26;
      craftAudio.mine(def.sound, held === 0 ? 0.85 : 1);
    }
    if (me.mineFx <= 0) {
      me.mineFx = 0.16;
      this.burst(x + 0.5, y + 0.5, def.color, 2, 2.4);
    }
    if (me.mineT >= 1) {
      me.mineT = 0;
      this.breakBlock(x, y);
    }
  }

  private tryPlace(held: number): void {
    const me = this.me;
    const x = this.tx;
    const y = this.ty;
    if (!this.canPlaceAt(x, y)) return;
    const def = BLOCKS[held];
    if (def.solid) {
      const probe: Body = { ...newBody(x + 0.5, y + 1, 1, 1, false) };
      if (bodiesOverlap(probe, me.body, -0.02)) return;
      for (const r of this.remotes.values()) {
        const rb = newBody(r.x, r.y, 0.62, 1.7, false);
        if (bodiesOverlap(probe, rb, -0.02)) return;
      }
      for (const m of this.mobs.values()) if (bodiesOverlap(probe, m, -0.02)) return;
    }
    this.editBlock(x, y, held);
    me.inv[me.sel].n--;
    if (me.inv[me.sel].n <= 0) me.inv[me.sel] = { id: 0, n: 0 };
    me.placeCd = 0.14;
    me.acting = true;
    me.swing += 1.2;
    this.stats.placed++;
    craftAudio.place();
  }

  selectSlot(i: number): void {
    this.me.sel = i;
    const id = this.me.inv[i].id;
    this.selMsg = id ? itemName(id) : '';
    this.selMsgT = 1.6;
    craftAudio.ui();
  }

  emote(): void {
    const me = this.me;
    if (me.emoteT > 1.5) return;
    me.emote = EMOTES[Math.floor(Math.random() * EMOTES.length)];
    me.emoteT = 2.6;
    craftAudio.emote();
    this.net?.send({ k: 'em', text: me.emote });
  }

  recipes(): Recipe[] {
    return RECIPES;
  }
}

const MOB_EXPLOSION = 'um Pombo Explosivo';

export type { Expr };
