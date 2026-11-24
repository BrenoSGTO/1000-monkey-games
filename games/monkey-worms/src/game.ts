import { mountMonkeyHud, PeerRoom, reportGameScore, type PlayerProfile } from '@monkey-slop/sdk';
import { Bot, type BotHost } from './ai';
import { gameAudio } from './audio';
import { Fx } from './fx';
import { Controls, type Action } from './input';
import {
  BIG_HURT_LINES,
  DEATH_LINES,
  DROWN_LINES,
  FALL_LINES,
  FIRE_LINES,
  HURT_LINES,
  SD_LINES,
  VICTORY_LINES,
  pickLine,
} from './lines';
import { Renderer } from './render';
import { World, freshAmmo } from './sim';
import {
  RETREAT_TIME,
  SLUG,
  SUDDEN_DEATH_ROUND,
  TEAM_STYLES,
  TURN_TIME,
  WEAPON_ORDER,
  WORLD_H,
  WORLD_W,
  type Ctrl,
  type CrateSpawn,
  type Difficulty,
  type FireParams,
  type GameMode,
  type NetMsg,
  type SimEvent,
  type Snapshot,
  type Team,
  type WeaponId,
  type Worm,
} from './types';
import { Ui, type HudState, type SoloOpts } from './ui';
import { WEAPONS } from './weapons';

type Phase = 'menu' | 'intro' | 'active' | 'resolve' | 'over';

interface TeamSpec {
  ctrl: Ctrl;
  pid: string | null;
  owner: string;
}

