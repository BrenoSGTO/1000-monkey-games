import { getGameScore, monkeyAudio } from '@monkey-slop/sdk';
import { DAYS_PER_WEEK, TOOL_META, WEEKDAY_NAMES } from './constants';
import { MAP_LIST } from './maps';
import type { TrafficSimulation } from './simulation';
import type { MapId, SimSpeed, ToolKind, UpgradeOption } from './types';

export interface GameUIActions {
  onSelectMap: (mapId: MapId) => void;
  onSelectTool: (tool: ToolKind) => void;
  onSetSpeed: (speed: SimSpeed) => void;
  onToggleNight: () => void;
  onOpenMenu: () => void;
  onPickUpgrade: (index: number) => void;
  onRestart: () => void;
}

const UI_STYLE_ID = 'monkey-motorways-ui-styles';

function injectStyles(): void {
  if (document.getElementById(UI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UI_STYLE_ID;
  style.textContent = `
    .mmw-top-right {
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 900;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      pointer-events: none;
    }
    .mmw-pill {
      pointer-events: auto;
      background: rgba(17, 24, 39, 0.9);
      color: #f8fafc;
      border: 2px solid rgba(250, 204, 21, 0.7);
      border-radius: 999px;
      padding: 5px 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 800;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .mmw-score {
      color: #fde047;
      font-size: 15px;
    }
    .mmw-clock-ring {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid #94a3b8;
      position: relative;
      background: #0f172a;
      overflow: hidden;
    }
    .mmw-clock-fill {
      position: absolute;
      inset: 0;
      border-radius: 50%;
    }
    .mmw-speed-btn, .mmw-icon-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1.5px solid #475569;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;
    }
    .mmw-speed-btn:hover, .mmw-icon-btn:hover {
      background: #334155;
      transform: translateY(-1px);
    }
    .mmw-speed-btn.active {
      background: #facc15;
      color: #111827;
      border-color: #fef08a;
    }
    .mmw-dock {
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 900;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
    }
    .mmw-dock-bar {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(17, 24, 39, 0.92);
      border: 2px solid rgba(255, 255, 255, 0.16);
      border-radius: 18px;
      padding: 6px 10px;
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
    }
    .mmw-tool-btn {
      position: relative;
      background: #1e293b;
      color: #f8fafc;
      border: 2px solid #334155;
      border-radius: 12px;
      padding: 7px 12px;
      min-width: 78px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      cursor: pointer;
      font-weight: 800;
      font-size: 11px;
      transition: transform 0.1s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .mmw-tool-btn:hover {
      background: #283548;
      transform: translateY(-2px);
    }
    .mmw-tool-btn.active {
      background: #f97316;
      border-color: #fde047;
      color: #ffffff;
      transform: translateY(-2px);
    }
    .mmw-tool-icon {
      font-size: 18px;
      line-height: 1.1;
    }
    .mmw-tool-count {
      font-size: 11px;
      color: #fde047;
      font-weight: 900;
    }
    .mmw-tool-btn.active .mmw-tool-count {
      color: #fef9c3;
    }
    .mmw-tool-key {
      position: absolute;
      top: 3px;
      left: 5px;
      font-size: 9px;
      opacity: 0.65;
    }
    .mmw-hint {
      background: rgba(17, 24, 39, 0.78);
      color: #e2e8f0;
      padding: 3px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .mmw-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 950;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .mmw-modal-backdrop.hidden {
      display: none;
    }
    .mmw-modal {
      width: min(740px, 100%);
      background: #111827;
      color: #f8fafc;
      border: 3px solid #facc15;
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      text-align: center;
    }
    .mmw-modal h1, .mmw-modal h2 {
      margin: 0 0 8px;
      color: #fde047;
    }
    .mmw-sub {
      margin: 0 0 18px;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.45;
    }
    .mmw-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      margin-top: 14px;
    }
    .mmw-card {
      background: #1e293b;
      border: 2px solid #334155;
      border-radius: 16px;
      padding: 16px;
      text-align: left;
      cursor: pointer;
      color: inherit;
      transition: transform 0.12s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .mmw-card:hover {
      transform: translateY(-3px);
      border-color: #facc15;
      background: #263449;
    }
    .mmw-badge {
      display: inline-block;
      background: rgba(250, 204, 21, 0.16);
      color: #fde047;
      border: 1px solid rgba(250, 204, 21, 0.45);
      border-radius: 999px;
      padding: 2px 9px;
      font-size: 11px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .mmw-card h3 {
      margin: 0 0 4px;
      font-size: 18px;
      color: #ffffff;
    }
    .mmw-card p {
      margin: 6px 0 0;
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .mmw-cta {
      margin-top: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #facc15;
      color: #111827;
      border: none;
      border-radius: 12px;
      padding: 11px 22px;
      font-size: 15px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 4px 0 #a16207;
      transition: transform 0.1s ease;
    }
    .mmw-cta:hover { transform: translateY(-1px); }
    .mmw-cta:active { transform: translateY(2px); box-shadow: 0 2px 0 #a16207; }
    .mmw-cta.secondary {
      background: #334155;
      color: #f8fafc;
      box-shadow: 0 4px 0 #0f172a;
    }
    .mmw-record {
      display: inline-block;
      background: rgba(74, 222, 128, 0.14);
      border: 1px solid rgba(74, 222, 128, 0.45);
      color: #bbf7d0;
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 12px;
    }
    @media (max-width: 720px) {
      .mmw-tool-btn { min-width: 58px; padding: 6px 8px; }
      .mmw-hint { display: none; }
    }
  `;
  document.head.appendChild(style);
}

export class GameUI {
  private topRight: HTMLDivElement;
  private scoreEl: HTMLSpanElement;
  private dayEl: HTMLSpanElement;
  private clockFill: HTMLDivElement;
  private speedBtns: Map<SimSpeed, HTMLButtonElement> = new Map();
  private nightBtn: HTMLButtonElement;

  private dock: HTMLDivElement;
  private toolBtns: Map<ToolKind, HTMLButtonElement> = new Map();
  private toolCounts: Map<ToolKind, HTMLSpanElement> = new Map();
  private hintEl: HTMLDivElement;

  private modalBackdrop: HTMLDivElement;
  private modalBox: HTMLDivElement;

  private actions: GameUIActions;
  private activeTool: ToolKind = 'road';
  private nightMode = false;

  constructor(actions: GameUIActions) {
    this.actions = actions;
    injectStyles();

    // Top-right HUD bar
    this.topRight = document.createElement('div');
    this.topRight.className = 'mmw-top-right';

    const scorePill = document.createElement('div');
    scorePill.className = 'mmw-pill';
    this.scoreEl = document.createElement('span');
    this.scoreEl.className = 'mmw-score';
    this.scoreEl.textContent = '🍌 0';

    const clockWrap = document.createElement('div');
    clockWrap.className = 'mmw-clock-ring';
    this.clockFill = document.createElement('div');
    this.clockFill.className = 'mmw-clock-fill';
    clockWrap.appendChild(this.clockFill);

    this.dayEl = document.createElement('span');
    this.dayEl.textContent = 'Sem 1 • SEG';

    scorePill.append(this.scoreEl, clockWrap, this.dayEl);

    const speedPill = document.createElement('div');
    speedPill.className = 'mmw-pill';

    const speeds: Array<{ s: SimSpeed; label: string; title: string }> = [
      { s: 0, label: '⏸', title: 'Pausar (Espaço)' },
      { s: 1, label: '1x', title: 'Velocidade Normal' },
      { s: 2, label: '2x', title: 'Velocidade Turbo (F)' },
    ];
    for (const item of speeds) {
      const btn = document.createElement('button');
      btn.className = 'mmw-speed-btn';
      btn.textContent = item.label;
      btn.title = item.title;
      btn.onclick = () => {
        monkeyAudio.play('click');
        this.actions.onSetSpeed(item.s);
      };
      this.speedBtns.set(item.s, btn);
      speedPill.appendChild(btn);
    }

    this.nightBtn = document.createElement('button');
    this.nightBtn.className = 'mmw-icon-btn';
    this.nightBtn.textContent = '☀️ Dia';
    this.nightBtn.title = 'Alternar Modo Dia / Noite (N)';
    this.nightBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onToggleNight();
    };
    speedPill.appendChild(this.nightBtn);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'mmw-icon-btn';
    menuBtn.textContent = '🗺️ Mapas';
    menuBtn.title = 'Escolher Cidade / Reiniciar';
    menuBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onOpenMenu();
    };
    speedPill.appendChild(menuBtn);

    this.topRight.append(scorePill, speedPill);
    document.body.appendChild(this.topRight);

    // Bottom Tool Dock
    this.dock = document.createElement('div');
    this.dock.className = 'mmw-dock';

    const dockBar = document.createElement('div');
    dockBar.className = 'mmw-dock-bar';

    const tools: ToolKind[] = ['road', 'light', 'roundabout', 'motorway', 'erase'];
    for (const tool of tools) {
      const meta = TOOL_META[tool];
      const btn = document.createElement('button');
      btn.className = 'mmw-tool-btn';
      btn.title = `${meta.label} (${meta.hotkey}): ${meta.desc}`;

      const keyBadge = document.createElement('span');
      keyBadge.className = 'mmw-tool-key';
      keyBadge.textContent = meta.hotkey;

      const icon = document.createElement('span');
      icon.className = 'mmw-tool-icon';
      icon.textContent = meta.icon;

      const label = document.createElement('span');
      label.textContent = meta.label;

      const count = document.createElement('span');
      count.className = 'mmw-tool-count';
      count.textContent = '0';

      btn.append(keyBadge, icon, label, count);
      btn.onclick = () => {
        monkeyAudio.play('click');
        this.actions.onSelectTool(tool);
      };

      this.toolBtns.set(tool, btn);
      this.toolCounts.set(tool, count);
      dockBar.appendChild(btn);
    }

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'mmw-hint';
    this.hintEl.textContent = TOOL_META.road.desc;

    this.dock.append(this.hintEl, dockBar);
    document.body.appendChild(this.dock);

    // Modal overlay (Menu, Upgrades, Game Over)
    this.modalBackdrop = document.createElement('div');
    this.modalBackdrop.className = 'mmw-modal-backdrop';
    this.modalBox = document.createElement('div');
    this.modalBox.className = 'mmw-modal';
    this.modalBackdrop.appendChild(this.modalBox);
    document.body.appendChild(this.modalBackdrop);
  }

  setNightMode(night: boolean): void {
    this.nightMode = night;
    this.nightBtn.textContent = night ? '🌙 Noite' : '☀️ Dia';
  }

  setActiveTool(tool: ToolKind): void {
    this.activeTool = tool;
    for (const [k, btn] of this.toolBtns) {
      btn.classList.toggle('active', k === tool);
    }
    this.hintEl.textContent = TOOL_META[tool].desc;
  }

  update(sim: TrafficSimulation): void {
    this.scoreEl.textContent = `🍌 ${sim.deliveries}`;
    const weekday = WEEKDAY_NAMES[(sim.day - 1) % DAYS_PER_WEEK];
    this.dayEl.textContent = `Sem ${sim.week} • ${weekday} (D${sim.day})`;

    const deg = Math.floor(sim.dayProgress * 360);
    this.clockFill.style.background = `conic-gradient(#facc15 ${deg}deg, transparent ${deg}deg)`;

    for (const [s, btn] of this.speedBtns) {
      btn.classList.toggle('active', sim.speed === s);
    }

    this.toolCounts.get('road')!.textContent = `${sim.inventory.roads} • 🌉${sim.inventory.bridges}`;
    this.toolCounts.get('light')!.textContent = `${sim.inventory.lights}`;
    this.toolCounts.get('roundabout')!.textContent = `${sim.inventory.roundabouts}`;
    this.toolCounts.get('motorway')!.textContent = `${sim.inventory.motorways}`;
    this.toolCounts.get('erase')!.textContent = 'Dir.';

    // Show/hide gameplay dock during menu
    this.dock.style.display = sim.phase === 'menu' ? 'none' : 'flex';
  }

  showMenu(): void {
    const rec = getGameScore('monkey-motorways');
    this.modalBackdrop.classList.remove('hidden');
    this.modalBox.innerHTML = `
      <h1>🛣️ Mini Macacoways</h1>
      <p class="mmw-sub">
        Ligue as casinhas de macaco aos mercados da mesma cor antes que os pedidos lotem!
        Arraste com o <strong>botão esquerdo</strong> para construir ruas e use o <strong>direito</strong> para apagar.
      </p>
      ${
        rec.bestScore > 0
          ? `<div class="mmw-record">🏆 Seu Recorde: ${rec.bestScore} bananas entregues (${rec.plays} partidas)</div>`
          : ''
      }
      <div class="mmw-cards" id="mmw-map-cards"></div>
      <p class="mmw-sub" style="margin-top:16px;margin-bottom:0;font-size:12px;color:#94a3b8;">
        💡 Dica Co-op: abra <strong>🐒 Co-op Online</strong> no canto superior esquerdo para desenhar estradas com até 4 amigos no mesmo mapa!
      </p>
    `;

    const wrap = this.modalBox.querySelector<HTMLDivElement>('#mmw-map-cards')!;
    for (const m of MAP_LIST) {
      const card = document.createElement('button');
      card.className = 'mmw-card';
      card.innerHTML = `
        <span class="mmw-badge">${m.badge}</span>
        <h3>${m.name}</h3>
        <div style="font-size:12px;font-weight:700;color:#fde047;">${m.subtitle}</div>
        <p>${m.description}</p>
        <div style="margin-top:12px;font-size:12px;font-weight:800;color:#4ade80;">
          Inicial: 🛣️ ${m.startingInventory.roads} • 🌉 ${m.startingInventory.bridges} • 🚦 ${m.startingInventory.lights} • 🔄 ${m.startingInventory.roundabouts}
        </div>
      `;
      card.onclick = () => {
        monkeyAudio.play('banana');
        this.actions.onSelectMap(m.id);
      };
      wrap.appendChild(card);
    }
  }

  showUpgradeModal(options: UpgradeOption[], week: number): void {
    this.modalBackdrop.classList.remove('hidden');
    this.modalBox.innerHTML = `
      <h2>🎉 Domingo da Semana ${week - 1} Concluído!</h2>
      <p class="mmw-sub">Escolha 1 pacote de infraestrutura da Prefeitura Macaca para enfrentar a próxima semana:</p>
      <div class="mmw-cards" id="mmw-upgrade-cards"></div>
    `;
    const wrap = this.modalBox.querySelector<HTMLDivElement>('#mmw-upgrade-cards')!;
    options.forEach((opt, idx) => {
      const card = document.createElement('button');
      card.className = 'mmw-card';
      card.innerHTML = `
        <div style="font-size:34px;margin-bottom:6px;">${opt.emoji}</div>
        <h3>${opt.title}</h3>
        <p style="color:#fde047;font-weight:800;">${opt.subtitle}</p>
      `;
      card.onclick = () => {
        monkeyAudio.play('click');
        this.actions.onPickUpgrade(idx);
      };
      wrap.appendChild(card);
    });
  }

  showGameOver(deliveries: number, reason: string, day: number): void {
    const rec = getGameScore('monkey-motorways');
    this.modalBackdrop.classList.remove('hidden');
    this.modalBox.innerHTML = `
      <h1 style="color:#fb7185;">🚨 CAOS NO TRÂNSITO!</h1>
      <p class="mmw-sub">${reason}</p>
      <div style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:14px 0;">
        <div style="background:#1e293b;padding:12px 20px;border-radius:14px;border:2px solid #facc15;">
          <div style="font-size:12px;color:#94a3b8;">ENTREGAS</div>
          <div style="font-size:28px;font-weight:900;color:#fde047;">🍌 ${deliveries}</div>
        </div>
        <div style="background:#1e293b;padding:12px 20px;border-radius:14px;border:2px solid #38bdf8;">
          <div style="font-size:12px;color:#94a3b8;">SOBREVIVEU</div>
          <div style="font-size:28px;font-weight:900;color:#bae6fd;">${day} Dias</div>
        </div>
        <div style="background:#1e293b;padding:12px 20px;border-radius:14px;border:2px solid #4ade80;">
          <div style="font-size:12px;color:#94a3b8;">RECORDE</div>
          <div style="font-size:28px;font-weight:900;color:#bbf7d0;">🏆 ${Math.max(deliveries, rec.bestScore)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
        <button class="mmw-cta" id="mmw-retry">🔄 Jogar de Novo</button>
        <button class="mmw-cta secondary" id="mmw-change-map">🗺️ Trocar Cidade</button>
      </div>
    `;
    this.modalBox.querySelector<HTMLButtonElement>('#mmw-retry')!.onclick = () => {
      monkeyAudio.play('banana');
      this.actions.onRestart();
    };
    this.modalBox.querySelector<HTMLButtonElement>('#mmw-change-map')!.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onOpenMenu();
    };
  }

  hideModal(): void {
    this.modalBackdrop.classList.add('hidden');
  }
}
