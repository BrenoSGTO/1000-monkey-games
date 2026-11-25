import { monkeyAudio } from '@monkey-slop/sdk';
import type { SimSoundEvent } from './types';

const MUSIC_KEY = 'sopa-de-macacao:music-off';

class KitchenAudio {
  private ctx: AudioContext | null = null;
  private lastTickAt: Record<string, number> = {};
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmRush = false;
  private musicMuted = false;

  constructor() {
    try {
      this.musicMuted = localStorage.getItem(MUSIC_KEY) === '1';
    } catch {
      this.musicMuted = false;
    }
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  public toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    try {
      localStorage.setItem(MUSIC_KEY, this.musicMuted ? '1' : '0');
    } catch {
      // ignore
    }
    return this.musicMuted;
  }

  private ensureCtx(): AudioContext | null {
    if (monkeyAudio.isMuted() || typeof window === 'undefined') return null;
    if (!this.ctx) {
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

  private throttled(key: string, minGapMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastTickAt[key] || 0) < minGapMs) return false;
    this.lastTickAt[key] = now;
    return true;
  }

  public startMusic(): void {
    if (this.bgmTimer !== null) return;
    this.bgmStep = 0;
    const scheduleNext = () => {
      if (this.bgmTimer === null) return;
      if (!monkeyAudio.isMuted() && !this.musicMuted) {
        this.playMusicBeat(this.bgmStep);
      }
      this.bgmStep = (this.bgmStep + 1) % 16;
      const stepMs = this.bgmRush ? 155 : 195;
      this.bgmTimer = window.setTimeout(scheduleNext, stepMs);
    };
    this.bgmTimer = window.setTimeout(scheduleNext, 200);
  }

  public setRushTempo(rush: boolean): void {
    this.bgmRush = rush;
  }

  public stopMusic(): void {
    if (this.bgmTimer !== null) {
      window.clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmRush = false;
  }

  private playMusicBeat(step: number): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    // Playful tropical marimba & bouncy bass groove (C major / pentatonic kitchen vibe)
    const bassPattern = [130.81, 0, 164.81, 0, 196.0, 0, 164.81, 146.83, 130.81, 0, 146.83, 0, 196.0, 0, 220.0, 196.0];
    const leadPattern = [523.25, 0, 659.25, 587.33, 0, 783.99, 659.25, 0, 880.0, 0, 783.99, 659.25, 587.33, 0, 659.25, 0];

    const bass = bassPattern[step];
    if (bass > 0) {
      this.tone(ctx, 'triangle', bass, bass * 0.98, 0.14, 0.042);
    }

    const lead = leadPattern[step];
    if (lead > 0) {
      this.tone(ctx, 'sine', lead, lead * 1.005, 0.1, 0.028);
    }

    // Soft shaker on off-beats
    if (step % 2 === 1) {
      this.noise(ctx, 0.03, 5200, 0.015);
    }
  }

  play(event: SimSoundEvent): void {
    if (monkeyAudio.isMuted()) return;
    const ctx = this.ensureCtx();

    switch (event) {
      case 'pickup':
        this.tone(ctx, 'triangle', 460, 710, 0.06, 0.14);
        break;
      case 'drop':
        this.tone(ctx, 'triangle', 340, 210, 0.06, 0.14);
        break;
      case 'throw':
        this.tone(ctx, 'sine', 300, 860, 0.11, 0.15);
        break;
      case 'dash':
        this.noise(ctx, 0.08, 950, 0.12);
        this.tone(ctx, 'sine', 240, 540, 0.08, 0.12);
        break;
      case 'chop':
        if (!this.throttled('chop', 135)) return;
        this.noise(ctx, 0.045, 2400, 0.16);
        this.tone(ctx, 'square', 740, 420, 0.035, 0.08);
        break;
      case 'wash':
        if (!this.throttled('wash', 190)) return;
        this.noise(ctx, 0.09, 3200, 0.1);
        this.tone(ctx, 'sine', 640, 940, 0.06, 0.07);
        break;
      case 'sizzle':
        if (!this.throttled('sizzle', 380)) return;
        this.noise(ctx, 0.14, 4200, 0.06);
        break;
      case 'bubble':
        if (!this.throttled('bubble', 320)) return;
        this.tone(ctx, 'sine', 260 + Math.random() * 120, 520 + Math.random() * 140, 0.08, 0.07);
        break;
      case 'blend':
        if (!this.throttled('blend', 260)) return;
        this.tone(ctx, 'sawtooth', 190, 290, 0.12, 0.06);
        break;
      case 'deliver':
        // Classic crisp service bell DING! + coin
        this.tone(ctx, 'sine', 1318.5, 1318.5, 0.25, 0.22);
        this.tone(ctx, 'triangle', 1975.5, 1975.5, 0.22, 0.14, 0.03);
        monkeyAudio.play('coin', 0.18);
        break;
      case 'deliverCombo':
        // Higher celebratory bell chord for combo streak!
        this.tone(ctx, 'sine', 1318.5, 1318.5, 0.24, 0.2);
        this.tone(ctx, 'triangle', 1567.98, 1567.98, 0.24, 0.16, 0.04);
        this.tone(ctx, 'triangle', 2093.0, 2093.0, 0.28, 0.16, 0.08);
        monkeyAudio.play('coin', 0.2);
        break;
      case 'orderFail':
        monkeyAudio.play('rage', 0.22);
        break;
      case 'alarm':
        if (!this.throttled('alarm', 650)) return;
        this.tone(ctx, 'square', 880, 740, 0.09, 0.11);
        this.tone(ctx, 'square', 1046, 880, 0.09, 0.11, 0.1);
        break;
      case 'extinguish':
        if (!this.throttled('extinguish', 150)) return;
        this.noise(ctx, 0.11, 1800, 0.12);
        break;
      case 'slip':
        monkeyAudio.play('boing', 0.24);
        break;
      case 'rat':
        monkeyAudio.play('screech', 0.16);
        break;
      case 'shout':
        monkeyAudio.play('screech', 0.18);
        break;
      case 'burn':
        monkeyAudio.play('explosion', 0.22);
        break;
      case 'bridge':
        this.tone(ctx, 'triangle', 320, 480, 0.16, 0.12);
        break;
      case 'tick':
        this.tone(ctx, 'triangle', 660, 620, 0.09, 0.16);
        break;
      case 'start':
        this.tone(ctx, 'triangle', 523.25, 523.25, 0.12, 0.18);
        this.tone(ctx, 'triangle', 783.99, 783.99, 0.14, 0.18, 0.06);
        this.tone(ctx, 'sine', 1046.5, 1046.5, 0.26, 0.22, 0.12);
        break;
      case 'rush':
        this.tone(ctx, 'sawtooth', 440, 880, 0.16, 0.14);
        this.tone(ctx, 'sawtooth', 587.33, 1174.66, 0.22, 0.14, 0.14);
        break;
    }
  }

  playFanfare(): void {
    monkeyAudio.play('fanfare', 0.25);
  }

  private tone(
    ctx: AudioContext | null,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    vol: number,
    delay = 0,
  ): void {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(
    ctx: AudioContext | null,
    duration: number,
    filterFreq: number,
    vol: number,
  ): void {
    if (!ctx) return;
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < size; i++) {
      ch[i] = (Math.random() * 2 - 1) * (1 - i / size);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }
}

export const kitchenAudio = new KitchenAudio();
