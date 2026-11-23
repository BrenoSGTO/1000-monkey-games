import './styles.css';
import {
  getGameScore,
  monkeyAudio,
  mountMonkeyHud,
  PeerRoom,
  reportGameScore,
  type PlayerProfile,
} from '@monkey-slop/sdk';
import { crushAudio } from './audio';
import {
  ALL_FRUITS,
  applyGravityAndRefill,
  canSwapCells,
  countBabiesOnBoard,
  countRemainingJelly,
  createBoard,
  expandAndClearCells,
  findAllValidMoves,
  findMatchGroups,
  FRUIT_META,
  makePiece,
  rescueExitBabies,
  SeededRng,
  shuffleBoard,
} from './engine';
import { LEVELS } from './levels';
import { drawBoard, drawMascot, getBoardMetrics } from './renderer';
import type {
  BeamEffect,
  Cell,
  FloatingText,
  GameMode,
  LevelDef,
  MascotMood,
  MascotState,
  MoveCoord,
  NetMessage,
  Particle,
  SavedProgress,
  ScreenView,
} from './types';

const SLUG = 'monkey-crush';
const PROGRESS_KEY = 'monkey-crush:progress:v1';

const COMBO_QUOTES = [
  'BORA MACACADA!',
  'OLHA O PENTE!',
  'TÁ PEGANDO FOGO, BICHO!',
  'SURTO DE POTÁSSIO!!',
  'CHAMA O IBAMA!!',
  'REI DA BANANADA!!',
];

const FLOATING_WORDS = [
  'GOSTOSO!',
  'DELÍCIA!',
  'BANANADA!',
  'MACACADA!',
  'SURTO TOTAL!',
  'DIVINO DE POTÁSSIO!',
];

function loadProgress(): SavedProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedProgress;
      return {
        unlockedLevel: Math.max(1, parsed.unlockedLevel || 1),
        levels: parsed.levels || {},
        totalScore: parsed.totalScore || 0,
        allUnlocked: Boolean(parsed.allUnlocked),
      };
    }
  } catch {
    // ignore storage errors
  }
  return { unlockedLevel: 1, levels: {}, totalScore: 0, allUnlocked: false };
}

function saveProgress(prog: SavedProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
  } catch {
    // ignore
  }
}

class BananaCrushGame {
  private appEl: HTMLElement;
  private progress: SavedProgress = loadProgress();
  private screen: ScreenView = 'title';
  private mode: GameMode = 'saga';

  private level: LevelDef = LEVELS[0];
  private grid: Cell[][] = [];
  private rng = new SeededRng(Date.now());
  private currentSeed = 1;

  private score = 0;
  private movesLeft = 15;
  private babiesRescued = 0;
  private totalBabies = 0;
  private initialJelly = 0;

  private busy = false;
  private ended = false;
  private sessionToken = 0;
  private selected: { r: number; c: number } | null = null;
  private dragStart: { r: number; c: number; x: number; y: number } | null = null;

  // Hints & Timers
  private idleTimer = 0;
  private hintMove: MoveCoord | null = null;
  private time = 0;
  private lastFrameTs = 0;

  // Juice
  private particles: Particle[] = [];
  private beams: BeamEffect[] = [];
  private floatingTexts: FloatingText[] = [];
  private shakeMag = 0;

  private mascot: MascotState = {
    mood: 'idle',
    quote: 'Bora amassar essas frutas!',
    quoteTimer: 0,
    bounce: 0,
    blinkTimer: 2.5,
    blinking: false,
    time: 0,
  };

  // Multiplayer & Versus state
  private room: PeerRoom<NetMessage>;
  private hud: ReturnType<typeof mountMonkeyHud>;
  private players: PlayerProfile[] = [];
  private versusTimeLeft = 90;
  private rivalScore = 0;
  private rivalName = 'Chimp Bot';
  private botTimer = 0;
  private coopTurnPlayerId = '';
  private remoteCursor: { r: number; c: number; color: string; name: string } | null = null;
  private lastCursorSent = 0;

  // DOM refs in playing view
  private boardCanvas: HTMLCanvasElement | null = null;
  private mascotCanvas: HTMLCanvasElement | null = null;
  private hudRefs: {
    scoreVal?: HTMLElement;
    movesVal?: HTMLElement;
    movesLabel?: HTMLElement;
    goalText?: HTMLElement;
    progressFill?: HTMLElement;
    speech?: HTMLElement;
    mpBanner?: HTMLElement;
  } = {};

  constructor() {
    this.appEl = document.getElementById('app')!;

    this.room = new PeerRoom<NetMessage>(SLUG, {
      onPlayersChange: (players) => {
        this.players = players;
        this.hud.setPlayers(players);
        if (this.screen !== 'playing') {
          this.renderView();
        } else {
          this.updateHudDom();
        }
      },
      onStatus: (status, detail) => {
        if (status === 'connected' && detail) {
          this.hud.toast(detail, 'info');
        }
      },
      onMessage: (env) => this.handleNetMessage(env.senderId, env.senderName, env.payload),
    });

    this.hud = mountMonkeyHud({
      slug: SLUG,
      title: 'Banana Crush: Saga da Selva',
      room: this.room,
    });

    window.addEventListener('keydown', (e) => {
      if (this.screen !== 'playing') return;
      if (e.key === 'r' || e.key === 'R') {
        if (this.mode === 'saga' || this.mode === 'versus-solo') {
          crushAudio.playClick();
          this.startModeOrLevel(this.level.id, this.mode);
        }
      } else if (e.key === 'h' || e.key === 'H') {
        this.triggerHint();
      } else if (e.key === 'm' || e.key === 'M') {
        monkeyAudio.toggleMute();
      }
    });

    window.addEventListener('resize', () => {
      this.resizeCanvases();
    });

    this.renderView();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  private setMascot(mood: MascotMood, quote: string, duration = 2.8): void {
    this.mascot.mood = mood;
    this.mascot.quote = quote;
    this.mascot.quoteTimer = duration;
    this.mascot.bounce = 1;
    if (this.hudRefs.speech) {
      this.hudRefs.speech.textContent = quote;
    }
  }

  private handleNetMessage(senderId: string, senderName: string, msg: NetMessage): void {
    if (senderId === this.room.localPlayer.id) return;

    switch (msg.kind) {
      case 'versus-start': {
        this.rivalName = senderName;
        this.rivalScore = 0;
        this.versusTimeLeft = msg.durationSec;
        this.startModeOrLevel(10, 'versus-p2p', msg.seed);
        this.hud.toast(`⚔️ Versus P2P iniciado contra ${senderName}!`, 'chaos');
        break;
      }
      case 'versus-score': {
        this.rivalName = senderName;
        this.rivalScore = msg.score;
        this.updateHudDom();
        break;
      }
      case 'versus-peel': {
        this.applyBananaPeelAttack(msg.count, msg.fromName, msg.comboText);
        break;
      }
      case 'versus-finish': {
        this.rivalScore = Math.max(this.rivalScore, msg.finalScore);
        this.updateHudDom();
        break;
      }
      case 'coop-start': {
        this.coopTurnPlayerId = msg.turnPlayerId;
        this.startModeOrLevel(msg.levelId, 'coop-p2p', msg.seed);
        this.hud.toast(`🤝 Co-op iniciado! Fase ${msg.levelId}`, 'info');
        break;
      }
      case 'coop-move': {
        if (this.mode === 'coop-p2p' && this.screen === 'playing') {
          this.coopTurnPlayerId = msg.nextTurnPlayerId;
          this.updateHudDom();
          void this.executeSwap(msg.move.r1, msg.move.c1, msg.move.r2, msg.move.c2, false);
        }
        break;
      }
      case 'coop-cursor': {
        if (this.mode === 'coop-p2p') {
          this.remoteCursor = { r: msg.row, c: msg.col, color: msg.color, name: msg.name };
        }
        break;
      }
    }
  }

  private applyBananaPeelAttack(count: number, fromName: string, comboText: string): void {
    if (this.screen !== 'playing' || this.ended) return;
    const candidates: Cell[] = [];
    for (const row of this.grid) {
      for (const cell of row) {
        if (!cell.void && cell.crate === 0 && !cell.peel && cell.piece && !cell.piece.isBaby) {
          candidates.push(cell);
        }
      }
    }
    let placed = 0;
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const idx = Math.floor(Math.random() * candidates.length);
      const cell = candidates.splice(idx, 1)[0];
      cell.peel = true;
      placed++;
      this.spawnBurst(cell.row + 0.5, cell.col + 0.5, '#facc15', 10);
    }
    if (placed > 0) {
      crushAudio.playPeelSplat();
      this.shakeMag = Math.max(this.shakeMag, 9);
      this.setMascot('hit', `OLHA A CASCA DE ${fromName.toUpperCase()}!`, 3.0);
      this.hud.toast(`🍌 ${fromName} mandou ${placed} Casca(s) (${comboText})!`, 'chaos');
      // Guarantee at least 1 valid move stays available
      if (findAllValidMoves(this.grid).length === 0) {
        for (const row of this.grid) {
          for (const c of row) c.peel = false;
        }
      }
    }
  }

