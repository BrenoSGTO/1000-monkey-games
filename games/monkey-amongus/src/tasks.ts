import { sfx } from './audio';
import type { SabotageKind, TaskSpot } from './types';

export interface TaskModalCallbacks {
  onTaskComplete: (taskId: string) => void;
  onSabotageFixed: (kind: SabotageKind) => void;
  onScanStateChange: (scanning: boolean) => void;
  onClose: () => void;
}

export class TaskModalController {
  private overlay: HTMLDivElement;
  private card: HTMLDivElement;
  private callbacks: TaskModalCallbacks;
  private activeCleanup: (() => void) | null = null;
  private isOpen = false;

  constructor(callbacks: TaskModalCallbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.className = 'ma-overlay';
    this.overlay.style.zIndex = '650';

    this.card = document.createElement('div');
    this.card.className = 'ma-card';
    this.card.style.maxWidth = '540px';
    this.overlay.appendChild(this.card);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  opened(): boolean {
    return this.isOpen;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.activeCleanup) {
      this.activeCleanup();
      this.activeCleanup = null;
    }
    this.callbacks.onScanStateChange(false);
    this.overlay.classList.remove('open');
    this.card.innerHTML = '';
    this.callbacks.onClose();
  }

  openTask(task: TaskSpot): void {
    this.closeInternalOnly();
    this.isOpen = true;
    this.overlay.classList.add('open');
    sfx.playClick();

    switch (task.kind) {
      case 'wires':
        this.renderWiresTask(task);
        break;
      case 'peel':
        this.renderPeelTask(task);
        break;
      case 'scan':
        this.renderScanTask(task);
        break;
      case 'reactor_nums':
        this.renderReactorNumsTask(task);
        break;
      case 'asteroids':
        this.renderAsteroidsTask(task);
        break;
    }
  }

  openSabotageFix(kind: SabotageKind): void {
    this.closeInternalOnly();
    this.isOpen = true;
    this.overlay.classList.add('open');
    sfx.playClick();

    if (kind === 'lights') {
      this.renderLightsFix();
    } else {
      this.renderReactorFix();
    }
  }

  private closeInternalOnly(): void {
    if (this.activeCleanup) {
      this.activeCleanup();
      this.activeCleanup = null;
    }
    this.callbacks.onScanStateChange(false);
  }

