import { monkeyAudio, mountMonkeyHud, PeerRoom, reportGameScore } from '@monkey-slop/sdk';
import { computeLPath, gridToWorld, inBounds, TOWN_HALL_POS, worldToGrid } from './map';
import { CityRenderer, type CameraState, type HoverState } from './renderer';
import { CitySimulation } from './simulation';
import {
  DOCK_TOOLS,
  type CityNetMessage,
  type DisasterType,
  type GameMode,
  type OverlayMode,
  type RemoteCursor,
  type ToolType,
  type UndoEntry,
} from './types';
import { CityUi } from './ui';

const SLUG = 'monkey-skylines';
const TITLE = 'Símio City: Prefeitura do Caos';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let viewW = window.innerWidth;
let viewH = window.innerHeight;

function syncCanvasSize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
syncCanvasSize();
window.addEventListener('resize', syncCanvasSize);

let selectedTool: ToolType = 'power';
let overlayMode: OverlayMode = 'normal';
let pingMode = false;
let chaosCooldown = 0;
let inspectedTile: { gx: number; gy: number } | null = null;
const undoStack: UndoEntry[] = [];
const remoteCursors = new Map<string, RemoteCursor>();

// 2P Local turn-based state
let localTurnIndex: 0 | 1 = 0;
let localTurnTimer = 30;

const starterWorld = gridToWorld(TOWN_HALL_POS.gx, TOWN_HALL_POS.gy + 1);
const cam: CameraState = {
  x: -starterWorld.wx * 1.15,
  y: -starterWorld.wy * 1.15,
  zoom: 1.15,
};

function centerCamera(): void {
  cam.zoom = 1.15;
  cam.x = -starterWorld.wx * cam.zoom;
  cam.y = -starterWorld.wy * cam.zoom;
}
centerCamera();

let hud!: ReturnType<typeof mountMonkeyHud<CityNetMessage>>;
let ui!: CityUi;
let sim!: CitySimulation;
let lastPlayerCount = 0;
let hasInitialSync = false;

function isHostOrSolo(): boolean {
  return !room.roomCode || room.localPlayer.isHost;
}

function getActiveActor(): { name: string; color: string; id: string } {
  if (!room.roomCode && sim && sim.mode === 'local2p') {
    return localTurnIndex === 0
      ? { name: 'Prefeito P1', color: '#facc15', id: 'local-p1' }
      : { name: 'Vice-Prefeito P2', color: '#38bdf8', id: 'local-p2' };
  }
  return {
    name: room.localPlayer.name,
    color: room.localPlayer.color,
    id: room.localPlayer.id,
  };
}

