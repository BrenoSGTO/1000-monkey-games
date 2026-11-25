import { reportGameScore } from '@monkey-slop/sdk';
import { gameAudio } from './audio';
import { PING_PRESETS } from './constants';
import { MultiplayerBridge } from './multiplayer';
import { MotorwaysRenderer } from './renderer';
import { inBounds, isAdjacent8, type RoadPathPreview } from './roadNetwork';
import { TrafficSimulation } from './simulation';
import type { GridCoord, MapId, SimSpeed, ToolKind } from './types';
import { GameUI } from './ui';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const renderer = new MotorwaysRenderer();

type UndoEntry =
  | { kind: 'road-stroke'; edges: Array<{ ax: number; ay: number; bx: number; by: number }> }
  | {
      kind: 'erase-stroke';
      edges: Array<{ ax: number; ay: number; bx: number; by: number }>;
      light?: GridCoord;
      roundabout?: GridCoord;
      motorway?: { ax: number; ay: number; bx: number; by: number };
    }
  | { kind: 'light-toggle'; gx: number; gy: number }
  | { kind: 'roundabout-toggle'; gx: number; gy: number }
  | { kind: 'motorway-add'; id: string; ax: number; ay: number; bx: number; by: number };

let activeTool: ToolKind = 'road';
let nightMode = false;
let hoverCell: GridCoord | null = null;
let dragMode: 'none' | 'draw' | 'erase' | 'motorway' = 'none';
let previewCells: GridCoord[] = [];
let roadPreview: RoadPathPreview | null = null;
let lastDragCell: GridCoord | null = null;
let eraseStartCell: GridCoord | null = null;
let eraseDraggedEdge = false;
let currentEraseUndo: Extract<UndoEntry, { kind: 'erase-stroke' }> | null = null;
let motorwayAnchor: GridCoord | null = null;
let lastMapId: MapId = 'rio-de-bananeiro';
let scoreReportedForRun = false;
let localMenuOpen = false;
let pausedByControls = false;
let photoMode = false;
let replayActive = false;
let replayProgress = 0;

const undoStack: UndoEntry[] = [];
function pushUndo(entry: UndoEntry): void {
  undoStack.push(entry);
  if (undoStack.length > 25) undoStack.shift();
  ui.setUndoAvailable(undoStack.length);
}
function clearUndo(): void {
  undoStack.length = 0;
  ui.setUndoAvailable(0);
}

const sim = new TrafficSimulation({
  onToast: (msg, tone) => net.hud.toast(msg, tone),
  onEmitFx: (msg) => net.emitFx(msg),
  onUpgradeOffered: (options) => {
    localMenuOpen = false;
    photoMode = false;
    ui.showUpgradeModal(
      options,
      sim,
      net.room.getPlayers(),
      net.getLocalActor().id,
      net.isHost(),
    );
  },
  onUpgradeVotesChange: () => {
    if (sim.phase === 'upgrade' && sim.pendingUpgrades) {
      ui.refreshUpgradeVotes(
        sim.pendingUpgrades,
        sim,
        net.room.getPlayers(),
        net.getLocalActor().id,
        net.isHost(),
      );
    }
  },
  onGameOver: (deliveries, reason) => {
    localMenuOpen = false;
    photoMode = false;
    replayActive = false;
    if (!scoreReportedForRun) {
      scoreReportedForRun = true;
      reportGameScore('monkey-motorways', deliveries, {
        map: sim.map.id,
        days: sim.day,
      });
    }
    ui.showGameOver(sim, reason);
  },
  onPhaseChange: () => {
    if (sim.phase === 'playing' && !localMenuOpen) {
      ui.hideModal();
    } else if (sim.phase === 'menu') {
      ui.showMenu(false);
    }
  },
});

