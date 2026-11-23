import {
  ALL_PIECES,
  BagRandomizer,
  PIECE_SHAPES,
  PIECE_THEMES,
  cellToChar,
  getKickOffsets,
} from './pieces';
import type {
  ActivePiece,
  BoardCell,
  BoardSnapshot,
  BotDifficulty,
  FloatingText,
  MonkeyMood,
  Particle,
  PendingGarbageItem,
  PieceId,
  PlayerInputState,
} from './types';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 2;
export const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS;

const DAS_DELAY = 0.135;
const ARR_RATE = 0.03;
const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
const CLEAR_FLASH_DURATION = 0.17;

const FUNNY_COMBO_LINES = [
  'BANANA DUPLA!',
  'MACACO LIGADO!',
  'CHUVA DE CASCA!',
  'SURTO NA SELVA!',
  'MACACO POSSUÍDO!!',
  'REI DO CIPÓ!!',
  'DEUS DA BANANA!!',
];

const FUNNY_TSPIN_LINES = [
  'T-GIRO MACACO!',
  'GIRO DE CIPÓ!',
  'ACROBACIA INSANA!',
  'T-GIRO LENDÁRIO!!',
];

const FUNNY_SPEECH_IDLE = [
  'Cadê a barra?!',
  'Empilha direito!',
  'Tô com fome...',
  'Gira esse coco!',
  'Cuidado com o buraco!',
];

const FUNNY_SPEECH_PANIC = [
  'SOCORROOO!!',
  'VAI BATER NO TETO!',
  'LIMPA ISSO AGORA!',
  'AI MINHA BANANA!',
  'MEU DEUS DO CÉU!!',
];

const FUNNY_SPEECH_HAPPY = [
  'TOMA ESSA CASCA!',
  'É MACACTRIS BB!',
  'UUU-AAA-AAA!',
  'CHORA RIVAL!!',
  'BANANA EXPLOSIVA!',
];

export interface EngineCallbacks {
  onAttack?: (engine: TetrisEngine, amount: number, label: string) => void;
  onSfx?: (
    engine: TetrisEngine,
    sfx: 'move' | 'rotate' | 'softDrop' | 'hardDrop' | 'hold' | 'clear' | 'garbageIn' | 'ko',
    meta?: { lines?: number; combo?: number; isTSpin?: boolean },
  ) => void;
  onSprintComplete?: (engine: TetrisEngine) => void;
  onKO?: (engine: TetrisEngine) => void;
}

export class TetrisEngine {
  public readonly id: string;
  public name: string;
  public color: string;
  public isBot: boolean;
  public botDifficulty: BotDifficulty;

  public grid: (BoardCell | null)[][];
  public bag: BagRandomizer;
  public queue: PieceId[] = [];
  public active: ActivePiece | null = null;
  public hold: PieceId | null = null;
  public holdUsed = false;

  public score = 0;
  public lines = 0;
  public level = 1;
  public startLevel = 1;
  public combo = -1;
  public maxCombo = 0;
  public backToBack = false;
  public kos = 0;
  public alive = true;
  public sprintTarget: number | null = null;
  public sprintFinished = false;
  public elapsedTime = 0;

  public pendingGarbage: PendingGarbageItem[] = [];
  public clearFlashRows: number[] = [];
  public clearFlashTimer = 0;

