import type { LevelData, LevelObject, ObjectType } from './types';

class LevelBuilder {
  private objects: LevelObject[] = [];
  private occupied = new Map<string, LevelObject>();

  add(gx: number, gy: number, type: ObjectType): this {
    if (gy < 0 || gy > 11 || gx < 0) return this;
    const key = `${gx},${gy}`;
    const existing = this.occupied.get(key);
    if (existing) {
      existing.type = type;
    } else {
      const obj: LevelObject = { gx, gy, type };
      this.occupied.set(key, obj);
      this.objects.push(obj);
    }
    return this;
  }

  row(startGx: number, count: number, gy: number, type: ObjectType): this {
    for (let i = 0; i < count; i++) {
      this.add(startGx + i, gy, type);
    }
    return this;
  }

  col(gx: number, startGy: number, count: number, type: ObjectType): this {
    for (let i = 0; i < count; i++) {
      this.add(gx, startGy + i, type);
    }
    return this;
  }

  box(startGx: number, startGy: number, w: number, h: number, type: ObjectType = 'block'): this {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        this.add(startGx + x, startGy + y, type);
      }
    }
    return this;
  }

  spikes(startGx: number, count: number, gy = 0, down = false): this {
    return this.row(startGx, count, gy, down ? 'spike_down' : 'spike');
  }

  portal(gx: number, gy: number, type: ObjectType): this {
    return this.add(gx, gy, type);
  }

  build(): LevelObject[] {
    return this.objects.sort((a, b) => a.gx - b.gx || a.gy - b.gy);
  }
}

function buildLevel1(): LevelData {
  const b = new LevelBuilder();
  // Warmup: single spikes on beat
  b.spikes(14, 1, 0);
  b.spikes(24, 1, 0);
  b.spikes(34, 2, 0);

  // Easy block stairs
  b.box(44, 0, 4, 1, 'block');
  b.box(50, 0, 4, 2, 'block');
  b.add(52, 2, 'banana'); // Banana #1
  b.box(56, 0, 4, 1, 'block');

  // Jump pad launch over spike pit
  b.add(66, 0, 'pad_yellow');
  b.spikes(68, 2, 0);
  b.box(70, 2, 6, 1, 'block');

  // Floating orb bridge
  b.box(82, 0, 3, 1, 'block');
  b.spikes(85, 5, 0);
  b.add(87, 3, 'orb_yellow');
  b.box(90, 2, 4, 1, 'block');
  b.add(92, 4, 'banana'); // Banana #2

  // Classic cube rhythm hops
  b.spikes(100, 1, 0);
  b.box(104, 0, 3, 1, 'block');
  b.add(105, 1, 'spike');
  b.spikes(110, 2, 0);

  // Intro to Nave Banana Foguete!
  b.portal(118, 2, 'portal_ship');
  b.box(124, 0, 4, 2, 'block');
  b.box(124, 9, 4, 3, 'block');
  b.box(134, 0, 4, 4, 'block');
  b.box(134, 10, 4, 2, 'block');
  b.add(136, 7, 'banana'); // Banana #3
  b.box(144, 0, 3, 2, 'block');
  b.box(144, 8, 3, 4, 'block');

  // Back to Cube for victory sprint
  b.portal(153, 2, 'portal_cube');
  b.spikes(160, 2, 0);
  b.add(167, 0, 'pad_yellow');

  return {
    id: 'selva-tranquila',
    name: 'Selva Tranquila',
    subtitle: 'Fase 1 • Ritmo de boas-vindas pra esquentar o dedo',
    difficulty: 'Fácil',
    bpm: 120,
    songId: 0,
    colorPrimary: '#4ade80',
    colorSecondary: '#facc15',
    bgTop: '#041f1e',
    bgBottom: '#064e3b',
    lengthTiles: 178,
    objects: b.build(),
  };
}

