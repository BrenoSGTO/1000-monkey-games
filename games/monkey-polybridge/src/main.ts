import { monkeyAudio, reportGameScore } from '@monkey-slop/sdk';
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
  MaterialId,
  RemoteCursor,
  SerializedBeam,
  SerializedNode,
  ToolId,
} from './types';

interface BlueprintSnapshot {
  nodes: SerializedNode[];
  beams: SerializedBeam[];
}

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
  private savedEl = document.getElementById('hud-saved')!;
  private drownedEl = document.getElementById('hud-drowned')!;
  private scoreEl = document.getElementById('hud-score')!;
  private hintEl = document.getElementById('hud-hint')!;

  private btnPrevStage = document.getElementById('btn-prev-stage') as HTMLButtonElement;
  private btnNextStage = document.getElementById('btn-next-stage') as HTMLButtonElement;
  private btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  private btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  private btnGrid = document.getElementById('btn-grid') as HTMLButtonElement;
  private btnSlowmo = document.getElementById('btn-slowmo') as HTMLButtonElement;
  private btnSim = document.getElementById('btn-sim') as HTMLButtonElement;
  private matButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-btn'));

  private welcomeCard = document.getElementById('welcome-card')!;
  private victoryCard = document.getElementById('victory-card')!;
  private failCard = document.getElementById('fail-card')!;
  private vicStarsEl = document.getElementById('vic-stars')!;
  private vicQuoteEl = document.getElementById('vic-quote')!;
  private vicSavedBudgetEl = document.getElementById('vic-saved-budget')!;
  private vicPointsEl = document.getElementById('vic-points')!;
  private failTitleEl = document.getElementById('fail-title')!;
  private failDescEl = document.getElementById('fail-desc')!;

  // State
  private levelIndex = 0;
  private mode: 'build' | 'sim' = 'build';
  private showGrid = true;
  private slowMo = false;
  private tool: ToolId = 'road';

  private blueprintNodes = new Map<string, BridgeNode>();
  private blueprintBeams: BridgeBeam[] = [];
  private undoStack: BlueprintSnapshot[] = [];

  private savedMonkeys = 0;
  private drownedMonkeys = 0;
  private levelBestScores = new Map<number, number>();
  private completedLevels = new Set<number>();

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

  constructor() {
    this.net = new BridgeNetClient({
      onRemoteCursor: (cursor) => {
        this.remoteCursors.set(cursor.peerId, cursor);
      },
      onRemoteMessage: (msg, _senderId, senderName) => {
        this.handleRemoteMessage(msg, senderName);
      },
      onPlayerJoinedAsHost: () => {
        this.broadcastFullSync();
      },
    });

    this.bindUI();
    this.loadLevel(0, false);
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    requestAnimationFrame((t) => this.loop(t));
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

  private loadLevel(idx: number, broadcast = true): void {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, idx));
    const level = LEVELS[this.levelIndex];

    this.mode = 'build';
    this.dragStart = null;
    this.clickAnchorMode = false;
    this.undoStack = [];
    this.blueprintNodes.clear();
    this.blueprintBeams = [];

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
      onVictory: () => this.handleVictory(),
      onFail: (reason) => this.handleFail(reason),
    });

    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.hideResultCards();
    this.updateHud();

    if (broadcast) {
      this.net.send({ kind: 'set_level', levelIndex: this.levelIndex });
    }
  }

  private handleVictory(): void {
    monkeyAudio.play('fanfare', 0.32);
    const level = LEVELS[this.levelIndex];
    const spent = this.getSpentBudget();
    const saved = Math.max(0, level.budget - spent);
    const ratio = saved / Math.max(1, level.budget);
    const stars = ratio >= 0.3 ? '⭐⭐⭐' : ratio >= 0.12 ? '⭐⭐' : '⭐';

    const points = 500 + this.levelIndex * 250 + saved * 3;
    const prevBest = this.levelBestScores.get(this.levelIndex) ?? 0;
    if (points > prevBest) {
      this.levelBestScores.set(this.levelIndex, points);
    }
    this.completedLevels.add(this.levelIndex);

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
    this.vicPointsEl.textContent = `${points} pts`;

    const nextBtn = document.getElementById('btn-vic-next') as HTMLButtonElement;
    nextBtn.textContent =
      this.levelIndex < LEVELS.length - 1 ? '➡️ PRÓXIMA FASE' : '🏆 RECOMEÇAR TOUR';

    this.victoryCard.classList.add('open');
    this.failCard.classList.remove('open');
    this.updateHud();
  }

  private handleFail(reason: string): void {
    monkeyAudio.play('rage', 0.28);
    this.failTitleEl.textContent = '💥 A PONTE FOI DE BASE!';
    this.failDescEl.textContent = reason;
    this.failCard.classList.add('open');
    this.victoryCard.classList.remove('open');
  }

  private hideResultCards(): void {
    this.victoryCard.classList.remove('open');
    this.failCard.classList.remove('open');
  }

  private enterBuildMode(broadcast = true): void {
    this.mode = 'build';
    this.simAccumulator = 0;
    this.hideResultCards();
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
    if (broadcast) {
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
    this.hideResultCards();
    this.welcomeCard.classList.remove('open');
    this.world.startSimulation(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
    monkeyAudio.play('click', 0.22);

    if (broadcast) {
      this.net.send({ kind: 'start_sim' });
    }
  }

  private toggleSim(): void {
    if (this.mode === 'build') this.enterSimMode(true);
    else this.enterBuildMode(true);
  }

  private pushUndoSnapshot(): void {
    this.undoStack.push(this.serializeBlueprint());
    if (this.undoStack.length > 40) this.undoStack.shift();
  }

  private serializeBlueprint(): BlueprintSnapshot {
    const nodes: SerializedNode[] = [];
    for (const n of this.blueprintNodes.values()) {
      nodes.push({
        id: n.id,
        x: n.homeX,
        y: n.homeY,
        fixed: n.fixed,
        authorColor: n.authorColor,
      });
    }
    const beams: SerializedBeam[] = this.blueprintBeams.map((b) => ({
      id: b.id,
      nodeAId: b.nodeAId,
      nodeBId: b.nodeBId,
      material: b.material,
      cost: b.cost,
      authorColor: b.authorColor,
    }));
    return { nodes, beams };
  }

  private applySerializedBlueprint(snap: BlueprintSnapshot): void {
    this.blueprintNodes.clear();
    for (const sn of snap.nodes) {
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
        authorColor: sn.authorColor,
      });
    }
    this.blueprintBeams = snap.beams.map((sb) => {
      const nA = this.blueprintNodes.get(sb.nodeAId);
      const nB = this.blueprintNodes.get(sb.nodeBId);
      const restLength = nA && nB ? Math.hypot(nB.x - nA.x, nB.y - nA.y) : 80;
      return {
        id: sb.id,
        nodeAId: sb.nodeAId,
        nodeBId: sb.nodeBId,
        material: sb.material,
        restLength,
        cost: sb.cost,
        stress: 0,
        signedStress: 0,
        broken: false,
        springSquish: 0,
        authorColor: sb.authorColor,
      };
    });
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
  }

  private undo(): void {
    if (this.mode !== 'build' || this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.applySerializedBlueprint(prev);
    monkeyAudio.play('click', 0.16);
    this.broadcastFullSync();
  }

  private clearBridge(broadcast = true): void {
    if (this.mode !== 'build') {
      this.enterBuildMode(false);
    }
    if (this.blueprintBeams.length === 0) return;
    this.pushUndoSnapshot();
    this.blueprintBeams = [];
    this.pruneOrphanNodes();
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
    monkeyAudio.play('slap', 0.18);
    if (broadcast) {
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
      authorColor,
    };
    this.blueprintNodes.set(id, node);
    return node;
  }

  private tryBuildBeam(
    start: { x: number; y: number; nodeId: string | null },
    end: { x: number; y: number; nodeId: string | null },
    material: MaterialId,
  ): void {
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

    // Check duplicate connection before mutating
    const nAPreviewId = start.nodeId ?? this.findNearbyNodeId(start.x, start.y);
    const nBPreviewId = end.nodeId ?? this.findNearbyNodeId(end.x, end.y);
    if (nAPreviewId && nBPreviewId) {
      if (nAPreviewId === nBPreviewId) return;
      const exists = this.blueprintBeams.some(
        (b) =>
          (b.nodeAId === nAPreviewId && b.nodeBId === nBPreviewId) ||
          (b.nodeAId === nBPreviewId && b.nodeBId === nAPreviewId),
      );
      if (exists) return;
    }

    this.pushUndoSnapshot();
    const color = this.net.isConnected() ? this.net.room.localPlayer.color : undefined;
    const nodeA = this.findOrCreateNode(start.x, start.y, start.nodeId, color);
    const nodeB = this.findOrCreateNode(end.x, end.y, end.nodeId, color);

    const beam: BridgeBeam = {
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
      authorColor: color,
    };

    this.blueprintBeams.push(beam);
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
    monkeyAudio.play('click', 0.2);

    this.net.send({
      kind: 'add_beam',
      beam: {
        id: beam.id,
        nodeAId: beam.nodeAId,
        nodeBId: beam.nodeBId,
        material: beam.material,
        cost: beam.cost,
        authorColor: beam.authorColor,
      },
      nodeA: {
        id: nodeA.id,
        x: nodeA.homeX,
        y: nodeA.homeY,
        fixed: nodeA.fixed,
        authorColor: nodeA.authorColor,
      },
      nodeB: {
        id: nodeB.id,
        x: nodeB.homeX,
        y: nodeB.homeY,
        fixed: nodeB.fixed,
        authorColor: nodeB.authorColor,
      },
    });
  }

  private removeBeamById(beamId: string, broadcast = true): void {
    const idx = this.blueprintBeams.findIndex((b) => b.id === beamId);
    if (idx === -1) return;
    if (broadcast) this.pushUndoSnapshot();
    this.blueprintBeams.splice(idx, 1);
    this.pruneOrphanNodes();
    this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
    this.updateHud();
    monkeyAudio.play('slap', 0.14);
    if (broadcast) {
      this.net.send({ kind: 'remove_beam', beamId });
    }
  }

  private findNearbyNodeId(x: number, y: number): string | null {
    for (const n of this.blueprintNodes.values()) {
      if (Math.hypot(n.homeX - x, n.homeY - y) < 8) return n.id;
    }
    return null;
  }

  private broadcastFullSync(): void {
    if (!this.net.isConnected()) return;
    const snap = this.serializeBlueprint();
    this.net.send({
      kind: 'sync_state',
      levelIndex: this.levelIndex,
      nodes: snap.nodes,
      beams: snap.beams,
      totalScore: this.getTotalScore(),
      savedMonkeys: this.savedMonkeys,
      drownedMonkeys: this.drownedMonkeys,
      completedLevels: Array.from(this.completedLevels),
    });
  }

  private handleRemoteMessage(msg: BridgeNetMessage, senderName: string): void {
    switch (msg.kind) {
      case 'add_beam': {
        if (this.mode === 'sim') this.enterBuildMode(false);
        for (const sn of [msg.nodeA, msg.nodeB]) {
          if (!this.blueprintNodes.has(sn.id)) {
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
              authorColor: sn.authorColor,
            });
          }
        }
        if (!this.blueprintBeams.some((b) => b.id === msg.beam.id)) {
          const nA = this.blueprintNodes.get(msg.beam.nodeAId)!;
          const nB = this.blueprintNodes.get(msg.beam.nodeBId)!;
          this.blueprintBeams.push({
            id: msg.beam.id,
            nodeAId: msg.beam.nodeAId,
            nodeBId: msg.beam.nodeBId,
            material: msg.beam.material,
            restLength: Math.hypot(nB.homeX - nA.homeX, nB.homeY - nA.homeY),
            cost: msg.beam.cost,
            stress: 0,
            signedStress: 0,
            broken: false,
            springSquish: 0,
            authorColor: msg.beam.authorColor,
          });
          this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
          this.updateHud();
        }
        break;
      }
      case 'remove_beam': {
        if (this.mode === 'sim') this.enterBuildMode(false);
        this.removeBeamById(msg.beamId, false);
        break;
      }
      case 'clear_bridge': {
        if (this.mode === 'sim') this.enterBuildMode(false);
        this.blueprintBeams = [];
        this.pruneOrphanNodes();
        this.world.resetForBuild(this.blueprintNodes, this.blueprintBeams);
        this.updateHud();
        this.net.hud.toast(`${senderName} limpou a ponte!`, 'info');
        break;
      }
      case 'start_sim': {
        this.net.hud.toast(`${senderName} soltou os macacos!`, 'banana');
        this.enterSimMode(false);
        break;
      }
      case 'stop_sim': {
        this.enterBuildMode(false);
        break;
      }
      case 'set_level': {
        this.loadLevel(msg.levelIndex, false);
        this.net.hud.toast(`${senderName} mudou para Fase ${msg.levelIndex + 1}!`, 'info');
        break;
      }
      case 'set_slowmo': {
        this.slowMo = msg.slowMo;
        this.updateHud();
        break;
      }
      case 'sync_state': {
        if (msg.levelIndex !== this.levelIndex) {
          this.loadLevel(msg.levelIndex, false);
        }
        this.applySerializedBlueprint({ nodes: msg.nodes, beams: msg.beams });
        this.savedMonkeys = Math.max(this.savedMonkeys, msg.savedMonkeys);
        this.drownedMonkeys = Math.max(this.drownedMonkeys, msg.drownedMonkeys);
        for (const lvl of msg.completedLevels) this.completedLevels.add(lvl);
        this.updateHud();
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
    let bestDist = 20;
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
    // Material buttons
    for (const btn of this.matButtons) {
      btn.onclick = () => {
        const mat = btn.dataset.mat as ToolId;
        this.selectTool(mat);
      };
    }

    // Action buttons
    this.btnUndo.onclick = () => this.undo();
    this.btnClear.onclick = () => this.clearBridge(true);
    this.btnGrid.onclick = () => {
      this.showGrid = !this.showGrid;
      this.updateHud();
      monkeyAudio.play('click', 0.14);
    };
    this.btnSlowmo.onclick = () => {
      this.slowMo = !this.slowMo;
      this.updateHud();
      this.net.send({ kind: 'set_slowmo', slowMo: this.slowMo });
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

      if (this.mode !== 'build') return;

      // Right-click or Eraser deletes beam
      if (e.button === 2 || this.tool === 'eraser') {
        this.isErasingDrag = true;
        this.dragStart = null;
        this.clickAnchorMode = false;
        if (this.hoverBeamId) this.removeBeamById(this.hoverBeamId, true);
        return;
      }

      this.pointerDownPos = { x: e.clientX, y: e.clientY };

      if (this.clickAnchorMode && this.dragStart) {
        // Completing a click-to-click beam!
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

      this.net.sendCursor(pt.x, pt.y, this.tool);

      if (this.mode === 'build' && this.isErasingDrag && this.hoverBeamId) {
        this.removeBeamById(this.hoverBeamId, true);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isErasingDrag) {
        this.isErasingDrag = false;
        return;
      }
      if (this.mode !== 'build' || !this.dragStart || !this.pointerDownPos) {
        this.pointerDownPos = null;
        return;
      }

      const movePx = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      this.pointerDownPos = null;

      if (movePx >= 10 && this.snapPoint) {
        // Drag-to-build release
        this.tryBuildBeam(this.dragStart, this.snapPoint, this.tool as MaterialId);
        this.dragStart = null;
        this.clickAnchorMode = false;
      } else {
        // Short click: keep anchor active for click-to-click building!
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
      } else if (e.key.toLowerCase() === 's') {
        this.slowMo = !this.slowMo;
        this.updateHud();
        this.net.send({ kind: 'set_slowmo', slowMo: this.slowMo });
      } else if (e.key === 'Escape') {
        this.dragStart = null;
        this.clickAnchorMode = false;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
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

    const spent = this.getSpentBudget();
    this.budgetEl.textContent = `${spent} / ${level.budget}`;
    this.budgetPillEl.classList.toggle('over', spent > level.budget);

    this.savedEl.textContent = String(this.savedMonkeys);
    this.drownedEl.textContent = String(this.drownedMonkeys);
    this.scoreEl.textContent = String(this.getTotalScore());

    this.btnGrid.classList.toggle('toggled', this.showGrid);
    this.btnSlowmo.classList.toggle('toggled', this.slowMo);
    this.btnUndo.disabled = this.mode !== 'build' || this.undoStack.length === 0;
    this.btnClear.disabled = this.mode !== 'build' || this.blueprintBeams.length === 0;

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

    if (this.mode === 'sim') {
      const timeScale = this.slowMo ? 0.35 : 1.0;
      const FIXED_DT = 1 / 60;
      this.simAccumulator += rawDt * timeScale;
      let steps = 0;
      while (this.simAccumulator >= FIXED_DT && steps < 4) {
        this.world.stepSimulation(FIXED_DT);
        this.simAccumulator -= FIXED_DT;
        steps++;
      }
    } else {
      this.world.stepAmbient(rawDt);
    }

    const preview: BuildPreviewState = {
      mode: this.mode,
      showGrid: this.showGrid,
      tool: this.tool,
      hoverWorld: this.hoverWorld,
      snapPoint: this.snapPoint,
      dragStart: this.dragStart,
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
