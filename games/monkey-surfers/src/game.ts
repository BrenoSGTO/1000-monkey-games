import { surfersAudio } from './audio';
import { spawnJetpackSkyCoins, TrackGenerator } from './generator';
import { laneToWorldX, projectWorld, createCameraState } from './projection';
import { renderGame, type FloatingText, type Particle } from './renderer';
import {
  BASE_SPEED,
  BOARD_DURATION,
  CAUGHT_PHRASES,
  FAST_FALL_VEL,
  GRAVITY,
  JETPACK_HEIGHT,
  JUMP_VEL,
  MAX_SPEED,
  MISSION_POOL,
  ROLL_DURATION,
  SNEAKER_JUMP_VEL,
  SPEED_ACCEL,
  STUMBLE_DURATION,
  TRAIN_HEIGHT,
  type ActivePowerups,
  type BananaCoin,
  type LaneIndex,
  type MissionMetric,
  type Obstacle,
  type PersistentSave,
  type PowerupItem,
  type PowerupKind,
  type RemoteSurferState,
} from './types';

export interface RunSummary {
  score: number;
  meters: number;
  bananasCollected: number;
  reason: string;
  isNewBest: boolean;
}

export class SurfersEngine {
  private generator: TrackGenerator;
  public seed = 1000;

  public time = 0;
  public running = false;
  public alive = true;
  public distance = 0;
  public speed = BASE_SPEED;
  public score = 0;
  public runBananas = 0;
  public rooftopsVisited = new Set<number>();

  public targetLane: LaneIndex = 1;
  public prevLane: LaneIndex = 1;
  public playerLaneX = 0;
  public playerY = 0;
  public playerVy = 0;
  public grounded = true;
  public rolling = false;
  public rollTimer = 0;

  public stumbleTimer = 0;
  public invulnTimer = 0;
  public boardTimer = 0;
  public chaserDist = 0.25;
  public shake = 0;

  public powerups: ActivePowerups = {
    jetpack: 0,
    sneakers: 0,
    magnet: 0,
    multiplier: 0,
  };

  public obstacles: Obstacle[] = [];
  public coins: BananaCoin[] = [];
  public powerupItems: PowerupItem[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];

  private jumpBuffer = 0;
  private rollBuffer = 0;
  private hornCooldown = 0;

  private onMissionCompleted?: (reward: number, label: string) => void;
  private onRunEnd?: (summary: RunSummary) => void;

  constructor(
    public save: PersistentSave,
    hooks?: {
      onMissionCompleted?: (reward: number, label: string) => void;
      onRunEnd?: (summary: RunSummary) => void;
    },
  ) {
    this.seed = Math.floor(Math.random() * 999999) + 1;
    this.generator = new TrackGenerator(this.seed);
    this.onMissionCompleted = hooks?.onMissionCompleted;
    this.onRunEnd = hooks?.onRunEnd;
    this.resetWorld(this.seed, false);
  }

  public resetWorld(seed: number, startActive: boolean): void {
    this.seed = seed;
    this.generator.reset(seed);
    this.running = startActive;
    this.alive = true;
    this.distance = 0;
    this.speed = BASE_SPEED;
    this.score = 0;
    this.runBananas = 0;
    this.rooftopsVisited.clear();

    this.targetLane = 1;
    this.prevLane = 1;
    this.playerLaneX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.grounded = true;
    this.rolling = false;
    this.rollTimer = 0;
    this.stumbleTimer = 0;
    this.invulnTimer = 0;
    this.boardTimer = 0;
    this.chaserDist = startActive ? 0.12 : 0.22;
    this.shake = 0;
    this.jumpBuffer = 0;
    this.rollBuffer = 0;

    this.powerups = { jetpack: 0, sneakers: 0, magnet: 0, multiplier: 0 };
    this.obstacles = [];
    this.coins = [];
    this.powerupItems = [];
    this.particles = [];
    this.floatingTexts = [];

    this.generator.generateUntil(150, this.obstacles, this.coins, this.powerupItems);
  }

  public advancePreview(dt: number): void {
    this.distance += 11 * dt;
    this.generator.generateUntil(this.distance + 145, this.obstacles, this.coins, this.powerupItems);
    this.obstacles = this.obstacles.filter((o) => o.z + o.length > this.distance - 14);
    this.coins = this.coins.filter((c) => !c.collected && c.z > this.distance - 8);
    this.powerupItems = this.powerupItems.filter((p) => !p.collected && p.z > this.distance - 8);
  }