function buildLevel2(): LevelData {
  const b = new LevelBuilder();
  // Punchy cube opening with orbs and stairs
  b.spikes(12, 2, 0);
  b.box(18, 0, 3, 1, 'block');
  b.spikes(21, 4, 0);
  b.add(23, 3, 'orb_yellow');
  b.box(26, 2, 4, 1, 'block');
  b.add(28, 4, 'banana'); // Banana #1

  b.spikes(34, 2, 0);
  b.add(40, 0, 'pad_yellow');
  b.spikes(42, 3, 0);
  b.box(45, 2, 5, 1, 'block');
  b.spikes(50, 5, 0);
  b.add(52, 4, 'orb_yellow');
  b.box(56, 2, 4, 1, 'block');

  // Speed up into Nave Banana!
  b.portal(65, 2, 'portal_speed_fast');
  b.portal(68, 2, 'portal_ship');

  // Ship wave-like pillars
  b.box(76, 0, 3, 4, 'block');
  b.add(77, 4, 'spike');
  b.box(76, 10, 3, 2, 'block');

  b.box(86, 0, 3, 2, 'block');
  b.box(86, 8, 3, 4, 'block');
  b.add(87, 7, 'spike_down');
  b.add(87, 5, 'banana'); // Banana #2

  b.box(96, 0, 3, 5, 'block');
  b.box(96, 10, 3, 2, 'block');

  b.box(106, 0, 3, 2, 'block');
  b.box(106, 7, 3, 5, 'block');

  // Back to Cube + Orb Rhythm Combo
  b.portal(115, 2, 'portal_cube');
  b.spikes(123, 2, 0);
  b.box(129, 0, 3, 1, 'block');
  b.add(130, 1, 'pad_yellow');
  b.spikes(132, 4, 0);
  b.box(136, 3, 5, 1, 'block');
  b.add(143, 5, 'orb_yellow');
  b.box(147, 4, 4, 1, 'block');
  b.add(149, 6, 'banana'); // Banana #3

  // Finale Cube run
  b.spikes(156, 2, 0);
  b.spikes(164, 2, 0);
  b.box(171, 0, 3, 1, 'block');
  b.spikes(174, 3, 0);
  b.add(176, 2, 'orb_yellow');
  b.spikes(183, 2, 0);

  return {
    id: 'bananada-neon',
    name: 'Bananada Neon',
    subtitle: 'Fase 2 • Nave Banana Foguete + Molas Psicodélicas',
    difficulty: 'Médio',
    bpm: 132,
    songId: 1,
    colorPrimary: '#facc15',
    colorSecondary: '#f43f5e',
    bgTop: '#160b2e',
    bgBottom: '#3b0764',
    lengthTiles: 194,
    objects: b.build(),
  };
}

function buildLevel3(): LevelData {
  const b = new LevelBuilder();
  // Cube rapid rhythm
  b.portal(10, 2, 'portal_speed_fast');
  b.spikes(16, 2, 0);
  b.box(22, 0, 2, 1, 'block');
  b.box(27, 0, 2, 2, 'block');
  b.spikes(29, 4, 0);
  b.add(31, 4, 'orb_yellow');
  b.box(35, 2, 3, 1, 'block');
  b.add(36, 3, 'pad_yellow');
  b.spikes(38, 6, 0);

  // Gravity Flip section!
  b.portal(47, 3, 'portal_grav_inv');
  // Ceiling floor blocks so ceiling is clearly solid & spiked
  b.box(46, 11, 40, 1, 'block');
  b.spikes(55, 2, 10, true);
  b.box(62, 10, 3, 1, 'block');
  b.add(63, 9, 'banana'); // Banana #1 (ceiling!)
  b.spikes(68, 2, 10, true);
  b.add(74, 8, 'orb_blue'); // Flip back down mid-air!
  b.portal(79, 2, 'portal_grav_norm');
  b.spikes(82, 2, 0);

  // ONDA SURTADA (WAVE) Section!
  b.portal(90, 3, 'portal_wave');
  // Wave corridor: safe open path with upper/lower sawtooth blocks
  b.box(96, 0, 6, 3, 'block');
  b.box(96, 8, 6, 4, 'block');
  b.box(106, 0, 6, 5, 'block');
  b.box(106, 10, 6, 2, 'block');
  b.add(109, 7, 'banana'); // Banana #2
  b.box(116, 0, 6, 2, 'block');
  b.box(116, 7, 6, 5, 'block');
  b.box(126, 0, 6, 4, 'block');
  b.box(126, 9, 6, 3, 'block');
  b.box(136, 0, 5, 1, 'block');
  b.box(136, 6, 5, 6, 'block');

  // Transition to Ship Turbo!
  b.portal(146, 2, 'portal_ship');
  b.portal(149, 2, 'portal_speed_turbo');
  b.box(157, 0, 3, 4, 'block');
  b.box(157, 10, 3, 2, 'block');
  b.box(167, 0, 3, 2, 'block');
  b.box(167, 8, 3, 4, 'block');
  b.add(168, 6, 'banana'); // Banana #3
  b.box(177, 0, 3, 5, 'block');
  b.box(177, 10, 3, 2, 'block');

  // Final Cube Dash
  b.portal(186, 2, 'portal_cube');
  b.portal(189, 2, 'portal_speed_fast');
  b.spikes(195, 3, 0);
  b.add(202, 0, 'pad_yellow');
  b.spikes(204, 4, 0);

  return {
    id: 'faria-lima',
    name: 'Surto na Faria Lima',
    subtitle: 'Fase 3 • Gravidade Invertida + Onda Surtada (Wave)',
    difficulty: 'Difícil',
    bpm: 145,
    songId: 2,
    colorPrimary: '#22d3ee',
    colorSecondary: '#a855f7',
    bgTop: '#061029',
    bgBottom: '#1e1b4b',
    lengthTiles: 214,
    objects: b.build(),
  };
}

