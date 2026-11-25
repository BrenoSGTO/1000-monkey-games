import { mountMonkeyHud, PeerRoom, type PlayerProfile } from '@monkey-slop/sdk';
import { Vec2 } from 'planck-js';
import { gameAudio } from './audio';
import { MONKEY_ANGRYBIRDS_CONTROLS } from './controls';
import {
  LAUNCH_VEL_SCALE,
  MIN_PULL_DISTANCE,
  MAX_PULL_DISTANCE,
  MONKEY_SPECS,
  SLING_POS,
  type QuickTaunt,
} from './constants';
import { generateInfiniteLevel, HANDCRAFTED_LEVELS } from './levels';
import { PhysicsWorld } from './physics';
import { type AimVisualState, type CameraState, GameRenderer } from './renderer';
import { loadProgress, saveLevelResult, type SaveData } from './storage';
import type { LevelDef, LocalPlayMode, MultiplayerMode, NetMessage, WorldSnapshot } from './types';
import { type ComparisonEntry, GameUi } from './ui';

type ShotPhase = 'aiming' | 'flying' | 'settling' | 'waiting-sync' | 'ended';

interface RemoteDuelState {
  playerId: string;
  playerName: string;
  playerColor: string;
  score: number;
  shotsUsed: number;
  enemiesLeft: number;
  status: 'playing' | 'won' | 'lost';
  stars: number;
}

const LOCAL_PLAYERS = [
  { id: 'local-p1', name: 'Jogador 1', color: '#38bdf8' },
  { id: 'local-p2', name: 'Jogador 2', color: '#fb7185' },
] as const;

const FIXED_DT = 1 / 60;

class AngryMonkeysGame {
  private canvas: HTMLCanvasElement;
  private renderer: GameRenderer;
  private physics: PhysicsWorld;
  private ui: GameUi;
  private room: PeerRoom<NetMessage>;
  private sdkHud: ReturnType<typeof mountMonkeyHud<NetMessage>>;

  private save: SaveData = loadProgress();
  private players: PlayerProfile[] = [];
  private mpMode: MultiplayerMode = 'coop-turns';
  private localMode: LocalPlayMode = 'solo';

  private levelIndex = 0;
  private infiniteWave = 0;
  private infiniteSeed = Math.floor(Math.random() * 900000) + 100000;
  private level: LevelDef = HANDCRAFTED_LEVELS[0];

  private phase: ShotPhase = 'aiming';
  private monkeyIndex = 0;
  private score = 0;
  private shotsUsed = 0;
  private playerScores: Record<string, number> = {};
  private localShots: Record<string, number> = {};
  private localTurnIdx = 0;
  private turnOwnerId: string | null = null;
  private settleTimer = 0;
  private flightTimer = 0;
  private hitstopTimer = 0;

  // Camera
  private cam: CameraState = { x: 13.5, y: 3.6, zoom: 34, shake: 0 };
  private baseZoom = 34;
  private manualZoomOffset = 0;
  private manualPanX = 0;
  private peekCastle = false;
  private introCamTimer = 0;

  // Aiming (local & remote) & Ghost Trajectory
  private isDraggingSling = false;
  private isPanning = false;
  private panLastClientX = 0;
  private localPullX = SLING_POS.x;
  private localPullY = SLING_POS.y;
  private remoteAim: { active: boolean; pullX: number; pullY: number } = {
    active: false,
    pullX: SLING_POS.x,
    pullY: SLING_POS.y,
  };
  private lastAimSendAt = 0;
  private lastShotGhost: { x: number; y: number }[] = [];

  // Duel opponent state (supports up to 4 players!)
  private remoteDuels = new Map<string, RemoteDuelState>();

  // Victory metadata for sync/result
  private lastResultMeta: { won: boolean; finalScore: number; stars: number; unusedMonkeys: number } | null = null;

