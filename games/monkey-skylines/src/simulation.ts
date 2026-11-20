import { findRoadPath, generateMap, getAdjacentRoads, gridToWorld, inBounds } from './map';
import {
  DECREE_PAIRS,
  GRID_SIZE,
  MILESTONES,
  TOOL_MAP,
  type ActiveDisaster,
  type ChimpTweet,
  type CitySnapshot,
  type CityStats,
  type DecreeState,
  type DisasterType,
  type EconomyBreakdown,
  type GameMode,
  type GuideMission,
  type IncomingDisaster,
  type MapPing,
  type Particle,
  type PlayerContribution,
  type RciDemand,
  type TileData,
  type ToolType,
  type UndoEntry,
  type Vehicle,
  type VehicleKind,
} from './types';
import type { MonkeySoundName } from '@monkey-slop/sdk';

export interface SimHooks {
  onToast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  onSound: (sound: MonkeySoundName, vol?: number) => void;
  onMilestone: (name: string, bonus: number) => void;
  onMissionComplete: (mission: GuideMission) => void;
  onCrisis: (reason: 'bankrupt' | 'rebellion') => void;
  onAutoDisaster: (type: DisasterType, seedX: number, seedY: number) => void;
  onIncomingDisaster: (incoming: IncomingDisaster) => void;
  onStartDecreeVote: (id: number, pairIndex: number, duration: number) => void;
  onDesyncResync: () => void;
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
  public mode: GameMode;
  public grid: TileData[][];
  public stats: CityStats;
  public rciDemand: RciDemand = { residential: 80, commercial: 40, industrial: 35 };
  public economy: EconomyBreakdown = {
    houseIncome: 0,
    marketIncome: 0,
    factoryIncome: 0,
    deliveryIncome: 0,
    roadUpkeep: 0,
    powerUpkeep: 0,
    parkUpkeep: 0,
    dumpUpkeep: 0,
    decreeDelta: 0,
    netPerTick: 0,
  };
  public vehicles: Vehicle[] = [];
  public disasters: ActiveDisaster[] = [];
  public incomingDisaster: IncomingDisaster | null = null;
  public tweets: ChimpTweet[] = [];
  public particles: Particle[] = [];
  public pings: MapPing[] = [];
  public contributions = new Map<string, PlayerContribution>();
  public completedMissionIds = new Set<string>();
  public decree: DecreeState;
  public screenShake = 0;
  public simSpeed: 0 | 1 | 2 = 1;
  public crisisTriggered = false;

  private hooks: SimHooks;
  private econTimer = 0;
  private vehicleSpawnTimer = 0;
  private tweetTimer = 4.5;
  private autoDisasterTimer = 65;
  private decreeTimer = 50;
  private scoreTimer = 0;
  private deliveryBucket = 0;
  private nextId = 1;
  private roadTiles: Array<{ gx: number; gy: number }> = [];
  private houseTiles: TileData[] = [];
  private marketTiles: TileData[] = [];
  private factoryTiles: TileData[] = [];
  private lastBuildActor: { name: string; tool: ToolType } | null = null;

  constructor(seed: number, hooks: SimHooks, mode: GameMode = 'classic') {
    this.seed = seed;
    this.mode = mode;
    this.hooks = hooks;
    this.grid = generateMap(seed);
    this.stats = this.createInitialStats();
    this.decree = this.createIdleDecree();
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.pushTweet({
      handle: '@chimpanze_fiscal',
      avatar: '🧐',
      text: 'Prefeitura da Selva inaugurada! Construa uma Usina ⚡ perto da avenida para começar.',
      tone: 'meme',
    });
  }

  private createIdleDecree(): DecreeState {
    return {
      phase: 'idle',
      id: 0,
      options: DECREE_PAIRS[0],
      votes: {},
      remaining: 0,
      activeOption: null,
    };
  }

  private createInitialStats(): CityStats {
    return {
      bananas: this.mode === 'sandbox' ? 99999 : 600,
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
      unpoweredCount: 0,
      noRoadCount: 0,
      damagedCount: 0,
    };
  }

  reset(newSeed: number, mode: GameMode = this.mode): void {
    this.seed = newSeed;
    this.mode = mode;
    this.grid = generateMap(newSeed);
    this.stats = this.createInitialStats();
    this.vehicles = [];
    this.disasters = [];
    this.incomingDisaster = null;
    this.particles = [];
    this.pings = [];
    this.tweets = [];
    this.contributions.clear();
    this.completedMissionIds.clear();
    this.decree = this.createIdleDecree();
    this.screenShake = 0;
    this.crisisTriggered = false;
    this.econTimer = 0;
    this.deliveryBucket = 0;
    this.autoDisasterTimer = 65;
    this.decreeTimer = 50;
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.pushTweet({
      handle: '@macaco_slop',
      avatar: '🍌',
      text:
        mode === 'sandbox'
          ? 'Modo Sandbox liberado! Bananas infinitas na conta da prefeitura 🌴'
          : 'Nova gestão começou! Siga o Guia do Prefeito à esquerda 📋',
      tone: 'meme',
    });
  }

  getTileCost(gx: number, gy: number, tool: ToolType): number {
    if (!inBounds(gx, gy)) return 0;
    if (this.mode === 'sandbox') return 0;
    if (tool === 'inspect') return 0;
    const tile = this.grid[gy][gx];
    if (tool === 'bulldozer') {
      if (tile.building && tile.building !== 'townhall') return 0;
      if (!tile.building && tile.terrain === 'forest') return TOOL_MAP.bulldozer.cost;
      return 0;
    }
    const base = TOOL_MAP[tool].cost;
    if (tool === 'road' && tile.terrain === 'water') {
      return base * 2;
    }
    return base;
  }

