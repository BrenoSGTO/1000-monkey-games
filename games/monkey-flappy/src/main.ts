import './styles.css';
import {
  getGameScore,
  monkeyAudio,
  mountMonkeyHud,
  PeerRoom,
  reportGameScore,
  type PlayerProfile,
} from '@monkey-slop/sdk';
import { flappyAudio } from './audio';
import {
  createMonkeyEntity,
  stepMonkey,
  triggerFlap,
} from './physics';
import { renderGameFrame } from './renderer';
import {
  BASE_SCROLL_SPEED,
  BIOMES,
  HORN_PHRASES,
  MAX_SCROLL_SPEED,
  MONKEY_SKINS,
  TURBO_SPEED_MULT,
  WORLD_HEIGHT,
  getBiomeForScore,
  type BiomeId,
  type FlappyNetMessage,
  type FloatingText,
  type GameMode,
  type MonkeyEntity,
  type Particle,
  type RemoteGhost,
  type ScreenPhase,
  type SessionScoreEntry,
  type SkinId,
} from './types';
import { WorldGenerator } from './world';

const SLUG = 'monkey-flappy';
const SAVE_KEY = 'monkey-flappy:save:v1';

interface LocalSave {
  bananas: number;
  unlockedSkins: SkinId[];
  selectedSkin: SkinId;
}

function loadSave(): LocalSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalSave>;
      return {
        bananas: typeof parsed.bananas === 'number' ? Math.max(0, parsed.bananas) : 0,
        unlockedSkins: Array.isArray(parsed.unlockedSkins)
          ? (parsed.unlockedSkins as SkinId[])
          : ['classic'],
        selectedSkin: parsed.selectedSkin || 'classic',
      };
    }
  } catch {
    // ignore
  }
  return { bananas: 0, unlockedSkins: ['classic'], selectedSkin: 'classic' };
}

function persistSave(save: LocalSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore
  }
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

let save = loadSave();
let bestScore = getGameScore(SLUG).bestScore;
let bestBiomeReached: BiomeId = 'jungle';

// Top live HUD container (above canvas, outside uiRoot modal)
const topHud = document.createElement('div');
topHud.className = 'fm-topbar';
document.body.appendChild(topHud);

// App state
let phase: ScreenPhase = 'title';
let gameMode: GameMode = 'solo';
let logicalWidth = 960;
let timeSec = 0;
let worldX = 0;
let currentSeed = Math.floor(Math.random() * 999999) + 1;
let roundId = 1;
let world = new WorldGenerator(currentSeed);
let monkeys: MonkeyEntity[] = [];
let ghosts = new Map<string, RemoteGhost>();
let particles: Particle[] = [];
let floatingTexts: FloatingText[] = [];
let shakeAmount = 0;
let turboFlash = 0;
let currentBiome: BiomeId = 'jungle';
let biomeBannerText: string | null = null;
let biomeBannerTimer = 0;
let coinStreak = 0;
let coinStreakTimer = 0;
let countdownTimer = 0;
let lastCountdownInt = 0;
let gameOverAge = 0;
let lastReportNewRecord = false;
let localHornText: string | null = null;
let localHornTimer = 0;
let netSyncAccum = 0;
let roundWinnerBanner: string | null = null;
let roundWinnerDeclared = false;

const sessionScores = new Map<string, SessionScoreEntry>();

