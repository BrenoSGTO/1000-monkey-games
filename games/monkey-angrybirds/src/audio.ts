import { monkeyAudio } from '@monkey-slop/sdk';
import type { MonkeyKind, TauntSoundKind } from './types';

class AngryMonkeysAudio {
  private ctx: AudioContext | null = null;
  private lastStretchTime = 0;

  private getCtx(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.ctx = new Ctx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playStretch(ratio: number): void {
    const nowMs = performance.now();
    if (nowMs - this.lastStretchTime < 120) return;
    this.lastStretchTime = nowMs;

    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    const base = 130 + ratio * 160;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.linearRampToValueAtTime(base + 30, now + 0.05);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  playLaunch(): void {
    monkeyAudio.play('boing', 0.28);
    monkeyAudio.play('screech', 0.16);
  }

  playPower(kind: MonkeyKind): void {
    switch (kind) {
      case 'normal':
        monkeyAudio.play('rage', 0.25);
        break;
      case 'triple':
        monkeyAudio.play('banana', 0.28);
        this.playChirp(680, 1280, 0.11);
        break;
      case 'bomb':
        // Fuse ignition chirp; executeExplosion plays the actual boom
        this.playChirp(320, 920, 0.09);
        break;
      case 'tank':
        this.playChirp(420, 75, 0.22);
        break;
      case 'boomerang':
        this.playWhoosh();
        break;
      case 'bomber':
        // Egg/coconut drop whistle + upward pop
        monkeyAudio.play('boing', 0.22);
        this.playChirp(860, 260, 0.22);
        break;
    }
  }

  playExplosion(): void {
    monkeyAudio.play('explosion', 0.44);
  }

  playTaunt(sound: TauntSoundKind = 'screech'): void {
    monkeyAudio.play(sound, 0.28);
  }

  playTurnBell(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    this.tone(ctx, 'triangle', 523.25, 659.25, 0.12, 0.14);
  }

  playImpact(material: 'glass' | 'wood' | 'stone' | 'tnt', intensity: number): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const vol = Math.min(0.32, Math.max(0.05, intensity * 0.018));

    if (material === 'glass') {
      this.noise(ctx, vol, 0.11, 3600, 'highpass');
      this.tone(ctx, 'sine', 1650 + Math.random() * 600, 950, 0.08, vol * 0.7);
    } else if (material === 'wood') {
      this.noise(ctx, vol, 0.09, 1100, 'bandpass');
      this.tone(ctx, 'triangle', 260 + Math.random() * 90, 90, 0.08, vol * 0.8);
    } else if (material === 'stone') {
      this.noise(ctx, vol * 0.9, 0.12, 460, 'lowpass');
      this.tone(ctx, 'sine', 120, 48, 0.11, vol * 0.85);
    } else {
      monkeyAudio.play('slap', vol);
    }
  }

  playBreak(material: 'glass' | 'wood' | 'stone' | 'tnt'): void {
    if (material === 'tnt') {
      // executeExplosion plays the boom without double triggering
      return;
    }
    const ctx = this.getCtx();
    if (!ctx) return;
    if (material === 'glass') {
      this.noise(ctx, 0.22, 0.18, 4200, 'highpass');
      this.tone(ctx, 'sine', 2200, 1300, 0.12, 0.14);
      this.tone(ctx, 'sine', 2750, 1700, 0.1, 0.12);
    } else if (material === 'wood') {
      this.noise(ctx, 0.24, 0.16, 1300, 'bandpass');
      this.tone(ctx, 'square', 220, 70, 0.12, 0.14);
    } else {
      this.noise(ctx, 0.28, 0.22, 500, 'lowpass');
      this.tone(ctx, 'sawtooth', 140, 42, 0.18, 0.18);
    }
  }

  playEnemyDefeat(): void {
    monkeyAudio.play('slap', 0.26);
    monkeyAudio.play('coin', 0.2);
  }

  playVictory(): void {
    monkeyAudio.play('fanfare', 0.3);
  }

  playDefeat(): void {
    monkeyAudio.play('rage', 0.26);
  }

  playStar(index: number): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const freqs = [587.33, 783.99, 1046.5];
    const f = freqs[Math.min(2, index)];
    this.tone(ctx, 'triangle', f, f * 1.15, 0.22, 0.22);
  }

  private playChirp(start: number, end: number, dur: number): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    this.tone(ctx, 'sawtooth', start, end, dur, 0.18);
  }

  private playWhoosh(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    this.noise(ctx, 0.2, 0.22, 1600, 'bandpass');
    this.tone(ctx, 'sine', 300, 740, 0.18, 0.15);
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    volume: number,
  ): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noise(
    ctx: AudioContext,
    volume: number,
    duration: number,
    freq: number,
    filterType: BiquadFilterType,
  ): void {
    const now = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }
}

export const gameAudio = new AngryMonkeysAudio();
