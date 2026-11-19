import { ENEMY_SPECS } from './constants';
import type { EnemyKind, LevelBlockDef, LevelDef, LevelEnemyDef, MaterialKind, MonkeyKind } from './types';

function addPillar(
  blocks: LevelBlockDef[],
  material: MaterialKind,
  x: number,
  baseY: number,
  h = 2.0,
  w = 0.42,
): number {
  blocks.push({ material, x, y: baseY + h / 2, w, h });
  return baseY + h;
}

function addBeam(
  blocks: LevelBlockDef[],
  material: MaterialKind,
  x: number,
  baseY: number,
  w = 2.6,
  h = 0.38,
): number {
  blocks.push({ material, x, y: baseY + h / 2, w, h });
  return baseY + h;
}

function addBox(
  blocks: LevelBlockDef[],
  material: MaterialKind,
  x: number,
  baseY: number,
  w = 0.95,
  h = 0.95,
): number {
  blocks.push({ material, x, y: baseY + h / 2, w, h });
  return baseY + h;
}

function addTnt(blocks: LevelBlockDef[], x: number, baseY: number): number {
  blocks.push({ material: 'tnt', x, y: baseY + 0.52, w: 0.94, h: 1.04 });
  return baseY + 1.04;
}

function addEnemy(enemies: LevelEnemyDef[], kind: EnemyKind, x: number, baseY: number): void {
  const r = ENEMY_SPECS[kind].radius;
  enemies.push({ kind, x, y: baseY + r });
}

function addBay(
  blocks: LevelBlockDef[],
  enemies: LevelEnemyDef[],
  opts: {
    cx: number;
    baseY: number;
    width: number;
    height: number;
    pillarMat: MaterialKind;
    roofMat: MaterialKind;
    enemy?: EnemyKind;
    tnt?: boolean;
  },
): number {
  const { cx, baseY, width, height, pillarMat, roofMat, enemy, tnt } = opts;
  const pw = 0.42;
  addPillar(blocks, pillarMat, cx - width / 2 + pw / 2, baseY, height, pw);
  addPillar(blocks, pillarMat, cx + width / 2 - pw / 2, baseY, height, pw);
  const top = addBeam(blocks, roofMat, cx, baseY + height, width + 0.16, 0.38);
  if (enemy) {
    addEnemy(enemies, enemy, cx, baseY);
  } else if (tnt) {
    addTnt(blocks, cx, baseY);
  }
  return top;
}

function buildLevel1(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];
  const cx = 20.5;
  const y1 = addBay(blocks, enemies, {
    cx,
    baseY: 0,
    width: 2.8,
    height: 2.0,
    pillarMat: 'wood',
    roofMat: 'wood',
    enemy: 'porco',
  });
  const y2 = addBay(blocks, enemies, {
    cx,
    baseY: y1,
    width: 2.4,
    height: 1.8,
    pillarMat: 'glass',
    roofMat: 'glass',
    enemy: 'porco',
  });
  addBox(blocks, 'glass', cx, y2, 0.9, 0.9);
  // Front glass shield
  addPillar(blocks, 'glass', 17.6, 0, 2.3, 0.38);

  return {
    id: 1,
    name: 'Torre de Vidro',
    subtitle: 'Primeiro dia dos Porcos na Faria Lima',
    theme: 'jungle',
    monkeys: ['normal', 'triple', 'normal', 'triple'],
    blocks,
    enemies,
    starThresholds: [12000, 22000, 31000],
  };
}

function buildLevel2(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  const yL = addBay(blocks, enemies, {
    cx: 18.6,
    baseY: 0,
    width: 2.6,
    height: 2.1,
    pillarMat: 'wood',
    roofMat: 'wood',
    enemy: 'porco',
  });
  const yR = addBay(blocks, enemies, {
    cx: 22.0,
    baseY: 0,
    width: 2.6,
    height: 2.1,
    pillarMat: 'wood',
    roofMat: 'wood',
    enemy: 'tatu',
  });
  // Connecting bridge & attic
  const yMid = addBeam(blocks, 'wood', 20.3, Math.max(yL, yR), 3.6, 0.38);
  addTnt(blocks, 20.3, 0);
  addBay(blocks, enemies, {
    cx: 20.3,
    baseY: yMid,
    width: 2.4,
    height: 1.7,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'porco',
  });

  return {
    id: 2,
    name: 'Barraco de Madeira',
    subtitle: 'Com barril de TNT escondido no térreo',
    theme: 'jungle',
    monkeys: ['normal', 'triple', 'bomb', 'normal'],
    blocks,
    enemies,
    starThresholds: [18000, 29000, 40000],
  };
}

