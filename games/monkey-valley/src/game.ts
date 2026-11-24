import { mountMonkeyHud, reportGameScore, type MonkeyHudHandle } from '@monkey-slop/sdk';
import { S, newPlayer, addItem, countItem, removeItems, hotbarItem, hasRoom, spawnParticles, floatText, dirVec, facingTile, HOTBAR } from './state';
import type { Dir, Fx, OpResult, ToolId } from './types';
import { World, DAY_END } from './world';
import { BUILDINGS, FARM, MW, SPAWN, T, doorOf, frontOf, SEASONS } from './layout';
import { CROPS, FISH_LIST, ITEMS, NPCS, NPC_BY_ID, QUESTS, ROD_COST, UPGRADE_COST, TOOL_IDS, TOOL_NAMES, weekdayOf } from './data';
import { initNpcPaths, npcPose, npcInside } from './npc';
import { Mine, MINE_H, MINE_W, MAX_FLOOR } from './mine';
import { ValleyNet } from './net';
import { sfx, startMusic, setMusicMood, unlockAudio, stopMusic } from './audio';
import { loadSave, writeSave, clearSave, playerToSave, applyPlayerSave, loadGuest, writeGuest } from './save';
import * as ui from './ui';
import { hash2 } from './util';
import { ambient } from './render';

export const SLUG = 'monkey-valley';

let hud: MonkeyHudHandle | null = null;
let net: ValleyNet;
let uiRoot: HTMLElement;
let canvasEl: HTMLCanvasElement;

const keys = new Set<string>();
let actHeld = false;
let mouseHeld = false;
let stepT = 0;
let clockT = 0;
let questT = 0;
let saveT = 0;
let sleepOverlay: HTMLElement | null = null;
let sleepT = 0;
let thunderT = 0;
let lastSeason = -1;

export function getNet(): ValleyNet {
  return net;
}

function toast(t: string, tone: 'banana' | 'chaos' | 'info' = 'banana'): void {
  if (hud) hud.toast(t, tone);
}

// ---------------------------------------------------------------- Autoridade

function afterOp(): void {
  const ch = S.world.takeDirty();
  if (S.online && ch.length) net.send({ k: 'tile', ch });
}

export function act(op: string, a: unknown, cb: (r: OpResult) => void): void {
  if (S.auth) {
    const r = S.world.apply(op, a);
    afterOp();
    if (S.online) {
      net.broadcastClock();
      if (op === 'talk' || op === 'gift') net.broadcastFriends();
      if (op === 'animal' || op === 'buyAnimal') net.send({ k: 'animals', a: S.world.animals });
    }
    cb(r);
  } else net.request(op, a, cb);
}

function stat(k: string, n = 1): void {
  S.world.stats[k] = (S.world.stats[k] ?? 0) + n;
}

function giveItems(list: { id: string; n: number }[] | undefined, x: number, y: number): void {
  if (!list) return;
  let dy = 0;
  for (const g of list) {
    if (!addItem(S.me, g.id, g.n)) {
      toast('Mochila cheia! 🎒', 'chaos');
      sfx('error');
    }
    floatText(x, y - 12 - dy, `+${g.n} ${ITEMS[g.id]?.name ?? g.id}`, '#fff6a0');
    dy += 8;
  }
}

const FX_COL: Record<string, string[]> = {
  dust: ['#a8814e', '#c19a62', '#8a5e36'],
  water: ['#7ac4ff', '#bfe6ff', '#4a9ae0'],
  chip: ['#b8bec8', '#8a909a', '#e0e4ea'],
  leaf: ['#6cc85a', '#4aa83a', '#a8e070'],
  sparkle: ['#fff6a0', '#ffd84a', '#ffffff'],
  coin: ['#ffd84a', '#fff6a0'],
  heart: ['#ff6a8a', '#ffb0c4'],
};

function showFx(fx: Fx[] | undefined): void {
  if (!fx) return;
  for (const f of fx) {
    const cols = FX_COL[f.k] ?? FX_COL.dust;
    for (let i = 0; i < 6; i++) spawnParticles(f.x * 16 + 8, f.y * 16 + 8, 1, cols[i % cols.length], 22, 36, 2);
  }
}

// ---------------------------------------------------------------- Sessão

function seedFor(): number {
  return 1 + Math.floor(Math.random() * 99999);
}

function starterKit(): void {
  const p = S.me;
  p.inv.fill(null);
  addItem(p, 's-mandioca', 8);
  addItem(p, 's-couve', 5);
  addItem(p, 's-morango', 3);
  addItem(p, 'pao-queijo', 2);
}

function beginPlay(): void {
  S.started = true;
  S.mode = 'play';
  ui.hideTitle();
  ui.showHUD(true);
  S.me.sel = 0;
  S.cam.x = S.me.x;
  S.cam.y = S.me.y;
  unlockAudio();
  if (S.musicOn) startMusic();
  S.remotes.clear();
}

export function startNew(name: string, fi: number, si: number): void {
  const joining = S.online && !S.auth;
  S.me = newPlayer(name, fi, si);
  S.me.id = net.myId;
  net.room.setPlayerName(name);
  if (joining) {
    S.me.x = SPAWN[0] * 16 + 8;
    S.me.y = SPAWN[1] * 16 + 12;
    guestKit();
    beginPlay();
    return;
  }
  clearSave();
  S.world = new World(seedFor());
  S.world.minutes = 360;
  S.me.x = SPAWN[0] * 16 + 8;
  S.me.y = SPAWN[1] * 16 + 12;
  starterKit();
  beginPlay();
  ui.openLetter(
    [
      'Querido neto,<br><br>Se você está lendo esta carta, é porque eu finalmente descansei debaixo da minha bananeira favorita. 🍌',
      'Deixei pra você a minha roça em <b>Vila Bananal</b>. Está um pouco abandonada... na verdade tá um matagal. Mas tem alma!',
      'Pegue a enxada, planta uns pés de mandioca e rega com carinho. Conheça o povo da vila — todos são meio malucos, mas de bom coração.',
      'E se ficar curioso, desça na minha <b>mina</b> lá no nordeste. Dizem que tem um tesouro no fundo. (Eu nunca cheguei. Tinha medo de gosma.)<br><br>Com amor, <b>Vovô Zeca</b> 🐒',
    ],
    () => toast('Dica: aperte ? no menu de pausa (Esc) para ver os controles. Boa roça! 🌾'),
  );
}

function guestKit(): void {
  const g = loadGuest();
  if (g) {
    applyPlayerSave(S.me, g);
    S.me.x = SPAWN[0] * 16 + 8;
    S.me.y = SPAWN[1] * 16 + 12;
    return;
  }
  S.me.inv.fill(null);
  addItem(S.me, 'pao-queijo', 2);
  const season = S.world.season;
  const seeds = Object.values(CROPS).filter((c) => c.seasons.includes(season));
  for (const c of seeds.slice(0, 3)) addItem(S.me, 's-' + c.id, 5);
}

