import { getGameScore, mountMonkeyHud, reportGameScore } from '@monkey-slop/sdk';
import { tetrisAudio } from './audio';
import { MONKEY_TETRIS_CONTROLS } from './controls';
import { BotController, TetrisEngine, createEmptyInput } from './engine';
import { TetrisNet } from './net';
import { TetrisRenderer } from './renderer';
import type {
  BoardSnapshot,
  BotDifficulty,
  FlyingBananaAttack,
  GameMode,
  PlayerInputState,
} from './types';

const SLUG = 'monkey-tetris';

const TAUNT_PHRASES = [
  'UUU-AAA-AAA! 🍌',
  'COME CASCA AÍ!!',
  'TÁ LENTO DEMAIS, CHIMP!',
  'SEGURA ESSE T-GIRO!',
  'CADÊ A BARRA?! 😂',
];

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const menuOverlay = document.getElementById('menu-overlay') as HTMLDivElement;
const resultsOverlay = document.getElementById('results-overlay') as HTMLDivElement;
const modesWrap = document.getElementById('mt-modes') as HTMLDivElement;
const optionsRow = document.getElementById('mt-options-row') as HTMLDivElement;
const statusLineEl = document.getElementById('mt-status-line') as HTMLDivElement;
const bestBadgeEl = document.getElementById('mt-best-badge') as HTMLDivElement;
const startBtn = document.getElementById('mt-start-btn') as HTMLButtonElement;

const btnMusic = document.getElementById('btn-music') as HTMLButtonElement;
const btnTouchToggle = document.getElementById('btn-touch-toggle') as HTMLButtonElement;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement;
const btnMenu = document.getElementById('btn-menu') as HTMLButtonElement;
const touchBar = document.getElementById('touch-bar') as HTMLDivElement;

const resTitle = document.getElementById('res-title') as HTMLHeadingElement;
const resSubtitle = document.getElementById('res-subtitle') as HTMLParagraphElement;
const resScore = document.getElementById('res-score') as HTMLDivElement;
const resLines = document.getElementById('res-lines') as HTMLDivElement;
const resCombo = document.getElementById('res-combo') as HTMLDivElement;
const resTime = document.getElementById('res-time') as HTMLDivElement;
const resReplayBtn = document.getElementById('res-replay-btn') as HTMLButtonElement;
const resMenuBtn = document.getElementById('res-menu-btn') as HTMLButtonElement;

const renderer = new TetrisRenderer(canvas);

let selectedMode: GameMode = 'solo_marathon';
let selectedStartLevel = 1;
let selectedBotDiff: BotDifficulty = 'chimp';
let inGame = false;
let paused = false;
let pausedByGuide = false;
let countdownTimer = 0;
let lastCountdownInt = -1;
let matchEnded = false;
let globalTime = 0;

let boards: TetrisEngine[] = [];
let botCtrl: BotController | null = null;
let remoteSnapshots = new Map<string, BoardSnapshot>();
let flyingAttacks: FlyingBananaAttack[] = [];

let isTouchDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 760);

const keysDown = new Set<string>();
const pendingPresses = new Set<string>();

// Touch hold state
const touchHeld = new Set<string>();
const touchPressed = new Set<string>();

let hudHandle: ReturnType<typeof mountMonkeyHud> | null = null;

