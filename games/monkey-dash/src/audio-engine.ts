import { monkeyAudio } from '@monkey-slop/sdk';
import type { SongId } from './types';

interface SongPattern {
  kick: number[];
  snare: number[];
  hat: number[];
  bass: number[]; // MIDI note or 0 for rest (32 steps = 2 bars of 16th notes)
  lead: number[]; // MIDI note or 0 for rest
  leadWave: OscillatorType;
  bassWave: OscillatorType;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 32-step (2 bars of 16th notes) procedural chiptune / funk-macaco patterns
const SONGS: Record<SongId, SongPattern> = {
  // 0: Selva Tranquila (120 BPM) — upbeat tropical marimba/chiptune groove
  0: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0,  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1,  1,0,1,0, 1,0,1,0, 1,0,1,0, 1,1,1,0],
    bass:  [36,0,36,0, 43,0,36,0, 39,0,39,0, 43,0,41,0, 36,0,36,0, 43,0,36,0, 41,0,41,0, 43,0,46,0],
    lead:  [60,0,64,0, 67,0,64,67, 72,0,67,0, 64,0,60,0, 62,0,65,0, 69,0,67,0, 65,0,64,0, 62,64,67,0],
    leadWave: 'triangle',
    bassWave: 'square',
  },
  // 1: Bananada Neon (132 BPM) — synthwave funk
  1: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,  1,0,0,1, 1,0,0,0, 1,0,0,0, 1,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,1,0,1],
    hat:   [0,1,1,1, 0,1,1,1, 0,1,1,1, 0,1,1,1,  0,1,1,1, 0,1,1,1, 0,1,1,1, 0,1,1,1],
    bass:  [33,33,0,33, 45,0,33,0, 36,36,0,36, 48,0,36,0, 38,38,0,38, 50,0,38,0, 40,40,0,40, 52,0,43,40],
    lead:  [69,0,72,0, 76,0,72,0, 74,76,72,0, 69,0,64,0, 69,0,72,0, 76,79,76,0, 74,0,72,71, 69,0,72,0],
    leadWave: 'sawtooth',
    bassWave: 'sawtooth',
  },
  // 2: Surto na Faria Lima (145 BPM) — driving acid bass + arps
  2: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0,  1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,1,1],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    bass:  [38,38,50,38, 38,50,38,50, 41,41,53,41, 43,43,55,43, 38,38,50,38, 38,50,41,43, 45,45,57,45, 43,41,40,38],
    lead:  [62,65,69,74, 72,69,65,62, 65,69,72,77, 74,72,69,65, 62,65,69,74, 77,74,72,69, 76,74,72,69, 72,74,76,79],
    leadWave: 'square',
    bassWave: 'sawtooth',
  },
  // 3: MACACO DEMÔNIO (160 BPM) — chaotic double-kick boss chiptune
  3: {
    kick:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,1,1,0,  1,0,1,0, 1,0,1,0, 1,1,1,0, 1,1,1,1],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0,  0,0,0,0, 1,0,0,1, 0,0,0,0, 1,1,1,1],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1,  1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    bass:  [34,34,46,34, 34,46,37,34, 34,34,46,34, 41,41,40,39, 34,34,46,34, 34,46,37,40, 41,41,53,41, 46,44,41,39],
    lead:  [70,73,77,82, 81,77,73,70, 75,78,82,85, 84,82,78,75, 70,73,77,82, 85,82,77,73, 82,84,85,89, 87,85,84,82],
    leadWave: 'sawtooth',
    bassWave: 'square',
  },
  // 4: Baile do Chimpanzé (138 BPM) — Brazilian funk-chiptune tamborzão groove
  4: {
    kick:  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0,  1,0,0,1, 0,0,1,0, 1,0,1,0, 1,1,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,1,0, 0,1,0,0,  0,0,0,0, 1,0,0,0, 0,0,1,0, 1,0,1,1],
    hat:   [1,0,1,1, 1,0,1,0, 1,1,1,0, 1,0,1,1,  1,0,1,1, 1,0,1,0, 1,1,1,0, 1,1,1,1],
    bass:  [40,0,0,40, 47,0,40,0, 43,0,0,43, 45,0,43,0, 40,0,0,40, 47,0,40,0, 48,0,47,0, 45,43,40,0],
    lead:  [64,0,67,69, 71,0,69,67, 64,0,71,0, 72,71,69,67, 64,67,71,0, 76,0,74,71, 72,0,71,69, 67,69,71,0],
    leadWave: 'square',
    bassWave: 'triangle',
  },
  // 5: Macaco Cósmico (152 BPM) — euphoric space synthwave trance
  5: {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,1,  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0,  0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
    hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0,  0,0,1,0, 0,0,1,0, 0,0,1,0, 1,1,1,1],
    bass:  [37,49,37,49, 37,49,37,49, 40,52,40,52, 42,54,42,54, 44,56,44,56, 44,56,44,56, 42,54,40,52, 39,51,37,49],
    lead:  [73,76,80,85, 80,76,73,80, 76,80,83,88, 83,80,76,83, 75,78,82,87, 82,78,75,82, 85,83,80,78, 76,75,73,80],
    leadWave: 'triangle',
    bassWave: 'sawtooth',
  },
};

class DashAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private timerId: number | null = null;

  private isPlaying = false;
  private songId: SongId = 0;
  private bpm = 120;
  private currentStep = 0;
  private nextNoteTime = 0;
  private songStartTime = 0;

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
    if (this.ctx && !this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  unlock(): void {
    this.ensureContext();
  }

  startMusic(songId: SongId, bpm: number, beatOffset = 0): void {
    this.stopMusic();
    this.songId = songId;
    this.bpm = Math.max(80, Math.min(220, bpm));
    this.isPlaying = true;
    this.currentStep = Math.max(0, Math.floor(beatOffset * 4)) % 32;

    const ctx = this.ensureContext();
    if (ctx) {
      this.nextNoteTime = ctx.currentTime + 0.04;
      this.songStartTime = this.nextNoteTime;
    } else {
      this.songStartTime = performance.now() / 1000;
    }

    this.timerId = window.setInterval(() => this.scheduler(), 25);
  }

  stopMusic(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(80, Math.min(220, bpm));
  }

  getBeatPhase(): number {
    const beatDur = 60 / this.bpm;
    if (this.ctx && this.isPlaying && !monkeyAudio.isMuted()) {
      const elapsed = Math.max(0, this.ctx.currentTime - this.songStartTime);
      return (elapsed % beatDur) / beatDur;
    }
    const elapsed = Math.max(0, performance.now() / 1000 - this.songStartTime);
    return (elapsed % beatDur) / beatDur;
  }

  /** Returns 0..1 pulse peaking on every beat */
  getBeatPulse(): number {
    const phase = this.getBeatPhase();
    return Math.pow(Math.max(0, 1 - phase * 1.45), 2);
  }

  getCurrentBeatCount(): number {
    const beatDur = 60 / this.bpm;
    if (this.ctx && this.isPlaying) {
      return Math.max(0, (this.ctx.currentTime - this.songStartTime) / beatDur);
    }
    return Math.max(0, (performance.now() / 1000 - this.songStartTime) / beatDur);
  }

  private scheduler(): void {
    if (!this.isPlaying) return;
    if (monkeyAudio.isMuted()) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.nextNoteTime < ctx.currentTime - 0.1) {
      this.nextNoteTime = ctx.currentTime + 0.02;
    }

    const stepDur = 60 / this.bpm / 4; // 16th note
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.scheduleStep(ctx, this.currentStep, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 32;
    }
  }

  private scheduleStep(ctx: AudioContext, step: number, time: number, stepDur: number): void {
    const song = SONGS[this.songId] ?? SONGS[0];
    if (song.kick[step]) this.triggerKick(ctx, time);
    if (song.snare[step]) this.triggerSnare(ctx, time);
    if (song.hat[step]) this.triggerHat(ctx, time);

    const bassMidi = song.bass[step];
    if (bassMidi > 0) {
      this.triggerSynth(ctx, midiToFreq(bassMidi), time, stepDur * 0.88, song.bassWave, 0.085, 520);
    }

    const leadMidi = song.lead[step];
    if (leadMidi > 0) {
      this.triggerSynth(ctx, midiToFreq(leadMidi), time, stepDur * 0.92, song.leadWave, 0.06, 2600);
    }
  }

  private triggerKick(ctx: AudioContext, time: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.11);
    g.gain.setValueAtTime(0.24, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private triggerSnare(ctx: AudioContext, time: number): void {
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(900, time);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start(time);
      src.stop(time + 0.12);
    }
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, time);
    osc.frequency.exponentialRampToValueAtTime(85, time + 0.07);
    g.gain.setValueAtTime(0.11, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  private triggerHat(ctx: AudioContext, time: number): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(time);
    src.stop(time + 0.04);
  }

  private triggerSynth(
    ctx: AudioContext,
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    cutoff: number,
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  playJump(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.075);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playPad(): void {
    monkeyAudio.play('boing', 0.22);
  }

  playOrb(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.09);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playPortal(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.18);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playCheckpoint(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [660, 880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      g.gain.setValueAtTime(0.11, now + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.13);
    });
  }

  playCountdownBeep(isGo = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    if (isGo) osc.frequency.exponentialRampToValueAtTime(1320, now + 0.14);
    g.gain.setValueAtTime(isGo ? 0.2 : 0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.24 : 0.12));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isGo ? 0.26 : 0.14));
  }

  playBanana(): void {
    monkeyAudio.play('banana', 0.25);
  }

  playDeath(): void {
    monkeyAudio.play('explosion', 0.25);
  }

  playWin(): void {
    monkeyAudio.play('fanfare', 0.28);
  }

  playHorn(): void {
    monkeyAudio.play('screech', 0.3);
  }
}

export const dashAudio = new DashAudioEngine();