function buildLevel3(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  // Stone outer shield
  addBox(blocks, 'stone', 17.2, 0, 1.0, 1.1);
  addBox(blocks, 'stone', 17.2, 1.1, 1.0, 1.1);
  addBox(blocks, 'glass', 17.2, 2.2, 0.85, 0.85);

  const y1 = addBay(blocks, enemies, {
    cx: 20.4,
    baseY: 0,
    width: 2.8,
    height: 2.1,
    pillarMat: 'stone',
    roofMat: 'stone',
    enemy: 'tatu',
  });
  addBay(blocks, enemies, {
    cx: 20.4,
    baseY: y1,
    width: 2.3,
    height: 1.7,
    pillarMat: 'wood',
    roofMat: 'stone',
    enemy: 'porco',
  });

  const yR = addBay(blocks, enemies, {
    cx: 23.6,
    baseY: 0,
    width: 2.5,
    height: 2.1,
    pillarMat: 'stone',
    roofMat: 'wood',
    enemy: 'porco',
  });
  addTnt(blocks, 23.6, yR);

  return {
    id: 3,
    name: 'Bunker de Pedra',
    subtitle: 'Hora do Macaco Bomba de Coco mostrar serviço',
    theme: 'volcano',
    monkeys: ['bomb', 'tank', 'bomb', 'normal'],
    blocks,
    enemies,
    starThresholds: [22000, 34000, 46000],
  };
}

function buildLevel4(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  // Chain reaction TNT castle
  const y1 = addBay(blocks, enemies, {
    cx: 18.2,
    baseY: 0,
    width: 2.4,
    height: 2.0,
    pillarMat: 'wood',
    roofMat: 'wood',
    tnt: true,
  });
  const y2 = addBay(blocks, enemies, {
    cx: 21.2,
    baseY: 0,
    width: 2.5,
    height: 2.0,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'porco',
  });
  const y3 = addBay(blocks, enemies, {
    cx: 24.2,
    baseY: 0,
    width: 2.4,
    height: 2.0,
    pillarMat: 'wood',
    roofMat: 'wood',
    tnt: true,
  });

  const yMid1 = addBay(blocks, enemies, {
    cx: 19.7,
    baseY: Math.max(y1, y2),
    width: 2.5,
    height: 1.8,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'tatu',
  });
  addBay(blocks, enemies, {
    cx: 22.7,
    baseY: Math.max(y2, y3),
    width: 2.5,
    height: 1.8,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'porco',
  });
  addTnt(blocks, 19.7, yMid1);
  addEnemy(enemies, 'porco', 22.7, Math.max(y2, y3) + 1.8 + 0.38);

  return {
    id: 4,
    name: 'Castelo do TNT',
    subtitle: 'Um tiro certeiro = reação em cadeia absurda!',
    theme: 'volcano',
    monkeys: ['normal', 'triple', 'boomerang', 'bomb'],
    blocks,
    enemies,
    starThresholds: [26000, 42000, 56000],
  };
}

function buildLevel5(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  // 4-story Faria Lima corporate glass & steel tower
  const cx = 21.0;
  const f1 = addBay(blocks, enemies, {
    cx,
    baseY: 0,
    width: 3.1,
    height: 2.0,
    pillarMat: 'stone',
    roofMat: 'wood',
    enemy: 'porco',
  });
  const f2 = addBay(blocks, enemies, {
    cx,
    baseY: f1,
    width: 2.9,
    height: 1.85,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'porco',
  });
  const f3 = addBay(blocks, enemies, {
    cx,
    baseY: f2,
    width: 2.7,
    height: 1.75,
    pillarMat: 'glass',
    roofMat: 'glass',
    enemy: 'tatu',
  });
  const f4 = addBay(blocks, enemies, {
    cx,
    baseY: f3,
    width: 2.4,
    height: 1.6,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'porco',
  });
  addBox(blocks, 'glass', cx - 0.55, f4, 0.75, 0.75);
  addBox(blocks, 'glass', cx + 0.55, f4, 0.75, 0.75);

  // Side kiosk with TNT
  const k1 = addBay(blocks, enemies, {
    cx: 17.6,
    baseY: 0,
    width: 2.2,
    height: 1.8,
    pillarMat: 'glass',
    roofMat: 'glass',
    tnt: true,
  });
  addEnemy(enemies, 'porco', 17.6, k1);

  return {
    id: 5,
    name: 'Prédio da Faria Lima',
    subtitle: 'Derrube a Startup de Bananas Sintéticas!',
    theme: 'faria-lima',
    monkeys: ['triple', 'tank', 'bomb', 'boomerang'],
    blocks,
    enemies,
    starThresholds: [30000, 48000, 65000],
  };
}

