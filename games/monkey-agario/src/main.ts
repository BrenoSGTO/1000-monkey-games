import { getGameScore, reportGameScore } from '@monkey-slop/sdk';
import { agarioAudio } from './audio';
import {
  AgarioNetwork,
  applySnapshotToGuest,
  createGuestState,
  interpolateGuestState,
} from './net';
import { ArenaRenderer } from './renderer';
import { ArenaSimulation } from './simulation';
import type { GameEvent, GameMode, PlayerInput, SkinId, TeamId } from './types';
import { AgarioUI } from './ui';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Canvas #game-canvas not found');

const renderer = new ArenaRenderer(canvas);
const sim = new ArenaSimulation();
const guestState = createGuestState();

let localPlaying = false;
let localKills = 0;
let wantSpawnPending = false;
let splitQueued = false;
let ejectQueued = false;
let lastKnownMass = 0;

// Input tracking (mouse, keyboard, mobile touch)
let mouseClientX = window.innerWidth / 2;
let mouseClientY = window.innerHeight / 2;
let usingMouse = false;
const keysDown = new Set<string>();
let joyActive = false;
let joyDirX = 0;
let joyDirY = 0;

const ui = new AgarioUI('Macaco Veloz', {
  onPlay: (name, skin, mode, team) => {
    net.room.setPlayerName(name);
    if (net.isEffectiveHost() && sim.mode !== mode) {
      sim.setMode(mode);
      net.broadcastMode(mode);
    }
    localPlaying = true;
    localKills = 0;
    lastKnownMass = 0;
    wantSpawnPending = true;
    if (net.isEffectiveHost()) {
      sim.setHumanInput(net.getLocalId(), buildLocalInput(name, skin, team, true));
    }
  },
  onModeChange: (mode) => {
    if (net.isEffectiveHost()) {
      sim.setMode(mode);
      net.broadcastMode(mode);
    }
  },
  onNameChange: (name) => {
    net.room.setPlayerName(name);
  },
});

const net = new AgarioNetwork({
  onPlayersChange: (players) => {
    const ids = players.length > 0 ? players.map((p) => p.id) : [net.getLocalId()];
    if (net.isEffectiveHost()) {
      sim.syncHumans(ids);
    }
    ui.setNetworkStatus(net.isOnline(), net.isEffectiveHost(), players.length);
  },
  onRemoteInput: (senderId, input) => {
    sim.setHumanInput(senderId, input);
  },
  onModeChanged: (mode: GameMode) => {
    if (!net.isEffectiveHost()) {
      ui.setMode(mode);
    }
  },
  onSnapshot: (snap) => {
    const { events, deaths } = applySnapshotToGuest(guestState, snap);
    if (ui.selectedMode !== snap.mode) {
      ui.setMode(snap.mode);
    }
    handleEvents(events);
    handleDeaths(deaths);
  },
  onConnectedChange: () => {
    const players = net.room.getPlayers();
    const myId = net.getLocalId();
    const ids = players.length > 0 ? players.map((p) => p.id) : [myId];
    if (net.isEffectiveHost()) {
      sim.syncHumans(ids);
      sim.setMode(ui.selectedMode);
      net.broadcastMode(ui.selectedMode);
      if (localPlaying && !sim.cells.some((c) => c.ownerId === myId)) {
        wantSpawnPending = true;
      }
    }
    ui.setNetworkStatus(net.isOnline(), net.isEffectiveHost(), players.length);
  },
});

// Sync initial solo player
sim.syncHumans([net.getLocalId()]);
ui.setNetworkStatus(false, true, 1);

function buildLocalInput(
  name = ui.getName(),
  skin: SkinId = ui.selectedSkin,
  preferredTeam: TeamId = ui.selectedTeam,
  forceSpawn = false,
): PlayerInput {
  let dirX = 0;
  let dirY = 0;

  if (joyActive) {
    dirX = joyDirX;
    dirY = joyDirY;
  } else {
    // Keyboard directional override if held (Arrows or A/D/S; W is reserved for Banana Throw)
    if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) dirX -= 1;
    if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) dirX += 1;
    if (keysDown.has('ArrowUp')) dirY -= 1;
    if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) dirY += 1;

    if (dirX !== 0 || dirY !== 0) {
      const len = Math.hypot(dirX, dirY);
      dirX /= len;
      dirY /= len;
    } else if (usingMouse) {
      const dx = mouseClientX - window.innerWidth / 2;
      const dy = mouseClientY - window.innerHeight / 2;
      const dist = Math.hypot(dx, dy);
      if (dist > 14) {
        const mag = Math.min(1, dist / 140);
        dirX = (dx / dist) * mag;
        dirY = (dy / dist) * mag;
      }
    }
  }

  const split = splitQueued;
  const eject = ejectQueued;
  const wantSpawn = forceSpawn || wantSpawnPending;
  splitQueued = false;
  ejectQueued = false;
  wantSpawnPending = false;

  return {
    dirX,
    dirY,
    split,
    eject,
    name,
    skin,
    preferredTeam,
    wantSpawn,
  };
}