  getBulldozeRefund(gx: number, gy: number): number {
    if (!inBounds(gx, gy) || this.mode === 'sandbox') return 0;
    const tile = this.grid[gy][gx];
    if (!tile.building || tile.building === 'townhall') return 0;
    return Math.floor(TOOL_MAP[tile.building].cost * 0.5);
  }

  getRepairCost(gx: number, gy: number): number {
    if (!inBounds(gx, gy) || this.mode === 'sandbox') return 0;
    const tile = this.grid[gy][gx];
    if (!tile.building || !tile.damaged) return 0;
    return Math.max(10, Math.round(TOOL_MAP[tile.building].cost * 0.25));
  }

  canApplyTool(gx: number, gy: number, tool: ToolType): { ok: boolean; reason?: string } {
    if (!inBounds(gx, gy)) return { ok: false };
    if (tool === 'inspect') return { ok: true };
    const tile = this.grid[gy][gx];

    if (tool === 'bulldozer') {
      if (tile.building === 'townhall') {
        return { ok: false, reason: 'A Prefeitura é tombada pelo IPHAN Primata!' };
      }
      if (!tile.building && tile.terrain !== 'forest') {
        return { ok: false };
      }
      return { ok: true };
    }

    if (tile.building === tool) return { ok: false };
    if (tile.building === 'townhall') {
      return { ok: false, reason: '🏛️ Prefeitura da Selva! Use Inspecionar (0).' };
    }
    if (tile.building !== null) {
      return { ok: false, reason: 'Ocupado! Use Inspecionar (0) ou Demolir (8).' };
    }
    if (tool !== 'road' && tile.terrain === 'water') {
      return { ok: false, reason: 'Só dá pra construir Ponte (Estrada) no rio!' };
    }
    return { ok: true };
  }

  private recordContribution(
    name: string,
    color: string,
    delta: Partial<Omit<PlayerContribution, 'name' | 'color'>>,
  ): void {
    const existing = this.contributions.get(name) ?? {
      name,
      color,
      built: 0,
      roads: 0,
      demolished: 0,
      bananasDelta: 0,
    };
    existing.color = color || existing.color;
    existing.built += delta.built ?? 0;
    existing.roads += delta.roads ?? 0;
    existing.demolished += delta.demolished ?? 0;
    existing.bananasDelta += delta.bananasDelta ?? 0;
    this.contributions.set(name, existing);
  }

  applyTool(
    gx: number,
    gy: number,
    tool: ToolType,
    actorName: string,
    isRemote: boolean,
    actorColor = '#facc15',
    isHost = true,
  ): UndoEntry | null {
    if (tool === 'inspect') return null;
    const check = this.canApplyTool(gx, gy, tool);
    if (!check.ok) {
      if (!isRemote && check.reason && tool !== 'road') {
        this.hooks.onToast(check.reason, 'info');
      }
      return null;
    }

    const cost = this.getTileCost(gx, gy, tool);
    const refund = tool === 'bulldozer' ? this.getBulldozeRefund(gx, gy) : 0;

    if (this.mode !== 'sandbox' && this.stats.bananas < cost) {
      if (!isRemote) {
        this.hooks.onToast(`Falta Banana! Precisa de 🍌${cost}`, 'chaos');
        this.hooks.onSound('rage', 0.22);
      } else if (isHost) {
        this.hooks.onDesyncResync();
      }
      return null;
    }

    const tile = this.grid[gy][gx];
    const snapshotTile = {
      gx,
      gy,
      terrain: tile.terrain,
      building: tile.building,
      level: tile.level,
      damaged: tile.damaged,
      builtBy: tile.builtBy,
    };

    const { wx, wy } = gridToWorld(gx, gy);
    let bananaDelta = 0;

    if (this.mode !== 'sandbox') {
      this.stats.bananas = this.stats.bananas - cost + refund;
      bananaDelta = cost - refund; // reverse delta for undo
    }

    this.lastBuildActor = { name: actorName, tool };

    if (tool === 'bulldozer') {
      const hadBuilding = tile.building !== null;
      tile.building = null;
      tile.level = 1;
      tile.damaged = false;
      tile.levelUpTimer = 0;
      tile.builtBy = undefined;
      if (!hadBuilding && tile.terrain === 'forest') {
        tile.terrain = 'grass';
      }
      this.recordContribution(actorName, actorColor, {
        demolished: 1,
        bananasDelta: refund - cost,
      });
      this.spawnBurst(wx, wy - 6, hadBuilding ? '#f97316' : '#4ade80', 14, 'smoke');
      const label = hadBuilding
        ? refund > 0
          ? `💥 +${refund}🍌 (50%)`
          : '💥 KABUM!'
        : `🪓 -${cost}🍌`;
      this.spawnFloatingText(wx, wy - 20, label, refund > 0 ? '#4ade80' : '#fca5a5');
      this.screenShake = Math.max(this.screenShake, hadBuilding ? 7 : 3);
      this.hooks.onSound(hadBuilding ? 'explosion' : 'slap', 0.24);
    } else {
      if (tile.terrain === 'forest') {
        tile.terrain = 'grass';
      }
      tile.building = tool;
      tile.level = 1;
      tile.damaged = false;
      tile.levelUpTimer = 0;
      tile.builtBy = actorName;

      this.recordContribution(actorName, actorColor, {
        built: tool === 'road' ? 0 : 1,
        roads: tool === 'road' ? 1 : 0,
        bananasDelta: -cost,
      });

      const def = TOOL_MAP[tool];
      this.spawnBurst(wx, wy - 8, def.color, 9, 'spark');
      if (cost > 0) {
        this.spawnFloatingText(wx, wy - 18, `-${cost}🍌`, '#fde047');
      } else {
        this.spawnFloatingText(wx, wy - 18, `${def.emoji} Construído!`, '#4ade80');
      }
      this.hooks.onSound(tool === 'power' || tool === 'park' ? 'banana' : 'click', 0.22);
    }

    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.checkMissions();

    return {
      label: TOOL_MAP[tool].shortName,
      bananaDelta,
      tiles: [snapshotTile],
    };
  }

