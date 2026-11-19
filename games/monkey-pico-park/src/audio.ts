import { monkeyAudio } from '@monkey-slop/sdk';

class PicoAudioEngine {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext | null {
    if (monkeyAudio.isMuted() || typeof window === 'undefined') return null;
    if (!this.ctx) {
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

  private beep(
    type: OscillatorType,
    f1: number,
    f2: number,
    dur: number,
    vol = 0.14,
    delay = 0,
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, f1), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  jump(pitchBias = 0): void {
    const base = 260 + pitchBias * 28;
    this.beep('triangle', base, base * 1.95, 0.11, 0.14);
  }

  stackLand(): void {
    this.beep('sine', 420, 620, 0.07, 0.11);
    this.beep('triangle', 220, 170, 0.06, 0.08, 0.02);
  }

  buttonOn(): void {
    this.beep('square', 440, 660, 0.07, 0.08);
  }

  buttonOff(): void {
    this.beep('square', 420, 260, 0.06, 0.06);
  }

  switchMonkey(): void {
    this.beep('triangle', 520, 780, 0.06, 0.11);
  }

  followToggle(active: boolean): void {
    if (active) {
      this.beep('triangle', 480, 720, 0.07, 0.11);
      this.beep('triangle', 720, 960, 0.09, 0.11, 0.06);
    } else {
      this.beep('triangle', 600, 380, 0.08, 0.11);
    }
  }

  keyGrab(): void {
    monkeyAudio.play('banana', 0.24);
  }

  fakeKey(): void {
    monkeyAudio.play('rage', 0.22);
    this.beep('sawtooth', 320, 110, 0.22, 0.12, 0.05);
  }

  doorOpen(): void {
    this.beep('triangle', 523, 659, 0.09, 0.14);
    this.beep('triangle', 659, 784, 0.09, 0.14, 0.07);
    this.beep('triangle', 784, 1046, 0.16, 0.16, 0.14);
  }

  doorEnter(): void {
    monkeyAudio.play('coin', 0.18);
  }

  shout(): void {
    monkeyAudio.play('screech', 0.16);
  }

  die(): void {
    monkeyAudio.play('slap', 0.22);
    this.beep('sawtooth', 300, 90, 0.25, 0.14, 0.04);
  }

  levelWin(): void {
    monkeyAudio.play('fanfare', 0.26);
  }

  click(): void {
    monkeyAudio.play('click', 0.16);
  }
}

export const picoAudio = new PicoAudioEngine();
