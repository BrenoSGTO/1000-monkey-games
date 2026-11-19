import './styles.css';
import {
  getGameScore,
  monkeyAudio,
  mountMonkeyHud,
  PeerRoom,
  reportGameScore,
  type PlayerProfile,
} from '@monkey-slop/sdk';
import { dashAudio } from './audio-engine';
import { createLevelEditor, loadSavedCustomLevel } from './editor';
import { OFFICIAL_LEVELS } from './levels';
import {
  createInitialPlayer,
  restoreFromCheckpoint,
  snapshotCheckpoint,
  stepPhysics,
} from './physics';
import { renderGameFrame, type FloatingText, type Particle } from './renderer';
import {
  FIXED_DT,
  GROUND_Y,
  HORN_MEMES,
  PLAYER_SIZE,
  RAGE_PHRASES_EARLY,
  RAGE_PHRASES_HIGH,
  RAGE_PHRASES_MID,
  RESPAWN_DELAY,
  TILE,
  type Checkpoint,
  type DashNetMessage,
  type HornEvent,
  type LevelData,
  type LevelProgress,
  type PlayerState,
  type RemoteMonkeyState,
} from './types';

const PROGRESS_KEY = 'monkey-dash:progress';

type ScreenMode = 'menu' | 'playing' | 'paused_win' | 'editor';

function loadProgressMap(): Record<string, LevelProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, LevelProgress>;
  } catch {
    // ignore
  }
  return {};
}

function saveProgressMap(map: Record<string, LevelProgress>): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function pickRagePhrase(pct: number): string {
  const rounded = Math.floor(pct);
  const pool =
    rounded >= 75 ? RAGE_PHRASES_HIGH : rounded >= 35 ? RAGE_PHRASES_MID : RAGE_PHRASES_EARLY;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return tpl.replace('{pct}', String(rounded));
}

function computeTotalScore(map: Record<string, LevelProgress>): number {
  let score = 0;
  for (const lvl of OFFICIAL_LEVELS) {
    const p = map[lvl.id];
    if (!p) continue;
    score += Math.floor(p.bestPct) * 10;
    if (p.completed) score += 1000;
    score += p.bestBananas * 150;
  }
  return Math.max(score, getGameScore('monkey-dash').bestScore);
}

// DOM Setup
const app = document.getElementById('app')!;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// Top Center In-Game HUD
const topHud = document.createElement('div');
topHud.className = 'md-hud-top';
topHud.style.display = 'none';
topHud.innerHTML = `
  <div class="md-progress-wrap">
    <div class="md-progress-fill" id="md-prog-fill"></div>
    <div class="md-progress-text" id="md-prog-text">0% • Tentativa #1</div>
  </div>
  <div class="md-sub-bar">
    <button class="md-pill" id="md-btn-practice">🧪 Prática (P): OFF</button>
    <button class="md-pill" id="md-btn-cp" style="display:none;">💎 Checkpoint (Z)</button>
    <button class="md-pill" id="md-btn-restart">🔄 Reiniciar (R)</button>
    <button class="md-pill" id="md-btn-menu">⬅ Menu (Esc)</button>
  </div>
`;
app.appendChild(topHud);

// Top Right Multiplayer & Horn Panel
const rightPanel = document.createElement('div');
rightPanel.className = 'md-right-panel';
rightPanel.innerHTML = `
  <button class="md-horn-btn" id="md-btn-horn" title="Buzina de Macaco (Tecla B)">📣 Buzina (B)</button>
  <div class="md-race-board" id="md-race-board"></div>
`;
app.appendChild(rightPanel);

