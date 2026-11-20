import type {
  Rect,
  RoomDef,
  RoomId,
  SecurityCamera,
  TaskSpot,
  VentNode,
  Waypoint,
} from './types';

export const WORLD_W = 2400;
export const WORLD_H = 1440;
export const TILE_SIZE = 40;
const COLS = WORLD_W / TILE_SIZE; // 60
const ROWS = WORLD_H / TILE_SIZE; // 36

export const ROOMS: RoomDef[] = [
  {
    id: 'reator',
    name: 'Reator de Potássio',
    rect: { x: 120, y: 240, w: 320, h: 400 },
    floorColor: '#1e2638',
    accentColor: '#38bdf8',
  },
  {
    id: 'enfermaria',
    name: 'Enfermaria',
    rect: { x: 560, y: 160, w: 340, h: 300 },
    floorColor: '#1b2e35',
    accentColor: '#4ade80',
  },
  {
    id: 'refeitorio',
    name: 'Refeitório',
    rect: { x: 1020, y: 120, w: 520, h: 400 },
    floorColor: '#252b3b',
    accentColor: '#facc15',
  },
  {
    id: 'navegacao',
    name: 'Navegação',
    rect: { x: 1840, y: 380, w: 420, h: 480 },
    floorColor: '#1a253b',
    accentColor: '#60a5fa',
  },
  {
    id: 'motores',
    name: 'Motores',
    rect: { x: 120, y: 860, w: 320, h: 400 },
    floorColor: '#2b222c',
    accentColor: '#f97316',
  },
  {
    id: 'seguranca',
    name: 'Segurança',
    rect: { x: 560, y: 580, w: 300, h: 240 },
    floorColor: '#1f2937',
    accentColor: '#ef4444',
  },
  {
    id: 'eletrica',
    name: 'Elétrica',
    rect: { x: 560, y: 940, w: 340, h: 340 },
    floorColor: '#29261d',
    accentColor: '#fde047',
  },
  {
    id: 'armazem',
    name: 'Armazém de Bananas',
    rect: { x: 1040, y: 860, w: 480, h: 420 },
    floorColor: '#2b291f',
    accentColor: '#eab308',
  },
];

export const CORRIDORS: Rect[] = [
  // Reator <-> Enfermaria
  { x: 440, y: 280, w: 120, h: 120 },
  // Enfermaria <-> Refeitório
  { x: 900, y: 240, w: 120, h: 120 },
  // Spine Reator <-> Motores
  { x: 220, y: 640, w: 120, h: 220 },
  // Spine <-> Segurança
  { x: 340, y: 640, w: 220, h: 120 },
  // Enfermaria <-> Segurança
  { x: 650, y: 460, w: 120, h: 120 },
  // Segurança <-> Elétrica
  { x: 650, y: 820, w: 120, h: 120 },
  // Motores <-> Elétrica
  { x: 440, y: 1020, w: 120, h: 120 },
  // Elétrica <-> Armazém
  { x: 900, y: 1040, w: 140, h: 120 },
  // Refeitório <-> Armazém (Central spine)
  { x: 1220, y: 520, w: 120, h: 340 },
  // Segurança <-> Central spine
  { x: 860, y: 640, w: 360, h: 120 },
  // Refeitório <-> Navegação (Upper right)
  { x: 1540, y: 240, w: 460, h: 120 },
  { x: 1880, y: 360, w: 120, h: 20 },
  // Armazém <-> Navegação (Lower right)
  { x: 1520, y: 1020, w: 480, h: 120 },
  { x: 1880, y: 860, w: 120, h: 160 },
];

// Build tile map & merged wall rects
const floorGrid: boolean[][] = Array.from({ length: ROWS }, () =>
  Array.from({ length: COLS }, () => false),
);

function paintFloor(r: Rect): void {
  const c0 = Math.max(1, Math.floor(r.x / TILE_SIZE));
  const r0 = Math.max(1, Math.floor(r.y / TILE_SIZE));
  const c1 = Math.min(COLS - 2, Math.ceil((r.x + r.w) / TILE_SIZE) - 1);
  const r1 = Math.min(ROWS - 2, Math.ceil((r.y + r.h) / TILE_SIZE) - 1);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      floorGrid[row][col] = true;
    }
  }
}

for (const room of ROOMS) paintFloor(room.rect);
for (const cor of CORRIDORS) paintFloor(cor);

const wallGrid: boolean[][] = Array.from({ length: ROWS }, () =>
  Array.from({ length: COLS }, () => false),
);

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (floorGrid[r][c]) continue;
    let touchesFloor = false;
    for (let dr = -1; dr <= 1 && !touchesFloor; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && floorGrid[nr][nc]) {
          touchesFloor = true;
          break;
        }
      }
    }
    if (touchesFloor) wallGrid[r][c] = true;
  }
}

