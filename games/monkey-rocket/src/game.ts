// Controlador principal: modos (solo / local / online), fases, replay, efeitos e rede.
import { mountMonkeyHud, PeerRoom, reportGameScore, type PlayerProfile } from '@monkey-slop/sdk';
import type { Expr } from './art';
import { gameAudio } from './audio';
import { CONTROLS_GUIDE } from './controls';
import {
  BOT_NAMES,
  CARS,
  CAR_ORDER,
  COUNTDOWN_DUR,
  REPLAY_CLIP_AFTER,
  REPLAY_CLIP_BEFORE,
  REPLAY_DUR,
  SLUG,
  THEMES,
  TITLE,
} from './constants';
import { Fx } from './fx';
import { InputManager, packInput } from './input';
import { Match } from './match';
import { INPUT_INTERVAL, NetView, SNAP_INTERVAL } from './net';
import { Renderer, type LocalHud } from './renderer';
import { GameUi, type OnlineInfo, type ResultsData, type Settings } from './ui';
import {
  PH_COUNTDOWN,
  PH_END,
  PH_GOAL,
  PH_PLAY,
  PH_REPLAY,
  emptyInput,
  type CarId,
  type InputState,
  type MatchConfig,
  type NetMessage,
  type Phase,
  type RenderState,
  type SimEvent,
  type SlotConfig,
} from './types';

type Role = 'idle' | 'local' | 'host' | 'client';

interface Frame {
  t: number;
  view: RenderState;
}

const TEAM_NAMES: [string, string] = ['AZUIS', 'LARANJAS'];
const HIT_WORDS = ['POW!', 'BANANADA!', 'TOMA!', 'UI!', 'CHUTÃO!'];

function cloneView(v: RenderState): RenderState {
  return { ...v, ball: { ...v.ball }, cars: v.cars.map((c) => ({ ...c })), pads: v.pads.slice() };
}

export class Game {
  private renderer: Renderer;
  private fx = new Fx();
  private input = new InputManager();
  private ui: GameUi;
  private room: PeerRoom<NetMessage>;
  private hud: ReturnType<typeof mountMonkeyHud<NetMessage>>;

  private role: Role = 'idle';
  private match: Match | null = null;
  private demo: Match;
  private netView: NetView | null = null;
  private cfg: MatchConfig | null = null;
  private mySlot = -1;
  private remote = new Map<number, InputState>();
  private matchCounter = 1;

  private view: RenderState;
  private lastPhase: Phase = PH_COUNTDOWN;
  private frames: Frame[] = [];
  private clip: Frame[] = [];
  private goalStart = 0;
  private lastCount = 99;
  private ended = false;
  private expr = new Map<number, { e: Expr; until: number }>();
  private stats: { goals: number; touches: number; pads: number }[] = [];
  private lastTime = performance.now();
  private snapAcc = 0;
  private inputAcc = 0;
  private lastSent = { m: -1, j: -1 };
  private paused = false;
  private pausedByControls = false;
  private clock = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.room = new PeerRoom<NetMessage>(SLUG, {
      onPlayersChange: (players) => this.onPlayers(players),
      onMessage: (env) => this.onNet(env.senderId, env.payload),
      onStatus: (status, detail) => {
        if (status === 'connected' && detail) this.hud.toast(detail, 'info');
        if (status === 'error') this.hud.toast(detail ?? 'Erro de conexão', 'chaos');
      },
    });
    this.hud = mountMonkeyHud({
      slug: SLUG,
      title: TITLE,
      room: this.room,
      controls: {
        ...CONTROLS_GUIDE,
        onOpenChange: (open) => this.onControlsOpenChange(open),
      },
    });

    this.ui = new GameUi(
      document.body,
      {
        onSolo: (s) => this.startSolo(s),
        onLocal: (s) => this.startLocal(s),
        onOnlineStart: (s) => this.startOnlineHost(s),
        onHelp: () => this.hud.controls?.open(),
        onResume: () => this.togglePause(),
        onRestart: () => this.restart(),
        onMenu: () => this.toMenu(true),
        onRematch: () => this.rematch(),
        onSettingsChange: () => this.refreshDemoTheme(),
      },
      this.input,
    );

