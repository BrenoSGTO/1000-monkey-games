import { monkeyAudio } from '@monkey-slop/sdk';
import type { SimSoundEvent } from './types';

class KitchenAudio {
  private ctx: AudioContext | null = null;
  private lastTickAt: Record<string, number> = {};

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

  play(event: SimSoundEvent): void {
    if (monkeyAudio.isMuted()) return;
    const ctx = this.ensureCtx();

    switch (event) {
      case 'pickup':
        this.tone(ctx, 'triangle', 460, 690, 0.06, 0.14);
        break;
      case 'drop':
        this.tone(ctx, 'triangle', 340, 220, 0.06, 0.14);
        break;
      case 'throw':
        this.tone(ctx, 'sine', 300, 820, 0.11, 0.15);
        break;
      case 'dash':
        this.noise(ctx, 0.08, 900, 0.12);
        this.tone(ctx, 'sine', 240, 520, 0.08, 0.12);
        break;
      case 'chop':
        if (!this.throttled('chop', 140)) return;
        this.noise(ctx, 0.045, 2400, 0.16);
        this.tone(ctx, 'square', 720, 420, 0.035, 0.08);
        break;
      case 'wash':
        if (!this.throttled('wash', 190)) return;
        this.noise(ctx, 0.09, 3200, 0.1);
        this.tone(ctx, 'sine', 640, 920, 0.06, 0.07);
        break;
      case 'sizzle':
        if (!this.throttled('sizzle', 380)) return;
        this.noise(ctx, 0.14, 4200, 0.06);
        break;
      case 'blend':
        if (!this.throttled('blend', 260)) return;
        this.tone(ctx, 'sawtooth', 190, 280, 0.12, 0.06);
        break;
      case 'deliver':
        // Classic crisp service bell DING! + coin
        this.tone(ctx, 'sine', 1318.5, 1318.5, 0.25, 0.22);
        this.tone(ctx, 'triangle', 1975.5, 1975.5, 0.22, 0.14, 0.03);
        monkeyAudio.play('coin', 0.18);
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