export function continueGame(): void {
  const d = loadSave();
  if (!d) {
    toast('Nenhum save encontrado.', 'chaos');
    return;
  }
  if (S.online && !S.auth) {
    toast('Você está na roça de outro jogador!', 'chaos');
    return;
  }
  S.world = new World(d.world.seed);
  S.world.load(d.world);
  S.me = newPlayer(d.player.name, d.player.fi, d.player.si);
  S.me.id = net.myId;
  applyPlayerSave(S.me, d.player);
  net.room.setPlayerName(S.me.name);
  S.me.x = SPAWN[0] * 16 + 8;
  S.me.y = SPAWN[1] * 16 + 12;
  S.mine = null;
  S.me.map = 'world';
  beginPlay();
  toast(`Bem-vindo de volta, ${S.me.name}! 🌾`, 'banana');
}

export function saveGame(silent = false): void {
  if (!S.started) return;
  if (S.auth) {
    const ok = writeSave({ v: 1, world: S.world.toSave(), player: playerToSave(S.me), savedAt: Date.now() });
    if (!silent) toast(ok ? '💾 Jogo salvo!' : 'Não foi possível salvar (armazenamento bloqueado).', ok ? 'banana' : 'chaos');
  } else {
    writeGuest(playerToSave(S.me));
    if (!silent) toast('💾 Seu fazendeiro foi salvo (o mundo é do host).', 'info');
  }
}

function reportScore(): void {
  if (S.started && S.world.totalEarned > 0) reportGameScore(SLUG, S.world.totalEarned, { dia: S.world.day, ano: S.world.year });
}

export function toTitle(): void {
  reportScore();
  saveGame(true);
  stopMusic();
  S.started = false;
  S.mine = null;
  S.me.map = 'world';
  S.fish = null;
  ui.fishUI(false);
  ui.uiReset();
  if (!(S.online && !S.auth)) {
    S.world = new World(loadSave()?.world.seed ?? 3);
    S.world.minutes = 600;
  }
  ui.showTitle(!!loadSave());
}

function newGameFromPause(): void {
  clearSave();
  S.started = false;
  toTitle();
}

function onSnapshot(): void {
  if (!S.started) {
    S.me = newPlayer(net.room.localPlayer.name, Math.floor(Math.random() * 6), Math.floor(Math.random() * 8));
    S.me.id = net.myId;
    S.me.x = SPAWN[0] * 16 + 8;
    S.me.y = SPAWN[1] * 16 + 12;
    guestKit();
    beginPlay();
    toast('🌾 Você entrou na roça! O host manda no relógio e nas plantas.', 'banana');
  }
}

// ---------------------------------------------------------------- Dia e noite

function endOfDayLines(earned: number, dead: number, seasonChanged: boolean, passed: boolean): string[] {
  const w = S.world;
  const lines: string[] = [];
  lines.push(passed ? '😵 Você desmaiou de cansaço e acordou na cama...' : '😴 Você dormiu feito pedra.');
  lines.push(`📦 Caixa de entrega rendeu <b>${earned} 🍌</b>`);
  if (dead > 0) lines.push(`🥀 ${dead} plantas morreram na virada de estação...`);
  if (seasonChanged) lines.push(`${SEASONS[w.season]} chegou! ${w.season === 0 ? `Começou o <b>Ano ${w.year}</b>!` : ''}`);
  const wt = { sol: '☀️ Dia de sol', chuva: '🌧️ Vai chover hoje (as plantas se regam sozinhas!)', tempestade: '⛈️ Tempestade a caminho!', neve: '❄️ Está nevando!' }[w.weather];
  lines.push(wt);
  for (const n of NPCS) if (w.isBirthday(n.id)) lines.push(`🎂 Hoje é aniversário de <b>${n.name}</b>! Leve um presente (4x de amizade).`);
  if (w.totalEarned >= 10000) lines.push('🏆 Você é uma lenda do Bananal!');
  return lines;
}

function afterNewDay(earned: number, dead: number, seasonChanged: boolean, passed: boolean): void {
  const p = S.me;
  const slept = p.sleeping;
  p.energy = slept ? p.maxEnergy : Math.floor(p.maxEnergy * 0.6);
  p.sleeping = false;
  p.map = 'world';
  S.mine = null;
  S.fish = null;
  ui.fishUI(false);
  p.x = SPAWN[0] * 16 + 8;
  p.y = SPAWN[1] * 16 + 12;
  p.dir = 0;
  p.invuln = 0;
  if (slept) stat('slept');
  closeSleepOverlay();
  sfx('rooster');
  S.cam.x = p.x;
  S.cam.y = p.y;
  if (seasonChanged) {
    reportScore();
  }
  saveGame(true);
  ui.openSummary(endOfDayLines(earned, dead, seasonChanged, passed), `🌅 Dia ${S.world.day} • ${SEASONS[S.world.season]}`, () => {
    S.mode = 'play';
  });
}

function doNewDay(passed: boolean): void {
  if (!S.auth) return;
  const w = S.world;
  if (passed) {
    const loss = Math.min(300, Math.floor(w.money * 0.03));
    w.money -= loss;
  }
  const sum = w.newDay();
  w.dirty.clear();
  net.send({ k: 'newday', w: w.toSave(), passed, earned: sum.earned, dead: sum.dead, season: sum.season });
  afterNewDay(sum.earned, sum.dead, sum.season, passed);
  if (S.online) net.broadcastClock();
}

function startSleep(): void {
  const p = S.me;
  p.sleeping = true;
  S.mode = 'sleep';
  sfx('sleep');
  sleepOverlay = document.createElement('div');
  sleepOverlay.style.cssText = 'position:fixed;inset:0;background:#05061a;color:#cfd8ff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:900 30px "Trebuchet MS";z-index:50;opacity:0;transition:opacity 1s;pointer-events:auto;gap:10px';
  sleepOverlay.innerHTML = '<div>💤 Zzz...</div><div id="vl-sleep-sub" style="font-size:15px;font-weight:700">Dormindo...</div><button class="btn brown" style="font:800 15px Trebuchet MS;padding:6px 14px;border-radius:8px;border:2px solid #7a4a22;background:#b8793a;color:#fff;cursor:pointer">Acordar</button>';
  sleepOverlay.querySelector('button')!.addEventListener('click', cancelSleep);
  uiRoot.appendChild(sleepOverlay);
  requestAnimationFrame(() => sleepOverlay && (sleepOverlay.style.opacity = '1'));
  sleepT = 0;
}

function cancelSleep(): void {
  if (S.mode !== 'sleep') return;
  S.me.sleeping = false;
  closeSleepOverlay();
  S.mode = 'play';
}

function closeSleepOverlay(): void {
  sleepOverlay?.remove();
  sleepOverlay = null;
}

