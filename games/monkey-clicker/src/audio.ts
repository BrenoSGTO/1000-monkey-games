import { monkeyAudio } from '@monkey-slop/sdk';

class ClickerAudio {
  private ctx: AudioContext | null = null;
  private lastAt: Record<string, number> = {};

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

  private throttle(key: string, gapMs: number): boolean {
    const now = performance.now();
    if (now - (this.lastAt[key] || 0) < gapMs) return false;
    this.lastAt[key] = now;
    return true;
  }

  playBananaClick(combo: number, isCrit: boolean): void {
    if (monkeyAudio.isMuted()) return;
    if (!this.throttle('tap', 32)) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const pitchBoost = Math.min(480, combo * 8);
    const base = isCrit ? 620 + pitchBoost : 340 + pitchBoost;
    this.tone(ctx, isCrit ? 'triangle' : 'sine', base, base * 1.45, 0.065, isCrit ? 0.16 : 0.11);
    if (isCrit) {
      this.tone(ctx, 'triangle', base * 1.5, base * 2, 0.08, 0.1, 0.03);
    }
  }

  playBuy(): void {
    monkeyAudio.play('coin', 0.22);
  }

  playGolden(): void {
    if (monkeyAudio.isMuted()) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const notes = [659.25, 880, 1174.66, 1567.98];
    notes.forEach((f, i) => {
      this.tone(ctx, 'triangle', f, f * 1.03, 0.14, 0.14, i * 0.055);
    });
  }

  playAchievement(): void {
    monkeyAudio.play('fanfare', 0.22);
  }

  playChaosStart(isGood: boolean): void {
    if (isGood) {
      monkeyAudio.play('screech', 0.18);
    } else {
      monkeyAudio.play('rage', 0.24);
    }
  }

  playSlap(): void {
    monkeyAudio.play('slap', 0.22);
  }

  playChaosDefeat(): void {
    monkeyAudio.play('boing', 0.25);
    monkeyAudio.play('fanfare', 0.2);
  }

  playPrestige(): void {
    monkeyAudio.play('explosion', 0.2);
    monkeyAudio.play('fanfare', 0.28);
  }

  playUiClick(): void {
    monkeyAudio.play('click', 0.16);
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    vol: number,
    delay = 0,
  ): void {
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
}

export const clickerAudio = new ClickerAudio();
