import { monkeyAudio, reportGameScore } from '@monkey-slop/sdk';
import {
  BLOON_DEFS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAPS,
  MONKEY_QUIPS,
  STARTING_BANANAS,
  STARTING_LIVES,
  TOWER_DEFS,
  TOWER_RADIUS,
  getWaveSpec,
} from './data';
import { compileMapPath, isValidTowerSpot, samplePathPosition } from './maps';
import type { TdNetworkBridge } from './network';
import { getTowerEffectiveRange, renderGameCanvas } from './renderer';
import type {
  BloonInstance,
  BloonType,
  FloatingText,
  MapConfig,
  MapId,
  Particle,
  PoisonCloud,
  Projectile,
  ShockwaveRing,
  SniperTracer,
  TargetMode,
  TowerInstance,
  TowerType,
} from './types';

interface SpawnEntry {
  type: BloonType;
  wait: number;
  isTroll?: boolean;
}

export interface UiSnapshot {
  mapId: MapId;
  bananas: number;
  lives: number;
  wave: number;
  score: number;
  speed: 1 | 2;
  autoWave: boolean;
  waveActive: boolean;
  waveTitle: string;
  selectedTower: TowerInstance | null;
  placingType: TowerType | null;
  gameOver: boolean;
  victoryShown: boolean;
  isCoop: boolean;
  localPlayerId: string;
  playersCount: number;
}

