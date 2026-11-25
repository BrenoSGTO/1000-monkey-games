import { PeerRoom, mountMonkeyHud, reportGameScore, type PeerEnvelope, type PlayerProfile } from '@monkey-slop/sdk';
import { kartAudio } from './audio';
import { MONKEY_KART_CONTROLS } from './controls';
import { DRIVERS } from './drivers';
import { Fx } from './fx';
import { InputManager } from './input';
import type { Kart } from './kart';
import {
  type NetInput,
  SnapBuffer,
  type Snapshot,
  applySnapshot,
  decodeInput,
  encodeInput,
  encodeSnapshot,
  interpolateRemotes,
} from './net';
import { Renderer, type ViewSpec } from './render';
import { TRACK_DEFS, buildTrack } from './tracks';
import { CC_SETTINGS, GP_POINTS, ITEM_INFO, type Input, type ItemType, LAPS, emptyInput } from './types';
import {
  type LobbyInfo,
  type ResultRow,
  type Setup,
  helpHtml,
  pauseHtml,
  podiumHtml,
  resultsHtml,
  setupHtml,
  titleHtml,
} from './ui';
import { clamp, shade } from './util';
import { type GameEvent, type KartEntry, World } from './world';

const SLUG = 'monkey-kart';
const STEP = 1 / 60;

// ------------------------------------------------------------------ state
type Screen = 'title' | 'help' | 'setup' | 'loading' | 'race' | 'results' | 'podium';

