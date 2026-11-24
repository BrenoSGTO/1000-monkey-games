import { monkeyAudio } from '@monkey-slop/sdk';
import type { Theme } from './tracks';
import { clamp } from './util';

interface EngineVoice {
  o1: OscillatorNode;
  o2: OscillatorNode;
  g: GainNode;
  filt: BiquadFilterNode;
  noise: AudioBufferSourceNode;
  ng: GainNode;
  nf: BiquadFilterNode;
  pan: StereoPannerNode | null;
}

interface MusicDef {
  bpm: number;
  root: number;
  scale: number[];
  bass: (number | null)[];
  lead: (number | null)[];
  wave: OscillatorType;
  swing: number;
}

const MUSIC: Record<Theme | 'menu', MusicDef> = {
  jungle: { bpm: 132, root: 110, scale: [0, 2, 4, 7, 9, 12], bass: [0, null, 0, null, 3, null, 0, null, 2, null, 2, null, 4, null, 3, 2], lead: [5, null, 3, null, 4, null, 2, 3, 5, null, 4, null, 3, null, 1, null], wave: 'triangle', swing: 0 },
  favela: { bpm: 104, root: 98, scale: [0, 3, 5, 7, 10, 12], bass: [0, null, null, 0, null, 2, null, 0, 3, null, null, 3, null, 2, null, 4], lead: [null, 4, null, 5, null, 3, null, null, 2, null, 3, null, 4, null, null, 5], wave: 'square', swing: 0.2 },
  beach: { bpm: 114, root: 123, scale: [0, 2, 4, 7, 9, 12], bass: [0, null, null, null, 2, null, null, null, 3, null, null, null, 2, null, 4, null], lead: [null, null, 4, null, null, 5, null, 3, null, null, 4, null, 2, null, 3, null], wave: 'sine', swing: 0.12 },
  space: { bpm: 146, root: 82, scale: [0, 3, 5, 7, 10, 12], bass: [0, 0, null, 0, 0, null, 0, 0, 3, 3, null, 3, 2, 2, null, 2], lead: [0, 2, 4, 5, 4, 2, 0, 2, 3, 5, 4, 3, 2, 0, 2, 4], wave: 'sawtooth', swing: 0 },
  menu: { bpm: 120, root: 110, scale: [0, 2, 4, 7, 9, 12], bass: [0, null, null, 0, 2, null, null, 2, 3, null, null, 3, 2, null, 4, null], lead: [4, null, 3, 5, null, 3, null, 2, 4, null, 5, null, 3, null, 2, null], wave: 'triangle', swing: 0.1 },
};

class KartAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private engines: EngineVoice[] = [];
  private driftNode: { src: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode }[] = [];
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private nextNoteTime = 0;
  private musicDef: MusicDef | null = null;
  private musicOn = false;

  private ensure(): AudioContext | null {
    if (monkeyAudio.isMuted()) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    this.ensure();
  }

  // ------------------------------------------------------------- engines
  startEngines(count: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    this.stopEngines();
    for (let i = 0; i < count; i++) {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0;
      o1.connect(filt);
      o2.connect(filt);
      filt.connect(g);
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuf;
      noise.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.value = 0;
      noise.connect(nf);
      nf.connect(ng);
      let pan: StereoPannerNode | null = null;
      if (ctx.createStereoPanner) {
        pan = ctx.createStereoPanner();
        pan.pan.value = count === 2 ? (i === 0 ? -0.6 : 0.6) : 0;
        g.connect(pan);
        ng.connect(pan);
        pan.connect(this.sfxGain);
      } else {
        g.connect(this.sfxGain);
        ng.connect(this.sfxGain);
      }
      o1.start();
      o2.start();
      noise.start();
      this.engines.push({ o1, o2, g, filt, noise, ng, nf, pan });

      const dsrc = ctx.createBufferSource();
      dsrc.buffer = this.noiseBuf;
      dsrc.loop = true;
      const df = ctx.createBiquadFilter();
      df.type = 'bandpass';
      df.frequency.value = 2400;
      df.Q.value = 3;
      const dg = ctx.createGain();
      dg.gain.value = 0;
      dsrc.connect(df);
      df.connect(dg);
      if (pan) dg.connect(pan);
      else dg.connect(this.sfxGain);
      dsrc.start();
      this.driftNode.push({ src: dsrc, g: dg, f: df });
    }
  }

  stopEngines(): void {
    for (const e of this.engines) {
      try {
        e.o1.stop();
        e.o2.stop();
        e.noise.stop();
      } catch {
        // ignore
      }
      e.g.disconnect();
      e.ng.disconnect();
    }
    for (const d of this.driftNode) {
      try {
        d.src.stop();
      } catch {
        // ignore
      }
      d.g.disconnect();
    }
    this.engines = [];
    this.driftNode = [];
  }

  updateEngine(slot: number, speedRatio: number, throttle: number, boosting: boolean, driftLvl: number, offroad: boolean, drifting: boolean): void {
    const e = this.engines[slot];
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const muted = monkeyAudio.isMuted();
    const sr = clamp(speedRatio, 0, 1.6);
    const base = 48 + sr * 120 + (boosting ? 26 : 0);
    e.o1.frequency.setTargetAtTime(base, t, 0.05);
    e.o2.frequency.setTargetAtTime(base * 0.503 + (boosting ? 6 : 0), t, 0.05);
    e.filt.frequency.setTargetAtTime(380 + sr * 1100 + throttle * 500, t, 0.08);
    e.g.gain.setTargetAtTime(muted ? 0 : 0.045 + sr * 0.035 + throttle * 0.02, t, 0.08);
    e.ng.gain.setTargetAtTime(muted ? 0 : (offroad ? 0.06 : 0.012) * clamp(sr * 1.5, 0, 1) + (boosting ? 0.05 : 0), t, 0.1);
    e.nf.frequency.setTargetAtTime(offroad ? 500 : 1400 + sr * 800, t, 0.1);
    const d = this.driftNode[slot];
    if (d) {
      d.g.gain.setTargetAtTime(muted ? 0 : drifting ? 0.05 + driftLvl * 0.012 : 0, t, 0.04);
      d.f.frequency.setTargetAtTime(2000 + driftLvl * 500, t, 0.05);
    }
  }

  // ----------------------------------------------------------------- sfx
  private tone(type: OscillatorType, f0: number, f1: number, start: number, dur: number, vol: number, dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g);
    g.connect(dest ?? this.sfxGain);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || !this.noiseBuf) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    s.start(start, Math.random());
    s.stop(start + dur + 0.02);
  }

  sfx(name: string, vol = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = vol;
    switch (name) {
      case 'count':
        this.tone('square', 440, 440, t, 0.18, 0.12 * v);
        break;
      case 'go':
        this.tone('square', 880, 880, t, 0.5, 0.14 * v);
        this.tone('triangle', 1320, 1320, t, 0.5, 0.1 * v);
        break;
      case 'pickup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f * 1.02, t + i * 0.05, 0.12, 0.12 * v));
        break;
      case 'itemget':
        this.tone('square', 700, 1400, t, 0.1, 0.08 * v);
        this.tone('square', 1400, 1800, t + 0.1, 0.16, 0.08 * v);
        break;
      case 'roulette':
        this.tone('square', 900 + Math.random() * 400, 700, t, 0.04, 0.05 * v);
        break;
      case 'throw':
        this.tone('sine', 220, 520, t, 0.16, 0.14 * v);
        this.noise(t, 0.12, 1800, 0.06 * v);
        break;
      case 'drop':
        this.tone('sine', 420, 180, t, 0.14, 0.14 * v);
        break;
      case 'guarana':
        this.noise(t, 0.6, 1400, 0.12 * v, 'bandpass');
        this.tone('sawtooth', 160, 640, t, 0.5, 0.1 * v);
        break;
      case 'hit':
        this.noise(t, 0.12, 1200, 0.16 * v);
        this.tone('sine', 260, 90, t, 0.25, 0.2 * v);
        this.tone('sawtooth', 500, 900, t + 0.05, 0.12, 0.08 * v);
        break;
      case 'explode':
        this.noise(t, 0.5, 500, 0.3 * v);
        this.tone('sawtooth', 160, 36, t, 0.45, 0.22 * v);
        break;
      case 'sting':
        for (let i = 0; i < 6; i++) this.tone('sawtooth', 280 + i * 15, 300 + i * 20, t + i * 0.05, 0.1, 0.05 * v);
        this.tone('sine', 300, 100, t, 0.3, 0.15 * v);
        break;
      case 'whack':
        this.noise(t, 0.08, 1800, 0.22 * v, 'highpass');
        this.tone('triangle', 300, 100, t, 0.12, 0.2 * v);
        break;
      case 'cough':
        for (let i = 0; i < 3; i++) this.noise(t + i * 0.1, 0.07, 600, 0.12 * v);
        this.tone('square', 120, 70, t, 0.3, 0.06 * v);
        break;
      case 'pad':
        this.noise(t, 0.4, 2200, 0.14 * v, 'bandpass');
        this.tone('sawtooth', 220, 880, t, 0.35, 0.09 * v);
        break;
      case 'miniturbo':
        this.noise(t, 0.35, 2600, 0.12 * v, 'bandpass');
        this.tone('square', 300, 900, t, 0.25, 0.08 * v);
        break;
      case 'level':
        this.tone('triangle', 1100, 1500, t, 0.08, 0.08 * v);
        break;
      case 'bump':
        this.tone('square', 140, 60, t, 0.1, 0.12 * v);
        this.noise(t, 0.08, 900, 0.08 * v);
        break;
      case 'ricochet':
        this.tone('triangle', 1000, 600, t, 0.07, 0.07 * v);
        break;
      case 'fall':
        this.tone('sine', 900, 120, t, 0.9, 0.16 * v);
        break;
      case 'splash':
        this.noise(t, 0.2, 900, 0.09 * v, 'bandpass');
        break;
      case 'lap':
        [660, 880, 1100].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.08, 0.14, 0.1 * v));
        break;
      case 'finish':
        [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f * 1.01, t + i * 0.1, 0.2, 0.13 * v));
        break;
      case 'rocket':
        this.noise(t, 0.6, 1800, 0.16 * v, 'bandpass');
        this.tone('sawtooth', 120, 700, t, 0.5, 0.1 * v);
        break;
      case 'screech':
        monkeyAudio.play('screech', 0.12 * v);
        break;
      case 'wrong':
        this.tone('square', 220, 180, t, 0.12, 0.06 * v);
        break;
      case 'click':
        monkeyAudio.play('click');
        break;
    }
  }

  // --------------------------------------------------------------- music
  startMusic(theme: Theme | 'menu'): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    this.stopMusic();
    this.musicDef = MUSIC[theme];
    this.musicStep = 0;
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.musicOn = true;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 40);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    const def = this.musicDef;
    if (!ctx || !def || !this.musicOn || !this.musicGain) return;
    if (monkeyAudio.isMuted()) {
      this.nextNoteTime = ctx.currentTime + 0.1;
      return;
    }
    const spStep = 60 / def.bpm / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.18) {
      const s = this.musicStep % 16;
      const swing = s % 2 ? def.swing * spStep : 0;
      const t = this.nextNoteTime + swing;
      const bar = Math.floor(this.musicStep / 16) % 4;
      const trans = [0, 0, 5, 3][bar];
      const semi = (deg: number) => def.scale[deg % def.scale.length] + Math.floor(deg / def.scale.length) * 12;
      const hz = (root: number, deg: number, oct: number) => root * Math.pow(2, (semi(deg) + trans) / 12) * oct;
      const b = def.bass[s];
      if (b !== null) this.musicNote('sawtooth', hz(def.root, b, 1), t, spStep * 1.8, 0.1, 500);
      const l = def.lead[s];
      if (l !== null) this.musicNote(def.wave, hz(def.root, l, 4), t, spStep * 1.4, 0.045, 3000);
      // drums
      if (s % 4 === 0) this.musicDrum(t, 'kick');
      if (s === 4 || s === 12) this.musicDrum(t, 'snare');
      if (s % 2 === 1) this.musicDrum(t, 'hat');
      this.nextNoteTime += spStep;
      this.musicStep++;
    }
  }

  private musicNote(type: OscillatorType, f: number, t: number, dur: number, vol: number, cutoff: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl);
    fl.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private musicDrum(t: number, kind: 'kick' | 'snare' | 'hat'): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.noiseBuf) return;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.16);
    } else {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(kind === 'hat' ? 0.035 : 0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'hat' ? 0.04 : 0.12));
      s.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      s.start(t, Math.random());
      s.stop(t + 0.15);
    }
  }
}

export const kartAudio = new KartAudio();
