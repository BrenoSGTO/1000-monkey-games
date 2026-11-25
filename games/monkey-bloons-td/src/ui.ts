import { getGameScore, monkeyAudio } from '@monkey-slop/sdk';
import {
  ATTACK_TIERS,
  ATTACK_TIER_ORDER,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAPS,
  MAP_ORDER,
  TOWER_DEFS,
  TOWER_ORDER,
} from './data';
import type { MonkeyBloonsGame, UiSnapshot } from './game';
import type { GameMode, MapId, TargetMode, TowerType } from './types';

const TARGET_LABELS: Record<TargetMode, string> = {
  first: 'Primeiro',
  strong: 'Mais Forte',
  close: 'Mais Perto',
  last: 'Último',
};

const MAP_ICONS: Record<MapId, string> = {
  selva: '🌴',
  feira: '🛒',
  ilha: '🏝️',
};

interface InspectorRefs {
  towerId: string;
  level: number;
  isOwner: boolean;
  titleEl: HTMLElement;
  popsEl: HTMLElement;
  ownerEl: HTMLElement;
  buffEl: HTMLElement;
  targetBtn: HTMLButtonElement | null;
  upgWrap: HTMLElement;
  upgBtn: HTMLButtonElement | null;
  sellBtn: HTMLButtonElement;
}

export class TdUiController {
  private root: HTMLElement;
  public readonly canvas: HTMLCanvasElement;

  private game: MonkeyBloonsGame | null = null;
  private startModalVisible = true;
  private chosenStartMap: MapId = 'selva';
  private chosenStartMode: GameMode = 'coop';
  private selectedGiftTarget = 'split';

  // Top bar refs
  private mapBtns: Record<MapId, HTMLButtonElement>;
  private modeBtns: Record<GameMode, HTMLButtonElement>;
  private bananasEl: HTMLElement;
  private livesEl: HTMLElement;
  private waveEl: HTMLElement;
  private scoreEl: HTMLElement;
  private localTurnBtn: HTMLButtonElement;
  private startWaveBtn: HTMLButtonElement;
  private abilityBtn: HTMLButtonElement;
  private pingBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;

  // Stage HUD refs
  private waveTitleEl: HTMLElement;
  private nextPreviewEl: HTMLElement;
  private placementBar: HTMLElement;
  private placementLabel: HTMLElement;
  private leaderboardBox: HTMLElement;

  // Sidebar refs
  private shopCards = new Map<TowerType, HTMLButtonElement>();
  private inspectorWrap: HTMLElement;
  private inspectorRefs: InspectorRefs | null = null;
  private coopStatusBadge: HTMLElement;
  private incomeBadge: HTMLElement;
  private giftTargetSelect: HTMLSelectElement;
  private giftBtn: HTMLButtonElement;
  private attackBtns = new Map<string, HTMLButtonElement>();

  // Modals
  private startModal: HTMLElement;
  private endModal: HTMLElement;
  private confirmModal: HTMLElement;
  private lastEndModalKey = '';

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

    this.mapBtns = {
      selva: this.makeBtn('🌴 Selva', 'td-btn active', () => this.game?.requestMapChange('selva')),
      feira: this.makeBtn('🛒 Feira', 'td-btn', () => this.game?.requestMapChange('feira')),
      ilha: this.makeBtn('🏝️ Ilha 2x', 'td-btn', () => this.game?.requestMapChange('ilha')),
    };
    leftGroup.append(this.mapBtns.selva, this.mapBtns.feira, this.mapBtns.ilha);

    const modeGroup = document.createElement('div');
    modeGroup.className = 'td-group';
    this.modeBtns = {
      coop: this.makeBtn('🤝 Co-op', 'td-btn active', () => this.game?.setGameMode('coop')),
      versus: this.makeBtn('⚔️ Versus', 'td-btn', () => this.game?.setGameMode('versus')),
      local2p: this.makeBtn('👥 2P Local', 'td-btn', () => this.game?.setGameMode('local2p')),
    };
    modeGroup.append(this.modeBtns.coop, this.modeBtns.versus, this.modeBtns.local2p);

