import { mountMonkeyHud, type MonkeyHudHandle } from '@monkey-slop/sdk';
import { FURNITURE_CATALOG } from './catalog';
import {
  GRID_H,
  GRID_W,
  TILE_SIZE,
  canPlaceFurniture,
  createStarterFurniture,
} from './house';
import { SimsNetBridge } from './net';
import {
  HouseRenderer,
  type BuildPreviewState,
  type CameraState,
  type HoverTarget,
} from './renderer';
import { simsAudio } from './sfx';
import { GameSimulation } from './simulation';
import { SimsUi, type CasResult } from './ui';
import type { FurnitureKind, SimSpeed } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

let hud: MonkeyHudHandle;
let net: SimsNetBridge;
let sim: GameSimulation;
let ui: SimsUi;

const renderer = new HouseRenderer();

const cam: CameraState = {
  x: (GRID_W * TILE_SIZE) / 2,
  y: (GRID_H * TILE_SIZE) / 2,
  zoom: 1,
};

const buildState: BuildPreviewState = {
  active: false,
  selectedKind: 'pc_rgb',
  movingId: null,
  rotation: 0,
  hoverGx: 8,
  hoverGy: 4,
};

let buildTool: 'buy' | 'move' | 'sell' = 'buy';
let hoverTarget: HoverTarget = { type: 'none', gx: 0, gy: 0 };
let hasStarted = false;

const keysPressed = new Set<string>();
let isPanning = false;
let panMoved = false;
let panStartX = 0;
let panStartY = 0;
let camStartX = 0;
let camStartY = 0;

function centerCamera(): void {
  cam.x = (GRID_W * TILE_SIZE) / 2;
  cam.y = (GRID_H * TILE_SIZE) / 2;
  const fitW = window.innerWidth / (GRID_W * TILE_SIZE + 80);
  const fitH = window.innerHeight / (GRID_H * TILE_SIZE + 170);
  cam.zoom = Math.max(0.7, Math.min(1.25, Math.min(fitW, fitH)));
}

function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setSpeed(speed: SimSpeed): void {
  sim.speed = speed;
  if (sim.isOnline && sim.isHost) {
    net.notifySetSpeed(speed);
  }
  ui.sync(sim, true);
}

function toggleBuildMode(): void {
  buildState.active = !buildState.active;
  buildState.movingId = null;
  if (buildState.active) {
    buildTool = 'buy';
    if (!buildState.selectedKind) buildState.selectedKind = 'pc_rgb';
  }
  ui.setBuildMode(buildState.active);
}