  private headerHtml(title: string, subtitle: string): string {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;">
        <div>
          <div style="font-size:18px;font-weight:900;color:#facc15;">${title}</div>
          <div style="font-size:12px;color:#94a3b8;">${subtitle}</div>
        </div>
        <button class="ma-btn" id="ma-task-close">✖ Fechar (ESC)</button>
      </div>
    `;
  }

  private bindCloseBtn(): void {
    const btn = this.card.querySelector<HTMLButtonElement>('#ma-task-close');
    if (btn) btn.onclick = () => this.close();
  }

  private finishTask(taskId: string, bannerText: string): void {
    sfx.playTaskComplete();
    this.card.innerHTML = `
      <div style="text-align:center;padding:34px 16px;">
        <div style="font-size:52px;margin-bottom:10px;">🍌✅</div>
        <div style="font-size:22px;font-weight:900;color:#4ade80;">TAREFA CONCLUÍDA!</div>
        <div style="font-size:14px;color:#cbd5e1;margin-top:6px;">${bannerText}</div>
      </div>
    `;
    const timer = window.setTimeout(() => {
      this.callbacks.onTaskComplete(taskId);
      this.close();
    }, 650);
    this.activeCleanup = () => window.clearTimeout(timer);
  }

  // 1. FIOS DE CIPÓ (Wires)
  private renderWiresTask(task: TaskSpot): void {
    const colors = [
      { id: 'yellow', label: 'Banana', hex: '#facc15' },
      { id: 'green', label: 'Cipó', hex: '#22c55e' },
      { id: 'red', label: 'Guaraná', hex: '#ef4444' },
      { id: 'blue', label: 'Céu', hex: '#38bdf8' },
    ];
    const leftOrder = [...colors].sort(() => Math.random() - 0.5);
    const rightOrder = [...colors].sort(() => Math.random() - 0.5);
    const connected = new Map<string, string>(); // colorId -> rightColorId
    let selectedLeft: string | null = null;

    this.card.innerHTML = `
      ${this.headerHtml(`🔌 ${task.title}`, `${task.roomLabel} · Clique na esquerda e ligue na cor certa da direita!`)}
      <div style="position:relative;background:#020617;border:2px solid #334155;border-radius:14px;padding:18px;height:270px;display:flex;justify-content:space-between;align-items:center;">
        <svg id="ma-wires-svg" viewBox="0 0 460 230" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></svg>
        <div id="ma-wires-left" style="display:flex;flex-direction:column;gap:18px;z-index:2;"></div>
        <div id="ma-wires-right" style="display:flex;flex-direction:column;gap:18px;z-index:2;"></div>
      </div>
    `;
    this.bindCloseBtn();

    const leftCol = this.card.querySelector<HTMLDivElement>('#ma-wires-left')!;
    const rightCol = this.card.querySelector<HTMLDivElement>('#ma-wires-right')!;
    const svg = this.card.querySelector<SVGSVGElement>('#ma-wires-svg')!;

    const redraw = () => {
      svg.innerHTML = '';
      for (const [cId] of connected) {
        const lIdx = leftOrder.findIndex((c) => c.id === cId);
        const rIdx = rightOrder.findIndex((c) => c.id === cId);
        const col = colors.find((c) => c.id === cId)!;
        const y1 = 36 + lIdx * 54;
        const y2 = 36 + rIdx * 54;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M 64 ${y1} C 190 ${y1}, 270 ${y2}, 396 ${y2}`);
        path.setAttribute('stroke', col.hex);
        path.setAttribute('stroke-width', '10');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
      }
      leftCol.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
        const id = btn.dataset.id!;
        btn.style.outline = selectedLeft === id ? '3px solid #fff' : 'none';
        btn.style.opacity = connected.has(id) ? '0.6' : '1';
      });
    };

    leftOrder.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'ma-btn';
      btn.dataset.id = c.id;
      btn.style.background = c.hex;
      btn.style.color = '#111827';
      btn.style.borderColor = '#0f172a';
      btn.style.width = '106px';
      btn.textContent = `🌿 ${c.label}`;
      btn.onclick = () => {
        if (connected.has(c.id)) return;
        sfx.playClick();
        selectedLeft = c.id;
        redraw();
      };
      leftCol.appendChild(btn);
    });

    rightOrder.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'ma-btn';
      btn.dataset.id = c.id;
      btn.style.background = c.hex;
      btn.style.color = '#111827';
      btn.style.borderColor = '#0f172a';
      btn.style.width = '106px';
      btn.textContent = `⚡ ${c.label}`;
      btn.onclick = () => {
        if (!selectedLeft) return;
        if (selectedLeft === c.id) {
          connected.set(c.id, c.id);
          selectedLeft = null;
          sfx.playScannerBeep();
          redraw();
          if (connected.size === colors.length) {
            this.finishTask(task.id, 'Todos os cipós elétricos religados!');
          }
        } else {
          sfx.playError();
          selectedLeft = null;
          redraw();
        }
      };
      rightCol.appendChild(btn);
    });
  }

  // 2. DESCASCAR BANANAS (Peel 5 bananas in rhythm/sequence)
  private renderPeelTask(task: TaskSpot): void {
    let peeled = 0;
    const total = 5;
    let phase = 0;
    let rafId = 0;

    this.card.innerHTML = `
      ${this.headerHtml(`🍌 ${task.title}`, `${task.roomLabel} · Clique no botão quando o anel amarelo estiver no alvo!`)}
      <div style="background:#020617;border:2px solid #334155;border-radius:14px;padding:20px;text-align:center;">
        <div id="ma-peel-count" style="font-size:16px;font-weight:900;color:#fde047;margin-bottom:14px;">Bananas descascadas: 0 / ${total}</div>
        <div style="position:relative;width:160px;height:160px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
          <div id="ma-peel-ring" style="position:absolute;inset:0;border-radius:999px;border:5px solid #facc15;pointer-events:none;"></div>
          <div style="position:absolute;inset:24px;border-radius:999px;border:3px dashed #4ade80;pointer-events:none;"></div>
          <button id="ma-peel-btn" class="ma-btn primary" style="width:94px;height:94px;border-radius:999px;font-size:40px;display:flex;align-items:center;justify-content:center;">🍌</button>
        </div>
        <div id="ma-peel-feedback" style="font-size:13px;font-weight:800;color:#94a3b8;height:20px;">Clique no ritmo!</div>
      </div>
    `;
    this.bindCloseBtn();

    const ring = this.card.querySelector<HTMLDivElement>('#ma-peel-ring')!;
    const btn = this.card.querySelector<HTMLButtonElement>('#ma-peel-btn')!;
    const countEl = this.card.querySelector<HTMLDivElement>('#ma-peel-count')!;
    const fbEl = this.card.querySelector<HTMLDivElement>('#ma-peel-feedback')!;

    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastT) / 1000;
      lastT = now;
      phase = (phase + dt * 1.45) % 1;
      const scale = 1.25 - phase * 0.72;
      ring.style.transform = `scale(${scale.toFixed(3)})`;
      const inSweet = scale >= 0.56 && scale <= 0.96;
      ring.style.borderColor = inSweet ? '#4ade80' : '#facc15';
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    btn.onclick = () => {
      const scale = 1.25 - phase * 0.72;
      if (scale >= 0.52 && scale <= 1.02) {
        peeled++;
        sfx.playScannerBeep();
        countEl.textContent = `Bananas descascadas: ${peeled} / ${total}`;
        fbEl.textContent = 'NHAC! Descascada perfeita! ✨';
        fbEl.style.color = '#4ade80';
        if (peeled >= total) {
          cancelAnimationFrame(rafId);
          this.finishTask(task.id, '5 bananas fresquinhas descascadas!');
        }
      } else {
        sfx.playError();
        fbEl.textContent = 'Errou o ritmo! Espere o anel ficar verde!';
        fbEl.style.color = '#fb7185';
      }
    };

    this.activeCleanup = () => cancelAnimationFrame(rafId);
  }

  // 3. SCANNER DE CALVÍCIE (4s visible medbay scan)
  private renderScanTask(task: TaskSpot): void {
    this.callbacks.onScanStateChange(true);
    const duration = 4.0;
    let elapsed = 0;
    let lastBeep = -1;

    this.card.innerHTML = `
      ${this.headerHtml(`🧬 ${task.title}`, `${task.roomLabel} · Outros macacos podem ver você escaneando!`)}
      <div style="background:#020617;border:2px solid #22c55e;border-radius:14px;padding:22px;text-align:center;">
        <div style="font-size:56px;margin-bottom:8px;">🐒💨</div>
        <div id="ma-scan-msg" style="font-size:14px;font-weight:800;color:#86efac;margin-bottom:12px;">Iniciando varredura craniana...</div>
        <div style="height:20px;background:#0f172a;border-radius:999px;overflow:hidden;border:2px solid #16a34a;">
          <div id="ma-scan-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#86efac);transition:width 0.08s linear;"></div>
        </div>
        <div id="ma-scan-pct" style="font-size:13px;font-weight:900;color:#4ade80;margin-top:8px;">0%</div>
      </div>
    `;
    this.bindCloseBtn();

    const bar = this.card.querySelector<HTMLDivElement>('#ma-scan-bar')!;
    const pct = this.card.querySelector<HTMLDivElement>('#ma-scan-pct')!;
    const msg = this.card.querySelector<HTMLDivElement>('#ma-scan-msg')!;

    const messages = [
      'Medindo brilho da calvície...',
      'Contando neurônios de banana...',
      'Verificando DNA de Falso Primata...',
      'Diagnóstico: 100% Calvo e Inocente!',
    ];

    let last = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      elapsed += dt;
      const ratio = Math.min(1, elapsed / duration);
      bar.style.width = `${Math.floor(ratio * 100)}%`;
      pct.textContent = `${Math.floor(ratio * 100)}%`;
      const idx = Math.min(messages.length - 1, Math.floor(ratio * messages.length));
      msg.textContent = messages[idx];
      if (idx !== lastBeep) {
        lastBeep = idx;
        sfx.playScannerBeep();
      }
      if (ratio >= 1) {
        this.callbacks.onScanStateChange(false);
        this.finishTask(task.id, 'Calvície verificada: Tripulante Autêntico!');
        return;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);

    this.activeCleanup = () => {
      cancelAnimationFrame(rafId);
      this.callbacks.onScanStateChange(false);
    };
  }

  // 4. CALIBRAR REATOR (Click 1..6 in order)
  private renderReactorNumsTask(task: TaskSpot): void {
    const nums = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    let nextNum = 1;

    this.card.innerHTML = `
      ${this.headerHtml(`☢️ ${task.title}`, `${task.roomLabel} · Clique nos números de 1 a 6 em ordem crescente!`)}
      <div id="ma-num-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#020617;border:2px solid #38bdf8;border-radius:14px;padding:18px;"></div>
      <div id="ma-num-status" style="text-align:center;margin-top:10px;font-size:13px;font-weight:800;color:#7dd3fc;">Próximo número: 1</div>
    `;
    this.bindCloseBtn();

    const grid = this.card.querySelector<HTMLDivElement>('#ma-num-grid')!;
    const status = this.card.querySelector<HTMLDivElement>('#ma-num-status')!;

    const renderButtons = () => {
      grid.innerHTML = '';
      for (const n of nums) {
        const b = document.createElement('button');
        b.className = 'ma-btn';
        b.style.fontSize = '24px';
        b.style.padding = '18px 0';
        const done = n < nextNum;
        b.style.background = done ? '#16a34a' : '#1e293b';
        b.style.borderColor = done ? '#86efac' : '#38bdf8';
        b.textContent = `${n}`;
        b.onclick = () => {
          if (done) return;
          if (n === nextNum) {
            sfx.playScannerBeep();
            nextNum++;
            if (nextNum > 6) {
              this.finishTask(task.id, 'Potássio do reator 100% estabilizado!');
              return;
            }
            status.textContent = `Próximo número: ${nextNum}`;
            status.style.color = '#7dd3fc';
            renderButtons();
          } else {
            sfx.playError();
            nextNum = 1;
            status.textContent = 'Ordem errada! Reiniciado — clique no 1!';
            status.style.color = '#fb7185';
            renderButtons();
          }
        };
        grid.appendChild(b);
      }
    };
    renderButtons();
  }

  // 5. DESVIAR DE COCOS ESPACIAIS (Click 5 space coconuts)
  private renderAsteroidsTask(task: TaskSpot): void {
    let destroyed = 0;
    const goal = 5;

    this.card.innerHTML = `
      ${this.headerHtml(`🥥 ${task.title}`, `${task.roomLabel} · Clique nos 5 cocos espaciais na mira!`)}
      <div style="text-align:center;">
        <div id="ma-ast-score" style="font-size:14px;font-weight:900;color:#7dd3fc;margin-bottom:8px;">Cocos destruídos: 0 / ${goal}</div>
        <canvas id="ma-ast-canvas" width="460" height="250" style="width:100%;max-width:460px;background:#020617;border:2px solid #3b82f6;border-radius:14px;cursor:crosshair;"></canvas>
      </div>
    `;
    this.bindCloseBtn();

    const canvas = this.card.querySelector<HTMLCanvasElement>('#ma-ast-canvas')!;
    const scoreEl = this.card.querySelector<HTMLDivElement>('#ma-ast-score')!;
    const ctx = canvas.getContext('2d')!;

    interface Coco {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      rot: number;
    }

    const spawnCoco = (): Coco => ({
      x: canvas.width + 30,
      y: 34 + Math.random() * (canvas.height - 68),
      vx: -(95 + Math.random() * 110),
      vy: (Math.random() - 0.5) * 48,
      r: 22 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
    });

    const cocos: Coco[] = [spawnCoco(), spawnCoco(), spawnCoco()];
    let laserFlash: { x: number; y: number; ttl: number } | null = null;
    let last = performance.now();
    let rafId = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Radar grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = 1;
      for (let gx = 46; gx < canvas.width; gx += 46) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, canvas.height);
        ctx.stroke();
      }
      for (let gy = 50; gy < canvas.height; gy += 50) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvas.width, gy);
        ctx.stroke();
      }

      for (let i = 0; i < cocos.length; i++) {
        const c = cocos[i];
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += dt * 2.2;
        if (c.y < 26 || c.y > canvas.height - 26) c.vy *= -1;
        if (c.x < -36) cocos[i] = spawnCoco();

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Coconut face dots
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(-6, -5, 3.2, 0, Math.PI * 2);
        ctx.arc(5, -5, 3.2, 0, Math.PI * 2);
        ctx.arc(0, 5, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (laserFlash && laserFlash.ttl > 0) {
        laserFlash.ttl -= dt;
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, canvas.height);
        ctx.lineTo(laserFlash.x, laserFlash.y);
        ctx.stroke();
      }

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    canvas.onpointerdown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      laserFlash = { x: sx, y: sy, ttl: 0.14 };

      for (let i = cocos.length - 1; i >= 0; i--) {
        const c = cocos[i];
        if (Math.hypot(sx - c.x, sy - c.y) <= c.r + 12) {
          cocos[i] = spawnCoco();
          destroyed++;
          sfx.playScannerBeep();
          scoreEl.textContent = `Cocos destruídos: ${destroyed} / ${goal}`;
          if (destroyed >= goal) {
            cancelAnimationFrame(rafId);
            this.finishTask(task.id, 'Rota limpa de cocos espaciais!');
          }
          return;
        }
      }
      sfx.playClick();
    };

    this.activeCleanup = () => cancelAnimationFrame(rafId);
  }

  // SABOTAGE FIX: LIGHTS
  private renderLightsFix(): void {
    const switches = [false, true, false, false, true];
    // Guarantee at least 3 off
    switches[0] = false;
    switches[2] = false;
    switches[3] = false;

    this.card.innerHTML = `
      ${this.headerHtml('💡 Disjuntores da Elétrica', 'Sabotagem de Luz! Ligue todos os 5 disjuntores para VERDE!')}
      <div id="ma-switches" style="display:flex;justify-content:center;gap:14px;background:#020617;border:2px solid #facc15;border-radius:14px;padding:24px;"></div>
    `;
    this.bindCloseBtn();

    const wrap = this.card.querySelector<HTMLDivElement>('#ma-switches')!;
    const draw = () => {
      wrap.innerHTML = '';
      switches.forEach((on, idx) => {
        const btn = document.createElement('button');
        btn.className = 'ma-btn';
        btn.style.width = '64px';
        btn.style.height = '110px';
        btn.style.fontSize = '15px';
        btn.style.background = on ? '#16a34a' : '#7f1d1d';
        btn.style.borderColor = on ? '#86efac' : '#f87171';
        btn.textContent = on ? 'ON\n🟢' : 'OFF\n🔴';
        btn.onclick = () => {
          switches[idx] = !switches[idx];
          sfx.playClick();
          draw();
          if (switches.every(Boolean)) {
            sfx.playTaskComplete();
            this.callbacks.onSabotageFixed('lights');
            this.close();
          }
        };
        wrap.appendChild(btn);
      });
    };
    draw();
  }

  // SABOTAGE FIX: REACTOR MELTDOWN
  private renderReactorFix(): void {
    let charge = 0;
    let holding = false;

    this.card.innerHTML = `
      ${this.headerHtml('☢️ Estabilizar Reator de Potássio', 'Segure o scanner biométrico (ou clique rápido) para cancelar o derretimento!')}
      <div style="background:#020617;border:2px solid #ef4444;border-radius:14px;padding:24px;text-align:center;">
        <button id="ma-hold-reactor" class="ma-btn danger" style="width:150px;height:150px;border-radius:999px;font-size:16px;margin-bottom:16px;">
          ✋<br/>SEGURE<br/>AQUI!
        </button>
        <div style="height:22px;background:#0f172a;border-radius:999px;overflow:hidden;border:2px solid #ef4444;">
          <div id="ma-reactor-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#f97316,#4ade80);"></div>
        </div>
      </div>
    `;
    this.bindCloseBtn();

    const btn = this.card.querySelector<HTMLButtonElement>('#ma-hold-reactor')!;
    const bar = this.card.querySelector<HTMLDivElement>('#ma-reactor-bar')!;

    btn.onpointerdown = () => {
      holding = true;
      charge = Math.min(1, charge + 0.14);
      sfx.playScannerBeep();
    };
    const stopHold = () => {
      holding = false;
    };
    btn.onpointerup = stopHold;
    btn.onpointerleave = stopHold;

    let last = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (holding) {
        charge = Math.min(1, charge + dt * 0.55);
      } else {
        charge = Math.max(0, charge - dt * 0.18);
      }
      bar.style.width = `${Math.floor(charge * 100)}%`;
      if (charge >= 1) {
        sfx.playTaskComplete();
        this.callbacks.onSabotageFixed('reactor');
        this.close();
        return;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    this.activeCleanup = () => cancelAnimationFrame(rafId);
  }
}