export const WALL_RECTS: Rect[] = [];
for (let r = 0; r < ROWS; r++) {
  let c = 0;
  while (c < COLS) {
    if (!wallGrid[r][c]) {
      c++;
      continue;
    }
    const startC = c;
    while (c < COLS && wallGrid[r][c]) c++;
    WALL_RECTS.push({
      x: startC * TILE_SIZE,
      y: r * TILE_SIZE,
      w: (c - startC) * TILE_SIZE,
      h: TILE_SIZE,
    });
  }
}

// Solid interior furniture obstacles (Cafeteria table)
export const CAFETERIA_TABLE = { x: 1280, y: 320, radius: 58 };
export const EMERGENCY_BUTTON = { x: 1280, y: 320, radius: 74 };

export const SECURITY_MONITOR = { x: 640, y: 650, radius: 55 };

export const LIGHTS_PANEL = { x: 625, y: 1005, radius: 60 };
export const REACTOR_PANEL = { x: 195, y: 315, radius: 65 };

export const SECURITY_CAMERAS: SecurityCamera[] = [
  { id: 'cam1', label: 'CAM 01 · Cruzamento Central', x: 1280, y: 700 },
  { id: 'cam2', label: 'CAM 02 · Ala Médica / Reator', x: 500, y: 340 },
  { id: 'cam3', label: 'CAM 03 · Elétrica / Motores', x: 500, y: 1080 },
  { id: 'cam4', label: 'CAM 04 · Corredor Navegação', x: 1850, y: 300 },
];

export const VENTS: VentNode[] = [
  { id: 'v_eletrica', room: 'eletrica', x: 830, y: 1210, links: ['v_seguranca', 'v_enfermaria'] },
  { id: 'v_seguranca', room: 'seguranca', x: 610, y: 760, links: ['v_eletrica', 'v_enfermaria'] },
  { id: 'v_enfermaria', room: 'enfermaria', x: 620, y: 215, links: ['v_eletrica', 'v_seguranca'] },

  { id: 'v_reator', room: 'reator', x: 175, y: 585, links: ['v_motores'] },
  { id: 'v_motores', room: 'motores', x: 175, y: 915, links: ['v_reator'] },

  { id: 'v_refeitorio', room: 'refeitorio', x: 1475, y: 180, links: ['v_navegacao', 'v_armazem'] },
  { id: 'v_navegacao', room: 'navegacao', x: 2185, y: 620, links: ['v_refeitorio', 'v_armazem'] },
  { id: 'v_armazem', room: 'armazem', x: 1455, y: 1215, links: ['v_refeitorio', 'v_navegacao'] },
];

export const TASK_SPOTS: TaskSpot[] = [
  {
    id: 'task_wires_eletrica',
    kind: 'wires',
    title: 'Fios de Cipó',
    room: 'eletrica',
    roomLabel: 'Elétrica',
    x: 780,
    y: 1005,
  },
  {
    id: 'task_peel_armazem',
    kind: 'peel',
    title: 'Descascar Bananas',
    room: 'armazem',
    roomLabel: 'Armazém de Bananas',
    x: 1280,
    y: 1080,
  },
  {
    id: 'task_scan_enfermaria',
    kind: 'scan',
    title: 'Scanner de Calvície',
    room: 'enfermaria',
    roomLabel: 'Enfermaria',
    x: 745,
    y: 325,
  },
  {
    id: 'task_reactor_nums',
    kind: 'reactor_nums',
    title: 'Calibrar Reator',
    room: 'reator',
    roomLabel: 'Reator de Potássio',
    x: 205,
    y: 470,
  },
  {
    id: 'task_asteroids_nav',
    kind: 'asteroids',
    title: 'Desviar de Cocos Espaciais',
    room: 'navegacao',
    roomLabel: 'Navegação',
    x: 2120,
    y: 620,
  },
  {
    id: 'task_wires_motores',
    kind: 'wires',
    title: 'Fios do Motor',
    room: 'motores',
    roomLabel: 'Motores',
    x: 235,
    y: 1085,
  },
  {
    id: 'task_peel_refeitorio',
    kind: 'peel',
    title: 'Descascador do Lanche',
    room: 'refeitorio',
    roomLabel: 'Refeitório',
    x: 1105,
    y: 205,
  },
  {
    id: 'task_asteroids_seg',
    kind: 'asteroids',
    title: 'Radar de Cocos',
    room: 'seguranca',
    roomLabel: 'Segurança',
    x: 790,
    y: 645,
  },
];