function init(): void {
  resizeCanvas();
  centerCamera();

  sim = new GameSimulation(createStarterFurniture(), {
    onToast: (msg, tone) => hud?.toast(msg, tone),
    onBroadcastFire: (fire, actorName) => net?.notifySpawnFire(fire, actorName),
    onExtinguishFire: (fireId, actorName) => net?.notifyExtinguishFire(fireId, actorName),
    onSpawnPuddle: (puddle) => net?.notifySpawnPuddle(puddle),
    onCleanPuddle: (puddleId, actorName) => net?.notifyCleanPuddle(puddleId, actorName),
    onToggleJbl: (playing, actorName) => net?.notifyToggleJbl(playing, actorName),
    onSocialEvent: (fromId, fromName, targetId, action, amount) =>
      net?.notifySocialEvent(fromId, fromName, targetId, action, amount),
    onMoneyDelta: (delta, reason) => net?.notifyMoneyDelta(delta, reason),
  });

  net = new SimsNetBridge(
    sim,
    (msg, tone) => hud?.toast(msg, tone),
    (players) => hud?.setPlayers(players),
  );

  hud = mountMonkeyHud({
    slug: 'monkey-sims',
    title: 'Os Macacos: Vida na Árvore',
    room: net.room,
  });

  ui = new SimsUi(uiRoot, {
    onStartGame: (cas: CasResult) => {
      hasStarted = true;
      simsAudio.startMusicLoop();
      net.room.setPlayerName(cas.name);

      const main = sim.createMonkey({
        id: `mk-${Math.random().toString(36).slice(2, 8)}`,
        name: cas.name,
        ownerPeerId: sim.isOnline ? net.room.localPlayer.id : null,
        isNpc: false,
        isLocalControl: true,
        furColor: cas.furColor,
        bellyColor: cas.bellyColor,
        accessory: cas.accessory,
        trait: cas.trait,
        gx: 9,
        gy: 3,
      });

      if (sim.isOnline) {
        // Keep any existing remote monkeys that already synced in
        sim.monkeys = [main, ...sim.monkeys.filter((m) => m.ownerPeerId !== net.room.localPlayer.id)];
        sim.activeMonkeyId = main.id;
        net.send({ kind: 'monkey_sync', monkey: main });
      } else {
        sim.spawnHousehold(main);
      }

      sim.addScore(10);
      ui.sync(sim, true);
      hud.toast(`🐒 ${cas.name} chegou na Casa na Árvore!`, 'banana');
    },
    onSetSpeed: (s) => setSpeed(s),
    onToggleBuildMode: () => toggleBuildMode(),
    onSelectBuildKind: (kind: FurnitureKind | null) => {
      buildTool = 'buy';
      buildState.movingId = null;
      buildState.selectedKind = kind;
    },
    onToggleMoveMode: () => {
      buildTool = 'move';
      buildState.movingId = null;
      buildState.selectedKind = null;
    },
    onToggleSellMode: () => {
      buildTool = 'sell';
      buildState.movingId = null;
      buildState.selectedKind = null;
    },
    onRotateBuild: () => {
      buildState.rotation = ((buildState.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    },
    onGoToWork: () => {
      const active = sim.getActiveMonkey();
      if (active) {
        sim.enqueueGoToWork(active);
        ui.sync(sim, true);
      }
    },
    onCenterCamera: () => centerCamera(),
    onSelectMonkey: (monkeyId: string) => {
      const target = sim.monkeys.find((m) => m.id === monkeyId);
      if (!target) return;
      sim.activeMonkeyId = target.id;
      ui.sync(sim, true);
    },
    onCancelAction: (monkeyId: string, index: number) => {
      const mk = sim.monkeys.find((m) => m.id === monkeyId);
      if (mk) {
        sim.cancelAction(mk, index);
        ui.sync(sim, true);
      }
    },
    onTriggerFurnitureAction: (furnitureId: string, interactionId: string) => {
      const active = sim.getActiveMonkey();
      const item = sim.furniture.find((f) => f.id === furnitureId);
      if (active && item) {
        sim.enqueueFurnitureInteraction(active, item, interactionId);
        ui.sync(sim, true);
      }
    },
    onTriggerSocialAction: (targetMonkeyId, action) => {
      const active = sim.getActiveMonkey();
      const target = sim.monkeys.find((m) => m.id === targetMonkeyId);
      if (active && target) {
        sim.enqueueSocial(active, target, action);
        ui.sync(sim, true);
      }
    },
    onTriggerFireAction: (fireId) => {
      const active = sim.getActiveMonkey();
      const fire = sim.fires.find((f) => f.id === fireId);
      if (active && fire) {
        sim.enqueueExtinguishFire(active, fire);
        ui.sync(sim, true);
      }
    },
    onTriggerPuddleAction: (puddleId) => {
      const active = sim.getActiveMonkey();
      const puddle = sim.puddles.find((p) => p.id === puddleId);
      if (active && puddle) {
        sim.enqueueCleanPuddle(active, puddle);
        ui.sync(sim, true);
      }
    },
    onSendChat: (text) => {
      const active = sim.getActiveMonkey();
      if (!active) return;
      active.speechText = text;
      active.speechTimer = 4.2;
      if (sim.isOnline) {
        net.notifyChatEmote(active.id, active.name, text);
      }
    },
  });

  // Show CAS Express on launch
  ui.showCasScreen(net.room.localPlayer.name);

  bindEvents();

  let lastTime = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    updateCameraPan(dt);
    if (hasStarted) {
      sim.step(dt);
      net.tick(dt);
      ui.sync(sim);
    }

    renderer.render(
      ctx,
      window.innerWidth,
      window.innerHeight,
      sim,
      cam,
      hoverTarget,
      buildState,
      dt,
    );

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function updateCameraPan(dt: number): void {
  const spd = (420 / cam.zoom) * dt;
  if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) cam.y -= spd;
  if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) cam.y += spd;
  if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) cam.x -= spd;
  if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) cam.x += spd;

  cam.x = Math.max(80, Math.min(GRID_W * TILE_SIZE - 80, cam.x));
  cam.y = Math.max(60, Math.min(GRID_H * TILE_SIZE - 60, cam.y));
}