  public mood: MonkeyMood = 'idle';
  public moodTimer = 0;
  public speechBubble = '';
  public speechTimer = 0;
  public shakeAmount = 0;
  public dropTrail: { x: number; yStart: number; yEnd: number; color: string; life: number }[] = [];

  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];

  private gravityAcc = 0;
  private dasDir: -1 | 0 | 1 = 0;
  private dasTimer = 0;
  private arrTimer = 0;
  private callbacks: EngineCallbacks;
  private rng = Math.random;

  constructor(opts: {
    id: string;
    name: string;
    color: string;
    seed?: number;
    startLevel?: number;
    sprintTarget?: number | null;
    isBot?: boolean;
    botDifficulty?: BotDifficulty;
    callbacks?: EngineCallbacks;
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.color = opts.color;
    this.startLevel = opts.startLevel ?? 1;
    this.level = this.startLevel;
    this.sprintTarget = opts.sprintTarget ?? null;
    this.isBot = Boolean(opts.isBot);
    this.botDifficulty = opts.botDifficulty ?? 'chimp';
    this.callbacks = opts.callbacks ?? {};

    this.grid = Array.from({ length: TOTAL_ROWS }, () => Array<BoardCell | null>(COLS).fill(null));
    this.bag = new BagRandomizer(opts.seed);
    for (let i = 0; i < 5; i++) {
      this.queue.push(this.bag.next());
    }
    this.spawnNextPiece();
    this.say(FUNNY_SPEECH_IDLE[Math.floor(Math.random() * FUNNY_SPEECH_IDLE.length)], 2.2);
  }

  public setMood(mood: MonkeyMood, duration = 1.3): void {
    this.mood = mood;
    this.moodTimer = duration;
  }

  public say(text: string, duration = 2.1): void {
    this.speechBubble = text;
    this.speechTimer = duration;
  }

  public getPendingGarbageTotal(): number {
    let total = 0;
    for (const g of this.pendingGarbage) total += g.amount;
    return total;
  }

  public getStackHeight(): number {
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (this.grid[r].some((c) => c !== null)) {
        return TOTAL_ROWS - r;
      }
    }
    return 0;
  }

  public isInDanger(): boolean {
    return this.getStackHeight() >= 14;
  }

  public receiveGarbage(amount: number, fromName: string): void {
    if (!this.alive || amount <= 0) return;
    this.pendingGarbage.push({ amount, fromName, timer: 0.7 });
    this.say(`EITA! +${amount} CASCA!`, 1.8);
    this.setMood('panic', 1.2);
  }

  public spawnNextPiece(): boolean {
    const nextId = this.queue.shift() ?? this.bag.next();
    while (this.queue.length < 5) {
      this.queue.push(this.bag.next());
    }
    return this.spawnPiece(nextId);
  }

  private spawnPiece(id: PieceId): boolean {
    const x = 3;
    const y = 0;
    const piece: ActivePiece = {
      id,
      x,
      y,
      rot: 0,
      lastActionRotate: false,
      lastKickIdx: 0,
      lockTimer: 0,
      lockResets: 0,
      squashX: 1.12,
      squashY: 0.88,
    };
    if (!this.canPlace(id, x, y, 0)) {
      this.active = null;
      this.triggerKO();
      return false;
    }
    this.active = piece;
    this.holdUsed = false;
    this.gravityAcc = 0;
    return true;
  }

  private triggerKO(): void {
    if (!this.alive) return;
    this.alive = false;
    this.mood = 'ko';
    this.moodTimer = 999;
    this.shakeAmount = 14;
    this.say('NOCAUTE DE BANANA!! 😵', 4);
    this.spawnFloatingText(COLS * 0.5, 9, 'NOCAUTE!!', 'Empilhou até o teto!', '#fb7185', 1.35);
    this.spawnExplosionParticles(COLS * 0.5, 8, 30, '#fb7185');
    this.callbacks.onSfx?.(this, 'ko');
    this.callbacks.onKO?.(this);
  }

  public canPlace(id: PieceId, x: number, y: number, rot: 0 | 1 | 2 | 3): boolean {
    const cells = PIECE_SHAPES[id][rot];
    for (const [dx, dy] of cells) {
      const gx = x + dx;
      const gy = y + dy;
      if (gx < 0 || gx >= COLS || gy >= TOTAL_ROWS) return false;
      if (gy >= 0 && this.grid[gy][gx] !== null) return false;
    }
    return true;
  }

  public getGhostY(): number {
    if (!this.active) return 0;
    let gy = this.active.y;
    while (this.canPlace(this.active.id, this.active.x, gy + 1, this.active.rot)) {
      gy++;
    }
    return gy;
  }

  public moveHorizontal(dx: -1 | 1): boolean {
    if (!this.active || !this.alive) return false;
    if (this.canPlace(this.active.id, this.active.x + dx, this.active.y, this.active.rot)) {
      this.active.x += dx;
      this.active.lastActionRotate = false;
      this.resetLockTimerIfGrounded();
      this.callbacks.onSfx?.(this, 'move');
      return true;
    }
    return false;
  }

  public rotate(dir: 1 | -1): boolean {
    if (!this.active || !this.alive) return false;
    const fromRot = this.active.rot;
    const toRot = (((fromRot + dir) % 4 + 4) % 4) as 0 | 1 | 2 | 3;
    const kicks = getKickOffsets(this.active.id, fromRot, toRot);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.canPlace(this.active.id, this.active.x + kx, this.active.y + ky, toRot)) {
        this.active.x += kx;
        this.active.y += ky;
        this.active.rot = toRot;
        this.active.lastActionRotate = true;
        this.active.lastKickIdx = i;
        this.active.squashX = 0.86;
        this.active.squashY = 1.16;
        this.resetLockTimerIfGrounded();
        this.callbacks.onSfx?.(this, 'rotate', { isTSpin: this.active.id === 'T' });
        return true;
      }
    }
    return false;
  }

  public holdPiece(): boolean {
    if (!this.active || !this.alive || this.holdUsed) return false;
    const currentId = this.active.id;
    const prevHold = this.hold;
    this.hold = currentId;
    this.holdUsed = true;
    this.callbacks.onSfx?.(this, 'hold');
    if (prevHold) {
      this.spawnPiece(prevHold);
    } else {
      this.spawnNextPiece();
    }
    // Keep holdUsed = true after spawnPiece resets it
    this.holdUsed = true;
    return true;
  }

  public hardDrop(): void {
    if (!this.active || !this.alive) return;
    const startY = this.active.y;
    const endY = this.getGhostY();
    const dropped = endY - startY;
    if (dropped > 0) {
      this.score += dropped * 2;
      this.active.y = endY;
      this.active.lastActionRotate = false;
      const theme = PIECE_THEMES[this.active.id];
      this.dropTrail.push({
        x: this.active.x + 1.5,
        yStart: Math.max(0, startY - BUFFER_ROWS),
        yEnd: Math.max(0, endY - BUFFER_ROWS + 1),
        color: theme.glowColor,
        life: 0.18,
      });
    }
    this.shakeAmount = Math.max(this.shakeAmount, 3.2);
    this.callbacks.onSfx?.(this, 'hardDrop');
    this.lockCurrentPiece();
  }

  private resetLockTimerIfGrounded(): void {
    if (!this.active) return;
    const grounded = !this.canPlace(this.active.id, this.active.x, this.active.y + 1, this.active.rot);
    if (grounded && this.active.lockResets < MAX_LOCK_RESETS) {
      this.active.lockTimer = 0;
      this.active.lockResets++;
    }
  }

  private detectTSpin(piece: ActivePiece): 'none' | 'mini' | 'full' {
    if (piece.id !== 'T' || !piece.lastActionRotate) return 'none';
    const cx = piece.x + 1;
    const cy = piece.y + 1;
    const corners: [number, number][] = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];
    const occupied = corners.map(([x, y]) => {
      if (x < 0 || x >= COLS || y >= TOTAL_ROWS) return true;
      if (y < 0) return false;
      return this.grid[y][x] !== null;
    });
    const cornerCount = occupied.filter(Boolean).length;
    if (cornerCount < 3) return 'none';

    // Front corners by rotation
    const frontIndices: Record<0 | 1 | 2 | 3, [number, number]> = {
      0: [0, 1],
      1: [1, 3],
      2: [2, 3],
      3: [0, 2],
    };
    const [f1, f2] = frontIndices[piece.rot];
    if ((occupied[f1] && occupied[f2]) || piece.lastKickIdx === 4) {
      return 'full';
    }
    return 'mini';
  }

  private lockCurrentPiece(): void {
    if (!this.active) return;
    const piece = this.active;
    const theme = PIECE_THEMES[piece.id];
    const cells = PIECE_SHAPES[piece.id][piece.rot];
    const tspinType = this.detectTSpin(piece);

    let aboveVisible = true;
    for (let i = 0; i < cells.length; i++) {
      const [dx, dy] = cells[i];
      const gx = piece.x + dx;
      const gy = piece.y + dy;
      if (gy >= BUFFER_ROWS) aboveVisible = false;
      if (gy >= 0 && gy < TOTAL_ROWS && gx >= 0 && gx < COLS) {
        this.grid[gy][gx] = {
          type: piece.id,
          monkeyFace: i === theme.monkeyCellIndex ? 1 : 0,
          blinkSeed: Math.random() * 10,
        };
      }
      // Small landing dust/splinters
      this.spawnSplash(gx + 0.5, gy - BUFFER_ROWS + 0.8, theme.topColor, 2);
    }

    this.active = null;

    if (aboveVisible) {
      this.triggerKO();
      return;
    }

    // Check completed rows
    const fullRows: number[] = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (this.grid[r].every((c) => c !== null)) {
        fullRows.push(r);
      }
    }

    if (fullRows.length > 0) {
      this.resolveLineClear(fullRows, tspinType);
      this.clearFlashRows = fullRows;
      this.clearFlashTimer = CLEAR_FLASH_DURATION;
    } else {
      this.combo = -1;
      if (tspinType !== 'none') {
        this.score += (tspinType === 'full' ? 400 : 100) * this.level;
        this.spawnFloatingText(piece.x + 1.5, piece.y - BUFFER_ROWS, 'T-GIRO!', 'Só no estilo!', '#e879f9', 1.0);
      }
      // Apply pending garbage when locking without clearing
      this.applyReadyGarbage();
      this.spawnNextPiece();
    }
  }

  private resolveLineClear(fullRows: number[], tspinType: 'none' | 'mini' | 'full'): void {
    const count = fullRows.length;
    this.lines += count;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const isDifficult = count === 4 || tspinType !== 'none';
    const b2bMult = this.backToBack && isDifficult ? 1.5 : 1;
    if (isDifficult) {
      this.backToBack = true;
    } else if (count > 0) {
      this.backToBack = false;
    }

    let baseScore = 0;
    let attack = 0;
    let headline = '';

    if (tspinType === 'full') {
      baseScore = [0, 800, 1200, 1600][count] ?? 1600;
      attack = [0, 2, 4, 6][count] ?? 6;
      headline = count === 1 ? 'T-GIRO SIMPLES!' : count === 2 ? 'T-GIRO DUPLO!!' : 'T-GIRO TRIPLO!!';
    } else if (tspinType === 'mini') {
      baseScore = [0, 200, 400][count] ?? 400;
      attack = count >= 2 ? 1 : 0;
      headline = 'T-GIRO MAROTO!';
    } else {
      baseScore = [0, 100, 300, 500, 800][count] ?? 800;
      attack = [0, 0, 1, 2, 4][count] ?? 4;
      headline =
        count === 1
          ? 'BANANA!'
          : count === 2
            ? 'DUPLA DE COCO!'
            : count === 3
              ? 'TRIPLA SELVAGEM!'
              : 'MACACTRIS!! 🍌';
    }

    const comboBonus = this.combo >= 1 ? 50 * this.combo * this.level : 0;
    if (this.combo >= 2) attack += Math.min(3, Math.floor(this.combo / 2));
    if (b2bMult > 1) attack += 1;

    this.score += Math.round(baseScore * this.level * b2bMult) + comboBonus;

    // Update marathon level
    if (this.sprintTarget === null) {
      this.level = Math.max(this.startLevel, 1 + Math.floor(this.lines / 10));
    }

    // Celebrate visuals!
    const midRow = fullRows[Math.floor(fullRows.length / 2)] - BUFFER_ROWS;
    for (const r of fullRows) {
      this.spawnExplosionParticles(COLS * 0.5, r - BUFFER_ROWS + 0.5, count >= 4 ? 16 : 9, '#facc15');
    }

    // Check Perfect Clear after removing rows (peek ahead)
    const remainingCells = this.grid.reduce((acc, row, idx) => {
      if (fullRows.includes(idx)) return acc;
      return acc + row.filter((c) => c !== null).length;
    }, 0);
    const isAllClear = remainingCells === 0;
    if (isAllClear) {
      attack += 6;
      this.score += 1800 * this.level;
      headline = 'LIMPOU TUDO!! 🐒✨';
    }

    const sub =
      this.combo >= 1
        ? `COMBO x${this.combo + 1}! ${FUNNY_COMBO_LINES[Math.min(this.combo - 1, FUNNY_COMBO_LINES.length - 1)]}`
        : tspinType !== 'none'
          ? FUNNY_TSPIN_LINES[Math.floor(Math.random() * FUNNY_TSPIN_LINES.length)]
          : b2bMult > 1
            ? 'B2B INSANO!'
            : undefined;

    this.spawnFloatingText(
      COLS * 0.5,
      Math.max(2, midRow),
      headline,
      sub,
      count >= 4 || isAllClear ? '#fde047' : tspinType !== 'none' ? '#e879f9' : '#4ade80',
      count >= 4 || isAllClear ? 1.3 : 1.05,
    );

    if (count >= 4 || tspinType !== 'none' || this.combo >= 2 || isAllClear) {
      this.setMood(tspinType !== 'none' ? 'tspin' : 'happy', 1.6);
      this.say(FUNNY_SPEECH_HAPPY[Math.floor(Math.random() * FUNNY_SPEECH_HAPPY.length)], 2.0);
      this.shakeAmount = Math.max(this.shakeAmount, count >= 4 ? 9 : 5);
    }

    this.callbacks.onSfx?.(this, 'clear', {
      lines: count,
      combo: Math.max(0, this.combo),
      isTSpin: tspinType !== 'none',
    });

    // Cancel pending garbage before sending leftover attack!
    while (attack > 0 && this.pendingGarbage.length > 0) {
      const head = this.pendingGarbage[0];
      const cancelled = Math.min(attack, head.amount);
      attack -= cancelled;
      head.amount -= cancelled;
      if (head.amount <= 0) this.pendingGarbage.shift();
    }

    if (attack > 0) {
      this.callbacks.onAttack?.(this, attack, headline);
    }

    if (this.sprintTarget !== null && this.lines >= this.sprintTarget && !this.sprintFinished) {
      this.sprintFinished = true;
      this.setMood('happy', 99);
      this.say('CHEGUEI PRIMEIRO!! 🏁', 5);
      this.callbacks.onSprintComplete?.(this);
    }
  }

  private finishLineClearFlash(): void {
    if (this.clearFlashRows.length === 0) return;
    const sorted = [...this.clearFlashRows].sort((a, b) => a - b);
    for (let i = sorted.length - 1; i >= 0; i--) {
      this.grid.splice(sorted[i], 1);
    }
    while (this.grid.length < TOTAL_ROWS) {
      this.grid.unshift(Array<BoardCell | null>(COLS).fill(null));
    }
    this.clearFlashRows = [];
    this.spawnNextPiece();
  }

  private applyReadyGarbage(): void {
    if (this.pendingGarbage.length === 0) return;
    let totalAdd = 0;
    const stillWaiting: PendingGarbageItem[] = [];
    for (const item of this.pendingGarbage) {
      if (item.timer <= 0) {
        totalAdd += item.amount;
      } else {
        stillWaiting.push(item);
      }
    }
    this.pendingGarbage = stillWaiting;
    if (totalAdd <= 0) return;

    const capped = Math.min(totalAdd, 10);
    const holeCol = Math.floor(this.rng() * COLS);
    for (let i = 0; i < capped; i++) {
      // Check if top row would overflow
      if (this.grid[0].some((c) => c !== null)) {
        this.triggerKO();
        return;
      }
      this.grid.shift();
      const row: (BoardCell | null)[] = [];
      for (let c = 0; c < COLS; c++) {
        row.push(
          c === holeCol
            ? null
            : {
                type: 'GARBAGE',
                monkeyFace: 0,
                blinkSeed: Math.random() * 10,
              },
        );
      }
      this.grid.push(row);
    }
    this.shakeAmount = Math.max(this.shakeAmount, 5.5);
    this.callbacks.onSfx?.(this, 'garbageIn');
    this.spawnFloatingText(COLS * 0.5, 16, `+${capped} CASCA SUJA!`, 'Escorregou na banana!', '#fb923c', 0.95);
  }

  public step(dt: number, input: PlayerInputState): void {
    this.elapsedTime += dt;

    // Update particles & floating texts even after KO
    this.updateEffects(dt);

    if (!this.alive || this.sprintFinished) return;

    // Garbage timers
    for (const item of this.pendingGarbage) {
      item.timer = Math.max(0, item.timer - dt);
    }

    if (this.moodTimer > 0) {
      this.moodTimer -= dt;
      if (this.moodTimer <= 0) {
        this.mood = this.isInDanger() ? 'panic' : 'idle';
      }
    } else if (this.isInDanger() && this.mood !== 'panic') {
      this.mood = 'panic';
      this.say(FUNNY_SPEECH_PANIC[Math.floor(Math.random() * FUNNY_SPEECH_PANIC.length)], 1.8);
    } else if (!this.isInDanger() && this.mood === 'panic') {
      this.mood = 'idle';
    }

    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) this.speechBubble = '';
    }

    // Line clear flash pause
    if (this.clearFlashTimer > 0) {
      this.clearFlashTimer -= dt;
      if (this.clearFlashTimer <= 0) {
        this.finishLineClearFlash();
      }
      return;
    }

    if (!this.active) return;

    // Recover squash & stretch smoothly
    this.active.squashX += (1 - this.active.squashX) * Math.min(1, dt * 16);
    this.active.squashY += (1 - this.active.squashY) * Math.min(1, dt * 16);

    // Hold
    if (input.holdPressed) {
      this.holdPiece();
      if (!this.active) return;
    }

    // Rotations
    if (input.rotateCWPressed) this.rotate(1);
    if (input.rotateCCWPressed) this.rotate(-1);

    // Horizontal DAS/ARR
    if (input.leftPressed) {
      this.moveHorizontal(-1);
      this.dasDir = -1;
      this.dasTimer = 0;
      this.arrTimer = 0;
    } else if (input.rightPressed) {
      this.moveHorizontal(1);
      this.dasDir = 1;
      this.dasTimer = 0;
      this.arrTimer = 0;
    } else if (input.leftHeld && !input.rightHeld) {
      if (this.dasDir !== -1) {
        this.dasDir = -1;
        this.dasTimer = 0;
      } else {
        this.dasTimer += dt;
        if (this.dasTimer >= DAS_DELAY) {
          this.arrTimer += dt;
          while (this.arrTimer >= ARR_RATE) {
            this.arrTimer -= ARR_RATE;
            this.moveHorizontal(-1);
          }
        }
      }
    } else if (input.rightHeld && !input.leftHeld) {
      if (this.dasDir !== 1) {
        this.dasDir = 1;
        this.dasTimer = 0;
      } else {
        this.dasTimer += dt;
        if (this.dasTimer >= DAS_DELAY) {
          this.arrTimer += dt;
          while (this.arrTimer >= ARR_RATE) {
            this.arrTimer -= ARR_RATE;
            this.moveHorizontal(1);
          }
        }
      }
    } else {
      this.dasDir = 0;
      this.dasTimer = 0;
      this.arrTimer = 0;
    }

    // Hard drop
    if (input.hardDropPressed) {
      this.hardDrop();
      return;
    }

    // Gravity & Soft Drop
    const baseInterval = Math.max(0.045, Math.pow(0.8 - (this.level - 1) * 0.008, this.level - 1));
    const dropInterval = input.downHeld ? Math.min(baseInterval, 0.042) : baseInterval;

    this.gravityAcc += dt;
    while (this.gravityAcc >= dropInterval) {
      this.gravityAcc -= dropInterval;
      if (this.canPlace(this.active.id, this.active.x, this.active.y + 1, this.active.rot)) {
        this.active.y++;
        this.active.lastActionRotate = false;
        if (input.downHeld) {
          this.score += 1;
          this.callbacks.onSfx?.(this, 'softDrop');
        }
      } else {
        this.gravityAcc = 0;
        break;
      }
    }

    // Lock delay check
    const grounded = !this.canPlace(this.active.id, this.active.x, this.active.y + 1, this.active.rot);
    if (grounded) {
      this.active.lockTimer += dt;
      if (this.active.lockTimer >= LOCK_DELAY) {
        this.lockCurrentPiece();
      }
    } else {
      this.active.lockTimer = 0;
    }
  }

  private updateEffects(dt: number): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 28);

    for (let i = this.dropTrail.length - 1; i >= 0; i--) {
      this.dropTrail[i].life -= dt;
      if (this.dropTrail[i].life <= 0) this.dropTrail.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 22 * dt;
      p.rot += p.vrot * dt;
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
      ft.vy *= 0.94;
    }
  }

  public spawnSplash(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 7,
        vy: -2 - Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 10,
        size: 0.22 + Math.random() * 0.2,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.55,
        kind: 'splinter',
        color,
      });
    }
  }

  public spawnExplosionParticles(x: number, y: number, count: number, color: string): void {
    const kinds: Particle['kind'][] = ['banana', 'star', 'coconut', 'splinter'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 11;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 14,
        size: 0.38 + Math.random() * 0.35,
        life: 0.65 + Math.random() * 0.45,
        maxLife: 1.1,
        kind: kinds[i % kinds.length],
        color,
      });
    }
  }

  public spawnFloatingText(
    x: number,
    y: number,
    text: string,
    subtext: string | undefined,
    color: string,
    scale = 1,
  ): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -2.6,
      text,
      subtext,
      color,
      scale,
      life: 1.3,
      maxLife: 1.3,
    });
  }

  public toNetSnapshot(): BoardSnapshot {
    let gridStr = '';
    for (let r = BUFFER_ROWS; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        gridStr += cellToChar(this.grid[r][c]?.type ?? null);
      }
    }
    return {
      playerId: this.id,
      playerName: this.name,
      playerColor: this.color,
      grid: gridStr,
      active: this.active
        ? { id: this.active.id, x: this.active.x, y: this.active.y, rot: this.active.rot }
        : null,
      hold: this.hold,
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: Math.max(0, this.combo),
      pendingGarbage: this.getPendingGarbageTotal(),
      alive: this.alive,
      mood: this.mood,
      kos: this.kos,
    };
  }
}

