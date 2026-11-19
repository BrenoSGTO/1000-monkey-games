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
import { createLevelEditor, loadSavedCustomLevel, saveCustomLevel } from './editor';
import { OFFICIAL_LEVELS } from './levels';
import {
  createInitialPlayer,
  isNearSpike,
  restoreFromCheckpoint,
  snapshotCheckpoint,
  stepPhysics,
} from './physics';
import { renderGameFrame, type FloatingText, type Particle } from './renderer';
import {
  BASE_SPEED,
  FIXED_DT,
  GROUND_Y,
  HORN_MEMES,
  MONKEY_SKINS,
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
  type MonkeyForm,
  type MonkeySkinId,
  type PlayerState,
  type RemoteMonkeyState,
} from './types';

const PROGRESS_KEY = 'monkey-dash:progress';
const SKIN_KEY = 'monkey-dash:skin';

type ScreenMode = 'menu' | 'countdown' | 'playing' | 'paused_win' | 'editor';
type PlayMode = 'solo' | 'online_race' | 'local_2p';

interface RunnerState {
  player: PlayerState;
  attempts: number;
  respawnTimer: number;
  cameraX: number;
  shakeAmount: number;
  deathBanner: string | null;
  deathBannerTimer: number;
  particles: Particle[];
  floatingTexts: FloatingText[];
  inputHeld: boolean;
  justPressedFlag: boolean;
  jumpBuffer: number;
  orbBuffer: number;
  coyoteTimer: number;
  color: string;
  skin: MonkeySkinId;
  badge: string;
}

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

function loadSavedSkin(): MonkeySkinId {
  try {
    const raw = localStorage.getItem(SKIN_KEY);
    if (MONKEY_SKINS.some((s) => s.id === raw)) {
      return raw as MonkeySkinId;
    }
  } catch {
    // ignore
  }
  return 'classic';
}