const net = new TetrisNet({
  onPlayersChange: (players) => {
    hudHandle?.setPlayers(players);
    if (net.isConnected()) {
      selectedMode = 'online_versus';
      syncModeButtons();
      if (!net.isHost() && !inGame) {
        statusLineEl.textContent = `Conectado na sala ${net.room.roomCode}! Aguardando Host (${players[0]?.name ?? 'Host'}) iniciar...`;
      } else if (net.isHost()) {
        statusLineEl.textContent = `Sala ${net.room.roomCode} aberta! ${players.length}/4 macacos prontos!`;
      }
    }
    refreshStartButton();
  },
  onStatusChange: (detail) => {
    if (net.isConnected()) {
      statusLineEl.textContent = detail;
    }
    refreshStartButton();
  },
  onRemoteStart: (seed, startLevel) => {
    selectedMode = 'online_versus';
    selectedStartLevel = startLevel;
    syncModeButtons();
    launchMatch(seed);
  },
  onRemoteState: (senderId, snapshot) => {
    remoteSnapshots.set(senderId, snapshot);
    checkOnlineMatchEnd();
  },
  onRemoteAttack: (fromId, fromName, targetId, amount, label) => {
    if (targetId === net.room.localPlayer.id && boards[0] && boards[0].alive) {
      boards[0].receiveGarbage(amount, fromName);
      flyingAttacks.push({
        fromBoardId: fromId,
        toBoardId: boards[0].id,
        progress: 0,
        amount,
        label,
      });
    } else if (targetId !== net.room.localPlayer.id) {
      flyingAttacks.push({
        fromBoardId: fromId,
        toBoardId: targetId,
        progress: 0,
        amount,
        label,
      });
    }
  },
  onRemoteTaunt: (_senderId, senderName, phrase) => {
    tetrisAudio.taunt();
    hudHandle?.toast(`🐒 ${senderName}: ${phrase}`, 'chaos');
  },
  onRemoteKO: (victimId, victimName) => {
    const snap = remoteSnapshots.get(victimId);
    if (snap) snap.alive = false;
    hudHandle?.toast(`💥 ${victimName} tomou NOCAUTE de banana!`, 'chaos');
    checkOnlineMatchEnd();
  },
  onRemoteBackToMenu: () => {
    openMenu();
  },
});

hudHandle = mountMonkeyHud({
  slug: SLUG,
  title: 'Macactris: Empilha Banana',
  room: net.room,
  controls: {
    ...MONKEY_TETRIS_CONTROLS,
    onOpenChange: (open) => {
      if (open) {
        keysDown.clear();
        pendingPresses.clear();
        touchHeld.clear();
        touchPressed.clear();
        if (inGame && !matchEnded && selectedMode !== 'online_versus' && !paused) {
          paused = true;
          pausedByGuide = true;
        }
      } else if (pausedByGuide) {
        paused = false;
        pausedByGuide = false;
      }
    },
  },
});

function refreshBestBadge(): void {
  const rec = getGameScore(SLUG);
  bestBadgeEl.textContent = `🏆 Recorde: ${rec.bestScore.toLocaleString('pt-BR')} pts`;
}

function syncTouchVisibility(): void {
  const show = inGame && isTouchDevice && selectedMode !== 'local_2p';
  touchBar.classList.toggle('visible', show);
}

function syncModeButtons(): void {
  modesWrap.querySelectorAll<HTMLButtonElement>('.mt-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === selectedMode);
  });
  refreshStartButton();
}

function refreshStartButton(): void {
  if (selectedMode === 'online_versus') {
    if (!net.isConnected()) {
      startBtn.disabled = true;
      startBtn.textContent = '🌐 Abra ou entre numa Sala ↑';
      statusLineEl.textContent = 'Clique em "🐒 Co-op Online" no topo esquerdo para criar ou entrar numa sala!';
    } else if (!net.isHost()) {
      startBtn.disabled = true;
      startBtn.textContent = '⏳ Aguardando Host...';
    } else {
      startBtn.disabled = false;
      startBtn.textContent = `⚔️ INICIAR VERSUS (${net.getPlayers().length}P)!`;
    }
  } else {
    startBtn.disabled = false;
    startBtn.textContent = selectedMode === 'local_2p' ? '🐒🐒 COMEÇAR DUELO 2P!' : '🍌 JOGAR!';
    if (!net.isConnected()) {
      statusLineEl.textContent =
        selectedMode === 'solo_sprint'
          ? 'Corrida contra o relógio: limpe 40 linhas!'
          : selectedMode === 'vs_bot'
            ? `Duelo com cascas de banana contra Bot (${selectedBotDiff.toUpperCase()})!`
            : selectedMode === 'local_2p'
              ? 'Dois macacos no mesmo teclado! Quem sobreviver vence!'
              : 'Solo Maratona: tente bater o recorde do portal!';
    }
  }
}

