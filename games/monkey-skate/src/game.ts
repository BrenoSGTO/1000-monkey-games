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
  XrayFlash,
} from './types';

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

export interface HudDomRefs {
  timerCard: HTMLElement;
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
  mpBoard: HTMLElement;
  mpRows: HTMLElement;
  bananaBtn: HTMLButtonElement;
  menuModal: HTMLElement;
  summaryModal: HTMLElement;
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
  private sessionRemaining = 90;

  // Skater state
  private skaterMode: SkaterMode = 'skating';
  private x = 620;
  private y = 260;
  private vx = 0;
  private vy = 0;
  private angle = 0;
  private facing: 1 | -1 = 1;
  private coyoteTimer = 0;
  private ollieCharging = false;
  private ollieCharge = 0;
  private activeTrick: TrickKind = 'none';
  private trickTimer = 0;
  private trickCooldown = 0;
  private boardFlip = 0;
  private flipAccum = 0;
  private turboTimer = 0;
  private bananaThrowCooldown = 0;
  private selfBananaGrace = 0;

  // Grind state
  private currentRail: GrindRail | null = null;
  private grindBalance = 0;
  private grindDrift = 0;
  private grindTickTimer = 0;

  // Combo & Score state
  private comboPoints = 0;
  private comboMult = 1;
  private comboTrickNames: string[] = [];
  private comboUsedTricks = new Set<string>();
  private trickScore = 0;
  private boneScore = 0;
  private bonesBroken = 0;
  private bestCombo = 0;
  private bestCrash = 0;
  private allTimeRecord = 0;

  // Ragdoll & FX
  private ragdoll: RagdollState = createEmptyRagdoll();
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

  // Input
  private keys = new Set<string>();
  private remotes = new Map<string, RemotePlayerState>();

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

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.loadTrack('praca', 'free', false);
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  public startSession(trackId: TrackId, mode: GameMode): void {
    this.paused = false;
    this.dom.menuModal.classList.add('hidden');
    this.dom.summaryModal.classList.add('hidden');
    this.loadTrack(trackId, mode, true);
    skateAudio.playOllie(0.9);
  }

  public openMenu(): void {
    this.paused = true;
    this.dom.summaryModal.classList.add('hidden');
    this.dom.menuModal.classList.remove('hidden');
  }

