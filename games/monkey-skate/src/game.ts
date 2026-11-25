import { getGameScore, PeerRoom, reportGameScore, type MonkeyHudHandle } from '@monkey-slop/sdk';
import { skateAudio } from './audio-sfx';
import {
  applyRagdollWiggle,
  createEmptyRagdoll,
  spawnParticlesForHit,
  spawnRagdollFromSkater,
  stepRagdoll,
} from './ragdoll';
import { renderGame, type RenderLocalSkater } from './renderer';
import { sampleTerrain, TRACKS } from './tracks';
import type {
  FloatingCallout,
  GameMode,
  GrindRail,
  MovingCar,
  NetMessage,
  Particle,
  RagdollState,
  RemotePlayerState,
  SkaterMode,
  SkaterSnapshot,
  ThrownBanana,
  TrackData,
  TrackId,
  TrickKind,
  TurnScoreResult,
  XrayFlash,
} from './types';

const FIXED_RAGDOLL_DT = 1 / 60;
const RAGDOLL_AUTO_SETTLE_SEC = 2.2;
const RAGDOLL_MAX_SEC = 7.0;
const LOCAL_2P_DURATION = 45;
const SESSION_90_DURATION = 90;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; t: number; cx: number; cy: number; angle: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return {
    dist: Math.hypot(px - cx, py - cy),
    t,
    cx,
    cy,
    angle: Math.atan2(dy, dx),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}

export interface HudDomRefs {
  timerCard: HTMLElement;
  timerLabel: HTMLElement;
  timerVal: HTMLElement;
  trackBadge: HTMLElement;
  trickScore: HTMLElement;
  bestCombo: HTMLElement;
  boneScore: HTMLElement;
  bonesCount: HTMLElement;
  recordVal: HTMLElement;
  comboBanner: HTMLElement;
  comboPoints: HTMLElement;
  comboTricks: HTMLElement;
  local2pBanner: HTMLElement;
  raceBar: HTMLElement;
  racePct: HTMLElement;
  raceTrackLine: HTMLElement;
  tipBanner: HTMLElement;
  tipText: HTMLElement;
  tipClose: HTMLButtonElement;
  mpBoard: HTMLElement;
  mpRows: HTMLElement;
  bananaBtn: HTMLButtonElement;
  menuModal: HTMLElement;
  turnModal: HTMLElement;
  turnHeadline: HTMLElement;
  turnSub: HTMLElement;
  turnP1Tricks: HTMLElement;
  turnP1Sus: HTMLElement;
  turnP1Total: HTMLElement;
  nextTurnBtn: HTMLButtonElement;
  summaryModal: HTMLElement;
  podiumBox: HTMLElement;
  podiumRows: HTMLElement;
  sumTricks: HTMLElement;
  sumSus: HTMLElement;
  sumTotal: HTMLElement;
  summaryHeadline: HTMLElement;
  summaryDiagnosis: HTMLElement;
}

