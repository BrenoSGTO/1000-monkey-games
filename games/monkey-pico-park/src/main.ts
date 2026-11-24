import { getGameScore, mountMonkeyHud, reportGameScore, type PlayerProfile } from '@monkey-slop/sdk';
import { picoAudio } from './audio';
import { LEVELS } from './levels';
import { applySnapshotToWorld, OnlineCoordinator, playersToSlots } from './net';
import {
  addFloatingText,
  createWorld,
  stepWorld,
  type PhysicsCallbacks,
  type PlayerSlotInfo,
} from './physics';
import { renderGame, type RenderFrameInfo, type UiViewState } from './renderer';
import type { GameMode, MonkeyInput, WorldState } from './types';

const SLUG = 'monkey-pico-park';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const keysDown = new Set<string>();
let shoutEdge = false;
let p2ShoutEdge = false;
let p3ShoutEdge = false;

let uiState: UiViewState = {
  selectedMode: 'solo',
  onlineConnected: false,
  onlineIsHost: false,
  onlinePlayerCount: 0,
  roomCode: null,
  bestScore: getGameScore(SLUG).bestScore,
  showLevelSelect: false,
};

function makeSlotsForMode(mode: GameMode, players: PlayerProfile[]): PlayerSlotInfo[] {
  if (mode === 'solo') {
    return [
      { playerId: 'solo-0', name: 'M1 Banana', paletteIndex: 0 },
      { playerId: 'solo-1', name: 'M2 Cipó', paletteIndex: 1 },
      { playerId: 'solo-2', name: 'M3 Pitaya', paletteIndex: 2 },
    ];
  }
  if (mode === 'local2') {
    return [
      { playerId: 'p1', name: 'P1 (WASD)', paletteIndex: 0 },
      { playerId: 'p2', name: 'P2 (Setas)', paletteIndex: 1 },
    ];
  }
  if (mode === 'local3') {
    return [
      { playerId: 'p1', name: 'P1 (WASD)', paletteIndex: 0 },
      { playerId: 'p2', name: 'P2 (Setas)', paletteIndex: 1 },
      { playerId: 'p3', name: 'P3 (IJKL)', paletteIndex: 2 },
    ];
  }
  return playersToSlots(players);
}

let world: WorldState = createWorld(0, 'solo', makeSlotsForMode('solo', []));
world.phase = 'menu';

let lastRenderInfo: RenderFrameInfo = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  buttons: [],
};

let hud!: ReturnType<typeof mountMonkeyHud>;

const online = new OnlineCoordinator(SLUG, {
  onPlayersUpdated: (players) => {
    hud?.setPlayers(players);
    uiState.onlineConnected = online.isConnected();
    uiState.onlineIsHost = online.isHost();
    uiState.onlinePlayerCount = players.length;
    uiState.roomCode = online.room.roomCode;

    if (online.isConnected()) {
      uiState.selectedMode = 'online';
      if (online.isHost()) {
        const currentPhase = world.phase;
        const slots = makeSlotsForMode('online', players);
        world = createWorld(world.levelIndex, 'online', slots, {
          deaths: world.deaths,
          totalTimer: world.totalTimer,
          totalScore: world.totalScore,
          completedLevels: world.completedLevels,
        });
        world.phase = currentPhase;
        if (currentPhase === 'playing') {
          hud.toast(`Sala atualizada (${players.length} macacos)!`, 'info');
        }
      } else {
        world.mode = 'online';
      }
    }
  },
  onHostCommand: (action, levelIndex) => {
    if (!online.isHost()) return;
    if (action === 'start_level' && typeof levelIndex === 'number') {
      startLevel(levelIndex, 'online');
    } else if (action === 'next_level') {
      advanceNextLevel();
    } else if (action === 'restart') {
      restartCurrentLevel();
    }
  },
  onWorldEvent: (msg) => {
    online.applyGuestEventFeedback(world, msg);
  },
  onToast: (msg, tone) => {
    hud?.toast(msg, tone);
  },
});

