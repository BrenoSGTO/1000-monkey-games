import { getGameScore, reportGameScore } from '@monkey-slop/sdk';
import type { GameState, SavedEmpire } from './types';

const SAVE_KEY = 'monkey-clicker:save:v1';
const SLUG = 'monkey-clicker';

export function loadSavedEmpire(): SavedEmpire | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedEmpire>;
    if (!parsed || parsed.version !== 1) return null;
    return {
      version: 1,
      bananas: Number(parsed.bananas) || 0,
      runBananas: Number(parsed.runBananas) || 0,
      lifetimeBananas: Number(parsed.lifetimeBananas) || 0,
      totalClicks: Number(parsed.totalClicks) || 0,
      goldenClicked: Number(parsed.goldenClicked) || 0,
      chaosDefeated: Number(parsed.chaosDefeated) || 0,
      prestigeChips: Number(parsed.prestigeChips) || 0,
      reincarnations: Number(parsed.reincarnations) || 0,
      buildings: parsed.buildings && typeof parsed.buildings === 'object' ? parsed.buildings : {},
      upgrades: Array.isArray(parsed.upgrades) ? parsed.upgrades : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
      savedAt: Number(parsed.savedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveEmpire(state: GameState): void {
  if (state.mode !== 'solo') return;
  const payload: SavedEmpire = {
    version: 1,
    bananas: state.bananas,
    runBananas: state.runBananas,
    lifetimeBananas: state.lifetimeBananas,
    totalClicks: state.totalClicks,
    goldenClicked: state.goldenClicked,
    chaosDefeated: state.chaosDefeated,
    prestigeChips: state.prestigeChips,
    reincarnations: state.reincarnations,
    buildings: { ...state.buildings },
    upgrades: [...state.upgrades],
    achievements: [...state.achievements],
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode errors
  }
}

export function clearSavedEmpire(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getBestBananaScore(): number {
  return getGameScore(SLUG).bestScore;
}

export function reportEmpireScore(score: number, extra?: Record<string, number | string>): void {
  reportGameScore(SLUG, Math.floor(score), extra);
}