    this.demo = this.makeDemo();
    this.view = this.demo.view();
    this.input.onPause = () => this.togglePause();
    this.input.onSkip = () => this.skipReplay();
    this.canvas.addEventListener('pointerdown', () => {
      gameAudio.unlock();
      if (this.view.phase === PH_REPLAY) this.skipReplay();
    });
    window.addEventListener('keydown', () => gameAudio.unlock());
    window.addEventListener('pointerdown', () => gameAudio.unlock());
    window.addEventListener('resize', () => this.renderer.resize());

    this.ui.showTitle();
    this.renderer.snapCamera();
    gameAudio.startMusic();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------ configuracao
  private rand<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private botName(used: Set<string>): string {
    for (let i = 0; i < 20; i++) {
      const n = this.rand(BOT_NAMES);
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return 'Macaco Bot';
  }

  private nextCar(c: CarId, k = 1): CarId {
    return CAR_ORDER[(CAR_ORDER.indexOf(c) + k) % CAR_ORDER.length];
  }

  private makeDemo(): Match {
    const used = new Set<string>();
    const mk = (slot: number, team: 0 | 1): SlotConfig => ({
      slot,
      team,
      car: this.rand(CAR_ORDER),
      fur: Math.floor(Math.random() * 6),
      name: this.botName(used),
      playerId: null,
      local: null,
      bot: true,
    });
    const cfg: MatchConfig = {
      kind: 'demo',
      format: '1v1',
      theme: this.ui ? this.ui.settings.theme : 'selva',
      matchTime: 999,
      botLevel: 2,
      slots: [mk(0, 0), mk(1, 1)],
    };
    return new Match(cfg);
  }

  private refreshDemoTheme(): void {
    if (this.role === 'idle' && this.demo.cfg.theme !== this.ui.settings.theme) {
      this.demo = this.makeDemo();
    }
  }

  private buildCfg(
    kind: MatchConfig['kind'],
    s: Settings,
    format: '1v1' | '2v2',
    humans: { team: 0 | 1; local: 'p1' | 'p2' | null; playerId: string | null; name: string; car: CarId }[],
  ): MatchConfig {
    const per = format === '2v2' ? 2 : 1;
    const used = new Set<string>(humans.map((h) => h.name));
    const slots: SlotConfig[] = [];
    let furI = Math.floor(Math.random() * 6);
    for (const team of [0, 1] as const) {
      const list = humans.filter((h) => h.team === team).slice(0, per);
      let carK = 1;
      for (let i = 0; i < per; i++) {
        const h = list[i];
        slots.push({
          slot: slots.length,
          team,
          car: h ? h.car : this.nextCar(s.car, carK++ + team),
          fur: furI++ % 6,
          name: h ? h.name : this.botName(used),
          playerId: h ? h.playerId : null,
          local: h ? h.local : null,
          bot: !h,
        });
      }
    }
    return { matchId: this.matchCounter++, kind, format, theme: s.theme, matchTime: s.time, botLevel: s.botLevel, slots };
  }

  // ------------------------------------------------------------ inicio de partida
  private startSolo(s: Settings): void {
    const cfg = this.buildCfg('solo', s, s.format, [{ team: 0, local: 'p1', playerId: null, name: 'Você', car: s.car }]);
    this.beginMatch(cfg, 'local');
  }

  private startLocal(s: Settings): void {
    const p2car = this.nextCar(s.car);
    let cfg: MatchConfig;
    if (s.coop) {
      cfg = this.buildCfg('local-coop', s, '2v2', [
        { team: 0, local: 'p1', playerId: null, name: 'P1', car: s.car },
        { team: 0, local: 'p2', playerId: null, name: 'P2', car: p2car },
      ]);
    } else {
      cfg = this.buildCfg('local-versus', s, s.format, [
        { team: 0, local: 'p1', playerId: null, name: 'P1', car: s.car },
        { team: 1, local: 'p2', playerId: null, name: 'P2', car: p2car },
      ]);
    }
    this.beginMatch(cfg, 'local');
  }

  private startOnlineHost(s: Settings): void {
    if (!this.room.roomCode || !this.room.localPlayer.isHost) {
      this.hud.toast('Crie uma sala em 🐒 Co-op Online primeiro!', 'chaos');
      return;
    }
    const players = this.room.getPlayers();
    const format = s.format === '2v2' || players.length > 2 ? '2v2' : '1v1';
    const humans = players.slice(0, 4).map((p, i) => ({
      team: (i % 2) as 0 | 1,
      local: p.id === this.room.localPlayer.id ? ('p1' as const) : null,
      playerId: p.id,
      name: p.name,
      car: p.id === this.room.localPlayer.id ? s.car : this.nextCar(s.car, i),
    }));
    const cfg = this.buildCfg('online', s, format, humans);
    this.beginMatch(cfg, 'host');
  }

  private beginMatch(cfgIn: MatchConfig, role: Role): void {
    const cfg: MatchConfig = JSON.parse(JSON.stringify(cfgIn)) as MatchConfig;
    this.cfg = cfgIn;
    this.role = role;
    this.ended = false;
    this.paused = false;
    this.pausedByControls = false;
    this.frames = [];
    this.clip = [];
    this.expr.clear();
    this.fx.clear();
    this.stats = cfg.slots.map(() => ({ goals: 0, touches: 0, pads: 0 }));
    this.input.dual = cfg.slots.some((x) => x.local === 'p2');
    this.input.releaseAll();
    this.lastCount = 99;
    this.lastPhase = PH_COUNTDOWN;
    this.remote.clear();
    this.snapAcc = 0;
    this.lastSent = { m: -1, j: -1 };

    if (role === 'client') {
      this.match = null;
      this.netView = new NetView(cfg);
      this.mySlot = cfg.slots.find((x) => x.playerId === this.room.localPlayer.id)?.slot ?? -1;
    } else {
      this.netView = null;
      const m = new Match(cfg);
      this.match = m;
      for (const sl of cfg.slots) {
        if (sl.local === 'p1') m.setInput(sl.slot, this.input.p1);
        else if (sl.local === 'p2') m.setInput(sl.slot, this.input.p2);
        else if (!sl.bot && sl.playerId) {
          const r = emptyInput();
          this.remote.set(sl.slot, r);
          m.setInput(sl.slot, r);
        }
      }
      this.mySlot = cfg.slots.find((x) => x.local === 'p1')?.slot ?? -1;
      this.view = m.view();
      if (role === 'host') this.room.send('g', { kind: 'start', cfg });
    }
    this.ui.hide();
    this.ui.setInMatch(true, true);
    this.input.enabled = true;
    this.renderer.snapCamera();
    this.hud.toast('Bora pro jogo! 🍌⚽', 'banana');
  }

  private restart(): void {
    if (this.role !== 'local' || !this.cfg) return;
    this.beginMatch(this.cfg, 'local');
  }

  private rematch(): void {
    if (!this.cfg) return;
    if (this.role === 'local') this.beginMatch(this.cfg, 'local');
    else if (this.role === 'host') {
      const prev = this.cfg;
      const fresh: MatchConfig = { ...prev, matchId: this.matchCounter++, slots: prev.slots.map((x) => ({ ...x })) };
      // jogadores que sairam viram bot
      const ids = new Set(this.room.getPlayers().map((p) => p.id));
      for (const sl of fresh.slots) {
        if (sl.playerId && !ids.has(sl.playerId)) {
          sl.bot = true;
          sl.playerId = null;
        }
      }
      this.beginMatch(fresh, 'host');
    }
  }

  private toMenu(announce: boolean): void {
    if (this.role === 'host' && announce) this.room.send('g', { kind: 'menu' });
    this.role = 'idle';
    this.match = null;
    this.netView = null;
    this.paused = false;
    this.pausedByControls = false;
    this.input.enabled = false;
    this.input.releaseAll();
    this.input.dual = false;
    this.fx.clear();
    this.expr.clear();
    this.demo = this.makeDemo();
    this.view = this.demo.view();
    this.ui.setInMatch(false, false);
    if (this.room.roomCode) this.ui.showLobby();
    else this.ui.showTitle();
    this.renderer.snapCamera();
  }

  private togglePause(): void {
    if (this.role === 'idle') {
      if (this.ui.current !== 'title') this.ui.showTitle();
      return;
    }
    if (this.view.phase === PH_END) return;
    if (this.ui.current === 'pause') {
      this.ui.hide();
      this.paused = false;
      if (this.match && this.role === 'local') this.match.paused = false;
      this.input.enabled = true;
    } else if (this.ui.current === 'none') {
      this.ui.showPause(this.role !== 'local');
      this.paused = true;
      if (this.match && this.role === 'local') this.match.paused = true;
      this.input.enabled = false;
      this.input.releaseAll();
    }
  }

  private skipReplay(): void {
    if (this.match && this.role === 'local' && this.view.phase === PH_REPLAY) this.match.skipReplay();
  }

  private onControlsOpenChange(open: boolean): void {
    this.input.releaseAll();
    if (open) {
      if (this.role === 'local' && !this.paused && this.ui.current === 'none') {
        this.pausedByControls = true;
        this.paused = true;
        if (this.match) this.match.paused = true;
        this.input.enabled = false;
      }
    } else if (this.pausedByControls) {
      this.pausedByControls = false;
      if (this.role === 'local' && this.ui.current === 'none') {
        this.paused = false;
        if (this.match) this.match.paused = false;
        this.input.enabled = true;
      }
    }
  }

  // ------------------------------------------------------------ rede
  private onlineInfo(): OnlineInfo {
    const players = this.room.getPlayers();
    return {
      connected: Boolean(this.room.roomCode) && players.length > 0,
      isHost: this.room.localPlayer.isHost,
      players: players.map((p) => (p.isHost ? '👑 ' : '') + p.name),
      code: this.room.roomCode,
    };
  }

  private onPlayers(players: PlayerProfile[]): void {
    this.hud.setPlayers(players);
    this.ui.setOnlineInfo(this.onlineInfo());
    if (this.role === 'host' && this.match && this.cfg) {
      const ids = new Set(players.map((p) => p.id));
      for (const sl of this.match.cfg.slots) {
        if (sl.playerId && !ids.has(sl.playerId)) {
          this.hud.toast(`${sl.name} saiu — um bot assumiu o carro 🤖`, 'chaos');
          this.match.convertToBot(sl.slot);
        }
      }
      // espectadores novos recebem a configuracao
      this.room.send('g', { kind: 'start', cfg: this.cfg });
    }
    if (this.role === 'client' && !players.some((p) => p.isHost)) {
      this.hud.toast('O host saiu da sala.', 'chaos');
      this.toMenu(false);
    }
  }

  private onNet(senderId: string, msg: NetMessage): void {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.kind) {
      case 'start': {
        if (this.room.localPlayer.isHost) return;
        if (this.role === 'client' && this.cfg && this.cfg.matchId === msg.cfg.matchId) return;
        this.beginMatch(msg.cfg, 'client');
        break;
      }
      case 'snap': {
        if (this.role === 'client' && this.netView) this.netView.push(msg.s, performance.now() / 1000);
        break;
      }
      case 'ev': {
        if (this.role === 'client') this.handleEvents(msg.e);
        break;
      }
      case 'menu': {
        if (this.role === 'client') {
          this.toMenu(false);
        }
        break;
      }
      case 'in': {
        if (this.role !== 'host' || !this.match) return;
        const slot = this.match.cfg.slots[msg.slot];
        const r = this.remote.get(msg.slot);
        if (!slot || !r || slot.playerId !== senderId) return;
        r.left = (msg.m & 1) !== 0;
        r.right = (msg.m & 2) !== 0;
        r.up = (msg.m & 4) !== 0;
        r.down = (msg.m & 8) !== 0;
        r.boost = (msg.m & 16) !== 0;
        r.jumpHeld = (msg.m & 32) !== 0;
        if (msg.j > r.jumpCount) r.jumpCount = msg.j;
        break;
      }
    }
  }