function buildLevel4(): LevelData {
  const b = new LevelBuilder();
  // Immediate Turbo Cube madness
  b.portal(8, 2, 'portal_speed_fast');
  b.spikes(14, 3, 0);
  b.box(21, 0, 2, 1, 'block');
  b.add(22, 1, 'pad_yellow');
  b.spikes(23, 6, 0);
  b.add(26, 5, 'orb_yellow');
  b.box(29, 4, 5, 1, 'block');
  b.add(32, 5, 'spike');
  b.add(37, 5, 'orb_blue'); // flip gravity!
  b.box(35, 11, 28, 1, 'block');
  b.spikes(43, 2, 10, true);
  b.add(48, 9, 'banana'); // Banana #1
  b.spikes(51, 2, 10, true);
  b.add(57, 8, 'orb_blue'); // flip back!
  b.portal(62, 2, 'portal_grav_norm');

  // Wave Demon Corridor (Turbo!)
  b.portal(66, 3, 'portal_speed_turbo');
  b.portal(69, 3, 'portal_wave');
  b.box(76, 0, 5, 3, 'block');
  b.box(76, 8, 5, 4, 'block');
  b.box(85, 0, 5, 5, 'block');
  b.box(85, 10, 5, 2, 'block');
  b.add(87, 7, 'banana'); // Banana #2
  b.box(94, 0, 5, 2, 'block');
  b.box(94, 7, 5, 5, 'block');
  b.box(103, 0, 5, 4, 'block');
  b.box(103, 9, 5, 3, 'block');
  b.box(112, 0, 5, 1, 'block');
  b.box(112, 6, 5, 6, 'block');
  b.box(121, 0, 5, 5, 'block');
  b.box(121, 10, 5, 2, 'block');

  // Ship Inverted Gravity Gauntlet!
  b.portal(130, 3, 'portal_ship');
  b.box(138, 0, 3, 4, 'block');
  b.add(139, 4, 'spike');
  b.box(138, 9, 3, 3, 'block');

  b.box(148, 0, 3, 2, 'block');
  b.box(148, 7, 3, 5, 'block');
  b.add(149, 6, 'spike_down');

  b.portal(156, 5, 'portal_grav_inv');
  b.box(164, 0, 3, 3, 'block');
  b.box(164, 8, 3, 4, 'block');
  b.add(165, 5, 'banana'); // Banana #3

  b.portal(173, 5, 'portal_grav_norm');
  b.box(181, 0, 3, 4, 'block');
  b.box(181, 10, 3, 2, 'block');

  // Final Cube Boss Rush!
  b.portal(190, 2, 'portal_cube');
  b.spikes(197, 3, 0);
  b.box(204, 0, 2, 1, 'block');
  b.add(205, 1, 'pad_yellow');
  b.spikes(206, 6, 0);
  b.add(210, 5, 'orb_yellow');
  b.box(214, 3, 3, 1, 'block');
  b.spikes(217, 5, 0);
  b.add(220, 4, 'orb_yellow');
  b.spikes(227, 3, 0);

  return {
    id: 'macaco-demonio',
    name: 'MACACO DEMÔNIO',
    subtitle: 'Fase 4 • Caos 160 BPM pra perder a amizade!',
    difficulty: 'Insano',
    bpm: 160,
    songId: 3,
    colorPrimary: '#fb7185',
    colorSecondary: '#facc15',
    bgTop: '#1f0510',
    bgBottom: '#450a0a',
    lengthTiles: 238,
    objects: b.build(),
  };
}

