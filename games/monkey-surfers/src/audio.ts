import { monkeyAudio } from '@monkey-slop/sdk';

class SurfersAudioEngine {
  private ctx: AudioContext | null = null;
  private musicEnabled = true;
  private musicTimer: number | null = null;
  private stepIndex = 0;
  private comboCount = 0;
  private lastCoinTime = 0;

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

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) {
      this.stopMusic();
    }
    return this.musicEnabled;
  }

  private playTone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    vol = 0.14,
    delay = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(25, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), now + duration);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoise(duration: number, filterFreq: number, vol = 0.14): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  playSwipe(): void {
    this.playTone('sine', 260, 520, 0.08, 0.11);
  }

  playJump(superJump = false): void {
    if (superJump) {
      this.playTone('triangle', 220, 880, 0.22, 0.18);
      this.playTone('sine', 420, 1240, 0.18, 0.12, 0.04);
    } else {
      this.playTone('triangle', 240, 620, 0.14, 0.15);
    }
  }

  playRoll(): void {
    this.playNoise(0.16, 950, 0.16);
    this.playTone('triangle', 340, 140, 0.12, 0.1);
  }

  playCoin(): void {
    const now = performance.now();
    if (now - this.lastCoinTime < 450) {
      this.comboCount = Math.min(10, this.comboCount + 1);
    } else {
      this.comboCount = 0;
    }
    this.lastCoinTime = now;
    const base = 660 + this.comboCount * 48;
    this.playTone('triangle', base, base * 1.45, 0.09, 0.12);
  }

  playPowerup(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => this.playTone('triangle', n, n * 1.04, 0.12, 0.14, idx * 0.05));
  }

  playJetpackIgnite(): void {
    this.playNoise(0.32, 520, 0.2);
    this.playTone('sawtooth', 140, 420, 0.28, 0.13);
  }

  playBoardOn(): void {
    this.playTone('sawtooth', 330, 740, 0.14, 0.14);
    this.playTone('triangle', 660, 990, 0.16, 0.12, 0.06);
  }

  playBoardCrash(): void {
    monkeyAudio.play('explosion', 0.22);
    this.playTone('square', 440, 160, 0.2, 0.14);
  }

  playStumble(): void {
    monkeyAudio.play('slap', 0.28);
    this.playTone('sawtooth', 200, 95, 0.22, 0.18, 0.04);
  }

  playTrainHorn(): void {
    this.playTone('sawtooth', 233, 228, 0.28, 0.11);
    this.playTone('sawtooth', 293, 289, 0.28, 0.1, 0.02);
  }

  playCaught(): void {
    monkeyAudio.play('rage', 0.3);
    this.playNoise(0.25, 400, 0.22);
  }

  playMissionComplete(): void {
    monkeyAudio.play('fanfare', 0.25);
  }

  startMusic(): void {
    if (this.musicTimer !== null || !this.musicEnabled) return;
    const bassNotes = [110, 110, 146.83, 130.81, 98, 98, 130.81, 164.81];
    const leadNotes = [440, 0, 523.25, 587.33, 659.25, 0, 587.33, 523.25];
    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled || monkeyAudio.isMuted()) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      const i = this.stepIndex % 16;
      const bFreq = bassNotes[Math.floor(i / 2) % bassNotes.length];
      if (i % 2 === 0) {
        this.playTone('triangle', bFreq, bFreq * 0.96, 0.12, 0.065);
      }
      if (i % 4 === 2) {
        this.playNoise(0.045, 2600, 0.04);
      }
      const lFreq = leadNotes[i % leadNotes.length];
      if (lFreq > 0 && i % 2 === 1) {
        this.playTone('square', lFreq, lFreq, 0.08, 0.03);
      }
      this.stepIndex++;
    }, 150);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const surfersAudio = new SurfersAudioEngine();