/**
 * Smart heuristic Bot controller for "Duelo vs Gorila Bot"
 */
export class BotController {
  private targetX: number | null = null;
  private targetRot: 0 | 1 | 2 | 3 = 0;
  private actionTimer = 0;
  private lastPieceRef: ActivePiece | null = null;

  public computeInput(engine: TetrisEngine, dt: number): PlayerInputState {
    const empty: PlayerInputState = {
      leftHeld: false,
      rightHeld: false,
      downHeld: false,
      leftPressed: false,
      rightPressed: false,
      rotateCWPressed: false,
      rotateCCWPressed: false,
      hardDropPressed: false,
      holdPressed: false,
    };

    if (!engine.alive || !engine.active || engine.clearFlashTimer > 0) return empty;

    if (engine.active !== this.lastPieceRef) {
      this.lastPieceRef = engine.active;
      const best = this.findBestPlacement(engine, engine.active.id);
      this.targetX = best.x;
      this.targetRot = best.rot;
      this.actionTimer = 0;
    }

    const stepInterval =
      engine.botDifficulty === 'sagui' ? 0.24 : engine.botDifficulty === 'chimp' ? 0.12 : 0.058;

    this.actionTimer += dt;
    if (this.actionTimer < stepInterval) return empty;
    this.actionTimer = 0;

    if (this.targetX === null) return empty;

    if (engine.active.rot !== this.targetRot) {
      empty.rotateCWPressed = true;
      return empty;
    }
    if (engine.active.x < this.targetX) {
      empty.rightPressed = true;
      return empty;
    }
    if (engine.active.x > this.targetX) {
      empty.leftPressed = true;
      return empty;
    }

    empty.hardDropPressed = true;
    return empty;
  }