  private accumulator = 0;
  private lastFrameMs = performance.now();
  private elapsedSec = 0;
  private controlsPaused = false;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const app = document.getElementById('app') as HTMLElement | null;
    if (!canvas || !app) throw new Error('DOM do jogo nao encontrado');

    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);

    this.physics = new PhysicsWorld({
      onScore: (points, x, y, label, color) => {
        this.score += points;
        const owner = this.getActiveScorerId();
        this.playerScores[owner] = (this.playerScores[owner] ?? 0) + points;
        this.physics.addFloatingText(x, y + 0.6, label ?? `+${points}`, color ?? '#fef08a', 1);
      },
      onShake: (amt) => {
        this.cam.shake = Math.min(1.2, Math.max(this.cam.shake, amt));
      },
      onHitstop: (duration) => {
        this.hitstopTimer = Math.max(this.hitstopTimer, duration);
      },
    });

    this.room = new PeerRoom<NetMessage>('monkey-angrybirds', {
      onPlayersChange: (players) => this.handlePlayersChange(players),
      onMessage: (env) => this.handleNetMessage(env.senderId, env.senderName, env.payload),
      onStatus: (status, detail) => {
        if (status === 'connected' && detail) {
          this.sdkHud.toast(detail, 'info');
        }
      },
    });

    this.sdkHud = mountMonkeyHud({
      slug: 'monkey-angrybirds',
      title: 'Macacos Pistola',
      room: this.room,
      controls: {
        ...MONKEY_ANGRYBIRDS_CONTROLS,
        onOpenChange: (open) => {
          this.controlsPaused = open;
          if (open) {
            this.isPanning = false;
            if (this.isDraggingSling) {
              this.isDraggingSling = false;
              this.localPullX = SLING_POS.x;
              this.localPullY = SLING_POS.y;
            }
            this.canvas.classList.remove('dragging');
          }
        },
      },
    });

    this.ui = new GameUi(app, {
      onOpenLevels: () => this.openMenu(),
      onRestart: () => this.restartCurrentLevel(true),
      onPeekCastle: () => {
        this.peekCastle = !this.peekCastle;
        this.manualPanX = 0;
      },
      onZoomDelta: (delta) => {
        this.manualZoomOffset = Math.max(-14, Math.min(20, this.manualZoomOffset + delta));
      },
      onSkipTurn: () => this.skipToNextMonkey(),
      onSendTaunt: (taunt) => this.sendTaunt(taunt),
      onSelectLevel: (idx) => this.startCampaignLevel(idx, true),
      onStartInfinite: () => this.startInfiniteMode(1, true),
      onSelectLocalMode: (mode) => this.setLocalMode(mode),
      onSelectMpMode: (mode) => this.setMultiplayerMode(mode),
      onNextLevel: () => this.advanceNextLevel(),
      onRequestRematch: (action) => this.requestRematch(action),
    });

    this.bindInputs();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    this.loadLevel(HANDCRAFTED_LEVELS[0]);
    this.openMenu();
    requestAnimationFrame((t) => this.loop(t));
  }

  private getActiveScorerId(): string {
    if (!this.isMpConnected() && this.localMode === 'local-2p') {
      return LOCAL_PLAYERS[this.localTurnIdx].id;
    }
    return this.turnOwnerId || this.room.localPlayer.id;
  }

  private isMpConnected(): boolean {
    return this.players.length >= 2 && Boolean(this.room.roomCode);
  }

  private isHost(): boolean {
    return !this.isMpConnected() || this.room.localPlayer.isHost;
  }

  private isMyTurn(): boolean {
    if (!this.isMpConnected() || this.mpMode === 'duel-score') return true;
    return this.turnOwnerId === this.room.localPlayer.id;
  }

  private getCurrentTurnDisplay(): { name: string; color: string } {
    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      const owner = this.players.find((p) => p.id === this.turnOwnerId) ?? this.room.localPlayer;
      return { name: owner.name, color: owner.color };
    }
    if (!this.isMpConnected() && this.localMode === 'local-2p') {
      const p = LOCAL_PLAYERS[this.localTurnIdx];
      return { name: p.name, color: p.color };
    }
    return { name: this.room.localPlayer.name, color: this.room.localPlayer.color };
  }

  private handlePlayersChange(players: PlayerProfile[]): void {
    const prevIds = new Set(this.players.map((p) => p.id));
    const hasNewJoiner = players.some((p) => !prevIds.has(p.id));
    this.players = players;
    this.sdkHud.setPlayers(players);

    if (players.length >= 2) {
      if (this.room.localPlayer.isHost) {
        if (!this.turnOwnerId || !players.some((p) => p.id === this.turnOwnerId)) {
          this.turnOwnerId = this.room.localPlayer.id;
        }
        if (hasNewJoiner) {
          this.broadcastSessionConfig();
          // Late-join sync if a match is already underway
          if (
            this.mpMode === 'coop-turns' &&
            (this.shotsUsed > 0 || this.score > 0 || this.phase === 'ended')
          ) {
            const outcome =
              this.phase === 'ended' && this.lastResultMeta
                ? this.lastResultMeta.won
                  ? 'won'
                  : 'lost'
                : 'playing';
            this.room.send('game', {
              kind: 'turn-sync',
              snapshot: this.physics.exportSnapshot(
                this.score,
                this.monkeyIndex,
                this.turnOwnerId,
                this.playerScores,
                outcome,
                this.lastResultMeta ?? undefined,
              ),
            });
          } else if (this.mpMode === 'duel-score') {
            this.sendDuelProgress(
              this.phase === 'ended' && this.lastResultMeta
                ? this.lastResultMeta.won
                  ? 'won'
                  : 'lost'
                : 'playing',
              this.lastResultMeta?.stars ?? 0,
            );
          }
        }
      }
    } else {
      this.turnOwnerId = this.room.localPlayer.id;
      this.remoteDuels.clear();
      if (this.phase === 'waiting-sync') {
        this.phase = 'aiming';
      }
    }

    if (this.ui.isMenuOpen()) {
      this.openMenu();
    }
  }

  private broadcastSessionConfig(): void {
    if (!this.isMpConnected() || !this.room.localPlayer.isHost) return;
    this.room.send('game', {
      kind: 'session-config',
      mode: this.mpMode,
      levelIndex: this.levelIndex,
      infiniteWave: this.infiniteWave,
      seed: this.infiniteSeed,
      turnOwnerId: this.turnOwnerId ?? this.room.localPlayer.id,
    });
  }

  private setLocalMode(mode: LocalPlayMode): void {
    this.localMode = mode;
    this.sdkHud.toast(
      mode === 'local-2p'
        ? 'Modo 2P Local (Hotseat) selecionado! Escolham a fase.'
        : 'Modo Solo (1P) selecionado!',
      'info',
    );
    if (this.ui.isMenuOpen()) {
      this.openMenu();
    }
  }

  private setMultiplayerMode(mode: MultiplayerMode): void {
    if (!this.isHost()) return;
    this.mpMode = mode;
    this.remoteDuels.clear();
    this.sdkHud.toast(
      mode === 'coop-turns'
        ? 'Modo alterado: Co-op de Turnos!'
        : 'Modo alterado: Duelo de Pontuação!',
      'banana',
    );
    this.broadcastSessionConfig();
    if (this.ui.isMenuOpen()) {
      this.openMenu();
    }
  }

  private handleNetMessage(senderId: string, senderName: string, msg: NetMessage): void {
    switch (msg.kind) {
      case 'session-config': {
        this.mpMode = msg.mode;
        this.infiniteSeed = msg.seed;
        this.remoteDuels.clear();
        this.ui.hideResult();
        this.ui.closeMenu();
        this.turnOwnerId = msg.turnOwnerId;
        if (msg.infiniteWave > 0) {
          this.infiniteWave = msg.infiniteWave;
          this.loadLevel(generateInfiniteLevel(msg.infiniteWave, msg.seed));
        } else {
          this.infiniteWave = 0;
          this.levelIndex = msg.levelIndex;
          this.loadLevel(HANDCRAFTED_LEVELS[msg.levelIndex] ?? HANDCRAFTED_LEVELS[0]);
        }
        this.sdkHud.toast(
          `${senderName} iniciou ${this.level.name} (${this.mpMode === 'coop-turns' ? 'Co-op' : 'Duelo'})!`,
          'info',
        );
        break;
      }
      case 'aim': {
        if (this.mpMode !== 'coop-turns') return;
        this.remoteAim = { active: msg.active, pullX: msg.pullX, pullY: msg.pullY };
        break;
      }
      case 'launch': {
        if (this.mpMode !== 'coop-turns') return;
        this.remoteAim.active = false;
        this.monkeyIndex = msg.monkeyIndex;
        this.executeLaunch(msg.pullX, msg.pullY, msg.vx, msg.vy, msg.shooterId);
        break;
      }
      case 'power': {
        if (this.mpMode !== 'coop-turns') return;
        const m =
          this.physics.monkeys.find((x) => !x.destroyed && !x.powerUsed && x.id === msg.monkeyId) ??
          this.physics.monkeys.find((x) => !x.destroyed && !x.powerUsed) ??
          this.physics.monkeys[0];
        if (m && !m.powerUsed) {
          m.body.setTransform(new Vec2(msg.x, msg.y), msg.angle);
          m.body.setLinearVelocity(new Vec2(msg.vx, msg.vy));
          this.physics.activatePower(m);
        }
        break;
      }
      case 'skip-turn': {
        if (
          this.mpMode !== 'coop-turns' ||
          !this.room.localPlayer.isHost ||
          senderId !== this.turnOwnerId
        ) {
          return;
        }
        if (this.phase === 'flying' || this.phase === 'settling') {
          this.finishTurn();
        }
        break;
      }
      case 'turn-sync': {
        if (this.mpMode !== 'coop-turns' || this.room.localPlayer.isHost) return;
        const prevOwner = this.turnOwnerId;
        this.physics.applySnapshot(msg.snapshot);
        this.score = msg.snapshot.score;
        this.monkeyIndex = msg.snapshot.monkeyIndex;
        this.turnOwnerId = msg.snapshot.turnOwnerId;
        this.playerScores = { ...msg.snapshot.playerScores };
        this.remoteAim.active = false;
        this.isDraggingSling = false;

        if (msg.snapshot.outcome === 'won' || msg.snapshot.outcome === 'lost') {
          this.concludeLevel(msg.snapshot.outcome === 'won', msg.snapshot);
          return;
        }

        if (this.phase !== 'ended') {
          this.phase = 'aiming';
          this.peekCastle = false;
          this.manualPanX = 0;
          if (this.turnOwnerId && this.turnOwnerId !== prevOwner) {
            const turnInfo = this.getCurrentTurnDisplay();
            this.ui.showTurnBanner(
              turnInfo.name,
              turnInfo.color,
              this.isMyTurn() ? 'SUA VEZ!' : 'Aguarde',
            );
            if (this.isMyTurn()) gameAudio.playTurnBell();
          }
        }
        break;
      }
      case 'duel-progress': {
        if (this.mpMode !== 'duel-score' || senderId === this.room.localPlayer.id) return;
        const prev = this.remoteDuels.get(msg.playerId);
        this.remoteDuels.set(msg.playerId, {
          playerId: msg.playerId,
          playerName: msg.playerName,
          playerColor: msg.playerColor,
          score: msg.score,
          shotsUsed: msg.shotsUsed,
          enemiesLeft: msg.enemiesLeft,
          status: msg.status,
          stars: msg.stars,
        });
        if (msg.status !== 'playing' && prev?.status === 'playing') {
          this.sdkHud.toast(
            msg.status === 'won'
              ? `🏆 ${msg.playerName} detonou o castelo com ${msg.score.toLocaleString('pt-BR')} pts!`
              : `🐷 ${msg.playerName} caiu pros porcos (${msg.score.toLocaleString('pt-BR')} pts)!`,
            msg.status === 'won' ? 'chaos' : 'info',
          );
        }
        if (this.ui.isResultOpen()) {
          this.ui.updateDuelBoard(this.buildComparisons());
        }
        break;
      }
      case 'taunt': {
        gameAudio.playTaunt(msg.sound ?? 'screech');
        this.sdkHud.toast(`${senderName}: ${msg.text}`, 'chaos');
        break;
      }
      case 'rematch-request': {
        if (!this.isHost()) return;
        const label = msg.action === 'next' ? 'ir pra Próxima Fase' : 'uma Revanche';
        this.sdkHud.toast(`📣 ${senderName} pediu ${label}!`, 'banana');
        break;
      }
    }
  }

  private openMenu(): void {
    this.save = loadProgress();
    this.ui.openMenu(this.save, this.isMpConnected(), this.isHost(), this.mpMode, this.localMode);
  }

  private startCampaignLevel(index: number, broadcast: boolean): void {
    this.levelIndex = Math.max(0, Math.min(HANDCRAFTED_LEVELS.length - 1, index));
    this.infiniteWave = 0;
    this.ui.closeMenu();
    this.ui.hideResult();
    if (broadcast && this.isMpConnected() && this.isHost()) {
      this.turnOwnerId = this.room.localPlayer.id;
    }
    this.loadLevel(HANDCRAFTED_LEVELS[this.levelIndex]);
    if (broadcast && this.isMpConnected() && this.isHost()) {
      this.broadcastSessionConfig();
    }
  }

  private startInfiniteMode(wave: number, broadcast: boolean): void {
    this.infiniteWave = wave;
    if (wave === 1 || !this.isMpConnected()) {
      this.infiniteSeed = Math.floor(Math.random() * 900000) + 100000;
    }
    this.ui.closeMenu();
    this.ui.hideResult();
    if (broadcast && this.isMpConnected() && this.isHost()) {
      this.turnOwnerId = this.room.localPlayer.id;
    }
    this.loadLevel(generateInfiniteLevel(this.infiniteWave, this.infiniteSeed));
    if (broadcast && this.isMpConnected() && this.isHost()) {
      this.broadcastSessionConfig();
    }
  }

  private restartCurrentLevel(broadcast: boolean): void {
    if (this.isMpConnected() && !this.isHost()) {
      this.requestRematch('retry');
      return;
    }
    this.ui.hideResult();
    if (this.infiniteWave > 0) {
      this.startInfiniteMode(this.infiniteWave, broadcast);
    } else {
      this.startCampaignLevel(this.levelIndex, broadcast);
    }
  }

  private advanceNextLevel(): void {
    if (this.isMpConnected() && !this.isHost()) {
      this.requestRematch('next');
      return;
    }
    if (this.infiniteWave > 0) {
      this.startInfiniteMode(this.infiniteWave + 1, true);
    } else if (this.levelIndex + 1 < HANDCRAFTED_LEVELS.length) {
      this.startCampaignLevel(this.levelIndex + 1, true);
    } else {
      this.openMenu();
    }
  }

  private requestRematch(action: 'retry' | 'next'): void {
    if (!this.isMpConnected()) return;
    this.room.send('game', { kind: 'rematch-request', action });
    this.sdkHud.toast(
      action === 'next' ? 'Pedido de Próxima Fase enviado ao Host!' : 'Pedido de Revanche enviado ao Host!',
      'info',
    );
  }

  private loadLevel(level: LevelDef): void {
    this.level = level;
    this.physics.loadLevel(level);
    this.phase = 'aiming';
    this.monkeyIndex = 0;
    this.score = 0;
    this.shotsUsed = 0;
    this.playerScores = {};
    this.localShots = { [LOCAL_PLAYERS[0].id]: 0, [LOCAL_PLAYERS[1].id]: 0 };
    this.localTurnIdx = 0;
    this.settleTimer = 0;
    this.flightTimer = 0;
    this.hitstopTimer = 0;
    this.isDraggingSling = false;
    this.localPullX = SLING_POS.x;
    this.localPullY = SLING_POS.y;
    this.remoteAim.active = false;
    this.lastShotGhost = [];
    this.lastResultMeta = null;
    this.remoteDuels.clear();
    this.peekCastle = false;
    this.manualPanX = 0;
    this.introCamTimer = 1.15;
    this.cam.x = 20.5;
    this.cam.y = 3.8;
    if (!this.turnOwnerId) {
      this.turnOwnerId = this.room.localPlayer.id;
    }

    if ((this.isMpConnected() && this.mpMode === 'coop-turns') || this.localMode === 'local-2p') {
      const turn = this.getCurrentTurnDisplay();
      this.ui.showTurnBanner(turn.name, turn.color);
    }

    this.sendDuelProgress('playing', 0);
  }

  private sendTaunt(taunt: QuickTaunt): void {
    gameAudio.playTaunt(taunt.sound);
    const sender =
      !this.isMpConnected() && this.localMode === 'local-2p'
        ? LOCAL_PLAYERS[this.localTurnIdx].name
        : 'Você';
    this.sdkHud.toast(`${sender}: ${taunt.text}`, 'banana');
    if (this.isMpConnected()) {
      this.room.send('game', { kind: 'taunt', text: taunt.text, sound: taunt.sound });
    }
  }

  private canUseAirPower(): boolean {
    if (this.phase !== 'flying' || !this.isMyTurn()) return false;
    return this.physics.monkeys.some(
      (m) => !m.destroyed && !m.powerUsed && (!m.hasCollided || m.monkeyKind === 'bomb'),
    );
  }

  private canSkipTurn(): boolean {
    if (!this.isMyTurn()) return false;
    if (this.phase === 'settling') return true;
    if (this.phase === 'flying') {
      return this.flightTimer > 0.75 && this.physics.coconuts.every((c) => c.destroyed);
    }
    return false;
  }

  private skipToNextMonkey(): void {
    if (!this.canSkipTurn()) return;
    if (this.isMpConnected() && this.mpMode === 'coop-turns' && !this.room.localPlayer.isHost) {
      this.phase = 'waiting-sync';
      this.room.send('game', { kind: 'skip-turn' });
      return;
    }
    this.finishTurn();
  }

  private bindInputs(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.controlsPaused || this.ui.isMenuOpen() || this.phase === 'ended' || this.phase === 'waiting-sync') return;
      this.canvas.setPointerCapture(e.pointerId);

      // Mid-air power click!
      if (this.phase === 'flying') {
        if (this.isMyTurn()) {
          this.triggerLocalPower();
        }
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const worldPt = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, this.cam);
      const distToSling = Math.hypot(worldPt.x - SLING_POS.x, worldPt.y - SLING_POS.y);

      if (this.phase === 'aiming' && this.isMyTurn() && distToSling < 2.6) {
        this.isDraggingSling = true;
        this.peekCastle = false;
        this.manualPanX = 0;
        this.introCamTimer = 0;
        this.updatePullPosition(worldPt.x, worldPt.y);
        this.canvas.classList.add('dragging');
      } else {
        this.isPanning = true;
        this.panLastClientX = e.clientX;
        this.canvas.classList.add('dragging');
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.isDraggingSling) {
        const rect = this.canvas.getBoundingClientRect();
        const worldPt = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, this.cam);
        this.updatePullPosition(worldPt.x, worldPt.y);
      } else if (this.isPanning) {
        const dx = e.clientX - this.panLastClientX;
        this.panLastClientX = e.clientX;
        this.manualPanX = Math.max(-4, Math.min(22, this.manualPanX - dx / this.cam.zoom));
      }
    });

    const endPointer = () => {
      if (this.isDraggingSling) {
        this.isDraggingSling = false;
        this.canvas.classList.remove('dragging');
        this.tryReleaseShot();
      }
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.classList.remove('dragging');
      }
    };

    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', endPointer);

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.manualZoomOffset = Math.max(-14, Math.min(20, this.manualZoomOffset - Math.sign(e.deltaY) * 2.5));
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        if (this.canUseAirPower()) {
          e.preventDefault();
          this.triggerLocalPower();
        } else if (this.canSkipTurn()) {
          e.preventDefault();
          this.skipToNextMonkey();
        }
      } else if (e.key === 'n' || e.key === 'N') {
        if (this.canSkipTurn()) {
          e.preventDefault();
          this.skipToNextMonkey();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (!this.ui.isMenuOpen()) this.restartCurrentLevel(true);
      } else if (e.key === 'c' || e.key === 'C') {
        this.peekCastle = !this.peekCastle;
        this.manualPanX = 0;
      }
    });
  }

  private updatePullPosition(wx: number, wy: number): void {
    // Prevent pulling past the front of the slingshot (shooting backwards)
    let dx = Math.min(-0.04, wx - SLING_POS.x);
    let dy = wy - SLING_POS.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_PULL_DISTANCE) {
      dx = (dx / dist) * MAX_PULL_DISTANCE;
      dy = (dy / dist) * MAX_PULL_DISTANCE;
    }
    // Keep monkey above ground
    this.localPullX = SLING_POS.x + dx;
    this.localPullY = Math.max(0.65, SLING_POS.y + dy);

    const stretchRatio = Math.min(1, dist / MAX_PULL_DISTANCE);
    if (stretchRatio > 0.2) {
      gameAudio.playStretch(stretchRatio);
    }

    const now = performance.now();
    if (this.isMpConnected() && this.mpMode === 'coop-turns' && now - this.lastAimSendAt > 45) {
      this.lastAimSendAt = now;
      this.room.send('game', {
        kind: 'aim',
        pullX: this.localPullX,
        pullY: this.localPullY,
        active: true,
      });
    }
  }

  private tryReleaseShot(): void {
    const dx = SLING_POS.x - this.localPullX;
    const dy = SLING_POS.y - this.localPullY;
    const pullDist = Math.hypot(dx, dy);

    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      this.room.send('game', {
        kind: 'aim',
        pullX: SLING_POS.x,
        pullY: SLING_POS.y,
        active: false,
      });
    }

    if (pullDist < MIN_PULL_DISTANCE || dx < 0.12) {
      this.localPullX = SLING_POS.x;
      this.localPullY = SLING_POS.y;
      return;
    }

    const vx = dx * LAUNCH_VEL_SCALE;
    const vy = dy * LAUNCH_VEL_SCALE;
    const shooterId = this.getActiveScorerId();

    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      this.room.send('game', {
        kind: 'launch',
        monkeyIndex: this.monkeyIndex,
        vx,
        vy,
        pullX: this.localPullX,
        pullY: this.localPullY,
        shooterId,
      });
    }

    this.executeLaunch(this.localPullX, this.localPullY, vx, vy, shooterId);
  }

  private executeLaunch(pullX: number, pullY: number, vx: number, vy: number, shooterId: string): void {
    const kind = this.level.monkeys[this.monkeyIndex];
    if (!kind) return;

    // Record exact previous shot arc as ghost trajectory for next shot calibration
    this.lastShotGhost = this.physics.predictTrajectory(pullX, pullY, vx, vy, 28);

    this.physics.clearMonkeys();
    this.physics.launchMonkey(kind, pullX, pullY, vx, vy, shooterId);
    this.phase = 'flying';
    this.shotsUsed += 1;
    this.localShots[shooterId] = (this.localShots[shooterId] ?? 0) + 1;
    this.flightTimer = 0;
    this.settleTimer = 0;
    this.localPullX = SLING_POS.x;
    this.localPullY = SLING_POS.y;

    gameAudio.playLaunch();
    const spec = MONKEY_SPECS[kind];
    this.physics.addFloatingText(pullX, pullY + 1.0, spec.battleCry, spec.accentColor, 1.05);
  }

  private triggerLocalPower(): void {
    const target =
      this.physics.monkeys.find((m) => !m.destroyed && !m.powerUsed && !m.hasCollided) ??
      this.physics.monkeys.find((m) => !m.destroyed && !m.powerUsed && m.monkeyKind === 'bomb');
    if (!target) return;

    // Capture pre-power state BEFORE activating so peers don't double-apply velocity!
    const prePos = target.body.getPosition();
    const preVel = target.body.getLinearVelocity();
    const payload: NetMessage = {
      kind: 'power',
      monkeyId: target.id,
      x: prePos.x,
      y: prePos.y,
      vx: preVel.x,
      vy: preVel.y,
      angle: target.body.getAngle(),
    };

    const activated = this.physics.activatePower(target);
    if (!activated) return;

    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      this.room.send('game', payload);
    }
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.renderer.resize(rect.width, rect.height, dpr);
    this.baseZoom = Math.max(22, Math.min(42, rect.width / 32));
  }

  private loop(nowMs: number): void {
    const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;

    if (!this.controlsPaused) {
      this.elapsedSec += rawDt;

      this.accumulator += rawDt;
      while (this.accumulator >= FIXED_DT) {
        this.stepSimulation(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }

      this.updateCamera(rawDt);
    }

    this.renderFrame();

    requestAnimationFrame((t) => this.loop(t));
  }

  private stepSimulation(dt: number): void {
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.physics.updateEffectsOnly(dt);
      return;
    }

    this.physics.step(dt);

    if (this.introCamTimer > 0) {
      this.introCamTimer = Math.max(0, this.introCamTimer - dt);
    }

    if (this.phase === 'flying') {
      this.flightTimer += dt;
      const anyActive =
        this.physics.monkeys.some((m) => !m.destroyed) ||
        this.physics.coconuts.some((c) => !c.destroyed);
      if (!anyActive || this.flightTimer > 1.2) {
        if (this.physics.isActionSettled() || this.flightTimer > 7.5) {
          this.phase = 'settling';
          this.settleTimer = 0.45;
        }
      }
    } else if (this.phase === 'settling') {
      this.settleTimer -= dt;
      if (this.settleTimer <= 0 && (this.physics.isActionSettled() || this.settleTimer < -1.5)) {
        this.finishTurn();
      }
    }
  }

  private finishTurn(): void {
    // In Co-op Turns, Host computes next state & broadcasts authoritative snapshot
    if (this.isMpConnected() && this.mpMode === 'coop-turns' && !this.room.localPlayer.isHost) {
      this.phase = 'waiting-sync';
      return;
    }

    const enemiesLeft = this.physics.enemies.length;
    if (enemiesLeft > 0 && this.monkeyIndex + 1 < this.level.monkeys.length) {
      this.monkeyIndex += 1;

      if (this.isMpConnected() && this.mpMode === 'coop-turns' && this.players.length >= 2) {
        const idx = this.players.findIndex((p) => p.id === this.turnOwnerId);
        const nextIdx = idx >= 0 ? (idx + 1) % this.players.length : 0;
        this.turnOwnerId = this.players[nextIdx].id;
        const turnInfo = this.getCurrentTurnDisplay();
        this.ui.showTurnBanner(
          turnInfo.name,
          turnInfo.color,
          this.isMyTurn() ? 'SUA VEZ!' : 'Aguarde',
        );
        if (this.isMyTurn()) gameAudio.playTurnBell();
      } else if (!this.isMpConnected() && this.localMode === 'local-2p') {
        this.localTurnIdx = (this.localTurnIdx + 1) % 2;
        const turnInfo = this.getCurrentTurnDisplay();
        this.ui.showTurnBanner(turnInfo.name, turnInfo.color);
        gameAudio.playTurnBell();
      }

      this.phase = 'aiming';
      this.peekCastle = false;
      this.manualPanX = 0;

      if (this.isMpConnected() && this.mpMode === 'coop-turns' && this.room.localPlayer.isHost) {
        this.room.send('game', {
          kind: 'turn-sync',
          snapshot: this.physics.exportSnapshot(
            this.score,
            this.monkeyIndex,
            this.turnOwnerId,
            this.playerScores,
            'playing',
          ),
        });
      } else {
        this.sendDuelProgress('playing', 0);
      }
      return;
    }

    // Either all enemies defeated OR out of monkeys
    const won = enemiesLeft === 0;
    const unusedMonkeys = won ? Math.max(0, this.level.monkeys.length - 1 - this.monkeyIndex) : 0;
    const finalScore = this.score + unusedMonkeys * 10000;
    let stars = 0;
    if (won) {
      stars = 1;
      if (finalScore >= this.level.starThresholds[1]) stars = 2;
      if (finalScore >= this.level.starThresholds[2]) stars = 3;
    }

    if (this.isMpConnected() && this.mpMode === 'coop-turns' && this.room.localPlayer.isHost) {
      this.room.send('game', {
        kind: 'turn-sync',
        snapshot: this.physics.exportSnapshot(
          this.score,
          this.monkeyIndex,
          this.turnOwnerId,
          this.playerScores,
          won ? 'won' : 'lost',
          { finalScore, stars, unusedMonkeys },
        ),
      });
    }
    this.concludeLevel(won);
  }

  private concludeLevel(won: boolean, syncedSnapshot?: WorldSnapshot): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';

    const unusedMonkeys =
      syncedSnapshot?.unusedMonkeys ??
      (won ? Math.max(0, this.level.monkeys.length - 1 - this.monkeyIndex) : 0);
    const bonus = unusedMonkeys * 10000;
    const finalScore = syncedSnapshot?.finalScore ?? this.score + bonus;
    this.score = finalScore;

    let stars = syncedSnapshot?.stars ?? 0;
    if (won && stars === 0) {
      stars = 1;
      if (finalScore >= this.level.starThresholds[1]) stars = 2;
      if (finalScore >= this.level.starThresholds[2]) stars = 3;
    }

    this.lastResultMeta = { won, finalScore, stars, unusedMonkeys };

    if (won) {
      this.save = saveLevelResult(
        this.level.id,
        finalScore,
        stars,
        Boolean(this.level.isInfinite),
        this.infiniteWave,
      );
      this.physics.spawnConfetti(this.cam.x, 4.5, 80);
      gameAudio.playVictory();
      for (let i = 0; i < stars; i++) {
        window.setTimeout(() => gameAudio.playStar(i), 180 + i * 220);
      }
    } else {
      gameAudio.playDefeat();
    }

    this.sendDuelProgress(won ? 'won' : 'lost', stars);

    this.ui.showResult({
      won,
      level: this.level,
      score: finalScore,
      stars,
      unusedMonkeys,
      comparisons: this.buildComparisons(),
      hasNext: Boolean(this.level.isInfinite) || this.levelIndex + 1 < HANDCRAFTED_LEVELS.length,
      mpConnected: this.isMpConnected(),
      isHost: this.isHost(),
      mpMode: this.mpMode,
    });
  }

  private buildComparisons(): ComparisonEntry[] {
    if (this.isMpConnected() && this.mpMode === 'duel-score') {
      const myWon = this.lastResultMeta?.won ?? false;
      const entries: ComparisonEntry[] = [
        {
          id: this.room.localPlayer.id,
          name: `${this.room.localPlayer.name} (Você)`,
          color: this.room.localPlayer.color,
          score: this.score,
          shotsUsed: this.shotsUsed,
          stars: this.lastResultMeta?.stars ?? 0,
          statusLabel:
            this.phase === 'ended'
              ? myWon
                ? `🏆 Venceu (${'🍌'.repeat(this.lastResultMeta?.stars ?? 1)})`
                : '🐷 Derrotado'
              : 'Jogando...',
        },
      ];
      for (const r of this.remoteDuels.values()) {
        entries.push({
          id: r.playerId,
          name: r.playerName,
          color: r.playerColor,
          score: r.score,
          shotsUsed: r.shotsUsed,
          stars: r.stars,
          statusLabel:
            r.status === 'won'
              ? `🏆 Venceu (${'🍌'.repeat(Math.max(1, r.stars))})`
              : r.status === 'lost'
                ? '🐷 Derrotado'
                : `Jogando (${r.enemiesLeft} 🐷)`,
        });
      }
      entries.sort((a, b) => b.score - a.score);
      if (entries.length > 0 && entries[0].score > 0) entries[0].isWinner = true;
      return entries;
    }

    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      const entries: ComparisonEntry[] = this.players.map((p) => ({
        id: p.id,
        name: p.id === this.room.localPlayer.id ? `${p.name} (Você)` : p.name,
        color: p.color,
        score: this.playerScores[p.id] ?? 0,
        statusLabel: '🤝 Co-op de Turnos',
      }));
      entries.sort((a, b) => b.score - a.score);
      if (entries.length > 0 && entries[0].score > 0) entries[0].isWinner = true;
      return entries;
    }

    if (!this.isMpConnected() && this.localMode === 'local-2p') {
      const entries: ComparisonEntry[] = LOCAL_PLAYERS.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: this.playerScores[p.id] ?? 0,
        shotsUsed: this.localShots[p.id] ?? 0,
        statusLabel: '👥 2P Local',
      }));
      entries.sort((a, b) => b.score - a.score);
      if (entries.length > 0 && entries[0].score > entries[1]?.score) {
        entries[0].isWinner = true;
      }
      return entries;
    }

    return [];
  }

  private sendDuelProgress(status: 'playing' | 'won' | 'lost', stars: number): void {
    if (!this.isMpConnected() || this.mpMode !== 'duel-score') return;
    this.room.send('game', {
      kind: 'duel-progress',
      playerId: this.room.localPlayer.id,
      playerName: this.room.localPlayer.name,
      playerColor: this.room.localPlayer.color,
      score: this.score,
      shotsUsed: this.shotsUsed,
      enemiesLeft: this.physics.enemies.length,
      status,
      stars,
    });
  }

  private updateCamera(dt: number): void {
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.2);
    const targetZoom = Math.max(18, Math.min(54, this.baseZoom + this.manualZoomOffset));
    this.cam.zoom += (targetZoom - this.cam.zoom) * Math.min(1, dt * 8);

    // Freeze camera pan while aiming so the slingshot never drifts under the pointer!
    if (this.isDraggingSling) {
      return;
    }

    let targetX = 13.5 + this.manualPanX;
    let targetY = 3.6;

    if (this.introCamTimer > 0) {
      targetX = 19.5;
      targetY = 3.8;
    } else if (this.peekCastle) {
      targetX = 21.5;
      targetY = 4.0;
    } else if (this.phase === 'flying' || this.phase === 'settling') {
      const active = this.physics.monkeys.find((m) => !m.destroyed);
      if (active) {
        const p = active.body.getPosition();
        targetX = Math.max(10, Math.min(24.5, p.x + 2.5));
        targetY = Math.max(3.4, Math.min(8.5, p.y * 0.55 + 2.2));
      } else {
        targetX = 20.0;
      }
    }

    this.cam.x += (targetX - this.cam.x) * Math.min(1, dt * 5.2);
    this.cam.y += (targetY - this.cam.y) * Math.min(1, dt * 5.2);
  }

  private renderFrame(): void {
    const currentKind =
      this.phase === 'aiming' ? this.level.monkeys[this.monkeyIndex] ?? null : null;

    const showingRemoteAim =
      this.phase === 'aiming' && !this.isMyTurn() && this.remoteAim.active;
    const pullX = showingRemoteAim ? this.remoteAim.pullX : this.localPullX;
    const pullY = showingRemoteAim ? this.remoteAim.pullY : this.localPullY;
    const isAiming =
      this.phase === 'aiming' && (this.isDraggingSling || showingRemoteAim);

    const dx = SLING_POS.x - pullX;
    const dy = SLING_POS.y - pullY;
    const pullDist = Math.hypot(dx, dy);
    const trajectory =
      isAiming && pullDist >= MIN_PULL_DISTANCE && dx >= 0.12
        ? this.physics.predictTrajectory(
            pullX,
            pullY,
            dx * LAUNCH_VEL_SCALE,
            dy * LAUNCH_VEL_SCALE,
          )
        : [];

    const aimOwner = this.getCurrentTurnDisplay();
    const aimState: AimVisualState = {
      isAiming,
      pullX,
      pullY,
      loadedMonkey: currentKind,
      trajectory,
      ghostTrajectory: this.phase === 'aiming' ? this.lastShotGhost : undefined,
      aimerName: showingRemoteAim ? aimOwner.name : undefined,
      aimerColor:
        showingRemoteAim || (!this.isMpConnected() && this.localMode === 'local-2p')
          ? aimOwner.color
          : undefined,
    };

    const waitingQueue = this.level.monkeys.slice(this.monkeyIndex + 1);

    this.renderer.render(
      this.physics,
      this.level,
      this.cam,
      aimState,
      waitingQueue,
      this.elapsedSec,
    );

    // Update DOM HUD (diffed internally inside ui.updateHud)
    let scoreText = `🍌 ${this.score.toLocaleString('pt-BR')}`;
    if (!this.isMpConnected() && this.localMode === 'local-2p') {
      const s1 = this.playerScores[LOCAL_PLAYERS[0].id] ?? 0;
      const s2 = this.playerScores[LOCAL_PLAYERS[1].id] ?? 0;
      scoreText = `J1: ${s1.toLocaleString('pt-BR')} | J2: ${s2.toLocaleString('pt-BR')}`;
    }

    let mpStatusText = '';
    let mpColor = '';
    if (this.isMpConnected()) {
      if (this.mpMode === 'coop-turns') {
        mpColor = aimOwner.color;
        mpStatusText = this.isMyTurn()
          ? '🎯 SUA VEZ DE ATIRAR!'
          : `👀 Vez de ${aimOwner.name}...`;
      } else {
        const rivals = Array.from(this.remoteDuels.values());
        if (rivals.length > 0) {
          mpStatusText = rivals
            .map((r) => `⚔️ ${r.playerName}: ${r.score.toLocaleString('pt-BR')} (${r.enemiesLeft}🐷)`)
            .join(' | ');
        } else {
          mpStatusText = '⚔️ Duelo: aguardando rivais';
        }
      }
    } else if (this.localMode === 'local-2p') {
      mpStatusText = `👥 Vez de ${aimOwner.name}`;
      mpColor = aimOwner.color;
    }

    const activeFlying = this.physics.monkeys.find((m) => !m.destroyed);
    const cardMonkey =
      this.phase === 'aiming'
        ? currentKind
        : this.phase === 'flying' && activeFlying
          ? activeFlying.monkeyKind
          : null;
    const powerReady = this.canUseAirPower();
    const canSkip = this.canSkipTurn();

    let hintText = 'Arraste o estilingue para mirar • Arraste o fundo ou Scroll para câmera';
    let hintPower = false;

    if (this.phase === 'waiting-sync') {
      hintText = '⏳ Sincronizando turno com o Host...';
    } else if (this.phase === 'flying') {
      const flyingMonkey = this.physics.monkeys.find((m) => !m.destroyed && !m.powerUsed);
      if (flyingMonkey && this.isMyTurn()) {
        const spec = MONKEY_SPECS[flyingMonkey.monkeyKind];
        hintText = `⚡ CLIQUE NO AR ou ESPAÇO: ${spec.powerLabel.toUpperCase()}!`;
        hintPower = true;
      } else if (canSkip) {
        hintText = '💥 Macaco em ação! Aperte N ou Espaço para o próximo';
      } else {
        hintText = '💥 Macaco em voo! Segure as bananas!';
      }
    } else if (this.phase === 'settling') {
      hintText = '⏳ Calculando destruição... Aperte N para pular';
    } else if (this.phase === 'aiming' && !this.isMyTurn()) {
      hintText = `⏳ ${aimOwner.name} está mirando no estilingue...`;
    } else if (currentKind) {
      const spec = MONKEY_SPECS[currentKind];
      hintText = `🎯 ${spec.name} — Puxe o estilingue!`;
    }

    this.ui.updateHud({
      level: this.level,
      scoreText,
      enemiesLeft: this.physics.enemies.length,
      monkeyIndex: this.monkeyIndex,
      activeMonkey: cardMonkey,
      powerReady,
      canSkip,
      showTaunts: this.isMpConnected() || this.localMode === 'local-2p',
      mpStatusText,
      mpColor,
      hintText,
      hintPower,
    });
  }
}

new AngryMonkeysGame();
