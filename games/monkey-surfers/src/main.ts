import './styles.css';
import {
  getGameScore,
  monkeyAudio,
  mountMonkeyHud,
  PeerRoom,
  reportGameScore,
  type PlayerProfile,
} from '@monkey-slop/sdk';
import { surfersAudio } from './audio';
import { SurfersEngine, type RunSummary } from './game';
import {
  GAME_SLUG,
  HOVER_BOARDS,
  MISSION_POOL,
  MONKEY_SKINS,
  TAUNT_PHRASES,
  loadSave,
  persistSave,
  type BoardId,
  type RemoteSurferState,
  type SkinId,
  type SurferNetMessage,
} from './types';

type ScreenState = 'title' | 'countdown' | 'playing' | 'gameover' | 'shop';
type ShopTab = 'skins' | 'boards' | 'missions';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

const save = loadSave();
const sdkRecord = getGameScore(GAME_SLUG);
if (sdkRecord.bestScore > save.bestScore) {
  save.bestScore = sdkRecord.bestScore;
  persistSave(save);
}

let screen: ScreenState = 'title';
let shopTab: ShopTab = 'skins';
let lastRun: RunSummary | null = null;
let countdownVal = 0;
let countdownTimer = 0;
let pendingSeed = 0;

// Multiplayer state
const remoteSurfers = new Map<string, RemoteSurferState>();
const sessionWins = new Map<string, number>();
let isVersusRound = false;
let roundWinnerAnnounced = false;
let currentRoundId = 0;
let lastNetSend = 0;

const room = new PeerRoom<SurferNetMessage>(GAME_SLUG, {
  onPlayersChange: (players: PlayerProfile[]) => {
    hud.setPlayers(players);
    // Clean up disconnected players
    const ids = new Set(players.map((p) => p.id));
    for (const key of Array.from(remoteSurfers.keys())) {
      if (!ids.has(key)) remoteSurfers.delete(key);
    }
    for (const p of players) {
      if (p.id === room.localPlayer.id) continue;
      if (!remoteSurfers.has(p.id)) {
        remoteSurfers.set(p.id, {
          id: p.id,
          name: p.name,
          color: p.color,
          skin: 'grafiteiro',
          distance: 0,
          laneX: 0,
          y: 0,
          rolling: false,
          jetpack: false,
          board: false,
          alive: false,
          score: 0,
          lastUpdated: performance.now(),
        });
      }
    }
    if (screen === 'title' || screen === 'gameover') renderOverlay();
  },
  onMessage: (env) => {
    const msg = env.payload;
    if (!msg) return;
    if (msg.kind === 'race_start') {
      startVersusCountdown(msg.seed, msg.roundId);
      hud.toast(`🏁 Corrida Versus iniciada (Seed #${msg.seed})!`, 'info');
      return;
    }
    if (msg.kind === 'state') {
      const prev = remoteSurfers.get(env.senderId);
      remoteSurfers.set(env.senderId, {
        id: env.senderId,
        name: env.senderName,
        color: prev?.color ?? '#38bdf8',
        skin: msg.skin,
        distance: msg.distance,
        laneX: msg.laneX,
        y: msg.y,
        rolling: msg.rolling,
        jetpack: msg.jetpack,
        board: msg.board,
        alive: msg.alive,
        score: msg.score,
        lastUpdated: performance.now(),
        tauntText: prev?.tauntText,
        tauntTimer: prev?.tauntTimer,
      });
      return;
    }
    if (msg.kind === 'taunt') {
      const g = remoteSurfers.get(env.senderId);
      if (g) {
        g.tauntText = msg.phrase;
        g.tauntTimer = 2.4;
      }
      hud.toast(`📢 ${env.senderName}: "${msg.phrase}"`, 'chaos');
      return;
    }
    if (msg.kind === 'finish') {
      const g = remoteSurfers.get(env.senderId);
      if (g) {
        g.distance = msg.distance;
        g.score = msg.score;
        g.alive = false;
      }
      checkVersusWinner();
      if (screen === 'gameover') renderOverlay();
    }
  },
});

