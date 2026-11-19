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

const THEMES: RoomTheme[] = [
  {
    name: 'Sala 1: Esgoto das Cascas',
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
    subtitle: 'Escale as paredes e desvie dos cocos teleguiados',
    skyTop: '#160d24',
    skyBottom: '#2d163b',
    wallColor: '#1f1230',
    tileTop: '#f59e0b',
    tileBody: '#2b1e3e',
    accent: '#f59e0b',
  },
  {
    name: 'Sala 3: Escritório Subterrâneo',
    subtitle: 'Besouros CLT blindados defendendo a planilha do mês',
    skyTop: '#0e1726',
    skyBottom: '#1f2937',
    wallColor: '#131d2d',
    tileTop: '#38bdf8',
    tileBody: '#1e293b',
    accent: '#38bdf8',
  },
  {
    name: 'Sala 4: Antecâmara do Vale-Refeição',
    subtitle: 'Último teste antes da cobertura da Faria Lima!',
    skyTop: '#240b18',
    skyBottom: '#3c1421',
    wallColor: '#2a101b',
    tileTop: '#fb7185',
    tileBody: '#331824',
    accent: '#fb7185',
  },
  {
    name: 'Sala 5: Cobertura da Faria Lima',
    subtitle: 'CHEFE FINAL — O GORILÃO DE TERNO (CEO)',
    skyTop: '#140c08',
    skyBottom: '#331810',
    wallColor: '#1f110c',
    tileTop: '#facc15',
    tileBody: '#292524',
    accent: '#facc15',
  },
];

const WEAPON_POOL: WeaponId[] = [
  'frying_pan',
  'havaiana_boomerang',
  'sacred_branch',
  'banana_sword',
];

function makeEnemy(id: string, kind: EnemyKind, x: number, y: number, playerCount = 1): EnemyEntity {
  const coopScale = 1 + Math.max(0, playerCount - 1) * 0.45;
  const stats: Record<EnemyKind, { w: number; h: number; hp: number }> = {
    nerd_bat: { w: 38, h: 32, hp: 46 },
    clt_beetle: { w: 46, h: 38, hp: 82 },
    coco_archer: { w: 36, h: 42, hp: 52 },
    bouncy_frog: { w: 42, h: 36, hp: 64 },
    gorilla_ceo: { w: 112, h: 124, hp: 920 },
  };
  const s = stats[kind];
  const maxHp = Math.round(s.hp * (kind === 'gorilla_ceo' ? 1 + Math.max(0, playerCount - 1) * 0.4 : coopScale));
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
    phase: 1,
    attackPattern: 0,
  };
}

export function generateRoom(roomIndex: number, baseSeed: number, playerCount = 1): RoomData {
  const rng = createRng(baseSeed + roomIndex * 7919);
  const theme = THEMES[Math.min(roomIndex, THEMES.length - 1)];

  if (roomIndex === 4) {
    // BOSS ROOM: Cobertura da Faria Lima
    const width = 1440;
    const height = 760;
    const floorY = 660;
    const platforms: PlatformRect[] = [
      // Outer arena shell
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

  // Procedural rooms 0..3
  const width = 2280 + roomIndex * 140;
  const height = 780;
  const floorY = 670;

  const platforms: PlatformRect[] = [
    // Ceiling & walls
    { x: 0, y: 0, w: width, h: 40 },
    { x: 0, y: 0, w: 40, h: height },
    { x: width - 40, y: 0, w: 40, h: height },
    // Main floor segments with procedural gaps/pits
    { x: 0, y: floorY, w: width, h: 110 },
  ];

  const spikes: SpikeRect[] = [];
  const chests: ChestEntity[] = [];
  const crates: CrateEntity[] = [];
  const enemies: EnemyEntity[] = [];

  // Choose weapon for this room's chest deterministically
  const chestWeapon = WEAPON_POOL[(roomIndex + Math.floor(rng() * 3)) % WEAPON_POOL.length];

  // Build 4 procedural chunks across the room
  const chunkStart = 380;
  const chunkSpan = (width - 660) / 4;
  let enemyCounter = 0;
  let crateCounter = 0;

  for (let c = 0; c < 4; c++) {
    const cx = Math.round(chunkStart + c * chunkSpan);
    const pattern = (Math.floor(rng() * 3) + c + roomIndex) % 4;

    if (pattern === 0) {
      // Pogo Spike Pit + Mid Floating Platforms
      const spikeW = 140 + roomIndex * 16;
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
      // Wall-Jump Pillar Shaft
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
      // Multi-tier Catwalk + Crate Alcove
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
      // Arena Step + Jumping Frogs
      platforms.push({ x: cx + 40, y: floorY - 90, w: 130, h: 90 });
      platforms.push({ x: cx + 220, y: floorY - 180, w: 170, h: 20, oneWay: true });
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'bouncy_frog', cx + 280, floorY - 40, playerCount),
      );
      enemies.push(
        makeEnemy(`r${roomIndex}_e${enemyCounter++}`, 'nerd_bat', cx + 120, floorY - 240, playerCount),
      );
    }

    // Place weapon chest in chunk 1 or 2 on a nice platform
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

    // Banana crates
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

  // Extra difficulty enemies for rooms 2 & 3
  if (roomIndex >= 2) {
    enemies.push(
      makeEnemy(`r${roomIndex}_extra1`, 'clt_beetle', width - 520, floorY - 42, playerCount),
    );
  }
  if (roomIndex >= 3) {
    enemies.push(
      makeEnemy(`r${roomIndex}_extra2`, 'bouncy_frog', width - 410, floorY - 42, playerCount),
      makeEnemy(`r${roomIndex}_extra3`, 'nerd_bat', width - 640, floorY - 260, playerCount),
    );
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
