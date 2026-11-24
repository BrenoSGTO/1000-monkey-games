import { hash2, type PlatPos } from './types';

export interface PlatDef {
  x: number; // centro
  y: number; // topo
  w: number;
  h: number;
  solid: boolean;
  /** Movimento senoidal determinístico (função do tick). */
  mv?: { ax: number; ay: number; per: number; ph: number };
}

export interface PadDef {
  x: number;
  w: number;
  power: number;
}

export interface StageDef {
  id: number;
  name: string;
  tagline: string;
  hazard: 0 | 1 | 2 | 3; // 0 nenhum, 1 gêiseres, 2 elevador, 3 canhões
  hazardText: string;
  plats: PlatDef[];
  pads: PadDef[];
  blast: { l: number; r: number; t: number; b: number };
  spawns: { x: number; y: number }[];
  respawn: { x: number; y: number };
  mainL: number;
  mainR: number;
  theme: 'jungle' | 'volcano' | 'roof' | 'circus';
}

export const STAGES: StageDef[] = [
  {
    id: 0,
    name: 'Bananeira Gigante',
    tagline: 'A briga clássica no galho mais gordo da selva.',
    hazard: 0,
    hazardText: 'Sem perigo — só pancada e cacho de banana.',
    plats: [
      { x: 0, y: 0, w: 780, h: 90, solid: true },
      { x: -255, y: -150, w: 170, h: 14, solid: false },
      { x: 255, y: -150, w: 170, h: 14, solid: false },
      { x: 0, y: -290, w: 190, h: 14, solid: false },
    ],
    pads: [],
    blast: { l: -980, r: 980, t: -780, b: 600 },
    spawns: [{ x: -240, y: 0 }, { x: 240, y: 0 }, { x: -90, y: 0 }, { x: 90, y: 0 }],
    respawn: { x: 0, y: -400 },
    mainL: -390,
    mainR: 390,
    theme: 'jungle',
  },
  {
    id: 1,
    name: 'Vulcão do Abacaxi',
    tagline: 'Lava, abacaxi e gêiseres que explodem de repente!',
    hazard: 1,
    hazardText: 'Gêiseres de lava avisam no chão e depois ERUPTEM!',
    plats: [
      { x: 0, y: 0, w: 700, h: 100, solid: true },
      { x: -235, y: -160, w: 150, h: 14, solid: false },
      { x: 235, y: -160, w: 150, h: 14, solid: false },
    ],
    pads: [],
    blast: { l: -940, r: 940, t: -760, b: 580 },
    spawns: [{ x: -230, y: 0 }, { x: 230, y: 0 }, { x: -80, y: 0 }, { x: 80, y: 0 }],
    respawn: { x: 0, y: -400 },
    mainL: -350,
    mainR: 350,
    theme: 'volcano',
  },
  {
    id: 2,
    name: 'Telhado da Firma',
    tagline: 'Hora do rush no prédio. O elevador não perdoa.',
    hazard: 2,
    hazardText: 'Elevador de carga sobe e desce no meio da arena.',
    plats: [
      { x: 0, y: 0, w: 580, h: 100, solid: true },
      { x: -330, y: -140, w: 140, h: 14, solid: false },
      { x: 330, y: -140, w: 140, h: 14, solid: false },
      { x: 0, y: -200, w: 170, h: 14, solid: false, mv: { ax: 0, ay: 120, per: 640, ph: 0 } },
    ],
    pads: [],
    blast: { l: -980, r: 980, t: -800, b: 580 },
    spawns: [{ x: -200, y: 0 }, { x: 200, y: 0 }, { x: -80, y: 0 }, { x: 80, y: 0 }],
    respawn: { x: 0, y: -430 },
    mainL: -290,
    mainR: 290,
    theme: 'roof',
  },
  {
    id: 3,
    name: 'Circo do Macaco Maluco',
    tagline: 'Trampolim no meio e canhão de circo dos dois lados!',
    hazard: 3,
    hazardText: 'Canhões disparam balas de circo (pisca o "!" antes) e tem trampolim!',
    plats: [
      { x: 0, y: 0, w: 840, h: 90, solid: true },
      { x: -320, y: -175, w: 160, h: 14, solid: false },
      { x: 320, y: -175, w: 160, h: 14, solid: false },
      { x: 0, y: -330, w: 130, h: 14, solid: false },
    ],
    pads: [{ x: 0, w: 120, power: 19 }],
    blast: { l: -1020, r: 1020, t: -820, b: 600 },
    spawns: [{ x: -280, y: 0 }, { x: 280, y: 0 }, { x: -140, y: 0 }, { x: 140, y: 0 }],
    respawn: { x: 0, y: -430 },
    mainL: -420,
    mainR: 420,
    theme: 'circus',
  },
];

