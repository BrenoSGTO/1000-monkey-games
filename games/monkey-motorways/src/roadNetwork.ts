import { GRID_COLS, GRID_ROWS } from './constants';
import type {
  GridCoord,
  House,
  Inventory,
  MapDefinition,
  Market,
  Roundabout,
  TrafficLight,
  VineMotorway,
} from './types';

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): GridCoord {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function edgeKey(ax: number, ay: number, bx: number, by: number): string {
  if (ax < bx || (ax === bx && ay <= by)) {
    return `${ax},${ay}-${bx},${by}`;
  }
  return `${bx},${by}-${ax},${ay}`;
}

export function parseEdgeKey(key: string): [GridCoord, GridCoord] {
  const [a, b] = key.split('-');
  return [parseCellKey(a), parseCellKey(b)];
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
}

export function isAdjacent8(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
}

export interface BuildingLookup {
  houseByCell: Map<string, House>;
  marketByCell: Map<string, Market>;
}

export function buildBuildingLookup(houses: House[], markets: Market[]): BuildingLookup {
  const houseByCell = new Map<string, House>();
  for (const h of houses) {
    houseByCell.set(cellKey(h.x, h.y), h);
  }
  const marketByCell = new Map<string, Market>();
  for (const m of markets) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        marketByCell.set(cellKey(m.x + dx, m.y + dy), m);
      }
    }
  }
  return { houseByCell, marketByCell };
}

export interface PreviewSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  isBridge: boolean;
  valid: boolean;
  reason?: string;
}

export interface RoadPathPreview {
  segments: PreviewSegment[];
  roadsCost: number;
  bridgesCost: number;
  valid: boolean;
  reason?: string;
}

export interface CellRemovalResult {
  changed: boolean;
  removedEdges: Array<{ ax: number; ay: number; bx: number; by: number }>;
  removedLight: boolean;
  removedRoundabout: boolean;
  removedMotorway: VineMotorway | null;
  roadsRefunded: number;
  bridgesRefunded: number;
}

export class RoadNetwork {
  public edges = new Set<string>();
  public adjacency = new Map<string, Set<string>>();
  public lights = new Map<string, TrafficLight>();
  public roundabouts = new Map<string, Roundabout>();
  public motorways: VineMotorway[] = [];
  public version = 1;

  clear(): void {
    this.edges.clear();
    this.adjacency.clear();
    this.lights.clear();
    this.roundabouts.clear();
    this.motorways = [];
    this.version++;
  }

  loadFromSnapshot(
    roadEdges: string[],
    lights: TrafficLight[],
    roundabouts: Roundabout[],
    motorways: VineMotorway[],
    version: number,
  ): void {
    this.edges.clear();
    this.adjacency.clear();
    for (const ek of roadEdges) {
      const [a, b] = parseEdgeKey(ek);
      this.insertEdgeRaw(a.x, a.y, b.x, b.y);
    }
    this.lights.clear();
    for (const l of lights) {
      this.lights.set(cellKey(l.x, l.y), { ...l });
    }
    this.roundabouts.clear();
    for (const r of roundabouts) {
      this.roundabouts.set(cellKey(r.x, r.y), { ...r });
    }
    this.motorways = motorways.map((m) => ({ ...m }));
    this.version = version;
  }

  private insertEdgeRaw(ax: number, ay: number, bx: number, by: number): void {
    const ek = edgeKey(ax, ay, bx, by);
    this.edges.add(ek);
    const ka = cellKey(ax, ay);
    const kb = cellKey(bx, by);
    if (!this.adjacency.has(ka)) this.adjacency.set(ka, new Set());
    if (!this.adjacency.has(kb)) this.adjacency.set(kb, new Set());
    this.adjacency.get(ka)!.add(kb);
    this.adjacency.get(kb)!.add(ka);
  }

