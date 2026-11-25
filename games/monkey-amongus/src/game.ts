import { reportGameScore } from '@monkey-slop/sdk';
import { sfx } from './audio';
import { BOT_NAMES, BotManager } from './bots';
import {
  EMERGENCY_BUTTON,
  getRefeitorioSpawn,
  getRoomAt,
  LIGHTS_PANEL,
  REACTOR_PANEL,
  resolveCircleCollisions,
  SECURITY_CAMERAS,
  SECURITY_MONITOR,
  TASK_SPOTS,
  VENTS,
} from './map';
import { GameNetwork } from './net';
import { GameRenderer } from './renderer';
import { TaskModalController } from './tasks';
import type {
  ActiveSabotage,
  ChatMessage,
  DeadBody,
  EjectionState,
  GameOverState,
  GamePhase,
  HatId,
  LobbySettings,
  MeetingState,
  NetMessage,
  Particle,
  PlayerRole,
  PlayerState,
  SabotageKind,
} from './types';
import { MONKEY_SUIT_COLORS } from './types';
import { type ActionAvailability, GameUI } from './ui';

const BASE_SPEED = 225;

export class MonkeyAmongUsGame {
  private canvas: HTMLCanvasElement;
  private renderer: GameRenderer;
  private ui: GameUI;
  private tasksModal: TaskModalController;
  private net: GameNetwork;
  private bots = new BotManager();

  private phase: GamePhase = 'lobby';
  private settings: LobbySettings = {
    impostorCount: 1,
    botFillCount: 6,
    speedMult: 1.0,
    killCooldown: 20,
    preferredRole: 'random',
  };

  private players: PlayerState[] = [];
  private humanPrefs = new Map<string, { name: string; colorId: string; hat: HatId }>();
  private bodies: DeadBody[] = [];
  private sabotage: ActiveSabotage | null = null;
  private sabotageCooldown = 0;
  private emergencyCooldown = 12;

  private meeting: MeetingState | null = null;
  private meetingElapsed = 0;
  private chats: ChatMessage[] = [];
  private ejection: EjectionState | null = null;
  private gameOver: GameOverState | null = null;
  private revealTimer = 0;

  private particles: Particle[] = [];
  private shakeTimer = 0;
  private timeSec = 0;
  private camIndex = -1;
  private showMinimap = false;

