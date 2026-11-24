import {
  getGameScore,
  mountMonkeyHud,
  PeerRoom,
  reportGameScore,
  type PeerEnvelope,
  type PlayerProfile,
} from '@monkey-slop/sdk';
import { fgAudio, type FgSound } from './audio';
import { Controls } from './controls';
import { Match, type HumanSlot } from './match';
import { applySnap, buildSnap, type InputMsg, type Snap } from './net';
import { Renderer, type View } from './render';
import { Ui } from './ui';
import type { Ev, MatchMode, Monkey } from './types';
import { emptyInput } from './types';

const SLUG = 'monkey-fallguys';
const STEP = 1 / 60;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const renderer = new Renderer(canvas);
const controls = new Controls();

type Screen = 'title' | 'lobby' | 'game';
let screen: Screen = 'title';
let mode: MatchMode = 'solo';
let match: Match | null = null;
let localOwners: string[] = [];
let spectate = -1;
let time = 0;
let acc = 0;
let snapAcc = 0;
let snapSeq = 0;
let inputAcc = 0;
let pendingEv: Ev[] = [];
let rosterTimer = 0;
let rosterBoost = 0;
let onlineConnected = false;
let reported = false;
let lastSolo: 'solo' | 'local2p' = 'solo';

// ───────────────────────── networking ─────────────────────────
const room = new PeerRoom<unknown>(SLUG, {
  onStatus: (status) => {
    if (status === 'connected') {
      onlineConnected = true;
      if (screen === 'title' || screen === 'lobby') enterLobby();
    } else if (status === 'idle' || status === 'error') {
      if (onlineConnected && (screen === 'lobby' || (screen === 'game' && (mode === 'host' || mode === 'client')))) {
        hud.toast('Sala encerrada.', 'info');
        toTitle();
      }
      onlineConnected = false;
    }
  },
  onPlayersChange: (players) => {
    hud.setPlayers(players);
    if (screen === 'lobby') refreshLobby();
    if (screen === 'game' && mode === 'host' && match) {
      const ids = new Set(players.map((p) => p.id));
      for (const m of match.monkeys) {
        if (!m.isBot && m.owner && !m.owner.startsWith('L') && !ids.has(m.owner)) {
          match.botify(m.owner);
          hud.toast(`${m.name} saiu — um bot assumiu!`, 'chaos');
          rosterBoost = 6;
        }
      }
    }
    if (screen === 'game' && mode === 'client' && players.length <= 1) {
      hud.toast('O host saiu da sala.', 'chaos');
      toTitle();
    }
  },
  onMessage: (env: PeerEnvelope<unknown>) => {
    if (env.type === 'in') {
      if (mode === 'host' && match) {
        const p = env.payload as InputMsg;
        match.setInput(env.senderId, { mx: p.mx, jump: !!p.j, dive: !!p.d, grab: !!p.g });
      }
    } else if (env.type === 'snap') {
      if (room.localPlayer.isHost) return;
      const snap = env.payload as Snap;
      if (screen !== 'game' || mode !== 'client') {
        if (!snap.ro && !match) return;
        enterClientGame();
      }
      if (match && applySnap(match, snap)) {
        for (const ev of snap.ev) handleEvent(ev);
        if (match.over && !reported) finishGame();
        else if (!match.over && reported) {
          reported = false;
          ui.hideAll();
        }
      }
    } else if (env.type === 'lobby') {
      if (!room.localPlayer.isHost && screen === 'game') {
        match = null;
        enterLobby();
      }
    }
  },
});

const hud = mountMonkeyHud({ slug: SLUG, title: 'Fall Macacos: Tombo Royale', room });

// ───────────────────────── UI ─────────────────────────
const ui = new Ui(uiRoot, {
  onSolo: () => startLocal('solo'),
  onLocal: () => startLocal('local2p'),
  onOnline: () => enterLobby(),
  onStartOnline: () => startOnlineHost(),
  onAgain: () => {
    if (mode === 'host') backToLobby();
    else if (mode === 'solo' || mode === 'local2p') startLocal(lastSolo);
  },
  onMenu: () => {
    if (mode === 'host' && onlineConnected) backToLobby();
    else toTitle();
  },
});

function toTitle(): void {
  screen = 'title';
  match = null;
  controls.active = false;
  controls.showTouch(false);
  renderer.resetVis();
  ui.showTitle(getGameScore(SLUG).bestScore);
}

function enterLobby(): void {
  screen = 'lobby';
  match = null;
  controls.active = false;
  controls.showTouch(false);
  refreshLobby();
}