function pushUndo(entry: UndoEntry | null): void {
  if (!entry) return;
  undoStack.push(entry);
  if (undoStack.length > 20) undoStack.shift();
  ui.setUndoEnabled(undoStack.length > 0);
}

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
        sim.applyTool(
          msg.gx,
          msg.gy,
          msg.tool,
          msg.actorName,
          true,
          msg.actorColor,
          room.localPlayer.isHost,
        );
        break;
      }
      case 'road_batch': {
        sim.applyRoadBatch(
          msg.coords,
          msg.actorName,
          msg.actorColor,
          true,
          room.localPlayer.isHost,
        );
        break;
      }
      case 'repair_tile': {
        sim.repairTile(msg.gx, msg.gy, msg.actorName, true, room.localPlayer.isHost);
        break;
      }
      case 'undo_batch': {
        sim.applyUndo(msg.entry);
        hud.toast(`↩️ ${msg.actorName} desfez: ${msg.entry.label}`, 'info');
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
      case 'map_ping': {
        sim.addPing(msg.gx, msg.gy, msg.actorName, msg.color);
        break;
      }
      case 'set_speed': {
        sim.simSpeed = msg.speed;
        ui.setSpeed(msg.speed);
        hud.toast(`⏱️ ${msg.actorName} ajustou velocidade: ${msg.speed === 0 ? 'Pausa' : `${msg.speed}x`}`, 'info');
        break;
      }
      case 'trigger_disaster': {
        sim.incomingDisaster = null;
        sim.triggerDisaster(msg.disasterType, msg.actorName, msg.seedX, msg.seedY);
        break;
      }
      case 'incoming_disaster': {
        sim.setIncomingDisaster(msg.incoming);
        break;
      }
      case 'decree_start_vote': {
        sim.startDecreeVote(msg.id, msg.pairIndex, msg.duration);
        break;
      }
      case 'decree_vote': {
        const isSingle = !room.roomCode || room.getPlayers().length <= 1;
        sim.castDecreeVote(msg.decreeId, msg.optionIndex, msg.voterId, msg.voterName, isSingle);
        break;
      }
      case 'crisis_event': {
        sim.crisisTriggered = true;
        monkeyAudio.play('rage', 0.3);
        ui.showCrisisModal(msg.reason);
        break;
      }
      case 'loan_rescue': {
        sim.stats.bananas += 350;
        sim.stats.bankruptTimer = 0;
        sim.stats.rebellionTimer = 0;
        sim.stats.happiness = Math.max(sim.stats.happiness, 55);
        sim.crisisTriggered = false;
        ui.closeCrisisModal();
        hud.toast(`🦍 ${msg.actorName} pegou empréstimo do Agiota (+350🍌)`, 'banana');
        monkeyAudio.play('banana', 0.25);
        break;
      }
      case 'state_sync': {
        if (!room.localPlayer.isHost) {
          sim.importSnapshot(msg.snapshot, hasInitialSync);
          ui.setSpeed(sim.simSpeed);
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
        sim.reset(msg.seed, msg.mode);
        undoStack.length = 0;
        ui.setUndoEnabled(false);
        ui.closeInspector();
        inspectedTile = null;
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
  onMissionComplete: (mission) => {
    hud.toast(`✅ Missão concluída: ${mission.title} (+${mission.reward}🍌)`, 'banana');
  },
  onCrisis: (reason) => {
    monkeyAudio.play('rage', 0.3);
    reportGameScore(SLUG, sim.getScore(), {
      population: sim.stats.population,
      day: sim.stats.day,
    });
    ui.showCrisisModal(reason);
    if (room.roomCode && room.localPlayer.isHost) {
      room.send('crisis_event', { kind: 'crisis_event', reason });
    }
  },
  onAutoDisaster: (disasterType, seedX, seedY) => {
    if (room.roomCode && room.localPlayer.isHost) {
      room.send('trigger_disaster', {
        kind: 'trigger_disaster',
        disasterType,
        actorName: 'Mãe Selva',
        seedX,
        seedY,
      });
    }
  },
  onIncomingDisaster: (incoming) => {
    if (room.roomCode && room.localPlayer.isHost) {
      room.send('incoming_disaster', { kind: 'incoming_disaster', incoming });
    }
  },
  onStartDecreeVote: (id, pairIndex, duration) => {
    if (room.roomCode && room.localPlayer.isHost) {
      room.send('decree_start_vote', { kind: 'decree_start_vote', id, pairIndex, duration });
    }
  },
  onDesyncResync: () => {
    if (room.roomCode && room.localPlayer.isHost) {
      room.send('state_sync', { kind: 'state_sync', snapshot: sim.exportSnapshot() });
    }
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

function selectTool(tool: ToolType): void {
  selectedTool = tool;
  pingMode = false;
  ui.setPingMode(false);
  ui.setSelectedTool(tool);
  if (tool !== 'inspect') {
    inspectedTile = null;
    ui.closeInspector();
  }
}

ui = new CityUi({
  onSelectTool: (tool) => {
    selectTool(tool);
    monkeyAudio.play('click', 0.16);
  },
  onSetSpeed: (speed) => {
    sim.simSpeed = speed;
    ui.setSpeed(speed);
    monkeyAudio.play('click', 0.16);
    if (room.roomCode) {
      room.send('set_speed', { kind: 'set_speed', speed, actorName: room.localPlayer.name });
    }
  },
  onSetOverlay: (overlay) => {
    overlayMode = overlay;
    ui.setOverlay(overlay);
    monkeyAudio.play('click', 0.14);
  },
  onUndo: () => {
    const entry = undoStack.pop();
    if (!entry) return;
    sim.applyUndo(entry);
    ui.setUndoEnabled(undoStack.length > 0);
    hud.toast(`↩️ Desfeito: ${entry.label}`, 'info');
    if (room.roomCode) {
      room.send('undo_batch', {
        kind: 'undo_batch',
        entry,
        actorName: room.localPlayer.name,
      });
    }
  },
  onTogglePingMode: () => {
    pingMode = !pingMode;
    ui.setPingMode(pingMode);
    monkeyAudio.play('click', 0.15);
    if (pingMode) {
      hud.toast('📍 Clique em qualquer ponto do mapa para pingar!', 'info');
    }
  },
  onChaosButton: () => {
    if (chaosCooldown > 0) return;
    chaosCooldown = 12;
    ui.setChaosCooldown(chaosCooldown);

    const types: DisasterType[] = ['giant_gorilla', 'trio_eletrico', 'coconut_rain', 'strike'];
    const pick = types[Math.floor(Math.random() * types.length)];
    const seedX = Math.random();
    const seedY = Math.random();
    const actor = getActiveActor().name;

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
  onResetCity: (mode?: GameMode) => {
    const score = sim.getScore();
    if (score > 0) {
      reportGameScore(SLUG, score, {
        population: sim.stats.population,
        day: sim.stats.day,
      });
    }
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    const targetMode = mode ?? sim.mode;
    sim.reset(newSeed, targetMode);
    undoStack.length = 0;
    ui.setUndoEnabled(false);
    inspectedTile = null;
    ui.closeInspector();
    ui.closeCrisisModal();
    localTurnIndex = 0;
    localTurnTimer = 30;
    centerCamera();
    monkeyAudio.play('boing', 0.22);
    if (room.roomCode) {
      room.send('reset_city', {
        kind: 'reset_city',
        seed: newSeed,
        mode: targetMode,
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
    if (room.roomCode) {
      room.send('loan_rescue', { kind: 'loan_rescue', actorName: room.localPlayer.name });
      if (room.localPlayer.isHost) {
        room.send('state_sync', { kind: 'state_sync', snapshot: sim.exportSnapshot() });
      }
    }
  },
  onStartGame: (mode) => {
    if (mode !== sim.mode || sim.stats.day > 1) {
      const newSeed = Math.floor(Math.random() * 999999) + 1;
      sim.reset(newSeed, mode);
      undoStack.length = 0;
      ui.setUndoEnabled(false);
      localTurnIndex = 0;
      localTurnTimer = 30;
      centerCamera();
    }
    monkeyAudio.play('fanfare', 0.22);
  },
  onRepairTile: (gx, gy) => {
    const actor = getActiveActor();
    if (sim.repairTile(gx, gy, actor.name, false, isHostOrSolo()) && room.roomCode) {
      room.send('repair_tile', { kind: 'repair_tile', gx, gy, actorName: actor.name });
    }
  },
  onDemolishTile: (gx, gy) => {
    const actor = getActiveActor();
    const entry = sim.applyTool(gx, gy, 'bulldozer', actor.name, false, actor.color, isHostOrSolo());
    pushUndo(entry);
    inspectedTile = null;
    if (entry && room.roomCode) {
      room.send('tile_action', {
        kind: 'tile_action',
        gx,
        gy,
        tool: 'bulldozer',
        actorName: actor.name,
        actorColor: actor.color,
      });
    }
  },
  onCloseInspector: () => {
    inspectedTile = null;
  },
  onVoteDecree: (optionIndex) => {
    if (sim.decree.phase !== 'voting') return;
    const actor = getActiveActor();
    const isSingle = !room.roomCode || room.getPlayers().length <= 1;
    sim.castDecreeVote(sim.decree.id, optionIndex, actor.id, actor.name, isSingle);
    if (room.roomCode) {
      room.send('decree_vote', {
        kind: 'decree_vote',
        decreeId: sim.decree.id,
        optionIndex,
        voterId: actor.id,
        voterName: actor.name,
      });
    }
  },
  onPassTurn: () => {
    if (sim.mode !== 'local2p') return;
    localTurnIndex = localTurnIndex === 0 ? 1 : 0;
    localTurnTimer = 30;
    const actor = getActiveActor();
    hud.toast(`⏱️ Turno passado! Agora joga: ${actor.name}`, 'info');
    monkeyAudio.play('boing', 0.18);
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

// Smart L-shaped road drag state
let roadDragStart: { gx: number; gy: number } | null = null;
let roadHorizontalFirst: boolean | null = null;
let roadPreview: Array<{ gx: number; gy: number }> | null = null;

function screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
  return {
    wx: (sx - viewW * 0.5 - cam.x) / cam.zoom,
    wy: (sy - viewH * 0.5 - cam.y) / cam.zoom,
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

  const actor = getActiveActor();
  const entry = sim.applyTool(
    hover.gx,
    hover.gy,
    selectedTool,
    actor.name,
    false,
    actor.color,
    isHostOrSolo(),
  );
  pushUndo(entry);
  if (entry && room.roomCode) {
    room.send('tile_action', {
      kind: 'tile_action',
      gx: hover.gx,
      gy: hover.gy,
      tool: selectedTool,
      actorName: actor.name,
      actorColor: actor.color,
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

  if (e.button === 0 && hover && hover.valid) {
    if (pingMode) {
      const actor = getActiveActor();
      sim.addPing(hover.gx, hover.gy, actor.name, actor.color);
      if (room.roomCode) {
        room.send('map_ping', {
          kind: 'map_ping',
          gx: hover.gx,
          gy: hover.gy,
          actorName: actor.name,
          color: actor.color,
        });
      }
      pingMode = false;
      ui.setPingMode(false);
      return;
    }

    if (selectedTool === 'inspect') {
      inspectedTile = { gx: hover.gx, gy: hover.gy };
      ui.inspectTile(sim.grid[hover.gy][hover.gx], sim);
      monkeyAudio.play('click', 0.14);
      return;
    }

    if (selectedTool === 'road') {
      roadDragStart = { gx: hover.gx, gy: hover.gy };
      roadHorizontalFirst = null;
      roadPreview = [roadDragStart];
      return;
    }

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

  if (roadDragStart && hover && hover.valid) {
    const dx = Math.abs(hover.gx - roadDragStart.gx);
    const dy = Math.abs(hover.gy - roadDragStart.gy);
    if (roadHorizontalFirst === null && (dx > 0 || dy > 0)) {
      roadHorizontalFirst = dx >= dy;
    }
    roadPreview = computeLPath(roadDragStart, { gx: hover.gx, gy: hover.gy }, roadHorizontalFirst ?? true);
    return;
  }

  if (isPainting) {
    tryPaintAtHover();
  }
});

const endPointer = () => {
  if (roadDragStart && roadPreview && roadPreview.length > 0) {
    const actor = getActiveActor();
    const entry = sim.applyRoadBatch(roadPreview, actor.name, actor.color, false, isHostOrSolo());
    pushUndo(entry);
    if (entry && room.roomCode) {
      room.send('road_batch', {
        kind: 'road_batch',
        coords: roadPreview,
        actorName: actor.name,
        actorColor: actor.color,
      });
    }
  }
  roadDragStart = null;
  roadHorizontalFirst = null;
  roadPreview = null;
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
    cam.x = e.clientX - viewW * 0.5 - worldBefore.wx * nextZoom;
    cam.y = e.clientY - viewH * 0.5 - worldBefore.wy * nextZoom;
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

  // Undo shortcut Ctrl+Z / Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    const entry = undoStack.pop();
    if (entry) {
      sim.applyUndo(entry);
      ui.setUndoEnabled(undoStack.length > 0);
      hud.toast(`↩️ Desfeito: ${entry.label}`, 'info');
      if (room.roomCode) {
        room.send('undo_batch', { kind: 'undo_batch', entry, actorName: room.localPlayer.name });
      }
    }
    return;
  }

  keys.add(e.key.toLowerCase());

  if (e.key === 'Escape') {
    if (pingMode) {
      pingMode = false;
      ui.setPingMode(false);
    } else if (inspectedTile) {
      inspectedTile = null;
      ui.closeInspector();
    } else {
      selectTool('inspect');
      monkeyAudio.play('click', 0.14);
    }
    return;
  }

  const toolByKey = DOCK_TOOLS.find((t) => t.key === e.key);
  if (toolByKey) {
    selectTool(toolByKey.id);
    monkeyAudio.play('click', 0.14);
  } else if (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'x') {
    selectTool('bulldozer');
    monkeyAudio.play('click', 0.14);
  } else if (e.key.toLowerCase() === 'p') {
    if (hover && hover.valid) {
      const actor = getActiveActor();
      sim.addPing(hover.gx, hover.gy, actor.name, actor.color);
      if (room.roomCode) {
        room.send('map_ping', {
          kind: 'map_ping',
          gx: hover.gx,
          gy: hover.gy,
          actorName: actor.name,
          color: actor.color,
        });
      }
    } else {
      pingMode = !pingMode;
      ui.setPingMode(pingMode);
    }
  } else if (e.key.toLowerCase() === 'v') {
    const order: OverlayMode[] = ['normal', 'power', 'happiness', 'pollution'];
    const next = order[(order.indexOf(overlayMode) + 1) % order.length];
    overlayMode = next;
    ui.setOverlay(next);
    monkeyAudio.play('click', 0.14);
  } else if (e.key === ' ') {
    e.preventDefault();
    sim.simSpeed = sim.simSpeed === 0 ? 1 : 0;
    ui.setSpeed(sim.simSpeed);
    if (room.roomCode) {
      room.send('set_speed', { kind: 'set_speed', speed: sim.simSpeed, actorName: room.localPlayer.name });
    }
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

  // 2P Local turn countdown
  const local2pActive = !room.roomCode && sim.mode === 'local2p' && !ui.isSplashOpen();
  if (local2pActive && sim.simSpeed > 0 && !sim.crisisTriggered) {
    localTurnTimer -= dt * sim.simSpeed;
    if (localTurnTimer <= 0) {
      localTurnIndex = localTurnIndex === 0 ? 1 : 0;
      localTurnTimer = 30;
      const actor = getActiveActor();
      hud.toast(`⏱️ Troca de turno! Agora governa: ${actor.name}`, 'banana');
      monkeyAudio.play('boing', 0.2);
    }
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

  renderer.render(sim, cam, hover, selectedTool, remoteCursors, dt, {
    viewW,
    viewH,
    overlay: overlayMode,
    roadPreview,
    inspectedTile,
    pingMode,
  });

  ui.update(
    sim,
    local2pActive
      ? {
          active: true,
          playerLabel: getActiveActor().name,
          secondsLeft: localTurnTimer,
        }
      : undefined,
  );

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
