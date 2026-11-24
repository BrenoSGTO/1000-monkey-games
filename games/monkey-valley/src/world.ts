import type { AnimalState, Dyn, FriendState, ItemStack, ObjKind, OpResult, Season, ToolId, Weather, WorldSave, Fx } from './types';
import { BUILDINGS, DAYS_PER_SEASON, FARM, MH, MW, PEN, SHIPBOX, TROUGH, T, doorOf } from './layout';
import { ANIMAL_PRICES, CROPS, ITEMS, NPC_BY_ID, animalProduct } from './data';
import { hash2, mulberry32, TILE } from './util';

export type StaticKind = 'fence' | 'lamp' | 'bench' | 'well' | 'sign' | 'flowerbed' | 'palm' | 'stree' | 'bush' | 'shipbox' | 'trough' | 'boat';
export interface StaticObj {
  kind: StaticKind;
  v: number;
}

export const MIN_REAL = 0.5; // segundos reais por minuto de jogo
export const DAY_END = 1560; // 02:00
export const PEN_PX = { x0: 21 * TILE, y0: 14 * TILE + 10, x1: 27 * TILE - 10, y1: 19 * TILE - 8 };

const ANIMAL_NAMES = ['Dona Pipoca', 'Bolinha', 'Sr. Cacareco', 'Fofinha', 'Zé Pena', 'Maria Bico', 'Penugem', 'Beiçola', 'Tião', 'Cabrita Loka'];

export const keyOf = (x: number, y: number): number => y * MW + x;

export class World {
  terrain = new Uint8Array(MW * MH);
  deco = new Uint8Array(MW * MH);
  solid = new Uint8Array(MW * MH);
  statics = new Map<number, StaticObj>();
  dyn = new Map<number, Dyn>();
  dirty = new Set<number>();

  seed = 1;
  day = 1;
  season: Season = 0;
  year = 1;
  minutes = 360;
  weather: Weather = 'sol';
  money = 500;
  totalEarned = 0;
  ship = 0;
  hay = 0;
  animals: AnimalState[] = [];
  friends: Record<string, FriendState> = {};
  stats: Record<string, number> = {};
  quest = 0;

  constructor(seed = 1) {
    this.seed = seed;
    this.genMap();
    this.genFarmObjects();
  }

