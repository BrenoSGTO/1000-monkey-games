// Simulação pura (sem DOM) do quintal: plantas, gorilas, projéteis, bananas, aparadores e ondas.
import {
  LevelDef,
  PLANTS,
  PLANT_ORDER,
  PlantId,
  QUIPS_KILL,
  QUIPS_WAVE,
  VERSUS_TIME,
  ZOMBIES,
  ZOMBIE_ORDER,
  ZombieId,
} from './data';

export const W = 1000;
export const H = 640;
export const COLS = 9;
export const ROWS = 5;
export const CELL_W = 84;
export const CELL_H = 88;
export const LAWN_X = 120;
export const LAWN_Y = 138;
export const SPAWN_X = 1015;
export const LAWN_END = LAWN_X + COLS * CELL_W; // 876

export const rowY = (r: number): number => LAWN_Y + r * CELL_H + CELL_H / 2;
export const colX = (c: number): number => LAWN_X + c * CELL_W + CELL_W / 2;
export const colOf = (x: number): number => Math.floor((x - LAWN_X) / CELL_W);

export type Mode = 'solo' | 'coop' | 'versus';
export type State = 'playing' | 'won' | 'lost';

export interface Ev {
  k: string;
  x?: number;
  y?: number;
  id?: number;
  s?: string;
  n?: number;
  z?: string;
  p?: string;
  how?: string;
  r?: number;
  c?: string;
  f?: boolean;
}

export interface Plant {
  id: number;
  type: PlantId;
  r: number;
  c: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  age: number;
  cd: number;
  st: number;
  owner: number;
  flash: number;
  fireT: number;
  hugT: number;
  actT: number;
  target: number;
}

export interface Zombie {
  id: number;
  type: ZombieId;
  r: number;
  x: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  slow: number;
  eat: boolean;
  biteT: number;
  flash: number;
  armLost: boolean;
  jumpT: number;
  jumpFrom: number;
  jumpTo: number;
  jumped: boolean;
  enraged: boolean;
  owner: number;
  phase: number;
  aura: number;
  vx: number;
  t1: number;
  t2: number;
  big: boolean;
}

export type ProjKind = 'coco' | 'gelado' | 'melancia';
export interface Proj {
  id: number;
  kind: ProjKind;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sx: number;
  tx: number;
  by: number;
  t: number;
  dur: number;
  rot: number;
}

export interface Drop {
  id: number;
  kind: number; // 0 céu, 1 planta
  x: number;
  y: number;
  ty: number;
  vx: number;
  vy: number;
  value: number;
  age: number;
}

export interface Mower {
  r: number;
  x: number;
  st: number; // 0 parado, 1 correndo, 2 usado
}

interface Pending {
  t: number;
  type: ZombieId;
  r: number;
  owner: number;
}

export interface WorldOpts {
  mode: Mode;
  plantSlot?: number;
  mirror?: boolean;
}

export const JUMP_DUR = 0.85;
export const JACA_DUR = 0.7;
const BELT_MAX = 7;

const rnd = (): number => Math.random();
const phaseOf = (id: number): number => (id * 2.399) % (Math.PI * 2);

export function zJy(z: { jumpT: number }): number {
  if (z.jumpT <= 0) return 0;
  const u = 1 - z.jumpT / JUMP_DUR;
  return Math.sin(Math.PI * u) * 46;
}

export function zoneOwner(r: number): number {
  return r < 2 ? 0 : r > 2 ? 1 : -1; // -1 = compartilhada
}

export class World {
  level: LevelDef;
  mode: Mode;
  plantSlot: number;
  mirror: boolean;

  plants: Plant[] = [];
  zombies: Zombie[] = [];
  projs: Proj[] = [];
  drops: Drop[] = [];
  mowers: Mower[] = [];
  grid: (Plant | null)[] = new Array(ROWS * COLS).fill(null);

  bank = 0;
  brains = 0;
  pcd: number[][] = [new Array(PLANT_ORDER.length).fill(0), new Array(PLANT_ORDER.length).fill(0)];
  zcd: number[] = new Array(ZOMBIE_ORDER.length).fill(0);
  belt: PlantId[][] = [[], []];
  beltT = 2;

  time = 0;
  state: State = 'playing';
  winner: 'plants' | 'zombies' = 'plants';
  kills = 0;
  wave = 0; // ondas já lançadas
  wt = 20; // tempo até a próxima onda
  waveHp = 0;
  finalLaunched = false;
  warned = false;
  skyT = 5;
  pending: Pending[] = [];
  events: Ev[] = [];
  nextId = 1;
  mowersUsed = 0;
  mowerLost = 0;
  bossAlive = false;

  constructor(level: LevelDef, opts: WorldOpts) {
    this.level = level;
    this.mode = opts.mode;
    this.plantSlot = opts.plantSlot ?? 0;
    this.mirror = !!opts.mirror;
    this.bank = level.startBananas;
    this.brains = level.mode === 'versus' ? 200 : 0;
    this.wt = level.id === 1 ? 12 : 20;
    this.skyT = 4 + rnd() * 3;
    for (const r of level.lanes) this.mowers.push({ r, x: 70, st: 0 });
    if (level.mode === 'conveyor') {
      this.beltT = 1;
    }
  }

  // ---------- util ----------
  emit(ev: Ev): void {
    this.events.push(ev);
    this.applyAnim(ev);
  }

