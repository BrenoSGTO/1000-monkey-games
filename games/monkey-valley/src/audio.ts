import { monkeyAudio } from '@monkey-slop/sdk';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (monkeyAudio.isMuted()) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, freq2: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2 !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(dur: number, vol: number, freq: number, type: BiquadFilterType, delay = 0, freq2?: number): void {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

export type Sfx =
  | 'hoe'
  | 'water'
  | 'chop'
  | 'pick'
  | 'plant'
  | 'harvest'
  | 'splash'
  | 'bite'
  | 'reel'
  | 'catch'
  | 'coin'
  | 'blip'
  | 'step'
  | 'thunder'
  | 'sleep'
  | 'rooster'
  | 'pop'
  | 'hurt'
  | 'ladder'
  | 'eat'
  | 'heart'
  | 'error'
  | 'ui'
  | 'cast'
  | 'bleat'
  | 'cluck'
  | 'open';

export function sfx(name: Sfx, arg = 0): void {
  switch (name) {
    case 'hoe':
      noise(0.14, 0.5, 700, 'lowpass', 0, 200);
      tone(130, 70, 0.1, 'triangle', 0.25);
      break;
    case 'water':
      noise(0.35, 0.25, 2400, 'bandpass', 0, 1200);
      tone(700, 400, 0.18, 'sine', 0.06, 0.05);
      break;
    case 'chop':
      tone(220, 90, 0.09, 'square', 0.18);
      noise(0.08, 0.4, 1200, 'lowpass');
      break;
    case 'pick':
      tone(900, 500, 0.06, 'square', 0.14);
      noise(0.06, 0.35, 3000, 'highpass');
      tone(1400, 900, 0.05, 'triangle', 0.1, 0.03);
      break;
    case 'plant':
      tone(300, 520, 0.1, 'sine', 0.18);
      noise(0.1, 0.2, 500, 'lowpass');
      break;
    case 'harvest':
      tone(520, 780, 0.09, 'triangle', 0.18);
      tone(780, 1180, 0.12, 'triangle', 0.18, 0.08);
      break;
    case 'splash':
      noise(0.4, 0.5, 1800, 'lowpass', 0, 400);
      tone(400, 200, 0.2, 'sine', 0.12);
      break;
    case 'cast':
      noise(0.25, 0.25, 4000, 'highpass', 0, 800);
      break;
    case 'bite':
      tone(880, 880, 0.08, 'square', 0.18);
      tone(1320, 1320, 0.12, 'square', 0.18, 0.1);
      break;
    case 'reel':
      tone(300 + arg * 200, 340 + arg * 200, 0.05, 'sawtooth', 0.05);
      break;
    case 'catch':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.2, i * 0.09));
      break;
    case 'coin':
      tone(988, 988, 0.07, 'square', 0.14);
      tone(1319, 1319, 0.22, 'square', 0.14, 0.07);
      break;
    case 'blip':
      tone(380 + arg * 90, 420 + arg * 90, 0.045, 'square', 0.07);
      break;
    case 'step':
      noise(0.04, 0.08, 500 + arg * 100, 'lowpass');
      break;
    case 'thunder':
      noise(1.4, 0.7, 300, 'lowpass', 0, 60);
      tone(60, 30, 1.2, 'sine', 0.3);
      break;
    case 'sleep':
      [392, 330, 262, 196].forEach((f, i) => tone(f, f, 0.5, 'sine', 0.14, i * 0.3));
      break;
    case 'rooster':
      tone(500, 800, 0.15, 'sawtooth', 0.1);
      tone(800, 700, 0.12, 'sawtooth', 0.1, 0.18);
      tone(700, 1000, 0.3, 'sawtooth', 0.1, 0.34);
      tone(1000, 600, 0.4, 'sawtooth', 0.08, 0.7);
      break;
    case 'pop':
      tone(500, 900, 0.07, 'sine', 0.15);
      break;
    case 'hurt':
      tone(200, 80, 0.2, 'sawtooth', 0.2);
      break;
    case 'ladder':
      tone(300, 200, 0.12, 'triangle', 0.15);
      tone(200, 300, 0.2, 'triangle', 0.15, 0.1);
      break;
    case 'eat':
      noise(0.08, 0.3, 900, 'bandpass');
      noise(0.08, 0.3, 900, 'bandpass', 0.12);
      tone(440, 660, 0.15, 'sine', 0.1, 0.2);
      break;
    case 'heart':
      tone(660, 880, 0.12, 'sine', 0.16);
      tone(880, 1320, 0.2, 'sine', 0.16, 0.1);
      break;
    case 'error':
      tone(180, 140, 0.15, 'square', 0.1);
      break;
    case 'ui':
      tone(600, 420, 0.05, 'square', 0.07);
      break;
    case 'open':
      tone(440, 660, 0.08, 'triangle', 0.12);
      break;
    case 'bleat':
      tone(420, 330, 0.3, 'sawtooth', 0.07);
      break;
    case 'cluck':
      tone(700, 500, 0.05, 'square', 0.07);
      tone(650, 450, 0.05, 'square', 0.07, 0.08);
      break;
  }
}

