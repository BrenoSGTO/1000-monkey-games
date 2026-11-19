import { getGameScore, monkeyAudio } from '@monkey-slop/sdk';
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAPS, TOWER_DEFS, TOWER_ORDER } from './data';
import type { MonkeyBloonsGame, UiSnapshot } from './game';
import type { MapId, TargetMode, TowerType } from './types';

const TARGET_LABELS: Record<TargetMode, string> = {
  first: 'Primeiro',
  strong: 'Mais Forte',
  close: 'Mais Perto',
  last: 'Último',
};

export class TdUiController {
  private root: HTMLElement;
  public readonly canvas: HTMLCanvasElement;

  private game: MonkeyBloonsGame | null = null;
  private startModalVisible = true;
  private chosenStartMap: MapId = 'selva';

  // Top bar refs
  private mapBtns: Record<MapId, HTMLButtonElement>;
  private bananasEl: HTMLElement;
  private livesEl: HTMLElement;
  private waveEl: HTMLElement;
  private scoreEl: HTMLElement;
  private startWaveBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;
  private waveTitleEl: HTMLElement;

  // Sidebar refs
  private shopCards = new Map<TowerType, HTMLButtonElement>();
  private inspectorWrap: HTMLElement;
  private coopStatusBadge: HTMLElement;
  private giftBtn: HTMLButtonElement;
  private trollBtn: HTMLButtonElement;

  // Modals
  private startModal: HTMLElement;
  private endModal: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'td-shell';

    // Top bar
    const topbar = document.createElement('header');
    topbar.className = 'td-topbar';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'td-group';

    const selvaBtn = this.makeBtn('🌴 Selva do Trânsito', 'td-btn active', () => {
      this.game?.setMap('selva');
    });
    const feiraBtn = this.makeBtn('🛒 Feira da Banana', 'td-btn', () => {
      this.game?.setMap('feira');
    });
    this.mapBtns = { selva: selvaBtn, feira: feiraBtn };
    leftGroup.append(selvaBtn, feiraBtn);

    const statsGroup = document.createElement('div');
    statsGroup.className = 'td-group';

    this.bananasEl = this.makeStat('gold', '🍌 380');
    this.livesEl = this.makeStat('lives', '❤️ 25');
    this.waveEl = this.makeStat('wave', '🌊 Onda 0');
    this.scoreEl = this.makeStat('', '🏆 0');
    statsGroup.append(this.bananasEl, this.livesEl, this.waveEl, this.scoreEl);

    const ctrlGroup = document.createElement('div');
    ctrlGroup.className = 'td-group';

    this.startWaveBtn = this.makeBtn('▶ Iniciar Onda', 'td-btn primary pulse', () => {
      this.game?.startNextWave();
    });
    this.speedBtn = this.makeBtn('⏩ 1x', 'td-btn', () => {
      this.game?.toggleSpeed();
    });
    this.autoBtn = this.makeBtn('🔁 Auto: OFF', 'td-btn', () => {
      this.game?.toggleAutoWave();
    });
    ctrlGroup.append(this.startWaveBtn, this.speedBtn, this.autoBtn);

    topbar.append(leftGroup, statsGroup, ctrlGroup);
    shell.appendChild(topbar);

    // Main stage + sidebar
    const main = document.createElement('div');
    main.className = 'td-main';

    const stageCol = document.createElement('div');
    stageCol.className = 'td-stage-col';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'td-canvas-wrap';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'td-canvas';
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    canvasWrap.appendChild(this.canvas);

    const footerBar = document.createElement('div');
    footerBar.className = 'td-footer-bar';
    this.waveTitleEl = document.createElement('strong');
    this.waveTitleEl.textContent = 'Pronto para o Caos!';
    const hintSpan = document.createElement('span');
    hintSpan.textContent = 'Atalhos: [1-5] Torres • [Espaço] Onda/Velocidade • [Botão Direito] Cancelar';
    footerBar.append(this.waveTitleEl, hintSpan);

    stageCol.append(canvasWrap, footerBar);

    // Sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'td-sidebar';

    const shopTitle = document.createElement('div');
    shopTitle.className = 'td-section-title';
    shopTitle.innerHTML = '<span>🐒 Loja da Macacada</span><span>[1-5]</span>';
    sidebar.appendChild(shopTitle);