  /** Aplica efeitos locais de animação (timers das entidades) — usado também pelo espelho do convidado. */
  applyAnim(ev: Ev): void {
    switch (ev.k) {
      case 'shoot': {
        const p = this.plants.find((q) => q.id === ev.id);
        if (p) p.fireT = 0.25;
        break;
      }
      case 'hug': {
        const p = this.plants.find((q) => q.id === ev.id);
        if (p) p.hugT = 0.35;
        break;
      }
      case 'hit': {
        const z = this.zombies.find((q) => q.id === ev.id);
        if (z) z.flash = 0.12;
        break;
      }
      case 'phit': {
        const p = this.plants.find((q) => q.id === ev.id);
        if (p) p.flash = 0.12;
        break;
      }
    }
  }

  drainEvents(): Ev[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  say(x: number, y: number, s: string, c = '#fde047'): void {
    this.emit({ k: 'text', x, y, s, c });
  }

  private idx(r: number, c: number): number {
    return r * COLS + c;
  }

  plantAt(r: number, c: number): Plant | null {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return this.grid[this.idx(r, c)];
  }

  laneActive(r: number): boolean {
    return this.level.lanes.includes(r);
  }

  zRowMatch(z: Zombie, r: number): boolean {
    return z.big ? Math.abs(z.r - r) <= 1 : z.r === r;
  }

  // ---------- comandos ----------
  /** Retorna null se puder plantar, ou o motivo (PT-BR) */
  checkPlant(slot: number, type: PlantId, r: number, c: number, beltIdx = -1): string | null {
    if (this.state !== 'playing') return 'Fim de jogo';
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 'Fora do gramado';
    if (!this.laneActive(r)) return 'Essa linha tá interditada';
    if (this.mode === 'versus' && slot !== this.plantSlot) return 'Você é o time dos gorilas!';
    if (this.mode === 'coop') {
      const zo = zoneOwner(r);
      if (zo !== -1 && zo !== slot) return 'Essa linha é do parceiro!';
    }
    if (this.grid[this.idx(r, c)]) return 'Já tem planta aí';
    const def = PLANTS[type];
    if (this.level.mode === 'conveyor') {
      const b = this.belt[slot] ?? [];
      if (beltIdx < 0 || b[beltIdx] !== type) return 'Essa planta sumiu da esteira';
      return null;
    }
    if (!this.level.plants.includes(type)) return 'Planta não liberada';
    if (this.pcd[slot][PLANT_ORDER.indexOf(type)] > 0) return 'Semente recarregando...';
    if (this.bank < def.cost) return 'Faltam bananas!';
    return null;
  }

  plant(slot: number, type: PlantId, r: number, c: number, beltIdx = -1): boolean {
    if (this.checkPlant(slot, type, r, c, beltIdx) !== null) return false;
    const def = PLANTS[type];
    if (this.level.mode === 'conveyor') {
      this.belt[slot].splice(beltIdx, 1);
    } else {
      this.bank -= def.cost;
      this.pcd[slot][PLANT_ORDER.indexOf(type)] = def.cd;
    }
    const p: Plant = {
      id: this.nextId++,
      type,
      r,
      c,
      x: colX(c),
      y: rowY(r) + 30,
      hp: def.hp,
      maxHp: def.hp,
      age: 0,
      cd: 0,
      st: 0,
      owner: slot,
      flash: 0,
      fireT: 0,
      hugT: 0,
      actT: 0,
      target: 0,
    };
    switch (type) {
      case 'bananeira':
        p.cd = 5 + rnd() * 3;
        break;
      case 'coco':
      case 'coqueiro':
      case 'maracuja':
        p.cd = 0.6;
        break;
      case 'abacaxi':
        p.cd = 12;
        break;
      case 'pimenta':
        p.cd = 1.15;
        p.st = 1;
        break;
      case 'melancia':
        p.cd = 1;
        break;
      case 'cacto':
        p.cd = 0.3;
        break;
      default:
        break;
    }
    this.plants.push(p);
    this.grid[this.idx(r, c)] = p;
    this.emit({ k: 'plant', x: p.x, y: p.y, p: type });
    if (type === 'pimenta') this.emit({ k: 'snd', s: 'fuse' });
    return true;
  }

  shovel(slot: number, r: number, c: number): boolean {
    if (this.state !== 'playing') return false;
    const p = this.plantAt(r, c);
    if (!p) return false;
    if (this.mode === 'versus' && slot !== this.plantSlot) return false;
    if (this.mode === 'coop') {
      const zo = zoneOwner(r);
      if (zo !== -1 && zo !== slot) return false;
    }
    this.emit({ k: 'dig', x: p.x, y: p.y });
    this.removePlant(p);
    return true;
  }

  collect(id: number, slot: number): boolean {
    const i = this.drops.findIndex((d) => d.id === id);
    if (i < 0) return false;
    if (this.mode === 'versus' && slot !== this.plantSlot) return false;
    const d = this.drops[i];
    this.drops.splice(i, 1);
    this.bank += d.value;
    this.emit({ k: 'collect', x: d.x, y: d.y, n: d.value });
    return true;
  }

  checkSend(slot: number, type: ZombieId, r: number): string | null {
    if (this.mode !== 'versus') return 'Só no Versus';
    if (this.state !== 'playing') return 'Fim de jogo';
    if (slot === this.plantSlot) return 'Você planta!';
    if (!this.laneActive(r)) return 'Linha interditada';
    const def = ZOMBIES[type];
    if (this.zcd[ZOMBIE_ORDER.indexOf(type)] > 0) return 'Gorila descansando...';
    if (this.brains < def.brain) return 'Faltam cérebros-banana!';
    return null;
  }

  sendZombie(slot: number, type: ZombieId, r: number): boolean {
    if (this.checkSend(slot, type, r) !== null) return false;
    const def = ZOMBIES[type];
    this.brains -= def.brain;
    this.zcd[ZOMBIE_ORDER.indexOf(type)] = def.vcd;
    const z = this.spawnZombie(type, type === 'chefe' ? 2 : r, SPAWN_X, slot);
    this.emit({ k: 'text', x: LAWN_END - 40, y: rowY(z.r) - 30, s: 'Chegou gorila!', c: '#fb7185' });
    return true;
  }

  // ---------- spawn ----------
  spawnZombie(type: ZombieId, r: number, x = SPAWN_X, owner = 0): Zombie {
    const def = ZOMBIES[type];
    const id = this.nextId++;
    const z: Zombie = {
      id,
      type,
      r,
      x: x + rnd() * 30,
      hp: def.hp,
      maxHp: def.hp,
      armor: def.armor,
      maxArmor: def.armor,
      slow: 0,
      eat: false,
      biteT: 0,
      flash: 0,
      armLost: false,
      jumpT: 0,
      jumpFrom: 0,
      jumpTo: 0,
      jumped: false,
      enraged: false,
      owner,
      phase: phaseOf(id),
      aura: 1,
      vx: -def.speed,
      t1: type === 'chefe' ? 7 : 0,
      t2: type === 'chefe' ? 11 : 0,
      big: type === 'chefe',
    };
    this.zombies.push(z);
    if (type === 'chefe') {
      this.emit({ k: 'roar', x: z.x, y: rowY(r) });
    }
    return z;
  }

  private launchWave(): void {
    const lvl = this.level;
    const w = this.wave;
    const survival = lvl.mode === 'survival';
    const final = !survival && w === lvl.waves - 1;
    const flag = final || (w + 1) % 10 === 0;
    const bossWave = (lvl.boss && final) || (survival && (w + 1) % 20 === 0);
    let budget = lvl.diff * (1.2 + w * (survival ? 1.1 : 0.85));
    if (flag) budget *= 1.8;
    if (bossWave) budget *= 0.7;

    const list: ZombieId[] = [];
    const allowed = lvl.zombies.filter((z) => {
      const def = ZOMBIES[z];
      const minW = lvl.newZombie === z ? Math.min(def.minWave, 1) : def.minWave;
      const scaled = survival ? Math.floor(minW * 0.8) : minW;
      return w >= scaled && def.weight < 40;
    });
    let guard = 0;
    while (budget >= 1 && guard++ < 60) {
      const cand = allowed.filter((z) => ZOMBIES[z].weight <= budget);
      if (cand.length === 0) break;
      // favorece os mais baratos, mas o recém-chegado aparece bastante
      const weights = cand.map((z) => (lvl.newZombie === z ? 1.6 : 1 / Math.sqrt(ZOMBIES[z].weight)));
      const sum = weights.reduce((a, b) => a + b, 0);
      let t = rnd() * sum;
      let pick = cand[0];
      for (let i = 0; i < cand.length; i++) {
        t -= weights[i];
        if (t <= 0) {
          pick = cand[i];
          break;
        }
      }
      list.push(pick);
      budget -= ZOMBIES[pick].weight;
    }
    if (list.length === 0) list.push('basico');
    if (list.length > 45) list.length = 45;

    let hpSum = 0;
    const spread = flag ? 7 : 3.5;
    list.forEach((type) => {
      const r = lvl.lanes[Math.floor(rnd() * lvl.lanes.length)];
      this.pending.push({ t: this.time + rnd() * spread, type, r, owner: 0 });
      hpSum += ZOMBIES[type].hp + ZOMBIES[type].armor;
    });
    if (bossWave) {
      this.pending.push({ t: this.time + 1.5, type: 'chefe', r: 2, owner: 0 });
      hpSum += ZOMBIES.chefe.hp * 0.2;
    }
    this.waveHp = hpSum;
    this.wave++;
    this.warned = false;
    this.emit({ k: 'wave', n: this.wave, f: flag, s: QUIPS_WAVE[Math.floor(rnd() * QUIPS_WAVE.length)] });
    if (!survival && this.wave >= lvl.waves) {
      this.finalLaunched = true;
      this.wt = 9999;
    } else {
      this.wt = survival ? Math.max(14, 24 - w * 0.4) : 25;
    }
  }

  // ---------- passo ----------
  step(dt: number): void {
    if (this.mirror) {
      this.stepMirror(dt);
      return;
    }
    if (this.state !== 'playing') {
      // deixa os efeitos terminarem
      this.tickTimersOnly(dt);
      return;
    }
    this.time += dt;
    const slotsN = this.mode === 'solo' ? 1 : 2;
    for (let s = 0; s < slotsN; s++) {
      const a = this.pcd[s];
      for (let i = 0; i < a.length; i++) if (a[i] > 0) a[i] = Math.max(0, a[i] - dt);
    }
    for (let i = 0; i < this.zcd.length; i++) if (this.zcd[i] > 0) this.zcd[i] = Math.max(0, this.zcd[i] - dt);

    this.updateEconomy(dt);
    this.updateWaves(dt);
    this.updateAura();
    for (const p of this.plants.slice()) this.updatePlant(p, dt);
    for (const pr of this.projs.slice()) this.updateProj(pr, dt);
    for (const z of this.zombies.slice()) this.updateZombie(z, dt);
    this.updateMowers(dt);
    this.updateDrops(dt);
    this.checkEnd();
  }

  private tickTimersOnly(dt: number): void {
    for (const z of this.zombies) z.flash = Math.max(0, z.flash - dt);
    for (const p of this.plants) {
      p.flash = Math.max(0, p.flash - dt);
      p.fireT = Math.max(0, p.fireT - dt);
      p.hugT = Math.max(0, p.hugT - dt);
    }
  }

  private updateEconomy(dt: number): void {
    const lvl = this.level;
    if (lvl.sky) {
      this.skyT -= dt;
      if (this.skyT <= 0) {
        this.skyT = 7 + rnd() * 3.5;
        const lanes = lvl.lanes;
        const r = lanes[Math.floor(rnd() * lanes.length)];
        const x = LAWN_X + 40 + rnd() * (COLS * CELL_W - 80);
        this.drops.push({
          id: this.nextId++,
          kind: 0,
          x,
          y: 52,
          ty: rowY(r) + 10 + rnd() * 10,
          vx: 0,
          vy: 62,
          value: 25,
          age: 0,
        });
      }
    }
    if (lvl.mode === 'versus') {
      const rate = 9 + this.time / 40;
      this.brains += rate * dt;
    }
    if (lvl.mode === 'conveyor') {
      this.beltT -= dt;
      if (this.beltT <= 0) {
        this.beltT = 4.2 + rnd() * 1.5;
        const slotsN = this.mode === 'coop' ? 2 : 1;
        for (let s = 0; s < slotsN; s++) {
          if (this.belt[s].length < BELT_MAX) {
            const types = lvl.plants;
            this.belt[s].push(types[Math.floor(rnd() * types.length)]);
          }
        }
      }
    }
  }

  private updateWaves(dt: number): void {
    const lvl = this.level;
    if (lvl.mode === 'versus') return;
    // gorilas pendentes
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i];
      if (this.time >= pd.t) {
        this.spawnZombie(pd.type, pd.r, SPAWN_X, pd.owner);
        this.pending.splice(i, 1);
      }
    }
    if (!this.finalLaunched) {
      this.wt -= dt;
      const flagNext = lvl.mode !== 'survival' ? this.wave === lvl.waves - 1 || (this.wave + 1) % 10 === 0 : (this.wave + 1) % 10 === 0;
      if (flagNext && !this.warned && this.wt < 4.5 && this.wave > 0) {
        this.warned = true;
        this.emit({ k: 'warn' });
      }
      if (this.wave > 0 && this.wt > 5 && this.pending.length === 0) {
        let hp = 0;
        for (const z of this.zombies) hp += z.hp + z.armor;
        if (hp <= this.waveHp * 0.2) this.wt = 5;
      }
      if (this.wt <= 0) this.launchWave();
    }
  }

  private updateAura(): void {
    for (const z of this.zombies) z.aura = 1;
    for (const g of this.zombies) {
      if (g.type !== 'gerente') continue;
      for (const z of this.zombies) {
        if (z !== g && z.r === g.r && Math.abs(z.x - g.x) < 170 && z.aura < 1.35) z.aura = 1.35;
      }
    }
  }

  private frontZombie(p: Plant, maxX = LAWN_END + 70): Zombie | null {
    let best: Zombie | null = null;
    for (const z of this.zombies) {
      if (!this.zRowMatch(z, p.r)) continue;
      if (z.x < p.x - 8 || z.x > maxX) continue;
      if (!best || z.x < best.x) best = z;
    }
    return best;
  }

  private updatePlant(p: Plant, dt: number): void {
    p.age += dt;
    p.flash = Math.max(0, p.flash - dt);
    p.fireT = Math.max(0, p.fireT - dt);
    p.hugT = Math.max(0, p.hugT - dt);
    switch (p.type) {
      case 'bananeira': {
        p.cd -= dt;
        if (p.cd <= 0) {
          p.cd = 24;
          this.drops.push({
            id: this.nextId++,
            kind: 1,
            x: p.x,
            y: p.y - 50,
            ty: p.y - 12 + (rnd() - 0.5) * 16,
            vx: (rnd() - 0.5) * 70,
            vy: -120,
            value: 25,
            age: 0,
          });
          this.emit({ k: 'snd', s: 'pop' });
          this.emit({ k: 'poof', x: p.x, y: p.y - 56 });
        }
        break;
      }
      case 'coco':
      case 'coqueiro':
      case 'maracuja': {
        if (p.type === 'coqueiro' && p.st === 1) {
          p.actT -= dt;
          if (p.actT <= 0) {
            p.st = 0;
            this.fireProj(p, 'coco');
          }
        }
        p.cd = Math.max(0, p.cd - dt);
        if (p.cd <= 0 && this.frontZombie(p)) {
          p.cd = 1.5;
          this.fireProj(p, p.type === 'maracuja' ? 'gelado' : 'coco');
          if (p.type === 'coqueiro') {
            p.st = 1;
            p.actT = 0.17;
          }
        }
        break;
      }
      case 'cacto': {
        p.cd -= dt;
        if (p.cd <= 0) {
          const hit = this.zombies.filter(
            (z) => this.zRowMatch(z, p.r) && z.x > p.x - 20 && z.x < p.x + 82 && z.jumpT <= 0,
          );
          if (hit.length > 0) {
            p.cd = 0.9;
            this.emit({ k: 'hug', id: p.id, x: p.x, y: p.y });
            this.emit({ k: 'snd', s: 'hug' });
            for (const z of hit) this.damageZ(z, 36, 'normal');
          } else {
            p.cd = 0.1;
          }
        }
        break;
      }
      case 'abacaxi': {
        if (p.st === 0) {
          p.cd -= dt;
          if (p.cd <= 0) {
            p.st = 1;
            this.emit({ k: 'armed', x: p.x, y: p.y - 20 });
          }
        } else {
          const z = this.zombies.find((q) => q.r === p.r && Math.abs(q.x - p.x) < 40 && q.jumpT <= 0 && !q.big);
          if (z) {
            this.explode(p.x, p.y - 10, p.r, 78, 0, 1800, 'mina');
            this.removePlant(p, false);
          }
        }
        break;
      }
      case 'pimenta': {
        p.cd -= dt;
        if (p.cd <= 0) {
          this.explode(p.x, p.y - 20, p.r, 134, 1, 1800, 'pimenta');
          this.removePlant(p, false);
        }
        break;
      }
      case 'jaca': {
        if (p.st === 0) {
          const z = this.zombies.find(
            (q) => this.zRowMatch(q, p.r) && q.x > p.x - 6 && q.x < p.x + 112 && q.jumpT <= 0,
          );
          if (z) {
            p.st = 1;
            p.actT = JACA_DUR;
            p.target = z.x - 4;
            this.emit({ k: 'jaca', id: p.id });
          }
        } else {
          p.actT -= dt;
          if (p.actT <= 0) {
            this.emit({ k: 'snd', s: 'crush' });
            this.explode(p.target, p.y - 5, p.r, 62, 0, 1800, 'jaca');
            this.removePlant(p, false);
          }
        }
        break;
      }
      case 'melancia': {
        p.cd = Math.max(0, p.cd - dt);
        if (p.cd <= 0) {
          const z = this.frontZombie(p);
          if (z) {
            p.cd = 3;
            this.fireLob(p, z);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private fireProj(p: Plant, kind: ProjKind): void {
    this.projs.push({
      id: this.nextId++,
      kind,
      r: p.r,
      x: p.x + 28,
      y: p.y - 48,
      vx: 330,
      vy: 0,
      sx: 0,
      tx: 0,
      by: 0,
      t: 0,
      dur: 0,
      rot: 0,
    });
    this.emit({ k: 'shoot', id: p.id, x: p.x + 30, y: p.y - 48, s: kind });
  }

  private fireLob(p: Plant, z: Zombie): void {
    const dur = 0.95;
    const tx = Math.max(p.x + 40, z.x + z.vx * dur);
    const sy = p.y - 70;
    const ty = rowY(z.big ? 2 : z.r) + 24;
    this.projs.push({
      id: this.nextId++,
      kind: 'melancia',
      r: z.r,
      x: p.x + 14,
      y: sy,
      vx: (tx - (p.x + 14)) / dur,
      vy: 0,
      sx: p.x + 14,
      tx,
      by: sy + (ty - sy) * 0,
      t: 0,
      dur,
      rot: 0,
    });
    this.emit({ k: 'shoot', id: p.id, x: p.x + 14, y: sy, s: 'melancia' });
  }

  private updateProj(pr: Proj, dt: number): void {
    if (pr.kind === 'melancia') {
      pr.t += dt;
      const u = Math.min(1, pr.t / pr.dur);
      pr.x = pr.sx + (pr.tx - pr.sx) * u;
      const groundY = rowY(pr.r) + 10;
      const startY = pr.by;
      pr.y = startY + (groundY - startY) * u - Math.sin(Math.PI * u) * 120;
      pr.vy = ((groundY - startY) - Math.PI * Math.cos(Math.PI * u) * 120) / pr.dur;
      pr.rot += dt * 7;
      if (u >= 1) {
        this.projs.splice(this.projs.indexOf(pr), 1);
        this.emit({ k: 'splat', x: pr.x, y: groundY, c: '#ef4444' });
        this.emit({ k: 'snd', s: 'splat' });
        let direct = false;
        const sorted = this.zombies
          .filter((z) => Math.abs(z.r - pr.r) <= 1 && Math.abs(z.x - pr.x) < CELL_W * 0.9)
          .sort((a, b) => Math.abs(a.x - pr.x) - Math.abs(b.x - pr.x));
        for (const z of sorted) {
          if (!direct && z.r === pr.r && Math.abs(z.x - pr.x) < 46) {
            direct = true;
            this.damageZ(z, 80, 'normal', true);
          } else {
            this.damageZ(z, 35, 'normal', true);
          }
        }
      }
      return;
    }
    pr.x += pr.vx * dt;
    pr.rot += dt * 9;
    if (pr.x > W + 40) {
      this.projs.splice(this.projs.indexOf(pr), 1);
      return;
    }
    let hit: Zombie | null = null;
    for (const z of this.zombies) {
      if (!this.zRowMatch(z, pr.r)) continue;
      if (pr.x < z.x - 26 || pr.x > z.x + 22) continue;
      if (z.x > LAWN_END + 80) continue;
      if (!hit || z.x < hit.x) hit = z;
    }
    if (hit) {
      this.projs.splice(this.projs.indexOf(pr), 1);
      const shield = hit.type === 'porta' && hit.armor > 0;
      this.damageZ(hit, 20, 'normal');
      if (pr.kind === 'gelado') {
        hit.slow = 3.5;
        this.emit({ k: 'freeze', x: pr.x, y: pr.y });
      }
      this.emit({ k: 'splat', x: pr.x, y: pr.y, c: pr.kind === 'gelado' ? '#7dd3fc' : '#a16207' });
      if (shield) this.emit({ k: 'snd', s: 'clang' });
    }
  }

  private speedOf(z: Zombie): number {
    let s = ZOMBIES[z.type].speed;
    if (z.type === 'vara') s = z.jumped ? 17 : 38;
    if (z.type === 'jornal' && z.enraged) s = 40;
    if (z.slow > 0) s *= 0.5;
    return s * z.aura;
  }

  private updateZombie(z: Zombie, dt: number): void {
    z.flash = Math.max(0, z.flash - dt);
    z.slow = Math.max(0, z.slow - dt);
    const def = ZOMBIES[z.type];

    if (z.type === 'chefe') this.updateBoss(z, dt);

    // pulo de vara
    if (z.jumpT > 0) {
      z.jumpT -= dt;
      z.x += z.vx * dt;
      if (z.jumpT <= 0) {
        z.jumpT = 0;
        z.jumped = true;
        this.emit({ k: 'thud', x: z.x, y: rowY(z.r) + 30 });
      }
      return;
    }

    // procura planta para comer
    let target: Plant | null = null;
    const rows = z.big ? [z.r - 1, z.r, z.r + 1] : [z.r];
    const reach = z.big ? 80 : 44;
    for (const rr of rows) {
      const c = colOf(z.x - (z.big ? 60 : 30));
      for (const cc of [c, c + 1]) {
        const pl = this.plantAt(rr, cc);
        if (pl && z.x - pl.x < reach && z.x - pl.x > -20) {
          if (!target || pl.x > target.x) target = pl;
        }
      }
    }

    if (z.type === 'vara' && !z.jumped && z.jumpT <= 0) {
      const pl = this.plantAt(z.r, colOf(z.x - 30));
      const pl2 = this.plantAt(z.r, colOf(z.x - 30) + 1);
      const cand = [pl, pl2].find((q) => q && z.x - q.x < 72 && z.x - q.x > 0);
      if (cand) {
        z.jumpT = JUMP_DUR;
        z.jumpFrom = z.x;
        z.jumpTo = cand.x - 52;
        z.vx = (z.jumpTo - z.jumpFrom) / JUMP_DUR;
        z.eat = false;
        this.emit({ k: 'jump', id: z.id, x: z.x, y: rowY(z.r) + 30 });
        return;
      }
    }

    if (target) {
      z.eat = true;
      z.vx = 0;
      z.biteT += dt;
      const dmg = def.dps * dt * (z.enraged ? 1 : 1);
      target.hp -= dmg;
      target.flash = Math.max(target.flash, 0.05);
      if (z.biteT > 0.55) {
        z.biteT = 0;
        this.emit({ k: 'bite', x: target.x + 10, y: target.y - 30 });
        if (target.type === 'cacto') this.damageZ(z, 9, 'normal'); // espinhos
      }
      if (target.hp <= 0) {
        this.emit({ k: 'pdie', x: target.x, y: target.y, p: target.type, id: target.id });
        this.removePlant(target, false);
        z.eat = false;
      }
    } else {
      z.eat = false;
      const sp = this.speedOf(z);
      z.vx = -sp;
      z.x -= sp * dt;
    }

    // mower & fim de jogo
    if (z.x < LAWN_X - 16) {
      const m = this.mowers.find((q) => q.r === z.r || (z.big && Math.abs(q.r - z.r) <= 1));
      if (m && m.st === 0) {
        m.st = 1;
        this.emit({ k: 'mower', r: m.r, x: m.x });
        this.emit({ k: 'mood', s: 'panic' });
      }
    }
    if (z.x < (z.big ? 70 : 26)) {
      this.finish('zombies');
    }
  }

  private updateBoss(z: Zombie, dt: number): void {
    const enraged = z.hp < z.maxHp * 0.5;
    if (enraged && !z.enraged) {
      z.enraged = true;
      this.emit({ k: 'roar', x: z.x, y: rowY(z.r) });
      this.say(z.x, rowY(z.r) - 90, 'AAAARGH!', '#ef4444');
    }
    z.t1 -= dt;
    z.t2 -= dt;
    if (z.t1 <= 0) {
      z.t1 = enraged ? 5 : 8;
      const c = colOf(z.x - 70);
      this.emit({ k: 'stomp', x: z.x - 70, y: rowY(z.r) + 30 });
      for (const p of this.plants.slice()) {
        if (Math.abs(p.r - z.r) <= 1 && (p.c === c || p.c === c - 1)) {
          this.emit({ k: 'pdie', x: p.x, y: p.y, p: p.type, id: p.id });
          this.removePlant(p, false);
        }
      }
    }
    if (z.t2 <= 0) {
      z.t2 = enraged ? 8 : 12;
      const lanes = this.level.lanes;
      this.say(z.x, rowY(z.r) - 100, 'VEM, FAMÍLIA!', '#facc15');
      for (let i = 0; i < 3; i++) {
        const r = lanes[Math.floor(rnd() * lanes.length)];
        this.pending.push({ t: this.time + 0.4 + i * 0.6, type: rnd() < 0.5 ? 'basico' : 'cone', r, owner: 0 });
      }
    }
  }

  private updateMowers(dt: number): void {
    for (const m of this.mowers) {
      if (m.st !== 1) continue;
      m.x += 400 * dt;
      for (const z of this.zombies.slice()) {
        if (z.r !== m.r && !(z.big && Math.abs(z.r - m.r) <= 1)) continue;
        if (Math.abs(z.x - m.x) < 44) {
          this.damageZ(z, z.type === 'chefe' ? 600 : 99999, 'mower');
        }
      }
      if (m.x > W + 60) {
        m.st = 2;
        this.mowersUsed++;
      }
    }
    this.mowers = this.mowers.filter((m) => m.st !== 2);
  }

  private updateDrops(dt: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.y < d.ty) {
        if (d.kind === 1) d.vy += 380 * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        if (d.y >= d.ty) {
          d.y = d.ty;
          d.vy = 0;
          d.vx = 0;
          d.age = 0;
        }
      } else if (d.age > 9.5) {
        this.drops.splice(i, 1);
      }
    }
  }

  // ---------- dano ----------
  damageZ(z: Zombie, amount: number, how = 'normal', bypassShield = false): void {
    if (z.hp <= 0) return;
    const hadArmor = z.armor > 0;
    let a = amount;
    if (z.armor > 0 && !(bypassShield && z.type === 'porta')) {
      const take = Math.min(z.armor, a);
      z.armor -= take;
      a -= take;
    }
    z.hp -= a;
    this.emit({ k: 'hit', id: z.id, x: z.x, y: rowY(z.r) + 4, z: z.type, n: z.armor > 0 ? 1 : 0 });
    if (hadArmor && z.armor <= 0) {
      this.emit({ k: 'armor', id: z.id, x: z.x, y: rowY(z.r) - 20, z: z.type });
      if (z.type === 'jornal') {
        z.enraged = true;
        this.say(z.x, rowY(z.r) - 70, 'RASGOU O JORNAL!', '#f87171');
      }
    }
    if (!z.armLost && z.hp <= z.maxHp * 0.5 && z.hp > 0 && z.type !== 'chefe') {
      z.armLost = true;
      this.emit({ k: 'arm', id: z.id, x: z.x, y: rowY(z.r) - 20, z: z.type });
    }
    if (z.hp <= 0) this.killZ(z, how);
  }

  private killZ(z: Zombie, how: string): void {
    const i = this.zombies.indexOf(z);
    if (i < 0) return;
    this.zombies.splice(i, 1);
    this.kills++;
    this.emit({ k: 'zdie', id: z.id, x: z.x, y: rowY(z.r), z: z.type, how, n: zJy(z), f: z.armor > 0 });
    if (rnd() < 0.35) {
      this.say(z.x, rowY(z.r) - 60, QUIPS_KILL[Math.floor(rnd() * QUIPS_KILL.length)], '#fef08a');
    }
    if (z.type === 'chefe') {
      this.emit({ k: 'shake', n: 22 });
      this.say(z.x, rowY(z.r) - 110, 'O GORILÃO CAIU!', '#facc15');
    }
    this.emit({ k: 'mood', s: 'cheer' });
    if (this.mode === 'versus') {
      // plantas ganham bananinhas por abate
      this.bank += 5;
    }
  }

  explode(x: number, y: number, r: number, rad: number, rowsAround: number, dmg: number, kind: string): void {
    this.emit({ k: 'boom', x, y, n: rad, s: kind });
    for (const z of this.zombies.slice()) {
      const rowOk = z.big ? Math.abs(z.r - r) <= 1 + rowsAround : Math.abs(z.r - r) <= rowsAround;
      if (!rowOk) continue;
      if (Math.abs(z.x - x) < rad + (z.big ? 40 : 0)) {
        this.damageZ(z, z.big ? Math.min(dmg, 700) : dmg, kind === 'jaca' ? 'crush' : 'burn');
      }
    }
  }

  removePlant(p: Plant, silent = true): void {
    const i = this.plants.indexOf(p);
    if (i >= 0) this.plants.splice(i, 1);
    if (this.grid[this.idx(p.r, p.c)] === p) this.grid[this.idx(p.r, p.c)] = null;
    if (!silent) this.emit({ k: 'gone', id: p.id });
  }

  // ---------- fim ----------
  finish(winner: 'plants' | 'zombies'): void {
    if (this.state !== 'playing') return;
    this.winner = winner;
    this.state = winner === 'plants' ? 'won' : 'lost';
    this.emit({ k: winner === 'plants' ? 'win' : 'lose' });
  }

  private checkEnd(): void {
    const lvl = this.level;
    if (this.state !== 'playing') return;
    if (lvl.mode === 'versus') {
      if (this.time >= VERSUS_TIME) this.finish('plants');
      return;
    }
    if (lvl.mode === 'survival') return;
    if (this.finalLaunched && this.pending.length === 0 && this.zombies.length === 0) this.finish('plants');
  }

  /** Progresso 0..1 das ondas (ou do tempo no versus) */
  progress(): number {
    if (this.level.mode === 'versus') return Math.min(1, this.time / VERSUS_TIME);
    if (this.level.mode === 'survival') return 0;
    const total = this.level.waves;
    return Math.min(1, this.wave / total);
  }

  score(): number {
    const lvl = this.level;
    if (lvl.mode === 'survival') return this.wave * 150 + this.kills * 10;
    let s = this.kills * 10 + Math.floor(this.bank);
    if (this.state === 'won') s += 500 + this.mowers.filter((m) => m.st === 0).length * 100;
    return s;
  }

  // ---------- espelho (convidado) ----------
  private stepMirror(dt: number): void {
    this.time += dt;
    for (const z of this.zombies) {
      z.flash = Math.max(0, z.flash - dt);
      z.slow = Math.max(0, z.slow - dt);
      if (z.jumpT > 0) z.jumpT = Math.max(0, z.jumpT - dt);
      z.x += z.vx * dt;
    }
    for (const p of this.plants) {
      p.age += dt;
      p.flash = Math.max(0, p.flash - dt);
      p.fireT = Math.max(0, p.fireT - dt);
      p.hugT = Math.max(0, p.hugT - dt);
      if (p.type === 'jaca' && p.st === 1) p.actT = Math.max(0, p.actT - dt);
    }
    for (const pr of this.projs) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.rot += dt * 8;
    }
    for (const m of this.mowers) if (m.st === 1) m.x += 400 * dt;
    for (const d of this.drops) {
      d.age += dt;
      if (d.y < d.ty) {
        if (d.kind === 1) d.vy += 380 * dt;
        d.y = Math.min(d.ty, d.y + d.vy * dt);
        d.x += d.vx * dt;
      }
    }
    this.wt -= dt;
  }

  /** Estado compacto para o convidado */
  pack(): unknown {
    return {
      t: Math.round(this.time * 100) / 100,
      s: this.state === 'playing' ? 0 : this.state === 'won' ? 1 : 2,
      wn: this.winner === 'plants' ? 0 : 1,
      b: Math.floor(this.bank),
      br: Math.floor(this.brains),
      w: this.wave,
      wt: Math.round(this.wt * 10) / 10,
      k: this.kills,
      pc: this.pcd.map((a) => a.map((v) => Math.round(v * 10) / 10)),
      zc: this.zcd.map((v) => Math.round(v * 10) / 10),
      bl: this.belt.map((a) => a.map((t) => PLANT_ORDER.indexOf(t))),
      pl: this.plants.map((p) => [p.id, PLANT_ORDER.indexOf(p.type), p.r, p.c, Math.round(p.hp), p.st, p.owner, Math.round(p.actT * 100) / 100, p.target]),
      zb: this.zombies.map((z) => [
        z.id,
        ZOMBIE_ORDER.indexOf(z.type),
        z.r,
        Math.round(z.x * 10) / 10,
        Math.round(z.hp),
        Math.round(z.armor),
        Math.round(z.slow * 10) / 10,
        (z.eat ? 1 : 0) | (z.armLost ? 2 : 0) | (z.enraged ? 4 : 0) | (z.jumped ? 8 : 0),
        Math.round(z.jumpT * 100) / 100,
        Math.round(z.vx * 10) / 10,
        z.owner,
        z.jumpFrom,
        z.jumpTo,
      ]),
      pj: this.projs.map((p) => [p.id, p.kind === 'coco' ? 0 : p.kind === 'gelado' ? 1 : 2, p.r, Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy)]),
      dr: this.drops.map((d) => [d.id, d.kind, Math.round(d.x), Math.round(d.y), d.value, Math.round(d.ty), Math.round(d.vy), Math.round(d.vx), Math.round(d.age * 10) / 10]),
      mw: this.mowers.map((m) => [m.r, Math.round(m.x), m.st]),
    };
  }

  unpack(raw: unknown): void {
    const s = raw as {
      t: number;
      s: number;
      wn: number;
      b: number;
      br: number;
      w: number;
      wt: number;
      k: number;
      pc: number[][];
      zc: number[];
      bl: number[][];
      pl: number[][];
      zb: number[][];
      pj: number[][];
      dr: number[][];
      mw: number[][];
    };
    this.state = s.s === 0 ? 'playing' : s.s === 1 ? 'won' : 'lost';
    this.winner = s.wn === 0 ? 'plants' : 'zombies';
    this.bank = s.b;
    this.brains = s.br;
    this.wave = s.w;
    this.wt = s.wt;
    this.kills = s.k;
    this.pcd = s.pc;
    this.zcd = s.zc;
    this.belt = s.bl.map((a) => a.map((i) => PLANT_ORDER[i]));
    this.time = s.t;

    // plantas
    const oldP = new Map(this.plants.map((p) => [p.id, p]));
    this.plants = [];
    this.grid.fill(null);
    for (const a of s.pl) {
      const type = PLANT_ORDER[a[1]];
      const prev = oldP.get(a[0]);
      const p: Plant = prev ?? {
        id: a[0],
        type,
        r: a[2],
        c: a[3],
        x: colX(a[3]),
        y: rowY(a[2]) + 30,
        hp: a[4],
        maxHp: PLANTS[type].hp,
        age: 0,
        cd: 0,
        st: a[5],
        owner: a[6],
        flash: 0,
        fireT: 0,
        hugT: 0,
        actT: 0,
        target: 0,
      };
      p.hp = a[4];
      p.st = a[5];
      p.owner = a[6];
      if (!prev || p.type !== 'jaca') p.actT = a[7];
      else if (Math.abs(p.actT - a[7]) > 0.15) p.actT = a[7];
      p.target = a[8];
      this.plants.push(p);
      this.grid[this.idx(p.r, p.c)] = p;
    }

    // zumbis
    const oldZ = new Map(this.zombies.map((z) => [z.id, z]));
    this.zombies = [];
    for (const a of s.zb) {
      const type = ZOMBIE_ORDER[a[1]];
      const def = ZOMBIES[type];
      const prev = oldZ.get(a[0]);
      const z: Zombie =
        prev ??
        ({
          id: a[0],
          type,
          r: a[2],
          x: a[3],
          hp: a[4],
          maxHp: def.hp,
          armor: a[5],
          maxArmor: def.armor,
          slow: 0,
          eat: false,
          biteT: 0,
          flash: 0,
          armLost: false,
          jumpT: 0,
          jumpFrom: 0,
          jumpTo: 0,
          jumped: false,
          enraged: false,
          owner: a[10],
          phase: phaseOf(a[0]),
          aura: 1,
          vx: a[9],
          t1: 0,
          t2: 0,
          big: type === 'chefe',
        } as Zombie);
      z.x = prev ? prev.x + (a[3] - prev.x) * 0.6 : a[3];
      z.hp = a[4];
      z.armor = a[5];
      z.slow = a[6];
      z.eat = (a[7] & 1) !== 0;
      z.armLost = (a[7] & 2) !== 0;
      z.enraged = (a[7] & 4) !== 0;
      z.jumped = (a[7] & 8) !== 0;
      z.jumpT = a[8];
      z.vx = a[9];
      z.owner = a[10];
      z.jumpFrom = a[11];
      z.jumpTo = a[12];
      this.zombies.push(z);
    }

    this.projs = s.pj.map((a) => ({
      id: a[0],
      kind: a[1] === 0 ? 'coco' : a[1] === 1 ? 'gelado' : 'melancia',
      r: a[2],
      x: a[3],
      y: a[4],
      vx: a[5],
      vy: a[6],
      sx: 0,
      tx: 0,
      by: 0,
      t: 0,
      dur: 0,
      rot: a[0],
    }));
    this.drops = s.dr.map((a) => ({
      id: a[0],
      kind: a[1],
      x: a[2],
      y: a[3],
      value: a[4],
      ty: a[5],
      vy: a[6],
      vx: a[7],
      age: a[8],
    }));
    this.mowers = s.mw.map((a) => ({ r: a[0], x: a[1], st: a[2] }));
  }
}
