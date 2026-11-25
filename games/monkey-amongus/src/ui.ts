import { sfx } from './audio';
import { SECURITY_CAMERAS, VENTS } from './map';
import { drawMonkeyAvatar } from './renderer';
import type {
  ActiveSabotage,
  ChatMessage,
  EjectionState,
  GameOverState,
  GamePhase,
  HatId,
  LobbySettings,
  MeetingState,
  PlayerState,
  PreferredRole,
  SabotageKind,
} from './types';
import { HATS, MONKEY_SUIT_COLORS } from './types';

export interface UiActionHandlers {
  onUpdatePrefs: (name: string, colorId: string, hat: HatId) => void;
  onUpdateSettings: (patch: Partial<LobbySettings>) => void;
  onStartMatch: () => void;
  onUse: () => void;
  onReport: () => void;
  onKill: () => void;
  onVent: () => void;
  onJumpVent: (ventId: string) => void;
  onSabotage: (kind: SabotageKind) => void;
  onToggleMinimap: () => void;
  onSelectCam: (index: number) => void;
  onExitCam: () => void;
  onSendChat: (text: string) => void;
  onCastVote: (targetId: string) => void;
  onPlayAgain: () => void;
}

export interface ActionAvailability {
  useLabel: string | null;
  canReport: boolean;
  canKill: boolean;
  killCooldown: number;
  canVent: boolean;
  inVent: string | null;
  canSabotage: boolean;
  sabotageCooldown: number;
}

export class GameUI {
  private handlers: UiActionHandlers;

  private hudRoot: HTMLDivElement;
  private topLeftStatus: HTMLDivElement;
  private topRightInfo: HTMLDivElement;
  private lobbyPanel: HTMLDivElement;
  private actionBar: HTMLDivElement;
  private sabotagePicker: HTMLDivElement;
  private camBar: HTMLDivElement;
  private ventBar: HTMLDivElement;
  private centerBanner: HTMLDivElement;

  private revealOverlay: HTMLDivElement;
  private meetingOverlay: HTMLDivElement;
  private ejectOverlay: HTMLDivElement;
  private gameoverOverlay: HTMLDivElement;
  private ghostChatPanel: HTMLDivElement;

  private selectedVoteTarget: string | null = null;
  private sabotageMenuOpen = false;
  private ghostChatOpen = false;
  private lastChatCount = 0;
  private lastMeetingKey = '';
  private lastTopRightKey = '';
  private lastTopLeftKey = '';
  private lastLobbyKey = '';
  private lastActionKey = '';
  private lastSabPickerKey = '';
  private lastCamKey = '';
  private lastVentKey = '';
  private lastRevealKey = '';
  private lastGameOverKey = '';

  constructor(handlers: UiActionHandlers) {
    this.handlers = handlers;

    this.hudRoot = document.createElement('div');
    this.hudRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;';
    document.body.appendChild(this.hudRoot);

    this.topLeftStatus = document.createElement('div');
    this.topLeftStatus.style.cssText =
      'position:fixed;top:54px;left:12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:290px;';
    this.hudRoot.appendChild(this.topLeftStatus);

    this.topRightInfo = document.createElement('div');
    this.topRightInfo.style.cssText =
      'position:fixed;top:10px;right:12px;display:flex;align-items:center;gap:8px;pointer-events:auto;flex-wrap:wrap;justify-content:flex-end;';
    this.hudRoot.appendChild(this.topRightInfo);

    this.lobbyPanel = document.createElement('div');
    this.lobbyPanel.style.cssText =
      'position:fixed;right:14px;top:56px;width:330px;max-width:calc(100vw - 28px);max-height:calc(100vh - 76px);overflow-y:auto;background:rgba(15,23,42,0.94);border:2px solid #facc15;border-radius:16px;padding:14px;pointer-events:auto;box-shadow:0 16px 40px rgba(0,0,0,0.6);display:none;';
    this.hudRoot.appendChild(this.lobbyPanel);

    this.actionBar = document.createElement('div');
    this.actionBar.style.cssText =
      'position:fixed;right:14px;bottom:14px;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;max-width:340px;pointer-events:auto;';
    this.hudRoot.appendChild(this.actionBar);

    this.sabotagePicker = document.createElement('div');
    this.sabotagePicker.style.cssText =
      'position:fixed;right:14px;bottom:74px;background:rgba(15,23,42,0.96);border:2px solid #ef4444;border-radius:14px;padding:10px;display:none;flex-direction:column;gap:8px;pointer-events:auto;';
    this.hudRoot.appendChild(this.sabotagePicker);

    this.camBar = document.createElement('div');
    this.camBar.style.cssText =
      'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.94);border:2px solid #38bdf8;border-radius:14px;padding:8px 12px;display:none;gap:8px;align-items:center;pointer-events:auto;';
    this.hudRoot.appendChild(this.camBar);

    this.ventBar = document.createElement('div');
    this.ventBar.style.cssText =
      'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.94);border:2px solid #ef4444;border-radius:14px;padding:8px 12px;display:none;gap:8px;align-items:center;pointer-events:auto;';
    this.hudRoot.appendChild(this.ventBar);

    this.centerBanner = document.createElement('div');
    this.centerBanner.style.cssText =
      'position:fixed;top:64px;left:50%;transform:translateX(-50%);pointer-events:none;text-align:center;';
    this.hudRoot.appendChild(this.centerBanner);

    this.ghostChatPanel = document.createElement('div');
    this.ghostChatPanel.style.cssText =
      'position:fixed;left:12px;bottom:14px;width:290px;background:rgba(15,23,42,0.94);border:2px solid #94a3b8;border-radius:14px;padding:10px;display:none;flex-direction:column;gap:6px;pointer-events:auto;';
    this.hudRoot.appendChild(this.ghostChatPanel);

    this.revealOverlay = this.createOverlay(520);
    this.meetingOverlay = this.createOverlay(540);
    this.ejectOverlay = this.createOverlay(560);
    this.gameoverOverlay = this.createOverlay(580);
  }