function allSleeping(): boolean {
  if (!S.me.sleeping) return false;
  for (const r of S.remotes.values()) if (!r.info.sleep) return false;
  return true;
}

// ---------------------------------------------------------------- Ações do jogador

function solidTile(tx: number, ty: number): boolean {
  if (S.me.map === 'mine' && S.mine) return S.mine.isSolid(tx, ty);
  return S.world.isSolid(tx, ty);
}

function collides(x: number, y: number): boolean {
  return solidTile(Math.floor((x - 4) / 16), Math.floor((y - 1) / 16)) || solidTile(Math.floor((x + 4) / 16), Math.floor((y - 1) / 16)) || solidTile(Math.floor((x - 4) / 16), Math.floor((y - 6) / 16)) || solidTile(Math.floor((x + 4) / 16), Math.floor((y - 6) / 16));
}

function movePlayer(dt: number): void {
  const p = S.me;
  let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + ui.touch.dx;
  let iy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + ui.touch.dy;
  const m = Math.hypot(ix, iy);
  if (S.fish) {
    p.moving = false;
    return;
  }
  if (m > 0.01) {
    ix /= Math.max(1, m);
    iy /= Math.max(1, m);
    const run = keys.has('shift') || ui.touch.run;
    const sp = run ? 92 : 64;
    if (p.swing <= 0) p.dir = Math.abs(ix) > Math.abs(iy) ? (ix < 0 ? 1 : 2) : iy < 0 ? 3 : 0;
    const nx = p.x + ix * sp * dt;
    if (!collides(nx, p.y)) p.x = nx;
    const ny = p.y + iy * sp * dt;
    if (!collides(p.x, ny)) p.y = ny;
    p.moving = true;
    p.animT += dt * (run ? 1.4 : 1);
    stepT -= dt * (run ? 1.4 : 1);
    if (stepT <= 0) {
      stepT = 0.3;
      const tx = Math.floor(p.x / 16);
      const ty = Math.floor((p.y - 2) / 16);
      const terr = p.map === 'world' ? S.world.terrain[ty * MW + tx] : T.FLOOR;
      sfx('step', terr === T.SAND ? 0 : terr === T.PLANK || terr === T.BRIDGE ? 3 : 1);
    }
  } else {
    p.moving = false;
    p.animT = 0;
  }
}

function areaCells(tool: ToolId, tier: number): number[] {
  const p = S.me;
  const [fx, fy] = facingTile(p);
  const [dx, dy] = dirVec(p.dir);
  const px = -dy;
  const py = dx;
  const cells: number[] = [];
  const add = (w: number, d: number) => {
    const x = fx + dx * d + px * w;
    const y = fy + dy * d + py * w;
    if (x >= 0 && y >= 0 && x < MW && y < 50) cells.push(y * MW + x);
  };
  if (tool !== 'hoe' && tool !== 'can') {
    add(0, 0);
    return cells;
  }
  if (tier <= 0) add(0, 0);
  else if (tier === 1) for (let d = 0; d < 3; d++) add(0, d);
  else for (let d = 0; d < (tier === 2 ? 2 : 3); d++) for (let w = -1; w <= 1; w++) add(w, d);
  return cells;
}

const BASE_COST: Record<ToolId, number> = { hoe: 2, can: 1, axe: 3, pick: 3, rod: 2, sickle: 1 };

function spendEnergy(tool: ToolId): boolean {
  const cost = BASE_COST[tool] * (1 - 0.12 * S.me.tiers[tool]);
  if (S.me.energy < cost) {
    toast('Sem energia! Coma algo ou vá dormir. 😴', 'chaos');
    sfx('error');
    return false;
  }
  return true;
}

function payEnergy(tool: ToolId): void {
  S.me.energy = Math.max(0, S.me.energy - BASE_COST[tool] * (1 - 0.12 * S.me.tiers[tool]));
}

function swing(slot: number, dur = 0.28): void {
  S.me.swing = dur;
  S.me.swingMax = dur;
  S.me.swingSlot = slot;
}

function useAction(): void {
  const p = S.me;
  if (p.swing > 0 || S.mode !== 'play') return;
  const sel = hotbarItem(p, p.sel);
  const [fx, fy] = facingTile(p);
  if (sel.tool) {
    const tool = sel.tool;
    if (p.map === 'mine') return mineAction(tool, fx, fy);
    if (tool === 'rod') return startFishing();
    if (!spendEnergy(tool)) return;
    const key = fy * MW + fx;
    const d = S.world.getD(key);
    if (d && S.world.isRipe(d)) {
      swing(p.sel);
      return harvestAt(key);
    }
    if (tool === 'can' && S.world.isWaterTile(fx, fy)) {
      swing(p.sel);
      p.water = 20 + 15 * p.tiers.can;
      sfx('splash');
      spawnParticles(fx * 16 + 8, fy * 16 + 8, 8, '#bfe6ff', 24, 30);
      floatText(p.x, p.y - 30, 'Regador cheio! 💧', '#bfe6ff');
      return;
    }
    swing(p.sel);
    const tier = p.tiers[tool];
    const cells = areaCells(tool, tier);
    if (tool === 'can') {
      if (p.water < 1) {
        toast('Regador vazio! Encha na água do lago ou do rio.', 'info');
        sfx('error');
        return;
      }
    }
    sfx(tool === 'hoe' ? 'hoe' : tool === 'can' ? 'water' : tool === 'axe' ? 'chop' : tool === 'pick' ? 'pick' : 'hoe');
    act('tool', { tool, tier, cells }, (r) => {
      showFx(r.fx);
      if (r.ok) {
        payEnergy(tool);
        const n = r.n ?? 1;
        if (tool === 'hoe') stat('tilled', n);
        if (tool === 'can') {
          p.water = Math.max(0, p.water - n);
          stat('watered', n);
        }
        giveItems(r.grant, fx * 16 + 8, fy * 16);
        if (r.data?.broke) {
          S.shake = 2.5;
          sfx('pop');
        }
      } else if (r.msg) {
        toast(r.msg, 'info');
      }
    });
    return;
  }
  const st = sel.stack;
  if (!st) return;
  const id = st.id;
  if (id.startsWith('s-')) {
    swing(p.sel, 0.18);
    const key = fy * MW + fx;
    act('plant', { key, seed: id }, (r) => {
      if (r.ok) {
        removeItems(p, id, 1);
        stat('planted');
        sfx('plant');
        showFx(r.fx);
      } else {
        sfx('error');
        toast(r.msg ?? 'Só dá para plantar em terra arada e livre!', 'info');
      }
    });
    return;
  }
  eatSelected();
}

