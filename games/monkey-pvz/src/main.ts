// Bananeiras vs Gorilas Zumbis — controlador principal: telas, input, HUD no canvas, loop e rede.
import './styles.css';
import { monkeyAudio, reportGameScore } from '@monkey-slop/sdk';
import { setMusic, sfx, unlockAudio, beatNow } from './audio';
import {
  LEVELS,
  LevelDef,
  PLANT_ORDER,
  PLANTS,
  PlantId,
  VERSUS_LEVEL,
  VERSUS_TIME,
  ZOMBIE_ORDER,
  ZOMBIES,
  ZombieId,
} from './data';
import { drawPlant, drawPlantIcon } from './draw-plants';
import { drawZombie } from './draw-zombies';
import { Fx, mkZombie } from './fx';
import { C, TAU, circ, ell, outlineText, rrect, rrectFill } from './gfx';
import { CmdMsg, CursorMsg, PvzNet, SLUG, StartMsg } from './net';
import { drawAmbient, drawDrop, drawHoverCell, drawMower, drawOwner, drawProj, getBackground } from './scene';
import {
  CELL_H,
  COLS,
  Ev,
  H,
  LAWN_END,
  LAWN_X,
  LAWN_Y,
  Mode,
  Plant,
  ROWS,
  W,
  World,
  colOf,
  colX,
  rowY,
  zoneOwner,
} from './sim';
import {
  ResultInfo,
  Progress,
  almanacHtml,
  drawZombieIcon,
  levelsHtml,
  loadProgress,
  newPlantsOf,
  paintIcons,
  pauseHtml,
  resultHtml,
  saveProgress,
  titleHtml,
  versusHtml,
} from './ui';

// ---------- DOM ----------
const app = document.getElementById('app');
if (!app) throw new Error('#app não encontrado');
app.innerHTML = '<canvas id="game"></canvas><div id="ui"></div><div id="rotate">📱 Vire o celular para jogar melhor</div>';
const cv = document.getElementById('game') as HTMLCanvasElement;
const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
const uiEl = document.getElementById('ui') as HTMLElement;

let scale = 1;
function resize(): void {
  const aw = app!.clientWidth;
  const ah = app!.clientHeight;
  const s = Math.min(aw / W, ah / H);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = `${Math.floor(W * s)}px`;
  cv.style.height = `${Math.floor(H * s)}px`;
  cv.width = Math.round(W * s * dpr);
  cv.height = Math.round(H * s * dpr);
  scale = cv.width / W;
}
window.addEventListener('resize', resize);
resize();

// ---------- estado ----------
interface Sel {
  kind: 'plant' | 'belt' | 'zombie';
  id: string;
  beltIdx: number;
}

interface TrayItem extends Sel {
  cost: number;
  cdFrac: number;
  ok: boolean;
}

interface Game {
  world: World;
  mode: Mode;
  level: LevelDef;
  localSlot: number;
  mirror: boolean;
  online: boolean;
  guestId: string | null;
  paused: boolean;
  speed: number;
  over: boolean;
  overT: number;
  resultShown: boolean;
  sel: Sel | null;
  shovel: boolean;
  hover: { r: number; c: number } | null;
  partner: { r: number; c: number; sel: string; t: number } | null;
  evBuf: Ev[];
  snapT: number;
  curT: number;
  pendingCollect: Map<number, number>;
  role: number;
}

type Screen = 'title' | 'levels' | 'almanac' | 'versus' | 'play';
let screen: Screen = 'title';
let levelsMode: 'solo' | 'coop' = 'solo';
let versusRole = 0;
let game: Game | null = null;
let progress: Progress = loadProgress();
const fx = new Fx();
let tAnim = 0;
let pointer = { x: -999, y: -999, mouse: false };
let toastT = 0;

// ---------- rede ----------
const net = new PvzNet({
  onStatus: () => {
    if (screen === 'title') renderScreen();
  },
  onPlayers: () => {
    if (screen === 'title') renderScreen();
    handlePlayersChange();
  },
  onMessage: (type, payload, sender) => onNetMessage(type, payload, sender),
});

function handlePlayersChange(): void {
  const g = game;
  if (!g || !g.online) return;
  if (net.peerCount() >= 2) return;
  if (g.mirror) {
    net.toast('O host saiu da sala. Voltando ao menu!', 'chaos');
    endToMenu();
    return;
  }
  net.toast('O parceiro saiu da sala!', 'chaos');
  g.online = false;
  if (g.mode === 'versus') {
    g.world.finish(g.world.plantSlot === 0 ? 'plants' : 'zombies');
  }
}

function onNetMessage(type: string, payload: unknown, sender: string): void {
  if (type === 'start') {
    const s = payload as StartMsg;
    if (net.isHost()) return;
    const level = s.mode === 'versus' ? VERSUS_LEVEL : LEVELS.find((l) => l.id === s.levelId);
    if (!level) return;
    startGame(level, s.mode, { localSlot: 1, mirror: true, online: true, plantSlot: s.plantSlot });
    return;
  }
  const g = game;
  if (!g) return;
  if (type === 'snap' && g.mirror) {
    const p = payload as { ev?: Ev[] };
    g.world.unpack(payload);
    const evs = p.ev ?? [];
    for (const ev of evs) {
      g.world.applyAnim(ev);
      fx.handle(ev, g.world);
    }
    for (const [id, t0] of g.pendingCollect) {
      if (tAnim - t0 > 1.5 || !g.world.drops.some((d) => d.id === id)) g.pendingCollect.delete(id);
    }
    if (g.world.state !== 'playing' && !g.over) {
      g.over = true;
      g.overT = 0;
    }
    return;
  }
  if (type === 'cmd' && !g.mirror) {
    if (sender !== g.guestId) return;
    onCmd(g, payload as CmdMsg);
    return;
  }
  if (type === 'cur') {
    const m = payload as CursorMsg;
    g.partner = { r: m.r, c: m.c, sel: m.sel, t: tAnim };
  }
}