function handleEvents(events: GameEvent[]): void {
  const myId = net.getLocalId();
  for (const ev of events) {
    if (ev.kind === 'eat_cell') {
      renderer.spawnParticles(ev.x, ev.y, '#facc15', 18, 280);
      if (ev.text) {
        renderer.addFloatingText(ev.x, ev.y - 16, ev.text, '#fde047', 1.1);
      }
      if (ev.actorId === myId) {
        agarioAudio.playEatMonkey();
        renderer.addShake(6);
        localKills++;
      } else if (ev.targetId === myId) {
        agarioAudio.playDeath();
        renderer.addShake(14);
      }
    } else if (ev.kind === 'cactus_pop') {
      renderer.spawnParticles(ev.x, ev.y, '#84cc16', 26, 360);
      if (ev.text) {
        renderer.addFloatingText(ev.x, ev.y - 20, ev.text, '#a3e635', 1.25);
      }
      if (ev.actorId === myId) {
        agarioAudio.playCactusPop();
        renderer.addShake(16);
      }
    } else if (ev.kind === 'split' && ev.actorId === myId) {
      agarioAudio.playSplit();
      renderer.addShake(3.5);
    }
  }
}

function handleDeaths(
  deaths: Array<{ ownerId: string; killer: string; peakMass: number; kills: number; aliveTime: number }>,
): void {
  const myId = net.getLocalId();
  for (const d of deaths) {
    if (d.ownerId === myId && localPlaying) {
      localPlaying = false;
      const prevBest = getGameScore('monkey-agario').bestScore;
      const saved = reportGameScore('monkey-agario', d.peakMass, { kills: d.kills });
      const isNewRecord = d.peakMass > prevBest && d.peakMass > 0;
      if (isNewRecord) {
        agarioAudio.playRecord();
      } else {
        agarioAudio.playDeath();
      }
      ui.showDeath(d.killer, d.peakMass, d.kills, d.aliveTime, saved.bestScore > prevBest && isNewRecord);
    }
  }
}

// Desktop Mouse & Keyboard Listeners
window.addEventListener('mousemove', (e) => {
  mouseClientX = e.clientX;
  mouseClientY = e.clientY;
  usingMouse = true;
});

window.addEventListener('keydown', (e) => {
  if (ui.isOverlayOpen()) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) splitQueued = true;
  } else if (e.code === 'KeyW') {
    if (!e.repeat) {
      ejectQueued = true;
      agarioAudio.playEject();
    }
  } else {
    keysDown.add(e.code);
  }
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!ui.isOverlayOpen()) {
    ejectQueued = true;
    agarioAudio.playEject();
  }
});

// Mobile Touch Joystick & Action Buttons
const touchLayer = document.getElementById('touch-layer') as HTMLDivElement;
const joyZone = document.getElementById('joy-zone') as HTMLDivElement;
const joyKnob = document.getElementById('joy-knob') as HTMLDivElement;
const btnSplit = document.getElementById('btn-split') as HTMLButtonElement;
const btnEject = document.getElementById('btn-eject') as HTMLButtonElement;

function enableTouchUi(): void {
  touchLayer.classList.add('active');
}

if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  enableTouchUi();
}
window.addEventListener('touchstart', enableTouchUi, { once: true, passive: true });

let joyTouchId: number | null = null;
joyZone.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    joyTouchId = t.identifier;
    joyActive = true;
    updateJoystick(t.clientX, t.clientY);
  },
  { passive: false },
);

joyZone.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === joyTouchId) {
        updateJoystick(t.clientX, t.clientY);
      }
    }
  },
  { passive: false },
);