  public handlePeerMessage(senderId: string, senderName: string, msg: NetMessage): void {
    if (senderId === this.room.localPlayer.id) return;

    if (msg.kind === 'state') {
      const rosterPlayer = this.room.getPlayers().find((p) => p.id === senderId);
      this.remotes.set(senderId, {
        id: senderId,
        name: rosterPlayer?.name ?? senderName,
        color: rosterPlayer?.color ?? '#38bdf8',
        snap: msg.snap,
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
    } else if (msg.kind === 'callout') {
      this.hud.toast(msg.text, msg.tone);
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
    if (this.paused || this.bananaThrowCooldown > 0) return;
    this.bananaThrowCooldown = 5;
    this.selfBananaGrace = 1.4;

    const dropX = Math.max(40, Math.min(this.track.width - 40, this.x - this.facing * 24));
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
    if (this.paused) return;
    if (this.skaterMode === 'ragdoll') {
      applyRagdollWiggle(this.ragdoll);
      skateAudio.playBoneCrunch(8);
      return;
    }
    this.enterRagdoll(true, 'EJEÇÃO HALL OF MEAT! 💀');
  }

  public resetSkater(atSpawn = false): void {
    if (this.skaterMode === 'ragdoll' && this.ragdoll.currentCrashScore > this.bestCrash) {
      this.bestCrash = this.ragdoll.currentCrashScore;
    }
    const targetX = atSpawn
      ? this.track.spawnX
      : Math.max(80, Math.min(this.track.width - 80, this.ragdoll.active ? this.ragdoll.nodes[1].x : this.x));
    const g = sampleTerrain(this.track.terrain, targetX);
    this.skaterMode = 'skating';
    this.x = targetX;
    this.y = g.y;
    this.vx = atSpawn ? 120 : 0;
    this.vy = 0;
    this.angle = g.angle;
    this.ollieCharging = false;
    this.ollieCharge = 0;
    this.activeTrick = 'none';
    this.trickTimer = 0;
    this.boardFlip = 0;
    this.flipAccum = 0;
    this.currentRail = null;
    this.ragdoll = createEmptyRagdoll();
    this.clearCombo();
  }

  private loadTrack(trackId: TrackId, mode: GameMode, resetScores: boolean): void {
    this.trackId = trackId;
    this.track = TRACKS[trackId];
    this.mode = mode;
    this.sessionRemaining = 90;
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

    this.dom.timerCard.style.display = mode === 'session90' ? 'block' : 'none';
    this.dom.trackBadge.textContent = this.track.shortName;

    this.setupTraffic();
    this.resetSkater(true);
    this.camX = this.x;
    this.camY = this.y - 60;
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
        height: 56,
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

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const code = e.code;

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }

      if (this.paused) return;

      if (code === 'Space' && !e.repeat) {
        if (this.skaterMode === 'skating' || this.skaterMode === 'grinding' || this.coyoteTimer > 0) {
          this.ollieCharging = true;
          this.ollieCharge = 0.38;
        }
      }

      if (!e.repeat) {
        if (code === 'KeyJ') this.tryAirTrick('kickflip');
        else if (code === 'KeyK') this.tryAirTrick('bananagrab');
        else if (code === 'KeyL') this.tryAirTrick('christair');
        else if (code === 'KeyE') this.triggerEject();
        else if (code === 'KeyR') this.resetSkater(false);
        else if (code === 'KeyB') this.throwBananaPeel();
      }

      this.keys.add(code);
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      this.keys.delete(code);
      if (code === 'Space' && this.ollieCharging) {
        this.releaseOllie();
      }
    });
  }

  private loop(now: number): void {
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = Math.min(0.035, Math.max(0.001, rawDt));

    if (!this.paused) {
      // Substep physics cleanly at <= 1/120s
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const subDt = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.stepPhysics(subDt);
      }
      this.stepEffects(dt);
      this.stepCamera(dt);
      this.stepSessionTimer(dt);
      this.stepNetwork(dt);
      this.updateHudDom();
    }

    this.time += dt;
    const shakeX = (Math.random() - 0.5) * this.shakeMag;
    const shakeY = (Math.random() - 0.5) * this.shakeMag;

    const localRender: RenderLocalSkater = {
      name: this.room.getPlayers().length > 1 ? this.room.localPlayer.name : '',
      color: this.room.getPlayers().length > 1 ? this.room.localPlayer.color : '#facc15',
      mode: this.skaterMode,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      facing: this.facing,
      ollieCharge: this.ollieCharge,
      activeTrick: this.activeTrick,
      trickTimer: this.trickTimer,
      boardFlip: this.boardFlip,
      grindBalance: this.grindBalance,
      turboTimer: this.turboTimer,
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

  private stepPhysics(dt: number): void {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const dirInput = (right ? 1 : 0) - (left ? 1 : 0);

    if (this.coyoteTimer > 0) this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.trickCooldown > 0) this.trickCooldown = Math.max(0, this.trickCooldown - dt);
    if (this.turboTimer > 0) this.turboTimer = Math.max(0, this.turboTimer - dt);
    if (this.selfBananaGrace > 0) this.selfBananaGrace = Math.max(0, this.selfBananaGrace - dt);

    if (this.trickTimer > 0) {
      this.trickTimer -= dt;
      if (this.activeTrick === 'kickflip') {
        this.boardFlip += 22 * dt;
      }
      if (this.trickTimer <= 0) {
        this.activeTrick = 'none';
        this.boardFlip = 0;
      }
    }

    // Update turbo banana pad cooldowns
    for (const pad of this.track.turboBananas) {
      if (pad.cooldown > 0) pad.cooldown = Math.max(0, pad.cooldown - dt);
    }

    // Update moving traffic cars
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

      // Honk when near skater
      if (Math.abs(car.x - this.x) < 280 && car.honkCooldown <= 0) {
        car.honkCooldown = 4.5;
        skateAudio.playHonk();
      }
    }

