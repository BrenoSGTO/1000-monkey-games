import type { WormInput } from './types';

export type Action =
  | { t: 'jump' }
  | { t: 'back' }
  | { t: 'fireDown' }
  | { t: 'fireUp' }
  | { t: 'weapon'; idx: number }
  | { t: 'cycle'; dir: number }
  | { t: 'fuse'; d: number }
  | { t: 'click'; x: number; y: number }
  | { t: 'mouseAim'; x: number; y: number }
  | { t: 'overview' }
  | { t: 'menu' }
  | { t: 'skip' }
  | { t: 'help' };

export class Controls {
  private keys = new Set<string>();
  private virt = new Set<string>();
  onAction: (a: Action) => void = () => {};
  onPan: (dx: number, dy: number) => void = () => {};
  onWheel: (dy: number) => void = () => {};
  enabled = true;

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.virt.clear();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.onWheel(e.deltaY);
    }, { passive: false });

    let drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; pan: boolean; touch: boolean } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const touch = e.pointerType === 'touch';
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, pan: e.button === 2 || e.button === 1, touch };
      if (!touch && e.button === 0 && this.enabled) this.onAction({ t: 'click', x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) {
        if (e.pointerType !== 'touch' && this.enabled) this.onAction({ t: 'mouseAim', x: e.clientX, y: e.clientY });
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
      if (drag.pan || (drag.touch && drag.moved)) this.onPan(dx, dy);
      else if (!drag.touch && this.enabled) this.onAction({ t: 'mouseAim', x: e.clientX, y: e.clientY });
    });
    const end = (e: PointerEvent) => {
      if (drag && drag.id === e.pointerId) {
        if (drag.touch && !drag.moved && this.enabled) this.onAction({ t: 'click', x: e.clientX, y: e.clientY });
        drag = null;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private typing(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  private keyDown(e: KeyboardEvent): void {
    if (this.typing(e)) return;
    const c = e.code;
    if (['Space', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(c)) e.preventDefault();
    if (!e.repeat) {
      if (c === 'Escape') this.onAction({ t: 'menu' });
      if (c === 'KeyM') this.onAction({ t: 'overview' });
      if (c === 'KeyH') this.onAction({ t: 'help' });
      if (!this.enabled) {
        this.keys.add(c);
        return;
      }
      if (c === 'Space') this.onAction({ t: 'fireDown' });
      else if (c === 'Enter') this.onAction({ t: e.shiftKey ? 'back' : 'jump' });
      else if (c === 'Backspace') this.onAction({ t: 'back' });
      else if (c === 'Tab') this.onAction({ t: 'cycle', dir: e.shiftKey ? -1 : 1 });
      else if (c === 'KeyQ') this.onAction({ t: 'fuse', d: -1 });
      else if (c === 'KeyE') this.onAction({ t: 'fuse', d: 1 });
      else if (c === 'KeyP') this.onAction({ t: 'skip' });
      else if (c.startsWith('Digit')) {
        const n = parseInt(c.slice(5), 10);
        this.onAction({ t: 'weapon', idx: n === 0 ? 9 : n - 1 });
      } else if (c === 'Minus') this.onAction({ t: 'weapon', idx: 10 });
    }
    this.keys.add(c);
  }

  private keyUp(e: KeyboardEvent): void {
    if (this.typing(e)) return;
    this.keys.delete(e.code);
    if (e.code === 'Space' && this.enabled) this.onAction({ t: 'fireUp' });
  }

  virtualDown(k: string): void {
    this.virt.add(k);
  }

  virtualUp(k: string): void {
    this.virt.delete(k);
  }

  poll(): WormInput {
    const k = this.keys;
    const v = this.virt;
    return {
      left: k.has('KeyA') || k.has('ArrowLeft') || v.has('left'),
      right: k.has('KeyD') || k.has('ArrowRight') || v.has('right'),
      up: k.has('KeyW') || k.has('ArrowUp') || v.has('up'),
      down: k.has('KeyS') || k.has('ArrowDown') || v.has('down'),
    };
  }

  /** limpa teclas (ex.: ao trocar de turno) */
  reset(): void {
    this.keys.clear();
    this.virt.clear();
  }
}