// PeerRoom & Monkey HUD
const room = new PeerRoom<FlappyNetMessage>(SLUG, {
  onPlayersChange: (players) => {
    hud.setPlayers(players);
    syncRosterToSession(players);
    if (players.length > 1 && gameMode !== 'online') {
      gameMode = 'online';
      if (phase === 'title') renderOverlay();
    }
    renderTopHud();
  },
  onMessage: (env) => {
    const msg = env.payload;
    if (!msg) return;

    if (msg.type === 'race_start') {
      roundId = msg.roundId;
      currentSeed = msg.seed;
      gameMode = 'online';
      hud.toast(`🏁 ${msg.hostName} iniciou a corrida!`, 'banana');
      startCountdownAndRun(msg.seed, msg.roundId);
      return;
    }

    if (msg.type === 'player_state') {
      if (msg.roundId !== roundId) return;
      let g = ghosts.get(env.senderId);
      const playerInfo = room.getPlayers().find((p) => p.id === env.senderId);
      if (!g) {
        g = {
          id: env.senderId,
          name: env.senderName,
          color: playerInfo?.color || '#38bdf8',
          skin: msg.skin,
          worldX: msg.worldX,
          targetWorldX: msg.worldX,
          y: msg.y,
          targetY: msg.y,
          rot: msg.rot,
          targetRot: msg.rot,
          alive: msg.alive,
          score: msg.score,
          hasShield: msg.hasShield,
          isTurbo: msg.isTurbo,
          propAngle: 0,
          flapTimer: 0,
          lastUpdated: performance.now(),
          ragdollX: msg.ragdollX,
          ragdollY: msg.ragdollY,
          hornText: null,
          hornTimer: 0,
        };
        ghosts.set(env.senderId, g);
      } else {
        g.targetWorldX = msg.worldX;
        g.targetY = msg.y;
        g.targetRot = msg.rot;
        g.alive = msg.alive;
        g.score = msg.score;
        g.skin = msg.skin;
        g.hasShield = msg.hasShield;
        g.isTurbo = msg.isTurbo;
        if (msg.flapping) g.flapTimer = 0.2;
        g.ragdollX = msg.ragdollX;
        g.ragdollY = msg.ragdollY;
        g.lastUpdated = performance.now();
      }
      renderTopHud();
      return;
    }

    if (msg.type === 'player_died') {
      if (msg.roundId !== roundId) return;
      const g = ghosts.get(env.senderId);
      if (g) {
        g.alive = false;
        g.score = msg.score;
      }
      const entry = sessionScores.get(env.senderId);
      if (entry) {
        entry.lastScore = msg.score;
        entry.bestScore = Math.max(entry.bestScore, msg.score);
      }
      spawnFloatingText(logicalWidth * 0.55, 180, `💀 ${env.senderName}: "${msg.quote}"`, '#fda4af', 0.9);
      checkOnlineRoundComplete();
      renderTopHud();
      return;
    }

    if (msg.type === 'horn') {
      const g = ghosts.get(env.senderId);
      if (g) {
        g.hornText = msg.phrase;
        g.hornTimer = 1.6;
      }
      flappyAudio.horn(1);
      return;
    }

    if (msg.type === 'round_winner') {
      if (msg.roundId !== roundId) return;
      const entry = sessionScores.get(msg.winnerId);
      if (entry && !roundWinnerDeclared) {
        entry.wins += 1;
      }
      roundWinnerDeclared = true;
      roundWinnerBanner = `🏆 ${msg.winnerName} venceu a rodada (${msg.score} pts)!`;
      hud.toast(roundWinnerBanner, 'banana');
      if (phase === 'gameover') renderOverlay();
      renderTopHud();
    }
  },
});

const hud = mountMonkeyHud({
  slug: SLUG,
  title: 'Flappy Mico: Voo da Vergonha',
  room,
  hint: 'Espaço/Clique para voar • B para buzinar',
});

function syncRosterToSession(players: PlayerProfile[]): void {
  const list = players.length > 0 ? players : [room.localPlayer];
  for (const p of list) {
    if (!sessionScores.has(p.id)) {
      sessionScores.set(p.id, {
        id: p.id,
        name: p.name,
        color: p.color,
        wins: 0,
        bestScore: 0,
        lastScore: 0,
      });
    } else {
      const existing = sessionScores.get(p.id)!;
      existing.name = p.name;
      existing.color = p.color;
    }
  }
}

syncRosterToSession([room.localPlayer]);

function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  logicalWidth = Math.max(360, (w / Math.max(1, h)) * WORLD_HEIGHT);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initIdleDemo(): void {
  worldX = 0;
  currentBiome = 'jungle';
  world = new WorldGenerator(4242);
  world.ensureGenerated(1400);
  monkeys = [
    createMonkeyEntity(0, room.localPlayer.name, '#facc15', save.selectedSkin, Math.min(200, logicalWidth * 0.28)),
  ];
  particles = [];
  floatingTexts = [];
  biomeBannerText = null;
  biomeBannerTimer = 0;
}

function setupRoundEntities(seed: number): void {
  worldX = 0;
  currentBiome = 'jungle';
  bestBiomeReached = 'jungle';
  world = new WorldGenerator(seed);
  world.ensureGenerated(1500);
  particles = [];
  floatingTexts = [];
  shakeAmount = 0;
  turboFlash = 0;
  biomeBannerText = null;
  biomeBannerTimer = 0;
  coinStreak = 0;
  lastReportNewRecord = false;
  roundWinnerBanner = null;
  roundWinnerDeclared = false;

  const baseX = Math.min(210, logicalWidth * 0.26);
  if (gameMode === 'local2p') {
    monkeys = [
      createMonkeyEntity(0, 'P1 (W/Espaço)', '#facc15', save.selectedSkin, baseX),
      createMonkeyEntity(1, 'P2 (Seta/K)', '#38bdf8', getSecondarySkin(), baseX - 38),
    ];
  } else {
    monkeys = [
      createMonkeyEntity(0, room.localPlayer.name, room.localPlayer.color, save.selectedSkin, baseX),
    ];
  }

  for (const g of ghosts.values()) {
    g.worldX = 0;
    g.targetWorldX = 0;
    g.y = WORLD_HEIGHT * 0.4;
    g.targetY = WORLD_HEIGHT * 0.4;
    g.rot = 0;
    g.targetRot = 0;
    g.alive = true;
    g.score = 0;
    g.hasShield = false;
    g.isTurbo = false;
    g.hornText = null;
    g.hornTimer = 0;
  }
}