interface RaceCfg {
  trackIdx: number;
  cc: number;
  entries: { driver: number; name: string; owner: number; netId: string | null }[];
  order: number[];
  gp: { order: number[]; idx: number } | null;
  format: 'gp' | 'single';
  mode: Setup['mode'];
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('mk-ui') as HTMLDivElement;
const renderer = new Renderer(canvas);
const fx = new Fx();
const input = new InputManager();

const setup: Setup = { mode: 'solo', format: 'gp', cc: 1, track: 0, pick: [0, 3], editing: 0 };
let screen: Screen = 'title';
let world: World | null = null;
let cfg: RaceCfg | null = null;
let paused = false;
let acc = 0;
let doneAt = 0;
let gpPoints: number[] = new Array(DRIVERS.length).fill(0);
let gpApplied = false;
let lastRows: ResultRow[] = [];
let namesByDriver = new Map<number, string>();
let musicStarted = false;
let rouletteSfxT = 0;

// networking
let snapBuf = new SnapBuffer();
let netAccum = 0;
let inputSeq = 0;
const sendTimes = new Map<number, number>();
let rtt = 0.08;
const netInputs = new Map<string, Input>();
const ackBySender: Record<string, number> = {};
let evOut: GameEvent[] = [];
let snapTick = 0;
let lobbyPicks: Record<string, number> = {};
let myKartId = -1;
let netRace = false;

const room = new PeerRoom<unknown>(SLUG, {
  onPlayersChange(players: PlayerProfile[]) {
    hud.setPlayers(players);
    onRosterChange(players);
  },
  onMessage(env: PeerEnvelope<unknown>) {
    onNetMessage(env);
  },
  onStatus() {
    if (screen === 'setup' && setup.mode === 'online') renderSetup();
  },
});
let pausedByGuide = false;
const hud = mountMonkeyHud({
  slug: SLUG,
  title: 'Mico Kart: Corrida da Casca',
  room,
  controls: {
    ...MONKEY_KART_CONTROLS,
    onOpenChange(open) {
      if (open) {
        if (screen === 'race' && uiRoot.innerHTML === '') {
          pausedByGuide = true;
          setPaused(true);
        }
      } else if (pausedByGuide) {
        pausedByGuide = false;
        if (screen === 'race') setPaused(false);
      }
    },
  },
});

const isHost = () => room.localPlayer.isHost && !!room.roomCode;
const isGuestNet = () => netRace && !room.localPlayer.isHost;

// ---------------------------------------------------------------- UI glue
function setUi(html: string): void {
  uiRoot.innerHTML = html;
}
function clearUi(): void {
  uiRoot.innerHTML = '';
}

function goTitle(): void {
  leaveRace();
  screen = 'title';
  setUi(titleHtml());
  input.refreshTouchVisibility(false);
}

function onlineLobby(): LobbyInfo | null {
  if (setup.mode !== 'online') return null;
  const players = room.getPlayers();
  const connected = !!room.roomCode && players.length > 0;
  return {
    isHost: isHost(),
    connected,
    code: room.roomCode,
    players: players.map((p) => ({ id: p.id, name: p.name, host: p.isHost, driver: lobbyPicks[p.id] ?? (p.id === room.localPlayer.id ? setup.pick[0] : 0) })),
  };
}

function renderSetup(): void {
  if (screen !== 'setup') return;
  const lobby = onlineLobby();
  const taken = new Set<number>();
  if (lobby) for (const p of lobby.players) if (p.id !== room.localPlayer.id) taken.add(p.driver);
  const scroll = uiRoot.firstElementChild?.scrollTop ?? 0;
  setUi(setupHtml(setup, lobby, taken));
  if (uiRoot.firstElementChild) (uiRoot.firstElementChild as HTMLElement).scrollTop = scroll;
}

function goSetup(mode: Setup['mode']): void {
  leaveRace();
  setup.mode = mode;
  setup.editing = 0;
  screen = 'setup';
  input.twoPlayer = mode === 'local2p';
  if (mode === 'local2p' && setup.pick[1] === setup.pick[0]) setup.pick[1] = (setup.pick[0] + 1) % DRIVERS.length;
  renderSetup();
}

uiRoot.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!el) return;
  kartAudio.unlock();
  if (!musicStarted) {
    musicStarted = true;
    kartAudio.startMusic('menu');
  }
  const act = el.dataset.act!;
  const v = el.dataset.v ?? '';
  kartAudio.sfx('click');
  switch (act) {
    case 'mode':
      goSetup(v as Setup['mode']);
      break;
    case 'help':
      screen = 'help';
      setUi(helpHtml());
      break;
    case 'back':
      if (screen === 'setup' && setup.mode === 'online' && room.roomCode) room.disconnect();
      goTitle();
      break;
    case 'driver': {
      const d = +v;
      if (setup.mode === 'local2p') {
        const other = setup.editing === 0 ? 1 : 0;
        if (setup.pick[other] === d) break;
        setup.pick[setup.editing] = d;
        if (setup.editing === 0) setup.editing = 1;
      } else {
        if (setup.mode === 'online') {
          const lobby = onlineLobby();
          if (lobby?.players.some((p) => p.id !== room.localPlayer.id && p.driver === d)) {
            hud.toast('Esse macaco já tem dono na sala!', 'chaos');
            break;
          }
        }
        setup.pick[0] = d;
        if (setup.mode === 'online') announcePick();
      }
      renderSetup();
      break;
    }
    case 'edit':
      setup.editing = +v as 0 | 1;
      renderSetup();
      break;
    case 'format':
      setup.format = v as Setup['format'];
      renderSetup();
      broadcastLobby();
      break;
    case 'cc':
      setup.cc = +v;
      renderSetup();
      break;
    case 'track':
      setup.track = +v;
      renderSetup();
      break;
    case 'start':
      void beginFromSetup();
      break;
    case 'resume':
      setPaused(false);
      break;
    case 'restart':
      setPaused(false);
      if (cfg) void startRace(cfg);
      break;
    case 'menu':
      if (netRace && isHost()) room.send('menu', {});
      if (setup.mode === 'online') {
        goSetup('online');
      } else goTitle();
      break;
    case 'next':
      void advanceGp();
      break;
    case 'again':
      if (cfg && (!netRace || isHost())) void startRace({ ...cfg, order: cfg.order.slice() });
      break;
  }
});

// --------------------------------------------------------- entry building
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildEntries(): KartEntry[] {
  const used = new Set<number>();
  const entries: KartEntry[] = [];
  const add = (driver: number, name: string, owner: number, netId: string | null) => {
    used.add(driver);
    entries.push({ driver, name, owner, netId });
  };
  if (setup.mode === 'solo') {
    add(setup.pick[0], 'Você', 0, null);
  } else if (setup.mode === 'local2p') {
    add(setup.pick[0], `P1 ${DRIVERS[setup.pick[0]].nick}`, 0, null);
    add(setup.pick[1], `P2 ${DRIVERS[setup.pick[1]].nick}`, 1, null);
  } else {
    const players = room.getPlayers();
    const myId = room.localPlayer.id;
    const hostFirst = [...players].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : 0));
    for (const p of hostFirst) {
      let d = p.id === myId ? setup.pick[0] : lobbyPicks[p.id] ?? 0;
      if (used.has(d)) d = DRIVERS.findIndex((x) => !used.has(x.id));
      add(d, p.name, p.id === myId ? 0 : -1, p.id);
    }
  }
  for (const d of shuffle(DRIVERS.map((x) => x.id)).filter((x) => !used.has(x))) {
    if (entries.length >= DRIVERS.length) break;
    add(d, DRIVERS[d].nick, -2, null);
  }
  return entries;
}

