import { reportGameScore } from '@monkey-slop/sdk';

const PROGRESS_KEY = 'monkey-angrybirds:progress:v1';

export interface LevelProgress {
  stars: number;
  bestScore: number;
}

export interface SaveData {
  levels: Record<number, LevelProgress>;
  bestInfiniteWave: number;
  bestInfiniteScore: number;
}

export function loadProgress(): SaveData {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveData;
      return {
        levels: parsed.levels ?? {},
        bestInfiniteWave: parsed.bestInfiniteWave ?? 0,
        bestInfiniteScore: parsed.bestInfiniteScore ?? 0,
      };
    }
  } catch {
    // ignore storage errors
  }
  return { levels: {}, bestInfiniteWave: 0, bestInfiniteScore: 0 };
}

export function saveLevelResult(
  levelId: number,
  score: number,
  stars: number,
  isInfinite: boolean,
  infiniteWave: number,
): SaveData {
  const data = loadProgress();
  if (isInfinite) {
    data.bestInfiniteWave = Math.max(data.bestInfiniteWave, infiniteWave);
    data.bestInfiniteScore = Math.max(data.bestInfiniteScore, Math.floor(score));
  } else {
    const prev = data.levels[levelId] ?? { stars: 0, bestScore: 0 };
    data.levels[levelId] = {
      stars: Math.max(prev.stars, stars),
      bestScore: Math.max(prev.bestScore, Math.floor(score)),
    };
  }

  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }

  const totalCampaignScore = Object.values(data.levels).reduce((sum, l) => sum + l.bestScore, 0);
  const totalScore = Math.max(totalCampaignScore + data.bestInfiniteScore, Math.floor(score));
  const totalStars = Object.values(data.levels).reduce((sum, l) => sum + l.stars, 0);

  reportGameScore('monkey-angrybirds', totalScore, {
    stars: totalStars,
    infiniteWave: data.bestInfiniteWave,
  });

  return data;
}

export function getTotalStars(data: SaveData): number {
  return Object.values(data.levels).reduce((sum, l) => sum + l.stars, 0);
}