function getSecondarySkin(): SkinId {
  const idx = MONKEY_SKINS.findIndex((s) => s.id === save.selectedSkin);
  return MONKEY_SKINS[(idx + 1) % MONKEY_SKINS.length].id;
}

function startSoloOrLocalRun(): void {
  if (gameMode === 'online' && room.getPlayers().length > 1) {
    roundId += 1;
    currentSeed = Math.floor(Math.random() * 9999999) + 1;
    room.send('race_start', {
      type: 'race_start',
      seed: currentSeed,
      roundId,
      hostName: room.localPlayer.name,
    });
    startCountdownAndRun(currentSeed, roundId);
    return;
  }

  currentSeed = Math.floor(Math.random() * 9999999) + 1;
  roundId += 1;
  setupRoundEntities(currentSeed);
  phase = 'playing';
  uiRoot.innerHTML = '';
  // Give a friendly initial hop!
  for (const m of monkeys) {
    triggerFlap(m);
  }
  flappyAudio.flap(0);
  renderTopHud();
}

function startCountdownAndRun(seed: number, nextRoundId: number): void {
  roundId = nextRoundId;
  setupRoundEntities(seed);
  phase = 'countdown';
  countdownTimer = 2.6;
  lastCountdownInt = 4;
  renderOverlay();
  renderTopHud();
}

function spawnFlapParticles(m: MonkeyEntity): void {
  const colors = m.turboTimer > 0 ? ['#fef08a', '#f97316', '#ef4444'] : ['#fef08a', '#ffffff', '#d97706'];
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: worldX + m.x - 14,
      y: m.y + 8 + (Math.random() - 0.5) * 10,
      vx: -70 - Math.random() * 90,
      vy: 40 + (Math.random() - 0.5) * 90,
      size: 3 + Math.random() * 3.5,
      color: colors[i % colors.length],
      life: 0.35 + Math.random() * 0.2,
      maxLife: 0.55,
      rot: Math.random() * 6,
      vrot: (Math.random() - 0.5) * 8,
      gravity: 160,
      kind: 'circle',
    });
  }
}

function spawnBurst(
  wx: number,
  wy: number,
  color: string,
  count: number,
  kind: Particle['kind'] = 'circle',
): void {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const sp = 80 + Math.random() * 220;
    particles.push({
      x: wx,
      y: wy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      size: 4 + Math.random() * 5,
      color,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
      rot: Math.random() * 6,
      vrot: (Math.random() - 0.5) * 14,
      gravity: 340,
      kind,
    });
  }
}

function spawnFloatingText(x: number, y: number, text: string, color: string, scale = 1): void {
  floatingTexts.push({
    x,
    y,
    vy: -48,
    text,
    color,
    scale,
    life: 1.15,
    maxLife: 1.15,
  });
}

function handleFlap(playerIdx: number): void {
  if (phase !== 'playing') return;
  const m = monkeys[playerIdx];
  if (!m || !m.alive) return;
  if (triggerFlap(m)) {
    flappyAudio.flap(playerIdx);
    spawnFlapParticles(m);
  }
}

function triggerHorn(): void {
  if (phase !== 'playing' && phase !== 'countdown') return;
  const phrase = HORN_PHRASES[Math.floor(Math.random() * HORN_PHRASES.length)];
  localHornText = phrase;
  localHornTimer = 1.5;
  flappyAudio.horn(0);
  if (monkeys[0]) {
    spawnFloatingText(monkeys[0].x, monkeys[0].y - 44, `📯 ${phrase}`, '#fde047', 0.95);
  }
  if (room.roomCode) {
    room.send('horn', { type: 'horn', phrase });
  }
}

