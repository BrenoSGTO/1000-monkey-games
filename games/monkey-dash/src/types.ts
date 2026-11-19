export const TILE = 40;
export const ARENA_ROWS = 12;
export const GROUND_Y = ARENA_ROWS * TILE; // 480
export const CEILING_Y = 0;

export const PLAYER_SIZE = 34;
export const WAVE_HITBOX_SIZE = 18;
export const FIXED_DT = 1 / 60;
export const RESPAWN_DELAY = 0.35;

export const BASE_SPEED = 360; // px/s (9 tiles/sec)
export const CUBE_GRAVITY = 2850;
export const CUBE_JUMP_VEL = -760;
export const PAD_YELLOW_VEL = -1080;
export const ORB_YELLOW_VEL = -760;

export const SHIP_GRAVITY = 1550;
export const SHIP_THRUST = -1950;
export const SHIP_MAX_VY = 540;

export const BALL_GRAVITY = 2650;
export const BALL_MAX_VY = 920;

export type MonkeyForm = 'cube' | 'ship' | 'wave' | 'ball';

export type MonkeySkinId = 'classic' | 'bald' | 'shades' | 'crown' | 'neon';

export interface MonkeySkinDef {
  id: MonkeySkinId;
  name: string;
  badge: string;
  desc: string;
}

export const MONKEY_SKINS: MonkeySkinDef[] = [
  { id: 'classic', name: 'Vesgo', badge: '🐒', desc: 'O clássico chimp surtado' },
  { id: 'bald', name: 'Calvo', badge: '🥚', desc: 'Aerodinâmica de careca lustrada' },
  { id: 'shades', name: 'Juliette', badge: '🕶️', desc: 'Respeita o macaco de lupa' },
  { id: 'crown', name: 'Rei Banana', badge: '👑', desc: 'Monarca supremo do BPM' },
  { id: 'neon', name: 'Cyber', badge: '🤖', desc: 'Visor laser direto de 2099' },
];

export type SongId = 0 | 1 | 2 | 3 | 4 | 5;

export type ObjectType =
  | 'block'
  | 'spike'
  | 'spike_down'
  | 'pad_yellow'
  | 'pad_gravity'
  | 'orb_yellow'
  | 'orb_blue'
  | 'portal_cube'
  | 'portal_ship'
  | 'portal_wave'
  | 'portal_ball'
  | 'portal_grav_inv'
  | 'portal_grav_norm'
  | 'portal_speed_norm'
  | 'portal_speed_fast'
  | 'portal_speed_turbo'
  | 'banana';

export interface LevelObject {
  gx: number;
  gy: number;
  type: ObjectType;
}

export type LevelDifficulty = 'Fácil' | 'Médio' | 'Difícil' | 'Insano' | 'Custom';

export interface LevelData {
  id: string;
  name: string;
  subtitle: string;
  difficulty: LevelDifficulty;
  bpm: number;
  songId: SongId;
  colorPrimary: string;
  colorSecondary: string;
  bgTop: string;
  bgBottom: string;
  lengthTiles: number;
  objects: LevelObject[];
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  form: MonkeyForm;
  grav: 1 | -1; // 1 = normal (down), -1 = inverted (up)
  speedMult: number;
  onGround: boolean;
  alive: boolean;
  scaleX: number;
  scaleY: number;
  trail: Array<{ x: number; y: number; form: MonkeyForm }>;
  waveTrail: Array<{ x: number; y: number }>;
  activatedIds: Set<number>;
  collectedBananas: Set<number>;
}

export interface Checkpoint {
  x: number;
  y: number;
  vy: number;
  rot: number;
  form: MonkeyForm;
  grav: 1 | -1;
  speedMult: number;
  onGround: boolean;
  activatedIds: number[];
  collectedBananas: number[];
  songBeatOffset: number;
}

export interface RemoteMonkeyState {
  id: string;
  name: string;
  color: string;
  skin: MonkeySkinId;
  levelId: string;
  x: number;
  y: number;
  rot: number;
  targetX: number;
  targetY: number;
  targetRot: number;
  form: MonkeyForm;
  grav: 1 | -1;
  alive: boolean;
  pct: number;
  trail: Array<{ x: number; y: number }>;
  lastSeen: number;
  deathFlashAt: number;
}

export interface HornEvent {
  senderId: string;
  senderName: string;
  emoji: string;
  phrase: string;
  startedAt: number;
}

export interface LobbyRaceSelection {
  levelId: string;
  levelName: string;
  customLevel?: LevelData;
}

export type DashNetMessage =
  | {
      kind: 'state';
      levelId: string;
      x: number;
      y: number;
      rot: number;
      form: MonkeyForm;
      grav: 1 | -1;
      alive: boolean;
      pct: number;
      color: string;
      skin?: MonkeySkinId;
    }
  | {
      kind: 'death';
      levelId: string;
      x: number;
      y: number;
      pct: number;
      color: string;
      phrase: string;
    }
  | {
      kind: 'win';
      levelId: string;
      attempts: number;
      wins?: number;
    }
  | {
      kind: 'horn';
      emoji: string;
      phrase: string;
    }
  | {
      kind: 'race_lobby_select';
      selection: LobbyRaceSelection;
    }
  | {
      kind: 'race_start';
      level: LevelData;
      countdownSec: number;
      raceId: string;
    }
  | {
      kind: 'share_level';
      level: LevelData;
    };

export interface LevelProgress {
  bestPct: number;
  practiceBestPct?: number;
  completed: boolean;
  bestBananas: number;
  attempts: number;
}

export const RAGE_PHRASES_HIGH = [
  'MORREU EM {pct}% KKKKKKK QUE DOR!',
  'ATÉ UM SAGUI DE OLHO FECHADO PASSAVA ESSA!',
  '{pct}%?! A BANANA ESCORREGOU NA RETA FINAL!',
  'QUASE LÁ ({pct}%)... MENTIRA, CHORA MAIS!',
  'MEU TECLADO QUEBROU SOZINHO EM {pct}%!',
];

export const RAGE_PHRASES_MID = [
  'ESSE ESPINHO DE COCO TAVA DE CAMPER EM {pct}%!',
  'RITMO DO MACACO TÁ MEIO VESGO HOJE ({pct}%)!',
  'CULPA DO LAG MENTAL EM {pct}%!',
  'SÓ MAIS 99 TENTATIVAS QUE VAI!',
  'O MACACO BATEU A TESTA NO PIXEL ERRADO!',
];

export const RAGE_PHRASES_EARLY = [
  'JÁ MORREU EM {pct}%?! ESQUENTANDO OS DEDOS NÉ?',
  'SPEEDRUN DE MORTE: {pct}% RECORDE MUNDIAL!',
  'O ESPINHO TAVA LITERALMENTE PARADO ALI!',
  'EI, ERA PRA PULAR! ({pct}%)',
  'ACORDA CHIMPANZÉ! CLICA NO ESPAÇO!',
];

export const HORN_MEMES = [
  { emoji: '🐒💨', phrase: 'UUU-AAA-AAA! SAI DA FRENTE!' },
  { emoji: '🍌⚡', phrase: 'OLHA O ESPINHO ATRÁS DE TU!!' },
  { emoji: '🤪📣', phrase: 'VAI ERRAR O PULO HEIN!!' },
  { emoji: '🦍🔥', phrase: 'MACACO SURTADO BUZINANDO!' },
  { emoji: '🥥💥', phrase: 'CUIDADO COM O COCO GIGANTE!' },
];
