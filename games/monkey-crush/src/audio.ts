import { monkeyAudio } from '@monkey-slop/sdk';

// Pentatonic / joyful tropical marimba scale frequencies (C5 up through E7)
const COMBO_SCALE = [
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.0,  // A5
  1046.5, // C6
  1174.66,// D6
  1318.51,// E6
  1567.98,// G6
  1760.0, // A6
  2093.0, // C7
];

class CrushAudioEngine {
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playSwap(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.08);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playInvalid(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(135, now + 0.14);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /** Escalating marimba/pop chord per cascade step */
  playMatch(comboStep: number, matchSize: number): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const idx = Math.min(COMBO_SCALE.length - 1, Math.max(0, comboStep - 1));
    const baseFreq = COMBO_SCALE[idx];

    // Main marimba pop
    this.marimbaNote(ctx, baseFreq, now, 0.22, 0.22);
    // Harmonic fifth / octave for bigger matches
    if (matchSize >= 4) {
      this.marimbaNote(ctx, baseFreq * 1.25, now + 0.04, 0.2, 0.24);
      this.marimbaNote(ctx, baseFreq * 1.5, now + 0.08, 0.18, 0.26);
    } else {
      this.marimbaNote(ctx, baseFreq * 2, now + 0.03, 0.09, 0.14);
    }
  }

  playSpecialCreate(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [659.25, 880, 1174.66, 1567.98].forEach((f, i) => {
      this.marimbaNote(ctx, f, now + i * 0.045, 0.18, 0.22);
    });
  }

  playStripeZap(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.22);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  playBomb(): void {
    monkeyAudio.play('explosion', 0.24);
  }

  playRainbow(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0];
    notes.forEach((freq, i) => {
      this.marimbaNote(ctx, freq, now + i * 0.04, 0.17, 0.3);
    });
  }

  playBabyRescue(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Cute monkey baby "uh-uh-ah!"
    [587.33, 783.99, 1046.5].forEach((f, i) => {
      this.marimbaNote(ctx, f, now + i * 0.07, 0.2, 0.22);
    });
  }

  playPeelSplat(): void {
    monkeyAudio.play('slap', 0.26);
    monkeyAudio.play('screech', 0.16);
  }

  playLand(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.055);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  playWin(): void {
    monkeyAudio.play('fanfare', 0.3);
  }

  playLose(): void {
    monkeyAudio.play('rage', 0.25);
  }

  playClick(): void {
    monkeyAudio.play('click', 0.16);
  }

  private marimbaNote(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    volume: number,
    duration: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.015, startTime + duration * 0.4);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export const crushAudio = new CrushAudioEngine();