function checkOnlineRoundComplete(): void {
  if (gameMode !== 'online' || roundWinnerDeclared) return;
  const localDead = monkeys.every((m) => !m.alive);
  if (!localDead) return;

  const activeGhosts = Array.from(ghosts.values()).filter((g) => g.alive);
  if (activeGhosts.length > 0) return;

  // Everyone is dead! Determine winner by score
  const candidates: Array<{ id: string; name: string; score: number }> = [
    {
      id: room.localPlayer.id,
      name: room.localPlayer.name,
      score: monkeys[0]?.score ?? 0,
    },
  ];
  for (const g of ghosts.values()) {
    candidates.push({ id: g.id, name: g.name, score: g.score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  if (!top) return;

  if (room.localPlayer.isHost || candidates.length === 1) {
    roundWinnerDeclared = true;
    const entry = sessionScores.get(top.id);
    if (entry) entry.wins += 1;
    roundWinnerBanner = `🏆 ${top.name} venceu a rodada (${top.score} pts)!`;
    if (room.roomCode && candidates.length > 1) {
      room.send('round_winner', {
        type: 'round_winner',
        roundId,
        winnerId: top.id,
        winnerName: top.name,
        score: top.score,
      });
    }
    if (phase === 'gameover') renderOverlay();
    renderTopHud();
  }
}

function finishRound(): void {
  phase = 'gameover';
  gameOverAge = 0;

  const topRunScore = Math.max(...monkeys.map((m) => m.score), 0);
  const bananasEarned = monkeys.reduce((acc, m) => acc + m.bananasRun, 0);

  save.bananas += bananasEarned;
  persistSave(save);

  const prevBest = bestScore;
  const record = reportGameScore(SLUG, topRunScore, {
    bananas: save.bananas,
    bestBiome: BIOMES[bestBiomeReached].name,
  });
  bestScore = record.bestScore;
  lastReportNewRecord = topRunScore > prevBest && topRunScore > 0;

  const localEntry = sessionScores.get(room.localPlayer.id);
  if (localEntry) {
    localEntry.lastScore = topRunScore;
    localEntry.bestScore = Math.max(localEntry.bestScore, topRunScore);
  }

  if (gameMode === 'online') {
    checkOnlineRoundComplete();
  }

  renderOverlay();
  renderTopHud();
}

function isTypingInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

window.addEventListener('keydown', (e) => {
  if (isTypingInInput(e.target)) return;

  if (e.code === 'KeyB') {
    e.preventDefault();
    triggerHorn();
    return;
  }

  if (e.code === 'KeyR') {
    if (phase === 'playing' || phase === 'gameover') {
      e.preventDefault();
      startSoloOrLocalRun();
    }
    return;
  }

  if (phase === 'gameover' && gameOverAge > 0.55) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      startSoloOrLocalRun();
      return;
    }
  }

  if (phase === 'title') {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      startSoloOrLocalRun();
    }
    return;
  }

  if (phase !== 'playing') return;

  if (gameMode === 'local2p') {
    if (e.code === 'KeyW' || e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) handleFlap(0);
    } else if (e.code === 'ArrowUp' || e.code === 'Enter' || e.code === 'KeyK') {
      e.preventDefault();
      if (!e.repeat) handleFlap(1);
    }
  } else {
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat) handleFlap(0);
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (phase !== 'playing') return;
  e.preventDefault();
  if (gameMode === 'local2p') {
    const isRight = e.clientX >= window.innerWidth * 0.5;
    handleFlap(isRight ? 1 : 0);
  } else {
    handleFlap(0);
  }
});

