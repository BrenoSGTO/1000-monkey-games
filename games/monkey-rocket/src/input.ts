// Teclado (1 ou 2 jogadores no mesmo teclado) + botoes de toque.
import { emptyInput, type InputState } from './types';

type Touch = 'left' | 'right' | 'boost' | 'jump';

interface Scheme {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  boost: string[];
}

const SINGLE: Scheme = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyW', 'ArrowUp', 'KeyZ', 'KeyJ'],
  boost: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyK', 'KeyS', 'ArrowDown'],
};

const P1: Scheme = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  jump: ['KeyW', 'Space'],
  boost: ['ShiftLeft', 'KeyS', 'KeyQ'],
};

const P2: Scheme = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  jump: ['ArrowUp', 'Numpad0'],
  boost: ['ShiftRight', 'ArrowDown', 'Enter', 'NumpadEnter', 'Slash'],
};

export class InputManager {
  p1: InputState = emptyInput();
  p2: InputState = emptyInput();
  dual = false;
  enabled = false;
  onPause: (() => void) | null = null;
  onSkip: (() => void) | null = null;
  private keys = new Set<string>();
  private touch: Record<Touch, boolean> = { left: false, right: false, boost: false, jump: false };

  constructor() {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.refresh();
    });
  }

  private scheme(player: 1 | 2): Scheme {
    if (!this.dual) return SINGLE;
    return player === 1 ? P1 : P2;
  }

  private keyDown(e: KeyboardEvent): void {
    const gameKey =
      e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Enter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight';
    if (this.enabled && gameKey) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.onPause?.();
      return;
    }
    if (!this.enabled) return;
    if (e.code === 'Enter' && !this.dual) this.onSkip?.();
    this.keys.add(e.code);
    if (this.scheme(1).jump.includes(e.code)) this.p1.jumpCount++;
    if (this.dual && this.scheme(2).jump.includes(e.code)) this.p2.jumpCount++;
    this.refresh();
  }

  private keyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    this.refresh();
  }

  setTouch(name: Touch, down: boolean): void {
    if (name === 'jump' && down && !this.touch.jump) this.p1.jumpCount++;
    this.touch[name] = down;
    this.refresh();
  }

  releaseAll(): void {
    this.keys.clear();
    this.touch = { left: false, right: false, boost: false, jump: false };
    this.refresh();
  }

  private has(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  private refresh(): void {
    const s1 = this.scheme(1);
    const a = this.p1;
    a.left = this.has(s1.left) || this.touch.left;
    a.right = this.has(s1.right) || this.touch.right;
    a.up = this.has(s1.up);
    a.down = this.has(s1.down);
    a.boost = this.has(s1.boost) || this.touch.boost;
    a.jumpHeld = this.has(s1.jump) || this.touch.jump;
    if (this.dual) {
      const s2 = this.scheme(2);
      const b = this.p2;
      b.left = this.has(s2.left);
      b.right = this.has(s2.right);
      b.up = this.has(s2.up);
      b.down = this.has(s2.down);
      b.boost = this.has(s2.boost);
      b.jumpHeld = this.has(s2.jump);
    }
  }
}

/** Mascara compacta para a rede. */
export function packInput(i: InputState): number {
  return (
    (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0) | (i.down ? 8 : 0) | (i.boost ? 16 : 0) | (i.jumpHeld ? 32 : 0)
  );
}

export function unpackInput(m: number, jumpCount: number, into: InputState): InputState {
  into.left = (m & 1) !== 0;
  into.right = (m & 2) !== 0;
  into.up = (m & 4) !== 0;
  into.down = (m & 8) !== 0;
  into.boost = (m & 16) !== 0;
  into.jumpHeld = (m & 32) !== 0;
  into.jumpCount = jumpCount;
  return into;
}
