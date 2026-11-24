import { PK } from './types';

// ---------------------------------------------------------------------------
// Definição dos moves (dados puros) e dos 6 lutadores originais
// ---------------------------------------------------------------------------

export interface HitBox {
  t0: number;
  t1: number;
  x: number; // centro, relativo aos pés, "para frente" positivo
  y: number; // centro, negativo = acima dos pés
  w: number;
  h: number;
  dmg: number;
  ang: number; // graus relativos à direção que o atacante encara (0 frente, 90 cima, 180 atrás, 270 baixo)
  bkb: number;
  kbg: number;
  grp: number;
  grab?: boolean;
  fx?: number; // 0 impacto, 1 corte, 2 fogo, 3 elétrico, 4 música, 5 fumaça
  hs?: number;
}

export interface Mot {
  t0: number;
  t1: number;
  vx?: number;
  vy?: number;
  add?: boolean;
}

export interface PSpawn {
  t: number;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Move {
  key: string;
  name: string;
  anim: string;
  dur: number;
  air: boolean;
  boxes: HitBox[];
  mot?: Mot[];
  gv?: [number, number, number][]; // janelas [t0,t1,multiplicador de gravidade]
  land?: number; // lag ao pousar (aéreos)
  landSkip?: number; // ao pousar antes deste frame, pula para ele (ex.: terremoto)
  inv?: [number, number];
  armor?: [number, number];
  counter?: [number, number];
  reflect?: [number, number];
  proj?: PSpawn[];
  tele?: { t: number; dx: number; dy: number; free?: boolean };
  helpless?: boolean;
  throwAt?: { t: number; dmg: number; ang: number; bkb: number; kbg: number };
  spin?: number; // voltas do corpo durante a janela ativa
  fxTag?: string;
  itemThrow?: number; // frame em que o item segurado é arremessado
  shake?: number;
  spawnNote?: string;
}

export const MK = [
  'jab', 'ftilt', 'utilt', 'dtilt', 'fsmash', 'usmash', 'dsmash',
  'nair', 'fair', 'bair', 'uair', 'dair',
  'grab', 'pummel', 'throwF', 'throwB', 'throwU', 'throwD',
  'nspec', 'sspec', 'uspec', 'dspec',
  'hammer', 'bomb', 'counterHit',
] as const;
export type MoveKey = (typeof MK)[number];
export const MKI: Record<string, number> = {};
MK.forEach((k, i) => (MKI[k] = i));

export interface Palette {
  fur: string;
  furDark: string;
  face: string;
  belly: string;
  main: string; // cor da roupa principal
  alt: string; // cor secundária
  skin: string;
}

export interface CharDef {
  id: number;
  name: string;
  title: string;
  tagline: string;
  emoji: string;
  accent: string;
  pal: Palette;
  scale: number;
  weight: number;
  run: number;
  accel: number;
  airSpeed: number;
  airAccel: number;
  jumpV: number;
  djumpV: number;
  jumps: number;
  grav: number;
  fall: number;
  fastFall: number;
  hw: number; // meia-largura de colisão
  bh: number; // altura
  stats: { peso: number; vel: number; alc: number; pod: number };
  specials: [string, string, string, string];
  moves: Move[];
  quotes: { win: string[]; ko: string[]; taunt: string[] };
}

// ---------------------------------------------------------------------------
// Construtor de moves base
// ---------------------------------------------------------------------------

interface BaseOpts {
  s: number; // escala geométrica
  pw: number; // multiplicador de dano
  sp: number; // multiplicador de duração (menor = mais rápido)
  rc: number; // alcance
}

function hb(
  t0: number, t1: number, x: number, y: number, w: number, h: number,
  dmg: number, ang: number, bkb: number, kbg: number, grp = 0, extra: Partial<HitBox> = {},
): HitBox {
  return { t0, t1, x, y, w, h, dmg, ang, bkb, kbg, grp, ...extra };
}

type Draft = Partial<Omit<Move, 'key' | 'name' | 'anim' | 'dur' | 'air'>>;

class Builder {
  constructor(private o: BaseOpts) {}

  T(n: number): number {
    return Math.max(1, Math.round(n * this.o.sp));
  }