  private createOverlay(zIndex: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'ma-overlay';
    el.style.zIndex = `${zIndex}`;
    document.body.appendChild(el);
    return el;
  }

  toggleSabotageMenu(): void {
    this.sabotageMenuOpen = !this.sabotageMenuOpen;
  }

  closeSabotageMenu(): void {
    this.sabotageMenuOpen = false;
  }

  sync(params: {
    phase: GamePhase;
    players: PlayerState[];
    local: PlayerState;
    settings: LobbySettings;
    roomName: string;
    taskProgress: number; // 0..1
    sabotage: ActiveSabotage | null;
    avail: ActionAvailability;
    camIndex: number;
    showMinimap: boolean;
    meeting: MeetingState | null;
    chats: ChatMessage[];
    ejection: EjectionState | null;
    gameOver: GameOverState | null;
    revealTimer: number;
  }): void {
    const {
      phase,
      players,
      local,
      settings,
      roomName,
      taskProgress,
      sabotage,
      avail,
      camIndex,
      showMinimap,
      meeting,
      chats,
      ejection,
      gameOver,
      revealTimer,
    } = params;

    // Top-right info pill
    const roleText =
      phase === 'lobby'
        ? '🛸 Lobby'
        : !local.alive
          ? '👻 Fantasma'
          : local.role === 'impostor'
            ? '😈 Impostor'
            : '🍌 Tripulante';
    const roleColor =
      phase === 'lobby'
        ? '#facc15'
        : !local.alive
          ? '#94a3b8'
          : local.role === 'impostor'
            ? '#f87171'
            : '#4ade80';

    const topRightKey = `${roomName}|${roleText}|${roleColor}|${showMinimap}`;
    if (topRightKey !== this.lastTopRightKey) {
      this.lastTopRightKey = topRightKey;
      this.topRightInfo.innerHTML = `
        <div style="background:rgba(15,23,42,0.9);border:2px solid #334155;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;">
          📍 ${roomName}
        </div>
        <div style="background:rgba(15,23,42,0.9);border:2px solid ${roleColor};color:${roleColor};border-radius:999px;padding:6px 12px;font-size:12px;font-weight:900;">
          ${roleText}
        </div>
        <button class="ma-btn" id="ma-map-btn" style="border-radius:999px;padding:6px 12px;font-size:12px;border-color:${showMinimap ? '#38bdf8' : '#475569'};">
          🗺️ Mapa (M)
        </button>
      `;
      const mapBtn = this.topRightInfo.querySelector<HTMLButtonElement>('#ma-map-btn');
      if (mapBtn) mapBtn.onclick = () => this.handlers.onToggleMinimap();
    }

    // Top-left task bar & sabotage alert
    if (phase === 'playing') {
      const pct = Math.round(taskProgress * 100);
      const myTasks = local.tasksAssigned.length;
      const myDone = local.tasksDone.length;
      const sabTimerCeil = sabotage?.kind === 'reactor' ? Math.ceil(sabotage.timer) : 0;
      const topLeftKey = `${pct}|${myDone}/${myTasks}|${local.role}|${sabotage?.kind || 'none'}|${sabTimerCeil}`;
      if (topLeftKey !== this.lastTopLeftKey) {
        this.lastTopLeftKey = topLeftKey;
        const sabHtml = sabotage
          ? `<div style="background:rgba(127,29,29,0.94);border:2px solid #ef4444;border-radius:12px;padding:8px 10px;font-size:12px;font-weight:900;color:#fecaca;">
              ${
                sabotage.kind === 'lights'
                  ? '💡 LUZES SABOTADAS! Religar na Elétrica!'
                  : `☢️ DERRETIMENTO DO REATOR: ${sabTimerCeil}s! Vá ao Reator!`
              }
            </div>`
          : '';

        this.topLeftStatus.innerHTML = `
          <div style="background:rgba(15,23,42,0.9);border:2px solid #22c55e;border-radius:12px;padding:8px 10px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:900;color:#86efac;margin-bottom:4px;">
              <span>🍌 TAREFAS DA TRIPULAÇÃO</span>
              <span>${pct}%</span>
            </div>
            <div style="height:10px;background:#020617;border-radius:999px;overflow:hidden;border:1px solid #166534;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#22c55e,#facc15);transition:width 0.25s;"></div>
            </div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">
              ${local.role === 'crew' ? `Suas tarefas: ${myDone}/${myTasks}` : 'Você é Impostor — finja tarefas e sabote!'}
            </div>
          </div>
          ${sabHtml}
        `;
      }
    } else if (this.lastTopLeftKey !== '') {
      this.lastTopLeftKey = '';
      this.topLeftStatus.innerHTML = '';
    }

    // Lobby Panel
    if (phase === 'lobby') {
      this.renderLobby(players, local, settings);
    } else {
      this.lobbyPanel.style.display = 'none';
      this.lastLobbyKey = '';
    }

    // Playing Action Bar
    if (phase === 'playing') {
      this.renderActionBar(local, avail, sabotage);
      this.renderCamBar(camIndex);
      this.renderVentBar(local);
      this.renderGhostChat(local, chats);
    } else {
      if (this.lastActionKey !== '') {
        this.lastActionKey = '';
        this.actionBar.innerHTML = '';
      }
      this.sabotagePicker.style.display = 'none';
      this.lastSabPickerKey = '';
      this.camBar.style.display = 'none';
      this.lastCamKey = '';
      this.ventBar.style.display = 'none';
      this.lastVentKey = '';
      this.ghostChatPanel.style.display = 'none';
    }

    // Role Reveal
    if (phase === 'reveal') {
      this.renderReveal(local, players, revealTimer);
    } else {
      this.revealOverlay.classList.remove('open');
      this.lastRevealKey = '';
    }

    // Meeting
    if (phase === 'meeting' && meeting) {
      this.renderMeeting(meeting, players, local, chats);
    } else {
      this.meetingOverlay.classList.remove('open');
      this.selectedVoteTarget = null;
      this.lastMeetingKey = '';
    }

    // Ejection
    if (phase === 'ejecting' && ejection) {
      this.renderEjection(ejection);
    } else {
      this.ejectOverlay.classList.remove('open');
    }

    // Game Over
    if (phase === 'gameover' && gameOver) {
      this.renderGameOver(gameOver, local);
    } else {
      this.gameoverOverlay.classList.remove('open');
      this.lastGameOverKey = '';
    }
  }