export class MonkeyBloonsGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private net: TdNetworkBridge;
  private onUiUpdate: (snap: UiSnapshot) => void;

  private rafId = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private uiDirty = true;

  public mapId: MapId = 'selva';
  public bananas = STARTING_BANANAS;
  public lives = STARTING_LIVES;
  public wave = 0;
  public score = 0;
  public speed: 1 | 2 = 1;
  public autoWave = false;

  public towers: TowerInstance[] = [];
  public bloons: BloonInstance[] = [];
  public projectiles: Projectile[] = [];
  public clouds: PoisonCloud[] = [];
  public rings: ShockwaveRing[] = [];
  public tracers: SniperTracer[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];

  private spawnQueue: SpawnEntry[] = [];
  private spawnTimer = 0;
  private waveActive = false;
  private autoWaveDelay = 0;
  private shakeAmount = 0;
  private bossBannerText: string | null = null;
  private bossBannerTimer = 0;

  public selectedTowerId: string | null = null;
  public placingType: TowerType | null = null;
  private hoverPos: { x: number; y: number } | null = null;

  public gameOver = false;
  public victoryModalOpen = false;
  private victoryAlreadyTriggered = false;
  private scoreReportedOnEnd = false;
  private idCounter = 1;

  constructor(
    canvas: HTMLCanvasElement,
    net: TdNetworkBridge,
    onUiUpdate: (snap: UiSnapshot) => void,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D não suportado');
    this.ctx = context;
    this.net = net;
    this.onUiUpdate = onUiUpdate;

    this.bindCanvasEvents();
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.net.room.localPlayer.id.slice(-4)}-${this.idCounter}`;
  }

  public getMap(): MapConfig {
    return MAPS[this.mapId];
  }

  public startLoop(): void {
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;
      this.update(rawDt);
      this.render();
      if (this.uiDirty) {
        this.uiDirty = false;
        this.emitUi();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
  }

  private bindCanvasEvents(): void {
    const toLogical = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
        y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
      };
    };

    this.canvas.addEventListener('mousemove', (e) => {
      this.hoverPos = toLogical(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPos = null;
    });

    this.canvas.addEventListener('click', (e) => {
      const pos = toLogical(e.clientX, e.clientY);
      this.handleCanvasClick(pos.x, pos.y);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.placingType) {
        this.placingType = null;
        this.uiDirty = true;
      } else if (this.selectedTowerId) {
        this.selectedTowerId = null;
        this.uiDirty = true;
      }
    });
  }

  private handleCanvasClick(x: number, y: number): void {
    if (this.gameOver) return;

    if (this.placingType) {
      this.tryPlaceTower(this.placingType, x, y);
      return;
    }

    // Select clicked tower
    const clicked = this.towers.find((t) => Math.hypot(t.x - x, t.y - y) <= TOWER_RADIUS + 6);
    if (clicked) {
      monkeyAudio.play('click', 0.18);
      this.selectedTowerId = clicked.id;
      this.uiDirty = true;
    } else if (this.selectedTowerId) {
      this.selectedTowerId = null;
      this.uiDirty = true;
    }
  }

  public selectShopTower(type: TowerType | null): void {
    monkeyAudio.play('click', 0.18);
    this.placingType = this.placingType === type ? null : type;
    if (this.placingType) this.selectedTowerId = null;
    this.uiDirty = true;
  }

  public tryPlaceTower(type: TowerType, x: number, y: number): boolean {
    const def = TOWER_DEFS[type];
    if (this.bananas < def.cost) {
      monkeyAudio.play('boing', 0.2);
      this.addFloatingText(x, y - 16, 'SEM BANANA! 🍌', '#fca5a5', 1.0);
      return false;
    }
    const valid = isValidTowerSpot(this.getMap(), this.towers, x, y);
    if (!valid.ok) {
      monkeyAudio.play('boing', 0.2);
      this.addFloatingText(x, y - 16, valid.reason ?? 'Lugar inválido!', '#fca5a5', 0.95);
      return false;
    }

    const p = this.net.room.localPlayer;
    const tower: TowerInstance = {
      id: this.nextId('tw'),
      type,
      x: Math.round(x),
      y: Math.round(y),
      level: 0,
      ownerId: p.id,
      ownerName: p.name,
      ownerColor: p.color,
      angle: 0,
      cooldown: 0.1,
      recoil: 0,
      targetMode: type === 'sniper' ? 'strong' : 'first',
      totalSpent: def.cost,
      pops: 0,
      buffedMultiplier: 1,
      buffedRangeMultiplier: 1,
      lastTalkAt: 0,
    };

    this.bananas -= def.cost;
    this.towers.push(tower);
    this.selectedTowerId = tower.id;
    this.placingType = null;
    monkeyAudio.play('banana', 0.24);
    this.spawnPopParticles(x, y, def.color, 10);
    const quip = MONKEY_QUIPS[Math.floor(Math.random() * MONKEY_QUIPS.length)];
    this.addFloatingText(x, y - 24, quip, '#fef08a', 0.9);
    this.net.send({ action: 'place_tower', tower });
    this.uiDirty = true;
    return true;
  }

  public upgradeSelectedTower(): void {
    if (!this.selectedTowerId) return;
    const tower = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!tower) return;

    if (tower.ownerId !== this.net.room.localPlayer.id && this.net.isOnline()) {
      this.net.toast(`Essa torre é de ${tower.ownerName}!`, 'info');
      return;
    }
    if (tower.level >= 3) return;

    const def = TOWER_DEFS[tower.type];
    const upg = def.upgrades[tower.level];
    if (this.bananas < upg.cost) {
      monkeyAudio.play('boing', 0.2);
      this.addFloatingText(tower.x, tower.y - 25, `Falta ${upg.cost - this.bananas} 🍌!`, '#fca5a5', 1);
      return;
    }

    this.bananas -= upg.cost;
    tower.level += 1;
    tower.totalSpent += upg.cost;

    if (tower.type === 'banana' && tower.level === 3) {
      monkeyAudio.play('rage', 0.3);
      this.shakeAmount = Math.max(this.shakeAmount, 7);
    } else {
      monkeyAudio.play('fanfare', 0.22);
    }
    this.spawnPopParticles(tower.x, tower.y, '#fde047', 16);
    this.addFloatingText(tower.x, tower.y - 28, upg.quip, '#fde047', 1.1);
    this.net.send({
      action: 'upgrade_tower',
      towerId: tower.id,
      level: tower.level,
      cost: upg.cost,
    });
    this.uiDirty = true;
  }

  public sellSelectedTower(): void {
    if (!this.selectedTowerId) return;
    const idx = this.towers.findIndex((t) => t.id === this.selectedTowerId);
    if (idx === -1) return;
    const tower = this.towers[idx];
    if (tower.ownerId !== this.net.room.localPlayer.id && this.net.isOnline()) {
      this.net.toast(`Você não pode vender o macaco de ${tower.ownerName}!`, 'info');
      return;
    }
    const refund = Math.round(tower.totalSpent * 0.7);
    this.bananas += refund;
    this.towers.splice(idx, 1);
    this.selectedTowerId = null;
    monkeyAudio.play('coin', 0.25);
    this.spawnPopParticles(tower.x, tower.y, '#facc15', 12);
    this.addFloatingText(tower.x, tower.y - 18, `+${refund} 🍌 Vendeu!`, '#fde047', 1.0);
    this.net.send({ action: 'sell_tower', towerId: tower.id });
    this.uiDirty = true;
  }

  public cycleTargetMode(): void {
    if (!this.selectedTowerId) return;
    const tower = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!tower) return;
    if (tower.ownerId !== this.net.room.localPlayer.id && this.net.isOnline()) return;

    const order: TargetMode[] = ['first', 'strong', 'close', 'last'];
    const next = order[(order.indexOf(tower.targetMode) + 1) % order.length];
    tower.targetMode = next;
    monkeyAudio.play('click', 0.16);
    this.net.send({ action: 'target_mode', towerId: tower.id, targetMode: next });
    this.uiDirty = true;
  }

  public startNextWave(fromRemote = false): void {
    if (this.gameOver || this.waveActive) return;
    if (!fromRemote && this.net.isOnline() && !this.net.isHost()) {
      // Allow any player to request wave start; broadcast it!
    }
    this.wave += 1;
    this.launchWave(this.wave);
    if (!fromRemote) {
      this.net.send({ action: 'start_wave', wave: this.wave });
    }
    this.uiDirty = true;
  }

  private launchWave(waveNum: number): void {
    const spec = getWaveSpec(waveNum);
    this.spawnQueue = [];
    for (const grp of spec.groups) {
      for (let i = 0; i < grp.count; i++) {
        this.spawnQueue.push({
          type: grp.type,
          wait: i === grp.count - 1 ? grp.interval + (grp.delayAfter ?? 0.35) : grp.interval,
        });
      }
    }
    this.waveActive = true;
    this.spawnTimer = 0.05;
    this.autoWaveDelay = 0;

    if (spec.bossBanner) {
      this.bossBannerText = spec.bossBanner;
      this.bossBannerTimer = 5.0;
      this.shakeAmount = Math.max(this.shakeAmount, 9);
      monkeyAudio.play('rage', 0.3);
      this.net.toast(spec.bossBanner, 'chaos');
    } else {
      monkeyAudio.play('click', 0.22);
    }
  }

  public setMap(mapId: MapId, fromRemote = false): void {
    if (this.mapId === mapId && this.towers.length === 0) return;
    this.mapId = mapId;
    this.resetMatchState(false);
    if (!fromRemote) {
      this.net.send({ action: 'set_map', mapId });
    }
    this.uiDirty = true;
  }

  public toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    monkeyAudio.play('click', 0.18);
    this.net.send({ action: 'set_speed', speed: this.speed });
    this.uiDirty = true;
  }

  public toggleAutoWave(): void {
    this.autoWave = !this.autoWave;
    monkeyAudio.play('click', 0.18);
    this.net.send({ action: 'set_auto_wave', autoWave: this.autoWave });
    this.uiDirty = true;
  }

  public giftBananasToFriends(): void {
    if (!this.net.isOnline()) {
      this.net.toast('Entre em uma sala Co-op para mandar bananas pros amigos!', 'info');
      return;
    }
    if (this.bananas < 50) {
      monkeyAudio.play('boing', 0.2);
      this.net.toast('Você precisa de pelo menos 50 🍌 para enviar!', 'chaos');
      return;
    }
    this.bananas -= 50;
    monkeyAudio.play('banana', 0.28);
    this.addFloatingText(CANVAS_WIDTH / 2, 110, '🍌 -50 Bananas enviadas pros amigos!', '#fde047', 1.15);
    this.net.toast('Você mandou +50 🍌 para os macacos da sala!', 'banana');
    this.net.send({
      action: 'gift_bananas',
      amount: 50,
      fromName: this.net.room.localPlayer.name,
    });
    this.uiDirty = true;
  }

  public sendTrollBloons(): void {
    if (!this.net.isOnline()) {
      this.net.toast('Entre em uma sala Co-op para trolar seus amigos!', 'info');
      return;
    }
    monkeyAudio.play('screech', 0.3);
    this.spawnTrollBloons(5, this.net.room.localPlayer.name);
    this.net.send({
      action: 'troll_bloons',
      count: 5,
      fromName: this.net.room.localPlayer.name,
    });
    this.uiDirty = true;
  }

  private spawnTrollBloons(count: number, fromName: string): void {
    const types: BloonType[] = ['pink', 'camo', 'pink', 'yellow', 'camo'];
    for (let i = 0; i < count; i++) {
      this.spawnQueue.unshift({
        type: types[i % types.length],
        wait: 0.22,
        isTroll: true,
      });
    }
    if (!this.waveActive) {
      this.waveActive = true;
      this.spawnTimer = 0.05;
    }
    this.shakeAmount = Math.max(this.shakeAmount, 6);
    this.addFloatingText(
      CANVAS_WIDTH / 2,
      140,
      `😈 ${fromName} mandou +${count} Bexigas Surpresa!`,
      '#fb7185',
      1.2,
    );
    this.net.toast(`😈 ${fromName} mandou +${count} Bexigas Surpresa!`, 'chaos');
  }

  public restartMatch(fromRemote = false): void {
    this.resetMatchState(true);
    if (!fromRemote) {
      this.net.send({ action: 'restart_match', mapId: this.mapId });
    }
    this.uiDirty = true;
  }

  private resetMatchState(playSound: boolean): void {
    this.bananas = STARTING_BANANAS;
    this.lives = STARTING_LIVES;
    this.wave = 0;
    this.score = 0;
    this.towers = [];
    this.bloons = [];
    this.projectiles = [];
    this.clouds = [];
    this.rings = [];
    this.tracers = [];
    this.particles = [];
    this.floatingTexts = [];
    this.spawnQueue = [];
    this.waveActive = false;
    this.selectedTowerId = null;
    this.placingType = null;
    this.gameOver = false;
    this.victoryModalOpen = false;
    this.victoryAlreadyTriggered = false;
    this.scoreReportedOnEnd = false;
    this.bossBannerText = null;
    this.bossBannerTimer = 0;
    if (playSound) monkeyAudio.play('banana', 0.22);
  }

  public continueEndless(): void {
    this.victoryModalOpen = false;
    monkeyAudio.play('click', 0.2);
    this.uiDirty = true;
  }

  public handleRemoteMessage(senderId: string, msg: import('./types').TdNetMessage): void {
    switch (msg.action) {
      case 'place_tower': {
        if (!this.towers.some((t) => t.id === msg.tower.id)) {
          this.towers.push({ ...msg.tower });
          this.spawnPopParticles(msg.tower.x, msg.tower.y, msg.tower.ownerColor, 10);
          monkeyAudio.play('banana', 0.16);
          this.uiDirty = true;
        }
        break;
      }
      case 'upgrade_tower': {
        const t = this.towers.find((tw) => tw.id === msg.towerId);
        if (t) {
          t.level = msg.level;
          t.totalSpent += msg.cost;
          this.spawnPopParticles(t.x, t.y, '#fde047', 12);
          this.addFloatingText(t.x, t.y - 24, `UPGRADE Lv${t.level}!`, '#fde047', 1);
          this.uiDirty = true;
        }
        break;
      }
      case 'sell_tower': {
        const idx = this.towers.findIndex((tw) => tw.id === msg.towerId);
        if (idx !== -1) {
          const tw = this.towers[idx];
          this.spawnPopParticles(tw.x, tw.y, '#facc15', 10);
          this.towers.splice(idx, 1);
          if (this.selectedTowerId === msg.towerId) this.selectedTowerId = null;
          this.uiDirty = true;
        }
        break;
      }
      case 'target_mode': {
        const t = this.towers.find((tw) => tw.id === msg.towerId);
        if (t) {
          t.targetMode = msg.targetMode;
          this.uiDirty = true;
        }
        break;
      }
      case 'start_wave': {
        if (!this.waveActive && msg.wave > this.wave) {
          this.wave = msg.wave;
          this.launchWave(this.wave);
          this.uiDirty = true;
        }
        break;
      }
      case 'set_map': {
        this.setMap(msg.mapId, true);
        break;
      }
      case 'set_speed': {
        this.speed = msg.speed;
        this.uiDirty = true;
        break;
      }
      case 'set_auto_wave': {
        this.autoWave = msg.autoWave;
        this.uiDirty = true;
        break;
      }
      case 'gift_bananas': {
        this.bananas += msg.amount;
        monkeyAudio.play('banana', 0.28);
        this.net.toast(`🍌 ${msg.fromName} mandou +${msg.amount} Bananas pra você!`, 'banana');
        this.addFloatingText(
          CANVAS_WIDTH / 2,
          100,
          `🍌 +${msg.amount} de ${msg.fromName}!`,
          '#fde047',
          1.2,
        );
        this.uiDirty = true;
        break;
      }
      case 'troll_bloons': {
        if (senderId !== this.net.room.localPlayer.id) {
          monkeyAudio.play('screech', 0.28);
          this.spawnTrollBloons(msg.count, msg.fromName);
          this.uiDirty = true;
        }
        break;
      }
      case 'restart_match': {
        this.mapId = msg.mapId;
        this.restartMatch(true);
        break;
      }
      case 'sync_snapshot': {
        this.mapId = msg.mapId;
        this.wave = msg.wave;
        this.lives = msg.lives;
        this.score = msg.score;
        this.speed = msg.speed;
        this.autoWave = msg.autoWave;
        this.towers = msg.towers.map((t) => ({ ...t }));
        this.uiDirty = true;
        break;
      }
      case 'wave_sync': {
        if (!this.net.isHost()) {
          this.lives = msg.lives;
          this.score = Math.max(this.score, msg.score);
          this.uiDirty = true;
        }
        break;
      }
    }
  }

  public sendSnapshotToRoom(): void {
    if (!this.net.isHost() || !this.net.isOnline()) return;
    this.net.send({
      action: 'sync_snapshot',
      mapId: this.mapId,
      wave: this.wave,
      lives: this.lives,
      score: this.score,
      speed: this.speed,
      autoWave: this.autoWave,
      towers: this.towers,
    });
  }

  private update(rawDt: number): void {
    const dt = rawDt * this.speed;
    this.elapsedTime += dt;

    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - rawDt * 22);
    }
    if (this.bossBannerTimer > 0) {
      this.bossBannerTimer -= rawDt;
      if (this.bossBannerTimer <= 0) this.bossBannerText = null;
    }

    // Visual fx always update even after game over
    this.updateEffects(rawDt);

    if (this.gameOver) return;

    // Spawn queue
    if (this.waveActive && this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      while (this.waveActive && this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
        const next = this.spawnQueue.shift()!;
        this.spawnBloon(next.type, 0, next.isTroll);
        this.spawnTimer += next.wait;
      }
    }

    // Update Bloons
    this.updateBloons(dt);

    // Apply DJ Buffs
    this.computeDjBuffs();

    // Update Towers
    this.updateTowers(dt);

    // Update Projectiles
    this.updateProjectiles(dt);

    // Update Poison Clouds
    this.updatePoisonClouds(dt);

    // Check Wave Complete
    if (this.waveActive && this.spawnQueue.length === 0 && this.bloons.length === 0) {
      this.waveActive = false;
      const spec = getWaveSpec(this.wave);
      this.bananas += spec.bonusBananas;
      this.score += this.wave * 100;
      monkeyAudio.play('fanfare', 0.22);
      this.addFloatingText(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 - 20,
        `ONDA ${this.wave} LIMPA! +${spec.bonusBananas} 🍌`,
        '#4ade80',
        1.3,
      );

      if (this.net.isHost() && this.net.isOnline()) {
        this.net.send({
          action: 'wave_sync',
          wave: this.wave,
          lives: this.lives,
          score: this.score,
        });
      }

      if (this.wave === 15 && !this.victoryAlreadyTriggered) {
        this.victoryAlreadyTriggered = true;
        this.victoryModalOpen = true;
        reportGameScore('monkey-bloons-td', this.score, {
          wave: this.wave,
          map: this.mapId,
          victory: 1,
        });
      } else if (this.autoWave && !this.victoryModalOpen) {
        this.autoWaveDelay = 1.4;
      }
      this.uiDirty = true;
    }

    if (!this.waveActive && this.autoWave && !this.victoryModalOpen && this.wave > 0) {
      this.autoWaveDelay -= dt;
      if (this.autoWaveDelay <= 0) {
        this.startNextWave();
      }
    }
  }

  private spawnBloon(type: BloonType, distance: number, isTroll = false): BloonInstance {
    const def = BLOON_DEFS[type];
    const map = this.getMap();
    const pos = samplePathPosition(map, distance);
    const waveScale = def.isBoss && this.wave > 5 ? 1 + (this.wave - 5) * 0.14 : 1;
    const hp = Math.round(def.hp * waveScale);
    const bloon: BloonInstance = {
      id: this.nextId('bl'),
      type,
      hp,
      maxHp: hp,
      distance,
      x: pos.x,
      y: pos.y,
      slowTimer: 0,
      slowFactor: 1,
      camoStripped: false,
      hitFlash: 0,
      wobbleSeed: Math.random() * Math.PI * 2,
      isTroll,
    };
    this.bloons.push(bloon);
    return bloon;
  }

  private updateBloons(dt: number): void {
    const map = this.getMap();
    const path = compileMapPath(map);

    for (let i = this.bloons.length - 1; i >= 0; i--) {
      const b = this.bloons[i];
      const def = BLOON_DEFS[b.type];
      if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 6);
      if (b.slowTimer > 0) {
        b.slowTimer -= dt;
        if (b.slowTimer <= 0) b.slowFactor = 1;
      }

      const moveSpeed = def.speed * (b.slowTimer > 0 ? b.slowFactor : 1);
      b.distance += moveSpeed * dt;

      if (b.distance >= path.totalLength) {
        this.bloons.splice(i, 1);
        this.lives = Math.max(0, this.lives - def.livesDamage);
        this.shakeAmount = Math.max(this.shakeAmount, def.isBoss ? 14 : 6);
        monkeyAudio.play('rage', 0.25);
        this.addFloatingText(
          Math.min(CANVAS_WIDTH - 70, b.x),
          Math.max(40, b.y),
          `-${def.livesDamage} ❤️`,
          '#ef4444',
          1.2,
        );
        this.uiDirty = true;

        if (this.lives <= 0 && !this.gameOver) {
          this.triggerGameOver();
        }
        continue;
      }

      const pos = samplePathPosition(map, b.distance);
      b.x = pos.x;
      b.y = pos.y;
    }
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.waveActive = false;
    monkeyAudio.play('rage', 0.4);
    if (!this.scoreReportedOnEnd) {
      this.scoreReportedOnEnd = true;
      reportGameScore('monkey-bloons-td', this.score, {
        wave: this.wave,
        map: this.mapId,
      });
    }
    this.uiDirty = true;
  }

  private computeDjBuffs(): void {
    for (const t of this.towers) {
      t.buffedMultiplier = 1;
      t.buffedRangeMultiplier = 1;
    }
    for (const dj of this.towers) {
      if (dj.type !== 'dj') continue;
      const djRange = getTowerEffectiveRange(dj);
      const atkMult = [1.2, 1.26, 1.35, 1.5][dj.level];
      const rngMult = [1.05, 1.08, 1.15, 1.22][dj.level];
      for (const ally of this.towers) {
        if (ally.type === 'dj' || ally.id === dj.id) continue;
        if (Math.hypot(ally.x - dj.x, ally.y - dj.y) <= djRange) {
          ally.buffedMultiplier = Math.max(ally.buffedMultiplier, atkMult);
          ally.buffedRangeMultiplier = Math.max(ally.buffedRangeMultiplier, rngMult);
        }
      }
    }
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - dt * 5);
      if (tower.cooldown > 0) tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;

      if (tower.type === 'dj') {
        this.fireDjTower(tower);
        continue;
      }

      const detectsCamo = this.towerDetectsCamo(tower);
      const range = getTowerEffectiveRange(tower);
      const target = this.pickTarget(tower, range, detectsCamo);
      if (!target) continue;

      tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
      tower.recoil = 1;

      const def = TOWER_DEFS[tower.type];
      let fireRate = def.fireRate * tower.buffedMultiplier;

      if (tower.type === 'banana') {
        if (tower.level === 1) fireRate *= 1.25;
        if (tower.level === 2) fireRate *= 1.75;
        if (tower.level >= 3) fireRate *= 2.4;
        this.fireBananaTower(tower, target);
      } else if (tower.type === 'havaianas') {
        if (tower.level >= 1) fireRate *= 1.15;
        if (tower.level >= 3) fireRate *= 1.25;
        this.fireHavaianasTower(tower, target);
      } else if (tower.type === 'sniper') {
        if (tower.level >= 1) fireRate *= 1.25;
        if (tower.level >= 3) fireRate *= 1.2;
        this.fireSniperTower(tower, target);
      } else if (tower.type === 'coco') {
        if (tower.level >= 2) fireRate *= 1.15;
        this.fireCocoTower(tower, target);
      }

      tower.cooldown = 1 / fireRate;
    }
  }

  private towerDetectsCamo(tower: TowerInstance): boolean {
    if (tower.type === 'dj') return true;
    if (tower.type === 'banana' && tower.level >= 2) return true;
    if (tower.type === 'havaianas' && tower.level >= 2) return true;
    if (tower.type === 'sniper' && tower.level >= 1) return true;
    return false;
  }

  private pickTarget(tower: TowerInstance, range: number, detectsCamo: boolean): BloonInstance | null {
    let best: BloonInstance | null = null;
    let bestScore = -Infinity;

    for (const b of this.bloons) {
      const def = BLOON_DEFS[b.type];
      if (def.isCamo && !b.camoStripped && !detectsCamo) continue;

      const dist = Math.hypot(b.x - tower.x, b.y - tower.y);
      if (dist > range + def.radius * 0.5) continue;

      let score = 0;
      switch (tower.targetMode) {
        case 'first':
          score = b.distance;
          break;
        case 'last':
          score = -b.distance;
          break;
        case 'close':
          score = -dist;
          break;
        case 'strong':
          score = (def.isBoss ? 10000 : def.livesDamage * 10 + b.hp) * 1000 + b.distance;
          break;
      }

      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  private fireBananaTower(tower: TowerInstance, target: BloonInstance): void {
    const baseAngle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const angles =
      tower.level >= 3 ? [-0.14, 0, 0.14] : tower.level === 2 ? [-0.09, 0.09] : [0];
    const dmg = tower.level >= 3 ? 3 : tower.level >= 1 ? 2 : 1;
    const isFire = tower.level >= 3;
    const detectsCamo = tower.level >= 2;
    const popsLead = tower.level >= 3;

    for (const offset of angles) {
      const ang = baseAngle + offset;
      const spd = 460;
      this.projectiles.push({
        id: this.nextId('pr'),
        kind: isFire ? 'fire_banana' : 'banana',
        x: tower.x + Math.cos(ang) * 18,
        y: tower.y + Math.sin(ang) * 18,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        targetId: null,
        speed: spd,
        damage: dmg,
        pierceLeft: tower.level >= 3 ? 2 : 1,
        hitIds: [],
        homing: false,
        ricochetsLeft: 0,
        detectsCamo,
        popsLead,
        pushBack: 0,
        slowDuration: 0,
        slowFactor: 1,
        splashRadius: 0,
        poisonDuration: 0,
        poisonDps: 0,
        critChance: 0,
        ownerTowerId: tower.id,
        rotation: ang,
        ttl: 0.9,
      });
    }
    monkeyAudio.play('banana', 0.07);
  }

  private fireHavaianasTower(tower: TowerInstance, target: BloonInstance): void {
    const ang = Math.atan2(target.y - tower.y, target.x - tower.x);
    const homing = tower.level >= 2;
    const dmg = [2, 3, 4, 6][tower.level];
    const pushBack = [26, 40, 44, 54][tower.level];
    const slowDuration = [1.5, 2.0, 2.2, 2.5][tower.level];
    const slowFactor = [0.58, 0.48, 0.45, 0.4][tower.level];
    const ricochetsLeft = [0, 0, 2, 4][tower.level];
    const spd = homing ? 390 : 410;

    this.projectiles.push({
      id: this.nextId('pr'),
      kind: 'chinelo',
      x: tower.x + Math.cos(ang) * 18,
      y: tower.y + Math.sin(ang) * 18,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      targetId: target.id,
      speed: spd,
      damage: dmg,
      pierceLeft: 1 + ricochetsLeft,
      hitIds: [],
      homing,
      ricochetsLeft,
      detectsCamo: tower.level >= 2,
      popsLead: true,
      pushBack,
      slowDuration,
      slowFactor,
      splashRadius: 0,
      poisonDuration: 0,
      poisonDps: 0,
      critChance: tower.level >= 3 ? 0.35 : 0,
      ownerTowerId: tower.id,
      rotation: ang,
      ttl: 1.6,
    });
    monkeyAudio.play('slap', 0.14);
  }

  private fireSniperTower(tower: TowerInstance, target: BloonInstance): void {
    const gunX = tower.x + Math.cos(tower.angle) * 24;
    const gunY = tower.y + Math.sin(tower.angle) * 24;

    // 12% hilarious vesgo miss chance!
    if (Math.random() < 0.12) {
      const missAngle = tower.angle + (Math.random() > 0.5 ? 0.28 : -0.28);
      const dist = Math.hypot(target.x - gunX, target.y - gunY) + 50;
      const mx = gunX + Math.cos(missAngle) * dist;
      const my = gunY + Math.sin(missAngle) * dist;
      this.tracers.push({ x1: gunX, y1: gunY, x2: mx, y2: my, isMiss: true, isCrit: false, ttl: 0.25 });
      this.addFloatingText(target.x, target.y - 22, 'ERROU VESGO!', '#fde047', 0.95);
      monkeyAudio.play('boing', 0.14);
      return;
    }

    const dmg = [5, 7, 12, 18][tower.level];
    const popsLead = tower.level >= 2;

    this.tracers.push({
      x1: gunX,
      y1: gunY,
      x2: target.x,
      y2: target.y,
      isMiss: false,
      isCrit: true,
      ttl: 0.22,
    });

    this.shakeAmount = Math.max(this.shakeAmount, tower.level >= 3 ? 6 : 3);
    monkeyAudio.play('explosion', 0.14);

    if (tower.level >= 3) {
      // Sniper Vesgo Lendário explosive crit!
      this.rings.push({
        x: target.x,
        y: target.y,
        radius: 10,
        maxRadius: 72,
        color: '#fb7185',
        alpha: 0.85,
        lineWidth: 4,
      });
      this.spawnPopParticles(target.x, target.y, '#fb7185', 14);
      this.addFloatingText(target.x, target.y - 24, 'CRÍTICO VESGO! 💥', '#fb7185', 1.15);
      const snapshot = [...this.bloons];
      for (const b of snapshot) {
        if (Math.hypot(b.x - target.x, b.y - target.y) <= 72) {
          this.damageBloon(b, b.id === target.id ? dmg : 8, true, tower.id);
        }
      }
    } else {
      this.damageBloon(target, dmg, popsLead, tower.id);
      if (Math.random() < 0.35) {
        this.addFloatingText(target.x, target.y - 20, 'NA MOSCA! 🎯', '#fda4af', 0.95);
      }
    }
  }

  private fireCocoTower(tower: TowerInstance, target: BloonInstance): void {
    const ang = Math.atan2(target.y - tower.y, target.x - tower.x);
    const spd = 290;
    const dmg = [2, 3, 4, 7][tower.level];
    const splashRadius = [60, 74, 88, 105][tower.level];
    const poisonDuration = [1.8, 2.8, 3.2, 3.8][tower.level];
    const poisonDps = [2, 4, 6, 12][tower.level];
    const slowFactor = tower.level >= 2 ? 0.65 : 1;

    this.projectiles.push({
      id: this.nextId('pr'),
      kind: 'coco',
      x: tower.x + Math.cos(ang) * 20,
      y: tower.y + Math.sin(ang) * 20,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      targetId: null,
      targetX: target.x,
      targetY: target.y,
      speed: spd,
      damage: dmg,
      pierceLeft: 1,
      hitIds: [],
      homing: false,
      ricochetsLeft: 0,
      detectsCamo: true, // Splash fumes hit camo on impact!
      popsLead: true,
      pushBack: 0,
      slowDuration: tower.level >= 2 ? 1.5 : 0,
      slowFactor,
      splashRadius,
      poisonDuration,
      poisonDps,
      critChance: 0,
      ownerTowerId: tower.id,
      rotation: 0,
      ttl: 1.2,
    });
    monkeyAudio.play('boing', 0.12);
  }

  private fireDjTower(tower: TowerInstance): void {
    const range = getTowerEffectiveRange(tower);
    const anyInRange = this.bloons.some(
      (b) => Math.hypot(b.x - tower.x, b.y - tower.y) <= range + 20,
    );
    if (!anyInRange) {
      tower.cooldown = 0.2;
      return;
    }

    const rate = TOWER_DEFS.dj.fireRate * (tower.level >= 2 ? 1.2 : 1);
    tower.cooldown = 1 / rate;
    tower.recoil = 0.8;

    this.rings.push({
      x: tower.x,
      y: tower.y,
      radius: 18,
      maxRadius: range,
      color: tower.level >= 3 ? '#facc15' : '#c084fc',
      alpha: 0.75,
      lineWidth: 4,
    });

    const slowFactor = [0.62, 0.54, 0.48, 0.42][tower.level];
    const push = tower.level >= 3 ? 22 : 0;
    const dmg = tower.level >= 2 ? 1 : 0;

    const snapshot = [...this.bloons];
    for (const b of snapshot) {
      if (Math.hypot(b.x - tower.x, b.y - tower.y) <= range + 12) {
        b.slowFactor = Math.min(b.slowFactor, slowFactor);
        b.slowTimer = Math.max(b.slowTimer, 1.8);
        if (tower.level >= 1 && BLOON_DEFS[b.type].isCamo && !b.camoStripped) {
          b.camoStripped = true;
          this.addFloatingText(b.x, b.y - 18, 'ÓCULOS VOOU! 🕶️', '#e879f9', 0.85);
        }
        if (push > 0 && !BLOON_DEFS[b.type].isBoss) {
          b.distance = Math.max(0, b.distance - push);
        }
        if (dmg > 0) {
          this.damageBloon(b, dmg, false, tower.id);
        }
      }
    }
    monkeyAudio.play('boing', 0.08);
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      p.rotation += dt * 14;

      if (p.ttl <= 0) {
        if (p.kind === 'coco') this.detonateCoco(p);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Homing steering for Chinelo Teleguiado da Mãe
      if (p.homing) {
        let target = p.targetId ? this.bloons.find((b) => b.id === p.targetId) : undefined;
        if (!target || p.hitIds.includes(target.id)) {
          target = this.findNearestBloon(p.x, p.y, 260, p.hitIds, p.detectsCamo) ?? undefined;
          p.targetId = target?.id ?? null;
        }
        if (target) {
          const ang = Math.atan2(target.y - p.y, target.x - p.x);
          p.vx = Math.cos(ang) * p.speed;
          p.vy = Math.sin(ang) * p.speed;
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Coco reaches target spot
      if (p.kind === 'coco' && p.targetX !== undefined && p.targetY !== undefined) {
        if (Math.hypot(p.x - p.targetX, p.y - p.targetY) <= 18) {
          this.detonateCoco(p);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Collision with bloons
      let consumed = false;
      for (let j = this.bloons.length - 1; j >= 0; j--) {
        const b = this.bloons[j];
        if (p.hitIds.includes(b.id)) continue;
        const def = BLOON_DEFS[b.type];
        if (def.isCamo && !b.camoStripped && !p.detectsCamo) continue;

        if (Math.hypot(b.x - p.x, b.y - p.y) <= def.radius + 9) {
          if (p.kind === 'coco') {
            this.detonateCoco(p);
            consumed = true;
            break;
          }

          p.hitIds.push(b.id);
          let finalDmg = p.damage;
          if (p.critChance > 0 && Math.random() < p.critChance) {
            finalDmg *= 2;
            monkeyAudio.play('slap', 0.24);
            this.addFloatingText(b.x, b.y - 22, 'CHINELADA CRÍTICA!', '#38bdf8', 1.15);
          }

          if (p.pushBack > 0 && !def.isBoss) {
            b.distance = Math.max(0, b.distance - p.pushBack);
          }
          if (p.slowDuration > 0) {
            b.slowTimer = Math.max(b.slowTimer, p.slowDuration);
            b.slowFactor = Math.min(b.slowFactor, p.slowFactor);
          }

          this.damageBloon(b, finalDmg, p.popsLead, p.ownerTowerId);
          p.pierceLeft -= 1;

          if (p.ricochetsLeft > 0) {
            p.ricochetsLeft -= 1;
            const next = this.findNearestBloon(p.x, p.y, 180, p.hitIds, p.detectsCamo);
            if (next) {
              p.targetId = next.id;
              const ang = Math.atan2(next.y - p.y, next.x - p.x);
              p.vx = Math.cos(ang) * p.speed;
              p.vy = Math.sin(ang) * p.speed;
            }
          }

          if (p.pierceLeft <= 0) {
            consumed = true;
            break;
          }
        }
      }

      if (consumed) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private detonateCoco(p: Projectile): void {
    monkeyAudio.play('explosion', 0.16);
    this.rings.push({
      x: p.x,
      y: p.y,
      radius: 12,
      maxRadius: p.splashRadius,
      color: '#4ade80',
      alpha: 0.85,
      lineWidth: 4,
    });
    this.spawnPopParticles(p.x, p.y, '#4ade80', 14);

    const snapshot = [...this.bloons];
    for (const b of snapshot) {
      const def = BLOON_DEFS[b.type];
      if (Math.hypot(b.x - p.x, b.y - p.y) <= p.splashRadius + def.radius * 0.5) {
        if (p.slowDuration > 0) {
          b.slowTimer = Math.max(b.slowTimer, p.slowDuration);
          b.slowFactor = Math.min(b.slowFactor, p.slowFactor);
        }
        this.damageBloon(b, p.damage, true, p.ownerTowerId);
      }
    }

    this.clouds.push({
      id: this.nextId('cl'),
      x: p.x,
      y: p.y,
      radius: p.splashRadius * 0.85,
      dps: p.poisonDps,
      slowFactor: p.slowFactor,
      ttl: p.poisonDuration,
      maxTtl: p.poisonDuration,
      tickTimer: 0.25,
      ownerTowerId: p.ownerTowerId,
    });
  }

  private updatePoisonClouds(dt: number): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.ttl -= dt;
      c.tickTimer -= dt;
      if (c.ttl <= 0) {
        this.clouds.splice(i, 1);
        continue;
      }
      if (c.tickTimer <= 0) {
        c.tickTimer = 0.4;
        const dmg = Math.max(1, Math.round(c.dps * 0.4));
        const snapshot = [...this.bloons];
        for (const b of snapshot) {
          if (Math.hypot(b.x - c.x, b.y - c.y) <= c.radius + BLOON_DEFS[b.type].radius * 0.4) {
            if (c.slowFactor < 1) {
              b.slowTimer = Math.max(b.slowTimer, 0.7);
              b.slowFactor = Math.min(b.slowFactor, c.slowFactor);
            }
            this.damageBloon(b, dmg, true, c.ownerTowerId);
          }
        }
      }
    }
  }

  private findNearestBloon(
    x: number,
    y: number,
    maxDist: number,
    excludeIds: string[],
    detectsCamo: boolean,
  ): BloonInstance | null {
    let best: BloonInstance | null = null;
    let bestD = maxDist;
    for (const b of this.bloons) {
      if (excludeIds.includes(b.id)) continue;
      const def = BLOON_DEFS[b.type];
      if (def.isCamo && !b.camoStripped && !detectsCamo) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private damageBloon(
    bloon: BloonInstance,
    damage: number,
    popsLead: boolean,
    ownerTowerId: string,
  ): void {
    const idx = this.bloons.indexOf(bloon);
    if (idx === -1) return;

    const def = BLOON_DEFS[bloon.type];
    if (def.isLead && !popsLead) {
      this.spawnPopParticles(bloon.x, bloon.y, '#cbd5e1', 4);
      if (Math.random() < 0.35) {
        this.addFloatingText(bloon.x, bloon.y - 16, 'CLANG! 🔩', '#cbd5e1', 0.85);
      }
      return;
    }

    bloon.hp -= damage;
    bloon.hitFlash = 1;

    const ownerTower = this.towers.find((t) => t.id === ownerTowerId);

    if (bloon.hp <= 0) {
      const overflow = Math.max(0, -bloon.hp);
      this.bloons.splice(idx, 1);

      const isMine = !this.net.isOnline() || ownerTower?.ownerId === this.net.room.localPlayer.id;
      const bananaGain = isMine ? def.reward : Math.max(1, Math.floor(def.reward * 0.5));
      this.bananas += bananaGain;
      this.score += def.isBoss ? 500 : 12;
      if (ownerTower) ownerTower.pops += 1;

      this.spawnPopParticles(bloon.x, bloon.y, def.color, def.isBoss ? 28 : 7);

      if (def.isBoss) {
        monkeyAudio.play('explosion', 0.34);
        this.shakeAmount = Math.max(this.shakeAmount, bloon.type === 'zepelim' ? 16 : 11);
        this.addFloatingText(
          bloon.x,
          bloon.y - 26,
          bloon.type === 'zepelim' ? 'RECEITA ESTOURADA! 💸' : `IMPOSTO PAGO! +${bananaGain} 🍌`,
          '#fde047',
          1.35,
        );
      } else if (Math.random() < 0.25) {
        this.addFloatingText(bloon.x, bloon.y - 12, `+${bananaGain} 🍌`, '#fef08a', 0.85);
      }

      // Spawn children layers
      def.children.forEach((childType, cIdx) => {
        const child = this.spawnBloon(
          childType,
          Math.max(0, bloon.distance - cIdx * 10),
          bloon.isTroll,
        );
        child.slowTimer = bloon.slowTimer * 0.6;
        child.slowFactor = bloon.slowFactor;
        child.camoStripped = bloon.camoStripped;
        if (cIdx === 0 && overflow > 0 && !def.isBoss) {
          this.damageBloon(child, overflow, popsLead, ownerTowerId);
        }
      });

      this.uiDirty = true;
    }
  }

  private updateEffects(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.radius += (r.maxRadius - r.radius) * Math.min(1, dt * 8) + dt * 40;
      r.alpha -= dt * 1.9;
      if (r.alpha <= 0 || r.radius >= r.maxRadius) this.rings.splice(i, 1);
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].ttl -= dt;
      if (this.tracers[i].ttl <= 0) this.tracers.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.ttl -= dt;
      ft.y += ft.vy * dt;
      if (ft.ttl <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private spawnPopParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 130;
      const ttl = 0.25 + Math.random() * 0.35;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2.5 + Math.random() * 3.5,
        color,
        ttl,
        maxTtl: ttl,
        gravity: 140,
      });
    }
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    scale = 1,
  ): void {
    if (this.floatingTexts.length > 35) this.floatingTexts.shift();
    this.floatingTexts.push({
      x,
      y,
      vy: -32,
      text,
      color,
      scale,
      ttl: 1.05,
      maxTtl: 1.05,
    });
  }

  private render(): void {
    renderGameCanvas(this.ctx, {
      time: this.elapsedTime,
      map: this.getMap(),
      towers: this.towers,
      bloons: this.bloons,
      projectiles: this.projectiles,
      clouds: this.clouds,
      rings: this.rings,
      tracers: this.tracers,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      selectedTowerId: this.selectedTowerId,
      placingType: this.placingType,
      hoverPos: this.hoverPos,
      bananas: this.bananas,
      shakeAmount: this.shakeAmount,
      isCoop: this.net.isOnline(),
      bossBannerText: this.bossBannerText,
    });
  }

  public getUiSnapshot(): UiSnapshot {
    const selectedTower = this.towers.find((t) => t.id === this.selectedTowerId) ?? null;
    const spec = getWaveSpec(Math.max(1, this.wave || 1));
    return {
      mapId: this.mapId,
      bananas: this.bananas,
      lives: this.lives,
      wave: this.wave,
      score: this.score,
      speed: this.speed,
      autoWave: this.autoWave,
      waveActive: this.waveActive,
      waveTitle: this.wave === 0 ? 'Pronto para o Caos!' : spec.title,
      selectedTower,
      placingType: this.placingType,
      gameOver: this.gameOver,
      victoryShown: this.victoryModalOpen,
      isCoop: this.net.isOnline(),
      localPlayerId: this.net.room.localPlayer.id,
      playersCount: this.net.room.getPlayers().length,
    };
  }

  public emitUi(): void {
    this.onUiUpdate(this.getUiSnapshot());
  }
}