// Main Simulation Loop
let lastTime = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  timeSec += dt;

  if (shakeAmount > 0) shakeAmount = Math.max(0, shakeAmount - dt * 28);
  if (turboFlash > 0) turboFlash = Math.max(0, turboFlash - dt * 1.4);
  if (biomeBannerTimer > 0) biomeBannerTimer = Math.max(0, biomeBannerTimer - dt);
  if (coinStreakTimer > 0) {
    coinStreakTimer -= dt;
    if (coinStreakTimer <= 0) coinStreak = 0;
  }
  if (localHornTimer > 0) localHornTimer = Math.max(0, localHornTimer - dt);

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.rot += p.vrot * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Update floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y += t.vy * dt;
    t.life -= dt;
    if (t.life <= 0) floatingTexts.splice(i, 1);
  }

  if (phase === 'title') {
    // Gentle animated idle flight in background
    worldX += 110 * dt;
    world.ensureGenerated(worldX + logicalWidth + 400);
    world.pruneBehind(worldX);
    if (monkeys[0]) {
      monkeys[0].y = 265 + Math.sin(timeSec * 3.2) * 18;
      monkeys[0].rot = Math.cos(timeSec * 3.2) * 0.12;
      monkeys[0].propAngle += 22 * dt;
    }
  } else if (phase === 'countdown') {
    countdownTimer -= dt;
    const ceilVal = Math.ceil(countdownTimer);
    if (ceilVal !== lastCountdownInt && ceilVal >= 1 && ceilVal <= 3) {
      lastCountdownInt = ceilVal;
      flappyAudio.countdown(false);
      renderOverlay();
    }
    if (monkeys[0]) {
      monkeys[0].y = 265 + Math.sin(timeSec * 5) * 10;
      monkeys[0].propAngle += 26 * dt;
    }
    if (countdownTimer <= 0) {
      flappyAudio.countdown(true);
      phase = 'playing';
      uiRoot.innerHTML = '';
      for (const m of monkeys) triggerFlap(m);
      spawnFloatingText(logicalWidth * 0.45, 220, 'VOA MACACADA!', '#4ade80', 1.3);
      renderTopHud();
    }
  } else if (phase === 'playing' || phase === 'gameover') {
    if (phase === 'gameover') gameOverAge += dt;

    const anyAlive = monkeys.some((m) => m.alive);
    const anyTurbo = monkeys.some((m) => m.alive && m.turboTimer > 0);
    const maxScore = Math.max(...monkeys.map((m) => m.score), 0);

    const baseSpeed = Math.min(MAX_SCROLL_SPEED, BASE_SCROLL_SPEED + maxScore * 3.2);
    const scrollSpeed = anyAlive ? baseSpeed * (anyTurbo ? TURBO_SPEED_MULT : 1) : 0;

    if (anyTurbo) turboFlash = Math.min(1, turboFlash + dt * 5);

    worldX += scrollSpeed * dt;
    world.ensureGenerated(worldX + logicalWidth + 500);
    world.pruneBehind(worldX);

    // Oscillate columns and move flying hazards
    for (const col of world.columns) {
      if (col.oscAmp > 0) {
        col.gapY = col.baseGapY + Math.sin(timeSec * col.oscSpeed + col.oscPhase) * col.oscAmp;
      }
    }
    for (const f of world.flyers) {
      if (f.destroyed) continue;
      if (anyAlive) {
        f.x -= f.speedBonus * dt;
      }
      f.y = f.baseY + Math.sin(timeSec * f.bobSpeed + f.phase) * f.bobAmp;
    }

    // Step local monkeys
    for (const m of monkeys) {
      const wasAlive = m.alive;
      stepMonkey(m, dt, worldX, scrollSpeed, world.columns, world.flyers, world.coins, world.powerUps, {
        onScore: (mon, newScore) => {
          flappyAudio.score(newScore);
          const nextBiome = getBiomeForScore(newScore);
          if (nextBiome !== currentBiome) {
            currentBiome = nextBiome;
            if (nextBiome === 'city' && bestBiomeReached === 'jungle') bestBiomeReached = 'city';
            if (nextBiome === 'space') bestBiomeReached = 'space';
            biomeBannerText = `BIOMA: ${BIOMES[nextBiome].name.toUpperCase()}!`;
            biomeBannerTimer = 2.6;
            flappyAudio.biomeChange();
            spawnFloatingText(mon.x + 20, mon.y - 45, `🌍 ${BIOMES[nextBiome].name}!`, '#38bdf8', 1.15);
          }
          renderTopHud();
        },
        onCoin: (mon, coin) => {
          coinStreak += 1;
          coinStreakTimer = 1.6;
          flappyAudio.coin(coinStreak);
          spawnBurst(coin.x, coin.y, '#facc15', 8, 'circle');
          spawnFloatingText(mon.x, mon.y - 32, '+1 🍌', '#fef08a', 1);
          renderTopHud();
        },
        onPowerUp: (mon, orb) => {
          flappyAudio.powerup(orb.type);
          const label =
            orb.type === 'magnet'
              ? '🧲 ÍMÃ DE BANANA!'
              : orb.type === 'shield'
                ? '🥥 ESCUDO DE COCO!'
                : '🔥 MODO TURBO!';
          const col = orb.type === 'magnet' ? '#fb7185' : orb.type === 'shield' ? '#a3e635' : '#fb923c';
          spawnBurst(orb.x, orb.y, col, 14, 'circle');
          spawnFloatingText(mon.x, mon.y - 42, label, col, 1.12);
          renderTopHud();
        },
        onShieldBreak: (mon, x, y) => {
          flappyAudio.shieldBreak();
          shakeAmount = 8;
          spawnBurst(worldX + x, y, '#84cc16', 14, 'shard');
          spawnBurst(worldX + x, y, '#78350f', 10, 'shard');
          spawnFloatingText(x, y - 34, '🥥 CASCA GROSSA!', '#bef264', 1.1);
          renderTopHud();
        },
        onTurboSmash: (mon, x, y) => {
          flappyAudio.turboSmash();
          shakeAmount = 7;
          spawnBurst(worldX + x, y, '#f97316', 14, 'shard');
          spawnFloatingText(x, y - 32, '💥 ESMAGOU! +2', '#fdba74', 1.05);
        },
        onNearMiss: (mon, x, y) => {
          flappyAudio.nearMiss();
          spawnFloatingText(x, y, '⚡ RASPÃO! +1', '#38bdf8', 0.95);
        },
        onDeath: (mon) => {
          flappyAudio.crash();
          shakeAmount = 14;
          spawnBurst(worldX + mon.x, mon.y, '#ef4444', 14, 'circle');
          spawnBurst(worldX + mon.x, mon.y, '#facc15', 10, 'shard');
          spawnFloatingText(mon.x, mon.y - 35, `💀 ${mon.deathCause}`, '#fecdd3', 0.95);

          if (gameMode === 'online' && room.roomCode) {
            room.send('player_died', {
              type: 'player_died',
              roundId,
              score: mon.score,
              survivalTime: mon.survivalTime,
              quote: mon.deathCause,
            });
          }
        },
        onBounce: (mon) => {
          flappyAudio.bounce();
          spawnBurst(worldX + mon.x, mon.y + 10, '#d6d3d1', 6, 'circle');
        },
      });

      if (wasAlive && !m.alive && monkeys.every((mk) => !mk.alive) && phase === 'playing') {
        finishRound();
      }
    }

    // Interpolate P2P Ghosts
    for (const g of ghosts.values()) {
      g.worldX += (g.targetWorldX - g.worldX) * Math.min(1, dt * 12);
      g.y += (g.targetY - g.y) * Math.min(1, dt * 14);
      g.rot += (g.targetRot - g.rot) * Math.min(1, dt * 14);
      g.propAngle += (g.alive ? 24 : 0) * dt;
      if (g.flapTimer > 0) g.flapTimer = Math.max(0, g.flapTimer - dt);
      if (g.hornTimer > 0) g.hornTimer = Math.max(0, g.hornTimer - dt);
    }

    // Broadcast local state at ~20 Hz during Online race
    if (gameMode === 'online' && room.roomCode && monkeys[0]) {
      netSyncAccum += dt;
      if (netSyncAccum >= 0.05) {
        netSyncAccum = 0;
        const m = monkeys[0];
        room.send('player_state', {
          type: 'player_state',
          roundId,
          worldX,
          y: m.y,
          rot: m.rot,
          alive: m.alive,
          score: m.score,
          skin: m.skin,
          hasShield: m.hasShield,
          isTurbo: m.turboTimer > 0,
          flapping: m.flapTimer > 0.14,
          ragdollX: m.x,
          ragdollY: m.y,
        });
      }
    }
  }

  // Render Canvas
  renderGameFrame(ctx, canvas.width, canvas.height, {
    logicalWidth,
    timeSec,
    worldX,
    biome: currentBiome,
    biomeBannerText,
    biomeBannerTimer,
    shakeAmount,
    turboFlash,
    monkeys,
    ghosts: gameMode === 'online' ? Array.from(ghosts.values()) : [],
    columns: world.columns,
    flyers: world.flyers,
    coins: world.coins,
    powerUps: world.powerUps,
    particles,
    floatingTexts,
    is2PLocal: gameMode === 'local2p',
  });

  if (phase === 'playing') {
    updatePowerUpPills();
  }

  requestAnimationFrame(loop);
}