    const statsGroup = document.createElement('div');
    statsGroup.className = 'td-group';

    this.bananasEl = this.makeStat('gold', '🍌 380');
    this.livesEl = this.makeStat('lives', '❤️ 25');
    this.waveEl = this.makeStat('wave', '🌊 Onda 0');
    this.scoreEl = this.makeStat('', '🏆 0');
    this.localTurnBtn = this.makeBtn('🔄 Turno P1', 'td-btn warn', () => {
      this.game?.switchLocalTurn();
    });
    this.localTurnBtn.style.display = 'none';
    statsGroup.append(this.bananasEl, this.livesEl, this.waveEl, this.scoreEl, this.localTurnBtn);

    const ctrlGroup = document.createElement('div');
    ctrlGroup.className = 'td-group';

    this.startWaveBtn = this.makeBtn('▶ Iniciar Onda 1', 'td-btn primary pulse', () => {
      this.game?.startNextWave();
    });
    this.abilityBtn = this.makeBtn('💣 [Q] Chuva', 'td-btn warn', () => {
      this.game?.activateAbility();
    });
    this.abilityBtn.title = 'Ativar Chuva de Bananas Explosivas (Tecla Q)';
    this.pingBtn = this.makeBtn('📍 [P]', 'td-btn', () => {
      this.game?.triggerPing();
    });
    this.pingBtn.title = 'Pingar ponto no mapa para os amigos (Tecla P)';
    this.speedBtn = this.makeBtn('⏩ 1x', 'td-btn', () => {
      this.game?.toggleSpeed();
    });
    this.autoBtn = this.makeBtn('🔁 Auto: OFF', 'td-btn', () => {
      this.game?.toggleAutoWave();
    });
    ctrlGroup.append(this.startWaveBtn, this.abilityBtn, this.pingBtn, this.speedBtn, this.autoBtn);

    topbar.append(leftGroup, modeGroup, statsGroup, ctrlGroup);
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

    // Floating placement cancel bar
    this.placementBar = document.createElement('div');
    this.placementBar.className = 'td-placement-bar';
    this.placementBar.style.display = 'none';
    this.placementLabel = document.createElement('span');
    const cancelPlaceBtn = this.makeBtn('✖ Cancelar (Esc)', 'td-btn chaos', () => {
      this.game?.cancelPlacement();
    });
    this.placementBar.append(this.placementLabel, cancelPlaceBtn);
    canvasWrap.appendChild(this.placementBar);

    // Live MVP / Versus leaderboard overlay (top-right inside canvas wrap)
    this.leaderboardBox = document.createElement('div');
    this.leaderboardBox.className = 'td-leaderboard';
    this.leaderboardBox.style.display = 'none';
    canvasWrap.appendChild(this.leaderboardBox);

    // Wave preview + footer bar
    const footerBar = document.createElement('div');
    footerBar.className = 'td-footer-bar';
    this.waveTitleEl = document.createElement('strong');
    this.waveTitleEl.textContent = 'Pronto para o Caos!';
    this.nextPreviewEl = document.createElement('div');
    this.nextPreviewEl.className = 'td-wave-preview';
    footerBar.append(this.waveTitleEl, this.nextPreviewEl);

    stageCol.append(canvasWrap, footerBar);

    // Sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'td-sidebar';

    const shopTitle = document.createElement('div');
    shopTitle.className = 'td-section-title';
    shopTitle.innerHTML = '<span>🐒 Loja da Macacada</span><span>[1-7]</span>';
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

    // Inspector wrap
    this.inspectorWrap = document.createElement('div');
    sidebar.appendChild(this.inspectorWrap);

    // Co-op & Bloons Battles Chaos Box
    const coopBox = document.createElement('div');
    coopBox.className = 'td-coop-box';