modesWrap.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.mt-mode-btn');
  if (!btn?.dataset.mode) return;
  selectedMode = btn.dataset.mode as GameMode;
  syncModeButtons();
});

optionsRow.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.mt-chip-btn');
  if (!btn) return;
  if (btn.dataset.level) {
    selectedStartLevel = Number(btn.dataset.level) || 1;
    optionsRow.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  }
  if (btn.dataset.bot) {
    selectedBotDiff = btn.dataset.bot as BotDifficulty;
    optionsRow.querySelectorAll<HTMLButtonElement>('[data-bot]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  }
});

btnMusic.onclick = () => {
  const on = tetrisAudio.toggleMusic();
  btnMusic.textContent = on ? '🎵 Música: ON' : '🔇 Música: OFF';
};

btnTouchToggle.onclick = () => {
  isTouchDevice = !isTouchDevice;
  syncTouchVisibility();
};

btnRestart.onclick = () => {
  if (selectedMode === 'online_versus' && !net.isHost()) {
    hudHandle?.toast('Só o Host pode reiniciar a sala online!', 'info');
    return;
  }
  if (selectedMode === 'online_versus' && net.isHost()) {
    const seed = Math.floor(Math.random() * 1_000_000);
    net.broadcastStart(seed, selectedStartLevel);
    launchMatch(seed);
  } else {
    launchMatch(Math.floor(Math.random() * 1_000_000));
  }
};

btnMenu.onclick = () => {
  if (selectedMode === 'online_versus' && net.isHost()) {
    net.broadcastBackToMenu();
  }
  openMenu();
};

startBtn.onclick = () => {
  if (selectedMode === 'online_versus') {
    if (!net.isConnected() || !net.isHost()) return;
    const seed = Math.floor(Math.random() * 1_000_000);
    net.broadcastStart(seed, selectedStartLevel);
    launchMatch(seed);
  } else {
    launchMatch(Math.floor(Math.random() * 1_000_000));
  }
};

resReplayBtn.onclick = () => {
  btnRestart.click();
};

resMenuBtn.onclick = () => {
  btnMenu.click();
};

// Setup touch buttons
touchBar.querySelectorAll<HTMLButtonElement>('.mt-tbtn').forEach((btn) => {
  const act = btn.dataset.act;
  if (!act) return;
  const press = (e: Event) => {
    e.preventDefault();
    touchHeld.add(act);
    touchPressed.add(act);
    btn.classList.add('active');
  };
  const release = (e: Event) => {
    e.preventDefault();
    touchHeld.delete(act);
    btn.classList.remove('active');
  };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
});

function openMenu(): void {
  inGame = false;
  paused = false;
  pausedByGuide = false;
  tetrisAudio.setMatchActive(false);
  menuOverlay.classList.remove('hidden');
  resultsOverlay.classList.add('hidden');
  btnRestart.style.display = 'none';
  btnMenu.style.display = 'none';
  syncTouchVisibility();
  refreshBestBadge();
  refreshStartButton();
}