function onCmd(g: Game, m: CmdMsg): void {
  const w = g.world;
  switch (m.k) {
    case 'plant':
      w.plant(1, m.t as PlantId, m.r ?? 0, m.c ?? 0, m.b ?? -1);
      break;
    case 'shovel':
      w.shovel(1, m.r ?? 0, m.c ?? 0);
      break;
    case 'collect':
      w.collect(m.id ?? 0, 1);
      break;
    case 'send':
      w.sendZombie(1, m.t as ZombieId, m.r ?? 0);
      break;
  }
}

// ---------- telas ----------
function onlineStatusText(): string {
  if (!net.inRoom()) return '🐒 Co-op/Versus: abra “🐒 Co-op Online” no topo, crie uma sala e mande o link pro amigo.';
  const code = net.room.roomCode;
  if (!net.isHost()) return `✅ Conectado na sala ${code}. Aguarde o host iniciar a partida!`;
  if (net.peerCount() < 2) return `⏳ Sala ${code} aberta. Aguardando o parceiro entrar pelo link…`;
  const other = net.players().find((p) => p.id !== net.room.localPlayer.id);
  return `✅ ${other ? other.name : 'Parceiro'} conectado! Escolha Co-op ou Versus.`;
}

function bestScore(): number {
  let b = 0;
  for (const k of Object.keys(progress.best)) b = Math.max(b, progress.best[Number(k)]);
  return b;
}

function renderScreen(): void {
  if (screen === 'play') return;
  let html = '';
  if (screen === 'title') html = titleHtml(bestScore(), onlineStatusText(), net.inRoom() && !net.isHost());
  else if (screen === 'levels') html = levelsHtml(progress, levelsMode, net.inRoom());
  else if (screen === 'almanac') html = almanacHtml();
  else if (screen === 'versus') html = versusHtml(versusRole);
  uiEl.innerHTML = html;
  paintIcons(uiEl);
}

function setScreen(s: Screen): void {
  screen = s;
  if (s === 'play') uiEl.innerHTML = '';
  else {
    renderScreen();
    setMusic('menu');
  }
}

function showOverlay(html: string): void {
  uiEl.innerHTML = html;
  paintIcons(uiEl);
}

uiEl.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  unlockAudio();
  const act = el.dataset.act ?? '';
  const id = Number(el.dataset.id ?? 0);
  if (act !== 'level' || !el.classList.contains('locked')) sfx('click');
  switch (act) {
    case 'play':
      levelsMode = 'solo';
      setScreen('levels');
      break;
    case 'coop':
      if (!requireRoom()) break;
      levelsMode = 'coop';
      setScreen('levels');
      break;
    case 'versus':
      if (!requireRoom()) break;
      setScreen('versus');
      break;
    case 'almanac':
      setScreen('almanac');
      break;
    case 'title':
    case 'menu':
      if (game) endToMenu();
      else setScreen('title');
      break;
    case 'level': {
      if (el.classList.contains('locked')) {
        sfx('deny');
        break;
      }
      const lv = LEVELS.find((l) => l.id === id);
      if (!lv) break;
      if (levelsMode === 'coop') startOnline('coop', lv, 0);
      else startGame(lv, 'solo', { localSlot: 0, mirror: false, online: false, plantSlot: 0 });
      break;
    }
    case 'role':
      versusRole = id;
      renderScreen();
      break;
    case 'versusGo':
      if (!requireRoom()) break;
      startOnline('versus', VERSUS_LEVEL, versusRole === 0 ? 0 : 1);
      break;
    case 'resume':
      if (game) {
        game.paused = false;
        uiEl.innerHTML = '';
      }
      break;
    case 'restart':
      restartGame();
      break;
    case 'next': {
      const g = game;
      if (g) {
        const nl = LEVELS.find((l) => l.id === g.level.id + 1);
        if (nl) startGame(nl, 'solo', { localSlot: 0, mirror: false, online: false, plantSlot: 0 });
      }
      break;
    }
  }
});

function requireRoom(): boolean {
  if (!net.inRoom()) {
    net.toast('Crie uma sala em “🐒 Co-op Online” e mande o link!', 'info');
    net.openPanel();
    return false;
  }
  if (!net.isHost()) {
    net.toast('Só o host da sala inicia a partida. Aguarde!', 'info');
    return false;
  }
  if (net.peerCount() < 2) {
    net.toast('Ninguém entrou na sala ainda. Mande o link!', 'info');
    net.openPanel();
    return false;
  }
  return true;
}

