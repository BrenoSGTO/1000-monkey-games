import { MONKEY_SPECS, QUICK_TAUNTS, type QuickTaunt } from './constants';
import { HANDCRAFTED_LEVELS } from './levels';
import { getTotalStars, type SaveData } from './storage';
import type { LevelDef, LocalPlayMode, MonkeyKind, MultiplayerMode } from './types';

const UI_STYLE_ID = 'angry-monkeys-ui-styles';

export function injectUiStyles(): void {
  if (document.getElementById(UI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UI_STYLE_ID;
  style.textContent = `
    .ma-hud-top-right {
      position: fixed;
      top: 10px;
      right: 12px;
      z-index: 500;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      pointer-events: none;
    }
    .ma-hud-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
      pointer-events: auto;
    }
    .ma-pill {
      background: rgba(15, 23, 42, 0.88);
      border: 2px solid #facc15;
      color: #fef08a;
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 3px 0 rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
    }
    .ma-pill.green { border-color: #4ade80; color: #dcfce7; }
    .ma-pill.blue { border-color: #38bdf8; color: #e0f2fe; }
    .ma-pill.red { border-color: #fb7185; color: #ffe4e6; }
    .ma-btn {
      background: rgba(15, 23, 42, 0.9);
      color: #f8fafc;
      border: 2px solid #64748b;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 3px 0 rgba(0,0,0,0.4);
      transition: transform 0.1s ease, border-color 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .ma-btn:hover { transform: translateY(-1px); border-color: #facc15; }
    .ma-btn:active { transform: translateY(1px); }
    .ma-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
    .ma-btn.primary {
      background: linear-gradient(180deg, #facc15, #eab308);
      color: #1e293b;
      border-color: #854d0e;
    }
    .ma-btn.green {
      background: linear-gradient(180deg, #4ade80, #16a34a);
      color: #052e16;
      border-color: #14532d;
    }
    .ma-btn.orange {
      background: linear-gradient(180deg, #fb923c, #ea580c);
      color: #fff;
      border-color: #7c2d12;
    }
    .ma-btn.blue {
      background: linear-gradient(180deg, #38bdf8, #0284c7);
      color: #082f49;
      border-color: #075985;
    }

    /* Turn Banner */
    .ma-turn-banner {
      position: fixed;
      top: 66px;
      left: 50%;
      transform: translateX(-50%) translateY(-12px) scale(0.92);
      z-index: 650;
      background: rgba(15, 23, 42, 0.94);
      border: 3px solid #facc15;
      border-radius: 999px;
      padding: 8px 22px;
      font-size: 16px;
      font-weight: 900;
      color: #fde047;
      box-shadow: 0 10px 26px rgba(0,0,0,0.55);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.22s ease, transform 0.22s ease;
      white-space: nowrap;
    }
    .ma-turn-banner.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }

    /* Quick Taunt Popover */
    .ma-taunt-wrap {
      position: relative;
      display: inline-flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .ma-taunt-wheel {
      margin-top: 6px;
      background: rgba(15, 23, 42, 0.95);
      border: 2px solid #fb923c;
      border-radius: 14px;
      padding: 6px;
      display: none;
      gap: 5px;
      flex-wrap: wrap;
      max-width: 280px;
      justify-content: flex-end;
      box-shadow: 0 10px 24px rgba(0,0,0,0.55);
    }
    .ma-taunt-wheel.open { display: flex; }
    .ma-taunt-chip {
      background: #1e293b;
      color: #ffedd5;
      border: 1px solid #fb923c;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.1s ease, background 0.12s ease;
    }
    .ma-taunt-chip:hover { background: #ea580c; color: #fff; transform: scale(1.04); }

    /* Compact Current Monkey Power Card (bottom-left) */
    .ma-power-card {
      position: fixed;
      bottom: 14px;
      left: 14px;
      z-index: 500;
      background: rgba(15, 23, 42, 0.9);
      border: 2px solid #facc15;
      border-radius: 14px;
      padding: 8px 12px;
      max-width: 270px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.45);
      backdrop-filter: blur(5px);
      pointer-events: none;
      transition: border-color 0.18s ease, transform 0.18s ease;
    }
    .ma-power-card.hidden { display: none; }
    .ma-power-card.ready {
      border-color: #f97316;
      animation: ma-pulse 0.75s infinite alternate;
    }
    .ma-power-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 19px;
      flex-shrink: 0;
    }
    .ma-power-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .ma-power-name {
      font-size: 12px;
      font-weight: 900;
      color: #fef08a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ma-power-desc {
      font-size: 11px;
      font-weight: 700;
      color: #cbd5e1;
      line-height: 1.25;
    }

    .ma-bottom-bar {
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .ma-bottom-bar > * { pointer-events: auto; }
    .ma-hint {
      background: rgba(15, 23, 42, 0.88);
      border: 2px solid #38bdf8;
      color: #e0f2fe;
      border-radius: 999px;
      padding: 7px 16px;
      font-size: 13px;
      font-weight: 800;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      white-space: nowrap;
      pointer-events: none;
    }
    .ma-hint.power {
      border-color: #f97316;
      color: #ffedd5;
      animation: ma-pulse 0.8s infinite alternate;
    }
    @keyframes ma-pulse {
      from { transform: scale(1); }
      to { transform: scale(1.04); }
    }
    .ma-queue-strip {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(15, 23, 42, 0.85);
      border: 2px solid #475569;
      border-radius: 999px;
      padding: 4px 10px;
      pointer-events: auto;
    }
    .ma-q-dot {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid #0f172a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      line-height: 1;
      color: #fff;
    }
    .ma-q-dot.active {
      outline: 2px solid #facc15;
      transform: scale(1.15);
    }
    .ma-overlay {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .ma-overlay.hidden { display: none; }
    .ma-modal {
      width: min(900px, 100%);
      max-height: 90vh;
      overflow-y: auto;
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 3px solid #facc15;
      border-radius: 22px;
      padding: 22px 24px;
      box-shadow: 0 22px 50px rgba(0,0,0,0.65);
      color: #f8fafc;
    }
    .ma-modal h1 {
      margin: 0;
      font-size: clamp(24px, 4vw, 34px);
      color: #fde047;
      text-shadow: 0 3px 0 #78350f;
    }
    .ma-sub {
      margin: 4px 0 14px;
      color: #cbd5e1;
      font-size: 14px;
    }
    .ma-monkey-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    }
    .ma-mcard {
      background: rgba(30, 41, 59, 0.9);
      border: 2px solid #334155;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .ma-mcard strong { display: block; font-size: 12px; margin-bottom: 2px; }
    .ma-mcard span { color: #94a3b8; line-height: 1.3; display: block; }
    .ma-levels-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
      gap: 10px;
      margin: 12px 0 16px;
    }
    .ma-lvl-card {
      background: #1e293b;
      border: 2px solid #475569;
      border-radius: 14px;
      padding: 10px 12px;
      text-align: left;
      cursor: pointer;
      color: #f8fafc;
      transition: transform 0.12s ease, border-color 0.15s ease;
    }
    .ma-lvl-card:hover {
      transform: translateY(-2px);
      border-color: #facc15;
    }
    .ma-lvl-title { font-weight: 800; font-size: 14px; color: #fde047; }
    .ma-lvl-sub { font-size: 11px; color: #94a3b8; margin: 3px 0 6px; }
    .ma-lvl-stars { font-size: 15px; letter-spacing: 2px; }
    .ma-mode-box {
      background: rgba(30, 41, 59, 0.78);
      border: 2px solid #38bdf8;
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
    }
    .ma-mp-box {
      background: rgba(20, 83, 45, 0.35);
      border: 2px solid #4ade80;
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
    }
    .ma-result-box {
      width: min(580px, 100%);
      text-align: center;
    }
    .ma-stars-big {
      font-size: 44px;
      margin: 8px 0;
      letter-spacing: 6px;
      display: flex;
      justify-content: center;
      gap: 8px;
    }
    .ma-star-slot {
      display: inline-block;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
    }
    .ma-star-slot.dim { opacity: 0.2; transform: scale(0.85); }
    .ma-star-slot.pop { opacity: 1; transform: scale(1.18); }

    /* Side-by-side Duel / Multiplayer / 2P Local Comparison */
    .ma-duel-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 8px;
      margin: 12px 0 16px;
      text-align: left;
    }
    .ma-duel-card {
      background: rgba(30, 41, 59, 0.92);
      border: 2px solid #475569;
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 12px;
    }
    .ma-duel-card.leader {
      border-color: #facc15;
      background: rgba(113, 63, 18, 0.35);
    }
    .ma-duel-name { font-weight: 900; font-size: 13px; margin-bottom: 3px; }
    .ma-duel-score { font-weight: 900; font-size: 15px; color: #fef08a; }
    .ma-duel-meta { font-size: 11px; color: #cbd5e1; margin-top: 2px; }

    @media (max-width: 720px) {
      .ma-power-card { display: none; }
      .ma-hint { font-size: 11px; padding: 5px 11px; }
    }
  `;
  document.head.appendChild(style);
}

export interface ComparisonEntry {
  id: string;
  name: string;
  color: string;
  score: number;
  shotsUsed?: number;
  stars?: number;
  statusLabel: string;
  isWinner?: boolean;
}

export interface HudControlsCallbacks {
  onOpenLevels: () => void;
  onRestart: () => void;
  onPeekCastle: () => void;
  onZoomDelta: (delta: number) => void;
  onSkipTurn: () => void;
  onSendTaunt: (taunt: QuickTaunt) => void;
  onSelectLevel: (index: number) => void;
  onStartInfinite: () => void;
  onSelectLocalMode: (mode: LocalPlayMode) => void;
  onSelectMpMode: (mode: MultiplayerMode) => void;
  onNextLevel: () => void;
  onRequestRematch: (action: 'retry' | 'next') => void;
}

export class GameUi {
  private root: HTMLElement;
  private cb: HudControlsCallbacks;

  private hudScore!: HTMLElement;
  private hudLevel!: HTMLElement;
  private hudEnemies!: HTMLElement;
  private hudQueue!: HTMLElement;
  private hudMpStatus!: HTMLElement;
  private hudTauntWrap!: HTMLElement;
  private hudTauntWheel!: HTMLElement;
  private bottomHint!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private turnBanner!: HTMLElement;
  private turnBannerTimer: number | null = null;

  private powerCard!: HTMLElement;
  private powerAvatar!: HTMLElement;
  private powerName!: HTMLElement;
  private powerDesc!: HTMLElement;

  private menuOverlay!: HTMLElement;
  private levelsGrid!: HTMLElement;
  private menuTotalStars!: HTMLElement;
  private menuInfiniteBest!: HTMLElement;
  private menuLocalBox!: HTMLElement;
  private localSoloBtn!: HTMLButtonElement;
  private local2pBtn!: HTMLButtonElement;
  private menuMpBox!: HTMLElement;
  private mpCoopBtn!: HTMLButtonElement;
  private mpDuelBtn!: HTMLButtonElement;

  private resultOverlay!: HTMLElement;
  private resultTitle!: HTMLElement;
  private resultSub!: HTMLElement;
  private resultStars!: HTMLElement;
  private resultScore!: HTMLElement;
  private resultDuelGrid!: HTMLElement;
  private resultRetryBtn!: HTMLButtonElement;
  private resultNextBtn!: HTMLButtonElement;

  // Cached HUD state so we never rebuild DOM at 60 FPS
  private lastLevelText = '';
  private lastEnemiesText = '';
  private lastScoreText = '';
  private lastQueueKey = '';
  private lastMpKey = '';
  private lastHintText = '';
  private lastHintPower = false;
  private lastCanSkip = false;
  private lastPowerKey = '';
  private scoreAnimRaf: number | null = null;

  constructor(root: HTMLElement, cb: HudControlsCallbacks) {
    this.root = root;
    this.cb = cb;
    injectUiStyles();
    this.buildHud();
    this.buildMenuModal();
    this.buildResultModal();
  }

  private buildHud(): void {
    const topRight = document.createElement('div');
    topRight.className = 'ma-hud-top-right';
    topRight.innerHTML = `
      <div class="ma-hud-row">
        <span class="ma-pill" id="ma-hud-level">Fase 1</span>
        <span class="ma-pill green" id="ma-hud-enemies">🐷 2</span>
        <span class="ma-pill blue" id="ma-hud-score">🍌 0</span>
        <button class="ma-btn" id="ma-btn-peek" title="Olhar o castelo (C)">🔭 Castelo</button>
        <button class="ma-btn" id="ma-btn-zoom-in" title="Aproximar">+</button>
        <button class="ma-btn" id="ma-btn-zoom-out" title="Afastar">-</button>
        <button class="ma-btn" id="ma-btn-restart" title="Reiniciar fase (R)">🔄 Reiniciar</button>
        <button class="ma-btn primary" id="ma-btn-levels">🗺️ Fases</button>
      </div>
      <div class="ma-hud-row">
        <div class="ma-queue-strip" id="ma-hud-queue"></div>
        <span class="ma-pill green" id="ma-hud-mp" style="display:none;"></span>
        <div class="ma-taunt-wrap" id="ma-taunt-wrap" style="display:none;">
          <button class="ma-btn orange" id="ma-btn-taunt">💬 Zuera</button>
          <div class="ma-taunt-wheel" id="ma-taunt-wheel"></div>
        </div>
      </div>
    `;
    this.root.appendChild(topRight);

    this.hudLevel = topRight.querySelector('#ma-hud-level')!;
    this.hudEnemies = topRight.querySelector('#ma-hud-enemies')!;
    this.hudScore = topRight.querySelector('#ma-hud-score')!;
    this.hudQueue = topRight.querySelector('#ma-hud-queue')!;
    this.hudMpStatus = topRight.querySelector('#ma-hud-mp')!;
    this.hudTauntWrap = topRight.querySelector('#ma-taunt-wrap')!;
    this.hudTauntWheel = topRight.querySelector('#ma-taunt-wheel')!;

    for (const t of QUICK_TAUNTS) {
      const btn = document.createElement('button');
      btn.className = 'ma-taunt-chip';
      btn.textContent = t.label;
      btn.title = t.text;
      btn.onclick = () => {
        this.cb.onSendTaunt(t);
        this.hudTauntWheel.classList.remove('open');
      };
      this.hudTauntWheel.appendChild(btn);
    }

    topRight.querySelector<HTMLButtonElement>('#ma-btn-taunt')!.onclick = () => {
      this.hudTauntWheel.classList.toggle('open');
    };

    topRight.querySelector<HTMLButtonElement>('#ma-btn-peek')!.onclick = () => this.cb.onPeekCastle();
    topRight.querySelector<HTMLButtonElement>('#ma-btn-zoom-in')!.onclick = () => this.cb.onZoomDelta(4);
    topRight.querySelector<HTMLButtonElement>('#ma-btn-zoom-out')!.onclick = () => this.cb.onZoomDelta(-4);
    topRight.querySelector<HTMLButtonElement>('#ma-btn-restart')!.onclick = () => this.cb.onRestart();
    topRight.querySelector<HTMLButtonElement>('#ma-btn-levels')!.onclick = () => this.cb.onOpenLevels();

    // Turn Banner
    this.turnBanner = document.createElement('div');
    this.turnBanner.className = 'ma-turn-banner';
    this.root.appendChild(this.turnBanner);

    // Current Monkey Power Card
    this.powerCard = document.createElement('div');
    this.powerCard.className = 'ma-power-card hidden';
    this.powerCard.innerHTML = `
      <div class="ma-power-avatar" id="ma-pc-avatar">😤</div>
      <div class="ma-power-info">
        <div class="ma-power-name" id="ma-pc-name">Macaco</div>
        <div class="ma-power-desc" id="ma-pc-desc">Poder</div>
      </div>
    `;
    this.root.appendChild(this.powerCard);
    this.powerAvatar = this.powerCard.querySelector('#ma-pc-avatar')!;
    this.powerName = this.powerCard.querySelector('#ma-pc-name')!;
    this.powerDesc = this.powerCard.querySelector('#ma-pc-desc')!;

    // Bottom Hint + Skip Turn Button
    const bottom = document.createElement('div');
    bottom.className = 'ma-bottom-bar';
    bottom.innerHTML = `
      <div class="ma-hint" id="ma-bottom-hint">Arraste o estilingue para mirar e lançar!</div>
      <button class="ma-btn primary" id="ma-btn-skip" style="display:none;" title="Avançar para o próximo macaco (N ou Espaço)">⏭️ Próximo (N)</button>
    `;
    this.root.appendChild(bottom);
    this.bottomHint = bottom.querySelector('#ma-bottom-hint')!;
    this.skipBtn = bottom.querySelector('#ma-btn-skip')!;
    this.skipBtn.onclick = () => this.cb.onSkipTurn();
  }

  private buildMenuModal(): void {
    const overlay = document.createElement('div');
    overlay.className = 'ma-overlay';
    overlay.innerHTML = `
      <div class="ma-modal">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <h1>🎯 Macacos Pistola</h1>
            <p class="ma-sub">Puxe o estilingue de cipó, clique no ar para ativar poderes absurdos e derrube os Porcos Faria Limers! <span style="color:#fde047;font-weight:700;">🎮 Controles: F1</span></p>
          </div>
          <div style="text-align:right;">
            <div class="ma-pill" id="ma-menu-stars">🍌 0 / ${HANDCRAFTED_LEVELS.length * 3} Bananas de Ouro</div>
          </div>
        </div>

        <div class="ma-mode-box" id="ma-menu-local">
          <div>
            <strong>🎮 Modo de Jogo Local</strong>
            <div style="color:#bae6fd;">Jogue sozinho ou passe a vez no mesmo PC!</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="ma-btn blue" id="ma-local-solo">🐒 Solo (1P)</button>
            <button class="ma-btn" id="ma-local-2p">👥 2P Local (Hotseat)</button>
          </div>
        </div>

        <div class="ma-mp-box" id="ma-menu-mp" style="display:none;">
          <div>
            <strong>🐒 Modo Multiplayer P2P Ativo (até 4 jogadores)!</strong>
            <div style="color:#bbf7d0;">Escolha como jogar com a galera na sala:</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="ma-btn green" id="ma-mp-coop">🤝 Co-op de Turnos</button>
            <button class="ma-btn" id="ma-mp-duel">⚔️ Duelo de Pontuação</button>
          </div>
        </div>

        <div class="ma-monkey-cards">
          ${(['normal', 'triple', 'bomb', 'tank', 'boomerang', 'bomber'] as MonkeyKind[])
            .map((k) => {
              const s = MONKEY_SPECS[k];
              return `
              <div class="ma-mcard" style="border-color:${s.accentColor};">
                <strong style="color:${s.accentColor};">${s.emoji} ${s.shortName} — ${s.powerLabel}</strong>
                <span>${s.description}</span>
              </div>`;
            })
            .join('')}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:15px;color:#fde047;">🏰 Campanha (${HANDCRAFTED_LEVELS.length} Fortalezas)</strong>
          <button class="ma-btn orange" id="ma-btn-infinite">
            🎲 Demolição Infinita (<span id="ma-inf-best">Recorde: Onda 0</span>)
          </button>
        </div>

        <div class="ma-levels-grid" id="ma-levels-grid"></div>
      </div>
    `;
    this.root.appendChild(overlay);
    this.menuOverlay = overlay;
    this.levelsGrid = overlay.querySelector('#ma-levels-grid')!;
    this.menuTotalStars = overlay.querySelector('#ma-menu-stars')!;
    this.menuInfiniteBest = overlay.querySelector('#ma-inf-best')!;
    this.menuLocalBox = overlay.querySelector('#ma-menu-local')!;
    this.localSoloBtn = overlay.querySelector('#ma-local-solo')!;
    this.local2pBtn = overlay.querySelector('#ma-local-2p')!;
    this.menuMpBox = overlay.querySelector('#ma-menu-mp')!;
    this.mpCoopBtn = overlay.querySelector('#ma-mp-coop')!;
    this.mpDuelBtn = overlay.querySelector('#ma-mp-duel')!;

    overlay.querySelector<HTMLButtonElement>('#ma-btn-infinite')!.onclick = () => {
      this.cb.onStartInfinite();
    };
    this.localSoloBtn.onclick = () => this.cb.onSelectLocalMode('solo');
    this.local2pBtn.onclick = () => this.cb.onSelectLocalMode('local-2p');
    this.mpCoopBtn.onclick = () => this.cb.onSelectMpMode('coop-turns');
    this.mpDuelBtn.onclick = () => this.cb.onSelectMpMode('duel-score');
  }

  private buildResultModal(): void {
    const overlay = document.createElement('div');
    overlay.className = 'ma-overlay hidden';
    overlay.innerHTML = `
      <div class="ma-modal ma-result-box">
        <h1 id="ma-res-title">VITÓRIA BANANUDA!</h1>
        <p class="ma-sub" id="ma-res-sub"></p>
        <div class="ma-stars-big" id="ma-res-stars"></div>
        <div class="ma-pill" id="ma-res-score" style="font-size:17px;padding:8px 20px;margin-bottom:10px;">Pontuação: 0</div>
        <div class="ma-duel-grid" id="ma-res-duel" style="display:none;"></div>
        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:8px;">
          <button class="ma-btn" id="ma-res-levels">🗺️ Fases</button>
          <button class="ma-btn primary" id="ma-res-retry">🔄 Jogar de Novo</button>
          <button class="ma-btn green" id="ma-res-next">➡️ Próxima Fase</button>
        </div>
      </div>
    `;
    this.root.appendChild(overlay);
    this.resultOverlay = overlay;
    this.resultTitle = overlay.querySelector('#ma-res-title')!;
    this.resultSub = overlay.querySelector('#ma-res-sub')!;
    this.resultStars = overlay.querySelector('#ma-res-stars')!;
    this.resultScore = overlay.querySelector('#ma-res-score')!;
    this.resultDuelGrid = overlay.querySelector('#ma-res-duel')!;
    this.resultRetryBtn = overlay.querySelector('#ma-res-retry')!;
    this.resultNextBtn = overlay.querySelector('#ma-res-next')!;

    overlay.querySelector<HTMLButtonElement>('#ma-res-levels')!.onclick = () => {
      this.hideResult();
      this.cb.onOpenLevels();
    };
  }

  showTurnBanner(playerName: string, color: string, subtitle?: string): void {
    if (this.turnBannerTimer !== null) {
      window.clearTimeout(this.turnBannerTimer);
      this.turnBannerTimer = null;
    }
    this.turnBanner.style.borderColor = color;
    this.turnBanner.style.color = color;
    this.turnBanner.textContent = subtitle
      ? `🎯 VEZ DE ${playerName.toUpperCase()}! (${subtitle})`
      : `🎯 VEZ DE ${playerName.toUpperCase()}!`;
    this.turnBanner.classList.add('visible');
    this.turnBannerTimer = window.setTimeout(() => {
      this.turnBanner.classList.remove('visible');
      this.turnBannerTimer = null;
    }, 1850);
  }

  updateHud(opts: {
    level: LevelDef;
    scoreText: string;
    enemiesLeft: number;
    monkeyIndex: number;
    activeMonkey: MonkeyKind | null;
    powerReady: boolean;
    canSkip: boolean;
    showTaunts: boolean;
    mpStatusText: string;
    mpColor?: string;
    hintText: string;
    hintPower: boolean;
  }): void {
    const levelText = opts.level.isInfinite
      ? `🎲 ${opts.level.name}`
      : `Fase ${opts.level.id}/${HANDCRAFTED_LEVELS.length}: ${opts.level.name}`;
    if (levelText !== this.lastLevelText) {
      this.lastLevelText = levelText;
      this.hudLevel.textContent = levelText;
    }

    const enemiesText = `🐷 ${opts.enemiesLeft} inimigo${opts.enemiesLeft === 1 ? '' : 's'}`;
    if (enemiesText !== this.lastEnemiesText) {
      this.lastEnemiesText = enemiesText;
      this.hudEnemies.textContent = enemiesText;
    }

    if (opts.scoreText !== this.lastScoreText) {
      this.lastScoreText = opts.scoreText;
      this.hudScore.textContent = opts.scoreText;
    }

    // Only rebuild queue dots when level or monkeyIndex changes!
    const queueKey = `${opts.level.id}:${opts.monkeyIndex}:${opts.level.monkeys.length}`;
    if (queueKey !== this.lastQueueKey) {
      this.lastQueueKey = queueKey;
      this.hudQueue.innerHTML = '';
      for (let i = opts.monkeyIndex; i < opts.level.monkeys.length; i++) {
        const k = opts.level.monkeys[i];
        const spec = MONKEY_SPECS[k];
        const dot = document.createElement('span');
        dot.className = `ma-q-dot${i === opts.monkeyIndex ? ' active' : ''}`;
        dot.style.background = spec.primaryColor;
        dot.style.borderColor = spec.accentColor;
        dot.title = `${spec.name}: ${spec.hudPowerHint}`;
        dot.textContent = spec.emoji;
        this.hudQueue.appendChild(dot);
      }
    }

    const mpKey = `${opts.showTaunts ? 1 : 0}|${opts.mpStatusText}|${opts.mpColor ?? ''}`;
    if (mpKey !== this.lastMpKey) {
      this.lastMpKey = mpKey;
      if (opts.mpStatusText) {
        this.hudMpStatus.style.display = 'inline-flex';
        this.hudMpStatus.textContent = opts.mpStatusText;
        this.hudMpStatus.style.borderColor = opts.mpColor || '#4ade80';
      } else {
        this.hudMpStatus.style.display = 'none';
      }
      this.hudTauntWrap.style.display = opts.showTaunts ? 'inline-flex' : 'none';
      if (!opts.showTaunts) {
        this.hudTauntWheel.classList.remove('open');
      }
    }

    if (opts.hintText !== this.lastHintText) {
      this.lastHintText = opts.hintText;
      this.bottomHint.textContent = opts.hintText;
    }
    if (opts.hintPower !== this.lastHintPower) {
      this.lastHintPower = opts.hintPower;
      this.bottomHint.classList.toggle('power', opts.hintPower);
    }

    if (opts.canSkip !== this.lastCanSkip) {
      this.lastCanSkip = opts.canSkip;
      this.skipBtn.style.display = opts.canSkip ? 'inline-flex' : 'none';
    }

    const powerKey = `${opts.activeMonkey ?? 'none'}:${opts.powerReady ? 1 : 0}`;
    if (powerKey !== this.lastPowerKey) {
      this.lastPowerKey = powerKey;
      if (!opts.activeMonkey) {
        this.powerCard.classList.add('hidden');
        this.powerCard.classList.remove('ready');
      } else {
        const spec = MONKEY_SPECS[opts.activeMonkey];
        this.powerCard.classList.remove('hidden');
        this.powerCard.classList.toggle('ready', opts.powerReady);
        this.powerCard.style.borderColor = opts.powerReady ? '#f97316' : spec.accentColor;
        this.powerAvatar.style.background = spec.primaryColor;
        this.powerAvatar.style.borderColor = spec.accentColor;
        this.powerAvatar.textContent = spec.emoji;
        this.powerName.textContent = `${spec.shortName} • ${spec.powerLabel}`;
        this.powerName.style.color = spec.accentColor;
        this.powerDesc.textContent = spec.hudPowerHint;
      }
    }
  }

  openMenu(
    save: SaveData,
    mpConnected: boolean,
    isHost: boolean,
    mpMode: MultiplayerMode,
    localMode: LocalPlayMode,
  ): void {
    const totalStars = getTotalStars(save);
    this.menuTotalStars.textContent = `🍌 ${totalStars} / ${HANDCRAFTED_LEVELS.length * 3} Bananas de Ouro`;
    this.menuInfiniteBest.textContent = `Recorde: Onda ${save.bestInfiniteWave}`;

    this.menuLocalBox.style.display = mpConnected ? 'none' : 'flex';
    this.localSoloBtn.className = localMode === 'solo' ? 'ma-btn blue' : 'ma-btn';
    this.local2pBtn.className = localMode === 'local-2p' ? 'ma-btn blue' : 'ma-btn';

    this.menuMpBox.style.display = mpConnected ? 'flex' : 'none';
    this.mpCoopBtn.className = mpMode === 'coop-turns' ? 'ma-btn green' : 'ma-btn';
    this.mpDuelBtn.className = mpMode === 'duel-score' ? 'ma-btn green' : 'ma-btn';
    this.mpCoopBtn.disabled = !isHost;
    this.mpDuelBtn.disabled = !isHost;

    this.levelsGrid.innerHTML = '';
    HANDCRAFTED_LEVELS.forEach((lvl, idx) => {
      const prog = save.levels[lvl.id] ?? { stars: 0, bestScore: 0 };
      const card = document.createElement('button');
      card.className = 'ma-lvl-card';
      const bananas =
        '🍌'.repeat(prog.stars) + '<span style="opacity:0.25;">🍌</span>'.repeat(3 - prog.stars);
      card.innerHTML = `
        <div class="ma-lvl-title">${lvl.id}. ${lvl.name}</div>
        <div class="ma-lvl-sub">${lvl.subtitle}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="ma-lvl-stars">${bananas}</span>
          <span style="font-size:11px;color:#cbd5e1;">${prog.bestScore > 0 ? prog.bestScore.toLocaleString('pt-BR') : 'Novo'}</span>
        </div>
      `;
      card.onclick = () => this.cb.onSelectLevel(idx);
      this.levelsGrid.appendChild(card);
    });

    this.menuOverlay.classList.remove('hidden');
  }

  closeMenu(): void {
    this.menuOverlay.classList.add('hidden');
  }

  isMenuOpen(): boolean {
    return !this.menuOverlay.classList.contains('hidden');
  }

  isResultOpen(): boolean {
    return !this.resultOverlay.classList.contains('hidden');
  }

  showResult(opts: {
    won: boolean;
    level: LevelDef;
    score: number;
    stars: number;
    unusedMonkeys: number;
    comparisons: ComparisonEntry[];
    hasNext: boolean;
    mpConnected: boolean;
    isHost: boolean;
    mpMode: MultiplayerMode;
  }): void {
    this.resultTitle.textContent = opts.won ? '🍌 DEMOLIÇÃO TOTAL!' : '🐷 OS PORCOS RIRAM!';
    this.resultTitle.style.color = opts.won ? '#fde047' : '#fb7185';
    this.resultSub.textContent = opts.won
      ? `Bônus de ${opts.unusedMonkeys} macaco(s) restante(s): +${(opts.unusedMonkeys * 10000).toLocaleString('pt-BR')} pts!`
      : 'Acabaram os macacos pistola... Recarregue o cipó e esmague eles!';

    // Sequential star pop-in animation
    if (opts.won) {
      this.resultStars.innerHTML = [0, 1, 2]
        .map((i) => `<span class="ma-star-slot dim" data-star="${i}">🍌</span>`)
        .join('');
      for (let i = 0; i < opts.stars; i++) {
        window.setTimeout(() => {
          const el = this.resultStars.querySelector(`[data-star="${i}"]`);
          if (el) {
            el.classList.remove('dim');
            el.classList.add('pop');
          }
        }, 180 + i * 240);
      }
    } else {
      this.resultStars.innerHTML = '<span>💀🐷💀</span>';
    }

    // Animated score count-up
    if (this.scoreAnimRaf !== null) {
      cancelAnimationFrame(this.scoreAnimRaf);
      this.scoreAnimRaf = null;
    }
    const targetScore = Math.max(0, Math.floor(opts.score));
    const startMs = performance.now();
    const duration = 850;
    const tickScore = (now: number) => {
      const t = Math.min(1, (now - startMs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(targetScore * eased);
      this.resultScore.textContent = `Pontuação: ${current.toLocaleString('pt-BR')}`;
      if (t < 1) {
        this.scoreAnimRaf = requestAnimationFrame(tickScore);
      } else {
        this.scoreAnimRaf = null;
      }
    };
    this.scoreAnimRaf = requestAnimationFrame(tickScore);

    this.updateDuelBoard(opts.comparisons);

    // Synced Rematch / Next buttons
    const isDuelOrCoop = opts.mpConnected;
    if (isDuelOrCoop && !opts.isHost) {
      this.resultRetryBtn.textContent =
        opts.mpMode === 'duel-score' ? '📣 Pedir Revanche' : '📣 Pedir Reinício';
      this.resultRetryBtn.onclick = () => this.cb.onRequestRematch('retry');
      this.resultNextBtn.style.display =
        (opts.won || opts.mpMode === 'duel-score') && opts.hasNext ? 'inline-flex' : 'none';
      this.resultNextBtn.textContent = '📣 Pedir Próxima';
      this.resultNextBtn.onclick = () => this.cb.onRequestRematch('next');
    } else {
      this.resultRetryBtn.textContent =
        isDuelOrCoop && opts.mpMode === 'duel-score' ? '⚔️ Revanche (Todos)' : '🔄 Jogar de Novo';
      this.resultRetryBtn.onclick = () => {
        this.hideResult();
        this.cb.onRestart();
      };
      this.resultNextBtn.style.display =
        (opts.won || (isDuelOrCoop && opts.mpMode === 'duel-score')) && opts.hasNext
          ? 'inline-flex'
          : 'none';
      this.resultNextBtn.textContent = opts.level.isInfinite
        ? isDuelOrCoop
          ? '🎲 Próxima Onda (Todos)'
          : '🎲 Próxima Onda'
        : isDuelOrCoop
          ? '➡️ Próxima Fase (Todos)'
          : '➡️ Próxima Fase';
      this.resultNextBtn.onclick = () => {
        this.hideResult();
        this.cb.onNextLevel();
      };
    }

    this.resultOverlay.classList.remove('hidden');
  }

  updateDuelBoard(comparisons: ComparisonEntry[]): void {
    if (comparisons.length === 0) {
      this.resultDuelGrid.style.display = 'none';
      this.resultDuelGrid.innerHTML = '';
      return;
    }

    this.resultDuelGrid.style.display = 'grid';
    this.resultDuelGrid.innerHTML = comparisons
      .map(
        (c) => `
      <div class="ma-duel-card${c.isWinner ? ' leader' : ''}" style="border-color:${c.isWinner ? '#facc15' : c.color};">
        <div class="ma-duel-name" style="color:${c.color};">${c.isWinner ? '👑 ' : ''}${this.escapeHtml(c.name)}</div>
        <div class="ma-duel-score">${c.score.toLocaleString('pt-BR')} pts</div>
        <div class="ma-duel-meta">${this.escapeHtml(c.statusLabel)}${c.shotsUsed !== undefined ? ` • ${c.shotsUsed} tiro(s)` : ''}</div>
      </div>`,
      )
      .join('');
  }

  private escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });
  }

  hideResult(): void {
    if (this.scoreAnimRaf !== null) {
      cancelAnimationFrame(this.scoreAnimRaf);
      this.scoreAnimRaf = null;
    }
    this.resultOverlay.classList.add('hidden');
  }
}
