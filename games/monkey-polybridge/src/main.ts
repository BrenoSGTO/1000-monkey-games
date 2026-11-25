import { monkeyAudio, reportGameScore, type PlayerProfile } from '@monkey-slop/sdk';
import { GRID_SIZE, LEVELS, WORLD_H, WORLD_W } from './levels';
import { computeBeamCost, MATERIALS } from './materials';
import { BridgeNetClient } from './net';
import { BridgePhysicsWorld } from './physics';
import {
  computeViewport,
  renderBridgeWorld,
  screenToWorld,
  type BuildPreviewState,
  type ViewportTransform,
} from './renderer';
import type {
  BridgeBeam,
  BridgeNetMessage,
  BridgeNode,
  DuelPlayerStatus,
  MaterialId,
  MultiplayerMode,
  RemoteCursor,
  SerializedBeam,
  SerializedNode,
  ToolId,
} from './types';

interface BlueprintSnapshot {
  nodes: SerializedNode[];
  beams: SerializedBeam[];
}

interface EditAction {
  addedBeams: SerializedBeam[];
  addedNodes: SerializedNode[];
  removedBeams: SerializedBeam[];
  removedNodes: SerializedNode[];
}

interface SaveData {
  levelBestScores: Record<string, number>;
  completedLevels: number[];
  savedMonkeys: number;
  drownedMonkeys: number;
  blueprints: Record<string, BlueprintSnapshot>;
}

const SAVE_KEY = 'monkey-polybridge:save-v1';

const VICTORY_QUOTES = [
  'O CREA chorou no banho, mas a Kombi passou intacta!',
  'Engenharia raiz: se não caiu, tá dentro da norma!',
  'Os jacarés ficaram no jejum hoje!',
  'Cipó + bambu + fé primata = obra-prima!',
  'Albert Einstein era um macaco disfarçado, certeza!',
];

class PolyBridgeGame {
  private canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;

  // UI elements
  private stageLabelEl = document.getElementById('hud-stage-label')!;
  private budgetEl = document.getElementById('hud-budget')!;
  private budgetPillEl = document.getElementById('hud-budget-pill')!;
  private stressEl = document.getElementById('hud-stress')!;
  private stressPillEl = document.getElementById('hud-stress-pill')!;
  private savedEl = document.getElementById('hud-saved')!;
  private drownedEl = document.getElementById('hud-drowned')!;
  private scoreEl = document.getElementById('hud-score')!;
  private hintEl = document.getElementById('hud-hint')!;

  private btnPrevStage = document.getElementById('btn-prev-stage') as HTMLButtonElement;
  private btnNextStage = document.getElementById('btn-next-stage') as HTMLButtonElement;
  private btnModeCoop = document.getElementById('btn-mode-coop') as HTMLButtonElement;
  private btnModeVersus = document.getElementById('btn-mode-versus') as HTMLButtonElement;
  private btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  private btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
  private btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  private btnMirror = document.getElementById('btn-mirror') as HTMLButtonElement;
  private btnAutoTri = document.getElementById('btn-autotri') as HTMLButtonElement;
  private btnHintGhost = document.getElementById('btn-hint-ghost') as HTMLButtonElement;
  private btnGrid = document.getElementById('btn-grid') as HTMLButtonElement;
  private btnSlowmo = document.getElementById('btn-slowmo') as HTMLButtonElement;
  private btnSim = document.getElementById('btn-sim') as HTMLButtonElement;
  private matButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-btn'));
  private reactButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.react-btn'));

  private duelPanel = document.getElementById('duel-panel')!;
  private duelListEl = document.getElementById('duel-list')!;
  private btnStopSpy = document.getElementById('btn-stop-spy') as HTMLButtonElement;

  private welcomeCard = document.getElementById('welcome-card')!;
  private victoryCard = document.getElementById('victory-card')!;
  private failCard = document.getElementById('fail-card')!;
  private vicStarsEl = document.getElementById('vic-stars')!;
  private vicQuoteEl = document.getElementById('vic-quote')!;
  private vicSavedBudgetEl = document.getElementById('vic-saved-budget')!;
  private vicMaxStressEl = document.getElementById('vic-max-stress')!;
  private vicPointsEl = document.getElementById('vic-points')!;
  private failTitleEl = document.getElementById('fail-title')!;
  private failDescEl = document.getElementById('fail-desc')!;

  // State
  private levelIndex = 0;
  private mode: 'build' | 'sim' = 'build';
  private gameMode: MultiplayerMode = 'coop';
  private showGrid = true;
  private showHint = false;
  private autoTri = false;
  private slowMo = false;
  private autoSlowMoTimer = 0;
  private clearConfirmUntil = 0;
  private tool: ToolId = 'road';

  private blueprintNodes = new Map<string, BridgeNode>();
  private blueprintBeams: BridgeBeam[] = [];
  private undoStack: EditAction[] = [];
  private redoStack: EditAction[] = [];
  private remoteNodeAliases = new Map<string, string>();
  private savedBlueprints = new Map<string, BlueprintSnapshot>();

  private savedMonkeys = 0;
  private drownedMonkeys = 0;
  private levelBestScores = new Map<number, number>();
  private completedLevels = new Set<number>();

  // Duel Mode state
  private duelStatuses = new Map<string, DuelPlayerStatus>();
  private spectatingPeerId: string | null = null;
  private ownBackupBeforeSpy: BlueprintSnapshot | null = null;
  private myDuelState: DuelPlayerStatus['state'] = 'building';
  private myDuelStressPct = 0;

  // Input state
  private viewport: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  private hoverWorld: { x: number; y: number } | null = null;
  private snapPoint: { x: number; y: number; nodeId: string | null } | null = null;
  private dragStart: { x: number; y: number; nodeId: string | null } | null = null;
  private pointerDownPos: { x: number; y: number } | null = null;
  private clickAnchorMode = false;
  private hoverBeamId: string | null = null;
  private isErasingDrag = false;

  // Juice & Timing
  private world!: BridgePhysicsWorld;
  private net!: BridgeNetClient;
  private remoteCursors = new Map<string, RemoteCursor>();
  private shakeAmount = 0;
  private simAccumulator = 0;
  private lastFrameTime = performance.now();
  private totalElapsed = 0;
  private idCounter = 1;
  private lastReactionAt = 0;
  private pausedByGuide = false;

  constructor() {
    this.loadSaveData();

    this.net = new BridgeNetClient({
      onRemoteCursor: (cursor) => {
        this.remoteCursors.set(cursor.peerId, cursor);
      },
      onRemoteMessage: (msg, senderId, senderName) => {
        this.handleRemoteMessage(msg, senderId, senderName);
      },
      onPlayerJoinedAsHost: () => {
        this.broadcastFullSync();
      },
      onPlayersUpdated: (players) => {
        this.syncDuelRosterFromPlayers(players);
      },
      onControlsOpenChange: (open) => {
        this.pausedByGuide = open;
      },
    });

    this.bindUI();
    this.loadLevel(0, false);
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    requestAnimationFrame((t) => this.loop(t));
  }