function createCallbacksForBoard(): ConstructorParameters<typeof TetrisEngine>[0]['callbacks'] {
  return {
    onSfx: (eng, sfx, meta) => {
      // Avoid noisy move ticks from the AI bot
      if (eng.isBot && (sfx === 'move' || sfx === 'softDrop' || sfx === 'rotate')) return;
      switch (sfx) {
        case 'move':
          tetrisAudio.move();
          break;
        case 'rotate':
          tetrisAudio.rotate(Boolean(meta?.isTSpin));
          break;
        case 'softDrop':
          tetrisAudio.softDrop();
          break;
        case 'hardDrop':
          tetrisAudio.hardDrop();
          break;
        case 'hold':
          tetrisAudio.hold();
          break;
        case 'clear':
          tetrisAudio.lineClear(meta?.lines ?? 1, meta?.combo ?? 0, Boolean(meta?.isTSpin));
          break;
        case 'garbageIn':
          tetrisAudio.garbageIn();
          break;
        case 'ko':
          tetrisAudio.ko();
          break;
      }
    },
    onAttack: (attacker, amount, label) => {
      if (selectedMode === 'vs_bot' || selectedMode === 'local_2p') {
        const target = boards.find((b) => b.id !== attacker.id && b.alive);
        if (target) {
          tetrisAudio.garbageSend();
          target.receiveGarbage(amount, attacker.name);
          flyingAttacks.push({
            fromBoardId: attacker.id,
            toBoardId: target.id,
            progress: 0,
            amount,
            label,
          });
        }
      } else if (selectedMode === 'online_versus' && attacker === boards[0]) {
        const aliveRivals = Array.from(remoteSnapshots.values()).filter((s) => s.alive);
        if (aliveRivals.length > 0) {
          const target = aliveRivals[Math.floor(Math.random() * aliveRivals.length)];
          tetrisAudio.garbageSend();
          net.sendAttack(target.playerId, amount, label);
          flyingAttacks.push({
            fromBoardId: attacker.id,
            toBoardId: target.playerId,
            progress: 0,
            amount,
            label,
          });
        }
      }
    },
    onSprintComplete: (eng) => {
      if (selectedMode === 'solo_sprint') {
        finishMatch(`🏁 SPRINT 40 LINHAS CONCLUÍDO!`, `Tempo incrível: ${eng.elapsedTime.toFixed(2)}s!`, eng);
      }
    },
    onKO: (eng) => {
      if (selectedMode === 'online_versus' && eng === boards[0]) {
        net.sendState(eng.toNetSnapshot(), true);
        net.sendKO(eng.id, eng.name);
        checkOnlineMatchEnd();
      } else if (selectedMode === 'solo_marathon' || selectedMode === 'solo_sprint') {
        finishMatch('💥 EMPILHOU ATÉ O TETO!', 'Os macacos ficaram sem espaço pra banana!', eng);
      } else if (selectedMode === 'vs_bot' || selectedMode === 'local_2p') {
        const survivor = boards.find((b) => b.alive);
        if (survivor) {
          survivor.kos++;
          finishMatch(
            `🏆 ${survivor.name.toUpperCase()} VENCEU!`,
            `${eng.name} escorregou na casca de banana!`,
            boards[0],
          );
        }
      }
    },
  };
}