  private renderView(): void {
    this.appEl.innerHTML = '';

    // Top bar spacer + navigation pills (to the right of .msdk-bar)
    const topbar = document.createElement('div');
    topbar.className = 'mc-topbar-spacer';

    if (this.screen !== 'title') {
      const homeBtn = document.createElement('button');
      homeBtn.className = 'mc-pill';
      homeBtn.textContent = '🏠 Início';
      homeBtn.onclick = () => {
        crushAudio.playClick();
        this.sessionToken++;
        this.screen = 'title';
        this.renderView();
      };
      topbar.appendChild(homeBtn);
    }

    if (this.screen === 'playing' && this.mode === 'saga') {
      const mapBtn = document.createElement('button');
      mapBtn.className = 'mc-pill green';
      mapBtn.textContent = '🗺️ Mapa';
      mapBtn.onclick = () => {
        crushAudio.playClick();
        this.sessionToken++;
        this.screen = 'map';
        this.renderView();
      };
      topbar.appendChild(mapBtn);
    }

    if (this.players.length >= 2 && this.room.localPlayer.isHost && this.screen !== 'playing') {
      const mpVersusBtn = document.createElement('button');
      mpVersusBtn.className = 'mc-pill purple';
      mpVersusBtn.textContent = `⚔️ Iniciar Versus P2P (${this.players.length} jog.)`;
      mpVersusBtn.onclick = () => this.launchP2PVersus();
      topbar.appendChild(mpVersusBtn);
    }

    this.appEl.appendChild(topbar);

    if (this.screen === 'title') {
      this.renderTitleScreen();
    } else if (this.screen === 'map') {
      this.renderMapScreen();
    } else {
      this.renderPlayScreen();
    }
  }

  private renderTitleScreen(): void {
    const wrap = document.createElement('div');
    wrap.className = 'mc-title-screen';

    const bestRec = getGameScore(SLUG);
    const totalStars = Object.values(this.progress.levels).reduce((sum, l) => sum + l.stars, 0);
    const maxStars = LEVELS.length * 3;
    const nextLvl = Math.min(LEVELS.length, this.progress.unlockedLevel);
    const connectedCount = this.players.length;

    const card = document.createElement('div');
    card.className = 'mc-hero-card';

    const left = document.createElement('div');
    left.innerHTML = `
      <div class="mc-hero-badge">🍌 MATCH-3 TROPICAL • ${LEVELS.length} FASES</div>
      <h1 class="mc-hero-title">Banana Crush:<br/>Saga da Selva</h1>
      <p class="mc-hero-sub">
        Combine frutas zoiudas, estoure gelatinas de açaí, salve macaquinhos bebês e crie
        <strong>Macacos Listrados</strong>, <strong>Bombas de Coco</strong> e <strong>Bananas Arco-Íris</strong>!
      </p>
    `;

    const btnStack = document.createElement('div');
    btnStack.className = 'mc-btn-stack';

    const playNowBtn = document.createElement('button');
    playNowBtn.className = 'mc-btn primary';
    playNowBtn.textContent = `▶ JOGAR FASE ${nextLvl}`;
    playNowBtn.onclick = () => {
      crushAudio.playClick();
      this.startModeOrLevel(nextLvl, 'saga');
    };
    btnStack.appendChild(playNowBtn);

    const mapBtn = document.createElement('button');
    mapBtn.className = 'mc-btn secondary';
    mapBtn.textContent = `🗺️ Mapa da Selva (${totalStars}/${maxStars} ⭐)`;
    mapBtn.onclick = () => {
      crushAudio.playClick();
      this.screen = 'map';
      this.renderView();
    };
    btnStack.appendChild(mapBtn);

    const versusBtn = document.createElement('button');
    versusBtn.className = 'mc-btn versus';
    versusBtn.textContent =
      connectedCount >= 2
        ? `⚔️ Versus P2P 90s (${connectedCount} na sala!)`
        : '⚔️ Versus 90s (vs Chimp Bot / P2P)';
    versusBtn.onclick = () => {
      crushAudio.playClick();
      if (connectedCount >= 2) {
        if (this.room.localPlayer.isHost) {
          this.launchP2PVersus();
        } else {
          this.hud.toast('Aguardando o líder da sala iniciar o Versus P2P!', 'info');
        }
      } else {
        this.startModeOrLevel(10, 'versus-solo');
      }
    };
    btnStack.appendChild(versusBtn);

    const coopBtn = document.createElement('button');
    coopBtn.className = 'mc-btn coop';
    coopBtn.textContent =
      connectedCount >= 2
        ? `🤝 Co-op Turnos P2P (Fase ${nextLvl})`
        : '🤝 Co-op Online (Abra uma sala no topo)';
    coopBtn.onclick = () => {
      crushAudio.playClick();
      if (connectedCount >= 2) {
        if (this.room.localPlayer.isHost) {
          this.launchP2PCoop(nextLvl);
        } else {
          this.hud.toast('Aguardando o líder da sala iniciar o Co-op!', 'info');
        }
      } else {
        this.hud.toast('Clique em "🐒 Co-op Online" no topo esquerdo para chamar um amigo!', 'info');
      }
    };
    btnStack.appendChild(coopBtn);

    left.appendChild(btnStack);

    const right = document.createElement('div');
    right.className = 'mc-hero-right';
    right.innerHTML = `
      <div class="mc-hero-preview">
        <strong>🍌 Guia Rápido da Selva:</strong><br/>
        • <strong>3 frutas:</strong> Estouro clássico<br/>
        • <strong>4 em linha:</strong> Macaco Listrado (varre linha/coluna)<br/>
        • <strong>Formato L ou T:</strong> Bomba de Coco (explode 3x3)<br/>
        • <strong>5 em linha:</strong> Banana Arco-Íris (limpa toda uma cor!)<br/>
        • <strong>Combo de Especiais:</strong> Troque 2 especiais entre si para efeitos insanos!<br/><br/>
        🏆 <strong>Recorde no Portal:</strong> ${bestRec.bestScore.toLocaleString('pt-BR')} pts<br/>
        🎮 <strong>Controles:</strong> Arraste (swipe) ou clique em 2 frutas vizinhas.
      </div>
    `;

    card.appendChild(left);
    card.appendChild(right);
    wrap.appendChild(card);
    this.appEl.appendChild(wrap);
  }