hud = mountMonkeyHud({
  slug: SLUG,
  title: 'Mico Park: A Chave da Banana',
  room: online.room,
});

const physicsCallbacks: PhysicsCallbacks = {
  onEvent: (name, detail, x, y) => {
    if (name === 'level_clear') {
      const rec = reportGameScore(SLUG, world.totalScore, {
        levelsCleared: world.completedLevels.length,
        deaths: world.deaths,
      });
      uiState.bestScore = rec.bestScore;
    }
    if (online.isConnected() && online.isHost()) {
      online.broadcastEvent(name, detail, x, y, world.levelIndex);
    }
  },
};

function startLevel(levelIdx: number, mode: GameMode = uiState.selectedMode): void {
  const clamped = Math.max(0, Math.min(LEVELS.length - 1, levelIdx));
  uiState.selectedMode = mode;
  const slots = makeSlotsForMode(mode, online.players);
  world = createWorld(clamped, mode, slots, {
    deaths: clamped === 0 && world.phase === 'menu' ? 0 : world.deaths,
    totalTimer: clamped === 0 && world.phase === 'menu' ? 0 : world.totalTimer,
    totalScore: clamped === 0 && world.phase === 'menu' ? 0 : world.totalScore,
    completedLevels: world.completedLevels,
  });
  world.phase = 'playing';
  picoAudio.click();
  if (online.isConnected() && online.isHost()) {
    online.broadcastEvent('level_start', undefined, undefined, undefined, clamped);
  }
}

function restartCurrentLevel(): void {
  if (world.phase !== 'playing') return;
  const slots = makeSlotsForMode(world.mode, online.players);
  world = createWorld(world.levelIndex, world.mode, slots, {
    deaths: world.deaths + 1,
    totalTimer: world.totalTimer,
    totalScore: world.totalScore,
    completedLevels: world.completedLevels,
  });
  world.phase = 'playing';
  addFloatingText(world, 640, 200, 'FASE REINICIADA 🔄', '#fde047', 1.2);
  picoAudio.click();
}

function advanceNextLevel(): void {
  if (world.levelIndex + 1 < LEVELS.length) {
    startLevel(world.levelIndex + 1, world.mode);
  } else {
    world.phase = 'victory';
  }
}

function goToMenu(): void {
  world.phase = 'menu';
  picoAudio.click();
}

function readSinglePlayerInput(): MonkeyInput {
  const inp: MonkeyInput = {
    left: keysDown.has('KeyA') || keysDown.has('ArrowLeft'),
    right: keysDown.has('KeyD') || keysDown.has('ArrowRight'),
    jump: keysDown.has('KeyW') || keysDown.has('ArrowUp') || keysDown.has('Space'),
    shout: shoutEdge,
  };
  return inp;
}

function gatherWorldInputs(): Map<number, MonkeyInput> {
  const map = new Map<number, MonkeyInput>();

  if (world.mode === 'solo') {
    map.set(world.activeSoloIndex, readSinglePlayerInput());
  } else if (world.mode === 'local2' || world.mode === 'local3') {
    map.set(0, {
      left: keysDown.has('KeyA'),
      right: keysDown.has('KeyD'),
      jump: keysDown.has('KeyW') || keysDown.has('Space'),
      shout: shoutEdge,
    });
    map.set(1, {
      left: keysDown.has('ArrowLeft'),
      right: keysDown.has('ArrowRight'),
      jump: keysDown.has('ArrowUp'),
      shout: p2ShoutEdge,
    });
    if (world.mode === 'local3') {
      map.set(2, {
        left: keysDown.has('KeyJ'),
        right: keysDown.has('KeyL'),
        jump: keysDown.has('KeyI'),
        shout: p3ShoutEdge,
      });
    }
  } else if (world.mode === 'online') {
    const localId = online.getLocalPlayerId();
    for (const m of world.monkeys) {
      if (m.playerId === localId || m.playerId === 'local-0') {
        map.set(m.id, readSinglePlayerInput());
      } else {
        const rem = online.remoteInputs.get(m.playerId);
        if (rem) map.set(m.id, rem);
      }
    }
  }

  shoutEdge = false;
  p2ShoutEdge = false;
  p3ShoutEdge = false;
  return map;
}