    const shopList = document.createElement('div');
    shopList.className = 'td-shop-list';
    for (const type of TOWER_ORDER) {
      const def = TOWER_DEFS[type];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'td-shop-card';
      card.innerHTML = `
        <div class="td-shop-icon">${def.emoji}</div>
        <div class="td-shop-meta">
          <div class="td-shop-top">
            <span>[${def.hotkey}] ${def.shortName}</span>
            <span class="td-shop-cost">${def.cost} 🍌</span>
          </div>
          <div class="td-shop-desc">${def.description}</div>
        </div>
      `;
      card.onclick = () => this.game?.selectShopTower(type);
      this.shopCards.set(type, card);
      shopList.appendChild(card);
    }
    sidebar.appendChild(shopList);

    // Inspector wrap (populated when a tower is selected)
    this.inspectorWrap = document.createElement('div');
    sidebar.appendChild(this.inspectorWrap);

    // Co-op Chaos Box
    const coopBox = document.createElement('div');
    coopBox.className = 'td-coop-box';
    const coopTitle = document.createElement('div');
    coopTitle.className = 'td-section-title';
    coopTitle.style.marginBottom = '2px';
    this.coopStatusBadge = document.createElement('span');
    this.coopStatusBadge.textContent = 'Solo (Offline)';
    coopTitle.innerHTML = '<span>🤝 Co-op Online</span>';
    coopTitle.appendChild(this.coopStatusBadge);

    this.giftBtn = this.makeBtn('🍌 Mandar 50 Bananas pro Amigo', 'td-btn warn', () => {
      this.game?.giftBananasToFriends();
    });
    this.trollBtn = this.makeBtn('😈 Mandar +5 Bexigas Surpresa (Trolagem)', 'td-btn chaos', () => {
      this.game?.sendTrollBloons();
    });
    coopBox.append(coopTitle, this.giftBtn, this.trollBtn);
    sidebar.appendChild(coopBox);

    main.append(stageCol, sidebar);
    shell.appendChild(main);

    // Start Modal
    this.startModal = document.createElement('div');
    this.startModal.className = 'td-modal-backdrop';
    this.renderStartModal();

    // End / Victory Modal
    this.endModal = document.createElement('div');
    this.endModal.className = 'td-modal-backdrop';
    this.endModal.style.display = 'none';

