import { hazardHits, interact, makeMonkey, newWorld, resetMonkeyForRound, stepMonkeys, updatePlats } from './physics';
import { ROUNDS, type RoundCtx } from './rounds';
import type { RoundInfo } from './rounds/api';
import { type Ev, type Input, type Monkey, type MatchMode, type Phase, type RoundKind, type Skin, type World, emptyInput } from './types';
import { makeRng, shuffle, type Rng } from './util';

export const BOT_NAMES = [
  'Zé Banana', 'Macaco Prego', 'Dona Cuca', 'Tião Tropeço', 'Gorila Gelatina', 'Bananildo', 'Sagui Sarado',
  'Mico Leão', 'Bonobo Bobo', 'Seu Cipó', 'Babuíno Pão-Duro', 'Kong Júnior', 'Cacau', 'Jabuticaba', 'Coquinho',
  'Pipoca', 'Mingau', 'Bebel Banana', 'Orango Tango', 'Chimpa Zé', 'Macaquito', 'Fofão Peludo', 'Tia Penca',
  'Cuíca Maluca', 'Tonho Tonto', 'Rabo de Arraia', 'Mona Lisa', 'Dengo', 'Lerdo Lamê', 'Banguela',
];

export const FUR_COLORS = ['#a16207', '#7c4a1d', '#d97706', '#c2a07a', '#6b7280', '#e0a526'];
export const SUIT_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899',
  '#14b8a6', '#eab308', '#6366f1', '#84cc16', '#06b6d4', '#f43f5e',
];
export const HAT_COUNT = 12;
export const ACC_COUNT = 6;
export const TEAM_NAMES = ['BANANAS', 'MELANCIAS'];
export const TEAM_COLORS = ['#facc15', '#ef4444'];

export function skinFor(i: number): Skin {
  return {
    suit: i % 12,
    hat: (i * 5 + Math.floor(i / 12) * 3 + 1) % HAT_COUNT,
    fur: (i * 3 + Math.floor(i / 6)) % FUR_COLORS.length,
    acc: (i * 5 + 2) % ACC_COUNT,
  };
}

export interface HumanSlot {
  owner: string;
  name: string;
}

export function buildWorld(kind: RoundKind, variant: number, seed: number, n: number): World {
  const w = newWorld(kind, variant, seed, n);
  ROUNDS[kind].build(w, n, variant, makeRng(seed));
  return w;
}

export function targetFor(alive: number): number {
  if (alive <= 4) return 1;
  return Math.max(4, Math.min(alive - 1, Math.round(alive * 0.7)));
}

export interface ResultRow {
  id: number;
  q: boolean;
}

export class Match implements RoundCtx {
  mode: MatchMode;
  monkeys: Monkey[] = [];
  phase: Phase = 'intro';
  phaseT = 0;
  roundNo = 0;
  kind: RoundKind = 'race';
  variant = 0;
  world: World;
  info: RoundInfo = { title: '', blurb: '', tip: '' };
  target = 0;
  isFinal = false;
  champion = -1;
  over = false;
  events: Ev[] = [];
  results: ResultRow[] = [];
  roundsPlanned = 0;
  readonly rng: Rng;
  private deck: RoundKind[] = [];
  private lastKind: RoundKind | null = null;
  private finishReq = false;
  private outSeq = 0;
  all: Monkey[];
  emit = (ev: Ev): void => {
    this.events.push(ev);
  };

  constructor(mode: MatchMode, humans: HumanSlot[], total: number, seed = Math.floor(Math.random() * 1e9)) {
    this.mode = mode;
    this.rng = makeRng(seed);
    this.all = this.monkeys;
    const n = Math.max(total, humans.length, 6);
    const names = shuffle(BOT_NAMES, this.rng);
    const skinOrder = shuffle(Array.from({ length: 36 }, (_, i) => i), this.rng);
    let bi = 0;
    for (let i = 0; i < n; i++) {
      const h = humans[i];
      const m = h
        ? makeMonkey(i, h.name, skinFor(skinOrder[i]), h.owner, false, 1)
        : makeMonkey(i, names[bi++ % names.length], skinFor(skinOrder[i]), '', true, 0.55 + this.rng() * 0.42);
      this.monkeys.push(m);
    }
    this.world = newWorld('race', 0, 0, n);
  }

  static client(): Match {
    const m = new Match('client', [], 6);
    m.monkeys.length = 0;
    m.all = m.monkeys;
    return m;
  }

