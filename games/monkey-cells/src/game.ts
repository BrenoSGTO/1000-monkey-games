import { type MonkeyHudHandle, PeerRoom, type PlayerProfile, reportGameScore } from '@monkey-slop/sdk';
import { generateArenaRoom, generateRoom, WEAPON_POOL } from './levels';
import { type ArenaHudState, type LocalRenderPlayer, renderWorld } from './renderer';
import { sfx } from './sfx';
import {
  type BoomerangEntity,
  type EnemyEntity,
  type EnemyProjectile,
  type FloatingText,
  type GameMode,
  type NetMessage,
  type Particle,
  type PeelBomb,
  type PickupBanana,
  type RemotePlayerState,
  type RoomData,
  type SwingDir,
  type TelegraphMarker,
  UPGRADES,
  type UpgradeDef,
  type UpgradeId,
  WEAPONS,
  type WeaponId,
} from './types';

const GRAVITY = 1520;
const MAX_FALL = 880;
const MOVE_ACCEL = 2800;
const MAX_SPEED = 325;
const JUMP_VEL = -585;
const DOUBLE_JUMP_VEL = -530;
const WALL_SLIDE_SPEED = 140;
const DASH_SPEED = 690;
const DASH_TIME = 0.21;

const DEATH_QUIPS: Record<string, string> = {
  nerd_bat: 'Morreu ouvindo o Morcego de Óculos explicar por que BananaCoin vai subir.',
  clt_beetle: 'Demitido por justa causa pelo Besouro CLT com uma maletada no crânio.',
  coco_archer: 'Tomou um headshot de coco 360° sem scope do Sagui Sniper.',
  bouncy_frog: 'Foi amassado pelo Sapo Pula-Pula durante o expediente.',
  hr_baboon: 'Reprovado na entrevista pelo Gerente de RH Babuíno: "Sem fit cultural!"',
  gorilla_ceo: 'O Gorilão CEO cortou seu vale-banana e encerrou seu contrato!',
  spike: 'Tentou dar um pogo estiloso no espinho e virou espetinho de macaco.',
  bleedout: 'Ficou caído esperando a bananada e ninguém veio te levantar!',
  unknown: 'Escorregou na própria casca existencial.',
};

interface PlayerController {
  player: LocalRenderPlayer;
  grounded: boolean;
  standingOnOneWay: boolean;
  jumpsLeft: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  dashCooldown: number;
  attackCooldown: number;
  dropThroughTimer: number;
  wallJumpLockTimer: number;
  pogoGraceTimer: number;
  activeJumpFromButton: boolean;
  lastWJumpTime: number;
  lastAttackHitIds: Set<string>;
  hitCounter: number;
  ownerId: string;
  isLocalMain: boolean;
}

interface HitEnemyOpts {
  dmg: number;
  attackerX: number;
  knockback: number;
  isPogo: boolean;
  forceCrit?: boolean;
  canAirCrit?: boolean;
  airCritMult?: number;
  isPan?: boolean;
  isElectric?: boolean;
  stun?: number;
  customLabel?: string;
  bypassShield?: boolean;
  showText?: boolean;
}