    if (this.skaterMode === 'ragdoll') {
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
      return;
    }

    if (this.ollieCharging) {
      this.ollieCharge = Math.min(1, this.ollieCharge + dt * 1.45);
    }

    if (this.skaterMode === 'skating') {
      this.stepSkating(dt, dirInput);
    } else if (this.skaterMode === 'grinding') {
      this.stepGrinding(dt, dirInput);
    } else if (this.skaterMode === 'air') {
      this.stepAir(dt, dirInput);
    }

    this.checkPickupsAndHazards();
  }

  private stepSkating(dt: number, dirInput: number): void {
    const g = sampleTerrain(this.track.terrain, this.x);
    this.coyoteTimer = 0.12;

    // Tangent direction along slope
    const tx = Math.cos(g.angle);
    const ty = Math.sin(g.angle);
    let speedAlong = this.vx * tx + this.vy * ty;

    // Gravity along slope + pumping acceleration
    const gravityAccel = 1280 * Math.sin(g.angle);
    const pushAccel = dirInput * (this.turboTimer > 0 ? 1150 : 760);
    speedAlong += (gravityAccel + pushAccel) * dt;

    // Rolling drag & max speed
    speedAlong *= Math.pow(0.985, dt * 60);
    const maxSpd = this.turboTimer > 0 ? 1420 : 1080;
    speedAlong = Math.max(-maxSpd, Math.min(maxSpd, speedAlong));

    if (dirInput !== 0) {
      this.facing = dirInput > 0 ? 1 : -1;
    } else if (Math.abs(speedAlong) > 35) {
      this.facing = speedAlong > 0 ? 1 : -1;
    }

    this.vx = tx * speedAlong;
    this.vy = ty * speedAlong;

    const prevAngle = g.angle;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // World edge handling
    if (this.x < 30) {
      this.x = 30;
      this.vx = Math.abs(this.vx) * 0.7;
    } else if (this.x > this.track.width - 30) {
      if (this.track.loopMode === 'downhill') {
        this.addCallout(this.x, this.y - 60, '🏁 MORRO COMPLETADO! +1000', '#4ade80', 1.35);
        this.trickScore += 1000;
        skateAudio.playComboBank(4);
        this.resetSkater(true);
        return;
      }
      this.x = this.track.width - 30;
      this.vx = -Math.abs(this.vx) * 0.7;
    }

    const nextG = sampleTerrain(this.track.terrain, this.x);
    const angleDelta = nextG.angle - prevAngle;

    // Launch off steep ramp lips into the air if going fast and slope drops abruptly!
    if (angleDelta > 0.24 && Math.abs(speedAlong) > 260) {
      this.skaterMode = 'air';
      this.y = nextG.y - 4;
      this.angle = prevAngle;
      return;
    }

    this.y = nextG.y;
    this.angle = this.angle + wrapAngle(nextG.angle - this.angle) * Math.min(1, dt * 22);

    // Check downhill finish gate celebration
    if (this.track.finishX && this.x > this.track.finishX && this.x < this.track.finishX + 40) {
      this.addCallout(this.x, this.y - 80, '🏁 DESCEU O MORRO INTEIRO!', '#fde047', 1.3);
    }
  }

  private stepAir(dt: number, dirInput: number): void {
    this.vy += 1320 * dt;
    this.vx += dirInput * 120 * dt; // subtle air drift control
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Spin flips in air
    const flipRate = this.activeTrick === 'bananagrab' ? 6.8 : 4.8;
    if (dirInput !== 0) {
      const rotDelta = dirInput * flipRate * dt;
      this.angle += rotDelta;
      this.flipAccum += rotDelta;

      if (Math.abs(this.flipAccum) >= Math.PI * 1.85) {
        const isFront = (this.flipAccum > 0 && this.facing === 1) || (this.flipAccum < 0 && this.facing === -1);
        this.flipAccum = 0;
        this.registerTrick(isFront ? 'Frontflip' : 'Backflip', 400);
        skateAudio.playTrick('kickflip');
      }
    }

    // Clamp world X
    if (this.x < 30) {
      this.x = 30;
      this.vx = Math.abs(this.vx) * 0.65;
    } else if (this.x > this.track.width - 30) {
      this.x = this.track.width - 30;
      this.vx = -Math.abs(this.vx) * 0.65;
    }

    // Check auto-grind onto rails when descending
    if (this.vy >= -130 && Math.abs(this.vx) > 75) {
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
      if (diff > 0.94 && this.vy > 140) {
        // Crooked landing -> Wipeout Ragdoll!
        skateAudio.playLand(false);
        this.clearCombo(true);
        this.enterRagdoll(false, 'ATERRISSAGEM DE CARA! 💀');
        return;
      }

      // Clean landing!
      const tx = Math.cos(g.angle);
      const ty = Math.sin(g.angle);
      const speedAlong = this.vx * tx + this.vy * ty;
      this.vx = tx * speedAlong;
      this.vy = ty * speedAlong;
      this.angle = g.angle;
      this.skaterMode = 'skating';
      this.activeTrick = 'none';
      this.boardFlip = 0;
      this.flipAccum = 0;
      skateAudio.playLand(true);

      // Landing dust
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

      this.bankCombo();
    }
  }

  private stepGrinding(dt: number, dirInput: number): void {
    if (!this.currentRail) {
      this.skaterMode = 'air';
      return;
    }
    this.coyoteTimer = 0.12;
    this.grindTickTimer += dt;

    // Move along rail horizontally/tangentially
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
    // Keep minimum grind momentum
    const sign = speed >= 0 ? 1 : -1;
    speed = sign * Math.max(240, Math.abs(speed) + 220 * Math.sin(railAngle) * sign * dt);
    this.vx = tx * speed;
    this.vy = ty * speed;
    this.x += this.vx * dt;
    this.y = bestInfo.cy;
    this.angle = railAngle;
    this.facing = this.vx >= 0 ? 1 : -1;

    // Balance mechanic
    this.grindDrift += (Math.random() - 0.5) * 2.4 * dt;
    this.grindBalance += (this.grindDrift + this.grindBalance * 0.65 - dirInput * 2.6) * dt;
    if (Math.abs(this.grindBalance) > 1.05) {
      this.clearCombo(true);
      this.enterRagdoll(false, 'ESCORREGOU DO CORRIMÃO!');
      return;
    }

    // Sparks + ticks + continuous grind score
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

    // Check if passed rail ends
    const minX = pts[0].x;
    const maxX = pts[pts.length - 1].x;
    if ((this.x < minX - 6 && bestSegIdx === 0) || (this.x > maxX + 6 && bestSegIdx === pts.length - 2)) {
      this.currentRail = null;
      this.skaterMode = 'air';
      this.vy = Math.min(this.vy, -80);
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
        if (info.dist < 22 && Math.abs(py - info.cy) < 20) {
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
    this.grindBalance = (Math.random() - 0.5) * 0.28;
    this.grindDrift = (Math.random() - 0.5) * 0.55;
    this.activeTrick = 'none';
    this.boardFlip = 0;
    this.flipAccum = 0;
    this.registerTrick(rail.label ? `Grind (${rail.label})` : '50-50 Grind', 220);
    skateAudio.playGrindTick(400);
  }

  private releaseOllie(): void {
    const power = Math.max(0.35, this.ollieCharge);
    this.ollieCharging = false;
    this.ollieCharge = 0;

    if (this.skaterMode !== 'skating' && this.skaterMode !== 'grinding' && this.coyoteTimer <= 0) {
      return;
    }

    const g = sampleTerrain(this.track.terrain, this.x);
    const nx = this.skaterMode === 'grinding' ? 0 : g.nx;
    const ny = this.skaterMode === 'grinding' ? -1 : g.ny;

    const popImpulse = 430 + power * 290;
    this.vx += nx * popImpulse * 0.45;
    this.vy += (ny * 0.85 - 0.25) * popImpulse;
    if (this.vy > -340) this.vy = -340 - power * 180;

    this.y -= 6;
    this.skaterMode = 'air';
    this.currentRail = null;
    this.coyoteTimer = 0;
    this.flipAccum = 0;

    skateAudio.playOllie(power);
    this.registerTrick(power > 0.85 ? 'Mega Ollie' : 'Ollie', power > 0.85 ? 120 : 60);
  }

  private tryAirTrick(kind: Exclude<TrickKind, 'none'>): void {
    if (this.skaterMode !== 'air' || this.trickCooldown > 0) return;
    this.activeTrick = kind;
    this.trickTimer = 0.44;
    this.trickCooldown = 0.36;
    this.boardFlip = 0;

    skateAudio.playTrick(kind);
    if (kind === 'kickflip') {
      this.registerTrick('Kickflip da Banana', 250);
    } else if (kind === 'bananagrab') {
      this.registerTrick('Banana Grab', 300);
    } else {
      this.registerTrick('Chimp Christ Air', 450);
    }
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
  }

  private checkPickupsAndHazards(): void {
    // 1. Turbo Banana Pads
    for (const pad of this.track.turboBananas) {
      if (pad.cooldown > 0) continue;
      if (Math.hypot(this.x - pad.x, this.y - pad.y) < 38) {
        pad.cooldown = 5.0;
        this.turboTimer = 2.6;
        const boost = 420;
        this.vx += (this.vx >= 0 ? 1 : -1) * boost;
        skateAudio.playTurboBanana();
        this.addCallout(this.x, this.y - 84, '⚡ TURBO POTÁSSIO!', '#fde047', 1.2);
      }
    }

    // 2. Player-thrown Banana Peels
    for (let i = this.thrownBananas.length - 1; i >= 0; i--) {
      const b = this.thrownBananas[i];
      if (b.ownerId === this.room.localPlayer.id && this.selfBananaGrace > 0) continue;
      if (Math.hypot(this.x - b.x, this.y - b.y) < 32) {
        this.thrownBananas.splice(i, 1);
        skateAudio.playSlipBanana();
        this.clearCombo(true);
        const who = b.ownerId === this.room.localPlayer.id ? 'NA PRÓPRIA CASCA!' : `NA CASCA DE ${b.ownerName.toUpperCase()}!`;
        this.enterRagdoll(true, `ESCORREGOU ${who} 🍌`);
        return;
      }
    }

    // 3. Solid Track Props (if skater body hits them without clearing)
    for (const prop of this.track.props) {
      const left = prop.x - prop.width * 0.45;
      const right = prop.x + prop.width * 0.45;
      const top = prop.y - prop.height + 8;
      if (
        this.x + 12 > left &&
        this.x - 12 < right &&
        this.y > top + 12 &&
        this.y - 52 < prop.y
      ) {
        // Don't collide if grinding its roof!
        if (this.skaterMode === 'grinding') continue;
        this.clearCombo(true);
        const msg =
          prop.kind === 'pole'
            ? 'DE CARA NO POSTE! 💡'
            : prop.kind === 'parked-car'
              ? `BEIJOU O ${prop.label ?? 'CARRO'}!`
              : 'BATEU NO OBSTÁCULO!';
        this.enterRagdoll(false, msg);
        return;
      }
    }

    // 4. Moving Traffic Cars
    for (const car of this.cars) {
      const left = car.x - car.width * 0.46;
      const right = car.x + car.width * 0.46;
      const roofY = car.y - car.height;
      // Can land/grind car roof!
      if (
        this.skaterMode === 'air' &&
        this.vy >= 0 &&
        this.x > left &&
        this.x < right &&
        Math.abs(this.y - roofY) < 18
      ) {
        this.y = roofY;
        this.vy = -260;
        this.registerTrick('Surf no Teto do Carro!', 450);
        skateAudio.playOllie(0.85);
        skateAudio.playHonk();
        return;
      }

      if (
        this.x + 14 > left &&
        this.x - 14 < right &&
        this.y > roofY + 12 &&
        this.y - 45 < car.y
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
    this.ollieCharging = false;
    this.ollieCharge = 0;
    this.activeTrick = 'none';
    this.currentRail = null;
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
      targetX += Math.max(-180, Math.min(180, this.vx * 0.22));
      targetY += Math.max(-90, Math.min(90, this.vy * 0.12));
    }

    const followLerp = 1 - Math.exp(-8 * dt);
    this.camX += (targetX - this.camX) * followLerp;
    this.camY += (targetY - this.camY) * followLerp;

    const targetZoom = Math.max(0.68, Math.min(1.04, 1.02 - speed / 2600));
    this.camZoom += (targetZoom - this.camZoom) * (1 - Math.exp(-3.5 * dt));
  }

  private stepSessionTimer(dt: number): void {
    if (this.mode !== 'session90') return;
    this.sessionRemaining -= dt;
    if (this.sessionRemaining <= 0) {
      this.sessionRemaining = 0;
      this.finishSession();
    }
  }

  private finishSession(): void {
    this.paused = true;
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

    if (this.boneScore > this.trickScore) {
      this.dom.summaryHeadline.textContent = '🏥 Paciente VIP do SUS!';
      this.dom.summaryDiagnosis.textContent = `Você quebrou ${this.bonesBroken} ossos e deu prejuízo histórico pra ambulância!`;
    } else if (total >= 15000) {
      this.dom.summaryHeadline.textContent = '🏆 Lenda do Skate Macaco!';
      this.dom.summaryDiagnosis.textContent = 'Tony Hawk ligou pedindo aula de Banana Grab!';
    } else {
      this.dom.summaryHeadline.textContent = '🛹 Sessão Encerrada!';
      this.dom.summaryDiagnosis.textContent = 'Bom rolê! Tente combinar Kickflip + Christ Air + Grind pra explodir o multiplicador.';
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
        ollieCharge: Number(this.ollieCharge.toFixed(2)),
        activeTrick: this.activeTrick,
        trickTimer: Number(this.trickTimer.toFixed(2)),
        boardFlip: Number(this.boardFlip.toFixed(2)),
        trickScore: this.trickScore,
        boneScore: this.boneScore,
        bestCombo: this.bestCombo,
        bestCrash: this.bestCrash,
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

    // Prune stale remotes
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
    this.dom.timerVal.textContent = String(Math.ceil(this.sessionRemaining));

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

    // Multiplayer live leaderboard
    const players = this.room.getPlayers();
    if (players.length > 1) {
      this.dom.mpBoard.classList.add('visible');
      const rowsHtml = players
        .map((p) => {
          const isMe = p.id === this.room.localPlayer.id;
          const combo = isMe ? this.bestCombo : (this.remotes.get(p.id)?.snap.bestCombo ?? 0);
          const crash = isMe ? this.bestCrash : (this.remotes.get(p.id)?.snap.bestCrash ?? 0);
          return `<div class="mp-row">
            <span class="mp-name" style="color:${p.color}">${isMe ? '⭐ ' : ''}${escapeHtml(p.name)}</span>
            <span class="mp-stats">🛹${combo} • 💀${crash}</span>
          </div>`;
        })
        .join('');
      this.dom.mpRows.innerHTML = rowsHtml;
    } else {
      this.dom.mpBoard.classList.remove('visible');
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
}