function makeOrder(entries: KartEntry[], gpIdx: number): number[] {
  // grid slot for every entry index
  const idxs = entries.map((_, i) => i);
  let ranked: number[];
  if (gpIdx > 0) {
    ranked = idxs.sort((a, b) => gpPoints[entries[b].driver] - gpPoints[entries[a].driver] + (Math.random() - 0.5) * 0.1);
  } else {
    ranked = shuffle(idxs);
  }
  const order = new Array(entries.length).fill(0);
  ranked.forEach((entryIdx, slot) => (order[entryIdx] = slot));
  return order;
}

async function beginFromSetup(): Promise<void> {
  if (setup.mode === 'online' && !isHost()) return;
  const entries = buildEntries();
  gpPoints = new Array(DRIVERS.length).fill(0);
  const gpOrder = [0, 1, 2, 3];
  const c: RaceCfg = {
    trackIdx: setup.format === 'gp' ? gpOrder[0] : setup.track,
    cc: setup.cc,
    entries,
    order: makeOrder(entries, 0),
    gp: setup.format === 'gp' ? { order: gpOrder, idx: 0 } : null,
    format: setup.format,
    mode: setup.mode,
  };
  await startRace(c);
}

async function advanceGp(): Promise<void> {
  if (!cfg || !cfg.gp) return;
  if (netRace && !isHost()) return;
  const nextIdx = cfg.gp.idx + 1;
  if (nextIdx >= cfg.gp.order.length) {
    showPodium();
    if (netRace && isHost()) room.send('podium', { pts: gpPoints });
    return;
  }
  const c: RaceCfg = {
    ...cfg,
    gp: { order: cfg.gp.order, idx: nextIdx },
    trackIdx: cfg.gp.order[nextIdx],
    order: makeOrder(cfg.entries, nextIdx),
  };
  await startRace(c);
}

// -------------------------------------------------------------- race flow
async function startRace(c: RaceCfg, fromNet = false): Promise<void> {
  screen = 'loading';
  cfg = c;
  setUi(`<div class="mk-screen clear"><div class="mk-panel" style="text-align:center"><div class="mk-h" style="margin:0">🍌 Preparando ${TRACK_DEFS[c.trackIdx].name}…</div><div class="mk-small">${TRACK_DEFS[c.trackIdx].subtitle}</div></div></div>`);
  await new Promise((r) => setTimeout(r, 40));
  netRace = c.mode === 'online' && !!room.roomCode;
  const track = buildTrack(TRACK_DEFS[c.trackIdx]);
  renderer.setTrack(track);
  const myId = room.localPlayer.id;
  const entries: KartEntry[] = c.entries.map((e) => {
    if (c.mode !== 'online') return e;
    const owner = e.netId === myId ? 0 : e.netId ? -1 : -2;
    return { ...e, owner };
  });
  const guest = netRace && !room.localPlayer.isHost;
  world = new World(track, c.cc, guest);
  world.addKarts(entries, c.order);
  namesByDriver = new Map(entries.map((e) => [e.driver, e.name]));
  myKartId = world.karts.findIndex((k) => k.owner === 0);
  world.getInput = (k: Kart) => {
    if (k.owner >= 0) return input.read(k.owner);
    if (k.owner === -1 && k.netId) return netInputs.get(k.netId) ?? null;
    return null;
  };
  if (new URLSearchParams(window.location.search).get('auto')) for (const k of world.karts) if (k.owner >= 0) k.autopilot = true;
  const ff = parseFloat(new URLSearchParams(window.location.search).get('ff') ?? '0');
  if (ff > 0 && !netRace) {
    for (let i = 0; i < ff * 60; i++) {
      world.step(STEP);
      world.events.length = 0;
    }
  }
  fx.list.length = 0;
  snapBuf = new SnapBuffer();
  netInputs.clear();
  for (const key of Object.keys(ackBySender)) delete ackBySender[key];
  evOut = [];
  gpApplied = false;
  paused = false;
  acc = 0;
  doneAt = 0;
  inputSeq = 0;
  sendTimes.clear();
  for (const st of renderer.states) {
    st.initialized = false;
    st.msgs = [];
    st.banner = null;
    st.shake = 0;
    st.flash = 0;
  }
  input.twoPlayer = c.mode === 'local2p';
  input.enabled = true;
  clearUi();
  screen = 'race';
  input.refreshTouchVisibility(true);
  const localCount = world.karts.filter((k) => k.owner >= 0).length;
  kartAudio.unlock();
  kartAudio.startEngines(Math.max(1, localCount));
  kartAudio.startMusic(track.def.theme);
  musicStarted = true;
  const t = TRACK_DEFS[c.trackIdx];
  for (const k of world.karts.filter((x) => x.owner >= 0)) {
    const st = renderer.states[k.owner];
    st.toast(`${t.emoji} ${t.name}${c.gp ? ` — Corrida ${c.gp.idx + 1}/${c.gp.order.length}` : ''}`, '#fde68a');
  }
  if (netRace && room.localPlayer.isHost && !fromNet) {
    room.send('start', { cfg: c, pts: gpPoints });
  }
}