const hud = mountMonkeyHud<SurferNetMessage>({
  slug: GAME_SLUG,
  title: 'Cipó Surfers: Fuga do Zelador',
  room,
});

const engine = new SurfersEngine(save, {
  onMissionCompleted: (_reward, label) => {
    persistSave(save);
    hud.toast(`🎯 ${label}`, 'banana');
  },
  onRunEnd: (summary) => {
    lastRun = summary;
    persistSave(save);
    reportGameScore(GAME_SLUG, summary.score, {
      meters: summary.meters,
      bananas: save.bananas,
    });
    if (room.roomCode && isVersusRound) {
      room.send('finish', {
        kind: 'finish',
        distance: summary.meters,
        score: summary.score,
        bananas: summary.bananasCollected,
      });
      checkVersusWinner();
    }
    screen = 'gameover';
    renderOverlay();
  },
});

function checkVersusWinner(): void {
  if (!isVersusRound || roundWinnerAnnounced) return;
  const allFinished = !engine.alive && Array.from(remoteSurfers.values()).every((g) => !g.alive);
  if (!allFinished) return;

  const standings = [
    { id: room.localPlayer.id, name: room.localPlayer.name, dist: Math.floor(engine.distance) },
    ...Array.from(remoteSurfers.values()).map((g) => ({
      id: g.id,
      name: g.name,
      dist: Math.floor(g.distance),
    })),
  ].sort((a, b) => b.dist - a.dist);

  if (standings.length > 1) {
    const winner = standings[0];
    sessionWins.set(winner.id, (sessionWins.get(winner.id) ?? 0) + 1);
    roundWinnerAnnounced = true;
    hud.toast(`🏆 ${winner.name} venceu a corrida com ${winner.dist}m!`, 'banana');
  }
}

function startSoloRun(): void {
  monkeyAudio.play('click');
  isVersusRound = false;
  roundWinnerAnnounced = false;
  const seed = Math.floor(Math.random() * 999999) + 1;
  engine.resetWorld(seed, true);
  surfersAudio.startMusic();
  screen = 'playing';
  renderOverlay();
}

function startVersusCountdown(seed: number, roundId: number): void {
  isVersusRound = true;
  roundWinnerAnnounced = false;
  currentRoundId = roundId;
  pendingSeed = seed;
  for (const g of remoteSurfers.values()) {
    g.distance = 0;
    g.alive = true;
    g.score = 0;
  }
  engine.resetWorld(seed, false);
  countdownVal = 3;
  countdownTimer = 0.85;
  screen = 'countdown';
  renderOverlay();
}

function hostStartVersus(): void {
  if (!room.roomCode) return;
  const seed = Math.floor(Math.random() * 999999) + 1;
  currentRoundId += 1;
  room.send('race_start', {
    kind: 'race_start',
    seed,
    roundId: currentRoundId,
  });
  startVersusCountdown(seed, currentRoundId);
}

function sendTaunt(): void {
  const phrase = TAUNT_PHRASES[Math.floor(Math.random() * TAUNT_PHRASES.length)];
  monkeyAudio.play('screech', 0.2);
  if (room.roomCode) {
    room.send('taunt', { kind: 'taunt', phrase });
  }
  hud.toast(`🐒 Você: "${phrase}"`, 'banana');
}

// Canvas resize handling
let viewW = window.innerWidth;
let viewH = window.innerHeight;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// Keyboard Controls
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const code = e.code;

  if (code === 'KeyB') {
    sendTaunt();
    return;
  }

  if (code === 'KeyR' && (screen === 'playing' || screen === 'gameover')) {
    if (room.roomCode && room.localPlayer.isHost) {
      hostStartVersus();
    } else {
      startSoloRun();
    }
    return;
  }

  if (screen === 'title' || screen === 'gameover') {
    if (code === 'Space' || code === 'Enter') {
      e.preventDefault();
      startSoloRun();
    }
    return;
  }

  if (screen !== 'playing') return;

  if (code === 'ArrowLeft' || code === 'KeyA') {
    e.preventDefault();
    engine.switchLane(-1);
  } else if (code === 'ArrowRight' || code === 'KeyD') {
    e.preventDefault();
    engine.switchLane(1);
  } else if (code === 'ArrowUp' || code === 'KeyW') {
    e.preventDefault();
    engine.requestJump();
  } else if (code === 'ArrowDown' || code === 'KeyS') {
    e.preventDefault();
    engine.requestRoll();
  } else if (code === 'Space') {
    e.preventDefault();
    if (engine.activateBoard(viewW, viewH)) {
      persistSave(save);
    }
  }
});