export class HollowChimpGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private roomPeer: PeerRoom<NetMessage>;
  private hud: MonkeyHudHandle;

  private uiRoot: HTMLDivElement;
  private titleOverlay: HTMLDivElement;
  private arenaOverlay: HTMLDivElement;
  private draftOverlay: HTMLDivElement;
  private summaryOverlay: HTMLDivElement;
  private fkButton: HTMLButtonElement;

  private mode: GameMode = 'dungeon';
  private phase: 'title' | 'playing' | 'draft' | 'summary' = 'title';
  private runSeed = 1337;
  private roomIndex = 0;
  private room!: RoomData;
  private roomCleared = false;

  private p1Ctrl!: PlayerController;
  private p2Ctrl: PlayerController | null = null;

  private remotes = new Map<string, RemotePlayerState>();
  private enemyTargets = new Map<string, { x: number; y: number }>();
  private playersRoster: PlayerProfile[] = [];

  private boomerangs: BoomerangEntity[] = [];
  private peelBombs: PeelBomb[] = [];
  private projectiles: EnemyProjectile[] = [];
  private telegraphs: TelegraphMarker[] = [];
  private pickups: PickupBanana[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private keys = new Set<string>();
  private hitstopTimer = 0;

  // Run stats & upgrades
  private upgrades: UpgradeId[] = [];
  private draftChoices: UpgradeDef[] = [];
  private bananas = 0;
  private kills = 0;
  private damageDealt = 0;
  private runTime = 0;
  private score = 0;
  private lastDamager = 'unknown';
  private scoreReported = false;
  private friendlyKnockback = false;

  // Co-op Portal & Draft Sync
  private portalReady = false;
  private portalCountdown: { timer: number; initiatorName: string } | null = null;
  private enemiesFrozen = false;

  // Arena PvP State
  private arenaRound = 1;
  private arenaMaxRounds = 3;
  private arenaP1Score = 0;
  private arenaP2Score = 0;
  private arenaOnlineScores: Record<string, number> = {};
  private arenaCountdown = 0;
  private arenaRoundResetTimer = 0;
  private arenaBannerText = '';
  private arenaChestTimer = 12;
  private arenaBotDecisionTimer = 0;
  private arenaBotMoveDir: -1 | 0 | 1 = 0;
  private arenaStats = { pogos: 0, parries: 0, crits: 0 };

  // Camera & timers
  private viewW = 1280;
  private viewH = 720;
  private dpr = 1;
  private camX = 0;
  private camY = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private globalTime = 0;
  private netSyncAccum = 0;
  private worldSnapAccum = 0;
  private lastFrame = 0;
  private rafId = 0;

  constructor(
    canvas: HTMLCanvasElement,
    roomPeer: PeerRoom<NetMessage>,
    hud: MonkeyHudHandle,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponivel');
    this.ctx = context;
    this.roomPeer = roomPeer;
    this.hud = hud;

    this.uiRoot = document.createElement('div');
    this.uiRoot.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:20;font-family:system-ui,-apple-system,sans-serif;';
    document.body.appendChild(this.uiRoot);

    this.fkButton = this.createFkButton();
    this.titleOverlay = this.createTitleOverlay();
    this.arenaOverlay = this.createArenaOverlay();
    this.draftOverlay = this.createDraftOverlay();
    this.summaryOverlay = this.createSummaryOverlay();

    this.p1Ctrl = this.createController(
      this.roomPeer.localPlayer.id,
      this.roomPeer.localPlayer.name,
      this.roomPeer.localPlayer.color,
    );
    this.loadRoom(0, false);

    this.bindInputs();
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private get local(): LocalRenderPlayer {
    return this.p1Ctrl.player;
  }

  private createController(
    ownerId: string,
    name: string,
    color: string,
    isLocalMain = true,
  ): PlayerController {
    return {
      player: {
        x: 130,
        y: 500,
        w: 34,
        h: 46,
        vx: 0,
        vy: 0,
        facing: 1,
        hp: 5,
        maxHp: 5,
        potassium: 35,
        weapon: 'banana_sword',
        downed: false,
        reviveTimer: 18,
        swingTimer: 0,
        swingMax: 0.2,
        swingDir: 'right',
        dashTimer: 0,
        invulnTimer: 0,
        healing: false,
        healProgress: 0,
        hitFlash: 0,
        wallSlideDir: 0,
        color,
        name,
        afterimages: [],
      },
      grounded: false,
      standingOnOneWay: false,
      jumpsLeft: 2,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      dashCooldown: 0,
      attackCooldown: 0,
      dropThroughTimer: 0,
      wallJumpLockTimer: 0,
      pogoGraceTimer: 0,
      activeJumpFromButton: false,
      lastWJumpTime: -10,
      lastAttackHitIds: new Set(),
      hitCounter: 0,
      ownerId,
      isLocalMain,
    };
  }

  private isCoopActive(): boolean {
    return this.playersRoster.length > 1;
  }

  private isHostAuthority(): boolean {
    if (!this.isCoopActive()) return true;
    return this.roomPeer.localPlayer.isHost;
  }

  onPlayersChange(players: PlayerProfile[]): void {
    const prevCount = this.playersRoster.length;
    this.playersRoster = players;
    this.hud.setPlayers(players);

    const selfProfile = players.find((p) => p.id === this.roomPeer.localPlayer.id);
    if (selfProfile) {
      this.p1Ctrl.ownerId = selfProfile.id;
      this.local.name = selfProfile.name;
      this.local.color = selfProfile.color;
    } else {
      this.p1Ctrl.ownerId = this.roomPeer.localPlayer.id;
      this.local.name = this.roomPeer.localPlayer.name;
      this.local.color = this.roomPeer.localPlayer.color;
    }

    const activeIds = new Set(players.map((p) => p.id));
    for (const id of this.remotes.keys()) {
      if (!activeIds.has(id)) {
        this.remotes.delete(id);
      }
    }
    this.fkButton.style.display =
      this.isCoopActive() && this.mode === 'dungeon' ? 'inline-flex' : 'none';

    // Late-join sync!
    if (players.length > 1) {
      if (this.isHostAuthority() && this.phase !== 'title' && players.length > prevCount) {
        this.sendFullRunSync();
      } else if (!this.isHostAuthority() && this.phase === 'title') {
        this.roomPeer.send('request_sync', { type: 'request_sync' });
      }
    }
  }

  private sendFullRunSync(): void {
    if (!this.isHostAuthority() || !this.isCoopActive()) return;
    if (this.mode === 'arena_online') {
      this.roomPeer.send('pvp_start', {
        type: 'pvp_start',
        seed: this.runSeed,
        round: this.arenaRound,
        scores: this.arenaOnlineScores,
      });
      return;
    }
    this.roomPeer.send('sync_run', {
      type: 'sync_run',
      seed: this.runSeed,
      roomIndex: this.roomIndex,
      phase: this.phase,
      friendlyKnockback: this.friendlyKnockback,
      roomCleared: this.roomCleared,
      openedChests: this.room.chests.filter((c) => c.opened).map((c) => ({ id: c.id, weaponId: c.weaponId })),
      brokenCrates: this.room.crates.filter((c) => c.broken).map((c) => c.id),
    });
  }

  onNetMessage(msg: NetMessage, senderId: string, senderName: string): void {
    if (senderId === this.roomPeer.localPlayer.id) return;

    switch (msg.type) {
      case 'request_sync': {
        if (this.isHostAuthority() && this.phase !== 'title') {
          this.sendFullRunSync();
        }
        break;
      }
      case 'sync_run': {
        this.mode = 'dungeon';
        this.friendlyKnockback = msg.friendlyKnockback;
        this.updateFkButtonLabel();
        this.runSeed = msg.seed;
        this.resetDungeonStats();
        this.loadRoom(msg.roomIndex, true);
        this.roomCleared = msg.roomCleared;
        for (const oc of msg.openedChests) {
          const ch = this.room.chests.find((c) => c.id === oc.id);
          if (ch) {
            ch.opened = true;
            ch.weaponId = oc.weaponId;
          }
        }
        for (const cid of msg.brokenCrates) {
          const cr = this.room.crates.find((c) => c.id === cid);
          if (cr) cr.broken = true;
        }
        this.titleOverlay.style.display = 'none';
        this.arenaOverlay.style.display = 'none';
        this.summaryOverlay.style.display = 'none';
        this.draftOverlay.style.display = 'none';
        this.phase = msg.phase === 'summary' ? 'playing' : msg.phase;
        if (this.phase === 'draft') {
          this.openUpgradeDraft(msg.roomIndex);
        }
        this.hud.toast(`🔄 Sincronizado na Sala ${msg.roomIndex + 1} com ${senderName}!`, 'info');
        break;
      }
      case 'run_start': {
        this.mode = 'dungeon';
        this.friendlyKnockback = msg.friendlyKnockback;
        this.updateFkButtonLabel();
        this.startNewRun(msg.seed, false);
        this.hud.toast(`🐒 ${senderName} iniciou uma nova run Co-op!`, 'banana');
        break;
      }
      case 'player_state': {
        const profile = this.playersRoster.find((p) => p.id === senderId);
        const existing = this.remotes.get(senderId);
        const targetX = msg.state.x;
        const targetY = msg.state.y;
        const curX = existing ? existing.x : targetX;
        const curY = existing ? existing.y : targetY;
        const snap = Math.hypot(targetX - curX, targetY - curY) > 260;

        this.remotes.set(senderId, {
          id: senderId,
          name: profile?.name || senderName,
          color: profile?.color || existing?.color || '#38bdf8',
          ...msg.state,
          x: snap ? targetX : curX,
          y: snap ? targetY : curY,
          targetX,
          targetY,
          lastSeen: this.globalTime,
        });
        break;
      }
      case 'player_attack': {
        if (msg.weapon === 'havaiana_boomerang') {
          this.spawnBoomerang(senderId, msg.x, msg.y, msg.dir, false, msg.extraAngle ?? 0);
        } else if (msg.weapon === 'banana_bazooka') {
          this.spawnBazookaRocket(senderId, msg.x, msg.y, msg.dir, 0, 38);
        }
        break;
      }
      case 'enemy_hit': {
        if (this.isHostAuthority()) {
          const enemy = this.room.enemies.find((e) => e.id === msg.enemyId);
          if (enemy && enemy.hp > 0) {
            this.applyEnemyDamage(
              enemy,
              msg.dmg,
              msg.kbX,
              msg.kbY,
              msg.isCrit,
              msg.isPogo,
              true,
              msg.stun,
            );
          }
        }
        break;
      }
      case 'enemy_killed': {
        if (!this.isHostAuthority()) {
          const enemy = this.room.enemies.find((e) => e.id === msg.enemyId);
          if (enemy) enemy.hp = 0;
          this.kills++;
          this.score += msg.scoreGain;
          sfx.explosion();
          this.spawnBurst(msg.x, msg.y, '#facc15', 20);
          this.spawnBananaPickup(msg.x, msg.y, msg.bananaCount);
        }
        break;
      }
      case 'peel_bomb': {
        this.peelBombs.push({
          id: msg.id,
          ownerId: senderId,
          x: msg.x,
          y: msg.y,
          vy: -120,
          fuse: 0.75,
          exploded: false,
        });
        break;
      }
      case 'friendly_knockback': {
        if (msg.targetId === this.roomPeer.localPlayer.id && !this.local.downed) {
          this.local.vx = msg.kbX;
          this.local.vy = msg.kbY;
          this.p1Ctrl.grounded = false;
          this.p1Ctrl.activeJumpFromButton = false;
          sfx.boing();
          this.addFloatingText(this.local.x + 17, this.local.y - 12, `TRAIDOR! (${senderName}) 😈`, '#fb7185', 14);
          this.triggerShake(0.15, 5);
        }
        break;
      }
      case 'revive_player': {
        if (msg.targetId === this.roomPeer.localPlayer.id && this.local.downed) {
          this.reviveLocalPlayer(senderName);
        }
        break;
      }
      case 'portal_countdown': {
        if (!this.portalCountdown || msg.timer < this.portalCountdown.timer) {
          this.portalCountdown = { timer: msg.timer, initiatorName: msg.initiatorName };
        }
        break;
      }
      case 'room_advance': {
        if (msg.roomIndex !== this.roomIndex) {
          this.runSeed = msg.seed;
          this.portalCountdown = null;
          this.portalReady = false;
          if (this.phase === 'playing') {
            this.openUpgradeDraft(msg.roomIndex);
          } else {
            this.loadRoom(msg.roomIndex, true);
          }
        }
        break;
      }
      case 'run_victory': {
        if (this.phase !== 'summary') {
          this.finishRun(true, false);
        }
        break;
      }
      case 'chest_open': {
        const ch = this.room.chests.find((c) => c.id === msg.chestId);
        if (ch) {
          ch.opened = true;
          ch.weaponId = msg.swappedWeapon;
          this.spawnBurst(ch.x + 21, ch.y + 12, '#facc15', 14);
        }
        break;
      }
      case 'crate_break': {
        const cr = this.room.crates.find((c) => c.id === msg.crateId);
        if (cr && !cr.broken) {
          cr.broken = true;
          this.spawnBurst(cr.x + 18, cr.y + 18, '#b45309', 10);
          this.spawnBananaPickup(cr.x + 18, cr.y + 10, 2);
        }
        break;
      }
      case 'toggle_fk': {
        this.friendlyKnockback = msg.enabled;
        this.updateFkButtonLabel();
        this.hud.toast(
          msg.enabled
            ? `😈 ${senderName} LIGOU Empurrão Amigo!`
            : `😇 ${senderName} desligou Empurrão Amigo.`,
          msg.enabled ? 'chaos' : 'info',
        );
        break;
      }
      case 'world_snapshot': {
        if (this.isHostAuthority()) return;
        this.enemiesFrozen = msg.enemiesFrozen;
        if (msg.roomIndex !== this.roomIndex && this.phase === 'playing') {
          this.loadRoom(msg.roomIndex, true);
        }
        if (msg.roomCleared && !this.roomCleared) {
          sfx.victory();
          this.hud.toast(
            this.room.isBossRoom
              ? '👑 GORILÃO DERROTADO! Entre no Portal para celebrar!'
              : '✅ Sala limpa! Vá para o Portal à direita!',
            'banana',
          );
        }
        this.roomCleared = msg.roomCleared;
        for (const snap of msg.enemies) {
          const localE = this.room.enemies.find((e) => e.id === snap.id);
          if (localE) {
            this.enemyTargets.set(snap.id, { x: snap.x, y: snap.y });
            if (Math.hypot(snap.x - localE.x, snap.y - localE.y) > 220) {
              localE.x = snap.x;
              localE.y = snap.y;
            }
            localE.vx = snap.vx;
            localE.vy = snap.vy;
            if (snap.hp < localE.hp) localE.hitFlash = 0.09;
            localE.hp = snap.hp;
            localE.facing = snap.facing;
            localE.state = snap.state;
            localE.stateTimer = snap.stateTimer;
            localE.phase = snap.phase;
            localE.attackPattern = snap.attackPattern;
            localE.stunTimer = snap.stunTimer;
          }
        }
        // Smoothly merge projectiles so they don't stutter between snapshots,
        // while preserving local Guest-reflected shots & local bazooka rockets.
        const localId = this.roomPeer.localPlayer.id;
        const existingMap = new Map(this.projectiles.map((p) => [p.id, p]));
        const mergedIds = new Set<string>();
        const merged: EnemyProjectile[] = msg.projectiles.map((sp) => {
          mergedIds.add(sp.id);
          const ex = existingMap.get(sp.id);
          if (ex && ex.reflected && ex.ownerId === localId) {
            return ex;
          }
          if (ex && Math.hypot(sp.x - ex.x, sp.y - ex.y) < 120) {
            return {
              ...sp,
              x: ex.x + (sp.x - ex.x) * 0.6,
              y: ex.y + (sp.y - ex.y) * 0.6,
            };
          }
          return sp;
        });
        for (const ex of this.projectiles) {
          if (!mergedIds.has(ex.id) && ex.ownerId === localId && (ex.reflected || ex.kind === 'bazooka_banana')) {
            merged.push(ex);
          }
        }
        this.projectiles = merged;
        this.telegraphs = msg.telegraphs;
        break;
      }
      case 'pvp_start': {
        this.arenaOnlineScores = msg.scores;
        this.startArenaMatch('arena_online', msg.seed, false);
        this.arenaRound = msg.round;
        this.hud.toast(`🥊 ${senderName} iniciou Arena Bananada Online!`, 'chaos');
        break;
      }
      case 'pvp_hit': {
        if (msg.targetId === this.roomPeer.localPlayer.id && this.mode === 'arena_online' && this.phase === 'playing') {
          this.applyArenaDamage(this.p1Ctrl, msg.dmg, msg.kbX, msg.kbY, msg.isCrit, msg.isPogo, senderId);
        }
        break;
      }
      case 'pvp_round_win': {
        if (this.mode === 'arena_online') {
          this.arenaOnlineScores = msg.scores;
          this.arenaBannerText = msg.matchOver
            ? `🏆 ${msg.winnerName} VENCEU A ARENA!`
            : `💥 K.O.! Ponto para ${msg.winnerName}!`;
          sfx.victory();
          if (msg.matchOver) {
            this.finishArenaSummary(msg.winnerName, true);
          } else {
            this.arenaRound = msg.round + 1;
            this.arenaRoundResetTimer = 2.0;
          }
        }
        break;
      }
      case 'pvp_chest_spawn': {
        if (this.mode === 'arena_online') {
          this.room.chests.push({
            id: msg.id,
            x: msg.x,
            y: msg.y,
            weaponId: msg.weaponId,
            opened: false,
          });
          this.spawnBurst(msg.x + 21, msg.y + 12, '#facc15', 14);
        }
        break;
      }
    }
  }

  private resetDungeonStats(): void {
    this.upgrades = [];
    this.bananas = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.runTime = 0;
    this.score = 0;
    this.scoreReported = false;
    this.lastDamager = 'unknown';
    this.portalReady = false;
    this.portalCountdown = null;
    this.enemiesFrozen = false;
    this.p1Ctrl = this.createController(
      this.roomPeer.localPlayer.id,
      this.roomPeer.localPlayer.name,
      this.roomPeer.localPlayer.color,
    );
    this.p2Ctrl = null;
  }

  private startNewRun(seed?: number, broadcast = true): void {
    this.mode = 'dungeon';
    this.runSeed = seed ?? Math.floor(Math.random() * 999999);
    this.resetDungeonStats();
    this.loadRoom(0, true);
    this.phase = 'playing';
    this.titleOverlay.style.display = 'none';
    this.arenaOverlay.style.display = 'none';
    this.draftOverlay.style.display = 'none';
    this.summaryOverlay.style.display = 'none';
    this.fkButton.style.display = this.isCoopActive() ? 'inline-flex' : 'none';
    sfx.screech();
    this.hud.toast('⚔️ Nova Run iniciada! Dê Pogo nos inimigos e Parry nos cocos!', 'banana');

    if (broadcast && this.isCoopActive()) {
      this.roomPeer.send('run_start', {
        type: 'run_start',
        seed: this.runSeed,
        friendlyKnockback: this.friendlyKnockback,
      });
    }
  }

  private startArenaMatch(arenaMode: 'arena_local' | 'arena_online' | 'arena_bot', seed?: number, broadcast = true): void {
    this.mode = arenaMode;
    this.runSeed = seed ?? Math.floor(Math.random() * 999999);
    this.upgrades = [];
    this.bananas = 0;
    this.kills = 0;
    this.score = 0;
    this.runTime = 0;
    this.scoreReported = false;
    this.portalCountdown = null;
    this.enemiesFrozen = false;
    this.arenaRound = 1;
    this.arenaP1Score = 0;
    this.arenaP2Score = 0;
    this.arenaBannerText = '';
    this.arenaRoundResetTimer = 0;
    this.arenaChestTimer = 11;
    this.arenaStats = { pogos: 0, parries: 0, crits: 0 };

    if (arenaMode === 'arena_online') {
      if (broadcast) {
        this.arenaOnlineScores = {};
        for (const p of this.playersRoster) this.arenaOnlineScores[p.id] = 0;
        this.arenaOnlineScores[this.roomPeer.localPlayer.id] = 0;
      }
    }

    this.setupArenaRound();
    this.phase = 'playing';
    this.titleOverlay.style.display = 'none';
    this.arenaOverlay.style.display = 'none';
    this.draftOverlay.style.display = 'none';
    this.summaryOverlay.style.display = 'none';
    this.fkButton.style.display = 'none';
    sfx.screech();

    if (broadcast && arenaMode === 'arena_online' && this.isCoopActive()) {
      this.roomPeer.send('pvp_start', {
        type: 'pvp_start',
        seed: this.runSeed,
        round: this.arenaRound,
        scores: this.arenaOnlineScores,
      });
    }
  }

  private setupArenaRound(): void {
    this.room = generateArenaRoom(this.runSeed + this.arenaRound * 97);
    this.roomIndex = 0;
    this.roomCleared = false;
    this.boomerangs = [];
    this.peelBombs = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.pickups = [];

    const p1Name = this.mode === 'arena_local' ? 'Macaco P1' : this.roomPeer.localPlayer.name;
    const p1Color = this.mode === 'arena_local' ? '#facc15' : this.roomPeer.localPlayer.color;
    this.p1Ctrl = this.createController(this.roomPeer.localPlayer.id, p1Name, p1Color);
    this.p1Ctrl.player.x = 200;
    this.p1Ctrl.player.y = 540;
    this.p1Ctrl.player.facing = 1;
    this.p1Ctrl.player.invulnTimer = 1.1;

    if (this.mode === 'arena_local' || this.mode === 'arena_bot') {
      const p2Name = this.mode === 'arena_bot' ? '🤖 Bot Chimp' : 'Macaco P2';
      this.p2Ctrl = this.createController('local_p2', p2Name, '#4ade80', false);
      this.p2Ctrl.player.x = this.room.width - 234;
      this.p2Ctrl.player.y = 540;
      this.p2Ctrl.player.facing = -1;
      this.p2Ctrl.player.invulnTimer = 1.1;
    } else {
      this.p2Ctrl = null;
      // Spread spawn by player index in online roster
      const idx = Math.max(0, this.playersRoster.findIndex((p) => p.id === this.roomPeer.localPlayer.id));
      const spawns = [180, this.room.width - 220, 460, this.room.width - 500];
      this.p1Ctrl.player.x = spawns[idx % spawns.length];
      this.p1Ctrl.player.facing = idx % 2 === 0 ? 1 : -1;
    }

    this.arenaCountdown = 1.5;
    this.arenaBannerText = '';
    this.arenaRoundResetTimer = 0;
    this.camX = Math.max(0, (this.room.width - this.viewW) / 2);
    this.camY = Math.max(0, (this.room.height - this.viewH) / 2);
  }

  private loadRoom(index: number, healBetweenRooms: boolean): void {
    this.roomIndex = index;
    const pCount = Math.max(1, this.playersRoster.length);
    this.room = generateRoom(index, this.runSeed, pCount);
    this.roomCleared = false;
    this.portalReady = false;
    this.portalCountdown = null;
    this.enemyTargets.clear();
    this.boomerangs = [];
    this.peelBombs = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.pickups = [];

    this.local.x = this.room.spawnX;
    this.local.y = this.room.spawnY;
    this.local.vx = 0;
    this.local.vy = 0;
    this.local.invulnTimer = 1.0;
    if (healBetweenRooms && this.local.downed) {
      this.local.downed = false;
      this.local.hp = Math.max(2, Math.floor(this.local.maxHp / 2));
    }

    this.camX = Math.max(0, this.local.x - this.viewW / 2);
    this.camY = Math.max(0, this.local.y - this.viewH / 2);
  }

  private hasUpgrade(id: UpgradeId): boolean {
    return this.upgrades.includes(id);
  }

  private openUpgradeDraft(nextRoomIndex: number): void {
    this.phase = 'draft';
    this.loadRoom(nextRoomIndex, true);

    const available = UPGRADES.filter((u) => !this.upgrades.includes(u.id));
    const pool = available.length >= 3 ? [...available] : [...UPGRADES];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.draftChoices = pool.slice(0, 3);
    this.renderDraftCards();
    this.draftOverlay.style.display = 'flex';
  }

  private pickUpgrade(idx: number): void {
    const choice = this.draftChoices[idx];
    if (!choice || this.phase !== 'draft') return;
    if (!this.upgrades.includes(choice.id)) {
      this.upgrades.push(choice.id);
    }
    if (choice.id === 'acai_heart') {
      this.local.maxHp += 2;
      this.local.hp = this.local.maxHp;
    } else {
      this.local.potassium = Math.min(100, this.local.potassium + 25);
    }
    sfx.pickup();
    this.draftOverlay.style.display = 'none';
    this.phase = 'playing';
    this.local.invulnTimer = 1.4;
    this.addFloatingText(this.local.x + 17, this.local.y - 20, `${choice.emoji} ${choice.title}!`, choice.color, 16);
  }

  private finishRun(victory: boolean, broadcastVictory = true): void {
    if (this.phase === 'summary') return;
    this.phase = 'summary';

    if (victory && broadcastVictory && this.isCoopActive()) {
      this.roomPeer.send('run_victory', { type: 'run_victory' });
    }

    const timeBonus = victory ? Math.max(0, Math.round(1800 - this.runTime * 6)) : 0;
    const cltMult = this.hasUpgrade('clt_bonus') ? 1.25 : 1;
    // NOTE: this.score already includes banana pickup points (+15 each), no double-counting!
    const finalScore = Math.round(
      (this.score + (victory ? 2500 : this.roomIndex * 250) + timeBonus) * cltMult,
    );
    this.score = finalScore;

    if (!this.scoreReported) {
      this.scoreReported = true;
      reportGameScore('monkey-cells', finalScore, {
        room: this.roomIndex + 1,
        kills: this.kills,
        bananas: this.bananas,
        victory: victory ? 1 : 0,
      });
    }

    if (victory) {
      sfx.victory();
    } else {
      sfx.screech();
    }

    const causeText = victory
      ? '🏆 Você derrotou o Gorilão CEO da Faria Lima e estatizou todas as bananas!'
      : `💀 ${DEATH_QUIPS[this.lastDamager] || DEATH_QUIPS.unknown}`;

    const mins = Math.floor(this.runTime / 60);
    const secs = Math.floor(this.runTime % 60)
      .toString()
      .padStart(2, '0');

    this.summaryOverlay.innerHTML = `
      <div style="background:rgba(15,23,42,0.96);border:3px solid ${victory ? '#4ade80' : '#fb7185'};border-radius:18px;padding:26px 30px;max-width:520px;width:92%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.75);pointer-events:auto;">
        <div style="font-size:42px;margin-bottom:6px;">${victory ? '👑🐒🍌' : '💀🥥🍌'}</div>
        <h2 style="margin:0 0 8px;font-size:26px;color:${victory ? '#fef08a' : '#fecdd3'};font-weight:900;">
          ${victory ? 'VITÓRIA MACACA ABSOLUTA!' : 'FIM DE EXPEDIENTE!'}
        </h2>
        <p style="margin:0 0 18px;font-size:14px;color:#e2e8f0;line-height:1.45;">${causeText}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left;background:#1e293b;padding:14px;border-radius:12px;margin-bottom:18px;font-size:13px;">
          <div>🏆 <b>Pontuação:</b> <span style="color:#facc15;">${finalScore}</span></div>
          <div>⏱️ <b>Tempo:</b> ${mins}:${secs}</div>
          <div>🚪 <b>Sala:</b> ${this.roomIndex + 1} / 5</div>
          <div>☠️ <b>Inimigos:</b> ${this.kills}</div>
          <div>🍌 <b>Bananas:</b> ${this.bananas}</div>
          <div>⚔️ <b>Arma:</b> ${WEAPONS[this.local.weapon].shortName}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="mc-restart-btn" style="flex:1;background:#facc15;color:#0f172a;border:none;border-radius:12px;padding:12px 18px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #ca8a04;">
            🔄 Nova Run (R / Enter)
          </button>
          <button id="mc-menu-btn" style="background:#334155;color:#f8fafc;border:2px solid #475569;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:800;cursor:pointer;">
            🏠 Menu
          </button>
        </div>
      </div>
    `;
    this.summaryOverlay.style.display = 'flex';
    this.summaryOverlay.querySelector<HTMLButtonElement>('#mc-restart-btn')!.onclick = () => {
      sfx.click();
      this.startNewRun();
    };
    this.summaryOverlay.querySelector<HTMLButtonElement>('#mc-menu-btn')!.onclick = () => {
      sfx.click();
      this.returnToTitle();
    };
  }

  private finishArenaSummary(winnerName: string, _isOnline: boolean): void {
    if (this.phase === 'summary') return;
    this.phase = 'summary';
    sfx.victory();

    const scoreLine =
      this.mode === 'arena_online'
        ? 'Vitória na Arena P2P Online!'
        : `Placar Final: ${this.arenaP1Score} × ${this.arenaP2Score}`;

    this.summaryOverlay.innerHTML = `
      <div style="background:rgba(15,23,42,0.96);border:3px solid #facc15;border-radius:18px;padding:26px 30px;max-width:500px;width:92%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.75);pointer-events:auto;">
        <div style="font-size:44px;margin-bottom:6px;">🥊👑🐒</div>
        <h2 style="margin:0 0 8px;font-size:26px;color:#fef08a;font-weight:900;">
          CAMPEÃO DA ARENA: ${winnerName}!
        </h2>
        <p style="margin:0 0 16px;font-size:15px;color:#4ade80;font-weight:800;">${scoreLine}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:#1e293b;padding:12px;border-radius:12px;margin-bottom:18px;font-size:13px;">
          <div>🦘 <b>Pogos:</b> ${this.arenaStats.pogos}</div>
          <div>⚡ <b>Parries:</b> ${this.arenaStats.parries}</div>
          <div>💥 <b>Críticos:</b> ${this.arenaStats.crits}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button id="mc-rematch-btn" style="flex:1;background:#facc15;color:#0f172a;border:none;border-radius:12px;padding:12px 18px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #ca8a04;">
            🥊 Revanche (R / Enter)
          </button>
          <button id="mc-menu-btn" style="background:#334155;color:#f8fafc;border:2px solid #475569;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:800;cursor:pointer;">
            🏠 Menu
          </button>
        </div>
      </div>
    `;
    this.summaryOverlay.style.display = 'flex';
    this.summaryOverlay.querySelector<HTMLButtonElement>('#mc-rematch-btn')!.onclick = () => {
      sfx.click();
      this.startArenaMatch(this.mode === 'dungeon' ? 'arena_local' : this.mode);
    };
    this.summaryOverlay.querySelector<HTMLButtonElement>('#mc-menu-btn')!.onclick = () => {
      sfx.click();
      this.returnToTitle();
    };
  }

  private returnToTitle(): void {
    this.phase = 'title';
    this.mode = 'dungeon';
    this.p2Ctrl = null;
    this.summaryOverlay.style.display = 'none';
    this.draftOverlay.style.display = 'none';
    this.arenaOverlay.style.display = 'none';
    this.titleOverlay.style.display = 'flex';
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.033, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.globalTime += dt;

    if (this.phase === 'playing') {
      this.update(dt);
    } else if (this.phase === 'draft') {
      // Still sync player_state so Host knows we are in draft!
      this.syncNetwork(dt);
      this.updateParticlesAndText(dt);
    } else if (this.phase === 'title') {
      this.updateParticlesAndText(dt);
    }

    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.runTime += dt;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateCameraAndShake(dt);
      this.updateParticlesAndText(dt);
      return;
    }

    // Smoothly interpolate remote teammates
    for (const rp of this.remotes.values()) {
      rp.x += rp.vx * dt * 0.65;
      rp.y += rp.vy * dt * 0.65;
      rp.x += (rp.targetX - rp.x) * Math.min(1, dt * 15);
      rp.y += (rp.targetY - rp.y) * Math.min(1, dt * 15);
      if (rp.swingTimer > 0) rp.swingTimer = Math.max(0, rp.swingTimer - dt);
      if (rp.hitFlash > 0) rp.hitFlash = Math.max(0, rp.hitFlash - dt);
    }

    if (this.mode !== 'dungeon') {
      this.updateArenaMode(dt);
      return;
    }

    // Check if any teammate is still in Draft
    if (this.isHostAuthority()) {
      const remoteInDraft = Array.from(this.remotes.values()).some(
        (r) => r.roomIndex === this.roomIndex && r.inDraft,
      );
      this.enemiesFrozen = remoteInDraft;
    }

    // P1 Dungeon Update
    this.updateControlledPlayer(this.p1Ctrl, dt, this.readP1Input());
    this.updateBoomerangs(dt);
    this.updatePeelBombs(dt);

    if (this.isHostAuthority()) {
      if (!this.enemiesFrozen) {
        this.updateEnemies(dt);
        this.updateProjectiles(dt);
        this.updateTelegraphs(dt);
      }
      const alive = this.room.enemies.some((e) => e.hp > 0);
      if (!alive && !this.roomCleared) {
        this.roomCleared = true;
        sfx.victory();
        this.hud.toast(
          this.room.isBossRoom
            ? '👑 GORILÃO DERROTADO! Entre no Portal para celebrar!'
            : '✅ Sala limpa! Vá para o Portal à direita!',
          'banana',
        );
      }
    } else {
      for (const e of this.room.enemies) {
        if (e.hitFlash > 0) e.hitFlash -= dt;
        const tgt = this.enemyTargets.get(e.id);
        if (tgt) {
          e.x += (tgt.x - e.x) * Math.min(1, dt * 16);
          e.y += (tgt.y - e.y) * Math.min(1, dt * 16);
        }
      }
      // Smoothly move projectiles & check local damage on Guests!
      this.updateGuestProjectiles(dt);
      if (!this.enemiesFrozen) {
        this.updateGuestEnemyContactDamage();
      }
    }

    // Co-op Portal Countdown
    if (this.portalCountdown && this.roomCleared && this.isCoopActive()) {
      this.portalCountdown.timer -= dt;
      // Check if all alive teammates in this room are near portal or ready
      const px = this.local.x + 17;
      const py = this.local.y + 23;
      const localAtPortal =
        this.local.downed ||
        this.portalReady ||
        Math.hypot(px - this.room.portalX, py - (this.room.portalY + 36)) < 84;
      const allOthersAtPortal = Array.from(this.remotes.values()).every(
        (r) =>
          r.downed ||
          r.roomIndex !== this.roomIndex ||
          r.portalReady ||
          Math.hypot(r.x + 17 - this.room.portalX, r.y + 23 - (this.room.portalY + 36)) < 88,
      );

      if ((localAtPortal && allOthersAtPortal) || this.portalCountdown.timer <= 0) {
        this.portalCountdown = null;
        this.advanceFromPortal();
      }
    }

    this.updatePickups(dt);
    this.updateParticlesAndText(dt);
    this.updateCameraAndShake(dt);
    this.syncNetwork(dt);

    if (this.local.downed) {
      if (!this.isCoopActive()) {
        this.finishRun(false);
      } else {
        const anyAliveRemote = Array.from(this.remotes.values()).some((r) => !r.downed);
        if (!anyAliveRemote || this.local.reviveTimer <= 0) {
          this.lastDamager = 'bleedout';
          this.finishRun(false);
        }
      }
    }
  }

  private updateArenaMode(dt: number): void {
    // Round reset pause after KO
    if (this.arenaRoundResetTimer > 0) {
      this.arenaRoundResetTimer -= dt;
      this.updateParticlesAndText(dt);
      this.updateCameraAndShake(dt);
      this.syncNetwork(dt);
      if (this.arenaRoundResetTimer <= 0) {
        this.setupArenaRound();
      }
      return;
    }

    // Countdown before round starts
    if (this.arenaCountdown > 0) {
      const prevCeil = Math.ceil(this.arenaCountdown);
      this.arenaCountdown -= dt;
      const nextCeil = Math.ceil(this.arenaCountdown);
      if (nextCeil !== prevCeil && nextCeil > 0) {
        sfx.countdown(false);
      }
      if (this.arenaCountdown <= 0) {
        this.arenaCountdown = 0;
        sfx.countdown(true);
        this.arenaBannerText = '🥊 VALENDO!';
        window.setTimeout(() => {
          if (this.arenaBannerText === '🥊 VALENDO!') this.arenaBannerText = '';
        }, 700);
      }
      this.updateParticlesAndText(dt);
      this.updateCameraAndShake(dt);
      this.syncNetwork(dt);
      return;
    }

    // Periodically spawn a fresh weapon chest in Arena center!
    this.arenaChestTimer -= dt;
    if (this.arenaChestTimer <= 0 && (this.mode !== 'arena_online' || this.isHostAuthority())) {
      this.arenaChestTimer = 14;
      const nextW = WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)];
      const chestId = `ac_${Math.floor(this.globalTime * 100)}`;
      const cx = this.room.width / 2 - 21;
      const cy = 635 - 275 - 34;
      if (this.room.chests.length < 4) {
        this.room.chests.push({ id: chestId, x: cx, y: cy, weaponId: nextW, opened: false });
        this.spawnBurst(cx + 21, cy + 12, '#facc15', 14);
        if (this.mode === 'arena_online' && this.isCoopActive()) {
          this.roomPeer.send('pvp_chest_spawn', {
            type: 'pvp_chest_spawn',
            id: chestId,
            x: cx,
            y: cy,
            weaponId: nextW,
          });
        }
      }
    }

    // Update P1
    this.updateControlledPlayer(this.p1Ctrl, dt, this.readP1Input());

    // Update P2 (Local 2P or Bot)
    if (this.p2Ctrl) {
      const p2Input =
        this.mode === 'arena_bot' ? this.computeArenaBotInput(dt) : this.readP2Input();
      this.updateControlledPlayer(this.p2Ctrl, dt, p2Input);
    }

    this.updateBoomerangs(dt);
    this.updatePeelBombs(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateParticlesAndText(dt);
    this.updateCameraAndShake(dt);
    this.syncNetwork(dt);
  }

  private readP1Input(): {
    left: boolean;
    right: boolean;
    down: boolean;
    up: boolean;
    heal: boolean;
  } {
    if (this.mode === 'arena_local') {
      return {
        left: this.keys.has('KeyA'),
        right: this.keys.has('KeyD'),
        down: this.keys.has('KeyS'),
        up: this.keys.has('KeyW'),
        heal: this.keys.has('KeyQ'),
      };
    }
    return {
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      down: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      up: this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.keys.has('KeyI'),
      heal: this.keys.has('KeyQ') || this.keys.has('KeyF'),
    };
  }

  private readP2Input(): {
    left: boolean;
    right: boolean;
    down: boolean;
    up: boolean;
    heal: boolean;
  } {
    return {
      left: this.keys.has('ArrowLeft'),
      right: this.keys.has('ArrowRight'),
      down: this.keys.has('ArrowDown'),
      up: this.keys.has('ArrowUp'),
      heal: this.keys.has('KeyM') || this.keys.has('ShiftRight'),
    };
  }

  private computeArenaBotInput(dt: number): {
    left: boolean;
    right: boolean;
    down: boolean;
    up: boolean;
    heal: boolean;
  } {
    const bot = this.p2Ctrl!;
    const bp = bot.player;
    const tp = this.local;
    const dx = tp.x - bp.x;
    const dy = tp.y - bp.y;
    const dist = Math.hypot(dx, dy);

    this.arenaBotDecisionTimer -= dt;
    if (this.arenaBotDecisionTimer <= 0) {
      this.arenaBotDecisionTimer = 0.14;
      if (bp.hp <= 2 && bp.potassium >= 33 && dist > 180 && bot.grounded) {
        this.arenaBotMoveDir = 0;
      } else if (Math.abs(dx) > 46) {
        this.arenaBotMoveDir = dx > 0 ? 1 : -1;
      } else {
        this.arenaBotMoveDir = 0;
      }

      // Jump onto platforms or over center spike pit
      const nearCenterSpikes = Math.abs(bp.x + 17 - this.room.width / 2) < 95 && bp.y > 540;
      if ((dy < -65 || nearCenterSpikes || Math.random() < 0.16) && (bot.grounded || bot.jumpsLeft > 0)) {
        bot.jumpBufferTimer = 0.12;
      }
      // Dash toward/away
      if (bot.dashCooldown <= 0 && ((dist > 220 && Math.random() < 0.25) || (tp.swingTimer > 0 && dist < 95 && Math.random() < 0.5))) {
        this.performDash(bot);
      }
      // Attack or Pogo!
      if (bot.attackCooldown <= 0 && dist < 110) {
        if (!bot.grounded && dy > 24 && Math.abs(dx) < 60) {
          this.performAttack(bot, 'down');
        } else {
          bp.facing = dx >= 0 ? 1 : -1;
          this.performAttack(bot, bp.facing > 0 ? 'right' : 'left');
        }
      }
    }

    const shouldHeal = bp.hp <= 2 && bp.potassium >= 33 && dist > 180 && bot.grounded;
    return {
      left: this.arenaBotMoveDir < 0,
      right: this.arenaBotMoveDir > 0,
      down: !bot.grounded && dy > 24,
      up: false,
      heal: shouldHeal,
    };
  }

  private updateControlledPlayer(
    ctrl: PlayerController,
    dt: number,
    inp: { left: boolean; right: boolean; down: boolean; up: boolean; heal: boolean },
  ): void {
    const p = ctrl.player;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (ctrl.dashCooldown > 0) ctrl.dashCooldown -= dt;
    if (ctrl.attackCooldown > 0) ctrl.attackCooldown -= dt;
    if (ctrl.dropThroughTimer > 0) ctrl.dropThroughTimer -= dt;
    if (ctrl.jumpBufferTimer > 0) ctrl.jumpBufferTimer -= dt;
    if (ctrl.wallJumpLockTimer > 0) ctrl.wallJumpLockTimer -= dt;
    if (ctrl.pogoGraceTimer > 0) ctrl.pogoGraceTimer -= dt;

    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].alpha -= dt * 5;
      if (p.afterimages[i].alpha <= 0) p.afterimages.splice(i, 1);
    }

    if (p.downed) {
      p.reviveTimer -= dt;
      p.vx *= 0.85;
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
      this.moveAndCollide(ctrl, dt, false);
      return;
    }

    const moveDir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

    // Drop through ONLY when standing on a one-way platform!
    if (inp.down && ctrl.grounded && ctrl.standingOnOneWay && ctrl.jumpBufferTimer > 0) {
      ctrl.dropThroughTimer = 0.22;
      ctrl.grounded = false;
      ctrl.standingOnOneWay = false;
      ctrl.jumpBufferTimer = 0;
    }

    // Potassium Healing
    if (
      inp.heal &&
      ctrl.grounded &&
      p.dashTimer <= 0 &&
      p.swingTimer <= 0 &&
      p.potassium >= 33 &&
      p.hp < p.maxHp &&
      moveDir === 0
    ) {
      p.healing = true;
      const healDuration = ctrl.isLocalMain && this.hasUpgrade('potassium_turbo') ? 0.34 : 0.62;
      p.healProgress += dt / healDuration;
      if (Math.random() < 0.35) {
        this.spawnParticle(p.x + p.w / 2 + (Math.random() - 0.5) * 32, p.y + p.h, 0, -90, '#fde047', 4, 0.4);
      }
      if (p.healProgress >= 1) {
        p.healProgress = 0;
        p.healing = false;
        p.potassium = Math.max(0, p.potassium - 33);
        p.hp = Math.min(p.maxHp, p.hp + 1);
        sfx.heal();
        this.spawnRing(p.x + p.w / 2, p.y + p.h / 2, '#4ade80', 30);
        this.addFloatingText(p.x + p.w / 2, p.y - 12, '+1 ❤️ POTÁSSIO!', '#4ade80', 15);
      }
    } else {
      p.healing = false;
      p.healProgress = 0;
    }

    // Dash / Roll
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vy = 0;
      p.vx = p.facing * DASH_SPEED;
      if (Math.random() < 0.65) {
        p.afterimages.push({ x: p.x, y: p.y, facing: p.facing, alpha: 0.9 });
      }
    } else if (!p.healing) {
      if (moveDir !== 0 && ctrl.wallJumpLockTimer <= 0) {
        p.facing = moveDir > 0 ? 1 : -1;
        p.vx += moveDir * MOVE_ACCEL * dt;
        if (Math.abs(p.vx) > MAX_SPEED) {
          p.vx = Math.sign(p.vx) * MAX_SPEED;
        }
      } else if (moveDir === 0 && ctrl.wallJumpLockTimer <= 0) {
        const decel = (ctrl.grounded ? 2600 : 1400) * dt;
        if (Math.abs(p.vx) <= decel) p.vx = 0;
        else p.vx -= Math.sign(p.vx) * decel;
      }

      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    } else {
      p.vx = 0;
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    }

    const wallHit = this.moveAndCollide(ctrl, dt, ctrl.dropThroughTimer > 0);

    // Wall-slide check
    p.wallSlideDir = 0;
    if (!ctrl.grounded && wallHit !== 0 && p.vy > 0 && moveDir === wallHit) {
      p.wallSlideDir = wallHit;
      p.vy = Math.min(p.vy, WALL_SLIDE_SPEED);
      if (Math.random() < 0.3) {
        this.spawnParticle(
          wallHit > 0 ? p.x + p.w : p.x,
          p.y + p.h * 0.6,
          -wallHit * 30,
          -20,
          '#cbd5e1',
          4,
          0.3,
        );
      }
    }

    if (ctrl.grounded) {
      ctrl.coyoteTimer = 0.11;
      ctrl.jumpsLeft = 2;
    } else {
      ctrl.coyoteTimer = Math.max(0, ctrl.coyoteTimer - dt);
    }

    // Jump execution
    if (ctrl.jumpBufferTimer > 0 && !p.healing && ctrl.dropThroughTimer <= 0) {
      if (ctrl.coyoteTimer > 0) {
        p.vy = JUMP_VEL;
        ctrl.grounded = false;
        ctrl.standingOnOneWay = false;
        ctrl.coyoteTimer = 0;
        ctrl.jumpsLeft = 1;
        ctrl.jumpBufferTimer = 0;
        ctrl.activeJumpFromButton = true;
        sfx.jump(false);
        this.spawnBurst(p.x + p.w / 2, p.y + p.h, '#cbd5e1', 5);
      } else if (p.wallSlideDir !== 0 || wallHit !== 0) {
        const kickDir = p.wallSlideDir !== 0 ? -p.wallSlideDir : -wallHit;
        p.vx = kickDir * 440;
        p.vy = JUMP_VEL * 0.96;
        p.facing = kickDir > 0 ? 1 : -1;
        ctrl.jumpsLeft = 1;
        ctrl.jumpBufferTimer = 0;
        ctrl.wallJumpLockTimer = 0.13;
        ctrl.activeJumpFromButton = false; // Do not cut wall-jump arc!
        sfx.jump(true);
        this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#4ade80', 7);
      } else if (ctrl.jumpsLeft > 0) {
        p.vy = DOUBLE_JUMP_VEL;
        ctrl.jumpsLeft--;
        ctrl.jumpBufferTimer = 0;
        ctrl.activeJumpFromButton = true;
        sfx.jump(true);
        this.spawnRing(p.x + p.w / 2, p.y + p.h, '#4ade80', 18);
      }
    }

    // Active Swing Hitbox
    if (p.swingTimer > 0) {
      p.swingTimer -= dt;
      this.checkSwingHits(ctrl);
    }

    // Spike Damage check (respects pogoGraceTimer & tighter inner spike hurtbox)
    if (ctrl.pogoGraceTimer <= 0 && p.invulnTimer <= 0) {
      for (const sp of this.room.spikes) {
        if (this.aabb(p.x + 5, p.y + 6, p.w - 10, p.h - 6, sp.x + 4, sp.y + 6, sp.w - 8, sp.h - 6)) {
          if (this.mode !== 'dungeon') {
            this.applyArenaDamage(
              ctrl,
              1,
              p.x + p.w / 2 < sp.x + sp.w / 2 ? -280 : 280,
              -430,
              false,
              false,
              'spike',
            );
          } else if (ctrl.isLocalMain) {
            this.damageLocalPlayer(1, p.x + p.w / 2 < sp.x + sp.w / 2 ? -260 : 260, -420, 'spike');
          }
          break;
        }
      }
    }
  }

  private moveAndCollide(ctrl: PlayerController, dt: number, ignoreOneWay: boolean): -1 | 0 | 1 {
    const ent = ctrl.player;
    let wallHit: -1 | 0 | 1 = 0;

    ent.x += ent.vx * dt;
    for (const plat of this.room.platforms) {
      if (plat.oneWay) continue;
      if (this.aabb(ent.x, ent.y, ent.w, ent.h, plat.x, plat.y, plat.w, plat.h)) {
        if (ent.vx > 0) {
          ent.x = plat.x - ent.w;
          ent.vx = 0;
          wallHit = 1;
        } else if (ent.vx < 0) {
          ent.x = plat.x + plat.w;
          ent.vx = 0;
          wallHit = -1;
        }
      }
    }
    if (wallHit === 0) {
      for (const plat of this.room.platforms) {
        if (plat.oneWay) continue;
        if (ent.y + ent.h > plat.y + 4 && ent.y < plat.y + plat.h - 4) {
          if (Math.abs(ent.x + ent.w - plat.x) <= 3) wallHit = 1;
          else if (Math.abs(ent.x - (plat.x + plat.w)) <= 3) wallHit = -1;
        }
      }
    }

    const prevBottom = ent.y + ent.h;
    ent.y += ent.vy * dt;
    ctrl.grounded = false;
    ctrl.standingOnOneWay = false;

    for (const plat of this.room.platforms) {
      if (plat.oneWay) {
        if (ignoreOneWay || ent.vy < 0) continue;
        if (
          prevBottom <= plat.y + 8 &&
          this.aabb(ent.x, ent.y, ent.w, ent.h, plat.x, plat.y, plat.w, plat.h)
        ) {
          ent.y = plat.y - ent.h;
          ent.vy = 0;
          ctrl.grounded = true;
          ctrl.standingOnOneWay = true;
        }
      } else if (this.aabb(ent.x, ent.y, ent.w, ent.h, plat.x, plat.y, plat.w, plat.h)) {
        if (ent.vy > 0) {
          ent.y = plat.y - ent.h;
          ent.vy = 0;
          ctrl.grounded = true;
          ctrl.standingOnOneWay = false;
        } else if (ent.vy < 0) {
          ent.y = plat.y + plat.h;
          ent.vy = 0;
        }
      }
    }

    return wallHit;
  }

  private performDash(ctrl: PlayerController): void {
    const p = ctrl.player;
    if (this.phase !== 'playing' || p.downed || ctrl.dashCooldown > 0 || p.dashTimer > 0) return;
    if (this.mode !== 'dungeon' && this.arenaCountdown > 0) return;

    const cdMult = ctrl.isLocalMain && this.hasUpgrade('wind_cape') ? 0.7 : 1;
    p.dashTimer = DASH_TIME;
    p.invulnTimer = Math.max(p.invulnTimer, DASH_TIME + 0.06);
    ctrl.dashCooldown = 0.54 * cdMult;
    p.healing = false;
    sfx.dash();
    this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#38bdf8', 8);

    if (ctrl.isLocalMain && this.hasUpgrade('explosive_peel')) {
      const bombId = `pb_${Math.random()}`;
      const bx = p.x + p.w / 2;
      const by = p.y + p.h - 10;
      this.peelBombs.push({
        id: bombId,
        ownerId: ctrl.ownerId,
        x: bx,
        y: by,
        vy: -120,
        fuse: 0.75,
        exploded: false,
      });
      if (this.isCoopActive()) {
        this.roomPeer.send('peel_bomb', { type: 'peel_bomb', id: bombId, x: bx, y: by });
      }
    }
  }

  private performAttack(ctrl: PlayerController, overrideDir?: SwingDir): void {
    const p = ctrl.player;
    if (this.phase !== 'playing' || p.downed || ctrl.attackCooldown > 0) return;
    if (this.mode !== 'dungeon' && this.arenaCountdown > 0) return;

    const wDef = WEAPONS[p.weapon];
    const spdMult = ctrl.isLocalMain && this.hasUpgrade('wind_cape') ? 0.82 : 1;
    ctrl.attackCooldown = wDef.cooldown * spdMult;
    p.healing = false;

    const isP2 = ctrl === this.p2Ctrl;
    const downHeld = isP2
      ? this.keys.has('ArrowDown')
      : this.keys.has('KeyS') || (this.mode !== 'arena_local' && this.keys.has('ArrowDown'));
    const upHeld = isP2
      ? this.keys.has('ArrowUp')
      : this.keys.has('KeyW') || this.keys.has('KeyI') || (this.mode !== 'arena_local' && this.keys.has('ArrowUp'));

    let dir: SwingDir = overrideDir ?? (p.facing > 0 ? 'right' : 'left');
    if (!overrideDir) {
      if (downHeld && !ctrl.grounded) {
        dir = 'down';
      } else if (
        upHeld &&
        (this.keys.has('KeyI') || this.globalTime - ctrl.lastWJumpTime > 0.22 || !ctrl.activeJumpFromButton)
      ) {
        dir = 'up';
      }
    }

    p.swingDir = dir;
    p.swingMax = 0.16;
    p.swingTimer = 0.16;
    ctrl.lastAttackHitIds.clear();

    if (p.weapon === 'frying_pan') {
      sfx.panClang(false);
    } else if (p.weapon === 'electric_broom') {
      sfx.electric();
    } else if (p.weapon === 'banana_bazooka') {
      sfx.bazooka();
    } else {
      sfx.slash(dir === 'down' ? 1.25 : 1);
    }

    // Boomerang throw
    if (wDef.isBoomerang && dir !== 'down') {
      this.spawnBoomerang(ctrl.ownerId, p.x + p.w / 2, p.y + p.h / 2 - 4, dir, true, 0);
      if (ctrl.isLocalMain && this.hasUpgrade('boomerang_multishot')) {
        this.spawnBoomerang(ctrl.ownerId, p.x + p.w / 2, p.y + p.h / 2 - 4, dir, true, 160);
      }
    }

    // Banana Bazooka rocket!
    if (wDef.isBazooka) {
      this.spawnBazookaRocket(ctrl.ownerId, p.x + p.w / 2, p.y + p.h / 2 - 2, dir, 0, wDef.damage);
      if (ctrl.isLocalMain && this.hasUpgrade('boomerang_multishot')) {
        this.spawnBazookaRocket(ctrl.ownerId, p.x + p.w / 2, p.y + p.h / 2 - 2, dir, -110, Math.round(wDef.damage * 0.65));
      }
      if (dir === 'down' && !ctrl.grounded) {
        // Rocket-Pogo self impulse!
        const springMult = ctrl.isLocalMain && this.hasUpgrade('pogo_spring') ? 1.13 : 1;
        p.vy = -515 * wDef.pogoBoost * springMult * 0.9;
        ctrl.jumpsLeft = Math.max(1, ctrl.jumpsLeft);
        ctrl.activeJumpFromButton = false;
        ctrl.pogoGraceTimer = 0.1;
      }
    }

    if (ctrl.isLocalMain && this.isCoopActive()) {
      this.roomPeer.send('player_attack', {
        type: 'player_attack',
        dir,
        weapon: p.weapon,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
      });
    }

    this.checkSwingHits(ctrl);
  }

  private getSwingHitbox(ctrl: PlayerController): { x: number; y: number; w: number; h: number } {
    const p = ctrl.player;
    const wDef = WEAPONS[p.weapon];
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    if (p.swingDir === 'down') {
      return { x: cx - wDef.rangeY * 0.65, y: cy + 4, w: wDef.rangeY * 1.3, h: wDef.rangeX * 0.92 };
    }
    if (p.swingDir === 'up') {
      return { x: cx - wDef.rangeY * 0.65, y: cy - wDef.rangeX * 0.95, w: wDef.rangeY * 1.3, h: wDef.rangeX * 0.95 };
    }
    if (p.swingDir === 'right') {
      return { x: cx + 2, y: cy - wDef.rangeY * 0.65, w: wDef.rangeX, h: wDef.rangeY * 1.3 };
    }
    return { x: cx - 2 - wDef.rangeX, y: cy - wDef.rangeY * 0.65, w: wDef.rangeX, h: wDef.rangeY * 1.3 };
  }

  private checkSwingHits(ctrl: PlayerController): void {
    const p = ctrl.player;
    const wDef = WEAPONS[p.weapon];
    const box = this.getSwingHitbox(ctrl);
    const isPogo = p.swingDir === 'down';
    let bouncedPogo = false;
    const isRangedOnlyForward = (wDef.isBoomerang || wDef.isBazooka) && !isPogo;

    // 1. PARRY / REBATER PROJÉTIL!
    for (const pr of this.projectiles) {
      if (pr.reflected || pr.kind === 'shockwave' || pr.ownerId === ctrl.ownerId) continue;
      if (ctrl.lastAttackHitIds.has(`parry_${pr.id}`)) continue;
      if (
        this.aabb(
          box.x - 8,
          box.y - 8,
          box.w + 16,
          box.h + 16,
          pr.x - pr.radius - 6,
          pr.y - pr.radius - 6,
          pr.radius * 2 + 12,
          pr.radius * 2 + 12,
        )
      ) {
        ctrl.lastAttackHitIds.add(`parry_${pr.id}`);
        this.parryProjectile(ctrl, pr);
        if (isPogo) bouncedPogo = true;
      }
    }

    // 2. Pogo off Spikes!
    if (isPogo && !ctrl.lastAttackHitIds.has('spike_pogo')) {
      for (const sp of this.room.spikes) {
        if (this.aabb(box.x, box.y, box.w, box.h, sp.x, sp.y - 6, sp.w, sp.h + 6)) {
          ctrl.lastAttackHitIds.add('spike_pogo');
          bouncedPogo = true;
          this.spawnBurst(p.x + p.w / 2, sp.y, '#fef08a', 8);
          break;
        }
      }
    }

    // 3. Hit Banana Crates
    for (const cr of this.room.crates) {
      if (cr.broken || ctrl.lastAttackHitIds.has(cr.id)) continue;
      if (this.aabb(box.x, box.y, box.w, box.h, cr.x, cr.y, cr.w, cr.h)) {
        ctrl.lastAttackHitIds.add(cr.id);
        cr.broken = true;
        sfx.hit();
        this.spawnBurst(cr.x + 18, cr.y + 18, '#b45309', 12);
        this.spawnBananaPickup(cr.x + 18, cr.y + 10, 2);
        if (isPogo) bouncedPogo = true;
        if (ctrl.isLocalMain && this.isCoopActive()) {
          this.roomPeer.send('crate_break', { type: 'crate_break', crateId: cr.id });
        }
      }
    }

    // 4. Hit Enemies & Bosses (skip melee enemy hit on forward Boomerang/Bazooka to prevent double-hit!)
    if (!isRangedOnlyForward) {
      for (const e of this.room.enemies) {
        if (e.hp <= 0 || ctrl.lastAttackHitIds.has(e.id)) continue;
        if (this.aabb(box.x, box.y, box.w, box.h, e.x, e.y, e.w, e.h)) {
          ctrl.lastAttackHitIds.add(e.id);
          const kbDir: 1 | -1 = p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1;
          this.resolveHitOnEnemy(e, {
            dmg: wDef.damage,
            attackerX: p.x + p.w / 2,
            knockback: wDef.knockback,
            isPogo,
            canAirCrit: wDef.airCritMultiplier > 1.2,
            airCritMult: wDef.airCritMultiplier,
            isPan: p.weapon === 'frying_pan',
            isElectric: wDef.isElectric,
            stun: wDef.isElectric ? (e.kind === 'gorilla_ceo' || e.kind === 'hr_baboon' ? 0.25 : 0.65) : 0,
            kbDirOverride: kbDir,
          });
          this.onCtrlHitLanded(ctrl, e.x + e.w / 2, e.y + e.h / 2);
          if (isPogo) bouncedPogo = true;
        }
      }
    }

    // 5. Arena PvP Local / Bot Opponent Hit!
    if (this.mode !== 'dungeon' && !isRangedOnlyForward) {
      const targetCtrl = ctrl === this.p1Ctrl ? this.p2Ctrl : this.p1Ctrl;
      if (targetCtrl && !ctrl.lastAttackHitIds.has(targetCtrl.ownerId)) {
        const tp = targetCtrl.player;
        if (tp.invulnTimer <= 0 && !tp.downed && this.aabb(box.x, box.y, box.w, box.h, tp.x, tp.y, tp.w, tp.h)) {
          ctrl.lastAttackHitIds.add(targetCtrl.ownerId);
          const kDir: 1 | -1 = p.x < tp.x ? 1 : -1;
          const isCrit = p.weapon === 'frying_pan' && !targetCtrl.grounded;
          const dmg = isCrit ? 2 : 1;
          if (isPogo) {
            bouncedPogo = true;
            this.arenaStats.pogos++;
          }
          if (isCrit) this.arenaStats.crits++;
          this.applyArenaDamage(
            targetCtrl,
            dmg,
            kDir * Math.max(320, wDef.knockback * 1.15),
            isPogo ? -220 : -360,
            isCrit,
            isPogo,
            ctrl.ownerId,
          );
          p.potassium = Math.min(100, p.potassium + 18);
        }
      }
    }

    // 6. Co-op Revive / Friendly Knockback / Online Arena PvP Hit on Remotes!
    if (this.isCoopActive() && ctrl.isLocalMain) {
      for (const rp of this.remotes.values()) {
        if ((!this.room.isArenaRoom && rp.roomIndex !== this.roomIndex) || ctrl.lastAttackHitIds.has(rp.id)) {
          continue;
        }
        if (this.aabb(box.x, box.y, box.w, box.h, rp.x, rp.y, 34, 46)) {
          ctrl.lastAttackHitIds.add(rp.id);
          if (this.mode === 'arena_online' && !isRangedOnlyForward) {
            const kDir = p.x < rp.x ? 1 : -1;
            const isCrit = p.weapon === 'frying_pan';
            if (isPogo) {
              bouncedPogo = true;
              this.arenaStats.pogos++;
            }
            if (isCrit) this.arenaStats.crits++;
            this.roomPeer.send('pvp_hit', {
              type: 'pvp_hit',
              targetId: rp.id,
              attackerId: this.roomPeer.localPlayer.id,
              dmg: isCrit ? 2 : 1,
              kbX: kDir * 440,
              kbY: -360,
              isCrit,
              isPogo,
            });
            sfx.hit();
            this.addFloatingText(rp.x + 17, rp.y - 14, isCrit ? '💥 CRÍTICO!' : '⚔️ ACERTOU!', '#facc15', 15);
            p.potassium = Math.min(100, p.potassium + 18);
          } else if (rp.downed) {
            this.roomPeer.send('revive_player', { type: 'revive_player', targetId: rp.id });
            rp.downed = false;
            sfx.heal();
            this.addFloatingText(rp.x + 17, rp.y - 16, '🍌 REVIVIDO!', '#4ade80', 16);
          } else if (this.friendlyKnockback) {
            const kDir = p.x < rp.x ? 1 : -1;
            this.roomPeer.send('friendly_knockback', {
              type: 'friendly_knockback',
              targetId: rp.id,
              kbX: kDir * 520,
              kbY: -410,
            });
            sfx.boing();
            this.addFloatingText(rp.x + 17, rp.y - 16, '😈 EMPURRÃO!', '#fb7185', 14);
            if (isPogo) bouncedPogo = true;
          }
        }
      }
    }

    if (bouncedPogo) {
      const springMult = ctrl.isLocalMain && this.hasUpgrade('pogo_spring') ? 1.13 : 1;
      p.vy = -545 * wDef.pogoBoost * springMult;
      ctrl.jumpsLeft = Math.max(1, ctrl.jumpsLeft);
      ctrl.dashCooldown = Math.min(ctrl.dashCooldown, 0.15);
      ctrl.activeJumpFromButton = false;
      ctrl.pogoGraceTimer = 0.1;
      sfx.pogo();
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);

      // Pogo Nova Synergy!
      if (ctrl.isLocalMain && this.hasUpgrade('pogo_nova')) {
        this.spawnRing(p.x + p.w / 2, p.y + p.h + 12, '#f59e0b', 90);
        for (const e of this.room.enemies) {
          if (e.hp <= 0) continue;
          const edx = Math.abs(e.x + e.w / 2 - (p.x + p.w / 2));
          const edy = e.y + e.h / 2 - (p.y + p.h);
          if (edx < 135 && edy > -20 && edy < 110) {
            this.resolveHitOnEnemy(e, {
              dmg: 22,
              attackerX: p.x + p.w / 2,
              knockback: 260,
              isPogo: true,
              bypassShield: true,
              customLabel: '💥 ONDA POGO',
            });
          }
        }
      }
    }
  }

  private parryProjectile(ctrl: PlayerController, pr: EnemyProjectile): void {
    const p = ctrl.player;
    pr.reflected = true;
    pr.ownerId = ctrl.ownerId;
    pr.life = 2.6;
    const parryBonus = ctrl.isLocalMain && this.hasUpgrade('parry_lightning');
    pr.dmg = parryBonus ? 82 : 52;

    // Aim toward nearest enemy (or opponent in Arena, else swing direction)
    let aimX = p.swingDir === 'left' ? -1 : 1;
    let aimY = p.swingDir === 'up' ? -0.7 : 0;
    let bestD = Infinity;

    for (const e of this.room.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x + e.w / 2 - pr.x;
      const dy = e.y + e.h / 2 - pr.y;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        aimX = dx / (d || 1);
        aimY = dy / (d || 1);
      }
    }
    if (this.mode !== 'dungeon') {
      const opp = ctrl === this.p1Ctrl ? this.p2Ctrl?.player : this.p1Ctrl.player;
      if (opp) {
        const dx = opp.x + 17 - pr.x;
        const dy = opp.y + 23 - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        aimX = dx / d;
        aimY = dy / d;
      } else if (this.mode === 'arena_online') {
        for (const rp of this.remotes.values()) {
          if (rp.downed) continue;
          const dx = rp.x + 17 - pr.x;
          const dy = rp.y + 23 - pr.y;
          const d = Math.hypot(dx, dy);
          if (d < bestD) {
            bestD = d;
            aimX = dx / (d || 1);
            aimY = dy / (d || 1);
          }
        }
      }
    }

    const spd = Math.max(580, Math.hypot(pr.vx, pr.vy) * 1.55);
    pr.vx = aimX * spd;
    pr.vy = aimY * spd;

    p.potassium = Math.min(100, p.potassium + (parryBonus ? 36 : 18));
    this.arenaStats.parries++;
    sfx.parry();
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.065);
    this.triggerShake(0.16, 7);
    this.spawnRing(pr.x, pr.y, '#fef08a', 46);
    this.spawnDirectionalSparks(pr.x, pr.y, aimX, aimY, '#facc15', 14);
    this.addFloatingText(pr.x, pr.y - 18, '⚡ PARRY CRÍTICO!', '#fef08a', 17, true);

    if (parryBonus) {
      let zapped = 0;
      for (const e of this.room.enemies) {
        if (e.hp <= 0 || zapped >= 2) continue;
        if (Math.hypot(e.x + e.w / 2 - pr.x, e.y + e.h / 2 - pr.y) < 320) {
          zapped++;
          this.particles.push({
            x: pr.x,
            y: pr.y,
            tx: e.x + e.w / 2,
            ty: e.y + e.h / 2,
            vx: 0,
            vy: 0,
            size: 3,
            color: '#22d3ee',
            life: 0.22,
            maxLife: 0.22,
            gravity: 0,
            kind: 'lightning',
          });
          this.resolveHitOnEnemy(e, {
            dmg: 32,
            attackerX: pr.x,
            knockback: 200,
            isPogo: false,
            stun: 0.75,
            isElectric: true,
            bypassShield: true,
            customLabel: '⚡ RAIO PARRY',
          });
        }
      }
    }
  }

  private onCtrlHitLanded(ctrl: PlayerController, hitX: number, hitY: number): void {
    ctrl.hitCounter++;
    const p = ctrl.player;
    const potGain = ctrl.isLocalMain && this.hasUpgrade('potassium_turbo') ? 21 : 14;
    p.potassium = Math.min(100, p.potassium + potGain);

    if (ctrl.isLocalMain && this.hasUpgrade('vampiric_banana') && ctrl.hitCounter % 6 === 0) {
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        sfx.heal();
        this.addFloatingText(p.x + 17, p.y - 18, '🧛 +1 ❤️ VAMP!', '#fb7185', 15);
      } else {
        p.potassium = Math.min(100, p.potassium + 15);
      }
    }
    void hitX;
    void hitY;
  }

  private resolveHitOnEnemy(
    e: EnemyEntity,
    opts: HitEnemyOpts & { kbDirOverride?: 1 | -1 },
  ): void {
    let dmg = opts.dmg;
    let isCrit = !!opts.forceCrit;

    if (opts.isPogo && this.hasUpgrade('pogo_spring')) {
      dmg *= 1.25;
    }

    if (opts.canAirCrit && !e.grounded && e.kind !== 'gorilla_ceo' && e.kind !== 'hr_baboon') {
      dmg *= opts.airCritMult ?? 2.0;
      isCrit = true;
    }

    if (this.hasUpgrade('bald_crit') && Math.random() < 0.28) {
      dmg *= 2;
      isCrit = true;
    }

    // CLT Beetle Front Briefcase Shield check based on attacker relative position!
    const hitFromFront =
      !opts.isPogo &&
      !opts.bypassShield &&
      e.kind === 'clt_beetle' &&
      ((opts.attackerX > e.x + e.w / 2 && e.facing === 1) ||
        (opts.attackerX < e.x + e.w / 2 && e.facing === -1));

    if (hitFromFront && !isCrit) {
      dmg = Math.max(4, Math.round(dmg * 0.35));
      this.addFloatingText(e.x + e.w / 2, e.y - 10, '💼 BLINDADO!', '#94a3b8', 12);
    } else if (opts.isPogo && e.kind === 'clt_beetle') {
      dmg *= 1.35;
    }

    dmg = Math.round(dmg);
    const kbDir = opts.kbDirOverride ?? (opts.attackerX < e.x + e.w / 2 ? 1 : -1);
    const isBoss = e.kind === 'gorilla_ceo' || e.kind === 'hr_baboon';
    const kbX = isBoss ? 0 : kbDir * opts.knockback;
    const kbY = isBoss ? 0 : opts.isPogo ? 60 : -190;

    this.damageDealt += dmg;

    if (isCrit && opts.isPan) {
      sfx.panClang(true);
    } else if (opts.isElectric) {
      sfx.electric();
    } else {
      sfx.hit();
    }

    this.hitstopTimer = Math.max(this.hitstopTimer, isCrit ? 0.055 : 0.03);
    this.triggerShake(isCrit ? 0.14 : 0.08, isCrit ? 6 : 3);
    this.spawnDirectionalSparks(
      e.x + e.w / 2,
      e.y + e.h / 2,
      kbDir,
      opts.isPogo ? 0.4 : -0.3,
      opts.isElectric ? '#22d3ee' : isCrit ? '#facc15' : '#fb7185',
      isCrit ? 12 : 7,
    );

    if (this.isHostAuthority()) {
      this.applyEnemyDamage(
        e,
        dmg,
        kbX,
        kbY,
        isCrit,
        opts.isPogo,
        opts.showText ?? true,
        opts.stun,
        opts.customLabel,
      );
    } else {
      e.hitFlash = 0.1;
      if (opts.showText !== false) {
        const label = opts.customLabel
          ? `${opts.customLabel} ${dmg}!`
          : isCrit
            ? `💥 CRÍTICO ${dmg}!`
            : opts.isPogo
              ? `🦘 ${dmg}`
              : `${dmg}`;
        this.addFloatingText(
          e.x + e.w / 2,
          e.y - 10,
          label,
          isCrit ? '#facc15' : opts.isPogo ? '#4ade80' : '#ffffff',
          isCrit ? 19 : 14,
          isCrit,
        );
      }
      this.roomPeer.send('enemy_hit', {
        type: 'enemy_hit',
        enemyId: e.id,
        dmg,
        kbX,
        kbY,
        isCrit,
        isPogo: opts.isPogo,
        stun: opts.stun,
      });
    }
  }

  private applyEnemyDamage(
    e: EnemyEntity,
    dmg: number,
    kbX: number,
    kbY: number,
    isCrit: boolean,
    isPogo: boolean,
    spawnLocalText: boolean,
    stun?: number,
    customLabel?: string,
  ): void {
    e.hp -= dmg;
    e.hitFlash = 0.11;
    if (stun && stun > 0) {
      e.stunTimer = Math.max(e.stunTimer ?? 0, stun);
    }
    if (e.kind !== 'gorilla_ceo' && e.kind !== 'hr_baboon') {
      e.vx = kbX;
      if (kbY !== 0) {
        e.vy = kbY;
        e.grounded = false;
      }
    }

    if (spawnLocalText) {
      const label = customLabel
        ? `${customLabel} ${dmg}!`
        : isCrit
          ? `💥 CRÍTICO ${dmg}!`
          : isPogo
            ? `🦘 ${dmg}`
            : `${dmg}`;
      this.addFloatingText(
        e.x + e.w / 2,
        e.y - 10,
        label,
        isCrit ? '#facc15' : isPogo ? '#4ade80' : '#ffffff',
        isCrit ? 19 : 14,
        isCrit,
      );
    }

    this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, isCrit ? '#facc15' : '#fb7185', isCrit ? 14 : 8);

    // Boss & Mini-Boss Phase 2 Triggers
    if ((e.kind === 'gorilla_ceo' || e.kind === 'hr_baboon') && e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      sfx.screech();
      this.triggerShake(0.32, 9);
      this.addFloatingText(
        e.x + e.w / 2,
        e.y - 30,
        e.kind === 'gorilla_ceo' ? '🔥 DEMISSÃO EM MASSA (FASE 2)!' : '🔥 RH SEM PAUSA PRO CAFÉ!',
        '#ef4444',
        19,
        true,
      );
    }

    if (e.hp <= 0) {
      e.hp = 0;
      this.kills++;
      const scoreGain = e.kind === 'gorilla_ceo' ? 1200 : e.kind === 'hr_baboon' ? 500 : 100;
      this.score += scoreGain;
      sfx.explosion();
      this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#facc15', 20);
      const bananaCount =
        (e.kind === 'gorilla_ceo' ? 12 : e.kind === 'hr_baboon' ? 6 : 2) +
        (this.hasUpgrade('clt_bonus') ? 1 : 0);
      this.spawnBananaPickup(e.x + e.w / 2, e.y + e.h / 2, bananaCount);

      if (this.isCoopActive()) {
        this.roomPeer.send('enemy_killed', {
          type: 'enemy_killed',
          enemyId: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          scoreGain,
          bananaCount,
        });
      }
    }
  }

  private spawnBoomerang(
    ownerId: string,
    x: number,
    y: number,
    dir: SwingDir,
    isLocal: boolean,
    vyOffset = 0,
  ): void {
    const speed = 640;
    const vx = dir === 'right' ? speed : dir === 'left' ? -speed : 0;
    const vy = (dir === 'up' ? -speed : 0) + vyOffset;
    this.boomerangs.push({
      id: `bm_${Math.random()}`,
      ownerId,
      isLocal,
      x,
      y,
      vx,
      vy,
      age: 0,
      returning: false,
      angle: 0,
      dmg: WEAPONS.havaiana_boomerang.damage,
      hitIds: new Set(),
    });
  }

  private spawnBazookaRocket(
    ownerId: string,
    x: number,
    y: number,
    dir: SwingDir,
    vyOffset: number,
    dmg: number,
  ): void {
    const speed = 560;
    const vx = dir === 'right' ? speed : dir === 'left' ? -speed : 0;
    const vy = (dir === 'up' ? -speed : dir === 'down' ? speed : -55) + vyOffset;
    this.projectiles.push({
      id: `bz_${Math.random()}`,
      kind: 'bazooka_banana',
      x,
      y,
      vx,
      vy,
      radius: 12,
      dmg,
      life: 1.5,
      ownerId,
      parryable: true,
    });
  }

  private detonateBazookaRocket(pr: EnemyProjectile): void {
    sfx.explosion();
    this.spawnRing(pr.x, pr.y, '#fb923c', 70);
    this.spawnBurst(pr.x, pr.y, '#facc15', 16);
    this.triggerShake(0.14, 5);

    const isMine = pr.ownerId === this.p1Ctrl.ownerId || pr.ownerId === this.p2Ctrl?.ownerId;
    if (isMine) {
      for (const e of this.room.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x + e.w / 2 - pr.x, e.y + e.h / 2 - pr.y) < 105) {
          this.resolveHitOnEnemy(e, {
            dmg: pr.dmg,
            attackerX: pr.x,
            knockback: 320,
            isPogo: false,
            bypassShield: true,
            customLabel: '🍌💥',
          });
        }
      }
      if (this.mode !== 'dungeon') {
        const opp = pr.ownerId === this.p1Ctrl.ownerId ? this.p2Ctrl : this.p1Ctrl;
        if (opp && Math.hypot(opp.player.x + 17 - pr.x, opp.player.y + 23 - pr.y) < 92) {
          const kbDir = pr.x < opp.player.x + 17 ? 1 : -1;
          this.applyArenaDamage(opp, 1, kbDir * 440, -380, false, false, pr.ownerId || 'bazooka');
        }
        if (this.mode === 'arena_online' && pr.ownerId === this.p1Ctrl.ownerId) {
          for (const rp of this.remotes.values()) {
            if (rp.downed || Math.hypot(rp.x + 17 - pr.x, rp.y + 23 - pr.y) >= 92) continue;
            const kbDir = pr.x < rp.x + 17 ? 1 : -1;
            this.roomPeer.send('pvp_hit', {
              type: 'pvp_hit',
              targetId: rp.id,
              attackerId: this.roomPeer.localPlayer.id,
              dmg: 1,
              kbX: kbDir * 440,
              kbY: -380,
              isCrit: false,
              isPogo: false,
            });
            this.addFloatingText(rp.x + 17, rp.y - 14, '🍌💥 BOOM!', '#fb923c', 15);
          }
        }
      }
    }
  }

  private updateBoomerangs(dt: number): void {
    for (let i = this.boomerangs.length - 1; i >= 0; i--) {
      const b = this.boomerangs[i];
      b.age += dt;
      b.angle += dt * 22;

      if (!b.returning && b.age > 0.34) {
        b.returning = true;
        b.hitIds.clear();
      }

      if (b.returning) {
        let targetX = this.local.x + this.local.w / 2;
        let targetY = this.local.y + this.local.h / 2;
        if (b.ownerId === this.p2Ctrl?.ownerId) {
          targetX = this.p2Ctrl.player.x + 17;
          targetY = this.p2Ctrl.player.y + 23;
        } else if (!b.isLocal) {
          const rp = this.remotes.get(b.ownerId);
          if (rp) {
            targetX = rp.x + 17;
            targetY = rp.y + 23;
          } else if (b.age > 1.2) {
            this.boomerangs.splice(i, 1);
            continue;
          }
        }
        const dx = targetX - b.x;
        const dy = targetY - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        b.vx = (dx / dist) * 680;
        b.vy = (dy / dist) * 680;
        if (dist < 28 || b.age > 1.6) {
          this.boomerangs.splice(i, 1);
          continue;
        }
      } else if (b.age > 1.3) {
        this.boomerangs.splice(i, 1);
        continue;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.isLocal) {
        for (const e of this.room.enemies) {
          if (e.hp <= 0 || b.hitIds.has(e.id)) continue;
          if (this.aabb(b.x - 14, b.y - 14, 28, 28, e.x, e.y, e.w, e.h)) {
            b.hitIds.add(e.id);
            this.resolveHitOnEnemy(e, {
              dmg: b.dmg,
              attackerX: b.x,
              knockback: 210,
              isPogo: false,
            });
          }
        }
        if (this.mode !== 'dungeon') {
          const targetCtrl = b.ownerId === this.p1Ctrl.ownerId ? this.p2Ctrl : this.p1Ctrl;
          if (targetCtrl && !b.hitIds.has(targetCtrl.ownerId)) {
            const tp = targetCtrl.player;
            if (tp.invulnTimer <= 0 && this.aabb(b.x - 14, b.y - 14, 28, 28, tp.x, tp.y, tp.w, tp.h)) {
              b.hitIds.add(targetCtrl.ownerId);
              const kbDir = b.vx >= 0 ? 1 : -1;
              this.applyArenaDamage(targetCtrl, 1, kbDir * 320, -300, false, false, b.ownerId);
            }
          }
          if (this.mode === 'arena_online' && b.ownerId === this.p1Ctrl.ownerId) {
            for (const rp of this.remotes.values()) {
              if (rp.downed || b.hitIds.has(rp.id)) continue;
              if (this.aabb(b.x - 14, b.y - 14, 28, 28, rp.x, rp.y, 34, 46)) {
                b.hitIds.add(rp.id);
                const kbDir = b.vx >= 0 ? 1 : -1;
                this.roomPeer.send('pvp_hit', {
                  type: 'pvp_hit',
                  targetId: rp.id,
                  attackerId: this.roomPeer.localPlayer.id,
                  dmg: 1,
                  kbX: kbDir * 320,
                  kbY: -300,
                  isCrit: false,
                  isPogo: false,
                });
                sfx.hit();
                this.addFloatingText(rp.x + 17, rp.y - 14, '🪃 ACERTOU!', '#facc15', 14);
              }
            }
          }
        }
      }
    }
  }

  private updatePeelBombs(dt: number): void {
    for (let i = this.peelBombs.length - 1; i >= 0; i--) {
      const b = this.peelBombs[i];
      b.fuse -= dt;
      b.vy = Math.min(400, b.vy + GRAVITY * 0.5 * dt);
      b.y += b.vy * dt;
      for (const plat of this.room.platforms) {
        if (this.aabb(b.x - 8, b.y - 8, 16, 16, plat.x, plat.y, plat.w, plat.h)) {
          b.y = plat.y - 8;
          b.vy = 0;
        }
      }
      if (b.fuse <= 0) {
        sfx.explosion();
        this.spawnRing(b.x, b.y, '#facc15', 65);
        this.spawnBurst(b.x, b.y, '#fb7185', 16);
        this.triggerShake(0.14, 5);
        if (b.ownerId === this.p1Ctrl.ownerId) {
          for (const e of this.room.enemies) {
            if (e.hp <= 0) continue;
            const dist = Math.hypot(e.x + e.w / 2 - b.x, e.y + e.h / 2 - b.y);
            if (dist < 110) {
              this.resolveHitOnEnemy(e, {
                dmg: 38,
                attackerX: b.x,
                knockback: 320,
                isPogo: false,
                bypassShield: true,
                customLabel: '💣 CASCA',
              });
            }
          }
        }
        this.peelBombs.splice(i, 1);
      }
    }
  }

  private getNearestPlayerTarget(x: number, y: number): { x: number; y: number } {
    let bestX = this.local.x + 17;
    let bestY = this.local.y + 23;
    let bestD = this.local.downed ? Infinity : Math.hypot(bestX - x, bestY - y);

    for (const r of this.remotes.values()) {
      if (r.downed || r.roomIndex !== this.roomIndex) continue;
      const d = Math.hypot(r.x + 17 - x, r.y + 23 - y);
      if (d < bestD) {
        bestD = d;
        bestX = r.x + 17;
        bestY = r.y + 23;
      }
    }
    return { x: bestX, y: bestY };
  }

  private updateEnemies(dt: number): void {
    for (const e of this.room.enemies) {
      if (e.hp <= 0) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;

      if (e.stunTimer && e.stunTimer > 0) {
        e.stunTimer -= dt;
        e.vx *= 0.85;
        if (e.kind !== 'nerd_bat') {
          e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
          this.moveEnemySolid(e, dt);
        }
        if (Math.random() < 0.25) {
          this.spawnParticle(e.x + Math.random() * e.w, e.y + Math.random() * e.h, (Math.random() - 0.5) * 60, -40, '#22d3ee', 3, 0.2);
        }
        continue;
      }

      e.aiTick += dt;
      e.stateTimer -= dt;

      const target = this.getNearestPlayerTarget(e.x + e.w / 2, e.y + e.h / 2);
      const dx = target.x - (e.x + e.w / 2);
      const dy = target.y - (e.y + e.h / 2);
      const dist = Math.hypot(dx, dy);

      if (e.kind === 'nerd_bat') {
        if (dist < 480) {
          e.facing = dx >= 0 ? 1 : -1;
          if (e.state === 'patrol' && dist < 240 && e.stateTimer <= 0) {
            e.state = 'windup';
            e.stateTimer = 0.45;
            e.vx = 0;
            e.vy = 0;
            this.addFloatingText(e.x + e.w / 2, e.y - 12, 'ACTUALLY! 🤓', '#c084fc', 11);
          } else if (e.state === 'windup' && e.stateTimer <= 0) {
            e.state = 'attack';
            e.stateTimer = 0.55;
            const len = dist || 1;
            e.vx = (dx / len) * 340;
            e.vy = (dy / len) * 340;
          } else if (e.state === 'attack' && e.stateTimer <= 0) {
            e.state = 'patrol';
            e.stateTimer = 1.2;
          } else if (e.state === 'patrol') {
            e.vx += ((dx > 0 ? 110 : -110) - e.vx) * dt * 2.5;
            e.vy += ((dy + Math.sin(e.aiTick * 4) * 45) * 1.1 - e.vy) * dt * 2.5;
          }
        } else {
          e.vx = Math.sin(e.aiTick * 2) * 40;
          e.vy = Math.cos(e.aiTick * 3) * 30;
        }
        e.x = Math.max(46, Math.min(this.room.width - 46 - e.w, e.x + e.vx * dt));
        e.y = Math.max(50, Math.min(this.room.height - 150, e.y + e.vy * dt));
      } else if (e.kind === 'clt_beetle') {
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        if (e.stateTimer <= 0 && dist < 380) {
          e.facing = dx >= 0 ? 1 : -1;
          e.stateTimer = 0.9;
        }
        e.vx += (e.facing * 85 - e.vx) * dt * 4;
        this.moveEnemySolid(e, dt);
      } else if (e.kind === 'coco_archer') {
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        e.vx *= 0.85;
        e.facing = dx >= 0 ? 1 : -1;
        if (dist < 560) {
          if (e.state === 'patrol' && e.stateTimer <= 0) {
            e.state = 'windup';
            e.stateTimer = 0.75;
          } else if (e.state === 'windup' && e.stateTimer <= 0) {
            e.state = 'patrol';
            e.stateTimer = 1.7;
            const len = dist || 1;
            this.projectiles.push({
              id: `pr_${Math.random()}`,
              kind: 'coconut',
              x: e.x + e.w / 2 + e.facing * 14,
              y: e.y + 16,
              vx: (dx / len) * 380,
              vy: (dy / len) * 380 - 95,
              radius: 9,
              dmg: 1,
              life: 2.5,
              parryable: true,
            });
          }
        }
        this.moveEnemySolid(e, dt);
      } else if (e.kind === 'bouncy_frog') {
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        if (e.grounded) {
          e.vx *= 0.78;
          if (e.state === 'patrol' && e.stateTimer <= 0 && dist < 440) {
            e.facing = dx >= 0 ? 1 : -1;
            e.state = 'windup';
            e.stateTimer = 0.45;
          } else if (e.state === 'windup' && e.stateTimer <= 0) {
            e.state = 'patrol';
            e.stateTimer = 1.3;
            e.vx = e.facing * 260;
            e.vy = -530;
            e.grounded = false;
          }
        }
        this.moveEnemySolid(e, dt);
      } else if (e.kind === 'hr_baboon') {
        this.updateHrBaboonAI(e, dt, target);
      } else if (e.kind === 'gorilla_ceo') {
        this.updateGorillaBossAI(e, dt, target);
      }

      // Contact damage with local player (Host)
      if (
        !this.local.downed &&
        this.local.invulnTimer <= 0 &&
        this.aabb(this.local.x + 4, this.local.y + 4, this.local.w - 8, this.local.h - 6, e.x + 4, e.y + 4, e.w - 8, e.h - 6)
      ) {
        const pushDir = this.local.x + 17 < e.x + e.w / 2 ? -1 : 1;
        this.damageLocalPlayer(1, pushDir * 320, -340, e.kind);
      }
    }
  }

  private updateGuestEnemyContactDamage(): void {
    if (this.local.downed || this.local.invulnTimer > 0) return;
    for (const e of this.room.enemies) {
      if (e.hp <= 0) continue;
      if (
        this.aabb(
          this.local.x + 4,
          this.local.y + 4,
          this.local.w - 8,
          this.local.h - 6,
          e.x + 4,
          e.y + 4,
          e.w - 8,
          e.h - 6,
        )
      ) {
        const pushDir = this.local.x + 17 < e.x + e.w / 2 ? -1 : 1;
        this.damageLocalPlayer(1, pushDir * 320, -340, e.kind);
        break;
      }
    }
  }

  private updateHrBaboonAI(b: EnemyEntity, dt: number, target: { x: number; y: number }): void {
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const speedMult = b.phase === 2 ? 1.26 : 1;

    if (b.state === 'patrol') {
      b.facing = target.x >= b.x + b.w / 2 ? 1 : -1;
      b.vx += (b.facing * 125 * speedMult - b.vx) * dt * 4;
      if (b.stateTimer <= 0) {
        b.attackPattern = (b.attackPattern + 1) % 3;
        b.state = 'windup';
        b.vx = 0;
        if (b.attackPattern === 0) {
          b.stateTimer = 0.65 / speedMult;
          this.addFloatingText(b.x + b.w / 2, b.y - 22, '📄 CHUVA DE CURRÍCULOS!', '#38bdf8', 15);
        } else if (b.attackPattern === 1) {
          b.stateTimer = 0.68 / speedMult;
          b.targetX = target.x;
          this.addFloatingText(b.x + b.w / 2, b.y - 22, '🔴 CARIMBADA DO RH!', '#ef4444', 15);
        } else {
          b.stateTimer = 0.62 / speedMult;
          b.targetX = Math.max(120, Math.min(this.room.width - 180, target.x - b.w / 2));
          this.addFloatingText(b.x + b.w / 2, b.y - 22, '💢 FEEDBACK NEGATIVO!', '#fb7185', 15);
        }
      }
    } else if (b.state === 'windup') {
      b.vx *= 0.8;
      if (b.stateTimer <= 0) {
        b.state = 'attack';
        if (b.attackPattern === 0) {
          const count = b.phase === 2 ? 4 : 3;
          const dx = target.x - (b.x + b.w / 2);
          const dy = target.y - (b.y + 24);
          const baseAng = Math.atan2(dy, dx);
          for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * 0.24;
            const ang = baseAng + offset;
            this.projectiles.push({
              id: `cv_${Math.random()}`,
              kind: 'resume_paper',
              x: b.x + b.w / 2,
              y: b.y + 24,
              vx: Math.cos(ang) * 410,
              vy: Math.sin(ang) * 410,
              radius: 12,
              dmg: 1,
              life: 2.6,
              parryable: true,
            });
          }
          b.state = 'recover';
          b.stateTimer = 0.85 / speedMult;
        } else if (b.attackPattern === 1) {
          b.facing = (b.targetX ?? target.x) >= b.x + b.w / 2 ? 1 : -1;
          b.vx = b.facing * (b.phase === 2 ? 600 : 510);
          b.stateTimer = 0.65;
        } else {
          b.vy = -700;
          const tx = b.targetX ?? target.x;
          b.vx = (tx - b.x) * 1.15;
          b.grounded = false;
          b.stateTimer = 0.95;
        }
      }
    } else if (b.state === 'attack') {
      if (b.attackPattern === 1 && b.stateTimer <= 0) {
        b.vx = 0;
        b.state = 'recover';
        b.stateTimer = 0.75 / speedMult;
      } else if (b.attackPattern === 2 && ((b.grounded && b.stateTimer < 0.8) || b.stateTimer <= -0.5)) {
        b.vx = 0;
        sfx.bossSlam();
        this.triggerShake(0.24, 7);
        for (const dir of [-1, 1] as const) {
          this.projectiles.push({
            id: `sw_${Math.random()}`,
            kind: 'shockwave',
            x: b.x + b.w / 2 + dir * 28,
            y: b.y + b.h - 20,
            vx: dir * 290,
            vy: 0,
            radius: 16,
            dmg: 1,
            life: 1.4,
            dir,
          });
        }
        b.state = 'dizzy';
        b.stateTimer = 1.15;
      }
    } else if (b.state === 'recover' || b.state === 'dizzy') {
      b.vx *= 0.84;
      if (b.stateTimer <= 0) {
        b.state = 'patrol';
        b.stateTimer = 0.7 / speedMult;
      }
    }

    this.moveEnemySolid(b, dt);
  }

  private updateGorillaBossAI(b: EnemyEntity, dt: number, target: { x: number; y: number }): void {
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
    const speedMult = b.phase === 2 ? 1.32 : 1;

    if (b.state === 'patrol') {
      b.facing = target.x >= b.x + b.w / 2 ? 1 : -1;
      b.vx += (b.facing * 95 * speedMult - b.vx) * dt * 4;
      if (b.stateTimer <= 0) {
        b.attackPattern = (b.attackPattern + 1) % 4;
        b.state = 'windup';
        b.vx = 0;
        if (b.attackPattern === 0) {
          b.stateTimer = 0.65 / speedMult;
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '💢 SOCO TERREMOTO!', '#f97316', 17);
        } else if (b.attackPattern === 1) {
          b.stateTimer = 0.72 / speedMult;
          b.targetX = target.x;
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '💼 INVESTIDA DE MALETA!', '#ef4444', 17);
        } else if (b.attackPattern === 2) {
          b.stateTimer = 0.75 / speedMult;
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '📉 CHUVA DE AÇÕES EM QUEDA!', '#fb7185', 17);
        } else {
          b.stateTimer = 0.65 / speedMult;
          b.targetX = Math.max(120, Math.min(this.room.width - 220, target.x - b.w / 2));
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '🦍 PULO DE AUDITORIA!', '#facc15', 17);
        }
      }
    } else if (b.state === 'windup') {
      b.vx *= 0.8;
      if (b.stateTimer <= 0) {
        b.state = 'attack';
        if (b.attackPattern === 0) {
          sfx.bossSlam();
          this.triggerShake(0.3, 9);
          for (const dir of [-1, 1] as const) {
            this.projectiles.push({
              id: `sw_${Math.random()}`,
              kind: 'shockwave',
              x: b.x + b.w / 2 + dir * 40,
              y: b.y + b.h - 20,
              vx: dir * (b.phase === 2 ? 410 : 330),
              vy: 0,
              radius: 18,
              dmg: 1,
              life: 3.2,
              dir,
            });
          }
          b.state = 'recover';
          b.stateTimer = 0.9 / speedMult;
        } else if (b.attackPattern === 1) {
          b.facing = (b.targetX ?? target.x) >= b.x + b.w / 2 ? 1 : -1;
          b.vx = b.facing * (b.phase === 2 ? 640 : 540);
          b.stateTimer = 0.85;
        } else if (b.attackPattern === 2) {
          const count = b.phase === 2 ? 7 : 5;
          for (let i = 0; i < count; i++) {
            const rx = 110 + ((this.room.width - 260) / (count - 1)) * i + (Math.random() - 0.5) * 60;
            this.telegraphs.push({
              id: `tg_${Math.random()}`,
              kind: 'rain',
              x: rx - 28,
              y: 45,
              w: 56,
              h: 615,
              timer: 0.85,
              maxTimer: 0.85,
            });
          }
          b.state = 'recover';
          b.stateTimer = 1.2 / speedMult;
        } else {
          b.vy = -780;
          const tx = b.targetX ?? target.x;
          b.vx = (tx - b.x) * 1.15;
          b.grounded = false;
          b.stateTimer = 1.1;
          this.telegraphs.push({
            id: `stomp_${Math.random()}`,
            kind: 'stomp',
            x: tx - 20,
            y: 620,
            w: b.w + 40,
            h: 40,
            timer: 0.9,
            maxTimer: 0.9,
          });
        }
      }
    } else if (b.state === 'attack') {
      if (b.attackPattern === 1) {
        if (b.stateTimer <= 0) {
          b.vx = 0;
          b.state = 'recover';
          b.stateTimer = 0.85 / speedMult;
        }
      } else if (b.attackPattern === 3) {
        if ((b.grounded && b.stateTimer < 0.95) || b.stateTimer <= -0.6) {
          b.vx = 0;
          sfx.bossSlam();
          this.triggerShake(0.32, 10);
          for (const dir of [-1, 1] as const) {
            this.projectiles.push({
              id: `sw_${Math.random()}`,
              kind: 'shockwave',
              x: b.x + b.w / 2 + dir * 36,
              y: b.y + b.h - 20,
              vx: dir * 320,
              vy: 0,
              radius: 18,
              dmg: 1,
              life: 2.8,
              dir,
            });
          }
          b.state = 'dizzy';
          b.stateTimer = 1.45;
        }
      }
    } else if (b.state === 'recover' || b.state === 'dizzy') {
      b.vx *= 0.85;
      if (b.stateTimer <= 0) {
        b.state = 'patrol';
        b.stateTimer = 0.75 / speedMult;
      }
    }

    this.moveEnemySolid(b, dt);
  }

  private moveEnemySolid(e: EnemyEntity, dt: number): void {
    const ignoreOneWay = e.kind === 'gorilla_ceo' || e.kind === 'hr_baboon';

    e.x += e.vx * dt;
    for (const plat of this.room.platforms) {
      if (plat.oneWay) continue;
      if (this.aabb(e.x, e.y, e.w, e.h, plat.x, plat.y, plat.w, plat.h)) {
        if (e.vx > 0) {
          e.x = plat.x - e.w;
          e.vx = e.kind === 'clt_beetle' ? -85 : 0;
          if (e.kind === 'clt_beetle') e.facing = -1;
        } else if (e.vx < 0) {
          e.x = plat.x + plat.w;
          e.vx = e.kind === 'clt_beetle' ? 85 : 0;
          if (e.kind === 'clt_beetle') e.facing = 1;
        }
      }
    }

    const prevBottom = e.y + e.h;
    e.y += e.vy * dt;
    e.grounded = false;
    for (const plat of this.room.platforms) {
      if (plat.oneWay) {
        if (ignoreOneWay) continue;
        if (e.vy >= 0 && prevBottom <= plat.y + 8 && this.aabb(e.x, e.y, e.w, e.h, plat.x, plat.y, plat.w, plat.h)) {
          e.y = plat.y - e.h;
          e.vy = 0;
          e.grounded = true;
        }
      } else if (this.aabb(e.x, e.y, e.w, e.h, plat.x, plat.y, plat.w, plat.h)) {
        if (e.vy > 0) {
          e.y = plat.y - e.h;
          e.vy = 0;
          e.grounded = true;
        } else if (e.vy < 0) {
          e.y = plat.y + plat.h;
          e.vy = 0;
        }
      }
    }
  }

  private updateTelegraphs(dt: number): void {
    const labels = ['IBOV -12%', 'SELIC +2%', 'DEMISSÃO', 'CALL ZERO', 'PIX TAXA'];
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i];
      tg.timer -= dt;
      if (tg.timer <= 0) {
        if (tg.kind === 'rain') {
          this.projectiles.push({
            id: `sc_${Math.random()}`,
            kind: 'stock_chart',
            x: tg.x + tg.w / 2,
            y: 55,
            vx: 0,
            vy: 470,
            radius: 16,
            dmg: 1,
            life: 2.2,
            label: labels[Math.floor(Math.random() * labels.length)],
            parryable: true,
          });
        }
        this.telegraphs.splice(i, 1);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.kind === 'coconut' && !pr.reflected) {
        pr.vy += GRAVITY * 0.42 * dt;
      } else if (pr.kind === 'bazooka_banana' && !pr.reflected) {
        pr.vy += GRAVITY * 0.16 * dt;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      let hitWall = false;
      for (const plat of this.room.platforms) {
        if (plat.oneWay) continue;
        if (this.aabb(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2, plat.x, plat.y, plat.w, plat.h)) {
          if (pr.kind === 'coconut' && !pr.reflected && pr.vy > 0 && pr.y < plat.y + 14) {
            pr.vy = -260;
            pr.y = plat.y - pr.radius;
          } else if (pr.kind === 'shockwave') {
            // Shockwave rides the floor and breaks against vertical side walls!
            if (plat.y < pr.y && plat.h > 80) {
              hitWall = true;
            }
          } else {
            hitWall = true;
          }
        }
      }

      // Bazooka or Reflected projectiles hit enemies!
      if ((pr.reflected || pr.kind === 'bazooka_banana') && !hitWall) {
        for (const e of this.room.enemies) {
          if (e.hp <= 0) continue;
          if (this.aabb(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2, e.x, e.y, e.w, e.h)) {
            if (pr.kind === 'bazooka_banana') {
              hitWall = true; // Detonates below!
            } else {
              this.resolveHitOnEnemy(e, {
                dmg: pr.dmg,
                attackerX: pr.x,
                knockback: 380,
                isPogo: false,
                forceCrit: true,
                bypassShield: true,
                customLabel: '⚡ PARRY',
              });
              hitWall = true;
            }
            break;
          }
        }
      }

      // Check hitting players (if NOT a friendly player's own shot, and NOT reflected by a player in dungeon)
      const hitsDungeonLocal =
        this.mode === 'dungeon' && !pr.reflected && pr.kind !== 'bazooka_banana';
      const hitsArenaTarget =
        this.mode !== 'dungeon' && pr.ownerId !== undefined;

      if (hitsDungeonLocal && !this.local.downed && this.local.invulnTimer <= 0) {
        if (
          this.aabb(
            this.local.x + 4,
            this.local.y + 4,
            this.local.w - 8,
            this.local.h - 6,
            pr.x - pr.radius,
            pr.y - pr.radius,
            pr.radius * 2,
            pr.radius * 2,
          )
        ) {
          this.damageLocalPlayer(
            pr.dmg,
            pr.vx >= 0 ? 220 : -220,
            -320,
            pr.kind === 'coconut' ? 'coco_archer' : pr.kind === 'resume_paper' ? 'hr_baboon' : 'gorilla_ceo',
          );
          if (pr.kind !== 'shockwave') hitWall = true;
        }
      } else if (hitsArenaTarget) {
        const ctrls = [this.p1Ctrl, ...(this.p2Ctrl ? [this.p2Ctrl] : [])];
        for (const c of ctrls) {
          if (c.ownerId === pr.ownerId || c.player.invulnTimer > 0) continue;
          if (
            this.aabb(
              c.player.x + 4,
              c.player.y + 4,
              c.player.w - 8,
              c.player.h - 6,
              pr.x - pr.radius,
              pr.y - pr.radius,
              pr.radius * 2,
              pr.radius * 2,
            )
          ) {
            if (pr.kind === 'bazooka_banana') {
              hitWall = true;
            } else {
              this.applyArenaDamage(c, 1, pr.vx >= 0 ? 340 : -340, -320, !!pr.reflected, false, pr.ownerId || 'proj');
              hitWall = true;
            }
            break;
          }
        }
        if (!hitWall && this.mode === 'arena_online' && pr.ownerId === this.p1Ctrl.ownerId) {
          for (const rp of this.remotes.values()) {
            if (rp.downed) continue;
            if (this.aabb(rp.x + 4, rp.y + 4, 26, 40, pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2)) {
              if (pr.kind === 'bazooka_banana') {
                hitWall = true;
              } else {
                const isCrit = !!pr.reflected;
                this.roomPeer.send('pvp_hit', {
                  type: 'pvp_hit',
                  targetId: rp.id,
                  attackerId: this.roomPeer.localPlayer.id,
                  dmg: isCrit ? 2 : 1,
                  kbX: pr.vx >= 0 ? 340 : -340,
                  kbY: -320,
                  isCrit,
                  isPogo: false,
                });
                sfx.hit();
                this.addFloatingText(rp.x + 17, rp.y - 14, isCrit ? '⚡ PARRY!' : '💥 ACERTOU!', '#facc15', 15);
                hitWall = true;
              }
              break;
            }
          }
        }
      }

      if (hitWall || pr.life <= 0) {
        if (pr.kind === 'bazooka_banana') {
          this.detonateBazookaRocket(pr);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateGuestProjectiles(dt: number): void {
    const localId = this.roomPeer.localPlayer.id;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.kind === 'bazooka_banana' && !pr.reflected) {
        pr.vy += GRAVITY * 0.16 * dt;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      const isGuestOwned = pr.ownerId === localId && (pr.reflected || pr.kind === 'bazooka_banana');
      let hitWall = false;

      if (isGuestOwned) {
        for (const plat of this.room.platforms) {
          if (plat.oneWay) continue;
          if (this.aabb(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2, plat.x, plat.y, plat.w, plat.h)) {
            hitWall = true;
            break;
          }
        }
        if (!hitWall) {
          for (const e of this.room.enemies) {
            if (e.hp <= 0) continue;
            if (this.aabb(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2, e.x, e.y, e.w, e.h)) {
              if (pr.kind === 'bazooka_banana') {
                hitWall = true;
              } else {
                this.resolveHitOnEnemy(e, {
                  dmg: pr.dmg,
                  attackerX: pr.x,
                  knockback: 380,
                  isPogo: false,
                  forceCrit: true,
                  bypassShield: true,
                  customLabel: '⚡ PARRY',
                });
                hitWall = true;
              }
              break;
            }
          }
        }
      }

      if (!pr.reflected && pr.kind !== 'bazooka_banana' && !this.local.downed && this.local.invulnTimer <= 0) {
        if (
          this.aabb(
            this.local.x + 4,
            this.local.y + 4,
            this.local.w - 8,
            this.local.h - 6,
            pr.x - pr.radius,
            pr.y - pr.radius,
            pr.radius * 2,
            pr.radius * 2,
          )
        ) {
          this.damageLocalPlayer(
            pr.dmg,
            pr.vx >= 0 ? 220 : -220,
            -320,
            pr.kind === 'coconut' ? 'coco_archer' : pr.kind === 'resume_paper' ? 'hr_baboon' : 'gorilla_ceo',
          );
          if (pr.kind !== 'shockwave') {
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      }

      if (hitWall || pr.life <= 0) {
        if (isGuestOwned && pr.kind === 'bazooka_banana') {
          this.detonateBazookaRocket(pr);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  private damageLocalPlayer(dmg: number, kbX: number, kbY: number, source: string): void {
    const p = this.local;
    if (p.invulnTimer > 0 || p.downed) return;

    p.hp = Math.max(0, p.hp - dmg);
    p.invulnTimer = 0.95;
    p.hitFlash = 0.16;
    p.healing = false;
    p.healProgress = 0;
    p.vx = kbX;
    p.vy = kbY;
    this.p1Ctrl.grounded = false;
    this.p1Ctrl.activeJumpFromButton = false;
    this.lastDamager = source;
    sfx.hurt();
    this.triggerShake(0.22, 8);
    this.hitstopTimer = 0.045;
    this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#ef4444', 12);

    if (this.hasUpgrade('chili_thorns')) {
      this.spawnRing(p.x + p.w / 2, p.y + p.h / 2, '#fb7185', 85);
      for (const e of this.room.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x + e.w / 2 - (p.x + p.w / 2), e.y + e.h / 2 - (p.y + p.h / 2)) < 130) {
          this.resolveHitOnEnemy(e, {
            dmg: 28,
            attackerX: p.x + p.w / 2,
            knockback: 280,
            isPogo: false,
            bypassShield: true,
            customLabel: '🌶️ ARDIDO',
          });
        }
      }
    }

    if (p.hp <= 0) {
      p.downed = true;
      p.reviveTimer = 18;
      this.addFloatingText(p.x + p.w / 2, p.y - 14, '💫 CAIU!', '#fb7185', 18);
    }
  }

  private applyArenaDamage(
    targetCtrl: PlayerController,
    dmg: number,
    kbX: number,
    kbY: number,
    isCrit: boolean,
    isPogo: boolean,
    attackerId: string,
  ): void {
    const p = targetCtrl.player;
    if (p.invulnTimer > 0 || p.downed || this.arenaRoundResetTimer > 0) return;

    p.hp = Math.max(0, p.hp - dmg);
    p.invulnTimer = 0.65;
    p.hitFlash = 0.16;
    p.healing = false;
    p.healProgress = 0;
    p.vx = kbX;
    p.vy = kbY;
    targetCtrl.grounded = false;
    targetCtrl.activeJumpFromButton = false;

    sfx.hurt();
    this.triggerShake(isCrit ? 0.24 : 0.16, isCrit ? 9 : 6);
    this.hitstopTimer = Math.max(this.hitstopTimer, isCrit ? 0.065 : 0.04);
    this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, isCrit ? '#facc15' : '#ef4444', 12);
    this.addFloatingText(
      p.x + p.w / 2,
      p.y - 12,
      isCrit ? `💥 CRÍTICO -${dmg}!` : isPogo ? `🦘 POGO -${dmg}!` : `-${dmg} ❤️`,
      isCrit ? '#facc15' : '#fb7185',
      isCrit ? 18 : 15,
      isCrit,
    );

    if (p.hp <= 0) {
      p.downed = true;
      this.handleArenaKO(targetCtrl, attackerId);
    }
  }

  private handleArenaKO(loserCtrl: PlayerController, attackerId: string): void {
    sfx.explosion();
    this.hitstopTimer = 0.12;
    this.triggerShake(0.35, 11);

    if (this.mode === 'arena_local' || this.mode === 'arena_bot') {
      if (loserCtrl === this.p2Ctrl) {
        this.arenaP1Score++;
        this.arenaBannerText = `💥 K.O.! Ponto para ${this.p1Ctrl.player.name}!`;
      } else {
        this.arenaP2Score++;
        this.arenaBannerText = `💥 K.O.! Ponto para ${this.p2Ctrl?.player.name || 'P2'}!`;
      }
      const winTarget = 2;
      if (this.arenaP1Score >= winTarget || this.arenaP2Score >= winTarget) {
        const winner = this.arenaP1Score >= winTarget ? this.p1Ctrl.player.name : (this.p2Ctrl?.player.name || 'P2');
        window.setTimeout(() => this.finishArenaSummary(winner, false), 950);
      } else {
        this.arenaRound++;
        this.arenaRoundResetTimer = 1.8;
      }
    } else if (this.mode === 'arena_online') {
      const winner = this.remotes.get(attackerId);
      const winnerId = winner ? winner.id : attackerId;
      const winnerName = winner ? winner.name : 'Campeão';
      this.arenaOnlineScores[winnerId] = (this.arenaOnlineScores[winnerId] || 0) + 1;
      const matchOver = this.arenaOnlineScores[winnerId] >= 2;
      this.arenaBannerText = matchOver ? `🏆 ${winnerName} VENCEU!` : `💥 K.O.! ${winnerName} pontuou!`;
      this.roomPeer.send('pvp_round_win', {
        type: 'pvp_round_win',
        winnerId,
        winnerName,
        round: this.arenaRound,
        scores: this.arenaOnlineScores,
        matchOver,
      });
      if (matchOver) {
        window.setTimeout(() => this.finishArenaSummary(winnerName, true), 950);
      } else {
        this.arenaRound++;
        this.arenaRoundResetTimer = 2.0;
      }
    }
  }

  private reviveLocalPlayer(byName: string): void {
    const p = this.local;
    p.downed = false;
    p.hp = Math.min(p.maxHp, 3);
    p.invulnTimer = 1.5;
    sfx.heal();
    this.spawnRing(p.x + p.w / 2, p.y + p.h / 2, '#4ade80', 40);
    this.addFloatingText(p.x + p.w / 2, p.y - 18, `🍌 REVIVIDO POR ${byName}!`, '#4ade80', 16);
    this.hud.toast(`🍌 ${byName} te levantou na Bananada!`, 'banana');
  }

  private spawnBananaPickup(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.pickups.push({
        id: `pk_${Math.random()}`,
        x,
        y,
        vx: (Math.random() - 0.5) * 220,
        vy: -220 - Math.random() * 140,
        life: 16,
        value: 1,
      });
    }
  }

  private updatePickups(dt: number): void {
    const collectors = [this.p1Ctrl, ...(this.p2Ctrl ? [this.p2Ctrl] : [])];

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.life -= dt;
      pk.vy = Math.min(500, pk.vy + GRAVITY * 0.65 * dt);
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      pk.vx *= 0.96;

      for (const plat of this.room.platforms) {
        if (this.aabb(pk.x - 8, pk.y - 8, 16, 16, plat.x, plat.y, plat.w, plat.h)) {
          if (pk.vy > 0) {
            pk.y = plat.y - 8;
            pk.vy = -pk.vy * 0.35;
          }
        }
      }

      let collected = false;
      for (const ctrl of collectors) {
        const cp = ctrl.player;
        if (cp.downed) continue;
        const px = cp.x + cp.w / 2;
        const py = cp.y + cp.h / 2;
        const d = Math.hypot(px - pk.x, py - pk.y);
        if (d < 85) {
          pk.x += ((px - pk.x) / (d || 1)) * 420 * dt;
          pk.y += ((py - pk.y) / (d || 1)) * 420 * dt;
        }
        if (d < 26) {
          if (ctrl.isLocalMain) {
            this.bananas += pk.value;
            this.score += 15;
          }
          cp.potassium = Math.min(100, cp.potassium + 8);
          sfx.pickup();
          this.pickups.splice(i, 1);
          collected = true;
          break;
        }
      }
      if (collected) continue;

      if (pk.life <= 0) {
        this.pickups.splice(i, 1);
      }
    }
  }

  private tryInteract(ctrl: PlayerController = this.p1Ctrl): void {
    if (this.phase !== 'playing' || ctrl.player.downed) return;
    const p = ctrl.player;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;

    // 1. Check nearby chest
    for (const ch of this.room.chests) {
      if (Math.hypot(px - (ch.x + 21), py - (ch.y + 16)) < 68) {
        const nextWeapon = ch.weaponId;
        const prevWeapon = p.weapon;
        ch.weaponId = prevWeapon;
        ch.opened = true;
        p.weapon = nextWeapon;
        sfx.pickup();
        this.spawnBurst(ch.x + 21, ch.y + 10, WEAPONS[nextWeapon].color, 16);
        this.addFloatingText(px, py - 24, `⚔️ ${WEAPONS[nextWeapon].name}!`, WEAPONS[nextWeapon].color, 16);
        if (ctrl.isLocalMain && this.isCoopActive()) {
          this.roomPeer.send('chest_open', {
            type: 'chest_open',
            chestId: ch.id,
            swappedWeapon: prevWeapon,
          });
        }
        return;
      }
    }

    // 2. Check Portal (Dungeon only)
    if (
      this.mode === 'dungeon' &&
      this.roomCleared &&
      Math.hypot(px - this.room.portalX, py - (this.room.portalY + 36)) < 78
    ) {
      if (!this.isCoopActive()) {
        this.advanceFromPortal();
      } else {
        this.portalReady = true;
        if (!this.portalCountdown) {
          this.portalCountdown = { timer: 4.0, initiatorName: this.local.name };
          this.roomPeer.send('portal_countdown', {
            type: 'portal_countdown',
            timer: 4.0,
            initiatorName: this.local.name,
          });
          this.hud.toast('🌀 Contagem de 4s iniciada! Chame o grupo pro Portal!', 'info');
        }
      }
    }
  }

  private advanceFromPortal(): void {
    if (this.room.isBossRoom) {
      this.finishRun(true);
    } else {
      const nextIdx = this.roomIndex + 1;
      if (this.isCoopActive()) {
        this.roomPeer.send('room_advance', { type: 'room_advance', roomIndex: nextIdx, seed: this.runSeed });
      }
      this.openUpgradeDraft(nextIdx);
    }
  }

  private syncNetwork(dt: number): void {
    if (!this.isCoopActive()) return;

    this.netSyncAccum += dt;
    if (this.netSyncAccum >= 0.045) {
      this.netSyncAccum = 0;
      const p = this.local;
      this.roomPeer.send('player_state', {
        type: 'player_state',
        state: {
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(p.vx),
          vy: Math.round(p.vy),
          facing: p.facing,
          hp: p.hp,
          maxHp: p.maxHp,
          weapon: p.weapon,
          downed: p.downed,
          reviveTimer: p.reviveTimer,
          swingTimer: p.swingTimer,
          swingDir: p.swingDir,
          dashTimer: p.dashTimer,
          healing: p.healing,
          hitFlash: p.hitFlash,
          roomIndex: this.roomIndex,
          inDraft: this.phase === 'draft',
          portalReady: this.portalReady,
        },
      });
    }

    if (this.mode === 'dungeon' && this.isHostAuthority()) {
      this.worldSnapAccum += dt;
      if (this.worldSnapAccum >= 0.055) {
        this.worldSnapAccum = 0;
        this.roomPeer.send('world_snapshot', {
          type: 'world_snapshot',
          roomIndex: this.roomIndex,
          roomCleared: this.roomCleared,
          enemiesFrozen: this.enemiesFrozen,
          enemies: this.room.enemies.map((e) => ({
            id: e.id,
            kind: e.kind,
            x: Math.round(e.x),
            y: Math.round(e.y),
            vx: Math.round(e.vx),
            vy: Math.round(e.vy),
            hp: e.hp,
            maxHp: e.maxHp,
            facing: e.facing,
            state: e.state,
            stateTimer: Number(e.stateTimer.toFixed(2)),
            phase: e.phase,
            attackPattern: e.attackPattern,
            stunTimer: e.stunTimer,
          })),
          projectiles: this.projectiles,
          telegraphs: this.telegraphs,
        });
      }
    }
  }

  private updateCameraAndShake(dt: number): void {
    const cw = this.viewW;
    const ch = this.viewH;

    let focusX = this.local.x + 17;
    let focusY = this.local.y + 23;
    if (this.p2Ctrl) {
      focusX = (this.local.x + this.p2Ctrl.player.x) / 2 + 17;
      focusY = (this.local.y + this.p2Ctrl.player.y) / 2 + 23;
    }

    const targetX =
      this.room.width <= cw
        ? -(cw - this.room.width) / 2
        : Math.max(0, Math.min(this.room.width - cw, focusX - cw / 2));
    const targetY =
      this.room.height <= ch
        ? -(ch - this.room.height) / 2
        : Math.max(0, Math.min(this.room.height - ch, focusY - ch * 0.56));

    this.camX += (targetX - this.camX) * Math.min(1, dt * 8);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 8);

    if (this.shakeTimer > 0) this.shakeTimer -= dt;
  }

  private updateParticlesAndText(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.vy += (pt.gravity ?? 260) * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.vrot && pt.rot !== undefined) pt.rot += pt.vrot * dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private render(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cw = this.viewW;
    const ch = this.viewH;
    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeIntensity * 2 : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeIntensity * 2 : 0;

    const px = this.local.x + 17;
    const py = this.local.y + 23;
    let nearbyChestWeapon: WeaponId | null = null;
    for (const chst of this.room.chests) {
      if (Math.hypot(px - (chst.x + 21), py - (chst.y + 16)) < 68) {
        nearbyChestWeapon = chst.weaponId;
        break;
      }
    }

    let p2NearbyChestWeapon: WeaponId | null = null;
    if (this.p2Ctrl && this.mode === 'arena_local') {
      const p2x = this.p2Ctrl.player.x + 17;
      const p2y = this.p2Ctrl.player.y + 23;
      for (const chst of this.room.chests) {
        if (Math.hypot(p2x - (chst.x + 21), p2y - (chst.y + 16)) < 68) {
          p2NearbyChestWeapon = chst.weaponId;
          break;
        }
      }
    }

    const nearPortal =
      this.mode === 'dungeon' && Math.hypot(px - this.room.portalX, py - (this.room.portalY + 36)) < 78;

    let arenaHud: ArenaHudState | null = null;
    if (this.mode !== 'dungeon') {
      const onlineList =
        this.mode === 'arena_online'
          ? [
              {
                id: this.roomPeer.localPlayer.id,
                name: this.local.name,
                color: this.local.color,
                score: this.arenaOnlineScores[this.roomPeer.localPlayer.id] || 0,
                hp: this.local.hp,
                maxHp: this.local.maxHp,
              },
              ...Array.from(this.remotes.values()).map((r) => ({
                id: r.id,
                name: r.name,
                color: r.color,
                score: this.arenaOnlineScores[r.id] || 0,
                hp: r.hp,
                maxHp: r.maxHp,
              })),
            ]
          : undefined;
      arenaHud = {
        round: this.arenaRound,
        maxRounds: this.arenaMaxRounds,
        p1Score: this.arenaP1Score,
        p2Score: this.arenaP2Score,
        p1Name: this.local.name,
        p2Name: this.p2Ctrl?.player.name || 'P2',
        p1Color: this.local.color,
        p2Color: this.p2Ctrl?.player.color || '#4ade80',
        countdown: this.arenaCountdown,
        bannerText: this.arenaBannerText,
        onlineScores: onlineList,
      };
    }

    renderWorld(this.ctx, cw, ch, {
      mode: this.mode,
      room: this.room,
      local: this.local,
      player2: this.p2Ctrl?.player ?? null,
      remotes: Array.from(this.remotes.values()),
      boomerangs: this.boomerangs,
      peelBombs: this.peelBombs,
      projectiles: this.projectiles,
      telegraphs: this.telegraphs,
      pickups: this.pickups,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      camX: this.camX,
      camY: this.camY,
      shakeX,
      shakeY,
      time: this.globalTime,
      roomCleared: this.roomCleared,
      bananas: this.bananas,
      kills: this.kills,
      score: this.score,
      upgrades: this.upgrades,
      friendlyKnockback: this.friendlyKnockback,
      isCoop: this.isCoopActive(),
      nearbyChestWeapon,
      p2NearbyChestWeapon,
      nearPortal,
      portalCountdown: this.portalCountdown,
      enemiesFrozen: this.enemiesFrozen,
      arenaHud,
    });
  }

  // Helpers
  private aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private triggerShake(duration: number, intensity: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    life: number,
    kind: Particle['kind'] = 'dot',
  ): void {
    this.particles.push({ x, y, vx, vy, color, size, life, maxLife: life, kind });
  }

  private spawnBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 220;
      this.spawnParticle(
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd - 60,
        color,
        4 + Math.random() * 4,
        0.35 + Math.random() * 0.25,
      );
    }
  }

  private spawnDirectionalSparks(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    color: string,
    count: number,
  ): void {
    const baseAng = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const ang = baseAng + (Math.random() - 0.5) * 1.1;
      const spd = 220 + Math.random() * 260;
      this.spawnParticle(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, color, 4 + Math.random() * 3, 0.25 + Math.random() * 0.15, 'spark');
    }
  }

  private spawnRing(x: number, y: number, color: string, size: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, color, size, life: 0.28, maxLife: 0.28, gravity: 0, kind: 'ring' });
  }

  private addFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    size: number,
    isCrit = false,
  ): void {
    this.floatingTexts.push({ x, y, vy: -48, text, color, size, life: 0.95, maxLife: 0.95, isCrit });
  }

  // DOM Overlays & Input Binding
  private createFkButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText =
      'position:fixed;top:92px;right:12px;pointer-events:auto;display:none;align-items:center;gap:6px;background:rgba(15,23,42,0.9);color:#f8fafc;border:2px solid #4ade80;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer;';
    btn.onclick = () => this.toggleFriendlyKnockback();
    this.uiRoot.appendChild(btn);
    this.updateFkButtonLabel(btn);
    return btn;
  }

  private updateFkButtonLabel(targetBtn = this.fkButton): void {
    targetBtn.textContent = this.friendlyKnockback
      ? '😈 Empurrão Amigo: ON'
      : '😇 Empurrão Amigo: OFF';
    targetBtn.style.borderColor = this.friendlyKnockback ? '#fb7185' : '#4ade80';
  }

  private toggleFriendlyKnockback(): void {
    if (!this.isCoopActive() || this.mode !== 'dungeon') return;
    this.friendlyKnockback = !this.friendlyKnockback;
    this.updateFkButtonLabel();
    sfx.click();
    this.roomPeer.send('toggle_fk', { type: 'toggle_fk', enabled: this.friendlyKnockback });
    this.hud.toast(
      this.friendlyKnockback
        ? '😈 Empurrão Amigo ATIVADO! Bata nos amigos pra jogar eles longe!'
        : '😇 Empurrão Amigo desativado.',
      this.friendlyKnockback ? 'chaos' : 'info',
    );
  }

  private createTitleOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,13,20,0.72);backdrop-filter:blur(4px);pointer-events:auto;';
    el.innerHTML = `
      <div style="background:rgba(15,23,42,0.96);border:3px solid #facc15;border-radius:20px;padding:24px 30px;max-width:580px;width:92%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.75);">
        <div style="font-size:44px;margin-bottom:4px;">🥥⚔️🐒</div>
        <h1 style="margin:0;font-size:30px;font-weight:900;color:#fef08a;letter-spacing:0.5px;">HOLLOW CHIMP</h1>
        <div style="font-size:15px;font-weight:800;color:#4ade80;margin-bottom:12px;">MASMORRA DA BANANA</div>
        <p style="margin:0 0 14px;font-size:13.5px;color:#cbd5e1;line-height:1.45;">
          Roguelite Monkey Slop inspirado em <b>Dead Cells & Hollow Knight</b>.<br/>
          Dê <b>Pogo-Jump</b>, dê <b>Parry</b> em projéteis, derrote o <b>RH Babuíno</b> e o <b>Gorilão CEO</b>!
        </p>
        <div style="text-align:left;background:#1e293b;border-radius:12px;padding:12px 16px;font-size:12.5px;color:#e2e8f0;line-height:1.65;margin-bottom:16px;">
          <div>🏃 <b>A / D</b>: Correr &nbsp;|&nbsp; 🦘 <b>W / Espaço</b>: Pulo, Pulo Duplo e <b>Wall-Jump</b></div>
          <div>💨 <b>Shift / K</b>: Dash (iframe) &nbsp;|&nbsp; 🍌 <b>Segurar Q / F</b>: Curar com Potássio</div>
          <div>⚔️ <b>J / Z / Clique</b>: Atacar & <b>PARRY</b> em projéteis! &nbsp;|&nbsp; 🔥 <b>S + J no ar</b>: <b>POGO-JUMP!</b></div>
          <div>📦 <b>E</b>: Trocar Arma no Baú / Entrar no Portal &nbsp;|&nbsp; 🔌 <b>6 Armas & 12 Relíquias!</b></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="mc-play-btn" style="background:#facc15;color:#0f172a;border:none;border-radius:14px;padding:13px 24px;font-size:17px;font-weight:900;cursor:pointer;box-shadow:0 5px 0 #ca8a04;width:100%;">
            ⚔️ JOGAR MASMORRA (Solo / Co-op Online)
          </button>
          <button id="mc-arena-btn" style="background:#7c3aed;color:#f8fafc;border:2px solid #c084fc;border-radius:14px;padding:11px 22px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #4c1d95;width:100%;">
            🥊 Arena Bananada (PvP / 2P Local)
          </button>
        </div>
      </div>
    `;
    this.uiRoot.appendChild(el);
    el.querySelector<HTMLButtonElement>('#mc-play-btn')!.onclick = () => {
      sfx.click();
      this.startNewRun();
    };
    el.querySelector<HTMLButtonElement>('#mc-arena-btn')!.onclick = () => {
      sfx.click();
      this.titleOverlay.style.display = 'none';
      this.arenaOverlay.style.display = 'flex';
    };
    return el;
  }

  private createArenaOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,13,20,0.8);backdrop-filter:blur(5px);pointer-events:auto;';
    el.innerHTML = `
      <div style="background:rgba(15,23,42,0.97);border:3px solid #c084fc;border-radius:20px;padding:24px 28px;max-width:540px;width:92%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.75);">
        <div style="font-size:40px;margin-bottom:4px;">🥊🍌🐒</div>
        <h2 style="margin:0 0 6px;font-size:25px;font-weight:900;color:#fef08a;">ARENA BANANADA (MELHOR DE 3)</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#cbd5e1;">X1 de Pogo-Jump, Parry e Chinelada — escolha o modo:</p>

        <div style="text-align:left;background:#1e293b;border-radius:12px;padding:10px 14px;font-size:12px;color:#e2e8f0;line-height:1.6;margin-bottom:16px;">
          <div>🟡 <b>P1 (2P Local):</b> <b>WASD</b> Mover/Pular • <b>F</b> Atacar (S+F Pogo) • <b>G</b> Dash • <b>Q</b> Curar • <b>E</b> Baú</div>
          <div>🟢 <b>P2 (2P Local):</b> <b>Setas</b> Mover/Pular • <b>K</b> Atacar (↓+K Pogo) • <b>L</b> Dash • <b>M</b> Curar • <b>Enter</b> Baú</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="mc-arena-local" style="background:#4ade80;color:#0f172a;border:none;border-radius:12px;padding:12px;font-size:16px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #15803d;">
            🎮 2P Local (Mesmo Teclado: WASD+F/G vs Setas+K/L)
          </button>
          <button id="mc-arena-bot" style="background:#38bdf8;color:#0f172a;border:none;border-radius:12px;padding:12px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #0284c7;">
            🤖 X1 Solo vs Bot Macaco
          </button>
          <button id="mc-arena-online" style="background:#facc15;color:#0f172a;border:none;border-radius:12px;padding:12px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #ca8a04;">
            🌐 PvP Online P2P (Usa Sala Co-op do Topo)
          </button>
          <button id="mc-arena-back" style="background:#334155;color:#f8fafc;border:2px solid #475569;border-radius:12px;padding:9px;font-size:13px;font-weight:800;cursor:pointer;">
            ⬅ Voltar
          </button>
        </div>
      </div>
    `;
    this.uiRoot.appendChild(el);
    el.querySelector<HTMLButtonElement>('#mc-arena-local')!.onclick = () => {
      sfx.click();
      this.startArenaMatch('arena_local');
    };
    el.querySelector<HTMLButtonElement>('#mc-arena-bot')!.onclick = () => {
      sfx.click();
      this.startArenaMatch('arena_bot');
    };
    el.querySelector<HTMLButtonElement>('#mc-arena-online')!.onclick = () => {
      sfx.click();
      if (!this.isCoopActive()) {
        this.hud.toast('Conecte-se em uma sala no botão "Co-op Online" no topo primeiro!', 'info');
        return;
      }
      this.startArenaMatch('arena_online');
    };
    el.querySelector<HTMLButtonElement>('#mc-arena-back')!.onclick = () => {
      sfx.click();
      el.style.display = 'none';
      this.titleOverlay.style.display = 'flex';
    };
    return el;
  }

  private createDraftOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,13,20,0.82);backdrop-filter:blur(5px);pointer-events:auto;';
    this.uiRoot.appendChild(el);
    return el;
  }

  private renderDraftCards(): void {
    this.draftOverlay.innerHTML = `
      <div style="max-width:760px;width:94%;text-align:center;">
        <h2 style="margin:0 0 6px;font-size:26px;font-weight:900;color:#fef08a;">✨ ALTAR DE RELÍQUIAS DA SALA ${this.roomIndex + 1}</h2>
        <p style="margin:0 0 18px;font-size:14px;color:#cbd5e1;">Escolha 1 upgrade roguelite (Clique ou aperte <b>1</b>, <b>2</b> ou <b>3</b>):</p>
        <div id="mc-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;"></div>
      </div>
    `;
    const wrap = this.draftOverlay.querySelector<HTMLDivElement>('#mc-cards')!;
    this.draftChoices.forEach((up, idx) => {
      const card = document.createElement('button');
      card.style.cssText = `background:rgba(15,23,42,0.96);border:3px solid ${up.color};border-radius:16px;padding:18px 14px;color:#f8fafc;cursor:pointer;text-align:center;transition:transform 0.12s ease;box-shadow:0 10px 25px rgba(0,0,0,0.5);`;
      card.innerHTML = `
        <div style="font-size:11px;font-weight:800;color:${up.color};margin-bottom:6px;">[TECLA ${idx + 1}]</div>
        <div style="font-size:38px;margin-bottom:8px;">${up.emoji}</div>
        <div style="font-size:16px;font-weight:900;color:#fef08a;margin-bottom:6px;">${up.title}</div>
        <div style="font-size:12.5px;color:#cbd5e1;line-height:1.4;">${up.subtitle}</div>
      `;
      card.onmouseenter = () => (card.style.transform = 'translateY(-4px)');
      card.onmouseleave = () => (card.style.transform = 'translateY(0)');
      card.onclick = () => this.pickUpgrade(idx);
      wrap.appendChild(card);
    });
  }

  private createSummaryOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,13,20,0.82);backdrop-filter:blur(5px);pointer-events:auto;';
    this.uiRoot.appendChild(el);
    return el;
  }

  private bindInputs(): void {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      if (this.phase === 'title') {
        if (this.arenaOverlay.style.display === 'none' && (e.code === 'Enter' || e.code === 'Space')) {
          sfx.click();
          this.startNewRun();
        }
        return;
      }

      if (this.phase === 'draft') {
        if (e.code === 'Digit1') this.pickUpgrade(0);
        if (e.code === 'Digit2') this.pickUpgrade(1);
        if (e.code === 'Digit3') this.pickUpgrade(2);
        return;
      }

      if (this.phase === 'summary') {
        if (e.code === 'KeyR' || e.code === 'Enter') {
          sfx.click();
          if (this.mode === 'dungeon') this.startNewRun();
          else this.startArenaMatch(this.mode);
        }
        return;
      }

      if (!e.repeat) {
        if (this.mode === 'arena_local') {
          // P1: WASD + F/G + E
          if (e.code === 'KeyW') {
            this.p1Ctrl.jumpBufferTimer = 0.12;
            this.p1Ctrl.lastWJumpTime = this.globalTime;
          }
          if (e.code === 'KeyF') this.performAttack(this.p1Ctrl);
          if (e.code === 'KeyG') this.performDash(this.p1Ctrl);
          if (e.code === 'KeyE') this.tryInteract(this.p1Ctrl);

          // P2: Arrows + K/L + Enter
          if (this.p2Ctrl) {
            if (e.code === 'ArrowUp') {
              this.p2Ctrl.jumpBufferTimer = 0.12;
              this.p2Ctrl.lastWJumpTime = this.globalTime;
            }
            if (e.code === 'KeyK') this.performAttack(this.p2Ctrl);
            if (e.code === 'KeyL') this.performDash(this.p2Ctrl);
            if (e.code === 'Enter') this.tryInteract(this.p2Ctrl);
          }
        } else {
          // Standard Dungeon / Online / Bot controls
          if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
            this.p1Ctrl.jumpBufferTimer = 0.12;
            if (e.code !== 'Space') {
              this.p1Ctrl.lastWJumpTime = this.globalTime;
            }
          }
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
            this.performDash(this.p1Ctrl);
          }
          if (e.code === 'KeyJ' || e.code === 'KeyZ') {
            this.performAttack(this.p1Ctrl);
          }
          if (e.code === 'KeyE') {
            this.tryInteract(this.p1Ctrl);
          }
          if (e.code === 'KeyT') {
            this.toggleFriendlyKnockback();
          }
        }
      }

      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);

      if (this.mode === 'arena_local') {
        if (e.code === 'KeyW' && this.p1Ctrl.activeJumpFromButton && this.local.vy < -180) {
          this.local.vy *= 0.52;
        }
        if (e.code === 'ArrowUp' && this.p2Ctrl && this.p2Ctrl.activeJumpFromButton && this.p2Ctrl.player.vy < -180) {
          this.p2Ctrl.player.vy *= 0.52;
        }
      } else if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        if (this.p1Ctrl.activeJumpFromButton && this.local.vy < -180) {
          this.local.vy *= 0.52;
        }
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.phase !== 'playing' || e.button !== 0 || this.mode === 'arena_local') return;
      const rect = this.canvas.getBoundingClientRect();
      const worldX = e.clientX - rect.left + this.camX;
      const worldY = e.clientY - rect.top + this.camY;
      const px = this.local.x + 17;
      const py = this.local.y + 23;
      const dx = worldX - px;
      const dy = worldY - py;

      if (!this.p1Ctrl.grounded && dy > 32 && Math.abs(dy) > Math.abs(dx) * 0.75) {
        this.performAttack(this.p1Ctrl, 'down');
      } else if (dy < -42 && Math.abs(dy) > Math.abs(dx)) {
        this.performAttack(this.p1Ctrl, 'up');
      } else {
        this.local.facing = dx >= 0 ? 1 : -1;
        this.performAttack(this.p1Ctrl, dx >= 0 ? 'right' : 'left');
      }
    });
  }

  private handleResize = (): void => {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
  };

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.uiRoot.remove();
  }
}
