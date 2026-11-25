import { mountMonkeyHud, type PlayerProfile } from '@monkey-slop/sdk';
import { clickerAudio } from './audio';
import { createControlsConfig } from './controls';
import {
  ACHIEVEMENTS,
  BUILDINGS,
  calcPrestigePreview,
  computeMetrics,
  EVOLUTION_TIERS,
  formatBananas,
  formatBps,
  FUNNY_CLICK_WORDS,
  getBuildingCost,
  getEvolutionTier,
  UPGRADES,
} from './data';
import { ClickerNet } from './net';
import { ClickerRenderer } from './renderer';
import {
  clearSavedEmpire,
  getBestBananaScore,
  loadSavedEmpire,
  reportEmpireScore,
  saveEmpire,
} from './save';
import type {
  ChaosEventKind,
  GameMode,
  GameState,
  RaceEntry,
  ShopTab,
} from './types';

function createEmptyState(mode: GameMode = 'solo', raceGoal = 25000): GameState {
  return {
    mode,
    bananas: 0,
    runBananas: 0,
    lifetimeBananas: 0,
    totalClicks: 0,
    goldenClicked: 0,
    chaosDefeated: 0,
    prestigeChips: 0,
    reincarnations: 0,
    buildings: {},
    upgrades: [],
    achievements: [],
    comboCount: 0,
    comboTimer: 0,
    activeEvent: null,
    goldenBanana: null,
    rainBananas: [],
    nextGoldenIn: 18 + Math.random() * 14,
    nextChaosIn: 28 + Math.random() * 18,
    raceGoal,
    raceWinnerId: null,
    raceStartedAt: performance.now(),
  };
}

// DOM Elements
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiBananas = document.getElementById('ui-bananas')!;
const uiBps = document.getElementById('ui-bps')!;
const uiBpc = document.getElementById('ui-bpc')!;
const uiCombo = document.getElementById('ui-combo')!;
const uiEventPill = document.getElementById('ui-event-pill')!;
const uiMpBar = document.getElementById('ui-mp-bar')!;
const uiMpCard = document.getElementById('ui-mp-card')!;
const uiShopTitle = document.getElementById('ui-shop-title')!;
const uiBulkGroup = document.getElementById('ui-bulk-group')!;
const uiShopList = document.getElementById('ui-shop-list')!;

const menuOverlay = document.getElementById('menu-overlay')!;
const menuModes = document.getElementById('menu-modes')!;
const menuRaceBox = document.getElementById('menu-race-box')!;
const menuRaceTargets = document.getElementById('menu-race-targets')!;
const menuStatus = document.getElementById('menu-status')!;
const menuBestBadge = document.getElementById('menu-best-badge')!;
const menuPlayBtn = document.getElementById('menu-play-btn') as HTMLButtonElement;

const resultsOverlay = document.getElementById('results-overlay')!;
const resTitle = document.getElementById('res-title')!;
const resSubtitle = document.getElementById('res-subtitle')!;
const resStats = document.getElementById('res-stats')!;
const resReplayBtn = document.getElementById('res-replay-btn')!;
const resMenuBtn = document.getElementById('res-menu-btn')!;

const btnMenu = document.getElementById('btn-menu')!;
const btnReset = document.getElementById('btn-reset')!;

let state: GameState = createEmptyState('solo');
let selectedMenuMode: GameMode = 'solo';
let selectedRaceGoal = 25000;
let activeTab: ShopTab = 'buildings';
let bulkAmount = 1;
let isPlaying = false;
let isControlsOpen = false;
let shopNeedsRebuild = true;
let lastScoreReported = 0;

const renderer = new ClickerRenderer(canvas);

// Multiplayer Network
const net = new ClickerNet({
  onPlayersChange: (players: PlayerProfile[]) => {
    hud.setPlayers(players);
    updateMenuStatus();
    if (isPlaying && state.mode === 'coop' && net.isHost()) {
      broadcastCoopState(true);
    }
  },
  onStatusChange: () => {
    updateMenuStatus();
  },
  onRemoteCursor: () => {
    // Visualized in render loop
  },
  onRemoteCoopClick: (_id, senderName, color, msg) => {
    const g = renderer.getGeometry();
    const x = msg.nx * g.w;
    const y = msg.ny * g.h;
    renderer.triggerClickFeedback(
      x,
      y,
      `+${formatBananas(msg.power)} (${senderName.split(' ')[0]})`,
      color,
      msg.isCrit,
      1.5,
    );
    if (state.mode === 'coop' && net.isHost()) {
      addBananas(msg.power);
      state.totalClicks++;
      checkAchievements();
      broadcastCoopState(false);
    }
  },
  onCoopBuyBuilding: (buildingId, amount) => {
    if (state.mode === 'coop' && net.isHost()) {
      tryBuyBuilding(buildingId, amount, true);
    }
  },
  onCoopBuyUpgrade: (upgradeId) => {
    if (state.mode === 'coop' && net.isHost()) {
      tryBuyUpgrade(upgradeId, true);
    }
  },
  onCoopHitGolden: (goldenId) => {
    if (state.mode === 'coop' && net.isHost()) {
      collectGoldenBanana(goldenId, true);
    }
  },
  onCoopHitChaos: () => {
    if (state.mode === 'coop' && net.isHost()) {
      hitChaosBoss(true);
    }
  },
  onCoopHitRain: (rainId) => {
    if (state.mode === 'coop' && net.isHost()) {
      collectRainBanana(rainId, true);
    }
  },
  onCoopSnapshot: (snap) => {
    if (state.mode !== 'coop' || net.isHost()) return;
    const prevUpgLen = state.upgrades.length;
    const prevAchLen = state.achievements.length;
    const prevBuildingsHash = JSON.stringify(state.buildings);
    state.bananas = snap.bananas;
    state.runBananas = snap.runBananas;
    state.lifetimeBananas = snap.lifetimeBananas;
    state.totalClicks = snap.totalClicks;
    state.goldenClicked = snap.goldenClicked;
    state.chaosDefeated = snap.chaosDefeated;
    state.prestigeChips = snap.prestigeChips;
    state.reincarnations = snap.reincarnations;
    state.buildings = snap.buildings;
    state.upgrades = snap.upgrades;
    state.achievements = snap.achievements;
    state.activeEvent = snap.activeEvent;
    state.goldenBanana = snap.goldenBanana;
    if (
      prevUpgLen !== state.upgrades.length ||
      prevAchLen !== state.achievements.length ||
      prevBuildingsHash !== JSON.stringify(state.buildings)
    ) {
      shopNeedsRebuild = true;
    }
  },
  onStartMatch: (mode, raceGoal) => {
    selectedMenuMode = mode;
    selectedRaceGoal = raceGoal;
    startGame(mode, raceGoal, false);
  },
  onVersusProgress: () => {
    // Rendered in MP bar
  },
  onVersusWin: (msg) => {
    if (state.mode !== 'versus' || state.raceWinnerId) return;
    state.raceWinnerId = msg.winnerId;
    showVersusResults(msg.winnerName, msg.elapsedSec, msg.winnerId === net.room.localPlayer.id);
  },
});

