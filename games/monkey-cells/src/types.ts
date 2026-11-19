export type WeaponId =
  | 'banana_sword'
  | 'frying_pan'
  | 'havaiana_boomerang'
  | 'sacred_branch';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  shortName: string;
  description: string;
  damage: number;
  cooldown: number;
  rangeX: number;
  rangeY: number;
  pogoBoost: number;
  airCritMultiplier: number;
  knockback: number;
  color: string;
  isBoomerang?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  banana_sword: {
    id: 'banana_sword',
    name: 'Espada de Banana Afiada',
    shortName: 'Banana Afiada',
    description: 'Equilibrada, rápida e cheia de potássio cortante.',
    damage: 24,
    cooldown: 0.24,
    rangeX: 66,
    rangeY: 50,
    pogoBoost: 1.0,
    airCritMultiplier: 1.0,
    knockback: 260,
    color: '#facc15',
  },
  frying_pan: {
    id: 'frying_pan',
    name: 'Frigideira da Vó (Crítico)',
    shortName: 'Frigideira da Vó',
    description: 'Pesada! Som de panelada e CRÍTICO 2.4x em inimigos no ar!',
    damage: 34,
    cooldown: 0.42,
    rangeX: 64,
    rangeY: 56,
    pogoBoost: 1.05,
    airCritMultiplier: 2.4,
    knockback: 420,
    color: '#94a3b8',
  },
  havaiana_boomerang: {
    id: 'havaiana_boomerang',
    name: 'Chinelo Havaianas Bumerangue',
    shortName: 'Havaianas',
    description: 'Arremessa um chinelo teleguiado que acerta na ida e na volta!',
    damage: 22,
    cooldown: 0.34,
    rangeX: 56,
    rangeY: 48,
    pogoBoost: 1.0,
    airCritMultiplier: 1.1,
    knockback: 220,
    color: '#38bdf8',
    isBoomerang: true,
  },
  sacred_branch: {
    id: 'sacred_branch',
    name: 'Galho Sagrado de 3 Pontas',
    shortName: 'Galho 3 Pontas',
    description: 'Alcance absurdo! Perfeito pra dar Pogo-Jump infinito nos inimigos!',
    damage: 26,
    cooldown: 0.30,
    rangeX: 90,
    rangeY: 72,
    pogoBoost: 1.24,
    airCritMultiplier: 1.25,
    knockback: 280,
    color: '#4ade80',
  },
};

export type UpgradeId =
  | 'pogo_spring'
  | 'explosive_peel'
  | 'acai_heart'
  | 'bald_crit'
  | 'potassium_turbo'
  | 'wind_cape'
  | 'chili_thorns'
  | 'clt_bonus';

export interface UpgradeDef {
  id: UpgradeId;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'pogo_spring',
    title: '+25% Dano no Pogo',
    subtitle: 'Mola de Bananeira: Pogo causa +25% de dano e quica mais alto!',
    emoji: '🦘',
    color: '#4ade80',
  },
  {
    id: 'explosive_peel',
    title: 'Dash Solta Casca Explosiva',
    subtitle: 'Seu rolamento deixa uma casca-bomba que explode nos inimigos!',
    emoji: '💣',
    color: '#facc15',
  },
  {
    id: 'acai_heart',
    title: 'Coração de Açaí +2 HP',
    subtitle: 'Aumenta sua vida máxima em +2 corações e cura tudo na hora!',
    emoji: '🫐',
    color: '#c084fc',
  },
  {
    id: 'bald_crit',
    title: 'Crítico do Macaco Calvo',
    subtitle: '28% de chance de reflexo solar na careca causar CRÍTICO 2x!',
    emoji: '✨',
    color: '#fb923c',
  },
  {
    id: 'potassium_turbo',
    title: 'Vitamina de Potássio',
    subtitle: 'Ganha +50% mais Potássio por golpe e come banana 2x mais rápido!',
    emoji: '🍌',
    color: '#fde047',
  },
  {
    id: 'wind_cape',
    title: 'Capa Folha Turbo',
    subtitle: 'Cooldown do Dash -30% e velocidade de ataque +20%!',
    emoji: '🍃',
    color: '#34d399',
  },
  {
    id: 'chili_thorns',
    title: 'Pimenta Malagueta',
    subtitle: 'Ao tomar dano, libera uma explosão ardida em volta!',
    emoji: '🌶️',
    color: '#fb7185',
  },
  {
    id: 'clt_bonus',
    title: 'Vale-Alimentação',
    subtitle: 'Inimigos dropam +1 banana extra e você ganha +25% de pontos!',
    emoji: '💳',
    color: '#38bdf8',
  },
];

