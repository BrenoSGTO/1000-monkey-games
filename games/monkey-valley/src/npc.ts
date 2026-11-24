import type { Dir } from './types';
import type { World } from './world';
import { MH, MW } from './layout';
import { NPCS, type NpcDef } from './data';

export interface NpcPose {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  inside: boolean;
}

const MPT = 0.9; // minutos de jogo por tile
const paths = new Map<string, [number, number][][]>();

function bfs(world: World, sx: number, sy: number, tx: number, ty: number): [number, number][] {
  const start = sy * MW + sx;
  const goal = ty * MW + tx;
  if (start === goal) return [[sx, sy]];
  const prev = new Int32Array(MW * MH).fill(-2);
  prev[start] = -1;
  const q: number[] = [start];
  let head = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (head < q.length) {
    const cur = q[head++];
    if (cur === goal) break;
    const cx = cur % MW;
    const cy = Math.floor(cur / MW);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const nk = ny * MW + nx;
      if (prev[nk] !== -2) continue;
      if (world.solid[nk] && nk !== goal) continue;
      prev[nk] = cur;
      q.push(nk);
    }
  }
  if (prev[goal] === -2) return [[sx, sy], [tx, ty]];
  const out: [number, number][] = [];
  let c = goal;
  while (c !== -1) {
    out.push([c % MW, Math.floor(c / MW)]);
    c = prev[c];
  }
  return out.reverse();
}

export function initNpcPaths(world: World): void {
  for (const n of NPCS) {
    const list: [number, number][][] = [[]];
    for (let i = 1; i < n.sched.length; i++) {
      const a = n.sched[i - 1];
      const b = n.sched[i];
      list.push(bfs(world, a.x, a.y, b.x, b.y));
    }
    paths.set(n.id, list);
  }
}

export function npcPose(def: NpcDef, minutes: number): NpcPose {
  const s = def.sched;
  let i = 0;
  for (let k = 0; k < s.length; k++) if (s[k].t <= minutes) i = k;
  const tile = (x: number, y: number) => ({ x: x * 16 + 8, y: y * 16 + 14 });
  if (i === 0) {
    const p = tile(s[0].x, s[0].y);
    return { ...p, dir: 0, moving: false, inside: !!s[0].inside };
  }
  const path = paths.get(def.id)?.[i] ?? [[s[i].x, s[i].y]];
  const prog = (minutes - s[i].t) / MPT;
  const idx = Math.floor(prog);
  if (idx >= path.length - 1) {
    const p = tile(s[i].x, s[i].y);
    return { ...p, dir: 0, moving: false, inside: !!s[i].inside };
  }
  const a = path[idx];
  const b = path[idx + 1];
  const f = prog - idx;
  const x = (a[0] + (b[0] - a[0]) * f) * 16 + 8;
  const y = (a[1] + (b[1] - a[1]) * f) * 16 + 14;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dir: Dir = dx < 0 ? 1 : dx > 0 ? 2 : dy < 0 ? 3 : 0;
  return { x, y, dir, moving: true, inside: false };
}

export function npcInside(def: NpcDef, minutes: number): boolean {
  return npcPose(def, minutes).inside;
}