// ---------- jogo ----------
function startGame(
  level: LevelDef,
  mode: Mode,
  o: { localSlot: number; mirror: boolean; online: boolean; plantSlot: number },
): void {
  const world = new World(level, { mode, plantSlot: o.plantSlot, mirror: o.mirror });
  game = {
    world,
    mode,
    level,
    localSlot: o.localSlot,
    mirror: o.mirror,
    online: o.online,
    guestId: o.online && !o.mirror ? net.guestId() : null,
    paused: false,
    speed: 1,
    over: false,
    overT: 0,
    resultShown: false,
    sel: null,
    shovel: false,
    hover: null,
    partner: null,
    evBuf: [],
    snapT: 0,
    curT: 0,
    pendingCollect: new Map(),
    role: o.plantSlot,
  };
  fx.reset();
  setScreen('play');
  setMusic(level.boss ? 'boss' : 'battle');
  const title =
    mode === 'versus' ? 'VERSUS!' : level.mode === 'survival' ? 'SOBREVIVÊNCIA' : level.mode === 'conveyor' ? 'MINI-GAME' : `FASE ${level.id}`;
  fx.showBanner(title, level.name, '#fde047', false, 2.8);
  if (mode === 'versus') {
    const planter = world.plantSlot === o.localSlot;
    net.toast(planter ? 'Você planta! Segure a gorilada por 5 minutos.' : 'Você manda os gorilas! Escolha um e clique na linha.', 'banana');
  } else if (level.intro) {
    net.toast(level.intro, 'info');
  }
  if (mode === 'coop') {
    net.toast(o.localSlot === 0 ? 'Você cuida das linhas de CIMA.' : 'Você cuida das linhas de BAIXO.', 'info');
  }
}

function startOnline(mode: 'coop' | 'versus', level: LevelDef, plantSlot: number): void {
  startGame(level, mode, { localSlot: 0, mirror: false, online: true, plantSlot });
  net.send('start', { mode, levelId: level.id, plantSlot } satisfies StartMsg);
}

function restartGame(): void {
  const g = game;
  if (!g || g.mirror) return;
  if (g.online && g.mode !== 'solo' && net.peerCount() >= 2) {
    startOnline(g.mode as 'coop' | 'versus', g.level, g.world.plantSlot);
  } else {
    startGame(g.level, g.online ? 'solo' : g.mode, { localSlot: 0, mirror: false, online: false, plantSlot: 0 });
  }
}

function endToMenu(): void {
  game = null;
  fx.reset();
  setScreen('title');
}

const LOSE_QUIPS = [
  'Os gorilas comeram toda a sua banana. Fica a lição: mais bananeira!',
  'O macaco dono da casa pediu demissão do cargo de macaco.',
  'A gorilada invadiu a sala. Ninguém mais assiste a novela.',
  'Plante mais coco, menos desculpa!',
];
const WIN_QUIPS = [
  'A gorilada fugiu de volta pra selva! O macaco ofereceu uma banana.',
  'Quintal salvo! As bananeiras agradecem a você.',
  'Nananinão! Nenhum gorila passou do portão.',
  'Ninguém mexe com o macaco da casa!',
];

function showResult(): void {
  const g = game;
  if (!g || g.resultShown) return;
  g.resultShown = true;
  const w = g.world;
  const lvl = g.level;
  let won = w.state === 'won';
  let title = '';
  let quip = '';
  const extra: Array<[string, string]> = [];
  let unlock: PlantId[] = [];
  const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

  if (g.mode === 'versus') {
    const planterSide = g.localSlot === w.plantSlot;
    won = planterSide ? w.winner === 'plants' : w.winner === 'zombies';
    title = w.winner === 'plants' ? '🌱 AS PLANTAS VENCERAM!' : '🦍 OS GORILAS VENCERAM!';
    quip = won ? 'Você humilhou o adversário. Banana de ouro pra você!' : 'Essa doeu. Revanche?';
    extra.push(['⏱ Tempo', `${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, '0')}`]);
  } else if (lvl.mode === 'survival') {
    title = '♾️ FIM DA SOBREVIVÊNCIA';
    quip = `Você segurou ${w.wave} ondas de gorilas! ${w.wave >= 10 ? 'Impressionante.' : 'Dá pra mais!'}`;
    extra.push(['🌊 Ondas', String(w.wave)]);
  } else if (won) {
    title = '🍌 VITÓRIA!';
    quip = pick(WIN_QUIPS);
    unlock = newPlantsOf(lvl);
  } else {
    title = '💀 OS GORILAS CHEGARAM!';
    quip = pick(LOSE_QUIPS);
  }
  const score = w.score();
  if (g.mode !== 'versus') {
    const prev = progress.best[lvl.id] ?? 0;
    progress.best[lvl.id] = Math.max(prev, score);
    if (won && lvl.mode !== 'survival') {
      if (!progress.done.includes(lvl.id)) progress.done.push(lvl.id);
      progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, lvl.id + 1));
    }
    saveProgress(progress);
  }
  reportGameScore(SLUG, score, { fase: progress.unlocked });
  const info: ResultInfo = {
    won,
    title,
    quip,
    kills: w.kills,
    score,
    extra,
    unlock,
    hasNext: !g.online && g.mode === 'solo' && won && lvl.id < LEVELS.length && lvl.mode !== 'survival',
    canRestart: !g.mirror,
    waitHost: g.mirror,
  };
  showOverlay(resultHtml(info));
}

// ---------- tray ----------
const PK_X = 120;
const PK_Y = 50;
const PK_W = 66;
const PK_H = 80;
const PK_STEP = 70;
const BTN = {
  shovel: { x: 832, y: 50, w: 52, h: 80 },
  speed: { x: 890, y: 50, w: 50, h: 38 },
  pause: { x: 944, y: 50, w: 50, h: 38 },
  menu: { x: 890, y: 92, w: 104, h: 38 },
};