export const WAYPOINTS: Waypoint[] = [
  { id: 'wp_ref_top', room: 'refeitorio', x: 1280, y: 200, neighbors: ['wp_ref_left', 'wp_ref_right', 'wp_ref_bot'] },
  { id: 'wp_ref_left', room: 'refeitorio', x: 1110, y: 300, neighbors: ['wp_ref_top', 'wp_ref_bot', 'wp_cor_enf_ref'] },
  { id: 'wp_ref_right', room: 'refeitorio', x: 1450, y: 300, neighbors: ['wp_ref_top', 'wp_ref_bot', 'wp_cor_ref_nav1'] },
  { id: 'wp_ref_bot', room: 'refeitorio', x: 1280, y: 450, neighbors: ['wp_ref_left', 'wp_ref_right', 'wp_ref_top', 'wp_cor_center'] },

  { id: 'wp_cor_enf_ref', room: 'corredor', x: 960, y: 300, neighbors: ['wp_ref_left', 'wp_enf'] },
  { id: 'wp_enf', room: 'enfermaria', x: 730, y: 325, neighbors: ['wp_cor_enf_ref', 'wp_cor_rea_enf', 'wp_cor_enf_seg'] },

  { id: 'wp_cor_rea_enf', room: 'corredor', x: 500, y: 340, neighbors: ['wp_enf', 'wp_reator'] },
  { id: 'wp_reator', room: 'reator', x: 280, y: 440, neighbors: ['wp_cor_rea_enf', 'wp_cor_rea_mot'] },

  { id: 'wp_cor_rea_mot', room: 'corredor', x: 280, y: 700, neighbors: ['wp_reator', 'wp_motores', 'wp_seg'] },
  { id: 'wp_motores', room: 'motores', x: 280, y: 1080, neighbors: ['wp_cor_rea_mot', 'wp_cor_mot_ele'] },
  { id: 'wp_cor_mot_ele', room: 'corredor', x: 500, y: 1080, neighbors: ['wp_motores', 'wp_eletrica'] },

  { id: 'wp_cor_enf_seg', room: 'corredor', x: 710, y: 520, neighbors: ['wp_enf', 'wp_seg'] },
  { id: 'wp_seg', room: 'seguranca', x: 710, y: 700, neighbors: ['wp_cor_enf_seg', 'wp_cor_rea_mot', 'wp_cor_seg_ele', 'wp_cor_center'] },
  { id: 'wp_cor_seg_ele', room: 'corredor', x: 710, y: 880, neighbors: ['wp_seg', 'wp_eletrica'] },

  { id: 'wp_eletrica', room: 'eletrica', x: 730, y: 1090, neighbors: ['wp_cor_mot_ele', 'wp_cor_seg_ele', 'wp_cor_ele_arm'] },
  { id: 'wp_cor_ele_arm', room: 'corredor', x: 970, y: 1100, neighbors: ['wp_eletrica', 'wp_armazem'] },

  { id: 'wp_cor_center', room: 'corredor', x: 1280, y: 700, neighbors: ['wp_ref_bot', 'wp_seg', 'wp_armazem'] },
  { id: 'wp_armazem', room: 'armazem', x: 1280, y: 1080, neighbors: ['wp_cor_center', 'wp_cor_ele_arm', 'wp_cor_arm_nav1'] },

  { id: 'wp_cor_ref_nav1', room: 'corredor', x: 1940, y: 300, neighbors: ['wp_ref_right', 'wp_nav_top'] },
  { id: 'wp_nav_top', room: 'navegacao', x: 1940, y: 440, neighbors: ['wp_cor_ref_nav1', 'wp_navegacao'] },
  { id: 'wp_cor_arm_nav1', room: 'corredor', x: 1940, y: 1080, neighbors: ['wp_armazem', 'wp_nav_bot'] },
  { id: 'wp_nav_bot', room: 'navegacao', x: 1940, y: 800, neighbors: ['wp_cor_arm_nav1', 'wp_navegacao'] },
  { id: 'wp_navegacao', room: 'navegacao', x: 2050, y: 620, neighbors: ['wp_nav_top', 'wp_nav_bot'] },
];

const waypointById = new Map(WAYPOINTS.map((w) => [w.id, w]));

export function getRoomAt(x: number, y: number): { id: RoomId; name: string } {
  for (const r of ROOMS) {
    if (x >= r.rect.x && x <= r.rect.x + r.rect.w && y >= r.rect.y && y <= r.rect.y + r.rect.h) {
      return { id: r.id, name: r.name };
    }
  }
  return { id: 'corredor', name: 'Corredor' };
}