function eatSelected(): void {
  const p = S.me;
  const st = hotbarItem(p, p.sel).stack;
  if (!st) return;
  const d = ITEMS[st.id];
  if (!d?.energy) {
    toast(`${d?.name ?? 'Isso'} não é comestível.`, 'info');
    return;
  }
  if (p.energy >= p.maxEnergy - 1) {
    toast('Você já está cheio de energia!', 'info');
    return;
  }
  const before = p.energy;
  p.energy = Math.min(p.maxEnergy, p.energy + d.energy);
  removeItems(p, st.id, 1);
  sfx('eat');
  floatText(p.x, p.y - 30, `+${Math.round(p.energy - before)} ⚡`, '#9aff7a');
  spawnParticles(p.x, p.y - 14, 6, '#ffe28a', 14, 24);
}

function harvestAt(key: number): void {
  const p = S.me;
  const x = key % MW;
  const y = Math.floor(key / MW);
  act('harvest', { key }, (r) => {
    if (r.ok) {
      giveItems(r.grant, x * 16 + 8, y * 16);
      showFx(r.fx);
      stat('harvested');
      sfx('harvest');
      spawnParticles(x * 16 + 8, y * 16 + 6, 8, '#fff6a0', 22, 30);
    }
  });
  void p;
}

// ---------------------------------------------------------------- Mina

function enterMine(floor: number): void {
  const p = S.me;
  S.mine = new Mine(floor, S.world.day);
  S.mineFloor = floor;
  p.map = 'mine';
  p.x = 3 * 16 + 8;
  p.y = 2 * 16 + 14;
  p.dir = 0;
  p.mineMax = Math.max(p.mineMax, floor);
  S.cam.x = p.x;
  S.cam.y = p.y;
  sfx('ladder');
  toast(`⛏️ Mina — Andar ${floor}${floor === MAX_FLOOR ? ' (o fundo!)' : ''}`, 'info');
}

function exitMine(): void {
  const p = S.me;
  S.mine = null;
  p.map = 'world';
  const [fx, fy] = frontOf('mina');
  p.x = fx * 16 + 8;
  p.y = fy * 16 + 12;
  p.dir = 0;
  S.cam.x = p.x;
  S.cam.y = p.y;
  sfx('ladder');
}

function mineAction(tool: ToolId, fx: number, fy: number): void {
  const p = S.me;
  const m = S.mine;
  if (!m || tool === 'rod' || tool === 'can') {
    if (tool === 'can' || tool === 'rod') toast('Aqui não tem onde usar isso!', 'info');
    return;
  }
  if (!spendEnergy(tool)) return;
  swing(p.sel);
  const [dx, dy] = dirVec(p.dir);
  const power = 1 + p.tiers[tool];
  // inimigos na frente
  let hitSlime = false;
  for (const s of m.slimes) {
    const ax = p.x + dx * 12;
    const ay = p.y - 4 + dy * 12;
    if (Math.hypot(s.x - ax, s.y - 4 - ay) < 16) {
      s.hp -= power + (tool === 'sickle' ? 1 : 0);
      s.hurt = 0.25;
      s.kx = dx * 90;
      s.ky = dy * 90;
      hitSlime = true;
      spawnParticles(s.x, s.y - 6, 6, '#6ad85a', 20, 20);
      sfx('pick');
      if (s.hp <= 0) {
        m.slimes = m.slimes.filter((q) => q !== s);
        giveItems([{ id: 'gosma', n: 1 + Math.floor(Math.random() * 2) }], s.x, s.y - 10);
        S.shake = 2;
        if (Math.random() < 0.3) giveItems([{ id: 'carvao', n: 1 }], s.x, s.y - 18);
      }
    }
  }
  if (hitSlime) {
    payEnergy(tool);
    return;
  }
  const rock = m.rocks.get(fy * MINE_W + fx);
  if (!rock) {
    sfx('hoe');
    return;
  }
  if (tool !== 'pick') {
    toast('Pedras pedem a Picareta (tecla 4)!', 'info');
    sfx('error');
    return;
  }
  const r = m.hit(fx, fy, power);
  payEnergy(tool);
  sfx('pick');
  spawnParticles(fx * 16 + 8, fy * 16 + 8, 6, '#c8ced6', 22, 24);
  if (r.broke) {
    stat('mined');
    S.shake = 2;
    giveItems(r.grant, fx * 16 + 8, fy * 16);
    sfx('pop');
    if (r.ladder) {
      toast('🪜 Uma escada apareceu! (E para descer)', 'banana');
      sfx('harvest');
    }
  }
}

function updateMine(dt: number): void {
  const m = S.mine;
  const p = S.me;
  if (!m) return;
  p.invuln = Math.max(0, p.invuln - dt);
  p.flash = Math.max(0, p.flash - dt);
  for (const s of m.slimes) {
    s.hurt = Math.max(0, s.hurt - dt);
    s.cool = Math.max(0, s.cool - dt);
    s.phase += dt;
    const dx = p.x - s.x;
    const dy = p.y - 4 - s.y;
    const d = Math.hypot(dx, dy);
    let vx = s.kx;
    let vy = s.ky;
    s.kx *= 0.85;
    s.ky *= 0.85;
    if (d < 96 && s.hurt <= 0) {
      const sp = 16 + m.floor * 0.7;
      vx += (dx / d) * sp;
      vy += (dy / d) * sp;
    } else if (s.hurt <= 0) {
      vx += Math.cos(s.phase * 0.6) * 6;
      vy += Math.sin(s.phase * 0.7) * 6;
    }
    const nx = s.x + vx * dt;
    const ny = s.y + vy * dt;
    if (!m.isSolid(Math.floor(nx / 16), Math.floor((s.y - 2) / 16))) s.x = nx;
    if (!m.isSolid(Math.floor(s.x / 16), Math.floor((ny - 2) / 16))) s.y = ny;
    if (d < 11 && p.invuln <= 0) {
      p.invuln = 1;
      p.flash = 0.6;
      p.energy = Math.max(0, p.energy - (5 + m.floor / 3));
      S.shake = 4;
      sfx('hurt');
      floatText(p.x, p.y - 28, 'Ai! 💢', '#ff7a7a');
      const nxp = p.x + (dx / d) * -14;
      const nyp = p.y + (dy / d) * -14;
      if (!collides(nxp, p.y)) p.x = nxp;
      if (!collides(p.x, nyp)) p.y = nyp;
    }
  }
  if (p.energy <= 0) {
    toast('😵 Você desmaiou na mina e acordou do lado de fora!', 'chaos');
    p.energy = 25;
    exitMine();
  }
}

// ---------------------------------------------------------------- Pesca

