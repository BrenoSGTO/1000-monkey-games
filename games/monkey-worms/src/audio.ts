import { monkeyAudio } from '@monkey-slop/sdk';

type Wave = OscillatorType;

/** Áudio procedural extra (WebAudio) — respeita o mute persistente do SDK. */
class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicOn = false;
  private nextNote = 0;
  private mstep = 0;

  private ensure(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    this.ensure();
  }

  private tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.2, slideTo?: number, delay = 0, vib = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    if (vib > 0) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 22;
      lg.gain.value = vib;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2, freq = 1000, type: BiquadFilterType = 'lowpass', slideTo?: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  // ───────── efeitos ─────────

  shoot(): void {
    this.noise(0.28, 0.22, 2400, 'bandpass', 500);
    this.tone(140, 0.18, 'square', 0.12, 50);
  }
  throwSfx(): void {
    this.noise(0.18, 0.13, 1800, 'bandpass', 700);
    this.tone(320, 0.12, 'triangle', 0.08, 220);
  }
  explosion(size: number): void {
    const s = Math.min(1.6, size / 50);
    this.noise(0.5 + s * 0.5, 0.5, 1800, 'lowpass', 90);
    this.tone(90, 0.45 + s * 0.3, 'sine', 0.45, 28);
    this.tone(180, 0.2, 'sawtooth', 0.12, 40);
  }
  bounce(): void {
    this.tone(520, 0.07, 'triangle', 0.1, 260);
  }
  splash(): void {
    this.noise(0.5, 0.25, 900, 'bandpass', 300);
    this.tone(240, 0.18, 'sine', 0.1, 90);
  }
  thud(): void {
    this.tone(110, 0.12, 'sine', 0.2, 50);
    this.noise(0.08, 0.1, 400, 'lowpass');
  }
  jump(): void {
    monkeyAudio.play('boing', 0.12);
  }
  step(): void {
    this.tone(180 + Math.random() * 40, 0.04, 'square', 0.03, 120);
  }
  tick(urgent: boolean): void {
    this.tone(urgent ? 1300 : 900, 0.05, 'square', urgent ? 0.1 : 0.06);
  }
  slap(): void {
    monkeyAudio.play('slap', 0.3);
    this.noise(0.1, 0.25, 3000, 'highpass');
  }
  rope(): void {
    this.noise(0.12, 0.12, 3000, 'highpass');
    this.tone(700, 0.1, 'triangle', 0.08, 1300);
  }
  whiff(): void {
    this.noise(0.12, 0.1, 1500, 'bandpass', 500);
  }
  torch(): void {
    this.noise(0.9, 0.12, 5000, 'highpass');
    this.noise(1.0, 0.08, 400, 'lowpass', undefined, 0.8);
  }
  kami(): void {
    this.tone(900, 0.9, 'sawtooth', 0.14, 200, 0, 40);
  }
  mineBeep(): void {
    for (let i = 0; i < 4; i++) this.tone(1500, 0.05, 'square', 0.09, undefined, i * 0.13);
  }
  plant(): void {
    this.tone(300, 0.08, 'triangle', 0.1, 150);
  }
  crate(): void {
    this.tone(660, 0.12, 'triangle', 0.1, 990);
    this.tone(990, 0.18, 'triangle', 0.1, undefined, 0.1);
  }
  pickup(): void {
    monkeyAudio.play('coin', 0.25);
  }
  coo(): void {
    for (let i = 0; i < 5; i++) {
      this.tone(520, 0.08, 'sine', 0.07, 400, i * 0.09);
      this.tone(430, 0.08, 'sine', 0.07, 350, i * 0.09 + 0.04);
    }
  }
  baa(): void {
    this.tone(330, 0.45, 'sawtooth', 0.1, 270, 0, 30);
    this.tone(500, 0.4, 'square', 0.04, 420, 0.02, 24);
  }
  holy(): void {
    [523, 659, 784, 1047, 1318].forEach((f, i) => this.tone(f, 0.55, 'sine', 0.11, undefined, i * 0.09));
  }
  holyBoom(): void {
    [392, 523, 659, 784, 988].forEach((f, i) => this.tone(f, 1.2, 'sine', 0.12, undefined, i * 0.04));
  }
  siren(): void {
    this.tone(500, 0.5, 'sawtooth', 0.13, 900);
    this.tone(900, 0.5, 'sawtooth', 0.13, 500, 0.5);
  }

  /** Voz de macaco sintetizada (ooh/aah) — varia por tipo de reação */
  voice(kind: 'hurt' | 'bighurt' | 'die' | 'say' | 'cheer' | 'panic' | 'drown', pitchSeed = 1): void {
    const p = 0.85 + (pitchSeed % 7) * 0.06;
    switch (kind) {
      case 'hurt':
        this.tone(520 * p, 0.2, 'sawtooth', 0.1, 330 * p, 0, 18);
        this.tone(780 * p, 0.14, 'square', 0.04, 500 * p, 0.03);
        break;
      case 'bighurt':
        this.tone(420 * p, 0.55, 'sawtooth', 0.12, 900 * p, 0, 28);
        this.tone(630 * p, 0.45, 'square', 0.05, 1200 * p, 0.04);
        break;
      case 'panic':
        this.tone(600 * p, 0.35, 'sawtooth', 0.08, 1000 * p, 0, 40);
        break;
      case 'die':
        this.tone(620 * p, 0.7, 'sawtooth', 0.12, 140, 0, 20);
        this.tone(400 * p, 0.5, 'square', 0.05, 90, 0.1);
        break;
      case 'drown':
        for (let i = 0; i < 4; i++) this.tone(300 + i * 40, 0.1, 'sine', 0.08, 120, i * 0.12);
        break;
      case 'cheer':
        this.tone(500 * p, 0.12, 'sawtooth', 0.09, 700 * p);
        this.tone(700 * p, 0.12, 'sawtooth', 0.09, 900 * p, 0.14);
        this.tone(900 * p, 0.28, 'sawtooth', 0.09, 650 * p, 0.28);
        break;
      default:
        this.tone(450 * p, 0.1, 'triangle', 0.08, 560 * p);
        this.tone(560 * p, 0.12, 'triangle', 0.08, 430 * p, 0.12);
        break;
    }
  }

  fanfare(): void {
    monkeyAudio.play('fanfare', 0.3);
  }

  click(): void {
    monkeyAudio.play('click', 0.18);
  }

  // ───────── música (bongô + marimba pentatônica) ─────────

  startMusic(): void {
    if (this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ensure();
    this.nextNote = ctx ? ctx.currentTime + 0.1 : 0;
    this.mstep = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    if (!this.musicOn || monkeyAudio.isMuted()) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const spb = 60 / 112 / 2;
    while (this.nextNote < ctx.currentTime + 0.35) {
      const d = this.nextNote - ctx.currentTime;
      const s = this.mstep % 16;
      if (s % 4 === 0) this.tone(95, 0.16, 'sine', 0.07, 55, Math.max(0, d));
      if (s === 3 || s === 7 || s === 10 || s === 14) this.tone(330, 0.07, 'triangle', 0.045, 200, Math.max(0, d));
      if (s % 2 === 1) this.noise(0.04, 0.025, 6000, 'highpass', undefined, Math.max(0, d));
      if (s % 2 === 0 && Math.random() < 0.7) {
        const scale = [0, 2, 4, 7, 9, 12, 14];
        const note = 392 * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12);
        this.tone(note, 0.22, 'sine', 0.035, undefined, Math.max(0, d));
      }
      this.nextNote += spb;
      this.mstep++;
    }
  }
}

export const gameAudio = new GameAudio();