  applyRoadBatch(
    coords: Array<{ gx: number; gy: number }>,
    actorName: string,
    actorColor: string,
    isRemote: boolean,
    isHost = true,
  ): UndoEntry | null {
    const validCoords: Array<{ gx: number; gy: number; cost: number }> = [];
    const seen = new Set<string>();
    let totalCost = 0;

    for (const c of coords) {
      const k = `${c.gx},${c.gy}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!this.canApplyTool(c.gx, c.gy, 'road').ok) continue;
      const cost = this.getTileCost(c.gx, c.gy, 'road');
      validCoords.push({ gx: c.gx, gy: c.gy, cost });
      totalCost += cost;
    }

    if (validCoords.length === 0) return null;

    if (this.mode !== 'sandbox' && this.stats.bananas < totalCost) {
      if (!isRemote) {
        this.hooks.onToast(`Falta Banana para essa avenida! Precisa de 🍌${totalCost}`, 'chaos');
        this.hooks.onSound('rage', 0.22);
      } else if (isHost) {
        this.hooks.onDesyncResync();
      }
      return null;
    }

    const undoTiles: UndoEntry['tiles'] = [];
    for (const c of validCoords) {
      const tile = this.grid[c.gy][c.gx];
      undoTiles.push({
        gx: c.gx,
        gy: c.gy,
        terrain: tile.terrain,
        building: tile.building,
        level: tile.level,
        damaged: tile.damaged,
        builtBy: tile.builtBy,
      });
      if (tile.terrain === 'forest') tile.terrain = 'grass';
      tile.building = 'road';
      tile.level = 1;
      tile.damaged = false;
      tile.builtBy = actorName;

      const { wx, wy } = gridToWorld(c.gx, c.gy);
      this.spawnBurst(wx, wy - 4, '#94a3b8', 4, 'spark');
    }

    if (this.mode !== 'sandbox') {
      this.stats.bananas -= totalCost;
    }
    this.recordContribution(actorName, actorColor, {
      roads: validCoords.length,
      bananasDelta: -totalCost,
    });

    const last = validCoords[validCoords.length - 1];
    const { wx, wy } = gridToWorld(last.gx, last.gy);
    this.spawnFloatingText(
      wx,
      wy - 20,
      totalCost > 0 ? `🛣️ ${validCoords.length}x (-${totalCost}🍌)` : `🛣️ ${validCoords.length}x`,
      '#fde047',
    );
    this.hooks.onSound('click', 0.24);
    this.lastBuildActor = { name: actorName, tool: 'road' };

    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.checkMissions();

    return {
      label: `Estrada (${validCoords.length}x)`,
      bananaDelta: this.mode === 'sandbox' ? 0 : totalCost,
      tiles: undoTiles,
    };
  }

  repairTile(gx: number, gy: number, actorName: string, isRemote: boolean, isHost = true): boolean {
    if (!inBounds(gx, gy)) return false;
    const tile = this.grid[gy][gx];
    if (!tile.building || !tile.damaged) return false;
    const cost = this.getRepairCost(gx, gy);
    if (this.mode !== 'sandbox' && this.stats.bananas < cost) {
      if (!isRemote) {
        this.hooks.onToast(`Falta Banana para reparar! Precisa de 🍌${cost}`, 'chaos');
        this.hooks.onSound('rage', 0.2);
      } else if (isHost) {
        this.hooks.onDesyncResync();
      }
      return false;
    }
    if (this.mode !== 'sandbox') {
      this.stats.bananas -= cost;
    }
    tile.damaged = false;
    const { wx, wy } = gridToWorld(gx, gy);
    this.spawnBurst(wx, wy - 10, '#4ade80', 10, 'spark');
    this.spawnFloatingText(wx, wy - 22, cost > 0 ? `🔧 Reparado (-${cost}🍌)` : '🔧 Reparado!', '#4ade80');
    this.hooks.onSound('banana', 0.22);
    this.hooks.onToast(`🔧 ${actorName} reparou ${TOOL_MAP[tile.building].name}!`, 'info');
    this.recomputeAurasAndPower();
    return true;
  }

  applyUndo(entry: UndoEntry): boolean {
    for (const item of entry.tiles) {
      if (!inBounds(item.gx, item.gy)) continue;
      const t = this.grid[item.gy][item.gx];
      t.terrain = item.terrain;
      t.building = item.building;
      t.level = item.level;
      t.damaged = item.damaged;
      t.builtBy = item.builtBy;
      t.levelUpTimer = 0;
      const { wx, wy } = gridToWorld(item.gx, item.gy);
      this.spawnBurst(wx, wy - 6, '#38bdf8', 5, 'spark');
    }
    if (this.mode !== 'sandbox') {
      this.stats.bananas += entry.bananaDelta;
    }
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
    this.hooks.onSound('boing', 0.18);
    return true;
  }

  addPing(gx: number, gy: number, actorName: string, color: string): void {
    if (!inBounds(gx, gy)) return;
    this.pings.push({
      id: this.nextId++,
      gx,
      gy,
      actorName,
      color,
      life: 4.5,
      maxLife: 4.5,
    });
    const { wx, wy } = gridToWorld(gx, gy);
    this.spawnBurst(wx, wy, color, 2, 'ring');
    this.hooks.onSound('click', 0.24);
    this.hooks.onToast(`📍 ${actorName} marcou o mapa em (${gx}, ${gy})!`, 'info');
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
    let damagedCount = 0;

    const activeDecree = this.decree.phase === 'active' ? this.decree.activeOption : null;
    const powerMult = activeDecree ? activeDecree.powerMult : 1;
    const parkMult = activeDecree ? activeDecree.parkMult : 1;
    const extraPollution = activeDecree ? activeDecree.extraPollution : 0;
    const decreeHappBonus = activeDecree ? activeDecree.happinessBonus : 0;

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        t.powered = false;
        t.pollution = extraPollution;
        t.localHappiness = 66;
        t.connectedToRoad = getAdjacentRoads(this.grid, x, y).length > 0;

        if (!t.building) continue;
        if (t.damaged) damagedCount++;

        switch (t.building) {
          case 'road':
            roadCount++;
            break;
          case 'townhall':
            t.powered = true;
            break;
          case 'power':
            if (!t.damaged) {
              powerPlants.push(t);
              t.powered = true;
            }
            break;
          case 'park':
            if (!t.damaged) parks.push(t);
            consumers.push(t);
            break;
          case 'factory':
            if (!t.damaged) factories.push(t);
            consumers.push(t);
            factoryCount++;
            break;
          case 'dump':
            if (!t.damaged) dumps.push(t);
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

    const powerProduced = Math.round(powerPlants.length * TOOL_MAP.power.powerGen * powerMult);
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

    let unpoweredCount = 0;
    let noRoadCount = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        let happ = 66 + decreeHappBonus;

        for (const f of factories) {
          const d = Math.hypot(x - f.gx, y - f.gy);
          if (d <= TOOL_MAP.factory.radius) {
            const factor = 1 - d / (TOOL_MAP.factory.radius + 0.5);
            t.pollution += Math.round(42 * factor);
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
            happ += 34 * factor * parkMult;
          }
        }

        if (t.building && t.building !== 'road' && t.building !== 'dump' && t.building !== 'townhall') {
          if (!t.powered && TOOL_MAP[t.building].powerUse > 0) {
            happ -= 28;
            unpoweredCount++;
          }
          if (!t.connectedToRoad && t.building !== 'power') {
            happ -= 18;
            noRoadCount++;
          }
          if (t.damaged) {
            happ -= 25;
          }
        }

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
    this.stats.unpoweredCount = unpoweredCount;
    this.stats.noRoadCount = noRoadCount;
    this.stats.damagedCount = damagedCount;
    this.stats.garbageLoad = houseCount * 2 + marketCount * 2 + factoryCount * 3;
    this.stats.garbageCapacity = 10 + dumps.length * 16;

    // Immediate population & happiness feedback so placing a house updates stats right away
    const garbagePenalty = this.stats.garbageLoad > this.stats.garbageCapacity ? 12 : 0;
    let pop = 0;
    let happSum = 0;
    let happCount = 0;
    for (const h of this.houseTiles) {
      const effectiveHapp = Math.max(0, h.localHappiness - garbagePenalty);
      const housePop = h.damaged
        ? 0
        : h.powered && h.connectedToRoad
          ? 8 * h.level
          : h.powered || h.connectedToRoad
            ? 4
            : 2;
      pop += housePop;
      happSum += effectiveHapp;
      happCount++;
    }
    this.stats.population = pop;
    this.stats.happiness = happCount > 0 ? Math.max(0, Math.min(100, Math.round(happSum / happCount))) : 75;

    // Update RCI Demand
    const resRaw =
      houseCount < 3
        ? 86
        : 50 + (marketCount * 3 + factoryCount * 4 + 2 - houseCount) * 11 + (this.stats.happiness - 58) * 0.5;
    const comRaw = 30 + (pop / 12 + factoryCount * 0.8 - marketCount) * 24;
    const indRaw = 28 + (pop / 18 + marketCount * 0.7 - factoryCount) * 25;
    this.rciDemand = {
      residential: Math.max(8, Math.min(98, Math.round(resRaw))),
      commercial: Math.max(8, Math.min(98, Math.round(comRaw))),
      industrial: Math.max(8, Math.min(98, Math.round(indRaw))),
    };

    // Estimate economy breakdown immediately
    this.computeEconomyPreview();
  }

  private computeEconomyPreview(): EconomyBreakdown {
    const strikeActive = this.disasters.some((d) => d.type === 'strike');
    const garbagePenalty = this.stats.garbageLoad > this.stats.garbageCapacity ? 12 : 0;
    const activeDecree = this.decree.phase === 'active' ? this.decree.activeOption : null;
    const incomeMult = activeDecree ? activeDecree.incomeMult : 1;

    let houseIncome = 0;
    let marketIncome = 0;
    let factoryIncome = 0;

    for (const h of this.houseTiles) {
      if (h.damaged) continue;
      const effectiveHapp = Math.max(0, h.localHappiness - garbagePenalty);
      const tax =
        h.powered && h.connectedToRoad
          ? (2.2 + h.level * 1.6) * (0.55 + effectiveHapp / 150)
          : 0.5;
      houseIncome += strikeActive ? tax * 0.35 : tax;
    }

    for (const m of this.marketTiles) {
      if (!m.damaged && m.powered && m.connectedToRoad) {
        marketIncome += strikeActive ? 2 : 6;
      }
    }

    for (const f of this.factoryTiles) {
      if (!f.damaged && f.powered && f.connectedToRoad) {
        factoryIncome += strikeActive ? 6 : 18;
      }
    }

    let powerCount = 0;
    let parkCount = 0;
    let dumpCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const b = this.grid[y][x].building;
        if (b === 'power') powerCount++;
        else if (b === 'park') parkCount++;
        else if (b === 'dump') dumpCount++;
      }
    }

    const roadUpkeep = Math.max(0, (this.stats.roadCount - 8) * TOOL_MAP.road.upkeep);
    const powerUpkeep = powerCount * TOOL_MAP.power.upkeep;
    const parkUpkeep = parkCount * TOOL_MAP.park.upkeep;
    const dumpUpkeep = dumpCount * TOOL_MAP.dump.upkeep;

    const baseIncome = houseIncome + marketIncome + factoryIncome;
    const decreeIncome = baseIncome * incomeMult;
    const decreeDelta = Math.round(decreeIncome - baseIncome);
    const totalUpkeep = roadUpkeep + powerUpkeep + parkUpkeep + dumpUpkeep;
    const netPerTick = Math.round(decreeIncome - totalUpkeep);

    this.economy = {
      houseIncome: Math.round(houseIncome),
      marketIncome: Math.round(marketIncome),
      factoryIncome: Math.round(factoryIncome),
      deliveryIncome: this.deliveryBucket,
      roadUpkeep: Math.round(roadUpkeep * 10) / 10,
      powerUpkeep: Math.round(powerUpkeep * 10) / 10,
      parkUpkeep: Math.round(parkUpkeep * 10) / 10,
      dumpUpkeep: Math.round(dumpUpkeep * 10) / 10,
      decreeDelta,
      netPerTick,
    };
    this.stats.incomePerTick = netPerTick;
    return this.economy;
  }

  getMissions(): GuideMission[] {
    let powerCount = 0;
    let parkCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const b = this.grid[y][x].building;
        if (b === 'power') powerCount++;
        else if (b === 'park') parkCount++;
      }
    }
    const workingHouses = this.houseTiles.filter((h) => h.powered && h.connectedToRoad && !h.damaged).length;
    const workingMarkets = this.marketTiles.filter((m) => m.powered && m.connectedToRoad && !m.damaged).length;

    return [
      {
        id: 'm1_power',
        title: '1. Construa 1 Usina de Casca',
        hint: 'Selecione ⚡ Usina (5) e coloque perto da Avenida das Bananas.',
        reward: 60,
        toolHint: 'power',
        done: this.completedMissionIds.has('m1_power'),
        current: Math.min(1, powerCount),
        target: 1,
      },
      {
        id: 'm2_roads',
        title: '2. Expanda as Estradas (10+)',
        hint: 'Use 🛣️ Estrada (1) e arraste em L para abrir novos quarteirões.',
        reward: 50,
        toolHint: 'road',
        done: this.completedMissionIds.has('m2_roads'),
        current: Math.min(10, this.stats.roadCount),
        target: 10,
      },
      {
        id: 'm3_houses',
        title: '3. 3 Barracos com Luz e Estrada',
        hint: 'Coloque 🏠 Barracos (2) ao lado da estrada dentro da aura azul!',
        reward: 80,
        toolHint: 'house',
        done: this.completedMissionIds.has('m3_houses'),
        current: Math.min(3, workingHouses),
        target: 3,
      },
      {
        id: 'm4_market',
        title: '4. Abra 1 Feira de Banana',
        hint: 'Construa 🍌 Feira (3) ligada à estrada e com energia para lucrar!',
        reward: 90,
        toolHint: 'market',
        done: this.completedMissionIds.has('m4_market'),
        current: Math.min(1, workingMarkets),
        target: 1,
      },
      {
        id: 'm5_pop25',
        title: '5. Chegue a 25 Macacos!',
        hint: 'Construa mais Barracos ou suba a felicidade para evoluírem.',
        reward: 100,
        toolHint: 'house',
        done: this.completedMissionIds.has('m5_pop25'),
        current: Math.min(25, this.stats.population),
        target: 25,
      },
      {
        id: 'm6_civic',
        title: '6. Erga Estátua 🗿 ou Fábrica 🏭',
        hint: '🗿 Estátua (6) sobe felicidade; 🏭 Fábrica (4) gera muita grana!',
        reward: 120,
        toolHint: 'park',
        done: this.completedMissionIds.has('m6_civic'),
        current: Math.min(1, parkCount + this.stats.factoryCount),
        target: 1,
      },
    ];
  }

  private checkMissions(): void {
    const missions = this.getMissions();
    for (const m of missions) {
      if (!m.done && m.current >= m.target) {
        this.completedMissionIds.add(m.id);
        if (this.mode !== 'sandbox') {
          this.stats.bananas += m.reward;
        }
        this.hooks.onMissionComplete(m);
        this.hooks.onSound('fanfare', 0.24);
      }
    }
  }

  getActiveWarnings(): Array<{ level: 'crit' | 'warn'; text: string }> {
    const out: Array<{ level: 'crit' | 'warn'; text: string }> = [];
    if (this.stats.damagedCount > 0) {
      out.push({
        level: 'crit',
        text: `🔧 ${this.stats.damagedCount} prédio(s) danificado(s)! Use 🔍 Inspecionar (0) para reparar.`,
      });
    }
    if (this.stats.noRoadCount > 0) {
      out.push({
        level: 'crit',
        text: `🛣️ ${this.stats.noRoadCount} prédio(s) sem acesso à estrada!`,
      });
    }
    if (this.stats.unpoweredCount > 0) {
      out.push({
        level: 'warn',
        text: `⚡ ${this.stats.unpoweredCount} prédio(s) sem luz! Construa mais Usinas (5) por perto.`,
      });
    }
    if (this.stats.garbageLoad > this.stats.garbageCapacity) {
      out.push({
        level: 'warn',
        text: `🗑️ Lixo alto (${this.stats.garbageLoad}/${this.stats.garbageCapacity})! Construa Lixão de Coco (7) longe das casas.`,
      });
    }
    if (this.stats.powerDemand > this.stats.powerProduced && this.stats.powerProduced > 0) {
      out.push({
        level: 'warn',
        text: `⚡ Rede sobrecarregada (${this.stats.powerProduced}/${this.stats.powerDemand})!`,
      });
    }
    return out;
  }

  update(dt: number, isHost: boolean): void {
    this.screenShake = Math.max(0, this.screenShake - dt * 18);
    this.updateParticles(dt);

    // Decay map pings & level-up timers
    this.pings = this.pings.filter((p) => {
      p.life -= dt;
      return p.life > 0;
    });
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        if (t.levelUpTimer > 0) t.levelUpTimer = Math.max(0, t.levelUpTimer - dt);
      }
    }

    if (this.simSpeed === 0 || this.crisisTriggered) return;
    const sdt = dt * this.simSpeed;

    this.updateVehicles(sdt);
    this.updateDisasters(sdt);
    this.updateIncomingDisaster(sdt, isHost);
    this.updateDecree(sdt, isHost);

    this.econTimer += sdt;
    if (this.econTimer >= 1.5) {
      this.econTimer -= 1.5;
      this.tickEconomy(isHost);
    }

    this.tweetTimer -= sdt;
    if (this.tweetTimer <= 0) {
      this.tweetTimer = 7 + Math.random() * 4.5;
      this.maybeGenerateContextualTweet();
    }

    // Auto disasters delayed until pop >= 45 (Milestone 2+) and disabled in Sandbox
    if (this.mode !== 'sandbox' && this.stats.population >= 45 && !this.incomingDisaster) {
      this.autoDisasterTimer -= sdt;
      if (this.autoDisasterTimer <= 0) {
        this.autoDisasterTimer = 65 + Math.random() * 35;
        if (isHost) {
          const types: DisasterType[] = ['strike', 'coconut_rain', 'trio_eletrico', 'giant_gorilla'];
          const pick = types[Math.floor(Math.random() * types.length)];
          const titles: Record<DisasterType, string> = {
            strike: '🪧 Greve dos Macacos se aproximando!',
            coconut_rain: '🥥 Nuvem de Cocos detectada no radar!',
            trio_eletrico: '🎶 Trio Elétrico entrando na cidade!',
            giant_gorilla: '🦍 Tremores! Gorilão de Pelúcia chegando!',
          };
          const incoming: IncomingDisaster = {
            type: pick,
            title: titles[pick],
            countdown: 5.0,
            seedX: Math.random(),
            seedY: Math.random(),
          };
          this.setIncomingDisaster(incoming);
          this.hooks.onIncomingDisaster(incoming);
        }
      }
    }

    this.scoreTimer += dt;
    if (this.scoreTimer >= 25) {
      this.scoreTimer = 0;
      const score = this.getScore();
      this.hooks.onScoreCheckpoint(score, this.stats);
    }
  }

  setIncomingDisaster(incoming: IncomingDisaster): void {
    this.incomingDisaster = incoming;
    this.hooks.onToast(`⚠️ ALERTA (5s): ${incoming.title}`, 'chaos');
    this.hooks.onSound('rage', 0.2);
  }

  private updateIncomingDisaster(dt: number, isHost: boolean): void {
    if (!this.incomingDisaster) return;
    this.incomingDisaster.countdown -= dt;
    if (this.incomingDisaster.countdown <= 0) {
      const d = this.incomingDisaster;
      this.incomingDisaster = null;
      if (isHost) {
        this.triggerDisaster(d.type, 'Mãe Selva', d.seedX, d.seedY);
        this.hooks.onAutoDisaster(d.type, d.seedX, d.seedY);
      }
    }
  }

  startDecreeVote(id: number, pairIndex: number, duration: number): void {
    const options = DECREE_PAIRS[pairIndex % DECREE_PAIRS.length];
    this.decree = {
      phase: 'voting',
      id,
      options,
      votes: {},
      remaining: duration,
      activeOption: null,
    };
    this.hooks.onToast(`🗳️ Votação de Decreto: ${options[0].emoji} vs ${options[1].emoji}!`, 'info');
    this.hooks.onSound('click', 0.22);
  }

  castDecreeVote(decreeId: number, optionIndex: 0 | 1, voterId: string, voterName: string, isSinglePlayer: boolean): void {
    if (this.decree.phase !== 'voting' || this.decree.id !== decreeId) return;
    this.decree.votes[voterId] = optionIndex;
    const opt = this.decree.options[optionIndex];
    this.hooks.onToast(`🗳️ ${voterName} votou em ${opt.emoji} ${opt.title}`, 'info');
    if (isSinglePlayer) {
      this.finalizeDecreeVote();
    }
  }

  private finalizeDecreeVote(): void {
    let v0 = 0;
    let v1 = 0;
    for (const v of Object.values(this.decree.votes)) {
      if (v === 0) v0++;
      else v1++;
    }
    const winner = v1 > v0 ? this.decree.options[1] : this.decree.options[0];
    this.decree.phase = 'active';
    this.decree.activeOption = winner;
    this.decree.remaining = 24;
    this.recomputeAurasAndPower();
    this.hooks.onToast(`📜 Decreto Aprovado: ${winner.emoji} ${winner.title}!`, 'banana');
    this.hooks.onSound('fanfare', 0.25);
    this.pushTweet({
      handle: '@chimpanze_fiscal',
      avatar: '📜',
      text: `DECRETO APROVADO: "${winner.title}"! (${winner.summary})`,
      tone: 'meme',
    });
  }

  private updateDecree(dt: number, isHost: boolean): void {
    if (this.decree.phase === 'idle') {
      if (this.stats.population >= 15) {
        this.decreeTimer -= dt;
        if (this.decreeTimer <= 0) {
          this.decreeTimer = 55;
          if (isHost) {
            const id = this.nextId++;
            const pairIndex = Math.floor(Math.random() * DECREE_PAIRS.length);
            this.startDecreeVote(id, pairIndex, 12);
            this.hooks.onStartDecreeVote(id, pairIndex, 12);
          }
        }
      }
      return;
    }

    this.decree.remaining -= dt;
    if (this.decree.remaining <= 0) {
      if (this.decree.phase === 'voting') {
        this.finalizeDecreeVote();
      } else {
        this.decree = this.createIdleDecree();
        this.recomputeAurasAndPower();
        this.hooks.onToast('📜 O Decreto Maluco expirou!', 'info');
      }
    }
  }

  getScore(): number {
    const safeBananas = this.mode === 'sandbox' ? 0 : Math.max(0, this.stats.bananas);
    return Math.max(0, Math.floor(this.stats.population * 12 + safeBananas));
  }

  private tickEconomy(isHost: boolean): void {
    this.recomputeAurasAndPower();
    this.stats.day += 1;

    const garbagePenalty = this.stats.garbageLoad > this.stats.garbageCapacity ? 12 : 0;

    for (const h of this.houseTiles) {
      if (h.damaged) continue;
      const effectiveHapp = Math.max(0, h.localHappiness - garbagePenalty);
      if (h.powered && h.connectedToRoad) {
        const prev = h.level;
        if (effectiveHapp >= 78 && h.level < 3 && Math.random() < 0.25) h.level++;
        else if (effectiveHapp >= 65 && h.level < 2 && Math.random() < 0.3) h.level++;
        else if (effectiveHapp < 35 && h.level > 1 && Math.random() < 0.25) h.level--;
        if (h.level > prev) {
          h.levelUpTimer = 3.5;
          const { wx, wy } = gridToWorld(h.gx, h.gy);
          this.spawnFloatingText(wx, wy - 36, `⬆️ Nível ${h.level}!`, '#4ade80');
        }
      }
    }

    for (const f of this.factoryTiles) {
      if (!f.damaged && f.powered && f.connectedToRoad) {
        const { wx, wy } = gridToWorld(f.gx, f.gy);
        this.spawnBurst(wx, wy - 28, '#a3e635', 2, 'stink');
      }
    }

    let totalTraffic = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const t = this.grid[y][x];
        if (t.building === 'dump' && !t.damaged) {
          const { wx, wy } = gridToWorld(x, y);
          this.spawnBurst(wx, wy - 10, '#84cc16', 2, 'stink');
        }
        if (t.building === 'road') {
          totalTraffic += t.trafficLoad;
        }
      }
    }

    const econ = this.computeEconomyPreview();
    this.deliveryBucket = 0;
    if (this.mode !== 'sandbox') {
      this.stats.bananas = Math.round(this.stats.bananas + econ.netPerTick);
    } else {
      this.stats.bananas = 99999;
    }

    this.recomputeAurasAndPower();
    this.stats.trafficCongestion =
      this.roadTiles.length > 0 ? Math.min(100, Math.round((totalTraffic / this.roadTiles.length) * 42)) : 0;

    this.checkMissions();

    // Check milestones
    const nextIdx = this.stats.milestoneIndex + 1;
    if (nextIdx < MILESTONES.length && this.stats.population >= MILESTONES[nextIdx].popRequired) {
      this.stats.milestoneIndex = nextIdx;
      const ms = MILESTONES[nextIdx];
      if (this.mode !== 'sandbox') {
        this.stats.bananas += ms.bonusBananas;
      }
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

    // Check bankruptcy / rebellion (host or solo, classic/local2p)
    if (isHost && this.mode !== 'sandbox') {
      if (this.stats.bananas < -150) {
        this.stats.bankruptTimer += 1.5;
        if (this.stats.bankruptTimer >= 12) {
          this.crisisTriggered = true;
          this.hooks.onCrisis('bankrupt');
        }
      } else {
        this.stats.bankruptTimer = 0;
      }

      if (this.stats.population >= 24 && this.stats.happiness < 18) {
        this.stats.rebellionTimer += 1.5;
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
    for (const r of this.roadTiles) {
      const t = this.grid[r.gy][r.gx];
      t.trafficLoad = Math.max(0, t.trafficLoad - dt * 1.15);
    }

    this.vehicleSpawnTimer -= dt;
    if (this.vehicleSpawnTimer <= 0 && this.vehicles.length < 44) {
      this.vehicleSpawnTimer = Math.max(0.28, 1.3 - this.houseTiles.length * 0.06);
      this.trySpawnVehicle();
    }

    const activeCoconutRain = this.disasters.some((d) => d.type === 'coconut_rain');

    const alive: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.pathIndex >= v.path.length - 1) {
        if (v.kind === 'banana_car' || v.kind === 'monkey_bus') {
          if (this.mode !== 'sandbox') this.stats.bananas += 6;
          this.deliveryBucket += 6;
          const { wx, wy } = gridToWorld(v.gx, v.gy);
          this.spawnFloatingText(wx, wy - 14, '+6🍌', '#fde047');
        } else if (v.kind === 'pacoca_truck') {
          if (this.mode !== 'sandbox') this.stats.bananas += 9;
          this.deliveryBucket += 9;
          const { wx, wy } = gridToWorld(v.gx, v.gy);
          this.spawnFloatingText(wx, wy - 14, '+9🍌', '#d8b4fe');
        }
        continue;
      }

      const curNode = v.path[v.pathIndex];
      const nextNode = v.path[v.pathIndex + 1];

      if (!inBounds(nextNode.gx, nextNode.gy) || this.grid[nextNode.gy][nextNode.gx].building !== 'road') {
        continue;
      }

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
    const origins = [...this.houseTiles, ...this.factoryTiles].filter((t) => !t.damaged);
    const dests = [...this.marketTiles, ...this.houseTiles].filter((t) => !t.damaged);
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
      color:
        kind === 'banana_car'
          ? '#facc15'
          : kind === 'pacoca_truck'
            ? '#c084fc'
            : colors[Math.floor(Math.random() * colors.length)],
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
      strike: `GREVE GERAL! Queremos jornada 4x3 e banana grátis na firma! 🪧🍌 (${actorName})`,
      coconut_rain: `TÁ CHOVENDO COCO NA MINHA CABEÇA SOCORRO 🥥💥`,
      trio_eletrico: `BOTARAM UM TRIO ELÉTRICO NA RUA DA FEIRA, NINGUÉM PASSA 🎶🚌`,
      giant_gorilla: `SOCORRO TEM UM GORILÃO DE PELÚCIA GIGANTE DANIFICANDO O BAIRRO!! 🦍💜`,
    };
    this.pushTweet({
      handle: '@sagui_calvo',
      avatar: '🚨',
      text: tweetMap[type],
      tone: 'chaos',
    });
  }

  private updateDisasters(dt: number): void {
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
            if (tile.building && tile.building !== 'road' && tile.building !== 'townhall' && !tile.damaged) {
              tile.damaged = true;
              this.spawnBurst(wx, wy - 8, '#f97316', 14, 'smoke');
              this.spawnFloatingText(wx, wy - 24, 'DANIFICOU! 🔧', '#fb7185');
              this.hooks.onSound('explosion', 0.2);
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
    const pollutedHouses = this.houseTiles.filter((h) => h.pollution >= 22).length;
    const candidates: Array<Omit<ChimpTweet, 'id' | 'likes' | 'timeLabel'>> = [];

    if (this.stats.damagedCount > 0) {
      candidates.push({
        handle: '@gorila_clt',
        avatar: '🔧',
        text: `Tem ${this.stats.damagedCount} prédio(s) amassado(s) pelo Gorilão! Clica com Inspecionar (0) pra reparar!`,
        tone: 'rage',
      });
    }

    if (this.stats.trafficCongestion >= 35) {
      candidates.push(
        {
          handle: '@sagui_calvo',
          avatar: '🐒',
          text: '3 HORAS NO TRÂNSITO PRA COMPRAR BANANA, ABRE MAIS RUA PREFEITO!',
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

    if (this.stats.unpoweredCount > 0) {
      candidates.push({
        handle: '@gorila_clt',
        avatar: '⚡',
        text: `${this.stats.unpoweredCount} prédio(s) sem luz! Coloca uma Usina de Casca (5) perto deles!`,
        tone: 'rage',
      });
    }

    if (this.stats.noRoadCount > 0) {
      candidates.push({
        handle: '@tia_do_cipo',
        avatar: '🛣️',
        text: 'Construíram meu barraco no meio do mato SEM ESTRADA, vou de cipó trabalhar??',
        tone: 'rage',
      });
    }

    if (pollutedHouses > 0) {
      candidates.push({
        handle: '@mico_dev',
        avatar: '☁️',
        text: 'Cheiro de paçoca queimada e coco entrando na janela! Afasta a Fábrica/Lixão! 🤢',
        tone: 'rage',
      });
    }

    if (this.stats.garbageLoad > this.stats.garbageCapacity) {
      candidates.push({
        handle: '@chimpanze_fiscal',
        avatar: '🗑️',
        text: 'Lixo transbordando! Construa um Lixão de Coco (7) longe das casas!',
        tone: 'rage',
      });
    }

    if (this.mode !== 'sandbox' && this.stats.bananas < 45) {
      candidates.push({
        handle: '@orangotango_coach',
        avatar: '📉',
        text: 'Cofre apertado! Faz mais Feira de Banana (3) ou Fábrica de Paçoca (4)!',
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
          text: 'Melhor gestão primata da história! Luz ligada e banana gelada!',
          tone: 'love',
        },
      );
    }

    if (this.lastBuildActor && Math.random() < 0.35) {
      const def = TOOL_MAP[this.lastBuildActor.tool];
      candidates.push({
        handle: '@mico_dev',
        avatar: '🏗️',
        text: `${this.lastBuildActor.name} usou ${def.emoji} ${def.shortName} sem licitação KKKKK`,
        tone: 'meme',
      });
      this.lastBuildActor = null;
    }

    if (candidates.length === 0) {
      candidates.push(
        {
          handle: '@macaco_slop',
          avatar: '🍌',
          text: 'Alguém sabe que horas passa o ônibus das bananas na Av. das Bananas?',
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
      life: 1.3,
      maxLife: 1.3,
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
            damaged: t.damaged,
            builtBy: t.builtBy,
          });
        }
      }
    }
    const contribObj: Record<string, PlayerContribution> = {};
    for (const [k, v] of this.contributions) {
      contribObj[k] = { ...v };
    }
    return {
      seed: this.seed,
      mode: this.mode,
      simSpeed: this.simSpeed,
      bananas: this.stats.bananas,
      day: this.stats.day,
      highestMilestone: this.stats.milestoneIndex,
      completedMissionIds: Array.from(this.completedMissionIds),
      contributions: contribObj,
      decree: { ...this.decree, votes: { ...this.decree.votes } },
      incomingDisaster: this.incomingDisaster ? { ...this.incomingDisaster } : null,
      tiles,
    };
  }

  importSnapshot(snap: CitySnapshot, preserveVehicles = false): void {
    const seedChanged = this.seed !== snap.seed;
    this.seed = snap.seed;
    this.mode = snap.mode;
    this.simSpeed = snap.simSpeed;
    if (seedChanged) {
      this.grid = generateMap(snap.seed);
    } else {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          this.grid[y][x].building = null;
          this.grid[y][x].level = 1;
          this.grid[y][x].damaged = false;
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
        t.damaged = item.damaged;
        t.builtBy = item.builtBy;
      }
    }
    this.stats.bananas = snap.bananas;
    this.stats.day = snap.day;
    this.stats.milestoneIndex = snap.highestMilestone;
    this.completedMissionIds = new Set(snap.completedMissionIds ?? []);
    this.contributions.clear();
    if (snap.contributions) {
      for (const [k, v] of Object.entries(snap.contributions)) {
        this.contributions.set(k, { ...v });
      }
    }
    if (snap.decree) {
      this.decree = { ...snap.decree, votes: { ...snap.decree.votes } };
    }
    this.incomingDisaster = snap.incomingDisaster ?? null;
    if (seedChanged || !preserveVehicles) {
      this.vehicles = [];
    }
    this.rebuildTileCaches();
    this.recomputeAurasAndPower();
  }
}