  private renderMapScreen(): void {
    const wrap = document.createElement('div');
    wrap.className = 'mc-map-screen';

    const totalStars = Object.values(this.progress.levels).reduce((sum, l) => sum + l.stars, 0);

    const header = document.createElement('div');
    header.className = 'mc-map-header';
    header.innerHTML = `
      <div>
        <h2>🗺️ Trilha da Selva — 24 Fases</h2>
      </div>
      <div class="mc-map-stats">
        <span>⭐ ${totalStars} / ${LEVELS.length * 3}</span>
        <span>🏆 ${this.progress.totalScore.toLocaleString('pt-BR')} pts</span>
      </div>
    `;

    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'mc-pill';
    unlockBtn.textContent = this.progress.allUnlocked ? '🔓 Todas Liberadas' : '🔑 Liberar Todas';
    unlockBtn.onclick = () => {
      crushAudio.playClick();
      this.progress.allUnlocked = !this.progress.allUnlocked;
      saveProgress(this.progress);
      this.renderView();
    };
    header.querySelector('.mc-map-stats')!.appendChild(unlockBtn);
    wrap.appendChild(header);

    const gridWrap = document.createElement('div');
    gridWrap.className = 'mc-map-scroll';

    for (const lvl of LEVELS) {
      const rec = this.progress.levels[lvl.id];
      const stars = rec?.stars ?? 0;
      const unlocked = Boolean(this.progress.allUnlocked) || lvl.id <= this.progress.unlockedLevel;
      const isCurrent = lvl.id === this.progress.unlockedLevel;

      const node = document.createElement('button');
      node.className = `mc-level-node ${unlocked ? '' : 'locked'} ${isCurrent ? 'current' : ''}`;
      const objIcon =
        lvl.objective === 'jelly' ? '🟣 Gelatina' : lvl.objective === 'babies' ? '🐒 Resgate' : '🎯 Pontos';
      const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

      node.innerHTML = `
        <div class="mc-node-top">
          <span>${unlocked ? lvl.name : `🔒 ${lvl.name}`}</span>
        </div>
        <div class="mc-node-sub">${lvl.subtitle}</div>
        <div class="mc-node-meta">
          <span>${objIcon} • ${lvl.moves} jog.</span>
          <span>${starStr}</span>
        </div>
      `;

      if (unlocked) {
        node.onclick = () => {
          crushAudio.playClick();
          this.startModeOrLevel(lvl.id, 'saga');
        };
      }
      gridWrap.appendChild(node);
    }

    wrap.appendChild(gridWrap);
    this.appEl.appendChild(wrap);
  }

  private renderPlayScreen(): void {
    const play = document.createElement('div');
    play.className = 'mc-play-screen';

    const sidebar = document.createElement('div');
    sidebar.className = 'mc-sidebar';

    // HUD Card
    const hudCard = document.createElement('div');
    hudCard.className = 'mc-hud-card';
    hudCard.innerHTML = `
      <div class="mc-level-title">${
        this.mode === 'versus-p2p'
          ? '⚔️ Duelo Versus P2P (90s)'
          : this.mode === 'versus-solo'
            ? '⚔️ Duelo 90s vs Chimp Bot'
            : this.mode === 'coop-p2p'
              ? `🤝 Co-op: ${this.level.name}`
              : this.level.name
      }</div>
      <div class="mc-level-desc">${
        this.mode.startsWith('versus')
          ? 'Combos de 2x+ ou especiais jogam Cascas de Banana no rival!'
          : this.level.subtitle
      }</div>
      <div class="mc-stats-row">
        <div class="mc-stat-box">
          <div class="mc-stat-label">Pontos</div>
          <div class="mc-stat-val" id="mc-score">0</div>
        </div>
        <div class="mc-stat-box">
          <div class="mc-stat-label" id="mc-moves-label">${
            this.mode.startsWith('versus') ? 'Tempo' : 'Jogadas'
          }</div>
          <div class="mc-stat-val" id="mc-moves">15</div>
        </div>
      </div>
      <div class="mc-goal-bar">
        <span>Objetivo</span>
        <span id="mc-goal-text">...</span>
      </div>
      <div class="mc-progress-track">
        <div class="mc-progress-fill" id="mc-progress-fill" style="width: 0%"></div>
      </div>
    `;
    sidebar.appendChild(hudCard);

    // Multiplayer / Versus live banner
    if (this.mode !== 'saga') {
      const mpBanner = document.createElement('div');
      mpBanner.className = `mc-mp-banner ${this.mode === 'coop-p2p' ? 'coop' : ''}`;
      mpBanner.id = 'mc-mp-banner';
      sidebar.appendChild(mpBanner);
      this.hudRefs.mpBanner = mpBanner;
    } else {
      this.hudRefs.mpBanner = undefined;
    }

    // Mascot Card
    const mascotCard = document.createElement('div');
    mascotCard.className = 'mc-mascot-card';
    const speech = document.createElement('div');
    speech.className = 'mc-speech-bubble';
    speech.textContent = this.mascot.quote;
    const mCanvas = document.createElement('canvas');
    mCanvas.id = 'mascot-canvas';
    mCanvas.width = 240;
    mCanvas.height = 160;
    mascotCard.appendChild(speech);
    mascotCard.appendChild(mCanvas);
    sidebar.appendChild(mascotCard);

    // Action Buttons
    const actionsRow = document.createElement('div');
    actionsRow.className = 'mc-actions-row';

    const hintBtn = document.createElement('button');
    hintBtn.className = 'mc-btn secondary';
    hintBtn.textContent = '💡 Dica (H)';
    hintBtn.onclick = () => this.triggerHint();
    actionsRow.appendChild(hintBtn);

    if (this.mode === 'saga' || this.mode === 'versus-solo') {
      const restartBtn = document.createElement('button');
      restartBtn.className = 'mc-btn secondary';
      restartBtn.textContent = '🔄 Reiniciar';
      restartBtn.onclick = () => {
        crushAudio.playClick();
        this.startModeOrLevel(this.level.id, this.mode);
      };
      actionsRow.appendChild(restartBtn);
    }
    sidebar.appendChild(actionsRow);

    // Board Canvas Wrap
    const boardWrap = document.createElement('div');
    boardWrap.className = 'mc-board-wrap';
    const bCanvas = document.createElement('canvas');
    bCanvas.id = 'board-canvas';
    boardWrap.appendChild(bCanvas);

    play.appendChild(sidebar);
    play.appendChild(boardWrap);
    this.appEl.appendChild(play);

    this.boardCanvas = bCanvas;
    this.mascotCanvas = mCanvas;
    this.hudRefs.scoreVal = hudCard.querySelector('#mc-score')!;
    this.hudRefs.movesVal = hudCard.querySelector('#mc-moves')!;
    this.hudRefs.movesLabel = hudCard.querySelector('#mc-moves-label')!;
    this.hudRefs.goalText = hudCard.querySelector('#mc-goal-text')!;
    this.hudRefs.progressFill = hudCard.querySelector('#mc-progress-fill')!;
    this.hudRefs.speech = speech;

    this.attachBoardInput(bCanvas);
    this.resizeCanvases();
    requestAnimationFrame(() => this.resizeCanvases());
    this.updateHudDom();
  }

  private resizeCanvases(): void {
    if (!this.boardCanvas || this.screen !== 'playing') return;
    const parent = this.boardCanvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const side = Math.max(240, Math.min(rect.width, rect.height, 640));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.boardCanvas.style.width = `${side}px`;
    this.boardCanvas.style.height = `${side}px`;
    this.boardCanvas.width = Math.round(side * dpr);
    this.boardCanvas.height = Math.round(side * dpr);
  }