// Main Menu / Level Select Overlay
const menuOverlay = document.createElement('div');
menuOverlay.className = 'md-menu-overlay';
menuOverlay.innerHTML = `
  <div class="md-title-hero">
    <h1>⚡ CHIMP DASH: SURTO RÍTMICO</h1>
    <p>Runner Rítmico de 1 Botão • Cubo Macaco, Nave Banana & Onda Surtada!</p>
  </div>
  <div class="md-levels-grid" id="md-levels-grid"></div>
  <div class="md-menu-actions">
    <button class="md-btn md-btn-play" id="md-play-btn">▶ JOGAR AGORA</button>
    <button class="md-btn md-btn-cyan" id="md-practice-toggle">🧪 Modo Prática: OFF</button>
    <button class="md-btn md-btn-gold" id="md-editor-btn">🛠️ Mini Editor de Fase</button>
    <button class="md-btn" id="md-play-custom-btn">🎮 Jogar Minha Fase</button>
  </div>
  <div class="md-controls-hint">
    <strong>Controles:</strong> <b>Espaço / Clique / Seta Cima / Toque</b> para Pular, Voar ou Zigue-zaguear (segure para repetir pulo!) •
    <b>P</b>: Modo Prática • <b>Z</b>: Checkpoint • <b>B</b>: Buzina de Macaco (Online) • <b>R</b>: Reiniciar
  </div>
`;
app.appendChild(menuOverlay);

// Victory Overlay
const winOverlay = document.createElement('div');
winOverlay.className = 'md-win-overlay';
winOverlay.innerHTML = `
  <div class="md-win-card">
    <h2 id="md-win-title">🏆 FASE ZERADA!</h2>
    <p id="md-win-sub" style="color:#cbd5e1;font-size:14px;margin:0;"></p>
    <div class="md-win-stats">
      <div class="md-win-stat"><strong id="md-win-att">1</strong><span>Tentativas</span></div>
      <div class="md-win-stat"><strong id="md-win-ban">0/3</strong><span>Bananas 🍌</span></div>
      <div class="md-win-stat"><strong id="md-win-pct">100%</strong><span>Progresso</span></div>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
      <button class="md-btn md-btn-play" style="font-size:15px;padding:10px 22px;" id="md-win-replay">🔄 Jogar de Novo</button>
      <button class="md-btn md-btn-cyan" id="md-win-next">⏭ Próxima Fase</button>
      <button class="md-btn" id="md-win-menu">⬅ Menu</button>
    </div>
  </div>
`;
app.appendChild(winOverlay);

// State
const progressMap = loadProgressMap();
let selectedLevelIdx = 0;
let activeLevel: LevelData = OFFICIAL_LEVELS[0];
let testingFromEditor = false;
let screenMode: ScreenMode = 'menu';
let practiceMode = false;

let player: PlayerState = createInitialPlayer();
let checkpoints: Checkpoint[] = [];
let attempts = 1;
let autoCpTimer = 0;
let respawnTimer = 0;
let cameraX = 0;
let shakeAmount = 0;
let deathBanner: string | null = null;
let particles: Particle[] = [];
let floatingTexts: FloatingText[] = [];
let activeHorn: HornEvent | null = null;
let hornCooldown = 0;

// Input state
let inputHeld = false;
let justPressedFlag = false;
let jumpBuffer = 0;
let orbBuffer = 0;
let coyoteTimer = 0;

// Multiplayer P2P Room & HUD
const remotes = new Map<string, RemoteMonkeyState>();
let netSyncTimer = 0;
let hudHandle: ReturnType<typeof mountMonkeyHud<DashNetMessage>>;

