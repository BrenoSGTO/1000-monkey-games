// Audio procedural extra (motor, bola, torcida, apito, samba de fundo) sobre o monkeyAudio do SDK.
import { monkeyAudio } from '@monkey-slop/sdk';

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  // motor
  private engOsc: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  // torcida
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  // musica
  private musicOn = false;
  private nextBeat = 0;
  private beatIdx = 0;
  private musicTimer: number | null = null;

  private ensure(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.buildEngine();
      this.buildCrowd();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    this.ensure();
  }

  private buildEngine(): void {
    const ctx = this.ctx!;
    this.engOsc = ctx.createOscillator();
    this.engOsc2 = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc2.type = 'square';
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    this.engOsc.connect(lp);
    this.engOsc2.connect(lp);
    lp.connect(this.engGain);
    this.engGain.connect(this.master!);
    this.engOsc.start();
    this.engOsc2.start();
    // turbo = ruido
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    src.connect(bp);
    bp.connect(this.boostGain);
    this.boostGain.connect(this.master!);
    src.start();
  }

  private buildCrowd(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.frequency.value = 700;
    this.crowdFilter.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter);
    this.crowdFilter.connect(this.crowdGain);
    this.crowdGain.connect(this.master!);
    src.start();
  }

  /** Atualiza motor do carro local + volume da torcida (0..1). */
  update(active: boolean, speed: number, boosting: boolean, crowd: number): void {
    if (!this.ctx || !this.engGain) return;
    const t = this.ctx.currentTime;
    const muted = monkeyAudio.isMuted();
    const on = active && !muted;
    const f = 52 + Math.min(60, speed) * 2.6;
    this.engOsc!.frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc2!.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engGain.gain.setTargetAtTime(on ? 0.045 + Math.min(1, speed / 50) * 0.03 : 0, t, 0.08);
    this.boostGain!.gain.setTargetAtTime(on && boosting ? 0.06 : 0, t, 0.05);
    this.crowdGain!.gain.setTargetAtTime(muted ? 0 : 0.012 + crowd * 0.06, t, 0.2);
    this.crowdFilter!.frequency.setTargetAtTime(500 + crowd * 700, t, 0.3);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, freq: number, vol: number, delay = 0, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.03);
  }

  hit(strength: number): void {
    const s = Math.min(1, strength / 40);
    this.tone('sine', 190 + s * 90, 55, 0.16, 0.25 + s * 0.5);
    this.noise(0.08, 1800, 0.12 + s * 0.3);
    if (s > 0.55) this.tone('triangle', 420, 120, 0.12, 0.2);
  }

  bounce(strength: number): void {
    const s = Math.min(1, strength / 40);
    this.tone('sine', 140, 60, 0.12, 0.1 + s * 0.25);
  }

  jump(): void {
    this.tone('sine', 220, 520, 0.14, 0.2);
  }

  flip(): void {
    this.noise(0.22, 1200, 0.18, 0, 'bandpass');
    this.tone('triangle', 300, 900, 0.2, 0.12);
  }

  pad(big: boolean): void {
    if (big) {
      this.tone('triangle', 520, 1040, 0.12, 0.3);
      this.tone('triangle', 780, 1560, 0.16, 0.3, 0.08);
    } else {
      this.tone('triangle', 880, 1320, 0.07, 0.2);
    }
  }

  beep(final: boolean): void {
    this.tone('square', final ? 880 : 520, final ? 880 : 520, final ? 0.45 : 0.14, 0.2);
  }

  whistle(end: boolean): void {
    const dur = end ? 0.9 : 0.5;
    this.tone('sine', 2300, 2500, dur, 0.22);
    this.tone('sine', 2480, 2380, dur, 0.18);
    this.noise(dur, 3000, 0.05, 0, 'highpass');
  }

  goal(own: boolean): void {
    // buzina + torcida + fanfarra
    this.tone('sawtooth', 190, 185, 0.9, 0.22);
    this.tone('square', 285, 280, 0.9, 0.12);
    this.noise(1.6, 900, 0.35, 0, 'bandpass');
    monkeyAudio.play(own ? 'rage' : 'fanfare', 0.3);
    window.setTimeout(() => monkeyAudio.play(own ? 'slap' : 'screech', 0.25), 260);
    if (!own) window.setTimeout(() => monkeyAudio.play('banana', 0.25), 520);
  }

  explosion(): void {
    monkeyAudio.play('explosion', 0.25);
  }

  // ---- samba de fundo (bem baixinho) ----
  startMusic(): void {
    if (this.musicOn) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.musicOn = true;
    this.nextBeat = ctx.currentTime + 0.1;
    this.beatIdx = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const c = this.ctx;
      if (c && !monkeyAudio.isMuted()) {
        while (this.nextBeat < c.currentTime + 0.25) {
          this.scheduleBeat(this.nextBeat, this.beatIdx++);
          this.nextBeat += 0.125;
        }
      }
      this.musicTimer = window.setTimeout(tick, 80);
    };
    tick();
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) window.clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleBeat(t: number, i: number): void {
    const ctx = this.ctx!;
    const step = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const mk = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master!);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    // surdo
    if (step % 8 === 0 || step % 8 === 6) mk('sine', 110, 50, 0.2, 0.09);
    // chocalho
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(step % 2 === 0 ? 0.03 : 0.015, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + 0.06);
    // agogo
    if ([0, 3, 6, 10, 12].includes(step)) mk('triangle', step % 2 ? 1180 : 880, step % 2 ? 1180 : 880, 0.07, 0.025);
    // baixo
    const roots = [98, 98, 87.3, 110];
    if (step === 0 || step === 7 || step === 10) mk('triangle', roots[bar], roots[bar], 0.22, 0.07);
  }
}

export const gameAudio = new GameAudio();