function leaveRace(): void {
  world = null;
  kartAudio.stopEngines();
  input.enabled = true;
  input.refreshTouchVisibility(false);
  netRace = false;
  if (musicStarted) kartAudio.startMusic('menu');
}

function setPaused(p: boolean): void {
  if (screen !== 'race') return;
  paused = p && !netRace;
  if (p) setUi(pauseHtml(netRace));
  else clearUi();
  input.enabled = !p;
}

input.onPause = () => {
  if (screen === 'race') setPaused(uiRoot.innerHTML === '');
};
input.onRestart = () => {
  if (screen !== 'race' || !cfg) return;
  if (netRace && !isHost()) return;
  void startRace({ ...cfg, order: cfg.order.slice() });
};

// ------------------------------------------------------------- results
function showResults(): void {
  if (!world || !cfg) return;
  screen = 'results';
  input.refreshTouchVisibility(false);
  const sorted = [...world.karts].sort((a, b) => a.place - b.place);
  const gp = !!cfg.gp;
  if (!gpApplied) {
    gpApplied = true;
    if (gp) for (const k of sorted) gpPoints[k.driver] += GP_POINTS[k.place - 1] ?? 0;
    const me = world.karts.find((k) => k.owner === 0);
    if (me) {
      const score = (GP_POINTS[me.place - 1] ?? 0) * 100 + me.hitsDealt * 25 + Math.max(0, 8 - me.place) * 10;
      reportGameScore(SLUG, score, { place: me.place, track: TRACK_DEFS[cfg.trackIdx].id });
    }
  }
  const humanIds = new Set(world.karts.filter((k) => k.owner >= 0).map((k) => k.id));
  lastRows = sorted.map((k) => ({
    place: k.place,
    driver: k.driver,
    name: k.name,
    time: k.finishTime,
    pts: GP_POINTS[k.place - 1] ?? 0,
    total: gpPoints[k.driver],
    me: humanIds.has(k.id),
    best: k.bestLap,
  }));
  const last = !!cfg.gp && cfg.gp.idx >= cfg.gp.order.length - 1;
  const canAdvance = !netRace || isHost();
  setUi(resultsHtml(lastRows, TRACK_DEFS[cfg.trackIdx].name, gp, last, canAdvance, netRace, 'Aguardando o host seguir…'));
  kartAudio.sfx('finish', 0.7);
}

function showPodium(): void {
  screen = 'podium';
  input.refreshTouchVisibility(false);
  const ranked = DRIVERS.map((d) => ({ driver: d.id, name: namesByDriver.get(d.id) ?? d.nick, total: gpPoints[d.id] })).sort((a, b) => b.total - a.total);
  const me = world?.karts.find((k) => k.owner === 0);
  if (me) reportGameScore(SLUG, gpPoints[me.driver] * 100 + 500, { gp: gpPoints[me.driver] });
  setUi(podiumHtml(ranked.slice(0, 3), !netRace || isHost() || true));
  kartAudio.sfx('finish');
}

// -------------------------------------------------------------- events
function localSlot(id: number): number {
  const k = world?.karts[id];
  return k && k.owner >= 0 ? k.owner : -1;
}
function nearLocal(x: number, y: number, r = 900): boolean {
  if (!world) return false;
  for (const k of world.karts) {
    if (k.owner < 0) continue;
    if (Math.hypot(k.x - x, k.y - y) < r) return true;
  }
  return false;
}

const HIT_TEXT: Record<string, string[]> = {
  banana: ['ESCORREGOU!', 'CASCA NELE!', 'TOMBO DE BANANA!'],
  chinelo: ['CHINELADA!', 'TAPA NA CARA!', 'AI, O CHINELO!'],
  coco: ['COCO NA CUCA!', 'BOOM! COCADA!', 'TELEGUIADO DEMAIS!'],
  enxame: ['FERROADA!', 'MARIMBONDOOOS!', 'BZZZ-AI!'],
  hazard: ['BATEU!', 'ATROPELADO!', 'PEGOU O MACACO!'],
};