  public switchLane(dir: -1 | 1): void {
    if (!this.running || !this.alive) return;
    const next = Math.max(0, Math.min(2, this.targetLane + dir)) as LaneIndex;
    if (next !== this.targetLane) {
      this.prevLane = this.targetLane;
      this.targetLane = next;
      surfersAudio.playSwipe();
    }
  }

  public requestJump(): void {
    if (!this.running || !this.alive) return;
    this.jumpBuffer = 0.14;
  }

  public requestRoll(): void {
    if (!this.running || !this.alive) return;
    if (this.powerups.jetpack > 0) return;
    this.rollBuffer = 0.14;
    if (!this.grounded && this.playerVy > FAST_FALL_VEL) {
      this.playerVy = FAST_FALL_VEL;
    }
  }

  public activateBoard(width: number, height: number): boolean {
    if (!this.running || !this.alive) return false;
    if (this.boardTimer > 0 || this.save.boardCharges <= 0) return false;
    this.save.boardCharges -= 1;
    this.boardTimer = BOARD_DURATION;
    surfersAudio.playBoardOn();
    this.spawnText('PRANCHA ATIVA!', width * 0.5, height * 0.56, '#4ade80', 1.25);
    this.bumpMission('boards', 1);
    return true;
  }

  public getTotalMultiplier(): number {
    return this.save.permanentMult * (this.powerups.multiplier > 0 ? 2 : 1);
  }

  private bumpMission(metric: MissionMetric, amount: number, isAbsolute = false): void {
    let completedAny = false;
    for (const slot of this.save.missions) {
      const def = MISSION_POOL[slot.index % MISSION_POOL.length];
      if (def.metric !== metric) continue;
      slot.progress = isAbsolute ? Math.max(slot.progress, amount) : slot.progress + amount;
      if (slot.progress >= def.target) {
        this.save.bananas += def.rewardBananas;
        slot.index = (slot.index + 3) % MISSION_POOL.length;
        slot.progress = 0;
        this.save.permanentMult = Math.min(10, this.save.permanentMult + 1);
        completedAny = true;
        surfersAudio.playMissionComplete();
        this.onMissionCompleted?.(
          def.rewardBananas,
          `Missão concluída! +${def.rewardBananas}🍌 (Mult ${this.save.permanentMult}x)`,
        );
      }
    }
    if (completedAny) {
      // Save handled by main
    }
  }

