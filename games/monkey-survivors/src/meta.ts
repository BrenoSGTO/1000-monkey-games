import { CHARACTERS, CHARACTER_ORDER, META_UPGRADES } from './catalog';
import type { CharacterId, MetaProgress, MetaUpgradeId } from './types';

const META_KEY = 'monkey-survivors:meta:v1';

const DEFAULT_META: MetaProgress = {
  coins: 0,
  unlockedChars: ['chimp_clt'],
  upgrades: {
    potassio: 0,
    cafeina: 0,
    dedos_ageis: 0,
    ima_natural: 0,
    mao_pesada: 0,
    bolsa_banana: 0,
  },
  totalKills: 0,
  totalRuns: 0,
  bestTimeSec: 0,
  bestLevel: 1,
  bossesDefeated: 0,
  victories: 0,
};

export function loadMetaProgress(): MetaProgress {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_META);
    const parsed = JSON.parse(raw) as Partial<MetaProgress>;
    const unlocked = Array.isArray(parsed.unlockedChars)
      ? parsed.unlockedChars.filter((c): c is CharacterId => c in CHARACTERS)
      : ['chimp_clt' as CharacterId];
    if (!unlocked.includes('chimp_clt')) unlocked.unshift('chimp_clt');

    return {
      coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
      unlockedChars: unlocked,
      upgrades: {
        potassio: clampRank('potassio', parsed.upgrades?.potassio),
        cafeina: clampRank('cafeina', parsed.upgrades?.cafeina),
        dedos_ageis: clampRank('dedos_ageis', parsed.upgrades?.dedos_ageis),
        ima_natural: clampRank('ima_natural', parsed.upgrades?.ima_natural),
        mao_pesada: clampRank('mao_pesada', parsed.upgrades?.mao_pesada),
        bolsa_banana: clampRank('bolsa_banana', parsed.upgrades?.bolsa_banana),
      },
      totalKills: Math.max(0, Math.floor(Number(parsed.totalKills) || 0)),
      totalRuns: Math.max(0, Math.floor(Number(parsed.totalRuns) || 0)),
      bestTimeSec: Math.max(0, Number(parsed.bestTimeSec) || 0),
      bestLevel: Math.max(1, Math.floor(Number(parsed.bestLevel) || 1)),
      bossesDefeated: Math.max(0, Math.floor(Number(parsed.bossesDefeated) || 0)),
      victories: Math.max(0, Math.floor(Number(parsed.victories) || 0)),
    };
  } catch {
    return structuredCloneSafe(DEFAULT_META);
  }
}

export function saveMetaProgress(meta: MetaProgress): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors (private mode / quota)
  }
}

function clampRank(id: MetaUpgradeId, val: unknown): number {
  const def = META_UPGRADES.find((u) => u.id === id);
  const max = def ? def.maxRank : 5;
  const num = Math.floor(Number(val) || 0);
  return Math.max(0, Math.min(max, num));
}

function structuredCloneSafe(m: MetaProgress): MetaProgress {
  return {
    ...m,
    unlockedChars: [...m.unlockedChars],
    upgrades: { ...m.upgrades },
  };
}

export function getMetaUpgradeCost(id: MetaUpgradeId, currentRank: number): number {
  const def = META_UPGRADES.find((u) => u.id === id);
  if (!def) return 9999;
  return def.baseCost + currentRank * def.costStep;
}

export function evaluateCharacterUnlocks(
  meta: MetaProgress,
  runTimeSec: number,
  runLevel: number,
  runBosses: number,
): CharacterId[] {
  const newlyUnlocked: CharacterId[] = [];
  const unlock = (id: CharacterId) => {
    if (!meta.unlockedChars.includes(id)) {
      meta.unlockedChars.push(id);
      newlyUnlocked.push(id);
    }
  };

  if (runTimeSec >= 180 || meta.bestTimeSec >= 180) unlock('madalena');
  if (meta.totalKills >= 350) unlock('babuino_fedido');
  if (runLevel >= 10 || meta.bestLevel >= 10) unlock('mico_hacker');
  if (runBosses >= 1 || meta.bossesDefeated >= 1) unlock('gorila_pagodeiro');

  // Keep deterministic order
  meta.unlockedChars.sort((a, b) => CHARACTER_ORDER.indexOf(a) - CHARACTER_ORDER.indexOf(b));
  return newlyUnlocked;
}