  private keys = new Set<string>();
  private pointerTarget: { x: number; y: number } | null = null;
  private lastMoveSendAt = 0;
  private lastWorldSyncAt = 0;
  private lastAlarmAt = 0;
  private scoredThisMatch = false;
  private controlsOpen = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);

    this.net = new GameNetwork({
      onPlayersChange: () => this.rebuildLobbyPlayers(),
      onConnectedChange: () => this.rebuildLobbyPlayers(),
      onMessage: (senderId, senderName, msg) => this.handleNetMessage(senderId, senderName, msg),
      onControlsOpenChange: (open) => {
        this.controlsOpen = open;
        if (open) {
          this.keys.clear();
          this.pointerTarget = null;
        }
      },
    });

    this.tasksModal = new TaskModalController({
      onTaskComplete: (taskId) => this.completeLocalTask(taskId),
      onSabotageFixed: (kind) => this.fixSabotage(kind),
      onScanStateChange: (scanning) => {
        const local = this.getLocalPlayer();
        if (local) local.scanning = scanning;
      },
      onClose: () => {
        const local = this.getLocalPlayer();
        if (local) local.scanning = false;
      },
    });

    this.ui = new GameUI({
      onUpdatePrefs: (name, colorId, hat) => this.updateLocalPrefs(name, colorId, hat),
      onUpdateSettings: (patch) => this.updateSettings(patch),
      onStartMatch: () => this.startMatch(),
      onUse: () => this.triggerUse(),
      onReport: () => this.triggerReport(),
      onKill: () => this.triggerKill(),
      onVent: () => this.triggerVent(),
      onJumpVent: (ventId) => this.jumpToVent(ventId),
      onSabotage: (kind) => this.triggerSabotage(kind),
      onToggleMinimap: () => {
        sfx.playClick();
        this.showMinimap = !this.showMinimap;
      },
      onSelectCam: (idx) => {
        sfx.playClick();
        this.camIndex = idx;
      },
      onExitCam: () => this.exitCameras(),
      onSendChat: (text) => this.sendChat(text),
      onCastVote: (targetId) => this.castVote(targetId),
      onPlayAgain: () => this.returnToLobby(),
    });

    this.initLocalPlayer();
    this.rebuildLobbyPlayers();
    this.bindInput();
    this.startLoop();
  }

  private initLocalPlayer(): void {
    const id = this.net.getLocalId();
    const prefColor = MONKEY_SUIT_COLORS[Math.floor(Math.random() * MONKEY_SUIT_COLORS.length)].id;
    this.humanPrefs.set(id, {
      name: this.net.room.localPlayer.name,
      colorId: prefColor,
      hat: 'banana',
    });
  }

  private getLocalPlayer(): PlayerState {
    const id = this.net.getLocalId();
    return this.players.find((p) => p.id === id) || this.players[0];
  }

  private rebuildLobbyPlayers(): void {
    if (this.phase !== 'lobby') return;

    const sdkPlayers = this.net.room.getPlayers();
    const localId = this.net.getLocalId();
    const humans =
      sdkPlayers.length > 0
        ? sdkPlayers
        : [
            {
              id: localId,
              name: this.net.room.localPlayer.name,
              color: this.net.room.localPlayer.color,
              isHost: true,
            },
          ];

    // Ensure local prefs exist under current peer id
    if (!this.humanPrefs.has(localId)) {
      const firstPref = Array.from(this.humanPrefs.values())[0];
      this.humanPrefs.set(localId, {
        name: firstPref?.name || this.net.room.localPlayer.name,
        colorId: firstPref?.colorId || 'yellow',
        hat: firstPref?.hat || 'banana',
      });
    }

    if (!this.net.isEffectiveHost()) {
      // Guest sends prefs to host
      const myPref = this.humanPrefs.get(localId)!;
      this.net.broadcast({
        kind: 'lobby_prefs',
        name: myPref.name,
        colorId: myPref.colorId,
        hat: myPref.hat,
      });
      return;
    }

    // Host builds full roster (humans + bots up to botFillCount)
    const oldPos = new Map(this.players.map((p) => [p.id, { x: p.x, y: p.y, facing: p.facing }]));
    const next: PlayerState[] = [];
    const usedColors = new Set<string>();

    const totalTarget = Math.max(humans.length, this.settings.botFillCount);

    humans.forEach((hp, idx) => {
      const pref = this.humanPrefs.get(hp.id);
      let colorSpec = MONKEY_SUIT_COLORS.find((c) => c.id === pref?.colorId);
      if (!colorSpec || usedColors.has(colorSpec.id)) {
        colorSpec =
          MONKEY_SUIT_COLORS.find((c) => !usedColors.has(c.id)) || MONKEY_SUIT_COLORS[idx % 10];
      }
      usedColors.add(colorSpec.id);
      const prev = oldPos.get(hp.id);
      const spawn = getRefeitorioSpawn(idx, totalTarget);

      next.push({
        id: hp.id,
        name: pref?.name || hp.name,
        isBot: false,
        isHost: hp.isHost || (!this.net.isOnline() && hp.id === localId),
        color: colorSpec,
        hat: pref?.hat || 'none',
        role: 'crew',
        alive: true,
        x: prev?.x ?? spawn.x,
        y: prev?.y ?? spawn.y,
        vx: 0,
        vy: 0,
        facing: prev?.facing ?? 1,
        walkPhase: 0,
        inVent: null,
        scanning: false,
        watchingCams: false,
        tasksAssigned: [],
        tasksDone: [],
        killCooldown: 0,
        emergencyUsesLeft: 1,
        votedFor: null,
      });
    });

    const botsNeeded = Math.max(0, totalTarget - next.length);
    const hatCycle: HatId[] = ['none', 'banana', 'cap', 'leaf', 'crown', 'visor_band'];
    for (let b = 0; b < botsNeeded; b++) {
      const botId = `bot-${b + 1}`;
      const colorSpec =
        MONKEY_SUIT_COLORS.find((c) => !usedColors.has(c.id)) ||
        MONKEY_SUIT_COLORS[(humans.length + b) % MONKEY_SUIT_COLORS.length];
      usedColors.add(colorSpec.id);
      const spawn = getRefeitorioSpawn(humans.length + b, totalTarget);
      const prev = oldPos.get(botId);

      next.push({
        id: botId,
        name: BOT_NAMES[b % BOT_NAMES.length],
        isBot: true,
        isHost: false,
        color: colorSpec,
        hat: hatCycle[(b + 1) % hatCycle.length],
        role: 'crew',
        alive: true,
        x: prev?.x ?? spawn.x,
        y: prev?.y ?? spawn.y,
        vx: 0,
        vy: 0,
        facing: prev?.facing ?? (b % 2 === 0 ? 1 : -1),
        walkPhase: 0,
        inVent: null,
        scanning: false,
        watchingCams: false,
        tasksAssigned: [],
        tasksDone: [],
        killCooldown: 0,
        emergencyUsesLeft: 1,
        votedFor: null,
      });
    }

    this.players = next;
    this.syncLobbyToGuests();
  }

  private syncLobbyToGuests(): void {
    if (!this.net.isEffectiveHost() || !this.net.isOnline()) return;
    this.net.broadcast({
      kind: 'lobby_sync',
      settings: this.settings,
      players: this.players,
    });
  }

  private updateLocalPrefs(name: string, colorId: string, hat: HatId): void {
    const localId = this.net.getLocalId();
    this.humanPrefs.set(localId, { name, colorId, hat });
    this.net.room.setPlayerName(name);
    if (this.net.isEffectiveHost()) {
      this.rebuildLobbyPlayers();
    } else {
      this.net.broadcast({ kind: 'lobby_prefs', name, colorId, hat });
    }
  }

  private updateSettings(patch: Partial<LobbySettings>): void {
    if (!this.net.isEffectiveHost()) return;
    this.settings = { ...this.settings, ...patch };
    this.rebuildLobbyPlayers();
  }

  private startMatch(): void {
    if (!this.net.isEffectiveHost()) return;
    this.rebuildLobbyPlayers();
    if (this.players.length < 4) {
      this.net.hud.toast('Precisa de pelo menos 4 macacos!', 'chaos');
      return;
    }

    sfx.playEmergency();
    const total = this.players.length;
    const impTarget = Math.min(this.settings.impostorCount, total >= 7 ? 2 : 1);

    // Role assignment
    const roles = new Map<string, PlayerRole>();
    const localId = this.net.getLocalId();

    const pool = [...this.players].sort(() => Math.random() - 0.5);
    let impsAssigned = 0;

    if (this.settings.preferredRole === 'impostor') {
      roles.set(localId, 'impostor');
      impsAssigned++;
    } else if (this.settings.preferredRole === 'crew') {
      roles.set(localId, 'crew');
    }

    for (const p of pool) {
      if (roles.has(p.id)) continue;
      if (impsAssigned < impTarget) {
        roles.set(p.id, 'impostor');
        impsAssigned++;
      } else {
        roles.set(p.id, 'crew');
      }
    }

    const allTaskIds = TASK_SPOTS.map((t) => t.id);

    this.players = this.players.map((p, idx) => {
      const spawn = getRefeitorioSpawn(idx, total);
      const shuffledTasks = [...allTaskIds].sort(() => Math.random() - 0.5).slice(0, 5);
      return {
        ...p,
        role: roles.get(p.id) || 'crew',
        alive: true,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        inVent: null,
        scanning: false,
        watchingCams: false,
        tasksAssigned: shuffledTasks,
        tasksDone: [],
        killCooldown: 10,
        emergencyUsesLeft: 1,
        votedFor: null,
      };
    });

    this.bodies = [];
    this.sabotage = null;
    this.sabotageCooldown = 12;
    this.emergencyCooldown = 15;
    this.chats = [];
    this.meeting = null;
    this.ejection = null;
    this.gameOver = null;
    this.camIndex = -1;
    this.showMinimap = false;
    this.scoredThisMatch = false;
    this.revealTimer = 3.2;
    this.phase = 'reveal';

    this.bots.resetForMatch(this.players);

    if (this.net.isOnline()) {
      this.net.broadcast({
        kind: 'match_start',
        players: this.players,
        settings: this.settings,
      });
    }
  }

  private returnToLobby(): void {
    if (!this.net.isEffectiveHost()) return;
    this.phase = 'lobby';
    this.bodies = [];
    this.sabotage = null;
    this.meeting = null;
    this.ejection = null;
    this.gameOver = null;
    this.camIndex = -1;
    this.showMinimap = false;
    this.tasksModal.close();
    this.rebuildLobbyPlayers();
    if (this.net.isOnline()) {
      this.net.broadcast({
        kind: 'back_to_lobby',
        players: this.players,
        settings: this.settings,
      });
    }
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const k = e.key.toLowerCase();
      this.keys.add(k);

      if (k === 'escape') {
        if (this.tasksModal.opened()) this.tasksModal.close();
        else if (this.camIndex >= 0) this.exitCameras();
        else if (this.showMinimap) this.showMinimap = false;
        this.ui.closeSabotageMenu();
        return;
      }

      if (this.phase !== 'playing') return;

      if (k === 'm' || k === 'tab') {
        e.preventDefault();
        sfx.playClick();
        this.showMinimap = !this.showMinimap;
      } else if (k === 'e' || k === ' ') {
        e.preventDefault();
        if (this.camIndex >= 0) this.exitCameras();
        else this.triggerUse();
      } else if (k === 'r') {
        this.triggerReport();
      } else if (k === 'k') {
        this.triggerKill();
      } else if (k === 'v') {
        this.triggerVent();
      } else if (k === 's') {
        const local = this.getLocalPlayer();
        if (local.alive && local.role === 'impostor' && !this.sabotage && this.sabotageCooldown <= 0) {
          sfx.playClick();
          this.ui.toggleSabotageMenu();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    // Optional pointer drag / tap to move on mobile or mouse
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.tasksModal.opened() || this.phase === 'meeting') return;
      if (e.button !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointerTarget = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.pointerTarget) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointerTarget = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
    });
    window.addEventListener('pointerup', () => {
      this.pointerTarget = null;
    });
  }

  private getActionAvailability(): ActionAvailability {
    const local = this.getLocalPlayer();
    if (!local || this.phase !== 'playing') {
      return {
        useLabel: null,
        canReport: false,
        canKill: false,
        killCooldown: 0,
        canVent: false,
        inVent: null,
        canSabotage: false,
        sabotageCooldown: 0,
      };
    }

    let useLabel: string | null = null;
    if (this.camIndex >= 0) {
      useLabel = 'Sair Câmeras (E)';
    } else if (!local.inVent) {
      // Check sabotage fix panels first
      if (
        local.alive &&
        this.sabotage?.kind === 'lights' &&
        Math.hypot(local.x - LIGHTS_PANEL.x, local.y - LIGHTS_PANEL.y) < 75
      ) {
        useLabel = 'Religar Luzes (E)';
      } else if (
        local.alive &&
        this.sabotage?.kind === 'reactor' &&
        Math.hypot(local.x - REACTOR_PANEL.x, local.y - REACTOR_PANEL.y) < 80
      ) {
        useLabel = 'Estabilizar Reator (E)';
      } else if (
        local.alive &&
        Math.hypot(local.x - EMERGENCY_BUTTON.x, local.y - EMERGENCY_BUTTON.y) < 95 &&
        !this.sabotage &&
        this.emergencyCooldown <= 0 &&
        local.emergencyUsesLeft > 0
      ) {
        useLabel = 'Botão Emergência (E)';
      } else if (
        local.alive &&
        Math.hypot(local.x - SECURITY_MONITOR.x, local.y - SECURITY_MONITOR.y) < 75
      ) {
        useLabel = 'Ver Câmeras (E)';
      } else if (local.role === 'crew') {
        const nearTask = TASK_SPOTS.find(
          (t) =>
            local.tasksAssigned.includes(t.id) &&
            !local.tasksDone.includes(t.id) &&
            Math.hypot(local.x - t.x, local.y - t.y) < 68,
        );
        if (nearTask) useLabel = `${nearTask.title} (E)`;
      }
    }

    const canReport =
      local.alive &&
      !local.inVent &&
      this.bodies.some((b) => Math.hypot(b.x - local.x, b.y - local.y) < 120);

    const canKill =
      local.alive &&
      local.role === 'impostor' &&
      !local.inVent &&
      local.killCooldown <= 0 &&
      this.players.some(
        (p) =>
          p.alive &&
          p.role !== 'impostor' &&
          p.id !== local.id &&
          !p.inVent &&
          Math.hypot(p.x - local.x, p.y - local.y) < 105,
      );

    const nearVent = VENTS.some((v) => Math.hypot(v.x - local.x, v.y - local.y) < 62);
    const canVent = local.alive && local.role === 'impostor' && nearVent;

    const canSabotage =
      local.alive &&
      local.role === 'impostor' &&
      !this.sabotage &&
      this.sabotageCooldown <= 0;

    return {
      useLabel,
      canReport,
      canKill,
      killCooldown: local.killCooldown,
      canVent,
      inVent: local.inVent,
      canSabotage,
      sabotageCooldown: this.sabotageCooldown,
    };
  }

  private triggerUse(): void {
    const local = this.getLocalPlayer();
    if (!local || this.phase !== 'playing' || local.inVent) return;
    if (this.tasksModal.opened()) return;

    if (this.camIndex >= 0) {
      this.exitCameras();
      return;
    }

    if (
      local.alive &&
      this.sabotage?.kind === 'lights' &&
      Math.hypot(local.x - LIGHTS_PANEL.x, local.y - LIGHTS_PANEL.y) < 75
    ) {
      this.tasksModal.openSabotageFix('lights');
      return;
    }

    if (
      local.alive &&
      this.sabotage?.kind === 'reactor' &&
      Math.hypot(local.x - REACTOR_PANEL.x, local.y - REACTOR_PANEL.y) < 80
    ) {
      this.tasksModal.openSabotageFix('reactor');
      return;
    }

    if (
      local.alive &&
      Math.hypot(local.x - EMERGENCY_BUTTON.x, local.y - EMERGENCY_BUTTON.y) < 95 &&
      !this.sabotage &&
      this.emergencyCooldown <= 0 &&
      local.emergencyUsesLeft > 0
    ) {
      if (this.net.isEffectiveHost()) {
        this.hostStartMeeting('emergency', local.id);
      } else {
        this.net.broadcast({ kind: 'req_emergency' });
      }
      return;
    }

    if (
      local.alive &&
      Math.hypot(local.x - SECURITY_MONITOR.x, local.y - SECURITY_MONITOR.y) < 75
    ) {
      sfx.playClick();
      this.camIndex = 0;
      local.watchingCams = true;
      return;
    }

    if (local.role === 'crew') {
      const nearTask = TASK_SPOTS.find(
        (t) =>
          local.tasksAssigned.includes(t.id) &&
          !local.tasksDone.includes(t.id) &&
          Math.hypot(local.x - t.x, local.y - t.y) < 68,
      );
      if (nearTask) {
        this.tasksModal.openTask(nearTask);
      }
    }
  }

  private exitCameras(): void {
    this.camIndex = -1;
    const local = this.getLocalPlayer();
    if (local) local.watchingCams = false;
    sfx.playClick();
  }

  private completeLocalTask(taskId: string): void {
    const local = this.getLocalPlayer();
    if (!local || local.tasksDone.includes(taskId)) return;
    local.tasksDone.push(taskId);
    this.spawnFloatingText(local.x, local.y - 36, '🍌 TAREFA OK!', '#4ade80');
    if (this.net.isEffectiveHost()) {
      this.net.broadcast({ kind: 'task_done_ack', playerId: local.id, taskId });
      this.checkWinConditions();
    } else {
      this.net.broadcast({ kind: 'req_task_done', taskId });
    }
  }

  private fixSabotage(kind: SabotageKind): void {
    if (this.net.isEffectiveHost()) {
      this.hostFixSabotage(kind);
    } else {
      this.net.broadcast({ kind: 'req_sabotage_fix', sabotageKind: kind });
    }
  }

  private hostFixSabotage(kind: SabotageKind): void {
    if (!this.sabotage || this.sabotage.kind !== kind) return;
    this.sabotage = null;
    this.sabotageCooldown = 18;
    this.net.hud.toast(
      kind === 'lights' ? '💡 Luzes religadas!' : '☢️ Reator estabilizado!',
      'banana',
    );
    if (this.net.isOnline()) {
      this.net.broadcast({ kind: 'sabotage_fixed', sabotageKind: kind });
    }
  }

  private triggerReport(): void {
    const local = this.getLocalPlayer();
    if (!local || !local.alive || local.inVent || this.phase !== 'playing') return;
    const body = this.bodies.find((b) => Math.hypot(b.x - local.x, b.y - local.y) < 120);
    if (!body) return;
    if (this.net.isEffectiveHost()) {
      this.hostStartMeeting('body', local.id, body.id);
    } else {
      this.net.broadcast({ kind: 'req_report', bodyId: body.id });
    }
  }

  private triggerKill(): void {
    const local = this.getLocalPlayer();
    if (!local || !local.alive || local.role !== 'impostor' || local.inVent) return;
    if (local.killCooldown > 0 || this.phase !== 'playing') return;

    let best: PlayerState | null = null;
    let bestD = 105;
    for (const p of this.players) {
      if (!p.alive || p.role === 'impostor' || p.id === local.id || p.inVent) continue;
      const d = Math.hypot(p.x - local.x, p.y - local.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;

    if (this.net.isEffectiveHost()) {
      this.hostExecuteKill(local.id, best.id);
    } else {
      this.net.broadcast({ kind: 'req_kill', targetId: best.id });
    }
  }

  private triggerVent(): void {
    const local = this.getLocalPlayer();
    if (!local || !local.alive || local.role !== 'impostor' || this.phase !== 'playing') return;

    if (local.inVent) {
      local.inVent = null;
      sfx.playVent();
      return;
    }

    const near = VENTS.find((v) => Math.hypot(v.x - local.x, v.y - local.y) < 62);
    if (!near) return;
    local.inVent = near.id;
    local.x = near.x;
    local.y = near.y;
    local.vx = 0;
    local.vy = 0;
    sfx.playVent();
  }

  private jumpToVent(ventId: string): void {
    const local = this.getLocalPlayer();
    if (!local || !local.inVent || local.role !== 'impostor') return;
    const target = VENTS.find((v) => v.id === ventId);
    if (!target) return;
    local.inVent = target.id;
    local.x = target.x;
    local.y = target.y;
    sfx.playVent();
  }

  private triggerSabotage(kind: SabotageKind): void {
    const local = this.getLocalPlayer();
    if (!local || !local.alive || local.role !== 'impostor') return;
    if (this.sabotage || this.sabotageCooldown > 0) return;

    if (this.net.isEffectiveHost()) {
      this.hostStartSabotage(kind);
    } else {
      this.net.broadcast({ kind: 'req_sabotage', sabotageKind: kind });
    }
  }

  private hostStartSabotage(kind: SabotageKind): void {
    if (this.sabotage || this.phase !== 'playing') return;
    this.sabotage = {
      kind,
      timer: kind === 'reactor' ? 35 : 0,
      startedAt: this.timeSec,
    };
    sfx.playEmergency();
    this.net.hud.toast(
      kind === 'lights'
        ? '⚡ SABOTAGEM: Luzes apagadas!'
        : '☢️ SABOTAGEM: Reator derretendo em 35s!',
      'chaos',
    );
    if (this.net.isOnline()) {
      this.net.broadcast({ kind: 'sabotage_start', sabotage: this.sabotage });
    }
  }

  private hostExecuteKill(killerId: string, victimId: string): void {
    const killer = this.players.find((p) => p.id === killerId);
    const victim = this.players.find((p) => p.id === victimId);
    if (!killer || !victim || !killer.alive || !victim.alive) return;

    victim.alive = false;
    victim.scanning = false;
    victim.watchingCams = false;
    killer.killCooldown = this.settings.killCooldown;
    killer.x = victim.x;
    killer.y = victim.y;

    const room = getRoomAt(victim.x, victim.y);
    const body: DeadBody = {
      id: `body-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      victimId: victim.id,
      victimName: victim.name,
      color: victim.color,
      x: victim.x,
      y: victim.y,
      room: room.id,
      roomLabel: room.name,
      createdAt: this.timeSec,
    };
    this.bodies.push(body);

    const localId = this.net.getLocalId();
    if (killer.id === localId || victim.id === localId) {
      sfx.playKill();
      this.shakeTimer = 0.45;
      this.spawnBurst(victim.x, victim.y, '#ef4444', 18);
    }

    if (this.net.isOnline()) {
      this.net.broadcast({ kind: 'kill_event', killerId, victimId, body });
    }
    this.checkWinConditions();
  }

  private hostStartMeeting(
    reason: 'body' | 'emergency',
    callerId: string,
    bodyId?: string,
  ): void {
    if (this.phase !== 'playing') return;
    const caller = this.players.find((p) => p.id === callerId);
    if (!caller || !caller.alive) return;

    if (reason === 'emergency') {
      if (this.sabotage || this.emergencyCooldown > 0 || caller.emergencyUsesLeft <= 0) return;
      caller.emergencyUsesLeft--;
    }

    const body = bodyId ? this.bodies.find((b) => b.id === bodyId) : undefined;
    this.tasksModal.close();
    this.exitCameras();
    this.ui.closeSabotageMenu();

    // Clear bodies, reset positions & vents, clear reactor meltdown if any
    this.bodies = [];
    if (this.sabotage?.kind === 'reactor') this.sabotage = null;

    this.players.forEach((p, idx) => {
      const spawn = getRefeitorioSpawn(idx, this.players.length);
      p.x = spawn.x;
      p.y = spawn.y;
      p.vx = 0;
      p.vy = 0;
      p.inVent = null;
      p.scanning = false;
      p.watchingCams = false;
      p.votedFor = null;
    });

    this.meeting = {
      reason,
      callerId: caller.id,
      callerName: caller.name,
      bodyRoomLabel: body?.roomLabel,
      victimName: body?.victimName,
      victimColor: body?.color.body,
      timeLeft: 45,
      phase: 'voting',
    };
    this.meetingElapsed = 0;
    this.phase = 'meeting';

    const sysMsg: ChatMessage = {
      id: `sys-${Date.now()}`,
      senderId: 'system',
      senderName: 'SISTEMA',
      senderColor: '#facc15',
      text:
        reason === 'body'
          ? `${caller.name} encontrou o corpo de ${body?.victimName || 'um macaco'} em ${body?.roomLabel || 'Nave'}!`
          : `${caller.name} apertou o Botão de Emergência!`,
      ghostOnly: false,
      system: true,
      timestamp: Date.now(),
    };
    this.chats.push(sysMsg);
    this.bots.prepareMeeting(this.players, this.meeting);

    if (reason === 'body') sfx.playReport();
    else sfx.playEmergency();

    if (this.net.isOnline()) {
      this.net.broadcast({
        kind: 'meeting_start',
        meeting: this.meeting,
        bodiesCleared: true,
        players: this.players,
      });
    }
  }

  private sendChat(rawText: string): void {
    const text = rawText.trim().slice(0, 110);
    if (!text) return;
    const local = this.getLocalPlayer();
    const ghostOnly = !local.alive;

    if (this.net.isEffectiveHost()) {
      this.hostAcceptChat(local.id, text, ghostOnly);
    } else {
      this.net.broadcast({ kind: 'req_chat', text, ghostOnly });
    }
  }

  private hostAcceptChat(senderId: string, text: string, ghostOnly: boolean): void {
    const sender = this.players.find((p) => p.id === senderId);
    if (!sender) return;
    const msg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: sender.id,
      senderName: sender.name,
      senderColor: sender.color.body,
      text,
      ghostOnly: !sender.alive || ghostOnly,
      timestamp: Date.now(),
    };
    this.chats.push(msg);
    if (this.chats.length > 60) this.chats.shift();
    if (this.net.isOnline()) {
      this.net.broadcast({ kind: 'chat_msg', msg });
    }
  }

  private castVote(targetId: string): void {
    const local = this.getLocalPlayer();
    if (!local || !local.alive || local.votedFor !== null || this.phase !== 'meeting') return;

    if (this.net.isEffectiveHost()) {
      this.hostAcceptVote(local.id, targetId);
    } else {
      this.net.broadcast({ kind: 'req_vote', targetId });
    }
  }

  private hostAcceptVote(voterId: string, targetId: string): void {
    if (this.phase !== 'meeting') return;
    const voter = this.players.find((p) => p.id === voterId);
    if (!voter || !voter.alive || voter.votedFor !== null) return;
    voter.votedFor = targetId;

    if (this.net.isOnline()) {
      this.net.broadcast({ kind: 'vote_cast', voterId, targetId });
    }

    const allVoted = this.players.filter((p) => p.alive).every((p) => p.votedFor !== null);
    if (allVoted && this.meeting) {
      this.meeting.timeLeft = Math.min(this.meeting.timeLeft, 1.0);
    }
  }

  private hostFinishMeeting(): void {
    const counts = new Map<string, number>();
    for (const p of this.players) {
      if (!p.alive) continue;
      const v = p.votedFor || 'skip';
      counts.set(v, (counts.get(v) || 0) + 1);
    }

    let topId = 'skip';
    let topVotes = -1;
    let tie = false;

    for (const [id, c] of counts) {
      if (c > topVotes) {
        topVotes = c;
        topId = id;
        tie = false;
      } else if (c === topVotes) {
        tie = true;
      }
    }

    const ejected =
      !tie && topId !== 'skip' ? this.players.find((p) => p.id === topId) || null : null;

    if (ejected) {
      ejected.alive = false;
    }

    const remainingImps = this.players.filter((p) => p.alive && p.role === 'impostor').length;
    this.ejection = {
      ejectedId: ejected?.id || null,
      ejectedName: ejected?.name || '',
      ejectedColor: ejected?.color.body || '#facc15',
      wasImpostor: ejected?.role === 'impostor',
      tieOrSkip: !ejected,
      remainingImpostors: remainingImps,
      timer: 3.6,
    };
    this.phase = 'ejecting';
    sfx.playEject(Boolean(ejected && ejected.role === 'impostor'));

    if (this.net.isOnline()) {
      this.net.broadcast({
        kind: 'ejection_start',
        ejection: this.ejection,
        players: this.players,
      });
    }
  }

  private getTaskProgress(): number {
    let total = 0;
    let done = 0;
    for (const p of this.players) {
      if (p.role !== 'crew') continue;
      total += p.tasksAssigned.length;
      done += p.tasksDone.length;
    }
    return total > 0 ? done / total : 0;
  }

  private checkWinConditions(): boolean {
    if (this.phase === 'gameover' || this.phase === 'lobby') return true;

    const aliveCrew = this.players.filter((p) => p.alive && p.role === 'crew').length;
    const aliveImps = this.players.filter((p) => p.alive && p.role === 'impostor').length;
    const progress = this.getTaskProgress();

    if (aliveImps === 0) {
      this.hostEndGame('crew', 'Todos os Impostores foram ejetados para o espaço!');
      return true;
    }
    if (progress >= 1) {
      this.hostEndGame('crew', 'Todas as tarefas da Nave Banana-1 foram concluídas!');
      return true;
    }
    if (aliveImps >= aliveCrew) {
      this.hostEndGame('impostor', 'Os Impostores dominaram a tripulação da Nave Banana-1!');
      return true;
    }
    if (this.sabotage?.kind === 'reactor' && this.sabotage.timer <= 0) {
      this.hostEndGame('impostor', 'O Reator de Potássio explodiu em uma chuva de bananas!');
      return true;
    }
    return false;
  }

  private hostEndGame(winner: 'crew' | 'impostor', reason: string): void {
    this.tasksModal.close();
    this.exitCameras();
    this.phase = 'gameover';

    const imps = this.players
      .filter((p) => p.role === 'impostor')
      .map((p) => ({ id: p.id, name: p.name, color: p.color.body, alive: p.alive }));

    const local = this.getLocalPlayer();
    const score = this.computeLocalScore(winner, local);

    this.gameOver = {
      winner,
      reason,
      impostors: imps,
      scoreEarned: score,
    };

    sfx.playVictory(winner === 'crew');
    this.submitScoreOnce(score);

    if (this.net.isOnline()) {
      this.net.broadcast({
        kind: 'game_over',
        result: this.gameOver,
        players: this.players,
      });
    }
  }

  private computeLocalScore(winner: 'crew' | 'impostor', local: PlayerState): number {
    const won = local.role === winner;
    const taskPts = local.tasksDone.length * 40;
    const survivePts = local.alive ? 100 : 25;
    return (won ? 350 : 80) + taskPts + survivePts;
  }

  private submitScoreOnce(score: number): void {
    if (this.scoredThisMatch) return;
    this.scoredThisMatch = true;
    reportGameScore('monkey-amongus', score);
  }

  private handleNetMessage(senderId: string, _senderName: string, msg: NetMessage): void {
    const isHost = this.net.isEffectiveHost();

    switch (msg.kind) {
      case 'lobby_prefs': {
        if (!isHost) return;
        this.humanPrefs.set(senderId, {
          name: msg.name,
          colorId: msg.colorId,
          hat: msg.hat,
        });
        this.rebuildLobbyPlayers();
        break;
      }
      case 'lobby_sync': {
        if (isHost) return;
        this.settings = msg.settings;
        this.players = msg.players;
        break;
      }
      case 'match_start': {
        if (isHost) return;
        this.settings = msg.settings;
        this.players = msg.players;
        this.bodies = [];
        this.sabotage = null;
        this.chats = [];
        this.meeting = null;
        this.ejection = null;
        this.gameOver = null;
        this.camIndex = -1;
        this.showMinimap = false;
        this.scoredThisMatch = false;
        this.revealTimer = 3.2;
        this.phase = 'reveal';
        sfx.playEmergency();
        break;
      }
      case 'player_move': {
        const p = this.players.find((x) => x.id === senderId);
        if (p) {
          p.x = msg.x;
          p.y = msg.y;
          p.vx = msg.vx;
          p.vy = msg.vy;
          p.facing = msg.facing;
          p.inVent = msg.inVent;
          p.scanning = msg.scanning;
          p.watchingCams = msg.watchingCams;
        }
        break;
      }
      case 'world_sync': {
        if (isHost) return;
        const localId = this.net.getLocalId();
        for (const sp of msg.players) {
          const p = this.players.find((x) => x.id === sp.id);
          if (!p) continue;
          if (p.id !== localId) {
            p.x = sp.x;
            p.y = sp.y;
            p.vx = sp.vx;
            p.vy = sp.vy;
            p.facing = sp.facing;
            p.inVent = sp.inVent;
            p.scanning = sp.scanning;
            p.watchingCams = sp.watchingCams;
          }
          p.alive = sp.alive;
          p.tasksDone = sp.tasksDone;
          p.killCooldown = sp.killCooldown;
        }
        this.sabotage = msg.sabotage;
        this.sabotageCooldown = msg.sabotageCooldown;
        this.emergencyCooldown = msg.emergencyCooldown;
        break;
      }
      case 'req_task_done': {
        if (!isHost) return;
        const p = this.players.find((x) => x.id === senderId);
        if (p && !p.tasksDone.includes(msg.taskId)) {
          p.tasksDone.push(msg.taskId);
          this.net.broadcast({ kind: 'task_done_ack', playerId: p.id, taskId: msg.taskId });
          this.checkWinConditions();
        }
        break;
      }
      case 'task_done_ack': {
        const p = this.players.find((x) => x.id === msg.playerId);
        if (p && !p.tasksDone.includes(msg.taskId)) {
          p.tasksDone.push(msg.taskId);
        }
        break;
      }
      case 'req_kill': {
        if (isHost) this.hostExecuteKill(senderId, msg.targetId);
        break;
      }
      case 'kill_event': {
        if (isHost) return;
        const killer = this.players.find((p) => p.id === msg.killerId);
        const victim = this.players.find((p) => p.id === msg.victimId);
        if (victim) victim.alive = false;
        if (killer) killer.killCooldown = this.settings.killCooldown;
        this.bodies.push(msg.body);
        const localId = this.net.getLocalId();
        if (msg.killerId === localId || msg.victimId === localId) {
          sfx.playKill();
          this.shakeTimer = 0.45;
          this.spawnBurst(msg.body.x, msg.body.y, '#ef4444', 18);
        }
        break;
      }
      case 'req_report': {
        if (isHost) this.hostStartMeeting('body', senderId, msg.bodyId);
        break;
      }
      case 'req_emergency': {
        if (isHost) this.hostStartMeeting('emergency', senderId);
        break;
      }
      case 'meeting_start': {
        if (isHost) return;
        this.tasksModal.close();
        this.exitCameras();
        this.bodies = [];
        this.sabotage = this.sabotage?.kind === 'reactor' ? null : this.sabotage;
        this.players = msg.players;
        this.meeting = msg.meeting;
        this.phase = 'meeting';
        if (msg.meeting.reason === 'body') sfx.playReport();
        else sfx.playEmergency();
        break;
      }
      case 'req_chat': {
        if (isHost) this.hostAcceptChat(senderId, msg.text, msg.ghostOnly);
        break;
      }
      case 'chat_msg': {
        if (!isHost) {
          this.chats.push(msg.msg);
          if (this.chats.length > 60) this.chats.shift();
        }
        break;
      }
      case 'req_vote': {
        if (isHost) this.hostAcceptVote(senderId, msg.targetId);
        break;
      }
      case 'vote_cast': {
        if (!isHost) {
          const v = this.players.find((p) => p.id === msg.voterId);
          if (v) v.votedFor = msg.targetId;
        }
        break;
      }
      case 'ejection_start': {
        if (isHost) return;
        this.players = msg.players;
        this.ejection = msg.ejection;
        this.phase = 'ejecting';
        sfx.playEject(msg.ejection.wasImpostor);
        break;
      }
      case 'resume_play': {
        if (isHost) return;
        this.players = msg.players;
        this.emergencyCooldown = msg.emergencyCooldown;
        this.meeting = null;
        this.ejection = null;
        this.phase = 'playing';
        break;
      }
      case 'req_sabotage': {
        if (isHost) this.hostStartSabotage(msg.sabotageKind);
        break;
      }
      case 'sabotage_start': {
        if (!isHost) {
          this.sabotage = msg.sabotage;
          sfx.playEmergency();
        }
        break;
      }
      case 'req_sabotage_fix': {
        if (isHost) this.hostFixSabotage(msg.sabotageKind);
        break;
      }
      case 'sabotage_fixed': {
        if (!isHost) {
          this.sabotage = null;
          this.sabotageCooldown = 18;
          this.net.hud.toast(
            msg.sabotageKind === 'lights' ? '💡 Luzes religadas!' : '☢️ Reator estabilizado!',
            'banana',
          );
        }
        break;
      }
      case 'game_over': {
        if (isHost) return;
        this.tasksModal.close();
        this.exitCameras();
        this.players = msg.players;
        const local = this.getLocalPlayer();
        const score = this.computeLocalScore(msg.result.winner, local);
        this.gameOver = { ...msg.result, scoreEarned: score };
        this.phase = 'gameover';
        sfx.playVictory(msg.result.winner === 'crew');
        this.submitScoreOnce(score);
        break;
      }
      case 'back_to_lobby': {
        if (isHost) return;
        this.tasksModal.close();
        this.exitCameras();
        this.settings = msg.settings;
        this.players = msg.players;
        this.bodies = [];
        this.sabotage = null;
        this.meeting = null;
        this.ejection = null;
        this.gameOver = null;
        this.phase = 'lobby';
        break;
      }
    }
  }

  private spawnBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -36,
      life: 1.2,
      maxLife: 1.2,
      color,
      size: 14,
      text,
    });
  }

  private startLoop(): void {
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt, now);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private update(dt: number, nowMs: number): void {
    if (this.controlsOpen && !this.net.isOnline()) return;

    this.timeSec += dt;
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // Update walk animation for remote players
    const localId = this.net.getLocalId();
    for (const p of this.players) {
      if (p.id !== localId && Math.hypot(p.vx, p.vy) > 10) {
        p.walkPhase += dt * 11;
      }
    }

    if (this.phase === 'reveal') {
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) {
        this.phase = 'playing';
      }
      return;
    }

    if (this.phase === 'lobby' || this.phase === 'playing') {
      this.updateLocalMovement(dt, nowMs);
    }

    if (this.phase === 'playing') {
      if (this.sabotageCooldown > 0) this.sabotageCooldown = Math.max(0, this.sabotageCooldown - dt);
      if (this.emergencyCooldown > 0) this.emergencyCooldown = Math.max(0, this.emergencyCooldown - dt);

      for (const p of this.players) {
        if (p.killCooldown > 0) p.killCooldown = Math.max(0, p.killCooldown - dt);
      }

      if (this.sabotage?.kind === 'reactor') {
        this.sabotage.timer = Math.max(0, this.sabotage.timer - dt);
        if (nowMs - this.lastAlarmAt > 1100) {
          this.lastAlarmAt = nowMs;
          sfx.playSabotagePulse(nowMs);
        }
      }

      if (this.net.isEffectiveHost()) {
        this.bots.updatePlaying(
          dt,
          this.timeSec,
          this.players,
          this.bodies,
          this.sabotage,
          this.sabotageCooldown,
          BASE_SPEED * this.settings.speedMult * 0.9,
          {
            onBotKill: (killerId, victimId) => this.hostExecuteKill(killerId, victimId),
            onBotReport: (reporterId, bodyId) =>
              this.hostStartMeeting('body', reporterId, bodyId),
            onBotTaskDone: (botId, taskId) => {
              const bot = this.players.find((x) => x.id === botId);
              if (bot && !bot.tasksDone.includes(taskId)) bot.tasksDone.push(taskId);
            },
            onBotSabotage: (kind) => this.hostStartSabotage(kind),
            onBotFixSabotage: (kind) => this.hostFixSabotage(kind),
          },
        );

        this.checkWinConditions();

        if (this.net.isOnline() && nowMs - this.lastWorldSyncAt > 66) {
          this.lastWorldSyncAt = nowMs;
          this.net.broadcast({
            kind: 'world_sync',
            players: this.players.map((p) => ({
              id: p.id,
              x: p.x,
              y: p.y,
              vx: p.vx,
              vy: p.vy,
              facing: p.facing,
              alive: p.alive,
              inVent: p.inVent,
              scanning: p.scanning,
              watchingCams: p.watchingCams,
              tasksDone: p.tasksDone,
              killCooldown: p.killCooldown,
            })),
            sabotage: this.sabotage,
            sabotageCooldown: this.sabotageCooldown,
            emergencyCooldown: this.emergencyCooldown,
          });
        }
      }
    }

    if (this.phase === 'meeting' && this.meeting) {
      this.meetingElapsed += dt;
      this.meeting.timeLeft = Math.max(0, this.meeting.timeLeft - dt);

      if (this.net.isEffectiveHost()) {
        this.bots.updateMeeting(
          dt,
          this.meetingElapsed,
          this.players,
          this.meeting,
          (bot, text) => this.hostAcceptChat(bot.id, text, false),
          (bot, targetId) => this.hostAcceptVote(bot.id, targetId),
        );

        if (this.meeting.timeLeft <= 0) {
          this.hostFinishMeeting();
        }
      }
    }

    if (this.phase === 'ejecting' && this.ejection) {
      this.ejection.timer -= dt;
      if (this.ejection.timer <= 0 && this.net.isEffectiveHost()) {
        if (!this.checkWinConditions()) {
          this.phase = 'playing';
          this.ejection = null;
          this.meeting = null;
          this.emergencyCooldown = 15;
          for (const p of this.players) {
            if (p.role === 'impostor') p.killCooldown = Math.max(p.killCooldown, 12);
          }
          if (this.net.isOnline()) {
            this.net.broadcast({
              kind: 'resume_play',
              players: this.players,
              emergencyCooldown: this.emergencyCooldown,
            });
          }
        }
      }
    }
  }

  private updateLocalMovement(dt: number, nowMs: number): void {
    const local = this.getLocalPlayer();
    if (!local) return;

    const locked =
      local.inVent !== null ||
      this.camIndex >= 0 ||
      this.tasksModal.opened();

    let mx = 0;
    let my = 0;

    if (!locked) {
      if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;

      if (mx === 0 && my === 0 && this.pointerTarget) {
        const dist = Math.hypot(this.pointerTarget.x, this.pointerTarget.y);
        if (dist > 22) {
          mx = this.pointerTarget.x / dist;
          my = this.pointerTarget.y / dist;
        }
      }
    }

    const mag = Math.hypot(mx, my);
    if (mag > 0.01) {
      mx /= mag;
      my /= mag;
      const spd = BASE_SPEED * this.settings.speedMult * (local.alive ? 1 : 1.25);
      local.vx = mx * spd;
      local.vy = my * spd;
      if (Math.abs(mx) > 0.1) local.facing = mx >= 0 ? 1 : -1;
      const resolved = resolveCircleCollisions(
        local.x + local.vx * dt,
        local.y + local.vy * dt,
        18,
        !local.alive,
      );
      local.x = resolved.x;
      local.y = resolved.y;
      local.walkPhase += dt * 11;
    } else {
      local.vx = 0;
      local.vy = 0;
    }

    if (this.net.isOnline() && nowMs - this.lastMoveSendAt > 48) {
      this.lastMoveSendAt = nowMs;
      this.net.broadcast({
        kind: 'player_move',
        x: local.x,
        y: local.y,
        vx: local.vx,
        vy: local.vy,
        facing: local.facing,
        inVent: local.inVent,
        scanning: local.scanning,
        watchingCams: local.watchingCams,
      });
    }
  }

  private render(): void {
    const local = this.getLocalPlayer();
    if (!local) return;

    const obsCoords =
      this.camIndex >= 0 && SECURITY_CAMERAS[this.camIndex]
        ? SECURITY_CAMERAS[this.camIndex]
        : local;
    const room = getRoomAt(obsCoords.x, obsCoords.y);

    this.renderer.render({
      phase: this.phase,
      players: this.players,
      localId: local.id,
      bodies: this.bodies,
      sabotage: this.sabotage,
      particles: this.particles,
      camIndex: this.camIndex,
      showMinimap: this.showMinimap,
      shakeTimer: this.shakeTimer,
      timeSec: this.timeSec,
      anyoneWatchingCams: this.players.some((p) => p.alive && p.watchingCams),
    });

    this.ui.sync({
      phase: this.phase,
      players: this.players,
      local,
      settings: this.settings,
      roomName: room.name,
      taskProgress: this.getTaskProgress(),
      sabotage: this.sabotage,
      avail: this.getActionAvailability(),
      camIndex: this.camIndex,
      showMinimap: this.showMinimap,
      meeting: this.meeting,
      chats: this.chats,
      ejection: this.ejection,
      gameOver: this.gameOver,
      revealTimer: this.revealTimer,
    });
  }
}