function onEvent(e: GameEvent): void {
  if (!world) return;
  const k = e.k !== undefined && e.k >= 0 ? world.karts[e.k] : undefined;
  const slot = e.k !== undefined ? localSlot(e.k) : -1;
  const isLocal = slot >= 0;
  const x = e.x ?? k?.x ?? 0;
  const y = e.y ?? k?.y ?? 0;
  const near = nearLocal(x, y);
  switch (e.t) {
    case 'count':
      kartAudio.sfx('count');
      break;
    case 'go':
      kartAudio.sfx('go');
      break;
    case 'rocket':
      if (k) {
        fx.text(k.x, k.y, 'LARGADA TURBO!', '#fde047', 26, 70);
        if (isLocal) kartAudio.sfx('rocket');
      }
      break;
    case 'flood':
      if (k) {
        fx.text(k.x, k.y, 'AFOGOU O MOTOR!', '#f87171', 24, 70);
        for (let i = 0; i < 6; i++) fx.add({ kind: 'smoke', x: k.x - Math.cos(k.h) * 30, y: k.y - Math.sin(k.h) * 30, z: 10, vz: 40, life: 0.8, size: 16, color: 'rgba(60,60,60,0.6)' });
      }
      break;
    case 'pickup':
      fx.burst(x, y, 20, 14, '#fde047', 180, 'spark', 0.6, 5);
      if (isLocal) kartAudio.sfx('pickup');
      break;
    case 'itemget':
      if (isLocal && e.s) {
        kartAudio.sfx('itemget');
        const info = ITEM_INFO[e.s as ItemType];
        renderer.states[slot].toast(`${info.emoji} ${info.name}: ${info.hint}`, '#fef08a');
      }
      break;
    case 'use': {
      const type = e.s as ItemType;
      if (isLocal || near) {
        const vol = isLocal ? 1 : 0.5;
        if (type === 'banana' || type === 'nuvem') kartAudio.sfx('drop', vol);
        else if (type === 'guarana') kartAudio.sfx('guarana', vol);
        else kartAudio.sfx('throw', vol);
      }
      if (k && type === 'guarana') {
        fx.text(k.x, k.y, 'GUARANÁÁÁ!', '#4ade80', 28, 70);
        fx.burst(k.x, k.y, 30, 16, '#86efac', 220, 'spark', 0.7, 5);
      } else if (k && type === 'enxame') fx.text(k.x, k.y, 'BZZZZ...', '#facc15', 22, 70);
      break;
    }
    case 'hit': {
      if (!k) break;
      const kind = e.s ?? 'hazard';
      const arr = HIT_TEXT[kind] ?? HIT_TEXT.hazard;
      fx.text(k.x, k.y, arr[Math.floor(Math.random() * arr.length)], '#fb7185', 28, 80);
      fx.burst(k.x, k.y, 30, 12, '#fde047', 220, 'star', 0.9, 6);
      if (kind === 'coco') fx.burst(k.x, k.y, 20, 26, '#fb923c', 320, 'glow', 0.5, 16);
      if (isLocal || near) kartAudio.sfx(kind === 'coco' ? 'explode' : kind === 'enxame' ? 'sting' : kind === 'chinelo' ? 'whack' : 'hit', isLocal ? 1 : 0.5);
      if (isLocal) {
        const st = renderer.states[slot];
        st.shake = kind === 'coco' ? 30 : 20;
        st.flash = 0.5;
        st.flashColor = '#ef4444';
        const by = e.n !== undefined && e.n >= 0 ? world.karts[e.n] : undefined;
        const whom = by && by !== k ? `${by.name} te acertou` : 'Você tomou';
        st.toast(`${whom} — ${ITEM_INFO[(kind === 'hazard' ? 'banana' : kind) as ItemType]?.name ?? 'um perigo da pista'}!`, '#fca5a5');
        kartAudio.sfx('screech');
        st.note(DRIVERS[k.driver].quotes.hit, '#fb7185', 34, 1.6);
      } else if (e.n !== undefined && e.n >= 0) {
        const by = world.karts[e.n];
        const bs = by ? localSlot(by.id) : -1;
        if (bs >= 0) {
          renderer.states[bs].toast(`Acertou ${k.name}! 😈`, '#86efac');
          fx.text(k.x, k.y, '+1 VÍTIMA', '#86efac', 20, 100);
        }
      }
      break;
    }
    case 'itemhit':
      if (e.s === 'coco') {
        fx.burst(x, y, 20, 20, '#f97316', 280, 'glow', 0.6, 18);
        fx.burst(x, y, 20, 10, '#a16207', 240, 'spark', 0.8, 7);
      } else if (e.s === 'banana') {
        fx.text(x, y, 'SPLASH!', '#fde047', 20, 40);
      }
      break;
    case 'cough':
      if (k) {
        fx.text(k.x, k.y, 'COF COF! 💨', '#bef264', 24, 80);
        if (isLocal || near) kartAudio.sfx('cough', isLocal ? 1 : 0.4);
        if (isLocal) {
          renderer.states[slot].toast('Que fedor! Quem soltou essa?!', '#bef264');
        }
      }
      break;
    case 'pad':
      if (isLocal) {
        kartAudio.sfx('pad');
        fx.text(x, y, 'TURBOOO!', '#fde047', 22, 70);
        renderer.states[slot].shake = Math.max(renderer.states[slot].shake, 6);
      }
      fx.burst(x, y, 6, 8, '#fb923c', 160, 'spark', 0.5, 4);
      break;
    case 'miniturbo':
      if (k) {
        const cols = ['', '#38bdf8', '#fb923c', '#d946ef'];
        const lvl = e.n ?? 1;
        fx.burst(k.x - Math.cos(k.h) * 24, k.y - Math.sin(k.h) * 24, 8, 8 + lvl * 6, cols[lvl] ?? '#38bdf8', 260, 'spark', 0.6, 5);
        fx.text(k.x, k.y, ['', 'MINI-TURBO!', 'SUPER TURBO!', 'ULTRA BANANA!'][lvl] ?? 'TURBO!', cols[lvl] ?? '#fff', 24, 80);
        if (isLocal) {
          kartAudio.sfx('miniturbo');
          renderer.states[slot].shake = Math.max(renderer.states[slot].shake, 8);
        }
      }
      break;
    case 'driftlevel':
      if (isLocal) kartAudio.sfx('level', 0.8);
      break;
    case 'driftstart':
      if (isLocal) kartAudio.sfx('screech', 0.6);
      break;
    case 'bump':
      fx.burst(x, y, 24, 6, '#fde68a', 160, 'spark', 0.4, 4);
      if (near) kartAudio.sfx('bump', 0.7);
      if (e.k !== undefined) {
        for (const id of [e.k, e.n ?? -1]) {
          const s = localSlot(id);
          if (s >= 0) renderer.states[s].shake = Math.max(renderer.states[s].shake, 7);
        }
      }
      break;
    case 'fall':
      if (k) {
        fx.text(k.x, k.y, 'AAAAAH! CAIU!', '#fda4af', 28, 80);
        if (isLocal || near) kartAudio.sfx('fall', isLocal ? 1 : 0.4);
        if (isLocal) {
          renderer.states[slot].toast('O Guindaste Macaco vem te resgatar (cobra pedágio em tempo)', '#fda4af');
        }
      }
      break;
    case 'respawn':
      if (k) {
        fx.add({ kind: 'ring', x: k.x, y: k.y, z: 5, life: 0.8, size: 26, color: '#fde047' });
        fx.text(k.x, k.y, 'GUINDASTE!', '#fde047', 22, 70);
      }
      break;
    case 'splash':
      fx.burst(x, y, 4, 8, '#7dd3fc', 140, 'drop', 0.5, 5);
      if (isLocal) kartAudio.sfx('splash');
      break;
    case 'ricochet':
      fx.burst(x, y, 20, 5, '#93c5fd', 140, 'spark', 0.3, 4);
      if (near) kartAudio.sfx('ricochet', 0.5);
      break;
    case 'lap':
      if (isLocal && k) {
        const st = renderer.states[slot];
        const n = e.n ?? 2;
        if (n === LAPS) st.note('ÚLTIMA VOLTA!', '#fde047', 54, 2.4);
        else st.note(`VOLTA ${n}/${LAPS}`, '#fff', 44, 1.8);
        st.toast(`Volta ${n - 1}: ${(e.x ?? 0).toFixed(2)}s`, '#bae6fd');
        kartAudio.sfx('lap');
      }
      break;
    case 'finish':
      if (k) {
        fx.burst(k.x, k.y, 40, 30, ['#fde047', '#f472b6', '#38bdf8', '#4ade80'][Math.floor(Math.random() * 4)], 380, 'star', 1.2, 8);
        if (isLocal) {
          const st = renderer.states[slot];
          st.note(`${e.n}º LUGAR!`, e.n === 1 ? '#fde047' : '#fff', 70, 3);
          st.toast(DRIVERS[k.driver].quotes.win, '#fde68a');
          kartAudio.sfx('finish');
        }
      }
      break;
    case 'done':
      doneAt = performance.now() + 2600;
      break;
  }
}

