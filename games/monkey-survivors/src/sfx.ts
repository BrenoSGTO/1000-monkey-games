import { monkeyAudio } from '@monkey-slop/sdk';

class SurvivorsAudio {
  private ctx: AudioContext | null = null;
  private lastPlayed = new Map<string, number>();
  private xpPitchStep = 0;
  private lastXpAt = 0;

  private getCtx(): AudioContext | null {
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

  private canPlay(key: string, minIntervalMs: number): boolean {
    const now = performance.now();
    const prev = this.lastPlayed.get(key) ?? 0;
    if (now - prev < minIntervalMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  xpGem(): void {
    const ctx = this.getCtx();
    if (!ctx || !this.canPlay('xp', 45)) return;
    const nowMs = performance.now();
    if (nowMs - this.lastXpAt < 280) {
      this.xpPitchStep = Math.min(12, this.xpPitchStep + 1);
    } else {
      this.xpPitchStep = 0;
    }
    this.lastXpAt = nowMs;

    const now = ctx.currentTime;
    const freq = 520 * Math.pow(1.055, this.xpPitchStep);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 0.06);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  hit(crit = false): void {
    const ctx = this.getCtx();
    if (!ctx || !this.canPlay('hit', 55)) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = crit ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(crit ? 360 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.05);
    g.gain.setValueAtTime(crit ? 0.11 : 0.07, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  shoot(kind: 'whoosh' | 'zap' | 'pop' | 'shout'): void {
    const ctx = this.getCtx();
    if (!ctx || !this.canPlay(`shoot:${kind}`, 85)) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    if (kind === 'zap') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
      g.gain.setValueAtTime(0.08, now);
    } else if (kind === 'whoosh') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
      g.gain.setValueAtTime(0.08, now);
    } else if (kind === 'shout') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
      g.gain.setValueAtTime(0.11, now);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.04);
      g.gain.setValueAtTime(0.05, now);
    }

    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  explosion(): void {
    if (!this.canPlay('explosion', 120)) return;
    monkeyAudio.play('explosion', 0.18);
  }

  hurt(): void {
    if (!this.canPlay('hurt', 180)) return;
    monkeyAudio.play('rage', 0.18);
  }

  levelUp(): void {
    monkeyAudio.play('fanfare', 0.25);
  }

  chest(): void {
    monkeyAudio.play('fanfare', 0.3);
  }

  bossAlert(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [320, 440, 320, 440].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now + i * 0.13);
      g.gain.setValueAtTime(0.14, now + i * 0.13);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.13 + 0.11);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.13);
      osc.stop(now + i * 0.13 + 0.12);
    });
  }

  revive(): void {
    monkeyAudio.play('banana', 0.28);
  }

  click(): void {
    monkeyAudio.play('click', 0.18);
  }

  victory(): void {
    monkeyAudio.play('fanfare', 0.34);
  }
}

export const sfx = new SurvivorsAudio();