    const coopTitle = document.createElement('div');
    coopTitle.className = 'td-section-title';
    coopTitle.style.marginBottom = '2px';
    this.coopStatusBadge = document.createElement('span');
    this.coopStatusBadge.textContent = 'Solo (Offline)';
    coopTitle.innerHTML = '<span>⚔️ Co-op & Sabotagem</span>';
    coopTitle.appendChild(this.coopStatusBadge);

    this.incomeBadge = document.createElement('div');
    this.incomeBadge.className = 'td-income-badge';
    this.incomeBadge.textContent = 'Renda extra por envio: +0 🍌/onda';

    const giftRow = document.createElement('div');
    giftRow.className = 'td-gift-row';
    this.giftTargetSelect = document.createElement('select');
    this.giftTargetSelect.className = 'td-select';
    this.giftTargetSelect.onchange = () => {
      this.selectedGiftTarget = this.giftTargetSelect.value;
    };
    this.giftBtn = this.makeBtn('🍌 Mandar 50🍌', 'td-btn warn', () => {
      this.game?.giftBananasToFriends(this.selectedGiftTarget);
    });
    giftRow.append(this.giftTargetSelect, this.giftBtn);

    const attackGrid = document.createElement('div');
    attackGrid.className = 'td-attack-grid';
    for (const tierId of ATTACK_TIER_ORDER) {
      const t = ATTACK_TIERS[tierId];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'td-btn chaos td-attack-btn';
      btn.title = t.description;
      btn.innerHTML = `<span>${t.emoji} ${t.shortLabel}</span><small>${t.cost}🍌 → +${t.incomeGain}🍌/onda</small>`;
      btn.onclick = () => this.game?.sendAttackBloons(tierId);
      this.attackBtns.set(tierId, btn);
      attackGrid.appendChild(btn);
    }

    coopBox.append(coopTitle, this.incomeBadge, giftRow, attackGrid);
    sidebar.appendChild(coopBox);

    main.append(stageCol, sidebar);
    shell.appendChild(main);

    // Modals
    this.startModal = document.createElement('div');
    this.startModal.className = 'td-modal-backdrop';
    this.renderStartModal();

    this.endModal = document.createElement('div');
    this.endModal.className = 'td-modal-backdrop';
    this.endModal.style.display = 'none';

    this.confirmModal = document.createElement('div');
    this.confirmModal.className = 'td-modal-backdrop';
    this.confirmModal.style.display = 'none';