export class MonkeySkateGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private room: PeerRoom<NetMessage>;
  private hud: MonkeyHudHandle;
  private dom: HudDomRefs;

  private trackId: TrackId = 'praca';
  private track: TrackData = TRACKS.praca;
  private mode: GameMode = 'free';
  private paused = true;
  private guidePausedFromActive = false;
  private sessionRemaining = SESSION_90_DURATION;
  private countdownTimer = 0;
  private matchId = '';
  private raceElapsed = 0;
  private raceFinishTime: number | null = null;
  private finishReached = false;

  // Local 2P state
  private local2pTurn: 1 | 2 = 1;
  private local2pNames: [string, string] = ['Macaco 1', 'Macaco 2'];
  private local2pResults: [TurnScoreResult | null, TurnScoreResult | null] = [null, null];

  // Skater state
  private skaterMode: SkaterMode = 'skating';
  private x = 620;
  private y = 260;
  private vx = 0;
  private vy = 0;
  private angle = 0;
  private facing: 1 | -1 = 1;
  private crouching = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpHoldTimer = 0;
  private launchCooldown = 0;
  private railRegrabCooldown = 0;
  private invulnTimer = 0;

  private activeTrick: TrickKind = 'none';
  private trickTimer = 0;
  private trickCooldown = 0;
  private boardFlip = 0;
  private flipAccum = 0;
  private turboTimer = 0;
  private bananaThrowCooldown = 0;
  private selfBananaGrace = 0;

  // Grind & Manual state
  private currentRail: GrindRail | null = null;
  private grindBalance = 0;
  private grindDrift = 0;
  private grindGraceTimer = 0;
  private grindTickTimer = 0;

  private manualBalance = 0;
  private manualDrift = 0;
  private manualElapsed = 0;
  private manualReleaseTimer = 0;
  private manualTickTimer = 0;

  // Combo & Score state
  private comboPoints = 0;
  private comboMult = 1;
  private comboTrickNames: string[] = [];
  private comboUsedTricks = new Set<string>();
  private comboClearedProps = new Set<string>();
  private trickScore = 0;
  private boneScore = 0;
  private bonesBroken = 0;
  private bestCombo = 0;
  private bestCrash = 0;
  private allTimeRecord = 0;

  // First-run tip progression
  private tipsDismissed = false;
  private tipStep = 0; // 0=jump, 1=trick, 2=manual/grind, 3=eject, 4=done
  private tipAutoHideTimer = 0;

  // Ragdoll & FX
  private ragdoll: RagdollState = createEmptyRagdoll();
  private ragdollAccum = 0;
  private particles: Particle[] = [];
  private callouts: FloatingCallout[] = [];
  private xrays: XrayFlash[] = [];
  private cars: MovingCar[] = [];
  private thrownBananas: ThrownBanana[] = [];

  // Camera
  private camX = 620;
  private camY = 200;
  private camZoom = 1;
  private shakeMag = 0;
  private time = 0;
  private lastFrame = 0;
  private netSyncTimer = 0;
  private lastMpBoardHtml = '';
  private lastRaceBarHtml = '';

  // Input
  private keys = new Set<string>();
  private remotes = new Map<string, RemotePlayerState>();
  private remoteRaceFinishes = new Map<string, { name: string; color: string; finishTime: number; totalScore: number }>();

  constructor(
    canvas: HTMLCanvasElement,
    room: PeerRoom<NetMessage>,
    hud: MonkeyHudHandle,
    dom: HudDomRefs,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível');
    this.ctx = context;
    this.room = room;
    this.hud = hud;
    this.dom = dom;

    this.allTimeRecord = getGameScore('monkey-skate').bestScore;
    this.dom.recordVal.textContent = this.allTimeRecord.toLocaleString('pt-BR');

    this.dom.tipClose.onclick = () => {
      this.tipsDismissed = true;
      this.dom.tipBanner.classList.remove('visible');
    };

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.loadTrack('praca', 'free', false);
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  public startSession(
    trackId: TrackId,
    mode: GameMode,
    local2pNames?: [string, string],
    fromNetworkMatch = false,
  ): void {
    const resolvedTrack: TrackId = mode === 'race' ? 'ladeira' : trackId;
    if (local2pNames) {
      this.local2pNames = [
        local2pNames[0].trim() || 'Macaco 1',
        local2pNames[1].trim() || 'Macaco 2',
      ];
    }

    const players = this.room.getPlayers();
    const isOnlineTimedMatch =
      !fromNetworkMatch &&
      players.length > 1 &&
      (mode === 'session90' || mode === 'race');

    if (isOnlineTimedMatch) {
      this.matchId = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      this.countdownTimer = 2.7;
      this.room.send('match_start', {
        kind: 'match_start',
        matchId: this.matchId,
        trackId: resolvedTrack,
        mode: mode === 'race' ? 'race' : 'session90',
        countdownMs: 2700,
      });
      this.hud.toast(
        mode === 'race'
          ? '🏁 Corrida Ladeira Abaixo iniciada pra toda sala!'
          : '⏱️ Duelo 90s iniciado pra toda sala!',
        'banana',
      );
    } else if (!fromNetworkMatch) {
      this.matchId = '';
      this.countdownTimer = mode === 'race' ? 2.2 : 0;
    }

    if (mode === 'local2p') {
      this.local2pTurn = 1;
      this.local2pResults = [null, null];
      this.countdownTimer = 0;
    }

    this.paused = false;
    this.dom.menuModal.classList.add('hidden');
    this.dom.turnModal.classList.add('hidden');
    this.dom.summaryModal.classList.add('hidden');
    this.remoteRaceFinishes.clear();

    this.loadTrack(resolvedTrack, mode, true);
    skateAudio.playOllie(0.9);
  }

  public startLocal2PSecondTurn(): void {
    if (this.mode !== 'local2p') return;
    this.local2pTurn = 2;
    this.paused = false;
    this.dom.turnModal.classList.add('hidden');
    this.loadTrack(this.trackId, 'local2p', true);
    skateAudio.playOllie(0.9);
  }

  public openMenu(): void {
    this.paused = true;
    this.dom.turnModal.classList.add('hidden');
    this.dom.summaryModal.classList.add('hidden');
    this.dom.menuModal.classList.remove('hidden');
  }

  public setGuideOpen(open: boolean): void {
    if (open) {
      if (!this.paused) {
        this.guidePausedFromActive = true;
        this.paused = true;
        this.keys.clear();
      }
    } else if (this.guidePausedFromActive) {
      this.guidePausedFromActive = false;
      const anyModalOpen =
        !this.dom.menuModal.classList.contains('hidden') ||
        !this.dom.turnModal.classList.contains('hidden') ||
        !this.dom.summaryModal.classList.contains('hidden');
      if (!anyModalOpen) {
        this.paused = false;
      }
    }
  }

  public handlePeerMessage(senderId: string, senderName: string, msg: NetMessage): void {
    if (senderId === this.room.localPlayer.id) return;

    if (msg.kind === 'state') {
      const rosterPlayer = this.room.getPlayers().find((p) => p.id === senderId);
      const existing = this.remotes.get(senderId);
      const snappedSameTrack = existing && existing.snap.trackId === msg.snap.trackId;
      this.remotes.set(senderId, {
        id: senderId,
        name: rosterPlayer?.name ?? senderName,
        color: rosterPlayer?.color ?? '#38bdf8',
        snap: msg.snap,
        renderX: snappedSameTrack ? existing.renderX : msg.snap.x,
        renderY: snappedSameTrack ? existing.renderY : msg.snap.y,
        renderAngle: snappedSameTrack ? existing.renderAngle : msg.snap.angle,
        lastSeen: performance.now(),
      });
    } else if (msg.kind === 'banana') {
      if (msg.trackId !== this.trackId) return;
      this.thrownBananas.push({
        id: msg.id,
        ownerId: senderId,
        ownerName: senderName,
        x: msg.x,
        y: msg.y,
        ttl: 18,
      });
      this.hud.toast(`🍌 ${senderName} jogou uma casca de banana na pista!`, 'chaos');
    } else if (msg.kind === 'banana_hit') {
      const idx = this.thrownBananas.findIndex((b) => b.id === msg.id);
      if (idx >= 0) this.thrownBananas.splice(idx, 1);
    } else if (msg.kind === 'callout') {
      this.hud.toast(msg.text, msg.tone);
    } else if (msg.kind === 'match_start') {
      this.matchId = msg.matchId;
      this.countdownTimer = msg.countdownMs / 1000;
      this.hud.toast(`🚀 ${senderName} iniciou a partida da sala!`, 'banana');
      this.startSession(msg.trackId, msg.mode, undefined, true);
    } else if (msg.kind === 'race_finish') {
      if (msg.matchId !== this.matchId) return;
      const rosterPlayer = this.room.getPlayers().find((p) => p.id === senderId);
      this.remoteRaceFinishes.set(senderId, {
        name: rosterPlayer?.name ?? senderName,
        color: rosterPlayer?.color ?? '#38bdf8',
        finishTime: msg.finishTime,
        totalScore: msg.totalScore,
      });
      this.hud.toast(`🏁 ${senderName} cruzou o Fim do Morro em ${msg.finishTime.toFixed(1)}s!`, 'info');
    }
  }

  public syncRoster(): void {
    const activeIds = new Set(this.room.getPlayers().map((p) => p.id));
    for (const id of this.remotes.keys()) {
      if (!activeIds.has(id)) this.remotes.delete(id);
    }
    this.dom.mpBoard.classList.toggle('visible', this.room.getPlayers().length > 1);
  }

  public throwBananaPeel(): void {
    if (this.paused || this.bananaThrowCooldown > 0 || this.countdownTimer > 0) return;
    this.bananaThrowCooldown = 5;
    this.selfBananaGrace = 1.4;

    const dropX = Math.max(40, Math.min(this.track.width - 40, this.x - this.facing * 26));
    const groundY = sampleTerrain(this.track.terrain, dropX).y;
    const id = `ban-${Math.random().toString(36).slice(2, 8)}`;

    this.thrownBananas.push({
      id,
      ownerId: this.room.localPlayer.id,
      ownerName: this.room.localPlayer.name,
      x: dropX,
      y: groundY,
      ttl: 18,
    });

    this.addCallout(dropX, groundY - 30, '🍌 CASCA ARMADA!', '#fde047', 1.05);
    skateAudio.playTurboBanana();

    if (this.room.getPlayers().length > 1) {
      this.room.send('banana', {
        kind: 'banana',
        id,
        x: dropX,
        y: groundY,
        trackId: this.trackId,
      });
    }
  }

  public triggerEject(): void {
    if (this.paused || this.countdownTimer > 0) return;
    if (this.skaterMode === 'ragdoll') {
      applyRagdollWiggle(this.ragdoll);
      skateAudio.playBoneCrunch(8);
      return;
    }
    if (this.tipStep === 3) this.advanceTip(4);
    this.enterRagdoll(true, 'EJEÇÃO HALL OF MEAT! 💀');
  }

  public resetSkater(atSpawn = false, autoReason?: string): void {
    if (this.skaterMode === 'ragdoll' && this.ragdoll.currentCrashScore > this.bestCrash) {
      this.bestCrash = this.ragdoll.currentCrashScore;
    }
    const targetX = atSpawn
      ? this.track.spawnX
      : Math.max(80, Math.min(this.track.width - 80, this.ragdoll.active && this.ragdoll.nodes[1] ? this.ragdoll.nodes[1].x : this.x));
    const g = sampleTerrain(this.track.terrain, targetX);
    this.skaterMode = 'skating';
    this.x = targetX;
    this.y = g.y;
    this.vx = atSpawn ? 140 : Math.max(-200, Math.min(200, this.vx * 0.25));
    this.vy = 0;
    this.angle = g.angle;
    this.crouching = false;
    this.coyoteTimer = 0.12;
    this.jumpBufferTimer = 0;
    this.jumpHoldTimer = 0;
    this.activeTrick = 'none';
    this.trickTimer = 0;
    this.boardFlip = 0;
    this.flipAccum = 0;
    this.currentRail = null;
    this.ragdoll = createEmptyRagdoll();
    this.ragdollAccum = 0;
    this.invulnTimer = atSpawn ? 0 : 0.9;
    this.clearCombo();
    if (atSpawn) {
      this.finishReached = false;
    }
    if (autoReason) {
      this.addCallout(this.x, this.y - 75, autoReason, '#4ade80', 1.1);
    }
  }

  private loadTrack(trackId: TrackId, mode: GameMode, resetScores: boolean): void {
    this.trackId = trackId;
    this.track = TRACKS[trackId];
    this.mode = mode;
    this.sessionRemaining = mode === 'local2p' ? LOCAL_2P_DURATION : SESSION_90_DURATION;
    this.raceElapsed = 0;
    this.raceFinishTime = null;
    this.finishReached = false;
    this.thrownBananas = [];
    this.particles = [];
    this.callouts = [];
    this.xrays = [];

    for (const pad of this.track.turboBananas) {
      pad.cooldown = 0;
    }

    if (resetScores) {
      this.trickScore = 0;
      this.boneScore = 0;
      this.bonesBroken = 0;
      this.bestCombo = 0;
      this.bestCrash = 0;
    }

    const showTimer = mode === 'session90' || mode === 'local2p' || mode === 'race';
    this.dom.timerCard.style.display = showTimer ? 'block' : 'none';
    this.dom.timerLabel.textContent =
      mode === 'local2p'
        ? `Turno ${this.local2pTurn}/2`
        : mode === 'race'
          ? 'Corrida'
          : 'Sessão 90s';
    this.dom.trackBadge.textContent = this.track.shortName;
    this.dom.local2pBanner.classList.toggle('visible', mode === 'local2p');
    if (mode === 'local2p') {
      const pName = this.local2pTurn === 1 ? this.local2pNames[0] : this.local2pNames[1];
      this.dom.local2pBanner.textContent = `👤 Turno ${this.local2pTurn}/2: ${pName}`;
    }
    this.dom.raceBar.classList.toggle('visible', mode === 'race');

    this.setupTraffic();
    this.resetSkater(true);
    this.camX = this.x;
    this.camY = this.y - 60;
    this.refreshTipBanner();
    this.updateHudDom();
  }

  private setupTraffic(): void {
    this.cars = [];
    if (!this.track.hasTraffic) return;
    const carColors = ['#ef4444', '#38bdf8', '#facc15', '#4ade80'];
    const xs = [1900, 4400, 7100, 9900];
    xs.forEach((cx, i) => {
      const dir: 1 | -1 = i % 2 === 0 ? -1 : 1;
      const g = sampleTerrain(this.track.terrain, cx);
      this.cars.push({
        id: `car-${i}`,
        x: cx,
        y: g.y,
        vx: dir * (210 + i * 25),
        width: 145,
        height: 52,
        color: carColors[i % carColors.length],
        dir,
        honkCooldown: 0,
      });
    });
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private isJumpKey(code: string): boolean {
    return code === 'Space' || code === 'KeyW' || code === 'ArrowUp';
  }

  private isAnyJumpHeld(): boolean {
    return this.keys.has('Space') || this.keys.has('KeyW') || this.keys.has('ArrowUp');
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const code = e.code;

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }

      if (this.paused) return;

      if (!e.repeat && this.isJumpKey(code)) {
        if (this.skaterMode === 'ragdoll') {
          this.resetSkater(false, 'DE PÉ NA MARRA! 🛹');
          return;
        }
        if (this.countdownTimer <= 0) {
          this.jumpBufferTimer = 0.14;
        }
      }

      if (!e.repeat && this.countdownTimer <= 0) {
        if (code === 'KeyJ') this.tryAirTrick('kickflip');
        else if (code === 'KeyK') this.tryAirTrick('bananagrab');
        else if (code === 'KeyL') this.tryAirTrick('christair');
        else if (code === 'KeyX') this.triggerEject();
        else if (code === 'KeyR') this.resetSkater(false, 'DE PÉ NO SKATE! 🛹');
        else if (code === 'KeyB') this.throwBananaPeel();
      }

      this.keys.add(code);
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      this.keys.delete(code);

      if (this.isJumpKey(code) && !this.isAnyJumpHeld()) {
        if (this.skaterMode === 'air' && this.jumpHoldTimer > 0 && this.vy < -230) {
          this.vy *= 0.68;
        }
        this.jumpHoldTimer = 0;
      }
    });
  }

  private loop(now: number): void {
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = Math.min(0.035, Math.max(0.001, rawDt));

    if (!this.paused) {
      if (this.countdownTimer > 0) {
        this.countdownTimer = Math.max(0, this.countdownTimer - dt);
      } else {
        if (this.skaterMode === 'ragdoll') {
          // Run ragdoll strictly at fixed 1/60s to match Verlet spawn velocities!
          this.ragdollAccum = Math.min(0.1, this.ragdollAccum + dt);
          while (this.ragdollAccum >= FIXED_RAGDOLL_DT) {
            this.stepRagdollFixed(FIXED_RAGDOLL_DT);
            this.ragdollAccum -= FIXED_RAGDOLL_DT;
            if (this.skaterMode !== 'ragdoll') break;
          }
          this.stepTrafficAndPads(dt);
        } else {
          // Substep skate physics cleanly at <= 1/120s
          const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
          const subDt = dt / steps;
          for (let i = 0; i < steps; i++) {
            this.stepPhysics(subDt);
            if ((this.skaterMode as SkaterMode) === 'ragdoll') break;
          }
        }
        this.stepSessionTimer(dt);
      }

      this.stepEffects(dt);
      this.stepCamera(dt);
      this.stepNetwork(dt);
      this.updateHudDom();
    }

    this.time += dt;
    const shakeX = (Math.random() - 0.5) * this.shakeMag;
    const shakeY = (Math.random() - 0.5) * this.shakeMag;

    let displayName = '';
    let displayColor = '#facc15';
    if (this.mode === 'local2p') {
      displayName = this.local2pTurn === 1 ? this.local2pNames[0] : this.local2pNames[1];
      displayColor = this.local2pTurn === 1 ? '#facc15' : '#4ade80';
    } else if (this.room.getPlayers().length > 1) {
      displayName = this.room.localPlayer.name;
      displayColor = this.room.localPlayer.color;
    }

    let recoverIn: number | null = null;
    if (this.skaterMode === 'ragdoll' && this.ragdoll.active) {
      const bySettle = Math.max(0, RAGDOLL_AUTO_SETTLE_SEC - this.ragdoll.settleTime);
      const byMax = Math.max(0, RAGDOLL_MAX_SEC - this.ragdoll.elapsed);
      recoverIn = Math.min(bySettle, byMax);
    }

    let countdownText: string | null = null;
    if (this.countdownTimer > 0.4) {
      countdownText = String(Math.ceil(this.countdownTimer - 0.4));
    } else if (this.countdownTimer > 0) {
      countdownText = 'DROPOU! 🔥';
    }

    const localRender: RenderLocalSkater = {
      name: displayName,
      color: displayColor,
      mode: this.skaterMode,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      facing: this.facing,
      crouching: this.crouching,
      activeTrick: this.activeTrick,
      trickTimer: this.trickTimer,
      boardFlip: this.boardFlip,
      grindBalance: this.grindBalance,
      manualBalance: this.manualBalance,
      turboTimer: this.turboTimer,
      invulnTimer: this.invulnTimer,
      ragdollRecoverIn: recoverIn,
      ragdoll: this.ragdoll,
    };

    renderGame(this.ctx, window.innerWidth, window.innerHeight, {
      track: this.track,
      camX: this.camX,
      camY: this.camY,
      camZoom: this.camZoom,
      shakeX,
      shakeY,
      time: this.time,
      countdownText,
      local: localRender,
      remotes: Array.from(this.remotes.values()),
      cars: this.cars,
      thrownBananas: this.thrownBananas,
      particles: this.particles,
      callouts: this.callouts,
      xrays: this.xrays,
    });

    requestAnimationFrame((t) => this.loop(t));
  }

  private stepTrafficAndPads(dt: number): void {
    for (const pad of this.track.turboBananas) {
      if (pad.cooldown > 0) pad.cooldown = Math.max(0, pad.cooldown - dt);
    }
    for (const car of this.cars) {
      car.x += car.vx * dt;
      if (car.honkCooldown > 0) car.honkCooldown -= dt;
      if (car.x < 900) {
        car.x = 900;
        car.dir = 1;
        car.vx = Math.abs(car.vx);
      } else if (car.x > this.track.width - 2100) {
        car.x = this.track.width - 2100;
        car.dir = -1;
        car.vx = -Math.abs(car.vx);
      }
      car.y = sampleTerrain(this.track.terrain, car.x).y;

      if (Math.abs(car.x - this.x) < 280 && car.honkCooldown <= 0) {
        car.honkCooldown = 4.5;
        skateAudio.playHonk();
      }
    }
  }

  private stepRagdollFixed(dt: number): void {
    stepRagdoll(this.ragdoll, this.track, this.cars, dt, (ev) => {
      this.boneScore += ev.points;
      this.bonesBroken += ev.bones;
      if (this.ragdoll.currentCrashScore > this.bestCrash) {
        this.bestCrash = this.ragdoll.currentCrashScore;
      }
      this.shakeMag = Math.min(20, Math.max(this.shakeMag, ev.intensity * 0.9));
      skateAudio.playBoneCrunch(ev.intensity);
      spawnParticlesForHit(this.particles, this.callouts, this.xrays, ev);
      this.checkRecordUpdate();
    });

    if (this.ragdoll.nodes[1]) {
      this.x = this.ragdoll.nodes[1].x;
      this.y = this.ragdoll.nodes[1].y;
    }

    if (
      this.ragdoll.settleTime >= RAGDOLL_AUTO_SETTLE_SEC ||
      this.ragdoll.elapsed >= RAGDOLL_MAX_SEC
    ) {
      this.resetSkater(false, 'LEVANTANDO SOZINHO! 🐒');
    }
  }

  private stepPhysics(dt: number): void {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const downHeld = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const dirInput = (right ? 1 : 0) - (left ? 1 : 0);

    if (this.coyoteTimer > 0) this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    if (this.launchCooldown > 0) this.launchCooldown = Math.max(0, this.launchCooldown - dt);
    if (this.railRegrabCooldown > 0) this.railRegrabCooldown = Math.max(0, this.railRegrabCooldown - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.trickCooldown > 0) this.trickCooldown = Math.max(0, this.trickCooldown - dt);
    if (this.turboTimer > 0) this.turboTimer = Math.max(0, this.turboTimer - dt);
    if (this.selfBananaGrace > 0) this.selfBananaGrace = Math.max(0, this.selfBananaGrace - dt);

    if (this.trickTimer > 0) {
      this.trickTimer -= dt;
      if (this.activeTrick === 'kickflip') {
        this.boardFlip += 24 * dt;
      }
      if (this.trickTimer <= 0) {
        this.activeTrick = 'none';
        this.boardFlip = 0;
      }
    }

    this.stepTrafficAndPads(dt);

    // Buffered instant Ollie check!
    if (
      this.jumpBufferTimer > 0 &&
      (this.skaterMode === 'skating' ||
        this.skaterMode === 'manual' ||
        this.skaterMode === 'grinding' ||
        this.coyoteTimer > 0)
    ) {
      this.performOllie(downHeld);
      return;
    }

    if (this.skaterMode === 'skating') {
      this.stepSkating(dt, dirInput, downHeld);
    } else if (this.skaterMode === 'manual') {
      this.stepManual(dt, dirInput, downHeld);
    } else if (this.skaterMode === 'grinding') {
      this.stepGrinding(dt, dirInput);
    } else if (this.skaterMode === 'air') {
      this.stepAir(dt, dirInput);
    }

    if (this.skaterMode !== 'ragdoll') {
      this.checkPickupsAndHazards();
    }
  }

  private stepSkating(dt: number, dirInput: number, downHeld: boolean): void {
    const g = sampleTerrain(this.track.terrain, this.x);
    this.coyoteTimer = 0.14;
    this.crouching = downHeld;

    const tx = Math.cos(g.angle);
    const ty = Math.sin(g.angle);
    let speedAlong = this.vx * tx + this.vy * ty;

    // Gravity along slope + responsive push + crouch pump on downslopes
    const pumpBonus = downHeld && Math.sin(g.angle) * (speedAlong >= 0 ? 1 : -1) > 0.08 ? 1.18 : 1;
    const gravityAccel = 1320 * Math.sin(g.angle) * pumpBonus;
    const pushAccel = dirInput * (this.turboTimer > 0 ? 1220 : 880);
    speedAlong += (gravityAccel + pushAccel) * dt;

    // Gentle rolling drag
    speedAlong *= Math.pow(0.988, dt * 60);
    const maxSpd = this.turboTimer > 0 ? 1480 : 1180;
    speedAlong = Math.max(-maxSpd, Math.min(maxSpd, speedAlong));

    if (dirInput !== 0) {
      this.facing = dirInput > 0 ? 1 : -1;
    } else if (Math.abs(speedAlong) > 35) {
      this.facing = speedAlong > 0 ? 1 : -1;
    }

    this.vx = tx * speedAlong;
    this.vy = ty * speedAlong;

    const prevX = this.x;
    const prevY = this.y;
    const prevAngle = g.angle;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 1. Check explicit quarter-pipe / ramp launch lips
    if (this.launchCooldown <= 0 && this.checkLaunchLips(prevX, prevY, speedAlong)) {
      return;
    }

    // 2. World edge handling
    if (this.handleGroundEdges()) return;

    const nextG = sampleTerrain(this.track.terrain, this.x);
    const dx = Math.abs(this.x - prevX);
    const dir = speedAlong >= 0 ? 1 : -1;
    // Curvature in direction of travel (>0 means terrain drops away beneath the board!)
    const dAngleDs = dx > 0.05 ? (dir * wrapAngle(nextG.angle - prevAngle)) / dx : 0;

    // 3. Natural centrifugal ramp launch in EITHER direction (never teleports down!)
    if (
      this.launchCooldown <= 0 &&
      dAngleDs > 0.0022 &&
      Math.abs(speedAlong) > 290 &&
      speedAlong * speedAlong * dAngleDs > 1280 * Math.max(0.25, Math.cos(prevAngle))
    ) {
      this.skaterMode = 'air';
      this.y = prevY - 3;
      this.angle = prevAngle;
      this.launchCooldown = 0.22;
      this.coyoteTimer = 0;
      return;
    }

    this.y = nextG.y;
    this.angle = this.angle + wrapAngle(nextG.angle - this.angle) * Math.min(1, dt * 24);
    this.checkDownhillFinish();
  }

  private stepManual(dt: number, dirInput: number, downHeld: boolean): void {
    const g = sampleTerrain(this.track.terrain, this.x);
    this.coyoteTimer = 0.14;
    this.crouching = false;
    this.manualElapsed += dt;
    this.manualTickTimer += dt;

    const tx = Math.cos(g.angle);
    const ty = Math.sin(g.angle);
    let speedAlong = this.vx * tx + this.vy * ty;

    const gravityAccel = 1320 * Math.sin(g.angle);
    const pushAccel = dirInput * (this.turboTimer > 0 ? 1150 : 820);
    speedAlong += (gravityAccel + pushAccel) * dt;
    speedAlong *= Math.pow(0.99, dt * 60);
    const maxSpd = this.turboTimer > 0 ? 1450 : 1140;
    speedAlong = Math.max(-maxSpd, Math.min(maxSpd, speedAlong));

    if (dirInput !== 0) {
      this.facing = dirInput > 0 ? 1 : -1;
    } else if (Math.abs(speedAlong) > 35) {
      this.facing = speedAlong > 0 ? 1 : -1;
    }

    this.vx = tx * speedAlong;
    this.vy = ty * speedAlong;

    const prevX = this.x;
    const prevY = this.y;
    const prevAngle = g.angle;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.launchCooldown <= 0 && this.checkLaunchLips(prevX, prevY, speedAlong)) {
      return;
    }
    if (this.handleGroundEdges()) return;

    const nextG = sampleTerrain(this.track.terrain, this.x);
    const dx = Math.abs(this.x - prevX);
    const dir = speedAlong >= 0 ? 1 : -1;
    const dAngleDs = dx > 0.05 ? (dir * wrapAngle(nextG.angle - prevAngle)) / dx : 0;

    if (
      this.launchCooldown <= 0 &&
      dAngleDs > 0.0022 &&
      Math.abs(speedAlong) > 290 &&
      speedAlong * speedAlong * dAngleDs > 1280 * Math.max(0.25, Math.cos(prevAngle))
    ) {
      this.skaterMode = 'air';
      this.y = prevY - 3;
      this.angle = prevAngle;
      this.launchCooldown = 0.22;
      this.coyoteTimer = 0;
      return;
    }

    this.y = nextG.y;
    this.angle = this.angle + wrapAngle(nextG.angle - this.angle) * Math.min(1, dt * 24);
    this.checkDownhillFinish();

    // Manual balance: smooth, fun, never fights A/D steering!
    // Releasing S sets all 4 wheels down cleanly and banks the combo!
    if (!downHeld) {
      this.manualReleaseTimer += dt;
      if (this.manualReleaseTimer >= 0.16 || Math.abs(speedAlong) < 40) {
        this.skaterMode = 'skating';
        this.bankCombo();
        return;
      }
    } else {
      this.manualReleaseTimer = 0;
    }

    const qHeld = this.keys.has('KeyQ');
    const eHeld = this.keys.has('KeyE');
    const nudge = (eHeld ? 1 : 0) - (qHeld ? 1 : 0);

    const sway = Math.sin(this.time * 3.1) * 0.28 + this.manualDrift;
    // Gentle drift only grows noticeably after 2.2s so linking ramps feels awesome
    const difficultyScale = this.manualElapsed > 2.2 ? 1.15 : 0.45;
    this.manualBalance += (sway * difficultyScale + nudge * 1.4) * dt;
    if (this.manualElapsed < 2.2) {
      this.manualBalance = Math.max(-0.68, Math.min(0.68, this.manualBalance));
    }

    if (Math.abs(this.manualBalance) > 1.08) {
      this.clearCombo(true);
      this.enterRagdoll(false, 'CAPOTOU NO MANUAL! 💀');
      return;
    }

    if (this.manualTickTimer >= 0.22) {
      this.manualTickTimer = 0;
      this.comboPoints += 20;
    }
  }

  private checkLaunchLips(prevX: number, prevY: number, speedAlong: number): boolean {
    const absSpd = Math.abs(speedAlong);
    for (const lip of this.track.launchLips) {
      const crossed =
        (prevX <= lip.x && this.x >= lip.x) ||
        (prevX >= lip.x && this.x <= lip.x) ||
        Math.abs(this.x - lip.x) < lip.tolerance * 0.4;
      if (!crossed || absSpd < lip.minSpeed) continue;
      if (lip.direction === 'left' && this.vx >= -20) continue;
      if (lip.direction === 'right' && this.vx <= 20) continue;

      this.skaterMode = 'air';
      this.y = prevY - 4;
      this.coyoteTimer = 0;
      this.launchCooldown = 0.28;
      this.vy = Math.min(this.vy, lip.vy);
      if (lip.vxOverride !== undefined) {
        this.vx = lip.vxOverride;
        this.facing = lip.vxOverride >= 0 ? 1 : -1;
      } else if (lip.vxBoost !== undefined) {
        this.vx += lip.vxBoost;
      }
      skateAudio.playOllie(0.95);
      if (lip.label) {
        this.addCallout(this.x, this.y - 70, lip.label, '#38bdf8', 1.15);
      }
      return true;
    }
    return false;
  }

  private handleGroundEdges(): boolean {
    const minX = this.track.terrain[0]?.x ?? 0;
    const maxX = this.track.terrain[this.track.terrain.length - 1]?.x ?? this.track.width;
    if (this.x < minX + 18) {
      this.x = minX + 18;
      this.vx = Math.abs(this.vx) * 0.65;
    } else if (this.x > maxX - 18) {
      if (this.track.loopMode === 'downhill') {
        this.bankCombo();
        this.addCallout(this.x, this.y - 60, '🏁 MORRO COMPLETADO! +1000', '#4ade80', 1.35);
        this.trickScore += 1000;
        skateAudio.playComboBank(4);
        this.resetSkater(true);
        return true;
      }
      this.x = maxX - 18;
      this.vx = -Math.abs(this.vx) * 0.65;
    }
    return false;
  }

  private checkDownhillFinish(): void {
    if (this.track.finishX && !this.finishReached && this.x >= this.track.finishX) {
      this.finishReached = true;
      this.bankCombo();
      this.addCallout(this.x, this.y - 80, '🏁 DESCEU O MORRO INTEIRO!', '#fde047', 1.3);

      if (this.mode === 'race' && this.raceFinishTime === null) {
        this.raceFinishTime = this.raceElapsed;
        const speedBonus = Math.max(500, Math.round((90 - Math.min(85, this.raceFinishTime)) * 80));
        this.trickScore += speedBonus;
        this.addCallout(this.x, this.y - 115, `⏱️ ${this.raceFinishTime.toFixed(1)}s (+${speedBonus})`, '#4ade80', 1.25);

        if (this.room.getPlayers().length > 1 && this.matchId) {
          this.room.send('race_finish', {
            kind: 'race_finish',
            matchId: this.matchId,
            finishTime: this.raceFinishTime,
            totalScore: this.trickScore + this.boneScore,
          });
        }
        this.finishSession();
      }
    }
  }

  private stepAir(dt: number, dirInput: number): void {
    this.crouching = false;

    // Variable jump height lift while Space/W/Up held on ascent
    if (this.jumpHoldTimer > 0 && this.isAnyJumpHeld() && this.vy < 0) {
      this.vy -= 760 * dt;
      this.jumpHoldTimer = Math.max(0, this.jumpHoldTimer - dt);
    }

    this.vy += 1340 * dt;
    this.vx += dirInput * 420 * dt;
    this.vx = Math.max(-1400, Math.min(1400, this.vx));
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (dirInput !== 0) {
      this.facing = dirInput > 0 ? 1 : -1;
    }

    // Intentional flips: Q (backflip), E (frontflip), or Shift + A/D!
    const qHeld = this.keys.has('KeyQ');
    const eHeld = this.keys.has('KeyE');
    const shiftHeld = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    let flipDir = 0;
    if (eHeld && !qHeld) flipDir = this.facing;
    else if (qHeld && !eHeld) flipDir = -this.facing;
    else if (shiftHeld && dirInput !== 0) flipDir = dirInput;

    if (flipDir !== 0) {
      const flipRate = this.activeTrick === 'bananagrab' ? 8.2 : 6.8;
      const rotDelta = flipDir * flipRate * dt;
      this.angle += rotDelta;
      this.flipAccum += rotDelta;

      if (Math.abs(this.flipAccum) >= Math.PI * 1.82) {
        const isFront =
          (this.flipAccum > 0 && this.facing === 1) ||
          (this.flipAccum < 0 && this.facing === -1);
        this.flipAccum = 0;
        this.registerTrick(isFront ? 'Frontflip' : 'Backflip', 400);
        skateAudio.playTrick('kickflip');
      }
    } else {
      // Smart auto-leveling when player isn't actively spinning!
      const gPreview = sampleTerrain(this.track.terrain, this.x);
      const heightAboveGround = Math.max(0, gPreview.y - this.y);
      const targetAngle = heightAboveGround < 210 ? gPreview.angle : 0;
      const rate = heightAboveGround < 120 ? 15 : 6.5;
      this.angle = this.angle + wrapAngle(targetAngle - this.angle) * Math.min(1, dt * rate);
      this.flipAccum *= Math.pow(0.9, dt * 60);
    }

    // World bounds in air: allow soaring high above quarter-pipe walls!
    const minWorldX = (this.track.terrain[0]?.x ?? 0) - 40;
    const maxWorldX = (this.track.terrain[this.track.terrain.length - 1]?.x ?? this.track.width) + 40;
    if (this.x < minWorldX) {
      this.x = minWorldX;
      this.vx = Math.max(120, Math.abs(this.vx) * 0.65);
    } else if (this.x > maxWorldX) {
      this.x = maxWorldX;
      this.vx = -Math.max(120, Math.abs(this.vx) * 0.65);
    }

    // Check downhill finish even while soaring in air
    this.checkDownhillFinish();

    // Check auto-grind onto rails (generous 34px snap window!)
    if (this.railRegrabCooldown <= 0 && this.vy >= -220 && Math.abs(this.vx) > 65) {
      const hitRail = this.findNearbyRail(this.x, this.y);
      if (hitRail) {
        this.startGrind(hitRail.rail, hitRail.cx, hitRail.cy, hitRail.angle);
        return;
      }
    }

    // Check ground landing
    const g = sampleTerrain(this.track.terrain, this.x);
    if (this.y >= g.y) {
      this.y = g.y;
      const diff = Math.abs(wrapAngle(this.angle - g.angle));
      if (diff > 1.25 && this.vy > 180) {
        skateAudio.playLand(false);
        this.clearCombo(true);
        this.enterRagdoll(false, 'ATERRISSAGEM DE CARA! 💀');
        return;
      }

      const tx = Math.cos(g.angle);
      const ty = Math.sin(g.angle);
      const speedAlong = this.vx * tx + this.vy * ty;
      this.vx = tx * speedAlong;
      this.vy = ty * speedAlong;
      this.angle = g.angle;
      this.activeTrick = 'none';
      this.boardFlip = 0;
      this.flipAccum = 0;
      this.jumpHoldTimer = 0;
      skateAudio.playLand(true);

      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: this.x + (Math.random() - 0.5) * 20,
          y: this.y - 2,
          vx: (Math.random() - 0.5) * 160,
          vy: -30 - Math.random() * 80,
          size: 7,
          color: '#cbd5e1',
          life: 0.4,
          maxLife: 0.4,
          kind: 'dust',
        });
      }

      const downHeld = this.keys.has('KeyS') || this.keys.has('ArrowDown');
      if (downHeld && (this.comboPoints > 0 || Math.abs(speedAlong) > 110)) {
        this.skaterMode = 'manual';
        this.manualBalance = 0;
        this.manualDrift = (Math.random() - 0.5) * 0.25;
        this.manualElapsed = 0;
        this.manualReleaseTimer = 0;
        this.manualTickTimer = 0;
        this.registerTrick('Manual', 100);
        if (this.tipStep === 2) this.advanceTip(3);
      } else {
        this.skaterMode = 'skating';
        this.bankCombo();
      }
    }
  }

  private stepGrinding(dt: number, dirInput: number): void {
    if (!this.currentRail) {
      this.skaterMode = 'air';
      return;
    }
    this.coyoteTimer = 0.14;
    this.crouching = false;
    this.grindTickTimer += dt;
    if (this.grindGraceTimer > 0) {
      this.grindGraceTimer = Math.max(0, this.grindGraceTimer - dt);
    }

    const pts = this.currentRail.points;
    let bestSegIdx = 0;
    let bestDist = Infinity;
    let bestInfo = pointToSegmentDist(this.x, this.y, pts[0].x, pts[0].y, pts[1].x, pts[1].y);

    for (let i = 0; i < pts.length - 1; i++) {
      const info = pointToSegmentDist(this.x, this.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (info.dist < bestDist) {
        bestDist = info.dist;
        bestSegIdx = i;
        bestInfo = info;
      }
    }

    const railAngle = bestInfo.angle;
    const tx = Math.cos(railAngle);
    const ty = Math.sin(railAngle);
    let speed = this.vx * tx + this.vy * ty;
    const sign = speed >= 0 ? 1 : -1;
    speed = sign * Math.max(310, Math.abs(speed) + 220 * Math.sin(railAngle) * sign * dt);
    this.vx = tx * speed;
    this.vy = ty * speed;
    this.x += this.vx * dt;
    this.y = bestInfo.cy;
    this.angle = railAngle;
    this.facing = this.vx >= 0 ? 1 : -1;

    // Fixed balance direction (+dirInput matches pointer direction!) + 0.4s entry grace
    if (this.grindGraceTimer > 0) {
      this.grindBalance *= Math.pow(0.88, dt * 60);
    } else {
      this.grindDrift += (Math.random() - 0.5) * 1.1 * dt;
      this.grindDrift = Math.max(-0.55, Math.min(0.55, this.grindDrift));

      // Holding the direction you're already riding NEVER throws you off the rail!
      const isHoldingTravelDir = dirInput !== 0 && dirInput === this.facing;
      const steerForce = dirInput * 1.25;
      this.grindBalance += (this.grindDrift + this.grindBalance * 0.25 + steerForce) * dt;
      if (isHoldingTravelDir) {
        this.grindBalance = Math.max(-0.68, Math.min(0.68, this.grindBalance));
      }
    }

    if (Math.abs(this.grindBalance) > 1.08) {
      this.clearCombo(true);
      this.enterRagdoll(false, 'ESCORREGOU DO CORRIMÃO!');
      return;
    }

    skateAudio.playGrindTick(Math.abs(speed));
    if (this.grindTickTimer >= 0.12) {
      this.grindTickTimer = 0;
      this.comboPoints += 25;
      this.particles.push({
        x: this.x - this.facing * 10,
        y: this.y,
        vx: -this.vx * 0.35 + (Math.random() - 0.5) * 120,
        vy: -50 - Math.random() * 120,
        size: 5,
        color: '#fde047',
        life: 0.35,
        maxLife: 0.35,
        kind: 'spark',
      });
    }

    const minX = pts[0].x;
    const maxX = pts[pts.length - 1].x;
    if ((this.x < minX - 8 && bestSegIdx === 0) || (this.x > maxX + 8 && bestSegIdx === pts.length - 2)) {
      this.currentRail = null;
      this.skaterMode = 'air';
      this.vy = Math.min(this.vy, -90);
      this.railRegrabCooldown = 0.16;
    }
  }

  private findNearbyRail(
    px: number,
    py: number,
  ): { rail: GrindRail; cx: number; cy: number; angle: number } | null {
    let closest: { rail: GrindRail; cx: number; cy: number; angle: number; dist: number } | null = null;
    for (const rail of this.track.rails) {
      for (let i = 0; i < rail.points.length - 1; i++) {
        const a = rail.points[i];
        const b = rail.points[i + 1];
        const info = pointToSegmentDist(px, py, a.x, a.y, b.x, b.y);
        if (info.dist < 34 && Math.abs(py - info.cy) < 28) {
          if (!closest || info.dist < closest.dist) {
            closest = { rail, cx: info.cx, cy: info.cy, angle: info.angle, dist: info.dist };
          }
        }
      }
    }
    return closest;
  }

  private startGrind(rail: GrindRail, cx: number, cy: number, angle: number): void {
    this.skaterMode = 'grinding';
    this.currentRail = rail;
    this.x = cx;
    this.y = cy;
    this.angle = angle;
    this.grindBalance = (Math.random() - 0.5) * 0.16;
    this.grindDrift = (Math.random() - 0.5) * 0.3;
    this.grindGraceTimer = 0.4;
    this.activeTrick = 'none';
    this.boardFlip = 0;
    this.flipAccum = 0;
    this.jumpHoldTimer = 0;
    this.registerTrick(rail.label ? `Grind (${rail.label})` : '50-50 Grind', 220);
    skateAudio.playGrindTick(400);
    if (this.tipStep === 2) this.advanceTip(3);
  }

  private performOllie(isSuper: boolean): void {
    this.jumpBufferTimer = 0;
    if (
      this.skaterMode !== 'skating' &&
      this.skaterMode !== 'manual' &&
      this.skaterMode !== 'grinding' &&
      this.coyoteTimer <= 0
    ) {
      return;
    }

    const wasGrinding = this.skaterMode === 'grinding';
    const basePop = isSuper ? 575 : 475;

    // Preserve horizontal speed (NO horizontal braking on uphill slopes!)
    this.vy = Math.min(this.vy, 0) - basePop;
    if (this.vy > -440) this.vy = -440;

    this.y -= 6;
    this.skaterMode = 'air';
    this.currentRail = null;
    this.coyoteTimer = 0;
    this.jumpHoldTimer = 0.19;
    this.crouching = false;
    this.flipAccum = 0;
    if (wasGrinding) {
      this.railRegrabCooldown = 0.16;
    }

    skateAudio.playOllie(isSuper ? 1.0 : 0.72);
    this.registerTrick(isSuper ? 'Super Ollie' : 'Ollie', isSuper ? 120 : 60);
    if (this.tipStep === 0) this.advanceTip(1);
  }

  private tryAirTrick(kind: Exclude<TrickKind, 'none'>): void {
    if (this.skaterMode !== 'air' || this.trickCooldown > 0) return;
    this.activeTrick = kind;
    this.trickTimer = 0.44;
    this.trickCooldown = 0.34;
    this.boardFlip = 0;

    skateAudio.playTrick(kind);
    if (kind === 'kickflip') {
      this.registerTrick('Kickflip da Banana', 250);
    } else if (kind === 'bananagrab') {
      this.registerTrick('Banana Grab', 300);
    } else {
      this.registerTrick('Chimp Christ Air', 450);
    }
    if (this.tipStep === 1) this.advanceTip(2);
  }

  private registerTrick(name: string, basePoints: number): void {
    if (!this.comboUsedTricks.has(name)) {
      this.comboUsedTricks.add(name);
      this.comboMult = Math.min(12, this.comboTrickNames.length === 0 ? 1 : this.comboMult + 1);
    }
    this.comboPoints += basePoints;
    this.comboTrickNames.push(name);
    this.addCallout(this.x, this.y - 78, `${name}!`, '#fde047', 1.0);
  }

  private bankCombo(): void {
    if (this.comboPoints <= 0) {
      this.clearCombo();
      return;
    }
    const total = Math.round(this.comboPoints * this.comboMult);
    this.trickScore += total;
    if (total > this.bestCombo) {
      this.bestCombo = total;
    }
    this.addCallout(this.x, this.y - 95, `COMBO +${total.toLocaleString('pt-BR')}! 🔥`, '#4ade80', 1.25);
    skateAudio.playComboBank(this.comboMult);

    if (total >= 1500 && this.room.getPlayers().length > 1) {
      this.room.send('callout', {
        kind: 'callout',
        text: `🛹 ${this.room.localPlayer.name} cravou combo de ${total.toLocaleString('pt-BR')} pts!`,
        tone: 'banana',
      });
    }

    this.checkRecordUpdate();
    this.clearCombo();
  }

  private clearCombo(lost = false): void {
    if (lost && this.comboPoints > 0) {
      this.addCallout(this.x, this.y - 105, 'COMBO PERDIDO! 💀', '#fb7185', 1.15);
    }
    this.comboPoints = 0;
    this.comboMult = 1;
    this.comboTrickNames = [];
    this.comboUsedTricks.clear();
    this.comboClearedProps.clear();
  }

  private checkPickupsAndHazards(): void {
    // 1. Turbo Banana Pads
    for (const pad of this.track.turboBananas) {
      if (pad.cooldown > 0) continue;
      if (Math.hypot(this.x - pad.x, this.y - pad.y) < 40) {
        pad.cooldown = 5.0;
        this.turboTimer = 2.8;
        const boost = 440;
        this.vx += (this.vx >= 0 ? 1 : -1) * boost;
        skateAudio.playTurboBanana();
        this.addCallout(this.x, this.y - 84, '⚡ TURBO POTÁSSIO!', '#fde047', 1.2);
      }
    }

    // 2. Player-thrown Banana Peels
    for (let i = this.thrownBananas.length - 1; i >= 0; i--) {
      const b = this.thrownBananas[i];
      if (b.ownerId === this.room.localPlayer.id && this.selfBananaGrace > 0) continue;
      if (this.invulnTimer > 0) continue;
      if (Math.hypot(this.x - b.x, this.y - b.y) < 32) {
        this.thrownBananas.splice(i, 1);
        if (this.room.getPlayers().length > 1) {
          this.room.send('banana_hit', { kind: 'banana_hit', id: b.id });
        }
        skateAudio.playSlipBanana();
        this.clearCombo(true);
        const who =
          b.ownerId === this.room.localPlayer.id
            ? 'NA PRÓPRIA CASCA!'
            : `NA CASCA DE ${b.ownerName.toUpperCase()}!`;
        this.enterRagdoll(true, `ESCORREGOU ${who} 🍌`);
        return;
      }
    }

    // 3. Jumpable Props (Poles, signs, billboards are SCENERY in skate mode!)
    for (const prop of this.track.props) {
      if (prop.solidInSkate === false) continue;

      const left = prop.x - prop.width * 0.44;
      const right = prop.x + prop.width * 0.44;
      const top = prop.y - prop.height;

      // GAP bonus when soaring cleanly over a jumpable prop!
      if (
        this.skaterMode === 'air' &&
        !this.comboClearedProps.has(prop.id) &&
        this.x > left &&
        this.x < right &&
        this.y <= top + 8 &&
        this.y >= top - 240
      ) {
        this.comboClearedProps.add(prop.id);
        const label = prop.label ? `GAP! PULOU ${prop.label}` : 'GAP LIMPO';
        this.registerTrick(label, prop.kind === 'parked-car' || prop.kind === 'hotdog' ? 280 : 180);
      }

      if (this.invulnTimer > 0 || this.skaterMode === 'grinding') continue;

      // Forgiving body core collision (never clips when clearing top!)
      if (
        this.x + 10 > left + 6 &&
        this.x - 10 < right - 6 &&
        this.y > top + 16 &&
        this.y - 44 < prop.y
      ) {
        this.clearCombo(true);
        const msg =
          prop.kind === 'parked-car'
            ? `BEIJOU O ${prop.label ?? 'CARRO'}!`
            : `TROPEÇOU NO ${prop.label ?? 'OBSTÁCULO'}!`;
        this.enterRagdoll(false, msg);
        return;
      }
    }

    // 4. Moving Traffic Cars
    for (const car of this.cars) {
      const left = car.x - car.width * 0.46;
      const right = car.x + car.width * 0.46;
      const roofY = car.y - car.height;
      if (
        this.skaterMode === 'air' &&
        this.vy >= 0 &&
        this.x > left &&
        this.x < right &&
        Math.abs(this.y - roofY) < 20
      ) {
        this.y = roofY;
        this.vy = -300;
        this.registerTrick('Surf no Teto do Carro!', 450);
        skateAudio.playOllie(0.85);
        skateAudio.playHonk();
        return;
      }

      if (this.invulnTimer > 0) continue;

      if (
        this.x + 12 > left + 6 &&
        this.x - 12 < right - 6 &&
        this.y > roofY + 14 &&
        this.y - 42 < car.y
      ) {
        this.clearCombo(true);
        this.vx += car.vx * 1.15;
        this.vy = -420;
        this.enterRagdoll(false, 'ATROPELADO NA LADEIRA! 🚗');
        return;
      }
    }
  }

  private enterRagdoll(ejectImpulse: boolean, reason: string): void {
    this.skaterMode = 'ragdoll';
    this.crouching = false;
    this.jumpHoldTimer = 0;
    this.jumpBufferTimer = 0;
    this.activeTrick = 'none';
    this.currentRail = null;
    this.ragdollAccum = 0;
    this.ragdoll = spawnRagdollFromSkater(
      this.x,
      this.y,
      this.vx,
      this.vy,
      this.angle,
      this.facing,
      ejectImpulse,
    );
    this.shakeMag = Math.max(this.shakeMag, 12);
    if (ejectImpulse) {
      skateAudio.playEject();
    } else {
      skateAudio.playBoneCrunch(12);
    }
    this.addCallout(this.x, this.y - 75, reason, '#fb7185', 1.2);
  }

  private stepEffects(dt: number): void {
    this.shakeMag = Math.max(0, this.shakeMag - 38 * dt);

    // Interpolate remote skaters smoothly at 60+ fps
    const netLerp = 1 - Math.exp(-16 * dt);
    for (const remote of this.remotes.values()) {
      remote.renderX += (remote.snap.x - remote.renderX) * netLerp;
      remote.renderY += (remote.snap.y - remote.renderY) * netLerp;
      remote.renderAngle += wrapAngle(remote.snap.angle - remote.renderAngle) * netLerp;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 680 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.angle !== undefined && p.spin !== undefined) {
        p.angle += p.spin * dt;
      }
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.life -= dt;
      c.y += c.vy * dt;
      c.vy *= 0.94;
      if (c.life <= 0) this.callouts.splice(i, 1);
    }

    for (let i = this.xrays.length - 1; i >= 0; i--) {
      this.xrays[i].life -= dt;
      if (this.xrays[i].life <= 0) this.xrays.splice(i, 1);
    }

    for (let i = this.thrownBananas.length - 1; i >= 0; i--) {
      this.thrownBananas[i].ttl -= dt;
      if (this.thrownBananas[i].ttl <= 0) this.thrownBananas.splice(i, 1);
    }

    if (this.bananaThrowCooldown > 0) {
      this.bananaThrowCooldown = Math.max(0, this.bananaThrowCooldown - dt);
    }

    if (!this.tipsDismissed && this.tipStep < 4) {
      this.tipAutoHideTimer += dt;
      if (this.tipAutoHideTimer > 22) {
        this.tipsDismissed = true;
        this.dom.tipBanner.classList.remove('visible');
      }
    }
  }

  private advanceTip(nextStep: number): void {
    if (this.tipsDismissed || nextStep <= this.tipStep) return;
    this.tipStep = nextStep;
    this.tipAutoHideTimer = 0;
    this.refreshTipBanner();
  }

  private refreshTipBanner(): void {
    if (this.tipsDismissed || this.tipStep >= 4 || this.paused) {
      this.dom.tipBanner.classList.remove('visible');
      return;
    }
    const msgs = [
      '💡 Dica 1/4: Aperte Espaço, W ou ▲ para pular! Segure para Ollie mais alto!',
      '💡 Dica 2/4: No ar, aperte J (Kickflip), K (Grab), L (Christ Air) ou Q/E para dar Flips!',
      '💡 Dica 3/4: Pouse nos corrimões para dar Grind, ou segure S / ▼ ao pousar para fazer Manual!',
      '💡 Dica 4/4: Quer quebrar ossos? Aperte X para ejetar no Hall of Meat (Espaço/R levanta)!',
    ];
    this.dom.tipText.textContent = msgs[this.tipStep] ?? '';
    this.dom.tipBanner.classList.add('visible');
  }

  private stepCamera(dt: number): void {
    let targetX = this.x;
    let targetY = this.y - 45;
    let speed = Math.hypot(this.vx, this.vy);

    if (this.skaterMode === 'ragdoll' && this.ragdoll.nodes[1]) {
      const chest = this.ragdoll.nodes[1];
      targetX = chest.x;
      targetY = chest.y - 20;
      speed = Math.hypot(chest.x - chest.oldX, chest.y - chest.oldY) * 60;
    } else {
      targetX += Math.max(-200, Math.min(200, this.vx * 0.22));
      targetY += Math.max(-100, Math.min(100, this.vy * 0.12));
    }

    const followLerp = 1 - Math.exp(-8.5 * dt);
    this.camX += (targetX - this.camX) * followLerp;
    this.camY += (targetY - this.camY) * followLerp;

    // Zoom out smoothly for big air & high speed!
    const gUnder = sampleTerrain(this.track.terrain, this.x);
    const altitude = Math.max(0, gUnder.y - this.y);
    const targetZoom = Math.max(0.62, Math.min(1.04, 1.02 - speed / 2600 - altitude / 1450));
    this.camZoom += (targetZoom - this.camZoom) * (1 - Math.exp(-3.5 * dt));
  }

  private stepSessionTimer(dt: number): void {
    if (this.mode === 'race') {
      this.raceElapsed += dt;
      this.sessionRemaining = Math.max(0, SESSION_90_DURATION - this.raceElapsed);
      if (this.sessionRemaining <= 0) {
        this.finishSession();
      }
      return;
    }

    if (this.mode !== 'session90' && this.mode !== 'local2p') return;
    this.sessionRemaining -= dt;
    if (this.sessionRemaining <= 0) {
      this.sessionRemaining = 0;
      this.bankCombo();
      if (this.mode === 'local2p' && this.local2pTurn === 1) {
        this.finishLocal2PTurnOne();
      } else {
        this.finishSession();
      }
    }
  }

  private finishLocal2PTurnOne(): void {
    this.paused = true;
    const total = this.trickScore + this.boneScore;
    this.local2pResults[0] = {
      name: this.local2pNames[0],
      trickScore: this.trickScore,
      boneScore: this.boneScore,
      bonesBroken: this.bonesBroken,
      bestCombo: this.bestCombo,
      total,
    };

    this.dom.turnHeadline.textContent = `⏱️ Fim do Turno de ${this.local2pNames[0]}!`;
    this.dom.turnSub.textContent = `Passe o teclado para ${this.local2pNames[1]} bater esse placar!`;
    this.dom.turnP1Tricks.textContent = this.trickScore.toLocaleString('pt-BR');
    this.dom.turnP1Sus.textContent = `${this.boneScore.toLocaleString('pt-BR')} R$`;
    this.dom.turnP1Total.textContent = total.toLocaleString('pt-BR');
    this.dom.nextTurnBtn.textContent = `🔥 DROPAR ${this.local2pNames[1].toUpperCase()}! (45s)`;

    skateAudio.playComboBank(3);
    this.dom.turnModal.classList.remove('hidden');
  }

  private finishSession(): void {
    this.paused = true;
    this.bankCombo();

    const total = this.trickScore + this.boneScore;
    const rec = reportGameScore('monkey-skate', total, {
      tricks: this.trickScore,
      sus: this.boneScore,
      bones: this.bonesBroken,
    });
    this.allTimeRecord = rec.bestScore;
    this.dom.recordVal.textContent = this.allTimeRecord.toLocaleString('pt-BR');

    this.dom.sumTricks.textContent = this.trickScore.toLocaleString('pt-BR');
    this.dom.sumSus.textContent = `${this.boneScore.toLocaleString('pt-BR')} R$`;
    this.dom.sumTotal.textContent = total.toLocaleString('pt-BR');

    // Handle Podium (Local 2P or Online Room with >1 players)
    if (this.mode === 'local2p') {
      const p1 = this.local2pResults[0] ?? {
        name: this.local2pNames[0],
        trickScore: 0,
        boneScore: 0,
        bonesBroken: 0,
        bestCombo: 0,
        total: 0,
      };
      const p2: TurnScoreResult = {
        name: this.local2pNames[1],
        trickScore: this.trickScore,
        boneScore: this.boneScore,
        bonesBroken: this.bonesBroken,
        bestCombo: this.bestCombo,
        total,
      };
      this.local2pResults[1] = p2;

      const sorted = [p1, p2].sort((a, b) => b.total - a.total);
      const isTie = p1.total === p2.total;
      this.dom.summaryHeadline.textContent = isTie
        ? '🤝 Empate Macaco!'
        : `🏆 ${sorted[0].name} Venceu o Desafio!`;
      this.dom.summaryDiagnosis.textContent = isTie
        ? 'Os dois macacos empataram na pista! Hora da revanche!'
        : `${sorted[0].name} venceu por ${(sorted[0].total - sorted[1].total).toLocaleString('pt-BR')} pontos!`;

      this.dom.podiumBox.classList.add('visible');
      this.dom.podiumRows.innerHTML = sorted
        .map((r, i) => {
          const medal = i === 0 ? '🥇' : '🥈';
          return `<div class="podium-row ${i === 0 ? 'winner' : ''}">
            <span>${medal} ${escapeHtml(r.name)}</span>
            <span>🛹 ${r.trickScore.toLocaleString('pt-BR')} • 💀 ${r.boneScore.toLocaleString('pt-BR')} • <b>${r.total.toLocaleString('pt-BR')}</b></span>
          </div>`;
        })
        .join('');
    } else if (this.room.getPlayers().length > 1) {
      const entries = this.room.getPlayers().map((p) => {
        const isMe = p.id === this.room.localPlayer.id;
        const score = isMe
          ? total
          : (this.remotes.get(p.id)?.snap.trickScore ?? 0) + (this.remotes.get(p.id)?.snap.boneScore ?? 0);
        const finishT = isMe ? this.raceFinishTime : this.remoteRaceFinishes.get(p.id)?.finishTime ?? null;
        return { name: p.name, color: p.color, score, finishTime: finishT };
      });
      entries.sort((a, b) => {
        if (this.mode === 'race') {
          if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
          if (a.finishTime !== null) return -1;
          if (b.finishTime !== null) return 1;
        }
        return b.score - a.score;
      });

      this.dom.podiumBox.classList.add('visible');
      this.dom.podiumRows.innerHTML = entries
        .map((e, idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🐒';
          const detail =
            this.mode === 'race' && e.finishTime !== null
              ? `⏱️ ${e.finishTime.toFixed(1)}s • ${e.score.toLocaleString('pt-BR')} pts`
              : `${e.score.toLocaleString('pt-BR')} pts`;
          return `<div class="podium-row ${idx === 0 ? 'winner' : ''}">
            <span style="color:${e.color}">${medal} ${escapeHtml(e.name)}</span>
            <span>${detail}</span>
          </div>`;
        })
        .join('');

      this.dom.summaryHeadline.textContent =
        entries[0]?.name === this.room.localPlayer.name ? '🏆 Você Venceu a Sala!' : '🐒 Fim da Rodada Online!';
      this.dom.summaryDiagnosis.textContent =
        this.mode === 'race'
          ? 'Corrida Ladeira Abaixo concluída!'
          : 'Duelo 90s encerrado — confira o pódio da macacada!';
    } else {
      this.dom.podiumBox.classList.remove('visible');
      if (this.mode === 'race' && this.raceFinishTime !== null) {
        this.dom.summaryHeadline.textContent = `🏁 Morro Conquistado em ${this.raceFinishTime.toFixed(1)}s!`;
        this.dom.summaryDiagnosis.textContent = 'Desceu sem freio e chegou inteiro (ou quase)!';
      } else if (this.boneScore > this.trickScore) {
        this.dom.summaryHeadline.textContent = '🏥 Paciente VIP do SUS!';
        this.dom.summaryDiagnosis.textContent = `Você quebrou ${this.bonesBroken} ossos e deu prejuízo histórico pra ambulância!`;
      } else if (total >= 15000) {
        this.dom.summaryHeadline.textContent = '🏆 Lenda do Skate Macaco!';
        this.dom.summaryDiagnosis.textContent = 'Tony Hawk ligou pedindo aula de Banana Grab!';
      } else {
        this.dom.summaryHeadline.textContent = '🛹 Sessão Encerrada!';
        this.dom.summaryDiagnosis.textContent = 'Bom rolê! Tente combinar Kickflip + Manual + Grind pra explodir o multiplicador.';
      }
    }

    skateAudio.playComboBank(4);
    this.dom.summaryModal.classList.remove('hidden');
  }

  private checkRecordUpdate(): void {
    const total = this.trickScore + this.boneScore;
    if (total > this.allTimeRecord) {
      const rec = reportGameScore('monkey-skate', total);
      this.allTimeRecord = rec.bestScore;
      this.dom.recordVal.textContent = this.allTimeRecord.toLocaleString('pt-BR');
    }
  }

  private getRaceProgress(xPos: number): number {
    const startX = this.track.spawnX;
    const endX = this.track.finishX ?? this.track.width;
    return Math.max(0, Math.min(1, (xPos - startX) / Math.max(1, endX - startX)));
  }

  private stepNetwork(dt: number): void {
    const players = this.room.getPlayers();
    if (players.length <= 1) return;

    this.netSyncTimer += dt;
    if (this.netSyncTimer >= 0.05) {
      this.netSyncTimer = 0;
      const snap: SkaterSnapshot = {
        trackId: this.trackId,
        mode: this.skaterMode,
        x: Math.round(this.x),
        y: Math.round(this.y),
        vx: Math.round(this.vx),
        vy: Math.round(this.vy),
        angle: Number(this.angle.toFixed(3)),
        facing: this.facing,
        crouching: this.crouching,
        activeTrick: this.activeTrick,
        trickTimer: Number(this.trickTimer.toFixed(2)),
        boardFlip: Number(this.boardFlip.toFixed(2)),
        trickScore: this.trickScore,
        boneScore: this.boneScore,
        bestCombo: this.bestCombo,
        bestCrash: this.bestCrash,
        matchId: this.matchId || undefined,
        raceProgress: this.mode === 'race' ? Number(this.getRaceProgress(this.x).toFixed(3)) : undefined,
        raceFinishTime: this.raceFinishTime,
      };

      if (this.skaterMode === 'ragdoll' && this.ragdoll.active) {
        snap.ragdollNodes = this.ragdoll.nodes.map((n) => [Math.round(n.x), Math.round(n.y)]);
        snap.boardPos = [
          Math.round(this.ragdoll.boardX),
          Math.round(this.ragdoll.boardY),
          Number(this.ragdoll.boardAngle.toFixed(2)),
        ];
      }

      this.room.send('state', { kind: 'state', snap });
    }

    const now = performance.now();
    for (const [id, r] of this.remotes) {
      if (now - r.lastSeen > 12000) this.remotes.delete(id);
    }
  }

  private addCallout(x: number, y: number, text: string, color: string, scale = 1): void {
    this.callouts.push({
      x,
      y,
      vy: -58,
      text,
      color,
      scale,
      life: 1.15,
      maxLife: 1.15,
    });
  }

  private updateHudDom(): void {
    this.dom.trickScore.textContent = this.trickScore.toLocaleString('pt-BR');
    this.dom.bestCombo.textContent = this.bestCombo.toLocaleString('pt-BR');
    this.dom.boneScore.textContent = `${this.boneScore.toLocaleString('pt-BR')} R$`;
    this.dom.bonesCount.textContent = String(this.bonesBroken);
    this.dom.timerVal.textContent =
      this.mode === 'race'
        ? `${this.raceElapsed.toFixed(1)}s`
        : String(Math.ceil(this.sessionRemaining));

    if (this.comboPoints > 0 && this.skaterMode !== 'ragdoll') {
      this.dom.comboBanner.classList.add('visible');
      this.dom.comboPoints.textContent = `${this.comboPoints.toLocaleString('pt-BR')} × ${this.comboMult}`;
      const latest = this.comboTrickNames.slice(-4).join(' + ');
      this.dom.comboTricks.textContent = latest;
    } else {
      this.dom.comboBanner.classList.remove('visible');
    }

    if (this.bananaThrowCooldown > 0) {
      this.dom.bananaBtn.disabled = true;
      this.dom.bananaBtn.textContent = `🍌 Recarga (${Math.ceil(this.bananaThrowCooldown)}s)`;
    } else {
      this.dom.bananaBtn.disabled = false;
      this.dom.bananaBtn.textContent = '🍌 Jogar Casca (B)';
    }

    // Race progress dots
    if (this.mode === 'race') {
      const myPct = Math.round(this.getRaceProgress(this.x) * 100);
      this.dom.racePct.textContent = `${myPct}%`;
      const dots: Array<{ pct: number; color: string }> = [
        { pct: myPct, color: this.room.localPlayer.color || '#facc15' },
      ];
      for (const r of this.remotes.values()) {
        if (r.snap.trackId === this.trackId) {
          dots.push({ pct: Math.round((r.snap.raceProgress ?? 0) * 100), color: r.color });
        }
      }
      const dotsHtml = dots
        .map((d) => `<div class="race-dot" style="left:${d.pct}%;background:${d.color};"></div>`)
        .join('');
      if (dotsHtml !== this.lastRaceBarHtml) {
        this.lastRaceBarHtml = dotsHtml;
        this.dom.raceTrackLine.innerHTML = dotsHtml;
      }
    }

    // Multiplayer live leaderboard (diff-guarded, zero 60fps DOM thrashing!)
    const players = this.room.getPlayers();
    if (players.length > 1) {
      this.dom.mpBoard.classList.add('visible');
      const rowsHtml = players
        .map((p) => {
          const isMe = p.id === this.room.localPlayer.id;
          const total = isMe
            ? this.trickScore + this.boneScore
            : (this.remotes.get(p.id)?.snap.trickScore ?? 0) + (this.remotes.get(p.id)?.snap.boneScore ?? 0);
          const combo = isMe ? this.bestCombo : (this.remotes.get(p.id)?.snap.bestCombo ?? 0);
          return `<div class="mp-row">
            <span class="mp-name" style="color:${p.color}">${isMe ? '⭐ ' : ''}${escapeHtml(p.name)}</span>
            <span class="mp-stats">🏆${total.toLocaleString('pt-BR')} • 🔥${combo}</span>
          </div>`;
        })
        .join('');
      if (rowsHtml !== this.lastMpBoardHtml) {
        this.lastMpBoardHtml = rowsHtml;
        this.dom.mpRows.innerHTML = rowsHtml;
      }
    } else {
      this.dom.mpBoard.classList.remove('visible');
      this.lastMpBoardHtml = '';
    }
  }
}
