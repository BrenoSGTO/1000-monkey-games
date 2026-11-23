import { monkeyAudio } from '@monkey-slop/sdk';

class TetrisAudioEngine {
  private ctx: AudioContext | null = null;
  private bgmEnabled = true;
  private bgmTimer: number | null = null;
  private stepIdx = 0;
  private dangerMode = false;
  private playing = false;

  // Catchy original tropical-chiptune bass + marimba notes (in Hz)
  private readonly melodyNotes = [
    523.25, 0, 659.25, 783.99, 659.25, 0, 587.33, 523.25,
    440.0, 523.25, 659.25, 0, 587.33, 523.25, 493.88, 0,
    523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 659.25,
    523.25, 0, 392.0, 440.0, 523.25, 0, 523.25, 0,
  ];
  private readonly bassNotes = [
    130.81, 0, 196.0, 0, 146.83, 0, 196.0, 0,
    110.0, 0, 164.81, 0, 123.47, 0, 196.0, 0,
    130.81, 0, 196.0, 0, 174.61, 0, 164.81, 0,
    146.83, 0, 196.0, 0, 130.81, 0, 196.0, 0,
  ];

  private ensureContext(): AudioContext | null {
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

  public isMusicEnabled(): boolean {
    return this.bgmEnabled;
  }

  public toggleMusic(): boolean {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopMusic();
    } else if (this.playing) {
      this.startMusic();
    }
    return this.bgmEnabled;
  }

  public setDangerMode(danger: boolean): void {
    if (this.dangerMode !== danger) {
      this.dangerMode = danger;
      if (this.bgmTimer !== null) {
        this.restartBgmInterval();
      }
    }
  }

  public startMusic(): void {
    this.playing = true;
    if (!this.bgmEnabled) return;
    if (this.bgmTimer !== null) return;
    this.stepIdx = 0;
    this.restartBgmInterval();
  }

  public stopMusic(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public setMatchActive(active: boolean): void {
    this.playing = active;
    if (active && this.bgmEnabled) {
      this.startMusic();
    } else if (!active) {
      this.stopMusic();
    }
  }

  private restartBgmInterval(): void {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
    }
    const intervalMs = this.dangerMode ? 128 : 168;
    this.bgmTimer = window.setInterval(() => {
      if (!this.playing || !this.bgmEnabled || monkeyAudio.isMuted()) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const idx = this.stepIdx % this.melodyNotes.length;
      const mel = this.melodyNotes[idx];
      const bass = this.bassNotes[idx];
      const now = ctx.currentTime;
      const pitchShift = this.dangerMode ? 1.05946 : 1;

      if (mel > 0) {
        this.playTone(ctx, 'triangle', mel * pitchShift, mel * pitchShift * 0.995, now, 0.11, 0.045);
      }
      if (bass > 0) {
        this.playTone(ctx, 'square', bass * pitchShift, bass * pitchShift * 0.98, now, 0.13, 0.032);
      }
      this.stepIdx++;
    }, intervalMs);
  }

  public move(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(ctx, 'triangle', 320, 260, now, 0.035, 0.07);
  }

  public rotate(isTSpinCandidate = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (isTSpinCandidate) {
      this.playTone(ctx, 'triangle', 460, 740, now, 0.06, 0.1);
    } else {
      this.playTone(ctx, 'sine', 380, 560, now, 0.05, 0.08);
    }
  }

  public softDrop(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(ctx, 'sine', 210, 170, now, 0.025, 0.04);
  }

  public hardDrop(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(ctx, 'triangle', 190, 62, now, 0.1, 0.22);
    this.playTone(ctx, 'sine', 420, 180, now, 0.06, 0.09);
  }

  public hold(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(ctx, 'triangle', 480, 680, now, 0.07, 0.09);
  }

  public lineClear(lines: number, combo: number, isTSpin: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const comboMult = Math.pow(1.06, Math.min(combo, 10));

    if (lines >= 4 || isTSpin) {
      monkeyAudio.play('fanfare', 0.24);
      const chord = [523.25, 659.25, 783.99, 1046.5];
      chord.forEach((f, i) => {
        this.playTone(ctx, 'triangle', f * comboMult, f * comboMult * 1.02, now + i * 0.04, 0.2, 0.12);
      });
    } else {
      monkeyAudio.play('banana', 0.2);
      const base = 440 * comboMult;
      for (let i = 0; i < lines + 1; i++) {
        this.playTone(ctx, 'triangle', base * (1 + i * 0.22), base * (1.05 + i * 0.22), now + i * 0.045, 0.12, 0.11);
      }
    }
  }

  public garbageSend(): void {
    monkeyAudio.play('boing', 0.18);
  }

  public garbageIn(): void {
    monkeyAudio.play('slap', 0.24);
  }

  public taunt(): void {
    monkeyAudio.play('screech', 0.22);
  }

  public ko(): void {
    monkeyAudio.play('explosion', 0.28);
    monkeyAudio.play('rage', 0.22);
  }

  public countdown(step: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (step > 0) {
      this.playTone(ctx, 'square', 440, 440, now, 0.12, 0.09);
    } else {
      this.playTone(ctx, 'triangle', 660, 990, now, 0.24, 0.14);
      monkeyAudio.play('banana', 0.18);
    }
  }

  private playTone(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    volume: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), startTime + duration);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export const tetrisAudio = new TetrisAudioEngine();