  private findBestPlacement(
    engine: TetrisEngine,
    pieceId: PieceId,
  ): { x: number; rot: 0 | 1 | 2 | 3 } {
    let bestScore = -Infinity;
    let bestX = 3;
    let bestRot: 0 | 1 | 2 | 3 = 0;
    const rots: (0 | 1 | 2 | 3)[] = pieceId === 'O' ? [0] : [0, 1, 2, 3];
    const noise = engine.botDifficulty === 'sagui' ? 6.5 : engine.botDifficulty === 'chimp' ? 1.5 : 0.1;

    for (const rot of rots) {
      for (let x = -2; x < COLS + 1; x++) {
        if (!engine.canPlace(pieceId, x, 0, rot)) continue;
        let y = 0;
        while (engine.canPlace(pieceId, x, y + 1, rot)) y++;

        const score = this.evaluatePlacement(engine, pieceId, x, y, rot) + (Math.random() - 0.5) * noise;
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestRot = rot;
        }
      }
    }
    return { x: bestX, rot: bestRot };
  }

  private evaluatePlacement(
    engine: TetrisEngine,
    pieceId: PieceId,
    px: number,
    py: number,
    rot: 0 | 1 | 2 | 3,
  ): number {
    // Copy occupancy booleans fast
    const occ: boolean[][] = engine.grid.map((row) => row.map((c) => c !== null));
    for (const [dx, dy] of PIECE_SHAPES[pieceId][rot]) {
      const gx = px + dx;
      const gy = py + dy;
      if (gy >= 0 && gy < TOTAL_ROWS && gx >= 0 && gx < COLS) {
        occ[gy][gx] = true;
      }
    }

    let completeLines = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (occ[r].every(Boolean)) completeLines++;
    }

    const colHeights = new Array<number>(COLS).fill(0);
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let seenBlock = false;
      for (let r = 0; r < TOTAL_ROWS; r++) {
        if (occ[r][c]) {
          if (!seenBlock) {
            colHeights[c] = TOTAL_ROWS - r;
            seenBlock = true;
          }
        } else if (seenBlock) {
          holes++;
        }
      }
    }

    let aggHeight = 0;
    let bumpiness = 0;
    for (let c = 0; c < COLS; c++) {
      aggHeight += colHeights[c];
      if (c > 0) bumpiness += Math.abs(colHeights[c] - colHeights[c - 1]);
    }

    const lineReward = completeLines === 4 ? 5.2 : completeLines * 1.1;
    return -0.51 * aggHeight + 0.76 * lineReward - 0.68 * holes - 0.19 * bumpiness;
  }
}

export function createEmptyInput(): PlayerInputState {
  return {
    leftHeld: false,
    rightHeld: false,
    downHeld: false,
    leftPressed: false,
    rightPressed: false,
    rotateCWPressed: false,
    rotateCCWPressed: false,
    hardDropPressed: false,
    holdPressed: false,
  };
}

export function getRandomPieceCount(): number {
  return ALL_PIECES.length;
}
