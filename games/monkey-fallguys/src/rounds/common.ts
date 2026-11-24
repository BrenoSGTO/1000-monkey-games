import { updatePlats } from '../physics';
import type { World } from '../types';

/** compact dynamic state for tiles/doors: 0 gone/open, 1 intact, 2 stepped/opening, 3 bonked */
export function serPlats(w: World): number[] {
  const out: number[] = [];
  for (const p of w.plats) {
    if (p.kind !== 'tile' && p.kind !== 'door') continue;
    out.push(!p.active ? 0 : p.t1 >= 0 ? 2 : p.wob > 0 ? 3 : 1);
  }
  return out;
}

export function applyPlats(w: World, arr: number[] | undefined): void {
  if (!arr) return;
  let i = 0;
  for (const p of w.plats) {
    if (p.kind !== 'tile' && p.kind !== 'door') continue;
    const v = arr[i++];
    if (v === undefined) break;
    p.active = v !== 0;
    p.t1 = v === 2 ? 0.3 : -1;
    p.wob = v === 3 ? 0.3 : v === 2 ? 0.2 : 0;
  }
}

export function syncMovers(w: World): void {
  updatePlats(w, 0);
}
