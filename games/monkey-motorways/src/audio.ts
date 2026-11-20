import { monkeyAudio } from '@monkey-slop/sdk';

class MotorwaysAudio {
  private ctx: AudioContext | null = null;
  private lastRoadTick = 0;

  private getCtx(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playRoadDraw(isBridge = false): void {
    const nowMs = performance.now();
    if (nowMs - this.lastRoadTick < 42) return;
    this.lastRoadTick = nowMs;

    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = isBridge ? 'triangle' : 'sine';
    const base = isBridge ? 360 + Math.random() * 60 : 280 + Math.random() * 80;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.045);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  playRoadErase(): void {
    const nowMs = performance.now();
    if (nowMs - this.lastRoadTick < 48) return;
    this.lastRoadTick = nowMs;

    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  playHorn(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const pitch = 390 + Math.random() * 140;
    for (let i = 0; i < 2; i++) {
      const start = t + i * 0.09;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch, start);
      osc.frequency.setValueAtTime(pitch * 1.06, start + 0.03);
      g.gain.setValueAtTime(0.05, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.075);
    }
  }

  playDelivery(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.09);
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  playWarning(urgent = false): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = urgent ? [660, 520, 660] : [540, 440];
    notes.forEach((freq, i) => {
      const start = t + i * 0.1;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(urgent ? 0.065 : 0.045, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.095);
    });
  }

  playPing(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [740, 987.77].forEach((freq, i) => {
      const start = t + i * 0.065;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.07, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  playMilestone(): void {
    monkeyAudio.play('fanfare', 0.25);
    const ctx = this.getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const start = t + i * 0.07;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.08, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  playPlaceTool(): void {
    monkeyAudio.play('boing', 0.16);
  }

  playUpgrade(): void {
    monkeyAudio.play('fanfare', 0.22);
  }

  playSpawnBuilding(): void {
    monkeyAudio.play('banana', 0.15);
  }

  playGameOver(): void {
    monkeyAudio.play('screech', 0.25);
    monkeyAudio.play('explosion', 0.25);
  }
}

export const gameAudio = new MotorwaysAudio();
