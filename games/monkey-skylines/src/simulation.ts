import { findRoadPath, generateMap, getAdjacentRoads, gridToWorld, inBounds } from './map';
import {
  GRID_SIZE,
  MILESTONES,
  TOOL_MAP,
  type ActiveDisaster,
  type BuildingType,
  type ChimpTweet,
  type CitySnapshot,
  type CityStats,
  type DisasterType,
  type Particle,
  type TileData,
  type ToolType,
  type Vehicle,
  type VehicleKind,
} from './types';
import type { MonkeySoundName } from '@monkey-slop/sdk';

export interface SimHooks {
  onToast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  onSound: (sound: MonkeySoundName, vol?: number) => void;
  onMilestone: (name: string, bonus: number) => void;
  onCrisis: (reason: 'bankrupt' | 'rebellion') => void;
  onScoreCheckpoint: (score: number, stats: CityStats) => void;
}

const HANDLES = [
  { handle: '@sagui_calvo', avatar: '🐒' },
  { handle: '@gorila_clt', avatar: '🦍' },
  { handle: '@orangotango_coach', avatar: '🦧' },
  { handle: '@babuino_uber', avatar: '🚕' },
  { handle: '@mico_dev', avatar: '💻' },
  { handle: '@chimpanze_fiscal', avatar: '🧐' },
  { handle: '@tia_do_cipo', avatar: '🌿' },
  { handle: '@macaco_slop', avatar: '🍌' },
];

export class CitySimulation {
  public seed: number;
  public grid: TileData[][];
  public stats: CityStats;
  public vehicles: Vehicle[] = [];
  public disasters: ActiveDisaster[] = [];
  public tweets: ChimpTweet[] = [];
  public particles: Particle[] = [];
  public screenShake = 0;
  public simSpeed: 0 | 1 | 2 = 1;
  public crisisTriggered = false;

  private hooks: SimHooks;
  private econTimer = 0;
  private vehicleSpawnTimer = 0;
  private tweetTimer = 3.5;
  private autoDisasterTimer = 48;
  private scoreTimer = 0;
  private nextId = 1;
  private roadTiles: Array<{ gx: number; gy: number }> = [];
  private houseTiles: TileData[] = [];
  private marketTiles: TileData[] = [];
  private factoryTiles: TileData[] = [];
  private lastBuildActor: { name: string; tool: ToolType } | null = null;

  constructor(seed: number, hooks: SimHooks) {
    this.seed = seed;
    this.hooks = hooks;
    this.grid = generateMap(seed);
    this.stats = this.createInitialStats();
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.pushTweet({
      handle: '@chimpanze_fiscal',
      avatar: '🧐',
      text: 'Novo Prefeito assumiu! Bora ver se sai metrópole ou favela de banana 🍌',
      tone: 'meme',
    });
  }

  private createInitialStats(): CityStats {
    return {
      bananas: 550,
      incomePerTick: 0,
      population: 0,
      happiness: 75,
      powerProduced: 0,
      powerDemand: 0,
      garbageLoad: 0,
      garbageCapacity: 10,
      trafficCongestion: 0,
      roadCount: 0,
      houseCount: 0,
      marketCount: 0,
      factoryCount: 0,
      day: 1,
      milestoneIndex: 0,
      bankruptTimer: 0,
      rebellionTimer: 0,
    };
  }

  reset(newSeed: number): void {
    this.seed = newSeed;
    this.grid = generateMap(newSeed);
    this.stats = this.createInitialStats();
    this.vehicles = [];
    this.disasters = [];
    this.particles = [];
    this.tweets = [];
    this.screenShake = 0;
    this.crisisTriggered = false;
    this.econTimer = 0;
    this.autoDisasterTimer = 48;
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.pushTweet({
      handle: '@macaco_slop',
      avatar: '🍌',
      text: 'Prefeitura zerada! Prometeram metrô e entregaram estrada de terra 🛣️',
      tone: 'meme',
    });
  }

  getTileCost(gx: number, gy: number, tool: ToolType): number {
    if (!inBounds(gx, gy)) return 0;
    const tile = this.grid[gy][gx];
    const base = TOOL_MAP[tool].cost;
    if (tool === 'road' && tile.terrain === 'water') {
      return base * 2; // Ponte sobre o rio
    }
    return base;
  }

