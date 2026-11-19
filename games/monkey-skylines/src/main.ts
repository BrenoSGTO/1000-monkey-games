import { monkeyAudio, mountMonkeyHud, PeerRoom, reportGameScore } from '@monkey-slop/sdk';
import { gridToWorld, inBounds, worldToGrid } from './map';
import { CityRenderer, type CameraState, type HoverState } from './renderer';
import { CitySimulation } from './simulation';
import {
  GRID_SIZE,
  TOOLS,
  type CityNetMessage,
  type DisasterType,
  type RemoteCursor,
  type ToolType,
} from './types';
import { CityUi } from './ui';

const SLUG = 'monkey-skylines';
const TITLE = 'SimMacaco: Prefeitura do Caos';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Note: renderer transforms using canvas.width / canvas.height, so keep DPR = 1 for crisp 1:1 pixel mapping
function syncCanvasSize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.removeEventListener('resize', resizeCanvas);
syncCanvasSize();
window.addEventListener('resize', syncCanvasSize);

let selectedTool: ToolType = 'road';
let chaosCooldown = 0;
const remoteCursors = new Map<string, RemoteCursor>();

const centerWorld = gridToWorld(GRID_SIZE * 0.5 - 0.5, GRID_SIZE * 0.5 - 0.5);
const cam: CameraState = {
  x: -centerWorld.wx,
  y: -centerWorld.wy,
  zoom: 1.05,
};

function centerCamera(): void {
  cam.zoom = 1.05;
  cam.x = -centerWorld.wx * cam.zoom;
  cam.y = -centerWorld.wy * cam.zoom;
}
centerCamera();

let hud!: ReturnType<typeof mountMonkeyHud<CityNetMessage>>;
let ui!: CityUi;
let sim!: CitySimulation;
let lastPlayerCount = 0;

let hasInitialSync = false;

const room = new PeerRoom<CityNetMessage>(SLUG, {
  onStatus: (status, detail) => {
    if (status === 'connected' && detail) {
      hud.toast(detail, 'info');
      if (!room.localPlayer.isHost) {
        hasInitialSync = false;
        room.send('request_sync', { kind: 'request_sync' });
      }
    } else if (status === 'error' && detail) {
      hud.toast(detail, 'chaos');
    }
  },
  onPlayersChange: (players) => {
    hud.setPlayers(players);
    if (room.localPlayer.isHost && players.length > lastPlayerCount && players.length > 1) {
      room.send('state_sync', {
        kind: 'state_sync',
        snapshot: sim.exportSnapshot(),
      });
    }
    lastPlayerCount = players.length;
  },
  onMessage: (env) => {
    const msg = env.payload;
    switch (msg.kind) {
      case 'tile_action': {
        sim.applyTool(msg.gx, msg.gy, msg.tool, msg.actorName, true);
        break;
      }
      case 'cursor_move': {
        remoteCursors.set(env.senderId, {
          playerId: env.senderId,
          name: env.senderName,
          color: msg.color,
          gx: msg.gx,
          gy: msg.gy,
          tool: msg.tool,
          lastSeen: performance.now(),
        });
        break;
      }
      case 'trigger_disaster': {
        sim.triggerDisaster(msg.disasterType, msg.actorName, msg.seedX, msg.seedY);
        break;
      }
      case 'state_sync': {
        if (!room.localPlayer.isHost) {
          sim.importSnapshot(msg.snapshot, hasInitialSync);
          hasInitialSync = true;
        }
        break;
      }
      case 'request_sync': {
        if (room.localPlayer.isHost) {
          room.send('state_sync', {
            kind: 'state_sync',
            snapshot: sim.exportSnapshot(),
          });
        }
        break;
      }
      case 'reset_city': {
        sim.reset(msg.seed);
        ui.closeCrisisModal();
        hud.toast(`🔄 ${msg.actorName} reiniciou a prefeitura!`, 'info');
        break;
      }
    }
  },
});

hud = mountMonkeyHud<CityNetMessage>({
  slug: SLUG,
  title: TITLE,
  room,
});

