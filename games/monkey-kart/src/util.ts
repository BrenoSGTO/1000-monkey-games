export const TAU = Math.PI * 2;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Wrap angle to [-PI, PI). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function angDiff(target: number, current: number): number {
  return wrapAngle(target - current);
}
export function lerpAngle(a: number, b: number, t: number): number {
  return a + angDiff(b, a) * t;
}
export function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(target, v + maxDelta);
  return Math.max(target, v - maxDelta);
}

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

export function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/[\d.]+/g) ?? ['0', '0', '0'];
    return [+m[0], +m[1], +m[2]];
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbCss(r: number, g: number, b: number, a = 1): string {
  return a >= 1
    ? `rgb(${r | 0},${g | 0},${b | 0})`
    : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
/** Multiply a hex color brightness (1 = same). */
export function shade(hex: string, k: number, alpha = 1): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbCss(clamp(r * k, 0, 255), clamp(g * k, 0, 255), clamp(b * k, 0, 255), alpha);
}
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbCss(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t));
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--:--.---';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
export function ordinal(n: number): string {
  return `${n}º`;
}
export function pick<T>(arr: readonly T[], rnd: () => number = Math.random): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}
