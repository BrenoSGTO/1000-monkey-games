// Áudio procedural extra (efeitos + trilha) por cima do monkeyAudio do SDK.
import { monkeyAudio } from '@monkey-slop/sdk';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (monkeyAudio.isMuted()) return null;
  if (!ctx) {
    try {
      const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new A();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  ac();
}

function tone(
  c: AudioContext,
  type: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  dur: number,
  vol: number,
): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g);
  g.connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(c: AudioContext, t0: number, dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass'): void {
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master!);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const last = new Map<string, number>();
const MIN_GAP: Record<string, number> = { thunk: 70, shoot: 45, bite: 120, chomp: 160, clang: 90, splat: 60, hug: 150, pop: 80 };

export type Sfx =
  | 'plop'
  | 'shoot'
  | 'thunk'
  | 'chomp'
  | 'rip'
  | 'clang'
  | 'splat'
  | 'freeze'
  | 'horn'
  | 'mower'
  | 'roar'
  | 'stomp'
  | 'thud'
  | 'fuse'
  | 'pop'
  | 'hug'
  | 'crush'
  | 'dig'
  | 'win'
  | 'lose'
  | 'jump'
  | 'ping'
  | 'collect'
  | 'boom'
  | 'zdie'
  | 'pdie'
  | 'click'
  | 'deny'
  | 'wave';

export function sfx(name: Sfx | string, vol = 1): void {
  const now = performance.now();
  const gap = MIN_GAP[name] ?? 0;
  if (gap && now - (last.get(name) ?? 0) < gap) return;
  last.set(name, now);
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const v = (x: number) => x * vol;
  switch (name) {
    case 'plop':
      tone(c, 'sine', 300, 110, t, 0.14, v(0.5));
      noise(c, t, 0.08, 700, v(0.35));
      break;
    case 'dig':
      noise(c, t, 0.12, 500, v(0.45));
      tone(c, 'triangle', 180, 90, t, 0.1, v(0.3));
      break;
    case 'shoot':
      tone(c, 'square', 520, 190, t, 0.07, v(0.16));
      break;
    case 'thunk':
      tone(c, 'triangle', 200, 80, t, 0.07, v(0.3));
      break;
    case 'chomp':
    case 'bite':
      noise(c, t, 0.07, 900, v(0.4));
      tone(c, 'sawtooth', 140, 70, t, 0.09, v(0.2));
      break;
    case 'rip':
      noise(c, t, 0.22, 2800, v(0.4), 'bandpass');
      tone(c, 'sawtooth', 600, 120, t, 0.18, v(0.18));
      break;
    case 'clang':
      tone(c, 'square', 900, 760, t, 0.14, v(0.2));
      tone(c, 'triangle', 1350, 1200, t, 0.18, v(0.14));
      break;
    case 'splat':
      noise(c, t, 0.1, 1400, v(0.35));
      tone(c, 'sine', 420, 140, t, 0.1, v(0.22));
      break;
    case 'freeze':
      tone(c, 'sine', 1500, 2400, t, 0.14, v(0.2));
      tone(c, 'triangle', 2000, 1300, t + 0.05, 0.16, v(0.14));
      break;
    case 'horn':
      tone(c, 'sawtooth', 196, 190, t, 0.55, v(0.28));
      tone(c, 'sawtooth', 246, 240, t, 0.55, v(0.2));
      tone(c, 'sawtooth', 196, 190, t + 0.7, 0.8, v(0.3));
      tone(c, 'sawtooth', 261, 255, t + 0.7, 0.8, v(0.2));
      break;
    case 'wave':
      tone(c, 'triangle', 330, 330, t, 0.12, v(0.25));
      tone(c, 'triangle', 392, 392, t + 0.12, 0.12, v(0.25));
      tone(c, 'triangle', 523, 523, t + 0.24, 0.25, v(0.25));
      break;
    case 'mower':
      for (let i = 0; i < 8; i++) tone(c, 'sawtooth', 90 + i * 9, 80 + i * 9, t + i * 0.07, 0.09, v(0.2));
      noise(c, t, 0.6, 1200, v(0.25), 'bandpass');
      break;
    case 'roar':
      tone(c, 'sawtooth', 130, 55, t, 0.9, v(0.4));
      tone(c, 'square', 95, 45, t, 0.9, v(0.25));
      noise(c, t, 0.8, 600, v(0.3));
      break;
    case 'stomp':
      tone(c, 'sine', 90, 30, t, 0.45, v(0.7));
      noise(c, t, 0.4, 300, v(0.6));
      break;
    case 'thud':
      tone(c, 'sine', 120, 50, t, 0.15, v(0.4));
      break;
    case 'fuse':
      noise(c, t, 0.9, 4000, v(0.18), 'highpass');
      break;
    case 'pop':
      tone(c, 'sine', 500, 900, t, 0.1, v(0.3));
      break;
    case 'hug':
      tone(c, 'triangle', 300, 520, t, 0.1, v(0.3));
      noise(c, t, 0.05, 3000, v(0.2), 'highpass');
      break;
    case 'crush':
      tone(c, 'sine', 160, 35, t, 0.5, v(0.7));
      noise(c, t, 0.35, 500, v(0.55));
      break;
    case 'boom':
      monkeyAudio.play('explosion', 0.35 * vol);
      break;
    case 'jump':
      tone(c, 'sine', 200, 520, t, 0.25, v(0.35));
      break;
    case 'ping':
      tone(c, 'sine', 1000, 1000, t, 0.2, v(0.25));
      tone(c, 'sine', 1500, 1500, t + 0.08, 0.2, v(0.2));
      break;
    case 'collect':
      monkeyAudio.play('coin', 0.22 * vol);
      break;
    case 'zdie':
      tone(c, 'sawtooth', 300, 70, t, 0.4, v(0.28));
      noise(c, t, 0.12, 800, v(0.2));
      break;
    case 'pdie':
      tone(c, 'triangle', 420, 100, t, 0.3, v(0.3));
      break;
    case 'click':
      monkeyAudio.play('click', 0.2 * vol);
      break;
    case 'deny':
      tone(c, 'square', 160, 110, t, 0.14, v(0.2));
      break;
    case 'win': {
      const n = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      n.forEach((f, i) => tone(c, 'triangle', f, f * 1.005, t + i * 0.11, 0.25, v(0.3)));
      break;
    }
    case 'lose': {
      const n = [392, 349, 311, 262];
      n.forEach((f, i) => tone(c, 'sawtooth', f, f * 0.96, t + i * 0.25, 0.4, v(0.22)));
      break;
    }
    default:
      break;
  }
}

