export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type CellType = PieceId | 'GARBAGE';

export interface BoardCell {
  type: CellType;
  /** 1 = squished monkey face inside crate, 0 = banana/coconut/crate pattern */
  monkeyFace: number;
  blinkSeed: number;
}

export interface ActivePiece {
  id: PieceId;
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3;
  lastActionRotate: boolean;
  lastKickIdx: number;
  lockTimer: number;
  lockResets: number;
  squashX: number;
  squashY: number;
}

export type MonkeyMood = 'idle' | 'happy' | 'panic' | 'tspin' | 'rage' | 'ko' | 'smug';

export type GameMode =
  | 'solo_marathon'
  | 'solo_sprint'
  | 'vs_bot'
  | 'local_2p'
  | 'online_versus';

export type BotDifficulty = 'sagui' | 'chimp' | 'gorila';

export interface PlayerInputState {
  leftHeld: boolean;
  rightHeld: boolean;
  downHeld: boolean;
  leftPressed: boolean;
  rightPressed: boolean;
  rotateCWPressed: boolean;
  rotateCCWPressed: boolean;
  hardDropPressed: boolean;
  holdPressed: boolean;
}

export interface PendingGarbageItem {
  amount: number;
  fromName: string;
  timer: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  life: number;
  maxLife: number;
  kind: 'banana' | 'coconut' | 'splinter' | 'star' | 'peel' | 'sweat';
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  subtext?: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export interface FlyingBananaAttack {
  fromBoardId: string;
  toBoardId: string;
  progress: number;
  amount: number;
  label: string;
}

export interface BoardSnapshot {
  playerId: string;
  playerName: string;
  playerColor: string;
  /** 200-char string for 20 visible rows * 10 cols: . I O T S Z J L G */
  grid: string;
  active: { id: PieceId; x: number; y: number; rot: 0 | 1 | 2 | 3 } | null;
  hold: PieceId | null;
  score: number;
  lines: number;
  level: number;
  combo: number;
  pendingGarbage: number;
  alive: boolean;
  mood: MonkeyMood;
  kos: number;
}

export type TetrisNetMessage =
  | {
      kind: 'start';
      seed: number;
      startLevel: number;
    }
  | {
      kind: 'state';
      snapshot: BoardSnapshot;
    }
  | {
      kind: 'attack';
      targetId: string;
      amount: number;
      fromName: string;
      label: string;
    }
  | {
      kind: 'taunt';
      phrase: string;
    }
  | {
      kind: 'ko';
      victimId: string;
      victimName: string;
      attackerId?: string;
    }
  | {
      kind: 'back_to_menu';
    };
