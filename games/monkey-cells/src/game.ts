import { type MonkeyHudHandle, PeerRoom, type PlayerProfile, reportGameScore } from '@monkey-slop/sdk';
import { generateRoom } from './levels';
import { type LocalRenderPlayer, renderWorld } from './renderer';
import { sfx } from './sfx';
import {
  type BoomerangEntity,
  type EnemyEntity,
  type EnemyProjectile,
  type FloatingText,
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
  gorilla_ceo: 'O Gorilão CEO cortou seu vale-banana e encerrou seu contrato!',
  spike: 'Tentou dar um pogo estiloso no espinho e virou espetinho de macaco.',
  bleedout: 'Ficou caído esperando a bananada e ninguém veio te levantar!',
  unknown: 'Escorregou na própria casca existencial.',
};

export class HollowChimpGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private roomPeer: PeerRoom<NetMessage>;
  private hud: MonkeyHudHandle;

  private uiRoot: HTMLDivElement;
  private titleOverlay: HTMLDivElement;
  private draftOverlay: HTMLDivElement;
  private summaryOverlay: HTMLDivElement;
  private fkButton: HTMLButtonElement;

  private phase: 'title' | 'playing' | 'draft' | 'summary' = 'title';
  private runSeed = 1337;
  private roomIndex = 0;
  private room!: RoomData;
  private roomCleared = false;

  private local!: LocalRenderPlayer;
  private remotes = new Map<string, RemotePlayerState>();
  private playersRoster: PlayerProfile[] = [];

  private boomerangs: BoomerangEntity[] = [];
  private peelBombs: PeelBomb[] = [];
  private projectiles: EnemyProjectile[] = [];
  private telegraphs: TelegraphMarker[] = [];
  private pickups: PickupBanana[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  // Input state
  private keys = new Set<string>();
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private grounded = false;
  private jumpsLeft = 2;
  private dashCooldown = 0;
  private attackCooldown = 0;
  private hitstopTimer = 0;
  private dropThroughTimer = 0;

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

  // Camera & timers
  private camX = 0;
  private camY = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private globalTime = 0;
  private netSyncAccum = 0;
  private worldSnapAccum = 0;
  private lastFrame = 0;
  private rafId = 0;
  private lastAttackHitIds = new Set<string>();

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
    this.draftOverlay = this.createDraftOverlay();
    this.summaryOverlay = this.createSummaryOverlay();

    this.resetPlayerState();
    this.loadRoom(0, false);

    this.bindInputs();
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private isCoopActive(): boolean {
    return this.playersRoster.length > 1;
  }

  private isHostAuthority(): boolean {
    if (!this.isCoopActive()) return true;
    return this.roomPeer.localPlayer.isHost;
  }

  onPlayersChange(players: PlayerProfile[]): void {
    this.playersRoster = players;
    this.hud.setPlayers(players);
    const selfProfile = players.find((p) => p.id === this.roomPeer.localPlayer.id);
    if (selfProfile) {
      this.local.name = selfProfile.name;
      this.local.color = selfProfile.color;
    } else {
      this.local.name = this.roomPeer.localPlayer.name;
      this.local.color = this.roomPeer.localPlayer.color;
    }
    const activeIds = new Set(players.map((p) => p.id));
    for (const id of this.remotes.keys()) {
      if (!activeIds.has(id)) {
        this.remotes.delete(id);
      }
    }
    this.fkButton.style.display = this.isCoopActive() ? 'inline-flex' : 'none';
  }

  onNetMessage(msg: NetMessage, senderId: string, senderName: string): void {
    if (senderId === this.roomPeer.localPlayer.id) return;

    switch (msg.type) {
      case 'run_start': {
        this.friendlyKnockback = msg.friendlyKnockback;
        this.updateFkButtonLabel();
        this.startNewRun(msg.seed, false);
        this.hud.toast(`🐒 ${senderName} iniciou uma nova run Co-op!`, 'banana');
        break;
      }
      case 'player_state': {
        const profile = this.playersRoster.find((p) => p.id === senderId);
        const existing = this.remotes.get(senderId);
        this.remotes.set(senderId, {
          id: senderId,
          name: profile?.name || senderName,
          color: profile?.color || existing?.color || '#38bdf8',
          ...msg.state,
          lastSeen: this.globalTime,
        });
        break;
      }
      case 'player_attack': {
        // Spawn remote boomerang visually if needed
        if (msg.weapon === 'havaiana_boomerang') {
          this.spawnBoomerang(senderId, msg.x, msg.y, msg.dir, false);
        }
        break;
      }
      case 'enemy_hit': {
        if (this.isHostAuthority()) {
          const enemy = this.room.enemies.find((e) => e.id === msg.enemyId);
          if (enemy && enemy.hp > 0) {
            this.applyEnemyDamage(enemy, msg.dmg, msg.kbX, msg.kbY, msg.isCrit, msg.isPogo, true);
          }
        }
        break;
      }
      case 'friendly_knockback': {
        if (msg.targetId === this.roomPeer.localPlayer.id && !this.local.downed) {
          this.local.vx = msg.kbX;
          this.local.vy = msg.kbY;
          this.grounded = false;
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
      case 'room_advance': {
        if (msg.roomIndex !== this.roomIndex) {
          this.runSeed = msg.seed;
          if (this.phase === 'playing') {
            this.openUpgradeDraft(msg.roomIndex);
          } else {
            this.loadRoom(msg.roomIndex, true);
          }
        }
        break;
      }
      case 'chest_open': {
        const ch = this.room.chests.find((c) => c.id === msg.chestId);
        if (ch && !ch.opened) {
          ch.opened = true;
          this.spawnBurst(ch.x + 21, ch.y + 12, '#facc15', 14);
        }
        break;
      }
      case 'crate_break': {
        const cr = this.room.crates.find((c) => c.id === msg.crateId);
        if (cr && !cr.broken) {
          cr.broken = true;
          this.spawnBurst(cr.x + 18, cr.y + 18, '#b45309', 10);
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
        if (msg.roomIndex !== this.roomIndex) {
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
            // Smoothly snap/correct enemy
            localE.x += (snap.x - localE.x) * 0.55;
            localE.y += (snap.y - localE.y) * 0.55;
            localE.vx = snap.vx;
            localE.vy = snap.vy;
            if (snap.hp < localE.hp) localE.hitFlash = 0.08;
            localE.hp = snap.hp;
            localE.facing = snap.facing;
            localE.state = snap.state;
            localE.stateTimer = snap.stateTimer;
            localE.phase = snap.phase;
            localE.attackPattern = snap.attackPattern;
          }
        }
        this.projectiles = msg.projectiles;
        this.telegraphs = msg.telegraphs;
        break;
      }
    }
  }

  private resetPlayerState(): void {
    const profile = this.roomPeer.localPlayer;
    this.local = {
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
      color: profile.color,
      name: profile.name,
      afterimages: [],
    };
  }

  private startNewRun(seed?: number, broadcast = true): void {
    this.runSeed = seed ?? Math.floor(Math.random() * 999999);
    this.upgrades = [];
    this.bananas = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.runTime = 0;
    this.score = 0;
    this.scoreReported = false;
    this.lastDamager = 'unknown';
    this.resetPlayerState();
    this.loadRoom(0, true);
    this.phase = 'playing';
    this.titleOverlay.style.display = 'none';
    this.draftOverlay.style.display = 'none';
    this.summaryOverlay.style.display = 'none';
    sfx.screech();
    this.hud.toast('⚔️ Nova Run iniciada! Dê Pogo nos inimigos!', 'banana');

    if (broadcast && this.isCoopActive()) {
      this.roomPeer.send('run_start', {
        type: 'run_start',
        seed: this.runSeed,
        friendlyKnockback: this.friendlyKnockback,
      });
    }
  }

  private loadRoom(index: number, healBetweenRooms: boolean): void {
    this.roomIndex = index;
    const pCount = Math.max(1, this.playersRoster.length);
    this.room = generateRoom(index, this.runSeed, pCount);
    this.roomCleared = false;
    this.boomerangs = [];
    this.peelBombs = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.pickups = [];

    this.local.x = this.room.spawnX;
    this.local.y = this.room.spawnY;
    this.local.vx = 0;
    this.local.vy = 0;
    this.local.invulnTimer = 0.8;
    if (healBetweenRooms && this.local.downed) {
      this.local.downed = false;
      this.local.hp = Math.max(2, Math.floor(this.local.maxHp / 2));
    }

    this.camX = Math.max(0, this.local.x - this.canvas.width / 2);
    this.camY = Math.max(0, this.local.y - this.canvas.height / 2);
  }

  private hasUpgrade(id: UpgradeId): boolean {
    return this.upgrades.includes(id);
  }

  private openUpgradeDraft(nextRoomIndex: number): void {
    this.phase = 'draft';
    this.loadRoom(nextRoomIndex, true);

    const available = UPGRADES.filter((u) => !this.upgrades.includes(u.id));
    const pool = available.length >= 3 ? [...available] : [...UPGRADES];
    // Shuffle
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
      // Slight potassium gift between rooms
      this.local.potassium = Math.min(100, this.local.potassium + 25);
    }
    sfx.pickup();
    this.draftOverlay.style.display = 'none';
    this.phase = 'playing';
    this.local.invulnTimer = 1.2;
    this.addFloatingText(this.local.x + 17, this.local.y - 20, `${choice.emoji} ${choice.title}!`, choice.color, 16);
  }

  private finishRun(victory: boolean): void {
    if (this.phase === 'summary') return;
    this.phase = 'summary';

    const timeBonus = victory ? Math.max(0, Math.round(1800 - this.runTime * 6)) : 0;
    const cltMult = this.hasUpgrade('clt_bonus') ? 1.25 : 1;
    const finalScore = Math.round(
      (this.score + this.bananas * 15 + this.kills * 60 + (victory ? 2500 : this.roomIndex * 250) + timeBonus) *
        cltMult,
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
        <button id="mc-restart-btn" style="background:#facc15;color:#0f172a;border:none;border-radius:12px;padding:12px 24px;font-size:16px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #ca8a04;width:100%;">
          🔄 Nova Run Instantânea (R / Enter)
        </button>
      </div>
    `;
    this.summaryOverlay.style.display = 'flex';
    this.summaryOverlay.querySelector<HTMLButtonElement>('#mc-restart-btn')!.onclick = () => {
      sfx.click();
      this.startNewRun();
    };
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.033, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.globalTime += dt;

    if (this.phase === 'playing') {
      this.update(dt);
    } else if (this.phase === 'title') {
      // Gentle idle animation on title screen
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

    this.updateLocalPlayer(dt);
    this.updateBoomerangs(dt);
    this.updatePeelBombs(dt);

    if (this.isHostAuthority()) {
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updateTelegraphs(dt);
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
      // Still tick local hitFlash & projectiles visually smoothly
      for (const e of this.room.enemies) {
        if (e.hitFlash > 0) e.hitFlash -= dt;
      }
      this.updateGuestProjectileDamage();
    }

    this.updatePickups(dt);
    this.updateParticlesAndText(dt);
    this.updateCameraAndShake(dt);
    this.syncNetwork(dt);

    // Check total defeat
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

  private updateLocalPlayer(dt: number): void {
    const p = this.local;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.dropThroughTimer > 0) this.dropThroughTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // Fade afterimages
    for (let i = p.afterimages.length - 1; i >= 0; i--) {
      p.afterimages[i].alpha -= dt * 5;
      if (p.afterimages[i].alpha <= 0) p.afterimages.splice(i, 1);
    }

    if (p.downed) {
      p.reviveTimer -= dt;
      p.vx *= 0.85;
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
      this.moveAndCollide(p, dt, false);
      return;
    }

    const moveLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const moveRight = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const holdDown = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const holdUp = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const holdHeal = this.keys.has('KeyQ') || this.keys.has('KeyF');

    const moveDir = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);

    // Drop through one-way platform with S + Space? Handled on jump press if holding down, or tapping S
    if (holdDown && this.grounded && this.keys.has('Space')) {
      this.dropThroughTimer = 0.22;
      this.grounded = false;
    }

    // Hollow Knight Potassium Healing (hold Q or F while grounded & not swinging/dashing)
    if (holdHeal && this.grounded && p.dashTimer <= 0 && p.swingTimer <= 0 && p.potassium >= 33 && p.hp < p.maxHp && moveDir === 0) {
      p.healing = true;
      const healDuration = this.hasUpgrade('potassium_turbo') ? 0.34 : 0.62;
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

    // Dash / Roll movement
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vy = 0;
      p.vx = p.facing * DASH_SPEED;
      if (Math.random() < 0.65) {
        p.afterimages.push({ x: p.x, y: p.y, facing: p.facing, alpha: 0.9 });
      }
    } else if (!p.healing) {
      if (moveDir !== 0) {
        p.facing = moveDir > 0 ? 1 : -1;
        p.vx += moveDir * MOVE_ACCEL * dt;
        if (Math.abs(p.vx) > MAX_SPEED) {
          p.vx = Math.sign(p.vx) * MAX_SPEED;
        }
      } else {
        // Snappy deceleration
        const decel = (this.grounded ? 2600 : 1400) * dt;
        if (Math.abs(p.vx) <= decel) p.vx = 0;
        else p.vx -= Math.sign(p.vx) * decel;
      }

      // Gravity
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    } else {
      p.vx = 0;
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    }

    // Move & Collide
    const wallHit = this.moveAndCollide(p, dt, this.dropThroughTimer > 0);

    // Wall-slide check
    p.wallSlideDir = 0;
    if (!this.grounded && wallHit !== 0 && p.vy > 0 && moveDir === wallHit) {
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

    // Coyote time & Jump reset
    if (this.grounded) {
      this.coyoteTimer = 0.11;
      this.jumpsLeft = 2;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    // Execute buffered jump (Ground / Coyote -> Wall-Jump -> Double Jump)
    if (this.jumpBufferTimer > 0 && !p.healing && this.dropThroughTimer <= 0) {
      if (this.coyoteTimer > 0) {
        p.vy = JUMP_VEL;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpsLeft = 1;
        this.jumpBufferTimer = 0;
        sfx.jump(false);
        this.spawnBurst(p.x + p.w / 2, p.y + p.h, '#cbd5e1', 5);
      } else if (p.wallSlideDir !== 0 || wallHit !== 0) {
        const kickDir = p.wallSlideDir !== 0 ? -p.wallSlideDir : -wallHit;
        p.vx = kickDir * 440;
        p.vy = JUMP_VEL * 0.96;
        p.facing = kickDir > 0 ? 1 : -1;
        this.jumpsLeft = 1;
        this.jumpBufferTimer = 0;
        sfx.jump(true);
        this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#4ade80', 7);
      } else if (this.jumpsLeft > 0) {
        p.vy = DOUBLE_JUMP_VEL;
        this.jumpsLeft--;
        this.jumpBufferTimer = 0;
        sfx.jump(true);
        this.spawnRing(p.x + p.w / 2, p.y + p.h, '#4ade80', 18);
      }
    }

    // Active Swing Hitbox
    if (p.swingTimer > 0) {
      p.swingTimer -= dt;
      this.checkSwingHits();
    }

    // Spike Damage check (if not invuln and not pogoing safely)
    for (const sp of this.room.spikes) {
      if (this.aabb(p.x + 4, p.y + 4, p.w - 8, p.h - 4, sp.x + 3, sp.y + 4, sp.w - 6, sp.h - 4)) {
        this.damageLocalPlayer(1, p.x + p.w / 2 < sp.x + sp.w / 2 ? -260 : 260, -420, 'spike');
        break;
      }
    }

    // Held attack direction preview helper unused directly, handled on trigger
    void holdUp;
  }

  private moveAndCollide(
    ent: { x: number; y: number; w: number; h: number; vx: number; vy: number },
    dt: number,
    ignoreOneWay: boolean,
  ): -1 | 0 | 1 {
    let wallHit: -1 | 0 | 1 = 0;

    // Horizontal
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
    // Check wall proximity even if vx==0 for forgiving wall-jump
    if (wallHit === 0) {
      for (const plat of this.room.platforms) {
        if (plat.oneWay) continue;
        if (ent.y + ent.h > plat.y + 4 && ent.y < plat.y + plat.h - 4) {
          if (Math.abs(ent.x + ent.w - plat.x) <= 3) wallHit = 1;
          else if (Math.abs(ent.x - (plat.x + plat.w)) <= 3) wallHit = -1;
        }
      }
    }

    // Vertical
    const prevBottom = ent.y + ent.h;
    ent.y += ent.vy * dt;
    if (ent === (this.local as unknown)) {
      this.grounded = false;
    }

    for (const plat of this.room.platforms) {
      if (plat.oneWay) {
        if (ignoreOneWay || ent.vy < 0) continue;
        if (
          prevBottom <= plat.y + 8 &&
          this.aabb(ent.x, ent.y, ent.w, ent.h, plat.x, plat.y, plat.w, plat.h)
        ) {
          ent.y = plat.y - ent.h;
          ent.vy = 0;
          if (ent === (this.local as unknown)) this.grounded = true;
        }
      } else {
        if (this.aabb(ent.x, ent.y, ent.w, ent.h, plat.x, plat.y, plat.w, plat.h)) {
          if (ent.vy > 0) {
            ent.y = plat.y - ent.h;
            ent.vy = 0;
            if (ent === (this.local as unknown)) this.grounded = true;
          } else if (ent.vy < 0) {
            ent.y = plat.y + plat.h;
            ent.vy = 0;
          }
        }
      }
    }

    return wallHit;
  }

  private performDash(): void {
    const p = this.local;
    if (this.phase !== 'playing' || p.downed || this.dashCooldown > 0 || p.dashTimer > 0) return;

    const cdMult = this.hasUpgrade('wind_cape') ? 0.7 : 1;
    p.dashTimer = DASH_TIME;
    p.invulnTimer = Math.max(p.invulnTimer, DASH_TIME + 0.06);
    this.dashCooldown = 0.54 * cdMult;
    p.healing = false;
    sfx.dash();
    this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#38bdf8', 8);

    if (this.hasUpgrade('explosive_peel')) {
      this.peelBombs.push({
        id: `pb_${Math.random()}`,
        ownerId: this.roomPeer.localPlayer.id,
        x: p.x + p.w / 2,
        y: p.y + p.h - 10,
        vy: -120,
        fuse: 0.75,
        exploded: false,
      });
    }
  }

  private performAttack(overrideDir?: SwingDir): void {
    const p = this.local;
    if (this.phase !== 'playing' || p.downed || this.attackCooldown > 0) return;

    const wDef = WEAPONS[p.weapon];
    const spdMult = this.hasUpgrade('wind_cape') ? 0.82 : 1;
    this.attackCooldown = wDef.cooldown * spdMult;
    p.healing = false;

    let dir: SwingDir = overrideDir ?? (p.facing > 0 ? 'right' : 'left');
    if (!overrideDir) {
      if ((this.keys.has('KeyS') || this.keys.has('ArrowDown')) && !this.grounded) {
        dir = 'down';
      } else if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
        dir = 'up';
      }
    }

    p.swingDir = dir;
    p.swingMax = 0.16;
    p.swingTimer = 0.16;
    this.lastAttackHitIds.clear();

    if (p.weapon === 'frying_pan') {
      sfx.panClang(false);
    } else {
      sfx.slash(dir === 'down' ? 1.25 : 1);
    }

    // Boomerang throw for horizontal/up swings
    if (wDef.isBoomerang && dir !== 'down') {
      this.spawnBoomerang(
        this.roomPeer.localPlayer.id,
        p.x + p.w / 2,
        p.y + p.h / 2 - 4,
        dir,
        true,
      );
    }

    if (this.isCoopActive()) {
      this.roomPeer.send('player_attack', {
        type: 'player_attack',
        dir,
        weapon: p.weapon,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
      });
    }

    this.checkSwingHits();
  }

  private getSwingHitbox(): { x: number; y: number; w: number; h: number } {
    const p = this.local;
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

  private checkSwingHits(): void {
    const p = this.local;
    const wDef = WEAPONS[p.weapon];
    const box = this.getSwingHitbox();
    const isPogo = p.swingDir === 'down';
    let bouncedPogo = false;

    // 1. Pogo off Spikes!
    if (isPogo && !this.lastAttackHitIds.has('spike_pogo')) {
      for (const sp of this.room.spikes) {
        if (this.aabb(box.x, box.y, box.w, box.h, sp.x, sp.y - 6, sp.w, sp.h + 6)) {
          this.lastAttackHitIds.add('spike_pogo');
          bouncedPogo = true;
          this.spawnBurst(p.x + p.w / 2, sp.y, '#fef08a', 8);
          break;
        }
      }
    }

    // 2. Hit Banana Crates
    for (const cr of this.room.crates) {
      if (cr.broken || this.lastAttackHitIds.has(cr.id)) continue;
      if (this.aabb(box.x, box.y, box.w, box.h, cr.x, cr.y, cr.w, cr.h)) {
        this.lastAttackHitIds.add(cr.id);
        cr.broken = true;
        sfx.hit();
        this.spawnBurst(cr.x + 18, cr.y + 18, '#b45309', 12);
        this.spawnBananaPickup(cr.x + 18, cr.y + 10, 2);
        if (isPogo) bouncedPogo = true;
        if (this.isCoopActive()) {
          this.roomPeer.send('crate_break', { type: 'crate_break', crateId: cr.id });
        }
      }
    }

    // 3. Hit Enemies & Boss
    for (const e of this.room.enemies) {
      if (e.hp <= 0 || this.lastAttackHitIds.has(e.id)) continue;
      if (this.aabb(box.x, box.y, box.w, box.h, e.x, e.y, e.w, e.h)) {
        this.lastAttackHitIds.add(e.id);
        this.resolveHitOnEnemy(e, wDef.damage, isPogo, p.swingDir);
        if (isPogo) bouncedPogo = true;
      }
    }

    // 4. Co-op Revive OR Friendly Knockback on Remote Teammates!
    if (this.isCoopActive()) {
      for (const rp of this.remotes.values()) {
        if (rp.roomIndex !== this.roomIndex || this.lastAttackHitIds.has(rp.id)) continue;
        if (this.aabb(box.x, box.y, box.w, box.h, rp.x, rp.y, 34, 46)) {
          this.lastAttackHitIds.add(rp.id);
          if (rp.downed) {
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
      const springMult = this.hasUpgrade('pogo_spring') ? 1.13 : 1;
      p.vy = -545 * wDef.pogoBoost * springMult;
      this.jumpsLeft = Math.max(1, this.jumpsLeft);
      this.dashCooldown = Math.min(this.dashCooldown, 0.15);
      sfx.pogo();
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);
    }
  }

  private resolveHitOnEnemy(
    e: EnemyEntity,
    baseDmg: number,
    isPogo: boolean,
    dir: SwingDir,
    fromProjectile = false,
  ): void {
    const wDef = WEAPONS[this.local.weapon];
    let dmg = baseDmg;
    let isCrit = false;

    // Pogo Spring bonus
    if (isPogo && this.hasUpgrade('pogo_spring')) {
      dmg *= 1.25;
    }

    // Frying Pan Airborne Crit!
    if (!e.grounded && e.kind !== 'gorilla_ceo' && wDef.airCritMultiplier > 1.2) {
      dmg *= wDef.airCritMultiplier;
      isCrit = true;
    }

    // Bald Monkey Crit upgrade
    if (this.hasUpgrade('bald_crit') && Math.random() < 0.28) {
      dmg *= 2;
      isCrit = true;
    }

    // CLT Beetle Front Briefcase Shield check
    const hitFromFront =
      !isPogo &&
      e.kind === 'clt_beetle' &&
      ((dir === 'right' && e.facing === -1) || (dir === 'left' && e.facing === 1));
    if (hitFromFront && !isCrit) {
      dmg = Math.max(4, Math.round(dmg * 0.35));
      this.addFloatingText(e.x + e.w / 2, e.y - 10, '💼 BLINDADO!', '#94a3b8', 12);
    } else if (isPogo && e.kind === 'clt_beetle') {
      dmg *= 1.35;
    }

    dmg = Math.round(dmg);
    const kbDir = this.local.x + 17 < e.x + e.w / 2 ? 1 : -1;
    const kbX = e.kind === 'gorilla_ceo' ? 0 : kbDir * wDef.knockback;
    const kbY = e.kind === 'gorilla_ceo' ? 0 : isPogo ? 60 : -190;

    // Fill Potassium
    const potGain = this.hasUpgrade('potassium_turbo') ? 21 : 14;
    this.local.potassium = Math.min(100, this.local.potassium + potGain);
    this.damageDealt += dmg;

    if (isCrit && this.local.weapon === 'frying_pan') {
      sfx.panClang(true);
    } else {
      sfx.hit();
    }

    this.hitstopTimer = Math.max(this.hitstopTimer, isCrit ? 0.055 : 0.03);
    this.triggerShake(isCrit ? 0.14 : 0.08, isCrit ? 6 : 3);

    if (this.isHostAuthority()) {
      this.applyEnemyDamage(e, dmg, kbX, kbY, isCrit, isPogo, !fromProjectile);
    } else {
      // Predict flash & send hit to host
      e.hitFlash = 0.1;
      this.addFloatingText(
        e.x + e.w / 2,
        e.y - 8,
        isCrit ? `CRÍTICO ${dmg}!` : `${dmg}`,
        isCrit ? '#facc15' : '#ffffff',
        isCrit ? 18 : 14,
      );
      this.roomPeer.send('enemy_hit', {
        type: 'enemy_hit',
        enemyId: e.id,
        dmg,
        kbX,
        kbY,
        isCrit,
        isPogo,
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
  ): void {
    e.hp -= dmg;
    e.hitFlash = 0.11;
    if (e.kind !== 'gorilla_ceo') {
      e.vx = kbX;
      if (kbY !== 0) {
        e.vy = kbY;
        e.grounded = false;
      }
    }

    if (spawnLocalText) {
      this.addFloatingText(
        e.x + e.w / 2,
        e.y - 10,
        isCrit ? `💥 CRÍTICO ${dmg}!` : isPogo ? `🦘 ${dmg}` : `${dmg}`,
        isCrit ? '#facc15' : isPogo ? '#4ade80' : '#ffffff',
        isCrit ? 19 : 14,
      );
    }

    this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, isCrit ? '#facc15' : '#fb7185', isCrit ? 14 : 8);

    // Boss Phase 2 Trigger
    if (e.kind === 'gorilla_ceo' && e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      sfx.screech();
      this.triggerShake(0.35, 10);
      this.addFloatingText(e.x + e.w / 2, e.y - 30, '🔥 DEMISSÃO EM MASSA (FASE 2)!', '#ef4444', 20);
    }

    if (e.hp <= 0) {
      e.hp = 0;
      this.kills++;
      this.score += e.kind === 'gorilla_ceo' ? 1200 : 100;
      sfx.explosion();
      this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, '#facc15', 20);
      const count = (e.kind === 'gorilla_ceo' ? 12 : 2) + (this.hasUpgrade('clt_bonus') ? 1 : 0);
      this.spawnBananaPickup(e.x + e.w / 2, e.y + e.h / 2, count);
    }
  }

  private spawnBoomerang(
    ownerId: string,
    x: number,
    y: number,
    dir: SwingDir,
    localOwned: boolean,
  ): void {
    const speed = 640;
    const vx = dir === 'right' ? speed : dir === 'left' ? -speed : 0;
    const vy = dir === 'up' ? -speed : 0;
    this.boomerangs.push({
      id: `bm_${Math.random()}`,
      ownerId: localOwned ? ownerId : `remote_${ownerId}`,
      x,
      y,
      vx,
      vy,
      age: 0,
      returning: false,
      angle: 0,
      hitIds: new Set(),
    });
  }

  private updateBoomerangs(dt: number): void {
    const localId = this.roomPeer.localPlayer.id;
    for (let i = this.boomerangs.length - 1; i >= 0; i--) {
      const b = this.boomerangs[i];
      b.age += dt;
      b.angle += dt * 22;

      const isMine = b.ownerId === localId;
      const targetX = this.local.x + this.local.w / 2;
      const targetY = this.local.y + this.local.h / 2;

      if (!b.returning && b.age > 0.34) {
        b.returning = true;
        b.hitIds.clear(); // Can hit enemies again on return!
      }

      if (b.returning && isMine) {
        const dx = targetX - b.x;
        const dy = targetY - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        b.vx = (dx / dist) * 680;
        b.vy = (dy / dist) * 680;
        if (dist < 28) {
          this.boomerangs.splice(i, 1);
          continue;
        }
      } else if (b.age > 1.2) {
        this.boomerangs.splice(i, 1);
        continue;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (isMine) {
        for (const e of this.room.enemies) {
          if (e.hp <= 0 || b.hitIds.has(e.id)) continue;
          if (this.aabb(b.x - 14, b.y - 14, 28, 28, e.x, e.y, e.w, e.h)) {
            b.hitIds.add(e.id);
            this.resolveHitOnEnemy(e, WEAPONS.havaiana_boomerang.damage, false, b.vx >= 0 ? 'right' : 'left', true);
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
        for (const e of this.room.enemies) {
          if (e.hp <= 0) continue;
          const dist = Math.hypot(e.x + e.w / 2 - b.x, e.y + e.h / 2 - b.y);
          if (dist < 110) {
            this.resolveHitOnEnemy(e, 38, false, 'right', true);
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
            e.stateTimer = 0.4;
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
            e.stateTimer = 0.42;
          } else if (e.state === 'windup' && e.stateTimer <= 0) {
            e.state = 'patrol';
            e.stateTimer = 1.3;
            e.vx = e.facing * 260;
            e.vy = -530;
            e.grounded = false;
          }
        }
        this.moveEnemySolid(e, dt);
      } else if (e.kind === 'gorilla_ceo') {
        this.updateGorillaBossAI(e, dt, target);
      }

      // Contact damage with local player
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

  private updateGorillaBossAI(
    b: EnemyEntity,
    dt: number,
    target: { x: number; y: number },
  ): void {
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
          // Earthquake Slam
          b.stateTimer = 0.65 / speedMult;
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '💢 SOCO TERREMOTO!', '#f97316', 17);
        } else if (b.attackPattern === 1) {
          // Briefcase Dash
          b.stateTimer = 0.72 / speedMult;
          b.targetX = target.x;
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '💼 INVESTIDA DE MALETA!', '#ef4444', 17);
        } else if (b.attackPattern === 2) {
          // Red Stock Chart Rain
          b.stateTimer = 0.75 / speedMult;
          this.addFloatingText(b.x + b.w / 2, b.y - 24, '📉 CHUVA DE AÇÕES EM QUEDA!', '#fb7185', 17);
        } else {
          // Crushing Leap
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
          // Twin Ground Shockwaves!
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
          // Charge across arena!
          b.facing = (b.targetX ?? target.x) >= b.x + b.w / 2 ? 1 : -1;
          b.vx = b.facing * (b.phase === 2 ? 640 : 540);
          b.stateTimer = 0.85;
        } else if (b.attackPattern === 2) {
          // Spawn Stock Chart Rain telegraphs
          const count = b.phase === 2 ? 7 : 5;
          const labels = ['IBOV -12%', 'SELIC +2%', 'DEMISSÃO', 'CALL ZERO', 'FARIA LIMA'];
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
            // Store label via delayed projectile trigger inside updateTelegraphs
            void labels;
          }
          b.state = 'recover';
          b.stateTimer = 1.2 / speedMult;
        } else {
          // Crushing Leap
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
          // Leaves boss dizzy for a big Pogo punish window!
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
      if (pr.kind === 'coconut') {
        pr.vy += GRAVITY * 0.42 * dt;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      // Wall/floor check
      let hitWall = false;
      for (const plat of this.room.platforms) {
        if (plat.oneWay) continue;
        if (this.aabb(pr.x - pr.radius, pr.y - pr.radius, pr.radius * 2, pr.radius * 2, plat.x, plat.y, plat.w, plat.h)) {
          if (pr.kind === 'coconut' && pr.vy > 0 && pr.y < plat.y + 14) {
            pr.vy = -260;
            pr.y = plat.y - pr.radius;
          } else if (pr.kind !== 'shockwave') {
            hitWall = true;
          } else if (pr.y < plat.y) {
            // Shockwaves ride the floor until hitting side walls
            if (plat.h > 120) hitWall = true;
          }
        }
      }

      if (!this.local.downed && this.local.invulnTimer <= 0) {
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
            pr.kind === 'coconut' ? 'coco_archer' : 'gorilla_ceo',
          );
          if (pr.kind !== 'shockwave') hitWall = true;
        }
      }

      if (hitWall || pr.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateGuestProjectileDamage(): void {
    if (this.local.downed || this.local.invulnTimer > 0) return;
    for (const pr of this.projectiles) {
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
          pr.kind === 'coconut' ? 'coco_archer' : 'gorilla_ceo',
        );
        break;
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
    this.grounded = false;
    this.lastDamager = source;
    sfx.hurt();
    this.triggerShake(0.22, 8);
    this.hitstopTimer = 0.045;
    this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#ef4444', 12);

    // Chili Thorns upgrade!
    if (this.hasUpgrade('chili_thorns')) {
      this.spawnRing(p.x + p.w / 2, p.y + p.h / 2, '#fb7185', 85);
      for (const e of this.room.enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(e.x + e.w / 2 - (p.x + p.w / 2), e.y + e.h / 2 - (p.y + p.h / 2)) < 130) {
          this.resolveHitOnEnemy(e, 28, false, 'right', true);
        }
      }
    }

    if (p.hp <= 0) {
      p.downed = true;
      p.reviveTimer = 18;
      this.addFloatingText(p.x + p.w / 2, p.y - 14, '💫 CAIU!', '#fb7185', 18);
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
    const px = this.local.x + this.local.w / 2;
    const py = this.local.y + this.local.h / 2;

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

      const d = Math.hypot(px - pk.x, py - pk.y);
      if (d < 85 && !this.local.downed) {
        pk.x += ((px - pk.x) / (d || 1)) * 420 * dt;
        pk.y += ((py - pk.y) / (d || 1)) * 420 * dt;
      }
      if (d < 26 && !this.local.downed) {
        this.bananas += pk.value;
        this.score += 15;
        this.local.potassium = Math.min(100, this.local.potassium + 6);
        sfx.pickup();
        this.pickups.splice(i, 1);
        continue;
      }

      if (pk.life <= 0) {
        this.pickups.splice(i, 1);
      }
    }
  }

  private tryInteract(): void {
    if (this.phase !== 'playing' || this.local.downed) return;
    const px = this.local.x + this.local.w / 2;
    const py = this.local.y + this.local.h / 2;

    // 1. Check nearby chest
    for (const ch of this.room.chests) {
      if (Math.hypot(px - (ch.x + 21), py - (ch.y + 16)) < 68) {
        const nextWeapon = ch.weaponId;
        const prevWeapon = this.local.weapon;
        ch.weaponId = prevWeapon;
        ch.opened = true;
        this.local.weapon = nextWeapon;
        sfx.pickup();
        this.spawnBurst(ch.x + 21, ch.y + 10, WEAPONS[nextWeapon].color, 16);
        this.addFloatingText(px, py - 24, `⚔️ ${WEAPONS[nextWeapon].name}!`, WEAPONS[nextWeapon].color, 16);
        if (this.isCoopActive()) {
          this.roomPeer.send('chest_open', { type: 'chest_open', chestId: ch.id });
        }
        return;
      }
    }

    // 2. Check Portal
    if (this.roomCleared && Math.hypot(px - this.room.portalX, py - (this.room.portalY + 36)) < 74) {
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
        },
      });
    }

    if (this.isHostAuthority()) {
      this.worldSnapAccum += dt;
      if (this.worldSnapAccum >= 0.055) {
        this.worldSnapAccum = 0;
        this.roomPeer.send('world_snapshot', {
          type: 'world_snapshot',
          roomIndex: this.roomIndex,
          roomCleared: this.roomCleared,
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
          })),
          projectiles: this.projectiles,
          telegraphs: this.telegraphs,
        });
      }
    }
  }

  private updateCameraAndShake(dt: number): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const targetX = Math.max(0, Math.min(this.room.width - cw, this.local.x + 17 - cw / 2));
    const targetY = Math.max(0, Math.min(this.room.height - ch, this.local.y + 23 - ch * 0.56));
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
    const cw = this.canvas.width;
    const ch = this.canvas.height;
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
    const nearPortal = Math.hypot(px - this.room.portalX, py - (this.room.portalY + 36)) < 74;

    renderWorld(this.ctx, cw, ch, {
      room: this.room,
      local: this.local,
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
      nearPortal,
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
  ): void {
    this.particles.push({ x, y, vx, vy, color, size, life, maxLife: life });
  }

  private spawnBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 220;
      this.spawnParticle(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd - 60, color, 4 + Math.random() * 4, 0.35 + Math.random() * 0.25);
    }
  }

  private spawnRing(x: number, y: number, color: string, size: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, color, size, life: 0.28, maxLife: 0.28, gravity: 0, kind: 'ring' });
  }

  private addFloatingText(x: number, y: number, text: string, color: string, size: number): void {
    this.floatingTexts.push({ x, y, vy: -48, text, color, size, life: 0.95, maxLife: 0.95 });
  }

  // DOM Overlays & Input Binding
  private createFkButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText =
      'position:fixed;top:86px;right:12px;pointer-events:auto;display:none;align-items:center;gap:6px;background:rgba(15,23,42,0.9);color:#f8fafc;border:2px solid #4ade80;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer;';
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
    if (!this.isCoopActive()) return;
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
      <div style="background:rgba(15,23,42,0.96);border:3px solid #facc15;border-radius:20px;padding:26px 32px;max-width:560px;width:92%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.75);">
        <div style="font-size:46px;margin-bottom:4px;">🥥⚔️🐒</div>
        <h1 style="margin:0;font-size:30px;font-weight:900;color:#fef08a;letter-spacing:0.5px;">HOLLOW CHIMP</h1>
        <div style="font-size:15px;font-weight:800;color:#4ade80;margin-bottom:14px;">MASMORRA DA BANANA</div>
        <p style="margin:0 0 16px;font-size:14px;color:#cbd5e1;line-height:1.45;">
          Roguelite Monkey Slop inspirado em <b>Dead Cells & Hollow Knight</b>.<br/>
          Dê <b>Pogo-Jump</b> em espinhos e inimigos, encha seu Potássio para comer bananas e derrote o <b>Gorilão CEO da Faria Lima</b>!
        </p>
        <div style="text-align:left;background:#1e293b;border-radius:12px;padding:12px 16px;font-size:12.5px;color:#e2e8f0;line-height:1.65;margin-bottom:18px;">
          <div>🏃 <b>A / D</b>: Correr &nbsp;|&nbsp; 🦘 <b>W / Espaço</b>: Pulo, Pulo Duplo e <b>Wall-Jump</b></div>
          <div>💨 <b>Shift / K</b>: Rolamento com invencibilidade (iframe)</div>
          <div>⚔️ <b>J / Z / Clique</b>: Atacar &nbsp;|&nbsp; 🔥 <b>S + J no ar</b>: <b>POGO-JUMP!</b></div>
          <div>🍌 <b>Segurar Q / F</b>: Comer Banana (cura HP com Potássio) &nbsp;|&nbsp; 📦 <b>E</b>: Baús / Portal</div>
        </div>
        <button id="mc-play-btn" style="background:#facc15;color:#0f172a;border:none;border-radius:14px;padding:14px 28px;font-size:18px;font-weight:900;cursor:pointer;box-shadow:0 5px 0 #ca8a04;width:100%;">
          ⚔️ JOGAR AGORA (Enter / Espaço)
        </button>
      </div>
    `;
    this.uiRoot.appendChild(el);
    el.querySelector<HTMLButtonElement>('#mc-play-btn')!.onclick = () => {
      sfx.click();
      this.startNewRun();
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

      if (this.phase === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
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
          e.preventDefault();
          sfx.click();
          this.startNewRun();
        }
        return;
      }

      if (!e.repeat) {
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
          this.jumpBufferTimer = 0.12;
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
          this.performDash();
        }
        if (e.code === 'KeyJ' || e.code === 'KeyZ') {
          this.performAttack();
        }
        if (e.code === 'KeyE') {
          this.tryInteract();
        }
        if (e.code === 'KeyT') {
          this.toggleFriendlyKnockback();
        }
      }

      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        if (this.local.vy < -180) {
          this.local.vy *= 0.52;
        }
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.phase !== 'playing' || e.button !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const worldX = e.clientX - rect.left + this.camX;
      const worldY = e.clientY - rect.top + this.camY;
      const px = this.local.x + 17;
      const py = this.local.y + 23;
      const dx = worldX - px;
      const dy = worldY - py;

      if (!this.grounded && dy > 32 && Math.abs(dy) > Math.abs(dx) * 0.75) {
        this.performAttack('down');
      } else if (dy < -42 && Math.abs(dy) > Math.abs(dx)) {
        this.performAttack('up');
      } else {
        this.local.facing = dx >= 0 ? 1 : -1;
        this.performAttack(dx >= 0 ? 'right' : 'left');
      }
    });
  }

  private handleResize = (): void => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.uiRoot.remove();
  }
}