const hud = mountMonkeyHud({
  slug: 'monkey-clicker',
  title: 'Banana Clicker: Império do Macaco',
  room: net.room,
  controls: createControlsConfig((open) => {
    isControlsOpen = open;
  }),
});

function updateMenuStatus(): void {
  const players = net.room.getPlayers();
  if (selectedMenuMode === 'solo') {
    const saved = loadSavedEmpire();
    menuStatus.textContent = saved
      ? `Save encontrado: ${formatBananas(saved.bananas)} 🍌 (${saved.prestigeChips} Q.I. Primata)`
      : 'Pronto para começar um império novo no modo Solo!';
    menuPlayBtn.disabled = false;
    return;
  }

  if (!net.isInRoom()) {
    menuStatus.textContent =
      'Abra ou entre em uma sala no botão verde "Co-op Online" lá no topo esquerdo (ou jogue já!).';
    menuPlayBtn.disabled = false;
    return;
  }

  if (net.isHost()) {
    menuStatus.textContent = `Sala ${net.room.roomCode} (${players.length} macaco(s)) — Você é o Host! Clique para iniciar.`;
    menuPlayBtn.disabled = false;
  } else {
    menuStatus.textContent = `Conectado na sala ${net.room.roomCode} (${players.length} macaco(s)). Aguarde o Host ou jogue!`;
    menuPlayBtn.disabled = false;
  }
}

function addBananas(amount: number): void {
  if (amount <= 0) return;
  state.bananas += amount;
  state.runBananas += amount;
  state.lifetimeBananas += amount;
}

function checkAchievements(): void {
  let unlockedAny = false;
  for (const ach of ACHIEVEMENTS) {
    if (!state.achievements.includes(ach.id) && ach.check(state)) {
      state.achievements.push(ach.id);
      unlockedAny = true;
      clickerAudio.playAchievement();
      hud.toast(`🏆 Conquista: ${ach.emoji} ${ach.name}! (+2% BPS)`, 'banana');
      const g = renderer.getGeometry();
      renderer.spawnBurst(g.bananaX, g.bananaY, '#facc15', 22, true);
    }
  }
  if (unlockedAny) {
    shopNeedsRebuild = true;
    if (state.mode === 'solo') saveEmpire(state);
  }
}

function broadcastCoopState(force: boolean): void {
  if (state.mode !== 'coop' || !net.isHost()) return;
  net.broadcastCoopSnapshot(
    {
      bananas: state.bananas,
      runBananas: state.runBananas,
      lifetimeBananas: state.lifetimeBananas,
      totalClicks: state.totalClicks,
      goldenClicked: state.goldenClicked,
      chaosDefeated: state.chaosDefeated,
      prestigeChips: state.prestigeChips,
      reincarnations: state.reincarnations,
      buildings: state.buildings,
      upgrades: state.upgrades,
      achievements: state.achievements,
      activeEvent: state.activeEvent,
      goldenBanana: state.goldenBanana,
    },
    force,
  );
}

