import { monkeyAudio, reportGameScore, type MonkeySoundName } from '@monkey-slop/sdk';
import {
  ABILITY_COOLDOWN_SECONDS,
  ATTACK_TIERS,
  BLOON_DEFS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAPS,
  MAX_BONUS_LIVES,
  MONKEY_QUIPS,
  STARTING_BANANAS,
  STARTING_LIVES,
  TOWER_DEFS,
  TOWER_RADIUS,
  getWaveSpec,
} from './data';
import { compileMapPath, getLaneCount, getLaneLength, isValidTowerSpot, samplePathPosition } from './maps';
import type { TdNetworkBridge } from './network';
import { getTowerEffectiveRange, renderGameCanvas } from './renderer';
import type {
  AbilityBomb,
  AttackTierId,
  BloonInstance,
  BloonType,
  FloatingText,
  GameMode,
  LightningArc,
  MapConfig,
  MapId,
  MapPing,
  Particle,
  PlayerMatchStats,
  Point,
  PoisonCloud,
  Projectile,
  RemoteCursor,
  ShockwaveRing,
  SniperTracer,
  SpawnQueueItem,
  TargetMode,
  TdNetMessage,
  TowerInstance,
  TowerType,
} from './types';

export interface NextWavePreviewItem {
  type: BloonType;
  name: string;
  emoji: string;
  color: string;
  count: number;
  isCamo?: boolean;
  isLead?: boolean;
  isBoss?: boolean;
}

export interface NextWavePreview {
  wave: number;
  title: string;
  isBossWave: boolean;
  items: NextWavePreviewItem[];
}

export interface UiSnapshot {
  mapId: MapId;
  gameMode: GameMode;
  bananas: number;
  local2pWallets: [number, number];
  activeLocalIndex: 0 | 1;
  activeActorId: string;
  activeActorName: string;
  activeActorColor: string;
  incomeBonus: number;
  lives: number;
  wave: number;
  score: number;
  speed: 1 | 2;
  autoWave: boolean;
  waveActive: boolean;
  waveTitle: string;
  nextWavePreview: NextWavePreview;
  abilityCooldown: number;
  abilityMaxCooldown: number;
  attackCooldown: number;
  selectedTower: TowerInstance | null;
  placingType: TowerType | null;
  pendingMapConfirm: MapId | null;
  gameOver: boolean;
  victoryShown: boolean;
  versusWinner: string | null;
  isCoop: boolean;
  isOnline: boolean;
  isHost: boolean;
  localPlayerId: string;
  playersCount: number;
  otherPlayers: Array<{ id: string; name: string; color: string }>;
  leaderboard: PlayerMatchStats[];
}

