import { getGameScore, reportGameScore, mountMonkeyHud } from '@monkey-slop/sdk';
import { kitchenAudio } from './audio';
import { KITCHENS, KITCHEN_ORDER } from './kitchens';
import { OvercookedNet } from './net';
import { RECIPES } from './recipes';
import { KitchenRenderer } from './renderer';
import { KitchenSimulation } from './simulation';
import type { ChefInputState, GameMode, KitchenId, SimSnapshot } from './types';

const SLUG = 'monkey-overcooked';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const menuOverlay = document.getElementById('menu-overlay') as HTMLDivElement;
const resultsOverlay = document.getElementById('results-overlay') as HTMLDivElement;
const kitchensWrap = document.getElementById('mo-kitchens') as HTMLDivElement;
const modesWrap = document.getElementById('mo-modes') as HTMLDivElement;
const startBtn = document.getElementById('mo-start-btn') as HTMLButtonElement;
const onlineStatusEl = document.getElementById('mo-online-status') as HTMLDivElement;
const bestBadgeEl = document.getElementById('mo-best-badge') as HTMLDivElement;
const controlsBoxEl = document.getElementById('mo-controls-box') as HTMLDivElement;

const resTitle = document.getElementById('res-title') as HTMLHeadingElement;
const resSubtitle = document.getElementById('res-subtitle') as HTMLParagraphElement;
const resStars = document.getElementById('res-stars') as HTMLDivElement;
const resScore = document.getElementById('res-score') as HTMLDivElement;
const resDelivered = document.getElementById('res-delivered') as HTMLDivElement;
const resCombo = document.getElementById('res-combo') as HTMLDivElement;
const resFires = document.getElementById('res-fires') as HTMLDivElement;
const resReplayBtn = document.getElementById('res-replay-btn') as HTMLButtonElement;
const resMenuBtn = document.getElementById('res-menu-btn') as HTMLButtonElement;

let selectedMode: GameMode = 'solo';
let selectedKitchen: KitchenId = 'quiosque';
let sim: KitchenSimulation | null = null;
let inGame = false;
let reportedResult = false;
let activeSoloChefIdx = 0;

// Input tracking
const keysDown = new Set<string>();
const pendingPresses = new Set<string>();

const renderer = new KitchenRenderer(canvas);

let hudHandle: ReturnType<typeof mountMonkeyHud> | null = null;

const net = new OvercookedNet({
  onPlayersChange: (players) => {
    hudHandle?.setPlayers(players);
    if (net.isConnected()) {
      selectedMode = 'online';
      syncModeButtons();
      if (sim && net.isHost()) {
        sim.syncOnlineRoster(players.map((p) => ({ id: p.id, name: p.name, color: p.color })));
      }
      if (!net.isHost() && !inGame) {
        onlineStatusEl.textContent = `Conectado! Esperando o Host (${players[0]?.name ?? 'Host'}) abrir a cozinha...`;
      } else if (net.isHost()) {
        onlineStatusEl.textContent = `Sala ${net.room.roomCode} • ${players.length}/4 chefs conectados!`;
      }
    }
    refreshStartButton();
  },
  onStatusChange: (detail) => {
    if (net.isConnected()) {
      onlineStatusEl.textContent = detail;
    }
    refreshStartButton();
  },
  onRemoteStart: (kitchenId) => {
    selectedKitchen = kitchenId;
    selectedMode = 'online';
    startClientMatch();
  },
  onRemoteBackToMenu: () => {
    openMenu();
  },
  onRemoteSnapshot: (snap) => {
    if (snap.finished && !reportedResult) {
      showResults(snap);
    }
  },
  onRemoteEvent: (sound) => {
    if (sound) kitchenAudio.play(sound);
  },
});

hudHandle = mountMonkeyHud({
  slug: SLUG,
  title: 'Macaco na Chapa',
  room: net.room,
});

function refreshBestBadge(): void {
  const rec = getGameScore(SLUG);
  bestBadgeEl.textContent = `🏆 Recorde: ${rec.bestScore} pts`;
}

function renderKitchenCards(): void {
  kitchensWrap.innerHTML = '';
  for (const id of KITCHEN_ORDER) {
    const k = KITCHENS[id];
    const btn = document.createElement('button');
    btn.className = `mo-kitchen-card ${selectedKitchen === id ? 'active' : ''}`;
    const recipeIcons = k.recipes.map((r) => RECIPES[r].emoji).join(' ');
    btn.innerHTML = `
      <div class="mo-k-name">${k.name}</div>
      <div class="mo-k-meta">${k.subtitle}</div>
      <div class="mo-k-meta" style="margin-top:6px;">Pratos: ${recipeIcons} • ⏱ ${Math.floor(k.duration / 60)}:${(k.duration % 60).toString().padStart(2, '0')}</div>
    `;
    btn.onclick = () => {
      selectedKitchen = id;
      renderKitchenCards();
    };
    kitchensWrap.appendChild(btn);
  }
}