  private deleteEdgeRaw(ax: number, ay: number, bx: number, by: number): void {
    const ek = edgeKey(ax, ay, bx, by);
    this.edges.delete(ek);
    const ka = cellKey(ax, ay);
    const kb = cellKey(bx, by);
    this.adjacency.get(ka)?.delete(kb);
    this.adjacency.get(kb)?.delete(ka);
    if (this.adjacency.get(ka)?.size === 0) this.adjacency.delete(ka);
    if (this.adjacency.get(kb)?.size === 0) this.adjacency.delete(kb);
  }

  getDegree(x: number, y: number): number {
    return this.adjacency.get(cellKey(x, y))?.size ?? 0;
  }

  hasEdge(ax: number, ay: number, bx: number, by: number): boolean {
    return this.edges.has(edgeKey(ax, ay, bx, by));
  }

  getNeighbors(x: number, y: number): GridCoord[] {
    const set = this.adjacency.get(cellKey(x, y));
    if (!set) return [];
    const out: GridCoord[] = [];
    for (const k of set) out.push(parseCellKey(k));
    return out;
  }

  canAddEdge(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
    virtualDegrees?: Map<string, number>,
  ): { ok: boolean; reason?: string; roadsCost: number; bridgesCost: number } {
    if (!inBounds(ax, ay) || !inBounds(bx, by)) {
      return { ok: false, roadsCost: 0, bridgesCost: 0 };
    }
    if (!isAdjacent8(ax, ay, bx, by)) {
      return { ok: false, roadsCost: 0, bridgesCost: 0 };
    }
    if (this.hasEdge(ax, ay, bx, by)) {
      return { ok: false, roadsCost: 0, bridgesCost: 0 };
    }

    const ta = map.tiles[ay][ax];
    const tb = map.tiles[by][bx];
    if (ta === 'tree' || ta === 'rock' || tb === 'tree' || tb === 'rock') {
      return { ok: false, reason: 'Obstáculo na selva!', roadsCost: 0, bridgesCost: 0 };
    }

    const ka = cellKey(ax, ay);
    const kb = cellKey(bx, by);
    const degA = virtualDegrees ? (virtualDegrees.get(ka) ?? this.getDegree(ax, ay)) : this.getDegree(ax, ay);
    const degB = virtualDegrees ? (virtualDegrees.get(kb) ?? this.getDegree(bx, by)) : this.getDegree(bx, by);

    const ha = lookup.houseByCell.get(ka);
    const hb = lookup.houseByCell.get(kb);
    const ma = lookup.marketByCell.get(ka);
    const mb = lookup.marketByCell.get(kb);

    // Prevent internal edges within the same 2x2 market or between adjacent markets/houses
    if (ma && mb && ma.id === mb.id) {
      return { ok: false, roadsCost: 0, bridgesCost: 0 };
    }
    if (ha && hb) {
      return { ok: false, reason: 'Não ligue casinhas direto entre si!', roadsCost: 0, bridgesCost: 0 };
    }
    if (ma && mb) {
      return { ok: false, reason: 'Não ligue mercados direto entre si!', roadsCost: 0, bridgesCost: 0 };
    }

    // Prevent "road through building" trap: houses have max 1 driveway exit,
    // and each market cell accepts max 1 terminal connection so roads never pass through buildings.
    if ((ha && degA >= 1) || (hb && degB >= 1)) {
      return { ok: false, reason: 'Casinha só pode ter 1 saída!', roadsCost: 0, bridgesCost: 0 };
    }
    if ((ma && degA >= 1) || (mb && degB >= 1)) {
      return { ok: false, reason: 'Não atravesse o mercado! Contorne por fora.', roadsCost: 0, bridgesCost: 0 };
    }

    // Check diagonal over water barrier
    const isDiag = ax !== bx && ay !== by;
    if ((ta === 'water' || tb === 'water') && isDiag) {
      return { ok: false, reason: 'Pontes devem ser retas!', roadsCost: 0, bridgesCost: 0 };
    }
    if (isDiag && map.tiles[ay][bx] === 'water' && map.tiles[by][ax] === 'water') {
      return { ok: false, reason: 'Use uma ponte para cruzar o rio!', roadsCost: 0, bridgesCost: 0 };
    }

    const bridgesCost =
      (ta === 'water' && degA === 0 ? 1 : 0) +
      (tb === 'water' && degB === 0 ? 1 : 0);
    const roadsCost = ta !== 'water' && tb !== 'water' ? 1 : 0;

    if (inventory.bridges < bridgesCost) {
      return { ok: false, reason: 'Sem Pontes de Bambu!', roadsCost, bridgesCost };
    }
    if (inventory.roads < roadsCost) {
      return { ok: false, reason: 'Sem peças de Estrada!', roadsCost, bridgesCost };
    }

    return { ok: true, roadsCost, bridgesCost };
  }