const endJoystick = (e: TouchEvent) => {
  for (const t of Array.from(e.changedTouches)) {
    if (t.identifier === joyTouchId) {
      joyTouchId = null;
      joyActive = false;
      joyDirX = 0;
      joyDirY = 0;
      joyKnob.style.transform = 'translate(0px, 0px)';
    }
  }
};
joyZone.addEventListener('touchend', endJoystick);
joyZone.addEventListener('touchcancel', endJoystick);

function updateJoystick(cx: number, cy: number): void {
  const rect = joyZone.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxR = rect.width * 0.36;
  const dx = cx - centerX;
  const dy = cy - centerY;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(maxR, dist);
  const ang = Math.atan2(dy, dx);
  const kx = Math.cos(ang) * clamped;
  const ky = Math.sin(ang) * clamped;
  joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
  if (dist > 8) {
    joyDirX = (dx / dist) * (clamped / maxR);
    joyDirY = (dy / dist) * (clamped / maxR);
  } else {
    joyDirX = 0;
    joyDirY = 0;
  }
}

btnSplit.addEventListener('touchstart', (e) => {
  e.preventDefault();
  splitQueued = true;
});
btnEject.addEventListener('touchstart', (e) => {
  e.preventDefault();
  ejectQueued = true;
  agarioAudio.playEject();
});

// Main 60fps loop + 20Hz network snapshot / input rate
let lastTime = performance.now();
let netAccum = 0;
let snapshotIndex = -1;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  netAccum += dt;

  const myId = net.getLocalId();

  if (net.isEffectiveHost()) {
    // Host (or Solo) runs authoritative simulation
    if (localPlaying || wantSpawnPending) {
      sim.setHumanInput(myId, buildLocalInput());
    }

    const { events, deaths } = sim.step(dt);
    handleEvents(events);
    handleDeaths(deaths);

    // Check pellet eat audio feedback for local player
    let currMass = 0;
    for (const c of sim.cells) {
      if (c.ownerId === myId) currMass += c.mass;
    }
    if (currMass > lastKnownMass + 1.2 && lastKnownMass > 0 && currMass - lastKnownMass < 12) {
      agarioAudio.playPellet(currMass - lastKnownMass > 4);
    }
    lastKnownMass = currMass;

    // Broadcast snapshots at 20 Hz when online
    if (net.isOnline() && netAccum >= 0.05) {
      netAccum = 0;
      snapshotIndex++;
      const includeAllFood = snapshotIndex % 3 === 0;
      net.broadcastSnapshot(sim.buildSnapshot(includeAllFood));
    }

    const leaderOwnerId = sim.leaderboard[0]?.ownerId;
    renderer.render(
      {
        cells: sim.cells,
        food: sim.food,
        cacti: sim.cacti,
        localOwnerId: myId,
        leaderOwnerId,
        arenaSize: sim.arenaSize,
        mode: sim.mode,
      },
      dt,
    );

    const myStats = sim.stats.get(myId);
    ui.updateHud(
      currMass,
      myStats?.kills ?? localKills,
      myId,
      sim.leaderboard,
      sim.teamMass,
      sim.mode,
    );
  } else {
    // Guest sends inputs at ~25Hz (or immediately on split/eject) and interpolates state at 60fps
    if (splitQueued || ejectQueued || wantSpawnPending || netAccum >= 0.04) {
      netAccum = 0;
      if (localPlaying || wantSpawnPending) {
        net.sendInput(buildLocalInput());
      }
    }

    const cells = interpolateGuestState(guestState, dt);
    let currMass = 0;
    for (const c of cells) {
      if (c.ownerId === myId) currMass += c.mass;
    }
    if (currMass > lastKnownMass + 1.2 && lastKnownMass > 0 && currMass - lastKnownMass < 12) {
      agarioAudio.playPellet(currMass - lastKnownMass > 4);
    }
    lastKnownMass = currMass;

    const allFood = [
      ...guestState.naturalFood.values(),
      ...guestState.ejectedFood.values(),
    ];
    const allCacti = [...guestState.cacti.values()];
    const leaderOwnerId = guestState.leaderboard[0]?.ownerId;

    renderer.render(
      {
        cells,
        food: allFood,
        cacti: allCacti,
        localOwnerId: myId,
        leaderOwnerId,
        arenaSize: guestState.arenaSize,
        mode: guestState.mode,
      },
      dt,
    );

    ui.updateHud(
      currMass,
      localKills,
      myId,
      guestState.leaderboard,
      guestState.teamMass,
      guestState.mode,
    );
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