function startFishing(): void {
  const p = S.me;
  if (S.fish) return;
  const [dx, dy] = dirVec(p.dir);
  const tx = Math.floor(p.x / 16);
  const ty = Math.floor((p.y - 4) / 16);
  let found: [number, number] | null = null;
  for (let k = 1; k <= 4; k++) {
    const x = tx + dx * k;
    const y = ty + dy * k;
    if (S.world.isWaterTile(x, y)) {
      found = [x, y];
      break;
    }
  }
  if (!found) {
    toast('Fique de frente para a água para pescar! 🎣', 'info');
    sfx('error');
    return;
  }
  if (!spendEnergy('rod')) return;
  payEnergy('rod');
  swing(p.sel, 0.4);
  sfx('cast');
  const area = found[1] >= 44 ? 'mar' : 'rio';
  S.fish = { phase: 'wait', t: 0, biteAt: 1.5 + Math.random() * 4, fx: found[0], fy: found[1], area, fish: 'lambari', diff: 1, bar: 0.2, barV: 0, pos: 0.5, target: 0.5, prog: 0.3, perfect: true, junk: false };
  S.mode = 'play';
  setTimeout(() => sfx('splash'), 300);
}

function pickFish(): { id: string; diff: number; junk: boolean } {
  const w = S.world;
  if (Math.random() < 0.1) return { id: 'bota', diff: 1, junk: true };
  const f = S.fish!;
  const cand = FISH_LIST.filter((q) => q.area === f.area && q.seasons.includes(w.season) && w.minutes >= q.from && w.minutes <= q.to);
  if (!cand.length) return { id: f.area === 'rio' ? 'lambari' : 'sardinha', diff: 1, junk: false };
  const weights = cand.map((q) => 6 - q.diff + (w.raining ? 1 : 0));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) {
    r -= weights[i];
    if (r <= 0) return { id: cand[i].id, diff: cand[i].diff, junk: false };
  }
  return { id: cand[0].id, diff: cand[0].diff, junk: false };
}

function endFishing(msg?: string): void {
  S.fish = null;
  actHeld = false;
  mouseHeld = false;
  ui.fishUI(false);
  if (msg) toast(msg, 'info');
}

function fishPress(): void {
  const f = S.fish;
  if (!f) return;
  if (f.phase === 'wait') {
    endFishing('Você puxou cedo demais... o peixe nem apareceu. 🎣');
    sfx('error');
  } else if (f.phase === 'bite') {
    const pf = pickFish();
    f.fish = pf.id;
    f.diff = pf.diff;
    f.junk = pf.junk;
    f.phase = 'reel';
    f.t = 0;
    f.prog = 0.35;
    f.bar = 0.3;
    f.barV = 0;
    f.pos = 0.4;
    f.target = 0.6;
    f.perfect = true;
    sfx('splash');
  }
}

function updateFishing(dt: number): void {
  const f = S.fish;
  const p = S.me;
  if (!f) return;
  f.t += dt;
  const hold = actHeld || mouseHeld || ui.touch.act;
  if (f.phase === 'wait') {
    if (f.t >= f.biteAt) {
      f.phase = 'bite';
      f.t = 0;
      sfx('bite');
      S.shake = 1.5;
    }
  } else if (f.phase === 'bite') {
    if (f.t > 1.1) {
      endFishing('O peixe escapou... Seja mais rápido! 🐟');
    }
  } else if (f.phase === 'reel') {
    const size = 0.3 + p.tiers.rod * 0.07;
    f.barV += (hold ? 3.2 : -2.4) * dt;
    f.barV *= 1 - Math.min(0.9, 2.2 * dt);
    f.bar += f.barV * dt;
    if (f.bar < 0) {
      f.bar = 0;
      f.barV = Math.abs(f.barV) * 0.3;
    }
    if (f.bar > 1 - size) {
      f.bar = 1 - size;
      f.barV = -Math.abs(f.barV) * 0.3;
    }
    if (Math.abs(f.pos - f.target) < 0.03 || Math.random() < dt * 0.55) f.target = Math.random();
    const sp = 0.16 + f.diff * 0.06;
    f.pos += Math.sign(f.target - f.pos) * Math.min(Math.abs(f.target - f.pos), sp * dt * 1.6);
    const inside = f.pos >= f.bar && f.pos <= f.bar + size;
    if (inside) f.prog += (0.4 - f.diff * 0.02) * dt;
    else {
      f.prog -= (0.09 + f.diff * 0.02) * dt;
      f.perfect = false;
    }
    if (Math.floor(S.time * 8) % 2 === 0) sfx('reel', f.prog);
    ui.fishUI(true, f.bar, size, f.pos, f.prog, f.fish);
    if (f.prog >= 1) {
      const id = f.fish;
      const junk = f.junk;
      const perfect = f.perfect;
      endFishing();
      const n = perfect && !junk ? 2 : 1;
      addItem(p, id, n);
      stat('fished');
      sfx(junk ? 'error' : 'catch');
      floatText(p.x, p.y - 34, `${junk ? '' : '🎣 '}${ITEMS[id].name}${n > 1 ? ' x2 (PERFEITO!)' : ''}`, junk ? '#c8b090' : '#9ae6ff');
      toast(junk ? 'Pescou uma Bota Velha... 🥾' : `Pescou: ${ITEMS[id].name}${perfect ? ' — PERFEITO!' : '!'}`, junk ? 'info' : 'banana');
      spawnParticles(p.x, p.y - 26, 14, '#9ae6ff', 30, 40);
    } else if (f.prog <= 0) {
      endFishing('O peixe fugiu com a isca! 😭');
      sfx('error');
    }
  }
}

// ---------------------------------------------------------------- Interação

function nearestNpc(): { id: string; x: number; y: number } | null {
  const p = S.me;
  if (p.map !== 'world') return null;
  const [dx, dy] = dirVec(p.dir);
  const px = p.x + dx * 10;
  const py = p.y - 6 + dy * 10;
  let best: { id: string; x: number; y: number } | null = null;
  let bd = 20;
  for (const n of NPCS) {
    const pose = npcPose(n, S.world.minutes);
    if (pose.inside) continue;
    const d = Math.hypot(pose.x - px, pose.y - 8 - py);
    if (d < bd) {
      bd = d;
      best = { id: n.id, x: pose.x, y: pose.y };
    }
  }
  return best;
}

function nearestAnimal(): string | null {
  const p = S.me;
  const [dx, dy] = dirVec(p.dir);
  const px = p.x + dx * 10;
  const py = p.y - 4 + dy * 10;
  let best: string | null = null;
  let bd = 17;
  for (const a of S.world.animals) {
    const d = Math.hypot(a.x - px, a.y - 4 - py);
    if (d < bd) {
      bd = d;
      best = a.id;
    }
  }
  return best;
}

