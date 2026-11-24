import { PeerRoom, reportGameScore, type MonkeyHudHandle, type PlayerProfile } from '@monkey-slop/sdk';
import { Ctrl, DEFAULT_RULES, STEP_MS, St, type Ev, type Fighter, type MatchConfig, type PlatPos } from './types';
import { CHARS } from './fighters';
import { STAGES, platsAt } from './stages';
import { createWorld, stepFighter, stepWorld, placementOrder, newFighter, type World } from './sim';
import { botInput, createBrain, type Brain } from './ai';
import { Renderer, type RenderView } from './render';
import { UI, type Mode, type ResultData, type Setup } from './ui';
import { bindKeyboard, mountTouchControls, readInput, type Scheme } from './input';
import { SnapBuffer, packWorld, snapToState, unpackFighter, type LobbySlot, type NetMsg, type Snap } from './net';
import { sfx, startMusic, stopMusic } from './sfx';
import { pick } from './fx';

const SLUG = 'monkey-smash';
const INTERP_TICKS = 6;

type Phase = 'menu' | 'battle' | 'results';
type Role = 'local' | 'host' | 'guest';

export class Game {
  private canvas: HTMLCanvasElement;
  private room: PeerRoom<NetMsg>;
  private hud: MonkeyHudHandle | null = null;
  private renderer: Renderer;
  private ui: UI;
  private touch: { show: (v: boolean) => void };

  private phase: Phase = 'menu';
  private role: Role = 'local';
  private cfg: MatchConfig | null = null;
  private world: World | null = null;
  private brains: (Brain | null)[] = [];
  private schemes: (Scheme | null)[] = [];
  private paused = false;
  private acc = 0;
  private last = 0;
  private resultsShown = false;
  private scoreReported = false;

  // rede (host)
  private inQ: number[][] = [];
  private lastBits: number[] = [];
  private consumed: number[] = [];
  private expected: number[] = [];
  private lastInTick: number[] = [];
  private netEvents: Ev[] = [];

  // rede (guest)
  private snapBuf = new SnapBuffer();
  private pred: Fighter | null = null;
  private predTick = 0;
  private hist: number[] = [];
  private localSeq = 0;
  private sentUpTo = 0;
  private mySlot = -1;
  private evQueue: Ev[] = [];
  private errX = 0;
  private errY = 0;
  private lastSnapCount = 0;
  private lastStage = 0;
  private ppTmp: PlatPos[] = [];
  private lastView: RenderView | null = null;

  // lobby online
  private onlineMode = false;

