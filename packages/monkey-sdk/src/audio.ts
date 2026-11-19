const MUTE_KEY = 'monkey-slop:muted';

export type MonkeySoundName =
  | 'banana'
  | 'screech'
  | 'boing'
  | 'slap'
  | 'explosion'
  | 'fanfare'
  | 'rage'
  | 'click'
  | 'coin';

class MonkeyAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(next: boolean): void {
    this.muted = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  play(sound: MonkeySoundName, volume = 0.25): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume)), now);
    master.connect(ctx.destination);

    switch (sound) {
      case 'click': {
        this.tone(ctx, master, 'square', 620, 420, now, 0.05);
        break;
      }
      case 'coin':
      case 'banana': {
        this.tone(ctx, master, 'triangle', 520, 780, now, 0.09);
        this.tone(ctx, master, 'triangle', 780, 1180, now + 0.08, 0.12);
        break;
      }
      case 'boing': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(170, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.14);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.28);
        g.gain.setValueAtTime(0.8, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 0.32);
        break;
      }
      case 'screech': {
        // Chaotic monkey "UUU-AAA-AAA!"
        this.tone(ctx, master, 'sawtooth', 420, 880, now, 0.09);
        this.tone(ctx, master, 'sawtooth', 840, 520, now + 0.1, 0.09);
        this.tone(ctx, master, 'sawtooth', 500, 1080, now + 0.2, 0.12);
        break;
      }
      case 'slap': {
        this.noiseBurst(ctx, master, now, 0.09, 1400);
        this.tone(ctx, master, 'triangle', 260, 80, now, 0.09);
        break;
      }
      case 'explosion': {
        this.noiseBurst(ctx, master, now, 0.42, 420);
        this.tone(ctx, master, 'sawtooth', 140, 32, now, 0.38);
        break;
      }
      case 'rage': {
        this.tone(ctx, master, 'sawtooth', 310, 110, now, 0.18);
        this.tone(ctx, master, 'square', 220, 75, now + 0.16, 0.26);
        break;
      }
      case 'fanfare': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
          this.tone(ctx, master, 'triangle', freq, freq * 1.01, now + i * 0.09, 0.18);
        });
        break;
      }
    }
  }

  private tone(
    ctx: AudioContext,
    dest: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
    g.gain.setValueAtTime(0.65, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g);
    g.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private noiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    filterFreq: number,
  ): void {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, startTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }
}

export const monkeyAudio = new MonkeyAudioEngine();