const initialSeed = Math.floor(Math.random() * 999999) + 1;
sim = new CitySimulation(initialSeed, {
  onToast: (msg, tone = 'banana') => hud.toast(msg, tone),
  onSound: (sound, vol) => monkeyAudio.play(sound, vol),
  onMilestone: (name, bonus) => {
    hud.toast(`🎉 Marco atingido: ${name}! (+${bonus}🍌)`, 'banana');
  },
  onCrisis: (reason) => {
    monkeyAudio.play('rage', 0.3);
    reportGameScore(SLUG, sim.getScore(), {
      population: sim.stats.population,
      day: sim.stats.day,
    });
    ui.showCrisisModal(reason);
  },
  onScoreCheckpoint: (score, stats) => {
    if (stats.population > 0) {
      reportGameScore(SLUG, score, {
        population: stats.population,
        day: stats.day,
      });
    }
  },
});

function isHostOrSolo(): boolean {
  return !room.roomCode || room.localPlayer.isHost;
}

ui = new CityUi({
  onSelectTool: (tool) => {
    selectedTool = tool;
    ui.setSelectedTool(tool);
    monkeyAudio.play('click', 0.16);
  },
  onSetSpeed: (speed) => {
    sim.simSpeed = speed;
    ui.setSpeed(speed);
    monkeyAudio.play('click', 0.16);
  },
  onChaosButton: () => {
    if (chaosCooldown > 0) return;
    chaosCooldown = 12;
    ui.setChaosCooldown(chaosCooldown);

    const types: DisasterType[] = ['giant_gorilla', 'trio_eletrico', 'coconut_rain', 'strike'];
    const pick = types[Math.floor(Math.random() * types.length)];
    const seedX = Math.random();
    const seedY = Math.random();
    const actor = room.localPlayer.name;

    sim.triggerDisaster(pick, actor, seedX, seedY);
    if (room.roomCode) {
      room.send('trigger_disaster', {
        kind: 'trigger_disaster',
        disasterType: pick,
        actorName: actor,
        seedX,
        seedY,
      });
    }
  },
  onCenterCamera: () => {
    centerCamera();
    monkeyAudio.play('click', 0.15);
  },
  onResetCity: () => {
    const score = sim.getScore();
    if (score > 0) {
      reportGameScore(SLUG, score, {
        population: sim.stats.population,
        day: sim.stats.day,
      });
    }
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    sim.reset(newSeed);
    ui.closeCrisisModal();
    centerCamera();
    monkeyAudio.play('boing', 0.22);
    if (room.roomCode) {
      room.send('reset_city', {
        kind: 'reset_city',
        seed: newSeed,
        actorName: room.localPlayer.name,
      });
    }
  },
  onLoanRescue: () => {
    sim.stats.bananas += 350;
    sim.stats.bankruptTimer = 0;
    sim.stats.rebellionTimer = 0;
    sim.stats.happiness = Math.max(sim.stats.happiness, 55);
    sim.crisisTriggered = false;
    hud.toast('🦍 Agiota Chimpanzé liberou +350🍌 (juros: 1 abraço)', 'banana');
    monkeyAudio.play('banana', 0.28);
    if (room.roomCode && room.localPlayer.isHost) {
      room.send('state_sync', { kind: 'state_sync', snapshot: sim.exportSnapshot() });
    }
  },
  onStartGame: () => {
    monkeyAudio.play('fanfare', 0.22);
  },
});

const renderer = new CityRenderer(ctx);

// Input & Camera Controls
let hover: HoverState | null = null;
let isPainting = false;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let camStartX = 0;
let camStartY = 0;
let lastPaintedKey = '';
let lastCursorSentAt = 0;

function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
  return {
    wx: (sx - canvas.width * 0.5 - cam.x) / cam.zoom,
    wy: (sy - canvas.height * 0.5 - cam.y) / cam.zoom,
  };
}

function updateHover(sx: number, sy: number): void {
  const { wx, wy } = screenToWorld(sx, sy);
  const { gx, gy } = worldToGrid(wx, wy);
  const valid = inBounds(gx, gy);
  hover = valid ? { gx, gy, valid: true } : null;

  if (valid && room.roomCode) {
    const now = performance.now();
    if (now - lastCursorSentAt > 75) {
      lastCursorSentAt = now;
      room.send('cursor_move', {
        kind: 'cursor_move',
        gx,
        gy,
        tool: selectedTool,
        color: room.localPlayer.color,
      });
    }
  }
}