function handleWorldEvents(): void {
  if (!world) return;
  if (world.events.length) {
    for (const e of world.events) onEvent(e);
    if (netRace && room.localPlayer.isHost) evOut.push(...world.events);
    world.events.length = 0;
  }
}

// ---------------------------------------------------------------- netcode
function announcePick(): void {
  if (!room.roomCode) return;
  if (isHost()) {
    lobbyPicks[room.localPlayer.id] = setup.pick[0];
    broadcastLobby();
  } else room.send('pick', { d: setup.pick[0] });
}

function broadcastLobby(): void {
  if (!isHost()) return;
  lobbyPicks[room.localPlayer.id] = setup.pick[0];
  room.send('lobby', { picks: lobbyPicks, format: setup.format, cc: setup.cc, track: setup.track });
}

function onRosterChange(players: PlayerProfile[]): void {
  const ids = new Set(players.map((p) => p.id));
  for (const id of Object.keys(lobbyPicks)) if (!ids.has(id)) delete lobbyPicks[id];
  if (isHost()) {
    // give newcomers a free monkey, keep picks unique and announce
    lobbyPicks[room.localPlayer.id] = setup.pick[0];
    for (const pl of players) {
      if (lobbyPicks[pl.id] === undefined) {
        const used = new Set(Object.values(lobbyPicks));
        lobbyPicks[pl.id] = DRIVERS.find((d) => !used.has(d.id))?.id ?? 0;
      }
    }
    broadcastLobby();
    if (world && netRace) {
      for (const k of world.karts) {
        if (k.owner === -1 && k.netId && !ids.has(k.netId)) {
          k.owner = -2;
          hud.toast(`${k.name} saiu — um CPU assumiu o kart!`, 'chaos');
          k.name = `${k.name} (CPU)`;
        }
      }
    }
  } else if (netRace && players.length > 0 && !players.some((p) => p.isHost)) {
    hud.toast('O host saiu da sala.', 'chaos');
    goSetup('online');
  } else if (netRace && players.length === 0) {
    goTitle();
  }
  if (screen === 'setup' && setup.mode === 'online') renderSetup();
}