function launchMatch(seed: number): void {
  inGame = true;
  paused = false;
  pausedByGuide = false;
  matchEnded = false;
  countdownTimer = 2.4;
  lastCountdownInt = 4;
  remoteSnapshots.clear();
  flyingAttacks = [];
  botCtrl = null;

  menuOverlay.classList.add('hidden');
  resultsOverlay.classList.add('hidden');
  btnRestart.style.display = 'inline-flex';
  btnMenu.style.display = 'inline-flex';
  syncTouchVisibility();

  const cbs = createCallbacksForBoard();

  if (selectedMode === 'solo_marathon') {
    boards = [
      new TetrisEngine({
        id: 'p1',
        name: net.room.localPlayer.name || 'Macaco Solo',
        color: '#facc15',
        seed,
        startLevel: selectedStartLevel,
        callbacks: cbs,
      }),
    ];
  } else if (selectedMode === 'solo_sprint') {
    boards = [
      new TetrisEngine({
        id: 'p1',
        name: net.room.localPlayer.name || 'Macaco Veloz',
        color: '#4ade80',
        seed,
        startLevel: 1,
        sprintTarget: 40,
        callbacks: cbs,
      }),
    ];
  } else if (selectedMode === 'vs_bot') {
    boards = [
      new TetrisEngine({
        id: 'p1',
        name: 'Você (Macaco)',
        color: '#facc15',
        seed,
        startLevel: selectedStartLevel,
        callbacks: cbs,
      }),
      new TetrisEngine({
        id: 'bot',
        name: `Bot ${selectedBotDiff.toUpperCase()}`,
        color: '#fb7185',
        seed: seed + 77,
        startLevel: selectedStartLevel,
        isBot: true,
        botDifficulty: selectedBotDiff,
        callbacks: cbs,
      }),
    ];
    botCtrl = new BotController();
  } else if (selectedMode === 'local_2p') {
    boards = [
      new TetrisEngine({
        id: 'p1',
        name: 'Macaco 1 (WASD)',
        color: '#facc15',
        seed,
        startLevel: selectedStartLevel,
        callbacks: cbs,
      }),
      new TetrisEngine({
        id: 'p2',
        name: 'Macaco 2 (Setas)',
        color: '#38bdf8',
        seed,
        startLevel: selectedStartLevel,
        callbacks: cbs,
      }),
    ];
  } else {
    const lp = net.room.localPlayer;
    boards = [
      new TetrisEngine({
        id: lp.id,
        name: lp.name,
        color: lp.color,
        seed,
        startLevel: selectedStartLevel,
        callbacks: cbs,
      }),
    ];
    for (const p of net.getPlayers()) {
      if (p.id === lp.id) continue;
      remoteSnapshots.set(p.id, {
        playerId: p.id,
        playerName: p.name,
        playerColor: p.color,
        grid: '.'.repeat(200),
        active: null,
        hold: null,
        score: 0,
        lines: 0,
        level: selectedStartLevel,
        combo: 0,
        pendingGarbage: 0,
        alive: true,
        mood: 'idle',
        kos: 0,
      });
    }
    net.sendState(boards[0].toNetSnapshot(), true);
  }

  tetrisAudio.setMatchActive(true);
}

function checkOnlineMatchEnd(): void {
  if (selectedMode !== 'online_versus' || matchEnded || !boards[0]) return;
  const rivals = Array.from(remoteSnapshots.values());
  if (rivals.length === 0) return;

  const aliveRivals = rivals.filter((r) => r.alive);
  if (!boards[0].alive && aliveRivals.length <= 1) {
    const winner = aliveRivals[0];
    finishMatch(
      winner ? `🏆 ${winner.playerName} VENCEU!` : '🍌 FIM DA RODADA!',
      'Você tomou nocaute na chuva de bananas!',
      boards[0],
    );
  } else if (boards[0].alive && aliveRivals.length === 0) {
    finishMatch('👑 REI DA BANANA! VOCÊ VENCEU!', 'Todos os rivais tomaram nocaute!', boards[0]);
  }
}

function finishMatch(title: string, subtitle: string, primaryBoard: TetrisEngine): void {
  if (matchEnded) return;
  matchEnded = true;
  tetrisAudio.setMatchActive(false);

  // Report score to Click Macacos portal & localStorage
  const finalScore =
    selectedMode === 'solo_sprint' && primaryBoard.sprintFinished
      ? Math.max(1000, Math.round(100000 / Math.max(5, primaryBoard.elapsedTime)))
      : primaryBoard.score;

  reportGameScore(SLUG, finalScore, {
    lines: primaryBoard.lines,
    mode: selectedMode,
    maxCombo: primaryBoard.maxCombo + 1,
  });
  refreshBestBadge();

  resTitle.textContent = title;
  resSubtitle.textContent = subtitle;
  resScore.textContent = primaryBoard.score.toLocaleString('pt-BR');
  resLines.textContent = `${primaryBoard.lines}`;
  resCombo.textContent = `${Math.max(1, primaryBoard.maxCombo + 1)}x`;
  resTime.textContent = `${primaryBoard.elapsedTime.toFixed(1)}s`;
  resultsOverlay.classList.remove('hidden');
}

