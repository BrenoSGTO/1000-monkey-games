import { CANVAS_HEIGHT, CANVAS_WIDTH, TOWER_RADIUS, TRACK_HALF_WIDTH } from './data';
import type { MapConfig, MapProp, Point, TowerInstance } from './types';

export interface PathSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  length: number;
  cumStart: number;
  cumEnd: number;
  dx: number;
  dy: number;
}

export interface CompiledPath {
  segments: PathSegment[];
  totalLength: number;
}

const pathCache = new Map<string, CompiledPath>();

export function getMapLanes(map: MapConfig): Point[][] {
  return map.lanes && map.lanes.length > 0 ? map.lanes : [map.waypoints];
}

export function getLaneCount(map: MapConfig): number {
  return getMapLanes(map).length;
}

export function compileMapPath(map: MapConfig, laneIndex = 0): CompiledPath {
  const lanes = getMapLanes(map);
  const safeIdx = ((laneIndex % lanes.length) + lanes.length) % lanes.length;
  const key = `${map.id}:${safeIdx}`;
  const cached = pathCache.get(key);
  if (cached) return cached;

  const pts = lanes[safeIdx];
  const segments: PathSegment[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    segments.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      length: len,
      cumStart: total,
      cumEnd: total + len,
      dx: len > 0 ? vx / len : 0,
      dy: len > 0 ? vy / len : 0,
    });
    total += len;
  }

  const compiled = { segments, totalLength: total };
  pathCache.set(key, compiled);
  return compiled;
}

export function getLaneLength(map: MapConfig, laneIndex = 0): number {
  return compileMapPath(map, laneIndex).totalLength;
}

export function samplePathPosition(
  map: MapConfig,
  distance: number,
  laneIndex = 0,
): Point & { angle: number } {
  const path = compileMapPath(map, laneIndex);
  if (path.segments.length === 0) {
    return { x: 0, y: 0, angle: 0 };
  }
  if (distance <= 0) {
    const s = path.segments[0];
    return { x: s.ax, y: s.ay, angle: Math.atan2(s.dy, s.dx) };
  }
  if (distance >= path.totalLength) {
    const s = path.segments[path.segments.length - 1];
    return { x: s.bx, y: s.by, angle: Math.atan2(s.dy, s.dx) };
  }
  for (const s of path.segments) {
    if (distance <= s.cumEnd) {
      const local = distance - s.cumStart;
      return {
        x: s.ax + s.dx * local,
        y: s.ay + s.dy * local,
        angle: Math.atan2(s.dy, s.dx),
      };
    }
  }
  const last = path.segments[path.segments.length - 1];
  return { x: last.bx, y: last.by, angle: Math.atan2(last.dy, last.dx) };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  const projX = ax + t * vx;
  const projY = ay + t * vy;
  return Math.hypot(px - projX, py - projY);
}

function getPropObstacleRadius(prop: MapProp): number {
  const s = prop.scale ?? 1;
  switch (prop.kind) {
    case 'tree':
    case 'palm':
      return 18 * s;
    case 'stall':
      return 26 * s;
    case 'crate':
      return 16 * s;
    case 'cone':
      return 10 * s;
    case 'sign':
      return 14 * s;
    case 'puddle':
    case 'bridge':
      return 0;
  }
}

export function isValidTowerSpot(
  map: MapConfig,
  towers: TowerInstance[],
  x: number,
  y: number,
): { ok: boolean; reason?: string } {
  const margin = TOWER_RADIUS + 8;
  if (x < margin || x > CANVAS_WIDTH - margin || y < margin || y > CANVAS_HEIGHT - margin) {
    return { ok: false, reason: 'Fora do mapa!' };
  }

  const laneCount = getLaneCount(map);
  const minTrackDist = TRACK_HALF_WIDTH + TOWER_RADIUS + 4;
  for (let l = 0; l < laneCount; l++) {
    const path = compileMapPath(map, l);
    for (const seg of path.segments) {
      if (distToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by) < minTrackDist) {
        return { ok: false, reason: 'Não pode bloquear a pista!' };
      }
    }
  }

  for (const prop of map.props) {
    const obsRadius = getPropObstacleRadius(prop);
    if (obsRadius <= 0) continue;
    if (Math.hypot(x - prop.x, y - prop.y) < obsRadius + TOWER_RADIUS - 2) {
      return { ok: false, reason: 'Em cima de obstáculo!' };
    }
  }

  const minTowerDist = TOWER_RADIUS * 2 + 4;
  for (const t of towers) {
    if (Math.hypot(x - t.x, y - t.y) < minTowerDist) {
      return { ok: false, reason: 'Muito perto de outro macaco!' };
    }
  }

  return { ok: true };
}