// ============================================================================
// Input Events
// ============================================================================
window.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT') return;

  if (
    ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
  ) {
    e.preventDefault();
  }

  const firstPress = !keysDown.has(e.code);
  keysDown.add(e.code);

  if (firstPress) {
    if (e.code === 'KeyE' || e.code === 'KeyB') shoutEdge = true;
    if (e.code === 'Enter' || e.code === 'ArrowDown') p2ShoutEdge = true;
    if (e.code === 'KeyK' || e.code === 'KeyU') p3ShoutEdge = true;

    if (world.phase === 'playing') {
      if (world.mode === 'solo') {
        if (e.code === 'Tab' || e.code === 'KeyQ') {
          world.activeSoloIndex = (world.activeSoloIndex + 1) % world.monkeys.length;
          picoAudio.switchMonkey();
        } else if (e.code === 'Digit1') {
          world.activeSoloIndex = 0;
          picoAudio.switchMonkey();
        } else if (e.code === 'Digit2' && world.monkeys.length > 1) {
          world.activeSoloIndex = 1;
          picoAudio.switchMonkey();
        } else if (e.code === 'Digit3' && world.monkeys.length > 2) {
          world.activeSoloIndex = 2;
          picoAudio.switchMonkey();
        } else if (e.code === 'KeyF') {
          world.followActive = !world.followActive;
          picoAudio.followToggle(world.followActive);
          addFloatingText(
            world,
            world.monkeys[world.activeSoloIndex]?.x ?? 640,
            (world.monkeys[world.activeSoloIndex]?.y ?? 360) - 35,
            world.followActive ? 'SEGUIR: ON 🐾' : 'PARADO! ✋',
            world.followActive ? '#4ade80' : '#fbbf24',
            1.05,
          );
        }
      }

      if (e.code === 'KeyR') {
        if (world.mode !== 'online' || online.isHost()) {
          restartCurrentLevel();
        }
      }
      if (e.code === 'Escape') {
        if (world.mode !== 'online' || online.isHost()) {
          goToMenu();
        }
      }
    } else if (world.phase === 'level_clear') {
      if (e.code === 'Enter' || e.code === 'Space') {
        if (world.mode !== 'online' || online.isHost()) {
          advanceNextLevel();
        }
      }
    } else if (world.phase === 'menu') {
      if (e.code === 'Enter') {
        if (uiState.selectedMode !== 'online' || !online.isConnected() || online.isHost()) {
          startLevel(0, uiState.selectedMode);
        }
      }
    }
  }
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

window.addEventListener('blur', () => {
  keysDown.clear();
});

function handleCanvasClick(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  const sx = (clientX - rect.left) * (canvas.width / rect.width);
  const sy = (clientY - rect.top) * (canvas.height / rect.height);
  const wx = (sx - lastRenderInfo.offsetX) / lastRenderInfo.scale;
  const wy = (sy - lastRenderInfo.offsetY) / lastRenderInfo.scale;

  for (let i = lastRenderInfo.buttons.length - 1; i >= 0; i--) {
    const b = lastRenderInfo.buttons[i];
    if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
      handleButtonAction(b.id);
      return;
    }
  }
}