function readSoloInput(): PlayerInputState {
  const inp = createEmptyInput();
  inp.leftHeld = keysDown.has('ArrowLeft') || keysDown.has('KeyA') || touchHeld.has('left');
  inp.rightHeld = keysDown.has('ArrowRight') || keysDown.has('KeyD') || touchHeld.has('right');
  inp.downHeld = keysDown.has('ArrowDown') || keysDown.has('KeyS') || touchHeld.has('down');

  inp.leftPressed = pendingPresses.has('ArrowLeft') || pendingPresses.has('KeyA') || touchPressed.has('left');
  inp.rightPressed = pendingPresses.has('ArrowRight') || pendingPresses.has('KeyD') || touchPressed.has('right');
  inp.rotateCWPressed =
    pendingPresses.has('ArrowUp') ||
    pendingPresses.has('KeyW') ||
    pendingPresses.has('KeyX') ||
    touchPressed.has('cw');
  inp.rotateCCWPressed =
    pendingPresses.has('KeyZ') ||
    pendingPresses.has('KeyQ') ||
    pendingPresses.has('ControlLeft') ||
    touchPressed.has('ccw');
  inp.hardDropPressed = pendingPresses.has('Space') || touchPressed.has('hard');
  inp.holdPressed =
    pendingPresses.has('KeyC') ||
    pendingPresses.has('ShiftLeft') ||
    pendingPresses.has('ShiftRight') ||
    touchPressed.has('hold');
  return inp;
}

function readLocal2PInputs(): [PlayerInputState, PlayerInputState] {
  const p1 = createEmptyInput();
  p1.leftHeld = keysDown.has('KeyA');
  p1.rightHeld = keysDown.has('KeyD');
  p1.downHeld = keysDown.has('KeyS');
  p1.leftPressed = pendingPresses.has('KeyA');
  p1.rightPressed = pendingPresses.has('KeyD');
  p1.rotateCWPressed = pendingPresses.has('KeyW');
  p1.rotateCCWPressed = pendingPresses.has('KeyQ');
  p1.hardDropPressed = pendingPresses.has('Space') || pendingPresses.has('KeyF');
  p1.holdPressed = pendingPresses.has('KeyC') || pendingPresses.has('KeyE');

  const p2 = createEmptyInput();
  p2.leftHeld = keysDown.has('ArrowLeft');
  p2.rightHeld = keysDown.has('ArrowRight');
  p2.downHeld = keysDown.has('ArrowDown');
  p2.leftPressed = pendingPresses.has('ArrowLeft');
  p2.rightPressed = pendingPresses.has('ArrowRight');
  p2.rotateCWPressed = pendingPresses.has('ArrowUp');
  p2.rotateCCWPressed = pendingPresses.has('Period') || pendingPresses.has('ControlRight');
  p2.hardDropPressed = pendingPresses.has('Enter') || pendingPresses.has('Numpad0') || pendingPresses.has('Slash');
  p2.holdPressed = keysDown.has('ShiftRight')
    ? pendingPresses.has('ShiftRight')
    : pendingPresses.has('KeyM') || pendingPresses.has('Comma');

  return [p1, p2];
}