const room = new PeerRoom<DashNetMessage>('monkey-dash', {
  onPlayersChange(players: PlayerProfile[]) {
    hudHandle.setPlayers(players);
    const activeIds = new Set(players.map((p) => p.id));
    for (const id of remotes.keys()) {
      if (!activeIds.has(id)) remotes.delete(id);
    }
    renderRaceBoard();
  },
  onMessage(env) {
    const msg = env.payload;
    if (!msg) return;

    if (msg.kind === 'state') {
      const prev = remotes.get(env.senderId);
      const trail = prev ? prev.trail.slice(-16) : [];
      if (msg.alive) {
        trail.push({ x: msg.x + PLAYER_SIZE / 2, y: msg.y + PLAYER_SIZE / 2 });
      }
      remotes.set(env.senderId, {
        id: env.senderId,
        name: env.senderName,
        color: msg.color,
        levelId: msg.levelId,
        x: msg.x,
        y: msg.y,
        rot: msg.rot,
        form: msg.form,
        grav: msg.grav,
        alive: msg.alive,
        pct: msg.pct,
        trail,
        lastSeen: performance.now(),
      });
      renderRaceBoard();
    } else if (msg.kind === 'death') {
      const rem = remotes.get(env.senderId);
      if (rem) {
        rem.alive = false;
        rem.pct = msg.pct;
      }
      if (msg.levelId === activeLevel.id) {
        spawnExplosion(msg.x, msg.y, msg.color, 18);
        floatingTexts.push({
          x: msg.x,
          y: msg.y - 26,
          text: `💀 ${env.senderName} (${Math.floor(msg.pct)}%)`,
          color: '#fda4af',
          life: 1.5,
          maxLife: 1.5,
        });
      }
    } else if (msg.kind === 'win') {
      hudHandle.toast(`🏆 ${env.senderName} zerou ${msg.levelId} em ${msg.attempts} tentativas!`, 'banana');
    } else if (msg.kind === 'horn') {
      triggerHornEffect(env.senderId, env.senderName, msg.emoji, msg.phrase);
    }
  },
});

hudHandle = mountMonkeyHud({
  slug: 'monkey-dash',
  title: 'Chimp Dash: Surto Rítmico',
  room,
});

// UI Element refs
const levelsGrid = document.getElementById('md-levels-grid')!;
const playBtn = document.getElementById('md-play-btn')!;
const menuPracticeBtn = document.getElementById('md-practice-toggle')!;
const editorBtn = document.getElementById('md-editor-btn')!;
const playCustomBtn = document.getElementById('md-play-custom-btn')!;

const progFill = document.getElementById('md-prog-fill')!;
const progText = document.getElementById('md-prog-text')!;
const btnPractice = document.getElementById('md-btn-practice')!;
const btnCp = document.getElementById('md-btn-cp')!;
const btnRestart = document.getElementById('md-btn-restart')!;
const btnMenu = document.getElementById('md-btn-menu')!;
const btnHorn = document.getElementById('md-btn-horn') as HTMLButtonElement;
const raceBoard = document.getElementById('md-race-board')!;

const winTitle = document.getElementById('md-win-title')!;
const winSub = document.getElementById('md-win-sub')!;
const winAtt = document.getElementById('md-win-att')!;
const winBan = document.getElementById('md-win-ban')!;
const winPct = document.getElementById('md-win-pct')!;
const winReplay = document.getElementById('md-win-replay')!;
const winNext = document.getElementById('md-win-next')!;
const winMenu = document.getElementById('md-win-menu')!;

const editor = createLevelEditor(app, {
  onPlayTest(customLvl) {
    testingFromEditor = true;
    startLevel(customLvl);
  },
  onBackToMenu() {
    testingFromEditor = false;
    openMenu();
  },
  onToast(msg, tone) {
    hudHandle.toast(msg, tone);
  },
});

function renderLevelCards(): void {
  levelsGrid.innerHTML = '';
  OFFICIAL_LEVELS.forEach((lvl, idx) => {
    const p = progressMap[lvl.id] ?? { bestPct: 0, completed: false, bestBananas: 0, attempts: 0 };
    const card = document.createElement('button');
    card.className = `md-level-card ${idx === selectedLevelIdx ? 'selected' : ''}`;
    card.style.setProperty('--card-accent', lvl.colorPrimary);
    card.innerHTML = `
      <div class="md-card-top">
        <span class="md-badge" style="color:${lvl.colorPrimary};border:1px solid ${lvl.colorPrimary};">${lvl.difficulty}</span>
        <span class="md-badge">🎵 ${lvl.bpm} BPM</span>
      </div>
      <div class="md-card-title">${p.completed ? '✅ ' : ''}${lvl.name}</div>
      <div class="md-card-sub">${lvl.subtitle}</div>
      <div class="md-card-bar"><div style="width:${Math.min(100, Math.floor(p.bestPct))}%;"></div></div>
      <div class="md-card-stats">
        <span>Recorde: ${Math.floor(p.bestPct)}%</span>
        <span>🍌 ${p.bestBananas}/3</span>
      </div>
    `;
    card.onclick = () => {
      monkeyAudio.play('click');
      selectedLevelIdx = idx;
      renderLevelCards();
    };
    card.ondblclick = () => {
      testingFromEditor = false;
      startLevel(lvl);
    };
    levelsGrid.appendChild(card);
  });
}