function saveSkin(skin: MonkeySkinId): void {
  try {
    localStorage.setItem(SKIN_KEY, skin);
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

function getTargetCamX(playerX: number): number {
  return playerX - Math.min(340, window.innerWidth * 0.26);
}

function inferStateAtColumn(lvl: LevelData, startGx: number): {
  form: MonkeyForm;
  grav: 1 | -1;
  speedMult: number;
} {
  let form: MonkeyForm = 'cube';
  let grav: 1 | -1 = 1;
  let speedMult = 1;
  for (const obj of lvl.objects) {
    if (obj.gx >= startGx) break;
    if (obj.type === 'portal_cube') form = 'cube';
    else if (obj.type === 'portal_ship') form = 'ship';
    else if (obj.type === 'portal_wave') form = 'wave';
    else if (obj.type === 'portal_ball') form = 'ball';
    else if (obj.type === 'portal_grav_inv') grav = -1;
    else if (obj.type === 'portal_grav_norm') grav = 1;
    else if (obj.type === 'portal_speed_norm') speedMult = 1;
    else if (obj.type === 'portal_speed_fast') speedMult = 1.3;
    else if (obj.type === 'portal_speed_turbo') speedMult = 1.5;
  }
  return { form, grav, speedMult };
}

function createRunner(
  color: string,
  skin: MonkeySkinId,
  badge: string,
  startX = 40,
  lvl?: LevelData,
): RunnerState {
  const player = createInitialPlayer(startX);
  if (lvl && startX > 40) {
    const inferred = inferStateAtColumn(lvl, Math.floor(startX / TILE));
    player.form = inferred.form;
    player.grav = inferred.grav;
    player.speedMult = inferred.speedMult;
    player.vx = BASE_SPEED * inferred.speedMult;
    if (player.form === 'ship' || player.form === 'wave') {
      player.y = GROUND_Y * 0.45;
      player.onGround = false;
    } else if (player.grav === -1) {
      player.y = 0;
      player.onGround = true;
    }
  }
  return {
    player,
    attempts: 1,
    respawnTimer: 0,
    cameraX: getTargetCamX(player.x),
    shakeAmount: 0,
    deathBanner: null,
    deathBannerTimer: 0,
    particles: [],
    floatingTexts: [],
    inputHeld: false,
    justPressedFlag: false,
    jumpBuffer: 0,
    orbBuffer: 0,
    coyoteTimer: 0,
    color,
    skin,
    badge,
  };
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
    <div class="md-progress-track">
      <div class="md-progress-fill" id="md-prog-fill"></div>
    </div>
    <div class="md-progress-markers" id="md-prog-markers"></div>
    <div class="md-progress-text" id="md-prog-text">0% • Tentativa #1</div>
  </div>
  <div class="md-sub-bar">
    <button class="md-pill" id="md-btn-practice">🧪 Prática (P): OFF</button>
    <button class="md-pill" id="md-btn-cp" style="display:none;">💎 CP (Z) / Undo (X)</button>
    <button class="md-pill" id="md-btn-zen">🧘 Zen: OFF</button>
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
    <p>Runner Rítmico de 1 Botão • Cubo, Nave Banana, Wave & Bola Gravidade!</p>
  </div>

  <div class="md-skin-bar" id="md-skin-bar">
    <span class="md-skin-label">🐒 SKIN DO MACACO:</span>
  </div>

  <div class="md-lobby-panel" id="md-lobby-panel">
    <div class="md-lobby-top">
      <div class="md-lobby-title" id="md-lobby-title">🏁 LOBBY CORRIDA SINCRONIZADA P2P</div>
      <div class="md-lobby-controls">
        <select id="md-lobby-level-select" class="md-lobby-select"></select>
        <button id="md-lobby-start-btn" class="md-btn md-btn-race">🏁 Largada pra Todos (3-2-1!)</button>
      </div>
    </div>
    <div class="md-lobby-players" id="md-lobby-players"></div>
  </div>

  <div class="md-levels-grid" id="md-levels-grid"></div>

  <div class="md-menu-actions">
    <button class="md-btn md-btn-play" id="md-play-btn">▶ JOGAR SOLO</button>
    <button class="md-btn md-btn-split" id="md-2p-local-btn">👥 2P Local (Tela Dividida)</button>
    <button class="md-btn md-btn-cyan" id="md-practice-toggle">🧪 Modo Prática: OFF</button>
    <button class="md-btn" id="md-zen-toggle">🧘 Modo Zen: OFF</button>
    <button class="md-btn md-btn-gold" id="md-editor-btn">🛠️ Mini Editor</button>
    <button class="md-btn" id="md-play-custom-btn">🎮 Jogar Custom</button>
  </div>

  <div class="md-controls-hint">
    <strong>Solo / Online:</strong> <b>Espaço / Clique / W / Seta Cima</b> para Pular, Voar, Zigue-zaguear ou Inverter Gravidade •
    <strong>2P Local:</strong> J1 <b>W / Espaço</b> vs J2 <b>Seta Cima / Enter</b> •
    <b>P</b>: Prática • <b>Z</b>: Colocar CP • <b>X</b>: Remover CP • <b>B</b>: Buzina (3s cd) • <b>R</b>: Reiniciar
  </div>
`;
app.appendChild(menuOverlay);

// Synchronized Countdown Overlay
const countdownOverlay = document.createElement('div');
countdownOverlay.className = 'md-countdown-overlay';
countdownOverlay.innerHTML = `
  <div class="md-countdown-num" id="md-cd-num">3</div>
  <div class="md-countdown-sub" id="md-cd-sub">Prepare o dedo!</div>
`;
app.appendChild(countdownOverlay);

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
let selectedSkin: MonkeySkinId = loadSavedSkin();
let selectedLevelIdx = 0;
let activeLevel: LevelData = OFFICIAL_LEVELS[0];
let receivedCustomLevel: LevelData | null = null;
let testingFromEditor = false;
let testStartGx = 0;
let screenMode: ScreenMode = 'menu';
let playMode: PlayMode = 'solo';
let practiceMode = false;
let zenMode = false;

let r1: RunnerState = createRunner('#22d3ee', selectedSkin, 'P1 (W / Espaço)');
let r2: RunnerState | null = null;
let checkpoints: Checkpoint[] = [];
let autoCpTimer = 0;
let local2pScore = { p1: 0, p2: 0 };

let countdownTimer = 0;
let lastCountdownInt = -1;

let activeHorn: HornEvent | null = null;
let hornCooldown = 0;
let globalHornCooldown = 0;

// Multiplayer P2P Room & Session Scoreboard
const remotes = new Map<string, RemoteMonkeyState>();
const sessionWins = new Map<string, number>();
let netSyncTimer = 0;
let raceBoardTimer = 0;
let hudHandle: ReturnType<typeof mountMonkeyHud<DashNetMessage>>;

// Marker cache for shared progress bar
const markerEls = new Map<string, HTMLDivElement>();

const room = new PeerRoom<DashNetMessage>('monkey-dash', {
  onPlayersChange(players: PlayerProfile[]) {
    hudHandle.setPlayers(players);
    const activeIds = new Set(players.map((p) => p.id));
    for (const id of remotes.keys()) {
      if (!activeIds.has(id)) remotes.delete(id);
    }
    renderLobbyPanel();
    renderRaceBoard();
  },
  onMessage(env) {
    const msg = env.payload;
    if (!msg) return;

    if (msg.kind === 'state') {
      const prev = remotes.get(env.senderId);
      let trail = prev ? prev.trail.slice(-16) : [];
      const respawned = prev ? msg.x < prev.targetX - 100 || (!prev.alive && msg.alive) : true;
      if (respawned) {
        trail = [];
      }
      if (msg.alive) {
        trail.push({ x: msg.x + PLAYER_SIZE / 2, y: msg.y + PLAYER_SIZE / 2 });
      }
      remotes.set(env.senderId, {
        id: env.senderId,
        name: env.senderName,
        color: msg.color,
        skin: msg.skin ?? 'classic',
        levelId: msg.levelId,
        x: respawned || !prev ? msg.x : prev.x,
        y: respawned || !prev ? msg.y : prev.y,
        rot: respawned || !prev ? msg.rot : prev.rot,
        targetX: msg.x,
        targetY: msg.y,
        targetRot: msg.rot,
        form: msg.form,
        grav: msg.grav,
        alive: msg.alive,
        pct: msg.pct,
        trail,
        lastSeen: performance.now(),
        deathFlashAt: prev?.deathFlashAt ?? 0,
      });
    } else if (msg.kind === 'death') {
      const rem = remotes.get(env.senderId);
      if (rem) {
        rem.alive = false;
        rem.pct = msg.pct;
        rem.deathFlashAt = performance.now();
      }
      if (msg.levelId === activeLevel.id && playMode !== 'local_2p') {
        spawnExplosion(r1, msg.x, msg.y, msg.color, 18);
        r1.floatingTexts.push({
          x: msg.x,
          y: msg.y - 26,
          text: `💀 ${env.senderName} (${Math.floor(msg.pct)}%)`,
          color: '#fda4af',
          life: 1.5,
          maxLife: 1.5,
        });
      }
    } else if (msg.kind === 'win') {
      const prevWins = sessionWins.get(env.senderId) ?? 0;
      const nextWins = msg.wins ?? prevWins + 1;
      sessionWins.set(env.senderId, nextWins);
      const rem = remotes.get(env.senderId);
      if (rem) rem.pct = 100;
      hudHandle.toast(
        `🏆 ${env.senderName} venceu! (${nextWins} vitórias na sessão)`,
        'banana',
      );
      renderLobbyPanel();
      renderRaceBoard();
    } else if (msg.kind === 'horn') {
      if (!zenMode && globalHornCooldown <= 0) {
        globalHornCooldown = 3.0;
        triggerHornEffect(env.senderId, env.senderName, msg.emoji, msg.phrase);
      }
    } else if (msg.kind === 'race_lobby_select') {
      if (msg.selection.customLevel) {
        receivedCustomLevel = msg.selection.customLevel;
      }
      renderLobbyPanel();
      hudHandle.toast(`👑 Host selecionou: ${msg.selection.levelName}`, 'info');
    } else if (msg.kind === 'race_start') {
      hudHandle.toast(`🏁 Corrida sincronizada: ${msg.level.name}!`, 'banana');
      startSynchronizedRace(msg.level, msg.countdownSec || 3);
    } else if (msg.kind === 'share_level') {
      receivedCustomLevel = msg.level;
      saveCustomLevel(msg.level);
      renderLobbyPanel();
      hudHandle.toast(
        `📡 ${env.senderName} compartilhou a fase "${msg.level.name}"! Salva em Custom.`,
        'banana',
      );
    }
  },
});

hudHandle = mountMonkeyHud({
  slug: 'monkey-dash',
  title: 'Chimp Dash: Surto Rítmico',
  room,
});

// UI Element refs
const skinBar = document.getElementById('md-skin-bar')!;
const lobbyPanel = document.getElementById('md-lobby-panel')!;
const lobbyTitle = document.getElementById('md-lobby-title')!;
const lobbySelect = document.getElementById('md-lobby-level-select') as HTMLSelectElement;
const lobbyStartBtn = document.getElementById('md-lobby-start-btn') as HTMLButtonElement;
const lobbyPlayers = document.getElementById('md-lobby-players')!;

const levelsGrid = document.getElementById('md-levels-grid')!;
const playBtn = document.getElementById('md-play-btn')!;
const local2pBtn = document.getElementById('md-2p-local-btn')!;
const menuPracticeBtn = document.getElementById('md-practice-toggle')!;
const menuZenBtn = document.getElementById('md-zen-toggle')!;
const editorBtn = document.getElementById('md-editor-btn')!;
const playCustomBtn = document.getElementById('md-play-custom-btn')!;

const progFill = document.getElementById('md-prog-fill')!;
const progMarkers = document.getElementById('md-prog-markers')!;
const progText = document.getElementById('md-prog-text')!;
const btnPractice = document.getElementById('md-btn-practice')!;
const btnCp = document.getElementById('md-btn-cp')!;
const btnZen = document.getElementById('md-btn-zen')!;
const btnRestart = document.getElementById('md-btn-restart')!;
const btnMenu = document.getElementById('md-btn-menu')!;
const btnHorn = document.getElementById('md-btn-horn') as HTMLButtonElement;
const raceBoard = document.getElementById('md-race-board')!;

const cdNum = document.getElementById('md-cd-num')!;
const cdSub = document.getElementById('md-cd-sub')!;

const winTitle = document.getElementById('md-win-title')!;
const winSub = document.getElementById('md-win-sub')!;
const winAtt = document.getElementById('md-win-att')!;
const winBan = document.getElementById('md-win-ban')!;
const winPct = document.getElementById('md-win-pct')!;
const winReplay = document.getElementById('md-win-replay')!;
const winNext = document.getElementById('md-win-next')!;
const winMenu = document.getElementById('md-win-menu')!;

const editor = createLevelEditor(app, {
  onPlayTest(customLvl, startGx = 0) {
    testingFromEditor = true;
    testStartGx = startGx;
    playMode = 'solo';
    startLevel(customLvl, startGx);
  },
  onShareToRoom(customLvl) {
    if (!room.roomCode) {
      hudHandle.toast('Entre ou crie uma sala Co-op Online primeiro (canto superior esquerdo)!', 'info');
      return;
    }
    room.send('share_level', { kind: 'share_level', level: customLvl });
    hudHandle.toast(`📡 Fase "${customLvl.name}" enviada para toda a sala!`, 'banana');
  },
  onBackToMenu() {
    testingFromEditor = false;
    testStartGx = 0;
    openMenu();
  },
  onToast(msg, tone) {
    hudHandle.toast(msg, tone);
  },
});

function renderSkinBar(): void {
  // Keep label span, rebuild chips
  const label = skinBar.querySelector('.md-skin-label')!;
  skinBar.innerHTML = '';
  skinBar.appendChild(label);

  for (const sk of MONKEY_SKINS) {
    const btn = document.createElement('button');
    btn.className = `md-skin-chip ${sk.id === selectedSkin ? 'active' : ''}`;
    btn.title = sk.desc;
    btn.innerHTML = `<span>${sk.badge}</span><span>${sk.name}</span>`;
    btn.onclick = () => {
      monkeyAudio.play('click');
      selectedSkin = sk.id;
      saveSkin(selectedSkin);
      renderSkinBar();
    };
    skinBar.appendChild(btn);
  }
}

function getLobbyLevelOptions(): Array<{ key: string; label: string; level: LevelData }> {
  const opts: Array<{ key: string; label: string; level: LevelData }> = OFFICIAL_LEVELS.map((l, idx) => ({
    key: `official:${idx}`,
    label: `Fase ${idx + 1}: ${l.name} (${l.difficulty})`,
    level: l,
  }));
  const custom = loadSavedCustomLevel();
  opts.push({
    key: 'custom:local',
    label: `🛠️ Custom: ${custom.name}`,
    level: custom,
  });
  if (receivedCustomLevel && receivedCustomLevel.id !== custom.id) {
    opts.push({
      key: 'custom:received',
      label: `📡 Recebida: ${receivedCustomLevel.name}`,
      level: receivedCustomLevel,
    });
  }
  return opts;
}

function renderLobbyPanel(): void {
  const connected = Boolean(room.roomCode);
  lobbyPanel.classList.toggle('visible', connected);
  if (!connected) return;

  const isHost = room.localPlayer.isHost;
  const players = room.getPlayers();
  lobbyTitle.textContent = `🏁 LOBBY CORRIDA P2P • SALA ${room.roomCode} (${players.length} macaco${players.length === 1 ? '' : 's'})`;

  const opts = getLobbyLevelOptions();
  const prevVal = lobbySelect.value;
  lobbySelect.innerHTML = opts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
  if (opts.some((o) => o.key === prevVal)) {
    lobbySelect.value = prevVal;
  } else {
    lobbySelect.value = `official:${selectedLevelIdx}`;
  }

  lobbySelect.disabled = !isHost;
  lobbyStartBtn.style.display = isHost ? 'inline-flex' : 'none';
  if (!isHost) {
    lobbyStartBtn.disabled = true;
  } else {
    lobbyStartBtn.disabled = false;
  }

  lobbyPlayers.innerHTML = players
    .map((p) => {
      const wins = sessionWins.get(p.id) ?? 0;
      const isMe = p.id === room.localPlayer.id;
      return `
        <span class="md-lobby-player" style="border-color:${p.color};color:${p.color};">
          ${p.isHost ? '👑' : '🐒'} ${p.name}${isMe ? ' (Você)' : ''} • 🏆 ${wins}
        </span>
      `;
    })
    .join('');
}

lobbySelect.onchange = () => {
  if (!room.localPlayer.isHost) return;
  const opts = getLobbyLevelOptions();
  const chosen = opts.find((o) => o.key === lobbySelect.value);
  if (!chosen) return;
  const isOfficial = chosen.key.startsWith('official:');
  if (isOfficial) {
    selectedLevelIdx = Number(chosen.key.split(':')[1]) || 0;
    renderLevelCards();
  }
  room.send('race_lobby_select', {
    kind: 'race_lobby_select',
    selection: {
      levelId: chosen.level.id,
      levelName: chosen.level.name,
      customLevel: isOfficial ? undefined : chosen.level,
    },
  });
};

lobbyStartBtn.onclick = () => {
  if (!room.localPlayer.isHost) return;
  monkeyAudio.play('click');
  const opts = getLobbyLevelOptions();
  const chosen = opts.find((o) => o.key === lobbySelect.value) ?? opts[0];
  const lvl = chosen.level;
  room.send('race_start', {
    kind: 'race_start',
    level: lvl,
    countdownSec: 3,
    raceId: `${Date.now()}`,
  });
  startSynchronizedRace(lvl, 3);
};

function renderLevelCards(): void {
  levelsGrid.innerHTML = '';
  OFFICIAL_LEVELS.forEach((lvl, idx) => {
    const p = progressMap[lvl.id] ?? { bestPct: 0, completed: false, bestBananas: 0, attempts: 0 };
    const card = document.createElement('button');
    card.className = `md-level-card ${idx === selectedLevelIdx ? 'selected' : ''}`;
    card.style.setProperty('--card-accent', lvl.colorPrimary);
    const pracHint =
      p.practiceBestPct && p.practiceBestPct > p.bestPct
        ? ` <span style="color:#86efac;font-size:10px;">(Prát: ${Math.floor(p.practiceBestPct)}%)</span>`
        : '';
    card.innerHTML = `
      <div class="md-card-top">
        <span class="md-badge" style="color:${lvl.colorPrimary};border:1px solid ${lvl.colorPrimary};">${lvl.difficulty}</span>
        <span class="md-badge">🎵 ${lvl.bpm} BPM</span>
      </div>
      <div class="md-card-title">${p.completed ? '✅ ' : ''}${lvl.name}</div>
      <div class="md-card-sub">${lvl.subtitle}</div>
      <div class="md-card-bar"><div style="width:${Math.min(100, Math.floor(p.bestPct))}%;"></div></div>
      <div class="md-card-stats">
        <span>Recorde: ${Math.floor(p.bestPct)}%${pracHint}</span>
        <span>🍌 ${p.bestBananas}/3</span>
      </div>
    `;
    card.onclick = () => {
      monkeyAudio.play('click');
      selectedLevelIdx = idx;
      renderLevelCards();
      if (room.roomCode && room.localPlayer.isHost) {
        lobbySelect.value = `official:${idx}`;
      }
    };
    card.ondblclick = () => {
      testingFromEditor = false;
      testStartGx = 0;
      playMode = 'solo';
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
  btnPractice.style.display = playMode === 'local_2p' ? 'none' : 'inline-flex';
  btnCp.style.display = practiceMode && playMode !== 'local_2p' ? 'inline-flex' : 'none';
}

function syncZenUi(): void {
  const label = zenMode ? 'ON' : 'OFF';
  menuZenBtn.textContent = `🧘 Modo Zen: ${label}`;
  menuZenBtn.classList.toggle('zen-on', zenMode);
  btnZen.textContent = `🧘 Zen: ${label}`;
  btnZen.classList.toggle('zen-on', zenMode);
  if (zenMode) activeHorn = null;
}

function getCurrentPct(runner: RunnerState = r1): number {
  const totalPx = Math.max(1, activeLevel.lengthTiles * TILE);
  return Math.max(0, Math.min(100, (runner.player.x / totalPx) * 100));
}

function renderRaceBoard(): void {
  if (playMode === 'local_2p') {
    raceBoard.classList.add('visible');
    raceBoard.innerHTML = `
      <div class="md-race-row" style="color:${r1.color};">
        <span>🟦 P1 (W/Espaço)</span>
        <span>${Math.floor(getCurrentPct(r1))}% • 🏆 ${local2pScore.p1}</span>
      </div>
      <div class="md-race-row" style="color:${r2?.color ?? '#fb7185'};">
        <span>🟥 P2 (↑/Enter)</span>
        <span>${r2 ? Math.floor(getCurrentPct(r2)) : 0}% • 🏆 ${local2pScore.p2}</span>
      </div>
    `;
    return;
  }

  const players = room.getPlayers();
  if (players.length <= 1 && remotes.size === 0) {
    raceBoard.classList.remove('visible');
    return;
  }
  raceBoard.classList.add('visible');
  const entries: Array<{ name: string; color: string; pct: number; wins: number; isLocal: boolean }> = [
    {
      name: room.localPlayer.name,
      color: room.localPlayer.color,
      pct: getCurrentPct(r1),
      wins: sessionWins.get(room.localPlayer.id) ?? 0,
      isLocal: true,
    },
  ];
  for (const r of remotes.values()) {
    entries.push({
      name: r.name,
      color: r.color,
      pct: r.levelId === activeLevel.id ? r.pct : 0,
      wins: sessionWins.get(r.id) ?? 0,
      isLocal: false,
    });
  }
  entries.sort((a, b) => b.pct - a.pct || b.wins - a.wins);
  raceBoard.innerHTML = entries
    .map(
      (e, i) => `
    <div class="md-race-row" style="color:${e.color};">
      <span>${i === 0 ? '👑 ' : ''}${e.name}${e.isLocal ? ' (Você)' : ''}</span>
      <span>${Math.floor(e.pct)}% • 🏆${e.wins}</span>
    </div>
  `,
    )
    .join('');
}

function updateProgressBarMarkers(now: number): void {
  const desiredIds = new Set<string>();

  if (playMode === 'local_2p' && r2) {
    const runners = [
      { id: 'p1', label: 'P1', color: r1.color, pct: getCurrentPct(r1), dead: !r1.player.alive, isLocal: true },
      { id: 'p2', label: 'P2', color: r2.color, pct: getCurrentPct(r2), dead: !r2.player.alive, isLocal: true },
    ];
    for (const item of runners) {
      desiredIds.add(item.id);
      let el = markerEls.get(item.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'md-prog-marker local';
        progMarkers.appendChild(el);
        markerEls.set(item.id, el);
      }
      el.style.left = `${Math.max(2, Math.min(98, item.pct))}%`;
      el.style.background = item.color;
      el.classList.toggle('dead', item.dead);
      el.textContent = item.dead ? '💥' : item.label;
    }
  } else {
    const localId = room.localPlayer.id;
    desiredIds.add(localId);
    let localEl = markerEls.get(localId);
    if (!localEl) {
      localEl = document.createElement('div');
      localEl.className = 'md-prog-marker local';
      progMarkers.appendChild(localEl);
      markerEls.set(localId, localEl);
    }
    const localPct = getCurrentPct(r1);
    localEl.style.left = `${Math.max(2, Math.min(98, localPct))}%`;
    localEl.style.background = room.localPlayer.color;
    localEl.classList.toggle('dead', !r1.player.alive);
    localEl.textContent = !r1.player.alive ? '💥' : '🐒';

    for (const r of remotes.values()) {
      if (r.levelId !== activeLevel.id) continue;
      desiredIds.add(r.id);
      let el = markerEls.get(r.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'md-prog-marker';
        progMarkers.appendChild(el);
        markerEls.set(r.id, el);
      }
      const isExploding = !r.alive || now - r.deathFlashAt < 500;
      el.style.left = `${Math.max(2, Math.min(98, r.pct))}%`;
      el.style.background = r.color;
      el.classList.toggle('dead', isExploding);
      el.textContent = isExploding ? '💥' : r.name.slice(0, 2).toUpperCase();
      el.title = `${r.name} (${Math.floor(r.pct)}%)`;
    }
  }

  for (const [id, el] of markerEls) {
    if (!desiredIds.has(id)) {
      el.remove();
      markerEls.delete(id);
    }
  }
}

function spawnExplosion(runner: RunnerState, cx: number, cy: number, color: string, count = 26): void {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 120 + Math.random() * 440;
    const isBanana = i % 4 === 0;
    runner.particles.push({
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

function spawnPortalBurst(runner: RunnerState, cx: number, cy: number, color: string): void {
  runner.particles.push({
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    size: 12,
    color,
    life: 0.42,
    maxLife: 0.42,
    rot: 0,
    vrot: 0,
    kind: 'ring',
  });
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const spd = 140 + Math.random() * 240;
    runner.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      size: 4 + Math.random() * 4,
      color: i % 3 === 0 ? '#ffffff' : color,
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.6,
      rot: ang,
      vrot: (Math.random() - 0.5) * 10,
      kind: 'spark',
    });
  }
}

function triggerHornEffect(senderId: string, senderName: string, emoji: string, phrase: string): void {
  if (zenMode) return;
  dashAudio.playHorn();
  r1.shakeAmount = Math.max(r1.shakeAmount, 7);
  if (r2) r2.shakeAmount = Math.max(r2.shakeAmount, 7);
  activeHorn = {
    senderId,
    senderName,
    emoji,
    phrase,
    startedAt: performance.now(),
  };
}

function fireLocalHorn(): void {
  if (hornCooldown > 0 || globalHornCooldown > 0) return;
  hornCooldown = 4;
  globalHornCooldown = 3.0;
  const meme = HORN_MEMES[Math.floor(Math.random() * HORN_MEMES.length)];
  triggerHornEffect(room.localPlayer.id, room.localPlayer.name, meme.emoji, meme.phrase);
  room.send('horn', { kind: 'horn', emoji: meme.emoji, phrase: meme.phrase });
}

function setupLevelEntities(lvl: LevelData, startGx = 0): void {
  activeLevel = lvl;
  checkpoints = [];
  autoCpTimer = 0;
  const startX = startGx > 0 ? Math.max(40, startGx * TILE) : 40;

  if (playMode === 'local_2p') {
    practiceMode = false;
    r1 = createRunner('#22d3ee', selectedSkin, 'P1 • W / Espaço', startX, lvl);
    const p2Skin: MonkeySkinId = selectedSkin === 'shades' ? 'crown' : 'shades';
    r2 = createRunner('#fb7185', p2Skin, 'P2 • ↑ / Enter', startX, lvl);
  } else {
    r1 = createRunner(room.localPlayer.color, selectedSkin, '', startX, lvl);
    r2 = null;
  }

  menuOverlay.style.display = 'none';
  winOverlay.style.display = 'none';
  topHud.style.display = 'flex';
  btnMenu.textContent = testingFromEditor ? '⬅ Editor (Esc)' : '⬅ Menu (Esc)';
  syncPracticeUi();
  syncZenUi();
  renderRaceBoard();
}

function startLevel(lvl: LevelData, startGx = 0): void {
  dashAudio.unlock();
  testStartGx = startGx;
  countdownOverlay.style.display = 'none';
  setupLevelEntities(lvl, startGx);
  screenMode = 'playing';
  dashAudio.startMusic(lvl.songId, lvl.bpm, 0);
}

function startSynchronizedRace(lvl: LevelData, countdownSec: number): void {
  dashAudio.unlock();
  testingFromEditor = false;
  testStartGx = 0;
  practiceMode = false;
  playMode = 'online_race';
  setupLevelEntities(lvl, 0);
  screenMode = 'countdown';
  countdownTimer = Math.max(1, countdownSec);
  lastCountdownInt = -1;
  countdownOverlay.style.display = 'flex';
  cdSub.textContent = `${lvl.name} • Corrida Sincronizada!`;
  dashAudio.stopMusic();
}

function openMenu(): void {
  screenMode = 'menu';
  playMode = 'solo';
  countdownOverlay.style.display = 'none';
  dashAudio.stopMusic();
  topHud.style.display = 'none';
  winOverlay.style.display = 'none';
  menuOverlay.style.display = 'flex';
  renderSkinBar();
  renderLobbyPanel();
  renderLevelCards();
}

function resetRunnerAttempt(runner: RunnerState, fullRestart = false, isPrimary = true): void {
  runner.respawnTimer = 0;
  runner.inputHeld = false;
  runner.justPressedFlag = false;
  runner.jumpBuffer = 0;
  runner.orbBuffer = 0;
  runner.coyoteTimer = 0;

  if (playMode !== 'local_2p' && isPrimary) {
    autoCpTimer = 0;
    if (fullRestart || !practiceMode || checkpoints.length === 0) {
      if (fullRestart) checkpoints = [];
      const startX = testStartGx > 0 ? Math.max(40, testStartGx * TILE) : 40;
      const fresh = createRunner(runner.color, runner.skin, runner.badge, startX, activeLevel);
      runner.player = fresh.player;
      dashAudio.startMusic(activeLevel.songId, activeLevel.bpm, 0);
    } else {
      const cp = checkpoints[checkpoints.length - 1];
      runner.player = restoreFromCheckpoint(cp);
      dashAudio.startMusic(activeLevel.songId, activeLevel.bpm, cp.songBeatOffset);
    }
  } else {
    const fresh = createRunner(runner.color, runner.skin, runner.badge, 40, activeLevel);
    runner.player = fresh.player;
  }
  runner.cameraX = getTargetCamX(runner.player.x);
}

function handleRunnerDeath(runner: RunnerState, cx: number, cy: number, isPrimary: boolean): void {
  const pct = getCurrentPct(runner);
  dashAudio.playDeath();
  runner.shakeAmount = 11;
  spawnExplosion(runner, cx, cy, runner.color, 30);

  const phrase = pickRagePhrase(pct);
  runner.deathBanner = phrase;
  runner.deathBannerTimer = 1.45; // Visible for ~1.45s across instant respawn!
  runner.respawnTimer = RESPAWN_DELAY;

  if (playMode === 'local_2p' || !isPrimary) return;

  const prev = progressMap[activeLevel.id] ?? {
    bestPct: 0,
    practiceBestPct: 0,
    completed: false,
    bestBananas: 0,
    attempts: 0,
  };

  if (practiceMode) {
    // Practice mode NEVER pollutes official bestPct, bestBananas, or score
    progressMap[activeLevel.id] = {
      ...prev,
      practiceBestPct: Math.max(prev.practiceBestPct ?? 0, pct),
    };
    saveProgressMap(progressMap);
  } else {
    const improved = pct > prev.bestPct;
    progressMap[activeLevel.id] = {
      ...prev,
      bestPct: Math.max(prev.bestPct, pct),
      bestBananas: Math.max(prev.bestBananas, runner.player.collectedBananas.size),
      attempts: prev.attempts + 1,
    };
    saveProgressMap(progressMap);
    if (improved) {
      reportGameScore('monkey-dash', computeTotalScore(progressMap), {
        lastLevel: activeLevel.id,
        bestPct: Math.floor(pct),
      });
    }
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

function handleLevelWin(winnerRunner: RunnerState, winnerLabel?: string): void {
  screenMode = 'paused_win';
  dashAudio.playWin();
  spawnExplosion(
    winnerRunner,
    winnerRunner.player.x + PLAYER_SIZE / 2,
    winnerRunner.player.y + PLAYER_SIZE / 2,
    '#facc15',
    40,
  );

  const totalBananas = activeLevel.objects.filter((o) => o.type === 'banana').length;

  if (playMode === 'local_2p') {
    if (winnerLabel === 'P1') local2pScore.p1++;
    else local2pScore.p2++;

    winTitle.textContent = `🏆 ${winnerLabel === 'P1' ? 'JOGADOR 1' : 'JOGADOR 2'} VENCEU!`;
    winSub.textContent = `${activeLevel.name} • Placar 2P: P1 (${local2pScore.p1}) x (${local2pScore.p2}) P2`;
    winAtt.textContent = `${r1.attempts} vs ${r2?.attempts ?? 1}`;
    winBan.textContent = `${winnerRunner.player.collectedBananas.size}/${totalBananas}`;
    winPct.textContent = '100%';
    renderRaceBoard();
  } else {
    const prev = progressMap[activeLevel.id] ?? {
      bestPct: 0,
      practiceBestPct: 0,
      completed: false,
      bestBananas: 0,
      attempts: 0,
    };

    if (practiceMode) {
      progressMap[activeLevel.id] = {
        ...prev,
        practiceBestPct: 100,
      };
      saveProgressMap(progressMap);
    } else {
      progressMap[activeLevel.id] = {
        ...prev,
        bestPct: 100,
        completed: true,
        bestBananas: Math.max(prev.bestBananas, winnerRunner.player.collectedBananas.size),
        attempts: prev.attempts + 1,
      };
      saveProgressMap(progressMap);

      const totalScore = computeTotalScore(progressMap);
      reportGameScore('monkey-dash', totalScore, {
        lastLevel: activeLevel.id,
        completed: 1,
      });
    }

    if (room.roomCode) {
      const nextWins = (sessionWins.get(room.localPlayer.id) ?? 0) + 1;
      sessionWins.set(room.localPlayer.id, nextWins);
      // Immediate pct: 100 state + win broadcast
      room.send('state', {
        kind: 'state',
        levelId: activeLevel.id,
        x: activeLevel.lengthTiles * TILE,
        y: winnerRunner.player.y,
        rot: winnerRunner.player.rot,
        form: winnerRunner.player.form,
        grav: winnerRunner.player.grav,
        alive: true,
        pct: 100,
        color: room.localPlayer.color,
        skin: selectedSkin,
      });
      room.send('win', {
        kind: 'win',
        levelId: activeLevel.id,
        attempts: winnerRunner.attempts,
        wins: nextWins,
      });
      renderLobbyPanel();
      renderRaceBoard();
    }

    winTitle.textContent = practiceMode ? '🧪 TREINO CONCLUÍDO!' : '🏆 FASE ZERADA!';
    winSub.textContent = practiceMode
      ? `${activeLevel.name} (Modo Prática — não conta no recorde oficial!)`
      : `${activeLevel.name} — Surto Rítmico dominado com sucesso!`;
    winAtt.textContent = String(winnerRunner.attempts);
    winBan.textContent = `${winnerRunner.player.collectedBananas.size}/${totalBananas}`;
    winPct.textContent = '100%';
  }

  const officialIdx = OFFICIAL_LEVELS.findIndex((l) => l.id === activeLevel.id);
  winNext.style.display = officialIdx >= 0 && officialIdx < OFFICIAL_LEVELS.length - 1 ? 'inline-flex' : 'none';
  winOverlay.style.display = 'flex';
}

function placeManualCheckpoint(): void {
  if (!practiceMode || playMode === 'local_2p' || screenMode !== 'playing' || !r1.player.alive) return;
  const cp = snapshotCheckpoint(r1.player, dashAudio.getCurrentBeatCount());
  checkpoints.push(cp);
  if (checkpoints.length > 40) checkpoints.shift();
  dashAudio.playCheckpoint();
  r1.floatingTexts.push({
    x: r1.player.x + PLAYER_SIZE / 2,
    y: r1.player.y - 16,
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
  testStartGx = 0;
  playMode = room.roomCode ? 'online_race' : 'solo';
  startLevel(OFFICIAL_LEVELS[selectedLevelIdx]);
};

local2pBtn.onclick = () => {
  monkeyAudio.play('click');
  testingFromEditor = false;
  testStartGx = 0;
  playMode = 'local_2p';
  startLevel(OFFICIAL_LEVELS[selectedLevelIdx]);
};

menuPracticeBtn.onclick = () => {
  monkeyAudio.play('click');
  practiceMode = !practiceMode;
  syncPracticeUi();
};

menuZenBtn.onclick = () => {
  monkeyAudio.play('click');
  zenMode = !zenMode;
  syncZenUi();
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
  testStartGx = 0;
  playMode = room.roomCode ? 'online_race' : 'solo';
  startLevel(loadSavedCustomLevel());
};

btnPractice.onclick = () => {
  monkeyAudio.play('click');
  if (playMode === 'local_2p') return;
  practiceMode = !practiceMode;
  if (!practiceMode) checkpoints = [];
  syncPracticeUi();
};

btnZen.onclick = () => {
  monkeyAudio.play('click');
  zenMode = !zenMode;
  syncZenUi();
};

btnCp.onclick = () => placeManualCheckpoint();

btnRestart.onclick = () => {
  monkeyAudio.play('click');
  r1.attempts++;
  resetRunnerAttempt(r1, true, true);
  if (r2) {
    r2.attempts++;
    resetRunnerAttempt(r2, true, false);
  }
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
  startLevel(activeLevel, testStartGx);
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

// Input Helpers
function pushRunnerInputDown(runner: RunnerState): void {
  dashAudio.unlock();
  if (screenMode !== 'playing') return;
  if (!runner.inputHeld) {
    runner.justPressedFlag = true;
    runner.jumpBuffer = 0.14;
    runner.orbBuffer = 0.18;
  }
  runner.inputHeld = true;
}

function pushRunnerInputUp(runner: RunnerState): void {
  runner.inputHeld = false;
}

window.addEventListener('keydown', (e) => {
  if (editor.isOpen()) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (playMode === 'local_2p' && r2) {
    if (e.code === 'Space' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) pushRunnerInputDown(r1);
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) pushRunnerInputDown(r2);
      return;
    }
  } else {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) pushRunnerInputDown(r1);
      return;
    }
  }

  if (e.code === 'KeyB') {
    fireLocalHorn();
  } else if (e.code === 'KeyP' && screenMode === 'playing' && playMode !== 'local_2p') {
    practiceMode = !practiceMode;
    if (!practiceMode) checkpoints = [];
    syncPracticeUi();
    hudHandle.toast(`Modo Prática: ${practiceMode ? 'ATIVADO 🧪' : 'DESATIVADO'}`, 'info');
  } else if (e.code === 'KeyZ' && screenMode === 'playing' && playMode !== 'local_2p') {
    placeManualCheckpoint();
  } else if (e.code === 'KeyX' && screenMode === 'playing' && playMode !== 'local_2p' && checkpoints.length > 0) {
    checkpoints.pop();
    monkeyAudio.play('click');
    hudHandle.toast(`Checkpoint removido (${checkpoints.length} restantes)`, 'info');
  } else if (e.code === 'KeyR' && (screenMode === 'playing' || screenMode === 'paused_win')) {
    winOverlay.style.display = 'none';
    screenMode = 'playing';
    r1.attempts++;
    resetRunnerAttempt(r1, e.shiftKey, true);
    if (r2) {
      r2.attempts++;
      resetRunnerAttempt(r2, true, false);
    }
  } else if (e.code === 'Escape' && (screenMode === 'playing' || screenMode === 'paused_win')) {
    btnMenu.click();
  }
});

window.addEventListener('keyup', (e) => {
  if (playMode === 'local_2p' && r2) {
    if (e.code === 'Space' || e.code === 'KeyW') {
      pushRunnerInputUp(r1);
    } else if (e.code === 'ArrowUp' || e.code === 'Enter') {
      pushRunnerInputUp(r2);
    }
  } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    pushRunnerInputUp(r1);
  }
});

const pointerRunnerMap = new Map<number, RunnerState>();
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (playMode === 'local_2p' && r2) {
    const isTopHalf = e.clientY < window.innerHeight * 0.5;
    const target = isTopHalf ? r1 : r2;
    pointerRunnerMap.set(e.pointerId, target);
    pushRunnerInputDown(target);
  } else {
    pointerRunnerMap.set(e.pointerId, r1);
    pushRunnerInputDown(r1);
  }
});
window.addEventListener('pointerup', (e) => {
  const target = pointerRunnerMap.get(e.pointerId);
  if (target) {
    pushRunnerInputUp(target);
    pointerRunnerMap.delete(e.pointerId);
  } else {
    pushRunnerInputUp(r1);
    if (r2) pushRunnerInputUp(r2);
  }
});
window.addEventListener('pointercancel', (e) => {
  const target = pointerRunnerMap.get(e.pointerId);
  if (target) {
    pushRunnerInputUp(target);
    pointerRunnerMap.delete(e.pointerId);
  }
});

// HiDPI Canvas Resize
let currentDpr = Math.min(2, window.devicePixelRatio || 1);
function resize(): void {
  currentDpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(320, Math.floor(window.innerWidth * currentDpr));
  canvas.height = Math.max(240, Math.floor(window.innerHeight * currentDpr));
}
window.addEventListener('resize', resize);
resize();

// Initialize Menu
renderSkinBar();
renderLobbyPanel();
renderLevelCards();
syncPracticeUi();
syncZenUi();

function stepRunnerFixed(runner: RunnerState, isPrimary: boolean): 'won' | null {
  if (runner.deathBannerTimer > 0) {
    runner.deathBannerTimer = Math.max(0, runner.deathBannerTimer - FIXED_DT);
    if (runner.deathBannerTimer <= 0) runner.deathBanner = null;
  }

  if (runner.player.alive) {
    const wasOnGround = runner.player.onGround;
    if (wasOnGround) runner.coyoteTimer = 0.06;
    else runner.coyoteTimer = Math.max(0, runner.coyoteTimer - FIXED_DT);

    runner.jumpBuffer = Math.max(0, runner.jumpBuffer - FIXED_DT);
    runner.orbBuffer = Math.max(0, runner.orbBuffer - FIXED_DT);

    const { events, consumedJump, consumedOrb } = stepPhysics(runner.player, activeLevel, FIXED_DT, {
      held: runner.inputHeld,
      justPressed: runner.justPressedFlag,
      jumpBuffer: runner.jumpBuffer,
      orbBuffer: runner.orbBuffer,
      coyoteTimer: runner.coyoteTimer,
    });

    runner.justPressedFlag = false;
    if (consumedJump) {
      runner.jumpBuffer = 0;
      runner.coyoteTimer = 0;
      runner.orbBuffer = 0;
    }
    if (consumedOrb) {
      runner.orbBuffer = 0;
    }

    if (events.jumped) dashAudio.playJump();
    if (events.pad) dashAudio.playPad();
    if (events.orb) dashAudio.playOrb();
    if (events.portal) {
      dashAudio.playPortal();
      spawnPortalBurst(runner, events.portal.x, events.portal.y, events.portal.color);
      runner.floatingTexts.push({
        x: runner.player.x + PLAYER_SIZE / 2,
        y: runner.player.y - 20,
        text: events.portal.label,
        color: events.portal.color,
        life: 1.0,
        maxLife: 1.0,
      });
    }
    if (events.banana) {
      dashAudio.playBanana();
      spawnExplosion(runner, events.banana.x, events.banana.y, '#fde047', 12);
      runner.floatingTexts.push({
        x: events.banana.x,
        y: events.banana.y - 16,
        text: '🍌 +1 BANANA!',
        color: '#fde047',
        life: 0.9,
        maxLife: 0.9,
      });
    }
    if (events.died) {
      handleRunnerDeath(runner, events.died.x, events.died.y, isPrimary);
    } else if (events.won) {
      return 'won';
    }

    // Ship exhaust sparks
    if (runner.player.alive && runner.player.form === 'ship' && Math.random() < 0.75) {
      runner.particles.push({
        x: runner.player.x + 2,
        y: runner.player.y + PLAYER_SIZE * 0.65,
        vx: -120 - Math.random() * 110,
        vy: (Math.random() - 0.5) * 90,
        size: 3 + Math.random() * 4,
        color: runner.inputHeld ? '#facc15' : '#fb7185',
        life: 0.25,
        maxLife: 0.25,
        rot: 0,
        vrot: 4,
        kind: 'spark',
      });
    }

    // Practice auto-checkpoint every 3.5s (avoiding <0.5s near spikes!)
    if (isPrimary && practiceMode && playMode !== 'local_2p' && runner.player.alive) {
      autoCpTimer += FIXED_DT;
      if (
        autoCpTimer >= 3.5 &&
        (runner.player.onGround || runner.player.form === 'ship' || runner.player.form === 'wave') &&
        !isNearSpike(runner.player.x, activeLevel, 0.5, runner.player.speedMult)
      ) {
        autoCpTimer = 0;
        checkpoints.push(snapshotCheckpoint(runner.player, dashAudio.getCurrentBeatCount()));
        if (checkpoints.length > 40) checkpoints.shift();
      }
    }
  } else {
    runner.respawnTimer -= FIXED_DT;
    if (runner.respawnTimer <= 0) {
      runner.attempts++;
      resetRunnerAttempt(runner, false, isPrimary);
    }
  }

  // Particles & Floating text update
  for (let i = runner.particles.length - 1; i >= 0; i--) {
    const p = runner.particles[i];
    p.life -= FIXED_DT;
    if (p.life <= 0) {
      runner.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * FIXED_DT;
    p.y += p.vy * FIXED_DT;
    if (p.kind !== 'ring') {
      p.vy += 680 * FIXED_DT;
      if (p.y > GROUND_Y) {
        p.y = GROUND_Y;
        p.vy *= -0.45;
      }
    }
    p.rot += p.vrot * FIXED_DT;
  }

  for (let i = runner.floatingTexts.length - 1; i >= 0; i--) {
    const ft = runner.floatingTexts[i];
    ft.life -= FIXED_DT;
    ft.y -= 36 * FIXED_DT;
    if (ft.life <= 0) runner.floatingTexts.splice(i, 1);
  }

  return null;
}

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
  if (globalHornCooldown > 0) {
    globalHornCooldown = Math.max(0, globalHornCooldown - frameDt);
  }

  r1.shakeAmount = Math.max(0, r1.shakeAmount - frameDt * 28);
  if (r2) r2.shakeAmount = Math.max(0, r2.shakeAmount - frameDt * 28);

  // Interpolate remote monkeys smoothly & prune stale ghosts (>2.5s)
  for (const [id, r] of remotes) {
    if (now - r.lastSeen > 2500) {
      remotes.delete(id);
      continue;
    }
    if (Math.abs(r.targetX - r.x) > 180) {
      r.x = r.targetX;
      r.y = r.targetY;
      r.rot = r.targetRot;
    } else {
      const k = Math.min(1, frameDt * 20);
      r.x += (r.targetX - r.x) * k;
      r.y += (r.targetY - r.y) * k;
      r.rot += (r.targetRot - r.rot) * k;
    }
  }

  if (screenMode === 'menu') {
    r1.cameraX += 110 * frameDt;
    if (r1.cameraX > OFFICIAL_LEVELS[selectedLevelIdx].lengthTiles * TILE) r1.cameraX = 0;
    renderGameFrame(ctx, canvas.width, canvas.height, {
      level: OFFICIAL_LEVELS[selectedLevelIdx],
      player: { ...createInitialPlayer(), x: r1.cameraX + 180, alive: false },
      cameraX: r1.cameraX,
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
      localSkin: selectedSkin,
      dpr: currentDpr,
      zenMode,
    });
    requestAnimationFrame(tick);
    return;
  }

  if (screenMode === 'countdown') {
    countdownTimer -= frameDt;
    const ceilVal = Math.max(0, Math.ceil(countdownTimer));
    if (ceilVal !== lastCountdownInt) {
      lastCountdownInt = ceilVal;
      if (ceilVal > 0) {
        cdNum.textContent = String(ceilVal);
        dashAudio.playCountdownBeep(false);
      }
    }
    if (countdownTimer <= 0) {
      countdownOverlay.style.display = 'none';
      screenMode = 'playing';
      dashAudio.playCountdownBeep(true);
      dashAudio.startMusic(activeLevel.songId, activeLevel.bpm, 0);
    }

    renderGameFrame(ctx, canvas.width, canvas.height, {
      level: activeLevel,
      player: r1.player,
      cameraX: r1.cameraX,
      beatPulse: 0.2,
      timeSec: now / 1000,
      shakeAmount: 0,
      particles: [],
      floatingTexts: [],
      checkpoints: [],
      remotes: Array.from(remotes.values()),
      activeHorn: null,
      deathBanner: null,
      localColor: r1.color,
      localName: room.localPlayer.name,
      localSkin: r1.skin,
      dpr: currentDpr,
      zenMode,
    });
    requestAnimationFrame(tick);
    return;
  }

  if (screenMode === 'playing') {
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;

      const res1 = stepRunnerFixed(r1, true);
      if (res1 === 'won') {
        handleLevelWin(r1, 'P1');
        break;
      }

      if (playMode === 'local_2p' && r2) {
        const res2 = stepRunnerFixed(r2, false);
        if (res2 === 'won') {
          handleLevelWin(r2, 'P2');
          break;
        }
      }
    }

    // Smooth camera tracking
    r1.cameraX += (getTargetCamX(r1.player.x) - r1.cameraX) * Math.min(1, frameDt * 18);
    if (r2) {
      r2.cameraX += (getTargetCamX(r2.player.x) - r2.cameraX) * Math.min(1, frameDt * 18);
    }

    // Update top HUD & Shared Progress Bar
    const pct1 = getCurrentPct(r1);
    if (playMode === 'local_2p' && r2) {
      const pct2 = getCurrentPct(r2);
      progFill.style.width = `${Math.max(pct1, pct2).toFixed(1)}%`;
      progText.textContent = `P1: ${Math.floor(pct1)}% vs P2: ${Math.floor(pct2)}% • Placar: ${local2pScore.p1} x ${local2pScore.p2}`;
    } else {
      progFill.style.width = `${pct1.toFixed(1)}%`;
      progText.textContent = `${Math.floor(pct1)}% • Tentativa #${r1.attempts}${practiceMode ? ` • 💎 ${checkpoints.length}` : ''}`;
    }
    updateProgressBarMarkers(now);

    // Network state broadcast at 20Hz & RaceBoard throttle at 4Hz
    netSyncTimer += frameDt;
    if (netSyncTimer >= 0.05) {
      netSyncTimer = 0;
      if (room.roomCode && playMode !== 'local_2p') {
        room.send('state', {
          kind: 'state',
          levelId: activeLevel.id,
          x: r1.player.x,
          y: r1.player.y,
          rot: r1.player.rot,
          form: r1.player.form,
          grav: r1.player.grav,
          alive: r1.player.alive,
          pct: pct1,
          color: room.localPlayer.color,
          skin: selectedSkin,
        });
      }
    }

    raceBoardTimer += frameDt;
    if (raceBoardTimer >= 0.25) {
      raceBoardTimer = 0;
      renderRaceBoard();
    }
  }

  if (screenMode === 'playing' || screenMode === 'paused_win') {
    const beatPulse = dashAudio.getBeatPulse();
    const cssW = canvas.width / currentDpr;
    const cssH = canvas.height / currentDpr;

    if (playMode === 'local_2p' && r2) {
      const halfH = cssH / 2 - 2;
      renderGameFrame(ctx, canvas.width, canvas.height, {
        level: activeLevel,
        player: r1.player,
        cameraX: r1.cameraX,
        beatPulse,
        timeSec: now / 1000,
        shakeAmount: r1.shakeAmount,
        particles: r1.particles,
        floatingTexts: r1.floatingTexts,
        checkpoints: [],
        remotes: [],
        activeHorn: null,
        deathBanner: r1.deathBanner,
        localColor: r1.color,
        localName: 'Jogador 1',
        localSkin: r1.skin,
        dpr: currentDpr,
        viewport: { x: 0, y: 0, w: cssW, h: halfH },
        playerBadge: r1.badge,
        zenMode,
        hideRemotes: true,
      });

      renderGameFrame(ctx, canvas.width, canvas.height, {
        level: activeLevel,
        player: r2.player,
        cameraX: r2.cameraX,
        beatPulse,
        timeSec: now / 1000,
        shakeAmount: r2.shakeAmount,
        particles: r2.particles,
        floatingTexts: r2.floatingTexts,
        checkpoints: [],
        remotes: [],
        activeHorn: null,
        deathBanner: r2.deathBanner,
        localColor: r2.color,
        localName: 'Jogador 2',
        localSkin: r2.skin,
        dpr: currentDpr,
        viewport: { x: 0, y: halfH + 4, w: cssW, h: halfH },
        playerBadge: r2.badge,
        zenMode,
        hideRemotes: true,
      });

      // Glowing split-screen divider bar
      ctx.save();
      ctx.scale(currentDpr, currentDpr);
      ctx.fillStyle = '#facc15';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 12;
      ctx.fillRect(0, halfH, cssW, 4);
      ctx.restore();
    } else {
      renderGameFrame(ctx, canvas.width, canvas.height, {
        level: activeLevel,
        player: r1.player,
        cameraX: r1.cameraX,
        beatPulse,
        timeSec: now / 1000,
        shakeAmount: r1.shakeAmount,
        particles: r1.particles,
        floatingTexts: r1.floatingTexts,
        checkpoints,
        remotes: Array.from(remotes.values()),
        activeHorn,
        deathBanner: r1.deathBanner,
        localColor: r1.color,
        localName: room.localPlayer.name,
        localSkin: r1.skin,
        dpr: currentDpr,
        zenMode,
      });
    }
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