// Low-latency Touch / Pointer Swipes + Double Tap for Hoverboard
let ptrStartX = 0;
let ptrStartY = 0;
let ptrActive = false;
let ptrSwiped = false;
let lastTapTime = 0;

canvas.addEventListener('pointerdown', (e) => {
  if (screen !== 'playing') return;
  ptrActive = true;
  ptrSwiped = false;
  ptrStartX = e.clientX;
  ptrStartY = e.clientY;

  const now = performance.now();
  if (now - lastTapTime < 280) {
    if (engine.activateBoard(viewW, viewH)) {
      persistSave(save);
    }
    lastTapTime = 0;
  } else {
    lastTapTime = now;
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!ptrActive || ptrSwiped || screen !== 'playing') return;
  const dx = e.clientX - ptrStartX;
  const dy = e.clientY - ptrStartY;
  const threshold = 24;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

  ptrSwiped = true;
  if (Math.abs(dx) > Math.abs(dy)) {
    engine.switchLane(dx > 0 ? 1 : -1);
  } else if (dy < 0) {
    engine.requestJump();
  } else {
    engine.requestRoll();
  }
});

window.addEventListener('pointerup', () => {
  ptrActive = false;
});

// DOM HUD & Overlay Rendering
let liveScoreEl: HTMLDivElement | null = null;
let liveSubEl: HTMLDivElement | null = null;
let livePowerupsEl: HTMLDivElement | null = null;
let liveRaceEl: HTMLDivElement | null = null;
let liveBoardBtn: HTMLButtonElement | null = null;

function buildLiveHudHtml(): string {
  return `
    <div class="ms-hud-top-right">
      <div class="ms-score-card">
        <div class="ms-score-main" id="ms-live-score">0</div>
        <div class="ms-score-sub" id="ms-live-sub">0m • 🍌 0</div>
      </div>
      <div class="ms-race-board" id="ms-race-board" style="display:none;"></div>
    </div>
    <div class="ms-powerup-bar" id="ms-pw-bar"></div>
    <button class="ms-board-btn" id="ms-board-btn">🛹 Prancha (${save.boardCharges})</button>
  `;
}

