import { monkeyAudio } from '@monkey-slop/sdk';

export type FgSound =
  | 'jump'
  | 'dive'
  | 'grab'
  | 'steal'
  | 'slap'
  | 'bonk'
  | 'boing'
  | 'splash'
  | 'creak'
  | 'tile'
  | 'whistle'
  | 'thud'
  | 'kick'
  | 'goal'
  | 'crown'
  | 'count'
  | 'go'
  | 'qual'
  | 'elim'
  | 'fanfare'
  | 'whoosh'
  | 'click';

class FallAudio {
  private ctx: AudioContext | null = null;
  private musicOn = false;
  private musicTimer = 0;
  private step = 0;
  private master: GainNode | null = null;

  private get(): AudioContext | null {
    if (monkeyAudio.isMuted() || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(type: OscillatorType, f1: number, f2: number, dur: number, vol = 0.12, delay = 0): void {
    const ctx = this.get();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, f1), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, freq: number, vol = 0.12, delay = 0, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.get();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(s: FgSound, vol = 1): void {
    const v = 0.14 * vol;
    switch (s) {
      case 'jump':
        this.tone('sine', 260, 560, 0.12, v * 0.8);
        break;
      case 'dive':
        this.noise(0.18, 1800, v * 0.9, 0, 'bandpass');
        this.tone('triangle', 520, 220, 0.2, v * 0.6);
        break;
      case 'grab':
        this.tone('square', 300, 360, 0.06, v * 0.5);
        break;
      case 'steal':
        this.tone('triangle', 400, 900, 0.1, v);
        this.tone('triangle', 900, 1300, 0.12, v, 0.09);
        break;
      case 'slap':
        this.noise(0.09, 1400, v * 1.3);
        this.tone('triangle', 240, 70, 0.1, v);
        break;
      case 'bonk':
        this.tone('sine', 190, 60, 0.22, v * 1.7);
        this.noise(0.08, 900, v);
        this.tone('square', 900, 500, 0.08, v * 0.4, 0.05);
        break;
      case 'boing':
        this.tone('sine', 160, 620, 0.16, v * 1.4);
        this.tone('sine', 620, 240, 0.2, v * 1.2, 0.15);
        break;
      case 'splash':
        this.noise(0.45, 700, v * 1.2);
        this.tone('sine', 420, 120, 0.3, v * 0.6);
        break;
      case 'creak':
        this.tone('sawtooth', 140, 190, 0.28, v * 0.5);
        break;
      case 'tile':
        this.tone('triangle', 520, 410, 0.07, v * 0.45);
        break;
      case 'whistle':
        this.tone('sine', 1400, 700, 0.45, v * 0.35);
        break;
      case 'thud':
        this.tone('sine', 120, 45, 0.16, v * 1.3);
        break;
      case 'kick':
        this.tone('sine', 300, 90, 0.12, v * 1.4);
        this.noise(0.06, 1200, v);
        break;
      case 'goal':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f * 1.02, 0.22, v * 1.1, i * 0.08));
        this.noise(0.8, 3000, v * 0.4, 0.1, 'highpass');
        break;
      case 'crown':
        this.tone('triangle', 784, 1046, 0.12, v);
        this.tone('triangle', 1046, 1568, 0.18, v, 0.1);
        break;
      case 'count':
        this.tone('square', 440, 440, 0.16, v * 0.8);
        break;
      case 'go':
        this.tone('square', 880, 880, 0.35, v * 0.9);
        this.tone('triangle', 1320, 1320, 0.4, v * 0.7, 0.05);
        break;
      case 'qual':
        [659, 880, 1175].forEach((f, i) => this.tone('triangle', f, f, 0.14, v, i * 0.07));
        break;
      case 'elim':
        this.tone('sawtooth', 380, 110, 0.5, v * 0.9);
        this.tone('square', 250, 70, 0.55, v * 0.5, 0.1);
        break;
      case 'fanfare':
        [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) =>
          this.tone('triangle', f, f * 1.005, 0.2, v * 1.2, i * 0.14),
        );
        break;
      case 'whoosh':
        this.noise(0.3, 1200, v * 0.7, 0, 'bandpass');
        break;
      case 'click':
        monkeyAudio.play('click');
        break;
    }
  }

  // tiny party loop (bouncy bass + arpeggio), scheduled with setInterval
  startMusic(): void {
    if (this.musicOn) return;
    this.musicOn = true;
    const bass = [196, 196, 261.6, 220, 174.6, 174.6, 220, 196];
    const arp = [392, 523, 659, 523, 440, 523, 659, 784];
    this.musicTimer = window.setInterval(() => {
      if (monkeyAudio.isMuted()) return;
      const i = this.step++ % 8;
      this.tone('triangle', bass[i], bass[i], 0.17, 0.05);
      if (i % 2 === 0) this.tone('square', arp[i], arp[i], 0.09, 0.018);
      if (i % 4 === 2) this.noise(0.04, 5000, 0.02, 0, 'highpass');
    }, 190);
  }

  stopMusic(): void {
    this.musicOn = false;
    window.clearInterval(this.musicTimer);
  }
}

export const fgAudio = new FallAudio();
