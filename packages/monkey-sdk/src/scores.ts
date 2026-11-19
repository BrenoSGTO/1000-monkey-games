export interface GameScoreRecord {
  bestScore: number;
  plays: number;
  lastPlayedAt: string;
  extra?: Record<string, number | string>;
}

const PREFIX = 'monkey-slop:score:';

export function getGameScore(slug: string): GameScoreRecord {
  try {
    const raw = localStorage.getItem(`${PREFIX}${slug}`);
    if (raw) {
      return JSON.parse(raw) as GameScoreRecord;
    }
  } catch {
    // ignore storage errors
  }
  return { bestScore: 0, plays: 0, lastPlayedAt: '' };
}

export function reportGameScore(
  slug: string,
  score: number,
  extra?: Record<string, number | string>,
): GameScoreRecord {
  const prev = getGameScore(slug);
  const next: GameScoreRecord = {
    bestScore: Math.max(prev.bestScore, Math.floor(score)),
    plays: prev.plays + 1,
    lastPlayedAt: new Date().toISOString(),
    extra: extra ? { ...prev.extra, ...extra } : prev.extra,
  };
  try {
    localStorage.setItem(`${PREFIX}${slug}`, JSON.stringify(next));
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage(
      { source: 'monkey-slop-game', type: 'score', slug, score: next.bestScore },
      '*',
    );
  }
  return next;
}
