import { monkeyAudio } from './audio';

/**
 * Cartilha de Controles ilustrada (modal) compartilhada por todos os jogos.
 *
 * Uma entrada (`ControlInput`) pode ser:
 *  - string de tecla: 'W', 'Space', 'ArrowUp', 'Shift', 'Enter', 'Esc', '1', 'F'...
 *    Use '+' para combinação simultânea: 'Shift+W', 'Ctrl+Z'.
 *  - cluster ilustrado: 'WASD' ou 'Arrows' (desenha a cruz de teclas)
 *  - mouse: { mouse: 'left' | 'right' | 'middle' | 'wheel' | 'move' | 'drag' }
 *  - toque: { touch: 'tap' | 'hold' | 'drag' | 'swipe' | 'pinch' }
 *  - botão na tela: { ui: 'Texto do botão' }
 */
export type ControlInput =
  | string
  | { mouse: 'left' | 'right' | 'middle' | 'wheel' | 'move' | 'drag' }
  | { touch: 'tap' | 'hold' | 'drag' | 'swipe' | 'pinch' }
  | { ui: string };

export interface ControlBinding {
  /** Alternativas equivalentes (renderizadas com "ou" entre elas). */
  inputs: ControlInput[];
  /** O que acontece, curto e direto: "Pular", "Acelerar". */
  action: string;
  /** Explicação extra opcional: "Segure para pular mais alto". */
  detail?: string;
}

export interface ControlSection {
  title: string;
  /** Emoji do cabeçalho da seção. */
  icon?: string;
  /** Cor de destaque (ex.: cor do Jogador 1 / Jogador 2). */
  color?: string;
  bindings: ControlBinding[];
}

export interface ControlsGuideConfig {
  slug: string;
  title: string;
  /** Objetivo do jogo em 1 frase. */
  goal?: string;
  sections: ControlSection[];
  /** Dicas rápidas exibidas no rodapé. */
  tips?: string[];
  /** Abre automaticamente na primeira visita do jogador (padrão: true). */
  autoOpenFirstVisit?: boolean;
  /** Chamado ao abrir/fechar (use para pausar o jogo). */
  onOpenChange?: (open: boolean) => void;
}

export interface ControlsGuideHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  destroy: () => void;
}