export type SwingDir = 'right' | 'left' | 'up' | 'down';

export interface PlatformRect {
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay?: boolean;
}

export interface SpikeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChestEntity {
  id: string;
  x: number;
  y: number;
  weaponId: WeaponId;
  opened: boolean;
}

export interface CrateEntity {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  broken: boolean;
}

export type EnemyKind = 'nerd_bat' | 'clt_beetle' | 'coco_archer' | 'bouncy_frog' | 'gorilla_ceo';

export interface EnemyEntity {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  grounded: boolean;
  state: 'patrol' | 'windup' | 'attack' | 'recover' | 'dizzy';
  stateTimer: number;
  aiTick: number;
  hitFlash: number;
  /** Boss specific */
  phase: 1 | 2;
  attackPattern: number;
  targetX?: number;
}

export interface EnemyProjectile {
  id: string;
  kind: 'coconut' | 'stock_chart' | 'shockwave';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  dmg: number;
  life: number;
  label?: string;
  dir?: 1 | -1;
}

export interface TelegraphMarker {
  id: string;
  kind: 'rain' | 'stomp' | 'dash';
  x: number;
  y: number;
  w: number;
  h: number;
  timer: number;
  maxTimer: number;
}

export interface PickupBanana {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  value: number;
  isHeart?: boolean;
}

export interface BoomerangEntity {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  returning: boolean;
  angle: number;
  hitIds: Set<string>;
}

export interface PeelBomb {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vy: number;
  fuse: number;
  exploded: boolean;
}

export interface RoomTheme {
  name: string;
  subtitle: string;
  skyTop: string;
  skyBottom: string;
  wallColor: string;
  tileTop: string;
  tileBody: string;
  accent: string;
}

export interface RoomData {
  index: number;
  width: number;
  height: number;
  theme: RoomTheme;
  spawnX: number;
  spawnY: number;
  portalX: number;
  portalY: number;
  platforms: PlatformRect[];
  spikes: SpikeRect[];
  chests: ChestEntity[];
  crates: CrateEntity[];
  enemies: EnemyEntity[];
  isBossRoom: boolean;
}

export interface RemotePlayerState {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  weapon: WeaponId;
  downed: boolean;
  reviveTimer: number;
  swingTimer: number;
  swingDir: SwingDir;
  dashTimer: number;
  healing: boolean;
  hitFlash: number;
  lastSeen: number;
  roomIndex: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity?: number;
  kind?: 'dot' | 'leaf' | 'banana' | 'ring' | 'spark';
  rot?: number;
  vrot?: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export type NetMessage =
  | { type: 'run_start'; seed: number; friendlyKnockback: boolean }
  | {
      type: 'player_state';
      state: Omit<RemotePlayerState, 'id' | 'name' | 'color' | 'lastSeen'>;
    }
  | { type: 'player_attack'; dir: SwingDir; weapon: WeaponId; x: number; y: number }
  | {
      type: 'enemy_hit';
      enemyId: string;
      dmg: number;
      kbX: number;
      kbY: number;
      isCrit: boolean;
      isPogo: boolean;
    }
  | { type: 'friendly_knockback'; targetId: string; kbX: number; kbY: number }
  | { type: 'revive_player'; targetId: string }
  | { type: 'room_advance'; roomIndex: number; seed: number }
  | { type: 'chest_open'; chestId: string }
  | { type: 'crate_break'; crateId: string }
  | { type: 'toggle_fk'; enabled: boolean }
  | {
      type: 'world_snapshot';
      roomIndex: number;
      roomCleared: boolean;
      enemies: Array<{
        id: string;
        kind: EnemyKind;
        x: number;
        y: number;
        vx: number;
        vy: number;
        hp: number;
        maxHp: number;
        facing: 1 | -1;
        state: EnemyEntity['state'];
        stateTimer: number;
        phase: 1 | 2;
        attackPattern: number;
      }>;
      projectiles: EnemyProjectile[];
      telegraphs: TelegraphMarker[];
    };