const net = new MultiplayerBridge(sim, {
  onRemoteStartGame: (mapId) => {
    startMap(mapId, false);
  },
  onSyncReceived: () => {
    if (sim.phase === 'playing' && !localMenuOpen && !photoMode) {
      ui.hideModal();
    }
  },
  onUpgradeConsensusCheck: () => {
    checkUpgradeConsensus();
  },
  onControlsOpenChange: (open) => {
    if (open) {
      dragMode = 'none';
      previewCells = [];
      roadPreview = null;
      motorwayAnchor = null;
      if (sim.phase === 'playing' && !localMenuOpen && !net.isOnline() && sim.speed !== 0) {
        pausedByControls = true;
        sim.setSpeed(0);
      }
    } else if (pausedByControls) {
      pausedByControls = false;
      if (sim.phase === 'playing' && !localMenuOpen && !net.isOnline()) {
        sim.setSpeed(sim.prePauseSpeed);
      }
    }
  },
});

function checkUpgradeConsensus(): void {
  if (!net.isHost() || sim.phase !== 'upgrade' || !sim.pendingUpgrades) return;
  const players = net.room.getPlayers();
  if (players.length <= 1) return;

  const allVoted = players.every((p) => sim.upgradeVotes[p.id] !== undefined);
  if (!allVoted) return;

  const winner = computeWinningUpgradeIndex();
  net.hud.toast('✅ Equipe votou! Aplicando pacote escolhido...', 'banana');
  setTimeout(() => {
    if (sim.phase === 'upgrade' && net.isHost()) {
      sim.pickUpgrade(winner);
      net.broadcastSnapshot(true);
    }
  }, 380);
}

