import { monkeyAudio } from '@monkey-slop/sdk';
import type { PowerUpType } from './types';

class FlappyAudioEngine {
  private ctx: AudioContext | null = null;

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

  private tone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    vol = 0.14,
    delay = 0,
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  flap(playerIndex = 0): void {
    const base = playerIndex === 0 ? 290 : 360;
    this.tone('triangle', base, base * 1.9, 0.085, 0.12);
    this.tone('sine', base * 0.65, base * 1.1, 0.06, 0.06, 0.015);
  }

  score(points: number): void {
    const pitchBoost = Math.min(200, points * 4);
    this.tone('sine', 640 + pitchBoost, 660 + pitchBoost, 0.06, 0.11);
    this.tone('triangle', 960 + pitchBoost, 990 + pitchBoost, 0.1, 0.11, 0.055);
  }

  coin(streak = 0): void {
    const step = Math.min(6, streak) * 55;
    this.tone('triangle', 760 + step, 1140 + step, 0.07, 0.12);
    this.tone('sine', 1180 + step, 1560 + step, 0.09, 0.1, 0.05);
  }

  nearMiss(): void {
    this.tone('sine', 920, 1480, 0.09, 0.11);
    this.tone('triangle', 1240, 1760, 0.1, 0.09, 0.04);
  }

  powerup(type: PowerUpType): void {
    if (type === 'magnet') {
      this.tone('sine', 360, 720, 0.12, 0.13);
      this.tone('triangle', 540, 1080, 0.16, 0.13, 0.08);
    } else if (type === 'shield') {
      this.tone('triangle', 280, 440, 0.1, 0.15);
      this.tone('sine', 440, 660, 0.15, 0.14, 0.08);
    } else {
      // turbo
      this.tone('sawtooth', 240, 920, 0.22, 0.11);
      this.tone('square', 480, 1240, 0.2, 0.08, 0.06);
    }
  }

  shieldBreak(): void {
    monkeyAudio.play('slap', 0.28);
    this.tone('triangle', 520, 180, 0.18, 0.16);
  }

  turboSmash(): void {
    monkeyAudio.play('explosion', 0.18);
  }

  biomeChange(): void {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      this.tone('triangle', n, n * 1.02, 0.15, 0.11, idx * 0.07);
    });
  }

  crash(): void {
    monkeyAudio.play('slap', 0.3);
    monkeyAudio.play('screech', 0.2);
    this.tone('sawtooth', 260, 75, 0.32, 0.12, 0.04);
  }

  bounce(): void {
    this.tone('sine', 160, 95, 0.09, 0.11);
  }

  horn(pitchShift = 0): void {
    const f = 410 + pitchShift * 40;
    this.tone('sawtooth', f, f * 1.24, 0.11, 0.12);
    this.tone('sawtooth', f * 1.25, f * 0.96, 0.14, 0.12, 0.1);
  }

  countdown(isGo: boolean): void {
    if (isGo) {
      this.tone('triangle', 587.33, 880, 0.22, 0.16);
    } else {
      this.tone('sine', 440, 440, 0.11, 0.12);
    }
  }
}

export const flappyAudio = new FlappyAudioEngine();