function syncPracticeUi(): void {
  const label = practiceMode ? 'ON' : 'OFF';
  menuPracticeBtn.textContent = `🧪 Modo Prática: ${label}`;
  menuPracticeBtn.classList.toggle('practice-on', practiceMode);
  btnPractice.textContent = `🧪 Prática (P): ${label}`;
  btnPractice.classList.toggle('practice-on', practiceMode);
  btnCp.style.display = practiceMode ? 'inline-flex' : 'none';
}

function renderRaceBoard(): void {
  const players = room.getPlayers();
  if (players.length <= 1 && remotes.size === 0) {
    raceBoard.classList.remove('visible');
    return;
  }
  raceBoard.classList.add('visible');
  const entries: Array<{ name: string; color: string; pct: number; isLocal: boolean }> = [
    {
      name: room.localPlayer.name,
      color: room.localPlayer.color,
      pct: getCurrentPct(),
      isLocal: true,
    },
  ];
  for (const r of remotes.values()) {
    entries.push({
      name: r.name,
      color: r.color,
      pct: r.levelId === activeLevel.id ? r.pct : 0,
      isLocal: false,
    });
  }
  entries.sort((a, b) => b.pct - a.pct);
  raceBoard.innerHTML = entries
    .map(
      (e, i) => `
    <div class="md-race-row" style="color:${e.color};">
      <span>${i === 0 ? '👑 ' : ''}${e.name}${e.isLocal ? ' (Você)' : ''}</span>
      <span>${Math.floor(e.pct)}%</span>
    </div>
  `,
    )
    .join('');
}

function getCurrentPct(): number {
  const totalPx = Math.max(1, activeLevel.lengthTiles * TILE);
  return Math.max(0, Math.min(100, (player.x / totalPx) * 100));
}

function spawnExplosion(cx: number, cy: number, color: string, count = 26): void {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 440;
    const isBanana = i % 4 === 0;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 120,
      size: isBanana ? 9 : 4 + Math.random() * 7,
      color: isBanana ? '#fde047' : i % 2 === 0 ? color : '#fb7185',
      life: 0.45 + Math.random() * 0.45,
      maxLife: 0.9,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 14,
      kind: isBanana ? 'banana' : 'shard',
    });
  }
}

function triggerHornEffect(senderId: string, senderName: string, emoji: string, phrase: string): void {
  dashAudio.playHorn();
  shakeAmount = Math.max(shakeAmount, 7);
  activeHorn = {
    senderId,
    senderName,
    emoji,
    phrase,
    startedAt: performance.now(),
  };
}

function fireLocalHorn(): void {
  if (hornCooldown > 0) return;
  hornCooldown = 4;
  const meme = HORN_MEMES[Math.floor(Math.random() * HORN_MEMES.length)];
  triggerHornEffect(room.localPlayer.id, room.localPlayer.name, meme.emoji, meme.phrase);
  room.send('horn', { kind: 'horn', emoji: meme.emoji, phrase: meme.phrase });
}

