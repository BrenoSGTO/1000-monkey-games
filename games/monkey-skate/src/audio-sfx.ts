import { monkeyAudio } from '@monkey-slop/sdk';

class SkateAudio {
  private ctx: AudioContext | null = null;
  private lastCrunchAt = 0;
  private lastGrindAt = 0;

  private getCtx(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playOllie(power = 0.7): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160 + power * 90, now);
    osc.frequency.exponentialRampToValueAtTime(420 + power * 180, now + 0.08);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
    this.noise(ctx, now, 0.055, 2200, 0.15);
  }

  playTrick(kind: 'kickflip' | 'bananagrab' | 'christair'): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === 'kickflip') {
      this.tone(ctx, 'sine', 380, 760, now, 0.09, 0.14);
      this.noise(ctx, now, 0.06, 2600, 0.1);
    } else if (kind === 'bananagrab') {
      this.tone(ctx, 'triangle', 460, 690, now, 0.1, 0.15);
    } else {
      // Majestic angel-chimp chord
      this.tone(ctx, 'triangle', 523.25, 530, now, 0.25, 0.13);
      this.tone(ctx, 'triangle', 659.25, 665, now + 0.03, 0.24, 0.11);
      this.tone(ctx, 'triangle', 783.99, 790, now + 0.06, 0.24, 0.1);
    }
  }

  playLand(clean: boolean): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (clean) {
      this.noise(ctx, now, 0.07, 900, 0.16);
      this.tone(ctx, 'triangle', 150, 75, now, 0.08, 0.16);
    } else {
      monkeyAudio.play('slap', 0.35);
    }
  }

  playComboBank(mult: number): void {
    if (mult >= 3) {
      monkeyAudio.play('fanfare', 0.22);
    } else {
      monkeyAudio.play('coin', 0.22);
    }
  }

  playGrindTick(speed: number): void {
    const nowMs = performance.now();
    if (nowMs - this.lastGrindAt < 85) return;
    this.lastGrindAt = nowMs;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = 1800 + Math.min(2000, speed * 1.4);
    this.noise(ctx, now, 0.055, freq, 0.07);
    this.tone(ctx, 'sawtooth', 900 + Math.random() * 450, 700, now, 0.04, 0.03);
  }

  playBoneCrunch(intensity: number): void {
    const nowMs = performance.now();
    if (nowMs - this.lastCrunchAt < 90) return;
    this.lastCrunchAt = nowMs;
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.32, 0.1 + intensity * 0.02);
    this.noise(ctx, now, 0.11, 1400, vol);
    this.tone(ctx, 'sawtooth', 220 + Math.random() * 120, 55, now, 0.11, vol * 0.9);
    if (intensity > 11) {
      monkeyAudio.play('screech', 0.2);
    }
  }

  playEject(): void {
    monkeyAudio.play('boing', 0.3);
    monkeyAudio.play('screech', 0.24);
  }

  playTurboBanana(): void {
    monkeyAudio.play('banana', 0.28);
    const ctx = this.getCtx();
    if (!ctx) return;
    this.tone(ctx, 'sawtooth', 280, 980, ctx.currentTime, 0.22, 0.14);
  }

  playSlipBanana(): void {
    monkeyAudio.play('boing', 0.26);
    monkeyAudio.play('slap', 0.3);
  }

  playHonk(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 'sawtooth', 392, 388, now, 0.11, 0.12);
    this.tone(ctx, 'sawtooth', 494, 490, now, 0.11, 0.1);
    this.tone(ctx, 'sawtooth', 392, 388, now + 0.15, 0.14, 0.12);
    this.tone(ctx, 'sawtooth', 494, 490, now + 0.15, 0.14, 0.1);
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    volume: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
    g.gain.setValueAtTime(volume, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private noise(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    filterFreq: number,
    volume: number,
  ): void {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }
}

export const skateAudio = new SkateAudio();