export const OFFICIAL_LEVELS: LevelData[] = [
  buildLevel1(),
  buildLevel2(),
  buildLevel3(),
  buildLevel4(),
];

export function createDefaultCustomLevel(): LevelData {
  const b = new LevelBuilder();
  b.spikes(14, 1, 0);
  b.box(20, 0, 3, 1, 'block');
  b.spikes(23, 3, 0);
  b.add(24, 3, 'orb_yellow');
  b.box(28, 2, 3, 1, 'block');
  b.add(29, 3, 'banana');
  b.portal(36, 2, 'portal_ship');
  b.box(44, 0, 3, 3, 'block');
  b.box(44, 8, 3, 4, 'block');
  b.portal(54, 2, 'portal_cube');
  b.spikes(62, 2, 0);

  return {
    id: 'custom-level',
    name: 'Minha Selva Custom',
    subtitle: 'Fase criada no Mini Editor de Macaco!',
    difficulty: 'Custom',
    bpm: 128,
    songId: 1,
    colorPrimary: '#38bdf8',
    colorSecondary: '#facc15',
    bgTop: '#081226',
    bgBottom: '#0f2942',
    lengthTiles: 80,
    objects: b.build(),
  };
}

export function encodeLevelCode(level: LevelData): string {
  const payload = {
    v: 1,
    n: level.name,
    b: level.bpm,
    s: level.songId,
    l: level.lengthTiles,
    o: level.objects.map((obj) => [obj.gx, obj.gy, obj.type]),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return 'CHIMP1:' + btoa(bin);
}

export function decodeLevelCode(raw: string): LevelData {
  const trimmed = raw.trim();
  let jsonStr = trimmed;
  if (trimmed.startsWith('CHIMP1:')) {
    const b64 = trimmed.slice(7);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    jsonStr = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(jsonStr) as {
    v?: number;
    n?: string;
    b?: number;
    s?: number;
    l?: number;
    o?: Array<[number, number, ObjectType]>;
    objects?: LevelObject[];
    name?: string;
    bpm?: number;
    lengthTiles?: number;
  };

  let objects: LevelObject[] = [];
  if (Array.isArray(parsed.o)) {
    objects = parsed.o
      .filter((item) => Array.isArray(item) && item.length >= 3)
      .map(([gx, gy, type]) => ({
        gx: Math.max(0, Math.floor(Number(gx) || 0)),
        gy: Math.max(0, Math.min(11, Math.floor(Number(gy) || 0))),
        type,
      }));
  } else if (Array.isArray(parsed.objects)) {
    objects = parsed.objects.map((item) => ({
      gx: Math.max(0, Math.floor(Number(item.gx) || 0)),
      gy: Math.max(0, Math.min(11, Math.floor(Number(item.gy) || 0))),
      type: item.type,
    }));
  } else {
    throw new Error('Formato de fase inválido!');
  }

  const maxGx = objects.reduce((acc, o) => Math.max(acc, o.gx), 40);
  const bpm = Math.max(80, Math.min(200, Number(parsed.b ?? parsed.bpm ?? 128)));
  const songRaw = Number(parsed.s ?? 1);
  const songId = (songRaw >= 0 && songRaw <= 3 ? songRaw : 1) as 0 | 1 | 2 | 3;

  return {
    id: 'custom-level',
    name: String(parsed.n ?? parsed.name ?? 'Fase Importada').slice(0, 28),
    subtitle: 'Fase importada via código!',
    difficulty: 'Custom',
    bpm,
    songId,
    colorPrimary: '#38bdf8',
    colorSecondary: '#facc15',
    bgTop: '#081226',
    bgBottom: '#0f2942',
    lengthTiles: Math.max(maxGx + 14, Number(parsed.l ?? parsed.lengthTiles ?? 80)),
    objects,
  };
}