function refreshLobby(): void {
  ui.showLobby(room.getPlayers(), room.localPlayer.isHost, room.roomCode, !!room.roomCode);
}

function backToLobby(): void {
  if (mode === 'host') room.send('lobby', null);
  match = null;
  enterLobby();
}

function myOwner(): string {
  return room.localPlayer.id;
}

function beginGame(): void {
  screen = 'game';
  reported = false;
  acc = 0;
  snapAcc = 0;
  pendingEv = [];
  spectate = -1;
  ui.hideAll();
  renderer.resetVis();
  controls.active = true;
  controls.split = mode === 'local2p';
  controls.clearEdges();
  controls.showTouch(mode !== 'local2p');
  fgAudio.startMusic();
}

function startLocal(kind: 'solo' | 'local2p'): void {
  lastSolo = kind;
  mode = kind;
  const humans: HumanSlot[] =
    kind === 'solo'
      ? [{ owner: 'L0', name: room.localPlayer.name }]
      : [
          { owner: 'L0', name: 'Macaco P1' },
          { owner: 'L1', name: 'Macaco P2' },
        ];
  localOwners = humans.map((h) => h.owner);
  match = new Match(kind, humans, Math.max(ui.total, 8));
  match.start();
  beginGame();
}

function startOnlineHost(): void {
  if (!room.roomCode || !room.localPlayer.isHost) return;
  const players = room.getPlayers().slice(0, 8);
  // host first
  players.sort((a, b) => Number(b.isHost) - Number(a.isHost));
  const humans: HumanSlot[] = players.map((p) => ({ owner: p.id, name: p.name }));
  mode = 'host';
  localOwners = [myOwner()];
  match = new Match('host', humans, Math.max(ui.total, humans.length, 8));
  match.start();
  rosterBoost = 10;
  beginGame();
  sendSnapshot(true);
}

function enterClientGame(): void {
  mode = 'client';
  localOwners = [myOwner()];
  match = Match.client();
  beginGame();
}

function localMonkeys(): Monkey[] {
  if (!match) return [];
  return match.monkeys.filter((m) => !m.isBot && localOwners.includes(m.owner));
}

function finishGame(): void {
  if (!match || reported) return;
  reported = true;
  const mine = localMonkeys();
  let best = 0;
  for (const m of mine) {
    const sc =
      mode === 'client'
        ? (m.outRound > 0 ? m.outRound - 1 : match.roundNo) * 120 + (m.id === match.champion ? 1000 : 0)
        : match.scoreFor(m);
    best = Math.max(best, sc);
  }
  if (mine.length) reportGameScore(SLUG, best, { champion: mine.some((m) => m.id === match!.champion) ? 1 : 0 });
  const champ = match.monkeys[match.champion];
  const won = mine.some((m) => m.id === match!.champion);
  const mineTxt = mine.length
    ? won
      ? 'VOCÊ É O CAMPEÃO DA SELVA! 🍌🎉'
      : `Você caiu na rodada ${Math.max(1, mine[0].outRound || match.roundNo)}. Tente de novo, macaco!`
    : 'Obrigado por assistir!';
  ui.showOver(champ ? champ.name : '—', mineTxt, best, mode !== 'client');
  hud.setPlayers(room.getPlayers());
}

controls.onRestart = () => {
  if (screen !== 'game' || !match) return;
  if (mode === 'solo' || mode === 'local2p') startLocal(lastSolo);
  else if (mode === 'host' && match.over) backToLobby();
};

controls.onTab = () => {
  if (!match) return;
  const alive = match.monkeys.filter((m) => !m.gone);
  if (!alive.length) return;
  const i = alive.findIndex((m) => m.id === spectate);
  spectate = alive[(i + 1) % alive.length].id;
};

controls.initTouch(document.body);
controls.showTouch(false);

// ───────────────────────── events (visuals + audio) ─────────────────────────
function handleEvent(ev: Ev): void {
  if (!match) return;
  const view = currentView();
  renderer.handle(ev, view);
  const local = ev.id !== undefined && view.localIds.includes(ev.id);
  switch (ev.k) {
    case 'sfx': {
      const s = ev.s as FgSound;
      const quietForOthers = ['jump', 'dive', 'grab', 'tile', 'creak', 'whistle'];
      if (!local && quietForOthers.includes(s)) {
        if (s === 'tile' && Math.random() < 0.15) fgAudio.play(s, 0.4);
        break;
      }
      fgAudio.play(s, local ? 1 : 0.45);
      break;
    }
    case 'goal':
      fgAudio.play('goal');
      break;
    case 'qual':
      if (local) fgAudio.play('qual');
      break;
    case 'elim':
      if (local) fgAudio.play('elim');
      break;
    case 'count':
      fgAudio.play('count');
      break;
    case 'go':
      fgAudio.play('go');
      break;
    case 'champion':
      fgAudio.play('fanfare');
      break;
    case 'round':
    case 'roundend':
      fgAudio.play('whoosh', 0.7);
      break;
    case 'over':
      finishGame();
      break;
    default:
      break;
  }
}