  // ------------------------------------------------------------ mapa
  private set(x: number, y: number, t: number): void {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return;
    this.terrain[keyOf(x, y)] = t;
  }
  private rect(x0: number, y0: number, x1: number, y1: number, t: number, onlyOn?: number[]): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        if (onlyOn && !onlyOn.includes(this.terrain[keyOf(x, y)])) continue;
        this.terrain[keyOf(x, y)] = t;
      }
    }
  }

  private genMap(): void {
    const tr = this.terrain;
    tr.fill(T.GRASS);
    // penhascos
    this.rect(0, 0, MW - 1, 5, T.ROCK);
    this.rect(0, 0, 1, 39, T.ROCK);
    this.rect(62, 0, 63, 39, T.ROCK);
    // praia e mar
    for (let x = 0; x < MW; x++) {
      const sandStart = 39 + Math.round(hash2(x, 1, 2) * 1.6 + Math.sin(x / 5) * 1.2);
      const waterStart = 45 + Math.round(Math.sin(x / 4) * 1);
      for (let y = sandStart; y < MH; y++) {
        if (y < waterStart) this.set(x, y, T.SAND);
        else if (y < 47) this.set(x, y, T.WATER);
        else this.set(x, y, T.DEEP);
      }
    }
    // rio e lago
    this.rect(30, 6, 31, 37, T.WATER);
    for (let y = 34; y <= 41; y++) {
      for (let x = 26; x <= 35; x++) {
        const dx = (x - 30.5) / 3.6;
        const dy = (y - 38) / 3;
        if (dx * dx + dy * dy <= 1) this.set(x, y, T.WATER);
      }
    }
    // lagoa da fazenda
    for (let y = 26; y <= 36; y++) {
      for (let x = 16; x <= 28; x++) {
        const dx = (x - 21.5) / 4.6;
        const dy = (y - 31) / 3.2;
        if (dx * dx + dy * dy <= 1) this.set(x, y, T.WATER);
      }
    }
    // caminhos
    const dirt = [T.GRASS];
    this.rect(7, 14, 8, 19, T.DIRT, dirt);
    this.rect(7, 20, 61, 21, T.DIRT, dirt);
    this.rect(37, 12, 38, 19, T.DIRT, dirt);
    this.rect(46, 12, 47, 19, T.DIRT, dirt);
    this.rect(42, 18, 43, 19, T.DIRT, dirt);
    this.rect(52, 18, 53, 19, T.DIRT, dirt);
    this.rect(36, 22, 37, 26, T.DIRT, dirt);
    this.rect(58, 6, 59, 19, T.DIRT, dirt);
    this.rect(44, 22, 45, 40, T.DIRT, dirt);
    this.rect(42, 44, 45, 44, T.DIRT, dirt);
    this.rect(10, 14, 12, 14, T.DIRT, dirt);
    // ponte e cais
    this.rect(30, 20, 31, 21, T.BRIDGE);
    this.rect(36, 44, 37, 49, T.PLANK);

    // decoração de grama
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const h = hash2(x, y, 7);
        this.deco[keyOf(x, y)] = h > 0.93 ? 10 + Math.floor(hash2(x, y, 9) * 4) : Math.floor(hash2(x, y, 3) * 6);
      }
    }

    // sólidos de terreno
    for (let i = 0; i < MW * MH; i++) {
      const t = tr[i];
      this.solid[i] = t === T.WATER || t === T.DEEP || t === T.ROCK ? 1 : 0;
    }
    // prédios
    for (const b of BUILDINGS) {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.solid[keyOf(x, y)] = 1;
      const [dx, dy] = doorOf(b.id);
      this.solid[keyOf(dx, dy)] = 0;
    }
    this.genStatics();
  }

  private addStatic(x: number, y: number, kind: StaticKind, v = 0): void {
    this.statics.set(keyOf(x, y), { kind, v });
    this.solid[keyOf(x, y)] = 1;
  }

  private nearBuilding(x: number, y: number, m: number): boolean {
    for (const b of BUILDINGS) {
      if (x >= b.x - m && x < b.x + b.w + m && y >= b.y - m && y < b.y + b.h + m + 1) return true;
    }
    return false;
  }

  private nearPath(x: number, y: number, m: number): boolean {
    for (let dy = -m; dy <= m; dy++) {
      for (let dx = -m; dx <= m; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
        const t = this.terrain[keyOf(xx, yy)];
        if (t === T.DIRT || t === T.BRIDGE || t === T.PLANK) return true;
      }
    }
    return false;
  }

  private genStatics(): void {
    // cerca do cercado
    for (let y = PEN.y0; y <= PEN.y1; y++) {
      this.addStatic(PEN.x0, y, 'fence');
      this.addStatic(PEN.x1, y, 'fence');
    }
    for (let x = PEN.x0; x <= PEN.x1; x++) {
      if (x !== 23 && x !== 24) this.addStatic(x, PEN.y1, 'fence');
      if (x < 22 || x > 25) this.addStatic(x, PEN.y0, 'fence');
    }
    this.addStatic(SHIPBOX[0], SHIPBOX[1], 'shipbox');
    this.addStatic(TROUGH[0], TROUGH[1], 'trough');
    this.addStatic(9, 16, 'sign');
    for (const x of [34, 40, 48, 56, 12]) this.addStatic(x, 19, 'lamp');
    this.addStatic(44, 22, 'bench');
    this.addStatic(49, 22, 'bench');
    this.addStatic(47, 24, 'well');
    [[35, 12, 0], [39, 12, 1], [44, 12, 2], [48, 12, 0], [50, 18, 1], [54, 18, 2], [41, 19, 0]].forEach(([x, y, v]) => this.addStatic(x, y, 'flowerbed', v));
    this.addStatic(28, 43, 'boat');
    // palmeiras
    for (let y = 40; y <= 44; y++) {
      for (let x = 2; x < 62; x++) {
        if (this.terrain[keyOf(x, y)] !== T.SAND || this.solid[keyOf(x, y)]) continue;
        if (hash2(x, y, 21) > 0.955 && !this.nearBuilding(x, y, 2) && !this.nearPath(x, y, 1)) this.addStatic(x, y, 'palm');
      }
    }
    // árvores decorativas (vila, mata ao norte)
    for (let y = 6; y < 38; y++) {
      for (let x = 2; x < 62; x++) {
        const k = keyOf(x, y);
        if (this.terrain[k] !== T.GRASS || this.solid[k] || this.statics.has(k)) continue;
        const inFarm = x >= FARM.x0 && x <= FARM.x1 && y >= FARM.y0 && y <= FARM.y1;
        if (inFarm) continue;
        if (this.nearBuilding(x, y, 1) || this.nearPath(x, y, 1)) continue;
        if (x >= PEN.x0 - 1 && x <= PEN.x1 + 1 && y >= PEN.y0 - 4 && y <= PEN.y1 + 1) continue;
        const north = y <= 9 && x < 30;
        const h = hash2(x, y, 33);
        if (north ? h > 0.7 : x > 32 && h > 0.92) this.addStatic(x, y, h > 0.97 ? 'bush' : 'stree', Math.floor(hash2(x, y, 4) * 2));
        else if (h > 0.9 && h <= 0.915) this.addStatic(x, y, 'bush', Math.floor(hash2(x, y, 6) * 2));
      }
    }
    // bordas de árvore ao redor da fazenda (oeste)
    for (let y = 10; y <= 38; y += 2) this.addStatic(2, y, 'stree', y % 3 === 0 ? 1 : 0);
  }

  inFarm(x: number, y: number): boolean {
    return x >= FARM.x0 && x <= FARM.x1 && y >= FARM.y0 && y <= FARM.y1;
  }

  tillable(x: number, y: number): boolean {
    const k = keyOf(x, y);
    return this.inFarm(x, y) && this.terrain[k] === T.GRASS && !this.solid[k] && !this.statics.has(k) && !(x >= PEN.x0 && x <= PEN.x1 && y >= PEN.y0 && y <= PEN.y1) && !(x >= 5 && x <= 9 && y <= 14);
  }

  private genFarmObjects(): void {
    const r = mulberry32(this.seed * 7919 + 13);
    for (let y = FARM.y0; y <= FARM.y1; y++) {
      for (let x = FARM.x0; x <= FARM.x1; x++) {
        if (!this.tillable(x, y)) continue;
        if (x >= 8 && x <= 17 && y >= 15 && y <= 23) continue; // canteiro inicial limpo
        if (this.nearPath(x, y, 0)) continue;
        const k = keyOf(x, y);
        // evita beira d'água
        const v = r();
        if (v < 0.045) this.dyn.set(k, { o: 'tree', hp: 10, v: Math.floor(r() * 2) });
        else if (v < 0.085) this.dyn.set(k, { o: 'rock', hp: 3, v: Math.floor(r() * 2) });
        else if (v < 0.095) this.dyn.set(k, { o: 'boulder', hp: 10 });
        else if (v < 0.2) this.dyn.set(k, { o: 'weed', v: Math.floor(r() * 6) });
        else if (v < 0.225) this.dyn.set(k, { o: 'twig', v: Math.floor(r() * 2) });
      }
    }
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    const k = keyOf(x, y);
    if (this.solid[k]) return true;
    const d = this.dyn.get(k);
    return !!d && !!d.o && d.o !== 'weed' && d.o !== 'twig';
  }

  isWaterTile(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
    const t = this.terrain[keyOf(x, y)];
    return t === T.WATER || t === T.DEEP;
  }

  // ------------------------------------------------------------ dyn
  getD(key: number): Dyn | undefined {
    return this.dyn.get(key);
  }
  setD(key: number, d: Dyn | null): void {
    if (d && Object.keys(d).length > 0) this.dyn.set(key, d);
    else this.dyn.delete(key);
    this.dirty.add(key);
  }
  takeDirty(): [number, Dyn | null][] {
    const out: [number, Dyn | null][] = [];
    for (const k of this.dirty) out.push([k, this.dyn.get(k) ?? null]);
    this.dirty.clear();
    return out;
  }
  applyTiles(ch: [number, Dyn | null][]): void {
    for (const [k, d] of ch) {
      if (d) this.dyn.set(k, d);
      else this.dyn.delete(k);
    }
  }

  isRipe(d: Dyn | undefined): boolean {
    if (!d?.c) return false;
    const cd = CROPS[d.c.k];
    return !!cd && d.c.d >= cd.days;
  }

  cropStage(d: Dyn): number {
    const cd = CROPS[d.c!.k];
    if (d.c!.d >= cd.days) return 4;
    return Math.min(3, Math.floor((d.c!.d / cd.days) * 4));
  }

  // ------------------------------------------------------------ operações autoritativas
  apply(op: string, a: any): OpResult {
    switch (op) {
      case 'tool':
        return this.opTool(a);
      case 'plant':
        return this.opPlant(a);
      case 'harvest':
        return this.opHarvest(a.key);
      case 'ship':
        this.ship += Math.max(0, Math.floor(a.value));
        return { ok: true };
      case 'spend':
        if (this.money >= a.amount) {
          this.money -= a.amount;
          return { ok: true };
        }
        return { ok: false, msg: 'Bananas insuficientes! 🍌' };
      case 'earn':
        this.money += Math.max(0, Math.floor(a.amount));
        this.totalEarned += Math.max(0, Math.floor(a.amount));
        return { ok: true };
      case 'buy': {
        if (this.money < a.cost) return { ok: false, msg: 'Bananas insuficientes! 🍌' };
        this.money -= a.cost;
        return { ok: true, grant: [{ id: a.id, n: a.n }] };
      }
      case 'hay':
        this.hay = Math.min(60, this.hay + a.n);
        return { ok: true, data: { hay: this.hay } };
      case 'buyAnimal':
        return this.opBuyAnimal(a.kind);
      case 'animal':
        return this.opAnimal(a.id);
      case 'talk':
        return this.opTalk(a.npc);
      case 'gift':
        return this.opGift(a.npc, a.item);
      default:
        return { ok: false, msg: '???' };
    }
  }

  private grantFx(r: OpResult, fx: Fx): void {
    (r.fx ??= []).push(fx);
  }

  private opTool(a: { tool: ToolId; tier: number; cells: number[] }): OpResult {
    const r: OpResult = { ok: false, grant: [], fx: [], n: 0 };
    const power = [1, 2, 3, 4][Math.max(0, Math.min(3, a.tier))];
    const rng = Math.random;
    for (const key of a.cells) {
      const x = key % MW;
      const y = Math.floor(key / MW);
      if (!this.inFarm(x, y)) continue;
      const d = this.dyn.get(key);
      switch (a.tool) {
        case 'hoe': {
          if (d?.o) {
            if (d.o === 'weed' || d.o === 'twig') this.clearObj(key, d, r, rng);
            else r.msg = 'Algo está no caminho da enxada!';
          } else if (this.tillable(x, y) && !d?.t) {
            this.setD(key, { ...(d ?? {}), t: 1 });
            this.grantFx(r, { k: 'dust', x, y });
            r.n!++;
          }
          break;
        }
        case 'can': {
          if (d?.t && !d.w) {
            this.setD(key, { ...d, w: 1 });
            this.grantFx(r, { k: 'water', x, y });
            r.n!++;
          }
          break;
        }
        case 'sickle': {
          if (d?.o === 'weed' || d?.o === 'twig') this.clearObj(key, d, r, rng);
          else if (d?.c && !this.isRipe(d)) r.msg = 'Ainda não está madura!';
          break;
        }
        case 'axe': {
          if (!d?.o) break;
          if (d.o === 'weed' || d.o === 'twig') this.clearObj(key, d, r, rng);
          else if (d.o === 'tree') this.hitObj(key, d, power, r, 'tree');
          else if (d.o === 'stump') this.hitObj(key, d, power, r, 'stump');
          else r.msg = 'Isso pede a Picareta!';
          break;
        }
        case 'pick': {
          if (d?.o) {
            if (d.o === 'rock') this.hitObj(key, d, power, r, 'rock');
            else if (d.o === 'boulder') {
              if (a.tier < 1) r.msg = 'Pesada demais! Melhore a Picareta com Seu Mico.';
              else this.hitObj(key, d, power, r, 'boulder');
            } else if (d.o === 'weed' || d.o === 'twig') this.clearObj(key, d, r, rng);
            else r.msg = 'Isso pede o Machado!';
          } else if (d?.t && !d.c) {
            this.setD(key, null);
            this.grantFx(r, { k: 'dust', x, y });
            r.n!++;
          }
          break;
        }
        default:
          break;
      }
    }
    r.ok = (r.n ?? 0) > 0;
    return r;
  }

  private clearObj(key: number, d: Dyn, r: OpResult, rng: () => number): void {
    const x = key % MW;
    const y = Math.floor(key / MW);
    const { o: _o, hp: _hp, v: _v, ...rest } = d;
    this.setD(key, rest);
    if (d.o === 'weed') {
      if (rng() < 0.6) r.grant!.push({ id: 'fibra', n: 1 });
      if (rng() < 0.4) r.grant!.push({ id: 'capim', n: 1 });
      this.grantFx(r, { k: 'leaf', x, y });
    } else {
      r.grant!.push({ id: 'madeira', n: 1 });
      this.grantFx(r, { k: 'chip', x, y });
    }
    r.n!++;
  }

  private hitObj(key: number, d: Dyn, power: number, r: OpResult, kind: 'tree' | 'stump' | 'rock' | 'boulder'): void {
    const x = key % MW;
    const y = Math.floor(key / MW);
    const hp = (d.hp ?? { tree: 10, stump: 4, rock: 3, boulder: 10 }[kind]) - power;
    r.n!++;
    this.grantFx(r, { k: kind === 'tree' || kind === 'stump' ? 'leaf' : 'chip', x, y });
    if (hp > 0) {
      this.setD(key, { ...d, hp });
      return;
    }
    if (kind === 'tree') {
      this.setD(key, { o: 'stump', hp: 4, v: d.v });
      r.grant!.push({ id: 'madeira', n: 8 });
    } else if (kind === 'stump') {
      this.setD(key, null);
      r.grant!.push({ id: 'madeira', n: 3 });
    } else if (kind === 'rock') {
      this.setD(key, null);
      r.grant!.push({ id: 'pedra', n: 2 });
      if (Math.random() < 0.12) r.grant!.push({ id: 'carvao', n: 1 });
    } else {
      this.setD(key, null);
      r.grant!.push({ id: 'pedra', n: 8 });
      r.grant!.push({ id: 'cobre', n: 1 + Math.floor(Math.random() * 2) });
    }
    r.data = { broke: true };
  }

  private opPlant(a: { key: number; seed: string }): OpResult {
    const id = a.seed.startsWith('s-') ? a.seed.slice(2) : a.seed;
    const cd = CROPS[id];
    if (!cd) return { ok: false };
    const x = a.key % MW;
    const y = Math.floor(a.key / MW);
    const d = this.dyn.get(a.key);
    if (!d?.t || d.c || d.o) return { ok: false };
    if (!cd.seasons.includes(this.season)) return { ok: false, msg: `${cd.name} não cresce nessa estação!` };
    this.setD(a.key, { ...d, c: { k: id, d: 0 } });
    return { ok: true, fx: [{ k: 'dust', x, y }], n: 1 };
  }

  private opHarvest(key: number): OpResult {
    const d = this.dyn.get(key);
    if (!d?.c || !this.isRipe(d)) return { ok: false };
    const cd = CROPS[d.c.k];
    const x = key % MW;
    const y = Math.floor(key / MW);
    const bonus = Math.random() < 0.12 ? 1 : 0;
    if (cd.regrow) this.setD(key, { ...d, c: { k: d.c.k, d: cd.days - cd.regrow } });
    else {
      const { c: _c, ...rest } = d;
      this.setD(key, rest);
    }
    return { ok: true, grant: [{ id: cd.id, n: 1 + bonus }], fx: [{ k: 'sparkle', x, y }], n: 1 };
  }

  private opBuyAnimal(kind: 'galinha' | 'cabra'): OpResult {
    const price = ANIMAL_PRICES[kind];
    if (this.animals.length >= 8) return { ok: false, msg: 'O cercado está lotado!' };
    if (this.money < price) return { ok: false, msg: 'Bananas insuficientes! 🍌' };
    this.money -= price;
    const name = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
    const x = PEN_PX.x0 + 20 + Math.random() * 40;
    const y = PEN_PX.y0 + 20 + Math.random() * 40;
    this.animals.push({ id: Math.random().toString(36).slice(2, 8), kind, name, x, y, tx: x, ty: y, ready: false, fed: false, dir: 2, hearts: 0 });
    return { ok: true, data: { name } };
  }

  private opAnimal(id: string): OpResult {
    const an = this.animals.find((q) => q.id === id);
    if (!an) return { ok: false };
    if (an.ready) {
      an.ready = false;
      return { ok: true, grant: [{ id: animalProduct(an.kind), n: 1 }], data: { name: an.name, collected: true } };
    }
    an.hearts = Math.min(5, an.hearts + 1);
    return { ok: true, data: { name: an.name, pet: true } };
  }

  friendOf(id: string): FriendState {
    return (this.friends[id] ??= { pts: 0, talked: false, gifted: false, ev: 0 });
  }

  static heartsOf(pts: number): number {
    return Math.max(0, Math.min(10, Math.floor(pts / 250)));
  }

  isBirthday(npc: string): boolean {
    const n = NPC_BY_ID[npc];
    return !!n && n.birthday.s === this.season && n.birthday.d === this.day;
  }

  private checkEvent(f: FriendState): number {
    const h = World.heartsOf(f.pts);
    const th = [2, 5, 8];
    for (let i = th.length - 1; i >= 0; i--) {
      if (h >= th[i] && !(f.ev & (1 << i))) {
        f.ev |= 1 << i;
        return i;
      }
    }
    return -1;
  }

  private opTalk(npc: string): OpResult {
    const f = this.friendOf(npc);
    let first = false;
    if (!f.talked) {
      f.talked = true;
      f.pts = Math.min(2500, f.pts + 20);
      first = true;
    }
    const ev = this.checkEvent(f);
    return { ok: true, data: { first, hearts: World.heartsOf(f.pts), ev } };
  }

  private opGift(npc: string, itemId: string): OpResult {
    const def = NPC_BY_ID[npc];
    const f = this.friendOf(npc);
    if (!def) return { ok: false };
    if (f.gifted) return { ok: false, msg: `${def.name} já ganhou um presente hoje!` };
    f.gifted = true;
    let kind: 'love' | 'like' | 'neutral' | 'hate' = 'neutral';
    let pts = 20;
    if (def.loves.includes(itemId)) {
      kind = 'love';
      pts = 80;
    } else if (def.likes.includes(itemId)) {
      kind = 'like';
      pts = 45;
    } else if (def.hates.includes(itemId)) {
      kind = 'hate';
      pts = -40;
    }
    const bday = this.isBirthday(npc);
    if (bday && pts > 0) pts *= 4;
    f.pts = Math.max(0, Math.min(2500, f.pts + pts));
    const ev = this.checkEvent(f);
    return { ok: true, data: { kind, bday, hearts: World.heartsOf(f.pts), ev, pts } };
  }

  // ------------------------------------------------------------ tempo
  /** Avança o relógio; retorna true quando chega às 02:00. */
  tick(dt: number): boolean {
    this.minutes += dt / MIN_REAL;
    return this.minutes >= DAY_END;
  }

  rollWeather(day: number, season: Season, year: number): Weather {
    const rng = mulberry32(this.seed * 31 + day * 977 + season * 6173 + year * 13);
    if (year === 1 && season === 0 && day <= 2) return 'sol';
    const r = rng();
    if (season === 3) return r < 0.4 ? 'neve' : 'sol';
    if (season === 1) return r < 0.12 ? 'chuva' : r < 0.18 ? 'tempestade' : 'sol';
    if (season === 0) return r < 0.2 ? 'chuva' : r < 0.23 ? 'tempestade' : 'sol';
    return r < 0.25 ? 'chuva' : r < 0.28 ? 'tempestade' : 'sol';
  }

  get raining(): boolean {
    return this.weather === 'chuva' || this.weather === 'tempestade';
  }

  /** Passa para o dia seguinte; retorna um resumo. */
  newDay(): { earned: number; dead: number; season: boolean } {
    const earned = this.ship;
    this.money += earned;
    this.totalEarned += earned;
    this.ship = 0;

    // crescimento (usa a rega de hoje)
    for (const [k, d] of Array.from(this.dyn.entries())) {
      if (!d.c) continue;
      const cd = CROPS[d.c.k];
      if (cd && (d.w || this.raining) && d.c.d < cd.days) {
        d.c.d++;
        this.dirty.add(k);
      }
    }

    this.day++;
    let seasonChanged = false;
    if (this.day > DAYS_PER_SEASON) {
      this.day = 1;
      this.season = ((this.season + 1) % 4) as Season;
      seasonChanged = true;
      if (this.season === 0) this.year++;
    }
    this.minutes = 360;
    this.weather = this.rollWeather(this.day, this.season, this.year);

    let dead = 0;
    for (const [k, d] of Array.from(this.dyn.entries())) {
      let ch = false;
      if (d.c && !CROPS[d.c.k]?.seasons.includes(this.season)) {
        delete d.c;
        dead++;
        ch = true;
      }
      if (d.w) {
        delete d.w;
        ch = true;
      }
      if (this.raining && d.t) {
        d.w = 1;
        ch = true;
      }
      if (ch) {
        if (Object.keys(d).length === 0) this.dyn.delete(k);
        this.dirty.add(k);
      }
    }

    // novos matinhos e pedras
    const rng = mulberry32(this.seed + this.day * 101 + this.season * 997 + this.year * 7);
    const weeds = this.season === 3 ? 0 : this.season === 2 ? 2 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 5);
    const spawn = (kind: ObjKind, n: number, hp?: number): void => {
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 12; tries++) {
          const x = FARM.x0 + Math.floor(rng() * (FARM.x1 - FARM.x0 + 1));
          const y = FARM.y0 + Math.floor(rng() * (FARM.y1 - FARM.y0 + 1));
          if (!this.tillable(x, y) || this.nearPath(x, y, 0)) continue;
          const k = keyOf(x, y);
          if (this.dyn.has(k)) continue;
          this.setD(k, { o: kind, hp, v: Math.floor(rng() * 6) });
          break;
        }
      }
    };
    spawn('weed', weeds);
    spawn('twig', 1 + Math.floor(rng() * 2));
    spawn('rock', Math.floor(rng() * 2), 3);

    // animais
    for (const an of this.animals) {
      if (this.hay > 0) {
        this.hay--;
        an.fed = true;
        an.ready = true;
      } else {
        an.fed = false;
        an.ready = false;
      }
    }

    for (const f of Object.values(this.friends)) {
      f.talked = false;
      f.gifted = false;
    }
    return { earned, dead, season: seasonChanged };
  }

  // ------------------------------------------------------------ animais (host)
  updateAnimals(dt: number): void {
    for (const an of this.animals) {
      const dx = an.tx - an.x;
      const dy = an.ty - an.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        if (Math.random() < dt * 0.35) {
          an.tx = PEN_PX.x0 + Math.random() * (PEN_PX.x1 - PEN_PX.x0);
          an.ty = PEN_PX.y0 + Math.random() * (PEN_PX.y1 - PEN_PX.y0);
        }
      } else {
        const sp = an.kind === 'galinha' ? 14 : 11;
        an.x += (dx / dist) * sp * dt;
        an.y += (dy / dist) * sp * dt;
        if (Math.abs(dx) > 1) an.dir = dx < 0 ? 1 : 2;
      }
    }
  }

  // ------------------------------------------------------------ save
  toSave(): WorldSave {
    return {
      seed: this.seed,
      day: this.day,
      season: this.season,
      year: this.year,
      minutes: this.minutes,
      weather: this.weather,
      money: this.money,
      totalEarned: this.totalEarned,
      ship: this.ship,
      hay: this.hay,
      dyn: Array.from(this.dyn.entries()),
      animals: this.animals.map((a) => ({ ...a })),
      friends: JSON.parse(JSON.stringify(this.friends)),
      stats: { ...this.stats },
      quest: this.quest,
    };
  }

  load(s: WorldSave, keepStats = false): void {
    this.seed = s.seed;
    this.day = s.day;
    this.season = s.season;
    this.year = s.year;
    this.minutes = s.minutes;
    this.weather = s.weather;
    this.money = s.money;
    this.totalEarned = s.totalEarned;
    this.ship = s.ship;
    this.hay = s.hay;
    this.dyn = new Map(s.dyn);
    this.animals = s.animals.map((a) => ({ ...a }));
    this.friends = JSON.parse(JSON.stringify(s.friends ?? {}));
    if (!keepStats) {
      this.stats = { ...(s.stats ?? {}) };
      this.quest = s.quest ?? 0;
    }
  }

  itemName(id: string): string {
    return ITEMS[id]?.name ?? id;
  }
}

export type { ItemStack };