const FIXED = 1 / 60;

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private world: World;
  private fx = new Fx();
  private ui: Ui;
  private controls = new Controls();
  private room: PeerRoom<NetMsg>;
  private sdkHud: ReturnType<typeof mountMonkeyHud<NetMsg>>;

  private mode: GameMode = 'solo';
  private phase: Phase = 'menu';
  private screenName: 'title' | 'setup' | 'lobby' | 'over' | 'none' = 'title';
  private perTeam = 4;
  private difficulty: Difficulty = 'normal';
  private lastSpecs: TeamSpec[] = [];

  private turnSeq = 0;
  private turnTeam = -1;
  private turnWormId = -1;
  private round = 1;
  private timeLeft = TURN_TIME;
  private retreatLeft = 0;
  private phaseT = 0;
  private pendingStart = -1;
  private waitingSync = false;
  private resolveT = 0;
  private suddenDeath = false;
  private shotFired = false;
  private firedWeapon: WeaponId | null = null;

  private weapon: WeaponId = 'bazooka';
  private fuse = 3;
  private charge = 0;
  private charging = false;
  private target: { x: number; y: number } | null = null;

  private bots = new Map<number, Bot>();
  private botHost: BotHost | null = null;
  private activeBotStarted = false;

  private time = 0;
  private acc = 0;
  private lastT = 0;
  private poseT = 0;
  private lastTick = -1;
  private focus = { x: 0, y: 0, t: 0 };
  private overT = -1;
  private overInfo: { winner: number; snap: Snapshot | null } | null = null;
  private confettiT = 0;
  private lowHpSaid = new Set<number>();

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas);
    this.world = new World();
    this.world.setup(20240611, this.makeTeams([
      { ctrl: 'local', pid: null, owner: '' },
      { ctrl: 'bot', pid: null, owner: '' },
    ]), 3);
    this.renderer.snapTo(WORLD_W / 2, 560);

    this.room = new PeerRoom<NetMsg>(SLUG, {
      onPlayersChange: (p) => this.onPlayers(p),
      onMessage: (env) => this.onNet(env.senderId, env.payload),
      onStatus: (status, detail) => {
        if (status === 'connected' && detail) this.sdkHud.toast(detail, 'info');
      },
    });
    this.sdkHud = mountMonkeyHud<NetMsg>({ slug: SLUG, title: 'Macacos em Guerra', room: this.room });

    this.ui = new Ui({
      onStartSolo: (o) => this.startSolo(o),
      onStartHotseat: (n, per) => this.startHotseat(n, per),
      onOpenOnline: () => this.openOnline(),
      onStartOnline: (per) => this.startOnlineAsHost(per),
      onSelectWeapon: (id) => this.selectWeapon(id),
      onFuse: (d) => this.changeFuse(d),
      onMenu: () => this.toMenu(),
      onRematch: () => this.rematch(),
      onSkip: () => this.skipTurn(),
      onFireDown: () => this.fireDown(),
      onFireUp: () => this.fireUp(),
      onJump: () => this.doJump(false),
      onBack: () => this.doJump(true),
      onVirtual: (k, d) => (d ? this.controls.virtualDown(k) : this.controls.virtualUp(k)),
      onOverview: () => (this.renderer.overview = !this.renderer.overview),
    });
    this.ui.show('title');

    this.controls.attach(this.canvas);
    this.controls.onAction = (a) => this.onAction(a);
    this.controls.onPan = (dx, dy) => {
      this.renderer.panBy(dx, dy);
      this.renderer.manualUntil = performance.now() + 5000;
    };
    this.controls.onWheel = (dy) => {
      this.renderer.overview = false;
      this.renderer.userZoom = Math.max(0.45, Math.min(2.6, this.renderer.userZoom * (1 - dy * 0.0012)));
    };
    window.addEventListener('resize', () => this.renderer.resize());
    const unlock = () => gameAudio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    requestAnimationFrame((t) => this.loop(t));
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private makeTeams(specs: TeamSpec[]): Team[] {
    return specs.map((s, i) => ({
      id: i,
      name: TEAM_STYLES[i].name,
      color: TEAM_STYLES[i].color,
      dark: TEAM_STYLES[i].dark,
      light: TEAM_STYLES[i].light,
      pid: s.pid,
      ctrl: s.ctrl,
      owner: s.owner,
      ammo: freshAmmo(),
      cursor: 0,
      dmgDealt: 0,
      kills: 0,
    }));
  }

  private get online(): boolean {
    return this.mode === 'online';
  }

  private get isHost(): boolean {
    return !this.online || this.room.localPlayer.isHost;
  }

  private activeWorm(): Worm | undefined {
    return this.world.worm(this.turnWormId);
  }

  private activeTeam(): Team | undefined {
    return this.world.teams[this.turnTeam];
  }

  private localHuman(): boolean {
    const t = this.activeTeam();
    return !!t && t.ctrl === 'local';
  }

  private canAct(): boolean {
    const w = this.activeWorm();
    return this.phase === 'active' && this.localHuman() && !this.shotFired && !!w && w.state === 'alive' && !w.kami && !w.torch;
  }

  private send(msg: NetMsg): void {
    if (this.online) this.room.send('game', msg);
  }

  // ───────────────────────────── início de partida ─────────────────────────────

  private startSolo(o: SoloOpts): void {
    this.difficulty = o.difficulty;
    const specs: TeamSpec[] = [{ ctrl: 'local', pid: null, owner: 'Você' }];
    for (let i = 0; i < o.opponents; i++) specs.push({ ctrl: 'bot', pid: null, owner: `Bot ${i + 1}` });
    this.beginMatch('solo', specs, Math.floor(Math.random() * 1e9), o.perTeam);
  }

  private startHotseat(n: number, per: number): void {
    const specs: TeamSpec[] = [];
    for (let i = 0; i < n; i++) specs.push({ ctrl: 'local', pid: null, owner: `Jogador ${i + 1}` });
    this.beginMatch('hotseat', specs, Math.floor(Math.random() * 1e9), per);
  }

  private openOnline(): void {
    this.screenName = 'lobby';
    this.ui.show('lobby');
    this.refreshLobby();
  }

  private startOnlineAsHost(per: number): void {
    if (!this.room.roomCode || !this.room.localPlayer.isHost) return;
    const players = this.room.getPlayers().slice(0, 4);
    if (players.length < 2) return;
    this.sendStart(players, per);
  }

  private sendStart(players: PlayerProfile[], per: number): void {
    const seed = Math.floor(Math.random() * 1e9);
    this.send({ k: 'start', seed, perTeam: per, teams: players.map((p) => ({ pid: p.id, name: p.name })) });
    this.startOnline(seed, per, players.map((p) => ({ pid: p.id, name: p.name })));
  }

  private startOnline(seed: number, per: number, teams: { pid: string; name: string }[]): void {
    const me = this.room.localPlayer.id;
    const specs: TeamSpec[] = teams.map((t) => ({ ctrl: t.pid === me ? 'local' : 'remote', pid: t.pid, owner: t.name }));
    this.beginMatch('online', specs, seed, per);
  }

  private beginMatch(mode: GameMode, specs: TeamSpec[], seed: number, perTeam: number): void {
    this.mode = mode;
    this.perTeam = perTeam;
    this.lastSpecs = specs;
    const teams = this.makeTeams(specs);
    this.world = new World();
    this.world.setup(seed, teams, perTeam);
    this.fx = new Fx();
    this.bots.clear();
    teams.forEach((t) => {
      if (t.ctrl === 'bot') this.bots.set(t.id, new Bot(this.difficulty));
    });
    this.turnSeq = 0;
    this.turnTeam = -1;
    this.turnWormId = -1;
    this.round = 1;
    this.suddenDeath = false;
    this.overT = -1;
    this.overInfo = null;
    this.shotFired = false;
    this.charging = false;
    this.charge = 0;
    this.target = null;
    this.weapon = 'bazooka';
    this.lowHpSaid.clear();
    this.waitingSync = false;
    this.phase = 'resolve';
    this.retreatLeft = 0;
    this.resolveT = 0;
    this.pendingStart = this.isHost ? 1.4 : -1;
    this.renderer.overview = true;
    this.renderer.snapTo(WORLD_W / 2, 560);
    this.renderer.cam.zoom = this.renderer.overviewZoom();
    this.screenName = 'none';
    this.ui.show('none');
    this.ui.showHud(true);
    this.ui.banner('PREPARAR... FOGO!', 'Que vença o macaco mais explosivo', '#fde047');
    gameAudio.startMusic();
    gameAudio.fanfare();
  }

  private toMenu(): void {
    const wasOnline = this.online;
    if (wasOnline) this.send({ k: 'quit' });
    this.phase = 'menu';
    this.mode = 'solo';
    if (wasOnline) this.room.disconnect();
    this.overT = -1;
    this.charging = false;
    this.ui.showHud(false);
    this.ui.show('title');
    this.screenName = 'title';
    gameAudio.stopMusic();
    this.renderer.overview = false;
  }

  private rematch(): void {
    if (this.online) {
      if (!this.room.localPlayer.isHost) return;
      const players = this.room.getPlayers().slice(0, 4);
      if (players.length < 2) {
        this.toMenu();
        return;
      }
      this.sendStart(players, this.perTeam);
    } else {
      this.beginMatch(this.mode, this.lastSpecs, Math.floor(Math.random() * 1e9), this.perTeam);
    }
  }

  // ───────────────────────────── turnos ─────────────────────────────

  private pickCrate(): CrateSpawn | null {
    if (this.world.crates.length > 0 || this.turnSeq < 3 || Math.random() > 0.45) return null;
    for (let i = 0; i < 12; i++) {
      const x = 160 + Math.random() * (WORLD_W - 320);
      if (this.world.terrain.surfaceY(Math.round(x), this.world.waterY - 90) >= 0) {
        const ammoPool: WeaponId[] = ['sheep', 'slipper', 'pigeons', 'torch', 'kamikaze', 'mine', 'holy'];
        return {
          x: Math.round(x),
          kind: Math.random() < 0.5 ? 'hp' : 'ammo',
          weapon: ammoPool[Math.floor(Math.random() * ammoPool.length)],
        };
      }
    }
    return null;
  }

  private hostNextTurn(): void {
    const w = this.world;
    const n = w.teams.length;
    const prev = this.turnTeam;
    let cand = -1;
    let wrapped = false;
    for (let i = 1; i <= n; i++) {
      const c = (prev + i + n) % n;
      const didWrap = prev >= 0 && c <= prev;
      if (w.teamAlive(c)) {
        cand = c;
        wrapped = didWrap;
        break;
      }
    }
    if (cand < 0) {
      this.finish(-1);
      return;
    }
    let round = this.round;
    if (wrapped) {
      round++;
      if (round > SUDDEN_DEATH_ROUND) w.waterTarget += 28;
    }
    const team = w.teams[cand];
    const ws = w.teamWorms(cand);
    let worm = -1;
    for (let k = 0; k < ws.length; k++) {
      const i = (team.cursor + k) % ws.length;
      if (ws[i].state === 'alive') {
        worm = ws[i].id;
        team.cursor = i + 1;
        break;
      }
    }
    const wind = (Math.random() < 0.15 ? 0 : (Math.random() * 2 - 1) * (0.25 + Math.random() * 0.75));
    const crate = this.pickCrate();
    const snap = this.online ? w.makeSnapshot() : null;
    const seq = this.turnSeq + 1;
    this.send({ k: 'turn', n: seq, team: cand, worm, wind, round, crate, snap });
    this.applyTurn(seq, cand, worm, wind, round, crate, null);
  }

  private applyTurn(n: number, team: number, worm: number, wind: number, round: number, crate: CrateSpawn | null, snap: Snapshot | null): void {
    if (this.phase === 'over' || this.phase === 'menu') return;
    const w = this.world;
    if (snap) w.applySnapshot(snap);
    const prevRound = this.round;
    this.turnSeq = n;
    this.turnTeam = team;
    this.turnWormId = worm;
    this.round = round;
    w.wind = wind;
    w.beginTurn();
    w.projs = [];
    if (crate) w.spawnCrate(crate);
    w.activeId = worm;
    const t = w.teams[team];
    const aw = w.worm(worm);
    w.controlled = !!t && t.ctrl !== 'remote';
    w.canMove = false;
    w.input = { left: false, right: false, up: false, down: false };
    this.phase = 'intro';
    this.phaseT = 1.5;
    this.timeLeft = TURN_TIME;
    this.retreatLeft = 0;
    this.shotFired = false;
    this.firedWeapon = null;
    this.charging = false;
    this.charge = 0;
    this.target = null;
    this.waitingSync = false;
    this.activeBotStarted = false;
    this.lastTick = -1;
    this.controls.reset();
    this.renderer.manualUntil = 0;
    this.renderer.overview = false;
    if (!t || t.ammo[this.weapon] === 0) this.weapon = 'bazooka';
    if (aw) {
      aw.rope = null;
      aw.aim = Math.max(-20, Math.min(60, aw.aim));
      this.renderer.focus(aw.x, aw.y - 20);
    }
    if (round > SUDDEN_DEATH_ROUND && round > prevRound) {
      if (!this.suddenDeath) this.suddenDeath = true;
      gameAudio.siren();
      this.ui.banner(pickLine(SD_LINES), 'A água sobe a cada round!', '#f87171');
      this.fx.addShake(8);
    } else if (t) {
      const sub = this.mode === 'hotseat' ? `${t.owner}, é a sua vez!` : t.ctrl === 'bot' ? 'O bot está pensando...' : t.ctrl === 'remote' ? `Vez de ${t.owner}` : 'Sua vez! Capricha na mira!';
      this.ui.banner(`${t.name}`, `${aw ? aw.name : ''} — ${sub}`, t.color);
    }
  }

  private beginActive(): void {
    this.phase = 'active';
    this.world.canMove = true;
    const t = this.activeTeam();
    if (t && t.ctrl === 'bot') {
      const w = this.activeWorm();
      const bot = this.bots.get(t.id);
      if (w && bot) {
        this.botHost = this.makeBotHost(w, t);
        bot.begin(this.botHost);
        this.activeBotStarted = true;
      }
    }
  }

  private makeBotHost(w: Worm, t: Team): BotHost {
    return {
      world: this.world,
      worm: w,
      ammo: (id) => t.ammo[id],
      selectWeapon: (id) => {
        this.weapon = id;
      },
      setTarget: (x, y) => {
        this.target = { x, y };
      },
      setFuse: (n) => {
        this.fuse = n;
      },
      setInput: (i) => {
        this.world.input = i;
      },
      jump: () => {
        this.world.jump(w, false);
      },
      setCharge: (p) => {
        this.charge = p;
      },
      fire: () => this.fireNow(),
      detonate: () => this.world.detonateSheep(),
      retreating: () => this.phase === 'resolve' && this.retreatLeft > 0,
    };
  }

  private enterResolve(retreat: number): void {
    this.phase = 'resolve';
    this.retreatLeft = retreat;
    this.resolveT = 0;
    this.charging = false;
    this.charge = 0;
    this.waitingSync = false;
  }

  private resolveDone(): void {
    this.world.canMove = false;
    this.world.input = { left: false, right: false, up: false, down: false };
    if (!this.isHost) {
      this.waitingSync = true;
      return;
    }
    // fim de jogo? (só o host decide)
    const alive = this.world.teams.filter((t) => this.world.teamAlive(t.id));
    if (alive.length <= 1) {
      this.finish(alive.length === 1 ? alive[0].id : -1);
      return;
    }
    this.hostNextTurn();
  }

  private finish(winner: number): void {
    if (this.phase === 'over') return;
    if (this.online && this.isHost) this.send({ k: 'over', winner, snap: this.world.makeSnapshot() });
    this.beginOver(winner);
  }

  private beginOver(winner: number): void {
    this.phase = 'over';
    this.overT = 2.8;
    this.overInfo = { winner, snap: null };
    this.world.activeId = -1;
    this.world.canMove = false;
    this.charging = false;
    for (const w of this.world.worms) {
      w.victory = w.state === 'alive' && w.team === winner;
      if (w.victory) {
        w.speech = pickLine(VICTORY_LINES);
        w.speechT = 4;
        gameAudio.voice('cheer', w.id);
      }
    }
    this.renderer.overview = true;
    const t = this.world.teams[winner];
    this.ui.banner(t ? 'VITÓRIA!' : 'EMPATE!', t ? t.name : 'Todo mundo virou lápide-banana', t ? t.color : '#cbd5e1');
    gameAudio.fanfare();
    // pontuação
    let scoreTeam: number;
    if (this.mode === 'online') scoreTeam = this.world.teams.findIndex((x) => x.ctrl === 'local');
    else if (this.mode === 'solo') scoreTeam = 0;
    else scoreTeam = winner >= 0 ? winner : 0;
    const st = this.world.teams[scoreTeam];
    if (st) {
      const score = st.dmgDealt + st.kills * 100 + this.world.teamHp(st.id) + (scoreTeam === winner ? 500 : 0);
      reportGameScore(SLUG, score, { dano: st.dmgDealt, abates: st.kills });
    }
  }

  private showOverScreen(): void {
    const winner = this.overInfo ? this.overInfo.winner : -1;
    const w = this.world;
    const t = w.teams[winner];
    const rows = w.teams.map((tm) => ({
      name: `${tm.name}${tm.ctrl === 'bot' ? ' 🤖' : ''}`,
      color: tm.color,
      damage: tm.dmgDealt,
      kills: tm.kills,
      alive: w.aliveWorms(tm.id).length,
    }));
    this.screenName = 'over';
    this.ui.showOver({
      title: t ? `${t.name} venceu!` : 'Empate de bananas!',
      sub: t ? (t.ctrl === 'bot' ? 'Os macacos-bot dominaram a selva...' : `Parabéns, ${t.owner}! O rei da selva!`) : 'Ninguém sobrou pra contar a história.',
      color: t ? t.color : '#94a3b8',
      rows,
      canRematch: this.isHost,
      online: this.online,
    });
  }

  // ───────────────────────────── ações do jogador ─────────────────────────────

  private onAction(a: Action): void {
    if (this.phase === 'menu') return;
    switch (a.t) {
      case 'menu':
        if (this.ui.helpOpen()) this.ui.toggleHelp(false);
        else this.toMenu();
        break;
      case 'help':
        this.ui.toggleHelp(!this.ui.helpOpen());
        break;
      case 'overview':
        this.renderer.overview = !this.renderer.overview;
        break;
      case 'fireDown':
        this.fireDown();
        break;
      case 'fireUp':
        this.fireUp();
        break;
      case 'jump':
        this.doJump(false);
        break;
      case 'back':
        this.doJump(true);
        break;
      case 'weapon':
        this.selectWeapon(WEAPON_ORDER[a.idx]);
        break;
      case 'cycle':
        this.cycleWeapon(a.dir);
        break;
      case 'fuse':
        this.changeFuse(a.d);
        break;
      case 'skip':
        this.skipTurn();
        break;
      case 'click':
        this.clickMap(a.x, a.y);
        break;
      case 'mouseAim':
        this.mouseAim(a.x, a.y);
        break;
    }
  }

  private selectWeapon(id: WeaponId | undefined): void {
    if (!id || !this.canAct() || this.charging) return;
    const t = this.activeTeam();
    if (!t || t.ammo[id] === 0) {
      this.sdkHud.toast('Sem munição dessa arma!', 'chaos');
      return;
    }
    const w = this.activeWorm();
    if (w && w.rope && id !== 'rope') w.rope = null;
    this.weapon = id;
    gameAudio.click();
    this.sendSel();
  }

  private cycleWeapon(dir: number): void {
    if (!this.canAct() || this.charging) return;
    const t = this.activeTeam();
    if (!t) return;
    let i = WEAPON_ORDER.indexOf(this.weapon);
    for (let k = 0; k < WEAPON_ORDER.length; k++) {
      i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      if (t.ammo[WEAPON_ORDER[i]] !== 0) {
        this.weapon = WEAPON_ORDER[i];
        gameAudio.click();
        this.sendSel();
        return;
      }
    }
  }

  private changeFuse(d: number): void {
    if (!this.canAct()) return;
    this.fuse = Math.max(1, Math.min(5, this.fuse + d));
    gameAudio.click();
    this.sendSel();
  }

  private sendSel(): void {
    if (!this.online || !this.localHuman()) return;
    this.send({
      k: 'sel',
      n: this.turnSeq,
      wp: this.weapon,
      fuse: this.fuse,
      tx: this.target ? this.target.x : 0,
      ty: this.target ? this.target.y : 0,
      hasT: !!this.target,
    });
  }

  private clickMap(sx: number, sy: number): void {
    if (!this.canAct()) return;
    const def = WEAPONS[this.weapon];
    if (!def.target) return;
    this.target = this.renderer.screenToWorld(sx, sy);
    gameAudio.click();
    this.fx.spark(this.target.x, this.target.y, 8);
    this.sendSel();
  }

  private mouseAim(sx: number, sy: number): void {
    if (!this.canAct()) return;
    const w = this.activeWorm();
    if (!w || w.rope || this.charging) return;
    if (this.world.input.left || this.world.input.right) return;
    const p = this.renderer.screenToWorld(sx, sy);
    const dx = p.x - w.x;
    const dy = p.y - 2 - w.y;
    if (Math.abs(dx) > 10) w.facing = dx >= 0 ? 1 : -1;
    w.aim = Math.max(-85, Math.min(85, (Math.atan2(-dy, Math.max(8, Math.abs(dx))) * 180) / Math.PI));
  }

  private doJump(back: boolean): void {
    const w = this.activeWorm();
    if (!w || !this.localHuman() || w.state !== 'alive') return;
    const can = this.phase === 'active' || (this.phase === 'resolve' && this.retreatLeft > 0);
    if (!can || w.kami || w.torch) return;
    if (w.rope) this.world.releaseRope(w);
    else this.world.jump(w, back);
  }

  private fireDown(): void {
    if (this.phase === 'resolve' && this.firedWeapon === 'sheep' && this.localHuman() && this.world.hasSheep()) {
      this.world.detonateSheep();
      this.send({ k: 'det', n: this.turnSeq });
      return;
    }
    const w = this.activeWorm();
    if (!w || !this.localHuman() || w.state !== 'alive') return;
    if (this.phase === 'active' && w.rope && this.weapon !== 'rope') {
      this.world.releaseRope(w);
      return;
    }
    if (this.phase === 'active' && w.rope && this.weapon === 'rope') {
      this.world.releaseRope(w);
      return;
    }
    if (!this.canAct()) return;
    const def = WEAPONS[this.weapon];
    const t = this.activeTeam();
    if (!t || t.ammo[this.weapon] === 0) return;
    if (def.charge) {
      if (def.target && !this.target) {
        this.sdkHud.toast('Clique no mapa para marcar o alvo!', 'info');
        return;
      }
      this.charging = true;
      this.charge = 0;
    } else {
      this.fireNow();
    }
  }

  private fireUp(): void {
    if (this.charging && this.canAct()) this.fireNow();
    this.charging = false;
  }

  private skipTurn(): void {
    if (!(this.phase === 'active' || this.phase === 'intro') || !this.localHuman()) return;
    this.send({ k: 'skip', n: this.turnSeq });
    this.enterResolve(0);
  }

  /** dispara a arma atual com a mira / força atuais */
  private fireNow(): void {
    const w = this.activeWorm();
    const t = this.activeTeam();
    if (!w || !t || this.phase !== 'active' || this.shotFired || w.state !== 'alive') return;
    const id = this.weapon;
    const def = WEAPONS[id];
    if (t.ammo[id] === 0) return;
    if (def.target && !this.target) {
      if (t.ctrl === 'local') this.sdkHud.toast('Clique no mapa para marcar o alvo!', 'info');
      return;
    }
    const d = this.world.aimDir(w);
    const p: FireParams = {
      dx: Math.round(d.dx * 10000) / 10000,
      dy: Math.round(d.dy * 10000) / 10000,
      power: def.charge ? Math.max(0.08, Math.min(1, this.charge)) : 0,
      fuse: this.fuse,
      tx: this.target ? Math.round(this.target.x) : 0,
      ty: this.target ? Math.round(this.target.y) : 0,
      seed: Math.floor(Math.random() * 1e9),
    };
    this.doFire(w, id, p, true);
  }

  private doFire(w: Worm, id: WeaponId, p: FireParams, local: boolean): void {
    const def = WEAPONS[id];
    if (w.rope && id !== 'rope') w.rope = null;
    this.world.fire(w, id, p);
    if (local) this.send({ k: 'fire', n: this.turnSeq, wp: id, ...p });
    if (Math.random() < 0.7) {
      w.speech = pickLine(FIRE_LINES[id]);
      w.speechT = 1.8;
      if (id === 'kamikaze' || id === 'holy') gameAudio.voice('cheer', w.id);
    }
    this.charging = false;
    this.charge = 0;
    if (def.endsTurn) {
      this.shotFired = true;
      this.firedWeapon = id;
      this.enterResolve(def.retreat ? RETREAT_TIME : 0);
    }
  }

  // ───────────────────────────── rede ─────────────────────────────

  private onPlayers(players: PlayerProfile[]): void {
    if (this.phase === 'menu' || this.phase === 'over' || !this.online || this.screenName === 'lobby' || this.screenName === 'title' || this.screenName === 'setup') {
      if (this.room.roomCode && (this.screenName === 'title' || this.screenName === 'setup' || this.screenName === 'lobby') && this.phase === 'menu') {
        if (this.screenName !== 'lobby') {
          this.screenName = 'lobby';
          this.ui.show('lobby');
        }
        this.ui.setLobby(players, this.room.localPlayer.isHost, this.room.roomCode, this.room.localPlayer.id);
      } else if (this.screenName === 'lobby') {
        this.ui.setLobby(players, this.room.localPlayer.isHost, this.room.roomCode, this.room.localPlayer.id);
      }
      if (this.phase !== 'over') return;
    }
    if (!this.online) return;
    const ids = new Set(players.map((p) => p.id));
    if (!this.room.localPlayer.isHost && players.length > 0 && !players.some((p) => p.isHost)) {
      this.sdkHud.toast('O anfitrião saiu da sala!', 'chaos');
      this.toMenu();
      return;
    }
    for (const t of this.world.teams) {
      if (t.pid && t.ctrl === 'remote' && !ids.has(t.pid) && this.world.teamAlive(t.id)) {
        this.sdkHud.toast(`${t.owner} fugiu da guerra!`, 'chaos');
        for (const w of this.world.worms) {
          if (w.team === t.id && w.state !== 'gone') {
            w.state = 'gone';
            this.fx.splash(w.x, w.y, 0.6);
          }
        }
      }
    }
  }

  private refreshLobby(): void {
    this.ui.setLobby(this.room.getPlayers(), this.room.localPlayer.isHost, this.room.roomCode, this.room.localPlayer.id);
  }

  private onNet(sender: string, m: NetMsg): void {
    switch (m.k) {
      case 'start': {
        if (this.room.localPlayer.isHost) return;
        this.startOnline(m.seed, m.perTeam, m.teams);
        break;
      }
      case 'turn': {
        if (this.room.localPlayer.isHost || !this.online) return;
        this.applyTurn(m.n, m.team, m.worm, m.wind, m.round, m.crate, m.snap);
        break;
      }
      case 'over': {
        if (this.room.localPlayer.isHost || !this.online) return;
        if (this.phase === 'over' || this.phase === 'menu') return;
        if (m.snap) this.world.applySnapshot(m.snap);
        this.beginOver(m.winner);
        break;
      }
      case 'quit':
        break;
      case 'pose': {
        if (!this.online || m.n !== this.turnSeq) return;
        const t = this.activeTeam();
        if (!t || t.pid !== sender || t.ctrl !== 'remote') return;
        const w = this.world.worm(m.w);
        if (!w || w.id !== this.turnWormId || w.state !== 'alive') return;
        w.facing = m.f;
        w.aim = m.a;
        if (m.ctl) {
          w.net = { x: m.x, y: m.y, vx: m.vx, vy: m.vy, t: this.world.time };
          w.rope = m.rope ? { ax: m.rope[0], ay: m.rope[1], len: m.rope[2] } : null;
        } else {
          w.net = null;
        }
        if (this.phase === 'active') this.weapon = m.wp;
        break;
      }
      case 'sel': {
        if (!this.online || m.n !== this.turnSeq) return;
        const t = this.activeTeam();
        if (!t || t.pid !== sender || t.ctrl !== 'remote') return;
        this.weapon = m.wp;
        this.fuse = m.fuse;
        this.target = m.hasT ? { x: m.tx, y: m.ty } : null;
        break;
      }
      case 'fire': {
        if (!this.online || m.n !== this.turnSeq) return;
        const t = this.activeTeam();
        const w = this.activeWorm();
        if (!t || !w || t.pid !== sender || t.ctrl !== 'remote' || this.shotFired) return;
        if (this.phase !== 'active' && this.phase !== 'intro') return;
        if (t.ammo[m.wp] === 0 || w.state !== 'alive') return;
        if (this.phase === 'intro') this.phase = 'active';
        const { k: _k, n: _n, wp, ...p } = m;
        void _k;
        void _n;
        this.doFire(w, wp, p, false);
        break;
      }
      case 'det': {
        if (!this.online || m.n !== this.turnSeq) return;
        const t = this.activeTeam();
        if (t && t.pid === sender) this.world.detonateSheep();
        break;
      }
      case 'skip': {
        if (!this.online || m.n !== this.turnSeq) return;
        const t = this.activeTeam();
        if (t && t.pid === sender && (this.phase === 'active' || this.phase === 'intro')) this.enterResolve(0);
        break;
      }
      default:
        break;
    }
  }

  // ───────────────────────────── laço principal ─────────────────────────────

  private loop(ts: number): void {
    const dtReal = Math.min(0.05, this.lastT ? (ts - this.lastT) / 1000 : 0.016);
    this.lastT = ts;
    this.time += dtReal;
    if (this.phase === 'menu') {
      this.acc = 0;
      this.world.step(0);
    } else {
      this.acc += dtReal;
      let guard = 0;
      while (this.acc >= FIXED && guard++ < 5) {
        this.logic(FIXED);
        this.world.step(FIXED);
        this.acc -= FIXED;
      }
    }
    this.handleEvents();
    this.fx.update(dtReal);
    this.updateCamera(dtReal);
    this.renderer.update(dtReal, this.fx.shake);
    const aw = this.activeWorm();
    const showAim = !!aw && aw.state === 'alive' && this.phase === 'active' && !this.shotFired && !aw.kami && !aw.torch && !aw.rope;
    this.renderer.draw({
      world: this.world,
      fx: this.fx,
      time: this.time,
      activeId: this.phase === 'over' || this.phase === 'menu' ? -1 : this.turnWormId,
      showArrow: this.phase === 'intro' || (this.phase === 'active' && !this.shotFired),
      aiming: showAim,
      weapon: showAim ? this.weapon : null,
      charge: this.charge,
      target: showAim ? this.target : null,
      sudden: this.suddenDeath,
      controllable: this.canAct(),
    });
    if (this.phase !== 'menu') this.updateHud();
    if (this.phase === 'over' && this.overT >= 0) {
      this.overT -= dtReal;
      this.confettiT -= dtReal;
      if (this.confettiT <= 0) {
        this.confettiT = 0.06;
        this.fx.confetti(this.renderer.cam.x, this.renderer.cam.y - 260);
      }
      if (this.overT < 0 && this.screenName !== 'over') this.showOverScreen();
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  private logic(dt: number): void {
    if (this.pendingStart >= 0) {
      this.pendingStart -= dt;
      if (this.pendingStart < 0 && this.isHost && this.phase === 'resolve' && this.turnSeq === 0) this.hostNextTurn();
      return;
    }
    const w = this.activeWorm();
    const t = this.activeTeam();
    if (this.phase === 'over') {
      this.world.input = { left: false, right: false, up: false, down: false };
      return;
    }
    if (!w || !t) {
      return;
    }
    const human = t.ctrl === 'local';

    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.beginActive();
      return;
    }

    if (this.phase === 'active') {
      this.timeLeft -= dt;
      const secs = Math.ceil(this.timeLeft);
      if (secs <= 5 && secs > 0 && secs !== this.lastTick) {
        this.lastTick = secs;
        gameAudio.tick(secs <= 3);
      }
      if (human) {
        const inp = this.controls.poll();
        this.world.input = this.charging ? { ...inp, left: false, right: false } : inp;
        if (w.state === 'alive' && !w.rope && !w.kami && !w.torch) {
          if (inp.up) w.aim = Math.min(85, w.aim + 75 * dt);
          if (inp.down) w.aim = Math.max(-85, w.aim - 75 * dt);
        }
        if (this.charging) {
          const def = WEAPONS[this.weapon];
          this.charge = Math.min(1, this.charge + dt / 1.4);
          void def;
          if (this.charge >= 1) this.fireNow();
        }
      } else if (t.ctrl === 'bot' && this.botHost) {
        const bot = this.bots.get(t.id);
        if (bot) bot.update(dt, this.botHost);
      }
      if (this.phase === 'active') {
        if (w.state !== 'alive') {
          this.enterResolve(0);
        } else if (this.timeLeft <= 0) {
          if (this.charging) this.fireNow();
          else this.enterResolve(0);
        }
      }
      this.sendPose(dt);
      return;
    }

    if (this.phase === 'resolve') {
      this.resolveT += dt;
      this.retreatLeft = Math.max(0, this.retreatLeft - dt);
      const canWalk = this.retreatLeft > 0 && w.state === 'alive' && !w.kami && !w.torch;
      this.world.canMove = canWalk;
      if (human) {
        this.world.input = canWalk ? this.controls.poll() : { left: false, right: false, up: false, down: false };
      } else if (t.ctrl === 'bot' && this.botHost) {
        const bot = this.bots.get(t.id);
        if (bot) bot.update(dt, this.botHost);
        if (!canWalk) this.world.input = { left: false, right: false, up: false, down: false };
      }
      this.sendPose(dt);
      if (w.rope && !canWalk) this.world.releaseRope(w);
      const settled = this.world.isSettled();
      if (this.retreatLeft <= 0 && ((settled && this.resolveT > 0.8) || this.resolveT > 35)) {
        if (!this.waitingSync) this.resolveDone();
      }
    }
  }

  private sendPose(dt: number): void {
    if (!this.online) return;
    const t = this.activeTeam();
    const w = this.activeWorm();
    if (!t || !w || t.ctrl !== 'local' || w.state !== 'alive') return;
    this.poseT -= dt;
    if (this.poseT > 0) return;
    this.poseT = 0.066;
    const ctl = !w.launched && !w.kami && !w.torch;
    this.send({
      k: 'pose',
      n: this.turnSeq,
      w: w.id,
      x: Math.round(w.x * 100) / 100,
      y: Math.round(w.y * 100) / 100,
      vx: Math.round(w.vx),
      vy: Math.round(w.vy),
      f: w.facing,
      a: Math.round(w.aim * 10) / 10,
      ctl: ctl ? 1 : 0,
      rope: w.rope ? [Math.round(w.rope.ax * 10) / 10, Math.round(w.rope.ay * 10) / 10, Math.round(w.rope.len)] : null,
      wp: this.weapon,
    });
  }

  // ───────────────────────────── eventos / câmera / HUD ─────────────────────────────

  private handleEvents(): void {
    const evs = this.world.events;
    if (evs.length === 0) return;
    for (const e of evs) this.handleEvent(e);
    evs.length = 0;
  }

  private handleEvent(e: SimEvent): void {
    const fx = this.fx;
    switch (e.t) {
      case 'explosion':
        fx.explosion(e.x, e.y, e.r, e.kind === 'holy');
        gameAudio.explosion(e.r);
        if (e.kind === 'holy') {
          gameAudio.holyBoom();
          fx.bananaBurst(e.x, e.y, 22);
        }
        if (e.kind === 'poop') fx.bananaBurst(e.x, e.y, 3);
        this.focus = { x: e.x, y: e.y, t: 1.4 };
        break;
      case 'debris':
        fx.debris(e.x, e.y, e.r);
        break;
      case 'damage': {
        const col = e.fall ? '#fdba74' : '#fb7185';
        fx.text(e.w.x, e.w.y - 34, `-${e.amount}`, col, Math.min(34, 16 + e.amount * 0.35));
        break;
      }
      case 'die': {
        const w = e.w;
        fx.bananaBurst(w.x, w.y, 8);
        w.speech = pickLine(e.cause === 'drown' ? DROWN_LINES : DEATH_LINES);
        w.speechT = 2.4;
        gameAudio.voice(e.cause === 'drown' ? 'drown' : 'die', w.id);
        fx.text(w.x, w.y - 50, e.cause === 'drown' ? 'GLUB!' : e.cause === 'out' ? 'FORA!' : 'F ✝', '#fff', 20);
        this.focus = { x: w.x, y: w.y, t: 1.2 };
        this.fx.addShake(4);
        break;
      }
      case 'splash':
        fx.splash(e.x, e.y, e.size);
        gameAudio.splash();
        break;
      case 'bounce':
        gameAudio.bounce();
        fx.spark(e.x, e.y, 3);
        break;
      case 'trail':
        if (e.kind === 'smoke') fx.smokeTrail(e.x, e.y);
        else if (e.kind === 'fire') fx.fireTrail(e.x, e.y);
        else if (e.kind === 'holy') fx.holyTrail(e.x, e.y);
        else if (e.kind === 'feather') fx.feather(e.x, e.y);
        else fx.spark(e.x, e.y, 1);
        break;
      case 'fuse':
        fx.spark(e.x, e.y - 4, 1);
        break;
      case 'slap':
        fx.spark(e.x, e.y, 10);
        fx.text(e.x, e.y - 14, 'TAPA!', '#fde047', 22);
        fx.addShake(4);
        break;
      case 'pickup':
        fx.text(e.w.x, e.w.y - 40, e.text, '#86efac', 18);
        fx.bananaBurst(e.w.x, e.w.y, 6);
        gameAudio.pickup();
        break;
      case 'speak': {
        const w = e.w;
        gameAudio.voice(e.kind === 'bighurt' ? 'bighurt' : e.kind === 'fall' ? 'hurt' : 'hurt', w.id);
        if (w.speechT < 0.6) {
          w.speech = pickLine(e.kind === 'bighurt' ? BIG_HURT_LINES : e.kind === 'fall' ? FALL_LINES : HURT_LINES);
          w.speechT = 2.2;
        }
        break;
      }
      case 'sound':
        this.playSound(e.name);
        break;
    }
  }

  private playSound(name: string): void {
    switch (name) {
      case 'shoot':
        gameAudio.shoot();
        break;
      case 'throw':
        gameAudio.throwSfx();
        break;
      case 'holy':
        gameAudio.holy();
        break;
      case 'baa':
        gameAudio.baa();
        break;
      case 'coo':
        gameAudio.coo();
        break;
      case 'plant':
        gameAudio.plant();
        break;
      case 'torch':
        gameAudio.torch();
        break;
      case 'kami':
        gameAudio.kami();
        break;
      case 'slap':
        gameAudio.slap();
        break;
      case 'rope':
        gameAudio.rope();
        break;
      case 'whiff':
        gameAudio.whiff();
        break;
      case 'jump':
        gameAudio.jump();
        break;
      case 'thud':
        gameAudio.thud();
        break;
      case 'mine':
        gameAudio.mineBeep();
        break;
      case 'crate':
        gameAudio.crate();
        break;
    }
  }

  private updateCamera(dt: number): void {
    const r = this.renderer;
    if (this.focus.t > 0) this.focus.t -= dt;
    if (this.phase === 'menu') {
      r.focus(WORLD_W / 2, 560);
      r.overview = true;
      return;
    }
    if (this.phase === 'over') return;
    if (r.manualUntil > performance.now()) return;
    const projs = this.world.projs;
    const main = projs.find((p) => p.kind !== 'pigeon');
    if (main) {
      r.focus(main.x + main.vx * 0.2, main.y + main.vy * 0.2);
      return;
    }
    const bird = projs.find((p) => p.kind === 'pigeon');
    if (bird) {
      r.focus(bird.tx, WORLD_H / 2 - 150);
      return;
    }
    if (this.focus.t > 0) {
      r.focus(this.focus.x, this.focus.y);
      return;
    }
    const aw = this.activeWorm();
    if (aw && aw.state !== 'gone') {
      r.focus(aw.x, aw.y - 30);
      return;
    }
    // procura macaco em movimento
    const mover = this.world.worms.find((w) => w.state !== 'gone' && !w.grounded);
    if (mover) r.focus(mover.x, mover.y);
  }

  private updateHud(): void {
    const w = this.world;
    const t = this.activeTeam();
    const aw = this.activeWorm();
    const human = !!t && t.ctrl === 'local';
    let hint = '';
    let waiting = '';
    if (this.phase === 'over') hint = '🏁 Fim de jogo!';
    else if (this.phase === 'intro') hint = t ? `Preparar... ${t.owner}` : '';
    else if (!human && t) hint = t.ctrl === 'bot' ? '🤖 O macaco-bot está calculando a mira...' : `🎯 Vez de ${t.owner} (${t.name})`;
    else if (this.shotFired) hint = this.firedWeapon === 'sheep' ? 'ESPAÇO detona a capivara! Fuja!' : this.retreatLeft > 0 ? '🏃 Fuja! Tempo de retirada...' : 'Aguarde o caos acabar...';
    else {
      const def = WEAPONS[this.weapon];
      hint = `${def.emoji} <b>${def.name}</b> — ${def.desc}`;
      if (def.target && !this.target) hint += ' <b style="color:#fca5a5">(clique no mapa!)</b>';
    }
    if (this.waitingSync) waiting = '⏳ Aguardando o anfitrião...';
    const teams = w.teams.map((tm) => ({
      name: tm.name,
      color: tm.color,
      hp: w.teamHp(tm.id),
      alive: w.aliveWorms(tm.id).length,
      total: this.perTeam,
      current: tm.id === this.turnTeam && this.phase !== 'over',
      owner: tm.ctrl === 'bot' ? '🤖 Bot' : tm.ctrl === 'remote' ? `🌐 ${tm.owner}` : tm.owner,
    }));
    const timerLabel = this.phase === 'resolve' && this.retreatLeft > 0 ? 'retreat' : this.phase === 'active' ? 'turn' : 'idle';
    const s: HudState = {
      teamName: t ? t.name : '',
      teamColor: t ? t.color : '#fff',
      wormName: aw ? aw.name : '',
      timeLeft: timerLabel === 'retreat' ? this.retreatLeft : this.phase === 'active' || this.phase === 'intro' ? this.timeLeft : 0,
      timerLabel,
      wind: w.wind,
      teams,
      weapon: human && this.phase === 'active' && !this.shotFired ? this.weapon : null,
      ammo: t ? t.ammo : null,
      fuse: this.fuse,
      canPick: this.canAct(),
      hint,
      charge: this.charge,
      sudden: this.suddenDeath,
      waiting,
    };
    this.ui.updateHud(s);
  }
}