// ---------------------------------------------------------------- Música calma

const SCALE = [0, 2, 4, 7, 9];
const ROOTS = [60, 62, 57, 53]; // C, D, A, F por estação
const PROG = [
  [0, 4, 7],
  [-3, 0, 4],
  [-7, -3, 0],
  [-5, -1, 2],
];
let musicTimer: number | null = null;
let beat = 0;
let nextTime = 0;
let musicSeason = 0;
let musicNight = false;
let rainSrc: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let rainWanted = false;

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

function note(freq: number, t: number, dur: number, type: OscillatorType, vol: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function scheduleMusic(): void {
  const c = ac();
  if (rainGain) rainGain.gain.value = monkeyAudio.isMuted() || !rainWanted ? 0 : 0.18;
  if (!c) return;
  if (rainWanted && !rainSrc) startRain(c);
  const BEAT = musicNight ? 0.75 : 0.62;
  if (nextTime < c.currentTime) nextTime = c.currentTime + 0.1;
  while (nextTime < c.currentTime + 1.2) {
    const bar = Math.floor(beat / 8) % 4;
    const root = ROOTS[musicSeason] - 12;
    const chord = PROG[bar];
    const step = beat % 8;
    const vol = musicNight ? 0.035 : 0.05;
    if (step === 0) {
      note(mtof(root + chord[0] - 12 + 12), nextTime, BEAT * 7, 'sine', vol * 0.9);
      for (const n of chord) note(mtof(root + 12 + n), nextTime, BEAT * 6, 'triangle', vol * 0.35);
    }
    if (step % 2 === 0 || Math.random() < 0.3) {
      if (Math.random() < 0.62) {
        const sc = SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.35 ? 24 : 12);
        const f = mtof(root + 12 + sc);
        note(f, nextTime, BEAT * 1.6, 'triangle', vol);
        note(f, nextTime + BEAT * 0.75, BEAT * 1.2, 'sine', vol * 0.3);
      }
    }
    nextTime += BEAT;
    beat++;
  }
}

function startRain(c: AudioContext): void {
  rainSrc = c.createBufferSource();
  rainSrc.buffer = noiseBuffer(c);
  rainSrc.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2200;
  f.Q.value = 0.6;
  rainGain = c.createGain();
  rainGain.gain.value = 0.15;
  rainSrc.connect(f).connect(rainGain).connect(master!);
  rainSrc.start();
}

export function startMusic(): void {
  if (musicTimer !== null) return;
  musicTimer = window.setInterval(scheduleMusic, 300);
  scheduleMusic();
}

export function stopMusic(): void {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
}

export function setMusicMood(season: number, night: boolean, rain: boolean): void {
  musicSeason = season;
  musicNight = night;
  rainWanted = rain;
}

export function unlockAudio(): void {
  ac();
}
