import { type MonkeyHudHandle, PeerRoom, reportGameScore } from '@monkey-slop/sdk';
import {
  BOSS_SCHEDULE,
  CHARACTERS,
  CHARACTER_ORDER,
  ENEMY_ARCHETYPES,
  FUNNY_QUIPS,
  META_UPGRADES,
  PASSIVES,
  PASSIVE_IDS,
  RUN_DURATION_SEC,
  WEAPONS,
  WEAPON_IDS,
} from './catalog';
import {
  evaluateCharacterUnlocks,
  getMetaUpgradeCost,
  loadMetaProgress,
  saveMetaProgress,
} from './meta';
import { renderGame } from './renderer';
import { sfx } from './sfx';
import { ObjectPool, SpatialHash } from './spatial';
import type {
  BossKind,
  CharacterId,
  EnemyEntity,
  EnemyKind,
  FloatingTextEntity,
  GameScreen,
  GemKind,
  MetaProgress,
  MetaUpgradeId,
  NetMessage,
  ParticleEntity,
  PassiveId,
  PickupEntity,
  PlayerState,
  PlayerStats,
  ProjectileEntity,
  UpgradeCardOption,
  VisualEffect,
  WeaponId,
} from './types';

const MAX_WEAPON_SLOTS = 6;
const MAX_PASSIVE_SLOTS = 6;
const MAX_ENEMIES = 320;
const REVIVE_TIME_SEC = 2.0;
const SLUG = 'monkey-survivors';