window.addEventListener('keydown', (e) => {
  if (
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) &&
    document.activeElement?.tagName !== 'INPUT'
  ) {
    e.preventDefault();
  }
  if (document.activeElement?.tagName === 'INPUT') return;

  if (!e.repeat) {
    pendingPresses.add(e.code);

    if (e.code === 'KeyP' && inGame && !matchEnded && countdownTimer <= 0) {
      if (selectedMode !== 'online_versus') {
        paused = !paused;
      }
    }
    if (e.code === 'KeyR' && inGame) {
      btnRestart.click();
    }
    if (e.code === 'KeyB' && inGame) {
      const phrase = TAUNT_PHRASES[Math.floor(Math.random() * TAUNT_PHRASES.length)];
      tetrisAudio.taunt();
      if (boards[0]) {
        boards[0].say(phrase, 2.0);
        boards[0].setMood('smug', 1.1);
      }
      if (selectedMode === 'online_versus') {
        net.sendTaunt(phrase);
      } else {
        hudHandle?.toast(`🐒 ${phrase}`, 'banana');
      }
    }
  }
  keysDown.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

// Swipe / tap controls directly on canvas for mobile convenience
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let swipeMovedX = 0;

canvas.addEventListener(
  'touchstart',
  (e) => {
    if (!inGame || paused || matchEnded || e.touches.length === 0) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    swipeMovedX = 0;
    touchStartTime = performance.now();
  },
  { passive: true },
);

canvas.addEventListener(
  'touchmove',
  (e) => {
    if (!inGame || paused || matchEnded || e.touches.length === 0) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const stepX = Math.floor(dx / 28);
    if (stepX !== swipeMovedX) {
      const delta = stepX - swipeMovedX;
      swipeMovedX = stepX;
      if (delta < 0) touchPressed.add('left');
      else if (delta > 0) touchPressed.add('right');
    }
    if (dy > 42) {
      touchHeld.add('down');
    }
  },
  { passive: true },
);

canvas.addEventListener(
  'touchend',
  (e) => {
    touchHeld.delete('down');
    if (!inGame || paused || matchEnded) return;
    const elapsed = performance.now() - touchStartTime;
    const changed = e.changedTouches[0];
    if (changed) {
      const dx = changed.clientX - touchStartX;
      const dy = changed.clientY - touchStartY;
      if (elapsed < 220 && Math.abs(dx) < 18 && Math.abs(dy) < 18) {
        touchPressed.add('cw');
      } else if (dy > 95 && elapsed < 260 && Math.abs(dx) < 40) {
        touchPressed.add('hard');
      }
    }
  },
  { passive: true },
);

// Main 60 FPS Loop
let lastFrame = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  globalTime += dt;

  let countdownText: string | null = null;

  if (inGame && !paused) {
    if (countdownTimer > 0) {
      countdownTimer -= dt;
      const ceil = Math.ceil(countdownTimer * 1.25);
      if (ceil !== lastCountdownInt && ceil >= 0) {
        lastCountdownInt = ceil;
        tetrisAudio.countdown(ceil);
      }
      countdownText = ceil > 0 ? `${ceil}` : 'BANANA!';
    } else if (!matchEnded) {
      if (selectedMode === 'local_2p') {
        const [i1, i2] = readLocal2PInputs();
        boards[0]?.step(dt, i1);
        boards[1]?.step(dt, i2);
      } else if (selectedMode === 'vs_bot') {
        const i1 = readSoloInput();
        boards[0]?.step(dt, i1);
        if (boards[1] && botCtrl) {
          const botInput = botCtrl.computeInput(boards[1], dt);
          boards[1].step(dt, botInput);
        }
      } else {
        const i1 = readSoloInput();
        boards[0]?.step(dt, i1);
        if (selectedMode === 'online_versus' && boards[0]) {
          net.sendState(boards[0].toNetSnapshot());
        }
      }

      const anyDanger = boards.some((b) => b.alive && b.isInDanger());
      tetrisAudio.setDangerMode(anyDanger);
    }

    for (let i = flyingAttacks.length - 1; i >= 0; i--) {
      flyingAttacks[i].progress += dt * 2.4;
      if (flyingAttacks[i].progress >= 1) {
        flyingAttacks.splice(i, 1);
      }
    }
  }

  pendingPresses.clear();
  touchPressed.clear();

  renderer.render({
    mode: selectedMode,
    time: globalTime,
    boards,
    remoteSnapshots: Array.from(remoteSnapshots.values()),
    flyingAttacks,
    countdownText,
    paused,
    isTouchDevice,
    sprintTarget: 40,
  });

  requestAnimationFrame(loop);
}

// Init
refreshBestBadge();
syncModeButtons();
requestAnimationFrame(loop);