function tryBuyBuilding(buildingId: string, amount: number, fromRemote = false): void {
  if (state.mode === 'coop' && !net.isHost() && !fromRemote) {
    net.sendCoopBuyBuilding(buildingId, amount);
    clickerAudio.playUiClick();
    return;
  }
  const def = BUILDINGS.find((b) => b.id === buildingId);
  if (!def) return;
  const owned = state.buildings[buildingId] || 0;
  const cost = getBuildingCost(def, owned, amount);
  if (state.bananas < cost) return;

  state.bananas -= cost;
  state.buildings[buildingId] = owned + amount;
  clickerAudio.playBuy();
  shopNeedsRebuild = true;

  const g = renderer.getGeometry();
  renderer.addBannerText(`${def.emoji} +${amount} ${def.name}!`, '#4ade80');
  renderer.spawnBurst(g.bananaX, g.bananaY, '#4ade80', 10);

  checkAchievements();
  if (state.mode === 'solo') saveEmpire(state);
  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function tryBuyUpgrade(upgradeId: string, fromRemote = false): void {
  if (state.mode === 'coop' && !net.isHost() && !fromRemote) {
    net.sendCoopBuyUpgrade(upgradeId);
    clickerAudio.playUiClick();
    return;
  }
  if (state.upgrades.includes(upgradeId)) return;
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def || state.bananas < def.cost) return;

  state.bananas -= def.cost;
  state.upgrades.push(upgradeId);
  clickerAudio.playGolden();
  shopNeedsRebuild = true;
  hud.toast(`⚡ Upgrade: ${def.emoji} ${def.name}!`, 'info');
  renderer.addBannerText(`⚡ ${def.name}!`, '#38bdf8');

  if (state.mode === 'solo') saveEmpire(state);
  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function triggerPrestige(): void {
  if (state.mode === 'versus') return;
  if (state.mode === 'coop' && !net.isHost()) {
    hud.toast('Só o Host pode reencarnar a Cooperativa!', 'info');
    return;
  }
  const gain = calcPrestigePreview(state.lifetimeBananas, state.prestigeChips);
  if (gain <= 0) return;

  state.prestigeChips += gain;
  state.reincarnations += 1;
  state.bananas = 0;
  state.runBananas = 0;
  state.buildings = {};
  state.upgrades = [];
  state.activeEvent = null;
  state.goldenBanana = null;
  state.rainBananas = [];
  state.comboCount = 0;

  clickerAudio.playPrestige();
  const tier = getEvolutionTier(state.prestigeChips);
  const g = renderer.getGeometry();
  renderer.spawnBurst(g.monkeyX, g.monkeyY, '#c084fc', 40, true);
  renderer.addBannerText(`🧬 EVOLUIU: ${tier.title}!`, '#c084fc');
  hud.toast(`🧬 Reencarnou! +${gain} Q.I. Primata (${tier.title})`, 'banana');

  checkAchievements();
  reportEmpireScore(state.lifetimeBananas, {
    prestigeChips: state.prestigeChips,
    reincarnations: state.reincarnations,
  });
  shopNeedsRebuild = true;
  if (state.mode === 'solo') saveEmpire(state);
  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function spawnGoldenBanana(): void {
  if (state.mode === 'coop' && !net.isHost()) return;
  if (state.goldenBanana) return;
  const isRainbow = Math.random() < 0.25;
  state.goldenBanana = {
    id: Math.random().toString(36).slice(2, 8),
    nx: 0.18 + Math.random() * 0.64,
    ny: 0.24 + Math.random() * 0.56,
    vx: (Math.random() - 0.5) * 0.14,
    vy: (Math.random() - 0.5) * 0.14,
    life: isRainbow ? 9 : 11,
    maxLife: isRainbow ? 9 : 11,
    isRainbow,
  };
  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function collectGoldenBanana(goldenId: string, fromRemote = false): void {
  if (state.mode === 'coop' && !net.isHost() && !fromRemote) {
    net.sendCoopHitGolden(goldenId);
    return;
  }
  const gb = state.goldenBanana;
  if (!gb || gb.id !== goldenId) return;

  const g = renderer.getGeometry();
  const gx = gb.nx * g.w;
  const gy = gb.ny * g.h;
  state.goldenBanana = null;
  state.goldenClicked += 1;
  clickerAudio.playGolden();
  renderer.spawnBurst(gx, gy, '#fef08a', 26, gb.isRainbow);

  const metrics = computeMetrics(state);
  const roll = Math.random();
  if (gb.isRainbow || roll < 0.35) {
    const duration = 12;
    state.activeEvent = {
      kind: 'click_777x',
      label: '⚡ CLIQUE MONSTRO 77x!',
      remaining: duration,
      duration,
      hp: 0,
      maxHp: 0,
      x: 0.5,
      y: 0.5,
    };
    renderer.addBannerText('⚡ CLIQUE 77x POR 12s!', '#f472b6');
    hud.toast('✨ Banana Arco-Íris! Cliques valem 77x!', 'banana');
  } else if (roll < 0.7) {
    const duration = 16;
    state.activeEvent = {
      kind: 'fever_7x',
      label: '🔥 FEBRE DA BANANA 7x!',
      remaining: duration,
      duration,
      hp: 0,
      maxHp: 0,
      x: 0.5,
      y: 0.5,
    };
    renderer.addBannerText('🔥 PRODUÇÃO 7x!', '#fde047');
    hud.toast('🔥 Febre da Banana! Toda produção 7x por 16s!', 'banana');
  } else {
    const bonus = Math.max(75 * metrics.goldenMult, (state.bananas * 0.18 + metrics.bps * 45) * metrics.goldenMult);
    addBananas(bonus);
    renderer.triggerClickFeedback(gx, gy, `+${formatBananas(bonus)} 🍌 OURO!`, '#fef08a', true, 8);
    hud.toast(`🌟 Jackpot Dourado: +${formatBananas(bonus)} bananas!`, 'banana');
  }

  checkAchievements();
  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function triggerChaosEvent(): void {
  if (state.mode === 'coop' && !net.isHost()) return;
  if (state.activeEvent) return;

  const kinds: ChaosEventKind[] = [
    'banana_rain',
    'intern_strike',
    'tax_gorilla',
    'googly_surge',
  ];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];

  if (kind === 'banana_rain') {
    state.activeEvent = {
      kind,
      label: '🌧️ CHUVA DE BANANAS!',
      remaining: 11,
      duration: 11,
      hp: 0,
      maxHp: 0,
      x: 0.5,
      y: 0.5,
    };
    clickerAudio.playChaosStart(true);
    hud.toast('🌧️ Chuva de Bananas! Pegue as bananas caindo!', 'banana');
  } else if (kind === 'googly_surge') {
    state.activeEvent = {
      kind,
      label: '🤪 SURTO DO MACACO VESGO (2x)!',
      remaining: 14,
      duration: 14,
      hp: 0,
      maxHp: 0,
      x: 0.5,
      y: 0.5,
    };
    clickerAudio.playChaosStart(true);
    hud.toast('🤪 Surto Vesgo! Tudo vale 2x por 14s!', 'info');
  } else if (kind === 'intern_strike') {
    state.activeEvent = {
      kind,
      label: '🪧 GREVE! CLIQUE NO SINDICALISTA!',
      remaining: 15,
      duration: 15,
      hp: 8,
      maxHp: 8,
      x: 0.25 + Math.random() * 0.5,
      y: 0.28 + Math.random() * 0.35,
    };
    clickerAudio.playChaosStart(false);
    hud.toast('🪧 Greve dos Estagiários (-50% BPS)! Clique no protesto!', 'chaos');
  } else {
    state.activeEvent = {
      kind: 'tax_gorilla',
      label: '🦍 LEÃO DA SELVA! ESPANTE ELE!',
      remaining: 12,
      duration: 12,
      hp: 7,
      maxHp: 7,
      x: 0.25 + Math.random() * 0.5,
      y: 0.28 + Math.random() * 0.35,
    };
    clickerAudio.playChaosStart(false);
    hud.toast('🦍 Gorila Cobrador apareceu! Clique nele 7x para roubar o cofre dele!', 'chaos');
  }

  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function hitChaosBoss(fromRemote = false): void {
  if (state.mode === 'coop' && !net.isHost() && !fromRemote) {
    net.sendCoopHitChaos();
    clickerAudio.playSlap();
    return;
  }
  const ev = state.activeEvent;
  if (!ev || (ev.kind !== 'tax_gorilla' && ev.kind !== 'intern_strike')) return;

  ev.hp -= 1;
  clickerAudio.playSlap();
  const g = renderer.getGeometry();
  const bx = ev.x * g.w;
  const by = ev.y * g.h;
  renderer.triggerClickFeedback(bx, by, 'TAP!', '#fb7185', false, 6);

  // Move slightly on hit
  ev.x = Math.max(0.18, Math.min(0.82, ev.x + (Math.random() - 0.5) * 0.14));
  ev.y = Math.max(0.24, Math.min(0.76, ev.y + (Math.random() - 0.5) * 0.14));

  if (ev.hp <= 0) {
    const metrics = computeMetrics(state);
    const reward = Math.max(120, metrics.bps * 35 + metrics.bpc * 18);
    addBananas(reward);
    state.chaosDefeated += 1;
    state.activeEvent = null;
    clickerAudio.playChaosDefeat();
    renderer.spawnBurst(bx, by, '#4ade80', 26, true);
    renderer.addBannerText(`💥 ESPANTADO! +${formatBananas(reward)} 🍌`, '#4ade80');
    hud.toast(`🦍 Caos derrotado! Você lucrou +${formatBananas(reward)} 🍌!`, 'banana');
    checkAchievements();
  }

  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
}

function collectRainBanana(rainId: string, fromRemote = false): void {
  if (state.mode === 'coop' && !net.isHost() && !fromRemote) {
    net.sendCoopHitRain(rainId);
    return;
  }
  const idx = state.rainBananas.findIndex((r) => r.id === rainId);
  if (idx === -1) return;
  const rb = state.rainBananas[idx];
  state.rainBananas.splice(idx, 1);

  addBananas(rb.value);
  clickerAudio.playBananaClick(state.comboCount, true);
  const g = renderer.getGeometry();
  renderer.triggerClickFeedback(
    rb.nx * g.w,
    rb.ny * g.h,
    `+${formatBananas(rb.value)} 🍌`,
    '#fde047',
    true,
    3,
  );
  if (state.mode === 'coop' && net.isHost()) broadcastCoopState(false);
}

function performBananaClick(localX: number, localY: number): void {
  const metrics = computeMetrics(state);
  state.comboCount = Math.min(100, state.comboCount + 1);
  state.comboTimer = 1.65;
  const isCrit = Math.random() < 0.12 || state.activeEvent?.kind === 'click_777x';
  const gain = metrics.bpc * (isCrit ? 2.5 : 1);

  clickerAudio.playBananaClick(state.comboCount, isCrit);

  const g = renderer.getGeometry();
  const nx = Math.max(0, Math.min(1, localX / g.w));
  const ny = Math.max(0, Math.min(1, localY / g.h));

  const funny =
    isCrit && Math.random() < 0.65
      ? FUNNY_CLICK_WORDS[Math.floor(Math.random() * FUNNY_CLICK_WORDS.length)]
      : `+${formatBananas(gain)} 🍌`;

  renderer.triggerClickFeedback(
    localX,
    localY,
    isCrit ? `💥 ${funny}` : funny,
    isCrit ? '#f472b6' : '#fef08a',
    isCrit,
    isCrit ? 7 : 3,
  );

  if (state.mode === 'coop' && !net.isHost()) {
    net.sendCoopClick(nx, ny, gain, isCrit);
    return;
  }

  addBananas(gain);
  state.totalClicks += 1;
  checkAchievements();

  if (state.mode === 'coop' && net.isHost()) {
    net.sendCoopClick(nx, ny, gain, isCrit);
    broadcastCoopState(false);
  }
}

function startGame(mode: GameMode, raceGoal: number, broadcastHost = true): void {
  selectedMenuMode = mode;
  selectedRaceGoal = raceGoal;

  if (mode === 'solo') {
    const saved = loadSavedEmpire();
    state = createEmptyState('solo', raceGoal);
    if (saved) {
      state.bananas = saved.bananas;
      state.runBananas = saved.runBananas;
      state.lifetimeBananas = saved.lifetimeBananas;
      state.totalClicks = saved.totalClicks;
      state.goldenClicked = saved.goldenClicked;
      state.chaosDefeated = saved.chaosDefeated;
      state.prestigeChips = saved.prestigeChips;
      state.reincarnations = saved.reincarnations;
      state.buildings = saved.buildings;
      state.upgrades = saved.upgrades;
      state.achievements = saved.achievements;
    }
  } else if (mode === 'coop') {
    state = createEmptyState('coop', raceGoal);
    if (net.isHost() && broadcastHost) {
      net.broadcastStartMatch('coop', raceGoal);
      broadcastCoopState(true);
    }
  } else {
    state = createEmptyState('versus', raceGoal);
    net.raceEntries.clear();
    if (net.isHost() && broadcastHost) {
      net.broadcastStartMatch('versus', raceGoal);
    }
  }

  isPlaying = true;
  shopNeedsRebuild = true;
  menuOverlay.classList.add('hidden');
  resultsOverlay.classList.add('hidden');
  renderer.resize();
  clickerAudio.playUiClick();

  if (mode === 'coop') {
    hud.toast('🤝 Cooperativa Bananeira aberta! Clica junto!', 'banana');
  } else if (mode === 'versus') {
    hud.toast(`🏁 Corrida até ${formatBananas(raceGoal)} bananas! VALENDO!`, 'info');
  }
}

function resetCurrentRun(): void {
  if (state.mode === 'solo') {
    clearSavedEmpire();
    state = createEmptyState('solo');
    shopNeedsRebuild = true;
    hud.toast('🔄 Império Solo zerado! Bora clicar de novo!', 'info');
  } else if (state.mode === 'versus') {
    if (net.isHost()) {
      startGame('versus', selectedRaceGoal, true);
    } else {
      startGame('versus', selectedRaceGoal, false);
    }
  } else if (state.mode === 'coop') {
    if (net.isHost()) {
      startGame('coop', selectedRaceGoal, true);
    } else {
      hud.toast('Só o Host pode reiniciar a Cooperativa!', 'info');
    }
  }
}

function showVersusResults(winnerName: string, elapsedSec: number, isMe: boolean): void {
  clickerAudio.playPrestige();
  const g = renderer.getGeometry();
  renderer.spawnBurst(g.bananaX, g.bananaY, '#facc15', 45, true);

  resTitle.textContent = isMe ? '👑 VOCÊ VENCEU A CORRIDA!' : `🏆 ${winnerName} VENCEU!`;
  resSubtitle.textContent = `Meta de ${formatBananas(state.raceGoal)} 🍌 batida em ${elapsedSec.toFixed(1)}s!`;

  const entries = getSortedRaceEntries();
  resStats.innerHTML = entries
    .map(
      (e, idx) =>
        `<div><strong>#${idx + 1} ${e.name}</strong> — ${formatBananas(e.bananas)} 🍌 (${formatBps(e.bps)}/s)</div>`,
    )
    .join('');

  reportEmpireScore(state.bananas, { mode: 'versus', won: isMe ? 1 : 0 });
  resultsOverlay.classList.remove('hidden');
}

function getSortedRaceEntries(): RaceEntry[] {
  const metrics = computeMetrics(state);
  const localEntry: RaceEntry = {
    id: net.room.localPlayer.id,
    name: net.room.localPlayer.name,
    color: net.room.localPlayer.color,
    bananas: state.bananas,
    bps: metrics.bps,
    evolutionLevel: state.prestigeChips,
  };
  const all = new Map<string, RaceEntry>(net.raceEntries);
  all.set(localEntry.id, localEntry);
  return Array.from(all.values()).sort((a, b) => b.bananas - a.bananas);
}

// Shop Rendering (Rebuilt cleanly only when needed + dynamic button state sync)
function rebuildShop(): void {
  shopNeedsRebuild = false;
  uiShopList.innerHTML = '';

  if (activeTab === 'buildings') {
    uiShopTitle.textContent = 'Construções Primatas';
    uiBulkGroup.style.display = 'flex';

    for (const b of BUILDINGS) {
      const owned = state.buildings[b.id] || 0;
      const cost = getBuildingCost(b, owned, bulkAmount);
      const canBuy = state.bananas >= cost;
      const metrics = computeMetrics(state);
      const totalBps = metrics.buildingBps[b.id] || 0;

      const btn = document.createElement('button');
      btn.className = 'mc-item-card';
      btn.dataset.buildingId = b.id;
      btn.disabled = !canBuy;
      btn.innerHTML = `
        <div class="mc-item-icon">${b.emoji}</div>
        <div>
          <div class="mc-item-name">${b.name}</div>
          <div class="mc-item-desc">${b.desc}</div>
          <div class="mc-item-meta">+${formatBps(b.baseBps)}/s base${owned > 0 ? ` • Total: ${formatBps(totalBps)}/s` : ''}</div>
        </div>
        <div class="mc-item-right">
          <div class="mc-item-count">${owned}</div>
          <div class="mc-item-cost">🍌 ${formatBananas(cost)}</div>
        </div>
      `;
      btn.onclick = () => tryBuyBuilding(b.id, bulkAmount);
      uiShopList.appendChild(btn);
    }
  } else if (activeTab === 'upgrades') {
    uiShopTitle.textContent = 'Upgrades Zoeiros';
    uiBulkGroup.style.display = 'none';

    const available = UPGRADES.filter((u) => {
      if (state.upgrades.includes(u.id)) return false;
      const req = u.unlockRequirement;
      if (!req) return true;
      if (req.buildingId && (state.buildings[req.buildingId] || 0) < (req.minCount || 1)) {
        return false;
      }
      if (req.minClicks && state.totalClicks < req.minClicks) return false;
      if (req.minLifetime && state.lifetimeBananas < req.minLifetime) return false;
      return true;
    });

    if (available.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:18px;text-align:center;color:#bbf7d0;font-size:13px;';
      empty.textContent = 'Clique mais e compre construções para desbloquear novos upgrades zoeiros!';
      uiShopList.appendChild(empty);
    }

    for (const u of available) {
      const canBuy = state.bananas >= u.cost;
      const btn = document.createElement('button');
      btn.className = 'mc-item-card';
      btn.dataset.upgradeId = u.id;
      btn.disabled = !canBuy;
      btn.innerHTML = `
        <div class="mc-item-icon">${u.emoji}</div>
        <div>
          <div class="mc-item-name">${u.name}</div>
          <div class="mc-item-desc">${u.desc}</div>
        </div>
        <div class="mc-item-right">
          <div class="mc-item-cost">🍌 ${formatBananas(u.cost)}</div>
        </div>
      `;
      btn.onclick = () => tryBuyUpgrade(u.id);
      uiShopList.appendChild(btn);
    }

    // Also show already bought upgrades count
    if (state.upgrades.length > 0) {
      const boughtHeader = document.createElement('div');
      boughtHeader.style.cssText =
        'margin-top:8px;font-size:11px;font-weight:800;color:#86efac;text-transform:uppercase;';
      boughtHeader.textContent = `Já comprados (${state.upgrades.length}/${UPGRADES.length})`;
      uiShopList.appendChild(boughtHeader);

      for (const id of state.upgrades) {
        const u = UPGRADES.find((x) => x.id === id);
        if (!u) continue;
        const card = document.createElement('div');
        card.className = 'mc-item-card owned';
        card.innerHTML = `
          <div class="mc-item-icon">${u.emoji}</div>
          <div>
            <div class="mc-item-name">${u.name}</div>
            <div class="mc-item-desc">${u.desc}</div>
          </div>
          <div class="mc-item-right"><span style="color:#4ade80;font-weight:900;font-size:12px;">ATIVO</span></div>
        `;
        uiShopList.appendChild(card);
      }
    }
  } else if (activeTab === 'achievements') {
    uiShopTitle.textContent = `Medalhas (${state.achievements.length}/${ACHIEVEMENTS.length})`;
    uiBulkGroup.style.display = 'none';

    for (const ach of ACHIEVEMENTS) {
      const unlocked = state.achievements.includes(ach.id);
      const card = document.createElement('div');
      card.className = `mc-item-card ${unlocked ? 'owned' : ''}`;
      card.style.opacity = unlocked ? '1' : '0.52';
      card.innerHTML = `
        <div class="mc-item-icon">${unlocked ? ach.emoji : '🔒'}</div>
        <div>
          <div class="mc-item-name">${unlocked ? ach.name : 'Medalha Secreta'}</div>
          <div class="mc-item-desc">${ach.desc}</div>
        </div>
        <div class="mc-item-right">
          <span style="font-size:11px;font-weight:900;color:${unlocked ? '#4ade80' : '#94a3b8'};">
            ${unlocked ? '+2% BPS' : 'Bloq.'}
          </span>
        </div>
      `;
      uiShopList.appendChild(card);
    }
  } else {
    uiShopTitle.textContent = 'Reencarnação Primata';
    uiBulkGroup.style.display = 'none';

    const gain = calcPrestigePreview(state.lifetimeBananas, state.prestigeChips);
    const tier = getEvolutionTier(state.prestigeChips);
    const nextTier = EVOLUTION_TIERS.find((t) => t.minChips > state.prestigeChips);

    const box = document.createElement('div');
    box.className = 'mc-prestige-box';
    box.innerHTML = `
      <div style="font-size:36px;">${tier.badge}</div>
      <div style="font-size:16px;font-weight:900;color:#fde047;margin-top:4px;">${tier.title}</div>
      <div style="font-size:12px;color:#e9d5ff;margin-top:2px;">${tier.desc}</div>
      <div style="margin-top:10px;font-size:13px;color:#f3e8ff;">
        Q.I. Primata atual: <strong>${state.prestigeChips}</strong> (+${state.prestigeChips * 10}% produção)<br/>
        Bananas na história: <strong>${formatBananas(state.lifetimeBananas)} 🍌</strong>
      </div>
      ${
        nextTier
          ? `<div style="margin-top:8px;font-size:11px;color:#c4b5fd;">Próxima forma: ${nextTier.badge} ${nextTier.title} (${nextTier.minChips} Q.I.)</div>`
          : `<div style="margin-top:8px;font-size:11px;color:#fde047;">Forma Suprema Alcançada!</div>`
      }
      <div style="margin-top:10px;padding:8px;border-radius:10px;background:rgba(0,0,0,0.28);font-size:12px;">
        Ao reencarnar agora você ganha: <strong style="color:#4ade80;">+${gain} Q.I. Primata</strong><br/>
        <span style="color:#cbd5e1;font-size:11px;">(Requer 1 Mi de bananas acumuladas para o 1º Q.I.)</span>
      </div>
    `;

    const pBtn = document.createElement('button');
    pBtn.className = 'mc-prestige-btn';
    pBtn.textContent =
      gain > 0
        ? `🧬 REENCARNAR AGORA (+${gain} Q.I.)`
        : '🔒 Alcance 1 Mi 🍌 acumuladas para evoluir';
    pBtn.disabled = gain <= 0 || state.mode === 'versus';
    pBtn.onclick = () => triggerPrestige();
    box.appendChild(pBtn);
    uiShopList.appendChild(box);
  }
}

function syncShopAffordability(): void {
  if (activeTab === 'buildings') {
    const btns = uiShopList.querySelectorAll<HTMLButtonElement>('button[data-building-id]');
    btns.forEach((btn) => {
      const id = btn.dataset.buildingId!;
      const def = BUILDINGS.find((b) => b.id === id);
      if (!def) return;
      const owned = state.buildings[id] || 0;
      const cost = getBuildingCost(def, owned, bulkAmount);
      btn.disabled = state.bananas < cost;
    });
  } else if (activeTab === 'upgrades') {
    const btns = uiShopList.querySelectorAll<HTMLButtonElement>('button[data-upgrade-id]');
    btns.forEach((btn) => {
      const id = btn.dataset.upgradeId!;
      const def = UPGRADES.find((u) => u.id === id);
      if (!def) return;
      btn.disabled = state.bananas < def.cost;
    });
  }
}

function updateHudTexts(): void {
  const metrics = computeMetrics(state);
  uiBananas.textContent = `${formatBananas(state.bananas)} 🍌`;
  uiBps.textContent = `${formatBps(metrics.bps)} /seg`;
  uiBpc.textContent = `+${formatBananas(metrics.bpc)} /clique`;

  if (state.comboCount >= 4) {
    uiCombo.style.display = 'inline-block';
    uiCombo.textContent = `COMBO ${metrics.comboMult.toFixed(2).replace('.', ',')}x`;
  } else {
    uiCombo.style.display = 'none';
  }

  if (state.activeEvent) {
    uiEventPill.style.display = 'inline-block';
    const isBad =
      state.activeEvent.kind === 'tax_gorilla' || state.activeEvent.kind === 'intern_strike';
    uiEventPill.className = `mc-pill ${isBad ? 'chaos' : 'fever'}`;
    uiEventPill.textContent = `${state.activeEvent.label} (${Math.ceil(state.activeEvent.remaining)}s)`;
  } else {
    uiEventPill.style.display = 'none';
  }

  // Multiplayer status bar
  if (state.mode === 'versus') {
    uiMpBar.style.display = 'flex';
    const entries = getSortedRaceEntries();
    uiMpCard.innerHTML =
      `<div style="font-weight:900;color:#fde047;">🏁 CORRIDA ATÉ ${formatBananas(state.raceGoal)} 🍌</div>` +
      entries
        .map((e) => {
          const pct = Math.min(100, (e.bananas / state.raceGoal) * 100);
          return `
            <div class="mc-race-row">
              <span style="min-width:110px;font-weight:800;color:${e.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.name}</span>
              <div class="mc-race-track"><div class="mc-race-fill" style="width:${pct.toFixed(1)}%;background:${e.color};"></div></div>
              <span style="min-width:74px;text-align:right;font-weight:800;">${formatBananas(e.bananas)}</span>
            </div>
          `;
        })
        .join('');
  } else if (state.mode === 'coop' && net.isInRoom()) {
    uiMpBar.style.display = 'flex';
    const players = net.room.getPlayers();
    uiMpCard.innerHTML = `<div style="font-weight:800;color:#4ade80;">🤝 Cooperativa Bananeira (${net.room.roomCode}) — ${players.length} macaco(s) clicando juntos!</div>`;
  } else {
    uiMpBar.style.display = 'none';
  }
}

// Event Listeners
window.addEventListener('resize', () => renderer.resize());

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const lx = e.clientX - rect.left;
  const ly = e.clientY - rect.top;
  const nx = Math.max(0, Math.min(1, lx / Math.max(1, rect.width)));
  const ny = Math.max(0, Math.min(1, ly / Math.max(1, rect.height)));
  renderer.pointerNX = nx;
  renderer.pointerNY = ny;
  if (isPlaying) net.sendCursor(nx, ny);
});

canvas.addEventListener('pointerdown', (e) => {
  if (!isPlaying || isControlsOpen) return;
  const rect = canvas.getBoundingClientRect();
  const lx = e.clientX - rect.left;
  const ly = e.clientY - rect.top;
  renderer.pointerNX = lx / Math.max(1, rect.width);
  renderer.pointerNY = ly / Math.max(1, rect.height);

  const hit = renderer.hitTest(lx, ly, state);
  if (hit.kind === 'golden') {
    collectGoldenBanana(hit.id);
  } else if (hit.kind === 'chaos') {
    hitChaosBoss();
  } else if (hit.kind === 'rain') {
    collectRainBanana(hit.id);
  } else if (hit.kind === 'banana') {
    performBananaClick(lx, ly);
  }
});

window.addEventListener('keydown', (e) => {
  if (!isPlaying || isControlsOpen) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    const g = renderer.getGeometry();
    performBananaClick(
      g.bananaX + (Math.random() - 0.5) * 32,
      g.bananaY + (Math.random() - 0.5) * 32,
    );
  }
});

// Sidebar Tabs & Bulk Buttons
document.querySelectorAll<HTMLButtonElement>('.mc-tab-btn').forEach((btn) => {
  btn.onclick = () => {
    clickerAudio.playUiClick();
    document.querySelectorAll('.mc-tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab as ShopTab;
    shopNeedsRebuild = true;
  };
});

document.querySelectorAll<HTMLButtonElement>('#ui-bulk-group .mc-bulk-btn').forEach((btn) => {
  btn.onclick = () => {
    clickerAudio.playUiClick();
    document.querySelectorAll('#ui-bulk-group .mc-bulk-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    bulkAmount = Number(btn.dataset.bulk) || 1;
    shopNeedsRebuild = true;
  };
});

// Menu Controls
menuModes.querySelectorAll<HTMLButtonElement>('.mc-mode-btn').forEach((btn) => {
  btn.onclick = () => {
    clickerAudio.playUiClick();
    menuModes.querySelectorAll('.mc-mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMenuMode = btn.dataset.mode as GameMode;
    menuRaceBox.style.display = selectedMenuMode === 'versus' ? 'block' : 'none';
    updateMenuStatus();
  };
});

menuRaceTargets.querySelectorAll<HTMLButtonElement>('.mc-bulk-btn').forEach((btn) => {
  btn.onclick = () => {
    clickerAudio.playUiClick();
    menuRaceTargets.querySelectorAll('.mc-bulk-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRaceGoal = Number(btn.dataset.goal) || 25000;
  };
});

menuPlayBtn.onclick = () => {
  startGame(selectedMenuMode, selectedRaceGoal, true);
};

btnMenu.onclick = () => {
  clickerAudio.playUiClick();
  if (state.mode === 'solo') saveEmpire(state);
  isPlaying = false;
  menuBestBadge.textContent = `🏆 Recorde: ${formatBananas(getBestBananaScore())} 🍌`;
  updateMenuStatus();
  menuOverlay.classList.remove('hidden');
};

btnReset.onclick = () => {
  clickerAudio.playUiClick();
  resetCurrentRun();
};

resReplayBtn.onclick = () => {
  resultsOverlay.classList.add('hidden');
  resetCurrentRun();
};

resMenuBtn.onclick = () => {
  resultsOverlay.classList.add('hidden');
  isPlaying = false;
  menuOverlay.classList.remove('hidden');
};

window.addEventListener('beforeunload', () => {
  if (state.mode === 'solo') saveEmpire(state);
});

// Main Simulation & Render Loop
let lastTs = performance.now();
let autoSaveAccum = 0;
let uiSyncAccum = 0;
let rainSpawnAccum = 0;

function tick(now: number): void {
  const dt = Math.min(0.1, Math.max(0.001, (now - lastTs) / 1000));
  lastTs = now;

  renderer.step(dt);
  net.stepVisuals(dt);

  if (isPlaying && !isControlsOpen) {
    const isAuthoritative = state.mode !== 'coop' || net.isHost();
    const metrics = computeMetrics(state);

    if (isAuthoritative) {
      // Passive BPS production
      if (metrics.bps > 0) {
        addBananas(metrics.bps * dt);
      }

      // Golden banana movement & spawn
      if (state.goldenBanana) {
        const gb = state.goldenBanana;
        gb.life -= dt;
        gb.nx += gb.vx * dt;
        gb.ny += gb.vy * dt;
        if (gb.nx < 0.12 || gb.nx > 0.88) gb.vx *= -1;
        if (gb.ny < 0.2 || gb.ny > 0.84) gb.vy *= -1;
        if (gb.life <= 0) {
          state.goldenBanana = null;
          if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
        }
      } else {
        state.nextGoldenIn -= dt;
        if (state.nextGoldenIn <= 0) {
          spawnGoldenBanana();
          state.nextGoldenIn = 24 + Math.random() * 20;
        }
      }

      // Active Chaos / Fever event countdown
      if (state.activeEvent) {
        state.activeEvent.remaining -= dt;
        if (state.activeEvent.kind === 'banana_rain') {
          rainSpawnAccum += dt;
          if (rainSpawnAccum >= 0.42) {
            rainSpawnAccum = 0;
            state.rainBananas.push({
              id: Math.random().toString(36).slice(2, 8),
              nx: 0.12 + Math.random() * 0.76,
              ny: 0.1,
              vy: 0.22 + Math.random() * 0.16,
              rot: Math.random() * Math.PI * 2,
              vrot: (Math.random() - 0.5) * 4,
              value: Math.max(15, metrics.bps * 4 + metrics.bpc * 6),
            });
          }
        }
        if (state.activeEvent.remaining <= 0) {
          // Tax gorilla steals 5% if not defeated!
          if (state.activeEvent.kind === 'tax_gorilla') {
            const tax = Math.floor(state.bananas * 0.05);
            state.bananas = Math.max(0, state.bananas - tax);
            hud.toast(`🦍 O Gorila cobrou ${formatBananas(tax)} 🍌 de imposto!`, 'chaos');
          }
          state.activeEvent = null;
          if (state.mode === 'coop' && net.isHost()) broadcastCoopState(true);
        }
      } else {
        state.nextChaosIn -= dt;
        if (state.nextChaosIn <= 0) {
          triggerChaosEvent();
          state.nextChaosIn = 34 + Math.random() * 24;
        }
      }

      if (state.mode === 'coop' && net.isHost()) {
        broadcastCoopState(false);
      }
    }

    // Rain bananas fall animation
    for (let i = state.rainBananas.length - 1; i >= 0; i--) {
      const rb = state.rainBananas[i];
      rb.ny += rb.vy * dt;
      rb.rot += rb.vrot * dt;
      if (rb.ny > 0.96) state.rainBananas.splice(i, 1);
    }

    // Combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboCount = 0;
      }
    }

    // Versus progress & win check
    if (state.mode === 'versus' && !state.raceWinnerId) {
      if (state.bananas >= state.raceGoal) {
        const elapsed = (now - state.raceStartedAt) / 1000;
        state.raceWinnerId = net.room.localPlayer.id;
        net.sendVersusProgress(state.bananas, metrics.bps, state.prestigeChips, elapsed, true);
        net.broadcastVersusWin(net.room.localPlayer.id, net.room.localPlayer.name, elapsed);
        showVersusResults(net.room.localPlayer.name, elapsed, true);
      } else {
        net.sendVersusProgress(state.bananas, metrics.bps, state.prestigeChips);
      }
    }

    // Periodic autosave & score reporting
    autoSaveAccum += dt;
    if (autoSaveAccum >= 4) {
      autoSaveAccum = 0;
      checkAchievements();
      if (state.mode === 'solo') saveEmpire(state);
      if (state.lifetimeBananas > lastScoreReported + 50) {
        lastScoreReported = state.lifetimeBananas;
        reportEmpireScore(state.lifetimeBananas, {
          prestigeChips: state.prestigeChips,
          bps: Math.floor(metrics.bps),
        });
      }
    }

    uiSyncAccum += dt;
    if (uiSyncAccum >= 0.1) {
      uiSyncAccum = 0;
      updateHudTexts();
      if (shopNeedsRebuild) {
        rebuildShop();
      } else {
        syncShopAffordability();
      }
    }
  }

  renderer.render(state, net.remoteCursors);
  requestAnimationFrame(tick);
}

// Init
menuBestBadge.textContent = `🏆 Recorde: ${formatBananas(getBestBananaScore())} 🍌`;
updateMenuStatus();
rebuildShop();
requestAnimationFrame(tick);