function buildLevel6(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  // Armored front wall that begs for Boomerang Monkey from behind!
  addBox(blocks, 'stone', 16.5, 0, 1.1, 1.3);
  addBox(blocks, 'stone', 16.5, 1.3, 1.1, 1.3);
  addBox(blocks, 'stone', 16.5, 2.6, 1.1, 1.3);
  addBox(blocks, 'stone', 16.5, 3.9, 1.0, 1.0);

  // Back-exposed wooden & glass bridge
  const y1 = addBay(blocks, enemies, {
    cx: 19.6,
    baseY: 0,
    width: 2.6,
    height: 2.0,
    pillarMat: 'stone',
    roofMat: 'wood',
    enemy: 'tatu',
  });
  const y2 = addBay(blocks, enemies, {
    cx: 23.0,
    baseY: 0,
    width: 2.8,
    height: 2.0,
    pillarMat: 'glass',
    roofMat: 'wood',
    enemy: 'porco',
  });
  addTnt(blocks, 25.4, 0);
  addBay(blocks, enemies, {
    cx: 23.0,
    baseY: y2,
    width: 2.4,
    height: 1.7,
    pillarMat: 'glass',
    roofMat: 'glass',
    enemy: 'porco',
  });
  addEnemy(enemies, 'porco', 19.6, y1);

  return {
    id: 6,
    name: 'Muralha do Bumerangue',
    subtitle: 'Blindado na frente, frágil nas costas — use o Bumerangue!',
    theme: 'faria-lima',
    monkeys: ['boomerang', 'boomerang', 'tank', 'bomb'],
    blocks,
    enemies,
    starThresholds: [26000, 41000, 54000],
  };
}

function buildLevel7(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  // Stepped pyramid with TNT core
  const y1 = addBay(blocks, enemies, {
    cx: 18.0,
    baseY: 0,
    width: 2.4,
    height: 1.9,
    pillarMat: 'stone',
    roofMat: 'wood',
    enemy: 'porco',
  });
  const y2 = addBay(blocks, enemies, {
    cx: 21.0,
    baseY: 0,
    width: 2.6,
    height: 1.9,
    pillarMat: 'wood',
    roofMat: 'wood',
    tnt: true,
  });
  const y3 = addBay(blocks, enemies, {
    cx: 24.0,
    baseY: 0,
    width: 2.4,
    height: 1.9,
    pillarMat: 'stone',
    roofMat: 'wood',
    enemy: 'tatu',
  });

  const m1 = addBay(blocks, enemies, {
    cx: 19.5,
    baseY: Math.max(y1, y2),
    width: 2.5,
    height: 1.8,
    pillarMat: 'wood',
    roofMat: 'stone',
    enemy: 'tatu',
  });
  const m2 = addBay(blocks, enemies, {
    cx: 22.5,
    baseY: Math.max(y2, y3),
    width: 2.5,
    height: 1.8,
    pillarMat: 'wood',
    roofMat: 'stone',
    enemy: 'porco',
  });

  addBay(blocks, enemies, {
    cx: 21.0,
    baseY: Math.max(m1, m2),
    width: 2.3,
    height: 1.7,
    pillarMat: 'glass',
    roofMat: 'glass',
    enemy: 'porco',
  });

  return {
    id: 7,
    name: 'Pirâmide do Calote',
    subtitle: 'Um esquema piramidal pronto pra desabar',
    theme: 'volcano',
    monkeys: ['tank', 'bomb', 'triple', 'boomerang', 'normal'],
    blocks,
    enemies,
    starThresholds: [34000, 52000, 68000],
  };
}

function buildLevel8(): LevelDef {
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  // Epic Final Boss Fortress
  const yL = addBay(blocks, enemies, {
    cx: 17.8,
    baseY: 0,
    width: 2.5,
    height: 2.1,
    pillarMat: 'stone',
    roofMat: 'stone',
    enemy: 'tatu',
  });
  const yC = addBay(blocks, enemies, {
    cx: 21.2,
    baseY: 0,
    width: 3.1,
    height: 2.3,
    pillarMat: 'stone',
    roofMat: 'wood',
    enemy: 'boss_porco',
  });
  const yR = addBay(blocks, enemies, {
    cx: 24.6,
    baseY: 0,
    width: 2.5,
    height: 2.1,
    pillarMat: 'stone',
    roofMat: 'stone',
    enemy: 'tatu',
  });

  // Upper floor above Boss
  const topC = addBay(blocks, enemies, {
    cx: 21.2,
    baseY: yC,
    width: 2.7,
    height: 1.8,
    pillarMat: 'glass',
    roofMat: 'wood',
    tnt: true,
  });
  addEnemy(enemies, 'porco', 17.8, yL);
  addEnemy(enemies, 'porco', 24.6, yR);
  addBay(blocks, enemies, {
    cx: 21.2,
    baseY: topC,
    width: 2.2,
    height: 1.5,
    pillarMat: 'glass',
    roofMat: 'glass',
    enemy: 'porco',
  });

  return {
    id: 8,
    name: 'Fortaleza do Porco CEO',
    subtitle: 'CHEFE FINAL: Acabe com o monopólio das bananas!',
    theme: 'faria-lima',
    monkeys: ['bomb', 'tank', 'triple', 'boomerang', 'bomb'],
    blocks,
    enemies,
    starThresholds: [42000, 64000, 82000],
  };
}