function trayItems(g: Game): TrayItem[] {
  const w = g.world;
  const lvl = g.level;
  const slot = g.localSlot;
  if (g.mode === 'versus' && slot !== w.plantSlot) {
    return ZOMBIE_ORDER.map((id) => ({
      kind: 'zombie',
      id,
      beltIdx: -1,
      cost: ZOMBIES[id].brain,
      cdFrac: w.zcd[ZOMBIE_ORDER.indexOf(id)] / ZOMBIES[id].vcd,
      ok: w.brains >= ZOMBIES[id].brain,
    }));
  }
  if (lvl.mode === 'conveyor') {
    return (w.belt[slot] ?? []).map((id, i) => ({ kind: 'belt', id, beltIdx: i, cost: 0, cdFrac: 0, ok: true }));
  }
  return PLANT_ORDER.filter((id) => lvl.plants.includes(id)).map((id) => ({
    kind: 'plant',
    id,
    beltIdx: -1,
    cost: PLANTS[id].cost,
    cdFrac: w.pcd[slot][PLANT_ORDER.indexOf(id)] / PLANTS[id].cd,
    ok: w.bank >= PLANTS[id].cost,
  }));
}

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function selectItem(g: Game, it: TrayItem): void {
  if (g.sel && g.sel.kind === it.kind && g.sel.id === it.id && g.sel.beltIdx === it.beltIdx) {
    g.sel = null;
    return;
  }
  if (it.kind === 'plant' && it.cdFrac > 0) {
    deny(g, 'Semente recarregando...');
    return;
  }
  if (it.kind === 'zombie' && it.cdFrac > 0) {
    deny(g, 'Gorila descansando...');
    return;
  }
  g.sel = { kind: it.kind, id: it.id, beltIdx: it.beltIdx };
  g.shovel = false;
  sfx('click');
}

let denyT = 0;
function deny(g: Game, msg: string, x = pointer.x, y = pointer.y): void {
  if (tAnim - denyT < 0.25) return;
  denyT = tAnim;
  sfx('deny');
  fx.text(Math.max(80, Math.min(W - 80, x)), Math.max(70, y - 20), msg, '#fecaca', 16, 0.9);
  void g;
}

// ---------- ações locais ----------
function localPlant(g: Game, type: PlantId, r: number, c: number, beltIdx: number): boolean {
  const w = g.world;
  const err = w.checkPlant(g.localSlot, type, r, c, beltIdx);
  if (err) {
    deny(g, err, colX(c), rowY(r));
    return false;
  }
  if (g.mirror) {
    net.send('cmd', { k: 'plant', t: type, r, c, b: beltIdx } satisfies CmdMsg);
    sfx('click');
  } else {
    w.plant(g.localSlot, type, r, c, beltIdx);
  }
  return true;
}

function localCollect(g: Game, id: number): void {
  if (g.mirror) {
    if (g.pendingCollect.has(id)) return;
    const d = g.world.drops.find((q) => q.id === id);
    if (!d) return;
    g.pendingCollect.set(id, tAnim);
    net.send('cmd', { k: 'collect', id } satisfies CmdMsg);
    fx.handle({ k: 'collect', x: d.x, y: d.y, n: d.value }, g.world);
    g.world.drops = g.world.drops.filter((q) => q.id !== id);
  } else {
    g.world.collect(id, g.localSlot);
  }
}

function canCollect(g: Game): boolean {
  return !(g.mode === 'versus' && g.localSlot !== g.world.plantSlot);
}

function dropAt(g: Game, x: number, y: number, rad: number): number {
  let best = -1;
  let bd = rad * rad;
  for (const d of g.world.drops) {
    const dx = d.x - x;
    const dy = d.y - y;
    const dd = dx * dx + dy * dy;
    if (dd < bd) {
      bd = dd;
      best = d.id;
    }
  }
  return best;
}

function toLogical(e: PointerEvent): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

function cellAt(x: number, y: number): { r: number; c: number } | null {
  const r = Math.floor((y - LAWN_Y) / CELL_H);
  const c = colOf(x);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  return { r, c };
}

function togglePause(g: Game): void {
  if (g.online) {
    net.toast('Online não pausa! Os gorilas não esperam.', 'chaos');
    return;
  }
  g.paused = !g.paused;
  if (g.paused) showOverlay(pauseHtml(false));
  else uiEl.innerHTML = '';
}

function pressButton(g: Game, name: string): void {
  sfx('click');
  if (name === 'shovel') {
    g.shovel = !g.shovel;
    g.sel = null;
  } else if (name === 'speed') {
    if (g.online) net.toast('Velocidade só no modo solo!', 'info');
    else g.speed = g.speed === 1 ? 2 : 1;
  } else if (name === 'pause') {
    togglePause(g);
  } else if (name === 'menu') {
    if (g.over || confirmExit(g)) endToMenu();
  }
}

function confirmExit(g: Game): boolean {
  if (g.world.time < 5) return true;
  return window.confirm('Sair da partida e voltar ao menu?');
}

cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const g = game;
  if (!g || screen !== 'play' || g.paused) return;
  if (e.button === 2) {
    g.sel = null;
    g.shovel = false;
    return;
  }
  const p = toLogical(e);
  pointer = { x: p.x, y: p.y, mouse: e.pointerType === 'mouse' };
  if (g.over) return;
  const w = g.world;

  // bananas
  if (canCollect(g)) {
    const id = dropAt(g, p.x, p.y, 38);
    if (id >= 0) {
      localCollect(g, id);
      return;
    }
  }
  // bandeja e botões
  if (p.y >= 46 && p.y < 134) {
    for (const [name, rect] of Object.entries(BTN)) {
      if (inRect(p.x, p.y, rect)) {
        pressButton(g, name);
        return;
      }
    }
    const items = trayItems(g);
    for (let i = 0; i < items.length; i++) {
      const rx = PK_X + i * PK_STEP;
      if (inRect(p.x, p.y, { x: rx, y: PK_Y, w: PK_W, h: PK_H })) {
        selectItem(g, items[i]);
        return;
      }
    }
    return;
  }
  // gramado
  const cell = cellAt(p.x, p.y);
  if (g.mode === 'versus' && g.localSlot !== w.plantSlot) {
    const r = Math.floor((p.y - LAWN_Y) / CELL_H);
    if (g.sel && g.sel.kind === 'zombie' && r >= 0 && r < ROWS && p.x > LAWN_X) {
      const type = g.sel.id as ZombieId;
      const err = w.checkSend(g.localSlot, type, r);
      if (err) {
        deny(g, err);
        return;
      }
      if (g.mirror) {
        net.send('cmd', { k: 'send', t: type, r } satisfies CmdMsg);
        sfx('click');
      } else {
        w.sendZombie(g.localSlot, type, r);
      }
      if (!e.shiftKey) g.sel = null;
    }
    return;
  }
  if (!cell) return;
  if (g.shovel) {
    if (g.mirror) {
      net.send('cmd', { k: 'shovel', r: cell.r, c: cell.c } satisfies CmdMsg);
    } else {
      w.shovel(g.localSlot, cell.r, cell.c);
    }
    g.shovel = false;
    return;
  }
  if (g.sel && (g.sel.kind === 'plant' || g.sel.kind === 'belt')) {
    const ok = localPlant(g, g.sel.id as PlantId, cell.r, cell.c, g.sel.beltIdx);
    if (ok && (!e.shiftKey || g.sel.kind === 'belt')) g.sel = null;
  }
});

cv.addEventListener('pointermove', (e) => {
  const g = game;
  const p = toLogical(e);
  pointer = { x: p.x, y: p.y, mouse: e.pointerType === 'mouse' };
  if (!g || screen !== 'play') return;
  g.hover = cellAt(p.x, p.y);
  if (e.pointerType === 'mouse' && !g.paused && !g.over && canCollect(g)) {
    const id = dropAt(g, p.x, p.y, 30);
    if (id >= 0) localCollect(g, id);
  }
});

cv.addEventListener('pointerleave', () => {
  if (game) game.hover = null;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const g = game;
  if (!g || screen !== 'play') return;
  if (e.key === 'Escape') {
    if (g.sel || g.shovel) {
      g.sel = null;
      g.shovel = false;
    } else if (!g.online) togglePause(g);
    return;
  }
  if (g.paused) {
    if (e.key === ' ') togglePause(g);
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    togglePause(g);
    return;
  }
  if (e.key === 's' || e.key === 'S') pressButton(g, 'shovel');
  else if (e.key === 'f' || e.key === 'F') pressButton(g, 'speed');
  else if (/^[0-9]$/.test(e.key)) {
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    const items = trayItems(g);
    if (items[idx]) selectItem(g, items[idx]);
  }
});

document.addEventListener('visibilitychange', () => {
  const g = game;
  if (document.hidden && g && !g.online && !g.paused && !g.over && screen === 'play') togglePause(g);
});

// ---------- desenho ----------
function drawTray(c: C, g: Game, t: number, beat: number): void {
  const w = g.world;
  // painel de madeira
  const grad = c.createLinearGradient(0, 46, 0, 134);
  grad.addColorStop(0, '#9a5f2c');
  grad.addColorStop(1, '#6b3f1d');
  c.fillStyle = grad;
  c.fillRect(0, 46, W, 88);
  c.fillStyle = '#3d2410';
  c.fillRect(0, 132, W, 4);
  c.fillStyle = 'rgba(0,0,0,.18)';
  for (let x = 20; x < W; x += 90) c.fillRect(x, 46, 2, 86);

  const zombieSide = g.mode === 'versus' && g.localSlot !== w.plantSlot;
  // saldo
  rrectFill(c, 8, 52, 104, 76, 10, '#fef3c7', 3);
  if (zombieSide) {
    circ(c, 36, 80, 15, '#f9a8d4', 2.4);
    circ(c, 52, 80, 15, '#f472b6', 2.4);
    c.strokeStyle = '#9d174d';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(44, 78, 6, 0, Math.PI);
    c.stroke();
    outlineText(c, String(Math.floor(w.brains)), 60, 112, 28, '#fff', 'center', 6);
    outlineText(c, 'cérebros', 60, 62, 11, '#fde68a', 'center', 4);
  } else {
    drawBananaIcon(c, 60, 82, 30, t);
    outlineText(c, String(Math.floor(w.bank)), 60, 114, g.level.mode === 'conveyor' ? 14 : 28, '#fff', 'center', 6);
    if (g.level.mode === 'conveyor') outlineText(c, 'ESTEIRA', 60, 112, 16, '#fde047', 'center', 5);
  }

  const items = trayItems(g);
  if (g.level.mode === 'conveyor' && !items.length) {
    outlineText(c, 'Esperando a esteira trazer plantas…', 440, 90, 18, '#fde68a', 'center', 5);
  }
  items.forEach((it, i) => {
    const x = PK_X + i * PK_STEP;
    const selected = g.sel && g.sel.kind === it.kind && g.sel.id === it.id && g.sel.beltIdx === it.beltIdx;
    const lift = selected ? -4 : 0;
    c.save();
    c.translate(0, lift);
    rrectFill(c, x, PK_Y, PK_W, PK_H, 8, it.ok ? '#fde68a' : '#a8a29e', selected ? 4 : 2.6);
    if (selected) {
      rrect(c, x - 2, PK_Y - 2, PK_W + 4, PK_H + 4, 10);
      c.strokeStyle = '#fff';
      c.lineWidth = 2.5;
      c.stroke();
    }
    c.save();
    rrect(c, x + 2, PK_Y + 2, PK_W - 4, PK_H - 4, 6);
    c.clip();
    ell(c, x + PK_W / 2, PK_Y + 40, 24, 24, 'rgba(255,255,255,.35)', 0);
    if (it.kind === 'zombie') {
      const big = it.id === 'chefe';
      drawZombieIcon(c, it.id as ZombieId, x + PK_W / 2 - 2, PK_Y + 58, big ? 0.3 : 0.62, t);
    } else {
      drawPlantIcon(c, it.id as PlantId, x + PK_W / 2, PK_Y + 60, 0.64, t, beat);
    }
    if (it.cdFrac > 0) {
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.fillRect(x + 2, PK_Y + 2, PK_W - 4, (PK_H - 4) * Math.min(1, it.cdFrac));
    }
    c.restore();
    if (it.kind !== 'belt') {
      outlineText(c, String(it.cost), x + PK_W / 2, PK_Y + PK_H - 9, 15, it.ok ? '#fff' : '#fca5a5', 'center', 4);
    }
    if (i < 10) outlineText(c, i === 9 ? '0' : String(i + 1), x + 9, PK_Y + 9, 11, '#fff', 'center', 3);
    c.restore();
  });

  // botões
  const b = BTN;
  rrectFill(c, b.shovel.x, b.shovel.y, b.shovel.w, b.shovel.h, 8, g.shovel ? '#fde047' : '#d6b98c', g.shovel ? 4 : 2.6);
  c.save();
  c.translate(b.shovel.x + 26, b.shovel.y + 40);
  c.rotate(-0.6);
  c.fillStyle = '#92400e';
  c.fillRect(-2.5, -26, 5, 36);
  rrectFill(c, -9, -34, 18, 10, 3, '#6b3f1d', 2);
  c.beginPath();
  c.moveTo(-9, 10);
  c.lineTo(9, 10);
  c.lineTo(7, 30);
  c.lineTo(-7, 30);
  c.closePath();
  c.fillStyle = '#cbd5e1';
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = '#33200f';
  c.stroke();
  c.restore();
  outlineText(c, 'PÁ', b.shovel.x + 26, b.shovel.y + 70, 11, '#fff', 'center', 3);
  const mini = (rect: { x: number; y: number; w: number; h: number }, label: string, on = false): void => {
    rrectFill(c, rect.x, rect.y, rect.w, rect.h, 8, on ? '#fde047' : '#d6b98c', 2.6);
    outlineText(c, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 15, '#fff', 'center', 4);
  };
  mini(b.speed, g.speed === 2 ? '▶▶ 2x' : '▶ 1x', g.speed === 2);
  mini(b.pause, g.paused ? '▶' : '⏸');
  mini(b.menu, '🏠 Sair');
}