function startLevel(lvl: LevelData): void {
  dashAudio.unlock();
  activeLevel = lvl;
  screenMode = 'playing';
  attempts = 1;
  checkpoints = [];
  particles = [];
  floatingTexts = [];
  deathBanner = null;
  respawnTimer = 0;
  autoCpTimer = 0;

  player = createInitialPlayer();
  cameraX = player.x - 200;

  menuOverlay.style.display = 'none';
  winOverlay.style.display = 'none';
  topHud.style.display = 'flex';
  btnMenu.textContent = testingFromEditor ? '⬅ Editor (Esc)' : '⬅ Menu (Esc)';
  syncPracticeUi();

  dashAudio.startMusic(lvl.songId, lvl.bpm, 0);
  renderRaceBoard();
}

function openMenu(): void {
  screenMode = 'menu';
  dashAudio.stopMusic();
  topHud.style.display = 'none';
  winOverlay.style.display = 'none';
  menuOverlay.style.display = 'flex';
  renderLevelCards();
}

function resetAttempt(fullRestart = false): void {
  deathBanner = null;
  respawnTimer = 0;
  autoCpTimer = 0;
  if (fullRestart || !practiceMode || checkpoints.length === 0) {
    if (fullRestart) checkpoints = [];
    player = createInitialPlayer();
    dashAudio.startMusic(activeLevel.songId, activeLevel.bpm, 0);
  } else {
    const cp = checkpoints[checkpoints.length - 1];
    player = restoreFromCheckpoint(cp);
    dashAudio.startMusic(activeLevel.songId, activeLevel.bpm, cp.songBeatOffset);
  }
  cameraX = player.x - 200;
}

function handlePlayerDeath(cx: number, cy: number): void {
  const pct = getCurrentPct();
  dashAudio.playDeath();
  shakeAmount = 11;
  spawnExplosion(cx, cy, room.localPlayer.color, 30);

  const phrase = pickRagePhrase(pct);
  deathBanner = phrase;
  respawnTimer = RESPAWN_DELAY;

  // Record best % progress (unless testing custom level? we still save official/custom progress!)
  const prev = progressMap[activeLevel.id] ?? {
    bestPct: 0,
    completed: false,
    bestBananas: 0,
    attempts: 0,
  };
  const improved = pct > prev.bestPct;
  progressMap[activeLevel.id] = {
    bestPct: Math.max(prev.bestPct, pct),
    completed: prev.completed,
    bestBananas: Math.max(prev.bestBananas, player.collectedBananas.size),
    attempts: prev.attempts + 1,
  };
  saveProgressMap(progressMap);
  if (improved) {
    reportGameScore('monkey-dash', computeTotalScore(progressMap), {
      lastLevel: activeLevel.id,
      bestPct: Math.floor(pct),
    });
  }

  room.send('death', {
    kind: 'death',
    levelId: activeLevel.id,
    x: cx,
    y: cy,
    pct,
    color: room.localPlayer.color,
    phrase,
  });
}

function handleLevelWin(): void {
  screenMode = 'paused_win';
  dashAudio.playWin();
  spawnExplosion(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, '#facc15', 40);

  const totalBananas = activeLevel.objects.filter((o) => o.type === 'banana').length;
  const prev = progressMap[activeLevel.id] ?? {
    bestPct: 0,
    completed: false,
    bestBananas: 0,
    attempts: 0,
  };
  progressMap[activeLevel.id] = {
    bestPct: 100,
    completed: prev.completed || !practiceMode,
    bestBananas: Math.max(prev.bestBananas, player.collectedBananas.size),
    attempts: prev.attempts + 1,
  };
  saveProgressMap(progressMap);

  const totalScore = computeTotalScore(progressMap);
  reportGameScore('monkey-dash', totalScore, {
    lastLevel: activeLevel.id,
    completed: !practiceMode ? 1 : 0,
  });

  room.send('win', { kind: 'win', levelId: activeLevel.id, attempts });

  winTitle.textContent = practiceMode ? '🧪 TREINO CONCLUÍDO!' : '🏆 FASE ZERADA!';
  winSub.textContent = practiceMode
    ? `${activeLevel.name} (Modo Prática — agora tente no modo Normal!)`
    : `${activeLevel.name} — Surto Rítmico dominado com sucesso!`;
  winAtt.textContent = String(attempts);
  winBan.textContent = `${player.collectedBananas.size}/${totalBananas}`;
  winPct.textContent = '100%';

  const officialIdx = OFFICIAL_LEVELS.findIndex((l) => l.id === activeLevel.id);
  winNext.style.display = officialIdx >= 0 && officialIdx < OFFICIAL_LEVELS.length - 1 ? 'inline-flex' : 'none';
  winOverlay.style.display = 'flex';
}