export const HANDCRAFTED_LEVELS: LevelDef[] = [
  buildLevel1(),
  buildLevel2(),
  buildLevel3(),
  buildLevel4(),
  buildLevel5(),
  buildLevel6(),
  buildLevel7(),
  buildLevel8(),
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateInfiniteLevel(wave: number, seed: number): LevelDef {
  const rng = mulberry32(seed + wave * 9973);
  const blocks: LevelBlockDef[] = [];
  const enemies: LevelEnemyDef[] = [];

  const themes: LevelDef['theme'][] = ['jungle', 'faria-lima', 'volcano'];
  const theme = themes[(wave - 1) % themes.length];
  const materials: MaterialKind[] = ['glass', 'wood', 'stone'];

  const bayCount = Math.min(4, 2 + Math.floor((wave + 1) / 2));
  const startX = 17.4;
  const stepX = 3.1;

  const pickMat = (biasStone = 0): MaterialKind => {
    const r = rng() + biasStone;
    if (r < 0.34) return 'glass';
    if (r < 0.72) return 'wood';
    return 'stone';
  };

  for (let i = 0; i < bayCount; i++) {
    const cx = startX + i * stepX;
    const floors = 1 + Math.floor(rng() * Math.min(3, 1 + Math.floor(wave / 2)));
    let curY = 0;

    for (let f = 0; f < floors; f++) {
      const pMat = pickMat(f === 0 ? 0.15 : -0.1);
      const rMat = pickMat(0);
      const isBoss = wave % 3 === 0 && i === Math.floor(bayCount / 2) && f === 0;
      const putTnt = !isBoss && rng() < 0.24;
      const enemyKind: EnemyKind | undefined = putTnt
        ? undefined
        : isBoss
          ? 'boss_porco'
          : rng() < 0.36
            ? 'tatu'
            : 'porco';

      curY = addBay(blocks, enemies, {
        cx,
        baseY: curY,
        width: isBoss ? 2.9 : 2.55,
        height: f === 0 ? 2.05 : 1.75,
        pillarMat: pMat,
        roofMat: rMat,
        enemy: enemyKind,
        tnt: putTnt,
      });
    }

    if (rng() < 0.4) {
      addEnemy(enemies, rng() < 0.5 ? 'porco' : 'tatu', cx, curY);
    }
  }

  // Ensure at least 2 enemies exist
  if (enemies.length === 0) {
    addEnemy(enemies, 'porco', startX, 0);
    addEnemy(enemies, 'tatu', startX + stepX, 0);
  }

  // Optional front barricade on higher waves
  if (wave >= 2 && rng() < 0.55) {
    const shieldMat = materials[Math.floor(rng() * materials.length)];
    addBox(blocks, shieldMat, 15.2, 0, 0.95, 1.2);
    if (rng() < 0.5) addBox(blocks, shieldMat, 15.2, 1.2, 0.95, 1.2);
  }

  const allKinds: MonkeyKind[] = ['normal', 'triple', 'bomb', 'tank', 'boomerang'];
  const monkeyCount = Math.min(6, Math.max(4, enemies.length + 1));
  const monkeys: MonkeyKind[] = [];
  for (let i = 0; i < monkeyCount; i++) {
    monkeys.push(allKinds[Math.floor(rng() * allKinds.length)]);
  }

  const enemyScoreSum = enemies.reduce((acc, e) => acc + ENEMY_SPECS[e.kind].scoreValue, 0);

  return {
    id: 100 + wave,
    name: `Demolição Infinita #${wave}`,
    subtitle: `Fortaleza procedural (Seed ${seed})`,
    theme,
    monkeys,
    blocks,
    enemies,
    starThresholds: [
      Math.round(enemyScoreSum * 0.95),
      Math.round(enemyScoreSum * 1.25),
      Math.round(enemyScoreSum * 1.55),
    ],
    isInfinite: true,
    seed,
  };
}
