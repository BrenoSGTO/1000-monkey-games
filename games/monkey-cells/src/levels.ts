import type {
  ChestEntity,
  CrateEntity,
  EnemyEntity,
  EnemyKind,
  PlatformRect,
  RoomData,
  RoomTheme,
  SpikeRect,
  WeaponId,
} from './types';

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DUNGEON_THEMES: RoomTheme[] = [
  {
    name: 'Sala 1: Esgoto das Cascas',
    shortLabel: 'Sala 1',
    subtitle: 'Onde as bananas escorregam e os morcegos falam de cripto',
    skyTop: '#0b101d',
    skyBottom: '#1a2736',
    wallColor: '#141d29',
    tileTop: '#4ade80',
    tileBody: '#1e293b',
    accent: '#4ade80',
  },
  {
    name: 'Sala 2: Galpão dos Boomers',
    shortLabel: 'Sala 2',
    subtitle: 'Escale as paredes e desvie (ou dê Parry!) nos cocos teleguiados',
    skyTop: '#160d24',
    skyBottom: '#2d163b',
    wallColor: '#1f1230',
    tileTop: '#f59e0b',
    tileBody: '#2b1e3e',
    accent: '#f59e0b',
  },
  {
    name: 'Sala 3: Cofre do Tesouro',
    shortLabel: 'Tesouro',
    subtitle: 'Baús de armas raras, caixotes dourados e armadilha de Pogo!',
    skyTop: '#0d1d24',
    skyBottom: '#15323d',
    wallColor: '#0f252e',
    tileTop: '#22d3ee',
    tileBody: '#162c38',
    accent: '#22d3ee',
  },
  {
    name: 'Sala 4: RH — Entrevista Eliminatória',
    shortLabel: 'Mini-Boss',
    subtitle: 'MINI-BOSS: Gerente de RH Babuíno (Carimbo & Currículos)!',
    skyTop: '#240b18',
    skyBottom: '#3c1421',
    wallColor: '#2a101b',
    tileTop: '#fb7185',
    tileBody: '#331824',
    accent: '#fb7185',
  },
  {
    name: 'Sala 5: Cobertura da Faria Lima',
    shortLabel: 'BOSS CEO',
    subtitle: 'CHEFE FINAL — O GORILÃO DE TERNO (CEO)',
    skyTop: '#140c08',
    skyBottom: '#331810',
    wallColor: '#1f110c',
    tileTop: '#facc15',
    tileBody: '#292524',
    accent: '#facc15',
  },
];

const ARENA_THEME: RoomTheme = {
  name: '🥊 Arena Bananada',
  shortLabel: 'Arena PvP',
  subtitle: 'X1 de Pogo, Parry e Chinelada — Sem piedade!',
  skyTop: '#1a0b24',
  skyBottom: '#35143b',
  wallColor: '#240f2e',
  tileTop: '#facc15',
  tileBody: '#2e1a3d',
  accent: '#facc15',
};

export const WEAPON_POOL: WeaponId[] = [
  'frying_pan',
  'havaiana_boomerang',
  'sacred_branch',
  'electric_broom',
  'banana_bazooka',
  'banana_sword',
];

function makeEnemy(id: string, kind: EnemyKind, x: number, y: number, playerCount = 1): EnemyEntity {
  const coopScale = 1 + Math.max(0, playerCount - 1) * 0.48;
  const stats: Record<EnemyKind, { w: number; h: number; hp: number }> = {
    nerd_bat: { w: 38, h: 32, hp: 46 },
    clt_beetle: { w: 46, h: 38, hp: 82 },
    coco_archer: { w: 36, h: 42, hp: 52 },
    bouncy_frog: { w: 42, h: 36, hp: 64 },
    hr_baboon: { w: 68, h: 82, hp: 440 },
    gorilla_ceo: { w: 112, h: 124, hp: 960 },
  };
  const s = stats[kind];
  const bossScale = 1 + Math.max(0, playerCount - 1) * 0.45;
  const isBoss = kind === 'gorilla_ceo' || kind === 'hr_baboon';
  const maxHp = Math.round(s.hp * (isBoss ? bossScale : coopScale));
  return {
    id,
    kind,
    x,
    y,
    w: s.w,
    h: s.h,
    vx: 0,
    vy: 0,
    hp: maxHp,
    maxHp,
    facing: -1,
    grounded: false,
    state: 'patrol',
    stateTimer: 0.8,
    aiTick: 0,
    hitFlash: 0,
    stunTimer: 0,
    phase: 1,
    attackPattern: 0,
  };
}