function tryPaintAtHover(): void {
  if (!hover || !hover.valid) return;
  const key = `${hover.gx},${hover.gy},${selectedTool}`;
  if (key === lastPaintedKey) return;
  lastPaintedKey = key;

  const applied = sim.applyTool(
    hover.gx,
    hover.gy,
    selectedTool,
    room.localPlayer.name,
    false,
  );
  if (applied && room.roomCode) {
    room.send('tile_action', {
      kind: 'tile_action',
      gx: hover.gx,
      gy: hover.gy,
      tool: selectedTool,
      actorName: room.localPlayer.name,
    });
  }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (ui.isSplashOpen()) return;
  canvas.setPointerCapture(e.pointerId);
  updateHover(e.clientX, e.clientY);

  if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    camStartX = cam.x;
    camStartY = cam.y;
    canvas.style.cursor = 'grabbing';
    return;
  }

  if (e.button === 0) {
    isPainting = true;
    lastPaintedKey = '';
    tryPaintAtHover();
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (isPanning) {
    cam.x = camStartX + (e.clientX - panStartX);
    cam.y = camStartY + (e.clientY - panStartY);
    return;
  }

  updateHover(e.clientX, e.clientY);
  if (isPainting) {
    tryPaintAtHover();
  }
});

const endPointer = () => {
  isPainting = false;
  isPanning = false;
  lastPaintedKey = '';
  canvas.style.cursor = 'crosshair';
};

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const prevZoom = cam.zoom;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.max(0.5, Math.min(2.3, prevZoom * factor));

    const worldBefore = screenToWorld(e.clientX, e.clientY);
    cam.zoom = nextZoom;
    cam.x = e.clientX - canvas.width * 0.5 - worldBefore.wx * nextZoom;
    cam.y = e.clientY - canvas.height * 0.5 - worldBefore.wy * nextZoom;
  },
  { passive: false },
);

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    return;
  }

  if (ui.isSplashOpen() && (e.key === 'Enter' || e.key === ' ')) {
    ui.dismissSplash();
    monkeyAudio.play('fanfare', 0.22);
    return;
  }

  keys.add(e.key.toLowerCase());

  const toolByKey = TOOLS.find((t) => t.key === e.key);
  if (toolByKey) {
    selectedTool = toolByKey.id;
    ui.setSelectedTool(selectedTool);
    monkeyAudio.play('click', 0.14);
  } else if (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'x') {
    selectedTool = 'bulldozer';
    ui.setSelectedTool('bulldozer');
    monkeyAudio.play('click', 0.14);
  } else if (e.key === ' ') {
    e.preventDefault();
    sim.simSpeed = sim.simSpeed === 0 ? 1 : 0;
    ui.setSpeed(sim.simSpeed);
  } else if (e.key.toLowerCase() === 'c') {
    centerCamera();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

// Main game loop
let lastFrame = performance.now();
let netSyncTimer = 0;

function loop(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;

  // WASD / Arrow camera pan
  const panSpeed = 460 * dt;
  if (keys.has('w') || keys.has('arrowup')) cam.y += panSpeed;
  if (keys.has('s') || keys.has('arrowdown')) cam.y -= panSpeed;
  if (keys.has('a') || keys.has('arrowleft')) cam.x += panSpeed;
  if (keys.has('d') || keys.has('arrowright')) cam.x -= panSpeed;

  if (chaosCooldown > 0) {
    chaosCooldown = Math.max(0, chaosCooldown - dt);
    ui.setChaosCooldown(chaosCooldown);
  }

  sim.update(dt, isHostOrSolo());

  if (room.roomCode && room.localPlayer.isHost) {
    netSyncTimer += dt;
    if (netSyncTimer >= 3.0) {
      netSyncTimer = 0;
      room.send('state_sync', {
        kind: 'state_sync',
        snapshot: sim.exportSnapshot(),
      });
    }
  }

  renderer.render(canvas, sim, cam, hover, selectedTool, remoteCursors, dt);
  ui.update(sim);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
