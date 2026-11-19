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

    // Prevent internal edges within the same 2x2 market
    const ma = lookup.marketByCell.get(cellKey(ax, ay));
    const mb = lookup.marketByCell.get(cellKey(bx, by));
    if (ma && mb && ma.id === mb.id) {
      return { ok: false, roadsCost: 0, bridgesCost: 0 };
    }

    // Prevent direct house-to-house or building-to-building shortcut? Actually allow house->market if adjacent!
    // Check diagonal over water barrier
    const isDiag = ax !== bx && ay !== by;
    if ((ta === 'water' || tb === 'water') && isDiag) {
      return { ok: false, reason: 'Pontes devem ser retas!', roadsCost: 0, bridgesCost: 0 };
    }
    if (isDiag && map.tiles[ay][bx] === 'water' && map.tiles[by][ax] === 'water') {
      return { ok: false, reason: 'Use uma ponte para cruzar o rio!', roadsCost: 0, bridgesCost: 0 };
    }

    const bridgesCost =
      (ta === 'water' && this.getDegree(ax, ay) === 0 ? 1 : 0) +
      (tb === 'water' && this.getDegree(bx, by) === 0 ? 1 : 0);
    const roadsCost = ta !== 'water' && tb !== 'water' ? 1 : 0;

    if (inventory.bridges < bridgesCost) {
      return { ok: false, reason: 'Sem Pontes de Bambu!', roadsCost, bridgesCost };
    }
    if (inventory.roads < roadsCost) {
      return { ok: false, reason: 'Sem peças de Estrada!', roadsCost, bridgesCost };
    }

    return { ok: true, roadsCost, bridgesCost };
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

    // Refund lights/roundabouts if node lost all roads
    this.cleanupOrphanedNodes(ax, ay, inventory);
    this.cleanupOrphanedNodes(bx, by, inventory);
    this.version++;
    return true;
  }

  removeCellContent(
    gx: number,
    gy: number,
    map: MapDefinition,
    inventory: Inventory,
  ): boolean {
    let changed = false;
    const key = cellKey(gx, gy);

    // First check if clicking a traffic light or roundabout on this cell?
    // If erasing cell, remove all attached edges + any light/roundabout/motorway anchored here
    const neighbors = this.getNeighbors(gx, gy);
    for (const n of neighbors) {
      if (this.removeEdge(gx, gy, n.x, n.y, map, inventory)) {
        changed = true;
      }
    }

    if (this.lights.delete(key)) {
      inventory.lights += 1;
      changed = true;
    }
    if (this.roundabouts.delete(key)) {
      inventory.roundabouts += 1;
      changed = true;
    }

    const mwIdx = this.motorways.findIndex(
      (m) => (m.ax === gx && m.ay === gy) || (m.bx === gx && m.by === gy),
    );
    if (mwIdx >= 0) {
      this.motorways.splice(mwIdx, 1);
      inventory.motorways += 1;
      changed = true;
    }

    if (changed) this.version++;
    return changed;
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
      // Auto-refund light if upgrading intersection to roundabout
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
    if (!inBounds(ax, ay) || !inBounds(bx, by)) {
      return { added: false };
    }
    const dist = Math.hypot(bx - ax, by - ay);
    if (dist < 2.2) {
      return { added: false, reason: 'Estique o cipó por pelo menos 3 casas!' };
    }
    if (inventory.motorways <= 0) {
      return { added: false, reason: 'Sem Cipós Express no estoque!' };
    }
    const ka = cellKey(ax, ay);
    const kb = cellKey(bx, by);
    if (
      map.tiles[ay][ax] === 'water' ||
      map.tiles[by][bx] === 'water' ||
      map.tiles[ay][ax] === 'rock' ||
      map.tiles[by][bx] === 'rock' ||
      lookup.marketByCell.has(ka) ||
      lookup.marketByCell.has(kb) ||
      lookup.houseByCell.has(ka) ||
      lookup.houseByCell.has(kb)
    ) {
      return { added: false, reason: 'Prenda as pontas do cipó em terra/estrada!' };
    }
    const dup = this.motorways.some(
      (m) =>
        (m.ax === ax && m.ay === ay && m.bx === bx && m.by === by) ||
        (m.ax === bx && m.ay === by && m.bx === ax && m.by === ay),
    );
    if (dup) {
      return { added: false, reason: 'Já existe um cipó ligando esses pontos!' };
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
