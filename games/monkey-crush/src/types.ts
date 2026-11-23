export type FruitType = 'banana' | 'coconut' | 'mango' | 'acai' | 'cashew' | 'jackfruit';

export type SpecialType = 'none' | 'striped-h' | 'striped-v' | 'bomb' | 'rainbow';

export type ObjectiveType = 'score' | 'jelly' | 'babies';

export type GameMode = 'saga' | 'versus-solo' | 'versus-p2p' | 'coop-p2p';

export type ScreenView = 'title' | 'map' | 'playing';

export interface Piece {
  id: number;
  fruit: FruitType;
  special: SpecialType;
  isBaby?: boolean; // Macaco Bebê que precisa chegar até a linha de saída no fundo
  // Visual animation state (in grid units or pixels)
  xOffset: number;
  yOffset: number;
  scaleX: number;
  scaleY: number;
  wobble: number;
  blinkTimer: number;
  blinking: boolean;
}

export interface Cell {
  row: number;
  col: number;
  void: boolean; // buraco no tabuleiro
  jelly: number; // 0 = sem gelatina, 1 = gelatina simples, 2 = gelatina dupla de açaí
  crate: number; // 0 = livre, 1 = caixote de cipó
  peel: boolean; // Casca de banana (ataque do rival ou obstáculo)
  exitChute: boolean; // Saída para resgatar Macacos Bebês no fundo
  piece: Piece | null;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  rows: number;
  cols: number;
  numFruits: number; // 4 a 6 frutas
  moves: number;
  objective: ObjectiveType;
  targetScore: number;
  starScores: [number, number, number];
  /** Optional custom shape mask ('#' = active, '.' = void, 'J' = jelly 1, 'D' = jelly 2, 'C' = crate, 'B' = baby) */
  layout?: string[];
  babyCount?: number;
}

export interface LevelProgress {
  stars: number; // 0..3
  bestScore: number;
}

export interface SavedProgress {
  unlockedLevel: number;
  levels: Record<number, LevelProgress>;
  totalScore: number;
  allUnlocked?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  kind: 'juice' | 'star' | 'ring' | 'leaf';
  rotation: number;
  vRot: number;
}

export interface BeamEffect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
  width: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

export type MascotMood = 'idle' | 'happy' | 'hyped' | 'panicked' | 'hit' | 'victory' | 'defeat';

export interface MascotState {
  mood: MascotMood;
  quote: string;
  quoteTimer: number;
  bounce: number;
  blinkTimer: number;
  blinking: boolean;
  time: number;
}

export interface MoveCoord {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export type NetMessage =
  | {
      kind: 'versus-start';
      seed: number;
      durationSec: number;
    }
  | {
      kind: 'versus-score';
      score: number;
      combo: number;
    }
  | {
      kind: 'versus-peel';
      count: number;
      fromName: string;
      comboText: string;
    }
  | {
      kind: 'versus-finish';
      finalScore: number;
    }
  | {
      kind: 'coop-start';
      levelId: number;
      seed: number;
      turnPlayerId: string;
    }
  | {
      kind: 'coop-move';
      move: MoveCoord;
      nextTurnPlayerId: string;
      playerName: string;
    }
  | {
      kind: 'coop-cursor';
      row: number;
      col: number;
      color: string;
      name: string;
    };
