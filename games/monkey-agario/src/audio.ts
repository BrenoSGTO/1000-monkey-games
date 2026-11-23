import { monkeyAudio } from '@monkey-slop/sdk';

class AgarioAudio {
  private ctx: AudioContext | null = null;
  private lastPelletAt = 0;

  private ensureCtx(): AudioContext | null {
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

  playClick(): void {
    monkeyAudio.play('click', 0.22);
  }

  playPellet(isCacho: boolean): void {
    const nowMs = performance.now();
    if (nowMs - this.lastPelletAt < 48) return;
    this.lastPelletAt = nowMs;

    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isCacho ? 'triangle' : 'sine';
    const base = isCacho ? 660 : 480 + Math.random() * 140;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.45, now + 0.065);
    gain.gain.setValueAtTime(isCacho ? 0.14 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playSplit(): void {
    monkeyAudio.play('boing', 0.22);
  }

  playEject(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(170, now + 0.09);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playEatMonkey(): void {
    monkeyAudio.play('slap', 0.28);
    monkeyAudio.play('banana', 0.2);
  }

  playCactusPop(): void {
    monkeyAudio.play('explosion', 0.3);
    monkeyAudio.play('screech', 0.24);
  }

  playDeath(): void {
    monkeyAudio.play('rage', 0.32);
  }

  playRecord(): void {
    monkeyAudio.play('fanfare', 0.28);
  }
}

export const agarioAudio = new AgarioAudio();
