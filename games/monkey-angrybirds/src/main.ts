import { mountMonkeyHud, PeerRoom, type PlayerProfile } from '@monkey-slop/sdk';
import { gameAudio } from './audio';
import {
  LAUNCH_VEL_SCALE,
  MIN_PULL_DISTANCE,
  MAX_PULL_DISTANCE,
  MONKEY_SPECS,
  MONKEY_TAUNTS,
  SLING_POS,
} from './constants';
import { generateInfiniteLevel, HANDCRAFTED_LEVELS } from './levels';
import { PhysicsWorld } from './physics';
import { type AimVisualState, type CameraState, GameRenderer } from './renderer';
import { loadProgress, saveLevelResult, type SaveData } from './storage';
import type { LevelDef, MultiplayerMode, NetMessage } from './types';
import { GameUi } from './ui';

type ShotPhase = 'aiming' | 'flying' | 'settling' | 'ended';

interface RemoteDuelState {
  playerName: string;
  score: number;
  shotsUsed: number;
  enemiesLeft: number;
  status: 'playing' | 'won' | 'lost';
  stars: number;
}

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

  private levelIndex = 0;
  private infiniteWave = 0;
  private infiniteSeed = Math.floor(Math.random() * 900000) + 100000;
  private level: LevelDef = HANDCRAFTED_LEVELS[0];

  private phase: ShotPhase = 'aiming';
  private monkeyIndex = 0;
  private score = 0;
  private shotsUsed = 0;
  private playerScores: Record<string, number> = {};
  private turnOwnerId: string | null = null;
  private settleTimer = 0;
  private flightTimer = 0;

  // Camera
  private cam: CameraState = { x: 13.5, y: 3.6, zoom: 34, shake: 0 };
  private baseZoom = 34;
  private manualZoomOffset = 0;
  private manualPanX = 0;
  private peekCastle = false;
  private introCamTimer = 0;

  // Aiming (local & remote)
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

  // Duel opponent state
  private remoteDuel: RemoteDuelState | null = null;

  private accumulator = 0;
  private lastFrameMs = performance.now();
  private elapsedSec = 0;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const app = document.getElementById('app') as HTMLElement | null;
    if (!canvas || !app) throw new Error('DOM do jogo nao encontrado');

    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);

    this.physics = new PhysicsWorld({
      onScore: (points, x, y, label, color) => {
        this.score += points;
        const owner = this.turnOwnerId || this.room.localPlayer.id;
        this.playerScores[owner] = (this.playerScores[owner] ?? 0) + points;
        this.physics.addFloatingText(x, y + 0.6, label ?? `+${points}`, color ?? '#fef08a', 1);
      },
      onShake: (amt) => {
        this.cam.shake = Math.min(1.2, Math.max(this.cam.shake, amt));
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
      onSendTaunt: () => this.sendTaunt(),
      onSelectLevel: (idx) => this.startCampaignLevel(idx, true),
      onStartInfinite: () => this.startInfiniteMode(1, true),
      onSelectMpMode: (mode) => this.setMultiplayerMode(mode),
      onNextLevel: () => this.advanceNextLevel(),
    });

    this.bindInputs();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    this.loadLevel(HANDCRAFTED_LEVELS[0]);
    this.openMenu();
    requestAnimationFrame((t) => this.loop(t));
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

  private handlePlayersChange(players: PlayerProfile[]): void {
    this.players = players;
    this.sdkHud.setPlayers(players);

    if (players.length >= 2) {
      if (this.room.localPlayer.isHost) {
        if (!this.turnOwnerId || !players.some((p) => p.id === this.turnOwnerId)) {
          this.turnOwnerId = this.room.localPlayer.id;
        }
        this.broadcastSessionConfig();
      }
    } else {
      this.turnOwnerId = this.room.localPlayer.id;
      this.remoteDuel = null;
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

  private setMultiplayerMode(mode: MultiplayerMode): void {
    if (!this.isHost()) return;
    this.mpMode = mode;
    this.remoteDuel = null;
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
        this.remoteDuel = null;
        this.ui.hideResult();
        this.ui.closeMenu();
        if (msg.infiniteWave > 0) {
          this.infiniteWave = msg.infiniteWave;
          this.loadLevel(generateInfiniteLevel(msg.infiniteWave, msg.seed));
        } else {
          this.infiniteWave = 0;
          this.levelIndex = msg.levelIndex;
          this.loadLevel(HANDCRAFTED_LEVELS[msg.levelIndex] ?? HANDCRAFTED_LEVELS[0]);
        }
        this.turnOwnerId = msg.turnOwnerId;
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
        const m = this.physics.monkeys.find((x) => !x.destroyed && !x.powerUsed) ?? this.physics.monkeys[0];
        if (m) {
          m.body.setLinearVelocity({ x: msg.vx, y: msg.vy } as never);
          this.physics.activatePower(m);
        }
        break;
      }
      case 'turn-sync': {
        if (this.mpMode !== 'coop-turns' || this.room.localPlayer.isHost) return;
        this.physics.applySnapshot(msg.snapshot);
        this.score = msg.snapshot.score;
        this.monkeyIndex = msg.snapshot.monkeyIndex;
        this.turnOwnerId = msg.snapshot.turnOwnerId;
        this.playerScores = { ...msg.snapshot.playerScores };
        if (this.phase !== 'ended') {
          this.phase = 'aiming';
          this.peekCastle = false;
          this.manualPanX = 0;
        }
        this.checkOutcomeAfterSync();
        break;
      }
      case 'duel-progress': {
        if (this.mpMode !== 'duel-score' || senderId === this.room.localPlayer.id) return;
        this.remoteDuel = {
          playerName: msg.playerName,
          score: msg.score,
          shotsUsed: msg.shotsUsed,
          enemiesLeft: msg.enemiesLeft,
          status: msg.status,
          stars: msg.stars,
        };
        if (msg.status === 'won') {
          this.sdkHud.toast(
            `${msg.playerName} venceu a fase com ${msg.score.toLocaleString('pt-BR')} pts!`,
            'chaos',
          );
        }
        break;
      }
      case 'taunt': {
        gameAudio.playPower('normal');
        this.sdkHud.toast(`${senderName}: ${msg.text}`, 'chaos');
        break;
      }
    }
  }

  private openMenu(): void {
    this.save = loadProgress();
    this.ui.openMenu(this.save, this.isMpConnected(), this.isHost(), this.mpMode);
  }

  private startCampaignLevel(index: number, broadcast: boolean): void {
    this.levelIndex = Math.max(0, Math.min(HANDCRAFTED_LEVELS.length - 1, index));
    this.infiniteWave = 0;
    this.ui.closeMenu();
    this.ui.hideResult();
    this.loadLevel(HANDCRAFTED_LEVELS[this.levelIndex]);
    if (broadcast && this.isMpConnected() && this.isHost()) {
      this.turnOwnerId = this.room.localPlayer.id;
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
    this.loadLevel(generateInfiniteLevel(this.infiniteWave, this.infiniteSeed));
    if (broadcast && this.isMpConnected() && this.isHost()) {
      this.turnOwnerId = this.room.localPlayer.id;
      this.broadcastSessionConfig();
    }
  }

  private restartCurrentLevel(broadcast: boolean): void {
    this.ui.hideResult();
    if (this.infiniteWave > 0) {
      this.startInfiniteMode(this.infiniteWave, broadcast);
    } else {
      this.startCampaignLevel(this.levelIndex, broadcast);
    }
  }

  private advanceNextLevel(): void {
    if (this.infiniteWave > 0) {
      this.startInfiniteMode(this.infiniteWave + 1, true);
    } else if (this.levelIndex + 1 < HANDCRAFTED_LEVELS.length) {
      this.startCampaignLevel(this.levelIndex + 1, true);
    } else {
      this.openMenu();
    }
  }

  private loadLevel(level: LevelDef): void {
    this.level = level;
    this.physics.loadLevel(level);
    this.phase = 'aiming';
    this.monkeyIndex = 0;
    this.score = 0;
    this.shotsUsed = 0;
    this.playerScores = {};
    this.settleTimer = 0;
    this.flightTimer = 0;
    this.isDraggingSling = false;
    this.localPullX = SLING_POS.x;
    this.localPullY = SLING_POS.y;
    this.remoteAim.active = false;
    this.remoteDuel = null;
    this.peekCastle = false;
    this.manualPanX = 0;
    this.introCamTimer = 1.15;
    this.cam.x = 20.5;
    this.cam.y = 3.8;
    if (!this.turnOwnerId) {
      this.turnOwnerId = this.room.localPlayer.id;
    }
    this.sendDuelProgress('playing', 0);
  }

  private sendTaunt(): void {
    const text = MONKEY_TAUNTS[Math.floor(Math.random() * MONKEY_TAUNTS.length)];
    gameAudio.playPower('normal');
    this.sdkHud.toast(`Você: ${text}`, 'banana');
    if (this.isMpConnected()) {
      this.room.send('game', { kind: 'taunt', text });
    }
  }

  private bindInputs(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.ui.isMenuOpen() || this.phase === 'ended') return;
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

      if (e.code === 'Space' && this.phase === 'flying' && this.isMyTurn()) {
        e.preventDefault();
        this.triggerLocalPower();
      } else if (e.key === 'r' || e.key === 'R') {
        if (!this.ui.isMenuOpen()) this.restartCurrentLevel(true);
      } else if (e.key === 'c' || e.key === 'C') {
        this.peekCastle = !this.peekCastle;
        this.manualPanX = 0;
      }
    });
  }

  private updatePullPosition(wx: number, wy: number): void {
    let dx = wx - SLING_POS.x;
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
    if (this.isMpConnected() && this.mpMode === 'coop-turns' && now - this.lastAimSendAt > 50) {
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

    if (pullDist < MIN_PULL_DISTANCE) {
      this.localPullX = SLING_POS.x;
      this.localPullY = SLING_POS.y;
      return;
    }

    const vx = dx * LAUNCH_VEL_SCALE;
    const vy = dy * LAUNCH_VEL_SCALE;

    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      this.room.send('game', {
        kind: 'launch',
        monkeyIndex: this.monkeyIndex,
        vx,
        vy,
        pullX: this.localPullX,
        pullY: this.localPullY,
        shooterId: this.room.localPlayer.id,
      });
    }

    this.executeLaunch(this.localPullX, this.localPullY, vx, vy, this.room.localPlayer.id);
  }

  private executeLaunch(pullX: number, pullY: number, vx: number, vy: number, shooterId: string): void {
    const kind = this.level.monkeys[this.monkeyIndex];
    if (!kind) return;

    this.physics.clearMonkeys();
    this.physics.launchMonkey(kind, pullX, pullY, vx, vy, shooterId);
    this.phase = 'flying';
    this.shotsUsed += 1;
    this.flightTimer = 0;
    this.settleTimer = 0;
    this.localPullX = SLING_POS.x;
    this.localPullY = SLING_POS.y;

    gameAudio.playLaunch();
    const spec = MONKEY_SPECS[kind];
    this.physics.addFloatingText(pullX, pullY + 1.0, spec.battleCry, spec.accentColor, 1.05);
  }

  private triggerLocalPower(): void {
    const activated = this.physics.activatePower();
    if (!activated) return;

    if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      const pos = activated.body.getPosition();
      const vel = activated.body.getLinearVelocity();
      this.room.send('game', {
        kind: 'power',
        monkeyId: activated.id,
        x: pos.x,
        y: pos.y,
        vx: vel.x,
        vy: vel.y,
      });
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
    this.elapsedSec += rawDt;

    this.accumulator += rawDt;
    while (this.accumulator >= FIXED_DT) {
      this.stepSimulation(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.updateCamera(rawDt);
    this.renderFrame();

    requestAnimationFrame((t) => this.loop(t));
  }

  private stepSimulation(dt: number): void {
    this.physics.step(dt);

    if (this.introCamTimer > 0) {
      this.introCamTimer = Math.max(0, this.introCamTimer - dt);
    }

    if (this.phase === 'flying') {
      this.flightTimer += dt;
      const anyActive = this.physics.monkeys.some((m) => !m.destroyed);
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
      // Guest waits briefly for host turn-sync, with fallback if host left
      this.phase = 'aiming';
      return;
    }

    const enemiesLeft = this.physics.enemies.length;
    if (enemiesLeft > 0 && this.monkeyIndex + 1 < this.level.monkeys.length) {
      this.monkeyIndex += 1;
      if (this.isMpConnected() && this.mpMode === 'coop-turns' && this.players.length >= 2) {
        const idx = this.players.findIndex((p) => p.id === this.turnOwnerId);
        const nextIdx = idx >= 0 ? (idx + 1) % this.players.length : 0;
        this.turnOwnerId = this.players[nextIdx].id;
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
          ),
        });
      } else {
        this.sendDuelProgress('playing', 0);
      }
      return;
    }

    // Either all enemies defeated OR out of monkeys
    if (this.isMpConnected() && this.mpMode === 'coop-turns' && this.room.localPlayer.isHost) {
      this.room.send('game', {
        kind: 'turn-sync',
        snapshot: this.physics.exportSnapshot(
          this.score,
          this.monkeyIndex,
          this.turnOwnerId,
          this.playerScores,
        ),
      });
    }
    this.concludeLevel(enemiesLeft === 0);
  }

  private checkOutcomeAfterSync(): void {
    const enemiesLeft = this.physics.enemies.length;
    if (enemiesLeft === 0) {
      this.concludeLevel(true);
    } else if (this.monkeyIndex >= this.level.monkeys.length) {
      this.concludeLevel(false);
    }
  }

  private concludeLevel(won: boolean): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';

    const unusedMonkeys = won ? Math.max(0, this.level.monkeys.length - 1 - this.monkeyIndex) : 0;
    const bonus = unusedMonkeys * 10000;
    const finalScore = this.score + bonus;
    this.score = finalScore;

    let stars = 0;
    if (won) {
      stars = 1;
      if (finalScore >= this.level.starThresholds[1]) stars = 2;
      if (finalScore >= this.level.starThresholds[2]) stars = 3;
      this.save = saveLevelResult(
        this.level.id,
        finalScore,
        stars,
        Boolean(this.level.isInfinite),
        this.infiniteWave,
      );
      gameAudio.playVictory();
      for (let i = 0; i < stars; i++) {
        window.setTimeout(() => gameAudio.playStar(i), 180 + i * 220);
      }
    } else {
      gameAudio.playDefeat();
    }

    this.sendDuelProgress(won ? 'won' : 'lost', stars);

    let duelSummary = '';
    if (this.isMpConnected() && this.mpMode === 'duel-score' && this.remoteDuel) {
      const rival = this.remoteDuel;
      duelSummary = `⚔️ Rival (${rival.playerName}): ${rival.score.toLocaleString('pt-BR')} pts • ${
        rival.status === 'won'
          ? `Venceu em ${rival.shotsUsed} tiros!`
          : rival.status === 'lost'
            ? 'Derrotado pelos porcos!'
            : `Jogando (${rival.enemiesLeft} inimigos restantes)`
      }`;
    } else if (this.isMpConnected() && this.mpMode === 'coop-turns') {
      const parts = this.players.map(
        (p) => `${p.name}: ${(this.playerScores[p.id] ?? 0).toLocaleString('pt-BR')} pts`,
      );
      duelSummary = `🤝 Contribuição Co-op — ${parts.join(' | ')}`;
    }

    this.ui.showResult({
      won,
      level: this.level,
      score: finalScore,
      stars,
      unusedMonkeys,
      duelSummary,
      hasNext: Boolean(this.level.isInfinite) || this.levelIndex + 1 < HANDCRAFTED_LEVELS.length,
    });
  }

  private sendDuelProgress(status: 'playing' | 'won' | 'lost', stars: number): void {
    if (!this.isMpConnected() || this.mpMode !== 'duel-score') return;
    this.room.send('game', {
      kind: 'duel-progress',
      playerId: this.room.localPlayer.id,
      playerName: this.room.localPlayer.name,
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
    } else if (this.isDraggingSling) {
      targetX = 12.0;
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
      isAiming && pullDist >= MIN_PULL_DISTANCE
        ? this.physics.predictTrajectory(
            pullX,
            pullY,
            dx * LAUNCH_VEL_SCALE,
            dy * LAUNCH_VEL_SCALE,
          )
        : [];

    const aimOwner = this.players.find((p) => p.id === this.turnOwnerId);
    const aimState: AimVisualState = {
      isAiming,
      pullX,
      pullY,
      loadedMonkey: currentKind,
      trajectory,
      aimerName: showingRemoteAim ? aimOwner?.name : undefined,
      aimerColor: aimOwner?.color,
    };

    const waitingQueue = this.level.monkeys.slice(
      this.phase === 'aiming' ? this.monkeyIndex + 1 : this.monkeyIndex + 1,
    );

    this.renderer.render(
      this.physics,
      this.level,
      this.cam,
      aimState,
      waitingQueue,
      this.elapsedSec,
    );

    // Update DOM HUD
    let mpStatusText = '';
    if (this.isMpConnected()) {
      if (this.mpMode === 'coop-turns') {
        const turnName = aimOwner?.name ?? 'Amigo';
        mpStatusText = this.isMyTurn()
          ? '🎯 SUA VEZ DE ATIRAR!'
          : `👀 Vez de ${turnName}...`;
      } else {
        mpStatusText = this.remoteDuel
          ? `⚔️ ${this.remoteDuel.playerName}: ${this.remoteDuel.score.toLocaleString('pt-BR')} pts (${this.remoteDuel.enemiesLeft} 🐷)`
          : '⚔️ Duelo: aguardando jogada do rival';
      }
    }

    let hintText = 'Arraste o estilingue para mirar • Arraste o fundo ou use Scroll para câmera';
    let hintPower = false;

    if (this.phase === 'flying') {
      const flyingMonkey = this.physics.monkeys.find((m) => !m.destroyed && !m.powerUsed);
      if (flyingMonkey && this.isMyTurn()) {
        const spec = MONKEY_SPECS[flyingMonkey.monkeyKind];
        hintText = `⚡ CLIQUE NO AR ou ESPAÇO: ${spec.powerLabel.toUpperCase()}!`;
        hintPower = true;
      } else {
        hintText = '💥 Macaco em voo! Segure as bananas!';
      }
    } else if (this.phase === 'aiming' && !this.isMyTurn()) {
      hintText = `⏳ ${aimOwner?.name ?? 'Seu amigo'} está mirando no estilingue...`;
    } else if (currentKind) {
      const spec = MONKEY_SPECS[currentKind];
      hintText = `🎯 ${spec.name} (${spec.powerLabel}) — Puxe o estilingue!`;
    }

    this.ui.updateHud({
      level: this.level,
      score: this.score,
      enemiesLeft: this.physics.enemies.length,
      monkeyIndex: this.monkeyIndex,
      mpConnected: this.isMpConnected(),
      mpMode: this.mpMode,
      mpStatusText,
      hintText,
      hintPower,
    });
  }
}

new AngryMonkeysGame();
