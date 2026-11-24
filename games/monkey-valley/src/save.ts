import type { PlayerSave, SaveData } from './types';
import type { Player } from './state';

const KEY = 'monkey-valley:save:v1';
const GUEST = 'monkey-valley:guest:v1';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (d && d.v === 1 && d.world && d.player) return d;
  } catch {
    // ignora
  }
  return null;
}

export function writeSave(d: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}

export function playerToSave(p: Player): PlayerSave {
  return {
    name: p.name,
    fi: p.fi,
    si: p.si,
    inv: p.inv.map((s) => (s ? { ...s } : null)),
    tiers: { ...p.tiers },
    energy: p.energy,
    maxEnergy: p.maxEnergy,
    water: p.water,
    sel: p.sel,
    x: p.x,
    y: p.y,
    mineMax: p.mineMax,
  };
}

export function applyPlayerSave(p: Player, s: PlayerSave): void {
  p.name = s.name;
  p.fi = s.fi;
  p.si = s.si;
  p.inv = s.inv.map((q) => (q ? { ...q } : null));
  while (p.inv.length < 24) p.inv.push(null);
  p.tiers = Object.assign({ hoe: 0, can: 0, axe: 0, pick: 0, rod: 0, sickle: 0 }, s.tiers);
  p.energy = s.energy;
  p.maxEnergy = s.maxEnergy;
  p.water = s.water;
  p.sel = s.sel;
  p.mineMax = s.mineMax ?? 0;
}

export function loadGuest(): PlayerSave | null {
  try {
    const raw = localStorage.getItem(GUEST);
    if (raw) return JSON.parse(raw) as PlayerSave;
  } catch {
    // ignora
  }
  return null;
}

export function writeGuest(s: PlayerSave): void {
  try {
    localStorage.setItem(GUEST, JSON.stringify(s));
  } catch {
    // ignora
  }
}
