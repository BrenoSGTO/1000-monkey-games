import { reportGameScore } from '@monkey-slop/sdk';
import { gameAudio } from './audio';
import { MultiplayerBridge } from './multiplayer';
import { MotorwaysRenderer } from './renderer';
import { cellKey, isAdjacent8 } from './roadNetwork';
import { TrafficSimulation } from './simulation';
import type { GridCoord, MapId, SimSpeed, ToolKind } from './types';
import { GameUI } from './ui';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const renderer = new MotorwaysRenderer();

let activeTool: ToolKind = 'road';
let nightMode = false;
let hoverCell: GridCoord | null = null;
let dragMode: 'none' | 'draw' | 'erase' | 'motorway' = 'none';
let lastDragCell: GridCoord | null = null;
let eraseStartCell: GridCoord | null = null;
let eraseDraggedEdge = false;
let motorwayAnchor: GridCoord | null = null;
let lastMapId: MapId = 'rio-de-bananeiro';
let scoreReportedForRun = false;

const sim = new TrafficSimulation({
  onToast: (msg, tone) => net.hud.toast(msg, tone),
  onUpgradeOffered: (options) => {
    ui.showUpgradeModal(options, sim.week);
  },
  onGameOver: (deliveries, reason) => {
    if (!scoreReportedForRun) {
      scoreReportedForRun = true;
      reportGameScore('monkey-motorways', deliveries, {
        map: sim.map.id,
        days: sim.day,
      });
    }
    ui.showGameOver(deliveries, reason, sim.day);
  },
  onPhaseChange: () => {
    if (sim.phase === 'playing') {
      ui.hideModal();
    } else if (sim.phase === 'menu') {
      ui.showMenu();
    }
  },
});

const net = new MultiplayerBridge(sim, {
  onRemoteStartGame: (mapId) => {
    startMap(mapId, false);
  },
  onSyncReceived: () => {
    if (sim.phase === 'playing') ui.hideModal();
  },
});

const ui = new GameUI({
  onSelectMap: (mapId) => {
    startMap(mapId, true);
  },
  onSelectTool: (tool) => {
    selectTool(tool);
  },
  onSetSpeed: (speed) => {
    applySpeed(speed, true);
  },
  onToggleNight: () => {
    toggleNightMode();
  },
  onOpenMenu: () => {
    sim.phase = 'menu';
    sim.speed = 0;
    motorwayAnchor = null;
    ui.showMenu();
  },
  onPickUpgrade: (index) => {
    if (net.isHost()) {
      sim.pickUpgrade(index);
      net.broadcastSnapshot(true);
    } else {
      net.sendAction({ kind: 'action:pick-upgrade', index });
      ui.hideModal();
    }
  },
  onRestart: () => {
    startMap(lastMapId, true);
  },
});

function selectTool(tool: ToolKind): void {
  activeTool = tool;
  motorwayAnchor = null;
  ui.setActiveTool(tool);
}

function toggleNightMode(): void {
  nightMode = !nightMode;
  ui.setNightMode(nightMode);
}

function startMap(mapId: MapId, broadcast: boolean): void {
  lastMapId = mapId;
  scoreReportedForRun = false;
  motorwayAnchor = null;
  if (net.isHost()) {
    sim.startGame(mapId);
    ui.hideModal();
    if (broadcast) net.broadcastSnapshot(true);
  } else if (broadcast) {
    net.sendAction({ kind: 'action:start-game', mapId });
    net.hud.toast('Pedindo para o Host iniciar a cidade...', 'info');
  }
}

function applySpeed(speed: SimSpeed, broadcast: boolean): void {
  sim.setSpeed(speed);
  if (broadcast && net.isOnline()) {
    net.sendAction({ kind: 'action:speed', speed });
  }
}

// Step from cell A to cell B one 8-neighbor cell at a time so fast drags never skip
function stepCellsBetween(a: GridCoord, b: GridCoord): GridCoord[] {
  const steps: GridCoord[] = [];
  let cx = a.x;
  let cy = a.y;
  let safety = 0;
  while ((cx !== b.x || cy !== b.y) && safety++ < 64) {
    const dx = Math.sign(b.x - cx);
    const dy = Math.sign(b.y - cy);
    cx += dx;
    cy += dy;
    steps.push({ x: cx, y: cy });
  }
  return steps;
}

