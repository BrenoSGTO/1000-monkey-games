import { CANVAS_HEIGHT, CANVAS_WIDTH, TRACK_HALF_WIDTH, TOWER_RADIUS } from './data';
import type { MapConfig, Point, TowerInstance } from './types';

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

export function compileMapPath(map: MapConfig): CompiledPath {
  const cached = pathCache.get(map.id);
  if (cached) return cached;

  const segments: PathSegment[] = [];
  let total = 0;
  for (let i = 0; i < map.waypoints.length - 1; i++) {
    const a = map.waypoints[i];
    const b = map.waypoints[i + 1];
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
  pathCache.set(map.id, compiled);
  return compiled;
}

export function samplePathPosition(map: MapConfig, distance: number): Point & { angle: number } {
  const path = compileMapPath(map);
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

  const path = compileMapPath(map);
  const minTrackDist = TRACK_HALF_WIDTH + TOWER_RADIUS + 4;
  for (const seg of path.segments) {
    if (distToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by) < minTrackDist) {
      return { ok: false, reason: 'Não pode bloquear a pista!' };
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