function bindEvents(): void {
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
      isPanning = true;
      panMoved = false;
      panStartX = e.clientX;
      panStartY = e.clientY;
      camStartX = cam.x;
      camStartY = cam.y;
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      if (Math.hypot(dx, dy) > 4) panMoved = true;
      cam.x = camStartX - dx / cam.zoom;
      cam.y = camStartY - dy / cam.zoom;
      return;
    }

    const { wx, wy } = renderer.screenToWorld(
      e.clientX,
      e.clientY,
      window.innerWidth,
      window.innerHeight,
      cam,
    );
    hoverTarget = renderer.hitTest(wx, wy, sim);
    buildState.hoverGx = Math.floor(wx / TILE_SIZE);
    buildState.hoverGy = Math.floor(wy / TILE_SIZE);
  });

  window.addEventListener('mouseup', (e) => {
    if (isPanning && (e.button === 1 || e.button === 2)) {
      isPanning = false;
      if (!panMoved && e.button === 2) {
        ui.closeContextMenu();
      }
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.91;
      cam.zoom = Math.max(0.6, Math.min(1.9, cam.zoom * factor));
    },
    { passive: false },
  );

  canvas.addEventListener('click', (e) => {
    if (!hasStarted) return;

    const { wx, wy } = renderer.screenToWorld(
      e.clientX,
      e.clientY,
      window.innerWidth,
      window.innerHeight,
      cam,
    );
    const hit = renderer.hitTest(wx, wy, sim);

    if (buildState.active) {
      handleBuildClick(hit.gx, hit.gy, hit);
      return;
    }

    const active = sim.getActiveMonkey();
    if (!active) return;

    if (hit.type === 'fire' && hit.id) {
      ui.openHazardContext(e.clientX, e.clientY, 'fire', hit.id);
      return;
    }

    if (hit.type === 'puddle' && hit.id) {
      ui.openHazardContext(e.clientX, e.clientY, 'puddle', hit.id);
      return;
    }

    if (hit.type === 'monkey' && hit.id) {
      const target = sim.monkeys.find((m) => m.id === hit.id);
      if (target && target.id !== active.id) {
        ui.openMonkeyContext(e.clientX, e.clientY, active, target);
        return;
      }
    }

    if (hit.type === 'furniture' && hit.id) {
      const item = sim.furniture.find((f) => f.id === hit.id);
      if (item) {
        ui.openFurnitureContext(e.clientX, e.clientY, item);
        return;
      }
    }

    ui.closeContextMenu();
    if (hit.type === 'floor') {
      sim.enqueueWalk(active, hit.gx, hit.gy, true);
      ui.sync(sim, true);
    }
  });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    keysPressed.add(e.code);

    if (!hasStarted) return;

    if (e.code === 'KeyB') {
      toggleBuildMode();
    } else if (e.code === 'KeyR' && buildState.active) {
      buildState.rotation = ((buildState.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    } else if (e.code === 'Escape') {
      ui.closeContextMenu();
      if (buildState.active) toggleBuildMode();
    } else if (e.code === 'Space') {
      e.preventDefault();
      setSpeed(sim.speed === 0 ? 1 : 0);
    } else if (e.code === 'Digit1') {
      setSpeed(1);
    } else if (e.code === 'Digit2') {
      setSpeed(2);
    } else if (e.code === 'Digit3') {
      setSpeed(3);
    } else if (e.code === 'Tab') {
      e.preventDefault();
      const list = sim.getLocalControllableMonkeys();
      if (list.length > 1) {
        const idx = list.findIndex((m) => m.id === sim.activeMonkeyId);
        const next = list[(idx + 1) % list.length];
        sim.activeMonkeyId = next.id;
        ui.sync(sim, true);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keysPressed.delete(e.code);
  });
}

function handleBuildClick(gx: number, gy: number, hit: HoverTarget): void {
  if (buildTool === 'sell') {
    if (hit.type === 'furniture' && hit.id) {
      const refund = sim.sellFurniture(hit.id);
      if (refund > 0) {
        net.notifySellFurniture(hit.id, refund);
        ui.sync(sim, true);
      }
    }
    return;
  }

  if (buildTool === 'move') {
    if (!buildState.movingId) {
      if (hit.type === 'furniture' && hit.id) {
        const item = sim.furniture.find((f) => f.id === hit.id);
        if (item) {
          buildState.movingId = item.id;
          buildState.selectedKind = item.kind;
          buildState.rotation = item.rotation;
        }
      }
    } else if (buildState.selectedKind) {
      const item = sim.furniture.find((f) => f.id === buildState.movingId);
      if (
        item &&
        canPlaceFurniture(item.kind, gx, gy, buildState.rotation, sim.furniture, item.id)
      ) {
        item.gx = gx;
        item.gy = gy;
        item.rotation = buildState.rotation;
        net.notifyMoveFurniture(item.id, gx, gy, buildState.rotation);
        buildState.movingId = null;
        buildState.selectedKind = null;
        simsAudio.playAction('clean');
      } else {
        hud.toast('Posição inválida para mover este móvel!', 'chaos');
      }
    }
    return;
  }

  // Buy tool
  if (buildTool === 'buy' && buildState.selectedKind) {
    const created = sim.buyAndPlaceFurniture(buildState.selectedKind, gx, gy, buildState.rotation);
    if (created) {
      const cost = FURNITURE_CATALOG[created.kind].price;
      net.notifyBuyFurniture(created, cost);
      ui.sync(sim, true);
    }
  }
}

init();