function updateLiveHud(): void {
  if (!liveScoreEl || !liveSubEl || !livePowerupsEl || !liveBoardBtn || !liveRaceEl) return;
  const mult = engine.getTotalMultiplier();
  const boosted = engine.powerups.multiplier > 0;
  liveScoreEl.textContent = Math.floor(engine.score).toLocaleString('pt-BR');
  liveSubEl.innerHTML = `
    <span>${Math.floor(engine.distance)}m</span>
    <span>🍌 ${save.bananas}</span>
    <span class="ms-mult-badge ${boosted ? 'boosted' : ''}">${mult}x</span>
  `;

  // Active powerup pills
  const pills: string[] = [];
  const addPill = (icon: string, label: string, rem: number, max: number, color: string) => {
    if (rem <= 0) return;
    const pct = Math.max(0, Math.min(100, (rem / max) * 100));
    pills.push(`
      <div class="ms-pw-pill" style="border-color:${color}">
        <span>${icon} ${label}</span>
        <div class="ms-pw-bar-bg"><div class="ms-pw-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
    `);
  };
  addPill('🚀', 'Jetpack', engine.powerups.jetpack, 7, '#fb923c');
  addPill('👟', 'Tênis Mola', engine.powerups.sneakers, 10, '#4ade80');
  addPill('🧲', 'Ímã', engine.powerups.magnet, 10, '#f43f5e');
  addPill('2x', 'Dobro', engine.powerups.multiplier, 12, '#38bdf8');
  addPill('🛹', 'Prancha', engine.boardTimer, 10, '#22c55e');
  livePowerupsEl.innerHTML = pills.join('');

  liveBoardBtn.textContent = engine.boardTimer > 0
    ? `🛹 Ativa (${engine.boardTimer.toFixed(1)}s)`
    : `🛹 Prancha (${save.boardCharges})`;
  liveBoardBtn.classList.toggle('disabled', save.boardCharges <= 0 && engine.boardTimer <= 0);

  // Multiplayer live standings
  if (room.roomCode && remoteSurfers.size > 0) {
    liveRaceEl.style.display = 'block';
    const list = [
      {
        name: `${room.localPlayer.name} (Você)`,
        dist: Math.floor(engine.distance),
        alive: engine.alive,
        wins: sessionWins.get(room.localPlayer.id) ?? 0,
      },
      ...Array.from(remoteSurfers.values()).map((g) => ({
        name: g.name,
        dist: Math.floor(g.distance),
        alive: g.alive,
        wins: sessionWins.get(g.id) ?? 0,
      })),
    ].sort((a, b) => b.dist - a.dist);

    liveRaceEl.innerHTML = list
      .map(
        (r, idx) => `
        <div class="ms-race-row">
          <span>${idx === 0 ? '👑' : `${idx + 1}.`} ${r.name} ${r.wins > 0 ? `(${r.wins}🏆)` : ''}</span>
          <span style="color:${r.alive ? '#4ade80' : '#fb7185'}">${r.dist}m</span>
        </div>`,
      )
      .join('');
  } else {
    liveRaceEl.style.display = 'none';
  }
}

