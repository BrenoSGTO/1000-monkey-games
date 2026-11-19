import { MONKEY_SPECS } from './constants';
import { HANDCRAFTED_LEVELS } from './levels';
import { getTotalStars, type SaveData } from './storage';
import type { LevelDef, MonkeyKind, MultiplayerMode } from './types';

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
    }
    .ma-btn:hover { transform: translateY(-1px); border-color: #facc15; }
    .ma-btn:active { transform: translateY(1px); }
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
    .ma-bottom-bar {
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: none;
    }
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
    }
    .ma-hint.power {
      border-color: #f97316;
      color: #ffedd5;
      animation: ma-pulse 0.8s infinite alternate;
    }
    @keyframes ma-pulse {
      from { transform: scale(1); }
      to { transform: scale(1.05); }
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
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid #0f172a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 900;
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
      width: min(860px, 100%);
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
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
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
    .ma-mp-box {
      background: rgba(20, 83, 45, 0.35);
      border: 2px solid #4ade80;
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
    }
    .ma-result-box {
      width: min(460px, 100%);
      text-align: center;
    }
    .ma-stars-big {
      font-size: 42px;
      margin: 10px 0;
      letter-spacing: 6px;
    }
  `;
  document.head.appendChild(style);
}

export interface HudControlsCallbacks {
  onOpenLevels: () => void;
  onRestart: () => void;
  onPeekCastle: () => void;
  onZoomDelta: (delta: number) => void;
  onSendTaunt: () => void;
  onSelectLevel: (index: number) => void;
  onStartInfinite: () => void;
  onSelectMpMode: (mode: MultiplayerMode) => void;
  onNextLevel: () => void;
}

export class GameUi {
  private root: HTMLElement;
  private cb: HudControlsCallbacks;

  private hudScore!: HTMLElement;
  private hudLevel!: HTMLElement;
  private hudEnemies!: HTMLElement;
  private hudQueue!: HTMLElement;
  private hudMpStatus!: HTMLElement;
  private hudTauntBtn!: HTMLButtonElement;
  private bottomHint!: HTMLElement;

  private menuOverlay!: HTMLElement;
  private levelsGrid!: HTMLElement;
  private menuTotalStars!: HTMLElement;
  private menuInfiniteBest!: HTMLElement;
  private menuMpBox!: HTMLElement;
  private mpCoopBtn!: HTMLButtonElement;
  private mpDuelBtn!: HTMLButtonElement;

  private resultOverlay!: HTMLElement;
  private resultTitle!: HTMLElement;
  private resultSub!: HTMLElement;
  private resultStars!: HTMLElement;
  private resultScore!: HTMLElement;
  private resultDuelInfo!: HTMLElement;
  private resultNextBtn!: HTMLButtonElement;

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
        <button class="ma-btn" id="ma-btn-peek" title="Olhar o castelo">🔭 Castelo</button>
        <button class="ma-btn" id="ma-btn-zoom-in" title="Aproximar">+</button>
        <button class="ma-btn" id="ma-btn-zoom-out" title="Afastar">-</button>
        <button class="ma-btn" id="ma-btn-restart" title="Reiniciar fase (R)">🔄 Reiniciar</button>
        <button class="ma-btn primary" id="ma-btn-levels">🗺️ Fases</button>
      </div>
      <div class="ma-hud-row">
        <div class="ma-queue-strip" id="ma-hud-queue"></div>
        <span class="ma-pill green" id="ma-hud-mp" style="display:none;"></span>
        <button class="ma-btn orange" id="ma-btn-taunt" style="display:none;">💬 Zuera</button>
      </div>
    `;
    this.root.appendChild(topRight);

    this.hudLevel = topRight.querySelector('#ma-hud-level')!;
    this.hudEnemies = topRight.querySelector('#ma-hud-enemies')!;
    this.hudScore = topRight.querySelector('#ma-hud-score')!;
    this.hudQueue = topRight.querySelector('#ma-hud-queue')!;
    this.hudMpStatus = topRight.querySelector('#ma-hud-mp')!;
    this.hudTauntBtn = topRight.querySelector('#ma-btn-taunt')!;

    topRight.querySelector<HTMLButtonElement>('#ma-btn-peek')!.onclick = () => this.cb.onPeekCastle();
    topRight.querySelector<HTMLButtonElement>('#ma-btn-zoom-in')!.onclick = () => this.cb.onZoomDelta(4);
    topRight.querySelector<HTMLButtonElement>('#ma-btn-zoom-out')!.onclick = () => this.cb.onZoomDelta(-4);
    topRight.querySelector<HTMLButtonElement>('#ma-btn-restart')!.onclick = () => this.cb.onRestart();
    topRight.querySelector<HTMLButtonElement>('#ma-btn-levels')!.onclick = () => this.cb.onOpenLevels();
    this.hudTauntBtn.onclick = () => this.cb.onSendTaunt();

    const bottom = document.createElement('div');
    bottom.className = 'ma-bottom-bar';
    bottom.innerHTML = `<div class="ma-hint" id="ma-bottom-hint">Arraste o estilingue para mirar e lançar!</div>`;
    this.root.appendChild(bottom);
    this.bottomHint = bottom.querySelector('#ma-bottom-hint')!;
  }

  private buildMenuModal(): void {
    const overlay = document.createElement('div');
    overlay.className = 'ma-overlay';
    overlay.innerHTML = `
      <div class="ma-modal">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <h1>🎯 Macacos Pistola</h1>
            <p class="ma-sub">Puxe o estilingue de cipó, clique no ar para ativar poderes absurdos e derrube os Porcos Faria Limers!</p>
          </div>
          <div style="text-align:right;">
            <div class="ma-pill" id="ma-menu-stars">🍌 0 / 24 Bananas de Ouro</div>
          </div>
        </div>

        <div class="ma-mp-box" id="ma-menu-mp" style="display:none;">
          <div>
            <strong>🐒 Modo Multiplayer P2P Ativo!</strong>
            <div style="color:#bbf7d0;">Escolha como jogar com seu amigo na sala:</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="ma-btn green" id="ma-mp-coop">🤝 Co-op de Turnos</button>
            <button class="ma-btn" id="ma-mp-duel">⚔️ Duelo de Pontuação</button>
          </div>
        </div>

        <div class="ma-monkey-cards">
          ${(['normal', 'triple', 'bomb', 'tank', 'boomerang'] as MonkeyKind[])
            .map((k) => {
              const s = MONKEY_SPECS[k];
              return `
              <div class="ma-mcard" style="border-color:${s.accentColor};">
                <strong style="color:${s.accentColor};">${s.shortName} — ${s.powerLabel}</strong>
                <span>${s.description}</span>
              </div>`;
            })
            .join('')}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:15px;color:#fde047;">🏰 Campanha (8 Fortalezas)</strong>
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
    this.menuMpBox = overlay.querySelector('#ma-menu-mp')!;
    this.mpCoopBtn = overlay.querySelector('#ma-mp-coop')!;
    this.mpDuelBtn = overlay.querySelector('#ma-mp-duel')!;

    overlay.querySelector<HTMLButtonElement>('#ma-btn-infinite')!.onclick = () => {
      this.cb.onStartInfinite();
    };
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
        <div class="ma-stars-big" id="ma-res-stars">🍌🍌🍌</div>
        <div class="ma-pill" id="ma-res-score" style="font-size:16px;padding:8px 18px;margin-bottom:12px;">Pontuação: 0</div>
        <div id="ma-res-duel" style="font-size:13px;color:#cbd5e1;margin-bottom:14px;"></div>
        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
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
    this.resultDuelInfo = overlay.querySelector('#ma-res-duel')!;
    this.resultNextBtn = overlay.querySelector('#ma-res-next')!;

    overlay.querySelector<HTMLButtonElement>('#ma-res-levels')!.onclick = () => {
      this.hideResult();
      this.cb.onOpenLevels();
    };
    overlay.querySelector<HTMLButtonElement>('#ma-res-retry')!.onclick = () => {
      this.hideResult();
      this.cb.onRestart();
    };
    this.resultNextBtn.onclick = () => {
      this.hideResult();
      this.cb.onNextLevel();
    };
  }

  updateHud(opts: {
    level: LevelDef;
    score: number;
    enemiesLeft: number;
    monkeyIndex: number;
    mpConnected: boolean;
    mpMode: MultiplayerMode;
    mpStatusText: string;
    hintText: string;
    hintPower: boolean;
  }): void {
    this.hudLevel.textContent = opts.level.isInfinite
      ? `🎲 ${opts.level.name}`
      : `Fase ${opts.level.id}/8: ${opts.level.name}`;
    this.hudEnemies.textContent = `🐷 ${opts.enemiesLeft} inimigo${opts.enemiesLeft === 1 ? '' : 's'}`;
    this.hudScore.textContent = `🍌 ${opts.score.toLocaleString('pt-BR')}`;

    this.hudQueue.innerHTML = '';
    for (let i = opts.monkeyIndex; i < opts.level.monkeys.length; i++) {
      const k = opts.level.monkeys[i];
      const spec = MONKEY_SPECS[k];
      const dot = document.createElement('span');
      dot.className = `ma-q-dot${i === opts.monkeyIndex ? ' active' : ''}`;
      dot.style.background = spec.primaryColor;
      dot.style.borderColor = spec.accentColor;
      dot.title = `${spec.name}: ${spec.powerLabel}`;
      dot.textContent = spec.shortName[0];
      this.hudQueue.appendChild(dot);
    }

    if (opts.mpConnected) {
      this.hudMpStatus.style.display = 'inline-flex';
      this.hudMpStatus.textContent = opts.mpStatusText;
      this.hudTauntBtn.style.display = 'inline-flex';
    } else {
      this.hudMpStatus.style.display = 'none';
      this.hudTauntBtn.style.display = 'none';
    }

    this.bottomHint.textContent = opts.hintText;
    this.bottomHint.classList.toggle('power', opts.hintPower);
  }

  openMenu(
    save: SaveData,
    mpConnected: boolean,
    isHost: boolean,
    mpMode: MultiplayerMode,
  ): void {
    const totalStars = getTotalStars(save);
    this.menuTotalStars.textContent = `🍌 ${totalStars} / ${HANDCRAFTED_LEVELS.length * 3} Bananas de Ouro`;
    this.menuInfiniteBest.textContent = `Recorde: Onda ${save.bestInfiniteWave}`;

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
      const bananas = '🍌'.repeat(prog.stars) + '<span style="opacity:0.25;">🍌</span>'.repeat(3 - prog.stars);
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

  showResult(opts: {
    won: boolean;
    level: LevelDef;
    score: number;
    stars: number;
    unusedMonkeys: number;
    duelSummary?: string;
    hasNext: boolean;
  }): void {
    this.resultTitle.textContent = opts.won ? '🍌 DEMOLIÇÃO TOTAL!' : '🐷 OS PORCOS RIRAM!';
    this.resultTitle.style.color = opts.won ? '#fde047' : '#fb7185';
    this.resultSub.textContent = opts.won
      ? `Bônus de ${opts.unusedMonkeys} macaco(s) restante(s): +${(opts.unusedMonkeys * 10000).toLocaleString('pt-BR')} pts!`
      : 'Acabaram os macacos pistola... Recarregue o cipó e esmague eles!';

    this.resultStars.innerHTML = opts.won
      ? '🍌'.repeat(opts.stars) + '<span style="opacity:0.2;">🍌</span>'.repeat(3 - opts.stars)
      : '💀🐷💀';
    this.resultScore.textContent = `Pontuação: ${opts.score.toLocaleString('pt-BR')}`;
    this.resultDuelInfo.textContent = opts.duelSummary ?? '';
    this.resultNextBtn.style.display = opts.won && opts.hasNext ? 'inline-flex' : 'none';
    this.resultNextBtn.textContent = opts.level.isInfinite ? '🎲 Próxima Onda' : '➡️ Próxima Fase';

    this.resultOverlay.classList.remove('hidden');
  }

  hideResult(): void {
    this.resultOverlay.classList.add('hidden');
  }
}
