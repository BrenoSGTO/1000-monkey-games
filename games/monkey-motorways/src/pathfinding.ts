import { cellKey, parseCellKey, type BuildingLookup, type RoadNetwork } from './roadNetwork';
import type { GridCoord, Market, PathStep } from './types';

interface NeighborEdge {
  key: string;
  x: number;
  y: number;
  cost: number;
  isMotorway: boolean;
  motorwayId?: string;
}

/**
 * Weighted A* pathfinder over road network + Vine Motorways.
 * Enforces that intermediate nodes cannot pass through houses or markets.
 */
export function findPathToMarket(
  network: RoadNetwork,
  lookup: BuildingLookup,
  start: GridCoord,
  market: Market,
): PathStep[] | null {
  const goalCells: GridCoord[] = [];
  const goalSet = new Set<string>();
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const gx = market.x + dx;
      const gy = market.y + dy;
      const k = cellKey(gx, gy);
      goalCells.push({ x: gx, y: gy });
      goalSet.add(k);
    }
  }

  const startKey = cellKey(start.x, start.y);
  return runAStar(network, lookup, start, startKey, goalCells, goalSet);
}

export function findPathToCell(
  network: RoadNetwork,
  lookup: BuildingLookup,
  start: GridCoord,
  goal: GridCoord,
): PathStep[] | null {
  const startKey = cellKey(start.x, start.y);
  const goalKey = cellKey(goal.x, goal.y);
  return runAStar(network, lookup, start, startKey, [goal], new Set([goalKey]));
}

function runAStar(
  network: RoadNetwork,
  lookup: BuildingLookup,
  start: GridCoord,
  startKey: string,
  goalCells: GridCoord[],
  goalSet: Set<string>,
): PathStep[] | null {
  if (goalSet.has(startKey)) {
    return [{ x: start.x, y: start.y }];
  }

  // Build quick motorway lookup by endpoint
  const motorwayAdj = new Map<string, NeighborEdge[]>();
  for (const mw of network.motorways) {
    const ka = cellKey(mw.ax, mw.ay);
    const kb = cellKey(mw.bx, mw.by);
    const dist = Math.hypot(mw.bx - mw.ax, mw.by - mw.ay);
    // Motorways are much faster so their effective travel cost is 0.45 * dist
    const cost = Math.max(0.8, dist * 0.45);
    if (!motorwayAdj.has(ka)) motorwayAdj.set(ka, []);
    if (!motorwayAdj.has(kb)) motorwayAdj.set(kb, []);
    motorwayAdj.get(ka)!.push({
      key: kb,
      x: mw.bx,
      y: mw.by,
      cost,
      isMotorway: true,
      motorwayId: mw.id,
    });
    motorwayAdj.get(kb)!.push({
      key: ka,
      x: mw.ax,
      y: mw.ay,
      cost,
      isMotorway: true,
      motorwayId: mw.id,
    });
  }

  const heuristic = (x: number, y: number): number => {
    let best = Infinity;
    for (const g of goalCells) {
      const d = Math.hypot(g.x - x, g.y - y) * 0.45;
      if (d < best) best = d;
    }
    return best;
  };

  const open: string[] = [startKey];
  const inOpen = new Set<string>([startKey]);
  const closed = new Set<string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(start.x, start.y)]]);
  const cameFrom = new Map<string, { prevKey: string; isMotorway: boolean; motorwayId?: string }>();

  while (open.length > 0) {
    // Find lowest fScore in open
    let bestIdx = 0;
    let bestF = fScore.get(open[0]) ?? Infinity;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const currentKey = open[bestIdx];
    open.splice(bestIdx, 1);
    inOpen.delete(currentKey);

    if (goalSet.has(currentKey)) {
      const path: PathStep[] = [];
      let cur: string | undefined = currentKey;
      while (cur) {
        const pt = parseCellKey(cur);
        const parent = cameFrom.get(cur);
        path.push({
          x: pt.x,
          y: pt.y,
          isMotorway: parent?.isMotorway,
          motorwayId: parent?.motorwayId,
        });
        cur = parent?.prevKey;
      }
      path.reverse();
      return path;
    }

    closed.add(currentKey);
    const curPt = parseCellKey(currentKey);
    const curG = gScore.get(currentKey) ?? Infinity;

    const neighbors: NeighborEdge[] = [];
    const roadNeighbors = network.adjacency.get(currentKey);
    if (roadNeighbors) {
      for (const nk of roadNeighbors) {
        const npt = parseCellKey(nk);
        const stepDist = Math.hypot(npt.x - curPt.x, npt.y - curPt.y);
        // Slight preference for roundabouts and penalty for unlit heavy intersections
        const isRoundabout = network.roundabouts.has(nk);
        const deg = network.adjacency.get(nk)?.size ?? 0;
        const congestionBias = isRoundabout ? -0.08 : deg >= 4 ? 0.15 : 0;
        neighbors.push({
          key: nk,
          x: npt.x,
          y: npt.y,
          cost: stepDist + congestionBias,
          isMotorway: false,
        });
      }
    }

    const mwNeighbors = motorwayAdj.get(currentKey);
    if (mwNeighbors) {
      for (const mwn of mwNeighbors) neighbors.push(mwn);
    }

    for (const next of neighbors) {
      if (closed.has(next.key)) continue;

      // Cannot traverse THROUGH another house or market unless it's the goal
      if (!goalSet.has(next.key)) {
        if (lookup.houseByCell.has(next.key) || lookup.marketByCell.has(next.key)) {
          continue;
        }
      }

      const tentativeG = curG + next.cost;
      if (tentativeG < (gScore.get(next.key) ?? Infinity)) {
        cameFrom.set(next.key, {
          prevKey: currentKey,
          isMotorway: next.isMotorway,
          motorwayId: next.motorwayId,
        });
        gScore.set(next.key, tentativeG);
        fScore.set(next.key, tentativeG + heuristic(next.x, next.y));
        if (!inOpen.has(next.key)) {
          open.push(next.key);
          inOpen.add(next.key);
        }
      }
    }
  }

  return null;
}