function handleButtonAction(id: string): void {
  if (id === 'btn_follow' && world.mode === 'solo') {
    world.followActive = !world.followActive;
    picoAudio.followToggle(world.followActive);
    return;
  }
  if (id === 'btn_restart') {
    if (world.mode !== 'online' || online.isHost()) restartCurrentLevel();
    return;
  }
  if (id === 'btn_menu') {
    if (world.mode !== 'online' || online.isHost()) goToMenu();
    else {
      online.room.disconnect();
      uiState.onlineConnected = false;
      uiState.selectedMode = 'solo';
      goToMenu();
    }
    return;
  }
  if (id === 'next_level') {
    if (world.mode !== 'online' || online.isHost()) advanceNextLevel();
    return;
  }
  if (id === 'start_game') {
    if (uiState.selectedMode === 'online' && !online.isConnected()) {
      hud.toast('Crie ou entre em uma sala pelo botão "🐒 Co-op Online" no topo!', 'info');
      return;
    }
    if (uiState.selectedMode === 'online' && !online.isHost()) return;
    startLevel(0, uiState.selectedMode);
    return;
  }
  if (id.startsWith('mode_')) {
    const mode = id.slice(5) as GameMode;
    picoAudio.click();
    if (mode === 'online' && !online.isConnected()) {
      hud.toast('Clique em "🐒 Co-op Online" no canto superior esquerdo para criar/entrar na sala!', 'info');
    }
    uiState.selectedMode = mode;
    return;
  }
  if (id.startsWith('play_level_')) {
    const idx = Number(id.slice('play_level_'.length));
    if (uiState.selectedMode === 'online' && !online.isConnected()) {
      hud.toast('Entre em uma sala Online primeiro ou escolha Solo / Local!', 'info');
      return;
    }
    if (uiState.selectedMode === 'online' && !online.isHost()) return;
    startLevel(idx, uiState.selectedMode);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  handleCanvasClick(e.clientX, e.clientY);
});

// ============================================================================
// Main Loop (Fixed 60Hz Physics + Smooth Render)
// ============================================================================
function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.floor(window.innerWidth * dpr));
  const h = Math.max(240, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

let lastTime = performance.now();
let accumulator = 0;
const FIXED_DT = 1 / 60;

function frame(now: number): void {
  resizeCanvas();
  const rawDt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  // Keep UI online flags synced
  uiState.onlineConnected = online.isConnected();
  uiState.onlineIsHost = online.isHost();
  uiState.roomCode = online.room.roomCode;

  if (online.isConnected() && !online.isHost()) {
    // Guest mode: send local input, apply latest snapshot from host
    world.mode = 'online';
    const localInp = readSinglePlayerInput();
    online.sendGuestInput(localInp, rawDt);
    shoutEdge = false;

    if (online.latestSnapshot) {
      world = applySnapshotToWorld(world, online.latestSnapshot);
    }
    for (const m of world.monkeys) {
      m.animTime += rawDt;
    }
    // Keep decaying visual particles/flash on guest
    if (world.resetFlashTimer > 0) world.resetFlashTimer = Math.max(0, world.resetFlashTimer - rawDt);
    if (world.shakeTimer > 0) world.shakeTimer = Math.max(0, world.shakeTimer - rawDt);
    for (let i = world.particles.length - 1; i >= 0; i--) {
      const p = world.particles[i];
      p.x += p.vx * rawDt;
      p.y += p.vy * rawDt;
      p.vy += 420 * rawDt;
      p.life -= rawDt;
      if (p.life <= 0) world.particles.splice(i, 1);
    }
    for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
      const ft = world.floatingTexts[i];
      ft.y += ft.vy * rawDt;
      ft.life -= rawDt;
      if (ft.life <= 0) world.floatingTexts.splice(i, 1);
    }
  } else {
    // Local / Solo / Online Host simulation
    accumulator += rawDt;
    while (accumulator >= FIXED_DT) {
      const inputs = gatherWorldInputs();
      stepWorld(world, FIXED_DT, inputs, physicsCallbacks, true);
      accumulator -= FIXED_DT;
    }

    if (online.isConnected() && online.isHost()) {
      online.hostTickBroadcast(world, rawDt);
    }
  }

  lastRenderInfo = renderGame(ctx, canvas.width, canvas.height, world, uiState, now / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