function interact(): void {
  const p = S.me;
  if (S.mode !== 'play') return;
  if (S.fish) {
    endFishing();
    return;
  }
  const [fx, fy] = facingTile(p);
  if (p.map === 'mine' && S.mine) {
    const m = S.mine;
    const near = (t: [number, number] | null) => !!t && ((t[0] === fx && t[1] === fy) || (Math.floor(p.x / 16) === t[0] && Math.floor((p.y - 4) / 16) === t[1]));
    if (near(m.ladderUp)) {
      if (m.floor <= 1) exitMine();
      else enterMine(m.floor - 1);
      return;
    }
    if (near(m.ladderDown)) {
      enterMine(m.floor + 1);
      return;
    }
    if (near(m.chest) && !m.chestOpen) {
      m.chestOpen = true;
      sfx('catch');
      if ((S.world.stats.treasure ?? 0) < 1) {
        stat('treasure');
        act('earn', { amount: 5000 }, () => {});
        giveItems([{ id: 'ouro', n: 10 }, { id: 'diamante', n: 2 }], p.x, p.y - 10);
        toast('🏆 TESOURO DO VOVÔ! +5000 🍌, ouro e diamantes!', 'banana');
        spawnParticles(p.x, p.y - 10, 40, '#ffd84a', 60, 60, 3);
      } else toast('O baú está vazio... você já levou o tesouro!', 'info');
    }
    return;
  }
  const npc = nearestNpc();
  if (npc) {
    talkTo(npc.id);
    return;
  }
  const an = nearestAnimal();
  if (an) {
    act('animal', { id: an }, (r) => {
      if (r.ok && r.grant) {
        giveItems(r.grant, p.x, p.y - 8);
        sfx('harvest');
        toast(`${r.data?.name} deu ${ITEMS[r.grant[0].id].name}!`, 'banana');
      } else if (r.ok) {
        sfx('heart');
        floatText(p.x, p.y - 30, '❤', '#ff6a8a');
        toast(`${r.data?.name} adorou o carinho!`, 'info');
      }
    });
    return;
  }
  const key = fy * MW + fx;
  const st = S.world.statics.get(key);
  if (st?.kind === 'shipbox') return shipSelected();
  if (st?.kind === 'trough') return feedTrough();
  const d = S.world.getD(key);
  if (d && S.world.isRipe(d)) return harvestAt(key);
  const tx = Math.floor(p.x / 16);
  const ty = Math.floor((p.y - 4) / 16);
  for (const b of BUILDINGS) {
    const [dx, dy] = doorOf(b.id);
    const [ffx, ffy] = frontOf(b.id);
    const hit = (x: number, y: number) => (x === dx && y === dy) || (x === ffx && y === ffy);
    if (hit(fx, fy) || hit(tx, ty)) return enterBuilding(b.id);
  }
}

function shipSelected(): void {
  const p = S.me;
  const st = hotbarItem(p, p.sel).stack;
  if (!st) {
    toast('Segure um item na barra (slots 7 a 12) e aperte E na caixa.', 'info');
    return;
  }
  const d = ITEMS[st.id];
  if (d.cat === 'seed') {
    toast('Sementes não vão na caixa de entrega!', 'info');
    return;
  }
  const value = d.sell * st.n;
  act('ship', { value }, (r) => {
    if (r.ok) {
      stat('shipped', st.n);
      toast(`📦 ${st.n}x ${d.name} na caixa (+${value} 🍌 ao amanhecer)`, 'banana');
      sfx('coin');
      floatText(p.x, p.y - 30, `+${value} 🍌`, '#ffd84a');
      removeItems(p, st.id, st.n);
    }
  });
}

function feedTrough(): void {
  const p = S.me;
  const st = hotbarItem(p, p.sel).stack;
  if (!st || st.id !== 'capim') {
    toast(`Cocho: ${S.world.hay} capim. Segure Capim e aperte E para encher.`, 'info');
    return;
  }
  const n = st.n;
  act('hay', { n }, () => {
    removeItems(p, 'capim', n);
    toast(`🌾 ${n} capim no cocho! Os bichos agradecem.`, 'banana');
    sfx('plant');
  });
}

function enterBuilding(id: string): void {
  const w = S.world;
  const b = BUILDINGS.find((q) => q.id === id)!;
  switch (id) {
    case 'casa':
      ui.dialogue({
        name: 'Casa do Vovô',
        pages: ['Dormir agora? O dia seguinte começa às 06:00. Colheitas regadas crescem durante a noite!'],
        choices: [
          { label: '😴 Dormir', fn: () => startSleep() },
          { label: '💾 Salvar', fn: () => saveGame() },
          { label: 'Agora não', fn: () => {} },
        ],
      });
      break;
    case 'mina': {
      const cp = Math.floor(S.me.mineMax / 5) * 5;
      ui.dialogue({
        name: 'Mina do Vovô',
        pages: ['Uma caverna escura e cheia de pedras... e gosmas. Você entra?'],
        choices: [
          { label: '⛏ Entrar (andar 1)', fn: () => enterMine(1) },
          ...(cp >= 5 ? [{ label: `🛗 Elevador (andar ${cp})`, fn: () => enterMine(cp) }] : []),
          { label: 'Melhor não', fn: () => {} },
        ],
      });
      break;
    }
    case 'celeiro':
      toast('O celeiro está trancado. Os bichos dormem tranquilos lá dentro.', 'info');
      break;
    default: {
      const npc = NPCS.find((n) => n.home === id);
      if (!npc) return;
      if (!npcInside(npc, w.minutes)) {
        toast(`${b.label}: fechado! ${npc.name} saiu... procure por perto.`, 'info');
        sfx('error');
        return;
      }
      if (npc.shop) {
        sfx('open');
        ui.openShop(npc.shop, npc.id);
      } else talkTo(npc.id);
    }
  }
}

function pickLine(id: string): string {
  const n = NPC_BY_ID[id];
  const w = S.world;
  const r = hash2(w.day, id.length, w.season + 3);
  if (w.raining && r < 0.6) return n.rain[Math.floor(hash2(w.day, 7, 1) * n.rain.length)];
  if (w.season === 3 && r < 0.4) return n.winter[Math.floor(hash2(w.day, 9, 2) * n.winter.length)];
  return n.generic[Math.floor(hash2(w.day * 3 + w.season * 17, id.charCodeAt(0), 5) * n.generic.length)];
}

export function talkTo(id: string): void {
  const n = NPC_BY_ID[id];
  act('talk', { npc: id }, (r) => {
    const hearts = (r.data?.hearts as number) ?? 0;
    const ev = (r.data?.ev as number) ?? -1;
    const first = !!r.data?.first;
    let pages: string[];
    if (ev >= 0) {
      pages = [...n.hearts[ev]];
      if (ev === 1) {
        const rw = n.reward5;
        addItem(S.me, rw.id, rw.n);
        toast(`🎁 ${n.name} te deu ${rw.n}x ${ITEMS[rw.id].name}!`, 'banana');
      }
      sfx('heart');
    } else pages = [pickLine(id)];
    if (S.world.isBirthday(id)) pages.unshift('🎂 Hoje é meu aniversário, sabia? Presentes são sempre bem-vindos!');
    if (first) {
      stat('talks');
      floatText(S.me.x, S.me.y - 34, '+20 ❤', '#ff8aa8');
    }
    const choices: { label: string; fn: () => void }[] = [{ label: '🎁 Presentear', fn: () => giftTo(id) }];
    if (n.shop && npcInside(n, S.world.minutes)) choices.push({ label: '🛒 Loja', fn: () => ui.openShop(n.shop!, id) });
    choices.push({ label: 'Tchau!', fn: () => {} });
    ui.dialogue({ name: `${n.name} ${'❤'.repeat(hearts)}`, look: n.look, mood: hearts >= 4 ? 'happy' : 'neutral', pages, choices, pitch: NPCS.indexOf(n) % 4 });
  });
}

