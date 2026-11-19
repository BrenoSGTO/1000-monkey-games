import { monkeyAudio } from '@monkey-slop/sdk';

class AmongUsAudio {
  private ctx: AudioContext | null = null;
  private lastAlarmAt = 0;

  private ensureCtx(): AudioContext | null {
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
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    vol = 0.22,
    delay = 0,
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  playClick(): void {
    monkeyAudio.play('click', 0.2);
  }

  playTaskComplete(): void {
    monkeyAudio.play('banana', 0.25);
    this.tone(880, 1320, 0.14, 'sine', 0.18, 0.08);
  }

  playKill(): void {
    monkeyAudio.play('slap', 0.35);
    monkeyAudio.play('screech', 0.28);
    this.tone(180, 48, 0.32, 'sawtooth', 0.28, 0.02);
  }

  playVent(): void {
    this.tone(190, 85, 0.14, 'square', 0.16, 0);
    this.tone(110, 260, 0.14, 'triangle', 0.14, 0.07);
  }

  playReport(): void {
    monkeyAudio.play('rage', 0.3);
    this.tone(540, 820, 0.18, 'sawtooth', 0.25, 0);
    this.tone(820, 540, 0.22, 'sawtooth', 0.25, 0.18);
  }

  playEmergency(): void {
    this.tone(440, 880, 0.2, 'square', 0.22, 0);
    this.tone(880, 440, 0.2, 'square', 0.22, 0.2);
    this.tone(440, 880, 0.2, 'square', 0.22, 0.4);
  }

  playSabotagePulse(nowMs: number): void {
    if (nowMs - this.lastAlarmAt < 1100) return;
    this.lastAlarmAt = nowMs;
    this.tone(520, 390, 0.22, 'sawtooth', 0.14, 0);
  }

  playVote(): void {
    this.tone(600, 760, 0.09, 'triangle', 0.18, 0);
  }

  playEject(wasImpostor: boolean): void {
    this.tone(480, 90, 0.9, 'sine', 0.24, 0);
    if (wasImpostor) {
      this.tone(523, 784, 0.25, 'triangle', 0.22, 1.0);
    } else {
      this.tone(240, 140, 0.35, 'sawtooth', 0.18, 1.0);
    }
  }

  playVictory(crewWon: boolean): void {
    if (crewWon) {
      monkeyAudio.play('fanfare', 0.3);
    } else {
      monkeyAudio.play('rage', 0.32);
      this.tone(160, 55, 0.5, 'sawtooth', 0.25, 0.15);
    }
  }

  playScannerBeep(): void {
    this.tone(920, 1080, 0.08, 'sine', 0.12, 0);
  }

  playError(): void {
    this.tone(210, 130, 0.18, 'sawtooth', 0.2, 0);
  }
}

export const sfx = new AmongUsAudio();