export function generateRoom(roomIndex: number, baseSeed: number, playerCount = 1): RoomData {
  const rng = createRng(baseSeed + roomIndex * 7919);
  const theme = DUNGEON_THEMES[Math.min(roomIndex, DUNGEON_THEMES.length - 1)];

  if (roomIndex === 4) {
    // FINAL BOSS ROOM: Cobertura da Faria Lima
    const width = 1440;
    const height = 760;
    const floorY = 660;
    const platforms: PlatformRect[] = [
      { x: 0, y: floorY, w: width, h: 100 },
      { x: 0, y: 0, w: 40, h: height },
      { x: width - 40, y: 0, w: 40, h: height },
      { x: 0, y: 0, w: width, h: 40 },
      // Elevated catwalks for dodging & pogo setups
      { x: 150, y: 505, w: 220, h: 20, oneWay: true },
      { x: width - 370, y: 505, w: 220, h: 20, oneWay: true },
      { x: width / 2 - 130, y: 390, w: 260, h: 20, oneWay: true },
    ];

    const crates: CrateEntity[] = [
      { id: 'r4_c1', x: 96, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
      { id: 'r4_c2', x: width - 132, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
    ];

    const boss = makeEnemy('boss_gorilla_ceo', 'gorilla_ceo', width - 290, floorY - 124, playerCount);

    return {
      index: roomIndex,
      width,
      height,
      theme,
      spawnX: 160,
      spawnY: floorY - 56,
      portalX: width - 130,
      portalY: floorY - 96,
      platforms,
      spikes: [],
      chests: [],
      crates,
      enemies: [boss],
      isBossRoom: true,
    };
  }

  if (roomIndex === 3) {
    // MINI-BOSS ROOM: Gerente de RH Babuíno
    const width = 1380;
    const height = 760;
    const floorY = 660;
    const platforms: PlatformRect[] = [
      { x: 0, y: floorY, w: width, h: 100 },
      { x: 0, y: 0, w: 40, h: height },
      { x: width - 40, y: 0, w: 40, h: height },
      { x: 0, y: 0, w: width, h: 40 },
      { x: 180, y: 515, w: 200, h: 20, oneWay: true },
      { x: width - 380, y: 515, w: 200, h: 20, oneWay: true },
      { x: width / 2 - 110, y: 410, w: 220, h: 20, oneWay: true },
    ];

    const crates: CrateEntity[] = [
      { id: 'r3_c1', x: 110, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
      { id: 'r3_c2', x: width - 146, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
    ];

    const miniBoss = makeEnemy('miniboss_hr_baboon', 'hr_baboon', width - 280, floorY - 82, playerCount);
    // Side helper bat in higher player count or for parry fun
    const enemies: EnemyEntity[] = [miniBoss];
    if (playerCount >= 2) {
      enemies.push(makeEnemy('r3_minion_bat', 'nerd_bat', width / 2, 260, playerCount));
    }

    return {
      index: roomIndex,
      width,
      height,
      theme,
      spawnX: 140,
      spawnY: floorY - 56,
      portalX: width - 130,
      portalY: floorY - 96,
      platforms,
      spikes: [],
      chests: [],
      crates,
      enemies,
      isBossRoom: false,
      isMiniBossRoom: true,
    };
  }

  if (roomIndex === 2) {
    // TREASURE ROOM: Cofre do Tesouro
    const width = 1620;
    const height = 760;
    const floorY = 665;
    const platforms: PlatformRect[] = [
      { x: 0, y: 0, w: width, h: 40 },
      { x: 0, y: 0, w: 40, h: height },
      { x: width - 40, y: 0, w: 40, h: height },
      { x: 0, y: floorY, w: width, h: 95 },
      // Treasure platforms & spike pogo bridge
      { x: 310, y: floorY - 125, w: 180, h: 20, oneWay: true },
      { x: 590, y: floorY - 220, w: 240, h: 20, oneWay: true },
      { x: 930, y: floorY - 130, w: 190, h: 20, oneWay: true },
      { x: 1180, y: floorY - 230, w: 170, h: 20, oneWay: true },
    ];

    const spikes: SpikeRect[] = [
      { x: 560, y: floorY - 22, w: 290, h: 22 },
    ];

    const weapon1 = rng() < 0.5 ? 'electric_broom' : 'banana_bazooka';
    const weapon2 = WEAPON_POOL[Math.floor(rng() * WEAPON_POOL.length)];
    const chests: ChestEntity[] = [
      {
        id: 'r2_chest_1',
        x: 688,
        y: floorY - 220 - 34,
        weaponId: weapon1,
        opened: false,
      },
      {
        id: 'r2_chest_2',
        x: 1244,
        y: floorY - 230 - 34,
        weaponId: weapon2 === weapon1 ? 'frying_pan' : weapon2,
        opened: false,
      },
    ];

    const crates: CrateEntity[] = [
      { id: 'r2_cr0', x: 350, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
      { id: 'r2_cr1', x: 400, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
      { id: 'r2_cr2', x: 640, y: floorY - 220 - 38, w: 36, h: 38, hp: 1, broken: false },
      { id: 'r2_cr3', x: 1010, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
      { id: 'r2_cr4', x: 1060, y: floorY - 38, w: 36, h: 38, hp: 1, broken: false },
    ];

    const enemies: EnemyEntity[] = [
      makeEnemy('r2_guard0', 'clt_beetle', 430, floorY - 42, playerCount),
      makeEnemy('r2_guard1', 'coco_archer', 990, floorY - 175, playerCount),
      makeEnemy('r2_guard2', 'nerd_bat', 710, floorY - 340, playerCount),
    ];

    return {
      index: roomIndex,
      width,
      height,
      theme,
      spawnX: 120,
      spawnY: floorY - 56,
      portalX: width - 135,
      portalY: floorY - 96,
      platforms,
      spikes,
      chests,
      crates,
      enemies,
      isBossRoom: false,
      isTreasureRoom: true,
    };
  }

  // Procedural rooms 0 & 1
  const width = 2240 + roomIndex * 160;
  const height = 780;
  const floorY = 670;

  const platforms: PlatformRect[] = [
    { x: 0, y: 0, w: width, h: 40 },
    { x: 0, y: 0, w: 40, h: height },
    { x: width - 40, y: 0, w: 40, h: height },
    { x: 0, y: floorY, w: width, h: 110 },
  ];

  const spikes: SpikeRect[] = [];
  const chests: ChestEntity[] = [];
  const crates: CrateEntity[] = [];
  const enemies: EnemyEntity[] = [];

  // Ensure new weapons also appear in early chests!
  const earlyWeapons: WeaponId[] = [
    'electric_broom',
    'banana_bazooka',
    'frying_pan',
    'havaiana_boomerang',
    'sacred_branch',
  ];
  const chestWeapon = earlyWeapons[(roomIndex + Math.floor(rng() * earlyWeapons.length)) % earlyWeapons.length];

  const chunkStart = 380;
  const chunkSpan = (width - 660) / 4;
  let enemyCounter = 0;
  let crateCounter = 0;

  for (let c = 0; c < 4; c++) {
    const cx = Math.round(chunkStart + c * chunkSpan);
    const pattern = (Math.floor(rng() * 3) + c + roomIndex) % 4;

    if (pattern === 0) {
      const spikeW = 140 + roomIndex * 18;
      spikes.push({ x: cx + 60, y: floorY - 22, w: spikeW, h: 22 });
      platforms.push({ x: cx + 30, y: floorY - 130, w: 140, h: 20, oneWay: true });
      platforms.push({ x: cx + 190, y: floorY - 220, w: 150, h: 20, oneWay: true });

      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'nerd_bat', cx + 140, floorY - 280, playerCount),
      );
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'bouncy_frog', cx + 250, floorY - 40, playerCount),
      );
    } else if (pattern === 1) {
      const pillarH = 230 + Math.round(rng() * 40);
      platforms.push({ x: cx + 130, y: floorY - pillarH, w: 56, h: pillarH });
      platforms.push({ x: cx + 240, y: floorY - 140, w: 150, h: 20, oneWay: true });
      platforms.push({ x: cx - 10, y: floorY - 170, w: 120, h: 20, oneWay: true });

      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'coco_archer', cx + 290, floorY - 185, playerCount),
      );
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'clt_beetle', cx + 220, floorY - 42, playerCount),
      );
    } else if (pattern === 2) {
      platforms.push({ x: cx + 30, y: floorY - 120, w: 190, h: 20, oneWay: true });
      platforms.push({ x: cx + 140, y: floorY - 250, w: 180, h: 20, oneWay: true });
      spikes.push({ x: cx + 250, y: floorY - 22, w: 96, h: 22 });

      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'clt_beetle', cx + 90, floorY - 42, playerCount),
      );
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'nerd_bat', cx + 210, floorY - 310, playerCount),
      );
      if (roomIndex >= 1) {
        enemies.push(
          makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'coco_archer', cx + 210, floorY - 295, playerCount),
        );
      }
    } else {
      platforms.push({ x: cx + 40, y: floorY - 90, w: 130, h: 90 });
      platforms.push({ x: cx + 220, y: floorY - 180, w: 170, h: 20, oneWay: true });
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'bouncy_frog', cx + 280, floorY - 40, playerCount),
      );
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'nerd_bat', cx + 120, floorY - 240, playerCount),
      );
    }

    if (c === 1) {
      const chestPlatX = cx + 60;
      const chestPlatY = floorY - 295;
      platforms.push({ x: chestPlatX, y: chestPlatY, w: 160, h: 20, oneWay: true });
      chests.push({
        id: `r${roomIndex}_chest`,
        x: chestPlatX + 60,
        y: chestPlatY - 34,
        weaponId: chestWeapon,
        opened: false,
      });
    }

    if (c === 0 || c === 2 || c === 3) {
      crates.push({
        id: `r${roomIndex}_cr${crateCounter++}`,
        x: cx + 24,
        y: floorY - 38,
        w: 36,
        h: 38,
        hp: 1,
        broken: false,
      });
    }
  }

  return {
    index: roomIndex,
    width,
    height,
    theme,
    spawnX: 130,
    spawnY: floorY - 56,
    portalX: width - 140,
    portalY: floorY - 96,
    platforms,
    spikes,
    chests,
    crates,
    enemies,
    isBossRoom: false,
  };
}

