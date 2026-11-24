import { B } from './types';

// Teclado + toque -> bits de input. Esquemas:
//  P1:   WASD  + F (leve) G (forte) H (especial) T (defesa) R (agarrar) | Espaço = pulo
//  Solo: P1 também aceita Setas + J K L I O (e Shift = defesa)
//  P2:   Setas + , . / ; '

export type Scheme = 'p1' | 'p2' | 'solo';

interface KeyMap {
  L: string[]; R: string[]; U: string[]; D: string[]; JUMP: string[];
  LIGHT: string[]; HEAVY: string[]; SPECIAL: string[]; SHIELD: string[]; GRAB: string[];
}

const P1: KeyMap = {
  L: ['KeyA'], R: ['KeyD'], U: ['KeyW'], D: ['KeyS'], JUMP: ['Space'],
  LIGHT: ['KeyF'], HEAVY: ['KeyG'], SPECIAL: ['KeyH'], SHIELD: ['KeyT'], GRAB: ['KeyR'],
};
const P2: KeyMap = {
  L: ['ArrowLeft'], R: ['ArrowRight'], U: ['ArrowUp'], D: ['ArrowDown'], JUMP: [],
  LIGHT: ['Comma', 'Numpad1'], HEAVY: ['Period', 'Numpad2'], SPECIAL: ['Slash', 'Numpad3'], SHIELD: ['Semicolon', 'Numpad0'], GRAB: ['Quote', 'Numpad4'],
};
const SOLO: KeyMap = {
  L: ['KeyA', 'ArrowLeft'], R: ['KeyD', 'ArrowRight'], U: ['KeyW', 'ArrowUp'], D: ['KeyS', 'ArrowDown'], JUMP: ['Space'],
  LIGHT: ['KeyF', 'KeyJ', 'KeyZ'], HEAVY: ['KeyG', 'KeyK', 'KeyX'], SPECIAL: ['KeyH', 'KeyL', 'KeyC'],
  SHIELD: ['KeyT', 'KeyI', 'ShiftLeft', 'ShiftRight'], GRAB: ['KeyR', 'KeyO', 'KeyV'],
};

const MAPS: Record<Scheme, KeyMap> = { p1: P1, p2: P2, solo: SOLO };

const down = new Set<string>();
let touchBits = 0;
let bound = false;

const BLOCK = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Quote', 'Slash', 'Comma', 'Period']);

export function bindKeyboard(): void {
  if (bound) return;
  bound = true;
  window.addEventListener('keydown', (e) => {
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    down.add(e.code);
    if (BLOCK.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
    touchBits = 0;
  });
}

export function isDown(code: string): boolean {
  return down.has(code);
}

export function readInput(scheme: Scheme, withTouch = false): number {
  const m = MAPS[scheme];
  let bits = 0;
  const chk = (keys: string[], bit: number) => {
    for (const k of keys) if (down.has(k)) {
      bits |= bit;
      return;
    }
  };
  chk(m.L, B.L);
  chk(m.R, B.R);
  chk(m.U, B.U | B.JUMP);
  chk(m.D, B.D);
  chk(m.JUMP, B.JUMP);
  chk(m.LIGHT, B.LIGHT);
  chk(m.HEAVY, B.HEAVY);
  chk(m.SPECIAL, B.SPECIAL);
  chk(m.SHIELD, B.SHIELD);
  chk(m.GRAB, B.GRAB);
  if (withTouch) bits |= touchBits;
  return bits;
}

export function anyKeyDown(): boolean {
  return down.size > 0;
}

/** Controles de toque na tela (mostrados só em dispositivos touch). */
export function mountTouchControls(root: HTMLElement): { show: (v: boolean) => void } {
  const wrap = document.createElement('div');
  wrap.id = 'ms-touch';
  wrap.style.cssText = 'position:fixed;inset:auto 0 0 0;height:190px;z-index:50;display:none;pointer-events:none;touch-action:none;user-select:none;';
  const mk = (label: string, bit: number, css: string) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText = `position:absolute;${css};width:58px;height:58px;border-radius:50%;background:rgba(15,23,42,.55);border:2px solid rgba(250,204,21,.7);color:#fde68a;font:800 13px system-ui;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;`;
    const on = (e: Event) => {
      e.preventDefault();
      touchBits |= bit;
      b.style.background = 'rgba(250,204,21,.45)';
    };
    const off = (e: Event) => {
      e.preventDefault();
      touchBits &= ~bit;
      b.style.background = 'rgba(15,23,42,.55)';
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    wrap.appendChild(b);
  };
  mk('◀', B.L, 'left:12px;bottom:60px');
  mk('▶', B.R, 'left:140px;bottom:60px');
  mk('▲', B.U | B.JUMP, 'left:76px;bottom:116px');
  mk('▼', B.D, 'left:76px;bottom:6px');
  mk('Leve', B.LIGHT, 'right:136px;bottom:70px');
  mk('Forte', B.HEAVY, 'right:70px;bottom:120px');
  mk('Esp', B.SPECIAL, 'right:6px;bottom:70px');
  mk('Def', B.SHIELD, 'right:70px;bottom:20px');
  mk('Agar', B.GRAB, 'right:6px;bottom:6px');
  root.appendChild(wrap);
  return { show: (v: boolean) => { wrap.style.display = v ? 'block' : 'none'; if (!v) touchBits = 0; } };
}