function placeManualCheckpoint(): void {
  if (!practiceMode || screenMode !== 'playing' || !player.alive) return;
  const cp = snapshotCheckpoint(player, dashAudio.getCurrentBeatCount());
  checkpoints.push(cp);
  if (checkpoints.length > 40) checkpoints.shift();
  dashAudio.playCheckpoint();
  floatingTexts.push({
    x: player.x + PLAYER_SIZE / 2,
    y: player.y - 16,
    text: '💎 Checkpoint!',
    color: '#4ade80',
    life: 0.9,
    maxLife: 0.9,
  });
}

// Button Handlers
playBtn.onclick = () => {
  monkeyAudio.play('click');
  testingFromEditor = false;
  startLevel(OFFICIAL_LEVELS[selectedLevelIdx]);
};

menuPracticeBtn.onclick = () => {
  monkeyAudio.play('click');
  practiceMode = !practiceMode;
  syncPracticeUi();
};

editorBtn.onclick = () => {
  monkeyAudio.play('click');
  menuOverlay.style.display = 'none';
  screenMode = 'editor';
  editor.open();
};

playCustomBtn.onclick = () => {
  monkeyAudio.play('click');
  testingFromEditor = false;
  startLevel(loadSavedCustomLevel());
};

btnPractice.onclick = () => {
  monkeyAudio.play('click');
  practiceMode = !practiceMode;
  if (!practiceMode) checkpoints = [];
  syncPracticeUi();
};

btnCp.onclick = () => placeManualCheckpoint();

btnRestart.onclick = () => {
  monkeyAudio.play('click');
  attempts++;
  resetAttempt(true);
};

btnMenu.onclick = () => {
  monkeyAudio.play('click');
  if (testingFromEditor) {
    dashAudio.stopMusic();
    topHud.style.display = 'none';
    winOverlay.style.display = 'none';
    screenMode = 'editor';
    editor.open();
  } else {
    openMenu();
  }
};

btnHorn.onclick = () => {
  dashAudio.unlock();
  fireLocalHorn();
};

winReplay.onclick = () => {
  monkeyAudio.play('click');
  startLevel(activeLevel);
};

winNext.onclick = () => {
  monkeyAudio.play('click');
  const idx = OFFICIAL_LEVELS.findIndex((l) => l.id === activeLevel.id);
  if (idx >= 0 && idx < OFFICIAL_LEVELS.length - 1) {
    selectedLevelIdx = idx + 1;
    startLevel(OFFICIAL_LEVELS[selectedLevelIdx]);
  }
};

winMenu.onclick = () => {
  monkeyAudio.play('click');
  if (testingFromEditor) {
    winOverlay.style.display = 'none';
    topHud.style.display = 'none';
    dashAudio.stopMusic();
    screenMode = 'editor';
    editor.open();
  } else {
    openMenu();
  }
};

// Input Listeners (1-button keyboard + pointer + touch)
function triggerInputDown(): void {
  dashAudio.unlock();
  if (screenMode !== 'playing') return;
  if (!inputHeld) {
    justPressedFlag = true;
    jumpBuffer = 0.11;
    orbBuffer = 0.14;
  }
  inputHeld = true;
}

function triggerInputUp(): void {
  inputHeld = false;
}