  private loadSaveData(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.levelBestScores) {
        for (const [k, v] of Object.entries(parsed.levelBestScores)) {
          const idx = Number(k);
          if (Number.isFinite(idx) && typeof v === 'number') {
            this.levelBestScores.set(idx, v);
          }
        }
      }
      if (Array.isArray(parsed.completedLevels)) {
        for (const lvl of parsed.completedLevels) {
          if (Number.isFinite(lvl)) this.completedLevels.add(lvl);
        }
      }
      if (typeof parsed.savedMonkeys === 'number') this.savedMonkeys = parsed.savedMonkeys;
      if (typeof parsed.drownedMonkeys === 'number') this.drownedMonkeys = parsed.drownedMonkeys;
      if (parsed.blueprints) {
        for (const [id, snap] of Object.entries(parsed.blueprints)) {
          if (snap && Array.isArray(snap.nodes) && Array.isArray(snap.beams)) {
            this.savedBlueprints.set(id, snap);
          }
        }
      }
    } catch {
      // ignore corrupted storage
    }
  }

  private persistSaveData(): void {
    if (this.spectatingPeerId) return;
    try {
      const level = LEVELS[this.levelIndex];
      this.savedBlueprints.set(level.id, this.serializeBlueprint());
      const scoresObj: Record<string, number> = {};
      for (const [k, v] of this.levelBestScores) {
        scoresObj[String(k)] = v;
      }
      const blueprintsObj: Record<string, BlueprintSnapshot> = {};
      for (const [k, v] of this.savedBlueprints) {
        blueprintsObj[k] = v;
      }
      const payload: SaveData = {
        levelBestScores: scoresObj,
        completedLevels: Array.from(this.completedLevels),
        savedMonkeys: this.savedMonkeys,
        drownedMonkeys: this.drownedMonkeys,
        blueprints: blueprintsObj,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  }

  private getTotalScore(): number {
    let sum = 0;
    for (const s of this.levelBestScores.values()) sum += s;
    return sum;
  }

  private getSpentBudget(): number {
    let sum = 0;
    for (const b of this.blueprintBeams) sum += b.cost;
    return sum;
  }

  private makeId(prefix: string): string {
    const tag = this.net.room.localPlayer.id.slice(-4);
    return `${prefix}-${tag}-${this.idCounter++}-${Math.random().toString(36).slice(2, 5)}`;
  }

  private isCoopSynced(): boolean {
    return this.gameMode === 'coop' && this.net.isConnected();
  }

  private loadLevel(idx: number, broadcast = true): void {
    this.stopSpectating(false);
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, idx));
    const level = LEVELS[this.levelIndex];

    this.mode = 'build';
    this.dragStart = null;
    this.clickAnchorMode = false;
    this.autoSlowMoTimer = 0;
    this.clearConfirmUntil = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.remoteNodeAliases.clear();
    this.blueprintNodes.clear();
    this.blueprintBeams = [];
    this.myDuelState = 'building';
    this.myDuelStressPct = 0;
    this.duelStatuses.clear();

    for (const a of level.anchors) {
      this.blueprintNodes.set(a.id, {
        id: a.id,
        x: a.x,
        y: a.y,
        oldX: a.x,
        oldY: a.y,
        homeX: a.x,
        homeY: a.y,
        fixed: true,
        mass: 1,
      });
    }

    // Restore saved local blueprint when offline or initializing solo
    const saved = this.savedBlueprints.get(level.id);
    if (saved && !this.net.isConnected()) {
      this.applySerializedBlueprint(saved, false);
    }

    this.world = new BridgePhysicsWorld(level, {
      onShake: (amt) => {
        this.shakeAmount = Math.max(this.shakeAmount, amt);
      },
      onMonkeySaved: (count) => {
        this.savedMonkeys += count;
        this.updateHud();
      },
      onMonkeyDrowned: (count) => {
        this.drownedMonkeys += count;
        this.updateHud();
      },
      onFirstBeamBreak: () => {
        if (this.autoSlowMoTimer <= 0) {
          this.autoSlowMoTimer = 1.45;
        }
      },
      onVictory: () => this.handleVictory(),
      onFail: (reason) => this.handleFail(reason),
    });

    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.hideResultCards();
    this.updateHud();
    this.broadcastMyDuelStatus();

    if (broadcast) {
      this.net.send({ kind: 'set_level', levelIndex: this.levelIndex });
    }
  }

  private handleVictory(fromRemoteAuthoritative = false): void {
    if (this.spectatingPeerId) return;

    // If connected in Co-op as Guest, wait for or align with Host's authoritative result if needed,
    // while still celebrating locally!
    monkeyAudio.play('fanfare', 0.32);
    const level = LEVELS[this.levelIndex];
    const spent = this.getSpentBudget();
    const saved = Math.max(0, level.budget - spent);
    const ratio = saved / Math.max(1, level.budget);
    const stars = ratio >= 0.3 ? '⭐⭐⭐' : ratio >= 0.12 ? '⭐⭐' : '⭐';
    const maxStressPct = Math.min(100, Math.round(this.world.peakStressEver * 100));

    const points = 500 + this.levelIndex * 250 + saved * 3;
    const prevBest = this.levelBestScores.get(this.levelIndex) ?? 0;
    if (points > prevBest) {
      this.levelBestScores.set(this.levelIndex, points);
    }
    this.completedLevels.add(this.levelIndex);
    this.persistSaveData();

    const total = this.getTotalScore();
    reportGameScore('monkey-polybridge', total, {
      completedLevels: this.completedLevels.size,
      savedMonkeys: this.savedMonkeys,
      drownedMonkeys: this.drownedMonkeys,
    });

    this.vicStarsEl.textContent = stars;
    this.vicQuoteEl.textContent =
      VICTORY_QUOTES[Math.floor(Math.random() * VICTORY_QUOTES.length)];
    this.vicSavedBudgetEl.textContent = `${saved} 🍌`;
    this.vicMaxStressEl.textContent = `${maxStressPct}%`;
    this.vicPointsEl.textContent = `${points} pts`;

    const nextBtn = document.getElementById('btn-vic-next') as HTMLButtonElement;
    nextBtn.textContent =
      this.levelIndex < LEVELS.length - 1 ? '➡️ PRÓXIMA FASE' : '🏆 RECOMEÇAR TOUR';

    this.victoryCard.classList.add('open');
    this.failCard.classList.remove('open');

    if (this.gameMode === 'versus') {
      this.myDuelState = 'passed';
      this.myDuelStressPct = maxStressPct;
      this.broadcastMyDuelStatus(true);
    } else if (!fromRemoteAuthoritative && this.net.isConnected() && this.net.room.localPlayer.isHost) {
      this.net.send({
        kind: 'sim_result',
        levelIndex: this.levelIndex,
        outcome: 'won',
        reason: '',
        maxStressPct,
        totalScore: total,
        savedMonkeys: this.savedMonkeys,
        drownedMonkeys: this.drownedMonkeys,
      });
    }

    this.updateHud();
  }

  private handleFail(reason: string, fromRemoteAuthoritative = false): void {
    if (this.spectatingPeerId) return;

    monkeyAudio.play('rage', 0.28);
    this.failTitleEl.textContent = '💥 A PONTE FOI DE BASE!';
    this.failDescEl.textContent = reason;
    this.failCard.classList.add('open');
    this.victoryCard.classList.remove('open');
    this.persistSaveData();

    const maxStressPct = Math.min(100, Math.round(this.world.peakStressEver * 100));
    if (this.gameMode === 'versus') {
      this.myDuelState = 'failed';
      this.myDuelStressPct = maxStressPct;
      this.broadcastMyDuelStatus(true);
    } else if (!fromRemoteAuthoritative && this.net.isConnected() && this.net.room.localPlayer.isHost) {
      this.net.send({
        kind: 'sim_result',
        levelIndex: this.levelIndex,
        outcome: 'failed',
        reason,
        maxStressPct,
        totalScore: this.getTotalScore(),
        savedMonkeys: this.savedMonkeys,
        drownedMonkeys: this.drownedMonkeys,
      });
    }
  }

  private hideResultCards(): void {
    this.victoryCard.classList.remove('open');
    this.failCard.classList.remove('open');
  }

  private enterBuildMode(broadcast = true): void {
    this.mode = 'build';
    this.simAccumulator = 0;
    this.autoSlowMoTimer = 0;
    this.hideResultCards();
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);

    if (this.gameMode === 'versus' && !this.spectatingPeerId) {
      this.myDuelState = 'building';
      this.broadcastMyDuelStatus();
    }

    this.updateHud();
    if (broadcast && this.isCoopSynced()) {
      this.net.send({ kind: 'stop_sim' });
    }
  }

  private enterSimMode(broadcast = true): void {
    if (this.blueprintBeams.length === 0) {
      this.net.hud.toast('Construa pelo menos uma viga antes de soltar os macacos!', 'chaos');
      monkeyAudio.play('rage', 0.18);
      return;
    }
    const spent = this.getSpentBudget();
    if (spent > LEVELS[this.levelIndex].budget) {
      this.net.hud.toast('Orçamento estourado! Apague algumas vigas antes de testar!', 'chaos');
      monkeyAudio.play('rage', 0.2);
      return;
    }

    this.mode = 'sim';
    this.dragStart = null;
    this.clickAnchorMode = false;
    this.simAccumulator = 0;
    this.autoSlowMoTimer = 0;
    this.clearConfirmUntil = 0;
    this.hideResultCards();
    this.welcomeCard.classList.remove('open');
    this.world.startSimulation(this.blueprintNodes, this.blueprintBeams);

    if (this.gameMode === 'versus' && !this.spectatingPeerId) {
      this.myDuelState = 'testing';
      this.myDuelStressPct = 0;
      this.broadcastMyDuelStatus();
    }

    this.updateHud();
    monkeyAudio.play('click', 0.22);

    if (broadcast && this.isCoopSynced()) {
      this.net.send({ kind: 'start_sim' });
    }
  }

  private toggleSim(): void {
    if (this.mode === 'build') this.enterSimMode(true);
    else this.enterBuildMode(true);
  }

  private serializeNode(n: BridgeNode): SerializedNode {
    return {
      id: n.id,
      x: n.homeX,
      y: n.homeY,
      fixed: n.fixed,
      authorId: n.authorId,
      authorName: n.authorName,
      authorColor: n.authorColor,
    };
  }

  private serializeBeam(b: BridgeBeam): SerializedBeam {
    return {
      id: b.id,
      nodeAId: b.nodeAId,
      nodeBId: b.nodeBId,
      material: b.material,
      cost: b.cost,
      authorId: b.authorId,
      authorName: b.authorName,
      authorColor: b.authorColor,
    };
  }

  private serializeBlueprint(): BlueprintSnapshot {
    const nodes: SerializedNode[] = [];
    for (const n of this.blueprintNodes.values()) {
      nodes.push(this.serializeNode(n));
    }
    const beams: SerializedBeam[] = this.blueprintBeams.map((b) => this.serializeBeam(b));
    return { nodes, beams };
  }

  private applySerializedBlueprint(snap: BlueprintSnapshot, keepAnchors = true): void {
    const level = LEVELS[this.levelIndex];
    this.blueprintNodes.clear();
    if (keepAnchors) {
      for (const a of level.anchors) {
        this.blueprintNodes.set(a.id, {
          id: a.id,
          x: a.x,
          y: a.y,
          oldX: a.x,
          oldY: a.y,
          homeX: a.x,
          homeY: a.y,
          fixed: true,
          mass: 1,
        });
      }
    }

    for (const sn of snap.nodes) {
      if (this.blueprintNodes.has(sn.id)) continue;
      this.blueprintNodes.set(sn.id, {
        id: sn.id,
        x: sn.x,
        y: sn.y,
        oldX: sn.x,
        oldY: sn.y,
        homeX: sn.x,
        homeY: sn.y,
        fixed: sn.fixed,
        mass: 1,
        authorId: sn.authorId,
        authorName: sn.authorName,
        authorColor: sn.authorColor,
      });
    }
    this.blueprintBeams = snap.beams
      .filter((sb) => this.blueprintNodes.has(sb.nodeAId) && this.blueprintNodes.has(sb.nodeBId))
      .map((sb) => {
        const nA = this.blueprintNodes.get(sb.nodeAId)!;
        const nB = this.blueprintNodes.get(sb.nodeBId)!;
        return {
          id: sb.id,
          nodeAId: sb.nodeAId,
          nodeBId: sb.nodeBId,
          material: sb.material,
          restLength: Math.hypot(nB.homeX - nA.homeX, nB.homeY - nA.homeY),
          cost: sb.cost,
          stress: 0,
          signedStress: 0,
          broken: false,
          springSquish: 0,
          authorId: sb.authorId,
          authorName: sb.authorName,
          authorColor: sb.authorColor,
        };
      });
    this.world?.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
  }

  private pushAction(action: EditAction): void {
    if (action.addedBeams.length === 0 && action.removedBeams.length === 0) return;
    this.undoStack.push(action);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  private applyEditDelta(
    toRemoveBeams: SerializedBeam[],
    toAddBeams: SerializedBeam[],
    toAddNodes: SerializedNode[],
  ): void {
    // 1. Ensure nodes for beams to add
    for (const sn of toAddNodes) {
      if (!this.blueprintNodes.has(sn.id)) {
        const nearbyId = this.findNearbyNodeId(sn.x, sn.y, 8);
        if (!nearbyId) {
          this.blueprintNodes.set(sn.id, {
            id: sn.id,
            x: sn.x,
            y: sn.y,
            oldX: sn.x,
            oldY: sn.y,
            homeX: sn.x,
            homeY: sn.y,
            fixed: sn.fixed,
            mass: 1,
            authorId: sn.authorId,
            authorName: sn.authorName,
            authorColor: sn.authorColor,
          });
        }
      }
    }

    // 2. Remove beams & broadcast deltas
    for (const rb of toRemoveBeams) {
      const idx = this.blueprintBeams.findIndex((b) => b.id === rb.id);
      if (idx !== -1) {
        this.blueprintBeams.splice(idx, 1);
        if (this.isCoopSynced()) {
          this.net.send({ kind: 'remove_beam', beamId: rb.id });
        }
      }
    }

    // 3. Add beams & broadcast deltas
    for (const ab of toAddBeams) {
      if (this.blueprintBeams.some((b) => b.id === ab.id)) continue;
      let nA = this.blueprintNodes.get(ab.nodeAId);
      let nB = this.blueprintNodes.get(ab.nodeBId);
      if (!nA) {
        const orig = toAddNodes.find((n) => n.id === ab.nodeAId);
        if (orig) nA = this.findOrCreateNode(orig.x, orig.y, null, orig.authorColor);
      }
      if (!nB) {
        const orig = toAddNodes.find((n) => n.id === ab.nodeBId);
        if (orig) nB = this.findOrCreateNode(orig.x, orig.y, null, orig.authorColor);
      }
      if (!nA || !nB) continue;

      const beam: BridgeBeam = {
        id: ab.id,
        nodeAId: nA.id,
        nodeBId: nB.id,
        material: ab.material,
        restLength: Math.hypot(nB.homeX - nA.homeX, nB.homeY - nA.homeY),
        cost: ab.cost,
        stress: 0,
        signedStress: 0,
        broken: false,
        springSquish: 0,
        authorId: ab.authorId,
        authorName: ab.authorName,
        authorColor: ab.authorColor,
      };
      this.blueprintBeams.push(beam);

      if (this.isCoopSynced()) {
        this.net.send({
          kind: 'add_beam',
          beam: this.serializeBeam(beam),
          nodeA: this.serializeNode(nA),
          nodeB: this.serializeNode(nB),
        });
      }
    }

    this.pruneOrphanNodes();
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.persistSaveData();
    this.broadcastMyDuelStatus();
    this.updateHud();
  }

  private undo(): void {
    if (this.mode !== 'build' || this.spectatingPeerId || this.undoStack.length === 0) return;
    const action = this.undoStack.pop()!;
    this.redoStack.push(action);
    this.applyEditDelta(action.addedBeams, action.removedBeams, action.removedNodes);
    monkeyAudio.play('click', 0.16);
  }

  private redo(): void {
    if (this.mode !== 'build' || this.spectatingPeerId || this.redoStack.length === 0) return;
    const action = this.redoStack.pop()!;
    this.undoStack.push(action);
    this.applyEditDelta(action.removedBeams, action.addedBeams, action.addedNodes);
    monkeyAudio.play('click', 0.18);
  }

  private requestClearBridge(): void {
    if (this.spectatingPeerId) return;
    if (this.mode !== 'build') {
      this.enterBuildMode(true);
    }
    if (this.blueprintBeams.length === 0) return;

    const now = performance.now();
    if (now > this.clearConfirmUntil) {
      this.clearConfirmUntil = now + 2600;
      this.updateHud();
      window.setTimeout(() => {
        if (performance.now() >= this.clearConfirmUntil) {
          this.clearConfirmUntil = 0;
          this.updateHud();
        }
      }, 2650);
      return;
    }

    this.clearConfirmUntil = 0;
    this.clearBridge(true);
  }

  private clearBridge(broadcast = true): void {
    if (this.mode !== 'build') {
      this.enterBuildMode(false);
    }
    if (this.blueprintBeams.length === 0) return;

    const removedBeams = this.blueprintBeams.map((b) => this.serializeBeam(b));
    const removedNodes: SerializedNode[] = [];
    for (const n of this.blueprintNodes.values()) {
      if (!n.fixed) removedNodes.push(this.serializeNode(n));
    }

    if (broadcast) {
      this.pushAction({
        addedBeams: [],
        addedNodes: [],
        removedBeams,
        removedNodes,
      });
    }

    this.blueprintBeams = [];
    this.pruneOrphanNodes();
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.persistSaveData();
    this.broadcastMyDuelStatus();
    this.updateHud();
    monkeyAudio.play('slap', 0.18);

    if (broadcast && this.isCoopSynced()) {
      this.net.send({ kind: 'clear_bridge' });
    }
  }

  private pruneOrphanNodes(): void {
    const used = new Set<string>();
    for (const b of this.blueprintBeams) {
      used.add(b.nodeAId);
      used.add(b.nodeBId);
    }
    for (const [id, n] of this.blueprintNodes) {
      if (!n.fixed && !used.has(id)) {
        this.blueprintNodes.delete(id);
      }
    }
  }

  private getLocalAuthorMeta(): { id?: string; name?: string; color?: string } {
    if (!this.net.isConnected()) return {};
    return {
      id: this.net.room.localPlayer.id,
      name: this.net.room.localPlayer.name,
      color: this.net.room.localPlayer.color,
    };
  }

  private findOrCreateNode(
    x: number,
    y: number,
    existingNodeId: string | null,
    authorColor?: string,
  ): BridgeNode {
    if (existingNodeId && this.blueprintNodes.has(existingNodeId)) {
      return this.blueprintNodes.get(existingNodeId)!;
    }
    for (const n of this.blueprintNodes.values()) {
      if (Math.hypot(n.homeX - x, n.homeY - y) < 8) return n;
    }
    const author = this.getLocalAuthorMeta();
    const id = this.makeId('n');
    const node: BridgeNode = {
      id,
      x,
      y,
      oldX: x,
      oldY: y,
      homeX: x,
      homeY: y,
      fixed: false,
      mass: 1,
      authorId: author.id,
      authorName: author.name,
      authorColor: authorColor ?? author.color,
    };
    this.blueprintNodes.set(id, node);
    return node;
  }

  private computeAutoTriSegments(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): {
    apex: { x: number; y: number; nodeId: string | null };
    segs: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    totalBambooCost: number;
  } | null {
    if (!this.autoTri || (this.tool !== 'road' && this.tool !== 'spring')) return null;
    const len = Math.hypot(end.x - start.x, end.y - start.y);
    if (len < 36 || len > MATERIALS[this.tool].maxLength) return null;

    const mx = (start.x + end.x) * 0.5;
    const my = (start.y + end.y) * 0.5;
    const bambooMax = MATERIALS.bamboo.maxLength;

    // 1. Check if a suitable non-collinear existing node sits above or below midpoint
    let bestExisting: BridgeNode | null = null;
    let bestScore = Infinity;
    for (const n of this.blueprintNodes.values()) {
      const dA = Math.hypot(n.homeX - start.x, n.homeY - start.y);
      const dB = Math.hypot(n.homeX - end.x, n.homeY - end.y);
      if (dA < 22 || dB < 22 || dA > bambooMax || dB > bambooMax) continue;
      // Check triangle height (cross product / base)
      const area2 = Math.abs(
        (end.x - start.x) * (n.homeY - start.y) - (end.y - start.y) * (n.homeX - start.x),
      );
      const height = area2 / len;
      if (height < 28) continue;
      const distMid = Math.hypot(n.homeX - mx, n.homeY - (my - 60));
      if (distMid < 75 && distMid < bestScore) {
        bestScore = distMid;
        bestExisting = n;
      }
    }

    let apexX: number;
    let apexY: number;
    let apexNodeId: string | null = null;

    if (bestExisting) {
      apexX = bestExisting.homeX;
      apexY = bestExisting.homeY;
      apexNodeId = bestExisting.id;
    } else {
      const step = this.showGrid ? GRID_SIZE : 20;
      apexX = Math.max(GRID_SIZE, Math.min(WORLD_W - GRID_SIZE, Math.round(mx / 20) * 20));
      apexY = Math.max(60, Math.round((my - 60) / step) * step);
      const nearby = this.findNearbyNodeId(apexX, apexY, 12);
      if (nearby) {
        const n = this.blueprintNodes.get(nearby)!;
        apexX = n.homeX;
        apexY = n.homeY;
        apexNodeId = n.id;
      }
    }

    const d1 = Math.hypot(apexX - start.x, apexY - start.y);
    const d2 = Math.hypot(apexX - end.x, apexY - end.y);
    if (d1 < 18 || d2 < 18 || d1 > bambooMax || d2 > bambooMax) return null;

    const c1 = computeBeamCost('bamboo', d1);
    const c2 = computeBeamCost('bamboo', d2);
    return {
      apex: { x: apexX, y: apexY, nodeId: apexNodeId },
      segs: [
        { x1: start.x, y1: start.y, x2: apexX, y2: apexY },
        { x1: end.x, y1: end.y, x2: apexX, y2: apexY },
      ],
      totalBambooCost: c1 + c2,
    };
  }

  private hasBeamBetween(nodeAId: string, nodeBId: string): boolean {
    return this.blueprintBeams.some(
      (b) =>
        (b.nodeAId === nodeAId && b.nodeBId === nodeBId) ||
        (b.nodeAId === nodeBId && b.nodeBId === nodeAId),
    );
  }

  private tryBuildBeam(
    start: { x: number; y: number; nodeId: string | null },
    end: { x: number; y: number; nodeId: string | null },
    material: MaterialId,
  ): void {
    if (this.spectatingPeerId) return;

    const len = Math.hypot(end.x - start.x, end.y - start.y);
    const mat = MATERIALS[material];
    if (len < 14) return;
    if (len > mat.maxLength) {
      this.net.hud.toast(`Viga longa demais! Máximo de ${mat.shortName}: ${mat.maxLength}px`, 'chaos');
      monkeyAudio.play('rage', 0.15);
      return;
    }

    const cost = computeBeamCost(material, len);
    const budgetLeft = LEVELS[this.levelIndex].budget - this.getSpentBudget();
    if (cost > budgetLeft) {
      this.net.hud.toast('Acabaram as bananas! Apague algo ou use Bambu/Cipó!', 'chaos');
      monkeyAudio.play('rage', 0.18);
      return;
    }

    const nAPreviewId = start.nodeId ?? this.findNearbyNodeId(start.x, start.y);
    const nBPreviewId = end.nodeId ?? this.findNearbyNodeId(end.x, end.y);
    if (nAPreviewId && nBPreviewId) {
      if (nAPreviewId === nBPreviewId) return;
      if (this.hasBeamBetween(nAPreviewId, nBPreviewId)) return;
    }

    const triPlan = this.computeAutoTriSegments(start, end);
    const author = this.getLocalAuthorMeta();

    const existedBefore = new Set(this.blueprintNodes.keys());
    const nodeA = this.findOrCreateNode(start.x, start.y, start.nodeId, author.color);
    const nodeB = this.findOrCreateNode(end.x, end.y, end.nodeId, author.color);

    const addedBeams: BridgeBeam[] = [];
    const mainBeam: BridgeBeam = {
      id: this.makeId('b'),
      nodeAId: nodeA.id,
      nodeBId: nodeB.id,
      material,
      restLength: Math.hypot(nodeB.homeX - nodeA.homeX, nodeB.homeY - nodeA.homeY),
      cost,
      stress: 0,
      signedStress: 0,
      broken: false,
      springSquish: 0,
      authorId: author.id,
      authorName: author.name,
      authorColor: author.color,
    };
    this.blueprintBeams.push(mainBeam);
    addedBeams.push(mainBeam);

    // Optional auto-triangulation bamboo braces if budget allows
    if (triPlan && cost + triPlan.totalBambooCost <= budgetLeft) {
      const apexNode = this.findOrCreateNode(
        triPlan.apex.x,
        triPlan.apex.y,
        triPlan.apex.nodeId,
        author.color,
      );
      for (const endpoint of [nodeA, nodeB]) {
        if (endpoint.id !== apexNode.id && !this.hasBeamBetween(endpoint.id, apexNode.id)) {
          const legLen = Math.hypot(
            apexNode.homeX - endpoint.homeX,
            apexNode.homeY - endpoint.homeY,
          );
          const legCost = computeBeamCost('bamboo', legLen);
          const leg: BridgeBeam = {
            id: this.makeId('b'),
            nodeAId: endpoint.id,
            nodeBId: apexNode.id,
            material: 'bamboo',
            restLength: legLen,
            cost: legCost,
            stress: 0,
            signedStress: 0,
            broken: false,
            springSquish: 0,
            authorId: author.id,
            authorName: author.name,
            authorColor: author.color,
          };
          this.blueprintBeams.push(leg);
          addedBeams.push(leg);
        }
      }
    }

    const addedNodes: SerializedNode[] = [];
    for (const [id, n] of this.blueprintNodes) {
      if (!existedBefore.has(id)) addedNodes.push(this.serializeNode(n));
    }

    this.pushAction({
      addedBeams: addedBeams.map((b) => this.serializeBeam(b)),
      addedNodes,
      removedBeams: [],
      removedNodes: [],
    });

    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.persistSaveData();
    this.broadcastMyDuelStatus();
    this.updateHud();
    monkeyAudio.play('click', 0.2);

    if (this.isCoopSynced()) {
      for (const beam of addedBeams) {
        const nA = this.blueprintNodes.get(beam.nodeAId)!;
        const nB = this.blueprintNodes.get(beam.nodeBId)!;
        this.net.send({
          kind: 'add_beam',
          beam: this.serializeBeam(beam),
          nodeA: this.serializeNode(nA),
          nodeB: this.serializeNode(nB),
        });
      }
    }
  }

  private mirrorBridge(): void {
    if (this.mode !== 'build' || this.spectatingPeerId) return;
    if (this.blueprintBeams.length === 0) {
      this.net.hud.toast('Construa metade da ponte primeiro para espelhar!', 'info');
      return;
    }

    const level = LEVELS[this.levelIndex];
    const axisX = level.mirrorAxisX ?? 600;

    // Pick whichever side has more beams (default left -> right)
    let leftCount = 0;
    let rightCount = 0;
    for (const b of this.blueprintBeams) {
      const nA = this.blueprintNodes.get(b.nodeAId);
      const nB = this.blueprintNodes.get(b.nodeBId);
      if (!nA || !nB) continue;
      const mx = (nA.homeX + nB.homeX) * 0.5;
      if (mx <= axisX) leftCount++;
      else rightCount++;
    }
    const mirrorLeftToRight = leftCount >= rightCount;

    const existedBefore = new Set(this.blueprintNodes.keys());
    const author = this.getLocalAuthorMeta();
    const addedBeams: BridgeBeam[] = [];
    let budgetLeft = level.budget - this.getSpentBudget();

    const sourceBeams = [...this.blueprintBeams];
    for (const b of sourceBeams) {
      const nA = this.blueprintNodes.get(b.nodeAId);
      const nB = this.blueprintNodes.get(b.nodeBId);
      if (!nA || !nB) continue;
      const mx = (nA.homeX + nB.homeX) * 0.5;
      if (mirrorLeftToRight && mx > axisX + 2) continue;
      if (!mirrorLeftToRight && mx < axisX - 2) continue;

      const rxA = Math.round((2 * axisX - nA.homeX) * 10) / 10;
      const ryA = nA.homeY;
      const rxB = Math.round((2 * axisX - nB.homeX) * 10) / 10;
      const ryB = nB.homeY;
      if (rxA < 20 || rxA > WORLD_W - 20 || rxB < 20 || rxB > WORLD_W - 20) continue;

      const mNodeAId = this.findNearbyNodeId(rxA, ryA, 12);
      const mNodeBId = this.findNearbyNodeId(rxB, ryB, 12);
      if (mNodeAId && mNodeBId) {
        if (mNodeAId === mNodeBId || this.hasBeamBetween(mNodeAId, mNodeBId)) continue;
      }

      const len = Math.hypot(rxB - rxA, ryB - ryA);
      if (len < 14 || len > MATERIALS[b.material].maxLength) continue;
      const cost = computeBeamCost(b.material, len);
      if (cost > budgetLeft) continue;

      const mA = this.findOrCreateNode(rxA, ryA, mNodeAId, author.color);
      const mB = this.findOrCreateNode(rxB, ryB, mNodeBId, author.color);
      if (mA.id === mB.id || this.hasBeamBetween(mA.id, mB.id)) continue;

      const newBeam: BridgeBeam = {
        id: this.makeId('b'),
        nodeAId: mA.id,
        nodeBId: mB.id,
        material: b.material,
        restLength: Math.hypot(mB.homeX - mA.homeX, mB.homeY - mA.homeY),
        cost,
        stress: 0,
        signedStress: 0,
        broken: false,
        springSquish: 0,
        authorId: author.id,
        authorName: author.name,
        authorColor: author.color,
      };
      this.blueprintBeams.push(newBeam);
      addedBeams.push(newBeam);
      budgetLeft -= cost;
    }

    if (addedBeams.length === 0) {
      this.pruneOrphanNodes();
      this.net.hud.toast('Nada novo para espelhar (ou orçamento insuficiente)!', 'info');
      return;
    }

    const addedNodes: SerializedNode[] = [];
    for (const [id, n] of this.blueprintNodes) {
      if (!existedBefore.has(id)) addedNodes.push(this.serializeNode(n));
    }

    this.pushAction({
      addedBeams: addedBeams.map((b) => this.serializeBeam(b)),
      addedNodes,
      removedBeams: [],
      removedNodes: [],
    });

    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.persistSaveData();
    this.broadcastMyDuelStatus();
    this.updateHud();
    monkeyAudio.play('banana', 0.22);
    this.net.hud.toast(`🪞 ${addedBeams.length} vigas espelhadas!`, 'banana');

    if (this.isCoopSynced()) {
      for (const beam of addedBeams) {
        const nA = this.blueprintNodes.get(beam.nodeAId)!;
        const nB = this.blueprintNodes.get(beam.nodeBId)!;
        this.net.send({
          kind: 'add_beam',
          beam: this.serializeBeam(beam),
          nodeA: this.serializeNode(nA),
          nodeB: this.serializeNode(nB),
        });
      }
    }
  }

  private removeBeamById(beamId: string, broadcast = true): void {
    if (this.spectatingPeerId && broadcast) return;
    const idx = this.blueprintBeams.findIndex((b) => b.id === beamId);
    if (idx === -1) return;

    const target = this.blueprintBeams[idx];
    const removedBeam = this.serializeBeam(target);
    this.blueprintBeams.splice(idx, 1);

    // Track nodes that become orphans so Undo can restore them cleanly
    const used = new Set<string>();
    for (const b of this.blueprintBeams) {
      used.add(b.nodeAId);
      used.add(b.nodeBId);
    }
    const removedNodes: SerializedNode[] = [];
    for (const [id, n] of this.blueprintNodes) {
      if (!n.fixed && !used.has(id)) {
        removedNodes.push(this.serializeNode(n));
        this.blueprintNodes.delete(id);
      }
    }

    if (broadcast) {
      this.pushAction({
        addedBeams: [],
        addedNodes: [],
        removedBeams: [removedBeam],
        removedNodes,
      });
    }

    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.persistSaveData();
    this.broadcastMyDuelStatus();
    this.updateHud();
    monkeyAudio.play('slap', 0.14);

    if (broadcast && this.isCoopSynced()) {
      this.net.send({ kind: 'remove_beam', beamId });
    }
  }

  private findNearbyNodeId(x: number, y: number, radius = 8): string | null {
    let bestId: string | null = null;
    let bestDist = radius;
    for (const n of this.blueprintNodes.values()) {
      const d = Math.hypot(n.homeX - x, n.homeY - y);
      if (d < bestDist) {
        bestDist = d;
        bestId = n.id;
      }
    }
    return bestId;
  }

  private resolveIncomingNode(sn: SerializedNode): BridgeNode {
    if (this.blueprintNodes.has(sn.id)) {
      return this.blueprintNodes.get(sn.id)!;
    }
    const aliasedId = this.remoteNodeAliases.get(sn.id);
    if (aliasedId && this.blueprintNodes.has(aliasedId)) {
      return this.blueprintNodes.get(aliasedId)!;
    }
    // Weld onto any existing node within 8px so concurrent builders don't split joints!
    const nearbyId = this.findNearbyNodeId(sn.x, sn.y, 8.5);
    if (nearbyId) {
      this.remoteNodeAliases.set(sn.id, nearbyId);
      return this.blueprintNodes.get(nearbyId)!;
    }

    const node: BridgeNode = {
      id: sn.id,
      x: sn.x,
      y: sn.y,
      oldX: sn.x,
      oldY: sn.y,
      homeX: sn.x,
      homeY: sn.y,
      fixed: sn.fixed,
      mass: 1,
      authorId: sn.authorId,
      authorName: sn.authorName,
      authorColor: sn.authorColor,
    };
    this.blueprintNodes.set(sn.id, node);
    return node;
  }

  private broadcastFullSync(): void {
    if (!this.net.isConnected()) return;
    const snap = this.gameMode === 'coop' ? this.serializeBlueprint() : { nodes: [], beams: [] };
    this.net.send({
      kind: 'sync_state',
      gameMode: this.gameMode,
      levelIndex: this.levelIndex,
      simRunning: this.gameMode === 'coop' && this.mode === 'sim',
      slowMo: this.slowMo,
      nodes: snap.nodes,
      beams: snap.beams,
      totalScore: this.getTotalScore(),
      savedMonkeys: this.savedMonkeys,
      drownedMonkeys: this.drownedMonkeys,
      completedLevels: Array.from(this.completedLevels),
      duelRoster: Array.from(this.duelStatuses.values()),
    });
    if (this.gameMode === 'versus') {
      this.broadcastMyDuelStatus(true);
    }
  }

  private setGameMode(nextMode: MultiplayerMode, broadcast = true): void {
    if (this.gameMode === nextMode) return;
    this.stopSpectating(false);
    this.gameMode = nextMode;
    this.myDuelState = 'building';
    this.myDuelStressPct = 0;
    this.duelStatuses.clear();

    if (this.mode === 'sim') {
      this.enterBuildMode(false);
    }

    if (nextMode === 'versus') {
      this.net.hud.toast('⚔️ Modo Duelo de Orçamento! Quem gastar menos vence!', 'banana');
      this.broadcastMyDuelStatus(true);
    } else {
      this.net.hud.toast('🤝 Modo Co-op na Mesma Ponte ativado!', 'info');
      if (this.net.isConnected() && this.net.room.localPlayer.isHost) {
        this.broadcastFullSync();
      }
    }

    if (broadcast && this.net.isConnected()) {
      this.net.send({ kind: 'set_mode', gameMode: nextMode });
    }
    this.updateHud();
    this.renderDuelPanel();
  }

  private syncDuelRosterFromPlayers(players: PlayerProfile[]): void {
    const activeIds = new Set(players.map((p) => p.id));
    for (const id of Array.from(this.duelStatuses.keys())) {
      if (!activeIds.has(id)) {
        this.duelStatuses.delete(id);
      }
    }
    if (this.gameMode === 'versus') {
      this.broadcastMyDuelStatus();
    }
    this.renderDuelPanel();
  }

  private broadcastMyDuelStatus(includeSnapshot = false): void {
    if (this.gameMode !== 'versus' || this.spectatingPeerId) return;
    const me = this.net.room.localPlayer;
    const level = LEVELS[this.levelIndex];
    const status: DuelPlayerStatus = {
      peerId: me.id,
      name: me.name,
      color: me.color,
      spent: this.getSpentBudget(),
      budget: level.budget,
      state: this.myDuelState,
      maxStressPct: this.myDuelStressPct,
      updatedAt: Date.now(),
      snapshot: includeSnapshot ? this.serializeBlueprint() : this.duelStatuses.get(me.id)?.snapshot,
    };
    this.duelStatuses.set(me.id, status);
    this.renderDuelPanel();

    if (this.net.isConnected()) {
      this.net.send({
        kind: 'duel_status',
        levelIndex: this.levelIndex,
        status,
      });
    }
  }

  private startSpectating(peerId: string): void {
    const target = this.duelStatuses.get(peerId);
    if (!target?.snapshot) return;
    if (!this.spectatingPeerId) {
      this.ownBackupBeforeSpy = this.serializeBlueprint();
    }
    this.spectatingPeerId = peerId;
    this.mode = 'build';
    this.applySerializedBlueprint(target.snapshot, true);
    this.updateHud();
    this.renderDuelPanel();
  }

  private stopSpectating(restore = true): void {
    if (!this.spectatingPeerId) return;
    this.spectatingPeerId = null;
    if (restore && this.ownBackupBeforeSpy) {
      this.applySerializedBlueprint(this.ownBackupBeforeSpy, true);
    }
    this.ownBackupBeforeSpy = null;
    this.updateHud();
    this.renderDuelPanel();
  }

  private renderDuelPanel(): void {
    const show = this.gameMode === 'versus';
    this.duelPanel.classList.toggle('open', show);
    if (!show) return;

    this.btnStopSpy.style.display = this.spectatingPeerId ? 'inline-flex' : 'none';

    const list = Array.from(this.duelStatuses.values());
    list.sort((a, b) => {
      const aPass = a.state === 'passed' ? 0 : 1;
      const bPass = b.state === 'passed' ? 0 : 1;
      if (aPass !== bPass) return aPass - bPass;
      if (aPass === 0) {
        if (a.spent !== b.spent) return a.spent - b.spent;
        return a.maxStressPct - b.maxStressPct;
      }
      return a.spent - b.spent;
    });

    const leaderId = list.find((item) => item.state === 'passed')?.peerId ?? null;
    this.duelListEl.innerHTML = '';

    for (const item of list) {
      const row = document.createElement('div');
      row.className = `duel-row${item.peerId === leaderId ? ' leader' : ''}`;

      const left = document.createElement('span');
      left.className = 'duel-name';
      left.style.color = item.color;
      left.textContent = `${item.peerId === leaderId ? '👑 ' : ''}${item.name}`;

      const right = document.createElement('span');
      right.className = 'duel-meta';
      const icon =
        item.state === 'passed'
          ? '✅'
          : item.state === 'testing'
            ? '🚀'
            : item.state === 'failed'
              ? '💥'
              : '🔨';
      const stressPart = item.state === 'passed' ? ` (${item.maxStressPct}%)` : '';
      right.textContent = `${icon} ${item.spent}🍌${stressPart}`;

      if (item.peerId !== this.net.room.localPlayer.id && item.snapshot) {
        const spyBtn = document.createElement('button');
        spyBtn.className = 'duel-spy-btn';
        spyBtn.textContent = '👁️';
        spyBtn.title = `Espiar ponte de ${item.name}`;
        spyBtn.onclick = () => this.startSpectating(item.peerId);
        right.appendChild(spyBtn);
      }

      row.appendChild(left);
      row.appendChild(right);
      this.duelListEl.appendChild(row);
    }
  }

  private sendReaction(text: string): void {
    const now = performance.now();
    if (now - this.lastReactionAt < 650) return;
    this.lastReactionAt = now;

    const me = this.net.room.localPlayer;
    this.showReactionOnCanvas(text, me.color || '#fde047', me.name);

    if (this.net.isConnected()) {
      this.net.send({
        kind: 'reaction',
        text,
        color: me.color || '#fde047',
        senderName: me.name,
      });
    }
  }

  private showReactionOnCanvas(text: string, color: string, senderName: string): void {
    const x = 320 + Math.random() * 560;
    const y = 175 + Math.random() * 55;
    const label = this.net.isConnected() ? `${senderName}: ${text}` : text;
    this.world.spawnFloatingText(x, y, label, color, 17);
    if (text.includes('CAIR') || text.includes('ALMOÇOU')) {
      monkeyAudio.play('screech', 0.22);
    } else {
      monkeyAudio.play('banana', 0.22);
    }
  }

  private handleRemoteMessage(
    msg: BridgeNetMessage,
    senderId: string,
    senderName: string,
  ): void {
    switch (msg.kind) {
      case 'add_beam': {
        if (this.gameMode !== 'coop') return;
        if (this.mode === 'sim') this.enterBuildMode(false);
        const nA = this.resolveIncomingNode(msg.nodeA);
        const nB = this.resolveIncomingNode(msg.nodeB);
        if (
          !this.blueprintBeams.some((b) => b.id === msg.beam.id) &&
          nA.id !== nB.id &&
          !this.hasBeamBetween(nA.id, nB.id)
        ) {
          this.blueprintBeams.push({
            id: msg.beam.id,
            nodeAId: nA.id,
            nodeBId: nB.id,
            material: msg.beam.material,
            restLength: Math.hypot(nB.homeX - nA.homeX, nB.homeY - nA.homeY),
            cost: msg.beam.cost,
            stress: 0,
            signedStress: 0,
            broken: false,
            springSquish: 0,
            authorId: msg.beam.authorId ?? senderId,
            authorName: msg.beam.authorName ?? senderName,
            authorColor: msg.beam.authorColor,
          });
          this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
          this.updateHud();
        }
        break;
      }
      case 'remove_beam': {
        if (this.gameMode !== 'coop') return;
        if (this.mode === 'sim') this.enterBuildMode(false);
        this.removeBeamById(msg.beamId, false);
        break;
      }
      case 'clear_bridge': {
        if (this.gameMode !== 'coop') return;
        if (this.mode === 'sim') this.enterBuildMode(false);
        this.clearBridge(false);
        this.net.hud.toast(`${senderName} limpou a ponte!`, 'info');
        break;
      }
      case 'start_sim': {
        if (this.gameMode !== 'coop') return;
        this.net.hud.toast(`${senderName} soltou os macacos!`, 'banana');
        this.enterSimMode(false);
        break;
      }
      case 'stop_sim': {
        if (this.gameMode !== 'coop') return;
        this.enterBuildMode(false);
        break;
      }
      case 'set_level': {
        this.loadLevel(msg.levelIndex, false);
        this.net.hud.toast(`${senderName} mudou para Fase ${msg.levelIndex + 1}!`, 'info');
        break;
      }
      case 'set_slowmo': {
        if (this.gameMode !== 'coop') return;
        this.slowMo = msg.slowMo;
        this.updateHud();
        break;
      }
      case 'set_mode': {
        this.setGameMode(msg.gameMode, false);
        break;
      }
      case 'sim_result': {
        if (this.gameMode !== 'coop' || msg.levelIndex !== this.levelIndex) return;
        this.savedMonkeys = Math.max(this.savedMonkeys, msg.savedMonkeys);
        this.drownedMonkeys = Math.max(this.drownedMonkeys, msg.drownedMonkeys);
        if (msg.outcome === 'won' && this.world.outcome !== 'won') {
          this.world.outcome = 'won';
          this.handleVictory(true);
        } else if (msg.outcome === 'failed' && this.world.outcome !== 'failed') {
          this.world.outcome = 'failed';
          this.handleFail(msg.reason, true);
        }
        this.updateHud();
        break;
      }
      case 'duel_status': {
        if (msg.levelIndex !== this.levelIndex) return;
        this.duelStatuses.set(msg.status.peerId, msg.status);
        if (msg.status.state === 'passed') {
          this.net.hud.toast(
            `⚔️ ${msg.status.name} passou com ${msg.status.spent}🍌 (${msg.status.maxStressPct}% estresse)!`,
            'banana',
          );
        }
        this.renderDuelPanel();
        break;
      }
      case 'reaction': {
        this.showReactionOnCanvas(msg.text, msg.color, msg.senderName || senderName);
        break;
      }
      case 'sync_state': {
        this.gameMode = msg.gameMode;
        if (msg.levelIndex !== this.levelIndex) {
          this.loadLevel(msg.levelIndex, false);
        }
        this.slowMo = msg.slowMo;
        if (this.gameMode === 'coop') {
          this.applySerializedBlueprint({ nodes: msg.nodes, beams: msg.beams }, true);
          if (msg.simRunning && this.mode !== 'sim') {
            this.enterSimMode(false);
          }
        } else {
          for (const st of msg.duelRoster) {
            this.duelStatuses.set(st.peerId, st);
          }
          this.broadcastMyDuelStatus();
        }
        this.savedMonkeys = Math.max(this.savedMonkeys, msg.savedMonkeys);
        this.drownedMonkeys = Math.max(this.drownedMonkeys, msg.drownedMonkeys);
        for (const lvl of msg.completedLevels) this.completedLevels.add(lvl);
        this.updateHud();
        this.renderDuelPanel();
        break;
      }
    }
  }

  private computeSnap(worldPt: { x: number; y: number }): {
    x: number;
    y: number;
    nodeId: string | null;
  } {
    let bestNode: BridgeNode | null = null;
    let bestDist = 22;
    for (const n of this.blueprintNodes.values()) {
      const d = Math.hypot(n.homeX - worldPt.x, n.homeY - worldPt.y);
      if (d < bestDist) {
        bestDist = d;
        bestNode = n;
      }
    }
    if (bestNode) {
      return { x: bestNode.homeX, y: bestNode.homeY, nodeId: bestNode.id };
    }

    let sx = worldPt.x;
    let sy = worldPt.y;
    if (this.showGrid) {
      sx = Math.round(sx / GRID_SIZE) * GRID_SIZE;
      sy = Math.round(sy / GRID_SIZE) * GRID_SIZE;
    }

    const maxY = LEVELS[this.levelIndex].waterY - 20;
    sx = Math.max(GRID_SIZE, Math.min(WORLD_W - GRID_SIZE, sx));
    sy = Math.max(GRID_SIZE, Math.min(maxY, sy));
    return { x: sx, y: sy, nodeId: null };
  }

  private findBeamNear(x: number, y: number): string | null {
    let bestId: string | null = null;
    let bestDist = 15;
    for (const b of this.blueprintBeams) {
      const nA = this.blueprintNodes.get(b.nodeAId);
      const nB = this.blueprintNodes.get(b.nodeBId);
      if (!nA || !nB) continue;
      const abx = nB.homeX - nA.homeX;
      const aby = nB.homeY - nA.homeY;
      const lenSq = abx * abx + aby * aby;
      if (lenSq < 1) continue;
      const t = Math.max(0, Math.min(1, ((x - nA.homeX) * abx + (y - nA.homeY) * aby) / lenSq));
      const cx = nA.homeX + abx * t;
      const cy = nA.homeY + aby * t;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestDist) {
        bestDist = d;
        bestId = b.id;
      }
    }
    return bestId;
  }

  private bindUI(): void {
    for (const btn of this.matButtons) {
      btn.onclick = () => {
        const mat = btn.dataset.mat as ToolId;
        this.selectTool(mat);
      };
    }

    for (const btn of this.reactButtons) {
      btn.onclick = () => {
        const text = btn.dataset.react || '🍌 QUE GAMBIARRA!';
        this.sendReaction(text);
      };
    }

    this.btnModeCoop.onclick = () => this.setGameMode('coop', true);
    this.btnModeVersus.onclick = () => this.setGameMode('versus', true);
    this.btnStopSpy.onclick = () => this.stopSpectating(true);

    this.btnUndo.onclick = () => this.undo();
    this.btnRedo.onclick = () => this.redo();
    this.btnClear.onclick = () => this.requestClearBridge();
    this.btnMirror.onclick = () => this.mirrorBridge();
    this.btnAutoTri.onclick = () => {
      this.autoTri = !this.autoTri;
      this.updateHud();
      monkeyAudio.play('click', 0.14);
    };
    this.btnHintGhost.onclick = () => {
      this.showHint = !this.showHint;
      this.updateHud();
      monkeyAudio.play('click', 0.14);
    };
    this.btnGrid.onclick = () => {
      this.showGrid = !this.showGrid;
      this.updateHud();
      monkeyAudio.play('click', 0.14);
    };
    this.btnSlowmo.onclick = () => {
      this.slowMo = !this.slowMo;
      this.updateHud();
      if (this.isCoopSynced()) {
        this.net.send({ kind: 'set_slowmo', slowMo: this.slowMo });
      }
      monkeyAudio.play('click', 0.14);
    };
    this.btnSim.onclick = () => this.toggleSim();

    this.btnPrevStage.onclick = () => {
      const next = (this.levelIndex - 1 + LEVELS.length) % LEVELS.length;
      this.loadLevel(next, true);
      monkeyAudio.play('click', 0.16);
    };
    this.btnNextStage.onclick = () => {
      const next = (this.levelIndex + 1) % LEVELS.length;
      this.loadLevel(next, true);
      monkeyAudio.play('click', 0.16);
    };

    document.getElementById('btn-start-play')!.onclick = () => {
      this.welcomeCard.classList.remove('open');
      monkeyAudio.play('banana', 0.22);
    };
    document.getElementById('btn-vic-retry')!.onclick = () => this.enterBuildMode(true);
    document.getElementById('btn-vic-next')!.onclick = () => {
      const next = (this.levelIndex + 1) % LEVELS.length;
      this.loadLevel(next, true);
      monkeyAudio.play('click', 0.2);
    };
    document.getElementById('btn-fail-slow')!.onclick = () => {
      this.slowMo = true;
      if (this.isCoopSynced()) {
        this.net.send({ kind: 'set_slowmo', slowMo: true });
      }
      this.enterSimMode(true);
    };
    document.getElementById('btn-fail-fix')!.onclick = () => this.enterBuildMode(true);

    // Canvas Pointer Events
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.welcomeCard.classList.contains('open')) {
        this.welcomeCard.classList.remove('open');
      }
      const rect = this.canvas.getBoundingClientRect();
      const pt = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, this.viewport);
      this.hoverWorld = pt;
      this.snapPoint = this.computeSnap(pt);
      this.hoverBeamId = this.findBeamNear(pt.x, pt.y);

      if (this.mode !== 'build' || this.spectatingPeerId) return;

      if (e.button === 2 || this.tool === 'eraser') {
        this.isErasingDrag = true;
        this.dragStart = null;
        this.clickAnchorMode = false;
        if (this.hoverBeamId) this.removeBeamById(this.hoverBeamId, true);
        return;
      }

      this.pointerDownPos = { x: e.clientX, y: e.clientY };

      if (this.clickAnchorMode && this.dragStart) {
        this.tryBuildBeam(this.dragStart, this.snapPoint, this.tool as MaterialId);
        this.dragStart = null;
        this.clickAnchorMode = false;
        this.pointerDownPos = null;
        return;
      }

      this.dragStart = { ...this.snapPoint };
    });

    window.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const pt = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, this.viewport);
      this.hoverWorld = pt;
      this.snapPoint = this.computeSnap(pt);
      this.hoverBeamId = this.findBeamNear(pt.x, pt.y);

      this.net.sendCursor(pt.x, pt.y, this.tool, this.dragStart);

      if (this.mode === 'build' && !this.spectatingPeerId && this.isErasingDrag && this.hoverBeamId) {
        this.removeBeamById(this.hoverBeamId, true);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isErasingDrag) {
        this.isErasingDrag = false;
        return;
      }
      if (this.mode !== 'build' || this.spectatingPeerId || !this.dragStart || !this.pointerDownPos) {
        this.pointerDownPos = null;
        return;
      }

      const movePx = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      this.pointerDownPos = null;

      if (movePx >= 10 && this.snapPoint) {
        this.tryBuildBeam(this.dragStart, this.snapPoint, this.tool as MaterialId);
        this.dragStart = null;
        this.clickAnchorMode = false;
      } else {
        this.clickAnchorMode = true;
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.welcomeCard.classList.contains('open')) {
          this.welcomeCard.classList.remove('open');
          return;
        }
        if (this.spectatingPeerId) return;
        this.toggleSim();
        return;
      }
      if (e.key === '1') this.selectTool('road');
      else if (e.key === '2') this.selectTool('bamboo');
      else if (e.key === '3') this.selectTool('vine');
      else if (e.key === '4') this.selectTool('steel');
      else if (e.key === '5') this.selectTool('spring');
      else if (e.key.toLowerCase() === 'x') this.selectTool('eraser');
      else if (e.key.toLowerCase() === 'g') {
        this.showGrid = !this.showGrid;
        this.updateHud();
      } else if (e.key.toLowerCase() === 'h') {
        this.showHint = !this.showHint;
        this.updateHud();
      } else if (e.key.toLowerCase() === 't') {
        this.autoTri = !this.autoTri;
        this.updateHud();
      } else if (e.key.toLowerCase() === 'm') {
        this.mirrorBridge();
      } else if (e.key.toLowerCase() === 's' && !(e.ctrlKey || e.metaKey)) {
        this.slowMo = !this.slowMo;
        this.updateHud();
        if (this.isCoopSynced()) {
          this.net.send({ kind: 'set_slowmo', slowMo: this.slowMo });
        }
      } else if (e.key === 'Escape') {
        this.dragStart = null;
        this.clickAnchorMode = false;
        if (this.spectatingPeerId) this.stopSpectating(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'F1') {
        e.preventDefault();
        this.sendReaction('💥 VAI CAIR!');
      } else if (e.key === 'F2') {
        e.preventDefault();
        this.sendReaction('🏆 ENGENHEIRO DA NASA!');
      } else if (e.key === 'F3') {
        e.preventDefault();
        this.sendReaction('🐊 JACARÉ ALMOÇOU!');
      } else if (e.key === 'F4') {
        e.preventDefault();
        this.sendReaction('🍌 QUE GAMBIARRA!');
      }
    });
  }

  private selectTool(next: ToolId): void {
    this.tool = next;
    this.dragStart = null;
    this.clickAnchorMode = false;
    for (const btn of this.matButtons) {
      btn.classList.toggle('active', btn.dataset.mat === next);
    }
    monkeyAudio.play('click', 0.12);
  }

  private updateHud(): void {
    const level = LEVELS[this.levelIndex];
    const doneMark = this.completedLevels.has(this.levelIndex) ? ' ✅' : '';
    this.stageLabelEl.textContent = `Fase ${this.levelIndex + 1}/${LEVELS.length}: ${level.name}${doneMark}`;
    this.hintEl.textContent = level.hint;

    this.btnModeCoop.classList.toggle('active', this.gameMode === 'coop');
    this.btnModeVersus.classList.toggle('active', this.gameMode === 'versus');

    const spent = this.getSpentBudget();
    this.budgetEl.textContent = `${spent} / ${level.budget}`;
    this.budgetPillEl.classList.toggle('over', spent > level.budget);

    const stressPct =
      this.mode === 'sim'
        ? Math.min(100, Math.round(this.world.currentMaxStress * 100))
        : 0;
    const peakPct =
      this.mode === 'sim'
        ? Math.min(100, Math.round(this.world.peakStressEver * 100))
        : 0;
    this.stressEl.textContent =
      this.mode === 'sim' ? `${stressPct}% (máx ${peakPct}%)` : '0%';
    this.stressPillEl.classList.toggle('warn', stressPct >= 38 && stressPct < 70);
    this.stressPillEl.classList.toggle('hot', stressPct >= 70 && stressPct < 88);
    this.stressPillEl.classList.toggle('danger', stressPct >= 88 || this.world.hasBrokenBeam);

    this.savedEl.textContent = String(this.savedMonkeys);
    this.drownedEl.textContent = String(this.drownedMonkeys);
    this.scoreEl.textContent = String(this.getTotalScore());

    this.btnGrid.classList.toggle('toggled', this.showGrid);
    this.btnHintGhost.classList.toggle('toggled', this.showHint);
    this.btnAutoTri.classList.toggle('toggled-green', this.autoTri);
    this.btnSlowmo.classList.toggle('toggled', this.slowMo);

    const canEdit = this.mode === 'build' && !this.spectatingPeerId;
    this.btnUndo.disabled = !canEdit || this.undoStack.length === 0;
    this.btnRedo.disabled = !canEdit || this.redoStack.length === 0;
    this.btnClear.disabled = !canEdit || this.blueprintBeams.length === 0;
    this.btnMirror.disabled = !canEdit || this.blueprintBeams.length === 0;

    const confirmingClear = performance.now() < this.clearConfirmUntil;
    this.btnClear.textContent = confirmingClear ? '⚠️ Confirmar?' : '🗑️ Limpar';
    this.btnClear.classList.toggle('confirm-danger', confirmingClear);

    this.btnSim.disabled = Boolean(this.spectatingPeerId);
    if (this.mode === 'build') {
      this.btnSim.textContent = '🚀 SOLTAR OS MACACOS! (ESPAÇO)';
      this.btnSim.classList.remove('simulating');
    } else {
      this.btnSim.textContent = '🔧 VOLTAR À OBRA (ESPAÇO)';
      this.btnSim.classList.add('simulating');
    }
  }

  private resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = computeViewport(w, h);
  }

  private loop(now: number): void {
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.totalElapsed += rawDt;

    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - rawDt * 24);
    }

    if (!this.pausedByGuide) {
      if (this.mode === 'sim') {
        if (this.autoSlowMoTimer > 0) {
          this.autoSlowMoTimer = Math.max(0, this.autoSlowMoTimer - rawDt);
        }
        const timeScale =
          this.autoSlowMoTimer > 0 ? 0.28 : this.slowMo ? 0.35 : 1.0;
        const FIXED_DT = 1 / 60;
        this.simAccumulator += rawDt * timeScale;
        let steps = 0;
        while (this.simAccumulator >= FIXED_DT && steps < 4) {
          this.world.stepSimulation(FIXED_DT);
          this.simAccumulator -= FIXED_DT;
          steps++;
        }
        // Keep live stress HUD responsive during sim
        this.updateHud();
      } else {
        this.world.stepAmbient(rawDt);
      }
    }

    const triPlan =
      this.mode === 'build' && this.dragStart && this.snapPoint
        ? this.computeAutoTriSegments(this.dragStart, this.snapPoint)
        : null;

    const preview: BuildPreviewState = {
      mode: this.mode,
      showGrid: this.showGrid,
      showHint: this.showHint,
      autoTri: this.autoTri,
      autoSlowMoActive: this.autoSlowMoTimer > 0,
      isMultiplayer: this.net.isConnected() && this.gameMode === 'coop',
      spectatingName: this.spectatingPeerId
        ? this.duelStatuses.get(this.spectatingPeerId)?.name ?? 'Rival'
        : null,
      tool: this.tool,
      hoverWorld: this.hoverWorld,
      snapPoint: this.snapPoint,
      dragStart: this.dragStart,
      autoTriPreview: triPlan?.segs ?? [],
      hoverBeamId: this.hoverBeamId,
      budgetLeft: LEVELS[this.levelIndex].budget - this.getSpentBudget(),
      remoteCursors: this.remoteCursors,
    };

    this.viewport = renderBridgeWorld(
      this.ctx,
      window.innerWidth,
      window.innerHeight,
      this.world,
      preview,
      this.shakeAmount,
      this.totalElapsed,
    );

    requestAnimationFrame((t) => this.loop(t));
  }
}

new PolyBridgeGame();