    this.root.append(shell, this.startModal, this.endModal, this.confirmModal);
    this.bindKeyboard();
  }

  public attachGame(game: MonkeyBloonsGame): void {
    this.game = game;
    this.update(game.getUiSnapshot());
  }

  private renderStartModal(): void {
    const best = getGameScore('monkey-bloons-td').bestScore;
    const mapCards = MAP_ORDER.map((id) => {
      const m = MAPS[id];
      return `
        <button type="button" class="td-map-pick ${this.chosenStartMap === id ? 'active' : ''}" data-map="${id}">
          <strong>${MAP_ICONS[id]} ${m.name}</strong>
          <span>${m.subtitle}</span>
        </button>
      `;
    }).join('');

    const modes: Array<{ id: GameMode; label: string; desc: string }> = [
      { id: 'coop', label: '🤝 Solo / Co-op P2P', desc: 'Defendam juntos (ou trollem com renda extra)' },
      { id: 'versus', label: '⚔️ Duelo Versus P2P', desc: 'Cada um no seu mapa! Mande enxames nos rivais' },
      { id: 'local2p', label: '👥 2P Local (Mesmo PC)', desc: 'Orçamento dividido P1 vs P2 por turnos [Tab]' },
    ];
    const modeCards = modes
      .map(
        (m) => `
        <button type="button" class="td-mode-pick ${this.chosenStartMode === m.id ? 'active' : ''}" data-mode="${m.id}">
          <strong>${m.label}</strong>
          <span>${m.desc}</span>
        </button>
      `,
      )
      .join('');

    this.startModal.innerHTML = `
      <div class="td-modal" style="max-width:620px;">
        <h1>🎈 Macaco Estoura-Bexiga TD 🐒</h1>
        <p>
          As bexigas folgadas e o <strong>Dirigível do Imposto de Renda</strong> estão invadindo!
          Escolha seu mapa, monte a defesa da macacada e segure o ataque em <strong>Solo</strong>, <strong>Co-op</strong>, <strong>Versus</strong> ou <strong>2P Local</strong>.
          ${best > 0 ? `<br/><strong>🏆 Seu Recorde: ${best} pts</strong>` : ''}
        </p>
        <div class="td-map-picks" style="grid-template-columns:repeat(3, 1fr);">${mapCards}</div>
        <div class="td-map-picks" style="grid-template-columns:repeat(3, 1fr);margin-bottom:12px;">${modeCards}</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">🎮 Controles: <strong>F1</strong> (ou botão no topo)</div>
        <button type="button" class="td-btn primary" id="td-play-now" style="font-size:16px;padding:12px 28px;">
          🍌 MACACAR AGORA!
        </button>
      </div>
    `;

    this.startModal.querySelectorAll<HTMLButtonElement>('.td-map-pick').forEach((btn) => {
      btn.onclick = () => {
        monkeyAudio.play('click', 0.2);
        this.chosenStartMap = btn.dataset.map as MapId;
        this.game?.setMap(this.chosenStartMap, false, true);
        this.renderStartModal();
      };
    });

    this.startModal.querySelectorAll<HTMLButtonElement>('.td-mode-pick').forEach((btn) => {
      btn.onclick = () => {
        monkeyAudio.play('click', 0.2);
        this.chosenStartMode = btn.dataset.mode as GameMode;
        this.game?.setGameMode(this.chosenStartMode);
        this.renderStartModal();
      };
    });

    const playBtn = this.startModal.querySelector<HTMLButtonElement>('#td-play-now')!;
    playBtn.onclick = () => {
      monkeyAudio.play('screech', 0.22);
      this.startModalVisible = false;
      this.startModal.style.display = 'none';
      this.game?.setGameMode(this.chosenStartMode);
      this.game?.setMap(this.chosenStartMap, false, true);
    };
  }

  public hideStartModal(): void {
    this.startModalVisible = false;
    this.startModal.style.display = 'none';
  }

  public update(snap: UiSnapshot): void {
    for (const id of MAP_ORDER) {
      this.mapBtns[id].classList.toggle('active', snap.mapId === id);
    }
    for (const m of ['coop', 'versus', 'local2p'] as GameMode[]) {
      this.modeBtns[m].classList.toggle('active', snap.gameMode === m);
      this.modeBtns[m].disabled = m === 'local2p' && snap.isOnline;
    }

    if (snap.gameMode === 'local2p') {
      this.bananasEl.textContent = `🍌 P1:${snap.local2pWallets[0]} | P2:${snap.local2pWallets[1]}`;
      this.localTurnBtn.style.display = 'inline-flex';
      this.localTurnBtn.textContent = `🔄 Turno: P${snap.activeLocalIndex + 1} [Tab]`;
      this.localTurnBtn.style.borderColor = snap.activeActorColor;
    } else {
      this.bananasEl.textContent = `🍌 ${snap.bananas}`;
      this.localTurnBtn.style.display = 'none';
    }

    this.livesEl.textContent = `❤️ ${snap.lives}`;
    this.waveEl.textContent = `🌊 Onda ${snap.wave}`;
    this.scoreEl.textContent = `🏆 ${snap.score}`;
    this.waveTitleEl.textContent = snap.waveTitle;

    // Next wave preview pills
    this.renderWavePreview(snap);

    // Placement floating cancel banner
    if (snap.placingType) {
      const def = TOWER_DEFS[snap.placingType];
      this.placementBar.style.display = 'flex';
      this.placementLabel.textContent = `${def.emoji} Posicionando: ${def.shortName} (${def.cost}🍌) • Shift+clique para vários`;
    } else {
      this.placementBar.style.display = 'none';
    }

    // Start Wave button
    this.startWaveBtn.disabled = snap.waveActive || snap.gameOver;
    this.startWaveBtn.classList.toggle('pulse', !snap.waveActive && !snap.gameOver);
    this.startWaveBtn.textContent = snap.waveActive
      ? `⏳ Onda ${snap.wave}...`
      : `▶ Onda ${snap.wave + 1}`;

    // Active ability button
    if (snap.abilityCooldown > 0.1) {
      this.abilityBtn.disabled = true;
      this.abilityBtn.textContent = `💣 ${Math.ceil(snap.abilityCooldown)}s`;
      this.abilityBtn.classList.remove('pulse');
    } else {
      this.abilityBtn.disabled = snap.gameOver;
      this.abilityBtn.textContent = '💣 [Q] Chuva';
      this.abilityBtn.classList.toggle('pulse', snap.waveActive && !snap.gameOver);
    }

    this.speedBtn.textContent = snap.speed === 2 ? '⚡ 2x' : '⏩ 1x';
    this.speedBtn.classList.toggle('active', snap.speed === 2);

    this.autoBtn.textContent = snap.autoWave ? '🔁 Auto: ON' : '🔁 Auto: OFF';
    this.autoBtn.classList.toggle('active', snap.autoWave);

    for (const [type, card] of this.shopCards) {
      const def = TOWER_DEFS[type];
      card.classList.toggle('selected', snap.placingType === type);
      card.classList.toggle('expensive', snap.bananas < def.cost);
    }

    this.renderInspector(snap);
    this.renderCoopBox(snap);
    this.renderLeaderboard(snap);
    this.renderConfirmModal(snap);
    this.renderEndModal(snap);
  }

  private renderWavePreview(snap: UiSnapshot): void {
    const p = snap.nextWavePreview;
    const pills = p.items
      .map((item) => {
        const badge = item.isBoss ? 'boss' : item.isCamo ? 'camo' : item.isLead ? 'lead' : '';
        return `<span class="td-preview-pill ${badge}" title="${item.name}">${item.emoji} ${item.count}x</span>`;
      })
      .join('');
    this.nextPreviewEl.innerHTML = `<span class="td-preview-label">Próx. (Onda ${p.wave}${p.isBossWave ? ' ⚠️CHEFE' : ''}):</span>${pills}`;
  }

  private renderCoopBox(snap: UiSnapshot): void {
    if (snap.gameMode === 'local2p') {
      this.coopStatusBadge.textContent = `2P Local (P${snap.activeLocalIndex + 1})`;
      this.coopStatusBadge.style.color = snap.activeActorColor;
      this.giftTargetSelect.style.display = 'none';
      this.giftBtn.textContent = `🍌 Transferir 50🍌 p/ P${snap.activeLocalIndex === 0 ? 2 : 1}`;
      this.giftBtn.disabled = snap.bananas < 50;
    } else {
      this.coopStatusBadge.textContent = snap.isOnline
        ? `${snap.playersCount} Macacos (${snap.gameMode === 'versus' ? 'Versus' : 'Co-op'})`
        : 'Solo (Abra Co-op no topo)';
      this.coopStatusBadge.style.color = snap.isOnline ? '#4ade80' : '#94a3b8';

      this.giftTargetSelect.style.display = snap.otherPlayers.length > 0 ? 'block' : 'none';
      const opts = [
        { value: 'split', label: snap.otherPlayers.length > 1 ? 'Dividir todos' : snap.otherPlayers[0]?.name ?? 'Amigo' },
        ...(snap.otherPlayers.length > 1
          ? snap.otherPlayers.map((o) => ({ value: o.id, label: `Só ${o.name}` }))
          : []),
      ];
      const optsKey = opts.map((o) => `${o.value}:${o.label}`).join('|');
      if (this.giftTargetSelect.dataset.key !== optsKey) {
        this.giftTargetSelect.dataset.key = optsKey;
        this.giftTargetSelect.innerHTML = opts
          .map((o) => `<option value="${o.value}">${o.label}</option>`)
          .join('');
        if (opts.some((o) => o.value === this.selectedGiftTarget)) {
          this.giftTargetSelect.value = this.selectedGiftTarget;
        } else {
          this.selectedGiftTarget = 'split';
        }
      }
      this.giftBtn.textContent = '🍌 Enviar 50🍌';
      this.giftBtn.disabled = !snap.isOnline || snap.bananas < 50;
    }

    this.incomeBadge.textContent = `Renda extra acumulada: +${snap.incomeBonus} 🍌/onda`;

    for (const tierId of ATTACK_TIER_ORDER) {
      const btn = this.attackBtns.get(tierId);
      if (!btn) continue;
      const tier = ATTACK_TIERS[tierId];
      const canSend = (snap.isOnline || snap.gameMode === 'local2p') && snap.attackCooldown <= 0 && snap.bananas >= tier.cost && !snap.gameOver;
      btn.disabled = !canSend;
      const small = btn.querySelector('small');
      if (small) {
        small.textContent =
          snap.attackCooldown > 0
            ? `Recarga ${Math.ceil(snap.attackCooldown)}s`
            : `${tier.cost}🍌 → +${tier.incomeGain}🍌/onda`;
      }
    }
  }

  private renderLeaderboard(snap: UiSnapshot): void {
    const show = (snap.isOnline || snap.gameMode === 'local2p') && snap.leaderboard.length > 0;
    if (!show) {
      this.leaderboardBox.style.display = 'none';
      return;
    }
    this.leaderboardBox.style.display = 'flex';
    const title = snap.gameMode === 'versus' ? '⚔️ Duelo ao Vivo' : '🏆 Placar Co-op';
    const rows = snap.leaderboard
      .map((p, idx) => {
        const badge = idx === 0 ? '👑' : `${idx + 1}.`;
        const extra =
          snap.gameMode === 'versus'
            ? `❤️${p.lives} • 💥${p.pops}`
            : `💥${p.pops}`;
        return `<div class="td-lb-row ${!p.alive ? 'dead' : ''}">
          <span style="color:${p.color};font-weight:800;">${badge} ${p.name}</span>
          <span>${extra}</span>
        </div>`;
      })
      .join('');
    this.leaderboardBox.innerHTML = `<div class="td-lb-title">${title}</div>${rows}`;
  }

  /**
   * CRITICAL FIX #1: Never rebuild inspector innerHTML on every pop/frame!
   * Only rebuild structure when selectedTowerId, level, or ownership changes;
   * update textContent & disabled states in-place so button clicks are never dropped!
   */
  private renderInspector(snap: UiSnapshot): void {
    const t = snap.selectedTower;
    if (!t) {
      if (this.inspectorRefs) {
        this.inspectorWrap.innerHTML = '';
        this.inspectorRefs = null;
      }
      return;
    }

    const def = TOWER_DEFS[t.type];
    const isOwner =
      snap.gameMode === 'local2p'
        ? t.ownerId === snap.activeActorId
        : !snap.isOnline || t.ownerId === snap.localPlayerId;
    const nextUpg = t.level < 3 ? def.upgrades[t.level] : null;
    const refund = Math.round(t.totalSpent * 0.7);
    const currentLabel = t.level === 0 ? def.shortName : def.upgrades[t.level - 1].name;

    if (
      !this.inspectorRefs ||
      this.inspectorRefs.towerId !== t.id ||
      this.inspectorRefs.level !== t.level ||
      this.inspectorRefs.isOwner !== isOwner
    ) {
      this.inspectorWrap.innerHTML = `
        <div class="td-inspector">
          <h3 id="td-insp-title"></h3>
          <div class="td-inspector-stats">
            <span id="td-insp-pops"></span>
            <span id="td-insp-owner"></span>
          </div>
          <div id="td-insp-buff" style="font-size:11px;color:#e879f9;font-weight:700;display:none;"></div>
          ${
            t.type !== 'dj' && t.type !== 'fazenda'
              ? `<button type="button" class="td-btn" id="td-target-btn"></button>`
              : ''
          }
          <div id="td-insp-upg-wrap">
            ${
              nextUpg
                ? `<div class="td-upg-box">
                    <div style="font-weight:800;color:#fef08a;margin-bottom:2px;">⬆️ ${nextUpg.name}</div>
                    <div style="color:#cbd5e1;margin-bottom:6px;">${nextUpg.description}</div>
                    <button type="button" class="td-btn primary" id="td-upg-btn" style="width:100%;">
                      [U] Evoluir (${nextUpg.cost} 🍌)
                    </button>
                  </div>`
                : `<div class="td-upg-box" style="color:#4ade80;font-weight:800;text-align:center;">🌟 NÍVEL MÁXIMO ALCANÇADO!</div>`
            }
          </div>
          <button type="button" class="td-btn chaos" id="td-sell-btn"></button>
        </div>
      `;

      const targetBtn = this.inspectorWrap.querySelector<HTMLButtonElement>('#td-target-btn');
      if (targetBtn) targetBtn.onclick = () => this.game?.cycleTargetMode();

      const upgBtn = this.inspectorWrap.querySelector<HTMLButtonElement>('#td-upg-btn');
      if (upgBtn) upgBtn.onclick = () => this.game?.upgradeSelectedTower();

      const sellBtn = this.inspectorWrap.querySelector<HTMLButtonElement>('#td-sell-btn')!;
      sellBtn.onclick = () => this.game?.sellSelectedTower();

      this.inspectorRefs = {
        towerId: t.id,
        level: t.level,
        isOwner,
        titleEl: this.inspectorWrap.querySelector('#td-insp-title')!,
        popsEl: this.inspectorWrap.querySelector('#td-insp-pops')!,
        ownerEl: this.inspectorWrap.querySelector('#td-insp-owner')!,
        buffEl: this.inspectorWrap.querySelector('#td-insp-buff')!,
        targetBtn,
        upgWrap: this.inspectorWrap.querySelector('#td-insp-upg-wrap')!,
        upgBtn,
        sellBtn,
      };
    }

    const refs = this.inspectorRefs;
    refs.titleEl.textContent = `${def.emoji} ${currentLabel} (Lv.${t.level}/3)`;
    refs.popsEl.textContent =
      t.type === 'fazenda'
        ? `🍌 Gerou: ${t.farmEarned ?? 0}`
        : `💥 Estouros: ${t.pops}`;
    refs.ownerEl.innerHTML =
      snap.isOnline || snap.gameMode === 'local2p'
        ? `👤 <strong style="color:${t.ownerColor}">${t.ownerName}</strong>`
        : '🐵 Seu Macaco';

    if (t.buffedMultiplier > 1.01 && t.type !== 'fazenda') {
      refs.buffEl.style.display = 'block';
      refs.buffEl.textContent = `🔊 Buff JBL ativo: +${Math.round((t.buffedMultiplier - 1) * 100)}% vel.!`;
    } else {
      refs.buffEl.style.display = 'none';
    }

    if (refs.targetBtn) {
      refs.targetBtn.disabled = !isOwner;
      refs.targetBtn.textContent = `🎯 [T] Alvo: ${TARGET_LABELS[t.targetMode]}`;
    }

    if (refs.upgBtn && nextUpg) {
      refs.upgBtn.disabled = !isOwner || snap.bananas < nextUpg.cost;
    }

    refs.sellBtn.disabled = !isOwner;
    refs.sellBtn.textContent = `💰 Vender (+${refund} 🍌)`;
  }

  private renderConfirmModal(snap: UiSnapshot): void {
    if (!snap.pendingMapConfirm) {
      this.confirmModal.style.display = 'none';
      return;
    }
    const targetName = MAPS[snap.pendingMapConfirm].name;
    this.confirmModal.style.display = 'flex';
    if (this.confirmModal.dataset.target === snap.pendingMapConfirm) return;
    this.confirmModal.dataset.target = snap.pendingMapConfirm;
    this.confirmModal.innerHTML = `
      <div class="td-modal" style="max-width:420px;border-color:#fb7185;">
        <h2>⚠️ Trocar de Mapa?</h2>
        <p>Mudar para <strong>${targetName}</strong> vai reiniciar a partida atual na Onda ${snap.wave}.</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button type="button" class="td-btn chaos" id="td-confirm-map">Sim, Trocar Mapa</button>
          <button type="button" class="td-btn" id="td-cancel-map">Continuar Aqui</button>
        </div>
      </div>
    `;
    this.confirmModal.querySelector<HTMLButtonElement>('#td-confirm-map')!.onclick = () => {
      this.confirmModal.dataset.target = '';
      this.game?.confirmMapChange();
    };
    this.confirmModal.querySelector<HTMLButtonElement>('#td-cancel-map')!.onclick = () => {
      this.confirmModal.dataset.target = '';
      this.game?.cancelMapChange();
    };
  }

  private renderEndModal(snap: UiSnapshot): void {
    if (!snap.gameOver && !snap.victoryShown) {
      this.endModal.style.display = 'none';
      this.lastEndModalKey = '';
      return;
    }

    const key = `${snap.gameOver}:${snap.victoryShown}:${snap.versusWinner ?? ''}:${snap.wave}:${snap.score}`;
    if (key === this.lastEndModalKey) return;
    this.lastEndModalKey = key;

    const best = Math.max(snap.score, getGameScore('monkey-bloons-td').bestScore);
    this.endModal.style.display = 'flex';

    if (snap.versusWinner) {
      this.endModal.innerHTML = `
        <div class="td-modal">
          <h1>🏆 VITÓRIA NO DUELO VERSUS! ⚔️</h1>
          <p>
            <strong>${snap.versusWinner}</strong> sobreviveu a todos os enxames rivais!<br/>
            Pontuação: <strong>${snap.score}</strong> • Recorde: <strong>${best}</strong> 🏆
          </p>
          <button type="button" class="td-btn primary" id="td-restart-vs-btn" style="font-size:15px;padding:11px 24px;">
            🔄 NOVO DUELO
          </button>
        </div>
      `;
      this.endModal.querySelector<HTMLButtonElement>('#td-restart-vs-btn')!.onclick = () => {
        this.game?.restartMatch();
      };
    } else if (snap.gameOver) {
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (this.startModalVisible) return;
      if (!this.game) return;

      const lower = e.key.toLowerCase();
      if (e.key >= '1' && e.key <= '7') {
        const idx = Number(e.key) - 1;
        if (TOWER_ORDER[idx]) this.game.selectShopTower(TOWER_ORDER[idx]);
      } else if (e.key === 'Escape') {
        this.game.selectShopTower(null);
      } else if (lower === 'q') {
        this.game.activateAbility();
      } else if (lower === 'p') {
        this.game.triggerPing();
      } else if (lower === 'u') {
        this.game.upgradeSelectedTower();
      } else if (lower === 't') {
        this.game.cycleTargetMode();
      } else if (e.key === 'Tab') {
        if (this.game.gameMode === 'local2p') {
          e.preventDefault();
          this.game.switchLocalTurn();
        }
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