window.addEventListener('keydown', (e) => {
  if (editor.isOpen()) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (!e.repeat) triggerInputDown();
  } else if (e.code === 'KeyB') {
    fireLocalHorn();
  } else if (e.code === 'KeyP' && screenMode === 'playing') {
    practiceMode = !practiceMode;
    if (!practiceMode) checkpoints = [];
    syncPracticeUi();
    hudHandle.toast(`Modo Prática: ${practiceMode ? 'ATIVADO 🧪' : 'DESATIVADO'}`, 'info');
  } else if (e.code === 'KeyZ' && screenMode === 'playing') {
    placeManualCheckpoint();
  } else if (e.code === 'KeyX' && screenMode === 'playing' && checkpoints.length > 0) {
    checkpoints.pop();
    monkeyAudio.play('click');
  } else if (e.code === 'KeyR' && (screenMode === 'playing' || screenMode === 'paused_win')) {
    winOverlay.style.display = 'none';
    screenMode = 'playing';
    attempts++;
    resetAttempt(e.shiftKey);
  } else if (e.code === 'Escape' && (screenMode === 'playing' || screenMode === 'paused_win')) {
    btnMenu.click();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    triggerInputUp();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  triggerInputDown();
});
window.addEventListener('pointerup', () => triggerInputUp());
window.addEventListener('pointercancel', () => triggerInputUp());

// Canvas Resize
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(320, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(240, Math.floor(window.innerHeight * dpr));
}
window.addEventListener('resize', resize);
resize();

// Initialize Menu
renderLevelCards();
syncPracticeUi();

// Main 60 FPS Fixed-Timestep Loop
let lastTime = performance.now();
let accumulator = 0;