export function resolveCircleCollisions(
  x: number,
  y: number,
  radius: number,
  isGhost: boolean,
): { x: number; y: number } {
  let nx = Math.max(radius + 16, Math.min(WORLD_W - radius - 16, x));
  let ny = Math.max(radius + 16, Math.min(WORLD_H - radius - 16, y));

  if (isGhost) {
    return { x: nx, y: ny };
  }

  // Resolve against Cafeteria round table
  const dxT = nx - CAFETERIA_TABLE.x;
  const dyT = ny - CAFETERIA_TABLE.y;
  const minDistT = CAFETERIA_TABLE.radius + radius;
  const distSqT = dxT * dxT + dyT * dyT;
  if (distSqT < minDistT * minDistT && distSqT > 0.0001) {
    const dist = Math.sqrt(distSqT);
    const push = minDistT - dist;
    nx += (dxT / dist) * push;
    ny += (dyT / dist) * push;
  }

  // Two passes over wall rects for clean corner sliding
  for (let pass = 0; pass < 2; pass++) {
    for (const w of WALL_RECTS) {
      const closestX = Math.max(w.x, Math.min(nx, w.x + w.w));
      const closestY = Math.max(w.y, Math.min(ny, w.y + w.h));
      const dx = nx - closestX;
      const dy = ny - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          nx += (dx / dist) * overlap;
          ny += (dy / dist) * overlap;
        } else {
          // Center inside rect, push out along shallowest axis
          const left = nx - w.x;
          const right = w.x + w.w - nx;
          const top = ny - w.y;
          const bottom = w.y + w.h - ny;
          const m = Math.min(left, right, top, bottom);
          if (m === left) nx = w.x - radius;
          else if (m === right) nx = w.x + w.w + radius;
          else if (m === top) ny = w.y - radius;
          else ny = w.y + w.h + radius;
        }
      }
    }
  }

  return { x: nx, y: ny };
}

function rayIntersectRect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDist: number,
  r: Rect,
): number {
  let tmin = 0;
  let tmax = maxDist;

  if (Math.abs(dx) < 1e-8) {
    if (ox < r.x || ox > r.x + r.w) return maxDist;
  } else {
    const invD = 1 / dx;
    let t1 = (r.x - ox) * invD;
    let t2 = (r.x + r.w - ox) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxDist;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < r.y || oy > r.y + r.h) return maxDist;
  } else {
    const invD = 1 / dy;
    let t1 = (r.y - oy) * invD;
    let t2 = (r.y + r.h - oy) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return maxDist;
  }

  return tmin >= 0 && tmin < maxDist ? tmin : maxDist;
}

export function castVisibilityPolygon(
  ox: number,
  oy: number,
  radius: number,
  rayCount = 120,
): { x: number; y: number }[] {
  // Filter walls near the observer
  const nearby: Rect[] = [];
  const minX = ox - radius - 40;
  const maxX = ox + radius + 40;
  const minY = oy - radius - 40;
  const maxY = oy + radius + 40;
  for (const w of WALL_RECTS) {
    if (w.x + w.w >= minX && w.x <= maxX && w.y + w.h >= minY && w.y <= maxY) {
      nearby.push(w);
    }
  }

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = radius;
    for (const w of nearby) {
      const hit = rayIntersectRect(ox, oy, dx, dy, best, w);
      if (hit < best) best = hit;
    }
    pts.push({
      x: ox + dx * best,
      y: oy + dy * best,
    });
  }
  return pts;
}

export function hasLineOfSight(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxDist: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist > maxDist) return false;
  if (dist < 1) return true;
  const ux = dx / dist;
  const uy = dy / dist;
  for (const w of WALL_RECTS) {
    if (rayIntersectRect(x1, y1, ux, uy, dist, w) < dist - 2) {
      return false;
    }
  }
  return true;
}

export function nearestWaypoint(x: number, y: number): Waypoint {
  let best = WAYPOINTS[0];
  let bestD = Infinity;
  for (const wp of WAYPOINTS) {
    const d = (wp.x - x) * (wp.x - x) + (wp.y - y) * (wp.y - y);
    if (d < bestD) {
      bestD = d;
      best = wp;
    }
  }
  return best;
}

export function findWaypointPath(fromX: number, fromY: number, toX: number, toY: number): string[] {
  const start = nearestWaypoint(fromX, fromY);
  const goal = nearestWaypoint(toX, toY);
  if (start.id === goal.id) return [goal.id];

  const queue: string[] = [start.id];
  const prev = new Map<string, string | null>();
  prev.set(start.id, null);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === goal.id) break;
    const node = waypointById.get(cur);
    if (!node) continue;
    for (const nb of node.neighbors) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }

  if (!prev.has(goal.id)) return [goal.id];
  const path: string[] = [];
  let cur: string | null = goal.id;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

export function getWaypointById(id: string): Waypoint | undefined {
  return waypointById.get(id);
}

export function getRefeitorioSpawn(index: number, total: number): { x: number; y: number } {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const r = 115;
  return {
    x: CAFETERIA_TABLE.x + Math.cos(angle) * r,
    y: CAFETERIA_TABLE.y + Math.sin(angle) * r,
  };
}