function tryDrawRoadStep(from: GridCoord, to: GridCoord): void {
  if (!isAdjacent8(from.x, from.y, to.x, to.y)) return;
  const res = sim.network.addEdge(
    from.x,
    from.y,
    to.x,
    to.y,
    sim.map,
    sim.getLookup(),
    sim.inventory,
  );
  if (res.added) {
    gameAudio.playRoadDraw(res.usedBridge);
    net.sendAction({
      kind: 'action:road-add',
      ax: from.x,
      ay: from.y,
      bx: to.x,
      by: to.y,
    });
    if (net.isHost()) net.broadcastSnapshot(false);
  } else if (res.reason) {
    sim.addFloatingText(to.x + 0.5, to.y + 0.2, res.reason, '#fb7185');
  }
}

function tryEraseStep(from: GridCoord, to: GridCoord): void {
  if (isAdjacent8(from.x, from.y, to.x, to.y)) {
    if (sim.network.hasEdge(from.x, from.y, to.x, to.y)) {
      if (
        sim.network.removeEdge(
          from.x,
          from.y,
          to.x,
          to.y,
          sim.map,
          sim.inventory,
        )
      ) {
        eraseDraggedEdge = true;
        gameAudio.playRoadErase();
        net.sendAction({
          kind: 'action:road-erase-edge',
          ax: from.x,
          ay: from.y,
          bx: to.x,
          by: to.y,
        });
        if (net.isHost()) net.broadcastSnapshot(false);
        return;
      }
    }
  }
  // If user dragged onto a node without an edge between prev & current, erase content at target cell
  if (sim.network.removeCellContent(to.x, to.y, sim.map, sim.inventory)) {
    eraseDraggedEdge = true;
    gameAudio.playRoadErase();
    net.sendAction({ kind: 'action:erase-cell', gx: to.x, gy: to.y });
    if (net.isHost()) net.broadcastSnapshot(false);
  }
}

function getCanvasPointerCell(e: PointerEvent): GridCoord | null {
  const rect = canvas.getBoundingClientRect();
  return renderer.screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (sim.phase !== 'playing') return;
  const cell = getCanvasPointerCell(e);
  hoverCell = cell;
  if (!cell) return;

  canvas.setPointerCapture(e.pointerId);

  // Right-click always erases!
  if (e.button === 2 || activeTool === 'erase') {
    dragMode = 'erase';
    lastDragCell = cell;
    eraseStartCell = cell;
    eraseDraggedEdge = false;
    net.sendCursor(cell.x, cell.y, 'erase', true);
    return;
  }

  if (e.button !== 0) return;

  if (activeTool === 'road') {
    dragMode = 'draw';
    lastDragCell = cell;
    net.sendCursor(cell.x, cell.y, 'road', true);
    return;
  }

  if (activeTool === 'light') {
    const res = sim.network.toggleTrafficLight(
      cell.x,
      cell.y,
      sim.map,
      sim.getLookup(),
      sim.inventory,
    );
    if (res.changed) {
      gameAudio.playPlaceTool();
      net.sendAction({ kind: 'action:light-toggle', gx: cell.x, gy: cell.y });
      if (net.isHost()) net.broadcastSnapshot(true);
    } else if (res.reason) {
      sim.addFloatingText(cell.x + 0.5, cell.y + 0.2, res.reason, '#fb7185');
    }
    return;
  }

  if (activeTool === 'roundabout') {
    const res = sim.network.toggleRoundabout(
      cell.x,
      cell.y,
      sim.map,
      sim.getLookup(),
      sim.inventory,
    );
    if (res.changed) {
      gameAudio.playPlaceTool();
      net.sendAction({ kind: 'action:roundabout-toggle', gx: cell.x, gy: cell.y });
      if (net.isHost()) net.broadcastSnapshot(true);
    } else if (res.reason) {
      sim.addFloatingText(cell.x + 0.5, cell.y + 0.2, res.reason, '#fb7185');
    }
    return;
  }

  if (activeTool === 'motorway') {
    if (!motorwayAnchor) {
      motorwayAnchor = cell;
      dragMode = 'motorway';
    } else {
      finishMotorway(motorwayAnchor, cell);
      motorwayAnchor = null;
      dragMode = 'none';
    }
  }
});