// ---------- música procedural ----------
export const BPM = 112;
const SPB = 60 / BPM;

/** Batida contínua (para balançar plantas no ritmo mesmo sem áudio) */
export function beatNow(): number {
  return performance.now() / 1000 / SPB;
}

export type MusicMode = 'off' | 'menu' | 'battle' | 'boss';
let musicMode: MusicMode = 'off';
let nextT = 0;
let stepN = 0;
let timer: number | null = null;

const ROOTS = [130.81, 110, 87.31, 98];
const PENT_MAJ = [0, 2, 4, 7, 9];
const PENT_MIN = [0, 3, 5, 7, 10];

function note(root: number, semis: number, oct = 1): number {
  return root * oct * Math.pow(2, semis / 12);
}

function scheduleStep(c: AudioContext, t: number, s: number): void {
  const bar = Math.floor(s / 16) % 4;
  const k = s % 16;
  const boss = musicMode === 'boss';
  const root = ROOTS[bar] * (boss ? 0.5 : 1);
  const scale = boss ? PENT_MIN : PENT_MAJ;
  const vol = musicMode === 'menu' ? 0.07 : 0.09;
  if (k % 4 === 0) tone(c, 'triangle', root, root * 0.99, t, SPB * 0.45, vol * 1.3);
  if (k % 4 === 2 && musicMode !== 'menu') tone(c, 'triangle', root * 1.5, root * 1.49, t, SPB * 0.2, vol * 0.8);
  if (k % 2 === 0) noise(c, t, 0.03, 7000, 0.035, 'highpass');
  if (boss && k % 4 === 0) {
    tone(c, 'sine', 110, 40, t, 0.18, 0.2);
  }
  if (musicMode === 'battle' && k % 8 === 4) noise(c, t, 0.09, 1800, 0.05, 'bandpass');
  // melodia pluck
  const prob = musicMode === 'menu' ? 0.28 : 0.4;
  if (k % 2 === 0 && Math.random() < prob) {
    const sc = scale[Math.floor(Math.random() * scale.length)];
    tone(c, 'square', note(root, sc, 4), note(root, sc, 4) * 0.995, t, SPB * 0.22, vol * 0.45);
  }
  if (musicMode !== 'menu' && k % 2 === 1) {
    const ch = [0, 4, 7, 12][(k >> 1) % 4];
    tone(c, 'triangle', note(root, ch, 2), note(root, ch, 2), t, SPB * 0.12, vol * 0.5);
  }
}

function tick(): void {
  if (musicMode === 'off') return;
  const c = ac();
  if (!c) {
    nextT = 0;
    return;
  }
  if (nextT < c.currentTime) nextT = c.currentTime + 0.05;
  while (nextT < c.currentTime + 0.3) {
    scheduleStep(c, nextT, stepN++);
    nextT += SPB / 4;
  }
}

export function setMusic(mode: MusicMode): void {
  musicMode = mode;
  if (mode === 'off') {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    return;
  }
  if (timer === null) timer = window.setInterval(tick, 90);
}