  canApplyTool(gx: number, gy: number, tool: ToolType): { ok: boolean; reason?: string } {
    if (!inBounds(gx, gy)) return { ok: false };
    const tile = this.grid[gy][gx];

    if (tool === 'bulldozer') {
      if (!tile.building && tile.terrain !== 'forest') {
        return { ok: false };
      }
      return { ok: true };
    }

    if (tile.building === tool) return { ok: false };
    if (tile.building !== null) {
      return { ok: false, reason: 'Use o Demolidor 💥 antes!' };
    }
    if (tool !== 'road' && tile.terrain === 'water') {
      return { ok: false, reason: 'Só dá pra construir Ponte (Estrada) na água!' };
    }
    return { ok: true };
  }

  applyTool(
    gx: number,
    gy: number,
    tool: ToolType,
    actorName: string,
    isRemote: boolean,
  ): boolean {
    const check = this.canApplyTool(gx, gy, tool);
    if (!check.ok) {
      if (!isRemote && check.reason && tool !== 'road') {
        this.hooks.onToast(check.reason, 'info');
      }
      return false;
    }

    const cost = this.getTileCost(gx, gy, tool);
    if (!isRemote && this.stats.bananas < cost) {
      this.hooks.onToast(`Falta Banana! Precisa de 🍌${cost}`, 'chaos');
      this.hooks.onSound('rage', 0.22);
      return false;
    }

    const tile = this.grid[gy][gx];
    const { wx, wy } = gridToWorld(gx, gy);

    this.stats.bananas -= cost;
    this.lastBuildActor = { name: actorName, tool };

    if (tool === 'bulldozer') {
      const hadBuilding = tile.building !== null;
      tile.building = null;
      tile.level = 1;
      tile.builtBy = undefined;
      if (!hadBuilding && tile.terrain === 'forest') {
        tile.terrain = 'grass';
      }
      this.spawnBurst(wx, wy - 6, hadBuilding ? '#f97316' : '#4ade80', 14, 'smoke');
      this.spawnFloatingText(wx, wy - 20, hadBuilding ? '💥 KABUM!' : '🪓 Desmatou!', '#fca5a5');
      this.screenShake = Math.max(this.screenShake, hadBuilding ? 7 : 3);
      this.hooks.onSound(hadBuilding ? 'explosion' : 'slap', 0.24);
    } else {
      if (tile.terrain === 'forest') {
        tile.terrain = 'grass';
      }
      tile.building = tool;
      tile.level = 1;
      tile.builtBy = actorName;

      const def = TOOL_MAP[tool];
      this.spawnBurst(wx, wy - 8, def.color, 9, 'spark');
      this.spawnFloatingText(wx, wy - 18, `-${cost}🍌`, '#fde047');
      this.hooks.onSound(tool === 'power' || tool === 'park' ? 'banana' : 'click', 0.22);
    }

    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    return true;
  }