  // ------------------------------------------------------------ loop
  private loop(nowMs: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastTime) / 1000));
    this.lastTime = nowMs;
    this.clock += dt;
    try {
      this.tick(dt, nowMs / 1000);
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  private tick(dt: number, nowSec: number): void {
    let view: RenderState;
    let events: SimEvent[] = [];

    if (this.role === 'idle') {
      this.demo.update(dt);
      view = this.demo.view();
      events = this.demo.events;
      this.demo.events = [];
      // demo silenciosa: so efeitos visuais
      this.handleEvents(events, true);
    } else if (this.role === 'client') {
      const v = this.netView?.get(nowSec) ?? null;
      view = v ?? this.view;
      this.sendClientInput(dt);
    } else {
      const m = this.match!;
      m.update(dt);
      view = m.view();
      events = m.events;
      m.events = [];
      this.handleEvents(events);
      if (this.role === 'host') {
        const sendable = events.filter((e) => e.k !== 'whistle' && e.k !== 'kickoff');
        if (sendable.length) this.room.send('g', { kind: 'ev', e: sendable });
        this.snapAcc += dt;
        if (this.snapAcc >= SNAP_INTERVAL) {
          this.snapAcc = 0;
          const snap = m.snap();
          snap.t = nowSec;
          this.room.send('g', { kind: 'snap', s: snap });
        }
      }
    }

    this.onPhase(view, nowSec);
    // gravacao para replay
    if (this.role !== 'idle' && (view.phase === PH_PLAY || view.phase === PH_GOAL)) {
      this.frames.push({ t: nowSec, view: cloneView(view) });
      while (this.frames.length > 0 && nowSec - this.frames[0].t > 9) this.frames.shift();
    }
    // reproducao do replay
    if (this.role !== 'idle' && view.phase === PH_REPLAY && this.clip.length > 1) {
      const t0 = this.clip[0].t;
      const len = this.clip[this.clip.length - 1].t - t0;
      const ct = t0 + Math.min(1, view.phaseT / REPLAY_DUR) * len;
      let i = 0;
      while (i < this.clip.length - 1 && this.clip[i + 1].t <= ct) i++;
      const fr = this.clip[i].view;
      view = {
        ...fr,
        scoreA: view.scoreA,
        scoreB: view.scoreB,
        timeLeft: view.timeLeft,
        overtime: view.overtime,
        phase: PH_REPLAY,
        phaseT: view.phaseT,
        goal: view.goal,
      };
    }
    this.view = view;

    this.emitCarFx(view, dt);
    this.fx.update(dt);
    if (view.phase === PH_END && !this.ended && this.role !== 'idle') this.onMatchEnd(view);

    // audio
    const local = view.cars.find((c) => c.slot === this.mySlot);
    const playing = this.role !== 'idle' && !this.paused && (view.phase === PH_PLAY || view.phase === PH_GOAL);
    gameAudio.update(
      playing && !!local,
      local ? Math.hypot(local.vx, local.vy) : 0,
      !!local && local.boosting,
      Math.min(1, this.fx.crowd + (view.phase === PH_PLAY ? 0.12 : 0)),
    );

    const locals: LocalHud[] = [];
    if (this.role !== 'idle') {
      const cfg = this.role === 'client' ? this.netView?.cfg : this.match?.cfg;
      if (cfg) {
        for (const sl of cfg.slots) {
          if (this.role === 'client') {
            if (sl.slot === this.mySlot) locals.push({ slot: sl.slot, label: sl.name });
          } else if (sl.local) locals.push({ slot: sl.slot, label: sl.local === 'p2' ? 'P2' : sl.local === 'p1' && this.input.dual ? 'P1' : sl.name });
        }
      }
    }
    this.renderer.frame({
      view,
      fx: this.fx,
      t: this.clock,
      dt,
      locals,
      theme: THEMES[(this.role === 'idle' ? this.demo.cfg : (this.match?.cfg ?? this.netView?.cfg ?? this.demo.cfg)).theme],
      showHud: this.role !== 'idle',
      canSkipReplay: this.role === 'local',
      expr: this.expr,
      teamNames: TEAM_NAMES,
      demo: this.role === 'idle',
    });
  }

  private sendClientInput(dt: number): void {
    if (this.mySlot < 0) return;
    this.inputAcc += dt;
    const p = this.input.p1;
    const m = packInput(p);
    const changed = m !== this.lastSent.m || p.jumpCount !== this.lastSent.j;
    if (changed || this.inputAcc >= INPUT_INTERVAL) {
      this.inputAcc = 0;
      this.lastSent = { m, j: p.jumpCount };
      this.room.send('g', { kind: 'in', slot: this.mySlot, m, j: p.jumpCount });
    }
  }

  // ------------------------------------------------------------ fases
  private onPhase(view: RenderState, nowSec: number): void {
    if (this.role === 'idle') return;
    const ph = view.phase;
    // contagem regressiva com bips
    if (ph === PH_COUNTDOWN) {
      const rem = COUNTDOWN_DUR - view.phaseT;
      if (rem <= 3) {
        const n = Math.ceil(rem);
        if (n !== this.lastCount && n >= 1) {
          this.lastCount = n;
          gameAudio.beep(false);
        }
      }
    }
    if (ph === this.lastPhase) return;
    const prev = this.lastPhase;
    this.lastPhase = ph;
    if (ph === PH_COUNTDOWN) {
      this.fx.clear();
      this.expr.clear();
      this.lastCount = 99;
      this.renderer.snapCamera();
    } else if (ph === PH_PLAY) {
      gameAudio.beep(true);
      gameAudio.whistle(false);
    } else if (ph === PH_GOAL) {
      this.goalStart = nowSec;
    } else if (ph === PH_REPLAY) {
      this.clip = this.frames.filter((f) => f.t >= this.goalStart - REPLAY_CLIP_BEFORE && f.t <= this.goalStart + REPLAY_CLIP_AFTER);
      this.fx.clear();
    } else if (ph === PH_END) {
      gameAudio.whistle(true);
    }
    void prev;
  }

  private onMatchEnd(view: RenderState): void {
    this.ended = true;
    const cfg = this.role === 'client' ? this.netView!.cfg : this.match!.cfg;
    const mine = cfg.slots.find((s) => s.slot === this.mySlot);
    const myTeam = mine ? mine.team : 0;
    const gf = myTeam === 0 ? view.scoreA : view.scoreB;
    const ga = myTeam === 0 ? view.scoreB : view.scoreA;
    const winner: 0 | 1 | null = view.scoreA === view.scoreB ? null : view.scoreA > view.scoreB ? 0 : 1;
    const won = winner === myTeam;
    const myStats = this.stats[this.mySlot >= 0 ? this.mySlot : 0] ?? { goals: 0, touches: 0, pads: 0 };
    const points = Math.max(0, gf * 100 + (won ? 300 : 0) + Math.max(0, gf - ga) * 50 + myStats.goals * 40 + myStats.pads * 5 + (view.overtime ? 100 : 0));
    reportGameScore(SLUG, points, { goals: gf, conceded: ga, won: won ? 1 : 0 });

    let headline: string;
    let sub: string;
    const local = cfg.kind === 'local-versus';
    if (winner === null) {
      headline = 'EMPATE?! 🤯';
      sub = 'Isso nem deveria acontecer. A banana quebrou o regulamento.';
    } else if (local) {
      headline = `${winner === 0 ? 'P1' : 'P2'} VENCEU! 🏆`;
      sub = winner === 0 ? 'P2 vai ter que lavar o Fusca de P1.' : 'P1 foi de arrasta-pra-cima. Vergonha, macaco!';
    } else if (cfg.kind === 'local-coop' || cfg.kind === 'solo' || cfg.kind === 'online') {
      if (won) {
        headline = 'VITÓRIA DA MACACADA! 🏆';
        sub = this.rand(['Hoje tem banana de sobremesa!', 'Os bots foram pra casa chorando.', 'Time campeão! A torcida invadiu o campo!']);
      } else {
        headline = 'DERROTA... A BANANA AZEDOU 🍌💔';
        sub = this.rand(['Culpa do árbitro, do carro e do cipó.', 'Treina mais um pouquinho e volta!', 'O Fusca nem tava aquecido.']);
      }
    } else {
      headline = 'FIM DE JOGO!';
      sub = '';
    }
    const rows = cfg.slots.map((s) => ({
      slot: s.slot,
      name: s.name,
      team: s.team,
      goals: this.stats[s.slot]?.goals ?? 0,
      touches: this.stats[s.slot]?.touches ?? 0,
      pads: this.stats[s.slot]?.pads ?? 0,
      bot: s.bot,
    }));
    const data: ResultsData = {
      headline,
      sub,
      scoreA: view.scoreA,
      scoreB: view.scoreB,
      winner,
      rows,
      points,
      canRematch: this.role === 'local' || this.role === 'host',
      teamNames: TEAM_NAMES,
    };
    this.input.enabled = false;
    this.input.releaseAll();
    this.ui.showResults(data);
    this.fx.confetti(-45, 45, 40, 140);
    this.fx.crowd = 1;
  }

  // ------------------------------------------------------------ eventos / efeitos
  private handleEvents(events: SimEvent[], silent = false): void {
    for (const e of events) {
      switch (e.k) {
        case 'hit': {
          this.fx.hitSparks(e.x, e.y, e.s);
          if (e.s > 6) this.fx.addShake(Math.min(0.55, e.s / 70));
          if (!silent) gameAudio.hit(e.s);
          if (this.stats[e.slot]) this.stats[e.slot].touches++;
          this.expr.set(e.slot, { e: 'strain', until: this.clock + 0.45 });
          if (e.s > 30 && Math.random() < 0.6) this.fx.text(this.rand(HIT_WORDS), e.x, e.y + 3, '#fde047', 1.7, 0.8);
          break;
        }
        case 'bounce':
          if (!silent) gameAudio.bounce(e.s);
          if (e.s > 10) this.fx.dust(e.x, e.y, 3);
          break;
        case 'jump':
          if (!silent) gameAudio.jump();
          this.fx.dust(e.x, Math.max(0.2, e.y - 1), 5);
          break;
        case 'flip':
          if (!silent) gameAudio.flip();
          if (Math.random() < 0.5) this.fx.text('FLIP!', e.x, e.y + 3, '#7dd3fc', 1.3, 0.7);
          break;
        case 'pad': {
          this.fx.padBurst(e.x, e.y, e.big);
          if (this.stats[e.slot]) this.stats[e.slot].pads++;
          if (!silent && (e.slot === this.mySlot || this.role === 'local')) gameAudio.pad(e.big);
          if (e.slot === this.mySlot || this.role === 'local') this.fx.text(e.big ? '+100 TURBO!' : '+TURBO', e.x, e.y + 4, '#fda4af', 1.2, 0.8);
          break;
        }
        case 'goal': {
          this.fx.bananaBurst(e.x, e.y, 70);
          this.fx.confetti(-30, 30, 36, 90);
          this.fx.addShake(1.5);
          this.fx.doFlash(e.own ? '#ef4444' : '#fde047', 0.55);
          this.fx.crowd = 1;
          if (!silent) {
            gameAudio.goal(e.own);
            gameAudio.explosion();
          }
          if (!e.own && this.stats[e.slot]) this.stats[e.slot].goals++;
          this.expr.clear();
          break;
        }
        default:
          break;
      }
    }
  }

  private emitCarFx(view: RenderState, dt: number): void {
    if (this.role === 'idle' && this.ui.current !== 'title' && this.ui.current !== 'lobby') return;
    for (const c of view.cars) {
      const spec = CARS[c.car];
      const nx = Math.cos(c.a) * c.facing;
      const ny = Math.sin(c.a) * c.facing;
      if (c.boosting) {
        this.fx.boostTrail(c.x - nx * (spec.length / 2 + 0.2), c.y - ny * (spec.length / 2 + 0.2) + 0.05, nx, ny, c.team);
      }
      if (c.grounded) {
        const sp = Math.hypot(c.vx, c.vy);
        if (sp > 18 && Math.random() < dt * 14) this.fx.dust(c.x - nx * 1.8, Math.max(0.1, c.y - 1), 1);
      }
    }
  }
}