function onNetMessage(env: PeerEnvelope<unknown>): void {
  const p = env.payload as Record<string, unknown> | null;
  if (!p) return;
  const host = room.localPlayer.isHost;
  switch (env.type) {
    case 'pick':
      if (host) {
        const d = p.d as number;
        const taken = Object.entries(lobbyPicks).some(([id, dd]) => dd === d && id !== env.senderId) || setup.pick[0] === d;
        if (!taken) lobbyPicks[env.senderId] = d;
        broadcastLobby();
      }
      break;
    case 'lobby':
      if (!host) {
        lobbyPicks = p.picks as Record<string, number>;
        const mine = lobbyPicks[room.localPlayer.id];
        if (mine !== undefined) setup.pick[0] = mine;
        setup.format = p.format as Setup['format'];
        setup.cc = p.cc as number;
        setup.track = p.track as number;
        if (screen === 'setup') renderSetup();
      }
      break;
    case 'start':
      if (!host) {
        lobbyPicks = lobbyPicks ?? {};
        gpPoints = (p.pts as number[]) ?? gpPoints;
        setup.mode = 'online';
        void startRace(p.cfg as RaceCfg, true);
      }
      break;
    case 'in':
      if (host) {
        let inp = netInputs.get(env.senderId);
        if (!inp) {
          inp = emptyInput();
          netInputs.set(env.senderId, inp);
        }
        const n = p as unknown as NetInput;
        decodeInput(n, inp);
        ackBySender[env.senderId] = n.seq;
      }
      break;
    case 'snap':
      if (!host && world && screen !== 'loading') {
        const s = p as unknown as Snapshot;
        snapBuf.push(s);
        const myAck = s.ack?.[room.localPlayer.id];
        if (myAck !== undefined) {
          const st = sendTimes.get(myAck);
          if (st !== undefined) rtt = clamp(rtt * 0.8 + ((performance.now() - st) / 1000) * 0.2, 0.01, 0.6);
        }
        applySnapshot(world, snapBuf, myKartId, rtt, 110);
      }
      break;
    case 'ev':
      if (!host && world) {
        const list = (p.e as GameEvent[]) ?? [];
        for (const e of list) onEvent(e);
      }
      break;
    case 'podium':
      if (!host) {
        gpPoints = (p.pts as number[]) ?? gpPoints;
        showPodium();
      }
      break;
    case 'menu':
      if (!host) goSetup('online');
      break;
  }
}

