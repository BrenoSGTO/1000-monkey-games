import { monkeyAudio } from '@monkey-slop/sdk';

class SimsAudioEngine {
  private ctx: AudioContext | null = null;
  private musicEnabled = true;
  private musicTimer: number | null = null;
  private stepIdx = 0;

  private ensureContext(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.stopMusicLoop();
    } else {
      this.startMusicLoop();
    }
    return this.musicEnabled;
  }

  startMusicLoop(): void {
    if (this.musicTimer !== null || typeof window === 'undefined') return;
    // Cozy Sim-elevator bossa chord progression in Cmaj7 - Am7 - Dm7 - G7
    const chords = [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0], // Am7
      [293.66, 349.23, 440.0, 523.25], // Dm7
      [196.0, 246.94, 293.66, 349.23], // G7
    ];
    const melody = [523.25, 659.25, 587.33, 493.88, 440.0, 523.25, 587.33, 392.0];

    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled || monkeyAudio.isMuted()) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const chord = chords[Math.floor(this.stepIdx / 4) % chords.length];
      const now = ctx.currentTime;

      if (this.stepIdx % 4 === 0) {
        // Gentle marimba/rhodes chord
        for (const freq of chord) {
          this.softNote(ctx, freq, now, 0.75, 0.018, 'sine');
        }
      }
      if (this.stepIdx % 2 === 1) {
        const mel = melody[this.stepIdx % melody.length];
        this.softNote(ctx, mel, now, 0.28, 0.022, 'triangle');
      }
      this.stepIdx = (this.stepIdx + 1) % 32;
    }, 520);
  }

  stopMusicLoop(): void {
    if (this.musicTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private softNote(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    vol: number,
    type: OscillatorType,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  playAction(
    kind:
      | 'eat'
      | 'cook'
      | 'sleep'
      | 'shower'
      | 'toilet'
      | 'game'
      | 'music'
      | 'work'
      | 'clean'
      | 'dance'
      | 'fire'
      | 'promo'
      | 'pee'
      | 'prank',
  ): void {
    if (monkeyAudio.isMuted()) return;
    switch (kind) {
      case 'eat':
        monkeyAudio.play('banana', 0.22);
        break;
      case 'cook':
        this.playSizzle();
        break;
      case 'sleep':
        this.playSnore();
        break;
      case 'shower':
        this.playWaterNoise(0.35);
        break;
      case 'toilet':
        this.playFlush();
        break;
      case 'game':
        monkeyAudio.play('boing', 0.18);
        break;
      case 'music':
      case 'dance':
        monkeyAudio.play('banana', 0.16);
        break;
      case 'work':
        monkeyAudio.play('coin', 0.22);
        break;
      case 'clean':
        monkeyAudio.play('click', 0.2);
        break;
      case 'fire':
        monkeyAudio.play('rage', 0.3);
        break;
      case 'promo':
        monkeyAudio.play('fanfare', 0.3);
        break;
      case 'pee':
        monkeyAudio.play('screech', 0.22);
        break;
      case 'prank':
        monkeyAudio.play('slap', 0.25);
        break;
    }
  }

  private playSizzle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.28);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  private playWaterNoise(dur: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  private playFlush(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  private playSnore(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.softNote(ctx, 130, now, 0.35, 0.04, 'triangle');
  }
}

export const simsAudio = new SimsAudioEngine();
