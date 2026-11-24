import { type Input, emptyInput } from './types';
import { clamp } from './util';

interface KeySet {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  drift: string[];
  item: string[];
}

const P1: KeySet = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  drift: ['ShiftLeft', 'KeyQ'],
  item: ['Space', 'KeyE'],
};
const P2: KeySet = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  drift: ['ShiftRight', 'Period', 'Numpad0'],
  item: ['Enter', 'Slash', 'NumpadEnter'],
};
const SOLO: KeySet = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  drift: ['ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyX', 'Period'],
  item: ['Space', 'KeyE', 'KeyZ', 'Enter', 'Slash'],
};

export class InputManager {
  private keys = new Set<string>();
  private inputs: Input[] = [emptyInput(), emptyInput()];
  private padPrevItem = [false, false];
  private touch = { left: false, right: false, gas: false, brake: false, drift: false };
  private touchEl: HTMLDivElement | null = null;
  twoPlayer = false;
  enabled = true;
  onPause: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onAnyKey: (() => void) | null = null;
  touchActive = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && this.enabled) e.preventDefault();
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      this.onAnyKey?.();
      const sets = this.twoPlayer ? [P1, P2] : [SOLO];
      sets.forEach((s, i) => {
        if (s.item.includes(e.code)) this.inputs[i].itemCount++;
      });
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (e.code === 'KeyR') this.onRestart?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.buildTouch();
  }

  private down(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Samples the current input for a local slot (0 or 1). */
  read(slot: number): Input {
    const inp = this.inputs[slot];
    if (!this.enabled) {
      inp.steer = 0;
      inp.accel = 0;
      inp.brake = 0;
      inp.drift = false;
      return inp;
    }
    const set = this.twoPlayer ? (slot === 0 ? P1 : P2) : SOLO;
    let steer = (this.down(set.right) ? 1 : 0) - (this.down(set.left) ? 1 : 0);
    let accel = this.down(set.up) ? 1 : 0;
    let brake = this.down(set.down) ? 1 : 0;
    let drift = this.down(set.drift);
    if (slot === 0 && this.touchActive) {
      steer += (this.touch.right ? 1 : 0) - (this.touch.left ? 1 : 0);
      accel = Math.max(accel, this.touch.gas ? 1 : 0);
      brake = Math.max(brake, this.touch.brake ? 1 : 0);
      drift = drift || this.touch.drift;
    }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[slot] ?? (slot === 0 && !this.twoPlayer ? pads.find((p) => p) ?? null : null);
    if (pad && pad.connected) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.14) steer += ax;
      const dl = pad.buttons[14]?.pressed;
      const dr = pad.buttons[15]?.pressed;
      if (dl) steer -= 1;
      if (dr) steer += 1;
      if (pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.2) accel = Math.max(accel, pad.buttons[7]?.value || 1);
      if (pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.2) brake = 1;
      if (pad.buttons[5]?.pressed || pad.buttons[4]?.pressed) drift = true;
      const it = !!(pad.buttons[2]?.pressed || pad.buttons[3]?.pressed);
      if (it && !this.padPrevItem[slot]) inp.itemCount++;
      this.padPrevItem[slot] = it;
      if (pad.buttons[9]?.pressed) this.onPause?.();
    }
    inp.steer = clamp(steer, -1, 1);
    inp.accel = accel;
    inp.brake = brake;
    inp.drift = drift;
    return inp;
  }

  pressItemTouch(): void {
    this.inputs[0].itemCount++;
  }

  private buildTouch(): void {
    const el = document.createElement('div');
    el.className = 'mk-touch';
    el.style.display = 'none';
    const mk = (cls: string, label: string, key: keyof InputManager['touch'] | 'item') => {
      const b = document.createElement('button');
      b.className = `mk-tbtn ${cls}`;
      b.textContent = label;
      const set = (v: boolean) => {
        if (key === 'item') {
          if (v) this.pressItemTouch();
        } else this.touch[key] = v;
        b.classList.toggle('on', v);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        set(true);
      });
      const up = (e: Event) => {
        e.preventDefault();
        set(false);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      el.appendChild(b);
    };
    mk('t-left', '◀', 'left');
    mk('t-right', '▶', 'right');
    mk('t-gas', 'ACELERA', 'gas');
    mk('t-brake', 'RÉ', 'brake');
    mk('t-drift', 'DRIFT', 'drift');
    mk('t-item', 'ITEM', 'item');
    document.body.appendChild(el);
    this.touchEl = el;
    window.addEventListener(
      'touchstart',
      () => {
        this.touchActive = true;
      },
      { once: true, passive: true },
    );
  }

  showTouch(show: boolean): void {
    if (!this.touchEl) return;
    this.touchEl.style.display = show && this.touchActive ? 'block' : 'none';
    if (!show) this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
  }

  refreshTouchVisibility(inRace: boolean): void {
    this.showTouch(inRace && !this.twoPlayer);
  }
}