function drawBananaIcon(c: C, x: number, y: number, s: number, t: number): void {
  c.save();
  c.translate(x, y + Math.sin(t * 3) * 1.5);
  c.scale(s / 20, s / 20);
  c.beginPath();
  c.moveTo(-18, -2);
  c.quadraticCurveTo(-2, 26, 20, -12);
  c.quadraticCurveTo(4, 8, -18, -2);
  c.fillStyle = '#fde047';
  c.fill();
  c.lineWidth = 2.6;
  c.strokeStyle = '#33200f';
  c.stroke();
  c.restore();
}

function drawTopStrip(c: C, g: Game, t: number): void {
  const w = g.world;
  c.fillStyle = 'rgba(25,12,3,.7)';
  c.fillRect(0, 0, W, 46);
  let label = `Fase ${g.level.id} • ${g.level.name}`;
  if (g.mode === 'versus') label = 'Versus • Plantas x Gorilas';
  else if (g.level.mode === 'survival') label = `Sobrevivência • Onda ${w.wave}`;
  outlineText(c, label, 640, 17, 17, '#fde68a', 'center', 4);
  let sub = `🦍 ${w.kills}`;
  if (g.mode === 'coop') sub += g.localSlot === 0 ? '  •  Você: linhas de CIMA' : '  •  Você: linhas de BAIXO';
  if (g.mode === 'versus') sub += g.localSlot === w.plantSlot ? '  •  Você planta 🌱' : '  •  Você manda gorilas 🦍';
  outlineText(c, sub, 640, 36, 13, '#fff', 'center', 3);
  // barra do chefe
  const boss = w.zombies.find((z) => z.type === 'chefe');
  if (boss) {
    const x = 860;
    const bw = 130;
    rrectFill(c, x, 8, bw, 14, 6, '#450a0a', 2.4);
    rrectFill(c, x + 1, 9, Math.max(2, (bw - 2) * (boss.hp / boss.maxHp)), 12, 5, boss.enraged ? '#ef4444' : '#f97316', 0);
    outlineText(c, 'GORILÃO', x + bw / 2, 15.5, 10, '#fff', 'center', 3);
  }
  void t;
}