  private renderLobby(
    players: PlayerState[],
    local: PlayerState,
    settings: LobbySettings,
  ): void {
    this.lobbyPanel.style.display = 'block';
    const isFocusedInput =
      document.activeElement &&
      this.lobbyPanel.contains(document.activeElement) &&
      (document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'SELECT');
    if (isFocusedInput) return;

    const lobbyKey = `${local.name}|${local.color.id}|${local.hat}|${local.isHost}|${settings.botFillCount}|${settings.impostorCount}|${settings.killCooldown}|${settings.preferredRole}|${players.map((p) => `${p.id}:${p.name}:${p.color.id}:${p.isHost}:${p.isBot}`).join(',')}`;
    if (lobbyKey === this.lastLobbyKey) return;
    this.lastLobbyKey = lobbyKey;

    const colorSwatches = MONKEY_SUIT_COLORS.map(
      (c) => `
      <button data-color="${c.id}" title="${c.name}" style="width:24px;height:24px;border-radius:999px;background:${c.body};border:${local.color.id === c.id ? '3px solid #fff' : '2px solid #0f172a'};cursor:pointer;"></button>
    `,
    ).join('');

    const hatBtns = HATS.map(
      (h) => `
      <button class="ma-btn" data-hat="${h.id}" style="padding:5px 8px;font-size:12px;border-color:${local.hat === h.id ? '#facc15' : '#334155'};">${h.emoji}</button>
    `,
    ).join('');

    const playerChips = players
      .map(
        (p) => `
      <div style="display:flex;align-items:center;gap:6px;background:#1e293b;padding:4px 8px;border-radius:10px;border:1px solid ${p.color.body};font-size:11px;font-weight:700;">
        <span style="width:10px;height:10px;border-radius:999px;background:${p.color.body};"></span>
        <span>${p.isHost ? '👑 ' : ''}${this.esc(p.name)}</span>
        ${p.isBot ? '<span style="color:#94a3b8;font-size:10px;">(BOT)</span>' : ''}
      </div>
    `,
      )
      .join('');

    const dis = local.isHost ? '' : 'disabled';

    this.lobbyPanel.innerHTML = `
      <div style="font-size:16px;font-weight:900;color:#facc15;margin-bottom:4px;">🚀 NAVE BANANA-1 · LOBBY</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">Ajuste seu macaco e explore o Refeitório! · 🎮 Controles: <b>F1</b></div>

      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:800;color:#cbd5e1;margin-bottom:4px;">Seu Apelido & Traje</div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input id="ma-lobby-name" class="ma-input" style="flex:1;min-width:0;" maxlength="18" value="${this.esc(local.name)}" />
          <button id="ma-lobby-name-ok" class="ma-btn" style="padding:6px 10px;">OK</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">${colorSwatches}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${hatBtns}</div>
      </div>

      <div style="border-top:1px solid #334155;padding-top:10px;margin-bottom:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;">
        <label style="display:flex;flex-direction:column;gap:3px;">
          <span style="color:#94a3b8;font-weight:700;">Total Macacos (c/ Bots)</span>
          <select id="ma-set-bots" class="ma-input" style="padding:5px;" ${dis}>
            ${[4, 6, 8, 10].map((n) => `<option value="${n}" ${settings.botFillCount === n ? 'selected' : ''}>${n} macacos</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;">
          <span style="color:#94a3b8;font-weight:700;">Impostores</span>
          <select id="ma-set-imp" class="ma-input" style="padding:5px;" ${dis}>
            <option value="1" ${settings.impostorCount === 1 ? 'selected' : ''}>1 Impostor</option>
            <option value="2" ${settings.impostorCount === 2 ? 'selected' : ''}>2 Impostores</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;">
          <span style="color:#94a3b8;font-weight:700;">Cooldown Kill</span>
          <select id="ma-set-cd" class="ma-input" style="padding:5px;" ${dis}>
            ${[15, 20, 25, 30].map((s) => `<option value="${s}" ${settings.killCooldown === s ? 'selected' : ''}>${s}s</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;">
          <span style="color:#94a3b8;font-weight:700;">Seu Papel (Host)</span>
          <select id="ma-set-role" class="ma-input" style="padding:5px;" ${dis}>
            <option value="random" ${settings.preferredRole === 'random' ? 'selected' : ''}>Aleatório</option>
            <option value="crew" ${settings.preferredRole === 'crew' ? 'selected' : ''}>Tripulante</option>
            <option value="impostor" ${settings.preferredRole === 'impostor' ? 'selected' : ''}>Impostor</option>
          </select>
        </label>
      </div>

      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:800;color:#cbd5e1;margin-bottom:5px;">Na Nave (${players.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${playerChips}</div>
      </div>

      ${
        local.isHost
          ? `<button id="ma-start-btn" class="ma-btn primary" style="width:100%;font-size:15px;padding:11px;">🚀 INICIAR PARTIDA!</button>`
          : `<div style="text-align:center;font-size:12px;color:#fde047;font-weight:800;padding:8px;background:#1e293b;border-radius:10px;">⏳ Aguardando Host iniciar...</div>`
      }
    `;

    const nameInput = this.lobbyPanel.querySelector<HTMLInputElement>('#ma-lobby-name')!;
    const nameOk = this.lobbyPanel.querySelector<HTMLButtonElement>('#ma-lobby-name-ok')!;
    const applyName = () => {
      const clean = nameInput.value.trim();
      if (clean) this.handlers.onUpdatePrefs(clean, local.color.id, local.hat);
    };
    nameOk.onclick = applyName;
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') applyName();
    };

    this.lobbyPanel.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
      btn.onclick = () => {
        sfx.playClick();
        this.handlers.onUpdatePrefs(local.name, btn.dataset.color!, local.hat);
      };
    });
    this.lobbyPanel.querySelectorAll<HTMLButtonElement>('[data-hat]').forEach((btn) => {
      btn.onclick = () => {
        sfx.playClick();
        this.handlers.onUpdatePrefs(local.name, local.color.id, btn.dataset.hat as HatId);
      };
    });