function computeWinningUpgradeIndex(): number {
  const counts = new Map<number, number>();
  for (const idx of Object.values(sim.upgradeVotes)) {
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  const hostVote = sim.upgradeVotes[net.getLocalActor().id];
  let bestIdx = hostVote ?? 0;
  let bestVotes = -1;
  for (const [idx, count] of counts.entries()) {
    if (count > bestVotes || (count === bestVotes && idx === hostVote)) {
      bestVotes = count;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

const ui = new GameUI({
  onSelectMap: (mapId) => {
    startMap(mapId, true);
  },
  onSelectTool: (tool) => {
    selectTool(tool);
  },
  onSelectPingPreset: () => {
    selectTool('ping');
  },
  onSetSpeed: (speed) => {
    applySpeed(speed, true);
  },
  onUndo: () => {
    performUndo();
  },
  onToggleNight: () => {
    toggleNightMode();
  },
  onOpenMenu: () => {
    openLocalMenu();
  },
  onVoteOrPickUpgrade: (index) => {
    if (!net.isOnline()) {
      sim.pickUpgrade(index);
      return;
    }
    const actor = net.getLocalActor();
    sim.castUpgradeVote(actor.id, index);
    net.sendAction({ kind: 'action:vote-upgrade', index, actor });
    if (net.isHost()) {
      net.broadcastSnapshot(true);
      checkUpgradeConsensus();
    }
  },
  onHostConfirmUpgrade: () => {
    if (!net.isHost() || sim.phase !== 'upgrade') return;
    const winner = computeWinningUpgradeIndex();
    sim.pickUpgrade(winner);
    net.broadcastSnapshot(true);
  },
  onRestart: () => {
    startMap(lastMapId, true);
  },
  onEnterPhotoMode: () => {
    photoMode = true;
    replayActive = false;
    ui.hideModal();
    ui.setReplayButtonActive(false);
  },
  onExitPhotoMode: () => {
    photoMode = false;
    replayActive = false;
    ui.setReplayButtonActive(false);
    ui.showGameOver(sim, sim.gameOverReason ?? 'Caos no trânsito!');
  },
  onStartReplay: () => {
    if (replayActive) {
      replayActive = false;
      ui.setReplayButtonActive(false);
    } else {
      replayActive = true;
      replayProgress = 0;
      ui.setReplayButtonActive(true);
    }
  },
  onDownloadSnapshot: () => {
    const link = document.createElement('a');
    link.download = `mini-macacoways-${sim.map.id}-d${sim.day}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    net.hud.toast('📸 Foto salva do mapa!', 'banana');
  },
});

function openLocalMenu(): void {
  localMenuOpen = true;
  motorwayAnchor = null;
  previewCells = [];
  roadPreview = null;
  dragMode = 'none';

  const canResume = sim.phase === 'playing';
  if (canResume && !net.isOnline()) {
    sim.setSpeed(0);
  }
  ui.showMenu(canResume, () => {
    localMenuOpen = false;
    ui.hideModal();
    if (canResume && !net.isOnline()) {
      sim.setSpeed(sim.prePauseSpeed);
    }
  });
}

function selectTool(tool: ToolKind): void {
  activeTool = tool;
  motorwayAnchor = null;
  previewCells = [];
  roadPreview = null;
  dragMode = 'none';
  ui.setActiveTool(tool);
}

function toggleNightMode(): void {
  nightMode = !nightMode;
  ui.setNightMode(nightMode);
}

function startMap(mapId: MapId, broadcast: boolean): void {
  lastMapId = mapId;
  scoreReportedForRun = false;
  localMenuOpen = false;
  photoMode = false;
  replayActive = false;
  motorwayAnchor = null;
  previewCells = [];
  roadPreview = null;
  dragMode = 'none';
  clearUndo();

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

/**
 * Steps from cell A to cell B one 8-neighbor at a time, choosing orthogonal
 * detours if a diagonal step hits an obstacle or crosses water illegally.
 */
function stepCellsBetweenSmart(a: GridCoord, b: GridCoord): GridCoord[] {
  const steps: GridCoord[] = [];
  let cx = a.x;
  let cy = a.y;
  let safety = 0;

  while ((cx !== b.x || cy !== b.y) && safety++ < 64) {
    const dx = Math.sign(b.x - cx);
    const dy = Math.sign(b.y - cy);

    let nx = cx + dx;
    let ny = cy + dy;

    if (dx !== 0 && dy !== 0 && inBounds(nx, ny)) {
      const targetTile = sim.map.tiles[ny][nx];
      const curTile = sim.map.tiles[cy][cx];
      const crossesWaterDiag =
        targetTile === 'water' ||
        curTile === 'water' ||
        (sim.map.tiles[cy][nx] === 'water' && sim.map.tiles[ny][cx] === 'water');
      const hitsObstacle = targetTile === 'tree' || targetTile === 'rock';

      if (crossesWaterDiag || hitsObstacle) {
        const opt1Tile = sim.map.tiles[cy][cx + dx];
        const opt2Tile = sim.map.tiles[cy + dy][cx];
        const opt1Ok = opt1Tile !== 'tree' && opt1Tile !== 'rock';
        const opt2Ok = opt2Tile !== 'tree' && opt2Tile !== 'rock';
        if (opt1Ok && (opt1Tile === 'land' || !opt2Ok)) {
          nx = cx + dx;
          ny = cy;
        } else if (opt2Ok) {
          nx = cx;
          ny = cy + dy;
        }
      }
    }

    cx = nx;
    cy = ny;
    steps.push({ x: cx, y: cy });
  }
  return steps;
}

function appendPreviewCell(cell: GridCoord): void {
  if (previewCells.length === 0) {
    previewCells = [cell];
    return;
  }
  const last = previewCells[previewCells.length - 1];
  if (last.x === cell.x && last.y === cell.y) return;

  const steps = stepCellsBetweenSmart(last, cell);
  for (const s of steps) {
    const len = previewCells.length;
    if (len >= 2 && previewCells[len - 2].x === s.x && previewCells[len - 2].y === s.y) {
      // User backtracked one cell — trim cleanly!
      previewCells.pop();
    } else {
      previewCells.push(s);
    }
  }
  roadPreview = sim.network.previewRoadPath(
    previewCells,
    sim.map,
    sim.getLookup(),
    sim.inventory,
  );
}

function commitRoadPreview(): void {
  if (!roadPreview || roadPreview.segments.length === 0) {
    previewCells = [];
    roadPreview = null;
    return;
  }

  const actor = net.getLocalActor();
  const committed: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  let lastReason: string | undefined;
  let lastBadCell: GridCoord | null = null;
  let usedAnyBridge = false;

  for (const seg of roadPreview.segments) {
    if (!seg.valid) {
      if (seg.reason) {
        lastReason = seg.reason;
        lastBadCell = { x: seg.bx, y: seg.by };
      }
      continue;
    }
    const res = sim.network.addEdge(
      seg.ax,
      seg.ay,
      seg.bx,
      seg.by,
      sim.map,
      sim.getLookup(),
      sim.inventory,
    );
    if (res.added) {
      committed.push({ ax: seg.ax, ay: seg.ay, bx: seg.bx, by: seg.by });
      if (res.usedBridge) usedAnyBridge = true;
      sim.recordActionStat(actor, res.usedBridge ? 'bridge' : 'road', 1);
      sim.recordBuildHistory({
        kind: 'road',
        x: seg.ax,
        y: seg.ay,
        bx: seg.bx,
        by: seg.by,
        isBridge: res.usedBridge,
      });
      net.sendOptimisticMutation({
        kind: 'action:road-add',
        ax: seg.ax,
        ay: seg.ay,
        bx: seg.bx,
        by: seg.by,
      });
    } else if (res.reason) {
      lastReason = res.reason;
      lastBadCell = { x: seg.bx, y: seg.by };
    }
  }

  if (committed.length > 0) {
    gameAudio.playRoadDraw(usedAnyBridge);
    pushUndo({ kind: 'road-stroke', edges: committed });
    if (net.isHost()) net.broadcastSnapshot(true);
  } else if (lastReason && lastBadCell) {
    sim.addFloatingText(lastBadCell.x + 0.5, lastBadCell.y + 0.2, lastReason, '#fb7185');
  }

  previewCells = [];
  roadPreview = null;
}

function tryEraseStep(from: GridCoord, to: GridCoord): void {
  const actor = net.getLocalActor();
  if (isAdjacent8(from.x, from.y, to.x, to.y) && sim.network.hasEdge(from.x, from.y, to.x, to.y)) {
    if (sim.network.removeEdge(from.x, from.y, to.x, to.y, sim.map, sim.inventory)) {
      eraseDraggedEdge = true;
      currentEraseUndo?.edges.push({ ax: from.x, ay: from.y, bx: to.x, by: to.y });
      sim.recordActionStat(actor, 'erase', 1);
      gameAudio.playRoadErase();
      net.sendOptimisticMutation({
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

  const res = sim.network.removeCellContentDetailed(to.x, to.y, sim.map, sim.inventory);
  if (res.changed) {
    eraseDraggedEdge = true;
    recordDetailedEraseUndo(to, res);
    sim.recordActionStat(actor, 'erase', 1);
    gameAudio.playRoadErase();
    net.sendOptimisticMutation({ kind: 'action:erase-cell', gx: to.x, gy: to.y });
    if (net.isHost()) net.broadcastSnapshot(false);
  }
}

function recordDetailedEraseUndo(
  cell: GridCoord,
  res: ReturnType<typeof sim.network.removeCellContentDetailed>,
): void {
  if (!currentEraseUndo) return;
  for (const e of res.removedEdges) currentEraseUndo.edges.push(e);
  if (res.removedLight) currentEraseUndo.light = { x: cell.x, y: cell.y };
  if (res.removedRoundabout) currentEraseUndo.roundabout = { x: cell.x, y: cell.y };
  if (res.removedMotorway) {
    currentEraseUndo.motorway = {
      ax: res.removedMotorway.ax,
      ay: res.removedMotorway.ay,
      bx: res.removedMotorway.bx,
      by: res.removedMotorway.by,
    };
  }
}

function performUndo(): void {
  if (sim.phase !== 'playing') return;
  const entry = undoStack.pop();
  ui.setUndoAvailable(undoStack.length);
  if (!entry) return;

  const lookup = sim.getLookup();

  if (entry.kind === 'road-stroke') {
    let any = false;
    for (let i = entry.edges.length - 1; i >= 0; i--) {
      const e = entry.edges[i];
      if (sim.network.removeEdge(e.ax, e.ay, e.bx, e.by, sim.map, sim.inventory)) {
        any = true;
        net.sendOptimisticMutation({
          kind: 'action:road-erase-edge',
          ax: e.ax,
          ay: e.ay,
          bx: e.bx,
          by: e.by,
        });
      }
    }
    if (any) {
      gameAudio.playRoadErase();
      const tip = entry.edges[entry.edges.length - 1];
      sim.addFloatingText(tip.bx + 0.5, tip.by + 0.2, '↩️ Desfeito!', '#fde047');
      if (net.isHost()) net.broadcastSnapshot(true);
    }
  } else if (entry.kind === 'erase-stroke') {
    let any = false;
    for (const e of entry.edges) {
      const res = sim.network.addEdge(e.ax, e.ay, e.bx, e.by, sim.map, lookup, sim.inventory);
      if (res.added) {
        any = true;
        net.sendOptimisticMutation({
          kind: 'action:road-add',
          ax: e.ax,
          ay: e.ay,
          bx: e.bx,
          by: e.by,
        });
      }
    }
    if (entry.light) {
      const res = sim.network.toggleTrafficLight(
        entry.light.x,
        entry.light.y,
        sim.map,
        lookup,
        sim.inventory,
      );
      if (res.changed) {
        any = true;
        net.sendOptimisticMutation({
          kind: 'action:light-toggle',
          gx: entry.light.x,
          gy: entry.light.y,
        });
      }
    }
    if (entry.roundabout) {
      const res = sim.network.toggleRoundabout(
        entry.roundabout.x,
        entry.roundabout.y,
        sim.map,
        lookup,
        sim.inventory,
      );
      if (res.changed) {
        any = true;
        net.sendOptimisticMutation({
          kind: 'action:roundabout-toggle',
          gx: entry.roundabout.x,
          gy: entry.roundabout.y,
        });
      }
    }
    if (entry.motorway) {
      const id = `mw-undo-${Date.now().toString(36)}`;
      const res = sim.network.addMotorway(
        entry.motorway.ax,
        entry.motorway.ay,
        entry.motorway.bx,
        entry.motorway.by,
        sim.map,
        lookup,
        sim.inventory,
        id,
      );
      if (res.added) {
        any = true;
        net.sendOptimisticMutation({
          kind: 'action:motorway-add',
          ax: entry.motorway.ax,
          ay: entry.motorway.ay,
          bx: entry.motorway.bx,
          by: entry.motorway.by,
        });
      }
    }
    if (any) {
      gameAudio.playPlaceTool();
      if (net.isHost()) net.broadcastSnapshot(true);
    }
  } else if (entry.kind === 'light-toggle') {
    const res = sim.network.toggleTrafficLight(entry.gx, entry.gy, sim.map, lookup, sim.inventory);
    if (res.changed) {
      gameAudio.playRoadErase();
      net.sendOptimisticMutation({ kind: 'action:light-toggle', gx: entry.gx, gy: entry.gy });
      if (net.isHost()) net.broadcastSnapshot(true);
    }
  } else if (entry.kind === 'roundabout-toggle') {
    const res = sim.network.toggleRoundabout(entry.gx, entry.gy, sim.map, lookup, sim.inventory);
    if (res.changed) {
      gameAudio.playRoadErase();
      net.sendOptimisticMutation({ kind: 'action:roundabout-toggle', gx: entry.gx, gy: entry.gy });
      if (net.isHost()) net.broadcastSnapshot(true);
    }
  } else if (entry.kind === 'motorway-add') {
    if (sim.network.removeMotorway(entry.id, sim.inventory)) {
      gameAudio.playRoadErase();
      net.sendOptimisticMutation({ kind: 'action:motorway-remove', id: entry.id });
      if (net.isHost()) net.broadcastSnapshot(true);
    }
  }
}

function getCanvasPointerCell(e: PointerEvent): GridCoord | null {
  const rect = canvas.getBoundingClientRect();
  return renderer.screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (sim.phase !== 'playing' || localMenuOpen) return;
  const cell = getCanvasPointerCell(e);
  hoverCell = cell;
  if (!cell) return;

  canvas.setPointerCapture(e.pointerId);

  // Right-click cancels an ongoing road preview OR erases!
  if (e.button === 2) {
    if (dragMode === 'draw') {
      dragMode = 'none';
      previewCells = [];
      roadPreview = null;
      return;
    }
    dragMode = 'erase';
    lastDragCell = cell;
    eraseStartCell = cell;
    eraseDraggedEdge = false;
    currentEraseUndo = { kind: 'erase-stroke', edges: [] };
    net.sendCursor(cell.x, cell.y, 'erase', true);
    return;
  }

  if (activeTool === 'erase') {
    dragMode = 'erase';
    lastDragCell = cell;
    eraseStartCell = cell;
    eraseDraggedEdge = false;
    currentEraseUndo = { kind: 'erase-stroke', edges: [] };
    net.sendCursor(cell.x, cell.y, 'erase', true);
    return;
  }

  if (e.button !== 0) return;

  if (activeTool === 'ping') {
    const preset = ui.getActivePingPreset();
    net.sendPing(cell.x, cell.y, preset.emoji, preset.text);
    return;
  }

  if (activeTool === 'road') {
    dragMode = 'draw';
    previewCells = [cell];
    roadPreview = null;
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
      if (res.action === 'added') {
        sim.recordActionStat(net.getLocalActor(), 'light', 1);
        sim.recordBuildHistory({ kind: 'light', x: cell.x, y: cell.y });
      }
      pushUndo({ kind: 'light-toggle', gx: cell.x, gy: cell.y });
      net.sendOptimisticMutation({ kind: 'action:light-toggle', gx: cell.x, gy: cell.y });
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
      if (res.action === 'added') {
        sim.recordActionStat(net.getLocalActor(), 'roundabout', 1);
        sim.recordBuildHistory({ kind: 'roundabout', x: cell.x, y: cell.y });
      }
      pushUndo({ kind: 'roundabout-toggle', gx: cell.x, gy: cell.y });
      net.sendOptimisticMutation({ kind: 'action:roundabout-toggle', gx: cell.x, gy: cell.y });
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
  const actor = net.getLocalActor();
  const id = `mw-${actor.id.slice(-4)}-${a.x}_${a.y}-${b.x}_${b.y}`;
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
    sim.recordActionStat(actor, 'motorway', 1);
    sim.recordBuildHistory({ kind: 'motorway', x: a.x, y: a.y, bx: b.x, by: b.y });
    pushUndo({ kind: 'motorway-add', id, ax: a.x, ay: a.y, bx: b.x, by: b.y });
    sim.addFloatingText(b.x + 0.5, b.y + 0.2, 'Cipó Express! 🌿', '#bef264');
    net.sendOptimisticMutation({
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
  if (!cell || sim.phase !== 'playing' || localMenuOpen) return;

  net.sendCursor(
    cell.x,
    cell.y,
    dragMode === 'erase' ? 'erase' : activeTool,
    dragMode !== 'none',
  );

  if (dragMode === 'draw') {
    appendPreviewCell(cell);
  } else if (dragMode === 'erase' && lastDragCell) {
    if (cell.x !== lastDragCell.x || cell.y !== lastDragCell.y) {
      const steps = stepCellsBetweenSmart(lastDragCell, cell);
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
  if (dragMode === 'draw') {
    if (cell) appendPreviewCell(cell);
    commitRoadPreview();
  } else if (dragMode === 'erase') {
    if (eraseStartCell && !eraseDraggedEdge) {
      const target = cell ?? eraseStartCell;
      const res = sim.network.removeCellContentDetailed(
        target.x,
        target.y,
        sim.map,
        sim.inventory,
      );
      if (res.changed) {
        recordDetailedEraseUndo(target, res);
        sim.recordActionStat(net.getLocalActor(), 'erase', 1);
        gameAudio.playRoadErase();
        net.sendOptimisticMutation({ kind: 'action:erase-cell', gx: target.x, gy: target.y });
        if (net.isHost()) net.broadcastSnapshot(true);
      }
    }
    if (
      currentEraseUndo &&
      (currentEraseUndo.edges.length > 0 ||
        currentEraseUndo.light ||
        currentEraseUndo.roundabout ||
        currentEraseUndo.motorway)
    ) {
      pushUndo(currentEraseUndo);
    }
    currentEraseUndo = null;
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

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    performUndo();
    return;
  }

  if (e.key === '1') selectTool('road');
  else if (e.key === '2') selectTool('light');
  else if (e.key === '3') selectTool('roundabout');
  else if (e.key === '4') selectTool('motorway');
  else if (e.key === '5') selectTool('erase');
  else if (e.key.toLowerCase() === 'p') {
    if (sim.phase === 'playing' && !localMenuOpen) {
      if (hoverCell) {
        const preset = ui.getActivePingPreset();
        net.sendPing(hoverCell.x, hoverCell.y, preset.emoji, preset.text);
      } else {
        selectTool('ping');
      }
    }
  } else if (e.key === ' ') {
    e.preventDefault();
    if (sim.phase === 'playing' && !localMenuOpen) {
      const next: SimSpeed = sim.speed === 0 ? sim.prePauseSpeed : 0;
      applySpeed(next, true);
    }
  } else if (e.key.toLowerCase() === 'f') {
    if (sim.phase === 'playing' && !localMenuOpen) {
      const next: SimSpeed = sim.speed === 2 ? 1 : 2;
      applySpeed(next, true);
    }
  } else if (e.key.toLowerCase() === 'n') {
    toggleNightMode();
  } else if (e.key === 'Escape') {
    if (dragMode === 'draw') {
      dragMode = 'none';
      previewCells = [];
      roadPreview = null;
    } else if (motorwayAnchor) {
      motorwayAnchor = null;
    } else if (localMenuOpen && sim.phase === 'playing') {
      localMenuOpen = false;
      ui.hideModal();
      if (!net.isOnline()) sim.setSpeed(sim.prePauseSpeed);
    } else if (sim.phase === 'playing') {
      openLocalMenu();
    }
  }
});

// Expose ping preset cycling with Q for quick keyboard access
void PING_PRESETS;

function handleResize(): void {
  renderer.resize(canvas);
}

window.addEventListener('resize', handleResize);
handleResize();
selectTool('road');
ui.showMenu(false);

let lastFrame = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.08, (now - lastFrame) / 1000);
  lastFrame = now;

  if (replayActive) {
    replayProgress = Math.min(1, replayProgress + dt / 4.5);
    if (replayProgress >= 1) {
      replayActive = false;
      ui.setReplayButtonActive(false);
    }
  }

  sim.update(dt);
  net.tickSync();

  renderer.render(ctx, sim, {
    hoverCell,
    activeTool,
    motorwayAnchor,
    roadPreview,
    nightMode,
    remoteCursors: Array.from(net.remoteCursors.values()),
    replayProgress: replayActive ? replayProgress : null,
  });
  ui.update(sim, photoMode);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