function drawProgress(c: C, g: Game, t: number): void {
  const w = g.world;
  const x0 = 150;
  const bw = 700;
  const y = 612;
  rrectFill(c, x0 - 6, y - 14, bw + 12, 28, 12, 'rgba(26,15,6,.82)', 2.4);
  rrectFill(c, x0, y - 7, bw, 14, 7, '#451a03', 0);
  const lvl = g.level;
  if (lvl.mode === 'survival') {
    const k = Math.max(0, 1 - Math.max(0, w.wt) / 24);
    rrectFill(c, x0, y - 7, Math.max(8, bw * k), 14, 7, '#a3e635', 0);
    outlineText(c, `ONDA ${w.wave}  •  próxima em ${Math.max(0, Math.ceil(w.wt))}s`, x0 + bw / 2, y, 12, '#fff', 'center', 3);
    return;
  }
  const p = g.mode === 'versus' ? w.progress() : lvl.waves ? (w.wave - 1 + Math.max(0, 1 - w.wt / 25)) / lvl.waves : 0;
  const k = Math.max(0, Math.min(1, w.wave === 0 && g.mode !== 'versus' ? 0 : p));
  rrectFill(c, x0, y - 7, Math.max(8, bw * (g.mode === 'versus' ? w.progress() : k)), 14, 7, '#84cc16', 0);
  if (g.mode === 'versus') {
    const left = Math.max(0, VERSUS_TIME - w.time);
    outlineText(c, `Sobreviva por ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, x0 + bw / 2, y, 12, '#fff', 'center', 3);
    return;
  }
  for (let i = 0; i < lvl.waves; i++) {
    const flag = i === lvl.waves - 1 || (i + 1) % 10 === 0;
    if (!flag) continue;
    const fx0 = x0 + bw * ((i + 1) / lvl.waves) - 4;
    c.fillStyle = '#ef4444';
    c.fillRect(fx0, y - 18, 3, 22);
    c.beginPath();
    c.moveTo(fx0 + 3, y - 18);
    c.lineTo(fx0 + 15, y - 14);
    c.lineTo(fx0 + 3, y - 10);
    c.fill();
  }
  const hx = x0 + bw * k;
  circ(c, hx, y, 8, '#6b7f5a', 2);
  circ(c, hx - 2.5, y - 1.5, 1.6, '#fef9c3', 0);
  circ(c, hx + 2.5, y - 1, 1.2, '#fef9c3', 0);
  outlineText(c, `Onda ${Math.min(w.wave, lvl.waves)}/${lvl.waves}`, x0 + bw / 2, y, 12, '#fde68a', 'center', 3);
  void t;
}

function previewPlant(c: C, type: PlantId, r: number, col: number, t: number, beat: number): void {
  const def = PLANTS[type];
  const fake: Plant = {
    id: 3,
    type,
    r,
    c: col,
    x: colX(col),
    y: rowY(r) + 30,
    hp: def.hp,
    maxHp: def.hp,
    age: 0,
    cd: 99,
    st: type === 'abacaxi' ? 1 : 0,
    owner: 0,
    flash: 0,
    fireT: 0,
    hugT: 0,
    actT: 0,
    target: 0,
  };
  drawPlant(c, fake, t, beat, 0.55);
}

function drawPlay(c: C, g: Game, t: number, beat: number): void {
  const w = g.world;
  const lvl = g.level;
  c.drawImage(getBackground(lvl.bg, lvl.lanes), 0, 0, W, H);

  // zonas do co-op
  if (g.mode === 'coop') {
    for (const r of lvl.lanes) {
      const zo = zoneOwner(r);
      c.fillStyle = zo === 0 ? 'rgba(250,204,21,.09)' : zo === 1 ? 'rgba(56,189,248,.1)' : 'rgba(255,255,255,.03)';
      c.fillRect(LAWN_X, LAWN_Y + r * CELL_H, COLS * 84, CELL_H);
      const col = zo === 0 ? '#facc15' : zo === 1 ? '#38bdf8' : '#e5e7eb';
      c.fillStyle = col;
      c.fillRect(LAWN_X - 6, LAWN_Y + r * CELL_H + 4, 5, CELL_H - 8);
    }
  }
  // versus: destaque para linhas ao mandar gorilas
  if (g.mode === 'versus' && g.localSlot !== w.plantSlot && g.sel && g.hover) {
    c.fillStyle = 'rgba(251,113,133,.22)';
    c.fillRect(LAWN_X, LAWN_Y + g.hover.r * CELL_H, W - LAWN_X, CELL_H);
  }
  // hover e prévia
  if (g.hover && !g.over && g.mode !== 'versus' || (g.hover && g.mode === 'versus' && g.localSlot === w.plantSlot)) {
    const h = g.hover!;
    if (g.shovel) {
      drawHoverCell(c, h.r, h.c, !!w.plantAt(h.r, h.c));
    } else if (g.sel && (g.sel.kind === 'plant' || g.sel.kind === 'belt')) {
      const err = w.checkPlant(g.localSlot, g.sel.id as PlantId, h.r, h.c, g.sel.beltIdx);
      drawHoverCell(c, h.r, h.c, err === null);
      if (err === null) previewPlant(c, g.sel.id as PlantId, h.r, h.c, t, beat);
    }
  }
  // cursor do parceiro
  if (g.partner && tAnim - g.partner.t < 2) {
    const pr = g.partner;
    c.strokeStyle = g.localSlot === 0 ? '#38bdf8' : '#facc15';
    c.lineWidth = 3;
    c.setLineDash([6, 4]);
    c.strokeRect(LAWN_X + pr.c * 84 + 3, LAWN_Y + pr.r * CELL_H + 3, 84 - 6, CELL_H - 6);
    c.setLineDash([]);
    if (pr.sel) outlineText(c, pr.sel, LAWN_X + pr.c * 84 + 42, LAWN_Y + pr.r * CELL_H + 12, 11, c.strokeStyle as string, 'center', 3);
  }

  // entidades por linha
  for (let r = 0; r < ROWS; r++) {
    for (const p of w.plants) if (p.r === r) drawPlant(c, p, t, beat);
    for (const m of w.mowers) if (m.r === r) drawMower(c, m, t);
    for (const gh of fx.ghosts) if (gh.z.r === r) drawZombie(c, gh.z, t, gh.fxx);
    for (const z of w.zombies) if (z.r === r) drawZombie(c, z, t);
    for (const pr of w.projs) if (pr.r === r) drawProj(c, pr, t);
  }
  for (const d of w.drops) drawDrop(c, d, t);
  drawAmbient(c, lvl.bg, t);

  // macaco dono da casa
  let nearest = 9999;
  for (const z of w.zombies) nearest = Math.min(nearest, z.x);
  let mood = fx.mood;
  if (mood === 'idle' && nearest < LAWN_X + 220 && !g.over) mood = 'scared';
  drawOwner(c, 62, 632, mood, t, 1);

  fx.drawTop(c, t);
  drawTopStrip(c, g, t);
  drawTray(c, g, t, beat);
  drawProgress(c, g, t);
  if (g.shovel) outlineText(c, 'Clique numa planta para arrancá-la (Esc cancela)', 500, LAWN_Y + 20, 16, '#fde047', 'center', 5);
  if (g.sel && g.sel.kind === 'zombie') outlineText(c, 'Clique na linha onde o gorila deve entrar', 500, LAWN_Y + 20, 16, '#fda4af', 'center', 5);
  if (g.mode === 'versus' && g.localSlot !== w.plantSlot) {
    // marca de entrada
  }
  fx.drawBanner(c);
}

// "Modo atração" no título: plantas dançando e gorilas desfilando
const parade: Array<{ type: ZombieId; r: number; x: number; v: number }> = [];
function drawAttract(c: C, t: number, beat: number): void {
  const lanes = [0, 1, 2, 3, 4];
  c.drawImage(getBackground('dia', lanes), 0, 0, W, H);
  if (parade.length === 0) {
    const types: ZombieId[] = ['basico', 'cone', 'balde', 'vara', 'gerente', 'jornal', 'futebol', 'porta'];
    for (let i = 0; i < 8; i++) parade.push({ type: types[i], r: i % 5, x: 400 + i * 160, v: 16 + (i % 3) * 5 });
  }
  const order: PlantId[] = ['bananeira', 'coco', 'mandioca', 'cacto', 'maracuja'];
  for (let r = 0; r < ROWS; r++) {
    const type = order[r % order.length];
    const def = PLANTS[type];
    const fake: Plant = {
      id: r + 2,
      type,
      r,
      c: 0,
      x: colX(1),
      y: rowY(r) + 30,
      hp: def.hp,
      maxHp: def.hp,
      age: 0,
      cd: 99,
      st: 0,
      owner: 0,
      flash: 0,
      fireT: 0,
      hugT: 0,
      actT: 0,
      target: 0,
    };
    drawPlant(c, fake, t, beat);
    for (const p of parade) {
      if (p.r !== r) continue;
      const z = mkZombie(p.type, p.x, r, true, false);
      const defz = ZOMBIES[p.type];
      z.maxArmor = defz.armor;
      z.armor = defz.armor;
      z.phase = p.x * 0.01;
      drawZombie(c, z, t);
    }
  }
  drawOwner(c, 62, 632, 'idle', t, 1);
  c.fillStyle = 'rgba(0,0,0,.2)';
  c.fillRect(0, 0, W, H);
}

// ---------- loop ----------
function update(dt: number): void {
  const g = game;
  tAnim += dt;
  fx.update(dt, tAnim);
  if (!g || screen !== 'play') {
    const wrap = parade;
    for (const p of wrap) {
      p.x -= p.v * dt;
      if (p.x < 160) p.x = W + 100 + Math.random() * 200;
    }
    return;
  }
  if (g.paused) return;
  const w = g.world;
  const steps = g.mirror ? 1 : g.speed;
  for (let i = 0; i < steps; i++) {
    w.step(dt);
    if (!g.mirror) {
      const evs = w.drainEvents();
      for (const ev of evs) fx.handle(ev, w);
      if (g.online) g.evBuf.push(...evs);
    }
  }
  if (g.online && !g.mirror) {
    g.snapT += dt;
    if (g.snapT >= 0.066) {
      g.snapT = 0;
      net.send('snap', { ...(w.pack() as object), ev: g.evBuf });
      g.evBuf = [];
    }
  }
  if (g.online && g.hover && !g.over) {
    g.curT += dt;
    if (g.curT > 0.12) {
      g.curT = 0;
      const lbl = g.sel ? (g.sel.kind === 'zombie' ? ZOMBIES[g.sel.id as ZombieId].name : PLANTS[g.sel.id as PlantId].name) : '';
      net.send('cur', { r: g.hover.r, c: g.hover.c, sel: lbl } satisfies CursorMsg);
    }
  }
  if (w.state !== 'playing' && !g.over) {
    g.over = true;
    g.overT = 0;
    g.sel = null;
    g.shovel = false;
  }
  if (g.over) {
    g.overT += dt;
    if (g.overT > 2.2 && !g.resultShown) showResult();
  }
  void monkeyAudio;
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}

function tick(dt: number): void {
  try {
    update(dt);
    const t = tAnim;
    const beat = beatNow();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.save();
    if (fx.shake > 0 && screen === 'play') {
      ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    }
    if (game && screen === 'play') drawPlay(ctx, game, t, beat);
    else drawAttract(ctx, t, beat);
    ctx.restore();
  } catch (err) {
    ctx.restore();
    (window as unknown as { __pvzErr?: string }).__pvzErr = String((err as Error)?.stack ?? err);
    console.error(err);
  }
}

// debug leve (testes automatizados)
Object.assign(window, {
  __pvz: {
    get game() {
      return game;
    },
    tick: (n: number, dt = 0.033) => {
      for (let i = 0; i < n; i++) tick(dt);
    },
    startSolo: (id: number) => {
      const lv = LEVELS.find((l) => l.id === id) ?? LEVELS[0];
      startGame(lv, 'solo', { localSlot: 0, mirror: false, online: false, plantSlot: 0 });
    },
  },
});

void TAU;
setScreen('title');
requestAnimationFrame(frame);