    this.root.append(shell, this.startModal, this.endModal);
    this.bindKeyboard();
  }

  public attachGame(game: MonkeyBloonsGame): void {
    this.game = game;
    this.update(game.getUiSnapshot());
  }

  private renderStartModal(): void {
    const best = getGameScore('monkey-bloons-td').bestScore;
    this.startModal.innerHTML = `
      <div class="td-modal">
        <h1>🎈 Macaco Estoura-Bexiga TD 🐒</h1>
        <p>
          As bexigas folgadas e o <strong>Dirigível do Imposto de Renda</strong> estão invadindo!
          Posicione macacos vesgos, chineladas teleguiadas e caixas JBL para proteger o bananal.
          ${best > 0 ? `<br/><strong>🏆 Seu Recorde: ${best} pts</strong>` : ''}
        </p>
        <div class="td-map-picks">
          <button type="button" class="td-map-pick ${this.chosenStartMap === 'selva' ? 'active' : ''}" data-map="selva">
            <strong>🌴 ${MAPS.selva.name}</strong>
            <span>${MAPS.selva.subtitle}</span>
          </button>
          <button type="button" class="td-map-pick ${this.chosenStartMap === 'feira' ? 'active' : ''}" data-map="feira">
            <strong>🛒 ${MAPS.feira.name}</strong>
            <span>${MAPS.feira.subtitle}</span>
          </button>
        </div>
        <button type="button" class="td-btn primary" id="td-play-now" style="font-size:16px;padding:12px 28px;">
          🍌 MACACAR AGORA!
        </button>
      </div>
    `;

    this.startModal.querySelectorAll<HTMLButtonElement>('.td-map-pick').forEach((btn) => {
      btn.onclick = () => {
        monkeyAudio.play('click', 0.2);
        this.chosenStartMap = btn.dataset.map as MapId;
        this.game?.setMap(this.chosenStartMap);
        this.renderStartModal();
      };
    });

    const playBtn = this.startModal.querySelector<HTMLButtonElement>('#td-play-now')!;
    playBtn.onclick = () => {
      monkeyAudio.play('screech', 0.22);
      this.startModalVisible = false;
      this.startModal.style.display = 'none';
      this.game?.setMap(this.chosenStartMap);
    };
  }

  public hideStartModal(): void {
    this.startModalVisible = false;
    this.startModal.style.display = 'none';
  }

  public update(snap: UiSnapshot): void {
    this.mapBtns.selva.classList.toggle('active', snap.mapId === 'selva');
    this.mapBtns.feira.classList.toggle('active', snap.mapId === 'feira');

    this.bananasEl.textContent = `🍌 ${snap.bananas}`;
    this.livesEl.textContent = `❤️ ${snap.lives}`;
    this.waveEl.textContent = `🌊 Onda ${snap.wave}`;
    this.scoreEl.textContent = `🏆 ${snap.score}`;
    this.waveTitleEl.textContent = snap.waveTitle;

    this.startWaveBtn.disabled = snap.waveActive || snap.gameOver;
    this.startWaveBtn.classList.toggle('pulse', !snap.waveActive && !snap.gameOver);
    this.startWaveBtn.textContent = snap.waveActive
      ? `⏳ Onda ${snap.wave} em curso...`
      : `▶ Iniciar Onda ${snap.wave + 1}`;

    this.speedBtn.textContent = snap.speed === 2 ? '⚡ 2x RÁPIDO' : '⏩ 1x NORMAL';
    this.speedBtn.classList.toggle('active', snap.speed === 2);

    this.autoBtn.textContent = snap.autoWave ? '🔁 Auto: ON' : '🔁 Auto: OFF';
    this.autoBtn.classList.toggle('active', snap.autoWave);

    for (const [type, card] of this.shopCards) {
      const def = TOWER_DEFS[type];
      card.classList.toggle('selected', snap.placingType === type);
      card.classList.toggle('expensive', snap.bananas < def.cost);
    }

    this.renderInspector(snap);

    this.coopStatusBadge.textContent = snap.isCoop
      ? `${snap.playersCount} Macacos Online`
      : 'Solo (Abra Co-op no topo)';
    this.coopStatusBadge.style.color = snap.isCoop ? '#4ade80' : '#94a3b8';

    this.renderEndModal(snap);
  }

  private renderInspector(snap: UiSnapshot): void {
    const t = snap.selectedTower;
    if (!t) {
      this.inspectorWrap.innerHTML = '';
      return;
    }

    const def = TOWER_DEFS[t.type];
    const isOwner = !snap.isCoop || t.ownerId === snap.localPlayerId;
    const nextUpg = t.level < 3 ? def.upgrades[t.level] : null;
    const refund = Math.round(t.totalSpent * 0.7);
    const currentLabel = t.level === 0 ? def.shortName : def.upgrades[t.level - 1].name;

    this.inspectorWrap.innerHTML = `
      <div class="td-inspector">
        <h3>${def.emoji} ${currentLabel} (Lv.${t.level}/3)</h3>
        <div class="td-inspector-stats">
          <span>💥 Estouros: <strong>${t.pops}</strong></span>
          <span>${snap.isCoop ? `👤 <strong style="color:${t.ownerColor}">${t.ownerName}</strong>` : '🐵 Seu Macaco'}</span>
        </div>
        ${
          t.buffedMultiplier > 1.01
            ? `<div style="font-size:11px;color:#e879f9;font-weight:700;">🔊 Buff JBL ativo: +${Math.round((t.buffedMultiplier - 1) * 100)}% vel.!</div>`
            : ''
        }
        ${
          t.type !== 'dj'
            ? `<button type="button" class="td-btn" id="td-target-btn" ${!isOwner ? 'disabled' : ''}>🎯 Alvo: ${TARGET_LABELS[t.targetMode]}</button>`
            : ''
        }
        ${
          nextUpg
            ? `<div class="td-upg-box">
                <div style="font-weight:800;color:#fef08a;margin-bottom:2px;">⬆️ ${nextUpg.name}</div>
                <div style="color:#cbd5e1;margin-bottom:6px;">${nextUpg.description}</div>
                <button type="button" class="td-btn primary" id="td-upg-btn" style="width:100%;" ${!isOwner || snap.bananas < nextUpg.cost ? 'disabled' : ''}>
                  Evoluir (${nextUpg.cost} 🍌)
                </button>
              </div>`
            : `<div class="td-upg-box" style="color:#4ade80;font-weight:800;text-align:center;">🌟 NÍVEL MÁXIMO ALCANÇADO!</div>`
        }
        <button type="button" class="td-btn chaos" id="td-sell-btn" ${!isOwner ? 'disabled' : ''}>
          💰 Vender (+${refund} 🍌)
        </button>
      </div>
    `;

    const targetBtn = this.inspectorWrap.querySelector<HTMLButtonElement>('#td-target-btn');
    if (targetBtn) targetBtn.onclick = () => this.game?.cycleTargetMode();

    const upgBtn = this.inspectorWrap.querySelector<HTMLButtonElement>('#td-upg-btn');
    if (upgBtn) upgBtn.onclick = () => this.game?.upgradeSelectedTower();

    const sellBtn = this.inspectorWrap.querySelector<HTMLButtonElement>('#td-sell-btn');
    if (sellBtn) sellBtn.onclick = () => this.game?.sellSelectedTower();
  }

  private renderEndModal(snap: UiSnapshot): void {
    if (!snap.gameOver && !snap.victoryShown) {
      this.endModal.style.display = 'none';
      return;
    }

    const best = Math.max(snap.score, getGameScore('monkey-bloons-td').bestScore);
    this.endModal.style.display = 'flex';

    if (snap.gameOver) {
      this.endModal.innerHTML = `
        <div class="td-modal" style="border-color:#fb7185;">
          <h1 style="color:#fecdd3;">😭 O BANANAL FOI ROUBADO!</h1>
          <p>
            As bexigas zombeteiras passaram da conta na <strong>Onda ${snap.wave}</strong>!<br/>
            Pontuação: <strong>${snap.score}</strong> • Recorde: <strong>${best}</strong> 🏆
          </p>
          <button type="button" class="td-btn primary" id="td-restart-btn" style="font-size:15px;padding:11px 24px;">
            🔄 JOGAR DE NOVO
          </button>
        </div>
      `;
      this.endModal.querySelector<HTMLButtonElement>('#td-restart-btn')!.onclick = () => {
        this.game?.restartMatch();
      };
    } else if (snap.victoryShown) {
      this.endModal.innerHTML = `
        <div class="td-modal">
          <h1>🎉 RECEITA FEDERAL ESTOURADA! 💸</h1>
          <p>
            Você destruiu o temido <strong>ZEPELIM DA RECEITA FEDERAL</strong> na Onda 15!<br/>
            Pontuação atual: <strong>${snap.score}</strong> • Recorde: <strong>${best}</strong> 🏆
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="td-btn primary" id="td-endless-btn" style="font-size:14px;padding:10px 18px;">
              🚀 CONTINUAR MODO INFINITO
            </button>
            <button type="button" class="td-btn warn" id="td-restart-win-btn" style="font-size:14px;padding:10px 18px;">
              🔄 JOGAR DE NOVO
            </button>
          </div>
        </div>
      `;
      this.endModal.querySelector<HTMLButtonElement>('#td-endless-btn')!.onclick = () => {
        this.game?.continueEndless();
      };
      this.endModal.querySelector<HTMLButtonElement>('#td-restart-win-btn')!.onclick = () => {
        this.game?.restartMatch();
      };
    }
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.startModalVisible) return;
      if (!this.game) return;

      if (e.key >= '1' && e.key <= '5') {
        const idx = Number(e.key) - 1;
        this.game.selectShopTower(TOWER_ORDER[idx]);
      } else if (e.key === 'Escape') {
        this.game.selectShopTower(null);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!this.game.getUiSnapshot().waveActive) {
          this.game.startNextWave();
        } else {
          this.game.toggleSpeed();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.game.sellSelectedTower();
      }
    });
  }

  private makeBtn(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  }

  private makeStat(extraClass: string, text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `td-stat ${extraClass}`.trim();
    el.textContent = text;
    return el;
  }
}