function currentView(): View {
  const m = match!;
  const ids = localMonkeys().map((x) => x.id);
  // keep the spectated target valid
  const sp = m.monkeys[spectate];
  if (!sp || sp.gone) {
    let best: Monkey | null = null;
    for (const c of m.monkeys) {
      if (c.gone) continue;
      if (!best || (c.status === 'alive' && best.status !== 'alive') || (c.status === best.status && c.prog > best.prog)) best = c;
    }
    spectate = best ? best.id : -1;
  }
  return { match: m, localIds: ids, spectate, time };
}

// ───────────────────────── snapshots ─────────────────────────
function sendSnapshot(force = false): void {
  if (!match || mode !== 'host' || !onlineConnected) return;
  rosterTimer -= STEP;
  const withRoster = force || rosterTimer <= 0 || rosterBoost > 0;
  if (withRoster) {
    rosterTimer = 0.8;
    rosterBoost = Math.max(0, rosterBoost - 1);
  }
  const evs = pendingEv.length > 60 ? pendingEv.slice(-60) : pendingEv;
  pendingEv = [];
  room.send('snap', buildSnap(match, snapSeq++, withRoster, evs));
}

// ───────────────────────── main loop ─────────────────────────
function timeScale(m: Match): number {
  if (mode === 'client') return 1;
  const humans = m.monkeys.filter((x) => !x.isBot);
  if (humans.length === 0) return 1;
  const anyIn = humans.some((x) => x.status !== 'out');
  const anyAlive = humans.some((x) => x.status === 'alive');
  if (!anyIn && m.phase !== 'champion') return 3;
  if (!anyAlive && m.phase === 'play') return 2;
  return 1;
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (screen !== 'game' || !match) {
    renderer.renderTitle(dt, time);
    requestAnimationFrame(frame);
    return;
  }

  const m = match;
  if (mode === 'client') {
    // local clocks between snapshots
    m.phaseT += dt;
    if (m.phase === 'play') {
      m.world.t += dt;
      m.world.timeLeft = m.world.limit - m.world.t;
    }
    inputAcc += dt;
    if (inputAcc >= 1 / 30) {
      inputAcc = 0;
      const mine = localMonkeys()[0];
      if (mine) {
        const i = controls.read(0);
        const msg: InputMsg = { mx: i.mx, j: i.jump ? 1 : 0, d: i.dive ? 1 : 0, g: i.grab ? 1 : 0 };
        room.send('in', msg);
      } else controls.clearEdges();
    }
  } else {
    // local humans feed inputs
    const mine = localMonkeys();
    for (const h of mine) {
      const slot = h.owner === 'L1' ? 1 : 0;
      const i = controls.read(slot);
      h.input.mx = i.mx;
      h.input.grab = i.grab;
      if (i.jump) h.input.jump = true;
      if (i.dive) h.input.dive = true;
    }
    acc += dt * timeScale(m);
    let guard = 0;
    while (acc >= STEP && guard++ < 12) {
      m.update(STEP);
      acc -= STEP;
      if (m.events.length) {
        const evs = m.events;
        m.events = [];
        for (const ev of evs) {
          handleEvent(ev);
          if (mode === 'host') pendingEv.push(ev);
        }
      }
      if (mode === 'host') {
        snapAcc += STEP;
        if (snapAcc >= 1 / 24) {
          snapAcc = 0;
          sendSnapshot();
        }
      }
    }
    if (guard >= 12) acc = 0;
  }

  renderer.render(currentView(), dt);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
new ResizeObserver(() => renderer.resize()).observe(canvas);

// first user interaction unlocks audio; also auto-join if ?room= is present
window.addEventListener('pointerdown', () => fgAudio.play('click', 0.0), { once: true });
if (room.getRoomFromUrl()) enterLobby();
else toTitle();
requestAnimationFrame(frame);

// keep types referenced for tooling
void emptyInput;
void (null as PlayerProfile | null);