  private spawnParticles(x: number, y: number, color: string, count: number, speedPx = 180): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.9) * speedPx;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        size: 3 + Math.random() * 4.5,
        color,
        alpha: 1,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75,
      });
    }
  }

  private spawnText(text: string, x: number, y: number, color: string, scale = 1): void {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -55,
      color,
      scale,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  private getScreenPos(width: number, height: number, wx: number, wy: number, wz: number): { x: number; y: number } {
    const cam = createCameraState(width, height, this.distance, this.playerLaneX, this.playerY);
    const pt = projectWorld(cam, wx, wy, wz);
    return { x: pt.x, y: pt.y };
  }

  public step(dt: number, width: number, height: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 36);
    this.hornCooldown = Math.max(0, this.hornCooldown - dt);

    // Update particles & floating texts even when dead/menu
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) this.floatingTexts.splice(i, 1);
    }

    if (!this.running || !this.alive) return;

    // Progressive speed
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_ACCEL * dt);
    const jetMult = this.powerups.jetpack > 0 ? 1.48 : 1;
    const stepZ = this.speed * jetMult * dt;
    this.distance += stepZ;
    this.score += stepZ * 2.2 * this.getTotalMultiplier();
    this.bumpMission('meters', Math.floor(this.distance), true);

    // Smooth lane X interpolation
    const targetX = this.targetLane - 1;
    const dx = targetX - this.playerLaneX;
    const laneSpeed = 14.5;
    if (Math.abs(dx) < laneSpeed * dt) {
      this.playerLaneX = targetX;
    } else {
      this.playerLaneX += Math.sign(dx) * laneSpeed * dt;
    }

    // Powerup & status timers
    if (this.powerups.jetpack > 0) this.powerups.jetpack = Math.max(0, this.powerups.jetpack - dt);
    if (this.powerups.sneakers > 0) this.powerups.sneakers = Math.max(0, this.powerups.sneakers - dt);
    if (this.powerups.magnet > 0) this.powerups.magnet = Math.max(0, this.powerups.magnet - dt);
    if (this.powerups.multiplier > 0) this.powerups.multiplier = Math.max(0, this.powerups.multiplier - dt);
    if (this.boardTimer > 0) this.boardTimer = Math.max(0, this.boardTimer - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    if (this.stumbleTimer > 0) {
      this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
      this.chaserDist = Math.max(0.05, this.chaserDist - dt * 0.4);
    } else {
      this.chaserDist = Math.min(1.3, this.chaserDist + dt * 0.32);
    }

    // Roll timer
    if (this.rollBuffer > 0) this.rollBuffer = Math.max(0, this.rollBuffer - dt);
    if (this.jumpBuffer > 0) this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.rolling) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) {
        this.rolling = false;
      }
    }

    // Ground/Train Roof height calculation underneath player
    let floorY = 0;
    let onTrainId: number | null = null;
    for (const obs of this.obstacles) {
      if (obs.destroyed) continue;
      if (obs.kind === 'train_moving') {
        obs.z += obs.speed * dt;
        if (this.hornCooldown <= 0 && obs.lane === this.targetLane && obs.z - this.distance < 34 && obs.z > this.distance) {
          surfersAudio.playTrainHorn();
          this.hornCooldown = 1.6;
        }
      }

      if (Math.abs(this.playerLaneX - (obs.lane - 1)) > 0.46) continue;

      if (obs.kind === 'train_static' || obs.kind === 'train_moving') {
        if (this.distance >= obs.z - 0.3 && this.distance <= obs.z + obs.length + 0.3) {
          if (this.playerY >= TRAIN_HEIGHT - 0.55) {
            floorY = Math.max(floorY, TRAIN_HEIGHT);
            onTrainId = obs.id;
          }
        }
      } else if (obs.kind === 'train_ramp') {
        if (this.distance >= obs.z && this.distance <= obs.z + obs.rampLength) {
          const frac = (this.distance - obs.z) / obs.rampLength;
          const rampY = frac * TRAIN_HEIGHT;
          if (this.playerY >= rampY - 0.85) {
            floorY = Math.max(floorY, rampY);
          }
        } else if (this.distance > obs.z + obs.rampLength && this.distance <= obs.z + obs.length + 0.3) {
          if (this.playerY >= TRAIN_HEIGHT - 0.65) {
            floorY = Math.max(floorY, TRAIN_HEIGHT);
            onTrainId = obs.id;
          }
        }
      }
    }

    if (onTrainId !== null && !this.rooftopsVisited.has(onTrainId)) {
      this.rooftopsVisited.add(onTrainId);
      this.bumpMission('rooftops', 1);
      const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY + 1.5, this.distance);
      this.spawnText('NO TETO! +30', sp.x, sp.y - 25, '#38bdf8', 1.0);
      this.score += 30 * this.getTotalMultiplier();
    }

    // Vertical physics (Jetpack vs normal gravity)
    if (this.powerups.jetpack > 0) {
      this.playerY += (JETPACK_HEIGHT - this.playerY) * Math.min(1, dt * 6);
      this.playerVy = 0;
      this.grounded = false;
      this.rolling = false;
      if (Math.random() < 0.5) {
        const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY + 0.4, this.distance);
        this.spawnParticles(sp.x, sp.y, '#fb923c', 1, 70);
      }
    } else {
      // Buffered Jump
      if (this.jumpBuffer > 0 && this.grounded) {
        const hasSneakers = this.powerups.sneakers > 0;
        this.playerVy = hasSneakers ? SNEAKER_JUMP_VEL : JUMP_VEL;
        this.grounded = false;
        this.rolling = false;
        this.jumpBuffer = 0;
        surfersAudio.playJump(hasSneakers);
        this.bumpMission('jumps', 1);
        const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY, this.distance);
        this.spawnParticles(sp.x, sp.y, hasSneakers ? '#4ade80' : '#fde047', 6, 110);
      }

      // Buffered Roll
      if (this.rollBuffer > 0 && (this.grounded || this.playerY - floorY < 0.8)) {
        this.rolling = true;
        this.rollTimer = ROLL_DURATION;
        this.rollBuffer = 0;
        surfersAudio.playRoll();
        this.bumpMission('rolls', 1);
      }

      this.playerVy -= GRAVITY * dt;
      this.playerY += this.playerVy * dt;

      if (this.playerY <= floorY) {
        this.playerY = floorY;
        this.playerVy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    // Generate track ahead and prune passed items
    this.generator.generateUntil(this.distance + 145, this.obstacles, this.coins, this.powerupItems);
    this.obstacles = this.obstacles.filter((o) => o.z + o.length > this.distance - 14);
    this.coins = this.coins.filter((c) => !c.collected && c.z > this.distance - 8);
    this.powerupItems = this.powerupItems.filter((p) => !p.collected && p.z > this.distance - 8);

    // Check Collisions with Obstacles (skipped during Jetpack high flight or invuln)
    if (this.invulnTimer <= 0 && this.powerups.jetpack <= 0) {
      for (const obs of this.obstacles) {
        if (obs.destroyed) continue;
        const laneDiff = Math.abs(this.playerLaneX - (obs.lane - 1));
        if (laneDiff > 0.44) continue;

        const zStart = obs.kind === 'train_ramp' ? obs.z + obs.rampLength : obs.z;
        const zEnd = obs.z + obs.length;
        if (this.distance < zStart - 0.35 || this.distance > zEnd + 0.15) continue;

        let hit = false;
        let isSideScrape = false;

        if (obs.kind === 'barrier_low') {
          if (this.playerY < 0.88) hit = true;
        } else if (obs.kind === 'barrier_high') {
          const playerTop = this.rolling ? this.playerY + 0.72 : this.playerY + 1.55;
          if (playerTop > 1.05 && this.playerY < 2.25) hit = true;
        } else if (obs.kind === 'barrier_full') {
          if (this.playerY < 2.35) hit = true;
        } else if (obs.kind === 'train_static' || obs.kind === 'train_moving' || obs.kind === 'train_ramp') {
          if (this.playerY < TRAIN_HEIGHT - 0.52) {
            hit = true;
            // Side scrape if player switched into train mid-body!
            if (this.distance > zStart + 1.1 && this.prevLane !== obs.lane) {
              isSideScrape = true;
            }
          }
        }

        if (hit) {
          const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY + 1, this.distance);
          if (this.boardTimer > 0) {
            // Hoverboard absorbs the crash!
            this.boardTimer = 0;
            this.invulnTimer = 1.6;
            this.shake = 18;
            obs.destroyed = true;
            surfersAudio.playBoardCrash();
            this.spawnParticles(sp.x, sp.y, '#4ade80', 22, 320);
            this.spawnText('PRANCHA SALVOU!', sp.x, sp.y - 40, '#4ade80', 1.3);
            break;
          } else if (isSideScrape && this.stumbleTimer <= 0) {
            // Stumble back to previous lane! Gorilla surges behind!
            this.targetLane = this.prevLane;
            this.stumbleTimer = STUMBLE_DURATION;
            this.invulnTimer = 0.65;
            this.chaserDist = 0.04;
            this.shake = 12;
            surfersAudio.playStumble();
            this.spawnParticles(sp.x, sp.y, '#fbbf24', 12, 220);
            this.spawnText('QUASE! OLHA O GORILA!', sp.x, sp.y - 35, '#fb923c', 1.15);
            break;
          } else {
            this.triggerCaught(width, height);
            return;
          }
        }
      }
    }

    // Collect Banana Coins (with Magnet attraction!)
    const magnetOn = this.powerups.magnet > 0;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const coinWX = laneToWorldX(coin.lane - 1);
      const pWX = laneToWorldX(this.playerLaneX);
      const dz = coin.z - this.distance;
      const dxW = coinWX - pWX;
      const dyW = coin.y - (this.playerY + 0.8);
      const distSq = dz * dz + dxW * dxW + dyW * dyW;

      if (magnetOn && dz > -1 && dz < 18) {
        // Pull coin toward player
        const pull = Math.min(1, dt * 13);
        coin.z += (this.distance - coin.z) * pull;
        coin.y += (this.playerY + 0.9 - coin.y) * pull;
        const targetLaneFloat = (coin.lane - 1) + (this.playerLaneX - (coin.lane - 1)) * pull;
        if (Math.abs(targetLaneFloat - this.playerLaneX) < 0.45 && Math.abs(coin.z - this.distance) < 1.3) {
          this.collectCoin(coin, width, height);
        }
      } else if (distSq < 2.25) {
        this.collectCoin(coin, width, height);
      }
    }

    // Collect Power-ups
    for (const item of this.powerupItems) {
      if (item.collected) continue;
      const dxW = laneToWorldX(item.lane - 1) - laneToWorldX(this.playerLaneX);
      const dz = item.z - this.distance;
      const dy = item.y - (this.playerY + 0.9);
      if (dxW * dxW + dz * dz + dy * dy < 2.7) {
        this.collectPowerup(item, width, height);
      }
    }
  }

  private collectCoin(coin: BananaCoin, width: number, height: number): void {
    coin.collected = true;
    const val = coin.isSpray ? 5 : 1;
    this.runBananas += val;
    this.save.bananas += val;
    this.score += (coin.isSpray ? 50 : 12) * this.getTotalMultiplier();
    surfersAudio.playCoin();
    this.bumpMission('bananas', val);
    const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY + 1.1, this.distance);
    this.spawnParticles(sp.x, sp.y, coin.isSpray ? '#ec4899' : '#facc15', coin.isSpray ? 10 : 4, 120);
    if (coin.isSpray) {
      this.spawnText('+5🍌 SPRAY!', sp.x, sp.y - 30, '#f472b6', 1.15);
    }
  }

  private collectPowerup(item: PowerupItem, width: number, height: number): void {
    item.collected = true;
    this.bumpMission('powerups', 1);
    const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY + 1.3, this.distance);
    const labels: Record<PowerupKind, { text: string; color: string; dur: number }> = {
      jetpack: { text: 'JETPACK DE COCO!', color: '#fb923c', dur: 7.0 },
      sneakers: { text: 'TÊNIS MOLA!', color: '#4ade80', dur: 10.0 },
      magnet: { text: 'ÍMÃ DE BANANAS!', color: '#f43f5e', dur: 10.0 },
      multiplier: { text: 'MULTIPLICADOR 2x!', color: '#38bdf8', dur: 12.0 },
    };
    const meta = labels[item.kind];
    this.powerups[item.kind] = meta.dur;
    if (item.kind === 'jetpack') {
      surfersAudio.playJetpackIgnite();
      spawnJetpackSkyCoins(this.coins, this.distance, this.seed);
    } else {
      surfersAudio.playPowerup();
    }
    this.spawnParticles(sp.x, sp.y, meta.color, 16, 220);
    this.spawnText(meta.text, sp.x, sp.y - 40, meta.color, 1.25);
  }

  private triggerCaught(width: number, height: number): void {
    this.alive = false;
    this.running = false;
    this.chaserDist = 0.01;
    this.shake = 24;
    surfersAudio.playCaught();

    const sp = this.getScreenPos(width, height, laneToWorldX(this.playerLaneX), this.playerY + 1, this.distance);
    this.spawnParticles(sp.x, sp.y, '#ef4444', 28, 340);

    const finalScore = Math.floor(this.score);
    const finalMeters = Math.floor(this.distance);
    const isNewBest = finalScore > this.save.bestScore;
    if (isNewBest) this.save.bestScore = finalScore;
    if (finalMeters > this.save.bestMeters) this.save.bestMeters = finalMeters;

    const reason = CAUGHT_PHRASES[Math.floor(Math.random() * CAUGHT_PHRASES.length)];
    this.onRunEnd?.({
      score: finalScore,
      meters: finalMeters,
      bananasCollected: this.runBananas,
      reason,
      isNewBest,
    });
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number, ghosts: RemoteSurferState[]): void {
    renderGame(ctx, {
      width,
      height,
      time: this.time,
      distance: this.distance,
      speed: this.speed,
      playerLaneX: this.playerLaneX,
      playerY: this.playerY,
      playerVy: this.playerVy,
      rolling: this.rolling,
      rollTimer: this.rollTimer,
      stumbleTimer: this.stumbleTimer,
      invulnTimer: this.invulnTimer,
      boardTimer: this.boardTimer,
      equippedSkin: this.save.equippedSkin,
      equippedBoard: this.save.equippedBoard,
      powerups: this.powerups,
      alive: this.alive,
      shake: this.shake,
      obstacles: this.obstacles,
      coins: this.coins,
      powerupItems: this.powerupItems,
      ghosts,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      chaserDist: this.chaserDist,
    });
  }
}