function renderTopHud(): void {
  if (phase === 'title') {
    topHud.innerHTML = '';
    return;
  }

  const scoreMain =
    gameMode === 'local2p'
      ? `${monkeys[0]?.score ?? 0} × ${monkeys[1]?.score ?? 0}`
      : `${monkeys[0]?.score ?? 0}`;
  const bananasRun = monkeys.reduce((a, m) => a + m.bananasRun, 0);
  const biomeDef = BIOMES[currentBiome];

  let raceHtml = '';
  if (gameMode === 'online') {
    const rows: Array<{ name: string; score: number; alive: boolean; color: string; wins: number }> = [];
    const localId = room.localPlayer.id;
    rows.push({
      name: `${room.localPlayer.name} (Você)`,
      score: monkeys[0]?.score ?? 0,
      alive: monkeys[0]?.alive ?? true,
      color: room.localPlayer.color,
      wins: sessionScores.get(localId)?.wins ?? 0,
    });
    for (const g of ghosts.values()) {
      rows.push({
        name: g.name,
        score: g.score,
        alive: g.alive,
        color: g.color,
        wins: sessionScores.get(g.id)?.wins ?? 0,
      });
    }
    rows.sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score);
    raceHtml = `
      <div class="fm-race-board">
        <div class="fm-race-title">🏁 CORRIDA P2P (SESSÃO)</div>
        ${rows
          .map(
            (r) => `
          <div class="fm-race-row ${r.alive ? '' : 'dead'}">
            <span style="color:${r.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.alive ? '🐒' : '💀'} ${escapeHtml(r.name)}</span>
            <span>${r.score} pts • 🏆${r.wins}</span>
          </div>`,
          )
          .join('')}
      </div>`;
  }

  topHud.innerHTML = `
    <div class="fm-score-center">
      <div class="fm-big-score">${scoreMain}</div>
      <div class="fm-sub-pills">
        <span class="fm-pill biome">🌍 ${biomeDef.name}</span>
        <span class="fm-pill">🍌 +${bananasRun}</span>
        <span id="fm-power-pills" style="display:contents;"></span>
      </div>
    </div>
    <div class="fm-right-col">
      ${
        phase === 'playing'
          ? `<button class="fm-btn-mini" id="fm-horn-btn">📯 Buzina (B)</button>`
          : ''
      }
      ${raceHtml}
    </div>
  `;

  const hornBtn = document.getElementById('fm-horn-btn');
  if (hornBtn) {
    hornBtn.onclick = () => triggerHorn();
  }
  updatePowerUpPills();
}

