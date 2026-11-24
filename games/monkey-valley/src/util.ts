export const TILE = 16;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, s = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export function fmtTime(min: number): string {
  const m = Math.floor(min);
  const h = Math.floor(m / 60) % 24;
  const mm = Math.floor((m % 60) / 10) * 10;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

export function fmtMoney(n: number): string {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export const keyOf = (x: number, y: number, w = 64): number => y * w + x;