function giftTo(id: string): void {
  const n = NPC_BY_ID[id];
  const p = S.me;
  const st = hotbarItem(p, p.sel).stack;
  if (!st) {
    ui.dialogue({ name: n.name, look: n.look, mood: 'neutral', pages: ['Cadê o presente? Segure um item da barra (slots 7-12) e fale comigo de novo!'] });
    return;
  }
  const itemId = st.id;
  act('gift', { npc: id, item: itemId }, (r) => {
    if (!r.ok) {
      ui.dialogue({ name: n.name, look: n.look, mood: 'neutral', pages: [r.msg ?? 'Hoje não dá mais.'] });
      return;
    }
    removeItems(p, itemId, 1);
    const kind = r.data!.kind as 'love' | 'like' | 'neutral' | 'hate';
    const bday = !!r.data!.bday;
    const mood = kind === 'love' || kind === 'like' ? 'happy' : kind === 'hate' ? 'mad' : 'neutral';
    const pages = [bday && (kind === 'love' || kind === 'like') ? n.react.birthday : n.react[kind]];
    const ev = r.data!.ev as number;
    if (ev >= 0) {
      pages.push(...n.hearts[ev]);
      if (ev === 1) {
        addItem(p, n.reward5.id, n.reward5.n);
        toast(`🎁 ${n.name} te deu ${n.reward5.n}x ${ITEMS[n.reward5.id].name}!`, 'banana');
      }
    }
    sfx(kind === 'hate' ? 'error' : 'heart');
    if (kind !== 'hate') {
      for (let i = 0; i < 5; i++) spawnParticles(p.x, p.y - 30, 1, '#ff6a8a', 20, 40, 2);
      floatText(p.x, p.y - 34, `+${r.data!.pts} ❤`, '#ff8aa8');
    }
    ui.dialogue({ name: `${n.name} ${'❤'.repeat((r.data!.hearts as number) ?? 0)}`, look: n.look, mood, pages, pitch: NPCS.indexOf(n) % 4 });
  });
}

// ---------------------------------------------------------------- Handlers da UI

const handlers: ui.Handlers = {
  buy: (id, n, cost, cb) => {
    if (!hasRoom(S.me, id, n)) {
      toast('Mochila cheia! 🎒', 'chaos');
      return cb(false);
    }
    act('buy', { id, n, cost }, (r) => {
      if (r.ok && r.grant) {
        for (const g of r.grant) addItem(S.me, g.id, g.n);
        toast(`Comprou ${n}x ${ITEMS[id].name}`, 'banana');
        cb(true);
      } else {
        toast(r.msg ?? 'Não deu...', 'chaos');
        cb(false);
      }
    });
  },
  sell: (slot, n, mult) => {
    const st = S.me.inv[slot];
    if (!st) return;
    const d = ITEMS[st.id];
    const cnt = Math.min(n, st.n);
    const amount = Math.floor(d.sell * mult) * cnt;
    st.n -= cnt;
    if (st.n <= 0) S.me.inv[slot] = null;
    act('earn', { amount }, () => toast(`Vendeu ${cnt}x ${d.name} por ${amount} 🍌`, 'banana'));
  },
  upgrade: (tool, cb) => {
    const p = S.me;
    const t = p.tiers[tool];
    if (tool === 'rod') {
      if (t >= 2) return cb(false);
      act('spend', { amount: ROD_COST[t] }, (r) => {
        if (r.ok) {
          p.tiers.rod++;
          toast('🎣 A Dolores ficou mais forte! Barra maior na pesca.', 'banana');
          sfx('harvest');
        } else toast(r.msg ?? 'Sem bananas!', 'chaos');
        cb(!!r.ok);
      });
      return;
    }
    const up = UPGRADE_COST[t];
    if (!up) return cb(false);
    if (countItem(p, up.ore) < up.n) {
      toast(`Faltam minérios: ${up.n}x ${ITEMS[up.ore].name}`, 'chaos');
      return cb(false);
    }
    act('spend', { amount: up.gold }, (r) => {
      if (r.ok) {
        removeItems(p, up.ore, up.n);
        p.tiers[tool]++;
        toast(`🔨 ${TOOL_NAMES[tool]} melhorada!`, 'banana');
        sfx('harvest');
        S.shake = 2;
      } else toast(r.msg ?? 'Sem bananas!', 'chaos');
      cb(!!r.ok);
    });
  },
  buyAnimal: (kind, cb) => {
    act('buyAnimal', { kind }, (r) => {
      if (r.ok) toast(`🐾 ${r.data?.name} chegou na fazenda! Não esqueça do capim.`, 'banana');
      else toast(r.msg ?? 'Não deu...', 'chaos');
      cb(!!r.ok);
    });
  },
  talk: (id) => talkTo(id),
  swapInv: (i) => {
    const p = S.me;
    const target = p.sel >= 6 ? p.sel - 6 : 0;
    if (p.sel < 6) p.sel = 6;
    const tmp = p.inv[target];
    p.inv[target] = p.inv[i];
    p.inv[i] = tmp;
  },
  trash: (i) => {
    S.me.inv[i] = null;
  },
  save: () => saveGame(),
  newGame: () => newGameFromPause(),
  toTitle: () => toTitle(),
  toggleMusic: () => {
    S.musicOn = !S.musicOn;
    if (S.musicOn) startMusic();
    else stopMusic();
  },
  startNew: (name, fi, si) => startNew(name, fi, si),
  continueGame: () => continueGame(),
  select: (slot) => {
    if (S.mode !== 'play') return;
    if (S.me.sel === slot) {
      const st = hotbarItem(S.me, slot).stack;
      if (st && ITEMS[st.id]?.energy) eatSelected();
    }
    S.me.sel = slot;
    sfx('ui');
  },
  cycle: (d) => {
    S.me.sel = (S.me.sel + d + HOTBAR) % HOTBAR;
    sfx('ui');
  },
};

// ---------------------------------------------------------------- Quests e clima