  previewRoadPath(
    cells: GridCoord[],
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
  ): RoadPathPreview {
    if (cells.length < 2) {
      return { segments: [], roadsCost: 0, bridgesCost: 0, valid: false };
    }

    const virtualInv: Inventory = { ...inventory };
    const virtualDeg = new Map<string, number>();
    const virtualEdges = new Set<string>();
    const segments: PreviewSegment[] = [];
    let roadsCost = 0;
    let bridgesCost = 0;
    let firstInvalidReason: string | undefined;

    for (let i = 0; i < cells.length - 1; i++) {
      const a = cells[i];
      const b = cells[i + 1];
      const ek = edgeKey(a.x, a.y, b.x, b.y);
      if (this.hasEdge(a.x, a.y, b.x, b.y) || virtualEdges.has(ek)) {
        continue;
      }

      const ta = map.tiles[a.y]?.[a.x];
      const tb = map.tiles[b.y]?.[b.x];
      const isBridge = ta === 'water' || tb === 'water';
      const check = this.canAddEdge(a.x, a.y, b.x, b.y, map, lookup, virtualInv, virtualDeg);

      if (check.ok) {
        virtualInv.roads -= check.roadsCost;
        virtualInv.bridges -= check.bridgesCost;
        roadsCost += check.roadsCost;
        bridgesCost += check.bridgesCost;
        virtualEdges.add(ek);
        const ka = cellKey(a.x, a.y);
        const kb = cellKey(b.x, b.y);
        virtualDeg.set(ka, (virtualDeg.get(ka) ?? this.getDegree(a.x, a.y)) + 1);
        virtualDeg.set(kb, (virtualDeg.get(kb) ?? this.getDegree(b.x, b.y)) + 1);
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, isBridge, valid: true });
      } else {
        if (!firstInvalidReason && check.reason) {
          firstInvalidReason = check.reason;
        }
        segments.push({
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
          isBridge,
          valid: false,
          reason: check.reason,
        });
      }
    }

    return {
      segments,
      roadsCost,
      bridgesCost,
      valid: segments.some((s) => s.valid),
      reason: firstInvalidReason,
    };
  }

  addEdge(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
  ): { added: boolean; reason?: string; usedBridge: boolean } {
    const check = this.canAddEdge(ax, ay, bx, by, map, lookup, inventory);
    if (!check.ok) {
      return { added: false, reason: check.reason, usedBridge: false };
    }
    inventory.roads -= check.roadsCost;
    inventory.bridges -= check.bridgesCost;
    this.insertEdgeRaw(ax, ay, bx, by);
    this.version++;
    return { added: true, usedBridge: check.bridgesCost > 0 };
  }

  removeEdge(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    map: MapDefinition,
    inventory: Inventory,
  ): boolean {
    if (!this.hasEdge(ax, ay, bx, by)) return false;

    const ta = map.tiles[ay][ax];
    const tb = map.tiles[by][bx];
    this.deleteEdgeRaw(ax, ay, bx, by);

    if (ta !== 'water' && tb !== 'water') {
      inventory.roads += 1;
    }
    if (ta === 'water' && this.getDegree(ax, ay) === 0) {
      inventory.bridges += 1;
    }
    if (tb === 'water' && this.getDegree(bx, by) === 0) {
      inventory.bridges += 1;
    }

    this.cleanupOrphanedNodes(ax, ay, inventory);
    this.cleanupOrphanedNodes(bx, by, inventory);
    this.version++;
    return true;
  }

  removeCellContentDetailed(
    gx: number,
    gy: number,
    map: MapDefinition,
    inventory: Inventory,
  ): CellRemovalResult {
    const result: CellRemovalResult = {
      changed: false,
      removedEdges: [],
      removedLight: false,
      removedRoundabout: false,
      removedMotorway: null,
      roadsRefunded: 0,
      bridgesRefunded: 0,
    };
    const key = cellKey(gx, gy);

    // Priority 1: Remove ONLY the Traffic Light if present (preserve intersection roads!)
    if (this.lights.delete(key)) {
      inventory.lights += 1;
      result.removedLight = true;
      result.changed = true;
      this.version++;
      return result;
    }

    // Priority 2: Remove ONLY the Roundabout if present (preserve intersection roads!)
    if (this.roundabouts.delete(key)) {
      inventory.roundabouts += 1;
      result.removedRoundabout = true;
      result.changed = true;
      this.version++;
      return result;
    }

    // Priority 3: Remove ONLY the Motorway anchored at this cell
    const mwIdx = this.motorways.findIndex(
      (m) => (m.ax === gx && m.ay === gy) || (m.bx === gx && m.by === gy),
    );
    if (mwIdx >= 0) {
      const [removed] = this.motorways.splice(mwIdx, 1);
      inventory.motorways += 1;
      result.removedMotorway = removed;
      result.changed = true;
      this.version++;
      return result;
    }

    // Priority 4: Otherwise remove road edges attached to this cell
    const prevRoads = inventory.roads;
    const prevBridges = inventory.bridges;
    const neighbors = this.getNeighbors(gx, gy);
    for (const n of neighbors) {
      if (this.removeEdge(gx, gy, n.x, n.y, map, inventory)) {
        result.removedEdges.push({ ax: gx, ay: gy, bx: n.x, by: n.y });
        result.changed = true;
      }
    }
    result.roadsRefunded = Math.max(0, inventory.roads - prevRoads);
    result.bridgesRefunded = Math.max(0, inventory.bridges - prevBridges);

    if (result.changed) this.version++;
    return result;
  }

  removeCellContent(
    gx: number,
    gy: number,
    map: MapDefinition,
    inventory: Inventory,
  ): boolean {
    return this.removeCellContentDetailed(gx, gy, map, inventory).changed;
  }

  private cleanupOrphanedNodes(x: number, y: number, inventory: Inventory): void {
    const key = cellKey(x, y);
    if (this.getDegree(x, y) === 0) {
      if (this.lights.delete(key)) {
        inventory.lights += 1;
      }
      if (this.roundabouts.delete(key)) {
        inventory.roundabouts += 1;
      }
    }
  }

  toggleTrafficLight(
    gx: number,
    gy: number,
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
  ): { changed: boolean; action?: 'added' | 'removed'; reason?: string } {
    if (!inBounds(gx, gy)) return { changed: false };
    const key = cellKey(gx, gy);
    if (this.lights.has(key)) {
      this.lights.delete(key);
      inventory.lights += 1;
      this.version++;
      return { changed: true, action: 'removed' };
    }
    if (map.tiles[gy][gx] !== 'land') {
      return { changed: false, reason: 'Semáforo só em terra firme!' };
    }
    if (lookup.houseByCell.has(key) || lookup.marketByCell.has(key)) {
      return { changed: false, reason: 'Não dá pra pôr semáforo em prédio!' };
    }
    if (this.roundabouts.has(key)) {
      return { changed: false, reason: 'Já tem uma rotatória aqui!' };
    }
    if (this.getDegree(gx, gy) < 2) {
      return { changed: false, reason: 'Coloque em uma rua ou cruzamento!' };
    }
    if (inventory.lights <= 0) {
      return { changed: false, reason: 'Sem Semáforos no estoque!' };
    }
    inventory.lights -= 1;
    this.lights.set(key, { x: gx, y: gy, phase: 0, timer: 0 });
    this.version++;
    return { changed: true, action: 'added' };
  }

  toggleRoundabout(
    gx: number,
    gy: number,
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
  ): { changed: boolean; action?: 'added' | 'removed'; reason?: string } {
    if (!inBounds(gx, gy)) return { changed: false };
    const key = cellKey(gx, gy);
    if (this.roundabouts.has(key)) {
      this.roundabouts.delete(key);
      inventory.roundabouts += 1;
      this.version++;
      return { changed: true, action: 'removed' };
    }
    if (map.tiles[gy][gx] !== 'land') {
      return { changed: false, reason: 'Rotatória só em terra firme!' };
    }
    if (lookup.houseByCell.has(key) || lookup.marketByCell.has(key)) {
      return { changed: false, reason: 'Não cabe rotatória dentro do prédio!' };
    }
    if (this.lights.has(key)) {
      this.lights.delete(key);
      inventory.lights += 1;
    }
    if (this.getDegree(gx, gy) < 2) {
      return { changed: false, reason: 'Coloque em uma rua ou cruzamento!' };
    }
    if (inventory.roundabouts <= 0) {
      return { changed: false, reason: 'Sem Rotatórias no estoque!' };
    }
    inventory.roundabouts -= 1;
    this.roundabouts.set(key, { x: gx, y: gy });
    this.version++;
    return { changed: true, action: 'added' };
  }

  canAddMotorway(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
  ): { ok: boolean; reason?: string } {
    if (!inBounds(ax, ay) || !inBounds(bx, by)) {
      return { ok: false };
    }
    const dist = Math.hypot(bx - ax, by - ay);
    if (dist < 2.2) {
      return { ok: false, reason: 'Estique o cipó por pelo menos 3 casas!' };
    }
    if (inventory.motorways <= 0) {
      return { ok: false, reason: 'Sem Cipós Express no estoque!' };
    }
    const ka = cellKey(ax, ay);
    const kb = cellKey(bx, by);
    const ta = map.tiles[ay][ax];
    const tb = map.tiles[by][bx];
    if (
      ta === 'water' ||
      tb === 'water' ||
      ta === 'rock' ||
      tb === 'rock' ||
      ta === 'tree' ||
      tb === 'tree' ||
      lookup.marketByCell.has(ka) ||
      lookup.marketByCell.has(kb) ||
      lookup.houseByCell.has(ka) ||
      lookup.houseByCell.has(kb)
    ) {
      return { ok: false, reason: 'Prenda as pontas do cipó em terra/estrada!' };
    }
    const dup = this.motorways.some(
      (m) =>
        (m.ax === ax && m.ay === ay && m.bx === bx && m.by === by) ||
        (m.ax === bx && m.ay === by && m.bx === ax && m.by === ay),
    );
    if (dup) {
      return { ok: false, reason: 'Já existe um cipó ligando esses pontos!' };
    }
    return { ok: true };
  }

  addMotorway(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    map: MapDefinition,
    lookup: BuildingLookup,
    inventory: Inventory,
    id: string,
  ): { added: boolean; reason?: string } {
    const check = this.canAddMotorway(ax, ay, bx, by, map, lookup, inventory);
    if (!check.ok) {
      return { added: false, reason: check.reason };
    }

    inventory.motorways -= 1;
    this.motorways.push({
      id,
      ax,
      ay,
      bx,
      by,
      color: '#84cc16',
    });
    this.version++;
    return { added: true };
  }

  removeMotorway(id: string, inventory: Inventory): boolean {
    const idx = this.motorways.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    this.motorways.splice(idx, 1);
    inventory.motorways += 1;
    this.version++;
    return true;
  }
}