function updatePowerUpPills(): void {
  const wrap = document.getElementById('fm-power-pills');
  if (!wrap || !monkeys[0]) return;
  const m = monkeys[0];
  const pills: string[] = [];
  if (m.magnetTimer > 0) {
    pills.push(`<span class="fm-pill power-magnet">🧲 ${m.magnetTimer.toFixed(1)}s</span>`);
  }
  if (m.hasShield) {
    pills.push(`<span class="fm-pill power-shield">🥥 Escudo</span>`);
  }
  if (m.turboTimer > 0) {
    pills.push(`<span class="fm-pill power-turbo">🔥 Turbo ${m.turboTimer.toFixed(1)}s</span>`);
  }
  wrap.innerHTML = pills.join('');
}

function renderOverlay(): void {
  if (phase === 'playing') {
    uiRoot.innerHTML = '';
    return;
  }

  if (phase === 'countdown') {
    const val = Math.max(1, Math.ceil(countdownTimer));
    uiRoot.innerHTML = `<div class="fm-countdown-banner">${val}</div>`;
    return;
  }

  if (phase === 'title') {
    const onlineCount = room.getPlayers().length;
    uiRoot.innerHTML = `
      <div class="fm-card">
        <h1 class="fm-title">🍌 FLAPPY MICO</h1>
        <div class="fm-subtitle">VOO DA VERGONHA • Hélice de Banana, Biomas &amp; Ragdoll!</div>

        <div class="fm-stats-row">
          <div class="fm-stat-box">
            <div class="fm-stat-label">🏆 Recorde</div>
            <div class="fm-stat-val">${bestScore}</div>
          </div>
          <div class="fm-stat-box">
            <div class="fm-stat-label">🍌 Bananas</div>
            <div class="fm-stat-val">${save.bananas}</div>
          </div>
        </div>

        <div class="fm-mode-tabs">
          <button class="fm-mode-btn ${gameMode === 'solo' ? 'active' : ''}" data-mode="solo">🐒 Solo</button>
          <button class="fm-mode-btn ${gameMode === 'local2p' ? 'active' : ''}" data-mode="local2p">👥 2P Local</button>
          <button class="fm-mode-btn ${gameMode === 'online' ? 'active' : ''}" data-mode="online">🌐 Online (${Math.max(1, onlineCount)})</button>
        </div>

        <div class="fm-skins-wrap">
          <div class="fm-skins-header">
            <span>👕 Skins do Mico</span>
            <span>🍌 ${save.bananas} disponíveis</span>
          </div>
          <div class="fm-skins-grid">
            ${MONKEY_SKINS.map((sk) => {
              const unlocked = save.unlockedSkins.includes(sk.id);
              const selected = save.selectedSkin === sk.id;
              return `
                <button class="fm-skin-btn ${selected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" data-skin="${sk.id}">
                  <span style="font-size:18px;">${sk.emoji}</span>
                  <span>${sk.name}</span>
                  <span class="fm-skin-cost">${selected ? '✅ Em uso' : unlocked ? 'Liberada' : `🔒 ${sk.cost} 🍌`}</span>
                </button>`;
            }).join('')}
          </div>
        </div>

        <button class="fm-play-btn" id="fm-start-btn">
          ${gameMode === 'online' && onlineCount > 1 ? '🏁 LARGAR CORRIDA!' : '🚀 JOGAR!'}
        </button>

        <div class="fm-controls-hint">
          ${
            gameMode === 'local2p'
              ? '<b>2P Local:</b> Jogador 1 (<b>W / Espaço</b> ou toque à esquerda) vs Jogador 2 (<b>Seta ↑ / K / Enter</b> ou toque à direita)!'
              : gameMode === 'online'
                ? '<b>Corrida P2P:</b> Abra "🐒 Co-op Online" no topo esquerdo para convidar amigos! Todos voam no mesmo seed com fantasmas visíveis. Tecla <b>B</b> buzina!'
                : '<b>Controles:</b> <b>Espaço / W / Seta ↑ / Clique / Toque</b> para bater a hélice de banana! Colete 🧲 Ímã, 🥥 Escudo e 🔥 Turbo!'
          }
        </div>
      </div>
    `;

    uiRoot.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.onclick = () => {
        monkeyAudio.play('click');
        gameMode = btn.dataset.mode as GameMode;
        renderOverlay();
      };
    });

    uiRoot.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((btn) => {
      btn.onclick = () => {
        const skinId = btn.dataset.skin as SkinId;
        const skinDef = MONKEY_SKINS.find((s) => s.id === skinId);
        if (!skinDef) return;
        if (save.unlockedSkins.includes(skinId)) {
          save.selectedSkin = skinId;
          persistSave(save);
          monkeyAudio.play('click');
          if (monkeys[0]) monkeys[0].skin = skinId;
          renderOverlay();
        } else if (save.bananas >= skinDef.cost) {
          save.bananas -= skinDef.cost;
          save.unlockedSkins.push(skinId);
          save.selectedSkin = skinId;
          persistSave(save);
          monkeyAudio.play('fanfare');
          hud.toast(`🎉 Skin ${skinDef.name} desbloqueada!`, 'banana');
          if (monkeys[0]) monkeys[0].skin = skinId;
          renderOverlay();
        } else {
          monkeyAudio.play('rage', 0.15);
          hud.toast(`Faltam ${skinDef.cost - save.bananas} 🍌 para ${skinDef.name}!`, 'chaos');
        }
      };
    });

    document.getElementById('fm-start-btn')!.onclick = () => {
      monkeyAudio.play('click');
      startSoloOrLocalRun();
    };
    return;
  }

  // Game Over Card
  const p1 = monkeys[0];
  const p2 = monkeys[1];
  const topScore = Math.max(...monkeys.map((m) => m.score), 0);
  const bananasEarned = monkeys.reduce((acc, m) => acc + m.bananasRun, 0);
  const quote = p1?.deathCause || 'Caiu igual meu salário!';

  let local2pResult = '';
  if (gameMode === 'local2p' && p1 && p2) {
    const winner =
      p1.score > p2.score
        ? '🏆 Jogador 1 venceu!'
        : p2.score > p1.score
          ? '🏆 Jogador 2 venceu!'
          : p1.survivalTime >= p2.survivalTime
            ? '🏆 Jogador 1 durou mais!'
            : '🏆 Jogador 2 durou mais!';
    local2pResult = `<div class="fm-new-record" style="background:#38bdf8;">${winner} (${p1.score} × ${p2.score})</div>`;
  }

  uiRoot.innerHTML = `
    <div class="fm-card">
      ${lastReportNewRecord ? '<div class="fm-new-record">🔥 NOVO RECORDE!</div>' : ''}
      ${local2pResult}
      ${roundWinnerBanner ? `<div class="fm-new-record">${escapeHtml(roundWinnerBanner)}</div>` : ''}
      <h2 class="fm-title">💀 VOO ENCERRADO!</h2>
      <div class="fm-death-quote">"${escapeHtml(quote)}"</div>

      <div class="fm-stats-row">
        <div class="fm-stat-box">
          <div class="fm-stat-label">Pontos</div>
          <div class="fm-stat-val">${topScore}</div>
        </div>
        <div class="fm-stat-box">
          <div class="fm-stat-label">Melhor</div>
          <div class="fm-stat-val">${bestScore}</div>
        </div>
        <div class="fm-stat-box">
          <div class="fm-stat-label">Bananas</div>
          <div class="fm-stat-val">+${bananasEarned} 🍌</div>
        </div>
      </div>

      <div style="font-size:12px;color:#94a3b8;font-weight:700;margin-bottom:12px;">
        Bioma alcançado: <b style="color:${BIOMES[bestBiomeReached].accent};">${BIOMES[bestBiomeReached].name}</b> • Banco: <b>${save.bananas} 🍌</b>
      </div>

      <button class="fm-play-btn" id="fm-retry-btn">
        ${gameMode === 'online' && room.getPlayers().length > 1 ? '🏁 NOVA CORRIDA (TODOS)!' : '🔄 JOGAR DE NOVO (R)'}
      </button>
      <button class="fm-secondary-btn" id="fm-menu-btn">👕 Skins / Trocar Modo</button>
    </div>
  `;

  document.getElementById('fm-retry-btn')!.onclick = () => {
    monkeyAudio.play('click');
    startSoloOrLocalRun();
  };
  document.getElementById('fm-menu-btn')!.onclick = () => {
    monkeyAudio.play('click');
    phase = 'title';
    initIdleDemo();
    renderOverlay();
    renderTopHud();
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Start
initIdleDemo();
renderOverlay();
renderTopHud();
requestAnimationFrame(loop);