  mk(key: string, name: string, anim: string, dur: number, air: boolean, d: Draft): Move {
    const o = this.o;
    const T = (n: number) => Math.round(n * o.sp);
    const boxes = (d.boxes ?? []).map((b) => ({
      ...b,
      t0: T(b.t0),
      t1: Math.max(T(b.t0) + 1, T(b.t1)),
      x: b.x * o.s * (b.x >= 0 ? o.rc : o.rc * 0.9),
      y: b.y * o.s,
      w: b.w * o.s * o.rc,
      h: b.h * o.s,
      dmg: Math.round(b.dmg * o.pw * 10) / 10,
    }));
    const mv: Move = {
      ...d,
      key,
      name,
      anim,
      dur: Math.max(4, Math.round(dur * o.sp)),
      air,
      boxes,
      mot: d.mot?.map((m) => ({ ...m, t0: T(m.t0), t1: T(m.t1), vx: m.vx !== undefined ? m.vx * o.s : undefined, vy: m.vy !== undefined ? m.vy * o.s : undefined })),
      gv: d.gv?.map(([a, b, m]) => [T(a), T(b), m] as [number, number, number]),
      proj: d.proj?.map((p) => ({ ...p, t: T(p.t), x: p.x * o.s, y: p.y * o.s })),
      inv: d.inv ? [T(d.inv[0]), T(d.inv[1])] : undefined,
      armor: d.armor ? [T(d.armor[0]), T(d.armor[1])] : undefined,
      counter: d.counter ? [T(d.counter[0]), T(d.counter[1])] : undefined,
      reflect: d.reflect ? [T(d.reflect[0]), T(d.reflect[1])] : undefined,
      tele: d.tele ? { ...d.tele, t: T(d.tele.t), dx: d.tele.dx * o.s, dy: d.tele.dy * o.s } : undefined,
      throwAt: d.throwAt ? { ...d.throwAt, t: T(d.throwAt.t), dmg: d.throwAt.dmg * o.pw } : undefined,
      itemThrow: d.itemThrow !== undefined ? T(d.itemThrow) : undefined,
      landSkip: d.landSkip !== undefined ? T(d.landSkip) : undefined,
    };
    return mv;
  }
}

/** Gera o moveset base (24 moves) conforme as opções do lutador; depois cada lutador sobrescreve/engrossa. */
function baseSet(o: BaseOpts): Record<string, Move> {
  const b = new Builder(o);
  const m: Record<string, Move> = {};
  const add = (mv: Move) => (m[mv.key] = mv);

  // --- chão: leves ---
  add(b.mk('jab', 'Tapa Rápido', 'jab', 17, false, {
    boxes: [hb(3, 6, 34, -44, 48, 28, 3, 30, 10, 12, 0, { fx: 0 })],
    mot: [{ t0: 2, t1: 5, vx: 1.2 }],
  }));
  add(b.mk('ftilt', 'Chute Lateral', 'ftilt', 27, false, {
    boxes: [hb(7, 11, 46, -36, 60, 28, 7, 36, 24, 70, 0, { fx: 1 })],
    mot: [{ t0: 5, t1: 9, vx: 2.4 }],
  }));
  add(b.mk('utilt', 'Cabeçada Pra Cima', 'utilt', 26, false, {
    boxes: [hb(6, 11, 6, -88, 62, 48, 6, 86, 22, 78, 0, { fx: 0 })],
  }));
  add(b.mk('dtilt', 'Rasteira', 'dtilt', 22, false, {
    boxes: [hb(5, 9, 42, -14, 70, 22, 5, 74, 16, 55, 0, { fx: 1 })],
  }));
  // --- chão: fortes ---
  add(b.mk('fsmash', 'Pancadão Frontal', 'fsmash', 46, false, {
    boxes: [hb(16, 20, 56, -42, 76, 42, 15, 38, 38, 104, 0, { fx: 0, hs: 3 })],
    mot: [{ t0: 14, t1: 18, vx: 4 }],
    shake: 4,
  }));
  add(b.mk('usmash', 'Uppercut da Banana', 'usmash', 50, false, {
    boxes: [hb(13, 20, 4, -98, 78, 70, 14, 88, 38, 104, 0, { fx: 0, hs: 3 })],
    shake: 4,
  }));
  add(b.mk('dsmash', 'Giro Destruidor', 'dsmash', 48, false, {
    boxes: [
      hb(12, 16, 46, -22, 84, 30, 11, 28, 34, 95, 0, { fx: 1 }),
      hb(19, 23, -46, -22, 84, 30, 12, 152, 34, 98, 1, { fx: 1 }),
    ],
  }));
  // --- aéreos ---
  add(b.mk('nair', 'Rodopio', 'nair', 34, true, {
    boxes: [
      hb(5, 9, 0, -40, 96, 68, 8, 48, 14, 55, 0, { fx: 0 }),
      hb(10, 21, 0, -40, 96, 68, 4, 62, 8, 24, 1, { fx: 0 }),
    ],
    land: 8,
  }));
  add(b.mk('fair', 'Voadora', 'fair', 36, true, {
    boxes: [hb(9, 14, 48, -40, 66, 46, 10, 38, 26, 86, 0, { fx: 1 })],
    land: 10,
  }));
  add(b.mk('bair', 'Coice Voador', 'bair', 34, true, {
    boxes: [hb(7, 12, -52, -40, 62, 42, 11, 148, 26, 92, 0, { fx: 0 })],
    land: 9,
  }));
  add(b.mk('uair', 'Cambalhota Pra Cima', 'uair', 32, true, {
    boxes: [hb(6, 12, 4, -92, 68, 52, 8, 84, 20, 76, 0, { fx: 0 })],
    land: 8,
  }));
  add(b.mk('dair', 'Pisão Meteoro', 'dair', 44, true, {
    boxes: [hb(12, 22, 6, -8, 44, 62, 9, 285, 18, 60, 0, { fx: 0, hs: 2 })],
    land: 16,
  }));
  // --- agarrar / arremessar ---
  add(b.mk('grab', 'Agarrão', 'grab', 34, false, {
    boxes: [hb(6, 10, 38, -40, 56, 36, 0, 0, 0, 0, 0, { grab: true })],
  }));
  add(b.mk('pummel', 'Tapinha', 'pummel', 10, false, { boxes: [] }));
  add(b.mk('throwF', 'Arremesso Frontal', 'throw', 24, false, { throwAt: { t: 7, dmg: 8, ang: 36, bkb: 34, kbg: 78 } }));
  add(b.mk('throwB', 'Arremesso Atrás', 'throw', 26, false, { throwAt: { t: 9, dmg: 9, ang: 148, bkb: 34, kbg: 82 } }));
  add(b.mk('throwU', 'Arremesso Pro Alto', 'throwU', 26, false, { throwAt: { t: 9, dmg: 7, ang: 92, bkb: 36, kbg: 76 } }));
  add(b.mk('throwD', 'Pisão no Chão', 'throw', 28, false, { throwAt: { t: 10, dmg: 6, ang: 76, bkb: 30, kbg: 60 } }));
  // --- itens ---
  add(b.mk('hammer', 'Marretada de Coco', 'swing', 54, false, {
    boxes: [hb(17, 24, 58, -56, 96, 100, 22, 38, 56, 120, 0, { fx: 0, hs: 5 })],
    shake: 7,
  }));
  add(b.mk('bomb', 'Arremesso de Bomba', 'toss', 26, false, { itemThrow: 8 }));
  add(b.mk('counterHit', 'Contra-Ataque', 'counterStrike', 26, false, {}));
  return m;
}

function toList(m: Record<string, Move>): Move[] {
  return MK.map((k) => m[k]);
}

// ---------------------------------------------------------------------------
// Os 6 lutadores
// ---------------------------------------------------------------------------

function makePrego(): CharDef {
  const o = { s: 1.0, pw: 0.95, sp: 0.88, rc: 1.05 };
  const b = new Builder(o);
  const m = baseSet(o);
  m.fair = b.mk('fair', 'Meia-Lua de Compasso', 'spin', 38, true, {
    boxes: [
      hb(8, 12, 44, -42, 66, 46, 5, 50, 12, 30, 0, { fx: 1 }),
      hb(15, 19, 44, -42, 70, 46, 7, 38, 24, 80, 1, { fx: 1 }),
    ],
    spin: 1, land: 10,
  });
  m.dair = b.mk('dair', 'Bananeira Pisão', 'dair', 42, true, {
    boxes: [hb(11, 21, 8, -8, 46, 64, 10, 285, 20, 64, 0, { fx: 0, hs: 2 })],
    land: 14,
  });
  m.nspec = b.mk('nspec', 'Toque de Berimbau', 'shoot', 38, false, {
    proj: [{ t: 14, kind: PK.BERIMBAU, x: 44, y: -52, vx: 7, vy: 0 }],
  });
  m.sspec = b.mk('sspec', 'Rabo de Arraia', 'spin', 42, true, {
    boxes: [hb(6, 15, 44, -34, 74, 50, 11, 32, 30, 92, 0, { fx: 1, hs: 3 })],
    mot: [{ t0: 4, t1: 15, vx: 9.5 }],
    gv: [[0, 18, 0.35]],
    spin: 1, land: 14,
  });
  m.uspec = b.mk('uspec', 'Aú Batido', 'cart', 48, true, {
    boxes: [
      hb(8, 15, 16, -52, 62, 72, 4, 82, 18, 40, 0, { fx: 1 }),
      hb(16, 26, 10, -74, 72, 84, 6, 82, 30, 74, 1, { fx: 1 }),
    ],
    mot: [{ t0: 5, t1: 26, vy: -9.8 }, { t0: 5, t1: 26, vx: 2.6 }],
    spin: 1, helpless: true,
  });
  m.dspec = b.mk('dspec', 'Negativa', 'counter', 36, false, { counter: [4, 22] });
  return {
    id: 0,
    name: 'Mestre Prego',
    title: 'Capoeirista Prego',
    tagline: 'Ginga, rasteira e meia-lua. Nunca encosta no chão por muito tempo.',
    emoji: '🥋',
    accent: '#f59e0b',
    pal: { fur: '#8b5a2b', furDark: '#5c3a1a', face: '#e7c7a0', belly: '#d9b283', main: '#f8fafc', alt: '#dc2626', skin: '#e7c7a0' },
    scale: 1.0, weight: 92, run: 5.7, accel: 0.62, airSpeed: 3.5, airAccel: 0.2, jumpV: 12.9, djumpV: 12.2, jumps: 1,
    grav: 0.52, fall: 11, fastFall: 15.5, hw: 17, bh: 82,
    stats: { peso: 2, vel: 4, alc: 3, pod: 3 },
    specials: ['Toque de Berimbau', 'Rabo de Arraia', 'Aú Batido', 'Negativa'],
    moves: toList(m),
    quotes: {
      win: ['Ginga, ginga, GANHEI!', 'Axé, parceiro. Aprende a esquivar.', 'Capoeira é amor... e chute na cara.'],
      ko: ['Mandei bem na queda!', 'Faltou ginga...', 'Quem caiu foi o berimbau!'],
      taunt: ['Ê ê ê, camará!', 'Vem pra roda!', 'Ginga, ginga!'],
    },
  };
}

function makeGorila(): CharDef {
  const o = { s: 1.22, pw: 1.3, sp: 1.22, rc: 1.1 };
  const b = new Builder(o);
  const m = baseSet(o);
  m.fsmash = b.mk('fsmash', 'Supino Frontal', 'fsmash', 50, false, {
    boxes: [hb(18, 23, 56, -44, 80, 50, 17, 36, 42, 110, 0, { fx: 0, hs: 4 })],
    mot: [{ t0: 15, t1: 20, vx: 4.5 }],
    armor: [12, 24],
    shake: 7,
  });
  m.nspec = b.mk('nspec', 'Shake de Whey', 'toss', 50, false, {
    proj: [{ t: 22, kind: PK.SHAKE, x: 44, y: -70, vx: 5.8, vy: -3.6 }],
  });
  m.sspec = b.mk('sspec', 'Voadora de Anilha', 'dash', 56, true, {
    boxes: [hb(12, 25, 50, -46, 84, 74, 15, 38, 40, 104, 0, { fx: 0, hs: 4 })],
    mot: [{ t0: 10, t1: 25, vx: 8.4 }],
    armor: [8, 25],
    gv: [[0, 28, 0.4]],
    land: 20, shake: 6,
  });
  m.uspec = b.mk('uspec', 'Barra Fixa', 'heli', 62, true, {
    boxes: [
      hb(10, 16, 0, -66, 120, 124, 3, 80, 10, 20, 0, { fx: 0 }),
      hb(18, 24, 0, -66, 120, 124, 3, 80, 10, 20, 1, { fx: 0 }),
      hb(26, 33, 0, -70, 130, 132, 6, 82, 30, 74, 2, { fx: 0, hs: 3 }),
    ],
    mot: [{ t0: 8, t1: 34, vy: -8.6 }, { t0: 8, t1: 34, vx: 1.6 }],
    spin: 3, helpless: true,
  });
  m.dspec = b.mk('dspec', 'Terremoto do Supino', 'pound', 66, true, {
    boxes: [hb(24, 30, 0, -14, 230, 52, 13, 68, 46, 96, 0, { fx: 0, hs: 5 })],
    mot: [{ t0: 2, t1: 14, vy: 13 }],
    gv: [[0, 14, 0]],
    land: 4, landSkip: 22, shake: 9,
  });
  return {
    id: 1,
    name: 'Rei da Academia',
    title: 'Gorila Marombeiro',
    tagline: 'Pesado, lento e cheio de whey. Um supino bem dado vira KO.',
    emoji: '💪',
    accent: '#ef4444',
    pal: { fur: '#3f3f46', furDark: '#27272a', face: '#a1a1aa', belly: '#52525b', main: '#facc15', alt: '#111827', skin: '#a1a1aa' },
    scale: 1.22, weight: 138, run: 4.1, accel: 0.42, airSpeed: 2.8, airAccel: 0.14, jumpV: 11.6, djumpV: 10.8, jumps: 1,
    grav: 0.62, fall: 12.5, fastFall: 17, hw: 22, bh: 100,
    stats: { peso: 5, vel: 1, alc: 3, pod: 5 },
    specials: ['Shake de Whey', 'Voadora de Anilha', 'Barra Fixa', 'Terremoto do Supino'],
    moves: toList(m),
    quotes: {
      win: ['Hoje é dia de perna? NÃO, É DIA DE VITÓRIA!', 'Tá pago, shape é shape!', 'Proteína no talo, derrota no outro!'],
      ko: ['Esqueci do aquecimento...', 'Foi o cartão da academia!', 'Meu bíceps me traiu!'],
      taunt: ['BORA, MONSTRO!', 'Quer um shake?', 'Peito de aço!'],
    },
  };
}

function makeMico(): CharDef {
  const o = { s: 0.8, pw: 0.82, sp: 0.85, rc: 1.0 };
  const b = new Builder(o);
  const m = baseSet(o);
  m.nspec = b.mk('nspec', 'Ctrl+Alt+Del', 'shoot', 28, false, {
    proj: [{ t: 10, kind: PK.BITS, x: 34, y: -56, vx: 12, vy: 0 }],
  });
  m.sspec = b.mk('sspec', 'Ping Fantasma', 'tele', 40, true, {
    tele: { t: 8, dx: 190, dy: 0 },
    inv: [6, 14],
    boxes: [hb(14, 21, 40, -44, 80, 60, 9, 40, 26, 86, 0, { fx: 3 })],
    gv: [[0, 22, 0.2]],
    land: 12,
  });
  m.uspec = b.mk('uspec', 'Wi-Fi Boost', 'tele', 44, true, {
    tele: { t: 9, dx: 160, dy: -220, free: true },
    inv: [6, 18],
    boxes: [hb(14, 22, 0, -56, 96, 110, 6, 84, 24, 56, 0, { fx: 3 })],
    gv: [[0, 24, 0.2]],
    helpless: true,
  });
  m.dspec = b.mk('dspec', 'Firewall', 'block', 38, false, { reflect: [4, 28] });
  m.dair = b.mk('dair', 'Pisão do Teclado', 'dair', 40, true, {
    boxes: [hb(10, 20, 4, -6, 40, 56, 8, 285, 16, 52, 0, { fx: 3, hs: 2 })],
    land: 12,
  });
  return {
    id: 2,
    name: 'Mico Hacker',
    title: 'Mico Hacker',
    tagline: 'Leve, rápido e com 3 pulos. Vive teleportando e trollando no Wi-Fi.',
    emoji: '💻',
    accent: '#22c55e',
    pal: { fur: '#d6a35f', furDark: '#a87a3a', face: '#f5deb3', belly: '#f2d4a0', main: '#6d28d9', alt: '#22c55e', skin: '#f5deb3' },
    scale: 0.8, weight: 74, run: 6.4, accel: 0.78, airSpeed: 4.0, airAccel: 0.26, jumpV: 13.6, djumpV: 12.8, jumps: 2,
    grav: 0.46, fall: 9.6, fastFall: 13.8, hw: 14, bh: 66,
    stats: { peso: 1, vel: 5, alc: 3, pod: 2 },
    specials: ['Ctrl+Alt+Del', 'Ping Fantasma', 'Wi-Fi Boost', 'Firewall'],
    moves: toList(m),
    quotes: {
      win: ['GG EZ, noob!', 'Tá hackeado, parceiro.', 'Sua defesa estava sem antivírus!'],
      ko: ['Deu tela azul...', 'Lag! Foi o lag!', 'Meu Wi-Fi caiu!'],
      taunt: ['Acesso negado!', 'Atualizando...', '01001000 01001001!'],
    },
  };
}

function makeVovo(): CharDef {
  const o = { s: 0.96, pw: 1.05, sp: 1.0, rc: 1.3 };
  const b = new Builder(o);
  const m = baseSet(o);
  m.jab = b.mk('jab', 'Bengalinha', 'jab', 18, false, {
    boxes: [hb(3, 7, 40, -46, 54, 24, 3, 28, 10, 14, 0, { fx: 1 })],
    mot: [{ t0: 2, t1: 5, vx: 1 }],
  });
  m.nspec = b.mk('nspec', 'Tricô Voador', 'toss', 44, false, {
    proj: [{ t: 16, kind: PK.YARN, x: 36, y: -60, vx: 7.2, vy: -4.2 }],
  });
  m.sspec = b.mk('sspec', 'Bengalada', 'fsmash', 46, false, {
    boxes: [hb(12, 20, 70, -44, 104, 28, 13, 34, 34, 100, 0, { fx: 1, hs: 3 })],
    mot: [{ t0: 10, t1: 18, vx: 5.5 }],
  });
  m.uspec = b.mk('uspec', 'Guarda-Chuva Planador', 'umbrella', 72, true, {
    boxes: [hb(6, 16, 6, -98, 84, 66, 7, 86, 28, 80, 0, { fx: 0 })],
    mot: [{ t0: 3, t1: 14, vy: -9.6 }, { t0: 3, t1: 40, vx: 1.8 }],
    gv: [[14, 72, 0.18]],
    helpless: true,
  });
  m.dspec = b.mk('dspec', 'Colherada Materna', 'smashDown', 56, false, {
    boxes: [hb(20, 27, 54, -34, 96, 78, 16, 46, 40, 112, 0, { fx: 0, hs: 5 })],
    shake: 6,
  });
  return {
    id: 3,
    name: 'Vovó Orangotango',
    title: 'Vovó Orangotango',
    tagline: 'Bengala gigante, tricô voador e a temida Colherada. Respeite os mais velhos.',
    emoji: '👵',
    accent: '#fb923c',
    pal: { fur: '#ea7a1e', furDark: '#b45309', face: '#f6c796', belly: '#f6c796', main: '#a855f7', alt: '#fde68a', skin: '#f6c796' },
    scale: 0.96, weight: 104, run: 4.5, accel: 0.5, airSpeed: 2.9, airAccel: 0.17, jumpV: 11.9, djumpV: 11.2, jumps: 1,
    grav: 0.5, fall: 11, fastFall: 15, hw: 17, bh: 80,
    stats: { peso: 3, vel: 2, alc: 5, pod: 4 },
    specials: ['Tricô Voador', 'Bengalada', 'Guarda-Chuva Planador', 'Colherada Materna'],
    moves: toList(m),
    quotes: {
      win: ['Meu filho, tem bolo na mesa!', 'No meu tempo se brigava melhor.', 'Come tudo que o macaco cresce!'],
      ko: ['Ai a minha coluna!', 'Onde estão meus óculos?', 'Chama o Zé Macaco!'],
      taunt: ['Vem cá, benzinho!', 'Já tomou seu chá?', 'Cuidado com a bengala!'],
    },
  };
}

function makeNinja(): CharDef {
  const o = { s: 0.92, pw: 0.9, sp: 0.86, rc: 1.0 };
  const b = new Builder(o);
  const m = baseSet(o);
  m.nspec = b.mk('nspec', 'Chinelada Voadora', 'toss', 30, false, {
    proj: [{ t: 10, kind: PK.SANDAL, x: 34, y: -56, vx: 10.5, vy: 0 }],
  });
  m.sspec = b.mk('sspec', 'Corte Relâmpago', 'dash', 36, true, {
    boxes: [hb(6, 15, 44, -40, 86, 40, 9, 36, 28, 92, 0, { fx: 1, hs: 3 })],
    mot: [{ t0: 4, t1: 15, vx: 14 }],
    inv: [4, 16],
    gv: [[0, 20, 0.15]],
    land: 12,
  });
  m.uspec = b.mk('uspec', 'Salto da Sombra', 'tele', 50, true, {
    tele: { t: 10, dx: 150, dy: -200, free: true },
    inv: [6, 20],
    boxes: [hb(12, 22, 0, -62, 92, 96, 6, 84, 24, 60, 0, { fx: 5 })],
    gv: [[0, 28, 0.2]],
    helpless: true,
  });
  m.dspec = b.mk('dspec', 'Bomba de Fumaça', 'smoke', 40, true, {
    boxes: [hb(8, 15, 0, -42, 160, 104, 7, 62, 40, 74, 0, { fx: 5, hs: 2 })],
    inv: [3, 14],
    gv: [[0, 18, 0.3]],
  });
  m.fair = b.mk('fair', 'Chinelada na Cara', 'fair', 34, true, {
    boxes: [hb(8, 13, 50, -40, 70, 46, 9, 40, 24, 82, 0, { fx: 1 })],
    land: 9,
  });
  return {
    id: 4,
    name: 'Ninja de Chinelo',
    title: 'Macaco Ninja de Chinelo',
    tagline: 'Silencioso, rápido e armado com chinelo. A mãe de todo ninja.',
    emoji: '🥷',
    accent: '#38bdf8',
    pal: { fur: '#6b7280', furDark: '#374151', face: '#d1d5db', belly: '#9ca3af', main: '#111827', alt: '#ef4444', skin: '#d1d5db' },
    scale: 0.92, weight: 84, run: 6.6, accel: 0.8, airSpeed: 3.8, airAccel: 0.24, jumpV: 13.2, djumpV: 12.6, jumps: 1,
    grav: 0.5, fall: 10.5, fastFall: 15, hw: 15, bh: 76,
    stats: { peso: 2, vel: 5, alc: 3, pod: 3 },
    specials: ['Chinelada Voadora', 'Corte Relâmpago', 'Salto da Sombra', 'Bomba de Fumaça'],
    moves: toList(m),
    quotes: {
      win: ['Ninguém viu, mas eu ganhei.', 'Chinelo no ar, vitória no bolso.', 'Honra, glória e Havaianas.'],
      ko: ['Fui desonrado... pelo chinelo!', 'A sombra me abandonou!', 'Tropecei no tatame!'],
      taunt: ['Silêncio ninja...', 'Chinelada!', 'Cadê o chinelo?'],
    },
  };
}

function makeBugio(): CharDef {
  const o = { s: 1.06, pw: 1.1, sp: 1.04, rc: 1.12 };
  const b = new Builder(o);
  const m = baseSet(o);
  m.nspec = b.mk('nspec', 'Sofrência Sonora', 'shoot', 44, false, {
    proj: [{ t: 16, kind: PK.NOTE, x: 40, y: -58, vx: 5.4, vy: 0 }],
  });
  m.sspec = b.mk('sspec', 'Violada', 'swing', 54, false, {
    boxes: [
      hb(16, 20, 40, -52, 70, 60, 12, 40, 28, 96, 0, { fx: 4 }),
      hb(20, 24, 74, -48, 56, 56, 18, 36, 44, 112, 0, { fx: 4, hs: 4 }),
    ],
    mot: [{ t0: 14, t1: 21, vx: 3 }],
    shake: 6,
  });
  m.uspec = b.mk('uspec', 'Grito do Bugio', 'scream', 62, true, {
    boxes: [
      hb(10, 18, 0, -64, 110, 120, 4, 84, 14, 40, 0, { fx: 4 }),
      hb(21, 30, 0, -66, 120, 128, 6, 84, 30, 70, 1, { fx: 4, hs: 3 }),
    ],
    mot: [{ t0: 8, t1: 32, vy: -8.2 }, { t0: 8, t1: 32, vx: 2.2 }],
    helpless: true,
  });
  m.dspec = b.mk('dspec', 'Berrante do Rodeio', 'bellow', 60, true, {
    boxes: [hb(14, 26, 0, -34, 210, 70, 10, 62, 44, 86, 0, { fx: 4, hs: 3 })],
    gv: [[0, 30, 0.35]],
    land: 6,
  });
  return {
    id: 5,
    name: 'Bugio Sertanejo',
    title: 'Bugio Cantor de Sertanejo',
    tagline: 'Viola na mão, grito no peito e sofrência na alma. O rodeio começou.',
    emoji: '🤠',
    accent: '#a16207',
    pal: { fur: '#7c2d12', furDark: '#431407', face: '#c28a5b', belly: '#a35a2a', main: '#2563eb', alt: '#fef3c7', skin: '#c28a5b' },
    scale: 1.06, weight: 112, run: 4.9, accel: 0.52, airSpeed: 3.0, airAccel: 0.18, jumpV: 12.2, djumpV: 11.5, jumps: 1,
    grav: 0.54, fall: 11.5, fastFall: 15.5, hw: 18, bh: 86,
    stats: { peso: 4, vel: 2, alc: 4, pod: 4 },
    specials: ['Sofrência Sonora', 'Violada', 'Grito do Bugio', 'Berrante do Rodeio'],
    moves: toList(m),
    quotes: {
      win: ['É o amor que me move... e a violada!', 'Show encerrado, valeu, Goiânia!', 'Sofreu? Sofreu! Próximo!'],
      ko: ['Tô sofrendo, minha gente...', 'Quebrou a corda da viola!', 'Foi mal, pessoal!'],
      taunt: ['UÔÔÔÔ!', 'Tocou o sertanejo!', 'Pede música, parceiro!'],
    },
  };
}

export const CHARS: CharDef[] = [makePrego(), makeGorila(), makeMico(), makeVovo(), makeNinja(), makeBugio()];

// ---------------------------------------------------------------------------
// Projéteis
// ---------------------------------------------------------------------------

export interface ProjDef {
  name: string;
  r: number;
  g: number;
  life: number;
  bounce: number;
  dmg: number;
  ang: number;
  bkb: number;
  kbg: number;
  hs: number;
  pierce: number; // acertos por vítima permitidos (0 = só um)
  boom?: boolean;
  wave?: number;
  explode?: boolean;
  fx: number;
}

export const PROJS: ProjDef[] = [
  { name: 'berimbau', r: 18, g: 0, life: 70, bounce: 0, dmg: 5, ang: 32, bkb: 14, kbg: 40, hs: 2, pierce: 0, wave: 2.4, fx: 4 },
  { name: 'shake', r: 22, g: 0.32, life: 90, bounce: 0, dmg: 11, ang: 42, bkb: 30, kbg: 74, hs: 4, pierce: 0, fx: 0 },
  { name: 'bits', r: 12, g: 0, life: 52, bounce: 0, dmg: 4, ang: 22, bkb: 12, kbg: 26, hs: 2, pierce: 0, fx: 3 },
  { name: 'yarn', r: 20, g: 0.38, life: 120, bounce: 0.7, dmg: 6, ang: 50, bkb: 16, kbg: 44, hs: 2, pierce: 0, fx: 0 },
  { name: 'sandal', r: 18, g: 0, life: 90, bounce: 0, dmg: 6, ang: 30, bkb: 16, kbg: 48, hs: 3, pierce: 0, boom: true, fx: 1 },
  { name: 'note', r: 22, g: 0, life: 85, bounce: 0, dmg: 6, ang: 40, bkb: 18, kbg: 52, hs: 2, pierce: 2, wave: 3.2, fx: 4 },
  { name: 'bomb', r: 22, g: 0.42, life: 140, bounce: 0.35, dmg: 0, ang: 50, bkb: 0, kbg: 0, hs: 0, pierce: 0, explode: true, fx: 2 },
  { name: 'shock', r: 12, g: 0, life: 20, bounce: 0, dmg: 6, ang: 60, bkb: 20, kbg: 40, hs: 2, pierce: 0, fx: 0 },
];
