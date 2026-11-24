import type { Input } from './types';

const P1 = {
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['KeyW', 'Space'],
  dive: ['KeyS', 'ShiftLeft'],
  grab: ['KeyE', 'KeyF'],
};
const P2 = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  jump: ['ArrowUp'],
  dive: ['ArrowDown'],
  grab: ['Enter', 'ShiftRight', 'Slash', 'NumpadEnter'],
};

type Layout = typeof P1;

export class Controls {
  private keys = new Set<string>();
  private edges = [
    { jump: false, dive: false },
    { jump: false, dive: false },
  ];
  private touch = { l: false, r: false, g: false };
  split = false;
  active = false;
  onTab: () => void = () => {};
  onRestart: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') this.onTab();
      if (e.code === 'KeyR') this.onRestart();
      const solo = !this.split;
      const fire = (slot: number, lay: Layout): void => {
        if (lay.jump.includes(e.code)) this.edges[slot].jump = true;
        if (lay.dive.includes(e.code)) this.edges[slot].dive = true;
      };
      fire(0, P1);
      if (solo) fire(0, P2);
      else fire(1, P2);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  private axis(lay: Layout): number {
    const l = lay.left.some((k) => this.keys.has(k));
    const r = lay.right.some((k) => this.keys.has(k));
    return (r ? 1 : 0) - (l ? 1 : 0);
  }

  read(slot: number): Input {
    const lay = slot === 0 ? P1 : P2;
    let mx = this.axis(lay);
    let grab = lay.grab.some((k) => this.keys.has(k));
    if (slot === 0 && !this.split) {
      mx = clampAxis(mx + this.axis(P2));
      grab = grab || P2.grab.some((k) => this.keys.has(k));
      mx = clampAxis(mx + (this.touch.r ? 1 : 0) - (this.touch.l ? 1 : 0));
      grab = grab || this.touch.g;
    }
    const e = this.edges[slot];
    const inp: Input = { mx, jump: e.jump, dive: e.dive, grab };
    e.jump = false;
    e.dive = false;
    return inp;
  }

  /** peek without consuming edges */
  clearEdges(): void {
    for (const e of this.edges) {
      e.jump = false;
      e.dive = false;
    }
  }

  initTouch(root: HTMLElement): void {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!coarse) return;
    const wrap = document.createElement('div');
    wrap.className = 'fg-touch';
    wrap.innerHTML = `
      <div class="fg-pad left">
        <button data-k="l">◀</button>
        <button data-k="r">▶</button>
      </div>
      <div class="fg-pad right">
        <button data-k="g">✋<small>AGARRAR</small></button>
        <button data-k="d">🤸<small>MERGULHO</small></button>
        <button data-k="j" class="big">🦘<small>PULAR</small></button>
      </div>`;
    root.appendChild(wrap);
    const bind = (btn: HTMLButtonElement): void => {
      const k = btn.dataset.k!;
      const down = (ev: Event): void => {
        ev.preventDefault();
        if (k === 'l') this.touch.l = true;
        if (k === 'r') this.touch.r = true;
        if (k === 'g') this.touch.g = true;
        if (k === 'j') this.edges[0].jump = true;
        if (k === 'd') this.edges[0].dive = true;
        btn.classList.add('on');
      };
      const up = (ev: Event): void => {
        ev.preventDefault();
        if (k === 'l') this.touch.l = false;
        if (k === 'r') this.touch.r = false;
        if (k === 'g') this.touch.g = false;
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    wrap.querySelectorAll('button').forEach((b) => bind(b as HTMLButtonElement));
    this.touchEl = wrap;
  }

  touchEl: HTMLElement | null = null;

  showTouch(show: boolean): void {
    if (this.touchEl) this.touchEl.style.display = show ? 'flex' : 'none';
  }
}

function clampAxis(v: number): number {
  return v > 1 ? 1 : v < -1 ? -1 : v;
}