// ----------------------------------------------------------------- loop
function stepOnce(): void {
  if (!world) return;
  const guest = netRace && !room.localPlayer.isHost;
  if (guest) {
    world.stepGuest(STEP);
  } else {
    world.step(STEP);
    handleWorldEvents();
    if (netRace && room.localPlayer.isHost) {
      snapTick++;
      if (snapTick % 3 === 0) {
        room.send('snap', encodeSnapshot(world, ackBySender));
        if (evOut.length) {
          room.send('ev', { e: evOut });
          evOut = [];
        }
      }
    }
  }
}

function localViews(): ViewSpec[] {
  if (!world) return [];
  const W = window.innerWidth;
  const H = window.innerHeight;
  const locals = world.karts.filter((k) => k.owner >= 0).sort((a, b) => a.owner - b.owner);
  if (locals.length === 0) {
    const k = world.karts[0];
    return [{ slot: 0, kart: k, x: 0, y: 0, w: W, h: H }];
  }
  if (locals.length === 1) return [{ slot: 0, kart: locals[0], x: 0, y: 0, w: W, h: H }];
  const half = Math.floor(W / 2);
  return [
    { slot: 0, kart: locals[0], x: 0, y: 0, w: half, h: H },
    { slot: 1, kart: locals[1], x: half, y: 0, w: W - half, h: H },
  ];
}

let last = performance.now();
let netSend = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (screen === 'race' || screen === 'results') {
    if (world) {
      const live = screen === 'race' && !paused;
      if (live || screen === 'results') {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 6) {
          stepOnce();
          acc -= STEP;
          n++;
        }
        if (n >= 6) acc = 0;
      }
      const guest = netRace && !room.localPlayer.isHost;
      if (guest) {
        interpolateRemotes(world, snapBuf, myKartId, 110);
        netSend += dt;
        if (netSend >= 0.033 && screen === 'race') {
          netSend = 0;
          const inp = input.read(0);
          inputSeq++;
          sendTimes.set(inputSeq, performance.now());
          if (sendTimes.size > 90) sendTimes.delete(inputSeq - 90);
          room.send('in', encodeInput(inp, inputSeq));
        }
      }
      if (!paused) {
        fx.update(dt);
        for (const k of world.karts) fx.kartFx(k, dt, renderer.time);
      }
      // engine audio
      const locals = world.karts.filter((k) => k.owner >= 0).sort((a, b) => a.owner - b.owner);
      rouletteSfxT -= dt;
      locals.forEach((k, i) => {
        const top = world!.cc.max * DRIVERS[k.driver].top;
        const fall = k.fallT > 0;
        kartAudio.updateEngine(i, fall ? 0 : Math.abs(k.spd) / top, k.input.accel, k.boostT > 0, k.driftLvl, (k.surf === 1 || k.surf === 3) && k.guaranaT <= 0, k.drift !== 0 && !fall);
        if (k.rouletteT > 0 && rouletteSfxT <= 0) {
          kartAudio.sfx('roulette', 0.8);
          rouletteSfxT = 0.075;
        }
      });
      const views = localViews();
      renderer.render(world, views, fx, dt);
      if (screen === 'race' && doneAt && performance.now() > doneAt && world.phase === 'done') {
        doneAt = 0;
        showResults();
      }
      input.refreshTouchVisibility(screen === 'race');
    }
  } else if (screen === 'loading') {
    // keep last frame
  } else {
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#050814';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

function resize(): void {
  renderer.resize();
}
window.addEventListener('resize', resize);
resize();

// first user gesture unlocks audio (browsers)
window.addEventListener(
  'pointerdown',
  () => {
    kartAudio.unlock();
    if (!musicStarted) {
      musicStarted = true;
      kartAudio.startMusic(world ? world.track.def.theme : 'menu');
    }
  },
  { once: true },
);

// auto-join from ?room=XXXX goes straight to the online lobby
const params = new URLSearchParams(window.location.search);
if (params.get('screen') === 'setup') {
  goSetup((params.get('mode') as Setup['mode']) || 'solo');
} else if (params.get('room')) {
  setup.mode = 'online';
  goSetup('online');
} else if (params.get('quick') !== null) {
  const q = params.get('quick') ?? '0';
  setup.format = 'single';
  setup.track = clamp(parseInt(q, 10) || 0, 0, TRACK_DEFS.length - 1);
  setup.cc = CC_SETTINGS.length - 2;
  setup.mode = params.get('p2') ? 'local2p' : 'solo';
  void beginFromSetup();
} else {
  goTitle();
}
void shade;
requestAnimationFrame(frame);