function finishMotorway(a: GridCoord, b: GridCoord): void {
  if (a.x === b.x && a.y === b.y) return;
  const id = `mw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const res = sim.network.addMotorway(
    a.x,
    a.y,
    b.x,
    b.y,
    sim.map,
    sim.getLookup(),
    sim.inventory,
    id,
  );
  if (res.added) {
    gameAudio.playPlaceTool();
    sim.addFloatingText(b.x + 0.5, b.y + 0.2, 'Cipó Express! 🌿', '#bef264');
    net.sendAction({
      kind: 'action:motorway-add',
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
    });
    if (net.isHost()) net.broadcastSnapshot(true);
  } else if (res.reason) {
    sim.addFloatingText(b.x + 0.5, b.y + 0.2, res.reason, '#fb7185');
  }
}

canvas.addEventListener('pointermove', (e) => {
  const cell = getCanvasPointerCell(e);
  hoverCell = cell;
  if (!cell || sim.phase !== 'playing') return;

  net.sendCursor(
    cell.x,
    cell.y,
    dragMode === 'erase' ? 'erase' : activeTool,
    dragMode !== 'none',
  );

  if (dragMode === 'draw' && lastDragCell) {
    if (cell.x !== lastDragCell.x || cell.y !== lastDragCell.y) {
      const steps = stepCellsBetween(lastDragCell, cell);
      let prev = lastDragCell;
      for (const s of steps) {
        tryDrawRoadStep(prev, s);
        prev = s;
      }
      lastDragCell = cell;
    }
  } else if (dragMode === 'erase' && lastDragCell) {
    if (cell.x !== lastDragCell.x || cell.y !== lastDragCell.y) {
      const steps = stepCellsBetween(lastDragCell, cell);
      let prev = lastDragCell;
      for (const s of steps) {
        tryEraseStep(prev, s);
        prev = s;
      }
      lastDragCell = cell;
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  const cell = getCanvasPointerCell(e);
  if (dragMode === 'erase' && eraseStartCell && !eraseDraggedEdge) {
    // Single right-click or erase-click on a cell clears that cell's items/edges
    const target = cell ?? eraseStartCell;
    if (sim.network.removeCellContent(target.x, target.y, sim.map, sim.inventory)) {
      gameAudio.playRoadErase();
      net.sendAction({ kind: 'action:erase-cell', gx: target.x, gy: target.y });
      if (net.isHost()) net.broadcastSnapshot(true);
    }
  } else if (dragMode === 'motorway' && motorwayAnchor && cell) {
    if (Math.hypot(cell.x - motorwayAnchor.x, cell.y - motorwayAnchor.y) >= 2.2) {
      finishMotorway(motorwayAnchor, cell);
      motorwayAnchor = null;
    }
  }
  dragMode = 'none';
  lastDragCell = null;
  eraseStartCell = null;
  eraseDraggedEdge = false;
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === '1') selectTool('road');
  else if (e.key === '2') selectTool('light');
  else if (e.key === '3') selectTool('roundabout');
  else if (e.key === '4') selectTool('motorway');
  else if (e.key === '5') selectTool('erase');
  else if (e.key === ' ') {
    e.preventDefault();
    if (sim.phase === 'playing') {
      const next: SimSpeed = sim.speed === 0 ? sim.prePauseSpeed : 0;
      applySpeed(next, true);
    }
  } else if (e.key.toLowerCase() === 'f') {
    if (sim.phase === 'playing') {
      const next: SimSpeed = sim.speed === 2 ? 1 : 2;
      applySpeed(next, true);
    }
  } else if (e.key.toLowerCase() === 'n') {
    toggleNightMode();
  } else if (e.key === 'Escape') {
    if (motorwayAnchor) {
      motorwayAnchor = null;
    } else if (sim.phase === 'playing') {
      sim.phase = 'menu';
      sim.speed = 0;
      ui.showMenu();
    }
  }
});

// Subtle driveway check helper to keep RoadNetwork clean
void cellKey;

function handleResize(): void {
  renderer.resize(canvas);
}

window.addEventListener('resize', handleResize);
handleResize();
selectTool('road');
ui.showMenu();

let lastFrame = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.08, (now - lastFrame) / 1000);
  lastFrame = now;

  sim.update(dt);
  net.tickSync();

  renderer.render(ctx, sim, {
    hoverCell,
    activeTool,
    motorwayAnchor,
    nightMode,
    remoteCursors: Array.from(net.remoteCursors.values()),
  });
  ui.update(sim);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
