import { getGameScore, monkeyAudio, type PlayerProfile } from '@monkey-slop/sdk';
import { DAYS_PER_WEEK, MONKEY_COLORS, PING_PRESETS, TOOL_META, WEEKDAY_NAMES } from './constants';
import { MAP_LIST } from './maps';
import type { TrafficSimulation } from './simulation';
import type { MapId, PlayerContribution, SimSpeed, ToolKind, UpgradeOption } from './types';

export interface GameUIActions {
  onSelectMap: (mapId: MapId) => void;
  onSelectTool: (tool: ToolKind) => void;
  onSelectPingPreset: (presetIndex: number) => void;
  onSetSpeed: (speed: SimSpeed) => void;
  onUndo: () => void;
  onToggleNight: () => void;
  onOpenMenu: () => void;
  onVoteOrPickUpgrade: (index: number) => void;
  onHostConfirmUpgrade: () => void;
  onRestart: () => void;
  onEnterPhotoMode: () => void;
  onExitPhotoMode: () => void;
  onStartReplay: () => void;
  onDownloadSnapshot: () => void;
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
    .mmw-alert-pill {
      pointer-events: auto;
      background: rgba(185, 28, 28, 0.95);
      color: #ffffff;
      border: 2px solid #fca5a5;
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 900;
      box-shadow: 0 4px 16px rgba(239, 68, 68, 0.45);
      animation: mmwPulse 0.85s ease-in-out infinite alternate;
    }
    @keyframes mmwPulse {
      from { transform: scale(1); }
      to { transform: scale(1.05); }
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
    .mmw-speed-btn:hover, .mmw-icon-btn:hover:not(:disabled) {
      background: #334155;
      transform: translateY(-1px);
    }
    .mmw-icon-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .mmw-speed-btn.active {
      background: #facc15;
      color: #111827;
      border-color: #fef08a;
    }
    .mmw-dock {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 900;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
    }
    .mmw-dock-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
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
    .mmw-ping-bar {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(15, 23, 42, 0.9);
      border: 1.5px solid rgba(56, 189, 248, 0.45);
      border-radius: 999px;
      padding: 4px 8px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    }
    .mmw-ping-chip {
      background: #1e293b;
      color: #e2e8f0;
      border: 1.5px solid #334155;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.1s ease, border-color 0.15s ease;
    }
    .mmw-ping-chip:hover {
      transform: translateY(-1px);
      border-color: #38bdf8;
    }
    .mmw-ping-chip.active {
      background: #0284c7;
      border-color: #bae6fd;
      color: #ffffff;
    }
    .mmw-tool-btn {
      position: relative;
      background: #1e293b;
      color: #f8fafc;
      border: 2px solid #334155;
      border-radius: 12px;
      padding: 6px 11px;
      min-width: 72px;
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
      font-size: 17px;
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
      background: rgba(17, 24, 39, 0.82);
      color: #e2e8f0;
      padding: 3px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .mmw-photo-bar {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 940;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      background: rgba(17, 24, 39, 0.94);
      border: 2px solid #facc15;
      border-radius: 18px;
      padding: 10px 16px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    }
    .mmw-photo-bar.hidden {
      display: none;
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
      padding: 18px;
      overflow-y: auto;
    }
    .mmw-modal-backdrop.hidden {
      display: none;
    }
    .mmw-modal {
      width: min(840px, 100%);
      max-height: 92vh;
      overflow-y: auto;
      background: #111827;
      color: #f8fafc;
      border: 3px solid #facc15;
      border-radius: 22px;
      padding: 22px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      text-align: center;
    }
    .mmw-modal h1, .mmw-modal h2 {
      margin: 0 0 8px;
      color: #fde047;
    }
    .mmw-sub {
      margin: 0 0 14px;
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.45;
    }
    .mmw-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(225px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .mmw-card {
      background: #1e293b;
      border: 2px solid #334155;
      border-radius: 16px;
      padding: 14px;
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
    .mmw-card.voted {
      border-color: #4ade80;
      background: #1b312a;
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
      font-size: 17px;
      color: #ffffff;
    }
    .mmw-card p {
      margin: 6px 0 0;
      font-size: 12.5px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .mmw-vote-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 10px;
      min-height: 22px;
    }
    .mmw-voter-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      background: rgba(15, 23, 42, 0.85);
      border: 1.5px solid currentColor;
    }
    .mmw-stats-list {
      margin: 14px auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
      text-align: left;
    }
    .mmw-stat-card {
      background: #1e293b;
      border: 1.5px solid #334155;
      border-radius: 14px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .mmw-cta {
      margin-top: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #facc15;
      color: #111827;
      border: none;
      border-radius: 12px;
      padding: 10px 18px;
      font-size: 14px;
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
      margin-bottom: 10px;
    }
    @media (max-width: 720px) {
      .mmw-tool-btn { min-width: 54px; padding: 6px 7px; }
      .mmw-hint { display: none; }
    }
  `;
  document.head.appendChild(style);
}

function computePlayerMedal(stat: PlayerContribution, all: PlayerContribution[]): string {
  const maxRoundabouts = Math.max(0, ...all.map((s) => s.roundaboutsBuilt));
  const maxBridges = Math.max(0, ...all.map((s) => s.bridgesBuilt));
  const maxMotorways = Math.max(0, ...all.map((s) => s.motorwaysBuilt));
  const maxLights = Math.max(0, ...all.map((s) => s.lightsBuilt));
  const maxErased = Math.max(0, ...all.map((s) => s.erasedCount));
  const maxRoads = Math.max(0, ...all.map((s) => s.roadsBuilt));

  if (stat.roundaboutsBuilt >= 2 && stat.roundaboutsBuilt === maxRoundabouts) {
    return '🌀 Rei da Rotatória';
  }
  if (stat.bridgesBuilt >= 2 && stat.bridgesBuilt === maxBridges) {
    return '🌉 Mestre das Pontes';
  }
  if (stat.motorwaysBuilt >= 1 && stat.motorwaysBuilt === maxMotorways) {
    return '🌿 Tarzan do Cipó';
  }
  if (stat.lightsBuilt >= 2 && stat.lightsBuilt === maxLights) {
    return '🚦 Chefe do Farol';
  }
  if (stat.erasedCount >= 6 && stat.erasedCount === maxErased) {
    return '💥 Arquiteto do Caos';
  }
  if (stat.roadsBuilt >= 15 && stat.roadsBuilt === maxRoads) {
    return '🛣️ Engenheiro da CET';
  }
  if (stat.pingsSent >= 3) {
    return '📢 Fiscal de Obra';
  }
  if (stat.roadsBuilt > 0) {
    return '🐒 Despachante Símio';
  }
  return '🍌 Ajudante de Placa';
}

export class GameUI {
  private topRight: HTMLDivElement;
  private alertPill: HTMLDivElement;
  private scoreEl: HTMLSpanElement;
  private dayEl: HTMLSpanElement;
  private clockFill: HTMLDivElement;
  private speedBtns: Map<SimSpeed, HTMLButtonElement> = new Map();
  private undoBtn: HTMLButtonElement;
  private nightBtn: HTMLButtonElement;

  private dock: HTMLDivElement;
  private toolBtns: Map<ToolKind, HTMLButtonElement> = new Map();
  private toolCounts: Map<ToolKind, HTMLSpanElement> = new Map();
  private pingPresetBtns: HTMLButtonElement[] = [];
  private hintEl: HTMLDivElement;

  private photoBar: HTMLDivElement;
  private replayBtn: HTMLButtonElement;

  private modalBackdrop: HTMLDivElement;
  private modalBox: HTMLDivElement;

  private actions: GameUIActions;
  private activePingPreset = 0;
  private currentModalKind: 'none' | 'menu' | 'upgrade' | 'gameover' = 'none';

  constructor(actions: GameUIActions) {
    this.actions = actions;
    injectStyles();

    this.topRight = document.createElement('div');
    this.topRight.className = 'mmw-top-right';

    this.alertPill = document.createElement('div');
    this.alertPill.className = 'mmw-alert-pill';
    this.alertPill.style.display = 'none';

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

    this.undoBtn = document.createElement('button');
    this.undoBtn.className = 'mmw-icon-btn';
    this.undoBtn.textContent = '↩️ Desfazer';
    this.undoBtn.title = 'Desfazer último traçado (Ctrl+Z)';
    this.undoBtn.disabled = true;
    this.undoBtn.onclick = () => {
      this.actions.onUndo();
    };
    speedPill.appendChild(this.undoBtn);

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
    menuBtn.title = 'Escolher Cidade / Menu';
    menuBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onOpenMenu();
    };
    speedPill.appendChild(menuBtn);

    this.topRight.append(this.alertPill, scorePill, speedPill);
    document.body.appendChild(this.topRight);

    // Bottom Tool Dock
    this.dock = document.createElement('div');
    this.dock.className = 'mmw-dock';

    // Quick Ping Presets Row
    const pingBar = document.createElement('div');
    pingBar.className = 'mmw-ping-bar';
    const pingTitle = document.createElement('span');
    pingTitle.style.cssText = 'font-size:11px;font-weight:800;color:#7dd3fc;padding:0 4px;';
    pingTitle.textContent = '📣 Ping (P):';
    pingBar.appendChild(pingTitle);

    PING_PRESETS.forEach((preset, idx) => {
      const chip = document.createElement('button');
      chip.className = 'mmw-ping-chip' + (idx === 0 ? ' active' : '');
      chip.textContent = `${preset.emoji} ${preset.short}`;
      chip.title = `Selecionar ping "${preset.text}" (aperte P no mapa ou clique no mapa com ferramenta Pingar)`;
      chip.onclick = () => {
        monkeyAudio.play('click');
        this.setActivePingPreset(idx);
        this.actions.onSelectPingPreset(idx);
      };
      this.pingPresetBtns.push(chip);
      pingBar.appendChild(chip);
    });

    const dockBar = document.createElement('div');
    dockBar.className = 'mmw-dock-bar';

    const tools: ToolKind[] = ['road', 'light', 'roundabout', 'motorway', 'erase', 'ping'];
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

    this.dock.append(this.hintEl, pingBar, dockBar);
    document.body.appendChild(this.dock);

    // Photo & Replay Bar (shown only when inspecting map after Game Over)
    this.photoBar = document.createElement('div');
    this.photoBar.className = 'mmw-photo-bar hidden';
    this.photoBar.innerHTML = `<span style="color:#fde047;font-weight:900;font-size:13px;">📸 Modo Foto & Replay</span>`;

    this.replayBtn = document.createElement('button');
    this.replayBtn.className = 'mmw-speed-btn active';
    this.replayBtn.textContent = '⏩ Replay Rápido';
    this.replayBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onStartReplay();
    };

    const snapBtn = document.createElement('button');
    snapBtn.className = 'mmw-speed-btn';
    snapBtn.textContent = '💾 Baixar PNG';
    snapBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onDownloadSnapshot();
    };

    const photoNightBtn = document.createElement('button');
    photoNightBtn.className = 'mmw-speed-btn';
    photoNightBtn.textContent = '🌓 Dia / Noite';
    photoNightBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onToggleNight();
    };

    const backBtn = document.createElement('button');
    backBtn.className = 'mmw-speed-btn';
    backBtn.textContent = '🔙 Voltar ao Placar';
    backBtn.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onExitPhotoMode();
    };

    this.photoBar.append(this.replayBtn, snapBtn, photoNightBtn, backBtn);
    document.body.appendChild(this.photoBar);

    // Modal overlay
    this.modalBackdrop = document.createElement('div');
    this.modalBackdrop.className = 'mmw-modal-backdrop';
    this.modalBox = document.createElement('div');
    this.modalBox.className = 'mmw-modal';
    this.modalBackdrop.appendChild(this.modalBox);
    document.body.appendChild(this.modalBackdrop);
  }

  setNightMode(night: boolean): void {
    this.nightBtn.textContent = night ? '🌙 Noite' : '☀️ Dia';
  }

  setUndoAvailable(count: number): void {
    this.undoBtn.disabled = count <= 0;
    this.undoBtn.textContent = count > 0 ? `↩️ Desfazer (${count})` : '↩️ Desfazer';
  }

  setActivePingPreset(index: number): void {
    this.activePingPreset = index;
    this.pingPresetBtns.forEach((b, i) => b.classList.toggle('active', i === index));
  }

  getActivePingPreset(): (typeof PING_PRESETS)[number] {
    return PING_PRESETS[this.activePingPreset] ?? PING_PRESETS[0];
  }

  setActiveTool(tool: ToolKind): void {
    for (const [k, btn] of this.toolBtns) {
      btn.classList.toggle('active', k === tool);
    }
    this.hintEl.textContent = TOOL_META[tool].desc;
  }

  update(sim: TrafficSimulation, photoMode = false): void {
    this.scoreEl.textContent = `🍌 ${sim.deliveries}`;
    const weekday = WEEKDAY_NAMES[(sim.day - 1) % DAYS_PER_WEEK];
    this.dayEl.textContent = `Sem ${sim.week} • ${weekday} (D${sim.day})`;

    const deg = Math.floor(sim.dayProgress * 360);
    this.clockFill.style.background = `conic-gradient(#facc15 ${deg}deg, transparent ${deg}deg)`;

    for (const [s, btn] of this.speedBtns) {
      btn.classList.toggle('active', sim.speed === s);
    }

    // Critical Market Alert Pill
    const worst = sim.markets.reduce<typeof sim.markets[0] | null>(
      (acc, m) => (!acc || m.overload > acc.overload ? m : acc),
      null,
    );
    if (sim.phase === 'playing' && worst && worst.overload >= 0.5) {
      const theme = MONKEY_COLORS[worst.color];
      const pct = Math.min(99, Math.round(worst.overload * 100));
      this.alertPill.style.display = 'inline-flex';
      this.alertPill.textContent = `🚨 ${theme.fruitEmoji} ${worst.name}: ${pct}%`;
    } else {
      this.alertPill.style.display = 'none';
    }

    this.toolCounts.get('road')!.textContent = `${sim.inventory.roads} • 🌉${sim.inventory.bridges}`;
    this.toolCounts.get('light')!.textContent = `${sim.inventory.lights}`;
    this.toolCounts.get('roundabout')!.textContent = `${sim.inventory.roundabouts}`;
    this.toolCounts.get('motorway')!.textContent = `${sim.inventory.motorways}`;
    this.toolCounts.get('erase')!.textContent = 'Dir.';
    this.toolCounts.get('ping')!.textContent = PING_PRESETS[this.activePingPreset].emoji;

    this.dock.style.display = sim.phase === 'menu' || photoMode ? 'none' : 'flex';
    this.photoBar.classList.toggle('hidden', !photoMode);
  }

  showMenu(canResume = false, onResume?: () => void): void {
    this.currentModalKind = 'menu';
    const rec = getGameScore('monkey-motorways');
    this.modalBackdrop.classList.remove('hidden');
    this.modalBox.innerHTML = `
      <h1>🛣️ Mini Macacoways</h1>
      <p class="mmw-sub">
        Ligue as casinhas aos mercados da mesma cor & fruta antes que os pedidos transbordem!
        Arraste com o <strong>botão esquerdo</strong> para pré-visualizar a rota e solte para construir. Use <strong>Ctrl+Z</strong> para desfazer!
      </p>
      ${
        rec.bestScore > 0
          ? `<div class="mmw-record">🏆 Seu Recorde: ${rec.bestScore} bananas entregues (${rec.plays} partidas)</div>`
          : ''
      }
      ${
        canResume
          ? `<div style="margin-bottom:10px;"><button class="mmw-cta secondary" id="mmw-resume-btn">▶️ Voltar à Partida Atual</button></div>`
          : ''
      }
      <div class="mmw-cards" id="mmw-map-cards"></div>
      <p class="mmw-sub" style="margin-top:14px;margin-bottom:0;font-size:12px;color:#94a3b8;">
        💡 Dica Co-op: abra <strong>🐒 Co-op Online</strong> no canto superior esquerdo para construir, votar nos upgrades e enviar Pings (<strong>P</strong>) com até 4 amigos!
      </p>
    `;

    if (canResume && onResume) {
      this.modalBox.querySelector<HTMLButtonElement>('#mmw-resume-btn')!.onclick = () => {
        monkeyAudio.play('click');
        onResume();
      };
    }

    const wrap = this.modalBox.querySelector<HTMLDivElement>('#mmw-map-cards')!;
    for (const m of MAP_LIST) {
      const card = document.createElement('button');
      card.className = 'mmw-card';
      const mwTxt = m.startingInventory.motorways > 0 ? ` • 🌿 ${m.startingInventory.motorways}` : '';
      card.innerHTML = `
        <span class="mmw-badge">${m.badge}</span>
        <h3>${m.name}</h3>
        <div style="font-size:12px;font-weight:700;color:#fde047;">${m.subtitle}</div>
        <p>${m.description}</p>
        <div style="margin-top:10px;font-size:12px;font-weight:800;color:#4ade80;">
          Inicial: 🛣️ ${m.startingInventory.roads} • 🌉 ${m.startingInventory.bridges} • 🚦 ${m.startingInventory.lights} • 🔄 ${m.startingInventory.roundabouts}${mwTxt}
        </div>
      `;
      card.onclick = () => {
        monkeyAudio.play('banana');
        this.actions.onSelectMap(m.id);
      };
      wrap.appendChild(card);
    }
  }

  showUpgradeModal(
    options: UpgradeOption[],
    sim: TrafficSimulation,
    players: PlayerProfile[],
    localPlayerId: string,
    isHost: boolean,
  ): void {
    this.currentModalKind = 'upgrade';
    const isCoop = players.length > 1;
    const inv = sim.inventory;
    this.modalBackdrop.classList.remove('hidden');
    this.modalBox.innerHTML = `
      <h2>🎉 Domingo da Semana ${sim.week - 1} Concluído!</h2>
      <p class="mmw-sub">
        ${
          isCoop
            ? 'Votação Co-op da Prefeitura Macaca! Todos os jogadores podem votar em 1 pacote — consenso aplica na hora:'
            : 'Escolha 1 pacote de infraestrutura da Prefeitura Macaca para enfrentar a próxima semana:'
        }
      </p>
      <div style="display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center;background:#1e293b;border:1.5px solid #334155;border-radius:999px;padding:5px 14px;font-size:12px;font-weight:800;color:#e2e8f0;margin-bottom:6px;">
        <span>Estoque atual:</span>
        <span>🛣️ ${inv.roads}</span>
        <span>🌉 ${inv.bridges}</span>
        <span>🚦 ${inv.lights}</span>
        <span>🔄 ${inv.roundabouts}</span>
        <span>🌿 ${inv.motorways}</span>
      </div>
      <div class="mmw-cards" id="mmw-upgrade-cards"></div>
      <div id="mmw-upgrade-footer" style="margin-top:14px;"></div>
    `;

    this.renderUpgradeCards(options, sim, players, localPlayerId, isHost);
  }

  refreshUpgradeVotes(
    options: UpgradeOption[],
    sim: TrafficSimulation,
    players: PlayerProfile[],
    localPlayerId: string,
    isHost: boolean,
  ): void {
    if (this.currentModalKind !== 'upgrade') return;
    this.renderUpgradeCards(options, sim, players, localPlayerId, isHost);
  }

  private renderUpgradeCards(
    options: UpgradeOption[],
    sim: TrafficSimulation,
    players: PlayerProfile[],
    localPlayerId: string,
    isHost: boolean,
  ): void {
    const wrap = this.modalBox.querySelector<HTMLDivElement>('#mmw-upgrade-cards');
    const footer = this.modalBox.querySelector<HTMLDivElement>('#mmw-upgrade-footer');
    if (!wrap || !footer) return;

    const isCoop = players.length > 1;
    wrap.innerHTML = '';

    options.forEach((opt, idx) => {
      const myVote = sim.upgradeVotes[localPlayerId] === idx;
      const voters = players.filter((p) => sim.upgradeVotes[p.id] === idx);

      const card = document.createElement('button');
      card.className = 'mmw-card' + (myVote ? ' voted' : '');
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:32px;">${opt.emoji}</span>
          ${
            isCoop
              ? `<span class="mmw-badge" style="margin:0;">${voters.length} ${voters.length === 1 ? 'voto' : 'votos'}</span>`
              : ''
          }
        </div>
        <h3 style="margin-top:6px;">${opt.title}</h3>
        <div style="color:#fde047;font-weight:900;font-size:13px;margin-bottom:6px;">${opt.subtitle}</div>
        <p style="color:#cbd5e1;font-size:12px;background:rgba(15,23,42,0.55);padding:8px 10px;border-radius:10px;margin:0;">
          ${opt.description}
        </p>
        ${
          isCoop
            ? `<div class="mmw-vote-row">${
                voters.length > 0
                  ? voters
                      .map(
                        (v) =>
                          `<span class="mmw-voter-chip" style="color:${v.color};">🐒 ${
                            v.id === localPlayerId ? 'Você' : v.name
                          }</span>`,
                      )
                      .join('')
                  : `<span style="font-size:11px;color:#64748b;">Clique para indicar seu voto</span>`
              }</div>`
            : ''
        }
      `;
      card.onclick = () => {
        monkeyAudio.play('click');
        this.actions.onVoteOrPickUpgrade(idx);
      };
      wrap.appendChild(card);
    });

    footer.innerHTML = '';
    if (isCoop) {
      if (isHost) {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'mmw-cta';
        confirmBtn.textContent = '✅ Aplicar Escolha Agora (Mais Votado)';
        confirmBtn.onclick = () => {
          monkeyAudio.play('click');
          this.actions.onHostConfirmUpgrade();
        };
        footer.appendChild(confirmBtn);
      } else {
        const note = document.createElement('div');
        note.style.cssText = 'font-size:12px;color:#94a3b8;font-weight:700;';
        note.textContent = 'Aguardando todos votarem ou o Host confirmar o pacote...';
        footer.appendChild(note);
      }
    }
  }

  showGameOver(sim: TrafficSimulation, reason: string): void {
    this.currentModalKind = 'gameover';
    const rec = getGameScore('monkey-motorways');
    const allStats = Object.values(sim.playerStats);

    this.modalBackdrop.classList.remove('hidden');
    this.modalBox.innerHTML = `
      <h1 style="color:#fb7185;">🚨 CAOS NO TRÂNSITO!</h1>
      <p class="mmw-sub">${reason}</p>
      <div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin:12px 0;">
        <div style="background:#1e293b;padding:10px 18px;border-radius:14px;border:2px solid #facc15;">
          <div style="font-size:11px;color:#94a3b8;">ENTREGAS</div>
          <div style="font-size:26px;font-weight:900;color:#fde047;">🍌 ${sim.deliveries}</div>
        </div>
        <div style="background:#1e293b;padding:10px 18px;border-radius:14px;border:2px solid #38bdf8;">
          <div style="font-size:11px;color:#94a3b8;">SOBREVIVEU</div>
          <div style="font-size:26px;font-weight:900;color:#bae6fd;">${sim.day} Dias</div>
        </div>
        <div style="background:#1e293b;padding:10px 18px;border-radius:14px;border:2px solid #4ade80;">
          <div style="font-size:11px;color:#94a3b8;">RECORDE</div>
          <div style="font-size:26px;font-weight:900;color:#bbf7d0;">🏆 ${Math.max(sim.deliveries, rec.bestScore)}</div>
        </div>
      </div>
      ${
        allStats.length > 0
          ? `<div style="margin-top:10px;">
              <div style="font-size:12px;font-weight:800;color:#fde047;margin-bottom:6px;">🏅 DESEMPENHO DA EQUIPE</div>
              <div class="mmw-stats-list">
                ${allStats
                  .map((st) => {
                    const medal = computePlayerMedal(st, allStats);
                    const specials = st.lightsBuilt + st.roundaboutsBuilt + st.motorwaysBuilt;
                    return `
                      <div class="mmw-stat-card" style="border-color:${st.color};">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                          <span style="font-weight:900;color:${st.color};font-size:14px;">🐒 ${st.name}</span>
                          <span class="mmw-badge" style="margin:0;">${medal}</span>
                        </div>
                        <div style="font-size:12px;color:#cbd5e1;">
                          🛣️ ${st.roadsBuilt} estradas • 🌉 ${st.bridgesBuilt} pontes • ⚙️ ${specials} especiais
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>`
          : ''
      }
      <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:8px;">
        <button class="mmw-cta" id="mmw-retry">🔄 Jogar de Novo</button>
        <button class="mmw-cta secondary" id="mmw-photo-mode">📸 Modo Foto & Replay</button>
        <button class="mmw-cta secondary" id="mmw-change-map">🗺️ Trocar Cidade</button>
      </div>
    `;

    this.modalBox.querySelector<HTMLButtonElement>('#mmw-retry')!.onclick = () => {
      monkeyAudio.play('banana');
      this.actions.onRestart();
    };
    this.modalBox.querySelector<HTMLButtonElement>('#mmw-photo-mode')!.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onEnterPhotoMode();
    };
    this.modalBox.querySelector<HTMLButtonElement>('#mmw-change-map')!.onclick = () => {
      monkeyAudio.play('click');
      this.actions.onOpenMenu();
    };
  }

  setReplayButtonActive(active: boolean): void {
    this.replayBtn.textContent = active ? '⏹️ Ver Mapa Final' : '⏩ Replay Rápido';
  }

  hideModal(): void {
    this.currentModalKind = 'none';
    this.modalBackdrop.classList.add('hidden');
  }
}