  // ───────── RoundCtx ─────────
  comp(): Monkey[] {
    return this.monkeys.filter((m) => m.status !== 'out');
  }

  nQual(): number {
    let c = 0;
    for (const m of this.monkeys) if (m.status === 'qual') c++;
    return c;
  }

  qualify(m: Monkey): void {
    if (m.status !== 'alive') return;
    m.status = 'qual';
    m.done = true;
    m.place = this.nQual();
    m.vx *= 0.2;
    this.emit({ k: 'qual', id: m.id });
  }

  eliminate(m: Monkey, text?: string): void {
    if (m.status === 'out') return;
    m.status = 'out';
    m.outRound = this.roundNo;
    m.outAt = this.outSeq++;
    m.gone = true;
    m.crown = false;
    this.emit({ k: 'elim', id: m.id, s: text ?? 'ELIMINADO!', x: m.x, y: m.y });
  }

  finish(): void {
    this.finishReq = true;
  }

  // ───────── helpers ─────────
  humansAlive(): number {
    let c = 0;
    for (const m of this.monkeys) if (!m.isBot && m.status === 'alive' && !m.gone) c++;
    return c;
  }

  aliveCount(): number {
    let c = 0;
    for (const m of this.monkeys) if (m.status !== 'out') c++;
    return c;
  }

  racingCount(): number {
    let c = 0;
    for (const m of this.monkeys) if (m.status === 'alive') c++;
    return c;
  }

  scoreFor(m: Monkey): number {
    const survived = m.outRound > 0 ? m.outRound - 1 : this.roundNo;
    return survived * 120 + (m.id === this.champion ? 1000 : 0) + Math.round(m.score * 5);
  }

  get mod() {
    return ROUNDS[this.kind];
  }

  // ───────── lifecycle ─────────
  start(): void {
    this.roundNo = 0;
    this.deck = shuffle<RoundKind>(['hex', 'seesaw', 'tail', 'soccer', 'race'], this.rng);
    this.lastKind = null;
    this.champion = -1;
    this.over = false;
    for (const m of this.monkeys) {
      m.status = 'alive';
      m.outRound = 0;
      m.gone = false;
    }
    this.startRound('race', Math.floor(this.rng() * 2));
  }

  private pickNext(alive: number): RoundKind {
    if (alive <= 4) return 'crown';
    for (let tries = 0; tries < 12; tries++) {
      if (this.deck.length === 0) {
        this.deck = shuffle<RoundKind>(['hex', 'seesaw', 'tail', 'soccer', 'race'], this.rng);
      }
      const k = this.deck.shift()!;
      if (k === this.lastKind) continue;
      if (k === 'soccer' && alive < 5) continue;
      return k;
    }
    return 'hex';
  }

  startRound(kind: RoundKind, variant: number): void {
    this.roundNo++;
    if (this.roundNo === 1) this.firstVariant = variant;
    this.kind = kind;
    this.lastKind = kind;
    this.variant = variant;
    this.isFinal = kind === 'crown';
    this.finishReq = false;
    this.results = [];
    const comp = this.comp();
    for (const m of comp) {
      m.status = 'alive';
      resetMonkeyForRound(m);
    }
    const n = comp.length;
    const seed = Math.floor(this.rng() * 1e9);
    const mod = ROUNDS[kind];
    this.world = newWorld(kind, variant, seed, n);
    mod.build(this.world, n, variant, makeRng(seed));
    this.target = this.isFinal ? 1 : targetFor(n);
    this.world.tailTarget = this.target;
    this.world.timeLeft = this.world.limit;
    const order = shuffle(comp, this.rng);
    const srng = makeRng(seed ^ 0x9e3779b9);
    order.forEach((m, i) => mod.spawn(this.world, m, i, n, srng));
    this.info = mod.info(variant);
    this.phase = 'intro';
    this.phaseT = 0;
    this.emit({ k: 'round', n: this.roundNo });
  }