  private launchP2PVersus(): void {
    const seed = Math.floor(Math.random() * 999999) + 1;
    const durationSec = 90;
    this.rivalScore = 0;
    this.versusTimeLeft = durationSec;
    const peer = this.players.find((p) => p.id !== this.room.localPlayer.id);
    this.rivalName = peer?.name ?? 'Rival';
    this.room.send('versus-start', { kind: 'versus-start', seed, durationSec });
    this.startModeOrLevel(10, 'versus-p2p', seed);
    this.hud.toast('⚔️ Duelo Versus P2P começou! Combos mandam cascas!', 'banana');
  }

  private launchP2PCoop(levelId: number): void {
    const seed = Math.floor(Math.random() * 999999) + 1;
    const turnPlayerId = this.room.localPlayer.id;
    this.coopTurnPlayerId = turnPlayerId;
    this.room.send('coop-start', { kind: 'coop-start', levelId, seed, turnPlayerId });
    this.startModeOrLevel(levelId, 'coop-p2p', seed);
    this.hud.toast(`🤝 Co-op iniciado na Fase ${levelId}!`, 'banana');
  }

  private startModeOrLevel(levelId: number, mode: GameMode, forcedSeed?: number): void {
    this.sessionToken++;
    this.mode = mode;
    this.level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
    this.currentSeed = forcedSeed ?? Math.floor(Math.random() * 999999) + 1;
    this.rng = new SeededRng(this.currentSeed);
    this.grid = createBoard(this.level, this.rng);

    this.score = 0;
    this.movesLeft = this.level.moves;
    this.babiesRescued = 0;
    this.totalBabies = countBabiesOnBoard(this.grid);
    this.initialJelly = countRemainingJelly(this.grid);

    this.busy = false;
    this.ended = false;
    this.selected = null;
    this.dragStart = null;
    this.hintMove = null;
    this.idleTimer = 0;
    this.particles = [];
    this.beams = [];
    this.floatingTexts = [];
    this.shakeMag = 0;
    this.remoteCursor = null;

    if (mode.startsWith('versus')) {
      this.versusTimeLeft = 90;
      this.rivalScore = 0;
      this.botTimer = 0;
      if (mode === 'versus-solo') {
        this.rivalName = 'Chimp Bot';
      }
    }

    this.setMascot('idle', 'Bora amassar essas frutas!', 3);
    this.screen = 'playing';
    this.renderView();
  }

  private updateHudDom(): void {
    if (!this.hudRefs.scoreVal) return;
    this.hudRefs.scoreVal.textContent = this.score.toLocaleString('pt-BR');

    if (this.mode.startsWith('versus')) {
      const secs = Math.max(0, Math.ceil(this.versusTimeLeft));
      this.hudRefs.movesVal!.textContent = `${secs}s`;
      this.hudRefs.movesVal!.className = `mc-stat-val ${secs <= 12 ? 'danger' : ''}`;
      this.hudRefs.goalText!.textContent = `Rival: ${this.rivalScore.toLocaleString('pt-BR')}`;
      const total = Math.max(1, this.score + this.rivalScore);
      const pct = Math.min(100, Math.round((this.score / total) * 100));
      this.hudRefs.progressFill!.style.width = `${pct}%`;
    } else {
      this.hudRefs.movesVal!.textContent = String(this.movesLeft);
      this.hudRefs.movesVal!.className = `mc-stat-val ${this.movesLeft <= 4 ? 'danger' : ''}`;

      let pct = 0;
      if (this.level.objective === 'score') {
        this.hudRefs.goalText!.textContent = `${this.score.toLocaleString('pt-BR')} / ${this.level.targetScore.toLocaleString('pt-BR')}`;
        pct = Math.min(100, (this.score / this.level.targetScore) * 100);
      } else if (this.level.objective === 'jelly') {
        const rem = countRemainingJelly(this.grid);
        const done = Math.max(0, this.initialJelly - rem);
        this.hudRefs.goalText!.textContent = `🟣 Gelatina: ${rem} rest.`;
        pct = this.initialJelly > 0 ? (done / this.initialJelly) * 100 : 100;
      } else {
        this.hudRefs.goalText!.textContent = `🐒 Resgatados: ${this.babiesRescued}/${this.totalBabies}`;
        pct = this.totalBabies > 0 ? (this.babiesRescued / this.totalBabies) * 100 : 100;
      }
      this.hudRefs.progressFill!.style.width = `${Math.round(pct)}%`;
    }

    if (this.hudRefs.mpBanner) {
      if (this.mode.startsWith('versus')) {
        const diff = this.score - this.rivalScore;
        const lead = diff >= 0 ? `Você na frente (+${diff})` : `${this.rivalName} liderando (+${-diff})`;
        this.hudRefs.mpBanner.innerHTML = `
          <div>⚔️ Você vs ${this.rivalName}</div>
          <div style="color:${diff >= 0 ? '#4ade80' : '#fda4af'}">${lead}</div>
        `;
      } else if (this.mode === 'coop-p2p') {
        const isMyTurn = this.coopTurnPlayerId === this.room.localPlayer.id;
        const turnPlayer = this.players.find((p) => p.id === this.coopTurnPlayerId);
        this.hudRefs.mpBanner.innerHTML = `
          <div>🤝 Modo Co-op Alternado</div>
          <div style="color:${isMyTurn ? '#4ade80' : '#fde047'}">
            ${isMyTurn ? 'SUA VEZ DE JOGAR!' : `Vez de ${turnPlayer?.name ?? 'Parceiro'}...`}
          </div>
        `;
      }
    }
  }

  private attachBoardInput(canvas: HTMLCanvasElement): void {
    const getCellFromPointer = (clientX: number, clientY: number): { r: number; c: number; cellSize: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const metrics = getBoardMetrics(rect.width, rect.height, this.level.rows, this.level.cols);
      const offsetX = (rect.width - metrics.size) / 2;
      const offsetY = (rect.height - metrics.size) / 2;
      const c = Math.floor((x - offsetX - metrics.pad) / metrics.cellSize);
      const r = Math.floor((y - offsetY - metrics.pad) / metrics.cellSize);
      if (r < 0 || r >= this.level.rows || c < 0 || c >= this.level.cols) return null;
      return { r, c, cellSize: metrics.cellSize };
    };

    const canAct = (): boolean => {
      if (this.busy || this.ended) return false;
      if (this.mode === 'coop-p2p' && this.coopTurnPlayerId !== this.room.localPlayer.id) {
        return false;
      }
      return true;
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!canAct()) return;
      const hit = getCellFromPointer(e.clientX, e.clientY);
      if (!hit) return;
      const cell = this.grid[hit.r][hit.c];
      if (cell.void || cell.crate > 0 || !cell.piece) return;
      if (cell.peel) {
        crushAudio.playInvalid();
        this.spawnFloatingText(hit.r + 0.5, hit.c + 0.5, 'CASCA PRESA!', '#facc15', 0.85);
        return;
      }

      canvas.setPointerCapture(e.pointerId);
      this.dragStart = { r: hit.r, c: hit.c, x: e.clientX, y: e.clientY };
      this.idleTimer = 0;
      this.hintMove = null;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.mode === 'coop-p2p' && performance.now() - this.lastCursorSent > 90) {
        const hover = getCellFromPointer(e.clientX, e.clientY);
        if (hover) {
          this.lastCursorSent = performance.now();
          this.room.send('coop-cursor', {
            kind: 'coop-cursor',
            row: hover.r,
            col: hover.c,
            color: this.room.localPlayer.color,
            name: this.room.localPlayer.name,
          });
        }
      }

      if (!this.dragStart || !canAct()) return;
      const rect = canvas.getBoundingClientRect();
      const metrics = getBoardMetrics(rect.width, rect.height, this.level.rows, this.level.cols);
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      const threshold = Math.max(14, metrics.cellSize * 0.3);