function tick(now: number): void {
  const frameDt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (hornCooldown > 0) {
    hornCooldown = Math.max(0, hornCooldown - frameDt);
    btnHorn.disabled = hornCooldown > 0;
    btnHorn.textContent = hornCooldown > 0 ? `📣 ${hornCooldown.toFixed(1)}s` : '📣 Buzina (B)';
  }

  shakeAmount = Math.max(0, shakeAmount - frameDt * 28);

  if (screenMode === 'menu') {
    // Gentle background showcase scroll on menu
    cameraX += 110 * frameDt;
    if (cameraX > OFFICIAL_LEVELS[selectedLevelIdx].lengthTiles * TILE) cameraX = 0;
    renderGameFrame(ctx, canvas.width, canvas.height, {
      level: OFFICIAL_LEVELS[selectedLevelIdx],
      player: { ...createInitialPlayer(), x: cameraX + 180, alive: false },
      cameraX,
      beatPulse: 0.15 + Math.abs(Math.sin(now / 320)) * 0.25,
      timeSec: now / 1000,
      shakeAmount: 0,
      particles: [],
      floatingTexts: [],
      checkpoints: [],
      remotes: [],
      activeHorn,
      deathBanner: null,
      localColor: room.localPlayer.color,
      localName: room.localPlayer.name,
    });
    requestAnimationFrame(tick);
    return;
  }

  if (screenMode === 'playing') {
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;

      if (player.alive) {
        const wasOnGround = player.onGround;
        if (wasOnGround) coyoteTimer = 0.06;
        else coyoteTimer = Math.max(0, coyoteTimer - FIXED_DT);

        jumpBuffer = Math.max(0, jumpBuffer - FIXED_DT);
        orbBuffer = Math.max(0, orbBuffer - FIXED_DT);

        const { events, consumedJump, consumedOrb } = stepPhysics(player, activeLevel, FIXED_DT, {
          held: inputHeld,
          justPressed: justPressedFlag,
          jumpBuffer,
          orbBuffer,
          coyoteTimer,
        });

        justPressedFlag = false;
        if (consumedJump) {
          jumpBuffer = 0;
          coyoteTimer = 0;
        }
        if (consumedOrb) {
          orbBuffer = 0;
        }

        if (events.jumped) dashAudio.playJump();
        if (events.pad) dashAudio.playPad();
        if (events.orb) dashAudio.playOrb();
        if (events.portal) {
          dashAudio.playPortal();
          floatingTexts.push({
            x: player.x + PLAYER_SIZE / 2,
            y: player.y - 20,
            text: events.portal.label,
            color: events.portal.color,
            life: 1.0,
            maxLife: 1.0,
          });
        }
        if (events.banana) {
          dashAudio.playBanana();
          spawnExplosion(events.banana.x, events.banana.y, '#fde047', 12);
          floatingTexts.push({
            x: events.banana.x,
            y: events.banana.y - 16,
            text: '🍌 +1 BANANA!',
            color: '#fde047',
            life: 0.9,
            maxLife: 0.9,
          });
        }
        if (events.died) {
          handlePlayerDeath(events.died.x, events.died.y);
        } else if (events.won) {
          handleLevelWin();
          break;
        }

        // Ship exhaust sparks
        if (player.alive && player.form === 'ship' && Math.random() < 0.75) {
          particles.push({
            x: player.x + 2,
            y: player.y + PLAYER_SIZE * 0.65,
            vx: -120 - Math.random() * 110,
            vy: (Math.random() - 0.5) * 90,
            size: 3 + Math.random() * 4,
            color: inputHeld ? '#facc15' : '#fb7185',
            life: 0.25,
            maxLife: 0.25,
            rot: 0,
            vrot: 4,
            kind: 'spark',
          });
        }

        // Practice auto-checkpoint every 3.5s
        if (practiceMode && player.alive) {
          autoCpTimer += FIXED_DT;
          if (autoCpTimer >= 3.5 && (player.onGround || player.form === 'ship' || player.form === 'wave')) {
            autoCpTimer = 0;
            checkpoints.push(snapshotCheckpoint(player, dashAudio.getCurrentBeatCount()));
            if (checkpoints.length > 40) checkpoints.shift();
          }
        }
      } else {
        // Dead — wait RESPAWN_DELAY (0.35s) then instant respawn!
        respawnTimer -= FIXED_DT;
        if (respawnTimer <= 0) {
          attempts++;
          resetAttempt(false);
        }
      }

      // Particles & Floating text update
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= FIXED_DT;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * FIXED_DT;
        p.y += p.vy * FIXED_DT;
        p.vy += 680 * FIXED_DT;
        p.rot += p.vrot * FIXED_DT;
        if (p.y > GROUND_Y) {
          p.y = GROUND_Y;
          p.vy *= -0.45;
        }
      }

      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.life -= FIXED_DT;
        ft.y -= 36 * FIXED_DT;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
      }
    }

    // Smooth camera track
    const targetCamX = player.x - Math.min(340, window.innerWidth * 0.26);
    cameraX += (targetCamX - cameraX) * Math.min(1, frameDt * 18);

    // Update top HUD
    const pct = getCurrentPct();
    progFill.style.width = `${pct.toFixed(1)}%`;
    progText.textContent = `${Math.floor(pct)}% • Tentativa #${attempts}${practiceMode ? ` • 💎 ${checkpoints.length}` : ''}`;

    // Network state broadcast at 20Hz
    netSyncTimer += frameDt;
    if (netSyncTimer >= 0.05) {
      netSyncTimer = 0;
      if (room.roomCode) {
        room.send('state', {
          kind: 'state',
          levelId: activeLevel.id,
          x: player.x,
          y: player.y,
          rot: player.rot,
          form: player.form,
          grav: player.grav,
          alive: player.alive,
          pct,
          color: room.localPlayer.color,
        });
        renderRaceBoard();
      }
    }
  }

  if (screenMode === 'playing' || screenMode === 'paused_win') {
    renderGameFrame(ctx, canvas.width, canvas.height, {
      level: activeLevel,
      player,
      cameraX,
      beatPulse: dashAudio.getBeatPulse(),
      timeSec: now / 1000,
      shakeAmount,
      particles,
      floatingTexts,
      checkpoints,
      remotes: Array.from(remotes.values()),
      activeHorn,
      deathBanner,
      localColor: room.localPlayer.color,
      localName: room.localPlayer.name,
    });
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
