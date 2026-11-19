import {
  COLOR_UNLOCK_ORDER,
  DAY_DURATION_SEC,
  DAYS_PER_WEEK,
  GRID_COLS,
  GRID_ROWS,
  MARKET_NAMES,
  MONKEY_COLORS,
  RAGE_EMOJIS,
  RAGE_QUIPS,
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
  Car,
  FloatingText,
  GameSnapshot,
  GridCoord,
  House,
  Inventory,
  MapDefinition,
  MapId,
  Market,
  MonkeyColor,
  Particle,
  PathStep,
  SimSpeed,
  UpgradeOption,
} from './types';

let uidCounter = 1;
function nextId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter.toString(36)}`;
}

export interface SimulationCallbacks {
  onToast?: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  onGameOver?: (deliveries: number, reason: string) => void;
  onPhaseChange?: () => void;
  onUpgradeOffered?: (options: UpgradeOption[]) => void;
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

  public unlockedColors: MonkeyColor[] = ['yellow'];
  public pendingUpgrades: UpgradeOption[] | null = null;
  public gameOverReason: string | null = null;
  public gameOverMarketId: string | null = null;

  public shake = 0;
  public timeSec = 0;

  private spawnCooldown = 5.5;
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

  getLookup(): BuildingLookup {
    return buildBuildingLookup(this.houses, this.markets);
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
    this.unlockedColors = ['yellow'];
    this.pendingUpgrades = null;
    this.gameOverReason = null;
    this.gameOverMarketId = null;
    this.shake = 0;
    this.spawnCooldown = 6.5;
    this.lastPathCheckVersion = this.network.version;

    // Initial Yellow Market + 2 Yellow Houses nearby
    if (this.isAuthoritative) {
      this.spawnInitialCluster('yellow');
    }
    this.callbacks.onPhaseChange?.();
  }

  private spawnInitialCluster(color: MonkeyColor): void {
    const centerPrefer: GridCoord =
      this.map.id === 'rio-de-bananeiro' ? { x: 8, y: 8 } : { x: 14, y: 9 };
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
    this.phase = 'playing';
    this.speed = this.prePauseSpeed;
    gameAudio.playSpawnBuilding();
    this.callbacks.onToast?.(`Pacote "${chosen.title}" ativado!`, 'banana');
    this.callbacks.onPhaseChange?.();
    return true;
  }

  update(rawDt: number): void {
    const dt = Math.min(rawDt, 0.08);
    this.timeSec += dt;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }

    // Visual animations always tick smoothly
    this.updateVisualFX(dt);

    if (this.phase !== 'playing' || this.speed === 0) {
      return;
    }

    const simDt = dt * this.speed;

    // 1. Update traffic light phases
    this.updateTrafficLights(simDt);

    // 2. Day / Week cycle (authoritative or predicted smoothly)
    this.dayProgress += simDt / DAY_DURATION_SEC;
    if (this.dayProgress >= 1) {
      this.dayProgress -= 1;
      if (this.isAuthoritative) {
        this.advanceDay();
        if (this.phase !== 'playing') return;
      }
    }

    // 3. Authoritative spawns, demand & overload
    if (this.isAuthoritative) {
      this.updateSpawner(simDt);
      this.updateMarkets(simDt);
      if (this.phase !== 'playing') return;
      this.dispatchCars();
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
      p.vx *= 0.94;
      p.vy *= 0.94;
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

    // Unlock new colors progressively
    if (this.day === 3 && !this.unlockedColors.includes('red')) {
      this.unlockNewColor('red');
    } else if (this.day === 6 && !this.unlockedColors.includes('blue')) {
      this.unlockNewColor('blue');
    } else if (this.day === 10 && !this.unlockedColors.includes('purple')) {
      this.unlockNewColor('purple');
    } else if (this.day === 15 && !this.unlockedColors.includes('green')) {
      this.unlockNewColor('green');
    }

    // Weekly Sunday Reward!
    if (this.week > prevWeek) {
      this.offerWeeklyUpgrade();
    }
  }

  private unlockNewColor(color: MonkeyColor): void {
    this.unlockedColors.push(color);
    const theme = MONKEY_COLORS[color];
    // On Rio de Bananeiro, try placing Red/Blue on the far side of the river!
    let marketAnchor: GridCoord | undefined;
    if (this.map.id === 'rio-de-bananeiro' && color === 'red') {
      marketAnchor = { x: 20, y: 4 };
    } else if (this.map.id === 'rio-de-bananeiro' && color === 'blue') {
      marketAnchor = { x: 21, y: 13 };
    }
    const m = this.trySpawnMarket(color, marketAnchor, false);
    if (m) {
      // Spawn 2 houses of same color on opposite or nearby side
      const h1Prefer =
        this.map.id === 'rio-de-bananeiro' && color === 'red'
          ? { x: 8, y: 4 }
          : { x: m.x - 4, y: m.y };
      this.trySpawnHouse(color, h1Prefer);
      this.trySpawnHouse(color, { x: m.x + 3, y: m.y + 3 });
      this.callbacks.onToast?.(
        `Novo mercado ${theme.fruitEmoji} ${theme.label} inaugurou!`,
        'info',
      );
    }
  }

  private offerWeeklyUpgrade(): void {
    this.phase = 'upgrade';
    this.speed = 0;
    const pool = [...UPGRADE_POOL];
    // Pick 2 distinct upgrades, favoring bridges if river map and low bridges, or motorway from week 2+
    const picks: UpgradeOption[] = [];
    if (this.map.id === 'rio-de-bananeiro' && this.inventory.bridges <= 1) {
      const bridgeIdx = pool.findIndex((p) => p.bridges > 0);
      if (bridgeIdx >= 0) {
        const [item] = pool.splice(bridgeIdx, 1);
        picks.push({ ...item, id: nextId('upg') });
      }
    }
    while (picks.length < 2 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const [item] = pool.splice(idx, 1);
      // Avoid offering motorway on week 1 only if we have plenty of other variety, actually offering Cipó Express is fun anytime!
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

    // Interval shrinks gradually over days, faster on Sao Chimpulo
    const mapFactor = this.map.id === 'sao-chimpulo' ? 0.84 : 1.0;
    const baseInterval = Math.max(4.4, (9.5 - this.day * 0.22) * mapFactor);
    this.spawnCooldown = baseInterval + Math.random() * 2.5;

    // Decide whether to spawn a house, a new market, or upgrade a market to Mega Feira
    const color =
      this.unlockedColors[Math.floor(Math.random() * this.unlockedColors.length)] ?? 'yellow';
    const colorHouses = this.houses.filter((h) => h.color === color).length;
    const colorMarkets = this.markets.filter((m) => m.color === color);

    if (colorMarkets.length === 0 || (colorHouses >= colorMarkets.length * 3 && this.markets.length < 9)) {
      // Upgrade an existing market to Mega Feira sometimes after Day 12
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
      // Dynamic demand speed scales smoothly with days & map
      const ramp = 1 + Math.min(1.6, this.day * 0.045);
      const mapRush = this.map.id === 'sao-chimpulo' ? 1.12 : 1.0;
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
          this.warningCooldown = 2.4;
          gameAudio.playWarning();
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
        // Find nearest available house of matching color with a valid path
        let bestHouse: House | null = null;
        let bestPath: PathStep[] | null = null;
        let bestScore = Infinity;

        for (const h of this.houses) {
          if (h.color !== m.color || h.carsParked <= 0) continue;
          const path = findPathToMarket(this.network, lookup, { x: h.x, y: h.y }, m);
          if (path && path.length >= 2) {
            // Prefer shorter paths and houses with 2 cars parked
            const score = path.length - (h.carsParked > 1 ? 0.5 : 0);
            if (score < bestScore) {
              bestScore = score;
              bestHouse = h;
              bestPath = path;
            }
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

      // Check if current segment still exists in network
      const segValid = nextStep.isMotorway
        ? this.network.motorways.some((mw) => mw.id === nextStep.motorwayId)
        : this.network.hasEdge(curStep.x, curStep.y, nextStep.x, nextStep.y);

      // Check if remaining path still valid
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

      // Try rerouting from the closer endpoint of current segment
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
        // Mark orphaned; if stays disconnected, car returns home safely
        car.orphanedTimer = 0.01;
      }
    }
  }

  private updateCars(simDt: number): void {
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
          const lastStep = car.path[car.path.length - 1] ?? { x: Math.floor(car.x), y: Math.floor(car.y) };
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
      let targetSpeed = isMotorway ? 6.2 : 3.4;

      if (!isMotorway && this.network.roundabouts.has(cellKey(b.x, b.y))) {
        targetSpeed = 3.1;
      }

      // 1. Traffic light check when approaching node b
      if (!isMotorway) {
        const light = this.network.lights.get(cellKey(b.x, b.y));
        if (light) {
          const distToNode = (1 - car.segT) * segLen;
          if (distToNode < 0.52 && distToNode > 0.12) {
            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            const isVerticalish = dy >= dx;
            const isGreen =
              (light.phase === 0 && isVerticalish) || (light.phase === 1 && !isVerticalish);
            if (!isGreen) {
              targetSpeed = 0;
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
            if (distToNode < 0.48 && distToNode > 0.14) {
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
        if (car.waitTime > 2.4) {
          car.rage = Math.min(1, (car.waitTime - 2.4) / 4.0);
          if (car.hornCooldown <= 0) {
            car.hornCooldown = 2.6 + Math.random() * 2.5;
            car.moodEmoji = RAGE_EMOJIS[Math.floor(Math.random() * RAGE_EMOJIS.length)];
            car.moodTimer = 1.4;
            if (this.isAuthoritative && Math.random() < 0.55) {
              gameAudio.playHorn();
            }
            if (Math.random() < 0.25) {
              const quip = RAGE_QUIPS[Math.floor(Math.random() * RAGE_QUIPS.length)];
              this.addFloatingText(car.x, car.y - 0.4, quip, '#fecdd3');
            }
          }
        }
      } else {
        car.waitTime = Math.max(0, car.waitTime - simDt * 2.2);
        car.rage = Math.max(0, car.rage - simDt * 1.5);
      }

      // Advance along segment
      const deltaT = (car.speed * simDt) / segLen;
      car.segT += deltaT;

      if (car.segT >= 1) {
        car.segIndex += 1;
        car.segT -= 1;
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

      // Other car currently inside the intersection node
      const distOtherToNode = Math.hypot(other.x - (nodeX + 0.5), other.y - (nodeY + 0.5));
      if (distOtherToNode < 0.34) {
        // Ignore cars coming from the exact same lane behind/ahead
        if (oa.x === fromX && oa.y === fromY && ob.x === nodeX && ob.y === nodeY) {
          continue;
        }
        // Deterministic priority so two waiting cars never deadlock
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
      } else if (nextC && !nextC.isMotorway && oa.x === b.x && oa.y === b.y && ob.x === nextC.x && ob.y === nextC.y) {
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
      // High-arching Vine Expressway curve!
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

    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    // Right-hand lane offset
    const nx = -dy / len;
    const ny = dx / len;
    const laneOffset = 0.14;

    let px = ax + dx * car.segT + nx * laneOffset;
    let py = ay + dy * car.segT + ny * laneOffset;

    // Slight smooth roundabout curve around node B if approaching a roundabout
    if (this.network.roundabouts.has(cellKey(b.x, b.y)) && car.segT > 0.72) {
      const blend = (car.segT - 0.72) / 0.28;
      px += nx * 0.12 * Math.sin(blend * Math.PI);
      py += ny * 0.12 * Math.sin(blend * Math.PI);
    }

    car.x = px;
    car.y = py;
    car.angle = Math.atan2(dy, dx);
  }

  private handleMarketArrival(car: Car): void {
    car.state = 'atMarket';
    car.atMarketTimer = 0.45;
    car.waitTime = 0;
    car.rage = 0;

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
      }
    }
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
        // Ensure at least 1 adjacent land tile is free to draw a road out
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
          score += Math.abs(d - 3.5) * 2.2;
        }
        candidates.push({ x, y, score });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    const pick = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];

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

        // Also avoid crowding directly touching another market
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
    const pick = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
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
      roadEdges: Array.from(this.network.edges),
      lights: Array.from(this.network.lights.values()).map((l) => ({ ...l })),
      roundabouts: Array.from(this.network.roundabouts.values()).map((r) => ({ ...r })),
      motorways: this.network.motorways.map((m) => ({ ...m })),
      houses: this.houses.map((h) => ({ ...h })),
      markets: this.markets.map((m) => ({ ...m, pins: m.pins.map((p) => ({ ...p })) })),
      cars: this.cars.map((c) => ({ ...c, path: c.path.map((s) => ({ ...s })) })),
      pendingUpgrades: this.pendingUpgrades ? this.pendingUpgrades.map((u) => ({ ...u })) : null,
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
    const prevDeliveries = this.deliveries;

    this.phase = snap.phase;
    this.day = snap.day;
    this.dayProgress = snap.dayProgress;
    this.week = snap.week;
    this.deliveries = snap.deliveries;
    this.speed = snap.speed;
    this.prePauseSpeed = snap.prePauseSpeed;
    this.inventory = { ...snap.inventory };
    this.network.loadFromSnapshot(
      snap.roadEdges,
      snap.lights,
      snap.roundabouts,
      snap.motorways,
      snap.networkVersion,
    );
    this.houses = snap.houses.map((h) => ({ ...h }));
    this.markets = snap.markets.map((m) => ({ ...m, pins: m.pins.map((p) => ({ ...p })) }));
    this.cars = snap.cars.map((c) => ({ ...c, path: c.path.map((s) => ({ ...s })) }));
    this.pendingUpgrades = snap.pendingUpgrades
      ? snap.pendingUpgrades.map((u) => ({ ...u }))
      : null;
    this.gameOverReason = snap.gameOverReason;
    this.gameOverMarketId = snap.gameOverMarketId;
    this.lastPathCheckVersion = this.network.version;

    if (this.deliveries > prevDeliveries) {
      gameAudio.playDelivery();
    }
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
    }
  }
}

export function getUnlockedColorOrder(): MonkeyColor[] {
  return COLOR_UNLOCK_ORDER;
}