function checkQuest(): void {
  const w = S.world;
  while (w.quest < QUESTS.length) {
    const q = QUESTS[w.quest];
    const cur = q.stat === 'earned' ? w.totalEarned : w.stats[q.stat] ?? 0;
    if (cur < q.goal) break;
    w.quest++;
    sfx('catch');
    if (w.quest >= QUESTS.length) {
      toast('🏆 META CUMPRIDA! Você é uma lenda do Bananal!', 'banana');
      spawnParticles(S.me.x, S.me.y - 20, 50, '#ffd84a', 70, 70, 3);
      reportScore();
    } else toast('🎯 Objetivo cumprido! Próximo na tela.', 'banana');
  }
}

// ---------------------------------------------------------------- Atualização

export function update(dt: number): void {
  S.time += dt;
  S.shake = Math.max(0, S.shake - dt * 18);
  S.flash = Math.max(0, S.flash - dt * 2.5);
  for (const p of S.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
  }
  S.particles = S.particles.filter((p) => p.life > 0);
  for (const f of S.floaters) {
    f.life -= dt;
    f.y -= 12 * dt;
  }
  S.floaters = S.floaters.filter((f) => f.life > 0);

  const w = S.world;
  if (S.mode === 'title') {
    S.cam.x = 22 * 16 + Math.sin(S.time * 0.07) * 190 + 100;
    S.cam.y = 22 * 16 + Math.cos(S.time * 0.05) * 60;
    w.minutes = 600 + (S.time * 2) % 400;
    net.tick(dt);
    return;
  }
  if (!S.started) return;
  const p = S.me;
  p.swing = Math.max(0, p.swing - dt);
  for (const r of S.remotes.values()) {
    r.swing = Math.max(0, r.swing - dt);
    const dx = r.info.x - r.x;
    const dy = r.info.y - r.y;
    if (Math.hypot(dx, dy) > 80) {
      r.x = r.info.x;
      r.y = r.info.y;
    } else {
      r.x += dx * Math.min(1, dt * 12);
      r.y += dy * Math.min(1, dt * 12);
    }
    if (r.info.mv) r.anim += dt;
  }

  const paused = !S.online && S.mode === 'modal';
  if (S.mode === 'play' || S.mode === 'fish') {
    movePlayer(dt);
    if (actHeld || mouseHeld || ui.touch.act) {
      if (!S.fish) useAction();
    }
    if (ui.touch.interact) {
      ui.touch.interact = false;
      interact();
    }
    updateFishing(dt);
  }
  updateMine(dt);

  if (!paused) {
    if (S.auth) {
      const end = w.tick(dt);
      w.updateAnimals(dt);
      if (end) doNewDay(!p.sleeping);
      else if (S.mode === 'sleep' && p.sleeping) {
        sleepT += dt;
        if (sleepT > 1.4 && allSleeping()) doNewDay(false);
        const sub = document.getElementById('vl-sleep-sub');
        if (sub && S.online) sub.textContent = 'Esperando os outros fazendeiros dormirem...';
      }
    } else {
      w.minutes += dt / 0.5;
      if (w.minutes > DAY_END) w.minutes = DAY_END;
    }
  }

  net.tick(dt);
  clockT += dt;
  if (clockT > 1) {
    clockT = 0;
    const amb = ambient(w.minutes);
    setMusicMood(w.season, amb.a > 0.3, w.raining);
    if (w.season !== lastSeason) lastSeason = w.season;
  }
  questT += dt;
  if (questT > 0.7) {
    questT = 0;
    checkQuest();
  }
  saveT += dt;
  if (saveT > 90 && S.mode === 'play') {
    saveT = 0;
    saveGame(true);
  }

  if (w.weather === 'tempestade' && p.map === 'world') {
    thunderT -= dt;
    if (thunderT <= 0) {
      thunderT = 8 + Math.random() * 14;
      S.flash = 1;
      setTimeout(() => sfx('thunder'), 350);
    }
  }

  // câmera
  const tx = p.x;
  const ty = p.y - 8;
  S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 8);
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 8);
  ui.updateHUD(dt);
}

// ---------------------------------------------------------------- Entrada

function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}

export function initGame(canvas: HTMLCanvasElement, root: HTMLElement): void {
  canvasEl = canvas;
  uiRoot = root;
  initNpcPaths(S.world);
  net = new ValleyNet({
    handleReq: (op, a) => S.world.apply(op, a),
    onSnapshot,
    onNewDay: (earned, dead, season, passed) => afterNewDay(earned, dead, season, passed),
    onPlayers: (players) => hud?.setPlayers(players),
    onFx: () => {},
  });
  hud = mountMonkeyHud({ slug: SLUG, title: 'Bananal Valley: A Roça do Macaco', room: net.room });
  S.toast = (t, tone) => hud?.toast(t, tone);
  ui.initUI(root, handlers);
  S.world.minutes = 600;
  ui.showTitle(!!loadSave());

  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
    if (e.repeat && (k === 'e' || k === ' ' || k === 'f')) return;
    keys.add(k);
    if (S.mode === 'title') return;
    if (k === 'escape') {
      if (ui.dialogueActive()) ui.closeDialogue(true);
      else if (S.mode === 'modal') ui.closeModal();
      else if (S.mode === 'sleep') cancelSleep();
      else if (S.fish) endFishing();
      else if (S.mode === 'play') ui.openPause();
      return;
    }
    if (S.mode === 'modal') {
      if (ui.dialogueActive() && (k === ' ' || k === 'e' || k === 'enter')) ui.dialogueAdvance();
      else if ((k === 'tab' || k === 'i') && !ui.dialogueActive()) ui.closeModal();
      return;
    }
    if (S.mode !== 'play') return;
    if (k === ' ' || k === 'j') {
      if (S.fish) fishPress();
      else actHeld = true;
      if (S.fish) actHeld = true;
    } else if (k === 'e') interact();
    else if (k === 'f') {
      const npc = nearestNpc();
      if (npc && hotbarItem(S.me, S.me.sel).stack) giftTo(npc.id);
      else eatSelected();
    } else if (k === 'tab' || k === 'i') ui.openBackpack('mochila');
    else if (k === 'q') handlers.cycle(-1);
    else if (k === 'r') handlers.cycle(1);
    else if (/^[0-9]$/.test(k)) S.me.sel = k === '0' ? 9 : Number(k) - 1;
    else if (k === '-') S.me.sel = 10;
    else if (k === '=') S.me.sel = 11;
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    if (k === ' ' || k === 'j') actHeld = false;
  });
  window.addEventListener('blur', () => {
    keys.clear();
    actHeld = false;
    mouseHeld = false;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'play' || e.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2 + 8);
    S.me.dir = (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0) as Dir;
    unlockAudio();
    if (S.fish) fishPress();
    else mouseHeld = true;
  });
  window.addEventListener('pointerup', () => (mouseHeld = false));
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (S.mode !== 'play') return;
      e.preventDefault();
      handlers.cycle(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  void canvasEl;
  void FARM;
}