      if (Math.hypot(dx, dy) >= threshold) {
        const { r, c } = this.dragStart;
        this.dragStart = null;
        this.selected = null;
        let nr = r;
        let nc = c;
        if (Math.abs(dx) > Math.abs(dy)) {
          nc += dx > 0 ? 1 : -1;
        } else {
          nr += dy > 0 ? 1 : -1;
        }
        if (nr >= 0 && nr < this.level.rows && nc >= 0 && nc < this.level.cols) {
          void this.tryPlayerSwap(r, c, nr, nc);
        }
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this.dragStart) return;
      const { r, c } = this.dragStart;
      this.dragStart = null;
      if (!canAct()) return;

      if (!this.selected) {
        this.selected = { r, c };
        crushAudio.playClick();
        return;
      }

      if (this.selected.r === r && this.selected.c === c) {
        this.selected = null;
        return;
      }

      const dist = Math.abs(this.selected.r - r) + Math.abs(this.selected.c - c);
      if (dist === 1) {
        const prev = this.selected;
        this.selected = null;
        void this.tryPlayerSwap(prev.r, prev.c, r, c);
      } else {
        this.selected = { r, c };
        crushAudio.playClick();
      }
    });
  }

  private async tryPlayerSwap(r1: number, c1: number, r2: number, c2: number): Promise<void> {
    if (this.busy || this.ended) return;
    const a = this.grid[r1][c1];
    const b = this.grid[r2][c2];
    if (!canSwapCells(a, b)) {
      crushAudio.playInvalid();
      return;
    }

    if (this.mode === 'coop-p2p') {
      const idx = this.players.findIndex((p) => p.id === this.room.localPlayer.id);
      const nextPlayer =
        this.players.length > 0 ? this.players[(idx + 1) % this.players.length] : this.room.localPlayer;
      this.coopTurnPlayerId = nextPlayer.id;
      this.updateHudDom();
      this.room.send('coop-move', {
        kind: 'coop-move',
        move: { r1, c1, r2, c2 },
        nextTurnPlayerId: nextPlayer.id,
        playerName: this.room.localPlayer.name,
      });
    }

    await this.executeSwap(r1, c1, r2, c2, true);
  }

  private async executeSwap(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    _isLocal: boolean,
  ): Promise<void> {
    const token = this.sessionToken;
    this.busy = true;
    this.idleTimer = 0;
    this.hintMove = null;

    const cellA = this.grid[r1][c1];
    const cellB = this.grid[r2][c2];
    const pieceA = cellA.piece!;
    const pieceB = cellB.piece!;

    // Swap in grid & animate visual slide
    cellA.piece = pieceB;
    cellB.piece = pieceA;
    pieceA.xOffset = c1 - c2;
    pieceA.yOffset = r1 - r2;
    pieceB.xOffset = c2 - c1;
    pieceB.yOffset = r2 - r1;
    crushAudio.playSwap();

    await this.waitAnim(150, token);
    if (token !== this.sessionToken) return;

    // Check special + special or rainbow + fruit combo first
    const isRainbowA = pieceA.special === 'rainbow';
    const isRainbowB = pieceB.special === 'rainbow';
    const isSpecialA = pieceA.special !== 'none';
    const isSpecialB = pieceB.special !== 'none';

    const handledCombo = await this.handleSpecialPairIfAny(
      r1,
      c1,
      r2,
      c2,
      isRainbowA,
      isRainbowB,
      isSpecialA,
      isSpecialB,
      token,
    );
    if (token !== this.sessionToken) return;

    const initialMatches = handledCombo
      ? []
      : findMatchGroups(this.grid, [
          { r: r1, c: c1 },
          { r: r2, c: c2 },
        ]);

    if (!handledCombo && initialMatches.length === 0) {
      // Invalid swap -> bounce back!
      cellA.piece = pieceA;
      cellB.piece = pieceB;
      pieceA.xOffset = c2 - c1;
      pieceA.yOffset = r2 - r1;
      pieceB.xOffset = c1 - c2;
      pieceB.yOffset = r1 - r2;
      crushAudio.playInvalid();
      await this.waitAnim(150, token);
      if (token === this.sessionToken) this.busy = false;
      return;
    }

    // Valid move! Consume move in Saga / Co-op
    if (!this.mode.startsWith('versus')) {
      this.movesLeft = Math.max(0, this.movesLeft - 1);
      if (this.movesLeft <= 3 && this.movesLeft > 0) {
        this.setMascot('panicked', 'AI MEU CACHO, VAI ACABAR!', 2.6);
      }
    }
    this.updateHudDom();

    let comboStep = handledCombo ? 1 : 0;
    const activeFruits = ALL_FRUITS.slice(0, this.level.numFruits);

    if (handledCombo) {
      await this.runGravityAndRescue(activeFruits, token);
      if (token !== this.sessionToken) return;
    }

    // Cascade loop
    let preferred = [
      { r: r1, c: c1 },
      { r: r2, c: c2 },
    ];
    while (true) {
      const groups = findMatchGroups(this.grid, preferred);
      preferred = [];
      if (groups.length === 0) break;

      comboStep++;
      const toClear: { r: number; c: number }[] = [];
      const preserve = new Set<string>();
      const newSpecials: { r: number; c: number; fruit: Cell['piece'] }[] = [];

      let biggestMatch = 3;
      for (const g of groups) {
        biggestMatch = Math.max(biggestMatch, g.cells.length);
        for (const p of g.cells) toClear.push(p);
        if (g.createSpecial !== 'none') {
          const key = `${g.spawnAt.r},${g.spawnAt.c}`;
          preserve.add(key);
          newSpecials.push({
            r: g.spawnAt.r,
            c: g.spawnAt.c,
            fruit: makePiece(g.fruit, g.createSpecial, false, 0),
          });
        }
      }

      // First clear matched cells & trigger any existing specials inside them
      // Note: preserve newly-spawned special slots only if they didn't already hold an existing special
      const cleanPreserve = new Set<string>();
      for (const sp of newSpecials) {
        const cur = this.grid[sp.r][sp.c].piece;
        if (!cur || cur.special === 'none') {
          cleanPreserve.add(`${sp.r},${sp.c}`);
        }
      }

      const ev = expandAndClearCells(this.grid, toClear, this.rng, toClear, cleanPreserve);

      // Place newly created specials
      for (const sp of newSpecials) {
        const cell = this.grid[sp.r][sp.c];
        if (!cell.void && cell.crate === 0 && sp.fruit) {
          cell.piece = sp.fruit;
          sp.fruit.scaleX = 1.35;
          sp.fruit.scaleY = 1.35;
          if (cell.jelly > 0) cell.jelly--;
        }
      }

      this.applyClearVisualsAndScore(ev, comboStep, biggestMatch);
      if (newSpecials.length > 0) crushAudio.playSpecialCreate();

      await this.waitAnim(180, token);
      if (token !== this.sessionToken) return;

      await this.runGravityAndRescue(activeFruits, token);
      if (token !== this.sessionToken) return;
    }

    // Check deadlock & auto-shuffle
    if (findAllValidMoves(this.grid).length === 0) {
      shuffleBoard(this.grid, activeFruits, this.rng);
      this.hud.toast('🥗 Salada de frutas travou! Embaralhando!', 'info');
      await this.waitAnim(220, token);
      if (token !== this.sessionToken) return;
    }

    // Check Saga / Co-op End Conditions
    if (!this.mode.startsWith('versus')) {
      const won = this.isObjectiveMet();
      if (won) {
        await this.playVictoryBonusParty(token);
        if (token !== this.sessionToken) return;
        this.finishLevel(true);
        return;
      } else if (this.movesLeft <= 0) {
        this.finishLevel(false);
        return;
      }
    } else if (this.mode === 'versus-p2p') {
      this.room.send('versus-score', {
        kind: 'versus-score',
        score: this.score,
        combo: comboStep,
      });
    }

    this.busy = false;
  }

  private async handleSpecialPairIfAny(
    r1: number,
    c1: number,
    r2: number,
    c2: number,
    isRainbowA: boolean,
    isRainbowB: boolean,
    isSpecialA: boolean,
    isSpecialB: boolean,
    token: number,
  ): Promise<boolean> {
    const cellA = this.grid[r1][c1];
    const cellB = this.grid[r2][c2];
    const pA = cellA.piece!;
    const pB = cellB.piece!;

    // 1) Rainbow + Rainbow => CLEAR ENTIRE BOARD!
    if (isRainbowA && isRainbowB) {
      crushAudio.playRainbow();
      const targets: { r: number; c: number }[] = [];
      for (let r = 0; r < this.level.rows; r++) {
        for (let c = 0; c < this.level.cols; c++) {
          if (!this.grid[r][c].void) targets.push({ r, c });
        }
      }
      const ev = expandAndClearCells(this.grid, targets, this.rng);
      this.applyClearVisualsAndScore(ev, 5, 8);
      this.setMascot('hyped', 'SURTO ARCO-ÍRIS TOTAL!!', 3.5);
      await this.waitAnim(280, token);
      return true;
    }

    // 2) Rainbow + Normal/Special Fruit
    if (isRainbowA || isRainbowB) {
      const rainbowPos = isRainbowA ? { r: r2, c: c2 } : { r: r1, c: c1 };
      const otherPiece = isRainbowA ? pB : pA;
      if (otherPiece.isBaby) return false;

      crushAudio.playRainbow();
      const targetFruit = otherPiece.fruit;
      const targets: { r: number; c: number }[] = [rainbowPos];

      for (let r = 0; r < this.level.rows; r++) {
        for (let c = 0; c < this.level.cols; c++) {
          const p = this.grid[r][c].piece;
          if (p && !p.isBaby && p.fruit === targetFruit) {
            if (otherPiece.special === 'striped-h' || otherPiece.special === 'striped-v') {
              p.special = this.rng.next() < 0.5 ? 'striped-h' : 'striped-v';
            } else if (otherPiece.special === 'bomb') {
              p.special = 'bomb';
            }
            this.beams.push({
              x1: rainbowPos.c + 0.5,
              y1: rainbowPos.r + 0.5,
              x2: c + 0.5,
              y2: r + 0.5,
              color: FRUIT_META[targetFruit].color,
              life: 0.35,
              maxLife: 0.35,
              width: 7,
            });
            targets.push({ r, c });
          }
        }
      }
      const ev = expandAndClearCells(this.grid, targets, this.rng);
      this.applyClearVisualsAndScore(ev, 3, 6);
      this.setMascot('hyped', 'BANANA ARCO-ÍRIS!!', 3.0);
      await this.waitAnim(240, token);
      return true;
    }

    // 3) Special + Special (Striped/Bomb combinations)
    if (isSpecialA && isSpecialB) {
      const targets: { r: number; c: number }[] = [];
      const rows = this.level.rows;
      const cols = this.level.cols;

      if (pA.special === 'bomb' && pB.special === 'bomb') {
        // 5x5 mega crater!
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            targets.push({ r: r2 + dr, c: c2 + dc });
          }
        }
        crushAudio.playBomb();
        this.shakeMag = Math.max(this.shakeMag, 16);
      } else if (pA.special === 'bomb' || pB.special === 'bomb') {
        // Giant 3-row + 3-col cross!
        for (let d = -1; d <= 1; d++) {
          for (let cc = 0; cc < cols; cc++) targets.push({ r: r2 + d, c: cc });
          for (let rr = 0; rr < rows; rr++) targets.push({ r: rr, c: c2 + d });
        }
        crushAudio.playBomb();
        crushAudio.playStripeZap();
        this.shakeMag = Math.max(this.shakeMag, 14);
      } else {
        // Striped + Striped -> full cross!
        for (let cc = 0; cc < cols; cc++) targets.push({ r: r2, c: cc });
        for (let rr = 0; rr < rows; rr++) targets.push({ r: rr, c: c2 });
        crushAudio.playStripeZap();
      }

      // Clear their special flags first so they don't re-trigger unnecessarily, then expand
      pA.special = 'none';
      pB.special = 'none';
      const ev = expandAndClearCells(this.grid, targets, this.rng);
      this.applyClearVisualsAndScore(ev, 3, 6);
      this.setMascot('hyped', 'COMBO DUPLO DE MACACO!!', 3.0);
      await this.waitAnim(240, token);
      return true;
    }

    return false;
  }

  private async runGravityAndRescue(
    activeFruits: ReturnType<typeof ALL_FRUITS.slice>,
    token: number,
  ): Promise<void> {
    while (true) {
      const moved = applyGravityAndRefill(this.grid, activeFruits, this.rng);
      if (moved > 0) {
        await this.waitFallAnim(token);
        if (token !== this.sessionToken) return;
        crushAudio.playLand();
      }

      const rescued = rescueExitBabies(this.grid);
      if (rescued.length > 0) {
        this.babiesRescued += rescued.length;
        this.score += rescued.length * 1000;
        crushAudio.playBabyRescue();
        this.setMascot('happy', 'MACAQUINHO SALVO!!', 2.5);
        for (const pos of rescued) {
          this.spawnBurst(pos.r + 0.5, pos.c + 0.5, '#4ade80', 18);
          this.spawnFloatingText(pos.r + 0.4, pos.c + 0.5, 'SALVO! +1000', '#4ade80', 1.15);
        }
        this.updateHudDom();
        await this.waitAnim(180, token);
        if (token !== this.sessionToken) return;
        continue;
      }
      break;
    }
  }

  private applyClearVisualsAndScore(
    ev: ReturnType<typeof expandAndClearCells>,
    comboStep: number,
    matchSize: number,
  ): void {
    const count = ev.cleared.length;
    if (count === 0 && ev.peelsCleared === 0 && ev.cratesCleared === 0) return;

    const mult = 1 + (comboStep - 1) * 0.5;
    const pts = Math.round(
      (count * 60 + ev.jelliesCleared * 120 + ev.cratesCleared * 150 + ev.specialsTriggered * 250) *
        mult,
    );
    this.score += pts;

    crushAudio.playMatch(comboStep, matchSize);
    if (ev.beams.length > 0) crushAudio.playStripeZap();
    if (ev.explosions.length > 0) crushAudio.playBomb();
    if (ev.rainbowTargets.length > 0) crushAudio.playRainbow();

    // Screen shake scales with cascade & explosions
    const targetShake = Math.min(18, (comboStep - 1) * 2.5 + ev.explosions.length * 6);
    this.shakeMag = Math.max(this.shakeMag, targetShake);

    for (const c of ev.cleared) {
      const col = FRUIT_META[c.fruit].color;
      this.spawnBurst(c.r + 0.5, c.c + 0.5, col, 8);
    }
    for (const ex of ev.explosions) {
      this.particles.push({
        x: ex.c + 0.5,
        y: ex.r + 0.5,
        vx: 0,
        vy: 0,
        size: 1.6,
        color: '#fb923c',
        alpha: 0.9,
        life: 0.35,
        maxLife: 0.35,
        gravity: 0,
        kind: 'ring',
        rotation: 0,
        vRot: 0,
      });
    }
    for (const b of ev.beams) {
      this.beams.push({
        x1: b.c1 + 0.5,
        y1: b.r1 + 0.5,
        x2: b.c2 + 0.5,
        y2: b.r2 + 0.5,
        color: b.color,
        life: 0.28,
        maxLife: 0.28,
        width: 16,
      });
    }
    for (const rt of ev.rainbowTargets) {
      this.beams.push({
        x1: rt.fromC + 0.5,
        y1: rt.fromR + 0.5,
        x2: rt.toC + 0.5,
        y2: rt.toR + 0.5,
        color: rt.color,
        life: 0.3,
        maxLife: 0.3,
        width: 7,
      });
    }

    // Floating PT-BR combo text
    if (ev.cleared.length > 0) {
      const center = ev.cleared[Math.floor(ev.cleared.length / 2)];
      const word =
        comboStep >= 2
          ? `${FLOATING_WORDS[Math.min(FLOATING_WORDS.length - 1, comboStep - 1)]} x${comboStep}`
          : `+${pts}`;
      this.spawnFloatingText(
        center.r + 0.4,
        center.c + 0.5,
        word,
        comboStep >= 3 ? '#facc15' : '#fef08a',
        comboStep >= 3 ? 1.25 : 1.0,
      );
    }

    // Mascot reaction
    if (comboStep >= 3 || ev.specialsTriggered >= 2) {
      const quote = COMBO_QUOTES[Math.min(COMBO_QUOTES.length - 1, comboStep)];
      this.setMascot('hyped', quote, 2.8);
    } else if (comboStep === 2) {
      this.setMascot('happy', COMBO_QUOTES[0], 2.0);
    }

    // Versus Banana Peel attack!
    if (this.mode.startsWith('versus') && (comboStep >= 2 || ev.specialsTriggered > 0)) {
      const peelCount = Math.min(3, Math.max(1, comboStep - 1 + ev.specialsTriggered));
      const comboText = comboStep >= 3 ? `Combo x${comboStep}` : 'Especial';
      if (this.mode === 'versus-p2p') {
        this.room.send('versus-peel', {
          kind: 'versus-peel',
          count: peelCount,
          fromName: this.room.localPlayer.name,
          comboText,
        });
      }
      this.spawnFloatingText(1.2, 4.0, `🍌 +${peelCount} CASCA PRO RIVAL!`, '#fb7185', 1.1);
    }

    this.updateHudDom();
  }

  private isObjectiveMet(): boolean {
    if (this.level.objective === 'score') {
      return this.score >= this.level.targetScore;
    }
    if (this.level.objective === 'jelly') {
      return countRemainingJelly(this.grid) === 0;
    }
    return this.babiesRescued >= this.totalBabies;
  }

  private async playVictoryBonusParty(token: number): Promise<void> {
    if (this.movesLeft <= 0) return;
    this.setMascot('victory', 'FESTA DA BANANA!!', 4);
    this.hud.toast(`🎉 Sobraram ${this.movesLeft} jogadas! Bônus explosivo!`, 'banana');

    const activeFruits = ALL_FRUITS.slice(0, this.level.numFruits);
    const candidates: Cell[] = [];
    for (const row of this.grid) {
      for (const cell of row) {
        if (!cell.void && cell.crate === 0 && cell.piece && !cell.piece.isBaby && cell.piece.special === 'none') {
          candidates.push(cell);
        }
      }
    }

    const blasts = Math.min(this.movesLeft, 8);
    for (let i = 0; i < blasts && candidates.length > 0; i++) {
      this.movesLeft--;
      const idx = this.rng.int(candidates.length);
      const cell = candidates.splice(idx, 1)[0];
      if (cell.piece) {
        cell.piece.special = i % 2 === 0 ? 'striped-h' : 'bomb';
      }
      const ev = expandAndClearCells(this.grid, [{ r: cell.row, c: cell.col }], this.rng);
      this.applyClearVisualsAndScore(ev, 2, 4);
      await this.waitAnim(130, token);
      if (token !== this.sessionToken) return;
      applyGravityAndRefill(this.grid, activeFruits, this.rng);
    }
    this.movesLeft = 0;
    this.updateHudDom();
  }

  private finishLevel(won: boolean): void {
    this.ended = true;
    this.busy = false;

    if (won) {
      crushAudio.playWin();
      this.setMascot('victory', 'REI DA BANANA! UUU-AAA-AAA!', 6);
      const [s1, s2, s3] = this.level.starScores;
      const stars = this.score >= s3 ? 3 : this.score >= s2 ? 2 : this.score >= s1 ? 1 : 1;

      if (this.mode === 'saga') {
        const prev = this.progress.levels[this.level.id];
        this.progress.levels[this.level.id] = {
          stars: Math.max(prev?.stars ?? 0, stars),
          bestScore: Math.max(prev?.bestScore ?? 0, this.score),
        };
        if (this.level.id >= this.progress.unlockedLevel && this.level.id < LEVELS.length) {
          this.progress.unlockedLevel = this.level.id + 1;
        }
        this.progress.totalScore = Object.values(this.progress.levels).reduce(
          (sum, l) => sum + l.bestScore,
          0,
        );
        saveProgress(this.progress);
      }

      reportGameScore(SLUG, Math.max(this.score, this.progress.totalScore), {
        level: this.level.id,
        stars,
      });
      this.showEndModal(true, stars);
    } else {
      crushAudio.playLose();
      this.setMascot('defeat', 'DEU RUIM NO CIPÓ...', 6);
      reportGameScore(SLUG, this.score, { level: this.level.id });
      this.showEndModal(false, 0);
    }
  }

  private finishVersusMatch(): void {
    if (this.ended) return;
    this.ended = true;
    this.busy = false;
    if (this.mode === 'versus-p2p') {
      this.room.send('versus-finish', { kind: 'versus-finish', finalScore: this.score });
    }
    const won = this.score >= this.rivalScore;
    if (won) {
      crushAudio.playWin();
      this.setMascot('victory', 'AMASSOU O RIVAL!!', 6);
    } else {
      crushAudio.playLose();
      this.setMascot('defeat', 'ESCORREGOU NA CASCA!', 6);
    }
    reportGameScore(SLUG, this.score, { mode: this.mode });
    this.showVersusModal(won);
  }

  private showEndModal(won: boolean, stars: number): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'mc-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'mc-modal';

    const hasNext = won && this.level.id < LEVELS.length;
    modal.innerHTML = `
      <h2>${won ? '🍌 FASE COMPLETA!' : '🐒 QUASE LÁ!'}</h2>
      <div style="color:#cbd5e1;font-size:14px;">${this.level.name}</div>
      ${
        won
          ? `<div class="mc-stars-row">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`
          : `<div class="mc-stars-row">💀🍌</div>`
      }
      <div style="font-size:20px;font-weight:900;color:#fef08a;">
        ${this.score.toLocaleString('pt-BR')} pontos
      </div>
      <div class="mc-modal-actions" id="mc-modal-btns"></div>
    `;

    const btns = modal.querySelector('#mc-modal-btns')!;

    if (this.mode === 'saga') {
      const mapBtn = document.createElement('button');
      mapBtn.className = 'mc-btn secondary';
      mapBtn.textContent = '🗺️ Mapa';
      mapBtn.onclick = () => {
        backdrop.remove();
        this.screen = 'map';
        this.renderView();
      };
      btns.appendChild(mapBtn);
    }

    const retryBtn = document.createElement('button');
    retryBtn.className = 'mc-btn secondary';
    retryBtn.textContent = '🔄 Repetir';
    retryBtn.onclick = () => {
      backdrop.remove();
      if (this.mode === 'coop-p2p' && this.room.localPlayer.isHost) {
        this.launchP2PCoop(this.level.id);
      } else {
        this.startModeOrLevel(this.level.id, 'saga');
      }
    };
    btns.appendChild(retryBtn);

    if (hasNext) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'mc-btn primary';
      nextBtn.textContent = '▶ Próxima!';
      nextBtn.onclick = () => {
        backdrop.remove();
        if (this.mode === 'coop-p2p' && this.room.localPlayer.isHost) {
          this.launchP2PCoop(this.level.id + 1);
        } else {
          this.startModeOrLevel(this.level.id + 1, 'saga');
        }
      };
      btns.appendChild(nextBtn);
    }

    backdrop.appendChild(modal);
    this.appEl.appendChild(backdrop);
  }

  private showVersusModal(won: boolean): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'mc-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'mc-modal';

    modal.innerHTML = `
      <h2>${won ? '🏆 VITÓRIA NO VERSUS!' : '🍌 DERROTA NO DUELO!'}</h2>
      <div style="margin:12px 0;font-size:16px;font-weight:800;color:#e2e8f0;">
        Você: <span style="color:#fde047">${this.score.toLocaleString('pt-BR')}</span> pts<br/>
        ${this.rivalName}: <span style="color:#fb7185">${this.rivalScore.toLocaleString('pt-BR')}</span> pts
      </div>
      <div class="mc-modal-actions" id="mc-v-btns"></div>
    `;

    const btns = modal.querySelector('#mc-v-btns')!;
    const homeBtn = document.createElement('button');
    homeBtn.className = 'mc-btn secondary';
    homeBtn.textContent = '🏠 Início';
    homeBtn.onclick = () => {
      backdrop.remove();
      this.screen = 'title';
      this.renderView();
    };
    btns.appendChild(homeBtn);

    const againBtn = document.createElement('button');
    againBtn.className = 'mc-btn versus';
    againBtn.textContent = '⚔️ Revanche!';
    againBtn.onclick = () => {
      backdrop.remove();
      if (this.mode === 'versus-p2p' && this.room.localPlayer.isHost) {
        this.launchP2PVersus();
      } else {
        this.startModeOrLevel(10, 'versus-solo');
      }
    };
    btns.appendChild(againBtn);

    backdrop.appendChild(modal);
    this.appEl.appendChild(backdrop);
  }

  private triggerHint(): void {
    if (this.screen !== 'playing' || this.busy || this.ended) return;
    const moves = findAllValidMoves(this.grid);
    if (moves.length > 0) {
      this.hintMove = moves[0];
      crushAudio.playClick();
    }
  }

  private spawnBurst(row: number, col: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.8 + Math.random() * 4.5;
      this.particles.push({
        x: col,
        y: row,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1.2,
        size: 3 + Math.random() * 5,
        color,
        alpha: 1,
        life: 0.4 + Math.random() * 0.25,
        maxLife: 0.65,
        gravity: 8,
        kind: i % 4 === 0 ? 'star' : 'juice',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
      });
    }
  }

  private spawnFloatingText(
    row: number,
    col: number,
    text: string,
    color: string,
    scale = 1,
  ): void {
    this.floatingTexts.push({
      x: col,
      y: row,
      vy: -1.6,
      text,
      color,
      scale,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  private waitAnim(ms: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (token === this.sessionToken) resolve();
        else resolve();
      }, ms);
    });
  }

  private waitFallAnim(token: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        if (token !== this.sessionToken) {
          resolve();
          return;
        }
        let maxRemaining = 0;
        for (const row of this.grid) {
          for (const cell of row) {
            if (cell.piece) {
              maxRemaining = Math.max(
                maxRemaining,
                Math.abs(cell.piece.yOffset),
                Math.abs(cell.piece.xOffset),
              );
            }
          }
        }
        if (maxRemaining < 0.03 || performance.now() - start > 550) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }

  private loop(ts: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (ts - (this.lastFrameTs || ts)) / 1000));
    this.lastFrameTs = ts;
    this.time += dt;

    if (this.screen === 'playing') {
      this.updateSimulation(dt);
      this.renderCanvases();
    }

    requestAnimationFrame((nextTs) => this.loop(nextTs));
  }

  private updateSimulation(dt: number): void {
    // Versus countdown & Solo Bot rival
    if (this.mode.startsWith('versus') && !this.ended) {
      this.versusTimeLeft -= dt;
      if (this.mode === 'versus-solo') {
        this.botTimer += dt;
        if (this.botTimer >= 2.2) {
          this.botTimer = 0;
          const burst = 180 + Math.floor(Math.random() * 480);
          this.rivalScore += burst;
          if (Math.random() < 0.24) {
            this.applyBananaPeelAttack(1, 'Chimp Bot', 'Combo Bot');
          }
        }
      }
      this.updateHudDom();
      if (this.versusTimeLeft <= 0) {
        this.versusTimeLeft = 0;
        this.finishVersusMatch();
      }
    }

    // Idle hint timer
    if (!this.busy && !this.ended) {
      this.idleTimer += dt;
      if (this.idleTimer >= 4.5 && !this.hintMove) {
        const moves = findAllValidMoves(this.grid);
        if (moves.length > 0) this.hintMove = moves[0];
      }
    }

    // Update piece animations (falling, swapping, squash & stretch, blinking)
    for (const row of this.grid) {
      for (const cell of row) {
        const p = cell.piece;
        if (!p) continue;

        // Smooth swap X
        if (Math.abs(p.xOffset) > 0.001) {
          p.xOffset *= Math.pow(0.0005, dt);
          if (Math.abs(p.xOffset) < 0.02) p.xOffset = 0;
        }

        // Gravity fall Y with landing squash & stretch!
        if (p.yOffset < -0.001) {
          const prev = p.yOffset;
          p.yOffset += dt * 14.5;
          if (p.yOffset >= 0 && prev < -0.15) {
            p.yOffset = 0;
            p.scaleX = 1.24;
            p.scaleY = 0.76;
          } else if (p.yOffset > 0) {
            p.yOffset = 0;
          }
        } else if (Math.abs(p.yOffset) > 0.001) {
          p.yOffset *= Math.pow(0.0005, dt);
          if (Math.abs(p.yOffset) < 0.02) p.yOffset = 0;
        }

        // Spring scale back to (1, 1)
        p.scaleX += (1 - p.scaleX) * Math.min(1, dt * 13);
        p.scaleY += (1 - p.scaleY) * Math.min(1, dt * 13);

        // Blinking eyes
        p.blinkTimer -= dt;
        if (p.blinkTimer <= 0) {
          if (p.blinking) {
            p.blinking = false;
            p.blinkTimer = 2 + Math.random() * 4.5;
          } else {
            p.blinking = true;
            p.blinkTimer = 0.13;
          }
        }
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
    }

    // Beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }

    // Floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    // Screen shake decay
    this.shakeMag *= Math.pow(0.001, dt);
    if (this.shakeMag < 0.2) this.shakeMag = 0;

    // Mascot update
    this.mascot.time = this.time;
    this.mascot.bounce = Math.max(0, this.mascot.bounce - dt * 3.5);
    this.mascot.blinkTimer -= dt;
    if (this.mascot.blinkTimer <= 0) {
      if (this.mascot.blinking) {
        this.mascot.blinking = false;
        this.mascot.blinkTimer = 2.2 + Math.random() * 3.5;
      } else {
        this.mascot.blinking = true;
        this.mascot.blinkTimer = 0.14;
      }
    }
    if (this.mascot.quoteTimer > 0) {
      this.mascot.quoteTimer -= dt;
      if (this.mascot.quoteTimer <= 0 && !this.ended) {
        this.mascot.mood = this.movesLeft <= 3 && !this.mode.startsWith('versus') ? 'panicked' : 'idle';
      }
    }
  }

  private renderCanvases(): void {
    if (this.boardCanvas) {
      const ctx = this.boardCanvas.getContext('2d');
      if (ctx) {
        const shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
        const shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
        drawBoard(ctx, this.boardCanvas.width, this.boardCanvas.height, {
          grid: this.grid,
          selected: this.selected,
          hintMove: this.hintMove,
          remoteCursor: this.remoteCursor,
          particles: this.particles,
          beams: this.beams,
          floatingTexts: this.floatingTexts,
          shakeX,
          shakeY,
          time: this.time,
        });
      }
    }

    if (this.mascotCanvas) {
      const mCtx = this.mascotCanvas.getContext('2d');
      if (mCtx) {
        drawMascot(mCtx, this.mascotCanvas.width, this.mascotCanvas.height, this.mascot);
      }
    }
  }
}

new BananaCrushGame();