  private finalize(): void {
    const w = this.world;
    const mod = this.mod;
    const alive = this.comp().filter((m) => m.status === 'alive');
    const need = mod.fill ? this.target : mod.minQual;
    const ranked = mod.rank(w, alive);
    for (const m of ranked) {
      if (this.nQual() < need) this.qualify(m);
      else this.eliminate(m, 'ELIMINADO! VAI PRA CASA, MACACO!');
    }
    // rescue: nobody survived (everyone fell at once)
    const minQ = this.isFinal ? 1 : 2;
    if (this.nQual() < minQ) {
      const fallen = this.monkeys
        .filter((m) => m.status === 'out' && m.outRound === this.roundNo)
        .sort((a, b) => b.outAt - a.outAt);
      for (const m of fallen) {
        if (this.nQual() >= minQ) break;
        m.status = 'qual';
        m.outRound = 0;
        m.done = true;
        m.place = this.nQual() + 1;
        this.emit({ k: 'qual', id: m.id });
      }
    }
    const rows: ResultRow[] = [];
    const q = this.monkeys.filter((m) => m.status === 'qual').sort((a, b) => a.place - b.place);
    for (const m of q) rows.push({ id: m.id, q: true });
    const e = this.monkeys.filter((m) => m.status === 'out' && m.outRound === this.roundNo);
    for (const m of e) rows.push({ id: m.id, q: false });
    this.results = rows;
    if (this.isFinal) {
      const win = q[0] ?? null;
      this.champion = win ? win.id : -1;
    }
    this.phase = 'end';
    this.phaseT = 0;
    this.emit({ k: 'roundend', n: this.isFinal ? 1 : 0 });
  }

  private nextRound(): void {
    const alive = this.comp().length;
    if (this.isFinal || alive <= 1) {
      this.phase = 'champion';
      this.phaseT = 0;
      if (this.champion < 0) {
        const c = this.comp()[0];
        this.champion = c ? c.id : -1;
      }
      this.emit({ k: 'champion', id: this.champion });
      return;
    }
    const kind = this.pickNext(alive);
    const variant = kind === 'race' ? 1 - (this.firstVariant ?? 0) : 0;
    this.startRound(kind, variant);
  }

  private firstVariant: number | null = null;

  update(dt: number): void {
    if (this.mode === 'client') return;
    const w = this.world;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 3.6) {
          this.phase = 'count';
          this.phaseT = 0;
        }
        break;
      case 'count': {
        const before = Math.ceil(3 - (this.phaseT - dt));
        const after = Math.ceil(3 - this.phaseT);
        if (after !== before && after > 0) this.emit({ k: 'count', n: after });
        if (this.phaseT >= 3) {
          this.phase = 'play';
          this.phaseT = 0;
          this.emit({ k: 'go' });
        }
        break;
      }
      case 'play': {
        w.t += dt;
        w.timeLeft = w.limit - w.t;
        updatePlats(w, dt);
        const mod = this.mod;
        for (const m of this.monkeys) {
          if (m.status === 'alive' && m.isBot && !m.gone) mod.bot(m, w, this, dt);
        }
        stepMonkeys(w, this.monkeys, dt, this.emit);
        interact(w, this.monkeys, dt, this.emit);
        hazardHits(w, this.monkeys, this.emit);
        mod.update(w, this, dt);
        const soccerOT = this.kind === 'soccer' && w.winTeam < 0 && w.t < w.limit + 45;
        if (w.timeLeft <= 0 && !soccerOT) this.finishReq = true;
        if (this.finishReq) this.finalize();
        break;
      }
      case 'end':
        updatePlats(w, dt);
        stepMonkeys(w, this.monkeys, dt, this.emit);
        if (this.phaseT > 2.4) {
          if (this.isFinal) this.nextRound();
          else {
            this.phase = 'results';
            this.phaseT = 0;
          }
        }
        break;
      case 'results':
        updatePlats(w, dt);
        stepMonkeys(w, this.monkeys, dt, this.emit);
        if (this.phaseT > 4.6) this.nextRound();
        break;
      case 'champion':
        stepMonkeys(w, this.monkeys, dt, this.emit);
        if (this.phaseT > 7 && !this.over) {
          this.over = true;
          this.emit({ k: 'over' });
        }
        break;
    }
    for (const m of this.monkeys) {
      m.input.jump = false;
      m.input.dive = false;
    }
  }

  setInput(owner: string, inp: Partial<Input>): void {
    for (const m of this.monkeys) {
      if (m.owner === owner && !m.isBot) {
        m.input.mx = inp.mx ?? 0;
        if (inp.jump) m.input.jump = true;
        if (inp.dive) m.input.dive = true;
        m.input.grab = !!inp.grab;
      }
    }
  }

  /** a human left: a bot takes the controls */
  botify(owner: string): void {
    for (const m of this.monkeys) {
      if (m.owner === owner && !m.isBot) {
        m.isBot = true;
        m.owner = '';
        m.skill = 0.6;
        m.input = emptyInput();
      }
    }
  }
}