    if (local.isHost) {
      this.lobbyPanel.querySelector<HTMLSelectElement>('#ma-set-bots')!.onchange = (e) =>
        this.handlers.onUpdateSettings({
          botFillCount: Number((e.target as HTMLSelectElement).value),
        });
      this.lobbyPanel.querySelector<HTMLSelectElement>('#ma-set-imp')!.onchange = (e) =>
        this.handlers.onUpdateSettings({
          impostorCount: Number((e.target as HTMLSelectElement).value) as 1 | 2,
        });
      this.lobbyPanel.querySelector<HTMLSelectElement>('#ma-set-cd')!.onchange = (e) =>
        this.handlers.onUpdateSettings({
          killCooldown: Number((e.target as HTMLSelectElement).value),
        });
      this.lobbyPanel.querySelector<HTMLSelectElement>('#ma-set-role')!.onchange = (e) =>
        this.handlers.onUpdateSettings({
          preferredRole: (e.target as HTMLSelectElement).value as PreferredRole,
        });
      this.lobbyPanel.querySelector<HTMLButtonElement>('#ma-start-btn')!.onclick = () =>
        this.handlers.onStartMatch();
    }
  }

  private renderActionBar(
    local: PlayerState,
    avail: ActionAvailability,
    sabotage: ActiveSabotage | null,
  ): void {
    const killCeil = avail.killCooldown > 0 ? Math.ceil(avail.killCooldown) : 0;
    const sabCeil = avail.sabotageCooldown > 0 ? Math.ceil(avail.sabotageCooldown) : 0;
    const actionKey = `${local.alive}|${local.role}|${avail.useLabel || ''}|${avail.canReport}|${avail.canKill}|${killCeil}|${avail.canVent}|${avail.inVent || ''}|${avail.canSabotage}|${sabCeil}|${Boolean(sabotage)}`;

    if (actionKey !== this.lastActionKey) {
      this.lastActionKey = actionKey;
      const btns: string[] = [];

      btns.push(
        `<button id="ma-act-use" class="ma-btn ${avail.useLabel ? 'primary' : ''}" ${avail.useLabel ? '' : 'disabled'}>
          🛠️ ${avail.useLabel || 'Usar (E)'}
        </button>`,
      );

      if (local.alive) {
        btns.push(
          `<button id="ma-act-report" class="ma-btn ${avail.canReport ? 'danger' : ''}" ${avail.canReport ? '' : 'disabled'}>
            📢 Reportar (R)
          </button>`,
        );
      } else {
        btns.push(
          `<button id="ma-act-ghostchat" class="ma-btn">
            👻 Chat Fantasma
          </button>`,
        );
      }

      if (local.alive && local.role === 'impostor') {
        const cdLabel = killCeil > 0 ? ` (${killCeil}s)` : '';
        btns.push(
          `<button id="ma-act-kill" class="ma-btn ${avail.canKill ? 'danger' : ''}" ${avail.canKill ? '' : 'disabled'}>
            🔪 Eliminar (K)${cdLabel}
          </button>`,
        );
        btns.push(
          `<button id="ma-act-vent" class="ma-btn ${avail.canVent || avail.inVent ? 'primary' : ''}" ${avail.canVent || avail.inVent ? '' : 'disabled'}>
            🕳️ ${avail.inVent ? 'Sair Vent (V)' : 'Vent (V)'}
          </button>`,
        );
        const sabLabel =
          sabCeil > 0 ? ` (${sabCeil}s)` : sabotage ? ' (Ativa)' : '';
        btns.push(
          `<button id="ma-act-sab" class="ma-btn ${avail.canSabotage ? 'danger' : ''}" ${avail.canSabotage ? '' : 'disabled'}>
            ⚡ Sabotar (S)${sabLabel}
          </button>`,
        );
      }

      this.actionBar.innerHTML = btns.join('');

      const bind = (id: string, fn: () => void) => {
        const el = this.actionBar.querySelector<HTMLButtonElement>(`#${id}`);
        if (el) el.onclick = fn;
      };
      bind('ma-act-use', () => this.handlers.onUse());
      bind('ma-act-report', () => this.handlers.onReport());
      bind('ma-act-kill', () => this.handlers.onKill());
      bind('ma-act-vent', () => this.handlers.onVent());
      bind('ma-act-sab', () => {
        sfx.playClick();
        this.sabotageMenuOpen = !this.sabotageMenuOpen;
      });
      bind('ma-act-ghostchat', () => {
        sfx.playClick();
        this.ghostChatOpen = !this.ghostChatOpen;
      });
    }

    const sabPickerKey = `${this.sabotageMenuOpen && avail.canSabotage}`;
    if (sabPickerKey !== this.lastSabPickerKey) {
      this.lastSabPickerKey = sabPickerKey;
      if (this.sabotageMenuOpen && avail.canSabotage) {
        this.sabotagePicker.style.display = 'flex';
        this.sabotagePicker.innerHTML = `
          <div style="font-size:11px;font-weight:900;color:#fca5a5;">ESCOLHA A SABOTAGEM:</div>
          <button id="ma-sab-lights" class="ma-btn primary">💡 Apagar Luzes (Elétrica)</button>
          <button id="ma-sab-reactor" class="ma-btn danger">☢️ Derreter Reator (35s)</button>
        `;
        this.sabotagePicker.querySelector<HTMLButtonElement>('#ma-sab-lights')!.onclick = () => {
          this.sabotageMenuOpen = false;
          this.handlers.onSabotage('lights');
        };
        this.sabotagePicker.querySelector<HTMLButtonElement>('#ma-sab-reactor')!.onclick = () => {
          this.sabotageMenuOpen = false;
          this.handlers.onSabotage('reactor');
        };
      } else {
        this.sabotagePicker.style.display = 'none';
      }
    }
  }

  private renderCamBar(camIndex: number): void {
    const camKey = `${camIndex}`;
    if (camKey === this.lastCamKey) return;
    this.lastCamKey = camKey;

    if (camIndex < 0) {
      this.camBar.style.display = 'none';
      return;
    }
    this.camBar.style.display = 'flex';
    this.camBar.innerHTML = `
      ${SECURITY_CAMERAS.map(
        (c, i) =>
          `<button class="ma-btn ${camIndex === i ? 'primary' : ''}" data-cam="${i}" style="padding:6px 10px;font-size:12px;">📹 ${c.id.toUpperCase()}</button>`,
      ).join('')}
      <button class="ma-btn danger" id="ma-cam-exit" style="padding:6px 10px;font-size:12px;">✖ Sair (E)</button>
    `;
    this.camBar.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
      b.onclick = () => this.handlers.onSelectCam(Number(b.dataset.cam));
    });
    this.camBar.querySelector<HTMLButtonElement>('#ma-cam-exit')!.onclick = () =>
      this.handlers.onExitCam();
  }

  private renderVentBar(local: PlayerState): void {
    const ventKey = `${local.inVent || ''}`;
    if (ventKey === this.lastVentKey) return;
    this.lastVentKey = ventKey;

    if (!local.inVent) {
      this.ventBar.style.display = 'none';
      return;
    }
    const vent = VENTS.find((v) => v.id === local.inVent);
    if (!vent) {
      this.ventBar.style.display = 'none';
      return;
    }
    this.ventBar.style.display = 'flex';
    this.ventBar.innerHTML = `
      <span style="font-size:12px;font-weight:900;color:#fca5a5;">🕳️ TUBULAÇÃO:</span>
      ${vent.links
        .map((lid) => {
          const target = VENTS.find((v) => v.id === lid);
          return `<button class="ma-btn" data-vent="${lid}" style="padding:6px 10px;font-size:12px;">➡️ ${target?.room.toUpperCase()}</button>`;
        })
        .join('')}
      <button class="ma-btn primary" id="ma-vent-exit" style="padding:6px 10px;font-size:12px;">Sair (V)</button>
    `;
    this.ventBar.querySelectorAll<HTMLButtonElement>('[data-vent]').forEach((b) => {
      b.onclick = () => this.handlers.onJumpVent(b.dataset.vent!);
    });
    this.ventBar.querySelector<HTMLButtonElement>('#ma-vent-exit')!.onclick = () =>
      this.handlers.onVent();
  }

  private renderGhostChat(local: PlayerState, chats: ChatMessage[]): void {
    if (local.alive || !this.ghostChatOpen) {
      this.ghostChatPanel.style.display = 'none';
      return;
    }
    this.ghostChatPanel.style.display = 'flex';
    const isFocused = document.activeElement?.id === 'ma-ghost-input';
    const ghostMsgs = chats.filter((c) => c.ghostOnly).slice(-12);
    const ghostKey = `${ghostMsgs.length}:${ghostMsgs[ghostMsgs.length - 1]?.id || ''}`;

    if (!isFocused && ghostKey !== this.lastChatCount.toString() + ':ghost') {
      this.lastChatCount = chats.length;
      if (this.ghostChatPanel.dataset.key === ghostKey) return;
      this.ghostChatPanel.dataset.key = ghostKey;
      this.ghostChatPanel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:900;color:#cbd5e1;">👻 Chat dos Fantasmas</span>
          <button id="ma-ghost-close" class="ma-btn" style="padding:3px 7px;font-size:11px;">✖</button>
        </div>
        <div style="height:120px;overflow-y:auto;background:#020617;border-radius:8px;padding:6px;font-size:12px;">
          ${ghostMsgs.map((m) => `<div style="margin-bottom:4px;"><b style="color:${m.senderColor}">${this.esc(m.senderName)}:</b> ${this.esc(m.text)}</div>`).join('') || '<div style="color:#64748b;">Só fantasmas veem este chat...</div>'}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="ma-ghost-input" class="ma-input" style="flex:1;padding:6px;font-size:12px;" placeholder="Assombrar..." maxlength="80" />
          <button id="ma-ghost-send" class="ma-btn primary" style="padding:6px 10px;font-size:12px;">OK</button>
        </div>
      `;
      this.ghostChatPanel.querySelector<HTMLButtonElement>('#ma-ghost-close')!.onclick = () => {
        this.ghostChatOpen = false;
      };
      const inp = this.ghostChatPanel.querySelector<HTMLInputElement>('#ma-ghost-input')!;
      const send = () => {
        const txt = inp.value.trim();
        if (txt) {
          this.handlers.onSendChat(txt);
          inp.value = '';
        }
      };
      this.ghostChatPanel.querySelector<HTMLButtonElement>('#ma-ghost-send')!.onclick = send;
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') send();
      };
    }
  }

  private renderReveal(
    local: PlayerState,
    players: PlayerState[],
    timer: number,
  ): void {
    this.revealOverlay.classList.add('open');
    const sec = Math.ceil(timer);
    const revKey = `${local.id}|${local.role}|${sec}`;
    if (revKey === this.lastRevealKey) return;
    this.lastRevealKey = revKey;

    const isImp = local.role === 'impostor';
    const allies = players.filter((p) => p.role === 'impostor');
    const crewCount = players.filter((p) => p.role === 'crew').length;
    const impCount = allies.length;

    this.revealOverlay.innerHTML = `
      <div class="ma-card" style="max-width:560px;text-align:center;border-color:${isImp ? '#ef4444' : '#38bdf8'};background:radial-gradient(circle at top, ${isImp ? '#450a0a' : '#082f49'}, #020617);">
        <div style="font-size:13px;font-weight:800;letter-spacing:2px;color:#94a3b8;margin-bottom:8px;">NAVE BANANA-1 · INICIANDO MISSÃO</div>
        <div style="font-size:44px;font-weight:900;color:${isImp ? '#ef4444' : '#38bdf8'};margin-bottom:8px;">
          ${isImp ? 'IMPOSTOR 😈' : 'TRIPULANTE 🍌'}
        </div>
        <div style="font-size:15px;color:#e2e8f0;margin-bottom:18px;">
          ${
            isImp
              ? `Há <b>${impCount}</b> Impostor(es) entre nós. Sabote a nave e elimine a tripulação!`
              : `Existem <b>${impCount}</b> Impostor(es) infiltrado(s) entre <b>${crewCount + impCount}</b> macacos. Faça suas tarefas e descubra quem roubou a banana!`
          }
        </div>
        <div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
          ${
            isImp
              ? allies
                  .map(
                    (a) =>
                      `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">${drawMonkeyAvatar(a.color, a.hat, 48)}<span style="font-size:12px;font-weight:800;color:#fca5a5;">${this.esc(a.name)}</span></div>`,
                  )
                  .join('')
              : `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">${drawMonkeyAvatar(local.color, local.hat, 52)}<span style="font-size:12px;font-weight:800;color:#7dd3fc;">${this.esc(local.name)}</span></div>`
          }
        </div>
        <div style="font-size:12px;color:#94a3b8;">Começando em ${sec}s...</div>
      </div>
    `;
  }

  private renderMeeting(
    meeting: MeetingState,
    players: PlayerState[],
    local: PlayerState,
    chats: ChatMessage[],
  ): void {
    this.meetingOverlay.classList.add('open');
    const meetingKey = `${meeting.callerId}-${meeting.reason}-${Math.ceil(meeting.timeLeft)}-${chats.length}-${players.map((p) => p.votedFor ?? '_').join(',')}`;
    const chatInputFocused = document.activeElement?.id === 'ma-chat-input';

    if (meetingKey === this.lastMeetingKey) return;
    if (chatInputFocused) {
      // Only update timer and chat list without destroying input focus
      const timerEl = this.meetingOverlay.querySelector<HTMLDivElement>('#ma-meet-timer');
      if (timerEl) timerEl.textContent = `⏱️ ${Math.max(0, Math.ceil(meeting.timeLeft))}s`;
      const chatBox = this.meetingOverlay.querySelector<HTMLDivElement>('#ma-chat-log');
      if (chatBox && this.lastChatCount !== chats.length) {
        this.lastChatCount = chats.length;
        chatBox.innerHTML = this.renderChatRows(chats, local);
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      return;
    }

    this.lastMeetingKey = meetingKey;
    this.lastChatCount = chats.length;

    const canVote = local.alive && local.votedFor === null;
    const quickPhrases = [
      'VI ALGUÉM NO VENT! 🕳️',
      'TAVA NO SCANNER! 🧬',
      'CONFIEM EM MIM 🍌',
      'SUS DEMAIS 🤨',
      'ONDE FOI O CORPO? 📍',
      'BORA PULAR! ⏭️',
    ];

    const playerCards = players
      .map((p) => {
        const isReporter = p.id === meeting.callerId;
        const hasVoted = p.alive && p.votedFor !== null;
        const selected = this.selectedVoteTarget === p.id;
        return `
        <div data-vote-id="${p.id}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:12px;background:${!p.alive ? '#0f172a' : selected ? '#334155' : '#1e293b'};border:2px solid ${selected ? '#facc15' : !p.alive ? '#1e293b' : '#334155'};opacity:${p.alive ? '1' : '0.45'};cursor:${canVote && p.alive ? 'pointer' : 'default'};">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            ${drawMonkeyAvatar(p.color, p.hat, 30)}
            <div style="min-width:0;">
              <div style="font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${local.role === 'impostor' && p.role === 'impostor' ? '#f87171' : '#f8fafc'};">
                ${this.esc(p.name)} ${isReporter ? '📢' : ''} ${!p.alive ? '💀' : ''}
              </div>
              <div style="font-size:10px;color:${hasVoted ? '#4ade80' : '#94a3b8'};">
                ${!p.alive ? 'Eliminado' : hasVoted ? '✓ VOTOU' : 'Pensando...'}
              </div>
            </div>
          </div>
          ${
            canVote && p.alive && selected
              ? `<button class="ma-btn danger" data-confirm-vote="${p.id}" style="padding:4px 8px;font-size:11px;">VOTAR!</button>`
              : ''
          }
        </div>
      `;
      })
      .join('');

    this.meetingOverlay.innerHTML = `
      <div class="ma-card" style="max-width:860px;border-color:${meeting.reason === 'body' ? '#ef4444' : '#facc15'};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:20px;font-weight:900;color:${meeting.reason === 'body' ? '#f87171' : '#facc15'};">
              ${meeting.reason === 'body' ? `📢 CORPO REPORTADO! (${this.esc(meeting.victimName || 'Tripulante')})` : '🚨 REUNIÃO DE EMERGÊNCIA!'}
            </div>
            <div style="font-size:12px;color:#cbd5e1;">
              Chamada por <b>${this.esc(meeting.callerName)}</b>${meeting.bodyRoomLabel ? ` em <b>${meeting.bodyRoomLabel}</b>` : ''}
            </div>
          </div>
          <div id="ma-meet-timer" style="background:#1e293b;border:2px solid #facc15;border-radius:12px;padding:6px 14px;font-size:16px;font-weight:900;color:#fde047;">
            ⏱️ ${Math.max(0, Math.ceil(meeting.timeLeft))}s
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:14px;">
          <div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;">
              ${playerCards}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              ${
                canVote
                  ? `<button id="ma-skip-btn" class="ma-btn primary" style="flex:1;">⏭️ Pular Voto (Skip)</button>`
                  : `<div style="font-size:12px;font-weight:800;color:#86efac;">${!local.alive ? '👻 Fantasmas não votam.' : '✅ Seu voto foi registrado!'}</div>`
              }
            </div>
          </div>

          <div style="display:flex;flex-direction:column;background:#020617;border:2px solid #334155;border-radius:14px;padding:10px;height:360px;">
            <div style="font-size:12px;font-weight:900;color:#7dd3fc;margin-bottom:6px;">💬 Chat da Reunião ${!local.alive ? '(Você fala no Chat Fantasma)' : ''}</div>
            <div id="ma-chat-log" style="flex:1;overflow-y:auto;padding-right:4px;font-size:12px;margin-bottom:8px;">
              ${this.renderChatRows(chats, local)}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
              ${quickPhrases
                .map(
                  (q) =>
                    `<button class="ma-btn" data-quick="${this.esc(q)}" style="padding:3px 7px;font-size:10px;">${q}</button>`,
                )
                .join('')}
            </div>
            <div style="display:flex;gap:6px;">
              <input id="ma-chat-input" class="ma-input" style="flex:1;" placeholder="Digite sua acusação..." maxlength="100" />
              <button id="ma-chat-send" class="ma-btn primary">Enviar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const chatBox = this.meetingOverlay.querySelector<HTMLDivElement>('#ma-chat-log')!;
    chatBox.scrollTop = chatBox.scrollHeight;

    // Bind voting clicks
    if (canVote) {
      this.meetingOverlay.querySelectorAll<HTMLDivElement>('[data-vote-id]').forEach((card) => {
        card.onclick = (e) => {
          const target = card.dataset.voteId!;
          const p = players.find((x) => x.id === target);
          if (!p || !p.alive) return;
          if ((e.target as HTMLElement).dataset.confirmVote) return;
          sfx.playClick();
          this.selectedVoteTarget = this.selectedVoteTarget === target ? null : target;
          this.lastMeetingKey = '';
          this.renderMeeting(meeting, players, local, chats);
        };
      });
      this.meetingOverlay
        .querySelectorAll<HTMLButtonElement>('[data-confirm-vote]')
        .forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            sfx.playVote();
            this.handlers.onCastVote(btn.dataset.confirmVote!);
          };
        });
      const skipBtn = this.meetingOverlay.querySelector<HTMLButtonElement>('#ma-skip-btn');
      if (skipBtn) {
        skipBtn.onclick = () => {
          sfx.playVote();
          this.handlers.onCastVote('skip');
        };
      }
    }

    // Bind chat
    const inp = this.meetingOverlay.querySelector<HTMLInputElement>('#ma-chat-input')!;
    const send = () => {
      const txt = inp.value.trim();
      if (txt) {
        this.handlers.onSendChat(txt);
        inp.value = '';
      }
    };
    this.meetingOverlay.querySelector<HTMLButtonElement>('#ma-chat-send')!.onclick = send;
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') send();
    };
    this.meetingOverlay.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((b) => {
      b.onclick = () => this.handlers.onSendChat(b.dataset.quick!);
    });
  }

  private renderChatRows(chats: ChatMessage[], local: PlayerState): string {
    return chats
      .filter((c) => !c.ghostOnly || !local.alive)
      .map((m) => {
        if (m.system) {
          return `<div style="color:#fde047;font-style:italic;margin-bottom:5px;">⚡ ${this.esc(m.text)}</div>`;
        }
        return `<div style="margin-bottom:5px;line-height:1.35;">
          ${m.ghostOnly ? '<span style="color:#94a3b8;">[👻] </span>' : ''}<b style="color:${m.senderColor};">${this.esc(m.senderName)}:</b> <span style="color:#f1f5f9;">${this.esc(m.text)}</span>
        </div>`;
      })
      .join('');
  }

  private renderEjection(ej: EjectionState): void {
    this.ejectOverlay.classList.add('open');
    const progress = Math.max(0, Math.min(1, 1 - ej.timer / 3.6));
    const leftPct = Math.round(-10 + progress * 115);
    const rot = Math.round(progress * 540);

    const headline = ej.tieOrSkip
      ? 'Ninguém foi ejetado. (Empate / Pularam)'
      : `${this.esc(ej.ejectedName)} foi ejetado...`;
    const subline =
      progress > 0.45
        ? ej.tieOrSkip
          ? `Ainda restam ${ej.remainingImpostors} Impostor(es) na Nave.`
          : ej.wasImpostor
            ? `😈 ELE ERA O IMPOSTOR! (${ej.remainingImpostors} restante(s))`
            : `😇 Ele NÃO era o Impostor... (${ej.remainingImpostors} restante(s))`
        : '';

    this.ejectOverlay.innerHTML = `
      <div class="ma-card" style="max-width:620px;height:290px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:#020617;border-color:#38bdf8;">
        ${
          !ej.tieOrSkip
            ? `<div style="position:absolute;top:42px;left:${leftPct}%;transform:rotate(${rot}deg);width:54px;height:54px;filter:drop-shadow(0 0 10px ${ej.ejectedColor});">
                <svg viewBox="0 0 60 60" width="54" height="54">
                  <path d="M14 40 Q4 36 8 22" fill="none" stroke="#92400e" stroke-width="5" stroke-linecap="round"/>
                  <rect x="8" y="20" width="9" height="20" rx="4" fill="${ej.ejectedColor}" stroke="#0f172a" stroke-width="2.5"/>
                  <circle cx="15" cy="15" r="6" fill="#b45309" stroke="#0f172a" stroke-width="2.5"/>
                  <circle cx="15" cy="15" r="3" fill="#fda4af"/>
                  <circle cx="43" cy="15" r="6" fill="#b45309" stroke="#0f172a" stroke-width="2.5"/>
                  <circle cx="43" cy="15" r="3" fill="#fda4af"/>
                  <rect x="15" y="10" width="28" height="34" rx="13" fill="${ej.ejectedColor}" stroke="#0f172a" stroke-width="2.8"/>
                  <rect x="20" y="16" width="22" height="14" rx="7" fill="#38bdf8" stroke="#0f172a" stroke-width="2.4"/>
                  <ellipse cx="32" cy="23" rx="7" ry="5" fill="#fde68a"/>
                  <circle cx="29" cy="22" r="2.2" fill="#fff" stroke="#0f172a" stroke-width="0.9"/>
                  <circle cx="29" cy="22" r="1" fill="#0f172a"/>
                  <circle cx="35" cy="22" r="2.2" fill="#fff" stroke="#0f172a" stroke-width="0.9"/>
                  <circle cx="35" cy="22" r="1" fill="#0f172a"/>
                  <ellipse cx="32" cy="25.5" rx="1.6" ry="2" fill="#7f1d1d"/>
                </svg>
              </div>`
            : ''
        }
        <div style="font-size:24px;font-weight:900;color:#f8fafc;z-index:2;margin-top:34px;">${headline}</div>
        <div style="font-size:16px;font-weight:800;color:${ej.wasImpostor ? '#4ade80' : '#fca5a5'};z-index:2;margin-top:10px;min-height:24px;">${subline}</div>
      </div>
    `;
  }

  private renderGameOver(res: GameOverState, local: PlayerState): void {
    this.gameoverOverlay.classList.add('open');
    const key = `${res.winner}|${res.reason}|${res.scoreEarned}|${local.isHost}`;
    if (key === this.lastGameOverKey) return;
    this.lastGameOverKey = key;
    const crewWon = res.winner === 'crew';

    this.gameoverOverlay.innerHTML = `
      <div class="ma-card" style="max-width:560px;text-align:center;border-color:${crewWon ? '#4ade80' : '#ef4444'};background:radial-gradient(circle at top, ${crewWon ? '#052e16' : '#450a0a'}, #020617);">
        <div style="font-size:46px;margin-bottom:4px;">${crewWon ? '🍌🏆' : '😈🚀'}</div>
        <div style="font-size:30px;font-weight:900;color:${crewWon ? '#4ade80' : '#ef4444'};margin-bottom:6px;">
          ${crewWon ? 'VITÓRIA DOS TRIPULANTES!' : 'VITÓRIA DO IMPOSTOR!'}
        </div>
        <div style="font-size:15px;color:#e2e8f0;margin-bottom:16px;">${this.esc(res.reason)}</div>

        <div style="background:rgba(15,23,42,0.8);border:1px solid #334155;border-radius:14px;padding:12px;margin-bottom:14px;">
          <div style="font-size:12px;font-weight:800;color:#94a3b8;margin-bottom:8px;">OS IMPOSTORES ERAM:</div>
          <div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap;">
            ${res.impostors
              .map(
                (i) =>
                  `<div style="padding:6px 12px;border-radius:10px;background:#1e293b;border:2px solid ${i.color};font-weight:900;color:#fca5a5;">😈 ${this.esc(i.name)}</div>`,
              )
              .join('')}
          </div>
        </div>

        <div style="font-size:13px;font-weight:800;color:#fde047;margin-bottom:14px;">
          Pontuação da partida: +${res.scoreEarned} pts
        </div>

        ${
          local.isHost
            ? `<button id="ma-play-again" class="ma-btn primary" style="font-size:15px;padding:12px 24px;">🔄 Voltar ao Lobby / Jogar Novamente</button>`
            : `<div style="font-size:13px;color:#94a3b8;">Aguardando o Host reiniciar para o Lobby...</div>`
        }
      </div>
    `;

    const btn = this.gameoverOverlay.querySelector<HTMLButtonElement>('#ma-play-again');
    if (btn) btn.onclick = () => this.handlers.onPlayAgain();
  }

  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