function syncModeButtons(): void {
  modesWrap.querySelectorAll<HTMLButtonElement>('.mo-mode-btn').forEach((btn) => {
    const mode = btn.dataset.mode as GameMode;
    btn.classList.toggle('active', mode === selectedMode);
  });

  if (selectedMode === 'local2p') {
    controlsBoxEl.innerHTML = `
      <div><strong style="color:#facc15;">Chef 1:</strong> <span class="mo-kbd">WASD</span> mover • <span class="mo-kbd">E</span> pegar • <span class="mo-kbd">F</span> picar/lavar • <span class="mo-kbd">Q</span> jogar • <span class="mo-kbd">L-Shift</span> dash</div>
      <div><strong style="color:#4ade80;">Chef 2:</strong> <span class="mo-kbd">Setas</span> mover • <span class="mo-kbd">Enter</span>/<span class="mo-kbd">,</span> pegar • <span class="mo-kbd">.</span>/<span class="mo-kbd">M</span> picar/lavar • <span class="mo-kbd">/</span>/<span class="mo-kbd">N</span> jogar • <span class="mo-kbd">R-Shift</span> dash</div>
      <div><span class="mo-kbd">1-4</span> Gritos rápidos de cozinha!</div>
    `;
  } else {
    controlsBoxEl.innerHTML = `
      <div><span class="mo-kbd">WASD</span> / <span class="mo-kbd">Setas</span> Mover 8 direções</div>
      <div><span class="mo-kbd">Espaço</span> / <span class="mo-kbd">E</span> Pegar / Soltar / Entregar</div>
      <div><span class="mo-kbd">F</span> / <span class="mo-kbd">J</span> Picar / Lavar / Apagar Fogo</div>
      <div><span class="mo-kbd">Q</span> / <span class="mo-kbd">K</span> Arremessar Ingrediente</div>
      <div><span class="mo-kbd">Shift</span> Dash (esbarra nos amigos!)</div>
      <div><span class="mo-kbd">Tab</span> Trocar Chef (Solo) | <span class="mo-kbd">1-4</span> Gritar!</div>
    `;
  }
  refreshStartButton();
}

function refreshStartButton(): void {
  if (selectedMode === 'online') {
    if (!net.isConnected()) {
      onlineStatusEl.textContent = 'Abra ou entre numa sala no botão verde "🐒 Co-op Online" lá em cima!';
      startBtn.disabled = false;
      startBtn.textContent = '🔥 TESTAR SOLO / CRIAR SALA';
    } else if (net.isHost()) {
      onlineStatusEl.textContent = `Você é o Host (${net.getPlayers().length}/4 chefs)! Escolha a cozinha e comece!`;
      startBtn.disabled = false;
      startBtn.textContent = '🔥 ABRIR COZINHA ONLINE!';
    } else {
      onlineStatusEl.textContent = 'Conectado como convidado — aguardando o Host iniciar...';
      startBtn.disabled = true;
      startBtn.textContent = '⏳ AGUARDANDO HOST...';
    }
  } else {
    onlineStatusEl.textContent =
      selectedMode === 'solo'
        ? 'Solo: 2 macacos chefs alternáveis com Tab!'
        : 'Local 2P: dois chefs no mesmo teclado!';
    startBtn.disabled = false;
    startBtn.textContent = '🔥 ABRIR A COZINHA!';
  }
}

modesWrap.querySelectorAll<HTMLButtonElement>('.mo-mode-btn').forEach((btn) => {
  btn.onclick = () => {
    selectedMode = btn.dataset.mode as GameMode;
    syncModeButtons();
  };
});

function startMatch(): void {
  if (selectedMode === 'online' && net.isConnected() && !net.isHost()) return;

  if (selectedMode === 'online' && !net.isConnected()) {
    // Fallback gracefully to solo if user clicked start without opening room
    selectedMode = 'solo';
    syncModeButtons();
  }

  let profiles: Array<{ id: string; name: string; color?: string }>;
  if (selectedMode === 'online' && net.isConnected()) {
    profiles = net.getPlayers().map((p) => ({ id: p.id, name: p.name, color: p.color }));
  } else if (selectedMode === 'local2p') {
    profiles = [
      { id: 'p1', name: 'Chef 1', color: '#facc15' },
      { id: 'p2', name: 'Chef 2', color: '#4ade80' },
    ];
  } else {
    profiles = [
      { id: 's1', name: 'Chimp 1', color: '#facc15' },
      { id: 's2', name: 'Chimp 2', color: '#4ade80' },
    ];
  }

  sim = new KitchenSimulation(selectedKitchen, selectedMode, profiles, {
    onSound: (sound) => {
      kitchenAudio.play(sound);
      net.broadcastEvent(sound);
    },
    onFloatText: (x, y, text, color) => {
      net.broadcastEvent(undefined, { x, y, text, color });
    },
  });

  if (selectedMode === 'online' && net.isHost()) {
    net.broadcastStart(selectedKitchen);
    net.broadcastSnapshot(sim.getSnapshot(), true);
  }

  activeSoloChefIdx = 0;
  inGame = true;
  reportedResult = false;
  menuOverlay.classList.add('hidden');
  resultsOverlay.classList.add('hidden');
  hudHandle?.toast(`${KITCHENS[selectedKitchen].name} — Mão na massa!`, 'banana');
}