export function generateArenaRoom(seed: number): RoomData {
  const rng = createRng(seed + 999);
  const width = 1280;
  const height = 720;
  const floorY = 635;

  const platforms: PlatformRect[] = [
    { x: 0, y: 0, w: width, h: 40 },
    { x: 0, y: 0, w: 40, h: height },
    { x: width - 40, y: 0, w: 40, h: height },
    { x: 0, y: floorY, w: width, h: 85 },
    // Side walls / step ledges for wall-jump escapes
    { x: 90, y: floorY - 90, w: 110, h: 90 },
    { x: width - 200, y: floorY - 90, w: 110, h: 90 },
    // Mid catwalks
    { x: 240, y: floorY - 155, w: 210, h: 20, oneWay: true },
    { x: width - 450, y: floorY - 155, w: 210, h: 20, oneWay: true },
    // Top center duel bridge
    { x: width / 2 - 150, y: floorY - 275, w: 300, h: 20, oneWay: true },
  ];

  const spikes: SpikeRect[] = [
    // Small central spike hazard for dramatic Pogo clutches!
    { x: width / 2 - 64, y: floorY - 20, w: 128, h: 20 },
  ];

  const w1 = WEAPON_POOL[Math.floor(rng() * WEAPON_POOL.length)];
  const w2 = WEAPON_POOL[(WEAPON_POOL.indexOf(w1) + 2) % WEAPON_POOL.length];

  const chests: ChestEntity[] = [
    { id: 'arena_c1', x: 324, y: floorY - 155 - 34, weaponId: w1, opened: false },
    { id: 'arena_c2', x: width - 366, y: floorY - 155 - 34, weaponId: w2, opened: false },
  ];

  const crates: CrateEntity[] = [
    { id: 'arena_cr1', x: width / 2 - 18, y: floorY - 275 - 38, w: 36, h: 38, hp: 1, broken: false },
  ];

  return {
    index: 0,
    width,
    height,
    theme: ARENA_THEME,
    spawnX: 220,
    spawnY: floorY - 56,
    portalX: width / 2,
    portalY: floorY - 275 - 60,
    platforms,
    spikes,
    chests,
    crates,
    enemies: [],
    isBossRoom: false,
    isArenaRoom: true,
  };
}
