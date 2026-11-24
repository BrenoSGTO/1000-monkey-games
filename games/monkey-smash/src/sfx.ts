import { monkeyAudio } from '@monkey-slop/sdk';

// Áudio procedural extra (WebAudio) por cima do monkeyAudio do SDK.

let ctx: AudioContext | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
let musicOn = false;
let musicMood = 0;

function ac(): AudioContext | null {
  if (monkeyAudio.isMuted()) return null;
  if (!ctx) {
    const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!A) return null;
    ctx = new A();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass', delay = 0): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource();
  s.buffer = buf;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(fl);
  fl.connect(g);
  g.connect(c.destination);
  s.start(t);
  s.stop(t + dur + 0.02);
}

let lastHitSfx = 0;

export const sfx = {
  hit(power: number): void {
    const now = performance.now();
    if (now - lastHitSfx < 25) return;
    lastHitSfx = now;
    const p = Math.min(1, power / 28);
    noise(0.1 + p * 0.18, 900 + p * 1200, 0.5 + p * 0.3);
    tone('triangle', 240 - p * 120, 60, 0.12 + p * 0.1, 0.5);
    if (p > 0.5) {
      tone('sawtooth', 140, 40, 0.3, 0.4);
      monkeyAudio.play('screech', 0.12);
    } else if (p > 0.2) tone('square', 420, 200, 0.07, 0.15);
  },
  whoosh(): void {
    noise(0.12, 1800, 0.14, 'bandpass');
  },
  jump(): void {
    tone('sine', 220, 480, 0.12, 0.18);
  },
  djump(): void {
    tone('sine', 300, 700, 0.14, 0.2);
  },
  land(): void {
    noise(0.06, 500, 0.2);
  },
  shield(): void {
    tone('triangle', 900, 700, 0.1, 0.3);
    tone('triangle', 1300, 900, 0.08, 0.2, 0.03);
  },
  shieldBreak(): void {
    noise(0.4, 3000, 0.5, 'highpass');
    tone('sawtooth', 600, 80, 0.4, 0.4);
  },
  ko(): void {
    tone('sawtooth', 700, 70, 0.7, 0.45);
    noise(0.5, 900, 0.5);
    tone('triangle', 200, 40, 0.8, 0.5, 0.05);
    monkeyAudio.play('screech', 0.2);
  },
  explosion(): void {
    monkeyAudio.play('explosion', 0.4);
  },
  pickup(): void {
    monkeyAudio.play('coin', 0.22);
  },
  heal(): void {
    monkeyAudio.play('banana', 0.25);
  },
  pad(): void {
    monkeyAudio.play('boing', 0.3);
  },
  grab(): void {
    tone('square', 180, 120, 0.08, 0.22);
  },
  tele(): void {
    tone('sine', 1400, 300, 0.16, 0.2);
    tone('sine', 300, 1600, 0.12, 0.15, 0.05);
  },
  counter(): void {
    tone('square', 800, 1600, 0.12, 0.3);
    tone('square', 1200, 600, 0.1, 0.2, 0.06);
  },
  beep(go: boolean): void {
    tone('square', go ? 880 : 440, go ? 880 : 440, go ? 0.5 : 0.18, 0.28);
    if (go) monkeyAudio.play('fanfare', 0.25);
  },
  warn(): void {
    tone('square', 520, 520, 0.09, 0.18);
    tone('square', 520, 520, 0.09, 0.18, 0.14);
  },
  geyser(): void {
    noise(0.5, 400, 0.4);
    tone('sawtooth', 90, 50, 0.4, 0.3);
  },
  cannon(): void {
    noise(0.35, 500, 0.55);
    tone('sawtooth', 120, 35, 0.3, 0.4);
  },
  win(): void {
    monkeyAudio.play('fanfare', 0.3);
    setTimeout(() => monkeyAudio.play('fanfare', 0.25), 380);
  },
  click(): void {
    monkeyAudio.play('click', 0.2);
  },
  taunt(): void {
    monkeyAudio.play('screech', 0.18);
  },
};

// ---- trilha procedural simples (baixo + arpejo) ----
const BASS = [55, 55, 82.4, 55, 65.4, 65.4, 73.4, 82.4];
const ARP = [[220, 262, 330, 262], [196, 247, 294, 247], [220, 262, 330, 440], [247, 294, 370, 294]];

function musicTick(): void {
  const c = ac();
  if (!c || !musicOn) return;
  const step = musicStep++;
  const bar = Math.floor(step / 8) % 4;
  const fast = musicMood === 1;
  const b = BASS[step % 8];
  if (step % 2 === 0) tone('square', b * (bar === 3 ? 1.2 : 1), b * (bar === 3 ? 1.2 : 1), 0.18, 0.06);
  const a = ARP[bar][step % 4];
  tone('triangle', a * (fast ? 2 : 1), a * (fast ? 2 : 1), 0.12, 0.05);
  if (step % 4 === 0) noise(0.05, 4000, 0.05, 'highpass');
  if (step % 8 === 4) noise(0.08, 1200, 0.06, 'bandpass');
}

export function startMusic(mood: number): void {
  musicMood = mood;
  if (musicOn) return;
  musicOn = true;
  musicStep = 0;
  musicTimer = window.setInterval(musicTick, 190);
}

export function stopMusic(): void {
  musicOn = false;
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