function renderOverlay(): void {
  liveScoreEl = null;
  liveSubEl = null;
  livePowerupsEl = null;
  liveRaceEl = null;
  liveBoardBtn = null;

  if (screen === 'playing') {
    uiRoot.innerHTML = buildLiveHudHtml();
    liveScoreEl = document.getElementById('ms-live-score') as HTMLDivElement;
    liveSubEl = document.getElementById('ms-live-sub') as HTMLDivElement;
    livePowerupsEl = document.getElementById('ms-pw-bar') as HTMLDivElement;
    liveRaceEl = document.getElementById('ms-race-board') as HTMLDivElement;
    liveBoardBtn = document.getElementById('ms-board-btn') as HTMLButtonElement;
    liveBoardBtn.onclick = () => {
      if (engine.activateBoard(viewW, viewH)) persistSave(save);
    };
    updateLiveHud();
    return;
  }

  if (screen === 'countdown') {
    uiRoot.innerHTML = `<div class="ms-countdown">${countdownVal > 0 ? countdownVal : 'CORRE!'}</div>`;
    return;
  }

  if (screen === 'shop') {
    renderShopOverlay();
    return;
  }

  const playersCount = room.getPlayers().length;
  const canVersus = Boolean(room.roomCode && playersCount >= 2);

  if (screen === 'title') {
    uiRoot.innerHTML = `
      <div class="ms-overlay">
        <div class="ms-card">
          <h1 class="ms-title">🚝 CIPÓ SURFERS</h1>
          <p class="ms-subtitle">Fuga do Zelador Gorila &amp; seu Capivara-Cão!</p>

          <div class="ms-stats-row">
            <div class="ms-stat-box">
              <div class="ms-stat-val">${save.bestScore.toLocaleString('pt-BR')}</div>
              <div class="ms-stat-lbl">Recorde</div>
            </div>
            <div class="ms-stat-box">
              <div class="ms-stat-val">🍌 ${save.bananas}</div>
              <div class="ms-stat-lbl">Bananas</div>
            </div>
            <div class="ms-stat-box">
              <div class="ms-stat-val">${save.permanentMult}x</div>
              <div class="ms-stat-lbl">Multiplicador</div>
            </div>
          </div>

          <button class="ms-btn-primary" id="btn-play">▶ JOGAR SOLO</button>
          ${
            canVersus
              ? `<button class="ms-btn-versus" id="btn-versus">🏁 INICIAR CORRIDA VERSUS (${playersCount} na sala)</button>`
              : room.roomCode
                ? `<div class="ms-controls-hint" style="color:#4ade80">Sala <b>${room.roomCode}</b> aberta — aguardando amigo entrar pra Corrida Versus!</div>`
                : ''
          }

          <div class="ms-btn-row">
            <button class="ms-btn-sec" id="btn-shop">🛍️ Loja &amp; Missões</button>
            <button class="ms-btn-sec" id="btn-music">${surfersAudio.isMusicEnabled() ? '🎵 Música: ON' : '🎵 Música: OFF'}</button>
          </div>

          <div class="ms-controls-hint">
            <b>Controles:</b> ⬅️➡️ / A D (Faixas) • ⬆️ / W (Pular) • ⬇️ / S (Rolar / Aterrissar) • <b>Espaço / 2x Toque</b> (Prancha Escudo)<br/>
            No celular: deslize para qualquer direção! • <b>B:</b> Buzina / Provocação
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-play')!.onclick = startSoloRun;
    document.getElementById('btn-shop')!.onclick = () => {
      monkeyAudio.play('click');
      screen = 'shop';
      renderOverlay();
    };
    document.getElementById('btn-music')!.onclick = () => {
      surfersAudio.toggleMusic();
      renderOverlay();
    };
    const versusBtn = document.getElementById('btn-versus');
    if (versusBtn) versusBtn.onclick = hostStartVersus;
    return;
  }

  // Game Over screen
  const summary = lastRun!;
  const standings =
    isVersusRound && room.roomCode
      ? [
          {
            name: `${room.localPlayer.name} (Você)`,
            dist: summary.meters,
            alive: false,
            wins: sessionWins.get(room.localPlayer.id) ?? 0,
          },
          ...Array.from(remoteSurfers.values()).map((g) => ({
            name: g.name,
            dist: Math.floor(g.distance),
            alive: g.alive,
            wins: sessionWins.get(g.id) ?? 0,
          })),
        ].sort((a, b) => b.dist - a.dist)
      : [];

  uiRoot.innerHTML = `
    <div class="ms-overlay">
      <div class="ms-card">
        <h1 class="ms-title">${summary.isNewBest ? '🏆 NOVO RECORDE!' : '🦍 PEGO PELO ZELADOR!'}</h1>
        <p class="ms-subtitle">${summary.reason}</p>

        <div class="ms-stats-row">
          <div class="ms-stat-box">
            <div class="ms-stat-val">${summary.score.toLocaleString('pt-BR')}</div>
            <div class="ms-stat-lbl">Pontuação</div>
          </div>
          <div class="ms-stat-box">
            <div class="ms-stat-val">${summary.meters}m</div>
            <div class="ms-stat-lbl">Distância</div>
          </div>
          <div class="ms-stat-box">
            <div class="ms-stat-val">+${summary.bananasCollected} 🍌</div>
            <div class="ms-stat-lbl">Coletadas</div>
          </div>
        </div>

        ${
          standings.length > 1
            ? `
          <div class="ms-race-board" style="margin-bottom:12px;text-align:left;">
            <div style="font-weight:900;color:#fde047;margin-bottom:4px;">🏁 Placar da Corrida Versus</div>
            ${standings
              .map(
                (r, idx) => `
              <div class="ms-race-row">
                <span>${idx + 1}. ${r.name} (${r.wins}🏆)</span>
                <span style="color:${r.alive ? '#4ade80' : '#facc15'}">${r.dist}m ${r.alive ? '(Correndo!)' : ''}</span>
              </div>`,
              )
              .join('')}
          </div>
        `
            : ''
        }

        <button class="ms-btn-primary" id="btn-retry">🔄 CORRER DE NOVO (R)</button>
        ${
          canVersus
            ? `<button class="ms-btn-versus" id="btn-versus-again">🏁 NOVA CORRIDA VERSUS</button>`
            : ''
        }
        <div class="ms-btn-row">
          <button class="ms-btn-sec" id="btn-shop2">🛍️ Loja &amp; Missões (🍌 ${save.bananas})</button>
          <button class="ms-btn-sec" id="btn-menu">🏠 Menu</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-retry')!.onclick = startSoloRun;
  document.getElementById('btn-shop2')!.onclick = () => {
    monkeyAudio.play('click');
    screen = 'shop';
    renderOverlay();
  };
  document.getElementById('btn-menu')!.onclick = () => {
    monkeyAudio.play('click');
    screen = 'title';
    renderOverlay();
  };
  const vAgain = document.getElementById('btn-versus-again');
  if (vAgain) vAgain.onclick = hostStartVersus;
}

function renderShopOverlay(): void {
  let bodyHtml = '';

  if (shopTab === 'skins') {
    bodyHtml = MONKEY_SKINS.map((sk) => {
      const owned = save.ownedSkins.includes(sk.id);
      const equipped = save.equippedSkin === sk.id;
      const canBuy = save.bananas >= sk.price;
      return `
        <div class="ms-shop-item ${equipped ? 'equipped' : ''}">
          <div>
            <div class="ms-item-title">${sk.name}</div>
            <div class="ms-item-desc">${sk.desc}</div>
          </div>
          <button class="ms-buy-btn ${equipped ? 'equipped' : !owned && !canBuy ? 'locked' : ''}" data-skin="${sk.id}">
            ${equipped ? '✓ Equipado' : owned ? 'Equipar' : `🍌 ${sk.price}`}
          </button>
        </div>
      `;
    }).join('');
  } else if (shopTab === 'boards') {
    const buyChargeHtml = `
      <div class="ms-shop-item">
        <div>
          <div class="ms-item-title">🛹 +1 Carga de Prancha (Estoque: ${save.boardCharges})</div>
          <div class="ms-item-desc">Salva você de 1 batida fatal com explosão épica!</div>
        </div>
        <button class="ms-buy-btn ${save.bananas < 35 ? 'locked' : ''}" id="btn-buy-charge">🍌 35</button>
      </div>
    `;
    const boardsHtml = HOVER_BOARDS.map((bd) => {
      const owned = save.ownedBoards.includes(bd.id);
      const equipped = save.equippedBoard === bd.id;
      const canBuy = save.bananas >= bd.price;
      return `
        <div class="ms-shop-item ${equipped ? 'equipped' : ''}">
          <div>
            <div class="ms-item-title">${bd.name}</div>
            <div class="ms-item-desc">${bd.desc}</div>
          </div>
          <button class="ms-buy-btn ${equipped ? 'equipped' : !owned && !canBuy ? 'locked' : ''}" data-board="${bd.id}">
            ${equipped ? '✓ Equipada' : owned ? 'Equipar' : `🍌 ${bd.price}`}
          </button>
        </div>
      `;
    }).join('');
    bodyHtml = buyChargeHtml + boardsHtml;
  } else {
    bodyHtml = save.missions
      .map((slot) => {
        const def = MISSION_POOL[slot.index % MISSION_POOL.length];
        const pct = Math.min(100, Math.floor((slot.progress / def.target) * 100));
        return `
          <div class="ms-shop-item">
            <div style="flex:1">
              <div class="ms-item-title">${def.label.replace('{n}', String(def.target))}</div>
              <div class="ms-item-desc">Progresso: ${slot.progress}/${def.target} • Recompensa: +${def.rewardBananas}🍌 &amp; +1x Multiplicador</div>
              <div class="ms-pw-bar-bg" style="margin-top:6px"><div class="ms-pw-bar-fill" style="width:${pct}%"></div></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  uiRoot.innerHTML = `
    <div class="ms-overlay">
      <div class="ms-card">
        <h1 class="ms-title">🛍️ GARAGEM MACACA</h1>
        <p class="ms-subtitle">Suas Moedas-Banana: <b style="color:#facc15">🍌 ${save.bananas}</b> • Multiplicador: <b style="color:#38bdf8">${save.permanentMult}x</b></p>

        <div class="ms-tabs">
          <button class="ms-tab ${shopTab === 'skins' ? 'active' : ''}" data-tab="skins">🐒 Skins</button>
          <button class="ms-tab ${shopTab === 'boards' ? 'active' : ''}" data-tab="boards">🛹 Pranchas</button>
          <button class="ms-tab ${shopTab === 'missions' ? 'active' : ''}" data-tab="missions">🎯 Missões</button>
        </div>

        <div class="ms-shop-list">${bodyHtml}</div>

        <button class="ms-btn-primary" id="btn-shop-back">⬅ VOLTAR</button>
      </div>
    </div>
  `;

  uiRoot.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.onclick = () => {
      monkeyAudio.play('click');
      shopTab = btn.dataset.tab as ShopTab;
      renderOverlay();
    };
  });

  uiRoot.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.skin as SkinId;
      const sk = MONKEY_SKINS.find((s) => s.id === id);
      if (!sk) return;
      if (save.ownedSkins.includes(id)) {
        save.equippedSkin = id;
        monkeyAudio.play('click');
      } else if (save.bananas >= sk.price) {
        save.bananas -= sk.price;
        save.ownedSkins.push(id);
        save.equippedSkin = id;
        monkeyAudio.play('banana');
      }
      persistSave(save);
      renderOverlay();
    };
  });

  uiRoot.querySelectorAll<HTMLButtonElement>('[data-board]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.board as BoardId;
      const bd = HOVER_BOARDS.find((b) => b.id === id);
      if (!bd) return;
      if (save.ownedBoards.includes(id)) {
        save.equippedBoard = id;
        monkeyAudio.play('click');
      } else if (save.bananas >= bd.price) {
        save.bananas -= bd.price;
        save.ownedBoards.push(id);
        save.equippedBoard = id;
        monkeyAudio.play('banana');
      }
      persistSave(save);
      renderOverlay();
    };
  });

  const chargeBtn = document.getElementById('btn-buy-charge');
  if (chargeBtn) {
    chargeBtn.onclick = () => {
      if (save.bananas >= 35) {
        save.bananas -= 35;
        save.boardCharges += 1;
        monkeyAudio.play('banana');
        persistSave(save);
        renderOverlay();
      }
    };
  }

  document.getElementById('btn-shop-back')!.onclick = () => {
    monkeyAudio.play('click');
    screen = lastRun ? 'gameover' : 'title';
    renderOverlay();
  };
}

// Main Animation Loop
let lastTime = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  if (screen === 'countdown') {
    countdownTimer -= dt;
    if (countdownTimer <= 0) {
      countdownVal -= 1;
      if (countdownVal > 0) {
        monkeyAudio.play('click');
        countdownTimer = 0.85;
        renderOverlay();
      } else if (countdownVal === 0) {
        monkeyAudio.play('fanfare', 0.2);
        engine.resetWorld(pendingSeed, true);
        surfersAudio.startMusic();
        screen = 'playing';
        renderOverlay();
      }
    }
  }

  // Update ghost taunt timers
  for (const g of remoteSurfers.values()) {
    if (g.tauntTimer && g.tauntTimer > 0) {
      g.tauntTimer = Math.max(0, g.tauntTimer - dt);
    }
  }

  // Idle camera drift on Title screen so background feels alive
  if (screen === 'title') {
    engine.advancePreview(dt);
  }

  engine.step(dt, viewW, viewH);

  // Broadcast P2P state ~15Hz while playing
  if (screen === 'playing' && room.roomCode && now - lastNetSend > 66) {
    lastNetSend = now;
    room.send('state', {
      kind: 'state',
      distance: engine.distance,
      laneX: engine.playerLaneX,
      y: engine.playerY,
      rolling: engine.rolling,
      jetpack: engine.powerups.jetpack > 0,
      board: engine.boardTimer > 0,
      alive: engine.alive,
      skin: save.equippedSkin,
      score: Math.floor(engine.score),
    });
  }

  if (screen === 'playing') {
    updateLiveHud();
  }

  engine.render(ctx, viewW, viewH, Array.from(remoteSurfers.values()));
  requestAnimationFrame(loop);
}

renderOverlay();
requestAnimationFrame(loop);