  private rebuildTileCaches(): void {
    this.roadTiles = [];
    this.houseTiles = [];
    this.marketTiles = [];
    this.factoryTiles = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        if (t.building === 'road') this.roadTiles.push({ gx: x, gy: y });
        else if (t.building === 'house') this.houseTiles.push(t);
        else if (t.building === 'market') this.marketTiles.push(t);
        else if (t.building === 'factory') this.factoryTiles.push(t);
      }
    }
  }

  recomputeAurasAndPower(): void {
    const powerPlants: TileData[] = [];
    const parks: TileData[] = [];
    const factories: TileData[] = [];
    const dumps: TileData[] = [];
    const consumers: TileData[] = [];

    let roadCount = 0;
    let houseCount = 0;
    let marketCount = 0;
    let factoryCount = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        t.powered = false;
        t.pollution = 0;
        t.localHappiness = 66;
        t.connectedToRoad = getAdjacentRoads(this.grid, x, y).length > 0;

        if (!t.building) continue;
        switch (t.building) {
          case 'road':
            roadCount++;
            break;
          case 'power':
            powerPlants.push(t);
            t.powered = true;
            break;
          case 'park':
            parks.push(t);
            consumers.push(t);
            break;
          case 'factory':
            factories.push(t);
            consumers.push(t);
            factoryCount++;
            break;
          case 'dump':
            dumps.push(t);
            break;
          case 'house':
            consumers.push(t);
            houseCount++;
            break;
          case 'market':
            consumers.push(t);
            marketCount++;
            break;
        }
      }
    }

    const powerProduced = powerPlants.length * TOOL_MAP.power.powerGen;
    let powerDemand = 0;
    const inRangeConsumers: Array<{ tile: TileData; dist: number; use: number }> = [];

    for (const c of consumers) {
      const def = TOOL_MAP[c.building!];
      powerDemand += def.powerUse;
      let bestDist = Infinity;
      for (const p of powerPlants) {
        const d = Math.hypot(c.gx - p.gx, c.gy - p.gy);
        if (d <= TOOL_MAP.power.radius && d < bestDist) {
          bestDist = d;
        }
      }
      if (bestDist < Infinity) {
        inRangeConsumers.push({ tile: c, dist: bestDist, use: def.powerUse });
      }
    }

    inRangeConsumers.sort((a, b) => a.dist - b.dist);
    let remainingPower = powerProduced;
    for (const item of inRangeConsumers) {
      if (remainingPower >= item.use) {
        item.tile.powered = true;
        remainingPower -= item.use;
      }
    }

    // Apply pollution, dump stink & park happiness auras
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        let happ = 65;

        for (const f of factories) {
          const d = Math.hypot(x - f.gx, y - f.gy);
          if (d <= TOOL_MAP.factory.radius) {
            const factor = 1 - d / (TOOL_MAP.factory.radius + 0.5);
            t.pollution += Math.round(40 * factor);
            happ -= 32 * factor;
          }
        }

        for (const dump of dumps) {
          const d = Math.hypot(x - dump.gx, y - dump.gy);
          if (d <= TOOL_MAP.dump.radius) {
            const factor = 1 - d / (TOOL_MAP.dump.radius + 0.5);
            t.pollution += Math.round(55 * factor);
            happ -= 48 * factor;
          }
        }

        for (const park of parks) {
          const d = Math.hypot(x - park.gx, y - park.gy);
          if (d <= TOOL_MAP.park.radius) {
            const factor = 1 - d / (TOOL_MAP.park.radius + 0.5);
            happ += 34 * factor;
          }
        }

        if (t.building && t.building !== 'road' && t.building !== 'dump') {
          if (!t.powered && TOOL_MAP[t.building].powerUse > 0) happ -= 28;
          if (!t.connectedToRoad && t.building !== 'power') happ -= 18;
        }

        // Nearby road traffic penalty
        const adj = getAdjacentRoads(this.grid, x, y);
        let maxAdjTraffic = 0;
        for (const r of adj) {
          maxAdjTraffic = Math.max(maxAdjTraffic, this.grid[r.gy][r.gx].trafficLoad);
        }
        if (maxAdjTraffic > 1.4) {
          happ -= Math.min(22, (maxAdjTraffic - 1.4) * 10);
        }

        t.localHappiness = Math.max(0, Math.min(100, Math.round(happ)));
      }
    }

    this.stats.powerProduced = powerProduced;
    this.stats.powerDemand = powerDemand;
    this.stats.roadCount = roadCount;
    this.stats.houseCount = houseCount;
    this.stats.marketCount = marketCount;
    this.stats.factoryCount = factoryCount;
    this.stats.garbageLoad = houseCount * 2 + marketCount * 2 + factoryCount * 3;
    this.stats.garbageCapacity = 10 + dumps.length * 16;
  }

  update(dt: number, isHost: boolean): void {
    // Decay screen shake even when paused
    this.screenShake = Math.max(0, this.screenShake - dt * 18);
    this.updateParticles(dt);

    if (this.simSpeed === 0 || this.crisisTriggered) return;
    const sdt = dt * this.simSpeed;

    this.updateVehicles(sdt);
    this.updateDisasters(sdt, isHost);

    this.econTimer += sdt;
    if (this.econTimer >= 1.4) {
      this.econTimer -= 1.4;
      this.tickEconomy(isHost);
    }

    this.tweetTimer -= sdt;
    if (this.tweetTimer <= 0) {
      this.tweetTimer = 6.5 + Math.random() * 4.5;
      this.maybeGenerateContextualTweet();
    }

    this.autoDisasterTimer -= sdt;
    if (this.autoDisasterTimer <= 0) {
      this.autoDisasterTimer = 55 + Math.random() * 35;
      if (isHost && this.stats.population >= 15) {
        const types: DisasterType[] = ['strike', 'coconut_rain', 'trio_eletrico', 'giant_gorilla'];
        const pick = types[Math.floor(Math.random() * types.length)];
        this.triggerDisaster(pick, 'Mãe Selva', Math.random(), Math.random());
      }
    }

    this.scoreTimer += dt;
    if (this.scoreTimer >= 25) {
      this.scoreTimer = 0;
      const score = this.getScore();
      this.hooks.onScoreCheckpoint(score, this.stats);
    }
  }

  getScore(): number {
    return Math.max(0, Math.floor(this.stats.population * 10 + Math.max(0, this.stats.bananas)));
  }

  private tickEconomy(isHost: boolean): void {
    this.recomputeAurasAndPower();
    this.stats.day += 1;

    const strikeActive = this.disasters.some((d) => d.type === 'strike');
    const garbagePenalty = this.stats.garbageLoad > this.stats.garbageCapacity ? 12 : 0;

    let pop = 0;
    let happSum = 0;
    let happCount = 0;
    let income = 0;

    for (const h of this.houseTiles) {
      const effectiveHapp = Math.max(0, h.localHappiness - garbagePenalty);
      if (h.powered && h.connectedToRoad) {
        if (effectiveHapp >= 80 && h.level < 3 && Math.random() < 0.25) h.level++;
        else if (effectiveHapp >= 66 && h.level < 2 && Math.random() < 0.3) h.level++;
        else if (effectiveHapp < 35 && h.level > 1 && Math.random() < 0.25) h.level--;
      }
      const housePop = h.powered && h.connectedToRoad ? 8 * h.level : h.powered || h.connectedToRoad ? 4 : 2;
      pop += housePop;
      happSum += effectiveHapp;
      happCount++;

      const tax = h.powered && h.connectedToRoad ? (2 + h.level * 1.5) * (0.5 + effectiveHapp / 150) : 0.5;
      income += strikeActive ? tax * 0.35 : tax;
    }

    for (const m of this.marketTiles) {
      if (m.powered && m.connectedToRoad) {
        income += strikeActive ? 2 : 5;
      }
    }

    for (const f of this.factoryTiles) {
      if (f.powered && f.connectedToRoad) {
        income += strikeActive ? 6 : 16;
        const { wx, wy } = gridToWorld(f.gx, f.gy);
        this.spawnBurst(wx, wy - 28, '#a3e635', 2, 'stink');
      }
    }

    // Stink particles from dumps & ambient traffic metric
    let totalTraffic = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        if (t.building === 'dump') {
          const { wx, wy } = gridToWorld(x, y);
          this.spawnBurst(wx, wy - 10, '#84cc16', 2, 'stink');
        }
        if (t.building === 'road') {
          totalTraffic += t.trafficLoad;
        }
      }
    }

    // Upkeep
    let upkeep = this.stats.roadCount * 0.15;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const b = this.grid[y][x].building;
        if (b === 'power') upkeep += 3;
        else if (b === 'park') upkeep += 1.5;
        else if (b === 'dump') upkeep += 1;
      }
    }

    const net = Math.round(income - upkeep);
    this.stats.incomePerTick = net;
    this.stats.bananas = Math.round(this.stats.bananas + net);
    this.stats.population = pop;
    this.stats.happiness = happCount > 0 ? Math.max(0, Math.min(100, Math.round(happSum / happCount))) : 75;
    this.stats.trafficCongestion =
      this.roadTiles.length > 0 ? Math.min(100, Math.round((totalTraffic / this.roadTiles.length) * 42)) : 0;

    // Check milestones
    const nextIdx = this.stats.milestoneIndex + 1;
    if (nextIdx < MILESTONES.length && pop >= MILESTONES[nextIdx].popRequired) {
      this.stats.milestoneIndex = nextIdx;
      const ms = MILESTONES[nextIdx];
      this.stats.bananas += ms.bonusBananas;
      this.hooks.onMilestone(`${ms.badge} ${ms.name}`, ms.bonusBananas);
      this.hooks.onSound('fanfare', 0.3);
      this.hooks.onScoreCheckpoint(this.getScore(), this.stats);
      this.pushTweet({
        handle: '@macaco_slop',
        avatar: '👑',
        text: `A cidade virou "${ms.name}"! Prefeitura ganhou +${ms.bonusBananas} 🍌 de verba!`,
        tone: 'love',
      });
    }

    // Check bankruptcy / rebellion (host or solo)
    if (isHost) {
      if (this.stats.bananas < -150) {
        this.stats.bankruptTimer += 1.4;
        if (this.stats.bankruptTimer >= 12) {
          this.crisisTriggered = true;
          this.hooks.onCrisis('bankrupt');
        }
      } else {
        this.stats.bankruptTimer = 0;
      }

      if (this.stats.population >= 24 && this.stats.happiness < 18) {
        this.stats.rebellionTimer += 1.4;
        if (this.stats.rebellionTimer >= 14) {
          this.crisisTriggered = true;
          this.hooks.onCrisis('rebellion');
        }
      } else {
        this.stats.rebellionTimer = 0;
      }
    }
  }

  private updateVehicles(dt: number): void {
    // Decay traffic heat
    for (const r of this.roadTiles) {
      const t = this.grid[r.gx][r.gy];
      t.trafficLoad = Math.max(0, t.trafficLoad - dt * 1.15);
    }

    // Spawn vehicles between houses and markets/factories
    this.vehicleSpawnTimer -= dt;
    if (this.vehicleSpawnTimer <= 0 && this.vehicles.length < 44) {
      this.vehicleSpawnTimer = Math.max(0.28, 1.3 - this.houseTiles.length * 0.06);
      this.trySpawnVehicle();
    }

    const activeCoconutRain = this.disasters.some((d) => d.type === 'coconut_rain');

    // Update vehicle positions
    const alive: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.pathIndex >= v.path.length - 1) {
        // Delivered!
        if (v.kind === 'banana_car' || v.kind === 'monkey_bus') {
          this.stats.bananas += 6;
          const { wx, wy } = gridToWorld(v.gx, v.gy);
          this.spawnFloatingText(wx, wy - 14, '+6🍌', '#fde047');
        } else if (v.kind === 'pacoca_truck') {
          this.stats.bananas += 9;
          const { wx, wy } = gridToWorld(v.gx, v.gy);
          this.spawnFloatingText(wx, wy - 14, '+9🍌', '#d8b4fe');
        }
        continue;
      }

      const curNode = v.path[v.pathIndex];
      const nextNode = v.path[v.pathIndex + 1];

      // Check if tile ahead still has road
      if (!inBounds(nextNode.gx, nextNode.gy) || this.grid[nextNode.gy][nextNode.gx].building !== 'road') {
        continue;
      }

      // Check congestion ahead
      let blocked = false;
      for (const other of this.vehicles) {
        if (other.id === v.id) continue;
        const dist = Math.hypot(other.gx - v.gx, other.gy - v.gy);
        if (dist < 0.55) {
          const dot = (other.gx - v.gx) * v.dirX + (other.gy - v.gy) * v.dirY;
          if (dot > 0.1 || other.kind === 'trio_eletrico') {
            blocked = true;
            break;
          }
        }
      }

      const tileLoad = this.grid[curNode.gy][curNode.gx].trafficLoad;
      this.grid[curNode.gy][curNode.gx].trafficLoad = Math.min(
        4,
        tileLoad + dt * (v.kind === 'trio_eletrico' ? 3.5 : 1.7),
      );

      let effSpeed = v.speed;
      if (activeCoconutRain) effSpeed *= 0.65;
      if (blocked) {
        effSpeed = 0;
        v.stuckTime += dt;
        v.honkCooldown -= dt;
        if (v.stuckTime > 1.2 && v.honkCooldown <= 0) {
          v.honkCooldown = 2.8 + Math.random() * 2;
          const { wx, wy } = gridToWorld(v.gx, v.gy);
          const honks = ['BEEP!', 'FON-FON!', 'SAI DA FRENTE!', 'ANDA MACACO!'];
          this.spawnFloatingText(wx, wy - 18, honks[Math.floor(Math.random() * honks.length)], '#f87171');
        }
      } else {
        v.stuckTime = Math.max(0, v.stuckTime - dt);
      }

      v.progress += effSpeed * dt;
      while (v.progress >= 1 && v.pathIndex < v.path.length - 1) {
        v.progress -= 1;
        v.pathIndex++;
      }

      if (v.pathIndex < v.path.length - 1) {
        const a = v.path[v.pathIndex];
        const b = v.path[v.pathIndex + 1];
        v.dirX = b.gx - a.gx;
        v.dirY = b.gy - a.gy;
        v.gx = a.gx + v.dirX * v.progress;
        v.gy = a.gy + v.dirY * v.progress;
      }

      alive.push(v);
    }
    this.vehicles = alive;
  }

  private trySpawnVehicle(): void {
    const origins = [...this.houseTiles, ...this.factoryTiles];
    const dests = [...this.marketTiles, ...this.houseTiles];
    if (origins.length === 0 || dests.length === 0) return;

    const origin = origins[Math.floor(Math.random() * origins.length)];
    const dest = dests[Math.floor(Math.random() * dests.length)];
    if (origin === dest) return;

    const startRoads = getAdjacentRoads(this.grid, origin.gx, origin.gy);
    const endRoads = getAdjacentRoads(this.grid, dest.gx, dest.gy);
    if (startRoads.length === 0 || endRoads.length === 0) return;

    const path = findRoadPath(this.grid, startRoads[0], endRoads[0]);
    if (!path || path.length < 2) return;

    const kind: VehicleKind =
      origin.building === 'factory'
        ? 'pacoca_truck'
        : Math.random() < 0.28
          ? 'monkey_bus'
          : 'banana_car';

    const colors = ['#facc15', '#fb7185', '#38bdf8', '#4ade80', '#fb923c'];
    this.vehicles.push({
      id: this.nextId++,
      kind,
      path,
      pathIndex: 0,
      progress: 0,
      gx: path[0].gx,
      gy: path[0].gy,
      dirX: path[1].gx - path[0].gx,
      dirY: path[1].gy - path[0].gy,
      speed: kind === 'monkey_bus' ? 1.55 : kind === 'pacoca_truck' ? 1.35 : 2.1,
      stuckTime: 0,
      honkCooldown: 1,
      color: kind === 'banana_car' ? '#facc15' : kind === 'pacoca_truck' ? '#c084fc' : colors[Math.floor(Math.random() * colors.length)],
    });
  }

  triggerDisaster(type: DisasterType, actorName: string, seedX: number, seedY: number): void {
    const titles: Record<DisasterType, string> = {
      strike: '🪧 GREVE DOS MACACOS! Renda reduzida!',
      coconut_rain: '🥥 CHUVA DE COCOS! Trânsito lento!',
      trio_eletrico: '🎶 TRIO ELÉTRICO DO CAOS nas estradas!',
      giant_gorilla: '🦍 GORILÃO DE PELÚCIA GIGANTE SOLTO!!',
    };

    const duration = type === 'trio_eletrico' ? 20 : type === 'strike' ? 16 : 13;

    // Pick start/end across the map for Giant Gorilla
    const startEdge = Math.floor(seedX * 2);
    const gx0 = startEdge === 0 ? -1 : Math.floor(seedX * GRID_SIZE);
    const gy0 = startEdge === 0 ? Math.floor(seedY * GRID_SIZE) : -1;
    const gx1 = startEdge === 0 ? GRID_SIZE + 1 : Math.floor((1 - seedX) * GRID_SIZE);
    const gy1 = startEdge === 0 ? Math.floor((1 - seedY) * GRID_SIZE) : GRID_SIZE + 1;

    const disaster: ActiveDisaster = {
      id: this.nextId++,
      type,
      title: titles[type],
      remaining: duration,
      duration,
      gorillaX: gx0,
      gorillaY: gy0,
      gorillaTargetX: gx1,
      gorillaTargetY: gy1,
      stepTimer: 0,
      coconuts: [],
      triggeredBy: actorName,
    };

    this.disasters.push(disaster);
    this.hooks.onToast(`${actorName}: ${titles[type]}`, 'chaos');
    this.hooks.onSound(type === 'giant_gorilla' ? 'screech' : type === 'strike' ? 'rage' : 'boing', 0.3);

    if (type === 'trio_eletrico' && this.roadTiles.length >= 2) {
      for (let i = 0; i < 2; i++) {
        const a = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
        const b = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
        const path = findRoadPath(this.grid, a, b);
        if (path && path.length >= 2) {
          this.vehicles.push({
            id: this.nextId++,
            kind: 'trio_eletrico',
            path,
            pathIndex: 0,
            progress: 0,
            gx: path[0].gx,
            gy: path[0].gy,
            dirX: path[1].gx - path[0].gx,
            dirY: path[1].gy - path[0].gy,
            speed: 0.55,
            stuckTime: 0,
            honkCooldown: 0.5,
            color: '#ec4899',
          });
        }
      }
    }

    const tweetMap: Record<DisasterType, string> = {
      strike: `GREVE GERAL! Queremos jornada 4x3 e banana grátis na firma! 🪧🍌 (${actorName} decretou caos)`,
      coconut_rain: `TÁ CHOVENDO COCO NA MINHA CABEÇA SOCORRO 🥥💥`,
      trio_eletrico: `BOTARAM UM TRIO ELÉTRICO NA RUA DA FEIRA, NINGUÉM PASSA 🎶🚌`,
      giant_gorilla: `SOCORRO TEM UM GORILÃO DE PELÚCIA GIGANTE PISANDO NO BAIRRO!! 🦍💜`,
    };
    this.pushTweet({
      handle: '@sagui_calvo',
      avatar: '🚨',
      text: tweetMap[type],
      tone: 'chaos',
    });
  }

  private updateDisasters(dt: number, _isHost: boolean): void {
    const active: ActiveDisaster[] = [];
    for (const d of this.disasters) {
      d.remaining -= dt;

      if (d.type === 'giant_gorilla') {
        const dx = d.gorillaTargetX - d.gorillaX;
        const dy = d.gorillaTargetY - d.gorillaY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.2) {
          const speed = 2.3;
          d.gorillaX += (dx / dist) * speed * dt;
          d.gorillaY += (dy / dist) * speed * dt;
        }
        d.stepTimer -= dt;
        if (d.stepTimer <= 0) {
          d.stepTimer = 0.52;
          this.screenShake = Math.max(this.screenShake, 7);
          this.hooks.onSound('slap', 0.16);
          const gx = Math.round(d.gorillaX);
          const gy = Math.round(d.gorillaY);
          const { wx, wy } = gridToWorld(d.gorillaX, d.gorillaY);
          this.spawnBurst(wx, wy, '#c084fc', 6, 'ring');
          if (inBounds(gx, gy)) {
            const tile = this.grid[gy][gx];
            if (tile.building && tile.building !== 'road') {
              tile.building = null;
              tile.level = 1;
              this.spawnBurst(wx, wy - 8, '#f97316', 14, 'smoke');
              this.spawnFloatingText(wx, wy - 24, 'PISOTEOU!! 💥', '#fb7185');
              this.hooks.onSound('explosion', 0.22);
              this.rebuildTileCaches();
              this.recomputeAurasAndPower();
            }
          }
        }
      }

      if (d.type === 'coconut_rain') {
        if (Math.random() < dt * 4.5) {
          d.coconuts.push({
            gx: Math.random() * GRID_SIZE,
            gy: Math.random() * GRID_SIZE,
            height: 220 + Math.random() * 120,
            speed: 260 + Math.random() * 120,
          });
        }
        const nextCoconuts: ActiveDisaster['coconuts'] = [];
        for (const c of d.coconuts) {
          c.height -= c.speed * dt;
          if (c.height <= 0) {
            const { wx, wy } = gridToWorld(c.gx, c.gy);
            this.spawnBurst(wx, wy, '#854d0e', 6, 'smoke');
            this.screenShake = Math.max(this.screenShake, 2.5);
          } else {
            nextCoconuts.push(c);
          }
        }
        d.coconuts = nextCoconuts;
      }

      if (d.type === 'strike' && Math.random() < dt * 2 && this.roadTiles.length > 0) {
        const r = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
        const { wx, wy } = gridToWorld(r.gx, r.gy);
        this.spawnFloatingText(wx, wy - 16, 'GREVE! 🪧', '#fbbf24');
      }

      if (d.remaining > 0) {
        active.push(d);
      }
    }
    this.disasters = active;
  }

  private maybeGenerateContextualTweet(): void {
    const unpoweredHouses = this.houseTiles.filter((h) => !h.powered).length;
    const disconnectedHouses = this.houseTiles.filter((h) => !h.connectedToRoad).length;
    const pollutedHouses = this.houseTiles.filter((h) => h.pollution >= 18).length;

    const candidates: Array<Omit<ChimpTweet, 'id' | 'likes' | 'timeLabel'>> = [];

    if (this.stats.trafficCongestion >= 35) {
      candidates.push(
        {
          handle: '@sagui_calvo',
          avatar: '🐒',
          text: '3 HORAS NO TRANSITO PRA COMPRAR BANANA, FORA PREFEITO!',
          tone: 'rage',
        },
        {
          handle: '@babuino_uber',
          avatar: '🚕',
          text: 'Buzinei tanto na rotatória que meu dedo caiu 🚗💢',
          tone: 'rage',
        },
      );
    }

    if (unpoweredHouses > 0) {
      candidates.push({
        handle: '@gorila_clt',
        avatar: '🦍',
        text: 'Sem luz na minha rua de novo #PrefeituraSlop ⚡🤬',
        tone: 'rage',
      });
    }

    if (disconnectedHouses > 0) {
      candidates.push({
        handle: '@tia_do_cipo',
        avatar: '🌿',
        text: 'Construíram meu barraco no meio do mato SEM ESTRADA, vou de cipó trabalhar??',
        tone: 'rage',
      });
    }

    if (pollutedHouses > 0) {
      candidates.push({
        handle: '@mico_dev',
        avatar: '🤢',
        text: 'Cheiro de paçoca queimada e chorume de coco entrando na janela 💀🥥',
        tone: 'rage',
      });
    }

    if (this.stats.garbageLoad > this.stats.garbageCapacity) {
      candidates.push({
        handle: '@chimpanze_fiscal',
        avatar: '🗑️',
        text: 'Cadê o Lixão de Coco?? Tem casca de banana até no teto da prefeitura!',
        tone: 'rage',
      });
    }

    if (this.stats.bananas < 40) {
      candidates.push({
        handle: '@orangotango_coach',
        avatar: '📉',
        text: 'Prefeitura falida! Muda o mindset prefeito, faz mais Feira de Banana!',
        tone: 'meme',
      });
    }

    if (this.stats.happiness >= 75 && this.stats.population >= 16) {
      candidates.push(
        {
          handle: '@orangotango_coach',
          avatar: '🗿',
          text: 'Olhar a Estátua do Macaco Calvo me trouxe paz interior 🙏🍌',
          tone: 'love',
        },
        {
          handle: '@macaco_slop',
          avatar: '✨',
          text: 'Melhor gestão primata da história! Imposto baixo e banana gelada!',
          tone: 'love',
        },
      );
    }

    if (this.lastBuildActor && Math.random() < 0.35) {
      const def = TOOL_MAP[this.lastBuildActor.tool];
      candidates.push({
        handle: '@mico_dev',
        avatar: '🏗️',
        text: `${this.lastBuildActor.name} acabou de usar ${def.emoji} ${def.shortName} sem licitação KKKKK`,
        tone: 'meme',
      });
      this.lastBuildActor = null;
    }

    if (candidates.length === 0) {
      candidates.push(
        {
          handle: '@macaco_slop',
          avatar: '🍌',
          text: 'Alguém sabe que horas passa o ônibus das bananas na Av. Principal?',
          tone: 'meme',
        },
        {
          handle: '@sagui_calvo',
          avatar: '🐒',
          text: 'Prefeito prometeu ponte de ouro e entregou cipó molhado 😂',
          tone: 'meme',
        },
      );
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.pushTweet(pick);
  }

  pushTweet(data: Omit<ChimpTweet, 'id' | 'likes' | 'timeLabel'>): void {
    const h = HANDLES[Math.floor(Math.random() * HANDLES.length)];
    this.tweets.unshift({
      id: this.nextId++,
      handle: data.handle || h.handle,
      avatar: data.avatar || h.avatar,
      text: data.text,
      likes: 12 + Math.floor(Math.random() * 480),
      tone: data.tone,
      timeLabel: `Dia ${this.stats.day}`,
    });
    if (this.tweets.length > 25) {
      this.tweets.length = 25;
    }
  }

  spawnBurst(wx: number, wy: number, color: string, count: number, kind: Particle['kind']): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = kind === 'ring' ? 0 : 18 + Math.random() * 48;
      this.particles.push({
        wx,
        wy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.5,
        vz: kind === 'stink' ? 14 + Math.random() * 14 : 28 + Math.random() * 55,
        z: 0,
        life: kind === 'stink' ? 1.4 : 0.75 + Math.random() * 0.4,
        maxLife: kind === 'stink' ? 1.4 : 1.0,
        size: kind === 'ring' ? 10 : kind === 'stink' ? 5 + Math.random() * 5 : 3 + Math.random() * 4,
        color,
        kind,
      });
    }
  }

  spawnFloatingText(wx: number, wy: number, text: string, color: string): void {
    this.particles.push({
      wx,
      wy,
      vx: (Math.random() - 0.5) * 10,
      vy: -22,
      vz: 0,
      z: 0,
      life: 1.25,
      maxLife: 1.25,
      size: 12,
      color,
      text,
      kind: 'text',
    });
  }

  private updateParticles(dt: number): void {
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.wx += p.vx * dt;
      p.wy += p.vy * dt;
      if (p.kind === 'smoke' || p.kind === 'spark' || p.kind === 'confetti') {
        p.z += p.vz * dt;
        p.vz -= 110 * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz *= -0.35;
        }
      } else if (p.kind === 'stink') {
        p.z += p.vz * dt;
        p.wx += Math.sin(p.life * 7) * 8 * dt;
      } else if (p.kind === 'ring') {
        p.size += dt * 75;
      }
      next.push(p);
    }
    this.particles = next;
  }

  exportSnapshot(): CitySnapshot {
    const tiles: CitySnapshot['tiles'] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        if (t.building !== null || t.terrain === 'grass') {
          tiles.push({
            gx: x,
            gy: y,
            terrain: t.terrain,
            building: t.building,
            level: t.level,
            builtBy: t.builtBy,
          });
        }
      }
    }
    return {
      seed: this.seed,
      bananas: this.stats.bananas,
      day: this.stats.day,
      highestMilestone: this.stats.milestoneIndex,
      tiles,
    };
  }

  importSnapshot(snap: CitySnapshot, preserveVehicles = false): void {
    const seedChanged = this.seed !== snap.seed;
    this.seed = snap.seed;
    if (seedChanged) {
      this.grid = generateMap(snap.seed);
    } else {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          this.grid[y][x].building = null;
          this.grid[y][x].level = 1;
          this.grid[y][x].builtBy = undefined;
        }
      }
    }
    for (const item of snap.tiles) {
      if (inBounds(item.gx, item.gy)) {
        const t = this.grid[item.gy][item.gx];
        t.terrain = item.terrain;
        t.building = item.building;
        t.level = item.level;
        t.builtBy = item.builtBy;
      }
    }
    this.stats.bananas = snap.bananas;
    this.stats.day = snap.day;
    this.stats.milestoneIndex = snap.highestMilestone;
    if (seedChanged || !preserveVehicles) {
      this.vehicles = [];
    }
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
  }
}
