import { monkeyAudio } from '@monkey-slop/sdk';

type Mat = 'dirt' | 'stone' | 'wood' | 'ore' | 'leaf' | 'sand' | 'glass';

class CraftAudio {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastMine = 0;
  private musicT = 4;
  private musicStep = 0;

  private getCtx(): AudioContext | null {
    if (monkeyAudio.isMuted() || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(type: OscillatorType, f1: number, f2: number, dur: number, vol = 0.12, delay = 0): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, f1), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filt: BiquadFilterType, f1: number, f2: number, delay = 0): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filt;
    f.frequency.setValueAtTime(f1, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  mine(mat: Mat, pitch = 1): void {
    const now = performance.now();
    if (now - this.lastMine < 70) return;
    this.lastMine = now;
    const p = pitch * (0.9 + Math.random() * 0.25);
    switch (mat) {
      case 'dirt':
        this.noise(0.09, 0.2, 'lowpass', 700 * p, 220, 0);
        this.tone('sine', 150 * p, 70, 0.08, 0.1);
        break;
      case 'sand':
        this.noise(0.12, 0.16, 'highpass', 1800 * p, 900, 0);
        break;
      case 'stone':
        this.noise(0.07, 0.22, 'bandpass', 1500 * p, 700, 0);
        this.tone('square', 220 * p, 110, 0.05, 0.07);
        break;
      case 'ore':
        this.noise(0.06, 0.2, 'bandpass', 2300 * p, 900, 0);
        this.tone('triangle', 920 * p, 700, 0.09, 0.08);
        break;
      case 'wood':
        this.tone('square', 190 * p, 90, 0.07, 0.1);
        this.noise(0.05, 0.12, 'bandpass', 900 * p, 400, 0);
        break;
      case 'leaf':
        this.noise(0.1, 0.1, 'highpass', 2600, 1800, 0);
        break;
      case 'glass':
        this.tone('triangle', 1700 * p, 2400, 0.07, 0.1);
        break;
    }
  }
  breakBlock(mat: Mat): void {
    this.noise(0.16, 0.26, mat === 'stone' || mat === 'ore' ? 'bandpass' : 'lowpass', 1300, 260);
    this.tone(mat === 'glass' ? 'triangle' : 'sine', mat === 'glass' ? 2400 : 180, mat === 'glass' ? 900 : 60, 0.14, 0.14);
    if (mat === 'ore') this.tone('triangle', 1100, 1500, 0.12, 0.08, 0.04);
  }
  place(): void {
    this.tone('sine', 220, 120, 0.08, 0.16);
    this.noise(0.05, 0.12, 'lowpass', 600, 250);
  }
  pickup(): void {
    this.tone('triangle', 700 + Math.random() * 200, 1100, 0.07, 0.08);
  }
  craft(): void {
    [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f * 1.02, 0.14, 0.1, i * 0.07));
  }
  jump(): void {
    this.tone('sine', 220, 440, 0.1, 0.07);
  }
  step(): void {
    this.noise(0.04, 0.05, 'lowpass', 500, 250);
  }
  hurt(): void {
    this.tone('sawtooth', 380, 120, 0.22, 0.14);
    this.noise(0.12, 0.14, 'lowpass', 900, 300);
  }
  swing(): void {
    this.noise(0.09, 0.09, 'bandpass', 1200, 2600);
  }
  hit(): void {
    this.noise(0.08, 0.2, 'bandpass', 1000, 400);
    this.tone('square', 160, 70, 0.1, 0.1);
  }
  boom(): void {
    this.noise(0.6, 0.45, 'lowpass', 900, 60);
    this.tone('sawtooth', 120, 28, 0.5, 0.2);
  }
  coo(): void {
    const f = 420 + Math.random() * 60;
    this.tone('triangle', f, f * 0.7, 0.18, 0.07);
    this.tone('triangle', f * 1.1, f * 0.75, 0.16, 0.06, 0.15);
  }
  groan(): void {
    this.tone('sawtooth', 110, 70, 0.4, 0.06);
  }
  eat(): void {
    for (let i = 0; i < 3; i++) this.noise(0.05, 0.14, 'bandpass', 1400, 600, i * 0.1);
  }
  splash(): void {
    this.noise(0.25, 0.18, 'bandpass', 1800, 500);
    this.tone('sine', 500, 200, 0.12, 0.06);
  }
  goal(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.18, 0.1, i * 0.09));
  }
  die(): void {
    this.tone('sawtooth', 440, 55, 0.7, 0.14);
  }
  ui(): void {
    this.tone('square', 560, 420, 0.04, 0.06);
  }
  emote(): void {
    this.tone('sawtooth', 420, 880, 0.08, 0.07);
    this.tone('sawtooth', 840, 520, 0.08, 0.07, 0.09);
    this.tone('sawtooth', 500, 1000, 0.1, 0.07, 0.18);
  }

  /** Música ambiente procedural: notas pentatônicas suaves (dia) / graves misteriosas (noite/caverna). */
  music(dt: number, mood: 'day' | 'night' | 'cave'): void {
    this.musicT -= dt;
    if (this.musicT > 0) return;
    const ctx = this.getCtx();
    if (!ctx) {
      this.musicT = 2;
      return;
    }
    const penta = [0, 2, 4, 7, 9];
    const rootDay = 261.63;
    const rootNight = 146.83;
    const root = mood === 'day' ? rootDay : rootNight;
    const n = penta[Math.floor(Math.random() * penta.length)] + (Math.random() < 0.3 ? 12 : 0);
    const f = root * Math.pow(2, n / 12);
    if (mood === 'day') {
      this.tone('triangle', f, f, 1.4, 0.035);
      if (Math.random() < 0.5) this.tone('sine', f * 1.5, f * 1.5, 1.1, 0.02, 0.25);
      this.musicT = 2.2 + Math.random() * 3;
    } else if (mood === 'night') {
      this.tone('sine', f, f * 0.995, 2.4, 0.045);
      this.tone('triangle', f * 1.498, f * 1.5, 1.8, 0.018, 0.4);
      this.musicT = 3 + Math.random() * 3.5;
    } else {
      this.tone('sine', f * 0.5, f * 0.5, 3, 0.05);
      this.musicT = 4 + Math.random() * 4;
    }
    this.musicStep++;
  }
}

export const craftAudio = new CraftAudio();
export { monkeyAudio };