function startClientMatch(): void {
  sim = null;
  inGame = true;
  reportedResult = false;
  menuOverlay.classList.add('hidden');
  resultsOverlay.classList.add('hidden');
  hudHandle?.toast(`${KITCHENS[selectedKitchen].name} — Turno iniciado!`, 'banana');
}

function openMenu(): void {
  inGame = false;
  sim = null;
  menuOverlay.classList.remove('hidden');
  resultsOverlay.classList.add('hidden');
  refreshBestBadge();
  renderKitchenCards();
  refreshStartButton();
}

function showResults(snap: SimSnapshot): void {
  if (reportedResult) return;
  reportedResult = true;

  const k = KITCHENS[snap.kitchenId];
  let stars = 0;
  if (snap.score >= k.stars[0]) stars = 1;
  if (snap.score >= k.stars[1]) stars = 2;
  if (snap.score >= k.stars[2]) stars = 3;

  reportGameScore(SLUG, snap.score, {
    stars,
    kitchen: snap.kitchenId,
    delivered: snap.deliveredCount,
  });
  refreshBestBadge();
  kitchenAudio.playFanfare();

  resTitle.textContent = stars >= 2 ? '🎉 Cozinha Campeã!' : stars === 1 ? '👏 Turno Sobrevivido!' : '🔥 Quase Pegou Fogo Tudo!';
  resSubtitle.textContent = `${k.name} • Meta 3★: ${k.stars[2]} pts`;
  resStars.textContent = `${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  resScore.textContent = `${snap.score}`;
  resDelivered.textContent = `${snap.deliveredCount}`;
  resCombo.textContent = `${snap.maxCombo}x`;
  resFires.textContent = `${snap.firesExtinguished}`;

  const isGuest = selectedMode === 'online' && net.isConnected() && !net.isHost();
  resReplayBtn.disabled = isGuest;
  resMenuBtn.disabled = isGuest;
  resReplayBtn.textContent = isGuest ? '⏳ Aguardando Host...' : '🔄 Jogar Novamente';

  resultsOverlay.classList.remove('hidden');
}

startBtn.onclick = () => startMatch();
resReplayBtn.onclick = () => startMatch();
resMenuBtn.onclick = () => {
  if (selectedMode === 'online' && net.isHost()) {
    net.broadcastBackToMenu();
  }
  openMenu();
};

// Keyboard handling
window.addEventListener('keydown', (e) => {
  if (!inGame) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  if (
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)
  ) {
    e.preventDefault();
  }

  if (e.code === 'Escape') {
    if (selectedMode !== 'online' || !net.isConnected() || net.isHost()) {
      if (selectedMode === 'online' && net.isHost()) {
        net.broadcastBackToMenu();
      }
      openMenu();
    }
    return;
  }

  if (e.code === 'Tab' && selectedMode === 'solo' && sim) {
    activeSoloChefIdx = (activeSoloChefIdx + 1) % sim.chefs.length;
    kitchenAudio.play('pickup');
    return;
  }

  if (!e.repeat) {
    pendingPresses.add(e.code);
  }
  keysDown.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

window.addEventListener('blur', () => {
  keysDown.clear();
  pendingPresses.clear();
});

function consumePress(...codes: string[]): boolean {
  let hit = false;
  for (const c of codes) {
    if (pendingPresses.delete(c)) hit = true;
  }
  return hit;
}

function readSingleChefInput(): ChefInputState {
  let moveX = 0;
  let moveY = 0;
  if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) moveX -= 1;
  if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) moveX += 1;
  if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) moveY -= 1;
  if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) moveY += 1;

  let shoutIndex = 0;
  if (consumePress('Digit1')) shoutIndex = 1;
  else if (consumePress('Digit2')) shoutIndex = 2;
  else if (consumePress('Digit3')) shoutIndex = 3;
  else if (consumePress('Digit4')) shoutIndex = 4;

  return {
    moveX,
    moveY,
    interactPressed: consumePress('Space', 'KeyE'),
    workHeld: keysDown.has('KeyF') || keysDown.has('KeyJ'),
    workPressed: consumePress('KeyF', 'KeyJ'),
    throwPressed: consumePress('KeyQ', 'KeyK'),
    dashPressed: consumePress('ShiftLeft', 'ShiftRight'),
    shoutIndex,
  };
}

function readLocal2PInputs(): [ChefInputState, ChefInputState] {
  let mx1 = 0;
  let my1 = 0;
  if (keysDown.has('KeyA')) mx1 -= 1;
  if (keysDown.has('KeyD')) mx1 += 1;
  if (keysDown.has('KeyW')) my1 -= 1;
  if (keysDown.has('KeyS')) my1 += 1;

  let mx2 = 0;
  let my2 = 0;
  if (keysDown.has('ArrowLeft')) mx2 -= 1;
  if (keysDown.has('ArrowRight')) mx2 += 1;
  if (keysDown.has('ArrowUp')) my2 -= 1;
  if (keysDown.has('ArrowDown')) my2 += 1;

  let shout1 = 0;
  if (consumePress('Digit1')) shout1 = 1;
  else if (consumePress('Digit2')) shout1 = 2;
  else if (consumePress('Digit3')) shout1 = 3;
  else if (consumePress('Digit4')) shout1 = 4;

  const p1: ChefInputState = {
    moveX: mx1,
    moveY: my1,
    interactPressed: consumePress('KeyE', 'Space'),
    workHeld: keysDown.has('KeyF'),
    workPressed: consumePress('KeyF'),
    throwPressed: consumePress('KeyQ'),
    dashPressed: consumePress('ShiftLeft'),
    shoutIndex: shout1,
  };

  const p2: ChefInputState = {
    moveX: mx2,
    moveY: my2,
    interactPressed: consumePress('Enter', 'Comma'),
    workHeld: keysDown.has('Period') || keysDown.has('KeyM'),
    workPressed: consumePress('Period', 'KeyM'),
    throwPressed: consumePress('Slash', 'KeyN'),
    dashPressed: consumePress('ShiftRight', 'ControlRight', 'KeyL'),
    shoutIndex: 0,
  };

  return [p1, p2];
}

// Preview kitchen background while on menu
const previewSim = new KitchenSimulation('quiosque', 'solo', [
  { id: 'p1', name: 'Chef Macaco', color: '#facc15' },
  { id: 'p2', name: 'Sub-Chef', color: '#4ade80' },
]);

let lastTs = performance.now();

function frame(ts: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
  lastTs = ts;

  if (!inGame) {
    renderer.render(previewSim.getSnapshot(), previewSim.particles, previewSim.floatingTexts, 'p1', dt);
    requestAnimationFrame(frame);
    return;
  }

  // Client mode (non-host online)
  if (selectedMode === 'online' && net.isConnected() && !net.isHost()) {
    const inp = readSingleChefInput();
    net.sendLocalInput(inp);
    net.stepClientVisuals(dt);
    if (net.interpolatedSnap) {
      renderer.render(
        net.interpolatedSnap,
        [],
        net.clientFloatTexts,
        net.room.localPlayer.id,
        dt,
      );
    }
    requestAnimationFrame(frame);
    return;
  }

  // Authoritative simulation (Solo, Local 2P, or Online Host)
  if (sim) {
    const inputs: Record<string, ChefInputState> = {};

    if (selectedMode === 'local2p') {
      const [p1, p2] = readLocal2PInputs();
      if (sim.chefs[0]) inputs[sim.chefs[0].id] = p1;
      if (sim.chefs[1]) inputs[sim.chefs[1].id] = p2;
    } else if (selectedMode === 'online' && net.isConnected() && net.isHost()) {
      const localInp = readSingleChefInput();
      inputs[net.room.localPlayer.id] = localInp;
      const remotes = net.consumeRemoteInputs();
      for (const [id, rInp] of Object.entries(remotes)) {
        inputs[id] = rInp;
      }
    } else {
      const localInp = readSingleChefInput();
      const activeChef = sim.chefs[activeSoloChefIdx];
      if (activeChef) inputs[activeChef.id] = localInp;
    }

    sim.step(dt, inputs);
    const snap = sim.getSnapshot();

    if (selectedMode === 'online' && net.isHost()) {
      net.broadcastSnapshot(snap, snap.finished);
    }

    const activeId =
      selectedMode === 'solo'
        ? sim.chefs[activeSoloChefIdx]?.id ?? null
        : selectedMode === 'online'
          ? net.room.localPlayer.id
          : null;

    renderer.render(snap, sim.particles, sim.floatingTexts, activeId, dt);

    if (snap.finished && !reportedResult) {
      showResults(snap);
    }
  }

  requestAnimationFrame(frame);
}

// Init
refreshBestBadge();
renderKitchenCards();
syncModeButtons();
requestAnimationFrame(frame);
