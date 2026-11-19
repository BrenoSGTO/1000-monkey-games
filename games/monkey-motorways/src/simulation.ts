import {
  COLOR_UNLOCK_ORDER,
  DAY_DURATION_SEC,
  DAYS_PER_WEEK,
  DELIVERY_MILESTONES,
  GRID_COLS,
  GRID_ROWS,
  MARKET_NAMES,
  MONKEY_COLORS,
  RAGE_BUBBLES,
  RAGE_EMOJIS,
  UPGRADE_POOL,
} from './constants';
import { gameAudio } from './audio';
import { MAPS } from './maps';
import { findPathToCell, findPathToMarket } from './pathfinding';
import {
  buildBuildingLookup,
  cellKey,
  inBounds,
  RoadNetwork,
  type BuildingLookup,
} from './roadNetwork';
import type {
  BuildHistoryEvent,
  Car,
  DynamicTickSnapshot,
  FloatingText,
  GameSnapshot,
  GridCoord,
  House,
  Inventory,
  MapDefinition,
  MapId,
  MapPing,
  Market,
  MonkeyColor,
  NetActor,
  NetMessage,
  Particle,
  PathStep,
  PlayerContribution,
  SimSpeed,
  UpgradeOption,
} from './types';

let uidCounter = 1;
function nextId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter.toString(36)}`;
}

function wrapAngleDiff(diff: number): number {
  let d = diff;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface SimulationCallbacks {
  onToast?: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  onGameOver?: (deliveries: number, reason: string) => void;
  onPhaseChange?: () => void;
  onUpgradeOffered?: (options: UpgradeOption[]) => void;
  onUpgradeVotesChange?: () => void;
  onEmitFx?: (msg: Extract<NetMessage, { kind: 'event:fx' }>) => void;
}

export class TrafficSimulation {
  public map: MapDefinition = MAPS['rio-de-bananeiro'];
  public phase: 'menu' | 'playing' | 'upgrade' | 'gameover' = 'menu';
  public day = 1;
  public dayProgress = 0;
  public week = 1;
  public deliveries = 0;
  public speed: SimSpeed = 1;
  public prePauseSpeed: 1 | 2 = 1;

  public inventory: Inventory = { ...MAPS['rio-de-bananeiro'].startingInventory };
  public network = new RoadNetwork();

  public houses: House[] = [];
  public markets: Market[] = [];
  public cars: Car[] = [];
  public floatingTexts: FloatingText[] = [];
  public particles: Particle[] = [];
  public pings: MapPing[] = [];

  public unlockedColors: MonkeyColor[] = ['yellow'];
  public milestonesHit: number[] = [];
  public pendingUpgrades: UpgradeOption[] | null = null;
  public upgradeVotes: Record<string, number> = {};
  public playerStats: Record<string, PlayerContribution> = {};
  public lastProcessedSeq: Record<string, number> = {};
  public buildHistory: BuildHistoryEvent[] = [];

  public gameOverReason: string | null = null;
  public gameOverMarketId: string | null = null;

  public shake = 0;
  public timeSec = 0;

  private spawnCooldown = 5.5;
  private dispatchCooldown = 0;
  private lastDispatchNetworkVersion = -1;
  private unreachableCache = new Set<string>();
  private cachedLookup: BuildingLookup | null = null;
  private lastPathCheckVersion = -1;
  private warningCooldown = 0;
  private callbacks: SimulationCallbacks;
  private isAuthoritative = true;

  constructor(callbacks: SimulationCallbacks = {}) {
    this.callbacks = callbacks;
  }

  setAuthoritative(auth: boolean): void {
    this.isAuthoritative = auth;
  }

  invalidateLookup(): void {
    this.cachedLookup = null;
    this.unreachableCache.clear();
  }

  getLookup(): BuildingLookup {
    if (!this.cachedLookup) {
      this.cachedLookup = buildBuildingLookup(this.houses, this.markets);
    }
    return this.cachedLookup;
  }

  ensurePlayerStat(actor: NetActor): PlayerContribution {
    if (!this.playerStats[actor.id]) {
      this.playerStats[actor.id] = {
        id: actor.id,
        name: actor.name,
        color: actor.color,
        roadsBuilt: 0,
        bridgesBuilt: 0,
        lightsBuilt: 0,
        roundaboutsBuilt: 0,
        motorwaysBuilt: 0,
        erasedCount: 0,
        pingsSent: 0,
      };
    } else {
      this.playerStats[actor.id].name = actor.name;
      this.playerStats[actor.id].color = actor.color;
    }
    return this.playerStats[actor.id];
  }

  recordActionStat(
    actor: NetActor | undefined,
    kind: 'road' | 'bridge' | 'light' | 'roundabout' | 'motorway' | 'erase' | 'ping',
    amount = 1,
  ): void {
    if (!actor) return;
    const stat = this.ensurePlayerStat(actor);
    switch (kind) {
      case 'road':
        stat.roadsBuilt += amount;
        break;
      case 'bridge':
        stat.bridgesBuilt += amount;
        break;
      case 'light':
        stat.lightsBuilt += amount;
        break;
      case 'roundabout':
        stat.roundaboutsBuilt += amount;
        break;
      case 'motorway':
        stat.motorwaysBuilt += amount;
        break;
      case 'erase':
        stat.erasedCount += amount;
        break;
      case 'ping':
        stat.pingsSent += amount;
        break;
    }
  }

  recordBuildHistory(ev: Omit<BuildHistoryEvent, 't'>): void {
    if (this.buildHistory.length >= 1400) return;
    this.buildHistory.push({ ...ev, t: Number((this.day - 1 + this.dayProgress).toFixed(2)) });
  }

  startGame(mapId: MapId): void {
    this.map = MAPS[mapId];
    this.phase = 'playing';
    this.day = 1;
    this.dayProgress = 0;
    this.week = 1;
    this.deliveries = 0;
    this.speed = 1;
    this.prePauseSpeed = 1;
    this.inventory = { ...this.map.startingInventory };
    this.network.clear();
    this.houses = [];
    this.markets = [];
    this.cars = [];
    this.floatingTexts = [];
    this.particles = [];
    this.pings = [];
    this.unlockedColors = ['yellow'];
    this.milestonesHit = [];
    this.pendingUpgrades = null;
    this.upgradeVotes = {};
    this.playerStats = {};
    this.lastProcessedSeq = {};
    this.buildHistory = [];
    this.gameOverReason = null;
    this.gameOverMarketId = null;
    this.shake = 0;
    this.spawnCooldown = 6.5;
    this.dispatchCooldown = 0;
    this.lastDispatchNetworkVersion = this.network.version;
    this.lastPathCheckVersion = this.network.version;
    this.invalidateLookup();

    if (this.isAuthoritative) {
      this.spawnInitialCluster('yellow');
    }
    this.callbacks.onPhaseChange?.();
  }

  private spawnInitialCluster(color: MonkeyColor): void {
    const centerPrefer = this.map.initialClusterAnchor;
    const market = this.trySpawnMarket(color, centerPrefer, false);
    if (market) {
      market.pins.push({
        id: nextId('pin'),
        claimedByCarId: null,
        createdAtDay: this.day,
      });
      this.trySpawnHouse(color, { x: market.x - 3, y: market.y - 2 });
      this.trySpawnHouse(color, { x: market.x - 2, y: market.y + 4 });
    }
  }

  setSpeed(next: SimSpeed): void {
    if (this.phase === 'upgrade' || this.phase === 'gameover' || this.phase === 'menu') return;
    this.speed = next;
    if (next === 1 || next === 2) {
      this.prePauseSpeed = next;
    }
  }

  togglePause(): void {
    if (this.phase !== 'playing') return;
    if (this.speed === 0) {
      this.speed = this.prePauseSpeed;
    } else {
      this.speed = 0;
    }
  }

  castUpgradeVote(playerId: string, index: number): void {
    if (this.phase !== 'upgrade' || !this.pendingUpgrades) return;
    if (index < 0 || index >= this.pendingUpgrades.length) return;
    this.upgradeVotes[playerId] = index;
    this.callbacks.onUpgradeVotesChange?.();
  }

  pickUpgrade(index: number): boolean {
    if (this.phase !== 'upgrade' || !this.pendingUpgrades) return false;
    const chosen = this.pendingUpgrades[index];
    if (!chosen) return false;

    this.inventory.roads += chosen.roads;
    this.inventory.bridges += chosen.bridges;
    this.inventory.lights += chosen.lights;
    this.inventory.roundabouts += chosen.roundabouts;
    this.inventory.motorways += chosen.motorways;

    this.pendingUpgrades = null;
    this.upgradeVotes = {};
    this.phase = 'playing';
    this.speed = this.prePauseSpeed;
    gameAudio.playSpawnBuilding();
    this.callbacks.onToast?.(`Pacote "${chosen.title}" ativado!`, 'banana');
    this.callbacks.onPhaseChange?.();
    return true;
  }

  addPing(gx: number, gy: number, emoji: string, text: string, actor: NetActor): void {
    if (!inBounds(gx, gy)) return;
    this.pings.push({
      id: nextId('ping'),
      playerId: actor.id,
      playerName: actor.name,
      playerColor: actor.color,
      gx,
      gy,
      emoji,
      text,
      life: 3.8,
      maxLife: 3.8,
    });
    if (this.pings.length > 10) {
      this.pings.shift();
    }
    this.recordActionStat(actor, 'ping', 1);
    gameAudio.playPing();
  }

  update(rawDt: number): void {
    const dt = Math.min(rawDt, 0.08);
    this.timeSec += dt;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    this.updateVisualFX(dt);

    if (this.phase !== 'playing' || this.speed === 0) {
      return;
    }

    const simDt = dt * this.speed;

    // 1. Update traffic light phases
    this.updateTrafficLights(simDt);

    // 2. Day / Week cycle
    this.dayProgress += simDt / DAY_DURATION_SEC;
    if (this.dayProgress >= 1) {
      if (this.isAuthoritative) {
        this.dayProgress -= 1;
        this.advanceDay();
        if (this.phase !== 'playing') return;
      } else {
        this.dayProgress = 0.99;
      }
    }

    // 3. Authoritative spawns, demand & throttled dispatch
    if (this.isAuthoritative) {
      this.updateSpawner(simDt);
      this.updateMarkets(simDt);
      if (this.phase !== 'playing') return;

      if (this.network.version !== this.lastDispatchNetworkVersion) {
        this.lastDispatchNetworkVersion = this.network.version;
        this.unreachableCache.clear();
        this.dispatchCooldown = 0;
      }
      this.dispatchCooldown -= simDt;
      if (this.dispatchCooldown <= 0) {
        this.dispatchCooldown = 0.35;
        this.dispatchCars();
      }
    }

    // 4. Revalidate car paths if road network changed
    if (this.network.version !== this.lastPathCheckVersion) {
      this.lastPathCheckVersion = this.network.version;
      this.revalidateAllCarPaths();
    }

    // 5. Move cars & detect rage
    this.updateCars(simDt);
  }

  private updateVisualFX(dt: number): void {
    for (const h of this.houses) {
      if (h.spawnAnim < 1) h.spawnAnim = Math.min(1, h.spawnAnim + dt * 3.5);
    }
    for (const m of this.markets) {
      if (m.spawnAnim < 1) m.spawnAnim = Math.min(1, m.spawnAnim + dt * 3.0);
    }
    // Smooth Guest car interpolation offsets decay exponentially
    const blendDecay = Math.exp(-dt * 16);
    for (const c of this.cars) {
      if (c.vxOffset) {
        c.vxOffset *= blendDecay;
        if (Math.abs(c.vxOffset) < 0.002) c.vxOffset = 0;
      }
      if (c.vyOffset) {
        c.vyOffset *= blendDecay;
        if (Math.abs(c.vyOffset) < 0.002) c.vyOffset = 0;
      }
      if (c.vAngleOffset) {
        c.vAngleOffset *= blendDecay;
        if (Math.abs(c.vAngleOffset) < 0.005) c.vAngleOffset = 0;
      }
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].life -= dt;
      if (this.pings[i].life <= 0) this.pings.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) this.floatingTexts.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) {
        p.vy += p.gravity * dt;
      }
      if (p.rot !== undefined && p.vRot !== undefined) {
        p.rot += p.vRot * dt;
      }
      p.vx *= p.isConfetti ? 0.985 : 0.94;
      p.vy *= p.isConfetti ? 0.99 : 0.94;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private updateTrafficLights(simDt: number): void {
    for (const light of this.network.lights.values()) {
      light.timer += simDt;
      if (light.timer >= 3.2) {
        light.timer = 0;
        light.phase = light.phase === 0 ? 1 : 0;
      }
    }
  }

  private advanceDay(): void {
    const prevWeek = Math.floor((this.day - 1) / DAYS_PER_WEEK) + 1;
    this.day += 1;
    this.week = Math.floor((this.day - 1) / DAYS_PER_WEEK) + 1;

    if (this.day === 3 && !this.unlockedColors.includes('red')) {
      this.unlockNewColor('red');
    } else if (this.day === 6 && !this.unlockedColors.includes('blue')) {
      this.unlockNewColor('blue');
    } else if (this.day === 10 && !this.unlockedColors.includes('purple')) {
      this.unlockNewColor('purple');
    } else if (this.day === 15 && !this.unlockedColors.includes('green')) {
      this.unlockNewColor('green');
    }

    if (this.week > prevWeek) {
      this.offerWeeklyUpgrade();
    }
  }

  private unlockNewColor(color: MonkeyColor): void {
    this.unlockedColors.push(color);
    const theme = MONKEY_COLORS[color];
    const anchor = this.map.colorAnchors?.[color];
    const m = this.trySpawnMarket(color, anchor?.market, false);
    if (m) {
      const h1Prefer = anchor?.house1 ?? { x: m.x - 4, y: m.y };
      const h2Prefer = anchor?.house2 ?? { x: m.x + 3, y: m.y + 3 };
      this.trySpawnHouse(color, h1Prefer);
      this.trySpawnHouse(color, h2Prefer);
      this.callbacks.onToast?.(
        `Novo mercado ${theme.fruitEmoji} ${theme.label} inaugurou!`,
        'info',
      );
    }
  }

  private offerWeeklyUpgrade(): void {
    this.phase = 'upgrade';
    this.speed = 0;
    this.upgradeVotes = {};
    const pool = [...UPGRADE_POOL];
    const picks: UpgradeOption[] = [];
    if (this.map.bridgeBias && this.inventory.bridges <= 1) {
      const bridgeIdx = pool.findIndex((p) => p.bridges > 0);
      if (bridgeIdx >= 0) {
        const [item] = pool.splice(bridgeIdx, 1);
        picks.push({ ...item, id: nextId('upg') });
      }
    }
    while (picks.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const [item] = pool.splice(idx, 1);
      picks.push({ ...item, id: nextId('upg') });
    }
    this.pendingUpgrades = picks;
    gameAudio.playUpgrade();
    this.callbacks.onUpgradeOffered?.(picks);
    this.callbacks.onPhaseChange?.();
  }

  private updateSpawner(simDt: number): void {
    this.spawnCooldown -= simDt;
    if (this.spawnCooldown > 0) return;

    const mapFactor = 1 / Math.max(0.75, this.map.rushMultiplier);
    const baseInterval = Math.max(4.4, (9.5 - this.day * 0.22) * mapFactor);
    this.spawnCooldown = baseInterval + Math.random() * 2.5;

    const color =
      this.unlockedColors[Math.floor(Math.random() * this.unlockedColors.length)] ?? 'yellow';
    const colorHouses = this.houses.filter((h) => h.color === color).length;
    const colorMarkets = this.markets.filter((m) => m.color === color);

    if (colorMarkets.length === 0 || (colorHouses >= colorMarkets.length * 3 && this.markets.length < 9)) {
      const nonMega = colorMarkets.find((m) => !m.isMega);
      if (this.day >= 12 && nonMega && Math.random() < 0.45) {
        nonMega.isMega = true;
        nonMega.demandInterval = Math.max(2.3, nonMega.demandInterval * 0.72);
        this.addFloatingText(
          nonMega.x + 1,
          nonMega.y,
          'MEGA FEIRA! 🔥',
          MONKEY_COLORS[nonMega.color].fill,
        );
        gameAudio.playSpawnBuilding();
        this.callbacks.onEmitFx?.({
          kind: 'event:fx',
          fx: 'mega',
          x: nonMega.x + 1,
          y: nonMega.y,
          color: nonMega.color,
          text: 'MEGA FEIRA! 🔥',
        });
        return;
      }

      const m = this.trySpawnMarket(color, undefined, this.day >= 18 && Math.random() < 0.35);
      if (m) {
        this.trySpawnHouse(color);
        return;
      }
    }

    this.trySpawnHouse(color);
  }

  private updateMarkets(simDt: number): void {
    if (this.warningCooldown > 0) this.warningCooldown -= simDt;

    for (const m of this.markets) {
      const ramp = 1 + Math.min(1.6, this.day * 0.045);
      const mapRush = this.map.rushMultiplier;
      const megaBoost = m.isMega ? 1.4 : 1.0;
      m.demandTimer += simDt * ramp * mapRush * megaBoost;

      if (m.demandTimer >= m.demandInterval) {
        m.demandTimer = 0;
        const maxPins = m.isMega ? 11 : 9;
        if (m.pins.length < maxPins) {
          m.pins.push({
            id: nextId('pin'),
            claimedByCarId: null,
            createdAtDay: this.day,
          });
        }
      }

      const dangerLimit = m.isMega ? 8 : 6;
      if (m.pins.length >= dangerLimit) {
        const prev = m.overload;
        m.overload = Math.min(1, m.overload + simDt / 18.0);
        if (m.overload > 0.45 && this.warningCooldown <= 0) {
          const urgent = m.overload >= 0.72;
          this.warningCooldown = urgent ? 1.45 : 2.3;
          gameAudio.playWarning(urgent);
          this.callbacks.onEmitFx?.({
            kind: 'event:fx',
            fx: 'overload-warn',
            value: urgent ? 1 : 0,
          });
        }
        if (prev < 0.7 && m.overload >= 0.7) {
          this.callbacks.onToast?.(
            `🚨 ${m.name} está lotando de macacos famintos!`,
            'chaos',
          );
        }
        if (m.overload >= 1) {
          this.triggerGameOver(m);
          return;
        }
      } else {
        m.overload = Math.max(0, m.overload - simDt / 7.5);
      }
    }
  }

  private triggerGameOver(market: Market): void {
    this.phase = 'gameover';
    this.speed = 0;
    this.shake = 1.0;
    this.gameOverMarketId = market.id;
    this.gameOverReason = `${market.name} entrou em colapso por falta de entregas de ${MONKEY_COLORS[market.color].label}!`;
    gameAudio.playGameOver();
    this.callbacks.onGameOver?.(this.deliveries, this.gameOverReason);
    this.callbacks.onPhaseChange?.();
  }

  private dispatchCars(): void {
    const lookup = this.getLookup();

    for (const m of this.markets) {
      const unclaimed = m.pins.filter((p) => !p.claimedByCarId);
      if (unclaimed.length === 0) continue;

      for (const pin of unclaimed) {
        let bestHouse: House | null = null;
        let bestPath: PathStep[] | null = null;
        let bestScore = Infinity;

        for (const h of this.houses) {
          if (h.color !== m.color || h.carsParked <= 0) continue;
          const cacheKey = `${h.id}->${m.id}`;
          if (this.unreachableCache.has(cacheKey)) continue;

          const path = findPathToMarket(this.network, lookup, { x: h.x, y: h.y }, m);
          if (path && path.length >= 2) {
            const score = path.length - (h.carsParked > 1 ? 0.5 : 0);
            if (score < bestScore) {
              bestScore = score;
              bestHouse = h;
              bestPath = path;
            }
          } else {
            this.unreachableCache.add(cacheKey);
          }
        }

        if (bestHouse && bestPath) {
          bestHouse.carsParked -= 1;
          const carId = nextId('car');
          pin.claimedByCarId = carId;
          const p0 = bestPath[0];
          const p1 = bestPath[1];
          const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
          this.cars.push({
            id: carId,
            color: bestHouse.color,
            homeHouseId: bestHouse.id,
            targetMarketId: m.id,
            targetPinId: pin.id,
            state: 'toMarket',
            path: bestPath,
            segIndex: 0,
            segT: 0,
            x: p0.x + 0.5,
            y: p0.y + 0.5,
            angle,
            speed: 1.4,
            atMarketTimer: 0,
            waitTime: 0,
            rage: 0,
            hornCooldown: 0,
            moodEmoji: '',
            moodTimer: 0,
            orphanedTimer: 0,
          });
        }
      }
    }
  }

  private revalidateAllCarPaths(): void {
    const lookup = this.getLookup();

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.state === 'atMarket') continue;

      const curStep = car.path[car.segIndex];
      const nextStep = car.path[car.segIndex + 1];
      if (!curStep || !nextStep) continue;

      const segValid = nextStep.isMotorway
        ? this.network.motorways.some((mw) => mw.id === nextStep.motorwayId)
        : this.network.hasEdge(curStep.x, curStep.y, nextStep.x, nextStep.y);

      let fullValid = segValid;
      if (fullValid) {
        for (let k = car.segIndex + 1; k < car.path.length - 1; k++) {
          const a = car.path[k];
          const b = car.path[k + 1];
          const ok = b.isMotorway
            ? this.network.motorways.some((mw) => mw.id === b.motorwayId)
            : this.network.hasEdge(a.x, a.y, b.x, b.y);
          if (!ok) {
            fullValid = false;
            break;
          }
        }
      }

      if (fullValid) continue;

      const anchor = car.segT > 0.5 && segValid ? nextStep : curStep;
      let newTail: PathStep[] | null = null;

      if (car.state === 'toMarket') {
        const market = this.markets.find((m) => m.id === car.targetMarketId);
        if (market) {
          newTail = findPathToMarket(this.network, lookup, { x: anchor.x, y: anchor.y }, market);
        }
      } else {
        const home = this.houses.find((h) => h.id === car.homeHouseId);
        if (home) {
          newTail = findPathToCell(
            this.network,
            lookup,
            { x: anchor.x, y: anchor.y },
            { x: home.x, y: home.y },
          );
        }
      }

      if (newTail && newTail.length >= 2) {
        if (segValid && anchor === nextStep) {
          car.path = [curStep, ...newTail];
          car.segIndex = 0;
        } else {
          car.path = newTail;
          car.segIndex = 0;
          car.segT = 0;
        }
        car.orphanedTimer = 0;
      } else {
        car.orphanedTimer = 0.01;
      }
    }
  }

  private updateCars(simDt: number): void {
    // Guests extrapolate smoothly using current angle/speed when not authoritative
    if (!this.isAuthoritative) {
      for (const car of this.cars) {
        if (car.state === 'atMarket') continue;
        if (car.moodTimer > 0) {
          car.moodTimer -= simDt;
          if (car.moodTimer <= 0) car.moodEmoji = '';
        }
        const stepDist = car.speed * simDt * 0.72;
        car.x += Math.cos(car.angle) * stepDist;
        car.y += Math.sin(car.angle) * stepDist;
      }
      return;
    }

    const lookup = this.getLookup();

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];

      if (car.moodTimer > 0) {
        car.moodTimer -= simDt;
        if (car.moodTimer <= 0) car.moodEmoji = '';
      }
      if (car.hornCooldown > 0) {
        car.hornCooldown -= simDt;
      }

      if (car.orphanedTimer > 0) {
        car.orphanedTimer += simDt;
        car.moodEmoji = '❓';
        car.moodTimer = 0.5;
        if (car.orphanedTimer > 1.2) {
          this.returnCarHomeOrphaned(car, i);
          continue;
        }
      }

      if (car.state === 'atMarket') {
        car.atMarketTimer -= simDt;
        if (car.atMarketTimer <= 0) {
          const home = this.houses.find((h) => h.id === car.homeHouseId);
          if (!home) {
            this.cars.splice(i, 1);
            continue;
          }
          const lastStep =
            car.path[car.path.length - 1] ?? { x: Math.floor(car.x), y: Math.floor(car.y) };
          const backPath = findPathToCell(
            this.network,
            lookup,
            { x: lastStep.x, y: lastStep.y },
            { x: home.x, y: home.y },
          );
          if (backPath && backPath.length >= 2) {
            car.state = 'toHome';
            car.path = backPath;
            car.segIndex = 0;
            car.segT = 0;
            car.speed = 1.2;
          } else {
            car.orphanedTimer = 0.01;
          }
        }
        continue;
      }

      const a = car.path[car.segIndex];
      const b = car.path[car.segIndex + 1];
      if (!a || !b) {
        if (car.state === 'toMarket') {
          this.handleMarketArrival(car);
        } else {
          this.handleHomeArrival(car, i);
        }
        continue;
      }

      const segLen = Math.max(0.5, Math.hypot(b.x - a.x, b.y - a.y));
      const isMotorway = Boolean(b.isMotorway);
      car.isOnMotorway = isMotorway;
      let targetSpeed = isMotorway ? 6.2 : 3.4;

      if (!isMotorway && this.network.roundabouts.has(cellKey(b.x, b.y))) {
        targetSpeed = 3.2;
      }

      let redLightStopT: number | null = null;

      // 1. Traffic light check when approaching node b (with fixed diagonal axis grouping!)
      if (!isMotorway) {
        const light = this.network.lights.get(cellKey(b.x, b.y));
        if (light) {
          const sx = b.x - a.x;
          const sy = b.y - a.y;
          // Phase 0: N-S (sx === 0) and NW-SE (sx * sy > 0). Phase 1: E-W (sy === 0) and NE-SW (sx * sy < 0).
          const isPhase0Group = sx === 0 || sx * sy > 0;
          const isGreen =
            (light.phase === 0 && isPhase0Group) || (light.phase === 1 && !isPhase0Group);

          if (!isGreen) {
            const stopT = Math.max(0.12, 1 - 0.36 / segLen);
            const distToNode = (1 - car.segT) * segLen;
            if (distToNode < 0.65 && car.segT <= stopT + 0.08) {
              targetSpeed = 0;
              redLightStopT = stopT;
            }
          }
        } else {
          // 2. Unlit intersection yield check (degree >= 3, not roundabout, not building)
          const deg = this.network.getDegree(b.x, b.y);
          const isBuilding =
            lookup.houseByCell.has(cellKey(b.x, b.y)) ||
            lookup.marketByCell.has(cellKey(b.x, b.y));
          if (deg >= 3 && !isBuilding && !this.network.roundabouts.has(cellKey(b.x, b.y))) {
            const distToNode = (1 - car.segT) * segLen;
            if (distToNode < 0.52 && distToNode > 0.12) {
              const conflict = this.hasIntersectionConflict(car, b.x, b.y, a.x, a.y);
              if (conflict) {
                targetSpeed = 0;
              }
            }
          }
        }

        // 3. Car-following distance check on current & next segment
        const aheadFactor = this.checkCarAhead(car, a, b, segLen);
        if (aheadFactor < 1) {
          targetSpeed = Math.min(targetSpeed, aheadFactor * 3.2);
        }
      }

      // Smooth acceleration / braking
      const accelRate = targetSpeed < car.speed ? 12 : 6.5;
      car.speed += (targetSpeed - car.speed) * Math.min(1, simDt * accelRate);

      // Rage / Honking when stuck in traffic
      if (car.speed < 0.45 && car.orphanedTimer === 0) {
        car.waitTime += simDt;
        if (car.waitTime > 2.2) {
          car.rage = Math.min(1, (car.waitTime - 2.2) / 3.8);
          if (car.hornCooldown <= 0) {
            car.hornCooldown = 2.5 + Math.random() * 2.4;
            const bubble =
              Math.random() < 0.55
                ? RAGE_BUBBLES[Math.floor(Math.random() * RAGE_BUBBLES.length)]
                : RAGE_EMOJIS[Math.floor(Math.random() * RAGE_EMOJIS.length)];
            car.moodEmoji = bubble;
            car.moodTimer = 1.65;
            if (Math.random() < 0.55) {
              gameAudio.playHorn();
              this.callbacks.onEmitFx?.({
                kind: 'event:fx',
                fx: 'horn',
                x: car.x,
                y: car.y,
                text: bubble,
              });
            }
          }
        }
      } else {
        car.waitTime = Math.max(0, car.waitTime - simDt * 2.2);
        car.rage = Math.max(0, car.rage - simDt * 1.5);
      }

      // Advance along segment (with continuous red-light clamp so 2x never blows a red)
      const deltaT = (car.speed * simDt) / segLen;
      let nextSegT = car.segT + deltaT;
      if (redLightStopT !== null && nextSegT > redLightStopT) {
        nextSegT = redLightStopT;
        car.speed = 0;
      }
      car.segT = nextSegT;

      if (car.segT >= 1) {
        // Convert excess distance accurately by prevLen / nextLen so entering/exiting Motorways never teleports!
        const excessDist = (car.segT - 1) * segLen;
        car.segIndex += 1;
        if (car.segIndex >= car.path.length - 1) {
          const endNode = car.path[car.path.length - 1];
          car.x = endNode.x + 0.5;
          car.y = endNode.y + 0.5;
          if (car.state === 'toMarket') {
            this.handleMarketArrival(car);
          } else {
            this.handleHomeArrival(car, i);
          }
          continue;
        }
        const nextA = car.path[car.segIndex];
        const nextB = car.path[car.segIndex + 1];
        const nextLen = nextA && nextB ? Math.max(0.5, Math.hypot(nextB.x - nextA.x, nextB.y - nextA.y)) : 1;
        car.segT = Math.min(0.95, excessDist / nextLen);
      }

      this.updateCarPose(car);
    }
  }

  private hasIntersectionConflict(
    self: Car,
    nodeX: number,
    nodeY: number,
    fromX: number,
    fromY: number,
  ): boolean {
    for (const other of this.cars) {
      if (other.id === self.id || other.state === 'atMarket') continue;
      const oa = other.path[other.segIndex];
      const ob = other.path[other.segIndex + 1];
      if (!oa || !ob || ob.isMotorway) continue;

      const distOtherToNode = Math.hypot(other.x - (nodeX + 0.5), other.y - (nodeY + 0.5));
      if (distOtherToNode < 0.34) {
        if (oa.x === fromX && oa.y === fromY && ob.x === nodeX && ob.y === nodeY) {
          continue;
        }
        if (other.speed > 0.5 || other.id < self.id) {
          return true;
        }
      }
    }
    return false;
  }

  private checkCarAhead(car: Car, a: PathStep, b: PathStep, segLen: number): number {
    let minGap = Infinity;
    const nextC = car.path[car.segIndex + 2];

    for (const other of this.cars) {
      if (other.id === car.id || other.state === 'atMarket') continue;
      const oa = other.path[other.segIndex];
      const ob = other.path[other.segIndex + 1];
      if (!oa || !ob || ob.isMotorway) continue;

      if (oa.x === a.x && oa.y === a.y && ob.x === b.x && ob.y === b.y) {
        if (other.segT > car.segT) {
          const gap = (other.segT - car.segT) * segLen;
          if (gap < minGap) minGap = gap;
        }
      } else if (
        nextC &&
        !nextC.isMotorway &&
        oa.x === b.x &&
        oa.y === b.y &&
        ob.x === nextC.x &&
        ob.y === nextC.y
      ) {
        const nextLen = Math.max(0.5, Math.hypot(nextC.x - b.x, nextC.y - b.y));
        const gap = (1 - car.segT) * segLen + other.segT * nextLen;
        if (gap < minGap) minGap = gap;
      }
    }

    if (minGap < 0.36) return 0;
    if (minGap < 0.62) return (minGap - 0.36) / 0.26;
    return 1;
  }

  private updateCarPose(car: Car): void {
    const a = car.path[car.segIndex];
    const b = car.path[car.segIndex + 1];
    if (!a || !b) return;

    const ax = a.x + 0.5;
    const ay = a.y + 0.5;
    const bx = b.x + 0.5;
    const by = b.y + 0.5;

    if (b.isMotorway) {
      car.isOnMotorway = true;
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5 - Math.min(3.5, Math.hypot(bx - ax, by - ay) * 0.24);
      const t = car.segT;
      const inv = 1 - t;
      car.x = inv * inv * ax + 2 * inv * t * mx + t * t * bx;
      car.y = inv * inv * ay + 2 * inv * t * my + t * t * by;
      const tx = 2 * inv * (mx - ax) + 2 * t * (bx - mx);
      const ty = 2 * inv * (my - ay) + 2 * t * (by - my);
      car.angle = Math.atan2(ty, tx);
      return;
    }

    car.isOnMotorway = false;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    // Right-hand lane normal
    const nx = -dy / len;
    const ny = dx / len;
    const laneOffset = 0.13;

    let px = ax + dx * car.segT + nx * laneOffset;
    let py = ay + dy * car.segT + ny * laneOffset;
    let steerAngle = Math.atan2(dy, dx);

    const aIsRb = this.network.roundabouts.has(cellKey(a.x, a.y));
    const bIsRb = this.network.roundabouts.has(cellKey(b.x, b.y));

    // Orbit smoothly around roundabout green island!
    if (bIsRb && car.segT > 0.42) {
      const u = (car.segT - 0.42) / 0.58;
      const orbitBump = Math.sin(u * Math.PI * 0.5) * 0.22;
      px += nx * orbitBump;
      py += ny * orbitBump;
      steerAngle += Math.sin(u * Math.PI * 0.5) * 0.35;
    } else if (aIsRb && car.segT < 0.58) {
      const u = 1 - car.segT / 0.58;
      const orbitBump = Math.sin(u * Math.PI * 0.5) * 0.22;
      px += nx * orbitBump;
      py += ny * orbitBump;
      steerAngle -= Math.sin(u * Math.PI * 0.5) * 0.35;
    }

    car.x = px;
    car.y = py;
    car.angle = steerAngle;
  }

  private handleMarketArrival(car: Car): void {
    car.state = 'atMarket';
    car.atMarketTimer = 0.45;
    car.waitTime = 0;
    car.rage = 0;
    car.isOnMotorway = false;

    if (this.isAuthoritative) {
      const market = this.markets.find((m) => m.id === car.targetMarketId);
      if (market) {
        const pinIdx = market.pins.findIndex((p) => p.id === car.targetPinId);
        if (pinIdx >= 0) {
          market.pins.splice(pinIdx, 1);
        } else if (market.pins.length > 0) {
          market.pins.shift();
        }
        this.deliveries += 1;
        gameAudio.playDelivery();
        this.spawnBurst(car.x, car.y, MONKEY_COLORS[car.color].fill, 7, MONKEY_COLORS[car.color].fruitEmoji);
        this.addFloatingText(car.x, car.y - 0.4, '+1 🍌', MONKEY_COLORS[car.color].fill);

        this.callbacks.onEmitFx?.({
          kind: 'event:fx',
          fx: 'delivery',
          x: car.x,
          y: car.y,
          color: car.color,
        });

        this.checkMilestoneCelebration(this.deliveries);
      }
    }
  }

  public checkMilestoneCelebration(totalDeliveries: number): void {
    for (const milestone of DELIVERY_MILESTONES) {
      if (totalDeliveries >= milestone && !this.milestonesHit.includes(milestone)) {
        this.milestonesHit.push(milestone);
        this.triggerMilestoneFX(milestone);
        if (this.isAuthoritative) {
          this.callbacks.onEmitFx?.({
            kind: 'event:fx',
            fx: 'milestone',
            value: milestone,
          });
        }
      }
    }
  }

  public triggerMilestoneFX(milestone: number): void {
    gameAudio.playMilestone();
    this.spawnBananaConfetti(48);
    this.callbacks.onToast?.(
      `🎉 MARCO DE ${milestone} ENTREGAS! Chuva de Bananas na Selva! 🍌`,
      'banana',
    );
  }

  private handleHomeArrival(car: Car, index: number): void {
    const home = this.houses.find((h) => h.id === car.homeHouseId);
    if (home && this.isAuthoritative) {
      home.carsParked = Math.min(home.carsTotal, home.carsParked + 1);
    }
    this.cars.splice(index, 1);
  }

  private returnCarHomeOrphaned(car: Car, index: number): void {
    const home = this.houses.find((h) => h.id === car.homeHouseId);
    if (home && this.isAuthoritative) {
      home.carsParked = Math.min(home.carsTotal, home.carsParked + 1);
    }
    if (car.state === 'toMarket' && this.isAuthoritative) {
      const market = this.markets.find((m) => m.id === car.targetMarketId);
      const pin = market?.pins.find((p) => p.id === car.targetPinId);
      if (pin) pin.claimedByCarId = null;
    }
    this.spawnBurst(car.x, car.y, '#cbd5e1', 5);
    this.cars.splice(index, 1);
  }

  private isCellFreeForBuilding(x: number, y: number, lookup: BuildingLookup): boolean {
    if (!inBounds(x, y)) return false;
    if (this.map.tiles[y][x] !== 'land') return false;
    const k = cellKey(x, y);
    if (lookup.houseByCell.has(k) || lookup.marketByCell.has(k)) return false;
    if (this.network.getDegree(x, y) > 0) return false;
    if (this.network.lights.has(k) || this.network.roundabouts.has(k)) return false;
    if (this.network.motorways.some((m) => (m.ax === x && m.ay === y) || (m.bx === x && m.by === y))) {
      return false;
    }
    return true;
  }

  private trySpawnHouse(color: MonkeyColor, near?: GridCoord): House | null {
    const lookup = this.getLookup();
    const candidates: Array<{ x: number; y: number; score: number }> = [];

    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (!this.isCellFreeForBuilding(x, y, lookup)) continue;
        let freeNeighbors = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (inBounds(nx, ny) && this.map.tiles[ny][nx] === 'land') {
            freeNeighbors += 1;
          }
        }
        if (freeNeighbors < 2) continue;

        let score = Math.random() * 6;
        if (near) {
          const d = Math.hypot(x - near.x, y - near.y);
          score += Math.abs(d - 2.0) * 2.2;
        }
        candidates.push({ x, y, score });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    const pick = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];

    const house: House = {
      id: nextId('house'),
      x: pick.x,
      y: pick.y,
      color,
      drivewayAngle: 0,
      carsTotal: 2,
      carsParked: 2,
      spawnAnim: 0,
    };
    this.houses.push(house);
    this.invalidateLookup();
    this.recordBuildHistory({ kind: 'house', x: house.x, y: house.y, color });
    gameAudio.playSpawnBuilding();
    return house;
  }

  private trySpawnMarket(color: MonkeyColor, near?: GridCoord, isMega = false): Market | null {
    const lookup = this.getLookup();
    const candidates: Array<{ x: number; y: number; score: number }> = [];

    for (let y = 1; y < GRID_ROWS - 3; y++) {
      for (let x = 1; x < GRID_COLS - 3; x++) {
        let ok = true;
        for (let dy = 0; dy < 2 && ok; dy++) {
          for (let dx = 0; dx < 2 && ok; dx++) {
            if (!this.isCellFreeForBuilding(x + dx, y + dy, lookup)) ok = false;
          }
        }
        if (!ok) continue;

        let clearPerimeter = true;
        for (let py = y - 1; py <= y + 2 && clearPerimeter; py++) {
          for (let px = x - 1; px <= x + 2 && clearPerimeter; px++) {
            if (px >= x && px <= x + 1 && py >= y && py <= y + 1) continue;
            if (lookup.marketByCell.has(cellKey(px, py))) clearPerimeter = false;
          }
        }
        if (!clearPerimeter) continue;

        let score = Math.random() * 5;
        if (near) {
          score += Math.hypot(x - near.x, y - near.y) * 2.5;
        }
        candidates.push({ x, y, score });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    const pick = candidates[Math.floor(Math.random() * Math.min(3, candidates.length))];
    const names = MARKET_NAMES[color];
    const name = names[this.markets.filter((m) => m.color === color).length % names.length];

    const market: Market = {
      id: nextId('mkt'),
      x: pick.x,
      y: pick.y,
      color,
      isMega,
      pins: [],
      overload: 0,
      demandTimer: 1.5,
      demandInterval: isMega ? 3.5 : 5.2,
      spawnAnim: 0,
      name,
    };
    this.markets.push(market);
    this.invalidateLookup();
    this.recordBuildHistory({ kind: 'market', x: market.x, y: market.y, color });
    gameAudio.playSpawnBuilding();
    return market;
  }

  public addFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      id: nextId('ft'),
      x,
      y,
      text,
      color,
      life: 1.25,
      maxLife: 1.25,
      vy: -0.75,
    });
  }

  public spawnBurst(x: number, y: number, color: string, count = 6, emoji?: string): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = 0.8 + Math.random() * 1.8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: 3 + Math.random() * 3,
        life: 0.6 + Math.random() * 0.3,
        maxLife: 0.9,
        emoji: i === 0 ? emoji : undefined,
      });
    }
  }

  public spawnBananaConfetti(count = 42): void {
    const palette = ['#facc15', '#f97316', '#4ade80', '#38bdf8', '#fb7185', '#c084fc'];
    for (let i = 0; i < count; i++) {
      const cx = 3 + Math.random() * (GRID_COLS - 6);
      const cy = 2 + Math.random() * 5;
      const isEmoji = i % 5 === 0;
      this.particles.push({
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 6,
        vy: -2.5 - Math.random() * 3.5,
        color: palette[i % palette.length],
        size: 5 + Math.random() * 4,
        life: 1.6 + Math.random() * 0.9,
        maxLife: 2.5,
        emoji: isEmoji ? (i % 10 === 0 ? '🍌' : '🎉') : undefined,
        isConfetti: !isEmoji,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
        gravity: 5.5,
      });
    }
  }

  exportTickSnapshot(): DynamicTickSnapshot {
    return {
      day: this.day,
      dayProgress: this.dayProgress,
      week: this.week,
      deliveries: this.deliveries,
      speed: this.speed,
      prePauseSpeed: this.prePauseSpeed,
      inventory: { ...this.inventory },
      lights: Array.from(this.network.lights.values()).map((l) => ({ ...l })),
      markets: this.markets.map((m) => ({
        id: m.id,
        isMega: m.isMega,
        pins: m.pins.map((p) => ({ ...p })),
        overload: m.overload,
        demandInterval: m.demandInterval,
      })),
      cars: this.cars.map((c) => ({
        id: c.id,
        color: c.color,
        x: c.x,
        y: c.y,
        angle: c.angle,
        speed: c.speed,
        state: c.state,
        isOnMotorway: Boolean(c.isOnMotorway ?? c.path[c.segIndex + 1]?.isMotorway),
        rage: c.rage,
        moodEmoji: c.moodEmoji,
        moodTimer: c.moodTimer,
        orphanedTimer: c.orphanedTimer,
      })),
      networkVersion: this.network.version,
      upgradeVotes: { ...this.upgradeVotes },
      lastProcessedSeq: { ...this.lastProcessedSeq },
      playerStats: Object.fromEntries(
        Object.entries(this.playerStats).map(([k, v]) => [k, { ...v }]),
      ),
    };
  }

  applyTickSnapshot(tick: DynamicTickSnapshot): boolean {
    if (tick.networkVersion !== this.network.version) {
      return false;
    }

    this.day = tick.day;
    this.dayProgress = tick.dayProgress;
    this.week = tick.week;
    this.deliveries = tick.deliveries;
    this.speed = tick.speed;
    this.prePauseSpeed = tick.prePauseSpeed;
    this.inventory = { ...tick.inventory };
    this.upgradeVotes = { ...tick.upgradeVotes };
    this.lastProcessedSeq = { ...tick.lastProcessedSeq };
    this.playerStats = Object.fromEntries(
      Object.entries(tick.playerStats).map(([k, v]) => [k, { ...v }]),
    );

    // Update light phases smoothly
    for (const l of tick.lights) {
      const existing = this.network.lights.get(cellKey(l.x, l.y));
      if (existing) {
        existing.phase = l.phase;
        existing.timer = l.timer;
      }
    }

    // Update market pins & overload
    for (const cm of tick.markets) {
      const m = this.markets.find((mk) => mk.id === cm.id);
      if (m) {
        m.isMega = cm.isMega;
        m.pins = cm.pins.map((p) => ({ ...p }));
        m.overload = cm.overload;
        m.demandInterval = cm.demandInterval;
      }
    }

    // Smoothly reconcile cars without jitter!
    const prevById = new Map<string, Car>();
    for (const c of this.cars) prevById.set(c.id, c);

    this.cars = tick.cars.map((tc) => {
      const old = prevById.get(tc.id);
      let vxOffset = 0;
      let vyOffset = 0;
      let vAngleOffset = 0;
      if (old) {
        const oldVisX = old.x + (old.vxOffset ?? 0);
        const oldVisY = old.y + (old.vyOffset ?? 0);
        const oldVisA = old.angle + (old.vAngleOffset ?? 0);
        const dist = Math.hypot(tc.x - oldVisX, tc.y - oldVisY);
        if (dist < 2.2) {
          vxOffset = oldVisX - tc.x;
          vyOffset = oldVisY - tc.y;
          vAngleOffset = wrapAngleDiff(oldVisA - tc.angle);
        }
      }
      return {
        id: tc.id,
        color: tc.color,
        homeHouseId: old?.homeHouseId ?? '',
        targetMarketId: old?.targetMarketId ?? '',
        targetPinId: old?.targetPinId ?? null,
        state: tc.state,
        path: old?.path ?? [],
        segIndex: old?.segIndex ?? 0,
        segT: old?.segT ?? 0,
        x: tc.x,
        y: tc.y,
        angle: tc.angle,
        speed: tc.speed,
        atMarketTimer: 0,
        waitTime: 0,
        rage: tc.rage,
        hornCooldown: 0,
        moodEmoji: tc.moodEmoji,
        moodTimer: tc.moodTimer,
        orphanedTimer: tc.orphanedTimer,
        isOnMotorway: tc.isOnMotorway,
        vxOffset,
        vyOffset,
        vAngleOffset,
      };
    });

    this.callbacks.onUpgradeVotesChange?.();
    return true;
  }

  exportSnapshot(): GameSnapshot {
    return {
      mapId: this.map.id,
      phase: this.phase,
      day: this.day,
      dayProgress: this.dayProgress,
      week: this.week,
      deliveries: this.deliveries,
      speed: this.speed,
      prePauseSpeed: this.prePauseSpeed,
      inventory: { ...this.inventory },
      unlockedColors: [...this.unlockedColors],
      milestonesHit: [...this.milestonesHit],
      roadEdges: Array.from(this.network.edges),
      lights: Array.from(this.network.lights.values()).map((l) => ({ ...l })),
      roundabouts: Array.from(this.network.roundabouts.values()).map((r) => ({ ...r })),
      motorways: this.network.motorways.map((m) => ({ ...m })),
      houses: this.houses.map((h) => ({ ...h })),
      markets: this.markets.map((m) => ({ ...m, pins: m.pins.map((p) => ({ ...p })) })),
      cars: this.cars.map((c) => ({ ...c, path: c.path.map((s) => ({ ...s })) })),
      pendingUpgrades: this.pendingUpgrades ? this.pendingUpgrades.map((u) => ({ ...u })) : null,
      upgradeVotes: { ...this.upgradeVotes },
      playerStats: Object.fromEntries(
        Object.entries(this.playerStats).map(([k, v]) => [k, { ...v }]),
      ),
      lastProcessedSeq: { ...this.lastProcessedSeq },
      buildHistory: this.buildHistory.map((b) => ({ ...b })),
      gameOverReason: this.gameOverReason,
      gameOverMarketId: this.gameOverMarketId,
      networkVersion: this.network.version,
    };
  }

  applySnapshot(snap: GameSnapshot): void {
    if (this.map.id !== snap.mapId) {
      this.map = MAPS[snap.mapId];
    }
    const prevPhase = this.phase;

    this.phase = snap.phase;
    this.day = snap.day;
    this.dayProgress = snap.dayProgress;
    this.week = snap.week;
    this.deliveries = snap.deliveries;
    this.speed = snap.speed;
    this.prePauseSpeed = snap.prePauseSpeed;
    this.inventory = { ...snap.inventory };
    this.unlockedColors = [...(snap.unlockedColors ?? ['yellow'])];
    this.milestonesHit = [...(snap.milestonesHit ?? [])];
    this.network.loadFromSnapshot(
      snap.roadEdges,
      snap.lights,
      snap.roundabouts,
      snap.motorways,
      snap.networkVersion,
    );
    this.houses = snap.houses.map((h) => ({ ...h }));
    this.markets = snap.markets.map((m) => ({ ...m, pins: m.pins.map((p) => ({ ...p })) }));
    this.invalidateLookup();

    // Smoothly blend existing cars when full snapshot arrives
    const prevById = new Map<string, Car>();
    for (const c of this.cars) prevById.set(c.id, c);
    this.cars = snap.cars.map((c) => {
      const old = prevById.get(c.id);
      let vxOffset = 0;
      let vyOffset = 0;
      let vAngleOffset = 0;
      if (old) {
        const oldVisX = old.x + (old.vxOffset ?? 0);
        const oldVisY = old.y + (old.vyOffset ?? 0);
        const oldVisA = old.angle + (old.vAngleOffset ?? 0);
        if (Math.hypot(c.x - oldVisX, c.y - oldVisY) < 2.2) {
          vxOffset = oldVisX - c.x;
          vyOffset = oldVisY - c.y;
          vAngleOffset = wrapAngleDiff(oldVisA - c.angle);
        }
      }
      return {
        ...c,
        path: c.path.map((s) => ({ ...s })),
        isOnMotorway: Boolean(c.isOnMotorway ?? c.path[c.segIndex + 1]?.isMotorway),
        vxOffset,
        vyOffset,
        vAngleOffset,
      };
    });

    this.pendingUpgrades = snap.pendingUpgrades
      ? snap.pendingUpgrades.map((u) => ({ ...u }))
      : null;
    this.upgradeVotes = { ...(snap.upgradeVotes ?? {}) };
    this.playerStats = Object.fromEntries(
      Object.entries(snap.playerStats ?? {}).map(([k, v]) => [k, { ...v }]),
    );
    this.lastProcessedSeq = { ...(snap.lastProcessedSeq ?? {}) };
    this.buildHistory = (snap.buildHistory ?? []).map((b) => ({ ...b }));
    this.gameOverReason = snap.gameOverReason;
    this.gameOverMarketId = snap.gameOverMarketId;
    this.lastPathCheckVersion = this.network.version;

    if (prevPhase !== this.phase) {
      if (this.phase === 'upgrade' && this.pendingUpgrades) {
        gameAudio.playUpgrade();
        this.callbacks.onUpgradeOffered?.(this.pendingUpgrades);
      } else if (this.phase === 'gameover') {
        this.shake = 1.0;
        gameAudio.playGameOver();
        this.callbacks.onGameOver?.(this.deliveries, this.gameOverReason ?? 'Caos no trânsito!');
      }
      this.callbacks.onPhaseChange?.();
    } else if (this.phase === 'upgrade') {
      this.callbacks.onUpgradeVotesChange?.();
    }
  }
}

export function getUnlockedColorOrder(): MonkeyColor[] {
  return COLOR_UNLOCK_ORDER;
}