const STYLE_ID = 'monkey-sdk-controls-guide-styles';

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .mcg-backdrop {
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(3px);
      display: none; align-items: center; justify-content: center;
      padding: 16px;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    .mcg-backdrop.open { display: flex; animation: mcg-fade 0.15s ease; }
    .mcg-card {
      width: min(860px, 100%); max-height: calc(100vh - 32px); overflow: auto;
      background: linear-gradient(180deg, #1e1b4b 0%, #111827 60%);
      color: #f9fafb; border: 3px solid #facc15; border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 6px 0 #a16207;
      padding: 18px 20px 16px; position: relative;
      animation: mcg-pop 0.2s ease;
    }
    .mcg-head { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; padding-right: 40px; }
    .mcg-head .mcg-monkey { font-size: 38px; line-height: 1; filter: drop-shadow(0 3px 0 rgba(0,0,0,0.4)); }
    .mcg-head h2 { margin: 0; font-size: 22px; color: #fde047; letter-spacing: 0.3px; }
    .mcg-head small { display: block; color: #a5b4fc; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .mcg-goal {
      margin: 10px 0 14px; padding: 10px 12px; border-radius: 12px;
      background: rgba(250, 204, 21, 0.12); border: 1px dashed rgba(250, 204, 21, 0.5);
      font-size: 14px; color: #fef9c3;
    }
    .mcg-close {
      position: absolute; top: 12px; right: 12px; width: 36px; height: 36px;
      border-radius: 50%; border: 2px solid #facc15; background: #111827; color: #fde047;
      font-size: 18px; font-weight: 900; cursor: pointer;
    }
    .mcg-close:hover { background: #1f2937; }
    .mcg-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
    .mcg-section {
      background: rgba(15, 23, 42, 0.75); border: 2px solid var(--mcg-accent, #334155);
      border-radius: 14px; padding: 10px 12px;
    }
    .mcg-section h3 {
      margin: 0 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;
      color: var(--mcg-accent, #fde047);
    }
    .mcg-row {
      display: flex; align-items: center; gap: 12px; padding: 8px 4px;
      border-top: 1px solid rgba(255,255,255,0.07);
    }
    .mcg-row:first-of-type { border-top: none; }
    .mcg-inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 120px; max-width: 58%; }
    .mcg-or { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
    .mcg-plus { font-size: 14px; font-weight: 900; color: #94a3b8; }
    .mcg-combo { display: inline-flex; align-items: center; gap: 3px; }
    .mcg-action { flex: 1; min-width: 0; }
    .mcg-action b { display: block; font-size: 15px; color: #fff; }
    .mcg-action span { display: block; font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .mcg-key {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 34px; height: 34px; padding: 0 8px; box-sizing: border-box;
      background: linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%);
      color: #0f172a; border: 1px solid #94a3b8; border-radius: 8px;
      box-shadow: 0 4px 0 #475569, 0 5px 8px rgba(0,0,0,0.4);
      font-weight: 900; font-size: 14px; white-space: nowrap;
      transform: translateY(-2px);
      transition: transform 0.06s ease, box-shadow 0.06s ease, background 0.06s ease;
    }
    .mcg-key.wide { min-width: 96px; font-size: 12px; }
    .mcg-key.mid { min-width: 56px; font-size: 12px; }
    .mcg-key.pressed {
      transform: translateY(2px);
      background: linear-gradient(180deg, #fde047 0%, #facc15 100%);
      box-shadow: 0 0 0 #475569, 0 0 14px rgba(250, 204, 21, 0.8);
    }
    .mcg-cluster { display: inline-grid; grid-template-columns: repeat(3, 34px); grid-template-rows: 34px 34px; gap: 6px 4px; }
    .mcg-cluster .mcg-key { min-width: 34px; padding: 0; }
    .mcg-cluster .up { grid-column: 2; grid-row: 1; }
    .mcg-cluster .left { grid-column: 1; grid-row: 2; }
    .mcg-cluster .down { grid-column: 2; grid-row: 2; }
    .mcg-cluster .right { grid-column: 3; grid-row: 2; }
    .mcg-pic { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; color: #cbd5e1; }
    .mcg-pic svg { width: 34px; height: 40px; }
    .mcg-ui {
      display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px;
      background: #111827; border: 2px solid #facc15; color: #fef08a; font-size: 12px; font-weight: 800;
    }
    .mcg-tips { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
    .mcg-tip {
      font-size: 12px; color: #e0f2fe; background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 10px; padding: 6px 10px;
    }
    .mcg-foot { margin-top: 12px; font-size: 11px; color: #64748b; text-align: center; }
    .mcg-foot .mcg-key { min-width: 26px; height: 24px; font-size: 11px; box-shadow: 0 2px 0 #475569; transform: none; }
    @keyframes mcg-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes mcg-pop { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @media (max-width: 520px) {
      .mcg-card { padding: 14px 12px; }
      .mcg-sections { grid-template-columns: 1fr; }
      .mcg-inputs { max-width: 62%; }
    }
  `;
  document.head.appendChild(style);
}

/** Normaliza um nome de tecla (config ou KeyboardEvent) para um id comparável. */
function keyId(raw: string): string {
  const k = raw.trim();
  const lower = k.toLowerCase();
  const aliases: Record<string, string> = {
    ' ': 'space', spacebar: 'space', espaço: 'space', espaco: 'space',
    escape: 'esc', control: 'ctrl', return: 'enter',
    up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
    '↑': 'arrowup', '↓': 'arrowdown', '←': 'arrowleft', '→': 'arrowright',
    meta: 'meta', del: 'delete',
  };
  return aliases[lower] ?? lower;
}

const KEY_LABELS: Record<string, string> = {
  space: 'ESPAÇO', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  enter: 'Enter ⏎', shift: '⇧ Shift', ctrl: 'Ctrl', alt: 'Alt', tab: 'Tab ⇥',
  esc: 'Esc', backspace: '⌫', delete: 'Del', meta: '⌘',
};

function keyCap(raw: string, extraClass = ''): string {
  const id = keyId(raw);
  const label = KEY_LABELS[id] ?? (raw.length === 1 ? raw.toUpperCase() : raw);
  const size = id === 'space' ? 'wide' : label.length > 3 ? 'mid' : '';
  return `<span class="mcg-key ${size} ${extraClass}" data-key="${escapeHtml(id)}">${escapeHtml(label)}</span>`;
}

function cluster(kind: 'wasd' | 'arrows'): string {
  const keys = kind === 'wasd' ? ['W', 'A', 'S', 'D'] : ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  const cls = ['up', 'left', 'down', 'right'];
  return `<span class="mcg-cluster">${keys.map((k, i) => keyCap(k, cls[i])).join('')}</span>`;
}

function mouseSvg(part: string): string {
  const hl = '#facc15';
  const base = '#e2e8f0';
  const left = part === 'left' ? hl : base;
  const right = part === 'right' ? hl : base;
  const wheel = part === 'wheel' || part === 'middle' ? hl : '#64748b';
  const arrows =
    part === 'move' || part === 'drag'
      ? `<path d="M3 20 l4 -3 v6 z M31 20 l-4 -3 v6 z" fill="${hl}"/>`
      : part === 'wheel'
        ? `<path d="M17 1 l-3 3 h6 z" fill="${hl}"/>`
        : '';
  return `<svg viewBox="0 0 34 40" aria-hidden="true">
    <rect x="7" y="5" width="20" height="32" rx="10" fill="${base}" stroke="#475569" stroke-width="1.5"/>
    <path d="M7 17 V15 a10 10 0 0 1 10 -10 V17 z" fill="${left}" stroke="#475569" stroke-width="1.2"/>
    <path d="M27 17 V15 a10 10 0 0 0 -10 -10 V17 z" fill="${right}" stroke="#475569" stroke-width="1.2"/>
    <rect x="15" y="8" width="4" height="7" rx="2" fill="${wheel}"/>
    ${arrows}
  </svg>`;
}

const MOUSE_LABELS: Record<string, string> = {
  left: 'Clique', right: 'Botão dir.', middle: 'Botão meio', wheel: 'Rodinha', move: 'Mover', drag: 'Arrastar',
};
const TOUCH: Record<string, [string, string]> = {
  tap: ['👆', 'Tocar'], hold: ['✋', 'Segurar'], drag: ['👉', 'Arrastar'], swipe: ['💨', 'Deslizar'], pinch: ['🤏', 'Pinça'],
};

function renderInput(input: ControlInput): string {
  if (typeof input === 'string') {
    const lower = input.toLowerCase();
    if (lower === 'wasd') return cluster('wasd');
    if (lower === 'arrows' || lower === 'setas') return cluster('arrows');
    if (input.includes('+') && input.length > 1) {
      return `<span class="mcg-combo">${input
        .split('+')
        .map((p) => keyCap(p))
        .join('<span class="mcg-plus">+</span>')}</span>`;
    }
    return keyCap(input);
  }
  if ('mouse' in input) return `<span class="mcg-pic">${mouseSvg(input.mouse)}${MOUSE_LABELS[input.mouse]}</span>`;
  if ('touch' in input) {
    const [emoji, label] = TOUCH[input.touch];
    return `<span class="mcg-pic"><span style="font-size:24px">${emoji}</span>${label}</span>`;
  }
  return `<span class="mcg-ui">${escapeHtml(input.ui)}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function mountControlsGuide(config: ControlsGuideConfig): ControlsGuideHandle {
  ensureStyles();
  const seenKey = `monkey-slop:controls-seen:${config.slug}`;

  const backdrop = document.createElement('div');
  backdrop.className = 'mcg-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `Controles de ${config.title}`);

  const sectionsHtml = config.sections
    .map(
      (s) => `<section class="mcg-section" style="${s.color ? `--mcg-accent:${s.color}` : ''}">
        <h3>${s.icon ? `${s.icon} ` : ''}${escapeHtml(s.title)}</h3>
        ${s.bindings
          .map(
            (b) => `<div class="mcg-row">
              <div class="mcg-inputs">${b.inputs.map(renderInput).join('<span class="mcg-or">ou</span>')}</div>
              <div class="mcg-action"><b>${escapeHtml(b.action)}</b>${b.detail ? `<span>${escapeHtml(b.detail)}</span>` : ''}</div>
            </div>`,
          )
          .join('')}
      </section>`,
    )
    .join('');

  backdrop.innerHTML = `<div class="mcg-card">
    <button class="mcg-close" aria-label="Fechar">✕</button>
    <div class="mcg-head"><span class="mcg-monkey">🐒</span><div><small>Cartilha de Controles</small><h2>${escapeHtml(config.title)}</h2></div></div>
    ${config.goal ? `<div class="mcg-goal">🎯 <b>Objetivo:</b> ${escapeHtml(config.goal)}</div>` : ''}
    <div class="mcg-sections">${sectionsHtml}</div>
    ${config.tips?.length ? `<div class="mcg-tips">${config.tips.map((t) => `<div class="mcg-tip">💡 ${escapeHtml(t)}</div>`).join('')}</div>` : ''}
    <div class="mcg-foot">Aperte as teclas para testar • Abra a qualquer hora com <span class="mcg-key">F1</span> ou o botão 🎮 Controles • <span class="mcg-key">Esc</span> fecha</div>
  </div>`;
  document.body.appendChild(backdrop);

  let open = false;
  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    backdrop.classList.toggle('open', open);
    monkeyAudio.play('click');
    if (!open) {
      try { localStorage.setItem(seenKey, '1'); } catch { /* storage indisponível */ }
      backdrop.querySelectorAll('.mcg-key.pressed').forEach((el) => el.classList.remove('pressed'));
    }
    config.onOpenChange?.(open);
  };

  const highlight = (e: KeyboardEvent, on: boolean) => {
    const ids = new Set([keyId(e.key)]);
    if (e.code.startsWith('Key')) ids.add(e.code.slice(3).toLowerCase());
    if (e.code.startsWith('Digit')) ids.add(e.code.slice(5));
    backdrop.querySelectorAll<HTMLElement>('.mcg-key[data-key]').forEach((el) => {
      if (ids.has(el.dataset.key!)) el.classList.toggle('pressed', on);
    });
  };

  // Captura no window: enquanto aberta, a cartilha "engole" o teclado para o jogo não reagir.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F1') {
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(!open);
      return;
    }
    if (!open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { setOpen(false); return; }
    highlight(e, true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!open) return;
    e.stopImmediatePropagation();
    highlight(e, false);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  backdrop.addEventListener('pointerdown', (e) => e.stopPropagation());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) setOpen(false);
  });
  backdrop.querySelector<HTMLButtonElement>('.mcg-close')!.onclick = () => setOpen(false);

  if (config.autoOpenFirstVisit !== false) {
    let seen = false;
    try { seen = localStorage.getItem(seenKey) === '1'; } catch { /* ignore */ }
    if (!seen) window.setTimeout(() => setOpen(true), 400);
  }

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      backdrop.remove();
    },
  };
}