export class MonkeyBloonsGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private net: TdNetworkBridge;
  private onUiUpdate: (snap: UiSnapshot) => void;

  private rafId = 0;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private paused = false;
  private uiDirty = true;
  private uiRefreshTimer = 0;

  public mapId: MapId = 'selva';
  public gameMode: GameMode = 'coop';
  public bananas = STARTING_BANANAS;
  private local2pBananas: [number, number] = [260, 260];
  private activeLocalIndex: 0 | 1 = 0;

  public lives = STARTING_LIVES;
  public wave = 0;
  public score = 0;
  public speed: 1 | 2 = 1;
  public autoWave = false;
  public incomeBonus = 0;

  public towers: TowerInstance[] = [];
  public bloons: BloonInstance[] = [];
  public projectiles: Projectile[] = [];
  public clouds: PoisonCloud[] = [];
  public rings: ShockwaveRing[] = [];
  public tracers: SniperTracer[] = [];
  public lightningArcs: LightningArc[] = [];
  public abilityBombs: AbilityBomb[] = [];
  public pings: MapPing[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];

  private waveQueue: SpawnQueueItem[] = [];
  private trollQueue: SpawnQueueItem[] = [];
  private spawnTimer = 0;
  private trollSpawnTimer = 0;
  private nextLaneToggle = 0;
  private waveActive = false;
  private autoWaveDelay = 0;
  private shakeAmount = 0;
  private bossBannerText: string | null = null;
  private bossBannerTimer = 0;

  private abilityCooldown = 0;
  private attackCooldown = 0;
  private pendingMapConfirm: MapId | null = null;

  public selectedTowerId: string | null = null;
  public placingType: TowerType | null = null;
  private hoverPos: { x: number; y: number } | null = null;

  public gameOver = false;
  public victoryModalOpen = false;
  public versusWinner: string | null = null;
  private victoryAlreadyTriggered = false;
  private scoreReportedOnEnd = false;
  private idCounter = 1;

  // Multiplayer & sync state
  private knownLocalPlayerId: string;
  private playerStats = new Map<string, PlayerMatchStats>();
  private remoteCursors = new Map<string, RemoteCursor>();
  private pendingPeerBananas: Record<string, number> = {};
  private syncTimer = 0;
  private versusSyncTimer = 0;
  private cursorSendAt = 0;
  private syncSeq = 0;
  private lastAppliedSyncSeq = 0;
  private recentPlacedIds = new Map<string, number>();
  private recentSoldIds = new Map<string, number>();
  private recentUpgrades = new Map<string, { level: number; at: number }>();
  private sfxTimestamps = new Map<MonkeySoundName, number>();

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
    this.knownLocalPlayerId = this.net.room.localPlayer.id;

    this.ensureLocalStatsEntry();
    this.bindCanvasEvents();
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.net.room.localPlayer.id.slice(-4)}-${this.idCounter}`;
  }

  private playSfx(sound: MonkeySoundName, volume = 0.2, minGapMs = 45): void {
    const now = performance.now();
    const last = this.sfxTimestamps.get(sound) ?? 0;
    if (now - last < minGapMs) return;
    this.sfxTimestamps.set(sound, now);
    monkeyAudio.play(sound, volume);
  }

  public getMap(): MapConfig {
    return MAPS[this.mapId];
  }

  private isAuthoritativeCoopHost(): boolean {
    return this.gameMode !== 'coop' || !this.net.isOnline() || this.net.isHost();
  }

  private getActiveActor(): { id: string; name: string; color: string } {
    if (this.gameMode === 'local2p') {
      return this.activeLocalIndex === 0
        ? { id: 'local-p1', name: 'Macaco P1', color: '#facc15' }
        : { id: 'local-p2', name: 'Macaco P2', color: '#38bdf8' };
    }
    const p = this.net.room.localPlayer;
    return { id: p.id, name: p.name, color: p.color };
  }

  private getActiveBananas(): number {
    if (this.gameMode === 'local2p') {
      return this.local2pBananas[this.activeLocalIndex];
    }
    return this.bananas;
  }

  private spendActiveBananas(amount: number): void {
    if (this.gameMode === 'local2p') {
      this.local2pBananas[this.activeLocalIndex] = Math.max(
        0,
        this.local2pBananas[this.activeLocalIndex] - amount,
      );
      this.bananas = this.local2pBananas[this.activeLocalIndex];
    } else {
      this.bananas = Math.max(0, this.bananas - amount);
    }
  }

  private creditBananasToOwner(ownerId: string, amount: number): void {
    if (amount <= 0) return;
    if (this.gameMode === 'local2p') {
      if (ownerId === 'local-p2') {
        this.local2pBananas[1] += amount;
      } else {
        this.local2pBananas[0] += amount;
      }
      this.bananas = this.local2pBananas[this.activeLocalIndex];
      return;
    }
    if (this.gameMode === 'coop' && this.net.isOnline()) {
      if (ownerId === this.net.room.localPlayer.id) {
        this.bananas += amount;
      } else {
        this.pendingPeerBananas[ownerId] = (this.pendingPeerBananas[ownerId] ?? 0) + amount;
      }
      return;
    }
    this.bananas += amount;
  }

  public syncLocalIdentity(): void {
    const current = this.net.room.localPlayer;
    if (current.id !== this.knownLocalPlayerId) {
      const oldId = this.knownLocalPlayerId;
      for (const t of this.towers) {
        if (t.ownerId === oldId) {
          t.ownerId = current.id;
          t.ownerName = current.name;
          t.ownerColor = current.color;
        }
      }
      const oldStat = this.playerStats.get(oldId);
      if (oldStat) {
        this.playerStats.delete(oldId);
        oldStat.playerId = current.id;
        oldStat.name = current.name;
        oldStat.color = current.color;
        oldStat.isHost = current.isHost;
        this.playerStats.set(current.id, oldStat);
      }
      if (this.pendingPeerBananas[oldId]) {
        this.bananas += this.pendingPeerBananas[oldId];
        delete this.pendingPeerBananas[oldId];
      }
      this.knownLocalPlayerId = current.id;
    }

    // Keep playerStats synced with current PeerRoom roster in coop
    if (this.net.isInRoom() && this.gameMode !== 'local2p') {
      for (const p of this.net.room.getPlayers()) {
        const existing = this.playerStats.get(p.id);
        if (existing) {
          existing.name = p.name;
          existing.color = p.color;
          existing.isHost = p.isHost;
        } else {
          this.playerStats.set(p.id, {
            playerId: p.id,
            name: p.name,
            color: p.color,
            pops: 0,
            bananasGifted: 0,
            incomeBonus: 0,
            lives: this.lives,
            score: this.score,
            wave: this.wave,
            alive: true,
            isHost: p.isHost,
          });
        }
      }
    } else {
      this.ensureLocalStatsEntry();
    }

    this.uiDirty = true;
  }

  private ensureLocalStatsEntry(): void {
    if (this.gameMode === 'local2p') {
      if (!this.playerStats.has('local-p1')) {
        this.playerStats.set('local-p1', {
          playerId: 'local-p1',
          name: 'Macaco P1',
          color: '#facc15',
          pops: 0,
          bananasGifted: 0,
          incomeBonus: 0,
          lives: this.lives,
          score: 0,
          wave: this.wave,
          alive: true,
        });
      }
      if (!this.playerStats.has('local-p2')) {
        this.playerStats.set('local-p2', {
          playerId: 'local-p2',
          name: 'Macaco P2',
          color: '#38bdf8',
          pops: 0,
          bananasGifted: 0,
          incomeBonus: 0,
          lives: this.lives,
          score: 0,
          wave: this.wave,
          alive: true,
        });
      }
      return;
    }

    const lp = this.net.room.localPlayer;
    const existing = this.playerStats.get(lp.id);
    if (existing) {
      existing.name = lp.name;
      existing.color = lp.color;
      existing.isHost = lp.isHost;
      existing.lives = this.lives;
      existing.score = this.score;
      existing.wave = this.wave;
      existing.alive = !this.gameOver;
    } else {
      this.playerStats.set(lp.id, {
        playerId: lp.id,
        name: lp.name,
        color: lp.color,
        pops: 0,
        bananasGifted: 0,
        incomeBonus: this.incomeBonus,
        lives: this.lives,
        score: this.score,
        wave: this.wave,
        alive: !this.gameOver,
        isHost: lp.isHost,
      });
    }
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
      const pos = toLogical(e.clientX, e.clientY);
      this.hoverPos = pos;
      if (this.net.isOnline()) {
        const now = performance.now();
        if (now - this.cursorSendAt >= 65) {
          this.cursorSendAt = now;
          const p = this.net.room.localPlayer;
          this.net.send({
            action: 'cursor',
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            placingType: this.placingType,
            color: p.color,
            name: p.name,
          });
        }
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPos = null;
    });

    this.canvas.addEventListener('click', (e) => {
      const pos = toLogical(e.clientX, e.clientY);
      this.handleCanvasClick(pos.x, pos.y, e.shiftKey);
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

  private handleCanvasClick(x: number, y: number, shiftKey = false): void {
    if (this.gameOver) return;

    if (this.placingType) {
      this.tryPlaceTower(this.placingType, x, y, shiftKey);
      return;
    }

    const clicked = this.towers.find((t) => Math.hypot(t.x - x, t.y - y) <= TOWER_RADIUS + 6);
    if (clicked) {
      this.playSfx('click', 0.18);
      this.selectedTowerId = clicked.id;
      this.uiDirty = true;
    } else if (this.selectedTowerId) {
      this.selectedTowerId = null;
      this.uiDirty = true;
    }
  }

  public selectShopTower(type: TowerType | null): void {
    this.playSfx('click', 0.18);
    this.placingType = this.placingType === type ? null : type;
    if (this.placingType) this.selectedTowerId = null;
    this.uiDirty = true;
  }

  public cancelPlacement(): void {
    if (!this.placingType) return;
    this.placingType = null;
    this.playSfx('click', 0.14);
    this.uiDirty = true;
  }

  public tryPlaceTower(type: TowerType, x: number, y: number, keepPlacing = false): boolean {
    const def = TOWER_DEFS[type];
    const wallet = this.getActiveBananas();
    if (wallet < def.cost) {
      this.playSfx('boing', 0.2);
      this.addFloatingText(x, y - 16, 'SEM BANANA! 🍌', '#fca5a5', 1.0);
      return false;
    }
    const valid = isValidTowerSpot(this.getMap(), this.towers, x, y);
    if (!valid.ok) {
      this.playSfx('boing', 0.2);
      this.addFloatingText(x, y - 16, valid.reason ?? 'Lugar inválido!', '#fca5a5', 0.95);
      return false;
    }

    const actor = this.getActiveActor();
    const tower: TowerInstance = {
      id: this.nextId('tw'),
      type,
      x: Math.round(x),
      y: Math.round(y),
      level: 0,
      ownerId: actor.id,
      ownerName: actor.name,
      ownerColor: actor.color,
      angle: 0,
      cooldown: type === 'fazenda' ? 2.5 : 0.1,
      recoil: 0,
      targetMode: type === 'sniper' ? 'strong' : 'first',
      totalSpent: def.cost,
      pops: 0,
      buffedMultiplier: 1,
      buffedRangeMultiplier: 1,
      lastTalkAt: 0,
      farmEarned: 0,
    };

    this.spendActiveBananas(def.cost);
    this.towers.push(tower);
    this.recentPlacedIds.set(tower.id, performance.now());
    this.selectedTowerId = tower.id;
    this.placingType = keepPlacing && this.getActiveBananas() >= def.cost ? type : null;
    this.playSfx('banana', 0.24);
    this.spawnPopParticles(x, y, def.color, 10);
    const quip = MONKEY_QUIPS[Math.floor(Math.random() * MONKEY_QUIPS.length)];
    this.addFloatingText(x, y - 24, quip, '#fef08a', 0.9);

    if (this.gameMode === 'coop') {
      this.net.send({ action: 'place_tower', tower });
    }
    this.uiDirty = true;
    return true;
  }

  private canControlTower(tower: TowerInstance): boolean {
    if (this.gameMode === 'local2p') {
      return tower.ownerId === this.getActiveActor().id;
    }
    if (this.gameMode === 'coop' && this.net.isOnline()) {
      return tower.ownerId === this.net.room.localPlayer.id;
    }
    return true;
  }

  public upgradeSelectedTower(): void {
    if (!this.selectedTowerId) return;
    const tower = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!tower) return;

    if (!this.canControlTower(tower)) {
      this.net.toast(`Essa torre é de ${tower.ownerName}!`, 'info');
      return;
    }
    if (tower.level >= 3) return;

    const def = TOWER_DEFS[tower.type];
    const upg = def.upgrades[tower.level];
    const wallet = this.getActiveBananas();
    if (wallet < upg.cost) {
      this.playSfx('boing', 0.2);
      this.addFloatingText(tower.x, tower.y - 25, `Falta ${upg.cost - wallet} 🍌!`, '#fca5a5', 1);
      return;
    }

    this.spendActiveBananas(upg.cost);
    tower.level += 1;
    tower.totalSpent += upg.cost;
    this.recentUpgrades.set(tower.id, { level: tower.level, at: performance.now() });

    if (tower.type === 'banana' && tower.level === 3) {
      this.playSfx('rage', 0.3);
      this.shakeAmount = Math.max(this.shakeAmount, 7);
    } else {
      this.playSfx('fanfare', 0.22);
    }
    this.spawnPopParticles(tower.x, tower.y, '#fde047', 16);
    this.addFloatingText(tower.x, tower.y - 28, upg.quip, '#fde047', 1.1);

    if (this.gameMode === 'coop') {
      this.net.send({
        action: 'upgrade_tower',
        towerId: tower.id,
        level: tower.level,
        cost: upg.cost,
        ownerId: tower.ownerId,
      });
    }
    this.uiDirty = true;
  }

  public sellSelectedTower(): void {
    if (!this.selectedTowerId) return;
    const idx = this.towers.findIndex((t) => t.id === this.selectedTowerId);
    if (idx === -1) return;
    const tower = this.towers[idx];
    if (!this.canControlTower(tower)) {
      this.net.toast(`Você não pode vender o macaco de ${tower.ownerName}!`, 'info');
      return;
    }
    const refund = Math.round(tower.totalSpent * 0.7);
    this.creditBananasToOwner(tower.ownerId, refund);
    this.towers.splice(idx, 1);
    this.recentSoldIds.set(tower.id, performance.now());
    this.selectedTowerId = null;
    this.playSfx('coin', 0.25);
    this.spawnPopParticles(tower.x, tower.y, '#facc15', 12);
    this.addFloatingText(tower.x, tower.y - 18, `+${refund} 🍌 Vendeu!`, '#fde047', 1.0);
    if (this.gameMode === 'coop') {
      this.net.send({ action: 'sell_tower', towerId: tower.id, ownerId: tower.ownerId });
    }
    this.uiDirty = true;
  }

  public cycleTargetMode(): void {
    if (!this.selectedTowerId) return;
    const tower = this.towers.find((t) => t.id === this.selectedTowerId);
    if (!tower || tower.type === 'dj' || tower.type === 'fazenda') return;
    if (!this.canControlTower(tower)) return;

    const order: TargetMode[] = ['first', 'strong', 'close', 'last'];
    const next = order[(order.indexOf(tower.targetMode) + 1) % order.length];
    tower.targetMode = next;
    this.playSfx('click', 0.16);
    if (this.gameMode === 'coop') {
      this.net.send({ action: 'target_mode', towerId: tower.id, targetMode: next });
    }
    this.uiDirty = true;
  }

  public switchLocalTurn(): void {
    if (this.gameMode !== 'local2p') return;
    this.activeLocalIndex = this.activeLocalIndex === 0 ? 1 : 0;
    this.bananas = this.local2pBananas[this.activeLocalIndex];
    this.placingType = null;
    this.selectedTowerId = null;
    const actor = this.getActiveActor();
    this.playSfx('click', 0.2);
    this.addFloatingText(CANVAS_WIDTH / 2, 95, `🔄 Turno de ${actor.name}!`, actor.color, 1.15);
    this.uiDirty = true;
  }

  public startNextWave(fromRemote = false): void {
    if (this.gameOver || this.waveActive) return;
    if (!fromRemote && this.gameMode === 'coop' && this.net.isOnline() && !this.net.isHost()) {
      this.net.send({ action: 'start_wave', wave: this.wave + 1 });
      this.playSfx('click', 0.16);
      return;
    }
    this.wave += 1;
    this.launchWave(this.wave);
    if (!fromRemote && this.gameMode === 'coop') {
      this.net.send({ action: 'start_wave', wave: this.wave });
    }
    this.uiDirty = true;
  }

  private launchWave(waveNum: number): void {
    const spec = getWaveSpec(waveNum);
    const laneCount = getLaneCount(this.getMap());
    this.waveQueue = [];
    for (const grp of spec.groups) {
      for (let i = 0; i < grp.count; i++) {
        const laneIndex = laneCount > 1 ? this.nextLaneToggle++ % laneCount : 0;
        this.waveQueue.push({
          type: grp.type,
          wait: i === grp.count - 1 ? grp.interval + (grp.delayAfter ?? 0.35) : grp.interval,
          laneIndex,
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
      this.playSfx('rage', 0.3, 150);
      this.net.toast(spec.bossBanner, 'chaos');
    } else {
      this.playSfx('click', 0.22);
    }
  }

  public requestMapChange(mapId: MapId): void {
    if (this.mapId === mapId && this.wave === 0 && this.towers.length === 0) return;
    if ((this.wave > 0 || this.towers.length > 0) && !this.gameOver) {
      this.pendingMapConfirm = mapId;
      this.playSfx('click', 0.18);
      this.uiDirty = true;
      return;
    }
    this.setMap(mapId, false, true);
  }

  public cancelMapChange(): void {
    this.pendingMapConfirm = null;
    this.uiDirty = true;
  }

  public confirmMapChange(): void {
    if (!this.pendingMapConfirm) return;
    const target = this.pendingMapConfirm;
    this.pendingMapConfirm = null;
    this.setMap(target, false, true);
  }

  public setMap(mapId: MapId, fromRemote = false, force = false): void {
    if (
      !force &&
      this.mapId === mapId &&
      this.wave === 0 &&
      this.towers.length === 0 &&
      !this.gameOver
    ) {
      return;
    }
    this.mapId = mapId;
    this.pendingMapConfirm = null;
    this.resetMatchState(false);
    if (!fromRemote && this.gameMode === 'coop') {
      this.net.send({ action: 'set_map', mapId });
    }
    this.uiDirty = true;
  }

  public setGameMode(mode: GameMode, fromRemote = false): void {
    if (mode === 'local2p' && this.net.isOnline()) {
      this.net.toast('Desconecte da sala Co-op para jogar 2P Local no mesmo PC!', 'info');
      return;
    }
    this.gameMode = mode;
    this.resetMatchState(false);
    if (!fromRemote && mode !== 'local2p' && this.net.isOnline()) {
      this.net.send({ action: 'set_mode', gameMode: mode });
    }
    this.uiDirty = true;
  }

  public toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.playSfx('click', 0.18);
    if (this.gameMode === 'coop') {
      this.net.send({ action: 'set_speed', speed: this.speed });
    }
    this.uiDirty = true;
  }

  public toggleAutoWave(): void {
    this.autoWave = !this.autoWave;
    this.playSfx('click', 0.18);
    if (this.gameMode === 'coop') {
      this.net.send({ action: 'set_auto_wave', autoWave: this.autoWave });
    }
    this.uiDirty = true;
  }

  public activateAbility(): void {
    if (this.gameOver) return;
    if (this.abilityCooldown > 0) {
      this.playSfx('boing', 0.16, 120);
      return;
    }

    const actor = this.getActiveActor();
    // Pick 14 bomb targets (prioritizing live bloons, then track spots)
    const targets: Point[] = [];
    const sorted = [...this.bloons].sort((a, b) => b.distance - a.distance);
    for (let i = 0; i < Math.min(10, sorted.length); i++) {
      const b = sorted[i];
      targets.push({
        x: Math.max(40, Math.min(CANVAS_WIDTH - 40, b.x + (Math.random() - 0.5) * 26)),
        y: Math.max(40, Math.min(CANVAS_HEIGHT - 40, b.y + (Math.random() - 0.5) * 26)),
      });
    }
    const map = this.getMap();
    const lanes = getLaneCount(map);
    while (targets.length < 14) {
      const l = targets.length % lanes;
      const len = getLaneLength(map, l);
      const d = (0.12 + Math.random() * 0.78) * len;
      const pos = samplePathPosition(map, d, l);
      targets.push({ x: pos.x, y: pos.y });
    }

    this.abilityCooldown = ABILITY_COOLDOWN_SECONDS;
    this.spawnAbilityBombs(targets, actor.id, actor.name);

    if (this.gameMode === 'coop' && this.net.isOnline()) {
      this.net.send({
        action: 'use_ability',
        senderName: actor.name,
        senderId: actor.id,
        targets,
      });
    }
    this.uiDirty = true;
  }

  private spawnAbilityBombs(targets: Point[], ownerId: string, senderName: string): void {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      this.abilityBombs.push({
        x: t.x,
        y: t.y - 240 - i * 24,
        targetY: t.y,
        vy: 760,
        radius: 78,
        damage: 12,
        ownerId,
      });
    }
    this.playSfx('rage', 0.3, 100);
    this.shakeAmount = Math.max(this.shakeAmount, 8);
    this.addFloatingText(
      CANVAS_WIDTH / 2,
      88,
      `🍌💣 ${senderName}: CHUVA DE BANANAS EXPLOSIVAS!`,
      '#fde047',
      1.25,
    );
  }

  public triggerPing(x?: number, y?: number): void {
    const px = Math.round(x ?? this.hoverPos?.x ?? CANVAS_WIDTH / 2);
    const py = Math.round(y ?? this.hoverPos?.y ?? CANVAS_HEIGHT / 2);
    const actor = this.getActiveActor();
    this.addMapPing(px, py, actor.name, actor.color);
    this.playSfx('click', 0.22, 120);
    if (this.net.isOnline() && this.gameMode !== 'local2p') {
      this.net.send({ action: 'ping', x: px, y: py, name: actor.name, color: actor.color });
    }
  }

  private addMapPing(x: number, y: number, name: string, color: string): void {
    if (this.pings.length > 8) this.pings.shift();
    this.pings.push({
      id: this.nextId('pg'),
      x,
      y,
      name,
      color,
      ttl: 2.8,
      maxTtl: 2.8,
    });
  }

  public giftBananasToFriends(targetPlayerId?: string): void {
    if (this.gameMode === 'local2p') {
      const wallet = this.getActiveBananas();
      if (wallet < 50) {
        this.playSfx('boing', 0.2);
        this.net.toast('Você precisa de pelo menos 50 🍌 para transferir!', 'chaos');
        return;
      }
      this.spendActiveBananas(50);
      const otherIdx: 0 | 1 = this.activeLocalIndex === 0 ? 1 : 0;
      this.local2pBananas[otherIdx] += 50;
      this.playSfx('banana', 0.26);
      this.addFloatingText(
        CANVAS_WIDTH / 2,
        110,
        `🍌 P${this.activeLocalIndex + 1} transferiu 50 🍌 para P${otherIdx + 1}!`,
        '#fde047',
        1.1,
      );
      this.uiDirty = true;
      return;
    }

    if (!this.net.isOnline()) {
      this.net.toast('Entre em uma sala Co-op para mandar bananas pros amigos!', 'info');
      return;
    }
    if (this.bananas < 50) {
      this.playSfx('boing', 0.2);
      this.net.toast('Você precisa de pelo menos 50 🍌 para enviar!', 'chaos');
      return;
    }

    const others = this.net.getOtherPlayers();
    if (others.length === 0) return;

    this.bananas -= 50;
    const lp = this.net.room.localPlayer;
    const myStats = this.playerStats.get(lp.id);
    if (myStats) myStats.bananasGifted += 50;

    if (targetPlayerId && targetPlayerId !== 'split') {
      const target = others.find((o) => o.id === targetPlayerId) ?? others[0];
      this.net.send({
        action: 'gift_bananas',
        amount: 50,
        fromName: lp.name,
        targetPlayerId: target.id,
      });
      this.net.toast(`Você mandou +50 🍌 para ${target.name}!`, 'banana');
      this.addFloatingText(CANVAS_WIDTH / 2, 110, `🍌 -50 🍌 -> ${target.name}`, '#fde047', 1.1);
    } else {
      // Split 50 across all other players so money is NEVER duplicated!
      const perPlayer = Math.floor(50 / others.length);
      const remainder = 50 - perPlayer * others.length;
      others.forEach((peer, idx) => {
        const share = perPlayer + (idx === 0 ? remainder : 0);
        if (share > 0) {
          this.net.send({
            action: 'gift_bananas',
            amount: share,
            fromName: lp.name,
            targetPlayerId: peer.id,
          });
        }
      });
      const msg =
        others.length === 1
          ? `Você mandou +50 🍌 para ${others[0].name}!`
          : `Você dividiu 50 🍌 entre ${others.length} macacos (+${perPlayer} 🍌 cada)!`;
      this.net.toast(msg, 'banana');
      this.addFloatingText(CANVAS_WIDTH / 2, 110, `🍌 ${msg}`, '#fde047', 1.05);
    }

    this.playSfx('banana', 0.28);
    this.uiDirty = true;
  }

  public sendAttackBloons(tierId: AttackTierId): void {
    if (this.gameOver) return;
    if (!this.net.isOnline() && this.gameMode !== 'local2p') {
      this.net.toast('Entre em uma sala Co-op ou Versus para mandar enxames!', 'info');
      return;
    }
    if (this.attackCooldown > 0) {
      this.playSfx('boing', 0.18, 120);
      this.net.toast(`Aguarde ${Math.ceil(this.attackCooldown)}s para enviar outro enxame!`, 'info');
      return;
    }

    const tier = ATTACK_TIERS[tierId];
    const wallet = this.getActiveBananas();
    if (wallet < tier.cost) {
      this.playSfx('boing', 0.2);
      this.net.toast(`Precisa de ${tier.cost} 🍌 para enviar ${tier.shortLabel}!`, 'chaos');
      return;
    }

    this.spendActiveBananas(tier.cost);
    this.attackCooldown = 12;
    this.incomeBonus += tier.incomeGain;
    const actor = this.getActiveActor();
    const myStat = this.playerStats.get(actor.id);
    if (myStat) myStat.incomeBonus += tier.incomeGain;

    this.playSfx('screech', 0.28);

    if (this.gameMode === 'versus') {
      // Versus Duel: sent bloons go ONLY to opponents, NOT onto your track!
      this.net.send({
        action: 'send_bloons',
        tier: tierId,
        fromId: actor.id,
        fromName: actor.name,
        incomeGain: tier.incomeGain,
      });
      this.addFloatingText(
        CANVAS_WIDTH / 2,
        118,
        `⚔️ Enviou ${tier.shortLabel}! (+${tier.incomeGain} 🍌/onda)`,
        '#4ade80',
        1.15,
      );
      this.net.toast(
        `⚔️ Atacou rivais com ${tier.shortLabel}! Sua renda: +${this.incomeBonus} 🍌/onda`,
        'banana',
      );
    } else if (this.gameMode === 'local2p') {
      // 2P Local Chaos: shared track sabotage for income!
      this.enqueueTrollBloons(tier.bloons, `${actor.name} (+${tier.incomeGain}🍌/onda)`);
    } else {
      // Co-op Battles Chaos: spawns on shared track (on Host) for extra eco!
      if (this.isAuthoritativeCoopHost()) {
        this.enqueueTrollBloons(tier.bloons, `${actor.name} (+${tier.incomeGain}🍌/onda)`);
      }
      this.net.send({
        action: 'send_bloons',
        tier: tierId,
        fromId: actor.id,
        fromName: actor.name,
        incomeGain: tier.incomeGain,
      });
    }

    this.uiDirty = true;
  }

  private enqueueTrollBloons(bloonTypes: BloonType[], fromLabel: string): void {
    const laneCount = getLaneCount(this.getMap());
    for (let i = 0; i < bloonTypes.length; i++) {
      this.trollQueue.push({
        type: bloonTypes[i],
        wait: 0.24,
        laneIndex: laneCount > 1 ? i % laneCount : 0,
        isTroll: true,
      });
    }
    this.trollSpawnTimer = Math.min(this.trollSpawnTimer || 0.05, 0.05);
    this.shakeAmount = Math.max(this.shakeAmount, 6);
    this.addFloatingText(
      CANVAS_WIDTH / 2,
      142,
      `😈 ${fromLabel} mandou ${bloonTypes.length} Bexigas Surpresa!`,
      '#fb7185',
      1.15,
    );
    this.net.toast(`😈 ${fromLabel} mandou ${bloonTypes.length} Bexigas Surpresa!`, 'chaos');
  }

  public restartMatch(fromRemote = false): void {
    this.resetMatchState(true);
    if (!fromRemote && this.gameMode === 'coop' && this.net.isOnline()) {
      this.net.send({ action: 'restart_match', mapId: this.mapId, gameMode: this.gameMode });
    }
    this.uiDirty = true;
  }

  private resetMatchState(playSound: boolean): void {
    this.bananas = STARTING_BANANAS;
    this.local2pBananas = [260, 260];
    this.activeLocalIndex = 0;
    this.lives = STARTING_LIVES;
    this.wave = 0;
    this.score = 0;
    this.incomeBonus = 0;
    this.towers = [];
    this.bloons = [];
    this.projectiles = [];
    this.clouds = [];
    this.rings = [];
    this.tracers = [];
    this.lightningArcs = [];
    this.abilityBombs = [];
    this.pings = [];
    this.particles = [];
    this.floatingTexts = [];
    this.waveQueue = [];
    this.trollQueue = [];
    this.waveActive = false;
    this.abilityCooldown = 0;
    this.attackCooldown = 0;
    this.selectedTowerId = null;
    this.placingType = null;
    this.pendingMapConfirm = null;
    this.gameOver = false;
    this.victoryModalOpen = false;
    this.versusWinner = null;
    this.victoryAlreadyTriggered = false;
    this.scoreReportedOnEnd = false;
    this.bossBannerText = null;
    this.bossBannerTimer = 0;
    this.pendingPeerBananas = {};
    this.recentPlacedIds.clear();
    this.recentSoldIds.clear();
    this.recentUpgrades.clear();
    this.playerStats.clear();
    this.syncLocalIdentity();
    if (playSound) this.playSfx('banana', 0.22);
  }

  public continueEndless(): void {
    this.victoryModalOpen = false;
    this.playSfx('click', 0.2);
    this.uiDirty = true;
  }

  public handleRemoteMessage(senderId: string, msg: TdNetMessage): void {
    switch (msg.action) {
      case 'place_tower': {
        if (!this.towers.some((t) => t.id === msg.tower.id)) {
          this.towers.push({ ...msg.tower });
          this.spawnPopParticles(msg.tower.x, msg.tower.y, msg.tower.ownerColor, 10);
          this.playSfx('banana', 0.16);
          this.uiDirty = true;
        }
        break;
      }
      case 'upgrade_tower': {
        const t = this.towers.find((tw) => tw.id === msg.towerId);
        if (t && msg.level > t.level) {
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
        this.setMap(msg.mapId, true, true);
        break;
      }
      case 'set_mode': {
        if (this.gameMode !== msg.gameMode) {
          this.setGameMode(msg.gameMode, true);
        }
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
      case 'use_ability': {
        if (senderId !== this.net.room.localPlayer.id) {
          this.abilityCooldown = ABILITY_COOLDOWN_SECONDS;
          this.spawnAbilityBombs(msg.targets, msg.senderId, msg.senderName);
          this.uiDirty = true;
        }
        break;
      }
      case 'gift_bananas': {
        const lpId = this.net.room.localPlayer.id;
        if (!msg.targetPlayerId || msg.targetPlayerId === lpId) {
          this.bananas += msg.amount;
          this.playSfx('banana', 0.28);
          this.net.toast(`🍌 ${msg.fromName} mandou +${msg.amount} Bananas pra você!`, 'banana');
          this.addFloatingText(
            CANVAS_WIDTH / 2,
            100,
            `🍌 +${msg.amount} de ${msg.fromName}!`,
            '#fde047',
            1.2,
          );
          this.uiDirty = true;
        }
        break;
      }
      case 'send_bloons': {
        if (senderId === this.net.room.localPlayer.id) break;
        const tier = ATTACK_TIERS[msg.tier];
        if (!tier) break;
        if (this.gameMode === 'versus') {
          this.playSfx('screech', 0.28);
          this.enqueueTrollBloons(tier.bloons, `⚔️ ${msg.fromName}`);
          this.uiDirty = true;
        } else if (this.gameMode === 'coop' && this.isAuthoritativeCoopHost()) {
          this.playSfx('screech', 0.28);
          this.enqueueTrollBloons(tier.bloons, `${msg.fromName} (+${msg.incomeGain}🍌/onda)`);
          this.uiDirty = true;
        }
        break;
      }
      case 'restart_match': {
        this.mapId = msg.mapId;
        this.gameMode = msg.gameMode;
        this.restartMatch(true);
        break;
      }
      case 'cursor': {
        if (senderId !== this.net.room.localPlayer.id) {
          this.remoteCursors.set(senderId, {
            playerId: senderId,
            name: msg.name,
            color: msg.color,
            x: msg.x,
            y: msg.y,
            placingType: msg.placingType,
            lastSeen: performance.now(),
          });
        }
        break;
      }
      case 'ping': {
        if (senderId !== this.net.room.localPlayer.id) {
          this.addMapPing(msg.x, msg.y, msg.name, msg.color);
          this.playSfx('click', 0.22, 120);
        }
        break;
      }
      case 'state_sync': {
        if (this.gameMode !== 'coop' || this.net.isHost()) break;
        if (msg.seq <= this.lastAppliedSyncSeq) break;
        this.lastAppliedSyncSeq = msg.seq;
        this.applyHostSync(msg);
        break;
      }
      case 'versus_status': {
        if (this.gameMode !== 'versus') break;
        this.playerStats.set(msg.playerId, {
          playerId: msg.playerId,
          name: msg.name,
          color: msg.color,
          pops: msg.pops,
          bananasGifted: 0,
          incomeBonus: msg.incomeBonus,
          lives: msg.lives,
          score: msg.score,
          wave: msg.wave,
          alive: msg.alive,
        });
        this.checkVersusVictory();
        this.uiDirty = true;
        break;
      }
    }
  }

  private applyHostSync(msg: Extract<TdNetMessage, { action: 'state_sync' }>): void {
    if (this.mapId !== msg.mapId) {
      this.mapId = msg.mapId;
    }
    this.gameMode = msg.gameMode;
    this.wave = msg.wave;
    this.waveActive = msg.waveActive;
    this.lives = msg.lives;
    this.score = msg.score;
    this.speed = msg.speed;
    this.autoWave = msg.autoWave;
    this.abilityCooldown = msg.abilityCooldown;

    if (msg.gameOver && !this.gameOver) {
      this.triggerGameOver();
    } else if (!msg.gameOver) {
      this.gameOver = false;
    }

    // Apply banana rewards delta for local player
    const lpId = this.net.room.localPlayer.id;
    const reward = msg.bananaRewards[lpId] ?? 0;
    if (reward > 0) {
      this.bananas += reward;
    }

    // Merge towers cleanly without clobbering very recent local ops
    const now = performance.now();
    const mergedTowers: TowerInstance[] = [];
    const seenIds = new Set<string>();
    for (const remoteT of msg.towers) {
      const soldAt = this.recentSoldIds.get(remoteT.id);
      if (soldAt && now - soldAt < 1200) continue;
      const copy = { ...remoteT };
      const upg = this.recentUpgrades.get(remoteT.id);
      if (upg && now - upg.at < 1200 && upg.level > copy.level) {
        copy.level = upg.level;
      }
      mergedTowers.push(copy);
      seenIds.add(copy.id);
    }
    for (const localT of this.towers) {
      const placedAt = this.recentPlacedIds.get(localT.id);
      if (!seenIds.has(localT.id) && placedAt && now - placedAt < 1200) {
        mergedTowers.push(localT);
      }
    }
    this.towers = mergedTowers;

    // Reconcile bloons smoothly
    const map = this.getMap();
    const prevMap = new Map(this.bloons.map((b) => [b.id, b]));
    const nextIds = new Set(msg.bloons.map((b) => b.id));
    for (const oldB of this.bloons) {
      if (!nextIds.has(oldB.id)) {
        const len = getLaneLength(map, oldB.laneIndex);
        if (oldB.distance < len - 35) {
          this.spawnPopParticles(oldB.x, oldB.y, BLOON_DEFS[oldB.type].color, 5);
        }
      }
    }

    this.bloons = msg.bloons.map((sb) => {
      const prev = prevMap.get(sb.id);
      const pos = samplePathPosition(map, sb.distance, sb.laneIndex);
      return {
        id: sb.id,
        type: sb.type,
        hp: sb.hp,
        maxHp: sb.maxHp,
        laneIndex: sb.laneIndex,
        distance: sb.distance,
        angle: pos.angle,
        x: pos.x,
        y: pos.y,
        slowTimer: sb.slowTimer,
        slowFactor: sb.slowFactor,
        camoStripped: sb.camoStripped,
        hitFlash: prev?.hitFlash ?? 0,
        wobbleSeed: prev?.wobbleSeed ?? Math.random() * Math.PI * 2,
        poisonCarry: 0,
        isTroll: sb.isTroll,
      };
    });

    this.waveQueue = msg.spawnQueue.map((q) => ({ ...q }));

    for (const ps of msg.playerStats) {
      this.playerStats.set(ps.playerId, { ...ps });
    }

    if (this.wave === 15 && !this.waveActive && this.bloons.length === 0 && !this.victoryAlreadyTriggered) {
      this.victoryAlreadyTriggered = true;
      this.victoryModalOpen = true;
    }

    this.uiDirty = true;
  }

  public sendSnapshotToRoom(): void {
    if (!this.net.isHost() || !this.net.isOnline() || this.gameMode !== 'coop') return;
    this.syncSeq += 1;
    const rewards = { ...this.pendingPeerBananas };
    this.pendingPeerBananas = {};

    this.ensureLocalStatsEntry();
    this.net.send({
      action: 'state_sync',
      seq: this.syncSeq,
      mapId: this.mapId,
      gameMode: this.gameMode,
      wave: this.wave,
      waveActive: this.waveActive,
      lives: this.lives,
      score: this.score,
      speed: this.speed,
      autoWave: this.autoWave,
      gameOver: this.gameOver,
      abilityCooldown: this.abilityCooldown,
      towers: this.towers,
      bloons: this.bloons.map((b) => ({
        id: b.id,
        type: b.type,
        hp: b.hp,
        maxHp: b.maxHp,
        laneIndex: b.laneIndex,
        distance: Math.round(b.distance * 10) / 10,
        slowTimer: Math.round(b.slowTimer * 100) / 100,
        slowFactor: b.slowFactor,
        camoStripped: b.camoStripped,
        isTroll: b.isTroll,
      })),
      spawnQueue: this.waveQueue.slice(0, 60),
      playerStats: Array.from(this.playerStats.values()),
      bananaRewards: rewards,
    });
  }

  private sendVersusStatus(): void {
    if (this.gameMode !== 'versus' || !this.net.isOnline()) return;
    const lp = this.net.room.localPlayer;
    const myPops = this.towers
      .filter((t) => t.ownerId === lp.id)
      .reduce((acc, t) => acc + t.pops, 0);

    const status: PlayerMatchStats = {
      playerId: lp.id,
      name: lp.name,
      color: lp.color,
      pops: myPops,
      bananasGifted: 0,
      incomeBonus: this.incomeBonus,
      lives: this.lives,
      score: this.score,
      wave: this.wave,
      alive: !this.gameOver,
      isHost: lp.isHost,
    };
    this.playerStats.set(lp.id, status);

    this.net.send({
      action: 'versus_status',
      playerId: lp.id,
      name: lp.name,
      color: lp.color,
      lives: this.lives,
      score: this.score,
      pops: myPops,
      incomeBonus: this.incomeBonus,
      wave: this.wave,
      alive: !this.gameOver,
      towerCount: this.towers.length,
    });
  }

  private checkVersusVictory(): void {
    if (this.gameMode !== 'versus' || this.gameOver || !this.net.isOnline()) return;
    if (this.wave === 0 && this.towers.length === 0) return;
    const others = this.net.getOtherPlayers();
    if (others.length === 0) return;

    const allOthersDead = others.every((o) => {
      const st = this.playerStats.get(o.id);
      return st && !st.alive;
    });
    if (allOthersDead && !this.versusWinner) {
      this.versusWinner = this.net.room.localPlayer.name;
      this.victoryModalOpen = true;
      this.playSfx('fanfare', 0.35);
      reportGameScore('monkey-bloons-td', this.score + 1000, {
        wave: this.wave,
        map: this.mapId,
        versusWin: 1,
      });
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private update(rawDt: number): void {
    if (this.paused && !this.net.isOnline()) return;
    const dt = rawDt * this.speed;
    this.elapsedTime += dt;

    // Periodic UI refresh so ability cooldown / boss HP stay live without per-frame DOM thrashing
    this.uiRefreshTimer += rawDt;
    if (this.uiRefreshTimer >= 0.2) {
      this.uiRefreshTimer = 0;
      if (this.waveActive || this.abilityCooldown > 0 || this.attackCooldown > 0) {
        this.uiDirty = true;
      }
    }

    // Prune stale remote cursors
    if (this.remoteCursors.size > 0) {
      const now = performance.now();
      for (const [id, c] of this.remoteCursors) {
        if (now - c.lastSeen > 4000) this.remoteCursors.delete(id);
      }
    }

    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - rawDt * 22);
    }
    if (this.bossBannerTimer > 0) {
      this.bossBannerTimer -= rawDt;
      if (this.bossBannerTimer <= 0) this.bossBannerText = null;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - rawDt);
    }

    this.updateEffects(rawDt);

    if (this.gameOver) {
      if (this.gameMode === 'versus' && this.net.isOnline()) {
        this.versusSyncTimer += rawDt;
        if (this.versusSyncTimer >= 0.6) {
          this.versusSyncTimer = 0;
          this.sendVersusStatus();
        }
      }
      return;
    }

    if (this.abilityCooldown > 0 && (this.waveActive || this.trollQueue.length > 0)) {
      this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    }

    const auth = this.isAuthoritativeCoopHost();

    // Official Wave Spawn Queue (only authoritative host spawns in online Co-op)
    if (auth && this.waveActive && this.waveQueue.length > 0) {
      this.spawnTimer -= dt;
      while (this.waveActive && this.waveQueue.length > 0 && this.spawnTimer <= 0) {
        const next = this.waveQueue.shift()!;
        this.spawnBloon(next.type, 0, next.laneIndex, false);
        this.spawnTimer += next.wait;
      }
    }

    // Troll / Sabotage Spawn Queue (independent of official wave)
    if (auth && this.trollQueue.length > 0) {
      this.trollSpawnTimer -= dt;
      while (this.trollQueue.length > 0 && this.trollSpawnTimer <= 0) {
        const next = this.trollQueue.shift()!;
        this.spawnBloon(next.type, 0, next.laneIndex, true);
        this.trollSpawnTimer += next.wait;
      }
    }

    // Update Bloons (guest moves locally for smooth 60fps, host corrects via state_sync)
    this.updateBloons(dt, auth);

    // Apply DJ Buffs
    this.computeDjBuffs();

    // Update Towers
    this.updateTowers(dt, auth);

    // Update Projectiles & Ability Bombs
    this.updateProjectiles(dt, auth);
    this.updateAbilityBombs(dt, auth);

    // Update Poison Clouds
    this.updatePoisonClouds(dt, auth);

    // Check Official Wave Complete (troll bloons do NOT block or trigger wave completion!)
    const remainingOfficialBloons = this.bloons.some((b) => !b.isTroll);
    if (auth && this.waveActive && this.waveQueue.length === 0 && !remainingOfficialBloons) {
      this.handleWaveComplete();
    }

    // Auto-wave countdown (only authoritative host triggers in online Co-op)
    if (auth && !this.waveActive && this.autoWave && !this.victoryModalOpen && this.wave > 0) {
      this.autoWaveDelay -= dt;
      if (this.autoWaveDelay <= 0) {
        this.startNextWave();
      }
    }

    // Periodic Co-op Host State Sync
    if (this.gameMode === 'coop' && this.net.isOnline() && this.net.isHost()) {
      this.syncTimer += rawDt;
      const interval = this.waveActive || this.bloons.length > 0 ? 0.22 : 0.9;
      if (this.syncTimer >= interval) {
        this.syncTimer = 0;
        this.sendSnapshotToRoom();
      }
    }

    // Periodic Versus Status Sync
    if (this.gameMode === 'versus' && this.net.isOnline()) {
      this.versusSyncTimer += rawDt;
      if (this.versusSyncTimer >= 0.35) {
        this.versusSyncTimer = 0;
        this.sendVersusStatus();
      }
    }
  }

  private handleWaveComplete(): void {
    this.waveActive = false;
    const spec = getWaveSpec(this.wave);

    if (this.gameMode === 'local2p') {
      const half = Math.round(spec.bonusBananas / 2);
      const p1Stat = this.playerStats.get('local-p1');
      const p2Stat = this.playerStats.get('local-p2');
      this.local2pBananas[0] += half + (p1Stat?.incomeBonus ?? 0);
      this.local2pBananas[1] += half + (p2Stat?.incomeBonus ?? 0);
      this.bananas = this.local2pBananas[this.activeLocalIndex];
    } else if (this.gameMode === 'coop' && this.net.isOnline()) {
      const players = this.net.room.getPlayers();
      const basePerPlayer = Math.round(spec.bonusBananas * (players.length > 1 ? 0.72 : 1));
      for (const p of players) {
        const st = this.playerStats.get(p.id);
        const gain = basePerPlayer + (st?.incomeBonus ?? 0);
        this.creditBananasToOwner(p.id, gain);
      }
    } else {
      this.bananas += spec.bonusBananas + this.incomeBonus;
    }

    // Fazenda end-of-wave yield + Lv3 Banco Central life heal
    for (const t of this.towers) {
      if (t.type !== 'fazenda') continue;
      const waveBonus = [25, 45, 75, 120][t.level];
      t.farmEarned = (t.farmEarned ?? 0) + waveBonus;
      this.creditBananasToOwner(t.ownerId, waveBonus);
      this.addFloatingText(t.x, t.y - 22, `+${waveBonus} 🍌 Safra!`, '#a3e635', 0.95);
      if (t.level >= 3 && this.lives < MAX_BONUS_LIVES) {
        this.lives += 1;
        this.addFloatingText(t.x, t.y - 38, '+1 ❤️ Banco!', '#fb7185', 1.0);
      }
    }

    if (this.abilityCooldown > 0) {
      this.abilityCooldown = Math.max(0, this.abilityCooldown - 5);
    }

    this.score += this.wave * 100;
    this.playSfx('fanfare', 0.22, 120);
    this.addFloatingText(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 - 20,
      `ONDA ${this.wave} LIMPA! +${spec.bonusBananas} 🍌`,
      '#4ade80',
      1.3,
    );

    if (this.gameMode === 'coop' && this.net.isHost() && this.net.isOnline()) {
      this.sendSnapshotToRoom();
    } else if (this.gameMode === 'versus' && this.net.isOnline()) {
      this.sendVersusStatus();
    }

    if (this.wave === 15 && !this.victoryAlreadyTriggered && this.gameMode !== 'versus') {
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

  private spawnBloon(
    type: BloonType,
    distance: number,
    laneIndex = 0,
    isTroll = false,
  ): BloonInstance {
    const def = BLOON_DEFS[type];
    const map = this.getMap();
    const pos = samplePathPosition(map, distance, laneIndex);
    const playersCount = this.gameMode === 'coop' ? Math.max(1, this.net.room.getPlayers().length) : 1;
    const coopScale = playersCount > 1 && def.isBoss ? 1 + (playersCount - 1) * 0.25 : 1;
    const waveScale = def.isBoss && this.wave > 5 ? 1 + (this.wave - 5) * 0.14 : 1;
    const hp = Math.max(1, Math.round(def.hp * waveScale * coopScale));
    const bloon: BloonInstance = {
      id: this.nextId('bl'),
      type,
      hp,
      maxHp: hp,
      laneIndex,
      distance,
      angle: pos.angle,
      x: pos.x,
      y: pos.y,
      slowTimer: 0,
      slowFactor: 1,
      camoStripped: false,
      hitFlash: 0,
      wobbleSeed: Math.random() * Math.PI * 2,
      poisonCarry: 0,
      isTroll,
    };
    this.bloons.push(bloon);
    return bloon;
  }

  private updateBloons(dt: number, authoritative: boolean): void {
    const map = this.getMap();

    for (let i = this.bloons.length - 1; i >= 0; i--) {
      const b = this.bloons[i];
      const def = BLOON_DEFS[b.type];
      const path = compileMapPath(map, b.laneIndex);

      if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt * 6);
      if (b.slowTimer > 0) {
        b.slowTimer -= dt;
        if (b.slowTimer <= 0) b.slowFactor = 1;
      }

      const moveSpeed = def.speed * (b.slowTimer > 0 ? b.slowFactor : 1);
      b.distance += moveSpeed * dt;

      if (b.distance >= path.totalLength) {
        this.bloons.splice(i, 1);
        if (authoritative) {
          this.lives = Math.max(0, this.lives - def.livesDamage);
          this.shakeAmount = Math.max(this.shakeAmount, def.isBoss ? 14 : 6);
          this.playSfx('rage', 0.25, 90);
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
        }
        continue;
      }

      const pos = samplePathPosition(map, b.distance, b.laneIndex);
      b.x = pos.x;
      b.y = pos.y;
      b.angle = pos.angle;
    }
  }

  private triggerGameOver(): void {
    this.gameOver = true;
    this.waveActive = false;
    this.playSfx('rage', 0.4, 200);
    if (this.gameMode === 'coop' && this.net.isHost() && this.net.isOnline()) {
      this.sendSnapshotToRoom();
    } else if (this.gameMode === 'versus' && this.net.isOnline()) {
      this.sendVersusStatus();
    }
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

  private updateTowers(dt: number, authoritative: boolean): void {
    for (const tower of this.towers) {
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - dt * 5);

      // Fazenda only generates during official waves!
      if (tower.type === 'fazenda') {
        if (!this.waveActive) continue;
        if (tower.cooldown > 0) tower.cooldown -= dt;
        if (tower.cooldown > 0) continue;

        const rate = [0.22, 0.27, 0.31, 0.35][tower.level] * tower.buffedMultiplier;
        tower.cooldown = 1 / rate;
        tower.recoil = 1;

        if (authoritative) {
          const harvest = [15, 24, 36, 55][tower.level];
          tower.farmEarned = (tower.farmEarned ?? 0) + harvest;
          this.creditBananasToOwner(tower.ownerId, harvest);
          this.score += 10;
          this.playSfx('coin', 0.14, 70);
          this.spawnPopParticles(tower.x, tower.y - 8, '#fde047', 6);
          this.addFloatingText(tower.x, tower.y - 20, `+${harvest} 🍌`, '#fef08a', 0.95);
          this.uiDirty = true;
        }
        continue;
      }

      if (tower.cooldown > 0) tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;

      if (tower.type === 'dj') {
        this.fireDjTower(tower, authoritative);
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
        this.fireSniperTower(tower, target, authoritative);
      } else if (tower.type === 'coco') {
        if (tower.level >= 2) fireRate *= 1.15;
        this.fireCocoTower(tower, target);
      } else if (tower.type === 'mago') {
        if (tower.level >= 1) fireRate *= 1.15;
        if (tower.level >= 3) fireRate *= 1.22;
        this.fireMagoTower(tower, target, authoritative);
      }

      tower.cooldown = 1 / fireRate;
    }
  }

  private towerDetectsCamo(tower: TowerInstance): boolean {
    if (tower.type === 'dj' || tower.type === 'mago') return true;
    if (tower.type === 'banana' && tower.level >= 2) return true;
    if (tower.type === 'havaianas' && tower.level >= 2) return true;
    if (tower.type === 'sniper' && tower.level >= 1) return true;
    return false;
  }

  private pickTarget(tower: TowerInstance, range: number, detectsCamo: boolean): BloonInstance | null {
    let best: BloonInstance | null = null;
    let bestScore = -Infinity;
    const map = this.getMap();

    for (const b of this.bloons) {
      const def = BLOON_DEFS[b.type];
      if (def.isCamo && !b.camoStripped && !detectsCamo) continue;

      const dist = Math.hypot(b.x - tower.x, b.y - tower.y);
      if (dist > range + def.radius * 0.5) continue;

      const laneLen = getLaneLength(map, b.laneIndex);
      const remaining = laneLen - b.distance;
      let score = 0;
      switch (tower.targetMode) {
        case 'first':
          score = -remaining;
          break;
        case 'last':
          score = remaining;
          break;
        case 'close':
          score = -dist;
          break;
        case 'strong':
          score = (def.isBoss ? 10000 : def.livesDamage * 10 + b.hp) * 10000 - remaining;
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
    this.playSfx('banana', 0.07, 50);
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
    this.playSfx('slap', 0.14, 55);
  }

  private fireSniperTower(tower: TowerInstance, target: BloonInstance, authoritative: boolean): void {
    const gunX = tower.x + Math.cos(tower.angle) * 24;
    const gunY = tower.y + Math.sin(tower.angle) * 24;

    if (authoritative && Math.random() < 0.12) {
      const missAngle = tower.angle + (Math.random() > 0.5 ? 0.28 : -0.28);
      const dist = Math.hypot(target.x - gunX, target.y - gunY) + 50;
      const mx = gunX + Math.cos(missAngle) * dist;
      const my = gunY + Math.sin(missAngle) * dist;
      this.tracers.push({ x1: gunX, y1: gunY, x2: mx, y2: my, isMiss: true, isCrit: false, ttl: 0.25 });
      this.addFloatingText(target.x, target.y - 22, 'ERROU VESGO!', '#fde047', 0.95);
      this.playSfx('boing', 0.14, 60);
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
    this.playSfx('explosion', 0.14, 60);

    if (!authoritative) return;

    if (tower.level >= 3) {
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
      this.addFloatingText(target.x, target.y - 24, `CRÍTICO -${dmg}! 💥`, '#fb7185', 1.15);
      const snapshot = [...this.bloons];
      for (const b of snapshot) {
        if (Math.hypot(b.x - target.x, b.y - target.y) <= 72) {
          this.damageBloon(b, b.id === target.id ? dmg : 8, true, tower.id);
        }
      }
    } else {
      this.damageBloon(target, dmg, popsLead, tower.id);
      if (BLOON_DEFS[target.type].isBoss || Math.random() < 0.45) {
        this.addFloatingText(target.x, target.y - 20, `-${dmg} 🎯`, '#fda4af', 0.95);
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
      detectsCamo: true,
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
    this.playSfx('boing', 0.12, 55);
  }

  private fireDjTower(tower: TowerInstance, authoritative: boolean): void {
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

    if (authoritative) {
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
    }
    this.playSfx('boing', 0.08, 80);
  }

  private fireMagoTower(tower: TowerInstance, target: BloonInstance, authoritative: boolean): void {
    const maxTargets = [4, 6, 8, 11][tower.level];
    const baseDmg = [2, 3, 4, 5][tower.level];
    const popsLead = tower.level >= 2;
    const hitIds: string[] = [];
    const points: Point[] = [
      { x: tower.x + Math.cos(tower.angle) * 22, y: tower.y + Math.sin(tower.angle) * 22 },
    ];

    let curr: BloonInstance | null = target;
    const targetsToHit: BloonInstance[] = [];
    while (curr && targetsToHit.length < maxTargets) {
      targetsToHit.push(curr);
      hitIds.push(curr.id);
      points.push({ x: curr.x, y: curr.y });
      curr = this.findNearestBloon(curr.x, curr.y, 155, hitIds, true);
    }

    this.lightningArcs.push({
      points,
      color: tower.level >= 3 ? '#facc15' : '#22d3ee',
      ttl: 0.2,
      maxTtl: 0.2,
    });

    if (authoritative) {
      for (const b of targetsToHit) {
        const def = BLOON_DEFS[b.type];
        if (def.isCamo && !b.camoStripped) {
          b.camoStripped = true;
          this.addFloatingText(b.x, b.y - 18, 'ÓCULOS FRITOU! ⚡', '#22d3ee', 0.9);
        }
        if (tower.level >= 2) {
          b.slowTimer = Math.max(b.slowTimer, 0.55);
          b.slowFactor = Math.min(b.slowFactor, 0.35);
        }
        if (tower.level >= 3 && !def.isBoss) {
          b.distance = Math.max(0, b.distance - 18);
        }
        const dmg = tower.level >= 3 && def.isBoss ? 14 : baseDmg;
        this.damageBloon(b, dmg, popsLead, tower.id);
      }
    }

    this.playSfx('slap', 0.1, 60);
  }

  private updateProjectiles(dt: number, authoritative: boolean): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttl -= dt;
      p.rotation += dt * 14;

      if (p.ttl <= 0) {
        if (p.kind === 'coco') this.detonateCoco(p, authoritative);
        this.projectiles.splice(i, 1);
        continue;
      }

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

      if (p.kind === 'coco' && p.targetX !== undefined && p.targetY !== undefined) {
        if (Math.hypot(p.x - p.targetX, p.y - p.targetY) <= 18) {
          this.detonateCoco(p, authoritative);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      let consumed = false;
      for (let j = this.bloons.length - 1; j >= 0; j--) {
        const b = this.bloons[j];
        if (p.hitIds.includes(b.id)) continue;
        const def = BLOON_DEFS[b.type];
        if (def.isCamo && !b.camoStripped && !p.detectsCamo) continue;

        if (Math.hypot(b.x - p.x, b.y - p.y) <= def.radius + 9) {
          if (p.kind === 'coco') {
            this.detonateCoco(p, authoritative);
            consumed = true;
            break;
          }

          p.hitIds.push(b.id);
          let finalDmg = p.damage;
          if (authoritative && p.critChance > 0 && Math.random() < p.critChance) {
            finalDmg *= 2;
            this.playSfx('slap', 0.24, 55);
            this.addFloatingText(b.x, b.y - 22, `CRÍTICA -${finalDmg}! 🩴`, '#38bdf8', 1.15);
          }

          if (authoritative) {
            if (p.pushBack > 0 && !def.isBoss) {
              b.distance = Math.max(0, b.distance - p.pushBack);
            }
            if (p.slowDuration > 0) {
              b.slowTimer = Math.max(b.slowTimer, p.slowDuration);
              b.slowFactor = Math.min(b.slowFactor, p.slowFactor);
            }
            this.damageBloon(b, finalDmg, p.popsLead, p.ownerTowerId);
          } else {
            b.hitFlash = 0.8;
          }

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

  private updateAbilityBombs(dt: number, authoritative: boolean): void {
    for (let i = this.abilityBombs.length - 1; i >= 0; i--) {
      const bomb = this.abilityBombs[i];
      bomb.y += bomb.vy * dt;
      if (bomb.y >= bomb.targetY) {
        this.abilityBombs.splice(i, 1);
        this.playSfx('explosion', 0.2, 50);
        this.rings.push({
          x: bomb.x,
          y: bomb.targetY,
          radius: 10,
          maxRadius: bomb.radius,
          color: '#facc15',
          alpha: 0.9,
          lineWidth: 4,
        });
        this.spawnPopParticles(bomb.x, bomb.targetY, '#fb923c', 12);

        if (authoritative) {
          const snapshot = [...this.bloons];
          for (const b of snapshot) {
            if (Math.hypot(b.x - bomb.x, b.y - bomb.targetY) <= bomb.radius + BLOON_DEFS[b.type].radius * 0.5) {
              b.camoStripped = true;
              b.slowTimer = Math.max(b.slowTimer, 1.5);
              b.slowFactor = Math.min(b.slowFactor, 0.55);
              this.damageBloon(b, bomb.damage, true, undefined, bomb.ownerId);
            }
          }
        }
      }
    }
  }

  private detonateCoco(p: Projectile, authoritative: boolean): void {
    this.playSfx('explosion', 0.16, 55);
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

    if (authoritative) {
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

  private updatePoisonClouds(dt: number, authoritative: boolean): void {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.ttl -= dt;
      c.tickTimer -= dt;
      if (c.ttl <= 0) {
        this.clouds.splice(i, 1);
        continue;
      }
      if (c.tickTimer <= 0) {
        c.tickTimer = 0.25;
        if (!authoritative) continue;
        const fracDmg = c.dps * 0.25;
        const snapshot = [...this.bloons];
        for (const b of snapshot) {
          if (Math.hypot(b.x - c.x, b.y - c.y) <= c.radius + BLOON_DEFS[b.type].radius * 0.4) {
            if (c.slowFactor < 1) {
              b.slowTimer = Math.max(b.slowTimer, 0.7);
              b.slowFactor = Math.min(b.slowFactor, c.slowFactor);
            }
            b.poisonCarry += fracDmg;
            if (b.poisonCarry >= 1) {
              const whole = Math.floor(b.poisonCarry);
              b.poisonCarry -= whole;
              this.damageBloon(b, whole, true, c.ownerTowerId);
            }
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
    ownerTowerId?: string,
    directActorId?: string,
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

    const ownerTower = ownerTowerId ? this.towers.find((t) => t.id === ownerTowerId) : undefined;
    const creditId = ownerTower?.ownerId ?? directActorId ?? this.getActiveActor().id;

    if (bloon.hp <= 0) {
      const overflow = Math.max(0, -bloon.hp);
      this.bloons.splice(idx, 1);

      const baseReward = bloon.isTroll ? (def.isBoss ? 15 : 1) : def.reward;
      if (this.gameMode === 'coop' && this.net.isOnline()) {
        const ownerShare = Math.max(1, Math.ceil(baseReward * 0.7));
        this.creditBananasToOwner(creditId, ownerShare);
        const others = this.net.room.getPlayers().filter((p) => p.id !== creditId);
        if (others.length > 0 && baseReward >= 2) {
          const assist = Math.max(1, Math.floor(baseReward * 0.3));
          for (const o of others) this.creditBananasToOwner(o.id, assist);
        }
      } else {
        this.creditBananasToOwner(creditId, baseReward);
      }

      this.score += def.isBoss ? 500 : 12;
      if (ownerTower) ownerTower.pops += 1;
      const stat = this.playerStats.get(creditId);
      if (stat) stat.pops += 1;

      this.spawnPopParticles(bloon.x, bloon.y, def.color, def.isBoss ? 28 : 7);

      if (def.isBoss) {
        this.playSfx('explosion', 0.34, 80);
        this.shakeAmount = Math.max(this.shakeAmount, bloon.type === 'zepelim' ? 16 : 11);
        this.addFloatingText(
          bloon.x,
          bloon.y - 26,
          bloon.type === 'zepelim' ? 'RECEITA ESTOURADA! 💸' : `IMPOSTO PAGO! +${baseReward} 🍌`,
          '#fde047',
          1.35,
        );
      } else if (damage >= 4 || Math.random() < 0.25) {
        this.addFloatingText(bloon.x, bloon.y - 12, `+${baseReward} 🍌`, '#fef08a', 0.85);
      }

      def.children.forEach((childType, cIdx) => {
        const child = this.spawnBloon(
          childType,
          Math.max(0, bloon.distance - cIdx * 10),
          bloon.laneIndex,
          bloon.isTroll,
        );
        child.slowTimer = bloon.slowTimer * 0.6;
        child.slowFactor = bloon.slowFactor;
        child.camoStripped = bloon.camoStripped;
        if (cIdx === 0 && overflow > 0 && !def.isBoss) {
          this.damageBloon(child, overflow, popsLead, ownerTowerId, directActorId);
        }
      });

      this.uiDirty = true;
    } else if (def.isBoss && damage >= 5) {
      this.addFloatingText(bloon.x, bloon.y - 28, `-${damage}`, '#fca5a5', 0.9);
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

    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      this.lightningArcs[i].ttl -= dt;
      if (this.lightningArcs[i].ttl <= 0) this.lightningArcs.splice(i, 1);
    }

    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].ttl -= dt;
      if (this.pings[i].ttl <= 0) this.pings.splice(i, 1);
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
    if (this.floatingTexts.length > 42) this.floatingTexts.shift();
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
      lightningArcs: this.lightningArcs,
      abilityBombs: this.abilityBombs,
      pings: this.pings,
      remoteCursors: Array.from(this.remoteCursors.values()),
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      selectedTowerId: this.selectedTowerId,
      placingType: this.placingType,
      hoverPos: this.hoverPos,
      bananas: this.getActiveBananas(),
      shakeAmount: this.shakeAmount,
      showOwners: this.net.isOnline() || this.gameMode === 'local2p',
      bossBannerText: this.bossBannerText,
    });
  }

  private buildNextWavePreview(): NextWavePreview {
    const nextWaveNum = this.wave + 1;
    const spec = getWaveSpec(nextWaveNum);
    const counts = new Map<BloonType, number>();
    for (const grp of spec.groups) {
      counts.set(grp.type, (counts.get(grp.type) ?? 0) + grp.count);
    }
    const items: NextWavePreviewItem[] = [];
    for (const [type, count] of counts) {
      const def = BLOON_DEFS[type];
      items.push({
        type,
        name: def.name,
        emoji: def.emoji,
        color: def.color,
        count,
        isCamo: def.isCamo,
        isLead: def.isLead,
        isBoss: def.isBoss,
      });
    }
    return {
      wave: nextWaveNum,
      title: spec.title,
      isBossWave: Boolean(spec.bossBanner),
      items,
    };
  }

  public getUiSnapshot(): UiSnapshot {
    this.ensureLocalStatsEntry();
    const selectedTower = this.towers.find((t) => t.id === this.selectedTowerId) ?? null;
    const spec = getWaveSpec(Math.max(1, this.wave || 1));
    const actor = this.getActiveActor();
    const leaderboard = Array.from(this.playerStats.values()).sort((a, b) =>
      this.gameMode === 'versus'
        ? Number(b.alive) - Number(a.alive) || b.lives - a.lives || b.pops - a.pops
        : b.pops - a.pops,
    );

    return {
      mapId: this.mapId,
      gameMode: this.gameMode,
      bananas: this.getActiveBananas(),
      local2pWallets: [this.local2pBananas[0], this.local2pBananas[1]],
      activeLocalIndex: this.activeLocalIndex,
      activeActorId: actor.id,
      activeActorName: actor.name,
      activeActorColor: actor.color,
      incomeBonus: this.incomeBonus,
      lives: this.lives,
      wave: this.wave,
      score: this.score,
      speed: this.speed,
      autoWave: this.autoWave,
      waveActive: this.waveActive,
      waveTitle: this.wave === 0 ? 'Pronto para o Caos!' : spec.title,
      nextWavePreview: this.buildNextWavePreview(),
      abilityCooldown: this.abilityCooldown,
      abilityMaxCooldown: ABILITY_COOLDOWN_SECONDS,
      attackCooldown: this.attackCooldown,
      selectedTower,
      placingType: this.placingType,
      pendingMapConfirm: this.pendingMapConfirm,
      gameOver: this.gameOver,
      victoryShown: this.victoryModalOpen,
      versusWinner: this.versusWinner,
      isCoop: this.net.isOnline(),
      isOnline: this.net.isOnline(),
      isHost: this.net.isHost(),
      localPlayerId: this.net.room.localPlayer.id,
      playersCount: this.net.room.getPlayers().length,
      otherPlayers: this.net.getOtherPlayers().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
      })),
      leaderboard,
    };
  }

  public emitUi(): void {
    this.onUiUpdate(this.getUiSnapshot());
  }
}