  constructor(canvas: HTMLCanvasElement, room: PeerRoom<NetMsg>) {
    this.canvas = canvas;
    this.room = room;
    this.renderer = new Renderer(canvas);
    bindKeyboard();
    const root = document.getElementById('app') ?? document.body;
    this.touch = mountTouchControls(document.body);
    this.ui = new UI(root, {
      onStart: (s) => this.startFromSetup(s),
      onSetupChange: (s) => this.onSetupChange(s),
      onPickOnline: (c) => this.room.send('ms', { k: 'pick', char: c }),
      onRematch: () => this.rematch(),
      onMenu: () => this.backToSetup(true),
      onResume: () => this.setPaused(false),
      onRestart: () => {
        this.setPaused(false);
        this.rematch();
      },
      onQuit: () => {
        this.setPaused(false);
        this.backToSetup(true, true);
      },
    });
    this.ui.showTitle();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.phase === 'battle') {
        e.preventDefault();
        this.setPaused(!this.paused);
      }
    });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  attachHud(h: MonkeyHudHandle): void {
    this.hud = h;
    // se a URL trouxe ?room= vamos para o lobby online assim que conectar
  }

  // ======================================================================= menu / lobby
  private isOnline(): boolean {
    return this.room.roomCode !== null;
  }

  private amHost(): boolean {
    return this.room.localPlayer.isHost;
  }

  onPlayersChange(players: PlayerProfile[]): void {
    this.hud?.setPlayers(players);
    const me = this.room.localPlayer;
    const connected = players.length > 0 && this.room.roomCode !== null;
    // guest perdeu o host
    if (connected && !me.isHost && !players.some((p) => p.isHost)) {
      this.hud?.toast('O host saiu da sala. Voltando ao menu.', 'chaos');
      this.room.disconnect();
      return;
    }
    if (this.phase === 'battle' && this.role === 'host' && this.world) {
      // converte jogadores que saíram em bots
      this.cfg!.slots.forEach((s, i) => {
        if (s.ctrl === Ctrl.REMOTE && !players.some((p) => p.id === s.peerId)) {
          s.ctrl = Ctrl.BOT;
          s.level = 1;
          s.name = `${s.name} (bot)`;
          const f = this.world!.fighters[i];
          f.ctrl = Ctrl.BOT;
          f.level = 1;
          f.name = s.name;
          this.brains[i] = createBrain(1);
          this.hud?.toast(`${s.name.replace(' (bot)', '')} saiu — um bot assumiu!`, 'chaos');
        }
      });
    }
    if (this.phase === 'battle' && this.role === 'guest' && !connected) {
      this.hud?.toast('Conexão perdida.', 'chaos');
      this.backToSetup(false, true);
      return;
    }
    if (this.phase === 'menu') {
      if (connected && !me.isHost && !this.onlineMode) {
        // entrou por link: abre o lobby online direto
        this.openOnline();
      }
      if (this.onlineMode) {
        if (me.isHost) this.syncHostLobby(players);
        else this.pushOnlineInfo(players);
      }
      if (!connected && this.onlineMode && this.ui.currentSetup().mode === 'online') {
        // desconectou: volta ao modo host local
        this.ui.setOnline({ connected: false, isHost: true, code: null, mySlot: 0 });
      }
    }
  }

  private pushOnlineInfo(players: PlayerProfile[]): void {
    const me = this.room.localPlayer;
    const s = this.ui.currentSetup();
    const my = s.slots.findIndex((x) => x.peerId === me.id);
    this.ui.setOnline({ connected: players.length > 0, isHost: me.isHost, code: this.room.roomCode, mySlot: Math.max(0, my) });
  }

  openOnline(): void {
    this.onlineMode = true;
    this.ui.openSetup('online');
    const players = this.room.getPlayers();
    if (this.amHost()) this.syncHostLobby(players);
    else this.pushOnlineInfo(players);
  }

  /** Host: reconstrói slots remotos a partir do roster e transmite o lobby. */
  private syncHostLobby(players: PlayerProfile[]): void {
    const me = this.room.localPlayer;
    const s = this.ui.currentSetup();
    if (s.mode !== 'online') return;
    s.slots[0].kind = 'human';
    s.slots[0].name = me.name;
    s.slots[0].peerId = me.id;
    // remove quem saiu
    for (const sl of s.slots) {
      if (sl.kind === 'remote' && !players.some((p) => p.id === sl.peerId)) {
        sl.kind = 'off';
        sl.peerId = undefined;
      }
    }
    for (const p of players) {
      if (p.id === me.id || p.isHost) continue;
      let sl = s.slots.find((x) => x.peerId === p.id && x.kind === 'remote');
      if (!sl) {
        const idx = s.slots.findIndex((x, i) => i > 0 && x.kind !== 'remote');
        if (idx < 0) continue;
        sl = s.slots[idx];
        sl.kind = 'remote';
        sl.peerId = p.id;
        sl.char = Math.floor(Math.random() * CHARS.length);
      }
      sl.name = p.name;
    }
    this.ui.setOnline({ connected: players.length > 0, isHost: true, code: this.room.roomCode, mySlot: 0 });
    this.ui.applySetup(s);
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    if (!this.isOnline() || !this.amHost()) return;
    const s = this.ui.currentSetup();
    const slots: LobbySlot[] = s.slots.map((x) => ({ kind: x.kind, char: x.char, level: x.level, name: x.name, peerId: x.peerId }));
    this.room.send('ms', { k: 'lobby', slots, stage: s.stage, rules: s.rules });
  }

  private onSetupChange(s: Setup): void {
    if (s.mode === 'online' && this.amHost()) this.broadcastLobby();
  }

  private backToSetup(broadcast: boolean, quitting = false): void {
    if (broadcast && this.isOnline() && this.amHost()) this.room.send('ms', { k: 'back' });
    this.stopMatch();
    const s = this.ui.currentSetup();
    if (s.slots.length === 0) {
      this.ui.showTitle();
      return;
    }
    void quitting;
    if (s.mode === 'online') {
      this.onlineMode = true;
      this.ui.renderSetup();
      if (this.amHost()) this.syncHostLobby(this.room.getPlayers());
      else this.pushOnlineInfo(this.room.getPlayers());
    } else {
      this.onlineMode = false;
      this.ui.renderSetup();
    }
  }

  // ======================================================================= iniciar partida
  private startFromSetup(s: Setup): void {
    const online = s.mode === 'online';
    const players = this.room.getPlayers();
    const me = this.room.localPlayer;
    const humansLocal = s.slots.filter((x) => x.kind === 'human').length;
    const slots = s.slots
      .filter((x) => x.kind !== 'off')
      .map((x) => ({
        char: x.char,
        ctrl: x.kind === 'human' ? Ctrl.LOCAL : x.kind === 'remote' ? Ctrl.REMOTE : Ctrl.BOT,
        name: x.kind === 'human' ? (online ? me.name : humansLocal > 1 ? 'Jogador' : 'Você') : x.kind === 'remote' ? x.name : `CPU ${['Fácil', 'Médio', 'Difícil'][x.level]}`,
        level: x.level,
        peerId: x.kind === 'remote' ? x.peerId : x.kind === 'human' && online ? me.id : undefined,
      }));
    if (slots.length < 2) return;
    if (!online) {
      let n = 0;
      slots.forEach((sl) => {
        if (sl.ctrl === Ctrl.LOCAL) {
          n++;
          sl.name = humansLocal > 1 ? `P${n}` : 'Você';
        }
      });
    }
    const cfg: MatchConfig = { slots, stage: s.stage, rules: { ...s.rules }, seed: (Math.random() * 1e9) | 0 };
    const hasRemote = online && players.length > 1 && slots.some((x) => x.ctrl === Ctrl.REMOTE);
    if (hasRemote) this.room.send('ms', { k: 'start', cfg });
    this.startMatch(cfg, hasRemote ? 'host' : 'local');
  }

  private rematch(): void {
    if (!this.cfg || this.role === 'guest') return;
    const cfg: MatchConfig = { ...this.cfg, slots: this.cfg.slots.map((s) => ({ ...s })), seed: (Math.random() * 1e9) | 0 };
    if (this.role === 'host') this.room.send('ms', { k: 'start', cfg });
    this.startMatch(cfg, this.role);
  }

  private startMatch(cfg: MatchConfig, role: Role): void {
    this.cfg = cfg;
    this.role = role;
    this.phase = 'battle';
    this.paused = false;
    this.resultsShown = false;
    this.scoreReported = false;
    this.acc = 0;
    this.renderer.reset();
    this.netEvents = [];
    this.evQueue = [];
    this.lastStage = cfg.stage;
    const n = cfg.slots.length;
    this.brains = cfg.slots.map((s) => (s.ctrl === Ctrl.BOT ? createBrain(s.level) : null));
    // esquemas de teclado
    const locals = cfg.slots.map((s, i) => (s.ctrl === Ctrl.LOCAL ? i : -1)).filter((i) => i >= 0);
    this.schemes = cfg.slots.map(() => null);
    if (role === 'guest') {
      this.mySlot = cfg.slots.findIndex((s) => s.peerId === this.room.localPlayer.id);
    } else {
      this.mySlot = -1;
    }
    if (role === 'guest') {
      this.renderer.localSlots = this.mySlot >= 0 ? [this.mySlot] : [];
    } else {
      locals.forEach((slot, k) => {
        this.schemes[slot] = locals.length > 1 ? (k === 0 ? 'p1' : 'p2') : 'solo';
      });
      this.renderer.localSlots = locals;
    }
    if (role === 'guest') {
      this.world = null;
      this.snapBuf.clear();
      this.pred = null;
      this.hist = [];
      this.localSeq = 0;
      this.sentUpTo = 0;
      this.errX = 0;
      this.errY = 0;
      this.lastSnapCount = 190;
    } else {
      this.world = createWorld(cfg);
      this.inQ = Array.from({ length: n }, () => []);
      this.lastBits = new Array(n).fill(0);
      this.consumed = new Array(n).fill(0);
      this.expected = new Array(n).fill(0);
      this.lastInTick = new Array(n).fill(0);
    }
    this.ui.hideAll();
    this.touch.show(window.matchMedia('(pointer: coarse)').matches);
    startMusic(cfg.stage === 1 || cfg.stage === 3 ? 1 : 0);
  }

  private stopMatch(): void {
    this.phase = 'menu';
    this.world = null;
    this.paused = false;
    this.touch.show(false);
    stopMusic();
  }

  private setPaused(p: boolean): void {
    if (this.phase !== 'battle') return;
    this.paused = p;
    if (p) {
      this.ui.showPause(this.role !== 'guest', this.role === 'local' ? (this.cfg!.slots.filter((s) => s.ctrl === Ctrl.LOCAL).length > 1 ? 'local' : 'solo') : 'online');
    } else this.ui.hidePause();
  }

  // ======================================================================= rede
  onNetMessage(msg: NetMsg, senderId: string): void {
    if (!msg || typeof msg.k !== 'string') return;
    const host = this.amHost();
    switch (msg.k) {
      case 'pick':
        if (host) {
          const s = this.ui.currentSetup();
          const sl = s.slots.find((x) => x.peerId === senderId);
          if (sl && s.mode === 'online') {
            sl.char = ((msg.char % CHARS.length) + CHARS.length) % CHARS.length;
            this.ui.applySetup(s);
            this.broadcastLobby();
          }
        }
        break;
      case 'lobby':
        if (!host && this.phase !== 'battle') {
          const s: Setup = { mode: 'online', slots: msg.slots.map((x) => ({ ...x })), stage: msg.stage, rules: msg.rules };
          this.onlineMode = true;
          const my = s.slots.findIndex((x) => x.peerId === this.room.localPlayer.id);
          if (this.phase === 'menu') {
            this.ui.applySetup(s);
            this.ui.setOnline({ connected: true, isHost: false, code: this.room.roomCode, mySlot: Math.max(0, my) });
            if (!this.ui.isOpen()) this.ui.renderSetup();
          }
        }
        break;
      case 'start':
        if (!host) {
          this.hud?.toast('Luta começando!', 'banana');
          this.startMatch(msg.cfg, 'guest');
        }
        break;
      case 'back':
        if (!host && this.phase !== 'menu') this.backToSetup(false);
        break;
      case 'in':
        if (host && this.role === 'host' && this.world) {
          const slot = this.cfg!.slots.findIndex((s) => s.peerId === senderId);
          if (slot < 0) break;
          for (let i = 0; i < msg.b.length; i++) {
            const idx = msg.s + i;
            if (idx >= this.expected[slot]) {
              this.inQ[slot].push(msg.b[i]);
              this.expected[slot] = idx + 1;
            }
          }
          this.lastInTick[slot] = this.world.tick;
        }
        break;
      case 'snap':
        if (!host && this.phase === 'battle' && this.role === 'guest') this.onSnap(msg.s);
        break;
    }
  }

  private onSnap(s: Snap): void {
    const cfg = this.cfg!;
    const now = performance.now();
    const st = snapToState(s, cfg, now);
    this.snapBuf.push(st);
    for (const ev of s.ev) this.evQueue.push(ev);
    this.lastSnapCount = s.count;
    if (this.mySlot >= 0) {
      const auth = st.fighters[this.mySlot];
      if (auth.dead !== 0 || !this.pred) {
        this.pred = { ...auth };
        this.predTick = s.tick;
        this.errX = 0;
        this.errY = 0;
      } else {
        const old = this.pred;
        const np: Fighter = { ...auth };
        const ack = s.ack[this.mySlot] ?? 0;
        let t = s.tick;
        const skip = s.count;
        let j = 0;
        for (let i = ack; i < this.localSeq; i++, j++) {
          t++;
          if (j < skip) continue;
          this.predictStep(np, this.hist[i] | 0, t);
        }
        const ex = old.x + this.errX - np.x;
        const ey = old.y + this.errY - np.y;
        if (Math.abs(ex) < 120 && Math.abs(ey) < 120) {
          this.errX = ex;
          this.errY = ey;
        } else {
          this.errX = 0;
          this.errY = 0;
        }
        this.pred = np;
        this.predTick = t;
      }
      // limpa histórico antigo
      const ack = s.ack[this.mySlot] ?? 0;
      if (ack > 240 && this.hist.length > ack + 400) {
        // mantém indexação absoluta: apenas zera valores antigos
        for (let i = 0; i < ack - 120; i++) this.hist[i] = 0;
      }
    }
  }

  private predictStep(f: Fighter, bits: number, tick: number): void {
    if (f.state === St.HELD || f.dead !== 0) return;
    const stage = STAGES[this.lastStage];
    platsAt(stage, tick, this.ppTmp);
    stepFighter({ tick, stage, pp: this.ppTmp, w: null }, f, bits);
  }

  // ======================================================================= laço principal
  private frame(ts: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(100, ts - this.last);
    this.last = ts;
    const frames = Math.max(1, Math.min(3, Math.round(dt / STEP_MS)));
    if (this.phase === 'menu') {
      this.drawIdle();
      return;
    }
    if (this.phase === 'battle' || this.phase === 'results') {
      this.acc += dt;
      let n = 0;
      const frozen = this.paused && this.role !== 'host' && this.role !== 'guest';
      while (this.acc >= STEP_MS && n < 5) {
        this.acc -= STEP_MS;
        n++;
        if (frozen) continue;
        if (this.role === 'guest') this.stepGuest();
        else this.stepHost();
      }
      if (n === 5) this.acc = 0;
      this.render(frames);
    }
  }

  private drawIdle(): void {
    const c = this.renderer.c;
    const g = c.createLinearGradient(0, 0, 0, this.renderer.h);
    g.addColorStop(0, '#2e1065');
    g.addColorStop(1, '#0b0d14');
    c.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
    c.fillStyle = g;
    c.fillRect(0, 0, this.renderer.w, this.renderer.h);
  }

  // ---------------------------------------------------------------- host / local
  private stepHost(): void {
    const w = this.world;
    if (!w || !this.cfg) return;
    const n = w.fighters.length;
    const inputs: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const f = w.fighters[i];
      const sc = this.schemes[i];
      if (f.ctrl === Ctrl.LOCAL && sc) {
        inputs[i] = this.paused ? 0 : readInput(sc, true);
      } else if (f.ctrl === Ctrl.BOT) {
        inputs[i] = botInput(w, f, this.brains[i] ?? (this.brains[i] = createBrain(f.level)));
      } else if (f.ctrl === Ctrl.REMOTE) {
        const q = this.inQ[i];
        if (q.length > 0) {
          this.lastBits[i] = q.shift()!;
          this.consumed[i]++;
          if (q.length > 6) {
            this.lastBits[i] = q.shift()!;
            this.consumed[i]++;
          }
        }
        inputs[i] = this.lastBits[i];
        // jogador sumiu (saiu da partida sem desconectar)
        if (w.tick - this.lastInTick[i] > 240 && w.tick > 300) {
          f.ctrl = Ctrl.BOT;
          f.name = `${f.name} (bot)`;
          this.cfg.slots[i].ctrl = Ctrl.BOT;
          this.brains[i] = createBrain(1);
        }
      }
    }
    stepWorld(w, inputs);
    const view = this.hostView(w);
    if (w.events.length) {
      for (const ev of w.events) {
        this.renderer.handleEvent(ev, view);
        if (this.role === 'host') this.netEvents.push(ev);
      }
      w.events.length = 0;
    }
    if (this.role === 'host' && w.tick % 2 === 0) {
      const ack = this.consumed.slice();
      this.room.send('ms', { k: 'snap', s: packWorld(w, ack, this.netEvents) });
      this.netEvents = [];
    }
    if (w.over && w.overT >= 210 && !this.resultsShown) this.finishMatch(w.fighters, w.winner);
  }

  private hostView(w: World): RenderView {
    return {
      tick: w.tick, stage: w.stage, seed: w.seed, rules: w.rules, fighters: w.fighters, items: w.items, projs: w.projs,
      count: w.count, timeLeft: w.timeLeft, over: w.over, winner: w.winner, overT: w.overT,
    };
  }

  // ---------------------------------------------------------------- guest
  private stepGuest(): void {
    if (!this.cfg) return;
    const bits = this.mySlot >= 0 ? readInput('solo', true) : 0;
    this.hist[this.localSeq] = this.paused ? 0 : bits;
    this.localSeq++;
    if (this.pred && this.lastSnapCount <= 0) {
      this.predTick++;
      this.predictStep(this.pred, this.hist[this.localSeq - 1] | 0, this.predTick);
    }
    if (this.localSeq - this.sentUpTo >= 2) {
      this.room.send('ms', { k: 'in', s: this.sentUpTo, b: this.hist.slice(this.sentUpTo, this.localSeq) });
      this.sentUpTo = this.localSeq;
    }
    this.errX *= 0.82;
    this.errY *= 0.82;
  }

  private guestView(): RenderView | null {
    const cfg = this.cfg;
    if (!cfg) return null;
    const now = performance.now();
    const latest = this.snapBuf.latest();
    if (!latest) return null;
    const nowTick = this.snapBuf.nowTick(now);
    const rt = Math.min(nowTick - INTERP_TICKS, latest.tick);
    const st = this.snapBuf.at(rt) ?? latest;
    // eventos
    const view0: RenderView = {
      tick: Math.round(Math.min(nowTick, latest.tick + 8)), stage: STAGES[cfg.stage], seed: cfg.seed, rules: cfg.rules,
      fighters: st.fighters, items: st.items, projs: st.projs, count: latest.count, timeLeft: latest.tl,
      over: latest.over, winner: latest.win, overT: latest.ovT,
    };
    while (this.evQueue.length && this.evQueue[0][1] <= rt + 1) {
      const ev = this.evQueue.shift()!;
      this.renderer.handleEvent(ev, view0);
    }
    const fighters = st.fighters.map((f) => ({ ...f }));
    if (this.mySlot >= 0 && this.pred && fighters[this.mySlot] && fighters[this.mySlot].dead === 0 && latest.count <= 0) {
      const au = latest.fighters[this.mySlot];
      const p = this.pred;
      const d = fighters[this.mySlot];
      Object.assign(d, p);
      d.x = p.x + this.errX;
      d.y = p.y + this.errY;
      d.pct = au.pct;
      d.stocks = au.stocks;
      d.kos = au.kos;
      d.falls = au.falls;
      d.dealt = au.dealt;
      d.shield = au.shield;
      d.dead = au.dead;
      d.hitstop = au.hitstop;
    }
    for (const f of fighters) f.ctrl = cfg.slots[f.slot].ctrl;
    view0.fighters = fighters;
    if (latest.over && latest.ovT >= 210 && !this.resultsShown) this.finishMatch(fighters, latest.win);
    return view0;
  }

  // ---------------------------------------------------------------- render / fim
  private render(frames: number): void {
    let view: RenderView | null = null;
    if (this.role === 'guest') view = this.guestView();
    else if (this.world) view = this.hostView(this.world);
    if (!view) {
      this.drawIdle();
      const c = this.renderer.c;
      c.fillStyle = '#fde047';
      c.font = '800 22px system-ui';
      c.textAlign = 'center';
      c.fillText('Conectando ao host...', this.renderer.w / 2, this.renderer.h / 2);
      return;
    }
    this.lastView = view;
    this.renderer.draw(view, this.paused && this.role === 'local' ? 0 : frames);
  }

  private finishMatch(fighters: Fighter[], winner: number): void {
    if (this.resultsShown || !this.cfg) return;
    this.resultsShown = true;
    this.phase = 'results';
    stopMusic();
    this.touch.show(false);
    const rules = this.cfg.rules;
    const fake: Pick<World, 'rules' | 'winner' | 'fighters'> = { rules, winner, fighters };
    const ordered = placementOrder(fake as World);
    const rows = ordered.map((f, i) => ({
      slot: f.slot, name: this.cfg!.slots[f.slot].name, char: f.char, kos: f.kos, falls: f.falls, dealt: f.dealt,
      place: i + 1, pct: f.pct, isBot: this.cfg!.slots[f.slot].ctrl === Ctrl.BOT,
    }));
    const wf = fighters.find((f) => f.slot === winner);
    const quote = wf ? pick(CHARS[wf.char].quotes.win) : 'Empate? Só pode ser coisa de macaco indeciso!';
    const mode: Mode = this.role === 'local' ? (this.cfg.slots.filter((s) => s.ctrl === Ctrl.LOCAL).length > 1 ? 'local' : 'solo') : 'online';
    const data: ResultData = { rows, winner, quote, canControl: this.role !== 'guest', mode, rules };
    // pontuação local
    if (!this.scoreReported) {
      this.scoreReported = true;
      let best = 0;
      for (const f of fighters) {
        const sl = this.cfg.slots[f.slot];
        const mine = this.role === 'guest' ? f.slot === this.mySlot : sl.ctrl === Ctrl.LOCAL;
        if (!mine) continue;
        const sc = f.kos * 1000 + Math.round(f.dealt) * 5 + (f.slot === winner ? 3000 : 0) + Math.max(0, f.stocks) * 300 - f.falls * 100;
        best = Math.max(best, sc);
      }
      reportGameScore(SLUG, Math.max(0, best), { kos: fighters.reduce((a, f) => Math.max(a, f.kos), 0) });
    }
    window.setTimeout(() => {
      if (this.phase === 'results') this.ui.showResults(data);
    }, 250);
    // keep world stepping for host so background still animates
  }
}

export { DEFAULT_RULES, newFighter, unpackFighter };