/** Posições atuais das plataformas (puro: função do tick). */
export function platsAt(stage: StageDef, tick: number, out: PlatPos[] = []): PlatPos[] {
  out.length = stage.plats.length;
  for (let i = 0; i < stage.plats.length; i++) {
    const p = stage.plats[i];
    let x = p.x;
    let y = p.y;
    let vx = 0;
    let vy = 0;
    if (p.mv) {
      const w = (Math.PI * 2) / p.mv.per;
      const a = tick * w + p.mv.ph;
      x += Math.sin(a) * p.mv.ax;
      y += Math.sin(a) * p.mv.ay;
      vx = Math.cos(a) * w * p.mv.ax;
      vy = Math.cos(a) * w * p.mv.ay;
    }
    const prev = out[i];
    if (prev) {
      prev.x = x; prev.y = y; prev.w = p.w; prev.h = p.h; prev.solid = p.solid; prev.vx = vx; prev.vy = vy; prev.pad = false;
    } else {
      out[i] = { x, y, w: p.w, h: p.h, solid: p.solid, vx, vy, pad: false };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Perigos dinâmicos — todos funções puras de (tick, seed)
// ---------------------------------------------------------------------------

export interface Geyser {
  x: number;
  phase: 0 | 1 | 2; // 0 inativo, 1 aviso, 2 erupção
  p: number; // progresso 0..1 da fase
}

const GEY_PERIOD = 260;
const GEY_WARN = 80;
const GEY_FIRE = 55;
const GEY_SLOTS = [-260, -130, 0, 130, 260];

/** Dois gêiseres escalonados (A e B). */
export function geysersAt(tick: number, seed: number): Geyser[] {
  const out: Geyser[] = [];
  for (let k = 0; k < 2; k++) {
    const off = k * (GEY_PERIOD / 2) + 120;
    const t = tick - off;
    if (t < 0) continue;
    const cycle = Math.floor(t / GEY_PERIOD);
    const ph = t - cycle * GEY_PERIOD;
    const slot = Math.floor(hash2(seed + k * 77, cycle) * GEY_SLOTS.length);
    const x = GEY_SLOTS[slot];
    if (ph < GEY_WARN) out.push({ x, phase: 1, p: ph / GEY_WARN });
    else if (ph < GEY_WARN + GEY_FIRE) out.push({ x, phase: 2, p: (ph - GEY_WARN) / GEY_FIRE });
  }
  return out;
}

export interface CannonShot {
  n: number;
  dir: number; // +1 vai pra direita (dispara da esquerda)
  y: number;
  fireTick: number;
  warn: number; // 0..1 durante aviso (-1 se já disparou)
  x: number; // posição atual da bala (se disparada)
  live: boolean;
}

const CAN_FIRST = 200;
const CAN_PERIOD = 230;
const CAN_WARN = 75;
const CAN_SPEED = 10.5;
const CAN_Y = [-40, -150, -255];
export const CANNON_X = 1000;
export const CANNON_R = 30;

/** Retorna os disparos ativos (aviso e/ou bala voando). */
export function cannonsAt(tick: number, seed: number): CannonShot[] {
  const out: CannonShot[] = [];
  const nNow = Math.floor((tick - CAN_FIRST + CAN_WARN) / CAN_PERIOD);
  for (let n = nNow; n >= Math.max(0, nNow - 1); n--) {
    const fireTick = CAN_FIRST + n * CAN_PERIOD;
    const dir = hash2(seed + 5, n) < 0.5 ? 1 : -1;
    const y = CAN_Y[Math.floor(hash2(seed + 9, n) * CAN_Y.length)];
    if (tick < fireTick) {
      if (tick >= fireTick - CAN_WARN) {
        out.push({ n, dir, y, fireTick, warn: 1 - (fireTick - tick) / CAN_WARN, x: -dir * CANNON_X, live: false });
      }
      continue;
    }
    const x = -dir * CANNON_X + dir * CAN_SPEED * (tick - fireTick);
    if (Math.abs(x) <= CANNON_X + 80) out.push({ n, dir, y, fireTick, warn: -1, x, live: true });
  }
  return out;
}
