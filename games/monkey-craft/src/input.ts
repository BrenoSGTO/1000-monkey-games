export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mx = 0;
  my = 0;
  left = false;
  right = false;
  leftPressed = false;
  rightPressed = false;
  wheel = 0;
  hasMouse = false;
  /** modo do toque: minerar ou colocar */
  touchPlace = false;
  private canvas: HTMLCanvasElement | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const norm = (e: KeyboardEvent): string => {
      if (e.code === 'Space') return 'space';
      if (e.code === 'Tab') return 'tab';
      if (e.code === 'Escape') return 'escape';
      if (e.code.startsWith('Digit')) return e.code.slice(5);
      return e.key.toLowerCase();
    };
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = norm(e);
      if (['space', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(norm(e));
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.left = false;
      this.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.setPos(e);
      this.hasMouse = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const rightBtn = e.button === 2 || (e.pointerType === 'touch' && this.touchPlace);
      if (rightBtn) {
        this.right = true;
        this.rightPressed = true;
      } else {
        this.left = true;
        this.leftPressed = true;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      this.setPos(e);
      this.hasMouse = true;
    });
    const up = (e: PointerEvent) => {
      this.setPos(e);
      if (e.button === 2 || (e.pointerType === 'touch' && this.touchPlace)) this.right = false;
      else this.left = false;
      if (e.pointerType === 'touch') {
        this.left = false;
        this.right = false;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  private setPos(e: PointerEvent): void {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    this.mx = e.clientX - r.left;
    this.my = e.clientY - r.top;
  }

  down(...k: string[]): boolean {
    return k.some((x) => this.keys.has(x));
  }
  hit(...k: string[]): boolean {
    return k.some((x) => this.pressed.has(x));
  }

  endFrame(): void {
    this.pressed.clear();
    this.leftPressed = false;
    this.rightPressed = false;
    this.wheel = 0;
  }
}