export class MonkeySurvivorsGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly room: PeerRoom<NetMessage>;
  private readonly hud: MonkeyHudHandle;

  private meta: MetaProgress = loadMetaProgress();
  private selectedChar: CharacterId = 'chimp_clt';
  private screen: GameScreen = 'title';
  private titleTab: 'play' | 'shop' = 'play';

  // Loop & viewport
  private cw = 960;
  private ch = 640;
  private dpr = 1;
  private lastRaf = 0;
  private animTime = 0;

  // Camera & juice
  private camX = 0;
  private camY = 0;
  private shakeMag = 0;
  private shakeX = 0;
  private shakeY = 0;

  // Run state (authoritative on Host or Solo)
  private elapsed = 0;
  private level = 1;
  private xp = 0;
  private xpToNext = 10;
  private totalKills = 0;
  private coinsEarned = 0;
  private bossesDefeated = 0;
  private spawnedBossIndices = new Set<number>();
  private nextEliteAt = 75;
  private spawnAccum = 0;
  private nextEntityId = 1;
  private bannerText = '';
  private bannerTimer = 0;
  private draftTimeout = 0;

  // Players
  private players: PlayerState[] = [];
  private localCards: UpgradeCardOption[] = [];
  private chestModalData: { title: string; cards: UpgradeCardOption[]; coins: number } | null = null;
  private chestTimer = 0;
  private endSummary: {
    victory: boolean;
    score: number;
    newlyUnlocked: CharacterId[];
  } | null = null;

  // Pools & spatial hashes
  private enemyPool = new ObjectPool<EnemyEntity>(MAX_ENEMIES, () => ({
    active: false,
    id: 0,
    kind: 'boleto',
    isBoss: false,
    isElite: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 15,
    hp: 20,
    maxHp: 20,
    speed: 90,
    damage: 10,
    xpValue: 2,
    hitFlash: 0,
    knockVx: 0,
    knockVy: 0,
    phase: 0,
    shootTimer: 0,
    slowTimer: 0,
    chargeTimer: 0,
    chargeDx: 0,
    chargeDy: 0,
  }));

  private projPool = new ObjectPool<ProjectileEntity>(260, () => ({
    active: false,
    id: 0,
    ownerId: '',
    kind: 'mango',
    weaponId: 'mango_gatling',
    evolved: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 8,
    damage: 10,
    pierce: 1,
    life: 1,
    maxLife: 1,
    angle: 0,
    spin: 0,
    returning: false,
    targetEnemyId: 0,
    hitIds: new Set<number>(),
    color: '#facc15',
    armed: true,
    chainLeft: 0,
  }));

  private pickupPool = new ObjectPool<PickupEntity>(340, () => ({
    active: false,
    id: 0,
    kind: 'green',
    x: 0,
    y: 0,
    value: 1,
    magnetizedToId: null,
    bobPhase: 0,
  }));

  private vfxPool = new ObjectPool<VisualEffect>(120, () => ({
    active: false,
    kind: 'ring',
    x: 0,
    y: 0,
    x2: 0,
    y2: 0,
    radius: 30,
    angle: 0,
    life: 0.2,
    maxLife: 0.2,
    color: '#facc15',
  }));

  private particlePool = new ObjectPool<ParticleEntity>(360, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 4,
    life: 0.3,
    maxLife: 0.3,
    color: '#facc15',
    shape: 'circle',
    rot: 0,
    vrot: 0,
  }));

  private textPool = new ObjectPool<FloatingTextEntity>(160, () => ({
    active: false,
    x: 0,
    y: 0,
    vy: -40,
    text: '',
    color: '#ffffff',
    size: 14,
    life: 0.6,
    maxLife: 0.6,
    crit: false,
  }));

  private enemyGrid = new SpatialHash<EnemyEntity>(96);
  private pickupGrid = new SpatialHash<PickupEntity>(96);
  private queryEnemiesBuf: EnemyEntity[] = [];
  private queryPickupsBuf: PickupEntity[] = [];

  // Input
  private keys = new Set<string>();
  private pausedByGuide = false;
  private joystick = {
    active: false,
    pointerId: -1,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
    dx: 0,
    dy: 0,
  };

  // Multiplayer sync timers
  private netSyncAccum = 0;
  private inputSendAccum = 0;
  private guestRenderPlayers: PlayerState[] = [];
  private guestRenderEnemies: EnemyEntity[] = [];
  private guestRenderProjs: ProjectileEntity[] = [];
  private guestRenderPickups: PickupEntity[] = [];

  // Aura / Orbit tick tracking per player
  private auraTickTimers = new Map<string, number>();
  private orbitHitCooldowns = new Map<string, number>();

  // DOM Overlay Elements
  private uiRoot!: HTMLDivElement;
  private hudOverlay!: HTMLDivElement;
  private modalOverlay!: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement, room: PeerRoom<NetMessage>, hud: MonkeyHudHandle) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Contexto 2D indisponível');
    }
    this.ctx = context;
    this.room = room;
    this.hud = hud;

    this.ensureStyles();
    this.buildDom();
    this.bindInput();
    this.resize();
    this.renderUi();

    this.lastRaf = performance.now();
    requestAnimationFrame(this.loop);
  }

  private isMultiplayer(): boolean {
    return this.room.getPlayers().length > 1;
  }

  private isAuthority(): boolean {
    return !this.isMultiplayer() || this.room.localPlayer.isHost;
  }

  setControlsGuideOpen(open: boolean): void {
    if (open) {
      this.keys.clear();
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
      if (!this.isMultiplayer() && this.screen === 'playing') {
        this.pausedByGuide = true;
        this.screen = 'paused';
        this.renderUi();
      }
    } else if (this.pausedByGuide) {
      this.pausedByGuide = false;
      if (this.screen === 'paused') {
        this.screen = 'playing';
        this.renderUi();
      }
    }
  }

  onPlayersChange(players: ReturnType<PeerRoom<NetMessage>['getPlayers']>): void {
    this.hud.setPlayers(players);
    if (this.screen === 'title') {
      this.renderUi();
    } else if (this.isAuthority()) {
      // Add new joiners mid-run or remove disconnected ones
      const rosterIds = new Set(players.map((p) => p.id));
      this.players = this.players.filter((p) => rosterIds.has(p.id));
      for (const rp of players) {
        if (!this.players.some((p) => p.id === rp.id)) {
          const anchor = this.players[0] ?? { x: 0, y: 0 };
          this.players.push(
            this.createPlayerState(
              rp.id,
              rp.name,
              rp.color,
              'chimp_clt',
              anchor.x + (Math.random() - 0.5) * 60,
              anchor.y + (Math.random() - 0.5) * 60,
              rp.id === this.room.localPlayer.id,
              rp.isHost,
            ),
          );
          this.hud.toast(`🐒 ${rp.name} entrou na horda!`, 'info');
        }
      }
    }
  }

  onNetMessage(msg: NetMessage, senderId: string, senderName: string): void {
    switch (msg.type) {
      case 'input': {
        if (!this.isAuthority()) return;
        const p = this.players.find((pl) => pl.id === senderId);
        if (p) {
          p.inputDx = Math.max(-1, Math.min(1, msg.dx));
          p.inputDy = Math.max(-1, Math.min(1, msg.dy));
          if (msg.name) p.name = msg.name;
          if (msg.charId && msg.charId in CHARACTERS && p.charId !== msg.charId && this.elapsed < 5) {
            p.charId = msg.charId;
          }
        }
        break;
      }
      case 'request_start': {
        if (this.isAuthority() && this.screen === 'title') {
          this.startRun();
        }
        break;
      }
      case 'pick_card': {
        if (!this.isAuthority()) return;
        const p = this.players.find((pl) => pl.id === senderId);
        if (p && p.pendingChoice) {
          this.applyUpgradeOption(p, msg.option);
          p.pendingChoice = false;
          this.checkAllDraftsDone();
        }
        break;
      }
      case 'draft_cards': {
        if (msg.targetPlayerId !== this.room.localPlayer.id) return;
        this.localCards = msg.cards;
        this.screen = 'levelup';
        sfx.levelUp();
        this.renderUi();
        break;
      }
      case 'chest_reward': {
        if (msg.targetPlayerId !== this.room.localPlayer.id) return;
        this.chestModalData = { title: msg.title, cards: msg.cards, coins: msg.coins };
        this.chestTimer = 3.2;
        sfx.chest();
        this.renderUi();
        break;
      }
      case 'sfx_event': {
        if (msg.sound === 'boss') sfx.bossAlert();
        else if (msg.sound === 'revive') sfx.revive();
        else if (msg.sound === 'hurt') sfx.hurt();
        if (msg.msg) this.hud.toast(msg.msg, 'banana');
        break;
      }
      case 'state': {
        if (this.isAuthority()) return;
        this.applyRemoteState(msg);
        break;
      }
    }
    void senderName;
  }

  private applyRemoteState(s: Extract<NetMessage, { type: 'state' }>): void {
    const prevScreen = this.screen;
    this.elapsed = s.elapsed;
    this.level = s.level;
    this.xp = s.xp;
    this.xpToNext = s.xpToNext;
    this.totalKills = s.kills;
    this.coinsEarned = s.coinsEarned;
    this.bannerText = s.bannerText;
    this.bannerTimer = s.bannerTimer;

    if (s.screen !== 'levelup') {
      this.screen = s.screen;
    } else if (this.screen !== 'levelup') {
      // Waiting for other players to choose
      this.screen = 'levelup';
    }

    this.guestRenderPlayers = s.players.map((rp) => ({
      id: rp.id,
      name: rp.name,
      color: rp.color,
      charId: rp.charId,
      x: rp.x,
      y: rp.y,
      vx: rp.fx * 100,
      vy: rp.fy * 100,
      facingX: rp.fx,
      facingY: rp.fy,
      hp: rp.hp,
      maxHp: rp.maxHp,
      downed: rp.downed,
      reviveProgress: rp.revive,
      invulnTimer: 0,
      hitFlash: rp.flash,
      walkPhase: this.animTime * 11,
      weapons: rp.weapons.map((w) => ({
        id: w.id,
        level: w.lvl,
        evolved: w.evo,
        cooldownTimer: 0,
        totalDamage: 0,
      })),
      passives: rp.passives.map((ps) => ({ id: ps.id, level: ps.lvl })),
      kills: rp.kills,
      inputDx: 0,
      inputDy: 0,
      pendingChoice: rp.pending,
      isLocal: rp.id === this.room.localPlayer.id,
      isHost: false,
    }));

    this.guestRenderEnemies = s.enemies.map((e) => ({
      active: true,
      id: e.id,
      kind: e.k,
      isBoss: e.b === 1,
      isElite: e.e === 1,
      x: e.x,
      y: e.y,
      vx: 0,
      vy: 0,
      radius: e.r,
      hp: e.hp,
      maxHp: e.mhp,
      speed: 0,
      damage: 0,
      xpValue: 0,
      hitFlash: e.fl,
      knockVx: 0,
      knockVy: 0,
      phase: e.id * 0.7,
      shootTimer: 0,
      slowTimer: 0,
      chargeTimer: 0,
      chargeDx: 0,
      chargeDy: 0,
    }));

    this.guestRenderProjs = s.projectiles.map((p) => ({
      active: true,
      id: p.id,
      ownerId: '',
      kind: p.k,
      weaponId: p.w,
      evolved: p.ev === 1,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      radius: p.r,
      damage: 0,
      pierce: 1,
      life: 1,
      maxLife: 1,
      angle: p.a,
      spin: 0,
      returning: false,
      targetEnemyId: 0,
      hitIds: new Set(),
      color: p.c,
      armed: true,
      chainLeft: 0,
    }));

    this.guestRenderPickups = s.pickups.map((g) => ({
      active: true,
      id: g.id,
      kind: g.k,
      x: g.x,
      y: g.y,
      value: 1,
      magnetizedToId: null,
      bobPhase: g.id * 0.5,
    }));

    for (const v of s.vfx) {
      const slot = this.vfxPool.acquire();
      slot.kind = v.k;
      slot.x = v.x;
      slot.y = v.y;
      slot.x2 = v.x2;
      slot.y2 = v.y2;
      slot.radius = v.r;
      slot.angle = v.a;
      slot.life = v.l;
      slot.maxLife = v.ml;
      slot.color = v.c;
    }

    if (prevScreen !== this.screen) {
      if (this.screen === 'gameover' || this.screen === 'victory') {
        this.finalizeClientEnd(this.screen === 'victory');
      }
      this.renderUi();
    } else if (this.screen === 'playing') {
      this.updatePlayingHud();
    }
  }

  private finalizeClientEnd(victory: boolean): void {
    const score = Math.floor(this.elapsed * 10 + this.totalKills * 5 + this.level * 120);
    this.meta.totalRuns += 1;
    this.meta.totalKills += this.totalKills;
    this.meta.bestTimeSec = Math.max(this.meta.bestTimeSec, this.elapsed);
    this.meta.bestLevel = Math.max(this.meta.bestLevel, this.level);
    this.meta.coins += this.coinsEarned;
    if (victory) this.meta.victories += 1;
    const newlyUnlocked = evaluateCharacterUnlocks(this.meta, this.elapsed, this.level, 0);
    saveMetaProgress(this.meta);
    reportGameScore(SLUG, score, { level: this.level, kills: this.totalKills });
    this.endSummary = { victory, score, newlyUnlocked };
  }

  private createPlayerState(
    id: string,
    name: string,
    color: string,
    charId: CharacterId,
    x: number,
    y: number,
    isLocal: boolean,
    isHost: boolean,
  ): PlayerState {
    const def = CHARACTERS[charId];
    const maxHp = def.maxHp + this.meta.upgrades.potassio * 20;
    return {
      id,
      name,
      color,
      charId,
      x,
      y,
      vx: 0,
      vy: 0,
      facingX: 1,
      facingY: 0,
      hp: maxHp,
      maxHp,
      downed: false,
      reviveProgress: 0,
      invulnTimer: 1.0,
      hitFlash: 0,
      walkPhase: 0,
      weapons: [
        {
          id: def.startWeapon,
          level: 1,
          evolved: false,
          cooldownTimer: 0.15,
          totalDamage: 0,
        },
      ],
      passives: [],
      kills: 0,
      inputDx: 0,
      inputDy: 0,
      pendingChoice: false,
      isLocal,
      isHost,
    };
  }

  private getPlayerStats(p: PlayerState): PlayerStats {
    const def = CHARACTERS[p.charId] ?? CHARACTERS.chimp_clt;
    const pLevel = (id: PassiveId) => p.passives.find((s) => s.id === id)?.level ?? 0;

    const cafeLvl = pLevel('cafe_forte');
    const queijoLvl = pLevel('queijo_vencido');
    const luvaLvl = pLevel('luva_motoboy');
    const rotLvl = pLevel('roteador_5g');
    const imaLvl = pLevel('ima_geladeira');
    const corLvl = pLevel('coracao_banana');

    const maxHp = def.maxHp + this.meta.upgrades.potassio * 20 + corLvl * 25;
    const moveSpeed =
      def.moveSpeed * (1 + this.meta.upgrades.cafeina * 0.06 + luvaLvl * 0.09);
    const damageMult =
      def.damageMult * (1 + this.meta.upgrades.mao_pesada * 0.08 + rotLvl * 0.15);
    const cooldownMult = Math.max(
      0.35,
      (1 / def.attackSpeedMult) *
        Math.pow(0.94, this.meta.upgrades.dedos_ageis) *
        Math.pow(0.91, cafeLvl),
    );
    const areaMult = def.areaMult * (1 + queijoLvl * 0.15);
    const projSpeedMult = 1 + luvaLvl * 0.18;
    const pickupRadius =
      def.pickupRadius * (1 + this.meta.upgrades.ima_natural * 0.2 + imaLvl * 0.32);
    const extraProjectiles = def.extraProjectiles + (imaLvl >= 3 ? 1 : 0);
    const regenPerSec = corLvl * 0.8;
    const armor = def.armor;
    const xpMult = 1 + this.meta.upgrades.bolsa_banana * 0.1;

    return {
      maxHp,
      moveSpeed,
      damageMult,
      cooldownMult,
      areaMult,
      projSpeedMult,
      pickupRadius,
      extraProjectiles,
      regenPerSec,
      armor,
      xpMult,
    };
  }

  private startRun(): void {
    sfx.click();
    if (this.isMultiplayer() && !this.room.localPlayer.isHost) {
      this.room.send('request_start', { type: 'request_start' });
      this.hud.toast('Pedindo para o Host iniciar...', 'info');
      return;
    }

    this.enemyPool.releaseAll();
    this.projPool.releaseAll();
    this.pickupPool.releaseAll();
    this.vfxPool.releaseAll();
    this.particlePool.releaseAll();
    this.textPool.releaseAll();
    this.auraTickTimers.clear();
    this.orbitHitCooldowns.clear();

    this.elapsed = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 10;
    this.totalKills = 0;
    this.coinsEarned = 0;
    this.bossesDefeated = 0;
    this.spawnedBossIndices.clear();
    this.nextEliteAt = 75;
    this.spawnAccum = 0;
    this.bannerText = '🧾 A HORDA DO BOLETO COMEÇOU! SOBREVIVA 15 MINUTOS!';
    this.bannerTimer = 3.2;
    this.localCards = [];
    this.chestModalData = null;
    this.chestTimer = 0;
    this.endSummary = null;
    this.camX = 0;
    this.camY = 0;

    const roster = this.room.getPlayers();
    if (roster.length > 0) {
      this.players = roster.map((rp, idx) => {
        const angle = (idx * Math.PI * 2) / roster.length;
        const dist = roster.length > 1 ? 45 : 0;
        const isLocal = rp.id === this.room.localPlayer.id;
        return this.createPlayerState(
          rp.id,
          rp.name,
          rp.color,
          isLocal ? this.selectedChar : 'chimp_clt',
          Math.cos(angle) * dist,
          Math.sin(angle) * dist,
          isLocal,
          rp.isHost,
        );
      });
    } else {
      const lp = this.room.localPlayer;
      this.players = [
        this.createPlayerState(lp.id, lp.name, lp.color, this.selectedChar, 0, 0, true, true),
      ];
    }

    // Immediate initial wave so action starts in second 1
    for (let i = 0; i < 10; i++) {
      this.spawnEnemy('boleto', false);
    }

    this.screen = 'playing';
    this.renderUi();
  }

  private loop = (now: number): void => {
    const rawDt = (now - this.lastRaf) / 1000;
    this.lastRaf = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.animTime += dt;

    if (this.screen === 'playing' || (this.screen === 'chest' && this.chestTimer > 0)) {
      if (this.isAuthority()) {
        this.stepSimulation(dt);
      } else {
        this.stepClientLocal(dt);
      }
    } else if (this.screen === 'levelup' && this.isAuthority() && this.isMultiplayer()) {
      // Auto-pick timeout so AFK player doesn't freeze co-op forever
      this.draftTimeout -= dt;
      if (this.draftTimeout <= 0) {
        for (const p of this.players) {
          if (p.pendingChoice) {
            const opts = this.generateDraftCards(p);
            if (opts.length > 0) this.applyUpgradeOption(p, opts[0]);
            p.pendingChoice = false;
          }
        }
        this.checkAllDraftsDone();
      }
    }

    if (this.chestTimer > 0) {
      this.chestTimer -= dt;
      if (this.chestTimer <= 0) {
        this.chestModalData = null;
        if (this.screen === 'chest') this.screen = 'playing';
        this.renderUi();
      }
    }

    this.stepVisuals(dt);
    this.render();
    requestAnimationFrame(this.loop);
  };

  private getLocalInput(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;

    if (this.joystick.active) {
      dx += this.joystick.dx;
      dy += this.joystick.dy;
    }

    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    return { dx, dy };
  }

  private stepClientLocal(dt: number): void {
    const inp = this.getLocalInput();
    this.inputSendAccum += dt;
    if (this.inputSendAccum >= 0.05) {
      this.inputSendAccum = 0;
      this.room.send('input', {
        type: 'input',
        dx: inp.dx,
        dy: inp.dy,
        charId: this.selectedChar,
        name: this.room.localPlayer.name,
      });
    }

    // Update local VFX lifetime
    for (const v of this.vfxPool.items) {
      if (!v.active) continue;
      v.life -= dt;
      if (v.life <= 0) v.active = false;
    }

    // Camera follows local player
    const lp =
      this.guestRenderPlayers.find((p) => p.id === this.room.localPlayer.id) ??
      this.guestRenderPlayers[0];
    if (lp) {
      this.camX += (lp.x - this.camX) * Math.min(1, dt * 10);
      this.camY += (lp.y - this.camY) * Math.min(1, dt * 10);
    }
  }

  private stepSimulation(dt: number): void {
    this.elapsed += dt;
    if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - dt);

    // Local player input
    const localInput = this.getLocalInput();
    for (const p of this.players) {
      if (p.isLocal) {
        p.inputDx = localInput.dx;
        p.inputDy = localInput.dy;
      }
    }

    // 1. Move players & regen
    for (const p of this.players) {
      const stats = this.getPlayerStats(p);
      p.maxHp = stats.maxHp;
      if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);

      if (p.downed) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }

      if (stats.regenPerSec > 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + stats.regenPerSec * dt);
      }

      p.vx = p.inputDx * stats.moveSpeed;
      p.vy = p.inputDy * stats.moveSpeed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const spd = Math.hypot(p.vx, p.vy);
      if (spd > 15) {
        p.facingX = p.vx / spd;
        p.facingY = p.vy / spd;
        p.walkPhase += dt * 12;
      }
    }

    // Co-op Revive check
    if (this.players.length > 1) {
      for (const downed of this.players) {
        if (!downed.downed) continue;
        let someoneNear = false;
        for (const alive of this.players) {
          if (alive.downed || alive.id === downed.id) continue;
          if (Math.hypot(alive.x - downed.x, alive.y - downed.y) <= 58) {
            someoneNear = true;
            break;
          }
        }
        if (someoneNear) {
          downed.reviveProgress += dt / REVIVE_TIME_SEC;
          if (downed.reviveProgress >= 1) {
            downed.downed = false;
            downed.reviveProgress = 0;
            downed.hp = Math.round(downed.maxHp * 0.5);
            downed.invulnTimer = 2.2;
            sfx.revive();
            this.spawnParticles(downed.x, downed.y, '#4ade80', 18, 'circle');
            this.spawnText(downed.x, downed.y - 30, 'REVIVIDO! 🍌', '#4ade80', 16, true);
            this.hud.toast(`🚑 ${downed.name} voltou pro expediente!`, 'banana');
            if (this.isMultiplayer()) {
              this.room.send('sfx_event', {
                type: 'sfx_event',
                sound: 'revive',
                msg: `🚑 ${downed.name} foi revivido!`,
              });
            }
          }
        } else {
          downed.reviveProgress = Math.max(0, downed.reviveProgress - dt * 0.35);
        }
      }
    }

    // Check total team defeat
    if (this.players.length > 0 && this.players.every((p) => p.downed)) {
      this.finishRun(false);
      return;
    }

    // Camera tracks local alive player (or first alive)
    const camTarget =
      this.players.find((p) => p.isLocal && !p.downed) ??
      this.players.find((p) => !p.downed) ??
      this.players[0];
    if (camTarget) {
      this.camX += (camTarget.x - this.camX) * Math.min(1, dt * 10);
      this.camY += (camTarget.y - this.camY) * Math.min(1, dt * 10);
    }

    // 2. Wave Director & Boss Schedule
    this.stepWaveDirector(dt);

    // 3. Rebuild Spatial Hashes
    this.enemyGrid.clear();
    for (const e of this.enemyPool.items) {
      if (e.active) this.enemyGrid.insert(e);
    }
    this.pickupGrid.clear();
    for (const g of this.pickupPool.items) {
      if (g.active) this.pickupGrid.insert(g);
    }

    // 4. Fire Player Auto-Weapons
    for (const p of this.players) {
      if (!p.downed) {
        this.stepPlayerWeapons(p, dt);
      }
    }

    // 5. Update Projectiles & Collisions
    this.stepProjectiles(dt);

    // 6. Update Enemies (steering, separation via spatial hash, player damage)
    this.stepEnemies(dt);

    // 7. Update Pickups (magnet & collection)
    this.stepPickups(dt);

    // 8. Victory Check (15:00 reached and final boss defeated or survived)
    const finalBossAlive = this.enemyPool.items.some(
      (e) => e.active && e.kind === 'ceifadora_serasa',
    );
    if (this.elapsed >= RUN_DURATION_SEC && !finalBossAlive) {
      this.finishRun(true);
      return;
    }

    // 9. Update HUD & Broadcast P2P Snapshot (~20Hz)
    this.updatePlayingHud();
    if (this.isMultiplayer()) {
      this.netSyncAccum += dt;
      if (this.netSyncAccum >= 0.05) {
        this.netSyncAccum = 0;
        this.broadcastStateSnapshot();
      }
    }
  }

  private stepWaveDirector(dt: number): void {
    // Bosses at 3:00, 6:00, 9:00, 12:00, 14:40
    for (let i = 0; i < BOSS_SCHEDULE.length; i++) {
      if (!this.spawnedBossIndices.has(i) && this.elapsed >= BOSS_SCHEDULE[i].spawnSec) {
        this.spawnedBossIndices.add(i);
        const boss = BOSS_SCHEDULE[i];
        this.spawnBoss(boss.kind);
        this.bannerText = `⚠️ BOSS: ${boss.name.toUpperCase()} — ${boss.subtitle}`;
        this.bannerTimer = 4.2;
        sfx.bossAlert();
        this.shakeMag = Math.max(this.shakeMag, 12);
        if (this.isMultiplayer()) {
          this.room.send('sfx_event', {
            type: 'sfx_event',
            sound: 'boss',
            msg: this.bannerText,
          });
        }
      }
    }

    // Mini-elite every 75s
    if (this.elapsed >= this.nextEliteAt) {
      this.nextEliteAt += 75;
      const pool: EnemyKind[] =
        this.elapsed < 180
          ? ['gerente_zumbi', 'pombo_coach']
          : ['babuino_terno', 'fiscal_cartorio'];
      const kind = pool[Math.floor(Math.random() * pool.length)];
      this.spawnEnemy(kind, true);
    }

    // Continuous horde spawn rate scaling with elapsed minutes
    const minutes = this.elapsed / 60;
    const targetCount = Math.min(MAX_ENEMIES - 10, Math.floor(18 + minutes * 17 + this.players.length * 6));
    let activeCount = 0;
    for (const e of this.enemyPool.items) if (e.active) activeCount++;

    const spawnInterval = Math.max(0.06, 0.55 - minutes * 0.032);
    this.spawnAccum += dt;
    while (this.spawnAccum >= spawnInterval && activeCount < targetCount) {
      this.spawnAccum -= spawnInterval;
      const kind = this.pickEnemyKindForTime(minutes);
      this.spawnEnemy(kind, false);
      activeCount++;
    }
  }

  private pickEnemyKindForTime(minutes: number): EnemyKind {
    const r = Math.random();
    if (minutes < 1.5) {
      return r < 0.72 ? 'boleto' : 'mosquito_dengue';
    }
    if (minutes < 3.5) {
      if (r < 0.42) return 'boleto';
      if (r < 0.72) return 'pombo_coach';
      if (r < 0.9) return 'mosquito_dengue';
      return 'gerente_zumbi';
    }
    if (minutes < 6.5) {
      if (r < 0.25) return 'boleto';
      if (r < 0.48) return 'pombo_coach';
      if (r < 0.75) return 'gerente_zumbi';
      return 'babuino_terno';
    }
    if (minutes < 10.5) {
      if (r < 0.16) return 'mosquito_dengue';
      if (r < 0.34) return 'pombo_coach';
      if (r < 0.54) return 'gerente_zumbi';
      if (r < 0.76) return 'babuino_terno';
      if (r < 0.9) return 'motoboy_fantasma';
      return 'fiscal_cartorio';
    }
    if (r < 0.2) return 'gerente_zumbi';
    if (r < 0.42) return 'babuino_terno';
    if (r < 0.68) return 'motoboy_fantasma';
    if (r < 0.86) return 'fiscal_cartorio';
    return 'pombo_coach';
  }

  private getRandomAlivePlayer(): PlayerState | null {
    const alive = this.players.filter((p) => !p.downed);
    if (alive.length === 0) return this.players[0] ?? null;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  private spawnEnemy(kind: EnemyKind, isElite: boolean): void {
    const anchor = this.getRandomAlivePlayer();
    if (!anchor) return;
    const e = this.enemyPool.acquire();
    const arch = ENEMY_ARCHETYPES[kind];
    const minutes = this.elapsed / 60;
    const hpScale = 1 + minutes * 0.34 + Math.max(0, this.players.length - 1) * 0.3;
    const dist = Math.max(this.cw, this.ch) * 0.58 + 90 + Math.random() * 140;
    const ang = Math.random() * Math.PI * 2;

    e.id = this.nextEntityId++;
    e.kind = kind;
    e.isBoss = false;
    e.isElite = isElite;
    e.x = anchor.x + Math.cos(ang) * dist;
    e.y = anchor.y + Math.sin(ang) * dist;
    e.vx = 0;
    e.vy = 0;
    e.radius = arch.radius * (isElite ? 1.4 : 1);
    e.maxHp = Math.round(arch.baseHp * hpScale * (isElite ? 6.5 : 1));
    e.hp = e.maxHp;
    e.speed = arch.speed * (1 + Math.min(0.45, minutes * 0.028)) * (isElite ? 1.12 : 1);
    e.damage = Math.round(arch.damage * (1 + minutes * 0.09) * (isElite ? 1.4 : 1));
    e.xpValue = arch.xp * (isElite ? 8 : 1);
    e.hitFlash = 0;
    e.knockVx = 0;
    e.knockVy = 0;
    e.phase = Math.random() * 6.28;
    e.shootTimer = 2 + Math.random() * 2;
    e.slowTimer = 0;
    e.chargeTimer = 0;
    e.chargeDx = 0;
    e.chargeDy = 0;
  }

  private spawnBoss(kind: BossKind): void {
    const anchor = this.getRandomAlivePlayer();
    if (!anchor) return;
    const arch = BOSS_SCHEDULE.find((b) => b.kind === kind)!;
    const e = this.enemyPool.acquire();
    const ang = Math.random() * Math.PI * 2;
    const dist = 480;
    const coopMult = 1 + Math.max(0, this.players.length - 1) * 0.55;

    e.id = this.nextEntityId++;
    e.kind = kind;
    e.isBoss = true;
    e.isElite = true;
    e.x = anchor.x + Math.cos(ang) * dist;
    e.y = anchor.y + Math.sin(ang) * dist;
    e.vx = 0;
    e.vy = 0;
    e.radius = arch.radius;
    e.maxHp = Math.round(arch.hp * coopMult);
    e.hp = e.maxHp;
    e.speed = arch.speed;
    e.damage = arch.damage;
    e.xpValue = arch.xp;
    e.hitFlash = 0;
    e.knockVx = 0;
    e.knockVy = 0;
    e.phase = 0;
    e.shootTimer = 2.2;
    e.slowTimer = 0;
    e.chargeTimer = 4.5;
    e.chargeDx = 0;
    e.chargeDy = 0;
  }

  private stepPlayerWeapons(p: PlayerState, dt: number): void {
    const stats = this.getPlayerStats(p);

    for (const slot of p.weapons) {
      if (slot.id === 'stink_aura') {
        this.stepStinkAura(p, slot.level, slot.evolved, stats, dt);
        continue;
      }
      if (slot.id === 'coconut_orbit') {
        this.stepCoconutOrbit(p, slot.level, slot.evolved, stats, dt);
        continue;
      }

      slot.cooldownTimer -= dt;
      if (slot.cooldownTimer <= 0) {
        const def = WEAPONS[slot.id];
        const lvlCdFactor = Math.pow(0.92, slot.level - 1) * (slot.evolved ? 0.72 : 1);
        slot.cooldownTimer = Math.max(0.14, def.baseCooldown * lvlCdFactor * stats.cooldownMult);
        this.fireWeapon(p, slot.id, slot.level, slot.evolved, stats);
      }
    }
  }

  private stepStinkAura(
    p: PlayerState,
    level: number,
    evolved: boolean,
    stats: PlayerStats,
    dt: number,
  ): void {
    const t = (this.auraTickTimers.get(p.id) ?? 0) - dt;
    if (t > 0) {
      this.auraTickTimers.set(p.id, t);
      return;
    }
    const interval = (evolved ? 0.25 : 0.42 - level * 0.03) * stats.cooldownMult;
    this.auraTickTimers.set(p.id, Math.max(0.15, interval));

    const radius = (72 + level * 14) * (evolved ? 1.45 : 1) * stats.areaMult;
    const dmg = Math.round(
      WEAPONS.stink_aura.baseDamage * (1 + (level - 1) * 0.32) * (evolved ? 1.85 : 1) * stats.damageMult,
    );
    const hits = this.enemyGrid.queryRadius(p.x, p.y, radius + 30, this.queryEnemiesBuf);
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      if (!e.active) continue;
      const dist = Math.hypot(e.x - p.x, e.y - p.y);
      if (dist <= radius + e.radius) {
        if (evolved) e.slowTimer = 1.2;
        const killed = this.damageEnemy(e, dmg, p, evolved ? 45 : 18, false);
        if (killed && evolved && Math.random() < 0.25) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
        }
      }
    }
  }

  private stepCoconutOrbit(
    p: PlayerState,
    level: number,
    evolved: boolean,
    stats: PlayerStats,
    dt: number,
  ): void {
    const cooldownRem = (this.orbitHitCooldowns.get(p.id) ?? 0) - dt;
    this.orbitHitCooldowns.set(p.id, Math.max(0, cooldownRem));

    if (!evolved) {
      const cycle = this.animTime % 4.2;
      if (cycle > 2.95) return;
    }

    const count = (evolved ? 6 : 1 + level) + stats.extraProjectiles;
    const orbitR = (evolved ? 98 : 74 + level * 4) * stats.areaMult;
    const speed = evolved ? 4.6 : 2.8 + level * 0.25;
    const dmg = Math.round(
      WEAPONS.coconut_orbit.baseDamage * (1 + (level - 1) * 0.28) * (evolved ? 1.8 : 1) * stats.damageMult,
    );
    const hitR = (evolved ? 16 : 13) * stats.areaMult;

    for (let i = 0; i < count; i++) {
      const a = this.animTime * speed + (i * Math.PI * 2) / count;
      const cx = p.x + Math.cos(a) * orbitR;
      const cy = p.y + Math.sin(a) * orbitR;
      const near = this.enemyGrid.queryRadius(cx, cy, hitR + 36, this.queryEnemiesBuf);
      for (let j = 0; j < near.length; j++) {
        const e = near[j];
        if (!e.active || e.hitFlash > 0.08) continue;
        if (Math.hypot(e.x - cx, e.y - cy) <= hitR + e.radius) {
          this.damageEnemy(e, dmg, p, evolved ? 150 : 95, evolved);
        }
      }
    }
  }

  private findNearestEnemy(x: number, y: number, maxDist: number): EnemyEntity | null {
    const near = this.enemyGrid.queryRadius(x, y, maxDist, this.queryEnemiesBuf);
    let best: EnemyEntity | null = null;
    let bestD2 = maxDist * maxDist;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.active) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  private fireWeapon(
    p: PlayerState,
    id: WeaponId,
    level: number,
    evolved: boolean,
    stats: PlayerStats,
  ): void {
    const def = WEAPONS[id];
    const dmg = Math.round(
      def.baseDamage * (1 + (level - 1) * 0.28) * (evolved ? 1.85 : 1) * stats.damageMult,
    );
    const extra = stats.extraProjectiles;

    switch (id) {
      case 'banana_boomerang': {
        sfx.shoot('whoosh');
        const count = (level >= 4 ? 3 : level >= 2 ? 2 : 1) + extra + (evolved ? 2 : 0);
        const target = this.findNearestEnemy(p.x, p.y, 540);
        const baseAng = target
          ? Math.atan2(target.y - p.y, target.x - p.x)
          : Math.atan2(p.facingY, p.facingX);
        const speed = (evolved ? 520 : 380) * stats.projSpeedMult;
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * 0.34;
          const ang = baseAng + offset;
          const pr = this.projPool.acquire();
          pr.id = this.nextEntityId++;
          pr.ownerId = p.id;
          pr.kind = 'boomerang';
          pr.weaponId = id;
          pr.evolved = evolved;
          pr.x = p.x;
          pr.y = p.y;
          pr.vx = Math.cos(ang) * speed;
          pr.vy = Math.sin(ang) * speed;
          pr.radius = (evolved ? 18 : 13 + level) * stats.areaMult;
          pr.damage = dmg;
          pr.pierce = 999;
          pr.life = evolved ? 2.1 : 1.7;
          pr.maxLife = pr.life;
          pr.angle = ang;
          pr.spin = 15;
          pr.returning = false;
          pr.targetEnemyId = 0;
          pr.hitIds.clear();
          pr.color = evolved ? def.evolvedColor : def.color;
          pr.armed = true;
          pr.chainLeft = 0;
        }
        break;
      }

      case 'wifi_lightning': {
        sfx.shoot('zap');
        const count = (level >= 5 ? 4 : level >= 4 ? 3 : level >= 2 ? 2 : 1) + extra + (evolved ? 3 : 0);
        const strikeR = (evolved ? 72 : 52 + level * 5) * stats.areaMult;
        const near = this.enemyGrid.queryRadius(p.x, p.y, 440, this.queryEnemiesBuf);
        if (near.length === 0) break;

        for (let i = 0; i < count; i++) {
          const target = near[Math.floor(Math.random() * near.length)];
          if (!target || !target.active) continue;
          this.spawnVfx('lightning', target.x, target.y - 260, target.x, target.y, strikeR, 0, 0.24, evolved ? def.evolvedColor : def.color);
          const splash = this.enemyGrid.queryRadius(target.x, target.y, strikeR + 24, []);
          for (const se of splash) {
            if (se.active && Math.hypot(se.x - target.x, se.y - target.y) <= strikeR + se.radius) {
              this.damageEnemy(se, dmg, p, 40, evolved);
            }
          }
          if (evolved && splash.length > 1) {
            const chainTarget = splash[Math.floor(Math.random() * splash.length)];
            if (chainTarget && chainTarget.id !== target.id) {
              this.spawnVfx('lightning', target.x, target.y, chainTarget.x, chainTarget.y, strikeR * 0.7, 0, 0.22, '#22d3ee');
              this.damageEnemy(chainTarget, Math.round(dmg * 0.8), p, 30, true);
            }
          }
        }
        break;
      }

      case 'homing_slipper': {
        sfx.shoot('whoosh');
        const count = (level >= 5 ? 4 : level >= 4 ? 3 : level >= 2 ? 2 : 1) + extra + (evolved ? 1 : 0);
        const speed = (evolved ? 470 : 340 + level * 18) * stats.projSpeedMult;
        for (let i = 0; i < count; i++) {
          const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
          const target = this.findNearestEnemy(p.x, p.y, 560);
          const pr = this.projPool.acquire();
          pr.id = this.nextEntityId++;
          pr.ownerId = p.id;
          pr.kind = 'slipper';
          pr.weaponId = id;
          pr.evolved = evolved;
          pr.x = p.x;
          pr.y = p.y;
          pr.vx = Math.cos(ang) * speed;
          pr.vy = Math.sin(ang) * speed;
          pr.radius = (evolved ? 15 : 12) * stats.areaMult;
          pr.damage = dmg;
          pr.pierce = (evolved ? 5 : level >= 2 ? 2 : 1);
          pr.life = 2.6;
          pr.maxLife = 2.6;
          pr.angle = ang;
          pr.spin = 12;
          pr.returning = false;
          pr.targetEnemyId = target ? target.id : 0;
          pr.hitIds.clear();
          pr.color = evolved ? def.evolvedColor : def.color;
          pr.armed = true;
          pr.chainLeft = 0;
        }
        break;
      }

      case 'vine_whip': {
        sfx.shoot('whoosh');
        const reach = (evolved ? 165 : 112 + level * 11) * stats.areaMult;
        const baseAng = Math.atan2(p.facingY, p.facingX);
        const dirs = level >= 2 || evolved ? [baseAng, baseAng + Math.PI] : [baseAng];

        for (const ang of dirs) {
          this.spawnVfx('slash', p.x, p.y, 0, 0, reach, ang, 0.22, evolved ? def.evolvedColor : def.color);
          const cx = p.x + Math.cos(ang) * (reach * 0.55);
          const cy = p.y + Math.sin(ang) * (reach * 0.55);
          const hitR = reach * 0.62;
          const near = this.enemyGrid.queryRadius(cx, cy, hitR + 30, this.queryEnemiesBuf);
          let healed = false;
          for (const e of near) {
            if (!e.active) continue;
            if (Math.hypot(e.x - cx, e.y - cy) <= hitR + e.radius) {
              this.damageEnemy(e, dmg, p, evolved ? 130 : 85, evolved);
              if (evolved && !healed) {
                p.hp = Math.min(p.maxHp, p.hp + 2);
                healed = true;
              }
            }
          }
        }
        break;
      }

      case 'peel_mine': {
        sfx.shoot('pop');
        const count = (level >= 5 ? 4 : level >= 4 ? 3 : level >= 2 ? 2 : 1) + extra;
        for (let i = 0; i < count; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 24 + Math.random() * 55;
          const pr = this.projPool.acquire();
          pr.id = this.nextEntityId++;
          pr.ownerId = p.id;
          pr.kind = 'peel';
          pr.weaponId = id;
          pr.evolved = evolved;
          pr.x = p.x + Math.cos(ang) * dist;
          pr.y = p.y + Math.sin(ang) * dist;
          pr.vx = 0;
          pr.vy = 0;
          pr.radius = (evolved ? 22 : 16) * stats.areaMult;
          pr.damage = dmg;
          pr.pierce = 1;
          pr.life = 11.0;
          pr.maxLife = 11.0;
          pr.angle = Math.random() * 0.6 - 0.3;
          pr.spin = 0;
          pr.returning = false;
          pr.targetEnemyId = 0;
          pr.hitIds.clear();
          pr.color = evolved ? def.evolvedColor : def.color;
          pr.armed = true;
          pr.chainLeft = 0;
        }
        break;
      }

      case 'mango_gatling': {
        sfx.shoot('pop');
        const count = (level >= 5 ? 3 : level >= 3 ? 2 : 1) + extra + (evolved ? 1 : 0);
        const baseAng = Math.atan2(p.facingY, p.facingX);
        const speed = (evolved ? 640 : 520) * stats.projSpeedMult;
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 0.14 + (Math.random() - 0.5) * 0.06;
          const ang = baseAng + spread;
          const pr = this.projPool.acquire();
          pr.id = this.nextEntityId++;
          pr.ownerId = p.id;
          pr.kind = 'mango';
          pr.weaponId = id;
          pr.evolved = evolved;
          pr.x = p.x;
          pr.y = p.y;
          pr.vx = Math.cos(ang) * speed;
          pr.vy = Math.sin(ang) * speed;
          pr.radius = (evolved ? 13 : 8 + (level >= 4 ? 2 : 0)) * stats.areaMult;
          pr.damage = dmg;
          pr.pierce = evolved ? 5 : level >= 2 ? 2 : 1;
          pr.life = 1.25;
          pr.maxLife = 1.25;
          pr.angle = ang;
          pr.spin = 0;
          pr.returning = false;
          pr.targetEnemyId = 0;
          pr.hitIds.clear();
          pr.color = evolved ? def.evolvedColor : def.color;
          pr.armed = true;
          pr.chainLeft = 0;
        }
        break;
      }

      case 'pix_orb': {
        sfx.shoot('whoosh');
        const count = (level >= 5 ? 6 : level >= 4 ? 5 : level >= 2 ? 3 : 2) + extra + (evolved ? 2 : 0);
        const baseSpeed = (evolved ? 280 : 210) * stats.projSpeedMult;
        for (let i = 0; i < count; i++) {
          const ang = this.animTime * 2 + (Math.PI * 2 * i) / count;
          const pr = this.projPool.acquire();
          pr.id = this.nextEntityId++;
          pr.ownerId = p.id;
          pr.kind = 'pix';
          pr.weaponId = id;
          pr.evolved = evolved;
          pr.x = p.x;
          pr.y = p.y;
          pr.vx = Math.cos(ang) * baseSpeed;
          pr.vy = Math.sin(ang) * baseSpeed;
          pr.radius = (evolved ? 14 : 10) * stats.areaMult;
          pr.damage = dmg;
          pr.pierce = evolved ? 99 : 4;
          pr.life = evolved ? 2.6 : 2.1;
          pr.maxLife = pr.life;
          pr.angle = ang;
          pr.spin = 8;
          pr.returning = false;
          pr.targetEnemyId = 0;
          pr.hitIds.clear();
          pr.color = evolved ? def.evolvedColor : def.color;
          pr.armed = true;
          pr.chainLeft = 0;
        }
        break;
      }

      case 'howler_wave': {
        sfx.shoot('shout');
        const radius = (evolved ? 235 : 138 + level * 18) * stats.areaMult;
        const color = evolved ? def.evolvedColor : def.color;
        this.spawnVfx('ring', p.x, p.y, 0, 0, radius, 0, 0.36, color);
        const near = this.enemyGrid.queryRadius(p.x, p.y, radius + 30, this.queryEnemiesBuf);
        for (const e of near) {
          if (!e.active) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + e.radius) {
            this.damageEnemy(e, dmg, p, evolved ? 220 : 140, evolved);
          }
        }
        if (level >= 4 || evolved) {
          this.spawnVfx('ring', p.x, p.y, 0, 0, radius * 0.72, 0, 0.28, '#fef08a');
        }
        break;
      }
    }
  }

  private stepProjectiles(dt: number): void {
    for (const pr of this.projPool.items) {
      if (!pr.active) continue;
      pr.life -= dt;
      if (pr.life <= 0) {
        pr.active = false;
        continue;
      }

      if (pr.kind === 'enemy_paper') {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.angle += 6 * dt;
        for (const p of this.players) {
          if (p.downed || p.invulnTimer > 0) continue;
          if (Math.hypot(p.x - pr.x, p.y - pr.y) <= 18 + pr.radius) {
            this.damagePlayer(p, pr.damage);
            pr.active = false;
            break;
          }
        }
        continue;
      }

      const owner = this.players.find((pl) => pl.id === pr.ownerId) ?? this.players[0];

      if (pr.kind === 'boomerang') {
        // Accelerate back toward owner in second half of life
        if (pr.life < pr.maxLife * 0.56 && owner) {
          if (!pr.returning) {
            pr.returning = true;
            pr.hitIds.clear();
          }
          const dx = owner.x - pr.x;
          const dy = owner.y - pr.y;
          const dist = Math.hypot(dx, dy) || 1;
          const pull = pr.evolved ? 1250 : 920;
          pr.vx += (dx / dist) * pull * dt;
          pr.vy += (dy / dist) * pull * dt;
          const spd = Math.hypot(pr.vx, pr.vy);
          const maxSpd = pr.evolved ? 640 : 480;
          if (spd > maxSpd) {
            pr.vx = (pr.vx / spd) * maxSpd;
            pr.vy = (pr.vy / spd) * maxSpd;
          }
          if (dist < 22 && pr.life < pr.maxLife * 0.4) {
            pr.active = false;
            continue;
          }
        }
      } else if (pr.kind === 'slipper') {
        // Steer gently toward target
        let target = this.enemyPool.items.find((e) => e.active && e.id === pr.targetEnemyId);
        if (!target) {
          target = this.findNearestEnemy(pr.x, pr.y, 480) ?? undefined;
          if (target) pr.targetEnemyId = target.id;
        }
        if (target) {
          const dx = target.x - pr.x;
          const dy = target.y - pr.y;
          const dist = Math.hypot(dx, dy) || 1;
          const spd = Math.hypot(pr.vx, pr.vy) || 340;
          const turn = pr.evolved ? 10 : 7;
          pr.vx += ((dx / dist) * spd - pr.vx) * Math.min(1, turn * dt);
          pr.vy += ((dy / dist) * spd - pr.vy) * Math.min(1, turn * dt);
        }
      } else if (pr.kind === 'pix') {
        // Spiral motion: rotate velocity vector steadily
        const rotRate = pr.evolved ? 3.2 : 2.5;
        const cos = Math.cos(rotRate * dt);
        const sin = Math.sin(rotRate * dt);
        const nvx = pr.vx * cos - pr.vy * sin;
        const nvy = pr.vx * sin + pr.vy * cos;
        pr.vx = nvx * (1 + 0.12 * dt);
        pr.vy = nvy * (1 + 0.12 * dt);
      }

      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.angle += pr.spin * dt;

      // Collide against enemies using SpatialHash
      const hits = this.enemyGrid.queryRadius(pr.x, pr.y, pr.radius + 45, this.queryEnemiesBuf);
      for (let i = 0; i < hits.length; i++) {
        const e = hits[i];
        if (!e.active || pr.hitIds.has(e.id)) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) <= pr.radius + e.radius) {
          if (pr.kind === 'peel') {
            // Explosive area peel!
            const blastR = (pr.evolved ? 115 : 74) * (owner ? this.getPlayerStats(owner).areaMult : 1);
            this.spawnVfx('explosion', pr.x, pr.y, 0, 0, blastR, 0, 0.3, pr.color);
            this.spawnParticles(pr.x, pr.y, '#facc15', 10, 'banana');
            sfx.explosion();
            this.shakeMag = Math.max(this.shakeMag, pr.evolved ? 7 : 4);
            const splash = this.enemyGrid.queryRadius(pr.x, pr.y, blastR + 24, []);
            for (const se of splash) {
              if (se.active && Math.hypot(se.x - pr.x, se.y - pr.y) <= blastR + se.radius) {
                this.damageEnemy(se, pr.damage, owner, 120, pr.evolved);
              }
            }
            pr.active = false;
            break;
          }

          pr.hitIds.add(e.id);
          this.damageEnemy(e, pr.damage, owner, pr.kind === 'mango' ? 30 : 65, pr.evolved);

          if (pr.kind === 'slipper' && pr.evolved) {
            this.spawnVfx('explosion', pr.x, pr.y, 0, 0, 46, 0, 0.2, '#ef4444');
          }

          pr.pierce -= 1;
          if (pr.kind === 'slipper' && pr.pierce > 0) {
            // Ricochet to another enemy
            const next = this.findNearestEnemy(pr.x, pr.y, 340);
            if (next && !pr.hitIds.has(next.id)) {
              pr.targetEnemyId = next.id;
            }
          }
          if (pr.pierce <= 0) {
            pr.active = false;
            break;
          }
        }
      }
    }
  }

  private damageEnemy(
    e: EnemyEntity,
    amount: number,
    owner: PlayerState | undefined,
    knockback: number,
    crit: boolean,
  ): boolean {
    if (!e.active) return false;
    e.hp -= amount;
    e.hitFlash = 0.11;
    sfx.hit(crit);

    if (owner && knockback > 0 && !e.isBoss) {
      const dx = e.x - owner.x;
      const dy = e.y - owner.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.knockVx = (dx / dist) * knockback;
      e.knockVy = (dy / dist) * knockback;
    }

    if (owner) {
      const wSlot = owner.weapons.find((w) => w.totalDamage >= 0);
      if (wSlot) wSlot.totalDamage += amount;
    }

    if (this.textPool.items.filter((t) => t.active).length < 75) {
      this.spawnText(
        e.x + (Math.random() - 0.5) * 14,
        e.y - e.radius,
        crit ? `${amount}!` : `${amount}`,
        crit ? '#fef08a' : '#ffffff',
        crit ? 16 : 13,
        crit,
      );
    }

    if (e.hp <= 0) {
      this.killEnemy(e, owner);
      return true;
    }
    return false;
  }

  private killEnemy(e: EnemyEntity, owner?: PlayerState): void {
    e.active = false;
    this.totalKills += 1;
    if (owner) owner.kills += 1;

    this.spawnParticles(e.x, e.y, e.isBoss ? '#facc15' : '#fef2f2', e.isBoss ? 28 : 6, 'rect');

    if (e.isBoss) {
      this.bossesDefeated += 1;
      this.coinsEarned += 45;
      this.shakeMag = Math.max(this.shakeMag, 14);
      this.spawnPickup('chest', e.x, e.y, 1);
      this.spawnPickup('bunch', e.x + 28, e.y, e.xpValue);
      this.hud.toast(`💀 BOSS DERROTADO! Pegue o Baú do FGTS!`, 'banana');
    } else if (e.isElite) {
      this.coinsEarned += 10;
      this.spawnPickup('chest', e.x, e.y, 1);
      this.spawnPickup('gold', e.x + 20, e.y, e.xpValue);
    } else {
      const r = Math.random();
      if (r < 0.008) {
        this.spawnPickup('magnet', e.x, e.y, 1);
      } else if (r < 0.022) {
        this.spawnPickup('heal', e.x, e.y, 28);
      } else if (r < 0.06) {
        this.spawnPickup('coin', e.x, e.y, 3);
      } else {
        const gemKind: GemKind = e.xpValue >= 10 ? 'bunch' : e.xpValue >= 4 ? 'gold' : 'green';
        this.spawnPickup(gemKind, e.x, e.y, e.xpValue);
      }
    }
  }

  private stepEnemies(dt: number): void {
    const alivePlayers = this.players.filter((p) => !p.downed);
    if (alivePlayers.length === 0) return;

    for (const e of this.enemyPool.items) {
      if (!e.active) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

      // Find nearest alive player
      let target = alivePlayers[0];
      let bestD2 = (target.x - e.x) ** 2 + (target.y - e.y) ** 2;
      for (let i = 1; i < alivePlayers.length; i++) {
        const ap = alivePlayers[i];
        const d2 = (ap.x - e.x) ** 2 + (ap.y - e.y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          target = ap;
        }
      }

      // Despawn / wrap distant normal enemies ahead of target
      if (!e.isBoss && bestD2 > 1150 * 1150) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 560 + Math.random() * 140;
        e.x = target.x + Math.cos(ang) * dist;
        e.y = target.y + Math.sin(ang) * dist;
        continue;
      }

      const dist = Math.sqrt(bestD2) || 1;
      let moveSpd = e.speed * (e.slowTimer > 0 ? 0.55 : 1);

      // Boss special attacks (shoot paper / charge)
      if (e.isBoss) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = e.kind === 'ceifadora_serasa' ? 2.1 : 3.0;
          const shots = e.kind === 'pombo_ceo' || e.kind === 'ceifadora_serasa' ? 10 : 6;
          const baseA = Math.atan2(target.y - e.y, target.x - e.x);
          for (let s = 0; s < shots; s++) {
            const a = baseA + (Math.PI * 2 * s) / shots;
            const pr = this.projPool.acquire();
            pr.id = this.nextEntityId++;
            pr.ownerId = 'boss';
            pr.kind = 'enemy_paper';
            pr.weaponId = 'banana_boomerang';
            pr.evolved = false;
            pr.x = e.x;
            pr.y = e.y;
            pr.vx = Math.cos(a) * 210;
            pr.vy = Math.sin(a) * 210;
            pr.radius = 9;
            pr.damage = Math.round(e.damage * 0.65);
            pr.pierce = 1;
            pr.life = 4.0;
            pr.maxLife = 4.0;
            pr.angle = a;
            pr.spin = 5;
            pr.returning = false;
            pr.targetEnemyId = 0;
            pr.hitIds.clear();
            pr.color = '#ef4444';
            pr.armed = true;
            pr.chainLeft = 0;
          }
        }
      }

      let sepX = 0;
      let sepY = 0;
      if (!e.isBoss) {
        const neighbors = this.enemyGrid.queryRadius(e.x, e.y, e.radius * 2.2, this.queryEnemiesBuf);
        const maxCheck = Math.min(neighbors.length, 8);
        for (let i = 0; i < maxCheck; i++) {
          const other = neighbors[i];
          if (other === e || !other.active) continue;
          const ox = e.x - other.x;
          const oy = e.y - other.y;
          const od2 = ox * ox + oy * oy;
          const minD = e.radius + other.radius;
          if (od2 > 0.01 && od2 < minD * minD) {
            const od = Math.sqrt(od2);
            const push = ((minD - od) / minD) * 140;
            sepX += (ox / od) * push;
            sepY += (oy / od) * push;
          }
        }
      }

      e.vx = ((target.x - e.x) / dist) * moveSpd + sepX + e.knockVx;
      e.vy = ((target.y - e.y) / dist) * moveSpd + sepY + e.knockVy;
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      e.knockVx *= Math.pow(0.02, dt);
      e.knockVy *= Math.pow(0.02, dt);

      // Contact damage with players
      for (const p of alivePlayers) {
        if (p.invulnTimer > 0) continue;
        if (Math.hypot(p.x - e.x, p.y - e.y) <= e.radius + 14) {
          this.damagePlayer(p, e.damage);
        }
      }
    }
  }

  private damagePlayer(p: PlayerState, rawDamage: number): void {
    if (p.downed || p.invulnTimer > 0) return;
    const stats = this.getPlayerStats(p);
    const dmg = Math.max(1, rawDamage - stats.armor);
    p.hp = Math.max(0, p.hp - dmg);
    p.invulnTimer = 0.42;
    p.hitFlash = 0.18;
    if (p.isLocal) {
      this.shakeMag = Math.max(this.shakeMag, 8);
      sfx.hurt();
    }
    this.spawnText(p.x, p.y - 26, `-${dmg}`, '#ef4444', 15, true);

    if (p.hp <= 0) {
      p.downed = true;
      p.reviveProgress = 0;
      if (this.players.length > 1) {
        const msg = `💀 ${p.name} caiu nos boletos! Encoste para reviver!`;
        this.hud.toast(msg, 'chaos');
        if (this.isMultiplayer()) {
          this.room.send('sfx_event', { type: 'sfx_event', sound: 'hurt', msg });
        }
      }
    }
  }

  private stepPickups(dt: number): void {
    for (const g of this.pickupPool.items) {
      if (!g.active) continue;

      if (g.magnetizedToId) {
        const target = this.players.find((p) => p.id === g.magnetizedToId && !p.downed);
        if (!target) {
          g.magnetizedToId = null;
        } else {
          const dx = target.x - g.x;
          const dy = target.y - g.y;
          const dist = Math.hypot(dx, dy) || 1;
          const pullSpd = 560;
          g.x += (dx / dist) * pullSpd * dt;
          g.y += (dy / dist) * pullSpd * dt;
          if (dist < 22) {
            this.collectPickup(target, g);
            continue;
          }
        }
      } else {
        // Check pickup radius for alive players
        for (const p of this.players) {
          if (p.downed) continue;
          const rad = g.kind === 'chest' ? 42 : this.getPlayerStats(p).pickupRadius;
          const dist = Math.hypot(p.x - g.x, p.y - g.y);
          if (dist < 22) {
            this.collectPickup(p, g);
            break;
          } else if (dist <= rad && g.kind !== 'chest') {
            g.magnetizedToId = p.id;
            break;
          }
        }
      }
    }
  }

  private collectPickup(p: PlayerState, g: PickupEntity): void {
    g.active = false;

    if (g.kind === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + g.value);
      sfx.xpGem();
      this.spawnText(p.x, p.y - 26, `+${g.value} HP`, '#4ade80', 14, true);
      return;
    }

    if (g.kind === 'coin') {
      this.coinsEarned += g.value;
      sfx.xpGem();
      this.spawnText(p.x, p.y - 24, `+${g.value} 🪙`, '#facc15', 13, false);
      return;
    }

    if (g.kind === 'magnet') {
      sfx.revive();
      this.spawnText(p.x, p.y - 30, 'IMÃ PIX! 🧲', '#38bdf8', 16, true);
      for (const item of this.pickupPool.items) {
        if (item.active && item.kind !== 'chest') {
          item.magnetizedToId = p.id;
        }
      }
      return;
    }

    if (g.kind === 'chest') {
      this.openChestForTeam(p);
      return;
    }

    // XP Bananinha!
    sfx.xpGem();
    const stats = this.getPlayerStats(p);
    this.xp += g.value * stats.xpMult;
    if (this.xp >= this.xpToNext) {
      this.triggerTeamLevelUp();
    }
  }

  private openChestForTeam(collector: PlayerState): void {
    const bonusCoins = 25 + Math.floor(Math.random() * 20);
    this.coinsEarned += bonusCoins;

    const rewards: UpgradeCardOption[] = [];
    // Check if collector has any ready weapon evolution!
    const evo = this.getReadyEvolutions(collector);
    if (evo.length > 0) {
      rewards.push(evo[0]);
      this.applyUpgradeOption(collector, evo[0]);
    } else {
      const opts = this.generateDraftCards(collector);
      if (opts.length > 0) {
        rewards.push(opts[0]);
        this.applyUpgradeOption(collector, opts[0]);
      }
    }

    // Also give a mini-upgrade to teammates in Co-op!
    for (const pl of this.players) {
      if (pl.id === collector.id) continue;
      const o = this.generateDraftCards(pl);
      if (o.length > 0) {
        this.applyUpgradeOption(pl, o[0]);
        if (this.isMultiplayer()) {
          this.room.send('chest_reward', {
            type: 'chest_reward',
            targetPlayerId: pl.id,
            title: `📦 ${collector.name} abriu o Baú do FGTS!`,
            cards: [o[0]],
            coins: bonusCoins,
          });
        }
      }
    }

    if (collector.isLocal || !this.isMultiplayer()) {
      this.chestModalData = {
        title: '📦 BAÚ DO FGTS LIBERADO!',
        cards: rewards,
        coins: bonusCoins,
      };
      this.chestTimer = 3.2;
      this.screen = 'chest';
      sfx.chest();
      this.renderUi();
    }
  }

  private triggerTeamLevelUp(): void {
    this.xp -= this.xpToNext;
    this.level += 1;
    this.xpToNext = Math.round(8 + this.level * 6 + Math.pow(this.level, 1.85) * 0.65);

    this.screen = 'levelup';
    this.draftTimeout = 15;
    sfx.levelUp();

    for (const p of this.players) {
      if (p.downed) {
        p.pendingChoice = false;
        continue;
      }
      const cards = this.generateDraftCards(p);
      p.pendingChoice = true;
      if (p.isLocal) {
        this.localCards = cards;
      } else if (this.isMultiplayer()) {
        this.room.send('draft_cards', {
          type: 'draft_cards',
          targetPlayerId: p.id,
          level: this.level,
          cards,
        });
      }
    }

    // If somehow nobody has pendingChoice
    this.checkAllDraftsDone();
    this.renderUi();
  }

  private checkAllDraftsDone(): void {
    if (this.players.every((p) => !p.pendingChoice)) {
      this.localCards = [];
      if (this.screen === 'levelup') {
        this.screen = 'playing';
      }
      // Handle leftover XP for multi-level bursts
      if (this.xp >= this.xpToNext) {
        this.triggerTeamLevelUp();
        return;
      }
      this.renderUi();
    } else {
      this.renderUi();
    }
  }

  private getReadyEvolutions(p: PlayerState): UpgradeCardOption[] {
    const out: UpgradeCardOption[] = [];
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (!w.evolved && w.level >= def.maxLevel) {
        const hasPassive = p.passives.some((ps) => ps.id === def.evolvePassive);
        if (hasPassive) {
          const pasDef = PASSIVES[def.evolvePassive];
          out.push({
            kind: 'evolve',
            id: w.id,
            title: def.evolvedName,
            subtitle: `EVOLUÇÃO! (${def.name} + ${pasDef.name})`,
            description: def.evolvedDesc,
            emoji: def.evolvedEmoji,
            color: def.evolvedColor,
            tag: 'EVOLUÇÃO LENDÁRIA',
            currentLevel: w.level,
            nextLevel: w.level + 1,
          });
        }
      }
    }
    return out;
  }

  private generateDraftCards(p: PlayerState): UpgradeCardOption[] {
    const candidates: UpgradeCardOption[] = [];

    // 1. Ready Evolutions first!
    for (const evo of this.getReadyEvolutions(p)) {
      candidates.push(evo);
    }

    // 2. Existing weapons < maxLevel
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (w.level < def.maxLevel) {
        const pas = PASSIVES[def.evolvePassive];
        candidates.push({
          kind: 'weapon',
          id: w.id,
          title: def.name,
          subtitle: `Arma • Nível ${w.level} → ${w.level + 1}`,
          description: def.levelNotes[w.level] ?? def.description,
          emoji: def.emoji,
          color: def.color,
          tag: `NV ${w.level + 1}`,
          currentLevel: w.level,
          nextLevel: w.level + 1,
          synergyHint: `Evolui com: ${pas.emoji} ${pas.name}`,
        });
      }
    }

    // 3. New weapons if slots < MAX_WEAPON_SLOTS
    if (p.weapons.length < MAX_WEAPON_SLOTS) {
      for (const wid of WEAPON_IDS) {
        if (p.weapons.some((w) => w.id === wid)) continue;
        const def = WEAPONS[wid];
        const pas = PASSIVES[def.evolvePassive];
        candidates.push({
          kind: 'weapon',
          id: wid,
          title: def.name,
          subtitle: 'Nova Arma!',
          description: def.description,
          emoji: def.emoji,
          color: def.color,
          tag: 'NOVA ARMA',
          currentLevel: 0,
          nextLevel: 1,
          synergyHint: `Evolui com: ${pas.emoji} ${pas.name}`,
        });
      }
    }

    // 4. Existing passives < maxLevel
    for (const ps of p.passives) {
      const def = PASSIVES[ps.id];
      if (ps.level < def.maxLevel) {
        candidates.push({
          kind: 'passive',
          id: ps.id,
          title: def.name,
          subtitle: `Passiva • Nível ${ps.level} → ${ps.level + 1}`,
          description: def.description,
          emoji: def.emoji,
          color: def.color,
          tag: `PASSIVA NV ${ps.level + 1}`,
          currentLevel: ps.level,
          nextLevel: ps.level + 1,
          synergyHint: `Evolui: ${def.evolvesWeapons.map((w) => WEAPONS[w].emoji).join(' ')}`,
        });
      }
    }

    // 5. New passives if slots < MAX_PASSIVE_SLOTS
    if (p.passives.length < MAX_PASSIVE_SLOTS) {
      for (const pid of PASSIVE_IDS) {
        if (p.passives.some((ps) => ps.id === pid)) continue;
        const def = PASSIVES[pid];
        candidates.push({
          kind: 'passive',
          id: pid,
          title: def.name,
          subtitle: 'Novo Item Passivo!',
          description: def.description,
          emoji: def.emoji,
          color: def.color,
          tag: 'NOVA PASSIVA',
          currentLevel: 0,
          nextLevel: 1,
          synergyHint: `Evolui: ${def.evolvesWeapons.map((w) => WEAPONS[w].emoji + ' ' + WEAPONS[w].name).join(', ')}`,
        });
      }
    }

    // Separate evolutions so one is guaranteed if ready, shuffle the rest
    const evos = candidates.filter((c) => c.kind === 'evolve');
    const rest = candidates.filter((c) => c.kind !== 'evolve');
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    const picked = [...evos.slice(0, 1), ...rest].slice(0, 3);

    while (picked.length < 3) {
      picked.push(
        picked.length % 2 === 0
          ? {
              kind: 'bonus',
              id: 'heal_banana',
              title: 'Cacho de Banana Prata',
              subtitle: 'Consumível',
              description: 'Recupera 45 HP imediatamente e garante +15 Moedas de Banana!',
              emoji: '🍌',
              color: '#4ade80',
              tag: 'CURA + MOEDAS',
              currentLevel: 0,
              nextLevel: 1,
            }
          : {
              kind: 'bonus',
              id: 'pix_coin',
              title: 'Pix Caído do Caminhão',
              subtitle: 'Bônus Instantâneo',
              description: 'Ganha +35 Moedas de Banana para gastar na Loja da Selva!',
              emoji: '🪙',
              color: '#facc15',
              tag: '+35 MOEDAS',
              currentLevel: 0,
              nextLevel: 1,
            },
      );
    }

    return picked;
  }

  private applyUpgradeOption(p: PlayerState, opt: UpgradeCardOption): void {
    if (opt.kind === 'evolve') {
      const slot = p.weapons.find((w) => w.id === opt.id);
      if (slot) {
        slot.evolved = true;
        slot.level = WEAPONS[slot.id].maxLevel;
      }
      this.spawnText(p.x, p.y - 38, `EVOLUIU: ${opt.title}!`, opt.color, 17, true);
      return;
    }

    if (opt.kind === 'weapon') {
      const wid = opt.id as WeaponId;
      const existing = p.weapons.find((w) => w.id === wid);
      if (existing) {
        existing.level = Math.min(WEAPONS[wid].maxLevel, existing.level + 1);
      } else if (p.weapons.length < MAX_WEAPON_SLOTS) {
        p.weapons.push({
          id: wid,
          level: 1,
          evolved: false,
          cooldownTimer: 0.1,
          totalDamage: 0,
        });
      }
      return;
    }

    if (opt.kind === 'passive') {
      const pid = opt.id as PassiveId;
      const existing = p.passives.find((ps) => ps.id === pid);
      if (existing) {
        existing.level = Math.min(PASSIVES[pid].maxLevel, existing.level + 1);
      } else if (p.passives.length < MAX_PASSIVE_SLOTS) {
        p.passives.push({ id: pid, level: 1 });
      }
      const stats = this.getPlayerStats(p);
      const diff = stats.maxHp - p.maxHp;
      p.maxHp = stats.maxHp;
      if (diff > 0) p.hp = Math.min(p.maxHp, p.hp + diff);
      return;
    }

    // Bonus card
    if (opt.id === 'heal_banana') {
      p.hp = Math.min(p.maxHp, p.hp + 45);
      this.coinsEarned += 15;
    } else {
      this.coinsEarned += 35;
    }
  }

  private selectCard(index: number): void {
    const opt = this.localCards[index];
    if (!opt) return;
    sfx.click();

    if (this.isAuthority()) {
      const lp = this.players.find((p) => p.isLocal);
      if (lp && lp.pendingChoice) {
        this.applyUpgradeOption(lp, opt);
        lp.pendingChoice = false;
        this.checkAllDraftsDone();
      }
    } else {
      this.localCards = [];
      this.room.send('pick_card', { type: 'pick_card', option: opt });
      this.renderUi();
    }
  }

  private finishRun(victory: boolean): void {
    this.screen = victory ? 'victory' : 'gameover';
    if (victory) sfx.victory();
    else sfx.hurt();

    const bonusCoins = victory ? 150 : 0;
    const totalCoins = this.coinsEarned + bonusCoins;
    this.coinsEarned = totalCoins;

    const score = Math.floor(
      this.elapsed * 10 + this.totalKills * 5 + this.level * 120 + (victory ? 5000 : 0),
    );

    this.meta.totalRuns += 1;
    this.meta.totalKills += this.totalKills;
    this.meta.bestTimeSec = Math.max(this.meta.bestTimeSec, this.elapsed);
    this.meta.bestLevel = Math.max(this.meta.bestLevel, this.level);
    this.meta.bossesDefeated += this.bossesDefeated;
    this.meta.coins += totalCoins;
    if (victory) this.meta.victories += 1;

    const newlyUnlocked = evaluateCharacterUnlocks(
      this.meta,
      this.elapsed,
      this.level,
      this.bossesDefeated,
    );
    saveMetaProgress(this.meta);
    reportGameScore(SLUG, score, {
      level: this.level,
      kills: this.totalKills,
      victory: victory ? 1 : 0,
    });

    this.endSummary = { victory, score, newlyUnlocked };

    if (this.isMultiplayer()) {
      this.broadcastStateSnapshot();
    }
    this.renderUi();
  }

  private broadcastStateSnapshot(): void {
    const camRef = this.players[0] ?? { x: 0, y: 0 };
    const enemiesArr = this.enemyPool.items
      .filter((e) => e.active)
      .slice(0, 180)
      .map((e) => ({
        id: e.id,
        k: e.kind,
        b: e.isBoss ? 1 : 0,
        e: e.isElite ? 1 : 0,
        x: Math.round(e.x),
        y: Math.round(e.y),
        hp: Math.round(e.hp),
        mhp: Math.round(e.maxHp),
        fl: e.hitFlash > 0 ? 0.1 : 0,
        r: Math.round(e.radius),
      }));

    const projArr = this.projPool.items
      .filter((pr) => pr.active)
      .slice(0, 130)
      .map((pr) => ({
        id: pr.id,
        k: pr.kind,
        w: pr.weaponId,
        ev: pr.evolved ? 1 : 0,
        x: Math.round(pr.x),
        y: Math.round(pr.y),
        a: Number(pr.angle.toFixed(2)),
        r: Math.round(pr.radius),
        c: pr.color,
      }));

    const pickArr = this.pickupPool.items
      .filter((g) => g.active && Math.hypot(g.x - camRef.x, g.y - camRef.y) < 1200)
      .slice(0, 140)
      .map((g) => ({
        id: g.id,
        k: g.kind,
        x: Math.round(g.x),
        y: Math.round(g.y),
      }));

    this.room.send('state', {
      type: 'state',
      elapsed: this.elapsed,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      kills: this.totalKills,
      coinsEarned: this.coinsEarned,
      screen: this.screen,
      bannerText: this.bannerText,
      bannerTimer: this.bannerTimer,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        charId: p.charId,
        x: Math.round(p.x),
        y: Math.round(p.y),
        fx: Number(p.facingX.toFixed(2)),
        fy: Number(p.facingY.toFixed(2)),
        hp: Math.round(p.hp),
        maxHp: Math.round(p.maxHp),
        downed: p.downed,
        revive: Number(p.reviveProgress.toFixed(2)),
        flash: p.hitFlash > 0 ? 0.1 : 0,
        kills: p.kills,
        pending: p.pendingChoice,
        weapons: p.weapons.map((w) => ({ id: w.id, lvl: w.level, evo: w.evolved })),
        passives: p.passives.map((ps) => ({ id: ps.id, lvl: ps.level })),
      })),
      enemies: enemiesArr,
      projectiles: projArr,
      pickups: pickArr,
      vfx: [],
    });
  }

  private stepVisuals(dt: number): void {
    if (this.shakeMag > 0.1) {
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
      this.shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
      this.shakeMag *= Math.pow(0.015, dt);
    } else {
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    for (const v of this.vfxPool.items) {
      if (!v.active) continue;
      v.life -= dt;
      if (v.life <= 0) v.active = false;
    }

    for (const pt of this.particlePool.items) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.2, dt);
      pt.vy *= Math.pow(0.2, dt);
      pt.rot += pt.vrot * dt;
    }

    for (const ft of this.textPool.items) {
      if (!ft.active) continue;
      ft.life -= dt;
      if (ft.life <= 0) {
        ft.active = false;
        continue;
      }
      ft.y += ft.vy * dt;
    }
  }

  private spawnPickup(kind: GemKind, x: number, y: number, value: number): void {
    const g = this.pickupPool.acquire();
    g.id = this.nextEntityId++;
    g.kind = kind;
    g.x = x;
    g.y = y;
    g.value = value;
    g.magnetizedToId = null;
    g.bobPhase = Math.random() * 6.28;
  }

  private spawnVfx(
    kind: VisualEffect['kind'],
    x: number,
    y: number,
    x2: number,
    y2: number,
    radius: number,
    angle: number,
    life: number,
    color: string,
  ): void {
    const v = this.vfxPool.acquire();
    v.kind = kind;
    v.x = x;
    v.y = y;
    v.x2 = x2;
    v.y2 = y2;
    v.radius = radius;
    v.angle = angle;
    v.life = life;
    v.maxLife = life;
    v.color = color;
  }

  private spawnParticles(
    x: number,
    y: number,
    color: string,
    count: number,
    shape: ParticleEntity['shape'],
  ): void {
    for (let i = 0; i < count; i++) {
      const pt = this.particlePool.acquire();
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 170;
      pt.x = x;
      pt.y = y;
      pt.vx = Math.cos(ang) * spd;
      pt.vy = Math.sin(ang) * spd;
      pt.size = 3 + Math.random() * 4;
      pt.life = 0.25 + Math.random() * 0.25;
      pt.maxLife = pt.life;
      pt.color = color;
      pt.shape = shape;
      pt.rot = Math.random() * 6.28;
      pt.vrot = (Math.random() - 0.5) * 10;
    }
  }

  private spawnText(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    crit: boolean,
  ): void {
    const ft = this.textPool.acquire();
    ft.x = x;
    ft.y = y;
    ft.vy = -44;
    ft.text = text;
    ft.color = color;
    ft.size = size;
    ft.life = 0.58;
    ft.maxLife = 0.58;
    ft.crit = crit;
  }

  private render(): void {
    const activePlayers = this.isAuthority() ? this.players : this.guestRenderPlayers;
    const activeEnemies = this.isAuthority() ? this.enemyPool.items : this.guestRenderEnemies;
    const activeProjs = this.isAuthority() ? this.projPool.items : this.guestRenderProjs;
    const activePickups = this.isAuthority() ? this.pickupPool.items : this.guestRenderPickups;

    renderGame(this.ctx, this.cw, this.ch, {
      time: this.animTime,
      elapsed: this.elapsed,
      camX: this.camX,
      camY: this.camY,
      shakeX: this.shakeX,
      shakeY: this.shakeY,
      players: activePlayers,
      localPlayerId: this.room.localPlayer.id,
      enemies: activeEnemies,
      projectiles: activeProjs,
      pickups: activePickups,
      vfx: this.vfxPool.items,
      particles: this.particlePool.items,
      floatingTexts: this.textPool.items,
      joystick: this.joystick,
      bannerText: this.bannerText,
      bannerTimer: this.bannerTimer,
    });
  }

  // ==================== INPUT & RESIZE ====================

  private bindInput(): void {
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (this.screen === 'levelup' && this.localCards.length > 0) {
        if (e.code === 'Digit1') this.selectCard(0);
        else if (e.code === 'Digit2') this.selectCard(1);
        else if (e.code === 'Digit3') this.selectCard(2);
      } else if ((e.code === 'KeyP' || e.code === 'Escape') && !this.isMultiplayer()) {
        if (this.screen === 'playing') {
          this.screen = 'paused';
          this.renderUi();
        } else if (this.screen === 'paused') {
          this.screen = 'playing';
          this.renderUi();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.screen !== 'playing') return;
      if (this.joystick.active) return;
      this.joystick.active = true;
      this.joystick.pointerId = e.pointerId;
      this.joystick.originX = e.clientX;
      this.joystick.originY = e.clientY;
      this.joystick.knobX = e.clientX;
      this.joystick.knobY = e.clientY;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.joystick.active || e.pointerId !== this.joystick.pointerId) return;
      const dx = e.clientX - this.joystick.originX;
      const dy = e.clientY - this.joystick.originY;
      const maxR = 46;
      const dist = Math.hypot(dx, dy);
      if (dist > 0) {
        const clamped = Math.min(maxR, dist);
        this.joystick.knobX = this.joystick.originX + (dx / dist) * clamped;
        this.joystick.knobY = this.joystick.originY + (dy / dist) * clamped;
        const mag = clamped / maxR;
        this.joystick.dx = (dx / dist) * mag;
        this.joystick.dy = (dy / dist) * mag;
      }
    });

    const endJoystick = (e: PointerEvent) => {
      if (!this.joystick.active || e.pointerId !== this.joystick.pointerId) return;
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
    };
    this.canvas.addEventListener('pointerup', endJoystick);
    this.canvas.addEventListener('pointercancel', endJoystick);
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.canvas.width = Math.floor(this.cw * this.dpr);
    this.canvas.height = Math.floor(this.ch * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ==================== DOM OVERLAYS ====================

  private ensureStyles(): void {
    if (document.getElementById('msv-styles')) return;
    const style = document.createElement('style');
    style.id = 'msv-styles';
    style.textContent = `
      .msv-root {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 20;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      .msv-xp-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 8px;
        background: rgba(15, 23, 42, 0.9);
        border-bottom: 1px solid rgba(250, 204, 21, 0.35);
      }
      .msv-xp-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #22c55e, #facc15);
        transition: width 0.12s linear;
      }
      .msv-top-right {
        position: fixed;
        top: 14px;
        right: 12px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        pointer-events: auto;
      }
      .msv-stats-pill {
        background: rgba(15, 23, 42, 0.88);
        border: 2px solid #334155;
        border-radius: 12px;
        padding: 6px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 13px;
        font-weight: 800;
        color: #f8fafc;
        box-shadow: 0 6px 18px rgba(0,0,0,0.45);
      }
      .msv-slots {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: 280px;
      }
      .msv-slot {
        background: rgba(15, 23, 42, 0.9);
        border: 1.5px solid #475569;
        border-radius: 8px;
        padding: 3px 6px;
        font-size: 12px;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .msv-slot.evo { border-color: #facc15; background: rgba(113, 63, 18, 0.55); color: #fef08a; }
      .msv-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(5, 8, 16, 0.78);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        pointer-events: auto;
        overflow-y: auto;
      }
      .msv-panel {
        background: linear-gradient(180deg, #111827 0%, #0b0f19 100%);
        border: 2px solid #facc15;
        border-radius: 18px;
        padding: 20px;
        max-width: 820px;
        width: 100%;
        color: #f8fafc;
        box-shadow: 0 24px 60px rgba(0,0,0,0.65);
        max-height: 92vh;
        overflow-y: auto;
      }
      .msv-title {
        margin: 0;
        font-size: clamp(22px, 4vw, 34px);
        font-weight: 900;
        color: #fef08a;
        text-align: center;
        letter-spacing: -0.5px;
      }
      .msv-sub {
        text-align: center;
        color: #94a3b8;
        font-size: 13px;
        margin: 6px 0 14px;
      }
      .msv-tabs {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 14px;
      }
      .msv-btn {
        background: #1e293b;
        color: #f8fafc;
        border: 2px solid #475569;
        border-radius: 12px;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        transition: transform 0.1s, border-color 0.15s, background 0.15s;
      }
      .msv-btn:hover { transform: translateY(-1px); border-color: #facc15; }
      .msv-btn.primary {
        background: linear-gradient(135deg, #facc15, #f97316);
        color: #1c1917;
        border-color: #fef08a;
        font-size: 18px;
        padding: 13px 32px;
        box-shadow: 0 6px 20px rgba(250, 204, 21, 0.35);
      }
      .msv-btn.active { border-color: #facc15; background: #334155; color: #fef08a; }
      .msv-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
      .msv-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
        gap: 10px;
        margin-bottom: 16px;
      }
      .msv-char-card {
        background: #172033;
        border: 2px solid #334155;
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
        text-align: left;
        transition: transform 0.1s, border-color 0.15s;
      }
      .msv-char-card.selected { border-color: #facc15; background: #1e293b; box-shadow: 0 0 0 2px rgba(250,204,21,0.3); }
      .msv-char-card.locked { opacity: 0.78; }
      .msv-cards-3 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px;
        margin-top: 12px;
      }
      .msv-draft-card {
        background: #172033;
        border: 2px solid #475569;
        border-radius: 14px;
        padding: 14px;
        cursor: pointer;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: transform 0.1s, border-color 0.15s, background 0.15s;
      }
      .msv-draft-card:hover { transform: translateY(-3px); border-color: #facc15; background: #1e293b; }
      .msv-draft-card.evo { border-color: #facc15; background: linear-gradient(160deg, #422006, #1e1b4b); }
      .msv-tag {
        display: inline-block;
        font-size: 10px;
        font-weight: 900;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(250, 204, 21, 0.18);
        color: #fde047;
        align-self: flex-start;
      }
      .msv-quip {
        font-style: italic;
        color: #fb7185;
        font-size: 12px;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  private buildDom(): void {
    this.uiRoot = document.createElement('div');
    this.uiRoot.className = 'msv-root';

    this.hudOverlay = document.createElement('div');
    this.modalOverlay = document.createElement('div');

    this.uiRoot.appendChild(this.hudOverlay);
    this.uiRoot.appendChild(this.modalOverlay);
    document.body.appendChild(this.uiRoot);
  }

  private formatTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }

  private updatePlayingHud(): void {
    if (this.screen !== 'playing' && this.screen !== 'chest') {
      this.hudOverlay.innerHTML = '';
      return;
    }

    const activePlayers = this.isAuthority() ? this.players : this.guestRenderPlayers;
    const localP =
      activePlayers.find((p) => p.id === this.room.localPlayer.id) ?? activePlayers[0];
    const xpPct = Math.min(100, Math.max(0, (this.xp / Math.max(1, this.xpToNext)) * 100));

    const weaponChips = localP
      ? localP.weapons
          .map((w) => {
            const def = WEAPONS[w.id];
            return `<span class="msv-slot ${w.evolved ? 'evo' : ''}" title="${w.evolved ? def.evolvedName : def.name}">${w.evolved ? def.evolvedEmoji : def.emoji} ${w.evolved ? '★' : w.level}</span>`;
          })
          .join('')
      : '';

    const passiveChips = localP
      ? localP.passives
          .map((ps) => {
            const def = PASSIVES[ps.id];
            return `<span class="msv-slot" title="${def.name}">${def.emoji} ${ps.level}</span>`;
          })
          .join('')
      : '';

    const pauseBtnHtml = !this.isMultiplayer()
      ? `<button class="msv-btn" id="msv-pause-btn" style="padding:4px 10px;font-size:12px;">⏸</button>`
      : '';

    this.hudOverlay.innerHTML = `
      <div class="msv-xp-bar"><div class="msv-xp-fill" style="width:${xpPct.toFixed(1)}%"></div></div>
      <div class="msv-top-right">
        <div class="msv-stats-pill">
          <span style="color:#fde047;">⏱ ${this.formatTime(this.elapsed)} / 15:00</span>
          <span style="color:#4ade80;">Nv ${this.level}</span>
          <span>💀 ${this.totalKills}</span>
          <span style="color:#facc15;">🪙 ${this.coinsEarned}</span>
          ${pauseBtnHtml}
        </div>
        <div class="msv-slots">${weaponChips}${passiveChips}</div>
      </div>
    `;

    const pauseBtn = this.hudOverlay.querySelector<HTMLButtonElement>('#msv-pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        this.screen = 'paused';
        this.renderUi();
      };
    }
  }

  private renderUi(): void {
    this.updatePlayingHud();
    this.modalOverlay.innerHTML = '';

    if (this.screen === 'playing') return;

    if (this.screen === 'chest' && this.chestModalData) {
      const cardsHtml = this.chestModalData.cards
        .map(
          (c) => `
          <div class="msv-draft-card ${c.kind === 'evolve' ? 'evo' : ''}" style="cursor:default;">
            <span class="msv-tag">${c.tag}</span>
            <div style="font-size:20px;font-weight:900;color:${c.color}">${c.emoji} ${c.title}</div>
            <div style="font-size:12px;color:#cbd5e1;">${c.description}</div>
          </div>`,
        )
        .join('');
      this.modalOverlay.innerHTML = `
        <div class="msv-modal-backdrop" style="pointer-events:none;">
          <div class="msv-panel" style="max-width:460px;text-align:center;">
            <h2 class="msv-title" style="font-size:24px;">${this.chestModalData.title}</h2>
            <p class="msv-sub">+${this.chestModalData.coins} Moedas de Banana!</p>
            <div class="msv-cards-3" style="grid-template-columns:1fr;">${cardsHtml}</div>
          </div>
        </div>
      `;
      return;
    }

    if (this.screen === 'title') {
      this.renderTitleModal();
      return;
    }

    if (this.screen === 'levelup') {
      this.renderLevelUpModal();
      return;
    }

    if (this.screen === 'paused') {
      this.modalOverlay.innerHTML = `
        <div class="msv-modal-backdrop">
          <div class="msv-panel" style="max-width:420px;text-align:center;">
            <h2 class="msv-title">⏸ PAUSADO</h2>
            <p class="msv-sub">Os boletos estão congelados esperando você voltar.</p>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
              <button class="msv-btn primary" id="msv-resume">Continuar (P)</button>
              <button class="msv-btn" id="msv-quit">Voltar ao Menu</button>
            </div>
          </div>
        </div>
      `;
      this.modalOverlay.querySelector('#msv-resume')?.addEventListener('click', () => {
        sfx.click();
        this.screen = 'playing';
        this.renderUi();
      });
      this.modalOverlay.querySelector('#msv-quit')?.addEventListener('click', () => {
        sfx.click();
        this.screen = 'title';
        this.renderUi();
      });
      return;
    }

    if (this.screen === 'gameover' || this.screen === 'victory') {
      this.renderEndModal();
    }
  }

  private renderTitleModal(): void {
    const isGuest = this.isMultiplayer() && !this.room.localPlayer.isHost;
    const roster = this.room.getPlayers();
    const quip = FUNNY_QUIPS[Math.floor((this.animTime * 0.2) % FUNNY_QUIPS.length)];

    let bodyHtml = '';
    if (this.titleTab === 'play') {
      const charCards = CHARACTER_ORDER.map((cid) => {
        const c = CHARACTERS[cid];
        const unlocked = this.meta.unlockedChars.includes(cid);
        const startW = WEAPONS[c.startWeapon];
        const selected = this.selectedChar === cid;
        const canBuy = !unlocked && this.meta.coins >= c.unlockCost;
        return `
          <div class="msv-char-card ${selected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" data-char="${cid}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="color:${c.accentColor};font-size:14px;">${c.name}</strong>
              <span>${unlocked ? startW.emoji : '🔒'}</span>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin:3px 0;">${c.title}</div>
            <div style="font-size:11px;color:#e2e8f0;line-height:1.35;">${c.description}</div>
            <div style="font-size:11px;margin-top:6px;color:${unlocked ? '#4ade80' : '#facc15'};font-weight:700;">
              ${unlocked ? `Arma: ${startW.name}` : c.unlockHint}
            </div>
            ${
              !unlocked
                ? `<button class="msv-btn" data-buy-char="${cid}" ${canBuy ? '' : 'disabled'} style="margin-top:6px;padding:4px 8px;font-size:11px;width:100%;">Desbloquear (${c.unlockCost} 🪙)</button>`
                : ''
            }
          </div>
        `;
      }).join('');

      const coopInfo =
        roster.length > 1
          ? `<div style="text-align:center;margin-bottom:10px;color:#4ade80;font-weight:800;font-size:13px;">🐒 Co-op Online: ${roster.length} Macacos na sala (${roster.map((r) => r.name).join(', ')})</div>`
          : '';

      bodyHtml = `
        ${coopInfo}
        <div class="msv-grid">${charCards}</div>
        <div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;align-items:center;">
          <button class="msv-btn primary" id="msv-play-btn">
            ${isGuest ? '⏳ Aguardando Host (ou Pedir Início)' : '🍌 JOGAR AGORA'}
          </button>
        </div>
      `;
    } else {
      const upgradesHtml = META_UPGRADES.map((u) => {
        const rank = this.meta.upgrades[u.id] ?? 0;
        const maxed = rank >= u.maxRank;
        const cost = getMetaUpgradeCost(u.id, rank);
        const canBuy = !maxed && this.meta.coins >= cost;
        return `
          <div class="msv-char-card">
            <div style="display:flex;justify-content:space-between;">
              <strong>${u.emoji} ${u.name}</strong>
              <span style="color:#facc15;font-weight:800;">${rank}/${u.maxRank}</span>
            </div>
            <div style="font-size:11px;color:#cbd5e1;margin:5px 0;">${u.description}</div>
            <button class="msv-btn" data-buy-upg="${u.id}" ${canBuy ? '' : 'disabled'} style="padding:5px 10px;font-size:12px;width:100%;">
              ${maxed ? 'MAXIMIZADO ✅' : `Melhorar (${cost} 🪙)`}
            </button>
          </div>
        `;
      }).join('');

      bodyHtml = `<div class="msv-grid">${upgradesHtml}</div>`;
    }

    this.modalOverlay.innerHTML = `
      <div class="msv-modal-backdrop">
        <div class="msv-panel">
          <h1 class="msv-title">🧾 MACACO SURVIVORS: A HORDA DO BOLETO</h1>
          <p class="msv-sub">
            Sobreviva 15 min • Ataque automático • 10 Armas + 10 Evoluções • Co-op 2-4 Macacos
          </p>
          <p class="msv-quip">"${quip}"</p>
          <div style="display:flex;justify-content:center;gap:16px;font-size:13px;font-weight:800;margin:10px 0;">
            <span style="color:#facc15;">🪙 Moedas: ${this.meta.coins}</span>
            <span style="color:#4ade80;">⏱ Recorde: ${this.formatTime(this.meta.bestTimeSec)}</span>
            <span style="color:#38bdf8;">💀 Abates Totais: ${this.meta.totalKills}</span>
          </div>
          <div class="msv-tabs">
            <button class="msv-btn ${this.titleTab === 'play' ? 'active' : ''}" id="msv-tab-play">🐒 Escolher Macaco</button>
            <button class="msv-btn ${this.titleTab === 'shop' ? 'active' : ''}" id="msv-tab-shop">🛒 Loja da Selva (${this.meta.coins} 🪙)</button>
          </div>
          ${bodyHtml}
          <div style="text-align:center;font-size:11px;color:#64748b;margin-top:12px;">
            🎮 Controles: F1 (ou botão no topo) • Co-op: botão "Co-op Online" no topo esquerdo
          </div>
        </div>
      </div>
    `;

    this.modalOverlay.querySelector('#msv-tab-play')?.addEventListener('click', () => {
      sfx.click();
      this.titleTab = 'play';
      this.renderUi();
    });
    this.modalOverlay.querySelector('#msv-tab-shop')?.addEventListener('click', () => {
      sfx.click();
      this.titleTab = 'shop';
      this.renderUi();
    });

    this.modalOverlay.querySelector('#msv-play-btn')?.addEventListener('click', () => {
      this.startRun();
    });

    this.modalOverlay.querySelectorAll<HTMLElement>('[data-char]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest('[data-buy-char]')) return;
        const cid = el.dataset.char as CharacterId;
        if (this.meta.unlockedChars.includes(cid)) {
          sfx.click();
          this.selectedChar = cid;
          this.renderUi();
        }
      });
    });

    this.modalOverlay.querySelectorAll<HTMLButtonElement>('[data-buy-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.buyChar as CharacterId;
        const def = CHARACTERS[cid];
        if (!def || this.meta.coins < def.unlockCost || this.meta.unlockedChars.includes(cid)) return;
        this.meta.coins -= def.unlockCost;
        this.meta.unlockedChars.push(cid);
        this.selectedChar = cid;
        saveMetaProgress(this.meta);
        sfx.revive();
        this.renderUi();
      });
    });

    this.modalOverlay.querySelectorAll<HTMLButtonElement>('[data-buy-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.buyUpg as MetaUpgradeId;
        const def = META_UPGRADES.find((u) => u.id === uid);
        if (!def) return;
        const rank = this.meta.upgrades[uid] ?? 0;
        const cost = getMetaUpgradeCost(uid, rank);
        if (rank >= def.maxRank || this.meta.coins < cost) return;
        this.meta.coins -= cost;
        this.meta.upgrades[uid] = rank + 1;
        saveMetaProgress(this.meta);
        sfx.revive();
        this.renderUi();
      });
    });
  }

  private renderLevelUpModal(): void {
    const waitingOthers = this.localCards.length === 0;
    if (waitingOthers) {
      const pendingNames = (this.isAuthority() ? this.players : this.guestRenderPlayers)
        .filter((p) => p.pendingChoice)
        .map((p) => p.name);
      this.modalOverlay.innerHTML = `
        <div class="msv-modal-backdrop">
          <div class="msv-panel" style="max-width:460px;text-align:center;">
            <h2 class="msv-title">🍌 LEVEL UP! (Nível ${this.level})</h2>
            <p class="msv-sub">Aguardando a macacada escolher: ${pendingNames.join(', ') || '...'}</p>
          </div>
        </div>
      `;
      return;
    }

    const cardsHtml = this.localCards
      .map(
        (c, idx) => `
        <button class="msv-draft-card ${c.kind === 'evolve' ? 'evo' : ''}" data-pick="${idx}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="msv-tag">${c.tag}</span>
            <span style="font-size:11px;color:#94a3b8;font-weight:800;">Tecla ${idx + 1}</span>
          </div>
          <div style="font-size:20px;font-weight:900;color:${c.color};margin-top:4px;">${c.emoji} ${c.title}</div>
          <div style="font-size:12px;font-weight:700;color:#94a3b8;">${c.subtitle}</div>
          <div style="font-size:13px;color:#e2e8f0;line-height:1.4;margin-top:4px;">${c.description}</div>
          ${c.synergyHint ? `<div style="font-size:11px;color:#fde047;margin-top:auto;padding-top:6px;">🔗 ${c.synergyHint}</div>` : ''}
        </button>
      `,
      )
      .join('');

    this.modalOverlay.innerHTML = `
      <div class="msv-modal-backdrop">
        <div class="msv-panel">
          <h2 class="msv-title">🍌 SUBIU PRO NÍVEL ${this.level}!</h2>
          <p class="msv-sub">Escolha 1 upgrade para enfrentar a horda dos boletos:</p>
          <div class="msv-cards-3">${cardsHtml}</div>
        </div>
      </div>
    `;

    this.modalOverlay.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.pick);
        this.selectCard(idx);
      });
    });
  }

  private renderEndModal(): void {
    const victory = this.screen === 'victory';
    const sum = this.endSummary ?? { victory, score: 0, newlyUnlocked: [] };
    const unlockText =
      sum.newlyUnlocked.length > 0
        ? `<div style="background:rgba(74,222,128,0.16);border:1.5px solid #4ade80;border-radius:10px;padding:10px;margin:10px 0;color:#bbf7d0;font-weight:800;">
            🎉 Desbloqueou: ${sum.newlyUnlocked.map((id) => CHARACTERS[id].name).join(', ')}!
           </div>`
        : '';

    this.modalOverlay.innerHTML = `
      <div class="msv-modal-backdrop">
        <div class="msv-panel" style="max-width:520px;text-align:center;">
          <h2 class="msv-title" style="color:${victory ? '#4ade80' : '#fb7185'}">
            ${victory ? '🏆 BOLETOS QUITADOS! VITÓRIA!' : '🧾 NOME NO SERASA! FIM DE JOGO'}
          </h2>
          <p class="msv-sub">
            ${victory ? 'Você sobreviveu aos 15 minutos e derrotou a Ceifadora do Serasa!' : 'A horda da cobrança foi implacável desta vez.'}
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;text-align:left;">
            <div class="msv-char-card">⏱ Tempo: <strong>${this.formatTime(this.elapsed)}</strong></div>
            <div class="msv-char-card">🌟 Nível: <strong>${this.level}</strong></div>
            <div class="msv-char-card">💀 Abates: <strong>${this.totalKills}</strong></div>
            <div class="msv-char-card">🪙 Moedas: <strong style="color:#facc15">+${this.coinsEarned}</strong></div>
          </div>
          <div style="font-size:18px;font-weight:900;color:#fef08a;margin-bottom:10px;">
            Pontuação Final: ${sum.score.toLocaleString('pt-BR')}
          </div>
          ${unlockText}
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:14px;">
            <button class="msv-btn primary" id="msv-retry">🔄 Jogar de Novo</button>
            <button class="msv-btn" id="msv-menu">🐒 Trocar Macaco / Loja</button>
          </div>
        </div>
      </div>
    `;

    this.modalOverlay.querySelector('#msv-retry')?.addEventListener('click', () => {
      this.startRun();
    });
    this.modalOverlay.querySelector('#msv-menu')?.addEventListener('click', () => {
      sfx.click();
      this.screen = 'title';
      this.renderUi();
    });
  }
}
